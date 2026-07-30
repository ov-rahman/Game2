/**
 * The simulation core.
 *
 * Owns the run, the dungeon, the player and every entity in it. Contains no
 * reference to `window`, `document`, `localStorage`, WebGL or Web Audio: side
 * effects leave through `this.events` and come back as an InputSnapshot. That is
 * what makes the same code runnable in a browser, in Electron/Tauri, or
 * head-less inside the test harness.
 */
import {
  CELL,
  GRID_W,
  GRID_H,
  C,
  TEAM,
  isOpen,
} from './constants.js';
import { Rng } from './rng.js';
import { EventBus } from './events.js';
import { generateDungeon, ROOM_KIND, roomAtWorld } from './world/dungeongen.js';
import { NavField } from './world/nav.js';
import { findFreeSpot, hasLineOfSight, moveBody, raycast } from './world/collision.js';
import { ShotPool } from './entities/projectile.js';
import { createEnemy, updateEnemy } from './entities/enemy.js';
import { createPlayer, updatePlayer, aimDirection } from './entities/player.js';
import { updateShots, updateAreas } from './combat.js';
import { addItem, setActive, recomputeStats, runHook, chargeActive, hasItem } from './items/inventory.js';
import { cloneShot as cloneShotImpl } from './items/shots.js';
import { createBoss, updateBoss } from './bosses/index.js';
import { getFloor, FLOOR_COUNT } from '../data/floors.js';
import { ITEMS, ITEM_IDS, ACTIVE_IDS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { SPRITE } from '../data/sprite-ids.js';
import { clamp, lerp, dist2d, dist2dSq, angleDelta } from './math3.js';
import { Menu } from './ui/menu.js';

export const STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
  WIN: 'win',
};

const NAV_INTERVAL = 0.22;

/** Shipped defaults; the settings screen resets to exactly this. */
export const DEFAULT_SETTINGS = {
  filterStrength: 1,
  brightness: 0,
  wobble: true,
  sensitivity: 0.0022,
  invertY: false,
  master: 0.85,
  music: 0.45,
  sfx: 1,
};

/** Seconds without taking a hit before the player starts patching up. */
const REGEN_DELAY = 11;
/** Seconds per point regained, up to half of maximum health. */
const REGEN_INTERVAL = 5;

export class Game {
  constructor(opts = {}) {
    this.events = opts.events || new EventBus();
    this.rng = new Rng(opts.seed || 12345);
    this.seed = this.rng.seed;

    this.state = STATE.TITLE;
    this.settings = { ...DEFAULT_SETTINGS };
    this.menu = new Menu(this);

    this.shots = new ShotPool(opts.shotCap || 420);
    this.enemies = [];
    this.props = [];
    this.areas = [];
    this.pendingStrikes = [];
    this.decoys = [];
    this.dynamicLights = [];
    this.exploredCells = new Set();

    this.player = createPlayer(0, 0);
    this.dungeon = null;
    this.floorDef = null;
    this.floorIndex = 0;
    this.nav = new NavField();
    this.navTimer = 0;

    this.torch = {
      on: true,
      charge: 1,
      inner: 0.45,
      outer: 0.85,
      range: 19,
      color: [1, 0.94, 0.82],
    };

    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.timeScaleTimer = 0;
    this.enemyFireScale = 1;
    this.enemyShotSpeedScale = 1;
    this.enemyShotSlow = 1;

    this.shakeMag = 0;
    this.shakeT = 0;
    this.fade = 0;
    this.fadeTarget = 0;
    this.messages = [];
    this.objective = '';
    this.prompt = '';
    this.showMap = false;
    this.debug = false;
    this.best = null;
    this.loopStats = null;
    this.packToken = { holder: null, t: 0 };
    this.bossActive = false;

    this.stats = this.freshStats();
    this.seenItems = new Set();
  }

  /** Restore every setting to the shipped value. */
  resetSettings() {
    Object.assign(this.settings, DEFAULT_SETTINGS);
    this.events.emit('settingsChanged', { settings: this.settings });
  }

  freshStats() {
    return {
      kills: 0,
      damageTaken: 0,
      itemsTaken: 0,
      roomsCleared: 0,
      time: 0,
      floorReached: 1,
      bossesKilled: 0,
    };
  }

  // ------------------------------------------------------------ lifecycle

  startRun(seed) {
    this.rng = new Rng(seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed);
    this.seed = this.rng.seed;
    this.state = STATE.PLAYING;

    this.shots.clear();
    this.enemies.length = 0;
    this.props.length = 0;
    this.areas.length = 0;
    this.pendingStrikes.length = 0;
    this.decoys.length = 0;
    this.dynamicLights.length = 0;
    this.messages.length = 0;
    this.exploredCells.clear();
    this.seenItems.clear();
    this.showMap = false;
    this.timeScale = 1;
    this.timeScaleTarget = 1;

    this.player = createPlayer(0, 0);
    recomputeStats(this, this.player);
    this.player.hp = this.player.stats.maxHp;
    setActive(this.player, this.rng.pick(ACTIVE_IDS));
    recomputeStats(this, this.player);

    this.torch.charge = 1;
    this.torch.on = true;
    this.stats = this.freshStats();

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
    this.floorDef = def;
    this.dungeon = generateDungeon(this.rng.fork(`floor${this.floorIndex}`), def);
    this.stats.floorReached = Math.max(this.stats.floorReached, this.floorIndex);

    this.enemies.length = 0;
    this.props.length = 0;
    this.areas.length = 0;
    this.pendingStrikes.length = 0;
    this.decoys.length = 0;
    this.shots.clear();
    this.exploredCells.clear();
    this.messages.length = 0;
    this.bossActive = false;
    this.boss = null;

    this.player.x = this.dungeon.start.x;
    this.player.z = this.dungeon.start.z;
    this.player.px = this.player.x;
    this.player.pz = this.player.z;
    this.player.vx = this.player.vz = 0;
    this.player.wardUsed = false;
    if (this.player.flags.reviveRefresh) this.player.reviveUsed = false;

    this.torch.range = this.player.stats.torchRange;
    this.torch.charge = Math.min(1, this.torch.charge + 0.35);

    this.populateFloor();
    this.nav.rebuild(this.dungeon.cells, this.gridX(this.player.x), this.gridZ(this.player.z));

    if (this.player.flags.fullMap) this.revealMap();

    runHook(this.player, 'onFloorStart', { game: this, player: this.player });
    this.events.emit('floorStart', { index: this.floorIndex, def });
    this.message(def.name, def.subtitle, 3);
    this.objective = 'найди логово и убей то, что в нём живёт';
  }

