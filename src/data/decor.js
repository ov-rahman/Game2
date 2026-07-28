/**
 * Room styles and scatter tables.
 *
 * Two rooms on the same floor should not look like the same room. Each room
 * picks a *style* — a masonry, a floor, a ceiling and a tint — and a *scatter
 * table* that says what grows, falls or was built there. Everything here is
 * data: adding a new kind of room is an entry in this file, not a code change.
 *
 * Prop kinds are drawn by src/gfx/meshbuild.js. The list it understands:
 *   mound        low wide swell of ground, walkable
 *   rock         faceted boulder
 *   rockPile     two or three boulders leaning together
 *   stalagmite   floor spike, tall only when it hugs a wall
 *   stalactite   ceiling spike
 *   mushroom     stem and cap; `glow: true` makes it a light source
 *   crystal      angular shard cluster; `glow: true` to make it emit
 *   cairn        stacked flat stones
 *   column       broken masonry column stub
 *   beam         timber prop wedged between floor and ceiling
 *   bones        small scatter of pale shards
 *   brazier      bowl on a stem, always glowing
 *   shelf        slab jutting from a wall above head height
 *   roots        strands hanging from the ceiling
 */

/**
 * Styles are indexed by name so a floor can share one with another floor.
 * `wall`, `floor`, `ceiling` name TILE slots; `tint` multiplies the palette.
 */
/**
 * `mix` is the floor's *other* tiles. The mesh builder picks one per sub-quad,
 * which is the difference between a floor and a chessboard: a single tile laid
 * on a regular grid draws that grid back on top of whatever relief the ground
 * has, however good the tile is.
 */
export const STYLES = {
  brick: {
    wall: 'WALL', floor: 'FLOOR', ceiling: 'CEILING', tint: [1, 1, 1],
    mix: ['FLOOR', 'FLOOR', 'FLOOR', 'FLOOR_ALT', 'FLOOR_ALT', 'MORTAR', 'FLOOR_COBBLE', 'FLOOR'],
  },
  ashlar: {
    wall: 'WALL_ALT', floor: 'FLOOR_ALT', ceiling: 'CEILING', tint: [1.04, 1.02, 0.96],
    mix: ['FLOOR_ALT', 'FLOOR_ALT', 'FLOOR_ALT', 'FLOOR', 'MORTAR', 'FLOOR_ALT', 'ROCK', 'FLOOR'],
  },
  rough: {
    wall: 'WALL_ROUGH', floor: 'FLOOR_COBBLE', ceiling: 'CEILING', tint: [0.94, 0.96, 0.98],
    mix: ['FLOOR_COBBLE', 'FLOOR_COBBLE', 'ROCK', 'FLOOR_COBBLE', 'MORTAR', 'ROCK', 'FLOOR_COBBLE', 'MOSS'],
  },
  tiled: {
    wall: 'WALL_TILED', floor: 'FLOOR_TILED', ceiling: 'CEIL_VAULT', tint: [1.02, 1.0, 1.06],
    mix: ['FLOOR_TILED', 'FLOOR_TILED', 'FLOOR_TILED', 'FLOOR', 'MORTAR', 'FLOOR_TILED', 'FLOOR_ALT', 'FLOOR_TILED'],
  },
  ruined: {
    wall: 'WALL_CRACKED', floor: 'FLOOR_COBBLE', ceiling: 'CEILING', tint: [0.9, 0.92, 0.9],
    mix: ['FLOOR_COBBLE', 'ROCK', 'MORTAR', 'FLOOR_COBBLE', 'MOSS', 'ROCK', 'FLOOR_COBBLE', 'MORTAR'],
  },
  vaulted: {
    wall: 'WALL_RIB', floor: 'FLOOR_TILED', ceiling: 'CEIL_VAULT', tint: [1.06, 1.03, 0.98],
    mix: ['FLOOR_TILED', 'FLOOR_TILED', 'FLOOR_ALT', 'FLOOR_TILED', 'MORTAR', 'FLOOR_TILED', 'FLOOR', 'FLOOR_TILED'],
  },
  timber: {
    wall: 'WALL_ROUGH', floor: 'FLOOR_PLANK', ceiling: 'CEILING', tint: [1.0, 0.95, 0.88],
    mix: ['FLOOR_PLANK', 'FLOOR_PLANK', 'FLOOR_PLANK', 'FLOOR_COBBLE', 'FLOOR_PLANK', 'MORTAR', 'FLOOR_PLANK', 'ROCK'],
  },
  // Not masonry at all: the style a room gets when nobody built it.
  cavern: {
    wall: 'ROCK', floor: 'ROCK', ceiling: 'ROCK', tint: [0.92, 0.94, 0.92],
    mix: ['ROCK', 'ROCK', 'FLOOR_COBBLE', 'ROCK', 'MOSS', 'ROCK', 'RUBBLE', 'ROCK'],
  },
};

/**
 * What a cave is allowed to grow. Anything built — columns, beams, sconces,
 * cairns — is filtered out of a natural room, because the whole reading of the
 * space is that nobody has been here to build it.
 */
export const NATURAL_KINDS = new Set([
  'rock',
  'rockPile',
  'stalagmite',
  'stalactite',
  'mushroom',
  'crystal',
  'mound',
  'roots',
  'grass',
  'stream',
]);

