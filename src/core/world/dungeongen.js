/**
 * Dungeon generation.
 *
 * Classic rooms-and-corridors carved into a cell grid, then decorated per floor
 * theme. The grid is the single source of truth: collision, navigation, mesh
 * building and lighting all read it, which keeps what you see and what you can
 * walk through from ever disagreeing.
 */
import { GRID_W, GRID_H, CELL, C, isOpen } from '../constants.js';

export const ROOM_KIND = {
  START: 'start',
  NORMAL: 'normal',
  TREASURE: 'treasure',
  SHOP: 'shop',
  CHALLENGE: 'challenge',
  BOSS: 'boss',
};

const idx = (x, y) => y * GRID_W + x;

class Room {
  constructor(id, x, y, w, h) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.cx = x + (w >> 1);
    this.cy = y + (h >> 1);
    this.kind = ROOM_KIND.NORMAL;
    this.lights = [];
    this.visited = false;
    this.cleared = false;
    this.depth = 0;
    this.links = [];
  }

  overlaps(o, pad = 2) {
    return (
      this.x - pad < o.x + o.w &&
      this.x + this.w + pad > o.x &&
      this.y - pad < o.y + o.h &&
      this.y + this.h + pad > o.y
    );
  }

  contains(gx, gy) {
    return gx >= this.x && gy >= this.y && gx < this.x + this.w && gy < this.y + this.h;
  }

  /** World-space centre. */
  world() {
    return { x: (this.x + this.w / 2) * CELL, z: (this.y + this.h / 2) * CELL };
  }
}

