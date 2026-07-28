/**
 * The simulation core.
 *
 * Owns the run, the floors, the current room and every entity in it. Contains
 * no reference to `window`, `document`, `localStorage`, audio or canvas: side
 * effects leave through `this.events` and come back as an InputSnapshot. That
 * is what makes the same code runnable in a browser, in Electron/Tauri, or
 * head-less inside the test harness.
 */
import {
  TILE,
  ROOM_W,
  ROOM_H,
  T,
  TEAM,
  DIR,
  DIR_OPPOSITE,
  ROOM_KIND,
  HEART_HP,
} from './constants.js';
import { Rng } from './rng.js';
import { EventBus } from './events.js';
import { generateFloor } from './world/floorgen.js';
import { DOOR_TILE } from './world/roomgen.js';
import { ShotPool } from './entities/projectile.js';
import { createEnemy, updateEnemy } from './entities/enemy.js';
import { createPlayer, updatePlayer } from './entities/player.js';
import { updateShots, updateEffects } from './combat.js';
import {
  addItem,
  setActive,
  recomputeStats,
  runHook,
  chargeActive,
  hasItem,
} from './items/inventory.js';
import { cloneShot as cloneShotImpl } from './items/shots.js';
import { circleBlocked, findFreeSpot, tileAtWorld, hasLineOfSight } from './world/collision.js';
import { FLOORS, getFloor, FLOOR_COUNT } from '../data/floors.js';
import { ITEMS, ITEM_IDS, ACTIVES, ACTIVE_IDS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { createBoss, updateBoss } from './bosses/index.js';
import { clamp, dist } from './math.js';

const ROOM_PX_W = ROOM_W * TILE;
const ROOM_PX_H = ROOM_H * TILE;

export const STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  TRANSITION: 'transition',
  ITEM_GET: 'itemGet',
  PAUSED: 'paused',
  DEAD: 'dead',
  WIN: 'win',
};

export class Game {
  constructor(opts = {}) {
    this.events = opts.events || new EventBus();
    this.rng = new Rng(opts.seed || 12345);
    this.seed = this.rng.seed;

    this.state = STATE.TITLE;
    this.roomPxW = ROOM_PX_W;
    this.roomPxH = ROOM_PX_H;

    this.shots = new ShotPool(opts.shotCap || 420);
    this.enemies = [];
    this.pickups = [];
    this.props = [];
    this.effects = [];
    this.allies = [];

    this.player = createPlayer(ROOM_PX_W / 2, ROOM_PX_H / 2);
    this.floor = null;
    this.floorIndex = 1;
    this.room = null;
    this.roomVisitId = 0;
    this.roomLocked = false;

    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.timeScaleTimer = 0;
    this.enemyFireScale = 1;
    this.enemyShotSpeedScale = 1;

    this.shakeMag = 0;
    this.shakeT = 0;
    this.hitStop = 0;

    this.transition = null;
    this.pendingItem = null;
    this.messages = [];
    this.packToken = { holder: null, t: 0 };

    this.stats = {
      kills: 0,
      damageTaken: 0,
      itemsTaken: 0,
      roomsCleared: 0,
      time: 0,
      floorReached: 1,
      bossesKilled: 0,
    };

    this.seenItems = new Set();
    this.boss = null;
    this.paused = false;
    this.debug = false;
  }

  // ------------------------------------------------------------ lifecycle

  startRun(seed) {
    this.rng = new Rng(seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed);
    this.seed = this.rng.seed;
    this.state = STATE.PLAYING;

    this.shots.clear();
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.props.length = 0;
    this.effects.length = 0;
    this.allies.length = 0;
    this.messages.length = 0;
    this.seenItems.clear();
    this.boss = null;
    this.pendingItem = null;
    this.transition = null;
    this.timeScale = 1;
    this.timeScaleTarget = 1;

    this.player = createPlayer(ROOM_PX_W / 2, ROOM_PX_H / 2);
    recomputeStats(this, this.player);
    this.player.hp = this.player.stats.maxHp;
    setActive(this.player, this.rng.pick(ACTIVE_IDS));
    recomputeStats(this, this.player);

    this.stats = {
      kills: 0,
      damageTaken: 0,
      itemsTaken: 0,
      roomsCleared: 0,
      time: 0,
      floorReached: 1,
      bossesKilled: 0,
    };

    this.floorIndex = 0;
    this.nextFloor();
    this.events.emit('runStart', { seed: this.seed });
  }

  nextFloor() {
    this.floorIndex++;
    if (this.floorIndex > FLOOR_COUNT) {
      this.win();
      return;
    }
    const def = getFloor(this.floorIndex);
    this.floor = generateFloor(this.rng.fork(`floor${this.floorIndex}`), def);
    this.stats.floorReached = Math.max(this.stats.floorReached, this.floorIndex);

    this.enemies.length = 0;
    this.shots.clear();
    this.effects.length = 0;
    this.pickups.length = 0;
    this.props.length = 0;
    this.allies.length = 0;
    this.boss = null;

    if (this.player.flags.reviveRefresh) this.player.reviveUsed = false;
    this.enemyFireScale = 1;

    const start = this.floor.rooms[this.floor.startRoom];
    this.enterRoom(start, null, true);
    if (this.player.flags.fullMap) this.revealMap();

    runHook(this.player, 'onFloorStart', { game: this, player: this.player });
    this.events.emit('floorStart', { index: this.floorIndex, def });
    this.message(`${def.name}`, def.subtitle, 2.6);
  }

  revealMap() {
    for (const r of this.floor.rooms) r.mapped = true;
  }

  win() {
    this.state = STATE.WIN;
    this.events.emit('win', { stats: this.stats });
  }

  // ---------------------------------------------------------------- rooms

