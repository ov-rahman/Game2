/**
 * Boss registry.
 *
 * Each floor names its boss in data/floors.js; this maps that id to a factory.
 * Adding a boss is: write the file, add one line here.
 */
import { createLeshy } from './leshy.js';
import { createChiroptera } from './chiroptera.js';
import { createBellowsmith } from './bellowsmith.js';
import { createIgnarok } from './ignarok.js';
import { createChromadrake } from './chromadrake.js';

const FACTORIES = {
  leshy: createLeshy,
  chiroptera: createChiroptera,
  bellowsmith: createBellowsmith,
  ignarok: createIgnarok,
  chromadrake: createChromadrake,
};

export function createBoss(game, id, x, y) {
  const make = FACTORIES[id];
  if (!make) throw new Error(`Unknown boss id: ${id}`);
  const boss = make(game, x, y);
  // Late floors get a small health bump so a strong build still has a fight.
  boss.maxHp = Math.round(boss.maxHp * (1 + (game.floorIndex - 1) * 0.05));
  boss.hp = boss.maxHp;
  return boss;
}

export function updateBoss(game, boss, dt) {
  if (boss.flash > 0) boss.flash -= dt;
  if (boss.burn > 0) {
    boss.burn -= dt;
    boss.burnAccum = (boss.burnAccum || 0) + boss.burnDps * dt;
    if (boss.burnAccum >= 1) {
      const n = Math.floor(boss.burnAccum);
      boss.burnAccum -= n;
      game.damageEnemy(boss, n, { source: 'burn', kind: 'fire', silent: true });
    }
  }
  if (boss.poison > 0) {
    boss.poison -= dt;
    boss.poisonAccum = (boss.poisonAccum || 0) + boss.poisonDps * dt;
    if (boss.poisonAccum >= 1) {
      const n = Math.floor(boss.poisonAccum);
      boss.poisonAccum -= n;
      game.damageEnemy(boss, n, { source: 'poison', kind: 'poison', silent: true });
    }
  }
  // Bosses shrug off freeze/stun quickly — they only slow, never lock.
  if (boss.frozen > 0) boss.frozen -= dt * 3;
  if (boss.stun > 0) boss.stun -= dt * 3;
  if (boss.shocked > 0) boss.shocked -= dt;

  boss.px = boss.x;
  boss.py = boss.y;
  const slow = boss.frozen > 0 ? 0.6 : 1;
  boss.update(game, boss, dt * slow);
}

export { FACTORIES as BOSS_FACTORIES };
