// "video3": the reels for the third video of the channel, for the film mode only: a customer who does not exist pays at the counter, the
// monitor beside the till shows the counter empty, the bell of the door does not ring, and at six the drawer is short by exactly that note.
//
// Everything is a function of the time (no real clock, no Math.random). The conditions are forced here, not drawn:
//   - the customer is an entity of the shop, on foot (kind 'walk'), week 1, night 2 (never night 4, where the false-note branch also closes R$ 50 short);
//   - its tells are the two the video shows, `cam-ausente` and `sino-mudo`. The seed ENT.seed is one for which the game's own `tellsFor` (systems/nonexistent.js)
//     gives exactly these two in week 1 at level 0 (tools/video3-check.mjs runs that check, and the closing sum below);
//   - it pays with one note of R$ 50. The closing figures come from the game's own till (systems/cash.js): the entity's note is received, the change is given,
//     and `vanish` takes the note out, as customers.js does for an entity; the divergence is read from `cash.close`, never typed here.
//
// `cam-ausente` on the monitor: in the game, cameras.js `track(root, { hide })` hides the body in the picture of the cameras only, `hide` being the share of the
// time it is missing, which is `clear(level)` = 1 in week 1 (sutileza 0). The film mode has no SecurityCameraSystem, so `shootCam` renders the store camera (cam1)
// from the ceiling with the same rule: the entity (and the note it hands over, which is its payment) is out of that picture, and the main view still shows it.
//
// The plans (the views are 'video3.<name>'; the plans of the vertical cut are one view):
//   ent-paga            the wall clock near 03:00, the door opens and the bell does not ring, the entity walks to the counter and pays with a R$ 50 note,
//                       the monitor beside the till shows the counter empty                                                          13 s
//   ent-paga-v          the vertical cut (9:16), three plans whose end joins the start (a loop): the monitor across the width of the frame with the empty
//                       counter and the entity in front, the note on the counter, the monitor again                                  11.2 s
//   fechar-divergencia  06:00 of the same night: the drawer counted, the box "CAIXA FECHADO" with "Divergência de R$ 50,00 (faltou)", the register tape  11 s
//   ent-chega           support: from the till, the door opens, nobody rings the bell, the entity walks in                            7 s
//   sino-parado         support: the bell over the door while the door opens and the entity passes: it does not move                  5.5 s
//   balcao-vazio        support: the monitor at 03:00 with the empty counter, and beside it the entity standing at the counter        7 s
//   sino-perto          close shot of the bell over the door while the door opens and the entity passes under it: the bell does not move  7 s
//   monitor-perto       the monitor of the counter large in the frame: the store camera with the counter empty, the entity standing beside it  13.5 s
//   maos                the attendant's hands trembling in the lit shop, large and centred: the game's own low-sanity tremor (noites.js c41)  6.8 s
//   monitor-chia        the screen of the counter monitor filling the frame: the store camera with the snow, the roll bar and the tear of cameras.js `develop`, the counter empty  7 s
//   ent-paga-gancho     the opening of the video: the R$ 50 note on the counter with the monitor beside it showing it empty (1.4 s, from the first frame), a hard cut to the clock
//                       at 03:00 (0.6 s), then the same sequence of ent-paga, whose times from 2.0 s on are the same (the door at 2.2 s)  13 s
//   ent-fora            from inside, through the shop window: the refused entity stands outside the glass looking in (the game's `gaze`)     13.5 s
import { track, ramp, smooth, lerp, footfalls } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { ENT, HIDE, GAZE_AT, closing } from './video3-facts.js';
import { money } from '../util.js';
import { camPoint, toCam } from './stagecraft.js';
import { mulberry32 } from '../rng.js';

const GAP = 1.0;

