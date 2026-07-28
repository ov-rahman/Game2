/**
 * Billboard sprite ids.
 *
 * Shared vocabulary between the simulation (which picks *which* glyph a
 * projectile or effect uses) and the renderer (which knows how to draw it).
 * Plain integers, no rendering code — safe for the core to import.
 */
export const SPRITE = {
  DOT: 0,
  SPARK: 1,
  RING: 2,
  FLAME: 3,
  STAR: 4,
  SMOKE: 5,
  BOLT: 6,
  SHARD: 7,
  MUZZLE: 8,
  BLOOD: 9,
  EYE: 10,
  RUNE: 11,
  SQUARE: 12,
  CROSS: 13,
  HALO: 14,
  DUST: 15,
};

export const SPRITE_SIZE = 32;
export const SPRITE_COLS = 4;

export function spriteUV(slot) {
  const col = slot % SPRITE_COLS;
  const row = (slot / SPRITE_COLS) | 0;
  const s = 1 / SPRITE_COLS;
  const inset = 0.5 / (SPRITE_SIZE * SPRITE_COLS);
  return {
    u0: col * s + inset,
    v0: row * s + inset,
    u1: (col + 1) * s - inset,
    v1: (row + 1) * s - inset,
  };
}
