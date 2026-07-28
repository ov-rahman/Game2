/**
 * The player shot pipeline.
 *
 * One place decides what a volley looks like, reading only aggregated stats and
 * flags. That is why arbitrary item combinations work: every modifier is a
 * number on the player, and the pipeline applies all of them in a fixed order.
 *
 *   directions -> per-direction spread -> base shot -> flags -> item hooks ->
 *   synergies -> echo
 */
import { TEAM } from '../constants.js';
import { runHook } from './inventory.js';

const HALF_PI = Math.PI / 2;

function shotDirections(player, angle) {
  const f = player.flags;
  if (f.octoShot) {
    const out = [];
    for (let i = 0; i < 8; i++) out.push(angle + (i / 8) * Math.PI * 2);
    return out;
  }
  const dirs = [angle];
  if (f.crossShot) {
    dirs.push(angle + HALF_PI, angle - HALF_PI, angle + Math.PI);
  } else if (f.backShot) {
    dirs.push(angle + Math.PI);
  }
  return dirs;
}

/**
 * Create one volley. Returns the array of live shots (already registered with
 * the game) so hooks and synergies can post-process them.
 */
export function fireVolley(game, player, angle, opts = {}) {
  const st = player.stats;
  const f = player.flags;
  const shots = [];
  const chargeMul = opts.charge || 1;

  const perDir = 1 + (f.multishot || 0);
  const spread = (f.spread || 0) + (perDir > 1 ? 0.22 : 0);
  const accuracyJitter = f.accuracy ? 0 : 0.018;

  for (const dir of shotDirections(player, angle)) {
    for (let i = 0; i < perDir; i++) {
      const t = perDir === 1 ? 0 : i / (perDir - 1) - 0.5;
      const a = dir + t * spread * 2 + game.rng.range(-accuracyJitter, accuracyJitter);
      const s = createPlayerShot(game, player, a, chargeMul);
      if (s) shots.push(s);
    }
  }

  if (!shots.length) return shots;

  const ctx = { game, player, shots, angle, charge: chargeMul };
  runHook(player, 'onShoot', ctx);
  for (const syn of player.inv.synergies) {
    if (syn.apply) syn.apply(ctx);
  }

  if (f.echo && game.rng.chance(Math.min(0.75, f.echo))) {
    player.echoQueue.push({ angle, t: 0.09, charge: chargeMul });
  }

  return shots;
}

export function createPlayerShot(game, player, angle, chargeMul = 1) {
  const s = game.spawnShot(TEAM.PLAYER);
  if (!s) return null;
  const st = player.stats;
  const f = player.flags;

  const crit = game.rng.chance(st.critChance + Math.max(0, st.luck) * 0.008);
  const dmg = st.damage * st.damageMult * chargeMul * (crit ? st.critMult : 1);

  s.x = s.px = player.x + Math.cos(angle) * (player.radius + 2);
  s.y = s.py = player.y + Math.sin(angle) * (player.radius + 2) - 4;
  s.angle = angle;
  s.speed = st.shotSpeed;
  s.vx = Math.cos(angle) * s.speed;
  s.vy = Math.sin(angle) * s.speed;
  s.damage = dmg;
  s.crit = crit;
  s.radius = st.shotSize * (chargeMul > 1 ? 1.7 : 1);
  s.life = s.maxLife = st.range * (chargeMul > 1 ? 1.5 : 1);
  s.knockback = st.knockback;

  s.pierce = f.pierce || 0;
  s.bounce = f.bounce || 0;
  s.spectral = f.spectral || 0;
  s.explosive = f.explosive || 0;
  s.splitOnHit = f.splitOnHit || 0;
  s.chain = f.chain || 0;
  s.homing = f.homing || 0;
  s.gravity = f.gravity || 0;
  s.burn = f.burn || 0;
  s.freeze = f.freeze || 0;
  s.poison = f.poison || 0;
  s.shock = f.shock || 0;
  s.boomerang = !!f.boomerang;
  s.owner = player;
  s.color = crit ? '#fff3b0' : shotColorFor(player);
  s.style = crit ? 'crit' : 'basic';
  return s;
}

function shotColorFor(player) {
  const f = player.flags;
  if (f.burn) return '#ff9d3c';
  if (f.freeze) return '#9fe6ff';
  if (f.poison) return '#8ede4a';
  if (f.shock) return '#ffe066';
  if (f.spectral) return '#cfe8ff';
  return '#ffffff';
}

/** Duplicate an existing shot (used by synergies such as Кровавая буря). */
export function cloneShot(game, src) {
  const s = game.spawnShot(src.team);
  if (!s) return null;
  for (const k in src) {
    if (k === 'active' || k === 'hitIds') continue;
    s[k] = src[k];
  }
  s.hitIds = null;
  s.active = true;
  return s;
}
