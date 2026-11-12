// Film-only reel "pomar-cerco": the orchard in the order of the narration: the night outside, the
// house behind, the crouched run, the fear, the cold apple, the ground shaking, the two creatures
// walking in from the trees on different sides, looking up at them, the head tilt, their talk, the way out
// closing and the apple falling. First person, bare hands. Not played by the game (see src/film.js).
// Scene: scenes/pomar.js.
import { buildScene } from '../scenes/pomar.js';
import { buildCreature } from '../models/creatures.js';
import { tex } from '../textures/paint.js';
import { nightify } from './night.js';
import { buildCube, buildBeam, buildFreezeGun, buildFrostJet, pullPath, shrinkCamera, tintArms } from './abducao.js';
import { liftArms, hideInstanceNear, footfalls, reel, bob, playerArms, ramp, smooth, lerp, clamp } from './common.js';

const P = [-2.45, 1.65, -5.9];
const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const faceP = (x, z) => Math.atan2(P[0] - x, P[2] - z);
const CS = { x: 0.3, z: -1.8 }, FS = { x: -2.9, z: 0.4 }; // where they rise between the trees, mid-distance (Fole behind)
const FO = { x: -2.35, z: -3.5 };                              // where Fole stands to raise its cube
const HOV = [P[0], 4.3, P[2] + 0.15];                         // where the cube hovers over you
const PR = { x: -1.1, z: -3.3 }, CR = { x: 1.5, z: -3.6 };    // where the two stand when they have closed in

/** Aims at `target` from `eye`, but never more than 72 degrees up: straight up would make the camera spin about its own axis. */
function clampUp(eye, target) {
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2], h = Math.hypot(dx, dz) || 1e-6, maxY = h * Math.tan(1.26);
  return dy > maxY ? [eye[0] + (dx / h) * (dy / Math.tan(1.26)), target[1], eye[2] + (dz / h) * (dy / Math.tan(1.26))] : target;
}

