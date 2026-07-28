/**
 * Simulation-wide constants.
 *
 * Pure data: the core, the renderer and the platform layer all agree on these
 * numbers, and nothing here touches a browser API.
 */

/** Size of one dungeon grid cell in world units. */
export const CELL = 4;
/** Wall height. Rooms feel cramped and oppressive on purpose. */
export const WALL_H = 3.4;

/** Dungeon grid dimensions in cells. */
export const GRID_W = 56;
export const GRID_H = 56;

/** Fixed simulation step. The sim never advances by anything else. */
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_STEPS_PER_FRAME = 5;

/** Internal render resolution before upscaling — the heart of the look. */
export const RENDER_W = 428;
export const RENDER_H = 240;

/** Cell contents. */
export const C = {
  SOLID: 0,
  FLOOR: 1,
  DOOR: 2,
  HAZARD: 3, // lava / ooze / brambles depending on floor
  PIT: 4,
  STAIRS: 5,
  RUBBLE: 6, // breakable block
  PILLAR: 7, // freestanding rock column: blocks like a wall, reads as terrain
};

export function isOpen(cell) {
  return cell !== C.SOLID && cell !== C.RUBBLE && cell !== C.PILLAR;
}

/** Teams for collision filtering. */
export const TEAM = {
  PLAYER: 0,
  ENEMY: 1,
};

/** Player body metrics. */
export const PLAYER = {
  radius: 0.42,
  height: 1.75,
  eye: 1.58,
  crouchEye: 0.95,
  walk: 4.4,
  sprint: 7.6,
  crouch: 2.2,
  accel: 42,
  friction: 12,
  stamina: 6,
  staminaRegen: 1.4,
};

/** Half-hearts. */
export const HEART = 2;

export const DEG = Math.PI / 180;
