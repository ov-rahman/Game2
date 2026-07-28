/**
 * Projectile simulation and damage resolution.
 *
 * Kept separate from game.js so the "what happens when something is hit" rules
 * live in one readable place: modifiers are applied in a fixed order and every
 * exit path releases the shot back to the pool.
 */
import { TILE, ROOM_W, ROOM_H, TEAM, T } from './constants.js';
import { tileAtWorld, blocks } from './world/collision.js';
import { clamp, angleDelta } from './math.js';

const ROOM_MAX_X = ROOM_W * TILE;
const ROOM_MAX_Y = ROOM_H * TILE;

export function updateShots(game, dt) {
  const pool = game.shots;
  const items = pool.items;
  for (let i = 0; i < pool.cap; i++) {
    const s = items[i];
    if (!s.active) continue;
    stepShot(game, s, dt);
  }
}

function stepShot(game, s, dt) {
  s.px = s.x;
  s.py = s.y;
  s.age += dt;
  s.life -= dt;

  if (s.life <= 0) {
    expire(game, s);
    return;
  }

  // ---- steering --------------------------------------------------------
  if (s.homing > 0) {
    const target =
      s.team === TEAM.PLAYER ? game.nearestEnemy(s.x, s.y, 220) : game.player.dead ? null : game.player;
    if (target) {
      const want = Math.atan2(target.y - s.y, target.x - s.x);
      const d = angleDelta(s.angle, want);
      s.angle += clamp(d, -s.homing * 6 * dt, s.homing * 6 * dt);
      s.vx = Math.cos(s.angle) * s.speed;
      s.vy = Math.sin(s.angle) * s.speed;
    }
  }

  if (s.boomerang) {
    const half = s.maxLife * 0.45;
    if (s.age > half && s.owner) {
      const want = Math.atan2(s.owner.y - s.y, s.owner.x - s.x);
      const d = angleDelta(s.angle, want);
      s.angle += clamp(d, -9 * dt, 9 * dt);
      s.vx = Math.cos(s.angle) * s.speed;
      s.vy = Math.sin(s.angle) * s.speed;
      const dd = Math.hypot(s.owner.x - s.x, s.owner.y - s.y);
      if (dd < 12 && s.age > half + 0.15) {
        game.shots.release(s);
        return;
      }
    }
  }

  if (s.gravity && s.team === TEAM.PLAYER) {
    game.pullEnemiesToward(s.x, s.y, 68, 190 * dt);
  }

  // Enemy shots can be slowed by the player's Песок времени.
  const speedMul = s.team === TEAM.ENEMY && game.player.flags.slowEnemyShots
    ? 1 - Math.min(0.7, game.player.flags.slowEnemyShots)
    : 1;

  const nx = s.x + s.vx * dt * speedMul * game.timeScale;
  const ny = s.y + s.vy * dt * speedMul * game.timeScale;

  // ---- terrain ---------------------------------------------------------
  if (!s.spectral) {
    const tile = tileAtWorld(game.room.tiles, nx, ny);
    const solid = tile === T.WALL || tile === T.ROCK;
    if (solid || nx < 4 || ny < 4 || nx > ROOM_MAX_X - 4 || ny > ROOM_MAX_Y - 4) {
      if (tile === T.ROCK && s.team === TEAM.PLAYER) {
        game.damageRock(nx, ny, s.explosive ? 99 : 1);
      }
      if (s.bounce > 0) {
        s.bounce--;
        // Reflect off whichever axis actually blocked.
        const hitX = tileAtWorld(game.room.tiles, nx, s.y) === T.WALL ||
          tileAtWorld(game.room.tiles, nx, s.y) === T.ROCK ||
          nx < 4 || nx > ROOM_MAX_X - 4;
        if (hitX) s.vx = -s.vx;
        else s.vy = -s.vy;
        s.angle = Math.atan2(s.vy, s.vx);
        game.fx('spark', { x: s.x, y: s.y, color: s.color });
        game.sfx('block', { gain: 0.18 });
        return;
      }
      impactTerrain(game, s);
      return;
    }
  } else if (nx < 2 || ny < 2 || nx > ROOM_MAX_X - 2 || ny > ROOM_MAX_Y - 2) {
    impactTerrain(game, s);
    return;
  }

  s.x = nx;
  s.y = ny;

  // ---- entities --------------------------------------------------------
  if (s.team === TEAM.PLAYER) {
    const enemies = game.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.hidden || e.invulnerable) continue;
      const rr = e.radius + s.radius;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (s.hitIds && s.hitIds.has(e.uid)) continue;

      // Shielded enemies deflect shots arriving inside the shield arc.
      if (e.shieldArc > 0) {
        const inc = Math.atan2(s.y - e.y, s.x - e.x);
        if (Math.abs(angleDelta(e.shieldAngle, inc)) < e.shieldArc / 2) {
          game.fx('spark', { x: s.x, y: s.y, color: '#ffffff' });
          game.sfx('block');
          if (s.bounce > 0) {
            s.bounce--;
            s.angle += Math.PI + game.rng.range(-0.4, 0.4);
            s.vx = Math.cos(s.angle) * s.speed;
            s.vy = Math.sin(s.angle) * s.speed;
            return;
          }
          game.shots.release(s);
          return;
        }
      }

      hitEnemy(game, s, e);
      if (!s.active) return;
    }
  } else {
    const p = game.player;
    if (!p.dead && p.invuln <= 0 && !(p.dashT > 0 && p.flags.phaseDash)) {
      const rr = p.radius + s.radius;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (dx * dx + dy * dy <= rr * rr) {
        game.damagePlayer(s.damage, { source: 'shot', burn: s.burn });
        if (s.puddle) game.spawnGoo(s.x, s.y, s.puddle);
        game.shots.release(s);
        return;
      }
    }
  }
}

