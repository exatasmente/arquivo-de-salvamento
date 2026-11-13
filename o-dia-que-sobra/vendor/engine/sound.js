// The engine's sound (docs/engine.md, "Som"): the pieces a game builds its sounds with, so a new game does not
// write them again. Nothing here touches Math.random or the wall clock: every sound is a function of its seed
// and of the context's time, so an offline render (the film mode's sound) is the sound the game plays.
//   rng, hash, clamp, lerp, pick, vary, isOffline, curveOf, crushCurve, clipCurve, driveCurve, makeNoise
//   makeKit(A, dest): tone, noise, tick and metal on absolute times, into one voice
//   createChain(ctx, opts): the master chain (bus, the low-sanity muffle and drive, drowsiness, the era's
//     narrow band and few bits, volume, compressor, a soft ceiling, a short room reverb) with its controls
// A game's sounds are its own (what plays when); the contract the editor and the film mode read is the one in
// docs/engine.md: a factory create…(ctx, { seed, destination }) → { play(name, { at, gain, pos }) } and …NAMES.

/** Seeded generator (LCG, same as the Rinha), returns floats in [0, 1). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
/** Hash of a string plus a number, to derive a per-sound seed. */
export function hash(str, n = 0) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const pick = (r, n) => Math.floor(r() * n);
/** Pitch/time variation factor around 1 (spread = total width). */
export const vary = (r, spread = 0.2) => 1 + (r() - 0.5) * spread;
export const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

/** A WaveShaper curve from a function over [-1, 1]. */
export function curveOf(fn, n = 1025) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
/** Telephone-style companded quantizer: few bits, but quiet sounds keep their detail. */
export function crushCurve(bits = 6, mu = 255, n = 16385) {
  const L = 2 ** (bits - 1), lm = Math.log(1 + mu);
  return curveOf((x) => {
    const a = Math.abs(x), u = Math.log(1 + mu * a) / lm, q = Math.round(u * L) / L;
    return Math.sign(x) * (Math.exp(q * lm) - 1) / mu;
  }, n);
}
/** Output ceiling: tanh-shaped, never above `ceil`. */
export const clipCurve = (ceil = 0.84) => curveOf((x) => ceil * Math.tanh(x / ceil), 2049);
/** Mild saturation for the low-sanity mix. */
export const driveCurve = () => curveOf((x) => Math.tanh(x * 3) / Math.tanh(3), 1025);

/**
 * Looping noise buffer: `kind` white | pink | brown, normalised to a steady level, with the seam
 * cross-faded so the loop point does not click.
 */
export function makeNoise(ctx, kind, seconds, seed) {
  const sr = ctx.sampleRate, N = Math.floor(sr * seconds), F = Math.floor(sr * 0.25), r = rng(seed);
  const x = new Float32Array(N + F);
  if (kind === 'white') for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < x.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.22; b6 = w * 0.115926;
    }
  } else {
    let l = 0;
    for (let i = 0; i < x.length; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; x[i] = l * 3.5; }
  }
  let sum = 0; for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const k = 0.35 / Math.sqrt(sum / x.length || 1); // rms 0.35
  const buf = ctx.createBuffer(1, N, sr), y = buf.getChannelData(0);
  for (let i = 0; i < N; i++) y[i] = x[i] * k;
  for (let i = 0; i < F; i++) { // seam: fade the start into the tail that follows the end
    const a = (i / F) * Math.PI / 2;
    y[i] = x[i] * k * Math.sin(a) + x[N + i] * k * Math.cos(a);
  }
  for (let i = 0; i < N; i++) y[i] = Math.max(-1, Math.min(1, y[i]));
  return buf;
}

// ---- the synthesis kit -------------------------------------------------------------------------

/**
 * Gain envelope. Percussive by default (fast attack, exponential decay). With `sus` (a release
 * time in seconds) it holds the peak and ramps to zero over the last `sus` seconds.
 */
function envelope(g, t, dur, peak, att, sus) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + att);
  if (sus) { g.setValueAtTime(peak, Math.max(t + att, t + dur - sus)); g.linearRampToValueAtTime(0.0001, t + dur); }
  else g.exponentialRampToValueAtTime(0.0001, t + dur);
}

