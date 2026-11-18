// The cutscene "A galeria" (the second of the design) for the film mode, as the game plays it: the base with its water dripping,
// the mattresses on the step, the thick cable that goes up the shaft to the panels, Jonas at the radio (hiss), and Dona Neide by the
// pump that has stopped ("Sem água limpa, ninguém dura uma semana"). The game's own camera of the cutscene is in game.js; these are the
// same places, each a view the video can use alone. A view is [t0, t1, what it shows]; everything is a function of the time.
import { buildScene } from '../scenes/galeria.js';
import { makeStage, mix, ease } from './stage.js';

const P = Math.PI;
const go = (a, b) => (u) => mix(a, b, ease(u));
const dolly = (e0, a0, e1, a1, fov) => (u) => ({ eye: go(e0, e1)(u), at: go(a0, a1)(u), fov });

const views = {
  abertura: [0, 8, 'A base de ponta a ponta: a câmera anda pelo corredor, a água pinga, os colchões no alto do degrau, o cabo grosso sobe pela boca de inspeção'],
  colchoes: [8, 13, 'Os colchões no alto do degrau, vistos do corredor, com a goteira ao lado'],
  cabo: [13, 18, 'O cabo grosso que sobe pela boca de inspeção até os painéis, visto de baixo, com a luz que desce'],
  radio: [18, 24, 'Jonas mexe no rádio quebrado na prateleira do fim do corredor; só chiado'],
  aviso: [24, 32, 'Dona Neide ao lado da bomba parada diz que a água parou; Jonas chega pelo corredor'],
  bomba: [32, 37, 'A bomba parada de perto, a luz de falha, o filtro escuro e a goteira que cai na poça'],
};
const shots = {
  abertura: { day: 0, cam: dolly([12, 1.7, 0.6], [4, 1.5, -0.4], [-6, 1.7, 0.4], [-14, 1.4, -1]), actors: { tania: () => ({ pos: [5.8, -2.9], yaw: P }) } },
  colchoes: { day: 0, cam: dolly([4.6, 1.5, 0.4], [8.0, 0.8, -3.3], [11.6, 1.5, 0.2], [10.4, 0.8, -3.3]), actors: { tania: () => ({ pos: [5.8, -2.9], yaw: P, crouch: 0.2 }) } },
  cabo: { day: 0.3, cam: dolly([6.4, 1.3, 1.6], [9.1, 3.5, 0.1], [6.8, 1.5, 1.4], [9.2, 0.7, 0.2]) },
  radio: { day: 0, cam: dolly([11.4, 1.5, 2.3], [13.3, 1.3, 0.2], [12.5, 1.5, 1.9], [13.4, 1.3, 0.2]), actors: { jonas: () => ({ pos: [12.7, 0.2], yaw: -P / 2 + 0.25 }) } },
  aviso: { day: 0, cam: dolly([-9.4, 1.55, -0.4], [-12.2, 1.35, -3.2], [-9.9, 1.5, -0.8], [-12.2, 1.35, -3.2]), actors: { neide: () => ({ pos: [-12.2, -3.2], yaw: P - 0.15 }), jonas: (u) => ({ pos: [-3.5 - u * 4.5, -1.4], yaw: P / 2 + 0.2, walk: 1 }) } },
  bomba: { day: 0, cam: dolly([-10.6, 1.3, -1.9], [-12.5, 0.7, -4.2], [-11.2, 1.1, -2.6], [-12.4, 0.8, -4.2]) },
};
const stage = makeStage({ buildScene, views, shots, actors: { jonas: { role: 'jonas', seed: 1 }, neide: { role: 'neide', seed: 1 }, tania: { role: 'tania', seed: 1 } } });

export default {
  name: 'a-galeria', scene: 'a-galeria',
  build: stage.build,
  views,
  anchors: { centro: 'O centro do cenário, no chão', boca: 'A boca de inspeção: a corda e o cabo', radio: 'O rádio quebrado na prateleira', bomba: 'A bomba d\'água parada' },
  camera: stage.camera,
  sfx: [
    { t: 0, name: 'ambiente', opts: { dur: 37 } },
    ...[0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4].map((t) => ({ t, name: 'passo' })),
    ...[24.6, 25.2, 25.8, 26.4, 27, 27.6, 28.2, 28.8].map((t) => ({ t, name: 'passo' })),
    { t: 18.6, name: 'bip' }, { t: 21.2, name: 'bip' },
    { t: 33, name: 'bomba' },
  ],
};
