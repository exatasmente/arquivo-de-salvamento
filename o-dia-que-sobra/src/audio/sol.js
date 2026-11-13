// The Sun (the gas station mascot): its own sonic identity. Low, close to silence, never a bang.
//
//  - A beating pair of sub tones (47 and 49.6 Hz) that you feel more than hear.
//  - A thin paper hiss: the printed face worn like a mask.
//  - A ghost of the 1998 promotion jingle, a music-box phrase in a major key that sags and is cut
//    off before it finishes (see sol_presenca in loops.js).
// Everything here is kept low on purpose; index.js also trims the Sun's voices.
import { pick, vary } from './util.js';

export const SOL_ONESHOTS = {
  // Shoes with a worn heel, in no hurry. o.n steps (default 4), the gaps are a little uneven.
  sol_passos({ K, t, r, o }) {
    const n = o.n ?? 4;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const p = vary(r, 0.25);
      K.noise(tt, 0.14, { kind: 'brown', f0: 240 * p, f1: 90, q: 0.8, g: 0.34, att: 0.012, off: r() });
      K.tone(tt, 0.16, { f0: 68 * p, f1: 40, g: 0.22, att: 0.01 });
      K.noise(tt + 0.02, 0.05, { type: 'bandpass', f0: 3300, q: 3, g: 0.012 + r() * 0.01, att: 0.004, off: r() }); // paper in the sleeve
      if (i % 2 === 1) K.tone(tt + 0.05, 0.22, { type: 'sawtooth', f0: 1050 * p, f1: 1450 * p, g: 0.009, att: 0.05, sus: 0.1, lp: 1700, vib: { rate: 43, depth: 40 } }); // a sole creak
      tt += (0.74 + (i % 2 ? 0.1 : -0.06)) * (0.92 + r() * 0.16);
    }
    return tt - t + 0.2;
  },
  // A long breath through a paper mask. The edge of the mouth flutters.
  sol_respira({ K, t, r }) {
    const p = vary(r, 0.1);
    K.noise(t, 1.5, { kind: 'pink', type: 'bandpass', f0: 760 * p, f1: 900 * p, q: 3.5, g: 0.1, att: 0.7, sus: 0.6, am: { rate: 10.5, depth: 0.35 }, off: r() });
    K.noise(t, 1.5, { type: 'bandpass', f0: 3000, q: 4, g: 0.012, att: 0.7, sus: 0.6, am: { rate: 8, depth: 0.5 }, off: r() });
    K.noise(t + 1.7, 1.6, { kind: 'pink', type: 'bandpass', f0: 820 * p, f1: 520 * p, q: 3, g: 0.1, att: 0.25, sus: 1.1, am: { rate: 12.5, depth: 0.35 }, off: r() });
    K.tone(t + 1.9, 1.2, { f0: 2150 * p, f1: 2020 * p, g: 0.003, att: 0.3, sus: 0.7 }); // a pinhole whistle
    return 3.5;
  },
  // For the sign: the smile widens. A sunny chord swells backwards and sags out of tune, a paper
  // stretching, and a tiny dry click of a mouth closing. No attack.
  sol_sorriso({ K, t, r }) {
    const f = 523.25;
    [[1, -35, -90], [1.26, 25, -45], [1.498, -60, -120]].forEach(([ratio, c0, c1], i) => {
      const a = f * ratio * 2 ** (c0 / 1200), b = f * ratio * 2 ** (c1 / 1200);
      K.tone(t, 1.3, { f0: a, f1: b, g: 0.02, att: 0.8, sus: 0.45, lp: 2200, vib: { rate: 4 + i * 0.7, depth: a * 0.012 } });
    });
    K.noise(t + 0.1, 1.0, { kind: 'pink', type: 'bandpass', f0: 2300, f1: 3500, q: 5, g: 0.035, att: 0.5, sus: 0.4, am: { rate: 7, depth: 0.5 }, off: r() });
    K.noise(t + 1.35, 0.03, { type: 'bandpass', f0: 1800, q: 1.5, g: 0.07, att: 0.003, off: r() });
    K.tone(t + 1.35, 0.05, { f0: 300, f1: 200, g: 0.04, att: 0.004 });
    return 1.7;
  },
  // Camera static: a washed snow with a rolling bar, now and then a hold of the sync. o.dur (default 1.2).
  estatica_camera({ K, t, r, o }) {
    const dur = o.dur ?? 1.2, sus = Math.min(0.25, dur / 3);
    K.noise(t, dur, { type: 'bandpass', f0: 2800, q: 0.45, g: 0.17, att: 0.02, sus, off: r() });
    K.noise(t, dur, { type: 'highpass', f0: 4500, g: 0.05, att: 0.02, sus, off: r() });
    for (let tb = t + r() * 0.2; tb < t + dur - 0.15; tb += 0.3 + r() * 0.2) K.noise(tb, 0.22, { type: 'bandpass', f0: 5000, f1: 700, q: 3, g: 0.06, att: 0.05, off: r() }); // the roll bar
    K.tone(t, dur, { f0: 60, g: 0.035, att: 0.02, sus });
    K.tone(t, dur, { f0: 120, g: 0.02, att: 0.02, sus });
    return dur + 0.05;
  },
  // Power failing: the building's hum falls through the floor, a soft thump of the transformer,
  // relays ticking, then room tone. Soft attacks: it must never bang.
  apagao({ K, t, r }) {
    K.tick(t, { f0: 1400, g: 0.16 });
    K.tone(t + 0.02, 1.5, { f0: 60, f1: 17, g: 0.16, att: 0.03, sus: 0.5 });
    K.tone(t + 0.02, 1.3, { f0: 120, f1: 28, g: 0.12, att: 0.03, sus: 0.5 });
    K.tone(t + 0.02, 1.1, { type: 'sawtooth', f0: 180, f1: 40, g: 0.05, att: 0.03, sus: 0.5, lp: 600 });
    K.tone(t + 0.04, 0.5, { f0: 55, f1: 32, g: 0.26, att: 0.03, sus: 0.2 });
    K.noise(t + 0.02, 0.9, { kind: 'brown', f0: 260, f1: 60, g: 0.22, att: 0.05, sus: 0.5, off: r() });
    for (let k = 0; k < 5; k++) K.tick(t + 0.2 + k * 0.17 + r() * 0.08, { f0: 1200 + r() * 1500, g: 0.06 / (1 + k * 0.4) });
    K.tone(t + 0.8, 2.5, { f0: 6200, f1: 6150, g: 0.004, att: 0.6, sus: 1.4 }); // the ringing quiet after
    return 3.4;
  },
};
