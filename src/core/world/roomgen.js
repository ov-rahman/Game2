/**
 * Room tile-layout generation.
 *
 * Each room is a fixed ROOM_W x ROOM_H tile grid with a one-tile wall border and
 * door gaps punched into the middle of each connected side. Interiors come from
 * a set of hand-designed *patterns* that are then perturbed by the floor theme
 * (rock / pit / hazard chances), which keeps rooms readable but never identical.
 *
 * Every generated room is verified: all doors must reach each other and the
 * centre across walkable tiles, otherwise the interior is dissolved and retried.
 */
import { ROOM_W, ROOM_H, T, ROOM_KIND } from '../constants.js';

const CX = (ROOM_W - 1) / 2; // 9
const CY = (ROOM_H - 1) / 2; // 5

export const DOOR_TILE = {
  0: { x: CX, y: 0 },
  1: { x: ROOM_W - 1, y: CY },
  2: { x: CX, y: ROOM_H - 1 },
  3: { x: 0, y: CY },
};

function idx(x, y) {
  return y * ROOM_W + x;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_H;
}

/** Interior patterns. Each returns a list of {x,y} cells to fill with blocks. */
const PATTERNS = {
  open() {
    return [];
  },

  pillars(rng) {
    const cells = [];
    const stepX = rng.pick([4, 5]);
    const stepY = 3;
    for (let y = 2; y <= ROOM_H - 3; y += stepY) {
      for (let x = 3; x <= ROOM_W - 4; x += stepX) {
        cells.push({ x, y });
        if (rng.chance(0.35)) cells.push({ x: x + 1, y });
      }
    }
    return cells;
  },

  cross() {
    const cells = [];
    for (let x = 4; x <= ROOM_W - 5; x++) cells.push({ x, y: CY });
    for (let y = 2; y <= ROOM_H - 3; y++) cells.push({ x: CX, y });
    // Punch gaps so the cross never seals a quadrant.
    return cells.filter((c) => !(Math.abs(c.x - CX) === 3 || Math.abs(c.y - CY) === 2));
  },

  ring(rng) {
    const cells = [];
    const rx = rng.int(4, 6);
    const ry = rng.int(2, 3);
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      const x = Math.round(CX + Math.cos(t) * rx);
      const y = Math.round(CY + Math.sin(t) * ry);
      if (Math.abs(Math.cos(t)) > 0.94 || Math.abs(Math.sin(t)) > 0.94) continue; // gaps at the poles
      cells.push({ x, y });
    }
    return cells;
  },

  diagonals(rng) {
    const cells = [];
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) {
      const x0 = 2 + i * 4;
      for (let k = 0; k < 3; k++) {
        cells.push({ x: x0 + k, y: 2 + k });
        cells.push({ x: ROOM_W - 1 - (x0 + k), y: ROOM_H - 3 - k });
      }
    }
    return cells;
  },

  corners() {
    const cells = [];
    const blocks = [
      [2, 2],
      [ROOM_W - 4, 2],
      [2, ROOM_H - 4],
      [ROOM_W - 4, ROOM_H - 4],
    ];
    for (const [bx, by] of blocks) {
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) cells.push({ x: bx + x, y: by + y });
    }
    return cells;
  },

  maze(rng) {
    const cells = [];
    for (let y = 2; y <= ROOM_H - 3; y += 2) {
      for (let x = 2; x <= ROOM_W - 3; x += 2) {
        if (rng.chance(0.55)) {
          cells.push({ x, y });
          const d = rng.int(0, 3);
          const dx = d === 1 ? 1 : d === 3 ? -1 : 0;
          const dy = d === 0 ? -1 : d === 2 ? 1 : 0;
          cells.push({ x: x + dx, y: y + dy });
        }
      }
    }
    return cells;
  },

  lanes(rng) {
    const cells = [];
    const y0 = rng.pick([3, 4]);
    for (let x = 3; x <= ROOM_W - 4; x++) {
      if (Math.abs(x - CX) < 2) continue;
      cells.push({ x, y: y0 });
      cells.push({ x, y: ROOM_H - 1 - y0 });
    }
    return cells;
  },

  arena(rng) {
    const cells = [];
    for (let i = 0; i < 6; i++) {
      const x = rng.int(3, ROOM_W - 4);
      const y = rng.int(2, ROOM_H - 3);
      cells.push({ x, y });
      if (rng.chance(0.5)) cells.push({ x: x + 1, y });
      if (rng.chance(0.3)) cells.push({ x, y: y + 1 });
    }
    return cells;
  },
};

const PATTERN_NAMES = Object.keys(PATTERNS);

/** Cells that must always stay walkable: door approaches and the centre. */
function protectedCells(doors) {
  const keep = new Set();
  const mark = (x, y) => {
    if (inBounds(x, y)) keep.add(idx(x, y));
  };
  for (let d = 0; d < 4; d++) {
    if (!doors[d]) continue;
    const t = DOOR_TILE[d];
    for (let k = 0; k <= 2; k++) {
      mark(t.x + (d === 1 ? -k : d === 3 ? k : 0), t.y + (d === 0 ? k : d === 2 ? -k : 0));
    }
  }
  for (let x = CX - 1; x <= CX + 1; x++) for (let y = CY - 1; y <= CY + 1; y++) mark(x, y);
  return keep;
}

