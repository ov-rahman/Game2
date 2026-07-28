/**
 * The player shot pipeline.
 *
 * One place decides what a volley looks like, reading only aggregated stats and
 * flags. That is why arbitrary item combinations work: every modifier is a
 * number on the player, and the pipeline applies all of them in a fixed order.
 *
 *   directions -> spread -> base shot -> flags -> item hooks -> synergies -> echo
 */
import { TEAM } from '../constants.js';
import { runHook } from './inventory.js';
import { SPRITE } from '../../data/sprite-ids.js';

export function fireVolley(game, player, dirX, dirY, dirZ, opts = {}) {
  const st = player.stats;
  const f = player.flags;
  const shots = [];

  const count = 1 + (f.multishot || 0);
  const spread = st.spread + (count > 1 ? 0.035 * count : 0);

  // Build an orthonormal basis around the aim direction so the spread cone is
  // circular no matter where the player is looking.
  const upX = 0;
  const upY = 1;
  const upZ = 0;
  let rx = dirY * upZ - dirZ * upY;
  let ry = dirZ * upX - dirX * upZ;
  let rz = dirX * upY - dirY * upX;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * dirZ - rz * dirY;
  const uy = rz * dirX - rx * dirZ;
  const uz = rx * dirY - ry * dirX;

  for (let i = 0; i < count; i++) {
    const a = game.rng.angle();
    const r = count === 1 ? game.rng.range(0, spread * 0.5) : spread * (0.35 + game.rng.next() * 0.75);
    const ox = Math.cos(a) * r;
    const oy = Math.sin(a) * r;
    const sx = dirX + rx * ox + ux * oy;
    const sy = dirY + ry * ox + uy * oy;
    const sz = dirZ + rz * ox + uz * oy;
    const s = createPlayerShot(game, player, sx, sy, sz, opts);
    if (s) shots.push(s);
  }

  if (!shots.length) return shots;

  const ctx = { game, player, shots, dirX, dirY, dirZ };
  runHook(player, 'onShoot', ctx);
  for (const syn of player.inv.synergies) {
    if (syn.apply) syn.apply(ctx);
  }

  if (f.echo && game.rng.chance(Math.min(0.7, f.echo))) {
    player.echoQueue.push({ x: dirX, y: dirY, z: dirZ, t: 0.08 });
  }

  return shots;
}

export function createPlayerShot(game, player, dx, dy, dz, opts = {}) {
  const s = game.spawnShot(TEAM.PLAYER);
  if (!s) return null;
  const st = player.stats;
  const f = player.flags;

  const len = Math.hypot(dx, dy, dz) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;

  const crit = game.rng.chance(st.critChance + Math.max(0, st.luck) * 0.01);
  const dmg = st.damage * st.damageMult * (crit ? st.critMult : 1) * (opts.damageMul || 1);

  const eye = player.y + player.eyeHeight;
  s.x = s.px = player.x + nx * 0.4;
  s.y = s.py = eye - 0.12 + ny * 0.4;
  s.z = s.pz = player.z + nz * 0.4;
  s.speed = st.shotSpeed;
  s.vx = nx * s.speed;
  s.vy = ny * s.speed;
  s.vz = nz * s.speed;
  s.damage = dmg;
  s.crit = crit;
  s.radius = 0.16 + (f.explosive ? 0.06 : 0);
  s.size = s.radius * (crit ? 2.6 : 2.0);
  s.life = s.maxLife = st.range;
  s.knockback = 2 + (st.knockback || 0);

  s.pierce = f.pierce || 0;
  s.bounce = f.bounce || 0;
  s.explosive = f.explosive || 0;
  s.splitOnHit = f.splitOnHit || 0;
  s.chain = f.chain || 0;
  s.homing = f.homing || 0;
  s.gravity = 0;
  s.burn = f.burn || 0;
  s.freeze = f.freeze || 0;
  s.poison = f.poison || 0;
  s.shock = f.shock || 0;
  s.owner = player;
  s.lightRadius = 3.5;

  const col = shotColor(player, crit);
  s.r = col[0];
  s.g = col[1];
  s.b = col[2];
  s.sprite = crit ? SPRITE.STAR : f.explosive ? SPRITE.FLAME : SPRITE.DOT;
  return s;
}

function shotColor(player, crit) {
  const f = player.flags;
  if (crit) return [1, 0.95, 0.6];
  if (f.burn) return [1, 0.55, 0.2];
  if (f.freeze) return [0.6, 0.9, 1];
  if (f.poison) return [0.6, 1, 0.3];
  if (f.shock) return [1, 0.95, 0.45];
  return [0.75, 0.95, 1];
}

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
