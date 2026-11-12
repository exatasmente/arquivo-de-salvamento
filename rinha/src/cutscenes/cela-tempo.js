// Film-only reel "cela-tempo": the rest of the first day in the cell, in the order of the narration:
// lying on the metal bed, the clean smooth walls, the low ceiling and the light that never changes,
// the locked door, calling, the wall, sitting on the edge of the bed and waiting. First person, bare
// hands. Not played by the game (see src/film.js). Scene: scenes/cela.js (tally from ctx.groups).
import { buildScene } from '../scenes/cela.js';
import { buildAnimal } from '../models/animals.js';
import { tex } from '../textures/paint.js';
import { reel, bob, footfalls, playerArms, liftArms, ramp, smooth, lerp, clamp } from './common.js';

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const DOOR_EYE = [1.75, 1.6, 0.95];
const R = reel([
  S('deitado', 7, 'Você deitado na cama de metal, olhando para o teto: a luz fria, a visão ainda pesada', [{ t: 0, eye: [-2.05, 0.9, 2.15], look: [-1.2, 2.9, 1.6], roll: 0.1 }, { t: 3.5, eye: [-2.05, 0.93, 2.15], look: [-0.5, 2.6, 0.6], roll: 0.06, ease: 'ss' }, { t: 7, eye: [-2.05, 0.95, 2.1], look: [0.4, 1.9, -0.8], roll: 0.02 }], () => ({ breath: 1 })),
  S('limpa', 5, 'As paredes lisas e o piso sem uma marca: tudo limpo demais, feito para durar', [{ t: 0, eye: [-1.3, 1.62, 1.4], look: [-0.2, 1.4, -1.8] }, { t: 5, eye: [-1.0, 1.55, 1.0], look: [1.2, 0.2, -0.6] }], () => ({})),
  S('teto', 6, 'O teto baixo sobre a sua cabeça e a faixa de luz que atravessa a cela', [{ t: 0, eye: [-0.8, 1.6, 0.6], look: [-0.6, 3.0, 0.3] }, { t: 6, eye: [-0.6, 1.62, 0.4], look: [0.7, 3.0, 0.5] }], () => ({})),
  S('luz', 4, 'A luz da faixa do teto de perto, a mesma de antes: ela nunca muda', [{ t: 0, eye: [0, 1.65, 0.3], look: [0, 3.0, 0.2] }, { t: 4, eye: [0, 1.65, 0.3], look: [0.02, 3.0, 0.1] }], () => ({})),
  S('semRelogio', 4, 'Uma parede lisa onde deveria haver um relógio: nada, só o silêncio', [{ t: 0, eye: [-0.8, 1.65, 0.4], look: [-0.3, 2.0, 2.8] }, { t: 4, eye: [-0.8, 1.65, 0.4], look: [0.9, 2.0, 2.8] }], () => ({})),
  S('portaTranca', 5, 'Você vai até a porta e empurra: ela não cede', [{ t: 0, eye: [0.3, 1.62, 0.9], look: [2.6, 1.4, 1.0] }, { t: 3, eye: [1.95, 1.6, 0.98], look: [2.6, 1.72, 1.0], ease: 'ss' }, { t: 5, eye: [2.0, 1.59, 0.98], look: [2.6, 1.72, 1.0] }],
    (l, o) => {
      // the hand goes flat against the door and keeps pushing to the end of the view: it does not give
      const u = smooth(ramp(l, 2.3, 3.0)), pulse = l > 3.3 ? Math.sin((l - 3.3) * 5) * 0.025 : 0;
      o.rig.hang(0); o.rig.reach('right', [lerp(0.2, 0.1, u), lerp(-0.4, -0.02, u), lerp(-0.34, -0.6 + pulse, u)]); o.rig.curl('right', 0.15);
      return { walking: l < 3, shake: Math.exp(-Math.max(0, l - 3.0) * 3) * (l > 3.0 ? 1 : 0) * 0.5 };
    }),
  S('chama', 4, 'Você bate na porta e chama: ninguém responde, só o eco da cela', [{ t: 0, eye: DOOR_EYE, look: [2.6, 1.5, 1.0] }, { t: 4, eye: [1.9, 1.6, 0.9], look: [2.6, 1.6, 1.0] }],
    (l, o) => { const k = Math.floor(l * 2.5) % 2; o.rig.hang(0); o.rig.reach('right', [0.1, 0.0 + k * 0.05, -0.55 + k * 0.05]); o.rig.reach('left', [-0.1, -0.05, -0.55]); return { shake: k ? 0.35 : 0.1 }; }),
  S('luzDaPorta', 5, 'A faixa laranja de luz no alto da porta trancada e o painel ao lado: a única luz que vem de fora, sem o corredor à vista', [{ t: 0, eye: [0.6, 1.7, 0.2], look: [2.6, 1.9, 0.8] }, { t: 5, eye: [1.2, 1.7, 0.4], look: [2.6, 1.9, 0.8] }], (l, o) => { o.door(0); return {}; }),
  S('parede', 6, 'Você bate na parede até a mão doer: o punho cai no mesmo ponto e a parede devolve o silêncio', [{ t: 0, eye: [-0.5, 1.5, 2.15], look: [-0.5, 1.42, 2.8], roll: 0.01 }, { t: 6, eye: [-0.5, 1.46, 2.18], look: [-0.5, 1.36, 2.8], roll: -0.01 }],
    (l, o) => {
      // one blow every 1.2 s, the fist landing on the same spot (contact at l = 0.5, 1.7, 2.9, ...): snap forward, hold on the wall, pull back
      const ph = (((l + 0.09) / 0.9) % 1 + 1) % 1, tired = 1 - 0.3 * ramp(l, 3, 6);
      const e = ph >= 0.8 ? smooth((ph - 0.8) / 0.2) : ph < 0.12 ? 1 : ph < 0.5 ? 1 - smooth((ph - 0.12) / 0.38) : 0;
      const k = e * tired;
      o.rig.reach('right', [lerp(0.2, 0.05, k), lerp(-0.2, -0.1, k), lerp(-0.4, -0.6, k)]); o.rig.reach('left', [-0.2, -0.4, -0.34]); o.rig.curl('right', 0.2 + 0.8 * Math.max(k, 0.5 * (1 - ramp(ph, 0.6, 0.8)) * (ph > 0.12 ? 1 : 0)));
      return { shake: ph < 0.22 ? 0.7 * tired * (1 - ph / 0.22) + 0.05 : 0.05 };
    }),
  S('senta', 6, 'Você se senta na beira da cama: a visão desce devagar até a altura dos joelhos', [{ t: 0, eye: [-0.8, 1.62, 0.4], look: [-2.0, 0.55, 1.4] }, { t: 2.0, eye: [-1.1, 1.42, 0.75], look: [-1.95, 0.55, 1.35], ease: 'ss' }, { t: 3.1, eye: [-1.7, 1.25, 0.95], look: [1.2, 0.5, 0.9], ease: 'ss' }, { t: 6, eye: [-2.0, 1.0, 0.8], look: [2.4, -0.45, 0.8], ease: 'ss' }],
    (l, o) => {
      // from 2.6 s the hands settle on the knees (thighs seen below, over the edge of the bed)
      const k = smooth(ramp(l, 2.6, 4.4));
      o.rig.hang(Math.sin(l));
      o.rig.reach('right', [lerp(0.22, 0.2, k), lerp(-0.4, -0.12, k), lerp(-0.34, -0.42, k)]); o.rig.reach('left', [lerp(-0.22, -0.2, k), lerp(-0.4, -0.12, k), lerp(-0.34, -0.42, k)]);
      return { walking: l < 2.2, thighs: l > 2.2, fovK: 1 + 0.25 * smooth(ramp(l, 2.6, 4.2)) }; // a wider view at the end brings the edge of the bed into the corners
    }),
  S('espera', 9, 'Sentado, esperando a porta: a cabeça pesa, o tempo passa sem sinal nenhum e a imagem pisca entre uma hora e outra', [{ t: 0, eye: [-1.5, 0.98, 1.2], look: [2.4, 0.9, 0.9] }, { t: 4.5, eye: [-1.5, 0.92, 1.2], look: [2.4, 0.55, 1.0] }, { t: 9, eye: [-1.5, 0.88, 1.2], look: [2.2, 0.4, 1.1] }],
    (l, o) => { o.rig.reach('right', [0.2, -0.12, -0.42]); o.rig.reach('left', [-0.2, -0.12, -0.42]); const dips = [2.6, 5.4, 8.2].map((c) => 1 - smooth(Math.abs(l - c) / 0.5)); return { fade: Math.max(...dips.map((d) => clamp(d))) }; }),
]);

