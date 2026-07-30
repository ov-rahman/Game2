/**
 * Smoke test (development only — the game itself has no dependencies).
 *
 * Two legs:
 *
 *   core     Runs the simulation straight in Node. src/core and src/data have
 *            no browser dependencies, so thousands of floors and hundreds of
 *            complete runs can be played in seconds. This is where the real
 *            assertions live: reachability, determinism, soft-locks, whether
 *            the mechanics the design leans on actually fire, and whether the
 *            difficulty curve is where it is supposed to be.
 *
 *   browser  Loads the game in headless Chromium and fails on any console
 *            error or exception. Drives a run through the real input adapter
 *            and walks the whole menu with keyboard and mouse. This is where
 *            rendering, audio, pointer lock and persistence get exercised.
 *
 * Usage:  node tools/smoketest.mjs [--seconds 25] [--shots] [--headed]
 *                                  [--core-only] [--runs 60] [--quick]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { Game, STATE, DEFAULT_SETTINGS } from '../src/core/game.js';
import { generateDungeon } from '../src/core/world/dungeongen.js';
import { Rng } from '../src/core/rng.js';
import { blocked } from '../src/core/world/collision.js';
import { addItem, setActive, useActive, recomputeStats } from '../src/core/items/inventory.js';
import { createEnemy } from '../src/core/entities/enemy.js';
import { FLOORS } from '../src/data/floors.js';
import { ITEMS, ITEM_IDS, ACTIVE_IDS } from '../src/data/items.js';
import { SYNERGIES } from '../src/data/synergies.js';
import { ENEMIES } from '../src/data/enemies.js';
import { GRID_W, GRID_H, CELL, C } from '../src/core/constants.js';
import { Bot, playRun } from './bot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SECONDS = Number(opt('seconds', 25));
const SHOTS = args.includes('--shots');
const HEADED = args.includes('--headed');
const CORE_ONLY = args.includes('--core-only');
const QUICK = args.includes('--quick');
const RUNS = Number(opt('runs', QUICK ? 20 : 60));
const SEEDS = QUICK ? 20 : 60;

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const check = (ok, msg) => {
  if (!ok) fail(msg);
  return ok;
};

const neutralInput = () => ({
  move: { x: 0, z: 0 },
  look: { dx: 0, dy: 0 },
  down: Object.create(null),
  pressed: Object.create(null),
  cursor: { x: 0, y: 0, active: false },
  pointerLocked: true,
  gamepad: false,
});

// ===========================================================================
//  core leg
// ===========================================================================

const walkable = (c) => c === C.FLOOR || c === C.DOOR || c === C.HAZARD || c === C.STAIRS;

function floodFrom(cells, gx, gy) {
  const seen = new Uint8Array(cells.length);
  const start = gy * GRID_W + gx;
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H || !walkable(cells[start])) return seen;
  seen[start] = 1;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    const cx = cur % GRID_W;
    const cy = (cur / GRID_W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (seen[ni] || !walkable(cells[ni])) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/** Every room and the stairs must be walkable to from where the player spawns. */
function checkWorld() {
  let stranded = 0;
  let repairedCells = 0;
  let floors = 0;
  let noStairsTile = 0;

  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const def of FLOORS) {
      const d = generateDungeon(new Rng(seed * 1000 + def.index), def);
      floors++;
      repairedCells += d.repairs.cells;
      if (d.cells[d.stairs.gy * GRID_W + d.stairs.gx] !== C.STAIRS) noStairsTile++;
      const seen = floodFrom(d.cells, d.rooms[0].cx, d.rooms[0].cy);
      for (const r of d.rooms) if (!seen[r.cy * GRID_W + r.cx]) stranded++;
      if (!seen[d.stairs.gy * GRID_W + d.stairs.gx]) stranded++;
    }
  }

  check(stranded === 0, `${stranded} unreachable rooms or stairs across ${floors} floors`);
  check(noStairsTile === 0, `${noStairsTile} floors have no staircase tile carved into the grid`);
  notes.push(`world           ${floors} floors, ${stranded} stranded, ${repairedCells} cells repaired`);
}

