/**
 * Enemy instances: a thin runtime wrapper around a data row plus per-instance
 * state. Behaviour lives in ../ai/behaviors.js.
 */
import { getEnemy } from '../../data/enemies.js';
import { creatureArt } from '../../data/creature-art.js';
import { getBehavior, chaseDecoy } from '../ai/behaviors.js';
import { C } from '../constants.js';
import { cellAtWorld } from '../world/collision.js';

let nextId = 1;

export function createEnemy(id, x, z, opts = {}) {
  const def = getEnemy(id);
  const art = creatureArt(def.art);
  const hpScale = opts.hpScale == null ? 1 : opts.hpScale;
  const maxHp = Math.max(1, Math.round(def.hp * hpScale));
  const scale = opts.scale || 1;

  return {
    uid: nextId++,
    id,
    def,
    name: def.name,
    art: def.art,
    artDef: art,
    tint: art.glow,

    x, z,
    y: def.flying ? 0.6 : 0,
    px: x,
    pz: z,
    vx: 0,
    vz: 0,
    yaw: 0,
    bob: 0,
    scale,
    baseScale: scale,
    radius: def.radius * scale,
    height: def.height * scale,

    hp: maxHp,
    maxHp,
    armor: def.armor || 0,
    touch: def.touch || 1,
    speed: def.speed,
    flying: !!def.flying,
    elite: !!def.elite,
    lavaImmune: !!def.lavaImmune,
    isBoss: false,

    alive: true,
    dying: 0,
    dyingMax: 0.5,
    t: 0,
    flash: 0,
    telegraph: 0,
    invulnerable: false,
    hidden: false,
    disguised: false,
    watched: false,
    aggro: 0,
    marked: false,

    // status
    burn: 0,
    burnDps: 0,
    poison: 0,
    poisonDps: 0,
    frozen: 0,
    stun: 0,
    slow: 0,
    noRegenT: 0,
    shieldAngle: 0,
    shieldArc: 0,

    contactCd: 0,
    stepCd: 0,

    behavior: getBehavior(def.behavior),
    ai: {
      state: 'idle',
      state2: 'idle',
      stateT: 0,
      shotCd: 0.6 + Math.random() * 1.2,
      warnT: 0,
      warnMax: 0.3,
      spiralLeft: 0,
      spiralT: 0,
      spiralAngle: 0,
      wanderT: 0,
      wx: 0,
      wz: 1,
      turnT: 0,
      burstT: 0,
      orbitA: Math.random() * Math.PI * 2,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      strikeT: 1 + Math.random(),
      windT: 0,
      dashT: 0,
      chargeT: 0,
      spawnT: 2 + Math.random() * 2,
      phaseT: 2,
      fuseT: 0,
      slashT: 1,
      loseT: 0,
      alertCd: 0,
      lastSeenX: x,
      lastSeenZ: z,
      under: false,
      warn: 0,
      marks: null,
      markT: 0,
      revealed: false,
      decoy: null,
    },

    fromSpawn: !!opts.fromSpawn,
    light: def.light ? { ...def.light, x, y: 1, z, flicker: 0, phase: 0 } : null,
  };
}

/** Status effects shared by everything alive. */
export function updateStatus(game, e, dt) {
  if (e.flash > 0) e.flash -= dt;
  if (e.stun > 0) e.stun -= dt;
  if (e.frozen > 0) e.frozen -= dt;
  if (e.slow > 0) e.slow -= dt;
  if (e.noRegenT > 0) e.noRegenT -= dt;
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.telegraph > 0) e.telegraph = Math.max(0, e.telegraph - dt * 0.5);

  if (e.burn > 0) {
    e.burn -= dt;
    e.burnAccum = (e.burnAccum || 0) + e.burnDps * dt;
    if (e.burnAccum >= 1) {
      const n = Math.floor(e.burnAccum);
      e.burnAccum -= n;
      game.damageEnemy(e, n, { source: 'burn', silent: true, trueDamage: true });
    }
    if (game.rng.chance(dt * 7)) {
      game.fx('ember', { x: e.x + game.rng.range(-0.3, 0.3), y: e.y + 0.6, z: e.z, color: [1, 0.5, 0.15] });
    }
  }
  if (e.poison > 0) {
    e.poison -= dt;
    e.poisonAccum = (e.poisonAccum || 0) + e.poisonDps * dt;
    if (e.poisonAccum >= 1) {
      const n = Math.floor(e.poisonAccum);
      e.poisonAccum -= n;
      game.damageEnemy(e, n, { source: 'poison', silent: true, trueDamage: true });
    }
  }

  // Standing in the floor's hazard hurts monsters too, unless they live in it.
  if (!e.flying && !e.lavaImmune) {
    const cell = cellAtWorld(game.dungeon.cells, e.x, e.z);
    if (cell === C.HAZARD) {
      const dps = (game.floorDef.hazard && game.floorDef.hazard.enemyDps) || 8;
      e.hazardAccum = (e.hazardAccum || 0) + dt * dps;
      if (e.hazardAccum >= 1) {
        const n = Math.floor(e.hazardAccum);
        e.hazardAccum -= n;
        game.damageEnemy(e, n, { source: 'hazard', silent: true, trueDamage: true });
      }
    } else {
      e.hazardAccum = 0;
    }
  }
}

export function updateEnemy(game, e, dt) {
  e.px = e.x;
  e.pz = e.z;
  e.t += dt;
  updateStatus(game, e, dt);
  if (!e.alive) return;

  if (e.frozen > 0 || e.stun > 0) {
    const f = Math.pow(0.02, dt);
    e.vx *= f;
    e.vz *= f;
    return;
  }

  const slowMul = e.slow > 0 ? 0.5 : 1;
  const backup = e.speed;
  e.speed *= slowMul;
  if (!e.ai.decoy || !chaseDecoy(game, e, dt)) e.behavior(game, e, dt);
  e.speed = backup;

  // Flyers hover; walkers hug the floor.
  if (e.flying) {
    e.y = 0.6 + Math.sin(e.t * 1.7) * 0.12;
  } else {
    e.y = 0;
  }

  if (e.light) {
    e.light.x = e.x;
    e.light.y = e.y + e.height * 0.6;
    e.light.z = e.z;
  }

  // Footstep audio makes unseen monsters legible; it is the main tell in fog.
  if (!e.flying && e.ai.state === 'hunt') {
    e.stepCd -= dt * Math.hypot(e.vx, e.vz);
    if (e.stepCd <= 0) {
      e.stepCd = 1.6;
      game.sfx('stepEnemy', { x: e.x, y: e.y, z: e.z, gain: 0.5 });
    }
  }
}
