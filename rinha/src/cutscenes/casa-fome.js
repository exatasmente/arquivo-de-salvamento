// Film-only reel "casa-fome": the house before the orchard, for the hook of the video and the first
// lines: the empty table, a single apple on it, the empty cupboards, the moon at the window, your
// sister asleep on a mat in the dark, getting up carefully, the back door, the empty hands. First
// person, bare hands. Nothing of the orchard. Not played by the game (see src/film.js). Scene: scenes/casa.js.
import { buildScene } from '../scenes/casa.js';
import { buildHuman } from '../models/human.js';
import { tex } from '../textures/paint.js';
import { reel, bob, playerArms, liftArms, ramp, smooth, lerp } from './common.js';
import { nightDoor } from './night.js';

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const R = reel([
  S('mesaVazia', 5, 'A mesa da cozinha sob a lâmpada: uma tigela vazia e mais nada', [{ t: 0, eye: [0.6, 1.5, 1.6], look: [2.1, 0.85, 0.55] }, { t: 5, eye: [1.2, 1.45, 1.3], look: [2.1, 0.85, 0.55] }], () => ({})),
  S('macaMesa', 5, 'Uma única maçã na tigela, sob a luz cansada da lâmpada', [{ t: 0, eye: [1.5, 1.35, 1.0], look: [2.1, 0.88, 0.55] }, { t: 5, eye: [1.75, 1.2, 0.85], look: [2.1, 0.9, 0.55] }], (l, o) => { o.apple(true); return {}; }),
  S('armario', 5, 'O armário e a bancada ao lado do fogão: as prateleiras vazias, sem nada para comer', [{ t: 0, eye: [0.4, 1.6, -0.6], look: [0.75, 1.1, -1.9] }, { t: 5, eye: [0.9, 1.6, -0.8], look: [0.75, 1.0, -1.9] }], () => ({})),
  S('janelaNoite', 4, 'A janela do quarto à noite: a lua branca e o céu roxo do lado de fora', [{ t: 0, eye: [-1.6, 1.65, -0.4], look: [-2.3, 1.5, -2.3] }, { t: 4, eye: [-1.7, 1.65, -0.8], look: [-2.3, 1.6, -2.3] }], () => ({})),
  S('irmaDormindo', 6, 'Sua irmã dormindo num colchão no chão, no escuro, e o ronco do estômago dela no silêncio', [{ t: 0, eye: [-0.55, 1.5, -0.25], look: [-1.5, 0.3, 0.75] }, { t: 6, eye: [-0.8, 1.4, -0.05], look: [-1.5, 0.25, 0.7] }], (l, o) => { o.sister(l); return { dim: 1 }; }),
  // the mattress low at the start, then the view rises and turns along the line through the doorway to the back door
  S('levanta', 5, 'Você se levanta devagar, para não acordar ninguém: a visão sobe do colchão até a altura dos olhos', [
    { t: 0, eye: [-0.78, 0.4, 1.75], look: [-1.5, 0.1, 1.15], ease: 'ss' },
    { t: 1.3, eye: [-0.8, 0.55, 1.55], look: [-1.35, 0.25, 0.8], ease: 'ss' },
    { t: 2.8, eye: [-1.05, 1.15, 1.2], look: [0.6, 1.05, -0.25], ease: 'ss' },
    { t: 4.0, eye: [-1.5, 1.5, 1.15], look: [1.8, 1.3, -1.1] },
    { t: 5, eye: [-1.75, 1.65, 1.33], look: [3.03, 1.3, -2.3] }], (l, o) => { o.sister(l); o.rig.reach('right', [0.2, -0.3 + 0.2 * (1 - ramp(l, 0, 2)), -0.4]); return {}; }),
  S('portaSuave', 5, 'Você abre a porta dos fundos devagar: o rangido, a fresta de noite e depois o vão aberto', [{ t: 0, eye: [2.7, 1.65, -0.9], look: [3.03, 1.2, -2.3] }, { t: 5, eye: [2.95, 1.65, -1.5], look: [3.03, 1.3, -2.6] }], (l, o) => { o.door(smooth(ramp(l, 1, 4))); o.rig.reach('right', [lerp(0.2, 0.08, smooth(ramp(l, 0.5, 1.3))), lerp(-0.4, -0.02, smooth(ramp(l, 0.5, 1.3))), lerp(-0.34, -0.62, smooth(ramp(l, 0.5, 1.3)))]); return { walking: l < 1 }; }),
  S('maosVazias', 5, 'Suas duas mãos abertas diante dos olhos, vazias, no meio do quadro, e a porta dos fundos aberta para a noite ao fundo', [{ t: 0, eye: [3.03, 1.6, 0.4], look: [3.03, 1.0, -1.5] }, { t: 5, eye: [3.03, 1.55, 0.2], look: [3.03, 0.95, -1.5] }], (l, o) => { o.door(1); o.rig.reach('right', [0.13, -0.05, -0.5]); o.rig.reach('left', [-0.13, -0.05, -0.5]); return {}; }),]);

