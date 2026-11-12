// Live music for Rinha. The instruments and the sound come from synth-cues.js (sampler-like
// oscillators, cut treble, a big reverb); here they play on a running AudioContext, one cue
// per moment, crossfading when the cue changes. Everything is procedural: the same seed gives
// the same melody. No Math.random, no files, no samples.
//
//   const music = createMusic(ctx);   // ctx: AudioContext (or OfflineAudioContext in tests)
//   music.resume();                   // call from a user gesture
//   music.setSeed(campaignSeed);
//   music.play('luta'); music.duck(true); music.stop();
//
// Cues: casa, pomar, captura, flashes, cela, treino, ringue, luta, vitoria, gameover, menu,
// cartao. vitoria and gameover play once; the others loop until another cue replaces them.

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const pick = (r, list) => list[Math.floor(r() * list.length)];
const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

function env(g, t, a, peak, hold, rel) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}

// ---- instruments (from synth-cues.js, plus a rhythm section) -------------------------------
const I = {
  pad(A, out, note, t, dur, vol = 0.12, cutoff = 1100) {
    const { ctx } = A; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    for (const d of [-7, 0, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(note); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 2.6); }
    f.connect(g).connect(out); env(g, t, Math.min(1.2, dur / 3), vol, Math.max(0, dur - 1.2), 2.2);
  },
  bell(A, out, note, t, vol = 0.18, decay = 2.8) {
    const { ctx } = A; const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = hz(note); m.frequency.value = hz(note) * 3.5;
    mg.gain.setValueAtTime(hz(note) * 2.2, t); mg.gain.exponentialRampToValueAtTime(hz(note) * 0.05, t + decay);
    m.connect(mg).connect(c.frequency); c.connect(g).connect(out);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    c.start(t); m.start(t); c.stop(t + decay); m.stop(t + decay);
  },
  pluck(A, out, note, t, vol = 0.14, type = 'square', len = 0.9) {
    const { ctx } = A; const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = hz(note); f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + len * 0.65);
    o.connect(f).connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o.stop(t + len + 0.1);
  },
  flute(A, out, note, t, dur, vol = 0.11) {
    const { ctx } = A; const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(note); v.frequency.value = 5; vg.gain.value = hz(note) * 0.008;
    v.connect(vg).connect(o.frequency); f.type = 'lowpass'; f.frequency.value = 2200;
    o.connect(f).connect(g).connect(out); env(g, t, 0.08, vol, Math.max(0, dur - 0.2), 0.35);
    o.start(t); v.start(t); o.stop(t + dur + 0.5); v.stop(t + dur + 0.5);
  },
  choir(A, out, note, t, dur, vol = 0.07) {
    const { ctx } = A; const g = ctx.createGain();
    for (const d of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(note); o.detune.value = d;
      for (const [fq, q] of [[700, 6], [1150, 8]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fq; b.Q.value = q; o.connect(b).connect(g); }
      o.start(t); o.stop(t + dur + 3);
    }
    g.connect(out); env(g, t, Math.min(1.5, dur / 2), vol, Math.max(0, dur - 1.5), 2.5);
  },
  bass(A, out, note, t, dur, vol = 0.22, type = 'triangle') {
    const { ctx } = A; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = hz(note);
    let node = o;
    if (type !== 'triangle' && type !== 'sine') { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; o.connect(f); node = f; }
    node.connect(g).connect(out); env(g, t, 0.015, vol, Math.max(0, dur - 0.25), 0.3); o.start(t); o.stop(t + dur + 0.6);
  },
  hum(A, out, t, dur, vol = 0.025) {
    const { ctx } = A; const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120; f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 3;
    o.connect(f).connect(g).connect(out); env(g, t, 0.4, vol, Math.max(0, dur - 0.8), 0.4); o.start(t); o.stop(t + dur + 0.5);
  },
  wind(A, out, t, dur, vol = 0.12, base = 500) {
    const { ctx } = A; const s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const pre = A.el > 0 ? 1 : 0; t -= pre; dur += pre; // overlaps the previous block so there is no dip at the join
    const a = pre || Math.min(1.5, dur / 3);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; const g = ctx.createGain();
    for (let k = 0; k <= dur; k += 1) f.frequency.linearRampToValueAtTime(base * (1 + 0.6 * Math.sin((k + A.el) * 0.9 + 1) * Math.sin((k + A.el) * 0.37)), t + k);
    s.connect(f).connect(g).connect(out); env(g, t, a, vol, Math.max(0, dur - a - 1), 1); s.start(t); s.stop(t + dur + 0.5);
  },
  thump(A, out, t, vol = 0.5) {
    const { ctx } = A; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    o.connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.start(t); o.stop(t + 0.3);
  },
  kick(A, out, t, vol = 0.5) {
    const { ctx } = A; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.35);
  },
  noiseHit(A, out, t, dur, type, freq, vol, q = 0.8) {
    const { ctx } = A; const s = ctx.createBufferSource(); s.buffer = A.noise; const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, (t * 0.37) % 1.2); s.stop(t + dur + 0.02);
  },
  snare(A, out, t, vol = 0.25) { I.noiseHit(A, out, t, 0.16, 'bandpass', 1800, vol, 0.7); const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.value = 190; o.connect(g).connect(out); g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.start(t); o.stop(t + 0.12); },
  hat(A, out, t, vol = 0.06) { I.noiseHit(A, out, t, 0.045, 'highpass', 5500, vol, 0.5); },
  /** Dry, short, cracking impact: used by the capture and the flashes. */
  impact(A, out, t, vol = 0.6) {
    I.noiseHit(A, out, t, 0.35, 'lowpass', 2200, vol * 0.8, 0.5);
    I.noiseHit(A, out, t, 0.06, 'highpass', 3000, vol * 0.6, 0.5);
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.5);
    o.connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.start(t); o.stop(t + 0.65);
  },
  stab(A, out, notes, t, dur, vol = 0.07, cutoff = 1800) {
    const { ctx } = A; const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(350, t + dur);
    for (const n of notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = (n % 3 - 1) * 6; o.connect(f); o.start(t); o.stop(t + dur + 0.1); }
    f.connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  /** Low animal-ish rumble (noise through a slow low-pass), used as a bed. */
  rumble(A, out, t, dur, vol = 0.1, base = 110) {
    const { ctx } = A; const s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = base; f.Q.value = 2;
    s.connect(f).connect(g).connect(out); env(g, t, dur * 0.4, vol, dur * 0.2, dur * 0.4); s.start(t, (t * 0.53) % 1.1); s.stop(t + dur + 0.1);
  },
};

