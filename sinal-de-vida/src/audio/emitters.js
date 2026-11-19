// The sound that comes from the objects of a scene. An entity of the layout carries `components.sound` (the engine's sound source, docs/engine.md:
// { name, gain, radius, on, loop, delay, offset }); the engine places it at the entity, asks the game to start it and sets its level by the
// distance to the listener (full up to 15% of `radius`, silence at it). This is how the game starts it:
//
//   const emitters = createEmitters(audio, { seed });
//   hooks.sound.start = emitters.start        // (name, { pos, gain, loop }) -> { gain(v), stop() }
//   emitters.group('radio', 0..1)             // a kind of source heard less (the radio's own static, while Jonas sits at the bench)
//
// Three things the engine does not do, done here:
//   - A source is only a voice while it can be heard: at 0 it is nothing (no node, no loop), so a gallery of twelve lamps keeps the two or three
//     near the player. A heard one is a `live` voice (it has a place, the top of it goes with distance, the room's share grows) at the place of the entity.
//   - A name that is a one-shot repeats: PERIODIC says how often, with a jitter, from a seeded sequence (a drop off a pipe, a relay in a box). The same
//     sequence, `periodicTimes`, is what the video's render lays down, so the game and the video drip in the same rhythm.
//   - A group (GROUPS) is a kind of source that the game can take down together.
// The level the engine asks for is `reachGain(d, radius) * gain`, the same curve; the video computes it from the camera.

/**
 * One-shots that go on by themselves. `every`: [least, most] seconds between two, from a seeded sequence (the first comes somewhere in the first
 * stretch). `period`: on the beat of the game's clock (`phase` seconds late): the drop of the leaking pipe lands where its particle does, because the
 * layout's emitter (rate 1, life 0.85, gravity -9, born from -life) lands one on every whole second of the scene's clock.
 */
export const PERIODIC = {
  'gota-cano': { period: 1, phase: 0 },
  'rele-semaforo': { every: [2.6, 8.5] },
};
/** Sources that belong to a group the game turns up and down together. */
export const GROUPS = { chiado: 'radio' };
/** The share of the room's reverb a source gets when its recording is a dry one (the radio's static is dry on the desk, but across the room it is in the room). */
export const WET = { chiado: 0.5 };
/** How much the panner's own fall-off counts on a thing in a room (the engine's `radius` already shapes the level): a small rolloff keeps the side and the air, not a second fade. */
export const ROLLOFF = 0.35;
/** A source below this level is not a voice. */
export const AUDIBLE = 0.004;

/** The engine's curve (components.js): 1 up to 15% of the radius, then falling to 0 at the radius, squared. */
export function reachGain(d, radius) {
  const near = radius * 0.15;
  const k = d <= near ? 1 : d >= radius ? 0 : 1 - (d - near) / (radius - near);
  return k * k;
}

const mix32 = (a) => { a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d); a = Math.imul(a ^ (a >>> 12), 0x297a2d39); return (a ^ (a >>> 15)) >>> 0; };
/** A seed from a place and a name: two lamps at two places are not at the same moment of their hum (and a drop never falls twice together). */
export function seedOf(name, pos, base = 1) {
  let h = mix32(base * 2654435761 >>> 0);
  for (const c of name) h = mix32(h ^ c.charCodeAt(0));
  for (const v of pos) h = mix32(h ^ Math.round(v * 100));
  return h;
}
const next = (h) => { h = (h + 0x6d2b79f5) >>> 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return [h, ((t ^ (t >>> 14)) >>> 0) / 4294967296]; };

/** The seconds, from the start of a source, at which its one-shot sounds: a seeded sequence that stops at `until`. */
export function periodicTimes(seed, every, until, from = 0) {
  const out = []; let h = seed >>> 0, r, t;
  [h, r] = next(h); t = every[0] * r;                                   // the first one comes somewhere in the first stretch
  while (t < until) { if (t >= from) out.push(+t.toFixed(4)); [h, r] = next(h); t += every[0] + (every[1] - every[0]) * r; }
  return out;
}

/** When a one-shot of PERIODIC sounds between `from` and `to` (seconds of the scene's clock), for a source at `pos`: what the video lays down. */
export function periodicIn(name, pos, from, to, seed = 1) {
  const per = PERIODIC[name]; if (!per) return [];
  if (per.period) { const out = []; for (let k = Math.ceil((from - (per.phase ?? 0)) / per.period); ; k++) { const t = k * per.period + (per.phase ?? 0); if (t >= to) break; out.push(+t.toFixed(4)); } return out; }
  return periodicTimes(seedOf(name, pos ?? [0, 0, 0], seed), per.every, to, from);
}

/** The emitters of a game: `audio` is createAudio's result (play, start; ctx). The game says what time it is with setClock(t), the clock it gives the scene's update. */
export function createEmitters(audio, { seed = 1 } = {}) {
  const ctx = audio.ctx, groups = {}, live = new Set();
  let clock = null;
  const now = () => clock ?? ctx.currentTime;
  const groupOf = (name) => groups[GROUPS[name]] ?? 1;
  function start(name, o = {}) {
    const pos = o.pos ?? null, per = PERIODIC[name];
    const S = { name, pos, gain: 0, voice: null, quietAt: null, born: now(), i: 0, k: null, times: per?.every ? periodicTimes(seedOf(name, pos ?? [0, 0, 0], seed), per.every, 1e5 / 60) : null, stopped: false };
    const spec = { pos, rolloff: ROLLOFF, live: true, wet: o.wet ?? WET[name] };
    const apply = () => {
      if (S.stopped) return;
      const v = S.gain * groupOf(name), at = now();
      if (per) {                                                      // the one-shot comes by its own clock, if it can be heard
        if (per.period) {
          const k = Math.floor((at - (per.phase ?? 0)) / per.period), was = S.k; S.k = k;
          if (was !== null && k === was + 1 && v > AUDIBLE) audio.play(name, { pos, gain: v, wet: o.wet ?? WET[name] });
        } else {
          const age = at - S.born;
          while (S.i < S.times.length && S.times[S.i] <= age) { if (v > AUDIBLE && age - S.times[S.i] < 0.3) audio.play(name, { pos, gain: v, wet: o.wet ?? WET[name] }); S.i++; }
        }
        return;
      }
      if (v > AUDIBLE) {
        S.quietAt = null;
        if (!S.voice) S.voice = audio.start(name, { ...spec, gain: v }); else S.voice.gain(v);
      } else if (S.voice) {
        S.voice.gain(0); S.quietAt ??= at;
        if (at - S.quietAt > 1.5) { S.voice.stop(); S.voice = null; S.quietAt = null; }   // out of earshot for a while: the voice is let go
      }
    };
    S.apply = apply; live.add(S);
    return {
      gain(v) { S.gain = v; apply(); },
      stop() { S.stopped = true; live.delete(S); S.voice?.stop(); S.voice = null; },
      get playing() { return Boolean(S.voice); },
    };
  }
  return {
    start,
    /** The clock of the scene (the one the game gives the scene's update): what the beat of a one-shot is counted on. */
    setClock(t) { clock = t; },
    /** Takes a kind of source down together (0 to 1): at once the voices follow. */
    group(name, k) { groups[name] = Math.max(0, Math.min(1, k)); for (const S of live) S.apply(); },
    /** How many sources are a voice now, and how many the scene has (the tests and the reel look at this). */
    stats() { let heard = 0; for (const S of live) if (S.voice) heard++; return { sources: live.size, heard }; },
    seed,
  };
}
