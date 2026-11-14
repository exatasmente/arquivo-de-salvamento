// "serie": the reels of the vertical atmosphere series (six videos of 14 to 26 s, no narration), for the film mode only.
// The picture is the posto and nothing else: no box of dialogue or of thought, no clipboard, no fade from black, no
// arms; every plan has its own camera for the tall frame (9:16, vertical field of view 84), and the night is always on.
// Each video opens on a point of light, never on black. Two of them close a loop: the last frame of V1 and of V4 is
// the first one (the world that is posed depends on the time of the plan only, with a fixed ambient time).
// The clues (the display, the badge, the cameras) pass in the frame, never pointed at; no answer of any secret is here.
//
//   V1 "Acende"                the sign of the sun failing, a car passing                       14 s   loop
//   V2 "Cinco coisas paradas"  six still details, the camera low                                22 s
//   V3 "Quarenta metros"       one take, on foot at a normal pace (1.1 m/s), shoulder to canopy  ~43 s
//   V4 "Bomba 3"               fixed: the car enters, nobody gets out, it leaves                16 s   loop
//   V5 "A lâmpada"             the glass front from outside, the lamp that hums, the door, a cut to black   16.7 s
//   V6 "Telas"                 the security cameras, down to the empty store on the monitor      17.1 s
//
// This file only uses what exists: the stage of stagecraft.js (the posto, the cars on their routes) and, for the plans
// that already exist in other cutscenes (a window of noites, rotina, corte), the same cutscene posed at the same time
// with its boxes, clipboard, fade and arms taken off.
import { track, bob, footfalls, ramp, smooth, lerp, clamp } from './common.js';
import { buildCar } from '../models/car.js';
import { buildCustomer } from '../models/customer.js';
import { pumpCar, castSpec } from './stagecraft.js';
import noites from './noites.js';
import rotina from './rotina.js';
import corte from './corte.js';

const EYE = 1.68;
const GAP = 1.0; // between two videos, so that the last frame of one never reads as the first of the next

// V3: the walk at a normal, tired pace (1.1 m/s), written as points; the keys are placed by the length of the way.
// It stops for a moment when the sign of the sun sputters on, the head looks up at it and comes back; one take, no cut.
const WAY = [[-34, -24.4], [-27, -24.3], [-19, -14.0], [-10, -7.0], [-3.4, -3.6], [1.5, -2.8]];
const V3_V = 1.1, V3_PAUSE = 3.0, V3_FREQ = 1.7;           // m/s, seconds standing, steps per second
const V3_S = WAY.map((p, i) => 0), V3_LEN = (() => { let s = 0; WAY.forEach((p, i) => { if (i) s += Math.hypot(p[0] - WAY[i - 1][0], p[1] - WAY[i - 1][1]); V3_S[i] = s; }); return s; })();
const V3_TP = V3_S[1] / V3_V;                               // the moment it stops (at the end of the shoulder)
const tOf = (sm) => sm / V3_V + (sm > V3_S[1] + 1e-6 ? V3_PAUSE : 0); // time at the metre `sm` of the way
const V3_END = tOf(V3_LEN);
const V3_DUR = Math.ceil((V3_END + 0.8) * 10) / 10;         // a short stand still at the end
const V3_CANOPY = tOf(V3_S[4] - 0.5);                       // the canopy starts at about x = -4
const walkKeys = (() => {
  const keys = [];
  WAY.forEach((p, i) => { keys.push({ t: V3_S[i] / V3_V, p, ease: i === 1 ? 'ss' : undefined }); if (i === 1) keys.push({ t: V3_S[i] / V3_V + V3_PAUSE, p }); });
  keys.forEach((k, i) => { if (i > 1) k.t = (V3_S[i - 1] / V3_V) + V3_PAUSE; });
  keys.push({ t: V3_END + 0.8, p: WAY[WAY.length - 1] });
  return keys;
})();
const V3_L = V3_TP + 2.8; // the sign is lit from here (it sputters three times before)
const v3SignOn = (t) => t >= V3_L || [[V3_TP + 0.8, V3_TP + 1.2], [V3_TP + 1.6, V3_TP + 1.95], [V3_TP + 2.3, V3_TP + 2.65]].some(([a, b]) => t >= a && t < b);
const v3Ray = (t) => (t < V3_L ? -1 : (Math.floor(t * 1.4) % 3 === 0 ? 4 : -1));
const v3Eye = track(walkKeys.map(({ t, p, ease }) => ({ t, eye: [p[0], EYE, p[1]], look: [0, 0, 0], ...(ease ? { ease } : {}) })));
// where the head turns: down the shoulder, up to the sign (and back), to the posto, up to the canopy
const v3Look = track([
  [0, [-22, 1.4, -23.4]], [V3_TP - 1.5, [-17, 1.45, -22.5]], [V3_TP + 0.5, [-14, 6.4, -20.3]], [V3_TP + V3_PAUSE + 0.4, [-14, 6.9, -20.3]],
  [tOf(V3_S[1] + 4), [-17, 1.4, -15.5]], [tOf(V3_S[2] + 5), [-8, 1.5, -9.0]], [tOf(V3_S[3] + 3), [-1, 2.4, -6.0]],
  [tOf(V3_S[4] + 1.5), [7, 2.6, -6.5]], [V3_END + 0.8, [15, 2.8, -6.5]],
].map(([t, look]) => ({ t, eye: [0, 0, 0], look, ease: 'ss' })));
const v3Cam = (t) => ({ eye: v3Eye(t).eye, look: v3Look(t).look });
const v3Amp = (t) => (t < V3_TP ? 1 - smooth(ramp(t, V3_TP - 0.6, V3_TP)) : t < V3_TP + V3_PAUSE ? 0 : smooth(ramp(t, V3_TP + V3_PAUSE, V3_TP + V3_PAUSE + 0.6))) * (1 - smooth(ramp(t, V3_END - 0.6, V3_END)));
const V3_CAR = 3.0; // the car on the highway passes the walker at about 4.5 s

