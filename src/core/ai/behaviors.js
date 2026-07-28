/**
 * Enemy behaviours.
 *
 * One exported function per `behavior` id used in data/enemies.js. Each gets
 * (game, e, dt) and is responsible for movement and for calling the shared
 * shooting helper. Behaviours keep their scratch state on `e.ai` so enemy
 * objects stay poolable and JSON-describable.
 *
 * Design rule: every behaviour must telegraph. Anything that can hurt the player
 * either moves predictably or plays a wind-up the player can read.
 */
import { TILE, ROOM_W, ROOM_H, TEAM } from '../constants.js';
import { moveEntity, hasLineOfSight, circleBlocked } from '../world/collision.js';
import { norm, angleDelta, clamp, dist } from '../math.js';

const ROOM_MAX_X = ROOM_W * TILE;
const ROOM_MAX_Y = ROOM_H * TILE;

// ---------------------------------------------------------------- helpers

function toPlayer(game, e) {
  const p = game.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { dx, dy, d, nx: dx / d, ny: dy / d, p };
}

function walkOpts(e) {
  return { flying: e.flying, ghost: false };
}

/** Steer with acceleration and friction, then resolve against tiles. */
function steer(game, e, dt, ax, ay, maxSpeed, accel = 500) {
  e.vx += ax * accel * dt;
  e.vy += ay * accel * dt;
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > maxSpeed) {
    e.vx = (e.vx / sp) * maxSpeed;
    e.vy = (e.vy / sp) * maxSpeed;
  }
  const fr = Math.pow(0.0016, dt);
  if (ax === 0 && ay === 0) {
    e.vx *= fr;
    e.vy *= fr;
  }
  applyMove(game, e, dt);
}

function applyMove(game, e, dt) {
  const res = moveEntity(game.room.tiles, e, e.vx * dt, e.vy * dt, walkOpts(e));
  if (res.hitX) e.vx = e.bounceWalls ? -e.vx : 0;
  if (res.hitY) e.vy = e.bounceWalls ? -e.vy : 0;
  return res;
}

function separate(game, e, dt) {
  // Cheap crowd separation so packs do not stack into a single sprite.
  const list = game.enemies;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === e || !o.alive) continue;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const minD = e.radius + o.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > minD * minD || d2 < 0.001) continue;
    const d = Math.sqrt(d2);
    sx += (dx / d) * (minD - d);
    sy += (dy / d) * (minD - d);
  }
  if (sx || sy) {
    e.x += clamp(sx, -40, 40) * dt * 6;
    e.y += clamp(sy, -40, 40) * dt * 6;
  }
}

/** Generic shooting driver, shared by every behaviour that has `shoot` data. */
export function tickShooting(game, e, dt, aimAngleOverride) {
  const cfg = e.def.shoot;
  if (!cfg) return;
  const { d } = toPlayer(game, e);
  const range = (e.def.params && e.def.params.range) || 420;
  e.ai.shotCd -= dt;

  // Spiral pattern drip-feeds bullets after the trigger.
  if (e.ai.spiralLeft > 0) {
    e.ai.spiralT -= dt;
    if (e.ai.spiralT <= 0) {
      e.ai.spiralT = 0.06;
      e.ai.spiralLeft--;
      e.ai.spiralAngle += (cfg.spin || 1) * 0.55;
      fireShot(game, e, e.ai.spiralAngle, cfg);
    }
    return;
  }

  if (e.ai.warnT > 0) {
    e.ai.warnT -= dt;
    if (e.ai.warnT <= 0) {
      const aim = aimAngleOverride != null ? aimAngleOverride : Math.atan2(game.player.y - e.y, game.player.x - e.x);
      volley(game, e, aim, cfg);
      e.ai.shotCd = cfg.every * game.enemyFireScale;
    }
    return;
  }

  if (e.ai.shotCd <= 0 && d < range && (e.flying || hasLineOfSight(game.room.tiles, e.x, e.y, game.player.x, game.player.y, walkOpts(e)))) {
    e.ai.warnT = cfg.warn || 0.3;
    e.ai.warnMax = e.ai.warnT;
    game.fx('telegraph', { x: e.x, y: e.y, time: e.ai.warnT, color: e.tint });
  }
}

