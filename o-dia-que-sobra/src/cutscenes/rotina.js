// Scripted shift "rotina" (part 3 of the video): the game played with nobody, the first night, fixed seed.
// The first car, the right nozzle, the panel and the display, the till and the change, the office computer
// (the login screen with two accounts, a provisional drawing until the game has its own), the restock with the
// torch (the ceiling cameras pass by, 1 s each, never pointed out) and the bathroom. First person, 95 s.
// What is forced here is only the order of the night; every figure is the real model of the game.
import { track, bob, footfalls, ramp, smooth, lerp, clamp, dialogue, BABBLE_SEEDS, withSegments } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { buildProp } from '../models/props.js';
import { pumpCar, camPoint, toCam, makeTorch } from './stagecraft.js';

const D = 117;
const SHEET_LIST = { time: '00:21', week: 1, day: 1, wallet: '120,00', tasks: [{ text: 'Abrir o caixa', done: true }, { text: 'Atender o carro da bomba 2', done: false }, { text: 'Limpar o banheiro M', done: false }, { text: 'Repor a prateleira 7', done: false }] };
const SHEET_PLACAR = { time: '06:00', week: 1, day: 1, wallet: '134,50', tasks: [{ text: 'Abrir o caixa', done: true }, { text: 'Limpar o banheiro M', done: true }, { text: 'Atender o carro da bomba 2', done: true }], perf: [['Atendimentos', 4], ['Vendas', 3], ['Abastec.', 2], ['Tarefas', 3], ['Pendentes', 0], ['Erros', 0]] };
const views = {
  carro: [0, 11, 'Sob a cobertura, de relance as câmeras de teto das pontas; o primeiro carro entra e para na bomba 2; a prancheta mostra a tarefa; o cliente pede'],
  bico: [11, 23, 'O adesivo da tampa do tanque, a mão pega o bico da cor certa e o põe no tanque'],
  painel: [23, 32, 'O painel da bomba: as teclas do valor e o botão de ligar; a bomba começa sozinha'],
  mostrador: [32, 41, 'O mostrador corre e a bomba desliga sozinha no valor'],
  caixa: [41, 54, 'No balcão: o caixa, a gaveta e o troco entregue ao cliente'],
  computador: [54, 63, 'No escritório, o computador acorda na tela de entrada com duas contas (provisório até a fase 4)'],
  estoque: [63, 73, 'Com a lanterna no estoque, uma caixa numerada vai para as mãos'],
  servico: [73, 85, 'O carrinho, a porta para a área de serviço e a lanterna passando pela porta do depósito'],
  banheiro: [85, 95, 'O banheiro: o rodo e a mancha que some'],
  lixo: [95, 105, 'Com o saco de lixo e a lanterna: a área de serviço, a porta trancada do depósito pelo visor e o contêiner dos fundos'],
  cansaco: [105, 110, 'No escritório, as mãos abertas diante dos olhos: o cansaço da noite; um pensamento'],
  remedio: [110, 117, 'O armário do escritório e o frasco branco sem nome'],
};
const EYE = 1.68;
const PUMP = 2, PX = 8.5;

const TH = BABBLE_SEEDS.heitor;
const say = dialogue([
  { t: 9.0, who: 'Cliente', text: 'Completa a comum.', seed: BABBLE_SEEDS.cliente, hold: 1.2 },
  { t: 29.4, who: '', text: 'Bico certo. Valor. Pronto, deixa correr.', seed: TH, hold: 0.6 },
  { t: 34.4, who: '', text: 'Errou o troco, reclamam. Errou o bico, reclamam.', seed: TH, hold: 0.6 },
  { t: 38.0, who: '', text: 'Uma boa noite é uma noite sem nada.', seed: TH, hold: 0.6 },
  { t: 43.6, who: 'Cliente', text: 'Cinquenta e quatro, certo?', seed: 61, hold: 0.8 },
  { t: 48.6, who: '', text: 'Troco nota por nota. Eu que dou.', seed: TH, hold: 1.0 },
  { t: 105.4, who: '', text: 'O corpo aguenta Algumas semanas assim.', seed: TH, hold: 1.2 },
  { t: 100.0, who: '', text: 'Rápido. Sai logo daqui.', seed: TH, hold: 1.0 },
  { t: 90.6, who: '', text: 'O que eu deixo pela metade fica pela metade.', seed: TH, hold: 1.0 },
  { t: 111.0, who: '', text: 'Frasco branco, sem nome. Ajuda, mas deixa as mãos lentas.', seed: TH, hold: 1.4 },
]);

