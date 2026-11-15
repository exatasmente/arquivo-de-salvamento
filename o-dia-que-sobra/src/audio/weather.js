// The weather's sounds: the thunder (late by the distance of the bolt), the rain on the canopy (hard, metal) and on the shop's roof (soft, from inside), the drip
// that finds a way in. The rain in the open is the `chuva` loop of loops.js. Same contracts as oneshots.js and loops.js (one-shots are fn({ K, t, r, o }) -> seconds;
// loops are fn(L)). The thunder is strong and never clips: its peak after the chain stays under -3 dBFS (tools/smoke.mjs measures it). o.gain scales it.
import { curveOf, vary, clamp } from './util.js';

const narrowPulse = curveOf((x) => (x > 0.86 ? 1 : 0), 257);
const shaper = (ctx, curve) => { const s = ctx.createWaveShaper(); s.curve = curve; return s; };
const gain = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (ctx, type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

export const WEATHER_ONESHOTS = {
  // The thunder. o.dist: kilometres from the bolt (0.2 to 8, default 2). Close: a crack, then a heavy roll. Far: only a low, long rumble that comes and goes.
  trovao({ K, t, r, o }) {
    const km = clamp(o.dist ?? 2, 0.2, 8), g = o.gain ?? 1;
    const near = clamp(1 - (km - 0.3) / 2.4, 0, 1), far = clamp((km - 1) / 5, 0, 1);
    const tail = 3 + km * 0.5, lag = (1 - near) * 0.3;
    if (near > 0.02) {
      K.tick(t, { f0: 3200, g: 0.2 * near * g });
      K.noise(t, 0.14, { type: 'lowpass', f0: 7000, f1: 1500, g: 0.26 * near * g, att: 0.001, off: r() });                                  // the crack
      K.noise(t + 0.01, 0.4, { type: 'bandpass', f0: 1900, f1: 520, q: 0.8, g: 0.2 * near * g, att: 0.003, off: r() });                        // the tear after it
    }
    K.noise(t + lag, tail, { kind: 'brown', type: 'lowpass', f0: 420 - 190 * far, f1: 55, q: 0.9, g: (0.5 - 0.22 * far) * g, att: 0.04 + (1 - near) * 0.7, am: { rate: 4 + r() * 3, depth: 0.5 }, off: r() }); // the roll
    K.tone(t + lag, tail * 0.7, { f0: 58 * vary(r, 0.2), f1: 31, g: (0.12 + 0.2 * near) * g, att: 0.05 + (1 - near) * 0.5, lp: 150 });        // the weight under it
    for (let i = 0; i < 3; i++) {                                                                                                          // the echoes off the hills
      const at = t + lag + 0.7 + i * (0.8 + r() * 0.9);
      K.noise(at, 1.3 + r(), { kind: 'brown', type: 'lowpass', f0: 280 - i * 50, f1: 50, q: 0.8, g: (0.2 - i * 0.045) * g * (1 - 0.3 * far), att: 0.18, off: r() });
    }
    return tail + 1.6;
  },
  // One drop that lands on something hard (the drip of the shop's ceiling, the canopy's edge): a short wet knock with a little ring. o.f (default 900 Hz).
  goteira({ K, t, r, o }) {
    const f = (o.f ?? 900) * vary(r, 0.3);
    K.tone(t, 0.07, { f0: f * 1.6, f1: f * 0.9, g: 0.1, att: 0.001, lp: 3500 });
    K.noise(t, 0.05, { type: 'bandpass', f0: f * 2.4, q: 1.6, g: 0.07, att: 0.001, off: r() });
    K.metal(t + 0.004, f * 2.2, [[1, 0.025, 0.12], [1.8, 0.012, 0.08]]);
    return 0.3;
  },
};

export const WEATHER_LOOPS = {
  // Rain on the canopy: a dense drumming on sheet metal, close, with the heavy drops falling from its edge. Louder and brighter than the rain in the open.
  chuva_cobertura(L) {
    const { ctx, r } = L;
    L.src('white', r()).connect(filt(ctx, 'bandpass', 2600, 0.55)).connect(gain(ctx, 0.09)).connect(L.out);
    L.src('pink', r()).connect(filt(ctx, 'bandpass', 900, 0.7)).connect(gain(ctx, 0.1)).connect(L.out);
    L.src('brown', r()).connect(filt(ctx, 'lowpass', 220)).connect(gain(ctx, 0.12)).connect(L.out);
    for (const [fq, fc, g] of [[37, 3000, 0.1], [53, 4200, 0.07], [29, 1700, 0.09], [11, 700, 0.1]]) {
      const saw = L.osc('sawtooth', fq * vary(r, 0.1)), ps = shaper(ctx, narrowPulse), gg = gain(ctx, 0), n = L.src('white', r());
      saw.connect(ps).connect(gg.gain); L.lfo('sine', 0.5 + r() * 1.2, fq * 0.35, saw.frequency);
      n.connect(filt(ctx, 'bandpass', fc, 3)).connect(gg).connect(gain(ctx, g)).connect(L.out);
    }
    L.onSet((k, v) => { if (k === 'wet') L.out.gain.value = 0.6 + 0.4 * clamp(v, 0, 1); });
  },
  // Rain on the shop's roof, from inside: the high part of it is gone, what is left is a soft, even patter and the low hush.
  chuva_loja(L) {
    const { ctx, r } = L;
    L.src('pink', r()).connect(filt(ctx, 'lowpass', 1500)).connect(filt(ctx, 'highpass', 180)).connect(gain(ctx, 0.12)).connect(L.out);
    L.src('brown', r()).connect(filt(ctx, 'lowpass', 160)).connect(gain(ctx, 0.14)).connect(L.out);
    for (const [fq, fc, g] of [[19, 1100, 0.06], [13, 800, 0.05]]) {
      const saw = L.osc('sawtooth', fq * vary(r, 0.1)), ps = shaper(ctx, narrowPulse), gg = gain(ctx, 0), n = L.src('pink', r());
      saw.connect(ps).connect(gg.gain); L.lfo('sine', 0.4 + r(), fq * 0.3, saw.frequency);
      n.connect(filt(ctx, 'bandpass', fc, 2)).connect(gg).connect(gain(ctx, g)).connect(L.out);
    }
  },
};
export const WEATHER_NAMES = [...Object.keys(WEATHER_ONESHOTS), ...Object.keys(WEATHER_LOOPS)];
