// Cutscene 2, "gerente": the manager hands over the vest and the torch, points at the task board and at the
// calendar of four weeks, says the line and leaves by car. The manager is built here with buildCustomer and a
// look of his own (a man of 55, polo shirt, glasses). First person, 50 s. The label of the box is only "Gerente".
import { track, bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS, withSegments } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { pumpCar, camPoint, toCam, makeVest, makeTorch } from './stagecraft.js';

const D = 60;
const views = {
  entrada: [0, 8, 'Você entra pela porta de vidro, o sino toca; o gerente espera ao lado do balcão e se vira'],
  colete: [8, 18, 'O gerente entrega o colete e a lanterna, e as suas mãos os pegam'],
  quadro: [18, 29, 'No escritório, o gerente aponta o quadro de tarefas na parede'],
  calendario: [29, 40, 'O calendário com as quatro semanas; o gerente diz a frase e "meta é meta"'],
  saida: [40, 50, 'Ele sai pela porta, entra no carro e vai embora; você fica sozinho na loja'],
  ligacao: [50, 60, 'O telefone do escritório toca e o gerente conduz o começo por telefone: "Primeiro, abre o caixa"'],
};
const EYE = 1.68;

// Where the manager stands, as a function of time: [t, x, z, yaw, walk 0..1]; yaw 0 faces +z.
const PI = Math.PI;
const PATH = track([
  { t: 0, eye: [9.8, 0, 6.9], look: [0, 0, 0] }, { t: 17.9, eye: [9.8, 0, 6.9], look: [0, 0, 0] },
  { t: 18.0, eye: [7.9, 0, 14.0], look: [0, 0, 0] }, { t: 39.9, eye: [7.9, 0, 14.0], look: [0, 0, 0] },
  { t: 40.0, eye: [8.4, 0, 14.0], look: [0, 0, 0] },
]);
// the leaving walk: office -> the door of the office (5, 12) -> the store -> the front door (9, 3) -> the car at pump 1
const LEAVE = [[40.2, 7.9, 14.0], [41.4, 5.0, 12.9], [41.9, 5.0, 11.0], [43.6, 8.6, 6.4], [44.6, 9.0, 3.2], [45.6, 7.6, -1.6], [46.8, 5.2, -4.2]];
function leavePos(t) {
  if (t <= LEAVE[0][0]) return { x: LEAVE[0][1], z: LEAVE[0][2], yaw: PI, walk: 0 };
  for (let i = 0; i + 1 < LEAVE.length; i++) {
    const a = LEAVE[i], b = LEAVE[i + 1];
    if (t < b[0]) { const u = (t - a[0]) / (b[0] - a[0]); return { x: lerp(a[1], b[1], u), z: lerp(a[2], b[2], u), yaw: Math.atan2(b[1] - a[1], b[2] - a[2]), walk: 1 }; }
  }
  const e = LEAVE[LEAVE.length - 1]; return { x: e[1], z: e[2], yaw: -PI / 2, walk: 0 };
}

const say = dialogue([
  { t: 2.6, who: 'Gerente', text: 'Chegou na hora, rapaz. Hoje você aprende o posto.', seed: BABBLE_SEEDS.gerente, hold: 1.0 },
  { t: 9.6, who: 'Gerente', text: 'Colete e lanterna. A pilha nova é por sua conta.', seed: BABBLE_SEEDS.gerente, hold: 1.2 },
  { t: 19.4, who: 'Gerente', text: 'Aqui o quadro de tarefas. O que não está feito, você faz.', seed: BABBLE_SEEDS.gerente, hold: 1.4 },
  { t: 30.0, who: 'Gerente', text: 'São quatro semanas até a mudança.', seed: BABBLE_SEEDS.gerente, hold: 0.8 },
  { t: 33.2, who: 'Gerente', text: 'Até a mudança, é seis por um. Nem um dia a Mais.', seed: BABBLE_SEEDS.gerente, hold: 0.6 },
  { t: 37.6, who: 'Gerente', text: 'Meta é meta.', seed: BABBLE_SEEDS.gerente, hold: 1.2 },
  { t: 55.6, who: 'Telefone', text: 'Boa noite. Primeiro, abre o caixa.', seed: BABBLE_SEEDS.gerente, hold: 1.4 },
]);

