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
import { buildContour } from './contour.js';
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

  // ---- elevation and floor plan ----------------------------------------
  // Every room sits at its own height, and some rooms are not one flat height
  // at all. `elev` pins a per-cell floor level that the terrain builder seeds
  // from, which is how a room can hold a gallery above a sunken hall.
  const elev = new Float32Array(GRID_W * GRID_H);
  const elevSet = new Uint8Array(GRID_W * GRID_H);
  const headroom = new Float32Array(GRID_W * GRID_H);
  const relief = floorDef.relief == null ? 0.5 : floorDef.relief;

  for (const r of rooms) {
    // The start room stays at zero so the player never spawns on a slope.
    r.elev = r.id === 0 ? 0 : rng.range(-1, 1) * relief * 4.2;
    r.head = rng.range(-0.35, 1.0) * relief * 2.2;
    r.plan = 'hall';
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = idx(x, y);
        elev[i] = r.elev;
        headroom[i] = r.head;
        elevSet[i] = 1;
      }
    }
  }

  // Which rooms get a shape other than "rectangle". Start, shop and boss rooms
  // stay simple: they are where the player spawns, buys and fights, and none of
  // those readings survive a floor you have to navigate.
  for (const r of rooms) {
    if (r.kind === ROOM_KIND.START || r.kind === ROOM_KIND.SHOP || r.kind === ROOM_KIND.BOSS) continue;
    const plans = [];
    if (r.w >= 9 && r.h >= 9) plans.push('sunken');
    if (Math.max(r.w, r.h) >= 9 && Math.min(r.w, r.h) >= 6) plans.push('terrace');
    if (Math.max(r.w, r.h) >= 8 && Math.min(r.w, r.h) >= 5) plans.push('chasm');
    if (r.w >= 6 && r.h >= 6) plans.push('cave', 'cave');
    if (!plans.length) continue;
    if (!rng.chance(0.72)) continue;
    const plan = rng.pick(plans);
    r.plan = plan;
    r.snapshot = snapshotRoom(cells, elev, headroom, r);
    if (plan === 'cave') {
      carveCave(cells, rng, r, headroom, relief);
      r.style = 'cavern';
    }
    else if (plan === 'sunken') carveSunken(cells, rng, r, elev, relief);
    else if (plan === 'terrace') carveTerrace(cells, rng, r, elev, relief);
    else if (plan === 'chasm') carveChasm(cells, rng, r);
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
  // Shaped rooms keep whatever they carved there — a chasm with a hole punched
  // through the middle of it is not a chasm.
  for (const r of rooms) {
    if (r.plan !== 'hall') continue;
    for (let y = r.cy - 1; y <= r.cy + 1; y++) {
      for (let x = r.cx - 1; x <= r.cx + 1; x++) {
        if (inside(x, y)) cells[idx(x, y)] = C.FLOOR;
      }
    }
  }

  // ---- connectivity repair ----------------------------------------------
  // Run last, because everything before it can disconnect the level: a floor
  // plan can pinch itself shut, and a pit pool dropped on a corridor mouth
  // strands whatever was behind it. Both are cheaper to detect than to prevent.
  //
  // Two stages. First undo floor plans that broke things — a rectangle is
  // always connected, so this always converges. Then, for anything still cut
  // off (a pit across the only way in), dig a path to it. The result is a level
  // that is walkable by construction rather than by argument.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reach = floodFill(cells, rooms[0].cx, rooms[0].cy);
    let repaired = false;
    for (const r of rooms) {
      if (r.plan === 'hall' || !r.snapshot) continue;
      if (roomReach(cells, reach, r) >= 0.8) continue;
      restoreRoom(cells, elev, headroom, r, r.snapshot);
      if (r.plan === 'cave') r.style = r.snapshot.style;
      r.plan = 'hall';
      repaired = true;
    }
    if (!repaired) break;
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    const reach = floodFill(cells, rooms[0].cx, rooms[0].cy);
    let target = null;
    for (const r of rooms) {
      if (roomReach(cells, reach, r) >= 0.8) continue;
      target = r;
      break;
    }
    if (!target) break;
    if (!digTo(cells, reach, target.cx, target.cy)) break;
  }
  for (const r of rooms) r.snapshot = null;

  // ---- secrets ----------------------------------------------------------
  // A hollow behind a cracked wall. The block in front of it is ordinary
  // rubble — the same thing the player has been shooting all game — so the
  // mechanism needs no explaining, and finding one is a matter of noticing
  // that a stretch of wall has something behind it.
  const secrets = [];
  {
    const wanted = rng.int(1, 2);
    let tries = 0;
    while (secrets.length < wanted && tries++ < 400) {
      const r = rng.pick(rooms);
      if (r.kind === ROOM_KIND.BOSS || r.plan === 'cave') continue;
      // A cell on the room's rim, with two cells of rock behind it.
      const side = rng.int(0, 3);
      const px = side === 2 ? r.x : side === 3 ? r.x + r.w - 1 : rng.int(r.x + 1, r.x + r.w - 2);
      const py = side === 0 ? r.y : side === 1 ? r.y + r.h - 1 : rng.int(r.y + 1, r.y + r.h - 2);
      const dx = side === 2 ? -1 : side === 3 ? 1 : 0;
      const dy = side === 0 ? -1 : side === 1 ? 1 : 0;
      if (cells[idx(px, py)] !== C.FLOOR) continue;

      const wx = px + dx;
      const wy = py + dy;
      const ax = px + dx * 2;
      const ay = py + dy * 2;
      if (!inside(wx, wy) || !inside(ax, ay)) continue;
      if (cells[idx(wx, wy)] !== C.SOLID || cells[idx(ax, ay)] !== C.SOLID) continue;
      // The chamber must be buried: no open cell may touch it except through
      // the block, or it is not a secret, it is a doorway.
      let sealed = true;
      for (let oy = -1; oy <= 1 && sealed; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = ax + ox;
          const ny = ay + oy;
          if (!inside(nx, ny)) { sealed = false; break; }
          if (nx === wx && ny === wy) continue;
          if (nx === ax && ny === ay) continue;
          if (cells[idx(nx, ny)] !== C.SOLID) { sealed = false; break; }
        }
      }
      if (!sealed) continue;

      cells[idx(wx, wy)] = C.RUBBLE;
      cells[idx(ax, ay)] = C.FLOOR;
      roomAt[idx(ax, ay)] = r.id;
      elev[idx(ax, ay)] = elev[idx(px, py)];
      headroom[idx(ax, ay)] = headroom[idx(px, py)];
      elevSet[idx(ax, ay)] = 1;
      secrets.push({ gx: ax, gy: ay, x: (ax + 0.5) * CELL, z: (ay + 0.5) * CELL, room: r.id });
    }
  }

  // ---- doorways --------------------------------------------------------
  // A floor cell on a room boundary with exactly two open neighbours across is
  // a threshold: mark it so the mesh builder can frame it.
  for (const r of rooms) {
    // A cave has no thresholds. Framing its mouth in dressed stone would say
    // somebody built it, which is exactly the opposite of the point.
    if (r.plan === 'cave') continue;
    markDoorways(cells, r);
  }

  // ---- lights ----------------------------------------------------------
  const lights = [];
  for (const r of rooms) {
    const n = r.kind === ROOM_KIND.BOSS ? 4 : Math.max(1, Math.round((r.w * r.h) / 26));
    for (let i = 0; i < n; i++) {
      let lx = rng.int(r.x + 1, r.x + r.w - 2);
      let ly = rng.int(r.y + 1, r.y + r.h - 2);
      // Shaped rooms have rock inside them now; a lamp buried in a ledge lights
      // nothing. Retry a few times before giving up on this one.
      for (let t = 0; t < 8 && !isOpen(cells[idx(lx, ly)]); t++) {
        lx = rng.int(r.x + 1, r.x + r.w - 2);
        ly = rng.int(r.y + 1, r.y + r.h - 2);
      }
      if (!isOpen(cells[idx(lx, ly)])) continue;
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

  // The stairs must be standable and reachable, whatever landed on that cell.
  for (let y = stairs.gy - 1; y <= stairs.gy + 1; y++) {
    for (let x = stairs.gx - 1; x <= stairs.gx + 1; x++) {
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      if (cells[i] === C.PIT || cells[i] === C.PILLAR || cells[i] === C.RUBBLE || cells[i] === C.LEDGE) cells[i] = C.FLOOR;
    }
  }
  {
    const reach = floodFill(cells, rooms[0].cx, rooms[0].cy);
    if (!reach[idx(stairs.gx, stairs.gy)]) digTo(cells, reach, stairs.gx, stairs.gy);
  }

  const start = rooms[0].world();

  const dungeon = {
    def: floorDef,
    secrets,
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
  dungeon.elev = elev;
  dungeon.elevSet = elevSet;
  dungeon.headroom = headroom;

  // Which cells belong to a cave. The renderer draws these from a smooth
  // isoline instead of from grid faces, so the mark has to cover the rock
  // around a cave as well as its floor — that rock is what the isoline runs
  // through.
  const natural = new Uint8Array(GRID_W * GRID_H);
  for (const r of rooms) {
    if (r.plan !== 'cave') continue;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (!inside(x, y)) continue;
        natural[idx(x, y)] = 1;
      }
    }
  }
  dungeon.natural = natural;
  dungeon.contour = buildContour(cells, natural, rng.fork('contour'));

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

// ------------------------------------------------------------- floor plans

function snapshotRoom(cells, elev, headroom, r) {
  const n = r.w * r.h;
  const snap = { cells: new Uint8Array(n), elev: new Float32Array(n), head: new Float32Array(n), style: r.style };
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x;
      const gy = r.y + y;
      if (!inside(gx, gy)) continue;
      const i = idx(gx, gy);
      const k = y * r.w + x;
      snap.cells[k] = cells[i];
      snap.elev[k] = elev[i];
      snap.head[k] = headroom[i];
    }
  }
  return snap;
}