export default {
  name: 'casa-fome', prefix: 'casa', filmOnly: true, duration: R.duration, cue: 'casa', views: R.views,
  anchors: { mesa: 'A mesa da cozinha', maca: 'A maçã na tigela', irma: 'A irmã dormindo no colchão' },
  // The night bed all along; the soft steps as you get up from the mat (the 'levanta' view, 25 to 30 s).
  sfx: [
    { t: 0, name: 'noite', opts: { dur: R.duration, vol: 0.3 } },
    { t: 26.3, name: 'passo', opts: { vol: 0.5 } }, { t: 26.9, name: 'passo', opts: { vol: 0.5 } }, { t: 27.45, name: 'passo', opts: { vol: 0.5 } }, { t: 28.0, name: 'passo', opts: { vol: 0.5 } },
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const sc = buildScene(r, { seed: ctx.seed });
    nightDoor(sc); // the sky outside the back door is night
    const { arms, rig } = playerArms(r, { bare: true }); liftArms(arms, 0.3);
    const apple = new T.Mesh(new T.SphereGeometry(0.085, 6, 4), r.mat('#ffffff', { map: tex(r, 'apple'), emissive: 0.25, fogged: 0.2 }));
    apple.position.set(sc.anchors.tigela[0], sc.anchors.tigela[1] + 0.07, sc.anchors.tigela[2]); sc.group.add(apple);
    const mat = new T.Mesh(new T.BoxGeometry(0.75, 0.05, 1.8), r.mat('#6a6e84', { map: 'cloth' })); mat.position.set(-1.5, 0.03, 1.1); sc.group.add(mat);
    const sis = buildHuman(r, { seed: 202, height: 1.7, build: 'lean', skin: '#a8744c', hair: '#14100c', female: true, outfit: 'civil', glove: 'none', scar: false, skirt: false });
    sis.root.position.set(-1.5, 0.09, 1.9); sis.root.rotation.set(-Math.PI / 2, 0, 0); sc.group.add(sis.root);
    const L0 = { ...sc.lights.points[3] };
    const o = {
      rig, door: (f) => sc.parts.setBackDoor(f), apple: (v) => { apple.visible = v; },
      sister(l) { sis.joints.spine.rotation.x = Math.sin(l * 0.9) * 0.02; sis.joints.head.rotation.y = 0.2; },
    };
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { mesa: () => sc.anchors.mesa, maca: () => sc.anchors.tigela, irma: () => [-1.5, 0.3, 1.1] },
      pose(t, ambient) {
        const { seg, local, cam } = R.at(t);
        // a faint warm glow from the bedside side while you stand up, so the divider wall and the doorway read
        const L = sc.lights; L.points[3] = seg.name === 'levanta' ? { pos: [-1.6, 2.0, 1.0], hex: 0xffb060, k: 0.7, range: 4.6 } : { ...L0 }; L.apply();
        sc.update(ambient);
        apple.visible = false; sc.parts.setBackDoor(0.45); rig.hang(Math.sin(local * 1.3));
        const f = seg.act(local, o) ?? {};
        const w = f.walking ? 1 : 0, b = bob(t, w * 0.6, 1.7);
        const eye = [cam.eye[0] + b[0] * 0.3, cam.eye[1] + b[1], cam.eye[2]];
        return { eye, look: cam.look, roll: (cam.roll ?? 0) + b[2], daze: f.dim ? 0.2 : 0 };
      },
    };
  },
};
