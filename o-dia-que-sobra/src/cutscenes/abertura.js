// "abertura": the opening of the video, one short window per scene (1 to 14, the ones the other cutscenes do not
// carry). The road at night, the gravel under the hand, the canopy coming closer, the poster, the calendar of
// four weeks close up, and Heitor's house (the rod of his father leaning on the wall) before he leaves.
// Every window has its own camera and ends on its own framing; the boxes are exactly the ones of the script.
// First person, 71 s. This file defines its views itself: each name is a scene of the video.
import { track, bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { buildCar } from '../models/car.js';
import { buildCasa } from '../scenes/casa.js';
import { toCam } from './stagecraft.js';

const TH = BABBLE_SEEDS.heitor, EYE = 1.68;
const views = {
  'c01-abertura': [0, 2.6, 'Cena 1: o acostamento escuro e um carro com faróis passando; sem texto'],
  'c03-loja': [2.6, 6.2, 'Cena 3: a loja vazia e acesa à noite, a porta de vidro à frente; sem texto'],
  'c04-asfalto': [6.2, 14.3, 'Cena 4: andando pelo acostamento, o asfalto e a faixa amarela de perto; sem texto'],
  'c05-cascalho': [14.3, 21.2, 'Cena 5: a mão passa pelo cascalho do acostamento; insetos e vento; sem texto'],
  'c06-passos': [21.2, 28.1, 'Cena 6: a cobertura iluminada do posto se aproximando; pensamento "Cada passo é um passo para dentro disso."'],
  'c07-maos': [28.1, 35.4, 'Cena 7: sob a cobertura, as mãos abertas diante dos olhos; pensamento "Quarenta e um anos e a primeira noite."'],
  'c08-dormir': [35.4, 40.4, 'Cena 8: o acostamento, a placa apagada à frente; pensamento "Durmo de dia. A folga também vai ser de noite."'],
  'c10-cartaz': [40.4, 46.9, 'Cena 10: a fachada do posto e o cartaz "Um novo dia sempre começa com um sorriso!"; sem texto'],
  'c11-calendario': [46.9, 55.4, 'Cena 11: o calendário de quatro semanas na parede do escritório, de perto; sem texto'],
  'c12-casa': [55.4, 63.1, 'Cena 12: a casa de noite, a vara de pescar do pai encostada na parede; pensamento "Não peço muito..."'],
  'c13-quatro-semanas': [63.1, 67.6, 'Cena 13: sob a cobertura, a loja acesa à frente; pensamento "Quatro semanas. Depois disso é Só descansar."'],
  'c14-cartaz-dentro': [67.6, 70.7, 'Cena 14: o cartaz do sol dentro da loja e o relógio de parede; sem texto'],
  'c57-placa-vidro': [70.7, 79.5, 'Cena 57: da rodovia, pelo lado de trás, a placa alta do sol acesa com o sorriso largo, sozinha no escuro; sem texto'],
};
const D = 79.5;
const T0 = Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v[0]]));
const L = (name, rel, text, hold = 0.8) => ({ t: T0[name] + rel, who: '', text, seed: TH, hold });
const say = dialogue([
  L('c06-passos', 0.5, 'Cada passo é um passo para dentro disso.'),
  L('c07-maos', 0.6, 'Quarenta e um anos e a primeira noite.'),
  L('c08-dormir', 0.4, 'Durmo de dia. A folga também vai ser de noite.'),
  L('c12-casa', 0.6, 'Não peço muito. Um dia de folga, um lago, a vara do meu pai.'),
  L('c13-quatro-semanas', 0.4, 'Quatro semanas. Depois disso é Só descansar.', 0.4),
]);

