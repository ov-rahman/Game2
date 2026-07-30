/**
 * Menus.
 *
 * Pure logic: a stack of screens made of rows, plus the navigation rules. It
 * knows nothing about canvases, keyboards or gamepads — the HUD asks it what to
 * draw, the shell feeds it neutral actions, and anything that has to touch the
 * host (fullscreen, quitting to the title, saving) leaves as a `uiCommand`
 * event. That keeps the pause screen out of the simulation and out of the
 * platform layer at the same time.
 *
 * Row kinds:
 *   action    runs a command
 *   submenu   pushes another screen
 *   toggle    on/off
 *   slider    a number with a range and a step
 *   choice    one of a fixed list
 *   back      pops the stack
 *   note      unselectable text
 */

import { DIFFICULTIES } from '../../data/difficulty.js';

export const ROW_H = 13;

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * The screen catalogue. Each builder returns a fresh screen so the rows can
 * close over the live game object.
 */
function buildScreens(game) {
  const s = game.settings;
  const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d.id, label: d.name }));
  const cmd = (name, payload) => () => game.events.emit('uiCommand', { name, ...payload });
  const changed = () => game.events.emit('settingsChanged', { settings: s });

  const setting = (key, extra) => ({
    get: () => s[key],
    set: (v) => {
      s[key] = v;
      changed();
    },
    ...extra,
  });

  return {
    title: {
      title: 'ГЛУБИНА',
      subtitle: 'спуск на пять этажей',
      rows: [
        { kind: 'action', label: 'НАЧАТЬ СПУСК', run: cmd('newRun') },
        {
          kind: 'choice',
          label: 'сложность',
          options: difficultyOptions,
          ...setting('difficulty'),
        },
        { kind: 'submenu', label: 'НАСТРОЙКИ', screen: 'settings' },
        { kind: 'submenu', label: 'УПРАВЛЕНИЕ', screen: 'controls' },
      ],
    },

    pause: {
      title: 'ПАУЗА',
      rows: [
        { kind: 'action', label: 'ПРОДОЛЖИТЬ', run: cmd('resume') },
        { kind: 'submenu', label: 'НАСТРОЙКИ', screen: 'settings' },
        { kind: 'submenu', label: 'УПРАВЛЕНИЕ', screen: 'controls' },
        { kind: 'submenu', label: 'НАЧАТЬ ЗАНОВО', screen: 'confirmRestart' },
        { kind: 'submenu', label: 'В ГЛАВНОЕ МЕНЮ', screen: 'confirmQuit' },
      ],
    },

    dead: {
      title: 'СИГНАЛ ПОТЕРЯН',
      rows: [
        { kind: 'action', label: 'НОВЫЙ СПУСК', run: cmd('newRun') },
        { kind: 'action', label: 'В ГЛАВНОЕ МЕНЮ', run: cmd('quitToTitle') },
      ],
    },

    win: {
      title: 'ДРАКОН ПОВЕРЖЕН',
      rows: [
        { kind: 'action', label: 'ЕЩЁ РАЗ', run: cmd('newRun') },
        { kind: 'action', label: 'В ГЛАВНОЕ МЕНЮ', run: cmd('quitToTitle') },
      ],
    },

    settings: {
      title: 'НАСТРОЙКИ',
      rows: [
        {
          kind: 'choice',
          label: 'сложность',
          options: difficultyOptions,
          ...setting('difficulty'),
        },
        {
          kind: 'slider',
          label: 'сила фильтра',
          min: 0,
          max: 1,
          step: 0.1,
          format: pct,
          ...setting('filterStrength'),
        },
        {
          kind: 'slider',
          label: 'яркость',
          min: -0.05,
          max: 0.35,
          step: 0.05,
          format: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
          ...setting('brightness'),
        },
        {
          kind: 'toggle',
          label: 'дрожание вершин',
          ...setting('wobble'),
        },
        { kind: 'submenu', label: 'ЗВУК', screen: 'audio' },
        { kind: 'action', label: 'полный экран', run: cmd('toggleFullscreen') },
        { kind: 'action', label: 'сбросить настройки', run: cmd('resetSettings') },
        { kind: 'back', label: 'НАЗАД' },
      ],
    },

    audio: {
      title: 'ЗВУК',
      rows: [
        {
          kind: 'slider', label: 'общая громкость', min: 0, max: 1, step: 0.1, format: pct,
          ...setting('master'),
        },
        {
          kind: 'slider', label: 'музыка', min: 0, max: 1, step: 0.1, format: pct,
          ...setting('music'),
        },
        {
          kind: 'slider', label: 'звуки', min: 0, max: 1, step: 0.1, format: pct,
          ...setting('sfx'),
        },
        { kind: 'back', label: 'НАЗАД' },
      ],
    },

    controls: {
      title: 'УПРАВЛЕНИЕ',
      rows: [
        {
          kind: 'slider',
          label: 'чувствительность мыши',
          min: 0.0006,
          max: 0.006,
          step: 0.0004,
          format: (v) => (v * 1000).toFixed(1),
          ...setting('sensitivity'),
        },
        { kind: 'toggle', label: 'инверсия по Y', ...setting('invertY') },
        { kind: 'note', label: '' },
        { kind: 'note', label: 'WASD — идти        мышь — смотреть' },
        { kind: 'note', label: 'ЛКМ — стрелять     SHIFT — бежать' },
        { kind: 'note', label: 'CTRL — присесть    F — фонарь' },
        { kind: 'note', label: 'E — взять/купить   Q — предмет' },
        { kind: 'note', label: 'TAB — карта        ESC — пауза' },
        { kind: 'note', label: 'R — начать заново  F11 — полный экран' },
        { kind: 'note', label: '' },
        { kind: 'note', label: 'геймпад: стики — ход и обзор, RT — огонь,' },
        { kind: 'note', label: 'A — выбрать, B — назад, X — взять, Y — предмет' },
        { kind: 'note', label: '' },
        { kind: 'note', label: 'телефон: палец слева — ход, справа — обзор,' },
        { kind: 'note', label: 'кнопки по краям, в меню — просто тапни строку' },
        { kind: 'back', label: 'НАЗАД' },
      ],
    },

    confirmRestart: {
      title: 'НАЧАТЬ ЗАНОВО?',
      subtitle: 'текущий спуск будет потерян',
      rows: [
        { kind: 'action', label: 'ДА, ЗАНОВО', run: cmd('newRun') },
        { kind: 'back', label: 'ОТМЕНА' },
      ],
    },

    confirmQuit: {
      title: 'ВЫЙТИ В МЕНЮ?',
      subtitle: 'текущий спуск будет потерян',
      rows: [
        { kind: 'action', label: 'ДА, ВЫЙТИ', run: cmd('quitToTitle') },
        { kind: 'back', label: 'ОТМЕНА' },
      ],
    },
  };
}

