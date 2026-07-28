/**
 * Browser input adapter: keyboard + mouse + gamepad -> InputSnapshot.
 *
 * Everything DOM-specific about controls lives here. The core only ever sees
 * the neutral snapshot described in ../interfaces.js.
 */
import { ACTIONS } from '../interfaces.js';
import { norm } from '../../core/math.js';

/** Physical key -> action. Multiple keys may map to the same action. */
const KEYMAP = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'aimUp',
  ArrowDown: 'aimDown',
  ArrowLeft: 'aimLeft',
  ArrowRight: 'aimRight',
  Space: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyE: 'bomb',
  KeyQ: 'use',
  KeyF: 'interact',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'map',
  KeyM: 'map',
  Backspace: 'cancel',
  F11: 'fullscreen',
  KeyR: 'restart',
  Backquote: 'debug',
};

/** Gamepad button index -> action (standard mapping). */
const PADMAP = {
  0: 'confirm', // A
  1: 'cancel', // B
  2: 'bomb', // X
  3: 'use', // Y
  4: 'map', // LB
  5: 'dash', // RB
  6: 'dash', // LT
  7: 'fire', // RT
  9: 'pause', // start
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

const DEADZONE = 0.28;

export function createBrowserInput(canvas, opts = {}) {
  const target = opts.keyTarget || window;
  const down = Object.create(null);
  const pressed = Object.create(null);
  const consumed = Object.create(null);
  for (const a of ACTIONS) {
    down[a] = false;
    pressed[a] = false;
  }

  let pointerScreen = null; // {x,y} in CSS pixels relative to canvas
  let pointerWorld = null;
  let pointerActive = false;
  let mapPointer = (p) => p;
  let mouseDown = false;
  let lastPadTimestamps = [];

  const snapshot = {
    move: { x: 0, y: 0 },
    shoot: { x: 0, y: 0 },
    shooting: false,
    pointer: null,
    down,
    pressed,
    anyPressed: false,
  };

  function setAction(action, value) {
    if (!action) return;
    if (value && !down[action]) pressed[action] = true;
    down[action] = value;
  }

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (action) {
      // Tab/Space/arrows would otherwise scroll or move focus.
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      setAction(action, true);
    }
  }

  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) setAction(action, false);
  }

  function onBlur() {
    for (const a of ACTIONS) down[a] = false;
    mouseDown = false;
  }

  function updatePointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerScreen = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
    pointerActive = true;
  }

  function onMouseMove(e) {
    updatePointerFromEvent(e);
  }

  function onMouseDown(e) {
    updatePointerFromEvent(e);
    if (e.button === 0) {
      mouseDown = true;
      setAction('fire', true);
    } else if (e.button === 2) {
      setAction('bomb', true);
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      mouseDown = false;
      setAction('fire', false);
    } else if (e.button === 2) {
      setAction('bomb', false);
    }
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onTouchStart(e) {
    if (!e.touches.length) return;
    updatePointerFromEvent(e.touches[0]);
    mouseDown = true;
    setAction('fire', true);
  }
  function onTouchMove(e) {
    if (!e.touches.length) return;
    updatePointerFromEvent(e.touches[0]);
    e.preventDefault();
  }
  function onTouchEnd() {
    mouseDown = false;
    setAction('fire', false);
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);

  function pollGamepad() {
    if (!navigator.getGamepads) return { ax: 0, ay: 0, mx: 0, my: 0, connected: false };
    const pads = navigator.getGamepads();
    let mx = 0;
    let my = 0;
    let ax = 0;
    let ay = 0;
    let connected = false;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      connected = true;
      // Buttons. Only apply rising edges when the pad state actually changed.
      for (const [idx, action] of Object.entries(PADMAP)) {
        const b = pad.buttons[idx];
        if (!b) continue;
        const isDown = b.pressed || b.value > 0.4;
        const key = `pad${i}_${idx}`;
        if (isDown && !consumed[key]) pressed[action] = true;
        if (isDown) down[action] = true;
        else if (consumed[key]) down[action] = false;
        consumed[key] = isDown;
      }
      const lx = pad.axes[0] || 0;
      const ly = pad.axes[1] || 0;
      const rx = pad.axes[2] || 0;
      const ry = pad.axes[3] || 0;
      if (Math.hypot(lx, ly) > DEADZONE) {
        mx += lx;
        my += ly;
      }
      if (Math.hypot(rx, ry) > DEADZONE) {
        ax += rx;
        ay += ry;
      }
      lastPadTimestamps[i] = pad.timestamp;
    }
    return { ax, ay, mx, my, connected };
  }

  return {
    name: 'browser-input',

    setPointerMapper(fn) {
      mapPointer = fn || ((p) => p);
    },

    sample() {
      const pad = pollGamepad();

      let mx = (down.right ? 1 : 0) - (down.left ? 1 : 0);
      let my = (down.down ? 1 : 0) - (down.up ? 1 : 0);
      mx += pad.mx;
      my += pad.my;
      const move = Math.hypot(mx, my) > 1 ? norm(mx, my) : { x: mx, y: my };
      snapshot.move.x = move.x;
      snapshot.move.y = move.y;

      // Aim priority: right stick > arrow keys > mouse.
      let sx = 0;
      let sy = 0;
      let shooting = false;
      if (Math.hypot(pad.ax, pad.ay) > DEADZONE) {
        const d = norm(pad.ax, pad.ay);
        sx = d.x;
        sy = d.y;
        shooting = true;
      } else {
        const kx = (down.aimRight ? 1 : 0) - (down.aimLeft ? 1 : 0);
        const ky = (down.aimDown ? 1 : 0) - (down.aimUp ? 1 : 0);
        if (kx || ky) {
          const d = norm(kx, ky);
          sx = d.x;
          sy = d.y;
          shooting = true;
        }
      }
      if (down.fire || mouseDown) shooting = true;

      snapshot.shoot.x = sx;
      snapshot.shoot.y = sy;
      snapshot.shooting = shooting;

      if (pointerActive && pointerScreen) {
        pointerWorld = mapPointer(pointerScreen);
        snapshot.pointer = pointerWorld;
      } else {
        snapshot.pointer = null;
      }
      // A digital aim overrides the mouse for this tick.
      snapshot.pointerAiming = !(sx || sy);

      let any = false;
      for (const a of ACTIONS) {
        if (pressed[a]) {
          any = true;
          break;
        }
      }
      snapshot.anyPressed = any;
      snapshot.gamepad = pad.connected;
      return snapshot;
    },

    endTick() {
      for (const a of ACTIONS) pressed[a] = false;
    },

    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    },
  };
}
