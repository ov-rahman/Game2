/**
 * Terrain relief.
 *
 * The grid decides *where* you can walk; this decides *how high* the ground is
 * while you walk there. Two corner-height fields — floor and ceiling — turn the
 * flat plane the grid would otherwise imply into rolling, faceted rock.
 *
 * Corners, not cells: heights live on the (GRID_W+1)x(GRID_H+1) lattice of cell
 * corners, so neighbouring cells always share their edge heights exactly and the
 * surface can never crack open. Each cell renders as two flat triangles, which
 * is what gives the low-poly, hand-faceted look rather than a smooth heightmap.
 *
 * This lives in core, not gfx, because the ground height is gameplay: the
 * player's eye, monster feet, pickups and props all stand on it.
 */
import { GRID_W, GRID_H, CELL, WALL_H, C } from '../constants.js';
import { decorFor } from '../../data/decor.js';

/** Corner lattice dimensions. */
export const CORNER_W = GRID_W + 1;
export const CORNER_H = GRID_H + 1;

/** Minimum head clearance. Below this a room stops being walkable-feeling. */
const MIN_HEADROOM = 2.5;
const MAX_HEADROOM = WALL_H + 2.4;

// ------------------------------------------------------------------ noise

function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise in [-1,1]. */
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

/** Two octaves is all the detail that survives the 428x240 render target. */
function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.66 + valueNoise(x * 2.7 + 11.3, y * 2.7 - 7.1, seed ^ 0x9e37) * 0.34;
}

// ------------------------------------------------------------------ build

const cellIdx = (x, y) => y * GRID_W + x;
const cornerIdx = (x, y) => y * CORNER_W + x;

function cellAt(cells, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return C.SOLID;
  return cells[cellIdx(x, y)];
}

/**
 * Build both height fields plus the scatter props that dress them.
 *
 * @param {Rng} rng     forked stream — terrain never disturbs other generators
 * @param {object} dungeon partially built dungeon (cells, rooms, roomAt)
 * @param {object} floorDef floor definition, for `relief` and `propStyle`
 */
