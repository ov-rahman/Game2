/**
 * Application shell.
 *
 * The only file that knows about both the platform adapters and the game core.
 * It owns the wiring: input snapshots in, simulation steps, rendering out, and
 * routing core events to audio and persistence.
 *
 * A desktop build (Tauri / Electron) replaces `createBrowserPlatform` with its
 * own adapter bundle and reuses everything below unchanged.
 */
import { createBrowserPlatform } from './platform/browser/platform-browser.js';
import { Game, STATE } from './core/game.js';
import { FixedLoop } from './core/loop.js';
import { Renderer } from './render/renderer.js';
import { VIEW_OX, VIEW_OY, ROOM_KIND } from './core/constants.js';
import { FLOORS } from './data/floors.js';

const SAVE_KEY = 'progress';

export function boot(canvas) {
  const platform = createBrowserPlatform(canvas);
  const game = new Game({ seed: (Math.random() * 0xffffffff) >>> 0 });
  const renderer = new Renderer(platform.display, game);

  // Bake every floor's atlas up front: a few hundred milliseconds once, then no
  // hitching when the player takes the stairs mid-run.
  renderer.prewarm(FLOORS);

  const saved = platform.storage.load(SAVE_KEY);
  renderer.best = saved && saved.best ? saved.best : null;

  // Mouse position -> world position inside the current room.
  platform.input.setPointerMapper((p) => ({
    x: p.x - VIEW_OX - renderer.shakeX,
    y: p.y - VIEW_OY - renderer.shakeY,
  }));

  wireAudio(game, platform);

  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    platform.audio.resume();
    platform.audio.setMusic(game.state === STATE.TITLE ? 'title' : currentTrack(game));
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  game.events.on('death', () => saveProgress(platform, game));
  game.events.on('win', () => saveProgress(platform, game));
  game.events.on('bossDown', () => saveProgress(platform, game));

  const loop = new FixedLoop({
    timer: platform.timer,
    step(dt) {
      const input = platform.input.sample();
      handleShellInput(game, platform, renderer, input);
      game.step(dt, input);
      platform.input.endTick();
    },
    render(alpha, frameDt) {
      renderer.render(alpha, frameDt);
    },
  });
  renderer.loop = loop;

  loop.start();

  return { game, renderer, platform, loop };
}

function currentTrack(game) {
  if (game.state === STATE.TITLE) return 'title';
  if (game.state === STATE.WIN) return 'title';
  if (!game.floor) return 'title';
  if (game.room && game.room.kind === ROOM_KIND.BOSS && !game.room.cleared) return 'boss';
  if (game.room && game.room.kind === ROOM_KIND.SHOP) return 'shop';
  return game.floor.def.music;
}

function wireAudio(game, platform) {
  game.events.on('sfx', ({ name, opts }) => platform.audio.play(name, opts));
  game.events.on('floorStart', () => platform.audio.setMusic(currentTrack(game)));
  game.events.on('roomEnter', () => platform.audio.setMusic(currentTrack(game)));
  game.events.on('bossStart', () => platform.audio.setMusic('boss'));
  game.events.on('bossDown', () => platform.audio.setMusic(currentTrack(game)));
  game.events.on('death', () => platform.audio.setMusic(null));
  game.events.on('win', () => platform.audio.setMusic('title'));
  game.events.on('runStart', () => platform.audio.setMusic(currentTrack(game)));
}

function saveProgress(platform, game) {
  const prev = platform.storage.load(SAVE_KEY) || {};
  const best = prev.best || { floor: 0, kills: 0, time: 0 };
  const s = game.stats;
  if (s.floorReached > best.floor || (s.floorReached === best.floor && s.kills > best.kills)) {
    prev.best = { floor: s.floorReached, kills: s.kills, time: Math.round(s.time) };
  }
  prev.runs = (prev.runs || 0) + 1;
  prev.lastSeed = game.seed;
  platform.storage.save(SAVE_KEY, prev);
}

/**
 * Shell-level controls: things that are about the *application*, not the run.
 * Kept out of the core so the core never has to know a pause screen exists.
 */
function handleShellInput(game, platform, renderer, input) {
  if (input.pressed.fullscreen) platform.display.toggleFullscreen();
  if (input.pressed.map) renderer.mapExpanded = !renderer.mapExpanded;

  switch (game.state) {
    case STATE.TITLE:
      if (input.pressed.confirm || input.pressed.fire) {
        game.startRun();
        platform.audio.resume();
        platform.audio.setMusic(currentTrack(game));
      }
      break;
    case STATE.DEAD:
    case STATE.WIN:
      if (input.pressed.confirm || input.pressed.fire) {
        const saved = platform.storage.load(SAVE_KEY);
        renderer.best = saved && saved.best ? saved.best : null;
        game.startRun();
        platform.audio.setMusic(currentTrack(game));
      }
      break;
    case STATE.PAUSED:
      if (input.pressed.pause || input.pressed.cancel) game.togglePause();
      if (input.pressed.restart) {
        game.startRun();
        platform.audio.setMusic(currentTrack(game));
      }
      break;
    default:
      if (input.pressed.pause) game.togglePause();
      break;
  }
}
