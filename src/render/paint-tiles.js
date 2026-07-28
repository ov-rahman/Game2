/**
 * Procedural tile painting, one variant set per floor palette.
 *
 * Tiles are baked once into the floor atlas, so the frame loop only ever blits.
 * Each floor gets four floor variants, four decorated floors, a wall block, a
 * destructible rock, a pit and an animated hazard.
 */
import { TILE } from '../core/constants.js';
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
  noise2,
  TAU,
} from './draw.js';

const S = TILE;

/** Flat base with subtle grain — the visual bed everything else sits on. */
export function paintFloor(ctx, pal, variant, seed) {
  // Variants are deliberately within a few percent of each other: any more and
  // 32px tiles read as a visible patchwork instead of ground.
  const base = shade(pal.floorB, (variant - 1.5) * 0.014);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Two-tone grain: cheap, deterministic, and it kills the "flat plastic" look.
  ctx.fillStyle = rgba(pal.floorEdge, 0.35);
  for (let i = 0; i < 14; i++) {
    const x = noise2(i, seed + variant, 3) * S;
    const y = noise2(seed + variant, i, 5) * S;
    ctx.fillRect(x | 0, y | 0, 2, 1);
  }
  ctx.fillStyle = rgba(pal.floorC, 0.5);
  for (let i = 0; i < 8; i++) {
    const x = noise2(i * 2.3, seed + variant + 9, 7) * S;
    const y = noise2(seed + variant + 3, i * 1.7, 11) * S;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  // Faint seam so the grid is legible for positioning without drawing a grid.
  ctx.fillStyle = rgba(pal.floorEdge, 0.14);
  ctx.fillRect(0, S - 1, S, 1);
  ctx.fillRect(S - 1, 0, 1, S);
}

/** Floor with a themed decoration on top. */
export function paintFloorDeco(ctx, pal, theme, variant, seed) {
  paintFloor(ctx, pal, variant, seed);
  const c = pal.deco[variant % pal.deco.length];
  const cx = S / 2;
  const cy = S / 2;

  switch (theme) {
    case 'grove': {
      // Layered grass tuft: dark blades behind, bright blades in front, so it
      // reads as foliage rather than as line art.
      const blade = (x, base, h, lean, col, w) => {
        ctx.beginPath();
        ctx.moveTo(x - w, base);
        ctx.quadraticCurveTo(x + lean * 0.4, base - h * 0.6, x + lean, base - h);
        ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.5, x + w, base);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      };
      // Blades always stay green; the palette's brighter hues are for petals.
      const leaf = pal.deco[variant % 2 === 0 ? 0 : 1];
      const dark = shade(leaf, -0.14);
      for (let i = 0; i < 7; i++) {
        const x = 3 + i * 4.4 + (variant % 2) * 1.5;
        const base = S - 3 - ((i * 5) % 4);
        blade(x, base, 9 + ((i * 7) % 6), (i % 2 ? 4 : -4), dark, 2);
      }
      for (let i = 0; i < 5; i++) {
        const x = 5 + i * 5.6 + (variant % 2) * 2;
        const base = S - 4 - ((i * 3) % 5);
        blade(x, base, 7 + ((i * 5) % 7), (i % 2 ? -3 : 3), leaf, 1.8);
      }
      if (variant % 2 === 0) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          circle(ctx, cx + Math.cos(a) * 3.4, cy - 5 + Math.sin(a) * 3.4, 2.4, pal.accent3);
        }
        circle(ctx, cx, cy - 5, 1.9, pal.accent1);
      }
      break;
    }
    case 'hollow': {
      // glowing mushrooms and crystal shards
      if (variant % 2 === 0) {
        for (let i = 0; i < 3; i++) {
          const x = 8 + i * 8;
          const y = S - 8 - (i % 2) * 4;
          ctx.fillStyle = shade(c, -0.15);
          ctx.fillRect(x - 1, y - 4, 2, 5);
          ellipse(ctx, x, y - 5, 4, 3, c);
          glow(ctx, x, y - 5, 7, c, 0.35);
        }
      } else {
        polygon(ctx, cx, cy, 6, 6, 0.4, c, 0.7);
        glow(ctx, cx, cy, 10, c, 0.3);
      }
      break;
    }
    case 'forge': {
      // rivets, cracks and a glowing seam
      ctx.strokeStyle = rgba(pal.accent1, 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(3, S - 8 - variant);
      ctx.lineTo(12, S - 14 - variant);
      ctx.lineTo(24, S - 6 - variant);
      ctx.stroke();
      ctx.fillStyle = shade(pal.wallHi, -0.05);
      circle(ctx, 7, 8, 1.8, pal.wallHi);
      circle(ctx, S - 8, 11, 1.8, pal.wallHi);
      if (variant % 2 === 0) glow(ctx, 14, S - 12, 9, pal.accent1, 0.3);
      break;
    }
    case 'lavalake': {
      // cooled crust plates over a hot glow
      glow(ctx, cx, cy, 12, pal.accent1, 0.22);
      ctx.fillStyle = shade(pal.floorA, -0.06);
      polygon(ctx, cx - 4, cy + 2, 9, 6, variant, shade(pal.floorA, -0.05), 0.8);
      ctx.strokeStyle = rgba(pal.accent1, 0.55);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(2, cy + 6);
      ctx.lineTo(cx, cy - 2);
      ctx.lineTo(S - 3, cy + 8);
      ctx.stroke();
      break;
    }
    default: {
      // hoard: gems and coins
      const g1 = pal.deco[variant % pal.deco.length];
      const g2 = pal.deco[(variant + 2) % pal.deco.length];
      star(ctx, cx - 5, cy + 4, 4, 1.8, 4, 0.4, g1);
      circle(ctx, cx + 6, cy + 6, 3, pal.accent3);
      circle(ctx, cx + 6, cy + 6, 1.6, mix(pal.accent3, '#ffffff', 0.6));
      polygon(ctx, cx + 3, cy - 6, 4.5, 6, 0.2, g2, 0.9);
      glow(ctx, cx, cy, 13, g1, 0.22);
    }
  }
}

