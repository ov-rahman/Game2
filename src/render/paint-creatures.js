/**
 * Procedural creature painting.
 *
 * One routine per `form`, driven by the palette rows in data/creature-art.js.
 * Called only while baking the per-floor atlas — never in the frame loop — so
 * the drawing here can be as elaborate as it likes.
 *
 * Convention: the caller has translated to the sprite centre; the creature is
 * drawn in a box of `s` units with the feet around +0.42*s.
 */
import {
  blob,
  circle,
  ellipse,
  polygon,
  star,
  roundRect,
  eyes,
  wing,
  rimLight,
  glow,
  groundShadow,
  toothyMouth,
  shade,
  mix,
  rgba,
  TAU,
} from './draw.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} s     sprite size in pixels
 * @param {Object} art   row from CREATURE_ART
 * @param {number} f     frame index
 * @param {number} n     total frames
 */
export function paintCreature(ctx, s, art, f, n) {
  const phase = (f / n) * TAU;
  const painter = FORMS[art.form] || FORMS.blob;
  ctx.save();
  painter(ctx, s, art, phase, f, n);
  if (art.crown) paintCrown(ctx, s, art);
  ctx.restore();
}

function outline(ctx, s) {
  // Everything gets a dark silhouette pass first: draw calls below are layered
  // on top, which reads as a clean hand-inked edge at any scale.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function paintCrown(ctx, s, art) {
  const w = s * 0.3;
  const y = -s * 0.38;
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.lineTo(-w * 0.6, y - s * 0.12);
  ctx.lineTo(-w * 0.2, y - s * 0.02);
  ctx.lineTo(w * 0.2, y - s * 0.14);
  ctx.lineTo(w * 0.6, y - s * 0.02);
  ctx.lineTo(w, y - s * 0.1);
  ctx.lineTo(w * 0.8, y + s * 0.04);
  ctx.lineTo(-w * 0.8, y + s * 0.04);
  ctx.closePath();
  ctx.fillStyle = '#ffd93d';
  ctx.fill();
  ctx.strokeStyle = '#8a6a10';
  ctx.lineWidth = 1;
  ctx.stroke();
}

