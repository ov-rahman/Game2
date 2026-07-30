/**
 * Projectile pool.
 *
 * Shots are the highest-churn objects in the game, so they are pooled and reset
 * in place: no allocation during a firefight, which is what keeps frame times
 * flat when a boss fills the room with bullets.
 */
import { TEAM } from '../constants.js';
import { SPRITE } from '../../data/sprite-ids.js';

function makeShot() {
  return {
    active: false,
    team: TEAM.PLAYER,
    x: 0, y: 0, z: 0,
    px: 0, py: 0, pz: 0,
    vx: 0, vy: 0, vz: 0,
    speed: 0,
    radius: 0.16,
    size: 0.16,
    damage: 1,
    life: 1,
    maxLife: 1,
    age: 0,
    gravity: 0,

    // modifiers
    pierce: 0,
    bounce: 0,
    explosive: 0,
    splitOnHit: 0,
    chain: 0,
    homing: 0,
    gravityPull: 0,   // drags nearby enemies toward the shot and its impact
    blackhole: false,
    burn: 0,
    freeze: 0,
    poison: 0,
    shock: 0,
    knockback: 0,
    crit: false,

    // named-synergy behaviour
    napalm: false,
    shatter: false,
    plague: false,
    spreadBurn: false,
    lightRadius: 0,

    sprite: SPRITE.DOT,
    r: 1, g: 1, b: 1,
    owner: null,
    hitIds: null,
    kind: null,
  };
}

export class ShotPool {
  constructor(cap = 420) {
    this.items = new Array(cap);
    for (let i = 0; i < cap; i++) this.items[i] = makeShot();
    this.cap = cap;
    this.count = 0;
    this.cursor = 0;
  }

  acquire() {
    const items = this.items;
    for (let i = 0; i < this.cap; i++) {
      const idx = (this.cursor + i) % this.cap;
      const s = items[idx];
      if (s.active) continue;
      reset(s);
      s.active = true;
      this.cursor = (idx + 1) % this.cap;
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
    for (let i = 0; i < this.cap; i++) {
      const s = this.items[i];
      if (s.active) fn(s);
    }
  }
}

function reset(s) {
  s.team = TEAM.PLAYER;
  s.x = s.y = s.z = 0;
  s.px = s.py = s.pz = 0;
  s.vx = s.vy = s.vz = 0;
  s.speed = 0;
  s.radius = 0.16;
  s.size = 0.16;
  s.damage = 1;
  s.life = s.maxLife = 1;
  s.age = 0;
  s.gravity = 0;
  s.pierce = 0;
  s.bounce = 0;
  s.explosive = 0;
  s.splitOnHit = 0;
  s.chain = 0;
  s.homing = 0;
  s.gravityPull = 0;
  s.blackhole = false;
  s.burn = 0;
  s.freeze = 0;
  s.poison = 0;
  s.shock = 0;
  s.knockback = 0;
  s.crit = false;
  s.napalm = false;
  s.shatter = false;
  s.plague = false;
  s.spreadBurn = false;
  s.lightRadius = 0;
  s.sprite = SPRITE.DOT;
  s.r = s.g = s.b = 1;
  s.owner = null;
  s.hitIds = null;
  s.kind = null;
}
