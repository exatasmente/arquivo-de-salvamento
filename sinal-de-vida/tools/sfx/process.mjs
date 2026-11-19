// Turns the raw ElevenLabs files (see generate.mjs) into the game's sounds in assets/audio/sfx/: mp3 at 48 kHz and 128 kbps, with
// the silence trimmed, the level of each category normalised, the loops made seamless, and a manifest that says where each hit starts and ends.
//   node tools/sfx/process.mjs --raw <raw folder> [--out assets/audio/sfx] [--only id,id]
// With --only, just those sounds are made and the rest of the manifest stays as it was (a short loop may ask for a shorter `xfade` in prompts.json).
// Needs ffmpeg. A sound with several hits in one take (steps, clicks) is one file with its slices listed: the player picks a slice.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const raw = arg('raw'), out = path.resolve(arg('out', path.join(HERE, '../../assets/audio/sfx')));
if (!raw) { console.error('usage: --raw <folder> [--out <folder>]'); process.exit(2); }
const P = JSON.parse(readFileSync(path.join(HERE, 'prompts.json'), 'utf8'));
mkdirSync(out, { recursive: true });
const SR = 48000, HOP = Math.round(SR * 0.005);
// the level each category is brought to: the median peak of its hits (one-shots), or the loudness (loops), in dBFS / LUFS-ish RMS
const PEAK = { emissor: -9, passo: -7, cabo: -7, isca: -7, radio: -9, ui: -11, qte: -7, impacto: -3, cao: -10 };
const LOOP_RMS = -26;
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

function decode(file, ch) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(ch), '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / ch, chans = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) chans[c][i] = f[i * ch + c];
  return chans;
}
function encode(chans, file) {
  const ch = chans.length, n = chans[0].length, f = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) f[i * ch + c] = Math.max(-1, Math.min(1, chans[c][i]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', '-', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', String(SR), file], { input: Buffer.from(f.buffer) });
}
function dcBlock(x) { let px = 0, py = 0; for (let i = 0; i < x.length; i++) { const y = x[i] - px + 0.995 * py; px = x[i]; py = y; x[i] = y; } }
function envelope(x) {
  const e = new Float32Array(Math.floor(x.length / HOP));
  for (let k = 0; k < e.length; k++) { let s = 0; for (let i = k * HOP; i < (k + 1) * HOP; i++) s += x[i] * x[i]; e[k] = Math.sqrt(s / HOP); }
  return e;
}
const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
const peakOf = (x, a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i])); return m; };

const MAXLEN = { 'cao-pisada': 0.8, 'cabo-conector': 0.5, 'radio-ptt': 0.5, 'radio-squelch': 0.9, 'isca-estalo': 0.3, ui: 0.5, passo: 0.6 };
/** Hits: where the level jumps (an onset), each lasting until the next one, the decay, or a ceiling. Returns [start, end] in samples. */
function findHits(x, id, cat) {
  const e = envelope(x), d = Array.from(e, (v) => db(v)), floor = percentile(d, 0.2), hits = [], max = Math.round((MAXLEN[id] ?? MAXLEN[cat] ?? 0.7) * SR);
  const refractory = Math.round((cat === 'passo' ? 0.35 : 0.15) / 0.005);
  for (let k = 3; k < d.length; k++) {
    if (d[k] - d[k - 3] < 9 || d[k] < floor + 14) continue;
    if (hits.length && k - hits.at(-1).k < refractory) continue;
    let p = k; for (let j = k; j < Math.min(d.length, k + 4); j++) if (d[j] > d[p]) p = j;
    hits.push({ k, pk: d[p] });
  }
  const top = Math.max(...hits.map((h) => h.pk));
  const kept = hits.filter((h) => h.pk > top - 18);
  return kept.map((h, i) => {
    const s = h.k * HOP, nxt = kept[i + 1] ? kept[i + 1].k * HOP : x.length;
    let end = Math.min(nxt - Math.round(SR * 0.01), s + max);
    for (let j = h.k; j * HOP < end; j++) if (d[j] < h.pk - 38 && j - h.k > 6) { end = j * HOP; break; }
    return [s, end];
  });
}
/** A sound that is one thing: from where it starts to where it has died down. */
function findWhole(x, max) {
  const e = envelope(x), d = Array.from(e, (v) => db(v)), top = Math.max(...d);
  let a = d.findIndex((v) => v > top - 32), b = d.length - 1; while (b > a && d[b] < top - 44) b--;
  a = Math.max(0, a); b = Math.min(b, a + Math.round((max ?? 99) * SR / HOP));
  return [[a * HOP, (b + 1) * HOP]];
}