  enterRoom(room, fromDir, instant = false) {
    this.room = room;
    this.roomVisitId++;
    room.visited = true;
    room.mapped = true;
    for (let d = 0; d < 4; d++) {
      const id = room.doors[d];
      if (id != null && !room.secretSide[d]) this.floor.rooms[id].mapped = true;
    }

    this.shots.clear();
    this.effects.length = 0;
    this.enemies.length = 0;
    this.boss = null;

    // Place the player just inside the door they came through.
    if (fromDir != null) {
      const t = DOOR_TILE[fromDir];
      const inX = fromDir === 1 ? -1.4 : fromDir === 3 ? 1.4 : 0;
      const inY = fromDir === 0 ? 1.4 : fromDir === 2 ? -1.4 : 0;
      this.player.x = (t.x + 0.5 + inX) * TILE;
      this.player.y = (t.y + 0.5 + inY) * TILE;
    } else if (instant) {
      this.player.x = ROOM_PX_W / 2;
      this.player.y = ROOM_PX_H / 2 + TILE;
    }
    this.player.px = this.player.x;
    this.player.py = this.player.y;
    this.player.vx = this.player.vy = 0;
    this.player.wardUsed = false;

    this.populateRoom(room);
    this.roomLocked = this.enemies.length > 0;

    runHook(this.player, 'onRoomEnter', { game: this, player: this.player, room });
    this.events.emit('roomEnter', { room, locked: this.roomLocked });
  }

  populateRoom(room) {
    this.pickups.length = 0;
    this.props.length = 0;

    if (room.kind === ROOM_KIND.BOSS && !room.cleared) {
      this.spawnBossRoom(room);
      return;
    }
    if (room.populated) {
      // Restore anything the room is still holding (dropped items, stairs).
      for (const p of room.props || []) this.props.push(p);
      for (const p of room.pickupsLeft || []) this.pickups.push(p);
      if (!room.cleared && room.enemySpec) this.spawnFromSpec(room);
      return;
    }
    room.populated = true;
    room.props = [];
    room.pickupsLeft = [];

    switch (room.kind) {
      case ROOM_KIND.START:
        room.cleared = true;
        break;
      case ROOM_KIND.TREASURE:
        this.addProp(room, {
          type: 'pedestal',
          x: ROOM_PX_W / 2,
          y: ROOM_PX_H / 2,
          itemId: this.pickItem('treasure'),
        });
        room.cleared = true;
        break;
      case ROOM_KIND.SHOP:
        this.buildShop(room);
        room.cleared = true;
        break;
      case ROOM_KIND.SECRET:
        this.addProp(room, {
          type: 'pedestal',
          x: ROOM_PX_W / 2,
          y: ROOM_PX_H / 2,
          itemId: this.pickItem('treasure'),
        });
        for (let i = 0; i < 4; i++) {
          this.dropPickup(
            ROOM_PX_W / 2 + this.rng.range(-70, 70),
            ROOM_PX_H / 2 + this.rng.range(-50, 50),
            this.rng.pick(['coin', 'coin', 'bomb', 'key', 'heart']),
          );
        }
        room.cleared = true;
        break;
      case ROOM_KIND.CHALLENGE:
        room.enemySpec = this.rollEnemySpec(room, 1.8);
        this.spawnFromSpec(room);
        this.addProp(room, {
          type: 'pedestalLocked',
          x: ROOM_PX_W / 2,
          y: ROOM_PX_H / 2 - TILE,
          itemId: this.pickItem('challenge'),
        });
        break;
      default:
        if (room.depth > 0) {
          room.enemySpec = this.rollEnemySpec(room, 1);
          this.spawnFromSpec(room);
        } else {
          room.cleared = true;
        }
    }
  }

  addProp(room, prop) {
    prop.id = (room.props.length + 1) * 97 + room.id;
    room.props.push(prop);
    this.props.push(prop);
    return prop;
  }

  buildShop(room) {
    const def = this.floor.def;
    const slots = 3;
    for (let i = 0; i < slots; i++) {
      const x = ROOM_PX_W / 2 + (i - 1) * TILE * 3;
      const y = ROOM_PX_H / 2;
      const roll = this.rng.next();
      let entry;
      if (roll < 0.5) {
        entry = { type: 'shopItem', kind: 'item', itemId: this.pickItem('shop'), price: this.rng.int(12, 20) };
      } else if (roll < 0.68) {
        entry = { type: 'shopItem', kind: 'heart', price: 5 };
      } else if (roll < 0.82) {
        entry = { type: 'shopItem', kind: 'bomb', price: 4 };
      } else {
        entry = { type: 'shopItem', kind: 'key', price: 4 };
      }
      entry.x = x;
      entry.y = y;
      this.addProp(room, entry);
    }
  }

  rollEnemySpec(room, mul = 1) {
    const def = this.floor.def;
    // Enough bodies that a room is a fight, scaled by how deep it sits in the
    // floor graph so the first rooms stay approachable.
    const budget = (2.4 + room.depth * 0.7) * def.difficulty * mul;
    const pool = def.enemies.map((id) => ({ id, weight: ENEMIES[id].weight || 1 }));
    const spec = [];
    let spent = 0;
    let guard = 0;
    while (spent < budget && guard++ < 40) {
      const pick = this.rng.weighted(pool);
      const cost = ENEMIES[pick.id].cost || 1;
      if (spent + cost > budget + 0.8) break;
      spent += cost;
      spec.push(pick.id);
    }
    if (!spec.length) spec.push(def.enemies[0]);
    if (this.rng.chance(def.eliteChance * mul) && def.elites && def.elites.length) {
      spec.push(this.rng.pick(def.elites));
    }
    return spec;
  }

  spawnFromSpec(room) {
    const spec = room.enemySpec || [];
    const cx = ROOM_PX_W / 2;
    const cy = ROOM_PX_H / 2;
    for (let i = 0; i < spec.length; i++) {
      const a = (i / spec.length) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const r = this.rng.range(60, 150);
      let x = clamp(cx + Math.cos(a) * r, TILE * 1.5, ROOM_PX_W - TILE * 1.5);
      let y = clamp(cy + Math.sin(a) * r * 0.7, TILE * 1.5, ROOM_PX_H - TILE * 1.5);
      const def = ENEMIES[spec[i]];
      const spot = findFreeSpot(room.tiles, x, y, def.radius, this.rng);
      const e = createEnemy(spec[i], spot.x, spot.y, {
        hpScale: 1 + (this.floorIndex - 1) * 0.08 + (this.player.flags.enemyHpMult || 0),
        phase: this.rng.angle(),
      });
      this.enemies.push(e);
    }
  }

