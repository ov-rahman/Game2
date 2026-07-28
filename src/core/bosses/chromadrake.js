/**
 * Final boss — Хромадракон, the prismatic dragon.
 *
 * Signature mechanic: the dragon cycles through four elemental colours. Its
 * current colour dictates the attack it will use next and tints the arena, so
 * the fight is readable at a glance even at its densest.
 */
import { TEAM } from '../constants.js';
import { makeBoss, checkPhase, moveToward, aimAt, radial, fan, bullet, chooseAttack, ARENA, telegraphAt } from './base.js';
import { clamp } from '../math.js';

const COLORS = [
  { id: 'ruby', color: '#ff4fa3', attack: 'breath' },
  { id: 'azure', color: '#4fe1ff', attack: 'shardStorm' },
  { id: 'gold', color: '#ffe14f', attack: 'hoardBurst' },
  { id: 'jade', color: '#7cff6b', attack: 'whelps' },
];

export function createChromadrake(game, x, y) {
  const b = makeBoss({
    id: 'chromadrake',
    name: 'Хромадракон',
    title: 'страж призматической сокровищницы',
    sprite: 'chromadrake',
    x,
    y,
    radius: 34,
    hp: 1150,
    speed: 74,
    touch: 3,
    armor: 2,
    flying: true,
    phaseThresholds: [0.72, 0.4],
    update,
    onPhase(g, boss, phase) {
      if (phase === 2) {
        g.message('Чешуя раскалывается на цвета', '', 2);
        boss.mem.cycleSpeed = 0.7;
      }
      if (phase === 3) {
        g.message('ПРИЗМАТИЧЕСКАЯ ЯРОСТЬ', '', 2.2);
        boss.mem.cycleSpeed = 0.45;
        boss.speed = 96;
      }
    },
  });
  b.mem.colorIndex = 0;
  b.mem.cycleSpeed = 1;
  b.mem.colorT = 0;
  b.colorId = COLORS[0].id;
  b.colorHex = COLORS[0].color;
  return b;
}

function update(game, b, dt) {
  b.t += dt;
  b.wingPhase = b.t * 9;
  checkPhase(game, b);

  if (b.attack) {
    b.attackT += dt;
    runAttack(game, b, dt);
    return;
  }

  b.cd -= dt;

  // Slow figure-eight flight keeps her moving without being unhittable.
  const t = b.t * 0.6;
  const tx = ARENA.cx + Math.cos(t) * 170;
  const ty = ARENA.cy + Math.sin(t * 2) * 78;
  moveToward(b, tx, ty, b.speed, dt);

  if (game.rng.chance(dt * 10)) {
    game.fx('sparkle', { x: b.x + game.rng.range(-30, 30), y: b.y + game.rng.range(-18, 18), color: b.colorHex });
  }

  if (b.cd <= 0) {
    cycleColor(game, b);
    const entry = COLORS[b.mem.colorIndex];
    if (b.phase === 3 && game.rng.chance(0.35)) {
      b.attack = 'prismRain';
      b.attackT = 0;
    } else if (game.rng.chance(0.25)) {
      b.attack = 'dive';
      b.attackT = 0;
    } else {
      b.attack = entry.attack;
      b.attackT = 0;
    }
    b.mem.lastAttack = b.attack;
  }
}

function cycleColor(game, b) {
  b.mem.colorIndex = (b.mem.colorIndex + 1) % COLORS.length;
  const c = COLORS[b.mem.colorIndex];
  b.colorId = c.id;
  b.colorHex = c.color;
  game.fx('colorShift', { x: b.x, y: b.y, color: c.color });
  game.sfx('ice', { gain: 0.3, rate: 1 + b.mem.colorIndex * 0.15 });
}