/** The same seed must produce the same dungeon, twice. */
function checkDeterminism() {
  let mismatches = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const a = new Game({ seed });
    const b = new Game({ seed });
    a.startRun(seed);
    b.startRun(seed);
    for (let f = 0; f < FLOORS.length; f++) {
      if (a.dungeon.cells.length !== b.dungeon.cells.length) mismatches++;
      else {
        for (let i = 0; i < a.dungeon.cells.length; i++) {
          if (a.dungeon.cells[i] !== b.dungeon.cells[i]) {
            mismatches++;
            break;
          }
        }
      }
      if (a.enemies.length !== b.enemies.length) mismatches++;
      a.nextFloor();
      b.nextFloor();
    }
  }
  check(mismatches === 0, `${mismatches} seeded generations diverged between two identical runs`);
  notes.push(`determinism     12 seeds x ${FLOORS.length} floors identical`);
}

/**
 * Nothing may end a run by making it unplayable: a body buried in geometry
 * cannot move again, so the run is over without the player dying.
 */
function checkSoftlocks(runs) {
  let embedded = 0;
  let stalls = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const g = new Game({ seed });
    g.startRun(seed);
    const bot = new Bot(g, { standoff: 8, explore: seed % 2 === 0 });
    bot.lastX = g.player.x;
    bot.lastZ = g.player.z;
    for (let i = 0; i < 60 * 400; i++) {
      if (bot.tick(1 / 60) !== STATE.PLAYING) break;
    }
    if (g.state !== STATE.PLAYING) continue;
    stalls++;
    if (blocked(g.dungeon.cells, g.player.x, g.player.z, g.player.radius, {})) embedded++;
  }
  check(embedded === 0, `${embedded} runs ended with the player stuck inside level geometry`);
  notes.push(`soft-locks      ${runs} runs, ${stalls} unfinished, ${embedded} stuck`);
}

/** Every item and every active has to survive being used. */
function checkContent() {
  let checked = 0;
  for (const id of ITEM_IDS) {
    try {
      const g = new Game({ seed: 77 });
      g.startRun(77);
      addItem(g, g.player, id);
      const inp = neutralInput();
      inp.move.x = 1;
      inp.move.z = -1;
      inp.down.fire = true;
      for (let i = 0; i < 200; i++) g.step(1 / 60, inp);
      checked++;
    } catch (e) {
      fail(`item ${id}: ${e.message}`);
    }
  }
  for (const id of ACTIVE_IDS) {
    try {
      const g = new Game({ seed: 99 });
      g.startRun(99);
      setActive(g.player, id);
      g.player.inv.activeCharge = g.player.inv.activeMax;
      useActive(g, g.player);
      const inp = neutralInput();
      inp.down.fire = true;
      for (let i = 0; i < 160; i++) g.step(1 / 60, inp);
      checked++;
    } catch (e) {
      fail(`active ${id}: ${e.message}`);
    }
  }

  // Everything at once, which is where modifier stacking usually breaks.
  let synergies = 0;
  try {
    const g = new Game({ seed: 7 });
    g.startRun(7);
    for (const id of ITEM_IDS) addItem(g, g.player, id);
    const inp = neutralInput();
    inp.move.x = 1;
    inp.move.z = -1;
    inp.look.dx = 0.02;
    inp.down.fire = true;
    for (let i = 0; i < 600; i++) g.step(1 / 60, inp);
    synergies = g.player.inv.synergies.length;
    check(synergies === SYNERGIES.length,
      `all-items run activated ${synergies} of ${SYNERGIES.length} synergies`);
  } catch (e) {
    fail(`all-items run: ${e.message}\n${e.stack}`);
  }
  notes.push(`content         ${checked} items and actives, ${synergies} synergies together`);
}

/**
 * Synergies that grant a standing ability must survive a stat recompute —
 * this is the class of bug where an item works until you take a hit.
 */
function checkSynergyPassives() {
  let broken = 0;
  for (const syn of SYNERGIES) {
    if (!syn.passive) continue;
    const g = new Game({ seed: 5 });
    g.startRun(5);
    for (const id of syn.requires) addItem(g, g.player, id);
    const before = { ...g.player.flags };
    g.player.statsDirty = true;
    recomputeStats(g, g.player);
    for (const k of Object.keys(before)) {
      if (g.player.flags[k] !== before[k]) {
        fail(`synergy ${syn.id}: flag "${k}" is lost when stats are recomputed`);
        broken++;
      }
    }
  }
  notes.push(`synergies       ${SYNERGIES.filter((s) => s.passive).length} passives survive recompute`);
  return broken;
}