  spawnBossRoom(room) {
    const def = this.floor.def;
    this.boss = createBoss(this, def.boss, ROOM_PX_W / 2, ROOM_PX_H / 2 - TILE);
    this.enemies.push(this.boss);
    this.roomLocked = true;
    this.events.emit('bossStart', { boss: this.boss, name: this.boss.name });
    this.sfx('bossRoar');
    this.message(this.boss.name, this.boss.title || '', 2.4);
  }

  // ------------------------------------------------------------ item pools

  pickItem(pool) {
    const candidates = ITEM_IDS.filter(
      (id) => ITEMS[id].pools.includes(pool) && !this.seenItems.has(id) && !hasItem(this.player.inv, id),
    );
    const list = candidates.length ? candidates : ITEM_IDS.filter((id) => ITEMS[id].pools.includes(pool));
    if (!list.length) return ITEM_IDS[0];
    const luck = this.player.stats ? this.player.stats.luck : 0;
    const id = this.rng.weighted(list, (i) => {
      const q = ITEMS[i].quality || 1;
      return Math.max(0.2, 1 + (q - 2) * (0.18 + luck * 0.05));
    });
    this.seenItems.add(id);
    return id;
  }

  grantItem(id) {
    const news = addItem(this, this.player, id);
    this.stats.itemsTaken++;
    this.pendingItem = { id, item: ITEMS[id], t: 0, synergies: news };
    this.state = STATE.ITEM_GET;
    this.sfx('item');
    if (news.length) {
      this.sfx('synergy');
      this.events.emit('synergy', { synergies: news });
    }
    this.events.emit('itemGet', { id, item: ITEMS[id], synergies: news });
  }

  // ---------------------------------------------------------------- step

