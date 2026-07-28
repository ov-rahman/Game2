/**
 * Projectile pool.
 *
 * Shots are the highest-churn objects in the game, so they are pooled and reset
 * in place: zero allocation during a fight, which is what keeps frame times flat
 * on integrated graphics.
 */
import { TEAM } from '../constants.js';

export function makeShot() {
  return {
    active: false,
    team: TEAM.PLAYER,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    speed: 0,
    radius: 4,
    damage: 1,
    life: 1,
    maxLife: 1,
    age: 0,

    // modifiers
    pierce: 0,
    bounce: 0,
    spectral: 0,
    explosive: 0,
    splitOnHit: 0,
    chain: 0,
    homing: 0,
    gravity: 0,
    burn: 0,
    freeze: 0,
    poison: 0,
    shock: 0,
    knockback: 0,
    crit: false,

    // special behaviours set by items and synergies
    boomerang: false,
    orbitReturn: false,
    napalm: false,
    shatter: false,
    plague: false,
    spreadBurn: false,
    frostbomb: false,
    blackhole: false,
    starfall: false,
    breath: false,
    prismBeam: false,
    arc: 0,
    puddle: null,

    style: 'basic',
    color: '#ffffff',
    kind: null,
    owner: null,
    hitIds: null,
    depth: 0,
    wobble: 0,
    scaleT: 0,
  };
}

export class ShotPool {
  constructor(cap = 512) {
    this.items = new Array(cap);
    for (let i = 0; i < cap; i++) this.items[i] = makeShot();
    this.cap = cap;
    this.count = 0;
  }

  /** Grab a reset shot, or null when the pool is saturated. */
  acquire() {
    const items = this.items;
    for (let i = 0; i < this.cap; i++) {
      const s = items[i];
      if (s.active) continue;
      reset(s);
      s.active = true;
      this.count++;
      return s;
    }
    return null;
  }

  release(s) {
    if (!s.active) return;
    s.active = false;
    s.hitIds = null;
    s.owner = null;
    this.count--;
  }

  clear() {
    for (const s of this.items) {
      s.active = false;
      s.hitIds = null;
      s.owner = null;
    }
    this.count = 0;
  }

  forEach(fn) {
    const items = this.items;
    for (let i = 0; i < this.cap; i++) {
      const s = items[i];
      if (s.active) fn(s, i);
    }
  }
}

function reset(s) {
  s.team = TEAM.PLAYER;
  s.x = s.y = s.px = s.py = 0;
  s.vx = s.vy = 0;
  s.angle = 0;
  s.speed = 0;
  s.radius = 4;
  s.damage = 1;
  s.life = 1;
  s.maxLife = 1;
  s.age = 0;
  s.pierce = 0;
  s.bounce = 0;
  s.spectral = 0;
  s.explosive = 0;
  s.splitOnHit = 0;
  s.chain = 0;
  s.homing = 0;
  s.gravity = 0;
  s.burn = 0;
  s.freeze = 0;
  s.poison = 0;
  s.shock = 0;
  s.knockback = 0;
  s.crit = false;
  s.boomerang = false;
  s.orbitReturn = false;
  s.napalm = false;
  s.shatter = false;
  s.plague = false;
  s.spreadBurn = false;
  s.frostbomb = false;
  s.blackhole = false;
  s.starfall = false;
  s.breath = false;
  s.prismBeam = false;
  s.arc = 0;
  s.puddle = null;
  s.style = 'basic';
  s.color = '#ffffff';
  s.kind = null;
  s.owner = null;
  s.hitIds = null;
  s.depth = 0;
  s.wobble = 0;
  s.scaleT = 0;
}