// ---------------------------------------------------------------------------------------------
// The plans. [video, name, seconds, description]; the views are 'serie.<video>-<name>'.
const PLANS = [
  ['v1', 'placa', 5, 'V1 Acende, plano 1: a placa alta do sol sozinha no escuro, a lâmpada falhando duas vezes e um raio que apaga; câmera fixa, a placa no terço de cima; sem texto'],
  ['v1', 'placa-atras', 4, 'V1 Acende, plano 2: a mesma placa vista da rodovia, por trás, acesa e sozinha no escuro; sem texto'],
  ['v1', 'acostamento', 5, 'V1 Acende, plano 3: o acostamento, a faixa amarela fugindo; um carro passa com os faróis e a câmera sobe até a placa do primeiro plano (o laço); sem texto'],
  ['v2', 'cartaz', 3, 'V2 Cinco coisas paradas, 1: o cartaz do sol e o relógio de parede da loja, câmera baixa; sem texto'],
  ['v2', 'mostrador', 4, 'V2 Cinco coisas paradas, 2: o mostrador de uma bomba corre e para; câmera baixa; sem texto'],
  ['v2', 'cafeteira', 3, 'V2 Cinco coisas paradas, 3: a cafeteira ligada, de perto, em pé; sem texto'],
  ['v2', 'cobertura', 5, 'V2 Cinco coisas paradas, 4: a luminária da cobertura e, abaixo dela, o crachá pendurado, sem destaque; sem texto'],
  ['v2', 'relogio', 4, 'V2 Cinco coisas paradas, 5: o relógio de parede da loja, de perto e de baixo; sem texto'],
  ['v2', 'adesivo', 3, 'V2 Cinco coisas paradas, 6: o adesivo do sol na bomba, de frente e de baixo; sem texto'],
  ['v3', 'longo', V3_DUR, 'V3 Quarenta metros: um só plano, a pé, do acostamento até a cobertura do posto: um carro passa, a placa acende ao longe, sob a cobertura as bombas e as colunas; sem cortes e sem texto'],
  ['v4', 'bomba3', 16, 'V4 Bomba 3: plano fixo da bomba 3 vazia; o carro entra, para, ninguém desce e ele sai; o quadro volta a vazio (laço exato); sem texto'],
  ['v5', 'vitrine', 4, 'V5 A lâmpada, plano 1: a vitrine da loja vista de fora, a loja acesa e vazia no escuro; sem texto'],
  ['v5', 'zumbido', 7.7, 'V5 A lâmpada, plano 2: na loja, a lâmpada que pisca e zumbe e um vulto no canto do olho; sem texto'],
  ['v5', 'porta', 5, 'V5 A lâmpada, plano 3: você olha para trás, a porta entre o escritório e a loja está aberta; corte seco para o preto; sem texto'],
  ['v6', 'cobertura', 6.5, 'V6 Telas, plano 1: sob a cobertura, de relance as câmeras de teto das pontas; sem texto'],
  ['v6', 'cam6-placa', 6.2, 'V6 Telas, plano 2: no estacionamento, a câmera da parede da loja e, longe, a placa com o sorriso largo; sem texto'],
  ['v6', 'monitor', 4.4, 'V6 Telas, plano 3: o monitor do escritório: a grade de seis imagens em preto e branco e depois só a câmera da loja, vazia; sem texto'],
];
const views = {}, plan = {};
let acc = 0, prevVideo = null;
for (const [v, n, d, desc] of PLANS) {
  if (prevVideo && prevVideo !== v) acc += GAP;
  prevVideo = v;
  const name = `${v}-${n}`;
  views[name] = [+acc.toFixed(3), +(acc + d).toFixed(3), desc];
  plan[name] = { name, video: v, t0: +acc.toFixed(3), dur: d };
  acc += d;
}
const D = +acc.toFixed(3);
const T0 = (name) => views[name][0];
const VIDEO0 = Object.fromEntries(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((v) => [v, PLANS.find((p) => p[0] === v) && views[`${v}-${PLANS.find((p) => p[0] === v)[1]}`][0]]));
const VIDEO_LEN = { v1: 14, v2: 22, v3: V3_DUR, v4: 16, v5: 16.7, v6: 17.1 };
const A = (v, rel = 0) => +(VIDEO0[v] + rel).toFixed(3); // a time of the video, in seconds of the cutscene

