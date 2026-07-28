/**
 * Minimap.
 *
 * Compact by default in the top-right; TAB expands it to a full-screen map with
 * room icons. Only rooms the player has seen or mapped are drawn.
 */
import { VIEW_W, VIEW_H, ROOM_KIND } from '../core/constants.js';
import { rgba, roundRect, circle, TAU } from './draw.js';

const CELL = 9;
const GAP = 2;

const ICON_COLOR = {
  [ROOM_KIND.TREASURE]: '#ffd93d',
  [ROOM_KIND.SHOP]: '#7cc7ff',
  [ROOM_KIND.CHALLENGE]: '#ff8b3d',
  [ROOM_KIND.BOSS]: '#ff4f6b',
  [ROOM_KIND.SECRET]: '#b06bff',
  [ROOM_KIND.START]: '#cfe8ff',
};

export function drawMinimap(ctx, g, renderer) {
  if (!g.floor) return;
  const expanded = renderer.mapExpanded;
  const rooms = g.floor.rooms;

  let minX = 99;
  let minY = 99;
  let maxX = -99;
  let maxY = -99;
  for (const r of rooms) {
    if (!r.mapped && !r.visited) continue;
    minX = Math.min(minX, r.gx);
    maxX = Math.max(maxX, r.gx);
    minY = Math.min(minY, r.gy);
    maxY = Math.max(maxY, r.gy);
  }
  if (maxX < minX) return;

  const cell = expanded ? 26 : CELL;
  const gap = expanded ? 5 : GAP;
  const w = (maxX - minX + 1) * (cell + gap);
  const h = (maxY - minY + 1) * (cell + gap);

  let ox;
  let oy;
  if (expanded) {
    ctx.fillStyle = 'rgba(5,6,10,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ox = (VIEW_W - w) / 2;
    oy = (VIEW_H - h) / 2;
  } else {
    ox = VIEW_W - w - 8;
    oy = 34;
    ctx.fillStyle = 'rgba(5,6,10,0.45)';
    roundRect(ctx, ox - 4, oy - 4, w + 8, h + 8, 3, 'rgba(5,6,10,0.45)');
  }

  for (const r of rooms) {
    const seen = r.visited;
    const mapped = r.mapped;
    if (!seen && !mapped) continue;
    if (r.hidden && !seen) continue;

    const x = ox + (r.gx - minX) * (cell + gap);
    const y = oy + (r.gy - minY) * (cell + gap);
    const current = g.room && g.room.id === r.id;

    let fill = seen ? 'rgba(150,170,200,0.55)' : 'rgba(90,105,130,0.28)';
    if (current) fill = g.floor.def.palette.minimap;
    else if (r.kind !== ROOM_KIND.NORMAL && seen) fill = rgba(ICON_COLOR[r.kind] || '#ffffff', 0.6);

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, cell, cell);

    if (!r.cleared && seen && r.kind !== ROOM_KIND.START) {
      ctx.strokeStyle = 'rgba(255,120,120,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }

    // Room-kind marker.
    const c = ICON_COLOR[r.kind];
    if (c && r.kind !== ROOM_KIND.NORMAL && r.kind !== ROOM_KIND.START) {
      ctx.fillStyle = c;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      if (r.kind === ROOM_KIND.BOSS) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - cell * 0.3);
        ctx.lineTo(cx + cell * 0.3, cy + cell * 0.25);
        ctx.lineTo(cx - cell * 0.3, cy + cell * 0.25);
        ctx.closePath();
        ctx.fill();
      } else {
        circle(ctx, cx, cy, cell * 0.2, c);
      }
    }

    // Connections.
    ctx.strokeStyle = 'rgba(190,205,230,0.5)';
    ctx.lineWidth = 1;
    for (let d = 0; d < 4; d++) {
      if (r.doors[d] == null) continue;
      if (r.secretSide[d] && !r.secretOpen) continue;
      const nb = rooms[r.doors[d]];
      if (!nb.mapped && !nb.visited) continue;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const ex = cx + [0, 1, 0, -1][d] * (cell / 2 + gap / 2);
      const ey = cy + [-1, 0, 1, 0][d] * (cell / 2 + gap / 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    if (current) {
      ctx.fillStyle = '#ffffff';
      circle(ctx, x + cell / 2, y + cell / 2, Math.max(1.5, cell * 0.14), '#ffffff');
    }
  }

  if (expanded) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(`${g.floor.def.name} — этаж ${g.floor.def.index}`, VIEW_W / 2, oy - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px monospace';
    ctx.fillText('TAB — закрыть', VIEW_W / 2, oy + h + 20);
  }
}