const selectable = (row) => row.kind !== 'note';

export class Menu {
  constructor(game) {
    this.game = game;
    this.screens = buildScreens(game);
    this.stack = [];
    this.index = 0;
    /** Row rectangles from the last paint, so clicks can be resolved. */
    this.layout = [];
    this.pointerRow = -1;
  }

  get open() {
    return this.stack.length > 0;
  }

  get screen() {
    return this.stack.length ? this.screens[this.stack[this.stack.length - 1]] : null;
  }

  get rows() {
    const s = this.screen;
    return s ? s.rows : [];
  }

  /**
   * Make `id` the root of the stack. Called every tick from the game state, so
   * it must leave an already-rooted stack alone — otherwise opening a
   * sub-screen is undone on the very next frame.
   */
  show(id) {
    if (!this.screens[id]) return;
    if (this.stack.length && this.stack[0] === id) return;
    this.stack = [id];
    this.index = this.firstSelectable();
    this.clearPointer();
  }

  /**
   * Forget the row rectangles. Changing screen leaves the cursor sitting over
   * geometry that no longer exists, and hovering it would snatch the
   * highlight to whatever now happens to be under the mouse.
   */
  clearPointer() {
    this.layout = [];
    this.pointerRow = -1;
  }

  push(id) {
    if (!this.screens[id]) return;
    this.stack.push(id);
    this.index = this.firstSelectable();
    this.clearPointer();
    this.game.sfx('confirm', { gain: 0.4 });
  }