function impactTerrain(game, s) {
  if (s.explosive) {
    game.explode(s.x, s.y, 42 + s.explosive * 8, s.damage * 1.4, s.team, { napalm: s.napalm });
  } else {
    game.fx('spark', { x: s.x, y: s.y, color: s.color });
  }
  if (s.puddle) game.spawnGoo(s.x, s.y, s.puddle);
  game.shots.release(s);
}

function expire(game, s) {
  if (s.explosive) {
    game.explode(s.x, s.y, 42 + s.explosive * 8, s.damage * 1.4, s.team, { napalm: s.napalm });
  }
  if (s.puddle) game.spawnGoo(s.x, s.y, s.puddle);
  if (s.starfall) game.spawnStarfall(4, s.damage * 0.6);
  game.shots.release(s);
}

function hitEnemy(game, s, e) {
  const dmg = s.damage;
  game.damageEnemy(e, dmg, {
    source: 'shot',
    crit: s.crit,
    knockback: s.knockback,
    kx: s.vx,
    ky: s.vy,
    burn: s.burn,
    freeze: s.freeze,
    poison: s.poison,
    shock: s.shock,
    shot: s,
  });

  game.fx('hit', { x: s.x, y: s.y, color: s.color, crit: s.crit });

  if (s.chain > 0) {
    let from = e;
    let jumps = s.chain;
    const visited = new Set([e.uid]);
    while (jumps-- > 0) {
      const next = game.nearestEnemy(from.x, from.y, 130, visited);
      if (!next) break;
      visited.add(next.uid);
      game.damageEnemy(next, dmg * 0.6, { source: 'chain', kind: 'shock', shock: s.shock });
      game.fx('chain', { x1: from.x, y1: from.y, x2: next.x, y2: next.y, color: '#ffe066' });
      if (s.spreadBurn && e.burn > 0) game.applyBurn(next, 3, 3);
      from = next;
    }
    game.sfx('shock', { gain: 0.4 });
  }

  if (s.splitOnHit > 0) {
    for (let i = 0; i < s.splitOnHit; i++) {
      const c = game.spawnShot(s.team);
      if (!c) break;
      const a = s.angle + (i - (s.splitOnHit - 1) / 2) * 0.7 + Math.PI * 0.0;
      c.x = c.px = s.x;
      c.y = c.py = s.y;
      c.angle = a;
      c.speed = s.speed * 0.85;
      c.vx = Math.cos(a) * c.speed;
      c.vy = Math.sin(a) * c.speed;
      c.damage = s.damage * 0.5;
      c.radius = Math.max(2.5, s.radius * 0.7);
      c.life = c.maxLife = s.maxLife * 0.5;
      c.color = s.color;
      c.burn = s.burn;
      c.freeze = s.freeze;
      c.poison = s.poison;
      c.owner = s.owner;
      c.style = 'shard';
      c.hitIds = new Set([e.uid]);
    }
  }

  if (s.explosive) {
    game.explode(s.x, s.y, 44 + s.explosive * 10, s.damage * 1.2, s.team, { napalm: s.napalm });
    game.shots.release(s);
    return;
  }

  if (s.pierce > 0) {
    s.pierce--;
    if (!s.hitIds) s.hitIds = new Set();
    s.hitIds.add(e.uid);
    s.damage *= 0.88;
    return;
  }

  if (s.boomerang) {
    if (!s.hitIds) s.hitIds = new Set();
    s.hitIds.add(e.uid);
    return;
  }

  game.shots.release(s);
}

