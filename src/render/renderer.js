/**
 * The renderer.
 *
 * Reads simulation state and draws it. It never mutates the game — the only
 * state it owns is presentation state (atlases, cached room bitmaps, particles,
 * screen shake). Interpolation between the last two fixed steps keeps motion
 * smooth on refresh rates above the 60 Hz simulation.
 */
import {
  TILE,
  ROOM_W,
  ROOM_H,
  VIEW_W,
  VIEW_H,
  VIEW_OX,
  VIEW_OY,
  T,
  TEAM,
  ROOM_KIND,
} from '../core/constants.js';
import { STATE } from '../core/game.js';
import { DOOR_TILE } from '../core/world/roomgen.js';
import { buildCommonAtlas, buildFloorAtlas } from './atlas.js';
import { Particles, fxToParticles } from './particles.js';
import { drawHud, drawOverlays } from './hud.js';
import { drawMinimap } from './minimap.js';
import { rgba, mix, TAU, circle, glow } from './draw.js';
import { creatureArt } from '../data/creature-art.js';
import { lerp, clamp } from '../core/math.js';

const ROOM_PX_W = ROOM_W * TILE;
const ROOM_PX_H = ROOM_H * TILE;

export class Renderer {
  constructor(display, game) {
    this.display = display;
    this.game = game;
    const target = display.target();
    this.ctx = target.ctx;

    this.common = buildCommonAtlas(display);
    this.floorAtlases = new Map();
    this.atlas = null;

    this.roomCache = display.createSurface(ROOM_PX_W, ROOM_PX_H);
    this.prevRoomCache = display.createSurface(ROOM_PX_W, ROOM_PX_H);
    this.roomCacheValid = false;

    this.particles = new Particles();
    this.time = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashT = 0;
    this.flashColor = '#ffffff';
    this.hitFlash = 0;

    this.bindEvents();
  }

  bindEvents() {
    const g = this.game;
    g.events.on('fx', (e) => {
      fxToParticles(this.particles, e, this.palette());
      if (e.type === 'explosion' || e.type === 'bossDeath') this.flash(0.12, '#ffd9a0');
      if (e.type === 'playerHurt') this.flash(0.1, '#ff3355');
      if (e.type === 'phaseShift') this.flash(0.16, e.color || '#ffffff');
    });
    g.events.on('roomEnter', () => this.invalidateRoom());
    g.events.on('tilesChanged', () => this.invalidateRoom());
    g.events.on('floorStart', () => {
      this.particles.clear();
      this.ensureFloorAtlas();
      this.invalidateRoom();
    });
    g.events.on('transition', (tr) => {
      // Keep the room we are leaving so the slide has something to show.
      this.prevRoomCache.ctx.clearRect(0, 0, ROOM_PX_W, ROOM_PX_H);
      this.prevRoomCache.ctx.drawImage(this.roomCache.canvas, 0, 0);
      this.prevSnapshot = this.captureRoomSnapshot();
    });
    g.events.on('runStart', () => {
      this.particles.clear();
      this.ensureFloorAtlas();
      this.invalidateRoom();
    });
  }

  palette() {
    return this.game.floor ? this.game.floor.def.palette : null;
  }

  ensureFloorAtlas() {
    const g = this.game;
    if (!g.floor) return;
    const key = g.floor.def.id;
    if (!this.floorAtlases.has(key)) {
      this.floorAtlases.set(key, buildFloorAtlas(this.display, g.floor.def));
    }
    this.atlas = this.floorAtlases.get(key);
  }

  /** Pre-warm every floor atlas so mid-run descents never hitch. */
  prewarm(floorDefs) {
    for (const def of floorDefs) {
      if (!this.floorAtlases.has(def.id)) {
        this.floorAtlases.set(def.id, buildFloorAtlas(this.display, def));
      }
    }
  }

  flash(time, color) {
    this.flashT = Math.max(this.flashT, time);
    this.flashColor = color;
  }

  invalidateRoom() {
    this.roomCacheValid = false;
  }

  captureRoomSnapshot() {
    return { id: this.game.room ? this.game.room.id : -1 };
  }

  // ------------------------------------------------------------ room cache

