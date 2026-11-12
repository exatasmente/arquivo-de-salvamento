// Cutscene 3, "flashes": short cuts with a flash. A shed with cages of grown people (dark
// silhouettes, nobody hurt) and creatures (vigia, casca and fole) at a negotiation table talking about your weight:
// no subtitles, only gestures. First person, 17 s. Scene: scenes/galpao.js.
import { buildScene } from '../scenes/galpao.js';
import { buildCreature } from '../models/creatures.js';
import { buildHuman } from '../models/human.js';
import { track, ramp, smooth, lerp } from './common.js';

const D = 17;
// each cut: [start, end, name, description, camera keys (relative to the cut start)]
const CUTS = [
  [0, 2.6, 'jaulas', 'Um corredor de jaulas com gente adulta sentada no chão, de cabeça baixa, sob a luz dura das lâmpadas',
    [{ t: 0, eye: [-3.7, 1.25, 0.3], look: [-8.3, 0.55, -1.3] }, { t: 2.6, eye: [-4.0, 1.2, -0.9], look: [-8.3, 0.5, -1.35] }]],
  [2.6, 4.7, 'jaula', 'Mais perto de uma jaula: duas pessoas adultas sentadas e encolhidas no chão, de cabeça baixa',
    [{ t: 0, eye: [-4.9, 1.1, -0.8], look: [-8.3, 0.5, -1.3] }, { t: 2.1, eye: [-5.0, 1.05, -0.9], look: [-8.3, 0.48, -1.3] }]],
  [4.7, 8.0, 'mesa', 'A mesa de negociação: quatro criaturas enormes de pé em volta, gesticulando umas para as outras',
    [{ t: 0, eye: [5.2, 1.8, 0.6], look: [0, 1.7, -2.8] }, { t: 3.3, eye: [3.6, 1.8, -0.4], look: [0, 1.7, -2.8] }]],
  [8.0, 10.4, 'balanca', 'O vigia, de frente, lê os números em voz alta como num leilão: a faixa de olho larga e o braço que gesticula, com as outras criaturas ao fundo e de lado',
    [{ t: 0, eye: [-0.1, 1.95, -0.9], look: [-1.4, 1.9, -3.9] }, { t: 2.4, eye: [-0.3, 1.95, -1.1], look: [-1.4, 1.9, -3.9] }]],
  [10.4, 12.6, 'fichas', 'Mais perto do vigia, que continua a ler os números e a bater o dedo no ar, enquanto uma mão comprida empurra as fichas pela mesa ao lado dele',
    [{ t: 0, eye: [-0.3, 1.9, -1.3], look: [-1.0, 1.55, -3.4] }, { t: 2.2, eye: [-0.5, 1.9, -1.6], look: [-1.1, 1.55, -3.4] }]],
  [12.6, 14.8, 'jaulaAlta', 'Uma jaula alta, no escuro, e as criaturas passando embaixo',
    [{ t: 0, eye: [-2.6, 1.5, -2.4], look: [-7.8, 3.4, -4.6] }, { t: 2.2, eye: [-2.9, 1.5, -3.4], look: [-7.8, 3.5, -4.8] }]],
  [14.8, 17, 'fim', 'Todos olham para você ao mesmo tempo e a luz da mesa se apaga',
    [{ t: 0, eye: [0, 1.4, 2.7], look: [0, 1.9, -2.4] }, { t: 2.2, eye: [0, 1.4, 2.1], look: [0, 1.9, -2.4] }]],
];
const views = {};
for (const c of CUTS) views[c[2]] = [c[0], c[1], c[3]];
views.tudo = [0, D, 'Todos os cortes da cena, em sequência'];
const tracks = CUTS.map((c) => track(c[4]));
const flashEvents = CUTS.map((c) => ({ t: c[0] + 0.02, s: 1 }));

const SEATS = [['vigia', 'lugarJavali'], ['fole', 'lugarLobo'], ['casca', 'lugarUrso'], ['vigia', 'lugarRaposa']];