/** Fallback used when a floor names nothing. */
const DEFAULT_SCATTER = [
  { kind: 'rock', weight: 3 },
  { kind: 'stalagmite', weight: 2 },
  { kind: 'stalactite', weight: 2 },
  { kind: 'shelf', weight: 2 },
];

/**
 * Per-floor decor. `styles` is the pool of room styles; `scatter` is the
 * weighted table of things placed in the open; `density` scales how much.
 *
 * `corridor` names the style corridors use, so the connective tissue reads as
 * one continuous structure while the rooms it links do not.
 */
export const DECOR = {
  grove: {
    corridor: 'rough',
    styles: ['rough', 'ruined', 'brick', 'timber'],
    density: 0.95,
    sets: ['camp', 'ruin', 'cairnStack'],
    setChance: 0.5,
    scatter: [
      { kind: 'grass', weight: 5, color: [0.42, 0.78, 0.34] },
      { kind: 'vine', weight: 4, color: [0.45, 0.8, 0.36] },
      { kind: 'stream', weight: 2, liquid: true },
      { kind: 'mushroom', weight: 5, glow: true, color: [0.55, 1.0, 0.5] },
      { kind: 'mushroom', weight: 3, color: [0.85, 0.75, 0.45] },
      { kind: 'mound', weight: 4 },
      { kind: 'rock', weight: 3 },
      { kind: 'rockPile', weight: 2 },
      { kind: 'roots', weight: 4 },
      { kind: 'stalactite', weight: 1 },
      { kind: 'beam', weight: 2 },
      { kind: 'column', weight: 1 },
      { kind: 'shelf', weight: 2 },
    ],
  },

  hollow: {
    corridor: 'rough',
    styles: ['rough', 'brick', 'ashlar', 'ruined'],
    density: 1.0,
    sets: ['ruin', 'cairnStack', 'camp'],
    setChance: 0.42,
    scatter: [
      { kind: 'stream', weight: 4, liquid: true },
      { kind: 'grass', weight: 2, color: [0.3, 0.62, 0.6] },
      { kind: 'vine', weight: 2, color: [0.32, 0.66, 0.6] },
      { kind: 'stalactite', weight: 6 },
      { kind: 'stalagmite', weight: 5 },
      { kind: 'crystal', weight: 3, glow: true, color: [0.3, 1.0, 0.86] },
      { kind: 'rock', weight: 3 },
      { kind: 'rockPile', weight: 2 },
      { kind: 'mound', weight: 2 },
      { kind: 'bones', weight: 2 },
      { kind: 'shelf', weight: 3 },
      { kind: 'cairn', weight: 1 },
    ],
  },

  forge: {
    corridor: 'ashlar',
    styles: ['ashlar', 'vaulted', 'brick', 'tiled'],
    density: 1.25,
    sets: ['ruin', 'camp'],
    setChance: 0.55,
    scatter: [
      { kind: 'stream', weight: 3, liquid: true },
      { kind: 'brazier', weight: 4, color: [1.0, 0.62, 0.25] },
      { kind: 'column', weight: 4 },
      { kind: 'rock', weight: 3 },
      { kind: 'cairn', weight: 3 },
      { kind: 'beam', weight: 3 },
      { kind: 'stalactite', weight: 2 },
      { kind: 'bones', weight: 2 },
      { kind: 'shelf', weight: 2 },
    ],
  },

  lavalake: {
    corridor: 'ruined',
    styles: ['ruined', 'rough', 'ashlar', 'brick'],
    density: 1.15,
    sets: ['ruin', 'cairnStack'],
    setChance: 0.5,
    scatter: [
      { kind: 'stream', weight: 4, liquid: true },
      { kind: 'stalagmite', weight: 5 },
      { kind: 'rock', weight: 4 },
      { kind: 'rockPile', weight: 3 },
      { kind: 'crystal', weight: 2, glow: true, color: [1.0, 0.45, 0.15] },
      { kind: 'bones', weight: 3 },
      { kind: 'column', weight: 2 },
      { kind: 'stalactite', weight: 3 },
      { kind: 'brazier', weight: 1, color: [1.0, 0.5, 0.2] },
    ],
  },

  hoard: {
    corridor: 'tiled',
    styles: ['tiled', 'vaulted', 'ashlar', 'brick'],
    density: 1.1,
    sets: ['cairnStack', 'ruin', 'camp'],
    setChance: 0.55,
    scatter: [
      { kind: 'stream', weight: 3, liquid: true },
      { kind: 'grass', weight: 2, color: [0.7, 0.5, 0.95] },
      { kind: 'crystal', weight: 3, glow: true, color: [1.0, 0.31, 0.64] },
      { kind: 'crystal', weight: 2, glow: true, color: [0.31, 0.88, 1.0] },
      { kind: 'crystal', weight: 2, glow: true, color: [1.0, 0.88, 0.31] },
      { kind: 'crystal', weight: 2, glow: true, color: [0.49, 1.0, 0.42] },
      { kind: 'column', weight: 5 },
      { kind: 'cairn', weight: 4 },
      { kind: 'brazier', weight: 3, color: [0.69, 0.42, 1.0] },
      { kind: 'stalactite', weight: 3 },
      { kind: 'shelf', weight: 3 },
      { kind: 'mound', weight: 2 },
      { kind: 'bones', weight: 2 },
    ],
  },
};

export function decorFor(floorDef) {
  const d = DECOR[floorDef.id];
  if (d) return d;
  return { corridor: 'brick', styles: ['brick'], density: 1, scatter: DEFAULT_SCATTER };
}
