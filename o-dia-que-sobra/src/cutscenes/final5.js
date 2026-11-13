// Ending 5, "final5" (the secret ending): the sign of the Sun lit and grinning; at the breaker panel the hand throws the
// switch of the sign; the sign goes dark. In the back row of the car park the abandoned car lights its headlights,
// backs out and drives away along the highway with nobody in it. Then the calendar of the office, close: a page of
// the month of the old promotion, and one day circled by hand. First person, 45 s. Two thoughts.
// The page names the month and the year and marks the day by hand; it never writes the date as an answer.
import { ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { toCam } from './stagecraft.js';
import { aimTrack, aimAt, fadeInOut, makeCalendarPage, drivePath, EYE, PI } from './finais-kit.js';

const D = 45;
const views = {
  placa: [0, 5, 'A placa do Sol, acesa, o sorriso largo, vista de baixo; o zumbido da lâmpada'],
  quadro: [5, 13, 'O quadro de força: a porta se abre, a mão chega à chave da placa e a desliga'],
  apagada: [13, 20, 'A placa apagada, parada no escuro; só o poste do estacionamento e o silêncio'],
  carro: [20, 35, 'No estacionamento, o carro abandonado acende os faróis, dá ré e vai embora pela rodovia, sem ninguém dentro'],
  calendario: [35, 45, 'O calendário do escritório, de perto: com uma folga marcada à mão'],
};
const SAY = dialogue([
  { t: 29.0, who: '', text: 'Não tem ninguém dentro.', seed: BABBLE_SEEDS.heitor, hold: 1.8 },
  { t: 37.8, who: '', text: 'Uma folga. Era só isso.', seed: BABBLE_SEEDS.heitor, hold: 2.2 },
]);

const SIGN = [-14, 8.2, -20.3];
const SV = [-14, EYE, -15.0];
const sa = aimAt(SV, SIGN);
// the breaker panel: stand at its front, the right hand to the sign's switch
const PQ = [19.1, 1.5, 12.8], panelLook = [19.15, 1.28, 12.2];
const LEVER_T = 11.0;                          // the switch goes down
// the car park
const CAR_ID = 'carro-valdir', CAR_T0 = 21.4;
const route = drivePath([[-14.4, 18.5], [-12.65, 13.5], [-12.65, -8], [-12.6, -27], [-12.6, -31.1], [-34, -31.4], [-140, -31.4]],
  { reverse: { from: [-18.9, 18.5], yaw: -PI / 2 }, hold: 0.7, vmax: 5.2, vhigh: 13, highFrom: 52, corner: 4.2 });
const LOT = [-8.6, EYE, 8.0];
// the calendar
const CAL_EYE0 = [7.95, 1.62, 13.5], CAL_EYE1 = [8.3, 1.56, 12.78], CAL_LOOK = [8.3, 1.55, 12.1], CAL_LOOK1 = [8.3, 1.33, 12.1];

const cam = aimTrack([
  { t: 0, eye: SV, yaw: sa.yaw, pitch: sa.pitch },
  { t: 5, eye: [SV[0], SV[1], SV[2] - 0.5], yaw: sa.yaw, pitch: sa.pitch + 0.03 },
  { t: 5.001, eye: [19.0, EYE, 13.9], yaw: PI, pitch: -0.05 },
  { t: 9.0, eye: PQ, yaw: aimAt(PQ, panelLook).yaw, pitch: aimAt(PQ, panelLook).pitch },
  { t: 13, eye: PQ, yaw: aimAt(PQ, panelLook).yaw, pitch: aimAt(PQ, panelLook).pitch },
  { t: 13.001, eye: SV, yaw: sa.yaw, pitch: sa.pitch + 0.03 },
  { t: 19.9, eye: SV, yaw: sa.yaw + 0.01, pitch: sa.pitch + 0.0 },
  { t: 20, eye: LOT, yaw: 0, pitch: 0 },       // the lot: the yaw is taken from the car (see pose)
  { t: 35, eye: LOT, yaw: 0, pitch: 0 },
  { t: 35.001, eye: CAL_EYE0, yaw: aimAt(CAL_EYE0, CAL_LOOK).yaw, pitch: aimAt(CAL_EYE0, CAL_LOOK).pitch },
  { t: 42, eye: CAL_EYE1, yaw: aimAt(CAL_EYE1, CAL_LOOK1).yaw, pitch: aimAt(CAL_EYE1, CAL_LOOK1).pitch },
  { t: 45, eye: CAL_EYE1, yaw: aimAt(CAL_EYE1, CAL_LOOK1).yaw, pitch: aimAt(CAL_EYE1, CAL_LOOK1).pitch },
]);

export default {
  name: 'final5', duration: D, views,
  anchors: { placa: 'A placa do Sol', quadro: 'O quadro de força e a chave da placa', carro: 'O carro abandonado do estacionamento', calendario: 'O calendário do escritório' },
  sfx: [
    { t: 0, name: 'rodovia', opts: { dur: 11, gain: 0.45 } },
    { t: 0, name: 'insetos', opts: { dur: 11, gain: 0.4 } },
    { t: 0, name: 'sol_presenca', opts: { dur: LEVER_T, gain: 0.6 } },
    { t: 0, name: 'fluorescente', opts: { dur: LEVER_T, gain: 0.5 } },
    { t: 5.4, name: 'porta_range', opts: { pos: [18.7, 1.3, 12.2], gain: 0.7 } },
    { t: LEVER_T, name: 'disjuntor', opts: { pos: [19.2, 1.2, 12.3] } },
    { t: LEVER_T + 0.2, name: 'lampada_estalo', opts: { gain: 0.8 } },
    { t: 13.2, name: 'vento', opts: { dur: 22, gain: 0.35 } },
    { t: 13.2, name: 'insetos', opts: { dur: 7, gain: 0.3 } },
    { t: CAR_T0 + 0.6, name: 'motor_sem_som', opts: { gain: 0.8 } },
    { t: CAR_T0 + 1.6, name: 'motor_carro', opts: { dur: 11, gain: 0.8 } },
    { t: 35.2, name: 'fluorescente', opts: { dur: 9.8, gain: 0.45 } },
    { t: 35.2, name: 'insetos', opts: { dur: 9.8, gain: 0.25 } },
    ...SAY.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const car = W.posto.cars[CAR_ID];
    const home = { pos: car.root.position.clone(), ry: car.root.rotation.y };
    const restore = () => { car.root.position.copy(home.pos); car.root.rotation.y = home.ry; car.setLights(false); };
    // the page of the calendar, laid over the one on the wall
    const calProp = W.posto.props.calendario;
    const bb = new T.Box3().setFromObject(calProp.dyn);
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
    const page = makeCalendarPage(r, {
      header: 'DEZEMBRO', sub: '1998', firstCol: 2, days: 31, rows: 5, seed: 1998, sun: 0.9, reserve: 0.1,
      marks: [{ day: 13, kind: 'circle' }], notes: [{ x: 0.28, y: 0.97, text: 'folga', size: 0.075, rot: -0.05 }],
    }, [bb.max.x - bb.min.x + 0.02, bb.max.y - bb.min.y + 0.02], [256, 312]);
    page.position.set(cx, cy, bb.max.z + 0.004); g.add(page);
    const lever = W.posto.breakers.switches.placa.pivot, lp = new T.Vector3();
    return {
      group: g, hands: true, arms: hands.arms,
      show(v) { g.visible = v; if (!v) restore(); },
      anchors: { placa: () => SIGN, quadro: () => [19.18, 1.18, 12.3], carro: () => [-18.9, 1.0, 18.5], calendario: () => [cx, cy, bb.max.z] },
      pose(t, ambient) {
        const { rig } = hands;
        let c = cam(t);
        const lot = t >= 20 && t < 35, cal = t >= 35;
        // ---- the car: it is the abandoned car of the back row; it goes, and the posto gets it back when the cutscene is hidden
        let carPos = [-18.9, 0, 18.5];
        if (lot) {
          const p = route.pose(t - CAR_T0);
          if (t >= CAR_T0) { car.root.position.set(p.x, 0, p.z); car.root.rotation.y = p.yaw; carPos = [p.x, 0, p.z]; } else restore();
          car.setLights(t >= 21.8);
          // the head follows the car, a little behind it
          const pl = route.pose(t - CAR_T0 - 0.35), tgt = t >= CAR_T0 ? [pl.x, 0.9, pl.z] : [-18.9, 1.0, 18.5];
          const a = aimAt(c.eye, tgt), k = smooth(ramp(t, 20, 21.2));
          const a0 = aimAt(c.eye, [-18.9, 1.0, 18.5]);
          c = { eye: c.eye, yaw: lerp(a0.yaw, a.yaw, k), pitch: lerp(a0.pitch, a.pitch, k) };
          const look = [c.eye[0] + Math.sin(c.yaw) * Math.cos(c.pitch) * 10, c.eye[1] + Math.sin(c.pitch) * 10, c.eye[2] + Math.cos(c.yaw) * Math.cos(c.pitch) * 10];
          c.look = look;
        } else restore();
        // ---- the breaker panel and the hand
        const panel = t >= 5 && t < 13;
        const quadroAberto = panel ? smooth(ramp(t, 5.7, 6.9)) : 0;
        rig.hang(Math.sin(t * 1.1));
        if (panel) {
          lever.updateWorldMatrix(true, false); lever.getWorldPosition(lp);
          const press = smooth(ramp(t, 10.3, 11.0)) * (1 - smooth(ramp(t, 11.3, 12.3)));
          const reach = smooth(ramp(t, 8.2, 9.9)) * (1 - smooth(ramp(t, 11.5, 12.6)));
          const tgt = toCam(T, c.eye, c.look, [lp.x, lp.y + 0.04 - 0.07 * press, lp.z + 0.1]);
          if (reach > 0) rig.reach('right', [lerp(0.22, tgt[0], reach), lerp(-0.4, tgt[1], reach), lerp(-0.34, Math.min(tgt[2], -0.2), reach)]);
        }
        const off = t >= LEVER_T;
        const fade = fadeInOut(t, 0, 0.9, 44.0, 44.95) + 0;
        // cuts: a short dip at each hard cut (never longer than a blink)
        const cutDip = [5, 13, 20, 35].reduce((m, c0) => Math.max(m, t >= c0 && t < c0 + 0.5 ? 1 - smooth(ramp(t, c0 + 0.05, c0 + 0.5)) : 0), 0);
        const dimLights = {};
        return {
          eye: c.eye, look: c.look, roll: 0, fovK: lot || panel || cal ? 1 : 0.78, fade: Math.min(1, Math.max(fade, cutDip)), dialog: SAY.at(t),
          world: {
            ambient: cal || panel ? 0x585d78 : lot ? 0x6a6e88 : 0x4a4e64,
            state: { hora: 5.97, quadroAberto },
            sign: { on: !off, smile: 1, ray: -1 }, off: off ? ['placa'] : [],
            on: cal ? ['escritorio-teto'] : panel ? ['servico'] : [], dimLights,
          },
          late() { void carPos; void ambient; },
        };
      },
    };
  },
};
