// Scripted shift "telefone" (part 6 of the video): the office phone rings at the manager's hour; the hand lifts
// the handset; the voice on the line is the protagonist's own and says "Não saia da loja."; then the silence.
// The voice of the box uses the babble seed of the protagonist (the paid recording only comes with the person's "yes").
// First person, 42 s.
import { track, bob, ramp, smooth, lerp, dialogue, BABBLE_SEEDS, withSegments } from './common.js';
import { toCam } from './stagecraft.js';

const D = 42;
const views = {
  escritorio: [0, 12, 'No escritório, de madrugada, o telefone toca e treme sobre a mesa'],
  atende: [12, 22, 'A mão levanta o fone e o leva ao ouvido'],
  voz: [22, 32, 'A caixa do telefone diz a frase com a sua própria voz; dois pensamentos'],
  silencio: [32, 42, 'O fone desce; só o zumbido da fluorescente e a porta para a loja'],
};
const EYE = 1.68, TH = BABBLE_SEEDS.heitor;
const say = dialogue([
  { t: 24.0, who: 'Telefone', text: 'Não saia da loja.', seed: TH, hold: 1.6 },
  { t: 28.2, who: '', text: 'É a minha voz.', seed: TH, hold: 0.6 },
  { t: 32.6, who: '', text: 'Faltam minutos. Eu preciso sair.', seed: TH, hold: 1.6 },
]);
const KEYS = [
  { t: 0, eye: [5.2, EYE, 15.6], look: [6.35, 1.0, 18.7] },
  { t: 8.0, eye: [6.0, 1.5, 17.6], look: [6.35, 0.92, 18.7], ease: 'ss' },
  { t: 11.97, eye: [6.15, 1.48, 17.85], look: [6.35, 0.9, 18.7] },
  { t: 12.0, eye: [6.5, 1.45, 17.9], look: [6.35, 0.85, 18.7] },
  { t: 16.0, eye: [6.5, 1.45, 17.9], look: [6.35, 0.85, 18.7], ease: 'ss' },
  { t: 18.0, eye: [6.5, 1.5, 17.9], look: [5.2, 1.4, 19.0], ease: 'ss' },
  { t: 21.97, eye: [6.5, 1.5, 17.9], look: [5.0, 1.4, 19.0] },
  { t: 22.0, eye: [6.0, 1.58, 17.2], look: [5.0, 1.45, 18.6] },
  { t: 26.97, eye: [6.0, 1.58, 17.2], look: [5.0, 1.45, 18.6] },
  { t: 27.0, eye: [6.5, 1.5, 17.5], look: [5.7, 1.55, 19.3] },
  { t: 31.97, eye: [6.5, 1.5, 17.5], look: [5.6, 1.5, 19.3] },
  { t: 32.0, eye: [5.4, 1.62, 16.6], look: [5.0, 1.4, 12.2] },
  { t: 36.0, eye: [5.4, 1.62, 16.4], look: [5.0, 1.4, 12.0], ease: 'ss' },
  { t: 41.97, eye: [5.4, 1.62, 16.4], look: [5.0, 1.45, 11.0] },
  // source ranges after the end, one opening of its own for each of the scenes 49 to 52
  { t: 59.95, eye: [3.9, EYE, 13.6], look: [6.35, 0.95, 18.7] }, { t: 60.0, eye: [3.9, EYE, 13.6], look: [6.35, 0.95, 18.7] }, { t: 64.97, eye: [4.1, EYE, 14.0], look: [6.35, 0.95, 18.7], ease: 'ss' },
  { t: 69.95, eye: [6.5, 1.42, 18.0], look: [6.35, 0.85, 18.7] }, { t: 70.0, eye: [6.5, 1.42, 18.0], look: [6.35, 0.85, 18.7] }, { t: 74.97, eye: [6.5, 1.43, 18.0], look: [6.35, 0.85, 18.7] },
  { t: 75.0, eye: [5.1, 1.38, 17.7], look: [4.95, 1.05, 18.7] }, { t: 79.97, eye: [5.1, 1.38, 17.6], look: [4.95, 1.05, 18.7] },
  { t: 80.0, eye: [6.0, 1.2, 18.0], look: [6.35, 0.86, 18.7] }, { t: 82.97, eye: [6.0, 1.2, 17.95], look: [6.35, 0.86, 18.7] },
];
const cam = track(KEYS);

