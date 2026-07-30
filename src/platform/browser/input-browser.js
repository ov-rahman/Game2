/**
 * Browser input: pointer-lock mouse look, keyboard, gamepad, touch.
 *
 * Everything host-specific about controls lives here. The core only ever sees
 * the neutral snapshot from ../interfaces.js, so a desktop shell can feed it
 * from a different source without touching gameplay code.
 */
import { ACTIONS } from '../interfaces.js';
import { RENDER_W, RENDER_H } from '../../core/constants.js';
import { createTouchUi } from './touchui-browser.js';

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
  12: 'menuUp',
  13: 'menuDown',
  14: 'menuLeft',
  15: 'menuRight',
};

/** Keys that drive a menu as well as the player. */
const MENUMAP = {
  KeyW: 'menuUp',
  ArrowUp: 'menuUp',
  KeyS: 'menuDown',
  ArrowDown: 'menuDown',
  KeyA: 'menuLeft',
  ArrowLeft: 'menuLeft',
  KeyD: 'menuRight',
  ArrowRight: 'menuRight',
};

/** Stick deflection needed to count as one menu step, and to re-arm. */
const STICK_ON = 0.6;
const STICK_OFF = 0.35;

const DEADZONE = 0.22;

/** Left slice of the screen is the movement stick; the rest turns the camera. */
const TOUCH_STICK_ZONE = 0.45;
/** Finger travel, in CSS pixels, that means full deflection. */
const TOUCH_STICK_RADIUS = 54;
const TOUCH_LOOK_SENS = 0.005;

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

  const cursor = { x: 0, y: 0, active: false };
  let stickArmedX = true;
  let stickArmedY = true;

  // Touch. The on-screen buttons are DOM (see touchui-browser.js); the stick and
  // the look drag are read straight off the canvas here.
  let touchUi = null;
  let touchSeen = false;
  const moveTouch = { id: null, ox: 0, oy: 0, x: 0, z: 0 };
  const lookTouch = { id: null, lx: 0, ly: 0 };
  let tapTouch = null;

  const snapshot = {
    move: { x: 0, z: 0 },
    look: { dx: 0, dy: 0 },
    down,
    pressed,
    cursor,
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
    const menu = MENUMAP[e.code];
    if (!action && !menu) return;
    // These would otherwise scroll the page or move focus out of the canvas.
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    // Menu navigation repeats when a key is held; gameplay actions do not.
    if (menu && e.repeat) setAction(menu, false);
    if (e.repeat && !menu) return;
    if (action) setAction(action, true);
    if (menu) setAction(menu, true);
  }

  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) setAction(action, false);
    const menu = MENUMAP[e.code];
    if (menu) setAction(menu, false);
  }

  function onBlur() {
    for (const a of ACTIONS) down[a] = false;
    if (touchUi) {
      touchUi.clearLatched();
      touchUi.hideStick();
    }
    moveTouch.id = null;
    moveTouch.x = 0;
    moveTouch.z = 0;
    lookTouch.id = null;
    tapTouch = null;
  }

  function onMouseMove(e) {
    if (!locked) {
      // Unlocked: the pointer is a menu cursor. Report it in the internal
      // render resolution so the core can hit-test what the HUD drew.
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        cursor.x = ((e.clientX - rect.left) / rect.width) * RENDER_W;
        cursor.y = ((e.clientY - rect.top) / rect.height) * RENDER_H;
        cursor.active = true;
      }
      return;
    }
    cursor.active = false;
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
        return;
      }
      if (e.button === 0) setAction('click', true);
      return;
    }
    if (e.button === 0) setAction('fire', true);
    else if (e.button === 2) setAction('altFire', true);
    e.preventDefault();
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      setAction('fire', false);
      setAction('click', false);
    } else if (e.button === 2) setAction('altFire', false);
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

  /**
   * The overlay only exists once a real finger has shown up, so a desktop
   * browser never grows a set of thumb buttons it has no use for.
   */
  function ensureTouchUi() {
    if (touchUi) return;
    touchSeen = true;
    touchUi = createTouchUi(canvas, { onAction: setAction });
    touchUi.setVisible(wantLock);
  }

  function cursorFromTouch(t, rect) {
    if (rect.width <= 0 || rect.height <= 0) return;
    cursor.x = ((t.clientX - rect.left) / rect.width) * RENDER_W;
    cursor.y = ((t.clientY - rect.top) / rect.height) * RENDER_H;
    cursor.active = true;
  }

  function onTouchStart(e) {
    ensureTouchUi();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      // While a menu is up the canvas is one big button: a tap is a click
      // wherever the HUD drew the row.
      if (!wantLock) {
        cursorFromTouch(t, rect);
        setAction('click', true);
        tapTouch = t.identifier;
        continue;
      }
      cursor.active = false;
      if (moveTouch.id === null && t.clientX - rect.left < rect.width * TOUCH_STICK_ZONE) {
        moveTouch.id = t.identifier;
        moveTouch.ox = t.clientX;
        moveTouch.oy = t.clientY;
        moveTouch.x = 0;
        moveTouch.z = 0;
        touchUi.showStick(t.clientX - rect.left, t.clientY - rect.top);
      } else if (lookTouch.id === null) {
        lookTouch.id = t.identifier;
        lookTouch.lx = t.clientX;
        lookTouch.ly = t.clientY;
      }
    }
    e.preventDefault();
  }

  function onTouchMove(e) {
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (t.identifier === tapTouch) {
        cursorFromTouch(t, rect);
      } else if (t.identifier === moveTouch.id) {
        let dx = (t.clientX - moveTouch.ox) / TOUCH_STICK_RADIUS;
        let dz = (t.clientY - moveTouch.oy) / TOUCH_STICK_RADIUS;
        const len = Math.hypot(dx, dz);
        if (len > 1) {
          dx /= len;
          dz /= len;
        }
        moveTouch.x = dx;
        moveTouch.z = dz;
        touchUi.moveKnob(dx * TOUCH_STICK_RADIUS, dz * TOUCH_STICK_RADIUS);
      } else if (t.identifier === lookTouch.id) {
        lookX += (t.clientX - lookTouch.lx) * TOUCH_LOOK_SENS;
        lookY += (t.clientY - lookTouch.ly) * TOUCH_LOOK_SENS * (invertY ? -1 : 1);
        lookTouch.lx = t.clientX;
        lookTouch.ly = t.clientY;
      }
    }
    e.preventDefault();
  }

  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === tapTouch) {
        tapTouch = null;
        setAction('click', false);
      } else if (t.identifier === moveTouch.id) {
        moveTouch.id = null;
        moveTouch.x = 0;
        moveTouch.z = 0;
        if (touchUi) touchUi.hideStick();
      } else if (t.identifier === lookTouch.id) {
        lookTouch.id = null;
      }
    }
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
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

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
      mx += pad.mx + moveTouch.x;
      mz += pad.mz + moveTouch.z;
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

      // A stick has to return near centre before it can step a menu again,
      // or holding it flings the highlight down the list.
      if (Math.abs(pad.mz) > STICK_ON && stickArmedY) {
        pressed[pad.mz < 0 ? 'menuUp' : 'menuDown'] = true;
        stickArmedY = false;
      } else if (Math.abs(pad.mz) < STICK_OFF) stickArmedY = true;
      if (Math.abs(pad.mx) > STICK_ON && stickArmedX) {
        pressed[pad.mx < 0 ? 'menuLeft' : 'menuRight'] = true;
        stickArmedX = false;
      } else if (Math.abs(pad.mx) < STICK_OFF) stickArmedX = true;

      snapshot.pointerLocked = locked;
      snapshot.gamepad = pad.connected;
      if (locked) cursor.active = false;

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

    /**
     * Tell the adapter whether gameplay wants the pointer captured. On touch
     * this is also what decides who owns the screen: the thumb controls during
     * a run, or the menu underneath them.
     */
    setLockWanted(v) {
      wantLock = !!v;
      if (touchUi) touchUi.setVisible(wantLock);
    },

    /** True once the player has touched the screen at least once. */
    isTouch() {
      return touchSeen;
    },

    lockWanted() {
      return wantLock;
    },

    requestLock() {
      wantLock = true;
      if (touchUi) touchUi.setVisible(true);
      if (locked) return;
      // A finger has nothing to lock, and iPhone Safari has no pointer-lock API
      // at all — calling it there would throw and take the run start with it.
      if (touchSeen || typeof canvas.requestPointerLock !== 'function') return;
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
      if (touchUi) touchUi.setVisible(false);
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
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      if (touchUi) touchUi.dispose();
    },
  };

  return api;
}
