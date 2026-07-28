/**
 * Floor definitions: theme, palette, generator knobs, enemy pool, boss, music.
 *
 * Adding a floor is a data edit — append an entry here, add its sprite painter
 * in src/render/atlas-painters.js and its boss in src/core/bosses/. Nothing in
 * the engine hardcodes the number of floors.
 *
 * Palette rule for this game: nothing drab. Even the "deep" floors keep at
 * least two saturated accent hues so the screen never reads as grey mud.
 */

export const FLOORS = [
  {
    id: 'grove',
    index: 1,
    name: 'Солнечная роща',
    subtitle: 'почти поверхность',
    music: 'floor1',
    hazard: 'thorns',
    // Generation
    rooms: { min: 9, max: 12 },
    special: { treasure: 1, shop: 1, challenge: 1, secret: 1 },
    difficulty: 1.0,
    rockChance: 0.55,
    pitChance: 0.1,
    hazardChance: 0.12,
    decoDensity: 0.16,
    palette: {
      bg: '#1c4a2b',
      floorA: '#57ad5c',
      floorB: '#5eb663',
      floorC: '#66bf6b',
      floorEdge: '#3f8a48',
      wallFace: '#7a5c33',
      wallTop: '#9c7845',
      wallHi: '#c69a5e',
      wallShadow: '#4e3a1f',
      accent1: '#ffe066', // sunbeams
      accent2: '#9cf09f', // fresh leaves
      accent3: '#ff8fb1', // blossoms
      accent4: '#63d7ff', // sky through the canopy
      hazard: '#a8e05a',
      hazardHi: '#e6ff7a',
      pit: '#26543a',
      pitDeep: '#123021',
      deco: ['#7ed683', '#9ee8a2', '#ffd24a', '#ff9ec4', '#d4f7b4'],
      particle: ['#ffe98a', '#a7ef9f', '#ffffff'],
      fog: 'rgba(255, 240, 170, 0.05)',
      minimap: '#66bf6b',
    },
    enemies: ['slime', 'sproutling', 'leafling', 'thornbug', 'mossback', 'wisp', 'stumpler'],
    eliteChance: 0.14,
    elites: ['slimeKing', 'thornbugElite'],
    boss: 'leshy',
  },
  {
    id: 'hollow',
    index: 2,
    name: 'Синие пустоты',
    subtitle: 'глубже, во тьму',
    music: 'floor2',
    hazard: 'ooze',
    rooms: { min: 11, max: 14 },
    special: { treasure: 1, shop: 1, challenge: 1, secret: 1 },
    difficulty: 1.35,
    rockChance: 0.6,
    pitChance: 0.22,
    hazardChance: 0.16,
    decoDensity: 0.18,
    palette: {
      bg: '#14374f',
      floorA: '#2f6f8e',
      floorB: '#357a99',
      floorC: '#3d87a6',
      floorEdge: '#215574',
      wallFace: '#1d4260',
      wallTop: '#28587a',
      wallHi: '#4e93ad',
      wallShadow: '#0d2436',
      accent1: '#4ff5d8', // bioluminescent teal
      accent2: '#86f07f', // cave moss glow
      accent3: '#a892ff', // crystal violet
      accent4: '#ffd166', // lantern grubs
      hazard: '#3fe6b4',
      hazardHi: '#9dffe8',
      pit: '#0f2637',
      pitDeep: '#071522',
      deco: ['#4ff5d8', '#86f07f', '#a892ff', '#54a8c8'],
      particle: ['#7ff5e2', '#a6ff9e', '#c3b4ff'],
      fog: 'rgba(90, 190, 220, 0.05)',
      minimap: '#4ff5d8',
    },
    enemies: ['bat', 'crawler', 'spitter', 'gloomOrb', 'stalker', 'fungling', 'shrieker', 'burrower'],
    eliteChance: 0.18,
    elites: ['batSwarmLord', 'stalkerElite'],
    boss: 'chiroptera',
  },
  {
    id: 'forge',
    index: 3,
    name: 'Магмовые кузни',
    subtitle: 'жарко, но лавы ещё нет',
    music: 'floor3',
    hazard: 'ember',
    rooms: { min: 12, max: 15 },
    special: { treasure: 1, shop: 1, challenge: 1, secret: 1 },
    difficulty: 1.7,
    rockChance: 0.68,
    pitChance: 0.18,
    hazardChance: 0.2,
    decoDensity: 0.2,
    palette: {
      bg: '#4a1f10',
      floorA: '#6f4436',
      floorB: '#7a4d3d',
      floorC: '#875846',
      floorEdge: '#5a352a',
      wallFace: '#7a3a20',
      wallTop: '#a2542c',
      wallHi: '#d98a4e',
      wallShadow: '#4a1d0e',
      accent1: '#ffae4a', // ember orange
      accent2: '#ffe14f', // molten gold
      accent3: '#ff6f5a', // hot iron
      accent4: '#7ad9ff', // quenching steam
      hazard: '#ff8a3c',
      hazardHi: '#ffe08a',
      pit: '#3a1508',
      pitDeep: '#1f0a03',
      deco: ['#ffae4a', '#ffe14f', '#d97a3c', '#b85a2c'],
      particle: ['#ffb347', '#ff6b3d', '#ffe9a8'],
      fog: 'rgba(255, 160, 70, 0.06)',
      minimap: '#ffae4a',
    },
    enemies: ['emberling', 'forgeGolem', 'cinderMoth', 'slagHound', 'bellowsImp', 'anvilTurret', 'magmite'],
    eliteChance: 0.2,
    elites: ['golemElite', 'slagAlpha'],
    boss: 'bellowsmith',
  },
  {
    id: 'lavalake',
    index: 4,
    name: 'Лавовое озеро',
    subtitle: 'теперь — лава',
    music: 'floor4',
    hazard: 'lava',
    rooms: { min: 13, max: 16 },
    special: { treasure: 1, shop: 1, challenge: 1, secret: 1 },
    difficulty: 2.1,
    rockChance: 0.5,
    pitChance: 0.1,
    hazardChance: 0.42, // lava is the defining terrain here
    decoDensity: 0.14,
    palette: {
      bg: '#5c1c08',
      floorA: '#5e3a30',
      floorB: '#6a4238',
      floorC: '#774d42',
      floorEdge: '#472a22',
      wallFace: '#6b2a17',
      wallTop: '#964222',
      wallHi: '#e07a3c',
      wallShadow: '#3d1409',
      accent1: '#ff7a3c',
      accent2: '#ffd45a',
      accent3: '#ff4f7a',
      accent4: '#66fcf1',
      hazard: '#ff6a1e',
      hazardHi: '#ffe98a',
      pit: '#3a1006',
      pitDeep: '#1c0602',
      deco: ['#ff8a5c', '#ffbb5a', '#c25a30', '#ffe0b2'],
      particle: ['#ff9e40', '#ff5252', '#fff3b0'],
      fog: 'rgba(255, 130, 60, 0.06)',
      minimap: '#ff7a3c',
    },
    enemies: ['lavaSlug', 'pyroWisp', 'obsidianKnight', 'geyserMouth', 'flameDancer', 'cinderMoth', 'magmite', 'ashRevenant'],
    eliteChance: 0.24,
    elites: ['knightElite', 'pyroTyrant'],
    boss: 'ignarok',
  },
  {
    id: 'hoard',
    index: 5,
    name: 'Призматическая сокровищница',
    subtitle: 'логово дракона',
    music: 'floor5',
    hazard: 'prism',
    rooms: { min: 8, max: 10 },
    special: { treasure: 1, shop: 1, challenge: 1, secret: 0 },
    difficulty: 2.5,
    rockChance: 0.45,
    pitChance: 0.12,
    hazardChance: 0.16,
    decoDensity: 0.28,
    // The bright, many-coloured floor: a crystal treasury lit by refracted light.
    rainbow: true,
    palette: {
      bg: '#2e1f63',
      floorA: '#5a44a8',
      floorB: '#6650b8',
      floorC: '#735cc8',
      floorEdge: '#43318a',
      wallFace: '#4a3690',
      wallTop: '#6e54c4',
      wallHi: '#a98cff',
      wallShadow: '#2a1c58',
      accent1: '#ff4fa3', // magenta prism
      accent2: '#4fe1ff', // cyan prism
      accent3: '#ffe14f', // gold hoard
      accent4: '#7cff6b', // emerald
      accent5: '#ff8b3d', // amber
      accent6: '#b06bff', // amethyst
      hazard: '#ff5fae',
      hazardHi: '#ffd1ec',
      pit: '#251646',
      pitDeep: '#150c2b',
      deco: ['#ff4fa3', '#4fe1ff', '#ffe14f', '#7cff6b', '#b06bff', '#ff8b3d'],
      particle: ['#ffffff', '#ffe14f', '#4fe1ff', '#ff4fa3', '#7cff6b'],
      fog: 'rgba(200, 160, 255, 0.05)',
      minimap: '#ff4fa3',
    },
    enemies: ['prismSprite', 'gemGolem', 'hoardMimic', 'lightWeaver', 'shardHound', 'dragonWhelp', 'ashRevenant'],
    eliteChance: 0.3,
    elites: ['mimicKing', 'weaverElite'],
    boss: 'chromadrake',
  },
];

export function getFloor(index) {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, index - 1))];
}

export const FLOOR_COUNT = FLOORS.length;
