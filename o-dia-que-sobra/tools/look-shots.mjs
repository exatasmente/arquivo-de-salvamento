// Screenshots and frame times of the game's looks, from the real game (the real lights, the real night).
//   PLAYWRIGHT_CORE=<playwright-core> OUT_DIR=<folder> node tools/look-shots.mjs [--looks atual,novo,1998] [--tiers alto,medio,leve]
//        [--views loja,balcao,...] [--size 1280x720] [--perf] [--prefix look-novo]
// "atual" is the game before the new look (the n64 at 384 px, drawn through its own render settings).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const OUT = (process.env.OUT_DIR || '').replace(/\/?$/, '/');
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number);
const looks = String(arg('looks', 'novo')).split(',');
const tiers = String(arg('tiers', 'alto')).split(',');
const prefix = arg('prefix', 'look-novo');
const perf = arg('perf', false) === true;
const PHONE = arg('phone', false) === true;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
// name: [x, z, yaw deg (the editor's convention: forward = sin, -cos), pitch deg, eye height]
const VIEWS = {
  loja: [3.4, 4.1, 100, -4], balcao: [10.0, 4.2, 144, -8], gondola: [3.6, 10.4, 33, -10], geladeira: [5.5, 5.2, 270, -6],
  bombas: [4.5, -3.0, 30, -3], bomba4: [19.5, -6.0, 0, -2], fachada: [8, 0.5, 5, 3], patio: [-4.5, 3.4, 270, -5],
  escritorio: [5.2, 12.7, 175, -12], monitor: [14.72, 9.45, 0, -3], estoque: [13, 12.6, 180, -8], placa: [-25.8, -12.9, 57, 30],
};
const only = arg('views', null);
const extra = arg('params', null) && arg('params', null) !== true ? JSON.parse(arg('params')) : null;   // params of the new look set after the page is up (a try-out)
const tagExtra = arg('tag', '');

const srv = await new Promise((res) => { const s = http.createServer((req, rs) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs); }); s.listen(0, '127.0.0.1', () => res(s)); });
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--no-sandbox'] });
const results = [];
for (const look of looks) for (const tier of (look === 'novo' ? tiers : [''])) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: PHONE, isMobile: PHONE });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  const q = `debug=day:2&manual&skiptutorial&wx=limpo&silent${look === 'atual' ? '&look=atual' : look === '1998' ? '&look=1998' : `&look=novo&tier=${tier}`}`;
  await page.goto(`http://127.0.0.1:${port}/o-dia-que-sobra/index.html?${q}`);
  await page.waitForFunction(() => window.__odq && window.__odq.game, null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('splash')?.remove(); document.getElementById('hud')?.remove(); });
  if (extra && look === 'novo') await page.evaluate((x) => { window.__odq.render.setLook('prerender', x); }, extra);
  const tag = (look === 'novo' ? `novo-${tier}` : look) + tagExtra;
  for (const [name, [x, z, yaw, pitch]] of Object.entries(VIEWS)) {
    if (only && !String(only).split(',').includes(name)) continue;
    await page.evaluate(([x, z, yaw, pitch]) => {
      const G = window.__odq.game; G.player.place({ x, z }, -yaw * Math.PI / 180); G.player.st.pitch = pitch * Math.PI / 180;
      for (const k of ['hide', 'hideYaw', 'frozen']) delete G.player.st[k];
      window.__odq.advance(4);
    }, [x, z, yaw, pitch]);
    if (name === 'monitor') await page.evaluate(() => { const O = window.__odq; for (let i = 0; i < 600 && !O.game.cameras.ambient; i++) O.game.step(1 / 60); O.advance(2); });   // (the tube at the counter lights when the first camera picture lands)
    if (perf) {
      const ms = await page.evaluate(() => { const O = window.__odq, gl = O.render.renderer.getContext(); for (let i = 0; i < 4; i++) { O.game.draw(); gl.finish(); } const t0 = performance.now(), n = 12; for (let i = 0; i < n; i++) { O.advance(1); gl.finish(); } return (performance.now() - t0) / n; });
      const info = await page.evaluate(() => ({ calls: window.__odq.render.renderer.info.render.calls, tris: window.__odq.render.renderer.info.render.triangles, size: [window.__odq.render.size.w, window.__odq.render.size.h] }));
      results.push({ look: tag, view: name, ms: +ms.toFixed(1), ...info });
    }
    if (OUT) await (await page.$('#c')).screenshot({ path: `${OUT}${prefix}-${tag}-${name}${PHONE ? '-celular' : ''}.png` });
  }
  if (errs.length) console.log('ERRORS', tag, errs.slice(0, 5));
  await page.close();
}
await browser.close(); srv.close();
if (perf) for (const r of results) console.log(JSON.stringify(r));
