/**
 * Floor (level) generation: the room graph.
 *
 * Rooms occupy cells of a coarse grid. Growth starts from the centre and only
 * accepts a candidate cell when it touches exactly one existing room, which
 * produces the branchy, mostly-tree-shaped layouts that read well on a minimap
 * while still leaving occasional loops.
 *
 * Special rooms are then assigned to dead ends, farthest first, so the boss is
 * always a real trek from the entrance.
 */
import { DIR, DIR_OPPOSITE, ROOM_KIND } from '../constants.js';
import { generateRoomTiles } from './roomgen.js';

const GRID_W = 11;
const GRID_H = 9;

function key(gx, gy) {
  return gy * GRID_W + gx;
}

/**
 * @param {import('../rng.js').Rng} rng
 * @param {Object} floorDef floor definition from data/floors.js
 */
export function generateFloor(rng, floorDef) {
  const target = rng.int(floorDef.rooms.min, floorDef.rooms.max);
  const cells = new Map(); // key -> room

  const startX = Math.floor(GRID_W / 2);
  const startY = Math.floor(GRID_H / 2);

  function makeRoom(gx, gy) {
    const room = {
      id: cells.size,
      gx,
      gy,
      kind: ROOM_KIND.NORMAL,
      doors: [null, null, null, null], // room id per side
      locked: [false, false, false, false],
      secretSide: [false, false, false, false],
      tiles: null,
      seed: rng.nextU32(),
      visited: false,
      cleared: false,
      populated: false,
      enemies: [],
      props: [],
      depth: 0,
    };
    cells.set(key(gx, gy), room);
    return room;
  }

  const start = makeRoom(startX, startY);
  start.kind = ROOM_KIND.START;
  start.cleared = true;

  function neighborCount(gx, gy) {
    let n = 0;
    for (const d of DIR) if (cells.has(key(gx + d.x, gy + d.y))) n++;
    return n;
  }

  // ---- grow -------------------------------------------------------------
  let guard = 0;
  while (cells.size < target && guard++ < 900) {
    const list = [...cells.values()];
    const from = rng.weighted(list, (r) => (r.kind === ROOM_KIND.START ? 2 : 1));
    const order = rng.shuffle([0, 1, 2, 3]);
    for (const d of order) {
      const nx = from.gx + DIR[d].x;
      const ny = from.gy + DIR[d].y;
      if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
      if (cells.has(key(nx, ny))) continue;
      // Prefer cells with a single existing neighbour so the map stays legible.
      if (neighborCount(nx, ny) > 1 && !rng.chance(0.18)) continue;
      const room = makeRoom(nx, ny);
      room.depth = from.depth + 1;
      break;
    }
  }

  // ---- connect ----------------------------------------------------------
  const rooms = [...cells.values()];
  for (const r of rooms) {
    for (let d = 0; d < 4; d++) {
      const n = cells.get(key(r.gx + DIR[d].x, r.gy + DIR[d].y));
      if (!n) continue;
      r.doors[d] = n.id;
    }
  }

  // Recompute depth from the start room by BFS (growth order is not distance).
  for (const r of rooms) r.depth = -1;
  start.depth = 0;
  const queue = [start];
  while (queue.length) {
    const r = queue.shift();
    for (let d = 0; d < 4; d++) {
      const id = r.doors[d];
      if (id == null) continue;
      const n = rooms[id];
      if (n.depth >= 0) continue;
      n.depth = r.depth + 1;
      queue.push(n);
    }
  }

  function degree(r) {
    let n = 0;
    for (let d = 0; d < 4; d++) if (r.doors[d] != null) n++;
    return n;
  }

  // ---- special rooms ----------------------------------------------------
  const deadEnds = rooms
    .filter((r) => r.kind === ROOM_KIND.NORMAL && degree(r) === 1)
    .sort((a, b) => b.depth - a.depth);

  const spend = (kind) => {
    const r = deadEnds.shift();
    if (!r) return null;
    r.kind = kind;
    return r;
  };

  const bossRoom = spend(ROOM_KIND.BOSS);
  const wanted = floorDef.special || {};
  const specials = [];
  for (let i = 0; i < (wanted.treasure || 0); i++) specials.push(ROOM_KIND.TREASURE);
  for (let i = 0; i < (wanted.shop || 0); i++) specials.push(ROOM_KIND.SHOP);
  for (let i = 0; i < (wanted.challenge || 0); i++) specials.push(ROOM_KIND.CHALLENGE);
  rng.shuffle(specials);
  for (const kind of specials) {
    const r = spend(kind);
    if (r && (kind === ROOM_KIND.TREASURE || kind === ROOM_KIND.CHALLENGE)) {
      // Lock the one door leading in.
      for (let d = 0; d < 4; d++) {
        if (r.doors[d] == null) continue;
        r.locked[d] = true;
        rooms[r.doors[d]].locked[DIR_OPPOSITE[d]] = true;
      }
    }
  }

  // Boss door is barred until the floor's other rooms are handled — visually a
  // heavy gate, mechanically always openable.
  if (bossRoom) {
    for (let d = 0; d < 4; d++) {
      if (bossRoom.doors[d] == null) continue;
      bossRoom.bossSide = d;
      rooms[bossRoom.doors[d]].bossGate = DIR_OPPOSITE[d];
    }
  }

  // ---- secret room ------------------------------------------------------
  if (wanted.secret) {
    const candidates = [];
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      for (let gy = 1; gy < GRID_H - 1; gy++) {
        if (cells.has(key(gx, gy))) continue;
        let touch = 0;
        let anyNormal = false;
        for (const d of DIR) {
          const n = cells.get(key(gx + d.x, gy + d.y));
          if (n) {
            touch++;
            if (n.kind === ROOM_KIND.NORMAL || n.kind === ROOM_KIND.START) anyNormal = true;
          }
        }
        if (touch >= 2 && anyNormal) candidates.push({ gx, gy, touch });
      }
    }
    if (candidates.length) {
      const pickCell = rng.weighted(candidates, (c) => c.touch);
      const secret = makeRoom(pickCell.gx, pickCell.gy);
      secret.kind = ROOM_KIND.SECRET;
      secret.hidden = true;
      rooms.push(secret);
      for (let d = 0; d < 4; d++) {
        const n = cells.get(key(secret.gx + DIR[d].x, secret.gy + DIR[d].y));
        if (!n || n.kind === ROOM_KIND.BOSS) continue;
        secret.doors[d] = n.id;
        secret.secretSide[d] = true;
        n.doors[DIR_OPPOSITE[d]] = secret.id;
        n.secretSide[DIR_OPPOSITE[d]] = true;
      }
      secret.depth = 99;
    }
  }

  // ---- tiles ------------------------------------------------------------
  for (const r of rooms) {
    const rr = rng.fork(`room${r.id}`);
    const doorFlags = [0, 1, 2, 3].map((d) => r.doors[d] != null);
    r.tiles = generateRoomTiles(rr, doorFlags, floorDef, r.kind);
  }

  return {
    def: floorDef,
    index: floorDef.index,
    rooms,
    startRoom: start.id,
    bossRoom: bossRoom ? bossRoom.id : rooms[rooms.length - 1].id,
    gridW: GRID_W,
    gridH: GRID_H,
    cleared: 0,
  };
}

export { GRID_W, GRID_H };
