// The cutscene of the dog arriving at the splice (night 1, scene 4) and the reaction that follows it, for the film mode: the same poses the game plays
// (src/systems/emenda.js), as a function of the time t, with the sequence done right (the kinds of command: hold, dodge, the choice, the lure or the cable, hammer, press).
// Time 0 to 5.6 is the cutscene (the dog turning the corner of the avenue between the parked cars, the close of its sensor going from weak amber to amber,
// Jonas looking over his shoulder); from 5.6 the reaction, with no HUD (the film never has one). A view is [t0, t1, what it shows].
// The game's time and the film's are the same, except in the dodge: there the world runs at SLOW.scale (the game eases into it; the film holds it), and `R(w)` says
// where a moment of the game's clock falls on the film's. The three runs (the quiet way, the loud way, the dodge missed) are filmed one after the other, 30 s apart.
// The blood of the attack is a thing the game builds when the option is on (src/game.js); the film shows the poses of the attack without it.
import { buildScene } from '../scenes/rua.js';
import { makeStage } from './stage.js';
import { cinePose, actionPose, CINE, SLOW, DUMP } from '../systems/emenda.js';
import RUA from '../../data/scenes/rua.json' with { type: 'json' };
import SCENES from '../../data/story/scenes.json' with { type: 'json' };

const T0 = CINE.cheia;                           // where the reaction starts on this cutscene's clock
const A = 4.6, W = 0.6, S = SLOW.scale, L = W / S;                         // the dodge window starts at A (world seconds), lasts W, and takes L seconds of film
/** The film's reaction time of a moment `w` of the game's clock (the dodge window is slow). */
const R = (w) => (w <= A ? w : w <= A + W ? A + (w - A) / S : w + L - W);
/** The game's clock at the film's reaction time `r`. */
const worldOf = (r) => (r <= A ? r : r <= A + L ? A + (r - A) * S : r - L + W);
const slowKAt = (r) => { const e = (u) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); }; return e((r - A) / 0.3) * (1 - e((r - A - L + 0.3) / 0.3)); };

// what a perfect run records: the hold, the dodge to the left at 0.5 s of the leap, the dog slams into the skip, and then one of the two ways
const BASE = { variant: 'cheia', from: -1, film: true, dodge: { side: 'left', at: A + 0.5 } };
// quiet: the lure held at the sensor 1.6 s (the dog is deaf 8 s), the cable pulled, the splice closed, he hides in the skip while the dog goes
const QUIET = { ...BASE, starts: [0, A, 7.3, 8.5, 10.8, 13.3], wins: [4.4, W, 2.0, 1.6, 3.6, 1.2], choice: { id: 'quiet', at: 8.5 }, b1End: 10.1, deafAt: 10.1, freedAt: 12.8, closedAt: 13.7 };
// loud: the cable into the socket on its back (0.4 s after the step starts): sparks, it falls; the piece is spent, so it closes shorter and slower
const LOUD = { ...BASE, starts: [0, A, 7.3, 8.5, 10.4, 14.4], wins: [4.4, W, 2.0, 0.9, 5.0, 1.4], choice: { id: 'loud', at: 8.5 }, jabAt: 8.9, b1End: 8.9, spent: true, freedAt: 13.9, closedAt: 14.9 };
// the dodge missed: the dog gets to him when its leap ends and the attack goes on
const KNOCK = { variant: 'cheia', from: -1, film: true, starts: [0, A], wins: [4.4, W], dodge: null, knockedAt: A + W };
const LOUD_OFF = 30, KNOCK_OFF = 60;
const END_QUIET = 18.9, END_LOUD = 16.7;

