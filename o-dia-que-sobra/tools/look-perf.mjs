// Frame time of the game's pictures (the 1998 mode and the three tiers of the new look), in the real game, in headless Chrome
// with the software rasteriser (so the numbers are relative: a phone's GPU is another animal). The configurations take turns
// in the same page (three rounds, the median of each), so the drift of the machine is seen by all of them.
//   PLAYWRIGHT_CORE=<playwright-core> node tools/look-perf.mjs [--views loja,bombas,monitor] [--frames 8] [--rounds 3] [--configs "1998,alto,leve (celular)"] [--size 1280x720] [--phone 844x390]
// Each line: view, configuration, the picture's size, ms per frame (median), draw calls and triangles of the frame (all passes).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const VIEWS = { loja: [3.4, 4.1, 100, -4], bombas: [4.5, -3.0, 30, -3], monitor: [14.72, 9.45, 0, -3] };
const want = String(arg('views', 'loja,bombas,monitor')).split(',');
const frames = Number(arg('frames', 8)), rounds = Number(arg('rounds', 3)), only = arg('configs', null) ? String(arg('configs')).split(',') : null;
const dims = (s) => String(s).split('x').map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = await new Promise((res) => { const s = http.createServer((req, rs) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs); }); s.listen(0, '127.0.0.1', () => res(s)); });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--no-sandbox'] });

// [label, mode, tier or params, viewport]
const desktop = dims(arg('size', '1280x720')), phone = dims(arg('phone', '844x390'));
const CONFIGS = [
  ['1998', '1998', null, desktop],
  ['alto', 'novo', 'alto', desktop], ['medio', 'novo', 'medio', desktop], ['leve', 'novo', 'leve', desktop],
  ['alto sem sombra', 'novo', { shadows: 0 }, desktop, 'alto'], ['alto sem AO', 'novo', { aoTaps: 0 }, desktop, 'alto'],
  ['1998 (celular)', '1998', null, phone], ['leve (celular)', 'novo', 'leve', phone], ['medio (celular)', 'novo', 'medio', phone],
];
const out = {};
const page = await browser.newPage({ viewport: { width: desktop[0], height: desktop[1] } });
page.setDefaultTimeout(600000);
const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/o-dia-que-sobra/index.html?debug=day:2&manual&skiptutorial&wx=limpo&silent&look=novo&tier=alto`);
await page.waitForFunction(() => window.__odq && window.__odq.game);
await page.evaluate(() => { document.getElementById('splash')?.remove(); const O = window.__odq; O.render.renderer.info.autoReset = false; });
for (const view of want) {
  const [x, z, yaw, pitch] = VIEWS[view];
  for (let round = 0; round < rounds; round++) for (const [label, mode, tier, vp, base] of CONFIGS) {
    if (only && !only.includes(label)) continue;
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    const r = await page.evaluate(async ({ x, z, yaw, pitch, mode, tier, base, frames, monitor }) => {
      const O = window.__odq, G = O.game, R = O.render;
      G.setLookMode(mode, false);
      if (mode === 'novo') { if (typeof tier === 'string') R.setTier(tier); else { R.setTier(base); R.setLook('prerender', tier); } }
      G.player.place({ x, z }, -yaw * Math.PI / 180); G.player.st.pitch = pitch * Math.PI / 180;
      if (monitor && !G.cameras.isOpen) G.cameras.open(); else if (!monitor && G.cameras.isOpen) G.cameras.close();
      O.advance(2);
      const gl = R.renderer.getContext(), ts = [], px = new Uint8Array(4);
      for (let i = 0; i < frames + 2; i++) {
        R.renderer.info.reset(); const t0 = performance.now(); G.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const dt = performance.now() - t0;   // (reading a pixel makes the browser wait for the GPU: finish() alone does not)
        if (i >= 2) ts.push(dt);
      }
      ts.sort((a, b) => a - b);
      return { ms: ts[ts.length >> 1], calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles, size: [R.size.w, R.size.h] };
    }, { x, z, yaw, pitch, mode, tier, base, frames, monitor: view === 'monitor' });
    ((out[view] ??= {})[label] ??= []).push(r);
  }
}
for (const [view, cfgs] of Object.entries(out)) for (const [label, runs] of Object.entries(cfgs)) {
  const ms = runs.map((r) => r.ms).sort((a, b) => a - b)[runs.length >> 1], last = runs[runs.length - 1];
  console.log(`${view.padEnd(8)} ${label.padEnd(18)} ${String(last.size[0]).padStart(4)}x${String(last.size[1]).padEnd(4)} ${ms.toFixed(0).padStart(5)} ms   ${String(last.calls).padStart(5)} calls  ${String(last.tris).padStart(8)} tris`);
}
if (errs.length) console.log('ERRORS', errs.slice(0, 5));
await browser.close(); srv.close();
