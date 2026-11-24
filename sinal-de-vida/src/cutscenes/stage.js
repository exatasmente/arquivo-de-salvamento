// How a cutscene of this game is made: a table of views, each a stretch of time with its camera path, its time of day,
// its people. Everything is a function of the time t (seconds of the
// cutscene): no real clock, no Math.random; the people are the game's own model (models/person.js) posed by t.
//
//   const stage = makeStage({ buildScene, views: { nome: [t0, t1, 'o que mostra'] }, actors: { id: { role, seed } },
//     shots: { nome: { cam(u, t) -> { eye, at }, day, actors: { id: (u, t, sc) -> { pos: [x, z], yaw, walk, run, crouch } } } } });
//   An actor is a person ({ role, seed }: also { action, at, gaze, crouch }), a fleet dog ({ kind: 'dog', seed }: its state gives { pos, yaw, y, pitch, speed, state, look, sensor, action, at }) or a sound decoy ({ kind: 'isca' }: { pos, yaw, active }).
//   `build` may be given: (r) -> the scene; else buildScene(r).
//   export default { name, scene, build: stage.build, views, anchors, camera: stage.camera, sfx };   // views: the same table
//
// `u` is 0..1 inside the view. The film mode (src/film.js) asks `camera(t)` and then updates the scene, so the
// scene is told here (in its update) about the daylight, the people of the view being filmed.
// The step of a person or a dog that moves follows the ground it covers (2026-11-19: with the step set by the clock, the feet slid): its
// phase is stepped every 1/60 s along its path from the start of the view, by the ground covered, the way its model steps it in the game
// (Jonas: his model's walkStep, the gait chosen by the speed, his starts, stops and turns as the way tells them; the others: the way over the stride), so it is pure: the same t gives the same phase
// in whatever order the frames are asked. `walk` (how much it walks) comes from how fast it goes, if the view does not say it.
import { buildPerson } from '../models/person.js';
import { buildDog } from '../models/dog.js';
import { buildDecoy } from '../models/decoy.js';
import { buildHalo } from '../scenes/halo.js';

export const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
export const ease = (u) => u * u * (3 - 2 * u);

