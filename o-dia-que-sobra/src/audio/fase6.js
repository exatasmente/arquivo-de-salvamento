// Phase 6: the sounds the week 3 and 4 events, the days off and the endings still lacked. Same contract
// as oneshots.js and loops.js (fn({ K, t, r, o }) -> seconds; loops are fn(L)). No voice anywhere, nothing
// is a bang (D3): quiet, close, a little wrong. Everything is a function of the seed and of time.
import { pick, vary } from './util.js';

const gain = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (ctx, type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

export const FASE6_ONESHOTS = {
  // ---- events of weeks 3 and 4 -----------------------------------------------------------------
  // A tube that cannot decide: the ballast buzz drops out and comes back in short, uneven bursts, each one
  // starting with a glass tick. o.dur (default 2.4). Meant to sit next to `lampada_estalo`.
  luz_oscila({ K, t, r, o }) {
    const d = o.dur ?? 2.4;
    let tt = t;
    while (tt < t + d - 0.15) {
      const on = 0.05 + r() * 0.22, len = Math.min(on, t + d - tt);
      K.tick(tt, { f0: 2600, g: 0.16 });
      K.tone(tt, len, { type: 'sawtooth', f0: 120, g: 0.05, att: 0.004, sus: 0.02, lp: 1100 });
      K.tone(tt, len, { f0: 240, g: 0.03, att: 0.004, sus: 0.02 });
      K.noise(tt, len, { type: 'bandpass', f0: 2700, q: 1.4, g: 0.02, att: 0.004, sus: 0.02, off: r() });
      tt += len + 0.04 + r() * 0.3;
    }
    K.tone(tt, 0.5, { f0: 120, g: 0.03, att: 0.2, sus: 0.2, lp: 900 }); // it settles
    return tt - t + 0.6;
  },
  // A staff badge lifted from a shelf: the clip, the plastic card against the cord, a rattle of the
  // little chain.
  cracha_pega({ K, t, r }) {
    const p = vary(r, 0.2);
    K.tick(t, { f0: 2200, g: 0.2 }); K.tone(t, 0.04, { f0: 260 * p, f1: 160, g: 0.12, att: 0.002 });
    K.noise(t + 0.03, 0.25, { type: 'bandpass', f0: 3300, q: 1.6, g: 0.07, att: 0.01, am: { rate: 22, depth: 0.8 }, off: r() });
    for (let k = 0; k < 4; k++) K.metal(t + 0.08 + k * 0.045 + r() * 0.02, 3500 * vary(r, 0.3), [[1, 0.035, 0.07], [1.9, 0.02, 0.05]]);
    K.noise(t + 0.3, 0.12, { type: 'bandpass', f0: 1500, q: 1.2, g: 0.05, att: 0.01, off: r() });
    return 0.55;
  },
  // Steps on the gravel of the car park, far enough to be unsure. o.n (default 3), o.ritmo (default 0.7 s).
  passos_cascalho({ K, t, r, o }) {
    const n = o.n ?? 3, ritmo = o.ritmo ?? 0.7;
    for (let i = 0; i < n; i++) {
      const tt = t + i * ritmo * (0.95 + r() * 0.1), p = vary(r, 0.25), g = 1 - i * 0.04;
      K.noise(tt, 0.2, { type: 'bandpass', f0: 2100 * p, f1: 1500, q: 1.1, g: 0.16 * g, att: 0.008, am: { rate: 46, depth: 0.9, type: 'square' }, off: r() }); // the crunch
      K.noise(tt, 0.13, { kind: 'brown', f0: 280 * p, f1: 100, q: 0.7, g: 0.22 * g, att: 0.01, off: r() });
      K.tone(tt, 0.14, { f0: 74 * p, f1: 42, g: 0.15 * g, att: 0.01 });
    }
    return n * ritmo + 0.3;
  },
  // The shop clock, going back: its ticks run faster and faster the wrong way, a gear winding up, and a
  // soft stop. No chime. o.dur (default 3.4).
  relogio_volta({ K, t, r, o }) {
    const d = o.dur ?? 3.4;
    let tt = t + 0.05, gap = 0.9, k = 0;
    while (tt < t + d - 0.5) {
      const hi = k % 2 === 0;
      K.tick(tt, { f0: hi ? 2400 : 1900, g: 0.18 });
      K.tone(tt, 0.05, { f0: hi ? 1300 : 1000, f1: hi ? 1100 : 900, g: 0.12, att: 0.001, lp: 2500 });
      tt += gap; gap = Math.max(0.045, gap * 0.8); k++;
    }
    K.tone(t, d - 0.4, { type: 'sawtooth', f0: 120, f1: 640, g: 0.03, att: d * 0.3, sus: 0.3, lp: 800 }); // the gear
    K.noise(t, d - 0.4, { type: 'bandpass', f0: 800, f1: 3200, q: 1.2, g: 0.04, att: d * 0.3, sus: 0.3, off: r() });
    K.tone(t + d - 0.35, 0.2, { f0: 130, f1: 60, g: 0.2, att: 0.004 }); // the spring lets go
    K.tick(t + d - 0.35, { f0: 1500, g: 0.15 });
    return d + 0.1;
  },
  // The jingle of the old promotion, alone: four music-box notes that sag and stop before the last one.
  sol_jingle({ K, t, r }) {
    const notes = [587.33, 739.99, 880, 987.77], sag = 0.014 + r() * 0.01, step = 0.5 + r() * 0.06;
    for (let i = 0; i < 3; i++) {
      const f = notes[i] * (1 - sag * i * i), ti = t + i * step * (1 + i * 0.1), last = i === 2;
      K.tone(ti, last ? 0.45 : 0.85, { f0: f, f1: f * (1 - 0.03 * (i + 1)), g: 0.13 / (1 + i * 0.15), att: 0.03, lp: 1800, vib: { rate: 5.2, depth: f * 0.012 } });
      K.tone(ti, last ? 0.25 : 0.4, { f0: f * 2.76, f1: f * 2.7, g: 0.03, att: 0.005, lp: 3200 });
    }
    K.noise(t + 3 * step, 0.3, { type: 'bandpass', f0: 3100, q: 3, g: 0.03, att: 0.1, off: r() });
    return 3 * step + 0.7;
  },
  // A paper sticker pressed onto a screen: the peel, the press, the smoothing of a thumb.
  adesivo_cola({ K, t, r }) {
    K.noise(t, 0.28, { type: 'bandpass', f0: 2200, f1: 4200, q: 1.5, g: 0.08, att: 0.12, off: r() });
    K.tone(t + 0.3, 0.06, { f0: 180, f1: 110, g: 0.18, att: 0.003 }); K.noise(t + 0.3, 0.04, { type: 'bandpass', f0: 1400, q: 1, g: 0.1, att: 0.002, off: r() });
    K.noise(t + 0.4, 0.4, { type: 'bandpass', f0: 1500, f1: 2600, q: 2.2, g: 0.04, att: 0.08, am: { rate: 14, depth: 0.5 }, off: r() });
    return 0.9;
  },
  // A car starting by itself and leaving: the starter, the catch, the engine climbing away. o.dur (default 4.5).
  carro_parte({ K, t, r, o }) {
    const d = o.dur ?? 4.5;
    K.tone(t, 0.85, { type: 'sawtooth', f0: 52, f1: 66, g: 0.09, att: 0.05, sus: 0.1, lp: 330, am: { rate: 11, depth: 0.55, type: 'square' } }); // cranking
    K.noise(t, 0.85, { kind: 'brown', f0: 200, g: 0.13, att: 0.05, sus: 0.1, am: { rate: 11, depth: 0.55, type: 'square' }, off: r() });
    K.tone(t + 0.85, 0.12, { f0: 140, f1: 70, g: 0.2, att: 0.004 }); // the catch
    const e = d - 0.9;
    K.tone(t + 0.9, e, { type: 'sawtooth', f0: 46, f1: 118, g: 0.09, att: 0.2, sus: e * 0.65, lp: 380 });
    K.tone(t + 0.9, e, { f0: 92, f1: 210, g: 0.04, att: 0.3, sus: e * 0.65 });
    K.noise(t + 0.9, e, { kind: 'pink', type: 'bandpass', f0: 420, f1: 900, q: 0.7, g: 0.09, att: 0.5, sus: e * 0.7, off: r() }); // tyres, going
    return d + 0.1;
  },

  // ---- the day off ----------------------------------------------------------------------------
  // Answering machine, start: the lid click, the tape winding back, then the beep.
  secretaria_inicio({ K, t, r }) {
    K.tick(t, { f0: 1600, g: 0.3 }); K.tone(t, 0.05, { type: 'triangle', f0: 320, f1: 200, g: 0.2, att: 0.001 });
    K.tone(t + 0.1, 1.0, { type: 'sawtooth', f0: 700, f1: 1450, g: 0.025, att: 0.1, sus: 0.3, lp: 1900, vib: { rate: 9, depth: 18 } }); // the rewind whine
    K.noise(t + 0.1, 1.0, { type: 'bandpass', f0: 3000, q: 0.9, g: 0.03, att: 0.1, sus: 0.3, off: r() });
    K.tick(t + 1.15, { f0: 1300, g: 0.22 });
    K.tone(t + 1.3, 0.38, { type: 'square', f0: 1000, g: 0.045, att: 0.004, sus: 0.03, lp: 2600 }); // the beep
    return 1.8;
  },
  // Answering machine, the tape itself under a message: motor, hiss, the faint wobble of old oxide.
  // o.dur (default 6). o.estranho: a message that should not be there, a fluorescent hum behind it.
  secretaria_fita({ K, t, r, o }) {
    const d = o.dur ?? 6, sus = Math.min(0.6, d * 0.3);
    K.noise(t, d, { type: 'highpass', f0: 3300, g: 0.028, att: 0.15, sus, off: r() });
    K.noise(t, d, { kind: 'brown', type: 'bandpass', f0: 110, q: 2, g: 0.05, att: 0.15, sus, off: r() }); // the capstan
    K.tone(t, d, { f0: 50, g: 0.018, att: 0.2, sus, lp: 200, vib: { rate: 0.9, depth: 0.5 } });
    K.noise(t, d, { type: 'bandpass', f0: 1100, q: 0.6, g: 0.012, att: 0.2, sus, am: { rate: 5.5, depth: 0.5 }, off: r() }); // wow
    if (o.estranho) for (const [fq, g] of [[120, 0.03], [180, 0.012], [60, 0.018]]) K.tone(t + 0.4, d - 0.4, { f0: fq, g, att: d * 0.4, sus, lp: 900 });
    return d + 0.05;
  },
  // Answering machine, end: two short beeps, the tape stopping with a small groan, the click.
  secretaria_fim({ K, t }) {
    for (let k = 0; k < 2; k++) K.tone(t + k * 0.22, 0.14, { type: 'square', f0: 1000, g: 0.04, att: 0.004, sus: 0.02, lp: 2600 });
    K.tone(t + 0.55, 0.45, { type: 'sawtooth', f0: 400, f1: 70, g: 0.025, att: 0.02, lp: 900 });
    K.tick(t + 1.0, { f0: 1500, g: 0.3 }); K.tone(t + 1.0, 0.05, { type: 'triangle', f0: 300, f1: 180, g: 0.2, att: 0.001 });
    return 1.2;
  },
  // The pharmacy's door: an electronic two-note chime, a little out of tune, and the weather strip.
  farmacia_sino({ K, t, r }) {
    const p = vary(r, 0.02);
    for (const [dt, f] of [[0, 988 * p], [0.34, 784 * p]]) {
      K.tone(t + dt, 0.6, { type: 'triangle', f0: f, g: 0.1, att: 0.004, lp: 3200 });
      K.tone(t + dt, 0.4, { f0: f * 2.01, g: 0.025, att: 0.004 });
    }
    K.noise(t, 0.12, { type: 'bandpass', f0: 700, f1: 300, q: 1, g: 0.05, att: 0.03, off: r() });
    return 1.0;
  },
  // A plastic bag taken from the counter: crackle in short, uneven bursts.
  sacola({ K, t, r }) {
    let tt = t;
    for (let k = 0; k < 7; k++) {
      const len = 0.04 + r() * 0.12;
      K.noise(tt, len, { type: 'bandpass', f0: 3200 + r() * 1800, q: 0.8, g: 0.1 * (1 - k * 0.08), att: 0.004, am: { rate: 60 + r() * 50, depth: 0.9 }, off: r() });
      tt += len + r() * 0.07;
    }
    return tt - t + 0.2;
  },
  // Lying down: the springs, the weight of a body on the mattress, a long breath out.
  cama_deita({ K, t, r }) {
    for (const [dt, f0] of [[0.05, 430], [0.28, 560], [0.5, 380]]) K.tone(t + dt, 0.12, { type: 'sawtooth', f0: f0 * vary(r, 0.2), f1: f0 * 1.35, g: 0.012, att: 0.02, lp: 1200, vib: { rate: 32, depth: 24 } });
    K.tone(t + 0.1, 0.3, { f0: 82, f1: 48, g: 0.2, att: 0.03 });
    K.noise(t, 0.6, { kind: 'brown', type: 'lowpass', f0: 380, f1: 140, g: 0.17, att: 0.08, off: r() }); // cloth and mattress
    K.noise(t + 0.5, 1.5, { kind: 'pink', type: 'bandpass', f0: 800, f1: 420, q: 1.4, g: 0.07, att: 0.4, sus: 0.8, off: r() }); // the breath
    return 2.1;
  },
  // The fishing rod taken off its hooks: the wood against the wall, the line singing for a moment.
  vara_pega({ K, t, r }) {
    K.tone(t, 0.07, { f0: 170, f1: 110, g: 0.2, att: 0.002 }); K.noise(t, 0.05, { type: 'bandpass', f0: 1100, q: 1.3, g: 0.12, att: 0.002, off: r() });
    K.tone(t + 0.06, 0.5, { f0: 2400, f1: 2100, g: 0.012, att: 0.01, vib: { rate: 6, depth: 25 } });
    K.noise(t + 0.15, 0.2, { type: 'bandpass', f0: 2500, q: 2, g: 0.03, att: 0.04, off: r() });
    return 0.8;
  },
  // A page or a bill turned over: dry paper, one edge catching.
  papel_folha({ K, t, r }) {
    K.noise(t, 0.2, { type: 'bandpass', f0: 2600, f1: 4200, q: 1.1, g: 0.09, att: 0.06, off: r() });
    K.noise(t + 0.17, 0.09, { type: 'bandpass', f0: 1800, q: 1.4, g: 0.1, att: 0.003, off: r() });
    K.tone(t + 0.19, 0.04, { f0: 140, f1: 100, g: 0.06, att: 0.002 });
    return 0.45;
  },
};

export const FASE6_LOOPS = {
  // The street at night from inside a house: a distant road, a lamp's buzz, and now and then a single
  // car going by far off. Not a place to be: it sits behind a wall (play it positioned at the window).
  rua_noite(L) {
    const { ctx, r } = L;
    L.src('brown', r()).connect(filt(ctx, 'lowpass', 170, 0.6)).connect(gain(ctx, 0.12)).connect(L.out);
    L.osc('sine', 100 * vary(r, 0.02)).connect(gain(ctx, 0.004)).connect(L.out); // the streetlamp
    L.osc('sine', 300).connect(gain(ctx, 0.0012)).connect(L.out);
    let cursor = L.t0 + 3 + r() * 5;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor, d = 3.5 + r() * 2, dirn = r() < 0.5 ? -1 : 1, level = 0.07 * (0.7 + r() * 0.6), off = r();
        if (ok(t)) {
          const src = ctx.createBufferSource(); src.buffer = L.A.noise('pink'); src.loop = true;
          const f = filt(ctx, 'bandpass', 240, 1), a = gain(ctx, 0.0001);
          f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(480, t + d * 0.5); f.frequency.linearRampToValueAtTime(210, t + d);
          a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(level, t + d * 0.5); a.gain.linearRampToValueAtTime(0.0001, t + d);
          let tail = a;
          if (!L.spatial) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.6 * dirn, t); p.pan.linearRampToValueAtTime(0.6 * dirn, t + d); a.connect(p); tail = p; }
          src.connect(f).connect(a); tail.connect(L.out);
          src.start(t, off * 3); src.stop(t + d + 0.1);
        } else r();
        cursor += 9 + r() * 16;
      }
    });
  },
  // The quiet of a small house: a low room tone and a wall clock, tick and tock, every second.
  casa_tom(L) {
    const { ctx, r } = L;
    L.src('brown', r()).connect(filt(ctx, 'lowpass', 110, 0.6)).connect(gain(ctx, 0.06)).connect(L.out);
    L.src('pink', r()).connect(filt(ctx, 'bandpass', 900, 0.5)).connect(gain(ctx, 0.0015)).connect(L.out);
    let cursor = L.t0 + 0.5, k = 0;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor, hi = k % 2 === 0;
        if (ok(t)) { L.K.tick(t, { f0: hi ? 2400 : 1900, g: 0.09 }); L.K.tone(t, 0.04, { f0: hi ? 1250 : 980, f1: hi ? 1050 : 880, g: 0.07, att: 0.001, lp: 2400 }); }
        cursor += 1.0; k++;
      }
    });
  },
  // The pharmacy: a refrigerated case's compressor, a vent, and a tube humming softer than the posto's.
  farmacia_ar(L) {
    const { ctx, r } = L;
    L.osc('sawtooth', 62).connect(filt(ctx, 'lowpass', 220)).connect(gain(ctx, 0.07)).connect(L.out);
    L.osc('sine', 124).connect(gain(ctx, 0.022)).connect(L.out);
    L.osc('sine', 120 * (1 + (r() - 0.5) * 0.0008)).connect(gain(ctx, 0.016)).connect(L.out); // the tube, kept low
    const vent = L.src('pink', r()), vb = filt(ctx, 'bandpass', 520, 0.5), vg = gain(ctx, 0.03);
    L.lfo('sine', 0.11, 0.012, vg.gain); vent.connect(vb).connect(vg).connect(L.out);
    L.src('white', r()).connect(filt(ctx, 'bandpass', 2600, 1.4)).connect(gain(ctx, 0.002)).connect(L.out);
  },
  // The first light: a few birds that do not know it is still night. Seeded chirps in short phrases over
  // a thin cold air. Calm, never busy: long silences between phrases.
  amanhecer(L) {
    const { ctx, r } = L;
    L.src('pink', r()).connect(filt(ctx, 'bandpass', 700, 0.4)).connect(gain(ctx, 0.012)).connect(L.out);
    let cursor = L.t0 + 1 + r() * 2;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor, n = 2 + pick(r, 4), base = 3000 + r() * 1800, pan = (r() - 0.5) * 1.2;
        let tt = t;
        for (let i = 0; i < n; i++) {
          const f = base * (1 + (r() - 0.5) * 0.25), len = 0.07 + r() * 0.08, up = r() < 0.6;
          if (ok(tt)) { L.K.tone(tt, len, { f0: up ? f * 0.8 : f * 1.1, f1: up ? f * 1.15 : f * 0.85, g: 0.05, att: 0.008, lp: 6500, pan: L.spatial ? undefined : pan }); L.K.tone(tt, len * 0.8, { f0: f * 2, f1: f * 2.2, g: 0.008, att: 0.006, pan: L.spatial ? undefined : pan }); }
          tt += len + 0.05 + r() * 0.1;
        }
        cursor += 4 + r() * 9;
      }
    });
  },
};

export const FASE6_NAMES = [...Object.keys(FASE6_ONESHOTS), ...Object.keys(FASE6_LOOPS)];
