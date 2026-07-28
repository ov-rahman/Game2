/**
 * HUD and full-screen overlays.
 *
 * Everything here is immediate-mode canvas drawing: no DOM, no layout engine,
 * so the same code renders identically in a desktop shell.
 */
import { VIEW_W, VIEW_H, VIEW_OX, VIEW_OY } from '../core/constants.js';
import { STATE } from '../core/game.js';
import { ITEMS, ACTIVES } from '../data/items.js';
import { FLOORS } from '../data/floors.js';
import { rgba, roundRect, circle, TAU } from './draw.js';
import { clamp } from '../core/math.js';

function text(ctx, str, x, y, opts = {}) {
  ctx.font = opts.font || '9px monospace';
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(str, x + 1, y + 1);
  }
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(str, x, y);
}

function heart(ctx, x, y, fill) {
  const r = 5;
  const path = (rr) => {
    ctx.beginPath();
    ctx.moveTo(x, y + rr * 0.42);
    ctx.bezierCurveTo(x - rr * 1.3, y - rr * 0.3, x - rr * 0.5, y - rr * 1.1, x, y - rr * 0.4);
    ctx.bezierCurveTo(x + rr * 0.5, y - rr * 1.1, x + rr * 1.3, y - rr * 0.3, x, y + rr * 0.42);
    ctx.closePath();
  };
  path(r);
  ctx.fillStyle = '#2a1016';
  ctx.fill();
  if (fill <= 0) return;
  ctx.save();
  if (fill < 1) {
    ctx.beginPath();
    ctx.rect(x - r * 1.4, y - r * 1.4, r * 1.4, r * 2.8);
    ctx.clip();
  }
  path(r * 0.86);
  ctx.fillStyle = '#e8455c';
  ctx.fill();
  ctx.restore();
}

