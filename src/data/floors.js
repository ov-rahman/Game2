/**
 * Floor definitions: generation knobs, texture palette, lighting, fog and the
 * per-floor tuning of the post-processing filter.
 *
 * Adding a floor is a data edit — append an entry, give it a boss id, done.
 * Nothing in the engine hardcodes the number of floors.
 *
 * Colour rule for this game: the filter is dark by design, so the *sources* of
 * light must be saturated. Every floor keeps at least two strong hues in its
 * lamps and hazards, which is what stops the image collapsing into grey mud.
 */

export const FLOORS = [
  {
    id: 'grove',
    index: 1,
    name: 'ЗАРОСШИЕ ВЕРХА',
    subtitle: 'почти поверхность',
    music: 'floor1',
    difficulty: 1.0,

    rooms: { min: 9, max: 12 },
    roomSize: { min: 6, max: 11 },
    hazardChance: 0.35,
    pits: false,
    wideCorridors: 0.35,
    special: { treasure: 1, shop: 1, challenge: 1 },

    // Brambles: they hold you more than they hurt you.
    hazard: { damage: 1, interval: 1.0, slow: 0.55, enemyDps: 5 },

    tex: {
      floor: '#4a5f38',
      wall: '#5c5340',
      hazard: '#7fc34a',
      hazardHi: '#d6ff8a',
      accent: '#9be86a',
      flesh: '#6f8a3f',
    },
    mesh: {
      floor: [0.95, 1.0, 0.85],
      wall: [1.0, 0.96, 0.82],
      ceiling: [0.72, 0.78, 0.66],
      hazard: [0.9, 1.0, 0.6],
      rubble: [0.85, 0.86, 0.78],
      trim: [1.0, 0.95, 0.7],
      stairs: [0.9, 1.0, 0.8],
    },

    fog: { color: [0.05, 0.09, 0.06], density: 0.028 },
    ambient: [0.216, 0.264, 0.192],
    lightColors: [
      [1.0, 0.92, 0.55],
      [0.55, 1.0, 0.5],
      [0.9, 0.65, 1.0],
    ],
    flicker: 0.35,

    post: {
      tint: [1.0, 1.02, 0.94],
      levels: 14,
      grain: 0.055,
      scanline: 0.1,
      aberration: 1.1,
      vignette: 0.65,
      saturation: 1.1,
      contrast: 1.01,
      brightness: 0.045,
    },

    enemies: ['sporeling', 'thornhound', 'lantern', 'creeper', 'shrieker'],
    elites: ['thornAlpha'],
    eliteChance: 0.16,
    boss: 'leshy',
  },

  {
    id: 'hollow',
    index: 2,
    name: 'СИНИЕ ПУСТОТЫ',
    subtitle: 'глубже, во тьму',
    music: 'floor2',
    difficulty: 1.35,

    rooms: { min: 11, max: 14 },
    roomSize: { min: 5, max: 11 },
    hazardChance: 0.4,
    pits: true,
    wideCorridors: 0.22,
    special: { treasure: 1, shop: 1, challenge: 1 },

    hazard: { damage: 1, interval: 0.85, slow: 0.6, enemyDps: 6 },

    tex: {
      floor: '#26404f',
      wall: '#22384a',
      hazard: '#2fd6a4',
      hazardHi: '#a8ffe6',
      accent: '#4ff5d8',
      flesh: '#3f5f7a',
    },
    mesh: {
      floor: [0.85, 0.95, 1.0],
      wall: [0.9, 0.96, 1.0],
      ceiling: [0.6, 0.7, 0.82],
      hazard: [0.6, 1.0, 0.9],
      rubble: [0.8, 0.86, 0.95],
      trim: [0.7, 1.0, 0.95],
      stairs: [0.85, 0.95, 1.0],
    },

    fog: { color: [0.02, 0.05, 0.08], density: 0.036 },
    ambient: [0.132, 0.180, 0.240],
    lightColors: [
      [0.3, 1.0, 0.86],
      [0.55, 0.7, 1.0],
      [0.7, 0.45, 1.0],
    ],
    flicker: 0.5,

    post: {
      tint: [0.94, 1.0, 1.06],
      levels: 12,
      grain: 0.07,
      scanline: 0.13,
      aberration: 1.4,
      vignette: 0.72,
      saturation: 1.05,
      contrast: 1.01,
      brightness: 0.035,
    },

    enemies: ['batling', 'crawler', 'spitter', 'gloomOrb', 'stalker', 'burrower'],
    elites: ['stalkerElite'],
    eliteChance: 0.2,
    boss: 'chiroptera',
  },

  {
    id: 'forge',
    index: 3,
    name: 'МАГМОВЫЕ КУЗНИ',
    subtitle: 'жарко, но лавы ещё нет',
    music: 'floor3',
    difficulty: 1.7,

    rooms: { min: 12, max: 15 },
    roomSize: { min: 5, max: 12 },
    hazardChance: 0.3,
    pits: true,
    wideCorridors: 0.3,
    special: { treasure: 1, shop: 1, challenge: 1 },

    hazard: { damage: 1, interval: 0.7, slow: 0.75, enemyDps: 9 },

    tex: {
      floor: '#4a3328',
      wall: '#5a3524',
      hazard: '#ff8a3c',
      hazardHi: '#ffe08a',
      accent: '#ffae4a',
      flesh: '#8a4526',
    },
    mesh: {
      floor: [1.0, 0.92, 0.84],
      wall: [1.0, 0.9, 0.8],
      ceiling: [0.7, 0.6, 0.55],
      hazard: [1.0, 0.85, 0.5],
      rubble: [0.95, 0.88, 0.82],
      trim: [1.0, 0.85, 0.6],
      stairs: [1.0, 0.9, 0.75],
    },

    fog: { color: [0.09, 0.035, 0.015], density: 0.032 },
    ambient: [0.264, 0.144, 0.096],
    lightColors: [
      [1.0, 0.62, 0.25],
      [1.0, 0.86, 0.35],
      [0.4, 0.85, 1.0],
    ],
    flicker: 0.7,

    post: {
      tint: [1.06, 0.98, 0.92],
      levels: 12,
      grain: 0.075,
      scanline: 0.14,
      aberration: 1.6,
      vignette: 0.7,
      saturation: 1.12,
      contrast: 1.01,
      brightness: 0.035,
    },

    enemies: ['emberling', 'forgeGolem', 'slagHound', 'bellowsImp', 'anvilTurret'],
    elites: ['golemElite'],
    eliteChance: 0.22,
    boss: 'bellowsmith',
  },

  {
    id: 'lavalake',
    index: 4,
    name: 'ЛАВОВОЕ ОЗЕРО',
    subtitle: 'теперь — лава',
    music: 'floor4',
    difficulty: 2.1,

    rooms: { min: 12, max: 15 },
    roomSize: { min: 6, max: 13 },
    hazardChance: 0.5,
    pits: false,
    wideCorridors: 0.4,
    special: { treasure: 1, shop: 1, challenge: 1 },

    // Actual lava. Crossing it is a decision, not a shortcut.
    hazard: { damage: 1, interval: 0.5, slow: 0.62, enemyDps: 14 },

    tex: {
      floor: '#3d2620',
      wall: '#4a231a',
      hazard: '#ff5a14',
      hazardHi: '#ffd76b',
      accent: '#ff7a3c',
      flesh: '#a03018',
    },
    mesh: {
      floor: [1.0, 0.88, 0.8],
      wall: [1.0, 0.86, 0.76],
      ceiling: [0.68, 0.5, 0.44],
      hazard: [1.0, 0.9, 0.65],
      rubble: [0.95, 0.85, 0.8],
      trim: [1.0, 0.8, 0.55],
      stairs: [1.0, 0.88, 0.7],
    },

    fog: { color: [0.13, 0.04, 0.015], density: 0.03 },
    ambient: [0.336, 0.144, 0.084],
    lightColors: [
      [1.0, 0.45, 0.15],
      [1.0, 0.8, 0.3],
      [1.0, 0.25, 0.4],
    ],
    flicker: 0.8,

    post: {
      tint: [1.1, 0.96, 0.88],
      levels: 11,
      grain: 0.085,
      scanline: 0.15,
      aberration: 2.0,
      vignette: 0.68,
      saturation: 1.15,
      contrast: 1.02,
      brightness: 0.040,
    },

    enemies: ['lavaSlug', 'pyroWisp', 'obsidianKnight', 'geyserMouth', 'flameDancer'],
    elites: ['knightElite'],
    eliteChance: 0.26,
    boss: 'ignarok',
  },

  {
    id: 'hoard',
    index: 5,
    name: 'ПРИЗМАТИЧЕСКАЯ СОКРОВИЩНИЦА',
    subtitle: 'логово дракона',
    music: 'floor5',
    difficulty: 2.5,

    rooms: { min: 8, max: 11 },
    roomSize: { min: 7, max: 14 },
    hazardChance: 0.25,
    pits: true,
    wideCorridors: 0.5,
    special: { treasure: 1, shop: 1, challenge: 0 },

    // The bright, many-coloured floor: a crystal treasury lit by refracted light.
    rainbow: true,
    hazard: { damage: 1, interval: 0.8, slow: 0.7, enemyDps: 8 },

    tex: {
      floor: '#3b2c6b',
      wall: '#42307a',
      hazard: '#ff5fae',
      hazardHi: '#ffd1ec',
      accent: '#ff4fa3',
      flesh: '#7a4fb0',
    },
    mesh: {
      floor: [1.0, 0.95, 1.0],
      wall: [0.98, 0.92, 1.0],
      ceiling: [0.68, 0.62, 0.85],
      hazard: [1.0, 0.7, 0.95],
      rubble: [0.95, 0.9, 1.0],
      trim: [1.0, 0.9, 0.6],
      stairs: [1.0, 0.95, 1.0],
    },

    fog: { color: [0.06, 0.035, 0.1], density: 0.026 },
    ambient: [0.240, 0.192, 0.336],
    lightColors: [
      [1.0, 0.31, 0.64],
      [0.31, 0.88, 1.0],
      [1.0, 0.88, 0.31],
      [0.49, 1.0, 0.42],
      [0.69, 0.42, 1.0],
      [1.0, 0.55, 0.24],
    ],
    flicker: 0.25,

    post: {
      tint: [1.02, 0.98, 1.08],
      levels: 16,
      grain: 0.05,
      scanline: 0.09,
      aberration: 2.4,
      vignette: 0.6,
      saturation: 1.3,
      contrast: 1.01,
      brightness: 0.050,
    },

    enemies: ['prismSprite', 'gemGolem', 'hoardMimic', 'shardHound', 'dragonWhelp'],
    elites: ['mimicKing'],
    eliteChance: 0.3,
    boss: 'chromadrake',
  },
];

export const FLOOR_COUNT = FLOORS.length;

export function getFloor(index) {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, index - 1))];
}