/** Mechanics the design leans on, each of which was once silently dead. */
function checkMechanics() {
  // Overheating must be reachable by holding the trigger, and avoidable.
  {
    const g = new Game({ seed: 5 });
    g.startRun(5);
    const inp = neutralInput();
    inp.down.fire = true;
    let firstOverheat = 0;
    let overheatTicks = 0;
    for (let i = 0; i < 60 * 20; i++) {
      g.step(1 / 60, inp);
      if (g.player.overheated) {
        if (!firstOverheat) firstOverheat = i / 60;
        overheatTicks++;
      }
    }
    check(firstOverheat > 1.5 && firstOverheat < 8,
      `sustained fire overheats after ${firstOverheat.toFixed(1)}s (want 1.5–8s)`);
    const downtime = overheatTicks / (60 * 20);
    check(downtime > 0.1 && downtime < 0.5,
      `overheat downtime is ${(downtime * 100).toFixed(0)}% of continuous fire (want 10–50%)`);
    notes.push(`overheat        first at ${firstOverheat.toFixed(1)}s, ${(downtime * 100).toFixed(0)}% downtime`);
  }

  // Noise has to distinguish standing, walking, crouching and sprinting.
  {
    const g = new Game({ seed: 5 });
    g.startRun(5);
    const inp = neutralInput();
    const settle = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60, inp); };
    settle(120);
    const still = g.player.noise;
    inp.move.z = -1;
    settle(120);
    const walk = g.player.noise;
    inp.down.crouch = true;
    settle(120);
    const crouch = g.player.noise;
    inp.down.crouch = false;
    inp.down.sprint = true;
    settle(200);
    const sprint = g.player.noise;
    check(still < crouch && crouch < walk && walk < sprint,
      `noise does not separate gaits: still ${still.toFixed(2)}, crouch ${crouch.toFixed(2)}, `
      + `walk ${walk.toFixed(2)}, sprint ${sprint.toFixed(2)}`);
    notes.push(`stealth         noise ${still.toFixed(2)} / ${crouch.toFixed(2)} / ${walk.toFixed(2)} / ${sprint.toFixed(2)}`);
  }

  // A medkit walked over at full health must still be there afterwards.
  {
    const g = new Game({ seed: 21 });
    g.startRun(21);
    const p = g.player;
    p.hp = p.stats.maxHp;
    const heal = g.dropPickup(p.x + 0.5, p.z, 'heal');
    g.step(1 / 60, neutralInput());
    check(g.props.includes(heal), 'a medkit is consumed at full health instead of being left behind');
    p.hp = 1;
    g.step(1 / 60, neutralInput());
    check(!g.props.includes(heal), 'a medkit is not picked up when the player is hurt');
  }

  // Shots leave at eye height; anything knee-high has to be hittable.
  {
    let missed = [];
    for (const id of ['sporeling', 'creeper', 'lavaSlug', 'batling']) {
      const g = new Game({ seed: 3 });
      g.startRun(3);
      const p = g.player;
      p.yaw = 0;
      const e = createEnemy(id, p.x, p.z + 8, { hpScale: 200 });
      e.behavior = () => {};
      e.speed = 0;
      g.enemies.length = 0;
      g.enemies.push(e);
      let hits = 0;
      const orig = g.damageEnemy.bind(g);
      g.damageEnemy = (en, a, o = {}) => {
        if (o.source === 'shot') hits++;
        return orig(en, a, o);
      };
      const inp = neutralInput();
      inp.down.fire = true;
      for (let i = 0; i < 300; i++) {
        e.x = p.x;
        e.z = p.z + 8;
        p.pitch = Math.atan2((p.y + p.eyeHeight) - (e.y + e.height * 0.5), 8);
        g.step(1 / 60, inp);
      }
      if (hits < 10) missed.push(`${id} (${hits} hits)`);
    }
    check(missed.length === 0, `aimed fire barely connects with: ${missed.join(', ')}`);
  }
}

