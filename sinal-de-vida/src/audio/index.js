// The game's sound, on the engine's kit and master chain (vendor/engine/sound.js). Two layers under one `play(name, ...)`:
//   - the recorded effects (assets/audio/sfx/, src/audio/samples.js): a seeded pick among the variations of a sound, a little pitch and
//     level variation, loaded on demand; and
//   - the synthesised ones below (oscillators and noise), which are what plays when a recording is missing or not loaded yet, and under the
//     dog's movement (the approved sound).
// The context runs at 48 kHz and the era chain (a PS1's narrow band and few bits) is off: it stays in the engine for the older games.
// Each place has its own reverb (src/audio/space.js), a positioned sound has its distance and can be heard through something (`occlude`),
// and the recorded voices sit on top: effects duck while a voice speaks (`duck`).
//
//   const audio = createAudio(ctx);                         // ctx: an AudioContext (or an OfflineAudioContext)
//   audio.play('passo', { pos: [x, y, z], gain: 0.8 });     // -> its length in seconds
//   audio.start('ambiente', { gain: 0.5 }) -> { gain(v), stop() }   // a loop the game keeps
//   audio.setRoom('rua'); audio.setListener(pos, dir); audio.setOcclusion(0..1); audio.duck({ at, dur }); await audio.preload(names)
//
// The video's renderer plays these offline: play(name, { at, dur }), and NAMES lists them. Add a sound: a function in ONE (a one-shot) or LOOPS (it keeps going), then its name; a recording of it goes in ROUTES (samples.js).
import { makeKit, makeNoise, createChain, rng, hash, isOffline } from '../../vendor/engine/sound.js';
import { createMachineAudio, MACHINE_NAMES } from './machines.js';
import { createSpace } from './space.js';
import { createVoiceFactory } from './voice.js';
import { createSamples, ROUTES } from './samples.js';
import { dbGain } from './levels.js';

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
  'ui-voltar': ({ K, t }) => { K.tick(t, { g: 0.1, f0: 1200 }); K.tone(t, 0.1, { type: 'triangle', f0: 260, f1: 150, g: 0.08, lp: 900 }); return 0.14; },
  'ui-aba': ({ K, t }) => { K.tick(t, { g: 0.14, f0: 1900 }); K.tone(t + 0.01, 0.05, { type: 'triangle', f0: 520, f1: 400, g: 0.04, lp: 1800 }); return 0.08; },
  'ui-fader': ({ K, t }) => { K.tick(t, { g: 0.07, f0: 2600 }); return 0.04; },
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
  // New ones (a recording plays when it is loaded; these are what stays when it is not): steps on other floors, the tuning and the handheld
  // radio, and the impacts of scene 4.
  'passo-hall': ({ K, t, r }) => { K.noise(t, 0.07, { kind: 'pink', type: 'bandpass', f0: 1500 + r() * 500, q: 0.9, g: 0.3, att: 0.002 }); K.tick(t, { g: 0.14, f0: 3400 }); K.noise(t, 0.09, { kind: 'brown', type: 'lowpass', f0: 380, g: 0.24, att: 0.002 }); return 0.12; },
  'passo-grade': ({ K, t, r }) => { K.noise(t, 0.08, { kind: 'brown', type: 'lowpass', f0: 500, g: 0.4, att: 0.002 }); K.metal(t + 0.002, 210 + r() * 50, [[1, 0.1, 0.16], [2.6, 0.06, 0.1], [4.1, 0.03, 0.07]]); K.tick(t, { g: 0.1, f0: 2800 }); return 0.2; },
  'passo-escada': ({ K, t, r }) => { K.noise(t, 0.1, { kind: 'brown', type: 'lowpass', f0: 420 + r() * 120, g: 0.5, att: 0.002 }); K.tone(t, 0.08, { type: 'sine', f0: 120, f1: 60, g: 0.18, att: 0.002 }); K.tick(t, { g: 0.07 }); return 0.14; },
  'radio-sintonia': ({ K, t }) => { K.noise(t, 1.4, { kind: 'white', type: 'bandpass', f0: 500, f1: 3200, q: 1.6, g: 0.1, att: 0.2, sus: 0.3 }); K.noise(t, 1.4, { kind: 'pink', type: 'lowpass', f0: 900, g: 0.06, att: 0.2, sus: 0.3 }); return 1.4; },
  'radio-mao': ({ K, t, r }) => { for (let i = 0; i < 14; i++) K.noise(t + i * 0.09 + r() * 0.05, 0.05 + r() * 0.05, { kind: 'white', type: 'bandpass', f0: 1800 + r() * 800, q: 1.2, g: 0.06 * r() + 0.02, att: 0.004 }); return 1.4; },
  'impacto-lixeira': ({ K, t, r }) => { K.tone(t, 0.5, { type: 'sine', f0: 100, f1: 30, g: 0.6, att: 0.002 }); K.noise(t, 0.35, { kind: 'brown', type: 'lowpass', f0: 1100, f1: 240, g: 0.5, att: 0.002 }); K.metal(t + 0.01, 130, [[1, 0.3, 0.5], [1.9, 0.2, 0.35], [3.1, 0.12, 0.2]]); [0.2, 0.34].forEach((h) => K.noise(t + h, 0.08, { kind: 'pink', type: 'bandpass', f0: 600 + r() * 400, q: 2, g: 0.06, att: 0.003 })); return 0.9; },
  'queda-corpo': ({ K, t, r }) => { K.tone(t, 0.2, { type: 'sine', f0: 90, f1: 40, g: 0.45, att: 0.002 }); K.noise(t, 0.16, { kind: 'brown', type: 'lowpass', f0: 700, g: 0.4, att: 0.002 }); K.noise(t + 0.03, 0.2, { kind: 'pink', type: 'bandpass', f0: 1200 + r() * 400, q: 0.8, g: 0.08, att: 0.01 }); return 0.35; },
  'vidro-aramado': ({ K, t, r }) => { K.tone(t, 0.12, { type: 'sine', f0: 140, f1: 70, g: 0.3, att: 0.002 }); K.tick(t, { g: 0.5, f0: 2400, dur: 0.02 }); for (let i = 0; i < 10; i++) K.tick(t + 0.04 + i * 0.03 + r() * 0.02, { g: 0.12 * (1 - i / 12), f0: 3000 + r() * 2500 }); K.noise(t + 0.03, 0.3, { kind: 'white', type: 'bandpass', f0: 3600, q: 1, g: 0.08, att: 0.004 }); return 0.5; },
  'reacao-erro': ({ K, t }) => { K.tone(t, 0.25, { type: 'sine', f0: 140, f1: 70, g: 0.3 }); K.noise(t, 0.2, { kind: 'brown', type: 'lowpass', f0: 500, g: 0.2, att: 0.002 }); return 0.3; },
  // What the objects of a scene sound once in a while (src/audio/emitters.js repeats them): a drop off a pipe into a puddle, the clack of a relay in a traffic light's box.
  'gota-cano': ({ K, t, r }) => { const f = 1000 + r() * 700; K.tone(t, 0.08, { type: 'sine', f0: f, f1: f * 0.5, g: 0.2, att: 0.001, lp: 3500 }); K.tone(t + 0.1, 0.06, { type: 'sine', f0: f * 1.3, f1: f * 0.7, g: 0.06, att: 0.001, lp: 3000 }); return 0.3; },
  'rele-semaforo': ({ K, t, r }) => { K.tick(t, { g: 0.35, f0: 1500 }); K.metal(t + 0.003, 300 + r() * 50, [[1, 0.08, 0.1], [2.4, 0.05, 0.06]]); K.tick(t + 0.09, { g: 0.2, f0: 1100 }); return 0.4; },
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
  // The ventilation shaft: a tight airflow, a metal resonance, a fan far down it.
  'ambiente-poco': ({ K, t, r, dur }) => {
    K.noise(t, dur, { kind: 'brown', type: 'lowpass', f0: 320, g: 0.2, att: 0.6, sus: 1 });
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 620, q: 4, g: 0.05, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 84 + r() * 6, g: 0.03, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sawtooth', f0: 43, g: 0.014, att: 0.6, sus: 1, lp: 140, am: { rate: 6, depth: 0.3 } });
  },
  // An empty stairwell of a building: the hum of pipes and, far off, an occasional dull knock.
  'ambiente-predio': ({ K, t, r, dur }) => {
    K.noise(t, dur, { kind: 'brown', type: 'lowpass', f0: 200, g: 0.14, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 100, g: 0.03, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 150, g: 0.012, att: 0.6, sus: 1 });
    for (let at = t + 2 + r() * 4; at < t + dur - 1; at += 6 + r() * 6) { K.tone(at, 0.2, { type: 'sine', f0: 80, f1: 45, g: 0.07, att: 0.004 }); K.noise(at, 0.12, { kind: 'brown', type: 'lowpass', f0: 300, g: 0.06, att: 0.003 }); }
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
  // The objects of a scene (src/audio/emitters.js puts each at its place). A lamp: the mains hum and a thin buzz over it.
  'zumbido-lampada': ({ K, t, dur }) => {
    K.tone(t, dur, { type: 'sawtooth', f0: 100, g: 0.022, att: 0.4, sus: 1, lp: 700 });
    K.tone(t, dur, { type: 'sine', f0: 200, g: 0.012, att: 0.4, sus: 1 });
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 3200, q: 6, g: 0.012, att: 0.4, sus: 1 });
  },
  // The electrical board: the same hum, lower and heavier.
  'zumbido-quadro': ({ K, t, dur }) => {
    K.tone(t, dur, { type: 'sawtooth', f0: 50, g: 0.035, att: 0.4, sus: 1, lp: 420 });
    K.tone(t, dur, { type: 'sine', f0: 100, g: 0.02, att: 0.4, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 150, g: 0.008, att: 0.4, sus: 1 });
  },
  // The pump running: a motor's drone with a beat in it and the water in the pipe.
  'bomba-motor': ({ K, t, dur }) => {
    K.tone(t, dur, { type: 'sawtooth', f0: 62, g: 0.05, att: 0.4, sus: 1, lp: 280, am: { rate: 11, depth: 0.3 } });
    K.noise(t, dur, { kind: 'brown', type: 'lowpass', f0: 420, g: 0.12, att: 0.4, sus: 1 });
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 1100, q: 1.5, g: 0.02, att: 0.4, sus: 1 });
  },
  // Wind through the grate of the shaft: a hollow breath with a faint whistle that comes and goes.
  'vento-grade': ({ K, t, r, dur }) => {
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 520, q: 1.2, g: 0.06, att: 0.5, sus: 1 });
    for (let at = t; at < t + dur - 1; at += 2.2 + r() * 2) { const len = 1.8 + r() * 1.6, f = 780 + r() * 300; K.noise(at, len, { kind: 'pink', type: 'bandpass', f0: f, f1: f * 0.8, q: 7, g: 0.06, att: len * 0.5, sus: 0 }); }
  },
  // The viaduct from afar: the rumble of a road over a lot of concrete, and the wind round its pillars.
  'viaduto-vento': ({ K, t, dur }) => {
    K.noise(t, dur, { kind: 'brown', type: 'lowpass', f0: 170, g: 0.12, att: 0.6, sus: 1 });
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 380, q: 0.8, g: 0.03, att: 0.6, sus: 1 });
    K.tone(t, dur, { type: 'sine', f0: 48, g: 0.03, att: 0.6, sus: 1 });
  },
};

