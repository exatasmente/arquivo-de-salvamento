// Renders the new sounds offline in a local Chrome, writes WAVs and prints measurements.
// usage: node tools/sfx-render.mjs <outdir> [path to playwright-core]
// Needs playwright-core (installed here, or its path as the second argument) and a local Chrome
// (CHROME_PATH, default /usr/bin/google-chrome).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const pw = await import(process.argv[3] || 'playwright-core');
const { chromium } = pw.default ?? pw;
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'text/html' }); s.end(fs.readFileSync(f)); }).listen(0);
const port = srv.address().port;
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const pg = await br.newPage(); const errs = []; pg.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`http://localhost:${port}/tools/sfx-render.html`); await pg.waitForFunction(() => window.ready);

function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), x = i + k, y = x + len / 2; const tr = re[y] * wr - im[y] * wi, ti = re[y] * wi + im[y] * wr; re[y] = re[x] - tr; im[y] = im[x] - ti; re[x] += tr; im[x] += ti; } } }
function measure(L, R, sr) {
  const n = L.length, m = new Float32Array(n); let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < n; i++) { m[i] = (L[i] + R[i]) / 2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); sum += m[i] * m[i]; }
  for (let i = 0; i < n; i++) if (Math.abs(m[i]) > 0.001) last = i; // last sample above -60 dBFS
  const N = 1024, pw = new Float64Array(N / 2); const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= n; s += N / 2) { for (let i = 0; i < N; i++) { re[i] = m[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; } fft(re, im); for (let k = 0; k < N / 2; k++) pw[k] += re[k] ** 2 + im[k] ** 2; }
  let num = 0, den = 0; for (let k = 1; k < N / 2; k++) { num += k * sr / N * pw[k]; den += pw[k]; }
  return { dur: +(last / sr).toFixed(2), peak: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rms: +(10 * Math.log10(sum / n || 1e-12)).toFixed(1), centroid: den ? Math.round(num / den) : 0 };
}
function wav(file, L, R, sr) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
const f32 = (s) => { const u = Buffer.from(s, 'base64'); return new Float32Array(u.buffer, u.byteOffset, u.length / 4); };

const jobs = [];
const add = (name, opts, len, label, sr = 22050) => jobs.push({ name, opts, len, label: label || name, sr });
add('noite', { dur: 20 }, 22); add('geladeira', {}, 3); add('maca_colher', {}, 1.2); add('maca_cair', {}, 2); add('drone_zumbido', { dur: 6 }, 7);
add('cela_zumbido', { dur: 6 }, 7); add('batida_parede', { hits: 1 }, 1.5, 'batida_parede_1'); add('batida_parede', { hits: 3 }, 2, 'batida_parede_3'); add('golpe_nuca', {}, 5);
add('noite', { dur: 8 }, 9, 'noite_44k', 44100); add('fala', { who: 'fole', mood: 'ordena', dur: 2 }, 3, 'fala_fole_ordena_44k', 44100);
for (const who of ['casca', 'fole', 'vigia', 'mestre', 'apito', 'instrutor', 'juiz']) for (const mood of ['calmo', 'negocia', 'ordena', 'ri', 'irritado']) add('fala', { who, mood, dur: 2.5 }, 3.5, `fala_${who}_${mood}`);
const rows = [];
for (const j of jobs) {
  const r = await pg.evaluate(([n, o, l, sr]) => window.renderSfx(n, o, l, sr), [j.name, j.opts, j.len, j.sr]);
  const L = f32(r.ch[0]), R = f32(r.ch[1]), m = measure(L, R, r.sr); wav(path.join(out, j.label + '.wav'), L, R, r.sr);
  rows.push({ label: j.label, sr: j.sr, want: j.opts.dur ?? '', ...m, ok: m.peak < -1 && m.rms > -60 }); 
}
console.table(rows);
// the same call twice must give the same samples (seeded)
const a = await pg.evaluate(() => window.renderSfx('fala', { who: 'vigia', mood: 'ri', dur: 2 }, 3, 22050, 9)), b = await pg.evaluate(() => window.renderSfx('fala', { who: 'vigia', mood: 'ri', dur: 2 }, 3, 22050, 9));
{ const x = f32(a.ch[0]), y = f32(b.ch[0]); let d = 0; for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i])); console.log('deterministic: identical =', a.ch[0] === b.ch[0], ', max sample diff =', d); }
console.log('console errors:', errs);
await br.close(); srv.close();
