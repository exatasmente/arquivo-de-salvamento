// The reel of the sound that comes from objects, rendered offline in a headless Chrome (OfflineAudioContext), with the game's own audio code, the
// emitters of the layout (the same function as the video: src/audio/film-sounds.js) and a listener that walks a path:
//   node tools/sfx/reel-objetos.mjs --playwright <playwright-core folder> --out <som-objetos.mp3> [--chrome <Chrome>] [--report <json>]
//   1. the station: walks past the lamps, the dripping pipes and the pump, which runs;
//   2. the radio: Jonas goes toward it with the static on the bench and a line coming from it, then sits and both come to the front, centred and dry;
//   3. the steps: hall, stairs (a platform), grate, pavement;
//   4. the street: the relay of the traffic light, the wind at the grate of the shaft, the hum of the viaduct and its lamps.
// Each segment is its own context (its own room), joined with a short gap and brought to about -16 LUFS. It prints, for each segment, the level of
// the left and right channels (in dB) every second and the balance between them, and for chosen sources alone, so the panning can be read as numbers.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmEmitterEvents } from '../../src/audio/film-sounds.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = arg('playwright'), out = arg('out'); if (!pw || !out) { console.error('usage: see the head of this file'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(path.resolve(pw));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>reel</title>'); }
  const p = path.join(GAME, u);
  if (!p.startsWith(GAME) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: arg('chrome', '/usr/bin/google-chrome'), headless: true, args: ['--mute-audio', '--no-sandbox', '--use-angle=swiftshader'] });
const tmp = mkdtempSync(path.join(tmpdir(), 'reel-obj-'));
const json = (p) => JSON.parse(readFileSync(path.join(GAME, p), 'utf8'));
const GALERIA = json('data/scenes/galeria.json'), RUA = json('data/scenes/rua.json');

// ---- the listener's path: a polyline walked at a constant speed, looking where it goes ---------------------------------------------------------
const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
/** pts: [[x, z], ...]; the eye is 1.6 m up, looking along the path (smoothed over a metre). */
function walker(pts, speed, t0 = 0) {
  const seg = [], len = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; len.push(tot); }
  const at = (s) => { s = Math.max(0, Math.min(tot, s)); let i = 0; while (i < len.length - 1 && s > len[i]) i++; const s0 = i ? len[i - 1] : 0, u = seg[i] ? (s - s0) / seg[i] : 0; return lerp(pts[i], pts[i + 1], u); };
  const pos = (t) => at((t - t0) * speed);
  const eye = (t) => { const p = pos(t), q = at((t - t0) * speed + 1.0); let d = [q[0] - p[0], q[1] - p[1]]; if (Math.hypot(...d) < 1e-6) { const b = at((t - t0) * speed - 1.0); d = [p[0] - b[0], p[1] - b[1]]; } return { eye: [p[0], 1.6, p[1]], at: [p[0] + d[0], 1.6, p[1] + d[1]] }; };
  return { pos, camera: eye, duration: tot / speed };
}
const stepsAlong = (w, t0, t1, every, name, gain = 0.55) => { const ev = []; for (let t = t0; t < t1; t += every) { const p = w.pos(t); ev.push({ name, at: +t.toFixed(3), opts: { gain, pos: [p[0], 0.05, p[1]] } }); } return ev; };
const listenerEvents = (w, t0, t1, step = 0.25) => { const ev = []; for (let t = t0; t <= t1 + 1e-6; t += step) { const c = w.camera(t); ev.push({ name: 'ouvinte', at: +t.toFixed(3), opts: { pos: c.eye, dir: [c.at[0] - c.eye[0], 0, c.at[2] - c.eye[2]] } }); } return ev; };
/** The video's events of a layout for the stretch, as the reel's own { name, at, opts } (the video scales u by the length; here the length is the stretch). */
const emitterEvents = (layout, w, a, b, only = null) => {
  const evs = filmEmitterEvents({ layout: only ? { entities: layout.entities.filter((e) => only.includes(e.id)) } : layout, camera: w.camera, a, b });
  return evs.map((e) => ({ name: e.name, at: +(a + e.u * (b - a)).toFixed(3), opts: e.name === 'ouvinte' ? e.opts : { ...e.opts, ...(e.opts.dur ? { dur: e.opts.dur } : {}) } }));
};
/** The pump runs in this reel (the game turns it on when it is mended): the layout with it on. */
const running = (layout) => ({ ...layout, entities: layout.entities.map((e) => (e.id === 'bomba' ? { ...e, components: { ...e.components, sound: { ...e.components.sound, on: true } } } : e)) });

