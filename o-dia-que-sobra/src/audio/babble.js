// Game-style babble: one blip per letter, like the text of an old dialogue box, with a voice that
// the seed picks (pitch, wave, vowel colour, speed, vibrato). Only one oscillator and a few filters
// per babble however long the text: pitch, vowel and gate are automated on them.
import { rng, hash, pick, curveOf } from './util.js';

const VOWELS = { a: [800, 1250, 2600], e: [520, 1900, 2650], i: [310, 2300, 3000], o: [500, 900, 2450], u: [350, 700, 2300] };
const VKEYS = Object.keys(VOWELS);
const PLOSIVE = new Set('bdgkpqt');
const FOLD = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u', ç: 'c' };

/** The voice a seed gives: stable for a seed, different between seeds. */
/** The protagonist's own voice on the phone: fixed, whatever the seed. Low, narrow, an old recording. */
const SELF = { f0: 76, wave: 'sawtooth', formant: 0.8, cps: 13.5, vib: null, body: 0.85, wobble: 0.05, order: 2 };

export function babbleVoice(seed, self = false) {
  if (self) return SELF;
  const r = rng(hash('babble', seed >>> 0));
  return {
    f0: 92 + r() * 140, wave: ['square', 'sawtooth', 'triangle'][pick(r, 3)], formant: 0.86 + r() * 0.36,
    cps: 14 + r() * 8, vib: r() < 0.4 ? { rate: 5 + r() * 2, depth: 0.012 + r() * 0.015 } : null,
    body: 0.55 + r() * 0.3, wobble: 0.04 + r() * 0.08, order: pick(r, 5),
  };
}

/** Timeline of a text: [{ t, d, ch, last, clause }] relative to 0, plus the total duration. */
export function babbleTimeline(seed, text, self = false) {
  const V = babbleVoice(seed, self), slot = 1 / V.cps, items = [];
  let t = 0, clauseStart = 0;
  const chars = [...String(text ?? '').toLowerCase()];
  for (let i = 0; i < chars.length; i++) {
    const c = FOLD[chars[i]] ?? chars[i];
    if (/[a-z0-9]/.test(c)) items.push({ t, d: slot, ch: c, i });
    else if (c === ' ') { t += slot * 0.55; continue; }
    else if (c === '.' || c === '!' || c === '?' || c === '\n') { t += 0.2 + slot; closeClause(items, clauseStart, c); clauseStart = items.length; continue; }
    else if (c === ',' || c === ';' || c === ':' || c === '-') { t += 0.11; continue; }
    else continue;
    t += slot;
  }
  closeClause(items, clauseStart, '.');
  return { items, dur: t > 0 ? t + 0.05 : 0, voice: V };
}
function closeClause(items, from, end) {
  const n = items.length - from;
  for (let k = from; k < items.length; k++) { items[k].u = n > 1 ? (k - from) / (n - 1) : 0; items[k].end = end; items[k].fromEnd = items.length - 1 - k; }
}

/** Plays the babble at time t into `dest` (a voice destination); returns the duration. */
export function playBabble(A, dest, t, seed, text, o = {}) {
  const self = !!o.self, { items, dur, voice: V } = babbleTimeline(seed, text, self);
  if (!items.length) return 0;
  const ctx = A.ctx, rate = o.rate ?? 1, pitch = (o.pitch ?? 1) * V.f0, r = rng(hash('babble-j', seed >>> 0));
  const osc = ctx.createOscillator(); osc.type = V.wave;
  const env = ctx.createGain(); env.gain.value = 0.0001;
  const fs = [0, 1, 2].map(() => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = [5, 6, 7][0]; return b; });
  const fg = [1, 0.8, 0.5], mix = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
  osc.connect(env);
  fs.forEach((f, k) => { const g = ctx.createGain(); g.gain.value = fg[k] * 2.2; f.Q.value = 4 + k * 1.5; env.connect(f); f.connect(g).connect(mix); });
  const body = ctx.createGain(); body.gain.value = V.body * 0.25; env.connect(body).connect(mix); // some unfiltered buzz: the voice stays a toy, not a vowel
  const extras = [osc];
  if (self) { // old tape: band-limited, pushed into a soft clip, with wow, flutter and hiss
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 240;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 2300; lp2.Q.value = 0.9;
    const sh = ctx.createWaveShaper(); sh.curve = curveOf((x) => Math.tanh(x * 3.2) / Math.tanh(3.2), 1025);
    const out = ctx.createGain(); out.gain.value = 0.55;
    mix.connect(lp).connect(hp).connect(sh).connect(lp2).connect(out).connect(dest.node);
    for (const [rate, depth] of [[0.8, 0.018], [6.5, 0.006]]) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = rate; mg.gain.value = pitch * depth; m.connect(mg).connect(osc.frequency); extras.push(m); }
    const hs = ctx.createBufferSource(); hs.buffer = A.noise('white'); hs.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3200; hf.Q.value = 0.8;
    const hg = ctx.createGain(); hg.gain.value = 0.006; hs.connect(hf).connect(hg).connect(dest.node);
    hs.start(t, 0.3); hs.stop(t + dur / rate + 0.05);
  } else mix.connect(lp).connect(dest.node);
  if (V.vib) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = V.vib.rate; mg.gain.value = pitch * V.vib.depth; m.connect(mg).connect(osc.frequency); extras.push(m); }
  const peak = 0.2 * (o.level ?? 1);
  osc.frequency.setValueAtTime(pitch, t);
  for (const it of items) {
    const ts = t + it.t / rate, d = it.d / rate * (PLOSIVE.has(it.ch) ? 0.6 : 0.82);
    const vk = /[aeiou]/.test(it.ch) ? it.ch : VKEYS[(it.ch.charCodeAt(0) + V.order) % 5];
    const form = VOWELS[vk];
    let f = pitch * (1.06 - 0.12 * it.u) * 2 ** ((((it.ch.charCodeAt(0) * 7 + it.i * 3) % 7) - 3) / 26) * (1 + (r() - 0.5) * V.wobble);
    if (it.end === '?' && it.fromEnd < 4) f *= 1 + 0.09 * (4 - it.fromEnd);
    else if (it.end === '!') f *= 1.1;
    let g = peak * (PLOSIVE.has(it.ch) ? 0.75 : 1) * (it.end === '!' ? 1.3 : 1) * (0.85 + r() * 0.3);
    if (PLOSIVE.has(it.ch)) { osc.frequency.setValueAtTime(f * 0.8, ts); osc.frequency.linearRampToValueAtTime(f, ts + 0.014); } else osc.frequency.setValueAtTime(f, ts);
    fs.forEach((b, k) => b.frequency.setTargetAtTime(form[k] * V.formant, ts, 0.006));
    const att = Math.min(0.008, d * 0.2);
    env.gain.setValueAtTime(0.0001, ts); env.gain.linearRampToValueAtTime(g, ts + att);
    env.gain.setValueAtTime(g, ts + d * 0.65); env.gain.linearRampToValueAtTime(0.0001, ts + d);
  }
  const end = t + dur / rate;
  osc.start(t); osc.stop(end + 0.05);
  for (const e of extras.slice(1)) { e.start(t); e.stop(end + 0.05); }
  return dur / rate;
}
