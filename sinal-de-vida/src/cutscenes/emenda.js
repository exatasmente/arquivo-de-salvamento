// The cutscene of the dog arriving at the splice (night 1, scene 4) and the reaction that follows it, for the film mode: the same poses the game plays
// (src/systems/emenda.js), as a function of the time t, with the sequence done right (the four kinds of command: hold, dodge, hammer, press).
// Time 0 to 5.6 is the cutscene (the dog turning the corner of the avenue between the parked cars, the close of its sensor going from weak amber to amber,
// Jonas looking over his shoulder); from 5.6 the reaction, with no HUD (the film never has one). A view is [t0, t1, what it shows].
import { buildScene } from '../scenes/rua.js';
import { makeStage } from './stage.js';
import { cinePose, actionPose, CINE, J } from '../systems/emenda.js';
import RUA from '../../data/scenes/rua.json' with { type: 'json' };
import SCENES from '../../data/story/scenes.json' with { type: 'json' };

const T0 = CINE.cheia;                           // where the reaction starts on this cutscene's clock
// what a perfect run of the sequence records: the hold, a dodge to the left at 0.5 s of the leap, the cable pulled out in 2.2 s, the press at 0.5 s
const REC = { variant: 'cheia', from: -1, starts: [0, 4.6, 7.9, 10.6], wins: [4.4, 1.3, 3.6, 1.2], hits: [true, true, true, true], dodge: { side: 'left', at: 5.1 }, knockedAt: null, freedAt: 10.1, closedAt: 11.1, film: true };
const KNOCK = { ...REC, hits: [true, false], dodge: null, knockedAt: 5.9, freedAt: null, closedAt: null, starts: [0, 4.6], wins: [4.4, 1.3] };
const views = {
  cinematica: [0, T0, 'A cinemática inteira do cão chegando enquanto Jonas emenda: o cão vira a esquina entre os carros, o sensor muda de âmbar fraco para âmbar e Jonas olha por cima do ombro'],
  esquina: [0, 3.0, 'O cão da frota atravessa a pista em passo curto, passa entre os carros parados e vira para a calçada onde Jonas trabalha, visto de cima da calçada do outro lado'],
  sensor: [3.0, 4.3, 'Fechado no sensor do cão de frente, baixo, a faixa de luz passando de âmbar fraco para âmbar'],
  olhar: [4.3, T0, 'Jonas ajoelhado na ponta do cabo vira a cabeça e o corpo e olha por cima do ombro, para onde o cão vem'],
  espera: [T0, T0 + 4.4, 'A reação, primeiro passo: Jonas segura a emenda enquanto o cão de patas de borracha anda devagar pela calçada na direção dele'],
  salto: [T0 + 4.6, T0 + 6.4, 'O cão agacha e salta sobre Jonas, que se atira para o lado e cai'],
  'cabo-preso': [T0 + 7.7, T0 + 10.7, 'O cabo solto preso na grade do chão e Jonas puxando até soltar, com o cão perdido atrás dele'],
  fecha: [T0 + 10.6, T0 + 12.5, 'Jonas fecha a emenda com a mão, a faísca, e o cão vai embora pela calçada'],
  acao: [T0, T0 + 12.5, 'A sequência de reação inteira, acertada, do primeiro passo ao último'],
  derrubado: [T0 + 15, T0 + 17.5, 'O erro na esquiva: o cão alcança Jonas e o derruba, a câmera treme'],
};
const at = (t) => Math.max(0, t - T0);
// the camera and the actors of every time come from the game's own functions
const shotAt = (rec) => ({ day: 0, cam: (u, t) => (t < T0 ? cinePose('cheia', t).cam : actionPose('cheia', rec, at(t)).cam),
  actors: { cao: (u, t) => { const d = t < T0 ? cinePose('cheia', t).dog : actionPose('cheia', rec, at(t)).dog; return { ...d, color: d.sensor }; }, jonas: (u, t) => (t < T0 ? cinePose('cheia', t).jonas : actionPose('cheia', rec, at(t)).jonas) } });
const shots = { cinematica: shotAt(REC), esquina: shotAt(REC), sensor: shotAt(REC), olhar: shotAt(REC), espera: shotAt(REC), salto: shotAt(REC), 'cabo-preso': shotAt(REC), fecha: shotAt(REC), acao: shotAt(REC), derrubado: shotAt(KNOCK) };
// derrubado is filmed on its own clock: 15 s after the start of the reaction, the knocked-down run is played from the start of its own time
shots.derrubado = { day: 0, cam: (u, t) => actionPose('cheia', KNOCK, 5.0 + (t - T0 - 15)).cam, actors: { cao: (u, t) => { const d = actionPose('cheia', KNOCK, 5.0 + (t - T0 - 15)).dog; return { ...d, color: d.sensor }; }, jonas: (u, t) => actionPose('cheia', KNOCK, 5.0 + (t - T0 - 15)).jonas } };

function buildOwn(r) {
  const cable = SCENES['n1-saida'].entities.find((e) => e.id === 'cabo-avenida');
  const sc = buildScene(r, { layout: { ...RUA, entities: [...RUA.entities, cable] } });
  const update = sc.update.bind(sc); let spliced = null;
  sc.update = (t, ctx) => { const on = t >= T0 + REC.closedAt && t < T0 + 15; if (on !== spliced) { spliced = on; sc.ents.setParam('cabo-avenida', 'emendado', on); } update(t, ctx); };
  return sc;
}
const stage = makeStage({ buildScene, build: buildOwn, views, shots, actors: { cao: { kind: 'dog', seed: 3 }, jonas: { role: 'jonas', seed: 1, pack: true } } });

export default {
  name: 'emenda', scene: 'emenda',
  build: stage.build,
  views,
  anchors: { corte: 'A ponta do cabo cortado, na calçada, onde Jonas emenda', grade: 'A grade do chão onde o cabo fica preso depois do salto', canto: 'O canto entre os carros parados por onde o cão sai da pista' },
  camera: stage.camera,
  sfx: [
    { t: 0.3, name: 'cao-rolar' }, { t: 0.75, name: 'cao-rolar' }, { t: 1.2, name: 'cao-rolar' }, { t: 1.65, name: 'cao-rolar' }, { t: 2.1, name: 'cao-rolar' }, { t: 2.55, name: 'cao-rolar' },
    { t: 3.0, name: 'corte' }, { t: 3.4, name: 'cao-desconfiado' }, { t: 4.3, name: 'corte' },
    { t: T0 + 4.6, name: 'cao-salta' }, { t: T0 + 5.1, name: 'reacao-acerto' }, { t: T0 + 8.2, name: 'cabo-puxa' }, { t: T0 + 8.8, name: 'cabo-puxa' }, { t: T0 + 9.4, name: 'cabo-puxa' }, { t: T0 + 10.1, name: 'cabo-solta' },
    { t: T0 + 11.1, name: 'consertar' },
    { t: T0 + 15.9, name: 'cao-derruba' },
  ],
};
