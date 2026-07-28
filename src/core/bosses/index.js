/**
 * Boss registry. Each floor names its boss in data/floors.js; this maps that id
 * to a factory. Adding a boss is: write the file, add one line here.
 */
import { createLeshy } from './leshy.js';
import { createChiroptera } from './chiroptera.js';
import { createBellowsmith } from './bellowsmith.js';
import { createIgnarok } from './ignarok.js';
import { createChromadrake } from './chromadrake.js';
import { updateStatus } from '../entities/enemy.js';
import { groundAt } from '../world/terrain.js';

const FACTORIES = {
  leshy: createLeshy,
  chiroptera: createChiroptera,
  bellowsmith: createBellowsmith,
  ignarok: createIgnarok,
  chromadrake: createChromadrake,
};

export function createBoss(game, id, x, z) {
  const make = FACTORIES[id];
  if (!make) throw new Error(`Unknown boss id: ${id}`);
  const boss = make(game, x, z);
  return boss;
}

export function updateBoss(game, b, dt) {
  b.px = b.x;
  b.pz = b.z;
  updateStatus(game, b, dt);
  if (!b.alive) return;
  // Bosses shrug off crowd control: it slows them, never locks them.
  if (b.frozen > 0) b.frozen -= dt * 3;
  if (b.stun > 0) b.stun -= dt * 3;
  const slow = b.frozen > 0 ? 0.65 : 1;
  b.update(game, b, dt * slow);
  // Bosses stand on the relief like everything else; flyers hover above it.
  const ground = groundAt(game.dungeon.terrain, b.x, b.z);
  b.y = b.flying ? ground + 1.2 : ground;
  if (b.light) {
    b.light.x = b.x;
    b.light.y = b.y + b.height * 0.5;
    b.light.z = b.z;
  }
}

export { FACTORIES as BOSS_FACTORIES };
