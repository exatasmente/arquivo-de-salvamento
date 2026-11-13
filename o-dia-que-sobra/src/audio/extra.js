// Phase 3: hallucinations, event sounds, the body and the medicine. No spoken voice anywhere, and
// nothing here is a bang (D3): every sound is quiet, odd and a little wrong. Same contract as
// oneshots.js: fn({ K, t, r, o }) -> duration in seconds. Options are documented on each sound.
import { pick, vary } from './util.js';
import { ONESHOTS } from './oneshots.js';
const gain = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };


export const EXTRA_ONESHOTS = {
  // ---- hallucinations and events ---------------------------------------------------------------
  // Something falls where nothing was: a thud, a tin ring, then it bounces and rolls away.
  objeto_cai({ K, t, r }) {
    const p = vary(r, 0.3);
    K.tone(t, 0.1, { f0: 150 * p, f1: 70, g: 0.45, att: 0.001 });
    K.noise(t, 0.08, { f0: 1100 * p, f1: 300, g: 0.3, att: 0.001, off: r() });
    K.metal(t + 0.004, 1250 * p, [[1, 0.2, 0.45], [2.31, 0.13, 0.3], [3.7, 0.07, 0.2]]);
    let tt = t + 0.17, gap = 0.2, g = 0.3;
    for (let k = 0; k < 4; k++) {
      K.tone(tt, 0.05, { f0: 190 * p, f1: 100, g, att: 0.001 }); K.tick(tt, { f0: 2200, g: g * 0.5 });
      tt += gap; gap *= 0.62; g *= 0.55;
    }
    K.noise(tt, 0.55, { kind: 'brown', type: 'bandpass', f0: 420, q: 1.2, g: 0.2, att: 0.05, sus: 0.4, am: { rate: 17, depth: 0.7 }, off: r() }); // it rolls
    return tt - t + 0.6;
  },
  // A door groaning on its own hinge, slow, stick and slip. o.dur (s, default 1.8).
  porta_range({ K, t, r, o }) {
    const d = o.dur ?? 1.8, p = vary(r, 0.15);
    K.tone(t, d, { type: 'sawtooth', f0: 390 * p, f1: 700 * p, g: 0.06, att: 0.25, sus: d * 0.4, lp: 1700, am: { rate: 8, depth: 0.7 }, vib: { rate: 29, depth: 40 } });
    K.tone(t + d * 0.1, d * 0.8, { type: 'sawtooth', f0: 610 * p, f1: 1020 * p, g: 0.025, att: 0.3, sus: d * 0.4, lp: 2200, am: { rate: 5.5, depth: 0.85 } });
    K.noise(t, d, { kind: 'pink', type: 'bandpass', f0: 240, f1: 330, q: 1.2, g: 0.18, att: 0.3, sus: d * 0.4, am: { rate: 6.5, depth: 0.5 }, off: r() });
    return d + 0.2;
  },
  // Far-off footsteps, muffled and slow. o.n (steps, default 6), o.ritmo (seconds per step, default 0.62).
  // The game plays one step at a time (n: 1) to make them stop when the player stops.
  passos_longe({ K, t, r, o }) {
    const n = o.n ?? 6, ritmo = o.ritmo ?? 0.62;
    for (let i = 0; i < n; i++) {
      const tt = t + i * ritmo * (0.96 + r() * 0.08), p = vary(r, 0.25), g = 0.9 - i * 0.02;
      K.noise(tt, 0.16, { kind: 'brown', f0: 260 * p, f1: 90, q: 0.7, g: 0.3 * g, att: 0.012, off: r() });
      K.tone(tt, 0.18, { f0: 78 * p, f1: 42, g: 0.22 * g, att: 0.01 });
    }
    return n * ritmo + 0.3;
  },
  // The shop bell, muffled and a little wrong: flat, a beating twin, a third stroke nobody made.
  sino_fantasma({ K, t, r }) {
    const base = 2350 * 0.87 * vary(r, 0.03);
    const part = (tt, f, g, d) => {
      K.tone(tt, d, { f0: f, f1: f * 0.985, g, att: 0.014, lp: 2300 });
      K.tone(tt, d * 0.9, { f0: f * 1.007, f1: f * 0.99, g: g * 0.7, att: 0.014, lp: 2300 }); // the twin: beating
    };
    for (const [tt, k, g] of [[0, 1, 0.3], [0.13 + r() * 0.05, 1.02, 0.22], [0.78 + r() * 0.12, 0.93, 0.1]]) {
      part(t + tt, base * k, g, 1.3); part(t + tt, base * k * 2.71, g * 0.35, 0.8); part(t + tt, base * k * 4.9, g * 0.12, 0.4);
    }
    return 2.1;
  },
  // The coffee maker starting with nobody there: a switch click, then the usual brew. o.dur (default 2.8).
  cafe_sozinho({ K, t, r, o }) {
    K.tick(t, { f0: 1400, g: 0.3 }); K.tone(t, 0.06, { type: 'triangle', f0: 300, f1: 200, g: 0.25, att: 0.001 });
    return 0.2 + ONESHOTS.cafeteira({ K, t: t + 0.2, r, o: { dur: o.dur ?? 2.8 } });
  },
  // Fridge door: the seal letting go, the bottles, the compressor's hum. o.fecha closes it. o.dur (default 1.4).
  geladeira_abre({ K, t, r, o }) {
    if (o.fecha) {
      K.noise(t, 0.12, { type: 'lowpass', f0: 700, f1: 250, g: 0.2, att: 0.06 });
      K.tone(t + 0.12, 0.14, { f0: 100, f1: 50, g: 0.55, att: 0.002 }); K.noise(t + 0.12, 0.09, { f0: 1100, f1: 300, g: 0.35, att: 0.001, off: r() });
      K.noise(t + 0.2, 0.05, { type: 'bandpass', f0: 600, q: 2, g: 0.15, att: 0.002 });
      return 0.55;
    }
    const d = o.dur ?? 1.4;
    K.noise(t, 0.07, { type: 'bandpass', f0: 300, f1: 900, q: 1.5, g: 0.4, att: 0.002, off: r() }); K.tone(t, 0.08, { f0: 120, f1: 220, g: 0.3, att: 0.002 });
    K.noise(t + 0.03, 0.2, { type: 'highpass', f0: 3500, g: 0.1, att: 0.01, off: r() });
    for (let k = 0; k < 2; k++) K.metal(t + 0.1 + k * 0.07 + r() * 0.03, 1900 * vary(r, 0.3), [[1, 0.08, 0.25], [2.3, 0.05, 0.15]]);
    K.tone(t + 0.1, d - 0.1, { type: 'sawtooth', f0: 55, g: 0.06, att: 0.3, sus: 0.4, lp: 240 });
    K.tone(t + 0.1, d - 0.1, { f0: 110, g: 0.04, att: 0.3, sus: 0.4 });
    K.noise(t + 0.1, d - 0.1, { kind: 'brown', type: 'bandpass', f0: 130, q: 3, g: 0.2, att: 0.3, sus: 0.4, off: r() });
    return d + 0.1;
  },
  // The phone picked up and nothing on the line but the fluorescent hum (the manager says nothing).
  // o.dur (default 5): how long the line stays open; it fades out and ends without a click.
  telefone_mudo({ K, t, r, o }) {
    const d = o.dur ?? 5;
    K.tick(t, { f0: 1800, g: 0.35 }); K.tone(t, 0.05, { type: 'triangle', f0: 400, f1: 250, g: 0.25, att: 0.001 });
    K.noise(t + 0.03, 0.2, { type: 'bandpass', f0: 900, f1: 600, q: 1.5, g: 0.1, att: 0.04, off: r() });
    const t0 = t + 0.2, L = d - 0.2, f = 1 + (r() - 0.5) * 0.0008;
    for (const [fq, g] of [[60, 0.5], [120, 0.72], [180, 0.34], [240, 0.22], [300, 0.12]]) K.tone(t0, L, { f0: fq * f, g: g * 0.1, att: 0.35, sus: Math.min(1.2, L * 0.4), lp: 1200 });
    K.noise(t0, L, { type: 'bandpass', f0: 2600, q: 1.4, g: 0.012, att: 0.35, sus: Math.min(1.2, L * 0.4), am: { rate: 120, depth: 0.5 }, off: r() });
    K.noise(t0, L, { type: 'highpass', f0: 4200, g: 0.006, att: 0.35, sus: Math.min(1.2, L * 0.4), off: r() });
    return d;
  },
  // A radio between stations: a sweep across the band, whistles, and fragments of static that come
  // and go. No station, no voice. o.dur (default 3).
  chiado_radio({ K, t, r, o }) {
    const d = o.dur ?? 3;
    K.noise(t, d, { type: 'bandpass', f0: 1400, f1: 3600, q: 0.7, g: 0.11, att: 0.12, sus: d * 0.3, off: r() });
    K.tone(t + 0.1, d * 0.6, { f0: 2300, f1: 700, g: 0.022, att: 0.1, sus: d * 0.2, lp: 3000 }); // heterodyne whistle
    let tt = t + 0.3;
    while (tt < t + d - 0.3) {
      const len = 0.06 + r() * 0.3;
      K.noise(tt, len, { type: 'bandpass', f0: 600 + r() * 3600, q: 1.4, g: 0.05 + r() * 0.06, att: 0.01, sus: len * 0.5, off: r() });
      if (r() < 0.4) K.tick(tt + len, { f0: 3000, g: 0.1 });
      tt += len + 0.05 + r() * 0.35;
    }
    K.noise(t, d, { kind: 'brown', f0: 160, g: 0.06, att: 0.2, sus: d * 0.3, off: r() });
    return d + 0.1;
  },
  // A car arriving with no engine: only tyres on the asphalt, slowing to a stop. o.dur (default 4.5).
  motor_sem_som({ K, t, r, o }) {
    const d = o.dur ?? 4.5;
    K.noise(t, d, { kind: 'pink', type: 'bandpass', f0: 700, f1: 280, q: 0.7, g: 0.28, att: d * 0.6, sus: d * 0.3, off: r() }); // the roll
    K.noise(t, d, { type: 'bandpass', f0: 2000, f1: 1100, q: 1, g: 0.05, att: d * 0.6, sus: d * 0.3, off: r() });         // tread hiss
    K.noise(t, d, { kind: 'brown', type: 'lowpass', f0: 140, g: 0.2, att: d * 0.6, sus: d * 0.3, off: r() });
    K.noise(t, d, { type: 'bandpass', f0: 2600, f1: 2000, q: 2.5, g: 0.07, att: d * 0.5, sus: d * 0.4, am: { rate: 38, depth: 0.95, type: 'square' }, off: r() }); // gravel under the rubber
    K.noise(t + d * 0.5, d * 0.45, { type: 'bandpass', f0: 3200, q: 3, g: 0.04, att: 0.1, sus: d * 0.3, am: { rate: 17, depth: 0.95, type: 'square' }, off: r() }); // sparser as it slows
    return d + 0.2;
  },
  // Pump 4 starting by itself: relay, motor winding up, fuel, the register counting. o.dur (default 2.4).
  bomba4_liga({ K, t, r, o }) {
    const d = o.dur ?? 2.4;
    K.tick(t, { f0: 1100, g: 0.4 }); K.tone(t, 0.14, { f0: 90, f1: 55, g: 0.5, att: 0.002 });
    K.tone(t + 0.12, d - 0.12, { type: 'sawtooth', f0: 38, f1: 47, fdur: 0.8, g: 0.09, att: 0.15, sus: 0.5, lp: 320 });
    K.tone(t + 0.12, d - 0.12, { f0: 94, f1: 94, g: 0.04, att: 0.3, sus: 0.5 });
    K.noise(t + 0.4, d - 0.4, { kind: 'pink', type: 'bandpass', f0: 900, q: 0.8, g: 0.07, att: 0.5, sus: 0.5, off: r() });
    K.noise(t + 0.5, d - 0.8, { type: 'bandpass', f0: 2400, q: 2, g: 0.15, att: 0.002, sus: 0.05, am: { rate: 11, depth: 1, type: 'square' }, off: r() }); // the register counting
    K.tone(t + 0.5, d - 0.8, { f0: 760, g: 0.035, att: 0.002, sus: 0.05, am: { rate: 11, depth: 1, type: 'square' } });
    return d + 0.2;
  },
  // An old coin set down: heavier and more opaque than `moeda`, then it spins down on the counter.
  moeda_antiga({ K, t, r }) {
    const p = vary(r, 0.2);
    K.tone(t, 0.12, { f0: 120 * p, f1: 70, g: 0.38, att: 0.002 });
    K.noise(t, 0.04, { type: 'bandpass', f0: 1500, q: 1.2, g: 0.2, att: 0.001, off: r() });
    for (const [ratio, g, d] of [[1, 0.3, 0.38], [1.46, 0.17, 0.26], [2.13, 0.07, 0.14]]) K.tone(t + 0.003, d, { f0: 1750 * p * ratio, f1: 1750 * p * ratio * 0.997, g, att: 0.001, lp: 2800 });
    let tt = t + 0.2, gap = 0.1, g = 0.12;
    while (gap > 0.02) { K.tone(tt, 0.03, { f0: 1500 * p, f1: 1350 * p, g, att: 0.001, lp: 2600 }); K.tick(tt, { f0: 2200, g: g * 0.5 }); tt += gap; gap *= 0.7; g *= 0.9; }
    K.tone(tt, 0.1, { f0: 800 * p, g: 0.08, att: 0.001, lp: 1500 }); // it lies flat
    return tt - t + 0.2;
  },

  // ---- the body and the medicine ----------------------------------------------------------------
  // A pill swallowed dry: tongue click, the throat, a small swallow after. Quiet and close.
  engolir({ K, t, r }) {
    K.tick(t, { f0: 1800, g: 0.1 });
    K.noise(t + 0.03, 0.3, { kind: 'brown', f0: 260, f1: 120, g: 0.26, att: 0.06, sus: 0.14, off: r() });
    K.tone(t + 0.12, 0.2, { f0: 210, f1: 85, g: 0.2, att: 0.03 });
    K.noise(t + 0.12, 0.12, { type: 'bandpass', f0: 1100, f1: 500, q: 1.5, g: 0.06, att: 0.02, off: r() });
    K.tone(t + 0.42, 0.14, { f0: 160, f1: 80, g: 0.09, att: 0.02 });
    return 0.7;
  },
  // Pills rattling in a plastic bottle. o.n (shakes, default 6).
  frasco({ K, t, r, o }) {
    const n = o.n ?? 6;
    let tt = t;
    for (let k = 0; k < n; k++) {
      const s = 0.5 + 0.5 * Math.sin(Math.PI * (k + 0.5) / n);
      K.tone(tt, 0.05, { f0: 150, f1: 95, g: 0.1 * s, att: 0.002 });
      K.noise(tt + 0.004, 0.075, { type: 'bandpass', f0: 2000 + r() * 2200, q: 2.5, g: 0.17 * s, att: 0.002, am: { rate: 70 + r() * 40, depth: 0.9, type: 'square' }, off: r() });
      tt += 0.1 * (0.9 + r() * 0.2);
    }
    return tt - t + 0.2;
  },
  // Heavy sleep: the world sinks and comes back. A low swell and a long breath out; the bridge
  // (index.js) ducks the whole mix for the same span, as setDrowsy does. o.dur (default 5), o.depth 0..1.
  sono_pesado({ K, t, r, o }) {
    const d = o.dur ?? 5;
    K.tone(t, d, { f0: 58, f1: 40, g: 0.2, att: d * 0.4, sus: d * 0.4 });
    K.noise(t + 0.2, d - 0.2, { kind: 'brown', type: 'lowpass', f0: 170, g: 0.18, att: d * 0.4, sus: d * 0.4, off: r() });
    K.noise(t + d * 0.25, d * 0.55, { kind: 'pink', type: 'bandpass', f0: 520, f1: 260, q: 0.8, g: 0.07, att: d * 0.2, sus: d * 0.35, off: r() });
    return d;
  },
};


export const EXTRA_LOOPS = {
  // Ringing in the ears: two thin high sines beating against each other, a pressure under them.
  // set('intensity', 0..1) (default 0.4): how loud. Unlike the others it is not a place, it is you.
  zumbido_ouvido(L) {
    const { ctx } = L, st = L.st; st.intensity ??= 0.4;
    const out = gain(ctx, 0), wob = gain(ctx, 1);
    wob.connect(out); out.connect(L.out);
    L.osc('sine', 3150).connect(gain(ctx, 0.5)).connect(wob);
    L.osc('sine', 3150 * 1.0042).connect(gain(ctx, 0.32)).connect(wob);
    L.osc('sine', 4420).connect(gain(ctx, 0.14)).connect(wob);
    L.osc('sine', 880).connect(gain(ctx, 0.12)).connect(wob); // the part that survives the muffling of low sanity
    L.lfo('sine', 0.17, 0.1, wob.gain);
    const apply = (k) => out.gain.setTargetAtTime(0.045 * Math.min(1, Math.max(0, k)) ** 1.3, ctx.currentTime, 0.35);
    apply(st.intensity);
    L.onSet((k, v) => { if (k === 'intensity') apply(v); });
  },
};
