// The sound of the objects of a scene in the video: the game puts each emitter at its entity and the listener at the player's head, and the video
// does the same with the cutscene's camera as the listener, as a function of the time and nothing else (no clock, no Math.random). For a stretch
// of a cutscene from `a` to `b` seconds it gives the events the renderer plays (src/film.js: `__film.sounds`):
//   - 'ouvinte' (the listener: where the camera is and where it looks) every STEP seconds, so a camera that moves pans and dims what it passes;
//   - each source of the layout that is on: a loop with a `curve` (its level over the stretch: reachGain of the distance to the camera, the same
//     curve as the engine's) or, for a one-shot that repeats (PERIODIC), each one that falls in the stretch, at the level of the camera then.
// A source that cannot be heard from the camera at any time of the stretch is not an event. `u` is the fraction of the stretch (the renderer scales it).
import { PERIODIC, periodicIn, reachGain, seedOf, ROLLOFF, WET, AUDIBLE } from './emitters.js';

export const STEP = 0.25;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const r4 = (x) => +x.toFixed(4);
const r2 = (x) => +x.toFixed(2);

/** The world place of an entity's point `off` (its own frame, turned by its yaw). */
export function worldPos(e, off = [0, 0, 0]) {
  const y = e.rot?.[1] ?? 0, c = Math.cos(y), s = Math.sin(y);
  return [e.pos[0] + off[0] * c + off[2] * s, e.pos[1] + off[1], e.pos[2] - off[0] * s + off[2] * c];
}

/** The sources of a layout that start on: [{ id, name, pos, gain, radius }]. (The ones a state turns on, `on: false`, are silent: the video's scenes do not run the game's states.) */
export function emittersOf(layout) {
  const out = [];
  for (const e of layout?.entities ?? []) {
    const c = e.components?.sound; if (!c?.name || c.on === false) continue;
    out.push({ id: e.id, name: c.name, pos: worldPos(e, c.offset), gain: c.gain ?? 1, radius: c.radius ?? 8 });
  }
  return out;
}

/** The camera at time t as a listener: { pos, dir }. */
const listenerAt = (camera, t) => { const c = camera(t); return { pos: c.eye, dir: [c.at[0] - c.eye[0], c.at[1] - c.eye[1], c.at[2] - c.eye[2]] }; };

/** The times of a stretch where something is sampled: a, a + STEP, ..., b. */
const grid = (a, b) => { const out = []; for (let t = a; t < b - 1e-6; t += STEP) out.push(t); out.push(b); return out; };

/** The events of the listener and of the emitters of `layout` for the stretch [a, b] of a cutscene whose camera is `camera(t)`. */
export function filmEmitterEvents({ layout, camera, a, b, seed = 1 }) {
  const natural = b - a, ts = grid(a, b), u = (t) => r4((t - a) / natural), ev = [];
  const lis = ts.map((t) => ({ t, ...listenerAt(camera, t) }));
  for (const L of lis) ev.push({ u: u(L.t), name: 'ouvinte', opts: { pos: L.pos.map(r2), dir: L.dir.map(r2) } });
  for (const s of emittersOf(layout)) {
    const per = PERIODIC[s.name], at = (t) => { let best = lis[0]; for (const L of lis) if (Math.abs(L.t - t) < Math.abs(best.t - t)) best = L; return best.pos; };
    const sd = seedOf(s.name, s.pos, seed), base = { pos: s.pos.map(r2), rolloff: ROLLOFF, wet: WET[s.name], seed: sd, live: true };
    if (per) {
      for (const t of periodicIn(s.name, s.pos, a, b, seed)) {
        const g = s.gain * reachGain(dist(at(t), s.pos), s.radius);
        if (g > AUDIBLE) ev.push({ u: u(t), name: s.name, opts: { pos: base.pos, gain: r4(g), seed: seedOf(s.name + t.toFixed(3), s.pos, seed), ...(base.wet !== undefined ? { wet: base.wet } : {}) } });
      }
      continue;
    }
    const curve = lis.map((L) => [u(L.t), r4(s.gain * reachGain(dist(L.pos, s.pos), s.radius))]);
    if (Math.max(...curve.map((c) => c[1])) <= AUDIBLE) continue;
    ev.push({ u: 0, name: s.name, opts: { ...base, ...(base.wet === undefined ? { wet: undefined } : {}), gain: 1, dur: r4(natural), curve } });
  }
  for (const e of ev) if (e.opts.wet === undefined) delete e.opts.wet;
  return ev;
}
