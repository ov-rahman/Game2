/**
 * Geometry construction.
 *
 * Two jobs: turn the dungeon grid into a static level mesh with baked ambient
 * occlusion, and turn creature descriptors into low-poly bodies. Everything is
 * built from a handful of primitives so a new monster is a data edit.
 *
 * Vertex layout (12 floats): position(3) normal(3) uv(2) colour(3) ao(1)
 */
import { CELL, WALL_H, GRID_W, GRID_H, C } from '../core/constants.js';
import { groundAt, ceilingAt, floorCorner, ceilCorner } from '../core/world/terrain.js';
import { TILE, tileUV } from './textures.js';
import { STYLES } from '../data/decor.js';

export const VERTEX_FLOATS = 12;
export const VERTEX_LAYOUT = [
  { name: 'aPos', size: 3 },
  { name: 'aNormal', size: 3 },
  { name: 'aUv', size: 2 },
  { name: 'aColor', size: 3 },
  { name: 'aAO', size: 1 },
];

/** Growable vertex buffer. */
export class MeshBuilder {
  constructor(capacity = 4096) {
    this.data = new Float32Array(capacity * VERTEX_FLOATS);
    this.count = 0;
  }

  ensure(extraVerts) {
    const need = (this.count + extraVerts) * VERTEX_FLOATS;
    if (need <= this.data.length) return;
    let cap = this.data.length;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.count * VERTEX_FLOATS));
    this.data = next;
  }

  vertex(px, py, pz, nx, ny, nz, u, v, r, g, b, ao) {
    const i = this.count * VERTEX_FLOATS;
    const d = this.data;
    d[i] = px;
    d[i + 1] = py;
    d[i + 2] = pz;
    d[i + 3] = nx;
    d[i + 4] = ny;
    d[i + 5] = nz;
    d[i + 6] = u;
    d[i + 7] = v;
    d[i + 8] = r;
    d[i + 9] = g;
    d[i + 10] = b;
    d[i + 11] = ao;
    this.count++;
  }

  /**
   * Quad from four corners in winding order, with per-corner AO.
   * Corners are [x,y,z] arrays.
   */
  quad(a, b, c, d, normal, uv, color, ao = [1, 1, 1, 1]) {
    this.ensure(6);
    const [nx, ny, nz] = normal;
    const [r, g, bl] = color;
    // Counter-clockwise as seen from the side the given normal points at — the
    // winding GL treats as front-facing. Corners are listed A,B,C,D around the
    // quad, so the triangles run A,D,C and C,B,A.
    // Split along the diagonal that keeps AO gradients smooth.
    const flip = ao[0] + ao[2] < ao[1] + ao[3];
    if (flip) {
      this.vertex(b[0], b[1], b[2], nx, ny, nz, uv.u1, uv.v0, r, g, bl, ao[1]);
      this.vertex(a[0], a[1], a[2], nx, ny, nz, uv.u0, uv.v0, r, g, bl, ao[0]);
      this.vertex(d[0], d[1], d[2], nx, ny, nz, uv.u0, uv.v1, r, g, bl, ao[3]);
      this.vertex(d[0], d[1], d[2], nx, ny, nz, uv.u0, uv.v1, r, g, bl, ao[3]);
      this.vertex(c[0], c[1], c[2], nx, ny, nz, uv.u1, uv.v1, r, g, bl, ao[2]);
      this.vertex(b[0], b[1], b[2], nx, ny, nz, uv.u1, uv.v0, r, g, bl, ao[1]);
    } else {
      this.vertex(a[0], a[1], a[2], nx, ny, nz, uv.u0, uv.v0, r, g, bl, ao[0]);
      this.vertex(d[0], d[1], d[2], nx, ny, nz, uv.u0, uv.v1, r, g, bl, ao[3]);
      this.vertex(c[0], c[1], c[2], nx, ny, nz, uv.u1, uv.v1, r, g, bl, ao[2]);
      this.vertex(c[0], c[1], c[2], nx, ny, nz, uv.u1, uv.v1, r, g, bl, ao[2]);
      this.vertex(b[0], b[1], b[2], nx, ny, nz, uv.u1, uv.v0, r, g, bl, ao[1]);
      this.vertex(a[0], a[1], a[2], nx, ny, nz, uv.u0, uv.v0, r, g, bl, ao[0]);
    }
  }

  /**
   * Quad whose normal is derived from its own corners.
   *
   * Terrain quads are not planar — their four corners sit at four different
   * heights — so a hardcoded normal would light them as if they were still
   * flat. One cross product per quad buys the whole relief its shading.
   *
   * The derived normal always agrees with quad()'s winding, so the face is
   * never accidentally culled: to show the other side, reverse the corners.
   */
  quadAuto(a, b, c, d, uv, color, ao) {
    const ux = c[0] - a[0];
    const uy = c[1] - a[1];
    const uz = c[2] - a[2];
    const vx = d[0] - b[0];
    const vy = d[1] - b[1];
    const vz = d[2] - b[2];
    const nx = vy * uz - vz * uy;
    const ny = vz * ux - vx * uz;
    const nz = vx * uy - vy * ux;
    const s = 1 / (Math.hypot(nx, ny, nz) || 1);
    this.quad(a, b, c, d, [nx * s, ny * s, nz * s], uv, color, ao);
  }

  /**
   * Faceted rock lump: two jittered rings and a cap. Deliberately irregular —
   * the jitter is what separates a boulder from a cylinder.
   */
  chunk(x, y, z, radius, height, sides, yaw, uv, color, seed = 0, ao = 1) {
    const jitter = (i, salt) => {
      let h = (Math.imul(i + 1, 374761393) ^ Math.imul(seed + salt, 668265263)) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return 0.68 + (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 0.62;
    };
    const y0 = y;
    const y1 = y + height * 0.55;
    const y2 = y + height;
    const ring = (r, salt, level) => {
      const out = [];
      for (let i = 0; i < sides; i++) {
        const a = yaw + (i / sides) * Math.PI * 2;
        const rr = r * jitter(i, salt);
        out.push([x + Math.cos(a) * rr, level + (jitter(i, salt + 7) - 1) * height * 0.14, z + Math.sin(a) * rr]);
      }
      return out;
    };
    const lower = ring(radius, 1, y0);
    const mid = ring(radius * 0.86, 2, y1);
    const top = ring(radius * 0.42, 3, y2);
    const apex = [x, y2 + height * 0.14, z];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.quadAuto(lower[i], lower[j], mid[j], mid[i], uv, color, [ao * 0.6, ao * 0.6, ao, ao]);
      this.quadAuto(mid[i], mid[j], top[j], top[i], uv, color, [ao * 0.86, ao * 0.86, ao, ao]);
      this.quadAuto(top[i], top[j], apex, apex, uv, color, [ao, ao, ao, ao]);
    }
  }

  /** Box rotated about Y and tilted about its long axis — wall shelves. */
  slab(x, y, z, sx, sy, sz, yaw, tilt, uv, color, ao = 1) {
    const cy = Math.cos(yaw);
    const sy2 = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const pt = (lx, ly, lz) => {
      const ty = ly * ct - lz * st;
      const tz = ly * st + lz * ct;
      return [x + lx * cy - tz * sy2, y + ty, z + lx * sy2 + tz * cy];
    };
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const A = pt(-hx, -hy, -hz);
    const B = pt(hx, -hy, -hz);
    const Cc = pt(hx, -hy, hz);
    const D = pt(-hx, -hy, hz);
    const E = pt(-hx, hy, -hz);
    const F = pt(hx, hy, -hz);
    const G = pt(hx, hy, hz);
    const H = pt(-hx, hy, hz);
    const q = [ao, ao, ao, ao];
    const dim = [ao * 0.7, ao * 0.7, ao * 0.7, ao * 0.7];
    const dark = [ao * 0.45, ao * 0.45, ao * 0.45, ao * 0.45];
    this.quadAuto(E, F, G, H, uv, color, q); // top
    this.quadAuto(D, Cc, B, A, uv, color, dark); // bottom
    this.quadAuto(A, B, F, E, uv, color, dim); // -Z
    this.quadAuto(Cc, D, H, G, uv, color, dim); // +Z
    this.quadAuto(B, Cc, G, F, uv, color, dim); // +X
    this.quadAuto(D, A, E, H, uv, color, dim); // -X
  }

  /** Axis-aligned box centred on (x,y,z). */
  box(x, y, z, sx, sy, sz, uv, color, ao = 1) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const A = [x - hx, y - hy, z - hz];
    const B = [x + hx, y - hy, z - hz];
    const Cc = [x + hx, y - hy, z + hz];
    const D = [x - hx, y - hy, z + hz];
    const E = [x - hx, y + hy, z - hz];
    const F = [x + hx, y + hy, z - hz];
    const G = [x + hx, y + hy, z + hz];
    const H = [x - hx, y + hy, z + hz];
    const q = [ao, ao, ao, ao];
    const dim = [ao * 0.72, ao * 0.72, ao * 0.72, ao * 0.72];
    const dark = [ao * 0.5, ao * 0.5, ao * 0.5, ao * 0.5];
    this.quad(E, F, G, H, [0, 1, 0], uv, color, q); // top
    this.quad(D, Cc, B, A, [0, -1, 0], uv, color, dark); // bottom
    this.quad(A, B, F, E, [0, 0, -1], uv, color, dim); // -Z
    this.quad(Cc, D, H, G, [0, 0, 1], uv, color, dim); // +Z
    this.quad(B, Cc, G, F, [1, 0, 0], uv, color, dim); // +X
    this.quad(D, A, E, H, [-1, 0, 0], uv, color, dim); // -X
  }

  /** Tapered vertical prism — bodies, horns, crystals. */
  prism(x, y, z, sides, rBottom, rTop, height, uv, color, yaw = 0, ao = 1) {
    const y0 = y;
    const y1 = y + height;
    for (let i = 0; i < sides; i++) {
      const a0 = yaw + (i / sides) * Math.PI * 2;
      const a1 = yaw + ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const A = [x + c0 * rBottom, y0, z + s0 * rBottom];
      const B = [x + c1 * rBottom, y0, z + s1 * rBottom];
      const Cc = [x + c1 * rTop, y1, z + s1 * rTop];
      const D = [x + c0 * rTop, y1, z + s0 * rTop];
      const nx = Math.cos((a0 + a1) / 2);
      const nz = Math.sin((a0 + a1) / 2);
      this.quad(A, B, Cc, D, [nx, 0.15, nz], uv, color, [ao * 0.7, ao * 0.7, ao, ao]);
    }
    if (rTop > 0.001) {
      // Cap the top with a fan of quads (degenerate at the centre is fine).
      for (let i = 0; i < sides; i++) {
        const a0 = yaw + (i / sides) * Math.PI * 2;
        const a1 = yaw + ((i + 1) / sides) * Math.PI * 2;
        this.quad(
          [x + Math.cos(a0) * rTop, y1, z + Math.sin(a0) * rTop],
          [x + Math.cos(a1) * rTop, y1, z + Math.sin(a1) * rTop],
          [x, y1, z],
          [x, y1, z],
          [0, 1, 0],
          uv,
          color,
          [ao, ao, ao, ao],
        );
      }
    }
  }

  /** Faceted blob approximating a sphere; cheap and reads well in fog. */
  blob(x, y, z, radius, segments, uv, color, squashY = 1, ao = 1) {
    const rings = segments;
    for (let r = 0; r < rings; r++) {
      const t0 = (r / rings) * Math.PI;
      const t1 = ((r + 1) / rings) * Math.PI;
      const y0 = y + Math.cos(t0) * radius * squashY;
      const y1 = y + Math.cos(t1) * radius * squashY;
      const r0 = Math.sin(t0) * radius;
      const r1 = Math.sin(t1) * radius;
      for (let s = 0; s < segments; s++) {
        const a0 = (s / segments) * Math.PI * 2;
        const a1 = ((s + 1) / segments) * Math.PI * 2;
        const A = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
        const B = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
        const Cc = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
        const D = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
        const mx = Math.cos((a0 + a1) / 2);
        const mz = Math.sin((a0 + a1) / 2);
        const my = Math.cos((t0 + t1) / 2);
        const shade = 0.55 + 0.45 * (1 - r / rings);
        this.quad(D, Cc, B, A, [mx, my, mz], uv, color, [
          ao * shade,
          ao * shade,
          ao * shade,
          ao * shade,
        ]);
      }
    }
  }

  finish() {
    return this.data.subarray(0, this.count * VERTEX_FLOATS);
  }
}