// ---- the camera, one stretch per view; a view ends on its own framing and the next starts on another
const KEYS = [
  // carro
  { t: 0.0, eye: [24.2, EYE, -3.8], look: [24.55, 3.85, -6.5] },
  { t: 1.79, eye: [24.3, EYE, -3.9], look: [24.55, 3.88, -6.5] },
  { t: 1.8, eye: [0.8, EYE, -3.8], look: [0.45, 3.85, -6.5] },
  { t: 3.59, eye: [0.7, EYE, -3.9], look: [0.45, 3.88, -6.5] },
  { t: 3.6, eye: [6.2, EYE, -6.3], look: [-3.0, 1.3, -3.2] },
  { t: 5.0, eye: [6.2, EYE, -6.3], look: [2.5, 1.2, -4.2], ease: 'ss' },
  { t: 8.4, eye: [6.2, EYE, -6.3], look: [9.9, 1.2, -5.3], ease: 'ss' },
  { t: 10.97, eye: [8.3, EYE, -6.3], look: [10.1, 1.3, -5.4] },
  // bico: the cap, the pump, the nozzle, the cap again
  { t: 11.0, eye: [8.3, 1.5, -6.9], look: [8.5, 0.98, -5.7] },
  { t: 14.0, eye: [8.4, 1.5, -6.9], look: [8.5, 0.98, -5.7], ease: 'ss' },
  { t: 15.2, eye: [8.5, 1.5, -6.9], look: [8.4, 1.1, -7.6], ease: 'ss' },
  { t: 17.2, eye: [8.5, 1.5, -6.9], look: [8.4, 1.1, -7.6], ease: 'ss' },
  { t: 18.4, eye: [8.5, 1.5, -6.9], look: [8.5, 0.98, -5.7], ease: 'ss' },
  { t: 22.97, eye: [8.5, 1.5, -6.9], look: [8.5, 1.0, -5.7] },
  // painel
  { t: 23.0, eye: [8.8, 1.6, -6.85], look: [8.75, 1.6, -7.6] },
  { t: 31.97, eye: [8.7, 1.6, -6.75], look: [8.55, 1.6, -7.6] },
  // mostrador
  { t: 32.0, eye: [8.0, 1.62, -6.6], look: [8.3, 1.58, -7.6] },
  { t: 40.97, eye: [8.15, 1.62, -6.6], look: [8.3, 1.58, -7.6] },
  // caixa: first a look up at the ceiling camera over the door, then the till
  { t: 41.0, eye: [14.0, EYE, 5.4], look: [15.55, 2.88, 3.45] },
  { t: 43.0, eye: [14.1, EYE, 5.5], look: [15.55, 2.88, 3.45], ease: 'ss' },
  { t: 44.0, eye: [13.3, EYE, 9.35], look: [13.6, 1.1, 8.0], ease: 'ss' },
  { t: 49.0, eye: [13.5, EYE, 9.3], look: [13.5, 1.1, 8.0] },
  { t: 53.97, eye: [13.4, EYE, 9.3], look: [13.2, 1.3, 7.4] },
  // computador
  { t: 54.0, eye: [4.0, EYE, 15.4], look: [5.2, 1.1, 18.8] },
  { t: 55.2, eye: [4.9, 1.45, 17.1], look: [4.9, 1.0, 18.8], ease: 'ss' },
  { t: 60.8, eye: [4.9, 1.45, 17.1], look: [4.9, 1.0, 18.8], ease: 'ss' },
  { t: 62.97, eye: [5.1, 1.5, 16.7], look: [5.4, 1.0, 18.8] },
  // estoque
  { t: 63.0, eye: [13.0, EYE, 10.6], look: [13.0, 1.4, 12.5] },
  { t: 65.0, eye: [13.0, EYE, 12.9], look: [13.0, 1.4, 14.5], ease: 'ss' },
  { t: 66.0, eye: [13.0, EYE, 13.4], look: [16.4, 2.7, 12.3], ease: 'ss' },
  { t: 67.4, eye: [13.0, EYE, 13.6], look: [16.2, 2.6, 12.4] },
  { t: 68.4, eye: [12.2, EYE, 13.9], look: [10.3, 0.9, 13.9], ease: 'ss' },
  { t: 72.97, eye: [11.6, EYE, 13.9], look: [10.3, 0.8, 13.9] },
  // servico
  { t: 73.0, eye: [15.2, EYE, 13.6], look: [15.2, 0.9, 14.9] },
  { t: 76.0, eye: [15.6, EYE, 14.6], look: [17.0, 1.3, 16.0], ease: 'ss' },
  { t: 78.0, eye: [16.1, EYE, 15.7], look: [18.5, 1.5, 17.6] },
  { t: 80.5, eye: [17.9, EYE, 15.9], look: [18.8, 1.4, 18.6], ease: 'ss' },
  { t: 84.97, eye: [18.6, EYE, 15.9], look: [17.0, 1.3, 18.6] },
  // banheiro
  { t: 85.0, eye: [17.2, EYE, 5.2], look: [19.8, 1.4, 4.9] },
  { t: 87.5, eye: [17.5, EYE, 6.0], look: [18.6, 0.8, 7.0], ease: 'ss' },
  { t: 94.97, eye: [17.9, EYE, 6.0], look: [17.3, 0.6, 8.0] },
  // lixo: into the service area (cam5 ahead and above), along the locked door of the depot (its visor, cam7 inside), to the container
  { t: 95.0, eye: [17.3, EYE, 17.3], look: [17.35, 2.85, 19.65] },
  { t: 96.4, eye: [17.4, EYE, 17.3], look: [17.5, 2.7, 19.65], ease: 'ss' },
  { t: 97.5, eye: [18.6, EYE, 16.9], look: [19.8, 1.5, 18.3], ease: 'ss' },
  { t: 99.0, eye: [20.3, 1.5, 18.3], look: [23.65, 2.88, 14.35] },
  { t: 101.5, eye: [20.35, 1.5, 18.2], look: [23.65, 2.88, 14.35], ease: 'ss' },
  { t: 103.0, eye: [20.4, EYE, 19.4], look: [21.5, 1.0, 21.0] },
  { t: 104.97, eye: [21.0, EYE, 20.0], look: [21.5, 0.9, 21.3] },
  // c31 end: out of the back door with the bag, the torch on the container of the back yard (source range after the end)
  { t: 119.95, eye: [19.0, EYE, 18.8], look: [20.4, 1.2, 22.2] }, { t: 120.0, eye: [19.0, EYE, 18.8], look: [20.4, 1.2, 22.2] }, { t: 121.4, eye: [19.2, EYE, 20.6], look: [21.7, 1.2, 22.5], ease: 'ss' }, { t: 122.7, eye: [20.2, EYE, 21.4], look: [22.0, 1.0, 22.8] },
  // the vertical cut: the container of the back yard, close, the torch on it (330)
  { t: 329.95, eye: [18.6, 1.6, 20.8], look: [21.5, 0.7, 22.5] }, { t: 330.0, eye: [18.6, 1.6, 20.8], look: [21.5, 0.7, 22.5] }, { t: 332.4, eye: [18.9, 1.6, 21.0], look: [21.5, 0.7, 22.5] }, { t: 332.42, eye: [18.9, 1.6, 21.0], look: [21.5, 0.7, 22.5] },
  // the vertical cut: the open hands, centred (170)
  { t: 169.95, eye: [5.6, 1.5, 16.4], look: [5.6, 0.5, 17.0] }, { t: 170.0, eye: [5.6, 1.5, 16.4], look: [5.6, 0.5, 17.0] }, { t: 174.97, eye: [5.6, 1.48, 16.4], look: [5.6, 0.52, 17.0] }, { t: 174.99, eye: [5.6, 1.48, 16.4], look: [5.6, 0.52, 17.0] },
  // remedio: the cabinet of the office
  { t: 105.0, eye: [5.6, 1.5, 16.4], look: [5.6, 0.45, 17.0] },
  { t: 109.97, eye: [5.6, 1.48, 16.4], look: [5.6, 0.5, 17.0], ease: 'ss' },
  { t: 110.0, eye: [7.4, 1.55, 14.4], look: [8.65, 1.3, 13.5] },
  { t: 113.0, eye: [7.6, 1.5, 13.8], look: [8.65, 1.25, 13.4], ease: 'ss' },
  { t: 116.97, eye: [7.7, 1.5, 13.6], look: [8.65, 1.2, 13.4] },
];
const cam = track(KEYS);
const walking = (t) => (t < 4 ? 0 : 0) + ((t >= 85 && t < 87.4) || (t >= 63 && t < 65.2) || (t >= 67.5 && t < 68.4) || (t >= 73 && t < 79) || (t >= 95 && t < 99) || (t >= 102 && t < 104.5) ? 1 : 0);

