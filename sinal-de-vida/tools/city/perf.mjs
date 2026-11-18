// Measures the frame time of the street in the real game, on the GPU of this machine (not the software renderer of the tests).
//   PLAYWRIGHT_CORE=<folder of playwright-core> node tools/city/perf.mjs [--mobile] [--capped] [--out file.json]
// What it does: serves the game, opens Chrome (CHROME, default /usr/bin/google-chrome) headless with ANGLE on the real GPU, checks the renderer
// name (WEBGL_debug_renderer_info: it refuses SwiftShader and llvmpipe), and for each view lets the game run by itself and reads the time between
// requestAnimationFrame calls (mean and 95th percentile over FRAMES frames, after a warm-up). By default the frame-rate limit and the vsync are
// off, so the number is the cost of a frame and not the 16.7 ms of the screen; `--capped` leaves them on (what a player sees).
// `--mobile`: 390x844, device pixel ratio 3, touch, and the CPU four times slower (CDP Emulation.setCPUThrottlingRate).
// Views: the first exit (n1-saida) at the three camera zones, the avenue from end to end and the viaduct (cameras put by hand), and the four
// shots of the cutscene of the grate (n1-cidade).
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.env.GAME_ROOT ?? new URL('../..', import.meta.url).pathname);   // GAME_ROOT: another copy of the game (to measure a version kept aside)
const CORE = process.env.PLAYWRIGHT_CORE;
if (!CORE) { console.error('set PLAYWRIGHT_CORE to the folder of playwright-core'); process.exit(2); }
const args = process.argv.slice(2), MOBILE = args.includes('--mobile'), CAPPED = args.includes('--capped');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null, QUERY = args.includes('--query') ? args[args.indexOf('--query') + 1] : '';
const FRAMES = 240, WARM = 60;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };

const VIEWS = [
  { id: 'saida-boca', scene: 'n1-saida', at: [-1.2, 8.1] },
  { id: 'saida-estacao', scene: 'n1-saida', at: [-9, 7.4] },
  { id: 'saida-cacamba', scene: 'n1-saida', at: [-13.3, 7.5] },
  { id: 'saida-calcada-oeste', scene: 'n1-saida', at: [-30, 8.5] },
  { id: 'avenida-inteira', scene: 'n1-saida', at: [-13.3, 7.5], cam: { eye: [-40, 1.7, 3], at: [20, 3, -2], fov: 64 } },
  { id: 'fachada-perto', scene: 'n1-saida', at: [-27, 9], cam: { eye: [-27, 1.7, 7.4], at: [-27, 3.2, 12], fov: 64 } },
  { id: 'viaduto', scene: 'n1-saida', at: [-9, 7.4], cam: { eye: [-13, 1.7, 5.4], at: [0, 5.5, 3], fov: 64 } },
];

const sample = (frames, warm) => new Promise((ok) => {
  const d = []; let last = 0, n = 0;
  const f = (t) => { if (last && n >= warm) d.push(t - last); last = t; n++; if (d.length >= frames) { d.sort((a, b) => a - b); ok({ mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], n: d.length }); } else requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
// draw calls and triangles of one whole frame (the look draws in several passes: the count is kept over the frame)
const info = () => new Promise((ok) => { const I = window.__game.r.renderer.info; I.autoReset = false; requestAnimationFrame(() => { I.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { const o = { calls: I.render.calls, tris: I.render.triangles }; I.autoReset = true; ok(o); })); }); });

const srv = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(p));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;
const { chromium } = createRequire(import.meta.url)(CORE);
const flags = ['--mute-audio', '--headless=new', '--use-gl=angle', `--use-angle=${process.env.ANGLE ?? 'gl'}`, '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
if (!CAPPED) flags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: flags });
const result = { mode: MOBILE ? 'mobile 390x844 dpr3 cpu/4' : 'desktop 1280x720', capped: CAPPED, views: {} };
try {
  const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  if (MOBILE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const open = async (q) => { await page.goto(`${url}${q}${QUERY}`); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase, null, { timeout: 120000 }); };
  const ready = () => page.waitForFunction(() => window.__game.st.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 180000 });

  const t0 = Date.now(); await open('?cena=n1-saida&sair=agora&semente=7'); await ready(); result.loadMs = Date.now() - t0;   // from the address to the street ready (the paintings are made here)
  console.log('street ready in', result.loadMs, 'ms');
  result.gpu = await page.evaluate(() => { const gl = window.__game.r.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  result.canvas = await page.evaluate(() => { const c = window.__game.r.renderer.domElement; return [c.width, c.height]; });
  if (/swiftshader|llvmpipe|software/i.test(result.gpu)) throw new Error(`not on the GPU: ${result.gpu}`);
  for (const v of VIEWS) {
    await page.evaluate(([x, z, cam]) => { const G = window.__game; G.test.teleport(x, z); G.test.camera(cam ?? null); G.test.die = () => {}; }, [v.at[0], v.at[1], v.cam ?? null]);
    await page.waitForTimeout(MOBILE ? 2500 : 1200);
    const s = await page.evaluate(`(${sample})(${FRAMES}, ${WARM})`), i = await page.evaluate(info);
    result.views[v.id] = { ...s, ...i };
    console.log(v.id.padEnd(22), `mean ${s.mean.toFixed(2)} ms  p95 ${s.p95.toFixed(2)} ms  max ${s.max.toFixed(1)}  (${(1000 / s.mean).toFixed(0)} fps)  calls ${i.calls}  tris ${i.tris}`);
  }
  // the cutscene of the grate: the whole of it, by shot
  await open('?cena=n1-cidade&semente=7'); await page.waitForFunction(() => window.__game.st.cut && !window.__game.st.cut.loading, null, { timeout: 180000 });
  const cut = await page.evaluate(() => new Promise((ok) => {
    const G = window.__game, by = {}; let last = 0;
    const f = (t) => {
      const c = G.st.cut; if (!c || c.t > 13.6) return ok(by);
      const id = c.shot?.id ?? c.shotId ?? `t${Math.floor(c.t / 3.5)}`;
      if (last && c.t > 0.6) (by[id] ??= []).push(t - last); last = t; requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  for (const [id, d] of Object.entries(cut)) {
    d.sort((a, b) => a - b); const s = { mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], n: d.length };
    result.views[`grade-${id}`] = s;
    console.log(`grade-${id}`.padEnd(22), `mean ${s.mean.toFixed(2)} ms  p95 ${s.p95.toFixed(2)} ms  max ${s.max.toFixed(1)}  (${(1000 / s.mean).toFixed(0)} fps)  n ${s.n}`);
  }
  result.errors = errors;
  if (errors.length) console.log('page errors:', errors);
} finally { await browser.close(); srv.close(); }
console.log(JSON.stringify({ gpu: result.gpu, canvas: result.canvas, mode: result.mode, capped: result.capped }));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