// ---------------------------------------------------------------------------------------------
// The plans, one after the other. [name, seconds, description]; 'v1' to 'v3' are the three plans of the vertical cut.
const PLANS = [
  ['ent-paga', 13.0, 'Balcão em primeira pessoa, a madrugada: o relógio de parede perto das 03:00, a porta abre e o sino não toca, a entidade vai a pé ao balcão e paga com uma nota de R$ 50; o monitor ao lado mostra o balcão vazio'],
  ['v1', 3.4, ''], ['v2', 3.8, ''], ['v3', 4.0, ''],
  ['fechar', 11.0, '06:00 da mesma noite: a gaveta contada, a caixa "CAIXA FECHADO" com a linha "Divergência de R$ 50,00 (faltou)" e a fita do caixa com a divergência; o valor é o da nota'],
  ['ent-chega', 7.0, 'Do balcão, a porta abre e o sino não toca; a entidade entra a pé e vai ao balcão'],
  ['sino-parado', 5.5, 'O sino sobre a porta enquanto a porta abre e a entidade passa: ele não se mexe e nada toca'],
  ['balcao-vazio', 7.0, 'O monitor do balcão às 03:00 mostra o balcão vazio; ao lado dele, a entidade parada no balcão'],
  ['sino-perto', 7.0, 'Plano próximo do sino sobre a porta: a porta abre, a entidade passa por baixo e o sino fica imóvel, sem tocar'],
  ['monitor-perto', 13.5, 'O monitor do balcão em detalhe, grande no quadro: a câmera da loja mostra o balcão vazio, e a entidade está parada ao lado dele, de fora da tela'],
  ['maos', 6.8, 'As mãos do frentista tremendo na loja acesa, grandes e no centro do quadro: o tremor da sanidade baixa, como o jogo o desenha (sem barra nem texto)'],
  ['monitor-chia', 7.0, 'A tela do monitor do balcão bem de perto, ocupando quase todo o quadro: a câmera da loja com o chiado do jogo (neve, barra que rola e rasgo da imagem) e o balcão vazio; sem o cliente no quadro'],
  ['ent-paga-gancho', 13.0, 'Abertura: a nota de R$ 50 pousada no balcão com o monitor ao lado mostrando o balcão vazio, já no primeiro quadro; corte seco para o relógio de parede em 03:00; a porta abre sem o sino tocar, o cliente vai ao balcão e paga com a nota, e o monitor mostra o balcão vazio'],
  ['ent-fora', 13.5, 'De dentro da loja, pela vitrine: a entidade recusada parada lá fora, de frente para o vidro, olhando para dentro, como o jogo faz depois da recusa'],
];
const P = {}, views = {};
let D = 0;
for (const [name, d, desc] of PLANS) { P[name] = [+D.toFixed(3), +(D + d).toFixed(3)]; if (desc) views[name] = [P[name][0], P[name][1], desc]; D += d + (name === 'v1' || name === 'v2' ? 0 : GAP); }
D = +(D - GAP).toFixed(3);
views['ent-paga-v'] = [P.v1[0], P.v3[1], 'Vertical (9:16), 11 s, em laço: o monitor ocupando a largura do quadro em pé com a câmera da loja mostrando o balcão vazio, a entidade pagando na frente, a nota no balcão e o monitor de novo; o fim emenda no começo'];
views['fechar-divergencia'] = [P.fechar[0], P.fechar[1], views.fechar[2]];
delete views.fechar;
const A = (plan, rel = 0) => +(P[plan][0] + rel).toFixed(3);

// ---------------------------------------------------------------------------------------------
// The entity: a path through the door to the counter, written as points.
const WAY = [[9.0, 1.0], [9.0, 4.4], [11.0, 5.7], [12.95, 7.25]];
const SPOT = WAY[WAY.length - 1], SPEED = 1.5, U_PRE = 0.6;         // metres/second; it is seen 0.6 s before it reaches the door
const SEG = WAY.slice(1).map((p, i) => Math.hypot(p[0] - WAY[i][0], p[1] - WAY[i][1]));
const LEN = SEG.reduce((a, b) => a + b, 0);
export const ARRIVES = LEN / SPEED - U_PRE;                              // seconds after the door starts to open
const PAY_AT = ARRIVES + 0.3, HELD_FROM = PAY_AT + 0.5, LAID_AT = PAY_AT + 2.1, BACK_AT = LAID_AT;
const COUNTER_Y = 1.0, LAID = [12.95, 8.2];                              // the note lies on the counter, in front of the till

/** The entity at `u` seconds after the door starts to open (u < 0 before it). `stand` skips the walk: it is already at the counter. */
function entityAt(u, pay = PAY_AT, stand = false) {
  const s = stand ? LEN : Math.max(0, Math.min(LEN, SPEED * (u + U_PRE)));
  let k = 0, rem = s; while (k < SEG.length - 1 && rem > SEG[k]) { rem -= SEG[k]; k++; }
  const a = WAY[k], b = WAY[k + 1], f = SEG[k] ? Math.min(1, rem / SEG[k]) : 1;
  const x = lerp(a[0], b[0], f), z = lerp(a[1], b[1], f);
  const walking = !stand && s < LEN - 0.01 && u > -U_PRE;
  const head = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const yaw = walking ? head * (1 - smooth(ramp(s, LEN - 1.2, LEN))) : 0;
  const rel = u - pay;
  const pose = rel >= 0 && rel < BACK_AT - PAY_AT ? 'pagando' : 'parado';
  const held = rel >= 0.5 && rel < LAID_AT - PAY_AT;
  const laid = rel >= LAID_AT - PAY_AT;
  return { x, z, yaw, walking, s, pose, held, laid, near: Math.max(0, Math.min(1, (rel - (LAID_AT - PAY_AT - 0.45)) / 0.45)), visible: stand || u > -U_PRE };
}