  buildRoomCache() {
    const g = this.game;
    if (!g.room || !this.atlas) return;
    const ctx = this.roomCache.ctx;
    const pal = g.floor.def.palette;
    ctx.clearRect(0, 0, ROOM_PX_W, ROOM_PX_H);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);

    const tiles = g.room.tiles;
    const img = this.atlas.canvas;

    // Hash-based variant selection: a checkerboard is what you get from any
    // simple (x+y) rule, and it is instantly readable as a pattern.
    const variantAt = (tx, ty) => {
      let h = (tx * 374761393 + ty * 668265263 + g.room.seed) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      return (h ^ (h >>> 16)) & 3;
    };

    for (let ty = 0; ty < ROOM_H; ty++) {
      for (let tx = 0; tx < ROOM_W; tx++) {
        const t = tiles[ty * ROOM_W + tx];
        const x = tx * TILE;
        const y = ty * TILE;
        const v = variantAt(tx, ty);

        if (t === T.WALL) {
          // A wall with another wall above it shows only its face, so blocks
          // read as volumes rather than a repeating stamp.
          const above = ty > 0 ? tiles[(ty - 1) * ROOM_W + tx] : T.WALL;
          this.blit(ctx, above === T.WALL ? 'wallFill' : `wall_${v & 1}`, x, y);
          continue;
        }
        if (t === T.PIT) {
          this.blit(ctx, 'pit', x, y);
          continue;
        }
        // Everything else sits on a floor tile.
        this.blit(ctx, t === T.DECO ? `deco_${v}` : `floor_${v}`, x, y);
        if (t === T.ROCK) this.blit(ctx, 'rock', x, y);
      }
    }

