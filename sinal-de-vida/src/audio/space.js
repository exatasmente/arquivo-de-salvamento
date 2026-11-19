// The rooms of the game's sound: one reverb per kind of place, each a ConvolverNode with an impulse response made here (noise with an
// exponential decay that darkens as it goes, a few early reflections, and a flutter between parallel walls where there is one). No
// recorded impulse: a room is a function of its numbers and a seed, so an offline render gives the room the game plays.
//
//   const space = createSpace(ctx, { out: bus, seed: 1, room: 'galeria' });
//   space.input('poco')   -> a GainNode: connect a voice to it (scaled by space.wetOf('poco')) and its reverb comes out in `out`
//   space.setRoom('rua'); space.room; space.rooms
// Each room is built the first time it is used (a convolver is not free), and its impulse is scaled to unit energy, so a send of 0.3
// is a reverb about 5 dB under the dry sound whatever the length of the room.
import { rng, hash } from '../../vendor/engine/sound.js';

/** t60: seconds to fall 60 dB; pre: the gap before the first echo; damp: the cut-off of the tail's brightness at the start (Hz); wet: the send level; early: how many reflections; flutter: spacing of a ping-pong between walls (s). */
export const SPACES = {
  estacao: { t60: 3.4, pre: 0.03, damp: 4200, wet: 0.36, early: 9 },
  galeria: { alias: 'estacao' },
  poco: { t60: 1.3, pre: 0.004, damp: 3000, wet: 0.42, early: 4, flutter: 0.011 },
  rua: { t60: 1.9, pre: 0.07, damp: 2600, wet: 0.2, early: 4 },
  predio: { t60: 2.3, pre: 0.012, damp: 5000, wet: 0.34, early: 6, flutter: 0.021 },
};
export const SPACE_NAMES = Object.keys(SPACES);
export const resolveSpace = (name) => { const s = SPACES[name]; return !s ? 'estacao' : s.alias ?? name; };

/** The stereo impulse response of a room: [left, right] Float32Arrays at `sr`, scaled to unit energy. */
export function makeImpulse(sr, spec, seed = 1) {
  const len = Math.floor(sr * Math.min(spec.t60 * 1.15, 4)), pre = Math.floor(spec.pre * sr), out = [new Float32Array(len), new Float32Array(len)];
  let energy = 0;
  for (let c = 0; c < 2; c++) {
    const r = rng(hash('ir', seed * 31 + c * 7919)), d = out[c];
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr, env = Math.exp(-6.9078 * t / spec.t60);
      const fc = spec.damp * (1 - 0.75 * Math.min(1, t / spec.t60));            // the tail darkens as it fades
      lp += ((r() * 2 - 1) - lp) * Math.min(1, (2 * Math.PI * fc) / sr);
      d[i] = lp * env * Math.min(1, t / 0.006) * 3;
    }
    // early reflections: a handful of single taps in the first 90 ms, louder than the tail around them
    for (let k = 0; k < spec.early; k++) {
      const at = pre + Math.floor((0.004 + r() * 0.09) * sr);
      if (at < len) d[at] += (r() < 0.5 ? -1 : 1) * (0.9 / (1 + k * 0.35));
    }
    if (spec.flutter) for (let k = 1; k < 14; k++) { const at = pre + Math.floor(k * spec.flutter * sr); if (at < len) d[at] += (k % 2 ? 1 : -1) * 0.75 ** k; }
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
  }
  const k = 1 / Math.sqrt(energy / 2 || 1);
  for (const d of out) for (let i = 0; i < len; i++) d[i] *= k;
  return out;
}

export function createSpace(ctx, { out, seed = 1, room = 'estacao' } = {}) {
  const rooms = new Map();
  let current = resolveSpace(room);
  function build(name) {
    const spec = SPACES[name], ir = makeImpulse(ctx.sampleRate, spec, seed), buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    buf.copyToChannel(ir[0], 0); buf.copyToChannel(ir[1], 1);
    const input = ctx.createGain(), conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = buf;
    input.connect(conv).connect(out);
    return { input, conv };
  }
  return {
    input(name) { const n = resolveSpace(name ?? current); if (!rooms.has(n)) rooms.set(n, build(n)); return rooms.get(n).input; },
    wetOf: (name) => SPACES[resolveSpace(name ?? current)].wet,
    setRoom(name) { current = resolveSpace(name); this.input(current); },
    get room() { return current; },
    rooms: SPACE_NAMES,
  };
}