const BASE = {
  name: 'telefone', duration: D, views,
  anchors: { telefone: 'O telefone da mesa do escritório', porta: 'A porta do escritório para a loja' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.6 } },
    { t: 0.8, name: 'telefone_toca', opts: { dur: 12.4, gain: 0.9, pos: [6.35, 1, 18.7] } },
    { t: 13.2, name: 'telefone_atende', opts: { pos: [6.35, 1, 18.7] } },
    { t: 19.0, name: 'respiracao', opts: { dur: 6, gain: 0.6 } },
    { t: 29.5, name: 'coracao', opts: { dur: 8, gain: 0.5 } },
    { t: 31.2, name: 'telefone_desliga', opts: { pos: [6.35, 1, 18.7] } },
    { t: 60.0, name: 'telefone_toca', opts: { dur: 4.6, gain: 0.9, pos: [6.35, 1, 18.7] } }, { t: 70.8, name: 'telefone_atende', opts: { pos: [6.35, 1, 18.7] } },
    { t: 75.0, name: 'respiracao', opts: { dur: 5, gain: 0.6 } }, { t: 80.0, name: 'coracao', opts: { dur: 3, gain: 0.5 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const handset = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.2), r.mat('#e0d4b0', { emissive: 0.3 })); handset.visible = false; g.add(handset);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { telefone: () => [6.35, 0.95, 18.7], porta: () => W.p('porta-escritorio', 1.2) },
      pose(t) {
        const { rig } = hands;
        const c = cam(t), eye = c.eye.slice();
        rig.hang(Math.sin(t * 1.2));
        handset.visible = false;
        const ph = toCam(T, eye, c.look, [6.35, 0.95, 18.65]);
        const hl = (x) => (x >= 80 ? 27.6 + (x - 80) : x >= 75 ? 22 + (x - 75) : x >= 70 ? 12.4 + (x - 70) : x), th = hl(t);
        const lift = smooth(ramp(th, 12.6, 14.0)), ear = smooth(ramp(th, 15.0, 17.0)) * (1 - smooth(ramp(th, 30.4, 31.6)));
        if (th >= 12.2 && th < 31.8 && t < 60 || t >= 70 && t < 83) {
          const toPhone = [lerp(0.22, ph[0], lift), lerp(-0.4, ph[1] + 0.02, lift), lerp(-0.34, ph[2], lift)];
          const toEar = [0.2, 0.0, -0.3];
          const p = toPhone.map((v, i) => lerp(v, toEar[i], ear));
          rig.reach('right', p);
          if (th >= 13.6) { handset.visible = true; const w = new T.Vector3(...p); const e = new T.Vector3(...eye), f = new T.Vector3(...c.look).sub(e).normalize(); const right = new T.Vector3().crossVectors(f, new T.Vector3(0, 1, 0)).normalize(), up = new T.Vector3().crossVectors(right, f).normalize(); const wp = e.clone().addScaledVector(right, w.x).addScaledVector(up, w.y).addScaledVector(f, -w.z); handset.position.copy(wp); handset.rotation.set(0, Math.atan2(f.x, f.z), 0); }
        }
        const fade = t >= 60 ? 0 : Math.max(1 - smooth(ramp(t, 0, 0.5)), smooth(ramp(t, 41.0, 41.95)));
        return {
          eye, look: c.look, roll: c.roll, fade, dialog: say.at(t), dim: t >= 32 && t < 60 ? 0.25 * smooth(ramp(t, 32, 36)) : 0,
          world: { state: { telefoneToca: (t >= 0.8 && t < 13.2) || (t >= 60 && t < 65), hora: 5.83, doors: { 'porta-escritorio': 1 } }, on: ['escritorio-teto'] },
        };
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c49-toca', desc: 'Cena 49: o aparelho de longe, na mesa do escritório: o telefone toca e treme, de madrugada; sem texto', pieces: [{ src: 60.0, d: 4.6 }] },
  { name: 'c50-atende', desc: 'Cena 50: a mão no fone, de perto, levanta o aparelho; sem texto', pieces: [{ src: 70.0, d: 5.0 }] },
  { name: 'c51-voz', desc: 'Cena 51: o vidro escuro do monitor do computador e, no canto, a mão com o fone ao ouvido; a caixa do telefone diz a frase', pieces: [{ src: 75.0, d: 5.0 }],
    say: [{ t: 0.5, who: 'Telefone', text: 'Não saia da loja.', seed: TH, hold: 1.6 }] },
  { name: 'c52-minha-voz', desc: 'Cena 52: o aparelho de perto, baixo, sobre a mesa; o pensamento curto', pieces: [{ src: 80.0, d: 3.0 }],
    say: [{ t: 0.2, who: '', text: 'É a minha voz.', seed: TH, hold: 0.8 }] },
  { name: 'c53-minutos', desc: 'Cena 53: o fone desce; o zumbido da fluorescente e a porta para a loja; pensamento', pieces: [{ src: 32.0, d: 6.9 }],
    say: [{ t: 0.6, who: '', text: 'Faltam minutos. Eu preciso sair.', seed: TH, hold: 1.6 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'telefone', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