function restoreRoom(cells, elev, headroom, r, snap) {
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x;
      const gy = r.y + y;
      if (!inside(gx, gy)) continue;
      const i = idx(gx, gy);
      const k = y * r.w + x;
      cells[i] = snap.cells[k];
      elev[i] = snap.elev[k];
      headroom[i] = snap.head[k];
    }
  }
}

/** Fraction of a room's open cells that the flood fill reached. */
function roomReach(cells, reach, r) {
  let open = 0;
  let hit = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      const c = cells[i];
      if (c === C.SOLID || c === C.PIT || c === C.PILLAR || c === C.LEDGE) continue;
      open++;
      if (reach[i]) hit++;
    }
  }
  return open === 0 ? 1 : hit / open;
}

/**
 * Dig from (gx,gy) to the nearest already-reachable cell, opening whatever is
 * in the way. The last resort that makes the level walkable no matter what the
 * generators did to it.
 */
function digTo(cells, reach, gx, gy) {
  const prev = new Int32Array(GRID_W * GRID_H).fill(-1);
  const seen = new Uint8Array(GRID_W * GRID_H);
  const queue = new Int32Array(GRID_W * GRID_H);
  let head = 0;
  let tail = 0;
  const start = idx(gx, gy);
  seen[start] = 1;
  queue[tail++] = start;
  let found = -1;
  while (head < tail) {
    const cur = queue[head++];
    if (reach[cur]) { found = cur; break; }
    const cx = cur % GRID_W;
    const cy = (cur / GRID_W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (seen[ni]) continue;
      seen[ni] = 1;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  if (found < 0) return false;
  let cur = found;
  let guardD = 0;
  while (cur >= 0 && guardD++ < 4096) {
    const c = cells[cur];
    if (c === C.SOLID || c === C.PIT || c === C.PILLAR || c === C.LEDGE) cells[cur] = C.FLOOR;
    cur = prev[cur];
  }
  return true;
}

/** Cells reachable on foot from (gx,gy). */
function floodFill(cells, gx, gy) {
  const seen = new Uint8Array(GRID_W * GRID_H);
  const queue = new Int32Array(GRID_W * GRID_H);
  let head = 0;
  let tail = 0;
  const start = idx(gx, gy);
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % GRID_W;
    const cy = (cur / GRID_W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const ni = idx(nx, ny);
      if (seen[ni]) continue;
      const c = cells[ni];
      // Rubble counts as passable: it is breakable, and a room behind one is
      // a puzzle, not a dead end.
      if (c === C.SOLID || c === C.PIT || c === C.PILLAR || c === C.LEDGE) continue;
      seen[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return seen;
}

/**
 * Is this room-border cell a corridor mouth?
 *
 * Floor plans are carved after the corridors, so anything that seals a mouth
 * strands the room. Every carver asks this before it puts rock, a pit or a
 * retaining wall on the rim.
 */
function isMouth(cells, r, x, y) {
  const onEdge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
  if (!onEdge) return false;
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
    const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (!inside(nx, ny)) continue;
    if (nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h) continue;
    if (isOpen(cells[idx(nx, ny)])) return true;
  }
  return false;
}



/**
 * Cave: eat the rectangle back into something that was never built.
 *
 * A couple of smoothing passes over a noisy mask, then a guaranteed-open core
 * so the room cannot close around itself. Corridors are carved after this and
 * punch through whatever is left, so connectivity is never at risk.
 */
function carveCave(cells, rng, r, headroom, relief) {
  const w = r.w;
  const h = r.h;
  let mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Bias toward rock at the rim: that is what rounds the outline off.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const p = edge === 0 ? 0.82 : edge === 1 ? 0.42 : 0.3;
      mask[y * w + x] = rng.chance(p) ? 1 : 0;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) { n++; continue; }
            n += mask[ny * w + nx];
          }
        }
        next[y * w + x] = n >= 5 ? 1 : 0;
      }
    }
    mask = next;
  }
  // Keep a blob around the centre open no matter what the automaton decided.
  const cxr = w >> 1;
  const cyr = h >> 1;
  const core = Math.max(2, Math.round(Math.min(w, h) * 0.3));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - cxr) + Math.abs(y - cyr) <= core) mask[y * w + x] = 0;
    }
  }

  // Every corridor mouth gets a passage to that core, dug before the mask is
  // committed. Without this the automaton walls the room's own entrances up.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = r.x + x;
      const gy = r.y + y;
      if (!inside(gx, gy)) continue;
      if (!isMouth(cells, r, gx, gy)) continue;
      let px = x;
      let py = y;
      let guardC = 0;
      while ((px !== cxr || py !== cyr) && guardC++ < 64) {
        mask[py * w + px] = 0;
        if (px !== cxr) px += Math.sign(cxr - px);
        else py += Math.sign(cyr - py);
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = r.x + x;
      const gy = r.y + y;
      if (!inside(gx, gy)) continue;
      const i = idx(gx, gy);
      if (mask[y * w + x]) cells[i] = C.SOLID;
      else headroom[i] = relief * 2.4; // caves are tall
    }
  }
}

