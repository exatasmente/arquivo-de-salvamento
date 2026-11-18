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
import { buildPerson } from '../models/person.js';
import { buildDog } from '../models/dog.js';
import { buildDecoy } from '../models/decoy.js';
import { buildHalo } from '../scenes/halo.js';

export const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
export const ease = (u) => u * u * (3 - 2 * u);

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
          p.root.position.set(s.pos[0], (s.y ?? 0) + (sc.ground ? sc.ground(s.pos[0], s.pos[1]) : 0), s.pos[1]); p.root.rotation.order = 'YXZ'; p.root.rotation.y = s.yaw ?? 0; p.root.rotation.x = s.pitch ?? 0;
          if (actors[id].kind === 'dog') {
            p.setPose({ phase: s.phase ?? t * 5, speed: s.speed ?? 0, state: s.state ?? 'calma', sensorColor: s.color ?? s.sensor ?? null, look: s.look ?? null, action: s.action ?? null, at: s.at, t });
            // a light that must read from afar (the broken dog's colours): the same halo the game puts on it
            if (s.halo) { if (!p.halo) { p.halo = buildHalo(r); sc.group.add(p.halo.sprite); } p.halo.follow(p); p.halo.set(s.color && s.color !== '#16161a' ? s.color : null, s.halo); } else p.halo?.set(null);
          }
          else if (actors[id].kind === 'isca') { p.setActive(s.active ?? false); p.update(0, { active: s.active ?? false, t }); }
          else p.setPose({ phase: s.phase ?? t * 6.5, walk: s.walk ?? 0, run: s.run ?? 0, crouch: s.crouch ?? 0, action: s.action ?? null, at: s.at ?? 0, gaze: s.gaze, lamp: s.lamp, t });
        }
        update(t, ctx);
      };
      return sc;
    },
    /** Where the camera is and looks at time t. */
    camera(t) {
      const [key, v] = find(t);
      const u = Math.min(1, Math.max(0, (t - v.t[0]) / (v.t[1] - v.t[0])));
      cur.v = v; cur.u = u; cur.t = t; cur.key = key;
      const c = v.cam(u, t);
      return { eye: c.eye, at: c.at, fov: c.fov };
    },
  };
  return out;
}