// ------------------------------------------------------------- level mesh

const cellIdx = (x, y) => y * GRID_W + x;

function cellOf(cells, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return C.SOLID;
  return cells[cellIdx(x, y)];
}

function solid(cells, x, y) {
  const c = cellOf(cells, x, y);
  return c === C.SOLID || c === C.RUBBLE;
}

/**
 * Corner ambient occlusion, the standard voxel formula: how much a corner is
 * enclosed by its two edge neighbours and the diagonal.
 */
function cornerAO(side1, side2, corner) {
  if (side1 && side2) return 0.42;
  return 1 - (side1 ? 0.22 : 0) - (side2 ? 0.22 : 0) - (corner ? 0.16 : 0);
}

/**
 * Mirror a tile's UV bounds on either axis.
 *
 * A tiled texture laid down in lockstep across a grid draws the grid for you:
 * every seam lines up and the eye reads a lattice, not rock. Flipping each cell
 * independently costs nothing and breaks the pattern into something irregular.
 */
function uvVariant(uv, hash) {
  const flipU = (hash & 4) !== 0;
  const flipV = (hash & 8) !== 0;
  return {
    u0: flipU ? uv.u1 : uv.u0,
    u1: flipU ? uv.u0 : uv.u1,
    v0: flipV ? uv.v1 : uv.v0,
    v1: flipV ? uv.v0 : uv.v1,
  };
}

