/**
 * Procedural creature meshes.
 *
 * Each `form` assembles a body from the primitives in meshbuild.js. Two meshes
 * come out per creature: the lit body, and a small emissive mesh (eyes, cores,
 * cracks) drawn with the emissive uniform raised — in a level this dark, those
 * glowing points are what the player actually tracks.
 */
import { MeshBuilder } from './meshbuild.js';
import { TILE, tileUV } from './textures.js';
import { creatureArt } from '../data/creature-art.js';

const SKIN_TILE = {
  flesh: TILE.FLESH,
  metal: TILE.METAL,
  bone: TILE.BONE,
  crystal: TILE.CRYSTAL,
  rubble: TILE.RUBBLE,
};

/** @returns {{ solid: Float32Array, glow: Float32Array, height: number }} */
export function buildCreatureMesh(id) {
  const art = creatureArt(id);
  const body = new MeshBuilder(1200);
  const glow = new MeshBuilder(200);
  const uv = tileUV(SKIN_TILE[art.skin] || TILE.FLESH);
  const uvGlow = tileUV(TILE.GLOW);

  const ctx = { art, body, glow, uv, uvGlow };
  const form = FORMS[art.form] || FORMS.blob;
  form(ctx);

  return { solid: body.finish(), glow: glow.finish(), height: art.height };
}

/** Glowing eyes on the front face (+Z is forward in model space). */
function eyes(ctx, y, spread, size, forward) {
  const { art, glow, uvGlow } = ctx;
  const n = art.eyes || 0;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const x = t * spread;
    const yy = n === 3 && i === 1 ? y + size * 1.6 : y;
    glow.box(x, yy, forward, size, size, size * 0.6, uvGlow, art.glow);
  }
}