export function makeKit(A, dest) {
  const ctx = A.ctx;
  const outTo = (node, o) => {
    let n = node;
    if (o.pan && !dest.spatial) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(dest.node);
  };
  return {
    ctx,
    /** Oscillator. o: type, f0, f1 (sweep), g, att, sus, lp, hp, pan, fm {depth, ratio}, vib {rate, depth}. */
    tone(t, dur, o = {}) {
      const { type = 'sine', f0 = 200, f1 = f0, g = 0.3, att = 0.003, sus = 0 } = o;
      if (Math.max(f0, f1) > ctx.sampleRate * 0.45) return null; // above what this context can carry (and past the era band)
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + (o.fdur ?? dur));
      const a = ctx.createGain(); envelope(a.gain, t, dur, g, att, sus);
      let n = osc;
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.lpq ?? 0.7; n.connect(f); n = f; }
      if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; n.connect(f); n = f; }
      const extra = [];
      if (o.am) { // amplitude gating at `rate` Hz, depth 0..1 (bell hammers, flutter)
        const ag = ctx.createGain(); ag.gain.value = 1 - o.am.depth;
        const m = ctx.createOscillator(), mg = ctx.createGain(); m.type = o.am.type ?? 'sine'; m.frequency.value = o.am.rate; mg.gain.value = o.am.depth;
        m.connect(mg).connect(ag.gain); n.connect(ag); n = ag; extra.push(m);
      }
      n.connect(a); outTo(a, o);
      if (o.fm) {
        const m = ctx.createOscillator(), mg = ctx.createGain();
        m.frequency.value = f0 * (o.fm.ratio ?? 3.5); mg.gain.setValueAtTime(o.fm.depth, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
        m.connect(mg).connect(osc.frequency); extra.push(m);
      }
      if (o.vib) {
        const m = ctx.createOscillator(), mg = ctx.createGain();
        m.frequency.value = o.vib.rate; mg.gain.value = o.vib.depth; m.connect(mg).connect(osc.frequency); extra.push(m);
      }
      osc.start(t); osc.stop(t + dur + 0.05);
      for (const m of extra) { m.start(t); m.stop(t + dur + 0.05); }
      return osc;
    },
    /** Filtered noise. o: kind (white|pink|brown), type, f0, f1, q, g, att, sus, off, pan. */
    noise(t, dur, o = {}) {
      const { kind = 'white', type = 'lowpass', f0 = 1000, f1 = f0, q = 1, g = 0.3, att = 0.003, sus = 0 } = o;
      const buf = A.noise(kind), s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const a = ctx.createGain(); envelope(a.gain, t, dur, g, att, sus);
      let n = f;
      const extra = [];
      if (o.am) { // amplitude flutter: depth 0..1 at `rate` Hz (paper, rough breath)
        const ag = ctx.createGain(); ag.gain.value = 1 - o.am.depth;
        const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = o.am.rate; mg.gain.value = o.am.depth;
        m.connect(mg).connect(ag.gain); f.connect(ag); n = ag; extra.push(m);
      }
      s.connect(f); n.connect(a); outTo(a, o);
      s.start(t, ((o.off ?? 0) % 1) * buf.duration); s.stop(t + dur + 0.05);
      for (const m of extra) { m.start(t); m.stop(t + dur + 0.05); }
      return s;
    },
    /** A few ms of broadband tick (switches, clicks). */
    tick(t, o = {}) {
      return this.noise(t, o.dur ?? 0.012, { type: 'highpass', f0: o.f0 ?? 2500, q: 0.7, g: o.g ?? 0.3, att: 0.0008, off: o.off ?? 0, pan: o.pan });
    },
    /** Inharmonic metal partials struck at once (bells, coins, nozzle clanks). */
    metal(t, base, partials, o = {}) {
      for (const [ratio, g, d] of partials) this.tone(t + (o.delay ?? 0), d * (o.decay ?? 1), { f0: base * ratio, f1: base * ratio * 0.998, g: g * (o.g ?? 1), att: 0.0008, pan: o.pan });
    },
  };
}

// ---- the master chain ----------------------------------------------------------------------------

