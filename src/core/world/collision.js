/**
 * Grid collision and visibility.
 *
 * Bodies are vertical cylinders; the world is a cell grid. Movement resolves one
 * axis at a time, which gives the wall-sliding every first-person game needs and
 * costs a handful of array reads per body per tick.
 */
import { CELL, C, GRID_W, GRID_H } from '../constants.js';

export function solidFor(cell, opts) {
  if (cell === C.SOLID) return true;
  if (cell === C.PILLAR) return true;
  if (cell === C.RUBBLE) return !opts.ghost;
  if (cell === C.PIT) return !opts.flying;
  return false;
}

export function cellAt(cells, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return C.SOLID;
  return cells[gy * GRID_W + gx];
}

export function cellAtWorld(cells, x, z) {
  return cellAt(cells, Math.floor(x / CELL), Math.floor(z / CELL));
}

/** Does a cylinder of radius r centred at (x,z) overlap anything solid? */
export function blocked(cells, x, z, r, opts = {}) {
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL);
  const z1 = Math.floor((z + r) / CELL);
  for (let gy = z0; gy <= z1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (!solidFor(cellAt(cells, gx, gy), opts)) continue;
      // Closest point on the cell box to the circle centre.
      const cx = Math.max(gx * CELL, Math.min(x, gx * CELL + CELL));
      const cz = Math.max(gy * CELL, Math.min(z, gy * CELL + CELL));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}

/**
 * Move a body by (dx,dz), sliding along whatever it hits.
 * Mutates body.x / body.z. Returns which axes were blocked.
 */
export function moveBody(cells, body, dx, dz, opts = {}) {
  const r = body.radius;
  let hitX = false;
  let hitZ = false;

  if (dx !== 0) {
    const nx = body.x + dx;
    if (blocked(cells, nx, body.z, r, opts)) {
      hitX = true;
      // Creep up to the wall so the body ends flush instead of a gap away.
      const step = Math.sign(dx) * 0.05;
      let probe = body.x;
      for (let i = 0; i < 20; i++) {
        if (blocked(cells, probe + step, body.z, r, opts)) break;
        probe += step;
      }
      body.x = probe;
    } else {
      body.x = nx;
    }
  }

  if (dz !== 0) {
    const nz = body.z + dz;
    if (blocked(cells, body.x, nz, r, opts)) {
      hitZ = true;
      const step = Math.sign(dz) * 0.05;
      let probe = body.z;
      for (let i = 0; i < 20; i++) {
        if (blocked(cells, body.x, probe + step, r, opts)) break;
        probe += step;
      }
      body.z = probe;
    } else {
      body.z = nz;
    }
  }

  return { hitX, hitZ };
}

/**
 * DDA ray march across the grid.
 * Returns { hit, x, z, dist, gx, gy, cell } — hit is false if it reached maxDist.
 */
export function raycast(cells, ox, oz, dx, dz, maxDist, opts = {}) {
  const len = Math.hypot(dx, dz) || 1;
  const rx = dx / len;
  const rz = dz / len;

  let gx = Math.floor(ox / CELL);
  let gy = Math.floor(oz / CELL);

  const stepX = rx > 0 ? 1 : -1;
  const stepZ = rz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(rx) < 1e-8 ? Infinity : Math.abs(CELL / rx);
  const tDeltaZ = Math.abs(rz) < 1e-8 ? Infinity : Math.abs(CELL / rz);

  let tMaxX =
    rx > 0 ? ((gx + 1) * CELL - ox) / (rx || 1e-8) : (gx * CELL - ox) / (rx || -1e-8);
  let tMaxZ =
    rz > 0 ? ((gy + 1) * CELL - oz) / (rz || 1e-8) : (gy * CELL - oz) / (rz || -1e-8);
  if (!isFinite(tMaxX)) tMaxX = Infinity;
  if (!isFinite(tMaxZ)) tMaxZ = Infinity;

  let t = 0;
  for (let i = 0; i < 512; i++) {
    const cell = cellAt(cells, gx, gy);
    if (solidFor(cell, opts) && t > 0.001) {
      return { hit: true, x: ox + rx * t, z: oz + rz * t, dist: t, gx, gy, cell };
    }
    if (t > maxDist) break;
    if (tMaxX < tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      gx += stepX;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      gy += stepZ;
    }
  }
  return { hit: false, x: ox + rx * maxDist, z: oz + rz * maxDist, dist: maxDist, gx, gy, cell: 0 };
}

export function hasLineOfSight(cells, ax, az, bx, bz, opts = {}) {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const r = raycast(cells, ax, az, dx, dz, d, opts);
  return !r.hit || r.dist >= d - 0.05;
}

/** Nearest walkable spot to (x,z), used when spawning. */
export function findFreeSpot(cells, x, z, r, rng, tries = 32) {
  if (!blocked(cells, x, z, r)) return { x, z };
  for (let i = 0; i < tries; i++) {
    const a = rng.angle();
    const d = CELL * (0.5 + i * 0.22);
    const nx = x + Math.cos(a) * d;
    const nz = z + Math.sin(a) * d;
    if (nx < CELL || nz < CELL) continue;
    if (nx > (GRID_W - 1) * CELL || nz > (GRID_H - 1) * CELL) continue;
    if (!blocked(cells, nx, nz, r)) return { x: nx, z: nz };
  }
  return { x, z };
}
