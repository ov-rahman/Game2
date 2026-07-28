/**
 * Sprite atlas baking.
 *
 * All artwork in this game is generated at load time by the painters in
 * paint-*.js and packed into a couple of textures:
 *
 *   - one COMMON atlas: player, item icons, pickups, projectile glyphs
 *   - one atlas PER FLOOR: that floor's tiles, doors, props and monsters
 *
 * The frame loop then only ever blits sub-rectangles, which is the single
 * biggest reason the game holds 60 FPS on integrated graphics.
 */
import { TILE } from '../core/constants.js';
import { creatureArt } from '../data/creature-art.js';
import { ENEMIES } from '../data/enemies.js';
import { ITEMS, ACTIVES } from '../data/items.js';
import { paintCreature } from './paint-creatures.js';
import {
  paintFloor,
  paintFloorDeco,
  paintWall,
  paintWallFill,
  paintRock,
  paintPit,
  paintHazard,
  paintDoor,
} from './paint-tiles.js';
import { paintItem, paintPickup, paintPedestal, paintStairs, paintChest, ITEM_SIZE, PICKUP_SIZE } from './paint-items.js';

const PAD = 2;

/** Ink colour for the baked sprite outline. */
const OUTLINE_RGB = [12, 14, 22];

export class Atlas {
  constructor(display, width, height) {
    const surface = display.createSurface(width, height);
    this.display = display;
    this.canvas = surface.canvas;
    this.ctx = surface.ctx;
    this.width = width;
    this.height = height;
    this.scratch = null;
    this.scratchDark = null;
    this.frames = new Map();
    this.cursorX = PAD;
    this.cursorY = PAD;
    this.shelfHeight = 0;
  }

  /** Reserve a slot and run `paint(ctx, w, h)` translated into it. */
  add(name, w, h, paint) {
    const cw = Math.ceil(w);
    const ch = Math.ceil(h);
    if (this.cursorX + cw + PAD > this.width) {
      this.cursorX = PAD;
      this.cursorY += this.shelfHeight + PAD;
      this.shelfHeight = 0;
    }
    if (this.cursorY + ch + PAD > this.height) {
      // Should never happen with the sizes below; fail loudly rather than
      // silently drawing garbage.
      throw new Error(`Atlas overflow adding "${name}" (${cw}x${ch})`);
    }
    const x = this.cursorX;
    const y = this.cursorY;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();
    paint(ctx, cw, ch);
    ctx.restore();

    this.frames.set(name, { x, y, w: cw, h: ch });
    this.cursorX += cw + PAD;
    if (ch > this.shelfHeight) this.shelfHeight = ch;
    return this.frames.get(name);
  }

  /** Same as add(), but the painter draws around the origin (centred). */
  addCentered(name, size, paint) {
    return this.add(name, size, size, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      paint(ctx, w, h);
    });
  }

  /**
   * Centred sprite with a baked dark outline.
   *
   * Creatures have to stay legible on a bright grove floor and on a dark cave
   * floor alike. Rather than tuning every palette against every background, each
   * creature gets a one-pixel ink line baked in at atlas time — zero runtime cost.
   */
  addOutlined(name, size, paint, width = 1.4) {
    const s = Math.ceil(size);
    if (!this.scratch || this.scratch.width < s) {
      this.scratch = this.display.createSurface(s + 8, s + 8, { readback: true });
      this.scratchDark = this.display.createSurface(s + 8, s + 8, { readback: true });
    }
    const sc = this.scratch.ctx;
    const dk = this.scratchDark.ctx;
    const sw = this.scratch.canvas.width;
    const sh = this.scratch.canvas.height;

    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, sw, sh);
    sc.save();
    sc.translate(s / 2, s / 2);
    paint(sc, s, s);
    sc.restore();

    // Hard-threshold silhouette. Simply tinting the sprite would also catch the
    // soft glow gradients, and eight stacked copies of those read as a black
    // halo rather than an ink line — so only near-opaque pixels count.
    const src = sc.getImageData(0, 0, sw, sh);
    const mask = dk.createImageData(sw, sh);
    const o = OUTLINE_RGB;
    for (let i = 0; i < src.data.length; i += 4) {
      if (src.data[i + 3] > 140) {
        mask.data[i] = o[0];
        mask.data[i + 1] = o[1];
        mask.data[i + 2] = o[2];
        mask.data[i + 3] = 235;
      }
    }
    dk.setTransform(1, 0, 0, 1, 0, 0);
    dk.clearRect(0, 0, sw, sh);
    dk.putImageData(mask, 0, 0);

    return this.add(name, s, s, (ctx) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.drawImage(this.scratchDark.canvas, Math.round(Math.cos(a) * width), Math.round(Math.sin(a) * width));
      }
      ctx.drawImage(this.scratch.canvas, 0, 0);
    });
  }

  has(name) {
    return this.frames.has(name);
  }

  frame(name) {
    return this.frames.get(name) || null;
  }
}

