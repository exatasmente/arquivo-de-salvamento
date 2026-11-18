// The pure part of the face capture: used by the page (the head rotation), by to-cutscene.mjs and by the tests. No DOM, no Node API.

/** The 51 blendshapes of the MediaPipe Face Landmarker (its 52 categories minus `_neutral`; ARKit's tongueOut is not there). */
export const BLENDSHAPES = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft',
  'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower',
  'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
];

/** The limits of the eyes in the model (GAZE in src/models/jonas.js), radians. */
export const GAZE_LIMITS = { x: 0.55, up: 0.3, down: 0.32 };

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * The turn of the head from the 4x4 facial transformation matrix (column-major, 16 numbers): { yaw, pitch, roll } in radians, for
 * R = Ry(yaw) * Rx(pitch) * Rz(roll). The columns are normalised first (the matrix may carry a scale).
 */
export function matrixToEuler(m) {
  const col = (c) => { const v = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]], n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  const [x, y, z] = [col(0), col(1), col(2)];
  const r = { r00: x[0], r10: x[1], r20: x[2], r01: y[0], r11: y[1], r21: y[2], r02: z[0], r12: z[1], r22: z[2] };
  const pitch = Math.asin(clamp(-r.r12, -1, 1));
  if (Math.abs(r.r12) > 0.9999) return { yaw: Math.atan2(-r.r20, r.r00), pitch, roll: 0 };
  return { yaw: Math.atan2(r.r02, r.r22), pitch, roll: Math.atan2(r.r10, r.r11) };
}

/** What the neutral calibration keeps: the mean of the samples ({ b: number[52], h: [yaw, pitch, roll] }). */
export function averageNeutral(samples) {
  if (!samples.length) throw new Error('no samples for the neutral');
  return { names: BLENDSHAPES, b: BLENDSHAPES.map((_, i) => mean(samples.map((s) => s.b[i]))), h: [0, 1, 2].map((i) => mean(samples.map((s) => s.h[i]))) };
}

/** Takes the neutral off a sample: a weight is rescaled so that the neutral is 0 and the full is still 1; the head is a plain difference. */
export function subtractNeutral(sample, neutral) {
  if (!neutral) return sample;
  return { t: sample.t, b: sample.b.map((v, i) => { const n = neutral.b[i] ?? 0; return n >= 0.999 ? 0 : clamp((v - n) / (1 - n)); }), h: sample.h.map((v, i) => v - (neutral.h[i] ?? 0)) };
}

/** The samples ([{ t, b, h }], by time) at `fps` over `duration` seconds, linearly interpolated; before the first and after the last it holds. */
export function resample(samples, fps = 30, duration = null) {
  if (!samples.length) return [];
  const s = [...samples].sort((a, b) => a.t - b.t), dur = duration ?? s[s.length - 1].t, n = Math.max(1, Math.round(dur * fps)), out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    while (j < s.length - 2 && s[j + 1].t <= t) j++;
    const a = s[j], b = s[Math.min(j + 1, s.length - 1)];
    const u = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t));
    out.push({ t, b: a.b.map((v, k) => v + (b.b[k] - v) * u), h: a.h.map((v, k) => v + (b.h[k] - v) * u) });
  }
  return out;
}

/** Smooths with a centred (so it does not delay) symmetric kernel, e.g. [1, 2, 1]; the edges repeat their last value. */
export function smoothSeries(values, kernel) {
  const k = kernel.length >> 1, sum = kernel.reduce((s, v) => s + v, 0);
  return values.map((_, i) => kernel.reduce((s, w, j) => s + w * values[clamp(i + j - k, 0, values.length - 1)], 0) / sum);
}
export function smoothSamples(frames, kernels) {
  const sm = (get) => smoothSeries(frames.map(get), kernels);
  const b = BLENDSHAPES.map((_, k) => sm((f) => f.b[k])), h = [0, 1, 2].map((k) => sm((f) => f.h[k]));
  return frames.map((f, i) => ({ t: f.t, b: b.map((c) => c[i]), h: h.map((c) => c[i]) }));
}

