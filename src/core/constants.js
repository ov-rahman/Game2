/**
 * Global simulation constants.
 *
 * Pure data — no platform APIs. Everything the core simulation needs to agree
 * on lives here so the renderer and the logic never disagree about geometry.
 */

/** Size of one dungeon tile in world units (world units == logical pixels). */
export const TILE = 32;

/** Room dimensions in tiles (including the 1-tile wall border). */
export const ROOM_W = 19;
export const ROOM_H = 11;

/** Playfield size in world units. */
export const ROOM_PX_W = ROOM_W * TILE; // 608
export const ROOM_PX_H = ROOM_H * TILE; // 352

/** Logical canvas resolution. The renderer integer-scales this to the window. */
export const VIEW_W = 640;
export const VIEW_H = 384;

/** Top-left corner of the playfield inside the logical canvas. */
export const VIEW_OX = (VIEW_W - ROOM_PX_W) / 2; // 16
export const VIEW_OY = (VIEW_H - ROOM_PX_H) / 2; // 16

/** Fixed simulation step. The sim never runs at any other rate. */
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

/** Hard ceiling on catch-up steps per frame, so a stalled tab cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

/** Tile ids used by the floor generator and the renderer. */
export const T = {
  FLOOR: 0,
  WALL: 1,
  PIT: 2, // impassable for walkers, flyers and spectral shots pass
  ROCK: 3, // destructible block
  HAZARD: 4, // damages on contact (lava / thorns / ooze depending on floor)
  DECO: 5, // walkable decoration, purely visual variation
};

/** Directions, ordered N, E, S, W. Index is used as the door slot id. */
export const DIR = [
  { x: 0, y: -1, name: 'n' },
  { x: 1, y: 0, name: 'e' },
  { x: 0, y: 1, name: 's' },
  { x: -1, y: 0, name: 'w' },
];
export const DIR_OPPOSITE = [2, 3, 0, 1];

/** Room archetypes produced by the floor generator. */
export const ROOM_KIND = {
  START: 'start',
  NORMAL: 'normal',
  TREASURE: 'treasure',
  SHOP: 'shop',
  CHALLENGE: 'challenge',
  SECRET: 'secret',
  BOSS: 'boss',
};

/** Collision layers for the broad-phase filter. */
export const TEAM = {
  PLAYER: 0,
  ENEMY: 1,
  NEUTRAL: 2,
};

/** Damage flags carried by projectiles and explosions. */
export const DMG = {
  NORMAL: 0,
  FIRE: 1,
  ICE: 2,
  POISON: 4,
  SHOCK: 8,
  EXPLOSIVE: 16,
  TRUE: 32, // ignores armor
};

export const HEART_HP = 2; // one full heart == 2 hp units