const KEYS = [
  { t: 0.0, eye: [9.0, EYE, 3.6], look: [9.5, 1.5, 7.0] },
  { t: 3.0, eye: [9.0, EYE, 4.9], look: [9.7, 1.55, 6.9] },
  { t: 7.97, eye: [9.0, EYE, 5.0], look: [9.8, 1.55, 6.9], ease: 'ss' },
  { t: 8.0, eye: [9.0, EYE, 5.2], look: [9.7, 1.3, 6.9] },
  { t: 12.0, eye: [9.0, EYE, 5.2], look: [9.75, 1.3, 6.9], ease: 'ss' },
  { t: 17.97, eye: [9.0, EYE, 5.2], look: [9.8, 1.5, 6.9] },
  { t: 18.0, eye: [8.0, EYE, 14.9], look: [6.9, 1.5, 12.2] },
  { t: 22.0, eye: [7.8, EYE, 14.7], look: [6.8, 1.5, 12.2], ease: 'ss' },
  { t: 28.97, eye: [7.7, EYE, 14.7], look: [6.8, 1.5, 12.2] },
  { t: 29.0, eye: [7.5, EYE, 14.8], look: [8.0, 1.5, 12.1] },
  { t: 33.0, eye: [7.4, EYE, 14.5], look: [8.1, 1.5, 12.1], ease: 'ss' },
  { t: 39.97, eye: [7.4, EYE, 14.4], look: [8.1, 1.55, 12.1] },
  { t: 40.0, eye: [10.2, EYE, 6.4], look: [8.7, 1.4, 3.0] },
  { t: 43.0, eye: [10.2, EYE, 6.4], look: [8.8, 1.4, 2.2], ease: 'ss' },
  { t: 46.5, eye: [10.0, EYE, 6.2], look: [3.5, 1.2, -4.8] },
  { t: 49.97, eye: [10.0, EYE, 6.2], look: [9.0, 1.6, 2.0] },
  { t: 50.0, eye: [5.0, EYE, 16.0], look: [6.2, 1.1, 18.7] },
  { t: 54.0, eye: [5.6, EYE, 16.9], look: [6.35, 0.95, 18.7], ease: 'ss' },
  { t: 60.0, eye: [5.7, EYE, 17.0], look: [6.35, 1.0, 18.7] },
  // source ranges after the end, used only by the windows of scenes 16 and 17: his face close, then the calendar close
  // scene 15, the handover from close; scene 16, the calendar whole from the west; scene 17, his finger on the calendar
  { t: 79.95, eye: [9.2, 1.55, 5.7], look: [9.9, 1.25, 6.9] }, { t: 80.0, eye: [9.2, 1.55, 5.7], look: [9.9, 1.25, 6.9] }, { t: 83.97, eye: [9.3, 1.5, 5.6], look: [9.9, 1.2, 6.9], ease: 'ss' },
  { t: 89.95, eye: [5.0, 1.62, 13.3], look: [8.3, 1.55, 12.1] }, { t: 90.0, eye: [5.0, 1.62, 13.3], look: [8.3, 1.55, 12.1] }, { t: 95.6, eye: [5.2, 1.62, 13.1], look: [8.3, 1.55, 12.1], ease: 'ss' },
  { t: 99.95, eye: [8.1, 1.55, 13.1], look: [8.3, 1.5, 12.1] }, { t: 100.0, eye: [8.1, 1.55, 13.1], look: [8.3, 1.5, 12.1] }, { t: 106.2, eye: [8.15, 1.55, 13.0], look: [8.3, 1.5, 12.1], ease: 'ss' },
  // scene 16, a fixed frame: the manager beside the calendar of four weeks, the calendar whole from the first instant to the last
  { t: 129.95, eye: [8.0, 1.6, 13.8], look: [7.95, 1.5, 12.1] }, { t: 130.0, eye: [8.0, 1.6, 13.8], look: [7.95, 1.5, 12.1] }, { t: 138.8, eye: [8.05, 1.62, 14.2], look: [7.95, 1.5, 12.1], ease: 'ss' },
  // the vertical cut of scene 15 (low, close): his face and chest, the vest and the torch, the board
  { t: 199.95, eye: [9.8, 1.3, 5.6], look: [9.8, 1.25, 6.9] }, { t: 200.0, eye: [9.8, 1.3, 5.6], look: [9.8, 1.25, 6.9] }, { t: 203.17, eye: [9.8, 1.3, 5.7], look: [9.8, 1.25, 6.9] }, { t: 203.19, eye: [9.8, 1.3, 5.7], look: [9.8, 1.25, 6.9] },
  { t: 209.95, eye: [9.5, 1.2, 5.9], look: [9.85, 1.2, 6.7] }, { t: 210.0, eye: [9.5, 1.2, 5.9], look: [9.85, 1.2, 6.7] }, { t: 213.17, eye: [9.55, 1.2, 5.85], look: [9.85, 1.2, 6.7] }, { t: 213.19, eye: [9.55, 1.2, 5.85], look: [9.85, 1.2, 6.7] },
  { t: 219.95, eye: [5.0, 1.45, 14.0], look: [6.9, 1.4, 12.9] }, { t: 220.0, eye: [5.0, 1.45, 14.0], look: [6.9, 1.4, 12.9] }, { t: 223.57, eye: [5.1, 1.45, 13.9], look: [6.9, 1.4, 12.9] }, { t: 223.59, eye: [5.1, 1.45, 13.9], look: [6.9, 1.4, 12.9] },
  { t: 60.95, eye: [7.5, 1.62, 14.4], look: [6.75, 1.62, 13.5] }, { t: 61.0, eye: [7.5, 1.62, 14.4], look: [6.75, 1.62, 13.5] }, { t: 66.97, eye: [7.35, 1.62, 14.3], look: [6.72, 1.62, 13.5], ease: 'ss' },
  { t: 67.0, eye: [7.9, 1.62, 13.25], look: [8.3, 1.5, 12.1] }, { t: 73.5, eye: [8.0, 1.62, 13.1], look: [8.3, 1.5, 12.1], ease: 'ss' },
];
const cam = track(KEYS);
const clampA = (a) => Math.max(-1.0, Math.min(1.0, a));