export function generateDungeon(rng, floorDef) {
  const cells = new Uint8Array(GRID_W * GRID_H); // starts as all-solid
  const roomAt = new Int16Array(GRID_W * GRID_H).fill(-1);
  const rooms = [];

  // ---- place rooms -----------------------------------------------------
  const target = rng.int(floorDef.rooms.min, floorDef.rooms.max);
  let guard = 0;
  while (rooms.length < target && guard++ < 900) {
    const w = rng.int(floorDef.roomSize.min, floorDef.roomSize.max);
    const h = rng.int(floorDef.roomSize.min, floorDef.roomSize.max);
    const x = rng.int(2, GRID_W - w - 3);
    const y = rng.int(2, GRID_H - h - 3);
    const room = new Room(rooms.length, x, y, w, h);
    if (rooms.some((r) => room.overlaps(r, 3))) continue;
    rooms.push(room);
  }

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        cells[idx(x, y)] = C.FLOOR;
        roomAt[idx(x, y)] = r.id;
      }
    }
  }

  // ---- connect ---------------------------------------------------------
  // Nearest-neighbour chain gives a readable spine; a few extra links create
  // the loops that stop the level feeling like a corridor on rails.
  const connected = [rooms[0]];
  const pending = rooms.slice(1);
  while (pending.length) {
    let bestI = 0;
    let bestJ = 0;
    let bestD = Infinity;
    for (let i = 0; i < connected.length; i++) {
      for (let j = 0; j < pending.length; j++) {
        const d = Math.abs(connected[i].cx - pending[j].cx) + Math.abs(connected[i].cy - pending[j].cy);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const a = connected[bestI];
    const b = pending.splice(bestJ, 1)[0];
    carveCorridor(cells, rng, a, b, floorDef);
    a.links.push(b.id);
    b.links.push(a.id);
    connected.push(b);
  }

  const extra = Math.max(1, Math.round(rooms.length * 0.28));
  for (let i = 0; i < extra; i++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a === b || a.links.includes(b.id)) continue;
    const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    if (d > 26) continue;
    carveCorridor(cells, rng, a, b, floorDef);
    a.links.push(b.id);
    b.links.push(a.id);
  }

  // ---- room roles ------------------------------------------------------
  rooms[0].kind = ROOM_KIND.START;
  rooms[0].cleared = true;

  // Depth by BFS over the link graph, so "far" means far to walk.
  for (const r of rooms) r.depth = -1;
  rooms[0].depth = 0;
  const q = [rooms[0]];
  while (q.length) {
    const r = q.shift();
    for (const id of r.links) {
      const n = rooms[id];
      if (n.depth >= 0) continue;
      n.depth = r.depth + 1;
      q.push(n);
    }
  }

  const byDepth = rooms.slice(1).sort((a, b) => b.depth - a.depth);
  const bossRoom = byDepth[0];
  if (bossRoom) bossRoom.kind = ROOM_KIND.BOSS;

  const specials = [];
  if (floorDef.special.treasure) specials.push(ROOM_KIND.TREASURE);
  if (floorDef.special.shop) specials.push(ROOM_KIND.SHOP);
  if (floorDef.special.challenge) specials.push(ROOM_KIND.CHALLENGE);
  const candidates = byDepth.slice(1).filter((r) => r.kind === ROOM_KIND.NORMAL);
  rng.shuffle(candidates);
  for (let i = 0; i < specials.length && i < candidates.length; i++) {
    candidates[i].kind = specials[i];
    candidates[i].cleared = true;
  }

  // ---- decorate --------------------------------------------------------
  for (const r of rooms) {
    if (r.kind === ROOM_KIND.START || r.kind === ROOM_KIND.SHOP) continue;

    // Keep the ring just inside the walls clear: it guarantees every doorway
    // opens onto walkable ground and stops lava from sitting on a threshold.
    const inner = (x, y) => x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1;

    // Hazard pools: blobs rather than scattered cells, so they read as terrain.
    const pools = Math.round(floorDef.hazardChance * 7);
    for (let p = 0; p < pools; p++) {
      const px = rng.int(r.x + 1, r.x + r.w - 2);
      const py = rng.int(r.y + 1, r.y + r.h - 2);
      const rad = rng.int(1, 2);
      for (let y = py - rad; y <= py + rad; y++) {
        for (let x = px - rad; x <= px + rad; x++) {
          if (!inside(x, y) || !inner(x, y)) continue;
          if (cells[idx(x, y)] !== C.FLOOR) continue;
          if (Math.abs(x - px) + Math.abs(y - py) > rad) continue;
          cells[idx(x, y)] = floorDef.pits ? (rng.chance(0.35) ? C.PIT : C.HAZARD) : C.HAZARD;
        }
      }
    }

    // Rubble: cover to break line of sight and to blow up.
    const blocks = rng.int(1, 4);
    for (let b = 0; b < blocks; b++) {
      const bx = rng.int(r.x + 1, r.x + r.w - 2);
      const by = rng.int(r.y + 1, r.y + r.h - 2);
      if (!inner(bx, by)) continue;
      if (cells[idx(bx, by)] !== C.FLOOR) continue;
      cells[idx(bx, by)] = C.RUBBLE;
    }
  }

  // Never block a room's own centre: it is where props and the player spawn.
  for (const r of rooms) {
    for (let y = r.cy - 1; y <= r.cy + 1; y++) {
      for (let x = r.cx - 1; x <= r.cx + 1; x++) {
        if (inside(x, y)) cells[idx(x, y)] = C.FLOOR;
      }
    }
  }

  // ---- stairs ----------------------------------------------------------
  // Placed in the boss room, carved into the grid so the staircase is actually
  // visible in the world instead of being an invisible trigger volume.
  const stairsRoom = bossRoom || rooms[rooms.length - 1];
  const sgx = stairsRoom.cx;
  const sgy = stairsRoom.cy + Math.min(2, Math.max(0, (stairsRoom.h >> 1) - 1));
  for (let y = sgy - 1; y <= sgy + 1; y++) {
    for (let x = sgx - 1; x <= sgx + 1; x++) {
      if (inside(x, y)) cells[idx(x, y)] = C.FLOOR;
    }
  }
  cells[idx(sgx, sgy)] = C.STAIRS;

  const stairs = {
    gx: sgx,
    gy: sgy,
    x: (sgx + 0.5) * CELL,
    z: (sgy + 0.5) * CELL,
    active: false,
  };

  // ---- reachability ----------------------------------------------------
  // Hazard pools are painted after the corridors are carved, so a bad roll can
  // wall a room off behind a ring of pits. Rather than reroll the whole floor,
  // repair it: every room centre and the stairs must be walkable from spawn.
  const repairs = ensureReachable(cells, rooms, stairs);

  // ---- doorways --------------------------------------------------------
  // A floor cell on a room boundary with exactly two open neighbours across is
  // a threshold: mark it so the mesh builder can frame it.
  for (const r of rooms) {
    markDoorways(cells, r);
  }

  // ---- lights ----------------------------------------------------------
  const lights = [];
  for (const r of rooms) {
    const n = r.kind === ROOM_KIND.BOSS ? 4 : Math.max(1, Math.round((r.w * r.h) / 26));
    for (let i = 0; i < n; i++) {
      const lx = rng.int(r.x + 1, r.x + r.w - 2);
      const ly = rng.int(r.y + 1, r.y + r.h - 2);
      const hue = rng.pick(floorDef.lightColors);
      const light = {
        x: (lx + 0.5) * CELL,
        y: rng.range(2.2, 3.0),
        z: (ly + 0.5) * CELL,
        r: hue[0],
        g: hue[1],
        b: hue[2],
        radius: rng.range(11, 18),
        intensity: rng.range(1.5, 2.4),
        flicker: rng.chance(floorDef.flicker) ? rng.range(3, 9) : 0,
        phase: rng.angle(),
        room: r.id,
      };
      lights.push(light);
      r.lights.push(light);
    }
  }

  // Sparse corridor lights so passages are navigable but still oppressive.
  for (let y = 2; y < GRID_H - 2; y += 3) {
    for (let x = 2; x < GRID_W - 2; x += 3) {
      if (cells[idx(x, y)] !== C.FLOOR) continue;
      if (roomAt[idx(x, y)] >= 0) continue;
      if (!rng.chance(0.3)) continue;
      const hue = floorDef.lightColors[0];
      lights.push({
        x: (x + 0.5) * CELL,
        y: 2.7,
        z: (y + 0.5) * CELL,
        r: hue[0],
        g: hue[1],
        b: hue[2],
        radius: rng.range(7, 11),
        intensity: rng.range(0.9, 1.5),
        flicker: rng.chance(0.55) ? rng.range(4, 12) : 0,
        phase: rng.angle(),
        room: -1,
      });
    }
  }

  const start = rooms[0].world();

  return {
    def: floorDef,
    cells,
    roomAt,
    rooms,
    lights,
    stairs,
    start,
    repairs,
    bossRoom: bossRoom ? bossRoom.id : 0,
    width: GRID_W,
    height: GRID_H,
  };
}

