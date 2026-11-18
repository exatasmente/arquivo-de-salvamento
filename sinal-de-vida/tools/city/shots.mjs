// The pictures of the street for the art review, taken in the real game (the first exit, at night), on the GPU.
//   PLAYWRIGHT_CORE=<folder of playwright-core> node tools/city/shots.mjs <out folder> [prefix] [--only id,id]
// Each view is a place for Jonas and a camera put by hand (window.__game.test.camera), or the game's own camera (`cam: null`).
// GAME_ROOT=<another copy of the game> takes the same pictures of a version kept aside (the "before").
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.env.GAME_ROOT ?? new URL('../..', import.meta.url).pathname);
const CORE = process.env.PLAYWRIGHT_CORE;
if (!CORE) { console.error('set PLAYWRIGHT_CORE to the folder of playwright-core'); process.exit(2); }
const argv = process.argv.slice(2), OUT = argv[0] ?? '.', PRE = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'cidade';
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };

export const VIEWS = [
  { id: 'calcada', at: [-15.4, 8.4], yaw: -2.0, cam: { eye: [-13.4, 2.1, 4.0], at: [-21, 1.4, 10.8], fov: 60 } },
  { id: 'calcada-jogo', at: [-14.6, 7.6], yaw: -2.2, cam: null },
  { id: 'avenida', at: [-36, 8.4], yaw: 1.57, cam: { eye: [-41, 1.7, 2.0], at: [20, 3, -1], fov: 64 } },
  { id: 'fachada', at: [-24.6, 9.2], yaw: 2.6, cam: { eye: [-25.4, 1.75, 5.2], at: [-27.4, 3.4, 11.5], fov: 62 } },
  { id: 'fachada-norte', at: [-24.2, 9.6], yaw: 0, cam: { eye: [-29.2, 1.75, -5.2], at: [-25, 4.4, -11.5], fov: 62 } },
  { id: 'viaduto', at: [-9.6, 7.0], yaw: 1.2, cam: { eye: [-13.5, 1.7, 4.6], at: [0, 5.0, 3], fov: 64 } },
  { id: 'chao', at: [-17.2, 8.8], yaw: -1.6, cam: { eye: [-16.2, 1.7, 4.4], at: [-19.5, 0.1, 8.2], fov: 58 } },
  { id: 'boca', at: [-3.4, 7.6], yaw: 1.0, cam: { eye: [-5.2, 1.9, 5.6], at: [-0.6, 0.4, 9.6], fov: 58 } },
  { id: 'grade', at: [-1.2, 8.1], yaw: 0, cam: { eye: [-1.2, 0.45, 5.8], at: [-3.5, 0.8, -3], fov: 55 } },
  { id: 'grade-2', at: [-1.2, 8.1], yaw: 0, cam: { eye: [-6, 0.45, 5.8], at: [-14, 0.82, -1], fov: 55 } },
  { id: 'paineis', at: [11, 7.4], yaw: 1.4, cam: { eye: [12.6, 1.8, 7.2], at: [16.4, 0.7, 9.8], fov: 58 } },
  { id: 'mobiliario', at: [-17.6, 8.6], yaw: 2.4, cam: { eye: [-16.4, 1.6, 9.6], at: [-19.6, 1.5, 6.9], fov: 58 } },
  { id: 'alto', at: [-15.6, 7.9], yaw: 0, cam: { eye: [-16, 13, 9], at: [6, 2, -6], fov: 60 } },
  { id: 'dia', at: [-15.6, 7.9], yaw: -2.2, day: 1, cam: { eye: [-41, 1.7, 2.0], at: [20, 3, -1], fov: 64 } },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const { chromium } = createRequire(import.meta.url)(CORE);
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--headless=new', '--use-gl=angle', `--use-angle=${process.env.ANGLE ?? 'gl'}`, '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?cena=n1-saida&sair=agora&semente=7`);
    await page.waitForFunction(() => window.__game?.run && window.__game.st.phase, null, { timeout: 120000 });
    await page.waitForFunction(() => window.__game.st.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 180000 });
    await page.evaluate(() => window.__game.test.manual(true));
    for (const v of VIEWS) {
      if (ONLY && !ONLY.includes(v.id)) continue;
      await page.evaluate(([x, z, yaw, cam, day]) => {
        const G = window.__game; G.test.teleport(x, z); G.player.body = yaw; G.test.camera(cam);
        G.st.world.sc.setDaylight(day ?? 0); G.test.step(40); G.test.render();
      }, [v.at[0], v.at[1], v.yaw, v.cam, v.day ?? null]);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok)))));
      await page.screenshot({ path: path.join(OUT, `${PRE}-${v.id}.png`) });
      console.log('shot', v.id);
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 8));
  } finally { await browser.close(); srv.close(); }
}
