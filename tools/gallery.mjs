/**
 * Screenshot gallery (development only — the game itself has no dependencies).
 *
 * Serves the project, loads it in headless Chromium and walks it: every floor
 * photographed in each of its room plans, every monster lined up in a hall,
 * every boss in two phases. Useful for eyeballing a change across the whole
 * game without playing five floors by hand.
 *
 * Usage:  node tools/gallery.mjs [--out DIR]
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
    console.error('playwright is not installed; gallery skipped');
    process.exit(0);
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = outArg >= 0 ? args[outArg + 1] : '/tmp/deepshade-gallery';
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

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
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const browser = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
let errors = 0;
page.on('pageerror', (e) => {
  errors++;
  console.log('ERROR', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors++;
    console.log('CONSOLE', m.text());
  }
});
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__DEEPSHADE__, null, { timeout: 30000 });

const shot = async (name) => {
  await page.waitForTimeout(340);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  ->', name);
};

const FLOORS = [
  { i: 1, id: 'grove' },
  { i: 2, id: 'hollow' },
  { i: 3, id: 'forge' },
  { i: 4, id: 'lavalake' },
  { i: 5, id: 'hoard' },
];

// ---------------------------------------------------------------- locations
for (const f of FLOORS) {
  console.log(`floor ${f.i} ${f.id}`);
  const rooms = await page.evaluate(({ fi, sd }) => {
    const g = window.__DEEPSHADE__.game;
    g.startRun(sd);
    while (g.floorIndex < fi) g.nextFloor();
    g.enemies.length = 0;
    g.torch.charge = 1;
    g.messages.length = 0;
    return g.dungeon.rooms.map((r) => ({ plan: r.plan, cx: r.cx, cy: r.cy, w: r.w, h: r.h }));
  }, { fi: f.i, sd: 20260729 + f.i });

  // One shot per distinct room plan, plus the biggest plain hall.
  const seen = new Set();
  const picks = [];
  for (const r of rooms) {
    if (seen.has(r.plan)) continue;
    seen.add(r.plan);
    picks.push(r);
  }
  const big = rooms.filter((r) => r.plan === 'hall').sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (big && !picks.includes(big)) picks.push(big);

  for (const room of picks.slice(0, 4)) {
    await page.evaluate((r) => {
      const g = window.__DEEPSHADE__.game;
      const CELL = 4;
      const W = g.dungeon.width;
      const CW = W + 1;
      const t = g.dungeon.terrain;
      // Stand on the highest walkable cell and look at the lowest: whatever the
      // plan did to the floor, that framing shows it.
      let hiC = null;
      let loC = null;
      let hi = -1e9;
      let lo = 1e9;
      for (let y = r.cy - (r.h >> 1); y <= r.cy + (r.h >> 1); y++) {
        for (let x = r.cx - (r.w >> 1); x <= r.cx + (r.w >> 1); x++) {
          if (x < 1 || y < 1 || x >= W - 1 || y >= W - 1) continue;
          const c = g.dungeon.cells[y * W + x];
          if (c !== 1 && c !== 2) continue;
          const v = t.floorH[y * CW + x];
          if (v > hi) { hi = v; hiC = { x, y }; }
          if (v < lo) { lo = v; loC = { x, y }; }
        }
      }
      if (!hiC) return;
      const pl = g.player;
      pl.x = (hiC.x + 0.5) * CELL;
      pl.z = (hiC.y + 0.5) * CELL;
      pl.px = pl.x;
      pl.pz = pl.z;
      pl.yaw = Math.atan2((loC.x + 0.5) * CELL - pl.x, (loC.y + 0.5) * CELL - pl.z);
      pl.pitch = 0.12;
      g.torch.charge = 1;
      g.messages.length = 0;
      g.nav.rebuild(g.dungeon.cells, hiC.x, hiC.y);
    }, room);
    await shot(`loc-${f.i}-${f.id}-${room.plan}`);
  }
}

// ---------------------------------------------------------------- monsters
for (const f of FLOORS) {
  console.log(`monsters ${f.id}`);
  const ids = await page.evaluate(async ({ fi }) => {
    const { FLOORS: FL } = await import('./src/data/floors.js');
    return FL[fi - 1].enemies;
  }, { fi: f.i });

  // Two group shots so every monster appears at a readable size.
  for (let half = 0; half < 2; half++) {
    const group = ids.filter((_, k) => k % 2 === half);
    if (!group.length) continue;
    await page.evaluate(async ({ fi, sd, list }) => {
      const g = window.__DEEPSHADE__.game;
      const { createEnemy } = await import('./src/core/entities/enemy.js');
      g.startRun(sd);
      while (g.floorIndex < fi) g.nextFloor();
      g.enemies.length = 0;
      g.messages.length = 0;
      g.torch.charge = 1;

      const halls = g.dungeon.rooms.filter((r) => r.plan === 'hall');
      const r = halls.sort((a, b) => b.w * b.h - a.w * a.h)[0] || g.dungeon.rooms[0];
      const CELL = 4;
      const pl = g.player;
      pl.x = (r.cx + 0.5) * CELL;
      pl.z = (r.cy + 0.5) * CELL;
      pl.px = pl.x;
      pl.pz = pl.z;
      pl.yaw = 0;
      pl.pitch = 0.04;

      // Fan them out in front, awake and facing the camera.
      list.forEach((id, k) => {
        const spread = (k - (list.length - 1) / 2) * 3.2;
        const e = createEnemy(id, pl.x + spread, pl.z + 8.5);
        e.dormant = false;
        e.aggro = 1;
        e.yaw = Math.PI;
        e.ai.state = 'idle';
        e.speed = 0;
        g.enemies.push(e);
      });
      const input = { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, down: {}, pressed: {} };
      for (let i = 0; i < 20; i++) g.step(1 / 60, input);
      g.messages.length = 0;
    }, { fi: f.i, sd: 4242 + f.i, list: group });
    await shot(`mob-${f.i}-${f.id}-${half + 1}`);
  }
}

// ---------------------------------------------------------------- bosses
for (const f of FLOORS) {
  console.log(`boss ${f.id}`);
  for (let phase = 0; phase < 2; phase++) {
    await page.evaluate(({ fi, sd, ph }) => {
      const g = window.__DEEPSHADE__.game;
      g.startRun(sd);
      while (g.floorIndex < fi) g.nextFloor();
      g.messages.length = 0;
      g.torch.charge = 1;
      const boss = g.enemies.find((e) => e.isBoss);
      if (!boss) return;
      boss.dormant = false;
      g.bossActive = true;
      // Second shot: knock it into a later phase so its pattern is on screen.
      if (ph) g.damageEnemy(boss, boss.maxHp * 0.55, {});
      const pl = g.player;
      pl.x = boss.x;
      pl.z = boss.z - 11;
      pl.px = pl.x;
      pl.pz = pl.z;
      pl.yaw = 0;
      pl.pitch = 0.02;
      pl.invuln = 999;
      const input = { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, down: {}, pressed: {} };
      for (let i = 0; i < (ph ? 90 : 30); i++) g.step(1 / 60, input);
      g.messages.length = 0;
    }, { fi: f.i, sd: 909 + f.i, ph: phase });
    await shot(`boss-${f.i}-${f.id}-${phase + 1}`);
  }
}

await browser.close();
server.close();
console.log(errors ? `\ndone with ${errors} console errors` : `\ndone, clean. ${OUT}`);
process.exit(errors ? 1 : 0);
