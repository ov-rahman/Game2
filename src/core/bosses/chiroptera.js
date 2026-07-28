/**
 * Floor 2 boss — Хироптера, the swarm mother.
 *
 * Fight identity: she is rarely where you last saw her. Phase 2 makes her
 * untouchable until the swarm she splits into is cleared, which turns the
 * fight into crowd control instead of damage racing.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, moveToward, aimAt, radial, fan, bullet, chooseAttack, ARENA } from './base.js';
import { clamp } from '../math.js';

export function createChiroptera(game, x, y) {
  const b = makeBoss({
    id: 'chiroptera',
    name: 'Хироптера',
    title: 'мать стаи',
    sprite: 'chiroptera',
    x,
    y,
    radius: 24,
    hp: 420,
    speed: 96,
    touch: 2,
    flying: true,
    phaseThresholds: [0.66, 0.32],
    update,
    onPhase(g, boss, phase) {
      if (phase === 2) {
        boss.mem.split = true;
        boss.invulnerable = true;
        boss.alpha = 0.45;
        g.spawnMinions(boss, { id: 'bat', count: 6, max: 14 });
        g.message('Стая закрывает её', 'убей летучих мышей', 2.2);
      }
      if (phase === 3) {
        boss.mem.split = false;
        boss.invulnerable = false;
        boss.alpha = 1;
      }
    },
  });
  b.mem.hover = { x: ARENA.cx, y: ARENA.cy - 40 };
  return b;
}

const ATTACKS_P1 = ['sonic', 'swoop', 'summon'];
const ATTACKS_P2 = ['sonic', 'summon', 'echoCross'];
const ATTACKS_P3 = ['sonic', 'swoop', 'echoCross', 'screech'];

function update(game, b, dt) {
  b.t += dt;
  b.wingPhase = b.t * 16;
  checkPhase(game, b);

  // Phase 2 shield drops only when her escorts are gone.
  if (b.mem.split) {
    const bats = game.enemies.filter((e) => e.alive && e.id === 'bat').length;
    if (bats === 0) {
      b.mem.split = false;
      b.invulnerable = false;
      b.alpha = 1;
      game.sfx('synergy');
      game.message('Щит стаи разбит', '', 1.6);
    }
  }

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt);
    return;
  }

  b.cd -= dt;
  // Restless hovering: pick new perches constantly.
  b.mem.hoverT = (b.mem.hoverT || 0) - dt;
  if (b.mem.hoverT <= 0) {
    b.mem.hoverT = game.rng.range(0.7, 1.4);
    b.mem.hover = {
      x: clamp(game.player.x + game.rng.range(-160, 160), ARENA.minX, ARENA.maxX),
      y: clamp(game.player.y + game.rng.range(-120, 120), ARENA.minY, ARENA.maxY),
    };
  }
  moveToward(b, b.mem.hover.x, b.mem.hover.y, b.speed, dt);

  if (b.cd <= 0) {
    const list = b.phase === 1 ? ATTACKS_P1 : b.phase === 2 ? ATTACKS_P2 : ATTACKS_P3;
    chooseAttack(game, b, list);
  }
}

function runAttack(game, b, dt) {
  const T = b.attackT;
  const p = game.player;

  switch (b.attack) {
    // Expanding sonar rings with a safe gap that rotates.
    case 'sonic': {
      b.mem.ringT = (b.mem.ringT || 0) - dt;
      if (T < 0.45) {
        b.ai.telegraph = 1 - T / 0.45;
        break;
      }
      b.ai.telegraph = 0;
      if (b.mem.ringT <= 0 && T < 2.4) {
        b.mem.ringT = 0.6;
        const gap = game.rng.angle();
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          if (Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.55) continue;
          bullet(game, b, b.x, b.y, a, {
            speed: 118,
            damage: 1,
            color: '#3ff0d0',
            radius: 5,
            style: 'sonic',
          });
        }
        game.sfx('enemyShoot', { gain: 0.7, rate: 0.8 });
      }
      if (T > 2.8) {
        b.mem.ringT = 0;
        endAttack(b, 0.9);
      }
      break;
    }

    // Three fast dives with a readable pause between them.
    case 'swoop': {
      if (!b.mem.swoops) b.mem.swoops = 0;
      const cycle = 0.85;
      const local = T - b.mem.swoops * cycle;
      if (local < 0.3) {
        b.ai.telegraph = 1 - local / 0.3;
        b.mem.swoopA = aimAt(b, p);
      } else if (local < 0.62) {
        b.ai.telegraph = 0;
        b.x += Math.cos(b.mem.swoopA) * 420 * dt;
        b.y += Math.sin(b.mem.swoopA) * 420 * dt;
        b.x = clamp(b.x, ARENA.minX, ARENA.maxX);
        b.y = clamp(b.y, ARENA.minY, ARENA.maxY);
        if (game.rng.chance(dt * 24)) game.fx('trail', { x: b.x, y: b.y, color: '#8f7bff' });
      } else {
        b.mem.swoops++;
        if (b.mem.swoops >= 3) {
          b.mem.swoops = 0;
          endAttack(b, 1.0);
        }
      }
      break;
    }

    // Four crossing bullet lines that force diagonal movement.
    case 'echoCross': {
      b.mem.crossT = (b.mem.crossT || 0) - dt;
      if (b.mem.crossT <= 0 && T < 2.6) {
        b.mem.crossT = 0.42;
        const off = b.t * 1.4;
        radial(game, b, 4, {
          offset: off,
          speed: 150,
          damage: 1,
          color: '#8f7bff',
          radius: 6,
          bounce: 1,
          style: 'echo',
        });
      }
      moveToward(b, ARENA.cx, ARENA.cy, 60, dt);
      if (T > 3.0) {
        b.mem.crossT = 0;
        endAttack(b, 0.9);
      }
      break;
    }

    // Phase 3 finisher: a sustained screech that sweeps the arena.
    case 'screech': {
      if (T < 0.9) {
        b.ai.telegraph = 1 - T / 0.9;
        b.mem.beamA = aimAt(b, p);
        break;
      }
      b.ai.telegraph = 0;
      const sweep = b.mem.beamA + (T - 0.9) * 1.5 * (b.mem.sweepDir || 1);
      game.beamDamage(b.x, b.y, sweep, 620, 2, TEAM.ENEMY, dt);
      game.effects.push({
        type: 'beam',
        x: b.x,
        y: b.y,
        angle: sweep,
        len: 620,
        t: 0,
        time: 0.08,
        color: '#3ff0d0',
        width: 9,
      });
      if (T > 2.4) {
        b.mem.sweepDir = (b.mem.sweepDir || 1) * -1;
        endAttack(b, 1.3);
      }
      break;
    }

    case 'summon': {
      if (T < 0.6) {
        b.ai.telegraph = 1 - T / 0.6;
        break;
      }
      if (!b.mem.summoned) {
        b.mem.summoned = true;
        game.spawnMinions(b, { id: 'bat', count: b.phase >= 2 ? 4 : 3, max: 12 });
        game.sfx('spawn');
      }
      if (T > 1.2) {
        b.mem.summoned = false;
        endAttack(b, 1.2);
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
  b.cd = cd;
}
