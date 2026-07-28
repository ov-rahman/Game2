/**
 * HUD painter.
 *
 * Draws into a 2D canvas at the scene's internal resolution, which is then
 * composited *inside* the post shader — so the interface gets the same dither,
 * grain and scanlines as the world instead of floating cleanly on top of it.
 * That single decision is most of why the overlay reads as part of the image.
 */
import { RENDER_W, RENDER_H } from '../core/constants.js';
import { STATE } from '../core/game.js';
import { clamp } from '../core/math3.js';

const FONT = 'monospace';

export class HudPainter {
  constructor(display, game) {
    const surface = display.createSurface(RENDER_W, RENDER_H, { smooth: false });
    this.canvas = surface.canvas;
    this.ctx = surface.ctx;
    this.game = game;
    this.dirty = true;
    this.time = 0;
  }

  text(str, x, y, opts = {}) {
    const ctx = this.ctx;
    ctx.font = `${opts.weight || ''} ${opts.size || 8}px ${FONT}`.trim();
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = opts.color || '#d8e4d0';
    ctx.fillText(str, x, y);
  }

  paint(time) {
    const ctx = this.ctx;
    const g = this.game;
    this.time = time;
    ctx.clearRect(0, 0, RENDER_W, RENDER_H);
    this.dirty = false;

    switch (g.state) {
      case STATE.TITLE:
        this.paintTitle();
        return;
      case STATE.DEAD:
        this.paintPlay();
        this.paintDeath();
        return;
      case STATE.WIN:
        this.paintWin();
        return;
      case STATE.PAUSED:
        this.paintPlay();
        this.paintPause();
        return;
      default:
        this.paintPlay();
    }
  }

  // ------------------------------------------------------------------ play

  paintPlay() {
    const g = this.game;
    const ctx = this.ctx;
    const p = g.player;
    if (!p) return;

    this.paintCrosshair();

    // --- health -----------------------------------------------------------
    const barW = 78;
    const barH = 5;
    const bx = 10;
    const by = RENDER_H - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const hpFrac = clamp(p.hp / p.stats.maxHp, 0, 1);
    ctx.fillStyle = hpFrac > 0.5 ? '#7fd66a' : hpFrac > 0.25 ? '#e8c24a' : '#e4543f';
    ctx.fillRect(bx, by, barW * hpFrac, barH);
    // Segment ticks so the player reads hits, not a smooth slider.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const segs = Math.max(1, Math.round(p.stats.maxHp / 2));
    for (let i = 1; i < segs; i++) ctx.fillRect(bx + (barW * i) / segs, by, 1, barH);
    this.text(`${Math.max(0, Math.ceil(p.hp))}`, bx + barW + 5, by + barH, { size: 8, color: '#cfe0c8' });

    if (p.shield > 0) {
      ctx.fillStyle = '#8fd6ff';
      ctx.fillRect(bx, by - 4, (barW * clamp(p.shield / 6, 0, 1)), 2);
    }

    // --- torch battery ----------------------------------------------------
    const tw = 52;
    const ty = RENDER_H - 11;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, ty - 1, tw + 2, 4);
    const charge = clamp(g.torch.charge, 0, 1);
    ctx.fillStyle = charge > 0.3 ? '#d8d08a' : charge > 0.12 ? '#e0a24a' : '#e4543f';
    ctx.fillRect(bx, ty, tw * charge, 2);
    this.text(g.torch.on ? 'ФОНАРЬ' : 'ВЫКЛ', bx + tw + 5, ty + 3, {
      size: 6,
      color: g.torch.on ? '#c8c090' : '#6a6a60',
    });

    // --- ammo / heat ------------------------------------------------------
    const heat = clamp(p.heat, 0, 1);
    const hx = RENDER_W - 62;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(hx - 1, by - 1, 52 + 2, barH + 2);
    ctx.fillStyle = p.overheated ? '#e4543f' : heat > 0.7 ? '#e8a04a' : '#7fb8e8';
    ctx.fillRect(hx, by, 52 * (1 - heat), barH);
    this.text(p.overheated ? 'ПЕРЕГРЕВ' : 'ЗАРЯД', hx, by - 4, { size: 6, color: '#9fb0a8' });