const only = arg('only')?.split(','), manifestFile = path.join(out, 'manifest.json');
const manifest = only && existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
const groups = {};
const tmp = mkdtempSync(path.join(tmpdir(), 'sfx-'));
try {
  for (const s of P.sounds) {
    if (only && !only.includes(s.id)) continue;
    const file = path.join(raw, `${s.id}.mp3`);
    if (s.mode === 'loop') {
      const ch = s.cat === 'amb' ? 2 : 1, c = decode(file, ch);
      c.forEach(dcBlock);
      // seamless: blend the last X seconds into the first X, and drop them from the end
      const X = Math.round(SR * (s.xfade ?? 1.2)), N = c[0].length - X;
      const looped = c.map((x) => { const y = new Float32Array(N); for (let i = 0; i < N; i++) y[i] = x[i]; for (let i = 0; i < X; i++) { const a = (i / X) * Math.PI / 2; y[i] = x[i] * Math.sin(a) + x[N + i] * Math.cos(a); } return y; });
      let sum = 0; for (const x of looped) for (let i = 0; i < N; i++) sum += x[i] * x[i];
      const rms = Math.sqrt(sum / (N * ch)), g = 10 ** ((LOOP_RMS - db(rms)) / 20);
      let pk = 0; for (const x of looped) pk = Math.max(pk, peakOf(x, 0, N));
      const gg = Math.min(g, 0.89 / Math.max(pk, 1e-9));
      for (const x of looped) for (let i = 0; i < N; i++) x[i] *= gg;
      encode(looped, path.join(out, `${s.id}.mp3`));
      manifest[s.id] = { file: `${s.id}.mp3`, loop: true, dur: +(N / SR).toFixed(3), channels: ch, gain_db: +db(gg).toFixed(1) };
      console.log(`${s.id}: loop ${(N / SR).toFixed(1)} s, gain ${db(gg).toFixed(1)} dB`);
      continue;
    }
    const [x] = decode(file, 1); dcBlock(x);
    const hits = s.mode === 'hits' ? findHits(x, s.id, s.cat) : findWhole(x, s.max);
    if (!hits.length) { console.log(`${s.id}: NO HITS FOUND`); continue; }
    const pre = Math.round(SR * 0.015), tail = Math.round(SR * 0.02);
    const slices0 = hits.map(([a, b], i) => {
      const nxt = hits[i + 1]?.[0] ?? x.length;
      return [Math.max(0, a - pre), Math.min(b + tail, nxt - Math.round(SR * 0.002), x.length)];
    });
    const top0 = Math.max(...slices0.map(([a, b]) => peakOf(x, a, b)));
    const slices = slices0.filter(([a, b]) => peakOf(x, a, b) > top0 * 0.2);       // a hit 14 dB under the loudest is the floor of the take
    const peaks = slices.map(([a, b]) => db(peakOf(x, a, b)));
    const tgt = PEAK[s.cat] ?? -8, med = [...peaks].sort((p, q) => p - q)[Math.floor(peaks.length / 2)];
    let g = 10 ** ((tgt - med) / 20);
    const maxPk = Math.max(...slices.map(([a, b]) => peakOf(x, a, b)));
    g = Math.min(g, 0.89 / maxPk);
    // the file starts a little before the first slice and ends after the last
    const t0 = Math.max(0, slices[0][0] - Math.round(SR * 0.05)), t1 = Math.min(x.length, slices.at(-1)[1] + Math.round(SR * 0.05));
    const y = new Float32Array(t1 - t0); for (let i = 0; i < y.length; i++) y[i] = x[t0 + i] * g;
    // each slice gets its own fade (a few ms in, a longer one out), so the player never cuts a sound with a click
    for (const [a, b] of slices) {
      const len = b - a, fi = Math.round(SR * 0.004), fo = Math.min(Math.round(SR * (s.mode === 'whole' ? 0.12 : 0.05)), len >> 1);
      for (let i = 0; i < fi; i++) y[a - t0 + i] *= i / fi;
      for (let i = 0; i < fo; i++) y[b - t0 - 1 - i] *= Math.sin((i / fo) * Math.PI / 2);
      for (let i = b - t0; i < Math.min(y.length, b - t0 + 1); i++) y[i] = y[i];
    }
    // outside the slices: silence (the floor noise of the take is never heard)
    { const keep = new Uint8Array(y.length); for (const [a, b] of slices) keep.fill(1, a - t0, b - t0); for (let i = 0; i < y.length; i++) if (!keep[i]) y[i] = 0; }
    encode([y], path.join(out, `${s.id}.mp3`));
    manifest[s.id] = { file: `${s.id}.mp3`, loop: false, dur: +(y.length / SR).toFixed(3), channels: 1, gain_db: +db(g).toFixed(1), slices: slices.map(([a, b]) => [+((a - t0) / SR).toFixed(3), +((b - t0) / SR).toFixed(3)]) };
    console.log(`${s.id}: ${slices.length} slice(s), ${slices.map(([a, b]) => ((b - a) / SR).toFixed(2)).join('/')} s, gain ${db(g).toFixed(1)} dB, peaks ${peaks.map((p) => p.toFixed(0)).join(',')}`);
  }
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
} finally { rmSync(tmp, { recursive: true, force: true }); }