/** Solid wall block seen from slightly above. */
export function paintWall(ctx, pal, theme, seed) {
  // face
  ctx.fillStyle = pal.wallFace;
  ctx.fillRect(0, 0, S, S);
  // top plate
  ctx.fillStyle = pal.wallTop;
  ctx.fillRect(0, 0, S, S * 0.62);
  // highlight edge
  ctx.fillStyle = rgba(pal.wallHi, 0.7);
  ctx.fillRect(0, 0, S, 2);
  // bottom shadow
  ctx.fillStyle = rgba(pal.wallShadow, 0.85);
  ctx.fillRect(0, S - 5, S, 5);
  // brick seams
  ctx.fillStyle = rgba(pal.wallShadow, 0.5);
  ctx.fillRect(0, Math.floor(S * 0.62), S, 1);
  const off = (seed % 2) * 8;
  ctx.fillRect(off + 10, 0, 1, Math.floor(S * 0.62));
  ctx.fillRect(off + 22, Math.floor(S * 0.62), 1, S);

  // theme flourishes keep walls from reading as one flat mass
  if (theme === 'grove') {
    ctx.fillStyle = rgba(pal.accent2, 0.55);
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, 4 + i * 8, 3 + ((i * 5) % 4), 3.5, 2.2, rgba(pal.accent2, 0.6));
    }
  } else if (theme === 'hollow') {
    glow(ctx, 8 + (seed % 3) * 7, 8, 8, pal.accent1, 0.35);
    circle(ctx, 8 + (seed % 3) * 7, 8, 1.6, pal.accent1);
  } else if (theme === 'forge' || theme === 'lavalake') {
    ctx.fillStyle = rgba(pal.accent1, 0.5);
    ctx.fillRect(3, Math.floor(S * 0.62) + 3, S - 6, 1.5);
  } else {
    for (let i = 0; i < 3; i++) {
      polygon(ctx, 6 + i * 10, 8 + ((i * 7) % 6), 3.4, 6, 0.3, pal.deco[i % pal.deco.length], 0.85);
    }
  }
}

/** Wall body used for blocks that have another wall directly above them. */
export function paintWallFill(ctx, pal, theme, seed) {
  ctx.fillStyle = pal.wallFace;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = rgba(pal.wallShadow, 0.35);
  ctx.fillRect(0, 0, S, 4);
  ctx.fillStyle = rgba(pal.wallShadow, 0.45);
  const off = (seed % 2) * 9;
  ctx.fillRect(off + 6, 0, 1, S);
  ctx.fillRect(0, Math.floor(S * 0.5), S, 1);
  ctx.fillStyle = rgba(pal.wallHi, 0.16);
  ctx.fillRect(2, Math.floor(S * 0.5) + 2, S - 4, 1);
}