// ---- cues -----------------------------------------------------------------------------------
// Each cue: block = seconds scheduled per call (whole bars for rhythmic ones); fn(A, t0, r, S)
// fills [t0, t0 + block]. S.el = seconds since the cue started, S.blk = block index, S.q =
// per-seed constants (same melody in every block of one campaign), S.once = block 0 only.
const bpmBar = (bpm) => 240 / bpm;
const minorScale = (root) => [0, 3, 5, 7, 10, 12, 15].map((n) => root + n);
const majorPenta = (root) => [0, 2, 4, 7, 9, 12, 14].map((n) => root + n);

const CUES = {
  casa: { block: 12, fadeIn: 2.5, fn(A, t0, r, S) {
    const dur = 12, root = S.q.root, mus = A.bus(0.6), dry = A.bus(0.3);
    I.pad(A, mus, root, t0, dur, 0.05, 420); I.pad(A, mus, root + 7, t0, dur, 0.03, 420);
    I.wind(A, A.bus(0.3), t0, dur, 0.05, 360);
    for (let k = 0; k < 2; k++) I.rumble(A, dry, t0 + 1 + k * 5 + r() * 2, 2.4 + r(), 0.16, 90 + r() * 50); // stomach
    for (let t = t0 + 0.5; t < t0 + dur; t += 3 + r() * 3.5) I.bell(A, A.bus(0.9, r() - 0.5), pick(r, minorScale(root + 36)), t, 0.045, 3);
    for (let t = t0 + 0.2; t < t0 + dur; t += 2.1) { I.thump(A, dry, t, 0.1); I.thump(A, dry, t + 0.24, 0.06); }
    I.hum(A, A.bus(0.2), t0, dur, 0.012);
  } },
  pomar: { block: 12, fadeIn: 2, fn(A, t0, r, S) {
    const dur = 12, root = S.q.root + 9, mus = A.bus(0.6), dry = A.bus(0.3);
    const tn = (t) => Math.min(1, (S.el + (t - t0)) / 55); // tension grows with the time in the cue
    const t1 = tn(t0 + dur / 2);
    I.wind(A, A.bus(0.4), t0, dur, 0.05 + 0.07 * t1, 520 - 160 * t1);
    I.pad(A, mus, root, t0, dur, 0.045, 600 + 500 * t1); I.pad(A, mus, root + 7, t0, dur, 0.03, 700);
    I.pad(A, mus, root + 6 + (t1 > 0.6 ? 1 : 0), t0, dur, 0.015 + 0.05 * t1, 900); // tritone creeps in
    // dusk melody: sparse flute that thins out as the tension rises
    const sc = minorScale(root + 24);
    for (let k = 0, t = t0 + 0.6; t < t0 + dur - 1; k++, t += 2.4 + r() * 1.6 + 3 * t1) if (r() < 1 - 0.7 * t1) I.flute(A, A.bus(0.7, 0.2), sc[S.q.phrase[(S.blk * 4 + k) % 16] % 7], t, 1.4, 0.07);
    // heartbeat speeds up and gets louder
    for (let t = t0 + 0.3; t < t0 + dur; ) {
      const k = tn(t), gap = 1.5 - 0.85 * k;
      I.thump(A, dry, t, 0.06 + 0.3 * k); I.thump(A, dry, t + 0.22, 0.04 + 0.2 * k); t += gap;
    }
    if (t1 > 0.4) for (const n of [root + 12, root + 18]) I.pad(A, A.bus(0.7), n + (r() < 0.5 ? 0 : 1), t0 + dur - 4, 3, 0.02 + 0.03 * t1, 2400);
  } },
  captura: { block: 12, fadeIn: 0.02, fn(A, t0, r, S) {
    const dur = 12, low = A.bus(0.5), dry = A.bus(0.25);
    if (S.blk === 0) { I.impact(A, dry, t0 + 0.03, 0.8); I.impact(A, A.bus(0.7), t0 + 0.04, 0.3); }
    I.pad(A, low, 24, t0, dur, S.blk === 0 ? 0.1 : 0.09, 280); I.pad(A, low, 31, t0, dur, 0.05, 300); I.bass(A, low, 29, t0, dur, 0.07);
    I.wind(A, A.bus(0.4), t0, dur, 0.06, 280);
    for (let t = t0 + (S.blk === 0 ? 2.5 : 1); t < t0 + dur; t += 3 + r() * 3) I.thump(A, dry, t, 0.25);
  } },
  flashes: { block: 12, fadeIn: 0.02, fn(A, t0, r, S) {
    const dur = 12, low = A.bus(0.5), dry = A.bus(0.3);
    I.pad(A, low, 26, t0, dur, 0.09, 300); I.pad(A, low, 32, t0, dur, 0.04, 380); I.hum(A, A.bus(0.2), t0, dur, 0.02);
    // short strobe hits with a dissonant metal sting, then silence, as the cuts do in the film
    for (let t = t0 + 0.05; t < t0 + dur - 0.5; t += 1.1 + r() * 1.5) {
      I.impact(A, dry, t, 0.5); I.bell(A, A.bus(0.8, r() * 1.2 - 0.6), pick(r, [78, 79, 84, 85]) + 0, t + 0.02, 0.05, 1.4);
    }
  } },
  cela: { block: 12, fadeIn: 2, fn(A, t0, r, S) {
    const dur = 12, root = S.q.root, mus = A.bus(0.6);
    I.pad(A, mus, root, t0, dur, 0.07, 700); I.pad(A, mus, root + 7, t0, dur, 0.05, 700);
    I.hum(A, A.bus(0.3), t0, dur, 0.026);
    const sc = [0, 3, 5, 7, 10, 12].map((n) => root + 24 + n);
    for (let t = t0 + 0.8; t < t0 + dur - 0.5; t += 1.6 + r() * 2.4) I.bell(A, A.bus(0.8, r() * 1.2 - 0.6), pick(r, sc), t, 0.075);
    if (S.blk % 2 === 1) I.choir(A, mus, root + 25 + Math.floor(r() * 3), t0 + 2 + r() * 4, 4, 0.05);
    for (let t = t0 + 3 + r() * 3; t < t0 + dur; t += 4 + r() * 5) I.pluck(A, A.bus(0.9), 96 + Math.floor(r() * 3), t, 0.035, 'sine', 0.35); // drip
  } },
  treino: { bpm: 104, bars: 4, fadeIn: 0.6, fn(A, t0, r, S) {
    const bar = bpmBar(104), beat = bar / 4, q = S.q, mus = A.bus(0.3), lead = A.bus(0.4, 0.2), dry = A.bus(0.1);
    const prog = q.prog;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * bar, ch = prog[(S.blk * 4 + b) % prog.length];
      for (const n of ch.notes) I.pad(A, mus, n, t, bar, 0.025, 1300);
      for (let k = 0; k < 8; k++) I.hat(A, dry, t + k * beat / 2, k % 2 ? 0.035 : 0.05);
      I.kick(A, dry, t, 0.34); I.kick(A, dry, t + 2 * beat, 0.3); if (b % 2) I.kick(A, dry, t + 3.5 * beat, 0.2);
      I.snare(A, dry, t + beat, 0.12); I.snare(A, dry, t + 3 * beat, 0.14);
      for (let k = 0; k < 4; k++) I.bass(A, mus, ch.root + (k === 3 ? 7 : 0), t + k * beat, beat * 0.8, 0.14, 'sawtooth');
      for (let k = 0; k < 8; k++) { const n = q.phrase[(b * 8 + k) % 16]; if (k % 2 === 0 || q.riff[k]) I.pluck(A, lead, ch.root + 24 + [0, 3, 5, 7, 10, 12, 15, 17][n % 8], t + k * beat / 2, 0.05, 'square', 0.3); }
    }
  } },
  ringue: { bpm: 96, bars: 4, fadeIn: 0.8, fn(A, t0, r, S) {
    const bar = bpmBar(96), beat = bar / 4, q = S.q, mus = A.bus(0.5), dry = A.bus(0.15);
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * bar, k = Math.min(1, (S.el + b * bar) / 30), ch = q.prog[(S.blk * 4 + b) % q.prog.length];
      I.pad(A, mus, ch.root - 12, t, bar, 0.05 + 0.03 * k, 400);
      for (let i = 0; i < 4; i++) { I.kick(A, dry, t + i * beat, 0.3 + 0.2 * k); }
      I.thump(A, dry, t + 0.5 * beat, 0.1);
      if (b === 0 || k > 0.5) I.stab(A, mus, [ch.root, ch.root + 3, ch.root + 7], t, beat * 1.6, 0.05 + 0.04 * k, 900 + 900 * k);
      if (b === 3) for (let i = 0; i < 8; i++) I.snare(A, dry, t + 2 * beat + i * beat / 4, 0.04 + 0.014 * i * (0.5 + k));
      I.rumble(A, A.bus(0.4), t, bar, 0.12 + 0.1 * k, 140);
    }
  } },
  luta: { bpm: 124, bars: 4, fadeIn: 0.3, fn(A, t0, r, S) {
    const bar = bpmBar(124), beat = bar / 4, q = S.q, mus = A.bus(0.25), lead = A.bus(0.35, -0.2), dry = A.bus(0.12);
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * bar, ch = q.prog[(S.blk * 4 + b) % q.prog.length], root = ch.root - 12;
      for (let i = 0; i < 4; i++) I.kick(A, dry, t + i * beat, 0.46);
      I.snare(A, dry, t + beat, 0.2); I.snare(A, dry, t + 3 * beat, 0.22);
      for (let k = 0; k < 16; k++) I.hat(A, dry, t + k * beat / 4, k % 4 === 2 ? 0.05 : 0.025);
      for (let k = 0; k < 8; k++) I.bass(A, mus, root + (k % 4 === 3 ? 12 : 0), t + k * beat / 2, beat * 0.45, 0.17, 'sawtooth');
      I.stab(A, mus, ch.notes, t + 1.5 * beat, beat * 0.7, 0.06, 2000); I.stab(A, mus, ch.notes, t + 3.5 * beat, beat * 0.5, 0.05, 1800);
      I.pad(A, mus, root + 12, t, bar, 0.03, 600);
      for (let k = 0; k < 8; k++) if (q.riff[k] || k % 4 === 0) I.pluck(A, lead, ch.root + 12 + [0, 3, 5, 7, 10, 12, 15, 17][q.phrase[(b * 8 + k) % 16] % 8], t + k * beat / 2, 0.05, 'square', 0.25);
    }
  } },
  vitoria: { block: 7, once: true, fadeIn: 0.05, fn(A, t0, r, S) {
    const k = S.q.root + 24, A1 = A.bus(0.6, 0.15), mus = A.bus(0.6);
    // rising line with a held major chord: root, fifth, third (octave up), sixth, octave
    const line = [[0, 0], [7, 0.28], [16, 0.56], [21, 0.9], [24, 1.3]];
    for (const [n, d] of line) { I.flute(A, A1, k + n, t0 + d, d === 1.3 ? 3.2 : 0.3, 0.1); I.pluck(A, A1, k + n + 12, t0 + d, 0.05, 'square', 0.5); }
    for (const n of [0, 4, 7, 12]) I.pad(A, mus, k - 12 + n, t0 + 1.3, 3.6, 0.04, 1500);
    I.choir(A, mus, k + 4, t0 + 1.3, 3.2, 0.05); I.bass(A, mus, k - 24, t0, 4.5, 0.18);
    I.bell(A, A.bus(0.8), k + 36, t0 + 1.3, 0.07, 3.2); I.kick(A, A.bus(0.1), t0, 0.35); I.kick(A, A.bus(0.1), t0 + 1.3, 0.4);
  } },
  gameover: { block: 8, once: true, fadeIn: 0.05, fn(A, t0, r, S) {
    const k = S.q.root + 24, mus = A.bus(0.7), b = A.bus(0.9, -0.2);
    [[0, 0], [-2, 0.9], [-5, 1.8], [-9, 2.8]].forEach(([n, d], i) => I.bell(A, b, k + n + 12, t0 + d, 0.1 - i * 0.012, 3.2));
    for (const n of [0, 3, 7]) I.pad(A, mus, k - 24 + n, t0 + 0.2, 5, 0.06, 500);
    I.choir(A, mus, k - 12 + 3, t0 + 2.6, 3.5, 0.05); I.thump(A, A.bus(0.2), t0 + 3.6, 0.5); I.thump(A, A.bus(0.2), t0 + 4.4, 0.3);
    I.wind(A, A.bus(0.4), t0, 6, 0.05, 300);
  } },
  menu: { block: 12, fadeIn: 1.5, fn(A, t0, r, S) {
    const dur = 12, mus = A.bus(0.6), chords = S.q.menuChords, ch = chords[S.blk % chords.length];
    for (const n of ch) I.pad(A, mus, n, t0, dur, 0.035, 1100);
    I.choir(A, mus, ch[2], t0 + 0.2, dur - 0.2, 0.035);
    const arp = [ch[2] + 12, ch[3] + 12, ch[1] + 24, ch[2] + 24, ch[1] + 24, ch[3] + 12];
    for (let k = 0, t = t0 + 0.3; t < t0 + dur - 0.2; k++, t += 0.6) I.bell(A, A.bus(0.7, Math.sin(k) * 0.5), arp[k % arp.length], t, 0.04, 2);
    I.wind(A, A.bus(0.2), t0, dur, 0.025, 800);
  } },
  cartao: { block: 12, fadeIn: 1.2, fn(A, t0, r, S) {
    const dur = 12, box = A.bus(0.7, -0.2), sc = majorPenta(S.q.root + 36);
    for (let k = 0, t = t0 + 0.3; t < t0 + dur - 0.3; k++, t += 0.8 + (k % 8 === 7 ? 1.6 : 0)) I.bell(A, box, sc[S.q.phrase[(S.blk * 8 + k) % 16] % sc.length], t, 0.055, 1.8);
    I.pad(A, A.bus(0.5), S.q.root + 5, t0, dur, 0.035, 600);
    I.pad(A, A.bus(0.5), S.q.root + 12, t0, dur, 0.02, 600);
  } },
};