    // Contact shadow below walls, drawn once into the cache.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let ty = 0; ty < ROOM_H - 1; ty++) {
      for (let tx = 0; tx < ROOM_W; tx++) {
        if (tiles[ty * ROOM_W + tx] !== T.WALL) continue;
        const below = tiles[(ty + 1) * ROOM_W + tx];
        if (below === T.WALL) continue;
        ctx.fillRect(tx * TILE, (ty + 1) * TILE, TILE, 5);
      }
    }

    this.drawDoorsToCache(ctx);
    this.roomCacheValid = true;
  }

  drawDoorsToCache(ctx) {
    const g = this.game;
    const room = g.room;
    for (let d = 0; d < 4; d++) {
      if (room.doors[d] == null) continue;
      if (room.secretSide[d] && !room.secretOpen) continue;
      const target = g.floor.rooms[room.doors[d]];
      let state = 'closed';
      if (room.locked[d]) state = 'locked';
      else if (target.kind === ROOM_KIND.BOSS) state = 'boss';
      const t = DOOR_TILE[d];
      const cx = (t.x + 0.5) * TILE;
      const cy = (t.y + 0.5) * TILE;
      // Rotation d*90° maps the sprite's +Y (its "inward" direction) onto the
      // room interior for each of the four wall sides.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((d * Math.PI) / 2);
      const f = this.atlas.frame(`door_${state}`);
      if (f) ctx.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, -TILE / 2, -TILE * 0.5, TILE, TILE * 1.35);
      ctx.restore();
    }
  }

  blit(ctx, name, x, y) {
    const f = this.atlas.frame(name);
    if (!f) return;
    ctx.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
  }

  blitCentered(ctx, atlas, name, x, y, scale = 1, flip = false) {
    const f = atlas.frame(name);
    if (!f) return;
    const w = f.w * scale;
    const h = f.h * scale;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, x - w / 2, y - h / 2, w, h);
    }
  }

  // ---------------------------------------------------------------- frame

  render(alpha, frameDt) {
    const g = this.game;
    const ctx = this.ctx;
    this.time += frameDt;
    this.particles.update(Math.min(frameDt, 0.05));

    if (this.flashT > 0) this.flashT -= frameDt;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (g.state === STATE.TITLE) {
      drawOverlays(ctx, g, this, alpha);
      return;
    }

    this.ensureFloorAtlas();
    if (!this.atlas || !g.room) {
      drawOverlays(ctx, g, this, alpha);
      return;
    }
    if (!this.roomCacheValid) this.buildRoomCache();

    // Screen shake, decaying with the remaining shake timer.
    if (g.shakeT > 0) {
      const k = g.shakeT;
      this.shakeX = (Math.random() - 0.5) * g.shakeMag * k * 3;
      this.shakeY = (Math.random() - 0.5) * g.shakeMag * k * 3;
    } else {
      this.shakeX *= 0.8;
      this.shakeY *= 0.8;
    }

    ctx.save();
    ctx.translate(VIEW_OX + Math.round(this.shakeX), VIEW_OY + Math.round(this.shakeY));

    if (g.state === STATE.TRANSITION && g.transition) {
      this.drawTransition(ctx, g, alpha);
    } else {
      ctx.drawImage(this.roomCache.canvas, 0, 0);
      this.drawRoomContents(ctx, g, alpha);
    }

    ctx.restore();

    // Frame around the playfield hides any sub-pixel bleed at the edges.
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_OY);
    ctx.fillRect(0, VIEW_OY + ROOM_PX_H, VIEW_W, VIEW_H - VIEW_OY - ROOM_PX_H);
    ctx.fillRect(0, 0, VIEW_OX, VIEW_H);
    ctx.fillRect(VIEW_OX + ROOM_PX_W, 0, VIEW_W - VIEW_OX - ROOM_PX_W, VIEW_H);

    drawHud(ctx, g, this);
    drawMinimap(ctx, g, this);
    drawOverlays(ctx, g, this, alpha);

    if (this.flashT > 0) {
      ctx.globalAlpha = Math.min(0.5, this.flashT * 3);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  drawTransition(ctx, g, alpha) {
    const tr = g.transition;
    const k = clamp((tr.t + alpha * (1 / 60)) / tr.duration, 0, 1);
    const e = k * k * (3 - 2 * k);
    const dir = tr.dir;
    const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0;
    const dy = dir === 2 ? -1 : dir === 0 ? 1 : 0;

    // Outgoing room slides away; the destination is drawn dark until arrival.
    ctx.save();
    ctx.translate(dx * ROOM_PX_W * e, dy * ROOM_PX_H * e);
    ctx.drawImage(this.prevRoomCache.canvas, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(-dx * ROOM_PX_W * (1 - e), -dy * ROOM_PX_H * (1 - e));
    ctx.fillStyle = g.floor.def.palette.bg;
    ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);
    ctx.globalAlpha = e;
    ctx.fillStyle = rgba(g.floor.def.palette.floorA, 0.9);
    ctx.fillRect(TILE, TILE, ROOM_PX_W - TILE * 2, ROOM_PX_H - TILE * 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawRoomContents(ctx, g, alpha) {
    const pal = g.floor.def.palette;

    // Animated hazard tiles (only the ones that exist).
    const hz = Math.floor(this.time * 6) % 4;
    const tiles = g.room.tiles;
    for (let ty = 1; ty < ROOM_H - 1; ty++) {
      for (let tx = 1; tx < ROOM_W - 1; tx++) {
        if (tiles[ty * ROOM_W + tx] === T.HAZARD) {
          this.blit(ctx, `hazard_${hz}`, tx * TILE, ty * TILE);
        }
      }
    }

    this.drawGroundEffects(ctx, g);
    this.particles.drawUnder(ctx);
    this.drawProps(ctx, g);
    this.drawPickups(ctx, g);
    this.drawEntities(ctx, g, alpha);
    this.drawShots(ctx, g, alpha);
    this.drawAirEffects(ctx, g);
    this.particles.draw(ctx);

    if (g.player.flags.light) {
      glow(ctx, g.player.x, g.player.y, 130, '#ffe066', 0.13);
    }
    if (pal.fog) {
      ctx.fillStyle = pal.fog;
      ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);
    }
  }

  drawGroundEffects(ctx, g) {
    for (const f of g.effects) {
      if (f.type === 'goo') {
        const k = 1 - f.t / f.time;
        ctx.globalAlpha = clamp(k * 1.4, 0, 0.85);
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.radius, f.radius * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'telegraph') {
        const k = clamp(f.t / f.time, 0, 1);
        const r = f.radius || 26;
        ctx.strokeStyle = rgba(f.color || '#ffffff', 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(f.color || '#ffffff', 0.16 + Math.sin(this.time * 22) * 0.06);
        ctx.beginPath();
        ctx.arc(f.x, f.y, r * k, 0, TAU);
        ctx.fill();
      } else if (f.type === 'shockwave') {
        const k = clamp(f.t / 0.4, 0, 1);
        ctx.strokeStyle = rgba(f.color, (1 - k) * 0.9);
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * (0.25 + k * 0.85), 0, TAU);
        ctx.stroke();
      }
    }
  }

  drawAirEffects(ctx, g) {
    for (const f of g.effects) {
      if (f.type === 'cloud') {
        const k = 1 - f.t / f.time;
        ctx.globalAlpha = clamp(k, 0, 0.4);
        ctx.fillStyle = f.color;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + this.time * 0.6;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * f.radius * 0.35, f.y + Math.sin(a) * f.radius * 0.3, f.radius * 0.6, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'bomb') {
        const pulse = 1 + Math.sin(f.t * 22) * 0.12;
        this.blitCentered(ctx, this.common, `pickup_bomb_${Math.floor(this.time * 8) % 4}`, f.x, f.y, pulse);
      } else if (f.type === 'beam') {
        const k = 1 - f.t / f.time;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        const w = f.width * (0.6 + k * 0.6);
        const grd = ctx.createLinearGradient(0, 0, f.len, 0);
        grd.addColorStop(0, rgba(f.color, 0.95 * k));
        grd.addColorStop(1, rgba(f.color, 0));
        ctx.fillStyle = grd;
        ctx.fillRect(0, -w / 2, f.len, w);
        ctx.fillStyle = rgba('#ffffff', 0.7 * k);
        ctx.fillRect(0, -w / 6, f.len, w / 3);
        ctx.restore();
      } else if (f.type === 'starfall' && !f.done) {
        const k = clamp(1 - f.delay / 0.4, 0, 1);
        ctx.strokeStyle = rgba('#ffe14f', 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 22 * (1 - k) + 8, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(f.x, f.y - (1 - k) * 120, 3.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawProps(ctx, g) {
    for (const p of g.props) {
      switch (p.type) {
        case 'pedestal':
        case 'pedestalLocked': {
          this.blitCentered(ctx, this.atlas, 'pedestal', p.x, p.y + 6);
          const bob = Math.sin(this.time * 2.4) * 3;
          if (p.type === 'pedestalLocked') {
            ctx.globalAlpha = 0.45;
          }
          glow(ctx, p.x, p.y - 12 + bob, 22, '#ffe066', 0.3);
          this.blitCentered(ctx, this.common, `item_${p.itemId}`, p.x, p.y - 12 + bob);
          ctx.globalAlpha = 1;
          if (p.type === 'pedestalLocked') {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('заперто', p.x, p.y + 22);
          }
          break;
        }
        case 'stairs':
          this.blitCentered(ctx, this.atlas, 'stairs', p.x, p.y);
          if (p.near) this.label(ctx, 'вниз', p.x, p.y - 22);
          break;
        case 'shopItem': {
          this.blitCentered(ctx, this.atlas, 'pedestal', p.x, p.y + 6);
          const bob = Math.sin(this.time * 2.4 + p.x) * 3;
          if (p.kind === 'item') {
            this.blitCentered(ctx, this.common, `item_${p.itemId}`, p.x, p.y - 12 + bob);
          } else {
            this.blitCentered(ctx, this.common, `pickup_${p.kind}_${Math.floor(this.time * 6) % 4}`, p.x, p.y - 12 + bob);
          }
          const discount = g.player.flags.discount || 0;
          const price = Math.max(1, Math.round(p.price * (1 - discount)));
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = g.player.coins >= price ? '#ffd93d' : '#ff6b6b';
          ctx.fillText(`${price}$`, p.x, p.y + 24);
          break;
        }
        default:
          break;
      }
    }
  }

  label(ctx, text, x, y) {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  drawPickups(ctx, g) {
    const f = Math.floor(this.time * 6) % 4;
    for (const p of g.pickups) {
      const bob = Math.sin(this.time * 3 + p.t) * 2;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 7, 5, 2.4, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      this.blitCentered(ctx, this.common, `pickup_${p.kind}_${f}`, p.x, p.y + bob);
    }
  }

  drawEntities(ctx, g, alpha) {
    // Painter's algorithm on Y so overlaps read correctly.
    const list = [];
    for (const e of g.enemies) list.push(e);
    for (const a of g.allies) list.push({ ally: true, ...a });
    for (const fam of g.player.familiars) list.push({ familiar: true, ...fam });
    if (!g.player.dead) list.push(g.player);
    list.sort((a, b) => a.y - b.y);

    for (const e of list) {
      if (e === g.player) this.drawPlayer(ctx, g, alpha);
      else if (e.ally) this.drawSimple(ctx, 'ally', e, alpha);
      else if (e.familiar) this.drawSimple(ctx, 'familiar', e, alpha);
      else this.drawEnemy(ctx, g, e, alpha);
    }

    for (const o of g.player.orbitals) {
      glow(ctx, o.x, o.y, 12, '#4fe1ff', 0.5);
      circle(ctx, o.x, o.y, 4.5, '#e0fbff');
    }
  }

  drawSimple(ctx, key, e, alpha) {
    const art = creatureArt(key);
    const f = Math.floor(this.time * 8) % art.frames;
    const x = lerp(e.px || e.x, e.x, alpha);
    const y = lerp(e.py || e.y, e.y, alpha);
    this.blitCentered(ctx, this.common, `${key}_${f}`, x, y);
  }

  drawEnemy(ctx, g, e, alpha) {
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    const art = e.art || creatureArt(e.sprite);
    const frames = art.frames;
    const speedFactor = e.dying > 0 ? 0 : 6 + (e.speed || 0) * 0.04;
    const f = frames > 1 ? Math.floor((e.t * speedFactor + e.seedPhase) % frames) : 0;
    const name = `c_${e.sprite}_${f}`;

    ctx.save();
    if (!e.alive) {
      const k = clamp(e.dying / (e.isBoss ? 1.2 : 0.35), 0, 1);
      ctx.globalAlpha = k * 0.9;
      ctx.translate(x, y);
      ctx.scale(1 + (1 - k) * 0.4, 1 - (1 - k) * 0.5);
      ctx.translate(-x, -y);
    } else {
      ctx.globalAlpha = e.alpha == null ? 1 : e.alpha;
    }

    // Telegraph tint: the fight is readable because wind-ups glow.
    const tele = e.ai ? e.ai.telegraph : 0;
    if (tele > 0) {
      glow(ctx, x, y, e.radius * 2.4, '#ffffff', 0.2 + (1 - tele) * 0.25);
    }
    if (e.frozen > 0) {
      glow(ctx, x, y, e.radius * 1.9, '#9fe6ff', 0.4);
    }

    const squash = e.squashT ? 1 + e.squashT * 0.25 : 1;
    if (e.disguised) {
      this.blitCentered(ctx, this.atlas, 'chest', x, y);
    } else if (!e.hidden) {
      if (e.spin) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e.spin);
        this.blitCentered(ctx, this.atlas, name, 0, 0, squash);
        ctx.restore();
      } else {
        this.blitCentered(ctx, this.atlas, name, x, y, squash, e.facing < 0);
      }
    } else {
      // Burrowed: only the mound shows.
      ctx.fillStyle = rgba(this.palette().wallTop, 0.8);
      ctx.beginPath();
      ctx.ellipse(x, y + 4, e.radius * 0.9, e.radius * 0.45, 0, 0, TAU);
      ctx.fill();
    }

    // Damage flash: a white silhouette on top of the sprite.
    if (e.flash > 0 && !e.hidden) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(e.flash * 7, 0, 0.8);
      this.blitCentered(ctx, this.atlas, name, x, y, squash, e.facing < 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // Shield arc for guards.
    if (e.shieldArc > 0 && e.alive) {
      ctx.strokeStyle = rgba('#cfe8ff', 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, e.radius + 5, e.shieldAngle - e.shieldArc / 2, e.shieldAngle + e.shieldArc / 2);
      ctx.stroke();
    }

    // Weaver beams.
    if (e.ai && e.ai.beam) {
      const warn = e.ai.beam.warn > 0;
      for (const a of e.ai.beam.angles) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = warn ? rgba('#ffe14f', 0.25) : rgba('#ffe14f', 0.85);
        const w = warn ? 2 : 8;
        ctx.fillRect(0, -w / 2, 600, w);
        ctx.restore();
      }
    }

    // Elite / boss markers and small health pips.
    if (e.alive && e.elite && !e.isBoss) {
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath();
      ctx.moveTo(x, y - e.radius - 12);
      ctx.lineTo(x + 4, y - e.radius - 6);
      ctx.lineTo(x - 4, y - e.radius - 6);
      ctx.closePath();
      ctx.fill();
    }
    if (e.alive && !e.isBoss && e.hp < e.maxHp) {
      const w = Math.max(14, e.radius * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - w / 2, y - e.radius - 8, w, 3);
      ctx.fillStyle = e.elite ? '#ffd93d' : '#ff5b6b';
      ctx.fillRect(x - w / 2, y - e.radius - 8, (w * e.hp) / e.maxHp, 3);
    }

    ctx.restore();
  }

  drawPlayer(ctx, g, alpha) {
    const p = g.player;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);

    for (const ghost of p.dashGhosts) {
      ctx.globalAlpha = clamp(ghost.t * 2, 0, 0.35);
      this.blitCentered(ctx, this.common, 'player_4', ghost.x, ghost.y, 1, p.facing < 0);
    }
    ctx.globalAlpha = 1;

    let frame = 0;
    if (p.dashT > 0) frame = 4;
    else if (p.hurtFlash > 0) frame = 5;
    else if (p.vx || p.vy) frame = Math.floor(p.walkPhase) % 4;

    // Invulnerability blink.
    if (p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0) ctx.globalAlpha = 0.45;

    if (p.charging && p.charge > 0.1) {
      glow(ctx, x, y, 14 + p.charge * 18, p.charge > 0.65 ? '#ff2e63' : '#4fe1ff', 0.4);
    }
    if (p.shield > 0) {
      ctx.strokeStyle = rgba('#9fe6ff', 0.55 + Math.sin(this.time * 5) * 0.15);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 2, p.radius + 7, 0, TAU);
      ctx.stroke();
    }

    this.blitCentered(ctx, this.common, `player_${frame}`, x, y, 1, p.facing < 0);

    if (p.hurtFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(p.hurtFlash * 2, 0, 0.7);
      this.blitCentered(ctx, this.common, `player_${frame}`, x, y, 1, p.facing < 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // Aim reticle: small, but it makes mouse aiming precise.
    if (p.aimValid) {
      const rx = x + Math.cos(p.aim) * 22;
      const ry = y + Math.sin(p.aim) * 22;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(rx, ry, 1.6, 0, TAU);
      ctx.fill();
    }
  }

  drawShots(ctx, g, alpha) {
    const shots = g.shots.items;
    for (let i = 0; i < g.shots.cap; i++) {
      const s = shots[i];
      if (!s.active) continue;
      const x = lerp(s.px, s.x, alpha);
      const y = lerp(s.py, s.y, alpha);
      const r = s.radius;
      const enemy = s.team === TEAM.ENEMY;

      if (s.style === 'crit' || s.explosive || s.style === 'lance') {
        glow(ctx, x, y, r * 3.2, s.color, 0.4);
      } else if (enemy) {
        glow(ctx, x, y, r * 2.4, s.color, 0.3);
      }

      ctx.fillStyle = s.color;
      ctx.beginPath();
      if (s.style === 'shard' || s.style === 'prism') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.angle);
        ctx.moveTo(r * 1.6, 0);
        ctx.lineTo(-r * 0.8, r * 0.8);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.8, -r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (s.style === 'lance' || s.style === 'breath' || s.style === 'flame') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.angle);
        ctx.ellipse(0, 0, r * 2, r * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      // Bright core sells the "hot bullet" look for one extra draw call.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(x - r * 0.22, y - r * 0.22, r * 0.42, 0, TAU);
      ctx.fill();
    }
  }
}
