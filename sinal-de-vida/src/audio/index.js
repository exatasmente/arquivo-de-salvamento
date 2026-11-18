// The game's sound, on the engine's kit and master chain (vendor/engine/sound.js): every sound is made from
// oscillators and noise, nothing recorded, and goes through the era chain (a PS1's band and grain).
//
//   const audio = createAudio(ctx);                         // ctx: an AudioContext (or an OfflineAudioContext)
//   audio.play('passo', { pos: [x, y, z], gain: 0.8 });     // -> its length in seconds
//   audio.start('ambiente', { gain: 0.5 }) -> { gain(v), stop() }   // a loop the game keeps
//
// The video's renderer plays these offline: play(name, { at, dur }), and NAMES lists them. Add a sound: a function in ONE (a one-shot) or LOOPS (it keeps going), then its name.
import { makeKit, makeNoise, createChain, rng, hash, isOffline } from '../../vendor/engine/sound.js';
import { createMachineAudio, MACHINE_NAMES } from './machines.js';

/** One-shots: ({ K, t, r, o }) -> length in seconds. K is the kit (tone, noise, tick, metal), r a seeded random. */
const ONE = {
  passo: ({ K, t, r }) => { K.noise(t, 0.09, { kind: 'brown', type: 'lowpass', f0: 500 + r() * 200, g: 0.5, att: 0.002 }); K.tick(t, { g: 0.08 }); return 0.12; },
  // A step on the street: asphalt and grit, a little brighter than the damp concrete of the gallery.
  'passo-rua': ({ K, t, r }) => { K.noise(t, 0.08, { kind: 'pink', type: 'bandpass', f0: 900 + r() * 400, q: 0.8, g: 0.32, att: 0.002 }); K.noise(t, 0.1, { kind: 'brown', type: 'lowpass', f0: 420, g: 0.3, att: 0.002 }); K.tick(t, { g: 0.1, f0: 3200 }); return 0.12; },
  porta: ({ K, t, r }) => { K.noise(t, 0.5, { kind: 'pink', type: 'bandpass', f0: 380 + r() * 60, q: 3, g: 0.25 }); K.tone(t + 0.4, 0.12, { type: 'square', f0: 90, f1: 60, g: 0.25, lp: 600 }); return 0.6; },
  bip: ({ K, t }) => { K.tone(t, 0.08, { type: 'square', f0: 880, g: 0.12, lp: 3000 }); return 0.1; },
  // The flashlight switch and the cut of the camera: two small ticks.
  lanterna: ({ K, t }) => { K.tick(t, { g: 0.35, f0: 1800 }); K.tone(t + 0.012, 0.05, { type: 'square', f0: 240, f1: 160, g: 0.08, lp: 900 }); return 0.1; },
  corte: ({ K, t }) => { K.tick(t, { g: 0.2, f0: 3000 }); return 0.05; },
  // A rope pulled hand over hand: a creak and the rub of fibre.
  corda: ({ K, t, r }) => { K.noise(t, 0.3, { kind: 'pink', type: 'bandpass', f0: 1400 + r() * 300, q: 2.5, g: 0.16, att: 0.04 }); K.tone(t, 0.28, { type: 'sawtooth', f0: 150 + r() * 30, f1: 120, g: 0.05, lp: 500, att: 0.05 }); return 0.32; },
  // The manhole cover and the climb ending: a dull knock.
  // The interface: a soft tick on a choice and on a move, a clank on the bench, a click of the hand radio, a little chime of the card.
  'ui-ok': ({ K, t }) => { K.tone(t, 0.07, { type: 'square', f0: 660, f1: 880, g: 0.09, lp: 3000 }); return 0.1; },
  'ui-move': ({ K, t }) => { K.tick(t, { g: 0.12, f0: 2400 }); return 0.04; },
  'ui-no': ({ K, t }) => { K.tone(t, 0.14, { type: 'square', f0: 200, f1: 150, g: 0.1, lp: 900 }); return 0.16; },
  bancada: ({ K, t, r }) => { K.tick(t, { g: 0.3, f0: 1400 }); K.tone(t + 0.02, 0.1, { type: 'triangle', f0: 540 + r() * 60, f1: 380, g: 0.12, lp: 2400 }); K.noise(t + 0.12, 0.08, { kind: 'pink', type: 'bandpass', f0: 2200, q: 1.4, g: 0.06 }); return 0.25; },
  consertar: ({ K, t, r }) => { for (let i = 0; i < 3; i++) { K.tick(t + i * 0.16, { g: 0.25, f0: 1200 + r() * 400 }); K.tone(t + i * 0.16, 0.06, { type: 'triangle', f0: 700 - i * 60, g: 0.1, lp: 2200 }); } return 0.6; },
  pega: ({ K, t, r }) => { K.noise(t, 0.12, { kind: 'pink', type: 'bandpass', f0: 1500 + r() * 400, q: 1.2, g: 0.1, att: 0.01 }); K.tick(t + 0.08, { g: 0.1 }); return 0.2; },
  'radio-tx': ({ K, t, r }) => { K.tick(t, { g: 0.3, f0: 2600 }); K.noise(t + 0.03, 0.22, { kind: 'white', type: 'bandpass', f0: 1800, q: 4, g: 0.1, att: 0.02 }); K.tone(t + 0.04, 0.2, { type: 'square', f0: 420 + r() * 60, f1: 380, g: 0.025, lp: 1800 }); K.tick(t + 0.3, { g: 0.25, f0: 2200 }); return 0.4; },
  cartao: ({ K, t }) => { [523, 659, 784].forEach((f, i) => K.tone(t + i * 0.1, 0.14, { type: 'square', f0: f, g: 0.07, lp: 3200 })); return 0.5; },
  bomba: ({ K, t }) => { K.tone(t, 0.6, { type: 'sawtooth', f0: 70, f1: 90, g: 0.12, lp: 300, att: 0.1 }); K.noise(t, 0.6, { kind: 'brown', type: 'lowpass', f0: 400, g: 0.1, att: 0.15 }); return 0.7; },
  apagao: ({ K, t }) => { K.tone(t, 0.5, { type: 'sine', f0: 220, f1: 40, g: 0.2 }); return 0.6; },
  tampa: ({ K, t }) => { K.tone(t, 0.25, { type: 'sine', f0: 110, f1: 55, g: 0.4, att: 0.002 }); K.noise(t, 0.2, { kind: 'brown', type: 'lowpass', f0: 600, g: 0.3, att: 0.002 }); return 0.3; },
  // The radio of the station: the click of letting go, a blip for each stretch of a voice that is only text, the sting of "foi ouvido", the tone
  // of each colour of the keyboard (five pitches), the reaction: a tick when it opens, a soft knock when it is hit, a dull one when it is missed.
  'radio-solta': ({ K, t }) => { K.tick(t, { g: 0.22, f0: 2200 }); K.noise(t + 0.02, 0.12, { kind: 'white', type: 'bandpass', f0: 1500, q: 3, g: 0.05, att: 0.01 }); return 0.2; },
  blip: ({ K, t, o }) => { K.tone(t, 0.035, { type: 'square', f0: o.f ?? 300, g: 0.035, lp: 1400, att: 0.002 }); return 0.05; },
  ouvido: ({ K, t }) => { K.tone(t, 0.5, { type: 'sine', f0: 880, f1: 440, g: 0.08, att: 0.01, lp: 2400 }); K.tone(t + 0.04, 0.5, { type: 'sine', f0: 1320, f1: 660, g: 0.04, att: 0.01, lp: 2400 }); return 0.6; },
  cor: ({ K, t, o }) => { K.tone(t, 0.16, { type: 'square', f0: [392, 440, 523, 587, 659][(o.n ?? 0) % 5], g: 0.08, lp: 2600, att: 0.004 }); return 0.2; },
  'reacao-abre': ({ K, t }) => { K.tick(t, { g: 0.3, f0: 2800 }); K.tone(t, 0.1, { type: 'triangle', f0: 1200, g: 0.05, lp: 3000 }); return 0.15; },
  'reacao-acerto': ({ K, t }) => { K.tone(t, 0.1, { type: 'triangle', f0: 520, f1: 780, g: 0.1, lp: 2800 }); return 0.14; },
  // The sequence of the splice: the dog's leap (a servo wound up and a thud of the feet), a strain on the cable pulled out of the grate, and the snap when it comes free.
  // The lunge: the motor winds up low and hard, then the whole weight lands (a deep thud, noise, short heavy steel).
  'cao-salta': ({ K, t }) => {
    K.tone(t, 0.3, { type: 'sawtooth', f0: 58, f1: 150, g: 0.14, att: 0.08, lp: 380, am: { rate: 14, depth: 0.4 } });
    K.noise(t, 0.3, { kind: 'brown', type: 'lowpass', f0: 200, f1: 520, g: 0.12, att: 0.1 });
    const L = t + 0.28;
    K.tone(L, 0.36, { type: 'sine', f0: 100, f1: 34, g: 0.55, att: 0.002 });
    K.noise(L, 0.2, { kind: 'brown', type: 'lowpass', f0: 750, f1: 250, g: 0.42, att: 0.002 });
    K.metal(L + 0.004, 165, [[1, 0.2, 0.09], [1.8, 0.13, 0.07], [3, 0.07, 0.05]]);
    K.tick(L, { g: 0.12, f0: 1600, dur: 0.01 });
    return 0.65;
  },
  'cabo-puxa': ({ K, t, r }) => { K.noise(t, 0.16, { kind: 'pink', type: 'bandpass', f0: 700 + r() * 300, q: 3, g: 0.14, att: 0.02 }); K.tone(t, 0.14, { type: 'sawtooth', f0: 180 + r() * 60, f1: 140, g: 0.05, lp: 600 }); return 0.2; },
  'cabo-solta': ({ K, t }) => { K.tick(t, { g: 0.4, f0: 1400 }); K.noise(t, 0.22, { kind: 'pink', type: 'bandpass', f0: 1800, q: 1.2, g: 0.16, att: 0.002 }); K.tone(t + 0.02, 0.2, { type: 'triangle', f0: 420, f1: 150, g: 0.1, lp: 1500 }); return 0.3; },
  'reacao-erro': ({ K, t }) => { K.tone(t, 0.25, { type: 'sine', f0: 140, f1: 70, g: 0.3 }); K.noise(t, 0.2, { kind: 'brown', type: 'lowpass', f0: 500, g: 0.2, att: 0.002 }); return 0.3; },
};
/** Loops: ({ K, t, r, o, dur }) -> nothing; o.dur is the length asked for (offline, for the video). */
const LOOPS = {
  // The static of the radio, which the game fades with the patience of the voice.
  chiado: ({ K, t, dur }) => {
    K.noise(t, dur, { kind: 'white', type: 'bandpass', f0: 2400, q: 0.7, g: 0.12, att: 0.2, sus: 1 });
    K.noise(t, dur, { kind: 'pink', type: 'lowpass', f0: 900, g: 0.08, att: 0.2, sus: 1 });
  },
  // The gallery: the damp low rumble of a drain, the hum of a mains transformer, and water dripping now and then.
  ambiente: ({ K, t, r, dur }) => {
    K.noise(t, dur, { kind: 'brown', type: 'lowpass', f0: 180, g: 0.18, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 55, g: 0.04, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 100, g: 0.016, att: 0.6, sus: 1 });
    for (let at = t + 0.4 + r() * 1.2; at < t + dur - 0.3; at += 1.1 + r() * 2.2) {
      const f = 1100 + r() * 700;
      K.tone(at, 0.07, { type: 'sine', f0: f, f1: f * 0.55, g: 0.05 + r() * 0.04, att: 0.001, lp: 3500 });
      K.tone(at + 0.09, 0.05, { type: 'sine', f0: f * 1.3, f1: f * 0.7, g: 0.02, att: 0.001, lp: 3000 });
    }
  },
  // The street: wind in gusts over a bed, and the low hum of some machine far down the avenue.
  'ambiente-rua': ({ K, t, r, dur }) => {
    K.noise(t, dur, { kind: 'pink', type: 'lowpass', f0: 240, g: 0.11, att: 0.6, sus: 1 });
    for (let at = t; at < t + dur - 1; at += 2.5 + r() * 2) {
      const len = 2 + r() * 2, f = 380 + r() * 380;
      K.noise(at, len, { kind: 'pink', type: 'bandpass', f0: f, f1: f * (0.7 + r() * 0.6), q: 0.9, g: 0.15, att: len * 0.45, sus: 0.0 });
    }
    K.tone(t, dur, { type: 'sawtooth', f0: 62, g: 0.012, att: 0.6, sus: 1, lp: 160, am: { rate: 2.5, depth: 0.35 } });
    K.tone(t, dur, { type: 'sine', f0: 124, g: 0.01, att: 0.6, sus: 1 });
  },
};