/** Per-seed constants for one cue: the same seed gives the same tune, other seeds differ. */
function constants(seed, name) {
  let h = seed >>> 0; for (const c of name) h = (Math.imul(h ^ c.charCodeAt(0), 16777619)) >>> 0;
  const r = rng(h + 12345);
  const root = pick(r, [33, 34, 36, 38]);
  const minorProg = pick(r, [[0, -4, -2, 0], [0, -4, -5, -2], [0, 3, -2, -4]]);
  const prog = minorProg.map((d) => { const rt = 45 + d; return { root: rt, notes: [rt + 12, rt + 15, rt + 19] }; });
  return {
    root, prog, phrase: Array.from({ length: 16 }, () => Math.floor(r() * 8)), riff: Array.from({ length: 8 }, () => r() < 0.45),
    menuChords: [[52, 59, 64, 68], [49, 56, 61, 64], [45, 52, 57, 61], [47, 54, 59, 63]].sort(() => r() - 0.5),
  };
}

// Loudness trims measured offline so every cue lands near the same level (about -25 dB mean).
const TRIM = { casa: 1.9, pomar: 1.6, cela: 1.35, treino: 1.55, ringue: 1.6, luta: 1.45, menu: 1.7, cartao: 2.3, gameover: 1.4, vitoria: 1.2 };

