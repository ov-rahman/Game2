/**
 * Creature body descriptors.
 *
 * The mesh builder turns each row into a low-poly body. Keeping bodies as data
 * means a new monster is a few numbers, and it also guarantees a consistent
 * visual language: every creature is built from the same vocabulary of parts.
 *
 * form     construction routine (see gfx/creatures.js)
 * height   world units, tip to floor — the main silhouette cue
 * body     [r,g,b] main colour, dark/light are shading, glow is emissive
 * eyes     count of glowing eyes; they are the first thing visible in fog
 * skin     texture tile: 'flesh' | 'metal' | 'bone' | 'crystal' | 'rubble'
 */

export const CREATURE_ART = {
  // ---- floor 1 ----------------------------------------------------------
  sporeling: {
    form: 'blob', height: 1.1, radius: 0.5, skin: 'flesh',
    body: [0.45, 0.62, 0.3], dark: [0.2, 0.3, 0.14], light: [0.7, 0.85, 0.45],
    glow: [0.75, 1.0, 0.35], eyes: 2, cap: true,
  },
  thornhound: {
    form: 'quadruped', height: 1.15, radius: 0.45, skin: 'flesh',
    body: [0.5, 0.4, 0.22], dark: [0.22, 0.17, 0.09], light: [0.75, 0.62, 0.35],
    glow: [1.0, 0.7, 0.2], eyes: 2, spikes: 6,
  },
  lantern: {
    form: 'orb', height: 1.6, radius: 0.34, skin: 'crystal',
    body: [0.9, 0.85, 0.45], dark: [0.4, 0.35, 0.15], light: [1.0, 0.97, 0.7],
    glow: [1.0, 0.92, 0.5], eyes: 1, float: true,
  },
  creeper: {
    form: 'spider', height: 0.85, radius: 0.5, skin: 'flesh',
    body: [0.32, 0.42, 0.28], dark: [0.14, 0.19, 0.12], light: [0.5, 0.65, 0.4],
    glow: [0.6, 1.0, 0.4], eyes: 4, legs: 6,
  },
  shrieker: {
    form: 'plant', height: 1.9, radius: 0.45, skin: 'flesh',
    body: [0.55, 0.3, 0.5], dark: [0.24, 0.12, 0.22], light: [0.8, 0.55, 0.75],
    glow: [1.0, 0.4, 0.8], eyes: 1,
  },
  thornAlpha: {
    form: 'quadruped', height: 1.7, radius: 0.65, skin: 'bone',
    body: [0.62, 0.34, 0.18], dark: [0.28, 0.14, 0.07], light: [0.9, 0.6, 0.3],
    glow: [1.0, 0.55, 0.15], eyes: 3, spikes: 10,
  },

  // ---- floor 2 ----------------------------------------------------------
  batling: {
    form: 'flyer', height: 0.7, radius: 0.36, skin: 'flesh',
    body: [0.35, 0.36, 0.6], dark: [0.14, 0.15, 0.28], light: [0.6, 0.62, 0.9],
    glow: [0.3, 1.0, 0.85], eyes: 2, wings: 1.1, float: true,
  },
  crawler: {
    form: 'spider', height: 0.95, radius: 0.55, skin: 'flesh',
    body: [0.2, 0.45, 0.5], dark: [0.08, 0.2, 0.24], light: [0.4, 0.7, 0.78],
    glow: [0.4, 1.0, 0.9], eyes: 6, legs: 8,
  },
  spitter: {
    form: 'blob', height: 1.3, radius: 0.55, skin: 'flesh',
    body: [0.2, 0.6, 0.48], dark: [0.08, 0.26, 0.2], light: [0.45, 0.85, 0.72],
    glow: [0.65, 1.0, 0.4], eyes: 2, cap: true,
  },
  gloomOrb: {
    form: 'orb', height: 1.7, radius: 0.5, skin: 'crystal',
    body: [0.35, 0.28, 0.62], dark: [0.14, 0.1, 0.28], light: [0.62, 0.55, 0.95],
    glow: [0.55, 0.4, 1.0], eyes: 1, float: true,
  },
  stalker: {
    form: 'biped', height: 2.0, radius: 0.4, skin: 'flesh',
    body: [0.16, 0.2, 0.35], dark: [0.06, 0.08, 0.16], light: [0.35, 0.42, 0.62],
    glow: [1.0, 0.25, 0.5], eyes: 2, gaunt: true,
  },
  burrower: {
    form: 'worm', height: 1.1, radius: 0.5, skin: 'flesh',
    body: [0.28, 0.45, 0.38], dark: [0.12, 0.2, 0.16], light: [0.5, 0.72, 0.62],
    glow: [1.0, 0.8, 0.35], eyes: 2,
  },
  stalkerElite: {
    form: 'biped', height: 2.5, radius: 0.5, skin: 'bone',
    body: [0.25, 0.14, 0.4], dark: [0.1, 0.05, 0.18], light: [0.5, 0.34, 0.72],
    glow: [1.0, 0.3, 0.65], eyes: 3, gaunt: true,
  },

  // ---- floor 3 ----------------------------------------------------------
  emberling: {
    form: 'orb', height: 1.0, radius: 0.3, skin: 'crystal',
    body: [1.0, 0.5, 0.18], dark: [0.45, 0.18, 0.05], light: [1.0, 0.8, 0.45],
    glow: [1.0, 0.55, 0.15], eyes: 2, float: true,
  },
  forgeGolem: {
    form: 'golem', height: 2.3, radius: 0.75, skin: 'metal',
    body: [0.48, 0.32, 0.24], dark: [0.2, 0.13, 0.1], light: [0.72, 0.5, 0.36],
    glow: [1.0, 0.6, 0.2], eyes: 2,
  },
  slagHound: {
    form: 'quadruped', height: 1.25, radius: 0.5, skin: 'metal',
    body: [0.4, 0.24, 0.16], dark: [0.17, 0.1, 0.06], light: [0.65, 0.4, 0.26],
    glow: [1.0, 0.45, 0.12], eyes: 2, spikes: 7,
  },
  bellowsImp: {
    form: 'flyer', height: 1.0, radius: 0.4, skin: 'flesh',
    body: [0.7, 0.3, 0.18], dark: [0.3, 0.12, 0.06], light: [1.0, 0.55, 0.35],
    glow: [1.0, 0.8, 0.3], eyes: 2, wings: 0.9, float: true,
  },
  anvilTurret: {
    form: 'turret', height: 1.5, radius: 0.6, skin: 'metal',
    body: [0.42, 0.34, 0.28], dark: [0.18, 0.14, 0.11], light: [0.66, 0.55, 0.45],
    glow: [1.0, 0.6, 0.25], eyes: 1,
  },
  golemElite: {
    form: 'golem', height: 3.0, radius: 0.95, skin: 'metal',
    body: [0.55, 0.24, 0.14], dark: [0.24, 0.1, 0.05], light: [0.85, 0.45, 0.24],
    glow: [1.0, 0.8, 0.25], eyes: 3,
  },

  // ---- floor 4 ----------------------------------------------------------
  lavaSlug: {
    form: 'blob', height: 1.2, radius: 0.7, skin: 'crystal',
    body: [0.85, 0.32, 0.12], dark: [0.35, 0.11, 0.03], light: [1.0, 0.65, 0.3],
    glow: [1.0, 0.45, 0.1], eyes: 2, cap: false,
  },
  pyroWisp: {
    form: 'orb', height: 1.8, radius: 0.3, skin: 'crystal',
    body: [1.0, 0.6, 0.25], dark: [0.5, 0.22, 0.06], light: [1.0, 0.9, 0.6],
    glow: [1.0, 0.7, 0.25], eyes: 0, float: true,
  },
  obsidianKnight: {
    form: 'biped', height: 2.2, radius: 0.55, skin: 'metal',
    body: [0.14, 0.12, 0.18], dark: [0.05, 0.04, 0.07], light: [0.35, 0.3, 0.42],
    glow: [1.0, 0.3, 0.15], eyes: 2, armored: true,
  },
  geyserMouth: {
    form: 'turret', height: 1.1, radius: 0.8, skin: 'rubble',
    body: [0.3, 0.16, 0.12], dark: [0.12, 0.06, 0.04], light: [0.55, 0.3, 0.2],
    glow: [1.0, 0.4, 0.1], eyes: 0,
  },
  flameDancer: {
    form: 'biped', height: 1.9, radius: 0.4, skin: 'flesh',
    body: [1.0, 0.4, 0.25], dark: [0.45, 0.14, 0.06], light: [1.0, 0.75, 0.5],
    glow: [1.0, 0.85, 0.3], eyes: 2, gaunt: true,
  },
  knightElite: {
    form: 'biped', height: 2.8, radius: 0.7, skin: 'metal',
    body: [0.2, 0.1, 0.24], dark: [0.08, 0.03, 0.1], light: [0.45, 0.28, 0.5],
    glow: [1.0, 0.2, 0.45], eyes: 3, armored: true,
  },

  // ---- floor 5 ----------------------------------------------------------
  prismSprite: {
    form: 'orb', height: 1.6, radius: 0.32, skin: 'crystal',
    body: [0.4, 0.85, 1.0], dark: [0.14, 0.35, 0.45], light: [0.85, 0.98, 1.0],
    glow: [0.35, 0.9, 1.0], eyes: 2, float: true,
  },
  gemGolem: {
    form: 'golem', height: 2.6, radius: 0.85, skin: 'crystal',
    body: [0.5, 0.36, 0.85], dark: [0.2, 0.14, 0.38], light: [0.78, 0.62, 1.0],
    glow: [1.0, 0.85, 0.3], eyes: 2,
  },
  hoardMimic: {
    form: 'mimic', height: 1.3, radius: 0.7, skin: 'metal',
    body: [0.65, 0.48, 0.16], dark: [0.28, 0.2, 0.06], light: [1.0, 0.82, 0.3],
    glow: [1.0, 0.3, 0.6], eyes: 2,
  },
  shardHound: {
    form: 'quadruped', height: 1.2, radius: 0.48, skin: 'crystal',
    body: [0.45, 1.0, 0.42], dark: [0.18, 0.42, 0.16], light: [0.75, 1.0, 0.72],
    glow: [0.35, 0.95, 1.0], eyes: 2, spikes: 8,
  },
  dragonWhelp: {
    form: 'dragon', height: 1.6, radius: 0.6, skin: 'flesh',
    body: [1.0, 0.55, 0.24], dark: [0.42, 0.2, 0.07], light: [1.0, 0.8, 0.55],
    glow: [0.35, 0.9, 1.0], eyes: 2, wings: 1.2, float: true,
  },
  mimicKing: {
    form: 'mimic', height: 2.0, radius: 1.0, skin: 'metal',
    body: [0.82, 0.62, 0.18], dark: [0.36, 0.26, 0.07], light: [1.0, 0.9, 0.4],
    glow: [1.0, 0.3, 0.65], eyes: 3,
  },

  // ---- bosses -----------------------------------------------------------
  leshy: {
    form: 'boss_leshy', height: 4.2, radius: 1.5, skin: 'bone',
    body: [0.42, 0.32, 0.18], dark: [0.18, 0.13, 0.07], light: [0.68, 0.55, 0.3],
    glow: [0.8, 1.0, 0.35], eyes: 2,
  },
  chiroptera: {
    form: 'boss_bat', height: 3.6, radius: 1.4, skin: 'flesh',
    body: [0.35, 0.28, 0.6], dark: [0.14, 0.1, 0.26], light: [0.62, 0.55, 0.95],
    glow: [0.35, 1.0, 0.9], eyes: 3, wings: 3.0, float: true,
  },
  bellowsmith: {
    form: 'boss_golem', height: 4.4, radius: 1.6, skin: 'metal',
    body: [0.5, 0.26, 0.14], dark: [0.22, 0.1, 0.05], light: [0.8, 0.45, 0.24],
    glow: [1.0, 0.65, 0.2], eyes: 2,
  },
  ignarok: {
    form: 'boss_maw', height: 3.4, radius: 2.0, skin: 'rubble',
    body: [0.5, 0.18, 0.1], dark: [0.2, 0.06, 0.03], light: [0.85, 0.4, 0.2],
    glow: [1.0, 0.45, 0.12], eyes: 3,
  },
  chromadrake: {
    form: 'boss_dragon', height: 5.0, radius: 2.2, skin: 'crystal',
    body: [0.65, 0.42, 1.0], dark: [0.26, 0.16, 0.45], light: [0.9, 0.75, 1.0],
    glow: [1.0, 0.35, 0.75], eyes: 2, wings: 4.0,
  },
};

export function creatureArt(id) {
  return CREATURE_ART[id] || CREATURE_ART.sporeling;
}
