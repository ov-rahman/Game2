/**
 * Smooth cave walls.
 *
 * The grid is a good way to decide *where* you can walk and a terrible way to
 * draw a cave: every wall it produces is one of four axis-aligned planes on a
 * four-unit lattice, which is exactly what makes a cavern look like a
 * spreadsheet. So natural rooms stop being drawn from cells at all.
 *
 * Instead: sample the grid into a field four times finer, blur it until the
 * corners are gone, push some noise through it so the boundary wanders, and
 * take the half-way isoline with marching squares. What comes out is a set of
 * one-unit segments following a curve, and a curve is what a cave wall is.
 *
 * Collision still uses the grid, which is why the field is *dilated* before
 * contouring: the isoline is pushed a little way into the rock, so it can never
 * end up between the player and a wall they are allowed to stand against. The
 * cost is a thin strip of floor near a cave wall that looks reachable and
 * isn't; the alternative is a camera that can poke through stone.
 *
 * Lives in core rather than gfx because it is derived from the world, and
 * because it is the kind of thing the desktop build must produce identically.
 */
import { GRID_W, GRID_H, CELL, C } from '../constants.js';

/** Field samples per cell along each axis. Segment length is CELL / SUB. */
export const SUB = 4;
const FW = GRID_W * SUB + 1;
const FH = GRID_H * SUB + 1;
const STEP = CELL / SUB;
const ISO = 0.5;

const cellIdx = (x, y) => y * GRID_W + x;

function openAt(cells, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 0;
  const c = cells[cellIdx(x, y)];
  if (c === C.SOLID || c === C.PILLAR || c === C.RUBBLE || c === C.LEDGE) return 0;
  return 1;
}

function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smoothstep(x - xi);
  const ty = smoothstep(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return (top + (bot - top) * ty) * 2 - 1;
}

/**
 * Build the isoline for every natural region on the floor.
 *
 * @param {Uint8Array} cells   the dungeon grid
 * @param {Uint8Array} natural 1 for cells belonging to a natural room
 * @param {Rng} rng
 * @returns {{ segments: Float32Array, count: number }} pairs of endpoints,
 *          each segment ordered so that walking A→B keeps the open side left.
 */
