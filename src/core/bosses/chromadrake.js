/**
 * Final boss — Хромадракон, the prismatic dragon.
 *
 * Signature mechanic: the dragon cycles through four elemental colours, and its
 * current colour dictates the attack it is about to use. The fight stays legible
 * at its densest because the tell is the entire creature changing hue.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, toPlayer, moveToward, faceTarget, radial, fan, bullet, chooseAttack, endAttack, groundStrike } from './base.js';
import { SPRITE } from '../../data/sprite-ids.js';

const COLORS = [
  { id: 'ruby', color: [1, 0.31, 0.64], attack: 'breath' },
  { id: 'azure', color: [0.31, 0.88, 1], attack: 'shardStorm' },
  { id: 'gold', color: [1, 0.88, 0.31], attack: 'hoardBurst' },
  { id: 'jade', color: [0.49, 1, 0.42], attack: 'whelps' },
];

export function createChromadrake(game, x, z) {
  const b = makeBoss({
    id: 'chromadrake',
    name: 'ХРОМАДРАКОН',
    title: 'страж сокровищницы',
    art: 'chromadrake',
    x, z,
    radius: 2.2,
    hp: 1900,
    speed: 5.0,
    touch: 2,
    armor: 3,
    flying: true,
    phaseThresholds: [0.72, 0.4],
    update,
    onPhase(g, boss, phase) {
      if (phase === 2) {
        g.message('ЧЕШУЯ РАСКАЛЫВАЕТСЯ НА ЦВЕТА', '', 2.2);
        boss.speed = 6.2;
      }
      if (phase === 3) {
        g.message('ПРИЗМАТИЧЕСКАЯ ЯРОСТЬ', '', 2.4);
        boss.speed = 7.4;
      }
    },
  });
  b.mem.colorIndex = 0;
  b.colorId = COLORS[0].id;
  b.tint = COLORS[0].color;
  return b;
}

function cycleColor(game, b) {
  b.mem.colorIndex = (b.mem.colorIndex + 1) % COLORS.length;
  const c = COLORS[b.mem.colorIndex];
  b.colorId = c.id;
  b.tint = c.color;
  b.light.r = c.color[0];
  b.light.g = c.color[1];
  b.light.b = c.color[2];
  game.fx('spawn', { x: b.x, y: b.y + 1.5, z: b.z, color: c.color });
  game.sfx('ice', { x: b.x, y: b.y + 1, z: b.z, gain: 0.5, rate: 1 + b.mem.colorIndex * 0.12 });
}

function update(game, b, dt) {
  b.t += dt;
  b.bob = Math.sin(b.t * 1.6) * 0.25;
  checkPhase(game, b);
  const t = toPlayer(game, b);

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt, t);
    return;
  }

  b.cd -= dt;
  // Slow figure-eight flight: always moving, never unhittable.
  const a = b.t * 0.5;
  moveToward(game, b, t.p.x + Math.cos(a) * 9, t.p.z + Math.sin(a * 2) * 7, b.speed, dt);
  faceTarget(b, t, dt, 2.5);
  if (game.rng.chance(dt * 12)) {
    game.fx('ember', {
      x: b.x + game.rng.range(-2, 2), y: b.y + 1.5, z: b.z + game.rng.range(-2, 2), color: b.tint,
    });
  }

  if (b.cd <= 0) {
    cycleColor(game, b);
    const entry = COLORS[b.mem.colorIndex];
    if (b.phase === 3 && game.rng.chance(0.32)) b.attack = 'prismRain';
    else if (game.rng.chance(0.24)) b.attack = 'dive';
    else b.attack = entry.attack;
    b.attackT = 0;
  }
}

function runAttack(game, b, dt, t) {
  const T = b.attackT;
  switch (b.attack) {
    case 'breath': {
      if (T < 0.75) {
        b.telegraph = 1 - T / 0.75;
        faceTarget(b, t, dt, 6);
        b.mem.a = Math.atan2(t.dx, t.dz);
        break;
      }
      b.telegraph = 0;
      b.mem.breathT = (b.mem.breathT || 0) - dt;
      const sweep = b.mem.a + Math.sin((T - 0.75) * 2.6) * 0.6;
      if (b.mem.breathT <= 0 && T < 2.8) {
        b.mem.breathT = 0.05;
        bullet(game, b, sweep + game.rng.range(-0.16, 0.16), {
          speed: 20, damage: 2, burn: 1, life: 1.6, radius: 0.3,
          color: [1, 0.31, 0.64], sprite: SPRITE.FLAME,
        });
      }
      if (T > 3.0) {
        b.mem.breathT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    case 'shardStorm': {
      if (!b.mem.shards) {
        b.mem.shards = true;
        const n = 7 + b.phase * 2;
        for (let i = 0; i < n; i++) {
          groundStrike(
            game, b,
            t.p.x + game.rng.range(-10, 10),
            t.p.z + game.rng.range(-10, 10),
            2.0, 3, 0.45 + i * 0.13, [0.31, 0.88, 1],
          );
        }
        game.sfx('ice', { x: b.x, y: b.y + 1, z: b.z, gain: 0.8 });
      }
      if (T > 3.0) {
        b.mem.shards = false;
        endAttack(b, 1.1);
      }
      break;
    }

    case 'hoardBurst': {
      if (T < 0.6) {
        b.telegraph = 1 - T / 0.6;
        break;
      }
      b.telegraph = 0;
      b.mem.burstT = (b.mem.burstT || 0) - dt;
      if (b.mem.burstT <= 0 && T < 3.0) {
        b.mem.burstT = 0.3;
        radial(game, b, 12, {
          offset: b.t * 2.0, speed: 13, damage: 2, bounce: 1, color: [1, 0.88, 0.31], sprite: SPRITE.STAR,
        });
      }
      if (T > 3.3) {
        b.mem.burstT = 0;
        endAttack(b, 1.1);
      }
      break;
    }

    case 'whelps': {
      if (T < 0.7) {
        b.telegraph = 1 - T / 0.7;
        break;
      }
      if (!b.mem.called) {
        b.mem.called = true;
        game.spawnMinions(b, { id: 'dragonWhelp', count: b.phase >= 2 ? 2 : 1, max: 4 });
        game.spawnMinions(b, { id: 'prismSprite', count: 2, max: 6 });
        game.sfx('spawn', { x: b.x, y: b.y + 1, z: b.z });
        fan(game, b, Math.atan2(t.dx, t.dz), 7, 1.4, { speed: 12, damage: 2, color: [0.49, 1, 0.42] });
      }
      if (T > 1.5) {
        b.mem.called = false;
        endAttack(b, 1.5);
      }
      break;
    }

    case 'dive': {
      if (T < 0.6) {
        b.telegraph = 1 - T / 0.6;
        faceTarget(b, t, dt, 8);
        b.mem.a = Math.atan2(t.dx, t.dz);
        break;
      }
      b.telegraph = 0;
      moveToward(game, b, b.x + Math.sin(b.mem.a) * 14, b.z + Math.cos(b.mem.a) * 14, 22, dt);
      b.mem.trailT = (b.mem.trailT || 0) - dt;
      if (b.mem.trailT <= 0) {
        b.mem.trailT = 0.06;
        game.fx('trail', { x: b.x, y: b.y + 0.6, z: b.z, color: b.tint });
        bullet(game, b, b.mem.a + Math.PI / 2, { speed: 7, damage: 2, life: 2, color: b.tint });
        bullet(game, b, b.mem.a - Math.PI / 2, { speed: 7, damage: 2, life: 2, color: b.tint });
      }
      if (T > 1.7) {
        game.explode(b.x, b.y + 0.5, b.z, 4.5, 3, TEAM.ENEMY);
        game.shake(1.4, 0.35);
        game.sfx('bossSlam', { x: b.x, y: b.y, z: b.z });
        endAttack(b, 1.3);
      }
      break;
    }

    // Phase 3: all four colours at once in a slow, readable spiral.
    case 'prismRain': {
      if (T < 1.0) {
        b.telegraph = 1 - T / 1.0;
        break;
      }
      b.telegraph = 0;
      b.mem.rainT = (b.mem.rainT || 0) - dt;
      if (b.mem.rainT <= 0 && T < 4.5) {
        b.mem.rainT = 0.2;
        for (let i = 0; i < 4; i++) {
          bullet(game, b, b.t * 1.7 + (i / 4) * Math.PI * 2, {
            speed: 11, damage: 2, life: 5, color: COLORS[i].color, sprite: SPRITE.SHARD,
          });
        }
      }
      if (T > 5.0) {
        b.mem.rainT = 0;
        endAttack(b, 1.5);
      }
      break;
    }

    default:
      endAttack(b, 1.2);
  }
}
