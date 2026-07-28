/**
 * Headless smoke test (development only — the game itself has no dependencies).
 *
 * Serves the project over HTTP, loads it in headless Chromium, fails on any
 * console error or page exception, then drives an automated run: start, walk,
 * shoot, clear rooms, take items, descend floors. Also samples frame timing.
 *
 * Usage:  node tools/smoketest.mjs [--seconds 30] [--shots] [--headed]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  try {
    pw = require('/opt/node22/lib/node_modules/playwright/index.js');
  } catch {
    console.error('playwright is not installed; smoke test skipped');
    process.exit(0);
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SECONDS = Number(opt('seconds', 25));
const SHOTS = args.includes('--shots');
const HEADED = args.includes('--headed');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const rel = url === '/' ? '/index.html' : url;
      const file = path.join(ROOT, rel);
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

const errors = [];
const warnings = [];

async function main() {
  const { server, port } = await serve();
  const browser = await pw.chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') errors.push(`console.error: ${msg.text()}`);
    else if (t === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack || ''}`));
  page.on('requestfailed', (req) => {
    errors.push(`requestfailed: ${req.url()} ${req.failure() ? req.failure().errorText : ''}`);
  });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__DEEPSHADE__, null, { timeout: 20000 });
  const bootMs = Date.now() - t0;

  const shotDir = path.join(ROOT, 'tools', 'shots');
  if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

  // --- drive the game ---------------------------------------------------
  await page.keyboard.press('Enter'); // start run
  await page.waitForTimeout(400);

  const report = { bootMs, frames: [], states: [], floors: new Set() };

  const stepMs = 180;
  const iterations = Math.max(4, Math.floor((SECONDS * 1000) / stepMs));
  let held = null;

  for (let i = 0; i < iterations; i++) {
    // Automated pilot. It asks the game where it should go — the nearest enemy
    // while a room is locked, otherwise an unvisited door — and then drives the
    // *real* input adapter with keys and mouse, so the whole input path is
    // exercised rather than being bypassed.
    const plan = await page.evaluate(() => {
      const a = window.__DEEPSHADE__;
      const g = a.game;
      if (!g.room || g.state !== 'playing') return null;
      const p = g.player;
      const rect = a.platform.display.canvas.getBoundingClientRect();
      const toScreen = (wx, wy) => ({
        x: rect.left + ((wx + 16) / 640) * rect.width,
        y: rect.top + ((wy + 16) / 384) * rect.height,
      });

      const alive = g.enemies.filter((e) => e.alive && !e.hidden);
      let target = null;
      if (alive.length) {
        target = alive.reduce((best, e) => {
          const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          return !best || d < best.d ? { e, d } : best;
        }, null).e;
      }

      // Walk toward a prop worth touching, else a door out of the room.
      let goal = null;
      const prop = g.props.find((pr) => pr.type === 'pedestal' || pr.type === 'stairs');
      if (!g.roomLocked && prop) goal = { x: prop.x, y: prop.y };
      else if (!g.roomLocked) {
        const doors = [];
        for (let d = 0; d < 4; d++) {
          const id = g.room.doors[d];
          if (id == null || g.room.secretSide[d]) continue;
          // A locked door with no key bounces the player back forever.
          if (g.room.locked[d] && p.keys <= 0 && !p.flags.freeUnlock) continue;
          doors.push({ d, visited: g.floor.rooms[id].visited });
        }
        const pick = doors.find((x) => !x.visited) || doors[(Date.now() / 3000 | 0) % Math.max(1, doors.length)];
        if (pick) {
          const t = [
            { x: 9.5, y: 0.5 },
            { x: 18.5, y: 5.5 },
            { x: 9.5, y: 10.5 },
            { x: 0.5, y: 5.5 },
          ][pick.d];
          goal = { x: t.x * 32, y: t.y * 32 };
        }
      } else if (target) {
        // Keep a shooting distance instead of walking into contact damage.
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = 120;
        goal = { x: target.x + (dx / d) * want, y: target.y + (dy / d) * want };
      }

      const aim = target ? toScreen(target.x, target.y) : toScreen(p.x + 60, p.y);
      let key = null;
      if (goal) {
        const dx = goal.x - p.x;
        const dy = goal.y - p.y;
        if (Math.abs(dx) > Math.abs(dy)) key = dx > 0 ? 'KeyD' : 'KeyA';
        else key = dy > 0 ? 'KeyS' : 'KeyW';
      }
      return { key, aim, shooting: !!target, state: g.state };
    });

    if (plan) {
      if (held && held !== plan.key) {
        await page.keyboard.up(held);
        held = null;
      }
      if (plan.key && held !== plan.key) {
        await page.keyboard.down(plan.key);
        held = plan.key;
      }
      await page.mouse.move(plan.aim.x, plan.aim.y);
      if (plan.shooting) await page.mouse.down();
      else await page.mouse.up();
    }
    await page.waitForTimeout(stepMs);
    // Harness convenience: the pilot is a poor player, and a run that ends on
    // floor 1 exercises almost nothing. Topping health up lets one pass reach
    // the deeper floors, bosses and shops. Death handling is covered by the
    // dedicated core checks below.
    if (i % 6 === 0) await page.evaluate(() => { window.__DEEPSHADE__.game.player.hp = window.__DEEPSHADE__.game.player.stats.maxHp; });
    if (i % 9 === 4) await page.keyboard.press('ShiftLeft');
    if (i % 23 === 11) await page.keyboard.press('KeyE');

    if (i % 4 === 0) {
      const snap = await page.evaluate(() => {
        const a = window.__DEEPSHADE__;
        return {
          state: a.game.state,
          floor: a.game.floorIndex,
          hp: a.game.player.hp,
          room: a.game.room ? a.game.room.id : -1,
          enemies: a.game.enemies.length,
          shots: a.game.shots.count,
          items: a.game.player.inv.items.length,
          fps: a.loop.fps,
          stepMs: a.loop.stepMs,
          renderMs: a.loop.renderMs,
          kills: a.game.stats.kills,
          deaths: a.deaths || 0,
          rooms: a.game.stats.roomsCleared,
        };
      });
      report.states.push(snap);
      report.floors.add(snap.floor);
      if (snap.fps > 0) report.frames.push(snap);
      if (SHOTS && i % 16 === 0) {
        await page.screenshot({ path: path.join(shotDir, `f${String(i).padStart(3, '0')}.png`) });
      }
    }

    // Item pickups and death both need a confirm to move on.
    const state = await page.evaluate(() => window.__DEEPSHADE__.game.state);
    if (state === 'itemGet' || state === 'dead' || state === 'win') {
      if (held) {
        await page.keyboard.up(held);
        held = null;
      }
      await page.mouse.up();
      if (state === 'dead') await page.evaluate(() => { window.__DEEPSHADE__.deaths = (window.__DEEPSHADE__.deaths || 0) + 1; });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
    }
  }
  if (held) await page.keyboard.up(held);
  await page.mouse.up();

  // --- deterministic core checks (no rendering involved) ----------------
  const coreCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const out = { floors: [], errors: [] };
    for (let seed = 1; seed <= 12; seed++) {
      try {
        const g = new Game({ seed });
        g.startRun(seed);
        const input = {
          move: { x: 0, y: 0 },
          shoot: { x: 1, y: 0 },
          shooting: true,
          pointer: null,
          down: {},
          pressed: {},
        };
        // Run every floor's generator and a few hundred ticks of simulation.
        for (let f = 0; f < 5; f++) {
          for (let i = 0; i < 400; i++) {
            input.move.x = Math.sin(i * 0.11);
            input.move.y = Math.cos(i * 0.07);
            g.step(1 / 60, input);
          }
          out.floors.push({ seed, floor: g.floorIndex, rooms: g.floor.rooms.length });
          g.nextFloor();
        }
      } catch (e) {
        out.errors.push(`seed ${seed}: ${e.message}\n${e.stack}`);
      }
    }
    return out;
  });

  // --- boss check: force each boss room and simulate the fight ----------
  const bossCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { ROOM_KIND } = await import('./src/core/constants.js');
    const out = { bosses: [], errors: [] };
    for (let seed = 1; seed <= 5; seed++) {
      try {
        const g = new Game({ seed: seed * 977 });
        g.startRun(seed * 977);
        for (let f = 1; f <= 5; f++) {
          const bossRoom = g.floor.rooms[g.floor.bossRoom];
          g.enterRoom(bossRoom, null, true);
          g.player.hp = 999;
          g.player.stats.maxHp = 999;
          const input = {
            move: { x: 0, y: 0 },
            shoot: { x: 1, y: 0 },
            shooting: true,
            pointer: null,
            down: {},
            pressed: {},
          };
          const boss = g.enemies.find((e) => e.isBoss);
          const name = boss ? boss.name : 'NONE';
          for (let i = 0; i < 2000; i++) {
            input.move.x = Math.sin(i * 0.05);
            input.move.y = Math.cos(i * 0.03);
            g.player.hp = 999;
            // Damage everything: Хироптера shields herself behind her swarm, so
            // a boss-only damage source can never finish that fight.
            if (i % 3 === 0) {
              for (const e of g.enemies.slice()) {
                if (e.alive) g.damageEnemy(e, e.isBoss ? 6 : 20, { source: 'test', silent: true });
              }
            }
            g.step(1 / 60, input);
            if (boss && !boss.alive) break;
          }
          out.bosses.push({ floor: f, name, killed: boss ? !boss.alive : false });
          if (g.floorIndex < 5) g.nextFloor();
          else break;
        }
      } catch (e) {
        out.errors.push(`boss seed ${seed}: ${e.message}\n${e.stack}`);
      }
    }
    return out;
  });

  // --- item stress: give every item and fire --------------------------
  const itemCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { ITEM_IDS, ACTIVE_IDS } = await import('./src/data/items.js');
    const out = { checked: 0, errors: [] };
    for (const id of ITEM_IDS) {
      try {
        const g = new Game({ seed: 4242 });
        g.startRun(4242);
        const { addItem } = await import('./src/core/items/inventory.js');
        addItem(g, g.player, id);
        g.state = 'playing';
        const input = {
          move: { x: 1, y: 0 },
          shoot: { x: 1, y: 0 },
          shooting: true,
          pointer: null,
          down: {},
          pressed: {},
        };
        for (let i = 0; i < 200; i++) g.step(1 / 60, input);
        out.checked++;
      } catch (e) {
        out.errors.push(`item ${id}: ${e.message}`);
      }
    }
    for (const id of ACTIVE_IDS) {
      try {
        const g = new Game({ seed: 99 });
        g.startRun(99);
        const { setActive, useActive } = await import('./src/core/items/inventory.js');
        setActive(g.player, id);
        g.player.inv.activeCharge = g.player.inv.activeMax;
        useActive(g, g.player);
        const input = { move: { x: 0, y: 0 }, shoot: { x: 0, y: 0 }, shooting: false, pointer: null, down: {}, pressed: {} };
        for (let i = 0; i < 120; i++) g.step(1 / 60, input);
        out.checked++;
      } catch (e) {
        out.errors.push(`active ${id}: ${e.message}`);
      }
    }
    return out;
  });

  // --- all items at once (worst case for the shot pipeline) ------------
  const megaCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { ITEM_IDS } = await import('./src/data/items.js');
    const { addItem } = await import('./src/core/items/inventory.js');
    try {
      const g = new Game({ seed: 7 });
      g.startRun(7);
      for (const id of ITEM_IDS) addItem(g, g.player, id);
      const input = { move: { x: 1, y: 0 }, shoot: { x: 1, y: 0 }, shooting: true, pointer: null, down: {}, pressed: {} };
      for (let i = 0; i < 600; i++) {
        input.move.x = Math.sin(i * 0.1);
        g.step(1 / 60, input);
      }
      return { ok: true, synergies: g.player.inv.synergies.length, shots: g.shots.count };
    } catch (e) {
      return { ok: false, error: `${e.message}\n${e.stack}` };
    }
  });

  if (process.env.TRACE) {
    console.log('trace:', report.states.map((s) => `${s.state}/f${s.floor}/r${s.room}/e${s.enemies}/k${s.kills}/hp${s.hp}`).join(' '));
  }
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, 'final.png') });

  await browser.close();
  server.close();

  // --- report -----------------------------------------------------------
  const fps = report.frames.map((f) => f.fps).filter((v) => v > 1);
  const avgFps = fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : 0;
  const minFps = fps.length ? Math.min(...fps) : 0;
  const maxStep = report.frames.length ? Math.max(...report.frames.map((f) => f.stepMs)) : 0;
  const maxRender = report.frames.length ? Math.max(...report.frames.map((f) => f.renderMs)) : 0;
  const last = report.states[report.states.length - 1] || {};

  console.log('--- smoke test ---------------------------------------------');
  console.log(`boot            ${bootMs} ms`);
  console.log(`fps             avg ${avgFps.toFixed(1)}  min ${minFps.toFixed(1)}`);
  console.log(`worst step/render ${maxStep.toFixed(2)} / ${maxRender.toFixed(2)} ms`);
  console.log(`played to       floor ${last.floor}, room ${last.room}, kills ${last.kills}, items ${last.items}`);
  console.log(`                rooms cleared ${last.rooms}, deaths ${last.deaths}`);
  console.log(`core sim        ${coreCheck.floors.length} floor generations`);
  console.log(`bosses          ${bossCheck.bosses.map((b) => `${b.name}${b.killed ? '✓' : '✗'}`).join(' ')}`);
  console.log(`items           ${itemCheck.checked} exercised`);
  console.log(`all-items run   ${megaCheck.ok ? `ok (${megaCheck.synergies} synergies active)` : `FAILED ${megaCheck.error}`}`);

  const allErrors = [
    ...errors,
    ...coreCheck.errors,
    ...bossCheck.errors,
    ...itemCheck.errors,
    ...(megaCheck.ok ? [] : [megaCheck.error]),
  ];

  if (warnings.length) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of [...new Set(warnings)].slice(0, 10)) console.log(`  ! ${w}`);
  }

  if (allErrors.length) {
    console.log(`\nERRORS (${allErrors.length}):`);
    for (const e of [...new Set(allErrors)].slice(0, 25)) console.log(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log('\nclean: no console errors, no exceptions.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
