// Cutscene 2, "pomar": you walk between the apple trees at night and pick an apple. Two humanoid
// creatures (casca, tall and thin, and fole, huge and hunched), both bigger than you, close in; you look up. A blow,
// everything goes dark. First person, 30 s. Scene: scenes/pomar.js.
import { buildScene } from '../scenes/pomar.js';
import { buildCreature } from '../models/creatures.js';
import { tex } from '../textures/paint.js';
import { nightify } from './night.js';
import { liftArms, hideInstanceNear, track, bob, playerArms, ramp, smooth, lerp } from './common.js';

const D = 30;
const views = {
  saida: [0, 4.5, 'Você sai pela porta dos fundos para o pomar ao entardecer, a luz da casa ficando para trás'],
  alameda: [4.5, 10.5, 'A alameda entre as macieiras, a névoa rosada e as maçãs nos galhos'],
  macas: [10.5, 14.5, 'Você sai da trilha e olha para as maçãs altas de uma macieira'],
  colher: [14.5, 19, 'A mão sobe, colhe uma maçã e a traz para perto dos olhos'],
  virar: [19, 22, 'Um galho estala atrás: você se vira devagar, e há vultos grandes na névoa'],
  cerco: [22, 26.2, 'As duas criaturas se aproximam e te cercam; você olha para cima: são bem maiores que você'],
  pancada: [26.2, 30, 'Uma pancada, clarão e tudo apaga'],
};

const P = [-2.45, 1.65, -5.9];                 // where you stand under the tree
const APPLE = [-2.57, 2.0, -6.3];              // the branch apple (scenes/pomar.js anchors.macaGalho)