/**
 * @returns {{ solid: Float32Array, glow: Float32Array }}
 */
export function buildLevelMesh(dungeon, floorDef) {
  const cells = dungeon.cells;
  const terrain = dungeon.terrain;
  const rooms = dungeon.rooms;
  const roomAt = dungeon.roomAt;
  const base = new MeshBuilder(64000);
  const glow = new MeshBuilder(8000);
  const pal = floorDef.mesh;

  // Fixed tiles — the ones that mean something rather than decorate something.
  const uvRubble = tileUV(TILE.RUBBLE);
  const uvHazard = tileUV(TILE.HAZARD);
  const uvTrim = tileUV(TILE.TRIM);
  const uvStairs = tileUV(TILE.STAIRS);
  const uvPanel = tileUV(TILE.PANEL);
  const uvCrystal = tileUV(TILE.CRYSTAL);
  const uvMoss = tileUV(TILE.MOSS);
  const uvWood = tileUV(TILE.WOOD);
  const uvShroom = tileUV(TILE.MUSHROOM);
  const uvRock = tileUV(TILE.ROCK);
  const uvBone = tileUV(TILE.BONE);
  const uvMortar = tileUV(TILE.MORTAR);
  const uvGlow = tileUV(TILE.GLOW);

  // ---- room styles ------------------------------------------------------
  // Resolved once per style name, not per cell: a floor has four of them and
  // three thousand cells.
  const styleCache = new Map();
  const resolveStyle = (name) => {
    let st = styleCache.get(name);
    if (st) return st;
    const def = STYLES[name] || STYLES.brick;
    const t = def.tint;
    const tinted = (c) => [c[0] * t[0], c[1] * t[1], c[2] * t[2]];
    st = {
      wall: tileUV(TILE[def.wall] == null ? TILE.WALL : TILE[def.wall]),
      floor: tileUV(TILE[def.floor] == null ? TILE.FLOOR : TILE[def.floor]),
      ceil: tileUV(TILE[def.ceiling] == null ? TILE.CEILING : TILE[def.ceiling]),
      wallTint: tinted(pal.wall),
      floorTint: tinted(pal.floor),
      ceilTint: tinted(pal.ceiling),
    };
    styleCache.set(name, st);
    return st;
  };
  const corridorStyle = resolveStyle(dungeon.corridorStyle || 'brick');
  const nicheGlow = floorDef.lightColors[0];

  const fh = (cx, cy) => floorCorner(terrain, cx, cy);
  const ch = (cx, cy) => ceilCorner(terrain, cx, cy);

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const ci = gy * GRID_W + gx;
      const cell = cellOf(cells, gx, gy);
      if (cell === C.SOLID) continue;

      const rid = roomAt[ci];
      const style = rid >= 0 && rooms[rid] ? resolveStyle(rooms[rid].style) : corridorStyle;

      const x0 = gx * CELL;
      const z0 = gy * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const hash = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;

      const f00 = fh(gx, gy);
      const f10 = fh(gx + 1, gy);
      const f11 = fh(gx + 1, gy + 1);
      const f01 = fh(gx, gy + 1);
      const c00 = ch(gx, gy);
      const c10 = ch(gx + 1, gy);
      const c11 = ch(gx + 1, gy + 1);
      const c01 = ch(gx, gy + 1);
      const fMin = Math.min(f00, f10, f11, f01);
      const fMid = (f00 + f10 + f11 + f01) * 0.25;
      const cMax = Math.max(c00, c10, c11, c01);

      const isHazard = cell === C.HAZARD;
      const isPit = cell === C.PIT;
      const isStairs = cell === C.STAIRS;
      const isPillar = cell === C.PILLAR;

      if (cell === C.RUBBLE) {
        base.box(
          x0 + CELL / 2,
          fMid + WALL_H * 0.45,
          z0 + CELL / 2,
          CELL * 0.94,
          WALL_H * 0.9,
          CELL * 0.94,
          uvRubble,
          pal.rubble,
        );
        continue;
      }

      // ---- floor -------------------------------------------------------
      if (!isPit) {
        const target = isHazard ? glow : base;
        const uv = isStairs
          ? uvStairs
          : isHazard
            ? uvHazard
            : uvVariant(style.floor, hash);
        const tint = isHazard ? pal.hazard : isStairs ? pal.stairs : style.floorTint;
        const drop = isHazard ? 0.06 : 0;

        const n = solid(cells, gx, gy - 1);
        const s = solid(cells, gx, gy + 1);
        const w = solid(cells, gx - 1, gy);
        const e = solid(cells, gx + 1, gy);
        const ao = [
          cornerAO(n, w, solid(cells, gx - 1, gy - 1)),
          cornerAO(n, e, solid(cells, gx + 1, gy - 1)),
          cornerAO(s, e, solid(cells, gx + 1, gy + 1)),
          cornerAO(s, w, solid(cells, gx - 1, gy + 1)),
        ];
        target.quadAuto(
          [x0, f00 - drop, z0],
          [x1, f10 - drop, z0],
          [x1, f11 - drop, z1],
          [x0, f01 - drop, z1],
          uv,
          tint,
          ao,
        );
      } else {
        const depth = fMin - 5;
        base.quad(
          [x0, depth, z0],
          [x1, depth, z0],
          [x1, depth, z1],
          [x0, depth, z1],
          [0, 1, 0],
          uvPanel,
          [0.12, 0.12, 0.14],
          [0.35, 0.35, 0.35, 0.35],
        );
        const sides = [
          [[x0, f00, z0], [x1, f10, z0], [x1, depth, z0], [x0, depth, z0], [0, 0, 1]],
          [[x1, f11, z1], [x0, f01, z1], [x0, depth, z1], [x1, depth, z1], [0, 0, -1]],
          [[x1, f10, z0], [x1, f11, z1], [x1, depth, z1], [x1, depth, z0], [-1, 0, 0]],
          [[x0, f01, z1], [x0, f00, z0], [x0, depth, z0], [x0, depth, z1], [1, 0, 0]],
        ];
        for (const [a, b, c, d, nrm] of sides) {
          base.quad(a, b, c, d, nrm, style.wall, [0.3, 0.3, 0.33], [0.8, 0.8, 0.2, 0.2]);
        }
      }

      // ---- ceiling -----------------------------------------------------
      base.quadAuto(
        [x0, c01, z1],
        [x1, c11, z1],
        [x1, c10, z0],
        [x0, c00, z0],
        uvVariant(style.ceil, hash >> 3),
        style.ceilTint,
        [0.7, 0.7, 0.7, 0.7],
      );

      // ---- rock column -------------------------------------------------
      if (isPillar) {
        buildColumn(base, x0 + CELL / 2, z0 + CELL / 2, fMin - 0.4, cMax + 0.4, hash, style.wall, style.wallTint);
        continue;
      }

      // ---- threshold ---------------------------------------------------
      // Every doorway gets jambs and a lintel. It is the clearest signal the
      // game has that a space was built rather than dug, and it makes the
      // moment of walking from one room's masonry into another's legible.
      if (cell === C.DOOR) {
        // `openZ` means you walk through along Z, so the rock is on the X sides:
        // the lintel spans X and the jambs stand at x0 and x1. Getting this
        // backwards builds the arch along the passage instead of across it.
        const openZ = !solid(cells, gx, gy - 1) && !solid(cells, gx, gy + 1);
        const cxm = x0 + CELL / 2;
        const czm = z0 + CELL / 2;
        const lintelY = Math.min(c00, c10, c11, c01) - 0.3;
        const jambW = 0.42;
        const doorH = lintelY - fMid - 0.3;
        if (doorH > 2.05) {
          // Lintel across the opening.
          base.slab(
            cxm, lintelY, czm,
            openZ ? CELL : 0.75,
            0.36,
            openZ ? 0.75 : CELL,
            0, 0, uvTrim, pal.trim, 0.92,
          );
          for (const s2 of [-1, 1]) {
            const jx = cxm + (openZ ? s2 * (CELL / 2 - jambW / 2) : 0);
            const jz = czm + (openZ ? 0 : s2 * (CELL / 2 - jambW / 2));
            base.slab(
              jx, fMid + doorH / 2, jz,
              openZ ? jambW : 0.75,
              doorH,
              openZ ? 0.75 : jambW,
              0, 0, uvTrim, pal.trim, 0.85,
            );
          }
        }
      }

      // ---- walls -------------------------------------------------------
      const isDoor = cell === C.DOOR;
      const wallUv = isDoor ? uvTrim : uvVariant(style.wall, hash);
      const wallTint = isDoor ? pal.trim : style.wallTint;
      // A hole in the wall: a recess with a lit-from-nowhere back panel. Only
      // in rooms, only where the wall is tall enough to hold one.
      const niche = !isDoor && rid >= 0 && (hash & 7) === 0;

      if (solid(cells, gx, gy - 1)) {
        const lw = solid(cells, gx - 1, gy - 1) || solid(cells, gx - 1, gy);
        const rw = solid(cells, gx + 1, gy - 1) || solid(cells, gx + 1, gy);
        wallFace(
          base, glow,
          [x0, c00, z0], [x1, c10, z0], [x1, f10, z0], [x0, f00, z0],
          [0, 0, -1], wallUv, wallTint, edgeAO(lw, rw), niche, uvMortar, uvCrystal, nicheGlow,
        );
      }
      if (solid(cells, gx, gy + 1)) {
        const lw = solid(cells, gx + 1, gy + 1) || solid(cells, gx + 1, gy);
        const rw = solid(cells, gx - 1, gy + 1) || solid(cells, gx - 1, gy);
        wallFace(
          base, glow,
          [x1, c11, z1], [x0, c01, z1], [x0, f01, z1], [x1, f11, z1],
          [0, 0, 1], wallUv, wallTint, edgeAO(lw, rw), niche, uvMortar, uvCrystal, nicheGlow,
        );
      }
      if (solid(cells, gx + 1, gy)) {
        const lw = solid(cells, gx + 1, gy - 1);
        const rw = solid(cells, gx + 1, gy + 1);
        wallFace(
          base, glow,
          [x1, c10, z0], [x1, c11, z1], [x1, f11, z1], [x1, f10, z0],
          [1, 0, 0], wallUv, wallTint, edgeAO(lw, rw), niche, uvMortar, uvCrystal, nicheGlow,
        );
      }
      if (solid(cells, gx - 1, gy)) {
        const lw = solid(cells, gx - 1, gy + 1);
        const rw = solid(cells, gx - 1, gy - 1);
        wallFace(
          base, glow,
          [x0, c01, z1], [x0, c00, z0], [x0, f00, z0], [x0, f01, z1],
          [-1, 0, 0], wallUv, wallTint, edgeAO(lw, rw), niche, uvMortar, uvCrystal, nicheGlow,
        );
      }
    }
  }

  // ---- scatter ---------------------------------------------------------
  const uvFor = {
    rock: uvRock,
    mound: uvRock,
    spike: uvRock,
    cairn: uvRock,
    bones: uvBone,
    beam: uvWood,
    strand: uvMoss,
    shelf: uvRock,
  };
  const uvs = {
    wall: tileUV(TILE.WALL_ALT),
    shroom: uvShroom,
    crystal: uvCrystal,
    glow: uvGlow,
    mortar: uvMortar,
    pal,
  };
  let seed = 0;
  for (const pr of terrain.props) {
    seed++;
    drawProp(base, glow, pr, seed, uvFor, uvs);
  }

  // Glowing crystal clusters wedged into the ceiling: cheap landmarks.
  for (const light of dungeon.lights) {
    if (light.room < 0) continue;
    glow.prism(
      light.x,
      ceilingAt(terrain, light.x, light.z) - 0.55,
      light.z,
      5,
      0.16,
      0.05,
      0.5,
      uvCrystal,
      [light.r, light.g, light.b],
      light.phase,
    );
  }

  return { solid: base.finish(), glow: glow.finish() };
}

