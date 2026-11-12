// Film-only reel "treino-aula": the training hall, lesson by lesson, in the order the instructor
// (the long-armed creature `mestre`) gives them: he comes in, the guard, the dodges, where to hit
// (forehead, chin, temple), what a heavy blow does, the credits, the shop and the bandage, the
// item switch, the terminal and the card. First person, gloves on (the training is where you get
// them). The game plays its own tutorial; this reel exists to be filmed (src/film.js), so it is not
// in the list of cutscenes the game plays. Scene: scenes/treino.js.
//
// The instructor is posed here: the creature's own states ('andar', 'guarda', 'bote') plus a few
// overrides on top (a bow at the spine, a crouch, a nod) and a two-bone solve that puts each of his
// wrists on a point of the world (his hands touch your foot, your waist, your elbow; they hold the chips).
// Everything is a function of the time.
import { buildScene } from '../scenes/treino.js';
import { buildCreature } from '../models/creatures.js';
import { reel, bob, playerArms, defaultBlocks, ramp, smooth, lerp, clamp } from './common.js';

const P = [0, 1.65, 1.0];                  // where you stand for the lessons (looking toward +z, the instructor)
const DUMMY_EYE = [-1.7, 1.6, -1.5];       // in front of the dummy
const DUMMY_HEAD = [-2.0, 1.62, -2.2];
const yawTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);

// the three punches, as a hand path in camera space (u from 0 to 1: out, then back)
const PUNCH = {
  jab: { side: 'right', from: [0.17, -0.13, -0.5], to: [0.02, 0.04, -0.64] },
  upper: { side: 'left', from: [-0.12, -0.38, -0.42], to: [-0.04, 0.08, -0.52] },
  hook: { side: 'right', from: [0.46, -0.08, -0.3], to: [-0.04, 0.0, -0.56] },
};
const out = (u) => (u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.55));

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const stand = (x = 0.4, z = 4.1) => ({ x, z, yaw: Math.PI });
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
// a path from the camera to the terminal, used by the walk (caminhoTerminal) and its last position by treino-fim
const WALK_FROM = [0.6, 1.6], WALK_TO = [-7.5, -4.8];
const walkAt = (s) => [lerp(WALK_FROM[0], WALK_TO[0], s), lerp(WALK_FROM[1], WALK_TO[1], s)];