/** Player, items, actives and pickups — identical on every floor. */
export function buildCommonAtlas(display) {
  const atlas = new Atlas(display, 1024, 768);

  // Player animation frames.
  const pArt = creatureArt('player');
  for (let f = 0; f < pArt.frames; f++) {
    atlas.addOutlined(`player_${f}`, pArt.size + 12, (ctx) => {
      paintCreature(ctx, pArt.size, pArt, f, pArt.frames);
    });
  }

  // Familiar / ally sprites.
  for (const key of ['familiar', 'ally']) {
    const art = creatureArt(key);
    for (let f = 0; f < art.frames; f++) {
      atlas.addOutlined(`${key}_${f}`, art.size + 10, (ctx) => {
        paintCreature(ctx, art.size, art, f, art.frames);
      });
    }
  }

  // Item icons.
  for (const [id, item] of Object.entries(ITEMS)) {
    atlas.addOutlined(`item_${id}`, ITEM_SIZE + 8, (ctx) => {
      paintItem(ctx, ITEM_SIZE, item.art);
    });
  }
  for (const [id, act] of Object.entries(ACTIVES)) {
    atlas.addOutlined(`active_${id}`, ITEM_SIZE + 8, (ctx) => {
      paintItem(ctx, ITEM_SIZE, act.art);
    });
  }

  // Pickups (4 animation frames each).
  for (const kind of ['coin', 'key', 'bomb', 'heart', 'halfHeart', 'soul']) {
    for (let f = 0; f < 4; f++) {
      atlas.addOutlined(`pickup_${kind}_${f}`, PICKUP_SIZE + 8, (ctx) => {
        paintPickup(ctx, PICKUP_SIZE, kind, f);
      });
    }
  }

  return atlas;
}

/** Everything that depends on the floor's palette and monster roster. */
export function buildFloorAtlas(display, floorDef) {
  const atlas = new Atlas(display, 1024, 1024);
  const pal = floorDef.palette;
  const theme = floorDef.id;

  for (let v = 0; v < 4; v++) {
    atlas.add(`floor_${v}`, TILE, TILE, (ctx) => paintFloor(ctx, pal, v, floorDef.index * 7 + v));
    atlas.add(`deco_${v}`, TILE, TILE, (ctx) => paintFloorDeco(ctx, pal, theme, v, floorDef.index * 13 + v));
  }
  for (let v = 0; v < 2; v++) {
    atlas.add(`wall_${v}`, TILE, TILE, (ctx) => paintWall(ctx, pal, theme, v));
  }
  atlas.add('wallFill', TILE, TILE, (ctx) => paintWallFill(ctx, pal, theme, floorDef.index));
  atlas.add('rock', TILE, TILE, (ctx) => paintRock(ctx, pal, theme));
  atlas.add('pit', TILE, TILE, (ctx) => paintPit(ctx, pal));
  for (let f = 0; f < 4; f++) {
    atlas.add(`hazard_${f}`, TILE, TILE, (ctx) => paintHazard(ctx, pal, theme, f, 4));
  }
  for (const state of ['open', 'closed', 'locked', 'boss']) {
    atlas.add(`door_${state}`, TILE, TILE * 1.5, (ctx) => paintDoor(ctx, pal, state));
  }

  atlas.addCentered('pedestal', 40, (ctx) => paintPedestal(ctx, 34, pal));
  atlas.addCentered('stairs', 52, (ctx) => paintStairs(ctx, 44, pal));
  atlas.addCentered('chest', 40, (ctx) => paintChest(ctx, 34, pal, false));
  atlas.addCentered('chestOpen', 40, (ctx) => paintChest(ctx, 34, pal, true));

  // Monsters for this floor, plus every minion they can summon.
  const roster = new Set([...floorDef.enemies, ...(floorDef.elites || []), floorDef.boss]);
  for (const id of floorDef.enemies) {
    const def = ENEMIES[id];
    if (def && def.onDeath && def.onDeath.split) roster.add(def.onDeath.split.id);
    if (def && def.shoot && def.shoot.spawn) roster.add(def.shoot.spawn.id);
    if (def && def.params && def.params.spawn) roster.add(def.params.spawn);
  }
  for (const id of floorDef.elites || []) {
    const def = ENEMIES[id];
    if (def && def.shoot && def.shoot.spawn) roster.add(def.shoot.spawn.id);
  }
  // Bosses summon from their floor's roster; floor 5 also calls whelps/sprites.
  if (floorDef.boss === 'chromadrake') {
    roster.add('dragonWhelp');
    roster.add('prismSprite');
  }
  if (floorDef.boss === 'bellowsmith') roster.add('emberling');
  if (floorDef.boss === 'chiroptera') roster.add('bat');
  if (floorDef.boss === 'leshy') {
    roster.add('sproutling');
    roster.add('thornbug');
  }

  for (const id of roster) {
    const spriteKey = ENEMIES[id] ? ENEMIES[id].sprite : id;
    const art = creatureArt(spriteKey);
    for (let f = 0; f < art.frames; f++) {
      const name = `c_${spriteKey}_${f}`;
      if (atlas.has(name)) continue;
      atlas.addOutlined(name, art.size + 14, (ctx) => {
        paintCreature(ctx, art.size, art, f, art.frames);
      });
    }
  }

  atlas.palette = pal;
  atlas.theme = theme;
  return atlas;
}
