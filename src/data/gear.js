/**
 * Gear: rarity, weapons and relics.
 *
 * Items in items.js are *modifiers* — they nudge a stat or add a flag, and a
 * run is the sum of them. This file holds the two things that are not
 * modifiers:
 *
 *   WEAPONS  what you are shooting with. Exactly one at a time, and swapping
 *            it changes the feel of the whole run, not a number in it.
 *   RELICS   one-per-boss rewards that change a rule rather than a stat.
 *
 * Both are data. Adding a weapon is an entry here; nothing in the engine knows
 * how many there are.
 */

/**
 * Rarity tiers. `quality` on an item indexes into this, so the existing
 * catalogue gets tiers without touching a single entry.
 */
export const RARITY = [
  null,
  { id: 'common', name: 'обычное', color: [0.78, 0.82, 0.75], hud: '#c6d2bd' },
  { id: 'uncommon', name: 'необычное', color: [0.45, 0.75, 1.0], hud: '#73bfff' },
  { id: 'rare', name: 'редкое', color: [0.72, 0.5, 1.0], hud: '#b880ff' },
  { id: 'legendary', name: 'легендарное', color: [1.0, 0.62, 0.25], hud: '#ff9e40' },
  { id: 'relic', name: 'РЕЛИКВИЯ', color: [1.0, 0.9, 0.45], hud: '#ffe673' },
];

export function rarityOf(quality) {
  return RARITY[Math.max(1, Math.min(RARITY.length - 1, quality || 1))];
}

/**
 * Weapons.
 *
 * `stats` replaces the base value outright rather than adding to it — a weapon
 * is not a bonus, it is what you are holding. Items then modify whatever it
 * left behind, so a damage item is still worth taking on any of them.
 *
 * `art` drives the viewmodel: barrel length, bulk, and the colour of the glow
 * in its core, so the thing in your hands changes when the weapon does.
 */
export const WEAPONS = {
  arclight: {
    name: 'Дуговой фонарь',
    desc: 'То, с чем начинают. Ровный, честный, ничем не выдающийся.',
    quality: 1,
    stats: {},
    flags: {},
    art: { barrel: 1.0, bulk: 1.0, glow: [0.4, 1.0, 0.75] },
  },

  scattergun: {
    name: 'Веерник',
    desc: 'Пять зарядов за выстрел, но только в упор.',
    quality: 3,
    stats: { damage: 2.0, fireRate: 1.5, shotSpeed: 26, range: 0.34, spread: 0.13, heatPerShot: 0.14 },
    flags: { multishot: 4 },
    art: { barrel: 0.72, bulk: 1.35, glow: [1.0, 0.72, 0.3] },
  },

  lance: {
    name: 'Копьё',
    desc: 'Один длинный заряд, пробивает насквозь. Перегревается быстро.',
    quality: 3,
    stats: { damage: 11, fireRate: 1.1, shotSpeed: 62, range: 1.5, spread: 0.004, heatPerShot: 0.2 },
    flags: { pierce: 3 },
    art: { barrel: 1.55, bulk: 0.82, glow: [0.55, 0.85, 1.0] },
  },

  cinder: {
    name: 'Уголёк',
    desc: 'Плюётся часто и почти без нагрева, но каждая искра — мелочь.',
    quality: 2,
    stats: { damage: 1.9, fireRate: 8.5, shotSpeed: 40, range: 0.6, spread: 0.055, heatPerShot: 0.022 },
    flags: { burn: 1 },
    art: { barrel: 0.9, bulk: 0.78, glow: [1.0, 0.55, 0.2] },
  },

  mortar: {
    name: 'Мортира',
    desc: 'Медленный снаряд, который разрывается. Своим тоже прилетает.',
    quality: 4,
    stats: { damage: 7.5, fireRate: 1.3, shotSpeed: 24, range: 1.2, spread: 0.03, heatPerShot: 0.17 },
    flags: { explosive: 1 },
    art: { barrel: 1.15, bulk: 1.5, glow: [1.0, 0.4, 0.2] },
  },

  hymn: {
    name: 'Гимн',
    desc: 'Заряды сами находят цель и делятся при попадании.',
    quality: 4,
    stats: { damage: 3.4, fireRate: 3.0, shotSpeed: 30, range: 1.0, spread: 0.02, heatPerShot: 0.06 },
    flags: { homing: 0.7, split: 1 },
    art: { barrel: 1.05, bulk: 0.95, glow: [0.85, 0.5, 1.0] },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const STARTING_WEAPON = 'arclight';

/**
 * Relics.
 *
 * The rule for what belongs here: a relic should change a decision, not a
 * number. If it can be written as "+15% damage" it is an item, not a relic.
 *
 * They are guaranteed drops — one per boss — so a run always ends with as many
 * of them as floors you cleared, and never depends on a roll going your way.
 */
export const RELICS = {
  emberHeart: {
    name: 'Сердце углей',
    desc: 'Перегрев больше не запирает оружие — он поджигает всё вокруг.',
    quality: 5,
    art: { glow: [1.0, 0.45, 0.15] },
    flags: { overheatBurst: 1, noHeatLock: 1 },
  },

  longNight: {
    name: 'Долгая ночь',
    desc: 'Фонарь не садится, пока ты не стреляешь.',
    quality: 5,
    art: { glow: [0.6, 0.75, 1.0] },
    flags: { quietTorch: 1 },
  },

  hollowLung: {
    name: 'Полое лёгкое',
    desc: 'Приседая, ты не издаёшь ни звука и не виден дальше трёх метров.',
    quality: 5,
    art: { glow: [0.5, 1.0, 0.7] },
    flags: { vanish: 1 },
  },

  tithe: {
    name: 'Десятина',
    desc: 'Каждое десятое убийство возвращает единицу здоровья.',
    quality: 5,
    art: { glow: [1.0, 0.85, 0.4] },
    flags: { tithe: 1 },
  },

  secondFace: {
    name: 'Второе лицо',
    desc: 'Урон в спину, нанесённый тебе, отражается обратно целиком.',
    quality: 5,
    art: { glow: [0.9, 0.4, 0.7] },
    flags: { riposte: 1 },
  },

  drownedBell: {
    name: 'Утопший колокол',
    desc: 'Раз в комнате смерть отменяется: ты остаёшься с одним здоровьем.',
    quality: 5,
    art: { glow: [0.45, 0.9, 1.0] },
    flags: { bell: 1 },
  },
};

export const RELIC_IDS = Object.keys(RELICS);

/** Every boss has its own relic, so what you get is a trophy, not a lottery. */
export const BOSS_RELIC = {
  leshy: 'hollowLung',
  chiroptera: 'longNight',
  bellowsmith: 'emberHeart',
  ignarok: 'secondFace',
  chromadrake: 'drownedBell',
};