/** Can a walking body stand on this cell? */
function walkable(cell) {
  return cell === C.FLOOR || cell === C.DOOR || cell === C.HAZARD || cell === C.STAIRS;
}

/** Flood fill of walkable cells from one grid position. */
function floodFrom(cells, gx, gy) {
  const seen = new Uint8Array(GRID_W * GRID_H);
  if (!inside(gx, gy) || !walkable(cells[idx(gx, gy)])) return seen;
  const q = [idx(gx, gy)];
  seen[q[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const cx = cur % GRID_W;
    const cy = (cur / GRID_W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || !walkable(cells[ni])) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/**
 * Guarantee that every room centre and the stairs can be walked to from the
 * spawn, clearing the pits or rubble in the way.
 *
 * The repair is a breadth-first search outwards from everything already
 * reachable, allowed to step through pits and rubble; walking the parent chain
 * back from a stranded room clears the shortest possible plug rather than
 * bulldozing a straight line through the rock.
 *
 * @returns {{cells:number, rooms:number}} how much had to be repaired — the
 *          smoke test watches both numbers.
 */
function ensureReachable(cells, rooms, stairs) {
  const targets = rooms.map((r) => idx(r.cx, r.cy));
  targets.push(idx(stairs.gx, stairs.gy));

  const report = { cells: 0, rooms: 0 };

  for (let pass = 0; pass < 12; pass++) {
    const seen = floodFrom(cells, rooms[0].cx, rooms[0].cy);
    const stranded = targets.filter((i) => !seen[i]);
    if (!stranded.length) break;
    if (pass === 0) report.rooms = stranded.length;

    // Multi-source BFS from the reachable region through soft obstacles.
    const parent = new Int32Array(GRID_W * GRID_H).fill(-1);
    const visited = new Uint8Array(GRID_W * GRID_H);
    const q = [];
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      visited[i] = 1;
      q.push(i);
    }
    const passable = pass < 6
      ? (c) => c !== C.SOLID
      : () => true; // last resort: allow punching through rock
    for (let head = 0; head < q.length; head++) {
      const cur = q[head];
      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!inside(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (visited[ni] || !passable(cells[ni])) continue;
        visited[ni] = 1;
        parent[ni] = cur;
        q.push(ni);
      }
    }

    let progress = false;
    for (const target of stranded) {
      if (!visited[target]) continue;
      for (let i = target; i >= 0 && !seen[i]; i = parent[i]) {
        if (walkable(cells[i])) continue;
        cells[i] = C.FLOOR;
        report.cells++;
        progress = true;
      }
    }
    if (!progress) break;
  }
  return report;
}

function inside(x, y) {
  return x >= 1 && y >= 1 && x < GRID_W - 1 && y < GRID_H - 1;
}

function carveCorridor(cells, rng, a, b, floorDef) {
  const wide = rng.chance(floorDef.wideCorridors || 0.25) ? 1 : 0;
  let x = a.cx;
  let y = a.cy;
  const horizontalFirst = rng.chance(0.5);

  const carve = (cx, cy) => {
    for (let oy = -wide; oy <= wide; oy++) {
      for (let ox = -wide; ox <= wide; ox++) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (!inside(nx, ny)) continue;
        if (cells[idx(nx, ny)] === C.SOLID) cells[idx(nx, ny)] = C.FLOOR;
      }
    }
  };

  if (horizontalFirst) {
    while (x !== b.cx) {
      x += Math.sign(b.cx - x);
      carve(x, y);
    }
    while (y !== b.cy) {
      y += Math.sign(b.cy - y);
      carve(x, y);
    }
  } else {
    while (y !== b.cy) {
      y += Math.sign(b.cy - y);
      carve(x, y);
    }
    while (x !== b.cx) {
      x += Math.sign(b.cx - x);
      carve(x, y);
    }
  }
}

function markDoorways(cells, room) {
  // Only a *gap in the wall* is a threshold: an opening one cell wide, with
  // rock on both sides across the passage. Marking the whole perimeter (which
  // is what a naive sweep does) turns every wide corridor into door trim.
  const edges = [];
  for (let x = room.x; x < room.x + room.w; x++) {
    edges.push([x, room.y - 1, 'v'], [x, room.y + room.h, 'v']);
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    edges.push([room.x - 1, y, 'h'], [room.x + room.w, y, 'h']);
  }
  for (const [x, y, axis] of edges) {
    if (!inside(x, y)) continue;
    const i = idx(x, y);
    if (cells[i] !== C.FLOOR) continue;
    const a = axis === 'v' ? cellOf(cells, x - 1, y) : cellOf(cells, x, y - 1);
    const b = axis === 'v' ? cellOf(cells, x + 1, y) : cellOf(cells, x, y + 1);
    if (a !== C.SOLID || b !== C.SOLID) continue;
    cells[i] = C.DOOR;
  }
}

function cellOf(cells, x, y) {
  if (!inside(x, y)) return C.SOLID;
  return cells[idx(x, y)];
}

/** Cell lookup that treats out-of-bounds as solid rock. */
export function cellAt(dungeon, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return C.SOLID;
  return dungeon.cells[gy * GRID_W + gx];
}

export function cellAtWorld(dungeon, x, z) {
  return cellAt(dungeon, Math.floor(x / CELL), Math.floor(z / CELL));
}

export function roomAtWorld(dungeon, x, z) {
  const gx = Math.floor(x / CELL);
  const gy = Math.floor(z / CELL);
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return null;
  const id = dungeon.roomAt[gy * GRID_W + gx];
  return id >= 0 ? dungeon.rooms[id] : null;
}

export { idx as cellIndex };
