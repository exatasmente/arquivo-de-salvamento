// Scripted shift "bomba4" (part 5 of the video): pump 4 starts by itself, the display runs and stops at
// " 34,70" (the first digit dark, never a zero) and stays; somebody in an old attendant's uniform stands
// behind the car, his back turned; then nobody; then, for a second, the canopy over the pump with the badge
// hanging from the lamp, never pointed out. First person, 56 s. The display is only shown, never turned.
import { track, bob, ramp, smooth, lerp, dialogue, BABBLE_SEEDS, withSegments } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { buildProp } from '../models/props.js';
import { pumpCar, castSpec } from './stagecraft.js';

const D = 56;
const views = {
  liga: [0, 14, 'De noite, o carro parado na bomba 4: a bomba liga sozinha e o mostrador começa a correr'],
  mostrador: [14, 24, 'De frente para o mostrador da bomba 4: ele para em 34,70 e fica parado, legível'],
  atras: [24, 38, 'Você vira a cabeça: alguém de uniforme antigo, de costas, atrás do carro'],
  ninguem: [38, 48, 'O mesmo lugar: ninguém; só o carro e o ruído das luminárias'],
  cobertura: [48, 56, 'A câmera sobe para a cobertura acima da bomba 4 e para um instante nela'],
};
const EYE = 1.68, PUMP = 4, PX = 19.5, TH = BABBLE_SEEDS.heitor;
const say = dialogue([{ t: 39.0, who: '', text: 'Tinha alguém. Não tem.', seed: TH, hold: 1.2 }]);

const KEYS = [
  { t: 0, eye: [15.2, EYE, -5.9], look: [19.6, 1.5, -7.6] },
  { t: 6.0, eye: [15.8, EYE, -6.0], look: [19.6, 1.55, -7.6], ease: 'ss' },
  { t: 13.97, eye: [17.6, EYE, -6.1], look: [19.6, 1.55, -7.6] },
  { t: 14.0, eye: [19.5, 1.62, -5.6], look: [19.55, 1.58, -7.6] },
  { t: 19.0, eye: [19.5, 1.62, -5.7], look: [19.55, 1.58, -7.6], ease: 'ss' },
  { t: 23.97, eye: [19.5, 1.64, -6.0], look: [19.1, 1.6, -7.2] },
  { t: 24.0, eye: [19.6, EYE, -6.4], look: [19.5, 1.5, -7.4] },
  { t: 27.0, eye: [19.6, EYE, -6.4], look: [19.5, 1.5, -7.4], ease: 'ss' },
  { t: 29.5, eye: [19.6, EYE, -6.4], look: [17.6, 1.5, -4.9], ease: 'ss' },
  { t: 37.97, eye: [19.6, EYE, -6.4], look: [17.5, 1.5, -4.9] },
  { t: 38.0, eye: [20.3, 1.62, -6.1], look: [17.0, 1.45, -4.6] },
  { t: 47.97, eye: [20.0, 1.62, -6.2], look: [17.4, 1.45, -4.7], ease: 'ss' },
  { t: 48.0, eye: [19.5, EYE, -6.3], look: [19.5, 1.4, -7.6] },
  { t: 50.8, eye: [19.5, EYE, -6.3], look: [19.5, 1.5, -7.7], ease: 'ss' },
  { t: 52.2, eye: [19.4, 1.8, -6.3], look: [19.5, 3.7, -7.85], ease: 'ss' },
  { t: 55.97, eye: [19.4, 1.8, -6.25], look: [19.5, 3.72, -7.85] },
];
const cam = track(KEYS);
const START = 4.0, STOP = 15.5;
const value = (t) => (t < START ? 0 : 34.7 * smooth(ramp(t, START, STOP)));
const fmt = (v) => v.toFixed(2).replace('.', ',');
const show = (t) => (t < 29.5 ? false : t < 35.4 ? true : false);

