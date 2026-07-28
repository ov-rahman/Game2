/**
 * Browser timer adapter: requestAnimationFrame driver plus a monotonic clock.
 *
 * The adapter decides only *when* frames happen; how much simulation runs per
 * frame is the core's business (core/loop.js), which is what keeps the sim
 * independent of the monitor refresh rate.
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
