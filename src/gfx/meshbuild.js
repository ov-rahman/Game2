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
import { TILE, tileUV } from './textures.js';

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
    this.quad(H, G, F, E, [0, 1, 0], uv, color, q); // top
    this.quad(A, B, Cc, D, [0, -1, 0], uv, color, dark); // bottom
    this.quad(E, F, B, A, [0, 0, -1], uv, color, dim); // -Z
    this.quad(G, H, D, Cc, [0, 0, 1], uv, color, dim); // +Z
    this.quad(F, G, Cc, B, [1, 0, 0], uv, color, dim); // +X
    this.quad(H, E, A, D, [-1, 0, 0], uv, color, dim); // -X
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
      this.quad(D, Cc, B, A, [nx, 0.15, nz], uv, color, [ao, ao, ao * 0.7, ao * 0.7]);
    }
    if (rTop > 0.001) {
      // Cap the top with a fan of quads (degenerate at the centre is fine).
      for (let i = 0; i < sides; i++) {
        const a0 = yaw + (i / sides) * Math.PI * 2;
        const a1 = yaw + ((i + 1) / sides) * Math.PI * 2;
        this.quad(
          [x, y1, z],
          [x + Math.cos(a0) * rTop, y1, z + Math.sin(a0) * rTop],
          [x + Math.cos(a1) * rTop, y1, z + Math.sin(a1) * rTop],
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
        this.quad(A, B, Cc, D, [mx, my, mz], uv, color, [
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
 * The way down: a shaft cut into the floor with descending steps, framed by a
 * glowing lip. Collision still treats the cell as flat ground — the player
 * stands on the top step and presses E.
 */
function buildStairwell(base, glow, x0, z0, uvStairs, uvPanel, uvCrystal, tint, trim) {
  const STEPS = 5;
  const depth = 1.7;
  const dark = [0.14, 0.14, 0.16];

  // Shaft walls and bottom, so the hole does not show the void behind it.
  const x1 = x0 + CELL;
  const z1 = z0 + CELL;
  base.quad(
    [x0, -depth, z0], [x1, -depth, z0], [x1, -depth, z1], [x0, -depth, z1],
    [0, 1, 0], uvPanel, dark, [0.4, 0.4, 0.4, 0.4],
  );
  const sides = [
    [[x0, 0, z0], [x1, 0, z0], [x1, -depth, z0], [x0, -depth, z0], [0, 0, 1]],
    [[x1, 0, z1], [x0, 0, z1], [x0, -depth, z1], [x1, -depth, z1], [0, 0, -1]],
    [[x1, 0, z0], [x1, 0, z1], [x1, -depth, z1], [x1, -depth, z0], [-1, 0, 0]],
    [[x0, 0, z1], [x0, 0, z0], [x0, -depth, z0], [x0, -depth, z1], [1, 0, 0]],
  ];
  for (const [a, b, c, d, nrm] of sides) {
    base.quad(a, b, c, d, nrm, uvPanel, dark, [0.75, 0.75, 0.25, 0.25]);
  }

  // Steps marching down along +X, lit normally so the torch picks them out
  // when the player leans over the edge.
  const stepW = CELL / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const cx = x0 + stepW * (i + 0.5);
    const top = -(depth * (i + 1)) / (STEPS + 1);
    const fade = 1 - i * 0.12;
    base.box(
      cx, top - 0.12, z0 + CELL / 2, stepW, 0.24, CELL * 0.86,
      uvStairs, [tint[0] * fade, tint[1] * fade, tint[2] * fade], 1,
    );
  }

  // Glowing lip around the opening — the landmark you steer toward.
  const lip = 0.3;
  const frames = [
    [x0, z0, CELL, lip],
    [x0, z1 - lip, CELL, lip],
    [x0, z0 + lip, lip, CELL - lip * 2],
    [x1 - lip, z0 + lip, lip, CELL - lip * 2],
  ];
  for (const [fx, fz, fw, fd] of frames) {
    glow.quad(
      [fx, 0.03, fz], [fx + fw, 0.03, fz], [fx + fw, 0.03, fz + fd], [fx, 0.03, fz + fd],
      [0, 1, 0], uvCrystal, trim, [1, 1, 1, 1],
    );
  }
}

/**
 * @returns {{ solid: Float32Array, glow: Float32Array }}
 */
export function buildLevelMesh(dungeon, floorDef) {
  const cells = dungeon.cells;
  const base = new MeshBuilder(20000);
  const glow = new MeshBuilder(2000);
  const pal = floorDef.mesh;

  const uvFloor = tileUV(TILE.FLOOR);
  const uvFloorAlt = tileUV(TILE.FLOOR_ALT);
  const uvWall = tileUV(TILE.WALL);
  const uvWallAlt = tileUV(TILE.WALL_ALT);
  const uvCeil = tileUV(TILE.CEILING);
  const uvRubble = tileUV(TILE.RUBBLE);
  const uvHazard = tileUV(TILE.HAZARD);
  const uvTrim = tileUV(TILE.TRIM);
  const uvStairs = tileUV(TILE.STAIRS);
  const uvPanel = tileUV(TILE.PANEL);
  const uvCrystal = tileUV(TILE.CRYSTAL);

  const white = [1, 1, 1];

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const cell = cellOf(cells, gx, gy);
      if (cell === C.SOLID) continue;

      const x0 = gx * CELL;
      const z0 = gy * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const hash = (gx * 73856093) ^ (gy * 19349663);
      const alt = (hash & 3) === 0;

      if (cell === C.RUBBLE) {
        // Breakable block: a solid box, slightly shrunk so it reads as loose.
        base.box(x0 + CELL / 2, WALL_H * 0.45, z0 + CELL / 2, CELL * 0.94, WALL_H * 0.9, CELL * 0.94, uvRubble, [
          pal.rubble[0],
          pal.rubble[1],
          pal.rubble[2],
        ]);
        continue;
      }

      // ---- floor -------------------------------------------------------
      const isHazard = cell === C.HAZARD;
      const isPit = cell === C.PIT;
      const isStairs = cell === C.STAIRS;

      if (isStairs) {
        // A real stairwell, not a flat tile: the way down has to be findable
        // from across a dark room, so it is cut into the floor and glows.
        buildStairwell(base, glow, x0, z0, uvStairs, uvPanel, uvCrystal, pal.stairs, pal.trim);
      } else if (!isPit) {
        const target = isHazard ? glow : base;
        const uv = isHazard ? uvHazard : alt ? uvFloorAlt : uvFloor;
        const tint = isHazard ? pal.hazard : pal.floor;
        const y = isHazard ? -0.06 : 0;

        // AO from the four surrounding wall corners.
        const n = solid(cells, gx, gy - 1);
        const s = solid(cells, gx, gy + 1);
        const w = solid(cells, gx - 1, gy);
        const e = solid(cells, gx + 1, gy);
        const nw = solid(cells, gx - 1, gy - 1);
        const ne = solid(cells, gx + 1, gy - 1);
        const sw = solid(cells, gx - 1, gy + 1);
        const se = solid(cells, gx + 1, gy + 1);
        const ao = [
          cornerAO(n, w, nw),
          cornerAO(n, e, ne),
          cornerAO(s, e, se),
          cornerAO(s, w, sw),
        ];
        target.quad(
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
          [0, 1, 0],
          uv,
          tint,
          ao,
        );
      } else {
        // Pit: a dark shaft with a lip, so the hole reads at a glance.
        const depth = -5;
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
          [[x0, 0, z0], [x1, 0, z0], [x1, depth, z0], [x0, depth, z0], [0, 0, 1]],
          [[x1, 0, z1], [x0, 0, z1], [x0, depth, z1], [x1, depth, z1], [0, 0, -1]],
          [[x1, 0, z0], [x1, 0, z1], [x1, depth, z1], [x1, depth, z0], [-1, 0, 0]],
          [[x0, 0, z1], [x0, 0, z0], [x0, depth, z0], [x0, depth, z1], [1, 0, 0]],
        ];
        for (const [a, b, c, d, nrm] of sides) {
          base.quad(a, b, c, d, nrm, uvWall, [0.3, 0.3, 0.33], [0.8, 0.8, 0.2, 0.2]);
        }
      }

      // ---- ceiling -----------------------------------------------------
      base.quad(
        [x0, WALL_H, z1],
        [x1, WALL_H, z1],
        [x1, WALL_H, z0],
        [x0, WALL_H, z0],
        [0, -1, 0],
        uvCeil,
        pal.ceiling,
        [0.7, 0.7, 0.7, 0.7],
      );

      // ---- walls -------------------------------------------------------
      const isDoor = cell === C.DOOR;
      const wallUv = isDoor ? uvTrim : alt ? uvWallAlt : uvWall;
      const wallTint = isDoor ? pal.trim : pal.wall;

      // -Z face
      if (solid(cells, gx, gy - 1)) {
        const lw = solid(cells, gx - 1, gy - 1) || solid(cells, gx - 1, gy);
        const rw = solid(cells, gx + 1, gy - 1) || solid(cells, gx + 1, gy);
        base.quad(
          [x0, WALL_H, z0],
          [x1, WALL_H, z0],
          [x1, 0, z0],
          [x0, 0, z0],
          [0, 0, 1],
          wallUv,
          wallTint,
          [lw ? 0.7 : 1, rw ? 0.7 : 1, rw ? 0.55 : 0.78, lw ? 0.55 : 0.78],
        );
      }
      // +Z face
      if (solid(cells, gx, gy + 1)) {
        const lw = solid(cells, gx + 1, gy + 1) || solid(cells, gx + 1, gy);
        const rw = solid(cells, gx - 1, gy + 1) || solid(cells, gx - 1, gy);
        base.quad(
          [x1, WALL_H, z1],
          [x0, WALL_H, z1],
          [x0, 0, z1],
          [x1, 0, z1],
          [0, 0, -1],
          wallUv,
          wallTint,
          [lw ? 0.7 : 1, rw ? 0.7 : 1, rw ? 0.55 : 0.78, lw ? 0.55 : 0.78],
        );
      }
      // +X face
      if (solid(cells, gx + 1, gy)) {
        const lw = solid(cells, gx + 1, gy - 1);
        const rw = solid(cells, gx + 1, gy + 1);
        base.quad(
          [x1, WALL_H, z0],
          [x1, WALL_H, z1],
          [x1, 0, z1],
          [x1, 0, z0],
          [-1, 0, 0],
          wallUv,
          wallTint,
          [lw ? 0.7 : 1, rw ? 0.7 : 1, rw ? 0.55 : 0.78, lw ? 0.55 : 0.78],
        );
      }
      // -X face
      if (solid(cells, gx - 1, gy)) {
        const lw = solid(cells, gx - 1, gy + 1);
        const rw = solid(cells, gx - 1, gy - 1);
        base.quad(
          [x0, WALL_H, z1],
          [x0, WALL_H, z0],
          [x0, 0, z0],
          [x0, 0, z1],
          [1, 0, 0],
          wallUv,
          wallTint,
          [lw ? 0.7 : 1, rw ? 0.7 : 1, rw ? 0.55 : 0.78, lw ? 0.55 : 0.78],
        );
      }
    }
  }

  // Glowing crystal clusters wedged into walls: cheap landmarks in the dark.
  for (const light of dungeon.lights) {
    if (light.room < 0) continue;
    glow.prism(
      light.x,
      WALL_H - 0.55,
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
