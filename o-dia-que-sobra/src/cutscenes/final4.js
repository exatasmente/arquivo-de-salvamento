// Ending 4, "final4" (Desaparecimento): the picture cuts to black. The next night, in the office, the manager looks at
// the monitor: on the picture of the camera over the pumps, a new attendant stands at pump 4, with his back to the
// camera. Nobody comes through the door, nobody turns round; the picture cuts to black again.
// Third person (nobody is Heitor any more): the manager from behind, then the monitor. 30 s. One caption.
import { ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { aimTrack, aimAt, buildManager, buildNewAttendant, camShooter, fadeInOut, PI } from './finais-kit.js';

const D = 30;
const views = {
  preto: [0, 3.6, 'O preto: o corte do fim; só o zumbido do posto'],
  escritorio: [3.6, 9, 'O escritório, a legenda "Na noite seguinte.": o gerente, de costas, diante do monitor'],
  camera: [9, 24, 'O monitor inteiro: a câmera sobre as bombas; na bomba 4, um frentista novo, de costas, parado'],
  corte: [24, 30, 'O corte: a imagem some e só fica o preto e o zumbido'],
};
const SAY = dialogue([{ t: 3.6, who: '', text: 'Na noite seguinte.', seed: BABBLE_SEEDS.heitor, hold: 1.6 }]);

const MGR = [5.5, 16.5];
const EYE0 = [3.8, 1.62, 14.9];
const toMon = aimAt(EYE0, [5.8, 1.2, 17.8]);
const cam = aimTrack([
  { t: 0, eye: EYE0, yaw: toMon.yaw, pitch: -0.1 },
  { t: 9, eye: [3.95, 1.62, 15.1], yaw: toMon.yaw, pitch: -0.1 },
  { t: 24, eye: [4.1, 1.62, 15.3], yaw: toMon.yaw, pitch: -0.1 },
  { t: 30, eye: [4.1, 1.62, 15.3], yaw: toMon.yaw, pitch: -0.1 },
]);
const PUMP_EYE = [19.5, 1.7, -5.0], ATT = [20.6, -5.0];

export default {
  name: 'final4', duration: D, views,
  anchors: { gerente: 'O gerente, de costas, diante do monitor', monitor: 'O monitor do escritório', bomba4: 'A bomba 4, vista pela câmera' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.55 } },
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.3 } },
    { t: 7.4, name: 'estatica_camera', opts: { dur: 16.6, gain: 0.5 } },
    { t: 11.0, name: 'lampada_estalo', opts: { pos: [19.5, 3.6, -8], gain: 0.5 } },
    { t: 14.0, name: 'respiracao', opts: { dur: 9, gain: 0.4 } },
    ...SAY.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const W = ctx.world();
    const g = new T.Group();
    const mgr = buildManager(r); g.add(mgr.root);
    mgr.root.position.set(MGR[0], 0, MGR[1]); mgr.root.rotation.y = 0;
    const att = buildNewAttendant(r); g.add(att.root);
    att.root.position.set(ATT[0], 0, ATT[1]); att.root.rotation.y = -PI / 2;
    const shoot = camShooter(r, W, () => { mgr.root.visible = false; return () => { mgr.root.visible = true; }; });
    return {
      group: g, hands: false,
      anchors: { gerente: () => [MGR[0], 1.5, MGR[1]], monitor: () => W.p('monitorTela'), bomba4: () => W.p('bomba4', 1.2) },
      pose(t, ambient) {
        const c = cam(t);
        mgr.update(t, { pose: 'parado', falando: false, olhar: 0 });
        att.update(t, { pose: 'costas' });
        const fade = Math.max(smooth(1 - ramp(t, 3.0, 4.6)), smooth(ramp(t, 24.0, 24.2))); // black, the room, the cut
        const screenOn = t >= 8.2 && t < 24.0;
        const world = { ambient: 0x585d78, state: { hora: 0.6 }, on: ['escritorio-teto'] };
        return {
          eye: c.eye, look: c.look, roll: 0, fade, dialog: SAY.at(t), noise: screenOn ? 0.06 : 0,
          world,
          late(f) {
            if (!screenOn) return;
            // the pumps are far from the office: light them for the picture of the camera, then put the office light back
            W.pose(ambient, { ...world, eye: PUMP_EYE });
            const img = shoot('cam3', t, { fov: 58 });
            W.pose(ambient, { ...world, eye: f.eye });
            f.screen = { kind: 'cam', image: img, label: 'CAM 3', zoom: lerp(1.15, 1.7, smooth(ramp(t, 9, 23))), at: [0.46, 0.55] };
          },
        };
      },
    };
  },
};