const BASE = {
  name: 'rotina', duration: D, views,
  anchors: { bomba: 'A bomba 2 com o carro', mostrador: 'O mostrador da bomba', caixa: 'A registradora do balcão', computador: 'O computador do escritório', estoque: 'O estoque', banheiro: 'O banheiro masculino' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: 11, gain: 0.35 } },
    { t: 29.8, name: 'respiracao', opts: { dur: 3, gain: 0.3 } }, { t: 66, name: 'respiracao', opts: { dur: 7, gain: 0.5 } }, { t: 96, name: 'respiracao', opts: { dur: 6, gain: 0.7 } },
    { t: 0, name: 'rodovia', opts: { dur: 41, gain: 0.7 } },
    { t: 0, name: 'insetos', opts: { dur: 41, gain: 0.5 } },
    { t: 2.0, name: 'motor_carro', opts: { dur: 7, gain: 0.8, pos: [4, 1, -4.8] } },
    { t: 15.9, name: 'bico_tira', opts: { pos: [8.4, 1.1, -7.6] } },
    { t: 21.0, name: 'tampa_tanque', opts: { pos: [8.5, 1.0, -5.7] } }, { t: 21.6, name: 'bico_poe', opts: { pos: [8.5, 1.0, -5.7] } },
    ...[24.6, 25.4, 26.2, 27.0].map((t) => ({ t, name: 'tecla', opts: { pos: [8.86, 1.6, -7.6] } })),
    { t: 28.2, name: 'bomba_bip', opts: { pos: [8.86, 1.6, -7.6] } },
    { t: 28.5, name: 'bomba_corre', opts: { dur: 10.2, gain: 0.9, pos: [8.5, 1.0, -7.6] } },
    { t: 38.9, name: 'bomba_bip', opts: { pos: [8.3, 1.6, -7.6] } },
    { t: 41.0, name: 'fluorescente', opts: { dur: 22, gain: 0.7 } },
    { t: 45.0, name: 'caixa_bip', opts: { pos: [13.9, 1.2, 8.5] } }, { t: 46.2, name: 'gaveta_abre', opts: { pos: [13.9, 1.0, 8.5] } },
    { t: 47.2, name: 'nota', opts: { pos: [13.6, 1.1, 8.3] } }, { t: 47.7, name: 'moeda', opts: { pos: [13.6, 1.1, 8.3] } }, { t: 48.1, name: 'moeda', opts: { pos: [13.6, 1.1, 8.3] } },
    { t: 50.0, name: 'gaveta_abre', opts: { pos: [13.9, 1.0, 8.5], gain: 0.6 } },
    { t: 54.0, name: 'fluorescente', opts: { dur: 9, gain: 0.4 } },
    ...[59.4, 59.8, 60.2].map((t) => ({ t, name: 'tecla', opts: { gain: 0.8 } })), { t: 60.7, name: 'ui_ok' },
    { t: 63.0, name: 'fluorescente', opts: { dur: 32, gain: 0.5 } },
    ...footfalls(63.2, 65.0, 1.9, { gain: 0.5 }, 'passo_azulejo'), { t: 63.6, name: 'porta_abre', opts: { pos: [13, 1, 12] } },
    { t: 63.7, name: 'lanterna_clique' },
    ...footfalls(65.2, 66.0, 1.9, { gain: 0.5 }, 'passo_piso'),
    { t: 70.2, name: 'caixa_papelao', opts: { pos: [10.3, 1, 13.9] } },
    ...footfalls(73.2, 78.6, 1.9, { gain: 0.5 }, 'passo_piso'), { t: 75.0, name: 'carrinho', opts: { dur: 2.0, gain: 0.7 } },
    { t: 77.4, name: 'porta_abre', opts: { pos: [17, 1, 16] } },
    ...footfalls(85.2, 87.4, 1.9, { gain: 0.5 }, 'passo_azulejo'), { t: 85.8, name: 'porta_abre', opts: { pos: [18, 1, 3] } },
    { t: 88.5, name: 'rodo', opts: { dur: 5.5, gain: 0.8 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world(), P = W.posto;
    const g = new T.Group();
    // the first car: a hatch with its driver, to pump 2, parked at 8.4 s
    const pc = pumpCar(r, W, PUMP, { tPark: 8.4, seed: 21, fuel: 'comum', style: 'hatch', driver: true });
    pc.car.setLights(true);
    g.add(pc.car.root);
    // the customer at the till, and what is on the counter
    const cust = buildCustomer(r, { categoria: 'comum', roupa: 'enfermeira', acessorios: ['cracha', 'coque'] }, { seed: 12 });
    g.add(cust.root);
    const prodA = buildProp(r, 'produto', { seed: 3, tipo: 'refri' }), prodB = buildProp(r, 'produto', { seed: 4, tipo: 'biscoito' });
    const pa = prodA.root ?? prodA.group ?? prodA, pb = prodB.root ?? prodB.group ?? prodB;
    pa.position.set(12.5, 1.0, 8.3); pb.position.set(12.9, 1.0, 8.3); g.add(pa, pb);
    // held things
    const nozzle = buildProp(r, 'bico', { seed: 1, tipo: 'comum' }); const nz = nozzle.root ?? nozzle.group ?? nozzle; nz.visible = false; g.add(nz);
    const box = buildProp(r, 'caixa-estoque', { seed: 1, n: 7 }); const bx = box.root ?? box.group ?? box; bx.visible = false; g.add(bx);
    const mop = buildProp(r, 'rodo', { seed: 1 }); const mp = mop.root ?? mop.group ?? mop; mp.visible = false; g.add(mp);
    const note = new T.Mesh(new T.BoxGeometry(0.15, 0.004, 0.07), r.mat('#b4bc9a')); note.visible = false; g.add(note);
    const bagP = buildProp(r, 'saco-lixo', { seed: 1 }); const bag = bagP.root ?? bagP.group ?? bagP; bag.visible = false; g.add(bag);
    const torch = makeTorch(r); torch.visible = false; g.add(torch);
    const hasBox = (t) => t >= 70.0 && t < 85;
    const counting = (t) => (t < 28.5 ? 0 : 50 * smooth(ramp(t, 28.5, 38.9)));
    const fmt = (v) => v.toFixed(2).replace('.', ',');
    const typed = (t) => (t < 24.6 ? '0,00' : t < 25.4 ? '0,05' : t < 26.2 ? '0,50' : t < 27.0 ? '5,00' : '50,00');
    const KEYSEQ = [[24.6, '5'], [25.4, '0'], [26.2, '0'], [27.0, '0'], [28.2, 'ligar']];
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { bomba: () => W.p('carroBomba2', 1), mostrador: () => W.p('mostrador2'), caixa: () => W.p('caixa', 1), computador: () => W.p('computadorTela'), estoque: () => W.p('estoque', 1), banheiro: () => W.p('banheiro-m', 1) },
      pose(t, ambient) {
        const { rig } = hands;
        const FL = ctx.flags ?? {};
        const c = cam(t), w = walking(t), b = bob(t, w * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]];
        const here = (p) => toCam(T, eye, c.look, p);
        const state = pc.pose(t);
        // ---- the world's state for this moment
        let display = '', pressed = null, hideNozzle = null;
        if (t >= 23 && t < 28.4) display = typed(t);
        if (t >= 28.4 && t < 42) display = fmt(counting(t));
        const key = KEYSEQ.find(([k0]) => t >= k0 && t < k0 + 0.35);
        if (key) pressed = [PUMP, key[1]];
        const open = (id, a, b2) => smooth(ramp(t, a, b2));
        const doors = {
          'porta-estoque': open('', 63.2, 64.0) * (t < 73 ? 1 : 0), 'porta-estoque-servico': t >= 95 ? (t < 98 ? 1 : 0) : open('', 77.0, 78.0), 'porta-banheiro-m': open('', 85.6, 86.4),
          'porta-escritorio': t >= 54 && t < 62 ? 1 : 0, 'porta-fundos': (t >= 120 && t < 126) || (t >= 330 && t < 336) ? 1 : 0,
        };
        const nozzleHeld = t >= 16.0 && t < 20.2;
        if (t >= 16.0 && t < 40.0) hideNozzle = [PUMP, 'comum'];
        // ---- hands
        const sway = Math.sin(t * 1.4);
        rig.hang(sway * (w ? 2 : 1));
        bag.traverse((m) => { if (m.isMesh && m.material?.uniforms) { if (!m.userData.c0) m.userData.c0 = m.material.uniforms.uColor.value.clone(); if (t >= 330 || FL.vert) { m.material.uniforms.uColor.value.set('#8aa08a'); m.material.uniforms.uEmissive.value = 0.3; } else { m.material.uniforms.uColor.value.copy(m.userData.c0); m.material.uniforms.uEmissive.value = 0; } } });
        bag.visible = false; nz.visible = false; bx.visible = false; mp.visible = false; note.visible = false; torch.visible = false;
        const R = (p) => rig.reach('right', p);
        const L = (p) => rig.reach('left', p);
        // nozzle: out of the pump (15.2 to 17.2), to the cap (18.4 to 21.4), in the tank until the pump is done
        const capW = [8.5, 0.97, -5.78];
        if (t >= 15.4 && t < 40) {
          if (t < 17.2) {
            const u = smooth(ramp(t, 15.4, 16.2)) * (t < 16.4 ? 1 : 1);
            R(here([8.3, 1.13, -7.55]).map((v, i) => lerp([0.22, -0.4, -0.34][i], v, u)));
            if (t >= 16.0) { nz.visible = true; const p = camPoint(T, eye, c.look, [0.2, -0.3, -0.5]); nz.position.set(p.x, p.y - 0.1, p.z); nz.rotation.set(0, Math.atan2(c.look[0] - eye[0], c.look[2] - eye[2]), 0); }
          } else if (t < 21.2) {
            const u = smooth(ramp(t, 18.4, 20.8));
            const hold = camPoint(T, eye, c.look, [0.2, -0.3, -0.5]), tank = new T.Vector3(8.5, 0.92, -6.1);
            const p = hold.lerp(tank, u);
            R(here([p.x, p.y, p.z]));
            nz.visible = true; nz.position.set(p.x, p.y - 0.05, p.z); nz.rotation.set(0, 0, 0);
          } else if (t < 22.97) { nz.visible = true; nz.position.set(8.5, 0.86, -5.95); nz.rotation.set(0, 0, 0); R(here([8.5, 0.92, -6.3])); }
          else if (t < 40) { nz.visible = true; nz.position.set(8.5, 0.86, -5.95); nz.rotation.set(0, 0, 0); }
        }
        void nozzleHeld; void capW;
        // the keypad: the right hand goes to each key
        if (t >= 23.6 && t < 29.0) {
          const k = (KEYSEQ.find(([k0]) => t < k0 + 0.8) ?? KEYSEQ[KEYSEQ.length - 1])[1];
          const wp = P.pumps[PUMP].keypad?.worldPos?.(k);
          if (wp) { const u = smooth(ramp(t, 23.6, 24.3)) * (1 - smooth(ramp(t, 28.5, 29.0))); const target = here(wp); R(target.map((v, i) => lerp([0.22, -0.4, -0.34][i], v, u))); }
        }
        // the till: the right hand to the register, then the drawer, then the notes to the customer
        if (t >= 44.2 && t < 51.5) {
          const reg = [13.9, 1.15, 8.45], drawer = [13.9, 0.98, 8.8], out = [13.4, 1.25, 7.7];
          const u1 = smooth(ramp(t, 44.2, 45.0)), u2 = smooth(ramp(t, 46.0, 46.6)), u3 = smooth(ramp(t, 47.0, 47.8)), u4 = smooth(ramp(t, 49.4, 50.4));
          const stage = t < 46.0 ? reg : t < 47.0 ? drawer : out;
          const prev = t < 46.0 ? null : t < 47.0 ? reg : drawer;
          const p0 = prev ?? [13.9, 0.9, 9.3];
          const k = t < 46.0 ? u1 : t < 47.0 ? u2 : u3;
          const w3 = [0, 1, 2].map((i) => lerp(p0[i], stage[i], k));
          const away = 1 - u4;
          R(here(w3).map((v, i) => lerp([0.22, -0.4, -0.34][i], v, away)));
          if (t >= 47.0 && t < 50.5) { note.visible = true; const p = camPoint(T, eye, c.look, here(w3)); note.position.set(p.x, p.y, p.z); note.position.set(w3[0], w3[1] + 0.04, w3[2]); }
        }
        // the box in both hands (70 to 85 s); the torch in the right hand in the dark rooms
        if (hasBox(t)) {
          const k = smooth(ramp(t, 70.0, 71.0));
          const p = camPoint(T, eye, c.look, [lerp(0.0, 0.0, k), lerp(-0.7, -0.38, k), -0.62]);
          bx.visible = true; bx.position.set(p.x, p.y - 0.18, p.z); bx.rotation.set(0, Math.atan2(c.look[0] - eye[0], c.look[2] - eye[2]), 0);
          R([0.2, -0.32 + (1 - k) * -0.1, -0.5]); L([-0.2, -0.32 + (1 - k) * -0.1, -0.5]);
        }
        const dark = (t >= 63.6 && t < 85) || (t >= 95 && t < 105) || (t >= 120 && t < 126) || (t >= 330 && t < 336);
        let spot = null;
        if (dark) {
          const f = new T.Vector3(c.look[0] - eye[0], c.look[1] - eye[1], c.look[2] - eye[2]).normalize();
          const o = camPoint(T, eye, c.look, [0.18, -0.16, -0.25]);
          spot = { pos: [o.x, o.y, o.z], dir: [f.x, f.y, f.z], color: 0xf2e2b0, range: 14, cos: 0.88 };
          if (!hasBox(t)) { torch.visible = true; if (t >= 95) { bag.visible = true; const bp = camPoint(T, eye, c.look, t >= 330 || FL.vert ? [-0.12, -0.3, -0.7] : [-0.3, -0.3, -0.72]); bag.scale.setScalar(t >= 330 || FL.vert ? 0.5 : 0.8); bag.position.set(bp.x, bp.y - 0.22, bp.z); L([-0.2, -0.3, -0.45]); } torch.position.set(o.x, o.y, o.z); torch.rotation.set(0, Math.atan2(f.x, f.z), 0); const pitch = Math.asin(clamp(f.y, -1, 1)); torch.rotation.x = -pitch; R([0.2, -0.28, -0.42]); }
        }
        if ((t >= 105 && t < 110) || (t >= 170 && t < 175)) { const tc = t >= 170 ? t - 65 : t, yy = FL.vert ? 0.1 : -0.14, xx = FL.vert ? 0.1 : 0.12; const u = FL.vert ? 1 : smooth(ramp(tc, 104.7, 105.3)) * (1 - smooth(ramp(tc, 109.0, 109.8))); R([lerp(0.22, xx, u), lerp(-0.4, yy, u), lerp(-0.34, -0.45, u)]); L([lerp(-0.22, -xx, u), lerp(-0.4, yy, u), lerp(-0.34, -0.45, u)]); rig.curl('right', 0.0); rig.curl('left', 0.0); }
        // the mop and the stain in the bathroom
        let dirt = null;
        if (t >= 85) {
          const u = ramp(t, 88.0, 93.0);
          dirt = { 'mancha-m': 1 - smooth(u) };
          if (t >= 87.2 && t < 94.6) {
            mp.visible = true; const sw = Math.sin((t - 88) * 3.2) * 0.22;
            const p = camPoint(T, eye, c.look, [0.12 + sw, -0.55, -0.7]);
            mp.position.set(p.x, p.y + 0.0, p.z); mp.rotation.set(0.25, Math.atan2(c.look[0] - eye[0], c.look[2] - eye[2]) + 0.4 + sw, 0);
            R([0.15 + sw * 0.8, -0.34, -0.46]); L([-0.05 + sw * 0.6, -0.4, -0.42]);
          }
        }
        // ---- the person at the till
        cust.root.visible = t >= 41 && t < 54 && !FL.noCust;
        cust.root.position.set(13.3, 0, 7.35); cust.root.rotation.y = 0;
        cust.update(t, { pose: t >= 43.4 && t < 50.8 ? 'pagando' : 'parado', falando: say.at(t)?.who === 'Cliente' });
        pa.visible = pb.visible = t >= 41 && t < 54 && !FL.noCust;
        // ---- the screen of the office (provisional)
        let screen = null;
        if (t >= 55.4 && t < 60.7) screen = { kind: 'login', sel: t < 56.2 ? 0 : t < 59.4 ? 1 : 0 };
        // ---- the clipboard
        const sheet = t >= 0.8 && t < 5.2 ? { time: '00:21', week: 1, day: 1, wallet: '120,00', tasks: [{ text: 'Abrir o caixa', done: true }, { text: 'Atender o carro da bomba 2', done: false }, { text: 'Limpar o banheiro M', done: false }] } : null;
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.5)), smooth(ramp(t, 116.2, 116.95)) * (t < 118 ? 1 : 0));
        return {
          eye, look: c.look, roll: c.roll + b[2], fade, dialog: say.at(t), sheet, screen, daze: (t >= 105 && t < 110) || (t >= 170 && t < 175) ? 0.35 : 0,
          world: {
            state: { doors, gaveta: smooth(ramp(t, 46.0, 46.6)) * (1 - smooth(ramp(t, 49.8, 50.4))) * (t >= 41 && t < 54 ? 1 : 0), hora: FL.dawn ? 5.95 : t < 41 ? 0.35 : t < 63 ? 0.5 : 1.0 },
            displays: display ? { [PUMP]: display } : null, pressed, hideNozzle, spot, dirt, ambient: (t >= 63.6 && t < 105) || (t >= 120 && t < 126) || (t >= 330 && t < 336) ? (t >= 330 ? 0x8a8ea4 : 0x646878) : undefined, on: (t >= 54 && t < 63) || t >= 105 ? ['escritorio-teto'] : [], armario: smooth(ramp(t, 111, 112.2)), frasco: t >= 112,
          },
        };
        void state;
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'cansaco-v', desc: 'Cena 33, vertical: as mãos abertas diante dos olhos, centradas no quadro em pé; um pensamento', pieces: [{ src: 170.0, d: 5.0 }], flags: { vert: true }, say: [{ t: 0.6, who: '', text: 'O corpo aguenta Algumas semanas assim.', seed: TH, hold: 1.2 }] },
  { name: 'c12-estoque-fundos-v', desc: 'Vertical: a caixa numerada no estoque, depois o corte para os fundos: a cam5, o visor da porta do depósito (cam7), o saco de lixo e o contêiner', pieces: [{ src: 68.4, d: 2.6 }, { src: 95.0, d: 1.6 }, { src: 100.0, d: 1.4 }, { src: 330.0, d: 2.4 }], flags: { vert: true } },
  { name: 'c21-cobertura', desc: 'Cena 21: sob a cobertura, de relance as câmeras de teto das pontas (cam3, depois cam2); o primeiro carro chega; sem texto', pieces: [{ src: 0, d: 3.6 }, { src: 5.8, d: 2.9 }], sheet: false },
  { name: 'c22-carro', desc: 'Cena 22: o primeiro carro para na bomba 2 e o cliente pede', pieces: [{ src: 5.6, d: 7.7 }], sheet: false,
    say: [{ t: 3.4, who: 'Cliente', text: 'Completa a comum.', seed: BABBLE_SEEDS.cliente, hold: 1.4 }] },
  { name: 'c23-bico-valor', desc: 'Cena 23: o bico da cor certa no tanque, o valor digitado no painel e a bomba que abastece sozinha', pieces: [{ src: 15.0, d: 2.6 }, { src: 24.2, d: 3.0 }, { src: 30.2, d: 3.2 }], sheet: false,
    say: [{ t: 5.9, who: '', text: 'Bico certo. Valor. Pronto, deixa correr.', seed: TH, hold: 0.4 }] },
  { name: 'c24-caixa', desc: 'Cena 24: no balcão, a câmera de teto da loja de relance (cam1), o caixa, a gaveta e o troco', pieces: [{ src: 41.2, d: 1.6 }, { src: 44.2, d: 6.1 }], sheet: false,
    say: [{ t: 3.3, who: '', text: 'Troco nota por nota. Eu que dou.', seed: TH, hold: 0.8 }] },
  { name: 'c26-mostrador', desc: 'Cena 26: o mostrador corre e para no valor; uma noite boa', pieces: [{ src: 35.6, d: 5.4 }], sheet: false,
    say: [{ t: 0.3, who: '', text: 'Uma boa noite é uma noite sem nada.', seed: TH, hold: 0.8 }] },
  { name: 'c27-placar', desc: 'Cena 27: a prancheta com os pontos e o placar da noite, no balcão ao amanhecer', pieces: [{ src: 49.0, d: 9.2, rate: 0.54 }], flags: { noCust: true, dawn: true }, sheet: SHEET_PLACAR },
  { name: 'c28-lista', desc: 'Cena 28: a prancheta com a lista de tarefas da noite enquanto o primeiro carro chega', pieces: [{ src: 3.6, d: 6.9 }], sheet: SHEET_LIST },
  { name: 'c31-fundos', desc: 'Cena 31: o saco de lixo e a lanterna: a área de serviço (cam5), a porta trancada do depósito pelo visor (cam7) e o saco levado ao contêiner dos fundos, iluminado pela lanterna; pensamento', pieces: [{ src: 95.0, d: 1.8 }, { src: 100.0, d: 1.8 }, { src: 120.0, d: 2.6 }],
    say: [{ t: 3.7, who: '', text: 'Rápido. Sai logo daqui.', seed: TH, hold: 0.1 }] },
  { name: 'c32-servico', desc: 'Cena 32: o carrinho, a porta para a área de serviço e a lanterna na penumbra; sem texto', pieces: [{ src: 74.5, d: 6.2 }] },
  { name: 'c34-remedio', desc: 'Cena 34: o armário verde do escritório abre e mostra o frasco branco, sem marca', pieces: [{ src: 110.0, d: 11.9, rate: 0.59 }],
    say: [{ t: 4.6, who: '', text: 'Frasco branco, sem nome. Ajuda, mas deixa as mãos lentas.', seed: TH, hold: 1.4 }] },
  { name: 'c35-fechar', desc: 'Cena 35: ao amanhecer, a gaveta do caixa contada nota por nota; sem texto', pieces: [{ src: 44.2, d: 10.8, rate: 0.65 }], flags: { noCust: true, dawn: true } },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'rotina', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
