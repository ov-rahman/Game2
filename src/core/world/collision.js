/**
 * Tile collision and movement resolution.
 *
 * Entities are circles; tiles are axis-aligned squares. Movement is resolved one
 * axis at a time, which gives the "slide along the wall" feel players expect and
 * costs a handful of array lookups per entity per tick.
 */
import { TILE, ROOM_W, ROOM_H, T } from '../constants.js';

export function tileAt(tiles, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return T.WALL;
  return tiles[ty * ROOM_W + tx];
}

export function tileAtWorld(tiles, x, y) {
  return tileAt(tiles, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Does this tile block the given mover? */
export function blocks(tile, opts) {
  if (tile === T.WALL) return true;
  if (tile === T.ROCK) return !opts.ghost;
  if (tile === T.PIT) return !opts.flying;
  return false;
}

/** True when a circle at (x,y) overlaps any blocking tile. */
export function circleBlocked(tiles, x, y, r, opts = {}) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tiles, tx, ty);
      if (!blocks(t, opts)) continue;
      // Closest point on the tile to the circle centre.
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/**
 * Move an entity by (dx,dy) against the tile grid.
 * Mutates e.x / e.y. Returns which axes were blocked.
 */
export function moveEntity(tiles, e, dx, dy, opts = {}) {
  const r = e.radius;
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    const nx = e.x + dx;
    if (circleBlocked(tiles, nx, e.y, r, opts)) {
      hitX = true;
      // Nudge flush against the wall so the entity does not float a pixel away.
      const step = Math.sign(dx);
      let probe = e.x;
      for (let i = 0; i < Math.abs(dx); i++) {
        if (circleBlocked(tiles, probe + step, e.y, r, opts)) break;
        probe += step;
      }
      e.x = probe;
    } else {
      e.x = nx;
    }
  }

  if (dy !== 0) {
    const ny = e.y + dy;
    if (circleBlocked(tiles, e.x, ny, r, opts)) {
      hitY = true;
      const step = Math.sign(dy);
      let probe = e.y;
      for (let i = 0; i < Math.abs(dy); i++) {
        if (circleBlocked(tiles, e.x, probe + step, r, opts)) break;
        probe += step;
      }
      e.y = probe;
    } else {
      e.y = ny;
    }
  }

  // Safety clamp: never let anything escape the room box.
  const lo = TILE * 0.5;
  if (e.x < lo) e.x = lo;
  if (e.y < lo) e.y = lo;
  const hiX = ROOM_W * TILE - lo;
  const hiY = ROOM_H * TILE - lo;
  if (e.x > hiX) e.x = hiX;
  if (e.y > hiY) e.y = hiY;

  return { hitX, hitY };
}

/** Line-of-sight over blocking tiles (Bresenham-ish sampling, cheap). */
export function hasLineOfSight(tiles, ax, ay, bx, by, opts = {}) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(len / (TILE * 0.5));
  if (steps === 0) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (blocks(tileAtWorld(tiles, x, y), opts)) return false;
  }
  return true;
}

/** Find a free spot near (x,y) for spawning. */
export function findFreeSpot(tiles, x, y, r, rng, tries = 24) {
  if (!circleBlocked(tiles, x, y, r)) return { x, y };
  for (let i = 0; i < tries; i++) {
    const a = rng.angle();
    const d = TILE * (0.6 + i * 0.28);
    const nx = x + Math.cos(a) * d;
    const ny = y + Math.sin(a) * d;
    if (nx < TILE || ny < TILE) continue;
    if (nx > (ROOM_W - 1) * TILE || ny > (ROOM_H - 1) * TILE) continue;
    if (!circleBlocked(tiles, nx, ny, r)) return { x: nx, y: ny };
  }
  // Last resort: the room centre is guaranteed walkable by the generator.
  return { x: (ROOM_W * TILE) / 2, y: (ROOM_H * TILE) / 2 };
}

/** Is the given world position standing on a hazard tile? */
export function hazardAt(tiles, x, y) {
  return tileAtWorld(tiles, x, y) === T.HAZARD;
}
