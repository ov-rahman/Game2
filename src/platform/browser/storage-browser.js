/**
 * Browser storage adapter.
 *
 * Wraps localStorage with JSON handling and a memory fallback, so private-mode
 * browsers and file:// contexts that block storage still run the game. A Tauri
 * build swaps this for a file-backed implementation with the same three methods.
 */
const PREFIX = 'deepshade:';

export function createBrowserStorage(prefix = PREFIX) {
  const memory = new Map();
  let backend = null;

  try {
    const probe = `${prefix}__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    backend = window.localStorage;
  } catch {
    backend = null; // Storage disabled — fall back to memory for this session.
  }

  return {
    name: backend ? 'browser-storage' : 'memory-storage',
    persistent: !!backend,

    load(key) {
      const k = prefix + key;
      try {
        const raw = backend ? backend.getItem(k) : memory.get(k);
        if (raw == null) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    save(key, value) {
      const k = prefix + key;
      let raw;
      try {
        raw = JSON.stringify(value);
      } catch {
        return false;
      }
      try {
        if (backend) backend.setItem(k, raw);
        else memory.set(k, raw);
        return true;
      } catch {
        memory.set(k, raw);
        return false;
      }
    },

    remove(key) {
      const k = prefix + key;
      try {
        if (backend) backend.removeItem(k);
      } catch {
        /* ignore */
      }
      memory.delete(k);
    },
  };
}
