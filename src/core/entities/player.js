/**
 * The player character: movement, dash, aiming and the firing cadence.
 *
 * Reads only the neutral InputSnapshot, so the same code runs under keyboard,
 * gamepad or an automated test harness feeding synthetic input.
 */
import { TILE, ROOM_W, ROOM_H, TEAM } from '../constants.js';
import { createInventory, recomputeStats, runHook, useActive } from '../items/inventory.js';
import { fireVolley } from '../items/shots.js';
import { moveEntity, hazardAt } from '../world/collision.js';
import { norm, clamp, angleDelta } from '../math.js';

export function createPlayer(x, y) {
  const p = {
    kind: 'player',
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    radius: 8,
    facing: 1,
    aim: 0,
    aimValid: false,

    hp: 6,
    shield: 0,
    invuln: 0,
    hurtFlash: 0,
    dead: false,

    coins: 0,
    keys: 1,
    bombs: 2,

    shootCd: 0,
    charge: 0,
    charging: false,
    echoQueue: [],

    dashCd: 0,
    dashT: 0,
    dashDirX: 0,
    dashDirY: 0,
    dashGhosts: [],

    walkPhase: 0,
    bobPhase: 0,
    idleT: 0,

    inv: createInventory(),
    stats: null,
    flags: Object.create(null),
    counters: Object.create(null),
    timers: Object.create(null),
    statsDirty: true,

    wardUsed: false,
    reviveUsed: false,
    familiars: [],
    orbitals: [],
    allies: [],
  };
  return p;
}

const TIMER_KEYS = ['fury', 'harvest', 'chaos', 'donation'];

export function updatePlayer(game, p, dt, input) {
  p.px = p.x;
  p.py = p.y;

  for (const k of TIMER_KEYS) {
    if (p.timers[k] > 0) {
      p.timers[k] -= dt;
      if (p.timers[k] <= 0) {
        p.timers[k] = 0;
        p.statsDirty = true;
      }
    }
  }
  if (p.statsDirty) recomputeStats(game, p);
  const st = p.stats;

  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (p.dashCd > 0) p.dashCd -= dt;

  // ---- movement --------------------------------------------------------
  const mv = input.move;
  const moving = mv.x !== 0 || mv.y !== 0;

  if (p.dashT > 0) {
    p.dashT -= dt;
    const speed = st.dashPower * (0.4 + p.dashT / (0.22 + 0.0001));
    const ghost = { x: p.x, y: p.y, t: 0.22 };
    if (p.dashGhosts.length < 8) p.dashGhosts.push(ghost);
    moveEntity(game.room.tiles, p, p.dashDirX * Math.min(speed, 620) * dt, p.dashDirY * Math.min(speed, 620) * dt, {
      ghost: false,
      flying: !!p.flags.phaseDash,
    });
    if (p.flags.dashDamage) {
      game.damageEnemiesNear(p.x, p.y, p.radius + 10, (3 + st.damage) * p.flags.dashDamage, 'dash');
    }
  } else {
    const accel = moving ? 1400 : 1900;
    const targetVx = mv.x * st.moveSpeed;
    const targetVy = mv.y * st.moveSpeed;
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt * 0.0016);
    p.vy += (targetVy - p.vy) * Math.min(1, accel * dt * 0.0016);
    if (Math.abs(p.vx) < 1) p.vx = 0;
    if (Math.abs(p.vy) < 1) p.vy = 0;
    moveEntity(game.room.tiles, p, p.vx * dt, p.vy * dt, {});
  }

  if (moving) {
    p.walkPhase += dt * 9;
    p.idleT = 0;
    if (mv.x !== 0) p.facing = Math.sign(mv.x);
  } else {
    p.idleT += dt;
    p.walkPhase = 0;
  }
  p.bobPhase += dt * 3.2;

  for (let i = p.dashGhosts.length - 1; i >= 0; i--) {
    p.dashGhosts[i].t -= dt;
    if (p.dashGhosts[i].t <= 0) p.dashGhosts.splice(i, 1);
  }

  // ---- dash ------------------------------------------------------------
  if (input.pressed.dash && p.dashCd <= 0 && p.dashT <= 0) {
    let dx = mv.x;
    let dy = mv.y;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(p.aim);
      dy = Math.sin(p.aim);
    }
    const d = norm(dx, dy);
    p.dashDirX = d.x;
    p.dashDirY = d.y;
    p.dashT = 0.19;
    p.dashCd = st.dashCooldown;
    p.invuln = Math.max(p.invuln, 0.26);
    game.sfx('dash');
    runHook(p, 'onDash', { game, player: p });
  }

  // ---- aiming ----------------------------------------------------------
  let aimX = input.shoot.x;
  let aimY = input.shoot.y;
  let wantShoot = input.shooting;

  if ((aimX === 0 && aimY === 0) && input.pointer) {
    const dx = input.pointer.x - p.x;
    const dy = input.pointer.y - p.y;
    if (Math.hypot(dx, dy) > 1) {
      const n = norm(dx, dy);
      aimX = n.x;
      aimY = n.y;
    }
  }
  if (aimX !== 0 || aimY !== 0) {
    p.aim = Math.atan2(aimY, aimX);
    p.aimValid = true;
  }

  // ---- shooting --------------------------------------------------------
  if (p.shootCd > 0) p.shootCd -= dt;

  // `roomLocked` only closes the doors — it must never gate firing.
  const canShoot = !p.dead;
  if (p.flags.charged) {
    if (wantShoot && canShoot) {
      p.charging = true;
      p.charge += dt * (p.flags.fastCharge ? 2 : 1);
      if (p.charge > 1.15) p.charge = 1.15;
    } else if (p.charging) {
      p.charging = false;
      const c = p.charge;
      p.charge = 0;
      if (c > 0.65 && canShoot) {
        if (p.flags.laser) {
          game.firePlayerLaser(p.aim, c);
        } else {
          fireVolley(game, p, p.aim, { charge: 1 + c * 1.6 });
          game.sfx('shootHeavy');
        }
        p.shootCd = 1 / p.stats.fireRate;
      } else if (canShoot && p.shootCd <= 0) {
        fireVolley(game, p, p.aim);
        game.sfx('shoot');
        p.shootCd = 1 / p.stats.fireRate;
      }
    }
  } else if (wantShoot && canShoot && p.shootCd <= 0 && p.aimValid) {
    fireVolley(game, p, p.aim);
    game.sfx('shoot');
    p.shootCd = 1 / st.fireRate;
  }

  // Echo queue: a second volley a beat later.
  for (let i = p.echoQueue.length - 1; i >= 0; i--) {
    const q = p.echoQueue[i];
    q.t -= dt;
    if (q.t <= 0) {
      fireVolley(game, p, q.angle, { charge: q.charge * 0.85 });
      p.echoQueue.splice(i, 1);
    }
  }

  // ---- consumables & actives ------------------------------------------
  if (input.pressed.bomb && p.bombs > 0 && !game.roomLocked) {
    p.bombs--;
    game.placeBomb(p.x, p.y);
  }
  if (input.pressed.use) {
    if (useActive(game, p)) game.sfx('confirm');
    else game.sfx('deny');
  }

  // ---- passive effects -------------------------------------------------
  if (p.flags.rootShield) {
    if (!moving) {
      p.rootT = (p.rootT || 0) + dt;
      if (p.rootT > 1.2 && p.shield < 2) {
        p.rootT = 0;
        p.shield++;
        game.sfx('block', { gain: 0.4 });
      }
    } else {
      p.rootT = 0;
    }
  }

  if (hazardAt(game.room.tiles, p.x, p.y) && !p.flags.fireImmune && p.dashT <= 0) {
    p.hazardAccum = (p.hazardAccum || 0) + dt;
    if (p.hazardAccum > 0.55) {
      p.hazardAccum = 0;
      game.damagePlayer(1, { source: 'hazard' });
    }
  } else {
    p.hazardAccum = 0;
  }

  runHook(p, 'onUpdate', { game, player: p, dt });

  updateOrbitals(game, p, dt);
  updateFamiliars(game, p, dt);
}

