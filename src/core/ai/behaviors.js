/**
 * Enemy behaviours.
 *
 * One exported function per `behavior` id in data/enemies.js. Each receives
 * (game, e, dt) and owns that monster's movement and attacks. Scratch state
 * lives on `e.ai`, so enemies stay plain data.
 *
 * Two rules shape everything here:
 *   1. Monsters must *notice* you before they hunt you — sight cones and noise,
 *      never omniscience. Being unseen is a real state the player can use.
 *   2. Anything that can hurt you telegraphs first, with a wind-up you can read
 *      even in near-darkness (the renderer flashes their glow during `warn`).
 */
import { CELL, TEAM, C } from '../constants.js';
import { moveBody, hasLineOfSight, blocked } from '../world/collision.js';
import { clamp, angleDelta, dist2d, dist2dSq } from '../math3.js';
import { SPRITE } from '../../data/sprite-ids.js';

const steerOut = { x: 0, z: 0 };

// ---------------------------------------------------------------- helpers

function toPlayer(game, e) {
  const p = game.player;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  return { dx, dz, d, nx: dx / d, nz: dz / d, p };
}

function moveOpts(e) {
  return { flying: e.flying };
}

/** Accelerate toward a direction, then resolve against the grid. */
function drive(game, e, dt, dx, dz, speed, accel = 12) {
  e.vx += dx * accel * dt;
  e.vz += dz * accel * dt;
  const sp = Math.hypot(e.vx, e.vz);
  if (sp > speed) {
    e.vx = (e.vx / sp) * speed;
    e.vz = (e.vz / sp) * speed;
  }
  if (dx === 0 && dz === 0) {
    const f = Math.pow(0.0025, dt);
    e.vx *= f;
    e.vz *= f;
  }
  return applyMove(game, e, dt);
}

function applyMove(game, e, dt) {
  const res = moveBody(game.dungeon.cells, e, e.vx * dt, e.vz * dt, moveOpts(e));
  if (res.hitX) e.vx = e.bounceWalls ? -e.vx : 0;
  if (res.hitZ) e.vz = e.bounceWalls ? -e.vz : 0;
  if (e.vx || e.vz) e.yaw = Math.atan2(e.vx, e.vz);
  return res;
}

/** Cheap crowd separation so packs do not merge into one body. */
function separate(game, e, dt) {
  const list = game.enemies;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === e || !o.alive) continue;
    const dx = e.x - o.x;
    const dz = e.z - o.z;
    const minD = e.radius + o.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 > minD * minD || d2 < 1e-4) continue;
    const d = Math.sqrt(d2);
    sx += (dx / d) * (minD - d);
    sz += (dz / d) * (minD - d);
  }
  if (sx || sz) {
    moveBody(game.dungeon.cells, e, clamp(sx, -1, 1) * dt * 7, clamp(sz, -1, 1) * dt * 7, moveOpts(e));
  }
}

/** Follow the shared distance field toward the player. */
function pathTowardPlayer(game, e, dt, speed) {
  const dir = game.nav.steer(e.x, e.z, steerOut);
  if (dir) {
    drive(game, e, dt, dir.x, dir.z, speed, 14);
  } else {
    const t = toPlayer(game, e);
    drive(game, e, dt, t.nx, t.nz, speed, 12);
  }
  separate(game, e, dt);
}

/** Idle wandering: pick a heading, walk it until blocked, repeat. */
function wander(game, e, dt, speed) {
  e.ai.wanderT -= dt;
  if (e.ai.wanderT <= 0) {
    e.ai.wanderT = game.rng.range(1.2, 3.4);
    const a = game.rng.angle();
    e.ai.wx = Math.cos(a);
    e.ai.wz = Math.sin(a);
  }
  const res = drive(game, e, dt, e.ai.wx, e.ai.wz, speed, 8);
  if (res.hitX || res.hitZ) e.ai.wanderT = 0;
  separate(game, e, dt);
}

/**
 * Perception. Sight needs line of sight and a rough facing cone; noise is
 * omnidirectional but only carries when the player is actually being loud.
 */