// ---------------------------------------------------------------------------------------------
// V1 constants. The camera of the first and of the last frame is the same one.
const P1 = [-30, EYE, -24.3];                      // standing on the shoulder
const SIGN = [-14, 4.6, -20.3];                    // where the camera looks at the sign (the lamp sits above the centre)
const ROAD = [22, 1.2, -24.2];                     // down the shoulder, the yellow line running away
const signLit = (r) => !((r >= 1.2 && r < 1.5) || (r >= 2.0 && r < 2.25)); // fails twice (never more than three changes a second)
const signRay = (r) => (r >= 3.3 && r < 3.9 ? 4 : -1);                       // then a ray goes out and comes back

// V4: the bay of pump 3, seen from the lot.
const V4_CAM = { eye: [14.6, 1.3, 2.4], look: [14.9, 1.75, -5.6] };

// V6: the pictures of the cameras (the posto is rendered from cam1 to cam6 at 160 x 120).
const PW = 160, PH = 120;

// ---------------------------------------------------------------------------------------------
export default {
  name: 'serie', filmOnly: true, duration: D, views,
  anchors: { placa: 'A placa alta do sol', cobertura: 'A cobertura das bombas', bomba3: 'A bomba 3 e a baia ao lado', loja: 'A vitrine da loja', monitor: 'O monitor do escritório' },
  sfx: (() => {
    const E = []; const e = (t, name, opts) => E.push({ t: +t.toFixed(3), name, ...(opts ? { opts } : {}) });
    // V1: the highway far off, insects, the lamp of the sign that fails; the car passes and takes its sound with it
    e(A('v1'), 'rodovia', { dur: 14, gain: 0.7 }); e(A('v1'), 'insetos', { dur: 14, gain: 0.6 }); e(A('v1'), 'vento', { dur: 14, gain: 0.45 });
    e(A('v1'), 'fluorescente', { dur: 14, gain: 0.3 });
    e(A('v1', 1.2), 'lampada_estalo'); e(A('v1', 1.5), 'lampada_estalo', { gain: 0.7 }); e(A('v1', 2.0), 'lampada_estalo', { gain: 0.8 }); e(A('v1', 2.25), 'lampada_estalo', { gain: 0.7 });
    e(A('v1', 3.3), 'lampada_estalo', { gain: 0.5 });
    // the car that comes down the highway: the engine swells with it, peaks as it passes (about 11.1 s) and fades out when it is behind the camera
    for (const [t, d, gn] of [[9.3, 0.7, 0.2], [9.8, 0.7, 0.35], [10.3, 0.7, 0.55], [10.7, 0.8, 0.85], [11.1, 0.6, 0.45]]) e(A('v1', t), 'motor_carro', { dur: d, gain: gn, fade: 0.3 });
    // V2: one room tone for all of them, and the sound each thing makes
    e(A('v2'), 'fluorescente', { dur: 22, gain: 0.5 });
    e(A('v2', 3.3), 'bomba_bip', { pos: [8.3, 1.6, -7.2] }); e(A('v2', 3.4), 'bomba_corre', { dur: 2.2, gain: 0.9, pos: [8.5, 1.0, -7.4] }); e(A('v2', 5.7), 'bomba_bip', { pos: [8.3, 1.6, -7.2] });
    e(A('v2', 7), 'cafeteira', { dur: 3, gain: 0.8 });
    e(A('v2', 10), 'insetos', { dur: 5, gain: 0.5 }); e(A('v2', 10), 'vento', { dur: 5, gain: 0.35 });
    e(A('v2', 19.2), 'sol_presenca', { dur: 2.8, gain: 0.6 });
    // V3: the steps (the pace of the walk, none while it stands), the highway that goes away as the walk goes, then the hum of the canopy
    e(A('v3'), 'rodovia', { dur: +V3_CANOPY.toFixed(2), gain: 0.8 }); e(A('v3'), 'insetos', { dur: V3_DUR, gain: 0.7 }); e(A('v3'), 'vento', { dur: +V3_CANOPY.toFixed(2), gain: 0.8 });
    for (const [f0, f1] of [[0.4, V3_TP - 0.4], [V3_TP + V3_PAUSE + 0.6, V3_END - 0.6]]) for (const f of footfalls(f0, f1, V3_FREQ, { gain: 0.5 }, 'passo_asfalto')) e(A('v3', f.t), 'passo_asfalto', f.opts);
    // the car that overtakes the walker (about 4.5 s) and goes away ahead: swell, peak, fade
    for (const [t, d, gn] of [[2.8, 0.8, 0.25], [3.5, 0.8, 0.5], [4.1, 0.8, 0.9], [4.7, 0.9, 0.7], [5.4, 1.0, 0.4], [6.2, 1.0, 0.2]]) e(A('v3', t), 'motor_carro', { dur: d, gain: gn, fade: 0.3 });
    e(A('v3', V3_TP + 0.8), 'lampada_estalo'); e(A('v3', V3_TP + 1.6), 'lampada_estalo', { gain: 0.8 }); e(A('v3', V3_TP + 2.3), 'lampada_estalo', { gain: 0.7 });
    e(A('v3', V3_L), 'fluorescente', { dur: +(V3_CANOPY + 1 - V3_L).toFixed(2), gain: 0.4 }); e(A('v3', V3_CANOPY - 0.5), 'fluorescente', { dur: +(V3_DUR - V3_CANOPY + 0.5).toFixed(2), gain: 0.7 });
    // V4: the engine comes in and goes out with the car; in between only the hum of the canopy
    e(A('v4'), 'rodovia', { dur: 16, gain: 0.5 }); e(A('v4'), 'insetos', { dur: 16, gain: 0.5 }); e(A('v4'), 'fluorescente', { dur: 16, gain: 0.55 });
    e(A('v4', 2.7), 'motor_carro', { dur: 3.0, gain: 0.8, fade: 0.5, pos: [15, 1, -4.8] }); e(A('v4', 12.1), 'motor_carro', { dur: 2.9, gain: 0.8, fade: 0.5, pos: [15, 1, -4.8] });
    // V5: the hum, the flicker, then only the highway; the sound ends with the cut
    e(A('v5'), 'fluorescente', { dur: 11.7, gain: 0.7 }); e(A('v5', 4), 'fluorescente', { dur: 7.7, gain: 0.5 });
    e(A('v5', 5.9), 'lampada_estalo', { gain: 0.6 }); e(A('v5', 7.0), 'lampada_estalo', { gain: 0.6 }); e(A('v5', 9.3), 'lampada_estalo', { gain: 0.5 });
    e(A('v5', 11.7), 'rodovia', { dur: 4.7, gain: 0.8 }); e(A('v5', 11.7), 'insetos', { dur: 4.7, gain: 0.6 });
    // V6: the hum of the canopy, the wind, the static of the monitor and the click of the change
    e(A('v6'), 'fluorescente', { dur: 12.7, gain: 0.6 }); e(A('v6'), 'vento', { dur: 12.7, gain: 0.55 }); e(A('v6', 6.5), 'insetos', { dur: 6.2, gain: 0.55 });
    e(A('v6', 12.7), 'estatica_camera', { dur: 4.4, gain: 0.5 }); e(A('v6', 12.7), 'fluorescente', { dur: 4.4, gain: 0.5 }); e(A('v6', 15.2), 'tecla', { gain: 0.5 });
    return E.sort((a, b) => a.t - b.t);
  })(),

  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const W = ctx.world();
    const g = new T.Group();
    const subs = {};
    const sub = (def, key) => { if (!subs[key]) { const i = def.build(ctx); if (i.group) { g.add(i.group); i.group.visible = false; } subs[key] = i; } return subs[key]; };
    const only = (key) => { for (const [k, i] of Object.entries(subs)) if (i.group) i.group.visible = k === key; };

    // the car on the highway (V1 and V3)
    const hwy = buildCar(r, { seed: 9, fuel: 'comum', capSide: 'left' }); hwy.setDriver(true); hwy.setLights(true); g.add(hwy.root);
    // the car that stops at pump 3 with nobody in it (V4): the same one as the shift "noites"
    const empty = pumpCar(r, W, 3, { tIn: -9, tOut: 12.3, seed: 33, fuel: 'etanol', style: 'sedan', driver: false, lights: true });
    g.add(empty.car.root);
    // the figure that crosses the corner of the eye (V5)
    const vulto = buildCustomer(r, castSpec(ctx.cast, 'frentista-antigo', { categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }), { seed: 5 });
    g.add(vulto.root); vulto.root.visible = false;
    // the cups and the coffee machine are part of the posto; the camera pictures of V6:
    const rt = new T.WebGLRenderTarget(PW, PH, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    const aux = new T.PerspectiveCamera(62, PW / PH, 0.45, 60);
    const px = new Uint8Array(PW * PH * 4), id = new ImageData(PW, PH);
    const pics = Array.from({ length: 6 }, () => { const c = document.createElement('canvas'); c.width = PW; c.height = PH; return c; });
    const sheet = document.createElement('canvas'); sheet.width = PW * 2; sheet.height = PH * 3; // the six pictures, two by three: the screen of the monitor in the tall frame
    const shoot = (i, t) => {
      const a = W.anchors['cam' + (i + 1)]; aux.position.copy(a.pos); aux.up.set(0, 1, 0);
      aux.lookAt(i === 0 ? new T.Vector3(12.3, 1.35, 9.7) : a.pos.clone().add(a.dir)); aux.updateMatrixWorld();
      aux.fov = i === 0 ? 34 : 62; aux.updateProjectionMatrix();
      const prev = r.renderer.getRenderTarget();
      r.renderer.setRenderTarget(rt); r.renderer.render(r.scene, aux); r.renderer.readRenderTargetPixels(rt, 0, 0, PW, PH, px); r.renderer.setRenderTarget(prev);
      const d = id.data;
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        const s = ((PH - 1 - y) * PW + x) * 4, o = (y * PW + x) * 4;
        const L = Math.min(255, Math.max(0, ((0.3 * px[s] + 0.59 * px[s + 1] + 0.11 * px[s + 2]) - 14) * 2.3) + ((x + y + Math.floor(t * 12)) % 7 === 0 ? 10 : 0));
        d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
      }
      pics[i].getContext('2d').putImageData(id, 0, 0);
      return pics[i];
    };

    const planAt = (t) => { let best = Object.values(plan)[0]; for (const p of Object.values(plan)) if (p.t0 <= t + 1e-9) best = p; return best; };
    // the picture of a cutscene that already exists, with what is not picture taken off
    const borrow = (def, key, view, rel, ambient, rate = 1) => {
      const inst = sub(def, key); only(key);
      const tt = def.views[view][0] + rel * rate;
      const f = inst.pose(tt, ambient ?? tt);
      return { ...f, dialog: null, sheet: null, card: null, fade: 0, flashes: [] };
    };

    const FOG_ROAD = [14, 70];
    const ROAD_AMB = 0x585d78;
    const base = (o) => ({ ambient: undefined, ...o });

    return {
      group: g, hands: false, world: false,
      anchors: { placa: () => W.p('placaSol'), cobertura: () => W.p('carroBomba2', 3.9), bomba3: () => W.p('bomba3', 1), loja: () => W.p('porta-loja', 1.2), monitor: () => W.p('monitorTela') },
      pose(t) {
        const p = planAt(t), rel = clamp(t - p.t0, 0, p.dur), n = p.name;
        only(null); hwy.root.visible = false; empty.car.root.visible = false; vulto.root.visible = false;
        const lowCam = (eye, look, o = {}) => ({ eye, look, roll: 0, ...o });
        let f;
        switch (n) {
          // ------------------------------------------------------------------------------- V1
          case 'v1-placa': {
            const AMB = 100;
            f = lowCam(P1, SIGN, { world: { ambient: ROAD_AMB, fog: FOG_ROAD, state: { hora: 0.1 }, sign: { on: signLit(rel), smile: 0, ray: signRay(rel) } } });
            f.amb = AMB; break;
          }
          case 'v1-placa-atras': {
            const k = smooth(rel / 4);
            f = lowCam([lerp(-4.2, -5.6, k), EYE, lerp(-27.0, -26.4, k)], [-14, lerp(5.4, 5.5, k), -20.3], { world: { fog: FOG_ROAD, state: { hora: 0.3 }, sign: { on: true, smile: 1, ray: -1 } } });
            f.amb = 100; break;
          }
          case 'v1-acostamento': {
            // the car comes down the highway at us and passes at 2.2 s, then the head comes up to the sign
            const x = 36 - 30 * rel; hwy.root.visible = x > -76 && x < 60; hwy.root.position.set(x, 0, -27.0); hwy.root.rotation.y = -Math.PI / 2; hwy.update(rel); // westbound, headlights on us
            const k = smooth(ramp(rel, 2.9, 4.8));
            f = lowCam(P1, [lerp(ROAD[0], SIGN[0], k), lerp(ROAD[1], SIGN[1], k), lerp(ROAD[2], SIGN[2], k)], { world: { ambient: ROAD_AMB, fog: FOG_ROAD, state: { hora: 0.1 }, sign: { on: true, smile: 0, ray: -1 } } });
            f.amb = 100; break;
          }
          // ------------------------------------------------------------------------------- V2
          case 'v2-cartaz': {
            f = lowCam([11.15 + rel * 0.02, 0.9, 9.1], [11.15, 1.5, 11.9], { fovK: 0.8, world: { state: { hora: 0.3 }, sign: { on: false, smile: 0, ray: -1 } } });
            break;
          }
          case 'v2-mostrador': {
            const v = 41.3 + 8.7 * smooth(ramp(rel, 0.3, 2.6));
            const text = (' ' + v.toFixed(2).replace('.', ',')).slice(-6);
            f = lowCam([8.15, 0.85, -6.3], [8.3, 1.55, -7.6], { world: { state: { hora: 0.5 }, displays: { 2: text } } });
            break;
          }
          case 'v2-cafeteira': {
            f = lowCam([15.25 + rel * 0.01, 1.0, 5.95], [15.5, 1.12, 4.9], { fovK: 0.7, world: { state: { hora: 3.55 }, cups: 1, brewing: true } });
            break;
          }
          case 'v2-cobertura': {
            f = lowCam([19.5, 0.8, -6.3], [19.5, 3.4, -7.8], { world: { state: { hora: 3.2 }, ambient: 0x474b5c } });
            break;
          }
          case 'v2-relogio': {
            f = lowCam([9.6, 1.5, 11.05], [9.6, 2.45, 11.9], { fovK: 0.7, world: { state: { hora: 5.62 + 0.04 * rel } } });
            break;
          }
          case 'v2-adesivo': {
            f = lowCam([8.5, 0.75, -6.5], [8.5, 1.0, -7.6], { world: { state: { hora: 5.2 } } });
            break;
          }
          // ------------------------------------------------------------------------------- V3
          case 'v3-longo': {
            const c = v3Cam(rel), b = bob(rel, v3Amp(rel) * 0.9, V3_FREQ);
            const x = -70 + (rel - V3_CAR) * 26; hwy.root.visible = x > -76 && x < 60; hwy.root.position.set(x, 0, -28.5); hwy.root.rotation.y = Math.PI / 2; hwy.update(rel);
            f = lowCam([c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]], c.look, { roll: b[2], world: { ambient: ROAD_AMB, fog: FOG_ROAD, state: { hora: 0.1 }, sign: { on: v3SignOn(rel), smile: 0, ray: v3Ray(rel) } } });
            break;
          }
          // ------------------------------------------------------------------------------- V4
          case 'v4-bomba3': {
            empty.pose(rel); { const cx = empty.car.root.position.x; if (cx > 22 || cx < 7) empty.car.root.visible = false; } // outside the frame at both ends
            f = lowCam(V4_CAM.eye, V4_CAM.look, { world: { state: { hora: 1.7 } } });
            f.amb = 100; break;
          }
          // ------------------------------------------------------------------------------- V5
          case 'v5-vitrine': {
            f = lowCam([8.6, 1.2, 0.3], [9.0, 1.45, 5.6], { world: { state: { hora: 3.0 } } });
            break;
          }
          case 'v5-zumbido': {
            f = borrow(noites, 'noites', 'c42-zumbido', rel, 1000 + rel);
            break;
          }
          case 'v5-porta': {
            f = borrow(corte, 'corte', 'c56-porta', rel, 2000 + rel);
            f.fade = rel >= 4.7 ? 1 : 0; // the cut: the last third of a second is black, with no ramp
            break;
          }
          // ------------------------------------------------------------------------------- V6
          case 'v6-cobertura': {
            // the ceiling camera stays in the frame: cam3 at the east end, then (a cut) cam2 at the west end; no car
            const first = rel < 3.25;
            f = lowCam(first ? [24.2 + 0.03 * rel, EYE, -3.8] : [0.8 + 0.03 * (rel - 3.25), EYE, -3.8], first ? [24.55, 3.85, -6.5] : [0.45, 3.85, -6.5], { fovK: 0.8, world: { state: { hora: 0.35 } } });
            break;
          }
          case 'v6-cam6-placa': {
            f = borrow(noites, 'noites', 'c40-placa-cam6', rel, 4000 + rel);
            break;
          }
          case 'v6-monitor': {
            const grid = rel < 2.4;
            f = lowCam([5.0 + 0.6 * smooth(rel / 2), 1.5 - 0.06 * smooth(rel / 2), 15.8 + 1.5 * smooth(rel / 2)], [5.95, 1.0, 18.8], { world: { state: { telefoneToca: false, hora: 5.9, doors: { 'porta-escritorio': 1 } }, on: ['escritorio-teto'] }, noise: 0.07 });
            f.late = (ff) => {
              if (grid) {
                const sg = sheet.getContext('2d'); sg.imageSmoothingEnabled = false;
                for (let i = 0; i < 6; i++) sg.drawImage(shoot(i, t), (i % 2) * PW, Math.floor(i / 2) * PH);
                ff.screen = { kind: 'cam', image: sheet, label: '', zoom: 1, at: [0.5, 0.5] };
              } else ff.screen = { kind: 'cam', image: shoot(0, t), label: '', zoom: 1.0 + 0.12 * smooth(ramp(rel, 2.4, 4.4)), at: [0.5, 0.5] };
            };
            break;
          }
          default: f = lowCam([0, EYE, 0], [0, EYE, 1]);
        }
        void base; void only;
        f.fade = f.fade ?? 0; f.dialog = null; f.sheet = null; f.card = null; f.flashes = [];
        // the ambient time given to the posto: constant in the loops, so the first frame and the last one are the same
        W.group.visible = true;
        W.pose(f.amb ?? t, { eye: f.eye, ...(f.world ?? {}) }, { reduce: ctx.reduceFlash });
        f.world = undefined;
        return f;
      },
    };
  },
};
