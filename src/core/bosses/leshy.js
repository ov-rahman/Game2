/**
 * Floor 1 boss — Леший, the grove warden.
 *
 * Teaches the grammar the rest of the game uses: telegraphed ground attacks,
 * a bullet pattern to weave through, and adds that punish standing still.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, moveToward, aimAt, radial, fan, bullet, chooseAttack, ARENA, telegraphAt } from './base.js';
import { clamp } from '../math.js';

export function createLeshy(game, x, y) {
  return makeBoss({
    id: 'leshy',
    name: 'Леший',
    title: 'хозяин рощи',
    sprite: 'leshy',
    x,
    y,
    radius: 26,
    hp: 320,
    speed: 42,
    touch: 2,
    phaseThresholds: [0.62, 0.3],
    update,
  });
}

const ATTACKS_P1 = ['roots', 'seeds', 'summon'];
const ATTACKS_P2 = ['roots', 'seeds', 'spin', 'charge'];
const ATTACKS_P3 = ['spin', 'charge', 'thornRing', 'summon'];

function update(game, b, dt) {
  b.t += dt;
  checkPhase(game, b);
  const p = game.player;

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt, p);
    return;
  }

  // Idle: amble toward the player and sway.
  b.cd -= dt;
  moveToward(b, p.x, p.y, b.speed * (0.4 + b.phase * 0.18), dt);
  b.squashT = Math.sin(b.t * 3) * 0.1;
  if (b.cd <= 0) {
    const list = b.phase === 1 ? ATTACKS_P1 : b.phase === 2 ? ATTACKS_P2 : ATTACKS_P3;
    chooseAttack(game, b, list);
  }
}

function runAttack(game, b, dt, p) {
  const T = b.attackT;
  switch (b.attack) {
    // Ground spikes erupt in a line toward the player.
    case 'roots': {
      if (!b.mem.rootMarks) {
        b.mem.rootMarks = [];
        const a = aimAt(b, p);
        for (let i = 1; i <= 6; i++) {
          const x = clamp(b.x + Math.cos(a) * i * 42, ARENA.minX, ARENA.maxX);
          const y = clamp(b.y + Math.sin(a) * i * 42, ARENA.minY, ARENA.maxY);
          b.mem.rootMarks.push({ x, y, at: 0.35 + i * 0.09, fired: false });
          telegraphAt(game, x, y, 0.35 + i * 0.09, 26, '#7ee081');
        }
        game.sfx('charge', { gain: 0.5 });
      }
      let done = true;
      for (const m of b.mem.rootMarks) {
        if (m.fired) continue;
        done = false;
        if (T >= m.at) {
          m.fired = true;
          game.spawnShockwave(m.x, m.y, { radius: 28, damage: 2, team: TEAM.ENEMY, color: '#7ee081' });
          game.fx('rootBurst', { x: m.x, y: m.y, color: '#7ee081' });
        }
      }
      if (done || T > 2.2) {
        b.mem.rootMarks = null;
        endAttack(b, 1.0);
      }
      break;
    }

    // Lobbed seed volley that sprouts short-lived thorn bullets.
    case 'seeds': {
      if (T < 0.5) {
        b.ai.telegraph = 1 - T / 0.5;
        break;
      }
      b.ai.telegraph = 0;
      const shots = b.phase >= 2 ? 3 : 2;
      if (!b.mem.seedCount) b.mem.seedCount = 0;
      if (b.mem.seedCount < shots && T > 0.5 + b.mem.seedCount * 0.35) {
        b.mem.seedCount++;
        fan(game, b, aimAt(b, p), 5 + b.phase, 0.9, {
          speed: 130,
          damage: 1,
          color: '#d9ff9c',
          radius: 6,
          style: 'seed',
        });
      }
      if (b.mem.seedCount >= shots && T > 0.5 + shots * 0.35 + 0.3) {
        b.mem.seedCount = 0;
        endAttack(b, 0.9);
      }
      break;
    }

    // Spin up, then throw a rotating spiral of leaves.
    case 'spin': {
      if (T < 0.6) {
        b.spin += dt * 14;
        b.ai.telegraph = 1 - T / 0.6;
        break;
      }
      b.ai.telegraph = 0;
      b.spin += dt * 22;
      b.mem.spinT = (b.mem.spinT || 0) - dt;
      if (b.mem.spinT <= 0) {
        b.mem.spinT = 0.11;
        const arms = b.phase >= 3 ? 4 : 3;
        radial(game, b, arms, {
          offset: b.spin * 0.6,
          speed: 120,
          damage: 1,
          color: '#8ede4a',
          radius: 5,
          style: 'leaf',
        });
      }
      moveToward(b, ARENA.cx, ARENA.cy, 30, dt);
      if (T > 2.6) {
        b.mem.spinT = 0;
        endAttack(b, 1.1);
      }
      break;
    }

    // Wind-up then a heavy charge that cracks the ground on arrival.
    case 'charge': {
      if (T < 0.7) {
        b.ai.telegraph = 1 - T / 0.7;
        b.mem.chargeA = aimAt(b, p);
        break;
      }
      b.ai.telegraph = 0;
      const sp = 330;
      b.x += Math.cos(b.mem.chargeA) * sp * dt;
      b.y += Math.sin(b.mem.chargeA) * sp * dt;
      const hitWall =
        b.x <= ARENA.minX || b.x >= ARENA.maxX || b.y <= ARENA.minY || b.y >= ARENA.maxY;
      b.x = clamp(b.x, ARENA.minX, ARENA.maxX);
      b.y = clamp(b.y, ARENA.minY, ARENA.maxY);
      if (game.rng.chance(dt * 20)) game.fx('trail', { x: b.x, y: b.y, color: '#5c7a35' });
      if (hitWall || T > 1.9) {
        game.spawnShockwave(b.x, b.y, { radius: 70, damage: 2, team: TEAM.ENEMY, color: '#a8c46a' });
        game.shake(8, 0.3);
        game.sfx('bossSlam');
        endAttack(b, 1.2);
      }
      break;
    }

    // Enrage ring: thorns bloom outward in expanding rings.
    case 'thornRing': {
      b.mem.ringT = (b.mem.ringT || 0) - dt;
      if (b.mem.ringT <= 0 && T < 2.2) {
        b.mem.ringT = 0.55;
        radial(game, b, 12, {
          offset: game.rng.angle(),
          speed: 105,
          damage: 1,
          color: '#ffd24a',
          radius: 6,
          style: 'thorn',
        });
      }
      moveToward(b, game.player.x, game.player.y, 20, dt);
      if (T > 2.6) {
        b.mem.ringT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    case 'summon': {
      if (T < 0.8) {
        b.ai.telegraph = 1 - T / 0.8;
        break;
      }
      if (!b.mem.summoned) {
        b.mem.summoned = true;
        b.ai.telegraph = 0;
        const kind = b.phase >= 3 ? 'thornbug' : 'sproutling';
        game.spawnMinions(b, { id: kind, count: b.phase >= 2 ? 3 : 2, max: 7 });
        game.sfx('spawn');
      }
      if (T > 1.4) {
        b.mem.summoned = false;
        endAttack(b, 1.3);
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
