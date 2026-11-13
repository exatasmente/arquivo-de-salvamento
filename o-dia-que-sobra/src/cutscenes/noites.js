// Scripted shift "noites" (part 4 of the video): the nights go by, each one a little stranger. Cuts of
// different nights, fixed seed: the clock running, the car with nobody, the bell with nobody, small talk at
// the till, the man of 03:33 at the counter, the sign with the wider smile seen from the car park (cam6 passes
// at the start of that view), the sun on the poster and on the pump. First person, 84 s.
import { track, bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS, withSegments } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { pumpCar, castSpec, wrapA } from './stagecraft.js';

const D = 100;
const views = {
  relogio: [0, 6, 'O relógio da loja corre: as horas e as noites passam'],
  'carro-vazio': [6, 22, 'Uma noite: o carro entra, para na bomba 3 e não há ninguém dentro; ele sai sozinho'],
  sino: [22, 32, 'Outra noite: o sino da porta toca, a porta abre e ninguém entra'],
  conversa: [32, 44, 'No balcão, uma cliente fala da escala; o gerente comenta por telefone; ela diz que o posto tem coisa'],
  entregador: [44, 50, 'No balcão, o entregador de moto, sem troco de novo'],
  homem: [50, 64, 'O homem das 03:33 parado no balcão, olhando; a cafeteira ligada ao lado e um copo vazio no balcão'],
  placa: [64, 72, 'No estacionamento: a câmera da parede da loja de relance e, longe, a placa com o sorriso mais largo'],
  zumbido: [72, 84, 'Na loja, o zumbido da lâmpada que pisca; um vulto passa no canto do olho; o pensamento do cansaço'],
  olhar: [84, 92, 'De novo no estacionamento, o olhar preso na placa de sorriso largo, a respiração longa'],
  sol: [92, 100, 'O sol no cartaz da loja e no adesivo da bomba'],
};
const EYE = 1.68, TH = BABBLE_SEEDS.heitor;

const say = dialogue([
  { t: 0.7, who: '', text: 'Essas Noites não acabam.', seed: TH, hold: 1.0 },
  { t: 84.6, who: '', text: 'É cansaço. Tem que ser cansaço.', seed: TH, hold: 1.2 },
  { t: 33.0, who: 'Cliente', text: 'Acaba logo essa escala, né?', seed: 12, hold: 0.8 },
  { t: 36.8, who: 'Gerente', text: 'Isso custa caro.', seed: BABBLE_SEEDS.gerente, hold: 0.8 },
  { t: 39.4, who: 'Cliente', text: 'Esse posto tem coisa.', seed: 12, hold: 1.2 },
  { t: 44.6, who: 'Cliente', text: 'Sem troco de novo.', seed: 17, hold: 1.2 },
]);

