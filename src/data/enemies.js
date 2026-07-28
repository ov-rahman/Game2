/**
 * Enemy catalogue.
 *
 * Every monster is a data row; its personality comes from `behavior` (see
 * core/ai/behaviors.js) plus the knobs in `params`. Adding a monster means
 * adding a row here and a body descriptor in creature-art.js — no engine change.
 *
 * Field reference
 *   hp/speed/radius/height  body and stats (speed in world units per second)
 *   touch        contact damage
 *   cost/weight  spawn director budget and pool weighting
 *   sight/hear   how far it notices the player by eye and by noise
 *   shoot        { every, warn, speed, damage, count, spread, pattern, ... }
 *   onDeath      { split, explode, cloud }
 */

export const ENEMIES = {
  // ======================= FLOOR 1 =======================
  sporeling: {
    name: 'Спорыш',
    art: 'sporeling',
    hp: 16, speed: 2.1, radius: 0.45, height: 1.1, touch: 1,
    cost: 1, weight: 10, sight: 16, hear: 10,
    behavior: 'stalker',
    params: { accel: 9, wander: 1 },
    onDeath: { cloud: { radius: 2.6, time: 4, damage: 1 } },
  },
  thornhound: {
    name: 'Терновый пёс',
    art: 'thornhound',
    hp: 22, speed: 3.4, radius: 0.45, height: 1.15, touch: 2,
    cost: 1.5, weight: 9, sight: 20, hear: 15,
    behavior: 'packHunter',
    params: { circle: 5.5, strikeEvery: 3.0, dashSpeed: 11, dashTime: 0.45, warn: 0.5 },
  },
  lantern: {
    name: 'Фонарник',
    art: 'lantern',
    hp: 14, speed: 2.6, radius: 0.34, height: 1.6, touch: 1,
    cost: 1.2, weight: 7, sight: 22, hear: 8, flying: true,
    behavior: 'kiter',
    params: { keep: 8, flee: 4.5 },
    shoot: { every: 2.1, warn: 0.45, speed: 15, damage: 1, count: 1, sprite: 'DOT', color: [1, 0.9, 0.4] },
    light: { r: 1, g: 0.9, b: 0.45, radius: 7, intensity: 0.9 },
  },
  creeper: {
    name: 'Ползучка',
    art: 'creeper',
    hp: 12, speed: 4.2, radius: 0.5, height: 0.85, touch: 1,
    cost: 1, weight: 9, sight: 12, hear: 18,
    behavior: 'ambusher',
    params: { lungeRange: 6, lungeSpeed: 13, warn: 0.35, rest: 1.2 },
  },
  shrieker: {
    name: 'Визгун',
    art: 'shrieker',
    hp: 26, speed: 0, radius: 0.45, height: 1.9, touch: 1,
    cost: 2, weight: 5, sight: 20, hear: 20,
    behavior: 'summoner',
    params: { every: 6.0, warn: 1.1, spawn: 'creeper', count: 2, max: 6, alarm: true },
  },
  thornAlpha: {
    name: 'Вожак терновых',
    art: 'thornAlpha',
    hp: 70, speed: 3.9, radius: 0.65, height: 1.7, touch: 2,
    cost: 4, weight: 0, elite: true, sight: 24, hear: 20,
    behavior: 'packHunter',
    params: { circle: 6.5, strikeEvery: 2.1, dashSpeed: 14, dashTime: 0.5, warn: 0.4, howl: true },
  },

  // ======================= FLOOR 2 =======================
  batling: {
    name: 'Нетопырь',
    art: 'batling',
    hp: 12, speed: 5.0, radius: 0.36, height: 0.7, touch: 1,
    cost: 0.9, weight: 11, sight: 18, hear: 22, flying: true,
    behavior: 'erratic',
    params: { turnEvery: 0.5, burst: 9 },
  },
  crawler: {
    name: 'Ползун',
    art: 'crawler',
    hp: 24, speed: 3.0, radius: 0.5, height: 0.95, touch: 2,
    cost: 1.4, weight: 9, sight: 14, hear: 20,
    behavior: 'ambusher',
    params: { lungeRange: 7, lungeSpeed: 14, warn: 0.4, rest: 1.4 },
  },
  spitter: {
    name: 'Плевун',
    art: 'spitter',
    hp: 20, speed: 2.0, radius: 0.55, height: 1.3, touch: 1,
    cost: 1.6, weight: 8, sight: 20, hear: 12,
    behavior: 'kiter',
    params: { keep: 9, flee: 5 },
    shoot: {
      every: 2.4, warn: 0.5, speed: 13, damage: 2, count: 1, arc: 0.35,
      puddle: { radius: 2.2, time: 5, damage: 1 }, color: [0.6, 1, 0.35],
    },
  },
  gloomOrb: {
    name: 'Морок',
    art: 'gloomOrb',
    hp: 28, speed: 1.5, radius: 0.5, height: 1.7, touch: 1,
    cost: 2, weight: 6, sight: 22, hear: 10, flying: true,
    behavior: 'drifter',
    shoot: { every: 3.0, warn: 0.6, speed: 9, damage: 1, count: 8, pattern: 'radial', color: [0.6, 0.4, 1] },
    light: { r: 0.55, g: 0.4, b: 1, radius: 6, intensity: 0.8 },
  },
  stalker: {
    name: 'Преследователь',
    art: 'stalker',
    hp: 34, speed: 4.4, radius: 0.4, height: 2.0, touch: 2,
    cost: 2.4, weight: 6, sight: 26, hear: 26,
    behavior: 'hunter',
    params: { creepSpeed: 1.1, chargeRange: 9, chargeSpeed: 10, warn: 0.55, freezeWhenWatched: true },
  },
  burrower: {
    name: 'Землерой',
    art: 'burrower',
    hp: 30, speed: 5.5, radius: 0.5, height: 1.1, touch: 2,
    cost: 2.2, weight: 5, sight: 16, hear: 24,
    behavior: 'burrower',
    params: { under: 2.2, over: 2.6, warn: 0.5 },
  },
  stalkerElite: {
    name: 'Тенекрад',
    art: 'stalkerElite',
    hp: 90, speed: 5.2, radius: 0.5, height: 2.5, touch: 3,
    cost: 5, weight: 0, elite: true, sight: 30, hear: 30,
    behavior: 'hunter',
    params: { creepSpeed: 1.6, chargeRange: 12, chargeSpeed: 13, warn: 0.4, freezeWhenWatched: true },
  },

  // ======================= FLOOR 3 =======================
  emberling: {
    name: 'Уголёк',
    art: 'emberling',
    hp: 18, speed: 4.6, radius: 0.3, height: 1.0, touch: 1,
    cost: 1.2, weight: 10, sight: 18, hear: 16, flying: true,
    behavior: 'exploder',
    params: { fuseRange: 2.2, fuse: 0.7, radius: 3.4, damage: 3 },
    light: { r: 1, g: 0.5, b: 0.15, radius: 5, intensity: 1.0 },
  },
  forgeGolem: {
    name: 'Кузнечный голем',
    art: 'forgeGolem',
    hp: 90, speed: 1.7, radius: 0.75, height: 2.3, touch: 3,
    cost: 3.2, weight: 6, sight: 18, hear: 14, armor: 2,
    behavior: 'slammer',
    params: { range: 2.8, windup: 0.85, slamRadius: 4.2, slamDamage: 3, cooldown: 2.4 },
  },
  slagHound: {
    name: 'Шлаковый пёс',
    art: 'slagHound',
    hp: 34, speed: 4.2, radius: 0.5, height: 1.25, touch: 2,
    cost: 2, weight: 8, sight: 22, hear: 18,
    behavior: 'packHunter',
    params: { circle: 6, strikeEvery: 2.4, dashSpeed: 13, dashTime: 0.4, warn: 0.4 },
  },
  bellowsImp: {
    name: 'Мехобес',
    art: 'bellowsImp',
    hp: 26, speed: 3.2, radius: 0.4, height: 1.0, touch: 1,
    cost: 1.8, weight: 7, sight: 22, hear: 14, flying: true,
    behavior: 'kiter',
    params: { keep: 8.5, flee: 5 },
    shoot: { every: 1.8, warn: 0.4, speed: 17, damage: 1, count: 3, spread: 0.28, burn: 1, color: [1, 0.55, 0.2] },
  },
  anvilTurret: {
    name: 'Наковальня-страж',
    art: 'anvilTurret',
    hp: 46, speed: 0, radius: 0.6, height: 1.5, touch: 2,
    cost: 2.2, weight: 5, sight: 26, hear: 8, armor: 2,
    behavior: 'turret',
    shoot: { every: 2.6, warn: 0.6, speed: 16, damage: 2, count: 6, pattern: 'radial', color: [1, 0.75, 0.3] },
  },
  golemElite: {
    name: 'Домнный голем',
    art: 'golemElite',
    hp: 190, speed: 2.1, radius: 0.95, height: 3.0, touch: 4,
    cost: 6, weight: 0, elite: true, sight: 22, hear: 18, armor: 3,
    behavior: 'slammer',
    params: { range: 3.4, windup: 0.7, slamRadius: 5.5, slamDamage: 3, cooldown: 1.9, ringShot: 8 },
  },

  // ======================= FLOOR 4 =======================
  lavaSlug: {
    name: 'Лавовый слизень',
    art: 'lavaSlug',
    hp: 52, speed: 1.6, radius: 0.7, height: 1.2, touch: 3,
    cost: 2.2, weight: 8, sight: 14, hear: 12, lavaImmune: true,
    behavior: 'stalker',
    params: { accel: 5, trail: 'lava' },
    onDeath: { cloud: { radius: 2.8, time: 6, damage: 2, fire: true } },
    light: { r: 1, g: 0.45, b: 0.12, radius: 5, intensity: 0.9 },
  },
  pyroWisp: {
    name: 'Пиро-дух',
    art: 'pyroWisp',
    hp: 24, speed: 5.2, radius: 0.3, height: 1.8, touch: 2,
    cost: 1.8, weight: 9, sight: 24, hear: 12, flying: true, lavaImmune: true,
    behavior: 'orbiter',
    params: { orbit: 6.5, orbitSpeed: 1.6 },
    shoot: { every: 1.4, warn: 0.3, speed: 19, damage: 1, count: 1, burn: 1, color: [1, 0.7, 0.25] },
    light: { r: 1, g: 0.7, b: 0.25, radius: 6, intensity: 1.1 },
  },
  obsidianKnight: {
    name: 'Обсидиановый рыцарь',
    art: 'obsidianKnight',
    hp: 110, speed: 2.6, radius: 0.55, height: 2.2, touch: 3,
    cost: 3.4, weight: 6, sight: 20, hear: 16, armor: 3,
    behavior: 'guard',
    params: { shieldArc: 2.0, turnRate: 1.9, advance: true, slashRange: 3.0, slashEvery: 3.2 },
  },
  geyserMouth: {
    name: 'Гейзерная пасть',
    art: 'geyserMouth',
    hp: 60, speed: 0, radius: 0.8, height: 1.1, touch: 2,
    cost: 2.4, weight: 5, sight: 26, hear: 26, lavaImmune: true,
    behavior: 'geyser',
    params: { every: 3.2, warn: 0.9, radius: 3.0, damage: 3, count: 3 },
  },
  flameDancer: {
    name: 'Плясунья пламени',
    art: 'flameDancer',
    hp: 46, speed: 4.6, radius: 0.4, height: 1.9, touch: 2,
    cost: 2.8, weight: 7, sight: 24, hear: 18,
    behavior: 'orbiter',
    params: { orbit: 7.5, orbitSpeed: 2.0 },
    shoot: { every: 2.4, warn: 0.4, speed: 14, damage: 1, count: 10, pattern: 'spiral', burn: 1, color: [1, 0.5, 0.2] },
  },
  knightElite: {
    name: 'Магистр обсидиана',
    art: 'knightElite',
    hp: 220, speed: 3.0, radius: 0.7, height: 2.8, touch: 4,
    cost: 6.5, weight: 0, elite: true, sight: 24, hear: 20, armor: 4,
    behavior: 'guard',
    params: { shieldArc: 2.3, turnRate: 2.2, advance: true, slashRange: 3.6, slashEvery: 2.2, chargeSlash: true },
  },

  // ======================= FLOOR 5 =======================
  prismSprite: {
    name: 'Призменный дух',
    art: 'prismSprite',
    hp: 40, speed: 5.4, radius: 0.32, height: 1.6, touch: 1,
    cost: 2.2, weight: 9, sight: 26, hear: 14, flying: true,
    behavior: 'erratic',
    params: { turnEvery: 0.6, burst: 10 },
    shoot: { every: 2.0, warn: 0.3, speed: 18, damage: 2, count: 3, spread: 0.3, color: [0.4, 0.9, 1] },
    light: { r: 0.4, g: 0.9, b: 1, radius: 6, intensity: 1.0 },
  },
  gemGolem: {
    name: 'Самоцветный голем',
    art: 'gemGolem',
    hp: 160, speed: 2.0, radius: 0.85, height: 2.6, touch: 3,
    cost: 4.2, weight: 6, sight: 20, hear: 16, armor: 3,
    behavior: 'slammer',
    params: { range: 3.2, windup: 0.8, slamRadius: 5.0, slamDamage: 3, cooldown: 2.1, ringShot: 10 },
    onDeath: { split: { id: 'shardHound', count: 2, hpScale: 0.5 } },
  },
  hoardMimic: {
    name: 'Мимик клада',
    art: 'hoardMimic',
    hp: 110, speed: 4.0, radius: 0.7, height: 1.3, touch: 4,
    cost: 3.2, weight: 6, sight: 8, hear: 8,
    behavior: 'mimic',
    params: { revealRange: 3.2, lungeSpeed: 13 },
  },
  shardHound: {
    name: 'Осколочный пёс',
    art: 'shardHound',
    hp: 46, speed: 5.2, radius: 0.48, height: 1.2, touch: 2,
    cost: 2.4, weight: 8, sight: 24, hear: 20,
    behavior: 'packHunter',
    params: { circle: 6, strikeEvery: 1.9, dashSpeed: 15, dashTime: 0.35, warn: 0.35 },
  },
  dragonWhelp: {
    name: 'Дракончик',
    art: 'dragonWhelp',
    hp: 80, speed: 4.0, radius: 0.6, height: 1.6, touch: 3,
    cost: 3.6, weight: 6, sight: 26, hear: 18, flying: true,
    behavior: 'kiter',
    params: { keep: 10, flee: 6 },
    shoot: { every: 2.2, warn: 0.5, speed: 16, damage: 2, count: 5, spread: 0.4, burn: 1, color: [1, 0.6, 0.3] },
  },
  mimicKing: {
    name: 'Король мимиков',
    art: 'mimicKing',
    hp: 260, speed: 4.6, radius: 1.0, height: 2.0, touch: 4,
    cost: 7, weight: 0, elite: true, sight: 10, hear: 10,
    behavior: 'mimic',
    params: { revealRange: 4.2, lungeSpeed: 15, slam: true },
  },
};

/** Enemies never chosen by the spawn director — summoned or split only. */
export const MINIONS = new Set([]);

export function getEnemy(id) {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}