const R = reel([
  S('noiteLa', 5, 'Da porta dos fundos, o pomar do outro lado do campo: as fileiras de macieiras no fim do dia', [{ t: 0, eye: [0, 1.65, 8.7], look: [-6, 1.9, 0] }, { t: 5, eye: [0, 1.65, 8.7], look: [6, 1.9, 0], ease: 'ss' }], () => ({})),
  S('casaAtras', 4, 'Você olha para trás: a casa com a luz da porta e da janela, de onde você saiu', [{ t: 0, eye: [0, 1.65, 2.4], look: [0, 1.9, 9.4] }, { t: 4, eye: [0, 1.65, 2.2], look: [0.6, 1.8, 9.4] }], () => ({})),
  S('campo', 5, 'O campo aberto até a cerca, de costas para a alameda: a relva, as fileiras ao longe e a casa ficando para trás', [{ t: 0, eye: [2.3, 1.5, 6.4], look: [4.4, 2.3, 0.4] }, { t: 2.5, eye: [2.4, 1.5, 4.2], look: [4.5, 2.3, -1.6], ease: 'ss' }, { t: 5, eye: [2.5, 1.5, 2.4], look: [4.6, 2.2, -3.6] }], () => ({})),
  S('corre', 6, 'Você corre curvado, rente à fileira de árvores, de sombra em sombra', [{ t: 0, eye: [-2.7, 1.15, 7.4], look: [-2.9, 1.3, 3.0] }, { t: 6, eye: [-2.7, 1.12, 0.6], look: [-2.9, 1.3, -3.8] }], () => ({ run: 1 })),
  S('medo', 5, 'Você para e olha para trás, e depois para a frente: o coração nos ouvidos, a vontade de voltar', [{ t: 0, eye: [-2.7, 1.2, 0.6], look: [-2.9, 1.4, -3.8] }, { t: 1.5, eye: [-2.7, 1.25, 0.6], look: [-0.5, 1.6, 8.0], ease: 'ss' }, { t: 3.2, eye: [-2.7, 1.25, 0.6], look: [-0.5, 1.6, 8.0], ease: 'ss' }, { t: 5, eye: [-2.7, 1.3, 0.6], look: [-2.9, 1.5, -4.2] }], (l) => ({ pant: 1, ph: l })),
  S('macaFria', 5, 'A maçã na sua mão: fria, pesada, vermelha, perto dos olhos', [{ t: 0, eye: P, look: [-2.5, 1.55, -5.0] }, { t: 5, eye: [P[0], 1.62, P[2]], look: [-2.4, 1.45, -5.0] }], (l, o) => { o.holdApple(l); return {}; }),
  S('quieto', 5, 'O pomar quieto, sem criatura nenhuma por perto: o vento nas folhas e a maçã na mão', [{ t: 0, eye: P, look: [-1.4, 2.0, -9.0] }, { t: 5, eye: [P[0], 1.64, P[2]], look: [3.0, 2.0, -9.0], ease: 'ss' }], (l, o) => { o.holdApple(l); return {}; }),
  S('chaoTreme', 4, 'O chão treme: a visão sacode e vultos grandes se mexem na névoa, ao longe', [{ t: 0, eye: P, look: [-1.5, 1.5, -0.5] }, { t: 4, eye: P, look: [-1.4, 1.45, -0.8] }], (l, o) => { o.holdApple(l); const rise = lerp(0.7, 1, smooth(ramp(l, 0, 2.6))); return { shake: 0.8 * ramp(l, 0, 0.6) * (1 - 0.5 * ramp(l, 2.6, 4)), casca: { x: CS.x, z: CS.z, rise }, fole: { x: FS.x, z: FS.z, rise: lerp(0.6, 1, smooth(ramp(l, 0.3, 3))) } }; }),
  S('cascaSurge', 6, 'A primeira criatura aparece entre as árvores, à esquerda, e anda na sua direção: alta e magra, de placas cinza pálidas e duas fendas amarelas no lugar dos olhos', [{ t: 0, eye: P, look: [-1.4, 1.45, -0.8] }, { t: 6, eye: P, look: [-1.8, 1.4, -0.8] }],
    (l, o) => { o.holdApple(l); const u = smooth(ramp(l, 0, 6)); return { casca: { x: lerp(CS.x, -1.3, u), z: lerp(CS.z, -2.6, u), walk: u < 1 }, fole: { x: FS.x, z: FS.z } }; }),
  S('foleChega', 6, 'A segunda criatura é o assunto: enorme e corcunda, a cabeça afundada nos ombros, o peito mole que infla e murcha a cada respiração, no centro do quadro', [{ t: 0, eye: P, look: [-2.9, 1.3, 0.4] }, { t: 6, eye: P, look: [-3.0, 1.3, -2.7] }],
    (l, o) => { o.holdApple(l); const u = smooth(ramp(l, 0, 3.6)), x = lerp(FS.x, -3.0, u), z = lerp(FS.z, -2.7, u); return { casca: null, fole: { x, z, walk: u < 1 }, look: [x, 1.3, z] }; }),
  S('maioresQue', 5, 'Você olha para cima: as duas criaturas estão a dois ou três metros e a câmera sobe da altura do peito delas até as cabeças, que ficam bem acima de você, contra o céu', [{ t: 0, eye: [P[0], 1.2, P[2]], look: [-2.5, 1.75, -3.9], ease: 'ss' }, { t: 4.5, eye: [P[0], 1.2, P[2]], look: [-2.5, 2.55, -3.9] }, { t: 5, eye: [P[0], 1.2, P[2]], look: [-2.5, 2.6, -3.9] }], (l, o) => { o.holdApple(l, 0.34, -0.14); return { casca: { x: -1.5, z: -4.0 }, fole: { x: -3.5, z: -4.0 } }; }),
  S('inclinaCabeca', 5, 'Close só da criatura alta: a cabeça e o tronco enchem o quadro, ela inclina a cabeça de lado e olha para você de cima, como quem confere uma coisa à venda, com as fendas amarelas dos olhos acesas', [{ t: 0, eye: P, look: [PR.x, 2.35, PR.z] }, { t: 5, eye: [P[0], 1.6, P[2]], look: [PR.x, 2.3, PR.z] }], (l, o) => { o.holdApple(l); return { casca: { x: PR.x, z: PR.z, tilt: 0.5 * smooth(ramp(l, 0.8, 2.2)) }, fole: null, fovK: 0.42 }; }),
  S('falamEntreSi', 6, 'As duas criaturas falam entre si por gestos, virando a cabeça e abrindo as mãos uma para a outra: discutem o seu peso', [{ t: 0, eye: P, look: [0.1, 2.0, -3.4] }, { t: 6, eye: P, look: [0.0, 2.1, -3.6] }], (l, o) => { o.holdApple(l); return { casca: { x: PR.x, z: PR.z, toward: [CR.x, CR.z], turn: -0.3 * Math.sin(l * 1.4), gest: Math.max(0, Math.sin(l * 1.4)) }, fole: { x: CR.x, z: CR.z, toward: [PR.x, PR.z], turn: 0.3 * Math.sin(l * 1.4 + 1), gest: Math.max(0, Math.sin(l * 1.4 + 2.6)) } }; }),
  S('fechaSaida', 6, 'Um dá um passo para fechar a saída: você tenta correr, mas as pernas não obedecem', [{ t: 0, eye: P, look: [1.9, 1.5, -3.6], ease: 'ss' }, { t: 3, eye: [P[0], 1.62, P[2]], look: [-0.25, 1.7, -1.4], ease: 'ss' }, { t: 3.6, eye: [P[0] + 0.2, 1.55, P[2] + 0.5], look: [-0.75, 1.7, -1.6] }, { t: 6, eye: [P[0] + 0.2, 1.55, P[2] + 0.5], look: [-0.75, 1.7, -1.6] }],
    (l, o) => { o.holdApple(l); const u = smooth(ramp(l, 0, 3)); return { casca: { x: -2.1, z: -2.5 }, fole: { x: lerp(1.8, 0.4, u), z: lerp(-3.0, -2.4, u), walk: u < 1 }, shake: l > 3.4 ? 0.5 : 0 }; }),
  // the capture: the tall creature points a freezing gun at you and the ice takes the picture and your hands; the apple slips out of the
  // rigid hand; the other creature raises its cube, the cube floats over you and a column of light pulls you up, shrinking, into it
  S('congela', 5, 'A criatura alta aponta uma arma de congelar para você: o cano brilha, a visão ganha uma película de gelo e um tom azul, e as suas mãos ficam rígidas', [{ t: 0, eye: [P[0], 1.62, P[2]], look: [-2.3, 1.95, -3.2] }, { t: 5, eye: [P[0], 1.62, P[2]], look: [-2.3, 1.9, -3.2] }],
    (l, o) => {
      o.holdApple(Math.min(l, 1.2));
      const ice = smooth(ramp(l, 1.1, 3.6)), aim = smooth(ramp(l, 0, 0.9));
      return { casca: { x: -2.3, z: -3.3, gun: aim, aim: 1 }, fole: { x: 0.9, z: -3.6 }, ice, jet: smooth(ramp(l, 1.0, 1.5)) * (1 - smooth(ramp(l, 3.0, 3.8))), charge: aim, freeze: ice, shake: l < 1.1 ? 0.15 : 0.25 * (1 - ramp(l, 1.1, 2.2)) };
    }),
  S('macaCai', 3.6, 'A maçã escorrega da sua mão congelada, que não se mexe, e cai no chão: o gelo cobre a visão', [{ t: 0, eye: [P[0], 1.62, P[2]], look: [-2.3, 1.7, -2.9] }, { t: 0.9, eye: [P[0], 1.62, P[2]], look: [-2.3, 1.55, -3.0], ease: 'ss' }, { t: 2.3, eye: [P[0], 1.62, P[2]], look: [-2.35, 0.0, -4.7], ease: 'ss' }, { t: 3.6, eye: [P[0], 1.62, P[2]], look: [-2.35, 0.0, -4.85] }],
    (l, o) => {
      o.dropFrozen(l);
      return { casca: { x: -2.3, z: -3.3, gun: 1, aim: 1 }, fole: { x: 0.9, z: -3.6 }, ice: lerp(0.6, 0.7, smooth(ramp(l, 0, 3))), freeze: 1, charge: 0.4 };
    }),
  S('abducao', 10, 'A outra criatura ergue o cubo, ele flutua até ficar sobre você e uma coluna de luz pálida o puxa para cima: você encolhe, o mundo cresce em volta, e a luz do cubo toma a tela', [{ t: 0, eye: P, look: [-2.3, 2.4, -3.5] }, { t: 10, eye: P, look: [-2.3, 2.4, -3.5] }],
    (l, o) => {
      const raise = smooth(ramp(l, 0, 1.8));
      const cube = { lift: smooth(ramp(l, 2.2, 4.0)), open: smooth(ramp(l, 3.5, 4.5)), glow: 0.3 + 0.7 * smooth(ramp(l, 0.4, 2)) };
      const beam = { grow: smooth(ramp(l, 4.1, 5.0)), alpha: 1 - 0.6 * smooth(ramp(l, 8.2, 9)) };
      return {
        casca: { x: -0.2, z: -4.6 }, fole: { x: FO.x, z: FO.z, cubeArm: raise }, cube, beam, ice: 0.85 * (1 - smooth(ramp(l, 0, 3))), freeze: 1 - smooth(ramp(l, 0, 3)),
        camPull: true, wash: smooth(ramp(l, 8.5, 9.3)), fade: smooth(ramp(l, 9.3, 10)),
      };
    }),
]);

