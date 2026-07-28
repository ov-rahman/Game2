/**
 * Floor 3 boss — Мехокузнец, the forge master.
 *
 * A heavy, positional fight. No lava on this floor, so the pressure comes from
 * shrapnel arcs, dropped anvils and a roaming bellows flame.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, toPlayer, moveToward, faceTarget, radial, fan, bullet, chooseAttack, endAttack, groundStrike } from './base.js';
import { SPRITE } from '../../data/sprite-ids.js';

export function createBellowsmith(game, x, z) {
  return makeBoss({
    id: 'bellowsmith',
    name: 'МЕХОКУЗНЕЦ',
    title: 'мастер горна',
    art: 'bellowsmith',
    x, z,
    radius: 1.7,
    hp: 1500,
    speed: 2.0,
    touch: 4,
    armor: 2,
    phaseThresholds: [0.68, 0.34],
    update,
    onPhase(g, b, phase) {
      if (phase >= 2) g.message('ГОРН РАЗГОРАЕТСЯ', '', 2);
      if (phase >= 3) {
        b.speed = 2.9;
        g.spawnMinions(b, { id: 'emberling', count: 3, max: 8 });
      }
    },
  });
}

const P1 = ['slam', 'shrapnel', 'anvils'];
const P2 = ['slam', 'shrapnel', 'flameSweep', 'anvils'];
const P3 = ['slam', 'flameSweep', 'forgeStorm', 'anvils'];

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
  moveToward(game, b, t.p.x, t.p.z, b.speed, dt);
  if (game.rng.chance(dt * 6)) {
    game.fx('ember', { x: b.x + game.rng.range(-1, 1), y: b.y + 1.6, z: b.z, color: [1, 0.6, 0.2] });
  }
  if (b.cd <= 0) chooseAttack(game, b, b.phase === 1 ? P1 : b.phase === 2 ? P2 : P3);
}

function runAttack(game, b, dt, t) {
  const T = b.attackT;
  switch (b.attack) {
    case 'slam': {
      if (T < 0.8) {
        b.telegraph = 1 - T / 0.8;
        moveToward(game, b, t.p.x, t.p.z, 1.0, dt);
        if (T < dt * 2) {
          game.fx('telegraph', { x: b.x, y: 0.1, z: b.z, radius: 5.5, time: 0.8, color: [1, 0.6, 0.2] });
        }
        break;
      }
      if (!b.mem.slammed) {
        b.mem.slammed = true;
        b.telegraph = 0;
        game.explode(b.x, b.y + 0.5, b.z, 5.5, 4, TEAM.ENEMY);
        game.shake(1.5, 0.4);
        game.sfx('bossSlam', { x: b.x, y: b.y, z: b.z });
        radial(game, b, b.phase >= 2 ? 14 : 10, { speed: 12, damage: 2, color: [1, 0.75, 0.35] });
      }
      if (T > 1.6) {
        b.mem.slammed = false;
        endAttack(b, 1.2);
      }
      break;
    }

    case 'shrapnel': {
      if (T < 0.5) {
        b.telegraph = 1 - T / 0.5;
        faceTarget(b, t, dt, 6);
        break;
      }
      b.telegraph = 0;
      b.mem.burst = (b.mem.burst || 0) - dt;
      if (b.mem.burst <= 0 && T < 2.4) {
        b.mem.burst = 0.5;
        fan(game, b, Math.atan2(t.dx, t.dz), 5 + b.phase * 2, 0.7 + b.phase * 0.2, {
          speed: 15, damage: 2, color: [1, 0.85, 0.4], sprite: SPRITE.SHARD,
        });
      }
      if (T > 2.7) {
        b.mem.burst = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    case 'anvils': {
      if (!b.mem.anvils) {
        b.mem.anvils = true;
        const n = 4 + b.phase;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? t.p.x : t.p.x + game.rng.range(-9, 9);
          const z = i === 0 ? t.p.z : t.p.z + game.rng.range(-9, 9);
          groundStrike(game, b, x, z, 2.4, 3, 0.7 + i * 0.2, [1, 0.85, 0.35]);
        }
        game.sfx('charge', { x: b.x, y: b.y + 1, z: b.z });
      }
      if (T > 2.4) {
        b.mem.anvils = false;
        endAttack(b, 1.2);
      }
      break;
    }

    case 'flameSweep': {
      if (T < 0.8) {
        b.telegraph = 1 - T / 0.8;
        faceTarget(b, t, dt, 6);
        b.mem.a = Math.atan2(t.dx, t.dz) - 1.0 * (b.mem.dir || 1);
        break;
      }
      b.telegraph = 0;
      b.mem.flameT = (b.mem.flameT || 0) - dt;
      const a = b.mem.a + (T - 0.8) * 1.4 * (b.mem.dir || 1);
      if (b.mem.flameT <= 0 && T < 2.8) {
        b.mem.flameT = 0.06;
        bullet(game, b, a, {
          speed: 18, damage: 2, burn: 1, life: 1.4, color: [1, 0.5, 0.18], sprite: SPRITE.FLAME, radius: 0.3,
        });
      }
      if (T > 3.0) {
        b.mem.dir = (b.mem.dir || 1) * -1;
        b.mem.flameT = 0;
        game.sfx('fire', { x: b.x, y: b.y + 1, z: b.z, gain: 0.8 });
        endAttack(b, 1.2);
      }
      break;
    }

    case 'forgeStorm': {
      if (T < 1.0) {
        b.telegraph = 1 - T / 1.0;
        break;
      }
      b.telegraph = 0;
      b.mem.stormT = (b.mem.stormT || 0) - dt;
      if (b.mem.stormT <= 0 && T < 4.2) {
        b.mem.stormT = 0.3;
        radial(game, b, 11, { offset: b.t * 2.0, speed: 11, damage: 2, color: [1, 0.55, 0.25] });
        if (game.rng.chance(0.35)) game.spawnMinions(b, { id: 'emberling', count: 1, max: 8 });
      }
      if (T > 4.6) {
        b.mem.stormT = 0;
        endAttack(b, 1.6);
      }
      break;
    }

    default:
      endAttack(b, 1.2);
  }
}
