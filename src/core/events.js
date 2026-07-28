/**
 * Minimal synchronous event bus.
 *
 * The simulation core never talks to the browser. Instead it emits events
 * ("sfx", "shake", "particles", "floorChanged", ...) that the shell wires up to
 * the platform adapters. Swapping the shell swaps every side effect.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this.handlers = new Map();
    this.muted = false;
  }

  on(type, fn) {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this.handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    if (this.muted) return;
    const list = this.handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  clear() {
    this.handlers.clear();
  }
}
