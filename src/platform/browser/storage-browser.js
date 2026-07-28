/**
 * Browser storage adapter.
 *
 * localStorage with JSON handling and a memory fallback, so private-mode
 * browsers and blocked file:// contexts still run. A Tauri build swaps this for
 * a file-backed implementation exposing the same three methods.
 */
const PREFIX = 'deepshade3d:';

export function createBrowserStorage(prefix = PREFIX) {
  const memory = new Map();
  let backend = null;

  try {
    const probe = `${prefix}__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    backend = window.localStorage;
  } catch {
    backend = null; // storage disabled — this session keeps saves in memory
  }

  return {
    name: backend ? 'browser-storage' : 'memory-storage',
    persistent: !!backend,

    load(key) {
      const k = prefix + key;
      try {
        const raw = backend ? backend.getItem(k) : memory.get(k);
        return raw == null ? null : JSON.parse(raw);
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