// ---------------------------------------------------------------- orbitals

function updateOrbitals(game, p, dt) {
  const want = p.flags.orbitals || 0;
  while (p.orbitals.length < want) {
    p.orbitals.push({ a: (p.orbitals.length / Math.max(1, want)) * Math.PI * 2, r: 34, hitT: 0 });
  }
  while (p.orbitals.length > want) p.orbitals.pop();

  for (const o of p.orbitals) {
    o.a += dt * 3.1;
    o.x = p.x + Math.cos(o.a) * o.r;
    o.y = p.y + Math.sin(o.a) * o.r;
    if (o.hitT > 0) o.hitT -= dt;
    else {
      const hit = game.damageEnemiesNear(o.x, o.y, 9, 3 + p.stats.damage * 0.6, 'orbital');
      if (hit) o.hitT = 0.28;
    }
  }
}

// --------------------------------------------------------------- familiars

function updateFamiliars(game, p, dt) {
  const want = p.flags.familiars || 0;
  while (p.familiars.length < want) {
    p.familiars.push({
      x: p.x,
      y: p.y,
      px: p.x,
      py: p.y,
      a: Math.random() * Math.PI * 2,
      cd: 0.5,
      index: p.familiars.length,
    });
  }
  while (p.familiars.length > want) p.familiars.pop();

  for (const fam of p.familiars) {
    fam.px = fam.x;
    fam.py = fam.y;
    fam.a += dt * 1.6;
    const off = (fam.index / Math.max(1, want)) * Math.PI * 2;
    const tx = p.x + Math.cos(fam.a + off) * 30;
    const ty = p.y + Math.sin(fam.a + off) * 30 - 6;
    fam.x += (tx - fam.x) * Math.min(1, dt * 7);
    fam.y += (ty - fam.y) * Math.min(1, dt * 7);

    fam.cd -= dt;
    if (fam.cd <= 0) {
      const target = game.nearestEnemy(fam.x, fam.y, 260);
      if (target) {
        fam.cd = 0.7;
        const a = Math.atan2(target.y - fam.y, target.x - fam.x);
        game.spawnFamiliarShot(fam, a, 3 + p.stats.damage * 0.45);
        if (p.flags.familiarEcho) {
          game.spawnFamiliarShot(fam, a + 0.14, 3 + p.stats.damage * 0.35);
        }
      }
    }
  }
}

export function playerBounds(p) {
  return {
    minX: TILE * 0.5,
    minY: TILE * 0.5,
    maxX: ROOM_W * TILE - TILE * 0.5,
    maxY: ROOM_H * TILE - TILE * 0.5,
  };
}