const BASE = {
  name: 'bomba4', duration: D, views,
  anchors: { bomba4: 'A bomba 4', mostrador: 'O mostrador da bomba 4', cobertura: 'A cobertura sobre a bomba 4', carro: 'O carro parado na bomba 4' },
  sfx: [
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.6 } }, { t: 0, name: 'insetos', opts: { dur: D, gain: 0.6 } }, { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.5 } },
    { t: START, name: 'bomba_bip', opts: { pos: [19.8, 1.6, -7.6] } },
    { t: START + 0.3, name: 'bomba_corre', opts: { dur: STOP - START - 0.3, gain: 0.9, pos: [19.5, 1.0, -7.6] } },
    { t: STOP, name: 'bomba_bip', opts: { pos: [19.8, 1.6, -7.6] } },
    { t: 25.0, name: 'respiracao', opts: { dur: 8, gain: 0.5 } },
    { t: 29.5, name: 'sol_presenca', opts: { dur: 6, gain: 0.6 } }, { t: 33.0, name: 'sol_passos', opts: { n: 1, gain: 0.5, pos: [17.6, 0, -5.2] } },
    { t: 35.3, name: 'lampada_estalo', opts: { pos: [19.5, 3.6, -8] } },
    { t: 40.0, name: 'respiracao', opts: { dur: 5, gain: 0.5 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const car = pumpCar(r, W, PUMP, { tIn: -90, seed: 44, fuel: 'comum', style: 'sedan', driver: false, lights: false, color: '#8a8e8a' });
    g.add(car.car.root);
    const fig = buildCustomer(r, castSpec(ctx.cast, 'frentista-antigo', { categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }), { seed: 5 });
    g.add(fig.root);
    const nozzle = buildProp(r, 'bico', { seed: 1, tipo: 'comum' }); const nz = nozzle.root ?? nozzle.group ?? nozzle; g.add(nz);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { bomba4: () => W.p('bomba4', 1), mostrador: () => W.p('mostrador4'), cobertura: () => W.p('crachaBomba4', 3.4), carro: () => W.p('carroBomba4', 1) },
      pose(t, ambient) {
        const { rig } = hands;
        const c = cam(t), b = bob(t, 0);
        const eye = [c.eye[0], c.eye[1], c.eye[2]];
        rig.hang(Math.sin(t * 1.3));
        car.pose(t);
        nz.position.set(PX, 0.86, -5.95); nz.rotation.set(0, 0, 0); nz.visible = t >= START - 1.0 && t < STOP + 1.0;
        fig.root.visible = show(t); fig.root.position.set(18.15, 0, -5.0); fig.root.rotation.y = Math.PI;
        fig.update(t, { pose: 'costas' });
        let display = '';
        if (t >= 0) display = t < START ? ' 0,00' : t < STOP ? (' ' + fmt(value(t))).slice(-6) : ' 34,70';
        if (t >= 13.99 && t < STOP) display = fmt(value(t));
        const lampDip = t >= 35.2 && t < 35.7 ? 0.45 : t >= 29.4 && t < 29.8 ? 0.6 : 1;
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.5)), smooth(ramp(t, 55.0, 55.95)));
        return {
          eye, look: c.look, roll: c.roll + b[2], fade, dialog: say.at(t),
          flashes: [{ t: 35.25, s: 0.7, rise: 0.12, fall: 0.35 }],
          world: { displays: { [PUMP]: display }, hideNozzle: t >= START - 1 && t < STOP + 1 ? [PUMP, 'comum'] : null, nozzleAt: nz.visible ? nz.position.toArray() : null, dimLights: { cobertura4: lampDip, cobertura3: lampDip }, state: { hora: 3.2 }, ambient: 0x474b5c },
        };
        void ambient; void T;
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c46a-liga', desc: 'Cena 46 (1 de 2): a bomba 4 liga sozinha e o mostrador corre depressa; sem texto', pieces: [{ src: 4.0, d: 3.4, rate: 3.4 }] },
  { name: 'c46b-mostrador', desc: 'Cena 46 (2 de 2): de frente, o mostrador parado em  34,70, legível por 3,5 s; sem texto', pieces: [{ src: 16.0, d: 3.5 }] },
  { name: 'c47a-atras', desc: 'Cena 47 (1 de 2): você vira a cabeça: alguém de uniforme antigo, de costas, atrás do carro; sem texto', pieces: [{ src: 30.6, d: 3.2 }] },
  { name: 'c47b-ninguem', desc: 'Cena 47 (2 de 2): o mesmo lugar, ninguém; pensamento', pieces: [{ src: 38.4, d: 3.0 }],
    say: [{ t: 0.3, who: '', text: 'Tinha alguém. Não tem.', seed: TH, hold: 0.8 }] },
  { name: 'c48-cobertura', desc: 'Cena 48: a câmera sobe para a cobertura acima da bomba 4; a luminária e, abaixo dela, o crachá pendurado, sem destaque; sem texto', pieces: [{ src: 49.2, d: 5.4 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'bomba4', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
