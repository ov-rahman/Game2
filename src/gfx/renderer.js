/**
 * The renderer.
 *
 * Reads simulation state and draws it; it never mutates the game. Three stages:
 *
 *   1. scene    -> a small offscreen buffer (RENDER_W x RENDER_H), lit by a
 *                  handful of point lights plus the player's torch, drowned in
 *                  exponential fog
 *   2. sprites  -> additive billboards in the same buffer
 *   3. post     -> the filter: aberration, grade, scanlines, grain, ordered
 *                  dither down to a few colour levels, then a hard upscale
 *
 * Rendering at ~428x240 and upscaling with NEAREST is not a performance trick
 * alone: the chunky pixels, the dither pattern and the fog are the look.
 */
import {
  RENDER_W,
  RENDER_H,
  CELL,
  WALL_H,
  TEAM,
} from '../core/constants.js';
import { mat4, vec3, clamp, lerp } from '../core/math3.js';
import { Program, Mesh, DynamicMesh, RenderTarget, textureFromCanvas, updateTextureFromCanvas, fullscreenTriangle } from './gl.js';
import { WORLD_VS, WORLD_FS, BILLBOARD_VS, BILLBOARD_FS, POST_VS, POST_FS, MAX_LIGHTS } from './shaders.js';
import { buildAtlas, buildSpriteSheet, spriteUV, SPRITE } from './textures.js';
import { buildLevelMesh, VERTEX_LAYOUT } from './meshbuild.js';
import { buildCreatureMesh } from './creatures.js';
import { HudPainter } from './hud.js';

const BILLBOARD_LAYOUT = [
  { name: 'aCenter', size: 3 },
  { name: 'aCorner', size: 2 },
  { name: 'aUv', size: 2 },
  { name: 'aColor', size: 4 },
  { name: 'aSize', size: 1 },
];
const BILLBOARD_FLOATS = 12;

