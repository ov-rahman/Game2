/**
 * Fixed-timestep loop.
 *
 * The simulation only ever advances in exact TICK_DT increments, so 60 Hz,
 * 144 Hz, a throttled tab and a hitching laptop all produce identical results.
 * Rendering receives an interpolation factor for smooth motion above 60 Hz.
 *
 * Platform-free: it drives on an injected TimerAdapter.
 */
import { TICK_DT, MAX_STEPS_PER_FRAME } from './constants.js';

export class FixedLoop {
  constructor({ timer, step, render, dt = TICK_DT, maxSteps = MAX_STEPS_PER_FRAME }) {
    this.timer = timer;
    this.stepFn = step;
    this.renderFn = render;
    this.dt = dt;
    this.maxSteps = maxSteps;

    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;

    this.fps = 0;
    this.tps = 0;
    this.frameMs = 0;
    this.stepMs = 0;
    this.renderMs = 0;
    this.totalTicks = 0;
    this._acc = 0;
    this._frames = 0;
    this._ticks = 0;
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

    // A backgrounded tab reports a huge delta; drop it rather than simulating
    // minutes of dungeon in a single frame.
    if (!(elapsed > 0) || elapsed > 0.5) elapsed = this.dt;
    this.accumulator += elapsed;

    const t0 = this.timer.now();
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.stepFn(this.dt);
      this.accumulator -= this.dt;
      steps++;
      this._ticks++;
      this.totalTicks++;
    }
    // Too far behind to catch up: drop the backlog so we degrade to slow motion
    // instead of spiralling.
    if (this.accumulator > this.dt * this.maxSteps) this.accumulator = 0;
    const t1 = this.timer.now();

    this.renderFn(this.accumulator / this.dt, elapsed);
    const t2 = this.timer.now();

    this.stepMs = t1 - t0;
    this.renderMs = t2 - t1;
    this.frameMs = t2 - frameStart;

    this._acc += elapsed;
    this._frames++;
    if (this._acc >= 0.5) {
      this.fps = this._frames / this._acc;
      this.tps = this._ticks / this._acc;
      this._acc = 0;
      this._frames = 0;
      this._ticks = 0;
    }
  }
}