/** Destructible block. */
export function paintRock(ctx, pal, theme) {
  ctx.clearRect(0, 0, S, S);
  // Rocks must never share the floor's value or they vanish into it, so the
  // body is derived FROM the floor and darkened by a fixed amount. That keeps
  // the contrast identical on a bright grove and on a dark cave.
  const c = shade(pal.floorB, -0.2);
  ctx.beginPath();
  ctx.moveTo(4, S - 3);
  ctx.lineTo(2, 12);
  ctx.lineTo(10, 4);
  ctx.lineTo(22, 3);
  ctx.lineTo(30, 13);
  ctx.lineTo(28, S - 3);
  ctx.closePath();
  ctx.fillStyle = shade(pal.floorB, -0.42);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -1.5);
  ctx.beginPath();
  ctx.moveTo(6, S - 5);
  ctx.lineTo(4, 13);
  ctx.lineTo(11, 6);
  ctx.lineTo(21, 5);
  ctx.lineTo(28, 14);
  ctx.lineTo(26, S - 5);
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = rgba(mix(pal.wallHi, '#ffffff', 0.35), 0.85);
  ctx.beginPath();
  ctx.moveTo(9, 8);
  ctx.lineTo(19, 7);
  ctx.lineTo(16, 12);
  ctx.closePath();
  ctx.fill();
  // A thin accent crack ties every floor's rocks to its own colour story.
  ctx.strokeStyle = rgba(pal.accent1, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 13);
  ctx.lineTo(16, 19);
  ctx.lineTo(12, 25);
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.wallShadow, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 14);
  ctx.lineTo(23, 22);
  ctx.stroke();
}

/** Bottomless pit; the renderer draws the rim separately. */
export function paintPit(ctx, pal) {
  // Ledge first, then the hole: without a lit rim adjacent pits merge into one
  // shapeless black mass and the player cannot judge the edge.
  ctx.fillStyle = shade(pal.floorB, -0.1);
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2 + 3, 1, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, pal.pitDeep);
  g.addColorStop(0.72, pal.pit);
  g.addColorStop(1, shade(pal.pit, 0.09));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(1, 3);
  ctx.lineTo(S - 1, 3);
  ctx.lineTo(S - 1, S);
  ctx.lineTo(1, S);
  ctx.closePath();
  ctx.fill();
  // Lit lip along the near edge of the ledge.
  ctx.fillStyle = rgba(pal.floorC, 0.9);
  ctx.fillRect(0, 0, S, 3);
  ctx.fillStyle = rgba(pal.pitDeep, 0.85);
  ctx.fillRect(0, 3, S, 3);
}

