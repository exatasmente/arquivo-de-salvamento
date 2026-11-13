// Opens the preview in a real (headless) Chrome AudioContext at 22.05 kHz, presses every button,
// moves the sanity slider, and reports console errors.
// usage: node tools/audio-live.mjs <captures dir> <path to playwright-core/index.js>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const mod = await import(process.argv[3]); const { chromium } = mod.default ?? mod;
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); s.end(fs.readFileSync(f)); }).listen(0);
const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [label, vp, mobile] of [['desktop', { width: 1100, height: 700 }, false], ['celular', { width: 390, height: 800 }, true]]) {
  const pg = await (await br.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile })).newPage(); const errs = [];
  pg.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/404/.test(m.text()) && errs.push(m.text())); pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://localhost:${srv.address().port}/tools/audio-preview.html`); await pg.waitForFunction(() => window.ready);
  await pg.click('#start'); const info = await pg.evaluate(() => ({ sr: ctx.sampleRate, state: ctx.state }));
  await pg.check('#spatial');
  const names = await pg.$$eval('#one button', (b) => b.map((x) => x.textContent));
  let worst = 0, worstName = '';
  for (const n of names) { const ms = await pg.evaluate((n) => { const t = performance.now(); audio.play(n, { pos: [2, 1.5, -1] }); return performance.now() - t; }, n); if (ms > worst) { worst = ms; worstName = n; } }
  for (const b of await pg.$$('#loops button')) await b.click();
  await wait(1500);
  for (const s of [90, 70, 50, 30, 10, 0]) { await pg.evaluate((s) => audio.setSanity(s), s); await wait(300); }
  await pg.fill('#txt', 'Cinquenta de etanol, moço?'); await pg.click('#bab');
  await pg.evaluate(() => { audio.listener([0, 1.6, 0], [1, 0, 0]); });
  const stats = await pg.evaluate(() => audio.stats());
  await pg.evaluate(() => { document.getElementById('san').value = 30; document.getElementById('sanv').textContent = 30; });
  await pg.screenshot({ path: path.join(out, `som-previa-sanidade-${label}.png`) });
  for (const b of await pg.$$('#loops button.on')) await b.click();
  await wait(800);
  console.log(label, JSON.stringify(info), 'sounds', names.length, 'worst play() ms', worst.toFixed(1), worstName, 'stats', JSON.stringify(stats), 'errors', JSON.stringify(errs));
}
await br.close(); srv.close();
