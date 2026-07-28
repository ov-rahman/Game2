/**
 * Shared boss scaffolding.
 *
 * Bosses are enemies with `isBoss`, a phase machine and a scripted attack list.
 * The helpers here cover what every boss needs — moving to a point, telegraphing,
 * and firing patterns — so each boss file only contains its own choreography.
 */
import { TILE, ROOM_W, ROOM_H, TEAM } from '../constants.js';
import { creatureArt } from '../../data/creature-art.js';
import { clamp, norm } from '../math.js';

export const ARENA = {
  minX: TILE * 1.6,
  minY: TILE * 1.6,
  maxX: ROOM_W * TILE - TILE * 1.6,
  maxY: ROOM_H * TILE - TILE * 1.6,
  cx: (ROOM_W * TILE) / 2,
  cy: (ROOM_H * TILE) / 2,
};

let bossUid = 90000;

export function makeBoss(cfg) {
  const art = creatureArt(cfg.sprite);
  return {
    kind: 'enemy',
    isBoss: true,
    uid: bossUid++,
    id: cfg.id,
    name: cfg.name,
    title: cfg.title || '',
    sprite: cfg.sprite,
    art,
    tint: art.body,
    def: { shoot: null, params: {}, behavior: 'boss' },

    x: cfg.x,
    y: cfg.y,
    px: cfg.x,
    py: cfg.y,
    vx: 0,
    vy: 0,
    radius: cfg.radius,
    speed: cfg.speed || 50,
    facing: 1,

    hp: cfg.hp,
    maxHp: cfg.hp,
    armor: cfg.armor || 0,
    touch: cfg.touch || 2,
    flying: !!cfg.flying,
    elite: true,
    knockbackResist: 1,
    lavaImmune: true,

    alive: true,
    dying: 0,
    t: 0,
    flash: 0,
    alpha: 1,
    invulnerable: false,
    hidden: false,
    disguised: false,
    squashT: 0,
    spin: 0,
    wingPhase: 0,
    seedPhase: 0,

    burn: 0,
    burnDps: 0,
    poison: 0,
    poisonDps: 0,
    frozen: 0,
    shocked: 0,
    stun: 0,
    slow: 0,
    shieldAngle: 0,
    shieldArc: 0,

    phase: 1,
    phaseThresholds: cfg.phaseThresholds || [0.65, 0.33],
    attack: null,
    attackT: 0,
    cd: 1.2,
    ai: { telegraph: 0, state: 'idle', stateT: 0, orbitDir: 1, spiralLeft: 0 },
    mem: {},

    update: cfg.update,
    onPhase: cfg.onPhase || null,
    dropChanceMul: 0,
    fromSplit: false,
  };
}

/** Advance the phase machine; returns true on the tick a phase changes. */
export function checkPhase(game, b) {
  const frac = b.hp / b.maxHp;
  const want = 1 + b.phaseThresholds.filter((t) => frac <= t).length;
  if (want !== b.phase) {
    b.phase = want;
    b.attack = null;
    b.cd = 0.9;
    game.sfx('bossRoar', { gain: 0.7, rate: 1 + (want - 1) * 0.12 });
    game.shake(8, 0.5);
    game.fx('phaseShift', { x: b.x, y: b.y, color: b.tint });
    if (b.onPhase) b.onPhase(game, b, want);
    return true;
  }
  return false;
}

export function clampToArena(b) {
  b.x = clamp(b.x, ARENA.minX, ARENA.maxX);
  b.y = clamp(b.y, ARENA.minY, ARENA.maxY);
}

/** Smoothly move toward a target point. Returns distance remaining. */
export function moveToward(b, tx, ty, speed, dt) {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    b.x += (dx / d) * Math.min(speed * dt, d);
    b.y += (dy / d) * Math.min(speed * dt, d);
  }
  b.facing = dx > 0 ? 1 : dx < 0 ? -1 : b.facing;
  clampToArena(b);
  return d;
}

export function aimAt(b, target) {
  return Math.atan2(target.y - b.y, target.x - b.x);
}

/** Fire a single boss bullet. */
export function bullet(game, b, x, y, angle, opts = {}) {
  const s = game.spawnShot(TEAM.ENEMY);
  if (!s) return null;
  s.x = s.px = x;
  s.y = s.py = y;
  s.angle = angle;
  s.speed = opts.speed || 150;
  s.vx = Math.cos(angle) * s.speed;
  s.vy = Math.sin(angle) * s.speed;
  s.damage = opts.damage || 1;
  s.radius = opts.radius || 6;
  s.life = s.maxLife = opts.life || 4;
  s.color = opts.color || b.tint;
  s.style = opts.style || 'boss';
  s.burn = opts.burn || 0;
  s.homing = opts.homing || 0;
  s.bounce = opts.bounce || 0;
  s.owner = b;
  return s;
}

export function radial(game, b, count, opts = {}) {
  const off = opts.offset || 0;
  for (let i = 0; i < count; i++) {
    bullet(game, b, b.x, b.y, off + (i / count) * Math.PI * 2, opts);
  }
  game.sfx('enemyShoot', { gain: 0.6 });
}

export function fan(game, b, angle, count, spread, opts = {}) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    bullet(game, b, b.x, b.y, angle + t * spread, opts);
  }
  game.sfx('enemyShoot', { gain: 0.6 });
}

/** Choose the next attack from a weighted list, avoiding immediate repeats. */
export function chooseAttack(game, b, list) {
  const options = list.filter((a) => a !== b.mem.lastAttack);
  const pick = game.rng.pick(options.length ? options : list);
  b.mem.lastAttack = pick;
  b.attack = pick;
  b.attackT = 0;
  b.ai.stateT = 0;
  return pick;
}

export function telegraphAt(game, x, y, time, radius, color) {
  game.fx('telegraph', { x, y, time, radius, color });
  game.effects.push({ type: 'telegraph', x, y, t: 0, time, radius, color });
}