const FORMS = {
  /** Squat gelatinous body with an optional cap. */
  blob(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const r = art.radius;
    body.blob(0, r * 0.85, 0, r, 6, uv, art.body, 0.85);
    body.blob(0, r * 1.35, 0, r * 0.62, 5, uv, art.light, 0.8);
    if (art.cap) {
      body.prism(0, r * 1.5, 0, 7, r * 0.95, r * 0.2, r * 0.85, uv, art.dark);
    }
    // Dripping underside knobs give the silhouette something to read against.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      body.blob(Math.cos(a) * r * 0.7, r * 0.25, Math.sin(a) * r * 0.7, r * 0.26, 4, uv, art.dark, 0.9);
    }
    eyes(ctx, r * 1.3, r * 0.8, 0.1, r * 0.72);
    glow.blob(0, r * 0.8, 0, r * 0.35, 4, uvGlow, art.glow, 1);
  },

  /** Four-legged runner. */
  quadruped(ctx) {
    const { art, body, uv } = ctx;
    const h = art.height;
    const r = art.radius;
    const legH = h * 0.42;
    body.box(0, legH + h * 0.22, 0, r * 1.5, h * 0.4, r * 2.4, uv, art.body);
    body.box(0, legH + h * 0.34, r * 1.25, r * 1.05, h * 0.32, r * 0.9, uv, art.light);
    // Snout.
    body.box(0, legH + h * 0.3, r * 1.85, r * 0.55, h * 0.16, r * 0.7, uv, art.dark);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        body.box(sx * r * 0.62, legH * 0.5, sz * r * 0.85, r * 0.34, legH, r * 0.34, uv, art.dark);
      }
    }
    // Tail.
    body.box(0, legH + h * 0.26, -r * 1.6, r * 0.3, h * 0.12, r * 0.9, uv, art.dark);
    const spikes = art.spikes || 0;
    for (let i = 0; i < spikes; i++) {
      const t = i / Math.max(1, spikes - 1);
      body.prism(
        (i % 2 === 0 ? 1 : -1) * r * 0.3,
        legH + h * 0.42,
        (t - 0.5) * r * 2.2,
        4,
        r * 0.16,
        0,
        h * 0.26,
        uv,
        art.light,
      );
    }
    eyes(ctx, legH + h * 0.42, r * 0.55, 0.09, r * 1.72);
  },

  /** Floating sphere with a bright core. */
  orb(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const y = art.height * 0.62;
    body.blob(0, y, 0, art.radius, 6, uv, art.body, 1);
    glow.blob(0, y, 0, art.radius * 0.55, 5, uvGlow, art.glow, 1);
    // Orbiting shards mark it as airborne even when barely lit.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      body.prism(
        Math.cos(a) * art.radius * 1.5,
        y - 0.1,
        Math.sin(a) * art.radius * 1.5,
        4,
        art.radius * 0.16,
        0,
        art.radius * 0.5,
        uv,
        art.light,
      );
    }
    eyes(ctx, y, art.radius * 0.7, 0.08, art.radius * 0.85);
  },

  /** Many-legged low crawler. */
  spider(ctx) {
    const { art, body, uv } = ctx;
    const r = art.radius;
    const bodyY = art.height * 0.45;
    body.blob(0, bodyY, -r * 0.2, r * 0.75, 5, uv, art.body, 0.7);
    body.blob(0, bodyY, r * 0.7, r * 0.45, 5, uv, art.light, 0.85);
    const legs = art.legs || 6;
    for (let i = 0; i < legs; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const t = Math.floor(i / 2) / Math.max(1, legs / 2 - 1) - 0.5;
      const kneeX = side * r * 1.25;
      body.box(side * r * 0.62, bodyY, t * r * 1.2, r * 1.3, r * 0.16, r * 0.16, uv, art.dark);
      body.box(kneeX, bodyY * 0.5, t * r * 1.3, r * 0.16, bodyY, r * 0.16, uv, art.dark);
    }
    eyes(ctx, bodyY + r * 0.15, r * 0.5, 0.07, r * 1.05);
  },

  /** Rooted stalk with a bulb head. */
  plant(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const h = art.height;
    body.prism(0, 0, 0, 6, art.radius * 0.9, art.radius * 0.28, h * 0.72, uv, art.dark);
    body.blob(0, h * 0.82, 0, art.radius * 0.7, 6, uv, art.body, 1.1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body.prism(
        Math.cos(a) * art.radius * 0.55,
        h * 0.82,
        Math.sin(a) * art.radius * 0.55,
        4,
        art.radius * 0.2,
        0,
        h * 0.3,
        uv,
        art.light,
        a,
      );
    }
    glow.blob(0, h * 0.82, 0, art.radius * 0.34, 4, uvGlow, art.glow, 1);
    eyes(ctx, h * 0.82, art.radius * 0.4, 0.09, art.radius * 0.62);
  },

  /** Upright humanoid; `gaunt` stretches it into something wrong. */
  biped(ctx) {
    const { art, body, uv } = ctx;
    const h = art.height;
    const r = art.radius;
    const thin = art.gaunt ? 0.6 : 1;
    const legH = h * 0.45;
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.34, legH * 0.5, 0, r * 0.32 * thin, legH, r * 0.32 * thin, uv, art.dark);
    }
    body.box(0, legH + h * 0.19, 0, r * 1.15 * thin, h * 0.38, r * 0.7 * thin, uv, art.body);
    if (art.armored) {
      body.box(0, legH + h * 0.26, r * 0.32, r * 1.25 * thin, h * 0.2, r * 0.2, uv, art.light);
      body.box(0, legH + h * 0.34, 0, r * 1.75 * thin, h * 0.08, r * 0.75 * thin, uv, art.light);
    }
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.78, legH + h * 0.17, 0, r * 0.24 * thin, h * 0.36, r * 0.24 * thin, uv, art.dark);
    }
    const headY = legH + h * 0.44;
    body.box(0, headY, 0, r * 0.62 * thin, h * 0.14, r * 0.62 * thin, uv, art.light);
    eyes(ctx, headY, r * 0.34, 0.08, r * 0.36);
  },

  /** Segmented worm, half-emerged from the floor. */
  worm(ctx) {
    const { art, body, uv } = ctx;
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const rr = art.radius * (1 - t * 0.45);
      body.blob(0, art.height * (0.25 + t * 0.6), -t * art.radius * 0.6, rr, 5, uv, i % 2 ? art.body : art.dark, 0.9);
    }
    eyes(ctx, art.height * 0.85, art.radius * 0.5, 0.09, art.radius * 0.55);
  },

  /** Heavy slab-limbed construct with a glowing core. */
  golem(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const h = art.height;
    const r = art.radius;
    const legH = h * 0.34;
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.42, legH * 0.5, 0, r * 0.5, legH, r * 0.55, uv, art.dark);
    }
    body.box(0, legH + h * 0.24, 0, r * 1.6, h * 0.46, r * 1.0, uv, art.body);
    body.box(0, legH + h * 0.46, 0, r * 1.15, h * 0.1, r * 0.85, uv, art.light);
    for (const sx of [-1, 1]) {
      body.box(sx * r * 1.05, legH + h * 0.22, 0, r * 0.45, h * 0.48, r * 0.5, uv, art.dark);
      body.box(sx * r * 1.05, legH - h * 0.02, 0, r * 0.6, h * 0.16, r * 0.6, uv, art.light);
    }
    const headY = legH + h * 0.56;
    body.box(0, headY, 0, r * 0.8, h * 0.12, r * 0.7, uv, art.light);
    glow.box(0, legH + h * 0.26, r * 0.52, r * 0.5, h * 0.12, 0.08, uvGlow, art.glow);
    eyes(ctx, headY, r * 0.36, 0.1, r * 0.4);
  },

  /** Rooted gun emplacement. */
  turret(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const h = art.height;
    const r = art.radius;
    body.prism(0, 0, 0, 6, r, r * 0.75, h * 0.5, uv, art.dark);
    body.blob(0, h * 0.62, 0, r * 0.65, 5, uv, art.body, 0.85);
    body.box(0, h * 0.62, r * 0.75, r * 0.28, r * 0.28, r * 0.9, uv, art.light);
    glow.box(0, h * 0.62, r * 1.2, r * 0.2, r * 0.2, 0.1, uvGlow, art.glow);
    eyes(ctx, h * 0.62, r * 0.4, 0.09, r * 0.66);
  },

  /** Winged hoverer. */
  flyer(ctx) {
    const { art, body, uv } = ctx;
    const y = art.height * 0.75;
    const r = art.radius;
    body.blob(0, y, 0, r * 0.72, 5, uv, art.body, 1);
    const w = art.wings || 1;
    for (const sx of [-1, 1]) {
      body.box(sx * r * (0.7 + w * 0.5), y + r * 0.2, 0, r * w * 1.5, 0.06, r * 1.0, uv, art.light);
      body.box(sx * r * (0.5 + w * 0.2), y + r * 0.35, 0, r * w * 0.7, 0.05, r * 0.55, uv, art.dark);
    }
    // Ears / horns.
    for (const sx of [-1, 1]) {
      body.prism(sx * r * 0.3, y + r * 0.5, 0, 4, r * 0.14, 0, r * 0.7, uv, art.dark);
    }
    eyes(ctx, y + r * 0.1, r * 0.42, 0.08, r * 0.7);
  },

  /** Treasure chest with teeth. */
  mimic(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const r = art.radius;
    const h = art.height;
    body.box(0, h * 0.3, 0, r * 1.7, h * 0.55, r * 1.2, uv, art.body);
    body.box(0, h * 0.66, -r * 0.25, r * 1.7, h * 0.25, r * 0.9, uv, art.dark);
    body.box(0, h * 0.3, r * 0.62, r * 0.35, h * 0.2, r * 0.1, uv, art.light);
    // Teeth along the lid.
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      glow.prism(t * r * 1.5, h * 0.56, r * 0.55, 3, r * 0.1, 0, h * 0.14, uvGlow, art.glow);
    }
    eyes(ctx, h * 0.72, r * 0.7, 0.1, r * 0.5);
  },

  /** Small dragon. */
  dragon(ctx) {
    const { art, body, uv } = ctx;
    const r = art.radius;
    const y = art.height * 0.6;
    body.blob(0, y, 0, r * 0.8, 6, uv, art.body, 0.85);
    body.blob(0, y + r * 0.35, r * 0.85, r * 0.42, 5, uv, art.light, 0.9);
    body.prism(0, y + r * 0.3, r * 1.15, 4, r * 0.28, r * 0.08, r * 0.55, uv, art.dark);
    const w = art.wings || 1;
    for (const sx of [-1, 1]) {
      body.box(sx * r * (0.8 + w * 0.55), y + r * 0.5, -r * 0.1, r * w * 1.6, 0.07, r * 1.3, uv, art.light);
    }
    for (let i = 0; i < 4; i++) {
      body.prism(0, y + r * 0.6, -r * (0.2 + i * 0.4), 3, r * 0.16, 0, r * 0.45, uv, art.dark);
    }
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.45, y - r * 0.6, r * 0.2, r * 0.22, r * 0.7, r * 0.22, uv, art.dark);
    }
    eyes(ctx, y + r * 0.45, r * 0.3, 0.08, r * 1.15);
  },

  // ---- bosses -----------------------------------------------------------

  boss_leshy(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const h = art.height;
    const r = art.radius;
    // Root legs.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body.prism(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6, 4, r * 0.22, r * 0.14, h * 0.4, uv, art.dark, a);
    }
    body.prism(0, h * 0.32, 0, 7, r * 0.8, r * 0.62, h * 0.42, uv, art.body);
    // Arms.
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.85, h * 0.62, 0, r * 0.3, h * 0.4, r * 0.3, uv, art.dark);
      body.box(sx * r * 1.05, h * 0.42, r * 0.2, r * 0.34, h * 0.14, r * 0.34, uv, art.light);
    }
    // Antler canopy.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      body.prism(Math.cos(a) * r * 0.5, h * 0.76, Math.sin(a) * r * 0.5, 4, r * 0.12, 0, h * 0.28, uv, art.light, a);
      body.blob(Math.cos(a) * r * 0.85, h * 0.94, Math.sin(a) * r * 0.85, r * 0.3, 4, uv, art.dark, 0.7);
    }
    glow.blob(0, h * 0.72, r * 0.55, r * 0.2, 4, uvGlow, art.glow, 1);
    eyes(ctx, h * 0.72, r * 0.4, 0.16, r * 0.66);
  },

  boss_bat(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const r = art.radius;
    const y = art.height * 0.65;
    body.blob(0, y, 0, r * 0.85, 6, uv, art.body, 1.15);
    body.blob(0, y + r * 0.55, r * 0.35, r * 0.5, 5, uv, art.light, 0.9);
    const w = art.wings || 3;
    for (const sx of [-1, 1]) {
      body.box(sx * (r + w * 0.42), y + r * 0.2, 0, w * 0.9, 0.1, r * 2.0, uv, art.dark);
      body.box(sx * (r + w * 0.2), y + r * 0.55, 0, w * 0.5, 0.08, r * 1.2, uv, art.light);
      body.prism(sx * r * 0.42, y + r * 0.9, 0, 4, r * 0.16, 0, r * 0.9, uv, art.dark);
    }
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5;
      glow.prism(t * r * 0.8, y + r * 0.3, r * 0.62, 3, 0.07, 0, 0.22, uvGlow, art.glow);
    }
    eyes(ctx, y + r * 0.5, r * 0.55, 0.18, r * 0.7);
  },

  boss_golem(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const h = art.height;
    const r = art.radius;
    const legH = h * 0.3;
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.5, legH * 0.5, 0, r * 0.6, legH, r * 0.7, uv, art.dark);
    }
    body.box(0, legH + h * 0.26, 0, r * 1.9, h * 0.5, r * 1.15, uv, art.body);
    body.box(0, legH + h * 0.5, 0, r * 1.4, h * 0.1, r * 1.0, uv, art.light);
    for (const sx of [-1, 1]) {
      body.box(sx * r * 1.25, legH + h * 0.24, 0, r * 0.55, h * 0.55, r * 0.6, uv, art.dark);
      // Hammer fists.
      body.box(sx * r * 1.3, legH - h * 0.02, 0, r * 0.85, h * 0.2, r * 0.85, uv, art.light);
    }
    body.box(0, legH + h * 0.62, 0, r * 0.9, h * 0.14, r * 0.8, uv, art.light);
    // Furnace chest.
    glow.box(0, legH + h * 0.3, r * 0.6, r * 0.9, h * 0.2, 0.12, uvGlow, art.glow);
    for (let i = 0; i < 4; i++) {
      glow.box((i / 3 - 0.5) * r * 1.4, legH + h * 0.52, r * 0.5, 0.1, 0.1, 0.1, uvGlow, art.glow);
    }
    eyes(ctx, legH + h * 0.62, r * 0.42, 0.16, r * 0.45);
  },

  boss_maw(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const r = art.radius;
    const h = art.height;
    // Crater rim.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      body.prism(Math.cos(a) * r, 0, Math.sin(a) * r, 5, r * 0.3, r * 0.18, h * 0.35, uv, art.body, a);
    }
    // Throat.
    glow.prism(0, -0.2, 0, 8, r * 0.62, r * 0.5, 0.5, uvGlow, art.glow);
    // Fangs.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      body.prism(Math.cos(a) * r * 0.68, h * 0.3, Math.sin(a) * r * 0.68, 3, r * 0.16, 0, h * 0.4, uv, art.light, a);
    }
    // Eye stalks that rise from the pit.
    for (let i = 0; i < (art.eyes || 3); i++) {
      const a = (i / (art.eyes || 3)) * Math.PI * 2 + 0.5;
      const x = Math.cos(a) * r * 0.4;
      const z = Math.sin(a) * r * 0.4;
      body.prism(x, h * 0.2, z, 4, 0.12, 0.09, h * 0.55, uv, art.dark);
      glow.blob(x, h * 0.8, z, 0.2, 4, uvGlow, art.glow, 1);
    }
  },

  boss_dragon(ctx) {
    const { art, body, glow, uv, uvGlow } = ctx;
    const r = art.radius;
    const h = art.height;
    const y = h * 0.45;
    body.blob(0, y, 0, r * 0.9, 7, uv, art.body, 0.85);
    // Neck and head.
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      body.blob(0, y + t * h * 0.3, r * (0.7 + t * 0.8), r * (0.42 - t * 0.12), 5, uv, art.body, 1);
    }
    body.blob(0, y + h * 0.3, r * 1.6, r * 0.4, 5, uv, art.light, 0.8);
    body.prism(0, y + h * 0.26, r * 1.95, 4, r * 0.26, r * 0.08, r * 0.6, uv, art.dark);
    for (const sx of [-1, 1]) {
      body.prism(sx * r * 0.22, y + h * 0.42, r * 1.5, 4, r * 0.14, 0, r * 0.75, uv, art.light);
    }
    // Wings.
    const w = art.wings || 4;
    for (const sx of [-1, 1]) {
      body.box(sx * (r + w * 0.4), y + h * 0.25, -r * 0.2, w * 0.9, 0.12, r * 2.2, uv, art.light);
      body.box(sx * (r + w * 0.18), y + h * 0.45, -r * 0.1, w * 0.5, 0.1, r * 1.3, uv, art.dark);
    }
    // Tail and legs.
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      body.blob(0, y - t * h * 0.12, -r * (0.9 + t * 1.6), r * (0.4 - t * 0.28), 4, uv, art.dark, 1);
    }
    for (const sx of [-1, 1]) {
      body.box(sx * r * 0.6, y - h * 0.3, r * 0.25, r * 0.3, h * 0.35, r * 0.3, uv, art.dark);
    }
    // Prismatic crest.
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      glow.prism(0, y + h * 0.2 + t * 0.1, -r * (0.2 + t * 1.4), 3, r * 0.16, 0, r * 0.45, uvGlow, art.glow);
    }
    eyes(ctx, y + h * 0.32, r * 0.38, 0.2, r * 1.85);
  },
};

export { FORMS as CREATURE_FORMS };