function runAttack(game, b, dt) {
  const T = b.attackT;
  const p = game.player;

  switch (b.attack) {
    // Ruby: a sustained cone of prismatic fire.
    case 'breath': {
      if (T < 0.75) {
        b.ai.telegraph = 1 - T / 0.75;
        b.mem.breathA = aimAt(b, p);
        break;
      }
      b.ai.telegraph = 0;
      b.mem.breathT = (b.mem.breathT || 0) - dt;
      const sweep = b.mem.breathA + Math.sin((T - 0.75) * 2.4) * 0.55;
      if (b.mem.breathT <= 0 && T < 2.6) {
        b.mem.breathT = 0.05;
        bullet(game, b, b.x, b.y, sweep + game.rng.range(-0.14, 0.14), {
          speed: 235,
          damage: 1,
          color: '#ff4fa3',
          radius: 7,
          burn: 1,
          life: 1.4,
          style: 'breath',
        });
      }
      if (T > 2.9) {
        b.mem.breathT = 0;
        endAttack(b, 0.9);
      }
      break;
    }

    // Azure: crystal shards fall in tracked columns.
    case 'shardStorm': {
      if (!b.mem.shards) {
        b.mem.shards = [];
        const n = 6 + b.phase * 2;
        for (let i = 0; i < n; i++) {
          const x = clamp(p.x + game.rng.range(-150, 150), ARENA.minX, ARENA.maxX);
          const y = clamp(p.y + game.rng.range(-110, 110), ARENA.minY, ARENA.maxY);
          const at = 0.45 + i * 0.11;
          b.mem.shards.push({ x, y, at, fired: false });
          telegraphAt(game, x, y, at, 24, '#4fe1ff');
        }
        game.sfx('ice', { gain: 0.6 });
      }
      let remaining = false;
      for (const s of b.mem.shards) {
        if (s.fired) continue;
        if (T >= s.at) {
          s.fired = true;
          game.spawnShockwave(s.x, s.y, { radius: 28, damage: 2, team: TEAM.ENEMY, color: '#4fe1ff' });
          game.fx('shardImpact', { x: s.x, y: s.y, color: '#4fe1ff' });
        } else {
          remaining = true;
        }
      }
      if (!remaining || T > 3.2) {
        b.mem.shards = null;
        endAttack(b, 1.0);
      }
      break;
    }

    // Gold: coins from the hoard fly out in dense rotating rings.
    case 'hoardBurst': {
      if (T < 0.6) {
        b.ai.telegraph = 1 - T / 0.6;
        break;
      }
      b.ai.telegraph = 0;
      b.mem.burstT = (b.mem.burstT || 0) - dt;
      if (b.mem.burstT <= 0 && T < 2.8) {
        b.mem.burstT = 0.26;
        radial(game, b, 11, {
          offset: b.t * 2.0,
          speed: 152,
          damage: 1,
          color: '#ffe14f',
          radius: 6,
          bounce: 1,
          style: 'coin',
        });
      }
      if (T > 3.1) {
        b.mem.burstT = 0;
        endAttack(b, 1.0);
      }
      break;
    }

    // Jade: calls in whelps and covers them with a screen of bullets.
    case 'whelps': {
      if (T < 0.7) {
        b.ai.telegraph = 1 - T / 0.7;
        break;
      }
      if (!b.mem.called) {
        b.mem.called = true;
        b.ai.telegraph = 0;
        game.spawnMinions(b, { id: 'dragonWhelp', count: b.phase >= 2 ? 2 : 1, max: 4 });
        game.spawnMinions(b, { id: 'prismSprite', count: 2, max: 6 });
        game.sfx('spawn');
        fan(game, b, aimAt(b, p), 7, 1.4, { speed: 130, damage: 1, color: '#7cff6b', radius: 6 });
      }
      if (T > 1.5) {
        b.mem.called = false;
        endAttack(b, 1.4);
      }
      break;
    }

    // Committed dive across the arena, leaving a prismatic trail.
    case 'dive': {
      if (T < 0.6) {
        b.ai.telegraph = 1 - T / 0.6;
        b.mem.diveA = aimAt(b, p);
        break;
      }
      b.ai.telegraph = 0;
      b.x += Math.cos(b.mem.diveA) * 460 * dt;
      b.y += Math.sin(b.mem.diveA) * 460 * dt;
      const hitWall = b.x <= ARENA.minX || b.x >= ARENA.maxX || b.y <= ARENA.minY || b.y >= ARENA.maxY;
      b.x = clamp(b.x, ARENA.minX, ARENA.maxX);
      b.y = clamp(b.y, ARENA.minY, ARENA.maxY);
      b.mem.trailT = (b.mem.trailT || 0) - dt;
      if (b.mem.trailT <= 0) {
        b.mem.trailT = 0.05;
        game.fx('trail', { x: b.x, y: b.y, color: b.colorHex });
        bullet(game, b, b.x, b.y, b.mem.diveA + Math.PI / 2, { speed: 90, damage: 1, color: b.colorHex, radius: 5, life: 1.6 });
        bullet(game, b, b.x, b.y, b.mem.diveA - Math.PI / 2, { speed: 90, damage: 1, color: b.colorHex, radius: 5, life: 1.6 });
      }
      if (hitWall || T > 1.6) {
        game.spawnShockwave(b.x, b.y, { radius: 66, damage: 2, team: TEAM.ENEMY, color: b.colorHex });
        game.shake(9, 0.3);
        game.sfx('bossSlam');
        endAttack(b, 1.2);
      }
      break;
    }

    // Phase 3 spectacle: all four colours at once, in a slow readable spiral.
    case 'prismRain': {
      if (T < 1.0) {
        b.ai.telegraph = 1 - T / 1.0;
        moveToward(b, ARENA.cx, ARENA.cy - 30, 110, dt);
        break;
      }
      b.ai.telegraph = 0;
      b.mem.rainT = (b.mem.rainT || 0) - dt;
      if (b.mem.rainT <= 0 && T < 4.5) {
        b.mem.rainT = 0.16;
        for (let i = 0; i < 4; i++) {
          const c = COLORS[i];
          bullet(game, b, b.x, b.y, b.t * 1.9 + (i / 4) * Math.PI * 2, {
            speed: 128,
            damage: 1,
            color: c.color,
            radius: 6,
            life: 4,
            style: 'prism',
          });
        }
      }
      if (T > 5.0) {
        b.mem.rainT = 0;
        endAttack(b, 1.4);
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
