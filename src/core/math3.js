/**
 * Minimal 3D math: the handful of vector and matrix operations this game needs.
 *
 * Deliberately allocation-light — every routine that runs per frame writes into
 * an output array supplied by the caller. Matrices are column-major Float32Array
 * of 16, matching what WebGL expects, so they upload without conversion.
 */

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

/** Shortest signed angular difference, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function sign(v) {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

// ---------------------------------------------------------------- vec3

export const vec3 = {
  create(x = 0, y = 0, z = 0) {
    return new Float32Array([x, y, z]);
  },
  set(o, x, y, z) {
    o[0] = x;
    o[1] = y;
    o[2] = z;
    return o;
  },
  copy(o, a) {
    o[0] = a[0];
    o[1] = a[1];
    o[2] = a[2];
    return o;
  },
  add(o, a, b) {
    o[0] = a[0] + b[0];
    o[1] = a[1] + b[1];
    o[2] = a[2] + b[2];
    return o;
  },
  sub(o, a, b) {
    o[0] = a[0] - b[0];
    o[1] = a[1] - b[1];
    o[2] = a[2] - b[2];
    return o;
  },
  scale(o, a, s) {
    o[0] = a[0] * s;
    o[1] = a[1] * s;
    o[2] = a[2] * s;
    return o;
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(o, a, b) {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    const bx = b[0];
    const by = b[1];
    const bz = b[2];
    o[0] = ay * bz - az * by;
    o[1] = az * bx - ax * bz;
    o[2] = ax * by - ay * bx;
    return o;
  },
  length(a) {
    return Math.hypot(a[0], a[1], a[2]);
  },
  normalize(o, a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l < 1e-8) return vec3.set(o, 0, 0, 0);
    o[0] = a[0] / l;
    o[1] = a[1] / l;
    o[2] = a[2] / l;
    return o;
  },
  dist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  },
};

/** Horizontal (XZ-plane) distance — the one used by nearly all gameplay logic. */
export function dist2d(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

export function dist2dSq(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

// ---------------------------------------------------------------- mat4

export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  identity(o) {
    o.fill(0);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  },

  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect;
    o[5] = f;
    o[11] = -1;
    const nf = 1 / (near - far);
    o[10] = (far + near) * nf;
    o[14] = 2 * far * near * nf;
    return o;
  },

  ortho(o, l, r, b, t, n, f) {
    o.fill(0);
    o[0] = 2 / (r - l);
    o[5] = 2 / (t - b);
    o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l);
    o[13] = -(t + b) / (t - b);
    o[14] = -(f + n) / (f - n);
    o[15] = 1;
    return o;
  },

  /** View matrix from a position plus yaw/pitch in radians. */
  fpsView(o, x, y, z, yaw, pitch) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    // Basis: right = cross(forward, up), up, forward. In a right-handed,
    // Y-up world, looking along +Z puts +X on your left — getting this sign
    // wrong mirrors the image and inverts every triangle's winding.
    const rx = -cy;
    const ry = 0;
    const rz = sy;
    const ux = sy * sp;
    const uy = cp;
    const uz = cy * sp;
    const fx = sy * cp;
    const fy = -sp;
    const fz = cy * cp;

    o[0] = rx;
    o[1] = ux;
    o[2] = -fx;
    o[3] = 0;
    o[4] = ry;
    o[5] = uy;
    o[6] = -fy;
    o[7] = 0;
    o[8] = rz;
    o[9] = uz;
    o[10] = -fz;
    o[11] = 0;
    o[12] = -(rx * x + ry * y + rz * z);
    o[13] = -(ux * x + uy * y + uz * z);
    o[14] = fx * x + fy * y + fz * z;
    o[15] = 1;
    return o;
  },

  multiply(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  },

  /** Translation + Y rotation + uniform scale — all any game object needs. */
  trs(o, x, y, z, yaw, sx, sy, sz) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    o[0] = c * sx;
    o[1] = 0;
    o[2] = -s * sx;
    o[3] = 0;
    o[4] = 0;
    o[5] = sy;
    o[6] = 0;
    o[7] = 0;
    o[8] = s * sz;
    o[9] = 0;
    o[10] = c * sz;
    o[11] = 0;
    o[12] = x;
    o[13] = y;
    o[14] = z;
    o[15] = 1;
    return o;
  },

  /** TRS with an extra pitch (X) rotation, applied before yaw. */
  trsPitch(o, x, y, z, yaw, pitch, sx, sy, sz) {
    const cy = Math.cos(yaw);
    const sy2 = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    o[0] = cy * sx;
    o[1] = 0;
    o[2] = -sy2 * sx;
    o[3] = 0;
    o[4] = sy2 * sp * sy;
    o[5] = cp * sy;
    o[6] = cy * sp * sy;
    o[7] = 0;
    o[8] = sy2 * cp * sz;
    o[9] = -sp * sz;
    o[10] = cy * cp * sz;
    o[11] = 0;
    o[12] = x;
    o[13] = y;
    o[14] = z;
    o[15] = 1;
    return o;
  },
};
