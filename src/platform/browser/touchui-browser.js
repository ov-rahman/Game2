/**
 * On-screen controls for touch devices.
 *
 * Pure DOM: an overlay above the canvas with a floating stick ring and a set of
 * buttons. It knows nothing about the game — it only reports action names from
 * ../interfaces.js, exactly like a key would. The stick itself is driven by
 * input-browser.js (which owns the canvas touch events); this module only draws
 * where the finger is.
 */

/** Buttons, laid out in three clusters. `toggle` buttons latch until pressed again. */
const BUTTONS = [
  { action: 'fire', label: 'ОГОНЬ', cls: 'tc-fire', group: 'act' },
  { action: 'interact', label: 'ВЗЯТЬ', cls: '', group: 'act' },
  { action: 'use', label: 'ПРЕДМЕТ', cls: '', group: 'act' },
  { action: 'torch', label: 'ФАКЕЛ', cls: '', group: 'act' },
  { action: 'sprint', label: 'БЕГ', cls: '', group: 'mod', toggle: true },
  { action: 'crouch', label: 'СЕСТЬ', cls: '', group: 'mod', toggle: true },
  { action: 'map', label: 'КАРТА', cls: '', group: 'sys' },
  { action: 'fullscreen', label: '⛶', cls: '', group: 'sys' },
  { action: 'pause', label: '❚❚', cls: '', group: 'sys' },
];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{onAction:(action:string, down:boolean)=>void}} handlers
 */
export function createTouchUi(canvas, handlers) {
  const host = canvas.parentElement || document.body;

  const root = document.createElement('div');
  root.className = 'touch-ui';
  root.hidden = true;

  const stick = document.createElement('div');
  stick.className = 'tc-stick';
  stick.innerHTML = '<div class="tc-knob"></div>';
  const knob = stick.firstElementChild;
  root.appendChild(stick);

  const groups = {};
  for (const name of ['act', 'mod', 'sys']) {
    const g = document.createElement('div');
    g.className = `tc-group tc-${name}`;
    groups[name] = g;
    root.appendChild(g);
  }

  const latched = Object.create(null);

  for (const def of BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tc-btn ${def.cls}`.trim();
    b.textContent = def.label;
    b.tabIndex = -1;

    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Capture so a finger sliding off the button still delivers the release.
      // It throws for a pointer the host no longer tracks, and losing the press
      // over that would be far worse than losing the capture.
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable; pointerup on the element still fires */
      }
      if (def.toggle) {
        latched[def.action] = !latched[def.action];
        b.classList.toggle('on', latched[def.action]);
        handlers.onAction(def.action, latched[def.action]);
        return;
      }
      b.classList.add('on');
      handlers.onAction(def.action, true);
    });

    const release = (e) => {
      e.preventDefault();
      if (def.toggle) return;
      b.classList.remove('on');
      handlers.onAction(def.action, false);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());

    groups[def.group].appendChild(b);
  }

  host.appendChild(root);

  return {
    /** Hidden while a menu is up: there the whole canvas is a tap target. */
    setVisible(v) {
      root.hidden = !v;
      if (!v) stick.classList.remove('on');
    },

    /** Park the ring under the finger, in canvas-relative CSS pixels. */
    showStick(x, y) {
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
      stick.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
    },

    /** Offset of the knob from the ring centre, in CSS pixels. */
    moveKnob(dx, dy) {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    },

    hideStick() {
      stick.classList.remove('on');
    },

    /** Drop every latched modifier — used when the window loses focus. */
    clearLatched() {
      for (const key of Object.keys(latched)) {
        if (!latched[key]) continue;
        latched[key] = false;
        handlers.onAction(key, false);
      }
      for (const b of root.querySelectorAll('.tc-btn')) b.classList.remove('on');
    },

    dispose() {
      root.remove();
    },
  };
}