function shieldPip(ctx, x, y) {
  const r = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.9, y - r * 0.3);
  ctx.lineTo(x + r * 0.6, y + r * 0.8);
  ctx.lineTo(x - r * 0.6, y + r * 0.8);
  ctx.lineTo(x - r * 0.9, y - r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#8fd6ff';
  ctx.fill();
  ctx.strokeStyle = '#2a5f8a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHud(ctx, g, renderer) {
  const p = g.player;
  const st = p.stats;

  // --- health -----------------------------------------------------------
  const hearts = Math.ceil(st.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const hp = clamp(p.hp - i * 2, 0, 2);
    heart(ctx, 10 + (i % 8) * 12, 11 + Math.floor(i / 8) * 12, hp / 2);
  }
  for (let i = 0; i < p.shield; i += 2) {
    shieldPip(ctx, 10 + ((hearts + i / 2) % 8) * 12, 11 + Math.floor((hearts + i / 2) / 8) * 12);
  }

  // --- resources --------------------------------------------------------
  const rx = VIEW_W - 8;
  const f = Math.floor(renderer.time * 6) % 4;
  const res = [
    ['coin', p.coins],
    ['key', p.keys],
    ['bomb', p.bombs],
  ];
  res.forEach(([kind, n], i) => {
    const y = 12 + i * 13;
    renderer.blitCentered(ctx, renderer.common, `pickup_${kind}_${f}`, rx - 30, y);
    text(ctx, `x${n}`, rx - 20, y + 3, { align: 'left', color: '#ffe9a8' });
  });

  // --- active item ------------------------------------------------------
  if (p.inv.activeId) {
    const act = ACTIVES[p.inv.activeId];
    const ax = 16;
    const ay = VIEW_H - 26;
    const ready = p.inv.activeCharge >= p.inv.activeMax;
    ctx.globalAlpha = ready ? 1 : 0.5;
    renderer.blitCentered(ctx, renderer.common, `active_${p.inv.activeId}`, ax, ay);
    ctx.globalAlpha = 1;
    // charge pips
    for (let i = 0; i < p.inv.activeMax; i++) {
      ctx.fillStyle = i < p.inv.activeCharge ? '#ffd93d' : 'rgba(255,255,255,0.22)';
      ctx.fillRect(ax - 10 + i * 5, ay + 14, 4, 3);
    }
    if (ready) {
      ctx.strokeStyle = rgba('#ffd93d', 0.6 + Math.sin(renderer.time * 6) * 0.3);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 14, 0, TAU);
      ctx.stroke();
    }
    text(ctx, 'Q', ax + 12, ay + 12, { color: '#cfe8ff', font: '8px monospace' });
  }

  // --- collected items --------------------------------------------------
  const items = p.inv.items;
  const maxShow = 14;
  const startX = 36;
  for (let i = 0; i < Math.min(items.length, maxShow); i++) {
    const ix = startX + (i % 7) * 15;
    const iy = VIEW_H - 30 + Math.floor(i / 7) * 15;
    ctx.globalAlpha = 0.9;
    renderer.blitCentered(ctx, renderer.common, `item_${items[i]}`, ix, iy, 0.55);
    ctx.globalAlpha = 1;
  }
  if (items.length > maxShow) {
    text(ctx, `+${items.length - maxShow}`, startX + 7 * 15, VIEW_H - 27, { color: '#cfe8ff' });
  }

  // --- floor label ------------------------------------------------------
  const def = g.floor ? g.floor.def : null;
  if (def) {
    text(ctx, `Э${def.index} · ${def.name}`, VIEW_W / 2, 11, {
      align: 'center',
      color: def.palette.accent1,
      font: '9px monospace',
    });
  }

  // --- dash cooldown ----------------------------------------------------
  if (p.dashCd > 0) {
    const w = 26;
    const x = VIEW_W - 8 - w;
    const y = VIEW_H - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#4fe1ff';
    ctx.fillRect(x, y, w * (1 - p.dashCd / p.stats.dashCooldown), 4);
  } else {
    text(ctx, 'рывок', VIEW_W - 8, VIEW_H - 8, { align: 'right', color: 'rgba(180,220,255,0.7)', font: '8px monospace' });
  }

  // --- boss bar ---------------------------------------------------------
  const boss = g.enemies.find((e) => e.isBoss);
  if (boss) {
    const bw = 260;
    const bx = (VIEW_W - bw) / 2;
    const by = VIEW_H - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bx - 2, by - 2, bw + 4, 12, 3, 'rgba(0,0,0,0.6)');
    const k = clamp(boss.hp / boss.maxHp, 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, boss.colorHex || '#ff5b6b');
    grad.addColorStop(1, '#ffd166');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * k, 8);
    // phase separators
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const t of boss.phaseThresholds) ctx.fillRect(bx + bw * t, by, 1, 8);
    text(ctx, boss.name, VIEW_W / 2, by - 4, { align: 'center', color: '#ffffff', font: '9px monospace' });
  }

  // --- messages ---------------------------------------------------------
  let my = 46;
  for (const m of g.messages) {
    const k = clamp(m.time - m.t, 0, 1);
    ctx.globalAlpha = k;
    text(ctx, m.title, VIEW_W / 2, my, { align: 'center', color: '#ffffff', font: '12px monospace' });
    if (m.sub) text(ctx, m.sub, VIEW_W / 2, my + 12, { align: 'center', color: '#cfe8ff', font: '8px monospace' });
    ctx.globalAlpha = 1;
    my += 26;
  }

  // --- locked room indicator -------------------------------------------
  if (g.roomLocked) {
    const alive = g.enemies.filter((e) => e.alive).length;
    text(ctx, `врагов: ${alive}`, VIEW_W / 2, VIEW_H - 6, {
      align: 'center',
      color: 'rgba(255,200,200,0.8)',
      font: '8px monospace',
    });
  }

  if (g.debug && renderer.loop) {
    const l = renderer.loop;
    text(ctx, `fps ${l.fps.toFixed(0)} tps ${l.tps.toFixed(0)}`, 4, VIEW_H - 40, { color: '#7cff6b', font: '8px monospace' });
    text(ctx, `shots ${g.shots.count} ent ${g.enemies.length} fx ${g.effects.length} p ${renderer.particles.count}`, 4, VIEW_H - 32, {
      color: '#7cff6b',
      font: '8px monospace',
    });
  }
}

// ---------------------------------------------------------------- overlays

export function drawOverlays(ctx, g, renderer, alpha) {
  switch (g.state) {
    case STATE.TITLE:
      drawTitle(ctx, g, renderer);
      break;
    case STATE.ITEM_GET:
      drawItemGet(ctx, g, renderer);
      break;
    case STATE.PAUSED:
      drawPause(ctx, g, renderer);
      break;
    case STATE.DEAD:
      drawDeath(ctx, g, renderer);
      break;
    case STATE.WIN:
      drawWin(ctx, g, renderer);
      break;
    default:
      break;
  }
}