export const NAMES = [...Object.keys(ONE), ...Object.keys(LOOPS), ...MACHINE_NAMES];
/** The names the scene editor offers for a sound source. */
export const SOUND_NAMES = NAMES;

export function createAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try { return new AC({ sampleRate: 22050, latencyHint: 'interactive' }); } catch { return new AC(); }
}

export function createAudio(ctx, opts = {}) {
  const offline = isOffline(ctx);
  const chain = createChain(ctx, { era: opts.era !== false, volume: opts.volume ?? 0.9, destination: opts.destination, rooms: { galeria: 0.3, rua: 0.08 }, room: opts.room });
  const seed = (opts.seed ?? 1) >>> 0, counts = {}, noises = {};
  // The machines have their own kit and chain (src/audio/machines.js); one name routes to it.
  const mach = createMachineAudio(ctx, { seed, destination: opts.destination, era: opts.era, volume: opts.volume ?? 0.9, room: opts.room });
  const A = { ctx, noise(kind) { return noises[kind] ??= makeNoise(ctx, kind, 4, hash('noise-' + kind, 5)); } };
  for (const k of ['white', 'pink', 'brown']) A.noise(k);
  /** A voice: gain -> (panner at o.pos) -> the chain, and a send to its reverb. */
  function voice(o) {
    const g = ctx.createGain(); g.gain.value = o.gain ?? o.vol ?? 1;
    let tail = g;
    if (o.pos) {
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 2;
      if (p.positionX) { p.positionX.value = o.pos[0]; p.positionY.value = o.pos[1]; p.positionZ.value = o.pos[2]; } else p.setPosition(...o.pos);
      g.connect(p); tail = p;
    }
    tail.connect(chain.bus);
    const wet = ctx.createGain(); wet.gain.value = 0.3; tail.connect(wet).connect(chain.rev);
    return { g, dest: { node: g, spatial: Boolean(o.pos) }, free: () => { try { g.disconnect(); wet.disconnect(); } catch { /* gone */ } } };
  }
  const randOf = (name, o) => { const n = counts[name] = (counts[name] || 0) + 1; return rng(hash(name, o.seed !== undefined ? o.seed >>> 0 : seed * 977 + n)); };
  function play(name, o = {}) {
    if (MACHINE_NAMES.includes(name)) return mach.play(name, o);
    const t = o.at ?? ctx.currentTime + (o.delay || 0) + 0.01;
    if (LOOPS[name]) {
      const dur = o.dur ?? 4, v = voice(o);
      LOOPS[name]({ K: makeKit(A, v.dest), t, r: randOf(name, o), o, dur });
      if (!offline) setTimeout(v.free, (dur + 1) * 1000);
      return dur;
    }
    const fx = ONE[name];
    if (!fx) { console.warn('audio: unknown sound', name); return 0; }
    const v = voice(o);
    const dur = fx({ K: makeKit(A, v.dest), t, r: randOf(name, o), o });
    if (!offline) setTimeout(v.free, (dur + 0.6) * 1000);
    return dur;
  }
  /** A loop the game keeps (the engine's sound sources too): gain(v) fades it, stop() ends it. */
  function start(name, o = {}) {
    if (!LOOPS[name]) { play(name, o); return { gain() {}, stop() {} }; }
    const v = voice(o), t = ctx.currentTime + 0.01;
    // A live loop is laid down in long stretches, the next one before this one ends.
    let until = t, timer = null, stopped = false;
    const more = () => { if (stopped) return; LOOPS[name]({ K: makeKit(A, v.dest), t: until, r: randOf(name, o), o, dur: 8.2 }); until += 8; };
    more();
    timer = setInterval(() => { if (until - ctx.currentTime < 3) more(); }, 1000);
    return {
      gain(x) { v.g.gain.setTargetAtTime(x, ctx.currentTime, 0.1); },
      stop() { stopped = true; clearInterval(timer); v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(v.free, 800); },
    };
  }
  return {
    play, start, names: NAMES,
    setVolume: (v, ...a) => { chain.setVolume(v, ...a); mach.setVolume(v, ...a); }, setEra: (v) => { chain.setEra(v); mach.setEra(v); }, setRoom: (v) => { chain.setRoom(v); mach.setRoom(v); },
    resume() { return ctx.state === 'suspended' && ctx.resume ? ctx.resume() : Promise.resolve(); },
  };
}