// the point p (world) in the camera space of a track sample (x right, y up, -z forward)
function toLocal(c, p) {
  const f = [0, 1, 2].map((i) => c.look[i] - c.eye[i]), fl = Math.hypot(...f); f.forEach((_, i) => { f[i] /= fl; });
  const rx = [-f[2], 0, f[0]], rl = Math.hypot(...rx) || 1; rx.forEach((_, i) => { rx[i] /= rl; });
  const u = [rx[1] * f[2] - rx[2] * f[1], rx[2] * f[0] - rx[0] * f[2], rx[0] * f[1] - rx[1] * f[0]]; // right x forward is up
  const d = [0, 1, 2].map((i) => p[i] - c.eye[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(d, rx), dot(d, u), -dot(d, f)];
}

const cam = track([
  { t: 0.0, eye: [0, 1.65, 8.5], look: [0, 1.5, 2] },
  { t: 3.0, eye: [0, 1.65, 6.4], look: [0, 1.9, -6] },
  { t: 4.5, eye: [0.1, 1.65, 4.8], look: [0.2, 2.0, -8] },
  { t: 7.5, eye: [-0.2, 1.65, 2.2], look: [-0.5, 2.1, -9] },
  // the apple branch is seen from outside the canopy: from the lane, then closer along the line out of the tree, an arm's length away
  { t: 10.5, eye: [-0.8, 1.65, -1.0], look: [-3.2, 2.3, -6.0] },
  { t: 12.5, eye: [-0.55, 1.65, -3.9], look: [-2.8, 2.25, -6.3], ease: 'ss' },
  { t: 14.5, eye: [-1.4, 1.65, -6.05], look: [-2.57, 2.0, -6.3], ease: 'ss' },
  { t: 16.4, eye: [-2.0, 1.66, -6.17], look: [-2.57, 2.0, -6.3], ease: 'ss' },
  { t: 18.8, eye: [-2.0, 1.64, -6.17], look: [-2.3, 1.75, -6.0], ease: 'ss' },
  { t: 18.97, eye: [-2.0, 1.64, -6.17], look: [-2.3, 1.75, -6.0] }, // holds on the apple in the hand to the last instant of the view; the turn belongs to the next view
  { t: 19.0, eye: P, look: [-2.4, 1.6, -5.0], ease: 'ss' },
  { t: 20.4, eye: P, look: [-1.5, 1.8, -3.0], ease: 'ss' },
  { t: 22.0, eye: P, look: [-1.1, 1.9, -2.0], ease: 'ss' },
  { t: 23.8, eye: P, look: [-3.4, 1.9, -2.6], ease: 'ss' },
  { t: 25.4, eye: [P[0], 1.6, P[2] + 0.05], look: [-2.2, 2.7, -2.7], ease: 'ss' },
  { t: 26.2, eye: [P[0], 1.58, P[2] + 0.05], look: [-2.2, 2.8, -2.7] },
  { t: 30, eye: [P[0], 1.58, P[2] + 0.05], look: [-2.2, 2.8, -2.7] },
]);

// creature paths: from the fog to the circle around you, as pure functions of the time
const CASCA = (t) => ({ p: [lerp(-1.7, -1.2, smooth(ramp(t, 19.5, 25.4))), 0, lerp(-0.2, -3.4, smooth(ramp(t, 19.5, 25.4)))], face: [P[0], P[2]] });
const FOLE = (t) => { const u = smooth(ramp(t, 20, 25.2)); const a = lerp(0.2, 1.0, u); return { p: [lerp(2.4, -3.7, u), 0, lerp(-0.6, -3.7, u) + Math.sin(a * 3) * 0.1], face: [P[0], P[2]] }; };

export default {
  name: 'pomar', duration: D, cue: 'pomar', views,
  anchors: { macieira: 'A macieira de onde você colhe a maçã', maca: 'A maçã no galho', casca: 'A criatura alta e magra de placas cinza pálidas', fole: 'A criatura enorme e corcunda de peito que infla' },
  sfx: [
    { t: 0.8, name: 'passo' }, { t: 1.8, name: 'passo' }, { t: 2.8, name: 'passo' }, { t: 3.8, name: 'passo' }, { t: 4.8, name: 'passo' }, { t: 5.8, name: 'passo' },
    { t: 6.8, name: 'passo' }, { t: 7.8, name: 'passo' }, { t: 8.8, name: 'passo' }, { t: 9.8, name: 'passo' }, { t: 10.8, name: 'passo' }, { t: 11.8, name: 'passo' }, { t: 12.8, name: 'passo' },
    { t: 13.8, name: 'passo' }, { t: 16.5, name: 'pedra_pegar' }, { t: 19.2, name: 'passo' }, { t: 21.0, name: 'passo' }, { t: 22.6, name: 'passo' }, { t: 24.0, name: 'passo' },
    { t: 25.6, name: 'passo' }, { t: 26.2, name: 'soco_testa' }, { t: 26.2, flash: true },
  ],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed });
    nightify(r, sc); // the whole orchard is at night
    const casca = buildCreature(r, 'casca', { seed: 11, scale: 1.0 });
    const fole = buildCreature(r, 'fole', { seed: 12, scale: 1.0 });
    sc.group.add(casca.root, fole.root);
    const { arms, rig } = playerArms(r, { bare: true });
    liftArms(arms, 0.42);
    const apple = new r.THREE.Mesh(new r.THREE.SphereGeometry(0.085, 6, 4), r.mat('#ffffff', { map: tex(r, 'apple'), emissive: 0.25, fogged: 0.2 }));
    arms.root.add(apple); apple.visible = false;
    const place = (an, d, t) => {
      const [x, , z] = d.p, yaw = Math.atan2(d.face[0] - x, d.face[1] - z);
      an.root.position.set(x, 0, z); an.root.rotation.set(0, yaw, 0);
    };
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { macieira: () => sc.anchors.macieiraAlvo, maca: () => sc.anchors.macaGalho, casca: () => [...CASCA(D).p.slice(0, 1), 1.2, CASCA(D).p[2]], fole: () => [FOLE(D).p[0], 1.0, FOLE(D).p[2]] },
      pose(t, ambient) {
        sc.update(ambient);
        const walk = t > 19.5 && t < 25.5 ? 'andar' : undefined; casca.update(ambient, walk); fole.update(ambient + 1.7, walk);
        const p = CASCA(t), c = FOLE(t);
        place(casca, p, t); place(fole, c, t);
        // before they show up they wait far in the fog
        casca.root.visible = t > 19.0; fole.root.visible = t > 19.0;
        const walkK = t < 13.6 ? 1 : 0, b = bob(t, walkK);
        const base = cam(t);
        const eye = [base.eye[0] + b[0] * 0.3, base.eye[1] + b[1], base.eye[2]];
        // hands
        const sway = Math.sin(t * 1.5);
        let showApple = false;
        if (t >= 14.2 && t < 19.2) {
          const reachU = smooth(ramp(t, 14.4, 15.8)), grab = smooth(ramp(t, 16.4, 17.2)), down = smooth(ramp(t, 17.0, 18.0));
          const aL = toLocal(base, sc.anchors.macaGalho), reach = Math.hypot(...aL), kk = Math.min(1, 0.6 / reach);
          const hi = [aL[0] * kk, aL[1] * kk - 0.02, aL[2] * kk];
          const tgt = [lerp(lerp(0.18, hi[0], reachU), 0.12, down), lerp(lerp(-0.4, hi[1], reachU), -0.12, down), lerp(lerp(-0.34, hi[2], reachU), -0.36, down)];
          rig.hang(sway); rig.reach('right', tgt); rig.curl('right', 0.1 + 0.7 * grab);
          apple.scale.setScalar(lerp(2, 1, down));
          showApple = t >= 16.7 && t < 19.2;
          apple.position.set(tgt[0], tgt[1] + 0.07, tgt[2] - 0.11);
        } else rig.hang(sway * (walkK ? 2 : 1));
        if (t >= 19.2 && t < 26.2) { showApple = true; apple.position.set(0.18, -0.2, -0.36); rig.hang(sway); rig.reach('right', [0.18, -0.22, -0.36]); }
        apple.visible = showApple && t < 26.1;
        if (t >= 16.7) hideInstanceNear(sc.group, sc.anchors.macaGalho); // the picked apple leaves the branch
        const fade = Math.max(1 - smooth(ramp(t, 0.1, 1.4)), smooth(ramp(t, 26.3, 26.9)));
        const flashes = [{ t: 26.2, s: 1 }];
        return { eye, look: base.look, roll: base.roll + b[2] + (t > 19 && t < 26.2 ? Math.sin(t * 0.9) * 0.02 : 0), fade, flashes, daze: t > 25.4 && t < 26.6 ? 0.5 * ramp(t, 25.4, 26.2) : 0, fovK: 1 };
      },
    };
  },
};