const K = (name, rel, eye, look, ease) => ({ t: T0[name] + rel, eye, look, ...(ease ? { ease } : {}) });
const e = (name) => T0[name] + (views[name][1] - views[name][0]) - 0.03; // the last instant of a window
const KEYS = [
  K('c01-abertura', 0, [-30, EYE, -24.3], [-8, 1.3, -26.5]), { t: e('c01-abertura'), eye: [-29.6, EYE, -24.3], look: [-8, 1.3, -26.5] },
  K('c03-loja', 0, [9.0, EYE, 6.4], [9.0, 1.45, 3.2]), { t: e('c03-loja'), eye: [9.0, EYE, 5.4], look: [9.0, 1.4, 3.2] },
  K('c04-asfalto', 0, [-42, EYE, -24.5], [-37, 0.5, -24.2]), K('c04-asfalto', 4, [-39, EYE, -24.4], [-34, 0.45, -24.0]), { t: e('c04-asfalto'), eye: [-36.3, EYE, -24.3], look: [-31.5, 0.5, -23.9] },
  K('c05-cascalho', 0, [-33, 0.95, -24.3], [-32.6, 0.15, -23.9]), { t: e('c05-cascalho'), eye: [-33, 0.88, -24.3], look: [-32.5, 0.1, -23.8] },
  K('c06-passos', 0, [-12, EYE, -11], [1, 2.6, -6.4]), K('c06-passos', 3.5, [-8.5, EYE, -8], [2, 2.6, -6.4]), { t: e('c06-passos'), eye: [-5.5, EYE, -5.2], look: [3, 2.4, -6.4] },
  K('c07-maos', 0, [2.4, EYE, -3.0], [2.8, 0.9, -3.6]), { t: e('c07-maos'), eye: [2.5, EYE, -3.0], look: [2.9, 0.85, -3.7] },
  K('c08-dormir', 0, [-43, EYE, -24.4], [-4, 1.3, -8]), { t: e('c08-dormir'), eye: [-41.2, EYE, -24.3], look: [-4, 1.4, -8] },
  K('c10-cartaz', 0, [6.2, EYE, 0.8], [3.4, 1.7, 2.9]), K('c10-cartaz', 3, [4.4, EYE, 1.1], [3.1, 1.72, 2.9], 'ss'), { t: e('c10-cartaz'), eye: [3.5, EYE, 1.5], look: [3.1, 1.72, 2.9] },
  K('c11-calendario', 0, [7.6, EYE, 14.5], [8.3, 1.55, 12.1]), K('c11-calendario', 4, [7.9, 1.62, 13.5], [8.3, 1.52, 12.1], 'ss'), { t: e('c11-calendario'), eye: [7.95, 1.62, 13.25], look: [8.3, 1.5, 12.1] },
  K('c12-casa', 0, [6.6, EYE, 3.3], [9.1, 1.2, 2.6]), K('c12-casa', 3, [7.4, EYE, 3.0], [9.1, 1.2, 2.6], 'ss'), { t: e('c12-casa'), eye: [7.6, EYE, 2.9], look: [9.1, 1.15, 2.6] },
  K('c13-quatro-semanas', 0, [9.0, EYE, -2.4], [9.0, 1.5, 3.0]), { t: e('c13-quatro-semanas'), eye: [9.0, EYE, 0.2], look: [9.0, 1.4, 3.2] },
  K('c57-placa-vidro', 0, [-4.2, EYE, -27.0], [-14, 8.6, -20.3]), K('c57-placa-vidro', 4, [-5.6, EYE, -26.4], [-14, 8.8, -20.3], 'ss'), { t: e('c57-placa-vidro'), eye: [-6.8, EYE, -25.8], look: [-14, 8.9, -20.3] },
  K('c14-cartaz-dentro', 0, [11.2, EYE, 9.6], [11.2, 2.0, 11.9]), { t: e('c14-cartaz-dentro'), eye: [11.2, EYE, 10.1], look: [11.2, 2.0, 11.9] },
];
const cam = track(KEYS);
const which = (t) => Object.entries(views).find(([, v]) => t >= v[0] && t < v[1])?.[0] ?? 'c14-cartaz-dentro';
const WALK = { 'c04-asfalto': 1, 'c06-passos': 1, 'c13-quatro-semanas': 0.7, 'c08-dormir': 0.5 };

const sfx = [
  { t: 0, name: 'rodovia', opts: { dur: 40.4, gain: 0.8 } }, { t: 0, name: 'insetos', opts: { dur: 40.4, gain: 0.7 } }, { t: 0.4, name: 'vento', opts: { dur: 40, gain: 0.6 } },
  { t: 0.5, name: 'motor_carro', opts: { dur: 2.4, gain: 0.8 } },
  { t: T0['c03-loja'], name: 'fluorescente', opts: { dur: 3.6, gain: 0.7 } },
  ...footfalls(T0['c04-asfalto'] + 0.3, T0['c04-asfalto'] + 8, 1.9, { gain: 0.5 }, 'passo_asfalto'),
  { t: T0['c05-cascalho'] + 1.5, name: 'passo_asfalto', opts: { gain: 0.35 } }, { t: T0['c05-cascalho'] + 3.0, name: 'passo_asfalto', opts: { gain: 0.3 } }, { t: T0['c05-cascalho'] + 4.4, name: 'passo_asfalto', opts: { gain: 0.3 } },
  ...footfalls(T0['c06-passos'] + 0.2, T0['c06-passos'] + 6.8, 1.9, { gain: 0.5 }, 'passo_asfalto'),
  { t: T0['c07-maos'], name: 'fluorescente', opts: { dur: 7.3, gain: 0.5 } }, { t: T0['c07-maos'] + 0.5, name: 'respiracao', opts: { dur: 5, gain: 0.3 } },
  ...footfalls(T0['c08-dormir'] + 0.2, T0['c08-dormir'] + 5, 1.9, { gain: 0.4 }, 'passo_asfalto'),
  { t: T0['c10-cartaz'], name: 'fluorescente', opts: { dur: 6.5, gain: 0.4 } },
  { t: T0['c11-calendario'], name: 'fluorescente', opts: { dur: 8.5, gain: 0.5 } },
  { t: T0['c12-casa'], name: 'geladeira', opts: { dur: 7.7, gain: 0.6 } },
  ...footfalls(T0['c13-quatro-semanas'] + 0.1, T0['c13-quatro-semanas'] + 4.4, 1.9, { gain: 0.5 }, 'passo_asfalto'),
  { t: T0['c14-cartaz-dentro'], name: 'fluorescente', opts: { dur: 3.1, gain: 0.7 } },
  { t: T0['c57-placa-vidro'], name: 'fluorescente', opts: { dur: 8.8, gain: 0.5 } }, { t: T0['c57-placa-vidro'], name: 'vento', opts: { dur: 8.8, gain: 0.4 } },
  ...say.sfx,
];

