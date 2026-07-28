/** Small math helpers shared by simulation and presentation. */

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential approach (t is the fraction per tick). */
export function damp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Normalize in place-ish: returns {x,y} of unit length (or {0,0}). */
export function norm(x, y) {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotate(x, y, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Axis-aligned circle overlap test. */
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/** Smoothstep easing on [0,1]. */
export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

export function easeInCubic(t) {
  t = clamp(t, 0, 1);
  return t * t * t;
}

/** Snap a vector to one of 8 compass directions. */
export function snap8(x, y) {
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(a), y: Math.sin(a) };
}

export function sign(v) {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}
