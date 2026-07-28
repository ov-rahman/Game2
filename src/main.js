/**
 * Application shell.
 *
 * The only file that knows about both the platform adapters and the game core.
 * It owns the wiring: input snapshots in, fixed simulation steps, rendering out,
 * and routing core events to audio and persistence.
 *
 * A desktop build (Tauri / Electron) replaces `createBrowserPlatform` with its
 * own adapter bundle and reuses everything below unchanged.
 */
import { createBrowserPlatform } from './platform/browser/platform-browser.js';
import { Game, STATE } from './core/game.js';
import { FixedLoop } from './core/loop.js';
import { Renderer } from './gfx/renderer.js';
import { FLOORS } from './data/floors.js';
import { ENEMIES } from './data/enemies.js';

const SAVE_KEY = 'progress';

export function boot(canvas) {
  const platform = createBrowserPlatform(canvas);
  const game = new Game({ seed: (Math.random() * 0xffffffff) >>> 0 });
  const renderer = new Renderer(platform.display, game);

  // Bake every atlas and creature mesh up front: a second at load, then no
  // hitching when the player takes the stairs mid-run.
  const creatureIds = new Set(Object.values(ENEMIES).map((e) => e.art));
  for (const f of FLOORS) creatureIds.add(f.boss);
  creatureIds.add('lantern');
  creatureIds.add('prismSprite');
  renderer.prewarm(FLOORS, creatureIds);

  const saved = platform.storage.load(SAVE_KEY);
  game.best = saved && saved.best ? saved.best : null;
  if (saved && saved.settings) Object.assign(game.settings, saved.settings);
  platform.input.setSensitivity(game.settings.sensitivity);

  wireAudio(game, platform);

  let audioUnlocked = false;
  function unlock() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    platform.audio.resume();
    platform.audio.setMusic(currentTrack(game));
  }
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  game.events.on('death', () => {
    platform.input.releaseLock();
    saveProgress(platform, game);
  });
  game.events.on('win', () => {
    platform.input.releaseLock();
    saveProgress(platform, game);
  });
  game.events.on('bossDown', () => saveProgress(platform, game));

  const loop = new FixedLoop({
    timer: platform.timer,
    step(dt) {
      const input = platform.input.sample();
      shellInput(game, platform, input);
      game.step(dt, input);
      platform.input.endTick();
      // The audio listener follows the camera so monsters pan correctly.
      const cam = game.dungeon ? game.camera(1) : null;
      if (cam) platform.audio.setListener({ x: cam.x, y: cam.y, z: cam.z }, cam.yaw);
    },
    render(alpha, frameDt) {
      renderer.render(alpha, frameDt);
    },
  });
  game.loopStats = loop;
  loop.start();

  return { game, renderer, platform, loop };
}

function currentTrack(game) {
  if (game.state === STATE.TITLE || game.state === STATE.WIN) return 'title';
  if (!game.floorDef) return 'title';
  if (game.bossActive) return 'boss';
  return game.floorDef.music;
}

function wireAudio(game, platform) {
  game.events.on('sfx', ({ name, opts }) => platform.audio.play(name, opts));
  game.events.on('floorStart', () => {
    platform.audio.setMusic(currentTrack(game));
    platform.audio.setAmbience(game.floorDef.id);
  });
  game.events.on('bossStart', () => platform.audio.setMusic('boss'));
  game.events.on('bossDown', () => platform.audio.setMusic(currentTrack(game)));
  game.events.on('death', () => {
    platform.audio.setMusic(null);
    platform.audio.setAmbience(null);
  });
  game.events.on('win', () => platform.audio.setMusic('title'));
  game.events.on('runStart', () => platform.audio.setMusic(currentTrack(game)));
}

function saveProgress(platform, game) {
  const prev = platform.storage.load(SAVE_KEY) || {};
  const best = prev.best || { floor: 0, kills: 0 };
  const s = game.stats;
  if (s.floorReached > best.floor || (s.floorReached === best.floor && s.kills > best.kills)) {
    prev.best = { floor: s.floorReached, kills: s.kills, time: Math.round(s.time) };
  }
  prev.runs = (prev.runs || 0) + 1;
  prev.settings = game.settings;
  platform.storage.save(SAVE_KEY, prev);
  game.best = prev.best;
}

/**
 * Shell-level controls: things about the *application*, not the run. Kept out of
 * the core so the simulation never has to know a pause screen exists.
 */
function shellInput(game, platform, input) {
  if (input.pressed.fullscreen) platform.display.toggleFullscreen();
  if (input.pressed.debug) game.debug = !game.debug;
  if (input.pressed.interact) game.interactPressed = true;

  switch (game.state) {
    case STATE.TITLE:
      if (input.pressed.confirm || input.pressed.fire || input.pressed.interact) {
        game.startRun();
        platform.audio.resume();
        platform.audio.setMusic(currentTrack(game));
        platform.input.requestLock();
      }
      break;
    case STATE.DEAD:
    case STATE.WIN:
      if (input.pressed.confirm || input.pressed.interact) {
        game.startRun();
        platform.audio.setMusic(currentTrack(game));
        platform.input.requestLock();
      }
      break;
    case STATE.PAUSED:
      if (input.pressed.pause || input.pressed.cancel) {
        game.togglePause();
        platform.input.requestLock();
      }
      if (input.pressed.restart) {
        game.startRun();
        platform.input.requestLock();
      }
      break;
    default:
      if (input.pressed.pause) {
        game.togglePause();
        platform.input.releaseLock();
      }
      if (input.pressed.map) game.showMap = !game.showMap;
      // Clicking back into the window re-captures the mouse.
      if (input.pressed.fire && !input.pointerLocked) platform.input.requestLock();
      break;
  }
}
