/**
 * Projectile simulation and area damage.
 *
 * Kept separate from game.js so the "what happens when something is hit" rules
 * live in one readable place: modifiers apply in a fixed order and every exit
 * path returns the shot to the pool.
 */
import { CELL, WALL_H, TEAM, C } from './constants.js';
import { cellAtWorld, solidFor, blocked } from './world/collision.js';
import { clamp, dist2dSq } from './math3.js';
import { SPRITE } from '../data/sprite-ids.js';

export function updateShots(game, dt) {
  const pool = game.shots;
  for (let i = 0; i < pool.cap; i++) {
    const s = pool.items[i];
    if (s.active) stepShot(game, s, dt);
  }
}

function stepShot(game, s, dt) {
  s.px = s.x;
  s.py = s.y;
  s.pz = s.z;
  s.age += dt;
  s.life -= dt;
  if (s.life <= 0) {
    expire(game, s);
    return;
  }

  // ---- steering --------------------------------------------------------
  if (s.homing > 0) {
    const target = s.team === TEAM.PLAYER ? game.nearestEnemy(s.x, s.z, 14) : game.player.dead ? null : game.player;
    if (target) {
      const ty = target.y + (target === game.player ? game.player.eyeHeight * 0.6 : target.height * 0.5);
      let dx = target.x - s.x;
      let dy = ty - s.y;
      let dz = target.z - s.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const k = clamp(s.homing * 5 * dt, 0, 1);
      s.vx += (dx / d * s.speed - s.vx) * k;
      s.vy += (dy / d * s.speed - s.vy) * k;
      s.vz += (dz / d * s.speed - s.vz) * k;
    }
  }

  if (s.gravity) s.vy -= s.gravity * dt;

  if (s.gravityPull && s.team === TEAM.PLAYER) {
    game.pullEnemiesToward(s.x, s.z, 4, 6 * dt * s.gravityPull);
  }

  const slow = s.team === TEAM.ENEMY ? game.enemyShotSlow : 1;
  const nx = s.x + s.vx * dt * slow;
  const ny = s.y + s.vy * dt * slow;
  const nz = s.z + s.vz * dt * slow;

  // ---- terrain ---------------------------------------------------------
  const cell = cellAtWorld(game.dungeon.cells, nx, nz);
  const hitWall = solidFor(cell, {}) || ny < 0.05 || ny > WALL_H - 0.05;
  if (hitWall) {
    if (cell === C.RUBBLE && s.team === TEAM.PLAYER) {
      game.breakRubble(nx, nz);
    }
    if (s.bounce > 0) {
      s.bounce--;
      // Reflect off whichever axis actually blocked.
      if (ny < 0.05 || ny > WALL_H - 0.05) {
        s.vy = -s.vy;
      } else if (solidFor(cellAtWorld(game.dungeon.cells, nx, s.z), {})) {
        s.vx = -s.vx;
      } else {
        s.vz = -s.vz;
      }
      game.fx('wallHit', { x: s.x, y: s.y, z: s.z });
      game.sfx('wallHit', { x: s.x, y: s.y, z: s.z, gain: 0.4 });
      return;
    }
    impactTerrain(game, s, nx, clamp(ny, 0.1, WALL_H - 0.1), nz);
    return;
  }

  s.x = nx;
  s.y = ny;
  s.z = nz;

  // ---- entities --------------------------------------------------------
  if (s.team === TEAM.PLAYER) {
    const enemies = game.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.hidden || e.invulnerable) continue;
      const rr = e.radius + s.radius;
      if (dist2dSq(e.x, e.z, s.x, s.z) > rr * rr) continue;
      if (s.y < e.y - 0.2 || s.y > e.y + e.height + 0.2) continue;
      if (s.hitIds && s.hitIds.has(e.uid)) continue;

      // Shields deflect anything arriving inside their arc.
      if (e.shieldArc > 0) {
        const inc = Math.atan2(s.x - e.x, s.z - e.z);
        let d = inc - e.shieldAngle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < e.shieldArc / 2) {
          game.fx('hit', { x: s.x, y: s.y, z: s.z, color: [1, 1, 1] });
          game.sfx('block', { x: s.x, y: s.y, z: s.z });
          if (s.bounce > 0) {
            s.bounce--;
            s.vx = -s.vx;
            s.vz = -s.vz;
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
    if (!p.dead && p.invuln <= 0) {
      const rr = p.radius + s.radius;
      if (dist2dSq(p.x, p.z, s.x, s.z) <= rr * rr && s.y > p.y - 0.1 && s.y < p.y + p.height) {
        game.damagePlayer(s.damage, { source: 'shot', burn: s.burn });
        if (s.puddle) game.spawnPuddle(s.x, s.z, s.puddle);
        game.shots.release(s);
        return;
      }
    }
  }
}

/** Blow a shot up where it stopped, honouring the named-synergy behaviours. */
function detonate(game, s, x, y, z, radius, damage) {
  // A black hole gathers before it goes off — that ordering is the whole point
  // of the synergy, so it happens here rather than inside explode().
  if (s.blackhole) game.pullEnemiesToward(x, z, radius * 1.7, 2.6);
  game.explode(x, y, z, radius, damage, s.team, { napalm: s.napalm });
}

function impactTerrain(game, s, x, y, z) {
  if (s.explosive) {
    detonate(game, s, x, y, z, 2.6 + s.explosive * 0.5, s.damage * 1.4);
  } else {
    game.fx('wallHit', { x, y, z });
    game.sfx('wallHit', { x, y, z, gain: 0.35 });
  }
  if (s.puddle) game.spawnPuddle(x, z, s.puddle);
  game.shots.release(s);
}

function expire(game, s) {
  if (s.explosive) {
    detonate(game, s, s.x, s.y, s.z, 2.6 + s.explosive * 0.5, s.damage * 1.4);
  }
  if (s.puddle) game.spawnPuddle(s.x, s.z, s.puddle);
  game.shots.release(s);
}

function hitEnemy(game, s, e) {
  const dmg = s.damage;
  game.damageEnemy(e, dmg, {
    source: 'shot',
    crit: s.crit,
    knockback: s.knockback,
    kx: s.vx,
    kz: s.vz,
    burn: s.burn,
    freeze: s.freeze,
    poison: s.poison,
    shock: s.shock,
    shot: s,
  });

  game.fx('hit', { x: s.x, y: s.y, z: s.z, color: [s.r, s.g, s.b], crit: s.crit });

  if (s.chain > 0) {
    let from = e;
    let jumps = s.chain;
    const visited = new Set([e.uid]);
    while (jumps-- > 0) {
      const next = game.nearestEnemy(from.x, from.z, 6, visited);
      if (!next) break;
      visited.add(next.uid);
      game.damageEnemy(next, dmg * 0.6, { source: 'chain', shock: s.shock });
      game.fx('hit', { x: next.x, y: next.y + next.height * 0.5, z: next.z, color: [1, 0.95, 0.4] });
      if (s.spreadBurn && e.burn > 0) game.applyBurn(next, 3, 3);
      if (s.plague && e.poison > 0) {
        next.poison = Math.max(next.poison, 4);
        next.poisonDps = Math.max(next.poisonDps, 3);
      }
      from = next;
    }
    game.sfx('shock', { x: e.x, y: e.y + 1, z: e.z, gain: 0.5 });
  }

  if (s.gravityPull) game.pullEnemiesToward(s.x, s.z, 5, 2.2 * s.gravityPull);

  // Frozen targets struck by a shatter round burst into shrapnel.
  if (s.shatter && e.frozen > 0 && e.alive) {
    e.frozen = 0;
    game.damageEnemy(e, dmg * 0.9, { source: 'shatter', silent: true, trueDamage: true });
    game.spawnBurst(e.x, e.y + e.height * 0.5, e.z, 6, {
      speed: 15, damage: dmg * 0.45, team: TEAM.PLAYER, freeze: 0.4,
      r: 0.7, g: 0.95, b: 1,
    });
    game.sfx('shock', { x: e.x, y: e.y + 1, z: e.z, gain: 0.5 });
  }

  if (s.splitOnHit > 0) {
    for (let i = 0; i < s.splitOnHit; i++) {
      const c = game.spawnShot(s.team);
      if (!c) break;
      const a = (i / s.splitOnHit) * Math.PI * 2 + game.rng.next();
      c.x = c.px = s.x;
      c.y = c.py = s.y;
      c.z = c.pz = s.z;
      c.speed = s.speed * 0.8;
      c.vx = Math.cos(a) * c.speed;
      c.vy = 0.15 * c.speed;
      c.vz = Math.sin(a) * c.speed;
      c.damage = s.damage * 0.5;
      c.radius = s.radius * 0.7;
      c.size = c.radius * 2;
      c.life = c.maxLife = s.maxLife * 0.55;
      c.burn = s.burn;
      c.freeze = s.freeze;
      c.poison = s.poison;
      c.r = s.r;
      c.g = s.g;
      c.b = s.b;
      c.sprite = SPRITE.SHARD;
      c.owner = s.owner;
      c.hitIds = new Set([e.uid]);
    }
  }

  if (s.explosive) {
    detonate(game, s, s.x, s.y, s.z, 2.8 + s.explosive * 0.6, s.damage * 1.2);
    game.shots.release(s);
    return;
  }

  if (s.pierce > 0) {
    s.pierce--;
    if (!s.hitIds) s.hitIds = new Set();
    s.hitIds.add(e.uid);
    s.damage *= 0.9;
    return;
  }

  game.shots.release(s);
}

// ------------------------------------------------------------------ areas

export function updateAreas(game, dt) {
  const list = game.areas;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    a.t += dt;
    if (a.t > a.time) {
      list.splice(i, 1);
      continue;
    }
    a.tick -= dt;
    if (a.tick > 0) continue;
    a.tick = 0.5;

    if (a.team === TEAM.PLAYER) {
      game.damageEnemiesNear(a.x, a.z, a.radius, a.damage, 'area');
    } else if (!game.player.dead) {
      const p = game.player;
      if (dist2dSq(p.x, p.z, a.x, a.z) < a.radius * a.radius) {
        game.damagePlayer(a.damage, { source: 'area', burn: a.fire ? 1 : 0 });
      }
    }
    if (game.rng.chance(0.7)) {
      game.fx('ember', {
        x: a.x + game.rng.range(-a.radius, a.radius),
        y: 0.15,
        z: a.z + game.rng.range(-a.radius, a.radius),
        color: a.color,
      });
    }
  }
}