export default {
  name: 'abertura', duration: D, views,
  anchors: { calendario: 'O calendário de quatro semanas do escritório', vara: 'A vara de pescar do pai, na casa', cartaz: 'O cartaz da fachada' },
  sfx,
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const car = buildCar(r, { seed: 9, fuel: 'comum', capSide: 'left' }); car.setDriver(true); car.setLights(true); g.add(car.root);
    const casa = buildCasa(r, { seed: ctx.seed }); casa.group.visible = false; g.add(casa.group);
    const col = new T.Color();
    return {
      world: false, group: g, hands: true, arms: hands.arms,
      anchors: { calendario: () => [8.3, 1.5, 12.1], vara: () => [9.1, 1.0, 2.6], cartaz: () => [3.1, 1.7, 2.9] },
      pose(t, ambient) {
        const { rig } = hands;
        const w = which(t), c = cam(t), walk = WALK[w] ?? 0, b = bob(t, walk * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]];
        const rel = t - T0[w];
        rig.hang(Math.sin(t * 1.4) * (walk ? 2 : 1));
        // hands that do something
        if (w === 'c05-cascalho') { const u = smooth(ramp(rel, 0.6, 1.8)) * (1 - smooth(ramp(rel, 5.2, 6.4))); const sw = Math.sin(rel * 2.0) * 0.06; rig.reach('right', [lerp(0.22, 0.06 + sw, u), lerp(-0.4, -0.2, u), lerp(-0.34, -0.5, u)]); rig.curl('right', 0.2 + 0.5 * Math.max(0, Math.sin(rel * 1.6)) * u); }
        if (w === 'c07-maos') { const u = smooth(ramp(rel, 0.4, 1.6)); const k = smooth(ramp(rel, 3.5, 6.0)); rig.reach('right', [lerp(0.22, 0.12, u), lerp(-0.4, -0.2, u), lerp(-0.34, -0.42, u)]); rig.reach('left', [lerp(-0.22, -0.12, u), lerp(-0.4, -0.2, u), lerp(-0.34, -0.42, u)]); rig.curl('right', 0.05 + 0.6 * k); rig.curl('left', 0.05 + 0.6 * k); }
        const inCasa = w === 'c12-casa';
        W.group.visible = !inCasa; casa.group.visible = inCasa;
        // the car on the highway (scene 1)
        car.root.visible = w === 'c01-abertura' && t > 0.4;
        car.root.position.set(-62 + 26 * (t - 0), 0, -28.5); car.root.rotation.y = Math.PI / 2;
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.7)), 0);
        const out = { eye, look: c.look, roll: c.roll + b[2], fade, dialog: say.at(t) };
        if (inCasa) {
          casa.update?.(t, { hora: 23.2 });
          const sc = [];
          for (const l of casa.lights) { if (!l.on || !(l.level > 0.02)) continue; const d = Math.hypot(l.pos[0] - eye[0], l.pos[1] - eye[1], l.pos[2] - eye[2]); sc.push({ l, s: (d < l.range ? 3 : 0) + l.range / (d + 3) }); }
          sc.sort((a, b2) => b2.s - a.s);
          for (let i = 0; i < r.POINT_LIGHTS; i++) { const q = sc[i]; if (!q) { r.point(i, { pos: [0, -50, 0], color: 0x000000, range: 1 }); continue; } col.set(q.l.color).multiplyScalar(q.l.level * 0.95); r.point(i, { pos: q.l.pos, color: col.getHex(), range: q.l.range }); }
          r.light({ ambient: 0x4a4e64, key: 0x2a3046, fog: '#080a12', fogNear: 14, fogFar: 52 }); r.spot({ on: false });
        } else {
          const road = ['c01-abertura', 'c04-asfalto', 'c05-cascalho', 'c06-passos', 'c08-dormir'].includes(w);
          W.pose(ambient, {
            eye, state: { hora: 0.3, doors: {} }, fog: road || w === 'c57-placa-vidro' ? [14, 70] : undefined, ambient: w === 'c05-cascalho' ? 0x7a7f9a : road ? 0x585d78 : undefined,
            sign: w === 'c57-placa-vidro' ? { on: true, smile: 1, ray: -1 } : { on: false, smile: 0, ray: -1 }, on: w === 'c11-calendario' ? ['escritorio-teto'] : [],
          }, { reduce: ctx.reduceFlash });
        }
        return out;
      },
    };
  },
};