const views = {
  cinematica: [0, T0, 'A cinemática inteira do cão chegando enquanto Jonas emenda: o cão vira a esquina entre os carros, o sensor muda de âmbar fraco para âmbar e Jonas olha por cima do ombro'],
  esquina: [0, 3.0, 'O cão da frota atravessa a pista em passo curto, passa entre os carros parados e vira para a calçada onde Jonas trabalha, visto de cima da calçada do outro lado'],
  sensor: [3.0, 4.3, 'Fechado no sensor do cão de frente, baixo, a faixa de luz passando de âmbar fraco para âmbar'],
  olhar: [4.3, T0, 'Jonas ajoelhado na ponta do cabo vira a cabeça e o corpo e olha por cima do ombro, para onde o cão vem'],
  espera: [T0, T0 + 4.4, 'A reação, primeiro passo: Jonas segura a emenda enquanto o cão de patas de borracha anda devagar pela calçada na direção dele'],
  salto: [T0 + A, T0 + R(A + W + 0.2), 'A esquiva em câmera lenta: o cão agacha e salta, o tempo cai, a câmera se aproxima e Jonas se atira para o lado'],
  batida: [T0 + R(A + W + 0.2), T0 + R(8.4), 'O cão passa por Jonas, derrapa e bate na caçamba; fica atordoado, tremendo, o sensor falhando, enquanto Jonas se levanta'],
  desorientar: [T0 + R(8.4), T0 + R(11.2), 'O caminho silencioso: Jonas encosta a isca sonora no sensor do cão atordoado, a rajada de estalos, e o cão ensurdecido gira procurando'],
  'cabo-preso': [T0 + R(10.8), T0 + R(13.0), 'O cabo solto preso na grade do chão e Jonas puxando até soltar, com o cão surdo atrás dele, girando'],
  fecha: [T0 + R(13.3), T0 + R(15.2), 'Jonas fecha a emenda com a mão, a faísca, e corre agachado para a caçamba'],
  esconde: [T0 + R(15.2), T0 + R(END_QUIET), 'Jonas escondido na caçamba; o cão recupera o ouvido, fareja e segue a rota sem achá-lo'],
  acao: [T0, T0 + R(END_QUIET), 'A sequência de reação inteira pelo caminho silencioso, do primeiro passo ao último'],
  desativar: [T0 + LOUD_OFF + R(8.4), T0 + LOUD_OFF + R(11.0), 'O caminho barulhento: Jonas enfia a ponta desencapada do cabo no encaixe das costas do cão; faíscas, o curto, e o cão cai desligado'],
  'desativar-fecha': [T0 + LOUD_OFF + R(14.0), T0 + LOUD_OFF + R(END_LOUD), 'Com o cão desligado ao lado da caçamba, Jonas fecha a emenda com o trecho de cabo que sobrou, mais curto e mais lento'],
  derrubado: [T0 + KNOCK_OFF + R(A + 0.3), T0 + KNOCK_OFF + R(A + W + 2.4 + 0.0), 'O erro na esquiva: o cão alcança Jonas, o ataque, a câmera treme (o jogo faz o sangue e o preto, sem o sangue no vídeo)'],
};
// a view of one run: its offset in the film, its recording, and the game's time at the film's `t`
const runOf = (rec, off) => (t) => { const r = t - T0 - off; return { rec: { ...rec, slowK: slowKAt(r) }, w: worldOf(r) }; };
const shotOf = (rec, off) => {
  const run = runOf(rec, off), pose = (t) => (t < T0 ? cinePose('cheia', t) : actionPose('cheia', run(t).rec, Math.max(0, run(t).w)));
  return { day: 0, cam: (u, t) => pose(t).cam, actors: { cao: (u, t) => { const d = pose(t).dog; return { ...d, color: d.sensor }; }, jonas: (u, t) => { const j = pose(t).jonas; return j.hidden ? { ...j, pos: [-30, -30] } : j; } } };
};
const shots = {};
for (const k of ['cinematica', 'esquina', 'sensor', 'olhar', 'espera', 'salto', 'batida', 'desorientar', 'cabo-preso', 'fecha', 'esconde', 'acao']) shots[k] = shotOf(QUIET, 0);
for (const k of ['desativar', 'desativar-fecha']) shots[k] = shotOf(LOUD, LOUD_OFF);
shots.derrubado = shotOf(KNOCK, KNOCK_OFF);