/** Animated hazard tile (thorns / ooze / embers / lava / prism shards). */
export function paintHazard(ctx, pal, theme, frame, frames) {
  const t = frame / frames;
  ctx.fillStyle = pal.pit;
  ctx.fillRect(0, 0, S, S);

  switch (theme) {
    case 'grove': {
      // Bramble patch: dark bed with pale thorns, unmistakably not walkable.
      paintFloor(ctx, pal, 0, 5);
      ctx.fillStyle = rgba(pal.floorEdge, 0.55);
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = shade(pal.hazard, -0.25);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(2, 6 + i * 10);
        ctx.quadraticCurveTo(S / 2, 2 + i * 11, S - 2, 8 + i * 9);
        ctx.stroke();
      }
      ctx.fillStyle = pal.hazardHi;
      for (let i = 0; i < 6; i++) {
        const x = 3 + i * 5;
        const h = 7 + Math.sin(t * TAU + i) * 2.5;
        const base = S - 3 - ((i * 7) % 8);
        ctx.beginPath();
        ctx.moveTo(x - 2, base);
        ctx.lineTo(x + 1, base - h);
        ctx.lineTo(x + 3, base);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'hollow': {
      // Sunken ooze pool. The floor bed stays visible so hazards read as pools
      // in the ground rather than as pasted-on dark squares.
      paintFloor(ctx, pal, 1, 3);
      ctx.fillStyle = shade(pal.hazard, -0.34);
      ctx.beginPath();
      ctx.ellipse(S / 2, S / 2, S * 0.44, S * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.hazard;
      ctx.beginPath();
      ctx.ellipse(S / 2, S / 2 + 1, S * 0.38, S * 0.33, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = t * TAU + (i / 3) * TAU;
        circle(ctx, S / 2 + Math.cos(a) * 6, S / 2 + Math.sin(a) * 4, 2.4 + (i % 2), rgba(pal.hazardHi, 0.9));
      }
      glow(ctx, S / 2, S / 2, 13, pal.hazardHi, 0.22 + Math.sin(t * TAU) * 0.08);
      break;
    }
    case 'forge': {
      ctx.fillStyle = '#2a1008';
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 6; i++) {
        const x = ((i * 7 + frame * 3) % S);
        const y = ((i * 11 + frame * 5) % S);
        circle(ctx, x, y, 2 + (i % 2), rgba(pal.hazard, 0.85));
      }
      glow(ctx, S / 2, S / 2, 16, pal.hazardHi, 0.3 + Math.sin(t * TAU) * 0.15);
      break;
    }
    case 'lavalake': {
      // Molten surface: dark crust islands drifting on bright lava.
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#ffb347');
      g.addColorStop(0.5, pal.hazard);
      g.addColorStop(1, '#a01f04');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = rgba('#4a1206', 0.75);
      for (let i = 0; i < 3; i++) {
        const x = ((i * 12 + frame * 2) % (S + 12)) - 6;
        const y = 6 + i * 9 + Math.sin(t * TAU + i) * 2;
        ellipse(ctx, x, y, 6, 3.2, rgba('#4a1206', 0.8));
      }
      ctx.fillStyle = rgba(pal.hazardHi, 0.9);
      for (let i = 0; i < 4; i++) {
        const x = ((i * 9 + frame * 4) % S);
        circle(ctx, x, 4 + ((i * 7) % (S - 8)), 1.3, rgba(pal.hazardHi, 0.9));
      }
      break;
    }
    default: {
      // prism: rotating refracted shards
      ctx.fillStyle = '#2a1a4a';
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 5; i++) {
        const a = t * TAU * 0.5 + (i / 5) * TAU;
        polygon(
          ctx,
          S / 2 + Math.cos(a) * 8,
          S / 2 + Math.sin(a) * 6,
          4.5,
          3,
          a,
          pal.deco[i % pal.deco.length],
          1,
        );
      }
      glow(ctx, S / 2, S / 2, 15, pal.accent2, 0.3);
    }
  }
}

/** Door frame, drawn in four rotations by the renderer. */
export function paintDoor(ctx, pal, state) {
  ctx.clearRect(0, 0, S, S * 1.5);
  const h = S * 1.5;
  // frame
  roundRect(ctx, 1, 2, S - 2, h - 4, 4, pal.wallShadow);
  roundRect(ctx, 3, 4, S - 6, h - 8, 3, pal.wallTop);
  if (state === 'open') {
    // dark passage
    const g = ctx.createLinearGradient(0, 4, 0, h);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, rgba(pal.pit, 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(5, 6, S - 10, h - 12);
    ctx.fillStyle = rgba(pal.accent1, 0.5);
    ctx.fillRect(5, 6, S - 10, 2);
  } else if (state === 'locked') {
    ctx.fillStyle = pal.wallFace;
    ctx.fillRect(5, 6, S - 10, h - 12);
    // padlock
    circle(ctx, S / 2, h / 2 - 3, 5, '#ffd93d');
    ctx.fillStyle = '#8a6a10';
    ctx.fillRect(S / 2 - 5, h / 2 - 3, 10, 8);
    ctx.strokeStyle = '#ffd93d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, h / 2 - 5, 3.4, Math.PI, TAU);
    ctx.stroke();
  } else if (state === 'boss') {
    ctx.fillStyle = shade(pal.wallFace, -0.05);
    ctx.fillRect(5, 6, S - 10, h - 12);
    ctx.fillStyle = pal.accent3 || pal.accent1;
    for (let i = 0; i < 3; i++) {
      polygon(ctx, S / 2, 12 + i * 12, 5, 3, Math.PI, pal.accent3 || pal.accent1, 1);
    }
  } else {
    // closed
    ctx.fillStyle = pal.wallFace;
    ctx.fillRect(5, 6, S - 10, h - 12);
    ctx.fillStyle = rgba(pal.wallShadow, 0.6);
    for (let i = 0; i < 4; i++) ctx.fillRect(6, 9 + i * 10, S - 12, 2);
  }
}
