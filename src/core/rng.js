/**
 * Seeded pseudo-random generator.
 *
 * Every generator in the game draws from an explicitly passed Rng, never from
 * Math.random, so a run is reproducible from its seed.
 */

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

  /** Child stream, so sub-systems cannot disturb each other's sequence. */
  fork(tag = '') {
    return new Rng((this.nextU32() ^ hashSeed(tag)) >>> 0);
  }

  nextU32() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  next() {
    return this.nextU32() / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

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

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  angle() {
    return this.next() * Math.PI * 2;
  }

  /** Random direction on the XZ plane. */
  dir2d() {
    const a = this.angle();
    return { x: Math.cos(a), z: Math.sin(a) };
  }
}
