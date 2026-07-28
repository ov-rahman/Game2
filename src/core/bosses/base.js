/**
 * Shared boss scaffolding.
 *
 * Bosses are enemies with `isBoss`, a phase machine and a scripted attack list.
 * The helpers here cover what every boss needs — moving to a point, telegraphing
 * and firing patterns — so each boss file contains only its own choreography.
 */
import { TEAM, CELL } from '../constants.js';
import { creatureArt } from '../../data/creature-art.js';
import { getBehavior } from '../ai/behaviors.js';
import { moveBody } from '../world/collision.js';
import { clamp, angleDelta } from '../math3.js';
import { SPRITE } from '../../data/sprite-ids.js';

let bossUid = 900000;

export function makeBoss(cfg) {
  const art = creatureArt(cfg.art);
  return {
    uid: bossUid++,
    id: cfg.id,
    isBoss: true,
    name: cfg.name,
    title: cfg.title || '',
    art: cfg.art,
    artDef: art,
    tint: art.glow,
    def: { shoot: null, params: {}, sight: 999, hear: 999 },

    x: cfg.x,
    z: cfg.z,
    y: cfg.flying ? 1.2 : 0,
    px: cfg.x,
    pz: cfg.z,
    vx: 0,
    vz: 0,
    yaw: 0,
    bob: 0,
    scale: cfg.scale || 1,
    baseScale: cfg.scale || 1,
    radius: cfg.radius,
    height: art.height * (cfg.scale || 1),

    hp: cfg.hp,
    maxHp: cfg.hp,
    armor: cfg.armor || 0,
    touch: cfg.touch || 3,
    speed: cfg.speed || 3,
    flying: !!cfg.flying,
    elite: true,
    lavaImmune: true,

    alive: true,
    dying: 0,
    dyingMax: 1.6,
    t: 0,
    flash: 0,
    telegraph: 0,
    invulnerable: false,
    hidden: false,
    disguised: false,
    aggro: 1,
    watched: false,
    marked: false,

    burn: 0, burnDps: 0, poison: 0, poisonDps: 0,
    frozen: 0, stun: 0, slow: 0, noRegenT: 0,
    shieldAngle: 0, shieldArc: 0,
    contactCd: 0, stepCd: 0,

    phase: 1,
    phaseThresholds: cfg.phaseThresholds || [0.66, 0.33],
    attack: null,
    attackT: 0,
    cd: 1.4,
    ai: { state: 'hunt', orbitDir: 1, spiralLeft: 0, telegraph: 0 },
    mem: {},

    update: cfg.update,
    onPhase: cfg.onPhase || null,
    light: cfg.light || {
      x: cfg.x,
      y: 1.5,
      z: cfg.z,
      r: art.glow[0], g: art.glow[1], b: art.glow[2],
      radius: 12, intensity: 1.4, flicker: 0, phase: 0,
    },
  };
}

/** Advance the phase machine; returns true on the tick a phase changes. */
export function checkPhase(game, b) {
  const frac = b.hp / b.maxHp;
  const want = 1 + b.phaseThresholds.filter((t) => frac <= t).length;
  if (want !== b.phase) {
    b.phase = want;
    b.attack = null;
    b.cd = 1.0;
    game.sfx('bossRoar', { x: b.x, y: b.y + 2, z: b.z, gain: 0.9, rate: 1 + (want - 1) * 0.1 });
    game.shake(1.4, 0.6, 0.5);
    game.fx('spawn', { x: b.x, y: b.y + 1.5, z: b.z, color: b.tint });
    if (b.onPhase) b.onPhase(game, b, want);
    return true;
  }
  return false;
}

export function toPlayer(game, b) {
  const p = game.player;
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const d = Math.hypot(dx, dz) || 1;
  return { dx, dz, d, nx: dx / d, nz: dz / d, p };
}

/** Move toward a target point, sliding along walls. Returns distance left. */
export function moveToward(game, b, tx, tz, speed, dt) {
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05) {
    moveBody(game.dungeon.cells, b, (dx / d) * speed * dt, (dz / d) * speed * dt, { flying: b.flying });
    b.yaw += angleDelta(b.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
  }
  return d;
}

export function faceTarget(b, t, dt, rate = 4) {
  b.yaw += angleDelta(b.yaw, Math.atan2(t.dx, t.dz)) * Math.min(1, dt * rate);
}

/** Fire one boss projectile along a compass angle. */
export function bullet(game, b, angle, opts = {}) {
  const s = game.spawnShot(TEAM.ENEMY);
  if (!s) return null;
  const y = opts.y != null ? opts.y : b.y + b.height * 0.55;
  s.x = s.px = b.x + Math.sin(angle) * (b.radius + 0.3);
  s.y = s.py = y;
  s.z = s.pz = b.z + Math.cos(angle) * (b.radius + 0.3);
  const speed = opts.speed || 14;
  s.speed = speed;
  s.vx = Math.sin(angle) * speed;
  s.vy = opts.vy || 0;
  s.vz = Math.cos(angle) * speed;
  s.damage = opts.damage || 2;
  s.radius = opts.radius || 0.26;
  s.size = s.radius * 2.1;
  s.life = s.maxLife = opts.life || 5;
  s.burn = opts.burn || 0;
  s.gravity = opts.gravity || 0;
  s.homing = opts.homing || 0;
  s.bounce = opts.bounce || 0;
  s.sprite = opts.sprite == null ? SPRITE.DOT : opts.sprite;
  const c = opts.color || b.tint;
  s.r = c[0];
  s.g = c[1];
  s.b = c[2];
  s.lightRadius = 4;
  s.owner = b;
  return s;
}

export function radial(game, b, count, opts = {}) {
  const off = opts.offset || 0;
  for (let i = 0; i < count; i++) bullet(game, b, off + (i / count) * Math.PI * 2, opts);
  game.sfx('enemyShoot', { x: b.x, y: b.y + 1, z: b.z, gain: 0.8 });
}

export function fan(game, b, angle, count, spread, opts = {}) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    bullet(game, b, angle + t * spread, opts);
  }
  game.sfx('enemyShoot', { x: b.x, y: b.y + 1, z: b.z, gain: 0.8 });
}

export function chooseAttack(game, b, list) {
  const options = list.filter((a) => a !== b.mem.lastAttack);
  const pick = game.rng.pick(options.length ? options : list);
  b.mem.lastAttack = pick;
  b.attack = pick;
  b.attackT = 0;
  return pick;
}

export function endAttack(b, cd) {
  b.attack = null;
  b.attackT = 0;
  b.telegraph = 0;
  b.invulnerable = false;
  b.hidden = false;
  b.cd = cd;
}

/** Mark the ground and detonate after a delay — the universal boss "tell". */
export function groundStrike(game, b, x, z, radius, damage, delay, color) {
  game.fx('telegraph', { x, y: 0.1, z, radius, time: delay, color: color || b.tint });
  game.pendingStrikes.push({ x, z, radius, damage, t: delay, color: color || b.tint });
}