const KEYS = [
  // relogio: the wall clock, close
  { t: 0, eye: [9.6, EYE, 9.3], look: [9.6, 2.15, 11.9] },
  { t: 5.97, eye: [9.6, EYE, 9.5], look: [9.6, 2.2, 11.9] },
  // carro-vazio (pump 3): the headlights, the empty window, the car leaving
  { t: 6.0, eye: [11.2, EYE, -6.2], look: [4.0, 1.2, -3.4] },
  { t: 12.4, eye: [11.4, EYE, -6.7], look: [15.6, 1.2, -5.2], ease: 'ss' },
  { t: 15.0, eye: [12.4, EYE, -6.6], look: [15.9, 1.25, -5.3], ease: 'ss' },
  { t: 17.0, eye: [12.5, EYE, -6.6], look: [16.0, 1.25, -5.3] },
  { t: 21.97, eye: [12.5, EYE, -6.6], look: [21.0, 1.0, -3.4] },
  // sino
  { t: 22.0, eye: [13.0, EYE, 9.4], look: [9.0, 1.6, 3.4] },
  { t: 28.0, eye: [13.0, EYE, 9.4], look: [9.0, 1.4, 3.2], ease: 'ss' },
  { t: 31.97, eye: [12.7, EYE, 9.4], look: [9.5, 1.2, 4.6] },
  // conversa
  { t: 32.0, eye: [13.0, EYE, 9.5], look: [13.2, 1.5, 7.2] },
  { t: 43.97, eye: [13.1, EYE, 9.4], look: [13.2, 1.5, 7.2] },
  // entregador
  { t: 44.0, eye: [12.2, EYE, 9.5], look: [12.0, 1.4, 7.2] },
  { t: 49.97, eye: [12.3, EYE, 9.4], look: [12.0, 1.4, 7.2] },
  // homem
  { t: 50.0, eye: [13.9, EYE, 9.7], look: [13.6, 1.5, 6.4] },
  { t: 57.0, eye: [13.9, EYE, 9.7], look: [14.4, 1.4, 5.6], ease: 'ss' },
  { t: 63.97, eye: [13.9, EYE, 9.6], look: [13.7, 1.45, 6.6] },
  // placa: cam6 on the wall of the store, then the sign from the car park
  { t: 64.0, eye: [-1.4, EYE, 8.4], look: [1.6, 3.1, 10.0] },
  { t: 66.9, eye: [-1.0, EYE, 8.5], look: [1.6, 3.1, 10.0] },
  { t: 66.95, eye: [-23.6, EYE, -11.4], look: [-14.0, 8.0, -20.3] },
  { t: 71.97, eye: [-22.8, EYE, -11.9], look: [-14.0, 8.4, -20.3], ease: 'ss' },
  // zumbido: up at the lamp that flickers, then along the store, where something crosses the corner of the eye
  { t: 72.0, eye: [9.8, EYE, 9.2], look: [10.5, 2.6, 5.8] },
  { t: 76.0, eye: [9.8, EYE, 9.2], look: [10.5, 2.7, 5.8], ease: 'ss' },
  { t: 77.0, eye: [9.8, EYE, 9.2], look: [4.8, 1.5, 8.6], ease: 'ss' },
  { t: 83.97, eye: [9.8, EYE, 9.2], look: [4.6, 1.5, 8.6] },
  // olhar
  { t: 84.0, eye: [-18.0, EYE, -10.0], look: [-14.0, 8.2, -20.3] },
  { t: 91.97, eye: [-15.2, EYE, -13.2], look: [-14.0, 8.8, -20.3], ease: 'ss' },
  // c41: the hands shake a little in the lit shop (a source range after the end of the shift, only used by its scene)
  { t: 100.0, eye: [9.8, EYE, 9.2], look: [7.0, 1.0, 8.0] }, { t: 104.3, eye: [9.8, 1.62, 9.2], look: [7.0, 0.9, 8.0] },
  // c44: the sign from the store side of the car park (a source range after the end of the shift)
  { t: 105.0, eye: [-4.0, EYE, 3.0], look: [-14.0, 8.2, -20.3] }, { t: 110.3, eye: [-4.6, EYE, 2.2], look: [-14.0, 8.5, -20.3], ease: 'ss' },
  // sol
  { t: 92.0, eye: [11.2, EYE, 9.6], look: [11.2, 2.0, 11.9] },
  { t: 95.97, eye: [11.2, EYE, 10.2], look: [11.2, 2.0, 11.9] },
  { t: 96.0, eye: [8.5, 1.6, -5.4], look: [8.5, 1.9, -8.0] },
  { t: 99.97, eye: [8.5, 1.65, -5.9], look: [8.5, 1.95, -8.0] },
];
const cam = track(KEYS);
const HORA = (t) => (t < 6 ? lerp(0.5, 5.8, smooth(t / 6)) : t < 22 ? 1.7 : t < 32 ? 3.0 : t < 44 ? 2.0 : t < 50 ? 1.3 : t < 64 ? 3.55 : t < 72 ? 4.4 : t < 84 ? 4.6 : t < 92 ? 4.9 : 5.2);