export default {
  name: 'cela-tempo', prefix: 'cela', filmOnly: true, duration: R.duration, cue: 'cela', views: R.views,
  anchors: { porta: 'A porta trancada da cela', cama: 'A cama de metal' },
  // The tube hum all along; the footfalls to the door (bob at 1.7 Hz, 26 to 29 s) and the palm flat on it (2.9 s into
  // the view); the fist on the wall of the 'parede' view, one blow per 0.9 s landing when the phase wraps (0.81 s + 0.9 n),
  // a little weaker as the hand tires.
  sfx: [
    { t: 0, name: 'cela_zumbido', opts: { dur: R.duration } },
    ...footfalls(26, 29, 1.7, { vol: 0.6 }), { t: 28.9, name: 'batida_parede', opts: { vol: 0.6 } },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ t: +(40 + 0.9 * n - 0.09).toFixed(2), name: 'batida_parede', opts: { vol: +(1 - 0.3 * ramp(0.9 * n - 0.09, 3, 6)).toFixed(2) } })),
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const sc = buildScene(r, { seed: ctx.seed, groups: ctx.groups ?? undefined });
    sc.parts.setCoin(true);
    const crow = buildAnimal(r, 'corvo', { seed: 5, scale: 1.45 });
    const perch = new T.Group(); perch.position.set(-2.78, 1.56, -1.4); perch.rotation.set(0, 0.3, 0); perch.add(crow.root); sc.group.add(perch);
    const { arms, rig } = playerArms(r, { bare: true }); liftArms(arms, 0.3);
    // the legs as seen when sitting on the edge of the bed: a thigh, a knee, a shin that hangs and a foot, in trousers
    const legM = r.mat('#7a8296', { map: tex(r, 'cloth') }), skinM = r.mat('#a8744c', {});
    const legs = [-1, 1].map((sg) => {
      const g = new T.Group(); g.userData.sg = sg; g.visible = false; sc.group.add(g);
      const th = new T.Mesh(new T.CylinderGeometry(0.075, 0.07, 0.7, 6), legM); th.rotation.z = Math.PI / 2; th.position.set(-1.77, 0.57, 0); g.add(th);
      const kn = new T.Mesh(new T.SphereGeometry(0.085, 6, 4), legM); kn.position.set(-1.43, 0.57, 0); g.add(kn);
      const sh = new T.Mesh(new T.CylinderGeometry(0.065, 0.055, 0.5, 6), legM); sh.position.set(-1.41, 0.3, 0); g.add(sh);
      const ft = new T.Mesh(new T.BoxGeometry(0.24, 0.07, 0.11), skinM); ft.position.set(-1.29, 0.035, 0); g.add(ft);
      return g;
    });
    const o = { rig, door: (f) => sc.parts.setDoor(f) };
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { porta: () => sc.anchors.porta, cama: () => sc.anchors.cama },
      pose(t, ambient) {
        sc.update(ambient); crow.update(ambient, 0);
        const { seg, local, cam } = R.at(t);
        sc.parts.setDoor(0); rig.hang(Math.sin(local * 1.3));
        const f = seg.act(local, o) ?? {};
        for (const m of legs) { m.visible = !!f.thighs || seg.name === 'espera'; const esp = seg.name === 'espera'; m.position.set(esp ? 0.15 : 0, 0, (esp ? 1.2 : 0.8) + m.userData.sg * 0.17); } // on the corner of the bed, then further along it
        const w = f.walking ? 1 : 0, b = bob(t, w * 0.8, 1.7), sh = f.shake ?? 0, br = f.breath ? Math.sin(local * 1.6) * 0.012 : 0;
        const eye = [cam.eye[0] + b[0] * 0.3 + Math.sin(ambient * 71) * 0.025 * sh, cam.eye[1] + b[1] + br + Math.sin(ambient * 63) * 0.02 * sh, cam.eye[2]];
        return { eye, look: cam.look, roll: (cam.roll ?? 0) + b[2] + Math.sin(ambient * 57) * 0.03 * sh, fovK: f.fovK ?? 1, fade: f.fade ?? 0, daze: seg.name === 'parede' ? 0.25 * ramp(local, 2, 6) : 0 };
      },
    };
  },
};
