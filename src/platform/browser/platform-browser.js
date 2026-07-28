/**
 * Assembles the browser implementation of the Platform contract.
 *
 * The only file that knows both "we are in a browser" and "this is a game".
 * A Tauri/Electron build supplies its own equivalent and everything above it
 * stays untouched.
 */
import { assertPlatform } from '../interfaces.js';
import { createBrowserInput } from './input-browser.js';
import { createBrowserAudio } from './audio-browser.js';
import { createBrowserStorage } from './storage-browser.js';
import { createBrowserDisplay } from './display-browser.js';
import { createBrowserTimer } from './timer-browser.js';

export function createBrowserPlatform(canvas, opts = {}) {
  const display = createBrowserDisplay(canvas, opts);
  const input = createBrowserInput(canvas, opts);
  const audio = createBrowserAudio(opts.audio);
  const storage = createBrowserStorage();
  const timer = createBrowserTimer();

  const platform = {
    name: 'browser',
    display,
    input,
    audio,
    storage,
    timer,
    caps: {
      canFullscreen: typeof document.documentElement.requestFullscreen === 'function',
      canPointerLock: typeof canvas.requestPointerLock === 'function',
      canQuit: false,
      persistentStorage: storage.persistent,
    },
    dispose() {
      input.dispose();
      display.dispose();
      audio.dispose();
      timer.stop();
    },
  };

  return assertPlatform(platform);
}
