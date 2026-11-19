// (the same contract as src/audio/index.js: createMachineAudio(ctx, { seed, destination, era }) -> { play(name, { at, gain|vol, pos }), start, names })
// The dog is a heavy, quiet machine: fear comes from hearing little and close, not from beeps. Everything lives low
// (under ~1 kHz; only the clicks and the sensor's air reach higher, and they are never the main thing), and each
// state reads apart:
//   calm       heavy damped footfalls and a low hydraulic whine that follows the gait
//   suspicious the steps stop; one dry relay click, a short low whir like a lens focusing, a second click
//   search     a slow low scanning hum with tiny servo ticks as the head turns
//   chase      a lock (a hit of low dissonance after a held silence), the motor revving up, fast heavy steps
// Nothing here touches Math.random or the wall clock: a sound is a function of its seed and the context's time.
import { makeKit, makeNoise, createChain, rng, hash, isOffline } from '../../vendor/engine/sound.js';
import { createSpace } from './space.js';
import { createVoiceFactory } from './voice.js';

// One heavy footfall: a low thud, a body of brown noise, a damped metal knock (low partials, very short: no ring)
// and a soft contact tick. `w` is the weight, 1 = a walk.
function foot(K, t, r, w = 1, base = 150) {
  const f = base * (0.92 + r() * 0.16);
  K.tone(t, 0.14, { type: 'sine', f0: 105 * w ** 0.2, f1: 42, g: 0.34 * w, att: 0.002 });
  K.noise(t, 0.09, { kind: 'brown', type: 'lowpass', f0: 650 + r() * 150, g: 0.3 * w, att: 0.002 });
  K.noise(t, 0.05, { kind: 'pink', type: 'bandpass', f0: 380 + r() * 90, q: 1.6, g: 0.12 * w, att: 0.002 });   // the body of the plate, so a small speaker still has the step
  K.metal(t + 0.004, f, [[1, 0.17 * w, 0.055], [1.9, 0.12 * w, 0.04], [3.1, 0.06 * w, 0.03]]);
  K.tick(t, { g: 0.09 * w, f0: 1400, dur: 0.01 });
}