export function updateSenses(game, e, dt) {
  const t = toPlayer(game, e);
  const def = e.def;
  e.ai.alertCd -= dt;

  let noticed = false;
  if (t.d < def.sight) {
    const facing = Math.abs(angleDelta(e.yaw, Math.atan2(t.dx, t.dz)));
    const lit = game.torchLightsPoint(e.x, e.z) ? 1.35 : 1;
    const inCone = facing < 1.35 || t.d < 4;
    if (inCone && hasLineOfSight(game.dungeon.cells, e.x, e.z, t.p.x, t.p.z, {})) {
      if (t.d < def.sight * lit) noticed = true;
    }
  }
  // Noise: sprinting, shooting and explosions all raise the player's signature.
  if (!noticed && t.d < def.hear * game.player.noise) noticed = true;

  if (noticed) {
    e.aggro = 1;
    e.ai.lastSeenX = t.p.x;
    e.ai.lastSeenZ = t.p.z;
    e.ai.loseT = 5.5;
    if (e.ai.alertCd <= 0 && e.ai.state === 'idle') {
      e.ai.alertCd = 6;
      game.sfx('growl', { x: e.x, y: e.y + 1, z: e.z, gain: 0.7 });
    }
    e.ai.state = 'hunt';
  } else if (e.ai.state === 'hunt') {
    e.ai.loseT -= dt;
    if (e.ai.loseT <= 0) {
      e.ai.state = 'idle';
      e.aggro = 0;
    }
  }
  return t;
}

// ---------------------------------------------------------------- shooting

export function tickShooting(game, e, dt) {
  const cfg = e.def.shoot;
  if (!cfg) return;
  const t = toPlayer(game, e);

  if (e.ai.spiralLeft > 0) {
    e.ai.spiralT -= dt;
    if (e.ai.spiralT <= 0) {
      e.ai.spiralT = 0.07;
      e.ai.spiralLeft--;
      e.ai.spiralAngle += 0.5;
      fireShot(game, e, e.ai.spiralAngle, cfg);
    }
    return;
  }

  if (e.ai.warnT > 0) {
    e.ai.warnT -= dt;
    e.telegraph = e.ai.warnT / Math.max(0.01, e.ai.warnMax);
    if (e.ai.warnT <= 0) {
      e.telegraph = 0;
      volley(game, e, Math.atan2(t.dx, t.dz), cfg);
      e.ai.shotCd = cfg.every * game.enemyFireScale;
    }
    return;
  }

  e.ai.shotCd -= dt;
  if (e.ai.state !== 'hunt') return;
  if (e.ai.shotCd > 0) return;
  if (t.d > e.def.sight) return;
  if (!e.flying && !hasLineOfSight(game.dungeon.cells, e.x, e.z, t.p.x, t.p.z, {})) return;

  e.ai.warnT = cfg.warn || 0.35;
  e.ai.warnMax = e.ai.warnT;
  e.telegraph = 1;
}

function volley(game, e, aim, cfg) {
  const count = cfg.count || 1;
  const pattern = cfg.pattern || 'spread';
  if (pattern === 'radial') {
    for (let i = 0; i < count; i++) fireShot(game, e, (i / count) * Math.PI * 2, cfg);
  } else if (pattern === 'spiral') {
    e.ai.spiralLeft = count;
    e.ai.spiralT = 0;
    e.ai.spiralAngle = aim;
  } else {
    const spread = cfg.spread || 0;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      fireShot(game, e, aim + t * spread * 2, cfg);
    }
  }
  game.sfx('enemyShoot', { x: e.x, y: e.y + 1, z: e.z });
}

