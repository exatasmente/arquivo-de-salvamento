// The cutscenes of the night 1 for the film mode (the video of the night): the places and the moments of the avenue that the game plays, each a
// view the video can use alone: the city seen from inside the shaft, up through its grate (the grate is a thing of the street, in the pavement:
// scenes/grade.js; nothing is put in front of the camera), the broken dog blinking its eight colours (S3: 6 s), the dog on its route, the decoy,
// the splice of the cable. Everything is a function of the time t; the street is the one of data/scenes/rua.json plus the cut cable of the scene
// (data/story/scenes.json, n1-saida), so what is filmed is what is played. A view is [t0, t1, what it shows].
import { buildScene } from '../scenes/rua.js';
import { makeStage, mix, ease } from './stage.js';
import { flashAt } from '../systems/cores.js';
import { routeAt } from '../systems/route.js';
import RUA from '../../data/scenes/rua.json' with { type: 'json' };
import SCENES from '../../data/story/scenes.json' with { type: 'json' };

const P = Math.PI;
const go = (a, b) => (u) => mix(a, b, ease(u));
const dolly = (e0, a0, e1, a1, fov) => (u) => ({ eye: go(e0, e1)(u), at: go(a0, a1)(u), fov });
// the first view is the very cutscene of the game (data/story/scenes.json, n1-cidade): the same shots and the same dogs, in the same time
const CID = SCENES['n1-cidade'].beats.find((b) => b.type === 'cutscene'), CID_T = CID.plan.reduce((a, p) => a + p.dur, 0);
const cidShot = (t) => { let k = Math.max(0, Math.min(CID_T - 1e-6, t)); for (const p of CID.plan) { if (k < p.dur) return [CID.shots.find((x) => x.id === p.shot), k / p.dur]; k -= p.dur; } return [CID.shots[0], 1]; };
const cidCam = (t) => { const [s, u0] = cidShot(t), u = ease(u0); return { eye: s.eye2 ? mix(s.eye, s.eye2, u) : s.eye, at: s.at2 ? mix(s.at, s.at2, u) : s.at, fov: s.fov }; };
const cidDog = (i) => (u, t) => { const a = CID.actors[i], k = Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0))); return { ...routeAt(a, k), speed: k > 0 && k < 1 ? a.speed : 0, state: a.state }; };
const S = SCENES['n1-saida'], BROKEN = S.street.broken, SPLICE = S.street.splice;

const views = {
  grade: [0, CID_T, 'A cidade que ainda trabalha, vista de dentro do poço de ventilação, de baixo para cima, pela grade fixa na calçada: os prédios, o viaduto e o céu por entre as barras, e os cães da frota que passam por cima dela'],
  'cao-quebrado': [14, 20, 'O cão quebrado junto à caçamba, sem rede, piscando as oito cores da sequência uma depois da outra, 0,75 s cada (6.0 s)'],
  'cao-rota': [20, 28, 'O cão em rota fixa pela pista, ao lado da calçada, com Jonas agachado perto da caçamba (8.0 s)'],
  isca: [28, 34, 'A isca sonora no chão, estalando, e o cão indo até ela (6.0 s)'],
  emenda: [34, 42, 'A ponta do cabo cortado na calçada e Jonas emendando: a emenda aparece no meio da vista (8.0 s)'],
};
const lane = (u, a, b) => mix(a, b, u);
const shots = {
  grade: { day: 0, cam: (u, t) => cidCam(t), actors: { cao: cidDog(0), cao2: cidDog(1) } },
  'cao-quebrado': { day: 0, cam: dolly([-10.5, 0.7, 4.3], [BROKEN.pos[0], 0.4, BROKEN.pos[1]], [-10.9, 0.6, 4.6], [BROKEN.pos[0], 0.42, BROKEN.pos[1]], 40),
    actors: { quebrado: (u) => { const f = flashAt(u * 6); return { pos: BROKEN.pos, yaw: BROKEN.yaw, speed: 0, state: 'desligado', color: f ? f.hex : '#16161a', halo: 1.25 }; } } },
  'cao-rota': { day: 0, cam: dolly([-7.5, 2.4, 0.4], [-13.5, 0.8, 5.5], [-8.5, 2.4, 0.6], [-14.2, 0.8, 5.8], 58),
    actors: { cao: (u) => ({ pos: lane(u, [-6, 3.0], [-17, 3.0]), yaw: P / 2, speed: 1.1, state: 'calma' }), jonas: () => ({ pos: [-14.2, 7.1], yaw: -P / 2, crouch: 1 }) } },
  isca: { day: 0, cam: dolly([-9.5, 1.6, 1.0], [-3, 0.2, 2.8], [-8.0, 1.6, 0.8], [-4, 0.5, 2.8], 56),
    actors: { isca: (u) => ({ pos: [-3, 2.8], yaw: 0, active: u > 0.1 }), cao: (u) => ({ pos: lane(Math.min(1, u * 1.2), [-12, 3.0], [-4.2, 2.9]), yaw: -P / 2, speed: u < 0.85 ? 2.2 : 0, state: 'desconfiada' }) } },
  emenda: { day: 0, cam: dolly([-11.2, 1.0, 9.6], [SPLICE.pos[0], 0.15, 7.7], [-11.6, 0.8, 9.0], [SPLICE.pos[0], 0.15, 7.7], 50),
    actors: { jonas: (u) => ({ pos: [SPLICE.pos[0] + 0.6, 9.0], yaw: P, crouch: 0.8 + 0.2 * u }) } },
};
function buildOwn(r) {
  const cable = S.entities.find((e) => e.id === 'cabo-avenida');
  const sc = buildScene(r, { layout: { ...RUA, entities: [...RUA.entities, cable] } });
  let spliced = null;
  const update = sc.update.bind(sc);
  sc.update = (t, ctx) => {
    const on = t >= views.emenda[0] + (views.emenda[1] - views.emenda[0]) * 0.5 && t < views.emenda[1] + 1;
    if (on !== spliced) { spliced = on; sc.ents.setParam('cabo-avenida', 'emendado', on); }
    update(t, ctx);
  };
  return sc;
}
const stage = makeStage({ buildScene, build: buildOwn, views, shots, actors: { cao: { kind: 'dog', seed: 3 }, cao2: { kind: 'dog', seed: 5 }, quebrado: { kind: 'dog', seed: 9 }, jonas: { role: 'jonas', seed: 1, pack: true }, isca: { kind: 'isca', seed: 3 } } });

export default {
  name: 'noite1', scene: 'noite1',
  build: stage.build,
  views,
  anchors: { cao: 'O cão quebrado junto à caçamba', corte: 'A ponta do cabo cortado, na calçada', poco: 'A grade do poço, na calçada sob o viaduto' },
  camera: stage.camera,
  sfx: [
    { t: 0, name: 'ambiente-rua', opts: { dur: CID_T } },
    { t: 21, name: 'cao-rolar' }, { t: 23, name: 'cao-rolar' }, { t: 25, name: 'cao-rolar' },
    { t: 28.2, name: 'isca-cai' }, ...[29.2, 30.2, 31.2, 32.2, 33.2].map((t) => ({ t, name: 'isca-estalo' })), { t: 30, name: 'cao-desconfiado' },
    { t: 36, name: 'consertar' }, { t: 38.5, name: 'consertar' },
  ],
};