const ONE = {
  // The gait: four heavy hits (the forelegs a little apart from the hind ones), each a thud with damped metal, a hair
  // different every time (seeded), and under them a hydraulic whine that leans into each step and a servo that holds.
  'cao-rolar': ({ K, t, r }) => {
    const hits = [0, 0.1, 0.22, 0.32].map((h) => h + (r() - 0.5) * 0.014);
    hits.forEach((h, i) => {
      foot(K, t + h, r, i % 2 === 0 ? 1 : 0.78, 135 + (i % 2) * 22);
      const f = 150 + r() * 25;
      K.tone(t + h - 0.02, 0.13, { type: 'triangle', f0: f, f1: f * 1.35, g: 0.05, att: 0.03, lp: 520 });
    });
    K.tone(t, 0.4, { type: 'sawtooth', f0: 62 + r() * 6, f1: 74, g: 0.035, att: 0.06, lp: 260, am: { rate: 9 + r() * 2, depth: 0.45 } });
    return 0.44;
  },
  // Heard something: it stops. A dry relay click, a short low whir of the sensor focusing (like a lens), a second smaller click.
  'cao-desconfiado': ({ K, t, r }) => {
    K.tick(t + 0.06, { g: 0.2, f0: 1700, dur: 0.008 });
    K.tone(t + 0.06, 0.05, { type: 'sine', f0: 210, f1: 120, g: 0.18, att: 0.001 });
    K.noise(t + 0.06, 0.04, { kind: 'brown', type: 'lowpass', f0: 500, g: 0.12, att: 0.001 });
    const f = 150 + r() * 20;
    K.tone(t + 0.16, 0.34, { type: 'triangle', f0: f, f1: f * 2.6, g: 0.08, att: 0.06, sus: 0.1, lp: 650, vib: { rate: 17, depth: 5 } });
    K.noise(t + 0.16, 0.34, { kind: 'pink', type: 'bandpass', f0: 500, f1: 900, q: 3, g: 0.06, att: 0.08, sus: 0.1 });
    K.tick(t + 0.52, { g: 0.12, f0: 1500, dur: 0.008 });
    K.tone(t + 0.52, 0.04, { type: 'sine', f0: 170, f1: 100, g: 0.1, att: 0.001 });
    return 0.62;
  },
  // Searching: a slow, low scanning hum that leans one way and then the other, with tiny servo ticks as the head turns.
  'cao-busca': ({ K, t, r }) => {
    K.tone(t, 1.5, { type: 'sine', f0: 58, f1: 64, g: 0.06, att: 0.25, sus: 0.5 });
    K.tone(t, 1.5, { type: 'triangle', f0: 176, f1: 190, g: 0.035, att: 0.3, sus: 0.5, lp: 520, am: { rate: 3.2, depth: 0.6 } });
    K.tone(t, 0.75, { type: 'sawtooth', f0: 88, f1: 104, g: 0.07, att: 0.2, sus: 0.3, lp: 420, am: { rate: 4.5, depth: 0.5 } });
    K.tone(t + 0.75, 0.75, { type: 'sawtooth', f0: 104, f1: 84, g: 0.07, att: 0.1, sus: 0.4, lp: 420, am: { rate: 4, depth: 0.5 } });
    K.noise(t, 1.5, { kind: 'brown', type: 'lowpass', f0: 260, g: 0.05, att: 0.3, sus: 0.5 });
    // the head turns: a few servo ticks, uneven, each with a short low motor note
    [0.18, 0.31, 0.43, 0.9, 1.04, 1.2].forEach((h) => {
      const at = t + h + (r() - 0.5) * 0.03;
      K.tick(at, { g: 0.08 + r() * 0.03, f0: 1800 + r() * 500, dur: 0.007 });
      K.tone(at, 0.07, { type: 'triangle', f0: 240 + r() * 50, f1: 170, g: 0.06, att: 0.004, lp: 600 });
    });
    return 1.5;
  },
  // Found someone: a held silence, then the lock (a low pulse of two close, hostile notes and a hard hit), the motor
  // revving up with the hydraulics climbing, and fast heavy steps. No siren.
  'cao-caca': ({ K, t, r }) => {
    const L = t + 0.14;                                    // the lock: the short silence before it is on purpose
    K.tone(L, 0.3, { type: 'sine', f0: 82, f1: 34, g: 0.55, att: 0.001 });
    K.tone(L, 0.22, { type: 'sawtooth', f0: 78, g: 0.17, att: 0.001, lp: 330 });
    K.tone(L, 0.22, { type: 'sawtooth', f0: 83, g: 0.17, att: 0.001, lp: 330 });   // a beating minor second, gritty
    K.noise(L, 0.14, { kind: 'brown', type: 'lowpass', f0: 650, g: 0.4, att: 0.001 });
    K.metal(L + 0.004, 150, [[1, 0.2, 0.09], [1.41, 0.14, 0.07], [2.3, 0.07, 0.05]]);   // a tritone of damped steel
    K.tick(L, { g: 0.12, f0: 1500, dur: 0.01 });
    // the motor: climbs and keeps pulsing
    K.tone(L + 0.12, 0.85, { type: 'sawtooth', f0: 52, f1: 128, g: 0.1, att: 0.1, sus: 0.3, lp: 340, am: { rate: 13, depth: 0.5 }, vib: { rate: 6, depth: 3 } });
    K.tone(L + 0.12, 0.85, { type: 'triangle', f0: 150, f1: 400, g: 0.05, att: 0.1, sus: 0.3, lp: 700 });
    K.noise(L + 0.1, 0.9, { kind: 'brown', type: 'lowpass', f0: 220, f1: 420, g: 0.14, att: 0.1, sus: 0.3 });
    // fast heavy steps: the stride tightens
    [0.36, 0.56, 0.74, 0.9].forEach((h, i) => foot(K, L + h + (r() - 0.5) * 0.01, r, 1.25 - i * 0.03, 130 + (i % 2) * 20));
    return 1.25;
  },
  // The knock-down: a violent hit with weight: a deep thud, a body of noise, hard steel (low and short, not a bell)
  // and the plates scraping after it.
  'cao-derruba': ({ K, t, r }) => {
    K.tone(t, 0.45, { type: 'sine', f0: 120, f1: 32, g: 0.62, att: 0.002 });
    K.noise(t, 0.3, { kind: 'brown', type: 'lowpass', f0: 900, f1: 260, g: 0.45, att: 0.002 });
    K.tone(t, 0.18, { type: 'sawtooth', f0: 70, f1: 45, g: 0.16, att: 0.002, lp: 300 });
    K.metal(t + 0.01, 190, [[1, 0.2, 0.1], [1.7, 0.15, 0.08], [2.9, 0.1, 0.06], [4.4, 0.05, 0.04]]);
    K.tick(t, { g: 0.2, f0: 1800, dur: 0.012 });
    [0.13, 0.22, 0.38].forEach((h, i) => {
      K.noise(t + h, 0.1, { kind: 'pink', type: 'bandpass', f0: 700 + r() * 500, q: 2, g: 0.07 / (1 + i * 0.5), att: 0.004 });
      K.metal(t + h, 220 + r() * 90, [[1, 0.06 / (1 + i * 0.5), 0.05], [2.2, 0.03, 0.03]]);
    });
    K.tone(t + 0.1, 0.55, { type: 'triangle', f0: 130, f1: 48, g: 0.05, att: 0.05, lp: 400 });   // a servo winding down
    return 0.7;
  },
// The decoy: a thrown clatter, the knock where it lands, and the dry click it repeats.
  'isca-lanca': ({ K, t }) => { K.noise(t, 0.12, { kind: 'white', type: 'bandpass', f0: 1800, f1: 600, q: 1.2, g: 0.12, att: 0.01 }); return 0.14; },
  'isca-cai': ({ K, t, r }) => {
    K.tone(t, 0.1, { type: 'sine', f0: 190, f1: 110, g: 0.3, att: 0.002 });
    K.metal(t, 780 + r() * 80, [[1, 0.2, 0.2], [2.7, 0.12, 0.14]]);
    K.tick(t, { g: 0.25, f0: 3000 });
    return 0.25;
  },
  'isca-estalo': ({ K, t, r }) => {
    K.tick(t, { g: 0.4, f0: 2200 + r() * 600 });
    K.tone(t + 0.01, 0.05, { type: 'square', f0: 1500 + r() * 300, f1: 900, g: 0.1, lp: 3000 });
    return 0.1;
  },
  // The slow-motion dodge: the world drops: a deep pressure swell and a heartbeat, nothing bright.
  'camera-lenta': ({ K, t }) => {
    K.tone(t, 1.4, { type: 'sine', f0: 90, f1: 38, g: 0.3, att: 0.25 });
    K.noise(t, 1.4, { kind: 'brown', type: 'lowpass', f0: 500, f1: 120, g: 0.12, att: 0.3 });
    [0.1, 0.52, 1.2].forEach((h, i) => K.tone(t + h, 0.18, { type: 'sine', f0: 62, f1: 34, g: 0.3 - i * 0.05, att: 0.004 }));
    return 1.5;
  },
  // The dog goes into the skip: a metal body against sheet steel, the whole box ringing low, then the servo coming apart.
  'cao-bate': ({ K, t, r }) => {
    K.tone(t, 0.5, { type: 'sine', f0: 100, f1: 30, g: 0.7, att: 0.002 });
    K.noise(t, 0.35, { kind: 'brown', type: 'lowpass', f0: 1100, f1: 240, g: 0.5, att: 0.002 });
    K.metal(t + 0.01, 130, [[1, 0.3, 0.5], [1.9, 0.2, 0.35], [3.1, 0.12, 0.2], [4.7, 0.06, 0.12]]);
    K.tone(t + 0.12, 0.8, { type: 'triangle', f0: 150, f1: 40, g: 0.07, att: 0.05, lp: 350 });
    [0.2, 0.34].forEach((h) => K.noise(t + h, 0.08, { kind: 'pink', type: 'bandpass', f0: 600 + r() * 400, q: 2, g: 0.06, att: 0.003 }));
    return 0.9;
  },
  // The lure at the sensor: a dense burst of dry clicks, too close, too many.
  'isca-perto': ({ K, t, r }) => {
    for (let i = 0; i < 26; i++) K.tick(t + i * 0.045 + r() * 0.02, { g: 0.32, f0: 1800 + r() * 1400 });
    K.tone(t, 1.2, { type: 'square', f0: 900, f1: 1300, g: 0.04, lp: 2500, att: 0.05 });
    return 1.3;
  },
  // The dog that cannot hear: a servo that loses its tune, turning and stumbling.
  'cao-surdo': ({ K, t, r }) => {
    K.tone(t, 1.6, { type: 'triangle', f0: 120, f1: 70, g: 0.12, att: 0.2, lp: 400 });
    [0.15, 0.55, 0.95, 1.3].forEach((h) => { K.noise(t + h, 0.08, { kind: 'brown', type: 'lowpass', f0: 500 + r() * 200, g: 0.2, att: 0.002 }); K.tick(t + h, { g: 0.1, f0: 1400 }); });
    return 1.8;
  },
  // The short: a sharp crack, a fizz of arcing, and the servo dying down.
  curto: ({ K, t, r }) => {
    K.tick(t, { g: 0.6, f0: 2600, dur: 0.02 });
    K.noise(t, 0.5, { kind: 'white', type: 'bandpass', f0: 2400, f1: 900, q: 0.8, g: 0.2, att: 0.002 });
    for (let i = 0; i < 9; i++) K.tick(t + 0.05 + i * 0.08 + r() * 0.04, { g: 0.2, f0: 2000 + r() * 2000 });
    K.tone(t + 0.1, 1.1, { type: 'sawtooth', f0: 110, f1: 25, g: 0.14, att: 0.01, lp: 300 });
    return 1.3;
  },
  // The attack: heavy, close, low. No scream, no sting: weight and the plates working.
  'cao-ataque': ({ K, t, r }) => {
    K.tone(t, 0.55, { type: 'sine', f0: 95, f1: 28, g: 0.75, att: 0.002 });
    K.noise(t, 0.6, { kind: 'brown', type: 'lowpass', f0: 1000, f1: 200, g: 0.55, att: 0.002 });
    K.metal(t, 170, [[1, 0.25, 0.3], [2.3, 0.15, 0.2]]);
    [0.25, 0.5, 0.75, 1.0, 1.25, 1.5].forEach((h, i) => { K.tone(t + h, 0.2, { type: 'sine', f0: 80, f1: 34, g: 0.4 / (1 + i * 0.25), att: 0.003 }); K.noise(t + h, 0.15, { kind: 'brown', type: 'lowpass', f0: 700, g: 0.22 / (1 + i * 0.25), att: 0.003 }); K.noise(t + h + 0.03, 0.1, { kind: 'pink', type: 'bandpass', f0: 500 + r() * 300, q: 1.5, g: 0.08, att: 0.005 }); });
    return 1.9;
  },
  // The same blow heard through a wall: muffled, no top (the attack that is not shown).
  abafado: ({ K, t }) => {
    K.tone(t, 0.7, { type: 'sine', f0: 70, f1: 24, g: 0.5, att: 0.004 });
    K.noise(t, 0.7, { kind: 'brown', type: 'lowpass', f0: 220, f1: 90, g: 0.3, att: 0.004 });
    [0.35, 0.65].forEach((h) => K.tone(t + h, 0.25, { type: 'sine', f0: 55, f1: 26, g: 0.2, att: 0.005 }));
    return 1.0;
  },
  // Game over: one low note that does not resolve.
  'fim-de-jogo': ({ K, t }) => {
    K.tone(t, 3.0, { type: 'sine', f0: 55, f1: 49, g: 0.35, att: 0.5 });
    K.tone(t, 3.0, { type: 'triangle', f0: 110, f1: 98, g: 0.07, att: 0.8, lp: 300 });
    K.noise(t, 3.0, { kind: 'brown', type: 'lowpass', f0: 160, g: 0.08, att: 0.6 });
    return 3.2;
  },
};

