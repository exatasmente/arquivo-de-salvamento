// The A/B reel and the level calibration of the game's sound, rendered offline in a headless Chrome (OfflineAudioContext).
//   node tools/sfx/reel.mjs --playwright <playwright-core folder> --old <folder with the old src/audio and vendor/engine> --out <folder> [--chrome <Chrome>]
//   node tools/sfx/reel.mjs --calibrate ...        (prints, for each recorded sound, how far its level is from the synthesised one it replaces)
// The "before" reel is the game's old sound (22.05 kHz, the era chain on, synthesised only, one short room), the "after" is the new one
// (48 kHz, no era chain, recordings, a room per place, distance, the voice on top). The same events in the same order. Both are brought to
// about -16 LUFS. The browser is closed whatever happens.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = arg('playwright'), oldDir = arg('old') && path.resolve(arg('old')), outDir = path.resolve(arg('out', '.')), calibrate = process.argv.includes('--calibrate');
if (!pw || (!oldDir && !calibrate)) { console.error('usage: see the head of this file'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(path.resolve(pw));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>reel</title>'); }
  let root = GAME, rel = u.replace(/^\/new\//, '');
  if (u.startsWith('/old/')) { rel = u.slice(5); root = rel.startsWith('assets/') ? GAME : oldDir; }
  const p = path.join(root, rel);
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: arg('chrome', '/usr/bin/google-chrome'), headless: true, args: ['--mute-audio', '--no-sandbox', '--use-angle=swiftshader'] });
const tmp = mkdtempSync(path.join(tmpdir(), 'reel-'));

// ---- what the reel plays ------------------------------------------------------------------------------------------------------------------------
// `old`: what plays in the old game where the new one has a sound that did not exist (a step on a grate was a 'passo').
const dog = (z0, z1, n, t0, dt, name = 'cao-rolar') => Array.from({ length: n }, (_, i) => ({ name, at: t0 + i * dt, opts: { gain: 0.75, pos: [-4 + i * 0.4, 1, z0 + (z1 - z0) * (i / Math.max(1, n - 1))] } }));
const SEGMENTS = [
  { id: 'estacao-ambiente', room: 'estacao', dur: 7, events: [{ name: 'ambiente', at: 0, opts: { dur: 7, gain: 0.9 } }] },
  { id: 'passos', room: 'estacao', dur: 8.5, events: [
    ...[0.3, 0.95, 1.6].map((at) => ({ name: 'passo', at, opts: { gain: 0.55 } })),
    ...[2.6, 3.25, 3.9].map((at) => ({ name: 'passo-grade', old: 'passo', at, opts: { gain: 0.55 } })),
    ...[4.9, 5.55, 6.2].map((at) => ({ name: 'passo-escada', old: 'passo', at, opts: { gain: 0.55 } })),
  ] },
  { id: 'passos-rua', room: 'rua', dur: 3.2, events: [0.3, 0.95, 1.6, 2.25].map((at) => ({ name: 'passo-rua', at, opts: { gain: 0.55 } })) },
  { id: 'radio', room: 'estacao', dur: 9, events: [
    { name: 'radio-sintonia', old: 'ui-move', at: 0.2, opts: { gain: 0.3 } }, { name: 'ui-move', at: 1.3, opts: { gain: 0.5 } },
    { name: 'radio-tx', at: 1.8, opts: { gain: 0.35 } }, { name: 'chiado', at: 2.0, opts: { dur: 6.5, gain: 0.12 } },
    { voice: '01', at: 2.5, filter: 'radio', gain: 0.9 }, { name: 'radio-solta', at: 6.4, opts: { gain: 0.4 } },
  ] },
  { id: 'cabo-emenda', room: 'estacao', dur: 6, events: [
    ...[0.3, 0.9, 1.5].map((at) => ({ name: 'cabo-puxa', at, opts: { gain: 0.5 } })),
    { name: 'consertar', at: 2.4, opts: { gain: 0.8 } }, { name: 'cabo-puxa', at: 3.5, opts: { gain: 0.5 } }, { name: 'cabo-solta', at: 4.3, opts: { gain: 0.8 } },
  ] },
  { id: 'isca', room: 'rua', dur: 6.5, events: [
    { name: 'isca-lanca', at: 0.2, opts: { gain: 0.8, pos: [2, 1, -3] } }, { name: 'isca-cai', at: 0.8, opts: { gain: 0.9, pos: [3, 1, -9] } },
    ...[1.8, 2.8, 3.8, 4.8].map((at) => ({ name: 'isca-estalo', at, opts: { gain: 0.7, pos: [3, 1, -9] } })),
  ] },
  { id: 'cao', room: 'rua', dur: 9, events: [
    ...dog(-14, -9, 4, 0.3, 0.48), { name: 'cao-desconfiado', at: 2.6, opts: { gain: 0.9, pos: [-3, 1, -8] } }, { name: 'cao-busca', at: 3.4, opts: { gain: 0.8, pos: [-3, 1, -8] } },
    { name: 'cao-caca', at: 5.2, opts: { gain: 0.9, pos: [-2, 1, -6] } }, ...dog(-6, -2, 3, 6.4, 0.4),
  ] },
  { id: 'reacao', room: 'estacao', dur: 4.5, events: [
    { name: 'reacao-abre', at: 0.2, opts: { gain: 0.6 } }, { name: 'reacao-acerto', at: 1.1, opts: { gain: 0.7 } },
    { name: 'reacao-abre', at: 2.3, opts: { gain: 0.6 } }, { name: 'reacao-erro', at: 3.2, opts: { gain: 0.7 } },
  ] },
  { id: 'rua-ambiente', room: 'rua', dur: 8, events: [{ name: 'ambiente-rua', at: 0, opts: { dur: 8, gain: 0.9 } }, ...[3.2, 3.9, 4.6].map((at) => ({ name: 'passo-rua', at, opts: { gain: 0.55 } }))] },
];

// ---- the page: one OfflineAudioContext for each segment and each version --------------------------------------------------------------------------
async function renderInPage({ base, variant, seg, durationsUrl }) {
  const old = variant === 'old', SR = old ? 22050 : 48000;
  const A = await import(`${base}/src/audio/index.js`), V = await import(`${base}/src/audio/voices.js`);
  const ctx = new OfflineAudioContext(2, Math.ceil(seg.dur * SR), SR);
  const room = old ? (seg.room === 'rua' ? 'rua' : 'galeria') : seg.room;
  const audio = A.createAudio(ctx, { seed: 7, room, ...(old ? {} : {}) });
  const durations = await fetch(durationsUrl).then((r) => r.json());
  const voices = V.createVoices(ctx, { durations, volume: 1, ...(old ? {} : { duck: audio.duck }) });
  if (!old) { await audio.preload(audio.names); audio.setListener([0, 1.6, 0], [0, 0, -1]); }
  const ids = seg.events.filter((e) => e.voice).map((e) => e.voice); await voices.preload(ids);
  for (const e of seg.events) {
    if (e.voice) voices.play(e.voice, { at: e.at, filter: e.filter, gain: e.gain });
    else audio.play(old ? (e.old ?? e.name) : e.name, { ...e.opts, at: e.at });
  }
  await new Promise((r) => setTimeout(r, 80));
  const buf = await ctx.startRendering();
  const b64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  return { sr: SR, l: b64(buf.getChannelData(0)), r: b64(buf.getChannelData(1)) };
}
async function calibrateInPage({ base }) {
  const A = await import(`${base}/src/audio/index.js`), S = await import(`${base}/src/audio/samples.js`);
  const out = {};
  const measure = (buf, from = 0) => {
    const d = buf.getChannelData(0), w = 2400; let peak = 0, sum = 0, n = 0;
    for (let i = from; i + w < d.length; i += w / 2) { let s = 0; for (let j = 0; j < w; j++) s += d[i + j] * d[i + j]; const r = Math.sqrt(s / w); peak = Math.max(peak, r); sum += s; n += w; }
    return { peak: 20 * Math.log10(peak + 1e-9), rms: 10 * Math.log10(sum / Math.max(1, n) + 1e-12) };
  };
  for (const name of S.SAMPLE_NAMES) {
    const rt = S.ROUTES[name], res = {};
    for (const mode of ['synth', 'sample']) {
      const vals = [];
      for (const seed of [1, 2, 3]) {
        const ctx = new OfflineAudioContext(1, 48000 * 8, 48000), audio = A.createAudio(ctx, { seed, samples: mode === 'sample' });
        if (mode === 'sample') await audio.preload([name]);
        audio.setRoom('estacao');
        if (mode === 'synth' && !A.NAMES.includes(name)) continue;
        const dur = audio.play(name, { at: 0.1, gain: 1, ...(rt.loop ? { dur: 6 } : {}), seed, sample: mode === 'sample' ? undefined : false });
        const buf = await ctx.startRendering(); vals.push({ ...measure(buf), dur });
      }
      if (vals.length) res[mode] = { peak: vals.reduce((a, v) => a + v.peak, 0) / vals.length, rms: vals.reduce((a, v) => a + v.rms, 0) / vals.length, dur: vals[0].dur };
    }
    out[name] = res;
  }
  return out;
}

// ---- the metrics: spectral centroid and bandwidth ----------------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
/** Energy-weighted spectral centroid and the frequencies under which 95% and 99% of the energy lies, of a mono Float32Array at `sr`. */
function spectrum(x, sr) {
  const N = 2048, win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)), acc = new Float64Array(N / 2);
  for (let s = 0; s + N <= x.length; s += N / 2) {
    let e = 0; for (let i = 0; i < N; i++) e += x[s + i] * x[s + i];
    if (e / N < 1e-9) continue;                                        // silence is not part of the sound
    const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im); for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  let tot = 0, cen = 0; for (let k = 1; k < N / 2; k++) { tot += acc[k]; cen += acc[k] * k * sr / N; }
  const at = (p) => { let c = 0; for (let k = 1; k < N / 2; k++) { c += acc[k]; if (c >= tot * p) return k * sr / N; } return sr / 2; };
  let ss = 0, pk = 0; for (let i = 0; i < x.length; i++) { ss += x[i] * x[i]; pk = Math.max(pk, Math.abs(x[i])); }
  return { centroid: Math.round(cen / (tot || 1)), bw95: Math.round(at(0.95)), bw99: Math.round(at(0.99)), rmsDb: +(10 * Math.log10(ss / x.length + 1e-12)).toFixed(1), peakDb: +(20 * Math.log10(pk + 1e-9)).toFixed(1) };
}
const readF32 = (file) => { const b = readFileSync(file); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };

