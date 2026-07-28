/**
 * Browser timer adapter: requestAnimationFrame driver + monotonic clock.
 *
 * The adapter only decides *when* frames happen. How much simulation runs per
 * frame is the core's business (see core/loop.js), which is what keeps the sim
 * deterministic and independent of the monitor refresh rate.
 */
export function createBrowserTimer() {
  let handle = 0;
  let running = false;
  let callback = null;

  function frame(now) {
    if (!running) return;
    handle = requestAnimationFrame(frame);
    callback(now);
  }

  return {
    name: 'browser-timer',

    start(fn) {
      callback = fn;
      if (running) return;
      running = true;
      handle = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },

    now() {
      return performance.now();
    },
  };
}