  /** Spread monsters, loot and props across the whole floor. */
  populateFloor() {
    const def = this.floorDef;
    const d = this.dungeon;

    for (const room of d.rooms) {
      room.seen = false;
      if (room.kind === ROOM_KIND.START) continue;

      if (room.kind === ROOM_KIND.BOSS) {
        const w = room.world();
        const boss = createBoss(this, def.boss, w.x, w.z);
        boss.dormant = true;
        this.enemies.push(boss);
        this.boss = boss;
        // A supply cache inside the lair. Arriving at a boss on two health
        // after fighting across the whole floor is a coin flip, not a fight.
        const edge = Math.min(room.w, room.h) * CELL * 0.32;
        this.addProp({ type: 'pickup', kind: 'heal', x: w.x - edge, z: w.z - edge });
        this.addProp({ type: 'pickup', kind: 'heal', x: w.x + edge, z: w.z - edge });
        this.addProp({ type: 'pickup', kind: 'battery', x: w.x - edge, z: w.z + edge });
        continue;
      }

      if (room.kind === ROOM_KIND.TREASURE) {
        const w = room.world();
        this.addProp({ type: 'pedestal', x: w.x, z: w.z, itemId: this.pickItem('treasure') });
        continue;
      }

      if (room.kind === ROOM_KIND.SHOP) {
        const w = room.world();
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * 2.6;
          const roll = this.rng.next();
          const entry = roll < 0.55
            ? { type: 'shop', kind: 'item', itemId: this.pickItem('shop'), price: this.rng.int(8, 16) }
            : roll < 0.8
              ? { type: 'shop', kind: 'heal', price: 5 }
              : { type: 'shop', kind: 'battery', price: 4 };
          entry.x = w.x + off;
          entry.z = w.z;
          this.addProp(entry);
        }
        continue;
      }

      // Normal / challenge rooms get a monster budget scaled by distance from
      // spawn. The scaling is capped: uncapped, the far side of a floor held
      // three times the garrison of the near side and the run became a war of
      // attrition nobody could finish.
      const mul = room.kind === ROOM_KIND.CHALLENGE ? 1.8 : 1;
      const budget = (1.2 + Math.min(room.depth, 5) * 0.45) * def.difficulty * mul;
      this.spawnPack(room, budget);

      if (room.kind === ROOM_KIND.CHALLENGE) {
        const w = room.world();
        this.addProp({ type: 'pedestal', x: w.x, z: w.z, itemId: this.pickItem('challenge'), locked: true, roomId: room.id });
      }

      // Scattered loot.
      if (this.rng.chance(0.55)) {
        const spot = this.randomSpotIn(room);
        this.addProp({ type: 'pickup', kind: this.rng.pick(['shard', 'heal', 'heal', 'battery']), x: spot.x, z: spot.z });
      }
    }

    // Batteries in corridors: the resource that paces the whole descent.
    let placed = 0;
    let guard = 0;
    while (placed < 4 + this.floorIndex && guard++ < 400) {
      const gx = this.rng.int(2, GRID_W - 3);
      const gy = this.rng.int(2, GRID_H - 3);
      if (this.dungeon.cells[gy * GRID_W + gx] !== C.FLOOR) continue;
      if (this.dungeon.roomAt[gy * GRID_W + gx] >= 0) continue;
      this.addProp({ type: 'pickup', kind: 'battery', x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL });
      placed++;
    }