/** The channels of Jonas's face and the blendshapes each one reads (the mean of the sources, or the max where `max`). */
export const CHANNELS = {
  jaw_open: { from: ['jawOpen'] },
  blink: { from: ['eyeBlinkLeft', 'eyeBlinkRight'] },
  eye_wide: { from: ['eyeWideLeft', 'eyeWideRight'] },
  squint: { from: ['eyeSquintLeft', 'eyeSquintRight'] },
  brow_worry: { from: ['browInnerUp'] },
  brow_up: { from: ['browOuterUpLeft', 'browOuterUpRight'] },
  brow_down: { from: ['browDownLeft', 'browDownRight'] },
  smile: { from: ['mouthSmileLeft', 'mouthSmileRight'] },
  frown: { from: ['mouthFrownLeft', 'mouthFrownRight'] },
  mouth_narrow: { from: ['mouthPucker'] },
  lips_close: { from: ['mouthClose'] },
  lips_funnel: { from: ['mouthFunnel'] },
  upper_lip_up: { from: ['mouthUpperUpLeft', 'mouthUpperUpRight'] },
  lower_lip_down: { from: ['mouthLowerDownLeft', 'mouthLowerDownRight'] },
  lips_press: { from: ['mouthPressLeft', 'mouthPressRight'] },
  mouth_left: { from: ['mouthLeft'] },
  mouth_right: { from: ['mouthRight'] },
  cheek: { from: ['cheekSquintLeft', 'cheekSquintRight'] },
};

export const DEFAULT_MAPPING = {
  fps: 30, lag: 0, smooth: { face: [1, 2, 1], gaze: [1, 2, 3, 2, 1], head: [1, 2, 3, 2, 1] },
  channels: Object.fromEntries(Object.keys(CHANNELS).map((k) => [k, { gain: 1 }])),
  gaze: { gain: 1, xSign: 1, ySign: 1 }, head: { gain: 1, yawSign: 1, pitchSign: 1, rollSign: 1, limit: { yaw: 0.6, pitch: 0.4, roll: 0.35 } },
};

/** The mapping of one source ('webcam' | 'livelink'): the file's shared keys with `sources[source]` laid over them (one level deep, per channel). */
export function resolveMapping(mapping, source = null) {
  const own = (source && mapping.sources?.[source]) || {};
  const { sources, ...base } = mapping;
  const channels = { ...(base.channels ?? {}) };
  for (const [k, v] of Object.entries(own.channels ?? {})) channels[k] = { ...(channels[k] ?? {}), ...v };
  return { ...base, ...own, channels, gaze: { ...(base.gaze ?? {}), ...(own.gaze ?? {}) }, head: { ...(base.head ?? {}), ...(own.head ?? {}), limit: { ...(base.head?.limit ?? {}), ...(own.head?.limit ?? {}) } }, smooth: { ...(base.smooth ?? {}), ...(own.smooth ?? {}) } };
}

/** The ARKit name (PascalCase, as the Live Link Face CSV writes it) -> the MediaPipe name (camelCase), by the 52 shared names; matching ignores case. */
export const normalizeName = (name) => BLENDSHAPES.find((b) => b.toLowerCase() === String(name).trim().toLowerCase()) ?? null;

