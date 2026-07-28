/**
 * Platform adapter contracts.
 *
 * The simulation core (everything under src/core and src/data) must never touch
 * `window`, `document`, `localStorage`, `Audio`, `fetch` or any other host API.
 * It only ever sees the plain objects described below. To run the game on a new
 * host (Tauri, Electron, a test harness) implement this shape and hand it to
 * `createGameShell()` — nothing in the core changes.
 *
 * This file is documentation-as-code: the JSDoc typedefs are the contract, and
 * `assertPlatform` gives a loud, early failure if an adapter is incomplete.
 */

/**
 * @typedef {Object} InputSnapshot
 * Immutable-per-tick view of the controls. Produced by the input adapter,
 * consumed by the core.
 * @property {{x:number,y:number}} move       Normalized movement vector.
 * @property {{x:number,y:number}} shoot      Normalized firing direction (zero = not firing).
 * @property {boolean} shooting               True while a fire control is held.
 * @property {{x:number,y:number}|null} pointer Aim position in *world* units, or null when aiming is digital.
 * @property {Object<string,boolean>} down    Held state per action name.
 * @property {Object<string,boolean>} pressed Rising edge per action name, valid for exactly one tick.
 */

/**
 * @typedef {Object} InputAdapter
 * @property {() => InputSnapshot} sample     Build the snapshot for the tick about to run.
 * @property {() => void} endTick             Clear per-tick edges after the core consumed them.
 * @property {(fn:(pos:{x:number,y:number})=>void) => void} setPointerMapper
 *           Installs the screen->world transform used for mouse aim.
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} AudioAdapter
 * @property {(name:string, opts?:Object) => void} play    Fire a one-shot sound by id.
 * @property {(name:string|null) => void} setMusic         Cross-fade to a music track id (null = silence).
 * @property {(v:number) => void} setMasterVolume
 * @property {(v:number) => void} setSfxVolume
 * @property {(v:number) => void} setMusicVolume
 * @property {() => void} resume                           Unlock playback after a user gesture.
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {(key:string) => any} load        Returns parsed data or null.
 * @property {(key:string, value:any) => void} save
 * @property {(key:string) => void} remove
 */

/**
 * @typedef {Object} DisplayAdapter
 * @property {() => {ctx:CanvasRenderingContext2D, width:number, height:number, scale:number}} target
 * @property {(w:number,h:number) => {canvas:any, ctx:CanvasRenderingContext2D}} createSurface
 *           Offscreen drawing surface used to bake sprite atlases.
 * @property {() => boolean} isFullscreen
 * @property {() => void} toggleFullscreen
 * @property {(fn:(w:number,h:number,scale:number)=>void) => void} onResize
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} TimerAdapter
 * @property {(fn:(nowMs:number)=>void) => void} start   Begin the animation loop.
 * @property {() => void} stop
 * @property {() => number} now                          Monotonic milliseconds.
 */

/**
 * @typedef {Object} Platform
 * @property {string} name
 * @property {InputAdapter} input
 * @property {AudioAdapter} audio
 * @property {StorageAdapter} storage
 * @property {DisplayAdapter} display
 * @property {TimerAdapter} timer
 * @property {{ canFullscreen:boolean, canQuit:boolean, hasPointer:boolean }} caps
 * @property {() => void} [quit]
 */

const REQUIRED = {
  input: ['sample', 'endTick', 'setPointerMapper'],
  audio: ['play', 'setMusic', 'setMasterVolume', 'resume'],
  storage: ['load', 'save', 'remove'],
  display: ['target', 'createSurface', 'onResize'],
  timer: ['start', 'stop', 'now'],
};

/**
 * Validate an adapter bundle. Throws with a precise message rather than letting
 * the game die later inside a hot loop.
 * @param {Platform} p
 */
export function assertPlatform(p) {
  if (!p || typeof p !== 'object') throw new Error('Platform: expected an object');
  for (const [group, methods] of Object.entries(REQUIRED)) {
    const obj = p[group];
    if (!obj) throw new Error(`Platform: missing "${group}" adapter`);
    for (const m of methods) {
      if (typeof obj[m] !== 'function') {
        throw new Error(`Platform: ${group}.${m}() is not implemented`);
      }
    }
  }
  return p;
}

/** Action names the core understands. Adapters map their own keys onto these. */
export const ACTIONS = [
  'up',
  'down',
  'left',
  'right',
  'aimUp',
  'aimDown',
  'aimLeft',
  'aimRight',
  'fire',
  'bomb',
  'use',
  'interact',
  'dash',
  'pause',
  'map',
  'confirm',
  'cancel',
  'fullscreen',
  'restart',
  'debug',
];
