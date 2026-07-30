/**
 * A head-less player (development only).
 *
 * The simulation core has no browser dependencies, so it can be driven
 * straight from Node. This bot feeds it ordinary InputSnapshots — the same
 * shape the browser adapter produces — which makes it useful for two things
 * the old harness could not do:
 *
 *   - answering balance questions ("can a competent player clear floor 3?")
 *     by playing thousands of runs in seconds;
 *   - catching soft-locks, because a bot that cannot reach the stairs reports
 *     it instead of quietly wandering.
 *
 * It is deliberately an *average* player: it does not dodge bullets, it does
 * not kite, and it walks into lava if the path goes that way. Numbers measured
 * against it are a floor, not a ceiling.
 */
import { GRID_W, GRID_H, CELL, C } from '../src/core/constants.js';
import { STATE } from '../src/core/game.js';
import { hasLineOfSight } from '../src/core/world/collision.js';
import { angleDelta } from '../src/core/math3.js';

// Roughly what a mouse player manages: a fast flick, a tight cone, and enough
// lead on a moving target to hit it. The bot has to be *competent* or every
// balance number measured against it is meaningless.
const TURN_RATE = 9;          // radians per second the bot can swing its aim
const FIRE_CONE = 0.22;       // how closely it must be on target before firing

/** Costs used by the bot's own path search — it prefers not to stand in lava. */
function stepCost(cell) {
  if (cell === C.SOLID || cell === C.RUBBLE || cell === C.PIT) return -1;
  if (cell === C.HAZARD) return 14;
  return 1;
}

/**
 * Distance field to one goal cell, so the bot can walk downhill to it. Uses a
 * small bucket queue because hazard cells cost more than plain floor.
 */
function fieldTo(cells, gx, gy) {
  const dist = new Int32Array(GRID_W * GRID_H).fill(0x7fffffff);
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return dist;
  const start = gy * GRID_W + gx;
  if (stepCost(cells[start]) < 0) return dist;
  dist[start] = 0;
  // Dial queue: costs are tiny integers, so buckets beat a binary heap here.
  const buckets = [[start]];
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const cur = bucket[i];
      if (dist[cur] !== d) continue;
      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        const c = stepCost(cells[ni]);
        if (c < 0) continue;
        const nd = d + c;
        if (nd >= dist[ni]) continue;
        dist[ni] = nd;
        while (buckets.length <= nd) buckets.push(null);
        if (!buckets[nd]) buckets[nd] = [];
        buckets[nd].push(ni);
      }
    }
  }
  return dist;
}

function descend(dist, gx, gy) {
  const here = dist[gy * GRID_W + gx];
  if (here === 0x7fffffff || here === 0) return null;
  let best = here;
  let bx = 0;
  let by = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = gx + ox;
      const ny = gy + oy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (ox && oy) {
        if (dist[gy * GRID_W + nx] === 0x7fffffff) continue;
        if (dist[ny * GRID_W + gx] === 0x7fffffff) continue;
      }
      const d = dist[ny * GRID_W + nx];
      if (d < best) {
        best = d;
        bx = ox;
        by = oy;
      }
    }
  }
  if (!bx && !by) return null;
  return { x: bx, z: by };
}

export class Bot {
  constructor(game, opts = {}) {
    this.game = game;
    this.input = {
      move: { x: 0, z: 0 },
      look: { dx: 0, dy: 0 },
      down: Object.create(null),
      pressed: Object.create(null),
      pointerLocked: true,
      gamepad: false,
    };
    this.goal = null;
    this.healing = null;
    this.field = null;
    this.fieldKey = '';
    this.replanT = 0;
    this.goalT = 0;
    this.giveUp = new Set();
    this.stuckT = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.unstickT = 0;
    this.unstickDir = 0;
    // A cautious bot never buys anything; a reckless one never retreats.
    this.buy = opts.buy !== false;
    this.useActives = opts.useActives !== false;
    // 0 disables backing off entirely, which is the "walks into everything"
    // baseline. Anything above it is a player who keeps their distance.
    this.standoff = opts.standoff == null ? 6.5 : opts.standoff;
    this.chase = false;
    // An explorer clears the floor; a runner heads straight for the lair. The
    // difference measures how much of the difficulty is optional.
    this.explore = opts.explore !== false;
    this.orbit = 1;
  }