/**
 * Sunken hall: a gallery you arrive on, a drop, and a floor below it.
 *
 * The ledge between the two is solid rock one cell thick, which is what lets
 * the height field hold a real cliff there instead of ramping across it. One
 * gap in the ledge, and a ramp inside the hall climbing to meet it, is the only
 * way down — so the room is genuinely two levels of the same place.
 */
function carveSunken(cells, rng, r, elev, relief) {
  const drop = 2.2 + relief * 1.6;
  const hall = r.elev - drop;

  const ring = (x, y) => Math.min(x - r.x, y - r.y, r.x + r.w - 1 - x, r.y + r.h - 1 - y);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      const d = ring(x, y);
      if (d === 0) continue; // gallery keeps the room elevation
      if (d === 1) {
        // A parapet, not a wall. The whole point of a sunken hall is that you
        // stand on the gallery and see the floor below you.
        if (cells[i] === C.FLOOR && !isMouth(cells, r, x, y)) cells[i] = C.LEDGE;
        continue;
      }
      elev[i] = hall;
    }
  }

  // The way down: a two-cell gap in the ledge and a ramp climbing to it.
  const side = rng.int(0, 3);
  const along = (t) => {
    if (side === 0) return { x: r.x + 2 + t, y: r.y + 1, ix: 0, iy: 1 };
    if (side === 1) return { x: r.x + 2 + t, y: r.y + r.h - 2, ix: 0, iy: -1 };
    if (side === 2) return { x: r.x + 1, y: r.y + 2 + t, ix: 1, iy: 0 };
    return { x: r.x + r.w - 2, y: r.y + 2 + t, ix: -1, iy: 0 };
  };
  const span = side < 2 ? r.w - 4 : r.h - 4;
  const start = rng.int(0, Math.max(0, span - 2));
  for (let t = start; t < start + 2; t++) {
    const g = along(t);
    if (!inside(g.x, g.y)) continue;
    const gi = idx(g.x, g.y);
    cells[gi] = C.FLOOR;
    elev[gi] = r.elev;
    // Three cells of ramp leading inward, down to the hall floor.
    for (let k = 1; k <= 3; k++) {
      const rx = g.x + g.ix * k;
      const ry = g.y + g.iy * k;
      if (!inside(rx, ry)) break;
      const ri = idx(rx, ry);
      if (cells[ri] === C.SOLID) break;
      cells[ri] = C.FLOOR;
      elev[ri] = r.elev + (hall - r.elev) * (k / 3);
    }
  }
}