// ---------------------------------------------------------------------------------------------
// The cameras of each plan. A key's `fov` is the factor on the field of view (1 = the normal one).
const K = (t, eye, look, fov = 1, ease) => ({ t, eye, look, fov, ...(ease ? { ease } : {}) });
const camA = track([
  K(0.0, [10.5, 1.7, 10.5], [9.6, 2.12, 11.9], 0.75), K(1.4, [10.5, 1.7, 10.5], [9.6, 2.14, 11.9], 0.75, 'ss'),
  K(2.7, [11.5, 1.66, 9.5], [9.3, 1.4, 4.0]), K(4.8, [12.2, 1.66, 9.5], [10.8, 1.3, 5.6], 1, 'ss'),
  K(7.0, [14.0, 1.6, 9.9], [13.9, 1.4, 7.8], 0.95, 'ss'), K(8.5, [14.0, 1.6, 9.9], [13.9, 1.4, 7.8], 0.95, 'ss'),
  K(9.2, [13.3, 1.6, 9.3], [12.95, 1.22, 7.95], 0.55), K(9.9, [13.3, 1.6, 9.3], [12.95, 1.2, 7.95], 0.55, 'ss'),
  K(10.6, [13.2, 1.5, 9.3], [12.95, 1.05, 8.2], 0.55, 'ss'), K(11.3, [13.2, 1.5, 9.3], [12.95, 1.05, 8.2], 0.55, 'ss'),
  K(12.1, [14.4, 1.5, 9.7], [14.52, 1.2, 8.55], 0.62), K(13.0, [14.4, 1.5, 9.7], [14.52, 1.2, 8.55], 0.62),
]);
const camChega = track([K(0, [13.9, 1.68, 9.7], [9.2, 1.5, 3.8], 1, 'ss'), K(4.3, [13.9, 1.68, 9.7], [10.6, 1.4, 5.2], 1, 'ss'), K(6.4, [13.6, 1.68, 9.7], [12.95, 1.45, 6.9]), K(7.0, [13.6, 1.68, 9.7], [12.95, 1.45, 6.9])]);
const camSino = track([K(0, [8.0, 1.85, 6.3], [9.0, 2.15, 3.3], 0.78, 'ss'), K(5.5, [8.1, 1.85, 6.2], [9.0, 2.1, 3.3], 0.78)]);
const camVazio = track([
  K(0, [14.45, 1.45, 9.6], [14.0, 1.3, 7.6], 0.78, 'ss'), K(3.2, [14.45, 1.45, 9.6], [14.05, 1.3, 7.6], 0.78, 'ss'),
  K(4.4, [13.9, 1.6, 9.8], [13.2, 1.3, 7.4], 1), K(7.0, [13.9, 1.6, 9.8], [13.2, 1.3, 7.4], 1),
]);
const camSinoP = track([K(0, [9.35, 1.25, 5.5], [9.0, 2.35, 3.5], 0.4, 'ss'), K(7.0, [9.35, 1.25, 5.5], [9.0, 2.35, 3.5], 0.4)]);
// the monitor of the counter, large; the entity stands to its left (the customer's side of the counter), partly in the frame
const STAND = [13.55, 7.55];
const camMaos = track([K(0, [9.8, 1.6, 9.2], [7.0, 0.95, 8.0], 1, 'ss'), K(6.8, [9.8, 1.62, 9.2], [7.0, 0.9, 8.0], 1)]);
// the screen of the monitor, close: filled in `pose` from the anchor of the screen
const SNOW0 = 0.035;                                                       // cameras.js BASE_CHIADO
// the failures of the camera in this plan, as a function of the time (cameras.js `condition` takes them from faults and from the sanity stage): [from, to, snow]
const CHIA = [[0.9, 2.0, 0.8], [2.9, 3.4, 0.45], [4.1, 5.0, 0.9], [5.6, 6.1, 0.55]];
const snowAt = (rel) => { let k = SNOW0; for (const [a, b, v] of CHIA) if (rel >= a && rel < b) k = Math.max(k, v); return k; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// the hook: the note on the counter and the monitor beside it, both in the frame from the first picture
const camGancho = track([K(0, [14.0, 1.62, 9.75], [13.95, 1.2, 8.4], 0.8, 'ss'), K(1.4, [14.0, 1.58, 9.55], [13.95, 1.2, 8.4], 0.74)]);
const camGanchoMain = (rel) => (rel < 1.4 ? camGancho(rel) : rel < 2.0 ? camA(1.0) : camA(rel < 2.7 ? 1.4 + (rel - 2.0) / 0.7 * 1.3 : rel));
const camMon = track([K(0, [14.95, 1.5, 9.85], [14.45, 1.2, 8.7], 0.55, 'ss'), K(13.5, [14.9, 1.48, 9.7], [14.5, 1.2, 8.7], 0.5)]);
// through the shop window, toward where the entity stops outside (a slow push in)
const camFora = track([K(0, [12.9, 1.62, 5.5], [10.85, 1.45, 1.6], 0.9, 'ss'), K(13.5, [12.7, 1.62, 5.3], [10.8, 1.5, 1.6], 0.62)]);
// the vertical cut: the first plan and the end of the last one are the same picture
const V_SHOT = { eye: [13.3, 1.55, 9.3], look: [12.95, 0.65, 7.9], fov: 1 };
const camV = track([
  K(0.0, V_SHOT.eye, V_SHOT.look, 1), K(3.39, V_SHOT.eye, V_SHOT.look, 1),
  K(3.4, [13.7, 1.52, 9.3], [13.45, 1.2, 7.5], 0.9), K(6.9, [13.7, 1.5, 9.3], [13.45, 1.12, 7.9], 0.9, 'ss'),
  K(7.4, [14.0, 1.46, 9.7], [14.3, 1.15, 8.4], 0.9, 'ss'), K(8.5, [14.35, 1.42, 9.55], [14.72, 1.2, 8.69], 0.7),
  K(8.6, V_SHOT.eye, V_SHOT.look, 1), K(11.2, V_SHOT.eye, V_SHOT.look, 1),
]);
const camF = track([
  K(0, [13.4, 1.66, 9.35], [13.7, 1.0, 8.2], 1, 'ss'), K(3.3, [13.5, 1.64, 9.3], [13.8, 1.0, 8.4], 1),
  K(3.4, [13.5, 1.64, 9.3], [13.8, 1.0, 8.4], 1), K(11.0, [13.5, 1.64, 9.3], [13.8, 1.0, 8.4], 1),
]);

const CAM_W = 160, CAM_H = 120;
const PHASE = 0.37;                                                       // the phase of the entity in the camera's `hide` rule (cameras.js, T.phase)
const hhmm = (hora) => { const m = Math.floor((hora % 1) * 60 + 1e-6), h = Math.floor(hora + 1e-6); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

export default {
  name: 'video3', filmOnly: true, duration: D, views,
  anchors: { relogio: 'O relógio de parede da loja', monitor: 'O monitor do balcão', sino: 'O sino sobre a porta da loja', balcao: 'O balcão da loja' },
  sfx: (() => {
    const E = []; const e = (t, name, opts) => E.push({ t: +t.toFixed(3), name, ...(opts ? { opts } : {}) });
    // the door of the shop opens and shuts, the steps; the bell (`porta_sino`) is never here: the entity has the tell `sino-mudo`
    const walkIn = (plan, u0, gain = 0.6) => {
      e(A(plan, u0), 'porta_abre', { pos: [9, 1, 3], gain }); e(A(plan, u0 + 3.4), 'porta_fecha', { pos: [9, 1, 3], gain: gain * 0.9 });
      for (const f of footfalls(u0 - U_PRE + 0.35, u0 + ARRIVES - 0.2, 1.9, { gain: 0.55 })) e(A(plan, f.t), 'passo_piso', f.opts);
    };
    // ent-paga
    e(A('ent-paga'), 'fluorescente', { dur: 13, gain: 0.55 });
    walkIn('ent-paga', 2.2);
    e(A('ent-paga', 2.2 + PAY_AT), 'babble', { seed: 23, text: 'Boa noite.' });
    e(A('ent-paga', 2.2 + LAID_AT), 'nota', { pos: [13.5, 1.0, 8.2], gain: 0.8 });
    e(A('ent-paga', 10.2), 'estatica_camera', { dur: 2.8, gain: 0.3 });
    // the vertical cut: a short burst of static and the hum, the entity speaks once, the note, no bell
    const v0 = P.v1[0];
    e(v0, 'estatica_camera', { dur: 0.7, gain: 0.45 }); e(v0, 'fluorescente', { dur: 11.2, gain: 0.55 });
    e(v0 + 3.7, 'babble', { seed: 23, text: 'Boa noite.' });
    e(v0 + 6.2, 'nota', { pos: [13.5, 1.0, 8.2], gain: 0.8 });
    e(v0 + 8.6, 'estatica_camera', { dur: 2.6, gain: 0.4 });
    // the closing
    e(A('fechar'), 'fluorescente', { dur: 11, gain: 0.5 }); e(A('fechar', 0.4), 'gaveta_abre', { pos: [13.9, 1.0, 8.5] });
    for (const t of [1.0, 1.55, 2.1, 2.65]) e(A('fechar', t), 'nota', { pos: [13.9, 1.0, 8.5], gain: 0.5 });
    e(A('fechar', 3.4), 'caixa_bip', { pos: [13.9, 1.2, 8.5] }); e(A('fechar', 6.8), 'papel_folha', { gain: 0.9 });
    // the supports
    e(A('ent-chega'), 'fluorescente', { dur: 7, gain: 0.55 }); walkIn('ent-chega', 1.0);
    e(A('sino-parado'), 'fluorescente', { dur: 5.5, gain: 0.55 }); walkIn('sino-parado', 1.0, 0.7);
    e(A('sino-perto'), 'fluorescente', { dur: 7, gain: 0.55 }); walkIn('sino-perto', 1.9, 0.7);
    e(A('monitor-perto'), 'fluorescente', { dur: 13.5, gain: 0.55 }); e(A('monitor-perto'), 'estatica_camera', { dur: 13.5, gain: 0.2 });
    e(A('maos'), 'fluorescente', { dur: 6.8, gain: 0.55 }); e(A('maos', 0.3), 'respiracao', { dur: 6, gain: 0.4 });
    e(A('monitor-chia'), 'fluorescente', { dur: 7, gain: 0.45 });
    for (const [a, b, v] of CHIA) e(A('monitor-chia', a), 'estatica_camera', { dur: +(b - a).toFixed(2), gain: +(0.2 + 0.3 * v).toFixed(2) });
    // ent-paga-gancho: the hook, then the sequence of ent-paga (no bell)
    e(A('ent-paga-gancho'), 'fluorescente', { dur: 13, gain: 0.55 }); e(A('ent-paga-gancho'), 'estatica_camera', { dur: 1.4, gain: 0.3 });
    walkIn('ent-paga-gancho', 2.2);
    e(A('ent-paga-gancho', 2.2 + PAY_AT), 'babble', { seed: 23, text: 'Boa noite.' });
    e(A('ent-paga-gancho', 2.2 + LAID_AT), 'nota', { pos: [13.5, 1.0, 8.2], gain: 0.8 });
    e(A('ent-paga-gancho', 10.2), 'estatica_camera', { dur: 2.8, gain: 0.3 });
    e(A('ent-fora'), 'fluorescente', { dur: 13.5, gain: 0.5 });
    e(A('balcao-vazio'), 'fluorescente', { dur: 7, gain: 0.55 }); e(A('balcao-vazio'), 'estatica_camera', { dur: 3.4, gain: 0.35 }); e(A('balcao-vazio', 4.6), 'babble', { seed: 23, text: 'Boa noite.' });
    return E.sort((a, b) => a.t - b.t);
  })(),
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world(), P_ = W.posto, mon = P_.props.monitor;
    const g = new T.Group();
    // ---- the entity
    const ent = buildCustomer(r, { ...ENT.spec }, { seed: ENT.seed });
    ent.root.visible = false; g.add(ent.root);
    // ---- the R$ 50 note (a plane with its picture; the 3D model of the customer only has a plain slab)
    const noteCv = document.createElement('canvas'); noteCv.width = 256; noteCv.height = 120;
    {
      const c = noteCv.getContext('2d');
      c.fillStyle = '#c98f45'; c.fillRect(0, 0, 256, 120);
      c.fillStyle = '#e2b56e'; c.fillRect(6, 6, 244, 108);
      c.strokeStyle = '#7a4a1a'; c.lineWidth = 3; c.strokeRect(6, 6, 244, 108);
      c.fillStyle = '#7a4a1a'; c.font = 'bold 74px "Courier New", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('50', 128, 54);
      c.font = 'bold 14px "Courier New", monospace'; c.textAlign = 'left'; c.fillText('R$ 50', 16, 20); c.textAlign = 'right'; c.fillText('R$ 50', 240, 100);
      c.textAlign = 'center'; c.font = 'bold 12px "Courier New", monospace'; c.fillText('CINQUENTA REAIS', 128, 104);
      c.fillStyle = 'rgba(122,74,26,0.35)'; c.beginPath(); c.arc(40, 62, 20, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(216, 62, 20, 0, Math.PI * 2); c.fill();
    }
    const noteTex = new T.CanvasTexture(noteCv); noteTex.magFilter = noteTex.minFilter = T.NearestFilter; noteTex.generateMipmaps = false; noteTex.colorSpace = T.SRGBColorSpace;
    const note = new T.Mesh(new T.PlaneGeometry(0.23, 0.108), r.glow('#ffffff', { map: noteTex, emissive: 0.85 }));
    note.visible = false; g.add(note);
    // ---- the picture of the store camera (cam1), for the monitor
    const rt = new T.WebGLRenderTarget(CAM_W, CAM_H, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    const aux = new T.PerspectiveCamera(46, CAM_W / CAM_H, 0.45, 60);
    const px = new Uint8Array(CAM_W * CAM_H * 4), id = new ImageData(CAM_W, CAM_H);
    const cam = document.createElement('canvas'); cam.width = CAM_W; cam.height = CAM_H;
    const camG = cam.getContext('2d'), raw = document.createElement('canvas'); raw.width = CAM_W; raw.height = CAM_H;
    const U = r.mat('#000000').uniforms;
    const keep = { amb: new T.Color(), res: new T.Vector2(), spot: 0 };
    const a1 = W.anchors.cam1;
    const monTex = new T.CanvasTexture(cam); monTex.magFilter = monTex.minFilter = T.NearestFilter; monTex.generateMipmaps = false; monTex.colorSpace = T.NoColorSpace;
    /**
     * The picture of cam1 at time t, stamped like the monitor of the game (name, clock, REC). The entity is out of it by the rule of `cam-ausente`
     * (cameras.js adjustTracked: hidden while ((t * 0.31 + phase) % 1) < hide), unless `withEntity` (a proof, not used by the views).
     */
    function shootCam(t, hora, withEntity = false, snow = 0) {
      const hide = !withEntity && ((t * 0.31 + PHASE) % 1) < HIDE;
      const wasE = ent.root.visible, wasN = note.visible, arms = hands.arms.root, wasA = arms.visible;
      if (hide) { ent.root.visible = false; note.visible = false; }
      arms.visible = false;
      keep.amb.copy(U.uAmbient.value); keep.res.copy(U.uRes.value); keep.spot = U.uSpotOn.value;
      U.uAmbient.value.set(0x5a5e70); U.uRes.value.set(CAM_W, CAM_H); U.uSpotOn.value = 0;
      aux.position.copy(a1.pos); aux.up.set(0, 1, 0); aux.lookAt(13.3, 1.0, 7.9); aux.updateMatrixWorld();
      const prev = r.renderer.getRenderTarget();
      r.renderer.setRenderTarget(rt); r.renderer.render(r.scene, aux); r.renderer.readRenderTargetPixels(rt, 0, 0, CAM_W, CAM_H, px); r.renderer.setRenderTarget(prev);
      U.uAmbient.value.copy(keep.amb); U.uRes.value.copy(keep.res); U.uSpotOn.value = keep.spot;
      ent.root.visible = wasE; note.visible = wasN; arms.visible = wasA;
      const d = id.data;
      if (snow > 0) {
        // the game's `develop` (cameras.js): grain, the roll bar and the tear while there is snow, the snow mixed in, seven grey levels dithered
        const rnd = mulberry32((7919 + Math.floor(t * 12) * 104729 + 78 * 31) >>> 0), lv = 7, gain = 255 / (lv - 1);
        const barY = snow > 0.2 ? Math.floor((t * 41 + 23) % (CAM_H + 30)) - 15 : -99, barH = 6 + Math.floor(snow * 16);
        for (let y = 0; y < CAM_H; y++) {
          const inBar = y >= barY && y < barY + barH;
          const shift = inBar ? Math.floor((rnd() - 0.5) * 22 * snow) : (snow > 0.5 && rnd() < 0.05 ? Math.floor((rnd() - 0.5) * 10) : 0);
          for (let x = 0; x < CAM_W; x++) {
            let sx = x + shift; if (sx < 0) sx += CAM_W; else if (sx >= CAM_W) sx -= CAM_W;
            const sI = ((CAM_H - 1 - y) * CAM_W + sx) * 4;
            let L = Math.min(255, Math.max(0, ((0.3 * px[sI] + 0.59 * px[sI + 1] + 0.11 * px[sI + 2]) - 14) * 2.3));
            L += (rnd() - 0.5) * 14;
            if (rnd() < snow * (inBar ? 1 : 0.6)) { const m = Math.min(0.95, snow * (inBar ? 1.1 : 0.9)); L = L * (1 - m) + rnd() * 255 * m; }
            L = Math.min(255, Math.max(0, Math.floor(L / 255 * (lv - 1) + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9 + 0.5) * gain));
            const o = (y * CAM_W + x) * 4; d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
          }
        }
      } else
      for (let y = 0; y < CAM_H; y++) for (let x = 0; x < CAM_W; x++) {
        const s = ((CAM_H - 1 - y) * CAM_W + x) * 4, o = (y * CAM_W + x) * 4;
        const L = Math.min(255, Math.max(0, ((0.3 * px[s] + 0.59 * px[s + 1] + 0.11 * px[s + 2]) - 14) * 2.3) + ((x + y + Math.floor(t * 12)) % 7 === 0 ? 10 : 0));
        d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
      }
      raw.getContext('2d').putImageData(id, 0, 0);
      camG.imageSmoothingEnabled = false; camG.drawImage(raw, 0, 0);
      camG.font = 'bold 9px "Courier New", monospace'; camG.textBaseline = 'top'; camG.textAlign = 'left';
      const txt = (str, x, y) => { camG.fillStyle = '#031003'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) camG.fillText(str, x + dx, y + dy); camG.fillStyle = '#d8ffd8'; camG.fillText(str, x, y); };
      txt('CAM 1 LOJA', 20, 3); txt(hhmm(hora), 20, CAM_H - 12);   // inside the part of the picture that the tall frame keeps
      if (Math.floor(t * 1.5) % 2 === 0) { camG.fillStyle = '#d8ffd8'; camG.fillRect(CAM_W - 48, 5, 4, 4); txt('REC', CAM_W - 42, 3); }
      monTex.needsUpdate = true;
      return cam;
    }
    return {
      group: g, hands: true, arms: hands.arms, world: false,
      anchors: { relogio: () => [9.6, 2.15, 11.9], monitor: () => W.p('monitorTela'), sino: () => [9.0, 2.5, 3.35], balcao: () => W.p('balcao', 1) },
      shootCam,
      show(on) { g.visible = on; mon?.setScreen?.(on ? monTex : null); },
      pose(t) {
        const { rig } = hands;
                const plan = Object.keys(P).find((n) => t >= P[n][0] && t < P[n][1] + GAP * 0.999) ?? 'ent-paga';
        const rel = Math.min(t - P[plan][0], P[plan][1] - P[plan][0]);
        let c, e = null, hora = 3.0, doorU = null, vert = false, pay = PAY_AT, stand = false, screen = null, arm = true, noise = 0, gaveta = 0, drawer = false, daze = 0;
        switch (plan) {
          case 'ent-paga': c = camA(rel); doorU = rel - 2.2; e = entityAt(doorU); hora = rel < 2.0 ? lerp(2.975, 3.0, ramp(rel, 0.4, 1.4)) : 3.0 + (rel - 2) / 3600; noise = rel >= 10.2 ? 0.05 : 0; break;
          case 'ent-chega': c = camChega(rel); doorU = rel - 1.0; e = entityAt(doorU); hora = 3.0; break;
          case 'sino-parado': c = camSino(rel); doorU = rel - 1.0; e = entityAt(doorU); hora = 3.0; arm = false; break;
          case 'sino-perto': c = camSinoP(rel); doorU = rel - 1.9; e = entityAt(doorU); hora = 3.0; arm = false; break;
          case 'monitor-chia': {
            const tela = W.p('monitorTela');
            c = { eye: [tela[0] + 0.02, tela[1] + 0.005, tela[2] + 0.62], look: [tela[0] + 0.02, tela[1] + 0.005, tela[2]], fov: 0.3 };
            hora = 3.0; arm = false; break;
          }
          case 'ent-paga-gancho':
            // the plan of ent-paga from 2.0 s on: the same door, entity, note and camera times (the clock is held for 0.6 s instead of 2.2 s)
            c = camGanchoMain(rel); doorU = rel - 2.2; e = entityAt(rel < 1.4 ? 100 : doorU); if (rel < 1.4) e.x = 13.1; hora = rel < 1.4 ? 3.0 : rel < 2.0 ? lerp(2.99, 3.0, ramp(rel, 1.4, 2.0)) : 3.0 + (rel - 2) / 3600; noise = rel >= 10.2 ? 0.05 : 0; break;
          case 'maos': c = camMaos(rel); hora = 3.0; daze = 0.45; break;
          case 'monitor-perto': c = camMon(rel); hora = 3.0; screen = null; e = { ...entityAt(0, 999, true), x: STAND[0], z: STAND[1], yaw: 0 }; noise = 0; break;
          case 'ent-fora': {
            c = camFora(rel); hora = 3.0; arm = false;
            // the game's `gaze` (customers.js): outside the glass at `gazeAt`, turned toward the counter, in the pose 'fixo'
            const cb = W.p('balcao');
            e = { ...entityAt(0, 999, true), x: GAZE_AT[0], z: GAZE_AT[1], yaw: Math.atan2(cb[0] - GAZE_AT[0], cb[2] - GAZE_AT[1]), pose: 'fixo' };
            break;
          }
          case 'balcao-vazio': c = camVazio(rel); stand = true; pay = 4.8; e = entityAt(rel, pay, true); hora = 3.0; noise = rel < 3.4 ? 0.05 : 0; break;
          case 'v1': case 'v2': case 'v3': {
            vert = true; const v = t - P.v1[0]; c = camV(v); stand = true; pay = 3.7; e = entityAt(v, pay, true); hora = 3.0;
            if (v < 3.4 || v >= 8.6) screen = { kind: 'cam', image: cam, label: '', zoom: 1, at: [0.5, 0.5], hFrac: 0.5 };
            noise = v < 0.7 ? 0.1 : v >= 8.6 && v < 8.9 ? 0.06 : 0.0;
            break;
          }
          default: {            // fechar
            c = camF(rel); hora = lerp(5.99, 6.0, ramp(rel, 0, 11)); drawer = true; gaveta = smooth(ramp(rel, 0.3, 1.0));
            break;
          }
        }
        // ---- the world
        const eye = c.eye;
        const state = { telefoneToca: false, hora, gaveta: drawer ? gaveta : 0 };
        if (doorU !== null) state.doors = { 'porta-loja': smooth(ramp(doorU, 0, 0.8)) * (1 - smooth(ramp(doorU, 3.4, 4.4))) };
        // the vertical cut loops: its ambient time is constant, so its first picture and its last are the same
        const amb = vert ? 4000 : t;
        W.group.visible = true;
        W.pose(amb, { eye, state, on: ['loja1', 'loja3'] }, { reduce: ctx.reduceFlash });
        // ---- the entity
        if (e) {
          ent.root.visible = e.visible;
          ent.root.position.set(e.x, 0, e.z); ent.root.rotation.y = e.yaw;
          ent.update(t, { pose: e.pose, andando: e.walking ? 1 : 0, fase: e.s * 3.4, falando: false });
          ent.root.updateMatrixWorld(true);
          note.visible = e.visible && (e.held || e.laid) && !(plan === 'v3' && t - P.v1[0] >= 8.5);
          if (e.held && !e.laid) {
            const p = ent.joints.wristR.localToWorld(new T.Vector3(0, -0.17, 0.09));
            note.position.set(p.x, p.y, p.z + 0.03); note.lookAt(eye[0], eye[1], eye[2]); note.scale.setScalar(1.35);
            note.position.lerp(new T.Vector3(LAID[0], COUNTER_Y + 0.12, LAID[1]), e.near * 0.6);
          } else if (e.laid) { note.position.set(LAID[0], COUNTER_Y + 0.004, LAID[1]); note.rotation.set(-Math.PI / 2, 0, 0.06); note.scale.setScalar(1.15);
            if (plan === 'ent-paga-gancho' && t - P['ent-paga-gancho'][0] < 1.4) { note.position.set(13.35, COUNTER_Y + 0.004, 8.4); note.scale.setScalar(1.6); }   }   // the hook: the note nearer the lens and larger, so that the 50 reads
        } else { ent.root.visible = false; note.visible = false; }
        // ---- the hands
        hands.arms.root.visible = arm;
        rig.hang(Math.sin(t * 1.3));
        if (plan === 'maos') {   // the same tremor as noites.js c41 (sin(t * 17) * 0.012), the hands raised into the middle of the frame
          const tr = Math.sin(t * 17) * 0.012; rig.reach('right', [0.13 + tr, -0.03, -0.42]); rig.reach('left', [-0.13 - tr, -0.03, -0.42]);
        }
        if (drawer) {
          const sw = Math.sin(rel * 5.5) * 0.14, u = smooth(ramp(rel, 0.9, 1.5)) * (1 - smooth(ramp(rel, 3.0, 3.4)));
          const hp = toCam(T, c.eye, c.look, [13.85 + sw, 0.99 + 0.03 * Math.abs(Math.sin(rel * 5.5)), 8.78]);
          rig.reach('right', hp.map((v, i) => lerp([0.22, -0.4, -0.34][i], v, u)));
        }
        // ---- the picture of the monitor (after the world and the entity are posed)
        shootCam(t, hora, false, plan === 'monitor-chia' ? snowAt(rel) : 0);
        // ---- the closing screens
        const cl = plan === 'fechar' ? CLOSING : null;
        if (cl && rel >= 3.4 && rel < 6.9) {
          const k = rel - 3.4, lines = [
            `Fundo de caixa ${money(cl.fundo)} + vendas ${money(cl.vendas)} = esperado ${money(cl.expected)}`,
            `Você contou ${money(cl.declared)}. Na gaveta há ${money(cl.real)}.`,
            `Divergência de ${money(cl.divergence)} ${cl.gap > 0 ? '(sobrou)' : '(faltou)'}.`,
          ];
          screen = { kind: 'fecho', title: 'CAIXA FECHADO', subtitle: 'Relatório contra a gaveta', lines, shown: 1 + (k > 0.7 ? 1 : 0) + (k > 1.4 ? 1 : 0), hi: 2, verdict: 'Faltou dinheiro na gaveta. Vai sair do relatório.', button: 'CONTINUAR' };
        } else if (cl && rel >= 6.9) {
          const k = rel - 6.9;
          screen = {
            kind: 'fita', head: ['POSTO BOM DIA', 'TURNO ENCERRADO', 'TER · DIA 2/28 · 06:00'], shown: Math.min(FITA_ROWS.length, Math.floor(k * 6) + 1),
            rows: FITA_ROWS.map((row) => (row[2] === 'gap' ? ['Divergência de caixa', money(cl.divergence), 'gap'] : row[0] === 'Caixa contado' ? ['Caixa contado', money(cl.declared)] : row)),
          };
        }
        void screen; void noise;
        return {
          eye, look: c.look, roll: 0, fade: 0, dialog: null, sheet: null, card: null, flashes: [], fovK: c.fov ?? 1,
          noise, screen, daze, world: undefined, amb, hora, _plan: plan,
        };
      },
    };
  },
};

const CLOSING = closing();
if (CLOSING.divergence !== ENT.bill) throw new Error(`video3: the divergence (${CLOSING.divergence}) is not the note (${ENT.bill})`);
// the rows of the tape as the game prints them (screens.js tape), for a night of the first week; the numbers that are not money are the night's
const FITA_ROWS = [
  ['Atendimentos', 4], ['Vendas', 4], ['Abastecimentos', 3], '-',
  ['Tarefas feitas', 5], ['Tarefas não feitas', 1], ['Erros', 0], ['Reclamações', 0], ['Ocorrências registradas', 0], '-',
  ['Caixa contado', ''], ['Divergência de caixa', '', 'gap'], ['Carteira', 'R$ 120,00'], '=',
  ['PONTOS', 38],
];