export const MACHINE_NAMES = Object.keys(ONE);
export const NAMES = MACHINE_NAMES;
/** The names the page's catalogue offers. */
export const SOUND_NAMES = MACHINE_NAMES;

export function createMachineAudio(ctx, opts = {}) {
  const offline = isOffline(ctx);
  // its own chain (and compressor) as before, so the approved sound is the same; the rooms and the distance are shared with the rest of the game's sound when `make` and `space` are given
  const chain = createChain(ctx, { era: opts.era === true, volume: opts.volume ?? 0.9, destination: opts.destination, rooms: { seca: 0 }, room: 'seca' });
  const space = opts.space ?? createSpace(ctx, { out: chain.bus, seed: opts.seed, room: opts.room });
  const make = opts.make ?? createVoiceFactory(ctx, { bus: chain.bus, space, rolloff: 0.8 });
  const seed = (opts.seed ?? 1) >>> 0, counts = {}, noises = {};
  const A = { ctx, noise(kind) { return noises[kind] ??= makeNoise(ctx, kind, 4, hash('noise-' + kind, 5)); } };
  for (const k of ['white', 'pink', 'brown']) A.noise(k);
  function play(name, o = {}) {
    const fx = ONE[name];
    if (!fx) { console.warn('machines audio: unknown sound', name); return 0; }
    const t = o.at ?? ctx.currentTime + (o.delay || 0) + 0.01;
    const n = counts[name] = (counts[name] || 0) + 1, v = make({ rolloff: 0.8, ...o, wet: o.wet ?? (name === 'camera-lenta' || name === 'fim-de-jogo' ? 0 : 1) }, chain.bus);
    const dur = fx({ K: makeKit(A, v.dest), t, r: rng(hash(name, o.seed !== undefined ? o.seed >>> 0 : seed * 977 + n)), o });
    if (!offline) setTimeout(v.free, (dur + 0.6) * 1000);
    return dur;
  }
  return { play, start(name, o) { play(name, o); return { gain() {}, stop() {} }; }, names: MACHINE_NAMES, setVolume: chain.setVolume, setEra: chain.setEra, setRoom: (v) => space.setRoom(v) };
}