  step(dt, input) {
    if (this.state === STATE.TITLE || this.state === STATE.PAUSED) return;

    if (this.state === STATE.ITEM_GET) {
      this.pendingItem.t += dt;
      if (this.pendingItem.t > 0.35 && (input.pressed.confirm || input.pressed.fire || input.pressed.cancel || input.pressed.pause)) {
        this.pendingItem = null;
        this.state = STATE.PLAYING;
      }
      this.updateShake(dt);
      return;
    }

    if (this.state === STATE.TRANSITION) {
      this.transition.t += dt;
      if (this.transition.t >= this.transition.duration) {
        const tr = this.transition;
        this.transition = null;
        this.state = STATE.PLAYING;
        this.enterRoom(this.floor.rooms[tr.toRoom], tr.fromDir);
      }
      this.updateShake(dt);
      return;
    }

    if (this.state !== STATE.PLAYING) {
      this.updateShake(dt);
      return;
    }

    this.stats.time += dt;

    // Hit-stop makes impacts land without slowing the whole sim.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.updateShake(dt);
      return;
    }

    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= dt;
      if (this.timeScaleTimer <= 0) this.timeScaleTarget = 1;
    }
    this.timeScale += (this.timeScaleTarget - this.timeScale) * Math.min(1, dt * 4);

    const sdt = dt * this.timeScale;

    for (const m of this.messages) m.t += dt;
    while (this.messages.length && this.messages[0].t > this.messages[0].time) this.messages.shift();

    if (!this.player.dead) updatePlayer(this, this.player, sdt, input);

    if (this.packToken.holder) {
      this.packToken.t -= sdt;
      if (this.packToken.t <= 0 || !this.packToken.holder.alive) this.packToken.holder = null;
    }

    // Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.dying -= dt;
        if (e.dying <= 0) this.enemies.splice(i, 1);
        continue;
      }
      if (e.isBoss) updateBoss(this, e, sdt);
      else updateEnemy(this, e, sdt);
      if (e.alive) this.enemyTouchPlayer(e, sdt);
    }

    this.updateAllies(sdt);
    updateShots(this, sdt);
    updateEffects(this, sdt);
    this.updatePickups(sdt);
    this.updateProps(sdt);
    this.updateDoors(sdt);
    this.updateShake(dt);

    if (this.roomLocked && !this.enemies.some((e) => e.alive)) this.clearRoom();
    if (this.player.hp <= 0 && !this.player.dead) this.killPlayer();
  }

  updateShake(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
  }

  clearRoom() {
    this.roomLocked = false;
    this.room.cleared = true;
    this.stats.roomsCleared++;
    this.sfx('roomClear');
    this.sfx('doorOpen', { gain: 0.5 });
    if (chargeActive(this.player, 1)) this.events.emit('activeReady', {});
    runHook(this.player, 'onRoomClear', { game: this, player: this.player, room: this.room });

    // Locked challenge reward unlocks on clear.
    for (const p of this.props) {
      if (p.type === 'pedestalLocked') p.type = 'pedestal';
    }

    if (this.room.kind === ROOM_KIND.BOSS) {
      this.stats.bossesKilled++;
      this.addProp(this.room, { type: 'stairs', x: ROOM_PX_W / 2, y: ROOM_PX_H / 2 + TILE * 1.5 });
      this.addProp(this.room, {
        type: 'pedestal',
        x: ROOM_PX_W / 2,
        y: ROOM_PX_H / 2 - TILE * 1.2,
        itemId: this.pickItem('boss'),
      });
      for (let i = 0; i < 4; i++) {
        this.dropPickup(ROOM_PX_W / 2 + this.rng.range(-80, 80), ROOM_PX_H / 2 + this.rng.range(-40, 40), 'coin');
      }
      this.dropPickup(ROOM_PX_W / 2 - 40, ROOM_PX_H / 2 + 40, 'heart');
      this.events.emit('bossDown', { floor: this.floorIndex });
    } else {
      this.rollRoomReward();
    }
    this.events.emit('roomClear', { room: this.room });
  }

  rollRoomReward() {
    const luck = this.player.stats.luck;
    const roll = this.rng.next() + luck * 0.02;
    const x = ROOM_PX_W / 2;
    const y = ROOM_PX_H / 2;
    if (roll > 0.86) this.dropPickup(x, y, 'heart');
    else if (roll > 0.7) this.dropPickup(x, y, 'coin');
    else if (roll > 0.62) this.dropPickup(x, y, 'bomb');
    else if (roll > 0.55) this.dropPickup(x, y, 'key');
  }

  // ---------------------------------------------------------------- doors

  updateDoors(dt) {
    if (this.roomLocked) return;
    const p = this.player;
    const margin = TILE * 0.55;
    for (let d = 0; d < 4; d++) {
      const targetId = this.room.doors[d];
      if (targetId == null) continue;
      const t = DOOR_TILE[d];
      const dx = (t.x + 0.5) * TILE;
      const dy = (t.y + 0.5) * TILE;
      if (Math.abs(p.x - dx) > margin + 10 || Math.abs(p.y - dy) > margin + 10) continue;

      if (this.room.secretSide[d] && !this.room.secretOpen) continue;

      if (this.room.locked[d]) {
        if (p.keys > 0 || p.flags.freeUnlock) {
          if (!p.flags.freeUnlock) p.keys--;
          this.room.locked[d] = false;
          const other = this.floor.rooms[targetId];
          other.locked[DIR_OPPOSITE[d]] = false;
          this.sfx('unlock');
        } else {
          this.sfx('doorLocked');
          // Push the player back out of the doorway.
          p.x -= DIR[d].x * 6;
          p.y -= DIR[d].y * 6;
          continue;
        }
      }

      this.startTransition(targetId, DIR_OPPOSITE[d], d);
      return;
    }
  }

  startTransition(toRoom, fromDir, dir) {
    this.state = STATE.TRANSITION;
    this.transition = {
      t: 0,
      duration: 0.26,
      fromRoom: this.room.id,
      toRoom,
      fromDir,
      dir,
    };
    this.shots.clear();
    this.events.emit('transition', this.transition);
  }

  teleportRandomRoom() {
    const options = this.floor.rooms.filter(
      (r) => r.id !== this.room.id && r.kind !== ROOM_KIND.BOSS && !r.hidden,
    );
    if (!options.length) return false;
    const target = this.rng.pick(options);
    this.enterRoom(target, null, true);
    this.player.x = ROOM_PX_W / 2;
    this.player.y = ROOM_PX_H / 2;
    this.fx('teleport', { x: this.player.x, y: this.player.y, color: '#b06bff' });
    this.sfx('teleport');
    return true;
  }

  // -------------------------------------------------------------- pickups

  dropPickup(x, y, kind) {
    const spot = findFreeSpot(this.room.tiles, x, y, 6, this.rng);
    const p = {
      kind,
      x: spot.x,
      y: spot.y,
      vx: this.rng.range(-30, 30),
      vy: this.rng.range(-30, 30),
      t: this.rng.angle(),
      picked: false,
    };
    this.pickups.push(p);
    return p;
  }

  updatePickups(dt) {
    const pl = this.player;
    const magnet = pl.flags.magnet || 26;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.02, dt);
      p.vy *= Math.pow(0.02, dt);
      if (circleBlocked(this.room.tiles, p.x, p.y, 5)) {
        p.x -= p.vx * dt;
        p.y -= p.vy * dt;
        p.vx = -p.vx * 0.4;
        p.vy = -p.vy * 0.4;
      }

      const d = dist(p.x, p.y, pl.x, pl.y);
      if (d < magnet) {
        const s = Math.min(260, 90 + (magnet - d) * 5);
        p.x += ((pl.x - p.x) / (d || 1)) * s * dt;
        p.y += ((pl.y - p.y) / (d || 1)) * s * dt;
      }
      if (d < pl.radius + 8) {
        this.collectPickup(p);
        this.pickups.splice(i, 1);
      }
    }
  }

  collectPickup(p) {
    const pl = this.player;
    switch (p.kind) {
      case 'coin':
        pl.coins += 1;
        this.sfx('coin');
        if (pl.flags.goldRush && this.rng.chance(0.1)) this.healPlayer(1);
        pl.statsDirty = true;
        break;
      case 'key':
        pl.keys += 1;
        this.sfx('pickup');
        break;
      case 'bomb':
        pl.bombs += 1;
        this.sfx('pickup');
        break;
      case 'heart':
        this.healPlayer(2);
        this.sfx('heart');
        break;
      case 'halfHeart':
        this.healPlayer(1);
        this.sfx('heart');
        break;
      case 'soul':
        pl.shield = Math.min(6, pl.shield + 2);
        this.sfx('heart', { rate: 1.3 });
        break;
      default:
        this.sfx('pickup');
    }
    this.fx('pickup', { x: p.x, y: p.y, kind: p.kind });
  }

  // ---------------------------------------------------------------- props

  updateProps(dt) {
    const pl = this.player;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i];
      prop.t = (prop.t || 0) + dt;
      const d = dist(prop.x, prop.y, pl.x, pl.y);
      prop.near = d < 34;

      if (!prop.near) continue;

      if (prop.type === 'pedestal' && d < 18 && !prop.taken) {
        prop.taken = true;
        this.props.splice(i, 1);
        const idx = this.room.props.indexOf(prop);
        if (idx >= 0) this.room.props.splice(idx, 1);
        this.grantItem(prop.itemId);
      } else if (prop.type === 'stairs' && d < 20) {
        this.sfx('stairs');
        this.events.emit('descend', { from: this.floorIndex });
        this.nextFloor();
        return;
      } else if (prop.type === 'shopItem' && d < 20 && !prop.bought) {
        this.tryBuy(prop, i);
      }
    }
  }

  tryBuy(prop, index) {
    const pl = this.player;
    const discount = pl.flags.discount || 0;
    const price = Math.max(1, Math.round(prop.price * (1 - discount)));
    if (pl.coins >= price) {
      pl.coins -= price;
      prop.bought = true;
      this.props.splice(index, 1);
      const ri = this.room.props.indexOf(prop);
      if (ri >= 0) this.room.props.splice(ri, 1);
      this.applyShopPurchase(prop);
    } else if (pl.flags.bloodPayment && pl.hp > 2) {
      this.damagePlayer(2, { source: 'blood', ignoreArmor: true, ignoreInvuln: true });
      prop.bought = true;
      this.props.splice(index, 1);
      const ri = this.room.props.indexOf(prop);
      if (ri >= 0) this.room.props.splice(ri, 1);
      this.applyShopPurchase(prop);
    } else {
      if (!prop.denyT || prop.t - prop.denyT > 0.8) {
        prop.denyT = prop.t;
        this.sfx('deny');
        this.message('Не хватает монет', '', 1.2);
      }
      const a = Math.atan2(pl.y - prop.y, pl.x - prop.x);
      pl.x += Math.cos(a) * 5;
      pl.y += Math.sin(a) * 5;
    }
  }

  applyShopPurchase(prop) {
    switch (prop.kind) {
      case 'item':
        this.grantItem(prop.itemId);
        break;
      case 'heart':
        this.healPlayer(2);
        this.sfx('heart');
        break;
      case 'bomb':
        this.player.bombs += 2;
        this.sfx('pickup');
        break;
      case 'key':
        this.player.keys += 2;
        this.sfx('pickup');
        break;
      default:
        this.sfx('pickup');
    }
  }

  rerollRoomItems() {
    let any = false;
    for (const prop of this.props) {
      if (prop.type === 'pedestal' || prop.type === 'pedestalLocked') {
        prop.itemId = this.pickItem('treasure');
        any = true;
      } else if (prop.type === 'shopItem' && prop.kind === 'item') {
        prop.itemId = this.pickItem('shop');
        any = true;
      }
    }
    if (any) this.sfx('confirm');
    return any;
  }

  // --------------------------------------------------------------- combat

  spawnShot(team) {
    const s = this.shots.acquire();
    if (!s) return null;
    s.team = team;
    return s;
  }

  cloneShot(src) {
    return cloneShotImpl(this, src);
  }

  shotColor(kind) {
    switch (kind) {
      case 'flame':
      case 'dragonfire':
        return '#ff9d3c';
      case 'acid':
        return '#8ede4a';
      case 'gloom':
        return '#a89bff';
      case 'seed':
        return '#d9ff9c';
      case 'spark':
        return '#ffe066';
      case 'shrapnel':
        return '#ffc08a';
      case 'ash':
        return '#c0b8b0';
      case 'prism':
        return '#4fe1ff';
      default:
        return '#ff6b9d';
    }
  }

  nearestEnemy(x, y, range = 260, exclude = null) {
    let best = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.invulnerable || e.disguised) continue;
      if (exclude && exclude.has(e.uid)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }

  damageEnemy(e, amount, opts = {}) {
    if (!e.alive || e.invulnerable) return 0;
    let dmg = amount;
    if (opts.kind !== 'true' && e.armor) dmg = Math.max(1, dmg - e.armor);
    if (e.frozen > 0) dmg *= 1.25;
    dmg = Math.max(0.5, dmg);

    e.hp -= dmg;
    e.flash = 0.09;
    e.noRegenT = 2.5; // regenerating enemies must be punished for taking hits

    if (opts.knockback && e.knockbackResist < 1) {
      const k = opts.knockback * (1 - e.knockbackResist);
      const l = Math.hypot(opts.kx || 0, opts.ky || 0) || 1;
      e.vx += ((opts.kx || 0) / l) * k;
      e.vy += ((opts.ky || 0) / l) * k;
    }
    if (opts.burn) this.applyBurn(e, 2.2, 3 * opts.burn);
    if (opts.poison && this.rng.chance(opts.poison)) {
      e.poison = Math.max(e.poison, 3.4);
      e.poisonDps = Math.max(e.poisonDps, 2.4);
    }
    if (opts.freeze && this.rng.chance(opts.freeze)) {
      e.frozen = Math.max(e.frozen, 1.3);
      this.fx('freeze', { x: e.x, y: e.y });
    }
    if (opts.shock && this.rng.chance(opts.shock)) {
      e.shocked = Math.max(e.shocked, 1.1);
      e.stun = Math.max(e.stun, 0.35);
    }

    if (!opts.silent) {
      this.sfx(opts.crit ? 'crit' : 'hit', { gain: opts.crit ? 1 : 0.7 });
      if (opts.crit) {
        this.hitStop = Math.max(this.hitStop, 0.045);
        this.shake(3, 0.1);
        runHook(this.player, 'onCrit', { game: this, player: this.player, enemy: e });
      }
    }
    this.events.emit('damage', { enemy: e, amount: dmg, crit: opts.crit });
    runHook(this.player, 'onHit', { game: this, player: this.player, enemy: e, amount: dmg });

    if (e.hp <= 0) this.killEnemy(e, opts);
    return dmg;
  }

  applyBurn(e, time, dps) {
    e.burn = Math.max(e.burn, time);
    e.burnDps = Math.max(e.burnDps, dps);
  }

  killEnemy(e, opts = {}) {
    if (!e.alive) return;

    // Revenants get back up once instead of dying.
    if (e.def && e.def.behavior === 'reviver' && !e.ai.revived && !e.ai.downed) {
      e.ai.downed = true;
      e.ai.reviveT = e.def.params.reviveAfter;
      e.hp = 1;
      return;
    }

    e.alive = false;
    e.dying = 0.35;
    e.hp = 0;
    this.stats.kills++;

    if (e.isBoss) {
      this.sfx('bossDie');
      this.shake(12, 0.7);
      this.hitStop = 0.12;
      this.fx('bossDeath', { x: e.x, y: e.y, color: e.tint });
      e.dying = 1.2;
    } else {
      this.sfx('enemyDie');
      this.fx('death', { x: e.x, y: e.y, color: e.tint, radius: e.radius });
    }

    const d = e.def && e.def.onDeath;
    if (d) {
      if (d.split) {
        for (let i = 0; i < d.split.count; i++) {
          const a = (i / d.split.count) * Math.PI * 2;
          const spot = findFreeSpot(
            this.room.tiles,
            e.x + Math.cos(a) * 16,
            e.y + Math.sin(a) * 16,
            8,
            this.rng,
          );
          const child = createEnemy(d.split.id, spot.x, spot.y, {
            hpScale: d.split.hpScale,
            fromSplit: true,
            phase: this.rng.angle(),
          });
          this.enemies.push(child);
        }
      }
      if (d.explode) {
        this.explode(e.x, e.y, d.explode.radius, d.explode.damage, TEAM.ENEMY, {});
      }
      if (d.goo) this.spawnGoo(e.x, e.y, d.goo);
      if (d.cloud) {
        this.spawnCloud(e.x, e.y, {
          radius: d.cloud.radius,
          time: d.cloud.time,
          damage: d.cloud.damage,
          team: TEAM.ENEMY,
          color: '#8ede4a',
          kind: d.cloud.kind,
        });
      }
      if (d.leaves || d.shards) {
        this.spawnBurst(e.x, e.y, {
          count: d.leaves || d.shards,
          speed: 150,
          damage: 1,
          team: TEAM.ENEMY,
          color: e.tint,
          life: 0.7,
        });
      }
    }

    // Poison plague synergy: dying poisoned enemies leave a cloud.
    if (e.poison > 0 && opts.shot && opts.shot.plague) {
      this.spawnCloud(e.x, e.y, {
        radius: 46,
        time: 3,
        damage: 2,
        team: TEAM.PLAYER,
        color: '#8ede4a',
        kind: 'poison',
      });
    }
    if (e.frozen > 0 && opts.shot && (opts.shot.shatter || opts.shot.frostbomb)) {
      this.spawnBurst(e.x, e.y, {
        count: 8,
        speed: 230,
        damage: 3 + this.player.stats.damage * 0.4,
        team: TEAM.PLAYER,
        color: '#9fe6ff',
        life: 0.45,
      });
    }

    runHook(this.player, 'onKill', { game: this, player: this.player, enemy: e });

    // Drops
    if (!e.fromSplit) {
      const luck = this.player.stats.luck;
      const roll = this.rng.next();
      const chance = (e.elite ? 0.55 : 0.16) + luck * 0.015;
      if (roll < chance * e.dropChanceMul) {
        const kinds = ['coin', 'coin', 'coin', 'halfHeart', 'bomb', 'key'];
        this.dropPickup(e.x, e.y, this.rng.pick(kinds));
      }
    }
  }

  damageEnemiesNear(x, y, radius, amount, source, stun = 0) {
    let any = false;
    for (const e of this.enemies) {
      if (!e.alive || e.invulnerable) continue;
      const d = dist(e.x, e.y, x, y);
      if (d > radius + e.radius) continue;
      this.damageEnemy(e, amount, { source, knockback: 90, kx: e.x - x, ky: e.y - y, silent: true });
      if (stun) e.stun = Math.max(e.stun, stun);
      any = true;
    }
    if (any) this.sfx('hit', { gain: 0.5 });
    return any;
  }

  damageAllEnemies(amount) {
    for (const e of this.enemies) {
      if (e.alive) this.damageEnemy(e, amount, { source: 'nuke', silent: true });
    }
    this.sfx('explode', { gain: 0.6 });
  }

  pullEnemiesToward(x, y, radius, force) {
    for (const e of this.enemies) {
      if (!e.alive || e.knockbackResist >= 1) continue;
      const dx = x - e.x;
      const dy = y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 1) continue;
      e.x += (dx / d) * force * (1 - d / radius);
      e.y += (dy / d) * force * (1 - d / radius);
    }
  }

  explode(x, y, radius, damage, team, opts = {}) {
    this.fx('explosion', { x, y, radius, color: opts.napalm ? '#ff7a2f' : '#ffd166' });
    this.sfx('explode');
    this.shake(7, 0.28);
    if (team === TEAM.PLAYER) {
      this.damageEnemiesNear(x, y, radius, damage, 'explosion');
    } else if (!this.player.dead) {
      if (dist(this.player.x, this.player.y, x, y) < radius) {
        this.damagePlayer(Math.max(1, Math.round(damage / 3)), { source: 'explosion' });
      }
    }
    if (opts.rocks !== false) this.smashRocksNear(x, y, radius);
    if (opts.napalm) {
      this.spawnGoo(x, y, { radius: radius * 0.7, time: 4, damage: 1, kind: 'fire' });
    }
    runHook(this.player, 'onBomb', { game: this, player: this.player, x, y });
  }

  placeBomb(x, y) {
    this.effects.push({
      type: 'bomb',
      x,
      y,
      t: 0,
      fuseT: 1.4,
      lastBeep: -1,
      damage: 22 + this.player.stats.damage * 2,
    });
    this.sfx('pickup', { rate: 0.6, gain: 0.5 });
  }

  spawnShockwave(x, y, o) {
    this.effects.push({
      type: 'shockwave',
      x,
      y,
      t: 0,
      r: 0,
      radius: o.radius,
      damage: o.damage,
      team: o.team,
      color: o.color || '#ffffff',
      stun: o.stun || 0,
      done: false,
    });
    this.fx('ring', { x, y, radius: o.radius, color: o.color || '#ffffff' });
  }

  spawnGoo(x, y, o) {
    this.effects.push({
      type: 'goo',
      x,
      y,
      t: 0,
      time: o.time || 3,
      radius: o.radius || 16,
      damage: o.damage || 0,
      kind: o.kind || 'goo',
      color: o.color || (o.kind === 'lava' || o.kind === 'fire' ? '#ff7a2f' : '#8ede4a'),
    });
  }

  spawnCloud(x, y, o) {
    this.effects.push({
      type: 'cloud',
      x,
      y,
      t: 0,
      time: o.time || 3,
      radius: o.radius || 40,
      damage: o.damage || 1,
      team: o.team,
      color: o.color || '#8ede4a',
      kind: o.kind || 'poison',
    });
  }

  spawnBurst(x, y, o) {
    for (let i = 0; i < o.count; i++) {
      const s = this.spawnShot(o.team);
      if (!s) return;
      const a = (i / o.count) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
      s.x = s.px = x;
      s.y = s.py = y;
      s.angle = a;
      s.speed = o.speed;
      s.vx = Math.cos(a) * o.speed;
      s.vy = Math.sin(a) * o.speed;
      s.damage = o.damage;
      s.radius = 3.4;
      s.life = s.maxLife = o.life || 0.5;
      s.color = o.color;
      s.freeze = o.freeze || 0;
      s.style = 'shard';
    }
  }

  spawnStarfall(count, damage) {
    for (let i = 0; i < count; i++) {
      this.effects.push({
        type: 'starfall',
        x: this.rng.range(TILE, ROOM_PX_W - TILE),
        y: this.rng.range(TILE, ROOM_PX_H - TILE),
        t: 0,
        delay: 0.25 + i * 0.11,
        damage,
        done: false,
      });
    }
    this.sfx('shootLaser', { gain: 0.4 });
  }

  firePlayerLaser(angle, charge) {
    const dmg = this.player.stats.damage * this.player.stats.damageMult * (1.2 + charge * 2.2);
    const prism = this.player.inv.synergies.some((s) => s.id === 'prismBeam');
    const angles = prism ? [angle - 0.18, angle, angle + 0.18] : [angle];
    for (const a of angles) {
      this.beamDamage(this.player.x, this.player.y, a, 620, dmg, TEAM.PLAYER, 1, true);
      this.effects.push({
        type: 'beam',
        x: this.player.x,
        y: this.player.y,
        angle: a,
        len: 620,
        t: 0,
        time: 0.22,
        color: prism ? ['#ff4fa3', '#4fe1ff', '#ffe14f'][angles.indexOf(a)] : '#ff2e63',
        width: 7 + charge * 6,
      });
    }
    this.sfx('shootLaser');
    this.shake(4, 0.16);
  }

  /**
   * Damage everything along a ray. `instant` applies full damage once;
   * otherwise `amount` is treated as damage-per-second.
   */
  beamDamage(x, y, angle, len, amount, team, dt, instant = false) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const steps = Math.ceil(len / 10);
    let hitAny = false;
    for (let i = 1; i <= steps; i++) {
      const px = x + dx * i * 10;
      const py = y + dy * i * 10;
      const tile = tileAtWorld(this.room.tiles, px, py);
      if (tile === T.WALL || tile === T.ROCK) {
        if (tile === T.ROCK && team === TEAM.PLAYER) this.damageRock(px, py, 99);
        break;
      }
      if (team === TEAM.PLAYER) {
        for (const e of this.enemies) {
          if (!e.alive || e.invulnerable) continue;
          if (dist(e.x, e.y, px, py) < e.radius + 6) {
            if (instant) {
              if (!e._beamHit) {
                e._beamHit = true;
                this.damageEnemy(e, amount, { source: 'beam', knockback: 40, kx: dx, ky: dy });
                hitAny = true;
              }
            } else {
              this.damageEnemy(e, amount * dt, { source: 'beam', silent: true });
            }
          }
        }
      } else if (!this.player.dead && this.player.invuln <= 0) {
        if (dist(this.player.x, this.player.y, px, py) < this.player.radius + 5) {
          this.damagePlayer(instant ? amount : Math.max(1, amount), { source: 'beam' });
          break;
        }
      }
    }
    if (instant) for (const e of this.enemies) e._beamHit = false;
    return hitAny;
  }

  damageRock(x, y, amount) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx <= 0 || ty <= 0 || tx >= ROOM_W - 1 || ty >= ROOM_H - 1) return;
    const i = ty * ROOM_W + tx;
    if (this.room.tiles[i] !== T.ROCK) return;
    if (!this.room.rockHp) this.room.rockHp = new Uint8Array(ROOM_W * ROOM_H).fill(2);
    this.room.rockHp[i] = Math.max(0, this.room.rockHp[i] - amount);
    if (this.room.rockHp[i] <= 0) {
      this.room.tiles[i] = T.FLOOR;
      this.sfx('rockBreak');
      this.fx('rubble', { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
      this.events.emit('tilesChanged', { room: this.room });
      if (this.rng.chance(0.16)) this.dropPickup((tx + 0.5) * TILE, (ty + 0.5) * TILE, 'coin');
    } else {
      this.fx('spark', { x, y, color: '#c0a080' });
    }
  }

  smashRocksNear(x, y, radius) {
    const r = Math.ceil(radius / TILE);
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (tx <= 0 || ty <= 0 || tx >= ROOM_W - 1 || ty >= ROOM_H - 1) continue;
        const i = ty * ROOM_W + tx;
        if (this.room.tiles[i] !== T.ROCK) continue;
        if (dist((tx + 0.5) * TILE, (ty + 0.5) * TILE, x, y) > radius) continue;
        this.room.tiles[i] = T.FLOOR;
        this.fx('rubble', { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
      }
    }
    this.events.emit('tilesChanged', { room: this.room });
  }

  smashAllRocks() {
    for (let i = 0; i < this.room.tiles.length; i++) {
      if (this.room.tiles[i] === T.ROCK) {
        this.room.tiles[i] = T.FLOOR;
        this.fx('rubble', { x: ((i % ROOM_W) + 0.5) * TILE, y: (Math.floor(i / ROOM_W) + 0.5) * TILE });
      }
    }
    this.sfx('rockBreak');
    this.events.emit('tilesChanged', { room: this.room });
  }

  clearEnemyShots(convert = false) {
    this.shots.forEach((s) => {
      if (s.team === TEAM.ENEMY) {
        if (convert) this.fx('spark', { x: s.x, y: s.y, color: '#ffd166' });
        this.shots.release(s);
      }
    });
  }

  // --------------------------------------------------------------- player

  enemyTouchPlayer(e, dt) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || e.disguised || e.hidden) return;
    if (p.dashT > 0 && p.flags.phaseDash) return;
    const rr = p.radius + e.radius - 2;
    if (dist(p.x, p.y, e.x, e.y) > rr) return;
    this.damagePlayer(e.touch, { source: 'contact', enemy: e });
    runHook(p, 'onContact', { game: this, player: p, enemy: e });
    // Push apart so contact damage cannot machine-gun.
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    p.x += Math.cos(a) * 10;
    p.y += Math.sin(a) * 10;
  }

  damagePlayer(amount, opts = {}) {
    const p = this.player;
    if (p.dead) return 0;
    if (!opts.ignoreInvuln && p.invuln > 0) return 0;

    if (p.flags.wardPerRoom && !p.wardUsed && !opts.ignoreArmor) {
      p.wardUsed = true;
      p.invuln = p.stats.contactIFrames;
      this.sfx('block');
      this.fx('ward', { x: p.x, y: p.y });
      return 0;
    }

    let dmg = Math.max(1, Math.round(amount));
    if (!opts.ignoreArmor && p.stats.armor > 0) {
      dmg = Math.max(1, dmg - Math.floor(p.stats.armor / 2));
    }
    if (p.flags.glass) dmg = 99;

    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      this.fx('shieldBreak', { x: p.x, y: p.y });
    }

    if (dmg > 0) {
      p.hp -= dmg;
      this.stats.damageTaken += dmg;
    }
    p.invuln = p.stats.contactIFrames;
    p.hurtFlash = 0.35;
    p.statsDirty = true;
    this.sfx('hurt');
    this.shake(6, 0.3);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.fx('playerHurt', { x: p.x, y: p.y });
    runHook(p, 'onHurt', { game: this, player: p, amount: dmg, source: opts.source });
    this.events.emit('playerHurt', { amount: dmg, hp: p.hp });

    if (p.hp <= 0) this.killPlayer();
    return dmg;
  }

  healPlayer(amount) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    p.statsDirty = true;
    const healed = p.hp - before;
    if (healed > 0) this.fx('heal', { x: p.x, y: p.y });
    return healed;
  }

  killPlayer() {
    const p = this.player;
    if (p.flags.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = 2;
      p.invuln = 2.4;
      this.clearEnemyShots();
      this.fx('revive', { x: p.x, y: p.y, color: '#fff3b0' });
      this.sfx('synergy');
      this.message('Последняя свеча вспыхнула', '', 2);
      return;
    }
    p.dead = true;
    p.hp = 0;
    this.state = STATE.DEAD;
    this.sfx('death');
    this.shake(10, 0.6);
    this.events.emit('death', { stats: this.stats });
  }

  // --------------------------------------------------------------- allies

  spawnAlly(time) {
    this.allies.push({
      x: this.player.x + this.rng.range(-20, 20),
      y: this.player.y + this.rng.range(-20, 20),
      px: 0,
      py: 0,
      t: 0,
      life: time,
      cd: 0.4,
      a: this.rng.angle(),
    });
  }

  updateAllies(dt) {
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const a = this.allies[i];
      a.px = a.x;
      a.py = a.y;
      a.life -= dt;
      a.t += dt;
      if (a.life <= 0) {
        this.allies.splice(i, 1);
        continue;
      }
      const target = this.nearestEnemy(a.x, a.y, 300);
      if (target) {
        const ang = Math.atan2(target.y - a.y, target.x - a.x);
        a.x += Math.cos(ang) * 90 * dt;
        a.y += Math.sin(ang) * 90 * dt;
        a.cd -= dt;
        if (a.cd <= 0) {
          a.cd = 0.55;
          const s = this.spawnShot(TEAM.PLAYER);
          if (s) {
            s.x = s.px = a.x;
            s.y = s.py = a.y;
            s.angle = ang;
            s.speed = 260;
            s.vx = Math.cos(ang) * 260;
            s.vy = Math.sin(ang) * 260;
            s.damage = 3 + this.player.stats.damage * 0.4;
            s.radius = 3.5;
            s.life = s.maxLife = 0.7;
            s.color = '#7cff6b';
          }
        }
      } else {
        const ang = Math.atan2(this.player.y - a.y, this.player.x - a.x);
        const d = dist(a.x, a.y, this.player.x, this.player.y);
        if (d > 40) {
          a.x += Math.cos(ang) * 100 * dt;
          a.y += Math.sin(ang) * 100 * dt;
        }
      }
    }
  }

  spawnFamiliarShot(fam, angle, damage) {
    const s = this.spawnShot(TEAM.PLAYER);
    if (!s) return;
    s.x = s.px = fam.x;
    s.y = s.py = fam.y;
    s.angle = angle;
    s.speed = 300;
    s.vx = Math.cos(angle) * 300;
    s.vy = Math.sin(angle) * 300;
    s.damage = damage;
    s.radius = 3.2;
    s.life = s.maxLife = 0.65;
    s.color = '#7cff6b';
    s.style = 'familiar';
  }

  spawnMinions(source, cfg) {
    const max = cfg.max || 8;
    const current = this.enemies.filter((e) => e.alive && e.id === cfg.id).length;
    const room = Math.max(0, max - current);
    const n = Math.min(cfg.count || 1, room);
    for (let i = 0; i < n; i++) {
      const a = this.rng.angle();
      const spot = findFreeSpot(
        this.room.tiles,
        source.x + Math.cos(a) * 24,
        source.y + Math.sin(a) * 24,
        8,
        this.rng,
      );
      const e = createEnemy(cfg.id, spot.x, spot.y, {
        hpScale: 0.85,
        fromSplit: true,
        phase: this.rng.angle(),
      });
      this.enemies.push(e);
      this.fx('summon', { x: spot.x, y: spot.y, color: e.tint });
    }
  }

  /** Pack hunters take turns; only one may be dashing at a time. */
  claimPackToken(e) {
    if (this.packToken.holder && this.packToken.holder !== e) return false;
    this.packToken.holder = e;
    this.packToken.t = 0.6;
    return true;
  }

  // ---------------------------------------------------------------- misc

  fx(type, data) {
    this.events.emit('fx', { type, ...data });
  }

  sfx(name, opts) {
    this.events.emit('sfx', { name, opts });
  }

  shake(mag, time) {
    if (mag > this.shakeMag || this.shakeT <= 0) {
      this.shakeMag = mag;
      this.shakeT = time;
    }
  }

  message(title, sub, time = 2) {
    this.messages.push({ title, sub, time, t: 0 });
    if (this.messages.length > 3) this.messages.shift();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) {
      this.state = STATE.PAUSED;
      this.prevState = STATE.PLAYING;
      this.events.emit('pause', {});
    } else if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      this.events.emit('resume', {});
    }
  }

  /** Snapshot for the save system (handled entirely by the shell). */
  serializeMeta() {
    return {
      seed: this.seed,
      floor: this.floorIndex,
      stats: this.stats,
      items: this.player.inv.items.slice(),
    };
  }
}