function edgeAO(lw, rw) {
  return [lw ? 0.7 : 1, rw ? 0.7 : 1, rw ? 0.55 : 0.78, lw ? 0.55 : 0.78];
}

const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * One wall face, optionally with a hole punched through it.
 *
 * Corners run top-left, top-right, bottom-right, bottom-left as seen from the
 * room — the order every quad in this file uses to mean "this side is visible".
 * The recess is pushed along -normal, i.e. into rock the player can never reach,
 * so a niche costs eight extra quads and no gameplay risk at all.
 */
function wallFace(mb, glow, tl, tr, br, bl, nrm, uv, tint, ao, niche, backUv, glowUv, glowTint) {
  if (!niche) {
    mb.quadAuto(tl, tr, br, bl, uv, tint, ao);
    return;
  }
  const height = Math.min(tl[1], tr[1]) - Math.max(bl[1], br[1]);
  if (height < 2.2) {
    mb.quadAuto(tl, tr, br, bl, uv, tint, ao);
    return;
  }
  const u0 = 0.28;
  const u1 = 0.72;
  const v0 = 0.22; // top of the hole, measured down from the ceiling
  const v1 = 0.62;
  const depth = 0.5;

  const P = (u, v) => lerp3(lerp3(tl, tr, u), lerp3(bl, br, u), v);
  const Q = (u, v) => {
    const p = P(u, v);
    return [p[0] - nrm[0] * depth, p[1], p[2] - nrm[2] * depth];
  };

  const q = [ao[0], ao[1], ao[2], ao[3]];
  const dim = [0.5, 0.5, 0.42, 0.42];
  // Frame.
  mb.quadAuto(P(0, 0), P(1, 0), P(1, v0), P(0, v0), uv, tint, q);
  mb.quadAuto(P(0, v1), P(1, v1), P(1, 1), P(0, 1), uv, tint, q);
  mb.quadAuto(P(0, v0), P(u0, v0), P(u0, v1), P(0, v1), uv, tint, q);
  mb.quadAuto(P(u1, v0), P(1, v0), P(1, v1), P(u1, v1), uv, tint, q);
  // Back panel and the four reveals around it.
  mb.quadAuto(Q(u0, v0), Q(u1, v0), Q(u1, v1), Q(u0, v1), backUv, tint, dim);
  mb.quadAuto(P(u0, v0), P(u1, v0), Q(u1, v0), Q(u0, v0), backUv, tint, dim); // top, faces down
  mb.quadAuto(Q(u0, v1), Q(u1, v1), P(u1, v1), P(u0, v1), backUv, tint, dim); // sill, faces up
  mb.quadAuto(P(u0, v0), Q(u0, v0), Q(u0, v1), P(u0, v1), backUv, tint, dim); // left reveal
  mb.quadAuto(P(u1, v1), Q(u1, v1), Q(u1, v0), P(u1, v0), backUv, tint, dim); // right reveal

  // Some recesses were built to hold something. A shard on the sill turns a
  // hole in the wall into a place, and costs one prism.
  if (glow && glowUv && (Math.round(tl[0] + bl[2]) & 3) === 0) {
    const sill = P(0.5, v1);
    const back = [
      sill[0] - nrm[0] * depth * 0.55,
      sill[1],
      sill[2] - nrm[2] * depth * 0.55,
    ];
    glow.prism(back[0], back[1], back[2], 5, 0.12, 0.02, 0.42, glowUv, glowTint, 0.6, 1);
  }
}

