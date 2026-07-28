/**
 * Procedural item, pickup and prop sprites.
 *
 * Item icons are generated from the `art` descriptor on each item row, so a new
 * item gets art for free by naming a shape and three colours.
 */
import {
  circle,
  ellipse,
  roundRect,
  polygon,
  star,
  glow,
  rgba,
  mix,
  shade,
  TAU,
} from './draw.js';

export const ITEM_SIZE = 24;

/** @param {CanvasRenderingContext2D} ctx centred at the icon's middle */
export function paintItem(ctx, s, art) {
  const [main, dark, light] = art.colors;
  const shape = SHAPES[art.shape] || SHAPES.orb;
  glow(ctx, 0, 0, s * 0.6, main, 0.25);
  shape(ctx, s, main, dark, light);
}

const SHAPES = {
  orb(ctx, s, c, d, l) {
    circle(ctx, 0, 0, s * 0.32, d);
    circle(ctx, 0, 0, s * 0.28, c);
    circle(ctx, -s * 0.09, -s * 0.09, s * 0.11, l);
  },

  blade(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(s * 0.11, -s * 0.05);
    ctx.lineTo(0, s * 0.22);
    ctx.lineTo(-s * 0.11, -s * 0.05);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = d;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = l;
    ctx.fillRect(-s * 0.02, -s * 0.34, s * 0.04, s * 0.42);
    roundRect(ctx, -s * 0.16, s * 0.2, s * 0.32, s * 0.07, 2, d);
    roundRect(ctx, -s * 0.05, s * 0.26, s * 0.1, s * 0.14, 2, d);
  },

  ring(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.29, 0, TAU);
    ctx.strokeStyle = d;
    ctx.lineWidth = s * 0.13;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.29, 0, TAU);
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.09;
    ctx.stroke();
    polygon(ctx, 0, -s * 0.29, s * 0.1, 4, 0, l);
  },

  book(ctx, s, c, d, l) {
    roundRect(ctx, -s * 0.3, -s * 0.26, s * 0.6, s * 0.52, 3, d);
    roundRect(ctx, -s * 0.26, -s * 0.22, s * 0.52, s * 0.44, 2, c);
    ctx.fillStyle = l;
    ctx.fillRect(-s * 0.02, -s * 0.26, s * 0.04, s * 0.52);
    star(ctx, 0, 0, s * 0.13, s * 0.05, 5, -Math.PI / 2, l);
  },

  heart(ctx, s, c, d, l) {
    const path = (r) => {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.38);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.35, -r * 0.5, -r * 1.1, 0, -r * 0.42);
      ctx.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.3, -r * 0.35, 0, r * 0.38);
      ctx.closePath();
    };
    path(s * 0.34);
    ctx.fillStyle = d;
    ctx.fill();
    path(s * 0.29);
    ctx.fillStyle = c;
    ctx.fill();
    ellipse(ctx, -s * 0.09, -s * 0.14, s * 0.06, s * 0.045, l);
  },

  skull(ctx, s, c, d, l) {
    circle(ctx, 0, -s * 0.06, s * 0.27, d);
    circle(ctx, 0, -s * 0.06, s * 0.24, c);
    roundRect(ctx, -s * 0.14, s * 0.1, s * 0.28, s * 0.16, 3, c);
    circle(ctx, -s * 0.1, -s * 0.08, s * 0.075, '#1a1a22');
    circle(ctx, s * 0.1, -s * 0.08, s * 0.075, '#1a1a22');
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(-s * 0.02, s * 0.02, s * 0.04, s * 0.07);
    ctx.fillStyle = l;
    ctx.fillRect(-s * 0.1, s * 0.14, s * 0.05, s * 0.08);
    ctx.fillRect(s * 0.05, s * 0.14, s * 0.05, s * 0.08);
  },

  wing(ctx, s, c, d, l) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.05, s * 0.2);
      ctx.quadraticCurveTo(side * s * 0.45, -s * 0.05, side * s * 0.3, -s * 0.3);
      ctx.quadraticCurveTo(side * s * 0.16, -s * 0.1, side * s * 0.05, s * 0.2);
      ctx.closePath();
      ctx.fillStyle = side < 0 ? d : c;
      ctx.fill();
      ctx.strokeStyle = l;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    roundRect(ctx, -s * 0.07, s * 0.06, s * 0.14, s * 0.26, 3, d);
  },

  gem(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(s * 0.28, -s * 0.06);
    ctx.lineTo(0, s * 0.34);
    ctx.lineTo(-s * 0.28, -s * 0.06);
    ctx.closePath();
    ctx.fillStyle = d;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.28);
    ctx.lineTo(s * 0.2, -s * 0.05);
    ctx.lineTo(0, s * 0.26);
    ctx.lineTo(-s * 0.2, -s * 0.05);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.28);
    ctx.lineTo(s * 0.2, -s * 0.05);
    ctx.lineTo(0, -s * 0.02);
    ctx.closePath();
    ctx.fillStyle = l;
    ctx.fill();
  },

  flask(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.09, -s * 0.3);
    ctx.lineTo(s * 0.09, -s * 0.3);
    ctx.lineTo(s * 0.09, -s * 0.12);
    ctx.lineTo(s * 0.26, s * 0.24);
    ctx.quadraticCurveTo(s * 0.3, s * 0.36, s * 0.1, s * 0.36);
    ctx.lineTo(-s * 0.1, s * 0.36);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.36, -s * 0.26, s * 0.24);
    ctx.lineTo(-s * 0.09, -s * 0.12);
    ctx.closePath();
    ctx.fillStyle = rgba('#ffffff', 0.25);
    ctx.fill();
    ctx.strokeStyle = l;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.1);
    ctx.lineTo(s * 0.2, s * 0.1);
    ctx.lineTo(s * 0.24, s * 0.24);
    ctx.quadraticCurveTo(s * 0.28, s * 0.34, s * 0.09, s * 0.34);
    ctx.lineTo(-s * 0.09, s * 0.34);
    ctx.quadraticCurveTo(-s * 0.28, s * 0.34, -s * 0.24, s * 0.24);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    roundRect(ctx, -s * 0.11, -s * 0.38, s * 0.22, s * 0.1, 2, d);
    circle(ctx, -s * 0.05, s * 0.2, s * 0.04, rgba('#ffffff', 0.7));
  },

  star(ctx, s, c, d, l) {
    star(ctx, 0, 0, s * 0.36, s * 0.15, 5, -Math.PI / 2, d);
    star(ctx, 0, 0, s * 0.3, s * 0.12, 5, -Math.PI / 2, c);
    star(ctx, -s * 0.03, -s * 0.05, s * 0.13, s * 0.05, 5, -Math.PI / 2, l);
  },

  bomb(ctx, s, c, d, l) {
    circle(ctx, 0, s * 0.06, s * 0.3, shade(c, -0.08));
    circle(ctx, 0, s * 0.06, s * 0.27, c);
    circle(ctx, -s * 0.1, -s * 0.04, s * 0.08, rgba('#ffffff', 0.35));
    roundRect(ctx, -s * 0.07, -s * 0.28, s * 0.14, s * 0.1, 2, '#6a5a3a');
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.14, -s * 0.42, s * 0.2, -s * 0.3);
    ctx.stroke();
    star(ctx, s * 0.22, -s * 0.3, s * 0.09, s * 0.035, 5, 0, d);
    glow(ctx, s * 0.22, -s * 0.3, s * 0.18, l, 0.7);
  },

  crown(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, s * 0.16);
    ctx.lineTo(-s * 0.32, -s * 0.1);
    ctx.lineTo(-s * 0.16, s * 0.02);
    ctx.lineTo(0, -s * 0.26);
    ctx.lineTo(s * 0.16, s * 0.02);
    ctx.lineTo(s * 0.32, -s * 0.1);
    ctx.lineTo(s * 0.32, s * 0.16);
    ctx.closePath();
    ctx.fillStyle = '#ffd93d';
    ctx.fill();
    ctx.strokeStyle = '#8a6a10';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    circle(ctx, -s * 0.18, s * 0.05, s * 0.05, c);
    circle(ctx, 0, s * 0.02, s * 0.055, d);
    circle(ctx, s * 0.18, s * 0.05, s * 0.05, l);
  },

  eye(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.36, s * 0.24, 0, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = d;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    circle(ctx, 0, 0, s * 0.15, c);
    circle(ctx, 0, 0, s * 0.07, '#141018');
    circle(ctx, -s * 0.05, -s * 0.06, s * 0.04, l);
  },

  rune(ctx, s, c, d, l) {
    polygon(ctx, 0, 0, s * 0.33, 6, Math.PI / 6, d);
    polygon(ctx, 0, 0, s * 0.27, 6, Math.PI / 6, c);
    ctx.strokeStyle = l;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.14);
    ctx.lineTo(s * 0.06, -s * 0.02);
    ctx.lineTo(-s * 0.08, s * 0.06);
    ctx.lineTo(s * 0.1, s * 0.16);
    ctx.stroke();
  },

  horn(ctx, s, c, d, l) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.16 - s * 0.06, s * 0.3);
      ctx.quadraticCurveTo(i * s * 0.18, -s * 0.1, i * s * 0.1, -s * 0.32);
      ctx.lineTo(i * s * 0.1 + s * 0.1, -s * 0.3);
      ctx.quadraticCurveTo(i * s * 0.24, -s * 0.08, i * s * 0.16 + s * 0.06, s * 0.3);
      ctx.closePath();
      ctx.fillStyle = i === 0 ? c : d;
      ctx.fill();
    }
    roundRect(ctx, -s * 0.3, s * 0.26, s * 0.6, s * 0.1, 3, l);
  },

  claw(ctx, s, c, d, l) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.15, s * 0.3);
      ctx.quadraticCurveTo(i * s * 0.3 + s * 0.02, -s * 0.06, i * s * 0.12, -s * 0.34);
      ctx.quadraticCurveTo(i * s * 0.05, -s * 0.04, i * s * 0.05, s * 0.3);
      ctx.closePath();
      ctx.fillStyle = i === 0 ? l : c;
      ctx.fill();
      ctx.strokeStyle = d;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },

  mask(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.36);
    ctx.quadraticCurveTo(-s * 0.34, s * 0.1, -s * 0.3, -s * 0.24);
    ctx.quadraticCurveTo(0, -s * 0.36, s * 0.3, -s * 0.24);
    ctx.quadraticCurveTo(s * 0.34, s * 0.1, 0, s * 0.36);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = d;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#14121c';
    ellipse(ctx, -s * 0.12, -s * 0.06, s * 0.08, s * 0.05, '#14121c');
    ellipse(ctx, s * 0.12, -s * 0.06, s * 0.08, s * 0.05, '#14121c');
    ctx.fillStyle = l;
    ctx.fillRect(-s * 0.16, s * 0.12, s * 0.32, s * 0.035);
  },

  clover(ctx, s, c, d, l) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ellipse(ctx, Math.cos(a) * s * 0.16, Math.sin(a) * s * 0.16 - s * 0.04, s * 0.13, s * 0.15, i % 2 ? c : mix(c, l, 0.3));
    }
    ctx.strokeStyle = d;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.06);
    ctx.quadraticCurveTo(s * 0.06, s * 0.24, -s * 0.02, s * 0.36);
    ctx.stroke();
  },

  gear(ctx, s, c, d, l) {
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const r = i % 2 === 0 ? s * 0.34 : s * 0.25;
      const a = (i / (teeth * 2)) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = d;
    ctx.fill();
    circle(ctx, 0, 0, s * 0.22, c);
    circle(ctx, 0, 0, s * 0.09, d);
    circle(ctx, -s * 0.07, -s * 0.07, s * 0.05, l);
  },

  feather(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(s * 0.08, s * 0.36);
    ctx.quadraticCurveTo(-s * 0.28, s * 0.06, -s * 0.04, -s * 0.36);
    ctx.quadraticCurveTo(s * 0.26, s * 0.0, s * 0.08, s * 0.36);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = d;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = l;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.06, s * 0.34);
    ctx.quadraticCurveTo(-s * 0.02, s * 0.0, -s * 0.03, -s * 0.34);
    ctx.stroke();
  },

  mushroom(ctx, s, c, d, l) {
    roundRect(ctx, -s * 0.09, -s * 0.02, s * 0.18, s * 0.34, 3, l);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.02, s * 0.32, s * 0.26, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = d;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.04, s * 0.29, s * 0.23, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    circle(ctx, -s * 0.12, -s * 0.14, s * 0.05, l);
    circle(ctx, s * 0.1, -s * 0.1, s * 0.04, l);
  },

  candle(ctx, s, c, d, l) {
    roundRect(ctx, -s * 0.1, -s * 0.08, s * 0.2, s * 0.4, 3, c);
    ctx.fillStyle = d;
    ctx.fillRect(-s * 0.1, s * 0.14, s * 0.2, s * 0.04);
    // flame
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);
    ctx.quadraticCurveTo(s * 0.11, -s * 0.18, 0, -s * 0.08);
    ctx.quadraticCurveTo(-s * 0.11, -s * 0.18, 0, -s * 0.38);
    ctx.closePath();
    ctx.fillStyle = '#ff9d3c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.05, -s * 0.18, 0, -s * 0.12);
    ctx.quadraticCurveTo(-s * 0.05, -s * 0.18, 0, -s * 0.3);
    ctx.closePath();
    ctx.fillStyle = l;
    ctx.fill();
    glow(ctx, 0, -s * 0.24, s * 0.4, '#ffd166', 0.5);
  },

  shard(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);
    ctx.lineTo(s * 0.2, s * 0.02);
    ctx.lineTo(s * 0.06, s * 0.36);
    ctx.lineTo(-s * 0.16, s * 0.1);
    ctx.closePath();
    ctx.fillStyle = d;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(s * 0.15, s * 0.0);
    ctx.lineTo(0, s * 0.24);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(s * 0.06, -s * 0.08);
    ctx.lineTo(-s * 0.05, s * 0.02);
    ctx.closePath();
    ctx.fillStyle = l;
    ctx.fill();
  },

  egg(ctx, s, c, d, l) {
    ctx.beginPath();
    ctx.ellipse(0, s * 0.04, s * 0.26, s * 0.34, 0, 0, TAU);
    ctx.fillStyle = d;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, s * 0.05, s * 0.22, s * 0.3, 0, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
    ellipse(ctx, -s * 0.08, -s * 0.08, s * 0.07, s * 0.1, l);
    for (let i = 0; i < 3; i++) {
      circle(ctx, -s * 0.1 + i * s * 0.11, s * 0.16, s * 0.035, l);
    }
  },
};

