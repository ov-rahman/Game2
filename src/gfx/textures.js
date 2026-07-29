/**
 * Procedural textures.
 *
 * Every surface in the game is painted here with Canvas 2D at load time and
 * uploaded to the GPU. No image files exist in the project. One 256x256 atlas
 * per floor (4x4 tiles of 64px) plus one shared sprite sheet for billboards.
 */

import { SPRITE, SPRITE_SIZE, SPRITE_COLS, spriteUV } from '../data/sprite-ids.js';

// Sprite ids live in the data layer so the simulation can name effects without
// importing anything from the renderer; re-exported here for the renderer's
// convenience.
export { SPRITE, SPRITE_SIZE, SPRITE_COLS, spriteUV };

export const ATLAS_TILE = 64;
export const ATLAS_COLS = 8;
export const ATLAS_SIZE = ATLAS_TILE * ATLAS_COLS;

/**
 * Tile slots inside the atlas.
 *
 * Half of these exist for one reason: so that two rooms on the same floor can
 * be built out of visibly different masonry. A dungeon where every wall is the
 * same brick is a dungeon with one room in it, repeated.
 */
export const TILE = {
  // floors
  FLOOR: 0,
  FLOOR_ALT: 1,
  FLOOR_COBBLE: 2,
  FLOOR_TILED: 3,
  FLOOR_PLANK: 4,
  // walls: six distinct masonries
  WALL: 5, // running brick
  WALL_ALT: 6, // big ashlar blocks
  WALL_ROUGH: 7, // undressed stone
  WALL_TILED: 8, // small square tile
  WALL_CRACKED: 9, // ruined brick
  WALL_RIB: 10, // ribbed / pilastered
  // ceilings
  CEILING: 11,
  CEIL_VAULT: 12,
  // fixtures
  RUBBLE: 13,
  HAZARD: 14,
  TRIM: 15,
  STAIRS: 16,
  PANEL: 17,
  GRATE: 18,
  CRYSTAL: 19,
  FLESH: 20,
  METAL: 21,
  BONE: 22,
  GLOW: 23,
  // dressing
  MOSS: 24,
  WOOD: 25,
  MUSHROOM: 26,
  ROCK: 27,
  MORTAR: 28,
};

/** UV rect for a tile slot, inset half a texel to stop neighbour bleed. */
export function tileUV(slot) {
  const col = slot % ATLAS_COLS;
  const row = (slot / ATLAS_COLS) | 0;
  const s = 1 / ATLAS_COLS;
  const inset = 0.5 / ATLAS_SIZE;
  return {
    u0: col * s + inset,
    v0: row * s + inset,
    u1: (col + 1) * s - inset,
    v1: (row + 1) * s - inset,
  };
}

// ---------------------------------------------------------------- helpers

