// Renders every sound offline in a local Chrome, writes WAVs, prints measurements.
// usage: node tools/audio-render.mjs <outdir> [path to playwright-core]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const pw = await import(process.argv[3] || 'playwright-core'); const { chromium } = pw.default ?? pw;
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'text/html' }); s.end(fs.readFileSync(f)); }).listen(0);
const port = srv.address().port;
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pg = await br.newPage(); const errs = []; pg.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/404/.test(m.text()) && errs.push(m.text())); pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`http://localhost:${port}/tools/audio-preview.html`); await pg.waitForFunction(() => window.ready);
const f32 = (s) => { const u = Buffer.from(s, 'base64'); return new Float32Array(u.buffer, u.byteOffset, u.length / 4); };
function wav(file, L, R, sr) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
function measure(L, R, sr, skip = 0) {
  const n = L.length, m = new Float32Array(n); let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < n; i++) { m[i] = (L[i] + R[i]) / 2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const a = Math.floor(skip * sr); for (let i = a; i < n; i++) sum += m[i] * m[i];
  for (let i = 0; i < n; i++) if (Math.abs(m[i]) > 0.001) last = i;
  // click detector: first difference against its local rms (50 ms), counted past 12x
  const w = Math.floor(sr * 0.05); let clicks = 0, worst = 0;
  const d = new Float32Array(n); for (let i = 1; i < n; i++) d[i] = m[i] - m[i - 1];
  for (let s = a + w; s + w < n; s += w) { let e = 0; for (let i = s - w; i < s; i++) e += d[i] * d[i]; const rms = Math.sqrt(e / w) + 1e-5; for (let i = s; i < s + w; i++) { const k = Math.abs(d[i]) / rms; if (k > worst) worst = k; if (k > 12) clicks++; } }
  return { dur: +(last / sr).toFixed(2), peak: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rms: +(10 * Math.log10(sum / (n - a) || 1e-12)).toFixed(1), clicks, worst: +worst.toFixed(1) };
}
const names = await pg.evaluate(() => window.NAMES);
const LOOPS = ['fluorescente', 'rodovia', 'insetos', 'vento', 'geladeira', 'motor_carro', 'bomba_corre', 'chuva', 'sol_presenca', 'telefone_toca', 'estatica_camera', 'respiracao', 'coracao'];
const rows = [];
async function job(label, kind, name, opts, len, extra) {
  const r = await pg.evaluate(([k, n, o, l, e]) => window.renderSound(k, n, o, l, 22050, e), [kind, name, opts, len, extra || {}]);
  const L = f32(r.ch[0]), R = f32(r.ch[1]); const m = measure(L, R, r.sr, kind === 'loop' ? 1 : 0); wav(path.join(out, label + '.wav'), L, R, r.sr);
  if (kind !== 'loop') { m.clicks = ''; m.worst = ''; } rows.push({ label, kind, ret: r.ret === undefined ? '' : +Number(r.ret).toFixed(2), ...m });
}
for (const n of names) {
  const oneshot = !LOOPS.includes(n) || ['telefone_toca', 'estatica_camera', 'respiracao', 'coracao'].includes(n);
  if (oneshot) { const d = await pg.evaluate(([n]) => window.renderSound('play', n, {}, 6).then((r) => r.ret), [n]); await job(n, 'play', n, {}, Math.min(14, d + 0.8)); }
  if (LOOPS.includes(n)) await job(n + '_loop', 'loop', n, n === 'respiracao' || n === 'coracao' ? { state: { intensity: 0.5 } } : {}, 14);
}
await job('babble', 'babble', '', { seed: 7, text: 'Completa a comum, por favor. Tem troco para cinquenta?' }, 5);
await job('babble_seed2', 'babble', '', { seed: 91, text: 'Completa a comum, por favor. Tem troco para cinquenta?' }, 5);
// sanity: fluorescent and a step at 100, 60, 30, 5
for (const s of [100, 60, 30, 5]) { await job('san' + s + '_fluor', 'loop', 'fluorescente', {}, 6, { sanity: s }); await job('san' + s + '_porta', 'play', 'porta_fecha', {}, 2, { sanity: s }); }
console.table(rows);
fs.writeFileSync(path.join(out, 'measures.json'), JSON.stringify(rows, null, 1));
// deterministic?
const a = await pg.evaluate(() => window.renderSound('loop', 'rodovia', {}, 8).then((r) => r.ch[0])), b = await pg.evaluate(() => window.renderSound('loop', 'rodovia', {}, 8).then((r) => r.ch[0]));
{ const x = f32(a), y = f32(b); let d = 0; for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i])); console.log('deterministic (rodovia, same seed): identical =', a === b, ', max sample diff =', d); }
// build cost, 5 runs each (first run is the slowest: shared noise, JIT)
const cost = [];
for (const n of names) { const kind = LOOPS.includes(n) && !['telefone_toca', 'estatica_camera'].includes(n) ? 'loop' : 'play'; const ts = []; for (let i = 0; i < 5; i++) ts.push(await pg.evaluate(([n, k]) => window.timeBuild(n, k), [n, kind])); cost.push({ name: n, kind, firstMs: +ts[0].toFixed(2), medianMs: +ts.sort((x, y) => x - y)[2].toFixed(2) }); }
console.table(cost); fs.writeFileSync(path.join(out, 'cost.json'), JSON.stringify(cost, null, 1));
console.log('console errors/warnings:', errs);
await br.close(); srv.close();
