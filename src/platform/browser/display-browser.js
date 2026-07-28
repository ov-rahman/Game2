/**
 * Browser display adapter: owns the canvas, the WebGL2 context, offscreen 2D
 * surfaces for procedural texture painting, resizing and fullscreen.
 *
 * A desktop shell swaps this file; the renderer above it is unchanged.
 */
export function createBrowserDisplay(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false, // the look is deliberately aliased; MSAA would fight it
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    desynchronized: true,
  });

  if (!gl) {
    throw new Error('WebGL2 недоступен. Нужен браузер с поддержкой WebGL 2.0.');
  }

  const resizeHandlers = [];
  let width = 0;
  let height = 0;

  // Cap the backbuffer: the scene renders at a low internal resolution anyway,
  // so a 4K backbuffer would only make the final upscale blit expensive.
  const maxPixels = opts.maxPixels || 2_400_000;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(320, Math.floor(window.innerWidth * dpr));
    let h = Math.max(180, Math.floor(window.innerHeight * dpr));
    const pixels = w * h;
    if (pixels > maxPixels) {
      const k = Math.sqrt(maxPixels / pixels);
      w = Math.floor(w * k);
      h = Math.floor(h * k);
    }
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    for (const fn of resizeHandlers) fn(w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  const fsTarget = canvas.parentElement || document.documentElement;
  function onFsChange() {
    resize();
  }
  document.addEventListener('fullscreenchange', onFsChange);

  return {
    name: 'browser-display',
    canvas,
    gl,

    size() {
      return { width, height };
    },

    /** Offscreen 2D surface used to paint procedural textures. */
    createSurface(w, h, surfaceOpts = {}) {
      let surface;
      if (typeof OffscreenCanvas !== 'undefined' && opts.allowOffscreen !== false) {
        surface = new OffscreenCanvas(w, h);
      } else {
        surface = document.createElement('canvas');
        surface.width = w;
        surface.height = h;
      }
      const ctx = surface.getContext('2d', { willReadFrequently: !!surfaceOpts.readback });
      ctx.imageSmoothingEnabled = surfaceOpts.smooth !== false;
      return { canvas: surface, ctx, width: w, height: h };
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
      fn(width, height);
    },

    dispose() {
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', onFsChange);
      resizeHandlers.length = 0;
    },
  };
}