/** One frame in the contract of the model: { morphs: {name: 0..1}, gaze: {x, y}, head: {yaw, pitch, roll} }. `b` is the 52 weights, `h` the head. */
export function mapFrame(frame, mapping = DEFAULT_MAPPING) {
  const w = (name) => frame.b[BLENDSHAPES.indexOf(name)];
  const morphs = {};
  for (const [name, def] of Object.entries(CHANNELS)) {
    const v = def.max ? Math.max(...def.from.map(w)) : mean(def.from.map(w));
    morphs[name] = clamp(v * (mapping.channels?.[name]?.gain ?? 1) + (mapping.channels?.[name]?.offset ?? 0));
  }
  // the eyes: "Left" is the subject's left eye, and out is toward the subject's left; the model's x > 0 is to his left, y > 0 is up
  const gx = ((w('eyeLookOutLeft') + w('eyeLookInRight')) - (w('eyeLookInLeft') + w('eyeLookOutRight'))) / 2;
  const gy = ((w('eyeLookUpLeft') + w('eyeLookUpRight')) - (w('eyeLookDownLeft') + w('eyeLookDownRight'))) / 2;
  const g = mapping.gaze ?? {}, gain = g.gain ?? 1;
  const x = clamp(gx * gain * (g.xSign ?? 1), -1, 1) * GAZE_LIMITS.x;
  const yv = clamp(gy * gain * (g.ySign ?? 1), -1, 1);
  const y = yv >= 0 ? yv * GAZE_LIMITS.up : yv * GAZE_LIMITS.down;
  const hd = mapping.head ?? {}, lim = hd.limit ?? {}, hg = hd.gain ?? 1;
  const head = {
    yaw: clamp(frame.h[0] * hg * (hd.yawSign ?? 1), -(lim.yaw ?? 0.6), lim.yaw ?? 0.6),
    pitch: clamp(frame.h[1] * hg * (hd.pitchSign ?? 1), -(lim.pitch ?? 0.4), lim.pitch ?? 0.4),
    roll: clamp(frame.h[2] * hg * (hd.rollSign ?? 1), -(lim.roll ?? 0.35), lim.roll ?? 0.35),
  };
  return { morphs, gaze: { x, y }, head };
}

/** The whole pipeline: the take ({ duration, frames: [{ t, b, h }] }) and the neutral -> the per-frame series the scene reads. */
export function convertTake(take, neutral, mappingFile = DEFAULT_MAPPING) {
  const mapping = resolveMapping(mappingFile, take.source ?? null);
  const fps = mapping.fps ?? 30, lag = mapping.lag ?? 0;
  const samples = take.frames.map((f) => subtractNeutral({ t: f.t - lag, b: f.b, h: f.h }, neutral));
  const frames = smoothSamples(resample(samples, fps, take.duration), mapping.smooth?.face ?? [1, 2, 1]);
  // gaze and head have their own (longer) smoothing: they move slowly and the camera jitters them
  const slow = smoothSamples(frames, mapping.smooth?.head ?? [1, 2, 3, 2, 1]);
  const mapped = frames.map((f, i) => { const m = mapFrame(f, mapping), s = mapFrame(slow[i], mapping); return { morphs: m.morphs, gaze: s.gaze, head: s.head }; });
  const r = (v) => Math.round(v * 1000) / 1000;
  const out = { n: mapped.length, morphs: {}, gaze: { x: mapped.map((f) => r(f.gaze.x)), y: mapped.map((f) => r(f.gaze.y)) }, head: {} };
  for (const k of Object.keys(CHANNELS)) out.morphs[k] = mapped.map((f) => r(f.morphs[k]));
  for (const k of ['yaw', 'pitch', 'roll']) out.head[k] = mapped.map((f) => r(f.head[k]));
  return out;
}

/** The live version of convertTake for one source: frame by frame, with a causal smoothing (the past only, a few frames), since the centred one needs the future. */
export function createLiveMapper(mappingFile, source, neutral = null) {
  const mapping = resolveMapping(mappingFile, source);
  const faceK = [1, 2, 3], slowK = [1, 2, 3, 4], hist = [];
  const avg = (k, get) => { const n = Math.min(k.length, hist.length), ws = k.slice(k.length - n); let s = 0, w = 0; for (let i = 0; i < n; i++) { s += ws[i] * get(hist[hist.length - n + i]); w += ws[i]; } return s / w; };
  return {
    mapping,
    /** One sample ({ b, h }) in, the frame of the model out: { morphs, gaze, head }. */
    push(sample) {
      hist.push(subtractNeutral({ t: 0, b: sample.b, h: sample.h }, neutral)); if (hist.length > slowK.length) hist.shift();
      const face = { b: BLENDSHAPES.map((_, i) => avg(faceK, (f) => f.b[i])), h: [0, 1, 2].map((i) => avg(faceK, (f) => f.h[i])) };
      const slow = { b: BLENDSHAPES.map((_, i) => avg(slowK, (f) => f.b[i])), h: [0, 1, 2].map((i) => avg(slowK, (f) => f.h[i])) };
      const m = mapFrame(face, mapping), s = mapFrame(slow, mapping);
      return { morphs: m.morphs, gaze: s.gaze, head: s.head };
    },
  };
}