/** Every boss must be killable, and take a sensible amount of time doing it. */
function checkBosses() {
  const rows = [];
  for (let floor = 1; floor <= FLOORS.length; floor++) {
    // Roughly what a player arrives with: one item from floor one, three more
    // per floor after that.
    const items = 1 + (floor - 1) * 3;
    const times = [];
    let killed = 0;
    let spawned = 0;
    let name = '?';
    const trials = QUICK ? 3 : 9;

    for (let s = 1; s <= trials; s++) {
      const seed = s * 31 + floor;
      const g = new Game({ seed });
      g.startRun(seed);
      while (g.floorIndex < floor) g.nextFloor();
      for (let i = 0; i < items; i++) addItem(g, g.player, ITEM_IDS[(seed * 7 + i * 13) % ITEM_IDS.length]);
      g.player.bonusHp = 2 * (floor - 1);
      g.player.statsDirty = true;
      recomputeStats(g, g.player);

      const boss = g.enemies.find((e) => e.isBoss);
      if (!boss) {
        fail(`floor ${floor}: no boss spawned`);
        continue;
      }
      spawned++;
      name = boss.name;
      g.enemies.length = 0;
      g.enemies.push(boss);
      const w = g.dungeon.rooms[g.dungeon.bossRoom].world();
      g.player.x = w.x + 3;
      g.player.z = w.z + 3;
      g.player.px = g.player.x;
      g.player.pz = g.player.z;
      g.player.hp = g.player.stats.maxHp;

      // The lair is the only objective: an exploring bot wanders off to look
      // at empty rooms and the measurement becomes about pathing, not the boss.
      const bot = new Bot(g, { standoff: 8, explore: false });
      bot.lastX = g.player.x;
      bot.lastZ = g.player.z;
      let t = 0;
      let deepestPhase = 1;
      // Immortal player: this measures whether the boss can be killed at all
      // and how long that takes. Whether it kills you back is a separate axis.
      for (; t < 240; t += 1 / 60) {
        g.player.hp = g.player.stats.maxHp;
        bot.tick(1 / 60);
        deepestPhase = Math.max(deepestPhase, boss.phase);
        if (!boss.alive) break;
      }
      if (!boss.alive) {
        killed++;
        times.push(t);
        if (deepestPhase < 3) {
          fail(`${boss.name} died without ever reaching its last phase (got to ${deepestPhase})`);
        }
      }
    }

    const median = times.length ? times.sort((a, b) => a - b)[times.length >> 1] : 0;
    check(spawned === trials, `floor ${floor}: boss missing on ${trials - spawned} of ${trials} seeds`);
    // A randomised move set against a mediocre bot will not fall every time;
    // what must hold is that the fight is winnable and paced like a fight.
    check(killed * 2 >= trials,
      `floor ${floor} boss (${name}) survived ${trials - killed} of ${trials} immortal-player fights`);
    if (median) {
      check(median > 8 && median < 110,
        `floor ${floor} boss takes ${median.toFixed(0)}s to kill (want 8-110s)`);
    }
    rows.push(`${name} ${killed}/${trials}${median ? ` ${median.toFixed(0)}s` : ''}`);
  }
  notes.push(`bosses          ${rows.join('  ')}`);
}

/** Where the difficulty curve actually sits, measured, not assumed. */
function checkBalance(runs) {
  const rows = [];
  for (let seed = 1; seed <= runs; seed++) {
    rows.push(playRun(new Game({ seed }), seed, {
      seconds: 900,
      standoff: 8,
      explore: seed % 2 === 0,
    }));
  }
  const hist = {};
  for (const r of rows) hist[r.floor] = (hist[r.floor] || 0) + 1;
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const reachedTwo = rows.filter((r) => r.floor >= 2).length / rows.length;
  const bosses = avg('bosses');

  // These are guard rails, not targets: they catch a change that makes the
  // game unwinnable or trivial, without pinning the design to one number.
  check(bosses > 0.15, `the bot kills only ${bosses.toFixed(2)} bosses per run — the game may be unwinnable`);
  check(bosses < 3.5, `the bot kills ${bosses.toFixed(2)} bosses per run — the game may be trivial`);
  check(reachedTwo > 0.1, `only ${(reachedTwo * 100).toFixed(0)}% of runs reach floor 2`);

  notes.push(
    `balance         ${runs} runs: avg floor ${avg('floor').toFixed(2)}, `
    + `${bosses.toFixed(2)} bosses/run, ${avg('kills').toFixed(0)} kills, `
    + `${(avg('seconds') / 60).toFixed(1)} min, reached ${JSON.stringify(hist)}`,
  );
}

