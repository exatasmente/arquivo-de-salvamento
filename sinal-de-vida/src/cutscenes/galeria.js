// The cutscenes of the scene "galeria" as the film mode shows them: the views of the base for parts 2, 3, 4 and 6 of the
// video (the place, the pump and Dona Neide, the radio, the workshop bench, the refectory, the beds, the storage, the
// shaft with the rope and the cable). A view is [t0, t1, what it shows].
import { buildScene } from '../scenes/galeria.js';
import { makeStage, mix, ease } from './stage.js';

const P = Math.PI;
const go = (a, b) => (u) => mix(a, b, ease(u));
/** A camera that moves its eye and its target from one pair to another over the view. */
const dolly = (e0, a0, e1, a1, fov) => (u) => ({ eye: go(e0, e1)(u), at: go(a0, a1)(u), fov });
const still = (people, id, pos, yaw, extra = {}) => ({ [id]: () => ({ pos, yaw, ...extra }) });

const views = {
    panorama: [0, 8, 'A galeria inteira, a câmera andando pelo corredor da boca de inspeção até a sala de máquinas'],
    boca: [14, 20, 'A boca de inspeção por dentro: a luz que desce, a corda e o cabo grosso, a câmera olhando de baixo para o buraco e descendo pela corda'],
    radio: [20, 26, 'O rádio quebrado na prateleira do fim do corredor, com Jonas mexendo nele'],
    neide: [26, 32, 'Dona Neide ao lado da bomba parada, de frente para a câmera, na sala de máquinas'],
    bomba: [32, 37, 'A bomba d\'água, o motor e o tubo, e a goteira que cai na poça'],
    oficina: [37, 43, 'A bancada da oficina, com Jonas de costas trabalhando, a câmera chegando devagar'],
    bancada: [43, 48, 'A bancada da oficina em plano fechado, de lado, para o que ficar preso nela depois'],
    refeitorio: [48, 54, 'O refeitório de noite, três pessoas em volta da mesa e uma a mais chegando, a câmera à altura dos olhos'],
    dormitorio: [54, 60, 'Os colchões no alto do degrau, vistos do corredor'],
    deposito: [60, 65, 'O depósito: caixotes em pilha e a prateleira de caixas'],
    armazem: [65, 70, 'O armazém: a caixa d\'água e as prateleiras de latas'],
    'noite-fria': [70, 76, 'O grupo em volta do rádio, de noite, no fim do corredor (a fumaça do respirar vem do jogo)'],
};
const shots = {
    panorama: { day: 0, cam: dolly([12, 1.7, 0.6], [4, 1.5, -0.4], [-6, 1.7, 0.4], [-14, 1.4, -1]) },
    boca: { day: 0.25, cam: dolly([6.4, 1.3, 1.6], [9.1, 3.5, 0.1], [6.8, 1.5, 1.4], [9.2, 0.7, 0.2]) },
    radio: { day: 0, cam: dolly([11.4, 1.5, 2.3], [13.3, 1.3, 0.2], [12.5, 1.5, 1.9], [13.4, 1.3, 0.2]), actors: still(0, 'jonas', [12.7, 0.2], -P / 2 + 0.25) },
    neide: { day: 0, cam: dolly([-9.4, 1.55, -0.4], [-12.2, 1.35, -3.2], [-9.9, 1.5, -0.8], [-12.2, 1.35, -3.2]), actors: still(0, 'neide', [-12.2, -3.2], P - 0.15) },
    bomba: { day: 0, cam: dolly([-10.6, 1.3, -1.9], [-12.5, 0.7, -4.2], [-11.2, 1.1, -2.6], [-12.4, 0.8, -4.2]) },
    oficina: { day: 0, cam: dolly([-5.2, 1.5, -0.6], [-5, 1.1, -4.6], [-5.1, 1.4, -1.9], [-5, 1.1, -4.6], 55), actors: still(0, 'jonas', [-5.5, -3.6], 0) },
    bancada: { day: 0, cam: dolly([-2.4, 1.3, -3.2], [-4.6, 1.0, -4.5], [-3.0, 1.2, -3.0], [-4.8, 1.0, -4.5], 50) },
    refeitorio: { day: 0, cam: dolly([-0.6, 1.5, 0.3], [1.5, 1.1, 2.6], [0.0, 1.5, 0.9], [1.8, 1.1, 2.6], 60), actors: { jonas: () => ({ pos: [0.2, 2.0], yaw: P }), neide: () => ({ pos: [1.3, 3.3], yaw: 0 }), tania: () => ({ pos: [2.9, 2.0], yaw: P - 0.4 }), entregador: (u) => ({ pos: [4.6 - u * 1.6, 0.9], yaw: P / 2 + 0.3, walk: 1 }) } },
    dormitorio: { day: 0, cam: dolly([4.6, 1.5, 0.4], [8.0, 0.8, -3.3], [11.6, 1.5, 0.2], [10.4, 0.8, -3.3]) },
    deposito: { day: 0, cam: dolly([5.2, 1.5, 1.7], [6.4, 0.8, 4.1], [6.4, 1.5, 1.8], [6.4, 0.9, 4.1]) },
    armazem: { day: 0, cam: dolly([9.6, 1.5, 1.8], [12, 0.9, 3.4], [10.6, 1.5, 1.8], [12, 0.9, 3.4]) },
    'noite-fria': { day: 0, cam: dolly([9.6, 1.4, 0.9], [13.2, 1.2, 0.3], [10.6, 1.4, 0.7], [13.2, 1.2, 0.3], 55), actors: { jonas: () => ({ pos: [12.3, -0.3], yaw: -P / 2 }), tania: () => ({ pos: [12.3, 1.0], yaw: -P / 2 - 0.3 }), neide: () => ({ pos: [11.4, 0.4], yaw: -P / 2 }) } },
};
const stage = makeStage({ buildScene, views, shots, actors: { jonas: { role: 'jonas', seed: 1 }, neide: { role: 'neide', seed: 1 }, tania: { role: 'tania', seed: 1 }, entregador: { role: 'pessoa', seed: 11 } } });

export default {
  name: 'galeria', scene: 'galeria',
  build: stage.build,
  views,
  anchors: {
    centro: 'O centro do cenário, no chão',
    boca: 'A boca de inspeção: a corda e o cabo, no chão do corredor',
    radio: 'O rádio quebrado na prateleira',
    bancada: 'A bancada da oficina',
    bomba: 'A bomba d\'água',
  },
  camera: stage.camera,
  actor: stage.actor,
  sfx: [
    { t: 0, name: 'ambiente', opts: { dur: 76 } },
    ...[0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4].map((t) => ({ t, name: 'passo' })),
    ...[48.5, 49.1, 49.7, 50.3].map((t) => ({ t, name: 'passo' })),
  ],
};