function volley(game, e, aim, cfg) {
  if (cfg.spawn) {
    game.spawnMinions(e, cfg.spawn);
    game.sfx('spawn');
    return;
  }
  const count = cfg.count || 1;
  const pattern = cfg.pattern || 'spread';

  if (pattern === 'radial') {
    const off = (cfg.spin || 0) * e.t;
    for (let i = 0; i < count; i++) fireShot(game, e, off + (i / count) * Math.PI * 2, cfg);
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
  game.sfx('enemyShoot');
}

function fireShot(game, e, angle, cfg) {
  const s = game.spawnShot(TEAM.ENEMY);
  if (!s) return;
  s.x = s.px = e.x;
  s.y = s.py = e.y;
  s.angle = angle;
  s.speed = (cfg.speed || 120) * game.enemyShotSpeedScale;
  s.vx = Math.cos(angle) * s.speed;
  s.vy = Math.sin(angle) * s.speed;
  s.damage = cfg.damage || 1;
  s.radius = cfg.radius || 5;
  s.life = s.maxLife = cfg.life || 3.4;
  s.kind = cfg.kind || 'bolt';
  s.color = game.shotColor(cfg.kind);
  s.burn = cfg.burn ? 1 : 0;
  s.homing = cfg.homing || 0;
  s.arc = cfg.arc ? 1 : 0;
  s.puddle = cfg.puddle || null;
  s.owner = e;
  return s;
}

// ---------------------------------------------------------------- behaviours

export const BEHAVIORS = {
  /** Walks straight at the player. The baseline threat. */
  chaser(game, e, dt) {
    const { nx, ny, d } = toPlayer(game, e);
    const wobble = e.def.params && e.def.params.wobble ? Math.sin(e.t * 3.1 + e.seedPhase) * e.def.params.wobble : 0;
    const ang = Math.atan2(ny, nx) + wobble;
    steer(game, e, dt, Math.cos(ang), Math.sin(ang), e.speed, (e.def.params && e.def.params.accel) || 300);
    separate(game, e, dt);
    e.facing = d > 4 ? Math.sign(nx) || e.facing : e.facing;
    tickShooting(game, e, dt);
  },

  /** Hops in bursts: readable, punishable gaps between jumps. */
  hopper(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.hopT -= dt;
    if (e.ai.hopping > 0) {
      e.ai.hopping -= dt;
      e.squashT = e.ai.hopping / P.hopTime;
      applyMove(game, e, dt);
      e.vx *= Math.pow(0.25, dt);
      e.vy *= Math.pow(0.25, dt);
      if (e.ai.hopping <= 0 && P.shockwave) {
        game.spawnShockwave(e.x, e.y, { radius: 52, damage: 1, team: TEAM.ENEMY, color: e.tint });
        game.shake(3, 0.15);
      }
    } else if (e.ai.hopT <= 0) {
      e.ai.hopT = P.hopEvery * game.enemyFireScale;
      e.ai.hopping = P.hopTime;
      const a = Math.atan2(t.ny, t.nx) + game.rng.range(-0.25, 0.25);
      e.vx = Math.cos(a) * P.hopPower;
      e.vy = Math.sin(a) * P.hopPower;
      e.facing = Math.sign(Math.cos(a)) || e.facing;
    } else {
      e.vx *= Math.pow(0.02, dt);
      e.vy *= Math.pow(0.02, dt);
      e.squashT = 0;
      applyMove(game, e, dt);
    }
    separate(game, e, dt);
    tickShooting(game, e, dt);
  },

  /** Rooted. Fires patterns; the player must use cover. */
  turret(game, e, dt) {
    e.vx = e.vy = 0;
    tickShooting(game, e, dt);
  },

  /** Flies a sine path toward the player, ignoring terrain. */
  flyerSine(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    const base = Math.atan2(t.ny, t.nx);
    const perp = base + Math.PI / 2;
    const off = Math.sin(e.t * P.freq + e.seedPhase) * P.amp;
    const tx = t.p.x + Math.cos(perp) * off;
    const ty = t.p.y + Math.sin(perp) * off;
    const dir = norm(tx - e.x, ty - e.y);
    e.vx = dir.x * e.speed * P.approach + Math.cos(perp) * Math.cos(e.t * P.freq) * P.amp * 0.6;
    e.vy = dir.y * e.speed * P.approach + Math.sin(perp) * Math.cos(e.t * P.freq) * P.amp * 0.6;
    applyMove(game, e, dt);
    e.facing = Math.sign(dir.x) || e.facing;
    if (P.dust && game.rng.chance(dt * 6)) game.fx('dust', { x: e.x, y: e.y, color: e.tint });
    tickShooting(game, e, dt);
  },

  /** Wind-up, then a committed dash. Dodge the line, punish the recovery. */
  charger(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    switch (e.ai.state) {
      case 'dash': {
        e.ai.stateT -= dt;
        const res = applyMove(game, e, dt);
        if (P.trail && game.rng.chance(dt * 14)) game.fx('trail', { x: e.x, y: e.y, color: e.tint });
        if (e.ai.stateT <= 0 || res.hitX || res.hitY) {
          e.ai.state = 'rest';
          e.ai.stateT = P.rest;
          if (res.hitX || res.hitY) {
            game.shake(3, 0.12);
            game.fx('impact', { x: e.x, y: e.y, color: e.tint });
          }
        }
        break;
      }
      case 'wind': {
        e.ai.stateT -= dt;
        e.ai.aim = Math.atan2(t.ny, t.nx);
        e.vx *= Math.pow(0.01, dt);
        e.vy *= Math.pow(0.01, dt);
        applyMove(game, e, dt);
        if (e.ai.stateT <= 0) {
          e.ai.state = 'dash';
          e.ai.stateT = P.dashTime;
          e.vx = Math.cos(e.ai.aim) * P.dashSpeed;
          e.vy = Math.sin(e.ai.aim) * P.dashSpeed;
          game.sfx('dash', { gain: 0.6 });
        }
        break;
      }
      default: {
        e.ai.stateT -= dt;
        const ang = Math.atan2(t.ny, t.nx);
        steer(game, e, dt, Math.cos(ang) * 0.6, Math.sin(ang) * 0.6, e.speed, 240);
        if (e.ai.stateT <= 0 && t.d < P.range) {
          e.ai.state = 'wind';
          e.ai.stateT = P.telegraph * game.enemyFireScale;
          e.ai.warnMax = e.ai.stateT;
        }
      }
    }
    e.ai.telegraph = e.ai.state === 'wind' ? e.ai.stateT / Math.max(0.01, e.ai.warnMax) : 0;
    e.facing = Math.sign(t.nx) || e.facing;
    separate(game, e, dt);
  },

  /** Slow shielded advance: frontal shots bounce, so flank it. */
  guard(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    // The shield turns at a limited rate. A shield that snaps to face the
    // player can never be flanked, which turns a "reposition and punish" enemy
    // into an unkillable wall — the whole point is that footwork beats it.
    const want = Math.atan2(t.ny, t.nx);
    const turn = (P.turnRate || 1.7) * dt;
    e.shieldAngle += clamp(angleDelta(e.shieldAngle, want), -turn, turn);
    e.shieldArc = P.shieldArc;
    const speedMul = P.advance ? 1 : 0.7;
    steer(game, e, dt, t.nx, t.ny, e.speed * speedMul, 160);
    separate(game, e, dt);
    if (P.regen && e.noRegenT <= 0) {
      e.ai.regenT = (e.ai.regenT || 0) + dt;
      if (e.ai.regenT > 1 && e.hp < e.maxHp) {
        e.ai.regenT = 0;
        e.hp = Math.min(e.maxHp, e.hp + P.regen);
      }
    }
    if (P.chargeSlash) {
      e.ai.slashT = (e.ai.slashT || 3) - dt;
      if (e.ai.slashT <= 0 && t.d < 150) {
        e.ai.slashT = 4;
        game.spawnShockwave(e.x + t.nx * 30, e.y + t.ny * 30, {
          radius: 54,
          damage: 2,
          team: TEAM.ENEMY,
          color: e.tint,
        });
        game.sfx('bossSlam', { gain: 0.5 });
      }
    }
    e.facing = Math.sign(t.nx) || e.facing;
    tickShooting(game, e, dt);
  },

  /** Circles at a fixed radius while shooting. */
  orbiter(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.orbitA = (e.ai.orbitA || e.seedPhase) + P.orbitSpeed * dt * e.ai.orbitDir;
    const radius = P.orbit + Math.sin(e.t * P.drift) * 18;
    const tx = t.p.x + Math.cos(e.ai.orbitA) * radius;
    const ty = t.p.y + Math.sin(e.ai.orbitA) * radius;
    const dir = norm(tx - e.x, ty - e.y);
    e.vx = dir.x * e.speed;
    e.vy = dir.y * e.speed;
    applyMove(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
    tickShooting(game, e, dt);
  },

  /** Fast, jittery, unpredictable — bats. */
  erratic(game, e, dt) {
    const P = e.def.params;
    e.ai.turnT -= dt;
    if (e.ai.turnT <= 0) {
      e.ai.turnT = P.turnEvery * game.rng.range(0.6, 1.5);
      const t = toPlayer(game, e);
      const bias = t.d > 200 ? 0.85 : 0.35;
      const a = Math.atan2(t.ny, t.nx) + game.rng.range(-1, 1) * (1 - bias) * Math.PI * 1.4;
      e.ai.dirX = Math.cos(a);
      e.ai.dirY = Math.sin(a);
      e.ai.burstT = 0.22;
    }
    e.ai.burstT -= dt;
    const boost = e.ai.burstT > 0 ? P.burst : e.speed;
    e.vx = e.ai.dirX * boost;
    e.vy = e.ai.dirY * boost;
    const res = applyMove(game, e, dt);
    if (res.hitX) e.ai.dirX *= -1;
    if (res.hitY) e.ai.dirY *= -1;
    e.facing = Math.sign(e.ai.dirX) || e.facing;
    e.wingPhase = e.t * 18;
    tickShooting(game, e, dt);
  },

  /** Hugs walls, then pounces when the player comes close. */
  wallhugger(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    if (e.ai.pounceT > 0) {
      e.ai.pounceT -= dt;
      applyMove(game, e, dt);
      e.vx *= Math.pow(0.3, dt);
      e.vy *= Math.pow(0.3, dt);
    } else if (t.d < P.pounceRange && e.ai.pounceCd <= 0) {
      e.ai.pounceCd = 2.2;
      e.ai.pounceT = 0.4;
      e.vx = t.nx * P.pounce;
      e.vy = t.ny * P.pounce;
      game.sfx('dash', { gain: 0.4 });
    } else {
      e.ai.pounceCd -= dt;
      // Prefer moving along walls: sample the nearest blocked direction.
      const ang = Math.atan2(t.ny, t.nx);
      const near = nearestWallNormal(game, e);
      const tang = near ? Math.atan2(-near.y, -near.x) + Math.PI / 2 : ang;
      const mix = near ? P.hugStrength : 0;
      const finalA = ang * (1 - mix) + tang * mix;
      steer(game, e, dt, Math.cos(finalA), Math.sin(finalA), e.speed, 260);
    }
    separate(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
    tickShooting(game, e, dt);
  },

  /** Keeps its preferred range and shoots — forces the player to close in. */
  kiter(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    let ax = 0;
    let ay = 0;
    if (t.d < P.flee) {
      ax = -t.nx;
      ay = -t.ny;
    } else if (t.d > P.keep) {
      ax = t.nx;
      ay = t.ny;
    } else {
      // Strafe at the sweet spot.
      ax = -t.ny * e.ai.orbitDir;
      ay = t.nx * e.ai.orbitDir;
    }
    steer(game, e, dt, ax, ay, e.speed, 300);
    separate(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
    tickShooting(game, e, dt);
  },

  /** Slow aimless float; the danger is the bullet pattern, not the body. */
  drifter(game, e, dt) {
    e.ai.driftT -= dt;
    if (e.ai.driftT <= 0) {
      e.ai.driftT = game.rng.range(1.2, 2.6);
      const a = game.rng.angle();
      e.ai.dirX = Math.cos(a);
      e.ai.dirY = Math.sin(a);
    }
    e.vx = e.ai.dirX * e.speed;
    e.vy = e.ai.dirY * e.speed;
    const res = applyMove(game, e, dt);
    if (res.hitX) e.ai.dirX *= -1;
    if (res.hitY) e.ai.dirY *= -1;
    tickShooting(game, e, dt);
  },

  /** Blinks in and lunges. Always telegraphs the arrival. */
  teleporter(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.blinkT -= dt;
    if (e.ai.fadeT > 0) {
      e.ai.fadeT -= dt;
      e.alpha = 0.25;
      if (e.ai.fadeT <= 0) {
        const a = game.rng.angle();
        const r = P.blinkRange * game.rng.range(0.4, 1);
        const nx = clamp(t.p.x + Math.cos(a) * r, TILE, ROOM_MAX_X - TILE);
        const ny = clamp(t.p.y + Math.sin(a) * r, TILE, ROOM_MAX_Y - TILE);
        if (!circleBlocked(game.room.tiles, nx, ny, e.radius, walkOpts(e))) {
          e.x = nx;
          e.y = ny;
        }
        e.alpha = 1;
        game.fx('teleport', { x: e.x, y: e.y, color: e.tint });
        game.sfx('teleport');
        const t2 = toPlayer(game, e);
        e.vx = t2.nx * P.lunge;
        e.vy = t2.ny * P.lunge;
      }
    } else if (e.ai.blinkT <= 0) {
      e.ai.blinkT = P.blinkEvery * game.enemyFireScale;
      e.ai.fadeT = P.warn;
      game.fx('teleport', { x: e.x, y: e.y, color: e.tint });
    } else {
      const ang = Math.atan2(t.ny, t.nx);
      steer(game, e, dt, Math.cos(ang) * 0.5, Math.sin(ang) * 0.5, e.speed * 0.6, 200);
      if (P.afterimage && game.rng.chance(dt * 8)) game.fx('trail', { x: e.x, y: e.y, color: e.tint });
    }
    applyMove(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
  },

  /** Rooted spawner. Kill it or drown in adds. */
  summoner(game, e, dt) {
    const P = e.def.params;
    e.vx = e.vy = 0;
    e.ai.spawnT -= dt;
    if (e.ai.warnT > 0) {
      e.ai.warnT -= dt;
      if (e.ai.warnT <= 0) {
        game.spawnMinions(e, { id: P.spawn, count: P.count, max: P.max });
        game.sfx('spawn');
        game.fx('summon', { x: e.x, y: e.y, color: e.tint });
      }
    } else if (e.ai.spawnT <= 0) {
      e.ai.spawnT = P.every * game.enemyFireScale;
      e.ai.warnT = P.warn;
      e.ai.warnMax = P.warn;
    }
    e.ai.telegraph = e.ai.warnT > 0 ? e.ai.warnT / P.warn : 0;
  },

  /** Submerges, repositions underground, erupts under the player. */
  burrower(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.phaseT -= dt;
    if (e.ai.under) {
      e.invulnerable = true;
      e.hidden = true;
      const dir = norm(t.p.x - e.x, t.p.y - e.y);
      e.x += dir.x * e.speed * dt;
      e.y += dir.y * e.speed * dt;
      e.x = clamp(e.x, TILE, ROOM_MAX_X - TILE);
      e.y = clamp(e.y, TILE, ROOM_MAX_Y - TILE);
      if (game.rng.chance(dt * 20)) game.fx('mound', { x: e.x, y: e.y, color: e.tint });
      if (e.ai.phaseT <= 0) {
        if (e.ai.warn <= 0) {
          e.ai.warn = P.warn;
          game.fx('mound', { x: e.x, y: e.y, color: e.tint, big: true });
        } else {
          e.ai.warn -= dt;
          if (e.ai.warn <= 0) {
            e.ai.under = false;
            e.invulnerable = false;
            e.hidden = false;
            e.ai.phaseT = P.over;
            game.spawnShockwave(e.x, e.y, { radius: 46, damage: 1, team: TEAM.ENEMY, color: e.tint });
            game.sfx('bossSlam', { gain: 0.4 });
          }
        }
      }
    } else {
      const ang = Math.atan2(t.ny, t.nx);
      steer(game, e, dt, Math.cos(ang), Math.sin(ang), e.speed * 0.55, 260);
      if (e.ai.phaseT <= 0) {
        e.ai.under = true;
        e.ai.phaseT = P.under;
        e.ai.warn = 0;
        game.fx('mound', { x: e.x, y: e.y, color: e.tint });
      }
    }
    separate(game, e, dt);
  },

  /** Heavy melee: closes, winds up, slams an area. */
  slammer(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    if (e.ai.state === 'wind') {
      e.ai.stateT -= dt;
      e.vx *= Math.pow(0.02, dt);
      e.vy *= Math.pow(0.02, dt);
      applyMove(game, e, dt);
      e.ai.telegraph = e.ai.stateT / P.windup;
      if (e.ai.stateT <= 0) {
        e.ai.state = 'rest';
        e.ai.stateT = P.cooldown;
        e.ai.telegraph = 0;
        game.spawnShockwave(e.x, e.y, {
          radius: P.slamRadius,
          damage: P.slamDamage,
          team: TEAM.ENEMY,
          color: e.tint,
        });
        game.shake(6, 0.25);
        game.sfx('bossSlam');
        if (P.ringShot) {
          for (let i = 0; i < P.ringShot; i++) {
            fireShot(game, e, (i / P.ringShot) * Math.PI * 2, {
              speed: 130,
              damage: 1,
              kind: 'shrapnel',
              life: 2.2,
            });
          }
        }
      }
    } else {
      e.ai.stateT -= dt;
      const ang = Math.atan2(t.ny, t.nx);
      steer(game, e, dt, Math.cos(ang), Math.sin(ang), e.speed, 180);
      if (t.d < P.range && e.ai.stateT <= 0) {
        e.ai.state = 'wind';
        e.ai.stateT = P.windup;
        game.fx('telegraph', { x: e.x, y: e.y, time: P.windup, color: e.tint, radius: P.slamRadius });
      }
    }
    separate(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
  },

  /** Circles as a pack, taking turns to strike. */
  packHunter(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.strikeT -= dt;
    if (e.ai.dashT > 0) {
      e.ai.dashT -= dt;
      applyMove(game, e, dt);
      if (game.rng.chance(dt * 10)) game.fx('trail', { x: e.x, y: e.y, color: e.tint });
    } else if (e.ai.strikeT <= 0 && game.claimPackToken(e)) {
      e.ai.strikeT = P.strikeEvery * game.enemyFireScale;
      e.ai.dashT = P.dashTime;
      e.vx = t.nx * P.dashSpeed;
      e.vy = t.ny * P.dashSpeed;
      game.sfx('dash', { gain: 0.35 });
      if (P.howl) game.sfx('bossRoar', { gain: 0.25, rate: 1.6 });
    } else {
      e.ai.orbitA = (e.ai.orbitA || e.seedPhase) + dt * 1.1 * e.ai.orbitDir;
      const tx = t.p.x + Math.cos(e.ai.orbitA) * P.circle;
      const ty = t.p.y + Math.sin(e.ai.orbitA) * P.circle;
      const dir = norm(tx - e.x, ty - e.y);
      steer(game, e, dt, dir.x, dir.y, e.speed, 320);
    }
    separate(game, e, dt);
    e.facing = Math.sign(t.nx) || e.facing;
  },

  /** Travels in straight lines and ricochets off geometry. */
  bouncer(game, e, dt) {
    const P = e.def.params;
    if (!e.ai.init) {
      e.ai.init = true;
      const a = game.rng.angle();
      e.vx = Math.cos(a) * P.speed;
      e.vy = Math.sin(a) * P.speed;
      e.bounceWalls = true;
    }
    const res = applyMove(game, e, dt);
    if (res.hitX || res.hitY) {
      game.fx('impact', { x: e.x, y: e.y, color: e.tint });
      game.sfx('block', { gain: 0.3 });
    }
    e.spin = (e.spin || 0) + dt * 6;
    tickShooting(game, e, dt);
  },

  /** Rooted eruption trap: marks the ground, then erupts. */
  geyser(game, e, dt) {
    const P = e.def.params;
    e.vx = e.vy = 0;
    e.ai.spawnT -= dt;
    if (e.ai.marks && e.ai.marks.length) {
      e.ai.markT -= dt;
      if (e.ai.markT <= 0) {
        for (const m of e.ai.marks) {
          game.spawnShockwave(m.x, m.y, { radius: P.radius, damage: P.damage, team: TEAM.ENEMY, color: e.tint });
          game.fx('eruption', { x: m.x, y: m.y, color: e.tint });
        }
        game.sfx('explode', { gain: 0.5, rate: 1.3 });
        e.ai.marks = null;
      }
    } else if (e.ai.spawnT <= 0) {
      e.ai.spawnT = P.every * game.enemyFireScale;
      e.ai.markT = P.warn;
      e.ai.marks = [];
      const p = game.player;
      for (let i = 0; i < P.count; i++) {
        const a = game.rng.angle();
        const r = i === 0 ? 0 : game.rng.range(30, 90);
        e.ai.marks.push({
          x: clamp(p.x + Math.cos(a) * r, TILE, ROOM_MAX_X - TILE),
          y: clamp(p.y + Math.sin(a) * r, TILE, ROOM_MAX_Y - TILE),
        });
      }
      for (const m of e.ai.marks) game.fx('telegraph', { x: m.x, y: m.y, time: P.warn, color: e.tint, radius: P.radius });
    }
  },

  /** Strafes in wide arcs while spitting spiral patterns. */
  dancer(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.orbitA = (e.ai.orbitA || e.seedPhase) + dt * P.strafe * e.ai.orbitDir;
    if (game.rng.chance(dt * 0.35)) e.ai.orbitDir *= -1;
    const tx = t.p.x + Math.cos(e.ai.orbitA) * P.keep;
    const ty = t.p.y + Math.sin(e.ai.orbitA) * P.keep;
    const dir = norm(tx - e.x, ty - e.y);
    steer(game, e, dt, dir.x, dir.y, e.speed, 340);
    e.facing = Math.sign(t.nx) || e.facing;
    tickShooting(game, e, dt);
  },

  /** Plays dead once, then gets back up at reduced health. */
  reviver(game, e, dt) {
    if (e.ai.downed) {
      e.ai.reviveT -= dt;
      e.invulnerable = true;
      e.vx = e.vy = 0;
      if (e.ai.reviveT <= 0) {
        e.ai.downed = false;
        e.invulnerable = false;
        e.hp = Math.max(1, Math.floor(e.maxHp * e.def.params.reviveHp));
        e.ai.revived = true;
        game.fx('revive', { x: e.x, y: e.y, color: e.tint });
        game.sfx('spawn', { rate: 0.7 });
      }
      return;
    }
    BEHAVIORS.kiter(game, e, dt);
  },

  /** Disguised as loot until the player gets close. */
  mimic(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    if (!e.ai.revealed) {
      e.disguised = true;
      e.invulnerable = false;
      e.vx = e.vy = 0;
      if (t.d < P.revealRange) {
        e.ai.revealed = true;
        e.disguised = false;
        game.fx('reveal', { x: e.x, y: e.y, color: e.tint });
        game.sfx('bossRoar', { gain: 0.3, rate: 1.8 });
        e.vx = t.nx * P.lunge;
        e.vy = t.ny * P.lunge;
        e.ai.lungeT = 0.35;
      }
      return;
    }
    if (e.ai.lungeT > 0) {
      e.ai.lungeT -= dt;
      applyMove(game, e, dt);
      e.vx *= Math.pow(0.25, dt);
      e.vy *= Math.pow(0.25, dt);
      return;
    }
    e.ai.hopT -= dt;
    if (e.ai.hopT <= 0) {
      e.ai.hopT = 1.1;
      e.ai.lungeT = 0.32;
      e.vx = t.nx * P.lunge;
      e.vy = t.ny * P.lunge;
      if (P.slam) {
        game.spawnShockwave(e.x, e.y, { radius: 60, damage: 2, team: TEAM.ENEMY, color: e.tint });
      }
    } else {
      const ang = Math.atan2(t.ny, t.nx);
      steer(game, e, dt, Math.cos(ang) * 0.5, Math.sin(ang) * 0.5, e.speed * 0.5, 200);
    }
    separate(game, e, dt);
  },

  /** Anchors beams across the arena; the player must break the line. */
  weaver(game, e, dt) {
    const P = e.def.params;
    const t = toPlayer(game, e);
    e.ai.beamT -= dt;
    if (e.ai.beam) {
      e.ai.beam.time -= dt;
      e.ai.beam.warn -= dt;
      if (e.ai.beam.time <= 0) e.ai.beam = null;
    } else if (e.ai.beamT <= 0) {
      e.ai.beamT = P.beamEvery * game.enemyFireScale;
      const beams = P.beams || 1;
      e.ai.beam = { time: P.warn + P.beamTime, warn: P.warn, angles: [], damage: P.damage, beams };
      const base = Math.atan2(t.ny, t.nx);
      for (let i = 0; i < beams; i++) e.ai.beam.angles.push(base + (i / beams) * Math.PI * 2);
      game.sfx('bossBeam', { gain: 0.4 });
    }
    // Drift slowly so beams sweep.
    e.ai.orbitA = (e.ai.orbitA || e.seedPhase) + dt * 0.5;
    const tx = t.p.x + Math.cos(e.ai.orbitA) * 150;
    const ty = t.p.y + Math.sin(e.ai.orbitA) * 150;
    const dir = norm(tx - e.x, ty - e.y);
    e.vx = dir.x * e.speed;
    e.vy = dir.y * e.speed;
    applyMove(game, e, dt);

    if (e.ai.beam && e.ai.beam.warn <= 0) {
      for (const a of e.ai.beam.angles) {
        game.beamDamage(e.x, e.y, a, 600, e.ai.beam.damage, TEAM.ENEMY, dt);
      }
    }
  },
};

function nearestWallNormal(game, e) {
  const tiles = game.room.tiles;
  const probes = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const p of probes) {
    if (circleBlocked(tiles, e.x + p.x * TILE * 1.1, e.y + p.y * TILE * 1.1, e.radius, walkOpts(e))) {
      return p;
    }
  }
  return null;
}

export function getBehavior(name) {
  return BEHAVIORS[name] || BEHAVIORS.chaser;
}

export { fireShot as enemyFireShot, toPlayer as aimAtPlayer, steer as steerEnemy, separate as separateEnemy, applyMove as moveEnemy };