const BASE = {
  name: 'noites', duration: D, views,
  anchors: { relogio: 'O relógio de parede da loja', balcao: 'O balcão da loja', placa: 'A placa do sol com o sorriso mais largo', cartaz: 'O cartaz do sol na loja' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: 6, gain: 0.5 } },
    { t: 6, name: 'rodovia', opts: { dur: 16, gain: 0.7 } }, { t: 6, name: 'insetos', opts: { dur: 16, gain: 0.5 } },
    { t: 8.0, name: 'motor_carro', opts: { dur: 9, gain: 0.8, pos: [10, 1, -4.8] } }, { t: 16.0, name: 'respiracao', opts: { dur: 5, gain: 0.8 } },
    { t: 17.8, name: 'motor_carro', opts: { dur: 5, gain: 0.8, pos: [16, 1, -4.8] } },
    { t: 22, name: 'fluorescente', opts: { dur: 30, gain: 0.6 } },
    { t: 25.0, name: 'porta_sino', opts: { pos: [9, 2.5, 3.3] } }, { t: 25.1, name: 'porta_abre', opts: { pos: [9, 1, 3] } }, { t: 27.4, name: 'porta_fecha', opts: { pos: [9, 1, 3] } },
    { t: 29.5, name: 'respiracao', opts: { dur: 3, gain: 0.7 } },
    { t: 51, name: 'cafeteira', opts: { dur: 12, gain: 0.8, pos: [15.5, 1.2, 4.9] } }, { t: 50.5, name: 'respiracao', opts: { dur: 10, gain: 0.6 } },
    { t: 64, name: 'rodovia', opts: { dur: 8, gain: 0.8 } }, { t: 64, name: 'vento', opts: { dur: 8, gain: 0.7 } }, { t: 64, name: 'insetos', opts: { dur: 8, gain: 0.6 } }, { t: 68, name: 'respiracao', opts: { dur: 4, gain: 0.7 } },
    { t: 72, name: 'fluorescente', opts: { dur: 12, gain: 1.0 } }, { t: 72.5, name: 'respiracao', opts: { dur: 11, gain: 0.9 } }, { t: 74.5, name: 'lampada_estalo', opts: { gain: 0.6 } }, { t: 75.6, name: 'lampada_estalo', opts: { gain: 0.6 } },
    { t: 84, name: 'rodovia', opts: { dur: 8, gain: 0.8 } }, { t: 84, name: 'vento', opts: { dur: 8, gain: 0.8 } }, { t: 85, name: 'respiracao', opts: { dur: 7, gain: 0.8 } },
    { t: 92, name: 'fluorescente', opts: { dur: 4, gain: 0.6 } }, { t: 96, name: 'sol_presenca', opts: { dur: 4, gain: 0.6 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const empty = pumpCar(r, W, 3, { tPark: 12.2, tOut: 17.6, seed: 33, fuel: 'etanol', style: 'sedan', driver: false, lights: true });
    g.add(empty.car.root);
    const mk = (id, fb, seed) => buildCustomer(r, castSpec(ctx.cast, id, fb), { seed });
    const cida = mk('cida', { categoria: 'recorrente', roupa: 'taxista-dona', seed: 12, look: { female: true, build: 'mid', height: 1.6, hair: '#b9b6b0', hairStyle: 'short', skin: '#e6c29b' }, acessorios: ['oculos', 'bolsa'] }, 12);
    const rafa = mk('rafael', { categoria: 'recorrente', roupa: 'entregador', seed: 17, look: { build: 'lean', hairStyle: 'short', height: 1.74 }, acessorios: ['capacete-mao', 'mochila-entrega'] }, 17);
    const homem = mk('homem0333', { categoria: 'recorrente', roupa: 'sobretudo', seed: 159, look: { build: 'lean', hairStyle: 'short', hair: '#4a443c', skin: '#e8d0b0', height: 1.78 }, manias: ['rigido'] }, 159);
    const vulto = buildCustomer(r, castSpec(ctx.cast, 'frentista-antigo', { categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }), { seed: 5 });
    g.add(cida.root, rafa.root, homem.root, vulto.root);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { relogio: () => [9.6, 2.15, 11.9], balcao: () => W.p('balcao', 1), placa: () => W.p('placaSol'), cartaz: () => [11.2, 2.0, 11.9] },
      pose(t, ambient) {
        const { rig } = hands;
        const c = cam(t), b = bob(t, 0);
        const eye = [c.eye[0], c.eye[1], c.eye[2]];
        rig.hang(Math.sin(t * 1.3));
        if (t >= 100) { const tr = Math.sin(t * 17) * 0.012; rig.reach('right', [0.2 + tr, -0.28, -0.4]); rig.reach('left', [-0.2 - tr, -0.28, -0.4]); }
        empty.pose(t);
        const place = (cs, who, x, z, pose, show) => { cs.root.visible = show; cs.root.position.set(x, 0, z); cs.root.rotation.y = 0; const toCam = Math.atan2(eye[0] - x, eye[2] - z); cs.root.rotation.y = wrapA(toCam) * 0.0; cs.update(t, { pose, falando: say.at(t)?.who === who }); };
        place(cida, 'Cliente', 13.2, 7.3, 'parado', t >= 32 && t < 44);
        place(rafa, 'Cliente', 12.0, 7.3, t >= 45.5 ? 'pagando' : 'parado', t >= 44 && t < 50);
        place(homem, 'x', 13.7, 7.3, 'fixo', t >= 50 && t < 64);
        { const u = (t - 77.6) / 1.4; vulto.root.visible = u > 0 && u < 1; vulto.root.position.set(lerp(2.6, 5.2, u), 0, 10.6); vulto.root.rotation.y = Math.PI / 2; vulto.update(t, { andando: 0.7, fase: t * 5.5 }); }
        const open = t >= 25 && t < 29 ? smooth(ramp(t, 25.0, 25.8)) * (1 - smooth(ramp(t, 27.4, 28.6))) : 0;
        const sm = (t >= 64 && t < 72) || (t >= 84 && t < 92) || t >= 105 ? 1 : 0;
        const fade = t >= 100 ? 0 : Math.max(1 - smooth(ramp(t, 0, 0.5)), smooth(ramp(t, 99.2, 99.95)));
        // a cut between nights: a short dip to black at each view boundary (never a flash)
        const edges = [];
        let dip = 0; for (const e of edges) dip = Math.max(dip, 1 - Math.min(1, Math.abs(t - e) / 0.25) * 1);
        return {
          eye, look: c.look, roll: c.roll, fade: Math.max(fade, dip * 0.0), dialog: say.at(t), daze: t >= 100 ? 0.45 : 0,
          world: {
            state: { doors: { 'porta-loja': open }, sino: ambient - (t - 25.0), hora: HORA(t), placaSorriso: sm ? 1 : 0.1 },
            sign: sm ? { on: true, smile: 1, ray: -1 } : { on: true, smile: 0.1, ray: -1 },
            cups: t >= 50 && t < 64 ? 1 : 0, brewing: t >= 50 && t < 64, fog: sm ? [14, 70] : undefined, ambient: sm ? 0x585d78 : undefined,
          },
        };
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c25-entregador', desc: 'Cena 25: no balcão, o entregador com a nota na mão espera o troco; pensamento sobre o erro', pieces: [{ src: 44.0, d: 4.4 }],
    say: [{ t: 0.3, who: '', text: 'Errou o troco, reclamam. Errou o bico, reclamam.', seed: TH, hold: 0.5 }] },
  { name: 'c37a-carro-vazio', desc: 'Cena 37 (1 de 2): o carro para na bomba 3 e não há ninguém dentro; sem texto', pieces: [{ src: 11.4, d: 3.8 }] },
  { name: 'c37b-sino', desc: 'Cena 37 (2 de 2): o sino da porta toca, a porta abre e ninguém entra; sem texto', pieces: [{ src: 24.6, d: 3.5 }] },
  { name: 'c38-conversa', desc: 'Cena 38: no balcão, a taxista fala da escala, o gerente comenta por telefone e ela diz que o posto tem coisa', pieces: [{ src: 32.0, d: 10.0 }],
    say: [{ t: 0.8, who: 'Cliente', text: 'Acaba logo essa escala, né?', seed: 12, hold: 0.6 }, { t: 4.4, who: 'Gerente', text: 'Isso custa caro.', seed: BABBLE_SEEDS.gerente, hold: 0.6 }, { t: 6.8, who: 'Cliente', text: 'Esse posto tem coisa.', seed: 12, hold: 1.2 }] },
  { name: 'c39-sem-troco-homem', desc: 'Cena 39: o entregador sem troco; depois o homem das 03:33 parado no balcão, olhando, com a cafeteira ligada e um copo vazio', pieces: [{ src: 44.2, d: 3.4 }, { src: 51.0, d: 5.8 }],
    say: [{ t: 0.4, who: 'Cliente', text: 'Sem troco de novo.', seed: 17, hold: 0.8 }] },
  { name: 'c40-placa-cam6', desc: 'Cena 40: no estacionamento, a câmera da parede da loja (cam6) de relance e, longe, a placa com o sorriso mais largo; sem texto', pieces: [{ src: 64.4, d: 2.0 }, { src: 67.2, d: 4.2 }] },
  { name: 'c41-respiracao', desc: 'Cena 41: na loja, as mãos tremem um pouco e a respiração pesa; sem texto', pieces: [{ src: 100.0, d: 4.2 }] },
  { name: 'c42-zumbido', desc: 'Cena 42: o zumbido da lâmpada que pisca e um vulto que passa no canto do olho; sem texto', pieces: [{ src: 72.6, d: 7.7 }] },
  { name: 'c44-sorriso', desc: 'Cena 44: a placa de sorriso largo acima do estacionamento; respiração longa; sem texto', pieces: [{ src: 105.0, d: 5.0 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'noites', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