// ---------------------------------------------------------------- pickups

export const PICKUP_SIZE = 16;

export function paintPickup(ctx, s, kind, frame) {
  const t = frame / 4;
  switch (kind) {
    case 'coin': {
      const w = Math.abs(Math.cos(t * Math.PI));
      ellipse(ctx, 0, 0, s * 0.3 * (0.25 + w * 0.75), s * 0.3, '#8a6a10');
      ellipse(ctx, 0, 0, s * 0.26 * (0.25 + w * 0.75), s * 0.26, '#ffd93d');
      if (w > 0.5) ellipse(ctx, -s * 0.05, -s * 0.05, s * 0.07, s * 0.09, '#fff3b0');
      break;
    }
    case 'key': {
      const bob = Math.sin(t * TAU) * s * 0.05;
      circle(ctx, -s * 0.14, bob, s * 0.14, '#c9a227');
      circle(ctx, -s * 0.14, bob, s * 0.07, '#3a2f10');
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(-s * 0.06, bob - s * 0.05, s * 0.34, s * 0.09);
      ctx.fillRect(s * 0.18, bob + s * 0.02, s * 0.05, s * 0.12);
      ctx.fillRect(s * 0.26, bob + s * 0.02, s * 0.05, s * 0.09);
      break;
    }
    case 'bomb': {
      const bob = Math.sin(t * TAU) * s * 0.04;
      circle(ctx, 0, s * 0.06 + bob, s * 0.3, '#22242e');
      circle(ctx, -s * 0.09, -s * 0.02 + bob, s * 0.08, 'rgba(255,255,255,0.3)');
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.22 + bob);
      ctx.quadraticCurveTo(s * 0.14, -s * 0.36 + bob, s * 0.2, -s * 0.24 + bob);
      ctx.stroke();
      circle(ctx, s * 0.22, -s * 0.24 + bob, s * 0.07, '#ff9d3c');
      break;
    }
    case 'heart':
    case 'halfHeart': {
      const bob = Math.sin(t * TAU) * s * 0.05;
      const half = kind === 'halfHeart';
      ctx.save();
      if (half) {
        ctx.beginPath();
        ctx.rect(-s * 0.5, -s * 0.5, s * 0.5, s);
        ctx.clip();
      }
      const path = (r) => {
        ctx.beginPath();
        ctx.moveTo(0, r * 0.42 + bob);
        ctx.bezierCurveTo(-r * 1.3, -r * 0.3 + bob, -r * 0.5, -r * 1.1 + bob, 0, -r * 0.4 + bob);
        ctx.bezierCurveTo(r * 0.5, -r * 1.1 + bob, r * 1.3, -r * 0.3 + bob, 0, r * 0.42 + bob);
        ctx.closePath();
      };
      path(s * 0.34);
      ctx.fillStyle = '#7a1f2a';
      ctx.fill();
      path(s * 0.29);
      ctx.fillStyle = '#e8455c';
      ctx.fill();
      ellipse(ctx, -s * 0.1, -s * 0.14 + bob, s * 0.07, s * 0.05, '#ffb3c0');
      ctx.restore();
      break;
    }
    case 'soul': {
      const bob = Math.sin(t * TAU) * s * 0.06;
      glow(ctx, 0, bob, s * 0.5, '#8fd6ff', 0.5);
      const path = (r) => {
        ctx.beginPath();
        ctx.moveTo(0, r * 0.42 + bob);
        ctx.bezierCurveTo(-r * 1.3, -r * 0.3 + bob, -r * 0.5, -r * 1.1 + bob, 0, -r * 0.4 + bob);
        ctx.bezierCurveTo(r * 0.5, -r * 1.1 + bob, r * 1.3, -r * 0.3 + bob, 0, r * 0.42 + bob);
        ctx.closePath();
      };
      path(s * 0.3);
      ctx.fillStyle = 'rgba(160,220,255,0.85)';
      ctx.fill();
      break;
    }
    default:
      circle(ctx, 0, 0, s * 0.25, '#ffffff');
  }
}