/** The menu is core logic, so it can be walked without a browser. */
function checkMenu() {
  const g = new Game({ seed: 4 });
  const cmds = [];
  g.events.on('uiCommand', (e) => cmds.push(e.name));
  g.step(1 / 60, neutralInput());

  check(g.menu.open && g.menu.stack[0] === 'title', 'the title screen does not open a menu');

  // Walk into every screen reachable from the title and the pause menu, and
  // make sure every row can be selected and drawn.
  const visited = new Set();
  const walk = (id, depth) => {
    if (depth > 4 || visited.has(id)) return;
    visited.add(id);
    const screen = g.menu.screens[id];
    check(!!screen, `menu screen "${id}" does not exist`);
    if (!screen) return;
    for (const row of screen.rows) {
      check(typeof row.label === 'string', `a row in "${id}" has no label`);
      if (row.kind === 'slider') {
        check(typeof row.get === 'function' && typeof row.set === 'function',
          `slider "${row.label}" in "${id}" has no getter/setter`);
        check(row.max > row.min && row.step > 0, `slider "${row.label}" has a bad range`);
      }
      if (row.kind === 'action') {
        check(typeof row.run === 'function', `action "${row.label}" in "${id}" does nothing`);
      }
      if (row.kind === 'submenu') walk(row.screen, depth + 1);
    }
  };
  walk('title', 0);
  walk('pause', 0);
  walk('dead', 0);
  walk('win', 0);

  // Sliders must clamp at both ends and land back on their step grid.
  g.menu.closeAll();
  g.menu.show('title');
  g.menu.push('settings');
  g.menu.push('audio');
  for (let i = 0; i < 30; i++) g.menu.adjust(-1);
  check(g.settings.master === 0, `slider does not clamp low (master = ${g.settings.master})`);
  for (let i = 0; i < 30; i++) g.menu.adjust(1);
  check(g.settings.master === 1, `slider does not clamp high (master = ${g.settings.master})`);
  check(Number.isFinite(g.settings.master) && String(g.settings.master).length < 6,
    `slider value drifted off its step grid: ${g.settings.master}`);

  // Sub-screens must survive the per-tick sync from the game state.
  g.menu.closeAll();
  g.menu.show('title');
  g.menu.push('settings');
  g.step(1 / 60, neutralInput());
  check(g.menu.stack.length === 2 && g.menu.screen.title === 'НАСТРОЙКИ',
    'a sub-screen is closed by the state sync on the next tick');

  // Escape backs out one level at a time and never past the root.
  const esc = () => {
    const inp = neutralInput();
    inp.pressed.cancel = true;
    g.step(1 / 60, inp);
  };
  esc();
  check(g.menu.stack.length === 1, 'escape does not close a sub-screen');
  esc();
  check(g.menu.stack.length === 1, 'escape pops past the root of the menu');

  // Reset restores the shipped defaults.
  g.settings.master = 0.1;
  g.settings.wobble = false;
  g.resetSettings();
  check(g.settings.master === DEFAULT_SETTINGS.master && g.settings.wobble === DEFAULT_SETTINGS.wobble,
    'resetting settings does not restore the defaults');

  // Starting and abandoning a run round-trips through the state machine.
  g.startRun(4);
  check(!g.menu.open || g.state === STATE.PLAYING, 'a menu is open during play');
  g.step(1 / 60, neutralInput());
  check(!g.menu.open, 'the menu stays open once a run starts');
  g.togglePause();
  g.step(1 / 60, neutralInput());
  check(g.menu.stack[0] === 'pause', 'pausing does not open the pause menu');
  g.toTitle();
  g.step(1 / 60, neutralInput());
  check(g.state === STATE.TITLE && g.menu.stack[0] === 'title', 'quitting does not return to the title menu');

  notes.push(`menu            ${visited.size} screens walked, sliders clamp, escape unwinds`);
}

/** Data-level sanity: names, pools and references that would fail at runtime. */
function checkData() {
  for (const [id, e] of Object.entries(ENEMIES)) {
    check(!!e.name && !!e.art, `enemy ${id} is missing a name or art id`);
    check(e.hp > 0 && e.radius > 0 && e.height > 0, `enemy ${id} has a degenerate body`);
    if (e.onDeath && e.onDeath.split) {
      check(!!ENEMIES[e.onDeath.split.id], `enemy ${id} splits into unknown "${e.onDeath.split.id}"`);
    }
    if (e.params && e.params.spawn) {
      check(!!ENEMIES[e.params.spawn], `enemy ${id} summons unknown "${e.params.spawn}"`);
    }
  }
  for (const [id, it] of Object.entries(ITEMS)) {
    check(!!it.name && !!it.desc, `item ${id} is missing a name or description`);
    check(Array.isArray(it.pools) && it.pools.length > 0, `item ${id} is in no pool and can never drop`);
  }
  for (const syn of SYNERGIES) {
    for (const r of syn.requires) {
      check(!!ITEMS[r], `synergy ${syn.id} requires unknown item "${r}"`);
    }
    check(typeof syn.apply === 'function' || typeof syn.passive === 'function',
      `synergy ${syn.id} has neither apply() nor passive()`);
  }
  for (const pool of ['treasure', 'shop', 'boss', 'challenge']) {
    const n = ITEM_IDS.filter((id) => ITEMS[id].pools.includes(pool)).length;
    check(n >= 3, `only ${n} items in the "${pool}" pool`);
  }
  notes.push(`data            ${Object.keys(ENEMIES).length} monsters, ${ITEM_IDS.length} items, ${SYNERGIES.length} synergies`);
}