const R = reel([
  S('entra', 5, 'A porta do salão: uma criatura magra e nervosa, de braços longos, entra e anda na sua direção', [{ t: 0, eye: [0, 1.65, 1.0], look: [0, 1.5, 7] }, { t: 5, eye: [0, 1.65, 1.0], look: [0.3, 1.45, 4.4] }],
    (l, o) => { o.rig.hang(0); return { door: smooth(ramp(l, 0, 1.0)), ins: { x: lerp(0.0, 0.4, ramp(l, 0.2, 4.6)), z: lerp(7.3, 4.4, smooth(ramp(l, 0.2, 4.6))), yaw: Math.PI, walk: l < 4.6 } }; }),
  S('maos', 4, 'As mãos dele passam dos joelhos: braços compridos demais, de quatro dedos enrolados em ataduras velhas, pendurados ao lado do corpo', [{ t: 0, eye: [0.2, 1.6, 1.0], look: [0.4, 1.45, 4.4] }, { t: 2, eye: [0.25, 1.15, 1.2], look: [0.4, 1.35, 4.4] }, { t: 4, eye: [0.3, 0.9, 1.5], look: [0.4, 1.3, 4.4] }],
    (l, o) => { o.rig.hang(0); return { door: 1, ins: stand(), ik: { R: [0.72, 0.85, 3.95], L: [0.08, 0.85, 3.95] } }; }),
  S('rosto', 4, 'Close do rosto da criatura, de frente: a cabeça oval enchendo o quadro, os olhos fundos com um brilho âmbar, as sobrancelhas, o nariz e a boca fina, calmo e quase humano', [{ t: 0, eye: [0.4, 2.2, 3.0], look: [0.4, 2.3, 4.1] }, { t: 4, eye: [0.4, 2.2, 3.0], look: [0.4, 2.3, 4.1] }],
    (l, o) => { o.rig.hang(0); return { door: 1, headCam: { side: lerp(0.6, 0.3, smooth(l / 4)), drop: lerp(-0.38, -0.2, smooth(l / 4)), dist: lerp(0.95, 0.78, smooth(l / 4)), fovK: 0.8 }, ins: { ...stand(), yaw: Math.PI, lean: Math.sin(l * 0.8) * 0.02, look: Math.sin(l * 0.9) * 0.14 } }; }),
  S('instrutor', 5, 'A sala aberta, vista de outro canto: o instrutor de pé junto de um boneco de treino, calado, só a cabeça se mexe', [{ t: 0, eye: [0.6, 1.6, 1.9], look: [-2.5, 1.2, -1.5] }, { t: 5, eye: [-0.1, 1.5, 1.3], look: [-2.6, 1.2, -1.5] }],
    (l, o) => { o.low(); return { door: 1, ins: { x: -3.0, z: -1.0, yaw: yawTo([-3.0, 0, -1.0], [-0.3, 0, 1.2]), lean: 0, look: Math.sin(l * 0.7) * 0.45 } }; }),
  // the three corrections, first person: your boots on the marks, then his hands on your hips, then on your elbow
  S('pe', 3, 'Ele corrige o seu pé: você olha para baixo, para as marcas de fita no tatame', [{ t: 0, eye: [0, 1.55, 0.7], look: [0.05, 0.55, 2.25] }, { t: 3, eye: [0, 1.55, 0.72], look: [0.0, 0.75, 2.3] }],
    (l, o) => {
      const touch = smooth(ramp(l, 0.2, 1.1)), twist = smooth(ramp(l, 1.3, 2.5));
      o.low(); o.shoes(true, 0.35 * twist);
      return { door: 1, fovK: 1.2, ins: { x: 0.0, z: 2.95, yaw: Math.PI, bow: lerp(0.7, 0.95, touch), crouch: 1.0, look: 0 }, ik: { R: [0.26 - 0.08 * twist, lerp(0.7, 0.3, touch), lerp(2.7, 2.3, touch)], L: [-0.3, 0.45, 2.45] } };
    }),
  S('cintura', 3, 'Corrige a cintura: a visão desce até o seu próprio tronco e a postura endireita', [{ t: 0, eye: [0, 1.5, 1.0], look: [0.0, 1.55, 3.0] }, { t: 3, eye: [0, 1.66, 1.0], look: [0.0, 2.0, 3.0] }],
    (l, o) => {
      const k = smooth(ramp(l, 0.3, 2.4)), sw = Math.sin(l * 1.8);
      o.rig.reach('right', [0.42, -0.5, -0.3]); o.rig.reach('left', [-0.42, -0.5, -0.3]);
      return { door: 1, fovK: 1.15, roll: 0.06 * sw, ins: { x: 0.0, z: 3.0, yaw: Math.PI, bow: lerp(0.65, 0.4, k), crouch: 0.2, look: 0 }, ik: { R: [0.32 + 0.04 * sw, 1.2, 1.62], L: [-0.32 + 0.04 * sw, 1.2, 1.62] } };
    }),
  S('cotovelo', 3, 'Corrige o ângulo do cotovelo: os seus braços sobem na guarda, e ele ajusta sem tocar', [{ t: 0, eye: [0, 1.62, 0.95], look: [0.0, 1.95, 3.0] }, { t: 3, eye: [0, 1.62, 1.15], look: [0.0, 1.9, 3.0] }],
    (l, o) => {
      const k = smooth(ramp(l, 0.5, 2.3));
      o.rig.reach('right', [lerp(0.3, 0.14, k), lerp(-0.2, -0.13, k), -0.5]); o.rig.reach('left', [-0.17, -0.13, -0.5]);
      // his left hand (to your right) pushes the elbow of your right arm in
      const g = (a, b) => lerp(a, b, k);
      return { door: 1, fovK: 1.1, ins: { x: 0.0, z: 3.0, yaw: Math.PI, bow: 0.35, crouch: 0.15 }, ik: { L: [g(-0.42, -0.24), g(1.3, 1.42), 1.95], R: [0.4, 1.0, 2.2] } };
    }),
  S('mostraGuarda', 4, 'Ele mostra a guarda: se agacha um pouco, ergue os dois braços diante do queixo e abaixa a cabeça', [{ t: 0, eye: P, look: [0.35, 1.9, 2.9] }, { t: 4, eye: [0, 1.6, 1.1], look: [0.35, 1.8, 2.9] }],
    (l, o) => ({ door: 1, ins: { x: 0.35, z: 2.9, yaw: Math.PI, lean: 0.3 * smooth(ramp(l, 0.4, 1.5)), arms: { guard: l > 0.4 } } })),
  S('treinaGuarda', 5, 'Você treina a guarda: os punhos sobem diante do queixo e a visão fica estreita', [{ t: 0, eye: P, look: [0.5, 1.5, 4.0] }, { t: 5, eye: [0, 1.6, 1.1], look: [0.5, 1.45, 4.0] }],
    (l, o) => { o.fists(smooth(ramp(l, 0.3, 1.4))); const x = lerp(1.3, 1.45, ramp(l, 0, 5)); return { door: 1, ins: { x, z: 3.7, yaw: yawTo([x, 0, 3.7], P), look: Math.sin(l) * 0.2, arms: { guard: true } }, label: l > 1.4 ? 'GUARDA' : null }; }),
  S('esquivaLado', 3, 'A primeira esquiva: o instrutor dá um bote lento com o braço comprido na sua direção e você sai da linha, inclinando a cabeça', [{ t: 0, eye: P, look: [0.5, 1.5, 4.0] }, { t: 0.9, eye: P, look: [0.5, 1.5, 4.0] }, { t: 1.5, eye: [-0.55, 1.6, 1.0], look: [0.5, 1.5, 4.0], roll: 0.25 }, { t: 3, eye: P, look: [0.5, 1.5, 4.0] }],
    (l, o) => { o.fists(1); const k = (l / 1.5) % 1; return { door: 1, ins: { x: 1.45, z: 3.7, yaw: yawTo([1.45, 0, 3.7], P), arms: { bote: k } }, label: l > 1.1 ? 'ESQUIVA' : null }; }),
  S('esquivaBaixo', 3, 'A segunda esquiva: o braço passa por cima e a cabeça desce junto com o corpo', [{ t: 0, eye: P, look: [0.5, 1.6, 3.0] }, { t: 1.0, eye: P, look: [0.5, 1.6, 3.0] }, { t: 1.5, eye: [0, 1.0, 1.1], look: [0.5, 1.7, 3.0] }, { t: 3, eye: P, look: [0.5, 1.6, 3.0] }],
    (l, o) => { o.rig.guard(0); return { door: 1, ins: { x: 0.5, z: 3.4, yaw: Math.PI + 0.5 * Math.sin(Math.PI * clamp((l - 0.7) / 1.3)), lean: 0.2 } }; }),
  S('testa', 3, 'O jab na testa do boneco de treino, com a zona pintada à vista', [{ t: 0, eye: DUMMY_EYE, look: DUMMY_HEAD }, { t: 3, eye: [-1.75, 1.6, -1.5], look: DUMMY_HEAD }],
    (l, o) => { const u = clamp((l - 0.8) / 0.8); o.punch('jab', u); return { door: 1, ins: { x: -0.6, z: -3.2, yaw: yawTo([-0.6, 0, -3.2], DUMMY_EYE), lean: 0.05 }, label: l > 0.9 ? 'TESTA' : null, dummy: out(clamp((l - 1.15) / 0.9)) }; }),
  S('queixo', 3, 'O uppercut no queixo do boneco, de baixo para cima', [{ t: 0, eye: DUMMY_EYE, look: [-2.0, 1.5, -2.2] }, { t: 3, eye: [-1.75, 1.5, -1.5], look: [-2.0, 1.5, -2.2] }],
    (l, o) => { const u = clamp((l - 0.8) / 0.8); o.punch('upper', u); return { door: 1, ins: { x: -0.6, z: -3.2, yaw: yawTo([-0.6, 0, -3.2], DUMMY_EYE) }, label: l > 0.9 ? 'QUEIXO' : null, dummy: out(clamp((l - 1.15) / 0.9)) }; }),
  S('tempora', 3, 'O gancho na têmpora do boneco, vindo de lado', [{ t: 0, eye: [-1.3, 1.6, -1.6], look: DUMMY_HEAD }, { t: 3, eye: [-1.35, 1.6, -1.6], look: DUMMY_HEAD }],
    (l, o) => { const u = clamp((l - 0.8) / 0.9); o.punch('hook', u); return { door: 1, ins: { x: -0.6, z: -3.2, yaw: yawTo([-0.6, 0, -3.2], DUMMY_EYE) }, label: l > 0.9 ? 'TÊMPORA' : null, dummy: out(clamp((l - 1.15) / 0.9)) }; }),
  S('golpeForte', 7, 'Ele mostra o que um golpe forte faz: o mundo gira, a visão afunila e as mãos demoram a obedecer', [{ t: 0, eye: P, look: [0.5, 1.5, 4.2] }, { t: 7, eye: [0, 1.6, 1.1], look: [0.5, 1.4, 4.2] }],
    (l, o) => {
      const hit = l > 1.3, k = hit ? Math.exp(-(l - 1.3) * 0.2) : 0;
      o.rig.reach('right', [0.17 + Math.sin(l * 1.7 - 0.6) * 0.1 * k, -0.28 + Math.cos(l * 1.3) * 0.08 * k, -0.5]); o.rig.reach('left', [-0.17 + Math.sin(l * 1.1) * 0.1 * k, -0.28 + Math.sin(l * 1.9) * 0.06 * k, -0.5]);
      // the blow lands on you: he strikes (twice), the picture swings from side to side and rolls, and he moves in it
      const x = 0.5 + 0.55 * Math.sin(l * 0.9) * (hit ? 1 : 0) - 0.3 * smooth(ramp(l, 3.5, 6));
      return { door: 1, roll: 0.3 * Math.sin(l * 1.25) * k, ins: { x, z: 3.9 + 0.35 * Math.sin(l * 0.7) * k, yaw: yawTo([x, 0, 3.9], P), arms: { bote: hit ? ((l - 1.0) / 1.7) % 1 : clamp((l - 0.9) / 1.6) } }, daze: hit ? 0.5 + 0.9 * k : 0, blur: hit ? 0.35 * k : 0, sway: k * 1.4 };
    }),
  S('acerta', 3, 'Você acerta o boneco e o instrutor, ao fundo, assente com a cabeça', [{ t: 0, eye: [-1.5, 1.6, -1.1], look: [-2.0, 1.45, -3.0] }, { t: 3, eye: [-1.5, 1.6, -1.1], look: [-1.9, 1.45, -3.1] }],
    (l, o) => { o.punch('jab', clamp((l - 0.6) / 0.8)); return { door: 1, ins: { x: -1.0, z: -4.2, yaw: yawTo([-1.0, 0, -4.2], [-1.5, 0, -1.1]), nod: 0.5 * (0.5 + 0.5 * Math.sin(l * 5)) }, dummy: out(clamp((l - 0.95) / 0.9)) }; }),
  S('erra', 3, 'Você erra: o punho passa ao lado do boneco e o instrutor repete a lição, sem pressa', [{ t: 0, eye: [-1.5, 1.6, -1.1], look: [-1.9, 1.45, -3.1] }, { t: 3, eye: [-1.45, 1.6, -1.1], look: [-1.9, 1.45, -3.1] }],
    (l, o) => { o.punch('jab', clamp((l - 0.6) / 0.8), 0.35); return { door: 1, ins: { x: -1.0, z: -4.2, yaw: yawTo([-1.0, 0, -4.2], [-1.5, 0, -1.1]), nod: 0.5 * (0.5 + 0.5 * Math.sin(l * 4 + 1)), look: 0.25 * Math.sin(l * 1.7) } }; }),
  S('creditos', 5, 'Ele estende a mão cheia de fichas: cento e cinquenta créditos, presente da casa', [{ t: 0, eye: P, look: [0.3, 1.55, 3.0] }, { t: 5, eye: [0, 1.62, 1.1], look: [0.25, 1.5, 2.8] }],
    (l, o) => {
      const k = smooth(ramp(l, 0.6, 1.9)), w = [lerp(0.55, 0.45, k), lerp(1.2, 1.5, k), lerp(2.9, 2.1, k)];
      o.low(); o.chipsAt([0, 0, 0], 0.8, smooth(ramp(l, 0.4, 1.0)) > 0, 'R', 0);
      return { door: 1, ins: { x: 0.35, z: 3.5, yaw: Math.PI, bow: 0.2 + 0.15 * k, crouch: 0.15 }, ik: { R: w }, hud: { credits: Math.round(150 * smooth(ramp(l, 2.2, 3.4))), item: '' } };
    }),
  S('loja', 5, 'A prateleira da loja e a tela: taser, spray de pimenta e bandagem, com os preços', [{ t: 0, eye: [5.7, 1.45, -0.7], look: [7.7, 1.25, -1.5] }, { t: 2.2, eye: [6.0, 1.45, -1.2], look: [7.7, 1.25, -1.5] }, { t: 5, eye: [6.0, 1.45, -1.2], look: [7.7, 1.25, -1.5] }],
    (l, o) => { o.low(); return { door: 1, ins: { x: 3.4, z: 0.6, yaw: -1.2 }, shop: l > 2.2 ? { credits: 150, sel: l < 3.0 ? 0 : l < 3.8 ? 1 : 2 } : null }; }),
  S('compra', 4, 'Você compra a bandagem por oitenta: os créditos descem de cento e cinquenta a setenta', [{ t: 0, eye: [5.9, 1.6, -0.6], look: [7.7, 1.2, -2.0] }, { t: 4, eye: [5.9, 1.6, -0.6], look: [7.7, 1.2, -2.0] }],
    (l) => ({ door: 1, ins: { x: 3.4, z: 0.6, yaw: -1.2 }, shop: { credits: l < 1.5 ? 150 : 70, sel: 2, msg: l > 1.5 ? 'BANDAGEM COMPRADO' : '' } })),
  S('usaBandagem', 5, 'Você usa a bandagem num boneco de treino: a mão enrola a faixa e o item some da lista', [{ t: 0, eye: [-1.5, 1.55, -1.45], look: [-2.0, 1.32, -2.2] }, { t: 5, eye: [-1.5, 1.5, -1.45], look: [-2.0, 1.3, -2.2] }],
    (l, o) => { o.bandage(l); return { door: 1, fovK: 1.15, ins: { x: -5.5, z: -0.8, yaw: yawTo([-5.5, 0, -0.8], DUMMY_EYE), lean: 0 }, hud: { credits: 70, item: l < 3.6 ? 'BANDAGEM x1' : '' } }; }),
  S('trocaItem', 4, 'A troca de item: a lista de itens na tela e o aviso de qual botão troca', [{ t: 0, eye: [-1.5, 1.6, -0.7], look: [-2.0, 1.5, -2.2] }, { t: 4, eye: [-1.5, 1.6, -0.7], look: [-2.0, 1.5, -2.2] }],
    (l, o) => { o.rig.guard(Math.sin(l * 1.5)); return { door: 1, ins: { x: -0.6, z: -3.2, yaw: yawTo([-0.6, 0, -3.2], DUMMY_EYE) }, hud: { credits: 70, item: Math.floor(l * 1.5) % 2 ? '< BANDAGEM x1 >' : 'BANDAGEM x1' }, label: 'TROCAR ITEM' }; }),
  S('aviso', 5, 'Ele se vira para ir embora e solta o único aviso: aqui ninguém liga para regra', [{ t: 0, eye: [0, 1.6, 1.0], look: [0.5, 1.45, 3.6] }, { t: 5, eye: [0.2, 1.6, 3.7], look: [0.4, 1.4, 7.0] }],
    (l, o) => {
      o.low();
      const turn = smooth(ramp(l, 0.7, 2.0)), go = smooth(ramp(l, 1.8, 5));
      return { door: smooth(ramp(l, 3.0, 4.0)), ins: { x: lerp(0.5, 0.3, go), z: lerp(3.8, 6.9, go), yaw: Math.PI - Math.PI * turn, walk: l > 1.8, arms: { guard: l < 0.9 }, look: 0 } };
    }),
  S('gentileza', 5, 'Você olha as próprias mãos, as fichas, o saldo de setenta: a primeira gentileza em muito tempo', [{ t: 0, eye: P, look: [0, 1.6, 3.0] }, { t: 5, eye: [0, 1.65, 1.02], look: [0, 1.57, 3.0] }],
    (l, o) => {
      // the instructor tips the chips into your cupped gloves, steps back, and the gloves close on them
      const give = smooth(ramp(l, 1.0, 2.2)), back = smooth(ramp(l, 2.6, 3.4)), close = smooth(ramp(l, 3.7, 4.5));
      const gx = lerp(0.1, 0.035, close), gy = lerp(-0.03, 0.0, close);
      o.rig.reach('right', [gx, gy, -0.5]); o.rig.reach('left', [-gx - 0.01, gy - 0.01, -0.5]);
      const offer = [0.1, 1.4, 2.2], hold = [0.0, 1.5, 1.8];
      const wr = mix(mix(mix([0.35, 1.5, 2.6], offer, smooth(ramp(l, 0, 1.0))), hold, give), [0.4, 1.4, 2.7], back);
      const inHand = [wr[0], wr[1] + 0.05, wr[2] - 0.3], inGloves = [0.0, 1.57, 1.5];
      const drop = smooth(ramp(l, 2.0, 2.6));
      o.chipsAt(inGloves, lerp(0.7, 0.45, close) * (l < 0.2 ? smooth(l / 0.2) : 1), true, 'R', drop);
      return { door: 1, ins: { x: 0.05, z: 3.3, yaw: Math.PI, bow: lerp(0.3, 0.1, back), crouch: 0.1 }, ik: { R: [wr[0] + 0.02, wr[1], wr[2]] }, hud: { credits: 70, item: '' } };
    }),
  S('caminhoTerminal', 5, 'O instrutor te leva pelo salão até o terminal de salvar, no canto', [{ t: 0, eye: [0.9, 1.65, 1.9], look: [-1.5, 1.4, -0.5] }, { t: 5, eye: [-0.9, 1.65, 0.5], look: [-3.9, 1.35, -2.7] }],
    (l, o) => {
      o.rig.hang(Math.sin(l * 2));
      const s = lerp(0.22, 0.5, smooth(ramp(l, 0, 5))), p = walkAt(s), d = [WALK_TO[0] - WALK_FROM[0], WALK_TO[1] - WALK_FROM[1]], n = Math.hypot(d[0], d[1]);
      const rt = [d[1] / n, -d[0] / n];   // to the left of the walking direction (the terminal stays visible on his right)
      return { door: 1, walking: true, ins: { x: p[0] + rt[0] * 1.5, z: p[1] + rt[1] * 1.5, yaw: Math.atan2(d[0], d[1]), walk: true } };
    }),
  S('cartaoCursor', 6, 'A tela do cartão de memória e o cursor passando pelos blocos, sem abrir nenhum', [{ t: 0, eye: [-5.2, 1.55, -3.6], look: [-7.1, 1.1, -4.8] }, { t: 6, eye: [-5.3, 1.55, -3.7], look: [-7.1, 1.1, -4.8] }],
    (l, o) => { o.rig.hang(0); return { door: 1, ins: { x: -3.4, z: -2.6, yaw: yawTo([-3.4, 0, -2.6], [-7, 0, -4.8]) }, card: { blocks: o.blocks(), saving: false, sel: l < 2 ? 0 : l < 3.2 ? 1 : l < 4.4 ? 5 : 1 } }; }),
]);

