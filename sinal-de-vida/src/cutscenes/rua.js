// The cutscenes of the scene "rua" as the film mode shows them: the places of the avenue the video films in parts 1 and
// 3 (the avenue that still works, the drain, the boarding point, the delivery point, the marquise, the viaduct, the
// manhole, the panels and the cable, the water tower). A view is [t0, t1, what it shows].
import { buildScene } from '../scenes/rua.js';
import { makeStage, mix, ease } from './stage.js';

const P = Math.PI;
const go = (a, b) => (u) => mix(a, b, ease(u));
const dolly = (e0, a0, e1, a1, fov) => (u) => ({ eye: go(e0, e1)(u), at: go(a0, a1)(u), fov });

const views = {
    panorama: [0, 8, 'A avenida de madrugada, vazia e iluminada, a câmera na altura dos olhos andando para o viaduto'],
    bueiro: [8, 14, 'A avenida por uma fresta de bueiro: a câmera rente ao chão, atrás da grade, olhando a rua vazia'],
    embarque: [14, 20, 'O ponto de embarque, com o carro sem motorista parado de porta aberta e ninguém por perto'],
    entrega: [20, 26, 'O ponto de entrega pintado na calçada, com a caixa e o poste do pictograma, sem ninguém'],
    marquise: [26, 32, 'A marquise sobre a calçada, vista de longe, de onde um drone de farol passa à noite'],
    viaduto: [32, 38, 'O viaduto visto de baixo, os pilares com a base listrada e a luz sob o tabuleiro'],
    boca: [38, 44, 'A grade do poço de ventilação na calçada sob o viaduto: rente ao chão, com a folha de acesso fechada e o cabo grosso entrando por duas barras serradas'],
    paineis: [44, 50, 'Os painéis solares inclinados na calçada, com o cabo saindo deles'],
    cabo: [50, 56, 'O cabo grosso no chão da calçada, do painel até a boca de inspeção, seguido de perto'],
    'caixa-dagua': [56, 62, 'A caixa d\'água alta atrás dos prédios, olhando de baixo para cima (a antena sobe nela depois)'],
    cacamba: [62, 67, 'A caçamba no meio-fio, onde dá para se esconder, e a avenida atrás'],
    anoitecer: [67, 73, 'A avenida ao anoitecer, a câmera sob o viaduto olhando para a marquise lá no fim, com as luzes de rua acendendo'],
    corrida: [79, 85, 'Jonas correndo pela calçada sob o viaduto, visto de trás e de cima do ombro'],
};
const shots = {
    panorama: { day: 0, cam: dolly([-46, 1.7, 3.4], [-20, 2.6, -1], [-30, 1.7, 3.4], [0, 3.5, -1]) },
    bueiro: { day: 0, cam: dolly([-3.4, 0.16, 7.0], [-3.4, 0.5, -3], [-3.4, 0.22, 6.9], [-3.0, 1.2, -4]) },
    embarque: { day: 0, cam: dolly([-14.5, 1.5, -2.8], [-9.6, 1.0, -7.0], [-13.5, 1.5, -2.2], [-9.2, 1.0, -6.6]) },
    entrega: { day: 0, cam: dolly([9.5, 1.6, -3.2], [14, 0.5, -8.7], [10.5, 1.6, -3.8], [14, 0.5, -8.7]) },
    marquise: { day: 0, cam: dolly([8, 1.8, 3.6], [30, 3.2, 9.2], [16, 1.7, 3.6], [32, 3.2, 9.2]) },
    viaduto: { day: 0, cam: dolly([-13, 1.7, 5.4], [0, 5.5, 3], [-9, 1.7, 5.4], [2, 5.0, 4]) },
    boca: { day: 0.1, cam: dolly([2.6, 1.3, 5.9], [-1.2, 0.2, 9.5], [0.6, 1.1, 6.9], [-1.2, 0.1, 9.5], 60) },
    paineis: { day: 0.1, cam: dolly([7, 1.8, 7.6], [16, 0.8, 9.3], [11, 1.5, 7.2], [16.5, 0.8, 9.3]) },
    cabo: { day: 0.1, cam: dolly([14.5, 0.9, 8.0], [8, 0.2, 9.5], [3.0, 0.8, 8.2], [-1.2, 0.2, 9.5], 62) },
    'caixa-dagua': { day: 0.15, cam: dolly([4, 1.8, -9.5], [11, 9, -19], [6, 1.8, -9.5], [11, 12, -19], 58) },
    cacamba: { day: 0, cam: dolly([-19, 1.4, 1.8], [-14, 0.8, 5.3], [-18, 1.4, 2.2], [-14, 0.8, 5.3]) },
    anoitecer: { day: (u) => 0.35 * (1 - ease(u)), cam: dolly([4.5, 1.7, 7.8], [34, 3.5, 9.2], [5.5, 1.7, 7.8], [36, 3.5, 9.2], 55) },
    corrida: { day: 0, cam: (u) => ({ eye: [-14 + u * 12, 1.9, 9.2], at: [-9 + u * 12, 1.2, 8.6], fov: 66 }), actors: { jonas: (u) => ({ pos: [-9 + u * 12 + 3, 8.6], yaw: -P / 2, run: 1, walk: 1 }) } },
};
const stage = makeStage({ buildScene, views, shots, actors: { jonas: { role: 'jonas', seed: 1, pack: true }, tania: { role: 'tania', seed: 1, pack: true } } });

export default {
  name: 'rua', scene: 'rua',
  build: stage.build,
  views,
  anchors: {
    centro: 'O meio da avenida, sob o viaduto',
    boca: 'A boca de inspeção da calçada',
    embarque: 'O ponto de embarque',
    entrega: 'O ponto de entrega',
    marquise: 'A marquise sobre a calçada',
    paineis: 'Os painéis solares',
    caixa: 'A caixa d\'água alta',
  },
  camera: stage.camera,
  sfx: [{ t: 0, name: 'ambiente', opts: { dur: 85 } }, ...[79.5, 80, 80.5, 81, 81.5, 82, 82.5, 83, 83.5, 84].map((t) => ({ t, name: 'passo' }))],
};
