/**
 * Visual particle system.
 *
 * Purely cosmetic and therefore *outside* the fixed-step simulation: particles
 * advance on frame time and never affect gameplay. Fixed-size pool, no
 * allocation while playing, and a hard cap so a screen full of explosions can
 * never be the reason a frame is dropped.
 */
import { TAU, rgba } from './draw.js';

const MAX = 420;

export class Particles {
  constructor() {
    this.pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.pool[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#fff',
        shape: 'dot',
        drag: 0.9,
        gravity: 0,
        spin: 0,
        rot: 0,
        fade: true,
      };
    }
    this.cursor = 0;
    this.count = 0;
    /** Screen-space extras that are not simple dots. */
    this.decals = [];
  }

  spawn(o) {
    // Round-robin over the pool: oldest particle is recycled under pressure,
    // which degrades gracefully instead of dropping new effects entirely.
    let p = null;
    for (let i = 0; i < MAX; i++) {
      const cand = this.pool[(this.cursor + i) % MAX];
      if (!cand.active) {
        p = cand;
        this.cursor = (this.cursor + i + 1) % MAX;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
    } else {
      this.count++;
    }

    p.active = true;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.size = o.size || 2;
    p.color = o.color || '#ffffff';
    p.shape = o.shape || 'dot';
    p.drag = o.drag == null ? 0.9 : o.drag;
    p.gravity = o.gravity || 0;
    p.spin = o.spin || 0;
    p.rot = o.rot || 0;
    p.fade = o.fade !== false;
    return p;
  }

  burst(x, y, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const a = o.angle == null ? Math.random() * TAU : o.angle + (Math.random() - 0.5) * (o.spread || TAU);
      const sp = (o.speed || 60) * (0.4 + Math.random() * 0.8);
      this.spawn({
        x: x + (Math.random() - 0.5) * (o.jitter || 2),
        y: y + (Math.random() - 0.5) * (o.jitter || 2),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: (o.life || 0.5) * (0.6 + Math.random() * 0.7),
        size: (o.size || 2) * (0.7 + Math.random() * 0.7),
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        shape: o.shape,
        drag: o.drag,
        gravity: o.gravity,
        spin: o.spin,
      });
    }
  }

  addDecal(d) {
    this.decals.push(d);
    if (this.decals.length > 48) this.decals.shift();
  }

  update(dt) {
    const pool = this.pool;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.count--;
        continue;
      }
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      if (d.t >= d.time) this.decals.splice(i, 1);
    }
  }

  /** Draw the layer that sits *under* entities (rings, scorch marks). */
  drawUnder(ctx) {
    for (const d of this.decals) {
      const k = d.t / d.time;
      if (d.type === 'ring') {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius * (0.2 + k * 0.9), 0, TAU);
        ctx.strokeStyle = rgba(d.color, (1 - k) * 0.75);
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.stroke();
      } else if (d.type === 'scorch') {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, TAU);
        ctx.fillStyle = rgba(d.color, (1 - k) * 0.28);
        ctx.fill();
      }
    }
  }

  /** Draw the layer that sits *over* entities (sparks, smoke, sparkles). */
  draw(ctx) {
    const pool = this.pool;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const k = p.life / p.maxLife;
      const alpha = p.fade ? Math.min(1, k * 1.6) : 1;
      ctx.globalAlpha = alpha;
      switch (p.shape) {
        case 'square':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'streak':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
          break;
        case 'spark': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * 0.6);
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.rot) * p.size, p.y - Math.sin(p.rot) * p.size);
          ctx.lineTo(p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size);
          ctx.stroke();
          break;
        }
        case 'smoke':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
          ctx.globalAlpha = alpha * 0.35;
          ctx.fill();
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
          ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const p of this.pool) p.active = false;
    this.count = 0;
    this.decals.length = 0;
  }
}

/**
 * Translate a core `fx` event into particles. Keeping this mapping in one place
 * means the simulation only has to name what happened, never how it looks.
 */
