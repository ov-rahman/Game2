/**
 * Floor 2 boss — Хироптера, the swarm mother.
 *
 * Fight identity: she is rarely where you last saw her, and phase 2 makes her
 * untouchable until the swarm she hides behind is cleared — the fight becomes
 * crowd control instead of a damage race.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, toPlayer, moveToward, faceTarget, radial, bullet, chooseAttack, endAttack } from './base.js';
import { SPRITE } from '../../data/sprite-ids.js';

export function createChiroptera(game, x, z) {
  const b = makeBoss({
    id: 'chiroptera',
    name: 'ХИРОПТЕРА',
    title: 'мать стаи',
    art: 'chiroptera',
    x, z,
    radius: 1.4,
    hp: 620,
    speed: 6.0,
    touch: 2,
    flying: true,
    phaseThresholds: [0.66, 0.32],
    update,
    onPhase(g, boss, phase) {
      if (phase === 2) {
        boss.mem.shielded = true;
        boss.invulnerable = true;
        g.spawnMinions(boss, { id: 'batling', count: 8, max: 16 });
        g.message('СТАЯ ЗАКРЫВАЕТ ЕЁ', 'убей нетопырей', 2.4);
      }
      if (phase === 3) {
        boss.mem.shielded = false;
        boss.invulnerable = false;
      }
    },
  });
  b.mem.hover = { x, z };
  return b;
}

const P1 = ['sonic', 'swoop', 'summon'];
const P2 = ['sonic', 'summon', 'echoCross'];
const P3 = ['sonic', 'swoop', 'echoCross', 'screech'];

function update(game, b, dt) {
  b.t += dt;
  b.bob = Math.sin(b.t * 3) * 0.2;
  checkPhase(game, b);

  if (b.mem.shielded) {
    const bats = game.enemies.filter((e) => e.alive && e.id === 'batling').length;
    if (bats === 0) {
      b.mem.shielded = false;
      b.invulnerable = false;
      game.sfx('synergy');
      game.message('ЩИТ СТАИ РАЗБИТ', '', 1.8);
    }
  }

  const t = toPlayer(game, b);
  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt, t);
    return;
  }

  b.cd -= dt;
  b.mem.hoverT = (b.mem.hoverT || 0) - dt;
  if (b.mem.hoverT <= 0) {
    b.mem.hoverT = game.rng.range(0.8, 1.6);
    const a = game.rng.angle();
    const r = game.rng.range(6, 12);
    b.mem.hover = { x: t.p.x + Math.cos(a) * r, z: t.p.z + Math.sin(a) * r };
  }
  moveToward(game, b, b.mem.hover.x, b.mem.hover.z, b.speed, dt);
  faceTarget(b, t, dt, 3);

  if (b.cd <= 0) chooseAttack(game, b, b.phase === 1 ? P1 : b.phase === 2 ? P2 : P3);
}

function runAttack(game, b, dt, t) {
  const T = b.attackT;
  switch (b.attack) {
    // Sonar rings with a rotating safe gap.
    case 'sonic': {
      if (T < 0.45) {
        b.telegraph = 1 - T / 0.45;
        break;
      }
      b.telegraph = 0;
      b.mem.ringT = (b.mem.ringT || 0) - dt;
      if (b.mem.ringT <= 0 && T < 2.6) {
        b.mem.ringT = 0.7;
        const gap = game.rng.angle();
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          let d = a - gap;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) < 0.5) continue;
          bullet(game, b, a, { speed: 10, damage: 2, color: [0.35, 1, 0.9] });
        }
        game.sfx('enemyShoot', { x: b.x, y: b.y + 1, z: b.z, gain: 0.9, rate: 0.7 });
      }
      if (T > 3.0) {
        b.mem.ringT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    // Three fast dives with readable pauses.
    case 'swoop': {
      b.mem.swoops = b.mem.swoops || 0;
      const cycle = 0.95;
      const local = T - b.mem.swoops * cycle;
      if (local < 0.35) {
        b.telegraph = 1 - local / 0.35;
        faceTarget(b, t, dt, 8);
        b.mem.a = Math.atan2(t.dx, t.dz);
      } else if (local < 0.7) {
        b.telegraph = 0;
        moveToward(game, b, b.x + Math.sin(b.mem.a) * 12, b.z + Math.cos(b.mem.a) * 12, 20, dt);
        if (game.rng.chance(dt * 25)) game.fx('trail', { x: b.x, y: b.y + 0.4, z: b.z, color: [0.6, 0.5, 1] });
      } else {
        b.mem.swoops++;
        if (b.mem.swoops >= 3) {
          b.mem.swoops = 0;
          endAttack(b, 1.2);
        }
      }
      break;
    }

    // Crossing bouncing bolts that force diagonal movement.
    case 'echoCross': {
      b.mem.crossT = (b.mem.crossT || 0) - dt;
      if (b.mem.crossT <= 0 && T < 2.8) {
        b.mem.crossT = 0.5;
        radial(game, b, 4, { offset: b.t * 1.4, speed: 12, damage: 2, bounce: 2, color: [0.6, 0.5, 1] });
      }
      if (T > 3.2) {
        b.mem.crossT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    // Phase 3: a sustained screech sweeping the arena.
    case 'screech': {
      if (T < 0.9) {
        b.telegraph = 1 - T / 0.9;
        faceTarget(b, t, dt, 6);
        b.mem.a = Math.atan2(t.dx, t.dz) - 0.9;
        break;
      }
      b.telegraph = 0;
      b.mem.beamT = (b.mem.beamT || 0) - dt;
      const a = b.mem.a + (T - 0.9) * 1.4;
      if (b.mem.beamT <= 0 && T < 3.0) {
        b.mem.beamT = 0.05;
        bullet(game, b, a, { speed: 22, damage: 2, life: 1.6, color: [0.35, 1, 0.9], radius: 0.3 });
      }
      if (T > 3.2) {
        b.mem.beamT = 0;
        game.sfx('screech', { x: b.x, y: b.y + 1, z: b.z });
        endAttack(b, 1.5);
      }
      break;
    }

    case 'summon': {
      if (T < 0.6) {
        b.telegraph = 1 - T / 0.6;
        break;
      }
      if (!b.mem.summoned) {
        b.mem.summoned = true;
        game.spawnMinions(b, { id: 'batling', count: 3 + b.phase, max: 14 });
        game.sfx('spawn', { x: b.x, y: b.y + 1, z: b.z });
      }
      if (T > 1.3) {
        b.mem.summoned = false;
        endAttack(b, 1.4);
      }
      break;
    }

    default:
      endAttack(b, 1.2);
  }
}
