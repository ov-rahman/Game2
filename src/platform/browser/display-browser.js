/**
 * Browser display adapter.
 *
 * Owns the canvas element, the integer upscale from the logical resolution to
 * the window, offscreen surface creation for sprite atlases, and fullscreen.
 */
import { VIEW_W, VIEW_H } from '../../core/constants.js';

export function createBrowserDisplay(canvas, opts = {}) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;

  const container = opts.container || canvas.parentElement || document.body;
  let scale = 1;
  const resizeHandlers = [];

  function computeScale() {
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    // Integer scaling keeps the hand-drawn pixels crisp; fall back to a
    // fractional scale only on windows too small for 1x.
    let s = Math.min(availW / VIEW_W, availH / VIEW_H);
    s = s >= 1 ? Math.floor(s) : s;
    return Math.max(s, 0.35);
  }

  function applyScale() {
    scale = computeScale();
    const w = Math.round(VIEW_W * scale);
    const h = Math.round(VIEW_H * scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    for (const fn of resizeHandlers) fn(VIEW_W, VIEW_H, scale);
  }

  window.addEventListener('resize', applyScale);
  applyScale();

  const fsTarget = container === document.body ? document.documentElement : container;

  function onFsChange() {
    applyScale();
  }
  document.addEventListener('fullscreenchange', onFsChange);

  return {
    name: 'browser-display',
    canvas,

    target() {
      return { ctx, width: VIEW_W, height: VIEW_H, scale };
    },

    /** Offscreen surface for baking sprite atlases and cached backgrounds. */
    createSurface(w, h, surfaceOpts = {}) {
      let surface;
      if (typeof OffscreenCanvas !== 'undefined' && opts.allowOffscreen !== false) {
        surface = new OffscreenCanvas(w, h);
      } else {
        surface = document.createElement('canvas');
        surface.width = w;
        surface.height = h;
      }
      // Atlas baking reads pixels back to build sprite outlines; telling the
      // browser up front avoids a per-call de-optimisation warning.
      const sctx = surface.getContext('2d', { willReadFrequently: !!surfaceOpts.readback });
      sctx.imageSmoothingEnabled = false;
      return { canvas: surface, ctx: sctx, width: w, height: h };
    },

    /** Convert a canvas-space point to logical view space. */
    toLogical(p) {
      return { x: p.x, y: p.y };
    },

    isFullscreen() {
      return !!document.fullscreenElement;
    },

    toggleFullscreen() {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      } else if (fsTarget.requestFullscreen) {
        fsTarget.requestFullscreen().catch(() => {});
      }
    },

    onResize(fn) {
      resizeHandlers.push(fn);
      fn(VIEW_W, VIEW_H, scale);
    },

    dispose() {
      window.removeEventListener('resize', applyScale);
      document.removeEventListener('fullscreenchange', onFsChange);
      resizeHandlers.length = 0;
    },
  };
}
