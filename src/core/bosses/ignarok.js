/**
 * Floor 4 boss — Игнарок, the lava maw.
 *
 * The arena is the weapon: Игнарок submerges, reshapes the floor with lava and
 * forces the player onto shrinking safe ground while geysers track them.
 */
import { TEAM, TILE, ROOM_W, ROOM_H, T } from '../constants.js';
import { makeBoss, checkPhase, moveToward, aimAt, radial, fan, bullet, chooseAttack, ARENA, telegraphAt } from './base.js';
import { clamp } from '../math.js';

export function createIgnarok(game, x, y) {
  return makeBoss({
    id: 'ignarok',
    name: 'Игнарок',
    title: 'лавовая пасть',
    sprite: 'ignarok',
    x,
    y,
    radius: 30,
    hp: 720,
    speed: 46,
    touch: 3,
    armor: 1,
    phaseThresholds: [0.7, 0.35],
    update,
    onPhase(g, b, phase) {
      if (phase === 2) g.message('Озеро вскипает', '', 1.8);
      if (phase === 3) {
        g.message('Игнарок выходит целиком', '', 2);
        b.speed = 62;
      }
    },
  });
}

const ATTACKS_P1 = ['geyser', 'spew', 'dive'];
const ATTACKS_P2 = ['geyser', 'spew', 'dive', 'lavaWave'];
const ATTACKS_P3 = ['geyser', 'lavaWave', 'eruption', 'dive'];

function update(game, b, dt) {
  b.t += dt;
  checkPhase(game, b);

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt);
    return;
  }

  b.cd -= dt;
  const p = game.player;
  // Circles the player rather than charging head-on.
  b.mem.orbit = (b.mem.orbit || 0) + dt * 0.7 * (b.mem.dir || 1);
  const tx = p.x + Math.cos(b.mem.orbit) * 140;
  const ty = p.y + Math.sin(b.mem.orbit) * 100;
  moveToward(b, tx, ty, b.speed, dt);
  if (game.rng.chance(dt * 6)) game.fx('ember', { x: b.x + game.rng.range(-16, 16), y: b.y, color: '#ff5722' });

  if (b.cd <= 0) {
    const list = b.phase === 1 ? ATTACKS_P1 : b.phase === 2 ? ATTACKS_P2 : ATTACKS_P3;
    chooseAttack(game, b, list);
  }
}

