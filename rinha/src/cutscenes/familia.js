// Cutscene 7, "familia": the short scene of block 13 (S5). Your mother and a sister, both grown
// women, in the house, looking for you: they come into the bedroom calling, look at the empty bed,
// the mother picks up your jacket, the sister goes to the open back door. You see it as a memory,
// from the pillow. Hook for the next video. First person, 11 s. Scene: scenes/casa.js.
import { buildScene } from '../scenes/casa.js';
import { buildHuman } from '../models/human.js';
import { track, ramp, smooth, lerp, poseWalk } from './common.js';
import { nightDoor } from './night.js';

const D = 11;
const views = {
  entram: [0, 3.8, 'A porta do quarto abre: a mãe e uma irmã entram chamando por você, as duas adultas'],
  cama: [3.8, 7.4, 'Elas olham a cama vazia: a mãe pega o casaco e o aperta nas mãos'],
  porta: [7.4, 11, 'A irmã vai até a porta dos fundos aberta e olha para fora, a mãe fica parada com o casaco'],
};
const cam = track([
  { t: 0, eye: [-3.15, 1.0, 1.75], look: [0, 1.45, 0.1], roll: 0.04 },
  { t: 4, eye: [-3.1, 1.05, 1.72], look: [-1.4, 1.35, 0.7], roll: 0.02, ease: 'ss' },
  { t: 7.4, eye: [-3.05, 1.1, 1.7], look: [-1.8, 1.3, 0.5], roll: 0 },
  { t: 11, eye: [-3.0, 1.2, 1.7], look: [-0.5, 1.5, -0.2], roll: -0.02 },
]);
const MOTHER = track([
  { t: 0, eye: [0.5, 0, 0.1], look: [0, 0, 0] }, { t: 2.6, eye: [-1.0, 0, 0.5], look: [0, 0, 0] }, { t: 4.2, eye: [-2.15, 0, 1.0], look: [0, 0, 0] },
  { t: 11, eye: [-2.2, 0, 1.0], look: [0, 0, 0] },
]);
const SISTER = track([
  { t: 0.8, eye: [0.9, 0, -0.3], look: [0, 0, 0] }, { t: 3.2, eye: [-0.8, 0, -0.9], look: [0, 0, 0] }, { t: 4.6, eye: [-1.6, 0, -0.8], look: [0, 0, 0] },
  { t: 6.2, eye: [-1.2, 0, -0.6], look: [0, 0, 0] }, { t: 8.0, eye: [0.8, 0, -0.5], look: [0, 0, 0] }, { t: 9.6, eye: [2.6, 0, -1.2], look: [0, 0, 0] },
  { t: 11, eye: [3.0, 0, -1.7], look: [0, 0, 0] },
]);

export default {
  name: 'familia', duration: D, cue: 'casa', views,
  anchors: { mae: 'A mãe', irma: 'A irmã', cama: 'A cama vazia' },
  sfx: [{ t: 0.2, name: 'porta_cela' }, ...[1.0, 1.5, 2.0, 2.5, 3.0, 3.5].map((t) => ({ t, name: 'passo' })), ...[8.2, 8.7, 9.2, 9.7].map((t) => ({ t, name: 'passo' }))],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed });
    nightDoor(sc); // the sky outside the back door is night
    sc.parts.setBackDoor(1);
    const mk = (look) => { const H = buildHuman(r, { ...look, female: true, outfit: 'civil', glove: 'none' }); sc.group.add(H.root); return H; };
    const mom = mk({ seed: 201, height: 1.62, build: 'mid', skin: '#c8946a', hair: '#8d8d8d', scar: false, skirt: true });
    const sis = mk({ seed: 202, height: 1.7, build: 'lean', skin: '#a8744c', hair: '#14100c', scar: false, skirt: false });
    // the jacket on the bed (a folded block) until the mother takes it
    const jacket = new r.THREE.Mesh(new r.THREE.BoxGeometry(0.5, 0.1, 0.4), r.mat('#4a5a3a', { map: 'cloth' }));
    sc.group.add(jacket);
    function place(H, path, t, yawTo, moving) {
      const p = path(t).eye, p2 = path(t + 0.05).eye, mv = Math.hypot(p2[0] - p[0], p2[2] - p[2]) / 0.05;
      const k = Math.min(1, mv / 0.6), yaw = mv > 0.1 ? Math.atan2(p2[0] - p[0], p2[2] - p[2]) : yawTo;
      H.root.position.set(p[0], 0, p[2]); H.root.rotation.set(0, yaw, 0);
      void moving; return k;
    }
    return {
      group: sc.group, lights: sc.lights,
      anchors: { mae: () => [MOTHER(D).eye[0], 1.5, MOTHER(D).eye[2]], irma: () => [SISTER(D).eye[0], 1.5, SISTER(D).eye[2]], cama: () => sc.anchors.cama },
      pose(t, ambient) {
        sc.update(ambient);
        const toCam = Math.atan2(-3.1 - MOTHER(t).eye[0], 1.7 - MOTHER(t).eye[2]);
        const km = place(mom, MOTHER, t, toCam), ks = place(sis, SISTER, t, 0);
        const lift = smooth(ramp(t, 5.0, 5.8)); // the mother takes the jacket and holds it against her chest
        poseWalk(mom.joints, t * 5.2, km, { L: { x: lerp(0, -0.3, lift), elbow: lerp(-0.2, -1.75, lift) }, R: { x: lerp(0, -0.3, lift), elbow: lerp(-0.2, -1.75, lift) } });
        mom.joints.spine.rotation.x += (1 - lift) * 0.28 * ramp(t, 3.6, 4.4) + Math.sin(t * 1.1) * 0.02; // she bends over the bed
        mom.joints.head.rotation.y = Math.sin(t * 0.7) * 0.3 * (1 - ramp(t, 3.4, 4.2));
        const call = t < 3.4 ? smooth(Math.max(0, Math.sin(t * 2.4))) : 0; // calling out: a hand to the mouth, the head up
        if (call > 0.3) { mom.joints.shoulderR.rotation.x = -0.5 * call; mom.joints.elbowR.rotation.x = -2.2 * call; }
        poseWalk(sis.joints, t * 5.6 + 1, ks, t > 6.4 && t < 7.8 ? { R: { x: -0.9, elbow: -0.4 } } : {});
        sis.joints.head.rotation.y = Math.sin(t * 1.3) * 0.4 * (1 - ks);
        jacket.position.set(-3.3, 0.6, 1.2 + 0.3 * lift); jacket.visible = t < 5.8;
        jacket.position.y = 0.6 + lift * 0.8;
        const c = cam(t);
        return { eye: [c.eye[0] + Math.sin(t * 0.9) * 0.01, c.eye[1], c.eye[2]], look: c.look, roll: c.roll, fade: Math.max(1 - smooth(ramp(t, 0, 0.9)), smooth(ramp(t, 10.1, 11))), noise: 0.05, daze: 0.2 };
      },
    };
  },
};
