/**
 * First-person player: movement, look, stamina, torch, weapon heat.
 *
 * Reads only the neutral InputSnapshot, so the same code runs under mouse,
 * gamepad, or synthetic input from the test harness.
 */
import { PLAYER, CELL, C, TEAM } from '../constants.js';
import { createInventory, recomputeStats, runHook, useActive } from '../items/inventory.js';
import { fireVolley } from '../items/shots.js';
import { moveBody, cellAtWorld } from '../world/collision.js';
import { clamp, lerp, dist2d } from '../math3.js';

const MAX_PITCH = Math.PI / 2 - 0.06;

export function createPlayer(x, z) {
  return {
    x,
    z,
    y: 0,
    px: x,
    pz: z,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    radius: PLAYER.radius,
    height: PLAYER.height,
    eyeHeight: PLAYER.eye,
    targetEye: PLAYER.eye,

    hp: 6,
    shield: 0,
    invuln: 0,
    dead: false,
    hurtFlash: 0,

    coins: 0,
    heat: 0,
    overheated: false,
    shootCd: 0,
    spread: 0,
    echoQueue: [],

    stamina: PLAYER.stamina,
    sprinting: false,
    crouching: false,
    bobPhase: 0,
    bobAmount: 0,
    stepPhase: 0,
    noise: 1, // multiplier on how far monsters hear the player

    inv: createInventory(),
    stats: null,
    flags: Object.create(null),
    counters: Object.create(null),
    timers: Object.create(null),
    statsDirty: true,

    wardUsed: false,
    reviveUsed: false,
    orbitals: [],
    markedUid: 0,

    recoil: 0,
    kickY: 0,
  };
}

const TIMER_KEYS = ['adrenaline', 'harvest', 'chaos', 'overload'];

