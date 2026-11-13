// Phase 3 measurements (offline, in a local Chrome): peak, RMS, loop clicks, build cost, hallucination, drowsiness.
// usage: node tools/audio-preview.measure.mjs <outdir> [path to playwright-core]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const pw = await import(process.argv[3] || 'playwright-core'); const { chromium } = pw.default ?? pw;
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'text/html' }); s.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1');
await new Promise((ok) => srv.once('listening', ok)); const port = srv.address().port;
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pg = await br.newPage(); const errs = []; pg.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/404/.test(m.text()) && errs.push(m.text())); pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`http://127.0.0.1:${port}/tools/audio-preview.html`); await pg.waitForFunction(() => window.ready);
const f32 = (s) => { const u = Buffer.from(s, 'base64'); return new Float32Array(u.buffer, u.byteOffset, u.length / 4); };
function wav(file, L, R, sr) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
const db = (x) => +(20 * Math.log10(x || 1e-9)).toFixed(1);
function measure(L, R, sr, skip = 0) {
  const n = L.length, m = new Float32Array(n); let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < n; i++) { m[i] = (L[i] + R[i]) / 2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const a = Math.floor(skip * sr); for (let i = a; i < n; i++) sum += m[i] * m[i];
  for (let i = 0; i < n; i++) if (Math.abs(m[i]) > 0.001) last = i;
  const w = Math.floor(sr * 0.05); let clicks = 0, worst = 0;
  const d = new Float32Array(n); for (let i = 1; i < n; i++) d[i] = m[i] - m[i - 1];
  for (let s = a + w; s + w < n; s += w) { let e = 0; for (let i = s - w; i < s; i++) e += d[i] * d[i]; const rms = Math.sqrt(e / w) + 1e-5; for (let i = s; i < s + w; i++) { const k = Math.abs(d[i]) / rms; if (k > worst) worst = k; if (k > 12) clicks++; } }
  return { dur: +(last / sr).toFixed(2), peak: db(peak), rms: db(Math.sqrt(sum / (n - a) || 1e-12)), clicks, worst: +worst.toFixed(1) };
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const render = (kind, name, opts, len, extra) => pg.evaluate(([k, n, o, l, e]) => window.renderSound(k, n, o, l, 22050, e), [kind, name, opts, len, extra || {}]);
const NEW = ['objeto_cai', 'porta_range', 'passos_longe', 'sino_fantasma', 'cafe_sozinho', 'geladeira_abre', 'telefone_mudo', 'chiado_radio', 'motor_sem_som', 'bomba4_liga', 'moeda_antiga', 'engolir', 'frasco', 'sono_pesado'];
const rows = [];
async function job(label, kind, name, opts, len, extra, skip = 0) {
  const r = await render(kind, name, opts, len, extra); const L = f32(r.ch[0]), R = f32(r.ch[1]); const m = measure(L, R, r.sr, skip);
  wav(path.join(out, label + '.wav'), L, R, r.sr);
  if (kind !== 'loop') { m.clicks = ''; m.worst = ''; }
  rows.push({ label, ret: r.ret === undefined ? '' : +Number(r.ret).toFixed(2), ...m }); return { L, R, sr: r.sr };
}
for (const n of NEW) { const d = (await render('play', n, {}, 8)).ret; await job(n, 'play', n, {}, Math.min(14, d + 0.8)); }
await job('passos_longe_n1', 'play', 'passos_longe', { n: 1 }, 1.5);
await job('passos_longe_rapido', 'play', 'passos_longe', { n: 8, ritmo: 0.4 }, 4.5);
for (const k of [0.2, 0.6, 1]) await job('zumbido_ouvido_i' + k, 'loop', 'zumbido_ouvido', { state: { intensity: k } }, 8, {}, 1);
await job('babble_self', 'babble', '', { seed: 7, text: 'Não saia da loja.', self: true }, 3);
await job('babble_self_seed91', 'babble', '', { seed: 91, text: 'Não saia da loja.', self: true }, 3);
await job('babble_self_longo', 'babble', '', { seed: 7, text: 'Completa a comum, por favor. Tem troco para cinquenta?', self: true }, 5);
await job('babble_ref', 'babble', '', { seed: 7, text: 'Não saia da loja.' }, 3);
for (const s of [5, 30]) { await job('san' + s + '_zumbido', 'loop', 'zumbido_ouvido', { state: { intensity: 1 } }, 6, { sanity: s }, 1); await job('san' + s + '_telefone_mudo', 'play', 'telefone_mudo', {}, 6, { sanity: s }); }
console.table(rows); fs.writeFileSync(path.join(out, 'measures.json'), JSON.stringify(rows, null, 1));
// the self voice is the same whatever the seed? (fundamental: compare a long-window autocorrelation pitch of both)
{
  const pitch = (x, sr) => { let best = 0, bl = 0; for (let lag = Math.floor(sr / 400); lag < Math.floor(sr / 50); lag++) { let c = 0; for (let i = 0; i < 6000; i++) c += x[i + 2000] * x[i + 2000 + lag]; if (c > best) { best = c; bl = lag; } } return +(sr / bl).toFixed(0); };
  const a = f32((await render('babble', '', { seed: 7, text: 'aaaa aaaa', self: true }, 2)).ch[0]), b = f32((await render('babble', '', { seed: 91, text: 'aaaa aaaa', self: true }, 2)).ch[0]), c = f32((await render('babble', '', { seed: 7, text: 'aaaa aaaa' }, 2)).ch[0]), d = f32((await render('babble', '', { seed: 91, text: 'aaaa aaaa' }, 2)).ch[0]);
  console.log('babble pitch (Hz, autocorrelation): self seed7', pitch(a, 22050), ' self seed91', pitch(b, 22050), ' normal seed7', pitch(c, 22050), ' normal seed91', pitch(d, 22050));
}
// determinism
for (const [kind, n, o] of [['play', 'objeto_cai', {}], ['play', 'chiado_radio', {}], ['loop', 'zumbido_ouvido', {}], ['babble', '', { seed: 7, text: 'Não saia da loja.', self: true }]]) {
  const a = (await render(kind, n, o, 4)).ch[0], b = (await render(kind, n, o, 4)).ch[0]; const x = f32(a), y = f32(b); let dd = 0; for (let i = 0; i < x.length; i++) dd = Math.max(dd, Math.abs(x[i] - y[i]));
  console.log('deterministic', kind, n || 'babble_self', 'max sample diff =', dd.toExponential(1), dd < 1e-3 ? '(same)' : '(DIFFERENT)');
}
// hallucination: object 3 m to the right and 1 m ahead (exactly beside the head the browser's HRTF does not lateralise) of a listener that looks down -z; 40 seeds at 0, 0.3, 1
const lis = { pos: [0, 1.5, 0], dir: [0, 0, -1] };
for (const h of [0, 0.3, 1]) {
  let flipped = 0, late = 0, N = 40; const seen = [];
  for (let s = 1; s <= N; s++) {
    const r = await render('play', 'porta_fecha', { pos: [3, 1.5, -1], seed: s }, 2.2, { hallucination: h, listener: lis }), L = f32(r.ch[0]), R = f32(r.ch[1]);
    const sr = r.sr; let on = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) + Math.abs(R[i]) > 0.002) { on = i; break; }
    const el = rms(L, 0, L.length), er = rms(R, 0, R.length), isFlip = el > er * 1.3, isLate = on / sr > 0.05 + 0.25 + 0.2 + 0.1; // porta_fecha itself starts ~0.2 s in: late = onset beyond that + margin
    if (h === 1 && s < 9) console.log('  seed', s, 'L', el.toFixed(4), 'R', er.toFixed(4));
    if (isFlip) { flipped++; if (h === 0) console.log('  h=0 flip at seed', s, el, er); } if (on / sr > 0.4) late++; seen.push(+(on / sr).toFixed(2));
  }
  console.log(`hallucination ${h}: of ${N} seeds, ${flipped} came mirrored (louder in the left ear), ${late} late; ret/onsets sample:`, seen.slice(0, 10).join(' '));
}
{ const r1 = await render('play', 'porta_fecha', { pos: [3, 1.5, -1], seed: 5 }, 2.2, { hallucination: 1, listener: lis }), r2 = await render('play', 'porta_fecha', { pos: [3, 1.5, -1], seed: 5 }, 2.2, { hallucination: 1, listener: lis }); { const x = f32(r1.ch[0]), y = f32(r2.ch[0]); let dd = 0; for (let i = 0; i < x.length; i++) dd = Math.max(dd, Math.abs(x[i] - y[i])); console.log('hallucination deterministic by seed: max sample diff =', dd.toExponential(1), ' ret', r1.ret); } }
{ // without and with: the sound itself is the same, only moved
  const a = await render('play', 'passo_piso', { seed: 4 }, 1, { hallucination: 1 }), b = await render('play', 'passo_piso', { seed: 4 }, 1, {}); console.log('footsteps are never touched by the hallucination (no pos / skipped): max sample diff =', Math.max(...f32(a.ch[0]).map((v, i) => Math.abs(v - f32(b.ch[0])[i]))).toExponential(1));
}
// drowsy: a fluorescent bed with sono_pesado over it, and setDrowsy as a static state
{
  const L = 14, r = await render('play', 'sono_pesado', { dur: 5, at: 3 }, L, { under: 'fluorescente' });
  const x = f32(r.ch[0]), sr = r.sr, w = (a, b) => db(rms(x, Math.floor(a * sr), Math.floor(b * sr)));
  console.log('sono_pesado over fluorescent (dB rms): before 1-3 s', w(1, 3), ' sunk 5-7 s', w(5, 7), ' back 12-14 s', w(12, 14), ' (play at 3 s, 5 s long)');
  wav(path.join(out, 'sono_pesado_com_fluorescente.wav'), x, f32(r.ch[1]), sr);
  const fl = await render('loop', 'fluorescente', {}, 6, { drowsy: 1 }), fn = await render('loop', 'fluorescente', {}, 6, {}), a = f32(fl.ch[0]), b = f32(fn.ch[0]);
  console.log('setDrowsy(1) on the fluorescent: rms', db(rms(a, 22050, 100000)), 'vs', db(rms(b, 22050, 100000)), '; porta_fecha peak under drowsy 1:', measure(...[f32((await render('play', 'porta_fecha', {}, 2, { drowsy: 1 })).ch[0])].flatMap((q) => [q, q]), 22050).peak);
}
// build cost
const cost = [];
for (const n of [...NEW, 'zumbido_ouvido']) { const kind = n === 'zumbido_ouvido' ? 'loop' : 'play'; const ts = []; for (let i = 0; i < 5; i++) ts.push(await pg.evaluate(([n, k]) => window.timeBuild(n, k), [n, kind])); cost.push({ name: n, kind, firstMs: +ts[0].toFixed(2), medianMs: +ts.sort((x, y) => x - y)[2].toFixed(2) }); }
{ const ts = []; for (let i = 0; i < 5; i++) ts.push(await pg.evaluate(() => { const oc = new OfflineAudioContext(2, 22050, 22050), a = window.mk(oc); const t0 = performance.now(); a.babble(7, 'Não saia da loja.', { at: 0.01, self: true }); return performance.now() - t0; })); cost.push({ name: 'babble self', kind: 'babble', firstMs: +ts[0].toFixed(2), medianMs: +ts.sort((x, y) => x - y)[2].toFixed(2) }); }
console.table(cost); fs.writeFileSync(path.join(out, 'cost.json'), JSON.stringify(cost, null, 1));
console.log('console errors/warnings:', errs);
await br.close(); srv.close();
