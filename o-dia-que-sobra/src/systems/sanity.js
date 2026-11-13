// SanitySystem: a value from 0 to 100 with no bar on the screen. The player feels it in the body, never in a
// number: the central point trembling, the breath, the dark edge and the colour of the picture, the hum going
// muffled (audio), the lines of the clipboard that will not stay still, a digit that shakes on the pump's panel
// and a key that does not take. The value goes down from what is seen and from the dark; it comes up slowly in the
// lit shop and office, with the shop's coffee, and with the pills (medication.js).
//
//   100-80  nothing        79-60  breath, hum, a shape in the corner of the eye (events)
//   59-40   hands tremble  39-20  colour and perspective bend, sound muffled, hard to concentrate
//   19-1    everything stronger   0  the most it can be (the entity of phase 4 attacks here)
import { mulberry32 } from '../rng.js';

export const STAGES = [80, 60, 40, 20, 1]; // value >= STAGES[i] is stage i ... (stage 5 is exactly 0)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// by stage: aim (radians), hand (metres), key (chance a key does not take), breath (camera, radians),
// shake (digits on the panel, px), colour (0..1), mind (how often the clipboard goes unreadable), blur (px)
const BY_STAGE = [
  { aim: 0, hand: 0, key: 0, breath: 0, shake: 0, color: 0, mind: 0, blur: 0 },
  { aim: 0, hand: 0, key: 0, breath: 0.0016, shake: 0, color: 0, mind: 0, blur: 0 },
  { aim: 0.014, hand: 0.0035, key: 0.05, breath: 0.0026, shake: 0.7, color: 0.15, mind: 0, blur: 0 },
  { aim: 0.03, hand: 0.006, key: 0.11, breath: 0.0036, shake: 1.2, color: 0.5, mind: 0.45, blur: 0.25 },
  { aim: 0.045, hand: 0.009, key: 0.19, breath: 0.0048, shake: 1.8, color: 0.8, mind: 0.9, blur: 0.5 },
  { aim: 0.055, hand: 0.011, key: 0.26, breath: 0.006, shake: 2.2, color: 1, mind: 1, blur: 0.7 },
];

export function startOfNight(rules, day, base = rules.sanidade.inicio) {
  // every shift without a day off starts 2 points below the one before; the day off restores `base` (what the sleep gave back)
  const sinceRest = (day - 1) % 6;
  return Math.max(0, Math.min(100, base) - rules.sanidade.porExpedienteSemFolga * sinceRest);
}

export function createSanity(bus, { opts }) {
  let value = 100, darkT = 0, calmT = 0, lastStage = 0, keyN = 0, keySeed = 1;
  const stageOf = (v) => (v <= 0 ? 5 : v >= 80 ? 0 : v >= 60 ? 1 : v >= 40 ? 2 : v >= 20 ? 3 : 4);
  let keyRng = mulberry32(1);

  function set(v, why) {
    const nv = clamp(v, 0, 100);
    if (nv === value) return;
    const old = value; value = nv;
    bus.emit('sanity:change', value, value - old, why);
    const s = stageOf(value);
    if (s !== lastStage) { bus.emit('sanity:stage', s, lastStage); lastStage = s; }
    if (value === 0 && old > 0) bus.emit('sanity:zero');
    bus.emit('audio:sanity', value);
  }
  let lastFilter = '';
  return {
    get value() { return value; },
    get stage() { return stageOf(value); },
    reset(v = 100, seed = 1) { value = clamp(v, 0, 100); lastStage = stageOf(value); darkT = calmT = 0; keySeed = seed; keyRng = mulberry32(seed * 7 + 3); keyN = 0; bus.emit('audio:sanity', value); },
    add(delta, why) { set(value + delta, why); },
    /** ctx: { danger (0..4), lit (bool), calmArea (bool) } */
    update(dt, ctx) {
      if (ctx.danger >= 3 && !ctx.lit) { darkT += dt; if (darkT >= 20) { darkT -= 20; set(value - 1, 'escuro'); } } else darkT = Math.max(0, darkT - dt);
      if (ctx.calmArea && ctx.lit && value < 60) { calmT += dt; if (calmT >= 30) { calmT -= 30; set(value + 1, 'calma'); } } else calmT = 0;
    },
    /** Does this key press fail? (the panel and the change tray ask; one seeded draw per press) */
    keyFails() {
      const p = BY_STAGE[stageOf(value)].key; keyN++;
      return p > 0 && keyRng() < p;
    },
    /** What the picture and the hands do, as a function of the value and the time. */
    fx(t) {
      const s = stageOf(value), k = 1 - value / 100, B = BY_STAGE[s];
      const reduce = opts.reduceFlash ? 0.5 : 1;
      const wob = Math.sin(t * 0.31) * B.color;
      // colour and perspective bend slowly (a slow swell, never a flash): hue, saturation and a little blur
      const filter = s >= 2
        ? `saturate(${(1 - 0.5 * B.color * reduce).toFixed(2)}) hue-rotate(${Math.round(wob * 9 * reduce)}deg) contrast(${(1 + 0.08 * B.color).toFixed(2)})${B.blur ? ` blur(${(B.blur * (0.6 + 0.4 * Math.sin(t * 0.5))).toFixed(1)}px)` : ''}`
        : '';
      return {
        stage: s,
        vignette: clamp((k - 0.15) * 1.25, 0, 0.92),
        aim: B.aim,                                         // radians of tremor on the central point
        aimX: Math.sin(t * 9.1) * B.aim * 0.7 + Math.sin(t * 23.7) * B.aim * 0.3,
        aimY: Math.sin(t * 7.3 + 1) * B.aim * 0.7 + Math.sin(t * 19.1) * B.aim * 0.3,
        hand: B.hand,                                       // the carried thing trembles
        breath: B.breath * (1 + 0.25 * Math.sin(t * 0.4)),  // the camera rises and falls with the breath
        roll: s >= 3 ? Math.sin(t * 0.7) * 0.025 * k * 3 * reduce : 0,
        fov: s >= 3 ? Math.sin(t * 0.45) * 2.5 * k * reduce : 0,
        sway: s >= 2 ? 0.0025 * k : 0,
        shake: B.shake,                                     // px a digit trembles on the panel
        mind: B.mind,                                       // how much of the clipboard slips away
        filter,
        releaseLag: s >= 4 ? 0.45 : s === 3 ? 0.35 : s === 2 ? 0.25 : 0,   // the trigger is harder to let go at the right moment
        halluc: s >= 3 ? 0.4 + 0.15 * (s - 3) : s * 0.12,     // 0..1, for the sound (audio.setHallucination)
      };
    },
    stageOf, startOfNight,
  };
}