export function createChain(ctx, { era = true, eraBits = 6, volume = 0.9, destination, rooms = { sala: 0.16 }, room } = {}) {
  // The rooms the game names (a reverb level each), and the one it starts in (its first by default).
  // A name not in `rooms` (setRoom) falls back to this first room too.
  const ROOMS = rooms ?? {};
  const startRoom = room ?? Object.keys(ROOMS)[0];
  const NY = ctx.sampleRate * 0.45; // keep every filter inside the band the context can carry
  const bus = ctx.createGain();
  const sanLP = ctx.createBiquadFilter(); sanLP.type = 'lowpass'; sanLP.frequency.value = Math.min(18000, NY); sanLP.Q.value = 0.6;
  const dry = ctx.createGain(), wet = ctx.createGain(), drive = ctx.createWaveShaper(); drive.curve = driveCurve(); wet.gain.value = 0;
  const sum1 = ctx.createGain();
  const warble = ctx.createDelay(0.05); warble.delayTime.value = 0.005;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 1.1; lfoG.gain.value = 0; lfo.connect(lfoG).connect(warble.delayTime); lfo.start();
  bus.connect(sanLP); sanLP.connect(dry).connect(sum1); sanLP.connect(drive).connect(wet).connect(sum1); // drowsy: the mix sinks (muffled and lower) for heavy sleep; open and unity unless asked
  const drowsyLP = ctx.createBiquadFilter(); drowsyLP.type = 'lowpass'; drowsyLP.frequency.value = Math.min(18000, NY); drowsyLP.Q.value = 0.5;
  const drowsyG = ctx.createGain();
  sum1.connect(drowsyLP).connect(drowsyG).connect(warble);

  // era: high-pass, low-pass and a companded quantizer; `eraOff` is the clean path
  const eraHP = ctx.createBiquadFilter(); eraHP.type = 'highpass'; eraHP.frequency.value = 50; eraHP.Q.value = 0.7;
  const eraLP = ctx.createBiquadFilter(); eraLP.type = 'lowpass'; eraLP.frequency.value = 7500; eraLP.Q.value = 0.8;
  const eraLP2 = ctx.createBiquadFilter(); eraLP2.type = 'lowpass'; eraLP2.frequency.value = 7500; eraLP2.Q.value = 0.5;
  const crush = ctx.createWaveShaper(); crush.curve = crushCurve(eraBits);
  const eraOn = ctx.createGain(), eraOffG = ctx.createGain();
  warble.connect(eraHP).connect(eraLP).connect(eraLP2).connect(crush).connect(eraOn);
  warble.connect(eraOffG);
  const master = ctx.createGain(); master.gain.value = volume;
  eraOn.connect(master); eraOffG.connect(master);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
  const clip = ctx.createWaveShaper(); clip.curve = clipCurve(0.84);
  master.connect(comp).connect(clip).connect(destination || ctx.destination);

  // reverb: short noisy room built with a running decay (no per-sample exp)
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.1), ir = ctx.createBuffer(2, len, sr), ri = rng(31);
  const kf = Math.min(1, 0.35 * 22050 / sr * 2), step = Math.exp(-1 / (sr * 0.26));
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let l = 0, dec = 1; for (let i = 0; i < len; i++) { l += ((ri() * 2 - 1) - l) * kf; d[i] = l * dec; dec *= step; } }
  const rev = ctx.createConvolver(); rev.buffer = ir; const revG = ctx.createGain(); revG.gain.value = ROOMS[startRoom] ?? 0.16; rev.connect(revG).connect(bus);

  function setEra(on) {
    const now = ctx.currentTime;
    eraOn.gain.setTargetAtTime(on ? 1 : 0, now, 0.03); eraOffG.gain.setTargetAtTime(on ? 0 : 1, now, 0.03);
  }
  eraOn.gain.value = era ? 1 : 0; eraOffG.gain.value = era ? 0 : 1;

  /** Sanity 0..100 -> mix. Returns the derived values (also used for the body layer). */
  function setSanity(v, tc = 0.5) {
    v = clamp(v, 0, 100);
    const now = ctx.currentTime;
    // muffle: nothing above 60, a slight dulling to 40, clearly muffled below 40, a tunnel below 20
    let f;
    if (v >= 60) f = 18000;
    else if (v >= 40) f = lerp(9000, 18000, (v - 40) / 20) ;
    else if (v >= 20) f = lerp(2300, 9000, (v - 20) / 20) ;
    else f = lerp(750, 2300, v / 20);
    const driveMix = v >= 20 ? 0 : (20 - v) / 20 * 0.3;
    const warbleDepth = v >= 40 ? 0 : (40 - v) / 40 * 0.0035;
    sanLP.frequency.setTargetAtTime(Math.min(f, NY), now, tc);
    wet.gain.setTargetAtTime(driveMix, now, tc); dry.gain.setTargetAtTime(1 - driveMix * 0.5, now, tc);
    lfoG.gain.setTargetAtTime(warbleDepth, now, tc);
    return { cutoff: f, drive: driveMix, warble: warbleDepth };
  }

  /** Drowsiness 0..1: muffles to ~450 Hz and drops 5 dB at 1. `at` (absolute time) schedules it. */
  function setDrowsy(v, tc = 0.6, at) {
    v = clamp(v, 0, 1);
    const when = at ?? ctx.currentTime, f = Math.min(18000, NY) * (450 / Math.min(18000, NY)) ** v;
    drowsyLP.frequency.setTargetAtTime(f, when, tc); drowsyG.gain.setTargetAtTime(1 - 0.44 * v, when, tc);
  }

  return {
    bus, rev, master, setSanity, setEra, setDrowsy,
    setVolume(vv) { master.gain.setTargetAtTime(vv, ctx.currentTime, 0.05); },
    setRoom(name) { const w = typeof name === 'number' ? name : (ROOMS[name] ?? ROOMS[startRoom] ?? 0.16); revG.gain.setTargetAtTime(w, ctx.currentTime, 0.2); },
    rooms: Object.keys(ROOMS),
    eraNodes: { eraHP, eraLP, eraLP2, crush },
  };
}
