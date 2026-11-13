// Ending 1, "final1" (O Dia que Sobra): the dawn of the 28th day. The manager arrives by car with the new calendar
// and hands it over; Heitor goes home on foot along the shoulder, the rod of his father in his hand; he stops and
// looks back: the sign of the Sun, unlit, with its back to the highway. First person, 44 s. Two boxes, no more.
import { bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { pumpCar, camPoint, toCam } from './stagecraft.js';
import { aimTrack, aimAt, lookFrom, fadeInOut, dawn, buildManager, makeVara, makeCalendarPage, placeInCam, EYE, PI } from './finais-kit.js';

const D = 44;
const views = {
  amanhecer: [0, 12, 'O amanhecer do 28º dia, na frente da loja: o carro do gerente chega à bomba 1 e ele desce com um calendário na mão'],
  calendario: [12, 22, 'O gerente entrega o calendário novo, sem marcas, e diz uma frase; as suas mãos o pegam'],
  estrada: [22, 36, 'A pé pelo acostamento da rodovia, a luz fria da manhã, a vara de pesca do pai na mão'],
  placa: [36, 44, 'Ele para e se vira: a placa do Sol, apagada, de costas para a rodovia'],
};

const SAY = dialogue([
  { t: 12.4, who: 'Gerente', text: 'Calendário novo. Agora descansa.', seed: BABBLE_SEEDS.gerente, hold: 1.4 },
  { t: 37.6, who: '', text: 'Um dia só meu.', seed: BABBLE_SEEDS.heitor, hold: 2.4 },
]);

// the manager: from the car at pump 1 to the front of Heitor
const E1 = [9.0, EYE, 1.0];                                  // where Heitor stands, under the front of the canopy
const WALK = [[7.0, 4.3, -3.6], [11.6, 8.5, -0.55]];         // [t, x, z]
const mgrAt = (t) => { const u = Math.min(1, Math.max(0, (t - WALK[0][0]) / (WALK[1][0] - WALK[0][0]))); return [lerp(WALK[0][1], WALK[1][1], u), lerp(WALK[0][2], WALK[1][2], u), u]; };

// the road: west along the shoulder, then the turn toward the sign
const R0 = [-23.0, EYE, -24.1], R1 = [-39.2, EYE, -24.1];
const SIGN = [-14, 8.4, -20.3];
const endAim = aimAt(R1, SIGN);
const cam = aimTrack([
  { t: 0, eye: E1, yaw: -2.25, pitch: -0.03 },
  { t: 6.5, eye: E1, yaw: -2.4, pitch: -0.03 },
  { t: 10.6, eye: E1, yaw: -2.82, pitch: -0.02 },      // follows the manager as he walks up
  { t: 14.5, eye: E1, yaw: -2.84, pitch: -0.36 },       // down at the calendar
  { t: 18.5, eye: E1, yaw: -2.84, pitch: -0.36 },
  { t: 21.4, eye: E1, yaw: -2.9, pitch: -0.05 },
  { t: 22, eye: R0, yaw: -PI / 2, pitch: -0.03 },
  { t: 35.6, eye: R1, yaw: -PI / 2, pitch: -0.03, ease: 'lin' },
  { t: 36.5, eye: R1, yaw: -PI / 2, pitch: -0.03 },
  { t: 40.0, eye: R1, yaw: endAim.yaw, pitch: endAim.pitch },
  { t: 44, eye: R1, yaw: endAim.yaw + 0.03, pitch: endAim.pitch + 0.02 },
]);
const walking = (t) => (t >= 22 && t < 35.6 ? 1 : 0);

export default {
  name: 'final1', duration: D, views,
  anchors: { calendario: 'O calendário novo nas mãos do gerente', vara: 'A vara de pesca do pai, na mão de Heitor', placa: 'A placa do Sol, de costas para a rodovia' },
  sfx: [
    { t: 0, name: 'vento', opts: { dur: 22, gain: 0.55 } },
    { t: 0, name: 'insetos', opts: { dur: 22, gain: 0.35 } },
    { t: 1.0, name: 'motor_carro', opts: { dur: 5.2, gain: 0.7, pos: [4, 1, -4.8] } },
    { t: 6.9, name: 'porta_fecha', opts: { pos: [4, 1, -4.8], gain: 0.7 } },
    ...footfalls(7.4, 11.6, 1.9, { gain: 0.35, pos: [6.5, 0, -2] }, 'passo_asfalto'),
    { t: 14.0, name: 'nota', opts: { gain: 0.5 } },
    { t: 22, name: 'vento', opts: { dur: 22, gain: 0.7 } },
    { t: 22, name: 'insetos', opts: { dur: 14, gain: 0.3 } },
    ...footfalls(22.2, 35.4, 1.9, { gain: 0.5 }, 'passo_asfalto'),
    ...SAY.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const car = pumpCar(r, W, 1, { tPark: 6.2, seed: 3, fuel: 'comum', driver: false, lights: false });
    g.add(car.car.root);
    const mgr = buildManager(r); g.add(mgr.root);
    const cal = makeCalendarPage(r, { firstCol: 0, days: 28, rows: 4, seed: 28, sun: 0.1 }); g.add(cal);
    const vara = makeVara(r); g.add(vara);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { calendario: () => [8.3, 1.2, -0.3], vara: () => [-30, 1.2, -24.1], placa: () => SIGN },
      pose(t, ambient) {
        const { rig } = hands;
        const c = cam(t), road = t >= 22;
        const b = bob(t, walking(t) * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]];
        let look = c.look;
        car.pose(t); car.car.setLights(t >= 1.0 && t < 6.6);
        // the manager steps out at 6.9, walks to Heitor, stays; he leaves the frame only when the cut comes
        const [mx, mz, u] = mgrAt(t);
        mgr.root.visible = !road && t >= 6.9;
        const myaw = u < 1 ? Math.atan2(WALK[1][1] - WALK[0][1], WALK[1][2] - WALK[0][2]) : Math.atan2(E1[0] - mx, E1[2] - mz);
        mgr.root.position.set(mx, 0, mz); mgr.root.rotation.y = u < 1 ? myaw : myaw;
        mgr.update(t, u > 0 && u < 1 ? { andando: 1, fase: t * 6.8 } : { pose: 'parado', falando: SAY.at(t) !== null, olhar: 0 });
        // the new calendar: in his hand, then in ours (13.0 to 14.8), then held low
        const give = smooth(ramp(t, 13.0, 14.8));
        const fwd = new T.Vector3(Math.sin(myaw), 0, Math.cos(myaw));
        const fromHand = new T.Vector3(mx, 1.12, mz).addScaledVector(fwd, 0.45);
        const own = camPoint(T, eye, look, [0.0, -0.17, -0.6]);
        cal.visible = !road && t >= 6.9;
        cal.position.copy(fromHand).lerp(own, give);
        cal.lookAt(cal.position.clone().add(new T.Vector3().subVectors(new T.Vector3(...eye), cal.position)));
        // our hands
        rig.hang(Math.sin(t * 1.2));
        if (!road && t >= 12.6 && t < 21) { const k = smooth(ramp(t, 12.6, 13.6)) * (1 - smooth(ramp(t, 19.6, 21))); rig.reach('right', [lerp(0.22, 0.12, k), lerp(-0.4, -0.34, k), lerp(-0.34, -0.5, k)]); rig.reach('left', [lerp(-0.22, -0.12, k), lerp(-0.4, -0.34, k), lerp(-0.34, -0.5, k)]); }
        if (!road && t >= 13.0) cal.visible = t < 21.2;
        // the rod: held by the right hand, the tip up and forward, swaying with the steps
        vara.visible = road;
        if (road) {
          const sway = Math.sin(t * 1.9 * PI) * 0.03 * walking(t);
          placeInCam(T, vara, eye, look, [0.2, -0.22, -0.5], [0.55 + sway, 0.1, 0.0]);
          rig.curl('right', 0.8); rig.reach('right', toCam(T, eye, look, vara.position.toArray()).map((v, i) => (i === 2 ? Math.min(v, -0.32) : v)));
        }
        const fade = fadeInOut(t, 0, 0.8, 21.2, 21.95) * (t < 22 ? 1 : 0) + (t >= 22 ? fadeInOut(t, 22, 22.7, 42.6, 43.97) : 0);
        const k = smooth(ramp(t, 0, 2.5)) * 0.8 + 0.2;
        return {
          eye, look, roll: b[2], fade: Math.min(1, fade), dialog: SAY.at(t),
          world: { ambient: 0x9c98a4, state: { hora: 5.9 }, fog: [18, 125], sign: { on: false, smile: 0, ray: -1 }, off: ['placa'] },
          late() { dawn(r, k); },
        };
        void ambient; void lookFrom;
      },
    };
  },
};