export function fxToParticles(particles, e, palette) {
  const pc = palette && palette.particle ? palette.particle : ['#ffffff'];
  switch (e.type) {
    case 'hit':
      particles.burst(e.x, e.y, e.crit ? 10 : 5, {
        color: e.crit ? ['#fff3b0', '#ffd166'] : [e.color || '#ffffff'],
        speed: e.crit ? 150 : 90,
        life: 0.22,
        size: e.crit ? 2.6 : 1.9,
        shape: 'spark',
        drag: 0.86,
      });
      break;
    case 'spark':
      particles.burst(e.x, e.y, 4, { color: [e.color || '#ffffff'], speed: 70, life: 0.18, size: 1.6 });
      break;
    case 'death':
      particles.burst(e.x, e.y, 14, {
        color: [e.color, '#ffffff'],
        speed: 130,
        life: 0.5,
        size: 2.6,
        drag: 0.9,
        gravity: 90,
      });
      particles.addDecal({ type: 'scorch', x: e.x, y: e.y, radius: (e.radius || 10) * 1.4, color: e.color, t: 0, time: 1.2 });
      break;
    case 'bossDeath':
      particles.burst(e.x, e.y, 46, { color: [e.color, '#ffffff', '#ffd166'], speed: 220, life: 1.2, size: 3.4, gravity: 60 });
      break;
    case 'explosion':
      particles.burst(e.x, e.y, 20, {
        color: ['#fff3b0', e.color || '#ff9d3c', '#ff5722'],
        speed: 210,
        life: 0.42,
        size: 3.2,
        drag: 0.84,
      });
      particles.burst(e.x, e.y, 8, { color: ['#3a3a3a'], speed: 60, life: 0.8, size: 6, shape: 'smoke', drag: 0.9 });
      particles.addDecal({ type: 'ring', x: e.x, y: e.y, radius: e.radius || 40, color: '#ffd166', t: 0, time: 0.35 });
      particles.addDecal({ type: 'scorch', x: e.x, y: e.y, radius: (e.radius || 40) * 0.8, color: '#2a1a10', t: 0, time: 2.2 });
      break;
    case 'ring':
      particles.addDecal({ type: 'ring', x: e.x, y: e.y, radius: e.radius, color: e.color, t: 0, time: 0.3 });
      break;
    case 'pickup':
      particles.burst(e.x, e.y, 6, { color: pc, speed: 80, life: 0.35, size: 1.8 });
      break;
    case 'heal':
      particles.burst(e.x, e.y, 10, { color: ['#7ee081', '#ffffff'], speed: 70, life: 0.6, size: 2.2, gravity: -60 });
      break;
    case 'playerHurt':
      particles.burst(e.x, e.y, 10, { color: ['#ff2e63', '#ffffff'], speed: 140, life: 0.35, size: 2.4 });
      break;
    case 'burn':
      particles.spawn({
        x: e.x + (Math.random() - 0.5) * 10,
        y: e.y + (Math.random() - 0.5) * 8,
        vx: 0,
        vy: -34,
        life: 0.4,
        size: 2.2,
        color: Math.random() < 0.5 ? '#ff9d3c' : '#ffd166',
      });
      break;
    case 'poison':
      particles.spawn({
        x: e.x + (Math.random() - 0.5) * 10,
        y: e.y,
        vx: 0,
        vy: -18,
        life: 0.6,
        size: 2,
        color: '#8ede4a',
        shape: 'smoke',
      });
      break;
    case 'freeze':
      particles.burst(e.x, e.y, 7, { color: ['#9fe6ff', '#ffffff'], speed: 60, life: 0.4, size: 2, shape: 'spark' });
      break;
    case 'teleport':
      particles.burst(e.x, e.y, 14, { color: [e.color || '#b06bff', '#ffffff'], speed: 110, life: 0.45, size: 2.2 });
      break;
    case 'summon':
    case 'revive':
      particles.burst(e.x, e.y, 12, { color: [e.color || '#7cff6b'], speed: 90, life: 0.55, size: 2.4, gravity: -50 });
      break;
    case 'trail':
      particles.spawn({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, size: 3, color: e.color || '#ffffff', drag: 1 });
      break;
    case 'dust':
    case 'ember':
      particles.spawn({
        x: e.x,
        y: e.y,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 20,
        life: 0.6,
        size: 1.8,
        color: e.color || '#ffb347',
      });
      break;
    case 'sparkle':
      particles.spawn({ x: e.x, y: e.y, vx: 0, vy: -12, life: 0.5, size: 2, color: e.color || '#ffffff', shape: 'spark', spin: 4 });
      break;
    case 'rubble':
      particles.burst(e.x, e.y, 9, { color: ['#a08060', '#6a5040'], speed: 110, life: 0.5, size: 2.6, gravity: 260, shape: 'square' });
      break;
    case 'impact':
      particles.burst(e.x, e.y, 7, { color: [e.color || '#ffffff'], speed: 120, life: 0.25, size: 2 });
      break;
    case 'mound':
      particles.burst(e.x, e.y + 4, e.big ? 10 : 4, { color: [e.color || '#8a6136'], speed: 60, life: 0.4, size: 2.4, gravity: 200, shape: 'square' });
      break;
    case 'eruption':
    case 'anvil':
    case 'starimpact':
      particles.burst(e.x, e.y, 16, { color: ['#ffd166', e.color || '#ff7a2f'], speed: 180, life: 0.5, size: 2.8, gravity: 120 });
      break;
    case 'shardImpact':
      particles.burst(e.x, e.y, 10, { color: [e.color || '#4fe1ff', '#ffffff'], speed: 150, life: 0.4, size: 2.4, shape: 'spark' });
      break;
    case 'rootBurst':
      particles.burst(e.x, e.y, 10, { color: [e.color || '#7ee081', '#3f8f45'], speed: 130, life: 0.45, size: 2.6, gravity: 140 });
      break;
    case 'phaseShift':
    case 'colorShift':
      particles.burst(e.x, e.y, 22, { color: [e.color, '#ffffff'], speed: 190, life: 0.6, size: 2.8 });
      particles.addDecal({ type: 'ring', x: e.x, y: e.y, radius: 70, color: e.color, t: 0, time: 0.5 });
      break;
    case 'reveal':
      particles.burst(e.x, e.y, 16, { color: ['#ffd93d', '#ffffff'], speed: 160, life: 0.5, size: 2.6 });
      break;
    case 'ward':
    case 'shieldBreak':
      particles.burst(e.x, e.y, 12, { color: ['#ffe066', '#ffffff'], speed: 130, life: 0.4, size: 2.2, shape: 'spark' });
      particles.addDecal({ type: 'ring', x: e.x, y: e.y, radius: 26, color: '#ffe066', t: 0, time: 0.3 });
      break;
    case 'chain':
      particles.addDecal({ type: 'ring', x: e.x2, y: e.y2, radius: 12, color: e.color, t: 0, time: 0.2 });
      break;
    default:
      break;
  }
}