try {
  const page = await browser.newPage(); await page.goto(`${origin}/blank`);
  if (calibrate) {
    const res = await page.evaluate(calibrateInPage, { base: `${origin}/new` });
    for (const [n, r] of Object.entries(res)) {
      if (!r.sample) { console.log(`${n.padEnd(18)} no recording`); continue; }
      const d = r.synth ? `peak ${(r.synth.peak - r.sample.peak).toFixed(1)} dB, rms ${(r.synth.rms - r.sample.rms).toFixed(1)} dB` : 'no synth';
      console.log(`${n.padEnd(18)} sample peak ${r.sample.peak.toFixed(1)} rms ${r.sample.rms.toFixed(1)} | synth minus sample: ${d}`);
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    const report = {};
    for (const variant of ['old', 'new']) {
      const base = `${origin}/${variant}`, files = [], seg2 = [];
      for (const seg of SEGMENTS) {
        const r = await page.evaluate(renderInPage, { base, variant, seg, durationsUrl: `${origin}/${variant}/assets/audio/n1/durations.json` });
        const l = path.join(tmp, `${variant}-${seg.id}.f32`); writeFileSync(l, Buffer.concat([Buffer.from(r.l, 'base64'), Buffer.from(r.r, 'base64')]));
        // resample both channels to 48 kHz as planar -> interleaved stereo wav
        const n = Buffer.from(r.l, 'base64').length / 4, L = new Float32Array(Buffer.from(r.l, 'base64').buffer.slice(0, n * 4)), R = new Float32Array(Buffer.from(r.r, 'base64').buffer.slice(0, n * 4));
        const inter = new Float32Array(n * 2); for (let i = 0; i < n; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
        const raw = path.join(tmp, `${variant}-${seg.id}.raw`), wav = path.join(tmp, `${variant}-${seg.id}.wav`); writeFileSync(raw, Buffer.from(inter.buffer));
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(r.sr), '-ac', '2', '-i', raw, '-ar', '48000', '-c:a', 'pcm_f32le', wav]);
        files.push(wav);
        const mono = path.join(tmp, `${variant}-${seg.id}.mono`);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', '-f', 'f32le', mono]);
        seg2.push({ id: seg.id, ...spectrum(readF32(mono), 48000) });
      }
      // join: a short silence between segments, then -16 LUFS in two passes
      const list = path.join(tmp, `${variant}.txt`), gap = path.join(tmp, 'gap.wav');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.5', '-c:a', 'pcm_f32le', gap]);
      writeFileSync(list, files.flatMap((f) => [`file '${f}'`, `file '${gap}'`]).join('\n'));
      const joined = path.join(tmp, `${variant}-all.wav`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_f32le', joined]);
      // -16 LUFS integrated: measure, apply the gain, and keep the peaks under -1 dBFS with a limiter (loudnorm alone stops short on a reel with this much range)
      let text = ''; try { execFileSync('ffmpeg', ['-hide_banner', '-i', joined, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { text = String(e.stderr); }
      const measure = (file) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }); return Number((String(r.stderr).match(/\n\s+I:\s+(-?[0-9.]+) LUFS/g) ?? []).pop()?.match(/-?[0-9.]+/)?.[0] ?? NaN); };
      const mp3 = path.join(outDir, `som-geral-${variant === 'old' ? 'antes' : 'depois'}.mp3`), lim = path.join(tmp, `${variant}-lim.wav`);
      let gain = -16 - measure(joined);
      if (!Number.isFinite(gain)) throw new Error('could not measure the loudness');
      for (let k = 0; k < 3; k++) {          // the limiter takes a little off: correct until the limited reel is at -16
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', joined, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=3:release=60:level=false`, '-c:a', 'pcm_f32le', lim]);
        const got = measure(lim); if (!Number.isFinite(got)) throw new Error('could not measure the loudness'); if (Math.abs(got + 16) < 0.15) break; gain += -16 - got;
      }
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', lim, '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
      const whole = path.join(tmp, `${variant}-mono.f32`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-ac', '1', '-f', 'f32le', whole]);
      report[variant] = { overall: spectrum(readF32(whole), 48000), segments: seg2, file: mp3 };
    }
    console.log(JSON.stringify(report, null, 1));
  }
} finally { await browser.close(); server.close(); rmSync(tmp, { recursive: true, force: true }); }
