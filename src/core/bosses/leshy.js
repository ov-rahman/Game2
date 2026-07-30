/**
 * Floor 1 boss — Леший, the overgrown warden.
 *
 * Teaches the grammar the rest of the game uses: telegraphed ground strikes, a
 * pattern to weave through, and adds that punish standing still.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, toPlayer, moveToward, faceTarget, radial, fan, bullet, chooseAttack, endAttack, groundStrike } from './base.js';
import { SPRITE } from '../../data/sprite-ids.js';

export function createLeshy(game, x, z) {
  return makeBoss({
    id: 'leshy',
    name: 'ЛЕШИЙ',
    title: 'хозяин зарослей',
    art: 'leshy',
    x, z,
    radius: 1.5,
    hp: 480,
    speed: 2.4,
    touch: 2,
    phaseThresholds: [0.62, 0.3],
    update,
  });
}

const P1 = ['roots', 'seeds', 'summon'];
const P2 = ['roots', 'seeds', 'spin', 'charge'];
const P3 = ['spin', 'charge', 'thornRing', 'summon'];

function update(game, b, dt) {
  b.t += dt;
  checkPhase(game, b);
  const t = toPlayer(game, b);

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt, t);
    return;
  }
  b.cd -= dt;
  moveToward(game, b, t.p.x, t.p.z, b.speed * (0.5 + b.phase * 0.2), dt);
  if (b.cd <= 0) chooseAttack(game, b, b.phase === 1 ? P1 : b.phase === 2 ? P2 : P3);
}

function runAttack(game, b, dt, t) {
  const T = b.attackT;
  switch (b.attack) {
    // A line of roots erupts toward the player.
    case 'roots': {
      if (!b.mem.marks) {
        b.mem.marks = true;
        const a = Math.atan2(t.dx, t.dz);
        for (let i = 1; i <= 7; i++) {
          groundStrike(
            game, b,
            b.x + Math.sin(a) * i * 2.2,
            b.z + Math.cos(a) * i * 2.2,
            1.6, 3, 0.35 + i * 0.09, [0.7, 1, 0.35],
          );
        }
        game.sfx('charge', { x: b.x, y: b.y + 1, z: b.z });
      }
      if (T > 1.6) {
        b.mem.marks = false;
        endAttack(b, 1.2);
      }
      break;
    }

    // Lobbed seed volleys.
    case 'seeds': {
      if (T < 0.5) {
        b.telegraph = 1 - T / 0.5;
        faceTarget(b, t, dt);
        break;
      }
      b.telegraph = 0;
      b.mem.count = b.mem.count || 0;
      if (b.mem.count < 3 && T > 0.5 + b.mem.count * 0.4) {
        b.mem.count++;
        fan(game, b, Math.atan2(t.dx, t.dz), 4 + b.phase, 0.8, {
          speed: 13, damage: 2, gravity: 6, vy: 3.5, color: [0.75, 1, 0.4], sprite: SPRITE.SHARD,
        });
      }
      if (T > 2.2) {
        b.mem.count = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    // Spin up, then throw a rotating spiral of thorns.
    case 'spin': {
      if (T < 0.6) {
        b.telegraph = 1 - T / 0.6;
        break;
      }
      b.telegraph = 0;
      b.mem.spinT = (b.mem.spinT || 0) - dt;
      if (b.mem.spinT <= 0 && T < 3.0) {
        b.mem.spinT = 0.16;
        radial(game, b, b.phase >= 3 ? 4 : 3, {
          offset: b.t * 2.4, speed: 11, damage: 2, color: [0.8, 1, 0.4], sprite: SPRITE.SHARD,
        });
      }
      if (T > 3.3) {
        b.mem.spinT = 0;
        endAttack(b, 1.2);
      }
      break;
    }

    // Wind up, then a heavy charge that cracks the ground on arrival.
    case 'charge': {
      if (T < 0.75) {
        b.telegraph = 1 - T / 0.75;
        faceTarget(b, t, dt, 6);
        b.mem.a = Math.atan2(t.dx, t.dz);
        break;
      }
      b.telegraph = 0;
      const before = { x: b.x, z: b.z };
      moveToward(game, b, b.x + Math.sin(b.mem.a) * 10, b.z + Math.cos(b.mem.a) * 10, 13, dt);
      const moved = Math.hypot(b.x - before.x, b.z - before.z);
      if (game.rng.chance(dt * 20)) game.fx('trail', { x: b.x, y: b.y + 0.3, z: b.z, color: [0.5, 0.4, 0.2] });
      if (moved < 0.02 || T > 1.9) {
        game.explode(b.x, b.y + 0.5, b.z, 4.5, 3, TEAM.ENEMY);
        game.shake(1.2, 0.35);
        game.sfx('bossSlam', { x: b.x, y: b.y, z: b.z });
        endAttack(b, 1.4);
      }
      break;
    }

    // Enrage: expanding thorn rings.
    case 'thornRing': {
      b.mem.ringT = (b.mem.ringT || 0) - dt;
      if (b.mem.ringT <= 0 && T < 2.6) {
        b.mem.ringT = 0.65;
        radial(game, b, 14, { offset: game.rng.angle(), speed: 9, damage: 2, color: [1, 0.85, 0.35] });
      }
      moveToward(game, b, t.p.x, t.p.z, 1.5, dt);
      if (T > 3.0) {
        b.mem.ringT = 0;
        endAttack(b, 1.1);
      }
      break;
    }

    case 'summon': {
      if (T < 0.8) {
        b.telegraph = 1 - T / 0.8;
        break;
      }
      if (!b.mem.summoned) {
        b.mem.summoned = true;
        b.telegraph = 0;
        game.spawnMinions(b, { id: b.phase >= 3 ? 'thornhound' : 'creeper', count: 1 + b.phase, max: 8 });
        game.sfx('spawn', { x: b.x, y: b.y + 1, z: b.z });
      }
      if (T > 1.5) {
        b.mem.summoned = false;
        endAttack(b, 1.5);
      }
      break;
    }

    default:
      endAttack(b, 1.2);
  }
}
