/**
 * Floor 3 boss — Мехокузнец, the forge master.
 *
 * A heavy, positional fight: slow but overwhelming attacks that punish standing
 * anywhere predictable. No lava on this floor, so the pressure comes from
 * shrapnel arcs, the anvil slam and the roaming bellows flame.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, moveToward, aimAt, radial, fan, bullet, chooseAttack, ARENA, telegraphAt } from './base.js';
import { clamp } from '../math.js';

export function createBellowsmith(game, x, y) {
  return makeBoss({
    id: 'bellowsmith',
    name: 'Мехокузнец',
    title: 'мастер горна',
    sprite: 'bellowsmith',
    x,
    y,
    radius: 28,
    hp: 560,
    speed: 38,
    touch: 3,
    armor: 1,
    phaseThresholds: [0.68, 0.34],
    update,
    onPhase(g, b, phase) {
      if (phase >= 2) {
        b.mem.heat = true;
        g.message('Горн разгорается', '', 1.8);
      }
      if (phase >= 3) {
        b.speed = 52;
        g.spawnMinions(b, { id: 'emberling', count: 3, max: 8 });
      }
    },
  });
}

const ATTACKS_P1 = ['slam', 'shrapnel', 'anvilDrop'];
const ATTACKS_P2 = ['slam', 'shrapnel', 'flameSweep', 'anvilDrop'];
const ATTACKS_P3 = ['slam', 'flameSweep', 'forgeStorm', 'anvilDrop'];

function update(game, b, dt) {
  b.t += dt;
  checkPhase(game, b);

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt);
    return;
  }

  b.cd -= dt;
  moveToward(b, game.player.x, game.player.y, b.speed, dt);
  if (b.mem.heat && game.rng.chance(dt * 8)) {
    game.fx('ember', { x: b.x + game.rng.range(-14, 14), y: b.y - 10, color: '#ff9d3c' });
  }
  if (b.cd <= 0) {
    const list = b.phase === 1 ? ATTACKS_P1 : b.phase === 2 ? ATTACKS_P2 : ATTACKS_P3;
    chooseAttack(game, b, list);
  }
}

function runAttack(game, b, dt) {
  const T = b.attackT;
  const p = game.player;

  switch (b.attack) {
    // Hammer slam: a wide shockwave plus a shrapnel ring.
    case 'slam': {
      if (T < 0.75) {
        b.ai.telegraph = 1 - T / 0.75;
        if (T < dt * 2) telegraphAt(game, b.x, b.y, 0.75, 92, '#ff9d3c');
        moveToward(b, p.x, p.y, 22, dt);
        break;
      }
      if (!b.mem.slammed) {
        b.mem.slammed = true;
        b.ai.telegraph = 0;
        game.spawnShockwave(b.x, b.y, { radius: 92, damage: 2, team: TEAM.ENEMY, color: '#ff9d3c' });
        game.shake(10, 0.35);
        game.sfx('bossSlam');
        radial(game, b, b.phase >= 2 ? 12 : 8, {
          speed: 145,
          damage: 1,
          color: '#ffc08a',
          radius: 5,
          style: 'shrapnel',
        });
      }
      if (T > 1.5) {
        b.mem.slammed = false;
        endAttack(b, 1.1);
      }
      break;
    }

    // Aimed shrapnel bursts with a widening cone.
    case 'shrapnel': {
      if (T < 0.5) {
        b.ai.telegraph = 1 - T / 0.5;
        break;
      }
      b.ai.telegraph = 0;
      b.mem.burst = (b.mem.burst || 0) - dt;
      if (b.mem.burst <= 0 && T < 2.2) {
        b.mem.burst = 0.42;
        fan(game, b, aimAt(b, p), 5 + b.phase * 2, 0.5 + b.phase * 0.18, {
          speed: 170,
          damage: 1,
          color: '#ffd93d',
          radius: 5,
          style: 'shrapnel',
        });
      }
      if (T > 2.5) {
        b.mem.burst = 0;
        endAttack(b, 0.9);
      }
      break;
    }

    // Marks several spots, then drops anvils on them.
    case 'anvilDrop': {
      if (!b.mem.anvils) {
        b.mem.anvils = [];
        const n = 3 + b.phase;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? p.x : game.rng.range(ARENA.minX, ARENA.maxX);
          const y = i === 0 ? p.y : game.rng.range(ARENA.minY, ARENA.maxY);
          const at = 0.7 + i * 0.18;
          b.mem.anvils.push({ x, y, at, fired: false });
          telegraphAt(game, x, y, at, 34, '#ffd93d');
        }
        game.sfx('charge', { gain: 0.4 });
      }
      let remaining = false;
      for (const a of b.mem.anvils) {
        if (a.fired) continue;
        if (T >= a.at) {
          a.fired = true;
          game.spawnShockwave(a.x, a.y, { radius: 40, damage: 2, team: TEAM.ENEMY, color: '#ffd93d' });
          game.fx('anvil', { x: a.x, y: a.y });
          game.sfx('bossSlam', { gain: 0.5, rate: 1.3 });
          game.shake(4, 0.16);
        } else {
          remaining = true;
        }
      }
      if (!remaining || T > 3) {
        b.mem.anvils = null;
        endAttack(b, 1.0);
      }
      break;
    }

    // A rotating flame jet from the bellows.
    case 'flameSweep': {
      if (T < 0.8) {
        b.ai.telegraph = 1 - T / 0.8;
        b.mem.sweepA = aimAt(b, p) - 0.9 * (b.mem.dir || 1);
        break;
      }
      b.ai.telegraph = 0;
      b.mem.flameT = (b.mem.flameT || 0) - dt;
      const a = b.mem.sweepA + (T - 0.8) * 1.25 * (b.mem.dir || 1);
      if (b.mem.flameT <= 0 && T < 2.6) {
        b.mem.flameT = 0.06;
        bullet(game, b, b.x, b.y, a, {
          speed: 210,
          damage: 1,
          color: '#ff7a2f',
          radius: 6,
          burn: 1,
          life: 1.5,
          style: 'flame',
        });
      }
      if (T > 2.8) {
        b.mem.dir = (b.mem.dir || 1) * -1;
        b.mem.flameT = 0;
        game.sfx('fire');
        endAttack(b, 1.1);
      }
      break;
    }

    // Phase 3: the forge itself erupts — dense rotating rings.
    case 'forgeStorm': {
      if (T < 1.0) {
        b.ai.telegraph = 1 - T / 1.0;
        moveToward(b, ARENA.cx, ARENA.cy, 70, dt);
        break;
      }
      b.ai.telegraph = 0;
      b.mem.stormT = (b.mem.stormT || 0) - dt;
      if (b.mem.stormT <= 0 && T < 4.0) {
        b.mem.stormT = 0.24;
        radial(game, b, 10, {
          offset: b.t * 2.2,
          speed: 128,
          damage: 1,
          color: '#ff5b4a',
          radius: 5,
          style: 'ember',
        });
        if (game.rng.chance(0.4)) {
          game.spawnMinions(b, { id: 'emberling', count: 1, max: 8 });
        }
      }
      if (T > 4.4) {
        b.mem.stormT = 0;
        endAttack(b, 1.5);
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