export default {
  name: 'flashes', duration: D, cue: 'flashes', views,
  anchors: { mesa: 'A mesa de negociação', balanca: 'A balança sobre a mesa', jaula: 'Uma jaula com gente adulta' },
  // The flash of every cut; the murmur of the shed (a crowd level that rises); the creatures take turns at the table
  // (the speaker of pose(): Vigia 4.8 to 6 s, Fole 6 to 7.2 s, Casca 7.2 to 8 s) and the Vigia reads the numbers (8 to
  // 12.6 s); the chips slide on the table (10.3 to 12.8 s).
  sfx: [
    ...CUTS.map((c) => ({ t: c[0] + 0.02, flash: true })),
    { t: 0.1, crowd: 0.2 }, { t: 8.0, crowd: 0.28 }, { t: 12.6, crowd: 0.35 }, { t: 16.95, crowd: 0 },
    { t: 4.8, name: 'fala', opts: { who: 'vigia', dur: 1.2, mood: 'negocia' } },
    { t: 6.0, name: 'fala', opts: { who: 'fole', dur: 1.2, mood: 'negocia' } }, { t: 7.2, name: 'fala', opts: { who: 'casca', dur: 0.8, mood: 'negocia' } },
    { t: 8.1, name: 'fala', opts: { who: 'vigia', dur: 2.2, mood: 'negocia' } }, { t: 10.5, name: 'fala', opts: { who: 'vigia', dur: 1.9, mood: 'negocia' } },
    { t: 10.45, name: 'moeda' }, { t: 12.3, name: 'moeda' },
  ],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed });
    const lit = []; // the creatures' materials: lit by the table lamp in the last cut
    const crowd = SEATS.map(([sp, place], i) => {
      const an = buildCreature(r, sp, { seed: 30 + i, scale: 1.0 });
      const p = sc.anchors[place], h = new r.THREE.Group(); // the creature's own root is left alone: the group moves
      h.position.set(p[0], 0, p[2]); h.rotation.y = sc.facing[place]; h.add(an.root); sc.group.add(h);
      return { an, h, base: sc.facing[place] };
    });
    crowd.forEach((c) => c.an.root.traverse((o) => { const u = o.isMesh && o.material?.uniforms?.uEmissive; if (u) lit.push([u, u.value]); }));
    // grown people in the cages of the west wall, sitting or huddled with the head down: nobody is hurt
    const people = [];
    const PEOPLE = [
      [-8.35, -1.95, 'sit', { seed: 301, height: 1.72, skin: '#c8946a', hair: '#2a1a10', top: '#6a5a3a', trunks: '#3a4a5a' }],
      [-8.3, -0.65, 'huddle', { seed: 302, height: 1.66, skin: '#a8744c', hair: '#14100c', female: true, top: '#7a3a4a', trunks: '#4a4a52' }],
      [-8.35, -4.6, 'sit', { seed: 303, height: 1.78, skin: '#efcfae', hair: '#7a5530', top: '#3a5a4a', trunks: '#5a5a3a' }],
      [-8.3, 2.0, 'huddle', { seed: 304, height: 1.7, skin: '#80502f', hair: '#14100c', top: '#5a5a70', trunks: '#3a3a4a' }],
    ];
    for (const [x, z, pose, look] of PEOPLE) {
      const H = buildHuman(r, { build: 'lean', outfit: 'civil', glove: 'none', scar: false, ...look });
      H.root.position.set(x, 0.04, z); H.root.rotation.y = 0.35; sc.group.add(H.root);
      const J = H.joints;
      J.hips.position.y = pose === 'sit' ? 0.13 : 0.15;
      if (pose === 'sit') { // legs forward, back bowed, head down, hands on the knees
        J.hipL.rotation.x = J.hipR.rotation.x = -1.5; J.kneeL.rotation.x = J.kneeR.rotation.x = 0.25; J.spine.rotation.x = 0.3; J.neck.rotation.x = 0.6; J.head.rotation.x = 0.4;
        for (const n of ['L', 'R']) { J['shoulder' + n].rotation.x = -0.55; J['elbow' + n].rotation.x = -0.6; }
      } else { // sitting on the floor with the knees bent up, head down, hands on the shins
        J.hipL.rotation.x = J.hipR.rotation.x = -1.35; J.kneeL.rotation.x = J.kneeR.rotation.x = 1.25; J.spine.rotation.x = 0.3; J.neck.rotation.x = 0.6; J.head.rotation.x = 0.4;
        for (const n of ['L', 'R']) { J['shoulder' + n].rotation.x = -0.7; J['elbow' + n].rotation.x = -0.5; }
      }
      // the shed is dark: let them glow a little so they read as people
      H.root.traverse((o) => { const u = o.isMesh && o.material?.uniforms?.uEmissive; if (u) u.value = 0.4; });
      people.push(H);
    }
    // the chips on the table and the long arm that pushes them: a pile of glowing discs and a thin two-bone arm
    // coming from the far right (the creature at the east seat), all a pure function of time
    const T3 = r.THREE, chipMat = r.mat('#ffd23a', { emissive: 0.8, fogged: 0.4 }), armMat = r.mat('#9a7e74', { emissive: 0.25, fogged: 0.6 }), handMat = r.mat('#9a7e74', { emissive: 0.25, fogged: 0.6 }); // the skin of the creature at the east seat
    const chips = [];
    for (let i = 0; i < 9; i++) { const m = new T3.Mesh(new T3.CylinderGeometry(0.09, 0.09, 0.03, 8), chipMat); m.visible = false; sc.group.add(m); chips.push(m); }
    const seg = (m, a, b, w) => { const d = new T3.Vector3(...b).sub(new T3.Vector3(...a)); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.scale.set(w, d.length(), w); m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), d.normalize()); };
    const upper = new T3.Mesh(new T3.CylinderGeometry(0.5, 0.4, 1, 6), armMat), fore = new T3.Mesh(new T3.CylinderGeometry(0.4, 0.3, 1, 6), armMat), hand = new T3.Group();
    hand.add(new T3.Mesh(new T3.BoxGeometry(0.17, 0.06, 0.2), handMat)); // the palm, with four long fingers and a thumb pushing the pile toward -x
    for (let i = 0; i < 4; i++) { const f = new T3.Mesh(new T3.BoxGeometry(0.15, 0.035, 0.04), handMat); f.position.set(-0.15, -0.005, -0.075 + i * 0.05); hand.add(f); }
    { const th = new T3.Mesh(new T3.BoxGeometry(0.1, 0.035, 0.045), handMat); th.position.set(-0.08, -0.005, 0.13); th.rotation.y = 0.5; hand.add(th); }
    const joints = [new T3.Mesh(new T3.SphereGeometry(0.13, 6, 4), armMat), new T3.Mesh(new T3.SphereGeometry(0.1, 6, 4), armMat)]; // shoulder and elbow
    for (const m of [upper, fore, hand, ...joints]) { m.visible = false; sc.group.add(m); }
    const TY = 1.24, TZ = -2.72;
    function pushChips(t) {
      const on = t >= 10.3 && t < 12.8, u = smooth(ramp(t, 10.4, 12.4));
      const hx = lerp(0.0, -0.95, u); // the hand moves toward the vigia, the pile slides in front of it
      chips.forEach((m, i) => { m.visible = t >= 10.3 && t < 12.8; const col = i % 3, row = Math.floor(i / 3), st = [0, 1, 2][row];
        m.position.set((hx - 0.2) - col * 0.14 + (row % 2) * 0.06, TY + 0.02 + (i % 2 ? 0.035 : 0) * (col === 1 ? 1 : 0) + st * 0.0, TZ + (row - 1) * 0.12 + col * 0.02); });
      upper.visible = fore.visible = hand.visible = joints[0].visible = joints[1].visible = on;
      if (!on) return;
      const S = [1.25, 2.0, -3.85], H = [hx + 0.14, TY + 0.1, TZ], E = [0.6, 1.55, -3.3]; // shoulder at the creature's side, a clearly bent elbow low and out, the forearm nearly flat to the table
      seg(upper, S, E, 0.22); seg(fore, E, H, 0.17); joints[0].position.set(...S); joints[1].position.set(...E); hand.position.set(H[0] + 0.02, H[1], H[2]); hand.rotation.set(0, 0, 0);
    }
    return {
      group: sc.group, lights: sc.lights,
      anchors: { mesa: () => sc.anchors.mesa, balanca: () => [0.8, 1.7, -2.2], jaula: () => sc.anchors.jaulaPerto },
      pose(t, ambient) {
        sc.update(ambient);
        pushChips(t);
        // the sentinel (vigia, seat 0, the one facing the camera) reads the numbers during the scale and the chips; otherwise they take turns
        const speaker = t >= 14.8 ? -1 : t >= 8.0 && t < 12.6 ? 0 : Math.floor(t / 1.2) % 4, tt = (t % 1.2) / 1.2;
        crowd.forEach((c, i) => {
          c.an.update(ambient + i * 0.9, undefined);
          const talk = i === speaker ? Math.sin(Math.PI * tt) : 0, J = c.an.joints;
          const toward = i < 2 ? 1 : -1;
          // the speaker leans forward and gestures with an open hand; the others turn their heads toward the speaker
          c.h.rotation.set(talk * 0.1, c.base, 0);
          if (t >= 14.8) { // the last cut: everyone turns to look at you
            const px = c.h.position.x, pz = c.h.position.z; let d = Math.atan2(-px, 4.6 - pz) - c.base; d = Math.atan2(Math.sin(d), Math.cos(d));
            c.h.rotation.y = c.base + d * smooth(ramp(t, 14.9, 15.7));
          }
          if (i === speaker) { J.shoulderR.rotation.x = -0.45 * talk; J.shoulderR.rotation.z = -0.04 * talk; J.elbowR.rotation.x = -1.9 * talk; J.shoulderR.rotation.y = 0.5 * talk; }
          else if (t < 14.8) J.neck.rotation.y += toward * 0.5 * Math.sin(Math.PI * tt) * (i % 2 ? 1 : -1);
        });
        const glow = 0.35 * smooth(ramp(t, 14.8, 15.4)); for (const [u, v0] of lit) u.value = Math.max(v0, glow);
        let k = CUTS.findIndex((c) => t >= c[0] && t < c[1]); if (k < 0) k = CUTS.length - 1;
        const tl = t - CUTS[k][0], f = tracks[k](tl);
        const wob = Math.sin(t * 2.3) * 0.004;
        const noise = 0.22 * Math.max(0, 1 - tl / 0.25);
        const fade = smooth(ramp(t, 16.2, 17.0)) + (k === 0 ? 1 - smooth(ramp(t, 0, 0.35)) : 0);
        return { eye: [f.eye[0] + wob, f.eye[1], f.eye[2]], look: f.look, roll: Math.sin(t * 1.7) * 0.015, fade: Math.min(1, fade), fovK: k === 3 ? 0.68 : k === 4 ? 0.74 : k === 1 ? 0.42 : k === 0 ? 0.44 : k === 5 ? 0.78 : k === 6 ? 1.0 : 1, flashes: flashEvents, noise, daze: 0.18 + 0.1 * Math.sin(t * 2), blur: 0.0 };
      },
    };
  },
};
void lerp;