function runCore() {
  const t0 = Date.now();
  checkData();
  checkWorld();
  checkDeterminism();
  checkContent();
  checkSynergyPassives();
  checkMechanics();
  checkMenu();
  checkBosses();
  checkSoftlocks(Math.min(RUNS, 40));
  checkBalance(RUNS);
  notes.push(`core leg        ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ===========================================================================
//  browser leg
// ===========================================================================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? '/index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function runBrowser(pw) {
  const { server, port } = await serve();
  const browser = await pw.chromium.launch({
    headless: !HEADED,
    // Headless CI has no GPU; SwiftShader still exercises the real GL path.
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleErrors = [];
  const warnings = [];
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    else if (t === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}\n${err.stack || ''}`));
  page.on('requestfailed', (req) => {
    consoleErrors.push(`requestfailed: ${req.url()} ${req.failure() ? req.failure().errorText : ''}`);
  });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__DEEPSHADE__, null, { timeout: 30000 });
  const bootMs = Date.now() - t0;

  const shotDir = path.join(ROOT, 'tools', 'shots');
  if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

  await menuWalkthrough(page, SHOTS ? shotDir : null);
  const play = await pilot(page, SHOTS ? shotDir : null);

  if (SHOTS) await page.screenshot({ path: path.join(shotDir, 'final.png') });
  await browser.close();
  server.close();

  for (const e of consoleErrors) fail(e);
  notes.push(`browser         boot ${bootMs} ms, ${play.summary}`);
  return { warnings };
}

/**
 * Walk the whole menu through the real input adapter: keyboard into every
 * screen, a slider dragged with the arrow keys, and a mouse click on a row.
 */