// ---- the segments --------------------------------------------------------------------------------------------------------------------------------
const SEG = [];
{ // 1. the station: from the corridor by the shaft, west past the drips, the lamps of the kitchen and the workshop, to the pump
  const w = walker([[6, 0.4], [-9, 0.3], [-11.4, -2.4]], 1.7), dur = Math.ceil(w.duration) + 1, L = running(GALERIA);
  SEG.push({ id: 'estacao-lampada-bomba-gota', room: 'galeria', dur, bed: 'ambiente', camera: w.camera,
    events: [...emitterEvents(L, w, 0, dur), ...stepsAlong(w, 0.3, w.duration, 0.55, 'passo', 0.5)],
    solo: [['lamp-oficina', 'a lamp (the workshop), alone'], ['bomba', 'the pump, alone'], ['goteira-1', 'a dripping pipe, alone']],
    layout: L, walker: w });
}
{ // 2. the radio: walks to the bench with the static from the radio and a line coming from it; sits; the static and the next line come to the front
  const radio = [-3.64, 0.92, -4.55], w = walker([[3.0, 1.2], [-1.2, 0.2], [-3.0, -3.0]], 1.4), sit = 5.6, dur = 10;
  SEG.push({ id: 'radio-do-aparelho-ao-banco', room: 'galeria', dur, bed: 'ambiente', camera: w.camera, radio, sit,
    events: [...listenerEvents(w, 0, sit), ...stepsAlong(w, 0.3, sit - 0.4, 0.66, 'passo', 0.5)], walker: w });
}
{ // 3. the steps by surface, one after the other, the listener a pace behind
  const w = walker([[-9, 3], [3, 3]], 1.5), ev = [], kinds = [['passo-hall', 3], ['passo-escada', 3], ['passo-grade', 3], ['passo-rua', 3]]; let t = 0.5;
  const seq = []; for (const [n, k] of kinds) for (let i = 0; i < k; i++) { seq.push([n, t]); t += 0.62; }
  for (const [n, at] of seq) { const p = w.pos(at); ev.push({ name: n, at, opts: { gain: 0.55, pos: [p[0], 0.05, p[1]] } }); }
  const behind = (tt) => { const c = w.camera(tt); return { eye: [c.eye[0] - 1.2, 1.6, c.eye[2]], at: [c.at[0] - 1.2, 1.6, c.at[2]] }; }, dur3 = Math.ceil(t) + 1;
  SEG.push({ id: 'passos-piso-escada-grade-calcada', room: 'galeria', dur: dur3, bed: null, camera: behind, events: [...listenerEvents({ camera: behind }, 0, dur3), ...ev], steps: seq, walker: w });
}
{ // 4. the street: east along the sidewalk, past the traffic light's relay, to the grate of the shaft; the viaduct over it all
  const w = walker([[-27, 5.0], [-12, 5.2], [-3.5, 7.6]], 2.0), dur = Math.ceil(w.duration) + 1;
  SEG.push({ id: 'rua-rele-vento-viaduto', room: 'rua', dur, bed: 'ambiente-rua', camera: w.camera,
    events: [...emitterEvents(RUA, w, 0, dur), ...stepsAlong(w, 0.3, w.duration, 0.5, 'passo-rua', 0.5)],
    solo: [['semaforo', 'the traffic light relay, alone'], ['boca-rua', 'the wind at the grate, alone'], ['viaduto', 'the viaduct, alone']], layout: RUA, walker: w });
}

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------
async function renderInPage({ base, seg, solo, parts, durationsUrl }) {
  const has = (p) => !parts || parts.includes(p);
  const A = await import(`${base}/src/audio/index.js`), V = await import(`${base}/src/audio/voices.js`);
  const ctx = new OfflineAudioContext(2, Math.ceil(seg.dur * 48000), 48000);
  const audio = A.createAudio(ctx, { seed: 7, room: seg.room });
  await audio.preload(audio.names);
  for (const n of ['zumbido-lampada', 'zumbido-quadro', 'bomba-motor', 'vento-grade', 'viaduto-vento', 'chiado', 'ambiente', 'ambiente-rua']) await audio.samples?.preload([n]);
  const play = (e) => audio.play(e.name, { ...e.opts, at: e.at });
  if (!solo && seg.bed && has('bed')) audio.play(seg.bed, { at: 0, dur: seg.dur, gain: 0.9 });
  for (const e of seg.events.filter((x) => x.name === 'ouvinte')) play(e);
  for (const e of seg.events.filter((x) => x.name !== 'ouvinte' && (has('steps') || !/^passo/.test(x.name)))) play(e);
  if (seg.radio && (!solo || parts)) {                          // the bench radio: its static from its place until he sits, a line from it, then the desk's own, close
    const durations = await fetch(durationsUrl).then((r) => r.json()), voices = V.createVoices(ctx, { durations, volume: 1, duck: audio.duck, spatial: audio.spatial });
    await voices.preload(['01', '02']);
    const sit = seg.sit, k = (t) => (t < sit ? 1 : Math.max(0, 1 - (t - sit) / 0.6));              // the emitter's level by the time (the game fades it over about half a second)
    const dist = (t) => { const c = seg.cams.find((x) => x.t >= t) ?? seg.cams.at(-1); return Math.hypot(c.eye[0] - seg.radio[0], c.eye[1] - seg.radio[1], c.eye[2] - seg.radio[2]); };
    const reach = (d, R) => { const n = R * 0.15, f = d <= n ? 1 : d >= R ? 0 : 1 - (d - n) / (R - n); return f * f; };
    const curve = seg.cams.map((c) => [c.t / seg.dur, 0.3 * reach(dist(c.t), 9) * k(c.t)]);
    if (has('static')) {
      audio.play('chiado', { at: 0, dur: seg.dur, gain: 0.3, pos: seg.radio, live: true, rolloff: 0.35, wet: 0.5, curve, seed: 11 });
      audio.play('chiado', { at: sit, dur: seg.dur - sit, gain: 0.12 });                                  // the desk's: his, centred, dry
    }
    const spot = [seg.radio[0], seg.radio[1] + 0.15, seg.radio[2]];
    if (has('line1')) { voices.setNear(0); voices.play('01', { at: 1.2, filter: 'radio', gain: 0.9, spot }); }
    if (has('line2')) { voices.setNear(1); voices.play('02', { at: sit + 0.9, filter: 'radio', gain: 0.9, spot }); }
    if (has('static')) audio.play('radio-tx', { at: sit - 0.2, gain: 0.3 });
  }
  await new Promise((r) => setTimeout(r, 80));
  const buf = await ctx.startRendering();
  const b64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  return { sr: 48000, l: b64(buf.getChannelData(0)), r: b64(buf.getChannelData(1)) };
}