/** Where the instructor stands when the walk ends (treino-fim shows him beside the terminal). */
export const GUIDE_END = (() => {
  const s = 0.75, p = walkAt(s), d = [WALK_TO[0] - WALK_FROM[0], WALK_TO[1] - WALK_FROM[1]], n = Math.hypot(d[0], d[1]);
  return { x: p[0] + 1.5 * d[1] / n, z: p[1] - 1.5 * d[0] / n, yaw: Math.atan2(d[0], d[1]) };
})();

export default {
  name: 'treino-aula', prefix: 'treino', filmOnly: true, duration: R.duration, cue: 'treino', views: R.views,
  anchors: { instrutor: 'O instrutor, a criatura de braços longos', boneco: 'O boneco de treino com as zonas pintadas', prateleira: 'A prateleira da loja' },
  sfx: [],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const sc = buildScene(r, { seed: ctx.seed });
    const an = buildCreature(r, 'mestre', { seed: 3, scale: 1.0 });
    const holder = new T.Group(); holder.add(an.root); sc.group.add(holder);
    const { arms, rig } = playerArms(r, { bare: false });
    const dm = sc.parts.bonecoUm;
    // credit chips: a stack of discs with a dark band, in the instructor's hand and then in yours
    const chips = new T.Group();
    const chipA = r.mat('#ffd23a', { emissive: 0.9, fogged: 0.4 }), chipB = r.mat('#e08a1e', { emissive: 0.8, fogged: 0.4 }), chipEdge = r.mat('#7a4a12', { emissive: 0.4, fogged: 0.4 });
    for (let i = 0; i < 7; i++) {
      const d = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.032, 10), i % 2 ? chipB : chipA); d.position.set(Math.sin(i * 2.1) * 0.012, i * 0.034, Math.cos(i * 1.7) * 0.012); chips.add(d);
      const e = new T.Mesh(new T.CylinderGeometry(0.088, 0.088, 0.008, 10), chipEdge); e.position.set(d.position.x, d.position.y, d.position.z); chips.add(e);
    }
    sc.group.add(chips); chips.visible = false;
    const band = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.07, 8), r.mat('#e8e0c8', { map: 'cloth' })); arms.root.add(band); band.visible = false;
    const wrap = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.07, 8, 1, true), r.mat('#e8e0c8', { map: 'cloth', side: T.DoubleSide })); wrap.visible = false; sc.group.add(wrap);
    // your boots on the taped marks (the pe lesson)
    const shoes = new T.Group(); sc.group.add(shoes); shoes.visible = false;
    const leather = r.mat('#3a3028'), sole = r.mat('#d8d0c0');
    const boots = [[-0.22, 2.2, 0.2], [0.22, 2.0, -0.15]].map(([x, z, ry]) => {
      // a boot: flat sole, a tall shaft at the ankle, a heel block and a narrower toe cap
      const g = new T.Group(); g.position.set(x, 0.085, z); g.rotation.y = ry; g.scale.setScalar(1.5); shoes.add(g);
      const part = (geo, m, px, py, pz) => { const q = new T.Mesh(geo, m); q.position.set(px, py, pz); g.add(q); return q; };
      part(new T.BoxGeometry(0.13, 0.03, 0.36), sole, 0, 0.015, 0.06);
      part(new T.BoxGeometry(0.12, 0.09, 0.18), leather, 0, 0.075, -0.03);
      part(new T.BoxGeometry(0.085, 0.07, 0.15), leather, 0, 0.065, 0.14);
      part(new T.CylinderGeometry(0.058, 0.066, 0.26, 7), leather, 0, 0.2, -0.07);
      part(new T.BoxGeometry(0.13, 0.012, 0.04), sole, 0, 0.032, -0.1);
      return g;
    });
    let blocks = null;
    // two-bone solve: put a wrist of the instructor on a world point (the hand hangs on from the forearm's direction)
    // the loose bandage ends that hang from his wrists read as floating white scraps next to his hands: out of the hall
    for (const n of ['wristL', 'wristR']) for (const c of an.joints[n].children) if (c.isGroup) c.visible = false;
    const J = an.joints, V = (x, y, z) => new T.Vector3(x, y, z), DOWN = V(0, -1, 0);
    function ikArm(n, tw) {
      const sh = J['shoulder' + n], el = J['elbow' + n], wr = J['wrist' + n], sp = J.spine, s = n === 'L' ? 1 : -1;
      const U = Math.abs(el.position.y), F = Math.abs(wr.position.y), S0 = sh.position;
      const d = sp.worldToLocal(V(...tw)).sub(S0); let L = d.length(); L = Math.max(Math.abs(U - F) + 0.02, Math.min(U + F - 0.005, L)); d.normalize();
      const a = (U * U - F * F + L * L) / (2 * L), h = Math.sqrt(Math.max(0, U * U - a * a));
      const pole = V(s * 0.2, -0.25, -1); pole.addScaledVector(d, -pole.dot(d)).normalize();
      const E = d.clone().multiplyScalar(a).addScaledVector(pole, h);
      sh.quaternion.setFromUnitVectors(DOWN, E.clone().normalize());
      const f = d.clone().multiplyScalar(L).sub(E).normalize().applyQuaternion(sh.quaternion.clone().invert());
      el.quaternion.setFromUnitVectors(DOWN, f);
    }
    const cs = { chips: null, shoes: null };
    const o = {
      rig,
      low() { rig.reach('right', [0.3, -0.55, -0.3]); rig.reach('left', [-0.3, -0.55, -0.3]); },
      fists(k) { // the guard of the lessons: fists up, low enough to leave his face and chest clear
        rig.reach('right', [lerp(0.2, 0.15, k), lerp(-0.36, -0.2, k), -0.5]); rig.reach('left', [lerp(-0.2, -0.15, k), lerp(-0.36, -0.2, k), -0.5]);
      },
      punch(kind, u, off = 0) {
        const p = PUNCH[kind], e = out(u), other = p.side === 'right' ? 'left' : 'right';
        rig.reach(p.side, [lerp(p.from[0], p.to[0] + off, e), lerp(p.from[1], p.to[1], e), lerp(p.from[2], p.to[2], e)]);
        rig.reach(other, other === 'right' ? [0.17, -0.13, -0.5] : [-0.17, -0.13, -0.5]);
      },
      chipsAt(pos, k, on, hand = null, mixk = 0) { cs.chips = { pos, k, on, hand, mixk }; },
      shoes(on, twist) { cs.shoes = { on, twist }; },
      bandage(l) {
        const reachU = smooth(ramp(l, 0.4, 1.4)), wrapU = smooth(ramp(l, 1.4, 3.0));
        // your right hand takes the roll to the dummy's arm (at its side, never through its body) and winds it
        const tgt = [lerp(0.17, -0.3, reachU), lerp(-0.13, -0.3, reachU) + Math.sin(l * 9) * 0.02 * wrapU, lerp(-0.5, -0.66, reachU)];
        rig.reach('right', tgt); rig.reach('left', [-0.4, -0.45, -0.3]);
        band.visible = l < 3.2; band.position.set(tgt[0], tgt[1] + 0.02, tgt[2]); band.rotation.z = l * 6;
        wrap.visible = l > 1.8; wrap.position.set(-1.7, 1.06, -2.2); wrap.scale.set(1 + 0.15 * wrapU, 1 + 2 * wrapU, 1 + 0.15 * wrapU);
      },
      high(k) { // the guard: fists up in front of the chin, forearms in view
        rig.reach('right', [lerp(0.17, 0.1, k), lerp(-0.13, 0.0, k), -0.5]); rig.reach('left', [lerp(-0.17, -0.1, k), lerp(-0.13, 0.0, k), -0.5]);
      },
      blocks: () => blocks ?? ctx.blocks ?? defaultBlocks(),
    };
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { instrutor: () => [holder.position.x, 1.7, holder.position.z], boneco: () => DUMMY_HEAD, prateleira: () => sc.anchors.prateleira },
      pose(t, ambient) {
        sc.update(ambient);
        const { seg, local, cam } = R.at(t);
        cs.chips = null; cs.shoes = null;
        band.visible = false; wrap.visible = false; rig.guard(0);
        const f = seg.act(local, o) ?? {};
        const ins = f.ins ?? stand();
        const A = ins.arms ?? {};
        sc.parts.openDoor(f.door ?? 1);
        // the creature's own ready states: 'guarda' (fists before the face) and 'bote' (the left arm strikes: k 0 to 0.5 out, 0.5 to 1 back)
        const estado = A.bote !== undefined || A.guard ? 'guarda' : ins.walk ? 'andar' : undefined;
        an.update(ambient, estado);
        if (ins.look) J.neck.rotation.y += ins.look;
        if (ins.nod) J.head.rotation.x += ins.nod;
        const bow = ins.bow ?? 0, c = ins.crouch ?? 0;
        if (bow) { J.spine.rotation.x += bow; J.neck.rotation.x -= bow * 0.55; J.head.rotation.x -= bow * 0.3; } // he looks at you, not at the floor
        if (c) {
          for (const n of ['L', 'R']) { J['hip' + n].rotation.x = -c; J['knee' + n].rotation.x = 2 * c; J['ankle' + n].rotation.x = -c; }
          J.body.position.y = -(0.93 * (1 - Math.cos(c)));
        }
        holder.position.set(ins.x, 0, ins.z); holder.rotation.set(ins.lean ?? 0, ins.yaw, 0); holder.scale.setScalar(1.2);
        holder.updateMatrixWorld(true);
        if (A.bote !== undefined) { // the slow strike: his left wrist goes from the guard straight toward you and back
          const e = Math.sin(Math.PI * clamp(A.bote)), sh = J.shoulderL.getWorldPosition(new T.Vector3()), wr0 = J.wristL.getWorldPosition(new T.Vector3());
          const dir = ins.yaw, tip = [sh.x + Math.sin(dir) * 1.1 - Math.cos(dir) * 0.55, sh.y - 0.12, sh.z + Math.cos(dir) * 1.1 + Math.sin(dir) * 0.55]; // across his front, so the blow reads from your side
          f.ik = { ...(f.ik ?? {}), L: [lerp(wr0.x, tip[0], e), lerp(wr0.y, tip[1], e), lerp(wr0.z, tip[2], e)] };
        }
        if (f.ik) { for (const n of ['L', 'R']) if (f.ik[n]) ikArm(n, f.ik[n]); holder.updateMatrixWorld(true); }
        dm.rotation.x = -0.2 * (f.dummy ?? 0);
        // chips
        const cp = cs.chips;
        chips.visible = Boolean(cp?.on);
        if (cp?.hand) { // the palm opens upward, fingers forward, and the stack lies on it
          const wr = J['wrist' + cp.hand], el = J['elbow' + cp.hand], wp = wr.getWorldPosition(V(0, 0, 0)), ep = el.getWorldPosition(V(0, 0, 0));
          const fw = wp.sub(ep); fw.y = 0; if (fw.lengthSq() < 1e-4) fw.set(0, 0, -1); fw.normalize();
          const yA = fw.clone().negate(), zA = V(0, 1, 0), xA = new T.Vector3().crossVectors(yA, zA);
          const qw = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xA, yA, zA)), qp = el.getWorldQuaternion(new T.Quaternion());
          wr.quaternion.copy(qp.invert().multiply(qw)); holder.updateMatrixWorld(true);
        }
        if (cp) { if (cp.hand) { const hw = J['wrist' + cp.hand].localToWorld(V(0, -0.06, 0.035)); hw.y += 0.02; chips.position.set(lerp(hw.x, cp.pos[0], cp.mixk), lerp(hw.y, cp.pos[1], cp.mixk), lerp(hw.z, cp.pos[2], cp.mixk)); } else chips.position.set(...cp.pos); chips.scale.setScalar(cp.k); chips.rotation.set(0, 0.6, 0); }
        // boots
        shoes.visible = Boolean(cs.shoes?.on);
        if (cs.shoes) { boots[0].rotation.y = 0.2 + cs.shoes.twist * 0.4; boots[1].rotation.y = -0.15 - cs.shoes.twist; }
        // camera: a front close-up of the face placed from where the head really is, or the keyed track
        let eye = [cam.eye[0], cam.eye[1], cam.eye[2]], look = cam.look, fovK = f.fovK ?? 1;
        if (f.headCam) {
          const hp = J.head.getWorldPosition(new T.Vector3()), hc = { x: hp.x, y: hp.y + 0.19, z: hp.z }, h = f.headCam;
          eye = [hc.x + h.side, hc.y + h.drop, hc.z - h.dist]; look = [hc.x, hc.y + 0.02, hc.z]; fovK = h.fovK;
        }
        const w = f.walking ? 1 : 0, b = bob(t, w * 0.8, 1.8), sw = f.sway ?? 0;
        eye = [eye[0] + b[0] * 0.3 + Math.sin(ambient * 2.3) * 0.05 * sw, eye[1] + b[1], eye[2]];
        look = [look[0] + Math.sin(ambient * 1.9) * 0.5 * sw, look[1] + Math.sin(ambient * 1.4 + 1) * 0.25 * sw, look[2]];
        return { eye, look, fovK, roll: (cam.roll ?? 0) + (f.roll ?? 0) + b[2] + Math.sin(ambient * 1.6) * 0.1 * sw, daze: f.daze ?? 0, blur: f.blur ?? 0, hud: f.hud ?? null, label: f.label ?? null, shop: f.shop ?? null, card: f.card ?? null };
      },
    };
  },
};
void clamp;