export const NAMES = [...Object.keys(ONE), ...Object.keys(LOOPS), ...MACHINE_NAMES, 'ouvinte'];
/** The names the scene editor offers for a sound source ('ouvinte' puts the listener, in the video's render: it is not a sound). */
export const SOUND_NAMES = NAMES.filter((n) => n !== 'ouvinte');
/** The sounds that have no room of their own around them (the interface, the beeps, the radio's own noise): their reverb send is 0. */
const DRY = new Set(['ui-ok', 'ui-move', 'ui-no', 'ui-voltar', 'ui-aba', 'ui-fader', 'bip', 'blip', 'cor', 'cartao', 'ouvido', 'corte', 'lanterna', 'chiado', 'camera-lenta', 'fim-de-jogo', 'ambiente', 'ambiente-rua', 'ambiente-poco', 'ambiente-predio']);

/** The context of the game: 48 kHz, so nothing is cut at 11 kHz (and the recorded voices play at the band they were recorded in). */
export function createAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try { return new AC({ sampleRate: 48000, latencyHint: 'interactive' }); } catch { return new AC(); }
}

/**
 * opts: seed, volume, destination (where the sound ends: the page's mute works on it), room, era (true: the old narrow band and 6 bits),
 * samples (false: only the synthesised sounds, as the game was before the recordings), duckDb (how far the effects go down under a voice).
 */