    // A room with nothing living in it starts cleared; the rest are earned.
    for (const room of d.rooms) {
      room.cleared = !this.enemies.some((e) => e.homeRoom === room.id);
    }
  }

  spawnPack(room, budget) {
    const def = this.floorDef;
    const pool = def.enemies.map((id) => ({ id, weight: ENEMIES[id].weight || 1 }));
    let spent = 0;
    let guard = 0;
    while (spent < budget && guard++ < 30) {
      const pick = this.rng.weighted(pool);
      const cost = ENEMIES[pick.id].cost || 1;
      if (spent + cost > budget + 0.6) break;
      spent += cost;
      const spot = this.randomSpotIn(room);
      const e = createEnemy(pick.id, spot.x, spot.z, {
        hpScale: 1 + (this.floorIndex - 1) * 0.06,
      });
      e.homeRoom = room.id;
      this.enemies.push(e);
    }
    if (def.elites && def.elites.length && this.rng.chance(def.eliteChance)) {
      const spot = this.randomSpotIn(room);
      const e = createEnemy(this.rng.pick(def.elites), spot.x, spot.z, { hpScale: 1 + (this.floorIndex - 1) * 0.08 });
      e.homeRoom = room.id;
      this.enemies.push(e);
    }
  }

  randomSpotIn(room) {
    for (let i = 0; i < 24; i++) {
      const gx = this.rng.int(room.x, room.x + room.w - 1);
      const gy = this.rng.int(room.y, room.y + room.h - 1);
      const cell = this.dungeon.cells[gy * GRID_W + gx];
      if (cell !== C.FLOOR) continue;
      return { x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL };
    }
    const w = room.world();
    return { x: w.x, z: w.z };
  }

  addProp(p) {
    p.y = p.type === 'pickup' ? 0.55 : 0.8;
    p.phase = this.rng.angle();
    p.scale = p.type === 'pedestal' ? 0.8 : 0.5;
    p.art = p.type === 'pickup' ? 'lantern' : p.type === 'shop' ? 'lantern' : 'prismSprite';
    p.taken = false;
    this.props.push(p);
    return p;
  }

  win() {
    this.state = STATE.WIN;
    this.events.emit('win', { stats: this.stats });
  }

  revealMap() {
    for (const r of this.dungeon.rooms) r.seen = true;
    for (let i = 0; i < this.dungeon.cells.length; i++) {
      if (isOpen(this.dungeon.cells[i])) this.exploredCells.add(i);
    }
  }

  // ---------------------------------------------------------------- helpers

  gridX(x) {
    return Math.floor(x / CELL);
  }
  gridZ(z) {
    return Math.floor(z / CELL);
  }

  camera(alpha) {
    const p = this.player;
    const bob = Math.sin(p.bobPhase * 2) * p.bobAmount;
    const sway = Math.cos(p.bobPhase) * p.bobAmount * 0.6;
    return {
      x: lerp(p.px, p.x, alpha) + Math.cos(p.yaw) * sway,
      y: p.y + p.eyeHeight + bob - p.kickY,
      z: lerp(p.pz, p.z, alpha) - Math.sin(p.yaw) * sway,
      yaw: p.yaw,
      pitch: p.pitch - p.recoil * 0.16,
    };
  }

  fov() {
    const p = this.player;
    // A touch of FOV widening while sprinting sells the speed.
    return (72 + (p.sprinting ? 7 : 0)) * (Math.PI / 180);
  }

  shakeAmount() {
    return this.shakeT > 0 ? this.shakeMag * this.shakeT : 0;
  }

  damageFlash() {
    return clamp(this.player.hurtFlash, 0, 1);
  }

  fadeAmount() {
    return this.fade;
  }

  /** Is a world point inside the player's torch cone and lit? */
  torchLightsPoint(x, z) {
    if (!this.torch.on || this.torch.charge <= 0.02) return this.player.flags.nightVision > 0;
    const p = this.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > this.torch.range) return false;
    const a = Math.atan2(dx, dz);
    return Math.abs(angleDelta(p.yaw, a)) < this.torch.outer * 1.1;
  }

  /** Is the player looking roughly at this entity, with line of sight? */
  playerLooksAt(e) {
    const p = this.player;
    const a = Math.atan2(e.x - p.x, e.z - p.z);
    if (Math.abs(angleDelta(p.yaw, a)) > 0.6) return false;
    return hasLineOfSight(this.dungeon.cells, p.x, p.z, e.x, e.z, {});
  }

  toggleTorch() {
    this.torch.on = !this.torch.on;
    this.sfx('reloadTorch', { gain: 0.5 });
  }

  // ---------------------------------------------------------------- step

  step(dt, input) {
    this.syncMenu();
    if (this.menu.open) {
      this.stepMenu(input);
      // The death and victory screens keep animating behind their menu.
      if (this.state !== STATE.TITLE && this.state !== STATE.PAUSED) this.updateTimers(dt);
      return;
    }
    if (this.state !== STATE.PLAYING) {
      this.updateTimers(dt);
      return;
    }

    this.stats.time += dt;

    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= dt;
      if (this.timeScaleTimer <= 0) this.timeScaleTarget = 1;
    }
    this.timeScale += (this.timeScaleTarget - this.timeScale) * Math.min(1, dt * 4);
    this.enemyShotSlow = this.timeScale;
    const sdt = dt * this.timeScale;

    this.updateTimers(dt);

    if (!this.player.dead) updatePlayer(this, this.player, sdt, input);

    // Torch battery: the pacing mechanism of the whole game.
    if (this.torch.on && this.torch.charge > 0) {
      this.torch.charge = Math.max(0, this.torch.charge - this.player.stats.torchDrain * sdt);
      if (this.torch.charge === 0) {
        this.message('ФОНАРЬ СЕЛ', 'найди батарею', 2.2);
        this.sfx('deny');
      }
    }
    this.torch.range = this.player.stats.torchRange;
    if (this.player.flags.wideTorch) {
      this.torch.inner = 0.6;
      this.torch.outer = 1.05;
    }
    this.updateTorchBurn(sdt);

    // Navigation field: one BFS a few times a second serves every monster.
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = NAV_INTERVAL;
      this.nav.rebuild(this.dungeon.cells, this.gridX(this.player.x), this.gridZ(this.player.z));
    }

    if (this.packToken.holder) {
      this.packToken.t -= sdt;
      if (this.packToken.t <= 0 || !this.packToken.holder.alive) this.packToken.holder = null;
    }

    this.updateRegen(dt);
    this.updateEnemies(sdt);
    updateShots(this, sdt);
    updateAreas(this, sdt);
    this.updateStrikes(sdt);
    this.updateDecoys(sdt);
    this.updateProps(dt);
    this.updateExploration();
    this.updateDynamicLights();

    if (this.player.hp <= 0 && !this.player.dead) this.killPlayer();
  }

  /**
   * The "Прожектор" synergy: the beam itself becomes a weapon — anything
   * caught in the cone is dazzled and scorched.
   */
  updateTorchBurn(dt) {
    if (!this.player.flags.torchBurns) return;
    if (!this.torch.on || this.torch.charge <= 0.02) return;
    this.torchBurnT = (this.torchBurnT || 0) - dt;
    if (this.torchBurnT > 0) return;
    this.torchBurnT = 0.4;
    const range = this.torch.range;
    for (const e of this.enemies) {
      if (!e.alive || e.dormant || e.hidden) continue;
      if (dist2dSq(e.x, e.z, this.player.x, this.player.z) > range * range) continue;
      if (!this.torchLightsPoint(e.x, e.z)) continue;
      if (!hasLineOfSight(this.dungeon.cells, this.player.x, this.player.z, e.x, e.z, {})) continue;
      this.applyBurn(e, 1.6, 2.2);
      e.slow = Math.max(e.slow, 0.6);
    }
  }

  /**
   * Catching your breath. Out of combat the player slowly patches themselves
   * up, but only to half health — enough that one bad room does not doom a
   * run, not enough to replace medkits or to make a fight survivable by
   * standing still in it.
   */
  updateRegen(dt) {
    const p = this.player;
    if (p.dead || p.hp >= p.stats.maxHp) return;
    p.calmT = (p.calmT || 0) + dt;
    if (p.calmT < REGEN_DELAY) return;
    const cap = Math.max(1, Math.ceil(p.stats.maxHp * 0.5));
    if (p.hp >= cap) return;
    p.regenT = (p.regenT || 0) + dt;
    if (p.regenT < REGEN_INTERVAL) return;
    p.regenT = 0;
    p.hp = Math.min(cap, p.hp + 1);
    p.statsDirty = true;
    this.fx('heal', { x: p.x, y: p.y + 1, z: p.z });
  }

  // ------------------------------------------------------------------ menu

  /** Keep the menu stack in step with the game state. */
  syncMenu() {
    switch (this.state) {
      case STATE.TITLE: this.menu.show('title'); break;
      case STATE.PAUSED: this.menu.show('pause'); break;
      case STATE.DEAD: this.menu.show('dead'); break;
      case STATE.WIN: this.menu.show('win'); break;
      default: this.menu.closeAll();
    }
  }

  stepMenu(input) {
    const m = this.menu;
    const pressed = input.pressed;
    if (pressed.menuUp) m.move(-1);
    if (pressed.menuDown) m.move(1);
    if (pressed.menuLeft) m.adjust(-1);
    if (pressed.menuRight) m.adjust(1);
    if (pressed.confirm || pressed.interact || pressed.use) m.activate();

    // Escape steps back out of a sub-screen; at the top of a pause menu it
    // means "resume", which only the shell can arrange.
    if (pressed.cancel || pressed.pause) {
      if (!m.back() && this.state === STATE.PAUSED) {
        this.events.emit('uiCommand', { name: 'resume' });
      }
    }

    const cur = input.cursor;
    if (cur && cur.active) {
      m.hover(cur.x, cur.y);
      if (pressed.click) m.click(cur.x, cur.y);
    }
  }

  /** Abandon the run and go back to the title screen. */
  toTitle() {
    this.state = STATE.TITLE;
    this.bossActive = false;
    this.shots.clear();
    this.messages.length = 0;
    this.showMap = false;
    this.syncMenu();
    this.events.emit('toTitle', {});
  }

  updateTimers(dt) {
    if (this.shakeT > 0) this.shakeT -= dt;
    for (const m of this.messages) m.t += dt;
    while (this.messages.length && this.messages[0].t > this.messages[0].time) this.messages.shift();
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.dying -= dt;
        if (e.dying <= 0) this.enemies.splice(i, 1);
        continue;
      }

      // Sleep far-away monsters: this is what keeps a whole populated floor
      // affordable at 60 FPS.
      const d2 = dist2dSq(e.x, e.z, p.x, p.z);
      if (d2 > 2500 && !e.isBoss) {
        e.px = e.x;
        e.pz = e.z;
        continue;
      }

      if (e.isBoss) {
        if (e.dormant) {
          const room = this.dungeon.rooms[this.dungeon.bossRoom];
          if (room.contains(this.gridX(p.x), this.gridZ(p.z))) {
            e.dormant = false;
            this.bossActive = true;
            this.objective = `убей: ${e.name}`;
            this.sfx('bossRoar', { x: e.x, y: e.y + 2, z: e.z, gain: 1 });
            this.shake(1.6, 0.8);
            this.message(e.name, e.title, 3);
            this.events.emit('bossStart', { boss: e });
          } else {
            e.px = e.x;
            e.pz = e.z;
            continue;
          }
        }
        updateBoss(this, e, dt);
      } else {
        updateEnemy(this, e, dt);
      }

      if (e.alive) this.enemyTouchPlayer(e, dt);
    }
  }

  enemyTouchPlayer(e, dt) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || e.disguised || e.hidden) return;
    if (e.contactCd > 0) return;
    const rr = p.radius + e.radius;
    if (dist2dSq(p.x, p.z, e.x, e.z) > rr * rr) return;
    if (p.y + p.height < e.y || p.y > e.y + e.height) return;
    // Bosses are big, slow and always adjacent: without a longer gap between
    // body hits a boss fight is decided by who is standing where, not by
    // reading its telegraphs.
    e.contactCd = e.isBoss ? 1.7 : 1.15;
    this.damagePlayer(e.touch, { source: 'contact', enemy: e });
    runHook(p, 'onContact', { game: this, player: p, enemy: e });
    // Shove both bodies apart. Walking into a monster has to cost something,
    // but a crowd should never be able to chain-tap the player to death. The
    // shove goes through collision: an unchecked one buries the player in a
    // wall, and a buried body can never move again.
    const a = Math.atan2(p.x - e.x, p.z - e.z);
    moveBody(this.dungeon.cells, p, Math.sin(a) * 0.5, Math.cos(a) * 0.5, {});
    if (!e.isBoss) {
      e.vx -= Math.sin(a) * 4;
      e.vz -= Math.cos(a) * 4;
    }
  }

  updateStrikes(dt) {
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const s = this.pendingStrikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.pendingStrikes.splice(i, 1);
      this.explode(s.x, 0.7, s.z, s.radius, s.damage, TEAM.ENEMY, { color: s.color });
    }
  }

  updateProps(dt) {
    const p = this.player;
    this.prompt = '';
    const range = p.stats.pickupRange;

    // Pickups are automatic; interactables are not, so they are resolved in a
    // second pass. Only the *nearest* one may be targeted — three shop stands
    // sit inside each other's radius, and offering whichever happens to be
    // first in the array means you cannot buy the one you are standing at.
    let target = null;
    let targetD = 3.2;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i];
      const d = dist2d(prop.x, prop.z, p.x, p.z);
      if (prop.type === 'pickup') {
        // Vacuuming a medkit up at full health throws it away. Leave anything
        // the player cannot use on the floor so they can come back for it —
        // this is most of the run's healing budget.
        if (d < range && this.pickupUseful(prop)) {
          this.collectPickup(prop);
          this.props.splice(i, 1);
        }
        continue;
      }
      if (d < targetD) {
        targetD = d;
        target = prop;
      }
    }

    // The stairs compete for the same prompt and win when they are closer.
    const st = this.dungeon.stairs;
    const stairsD = dist2d(st.x, st.z, p.x, p.z);
    const atStairs = stairsD < 2.4;

    if (st.active && atStairs && (!target || stairsD <= targetD)) {
      this.prompt = 'E — спуститься ниже';
      if (this.interactPressed) {
        this.interactPressed = false;
        this.sfx('stairs');
        this.events.emit('descend', { from: this.floorIndex });
        this.nextFloor();
        return;
      }
    } else if (target) {
      this.offerProp(target);
    } else if (atStairs) {
      this.prompt = 'лестница закрыта — убей хозяина этажа';
    }
    this.interactPressed = false;
  }

  /** Would picking this up actually do anything right now? */
  pickupUseful(prop) {
    if (prop.kind === 'heal') return this.player.hp < this.player.stats.maxHp;
    if (prop.kind === 'battery') return this.torch.charge < 0.92;
    return true;
  }

  /** Prompt for one interactable and act on it if E was pressed this tick. */
  offerProp(prop) {
    const p = this.player;
    if (prop.type === 'pedestal') {
      if (prop.locked && !this.roomCleared(prop.roomId)) {
        this.prompt = 'сначала зачисти комнату';
        return;
      }
      this.prompt = `E — взять: ${ITEMS[prop.itemId].name}`;
      if (!this.interactPressed) return;
      this.removeProp(prop);
      this.grantItem(prop.itemId);
      return;
    }
    if (prop.type !== 'shop') return;

    const price = prop.price;
    const label = prop.kind === 'item' ? ITEMS[prop.itemId].name
      : prop.kind === 'heal' ? 'аптечка' : 'батарея';
    this.prompt = `E — купить: ${label}  (${price} ◈)`;
    if (!this.interactPressed) return;
    if (p.coins < price) {
      this.prompt = `не хватает осколков: ${p.coins}/${price}`;
      this.sfx('deny');
      return;
    }
    p.coins -= price;
    this.removeProp(prop);
    if (prop.kind === 'item') this.grantItem(prop.itemId);
    else if (prop.kind === 'heal') this.healPlayer(Math.max(4, Math.round(p.stats.maxHp * 0.55)));
    else {
      this.torch.charge = 1;
      this.sfx('reloadTorch');
    }
  }

  removeProp(prop) {
    const i = this.props.indexOf(prop);
    if (i >= 0) this.props.splice(i, 1);
  }

  roomCleared(roomId) {
    return !this.enemies.some((e) => e.alive && e.homeRoom === roomId);
  }

  updateExploration() {
    const gx = this.gridX(this.player.x);
    const gy = this.gridZ(this.player.z);
    for (let y = gy - 3; y <= gy + 3; y++) {
      for (let x = gx - 3; x <= gx + 3; x++) {
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if (!isOpen(this.dungeon.cells[y * GRID_W + x])) continue;
        this.exploredCells.add(y * GRID_W + x);
      }
    }
    const room = roomAtWorld(this.dungeon, this.player.x, this.player.z);
    if (room && !room.seen) {
      room.seen = true;
      runHook(this.player, 'onRoomEnter', { game: this, player: this.player, room });
    }
  }

  updateDynamicLights() {
    this.dynamicLights.length = 0;
    // The way down gets its own lamp, bright once it opens: at this point the
    // player has to find one specific tile in a big dark room.
    const st = this.dungeon.stairs;
    this.dynamicLights.push({
      x: st.x,
      y: 1.1,
      z: st.z,
      r: 0.55, g: 1, b: 0.75,
      radius: st.active ? 15 : 7,
      intensity: st.active ? 2.2 : 0.7,
      flicker: st.active ? 2.4 : 0,
      phase: 0,
    });
    for (const e of this.enemies) {
      if (e.alive && e.light && !e.dormant) this.dynamicLights.push(e.light);
    }
    this.shots.forEach((s) => {
      if (s.lightRadius > 0 && this.dynamicLights.length < 10) {
        this.dynamicLights.push({
          x: s.x, y: s.y, z: s.z,
          r: s.r, g: s.g, b: s.b,
          radius: s.lightRadius, intensity: 0.9, flicker: 0, phase: 0,
        });
      }
    });
  }

  // -------------------------------------------------------------- combat

  spawnShot(team) {
    const s = this.shots.acquire();
    if (!s) return null;
    s.team = team;
    return s;
  }

  cloneShot(src) {
    return cloneShotImpl(this, src);
  }

  nearestEnemy(x, z, range = 20, exclude = null) {
    let best = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.invulnerable || e.disguised) continue;
      if (exclude && exclude.has(e.uid)) continue;
      const d2 = dist2dSq(e.x, e.z, x, z);
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
    if (!opts.trueDamage && e.armor) {
      // Flat subtraction alone is a trap: half the item pool fires many small
      // projectiles — splits, chains, shrapnel, multishot — and armour 3 was
      // eating 43% of everything a late build could put out, which quietly
      // made those items worthless against exactly the enemies they exist for.
      // Armour never takes more than three quarters of a hit.
      dmg = Math.max(dmg * 0.25, dmg - e.armor);
    }
    if (e.frozen > 0) dmg *= 1.25;
    if (this.player.flags.mark && !e.marked) {
      e.marked = true;
      dmg *= this.player.flags.markCrit ? 2.4 : 2;
      opts.crit = true;
    }
    dmg = Math.max(0.5, dmg);

    e.hp -= dmg;
    e.flash = 0.09;
    e.noRegenT = 2.5;
    // Being shot always reveals the player, even from the dark.
    if (opts.source === 'shot' || opts.source === 'chain') {
      e.aggro = 1;
      e.ai.state = 'hunt';
      e.ai.loseT = 6;
    }

    if (opts.knockback) {
      const l = Math.hypot(opts.kx || 0, opts.kz || 0) || 1;
      const k = opts.knockback * (e.isBoss ? 0.05 : 1);
      e.vx += ((opts.kx || 0) / l) * k;
      e.vz += ((opts.kz || 0) / l) * k;
    }
    if (opts.burn) this.applyBurn(e, 3, 3 * opts.burn);
    if (opts.poison && this.rng.chance(opts.poison)) {
      e.poison = Math.max(e.poison, 4);
      e.poisonDps = Math.max(e.poisonDps, 2.5);
    }
    if (opts.freeze && this.rng.chance(opts.freeze)) e.frozen = Math.max(e.frozen, 1.6);
    if (opts.shock && this.rng.chance(opts.shock)) e.stun = Math.max(e.stun, 0.5);

    if (!opts.silent) {
      this.sfx(opts.crit ? 'crit' : 'hit', { x: e.x, y: e.y + e.height * 0.6, z: e.z, gain: opts.crit ? 1 : 0.7 });
      if (opts.crit) runHook(this.player, 'onCrit', { game: this, player: this.player, enemy: e });
    }
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
    e.alive = false;
    e.dying = e.dyingMax;
    e.hp = 0;
    this.stats.kills++;

    if (e.isBoss) {
      this.stats.bossesKilled++;
      this.sfx('bossDie', { x: e.x, y: e.y + 1, z: e.z });
      this.shake(2.2, 1.2, 1);
      this.fx('bossDeath', { x: e.x, y: e.y + 1.5, z: e.z, color: e.tint });
      this.dungeon.stairs.active = true;
      this.bossActive = false;
      this.objective = 'лестница открыта';
      // Killing a floor's owner is the one guaranteed step-up in the run. The
      // item pools are random, so without this the player's health never grows
      // while the monsters' does, and floor 5 is unsurvivable by construction.
      this.player.bonusHp = (this.player.bonusHp || 0) + 2;
      this.player.statsDirty = true;
      recomputeStats(this, this.player);
      this.player.hp = this.player.stats.maxHp;
      this.message('ПУТЬ ВНИЗ ОТКРЫТ', '+2 к здоровью, раны затянулись', 3.4);

      // Boss reward. A big boss dies where it stood, which can be against a
      // wall, so the pedestal has to be placed on ground that exists.
      const spot = findFreeSpot(this.dungeon.cells, e.x + 2, e.z, 0.6, this.rng);
      this.addProp({ type: 'pedestal', x: spot.x, z: spot.z, itemId: this.pickItem('boss') });
      for (let i = 0; i < 6; i++) {
        this.dropPickup(e.x + this.rng.range(-2, 2), e.z + this.rng.range(-2, 2), 'shard');
      }
      this.dropPickup(e.x - 2, e.z, 'battery');
      this.events.emit('bossDown', { floor: this.floorIndex });
    } else {
      if (!opts.silent) this.sfx('enemyDie', { x: e.x, y: e.y + 0.6, z: e.z });
      this.fx('death', { x: e.x, y: e.y + e.height * 0.5, z: e.z, color: e.tint });
    }

    const d = e.def && e.def.onDeath;
    if (d) {
      if (d.split) {
        for (let i = 0; i < d.split.count; i++) {
          const a = (i / d.split.count) * Math.PI * 2;
          const spot = findFreeSpot(this.dungeon.cells, e.x + Math.cos(a) * 1.2, e.z + Math.sin(a) * 1.2, 0.5, this.rng);
          const child = createEnemy(d.split.id, spot.x, spot.z, { hpScale: d.split.hpScale, fromSpawn: true });
          child.homeRoom = e.homeRoom;
          child.ai.state = 'hunt';
          this.enemies.push(child);
        }
      }
      if (d.cloud) {
        this.spawnPuddle(e.x, e.z, {
          radius: d.cloud.radius, time: d.cloud.time, damage: d.cloud.damage, fire: d.cloud.fire, team: TEAM.ENEMY,
        });
      }
    }

    runHook(this.player, 'onKill', { game: this, player: this.player, enemy: e });

    if (!e.fromSpawn) {
      const luck = this.player.stats.luck;
      const chance = (e.elite ? 0.7 : 0.2) + luck * 0.02;
      if (this.rng.chance(chance)) {
        this.dropPickup(e.x, e.z, this.rng.pick(['shard', 'shard', 'shard', 'heal', 'heal', 'battery']));
      }
    }

    if (chargeActive(this.player, 1)) this.events.emit('activeReady', {});

    // A room counts as cleared the moment its last resident dies. (This used
    // to report the number of corpses still playing their death animation.)
    if (e.homeRoom != null && e.homeRoom >= 0 && this.roomCleared(e.homeRoom)) {
      const room = this.dungeon.rooms[e.homeRoom];
      if (room && !room.cleared) {
        room.cleared = true;
        this.stats.roomsCleared++;
        this.rewardRoom(room, e);
        runHook(this.player, 'onRoomClear', { game: this, player: this.player, room });
      }
    }
  }

  /**
   * Emptying a room is the game's unit of progress, so it has to pay. Without
   * this the only healing on a floor is whatever the generator happened to
   * scatter, and attrition kills every run regardless of how well it is played.
   */
  rewardRoom(room, lastKill) {
    const x = lastKill ? lastKill.x : room.world().x;
    const z = lastKill ? lastKill.z : room.world().z;
    this.sfx('confirm', { gain: 0.5 });
    this.dropPickup(x, z, 'shard');
    const luck = this.player.stats.luck || 0;
    if (this.rng.chance(0.45 + luck * 0.03)) this.dropPickup(x + 0.8, z, 'heal');
    if (this.rng.chance(0.3)) this.dropPickup(x - 0.8, z, 'battery');
    if (room.kind === ROOM_KIND.CHALLENGE) this.dropPickup(x, z + 0.8, 'heal');
  }

  damageEnemiesNear(x, z, radius, amount, source, stun = 0) {
    let any = false;
    for (const e of this.enemies) {
      if (!e.alive || e.invulnerable) continue;
      const d = dist2d(e.x, e.z, x, z);
      if (d > radius + e.radius) continue;
      this.damageEnemy(e, amount, {
        source, silent: true, knockback: 4, kx: e.x - x, kz: e.z - z,
      });
      if (stun) e.stun = Math.max(e.stun, stun);
      any = true;
    }
    if (any) this.sfx('hit', { x, y: 1, z, gain: 0.6 });
    return any;
  }

  pullEnemiesToward(x, z, radius, force) {
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss) continue;
      const dx = x - e.x;
      const dz = z - e.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 0.1) continue;
      const k = force * (1 - d / radius);
      moveBody(this.dungeon.cells, e, (dx / d) * k, (dz / d) * k, { flying: e.flying });
    }
  }

  explode(x, y, z, radius, damage, team, opts = {}) {
    this.fx('explosion', { x, y, z, radius, color: opts.color });
    this.sfx('explode', { x, y, z });
    this.shake(1.0, 0.3);
    if (team === TEAM.PLAYER) {
      this.damageEnemiesNear(x, z, radius, damage, 'explosion', opts.stun || 0);
    } else if (!this.player.dead) {
      const p = this.player;
      if (dist2d(p.x, p.z, x, z) < radius + p.radius) {
        this.damagePlayer(Math.max(1, Math.round(damage * 0.7)), { source: 'explosion' });
      }
    }
    if (opts.napalm) {
      this.spawnPuddle(x, z, { radius: radius * 0.8, time: 4, damage: 2, fire: true, team });
    }
    this.alertNearby(x, z, 20);
  }

  spawnBurst(x, y, z, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const s = this.spawnShot(o.team == null ? TEAM.PLAYER : o.team);
      if (!s) return;
      const a = (i / count) * Math.PI * 2;
      s.x = s.px = x;
      s.y = s.py = y;
      s.z = s.pz = z;
      s.speed = o.speed || 18;
      s.vx = Math.cos(a) * s.speed;
      s.vy = 0;
      s.vz = Math.sin(a) * s.speed;
      s.damage = o.damage || 3;
      s.radius = 0.14;
      s.size = 0.3;
      s.life = s.maxLife = 0.45;
      s.freeze = o.freeze || 0;
      s.burn = o.burn || 0;
      s.r = o.r == null ? 1 : o.r;
      s.g = o.g == null ? 1 : o.g;
      s.b = o.b == null ? 1 : o.b;
      s.sprite = SPRITE.SHARD;
    }
  }

  spawnPuddle(x, z, o) {
    this.areas.push({
      x, z,
      radius: o.radius || 2,
      time: o.time || 4,
      damage: o.damage || 1,
      fire: !!o.fire,
      team: o.team == null ? TEAM.ENEMY : o.team,
      color: o.fire ? [1, 0.5, 0.15] : [0.6, 1, 0.3],
      t: 0,
      tick: 0,
    });
  }

  breakRubble(x, z) {
    const gx = this.gridX(x);
    const gy = this.gridZ(z);
    if (gx <= 0 || gy <= 0 || gx >= GRID_W - 1 || gy >= GRID_H - 1) return;
    const i = gy * GRID_W + gx;
    if (this.dungeon.cells[i] !== C.RUBBLE) return;
    this.dungeon.cells[i] = C.FLOOR;
    this.sfx('rubble', { x, y: 1, z });
    this.fx('rubble', { x: (gx + 0.5) * CELL, y: 1, z: (gy + 0.5) * CELL });
    this.events.emit('levelChanged', {});
    if (this.rng.chance(0.25)) this.dropPickup((gx + 0.5) * CELL, (gy + 0.5) * CELL, 'shard');
  }

  /** Wake every monster within radius — explosions and screams carry. */
  alertNearby(x, z, radius, opts = {}) {
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss) continue;
      if (dist2dSq(e.x, e.z, x, z) > radius * radius) continue;
      e.aggro = 1;
      e.ai.state = 'hunt';
      e.ai.loseT = 6;
      e.ai.lastSeenX = x;
      e.ai.lastSeenZ = z;
      // A decoy has to out-shout the player, or it is only a firework.
      if (opts.toward) e.ai.decoy = opts.toward;
    }
  }

  claimPackToken(e) {
    if (this.packToken.holder && this.packToken.holder !== e) return false;
    this.packToken.holder = e;
    this.packToken.t = 0.7;
    return true;
  }

  spawnMinions(source, cfg) {
    const max = cfg.max || 8;
    const current = this.enemies.filter((e) => e.alive && e.id === cfg.id).length;
    const n = Math.min(cfg.count || 1, Math.max(0, max - current));
    for (let i = 0; i < n; i++) {
      const a = this.rng.angle();
      const spot = findFreeSpot(
        this.dungeon.cells,
        source.x + Math.cos(a) * 2,
        source.z + Math.sin(a) * 2,
        0.5,
        this.rng,
      );
      const e = createEnemy(cfg.id, spot.x, spot.z, { hpScale: 0.85, fromSpawn: true });
      e.homeRoom = source.homeRoom;
      e.ai.state = 'hunt';
      e.aggro = 1;
      this.enemies.push(e);
      this.fx('spawn', { x: spot.x, y: 0.8, z: spot.z, color: e.tint });
    }
  }

  /**
   * A noisemaker that keeps screaming: one alert pulse would be over before
   * the player could use the opening, so it lives for `time` seconds and pulls
   * monsters in on a beat.
   */
  spawnDecoy(time) {
    const p = this.player;
    const dir = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    const spot = findFreeSpot(this.dungeon.cells, p.x + dir.x * 6, p.z + dir.z * 6, 0.4, this.rng);
    this.decoys.push({ x: spot.x, z: spot.z, t: time, tick: 0 });
    this.fx('spawn', { x: spot.x, y: 0.8, z: spot.z, color: [1, 0.9, 0.4] });
    this.sfx('charge', { x: spot.x, y: 0.8, z: spot.z, gain: 0.8 });
  }

  updateDecoys(dt) {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.decoys.splice(i, 1);
        continue;
      }
      d.tick -= dt;
      if (d.tick > 0) continue;
      d.tick = 0.7;
      this.alertNearby(d.x, d.z, 22, { toward: d });
      this.sfx('coin', { x: d.x, y: 0.8, z: d.z, gain: 0.5 });
      this.fx('spawn', { x: d.x, y: 0.6, z: d.z, color: [1, 0.9, 0.4] });
    }
  }

  blinkPlayer(distance) {
    const p = this.player;
    const dir = aimDirection(p);
    const hit = raycast(this.dungeon.cells, p.x, p.z, dir.x, dir.z, distance, {});
    const d = Math.max(0, (hit.hit ? hit.dist : distance) - 0.6);
    if (d < 1) return false;
    p.x += dir.x * d;
    p.z += dir.z * d;
    p.px = p.x;
    p.pz = p.z;
    this.fx('teleport', { x: p.x, y: p.y + 1, z: p.z, color: [0.7, 0.6, 1] });
    this.sfx('teleport');
    return true;
  }

  // -------------------------------------------------------------- player

  damagePlayer(amount, opts = {}) {
    const p = this.player;
    if (p.dead) return 0;
    if (!opts.ignoreInvuln && p.invuln > 0) return 0;

    if (p.flags.wardPerRoom && !p.wardUsed) {
      p.wardUsed = true;
      p.invuln = 0.9;
      this.sfx('block');
      return 0;
    }

    let dmg = Math.max(1, Math.round(amount));
    if (p.stats.armor > 0) dmg = Math.max(1, dmg - Math.floor(p.stats.armor / 2));
    if (p.flags.glass) dmg = 99;

    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      p.hp -= dmg;
      this.stats.damageTaken += dmg;
    }
    p.invuln = 0.75;
    p.hurtFlash = 0.85;
    p.calmT = 0;
    p.regenT = 0;
    p.statsDirty = true;
    this.sfx('hurt');
    this.shake(1.1, 0.35, 0.4);
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
    if (healed > 0) {
      this.fx('heal', { x: p.x, y: p.y + 1, z: p.z });
      this.sfx('heal');
    }
    return healed;
  }

  killPlayer() {
    const p = this.player;
    if (p.flags.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.max(2, Math.round(p.stats.maxHp * 0.4));
      p.invuln = 3;
      this.shots.clear();
      this.fx('heal', { x: p.x, y: p.y + 1, z: p.z });
      this.sfx('synergy');
      this.message('ПОСЛЕДНИЙ СВЕТ ВСПЫХНУЛ', '', 2.4);
      return;
    }
    p.dead = true;
    p.hp = 0;
    this.state = STATE.DEAD;
    this.sfx('death');
    this.shake(2, 1);
    this.events.emit('death', { stats: this.stats });
  }

  // ------------------------------------------------------------- pickups

  dropPickup(x, z, kind) {
    const spot = findFreeSpot(this.dungeon.cells, x, z, 0.3, this.rng);
    return this.addProp({ type: 'pickup', kind, x: spot.x, z: spot.z });
  }

  collectPickup(prop) {
    const p = this.player;
    switch (prop.kind) {
      case 'shard':
        p.coins += 1;
        this.sfx('coin');
        break;
      case 'heal':
        this.healPlayer(Math.max(4, Math.round(this.player.stats.maxHp * 0.5)));
        break;
      case 'battery':
        this.torch.charge = Math.min(1, this.torch.charge + 0.45);
        this.sfx('reloadTorch');
        break;
      default:
        this.sfx('pickup');
    }
    this.fx('pickup', { x: prop.x, y: prop.y, z: prop.z, color: [1, 0.9, 0.5] });
  }

  pickItem(pool) {
    const candidates = ITEM_IDS.filter(
      (id) => ITEMS[id].pools.includes(pool) && !this.seenItems.has(id) && !hasItem(this.player.inv, id),
    );
    const list = candidates.length ? candidates : ITEM_IDS.filter((id) => ITEMS[id].pools.includes(pool));
    if (!list.length) return ITEM_IDS[0];
    const luck = this.player.stats ? this.player.stats.luck : 0;
    const id = this.rng.weighted(list, (i) => {
      const q = ITEMS[i].quality || 1;
      return Math.max(0.2, 1 + (q - 2) * (0.2 + luck * 0.05));
    });
    this.seenItems.add(id);
    return id;
  }

  grantItem(id) {
    const news = addItem(this, this.player, id);
    this.stats.itemsTaken++;
    this.sfx('item');
    const item = ITEMS[id];
    this.message(item.name, item.desc, 3.4);
    if (news.length) {
      this.sfx('synergy');
      for (const s of news) this.message(`★ ${s.name}`, s.desc, 4);
      this.events.emit('synergy', { synergies: news });
    }
    this.events.emit('itemGet', { id, item, synergies: news });
  }

  // ---------------------------------------------------------------- misc

  fx(type, data) {
    this.events.emit('fx', { type, ...data });
  }

  sfx(name, opts) {
    this.events.emit('sfx', { name, opts });
  }

  shake(mag, time, glitch = 0) {
    if (mag > this.shakeMag || this.shakeT <= 0) {
      this.shakeMag = mag;
      this.shakeT = time;
    }
    if (glitch) this.events.emit('shake', { glitch });
  }

  message(title, sub, time = 2.5) {
    this.messages.push({ title, sub: sub || '', time, t: 0 });
    while (this.messages.length > 2) this.messages.shift();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) {
      this.state = STATE.PAUSED;
      this.events.emit('pause', {});
    } else if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      this.events.emit('resume', {});
    }
  }
}
