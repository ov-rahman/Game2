/**
 * Headless smoke test (development only — the game itself has no dependencies).
 *
 * Serves the project over HTTP, loads it in headless Chromium, fails on any
 * console error or page exception, then drives an automated run through the real
 * input adapter. Also exercises the simulation head-less: every floor generates,
 * every item is equipped and fired, every boss is fought to a kill.
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

const errors = [];
const warnings = [];

async function main() {
  const { server, port } = await serve();
  const browser = await pw.chromium.launch({
    headless: !HEADED,
    // Headless CI has no GPU; SwiftShader still exercises the real GL path.
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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
  await page.waitForFunction(() => !!window.__DEEPSHADE__, null, { timeout: 30000 });
  const bootMs = Date.now() - t0;

  const shotDir = path.join(ROOT, 'tools', 'shots');
  if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

  // --- drive the real input path ----------------------------------------
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  const report = { frames: [], states: [] };
  const stepMs = 160;
  const iterations = Math.max(4, Math.floor((SECONDS * 1000) / stepMs));
  let held = null;

  for (let i = 0; i < iterations; i++) {
    // The pilot asks the game where it should go, then drives keyboard and
    // mouse so the whole input path is exercised rather than bypassed.
    const plan = await page.evaluate(() => {
      const a = window.__DEEPSHADE__;
      const g = a.game;
      if (!g.dungeon || g.state !== 'playing') return null;
      const p = g.player;

      const alive = g.enemies.filter((e) => e.alive && !e.hidden && !e.dormant);
      let target = null;
      let bestD = 900;
      for (const e of alive) {
        const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          target = e;
        }
      }

      // Head for the stairs once they open, otherwise the nearest prop, else
      // just explore by walking the navigation field backwards.
      let goal = null;
      if (g.dungeon.stairs.active) goal = { x: g.dungeon.stairs.x, z: g.dungeon.stairs.z };
      else {
        let best = null;
        let bd = 1e9;
        for (const pr of g.props) {
          const d = (pr.x - p.x) ** 2 + (pr.z - p.z) ** 2;
          if (d < bd) {
            bd = d;
            best = pr;
          }
        }
        if (best) goal = { x: best.x, z: best.z };
        else {
          const room = g.dungeon.rooms.find((r) => !r.seen) || g.dungeon.rooms[g.dungeon.bossRoom];
          const w = room.world();
          goal = { x: w.x, z: w.z };
        }
      }

      const aimAt = target || goal;
      const wantYaw = Math.atan2(aimAt.x - p.x, aimAt.z - p.z);
      let dyaw = wantYaw - p.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;

      const moveYaw = Math.atan2(goal.x - p.x, goal.z - p.z);
      let dmove = moveYaw - p.yaw;
      while (dmove > Math.PI) dmove -= Math.PI * 2;
      while (dmove < -Math.PI) dmove += Math.PI * 2;
      const key = Math.abs(dmove) < 1.2 ? 'KeyW' : Math.abs(dmove) > 2.2 ? 'KeyS' : dmove > 0 ? 'KeyD' : 'KeyA';

      return { dyaw, key, shooting: !!target && bestD < 400, interact: !!g.prompt };
    });

    if (plan) {
      // Turn by feeding the look delta the way a mouse would.
      await page.evaluate((d) => {
        window.__DEEPSHADE__.game.player.yaw += Math.max(-0.25, Math.min(0.25, d));
      }, plan.dyaw);

      if (held && held !== plan.key) {
        await page.keyboard.up(held);
        held = null;
      }
      if (plan.key && held !== plan.key) {
        await page.keyboard.down(plan.key);
        held = plan.key;
      }
      if (plan.shooting) await page.mouse.down();
      else await page.mouse.up();
      if (plan.interact) await page.keyboard.press('KeyE');
    }

    await page.waitForTimeout(stepMs);

    // Harness convenience: the pilot is a poor player and a run that ends on
    // floor 1 exercises almost nothing. Death handling is covered separately.
    if (i % 5 === 0) {
      await page.evaluate(() => {
        const g = window.__DEEPSHADE__.game;
        g.player.hp = g.player.stats.maxHp;
        g.torch.charge = 1;
      });
    }

    if (i % 4 === 0) {
      const snap = await page.evaluate(() => {
        const a = window.__DEEPSHADE__;
        return {
          state: a.game.state,
          floor: a.game.floorIndex,
          hp: a.game.player.hp,
          enemies: a.game.enemies.length,
          shots: a.game.shots.count,
          items: a.game.player.inv.items.length,
          kills: a.game.stats.kills,
          fps: a.loop.fps,
          stepMs: a.loop.stepMs,
          renderMs: a.loop.renderMs,
        };
      });
      report.states.push(snap);
      if (snap.fps > 0) report.frames.push(snap);
      if (SHOTS && i % 12 === 0) {
        await page.screenshot({ path: path.join(shotDir, `f${String(i).padStart(3, '0')}.png`) });
      }
    }

    const state = await page.evaluate(() => window.__DEEPSHADE__.game.state);
    if (state === 'dead' || state === 'win') {
      if (held) {
        await page.keyboard.up(held);
        held = null;
      }
      await page.mouse.up();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }
  }
  if (held) await page.keyboard.up(held);
  await page.mouse.up();

  // --- head-less core checks --------------------------------------------
  const coreCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const out = { floors: 0, errors: [] };
    for (let seed = 1; seed <= 10; seed++) {
      try {
        const g = new Game({ seed });
        g.startRun(seed);
        const input = makeInput();
        for (let f = 0; f < 5; f++) {
          for (let i = 0; i < 300; i++) {
            input.move.x = Math.sin(i * 0.11);
            input.move.z = Math.cos(i * 0.07);
            input.look.dx = Math.sin(i * 0.03) * 0.02;
            input.down.fire = i % 3 === 0;
            g.step(1 / 60, input);
          }
          out.floors++;
          g.nextFloor();
        }
      } catch (e) {
        out.errors.push(`seed ${seed}: ${e.message}\n${e.stack}`);
      }
    }
    return out;

    function makeInput() {
      return {
        move: { x: 0, z: 0 },
        look: { dx: 0, dy: 0 },
        down: {},
        pressed: {},
        pointerLocked: true,
        gamepad: false,
      };
    }
  });

  const bossCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const out = { bosses: [], errors: [] };
    const input = {
      move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, down: {}, pressed: {},
      pointerLocked: true, gamepad: false,
    };
    for (let f = 1; f <= 5; f++) {
      try {
        const g = new Game({ seed: 4242 + f });
        g.startRun(4242 + f);
        while (g.floorIndex < f) g.nextFloor();
        const boss = g.enemies.find((e) => e.isBoss);
        if (!boss) {
          out.errors.push(`floor ${f}: no boss spawned`);
          continue;
        }
        // Drop the player into the lair so the boss wakes up.
        g.player.x = boss.x + 4;
        g.player.z = boss.z + 4;
        boss.dormant = false;
        let ticks = 0;
        for (; ticks < 4000; ticks++) {
          g.player.hp = 999;
          g.player.x = boss.x + 6;
          g.player.z = boss.z + 6;
          if (ticks % 2 === 0) {
            for (const e of g.enemies.slice()) {
              if (e.alive) g.damageEnemy(e, e.isBoss ? 8 : 40, { source: 'test', silent: true });
            }
          }
          g.step(1 / 60, input);
          if (!boss.alive) break;
        }
        out.bosses.push({ floor: f, name: boss.name, killed: !boss.alive, ticks, phase: boss.phase });
      } catch (e) {
        out.errors.push(`boss floor ${f}: ${e.message}\n${e.stack}`);
      }
    }
    return out;
  });

  const itemCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { ITEM_IDS, ACTIVE_IDS } = await import('./src/data/items.js');
    const { addItem, setActive, useActive } = await import('./src/core/items/inventory.js');
    const out = { checked: 0, errors: [] };
    const input = () => ({
      move: { x: 1, z: -1 }, look: { dx: 0.01, dy: 0 },
      down: { fire: true }, pressed: {}, pointerLocked: true, gamepad: false,
    });
    for (const id of ITEM_IDS) {
      try {
        const g = new Game({ seed: 77 });
        g.startRun(77);
        addItem(g, g.player, id);
        const inp = input();
        for (let i = 0; i < 200; i++) g.step(1 / 60, inp);
        out.checked++;
      } catch (e) {
        out.errors.push(`item ${id}: ${e.message}`);
      }
    }
    for (const id of ACTIVE_IDS) {
      try {
        const g = new Game({ seed: 99 });
        g.startRun(99);
        setActive(g.player, id);
        g.player.inv.activeCharge = g.player.inv.activeMax;
        useActive(g, g.player);
        const inp = input();
        for (let i = 0; i < 120; i++) g.step(1 / 60, inp);
        out.checked++;
      } catch (e) {
        out.errors.push(`active ${id}: ${e.message}`);
      }
    }
    return out;
  });

  const gearCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { WEAPON_IDS, RELIC_IDS, BOSS_RELIC } = await import('./src/data/gear.js');
    const { setWeapon, addRelic } = await import('./src/core/items/inventory.js');
    const out = { weapons: 0, relics: 0, bossRelics: 0, errors: [] };
    const input = () => ({
      move: { x: 1, z: -1 }, look: { dx: 0.01, dy: 0 },
      down: { fire: true, crouch: true }, pressed: {}, pointerLocked: true, gamepad: false,
    });

    // Every weapon fired for a few seconds, on its own.
    for (const id of WEAPON_IDS) {
      try {
        const g = new Game({ seed: 4141 });
        g.startRun(4141);
        setWeapon(g.player, id);
        const inp = input();
        for (let i = 0; i < 240; i++) g.step(1 / 60, inp);
        out.weapons++;
      } catch (e) {
        out.errors.push(`weapon ${id}: ${e.message}`);
      }
    }

    // Every relic, then all of them at once — the combination is where a flag
    // that assumes it is alone falls over.
    for (const id of RELIC_IDS) {
      try {
        const g = new Game({ seed: 5252 });
        g.startRun(5252);
        addRelic(g.player, id);
        const inp = input();
        for (let i = 0; i < 240; i++) g.step(1 / 60, inp);
        out.relics++;
      } catch (e) {
        out.errors.push(`relic ${id}: ${e.message}`);
      }
    }
    try {
      const g = new Game({ seed: 6363 });
      g.startRun(6363);
      for (const id of RELIC_IDS) addRelic(g.player, id);
      for (const id of WEAPON_IDS) setWeapon(g.player, id);
      const inp = input();
      for (let i = 0; i < 600; i++) g.step(1 / 60, inp);
    } catch (e) {
      out.errors.push(`all gear: ${e.message}`);
    }

    // Each boss must actually hand over its own relic.
    for (let f = 1; f <= 5; f++) {
      try {
        const g = new Game({ seed: 7000 + f });
        g.startRun(7000 + f);
        while (g.floorIndex < f) g.nextFloor();
        const boss = g.enemies.find((e) => e.isBoss);
        if (!boss) { out.errors.push(`floor ${f}: no boss`); continue; }
        boss.dormant = false;
        const inp = { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, down: {}, pressed: {} };
        let guard = 0;
        while (boss.alive && guard++ < 4000) {
          g.damageEnemy(boss, 300, {});
          g.step(1 / 60, inp);
        }
        const drop = g.props.find((pr) => pr.type === 'relic');
        if (!drop || drop.relicId !== BOSS_RELIC[boss.id]) {
          out.errors.push(`floor ${f}: relic drop ${drop ? drop.relicId : 'none'} != ${BOSS_RELIC[boss.id]}`);
        } else {
          out.bossRelics++;
        }
      } catch (e) {
        out.errors.push(`boss relic ${f}: ${e.message}`);
      }
    }
    return out;
  });

  const megaCheck = await page.evaluate(async () => {
    const { Game } = await import('./src/core/game.js');
    const { ITEM_IDS } = await import('./src/data/items.js');
    const { addItem } = await import('./src/core/items/inventory.js');
    try {
      const g = new Game({ seed: 7 });
      g.startRun(7);
      for (const id of ITEM_IDS) addItem(g, g.player, id);
      const inp = {
        move: { x: 1, z: -1 }, look: { dx: 0.02, dy: 0 },
        down: { fire: true }, pressed: {}, pointerLocked: true, gamepad: false,
      };
      for (let i = 0; i < 600; i++) g.step(1 / 60, inp);
      return { ok: true, synergies: g.player.inv.synergies.length, shots: g.shots.count };
    } catch (e) {
      return { ok: false, error: `${e.message}\n${e.stack}` };
    }
  });

  if (SHOTS) await page.screenshot({ path: path.join(shotDir, 'final.png') });

  await browser.close();
  server.close();

  // --- report -------------------------------------------------------------
  const fps = report.frames.map((f) => f.fps).filter((v) => v > 1);
  const avgFps = fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : 0;
  const maxStep = report.frames.length ? Math.max(...report.frames.map((f) => f.stepMs)) : 0;
  const maxRender = report.frames.length ? Math.max(...report.frames.map((f) => f.renderMs)) : 0;
  const last = report.states[report.states.length - 1] || {};
  const maxFloor = Math.max(...report.states.map((s) => s.floor || 0), 0);

  console.log('--- smoke test ---------------------------------------------');
  console.log(`boot            ${bootMs} ms`);
  console.log(`fps (software)  avg ${avgFps.toFixed(1)}   worst sim step ${maxStep.toFixed(2)} ms, draw ${maxRender.toFixed(2)} ms`);
  console.log(`played to       floor ${maxFloor}, kills ${last.kills}, items ${last.items}`);
  console.log(`core sim        ${coreCheck.floors} floor generations across 10 seeds`);
  console.log(`bosses          ${bossCheck.bosses.map((b) => `${b.name}${b.killed ? '✓' : '✗'}(p${b.phase})`).join(' ')}`);
  console.log(`items           ${itemCheck.checked} exercised`);
  console.log(
    `gear            ${gearCheck.weapons} weapons, ${gearCheck.relics} relics, ` +
      `${gearCheck.bossRelics}/5 boss drops`,
  );
  console.log(`all-items run   ${megaCheck.ok ? `ok (${megaCheck.synergies} synergies active)` : `FAILED ${megaCheck.error}`}`);

  const allErrors = [
    ...errors,
    ...coreCheck.errors,
    ...bossCheck.errors,
    ...itemCheck.errors,
    ...gearCheck.errors,
    ...(megaCheck.ok ? [] : [megaCheck.error]),
    ...bossCheck.bosses.filter((b) => !b.killed).map((b) => `boss not killable: ${b.name} (floor ${b.floor})`),
  ];

  if (warnings.length) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of [...new Set(warnings)].slice(0, 8)) console.log(`  ! ${w}`);
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
