// The frame time of the chase through the building, beat by beat, on the machine's graphics card (the same way of measuring as
// tools/city/perf.mjs: the interval between two calls of requestAnimationFrame, the frame limit and the vsync off).
//   PLAYWRIGHT_CORE=<folder> node tools/fuga/perf.mjs            # desktop, 1280x720
//   PLAYWRIGHT_CORE=<folder> node tools/fuga/perf.mjs --mobile   # 390x844, DPR 3, touch, CPU 4x slower
// The chase plays itself ("reação desligada") from its first beat to the grate; every frame is counted in the beat that is on. The
// draw calls and the triangles are those of one whole frame of each beat. --out <file.json> keeps the numbers.
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname), CORE = process.env.PLAYWRIGHT_CORE;
if (!CORE) { console.error('set PLAYWRIGHT_CORE to the folder of playwright-core'); process.exit(2); }
const args = process.argv.slice(2), MOBILE = args.includes('--mobile'), OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(p));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const { chromium } = createRequire(import.meta.url)(CORE);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--headless=new', '--use-gl=angle', `--use-angle=${process.env.ANGLE ?? 'gl'}`, '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const result = { mode: MOBILE ? 'mobile 390x844 dpr3 cpu/4' : 'desktop 1280x720', beats: {} };
try {
  const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page); if (MOBILE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?cena=n1-saida&sair=agora&semente=7&fuga=corrida`, { timeout: 300000 });
  await page.waitForFunction(() => window.__game?.st.seq?.kind === 'fuga' && window.__game.st.world, null, { timeout: 300000 });
  result.loadMs = Date.now() - t0;
  result.gpu = await page.evaluate(() => { const gl = window.__game.r.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  if (/swiftshader|llvmpipe|software/i.test(result.gpu)) throw new Error(`not on the GPU: ${result.gpu}`);
  result.tris = await page.evaluate(() => window.__game.st.world.sc.fuga.tris());
  const by = await page.evaluate(() => new Promise((ok) => {
    const G = window.__game, I = G.r.renderer.info, out = {}; let last = 0, beat = null, n = 0;
    G.options.quick = 'off'; I.autoReset = false;
    const f = (t) => {
      const S = G.st.seq; if (!S || S.kind !== 'fuga') { I.autoReset = true; return ok(out); }
      const b = S.pose?.beat, o = (out[b] ??= { d: [], calls: 0, tris: 0 });
      if (b !== beat) { beat = b; n = 0; } else if (last && n > 8) o.d.push(t - last);
      if (n === 20) { o.calls = I.render.calls; o.tris = I.render.triangles; }
      I.reset(); n++; last = t; requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  for (const [id, o] of Object.entries(by)) {
    const d = o.d.sort((a, b) => a - b), s = { mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], n: d.length, calls: o.calls, tris: o.tris };
    result.beats[id] = s;
    console.log(id.padEnd(10), `mean ${s.mean.toFixed(2)} ms  p95 ${s.p95.toFixed(2)} ms  max ${s.max.toFixed(1)}  (${(1000 / s.mean).toFixed(0)} fps)  calls ${s.calls}  tris ${s.tris}  n ${s.n}`);
  }
  if (errors.length) console.log('page errors:', errors);
} finally { await browser.close(); srv.close(); }
console.log(JSON.stringify({ gpu: result.gpu, mode: result.mode, loadMs: result.loadMs, tris: result.tris }));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