function panel(ctx, x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(8,10,18,0.9)';
  roundRect(ctx, x, y, w, h, 6, 'rgba(8,10,18,0.92)');
  ctx.strokeStyle = accent || '#4fe1ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.stroke();
}

function drawTitle(ctx, g, renderer) {
  const t = renderer.time;
  // Animated prismatic backdrop, cheap: four moving radial washes.
  ctx.fillStyle = '#0b0a1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const cols = ['#ff4fa3', '#4fe1ff', '#ffe14f', '#7cff6b'];
  for (let i = 0; i < 4; i++) {
    const a = t * 0.35 + (i / 4) * TAU;
    const x = VIEW_W / 2 + Math.cos(a) * 150;
    const y = VIEW_H / 2 + Math.sin(a * 1.3) * 80;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, 190);
    grd.addColorStop(0, rgba(cols[i], 0.28));
    grd.addColorStop(1, rgba(cols[i], 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  text(ctx, 'ГЛУБИНА', VIEW_W / 2, 96, { align: 'center', font: 'bold 34px monospace', color: '#ffffff' });
  text(ctx, 'спуск в пять этажей', VIEW_W / 2, 116, { align: 'center', font: '10px monospace', color: '#cfe8ff' });

  const pulse = 0.6 + Math.sin(t * 3) * 0.4;
  ctx.globalAlpha = pulse;
  text(ctx, 'ENTER / ЛКМ — начать спуск', VIEW_W / 2, 186, { align: 'center', font: '11px monospace', color: '#ffe066' });
  ctx.globalAlpha = 1;

  const lines = [
    'WASD — движение     мышь / стрелки — стрельба',
    'SHIFT — рывок      E — бомба      Q — активный предмет',
    'TAB — карта        ESC — пауза     F11 — полный экран',
    'геймпад: левый стик — ход, правый — огонь',
  ];
  lines.forEach((l, i) => {
    text(ctx, l, VIEW_W / 2, 226 + i * 14, { align: 'center', font: '9px monospace', color: 'rgba(220,235,255,0.85)' });
  });

  if (renderer.best) {
    text(ctx, `лучший результат: этаж ${renderer.best.floor}, убийств ${renderer.best.kills}`, VIEW_W / 2, VIEW_H - 20, {
      align: 'center',
      font: '9px monospace',
      color: '#ffd93d',
    });
  }
}

function drawItemGet(ctx, g, renderer) {
  const pi = g.pendingItem;
  if (!pi) return;
  const k = clamp(pi.t * 4, 0, 1);
  ctx.globalAlpha = 0.65 * k;
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;

  const w = 300;
  const h = pi.synergies.length ? 150 : 116;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(0.85 + k * 0.15, 0.85 + k * 0.15);
  ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
  panel(ctx, x, y, w, h, '#ffe066');

  renderer.blitCentered(ctx, renderer.common, `item_${pi.id}`, VIEW_W / 2, y + 34, 1.6);
  text(ctx, pi.item.name, VIEW_W / 2, y + 66, { align: 'center', font: 'bold 13px monospace', color: '#ffe066' });

  wrapText(ctx, pi.item.desc, VIEW_W / 2, y + 84, w - 36, 11, { align: 'center', font: '9px monospace', color: '#dfe9ff' });

  if (pi.synergies.length) {
    let sy = y + h - 40;
    for (const syn of pi.synergies) {
      text(ctx, `★ ${syn.name}`, VIEW_W / 2, sy, { align: 'center', font: 'bold 10px monospace', color: '#7cff6b' });
      text(ctx, syn.desc, VIEW_W / 2, sy + 11, { align: 'center', font: '8px monospace', color: '#a8e6b0' });
      sy += 24;
    }
  }
  text(ctx, 'любая кнопка — дальше', VIEW_W / 2, y + h - 6, { align: 'center', font: '8px monospace', color: 'rgba(255,255,255,0.5)' });
  ctx.restore();
}

function drawPause(ctx, g, renderer) {
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;
  const w = 320;
  const h = 210;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  panel(ctx, x, y, w, h);
  text(ctx, 'ПАУЗА', VIEW_W / 2, y + 24, { align: 'center', font: 'bold 16px monospace' });

  const p = g.player;
  const st = p.stats;
  const stats = [
    ['урон', (st.damage * st.damageMult).toFixed(1)],
    ['скорострельность', st.fireRate.toFixed(2)],
    ['скорость', st.moveSpeed.toFixed(0)],
    ['скорость выстрела', st.shotSpeed.toFixed(0)],
    ['дальность', st.range.toFixed(2)],
    ['удача', st.luck.toFixed(1)],
    ['броня', st.armor.toFixed(0)],
    ['крит', `${(st.critChance * 100).toFixed(0)}%`],
  ];
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    text(ctx, s[0], x + 20 + col * 150, y + 48 + row * 13, { font: '9px monospace', color: '#9fb6cf' });
    text(ctx, s[1], x + 140 + col * 150, y + 48 + row * 13, { font: '9px monospace', color: '#ffffff', align: 'right' });
  });

  let sy = y + 118;
  text(ctx, 'активные связки:', x + 20, sy, { font: '9px monospace', color: '#7cff6b' });
  sy += 12;
  if (p.inv.synergies.length === 0) {
    text(ctx, '— пока нет —', x + 24, sy, { font: '8px monospace', color: 'rgba(255,255,255,0.5)' });
  } else {
    for (const syn of p.inv.synergies.slice(0, 5)) {
      text(ctx, `★ ${syn.name}`, x + 24, sy, { font: '8px monospace', color: '#a8e6b0' });
      sy += 10;
    }
  }

  text(ctx, 'ESC — продолжить    R — заново', VIEW_W / 2, y + h - 12, {
    align: 'center',
    font: '9px monospace',
    color: 'rgba(255,255,255,0.6)',
  });
}

