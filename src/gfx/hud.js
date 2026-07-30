/**
 * HUD painter.
 *
 * Draws into a 2D canvas at the scene's internal resolution, which is then
 * composited *inside* the post shader — so the interface gets the same dither,
 * grain and scanlines as the world instead of floating cleanly on top of it.
 * That single decision is most of why the overlay reads as part of the image.
 */
import { RENDER_W, RENDER_H, CELL } from '../core/constants.js';
import { STATE } from '../core/game.js';
import { ROW_H } from '../core/ui/menu.js';
import { clamp } from '../core/math3.js';
import { WEAPONS, RELICS, STARTING_WEAPON, rarityOf } from '../data/gear.js';

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

  /**
   * Draw a line of interface text.
   *
   * Three things keep small type legible once the post pass has had its way
   * with it: whole-pixel positions, so glyph stems land on pixels instead of
   * straddling two; a full outline rather than a drop shadow, so a letter keeps
   * its shape against a bright wall as well as a dark one; and a floor on the
   * size, because below about eight pixels monospace stops being letterforms
   * and starts being grey.
   */
  text(str, x, y, opts = {}) {
    const ctx = this.ctx;
    const size = Math.max(8, opts.size || 9);
    ctx.font = `${opts.weight || 'bold'} ${size}px ${FONT}`.trim();
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    const px = Math.round(x);
    const py = Math.round(y);
    if (opts.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillText(str, px - 1, py);
      ctx.fillText(str, px + 1, py);
      ctx.fillText(str, px, py - 1);
      ctx.fillText(str, px, py + 1);
    }
    ctx.fillStyle = opts.color || '#e6f0e0';
    ctx.fillText(str, px, py);
  }

  /** Dark plate behind a block of text; the cheapest legibility there is. */
  plate(x, y, w, h, alpha = 0.55) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(6,8,7,${alpha})`;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  paint(time) {
    const ctx = this.ctx;
    const g = this.game;
    this.time = time;
    ctx.clearRect(0, 0, RENDER_W, RENDER_H);
    this.dirty = false;

    switch (g.state) {
      case STATE.TITLE:
        this.paintTitleBackdrop();
        break;
      case STATE.DEAD:
        this.paintPlay();
        this.paintDeathBackdrop();
        break;
      case STATE.WIN:
        this.paintWinBackdrop();
        break;
      case STATE.PAUSED:
        this.paintPlay();
        this.paintPauseBackdrop();
        break;
      default:
        this.paintPlay();
    }

    if (g.menu && g.menu.open) this.paintMenu(g.menu);
  }

  // ------------------------------------------------------------------ menu

  /**
   * Draws whatever screen the menu has on top, and hands the row rectangles
   * back so clicks land on what the player can see.
   */
  paintMenu(menu) {
    const ctx = this.ctx;
    const screen = menu.screen;
    if (!screen) return;
    const rows = screen.rows;

    // The title screen already spells the game's name across the backdrop;
    // repeating it inside the panel just wastes the panel.
    // The title, death and victory backdrops already spell out the same
    // heading in large type; repeating it inside the panel wastes the panel.
    const st = this.game.state;
    const bare = menu.stack.length === 1
      && (st === STATE.TITLE || st === STATE.DEAD || st === STATE.WIN);
    const heading = bare ? '' : screen.title;
    const subtitle = bare ? '' : screen.subtitle;
    const headH = (heading ? 20 : 6) + (subtitle ? 10 : 0);
    const bodyH = rows.reduce((a, r) => a + (r.kind === 'note' ? (r.label ? 9 : 4) : ROW_H), 0);
    const hintH = 11;

    const w = 244;
    const h = Math.min(RENDER_H - 12, headH + bodyH + hintH + 8);
    const x = Math.round((RENDER_W - w) / 2);
    const y = Math.round(Math.min(RENDER_H - h - 6, (RENDER_H - h) * 0.62));

    this.panel(x, y, w, h);
    if (heading) {
      this.text(heading, RENDER_W / 2, y + 15, {
        align: 'center', size: 12, color: '#d8e0c8',
      });
    }
    if (subtitle) {
      this.text(subtitle, RENDER_W / 2, y + headH - 2, {
        align: 'center', size: 6, color: '#7f8c80',
      });
    }

    const layout = [];
    let ry = y + headH + 4;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const on = i === menu.index && row.kind !== 'note';
      const cx = x + 14;
      const rw = w - 28;

      if (row.kind === 'note') {
        if (row.label) {
          this.text(row.label, RENDER_W / 2, ry + 6, {
            align: 'center', size: 6, color: 'rgba(150,168,155,0.8)',
          });
        }
        ry += row.label ? 9 : 4;
        continue;
      }

      if (on) {
        ctx.fillStyle = 'rgba(150,190,150,0.16)';
        ctx.fillRect(cx - 4, ry - 1, rw + 8, ROW_H - 2);
        this.text('›', cx - 9, ry + 8, { size: 8, color: '#d8c88a' });
      }

      this.text(row.label, cx, ry + 8, {
        size: 7,
        color: on ? '#f0efd8' : '#a8b8a8',
      });

      // Sliders get a bar as well as a number: the number alone is unreadable
      // at this resolution while you are dragging it.
      const fill = menu.sliderFill(row);
      if (fill >= 0) {
        const bw = 52;
        const bx = x + w - 46 - bw;
        const by = ry + 4;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
        ctx.fillStyle = on ? '#d8c88a' : '#6f7a68';
        ctx.fillRect(bx, by, Math.round(bw * Math.max(0, Math.min(1, fill))), 3);
        this.text(menu.valueText(row), x + w - 14, ry + 8, {
          align: 'right', size: 6, color: on ? '#f0efd8' : '#8a9a8a',
        });
      } else {
        const value = menu.valueText(row);
        if (value) {
          this.text(value, x + w - 14, ry + 8, {
            align: 'right', size: 7, color: on ? '#d8c88a' : '#8a9a8a',
          });
        }
      }

      layout.push({ index: i, x: cx - 6, y: ry - 1, w: rw + 12, h: ROW_H - 1 });
      ry += ROW_H;
    }

    menu.setLayout(layout);

    this.text('↑↓ выбор    ←→ значение    ENTER — ок    ESC — назад', RENDER_W / 2, y + h - 4, {
      align: 'center', size: 6, color: 'rgba(180,195,180,0.5)',
    });
  }

  // ------------------------------------------------------------------ play

  paintPlay() {
    const g = this.game;
    const ctx = this.ctx;
    const p = g.player;
    // Before the first run the player exists but has no aggregated stats yet.
    if (!p || !p.stats) return;

    this.paintCrosshair();

    // A single plate under the whole left cluster. Individual plates behind
    // each bar left the labels sitting on raw world pixels, which is where
    // small type goes to die.
    this.plate(4, RENDER_H - 42, 152, 40, 0.42);

    // --- health -----------------------------------------------------------
    const barW = 78;
    const barH = 5;
    const bx = 10;
    const by = RENDER_H - 22;
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
    const ty = RENDER_H - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, ty - 1, tw + 2, 5);
    const charge = clamp(g.torch.charge, 0, 1);
    ctx.fillStyle = charge > 0.3 ? '#d8d08a' : charge > 0.12 ? '#e0a24a' : '#e4543f';
    ctx.fillRect(bx, ty, tw * charge, 3);
    this.text(g.torch.on ? 'ФОНАРЬ' : 'ВЫКЛ', bx + tw + 6, ty + 4, {
      color: g.torch.on ? '#e0d8a8' : '#8a8a80',
    });

    // --- ammo / heat ------------------------------------------------------
    const heat = clamp(p.heat, 0, 1);
    const hx = RENDER_W - 62;
    this.plate(hx - 6, by - 27, 68, 37, 0.42);
    // What you are holding, above the heat bar it belongs to. Right-aligned so
    // a long name grows inward instead of off the edge of the screen.
    const wep = WEAPONS[p.inv.weaponId] || WEAPONS[STARTING_WEAPON];
    if (wep) {
      this.text(wep.name, RENDER_W - 8, by - 16, {
        align: 'right',
        color: rarityOf(wep.quality).hud,
      });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(hx - 1, by - 1, 52 + 2, barH + 2);
    ctx.fillStyle = p.overheated ? '#e4543f' : heat > 0.7 ? '#e8a04a' : '#7fb8e8';
    ctx.fillRect(hx, by, 52 * (1 - heat), barH);
    this.text(p.overheated ? 'ПЕРЕГРЕВ' : 'ЗАРЯД', hx, by - 5, {
      color: p.overheated ? '#ffb4a4' : '#c8d8d0',
    });

    // --- resources --------------------------------------------------------
    const relics = p.inv.relics.length;
    this.plate(RENDER_W - 58, 4, 54, relics ? 34 : 24, 0.42);
    this.text(`◈ ${p.coins}`, RENDER_W - 10, 14, { align: 'right', color: '#f0dc98' });
    this.text(`✦ ${p.inv.items.length}`, RENDER_W - 10, 24, { align: 'right', color: '#b8d4f0' });
    if (relics) {
      this.text(`❖ ${relics}`, RENDER_W - 10, 34, { align: 'right', color: rarityOf(5).hud });
    }

    // --- active item ------------------------------------------------------
    if (p.inv.activeId) {
      const ready = p.inv.activeCharge >= p.inv.activeMax;
      this.text(
        `[Q] ${p.inv.activeName}${ready ? '' : ` ${p.inv.activeCharge}/${p.inv.activeMax}`}`,
        10,
        RENDER_H - 30,
        { color: ready ? '#f0dc98' : '#8a9088' },
      );
    }

    // --- floor label and objective ---------------------------------------
    // Stacked on the left rather than one centred and one left-aligned: the
    // longest floor name runs straight through a centred objective line.
    const def = g.floorDef;
    if (def) {
      const label = `${def.index}/5  ${def.name}`;
      this.plate(4, 4, label.length * 5.8 + 12, 14, 0.42);
      this.text(label, 10, 14, { color: '#b0c8ba' });
    }

    // --- objective --------------------------------------------------------
    // On its own line under the floor label. Sharing a line worked until a
    // floor was called "ПРИЗМАТИЧЕСКАЯ СОКРОВИЩНИЦА" and the two ran through
    // each other. Left-aligned so it can never reach the boss bar, on a plate
    // so the dither does not eat it.
    if (g.objective) {
      this.plate(4, 16, g.objective.length * 5.1 + 12, 12, 0.38);
      this.text(g.objective, 10, 25, { size: 6, color: '#c8b878' });
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
      grd.addColorStop(1, `rgba(180,20,20,${dmg * 0.5})`);
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

    ctx.fillStyle = 'rgba(4,6,5,0.92)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    // Fit the part of the grid the level actually occupies, not the whole
    // 56x56 array — most of it is untouched rock, and scaling to it left the
    // map as a thumbnail in the middle of an empty screen.
    let minX = d.width;
    let minY = d.height;
    let maxX = 0;
    let maxY = 0;
    for (const r of d.rooms) {
      minX = Math.min(minX, r.x - 1);
      minY = Math.min(minY, r.y - 1);
      maxX = Math.max(maxX, r.x + r.w + 1);
      maxY = Math.max(maxY, r.y + r.h + 1);
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const boxW = RENDER_W - 40;
    const boxH = RENDER_H - 46;
    const scale = Math.max(2, Math.floor(Math.min(boxW / spanX, boxH / spanY)));
    const ox = Math.round((RENDER_W - spanX * scale) / 2 - minX * scale);
    const oy = Math.round((RENDER_H - spanY * scale) / 2 - minY * scale + 4);

    // Corridors the player has actually walked.
    ctx.fillStyle = 'rgba(86,104,94,0.6)';
    for (const c of g.exploredCells) {
      const gx = c % d.width;
      const gy = (c / d.width) | 0;
      ctx.fillRect(ox + gx * scale, oy + gy * scale, scale, scale);
    }

    for (const room of d.rooms) {
      if (!room.seen) continue;
      ctx.fillStyle =
        room.kind === 'boss' ? 'rgba(200,70,60,0.8)'
        : room.kind === 'shop' ? 'rgba(90,180,220,0.75)'
        : room.kind === 'treasure' ? 'rgba(220,190,90,0.75)'
        : room.kind === 'challenge' ? 'rgba(180,120,220,0.7)'
        : 'rgba(120,150,130,0.6)';
      ctx.fillRect(ox + room.x * scale, oy + room.y * scale, room.w * scale, room.h * scale);
      if (room.cleared) {
        ctx.strokeStyle = 'rgba(220,240,210,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + room.x * scale + 0.5, oy + room.y * scale + 0.5,
          room.w * scale - 1, room.h * scale - 1);
      }
    }

    // The way down, once it is open.
    const st = d.stairs;
    if (st.active) {
      const sx = ox + st.gx * scale;
      const sy = oy + st.gy * scale;
      ctx.fillStyle = '#8fe8b0';
      ctx.fillRect(sx - 1, sy - 1, scale + 2, scale + 2);
    }

    // Player position and facing: a dot alone does not tell you which way you
    // are pointing, which is the one thing a map in a dark game is for.
    const p = g.player;
    const px = ox + (p.x / CELL) * scale;
    const py = oy + (p.z / CELL) * scale;
    ctx.fillStyle = '#e8f0d8';
    ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    ctx.strokeStyle = '#e8f0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(p.yaw) * scale * 1.6, py + Math.cos(p.yaw) * scale * 1.6);
    ctx.stroke();

    this.text('КАРТА  —  TAB', RENDER_W / 2, 12, { align: 'center', size: 7, color: '#8fa898' });
    const legend = st.active ? 'зелёное — лестница' : 'красное — логово';
    this.text(legend, RENDER_W / 2, RENDER_H - 6, { align: 'center', size: 6, color: '#6f7a68' });
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

  paintTitleBackdrop() {
    const ctx = this.ctx;
    ctx.fillStyle = '#050706';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    const flick = 0.75 + 0.25 * Math.sin(this.time * 7) * Math.sin(this.time * 2.3);
    ctx.globalAlpha = flick;
    this.text('ГЛУБИНА', RENDER_W / 2, 46, { align: 'center', size: 30, color: '#c8d8c0', weight: 'bold' });
    ctx.globalAlpha = 1;
    this.text('спуск на пять этажей', RENDER_W / 2, 60, { align: 'center', size: 8, color: '#7a8c80' });

    if (this.game.best) {
      const b = this.game.best;
      this.text(
        `лучший спуск: этаж ${b.floor}   убийств ${b.kills}`,
        RENDER_W / 2, 76,
        { align: 'center', size: 7, color: '#a89858' },
      );
    }
  }

  paintPauseBackdrop() {
    const ctx = this.ctx;
    const g = this.game;
    ctx.fillStyle = 'rgba(4,6,5,0.86)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    // The run at a glance, above the menu: what this build actually does. It
    // gets its own panel because the playing HUD is still drawn underneath.
    const p = g.player;
    if (!p || !p.stats) return;
    const st = p.stats;
    const pw = 300;
    const px = Math.round((RENDER_W - pw) / 2);
    const py = 8;
    const ph = 82;
    this.panel(px, py, pw, ph);

    this.text(`ЭТАЖ ${g.floorIndex}/5  ${g.floorDef ? g.floorDef.name : ''}`, px + 10, py + 12, {
      size: 7, color: '#c8d8c0',
    });
    this.text(g.difficulty().name, px + pw - 10, py + 12, {
      size: 6, color: '#7f8c80', align: 'right',
    });

    const rows = [
      ['урон', (st.damage * st.damageMult).toFixed(1)],
      ['темп стрельбы', st.fireRate.toFixed(2)],
      ['скорость', st.moveSpeed.toFixed(2)],
      ['броня', st.armor.toFixed(0)],
      ['крит', `${(st.critChance * 100).toFixed(0)}%`],
      ['здоровье', `${Math.ceil(p.hp)}/${st.maxHp}`],
      ['предметов', String(p.inv.items.length)],
      ['убийств', String(g.stats.kills)],
    ];
    const colW = (pw - 20) / 2;
    rows.forEach((r, i) => {
      const col = i % 2;
      const row = (i / 2) | 0;
      const lx = px + 10 + col * colW;
      this.text(r[0], lx, py + 24 + row * 9, { size: 6, color: '#7f8c80' });
      this.text(r[1], lx + colW - 8, py + 24 + row * 9, {
        size: 6, color: '#d8e0c8', align: 'right',
      });
    });

    const sy = py + ph - 18;
    this.text('связки:', px + 10, sy, { size: 6, color: '#8fd66a' });
    if (!p.inv.synergies.length) {
      this.text('— пока нет —', px + 44, sy, { size: 6, color: '#5f6a60' });
    } else {
      this.text(p.inv.synergies.map((s2) => s2.name).join(', ').slice(0, 62), px + 44, sy, {
        size: 6, color: '#a8d8a0',
      });
    }

    // Relics get their own line: they are the ones that changed a rule.
    const ry = py + ph - 6;
    this.text('реликвии:', px + 10, ry, { size: 6, color: rarityOf(5).hud });
    if (!p.inv.relics.length) {
      this.text('— пока нет —', px + 44, ry, { size: 6, color: '#5f6a60' });
    } else {
      const names = p.inv.relics.map((id) => (RELICS[id] ? RELICS[id].name : id));
      this.text(names.join(', ').slice(0, 62), px + 44, ry, { size: 6, color: '#e8dca8' });
    }
  }

  paintDeathBackdrop() {
    const ctx = this.ctx;
    const g = this.game;
    ctx.fillStyle = 'rgba(20,3,3,0.93)';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
    this.text('СИГНАЛ ПОТЕРЯН', RENDER_W / 2, 30, { align: 'center', size: 15, color: '#e08070' });
    this.paintRunStats('#a08880', '#e0d0c8');
  }

  /** The numbers that describe a finished run. */
  paintRunStats(labelColor, valueColor) {
    const s = this.game.stats;
    const rows = [
      ['сложность', this.game.difficulty().name],
      ['этаж', `${s.floorReached} / 5`],
      ['убийств', String(s.kills)],
      ['предметов', String(s.itemsTaken)],
      ['комнат зачищено', String(s.roomsCleared)],
      ['время', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
    ];
    rows.forEach((r, i) => {
      const y = 46 + i * 10;
      this.text(r[0], RENDER_W / 2 - 66, y, { size: 7, color: labelColor });
      this.text(r[1], RENDER_W / 2 + 66, y, { size: 7, color: valueColor, align: 'right' });
    });
  }

  paintWinBackdrop() {
    const ctx = this.ctx;
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
    this.text('ДРАКОН ПОВЕРЖЕН', RENDER_W / 2, 30, { align: 'center', size: 16, color: '#f0ece0' });
    this.paintRunStats('#b8c8c0', '#f0ece0');
  }
}