function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hex(c) {
  const h = c.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function shade(color, amount) {
  const [r, g, b] = hex(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(
    A[2] + (B[2] - A[2]) * t,
  )})`;
}

/** Speckled noise wash — the base texture under almost every surface. */
function grain(ctx, x, y, w, h, color, density, seed, alpha = 0.25, size = 1) {
  const r = rnd(seed);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const n = Math.floor(w * h * density);
  for (let i = 0; i < n; i++) {
    ctx.fillRect(x + ((r() * w) | 0), y + ((r() * h) | 0), size, size);
  }
  ctx.globalAlpha = 1;
}

function cracks(ctx, x, y, w, h, color, count, seed, width = 1) {
  const r = rnd(seed);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i++) {
    let cx = x + r() * w;
    let cy = y + r() * h;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const steps = 3 + ((r() * 4) | 0);
    for (let s = 0; s < steps; s++) {
      cx += (r() - 0.5) * w * 0.4;
      cy += (r() - 0.5) * h * 0.4;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- painters

function paintFloorTile(ctx, T, pal, seed, alt) {
  const base = alt ? shade(pal.floor, -0.04) : pal.floor;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, T, T);

  // Slab layout with mortar lines.
  const r = rnd(seed);
  ctx.strokeStyle = shade(pal.floor, -0.13);
  ctx.lineWidth = 2;
  const div = alt ? 2 : 4;
  for (let i = 1; i < div; i++) {
    const p = (i / div) * T;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(T, p);
    ctx.moveTo(p, 0);
    ctx.lineTo(p, T);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(pal.floor, 0.06);
  ctx.lineWidth = 1;
  for (let i = 1; i < div; i++) {
    const p = (i / div) * T + 1;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(T, p);
    ctx.stroke();
  }

  grain(ctx, 0, 0, T, T, shade(pal.floor, -0.16), 0.06, seed + 3, 0.5);
  grain(ctx, 0, 0, T, T, shade(pal.floor, 0.1), 0.03, seed + 7, 0.4);
  cracks(ctx, 0, 0, T, T, shade(pal.floor, -0.2), 2, seed + 11, 1);
  // A faint accent stain ties the floor to the level's colour story.
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(r() * T, r() * T, T * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintWallTile(ctx, T, pal, seed, alt) {
  ctx.fillStyle = alt ? shade(pal.wall, -0.05) : pal.wall;
  ctx.fillRect(0, 0, T, T);

  // Brick courses, offset every other row.
  const rows = 5;
  const rh = T / rows;
  ctx.strokeStyle = shade(pal.wall, -0.18);
  ctx.lineWidth = 2;
  for (let i = 1; i < rows; i++) {
    const y = i * rh;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(T, y);
    ctx.stroke();
  }
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    const off = i % 2 === 0 ? 0 : T / 4;
    for (let j = 0; j < 2; j++) {
      const x = off + j * (T / 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rh);
      ctx.stroke();
    }
  }
  // Top-lit bevel on each course.
  ctx.strokeStyle = shade(pal.wall, 0.09);
  ctx.lineWidth = 1;
  for (let i = 1; i < rows; i++) {
    const y = i * rh + 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(T, y);
    ctx.stroke();
  }

  grain(ctx, 0, 0, T, T, shade(pal.wall, -0.2), 0.07, seed + 21, 0.45);
  grain(ctx, 0, 0, T, T, shade(pal.wall, 0.12), 0.025, seed + 29, 0.35);
  if (alt) cracks(ctx, 0, 0, T, T, shade(pal.wall, -0.26), 3, seed + 31, 1.4);
}

/**
 * Generic masonry painter. Every wall variant is this function with different
 * course geometry, so they share a lighting model and read as one dungeon
 * built by different hands rather than as five unrelated textures.
 */
function masonry(ctx, T, base, seed, opts) {
  const r = rnd(seed);
  const rows = opts.rows;
  const cols = opts.cols;
  const rh = T / rows;
  const cw = T / cols;
  const mortar = shade(base, opts.mortar == null ? -0.24 : opts.mortar);

  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, T, T);

  const gap = opts.gap == null ? 2 : opts.gap;
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    const off = opts.stagger ? (i % 2 === 0 ? 0 : cw / 2) : 0;
    for (let j = -1; j <= cols; j++) {
      const x = off + j * cw;
      // Each stone gets its own value so a wall never looks stamped.
      const v = (r() - 0.5) * (opts.variance == null ? 0.12 : opts.variance);
      ctx.fillStyle = shade(base, v);
      ctx.fillRect(x + gap / 2, y + gap / 2, cw - gap, rh - gap);
      // Top bevel catches the torch; bottom edge falls into shadow.
      ctx.fillStyle = shade(base, v + 0.08);
      ctx.fillRect(x + gap / 2, y + gap / 2, cw - gap, 1);
      ctx.fillStyle = shade(base, v - 0.13);
      ctx.fillRect(x + gap / 2, y + rh - gap / 2 - 1, cw - gap, 1);
    }
  }
  grain(ctx, 0, 0, T, T, shade(base, -0.22), 0.07, seed + 21, 0.45);
  grain(ctx, 0, 0, T, T, shade(base, 0.12), 0.025, seed + 29, 0.3);
  if (opts.cracked) cracks(ctx, 0, 0, T, T, shade(base, -0.3), 5, seed + 31, 1.5);
  if (opts.chips) {
    // Missing corners: the difference between "old" and "just dark".
    for (let i = 0; i < opts.chips; i++) {
      const x = r() * T;
      const y = r() * T;
      const w = 3 + r() * 9;
      ctx.fillStyle = shade(base, -0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + w * 0.4);
      ctx.lineTo(x + w * 0.5, y + w);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (opts.moss) {
    const g = rnd(seed + 77);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = pal_moss_color(base, opts.moss);
    for (let i = 0; i < 40; i++) {
      const x = g() * T;
      const y = T - g() * g() * T; // gathers along the bottom, like damp
      ctx.fillRect(x, y, 2 + g() * 4, 2 + g() * 3);
    }
    ctx.globalAlpha = 1;
  }
}

function pal_moss_color(base, tone) {
  return mix(base, tone, 0.75);
}

function paintWallRough(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = shade(pal.wall, -0.2);
  ctx.fillRect(0, 0, T, T);
  // Undressed stone: irregular polygons packed edge to edge.
  for (let i = 0; i < 26; i++) {
    const x = r() * T;
    const y = r() * T;
    const s = 8 + r() * 16;
    ctx.fillStyle = shade(pal.wall, (r() - 0.45) * 0.24);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y + s * (0.2 + r() * 0.3));
    ctx.lineTo(x + s * (0.5 + r() * 0.4), y + s);
    ctx.lineTo(x - s * 0.25, y + s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(pal.wall, -0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.09, seed + 13, 0.32);
}

function paintWallRib(ctx, T, pal, seed) {
  masonry(ctx, T, pal.wall, seed, { rows: 6, cols: 3, stagger: false, variance: 0.08 });
  // Vertical pilasters: the one wall that gives a room a sense of direction.
  ctx.fillStyle = shade(pal.wall, 0.05);
  ctx.fillRect(T * 0.1, 0, T * 0.12, T);
  ctx.fillRect(T * 0.78, 0, T * 0.12, T);
  ctx.fillStyle = shade(pal.wall, 0.14);
  ctx.fillRect(T * 0.1, 0, 2, T);
  ctx.fillRect(T * 0.78, 0, 2, T);
  ctx.fillStyle = shade(pal.wall, -0.2);
  ctx.fillRect(T * 0.1 + T * 0.12 - 2, 0, 2, T);
  ctx.fillRect(T * 0.78 + T * 0.12 - 2, 0, 2, T);
  grain(ctx, 0, 0, T, T, '#000000', 0.06, seed + 17, 0.3);
}

function paintCobbleTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = shade(pal.floor, -0.2);
  ctx.fillRect(0, 0, T, T);
  const step = T / 7;
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 7; gx++) {
      const x = gx * step + (gy % 2 ? step * 0.5 : 0);
      const y = gy * step;
      ctx.fillStyle = shade(pal.floor, (r() - 0.4) * 0.22);
      ctx.beginPath();
      ctx.ellipse(x + step / 2, y + step / 2, step * 0.42, step * 0.36, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.1, seed + 61, 0.3);
}

function paintTiledFloor(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = shade(pal.floor, -0.22);
  ctx.fillRect(0, 0, T, T);
  // Diagonal chequer: instantly reads as "someone built this room".
  const n = 4;
  const s2 = T / n;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const light = (gx + gy) % 2 === 0;
      ctx.fillStyle = shade(light ? pal.floor : mix(pal.floor, pal.accent, 0.18), (r() - 0.5) * 0.07);
      ctx.fillRect(gx * s2 + 1, gy * s2 + 1, s2 - 2, s2 - 2);
    }
  }
  cracks(ctx, 0, 0, T, T, shade(pal.floor, -0.3), 3, seed + 5, 1);
  grain(ctx, 0, 0, T, T, '#000000', 0.07, seed + 71, 0.26);
}

function paintPlankTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const wood = mix(pal.wall, '#6b4a28', 0.55);
  ctx.fillStyle = shade(wood, -0.16);
  ctx.fillRect(0, 0, T, T);
  const planks = 5;
  const ph = T / planks;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = shade(wood, (r() - 0.5) * 0.14);
    ctx.fillRect(0, i * ph + 1, T, ph - 2);
    ctx.strokeStyle = shade(wood, -0.1);
    ctx.lineWidth = 1;
    for (let g = 0; g < 3; g++) {
      const y = i * ph + 2 + r() * (ph - 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(T * 0.3, y + (r() - 0.5) * 3, T * 0.7, y + (r() - 0.5) * 3, T, y);
      ctx.stroke();
    }
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.06, seed + 83, 0.28);
}

function paintVaultTile(ctx, T, pal, seed) {
  ctx.fillStyle = shade(pal.wall, -0.2);
  ctx.fillRect(0, 0, T, T);
  // Ribs meeting at the centre: a vaulted ceiling in one 64px tile.
  ctx.strokeStyle = shade(pal.wall, -0.04);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(T, T);
  ctx.moveTo(T, 0);
  ctx.lineTo(0, T);
  ctx.stroke();
  ctx.strokeStyle = shade(pal.wall, -0.32);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(T / 2, T / 2, T * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  grain(ctx, 0, 0, T, T, '#000000', 0.09, seed + 91, 0.34);
}

function paintMossTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const moss = mix(pal.accent, '#1e3a16', 0.45);
  ctx.fillStyle = moss;
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = shade(moss, (r() - 0.45) * 0.3);
    ctx.fillRect(r() * T, r() * T, 2 + r() * 4, 2 + r() * 4);
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.08, seed + 101, 0.3);
}

function paintWoodTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const wood = mix(pal.wall, '#59401f', 0.7);
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, T, T);
  ctx.strokeStyle = shade(wood, -0.18);
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x = (i / 7) * T + r() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 6, T * 0.4, x + (r() - 0.5) * 6, T * 0.7, x, T);
    ctx.stroke();
  }
  ctx.fillStyle = shade(wood, 0.1);
  ctx.fillRect(0, 0, T, 2);
  grain(ctx, 0, 0, T, T, '#000000', 0.07, seed + 111, 0.3);
}

function paintMushroomTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const cap = mix(pal.accent, '#ffffff', 0.22);
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, T, T);
  // Spots. They do all the work of saying "fungus" at eight pixels across.
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = shade(cap, r() > 0.5 ? 0.22 : -0.26);
    const s2 = 4 + r() * 9;
    ctx.beginPath();
    ctx.arc(r() * T, r() * T, s2 / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.05, seed + 121, 0.22);
}

function paintRockTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const rock = mix(pal.wall, '#8a8a86', 0.35);
  ctx.fillStyle = rock;
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = shade(rock, (r() - 0.5) * 0.26);
    const x = r() * T;
    const y = r() * T;
    const s2 = 6 + r() * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s2, y + s2 * 0.35);
    ctx.lineTo(x + s2 * 0.45, y + s2);
    ctx.closePath();
    ctx.fill();
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.11, seed + 131, 0.34);
}

function paintMortarTile(ctx, T, pal, seed) {
  // Used as a floor patch as well as a niche backing, so it has to read as
  // packed dirt rather than as a hole burnt in the floor.
  ctx.fillStyle = shade(pal.wall, -0.16);
  ctx.fillRect(0, 0, T, T);
  grain(ctx, 0, 0, T, T, shade(pal.wall, 0.1), 0.12, seed + 141, 0.35);
  grain(ctx, 0, 0, T, T, '#000000', 0.1, seed + 143, 0.3);
}

function paintCeilingTile(ctx, T, pal, seed) {
  ctx.fillStyle = shade(pal.wall, -0.14);
  ctx.fillRect(0, 0, T, T);
  // Beams running one way; they give the ceiling a direction to read against.
  ctx.fillStyle = shade(pal.wall, -0.24);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(0, 6 + i * 20, T, 7);
  }
  ctx.fillStyle = shade(pal.wall, -0.06);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(0, 6 + i * 20, T, 2);
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.08, seed + 41, 0.3);
}

function paintRubbleTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = shade(pal.wall, -0.1);
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 14; i++) {
    const x = r() * T;
    const y = r() * T;
    const s = 5 + r() * 13;
    ctx.fillStyle = mix(pal.wall, i % 2 ? '#ffffff' : '#000000', 0.12 + r() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y + s * 0.3);
    ctx.lineTo(x + s * 0.6, y + s);
    ctx.lineTo(x - s * 0.2, y + s * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.1, seed + 53, 0.35);
}

function paintHazardTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  const g = ctx.createLinearGradient(0, 0, T, T);
  g.addColorStop(0, pal.hazardHi);
  g.addColorStop(0.5, pal.hazard);
  g.addColorStop(1, shade(pal.hazard, -0.2));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T, T);
  // Cooled crust islands floating on the hot surface.
  ctx.fillStyle = shade(pal.hazard, -0.4);
  for (let i = 0; i < 7; i++) {
    const x = r() * T;
    const y = r() * T;
    const s = 5 + r() * 12;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.65, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = pal.hazardHi;
  ctx.lineWidth = 1.5;
  cracks(ctx, 0, 0, T, T, pal.hazardHi, 5, seed + 61, 1.5);
  grain(ctx, 0, 0, T, T, '#ffffff', 0.02, seed + 67, 0.5);
}

function paintTrimTile(ctx, T, pal, seed) {
  ctx.fillStyle = shade(pal.wall, -0.22);
  ctx.fillRect(0, 0, T, T);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, T * 0.42, T, 4);
  ctx.fillStyle = shade(pal.wall, 0.1);
  ctx.fillRect(0, 0, T, 5);
  ctx.fillRect(0, T - 5, T, 5);
  // Rivets.
  ctx.fillStyle = shade(pal.wall, 0.18);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(8 + i * 16, 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8 + i * 16, T - 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.06, seed + 71, 0.3);
}

function paintStairsTile(ctx, T, pal, seed) {
  ctx.fillStyle = shade(pal.floor, -0.3);
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    ctx.fillStyle = mix(pal.floor, '#000000', 0.15 + t * 0.6);
    ctx.fillRect(0, i * (T / 5), T, T / 5 - 2);
    ctx.fillStyle = mix(pal.accent, '#000000', t * 0.5);
    ctx.fillRect(0, i * (T / 5), T, 2);
  }
  grain(ctx, 0, 0, T, T, '#000000', 0.05, seed + 83, 0.3);
}

function paintPanelTile(ctx, T, pal, seed) {
  ctx.fillStyle = shade(pal.wall, 0.02);
  ctx.fillRect(0, 0, T, T);
  ctx.strokeStyle = shade(pal.wall, -0.25);
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, T - 12, T - 12);
  ctx.strokeStyle = shade(pal.wall, 0.14);
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, T - 16, T - 16);
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(T * 0.35, T * 0.35, T * 0.3, T * 0.3);
  ctx.globalAlpha = 1;
  grain(ctx, 0, 0, T, T, '#000000', 0.05, seed + 89, 0.3);
}

function paintGrateTile(ctx, T, pal, seed) {
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, T, T);
  ctx.fillStyle = shade(pal.wall, -0.05);
  for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 11 + 2, T, 6);
  for (let i = 0; i < 6; i++) ctx.fillRect(i * 11 + 2, 0, 6, T);
  ctx.fillStyle = shade(pal.wall, 0.16);
  for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 11 + 2, T, 1);
  grain(ctx, 0, 0, T, T, '#000000', 0.08, seed + 97, 0.4);
}

function paintCrystalTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = shade(pal.accent, -0.35);
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 9; i++) {
    const x = r() * T;
    const y = r() * T;
    const s = 6 + r() * 16;
    ctx.fillStyle = mix(pal.accent, '#ffffff', r() * 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.5, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.5, y);
    ctx.closePath();
    ctx.fill();
  }
  grain(ctx, 0, 0, T, T, '#ffffff', 0.03, seed + 101, 0.5);
}

function paintFleshTile(ctx, T, pal, seed) {
  const r = rnd(seed);
  ctx.fillStyle = pal.flesh || '#7a3b4a';
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < 22; i++) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.ellipse(r() * T, r() * T, 3 + r() * 9, 2 + r() * 5, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  cracks(ctx, 0, 0, T, T, 'rgba(0,0,0,0.5)', 4, seed + 103, 1.2);
}

function paintMetalTile(ctx, T, pal, seed) {
  ctx.fillStyle = '#4a4f58';
  ctx.fillRect(0, 0, T, T);
  const r = rnd(seed);
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
    ctx.fillRect(0, r() * T, T, 1 + r() * 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, T * 0.5 - 2, T, 4);
  ctx.globalAlpha = 1;
}

function paintBoneTile(ctx, T, pal, seed) {
  ctx.fillStyle = '#cfc6ad';
  ctx.fillRect(0, 0, T, T);
  grain(ctx, 0, 0, T, T, '#8a7f66', 0.12, seed + 107, 0.5);
  cracks(ctx, 0, 0, T, T, 'rgba(70,60,45,0.6)', 5, seed + 109, 1);
}

function paintGlowTile(ctx, T, pal) {
  const g = ctx.createRadialGradient(T / 2, T / 2, 1, T / 2, T / 2, T / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, pal.accent);
  g.addColorStop(1, shade(pal.accent, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T, T);
}

const PAINTERS = {
  [TILE.FLOOR]: (c, T, p, s) => paintFloorTile(c, T, p, s, false),
  [TILE.FLOOR_ALT]: (c, T, p, s) => paintFloorTile(c, T, p, s + 1, true),
  [TILE.FLOOR_COBBLE]: paintCobbleTile,
  [TILE.FLOOR_TILED]: paintTiledFloor,
  [TILE.FLOOR_PLANK]: paintPlankTile,

  // Six masonries. A room picks one; that choice is most of what makes two
  // rooms on the same floor feel like different places.
  [TILE.WALL]: (c, T, p, s) => masonry(c, T, p.wall, s, { rows: 5, cols: 2, stagger: true, gap: 2 }),
  [TILE.WALL_ALT]: (c, T, p, s) =>
    masonry(c, T, shade(p.wall, -0.04), s + 2, { rows: 3, cols: 2, stagger: false, gap: 3, variance: 0.16 }),
  [TILE.WALL_ROUGH]: paintWallRough,
  [TILE.WALL_TILED]: (c, T, p, s) =>
    masonry(c, T, mix(p.wall, p.accent, 0.16), s + 4, { rows: 8, cols: 8, stagger: false, gap: 1.5, variance: 0.1 }),
  [TILE.WALL_CRACKED]: (c, T, p, s) =>
    masonry(c, T, shade(p.wall, -0.02), s + 6, {
      rows: 5,
      cols: 2,
      stagger: true,
      gap: 2.5,
      variance: 0.2,
      cracked: true,
      chips: 7,
      moss: p.accent,
    }),
  [TILE.WALL_RIB]: paintWallRib,

  [TILE.CEILING]: paintCeilingTile,
  [TILE.CEIL_VAULT]: paintVaultTile,
  [TILE.MOSS]: paintMossTile,
  [TILE.WOOD]: paintWoodTile,
  [TILE.MUSHROOM]: paintMushroomTile,
  [TILE.ROCK]: paintRockTile,
  [TILE.MORTAR]: paintMortarTile,
  [TILE.RUBBLE]: paintRubbleTile,
  [TILE.HAZARD]: paintHazardTile,
  [TILE.TRIM]: paintTrimTile,
  [TILE.STAIRS]: paintStairsTile,
  [TILE.PANEL]: paintPanelTile,
  [TILE.GRATE]: paintGrateTile,
  [TILE.CRYSTAL]: paintCrystalTile,
  [TILE.FLESH]: paintFleshTile,
  [TILE.METAL]: paintMetalTile,
  [TILE.BONE]: paintBoneTile,
  [TILE.GLOW]: paintGlowTile,
};

/** Build the full atlas canvas for one floor palette. */
export function buildAtlas(display, floorDef) {
  const surface = display.createSurface(ATLAS_SIZE, ATLAS_SIZE);
  const ctx = surface.ctx;
  const pal = floorDef.tex;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  for (let slot = 0; slot < ATLAS_COLS * ATLAS_COLS; slot++) {
    const col = slot % ATLAS_COLS;
    const row = (slot / ATLAS_COLS) | 0;
    const painter = PAINTERS[slot];
    ctx.save();
    ctx.translate(col * ATLAS_TILE, row * ATLAS_TILE);
    ctx.beginPath();
    ctx.rect(0, 0, ATLAS_TILE, ATLAS_TILE);
    ctx.clip();
    if (painter) painter(ctx, ATLAS_TILE, pal, floorDef.index * 97 + slot * 13);
    else {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(0, 0, ATLAS_TILE, ATLAS_TILE);
    }
    ctx.restore();
  }
  return surface.canvas;
}

// ------------------------------------------------------------ sprite sheet


export function buildSpriteSheet(display) {
  const size = SPRITE_SIZE * SPRITE_COLS;
  const surface = display.createSurface(size, size);
  const ctx = surface.ctx;
  ctx.clearRect(0, 0, size, size);
  const S = SPRITE_SIZE;

  const cell = (slot, fn) => {
    const col = slot % SPRITE_COLS;
    const row = (slot / SPRITE_COLS) | 0;
    ctx.save();
    ctx.translate(col * S + S / 2, row * S + S / 2);
    fn(ctx, S);
    ctx.restore();
  };

  const radial = (ctx2, r, stops) => {
    const g = ctx2.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [p, c] of stops) g.addColorStop(p, c);
    ctx2.fillStyle = g;
    ctx2.beginPath();
    ctx2.arc(0, 0, r, 0, Math.PI * 2);
    ctx2.fill();
  };

  cell(SPRITE.DOT, (c, S2) =>
    radial(c, S2 * 0.46, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.75)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );

  cell(SPRITE.SPARK, (c, S2) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
      c.lineTo(Math.cos(a) * S2 * 0.42, Math.sin(a) * S2 * 0.42);
      c.stroke();
    }
    radial(c, S2 * 0.2, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  });

  cell(SPRITE.RING, (c, S2) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, S2 * 0.36, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 0.4;
    c.lineWidth = 6;
    c.stroke();
    c.globalAlpha = 1;
  });

  cell(SPRITE.FLAME, (c, S2) => {
    c.beginPath();
    c.moveTo(0, -S2 * 0.46);
    c.quadraticCurveTo(S2 * 0.32, -S2 * 0.05, 0, S2 * 0.42);
    c.quadraticCurveTo(-S2 * 0.32, -S2 * 0.05, 0, -S2 * 0.46);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.fill();
    radial(c, S2 * 0.26, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  });

  cell(SPRITE.STAR, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? S2 * 0.46 : S2 * 0.17;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
  });

  cell(SPRITE.SMOKE, (c, S2) =>
    radial(c, S2 * 0.48, [
      [0, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0.22)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );

  cell(SPRITE.BOLT, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(-S2 * 0.1, -S2 * 0.46);
    c.lineTo(S2 * 0.16, -S2 * 0.06);
    c.lineTo(S2 * 0.02, -S2 * 0.02);
    c.lineTo(S2 * 0.14, S2 * 0.46);
    c.lineTo(-S2 * 0.18, S2 * 0.04);
    c.lineTo(-S2 * 0.02, 0);
    c.closePath();
    c.fill();
  });

  cell(SPRITE.SHARD, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -S2 * 0.46);
    c.lineTo(S2 * 0.22, S2 * 0.1);
    c.lineTo(0, S2 * 0.44);
    c.lineTo(-S2 * 0.22, S2 * 0.1);
    c.closePath();
    c.fill();
  });

  cell(SPRITE.MUZZLE, (c, S2) => {
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * S2 * 0.48, Math.sin(a) * S2 * 0.48);
      c.lineTo(Math.cos(a + 0.4) * S2 * 0.22, Math.sin(a + 0.4) * S2 * 0.22);
      c.closePath();
      c.fill();
    }
    radial(c, S2 * 0.3, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  });

  cell(SPRITE.BLOOD, (c, S2) => {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      c.beginPath();
      c.ellipse(Math.cos(a) * S2 * 0.2, Math.sin(a) * S2 * 0.2, S2 * 0.13, S2 * 0.09, a, 0, Math.PI * 2);
      c.fill();
    }
  });

  cell(SPRITE.EYE, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(0, 0, S2 * 0.44, S2 * 0.26, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#000000';
    c.beginPath();
    c.arc(0, 0, S2 * 0.13, 0, Math.PI * 2);
    c.fill();
  });

  cell(SPRITE.RUNE, (c, S2) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * S2 * 0.38;
      const y = Math.sin(a) * S2 * 0.38;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-S2 * 0.16, -S2 * 0.14);
    c.lineTo(S2 * 0.12, S2 * 0.16);
    c.moveTo(S2 * 0.14, -S2 * 0.16);
    c.lineTo(-S2 * 0.12, S2 * 0.14);
    c.stroke();
  });

  cell(SPRITE.SQUARE, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.fillRect(-S2 * 0.3, -S2 * 0.3, S2 * 0.6, S2 * 0.6);
  });

  cell(SPRITE.CROSS, (c, S2) => {
    c.fillStyle = '#ffffff';
    c.fillRect(-S2 * 0.42, -S2 * 0.09, S2 * 0.84, S2 * 0.18);
    c.fillRect(-S2 * 0.09, -S2 * 0.42, S2 * 0.18, S2 * 0.84);
  });

  cell(SPRITE.HALO, (c, S2) => {
    const g = c.createRadialGradient(0, 0, S2 * 0.1, 0, 0, S2 * 0.48);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, S2 * 0.48, 0, Math.PI * 2);
    c.fill();
  });

  cell(SPRITE.DUST, (c, S2) => {
    c.fillStyle = 'rgba(255,255,255,0.7)';
    const r = rnd(1234);
    for (let i = 0; i < 14; i++) {
      c.fillRect((r() - 0.5) * S2 * 0.8, (r() - 0.5) * S2 * 0.8, 2, 2);
    }
  });

  return surface.canvas;
}