/** Checks the shape of a mapping file (what the server accepts to save): only known keys, finite numbers in a sane range, signs of 1 or -1. */
export function validateMapping(m) {
  const fail = (why) => { throw new Error(`bad mapping: ${why}`); };
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(`${what} must be a number in ${lo}..${hi}`); };
  const sign = (v, what) => { if (v !== 1 && v !== -1) fail(`${what} must be 1 or -1`); };
  const only = (o, keys, what) => { if (!isObj(o)) fail(`${what} must be an object`); for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${what}: unknown key ${k}`); };
  only(m, ['fps', 'lag', 'smooth', 'sources'], 'mapping');
  if (m.fps !== undefined) num(m.fps, 1, 120, 'fps'); if (m.lag !== undefined) num(m.lag, -2, 2, 'lag');
  const kernel = (a, what) => { if (!Array.isArray(a) || a.length < 1 || a.length > 9 || a.length % 2 === 0) fail(`${what} must be an odd-length list`); a.forEach((v) => num(v, 0, 100, what)); };
  if (m.smooth !== undefined) { only(m.smooth, ['face', 'gaze', 'head'], 'smooth'); for (const [k, v] of Object.entries(m.smooth)) kernel(v, `smooth.${k}`); }
  only(m.sources ?? {}, ['webcam', 'livelink'], 'sources');
  for (const [name, src] of Object.entries(m.sources ?? {})) {
    only(src, ['lag', 'smooth', 'channels', 'gaze', 'head'], name);
    if (src.lag !== undefined) num(src.lag, -2, 2, `${name}.lag`);
    if (src.smooth !== undefined) { only(src.smooth, ['face', 'gaze', 'head'], `${name}.smooth`); for (const [k, v] of Object.entries(src.smooth)) kernel(v, `${name}.smooth.${k}`); }
    if (src.channels !== undefined) { only(src.channels, Object.keys(CHANNELS), `${name}.channels`); for (const [c, d] of Object.entries(src.channels)) { only(d, ['gain', 'offset'], `${name}.${c}`); if (d.gain !== undefined) num(d.gain, 0, 10, `${name}.${c}.gain`); if (d.offset !== undefined) num(d.offset, -1, 1, `${name}.${c}.offset`); } }
    if (src.gaze !== undefined) { only(src.gaze, ['gain', 'xSign', 'ySign'], `${name}.gaze`); if (src.gaze.gain !== undefined) num(src.gaze.gain, 0, 10, `${name}.gaze.gain`); for (const k of ['xSign', 'ySign']) if (src.gaze[k] !== undefined) sign(src.gaze[k], `${name}.gaze.${k}`); }
    if (src.head !== undefined) {
      only(src.head, ['gain', 'yawSign', 'pitchSign', 'rollSign', 'limit'], `${name}.head`);
      if (src.head.gain !== undefined) num(src.head.gain, 0, 10, `${name}.head.gain`);
      for (const k of ['yawSign', 'pitchSign', 'rollSign']) if (src.head[k] !== undefined) sign(src.head[k], `${name}.head.${k}`);
      if (src.head.limit !== undefined) { only(src.head.limit, ['yaw', 'pitch', 'roll'], `${name}.head.limit`); for (const [k, v] of Object.entries(src.head.limit)) num(v, 0, 1.6, `${name}.head.limit.${k}`); }
    }
  }
  return m;
}
