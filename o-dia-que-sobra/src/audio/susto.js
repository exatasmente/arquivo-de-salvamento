// The scare (D3 was changed by the person: a jump scare is allowed, rare and earned: the attack of the ending 4 and two or three events of weeks 3 and 4 at low
// sanity). One short hit: a crack of noise, a low thump falling, a dissonant sting that dies at once. Strong, never clipping: the peak after the chain is
// measured by tools/smoke.mjs and stays under -3 dBFS. Same contract as oneshots.js (fn({ K, t, r, o }) -> seconds). o.gain scales it (default 1).
import { vary } from './util.js';

export const SUSTO_ONESHOTS = {
  susto_golpe({ K, t, r, o }) {
    const g = o.gain ?? 1, p = vary(r, 0.04);
    K.noise(t, 0.08, { type: 'lowpass', f0: 5200, g: 0.34 * g, att: 0.001, off: r() });                                 // the crack
    K.noise(t, 0.34, { kind: 'brown', f0: 420, f1: 80, q: 0.7, g: 0.4 * g, att: 0.002, off: r() });                      // the body of it
    K.tone(t, 0.3, { f0: 96 * p, f1: 34, g: 0.5 * g, att: 0.002 });                                                      // the thump
    for (const f of [987, 1046, 1480]) K.tone(t, 0.2, { type: 'sawtooth', f0: f * p, f1: f * 0.97, g: 0.045 * g, att: 0.001, lp: 4200 });   // the sting
    return 0.5;
  },
};
export const SUSTO_NAMES = Object.keys(SUSTO_ONESHOTS);
