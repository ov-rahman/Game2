/**
 * Navigation: a breadth-first distance field to the player.
 *
 * One BFS over ~3000 cells, refreshed a few times a second, replaces per-enemy
 * pathfinding entirely: every monster just walks downhill on the field. It costs
 * almost nothing, never produces "stuck on a corner" behaviour, and scales to as
 * many monsters as the level holds.
 */
import { GRID_W, GRID_H, CELL, C } from '../constants.js';

const UNREACHABLE = 65535;

export class NavField {
  constructor() {
    this.dist = new Uint16Array(GRID_W * GRID_H).fill(UNREACHABLE);
    this.queue = new Int32Array(GRID_W * GRID_H);
    this.originX = -1;
    this.originY = -1;
    this.age = 0;
    this.valid = false;
  }

  /** Rebuild the field with (gx,gy) as the goal. */
  rebuild(cells, gx, gy) {
    const dist = this.dist;
    dist.fill(UNREACHABLE);
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) {
      this.valid = false;
      return;
    }
    const q = this.queue;
    let head = 0;
    let tail = 0;
    const start = gy * GRID_W + gx;
    // The goal cell can be a hazard the player is standing in; still valid.
    dist[start] = 0;
    q[tail++] = start;

    while (head < tail) {
      const cur = q[head++];
      const d = dist[cur];
      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      const nd = d + 1;

      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        if (dist[ni] !== UNREACHABLE) continue;
        const cell = cells[ni];
        if (cell === C.SOLID || cell === C.RUBBLE || cell === C.PIT || cell === C.PILLAR || cell === C.LEDGE) continue;
        dist[ni] = nd;
        q[tail++] = ni;
      }
    }

    this.originX = gx;
    this.originY = gy;
    this.age = 0;
    this.valid = true;
  }

  distAt(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return UNREACHABLE;
    return this.dist[gy * GRID_W + gx];
  }

  /**
   * Direction of steepest descent from a world position, as a unit XZ vector.
   * Returns null when the cell is unreachable (enemy is walled off).
   */
  steer(x, z, out) {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(z / CELL);
    const here = this.distAt(gx, gy);
    if (here === UNREACHABLE) return null;
    if (here === 0) return null;

    let bestD = here;
    let bx = 0;
    let by = 0;
    // Include diagonals so movement does not look like it is on rails.
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        if (ox !== 0 && oy !== 0) {
          // Only cut a corner when both orthogonal neighbours are open.
          if (this.distAt(gx + ox, gy) === UNREACHABLE) continue;
          if (this.distAt(gx, gy + oy) === UNREACHABLE) continue;
        }
        const d = this.distAt(gx + ox, gy + oy);
        if (d < bestD) {
          bestD = d;
          bx = ox;
          by = oy;
        }
      }
    }
    if (bx === 0 && by === 0) return null;

    // Aim at the centre of the chosen cell for smooth, non-jittery motion.
    const tx = (gx + bx + 0.5) * CELL;
    const tz = (gy + by + 0.5) * CELL;
    const dx = tx - x;
    const dz = tz - z;
    const l = Math.hypot(dx, dz) || 1;
    out.x = dx / l;
    out.z = dz / l;
    return out;
  }
}

export { UNREACHABLE };
