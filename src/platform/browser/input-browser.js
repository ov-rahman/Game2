/**
 * Browser input: pointer-lock mouse look, keyboard, gamepad.
 *
 * Everything host-specific about controls lives here. The core only ever sees
 * the neutral snapshot from ../interfaces.js, so a desktop shell can feed it
 * from a different source without touching gameplay code.
 */
import { ACTIONS } from '../interfaces.js';

const KEYMAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyE: 'interact',
  KeyQ: 'use',
  KeyF: 'torch',
  Space: 'fire',
  Tab: 'map',
  KeyM: 'map',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Backspace: 'cancel',
  F11: 'fullscreen',
  KeyR: 'restart',
  Backquote: 'debug',
};

const PADMAP = {
  0: 'confirm',
  1: 'cancel',
  2: 'interact',
  3: 'use',
  4: 'map',
  5: 'torch',
  6: 'crouch',
  7: 'fire',
  9: 'pause',
  10: 'sprint',
};

const DEADZONE = 0.22;

export function createBrowserInput(canvas, opts = {}) {
  const down = Object.create(null);
  const pressed = Object.create(null);
  const padHeld = Object.create(null);
  for (const a of ACTIONS) {
    down[a] = false;
    pressed[a] = false;
  }

  let lookX = 0;
  let lookY = 0;
  let sensitivity = opts.sensitivity || 0.0022;
  let padSensitivity = opts.padSensitivity || 0.045;
  let locked = false;
  let invertY = false;
  // Whether gameplay currently wants the pointer. Clicking the canvas while
  // this is set re-captures it instead of firing the weapon; menus clear it so
  // the cursor stays free.
  let wantLock = false;

  const snapshot = {
    move: { x: 0, z: 0 },
    look: { dx: 0, dy: 0 },
    down,
    pressed,
    pointerLocked: false,
    gamepad: false,
    anyPressed: false,
  };

  function setAction(action, value) {
    if (!action) return;
    if (value && !down[action]) pressed[action] = true;
    down[action] = value;
  }

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    // These would otherwise scroll the page or move focus out of the canvas.
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    setAction(action, true);
  }

  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) setAction(action, false);
  }

  function onBlur() {
    for (const a of ACTIONS) down[a] = false;
  }

  function onMouseMove(e) {
    if (!locked) return;
    lookX += e.movementX * sensitivity;
    lookY += e.movementY * sensitivity * (invertY ? -1 : 1);
  }

  function onMouseDown(e) {
    if (!locked) {
      // The click that brings the player back into the game must not also be
      // a shot: re-capture and swallow it.
      if (wantLock) {
        api.requestLock();
        e.preventDefault();
      }
      return;
    }
    if (e.button === 0) setAction('fire', true);
    else if (e.button === 2) setAction('altFire', true);
    e.preventDefault();
  }

  function onMouseUp(e) {
    if (e.button === 0) setAction('fire', false);
    else if (e.button === 2) setAction('altFire', false);
  }

  function onWheel(e) {
    if (locked) e.preventDefault();
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      // Dropping the lock must not leave movement keys stuck down.
      for (const a of ACTIONS) down[a] = false;
    }
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);

  function pollGamepad() {
    if (!navigator.getGamepads) return { mx: 0, mz: 0, lx: 0, ly: 0, connected: false };
    const pads = navigator.getGamepads();
    let mx = 0;
    let mz = 0;
    let lx = 0;
    let ly = 0;
    let connected = false;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      connected = true;
      for (const [idx, action] of Object.entries(PADMAP)) {
        const b = pad.buttons[idx];
        if (!b) continue;
        const isDown = b.pressed || b.value > 0.4;
        const key = `p${i}b${idx}`;
        if (isDown && !padHeld[key]) pressed[action] = true;
        if (isDown) down[action] = true;
        else if (padHeld[key]) down[action] = false;
        padHeld[key] = isDown;
      }
      const ax = pad.axes[0] || 0;
      const az = pad.axes[1] || 0;
      if (Math.hypot(ax, az) > DEADZONE) {
        mx += ax;
        mz += az;
      }
      const rx = pad.axes[2] || 0;
      const ry = pad.axes[3] || 0;
      if (Math.hypot(rx, ry) > DEADZONE) {
        lx += rx;
        ly += ry;
      }
    }
    return { mx, mz, lx, ly, connected };
  }

  const api = {
    name: 'browser-input',

    sample() {
      const pad = pollGamepad();

      let mx = (down.right ? 1 : 0) - (down.left ? 1 : 0);
      let mz = (down.back ? 1 : 0) - (down.forward ? 1 : 0);
      mx += pad.mx;
      mz += pad.mz;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      snapshot.move.x = mx;
      snapshot.move.z = mz;

      // Right stick contributes to look as a per-tick delta, like the mouse.
      snapshot.look.dx = lookX + pad.lx * padSensitivity;
      snapshot.look.dy = lookY + pad.ly * padSensitivity;
      lookX = 0;
      lookY = 0;

      snapshot.pointerLocked = locked;
      snapshot.gamepad = pad.connected;

      let any = false;
      for (const a of ACTIONS) {
        if (pressed[a]) {
          any = true;
          break;
        }
      }
      snapshot.anyPressed = any;
      return snapshot;
    },

    endTick() {
      for (const a of ACTIONS) pressed[a] = false;
    },

    /** Tell the adapter whether gameplay wants the pointer captured. */
    setLockWanted(v) {
      wantLock = !!v;
    },

    lockWanted() {
      return wantLock;
    },

    requestLock() {
      wantLock = true;
      if (locked) return;
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      // Chrome returns a promise; older engines return undefined.
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try {
            canvas.requestPointerLock();
          } catch {
            /* host refused; the game stays playable with keyboard turning */
          }
        });
      }
    },

    releaseLock() {
      wantLock = false;
      if (document.exitPointerLock) document.exitPointerLock();
    },

    isLocked() {
      return locked;
    },

    setSensitivity(v) {
      sensitivity = Math.max(0.0004, Math.min(0.01, v));
    },

    getSensitivity() {
      return sensitivity;
    },

    setInvertY(v) {
      invertY = !!v;
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };

  return api;
}
