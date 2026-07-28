/**
 * Visual descriptors for every creature sprite.
 *
 * The atlas painter (src/render/atlas.js) turns each row into pixels with a
 * generic "creature" routine parameterised by `form`. This keeps ~50 monsters
 * on a handful of drawing routines while still giving each one its own
 * silhouette, palette and animation quirks — and it means new monsters are a
 * data edit, not new drawing code.
 *
 * form      body construction routine
 * size      sprite box in pixels (square)
 * body/dark/light/accent  palette
 * eyes      count of eyes (0 = none)
 * frames    animation frames to bake
 */

export const CREATURE_ART = {
  // ---- floor 1 ----------------------------------------------------------
  slime: { form: 'blob', size: 28, body: '#4fd166', dark: '#2a8f3e', light: '#a8f5b0', accent: '#ffe066', eyes: 2, frames: 4 },
  slimeSmall: { form: 'blob', size: 20, body: '#6fe07f', dark: '#37a04c', light: '#c4ffcb', accent: '#ffe066', eyes: 2, frames: 4 },
  slimeKing: { form: 'blob', size: 44, body: '#3fbf58', dark: '#1f7534', light: '#9cf0a8', accent: '#ffd93d', eyes: 3, frames: 4, crown: true },
  sproutling: { form: 'plant', size: 30, body: '#5fb356', dark: '#2f6f38', light: '#a8e08a', accent: '#ff8fb1', eyes: 1, frames: 3 },
  leafling: { form: 'moth', size: 26, body: '#8ede4a', dark: '#4a8f2a', light: '#d9ff9c', accent: '#ffe066', eyes: 2, frames: 4 },
  thornbug: { form: 'bug', size: 28, body: '#c98a3c', dark: '#7a4c18', light: '#ffd18a', accent: '#ff5b4a', eyes: 2, frames: 4, spikes: 5 },
  thornbugElite: { form: 'bug', size: 36, body: '#e05a2a', dark: '#8a2f10', light: '#ffc08a', accent: '#ffe066', eyes: 3, frames: 4, spikes: 8 },
  mossback: { form: 'turtle', size: 34, body: '#57813f', dark: '#2f4a22', light: '#9dc47a', accent: '#7ee081', eyes: 2, frames: 3 },
  wisp: { form: 'wisp', size: 22, body: '#ffe066', dark: '#c79b1a', light: '#fffbe0', accent: '#ffffff', eyes: 0, frames: 4, glow: true },
  stumpler: { form: 'stump', size: 32, body: '#8a6136', dark: '#4e3419', light: '#c39a63', accent: '#7ee081', eyes: 2, frames: 4 },

  // ---- floor 2 ----------------------------------------------------------
  bat: { form: 'bat', size: 24, body: '#5f6fbf', dark: '#2a3160', light: '#a8b6ff', accent: '#3ff0d0', eyes: 2, frames: 4 },
  batSwarmLord: { form: 'bat', size: 38, body: '#8f7bff', dark: '#3a2a70', light: '#d0c8ff', accent: '#3ff0d0', eyes: 3, frames: 4, crown: true },
  crawler: { form: 'bug', size: 28, body: '#2f7f8f', dark: '#154350', light: '#7fd6e0', accent: '#6fe36a', eyes: 4, frames: 4, spikes: 3 },
  spitter: { form: 'blob', size: 30, body: '#2fb08a', dark: '#146049', light: '#8fffd8', accent: '#d9ff6a', eyes: 2, frames: 4 },
  gloomOrb: { form: 'orb', size: 32, body: '#4a3f8f', dark: '#221a50', light: '#a89bff', accent: '#3ff0d0', eyes: 1, frames: 4, glow: true },
  stalker: { form: 'sprite', size: 28, body: '#243a6a', dark: '#0f1a38', light: '#6f8fd0', accent: '#ff4fa3', eyes: 2, frames: 4 },
  stalkerElite: { form: 'sprite', size: 34, body: '#3a2060', dark: '#150a2a', light: '#9f7fe0', accent: '#ff4fa3', eyes: 3, frames: 4 },
  fungling: { form: 'mushroom', size: 30, body: '#6f7fd0', dark: '#2f3a70', light: '#b8c4ff', accent: '#6fe36a', eyes: 2, frames: 3 },
  shrieker: { form: 'plant', size: 32, body: '#7f4fa0', dark: '#3a1e50', light: '#c89fe0', accent: '#3ff0d0', eyes: 1, frames: 3 },
  burrower: { form: 'worm', size: 30, body: '#3f6f5a', dark: '#1c3a2c', light: '#8fd0b0', accent: '#ffd166', eyes: 2, frames: 4 },

  // ---- floor 3 ----------------------------------------------------------
  emberling: { form: 'wisp', size: 22, body: '#ff7a2f', dark: '#a8390a', light: '#ffd98a', accent: '#fff3b0', eyes: 2, frames: 4, glow: true },
  forgeGolem: { form: 'golem', size: 38, body: '#7a4630', dark: '#3a1c10', light: '#c98a5c', accent: '#ff9d3c', eyes: 2, frames: 3 },
  golemElite: { form: 'golem', size: 46, body: '#8f3a20', dark: '#451208', light: '#e08a50', accent: '#ffd93d', eyes: 3, frames: 3 },
  cinderMoth: { form: 'moth', size: 26, body: '#e0693c', dark: '#802a10', light: '#ffc08a', accent: '#ffd93d', eyes: 2, frames: 4 },
  slagHound: { form: 'hound', size: 30, body: '#5a3020', dark: '#2a1208', light: '#a86040', accent: '#ff7a2f', eyes: 2, frames: 4 },
  slagAlpha: { form: 'hound', size: 38, body: '#8a3a18', dark: '#40170a', light: '#e07a40', accent: '#ffd93d', eyes: 3, frames: 4 },
  bellowsImp: { form: 'imp', size: 28, body: '#c04a2a', dark: '#601a0c', light: '#ff9a70', accent: '#ffe066', eyes: 2, frames: 4 },
  anvilTurret: { form: 'turret', size: 34, body: '#6a5040', dark: '#2f2018', light: '#b09070', accent: '#ff9d3c', eyes: 1, frames: 3 },
  magmite: { form: 'orb', size: 28, body: '#d0502a', dark: '#701c0c', light: '#ffa070', accent: '#ffd93d', eyes: 2, frames: 4 },

  // ---- floor 4 ----------------------------------------------------------
  lavaSlug: { form: 'blob', size: 32, body: '#e04a1a', dark: '#7a1a06', light: '#ffb060', accent: '#ffe066', eyes: 2, frames: 4, glow: true },
  pyroWisp: { form: 'wisp', size: 22, body: '#ff9040', dark: '#b03a08', light: '#fff0c0', accent: '#ffffff', eyes: 0, frames: 4, glow: true },
  obsidianKnight: { form: 'knight', size: 34, body: '#2a2438', dark: '#100c18', light: '#6a5f80', accent: '#ff5722', eyes: 2, frames: 3 },
  knightElite: { form: 'knight', size: 42, body: '#3a2040', dark: '#150818', light: '#8a6a9a', accent: '#ff2e63', eyes: 3, frames: 3 },
  geyserMouth: { form: 'maw', size: 34, body: '#4a1f14', dark: '#1f0a06', light: '#a04a28', accent: '#ff5722', eyes: 0, frames: 3 },
  flameDancer: { form: 'sprite', size: 28, body: '#ff5f3c', dark: '#8a1c08', light: '#ffc0a0', accent: '#ffe066', eyes: 2, frames: 4 },
  ashRevenant: { form: 'knight', size: 32, body: '#5a5450', dark: '#252220', light: '#a09890', accent: '#ff5722', eyes: 2, frames: 3 },
  pyroTyrant: { form: 'sprite', size: 38, body: '#ff3c2a', dark: '#8a1000', light: '#ffd0a0', accent: '#ffe066', eyes: 3, frames: 4, crown: true },

  // ---- floor 5 ----------------------------------------------------------
  prismSprite: { form: 'sprite', size: 26, body: '#4fe1ff', dark: '#1a6a90', light: '#e0fbff', accent: '#ff4fa3', eyes: 2, frames: 4, glow: true },
  gemGolem: { form: 'golem', size: 40, body: '#7c5ad0', dark: '#341f68', light: '#c4a8ff', accent: '#ffe14f', eyes: 2, frames: 3 },
  hoardMimic: { form: 'mimic', size: 32, body: '#a8781f', dark: '#503608', light: '#ffd93d', accent: '#ff4fa3', eyes: 2, frames: 4 },
  mimicKing: { form: 'mimic', size: 42, body: '#d0a02a', dark: '#6a4a08', light: '#ffe98a', accent: '#ff4fa3', eyes: 3, frames: 4, crown: true },
  lightWeaver: { form: 'orb', size: 32, body: '#ffe14f', dark: '#9a7a08', light: '#fffbd0', accent: '#4fe1ff', eyes: 1, frames: 4, glow: true },
  weaverElite: { form: 'orb', size: 40, body: '#ffffff', dark: '#8a8ab0', light: '#ffffff', accent: '#ff4fa3', eyes: 3, frames: 4, glow: true },
  shardHound: { form: 'hound', size: 30, body: '#7cff6b', dark: '#2a7a20', light: '#d8ffd0', accent: '#4fe1ff', eyes: 2, frames: 4 },
  dragonWhelp: { form: 'dragon', size: 34, body: '#ff8b3d', dark: '#8a3a08', light: '#ffd0a0', accent: '#4fe1ff', eyes: 2, frames: 4 },

  // ---- bosses -----------------------------------------------------------
  // Bark-brown body so he never blends into the grove's green floor.
  leshy: { form: 'leshy', size: 92, body: '#7a5330', dark: '#3a2614', light: '#b98a4e', accent: '#ffd24a', eyes: 2, frames: 4 },
  chiroptera: { form: 'bat', size: 96, body: '#6f5fd0', dark: '#2a2060', light: '#c8b8ff', accent: '#3ff0d0', eyes: 3, frames: 4, crown: true },
  bellowsmith: { form: 'golem', size: 100, body: '#8a4a28', dark: '#3a1a0c', light: '#e09050', accent: '#ffd93d', eyes: 2, frames: 3 },
  ignarok: { form: 'maw', size: 104, body: '#c02a10', dark: '#5a0c02', light: '#ff9050', accent: '#ffe066', eyes: 3, frames: 4 },
  chromadrake: { form: 'dragon', size: 116, body: '#b06bff', dark: '#3a1a70', light: '#ffd0ff', accent: '#ffe14f', eyes: 2, frames: 4, crown: true },

  // ---- allies / familiars -----------------------------------------------
  familiar: { form: 'wisp', size: 18, body: '#7cff6b', dark: '#2a7a20', light: '#e0ffd0', accent: '#ffffff', eyes: 0, frames: 4, glow: true },
  ally: { form: 'sprite', size: 22, body: '#4fe1ff', dark: '#1a6a90', light: '#e0fbff', accent: '#ffffff', eyes: 2, frames: 4, glow: true },
  player: { form: 'player', size: 28, body: '#f0e6d2', dark: '#8a6a4a', light: '#ffffff', accent: '#4fe1ff', eyes: 2, frames: 6 },
};

export function creatureArt(sprite) {
  return CREATURE_ART[sprite] || CREATURE_ART.slime;
}
