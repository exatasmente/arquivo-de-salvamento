// Ending 2, "final2" (Demissão): in the store, the manager takes the vest back ("Meta é meta."); Heitor leaves by the
// glass door into the night and, from the forecourt, looks back: somebody in the old uniform stands behind the counter.
// First person, 38 s. Two short boxes of the manager, nothing from Heitor: the ending explains nothing.
import { bob, footfalls, ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { makeVest } from './stagecraft.js';
import { aimTrack, aimAt, fadeInOut, buildManager, buildOldAttendant, placeInCam, EYE, PI } from './finais-kit.js';
import { camPoint } from './stagecraft.js';

const D = 38;
const views = {
  balcao: [0, 12, 'Na loja, o gerente de frente: "Meta é meta." Ele estende as mãos e Heitor lhe devolve o colete'],
  saida: [12, 23, 'Heitor sai: a porta de vidro, o sino, a noite lá fora, e ele se afasta pelo pátio'],
  'olhar-atras': [23, 38, 'Ele olha para trás, pela vidraça: atrás do balcão, de uniforme antigo, alguém que não estava lá'],
};
const SAY = dialogue([
  { t: 1.4, who: 'Gerente', text: 'Meta é meta.', seed: BABBLE_SEEDS.gerente, hold: 1.0 },
  { t: 4.4, who: 'Gerente', text: 'O colete.', seed: BABBLE_SEEDS.gerente, hold: 1.2 },
]);

const E0 = [9.0, EYE, 5.0], MGR = [9.8, 6.9];
const toMgr = aimAt(E0, [MGR[0], 1.4, MGR[1]]);
const OUT = [10.2, EYE, -0.9], FIG = [13.3, 9.45];
const back = aimAt(OUT, [FIG[0], 1.45, FIG[1]]);
const cam = aimTrack([
  { t: 0, eye: E0, yaw: toMgr.yaw, pitch: -0.08 },
  { t: 9.0, eye: E0, yaw: toMgr.yaw + 0.02, pitch: -0.05 },
  { t: 11.8, eye: E0, yaw: PI - 0.05, pitch: 0.0 },                        // turns to the door
  { t: 12.6, eye: E0, yaw: PI - 0.05, pitch: 0.0 },
  { t: 15.0, eye: [9.0, EYE, 3.2], yaw: PI, pitch: 0.0, ease: 'lin' },
  { t: 17.5, eye: [9.0, EYE, 0.2], yaw: PI, pitch: 0.0, ease: 'lin' },
  { t: 22.5, eye: OUT, yaw: 2.95, pitch: -0.02 },                           // out into the forecourt
  { t: 24.7, eye: OUT, yaw: back.yaw, pitch: back.pitch },                  // and turns round
  { t: 37.9, eye: OUT, yaw: back.yaw + 0.01, pitch: back.pitch + 0.01 },
]);
const walkIn = (t) => (t >= 12.6 && t < 22.4 ? 1 : 0);

export default {
  name: 'final2', duration: D, views,
  anchors: { gerente: 'O gerente, de frente, com o colete nas mãos', porta: 'A porta de vidro da loja', balcao: 'O balcão visto de fora, pela vidraça' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.7 } },
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.35 } },
    { t: 7.0, name: 'nota', opts: { gain: 0.5 } },
    ...footfalls(12.8, 16.2, 1.9, { gain: 0.5 }, 'passo_azulejo'),
    { t: 15.0, name: 'porta_abre' }, { t: 15.5, name: 'porta_sino' },
    ...footfalls(16.4, 22.4, 1.9, { gain: 0.5 }, 'passo_asfalto'),
    { t: 19.6, name: 'porta_fecha', opts: { pos: [9, 1, 2.2], gain: 0.6 } },
    { t: 25.4, name: 'respiracao', opts: { dur: 8, gain: 0.45 } },
    { t: 29.5, name: 'lampada_estalo', opts: { pos: [11, 3, 6], gain: 0.7 } },
    ...SAY.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const mgr = buildManager(r); g.add(mgr.root);
    const old = buildOldAttendant(r, ctx); g.add(old.root); old.root.position.set(FIG[0], 0, FIG[1]); old.root.rotation.y = PI; old.setPose('fixo', 0);
    const vest = makeVest(r); g.add(vest);
    const J = mgr.joints;
    const myaw = Math.atan2(E0[0] - MGR[0], E0[2] - MGR[1]);
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { gerente: () => [9.8, 1.5, 6.9], porta: () => W.p('porta-loja', 1.2), balcao: () => [FIG[0], 1.2, 8.4] },
      pose(t, ambient) {
        const { rig } = hands;
        const c = cam(t), b = bob(t, walkIn(t) * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]], look = c.look;
        const inside = t < 23.6;
        mgr.root.visible = inside; old.root.visible = !inside;
        mgr.root.position.set(MGR[0], 0, MGR[1]); mgr.root.rotation.y = myaw;
        const give = smooth(ramp(t, 6.2, 7.2)) * (1 - smooth(ramp(t, 9.6, 10.4)));
        J.shoulderR.rotation.x = -1.2 * give; J.shoulderL.rotation.x = -1.2 * give; J.elbowR.rotation.x = -0.5 * give; J.elbowL.rotation.x = -0.5 * give;
        mgr.update(t, { pose: 'parado', falando: SAY.at(t) !== null, olhar: 0 });
        if (!inside) old.update(t, { pose: 'fixo' });
        // the vest: in our hands, across to his, then folded in his
        const fwd = new T.Vector3(Math.sin(myaw), 0, Math.cos(myaw));
        const his = new T.Vector3(MGR[0], 1.02, MGR[1]).addScaledVector(fwd, 0.5);
        const own = camPoint(T, eye, look, [0, -0.3, -0.48]);
        const k = smooth(ramp(t, 6.6, 7.8));
        vest.visible = inside;
        vest.position.copy(own).lerp(his, k);
        if (k >= 1) vest.position.set(MGR[0] + 0.12, 1.0, MGR[1] - 0.05 + 0.15 * smooth(ramp(t, 9.8, 10.8)));
        vest.rotation.set(0.25, myaw + 0.3, 0.05);
        // our hands: both forward holding the vest, then hanging
        rig.hang(Math.sin(t * 1.1));
        const hold = (smooth(ramp(t, 0.3, 1.0))) * (1 - smooth(ramp(t, 7.6, 8.6)));
        if (hold > 0) { rig.reach('right', [lerp(0.22, 0.14, hold), lerp(-0.4, -0.3, hold), lerp(-0.34, -0.46, hold)]); rig.reach('left', [lerp(-0.22, -0.14, hold), lerp(-0.4, -0.3, hold), lerp(-0.34, -0.46, hold)]); }
        // the door: opens to let us out and swings shut behind
        const open = smooth(ramp(t, 15.0, 15.9)) * (1 - smooth(ramp(t, 19.2, 20.4)));
        const sino = ambient - (t - (t < 20 ? 15.5 : 29.0));
        const dip = t >= 29.3 && t < 29.9 ? 0.55 : 1;
        const fade = fadeInOut(t, 0, 0.8, 36.6, 37.95);
        return {
          eye, look, roll: b[2], fade, dialog: SAY.at(t), fovK: 1 - 0.34 * smooth(ramp(t, 26, 37)), // a slow push in on the counter
          world: { ambient: 0x585d78, state: { doors: { 'porta-loja': open }, sino, hora: 2.3 }, dimLights: { loja2: dip, loja3: dip } },
        };
      },
    };
  },
};