export function createAudio(ctx, opts = {}) {
  const offline = isOffline(ctx), NY = ctx.sampleRate * 0.45;
  const seed = (opts.seed ?? 1) >>> 0, counts = {}, noises = {}, volume = opts.volume ?? 0.9;
  // the end of the line: effects go down under a voice (duck) and dull behind something (occlusion), then to the destination; the voices do not pass here
  const out = ctx.createGain(), occ = ctx.createBiquadFilter(), occG = ctx.createGain(), duckG = ctx.createGain(), vbus = ctx.createGain();
  occ.type = 'lowpass'; occ.frequency.value = Math.min(20000, NY); occ.Q.value = 0.5;
  duckG.connect(occ); vbus.connect(occ); occ.connect(occG); occG.connect(out); out.connect(opts.destination ?? ctx.destination);   // (vbus: the recorded voices that stand in a place; they do not go down under themselves)
  const chain = createChain(ctx, { era: opts.era === true, volume, destination: duckG, rooms: { seca: 0 }, room: 'seca' });   // its own short room is silent: the rooms are space.js's
  const space = createSpace(ctx, { out: chain.bus, seed, room: opts.room });
  const make = createVoiceFactory(ctx, { bus: chain.bus, space });
  const samples = opts.samples === false ? null : createSamples(ctx, { base: opts.sfxBase, fetchFn: opts.fetchFn });
  // the machines (the dog) have their own kit and chain, on the same rooms and the same end of the line
  const mach = createMachineAudio(ctx, { seed, destination: duckG, era: opts.era, volume, make, space });
  const A = { ctx, noise(kind) { return noises[kind] ??= makeNoise(ctx, kind, 4, hash('noise-' + kind, 5)); } };
  for (const k of ['white', 'pink', 'brown']) A.noise(k);
  const randOf = (name, o) => { const n = counts[name] = (counts[name] || 0) + 1; return rng(hash(name, o.seed !== undefined ? o.seed >>> 0 : seed * 977 + n)); };
  const voice = (name, o) => make({ ...o, wet: o.wet ?? ROUTES[name]?.wet ?? (DRY.has(name) ? 0 : 1) });
  const timeOf = (o) => o.at ?? ctx.currentTime + (o.delay || 0) + 0.01;

  /** The recording of `name`, if there is one loaded: plays it and returns its length (0: nothing played, the synth is the sound). */
  function recorded(name, o, t) {
    const rt = ROUTES[name];
    if (!samples || !rt || rt.loop || o.sample === false) return 0;
    if (!samples.ready(name)) { samples.preload([name]); return 0; }
    const v = voice(name, o);
    const dur = samples.play(name, { r: randOf(name + '~', o), at: t, dest: v.g });
    if (!dur) { v.free(); return 0; }
    if (!offline) setTimeout(v.free, (dur + 1) * 1000);
    return dur;
  }
  /** o.curve: [[u, k], ...] the level of a loop over its length (u from 0 to 1 of `dur`), as the video's camera goes by it. */
  function shape(v, o, t, dur) {
    if (!o.curve?.length) return;
    const base = o.gain ?? o.vol ?? 1, p = v.g.gain;
    p.setValueAtTime(base * o.curve[0][1], t);
    for (const [u, k] of o.curve.slice(1)) p.linearRampToValueAtTime(base * k, t + u * dur);
  }
  function play(name, o = {}) {
    if (name === 'ouvinte') { make.listener(o.pos ?? [0, 1.6, 0], o.dir ?? [0, 0, -1], o.at); return 0; }
    const t = timeOf(o), rt = ROUTES[name];
    if (rt?.loop && !LOOPS[name]) return 0;
    if (!LOOPS[name]) {
      const rec = recorded(name, o, t);
      if (rec && rt.mode !== 'layer') return rec;
      if (MACHINE_NAMES.includes(name)) return Math.max(rec, mach.play(name, o));
      const fx = ONE[name];
      if (!fx) { console.warn('audio: unknown sound', name); return rec; }
      const v = voice(name, o);
      const dur = fx({ K: makeKit(A, v.dest), t, r: randOf(name, o), o });
      if (!offline) setTimeout(v.free, (dur + 0.6) * 1000);
      return Math.max(rec, dur);
    }
    const dur = o.dur ?? 4;
    if (samples?.ready(name) && o.sample !== false) {
      const v = voice(name, o), h = samples.loop(name, { r: randOf(name + '~', o), at: t, dest: v.g, dur, offset: o.offset ?? null });
      if (h) { shape(v, o, t, dur); if (!offline) setTimeout(v.free, (dur + 1.5) * 1000); return dur; }
      v.free();
    } else if (samples) samples.preload([name]);
    const v = voice(name, o);
    shape(v, o, t, dur);
    LOOPS[name]({ K: makeKit(A, v.dest), t, r: randOf(name, o), o, dur });
    if (!offline) setTimeout(v.free, (dur + 1) * 1000);
    return dur;
  }
  /** A loop the game keeps (the engine's sound sources too): gain(v) fades it, stop() ends it. A recorded bed takes over from the synthesised one when it has loaded. */
  function start(name, o = {}) {
    if (!LOOPS[name]) { play(name, o); return { gain() {}, stop() {} }; }
    let stopped = false, timer = null, vp = null, vs = null, bed = null, until = 0;
    const startBed = () => {
      vs = voice(name, o);
      bed = samples.loop(name, { r: randOf(name + '~', o), at: ctx.currentTime + 0.02, dest: vs.g });
      if (!bed) { vs.free(); vs = null; }
      return Boolean(bed);
    };
    const synth = () => {
      vp = voice(name, o); until = ctx.currentTime + 0.01;
      // a live loop is laid down in long stretches, the next one before this one ends
      const more = () => { if (stopped) return; LOOPS[name]({ K: makeKit(A, vp.dest), t: until, r: randOf(name, o), o, dur: 8.2 }); until += 8; };
      more();
      timer = setInterval(() => { if (until - ctx.currentTime < 3) more(); }, 1000);
    };
    if (samples?.ready(name) && o.sample !== false && startBed()) { /* the recording from the start */ } else {
      synth();
      if (samples && o.sample !== false) samples.preload([name]).then(() => {
        if (stopped || !samples.ready(name) || !startBed()) return;
        clearInterval(timer); vp.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5); const old = vp; vp = null; setTimeout(old.free, 3500);   // the synthesised bed fades out under the recorded one
      });
    }
    return {
      gain(x) { const t = ctx.currentTime; (vs ?? vp)?.g.gain.setTargetAtTime(x, t, 0.1); if (vs && vp) vp.g.gain.setTargetAtTime(0, t, 0.3); },
      stop() { stopped = true; clearInterval(timer); const t = ctx.currentTime; for (const v of [vp, vs]) v?.g.gain.setTargetAtTime(0, t, 0.15); bed?.stop(t + 0.3); setTimeout(() => { vp?.free(); vs?.free(); }, 1200); },
    };
  }
  /** The effects go down under a voice: at `at` for `dur` seconds (the voices call this when a line starts). */
  function duck({ at, dur = 1, db = opts.duckDb ?? -5 } = {}) {
    const t = at ?? ctx.currentTime;
    duckG.gain.setTargetAtTime(dbGain(db), t, 0.05); duckG.gain.setTargetAtTime(1, t + dur, 0.3);
  }
  /** Everything of the world goes dull behind something (0 = open, 1 = through a wall): Jonas hidden in a container, a sound from under a grate. */
  function setOcclusion(v, tc = 0.15) {
    const k = Math.min(1, Math.max(0, v)), t = ctx.currentTime;
    occ.frequency.setTargetAtTime(Math.min(NY, 20000) * (650 / 20000) ** k, t, tc); occG.gain.setTargetAtTime(1 - 0.35 * k, t, tc);
  }
  return {
    ctx, play, start, names: NAMES, duck, setOcclusion,
    /** Where the player is and where the camera looks: the positioned sounds are heard from there. */
    setListener: (pos, dir, at) => make.listener(pos, dir, at),
    /** A voice that stands in a place (a recorded line from a radio across the room): { g, free } with `g` to connect to; it does not go down under a voice (`duck`). Same options as a positioned sound. */
    spatial: (o = {}) => { const v = make(o, vbus); return { g: v.g, free: v.free }; },
    preload: (names) => (samples ? samples.preload(names) : Promise.resolve([])),
    samples,
    setVolume: (v, ...a) => { chain.setVolume(v, ...a); mach.setVolume(v, ...a); },
    setEra: (v) => { chain.setEra(v); mach.setEra(v); },
    setRoom: (v) => { space.setRoom(v); },
    get room() { return space.room; },
    resume() { return ctx.state === 'suspended' && ctx.resume ? ctx.resume() : Promise.resolve(); },
  };
}