export function buildTerrain(rng, dungeon, floorDef) {
  const { cells, rooms, roomAt } = dungeon;
  const relief = floorDef.relief == null ? 0.5 : floorDef.relief;
  const seedA = rng.nextU32();
  const seedB = rng.nextU32();

  // ---- per-room plateaus ------------------------------------------------
  // Each room sits at its own elevation with its own headroom: some are sunken
  // pits you drop into, some are raised galleries you climb up to. This is
  // where the relief lives. The floor inside a room stays close to level on
  // purpose — a brick floor that ripples reads as a bug, not as terrain, so the
  // unevenness a player actually sees is the scattered geometry, not the plane.
  const baseFloor = new Float32Array(GRID_W * GRID_H);
  const baseCeil = new Float32Array(GRID_W * GRID_H);
  const pinned = new Uint8Array(GRID_W * GRID_H);

  for (const r of rooms) {
    // The start room stays at zero so the player never spawns inside a slope.
    const elev = r.id === 0 ? 0 : rng.range(-1, 1) * relief * 1.9;
    const head = rng.range(-0.35, 1.0) * relief * 2.2;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = cellIdx(x, y);
        baseFloor[i] = elev;
        baseCeil[i] = head;
        pinned[i] = 1;
      }
    }
  }

  // ---- relax the rest ---------------------------------------------------
  // Corridors and solid rock have no elevation of their own; letting them
  // settle to the average of their neighbours produces natural ramps between
  // rooms instead of cliffs at every doorway. Laplace smoothing, 26 passes.
  const tmpF = new Float32Array(baseFloor);
  const tmpC = new Float32Array(baseCeil);
  for (let pass = 0; pass < 26; pass++) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = cellIdx(x, y);
        if (pinned[i]) continue;
        let sf = 0;
        let sc = 0;
        let n = 0;
        if (x > 0) { sf += baseFloor[i - 1]; sc += baseCeil[i - 1]; n++; }
        if (x < GRID_W - 1) { sf += baseFloor[i + 1]; sc += baseCeil[i + 1]; n++; }
        if (y > 0) { sf += baseFloor[i - GRID_W]; sc += baseCeil[i - GRID_W]; n++; }
        if (y < GRID_H - 1) { sf += baseFloor[i + GRID_W]; sc += baseCeil[i + GRID_W]; n++; }
        tmpF[i] = n ? sf / n : 0;
        tmpC[i] = n ? sc / n : 0;
      }
    }
    for (let i = 0; i < baseFloor.length; i++) {
      if (pinned[i]) continue;
      baseFloor[i] = tmpF[i];
      baseCeil[i] = tmpC[i];
    }
  }

  // ---- corner heights ---------------------------------------------------
  const floorH = new Float32Array(CORNER_W * CORNER_H);
  const ceilH = new Float32Array(CORNER_W * CORNER_H);

  for (let cy = 0; cy < CORNER_H; cy++) {
    for (let cx = 0; cx < CORNER_W; cx++) {
      // Average of the up-to-four cells that share this corner.
      let sf = 0;
      let sc = 0;
      let n = 0;
      // Liquids and stairs must stay dead level, so a corner touching one
      // takes no noise at all: the crease that produces reads as a shoreline.
      let level = false;
      for (let oy = -1; oy <= 0; oy++) {
        for (let ox = -1; ox <= 0; ox++) {
          const x = cx + ox;
          const y = cy + oy;
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          const i = cellIdx(x, y);
          sf += baseFloor[i];
          sc += baseCeil[i];
          n++;
          const c = cells[i];
          if (c === C.HAZARD || c === C.STAIRS || c === C.PIT) level = true;
        }
      }
      const bf = n ? sf / n : 0;
      const bc = n ? sc / n : 0;

      // A slight settle in the flagstones, nothing more. The ceiling is free to
      // be as broken as it likes — nobody walks on it.
      const detail = level ? 0 : fbm(cx * 0.38, cy * 0.38, seedA) * relief * 0.34;
      const roof = level
        ? fbm(cx * 0.34, cy * 0.34, seedB) * relief * 0.7
        : fbm(cx * 0.34, cy * 0.34, seedB) * relief * 2.1;

      const f = bf + detail;
      let headroom = WALL_H + bc + roof;
      if (headroom < MIN_HEADROOM) headroom = MIN_HEADROOM;
      if (headroom > MAX_HEADROOM) headroom = MAX_HEADROOM;

      const ci = cornerIdx(cx, cy);
      floorH[ci] = f;
      ceilH[ci] = f + headroom;
    }
  }

  // ---- slope limit ------------------------------------------------------
  // Room elevations plus a short corridor between them can produce a cliff.
  // Nothing in the game climbs, so clamp the rise between adjacent corners to
  // something a person walks up: 1.1 over a 4-unit cell is about fifteen
  // degrees. A few passes settle it without flattening the relief.
  const MAX_RISE = 1.1;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let cy = 0; cy < CORNER_H; cy++) {
      for (let cx = 0; cx < CORNER_W; cx++) {
        const i = cornerIdx(cx, cy);
        for (let k = 0; k < 2; k++) {
          const j = k === 0 ? (cx + 1 < CORNER_W ? i + 1 : -1) : (cy + 1 < CORNER_H ? i + CORNER_W : -1);
          if (j < 0) continue;
          const d = floorH[j] - floorH[i];
          if (d > MAX_RISE) {
            const fix = (d - MAX_RISE) * 0.5;
            floorH[i] += fix;
            floorH[j] -= fix;
            ceilH[i] += fix;
            ceilH[j] -= fix;
            changed = true;
          } else if (d < -MAX_RISE) {
            const fix = (-d - MAX_RISE) * 0.5;
            floorH[i] -= fix;
            floorH[j] += fix;
            ceilH[i] -= fix;
            ceilH[j] += fix;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  const terrain = { floorH, ceilH, props: [] };
  terrain.props = scatterProps(rng, cells, roomAt, rooms, terrain, floorDef);
  return terrain;
}

// ------------------------------------------------------------------ sample

function sample(field, x, z) {
  let fx = x / CELL;
  let fz = z / CELL;
  if (!(fx >= 0)) fx = 0;
  if (!(fz >= 0)) fz = 0;
  if (fx > GRID_W) fx = GRID_W;
  if (fz > GRID_H) fz = GRID_H;
  let cx = Math.floor(fx);
  let cz = Math.floor(fz);
  if (cx >= GRID_W) cx = GRID_W - 1;
  if (cz >= GRID_H) cz = GRID_H - 1;
  const tx = fx - cx;
  const tz = fz - cz;
  const i = cornerIdx(cx, cz);
  const a = field[i];
  const b = field[i + 1];
  const c = field[i + CORNER_W];
  const d = field[i + CORNER_W + 1];
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * tz;
}

/** Ground height at a world position. The one function gameplay calls. */
export function groundAt(terrain, x, z) {
  if (!terrain) return 0;
  return sample(terrain.floorH, x, z);
}

/** Ceiling height at a world position. */
export function ceilingAt(terrain, x, z) {
  if (!terrain) return WALL_H;
  return sample(terrain.ceilH, x, z);
}

/** Corner accessors for the mesh builder — exact values, no interpolation. */
export function floorCorner(terrain, cx, cy) {
  return terrain.floorH[cornerIdx(cx, cy)];
}

export function ceilCorner(terrain, cx, cy) {
  return terrain.ceilH[cornerIdx(cx, cy)];
}


// ------------------------------------------------------------------ props

/**
 * Scatter decoration.
 *
 * The relief of a room is not a wavy floor — it is the stuff standing on it.
 * Everything here is a discrete low-poly object drawn from the floor's decor
 * table, so two floors scatter completely different things over the same grid.
 *
 * None of it collides. That is a hard constraint, and it sets every size in
 * this function: anything the player can walk into is either low enough to step
 * over, high enough to walk under, or pressed into a wall the player cannot
 * reach past. The only decoration that blocks is the PILLAR cell, which lives
 * in the grid itself.
 */
function scatterProps(rng, cells, roomAt, rooms, terrain, floorDef) {
  const props = [];
  const decor = decorFor(floorDef);
  const density = (floorDef.scatter == null ? 1 : floorDef.scatter) * (decor.density || 1);
  if (density <= 0) return props;

  const table = decor.scatter;
  let totalWeight = 0;
  for (const e of table) totalWeight += e.weight || 1;

  const pickKind = () => {
    let r = rng.next() * totalWeight;
    for (const e of table) {
      r -= e.weight || 1;
      if (r <= 0) return e;
    }
    return table[table.length - 1];
  };

  for (let gy = 1; gy < GRID_H - 1; gy++) {
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      const cell = cellAt(cells, gx, gy);
      if (cell !== C.FLOOR && cell !== C.DOOR) continue;

      const cxw = (gx + 0.5) * CELL;
      const czw = (gy + 0.5) * CELL;

      // Which sides have rock to build against?
      const sides = [];
      if (cellAt(cells, gx, gy - 1) === C.SOLID) sides.push([0, -1]);
      if (cellAt(cells, gx, gy + 1) === C.SOLID) sides.push([0, 1]);
      if (cellAt(cells, gx - 1, gy) === C.SOLID) sides.push([-1, 0]);
      if (cellAt(cells, gx + 1, gy) === C.SOLID) sides.push([1, 0]);

      const ground = groundAt(terrain, cxw, czw);
      const roof = ceilingAt(terrain, cxw, czw);
      const headroom = roof - ground;

      // Doorways stay clear of everything but the arch overhead.
      const inDoor = cell === C.DOOR;
      const tries = inDoor ? 1 : rng.chance(0.22 * density) ? 2 : 1;

      for (let t = 0; t < tries; t++) {
        if (!rng.chance(0.3 * density)) continue;
        const entry = pickKind();
        const made = placeProp(rng, entry, {
          props,
          cxw,
          czw,
          ground,
          roof,
          headroom,
          sides,
          inDoor,
        });
        if (!made) continue;
      }
    }
  }
  return props;
}

/** Place one decoration. Returns false when the spot cannot host that kind. */
function placeProp(rng, entry, ctx) {
  const { props, cxw, czw, ground, roof, headroom, sides, inDoor } = ctx;
  const wall = sides.length ? rng.pick(sides) : null;
  const color = entry.color || null;
  const glow = !!entry.glow;

  // Offset toward a wall: `f` of the way from the cell centre to the face.
  const toward = (f) => ({
    x: cxw + (wall ? wall[0] * (CELL / 2) * f : 0),
    z: czw + (wall ? wall[1] * (CELL / 2) * f : 0),
  });
  // Jitter across the wall, never into it.
  const spread = (amt) => ({
    x: wall ? Math.abs(wall[1]) * rng.range(-amt, amt) : rng.range(-amt, amt),
    z: wall ? Math.abs(wall[0]) * rng.range(-amt, amt) : rng.range(-amt, amt),
  });

  switch (entry.kind) {
    case 'mound': {
      // A swell of ground. Wide and low: it changes the silhouette of a room
      // without ever being something you notice walking through.
      const j = spread(1.1);
      props.push({
        kind: 'mound',
        x: cxw + j.x,
        z: czw + j.z,
        y: ground - 0.25,
        r: rng.range(1.1, 2.1),
        h: rng.range(0.4, 0.72),
        sides: rng.int(6, 8),
        yaw: rng.angle(),
      });
      return true;
    }

    case 'rock':
    case 'rockPile': {
      const n = entry.kind === 'rockPile' ? rng.int(2, 3) : 1;
      const p = wall ? toward(0.62) : { x: cxw, z: czw };
      for (let i = 0; i < n; i++) {
        const j = spread(0.7);
        props.push({
          kind: 'rock',
          x: p.x + j.x + rng.range(-0.35, 0.35),
          z: p.z + j.z + rng.range(-0.35, 0.35),
          y: ground - 0.08,
          r: wall ? rng.range(0.4, 0.85) : rng.range(0.3, 0.55),
          h: wall ? rng.range(0.4, 0.95) : rng.range(0.16, 0.32),
          sides: rng.int(5, 7),
          yaw: rng.angle(),
        });
      }
      return true;
    }

    case 'stalagmite': {
      const p = wall ? toward(0.6) : { x: cxw, z: czw };
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const j = spread(0.75);
        props.push({
          kind: 'spike',
          x: p.x + j.x + rng.range(-0.4, 0.4),
          z: p.z + j.z + rng.range(-0.4, 0.4),
          y: ground - 0.05,
          r: wall ? rng.range(0.2, 0.42) : rng.range(0.14, 0.26),
          h: wall ? rng.range(0.6, 1.7) : rng.range(0.22, 0.42),
          sides: rng.int(4, 6),
          yaw: rng.angle(),
          up: true,
        });
      }
      return true;
    }

    case 'stalactite': {
      // Must hang clear of a walking head: 2.05 of clearance, always.
      if (headroom < 2.7) return false;
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const len = Math.min(rng.range(0.4, 1.6), headroom - 2.05);
        if (len < 0.25) continue;
        props.push({
          kind: 'spike',
          x: cxw + rng.range(-1.4, 1.4),
          z: czw + rng.range(-1.4, 1.4),
          y: roof,
          r: rng.range(0.14, 0.4),
          h: len,
          sides: rng.int(4, 6),
          yaw: rng.angle(),
          up: false,
        });
      }
      return true;
    }

    case 'roots': {
      if (headroom < 2.6) return false;
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const len = Math.min(rng.range(0.3, 1.1), headroom - 2.0);
        if (len < 0.2) continue;
        props.push({
          kind: 'strand',
          x: cxw + rng.range(-1.6, 1.6),
          z: czw + rng.range(-1.6, 1.6),
          y: roof,
          r: rng.range(0.04, 0.1),
          h: len,
          yaw: rng.angle(),
        });
      }
      return true;
    }

    case 'mushroom': {
      const p = wall ? toward(0.5) : { x: cxw, z: czw };
      const n = rng.int(1, 3);
      const hue = color || [0.8, 0.8, 0.7];
      for (let i = 0; i < n; i++) {
        const stem = rng.range(0.14, 0.5);
        props.push({
          kind: 'mushroom',
          x: p.x + rng.range(-0.9, 0.9),
          z: p.z + rng.range(-0.9, 0.9),
          y: ground,
          r: rng.range(0.16, 0.42),
          h: stem,
          stemR: rng.range(0.05, 0.11),
          sides: rng.int(5, 7),
          yaw: rng.angle(),
          glow,
          // Only the first of a clump is a light source. Twenty mushrooms in a
          // corner should look like twenty mushrooms and cost one light.
          lit: glow && i === 0 && rng.chance(0.35),
          color: hue,
        });
      }
      return true;
    }

    case 'crystal': {
      const p = wall ? toward(0.58) : { x: cxw, z: czw };
      const n = rng.int(1, 3);
      const hue = color || [0.6, 0.9, 1.0];
      for (let i = 0; i < n; i++) {
        props.push({
          kind: 'crystal',
          x: p.x + rng.range(-0.7, 0.7),
          z: p.z + rng.range(-0.7, 0.7),
          y: ground - 0.1,
          r: rng.range(0.1, 0.26),
          h: wall ? rng.range(0.45, 1.3) : rng.range(0.25, 0.5),
          sides: rng.int(4, 6),
          yaw: rng.angle(),
          lean: rng.range(-0.3, 0.3),
          glow,
          lit: glow && i === 0 && rng.chance(0.4),
          color: hue,
        });
      }
      return true;
    }

    case 'cairn': {
      if (!wall) return false;
      const p = toward(0.6);
      const j = spread(0.6);
      props.push({
        kind: 'cairn',
        x: p.x + j.x,
        z: p.z + j.z,
        y: ground,
        r: rng.range(0.32, 0.5),
        h: rng.range(0.45, 0.9),
        layers: rng.int(3, 5),
        yaw: rng.angle(),
      });
      return true;
    }

    case 'bones': {
      const j = spread(1.0);
      props.push({
        kind: 'bones',
        x: cxw + j.x,
        z: czw + j.z,
        y: ground,
        r: rng.range(0.3, 0.7),
        n: rng.int(3, 6),
        yaw: rng.angle(),
      });
      return true;
    }

    case 'column': {
      // A pilaster: half-column bonded into the wall, floor to ceiling. Reads
      // as built rather than grown, and cannot be walked into because it never
      // leaves the strip of floor the player's radius already keeps them out of.
      if (!wall || inDoor) return false;
      const p = toward(0.86);
      const j = spread(0.9);
      props.push({
        kind: 'column',
        x: p.x + j.x,
        z: p.z + j.z,
        y: ground - 0.1,
        r: rng.range(0.34, 0.5),
        h: headroom + 0.2,
        sides: 6,
        yaw: wall[1] !== 0 ? 0 : Math.PI / 2,
        broken: rng.chance(0.35),
      });
      return true;
    }

    case 'beam': {
      if (headroom < 2.6) return false;
      // Timber prop: a lintel under the ceiling with a post at each end.
      const along = rng.chance(0.5);
      props.push({
        kind: 'beam',
        x: cxw,
        z: czw,
        y: roof - rng.range(0.2, 0.45),
        len: CELL * rng.range(0.9, 1.05),
        r: rng.range(0.11, 0.19),
        yaw: along ? 0 : Math.PI / 2,
        posts: sides.length > 0,
        ground,
      });
      return true;
    }

    case 'brazier': {
      // A wall sconce, not a floor bowl: nothing at chest height in the middle
      // of a room that the player would otherwise walk straight through.
      if (!wall) return false;
      const p = toward(0.88);
      props.push({
        kind: 'sconce',
        x: p.x,
        z: p.z,
        y: ground + rng.range(1.9, 2.4),
        r: rng.range(0.18, 0.3),
        yaw: Math.atan2(-wall[0], -wall[1]),
        color: color || [1.0, 0.62, 0.25],
        glow: true,
        lit: true,
      });
      return true;
    }

    case 'shelf': {
      if (!wall) return false;
      const out = rng.range(0.35, 0.7);
      const lo = ground + 2.05;
      const hi = Math.max(lo + 0.2, roof - 0.5);
      props.push({
        kind: 'shelf',
        x: cxw + wall[0] * (CELL / 2 - out * 0.5),
        z: czw + wall[1] * (CELL / 2 - out * 0.5),
        y: rng.range(lo, hi),
        w: rng.range(1.1, 2.6),
        d: out,
        h: rng.range(0.22, 0.5),
        yaw: wall[1] !== 0 ? 0 : Math.PI / 2,
        tilt: rng.range(-0.16, 0.16),
      });
      return true;
    }

    default:
      return false;
  }
}