const FORMS = {
  // ------------------------------------------------------------------ blob
  blob(ctx, s, art, phase) {
    const squash = 1 + Math.sin(phase) * 0.09;
    const rx = s * 0.36 * squash;
    const ry = s * 0.32 / squash;
    const cy = s * 0.06;
    groundShadow(ctx, 0, s * 0.4, rx * 0.9, ry * 0.28);
    blob(ctx, 0, cy, rx + 1.6, ry + 1.6, 0.06, phase, art.dark);
    blob(ctx, 0, cy, rx, ry, 0.06, phase, art.body);
    // inner gel highlight
    ctx.globalAlpha = 0.55;
    blob(ctx, -rx * 0.2, cy - ry * 0.25, rx * 0.5, ry * 0.42, 0.08, phase + 1, art.light);
    ctx.globalAlpha = 1;
    circle(ctx, -rx * 0.34, cy - ry * 0.42, s * 0.055, 'rgba(255,255,255,0.85)');
    if (art.glow) glow(ctx, 0, cy, rx * 1.5, art.body, 0.35);
    eyes(ctx, 0, cy - ry * 0.1, art.eyes, s * 0.055, rx * 0.7, '#ffffff', '#16181f');
  },

  // ----------------------------------------------------------------- plant
  plant(ctx, s, art, phase) {
    const sway = Math.sin(phase) * s * 0.04;
    groundShadow(ctx, 0, s * 0.4, s * 0.22, s * 0.07);
    // stem
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.4);
    ctx.quadraticCurveTo(sway, s * 0.05, sway * 1.4, -s * 0.16);
    ctx.lineTo(sway * 1.4 + s * 0.08, -s * 0.16);
    ctx.quadraticCurveTo(sway + s * 0.08, s * 0.06, s * 0.05, s * 0.4);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    // bulb head
    const hx = sway * 1.4 + s * 0.04;
    const hy = -s * 0.2;
    ellipse(ctx, hx, hy, s * 0.24, s * 0.22, art.dark);
    ellipse(ctx, hx, hy, s * 0.21, s * 0.19, art.body);
    rimLight(ctx, hx, hy, s * 0.19, s * 0.17, art.light, 2);
    // petals
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + phase * 0.2;
      ellipse(ctx, hx + Math.cos(a) * s * 0.24, hy + Math.sin(a) * s * 0.2, s * 0.09, s * 0.055, art.accent);
    }
    eyes(ctx, hx, hy, art.eyes, s * 0.05, s * 0.16, '#ffffff', '#16181f');
  },

  // ------------------------------------------------------------------ moth
  moth(ctx, s, art, phase) {
    const flap = Math.sin(phase * 2) * 0.6;
    wing(ctx, -s * 0.05, -s * 0.02, -s * 0.36, s * 0.3, -0.5 - flap, rgba(art.light, 0.85), art.dark);
    wing(ctx, s * 0.05, -s * 0.02, s * 0.36, s * 0.3, 0.5 + flap, rgba(art.light, 0.85), art.dark);
    ellipse(ctx, 0, 0, s * 0.11, s * 0.2, art.dark);
    ellipse(ctx, 0, 0, s * 0.085, s * 0.175, art.body);
    // antennae
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.04, -s * 0.16);
    ctx.quadraticCurveTo(-s * 0.16, -s * 0.3, -s * 0.2, -s * 0.24);
    ctx.moveTo(s * 0.04, -s * 0.16);
    ctx.quadraticCurveTo(s * 0.16, -s * 0.3, s * 0.2, -s * 0.24);
    ctx.stroke();
    eyes(ctx, 0, -s * 0.1, art.eyes, s * 0.04, s * 0.09, '#ffffff', '#16181f');
    if (art.glow) glow(ctx, 0, 0, s * 0.5, art.accent, 0.2);
  },

  // ------------------------------------------------------------------- bug
  bug(ctx, s, art, phase, f) {
    const legSwing = Math.sin(phase * 2) * s * 0.05;
    groundShadow(ctx, 0, s * 0.38, s * 0.26, s * 0.08);
    // legs
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = Math.max(1.4, s * 0.045);
    for (let i = -1; i <= 1; i += 1) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.16, s * 0.05 + i * s * 0.08);
        ctx.lineTo(side * s * 0.32, s * 0.2 + i * s * 0.06 + legSwing * side * (i + 2) * 0.3);
        ctx.stroke();
      }
    }
    // carapace
    ellipse(ctx, 0, 0, s * 0.28, s * 0.24, art.dark);
    ellipse(ctx, 0, 0, s * 0.25, s * 0.21, art.body);
    ellipse(ctx, -s * 0.06, -s * 0.06, s * 0.13, s * 0.09, rgba(art.light, 0.6));
    // spikes
    const spikes = art.spikes || 4;
    ctx.fillStyle = art.accent;
    for (let i = 0; i < spikes; i++) {
      const a = -Math.PI + (i / (spikes - 1)) * Math.PI;
      const x = Math.cos(a) * s * 0.24;
      const y = Math.sin(a) * s * 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * s * 0.1, y + Math.sin(a) * s * 0.1);
      ctx.lineTo(x + Math.cos(a + 0.5) * s * 0.05, y + Math.sin(a + 0.5) * s * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    eyes(ctx, 0, -s * 0.03, art.eyes, s * 0.04, s * 0.2, '#ffe9a8', '#16181f');
  },

  // ---------------------------------------------------------------- turtle
  turtle(ctx, s, art, phase) {
    const bob = Math.sin(phase) * s * 0.02;
    groundShadow(ctx, 0, s * 0.38, s * 0.3, s * 0.09);
    // head
    ellipse(ctx, s * 0.24, s * 0.02 + bob, s * 0.11, s * 0.09, art.dark);
    ellipse(ctx, s * 0.24, s * 0.02 + bob, s * 0.09, s * 0.07, mix(art.body, art.light, 0.3));
    // shell
    ellipse(ctx, 0, bob, s * 0.34, s * 0.27, art.dark);
    ellipse(ctx, 0, bob, s * 0.31, s * 0.24, art.body);
    // moss plates
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ellipse(ctx, Math.cos(a) * s * 0.16, bob + Math.sin(a) * s * 0.12, s * 0.075, s * 0.06, art.accent);
    }
    ellipse(ctx, 0, bob, s * 0.1, s * 0.08, art.light);
    rimLight(ctx, 0, bob, s * 0.3, s * 0.23, rgba(art.light, 0.8), 2);
    eyes(ctx, s * 0.26, s * 0.0 + bob, art.eyes, s * 0.026, s * 0.06, '#ffffff', '#16181f');
  },

  // ------------------------------------------------------------------ wisp
  wisp(ctx, s, art, phase) {
    const r = s * 0.24 * (1 + Math.sin(phase) * 0.1);
    glow(ctx, 0, 0, s * 0.55, art.body, 0.55);
    circle(ctx, 0, 0, r, art.body);
    circle(ctx, -r * 0.25, -r * 0.25, r * 0.5, art.light);
    // trailing sparks
    for (let i = 0; i < 4; i++) {
      const a = phase + (i / 4) * TAU;
      circle(ctx, Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.34, s * 0.035, rgba(art.accent, 0.8));
    }
    if (art.eyes) eyes(ctx, 0, 0, art.eyes, s * 0.04, r * 0.8, '#2a2018', '#ffffff');
  },

  // ----------------------------------------------------------------- stump
  stump(ctx, s, art, phase) {
    const step = Math.sin(phase * 2) * s * 0.04;
    groundShadow(ctx, 0, s * 0.42, s * 0.24, s * 0.07);
    // roots as legs
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, s * 0.18);
    ctx.lineTo(-s * 0.14, s * 0.4 + step);
    ctx.moveTo(s * 0.1, s * 0.18);
    ctx.lineTo(s * 0.14, s * 0.4 - step);
    ctx.stroke();
    // trunk
    roundRect(ctx, -s * 0.2, -s * 0.24, s * 0.4, s * 0.46, s * 0.07, art.dark);
    roundRect(ctx, -s * 0.17, -s * 0.21, s * 0.34, s * 0.4, s * 0.06, art.body);
    // bark grain
    ctx.strokeStyle = rgba(art.dark, 0.6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.14 + i * s * 0.11, -s * 0.18);
      ctx.lineTo(-s * 0.12 + i * s * 0.11, s * 0.15);
      ctx.stroke();
    }
    // leafy top
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI + (i / 4) * Math.PI;
      ellipse(ctx, Math.cos(a) * s * 0.17, -s * 0.24 + Math.sin(a) * s * 0.06, s * 0.1, s * 0.07, art.accent);
    }
    eyes(ctx, 0, -s * 0.05, art.eyes, s * 0.045, s * 0.14, '#ffe9a8', '#16181f');
  },

  // ------------------------------------------------------------------- bat
  bat(ctx, s, art, phase) {
    const flap = Math.sin(phase * 2);
    wing(ctx, -s * 0.08, -s * 0.04, -s * 0.4, s * 0.26, -0.35 - flap * 0.8, art.body, art.dark);
    wing(ctx, s * 0.08, -s * 0.04, s * 0.4, s * 0.26, 0.35 + flap * 0.8, art.body, art.dark);
    ellipse(ctx, 0, 0, s * 0.16, s * 0.17, art.dark);
    ellipse(ctx, 0, 0, s * 0.13, s * 0.14, art.body);
    // ears
    ctx.fillStyle = art.dark;
    ctx.beginPath();
    ctx.moveTo(-s * 0.11, -s * 0.12);
    ctx.lineTo(-s * 0.18, -s * 0.3);
    ctx.lineTo(-s * 0.03, -s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.11, -s * 0.12);
    ctx.lineTo(s * 0.18, -s * 0.3);
    ctx.lineTo(s * 0.03, -s * 0.16);
    ctx.closePath();
    ctx.fill();
    eyes(ctx, 0, -s * 0.02, art.eyes, s * 0.038, s * 0.12, art.accent, '#101018');
    toothyMouth(ctx, 0, s * 0.06, s * 0.11, s * 0.07, '#2a1030', 3);
  },

  // ------------------------------------------------------------------- orb
  orb(ctx, s, art, phase) {
    const r = s * 0.3 * (1 + Math.sin(phase) * 0.05);
    if (art.glow) glow(ctx, 0, 0, s * 0.6, art.body, 0.4);
    circle(ctx, 0, 0, r + 1.5, art.dark);
    circle(ctx, 0, 0, r, art.body);
    ctx.globalAlpha = 0.6;
    circle(ctx, -r * 0.3, -r * 0.3, r * 0.42, art.light);
    ctx.globalAlpha = 1;
    // orbiting motes
    for (let i = 0; i < 3; i++) {
      const a = phase * 1.4 + (i / 3) * TAU;
      circle(ctx, Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.6, s * 0.04, art.accent);
    }
    eyes(ctx, 0, 0, art.eyes, s * 0.06, r * 0.6, '#ffffff', '#101018');
  },

  // ---------------------------------------------------------------- sprite
  sprite(ctx, s, art, phase) {
    const float = Math.sin(phase) * s * 0.03;
    if (art.glow) glow(ctx, 0, float, s * 0.5, art.body, 0.35);
    // hooded, tapering body
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34 + float);
    ctx.quadraticCurveTo(s * 0.26, -s * 0.05 + float, s * 0.14, s * 0.3 + float);
    ctx.quadraticCurveTo(0, s * 0.4 + float, -s * 0.14, s * 0.3 + float);
    ctx.quadraticCurveTo(-s * 0.26, -s * 0.05 + float, 0, -s * 0.34 + float);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    ctx.save();
    ctx.scale(0.86, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34 + float);
    ctx.quadraticCurveTo(s * 0.26, -s * 0.05 + float, s * 0.14, s * 0.3 + float);
    ctx.quadraticCurveTo(0, s * 0.4 + float, -s * 0.14, s * 0.3 + float);
    ctx.quadraticCurveTo(-s * 0.26, -s * 0.05 + float, 0, -s * 0.34 + float);
    ctx.closePath();
    ctx.fillStyle = art.body;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.45;
    ellipse(ctx, -s * 0.06, -s * 0.12 + float, s * 0.07, s * 0.12, art.light);
    ctx.globalAlpha = 1;
    eyes(ctx, 0, -s * 0.12 + float, art.eyes, s * 0.045, s * 0.13, art.accent, '#0d0d14');
  },

  // -------------------------------------------------------------- mushroom
  mushroom(ctx, s, art, phase) {
    const bob = Math.sin(phase) * s * 0.02;
    groundShadow(ctx, 0, s * 0.4, s * 0.2, s * 0.06);
    // stalk
    roundRect(ctx, -s * 0.09, -s * 0.02 + bob, s * 0.18, s * 0.4, s * 0.05, art.dark);
    roundRect(ctx, -s * 0.07, 0 + bob, s * 0.14, s * 0.36, s * 0.04, mix(art.body, '#ffffff', 0.35));
    // cap
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.04 + bob, s * 0.32, s * 0.24, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.05 + bob, s * 0.29, s * 0.21, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = art.body;
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + ((i + 0.5) / 4) * Math.PI;
      ellipse(ctx, Math.cos(a) * s * 0.18, -s * 0.06 + bob + Math.sin(a) * s * 0.12, s * 0.05, s * 0.038, art.accent);
    }
    eyes(ctx, 0, s * 0.14 + bob, art.eyes, s * 0.035, s * 0.09, '#ffffff', '#16181f');
  },

  // ------------------------------------------------------------------ worm
  worm(ctx, s, art, phase) {
    groundShadow(ctx, 0, s * 0.4, s * 0.24, s * 0.07);
    for (let i = 4; i >= 0; i--) {
      const t = i / 4;
      const x = Math.sin(phase + t * 2.2) * s * 0.12 * t;
      const y = s * 0.22 - t * s * 0.4;
      const r = s * (0.2 - t * 0.06);
      circle(ctx, x, y, r + 1.2, art.dark);
      circle(ctx, x, y, r, i === 0 ? art.body : mix(art.body, art.dark, t * 0.5));
    }
    const hx = Math.sin(phase + 2.2) * s * 0.12;
    eyes(ctx, hx, -s * 0.2, art.eyes, s * 0.035, s * 0.1, art.accent, '#101018');
    toothyMouth(ctx, hx, -s * 0.12, s * 0.14, s * 0.1, '#2a1010', 4);
  },

  // ----------------------------------------------------------------- golem
  golem(ctx, s, art, phase) {
    const bob = Math.sin(phase) * s * 0.015;
    groundShadow(ctx, 0, s * 0.44, s * 0.3, s * 0.09);
    // legs
    roundRect(ctx, -s * 0.2, s * 0.16, s * 0.15, s * 0.26, s * 0.03, art.dark);
    roundRect(ctx, s * 0.05, s * 0.16, s * 0.15, s * 0.26, s * 0.03, art.dark);
    // torso
    roundRect(ctx, -s * 0.28, -s * 0.24 + bob, s * 0.56, s * 0.44, s * 0.07, art.dark);
    roundRect(ctx, -s * 0.25, -s * 0.21 + bob, s * 0.5, s * 0.38, s * 0.06, art.body);
    // arms
    roundRect(ctx, -s * 0.42, -s * 0.16 + bob, s * 0.14, s * 0.36, s * 0.05, art.dark);
    roundRect(ctx, s * 0.28, -s * 0.16 + bob, s * 0.14, s * 0.36, s * 0.05, art.dark);
    // glowing core seams
    ctx.fillStyle = art.accent;
    ctx.fillRect(-s * 0.2, -s * 0.02 + bob, s * 0.4, s * 0.035);
    circle(ctx, 0, -s * 0.1 + bob, s * 0.07, art.accent);
    glow(ctx, 0, -s * 0.1 + bob, s * 0.24, art.accent, 0.45);
    // head plate
    roundRect(ctx, -s * 0.14, -s * 0.38 + bob, s * 0.28, s * 0.18, s * 0.04, art.light);
    eyes(ctx, 0, -s * 0.29 + bob, art.eyes, s * 0.035, s * 0.14, art.accent, '#1a0d06');
  },

  // ----------------------------------------------------------------- hound
  hound(ctx, s, art, phase) {
    const run = Math.sin(phase * 2) * s * 0.06;
    groundShadow(ctx, 0, s * 0.4, s * 0.3, s * 0.08);
    // legs
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, s * 0.12);
    ctx.lineTo(-s * 0.2 + run, s * 0.38);
    ctx.moveTo(s * 0.14, s * 0.12);
    ctx.lineTo(s * 0.2 - run, s * 0.38);
    ctx.stroke();
    // body
    ellipse(ctx, 0, s * 0.02, s * 0.3, s * 0.18, art.dark);
    ellipse(ctx, 0, s * 0.02, s * 0.27, s * 0.15, art.body);
    // head
    ellipse(ctx, s * 0.24, -s * 0.08, s * 0.15, s * 0.12, art.dark);
    ellipse(ctx, s * 0.24, -s * 0.08, s * 0.12, s * 0.1, art.body);
    // snout + ear
    ctx.beginPath();
    ctx.moveTo(s * 0.32, -s * 0.06);
    ctx.lineTo(s * 0.44, -s * 0.02);
    ctx.lineTo(s * 0.32, s * 0.03);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -s * 0.16);
    ctx.lineTo(s * 0.14, -s * 0.32);
    ctx.lineTo(s * 0.28, -s * 0.18);
    ctx.closePath();
    ctx.fill();
    // spine crest
    ctx.fillStyle = art.accent;
    for (let i = 0; i < 4; i++) {
      const x = -s * 0.18 + i * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, -s * 0.1);
      ctx.lineTo(x + s * 0.04, -s * 0.24);
      ctx.lineTo(x + s * 0.08, -s * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    eyes(ctx, s * 0.26, -s * 0.1, art.eyes, s * 0.03, s * 0.08, art.accent, '#100804');
  },

  // ------------------------------------------------------------------- imp
  imp(ctx, s, art, phase) {
    const bob = Math.sin(phase) * s * 0.025;
    groundShadow(ctx, 0, s * 0.4, s * 0.18, s * 0.06);
    wing(ctx, -s * 0.14, -s * 0.06 + bob, -s * 0.28, s * 0.2, -0.6 - Math.sin(phase * 2) * 0.5, rgba(art.accent, 0.8), art.dark);
    wing(ctx, s * 0.14, -s * 0.06 + bob, s * 0.28, s * 0.2, 0.6 + Math.sin(phase * 2) * 0.5, rgba(art.accent, 0.8), art.dark);
    ellipse(ctx, 0, s * 0.06 + bob, s * 0.18, s * 0.2, art.dark);
    ellipse(ctx, 0, s * 0.06 + bob, s * 0.15, s * 0.17, art.body);
    ellipse(ctx, 0, -s * 0.18 + bob, s * 0.16, s * 0.14, art.dark);
    ellipse(ctx, 0, -s * 0.18 + bob, s * 0.13, s * 0.11, art.body);
    // horns
    ctx.fillStyle = art.light;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.26 + bob);
    ctx.lineTo(-s * 0.16, -s * 0.4 + bob);
    ctx.lineTo(-s * 0.04, -s * 0.28 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.26 + bob);
    ctx.lineTo(s * 0.16, -s * 0.4 + bob);
    ctx.lineTo(s * 0.04, -s * 0.28 + bob);
    ctx.closePath();
    ctx.fill();
    eyes(ctx, 0, -s * 0.19 + bob, art.eyes, s * 0.035, s * 0.1, art.accent, '#200800');
  },

  // ---------------------------------------------------------------- turret
  turret(ctx, s, art, phase) {
    groundShadow(ctx, 0, s * 0.42, s * 0.3, s * 0.08);
    // anvil base
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.4);
    ctx.lineTo(-s * 0.18, s * 0.08);
    ctx.lineTo(s * 0.18, s * 0.08);
    ctx.lineTo(s * 0.3, s * 0.4);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    roundRect(ctx, -s * 0.34, -s * 0.16, s * 0.68, s * 0.26, s * 0.05, art.dark);
    roundRect(ctx, -s * 0.31, -s * 0.13, s * 0.62, s * 0.2, s * 0.04, art.body);
    // barrel ring
    circle(ctx, 0, -s * 0.02, s * 0.11, art.dark);
    circle(ctx, 0, -s * 0.02, s * 0.08, art.accent);
    glow(ctx, 0, -s * 0.02, s * 0.28, art.accent, 0.4 + Math.sin(phase) * 0.15);
    ctx.fillStyle = art.light;
    ctx.fillRect(-s * 0.31, -s * 0.16, s * 0.62, s * 0.03);
  },

  // ---------------------------------------------------------------- knight
  knight(ctx, s, art, phase) {
    const bob = Math.sin(phase) * s * 0.015;
    groundShadow(ctx, 0, s * 0.44, s * 0.26, s * 0.08);
    // cape
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.16 + bob);
    ctx.quadraticCurveTo(-s * 0.34, s * 0.18, -s * 0.14, s * 0.4);
    ctx.lineTo(s * 0.14, s * 0.4);
    ctx.quadraticCurveTo(s * 0.34, s * 0.18, s * 0.2, -s * 0.16 + bob);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    // body armour
    roundRect(ctx, -s * 0.2, -s * 0.18 + bob, s * 0.4, s * 0.42, s * 0.06, art.body);
    roundRect(ctx, -s * 0.16, -s * 0.14 + bob, s * 0.32, s * 0.16, s * 0.04, art.light);
    // helm
    roundRect(ctx, -s * 0.15, -s * 0.4 + bob, s * 0.3, s * 0.24, s * 0.07, art.dark);
    roundRect(ctx, -s * 0.12, -s * 0.37 + bob, s * 0.24, s * 0.18, s * 0.05, art.body);
    ctx.fillStyle = art.accent;
    ctx.fillRect(-s * 0.1, -s * 0.3 + bob, s * 0.2, s * 0.045);
    glow(ctx, 0, -s * 0.28 + bob, s * 0.2, art.accent, 0.4);
    // shield
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.14 + bob);
    ctx.lineTo(-s * 0.22, -s * 0.2 + bob);
    ctx.lineTo(-s * 0.22, s * 0.14 + bob);
    ctx.lineTo(-s * 0.42, s * 0.2 + bob);
    ctx.closePath();
    ctx.fillStyle = art.light;
    ctx.fill();
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // blade
    ctx.fillStyle = art.accent;
    ctx.fillRect(s * 0.26, -s * 0.3 + bob, s * 0.06, s * 0.46);
  },

  // ------------------------------------------------------------------- maw
  maw(ctx, s, art, phase) {
    const open = 0.6 + Math.sin(phase) * 0.4;
    groundShadow(ctx, 0, s * 0.4, s * 0.36, s * 0.1);
    // crater rim
    ellipse(ctx, 0, s * 0.12, s * 0.42, s * 0.24, art.dark);
    ellipse(ctx, 0, s * 0.12, s * 0.36, s * 0.19, mix(art.dark, art.body, 0.4));
    // throat
    ellipse(ctx, 0, s * 0.14, s * 0.26 * open + s * 0.06, s * 0.14 * open + s * 0.03, '#180402');
    glow(ctx, 0, s * 0.14, s * 0.4, art.accent, 0.35 + open * 0.25);
    ellipse(ctx, 0, s * 0.16, s * 0.16 * open, s * 0.08 * open, art.accent);
    // fangs
    ctx.fillStyle = '#ffeccd';
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = -s * 0.3 + t * s * 0.6;
      const y = s * 0.12 - Math.cos((t - 0.5) * Math.PI) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.03, y);
      ctx.lineTo(x + s * 0.03, y);
      ctx.lineTo(x, y + s * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    if (art.eyes) {
      eyes(ctx, 0, -s * 0.16, art.eyes, s * 0.05, s * 0.3, art.accent, '#200400');
    }
  },

  // ----------------------------------------------------------------- mimic
  mimic(ctx, s, art, phase) {
    const open = Math.max(0, Math.sin(phase)) * 0.6;
    groundShadow(ctx, 0, s * 0.42, s * 0.3, s * 0.08);
    // chest body
    roundRect(ctx, -s * 0.32, -s * 0.04, s * 0.64, s * 0.4, s * 0.05, art.dark);
    roundRect(ctx, -s * 0.29, -s * 0.01, s * 0.58, s * 0.34, s * 0.04, art.body);
    // lid, hinged open
    ctx.save();
    ctx.translate(0, -s * 0.04);
    ctx.rotate(-open);
    roundRect(ctx, -s * 0.32, -s * 0.22, s * 0.64, s * 0.22, s * 0.06, art.dark);
    roundRect(ctx, -s * 0.29, -s * 0.19, s * 0.58, s * 0.16, s * 0.05, art.light);
    ctx.restore();
    // teeth in the gap
    if (open > 0.05) {
      ctx.fillStyle = '#fff6e0';
      for (let i = 0; i < 6; i++) {
        const x = -s * 0.24 + i * s * 0.1;
        ctx.beginPath();
        ctx.moveTo(x, -s * 0.04);
        ctx.lineTo(x + s * 0.06, -s * 0.04);
        ctx.lineTo(x + s * 0.03, -s * 0.04 + s * 0.1 * open + s * 0.02);
        ctx.closePath();
        ctx.fill();
      }
    }
    // lock plate + coins
    roundRect(ctx, -s * 0.05, s * 0.02, s * 0.1, s * 0.1, s * 0.02, art.accent);
    circle(ctx, -s * 0.18, s * 0.3, s * 0.05, '#ffd93d');
    circle(ctx, s * 0.2, s * 0.32, s * 0.045, '#ffe98a');
    if (open > 0.1) eyes(ctx, 0, -s * 0.12, art.eyes, s * 0.04, s * 0.16, art.accent, '#1a1000');
  },

  // ---------------------------------------------------------------- dragon
  dragon(ctx, s, art, phase) {
    const flap = Math.sin(phase * 1.4);
    // wings behind
    wing(ctx, -s * 0.1, -s * 0.1, -s * 0.5, s * 0.36, -0.45 - flap * 0.45, rgba(art.light, 0.9), art.dark, 4);
    wing(ctx, s * 0.1, -s * 0.1, s * 0.5, s * 0.36, 0.45 + flap * 0.45, rgba(art.light, 0.9), art.dark, 4);
    // tail
    ctx.beginPath();
    ctx.moveTo(-s * 0.04, s * 0.12);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.3 + flap * s * 0.05, -s * 0.42, s * 0.06);
    ctx.lineTo(-s * 0.36, s * 0.16);
    ctx.quadraticCurveTo(-s * 0.26, s * 0.34, s * 0.04, s * 0.2);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    // body
    ellipse(ctx, 0, s * 0.06, s * 0.24, s * 0.26, art.dark);
    ellipse(ctx, 0, s * 0.06, s * 0.2, s * 0.22, art.body);
    ellipse(ctx, 0, s * 0.1, s * 0.12, s * 0.14, mix(art.light, art.body, 0.4));
    // neck + head
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, -s * 0.06);
    ctx.quadraticCurveTo(s * 0.02, -s * 0.3, s * 0.16, -s * 0.32);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.quadraticCurveTo(s * 0.06, -s * 0.18, s * 0.06, -s * 0.02);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    ellipse(ctx, s * 0.2, -s * 0.3, s * 0.15, s * 0.11, art.dark);
    ellipse(ctx, s * 0.2, -s * 0.3, s * 0.12, s * 0.085, art.body);
    // snout
    ctx.beginPath();
    ctx.moveTo(s * 0.3, -s * 0.32);
    ctx.lineTo(s * 0.44, -s * 0.26);
    ctx.lineTo(s * 0.3, -s * 0.22);
    ctx.closePath();
    ctx.fillStyle = art.light;
    ctx.fill();
    // horns
    ctx.fillStyle = art.accent;
    ctx.beginPath();
    ctx.moveTo(s * 0.14, -s * 0.38);
    ctx.lineTo(s * 0.06, -s * 0.52);
    ctx.lineTo(s * 0.2, -s * 0.4);
    ctx.closePath();
    ctx.fill();
    // dorsal crest
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.02 - t * s * 0.16, -s * 0.06 + t * s * 0.16);
      ctx.lineTo(-s * 0.08 - t * s * 0.18, -s * 0.16 + t * s * 0.14);
      ctx.lineTo(-s * 0.12 - t * s * 0.14, -s * 0.02 + t * s * 0.18);
      ctx.closePath();
      ctx.fillStyle = art.accent;
      ctx.fill();
    }
    eyes(ctx, s * 0.24, -s * 0.32, art.eyes, s * 0.032, s * 0.07, '#fff6d0', '#1a0820');
  },

  // ----------------------------------------------------------------- leshy
  leshy(ctx, s, art, phase) {
    const sway = Math.sin(phase) * s * 0.02;
    groundShadow(ctx, 0, s * 0.44, s * 0.34, s * 0.1);
    // root legs
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = Math.max(3, s * 0.055);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.07, s * 0.16);
      ctx.quadraticCurveTo(i * s * 0.14, s * 0.32, i * s * 0.17 + sway, s * 0.44);
      ctx.stroke();
    }
    // trunk torso
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.2);
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.1, -s * 0.18, -s * 0.3);
    ctx.lineTo(s * 0.18, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.3, -s * 0.1, s * 0.2, s * 0.2);
    ctx.closePath();
    ctx.fillStyle = art.dark;
    ctx.fill();
    ctx.save();
    ctx.scale(0.88, 0.92);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.2);
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.1, -s * 0.18, -s * 0.3);
    ctx.lineTo(s * 0.18, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.3, -s * 0.1, s * 0.2, s * 0.2);
    ctx.closePath();
    ctx.fillStyle = art.body;
    ctx.fill();
    ctx.restore();
    // arms
    ctx.strokeStyle = art.dark;
    ctx.lineWidth = Math.max(4, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.16);
    ctx.quadraticCurveTo(-s * 0.4, -s * 0.02 + sway, -s * 0.36, s * 0.16);
    ctx.moveTo(s * 0.2, -s * 0.16);
    ctx.quadraticCurveTo(s * 0.4, -s * 0.02 - sway, s * 0.36, s * 0.16);
    ctx.stroke();
    // antler canopy
    ctx.strokeStyle = art.light;
    ctx.lineWidth = Math.max(2, s * 0.035);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.08, -s * 0.3);
      ctx.quadraticCurveTo(side * s * 0.22, -s * 0.44, side * s * 0.3, -s * 0.4);
      ctx.moveTo(side * s * 0.12, -s * 0.34);
      ctx.quadraticCurveTo(side * s * 0.2, -s * 0.5, side * s * 0.14, -s * 0.54);
      ctx.stroke();
    }
    // foliage clumps
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.9 + (i / 6) * Math.PI * 0.8;
      ellipse(
        ctx,
        Math.cos(a) * s * 0.28,
        -s * 0.34 + Math.sin(a) * s * 0.14,
        s * 0.1,
        s * 0.075,
        i % 2 ? art.accent : mix(art.light, art.body, 0.3),
      );
    }
    // face
    eyes(ctx, 0, -s * 0.16, art.eyes, s * 0.05, s * 0.18, art.accent, '#141a08');
    glow(ctx, 0, -s * 0.16, s * 0.3, art.accent, 0.3);
  },

  // ---------------------------------------------------------------- player
  player(ctx, s, art, phase, f, n) {
    // Frames 0-3 walk cycle, 4 dash, 5 hurt.
    const walk = f < 4 ? Math.sin((f / 4) * TAU) : 0;
    const lean = f === 4 ? 0.16 : 0;
    ctx.save();
    ctx.rotate(lean);
    groundShadow(ctx, 0, s * 0.44, s * 0.2, s * 0.06, 0.28);
    // legs
    ctx.strokeStyle = '#3c4a63';
    ctx.lineWidth = Math.max(2.4, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(-s * 0.07, s * 0.16);
    ctx.lineTo(-s * 0.09 + walk * s * 0.09, s * 0.42);
    ctx.moveTo(s * 0.07, s * 0.16);
    ctx.lineTo(s * 0.09 - walk * s * 0.09, s * 0.42);
    ctx.stroke();
    // cloak
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.12);
    ctx.quadraticCurveTo(-s * 0.26, s * 0.14, -s * 0.14, s * 0.24);
    ctx.lineTo(s * 0.14, s * 0.24);
    ctx.quadraticCurveTo(s * 0.26, s * 0.14, s * 0.18, -s * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#2f6d8a';
    ctx.fill();
    // torso
    roundRect(ctx, -s * 0.15, -s * 0.16, s * 0.3, s * 0.32, s * 0.06, '#3f8fb0');
    roundRect(ctx, -s * 0.1, -s * 0.1, s * 0.2, s * 0.1, s * 0.03, art.accent);
    // head
    circle(ctx, 0, -s * 0.26, s * 0.15, '#2a2f3d');
    circle(ctx, 0, -s * 0.26, s * 0.125, art.body);
    // hood brim
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.3, s * 0.17, s * 0.1, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = '#2f6d8a';
    ctx.fill();
    eyes(ctx, 0, -s * 0.24, 2, s * 0.032, s * 0.11, '#1b2030', art.accent);
    // scarf
    ctx.fillStyle = art.accent;
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, -s * 0.14);
    ctx.lineTo(s * 0.12, -s * 0.14);
    ctx.lineTo(s * 0.16 + walk * s * 0.06, -s * 0.02);
    ctx.lineTo(s * 0.1, -s * 0.04);
    ctx.lineTo(-s * 0.12, -s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};

export { FORMS as CREATURE_FORMS };