const BASE = {
  name: 'gerente', duration: D, views,
  anchors: { gerente: 'O gerente, de frente', quadro: 'O quadro de tarefas do escritório', calendario: 'O calendário de quatro semanas', porta: 'A porta de vidro da loja' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.7 } },
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.4 } },
    ...footfalls(0.3, 3.0, 1.9, { gain: 0.5 }, 'passo_azulejo'),
    { t: 0.2, name: 'porta_sino' },
    { t: 10.6, name: 'nota', opts: { gain: 0.6 } }, { t: 11.2, name: 'lanterna_clique' },
    ...[[40.6, 'passo_piso'], [41.0, 'passo_piso'], [41.5, 'passo_azulejo'], [42.0, 'passo_azulejo'], [42.6, 'passo_azulejo'], [43.2, 'passo_azulejo'], [43.8, 'passo_azulejo'], [44.4, 'passo_azulejo'], [45.0, 'passo_asfalto'], [45.7, 'passo_asfalto'], [46.3, 'passo_asfalto']].map(([t, name]) => ({ t, name, opts: { gain: 0.6 } })),
    { t: 44.5, name: 'porta_abre' }, { t: 44.9, name: 'porta_sino' },
    { t: 47.0, name: 'porta_fecha' }, { t: 47.6, name: 'motor_carro', opts: { dur: 5, gain: 0.8 } },
    { t: 50.6, name: 'telefone_toca', opts: { dur: 3.6, gain: 0.9, pos: [6.35, 1, 18.7] } }, { t: 54.4, name: 'telefone_atende', opts: { pos: [6.35, 1, 18.7] } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const am = buildCustomer(r, {
      categoria: 'comum', roupa: 'polo', seed: 55, id: 'gerente',
      look: { female: false, height: 1.72, build: 'mid', hairStyle: 'short', hair: '#8c8a86', beard: 'none', skin: '#d9b48f', shirt: '#c8c0a8', pants: '#4a4036' },
      acessorios: ['oculos'],
    }, { seed: 55 });
    g.add(am.root);
    const vest = makeVest(r), torch = makeTorch(r); g.add(vest, torch);
    // his car, parked at pump 1 from before the scene, leaving at 47.6 s
    const pc = pumpCar(r, W, 1, { tIn: -60, tOut: 47.6, seed: 3, fuel: 'comum', driver: false, lights: false });
    g.add(pc.car.root);
    const J = am.joints;
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { gerente: () => [9.8, 1.6, 6.9], quadro: () => W.p('quadroTarefas', 1.5), calendario: () => [8.3, 1.5, 12.1], porta: () => W.p('porta-loja', 1.2) },
      pose(tReal, ambient) {
        const t = tReal >= 80 && tReal < 90 ? 9.0 + (tReal - 80) : tReal >= 200 && tReal < 203.2 ? 0.3 + (tReal - 200) : tReal >= 210 && tReal < 213.2 ? 9.0 + (tReal - 210) : tReal >= 220 && tReal < 223.6 ? 20.8 + (tReal - 220) : tReal; // the close handover plays the handover of 9 s on; the vertical cut plays the opening, the handover and the board from 200, 210 and 220
        const { rig } = hands;
        const sway = Math.sin(t * 1.4);
        let eyeBase = cam(tReal);
        const walkIn = t < 3.0 ? 1 : 0, b = bob(t, walkIn * 0.9);
        const eye = [eyeBase.eye[0] + b[0] * 0.3, eyeBase.eye[1] + b[1], eyeBase.eye[2]];
        // ---- the manager
        am.root.visible = true;
        let pos = [9.8, 0, 6.9], yaw = PI, walk = 0, pose = 'parado', head = 0;
        const facing = (x, z) => Math.atan2(eye[0] - x, eye[2] - z), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
        if (t < 18) yaw = facing(pos[0], pos[2]);
        else if (t < 29) { pos = [6.3, 0, 13.4]; yaw = Math.atan2(7.2 - pos[0], 12.1 - pos[2]); pose = t >= 21.0 && t < 28 ? 'apontando' : 'parado'; head = clampA(wrap(facing(pos[0], pos[2]) - yaw)); }
        else if (t < 40) { pos = [6.7, 0, 13.5]; yaw = Math.atan2(8.3 - pos[0], 12.1 - pos[2]); pose = t >= 30.6 && t < 38.0 ? 'apontando' : 'parado'; head = clampA(wrap(facing(pos[0], pos[2]) - yaw)); }
        else if (t >= 60) { pos = [6.7, 0, 13.5]; yaw = Math.atan2(8.3 - pos[0], 12.1 - pos[2]); pose = t >= 100 ? 'apontando' : 'parado'; if (t >= 100) pos = [7.3, 0, 13.7]; if (t >= 130) { pos = [7.55, 0, 12.65]; yaw = Math.atan2(8.3 - pos[0], 12.1 - pos[2]); pose = 'apontando'; head = clampA(wrap(facing(pos[0], pos[2]) - yaw)); } head = clampA(wrap(facing(pos[0], pos[2]) - yaw)); }
        else { const p = leavePos(t); pos = [p.x, 0, p.z]; yaw = p.yaw; walk = p.walk; }
        am.root.position.set(pos[0], 0, pos[2]); am.root.rotation.y = yaw;
        am.update(t, walk > 0 ? { andando: 1, fase: t * 6.8 } : { pose, falando: say.at(t) !== null, olhar: head });
        // the handover: both arms forward (9.4 to 12 s), the objects travel from his hands to ours
        const give = smooth(ramp(t, 8.6, 9.6)) * (1 - smooth(ramp(t, 12.0, 12.8)));
        if (t >= 8 && t < 13) { J.shoulderR.rotation.x = -1.2 * give; J.shoulderL.rotation.x = -1.2 * give; J.elbowR.rotation.x = -0.5 * give; J.elbowL.rotation.x = -0.5 * give; }
        const own = (p) => camPoint(T, eye, eyeBase.look, p);
        const handOver = smooth(ramp(t, 10.0, 11.8));
        const vestV = vest.position, torchV = torch.position;
        vest.visible = torch.visible = t >= 3 && t < 45;
        const fromHand = new T.Vector3(pos[0] - Math.sin(yaw) * -0.0, 1.0, pos[2]).add(new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.5));
        if (t < 10.0) { vestV.copy(fromHand).add(new T.Vector3(0.12, 0.0, 0)); torchV.copy(fromHand).add(new T.Vector3(-0.12, 0.05, 0)); }
        else {
          const vTo = own([-0.2, -0.36, -0.46]), tTo = own([0.2, -0.3, -0.5]);
          vestV.copy(fromHand).lerp(vTo, handOver); torchV.copy(fromHand).lerp(tTo, handOver);
        }
        vest.rotation.set(0.2, yaw + 0.3, 0.1); torch.rotation.set(0.1, Math.atan2(eyeBase.look[0] - eye[0], eyeBase.look[2] - eye[2]), 0);
        if (t >= 12) { // held low in our own hands after the handover
          vest.visible = t < 40; torch.visible = t < 40;
        }
        // ---- our hands
        rig.hang(sway * (walkIn ? 2 : 1));
        if (t >= 9.6 && t < 13.5) {
          const u = smooth(ramp(t, 9.6, 10.6)) * (1 - smooth(ramp(t, 12.6, 13.4)));
          rig.reach('right', [lerp(0.2, 0.18, u), lerp(-0.4, -0.3, u), lerp(-0.34, -0.5, u)]);
          rig.reach('left', [lerp(-0.22, -0.18, u), lerp(-0.4, -0.34, u), lerp(-0.34, -0.46, u)]);
        }
        // ---- the car (pump 1)
        pc.pose(t);
        const outside = t >= 44.5;
        pc.car.setLights(t >= 47.2);
        void outside;
        const open = smooth(ramp(t, 44.2, 44.9)) * (1 - smooth(ramp(t, 46.2, 47.0)));
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.5)), smooth(ramp(t, 59.2, 59.95)) * (t >= 50 && t < 60 ? 1 : 0));
        if ((t >= 50 && t < 60) || (t >= 90 && t < 100)) am.root.visible = false;
        if (t >= 54.2 && t < 58.6) { const u = smooth(ramp(t, 54.2, 55.0)) * (1 - smooth(ramp(t, 58.0, 58.6))); const tg = [0.25, 0.1, -0.5].map((v, i) => i === 0 ? v : v); const ph = toCam(T, eye, eyeBase.look, [6.35, 0.95, 18.7]); rig.reach('right', ph.map((v, i) => lerp([0.22, -0.4, -0.34][i], v, u))); void tg; }
        return {
          eye, look: eyeBase.look, roll: eyeBase.roll + b[2], fade, dialog: say.at(t),
          world: { state: { doors: { 'porta-loja': open }, sino: ambient - (t - (t < 20 ? 0.2 : 44.9)), hora: 0.2, telefoneToca: t >= 50.6 && t < 54.2 }, on: ['escritorio-teto'] },
        };
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c15-entrega-v', desc: 'Cena 15, vertical: o gerente de perto e de baixo, o colete e a lanterna nas mãos, o quadro de tarefas; as três caixas', pieces: [{ src: 200.0, d: 3.2 }, { src: 210.0, d: 3.2 }, { src: 220.0, d: 3.6 }],
    say: [{ t: 0.1, who: 'Gerente', text: 'Chegou na hora, rapaz. Hoje você aprende o posto.', seed: BABBLE_SEEDS.gerente, hold: 0.1 }, { t: 3.3, who: 'Gerente', text: 'Colete e lanterna. A pilha nova é por sua conta.', seed: BABBLE_SEEDS.gerente, hold: 0.1 }, { t: 6.5, who: 'Gerente', text: 'Aqui o quadro de tarefas. O que não está feito, você faz.', seed: BABBLE_SEEDS.gerente, hold: 0.3 }] },
  { name: 'c15-entrega', desc: 'Cena 15: o gerente espera ao lado do balcão, entrega o colete e a lanterna de perto e aponta o quadro de tarefas', pieces: [{ src: 0.3, d: 3.2 }, { src: 80.0, d: 3.2 }, { src: 20.8, d: 3.6 }],
    say: [{ t: 0.1, who: 'Gerente', text: 'Chegou na hora, rapaz. Hoje você aprende o posto.', seed: BABBLE_SEEDS.gerente, hold: 0.1 }, { t: 3.3, who: 'Gerente', text: 'Colete e lanterna. A pilha nova é por sua conta.', seed: BABBLE_SEEDS.gerente, hold: 0.1 }, { t: 6.5, who: 'Gerente', text: 'Aqui o quadro de tarefas. O que não está feito, você faz.', seed: BABBLE_SEEDS.gerente, hold: 0.3 }] },
  { name: 'c16-semanas', desc: 'Cena 16: o gerente ao lado do calendário de quatro semanas, que aparece inteiro e legível do começo ao fim; ele diz que faltam quatro semanas', pieces: [{ src: 130.0, d: 8.8 }],
    say: [{ t: 0.6, who: 'Gerente', text: 'São quatro semanas até a mudança.', seed: BABBLE_SEEDS.gerente, hold: 1.0 }] },
  { name: 'c17-escala', desc: 'Cena 17: o dedo do gerente no calendário, bem de perto, e a frase da escala', pieces: [{ src: 100.0, d: 6.2 }],
    say: [{ t: 0.5, who: 'Gerente', text: 'Até a mudança, é seis por um. Nem um dia a Mais.', seed: BABBLE_SEEDS.gerente, hold: 1.2 }] },
  { name: 'c18-meta', desc: 'Cena 18: o gerente, de frente, na loja acesa: "Meta é meta."', pieces: [{ src: 3.0, d: 3.0 }],
    say: [{ t: 0.2, who: 'Gerente', text: 'Meta é meta.', seed: BABBLE_SEEDS.gerente, hold: 1.0 }] },
  { name: 'c19-saida', desc: 'Cena 19: ele sai pela porta, entra no carro e vai embora; sem texto', pieces: [{ src: 44.2, d: 4.0 }] },
  { name: 'c20-telefone', desc: 'Cena 20: o telefone do escritório toca e o gerente conduz o começo por telefone', pieces: [{ src: 50.3, d: 8.2 }],
    say: [{ t: 5.0, who: 'Telefone', text: 'Boa noite. Primeiro, abre o caixa.', seed: BABBLE_SEEDS.gerente, hold: 0.8 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'gerente', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