const DT = 1 / 60;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * The way an actor of a view has gone by time t: { phase (radians of its gait), speed (m/s, over the last tenth of a second), and for Jonas
 * what his model's walkStep keeps: from (metres since he set off), stopPhase }. `f` gives its pose ({ pos, yaw }) at (u, t);
 * `stepOf(state, moved, dt, pose, speed)` gives the state after `moved` metres (signed: back is negative): { phase, ... }.
 */
function travel(cache, v, f, t, sc, stepOf) {
  const at = (tt) => f(clamp01((tt - v.t[0]) / (v.t[1] - v.t[0])), tt, sc);
  const c = cache;
  if (!c.ts.length) { c.ts.push(v.t[0]); c.st.push({ phase: 0, from: 0, still: 1, stopPhase: null }); c.sp.push(0); c.prev = at(v.t[0]); }
  while (c.ts.at(-1) < t) {
    const t1 = c.ts.at(-1) + DT, b = at(t1), a = c.prev;
    const dx = b.pos[0] - a.pos[0], dz = b.pos[1] - a.pos[1], d = Math.hypot(dx, dz);
    let st = { ...c.st.at(-1) }, sp = 0;
    if (d < 0.5) {                                 // (more is a jump: an actor put out of sight, or back)
      const fwd = -Math.sin(b.yaw ?? 0) * dx - Math.cos(b.yaw ?? 0) * dz, sgn = Math.abs(fwd) >= 0.3 * d ? Math.sign(fwd) || 1 : 1;
      sp = d / DT; st = stepOf(st, sgn * d, DT, b, sp);
    }
    c.ts.push(t1); c.st.push(st); c.sp.push(sp); c.prev = b;
  }
  let i = c.ts.length - 1; while (i > 0 && c.ts[i] > t) i--;
  const k = i < c.ts.length - 1 ? (t - c.ts[i]) / DT : 0, A = c.st[i], B = c.st[i + 1] ?? A;
  let n = 0, s = 0; for (let j = Math.max(1, i - 5); j <= Math.min(c.sp.length - 1, i + 1); j++) { s += c.sp[j]; n++; }
  // (a phase that jumps back is a start taken up by its clip: no blend across it)
  return { ...A, phase: Math.abs(B.phase - A.phase) < 2 ? A.phase + (B.phase - A.phase) * k : A.phase, from: (A.from ?? 0) + ((B.from ?? 0) - (A.from ?? 0)) * (B.from >= A.from ? k : 0), speed: n ? s / n : 0 };
}

export function makeStage({ buildScene, build: buildOwn, views, shots, actors = {} }) {
  const list = Object.entries(views).map(([k, [t0, t1, desc]]) => [k, { t: [t0, t1], desc, ...shots[k] }]);
  const cur = { v: list[0][1], u: 0, t: 0, key: list[0][0] };
  const find = (t) => { for (const [k, v] of list) if (t >= v.t[0] && t < v.t[1]) return [k, v]; const last = list[list.length - 1]; return t < list[0][1].t[0] ? list[0] : last; };
  const out = {
    /** Builds the scene this cutscene films; its update also applies what the current view asks (daylight, people). */
    build(r) {
      const sc = buildOwn ? buildOwn(r) : buildScene(r);
      const people = {};
      for (const [id, a] of Object.entries(actors)) {
        const p = a.kind === 'dog' ? buildDog(r, { seed: a.seed }) : a.kind === 'isca' ? buildDecoy(r, { seed: a.seed }) : buildPerson(r, { seed: a.seed, role: a.role, pack: a.pack });
        p.root.visible = false; sc.group.add(p.root); people[id] = p;
      }
      let applied = null;
      const ways = new Map();               // view|actor -> the way it has gone (see travel)
      const update = sc.update.bind(sc);
      sc.update = (t, ctx) => {
        const v = cur.v, day = typeof v.day === 'function' ? v.day(cur.u, t) : v.day ?? 0;
        const cam = v.cam(cur.u, t), key = `${cur.key}|${day.toFixed(3)}`;
        if (applied !== key) {
          applied = key;
          sc.setDaylight(day);
        }
        for (const [id, p] of Object.entries(people)) {
          const f = v.actors?.[id];
          p.root.visible = Boolean(f);
          if (!f) continue;
          const s = f(cur.u, t, sc);
          const wkey = `${cur.key}|${id}`;
          if (!ways.has(wkey)) ways.set(wkey, { ts: [], st: [], sp: [], prev: null });
          const dogKind = actors[id].kind === 'dog';
          // (Jonas's gait is his model's, by the speed; a view may still say `run` itself)
          const gaitOf = (q, sp) => ({ ...(p.gaitAt?.(sp) ?? { run: q.run ?? 0 }), ...(q.walk !== undefined && q.run !== undefined ? { run: q.run } : {}), crouch: q.crouch ?? 0 });
          const stepOf = dogKind ? (st, m, dt, q, sp) => ({ ...st, phase: st.phase + m / Math.max(0.2, p.stride?.(q.state ?? 'calma', sp) ?? 0.9) * 2 * Math.PI })
            : p.walkStep ? (st, m, dt, q, sp) => p.walkStep(st, m, dt, gaitOf(q, sp), Boolean(q.stop))
              : (st, m, dt, q) => ({ ...st, phase: st.phase + m / Math.max(0.2, p.stride?.({ run: q.run ?? 0, crouch: q.crouch ?? 0 }) ?? 1.5) * 2 * Math.PI });
          const way = s.phase === undefined && actors[id].kind !== 'isca' ? travel(ways.get(wkey), v, f, t, sc, stepOf) : { phase: s.phase ?? 0, speed: s.speed ?? 0 };
          const walk = s.walk ?? clamp01((way.speed - 0.05) / 0.3);
          p.root.position.set(s.pos[0], (s.y ?? 0) + (s.h ?? (sc.ground ? sc.ground(s.pos[0], s.pos[1]) : 0)), s.pos[1]); p.root.scale.z = s.mirror ? -1 : 1; p.root.rotation.order = 'YXZ';      // (`h`: the floor it stands on, off the street; `mirror`: its twin in a glass) p.root.rotation.y = s.yaw ?? 0; p.root.rotation.x = s.pitch ?? 0;
          if (actors[id].kind === 'dog') {
            p.setPose({ phase: way.phase, speed: s.speed !== undefined && s.phase !== undefined ? s.speed : way.speed, walk: s.walk ?? walk, state: s.state ?? 'calma', sensorColor: s.color ?? s.sensor ?? null, look: s.look ?? null, action: s.action ?? null, at: s.at, lift: s.y ?? 0, t });
            // a light that must read from afar (the broken dog's colours): the same halo the game puts on it
            if (s.halo) { if (!p.halo) { p.halo = buildHalo(r); sc.group.add(p.halo.sprite); } p.halo.follow(p); p.halo.set(s.color && s.color !== '#16161a' ? s.color : null, s.halo); } else p.halo?.set(null);
          }
          else if (actors[id].kind === 'isca') { p.setActive(s.active ?? false); p.update(0, { active: s.active ?? false, t }); }
          else p.setPose({ phase: way.phase, from: way.from, walk, ...gaitOf(s, way.speed), crouch: s.crouch ?? 0, action: s.action ?? null, at: s.at, gaze: s.gaze, lamp: s.lamp, twist: s.twist ?? 0, stairs: s.stairs ?? null, ground: s.ground ?? null, turn: s.turn ?? null, stop: s.stop ? { ...s.stop, phase: way.stopPhase ?? way.phase } : null, t });
        }
        update(t, ctx);
      };
      return sc;
    },
    /** Where an actor of the view at time t is, as a point to put a sound on ([x, y, z], a little above the floor), or null when it is not in the view. */
    actor(id, t) {
      const [, v] = find(t), f = v.actors?.[id];
      if (!f) return null;
      const u = Math.min(1, Math.max(0, (t - v.t[0]) / (v.t[1] - v.t[0]))), q = f(u, t);
      return q?.pos ? [q.pos[0], (q.y ?? 0) + 0.8, q.pos[1]] : null;
    },
    /** Where the camera is and looks at time t. */
    camera(t) {
      const [key, v] = find(t);
      const u = Math.min(1, Math.max(0, (t - v.t[0]) / (v.t[1] - v.t[0])));
      cur.v = v; cur.u = u; cur.t = t; cur.key = key;
      const c = v.cam(u, t);
      return { eye: c.eye, at: c.at, fov: c.fov, ...(c.lens ? { lens: c.lens } : {}) };
    },
  };
  return out;
}