  back() {
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.index = this.firstSelectable();
    this.clearPointer();
    this.game.sfx('deny', { gain: 0.3 });
    return true;
  }

  closeAll() {
    this.stack.length = 0;
    this.layout.length = 0;
    this.pointerRow = -1;
  }

  firstSelectable() {
    const rows = this.rows;
    for (let i = 0; i < rows.length; i++) if (selectable(rows[i])) return i;
    return 0;
  }

  move(delta) {
    const rows = this.rows;
    if (!rows.length) return;
    let i = this.index;
    for (let n = 0; n < rows.length; n++) {
      i = (i + delta + rows.length) % rows.length;
      if (selectable(rows[i])) break;
    }
    if (i !== this.index) {
      this.index = i;
      this.game.sfx('step', { gain: 0.25 });
    }
  }

  /** Left/right on the highlighted row. */
  adjust(dir) {
    const row = this.rows[this.index];
    if (!row) return;
    if (row.kind === 'slider') {
      const raw = row.get() + dir * row.step;
      // Snap to the step grid so repeated nudges cannot drift off it.
      const steps = Math.round((raw - row.min) / row.step);
      // Snap and round: repeated 0.1 nudges otherwise drift into 0.30000000004
      // and show up in the saved settings file.
      const raw2 = row.min + steps * row.step;
      const v = Math.min(row.max, Math.max(row.min, Math.round(raw2 * 1e6) / 1e6));
      if (v !== row.get()) {
        row.set(v);
        this.game.sfx('step', { gain: 0.3 });
      }
      return;
    }
    if (row.kind === 'toggle') {
      row.set(!row.get());
      this.game.sfx('confirm', { gain: 0.35 });
      return;
    }
    if (row.kind === 'choice') {
      const i = row.options.findIndex((o) => o.value === row.get());
      const n = row.options.length;
      row.set(row.options[(i + dir + n) % n].value);
      this.game.sfx('confirm', { gain: 0.35 });
    }
  }

  activate() {
    const row = this.rows[this.index];
    if (!row) return;
    switch (row.kind) {
      case 'action':
        this.game.sfx('confirm', { gain: 0.6 });
        row.run();
        break;
      case 'submenu':
        this.push(row.screen);
        break;
      case 'back':
        this.back();
        break;
      case 'toggle':
      case 'choice':
        this.adjust(1);
        break;
      case 'slider':
        this.adjust(1);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ pointer

  /** Called by the HUD after painting, so clicks land on what is drawn. */
  setLayout(list) {
    this.layout = list;
  }

  rowAt(x, y) {
    for (const r of this.layout) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
    }
    return -1;
  }

  hover(x, y) {
    const i = this.rowAt(x, y);
    this.pointerRow = i;
    if (i >= 0 && i !== this.index && selectable(this.rows[i])) {
      this.index = i;
      this.game.sfx('step', { gain: 0.2 });
    }
  }

  click(x, y) {
    const i = this.rowAt(x, y);
    if (i < 0 || !selectable(this.rows[i])) return false;
    this.index = i;
    this.activate();
    return true;
  }

  /** Text shown on the right of a row, if any. */
  valueText(row) {
    switch (row.kind) {
      case 'slider':
        return row.format ? row.format(row.get()) : String(row.get());
      case 'toggle':
        return row.get() ? 'вкл' : 'выкл';
      case 'choice': {
        const opt = row.options.find((o) => o.value === row.get());
        return opt ? opt.label : '';
      }
      default:
        return '';
    }
  }

  /** 0..1 fill for slider rows, so the HUD can draw a bar. */
  sliderFill(row) {
    if (row.kind !== 'slider') return -1;
    return (row.get() - row.min) / (row.max - row.min);
  }
}
