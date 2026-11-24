// The chase through the building (night 1, scene 4, acts 2 to 4 of the storyboard), for the film mode: the same poses the game plays
// (src/systems/fuga.js), as a function of the time t, with every command done right; and each command missed, after it. The views
// and the film's clock are in fuga-views.js (pure). No HUD: the film never has one. The blood of the attack is a thing the game builds
// when the option is on (src/game.js); the film shows the poses of the attack without it.
import { buildScene } from '../scenes/rua.js';
import { makeStage } from './stage.js';
import { views, poseAt, anchors, RUNS, MISSES, CAM_OFF } from './fuga-views.js';
import { buildCloth } from '../models/predio/index.js';
import { kitOf } from '../models/kit.js';
import { BEAT, lampOf, soundsOf, beatOf, recAt } from '../systems/fuga.js';

const poseBeat = (R, t) => beatOf(recAt(R.run.rec, t));
import RUA from '../../data/scenes/rua.json' with { type: 'json' };
import SCENES from '../../data/story/scenes.json' with { type: 'json' };

let last = { t: null, P: null };
const pose = (t) => { if (last.t !== t) last = { t, P: poseAt(t) }; return last.P; };
const away = (q) => ({ ...q, pos: [-30, -30], h: -40 });
const shot = {
  day: 0, cam: (u, t) => { const c = pose(t).cam; return { ...c, lens: c.fov }; },
  actors: {
    cao: (u, t) => { const d = pose(t).dog; return { ...d, color: d.sensor }; },
    cao2: (u, t) => { const d = pose(t).mirror; return d ? { ...d, color: d.sensor, mirror: true } : away({ pos: [0, 0], yaw: 0, speed: 0, state: 'calma' }); },
    jonas: (u, t) => { const j = pose(t).jonas; return j.hidden ? away(j) : { ...j, y: j.y ?? 0 }; },
  },
};
const shots = Object.fromEntries(Object.keys(views).map((k) => [k, shot]));

function buildOwn(r) {
  const cable = SCENES['n1-saida'].entities.find((e) => e.id === 'cabo-avenida');
  const sc = buildScene(r, { layout: { ...RUA, entities: [...RUA.entities, cable] } });
  sc.ents.setParam('cabo-avenida', 'emendado', true);           // (the splice closed before he ran)
  const update = sc.update.bind(sc), hatch = sc.group.getObjectByName('grade-folha'), cloth = buildCloth(kitOf(r)); sc.group.add(cloth.root);
  sc.update = (t, ctx) => {
    const P = pose(t);
    sc.fuga?.apply(P.fx); if (hatch) hatch.rotation.z = P.fx.hatch ?? 0; cloth.set(P.cloth);
    r.spot(lampOf(P, P.cam));
    update(t, ctx);
  };
  return sc;
}
const stage = makeStage({ buildScene, build: buildOwn, views, shots, actors: { cao: { kind: 'dog', seed: 3 }, cao2: { kind: 'dog', seed: 3 }, jonas: { role: 'jonas', seed: 1, pack: true } } });

/** The sounds of each run on the film's clock: the same rule the game plays them by (systems/fuga.js: soundStep), simulated over the run, each with its place. */
const NAMES = { 'porta-abre': 'queda-corpo', 'porta-bate': 'impacto-lixeira', 'vidro-estoura': 'vidro-aramado', 'porta-range': 'cabo-puxa', 'janela-sobe': 'cabo-puxa', 'degrau-cede': 'impacto-lixeira', corrimao: 'passo-grade', 'trava-solta': 'cabo-solta', 'escada-desce': 'impacto-lixeira', 'grade-range': 'cabo-puxa', 'grade-fecha': 'impacto-lixeira', 'pano-puxa': 'cabo-puxa', 'pano-voa': 'cabo-puxa' };
const sfx = [], put = (list, at) => { for (const e of list) sfx.push({ t: +at(e.t).toFixed(3), name: NAMES[e.name] ?? e.name, opts: { gain: +e.gain.toFixed(2), ...(e.pos ? { pos: e.pos.map((v) => +v.toFixed(2)) } : {}) } }); };
for (const R of RUNS) {
  const end = R.run.rec.failAt != null ? R.run.rec.failAt + 3.6 : R.run.total, all = soundsOf(R.run.rec, 0, end);
  // (a run is listed whole once; the blocks of the other cameras repeat what is of the beats they film)
  for (const base of [0, ...Object.values(CAM_OFF)]) put(all.filter((e) => { const P = poseBeat(R, e.t); return base === 0 ? R.off === 0 || BEAT[P].branch : Boolean(BEAT[P].cams); }), (t) => base + R.off + R.filmOf(t));
}
for (const m of MISSES) put(soundsOf(m.rec, m.t0, m.t1), (t) => m.off + (t - m.t0));
sfx.sort((a, b) => a.t - b.t);

export default {
  name: 'fuga', scene: 'fuga',
  build: stage.build,
  views, anchors,
  camera: stage.camera,
  actor: (id, t) => { const P = pose(t), q = id === 'cao' ? P.dog : id === 'jonas' ? P.jonas : null; return q ? q.heard ?? [q.pos[0], (q.h ?? 0) + 0.8, q.pos[1]] : stage.actor(id, t); },
  sfx,
};