const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const dB = (x) => +(20 * Math.log10(x + 1e-9)).toFixed(1);
/** The level of each channel every `win` seconds of a render, and the balance R minus L (positive: to the right). */
function balance(L, R, sr, win = 1) {
  const rows = [], n = Math.floor(sr * win);
  for (let s = 0; s + n <= L.length; s += n) { let a = 0, b = 0; for (let i = s; i < s + n; i++) { a += L[i] * L[i]; b += R[i] * R[i]; } const l = Math.sqrt(a / n), r = Math.sqrt(b / n); rows.push({ t: +(s / sr).toFixed(1), L: dB(l), R: dB(r), balance: +(dB(r) - dB(l)).toFixed(1) }); }
  return rows;
}
const measure = (file) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }); return Number((String(r.stderr).match(/\n\s+I:\s+(-?[0-9.]+) LUFS/g) ?? []).pop()?.match(/-?[0-9.]+(?= LUFS)/)?.[0]); };

try {
  const page = await browser.newPage(); await page.goto(`${origin}/blank`);
  const durationsUrl = `${origin}/assets/audio/n1/durations.json`, report = { segments: {} }, files = [];
  for (const seg of SEG) {
    seg.cams = Array.from({ length: Math.ceil(seg.dur / 0.25) + 1 }, (_, i) => ({ t: i * 0.25, ...seg.camera(i * 0.25) }));
    if (seg.id.startsWith('radio')) { /* the radio's own events are made in the page */ }
    const send = { ...seg, layout: undefined, walker: undefined, camera: undefined };
    const r = await page.evaluate(renderInPage, { base: origin, seg: send, solo: false, durationsUrl });
    const L = f32(r.l), R = f32(r.r), inter = new Float32Array(L.length * 2); for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
    const raw = path.join(tmp, `${seg.id}.raw`), wav = path.join(tmp, `${seg.id}.wav`); writeFileSync(raw, Buffer.from(inter.buffer));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', raw, '-c:a', 'pcm_f32le', wav]); files.push(wav);
    report.segments[seg.id] = { seconds: seg.dur, mix: balance(L, R, r.sr), solo: {} };
    if (seg.radio) for (const [part, label] of [['static', 'the static: from the radio, then the desk\'s own, centred'], ['line1', 'a line while he walks: from the radio'], ['line2', 'a line once he sits: close, centred']]) {
      const rs = await page.evaluate(renderInPage, { base: origin, seg: send, solo: true, parts: [part], durationsUrl }), sl = f32(rs.l), sr_ = f32(rs.r);
      report.segments[seg.id].solo[part] = { label, at: seg.radio, rows: balance(sl, sr_, rs.sr) };
    }
    // each chosen source alone (no bed, no steps): its pan over the walk
    for (const [id, label] of seg.solo ?? []) {
      const own = seg.layout.entities.find((e) => e.id === id), ev = [...emitterEvents(seg.layout, { camera: seg.walker.camera }, 0, seg.dur, [id])];
      const rs = await page.evaluate(renderInPage, { base: origin, seg: { ...send, events: ev, bed: null, radio: null }, solo: true, parts: ['emitters'], durationsUrl });
      const sl = f32(rs.l), sr_ = f32(rs.r);
      report.segments[seg.id].solo[id] = { label, at: own.pos, rows: balance(sl, sr_, rs.sr) };
    }
  }
  // join: a short silence between segments, then -16 LUFS integrated with a limiter under the peaks
  const gap = path.join(tmp, 'gap.wav'), list = path.join(tmp, 'list.txt'), joined = path.join(tmp, 'all.wav'), lim = path.join(tmp, 'lim.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.6', '-c:a', 'pcm_f32le', gap]);
  writeFileSync(list, files.flatMap((f, i) => (i ? [`file '${gap}'`, `file '${f}'`] : [`file '${f}'`])).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_f32le', joined]);
  let gain = -16 - measure(joined); if (!Number.isFinite(gain)) throw new Error('could not measure the loudness');
  for (let k = 0; k < 3; k++) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', joined, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=3:release=60:level=false`, '-c:a', 'pcm_f32le', lim]);
    const got = measure(lim); if (!Number.isFinite(got)) throw new Error('could not measure the loudness'); if (Math.abs(got + 16) < 0.15) break; gain += -16 - got;
  }
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', lim, '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '192k', path.resolve(out)]);
  report.loudness = { lufs: measure(lim), gainDb: +gain.toFixed(1) }; report.file = path.resolve(out);
  report.seconds = +(SEG.reduce((a, s) => a + s.dur, 0) + 0.6 * (SEG.length - 1)).toFixed(1);
  if (arg('report')) writeFileSync(arg('report'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ seconds: report.seconds, loudness: report.loudness, file: report.file }));
} finally { await browser.close(); server.close(); rmSync(tmp, { recursive: true, force: true }); }