export default {
  name: 'pomar-cerco', prefix: 'pomar', filmOnly: true, duration: R.duration, cue: 'pomar', views: R.views,
  anchors: { macieira: 'A macieira de onde você colhe a maçã', casca: 'A criatura alta e magra de placas cinza pálidas', fole: 'A criatura enorme e corcunda de peito que infla' },
  // The night bed, lower from the tremor on and gone with the end of the pull; the steps that leave the house; the crouched run (bob at 3 Hz); the far thuds that
  // come nearer (the ground shakes at 35 s, then the creatures' steps); the creatures' talk by turns (the
  // gestures of 'falamEntreSi': Casca 0 to 2.2 s, Fole 2.6 to 4.9 s, Casca again 4.5 to 6.7 s); then the capture: see below.
  sfx: [
    { t: 0, name: 'noite', opts: { dur: 35 } }, { t: 35, name: 'noite', opts: { dur: R.duration - 35, vol: 0.4 } }, // lower once the ground shakes, gone with the end of the pull
    { t: 3.3, name: 'passo', opts: { vol: 0.7 } }, { t: 3.85, name: 'passo', opts: { vol: 0.7 } }, { t: 4.4, name: 'passo', opts: { vol: 0.7 } }, { t: 4.95, name: 'passo', opts: { vol: 0.7 } },
    ...footfalls(14, 20, 3.0),
    { t: 32.7, name: 'knockdown', opts: { vol: 0.55 } }, { t: 33.9, name: 'knockdown', opts: { vol: 0.8 } }, { t: 35.17, name: 'knockdown', opts: { vol: 0.6 } },
    { t: 37.0, name: 'passo', opts: { vol: 1.8 } }, { t: 38.3, name: 'passo', opts: { vol: 1.8 } }, { t: 39.5, name: 'passo', opts: { vol: 1.8 } }, { t: 40.8, name: 'passo', opts: { vol: 1.8 } },
    { t: 45.2, name: 'passo', opts: { vol: 2 } }, { t: 45.55, name: 'fala', opts: { who: 'fole', dur: 3.15, mood: 'calmo' } }, { t: 46.7, name: 'passo', opts: { vol: 2 } },
    { t: 61.2, name: 'fala', opts: { who: 'casca', dur: 2.0, mood: 'negocia' } }, { t: 63.6, name: 'fala', opts: { who: 'fole', dur: 2.2, mood: 'negocia' } }, { t: 65.5, name: 'fala', opts: { who: 'casca', dur: 1.5, mood: 'negocia' } },
    { t: 67.6, name: 'passo', opts: { vol: 1.8 } }, { t: 68.5, name: 'passo', opts: { vol: 1.8 } }, { t: 69.4, name: 'passo', opts: { vol: 1.8 } },
    // the gun charges and fires (0.9 s into 'congela'), the apple hits the ground (1.35 s into 'macaCai'), the cube hums and opens and the beam
    // pulls (from 3.9 s into 'abducao'): a rising shimmer that ends as the cube takes the picture
    { t: R.views.congela[0] + 0.9, name: 'congelar' }, { t: R.views.macaCai[0] + 1.35, name: 'maca_cair' },
    { t: R.views.abducao[0] + 3.7, name: 'feixe', opts: { dur: 6.3 } },
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const sc = buildScene(r, { seed: ctx.seed });
    nightify(r, sc); // the whole orchard is at night
    const mk = (sp, seed) => { const an = buildCreature(r, sp, { seed, scale: 1.0 }); const h = new T.Group(); h.add(an.root); sc.group.add(h); h.visible = false; return { an, h }; };
    const casca = mk('casca', 11), fole = mk('fole', 12);
    const { arms, rig } = playerArms(r, { bare: true });
    liftArms(arms, 0.42);
    const appleM = r.mat('#ffffff', { map: tex(r, 'apple'), emissive: 0.25, fogged: 0.2 });
    const apple = new T.Mesh(new T.SphereGeometry(0.085, 6, 4), appleM); arms.root.add(apple); apple.visible = false;
    const fallen = new T.Mesh(new T.SphereGeometry(0.085, 6, 4), appleM); sc.group.add(fallen); fallen.visible = false;
    // the shadow of a huge shape on the ground, cast toward you: legs, trunk with the hump, arms hanging and the head
    const shadowM = r.mat('#03040a', { opacity: 0, transparent: true, depthWrite: false, fogged: 0 });
    shadowM.polygonOffset = true; shadowM.polygonOffsetFactor = -6; shadowM.polygonOffsetUnits = -6;
    const shadowG = new T.Group(); shadowG.visible = false; sc.group.add(shadowG);
    {
      const poly = (pts) => { const sh = new T.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); const g = new T.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new T.Mesh(g, shadowM); m.renderOrder = 3; shadowG.add(m); };
      const half = [[0.45, 0.8], [0.75, 1.3], [0.95, 1.9], [1.2, 2.05], [1.45, 2.3], [1.62, 3.1], [1.4, 3.15], [1.15, 2.6], [0.6, 2.45], [0.36, 2.5], [0.36, 2.75], [0.2, 2.95]];
      poly([...half, [0, 3.0], ...half.slice().reverse().map(([x, y]) => [-x, y]), [-0.45, 0.8]].map((q) => q).concat([[0.45, 0.8]]).slice(0, -1));
      poly([[0.12, 0], [0.48, 0], [0.45, 1.0], [0.15, 1.0]]); poly([[-0.12, 0], [-0.15, 1.0], [-0.45, 1.0], [-0.48, 0]]);
    }
    // the capture props: the freezing gun in Casca's right hand, a cube for Fole, the column of light and the jet of frost
    const gun = buildFreezeGun(r); casca.an.joints.wristR.add(gun.root);
    const cube = buildCube(r), beam = buildBeam(r), jet = buildFrostJet(r);
    sc.group.add(cube.root, beam.root, jet.root);
    const o = {
      // the apple frozen in the hand: it does not move, and it slips off the curled fingers (from 0.8 s) and falls to the ground
      dropFrozen(l) {
        rig.hang(0); rig.reach('right', [0.32, -0.12, -0.45]); rig.curl('right', 0.6);
        const t0 = 0.8, u = l - t0;
        apple.visible = u < 0; apple.position.set(0.315, -0.05, -0.565); apple.rotation.y = 1.1;
        fallen.visible = u >= 0;
        const y0 = 1.58, ground = 0.13, tg = Math.sqrt(2 * (y0 - ground) / 9.8), ub = u - tg;
        const y = u < tg ? y0 - 4.9 * u * u : ground + (ub > 0 ? Math.abs(Math.sin(ub * 7)) * 0.08 * Math.exp(-ub * 3.5) : 0);
        const roll = ub > 0 ? 0.9 * (1 - Math.exp(-ub * 1.3)) : 0;
        fallen.scale.setScalar(1.5); fallen.position.set(P[0] - 0.3 - 0.05 * roll, y, P[2] + 0.57 + roll); fallen.rotation.set(roll / 0.13, 0, 0.3);
      },
      // the apple held up and to the right, above the lower third of the picture (the captions live there)
      // the apple rests on the curled fingers of the hand (palm up), a little ahead of the wrist so the back of the hand and the grip stay in view
      holdApple(l, x = 0.32, y = -0.12) { rig.hang(0); rig.reach('right', [x, y + Math.sin(l * 1.1) * 0.01, -0.45]); rig.curl('right', 0.6); apple.position.set(x - 0.005, y + 0.07, -0.565); apple.rotation.y = l * 0.6; apple.visible = true; },
      dropApple(l) {
        const k = clamp((l - 0.6) / 1.0); rig.reach('right', [0.14 + k * 0.05, -0.1 - k * 0.2, -0.42]); rig.curl('right', 0.75 - 0.75 * clamp((l - 0.4) / 0.4));
        apple.visible = l < 0.6; apple.position.set(0.14, -0.055, -0.44);
        // falls from the hand, bounces once and rolls ahead, slowing down
        fallen.visible = l >= 0.6; const u = clamp((l - 0.6) / 0.5), bounce = l > 1.1 ? Math.abs(Math.sin((l - 1.1) * 7)) * 0.08 * Math.exp(-(l - 1.1) * 3.5) : 0;
        const roll = l > 1.1 ? 1.1 * (1 - Math.exp(-(l - 1.1) * 1.3)) : 0;
        fallen.scale.setScalar(1.5);
        fallen.position.set(P[0] - 0.14 - 0.05 * roll, lerp(1.45, 0.13, u * u) + bounce, P[2] + 0.44 + roll + 0.2 * u);
        fallen.rotation.set(roll / 0.13, 0, 0.3);
      },
      shadow(x, z, su, sx, a) { shadowG.position.set(x, 0.07, z); shadowG.scale.set(sx, 1, su); shadowG.visible = a > 0.01; shadowM.opacity = a; },
    };
    const set = (c, d, t, ambient, ph) => {
      if (!d) { c.h.visible = false; return; }
      c.h.visible = true;
      c.h.position.set(d.x, 0, d.z); c.h.scale.set(1, d.rise ?? 1, 1); { const aP = Math.atan2(P[0] - d.x, P[2] - d.z); c.h.rotation.set(0, d.toward ? aP + (Math.atan2(d.toward[0] - d.x, d.toward[1] - d.z) - aP) * 0.6 : aP, 0); }
      c.an.update(ambient + ph, d.walk ? 'andar' : (d.heave ?? undefined));
      const J = c.an.joints;
      if (d.turn) J.neck.rotation.y += d.turn; // the head turns toward the other one
      if (d.tilt) { J.neck.rotation.z = d.tilt * 0.7; J.head.rotation.z = d.tilt * 0.3; } // the neck carries most of the tilt so the head stays on the trunk
      if (d.aim) { // the right arm out straight, the gun in the hand pointing at you
        J.shoulderR.rotation.set(-1.4, 0.3, 0.3); J.elbowR.rotation.set(-0.08, 0, 0);
      }
      if (d.cubeArm !== undefined) { // the right arm raised high over the head, the palm open to hold the cube
        const k = d.cubeArm; J.shoulderR.rotation.set(-2.8 * k, 0, -0.2 * k); J.elbowR.rotation.set(-0.15 * k, 0, 0);
      }
      if (d.gest) { // an open hand raised, as in talk
        for (const [n, sg] of [['L', 1], ['R', -1]]) { J['shoulder' + n].rotation.x = -0.35 * d.gest; J['shoulder' + n].rotation.z = sg * 0.06 * d.gest; J['elbow' + n].rotation.x = -1.0 * d.gest; }
      }
    };
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { macieira: () => sc.anchors.macieiraAlvo, casca: () => [PR.x, 1.4, PR.z], fole: () => [CR.x, 1.0, CR.z] },
      pose(t, ambient) {
        sc.update(ambient);
        const { seg, local, cam } = R.at(t);
        shadowG.visible = false; apple.visible = false; fallen.visible = false; rig.hang(Math.sin(local * 1.4));
        hideInstanceNear(sc.group, sc.anchors.macaGalho); // the apple of the branch is the one in your hand
        const f = seg.act(local, o) ?? {};
        set(casca, f.casca, t, ambient, 0); set(fole, f.fole, t, ambient, 1.7);
        sc.group.updateMatrixWorld(true);
        // the freezing gun: shown while Casca points it; the jet of frost runs from its muzzle to you
        gun.root.visible = (f.casca?.gun ?? 0) > 0.01; gun.charge(f.charge ?? 0);
        { const m = gun.muzzle.clone(); gun.root.localToWorld(m); jet.set(m.toArray(), [P[0], 1.55, P[2]], f.jet ?? 0, 0.3); }
        // the cube rides above Fole's raised hand, then floats over you; the column of light comes down from it
        let cp = null;
        cube.root.visible = false; beam.set({ grow: 0 });
        if (f.cube) {
          const w = new T.Vector3(); fole.an.joints.wristR.getWorldPosition(w);
          const u = f.cube.lift, hand = [w.x, w.y + 0.3, w.z], hov = Math.sin(ambient * 2) * 0.04 * u;
          cp = [lerp(hand[0], HOV[0], u), lerp(hand[1], HOV[1], u) + 0.9 * Math.sin(Math.PI * u) + hov, lerp(hand[2], HOV[2], u)];
          cube.root.visible = true; cube.root.position.set(...cp); cube.set({ open: f.cube.open, glow: f.cube.glow, spin: ambient * 0.7 * u });
          beam.set({ x: HOV[0], z: HOV[2], top: HOV[1] - 0.25, bottom: 0, radius: 0.55, grow: f.beam.grow, alpha: f.beam.alpha, t: ambient });
        }
        const run = f.run ? 1 : 0, b = bob(t, run * 1.7 + (f.pant ? 0.4 : 0), run ? 3.0 : 2.2), sh = f.shake ?? 0;
        let eye = [cam.eye[0] + b[0] * 0.5 + Math.sin(ambient * 73) * 0.03 * sh, cam.eye[1] + b[1] + Math.sin(ambient * 61) * 0.03 * sh, cam.eye[2]], look = f.look ?? cam.look, k = 1, roll = (cam.roll ?? 0) + b[2] + Math.sin(ambient * 59) * 0.04 * sh;
        let fovK = f.fovK ?? 1, daze = f.pant ? 0.25 : 0, armsOn = true;
        if (f.camPull && cp) { // pulled up: first you shrink (the world swells), then you rise up the column into the cube
          const pp = pullPath(local, { e0: [P[0], 1.65, P[2]], hov: HOV, shrink: [4.8, 6.4], rise: [6.4, 9.0], low: 0.2 });
          eye = pp.eye; k = pp.k;
          const lookFole = [FO.x, 2.4, FO.z], lookUp = [eye[0], eye[1] + 5, eye[2] - 0.9];
          const w1 = smooth(ramp(local, 4.2, 4.9)), w2 = smooth(ramp(local, 6.0, 7.0)), mixv = (x, y, q) => [lerp(x[0], y[0], q), lerp(x[1], y[1], q), lerp(x[2], y[2], q)];
          look = mixv(mixv(clampUp(eye, cp), lookFole, w1), lookUp, w2);
          fovK = 1 + 0.3 * smooth(ramp(local, 4.8, 6.4)); roll = 0.5 * smooth(ramp(local, 6.4, 9)); daze = 0.35 * smooth(ramp(local, 6.2, 9)); armsOn = local < 4.8;
        }
        shrinkCamera(r, k); arms.root.visible = armsOn; tintArms(arms, f.freeze ?? 0);
        return { eye, look, roll, fade: f.fade ?? 0, fovK, flashes: f.flash ? [{ t: f.flash, s: 1 }] : [], daze, ice: f.ice ?? 0, wash: f.wash ?? 0 };
      },
    };
  },
};