function drawDeath(ctx, g, renderer) {
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = '#12040a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;
  const w = 300;
  const h = 150;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  panel(ctx, x, y, w, h, '#ff5b6b');
  text(ctx, 'ТЫ ПАЛ', VIEW_W / 2, y + 30, { align: 'center', font: 'bold 20px monospace', color: '#ff8fa0' });
  const s = g.stats;
  const rows = [
    ['этаж', `${s.floorReached} / ${FLOORS.length}`],
    ['убийств', s.kills],
    ['комнат зачищено', s.roomsCleared],
    ['предметов', s.itemsTaken],
    ['время', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
  ];
  rows.forEach((r, i) => {
    text(ctx, r[0], x + 24, y + 56 + i * 13, { font: '9px monospace', color: '#9fb6cf' });
    text(ctx, String(r[1]), x + w - 24, y + 56 + i * 13, { font: '9px monospace', align: 'right' });
  });
  text(ctx, 'ENTER — новый забег', VIEW_W / 2, y + h - 12, { align: 'center', font: '10px monospace', color: '#ffe066' });
}

function drawWin(ctx, g, renderer) {
  const t = renderer.time;
  ctx.fillStyle = '#0b0a1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const cols = ['#ff4fa3', '#4fe1ff', '#ffe14f', '#7cff6b', '#b06bff'];
  for (let i = 0; i < 5; i++) {
    const a = t * 0.5 + (i / 5) * TAU;
    const x = VIEW_W / 2 + Math.cos(a) * 170;
    const y = VIEW_H / 2 + Math.sin(a * 1.5) * 90;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, 200);
    grd.addColorStop(0, rgba(cols[i], 0.32));
    grd.addColorStop(1, rgba(cols[i], 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  text(ctx, 'ДРАКОН ПОВЕРЖЕН', VIEW_W / 2, 110, { align: 'center', font: 'bold 22px monospace', color: '#ffffff' });
  const s = g.stats;
  const rows = [
    ['убийств', s.kills],
    ['боссов', s.bossesKilled],
    ['предметов', s.itemsTaken],
    ['урона получено', s.damageTaken],
    ['время', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
  ];
  rows.forEach((r, i) => {
    text(ctx, r[0], VIEW_W / 2 - 90, 150 + i * 15, { font: '10px monospace', color: '#cfe8ff' });
    text(ctx, String(r[1]), VIEW_W / 2 + 90, 150 + i * 15, { font: '10px monospace', align: 'right', color: '#ffffff' });
  });
  text(ctx, 'ENTER — новый забег', VIEW_W / 2, VIEW_H - 30, { align: 'center', font: '11px monospace', color: '#ffe066' });
}

function wrapText(ctx, str, x, y, maxW, lineH, opts) {
  ctx.font = opts.font || '9px monospace';
  const words = String(str).split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, opts));
  return lines.length;
}

export { text as hudText };
