// Music beds in the sound of late-1990s console games, synthesized offline in the browser:
// sampler-like instruments, a low sample rate, a big reverb. Deterministic: the same cues,
// length and seed give the same audio. Cue names are mirrored in src/audio/synth.ts.
const SR = 22050;

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const pick = (r, list) => list[Math.floor(r() * list.length)];

function setup(ctx) {
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const len = Math.floor(SR * 3.2), ir = ctx.createBuffer(2, len, SR), r = rng(99);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { lp += ((r() * 2 - 1) - lp) * 0.35; d[i] = lp * Math.exp(-i / (SR * 0.9)); }
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet).connect(master);
  const noise = ctx.createBuffer(1, SR * 2, SR); const nd = noise.getChannelData(0); const nr = rng(7);
  for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
  /** A channel strip: dry to the master and a send to the reverb. */
  const bus = (send = 0.5, pan = 0) => {
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = pan;
    const s = ctx.createGain(); s.gain.value = send;
    g.connect(p).connect(master); g.connect(s).connect(verb); return g;
  };
  return { ctx, bus, noise };
}

function env(g, t, a, peak, hold, rel) {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}

const I = {
  pad(A, out, note, t, dur, vol = 0.12, cutoff = 1100) {
    const { ctx } = A; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    for (const d of [-7, 0, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(note); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 2.5); }
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
  pluck(A, out, note, t, vol = 0.14) {
    const { ctx } = A; const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = hz(note); f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    o.connect(f).connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t); o.stop(t + 1);
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
  bass(A, out, note, t, dur, vol = 0.22) {
    const { ctx } = A; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = hz(note);
    o.connect(g).connect(out); env(g, t, 0.02, vol, Math.max(0, dur - 0.3), 0.4); o.start(t); o.stop(t + dur + 0.6);
  },
  hum(A, out, t, dur, vol = 0.025) {
    const { ctx } = A; const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120; f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 3;
    o.connect(f).connect(g).connect(out); env(g, t, 0.4, vol, Math.max(0, dur - 0.8), 0.4); o.start(t); o.stop(t + dur + 0.5);
  },
  wind(A, out, t, dur, vol = 0.12, base = 500) {
    const { ctx } = A; const s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; const g = ctx.createGain();
    for (let k = 0; k <= dur; k += 1) f.frequency.linearRampToValueAtTime(base * (1 + 0.6 * Math.sin(k * 0.9 + 1) * Math.sin(k * 0.37)), t + k);
    s.connect(f).connect(g).connect(out); env(g, t, Math.min(1.5, dur / 3), vol, Math.max(0, dur - 2), 1.2); s.start(t); s.stop(t + dur + 1.5);
  },
  thump(A, out, t, vol = 0.5) {
    const { ctx } = A; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    o.connect(g).connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.start(t); o.stop(t + 0.3);
  },
};

// Each cue fills [t0, t0 + dur] and repeats its own shape for long beds; r is seeded per video.
const CUES = {
  /** Dread: low drone, lamp hum, sparse bells, a choir swell now and then. */
  dread(A, t0, dur, r) {
    const mus = A.bus(0.6), root = 36 + Math.floor(r() * 5);
    for (let t = t0; t < t0 + dur; t += 30) {
      const d = Math.min(32, t0 + dur - t);
      I.pad(A, mus, root, t, d, 0.07, 700); I.pad(A, mus, root + 7, t, d, 0.05, 700);
    }
    I.hum(A, A.bus(0.3), t0, dur);
    const scale = [0, 3, 5, 7, 10, 12].map((n) => root + 24 + n);
    for (let t = t0 + 0.8; t < t0 + dur - 0.5; t += 1.6 + r() * 2.4) I.bell(A, A.bus(0.8, r() * 1.2 - 0.6), pick(r, scale), t, 0.08);
    for (let t = t0 + 12 + r() * 6; t < t0 + dur - 6; t += 18 + r() * 10) I.choir(A, mus, root + 25 + Math.floor(r() * 3), t, 4, 0.05);
  },
  /** Town: a calm chord loop, plucked arpeggio and a flute melody made from the seed. */
  town(A, t0, dur, r) {
    const mus = A.bus(0.45), lead = A.bus(0.6, 0.15);
    const keys = [[[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]], [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]];
    const chords = pick(r, keys); const roots = chords.map((c) => c[0] - 12);
    const penta = [0, 2, 4, 7, 9, 12, 14, 16].map((n) => chords[2][0] + 12 + n);
    const phrase = Array.from({ length: 16 }, () => pick(r, penta));
    const bar = 2.4;
    for (let b = 0; t0 + b * bar < t0 + dur; b++) {
      const t = t0 + b * bar, ch = chords[b % 4], left = t0 + dur - t;
      for (const n of ch) I.pad(A, mus, n, t, Math.min(bar, left), 0.035, 1500);
      I.bass(A, mus, roots[b % 4], t, bar * 0.9, 0.12);
      for (let k = 0; k < 4; k++) if (k * 0.6 < left) I.pluck(A, A.bus(0.4, k % 2 ? 0.4 : -0.4), ch[k % 3] + 12, t + k * 0.6, 0.06);
      // The melody rests every other phrase so it does not tire over minutes.
      if (Math.floor(b / 8) % 2 === 0) for (let k = 0; k < 2; k++) { const tt = t + k * 1.2; if (tt < t0 + dur - 0.3) I.flute(A, lead, phrase[(b * 2 + k) % phrase.length], tt, 1.05, 0.08); }
    }
    I.wind(A, A.bus(0.2), t0, dur, 0.03, 700);
  },
  /** Music box: a slow, slightly sour tune in a high register over a dark pad. */
  musicbox(A, t0, dur, r) {
    const box = A.bus(0.7, -0.2);
    const tune = Array.from({ length: 8 }, () => pick(r, [84, 83, 79, 76, 77, 72, 71, 74]));
    for (let k = 0, t = t0 + 0.3; t < t0 + dur - 0.3; k++, t += 0.7 + (k % 8 === 7 ? 1.4 : 0)) I.bell(A, box, tune[k % tune.length], t, 0.06, 1.6);
    for (let t = t0; t < t0 + dur; t += 30) I.pad(A, A.bus(0.5), 41, t, Math.min(32, t0 + dur - t), 0.04, 500);
  },
  /** Wind: open air, a low fifth and a distant bell. */
  wind(A, t0, dur, r) {
    I.wind(A, A.bus(0.3), t0, dur, 0.14, 420);
    for (let t = t0; t < t0 + dur; t += 30) { const d = Math.min(32, t0 + dur - t); I.pad(A, A.bus(0.6), 50, t, d, 0.04, 600); I.pad(A, A.bus(0.6), 57, t, d, 0.03, 600); }
    for (let t = t0 + 0.5; t < t0 + dur; t += 2.5 + r() * 2) I.bell(A, A.bus(0.9, -0.5), pick(r, [55, 55, 62, 50]), t, 0.07, 3.5);
  },
  /** Pursuit: sub drone, a heartbeat that speeds up in waves, dissonant swells. */
  pursuit(A, t0, dur, r) {
    const low = A.bus(0.5), sfx = A.bus(0.4);
    I.wind(A, A.bus(0.4), t0, dur, 0.1, 300);
    for (let t = t0; t < t0 + dur; t += 30) { const d = Math.min(32, t0 + dur - t); I.pad(A, low, 24, t, d, 0.08, 300); I.bass(A, low, 36, t, d, 0.06); }
    for (let w = t0; w < t0 + dur; w += 24) {
      let gap = 1.0;
      for (let t = w + 0.4; t < Math.min(w + 24, t0 + dur - 0.3); t += gap, gap = Math.max(0.45, gap * 0.93)) { I.thump(A, sfx, t, 0.35); I.thump(A, sfx, t + 0.22, 0.22); }
      const sw = Math.min(w + 21, t0 + dur - 2.6);
      if (sw > w) for (const n of [60, 61, 66]) I.pad(A, A.bus(0.7), n + Math.floor(r() * 2), sw, 2.2, 0.035, 2600);
    }
  },
  /** Overworld: a warm major pad, choir and a bell arpeggio; the chord moves now and then. */
  overworld(A, t0, dur, r) {
    const mus = A.bus(0.6);
    const chords = [[52, 59, 64, 68], [49, 56, 61, 64], [45, 52, 57, 61], [47, 54, 59, 63]];
    for (let s = 0, t = t0; t < t0 + dur; s++, t += 9.6) {
      const ch = s === 0 ? chords[0] : pick(r, chords), d = Math.min(9.6, t0 + dur - t);
      for (const n of ch) I.pad(A, mus, n, t, d, 0.035, 1300);
      I.choir(A, mus, ch[2], t + 0.2, Math.max(0.5, d - 0.2), 0.045);
      const arp = [ch[2] + 12, ch[3] + 12, ch[1] + 24, ch[2] + 24, ch[1] + 24, ch[3] + 12];
      for (let k = 0, tt = t + 0.3; tt < t + d - 0.2; k++, tt += 0.45) I.bell(A, A.bus(0.7, Math.sin(k) * 0.5), arp[k % arp.length], tt, 0.045, 2);
    }
    I.wind(A, A.bus(0.2), t0, dur, 0.04, 900);
  },
};

let rendered = null;
/** plan: [[cue, t0, dur], ...]. Keeps the result for chunk(); returns its length in samples. */
async function render(plan, seconds, seed = 1) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const A = setup(ctx);
  plan.forEach(([cue, t0, dur], i) => CUES[cue](A, t0, dur, rng(seed * 31 + i * 7 + 1)));
  rendered = await ctx.startRendering();
  return { samples: rendered.length, sampleRate: SR };
}
/** Interleaved 16-bit PCM of samples [from, from + count), base64: long beds leave the page in pieces. */
function chunk(from, count) {
  const n = Math.min(count, rendered.length - from), l = rendered.getChannelData(0), r = rendered.getChannelData(1);
  const out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.max(-1, Math.min(1, l[from + i])) * 32767;
    out[i * 2 + 1] = Math.max(-1, Math.min(1, r[from + i])) * 32767;
  }
  const bytes = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
window.synth = { render, chunk, cues: Object.keys(CUES) };
