/**
 * Platform adapter contracts.
 *
 * The simulation core (src/core, src/data) must never touch `window`,
 * `document`, `localStorage`, WebGL, Web Audio or any other host API. It only
 * sees the plain objects described here. To run the game on another host
 * (Tauri, Electron, a test harness) implement this shape and hand it to the
 * shell — nothing above the adapter layer changes.
 *
 * The JSDoc below is the contract; `assertPlatform` fails loudly and early when
 * an adapter is incomplete, rather than letting the game die inside a hot loop.
 */

/**
 * @typedef {Object} InputSnapshot
 * @property {{x:number,z:number}} move   Normalised movement intent, camera-relative.
 * @property {{dx:number,dy:number}} look Mouse/stick look delta for this tick, in radians.
 * @property {Object<string,boolean>} down    Held state per action.
 * @property {Object<string,boolean>} pressed Rising edge per action, valid for one tick.
 * @property {boolean} pointerLocked
 * @property {boolean} gamepad
 */

/**
 * @typedef {Object} InputAdapter
 * @property {() => InputSnapshot} sample
 * @property {() => void} endTick        Clear per-tick edges once consumed.
 * @property {() => void} requestLock    Ask the host to capture the pointer.
 * @property {() => void} releaseLock
 * @property {(v:number) => void} setSensitivity
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} AudioAdapter
 * @property {(name:string, opts?:Object) => void} play  One-shot by id; opts may carry 3D position.
 * @property {(name:string|null) => void} setMusic
 * @property {(v:number) => void} setMasterVolume
 * @property {(pos:{x:number,y:number,z:number}, yaw:number) => void} setListener
 * @property {() => void} resume
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {(key:string) => any} load
 * @property {(key:string, value:any) => boolean} save
 * @property {(key:string) => void} remove
 */

/**
 * @typedef {Object} DisplayAdapter
 * @property {WebGL2RenderingContext} gl
 * @property {() => {width:number,height:number}} size
 * @property {(w:number,h:number,opts?:Object) => {canvas:any, ctx:CanvasRenderingContext2D, width:number, height:number}} createSurface
 * @property {() => boolean} isFullscreen
 * @property {() => void} toggleFullscreen
 * @property {(fn:(w:number,h:number)=>void) => void} onResize
 * @property {() => void} dispose
 */

/**
 * @typedef {Object} TimerAdapter
 * @property {(fn:(nowMs:number)=>void) => void} start
 * @property {() => void} stop
 * @property {() => number} now
 */

const REQUIRED = {
  input: ['sample', 'endTick', 'requestLock'],
  audio: ['play', 'setMusic', 'setMasterVolume', 'resume'],
  storage: ['load', 'save', 'remove'],
  display: ['size', 'createSurface', 'onResize'],
  timer: ['start', 'stop', 'now'],
};

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
  if (!p.display.gl) throw new Error('Platform: display.gl (WebGL2 context) is missing');
  return p;
}

/** Action names the core understands. Adapters map their own keys onto these. */
export const ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'sprint',
  'crouch',
  'fire',
  'altFire',
  'interact',
  'use',
  'reloadTorch',
  'torch',
  'map',
  'pause',
  'confirm',
  'cancel',
  'fullscreen',
  'restart',
  'debug',
];