function buildOwn(r) {
  const cable = SCENES['n1-saida'].entities.find((e) => e.id === 'cabo-avenida');
  const sc = buildScene(r, { layout: { ...RUA, entities: [...RUA.entities, cable] } });
  const update = sc.update.bind(sc); let spliced = null;
  const spans = [[T0 + R(QUIET.closedAt), T0 + R(END_QUIET) + 0.01], [T0 + LOUD_OFF + R(LOUD.closedAt), T0 + LOUD_OFF + R(END_LOUD) + 0.01]];
  sc.update = (t, ctx) => { const on = spans.some(([a, b]) => t >= a && t < b); if (on !== spliced) { spliced = on; sc.ents.setParam('cabo-avenida', 'emendado', on); } update(t, ctx); };
  return sc;
}
const stage = makeStage({ buildScene, build: buildOwn, views, shots, actors: { cao: { kind: 'dog', seed: 3 }, jonas: { role: 'jonas', seed: 1, pack: true } } });

export default {
  name: 'emenda', scene: 'emenda',
  build: stage.build,
  views,
  anchors: { corte: 'A ponta do cabo cortado, na calçada, onde Jonas emenda', grade: 'A grade do chão onde o cabo fica preso depois do salto', canto: 'O canto entre os carros parados por onde o cão sai da pista', cacamba: 'A caçamba onde o cão bate e onde Jonas se esconde' },
  camera: stage.camera,
  actor: stage.actor,
  sfx: [
    ...[0.3, 0.75, 1.2, 1.65, 2.1, 2.55].map((t) => ({ t, name: 'cao-rolar', at: 'cao' })),
    { t: 3.0, name: 'corte' }, { t: 3.4, name: 'cao-desconfiado', at: 'cao' }, { t: 4.3, name: 'corte' },
    // the quiet way
    { t: T0 + A, name: 'cao-salta', at: 'cao' }, { t: T0 + A, name: 'camera-lenta' }, { t: T0 + R(A + 0.5), name: 'reacao-acerto' }, { t: T0 + R(A + W + DUMP.slide), name: 'cao-bate', at: 'cao' },
    { t: T0 + R(8.5), name: 'isca-perto', at: 'cao' }, { t: T0 + R(10.1), name: 'cao-surdo', at: 'cao' }, { t: T0 + R(11.6), name: 'cabo-puxa', at: 'jonas' }, { t: T0 + R(12.2), name: 'cabo-puxa', at: 'jonas' }, { t: T0 + R(12.8), name: 'cabo-solta', at: 'jonas' },
    { t: T0 + R(13.7), name: 'consertar', at: 'jonas' },
    // the loud way
    { t: T0 + LOUD_OFF + A, name: 'cao-salta', at: 'cao' }, { t: T0 + LOUD_OFF + A, name: 'camera-lenta' }, { t: T0 + LOUD_OFF + R(A + W + DUMP.slide), name: 'cao-bate', at: 'cao' },
    { t: T0 + LOUD_OFF + R(8.9), name: 'curto', at: 'cao' }, { t: T0 + LOUD_OFF + R(11.5), name: 'cabo-puxa', at: 'jonas' }, { t: T0 + LOUD_OFF + R(12.6), name: 'cabo-puxa', at: 'jonas' }, { t: T0 + LOUD_OFF + R(13.9), name: 'cabo-solta', at: 'jonas' }, { t: T0 + LOUD_OFF + R(14.9), name: 'consertar', at: 'jonas' },
    // the dodge missed
    { t: T0 + KNOCK_OFF + A, name: 'cao-salta', at: 'cao' }, { t: T0 + KNOCK_OFF + A, name: 'camera-lenta' }, { t: T0 + KNOCK_OFF + R(A + W), name: 'cao-ataque', at: 'cao' },
  ],
};
