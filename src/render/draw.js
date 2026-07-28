/**
 * Low-level drawing primitives used by the procedural sprite painters.
 *
 * These are the "brushes" of the game's art style: every sprite is built from
 * blobs, plates and rim lights, which is what gives ~60 hand-coded creatures a
 * single coherent look without any imported artwork.
 */

export const TAU = Math.PI * 2;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

export function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Blend two hex colours; t=0 -> a, t=1 -> b. */
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r},${g},${bl})`;
}

export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

export function circle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Organic closed blob. `wob` is the amount of radial noise, `phase` shifts the
 * noise so an animated sequence wobbles smoothly.
 */
export function blob(ctx, cx, cy, rx, ry, wob, phase, color, points = 12) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * TAU;
    const n =
      1 +
      Math.sin(a * 3 + phase) * wob * 0.6 +
      Math.sin(a * 5 - phase * 1.4) * wob * 0.4;
    const x = cx + Math.cos(a) * rx * n;
    const y = cy + Math.sin(a) * ry * n;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function roundRect(ctx, x, y, w, h, r, color) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function polygon(ctx, cx, cy, r, sides, rotation, color, squash = 1) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * squash;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function star(ctx, cx, cy, outer, inner, points, rotation, color) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (points * 2)) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Soft radial glow — used sparingly; it is the most expensive brush here. */
export function glow(ctx, x, y, r, color, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.55, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

/** Rim light along the top-left, the signature of this game's shading. */
export function rimLight(ctx, cx, cy, rx, ry, color, width = 2) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.9, Math.PI * 1.85);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

export function eyes(ctx, cx, cy, count, r, spread, color = '#ffffff', pupil = '#12131a', look = 0) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const x = cx + t * spread;
    const y = cy + (count === 3 && i === 1 ? -r * 0.9 : 0);
    circle(ctx, x, y, r, color);
    circle(ctx, x + look * r * 0.35, y + r * 0.15, r * 0.5, pupil);
  }
}

export function toothyMouth(ctx, cx, cy, w, h, color, teeth = 4) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy);
  ctx.quadraticCurveTo(cx, cy + h, cx + w / 2, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < teeth; i++) {
    const t = (i + 0.5) / teeth;
    const x = cx - w / 2 + t * w;
    const th = h * 0.35 * (1 - Math.abs(t - 0.5) * 1.2);
    ctx.beginPath();
    ctx.moveTo(x - w / (teeth * 3), cy);
    ctx.lineTo(x + w / (teeth * 3), cy);
    ctx.lineTo(x, cy + th);
    ctx.closePath();
    ctx.fill();
  }
}

/** Wing shape used by bats, moths and the dragon. */
export function wing(ctx, x, y, len, height, flap, color, edge, membrane = 3) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i <= membrane; i++) {
    const t = i / membrane;
    ctx.quadraticCurveTo(
      len * (t + 0.15),
      height * (0.5 + t * 0.4),
      len * (t + 0.25) * (1 - t * 0.15),
      height * (0.15 + t * 0.9),
    );
  }
  ctx.lineTo(0, height * 0.3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** Dark contact shadow under a standing creature. */
export function groundShadow(ctx, cx, cy, rx, ry, alpha = 0.3) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
}

/** Deterministic value noise for texture speckles. */
export function noise2(x, y, seed = 0) {
  let n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function speckle(ctx, x, y, w, h, color, density, seed, size = 1) {
  ctx.fillStyle = color;
  const count = Math.floor(w * h * density);
  for (let i = 0; i < count; i++) {
    const nx = x + noise2(i, seed, 1) * w;
    const ny = y + noise2(seed, i, 2) * h;
    ctx.fillRect(nx | 0, ny | 0, size, size);
  }
}