// ------------------------------------------------------------------ props

export function paintPedestal(ctx, s, pal) {
  ellipse(ctx, 0, s * 0.4, s * 0.42, s * 0.14, 'rgba(0,0,0,0.35)');
  roundRect(ctx, -s * 0.34, s * 0.16, s * 0.68, s * 0.22, 4, shade(pal.wallTop, -0.08));
  roundRect(ctx, -s * 0.22, -s * 0.06, s * 0.44, s * 0.26, 3, pal.wallTop);
  roundRect(ctx, -s * 0.3, -s * 0.14, s * 0.6, s * 0.12, 3, pal.wallHi);
  ctx.fillStyle = rgba(pal.accent1, 0.5);
  ctx.fillRect(-s * 0.26, -s * 0.12, s * 0.52, 2);
}

export function paintStairs(ctx, s, pal) {
  ellipse(ctx, 0, 0, s * 0.5, s * 0.34, '#000000');
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    ctx.fillStyle = mix(pal.wallTop, '#000000', t * 0.75);
    ctx.fillRect(-s * 0.42 + t * s * 0.1, -s * 0.24 + t * s * 0.14, s * 0.84 - t * s * 0.2, s * 0.11);
  }
  ctx.fillStyle = rgba(pal.accent1, 0.55);
  ctx.fillRect(-s * 0.42, -s * 0.27, s * 0.84, 2);
  glow(ctx, 0, s * 0.1, s * 0.6, pal.accent1, 0.25);
}

export function paintChest(ctx, s, pal, open) {
  ellipse(ctx, 0, s * 0.36, s * 0.36, s * 0.12, 'rgba(0,0,0,0.35)');
  roundRect(ctx, -s * 0.32, -s * 0.02, s * 0.64, s * 0.38, 3, '#6a4a20');
  roundRect(ctx, -s * 0.29, s * 0.01, s * 0.58, s * 0.32, 2, '#a8781f');
  if (open) {
    roundRect(ctx, -s * 0.32, -s * 0.36, s * 0.64, s * 0.2, 4, '#6a4a20');
    glow(ctx, 0, 0, s * 0.5, '#ffd93d', 0.5);
  } else {
    roundRect(ctx, -s * 0.32, -s * 0.22, s * 0.64, s * 0.22, 4, '#6a4a20');
    roundRect(ctx, -s * 0.29, -s * 0.19, s * 0.58, s * 0.16, 3, '#c9922f');
  }
  roundRect(ctx, -s * 0.06, -s * 0.06, s * 0.12, s * 0.14, 2, '#ffd93d');
}