    // --- resources --------------------------------------------------------
    this.text(`◈ ${p.coins}`, RENDER_W - 10, 14, { align: 'right', size: 8, color: '#e8d08a' });
    this.text(`✦ ${p.inv.items.length}`, RENDER_W - 10, 24, { align: 'right', size: 8, color: '#a8c8e8' });

    // --- active item ------------------------------------------------------
    if (p.inv.activeId) {
      const ready = p.inv.activeCharge >= p.inv.activeMax;
      this.text(
        `[Q] ${p.inv.activeName}${ready ? '' : ` ${p.inv.activeCharge}/${p.inv.activeMax}`}`,
        10,
        RENDER_H - 28,
        { size: 6, color: ready ? '#e8d08a' : '#70786e' },
      );
    }

    // --- floor label ------------------------------------------------------
    const def = g.floorDef;
    if (def) {
      this.text(`${def.index}/5  ${def.name}`, 10, 14, { size: 7, color: '#8fa898' });
    }

    // --- objective --------------------------------------------------------
    if (g.objective) {
      this.text(g.objective, RENDER_W / 2, 14, { align: 'center', size: 7, color: '#c8b878' });
    }

    // --- boss bar ---------------------------------------------------------
    const boss = g.enemies.find((e) => e.isBoss && e.alive && !e.dormant);
    if (boss) {
      const bw = 180;
      const bxx = (RENDER_W - bw) / 2;
      const byy = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bxx - 2, byy - 2, bw + 4, 8);
      const k = clamp(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = '#c8443a';
      ctx.fillRect(bxx, byy, bw * k, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (const t of boss.phaseThresholds) ctx.fillRect(bxx + bw * t, byy, 1, 4);
      this.text(boss.name, RENDER_W / 2, byy - 4, { align: 'center', size: 7, color: '#e8b0a0' });
    }

    // --- prompts ----------------------------------------------------------
    if (g.prompt) {
      this.text(g.prompt, RENDER_W / 2, RENDER_H - 46, { align: 'center', size: 8, color: '#d8e0c8' });
    }

    // --- messages ---------------------------------------------------------
    let my = 52;
    for (const m of g.messages) {
      const k = clamp(m.time - m.t, 0, 1);
      ctx.globalAlpha = k;
      this.text(m.title, RENDER_W / 2, my, { align: 'center', size: 11, color: '#e8e4d0' });
      if (m.sub) this.text(m.sub, RENDER_W / 2, my + 11, { align: 'center', size: 7, color: '#a0b0a0' });
      ctx.globalAlpha = 1;
      my += 26;
    }

    // --- damage vignette --------------------------------------------------
    const dmg = g.damageFlash();
    if (dmg > 0.01) {
      const grd = ctx.createRadialGradient(RENDER_W / 2, RENDER_H / 2, RENDER_H * 0.28, RENDER_W / 2, RENDER_H / 2, RENDER_H * 0.75);
      grd.addColorStop(0, 'rgba(180,20,20,0)');
      grd.addColorStop(1, `rgba(180,20,20,${dmg * 0.75})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    }

    if (g.showMap) this.paintMap();
    if (g.debug) this.paintDebug();
  }

  paintCrosshair() {
    const ctx = this.ctx;
    const g = this.game;
    const cx = RENDER_W / 2;
    const cy = RENDER_H / 2;
    const spread = 3 + (g.player ? g.player.spread * 26 : 0);
    ctx.fillStyle = 'rgba(220,235,215,0.8)';
    ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
    ctx.fillStyle = 'rgba(220,235,215,0.55)';
    ctx.fillRect(cx - spread - 3, cy, 3, 1);
    ctx.fillRect(cx + spread, cy, 3, 1);
    ctx.fillRect(cx, cy - spread - 3, 1, 3);
    ctx.fillRect(cx, cy + spread, 1, 3);
  }

  paintMap() {
    const ctx = this.ctx;
    const g = this.game;
    const d = g.dungeon;
    if (!d) return;
    const scale = 2;
    const w = d.width * scale;
    const h = d.height * scale;
    const ox = (RENDER_W - w) / 2;
    const oy = (RENDER_H - h) / 2;

    ctx.fillStyle = 'rgba(4,6,5,0.86)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    for (const room of d.rooms) {
      if (!room.seen) continue;
      ctx.fillStyle =
        room.kind === 'boss' ? 'rgba(200,70,60,0.75)'
        : room.kind === 'shop' ? 'rgba(90,180,220,0.7)'
        : room.kind === 'treasure' ? 'rgba(220,190,90,0.7)'
        : 'rgba(120,150,130,0.55)';
      ctx.fillRect(ox + room.x * scale, oy + room.y * scale, room.w * scale, room.h * scale);
    }
    // Corridors the player has actually walked.
    ctx.fillStyle = 'rgba(90,110,100,0.5)';
    for (const c of g.exploredCells) {
      const gx = c % d.width;
      const gy = (c / d.width) | 0;
      ctx.fillRect(ox + gx * scale, oy + gy * scale, scale, scale);
    }

    const p = g.player;
    ctx.fillStyle = '#e8f0d8';
    ctx.fillRect(ox + (p.x / 4) * scale - 1, oy + (p.z / 4) * scale - 1, 3, 3);

    if (d.stairs.active) {
      ctx.fillStyle = '#8fe8b0';
      ctx.fillRect(ox + d.stairs.gx * scale - 1, oy + d.stairs.gy * scale - 1, 3, 3);
    }
    this.text('КАРТА  —  TAB', RENDER_W / 2, oy - 8, { align: 'center', size: 7, color: '#8fa898' });
  }

  paintDebug() {
    const g = this.game;
    const l = g.loopStats || {};
    this.text(
      `fps ${(l.fps || 0).toFixed(0)}  tps ${(l.tps || 0).toFixed(0)}  step ${(l.stepMs || 0).toFixed(2)}ms  draw ${(l.renderMs || 0).toFixed(2)}ms`,
      4,
      RENDER_H - 34,
      { size: 6, color: '#7fd66a' },
    );
    this.text(
      `enemies ${g.enemies.length}  shots ${g.shots.count}  lights ${g.dungeon ? g.dungeon.lights.length : 0}`,
      4,
      RENDER_H - 27,
      { size: 6, color: '#7fd66a' },
    );
  }

  // -------------------------------------------------------------- overlays

  panel(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6,8,7,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(150,170,150,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  paintTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = '#050706';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    const flick = 0.75 + 0.25 * Math.sin(this.time * 7) * Math.sin(this.time * 2.3);
    ctx.globalAlpha = flick;
    this.text('ГЛУБИНА', RENDER_W / 2, 74, { align: 'center', size: 30, color: '#c8d8c0', weight: 'bold' });
    ctx.globalAlpha = 1;
    this.text('спуск на пять этажей', RENDER_W / 2, 90, { align: 'center', size: 8, color: '#7a8c80' });

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    this.text('НАЖМИ, ЧТОБЫ НАЧАТЬ', RENDER_W / 2, 132, { align: 'center', size: 9, color: '#d8c88a' });
    ctx.globalAlpha = 1;

    const lines = [
      'WASD — идти      мышь — смотреть      ЛКМ — стрелять',
      'SHIFT — бежать   CTRL — присесть      F — фонарь',
      'E — взять        Q — предмет          TAB — карта',
      'ESC — пауза      F11 — полный экран',
    ];
    lines.forEach((l, i) => {
      this.text(l, RENDER_W / 2, 162 + i * 11, { align: 'center', size: 7, color: 'rgba(160,180,165,0.85)' });
    });

    if (this.game.best) {
      this.text(
        `лучший спуск: этаж ${this.game.best.floor}   убийств ${this.game.best.kills}`,
        RENDER_W / 2,
        RENDER_H - 12,
        { align: 'center', size: 7, color: '#a89858' },
      );
    }
  }

  paintPause() {
    const ctx = this.ctx;
    const g = this.game;
    ctx.fillStyle = 'rgba(4,6,5,0.8)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    const w = 240;
    const h = 150;
    const x = (RENDER_W - w) / 2;
    const y = (RENDER_H - h) / 2;
    this.panel(x, y, w, h);
    this.text('ПАУЗА', RENDER_W / 2, y + 20, { align: 'center', size: 14, color: '#d8e0c8' });

    const p = g.player;
    const st = p.stats;
    const rows = [
      ['урон', (st.damage * st.damageMult).toFixed(1)],
      ['темп стрельбы', st.fireRate.toFixed(2)],
      ['скорость', st.moveSpeed.toFixed(1)],
      ['броня', st.armor.toFixed(0)],
      ['крит', `${(st.critChance * 100).toFixed(0)}%`],
      ['фонарь', `${Math.round(g.torch.charge * 100)}%`],
    ];
    rows.forEach((r, i) => {
      const col = i % 2;
      const row = (i / 2) | 0;
      this.text(r[0], x + 16 + col * 112, y + 42 + row * 12, { size: 7, color: '#8fa898' });
      this.text(r[1], x + 100 + col * 112, y + 42 + row * 12, { size: 7, color: '#d8e0c8', align: 'right' });
    });

    let sy = y + 88;
    this.text('связки:', x + 16, sy, { size: 7, color: '#8fd66a' });
    sy += 10;
    if (!p.inv.synergies.length) {
      this.text('— пока нет —', x + 20, sy, { size: 6, color: '#5f6a60' });
    } else {
      for (const s of p.inv.synergies.slice(0, 4)) {
        this.text(`★ ${s.name}`, x + 20, sy, { size: 6, color: '#a8d8a0' });
        sy += 9;
      }
    }
    this.text('ESC — продолжить    R — заново', RENDER_W / 2, y + h - 10, {
      align: 'center', size: 7, color: 'rgba(200,210,195,0.6)',
    });
  }

  paintDeath() {
    const ctx = this.ctx;
    const g = this.game;
    ctx.fillStyle = 'rgba(20,3,3,0.82)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    const w = 220;
    const h = 116;
    const x = (RENDER_W - w) / 2;
    const y = (RENDER_H - h) / 2;
    this.panel(x, y, w, h);
    this.text('СИГНАЛ ПОТЕРЯН', RENDER_W / 2, y + 24, { align: 'center', size: 15, color: '#e08070' });
    const s = g.stats;
    const rows = [
      ['этаж', `${s.floorReached} / 5`],
      ['убийств', s.kills],
      ['предметов', s.itemsTaken],
      ['время', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
    ];
    rows.forEach((r, i) => {
      this.text(r[0], x + 20, y + 46 + i * 12, { size: 7, color: '#a08880' });
      this.text(String(r[1]), x + w - 20, y + 46 + i * 12, { size: 7, color: '#e0d0c8', align: 'right' });
    });
    this.text('ENTER — новый спуск', RENDER_W / 2, y + h - 10, { align: 'center', size: 8, color: '#d8c88a' });
  }

  paintWin() {
    const ctx = this.ctx;
    const g = this.game;
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    const cols = ['#ff4fa3', '#4fe1ff', '#ffe14f', '#7cff6b'];
    for (let i = 0; i < 4; i++) {
      const a = this.time * 0.5 + (i / 4) * Math.PI * 2;
      const grd = ctx.createRadialGradient(
        RENDER_W / 2 + Math.cos(a) * 110, RENDER_H / 2 + Math.sin(a * 1.4) * 60, 0,
        RENDER_W / 2 + Math.cos(a) * 110, RENDER_H / 2 + Math.sin(a * 1.4) * 60, 130,
      );
      grd.addColorStop(0, `${cols[i]}55`);
      grd.addColorStop(1, '#00000000');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    }
    this.text('ДРАКОН ПОВЕРЖЕН', RENDER_W / 2, 80, { align: 'center', size: 18, color: '#f0ece0' });
    const s = g.stats;
    const rows = [
      ['убийств', s.kills],
      ['боссов', s.bossesKilled],
      ['предметов', s.itemsTaken],
      ['время', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
    ];
    rows.forEach((r, i) => {
      this.text(r[0], RENDER_W / 2 - 70, 112 + i * 13, { size: 8, color: '#b8c8c0' });
      this.text(String(r[1]), RENDER_W / 2 + 70, 112 + i * 13, { size: 8, color: '#f0ece0', align: 'right' });
    });
    this.text('ENTER — новый спуск', RENDER_W / 2, RENDER_H - 20, { align: 'center', size: 9, color: '#d8c88a' });
  }
}