export function fireShot(game, e, angle, cfg) {
  const s = game.spawnShot(TEAM.ENEMY);
  if (!s) return null;
  const eye = e.y + e.height * 0.6;
  s.x = s.px = e.x + Math.sin(angle) * (e.radius + 0.2);
  s.y = s.py = eye;
  s.z = s.pz = e.z + Math.cos(angle) * (e.radius + 0.2);
  const speed = (cfg.speed || 12) * game.enemyShotSpeedScale;
  const target = game.player;
  // Lead the shot slightly toward the player's chest, not their feet.
  const dy = cfg.arc ? 0 : clamp((target.y + 1.1 - eye) * 0.35, -0.6, 0.6);
  s.vx = Math.sin(angle) * speed;
  s.vy = dy * speed * 0.25 + (cfg.arc ? cfg.arc * speed * 0.5 : 0);
  s.vz = Math.cos(angle) * speed;
  s.speed = speed;
  s.gravity = cfg.arc ? 12 : 0;
  s.damage = cfg.damage || 1;
  s.radius = cfg.radius || 0.22;
  s.size = s.radius * 1.8;
  s.life = s.maxLife = cfg.life || 4;
  s.burn = cfg.burn || 0;
  s.sprite = cfg.arc ? SPRITE.BLOOD : SPRITE.DOT;
  const col = cfg.color || [1, 0.5, 0.4];
  s.r = col[0];
  s.g = col[1];
  s.b = col[2];
  s.puddle = cfg.puddle || null;
  s.owner = e;
  s.lightRadius = 3;
  return s;
}

// -------------------------------------------------------------- behaviours

