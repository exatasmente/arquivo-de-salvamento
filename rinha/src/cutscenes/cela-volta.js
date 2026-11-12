// Film-only reel "cela-volta": you wake up again in the cell, which is the inside of the creatures' cube. The same room as before: the tally
// marks on the wall, the panel beside the door, the grate of the vent and the light strip that never changes. At the end the whole cell
// trembles, as if the cube were being put away in somebody's pocket. First person, bare hands. Not played by the game (see src/film.js).
// Scene: scenes/cela.js (tally from ctx.groups).
import { buildScene } from '../scenes/cela.js';
import { reel, playerArms, liftArms, ramp, smooth, lerp } from './common.js';

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const EYE = [-1.5, 1.0, 1.2]; // sitting on the edge of the bed

const R = reel([
  S('volta', 9, 'De volta à cela, sentado na cama: os riscos na parede, o painel ao lado da porta, a grade do respiro e a luz do teto, que nunca muda; no fim, tudo treme um instante, como se o cubo fosse guardado no bolso de alguém', [
    { t: 0, eye: EYE, look: [0.0, 1.55, -2.8] }, { t: 1.6, eye: EYE, look: [0.0, 1.55, -2.8], ease: 'ss' }, { t: 3.2, eye: EYE, look: [2.5, 1.35, -0.55], ease: 'ss' },
    { t: 4.4, eye: EYE, look: [2.5, 1.35, -0.55], ease: 'ss' }, { t: 5.8, eye: EYE, look: [-2.8, 1.6, -1.4], ease: 'ss' }, { t: 6.8, eye: EYE, look: [-2.8, 1.6, -1.4], ease: 'ss' },
    { t: 7.8, eye: [-1.5, 0.98, 1.2], look: [0.0, 3.0, 0.2], ease: 'ss' }, { t: 9, eye: [-1.5, 0.98, 1.2], look: [0.0, 3.0, 0.2] }],
  (l, o) => {
    o.rig.reach('right', [0.2, -0.14, -0.42]); o.rig.reach('left', [-0.2, -0.14, -0.42]);
    const tremor = l > 7.3 ? Math.exp(-(l - 7.3) * 1.6) * smooth(ramp(l, 7.3, 7.5)) : 0;
    return { fade: 1 - smooth(ramp(l, 0.2, 1.6)), daze: 0.5 * (1 - ramp(l, 0, 3)), tremor };
  }),
]);

export default {
  name: 'cela-volta', prefix: 'cela', filmOnly: true, duration: R.duration, cue: 'cela', views: R.views,
  anchors: { riscos: 'A parede dos riscos, ao fundo da cela', painel: 'O painel ao lado da porta', grade: 'A grade do respiro' },
  // The tube hum all along; the cell trembles at 7.3 s: a low rumble and a shake of the walls, then the hum steadies.
  sfx: [{ t: 0, name: 'cela_zumbido', opts: { dur: R.duration } }, { t: 7.3, name: 'knockdown', opts: { vol: 0.5 } }, { t: 7.45, name: 'batida_parede', opts: { vol: 0.5 } }, { t: 7.9, name: 'batida_parede', opts: { vol: 0.3 } }],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed, groups: ctx.groups ?? undefined });
    sc.parts.setCoin(false); sc.parts.setPanel('idle', '');
    const { arms, rig } = playerArms(r, { bare: true }); liftArms(arms, 0.3);
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { riscos: () => sc.anchors.riscos, painel: () => sc.anchors.painelTela, grade: () => [-2.78, 1.56, -1.4] },
      pose(t, ambient) {
        sc.update(ambient);
        const { seg, local, cam } = R.at(t);
        rig.hang(Math.sin(local * 1.3));
        const f = seg.act(local, { rig }) ?? {}, tr = f.tremor ?? 0, br = Math.sin(local * 1.6) * 0.01;
        const eye = [cam.eye[0] + Math.sin(ambient * 83) * 0.04 * tr, cam.eye[1] + br + Math.sin(ambient * 71) * 0.05 * tr, cam.eye[2] + Math.sin(ambient * 67) * 0.03 * tr];
        return { eye, look: cam.look, roll: Math.sin(ambient * 59) * 0.05 * tr, fade: f.fade ?? 0, daze: f.daze ?? 0 };
      },
    };
  },
};
