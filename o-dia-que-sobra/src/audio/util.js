// Small helpers shared by the audio modules. Nothing here touches Math.random or the wall clock.

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