export const BEHAVIORS = {
  /** Walks the navigation field straight at you. The baseline threat. */
  stalker(game, e, dt) {
    const t = updateSenses(game, e, dt);
    if (e.ai.state === 'hunt') {
      pathTowardPlayer(game, e, dt, e.speed);
      if (e.def.params.trail && game.rng.chance(dt * 6)) {
        game.fx('ember', { x: e.x, y: e.y + 0.2, z: e.z, color: [1, 0.5, 0.15] });
      }
    } else {
      wander(game, e, dt, e.speed * 0.45);
    }
    tickShooting(game, e, dt);
  },

  /** Keeps its distance and shoots; forces the player to close in. */
  kiter(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    if (e.ai.state === 'hunt') {
      let dx = 0;
      let dz = 0;
      if (t.d < P.flee) {
        dx = -t.nx;
        dz = -t.nz;
      } else if (t.d > P.keep) {
        dx = t.nx;
        dz = t.nz;
      } else {
        dx = -t.nz * e.ai.orbitDir;
        dz = t.nx * e.ai.orbitDir;
      }
      drive(game, e, dt, dx, dz, e.speed, 12);
      e.yaw = Math.atan2(t.dx, t.dz);
      separate(game, e, dt);
    } else {
      wander(game, e, dt, e.speed * 0.4);
    }
    tickShooting(game, e, dt);
  },

  /** Circles at a fixed radius, shooting. */
  orbiter(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    if (e.ai.state === 'hunt') {
      e.ai.orbitA += P.orbitSpeed * dt * e.ai.orbitDir;
      const tx = t.p.x + Math.cos(e.ai.orbitA) * P.orbit;
      const tz = t.p.z + Math.sin(e.ai.orbitA) * P.orbit;
      const dx = tx - e.x;
      const dz = tz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      drive(game, e, dt, dx / d, dz / d, e.speed, 14);
      e.yaw = Math.atan2(t.dx, t.dz);
    } else {
      wander(game, e, dt, e.speed * 0.35);
    }
    tickShooting(game, e, dt);
  },

  /** Fast, jittery, unpredictable — the swarm. */
  erratic(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    e.ai.turnT -= dt;
    if (e.ai.turnT <= 0) {
      e.ai.turnT = P.turnEvery * game.rng.range(0.6, 1.5);
      const bias = e.ai.state === 'hunt' ? 0.75 : 0.1;
      const base = Math.atan2(t.dx, t.dz);
      const a = base + game.rng.range(-1, 1) * (1 - bias) * Math.PI * 1.5;
      e.ai.wx = Math.sin(a);
      e.ai.wz = Math.cos(a);
      e.ai.burstT = 0.3;
    }
    e.ai.burstT -= dt;
    const speed = e.ai.burstT > 0 ? P.burst : e.speed;
    const res = drive(game, e, dt, e.ai.wx, e.ai.wz, speed, 22);
    if (res.hitX) e.ai.wx *= -1;
    if (res.hitZ) e.ai.wz *= -1;
    e.bob = Math.sin(e.t * 9) * 0.12;
    tickShooting(game, e, dt);
  },

  /** Slow drift; the danger is the bullet pattern, not the body. */
  drifter(game, e, dt) {
    updateSenses(game, e, dt);
    e.ai.wanderT -= dt;
    if (e.ai.wanderT <= 0) {
      e.ai.wanderT = game.rng.range(1.5, 3);
      const a = game.rng.angle();
      e.ai.wx = Math.cos(a);
      e.ai.wz = Math.sin(a);
    }
    const res = drive(game, e, dt, e.ai.wx, e.ai.wz, e.speed, 5);
    if (res.hitX) e.ai.wx *= -1;
    if (res.hitZ) e.ai.wz *= -1;
    e.bob = Math.sin(e.t * 1.4) * 0.18;
    tickShooting(game, e, dt);
  },

  /** Rooted. Fires patterns when it has line of sight. */
  turret(game, e, dt) {
    const t = updateSenses(game, e, dt);
    e.vx = e.vz = 0;
    e.yaw += angleDelta(e.yaw, Math.atan2(t.dx, t.dz)) * Math.min(1, dt * 2.5);
    tickShooting(game, e, dt);
  },

  /** Waits, then commits to a single readable lunge. */
  ambusher(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    switch (e.ai.state2) {
      case 'lunge': {
        e.ai.stateT -= dt;
        applyMove(game, e, dt);
        if (e.ai.stateT <= 0) {
          e.ai.state2 = 'rest';
          e.ai.stateT = P.rest;
        }
        break;
      }
      case 'wind': {
        e.ai.stateT -= dt;
        e.telegraph = e.ai.stateT / P.warn;
        e.vx *= Math.pow(0.01, dt);
        e.vz *= Math.pow(0.01, dt);
        e.yaw = Math.atan2(t.dx, t.dz);
        if (e.ai.stateT <= 0) {
          e.telegraph = 0;
          e.ai.state2 = 'lunge';
          e.ai.stateT = 0.45;
          e.vx = t.nx * P.lungeSpeed;
          e.vz = t.nz * P.lungeSpeed;
          game.sfx('screech', { x: e.x, y: e.y + 1, z: e.z, gain: 0.6 });
        }
        break;
      }
      case 'rest': {
        e.ai.stateT -= dt;
        drive(game, e, dt, 0, 0, 0);
        if (e.ai.stateT <= 0) e.ai.state2 = 'idle';
        break;
      }
      default: {
        if (e.ai.state === 'hunt') {
          if (t.d < P.lungeRange) {
            e.ai.state2 = 'wind';
            e.ai.stateT = P.warn;
          } else {
            pathTowardPlayer(game, e, dt, e.speed * 0.8);
          }
        } else {
          wander(game, e, dt, e.speed * 0.3);
        }
      }
    }
    separate(game, e, dt);
  },

  /**
   * Pack behaviour: circle the player and take turns striking. Only one pack
   * member may commit at a time, which reads as coordination rather than chaos.
   */
  packHunter(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    if (e.ai.state !== 'hunt') {
      wander(game, e, dt, e.speed * 0.4);
      return;
    }

    if (e.ai.dashT > 0) {
      e.ai.dashT -= dt;
      applyMove(game, e, dt);
      if (game.rng.chance(dt * 8)) game.fx('trail', { x: e.x, y: e.y + 0.4, z: e.z, color: [0.8, 0.5, 0.3] });
      return;
    }
    if (e.ai.windT > 0) {
      e.ai.windT -= dt;
      e.telegraph = e.ai.windT / P.warn;
      e.yaw = Math.atan2(t.dx, t.dz);
      drive(game, e, dt, 0, 0, 0);
      if (e.ai.windT <= 0) {
        e.telegraph = 0;
        e.ai.dashT = P.dashTime;
        e.vx = t.nx * P.dashSpeed;
        e.vz = t.nz * P.dashSpeed;
        game.sfx('screech', { x: e.x, y: e.y + 1, z: e.z, gain: 0.5 });
      }
      return;
    }

    e.ai.strikeT -= dt;
    if (e.ai.strikeT <= 0 && t.d < 12 && game.claimPackToken(e)) {
      e.ai.strikeT = P.strikeEvery * game.enemyFireScale;
      e.ai.windT = P.warn;
      if (P.howl) game.sfx('growl', { x: e.x, y: e.y + 1, z: e.z });
    } else {
      e.ai.orbitA += dt * 1.1 * e.ai.orbitDir;
      const tx = t.p.x + Math.cos(e.ai.orbitA) * P.circle;
      const tz = t.p.z + Math.sin(e.ai.orbitA) * P.circle;
      const dx = tx - e.x;
      const dz = tz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      // Fall back to pathing when the circling target is through a wall.
      if (hasLineOfSight(game.dungeon.cells, e.x, e.z, tx, tz, {})) {
        drive(game, e, dt, dx / d, dz / d, e.speed, 16);
      } else {
        pathTowardPlayer(game, e, dt, e.speed);
      }
      separate(game, e, dt);
    }
  },

  /**
   * The signature horror enemy: creeps when watched, sprints when it is not.
   * Looking at it is the only thing keeping it away.
   */
  hunter(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    const watched = game.playerLooksAt(e) && game.torchLightsPoint(e.x, e.z);
    e.watched = watched;

    if (e.ai.state !== 'hunt' && !watched) {
      wander(game, e, dt, e.speed * 0.35);
      return;
    }

    if (e.ai.chargeT > 0) {
      e.ai.chargeT -= dt;
      applyMove(game, e, dt);
      return;
    }
    if (e.ai.windT > 0) {
      e.ai.windT -= dt;
      e.telegraph = e.ai.windT / P.warn;
      drive(game, e, dt, 0, 0, 0);
      e.yaw = Math.atan2(t.dx, t.dz);
      if (e.ai.windT <= 0) {
        e.telegraph = 0;
        e.ai.chargeT = 0.55;
        e.vx = t.nx * P.chargeSpeed;
        e.vz = t.nz * P.chargeSpeed;
        game.sfx('screech', { x: e.x, y: e.y + 1.2, z: e.z });
      }
      return;
    }

    if (watched && P.freezeWhenWatched) {
      // Frozen, but never fully still: it edges closer at a crawl.
      drive(game, e, dt, t.nx * 0.25, t.nz * 0.25, P.creepSpeed, 6);
      e.yaw = Math.atan2(t.dx, t.dz);
    } else {
      if (t.d < P.chargeRange && e.ai.strikeT <= 0) {
        e.ai.strikeT = 3.5;
        e.ai.windT = P.warn;
      } else {
        e.ai.strikeT -= dt;
        pathTowardPlayer(game, e, dt, e.speed);
      }
    }
    separate(game, e, dt);
  },

  /** Rushes and detonates. Kill it at range or eat the blast. */
  exploder(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    if (e.ai.fuseT > 0) {
      e.ai.fuseT -= dt;
      e.telegraph = 1 - e.ai.fuseT / P.fuse;
      e.scale = e.baseScale * (1 + (1 - e.ai.fuseT / P.fuse) * 0.45);
      drive(game, e, dt, t.nx, t.nz, e.speed * 0.4, 6);
      if (e.ai.fuseT <= 0) {
        game.explode(e.x, e.y + 0.5, e.z, P.radius, P.damage, TEAM.ENEMY);
        game.killEnemy(e, { silent: true });
      }
      return;
    }
    if (e.ai.state === 'hunt') {
      pathTowardPlayer(game, e, dt, e.speed);
      e.bob = Math.sin(e.t * 7) * 0.1;
      if (t.d < P.fuseRange) {
        e.ai.fuseT = P.fuse;
        game.sfx('charge', { x: e.x, y: e.y + 0.6, z: e.z, gain: 0.8 });
      }
    } else {
      wander(game, e, dt, e.speed * 0.4);
      e.bob = Math.sin(e.t * 4) * 0.08;
    }
  },

  /** Heavy melee: closes, winds up, slams an area. */
  slammer(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    if (e.ai.state2 === 'wind') {
      e.ai.stateT -= dt;
      e.telegraph = e.ai.stateT / P.windup;
      drive(game, e, dt, 0, 0, 0);
      e.yaw = Math.atan2(t.dx, t.dz);
      if (e.ai.stateT <= 0) {
        e.telegraph = 0;
        e.ai.state2 = 'rest';
        e.ai.stateT = P.cooldown;
        game.explode(e.x, e.y + 0.4, e.z, P.slamRadius, P.slamDamage, TEAM.ENEMY, { noVisual: false });
        game.shake(0.9, 0.25);
        game.sfx('bossSlam', { x: e.x, y: e.y, z: e.z, gain: 0.7 });
        if (P.ringShot) {
          for (let i = 0; i < P.ringShot; i++) {
            fireShot(game, e, (i / P.ringShot) * Math.PI * 2, {
              speed: 13, damage: 1, color: [1, 0.7, 0.3], life: 2.4,
            });
          }
        }
      }
      return;
    }
    if (e.ai.state2 === 'rest') {
      e.ai.stateT -= dt;
      if (e.ai.state === 'hunt') pathTowardPlayer(game, e, dt, e.speed * 0.7);
      if (e.ai.stateT <= 0) e.ai.state2 = 'idle';
      return;
    }
    if (e.ai.state === 'hunt') {
      pathTowardPlayer(game, e, dt, e.speed);
      if (t.d < P.range) {
        e.ai.state2 = 'wind';
        e.ai.stateT = P.windup;
        game.fx('telegraph', { x: e.x, y: 0.1, z: e.z, radius: P.slamRadius, time: P.windup, color: [1, 0.4, 0.2] });
      }
    } else {
      wander(game, e, dt, e.speed * 0.4);
    }
  },

  /** Shielded advance: frontal shots bounce, so flank it. */
  guard(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    // The shield turns at a limited rate — a shield that snaps to face you can
    // never be flanked, which turns a positioning puzzle into a wall.
    const want = Math.atan2(t.dx, t.dz);
    const turn = P.turnRate * dt;
    e.shieldAngle += clamp(angleDelta(e.shieldAngle, want), -turn, turn);
    e.shieldArc = P.shieldArc;
    e.yaw = e.shieldAngle;

    if (e.ai.state === 'hunt') {
      pathTowardPlayer(game, e, dt, e.speed * (P.advance ? 1 : 0.7));
      e.ai.slashT -= dt;
      if (t.d < P.slashRange && e.ai.slashT <= 0) {
        e.ai.slashT = P.slashEvery;
        game.explode(
          e.x + t.nx * 1.4, e.y + 0.8, e.z + t.nz * 1.4,
          2.2, 3, TEAM.ENEMY, { noVisual: false },
        );
        game.sfx('bossSlam', { x: e.x, y: e.y, z: e.z, gain: 0.5, rate: 1.4 });
      }
    } else {
      wander(game, e, dt, e.speed * 0.35);
    }
    separate(game, e, dt);
  },

  /** Submerges, repositions underground, erupts beneath you. */
  burrower(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    e.ai.phaseT -= dt;
    if (e.ai.under) {
      e.invulnerable = true;
      e.hidden = true;
      const dir = game.nav.steer(e.x, e.z, steerOut);
      if (dir) moveBody(game.dungeon.cells, e, dir.x * e.speed * dt, dir.z * e.speed * dt, moveOpts(e));
      if (game.rng.chance(dt * 14)) game.fx('rubble', { x: e.x, y: 0.1, z: e.z });
      if (e.ai.phaseT <= 0) {
        if (e.ai.warn <= 0) {
          e.ai.warn = P.warn;
          game.fx('telegraph', { x: e.x, y: 0.1, z: e.z, radius: 1.8, time: P.warn, color: [1, 0.8, 0.3] });
        } else {
          e.ai.warn -= dt;
          if (e.ai.warn <= 0) {
            e.ai.under = false;
            e.invulnerable = false;
            e.hidden = false;
            e.ai.phaseT = P.over;
            game.explode(e.x, e.y + 0.4, e.z, 2.6, 2, TEAM.ENEMY);
            game.sfx('bossSlam', { x: e.x, y: e.y, z: e.z, gain: 0.5, rate: 1.5 });
          }
        }
      }
    } else {
      if (e.ai.state === 'hunt') pathTowardPlayer(game, e, dt, e.speed * 0.45);
      else wander(game, e, dt, e.speed * 0.3);
      if (e.ai.phaseT <= 0) {
        e.ai.under = true;
        e.ai.phaseT = P.under;
        e.ai.warn = 0;
        game.fx('rubble', { x: e.x, y: 0.1, z: e.z });
      }
    }
  },

  /** Rooted spawner; also screams to pull the whole floor toward you. */
  summoner(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    e.vx = e.vz = 0;
    e.yaw += angleDelta(e.yaw, Math.atan2(t.dx, t.dz)) * Math.min(1, dt * 2);
    if (e.ai.state !== 'hunt') return;

    if (e.ai.warnT > 0) {
      e.ai.warnT -= dt;
      e.telegraph = e.ai.warnT / P.warn;
      if (e.ai.warnT <= 0) {
        e.telegraph = 0;
        game.spawnMinions(e, { id: P.spawn, count: P.count, max: P.max });
        game.sfx('spawn', { x: e.x, y: e.y + 1, z: e.z });
        if (P.alarm) game.alertNearby(e.x, e.z, 26);
      }
      return;
    }
    e.ai.spawnT -= dt;
    if (e.ai.spawnT <= 0) {
      e.ai.spawnT = P.every * game.enemyFireScale;
      e.ai.warnT = P.warn;
      game.sfx('screech', { x: e.x, y: e.y + 1.4, z: e.z, gain: 0.9 });
    }
  },

  /** Rooted trap that marks the ground before erupting. */
  geyser(game, e, dt) {
    const t = updateSenses(game, e, dt);
    const P = e.def.params;
    e.vx = e.vz = 0;
    if (e.ai.marks) {
      e.ai.markT -= dt;
      if (e.ai.markT <= 0) {
        for (const m of e.ai.marks) {
          game.explode(m.x, 0.6, m.z, P.radius, P.damage, TEAM.ENEMY);
        }
        e.ai.marks = null;
      }
      return;
    }
    if (e.ai.state !== 'hunt') return;
    e.ai.spawnT -= dt;
    if (e.ai.spawnT <= 0) {
      e.ai.spawnT = P.every * game.enemyFireScale;
      e.ai.markT = P.warn;
      e.ai.marks = [];
      for (let i = 0; i < P.count; i++) {
        const a = game.rng.angle();
        const r = i === 0 ? 0 : game.rng.range(1.5, 4);
        const x = t.p.x + Math.cos(a) * r;
        const z = t.p.z + Math.sin(a) * r;
        e.ai.marks.push({ x, z });
        game.fx('telegraph', { x, y: 0.1, z, radius: P.radius, time: P.warn, color: [1, 0.45, 0.15] });
      }
      game.sfx('charge', { x: e.x, y: e.y, z: e.z, gain: 0.6 });
    }
  },

  /** Disguised as treasure until you get close. */
  mimic(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    if (!e.ai.revealed) {
      e.disguised = true;
      e.vx = e.vz = 0;
      if (t.d < P.revealRange) {
        e.ai.revealed = true;
        e.disguised = false;
        e.ai.state = 'hunt';
        e.aggro = 1;
        game.sfx('screech', { x: e.x, y: e.y + 1, z: e.z, gain: 1 });
        game.shake(0.6, 0.2);
        e.vx = t.nx * P.lungeSpeed;
        e.vz = t.nz * P.lungeSpeed;
        e.ai.dashT = 0.4;
      }
      return;
    }
    updateSenses(game, e, dt);
    if (e.ai.dashT > 0) {
      e.ai.dashT -= dt;
      applyMove(game, e, dt);
      return;
    }
    e.ai.strikeT -= dt;
    if (e.ai.strikeT <= 0 && t.d < 9) {
      e.ai.strikeT = 1.6;
      e.ai.dashT = 0.4;
      e.vx = t.nx * P.lungeSpeed;
      e.vz = t.nz * P.lungeSpeed;
      if (P.slam) game.explode(e.x, e.y + 0.5, e.z, 3, 3, TEAM.ENEMY);
    } else {
      pathTowardPlayer(game, e, dt, e.speed * 0.7);
    }
    separate(game, e, dt);
  },
};

export function getBehavior(name) {
  return BEHAVIORS[name] || BEHAVIORS.stalker;
}
