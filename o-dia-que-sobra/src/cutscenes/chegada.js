// Cutscene 1, "chegada": on foot along the shoulder of the highway, at night; the tall sign of the sun lights
// up in the distance, one ray of its lamp failing; under the canopy, the poster of the posto; the glass door.
// First person, 39 s. The thought of the protagonist is the S1 phrase, written exactly as the design says.
import { track, bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { buildCar } from '../models/car.js';

const D = 40;
// The time of the cutscene is warped from the stretch the walk was written in (old time) to the one the thoughts need.
const WARP = [[0, 0], [9, 11], [18, 19], [27, 26], [34, 35], [39, 40]];
const M = (o) => { for (let i = 0; i + 1 < WARP.length; i++) { const [a, A] = WARP[i], [b, B] = WARP[i + 1]; if (o <= b) return A + (o - a) * (B - A) / (b - a); } return WARP[WARP.length - 1][1]; };
const U = (t) => { for (let i = 0; i + 1 < WARP.length; i++) { const [a, A] = WARP[i], [b, B] = WARP[i + 1]; if (t <= B) return a + (t - A) * (b - a) / (B - A); } return WARP[WARP.length - 1][0]; };
// views: name -> [from, to, description]
const views = {
  acostamento: [0, 11, 'A pé pelo acostamento da rodovia, de noite: o asfalto escuro, a faixa amarela, um carro passa e, ao longe, o posto apagado; três pensamentos curtos'],
  placa: [11, 19, 'A placa alta do sol acende ao longe, a lâmpada de um raio falhando'],
  entrada: [19, 26, 'Sob a cobertura das bombas, andando devagar entre as bombas e as colunas'],
  cartaz: [26, 35, 'A fachada do posto: o cartaz "Um novo dia sempre começa com um sorriso!"; dois pensamentos, o último com a frase das quatro semanas'],
  porta: [35, 40, 'A porta de vidro da loja: a mão empurra, o sino toca, a luz da loja e o escuro'],
};

const EYE = 1.68;
const KEYS = [
  // the shoulder: gravel under the feet, the highway to the left, the dark posto ahead on the right
  { t: 0.0, eye: [-44, EYE, -24.4], look: [-30, 1.5, -23.2] },
  { t: 4.5, eye: [-38.5, EYE, -24.3], look: [-24, 1.4, -22.4] },
  { t: 8.97, eye: [-33.2, EYE, -24.2], look: [-18, 1.2, -21.4] },
  // the sign: the walk slows and stops, the head comes up
  { t: 9.0, eye: [-30.0, EYE, -24.2], look: [-14.5, 5.8, -20.4] },
  { t: 12.5, eye: [-26.8, EYE, -24.1], look: [-14.2, 7.6, -20.3], ease: 'ss' },
  { t: 15.5, eye: [-24.2, EYE, -24.0], look: [-14.0, 8.4, -20.3] },
  { t: 17.97, eye: [-22.8, EYE, -23.9], look: [-14.0, 8.6, -20.3] },
  // under the canopy, walking east along the car lane: cam2 by the first column, cam3 at the far end
  { t: 18.0, eye: [-2.2, EYE, -2.7], look: [2.6, 2.7, -5.8] },
  { t: 20.4, eye: [1.2, EYE, -2.6], look: [5.5, 2.3, -6.4] },
  { t: 23.0, eye: [7.0, EYE, -2.3], look: [18, 2.8, -6.5] },
  { t: 26.97, eye: [14.8, EYE, -2.1], look: [24.4, 3.3, -6.5] },
  // the facade: the poster beside the door
  { t: 27.0, eye: [8.2, EYE, 0.5], look: [3.6, 1.7, 2.9] },
  { t: 30.0, eye: [5.0, EYE, 1.0], look: [3.1, 1.7, 2.9], ease: 'ss' },
  { t: 33.97, eye: [3.4, EYE, 1.4], look: [3.1, 1.72, 2.9] },
  // the door
  { t: 34.0, eye: [9.0, EYE, -0.4], look: [9.0, 1.4, 3.0] },
  { t: 35.5, eye: [9.0, EYE, 1.0], look: [9.0, 1.35, 3.0], ease: 'ss' },
  { t: 39.0, eye: [9.0, EYE, 2.2], look: [9.0, 1.3, 6.0] },
];
const cam = track(KEYS);
const walking = (t) => (t < 8.2 ? 1 : 0) + (t >= 9 && t < 17.9 ? 0.4 : 0) + (t >= 18 && t < 26.8 ? 1 : 0) + (t >= 27 && t < 30 ? 1 : 0) + (t >= 34 && t < 35.6 ? 1 : 0);

// the sign: dead, a sputter of the lamp (never more than three changes a second), then lit with one ray failing
const SPUTTER = [[10.4, 10.8], [11.25, 11.6], [11.95, 12.3]]; // lit from a to b, off between
const signOn = (t, calm) => (calm ? t >= 11.0 : t >= 12.3 || SPUTTER.some(([a, b]) => t >= a && t < b));
const ray = (t) => (t < 12.3 ? -1 : (Math.floor(t * 1.4) % 3 === 0 ? 4 : -1)); // one ray goes out now and then

const TH = BABBLE_SEEDS.heitor;
const say = dialogue([
  { t: 1.0, who: '', text: 'Cada passo é um passo para dentro disso.', seed: TH, hold: 0.8 },
  { t: 4.4, who: '', text: 'Quarenta e um anos e a primeira noite.', seed: TH, hold: 0.8 },
  { t: 7.6, who: '', text: 'Durmo de dia. A folga também vai ser de noite.', seed: TH, hold: 0.8 },
  { t: 26.4, who: '', text: 'Não peço muito. Um dia de folga, um lago, a vara do meu pai.', seed: TH, hold: 0.6 },
  { t: 31.0, who: '', text: 'Quatro semanas. Depois disso é Só descansar.', seed: TH, hold: 2.0 },
]);

export default {
  name: 'chegada', duration: D, views,
  anchors: { placa: 'A placa alta do sol, de longe', cobertura: 'A cobertura das bombas', cartaz: 'O cartaz da fachada', porta: 'A porta de vidro da loja' },
  sfx: [
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.8 } },
    { t: 0, name: 'insetos', opts: { dur: D, gain: 0.7 } },
    { t: 0, name: 'vento', opts: { dur: 19, gain: 0.8 } },
    { t: 1.0, name: 'respiracao', opts: { dur: 6, gain: 0.4 } },
    ...footfalls(0.4, M(8.4), 1.9, { gain: 0.5 }, 'passo_asfalto'),
    { t: M(3.2), name: 'motor_carro', opts: { dur: 4.4, gain: 0.8 } },
    { t: M(10.4), name: 'lampada_estalo' }, { t: M(11.25), name: 'lampada_estalo', opts: { gain: 0.8 } }, { t: M(11.95), name: 'lampada_estalo', opts: { gain: 0.7 } },
    { t: M(12.3), name: 'fluorescente', opts: { dur: 7, gain: 0.6 } },
    ...footfalls(M(18.2), M(26.6), 1.9, { gain: 0.5 }, 'passo_asfalto'),
    ...footfalls(M(27.2), M(29.8), 1.9, { gain: 0.5 }, 'passo_asfalto'),
    ...footfalls(M(34.2), M(35.5), 1.9, { gain: 0.5 }, 'passo_asfalto'),
    { t: M(35.55), name: 'porta_abre' }, { t: M(36.0), name: 'porta_sino' },
    { t: M(36.0), name: 'fluorescente', opts: { dur: 3, gain: 0.7 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx;
    const hands = ctx.hands();
    const W = ctx.world();
    const T = r.THREE;
    // a car on the highway, headlights on, passing eastbound at 3.2 s
    const car = buildCar(r, { seed: 9, fuel: 'comum', capSide: 'left' }); car.setDriver(true); car.setLights(true);
    const g = new T.Group(); g.add(car.root);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { placa: () => W.p('placaSol'), cobertura: () => W.p('carroBomba2', 3.9), cartaz: () => [3.1, 1.7, 2.9], porta: () => W.p('porta-loja', 1.2) },
      pose(tNew, ambient) {
        const t = U(tNew);
        const { rig } = hands;
        const c = cam(t), w = walking(t), b = bob(t, Math.min(1, w) * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]];
        const x = -70 + (t - 3.2) * 26; car.root.position.set(x, 0, -28.5); car.root.rotation.y = Math.PI / 2; car.root.visible = t > 2.6 && t < 7;
        const sway = Math.sin(t * 1.4);
        const push = smooth(ramp(t, 35.0, 35.7)) * (1 - smooth(ramp(t, 36.4, 37.2)));
        rig.hang(sway * (w ? 2 : 1));
        if (push > 0) rig.reach('right', [lerp(0.2, 0.08, push), lerp(-0.4, -0.02, push), lerp(-0.34, -0.7, push)]);
        const open = smooth(ramp(t, 35.55, 36.5));
        const sm = ctx.reduceFlash ? 1 : 0;
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.6)), smooth(ramp(t, 37.6, 38.9)));
        return {
          eye, look: c.look, roll: c.roll + b[2], fade, dialog: say.at(tNew),
          world: { ambient: 0x585d78, state: { doors: { 'porta-loja': open }, sino: ambient - (tNew - M(36.0)), hora: 0.1 }, fog: [14, 66], sign: { on: signOn(t, sm), smile: 0, ray: ray(t) } },
        };
      },
    };
  },
};
