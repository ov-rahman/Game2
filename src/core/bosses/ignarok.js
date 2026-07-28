/**
 * Floor 4 boss — Игнарок, the lava maw.
 *
 * The arena is the weapon: Игнарок reshapes the floor with lava and forces the
 * player onto shrinking safe ground while geysers track them.
 */
import { TEAM, C, CELL } from '../constants.js';
import { makeBoss, checkPhase, toPlayer, moveToward, faceTarget, radial, fan, bullet, chooseAttack, endAttack, groundStrike } from './base.js';
import { SPRITE } from '../../data/sprite-ids.js';

export function createIgnarok(game, x, z) {
  return makeBoss({
    id: 'ignarok',
    name: 'ИГНАРОК',
    title: 'лавовая пасть',
    art: 'ignarok',
    x, z,
    radius: 2.0,
    hp: 1900,
    speed: 2.6,
    touch: 4,
    armor: 2,
    phaseThresholds: [0.7, 0.35],
    update,
    onPhase(g, b, phase) {
      if (phase === 2) g.message('ОЗЕРО ВСКИПАЕТ', '', 2);
      if (phase === 3) {
        g.message('ИГНАРОК ВЫХОДИТ ЦЕЛИКОМ', '', 2.2);
        b.speed = 3.6;
      }
    },
  });
}

const P1 = ['geyser', 'spew', 'dive'];
const P2 = ['geyser', 'spew', 'dive', 'lavaWave'];
const P3 = ['geyser', 'lavaWave', 'eruption', 'dive'];

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
  // Circles rather than charging head-on.
  b.mem.orbit = (b.mem.orbit || 0) + dt * 0.6;
  moveToward(game, b, t.p.x + Math.cos(b.mem.orbit) * 7, t.p.z + Math.sin(b.mem.orbit) * 7, b.speed, dt);
  if (game.rng.chance(dt * 8)) {
    game.fx('ember', { x: b.x + game.rng.range(-1.5, 1.5), y: b.y + 0.8, z: b.z, color: [1, 0.45, 0.12] });
  }
  if (b.cd <= 0) chooseAttack(game, b, b.phase === 1 ? P1 : b.phase === 2 ? P2 : P3);
}

function runAttack(game, b, dt, t) {
  const T = b.attackT;
  switch (b.attack) {
    // Geysers marked where the player is *going*, not where they are.
    case 'geyser': {
      if (!b.mem.marks) {
        b.mem.marks = true;
        const n = 4 + b.phase;
        const vx = (t.p.x - t.p.px) * 60;
        const vz = (t.p.z - t.p.pz) * 60;
        for (let i = 0; i < n; i++) {
          const lead = 0.3 + i * 0.16;
          groundStrike(game, b, t.p.x + vx * lead, t.p.z + vz * lead, 2.6, 3, 0.5 + i * 0.22, [1, 0.45, 0.15]);
        }
        game.sfx('charge', { x: b.x, y: b.y + 1, z: b.z, rate: 0.8 });
      }
      if (T > 2.6) {
        b.mem.marks = false;
        endAttack(b, 1.2);
      }
      break;
    }

    // Arcing magma globs that leave burning pools.
    case 'spew': {
      if (T < 0.6) {
        b.telegraph = 1 - T / 0.6;
        faceTarget(b, t, dt, 5);
        break;
      }
      b.telegraph = 0;
      b.mem.spewT = (b.mem.spewT || 0) - dt;
      if (b.mem.spewT <= 0 && T < 2.4) {
        b.mem.spewT = 0.35;
        for (let i = 0; i < 4 + b.phase; i++) {
          const s = bullet(game, b, Math.atan2(t.dx, t.dz) + game.rng.range(-0.6, 0.6), {
            speed: 13, damage: 2, burn: 1, gravity: 7, vy: 4.5, color: [1, 0.5, 0.15], sprite: SPRITE.FLAME,
          });
          if (s) s.puddle = { radius: 2.2, time: 5, damage: 2, fire: true };
        }
      }
      if (T > 2.7) {
        b.mem.spewT = 0;
        endAttack(b, 1.2);
      }
      break;
    }

    // Submerge, become untargetable, erupt beneath the player.
    case 'dive': {
      if (T < 0.5) {
        b.telegraph = 1 - T / 0.5;
        break;
      }
      if (T < 1.6) {
        b.invulnerable = true;
        b.hidden = true;
        moveToward(game, b, t.p.x, t.p.z, 11, dt);
        if (game.rng.chance(dt * 20)) game.fx('rubble', { x: b.x, y: 0.1, z: b.z });
        if (T > 1.3 && !b.mem.dived) {
          b.mem.dived = true;
          game.fx('telegraph', { x: b.x, y: 0.1, z: b.z, radius: 4.5, time: 0.3, color: [1, 0.45, 0.15] });
        }
        break;
      }
      if (b.hidden) {
        b.hidden = false;
        b.invulnerable = false;
        game.explode(b.x, b.y + 0.6, b.z, 5, 4, TEAM.ENEMY);
        radial(game, b, 12, { speed: 14, damage: 2, color: [1, 0.7, 0.25] });
        game.shake(1.6, 0.4);
        game.sfx('explode', { x: b.x, y: b.y, z: b.z });
      }
      if (T > 2.3) {
        b.mem.dived = false;
        endAttack(b, 1.3);
      }
      break;
    }

    // A wall of lava sweeps across with a single gap.
    case 'lavaWave': {
      if (T < 0.9) {
        b.telegraph = 1 - T / 0.9;
        if (!b.mem.wave) {
          b.mem.wave = { a: Math.atan2(t.dx, t.dz), gap: game.rng.range(-3, 3) };
        }
        break;
      }
      b.telegraph = 0;
      if (!b.mem.waveFired) {
        b.mem.waveFired = true;
        const a = b.mem.wave.a;
        const px = Math.cos(a);
        const pz = -Math.sin(a);
        for (let i = -7; i <= 7; i++) {
          if (Math.abs(i - b.mem.wave.gap) < 1.6) continue;
          const s = bullet(game, b, a, {
            speed: 10, damage: 3, burn: 1, life: 6, radius: 0.4, color: [1, 0.4, 0.12], sprite: SPRITE.FLAME,
          });
          if (s) {
            s.x = s.px = b.x + px * i * 1.5;
            s.z = s.pz = b.z + pz * i * 1.5;
          }
        }
        game.sfx('fire', { x: b.x, y: b.y, z: b.z, gain: 1 });
        game.shake(0.8, 0.35);
      }
      if (T > 2.0) {
        b.mem.wave = null;
        b.mem.waveFired = false;
        endAttack(b, 1.4);
      }
      break;
    }

    // Phase 3 spectacle: dense spiral plus pools everywhere.
    case 'eruption': {
      if (T < 1.0) {
        b.telegraph = 1 - T / 1.0;
        break;
      }
      b.telegraph = 0;
      b.mem.erT = (b.mem.erT || 0) - dt;
      if (b.mem.erT <= 0 && T < 4.2) {
        b.mem.erT = 0.24;
        radial(game, b, 10, { offset: b.t * 2.6, speed: 12, damage: 2, color: [1, 0.7, 0.25] });
        if (game.rng.chance(0.5)) {
          game.spawnPuddle(t.p.x + game.rng.range(-8, 8), t.p.z + game.rng.range(-8, 8), {
            radius: 2.2, time: 5, damage: 2, fire: true,
          });
        }
      }
      if (T > 4.6) {
        b.mem.erT = 0;
        endAttack(b, 1.7);
      }
      break;
    }

    default:
      endAttack(b, 1.2);
  }
}