function runAttack(game, b, dt) {
  const T2 = b.attackT;
  const p = game.player;

  switch (b.attack) {
    // Tracking geysers: they mark where the player *is going*.
    case 'geyser': {
      if (!b.mem.marks) {
        b.mem.marks = [];
        const n = 3 + b.phase;
        for (let i = 0; i < n; i++) {
          const lead = 0.35 + i * 0.12;
          const x = clamp(p.x + (p.x - p.px) * 60 * lead, ARENA.minX, ARENA.maxX);
          const y = clamp(p.y + (p.y - p.py) * 60 * lead, ARENA.minY, ARENA.maxY);
          const at = 0.5 + i * 0.2;
          b.mem.marks.push({ x, y, at, fired: false });
          telegraphAt(game, x, y, at, 38, '#ff5722');
        }
        game.sfx('charge', { gain: 0.5, rate: 0.8 });
      }
      let remaining = false;
      for (const m of b.mem.marks) {
        if (m.fired) continue;
        if (T2 >= m.at) {
          m.fired = true;
          game.spawnShockwave(m.x, m.y, { radius: 42, damage: 2, team: TEAM.ENEMY, color: '#ff5722' });
          game.spawnGoo(m.x, m.y, { radius: 22, time: 3.5, damage: 1, kind: 'lava' });
          game.fx('eruption', { x: m.x, y: m.y, color: '#ff9040' });
          game.sfx('explode', { gain: 0.45, rate: 1.2 });
        } else {
          remaining = true;
        }
      }
      if (!remaining || T2 > 3) {
        b.mem.marks = null;
        endAttack(b, 1.0);
      }
      break;
    }

    // Wide spew of arcing magma globs that leave pools.
    case 'spew': {
      if (T2 < 0.6) {
        b.ai.telegraph = 1 - T2 / 0.6;
        break;
      }
      b.ai.telegraph = 0;
      b.mem.spewT = (b.mem.spewT || 0) - dt;
      if (b.mem.spewT <= 0 && T2 < 2.2) {
        b.mem.spewT = 0.3;
        const shots = fan(game, b, aimAt(b, p), 4 + b.phase, 1.0, {
          speed: 150,
          damage: 1,
          color: '#ff7a2f',
          radius: 7,
          burn: 1,
          style: 'magma',
        });
      }
      if (T2 > 2.5) {
        b.mem.spewT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    // Submerge, become untargetable, erupt beneath the player.
    case 'dive': {
      if (T2 < 0.5) {
        b.ai.telegraph = 1 - T2 / 0.5;
        b.alpha = 1 - T2 / 0.5;
        break;
      }
      if (T2 < 1.5) {
        b.invulnerable = true;
        b.hidden = true;
        b.alpha = 0;
        moveToward(b, p.x, p.y, 260, dt);
        if (game.rng.chance(dt * 18)) game.fx('mound', { x: b.x, y: b.y, color: '#ff5722' });
        if (T2 > 1.2 && !b.mem.dived) {
          b.mem.dived = true;
          telegraphAt(game, b.x, b.y, 0.3, 68, '#ff5722');
        }
        break;
      }
      if (b.hidden) {
        b.hidden = false;
        b.invulnerable = false;
        b.alpha = 1;
        game.spawnShockwave(b.x, b.y, { radius: 74, damage: 2, team: TEAM.ENEMY, color: '#ff9040' });
        radial(game, b, 10, { speed: 165, damage: 1, color: '#ffc93c', radius: 6, style: 'magma' });
        game.shake(9, 0.35);
        game.sfx('explode');
      }
      if (T2 > 2.1) {
        b.mem.dived = false;
        endAttack(b, 1.1);
      }
      break;
    }

    // A wall of lava sweeps across the arena with one gap.
    case 'lavaWave': {
      if (T2 < 0.9) {
        b.ai.telegraph = 1 - T2 / 0.9;
        if (!b.mem.waveSide) {
          b.mem.waveSide = game.rng.int(0, 3);
          b.mem.gap = game.rng.range(0.25, 0.75);
          const horizontal = b.mem.waveSide % 2 === 0;
          for (let i = 0; i < 8; i++) {
            const f = i / 7;
            if (Math.abs(f - b.mem.gap) < 0.16) continue;
            const x = horizontal ? ARENA.minX + f * (ARENA.maxX - ARENA.minX) : b.mem.waveSide === 1 ? ARENA.maxX : ARENA.minX;
            const y = horizontal ? (b.mem.waveSide === 0 ? ARENA.minY : ARENA.maxY) : ARENA.minY + f * (ARENA.maxY - ARENA.minY);
            telegraphAt(game, x, y, 0.9, 26, '#ff4b12');
          }
        }
        break;
      }
      b.ai.telegraph = 0;
      if (!b.mem.waveFired) {
        b.mem.waveFired = true;
        const horizontal = b.mem.waveSide % 2 === 0;
        const dir = b.mem.waveSide === 0 ? Math.PI / 2 : b.mem.waveSide === 2 ? -Math.PI / 2 : b.mem.waveSide === 1 ? Math.PI : 0;
        for (let i = 0; i < 14; i++) {
          const f = i / 13;
          if (Math.abs(f - b.mem.gap) < 0.14) continue;
          const x = horizontal ? ARENA.minX + f * (ARENA.maxX - ARENA.minX) : b.mem.waveSide === 1 ? ARENA.maxX : ARENA.minX;
          const y = horizontal ? (b.mem.waveSide === 0 ? ARENA.minY : ARENA.maxY) : ARENA.minY + f * (ARENA.maxY - ARENA.minY);
          bullet(game, b, x, y, dir, {
            speed: 120,
            damage: 2,
            color: '#ff4b12',
            radius: 9,
            life: 5,
            burn: 1,
            style: 'wave',
          });
        }
        game.sfx('fire', { gain: 0.8 });
        game.shake(5, 0.3);
      }
      if (T2 > 2.0) {
        b.mem.waveSide = 0;
        b.mem.waveFired = false;
        endAttack(b, 1.3);
      }
      break;
    }

    // Phase 3: standing eruption — dense spiral plus pools everywhere.
    case 'eruption': {
      if (T2 < 1.0) {
        b.ai.telegraph = 1 - T2 / 1.0;
        moveToward(b, ARENA.cx, ARENA.cy, 90, dt);
        break;
      }
      b.ai.telegraph = 0;
      b.mem.erT = (b.mem.erT || 0) - dt;
      if (b.mem.erT <= 0 && T2 < 4.0) {
        b.mem.erT = 0.2;
        radial(game, b, 9, {
          offset: b.t * 2.6,
          speed: 140,
          damage: 1,
          color: '#ffc93c',
          radius: 6,
          style: 'magma',
        });
        if (game.rng.chance(0.5)) {
          const x = game.rng.range(ARENA.minX, ARENA.maxX);
          const y = game.rng.range(ARENA.minY, ARENA.maxY);
          game.spawnGoo(x, y, { radius: 20, time: 4, damage: 1, kind: 'lava' });
        }
      }
      if (T2 > 4.5) {
        b.mem.erT = 0;
        endAttack(b, 1.6);
      }
      break;
    }

    default:
      endAttack(b, 1);
  }
}

function endAttack(b, cd) {
  b.attack = null;
  b.attackT = 0;
  b.ai.telegraph = 0;
  b.hidden = false;
  b.invulnerable = false;
  b.alpha = 1;
  b.cd = cd;
}
