/**
 * Synchronous event bus.
 *
 * The simulation never calls the browser. It emits events ("sfx", "fx",
 * "shake", "floorStart", …) and the shell wires them to platform adapters, so
 * swapping the shell swaps every side effect.
 */
export class EventBus {
  constructor() {
    this.handlers = new Map();
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
    const list = this.handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  clear() {
    this.handlers.clear();
  }
}