function walkable(tile) {
  return tile === T.FLOOR || tile === T.HAZARD || tile === T.DECO;
}

/** Flood fill from the centre; returns the count of reachable walkable tiles. */
function floodCheck(tiles, doors) {
  const seen = new Uint8Array(ROOM_W * ROOM_H);
  const stack = [idx(CX, CY)];
  seen[stack[0]] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count++;
    const x = i % ROOM_W;
    const y = (i / ROOM_W) | 0;
    const push = (nx, ny) => {
      if (!inBounds(nx, ny)) return;
      const ni = idx(nx, ny);
      if (seen[ni]) return;
      if (!walkable(tiles[ni])) return;
      seen[ni] = 1;
      stack.push(ni);
    };
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  // Every open door must be reachable.
  for (let d = 0; d < 4; d++) {
    if (!doors[d]) continue;
    const t = DOOR_TILE[d];
    const inner = {
      x: t.x + (d === 1 ? -1 : d === 3 ? 1 : 0),
      y: t.y + (d === 0 ? 1 : d === 2 ? -1 : 0),
    };
    if (!seen[idx(inner.x, inner.y)]) return -1;
  }
  return count;
}

/**
 * Build the tile grid for one room.
 * @param {import('../rng.js').Rng} rng
 * @param {boolean[]} doors        which of the 4 sides has a door
 * @param {Object} floor           floor definition from data/floors.js
 * @param {string} kind            ROOM_KIND value
 */
export function generateRoomTiles(rng, doors, floor, kind) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const tiles = new Uint8Array(ROOM_W * ROOM_H);

    // Border walls.
    for (let x = 0; x < ROOM_W; x++) {
      tiles[idx(x, 0)] = T.WALL;
      tiles[idx(x, ROOM_H - 1)] = T.WALL;
    }
    for (let y = 0; y < ROOM_H; y++) {
      tiles[idx(0, y)] = T.WALL;
      tiles[idx(ROOM_W - 1, y)] = T.WALL;
    }

    const keep = protectedCells(doors);
    const simple = kind === ROOM_KIND.BOSS || kind === ROOM_KIND.SHOP || kind === ROOM_KIND.TREASURE || kind === ROOM_KIND.START;

    if (!simple) {
      const name = attempt < 5 ? rng.pick(PATTERN_NAMES) : 'open';
      const cells = PATTERNS[name](rng);
      for (const c of cells) {
        if (!inBounds(c.x, c.y)) continue;
        if (c.x === 0 || c.y === 0 || c.x === ROOM_W - 1 || c.y === ROOM_H - 1) continue;
        const i = idx(c.x, c.y);
        if (keep.has(i)) continue;
        const roll = rng.next();
        if (roll < floor.pitChance) tiles[i] = T.PIT;
        else if (roll < floor.pitChance + floor.hazardChance) tiles[i] = T.HAZARD;
        else if (roll < floor.pitChance + floor.hazardChance + floor.rockChance) tiles[i] = T.ROCK;
        else tiles[i] = T.WALL;
      }

      // Scatter a few loose hazards / rocks outside the pattern.
      const extra = rng.int(2, 7);
      for (let n = 0; n < extra; n++) {
        const x = rng.int(2, ROOM_W - 3);
        const y = rng.int(2, ROOM_H - 3);
        const i = idx(x, y);
        if (keep.has(i) || tiles[i] !== T.FLOOR) continue;
        tiles[i] = rng.chance(0.55) ? T.ROCK : T.HAZARD;
      }
    } else if (kind === ROOM_KIND.BOSS) {
      // Boss arenas get a light decorative frame only — never blocking cover.
      for (const [x, y] of [
        [2, 2],
        [ROOM_W - 3, 2],
        [2, ROOM_H - 3],
        [ROOM_W - 3, ROOM_H - 3],
      ]) {
        tiles[idx(x, y)] = T.DECO;
      }
    }

    // Purely visual floor variation.
    const decoCount = Math.floor(ROOM_W * ROOM_H * floor.decoDensity * 0.4);
    for (let n = 0; n < decoCount; n++) {
      const x = rng.int(1, ROOM_W - 2);
      const y = rng.int(1, ROOM_H - 2);
      const i = idx(x, y);
      if (tiles[i] === T.FLOOR && !keep.has(i)) tiles[i] = T.DECO;
    }

    const reach = floodCheck(tiles, doors);
    if (reach > ROOM_W * ROOM_H * 0.42) {
      return tiles;
    }
  }

  // Fallback: an empty room is always valid.
  const tiles = new Uint8Array(ROOM_W * ROOM_H);
  for (let x = 0; x < ROOM_W; x++) {
    tiles[idx(x, 0)] = T.WALL;
    tiles[idx(x, ROOM_H - 1)] = T.WALL;
  }
  for (let y = 0; y < ROOM_H; y++) {
    tiles[idx(0, y)] = T.WALL;
    tiles[idx(ROOM_W - 1, y)] = T.WALL;
  }
  return tiles;
}

export { idx as tileIndex, CX as ROOM_CX, CY as ROOM_CY };