  /**
   * Combat manoeuvring ignores the path field, which means backing away from
   * a monster happily backs into lava. Nudge the chosen heading toward the
   * nearest clean ground when the next step would land in a hazard.
   */
  avoidHazard(dir) {
    const g = this.game;
    const p = this.game.player;
    const probe = (ox, oz) => {
      const gx = Math.floor((p.x + ox * 2.2) / CELL);
      const gy = Math.floor((p.z + oz * 2.2) / CELL);
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
      return stepCost(g.dungeon.cells[gy * GRID_W + gx]) === 1;
    };
    if (probe(dir.x, dir.z)) return dir;
    // Fan out from the intended heading and take the first clean direction.
    const base = Math.atan2(dir.x, dir.z);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, Math.PI]) {
      const a = base + off;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      if (probe(nx, nz)) return { x: nx, z: nz };
    }
    return dir;
  }

  /** How far the player's shots actually carry, in world units. */
  reach() {
    const st = this.game.player.stats;
    return st.range * st.shotSpeed * 0.9;
  }

  /**
   * The nearest monster the player can actually see. Line of sight matters:
   * without it the bot charges walls at things in the next room and never
   * moves again.
   */
  nearestThreat() {
    const g = this.game;
    const p = g.player;
    let best = null;
    let bestD = Infinity;
    for (const e of g.enemies) {
      if (!e.alive || e.dormant || e.hidden || e.disguised) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d >= bestD || d > 34) continue;
      if (!hasLineOfSight(g.dungeon.cells, p.x, p.z, e.x, e.z, {})) continue;
      bestD = d;
      best = e;
    }
    return best ? { e: best, d: Math.max(0.01, bestD) } : null;
  }

  /** One simulation tick. Returns the game state after stepping. */
  tick(dt) {
    const g = this.game;
    const inp = this.input;
    inp.pressed = Object.create(null);
    inp.down.fire = false;
    inp.down.sprint = false;
    inp.move.x = 0;
    inp.move.z = 0;
    inp.look.dx = 0;
    inp.look.dy = 0;

    if (g.state !== STATE.PLAYING) {
      g.step(dt, inp);
      return g.state;
    }

    const p = g.player;
    this.plan(dt);
    this.steer(dt);
    this.aimAndShoot(dt);

    if (g.prompt && g.prompt.startsWith('E')) {
      const affordable = !g.prompt.includes('◈') || this.buy;
      if (affordable) {
        inp.pressed.interact = true;
        g.interactPressed = true;
      }
    }
    if (this.useActives && p.inv.activeCharge >= p.inv.activeMax && p.inv.activeMax > 0) {
      inp.pressed.use = true;
    }

    g.step(dt, inp);
    return g.state;
  }

  // ------------------------------------------------------------------ goals

  plan(dt) {
    const g = this.game;
    const p = g.player;
    this.replanT -= dt;

    // Wedged against geometry: back out and pick a new goal rather than
    // grinding into a corner for the rest of the run.
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x;
    this.lastZ = p.z;
    if (moved < 0.004) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 0.9) {
      this.stuckT = 0;
      this.unstickT = 0.5;
      this.unstickDir = Math.random() < 0.5 ? 1 : -1;
      this.replanT = 0;
      this.goal = null;
    }

    // Standing on a goal that never resolves — a challenge pedestal behind
    // live monsters, an unaffordable shop stand — is the main way a bot wastes
    // a run. Give up on one after a while and go somewhere else.
    this.goalT += dt;
    if (this.goalT > 10) {
      this.giveUp.add(this.fieldKey);
      this.goal = null;
      this.replanT = 0;
      this.goalT = 0;
    }

    if (this.replanT > 0 && this.goal) return;
    this.replanT = 0.5;

    const d = g.dungeon;
    let goal = null;

    // Hurt and there is a medkit on the floor somewhere: go and get it. A
    // player who never breaks off to heal simply bleeds out, and measuring
    // the game against that is measuring the wrong thing.
    this.healing = null;
    if (p.hp < p.stats.maxHp * 0.55) {
      let bestHeal = null;
      let bestHealD = 60 * 60;
      for (const prop of g.props) {
        if (prop.type !== 'pickup' || prop.kind !== 'heal') continue;
        const dd = (prop.x - p.x) ** 2 + (prop.z - p.z) ** 2;
        if (dd < bestHealD) {
          bestHealD = dd;
          bestHeal = prop;
        }
      }
      if (bestHeal) this.healing = bestHeal;
    }

    if (this.healing) {
      goal = { x: Math.floor(this.healing.x / CELL), y: Math.floor(this.healing.z / CELL) };
    } else if (d.stairs.active) {
      goal = { x: d.stairs.gx, y: d.stairs.gy };
    } else if (!this.explore) {
      const lair = d.rooms[d.bossRoom];
      goal = { x: lair.cx, y: lair.cy };
    } else {
      // Nearest prop it can actually do something with, otherwise the
      // least-explored room, and the boss lair once everything has been seen.
      let best = null;
      let bestD = Infinity;
      for (const prop of g.props) {
        if (!this.actionable(prop)) continue;
        const key = `${Math.floor(prop.x / CELL)},${Math.floor(prop.z / CELL)},${g.floorIndex}`;
        if (this.giveUp.has(key)) continue;
        const dd = (prop.x - p.x) ** 2 + (prop.z - p.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = prop;
        }
      }
      if (best) goal = { x: Math.floor(best.x / CELL), y: Math.floor(best.z / CELL) };
      else {
        const room = d.rooms.find((r) => !r.seen && !this.giveUp.has(`${r.cx},${r.cy},${g.floorIndex}`))
          || d.rooms[d.bossRoom];
        goal = { x: room.cx, y: room.cy };
      }
    }

    const key = `${goal.x},${goal.y},${g.floorIndex}`;
    if (key !== this.fieldKey) {
      this.field = fieldTo(d.cells, goal.x, goal.y);
      this.fieldKey = key;
      this.goalT = 0;
    }
    this.goal = goal;
  }

  /** Is walking to this prop going to achieve anything? */
  actionable(prop) {
    const g = this.game;
    // A medkit at full health is not a goal — it is a thing to come back for.
    if (prop.type === 'pickup') return g.pickupUseful(prop);
    if (prop.type === 'pedestal') return !prop.locked || g.roomCleared(prop.roomId);
    if (prop.type === 'shop') return this.buy && g.player.coins >= prop.price;
    return false;
  }

  steer(dt) {
    const g = this.game;
    const p = g.player;
    const inp = this.input;
    if (!this.field) return;

    let dir = descend(this.field, Math.floor(p.x / CELL), Math.floor(p.z / CELL));

    // Fighting overrides travelling. A player holds a band around the thing
    // shooting at them: back off when it closes, walk it down when it drifts
    // out of weapon reach, circle when it is where they want it. Without the
    // "walk it down" half the bot simply outruns slow bosses forever.
    // Retreating to a medkit outranks holding a firing line.
    const threat = this.healing ? null : this.nearestThreat();
    this.chase = false;
    if (threat) {
      const reach = this.reach();
      const away = { x: (p.x - threat.e.x) / threat.d, z: (p.z - threat.e.z) / threat.d };
      const strafe = { x: -away.z * this.orbit, z: away.x * this.orbit };
      if (this.standoff > 0 && threat.d < this.standoff) {
        const blend = 1 - threat.d / this.standoff;
        dir = {
          x: away.x * blend + strafe.x * 0.7 + (dir ? dir.x : 0) * (1 - blend),
          z: away.z * blend + strafe.z * 0.7 + (dir ? dir.z : 0) * (1 - blend),
        };
      } else if (threat.d > reach * 0.6) {
        dir = { x: -away.x, z: -away.z };
        this.chase = true;
      } else if (this.standoff > 0) {
        dir = strafe;
      }
    }

    if (this.unstickT > 0) {
      this.unstickT -= dt;
      this.orbit = -this.orbit;
      dir = { x: Math.cos(p.yaw) * this.unstickDir, z: -Math.sin(p.yaw) * this.unstickDir };
    }
    if (!dir) return;
    dir = this.avoidHazard(dir);

    const len = Math.hypot(dir.x, dir.z) || 1;
    const wx = dir.x / len;
    const wz = dir.z / len;
    // Camera-relative: forward is -move.z, right is +move.x.
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    inp.move.z = -(wx * sinY + wz * cosY);
    inp.move.x = -wx * cosY + wz * sinY;
    // Sprint when nothing is close, and also when running down something that
    // is outpacing us — several bosses move faster than a walk, and a bot that
    // never sprints simply loses them.
    const chasing = this.chase && p.stamina > 1.5;
    inp.down.sprint = chasing || (p.stamina > 2 && !g.enemies.some((e) => e.alive && !e.dormant
      && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 100));
  }

  aimAndShoot(dt) {
    const g = this.game;
    const p = g.player;
    const inp = this.input;

    const engage = this.reach();
    let target = null;
    let bestD = engage * engage;
    for (const e of g.enemies) {
      if (!e.alive || e.hidden || e.dormant || e.disguised || e.invulnerable) continue;
      const dd = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      if (dd >= bestD) continue;
      if (!hasLineOfSight(g.dungeon.cells, p.x, p.z, e.x, e.z, {})) continue;
      bestD = dd;
      target = e;
    }

    let wantYaw;
    let wantPitch = 0;
    if (target) {
      // Lead the target by its own velocity over the projectile's flight time.
      const dist = Math.sqrt(bestD);
      const lead = Math.min(0.6, dist / Math.max(1, p.stats.shotSpeed));
      wantYaw = Math.atan2(
        target.x + (target.vx || 0) * lead - p.x,
        target.z + (target.vz || 0) * lead - p.z,
      );
      // Aim at the body, not the horizon. Most of the bestiary is knee-high,
      // and a shot leaves at eye level: firing flat sails clean over it.
      const aimY = target.y + target.height * 0.5;
      wantPitch = Math.atan2((p.y + p.eyeHeight) - aimY, Math.max(0.5, dist));
    } else if (inp.move.x || inp.move.z) {
      // Face where it is walking, so the torch lights the way.
      const sinY = Math.sin(p.yaw);
      const cosY = Math.cos(p.yaw);
      const wx = sinY * -inp.move.z + -cosY * inp.move.x;
      const wz = cosY * -inp.move.z + sinY * inp.move.x;
      wantYaw = Math.atan2(wx, wz);
    } else {
      return;
    }

    const delta = angleDelta(p.yaw, wantYaw);
    const turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, delta));
    inp.look.dx = -turn;

    const dPitch = wantPitch - p.pitch;
    inp.look.dy = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, dPitch));

    if (target && Math.abs(delta) < FIRE_CONE && Math.abs(dPitch) < FIRE_CONE && !p.overheated) {
      inp.down.fire = true;
    }
  }
}

/**
 * Play one run to its end.
 * @returns {{state:string, floor:number, kills:number, items:number,
 *            seconds:number, hp:number, stalled:boolean}}
 */
export function playRun(game, seed, opts = {}) {
  const limit = opts.seconds || 420;
  const dt = 1 / 60;
  game.startRun(seed);
  const bot = new Bot(game, opts);
  bot.lastX = game.player.x;
  bot.lastZ = game.player.z;

  const perFloor = [];
  let floor = game.floorIndex;
  let floorStart = 0;
  let t = 0;
  let state = STATE.PLAYING;

  for (; t < limit; t += dt) {
    state = bot.tick(dt);
    if (game.floorIndex !== floor) {
      perFloor.push({ floor, seconds: t - floorStart });
      floor = game.floorIndex;
      floorStart = t;
    }
    if (state === STATE.DEAD || state === STATE.WIN) break;
  }

  return {
    state,
    floor: game.stats.floorReached,
    bosses: game.stats.bossesKilled,
    kills: game.stats.kills,
    items: game.stats.itemsTaken,
    coins: game.player.coins,
    seconds: t,
    hp: Math.max(0, game.player.hp),
    torch: game.torch.charge,
    stalled: state === STATE.PLAYING,
    perFloor,
  };
}