/**
 * Draw one scatter prop.
 *
 * Every kind is assembled from the same four primitives — chunk, prism, slab,
 * blob — which is why a new kind of dungeon dressing is a dozen lines here plus
 * one row in data/decor.js.
 */
function drawProp(base, glow, pr, seed, uvFor, uvs) {
  const pal = uvs.pal;
  switch (pr.kind) {
    case 'mound':
      base.chunk(pr.x, pr.y, pr.z, pr.r, pr.h, pr.sides, pr.yaw, uvFor.mound, pal.floor, seed, 0.95);
      break;

    case 'rock':
      base.chunk(pr.x, pr.y, pr.z, pr.r, pr.h, pr.sides, pr.yaw, uvFor.rock, pal.rubble, seed, 0.9);
      break;

    case 'spike':
      // Cones both ways: a stalagmite is a stalactite that fell.
      if (pr.up) base.prism(pr.x, pr.y, pr.z, pr.sides, pr.r, 0.02, pr.h, uvFor.spike, pal.rubble, pr.yaw, 0.9);
      else base.prism(pr.x, pr.y - pr.h, pr.z, pr.sides, 0.02, pr.r, pr.h, uvFor.spike, pal.ceiling, pr.yaw, 0.75);
      break;

    case 'strand':
      base.prism(pr.x, pr.y - pr.h, pr.z, 3, 0.015, pr.r, pr.h, uvFor.strand, pal.hazard, pr.yaw, 0.8);
      break;

    case 'mushroom': {
      // The cap is a flared cone, not a sphere: a six-segment blob costs three
      // hundred vertices and, at the size a mushroom is drawn, looks the same.
      base.prism(pr.x, pr.y, pr.z, 5, pr.stemR, pr.stemR * 0.85, pr.h, uvs.shroom, [0.85, 0.82, 0.72], pr.yaw, 0.85);
      const target = pr.glow ? glow : base;
      target.prism(pr.x, pr.y + pr.h * 0.82, pr.z, 6, pr.r, pr.r * 0.16, pr.r * 0.75, uvs.shroom, pr.color, pr.yaw, 1);
      break;
    }

    case 'crystal': {
      const target = pr.glow ? glow : base;
      target.prism(pr.x, pr.y, pr.z, pr.sides, pr.r, 0.03, pr.h, uvs.crystal, pr.color, pr.yaw, 1);
      break;
    }

    case 'cairn': {
      // Stacked flats, each smaller and turned a little further than the last.
      let y = pr.y;
      for (let i = 0; i < pr.layers; i++) {
        const t = i / pr.layers;
        const w = pr.r * 2 * (1 - t * 0.45);
        const th = (pr.h / pr.layers) * 0.85;
        base.slab(pr.x, y + th / 2, pr.z, w, th, w * 0.8, pr.yaw + i * 0.7, 0, uvFor.cairn, pal.rubble, 0.9);
        y += th * 1.05;
      }
      break;
    }

    case 'bones': {
      for (let i = 0; i < pr.n; i++) {
        const a = pr.yaw + (i / pr.n) * Math.PI * 2;
        base.slab(
          pr.x + Math.cos(a) * pr.r * 0.7,
          pr.y + 0.05,
          pr.z + Math.sin(a) * pr.r * 0.7,
          0.42, 0.08, 0.1,
          a * 1.7, 0,
          uvFor.bones, [0.92, 0.9, 0.82], 0.95,
        );
      }
      break;
    }

    case 'column': {
      // Base, shaft, capital: three pieces is the fewest that reads as built.
      const bh = 0.22;
      const capH = 0.24;
      base.slab(pr.x, pr.y + bh / 2, pr.z, pr.r * 2.5, bh, pr.r * 2.5, pr.yaw, 0, uvs.wall, pal.trim, 0.85);
      const shaftH = pr.broken ? pr.h * 0.45 : pr.h - bh - capH;
      base.prism(pr.x, pr.y + bh, pr.z, pr.sides, pr.r, pr.r * 0.92, shaftH, uvs.wall, pal.wall, pr.yaw, 0.88);
      if (!pr.broken) {
        base.slab(pr.x, pr.y + bh + shaftH + capH / 2, pr.z, pr.r * 2.5, capH, pr.r * 2.5, pr.yaw, 0, uvs.wall, pal.trim, 0.9);
      } else {
        base.chunk(pr.x, pr.y + bh + shaftH, pr.z, pr.r, 0.3, 5, pr.yaw, uvFor.rock, pal.rubble, seed, 0.8);
      }
      break;
    }

    case 'beam': {
      base.slab(pr.x, pr.y, pr.z, pr.len, pr.r * 2, pr.r * 2, pr.yaw, 0, uvFor.beam, pal.trim, 0.8);
      if (pr.posts) {
        const dx = Math.cos(pr.yaw) * pr.len * 0.44;
        const dz = Math.sin(pr.yaw) * pr.len * 0.44;
        for (const s of [-1, 1]) {
          const px = pr.x + dx * s;
          const pz = pr.z + dz * s;
          const h = pr.y - pr.ground - pr.r;
          if (h > 0.4) base.prism(px, pr.ground, pz, 4, pr.r * 1.1, pr.r, h, uvFor.beam, pal.trim, pr.yaw, 0.78);
        }
      }
      break;
    }

    case 'sconce': {
      // Bracket into the wall, bowl on the end, flame in the bowl. The flame is
      // a tapered prism, not a sphere: a four-segment sphere at this size reads
      // as a staircase, a cone reads as fire.
      base.slab(pr.x, pr.y - 0.14, pr.z, pr.r * 1.3, 0.11, pr.r * 1.7, pr.yaw, 0.18, uvs.wall, pal.trim, 0.8);
      base.prism(pr.x, pr.y - 0.08, pr.z, 6, pr.r * 0.45, pr.r, 0.17, uvs.wall, pal.trim, pr.yaw, 0.85);
      glow.prism(pr.x, pr.y + 0.06, pr.z, 5, pr.r * 0.78, 0.02, pr.r * 2.1, uvs.glow, pr.color, pr.yaw + 0.4, 1);
      glow.prism(pr.x, pr.y + 0.04, pr.z, 5, pr.r * 0.4, 0.02, pr.r * 1.2, uvs.glow, [1, 1, 0.9], pr.yaw, 1);
      break;
    }

    case 'shelf':
      base.slab(pr.x, pr.y, pr.z, pr.w, pr.h, pr.d, pr.yaw, pr.tilt, uvFor.shelf, pal.rubble, 0.82);
      break;

    default:
      break;
  }
}