export const CUE_NAMES = Object.keys(CUES);

export function createMusic(ctx, { seed = 1, destination, volume = 0.8 } = {}) {
  const offline = isOffline(ctx);
  const sr = ctx.sampleRate;
  const master = ctx.createGain(); master.gain.value = volume;
  const duckG = ctx.createGain(); duckG.gain.value = 1;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 10500; lp.Q.value = 0.5; // the sampler's cut treble
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  duckG.connect(master); master.connect(lp).connect(comp).connect(destination || ctx.destination);
  // Big reverb: noise that decays over 3.2 s, built at the context's own rate.
  const len = Math.floor(sr * 3.2), ir = ctx.createBuffer(2, len, sr), ri = rng(99);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let l = 0; for (let i = 0; i < len; i++) { l += ((ri() * 2 - 1) - l) * Math.min(1, 0.35 * 22050 / sr * 2); d[i] = l * Math.exp(-i / (sr * 0.9)); } }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet).connect(duckG);
  const noise = ctx.createBuffer(1, sr * 2, sr); const nd = noise.getChannelData(0); const nr = rng(7);
  for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;

  let cur = null, curSeed = seed, ducked = false;

  function fadeOut(c, secs) {
    if (!c || c.dead) return; c.dead = true; clearInterval(c.timer);
    const t = ctx.currentTime;
    c.out.gain.cancelScheduledValues(t); c.out.gain.setValueAtTime(c.out.gain.value, t); c.out.gain.linearRampToValueAtTime(0, t + secs);
    c.send.gain.cancelScheduledValues(t); c.send.gain.setValueAtTime(c.send.gain.value, t); c.send.gain.linearRampToValueAtTime(0, t + secs);
    if (!offline) setTimeout(() => { try { c.out.disconnect(); c.send.disconnect(); } catch { /* already gone */ } }, (secs + 0.5) * 1000);
  }

  function play(name, opts = {}) {
    const def = CUES[name]; if (!def) throw new Error('unknown music cue: ' + name);
    const sd = (opts.seed ?? curSeed) >>> 0;
    if (cur && cur.name === name && !cur.dead && !def.once && opts.restart !== true) return { duration: Infinity };
    const t0 = offline ? (opts.at ?? 0) : ctx.currentTime + 0.05;
    fadeOut(cur, opts.crossfade ?? 1.2);
    const out = ctx.createGain(), send = ctx.createGain(); send.gain.value = 1;
    const fi = opts.fadeIn ?? def.fadeIn ?? 0.5;
    out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(TRIM[name] ?? 1, t0 + fi);
    out.connect(duckG); send.connect(verb);
    const bus = (sendAmt = 0.5, pan = 0) => {
      const g = ctx.createGain(), p = ctx.createStereoPanner(), s = ctx.createGain(); p.pan.value = pan; s.gain.value = sendAmt;
      g.connect(p).connect(out); g.connect(s).connect(send); return g;
    };
    const q = constants(sd, name);
    const block = def.block ?? def.bars * bpmBar(def.bpm);
    const c = cur = { name, out, send, dead: false, timer: null };
    const A = { ctx, noise, bus, el: 0 };
    let blk = 0, next = t0;
    const schedule = (horizon) => {
      while (!c.dead && next < horizon) {
        const S = { el: blk * block, blk, q };
        A.el = S.el;
        def.fn(A, next, rng(sd * 31 + blk * 7 + 1 + name.length), S);
        blk++; next += block;
        if (def.once) { // play once: fade out when the block ends
          const end = next - t0;
          if (!offline) c.timer = setTimeout(() => fadeOut(c, 1.5), Math.max(0, (end + 1) * 1000));
          c.finished = true; return;
        }
      }
    };
    if (offline) { schedule(opts.length ?? ctx.length / sr); return { duration: def.once ? block : Infinity }; }
    schedule(ctx.currentTime + 8);
    if (!def.once) c.timer = setInterval(() => schedule(ctx.currentTime + 8), 1000);
    return { duration: def.once ? block : Infinity };
  }

  return {
    play,
    stop(fade = 1) { fadeOut(cur, fade); cur = null; },
    duck(on) {
      ducked = !!on; const t = ctx.currentTime;
      duckG.gain.cancelScheduledValues(t); duckG.gain.setValueAtTime(duckG.gain.value, t);
      duckG.gain.linearRampToValueAtTime(on ? 0.28 : 1, t + (on ? 0.12 : 0.7));
    },
    setSeed(s) { curSeed = s >>> 0; },
    setVolume(v) { master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    /** Call from a pointer or key event: browsers keep the context suspended until then. */
    resume() { return ctx.state === 'suspended' && ctx.resume ? ctx.resume() : Promise.resolve(); },
    get current() { return cur && !cur.dead ? cur.name : null; },
    get ducked() { return ducked; },
    cues: CUE_NAMES,
    output: duckG,
  };
}