export function updatePlayer(game, p, dt, input) {
  p.px = p.x;
  p.pz = p.z;

  for (const k of TIMER_KEYS) {
    if (p.timers[k] > 0) {
      p.timers[k] -= dt;
      if (p.timers[k] <= 0) {
        p.timers[k] = 0;
        p.statsDirty = true;
      }
    }
  }
  if (p.statsDirty) recomputeStats(game, p);
  const st = p.stats;

  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt * 2.6;
  if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 6);

  // ---- look ------------------------------------------------------------
  p.yaw -= input.look.dx;
  p.pitch = clamp(p.pitch + input.look.dy, -MAX_PITCH, MAX_PITCH);
  while (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
  while (p.yaw < -Math.PI) p.yaw += Math.PI * 2;

  // ---- movement --------------------------------------------------------
  const wantSprint = input.down.sprint && p.stamina > 0.15 && input.move.z < 0;
  const wantCrouch = input.down.crouch;
  p.crouching = wantCrouch;
  p.sprinting = wantSprint && !wantCrouch;

  const baseSpeed = wantCrouch ? PLAYER.crouch : p.sprinting ? PLAYER.sprint : PLAYER.walk;
  const speed = baseSpeed * st.moveSpeed;

  if (p.sprinting) {
    p.stamina -= dt * (p.flags.stamina ? 0.62 : 1);
    if (p.stamina <= 0) p.stamina = 0;
  } else {
    p.stamina = Math.min(PLAYER.stamina, p.stamina + dt * PLAYER.staminaRegen * (p.flags.stamina ? 1.6 : 1));
  }

  // Camera-relative movement: forward is -Z in view space.
  const sinY = Math.sin(p.yaw);
  const cosY = Math.cos(p.yaw);
  const fx = sinY;
  const fz = cosY;
  // Same right vector the camera uses: cross(forward, worldUp).
  const rx = -cosY;
  const rz = sinY;
  const wishX = fx * -input.move.z + rx * input.move.x;
  const wishZ = fz * -input.move.z + rz * input.move.x;
  const wl = Math.hypot(wishX, wishZ);
  const dirX = wl > 0.001 ? wishX / wl : 0;
  const dirZ = wl > 0.001 ? wishZ / wl : 0;
  const moving = wl > 0.001;

  const accel = moving ? PLAYER.accel : PLAYER.friction * 2;
  p.vx += (dirX * speed - p.vx) * Math.min(1, accel * dt * 0.32);
  p.vz += (dirZ * speed - p.vz) * Math.min(1, accel * dt * 0.32);
  if (Math.abs(p.vx) < 0.02) p.vx = 0;
  if (Math.abs(p.vz) < 0.02) p.vz = 0;

  moveBody(game.dungeon.cells, p, p.vx * dt, p.vz * dt, {});

  // ---- head bob and eye height ----------------------------------------
  const moveSpeedNow = Math.hypot(p.vx, p.vz);
  p.bobPhase += dt * moveSpeedNow * 1.9;
  p.bobAmount = lerp(p.bobAmount, moving ? (p.sprinting ? 0.055 : 0.032) : 0, Math.min(1, dt * 8));
  p.targetEye = wantCrouch ? PLAYER.crouchEye : PLAYER.eye;
  p.eyeHeight = lerp(p.eyeHeight, p.targetEye, Math.min(1, dt * 12));

  // Footsteps: audible to monsters as well as to the player.
  p.stepPhase += moveSpeedNow * dt;
  if (p.stepPhase > (p.sprinting ? 1.5 : 2.1)) {
    p.stepPhase = 0;
    game.sfx('step', { x: p.x, y: p.y, z: p.z, gain: p.crouching ? 0.25 : 0.6 });
  }

  // How loud the player currently is — the core of the stealth layer.
  p.noise = p.crouching ? 0.35 : p.sprinting ? 1.55 : 1;
  if (p.shootCd > 0.02) p.noise = Math.max(p.noise, 1.9);

  // ---- weapon ----------------------------------------------------------
  if (p.shootCd > 0) p.shootCd -= dt;
  const cooling = st.heatCooling * (p.overheated ? 1.35 : 1);
  p.heat = Math.max(0, p.heat - cooling * dt);
  if (p.overheated && p.heat <= 0.05) p.overheated = false;
  p.spread = lerp(p.spread, moving ? 0.35 : 0.12, Math.min(1, dt * 6)) + p.recoil * 0.5;

  const canShoot = !p.dead && !p.overheated;
  if (input.down.fire && canShoot && p.shootCd <= 0) {
    const dir = aimDirection(p);
    fireVolley(game, p, dir.x, dir.y, dir.z);
    p.shootCd = 1 / st.fireRate;
    if (!p.timers.overload && !p.flags.noHeat) {
      p.heat += st.heatPerShot;
      if (p.heat >= 1) {
        p.heat = 1;
        p.overheated = true;
        game.sfx('deny', { gain: 0.7 });
      }
    }
    p.recoil = Math.min(0.5, p.recoil + 0.14);
    p.kickY = 0.05;
    game.sfx('shoot', { gain: 0.9 });
    game.fx('muzzle', {
      x: p.x + dir.x * 0.8,
      y: p.y + p.eyeHeight - 0.15 + dir.y * 0.8,
      z: p.z + dir.z * 0.8,
    });
    game.alertNearby(p.x, p.z, 14);
  }

  for (let i = p.echoQueue.length - 1; i >= 0; i--) {
    const q = p.echoQueue[i];
    q.t -= dt;
    if (q.t <= 0) {
      fireVolley(game, p, q.x, q.y, q.z, { damageMul: 0.85 });
      p.echoQueue.splice(i, 1);
    }
  }

  if (p.kickY > 0) p.kickY = Math.max(0, p.kickY - dt * 0.35);

  // ---- actions ---------------------------------------------------------
  if (input.pressed.torch) game.toggleTorch();
  if (input.pressed.use) {
    if (useActive(game, p)) game.sfx('confirm');
    else game.sfx('deny');
  }

  // ---- hazards ---------------------------------------------------------
  const cell = cellAtWorld(game.dungeon.cells, p.x, p.z);
  if (cell === C.HAZARD && !p.flags.fireImmune) {
    // Crossing two tiles of lava has to cost something without being lethal:
    // one point every half second is a real decision, not an instant death.
    p.hazardAccum = (p.hazardAccum || 0) + dt;
    if (p.hazardAccum > 0.5) {
      p.hazardAccum = 0;
      game.damagePlayer(1, { source: 'hazard', ignoreInvuln: true });
    }
  } else {
    p.hazardAccum = 0;
  }

  runHook(p, 'onUpdate', { game, player: p, dt });
  updateOrbitals(game, p, dt);
}

/** Unit forward vector from yaw/pitch. */
export function aimDirection(p) {
  const cp = Math.cos(p.pitch);
  return {
    x: Math.sin(p.yaw) * cp,
    y: -Math.sin(p.pitch),
    z: Math.cos(p.yaw) * cp,
  };
}

function updateOrbitals(game, p, dt) {
  const want = p.flags.orbitals || 0;
  while (p.orbitals.length < want) {
    p.orbitals.push({ a: (p.orbitals.length / Math.max(1, want)) * Math.PI * 2, hitT: 0, x: p.x, y: 1, z: p.z });
  }
  while (p.orbitals.length > want) p.orbitals.pop();

  const speed = p.flags.fastOrbit ? 4.6 : 2.8;
  for (const o of p.orbitals) {
    o.a += dt * speed;
    o.x = p.x + Math.cos(o.a) * 1.5;
    o.y = p.y + 1.0 + Math.sin(o.a * 2) * 0.15;
    o.z = p.z + Math.sin(o.a) * 1.5;
    if (o.hitT > 0) {
      o.hitT -= dt;
      continue;
    }
    if (game.damageEnemiesNear(o.x, o.z, 0.7, 5 + p.stats.damage * 0.7, 'orbital')) {
      o.hitT = 0.3;
    }
  }
}
