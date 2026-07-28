/**
 * Fixed-timestep game loop.
 *
 * The simulation always advances in exact TICK_DT increments no matter what the
 * display does: 60 Hz, 144 Hz, a throttled background tab or a hitching laptop
 * all produce identical simulation results. Rendering receives an interpolation
 * factor so motion stays smooth on high-refresh displays.
 *
 * The loop itself is platform-free — it drives on an injected TimerAdapter.
 */
import { TICK_DT, MAX_STEPS_PER_FRAME } from './constants.js';

export class FixedLoop {
  /**
   * @param {Object} o
   * @param {import('../platform/interfaces.js').TimerAdapter} o.timer
   * @param {(dt:number)=>void} o.step      Advance the simulation exactly one tick.
   * @param {(alpha:number, frameDt:number)=>void} o.render
   * @param {number} [o.dt]                 Seconds per tick.
   * @param {number} [o.maxSteps]           Catch-up ceiling per frame.
   */
  constructor({ timer, step, render, dt = TICK_DT, maxSteps = MAX_STEPS_PER_FRAME }) {
    this.timer = timer;
    this.stepFn = step;
    this.renderFn = render;
    this.dt = dt;
    this.maxSteps = maxSteps;

    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;

    // Diagnostics surfaced by the debug overlay.
    this.fps = 0;
    this.tps = 0;
    this.frameMs = 0;
    this.stepMs = 0;
    this.renderMs = 0;
    this.totalTicks = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._tickCount = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.timer.now();
    this.accumulator = 0;
    this.timer.start(this._frame);
  }

  stop() {
    this.running = false;
    this.timer.stop();
  }

  _frame(now) {
    if (!this.running) return;
    const frameStart = now;
    let elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // A tab that was backgrounded reports a huge delta. Drop it rather than
    // simulating minutes of dungeon in one frame.
    if (!(elapsed > 0) || elapsed > 0.5) elapsed = this.dt;

    this.accumulator += elapsed;

    const t0 = this.timer.now();
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.stepFn(this.dt);
      this.accumulator -= this.dt;
      steps++;
      this._tickCount++;
      this.totalTicks++;
    }
    // Too far behind to catch up: drop the backlog so we degrade to slow motion
    // instead of a death spiral.
    if (this.accumulator > this.dt * this.maxSteps) this.accumulator = 0;
    const t1 = this.timer.now();

    const alpha = this.accumulator / this.dt;
    this.renderFn(alpha, elapsed);
    const t2 = this.timer.now();

    this.stepMs = t1 - t0;
    this.renderMs = t2 - t1;
    this.frameMs = t2 - frameStart;

    this._fpsAccum += elapsed;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this.tps = this._tickCount / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this._tickCount = 0;
    }
  }
}