/**
 * The freestanding rock column that fills a PILLAR cell.
 *
 * Sized from the one hard constraint the grid imposes: collision treats the
 * whole 4x4 cell as solid, so the column must never leave a sight-line gap at
 * the cell boundary (radius across the flats >= 2.0) and must never poke far
 * enough out to swallow the camera, which can approach to 2.42 from the centre.
 * An octagon with the flats facing the axes satisfies both with room to spare.
 */
function buildColumn(mb, cx, cz, yBottom, yTop, hash, uv, color) {
  const SIDES = 8;
  const YAW = Math.PI / SIDES; // flats face the cardinal directions
  const rand = (i, band, salt) => {
    let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(band + 1, 40503) ^ Math.imul(salt + 1, 2246822519) ^ hash) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const span = Math.max(0.5, yTop - yBottom);
  const bands = 4;
  let prev = null;
  for (let b = 0; b <= bands; b++) {
    const t = b / bands;
    const y = yBottom + span * t;
    // 2.30 keeps the narrowest point of any face outside the cell boundary; 2.56
    // keeps the widest inside the 2.42 the camera can reach.
    const shape = 1 - 0.05 * Math.sin(t * Math.PI);
    const ring = [];
    for (let i = 0; i < SIDES; i++) {
      const a = YAW + (i / SIDES) * Math.PI * 2;
      const r = (2.3 + rand(i, b, 1) * 0.26) * shape;
      ring.push([cx + Math.cos(a) * r, y + (rand(i, b, 3) - 0.5) * span * 0.05, cz + Math.sin(a) * r]);
    }
    if (prev) {
      for (let i = 0; i < SIDES; i++) {
        const j = (i + 1) % SIDES;
        const shade = 0.55 + 0.4 * t;
        mb.quadAuto(prev[i], prev[j], ring[j], ring[i], uv, color, [
          shade * 0.85,
          shade * 0.85,
          shade,
          shade,
        ]);
      }
    }
    prev = ring;
  }
}


