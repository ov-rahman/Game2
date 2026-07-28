/**
 * Deterministic pseudo-random number generator.
 *
 * A run is fully reproducible from its seed: every generator in the game draws
 * from an explicitly passed Rng instance, never from Math.random.
 */

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.state = this.seed || 1;
  }

  /** Fork a child generator so sub-systems cannot disturb each other's stream. */
  fork(tag = '') {
    return new Rng((this.nextU32() ^ hashSeed(tag)) >>> 0);
  }

  nextU32() {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  next() {
    return this.nextU32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick using per-entry numeric weights. `weightOf` defaults to `e.weight`. */
  weighted(arr, weightOf = (e) => (e.weight == null ? 1 : e.weight)) {
    let total = 0;
    for (const e of arr) total += Math.max(0, weightOf(e));
    if (total <= 0) return arr[0];
    let r = this.next() * total;
    for (const e of arr) {
      r -= Math.max(0, weightOf(e));
      if (r <= 0) return e;
    }
    return arr[arr.length - 1];
  }

  /** In-place Fisher-Yates. Returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Random unit vector. */
  dir() {
    const a = this.next() * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  angle() {
    return this.next() * Math.PI * 2;
  }
}
