/**
 * Enemy instances.
 *
 * An enemy is a thin runtime wrapper around its data row plus per-instance
 * state (health, status effects, AI scratch). Behaviour lives in ../ai.
 */
import { getEnemy } from '../../data/enemies.js';
import { creatureArt } from '../../data/creature-art.js';
import { getBehavior } from '../ai/behaviors.js';
import { hazardAt } from '../world/collision.js';
import { clamp } from '../math.js';

let nextId = 1;

export function createEnemy(id, x, y, opts = {}) {
  const def = getEnemy(id);
  const art = creatureArt(def.sprite);
  const hpScale = opts.hpScale == null ? 1 : opts.hpScale;
  const maxHp = Math.max(1, Math.round(def.hp * hpScale));

  return {
    kind: 'enemy',
    uid: nextId++,
    id,
    def,
    name: def.name,
    sprite: def.sprite,
    tint: art.body,
    art,

    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    speed: def.speed * (opts.speedScale || 1),
    facing: 1,

    hp: maxHp,
    maxHp,
    armor: def.armor || 0,
    touch: def.touch || 1,
    flying: !!def.flying,
    elite: !!def.elite,
    lavaImmune: !!def.lavaImmune,
    knockbackResist: def.knockbackResist || 0,

    alive: true,
    dying: 0,
    t: 0,
    seedPhase: opts.phase || 0,
    flash: 0,
    alpha: 1,
    invulnerable: false,
    hidden: false,
    disguised: false,
    squashT: 0,
    spin: 0,
    wingPhase: 0,
    bounceWalls: false,

    // status effects
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
    noRegenT: 0,

    behavior: getBehavior(def.behavior),
    ai: {
      state: 'idle',
      stateT: 0,
      shotCd: 0.6 + Math.random() * 0.8,
      warnT: 0,
      warnMax: 0.3,
      hopT: 0.2,
      hopping: 0,
      turnT: 0,
      driftT: 0,
      blinkT: 1.2,
      fadeT: 0,
      spawnT: 1.5,
      phaseT: 1.5,
      strikeT: 1.2,
      dashT: 0,
      beamT: 1.5,
      pounceT: 0,
      pounceCd: 0,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      orbitA: 0,
      spiralLeft: 0,
      spiralT: 0,
      spiralAngle: 0,
      telegraph: 0,
      dirX: 0,
      dirY: 0,
      burstT: 0,
      init: false,
    },

    fromSplit: !!opts.fromSplit,
    dropChanceMul: opts.dropChanceMul == null ? 1 : opts.dropChanceMul,
  };
}

/** Per-tick status effect processing shared by all enemies. */
export function updateEnemyStatus(game, e, dt) {
  if (e.flash > 0) e.flash -= dt;
  if (e.stun > 0) e.stun -= dt;
  if (e.frozen > 0) e.frozen -= dt;
  if (e.shocked > 0) e.shocked -= dt;
  if (e.slow > 0) e.slow -= dt;
  if (e.noRegenT > 0) e.noRegenT -= dt;

  if (e.burn > 0) {
    e.burn -= dt;
    e.burnAccum = (e.burnAccum || 0) + e.burnDps * dt;
    if (e.burnAccum >= 1) {
      const n = Math.floor(e.burnAccum);
      e.burnAccum -= n;
      game.damageEnemy(e, n, { source: 'burn', kind: 'fire', silent: true });
    }
    if (game.rng.chance(dt * 8)) game.fx('burn', { x: e.x, y: e.y });
  }
  if (e.poison > 0) {
    e.poison -= dt;
    e.poisonAccum = (e.poisonAccum || 0) + e.poisonDps * dt;
    if (e.poisonAccum >= 1) {
      const n = Math.floor(e.poisonAccum);
      e.poisonAccum -= n;
      game.damageEnemy(e, n, { source: 'poison', kind: 'poison', silent: true });
    }
    if (game.rng.chance(dt * 5)) game.fx('poison', { x: e.x, y: e.y });
  }

  // Standing in a hazard tile hurts non-immune ground enemies too.
  if (!e.flying && !e.lavaImmune && hazardAt(game.room.tiles, e.x, e.y)) {
    e.hazardAccum = (e.hazardAccum || 0) + dt * 3;
    if (e.hazardAccum >= 1) {
      e.hazardAccum = 0;
      game.damageEnemy(e, 2, { source: 'hazard', kind: 'true', silent: true });
    }
  }
}

/** Advance one enemy: status, AI, knockback decay. */
export function updateEnemy(game, e, dt) {
  e.px = e.x;
  e.py = e.y;
  e.t += dt;
  updateEnemyStatus(game, e, dt);

  if (!e.alive) return;

  const frozen = e.frozen > 0;
  const stunned = e.stun > 0;
  if (frozen || stunned) {
    // Still slides from knockback, but takes no actions.
    e.vx *= Math.pow(0.02, dt);
    e.vy *= Math.pow(0.02, dt);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = clamp(e.x, 12, game.roomPxW - 12);
    e.y = clamp(e.y, 12, game.roomPxH - 12);
    return;
  }

  const slowMul = e.slow > 0 ? 0.5 : 1;
  const speedBackup = e.speed;
  e.speed *= slowMul;
  e.behavior(game, e, dt);
  e.speed = speedBackup;
}