/**
 * Terrace: two halves of one room at different heights, split by a retaining
 * wall with a ramp through it.
 */
function carveTerrace(cells, rng, r, elev, relief) {
  const horizontal = r.w >= r.h;
  const len = horizontal ? r.w : r.h;
  const split = Math.round(len / 2) + rng.int(-1, 1);
  if (split < 3 || split > len - 4) return;
  const step = 1.6 + relief * 1.7;
  const upper = r.elev + step;

  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      const t = horizontal ? x - r.x : y - r.y;
      if (t === split) {
        if (cells[i] === C.FLOOR && !isMouth(cells, r, x, y)) cells[i] = C.LEDGE;
      } else if (t > split) {
        elev[i] = upper;
      }
    }
  }

  // Ramp: a gap in the wall plus three cells on the low side climbing to it.
  const cross = horizontal ? r.h : r.w;
  const at = rng.int(1, Math.max(1, cross - 2));
  for (let o = 0; o < 2; o++) {
    const c = Math.min(cross - 1, at + o);
    const gx = horizontal ? r.x + split : r.x + c;
    const gy = horizontal ? r.y + c : r.y + split;
    if (!inside(gx, gy)) continue;
    cells[idx(gx, gy)] = C.FLOOR;
    elev[idx(gx, gy)] = upper;
    for (let k = 1; k <= 3; k++) {
      const rx = horizontal ? gx - k : gx;
      const ry = horizontal ? gy : gy - k;
      if (!inside(rx, ry)) break;
      const ri = idx(rx, ry);
      if (cells[ri] === C.SOLID) break;
      cells[ri] = C.FLOOR;
      elev[ri] = upper + (r.elev - upper) * (k / 3);
    }
  }
}

/** Chasm: a band of pit across the room, with one bridge over it. */
function carveChasm(cells, rng, r) {
  const horizontal = r.w >= r.h;
  const len = horizontal ? r.w : r.h;
  const at = Math.round(len / 2) + rng.int(-1, 1);
  if (at < 2 || at > len - 3) return;
  const width = rng.chance(0.45) ? 2 : 1;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const t = horizontal ? x - r.x : y - r.y;
      if (t < at || t >= at + width) continue;
      const i = idx(x, y);
      if (cells[i] === C.FLOOR && !isMouth(cells, r, x, y)) cells[i] = C.PIT;
    }
  }
  // The crossing. Two cells wide so a fight on it is not a tightrope.
  const cross = horizontal ? r.h : r.w;
  const b = rng.int(1, Math.max(1, cross - 3));
  for (let o = 0; o < 2; o++) {
    const c = Math.min(cross - 1, b + o);
    for (let t = at; t < at + width; t++) {
      const bx = horizontal ? r.x + t : r.x + c;
      const by = horizontal ? r.y + c : r.y + t;
      if (inside(bx, by)) cells[idx(bx, by)] = C.FLOOR;
    }
  }
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