// ---------------------------------------------------------------- effects

export function updateEffects(game, dt) {
  const fx = game.effects;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    switch (f.type) {
      case 'shockwave': {
        f.r = f.radius * Math.min(1, f.t / 0.22);
        if (!f.done && f.t >= 0.06) {
          f.done = true;
          if (f.team === TEAM.PLAYER) {
            game.damageEnemiesNear(f.x, f.y, f.radius, f.damage, 'shockwave', f.stun);
          } else if (!game.player.dead) {
            const d = Math.hypot(game.player.x - f.x, game.player.y - f.y);
            if (d < f.radius + game.player.radius) game.damagePlayer(f.damage, { source: 'shockwave' });
          }
        }
        if (f.t > 0.4) fx.splice(i, 1);
        break;
      }
      case 'goo': {
        if (f.damage > 0) {
          f.tick = (f.tick || 0) + dt;
          if (f.tick > 0.5) {
            f.tick = 0;
            if (!game.player.dead) {
              const d = Math.hypot(game.player.x - f.x, game.player.y - f.y);
              if (d < f.radius + game.player.radius && !(game.player.flags.fireImmune && f.kind === 'lava')) {
                game.damagePlayer(f.damage, { source: 'goo' });
              }
            }
          }
        }
        if (f.t > f.time) fx.splice(i, 1);
        break;
      }
      case 'cloud': {
        f.tick = (f.tick || 0) + dt;
        if (f.tick > 0.45) {
          f.tick = 0;
          if (f.team === TEAM.PLAYER) {
            game.damageEnemiesNear(f.x, f.y, f.radius, f.damage, 'cloud');
          } else if (!game.player.dead) {
            const d = Math.hypot(game.player.x - f.x, game.player.y - f.y);
            if (d < f.radius) game.damagePlayer(f.damage, { source: 'cloud' });
          }
        }
        if (f.t > f.time) fx.splice(i, 1);
        break;
      }
      case 'telegraph': {
        if (f.t > f.time) fx.splice(i, 1);
        break;
      }
      case 'bomb': {
        f.fuseT -= dt;
        if (f.fuseT <= 0) {
          game.explode(f.x, f.y, 74, f.damage, TEAM.PLAYER, { rocks: true });
          fx.splice(i, 1);
        } else if (Math.floor(f.fuseT * 6) !== f.lastBeep) {
          f.lastBeep = Math.floor(f.fuseT * 6);
          game.sfx('fuse');
        }
        break;
      }
      case 'beam': {
        if (f.t > f.time) fx.splice(i, 1);
        break;
      }
      case 'starfall': {
        f.delay -= dt;
        if (f.delay <= 0 && !f.done) {
          f.done = true;
          game.explode(f.x, f.y, 40, f.damage, TEAM.PLAYER, {});
          game.fx('starimpact', { x: f.x, y: f.y });
        }
        if (f.t > 1.4) fx.splice(i, 1);
        break;
      }
      default:
        if (f.t > (f.time || 1)) fx.splice(i, 1);
    }
  }
}