export function buildContour(cells, natural, rng) {
  const seed = rng.nextU32();

  // ---- sample -----------------------------------------------------------
  // A node takes the *maximum* openness of the four cells around it, which
  // dilates open space by half a cell. That dilation is what keeps a one-cell
  // passage from being blurred shut, and what keeps the finished isoline on
  // the rock side of every wall.
  let field = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) {
      const gx = i / SUB;
      const gy = j / SUB;
      const x0 = Math.floor(gx - 0.001);
      const y0 = Math.floor(gy - 0.001);
      const x1 = Math.floor(gx + 0.001);
      const y1 = Math.floor(gy + 0.001);
      let v = 0;
      v = Math.max(v, openAt(cells, x0, y0));
      v = Math.max(v, openAt(cells, x1, y0));
      v = Math.max(v, openAt(cells, x0, y1));
      v = Math.max(v, openAt(cells, x1, y1));
      field[j * FW + i] = v;
    }
  }

  // ---- blur -------------------------------------------------------------
  // Three passes is where the four-unit staircase stops being visible and the
  // boundary still follows the room it came from.
  let tmp = new Float32Array(FW * FH);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < FH; j++) {
      for (let i = 0; i < FW; i++) {
        let sum = 0;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const ni = i + ox;
            const nj = j + oy;
            if (ni < 0 || nj < 0 || ni >= FW || nj >= FH) continue;
            const w = ox === 0 && oy === 0 ? 4 : 1;
            sum += field[nj * FW + ni] * w;
            n += w;
          }
        }
        tmp[j * FW + i] = sum / n;
      }
    }
    const swap = field;
    field = tmp;
    tmp = swap;
  }

  // ---- wander -----------------------------------------------------------
  // Without this the isoline is a smooth blob — better than a grid, but still
  // obviously generated. Two octaves of noise give the wall the bays and
  // buttresses that make one stretch of cave different from the next.
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) {
      const k = j * FW + i;
      const n =
        valueNoise(i * 0.16, j * 0.16, seed) * 0.13 +
        valueNoise(i * 0.42 + 7.7, j * 0.42 - 3.1, seed ^ 0x51ed) * 0.06;
      field[k] += n;
    }
  }

  // ---- march ------------------------------------------------------------
  const segs = [];
  const lerpEdge = (va, vb, ax, az, bx, bz) => {
    const t = Math.abs(vb - va) < 1e-6 ? 0.5 : (ISO - va) / (vb - va);
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + (bx - ax) * c, az + (bz - az) * c];
  };

  for (let j = 0; j < FH - 1; j++) {
    for (let i = 0; i < FW - 1; i++) {
      // Only contour where a natural room asked for it. Built rooms keep their
      // masonry, and their crisp corners are the point of them.
      if (!naturalNear(natural, i, j)) continue;

      const v00 = field[j * FW + i];
      const v10 = field[j * FW + i + 1];
      const v11 = field[(j + 1) * FW + i + 1];
      const v01 = field[(j + 1) * FW + i];
      let code = 0;
      if (v00 >= ISO) code |= 1;
      if (v10 >= ISO) code |= 2;
      if (v11 >= ISO) code |= 4;
      if (v01 >= ISO) code |= 8;
      if (code === 0 || code === 15) continue;

      const x0 = i * STEP;
      const z0 = j * STEP;
      const x1 = x0 + STEP;
      const z1 = z0 + STEP;

      // Edge crossings, named for the side of the square they sit on.
      const top = () => lerpEdge(v00, v10, x0, z0, x1, z0);
      const right = () => lerpEdge(v10, v11, x1, z0, x1, z1);
      const bottom = () => lerpEdge(v01, v11, x0, z1, x1, z1);
      const left = () => lerpEdge(v00, v01, x0, z0, x0, z1);

      const push = (a, b) => {
        segs.push(a[0], a[1], b[0], b[1]);
      };

      switch (code) {
        case 1: case 14: push(left(), top()); break;
        case 2: case 13: push(top(), right()); break;
        case 3: case 12: push(left(), right()); break;
        case 4: case 11: push(right(), bottom()); break;
        case 6: case 9: push(top(), bottom()); break;
        case 7: case 8: push(left(), bottom()); break;
        case 5:
          push(left(), top());
          push(right(), bottom());
          break;
        case 10:
          push(top(), right());
          push(left(), bottom());
          break;
        default: break;
      }
    }
  }

  return { segments: new Float32Array(segs), count: segs.length / 4, field, FW, FH, STEP };
}

/** Does this field square touch a natural cell? */
function naturalNear(natural, i, j) {
  const gx = Math.floor(i / SUB);
  const gy = Math.floor(j / SUB);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const x = gx + ox;
      const y = gy + oy;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
      if (natural[cellIdx(x, y)]) return true;
    }
  }
  return false;
}

/**
 * Sample the field. The mesh builder uses this to decide which side of a
 * segment the open air is on, rather than trusting a marching-squares case
 * table to have got its winding right.
 */
export function fieldAt(contour, x, z) {
  const fx = x / contour.STEP;
  const fz = z / contour.STEP;
  let i = Math.floor(fx);
  let j = Math.floor(fz);
  if (i < 0) i = 0;
  if (j < 0) j = 0;
  if (i >= contour.FW - 1) i = contour.FW - 2;
  if (j >= contour.FH - 1) j = contour.FH - 2;
  const tx = fx - i;
  const tz = fz - j;
  const f = contour.field;
  const W = contour.FW;
  const a = f[j * W + i];
  const b = f[j * W + i + 1];
  const c = f[(j + 1) * W + i];
  const d = f[(j + 1) * W + i + 1];
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * tz;
}