async function menuWalkthrough(page, shotDir) {
  const state = () => page.evaluate(() => {
    const m = window.__DEEPSHADE__.game.menu;
    return {
      state: window.__DEEPSHADE__.game.state,
      stack: [...m.stack],
      label: m.rows[m.index] ? m.rows[m.index].label : null,
    };
  });

  const selectLabel = async (label) => {
    for (let i = 0; i < 26; i++) {
      if ((await state()).label === label) return true;
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    return false;
  };
  const enter = async (label) => {
    if (!await selectLabel(label)) {
      fail(`menu: could not reach the row "${label}"`);
      return false;
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(260);
    return true;
  };

  await page.waitForTimeout(300);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'menu-title.png') });

  if (await enter('НАСТРОЙКИ')) {
    check((await state()).stack.join('>') === 'title>settings', 'menu: settings did not open');
    await selectLabel('сила фильтра');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(220);
    const fs2 = await page.evaluate(() => window.__DEEPSHADE__.game.settings.filterStrength);
    check(fs2 < 1, `menu: the filter slider did not move (still ${fs2})`);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'menu-settings.png') });

    if (await enter('ЗВУК')) {
      check((await state()).stack.join('>') === 'title>settings>audio', 'menu: audio did not open');
      await selectLabel('музыка');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      const vol = await page.evaluate(() => window.__DEEPSHADE__.game.settings.music);
      check(vol < 0.45, `menu: the music slider did not move (still ${vol})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(220);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    check((await state()).stack.join('>') === 'title', 'menu: escape did not unwind to the title');
  }

  if (await enter('УПРАВЛЕНИЕ')) {
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'menu-controls.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
  }

  // Settings have to reach the adapters, not just the settings object.
  const applied = await page.evaluate(() => ({
    sensitivity: window.__DEEPSHADE__.platform.input.getSensitivity(),
    volumes: window.__DEEPSHADE__.platform.audio.getVolumes(),
    settings: { ...window.__DEEPSHADE__.game.settings },
  }));
  check(Math.abs(applied.volumes.music - applied.settings.music) < 0.001,
    `menu: the music setting (${applied.settings.music}) did not reach the audio adapter `
    + `(${applied.volumes.music})`);
  check(Math.abs(applied.sensitivity - applied.settings.sensitivity) < 1e-9,
    'menu: the sensitivity setting did not reach the input adapter');

  // Start a run, pause, open a confirmation, back out, resume.
  await enter('НАЧАТЬ СПУСК');
  await page.waitForTimeout(400);
  check((await state()).state === 'playing', 'menu: starting a run did not begin play');
  check(await page.evaluate(() => window.__DEEPSHADE__.platform.input.isLocked()),
    'menu: the pointer was not captured when the run started');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const paused = await state();
  check(paused.state === 'paused' && paused.stack[0] === 'pause', 'menu: escape did not pause');
  check(!(await page.evaluate(() => window.__DEEPSHADE__.platform.input.isLocked())),
    'menu: the pointer stayed captured while paused');
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'menu-pause.png') });

  await enter('В ГЛАВНОЕ МЕНЮ');
  check((await state()).stack.join('>') === 'pause>confirmQuit', 'menu: quitting did not ask first');
  await enter('ОТМЕНА');
  check((await state()).stack.join('>') === 'pause', 'menu: cancelling did not return to the pause menu');

  // Mouse: hover a row and click it.
  const rowsBox = await page.evaluate(() => {
    const m = window.__DEEPSHADE__.game.menu;
    return m.layout.map((r) => ({ index: r.index, x: r.x + r.w / 2, y: r.y + r.h / 2, label: m.rows[r.index].label }));
  });
  check(rowsBox.length > 0, 'menu: nothing was laid out for the pointer to hit');
  const target = rowsBox.find((r) => r.label === 'УПРАВЛЕНИЕ');
  if (target) {
    const size = await page.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      return { w: c.width, h: c.height, left: c.left, top: c.top };
    });
    await page.mouse.move(size.left + (target.x / 428) * size.w, size.top + (target.y / 240) * size.h);
    await page.waitForTimeout(180);
    check((await state()).label === 'УПРАВЛЕНИЕ', 'menu: hovering a row did not highlight it');
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(280);
    check((await state()).stack.join('>') === 'pause>controls', 'menu: clicking a row did not open it');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check((await state()).state === 'playing', 'menu: escape from the pause root did not resume');
  check(await page.evaluate(() => window.__DEEPSHADE__.platform.input.isLocked()),
    'menu: the pointer was not re-captured on resume');
}

/**
 * Drive a run through the real input path. The head-less bot does the
 * thinking; the keys and the mouse are genuine, so the adapter, pointer lock
 * and the renderer are all in the loop.
 */
async function pilot(page, shotDir) {
  // The same bot the core leg uses, loaded into the page. It only decides what
  // to do; the keys and the mouse below are real, so the input adapter,
  // pointer lock and the renderer stay in the loop.
  await page.addScriptTag({ type: 'module', content: `
    import { Bot } from '/tools/bot.mjs';
    const app = window.__DEEPSHADE__;
    const bot = new Bot(app.game, { standoff: 8, explore: false });
    bot.lastX = app.game.player.x;
    bot.lastZ = app.game.player.z;
    window.__PILOT__ = bot;
  ` });
  try {
    await page.waitForFunction(() => !!window.__PILOT__, null, { timeout: 10000 });
  } catch {
    fail('browser: the pilot module failed to load');
    return { summary: 'pilot did not start' };
  }

  const stepMs = 130;
  const iterations = Math.max(6, Math.floor((SECONDS * 1000) / stepMs));
  const samples = [];
  let held = new Set();

  for (let i = 0; i < iterations; i++) {
    // Ask the bot what it wants, without letting it touch the simulation.
    const plan = await page.evaluate(() => {
      const app = window.__DEEPSHADE__;
      const g = app.game;
      const bot = window.__PILOT__;
      if (!g.dungeon || g.state !== 'playing') return null;
      bot.input.pressed = Object.create(null);
      bot.input.down.fire = false;
      bot.input.move.x = 0;
      bot.input.move.z = 0;
      bot.input.look.dx = 0;
      bot.input.look.dy = 0;
      bot.plan(0.13);
      bot.steer(0.13);
      bot.aimAndShoot(0.13);
      const keys = [];
      if (bot.input.move.z < -0.35) keys.push('KeyW');
      if (bot.input.move.z > 0.35) keys.push('KeyS');
      if (bot.input.move.x > 0.35) keys.push('KeyD');
      if (bot.input.move.x < -0.35) keys.push('KeyA');
      return {
        keys,
        fire: !!bot.input.down.fire,
        interact: !!(g.prompt && g.prompt.startsWith('E')),
        use: g.player.inv.activeMax > 0 && g.player.inv.activeCharge >= g.player.inv.activeMax,
        dx: bot.input.look.dx,
        dy: bot.input.look.dy,
      };
    });

    if (plan) {
      const want = new Set(plan.keys);
      for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
      for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
      held = want;

      // Turning is applied directly. Headless Chromium does not synthesise
      // movementX/movementY for a locked pointer — the value is derived from
      // real screen-coordinate deltas, which a dispatched event does not have
      // — so a mouse-driven look would silently do nothing here. Keys, clicks
      // and everything downstream of the snapshot are still the real path.
      if (plan.dx || plan.dy) {
        await page.evaluate(({ dx, dy }) => {
          const p = window.__DEEPSHADE__.game.player;
          p.yaw -= dx;
          p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + dy));
        }, { dx: plan.dx, dy: plan.dy });
      }
      if (plan.fire) await page.mouse.down();
      else await page.mouse.up();
      if (plan.interact) await page.keyboard.press('KeyE');
      if (plan.use) await page.keyboard.press('KeyQ');
    }

    await page.waitForTimeout(stepMs);

    if (i % 4 === 0) {
      samples.push(await page.evaluate(() => {
        const a = window.__DEEPSHADE__;
        return {
          state: a.game.state,
          floor: a.game.floorIndex,
          kills: a.game.stats.kills,
          items: a.game.stats.itemsTaken,
          enemies: a.game.enemies.length,
          shots: a.game.shots.count,
          fps: a.loop.fps,
          stepMs: a.loop.stepMs,
          renderMs: a.loop.renderMs,
        };
      }));
      if (shotDir && i % 12 === 0) {
        await page.screenshot({ path: path.join(shotDir, `play-${String(i).padStart(3, '0')}.png`) });
      }
    }

    const st = await page.evaluate(() => window.__DEEPSHADE__.game.state);
    if (st === 'dead' || st === 'win') {
      for (const k of held) await page.keyboard.up(k);
      held = new Set();
      await page.mouse.up();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
  }
  for (const k of held) await page.keyboard.up(k);
  await page.mouse.up();

  const frames = samples.filter((s) => s.fps > 1);
  const avgFps = frames.length ? frames.reduce((a, s) => a + s.fps, 0) / frames.length : 0;
  const maxStep = frames.length ? Math.max(...frames.map((s) => s.stepMs)) : 0;
  const maxRender = frames.length ? Math.max(...frames.map((s) => s.renderMs)) : 0;
  const last = samples[samples.length - 1] || {};
  const maxFloor = Math.max(...samples.map((s) => s.floor || 0), 0);

  check(samples.length > 0, 'the browser pilot never got into a playable state');
  check(maxStep < 12, `a simulation step took ${maxStep.toFixed(1)} ms in the browser`);

  return {
    summary: `played to floor ${maxFloor}, ${last.kills || 0} kills, `
      + `${avgFps.toFixed(0)} fps software (step ${maxStep.toFixed(2)} ms, draw ${maxRender.toFixed(2)} ms)`,
  };
}

// ===========================================================================

async function main() {
  runCore();

  let warnings = [];
  if (!CORE_ONLY) {
    const require = createRequire(import.meta.url);
    let pw = null;
    try {
      pw = require('playwright');
    } catch {
      try {
        pw = require('/opt/node22/lib/node_modules/playwright/index.js');
      } catch {
        notes.push('browser         skipped — playwright is not installed');
      }
    }
    if (pw) ({ warnings } = await runBrowser(pw));
  }

  console.log('--- smoke test ---------------------------------------------');
  for (const n of notes) console.log(n);

  if (warnings.length) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of [...new Set(warnings)].slice(0, 8)) console.log(`  ! ${w}`);
  }

  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    for (const f of [...new Set(failures)].slice(0, 30)) console.log(`  ✗ ${f}`);
    process.exit(1);
  }

  console.log('\nclean: no console errors, no exceptions, all checks passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
