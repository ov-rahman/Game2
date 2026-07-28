/**
 * Dungeon generation.
 *
 * Classic rooms-and-corridors carved into a cell grid, then decorated per floor
 * theme. The grid is the single source of truth: collision, navigation, mesh
 * building and lighting all read it, which keeps what you see and what you can
 * walk through from ever disagreeing.
 */
import { GRID_W, GRID_H, CELL, C, isOpen } from '../constants.js';
import { buildTerrain, groundAt } from './terrain.js';
import { decorFor } from '../../data/decor.js';

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

  // ---- room styles -----------------------------------------------------
  // The masonry a room is built from. Neighbours are pushed apart in the style
  // list so that walking through a door usually changes what the walls are made
  // of — the single cheapest way to stop a floor feeling like one long room.
  const decor = decorFor(floorDef);
  const styles = decor.styles;
  for (const r of rooms) {
    let pick = rng.int(0, styles.length - 1);
    let guardS = 0;
    while (guardS++ < 6 && r.links.some((id) => rooms[id].style === styles[pick])) {
      pick = (pick + 1) % styles.length;
    }
    r.style = styles[pick];
  }

  // ---- decorate --------------------------------------------------------
  for (const r of rooms) {
    if (r.kind === ROOM_KIND.START || r.kind === ROOM_KIND.SHOP) continue;

    // Hazard pools: blobs rather than scattered cells, so they read as terrain.
    const pools = Math.round(floorDef.hazardChance * 7);
    for (let p = 0; p < pools; p++) {
      const px = rng.int(r.x + 1, r.x + r.w - 2);
      const py = rng.int(r.y + 1, r.y + r.h - 2);
      const rad = rng.int(1, 2);
      for (let y = py - rad; y <= py + rad; y++) {
        for (let x = px - rad; x <= px + rad; x++) {
          if (!inside(x, y)) continue;
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
      if (cells[idx(bx, by)] !== C.FLOOR) continue;
      cells[idx(bx, by)] = C.RUBBLE;
    }

    // Rock columns. Confined to the interior of the room rectangle, which is
    // what makes them safe: corridors attach at the border ring, so a column
    // can never seal an exit, and there is always a way round it.
    if (r.w >= 5 && r.h >= 5) {
      const columns = Math.round((r.w * r.h) / 34) + rng.int(0, 1);
      for (let c = 0; c < columns; c++) {
        const px = rng.int(r.x + 1, r.x + r.w - 2);
        const py = rng.int(r.y + 1, r.y + r.h - 2);
        if (cells[idx(px, py)] !== C.FLOOR) continue;
        // Two columns side by side would make a wall stub; keep them apart.
        if (nearPillar(cells, px, py)) continue;
        cells[idx(px, py)] = C.PILLAR;
      }
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

  // ---- stairs ----------------------------------------------------------
  // Placed in the boss room but only usable once the boss is down.
  const stairsRoom = bossRoom || rooms[rooms.length - 1];
  const stairs = {
    gx: stairsRoom.cx,
    gy: stairsRoom.cy + Math.min(2, (stairsRoom.h >> 1) - 1),
    x: (stairsRoom.cx + 0.5) * CELL,
    z: (stairsRoom.cy + Math.min(2, (stairsRoom.h >> 1) - 1) + 0.5) * CELL,
    active: false,
  };

  const start = rooms[0].world();

  const dungeon = {
    def: floorDef,
    cells,
    roomAt,
    rooms,
    lights,
    stairs,
    start,
    bossRoom: bossRoom ? bossRoom.id : 0,
    width: GRID_W,
    height: GRID_H,
  };

  // Relief last: it reads the finished grid, and everything that stands on the
  // ground needs it, so it has to exist before the first tick.
  dungeon.terrain = buildTerrain(rng.fork('terrain'), dungeon, floorDef);

  // Lift the fixtures onto the ground they actually sit on.
  stairs.y = groundAt(dungeon.terrain, stairs.x, stairs.z);
  for (const l of lights) l.y += groundAt(dungeon.terrain, l.x, l.z);

  // Glowing decoration lights the room it stands in. Marked room -2 so the mesh
  // builder does not also hang a crystal on it — it already is one.
  const propLights = [];
  for (const pr of dungeon.terrain.props) {
    if (!pr.lit || !pr.color) continue;
    // One light per patch. Two glowing clumps three metres apart light the same
    // wall twice and cost twice as much, so the second one does not get to.
    let crowded = false;
    for (const o of propLights) {
      if (Math.abs(o.x - pr.x) < 7 && Math.abs(o.z - pr.z) < 7) { crowded = true; break; }
    }
    if (crowded) continue;
    propLights.push(pr);
    lights.push({
      x: pr.x,
      y: pr.y + (pr.kind === 'sconce' ? 0.1 : pr.h * 0.7 + 0.1),
      z: pr.z,
      r: pr.color[0],
      g: pr.color[1],
      b: pr.color[2],
      radius: pr.kind === 'sconce' ? 9 : 5.5,
      intensity: pr.kind === 'sconce' ? 1.5 : 0.75,
      flicker: pr.kind === 'sconce' ? rng.range(5, 10) : 0,
      phase: rng.angle(),
      room: -2,
    });
  }

  dungeon.corridorStyle = decor.corridor;

  return dungeon;
}

function inside(x, y) {
  return x >= 1 && y >= 1 && x < GRID_W - 1 && y < GRID_H - 1;
}

/** Is there already a column within one cell, diagonals included? */
function nearPillar(cells, gx, gy) {
  for (let y = gy - 1; y <= gy + 1; y++) {
    for (let x = gx - 1; x <= gx + 1; x++) {
      if (!inside(x, y)) continue;
      if (cells[idx(x, y)] === C.PILLAR) return true;
    }
  }
  return false;
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
  const edges = [];
  for (let x = room.x; x < room.x + room.w; x++) {
    edges.push([x, room.y - 1], [x, room.y + room.h]);
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    edges.push([room.x - 1, y], [room.x + room.w, y]);
  }
  for (const [x, y] of edges) {
    if (!inside(x, y)) continue;
    const i = idx(x, y);
    if (cells[i] !== C.FLOOR) continue;
    cells[i] = C.DOOR;
  }
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
