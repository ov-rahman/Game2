/**
 * Item ownership, stat aggregation and hook dispatch.
 *
 * Stats are recomputed from scratch whenever anything changes rather than being
 * patched incrementally. With a few dozen items that costs nothing and removes
 * a whole family of "stat drifted after a pickup" bugs.
 */
import { ITEMS, ACTIVES, BASE_STATS } from '../../data/items.js';
import { SYNERGIES } from '../../data/synergies.js';
import { WEAPONS, RELICS, STARTING_WEAPON } from '../../data/gear.js';

const HOOK_NAMES = [
  'onPickup',
  'onStats',
  'onShoot',
  'onKill',
  'onHit',
  'onCrit',
  'onHurt',
  'onContact',
  'onRoomEnter',
  'onRoomClear',
  'onFloorStart',
  'onUpdate',
];

export function createInventory() {
  return {
    items: [],
    counts: Object.create(null),
    weaponId: STARTING_WEAPON,
    relics: [],
    activeId: null,
    activeName: '',
    activeCharge: 0,
    activeMax: 0,
    hooks: Object.create(null),
    synergies: [],
  };
}

export function hasItem(inv, id) {
  return (inv.counts[id] || 0) > 0;
}

function reindex(inv) {
  for (const name of HOOK_NAMES) inv.hooks[name] = [];
  for (const id of inv.items) {
    const it = ITEMS[id];
    if (!it || !it.hooks) continue;
    for (const name of HOOK_NAMES) {
      if (typeof it.hooks[name] === 'function') inv.hooks[name].push(it.hooks[name]);
    }
  }
  inv.synergies = SYNERGIES.filter((syn) => syn.requires.every((r) => hasItem(inv, r)));
}

/** Add an item; returns synergies that became active so the shell can announce them. */
export function addItem(game, player, id) {
  const it = ITEMS[id];
  if (!it) return [];
  const inv = player.inv;
  const before = new Set(inv.synergies.map((s) => s.id));

  inv.items.push(id);
  inv.counts[id] = (inv.counts[id] || 0) + 1;
  reindex(inv);
  player.statsDirty = true;
  recomputeStats(game, player);

  if (it.hooks && it.hooks.onPickup) it.hooks.onPickup({ game, player, item: it, id });
  player.hp = Math.min(player.hp, player.stats.maxHp);
  if (player.hp <= 0) player.hp = 1;

  return inv.synergies.filter((s) => !before.has(s.id));
}

/** Swap the weapon. Returns the previous one so the shell can announce it. */
export function setWeapon(player, id) {
  if (!WEAPONS[id]) return null;
  const prev = player.inv.weaponId;
  player.inv.weaponId = id;
  player.statsDirty = true;
  return prev;
}

export function currentWeapon(player) {
  return WEAPONS[player.inv.weaponId] || WEAPONS[STARTING_WEAPON];
}

/** Take a relic. Duplicates are impossible: each boss has exactly one. */
export function addRelic(player, id) {
  if (!RELICS[id]) return false;
  if (player.inv.relics.includes(id)) return false;
  player.inv.relics.push(id);
  player.statsDirty = true;
  return true;
}

export function setActive(player, id) {
  const act = ACTIVES[id];
  if (!act) return null;
  player.inv.activeId = id;
  player.inv.activeName = act.name;
  player.inv.activeMax = act.charge;
  player.inv.activeCharge = 0;
  reindex(player.inv);
  player.statsDirty = true;
  return id;
}

export function recomputeStats(game, player) {
  const s = Object.assign({}, BASE_STATS);
  const flags = Object.create(null);
  // Health earned by killing floor owners, kept outside the item system so it
  // survives every recompute.
  s.maxHp += player.bonusHp || 0;

  // The weapon goes first and *replaces* rather than adds: it is not a bonus,
  // it is what you are holding. Everything after it modifies what it left.
  const weapon = WEAPONS[player.inv.weaponId] || WEAPONS[STARTING_WEAPON];
  if (weapon) {
    if (weapon.stats) for (const k in weapon.stats) s[k] = weapon.stats[k];
    if (weapon.flags) for (const k in weapon.flags) flags[k] = (flags[k] || 0) + weapon.flags[k];
  }

  // Relics next. They deal in flags, not numbers, which is what separates them
  // from items — a relic changes a rule.
  for (const id of player.inv.relics) {
    const rel = RELICS[id];
    if (!rel) continue;
    if (rel.stats) for (const k in rel.stats) s[k] = (s[k] || 0) + rel.stats[k];
    if (rel.flags) for (const k in rel.flags) flags[k] = (flags[k] || 0) + rel.flags[k];
  }

  for (const id of player.inv.items) {
    const it = ITEMS[id];
    if (!it) continue;
    if (it.stats) for (const k in it.stats) s[k] = (s[k] || 0) + it.stats[k];
    if (it.flags) for (const k in it.flags) flags[k] = (flags[k] || 0) + it.flags[k];
  }
  for (const id of player.inv.items) {
    const it = ITEMS[id];
    if (it && it.mult) for (const k in it.mult) s[k] = (s[k] == null ? 1 : s[k]) * it.mult[k];
  }

  const ctx = { game, player, stats: s, flags };
  for (const fn of player.inv.hooks.onStats || []) fn(ctx);
  // Synergies that grant a standing ability rather than changing a volley.
  // They have to run here: `flags` is rebuilt from scratch on every recompute,
  // so anything set outside this function is erased the next time the player
  // takes a hit or a timer expires.
  for (const syn of player.inv.synergies) {
    if (syn.passive) syn.passive(ctx);
  }

  // Clamp so no combination can break the game.
  s.maxHp = Math.max(2, Math.round(s.maxHp));
  s.fireRate = Math.max(0.7, s.fireRate);
  s.moveSpeed = Math.max(0.5, Math.min(2.2, s.moveSpeed));
  s.shotSpeed = Math.max(12, Math.min(160, s.shotSpeed));
  s.damage = Math.max(0.5, s.damage);
  s.damageMult = Math.max(0.15, s.damageMult);
  s.range = Math.max(0.25, s.range);
  s.critChance = Math.max(0, Math.min(0.95, s.critChance));
  s.heatPerShot = Math.max(0.004, s.heatPerShot);
  s.heatCooling = Math.max(0.2, s.heatCooling);
  s.torchDrain = Math.max(0.002, s.torchDrain);
  s.spread = Math.max(0, s.spread);

  player.stats = s;
  player.flags = flags;
  player.statsDirty = false;
  if (player.hp > s.maxHp) player.hp = s.maxHp;
  return s;
}

export function runHook(player, name, ctx) {
  const list = player.inv.hooks[name];
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) list[i](ctx);
}

export function chargeActive(player, amount = 1) {
  const inv = player.inv;
  if (!inv.activeId) return false;
  const wasFull = inv.activeCharge >= inv.activeMax;
  inv.activeCharge = Math.min(inv.activeMax, inv.activeCharge + amount);
  return !wasFull && inv.activeCharge >= inv.activeMax;
}

export function useActive(game, player) {
  const inv = player.inv;
  if (!inv.activeId) return false;
  if (inv.activeCharge < inv.activeMax) return false;
  const act = ACTIVES[inv.activeId];
  const ok = act.use({ game, player });
  if (ok !== false) {
    inv.activeCharge = 0;
    return true;
  }
  return false;
}

export { HOOK_NAMES };