export class Renderer {
  constructor(display, game) {
    this.display = display;
    this.game = game;
    const gl = display.gl;
    this.gl = gl;

    this.world = new Program(gl, WORLD_VS, WORLD_FS, 'world');
    this.billboard = new Program(gl, BILLBOARD_VS, BILLBOARD_FS, 'billboard');
    this.post = new Program(gl, POST_VS, POST_FS, 'post');

    this.scene = new RenderTarget(gl, RENDER_W, RENDER_H, { depth: true, filter: 'nearest' });
    this.quad = fullscreenTriangle(gl, this.post);

    this.spriteTex = textureFromCanvas(gl, buildSpriteSheet(display), { filter: 'linear', wrap: 'clamp' });
    this.atlases = new Map();
    this.atlasTex = null;

    this.levelMesh = null;
    this.levelGlowMesh = null;
    this.creatureMeshes = new Map();

    this.sprites = new DynamicMesh(gl, this.billboard, 6 * 1400 * BILLBOARD_FLOATS, BILLBOARD_LAYOUT);

    this.hud = new HudPainter(display, game);
    this.hudTex = textureFromCanvas(gl, this.hud.canvas, { filter: 'nearest', wrap: 'clamp' });
    this.hudTimer = 0;

    // Scratch matrices, allocated once.
    this.proj = mat4.create();
    this.view = mat4.create();
    this.viewProj = mat4.create();
    this.model = mat4.create();
    this.identity = mat4.create();

    this.lightBuffer = new Float32Array(MAX_LIGHTS * 4);
    this.lightColorBuffer = new Float32Array(MAX_LIGHTS * 4);
    this.lightScratch = [];

    this.time = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.glitch = 0;
    this.fade = 0;
    this.viewW = RENDER_W;
    this.viewH = RENDER_H;

    this.particles = [];
    this.particlePool = [];
    for (let i = 0; i < 700; i++) {
      this.particlePool.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.2, r: 1, g: 1, b: 1, a: 1,
        sprite: SPRITE.DOT, drag: 0.9, gravity: 0, additive: true,
      });
    }

    display.onResize((w, h) => {
      this.viewW = w;
      this.viewH = h;
    });

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    this.bindEvents();
  }

  bindEvents() {
    const g = this.game;
    g.events.on('fx', (e) => this.spawnFx(e));
    g.events.on('floorStart', () => this.rebuildLevel());
    g.events.on('levelChanged', () => this.rebuildLevel());
    g.events.on('shake', (e) => {
      this.glitch = Math.min(1, this.glitch + (e.glitch || 0));
    });
  }

  // ------------------------------------------------------------ resources

  atlasFor(floorDef) {
    if (!this.atlases.has(floorDef.id)) {
      this.atlases.set(
        floorDef.id,
        textureFromCanvas(this.gl, buildAtlas(this.display, floorDef), { filter: 'nearest', wrap: 'clamp' }),
      );
    }
    return this.atlases.get(floorDef.id);
  }

  /** Bake every floor's atlas up front so descending never hitches. */
  prewarm(floorDefs, creatureIds) {
    for (const def of floorDefs) this.atlasFor(def);
    for (const id of creatureIds) this.creatureMesh(id);
  }

  creatureMesh(id) {
    let entry = this.creatureMeshes.get(id);
    if (entry) return entry;
    const built = buildCreatureMesh(id);
    entry = {
      solid: built.solid.length ? new Mesh(this.gl, this.world, built.solid, null, VERTEX_LAYOUT) : null,
      glow: built.glow.length ? new Mesh(this.gl, this.world, built.glow, null, VERTEX_LAYOUT) : null,
      height: built.height,
    };
    this.creatureMeshes.set(id, entry);
    return entry;
  }

  rebuildLevel() {
    const g = this.game;
    if (!g.dungeon) return;
    if (this.levelMesh) this.levelMesh.dispose();
    if (this.levelGlowMesh) this.levelGlowMesh.dispose();
    const built = buildLevelMesh(g.dungeon, g.floorDef);
    this.levelMesh = new Mesh(this.gl, this.world, built.solid, null, VERTEX_LAYOUT);
    this.levelGlowMesh = built.glow.length ? new Mesh(this.gl, this.world, built.glow, null, VERTEX_LAYOUT) : null;
    this.atlasTex = this.atlasFor(g.floorDef);
  }

  // ------------------------------------------------------------- particles

  spawnParticle(o) {
    let p = null;
    for (let i = 0; i < this.particlePool.length; i++) {
      if (!this.particlePool[i].active) {
        p = this.particlePool[i];
        break;
      }
    }
    if (!p) return null;
    p.active = true;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.size = o.size || 0.2;
    p.r = o.r == null ? 1 : o.r;
    p.g = o.g == null ? 1 : o.g;
    p.b = o.b == null ? 1 : o.b;
    p.a = o.a == null ? 1 : o.a;
    p.sprite = o.sprite == null ? SPRITE.DOT : o.sprite;
    p.drag = o.drag == null ? 0.9 : o.drag;
    p.gravity = o.gravity || 0;
    p.grow = o.grow || 0;
    return p;
  }

  burst(x, y, z, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.35) * Math.PI;
      const sp = (o.speed || 3) * (0.4 + Math.random() * 0.9);
      this.spawnParticle({
        x, y, z,
        vx: Math.cos(a) * Math.cos(e) * sp,
        vy: Math.sin(e) * sp,
        vz: Math.sin(a) * Math.cos(e) * sp,
        life: (o.life || 0.5) * (0.6 + Math.random() * 0.7),
        size: (o.size || 0.18) * (0.7 + Math.random() * 0.7),
        r: o.r, g: o.g, b: o.b, a: o.a,
        sprite: o.sprite,
        drag: o.drag,
        gravity: o.gravity,
        grow: o.grow,
      });
    }
  }

  /** Translate a core `fx` event into particles and screen effects. */
  spawnFx(e) {
    const c = e.color || [1, 1, 1];
    switch (e.type) {
      case 'hit':
        this.burst(e.x, e.y, e.z, e.crit ? 12 : 6, {
          speed: e.crit ? 7 : 4, life: 0.25, size: 0.13,
          r: c[0], g: c[1], b: c[2], sprite: SPRITE.SPARK, gravity: -4,
        });
        break;
      case 'wallHit':
        this.burst(e.x, e.y, e.z, 4, { speed: 2.5, life: 0.2, size: 0.09, r: 0.9, g: 0.85, b: 0.7, sprite: SPRITE.DUST, gravity: -6 });
        break;
      case 'death':
        this.burst(e.x, e.y, e.z, 16, {
          speed: 4.5, life: 0.6, size: 0.22, r: c[0], g: c[1], b: c[2], sprite: SPRITE.SMOKE, gravity: -2, grow: 0.6,
        });
        this.burst(e.x, e.y, e.z, 10, { speed: 6, life: 0.4, size: 0.12, r: c[0], g: c[1], b: c[2], sprite: SPRITE.SPARK, gravity: -8 });
        break;
      case 'bossDeath':
        this.burst(e.x, e.y, e.z, 60, { speed: 9, life: 1.4, size: 0.35, r: c[0], g: c[1], b: c[2], sprite: SPRITE.STAR, gravity: -3, grow: 0.8 });
        this.glitch = Math.min(1, this.glitch + 0.8);
        break;
      case 'explosion':
        this.burst(e.x, e.y, e.z, 24, { speed: 8, life: 0.5, size: 0.4, r: 1, g: 0.7, b: 0.3, sprite: SPRITE.FLAME, gravity: -1, grow: 1.2 });
        this.burst(e.x, e.y, e.z, 12, { speed: 3, life: 1.0, size: 0.6, r: 0.25, g: 0.22, b: 0.2, sprite: SPRITE.SMOKE, gravity: 1.5, grow: 1.6 });
        this.glitch = Math.min(1, this.glitch + 0.25);
        break;
      case 'muzzle':
        this.spawnParticle({ x: e.x, y: e.y, z: e.z, life: 0.07, size: 0.42, r: 1, g: 0.92, b: 0.7, sprite: SPRITE.MUZZLE, drag: 1 });
        break;
      case 'blood':
        this.burst(e.x, e.y, e.z, 8, { speed: 3, life: 0.45, size: 0.13, r: c[0], g: c[1], b: c[2], sprite: SPRITE.BLOOD, gravity: 7 });
        break;
      case 'spawn':
      case 'teleport':
        this.burst(e.x, e.y, e.z, 18, { speed: 3.5, life: 0.55, size: 0.18, r: c[0], g: c[1], b: c[2], sprite: SPRITE.RUNE, gravity: -2, grow: 0.5 });
        break;
      case 'rubble':
        this.burst(e.x, e.y, e.z, 14, { speed: 4, life: 0.7, size: 0.2, r: 0.6, g: 0.55, b: 0.5, sprite: SPRITE.SQUARE, gravity: 9 });
        break;
      case 'pickup':
        this.burst(e.x, e.y, e.z, 8, { speed: 2, life: 0.5, size: 0.12, r: c[0], g: c[1], b: c[2], sprite: SPRITE.STAR, gravity: -3 });
        break;
      case 'heal':
        this.burst(e.x, e.y, e.z, 12, { speed: 1.6, life: 0.8, size: 0.14, r: 0.4, g: 1, b: 0.5, sprite: SPRITE.CROSS, gravity: -2.5 });
        break;
      case 'trail':
        this.spawnParticle({ x: e.x, y: e.y, z: e.z, life: 0.3, size: 0.16, r: c[0], g: c[1], b: c[2], sprite: SPRITE.DOT, drag: 1 });
        break;
      case 'ember':
        this.spawnParticle({
          x: e.x, y: e.y, z: e.z, vy: 0.8 + Math.random(), life: 1.2, size: 0.07,
          r: c[0], g: c[1], b: c[2], sprite: SPRITE.DOT, drag: 0.98,
        });
        break;
      case 'telegraph':
        this.spawnParticle({ x: e.x, y: e.y, z: e.z, life: e.time || 0.6, size: (e.radius || 1) * 1.6, r: c[0], g: c[1], b: c[2], a: 0.5, sprite: SPRITE.RING, drag: 1 });
        break;
      default:
        break;
    }
  }

  updateParticles(dt) {
    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.grow) p.size += p.grow * dt;
    }
  }

  // ---------------------------------------------------------------- frame

  render(alpha, frameDt) {
    const gl = this.gl;
    const g = this.game;
    this.time += frameDt;
    this.updateParticles(Math.min(frameDt, 0.05));

    this.glitch = Math.max(0, this.glitch - frameDt * 1.6);

    if (!g.dungeon || !this.levelMesh) {
      // Title / loading: just clear to black through the filter.
      this.scene.bind();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.drawPost(frameDt);
      return;
    }

    const cam = g.camera(alpha);
    const shake = g.shakeAmount();
    this.shakeX = lerp(this.shakeX, (Math.random() - 0.5) * shake * 0.05, 0.6);
    this.shakeY = lerp(this.shakeY, (Math.random() - 0.5) * shake * 0.05, 0.6);

    const fog = g.floorDef.fog;
    const aspect = RENDER_W / RENDER_H;
    mat4.perspective(this.proj, g.fov(), aspect, 0.06, 90);
    mat4.fpsView(this.view, cam.x, cam.y, cam.z, cam.yaw + this.shakeX, cam.pitch + this.shakeY);
    mat4.multiply(this.viewProj, this.proj, this.view);

    this.scene.bind();
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(fog.color[0], fog.color[1], fog.color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const w = this.world.use();
    w.mat4('uViewProj', this.viewProj);
    w.vec3('uCamPos', cam.x, cam.y, cam.z);
    w.vec3('uAmbient', ...g.floorDef.ambient);
    w.vec3('uFogColor', ...fog.color);
    w.float('uFogDensity', fog.density);
    w.float('uTime', this.time);
    // Snap vertices to a ~1.5px grid: the PS1-era "wobbly geometry" tell.
    w.float('uWobble', g.settings.wobble ? 1.5 : 0);
    w.vec2('uJitterRes', RENDER_W, RENDER_H);
    w.int('uTex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);

    this.uploadLights(w, cam);
    this.setTorch(w, cam, g);
    const dmg = g.damageFlash();
    w.vec4('uTintFlash', 1.0, 0.15, 0.12, dmg * 0.16);

    // --- level ------------------------------------------------------------
    w.mat4('uModel', this.identity);
    w.vec3('uEmissive', 0, 0, 0);
    w.float('uEmissivePulse', 0);
    this.levelMesh.draw();

    if (this.levelGlowMesh) {
      w.vec3('uEmissive', 0.85, 0.78, 0.7);
      w.float('uEmissivePulse', 1);
      this.levelGlowMesh.draw();
      w.vec3('uEmissive', 0, 0, 0);
      w.float('uEmissivePulse', 0);
    }

    // --- creatures and props ---------------------------------------------
    this.drawEntities(w, g, alpha, cam);

    // --- billboards -------------------------------------------------------
    this.drawSprites(g, cam, alpha);

    // --- post -------------------------------------------------------------
    this.drawPost(frameDt);
  }

  uploadLights(w, cam) {
    const g = this.game;
    const lights = g.dungeon.lights;
    const scratch = this.lightScratch;
    scratch.length = 0;

    for (const l of lights) {
      if (!Number.isFinite(l.x) || !Number.isFinite(l.z) || !Number.isFinite(l.radius)) continue;
      const dx = l.x - cam.x;
      const dz = l.z - cam.z;
      const d2 = dx * dx + dz * dz;
      // Only lights whose sphere can reach the camera's vicinity matter.
      if (d2 > (l.radius + 26) * (l.radius + 26)) continue;
      scratch.push({ l, d2 });
    }
    // Dynamic lights (projectiles, boss cores) join the same budget.
    for (const dl of g.dynamicLights) {
      if (!Number.isFinite(dl.x) || !Number.isFinite(dl.z) || !Number.isFinite(dl.radius)) continue;
      const dx = dl.x - cam.x;
      const dz = dl.z - cam.z;
      scratch.push({ l: dl, d2: dx * dx + dz * dz - 400 });
    }
    scratch.sort((a, b) => a.d2 - b.d2);

    const n = Math.min(MAX_LIGHTS, scratch.length);
    for (let i = 0; i < n; i++) {
      const l = scratch[i].l;
      let intensity = l.intensity;
      if (l.flicker) {
        // Flicker is a big part of the mood: unstable lamps, guttering fires.
        const f = Math.sin(this.time * l.flicker + l.phase) * 0.5 + 0.5;
        const spike = Math.sin(this.time * l.flicker * 3.7 + l.phase * 2) * 0.5 + 0.5;
        intensity *= 0.55 + 0.45 * f * (0.6 + 0.4 * spike);
      }
      this.lightBuffer[i * 4] = l.x;
      this.lightBuffer[i * 4 + 1] = l.y;
      this.lightBuffer[i * 4 + 2] = l.z;
      this.lightBuffer[i * 4 + 3] = l.radius;
      this.lightColorBuffer[i * 4] = l.r;
      this.lightColorBuffer[i * 4 + 1] = l.g;
      this.lightColorBuffer[i * 4 + 2] = l.b;
      this.lightColorBuffer[i * 4 + 3] = intensity;
    }
    w.vec4Array('uLightPos', this.lightBuffer);
    w.vec4Array('uLightColor', this.lightColorBuffer);
    w.int('uLightCount', n);
  }

  setTorch(w, cam, g) {
    const t = g.torch;
    const dirX = Math.sin(cam.yaw) * Math.cos(cam.pitch);
    const dirY = -Math.sin(cam.pitch);
    const dirZ = Math.cos(cam.yaw) * Math.cos(cam.pitch);
    // A dying battery browns out and gutters — the tension dial of the game.
    const power = t.on ? t.charge * (0.75 + 0.25 * Math.sin(this.time * 21 * (1 - t.charge))) : 0;
    w.vec3('uFlashPos', cam.x, cam.y, cam.z);
    w.vec3('uFlashDir', dirX, dirY, dirZ);
    w.vec4('uFlashParams', Math.cos(t.inner), Math.cos(t.outer), t.range * (0.55 + 0.45 * t.charge), 3.0 * power);
    w.vec3('uFlashColor', t.color[0], t.color[1], t.color[2]);
  }

  drawEntities(w, g, alpha, cam) {
    const gl = this.gl;
    for (const e of g.enemies) {
      if (!e.alive && e.dying <= 0) continue;
      const mesh = this.creatureMesh(e.art);
      const x = lerp(e.px, e.x, alpha);
      const z = lerp(e.pz, e.z, alpha);
      const dx = x - cam.x;
      const dz = z - cam.z;
      // Cull by distance; fog hides anything past this anyway.
      if (dx * dx + dz * dz > 3600) continue;

      let scale = e.scale;
      let y = e.y;
      if (!e.alive) {
        const k = clamp(e.dying / e.dyingMax, 0, 1);
        scale *= 0.35 + 0.65 * k;
        y -= (1 - k) * 0.5;
      }
      const bob = e.bob || 0;
      mat4.trs(this.model, x, y + bob, z, e.yaw, scale, scale, scale);
      w.mat4('uModel', this.model);
      const flash = e.flash > 0 ? 1 : 0;
      w.vec4('uTintFlash', 1, 1, 1, flash * 0.75);
      if (mesh.solid) mesh.solid.draw();
      if (mesh.glow) {
        w.vec3('uEmissive', 1.05, 1.0, 0.95);
        w.float('uEmissivePulse', 1);
        mesh.glow.draw();
        w.vec3('uEmissive', 0, 0, 0);
        w.float('uEmissivePulse', 0);
      }
    }
    w.vec4('uTintFlash', 1, 0.15, 0.12, g.damageFlash() * 0.16);

    // Props: pickups, pedestals, stairs.
    for (const p of g.props) {
      const mesh = this.creatureMesh(p.art);
      const dx = p.x - cam.x;
      const dz = p.z - cam.z;
      if (dx * dx + dz * dz > 3600) continue;
      const bob = Math.sin(this.time * 2 + p.phase) * 0.08;
      mat4.trs(this.model, p.x, p.y + bob, p.z, this.time * 0.8 + p.phase, p.scale, p.scale, p.scale);
      w.mat4('uModel', this.model);
      if (mesh.solid) mesh.solid.draw();
      if (mesh.glow) {
        w.vec3('uEmissive', 1.6, 1.5, 1.4);
        w.float('uEmissivePulse', 1);
        mesh.glow.draw();
        w.vec3('uEmissive', 0, 0, 0);
        w.float('uEmissivePulse', 0);
      }
    }
  }

  drawSprites(g, cam, alpha) {
    const gl = this.gl;
    const b = this.billboard.use();
    b.mat4('uViewProj', this.viewProj);
    b.vec3('uCamPos', cam.x, cam.y, cam.z);
    b.vec3('uFogColor', ...g.floorDef.fog.color);
    b.float('uFogDensity', g.floorDef.fog.density * 0.85);
    b.int('uTex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spriteTex);

    // Camera basis for facing quads.
    const rx = -Math.cos(cam.yaw);
    const rz = Math.sin(cam.yaw);
    const ux = Math.sin(cam.yaw) * Math.sin(cam.pitch);
    const uy = Math.cos(cam.pitch);
    const uz = Math.cos(cam.yaw) * Math.sin(cam.pitch);
    b.vec3('uRight', rx, 0, rz);
    b.vec3('uUp', ux, uy, uz);

    this.sprites.reset();

    // Projectiles.
    for (const s of g.shots.items) {
      if (!s.active) continue;
      const x = lerp(s.px, s.x, alpha);
      const y = lerp(s.py, s.y, alpha);
      const z = lerp(s.pz, s.z, alpha);
      this.pushSprite(x, y, z, s.size, s.sprite, s.r, s.g, s.b, 1);
    }
    // Particles.
    for (const p of this.particlePool) {
      if (!p.active) continue;
      const k = p.life / p.maxLife;
      this.pushSprite(p.x, p.y, p.z, p.size, p.sprite, p.r, p.g, p.b, p.a * Math.min(1, k * 1.8));
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    this.sprites.flush();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  pushSprite(x, y, z, size, sprite, r, g, bl, a) {
    if (this.sprites.room() < 6) return;
    const uv = spriteUV(sprite);
    const push = (cx, cy, u, v) => {
      this.sprites.push([x, y, z, cx, cy, u, v, r, g, bl, a, size]);
    };
    push(-1, -1, uv.u0, uv.v1);
    push(1, -1, uv.u1, uv.v1);
    push(1, 1, uv.u1, uv.v0);
    push(1, 1, uv.u1, uv.v0);
    push(-1, 1, uv.u0, uv.v0);
    push(-1, -1, uv.u0, uv.v1);
  }

  drawPost(frameDt) {
    const gl = this.gl;
    const g = this.game;
    const def = g.floorDef || { post: DEFAULT_POST };
    const p = def.post || DEFAULT_POST;

    // Refresh the HUD texture on a slower cadence than the frame rate: it is a
    // full texture upload and nothing on it changes faster than the eye reads.
    this.hudTimer -= frameDt;
    if (this.hudTimer <= 0 || this.hud.dirty) {
      this.hudTimer = 1 / 24;
      this.hud.paint(this.time);
      updateTextureFromCanvas(gl, this.hudTex, this.hud.canvas);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.viewW, this.viewH);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const post = this.post.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.texture);
    post.int('uScene', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    post.int('uHud', 1);

    const dmg = g.damageFlash();
    const s = g.settings;
    post.vec2('uResolution', RENDER_W, RENDER_H);
    post.float('uTime', this.time);
    post.float('uAberration', p.aberration * s.filterStrength);
    post.float('uGrain', p.grain * s.filterStrength);
    post.float('uScanline', p.scanline * s.filterStrength);
    post.float('uVignette', p.vignette * (0.4 + 0.6 * s.filterStrength));
    post.float('uLevels', lerp(48, p.levels, s.filterStrength));
    post.float('uDither', s.filterStrength);
    post.float('uSaturation', p.saturation);
    post.float('uContrast', p.contrast);
    post.float('uBrightness', p.brightness + s.brightness);
    post.vec3('uTint', p.tint[0], p.tint[1], p.tint[2]);
    post.float('uGlitch', Math.min(1, this.glitch + dmg * 0.6) * s.filterStrength);
    post.float('uDamage', dmg);
    post.float('uFade', g.fadeAmount());

    gl.activeTexture(gl.TEXTURE0);
    this.quad.draw();
  }
}

const DEFAULT_POST = {
  tint: [1, 1, 1],
  levels: 14,
  grain: 0.06,
  scanline: 0.12,
  aberration: 1.2,
  vignette: 0.7,
  saturation: 1.05,
  contrast: 1.1,
  brightness: 0,
};
