// Film-only reel "ringue-plateia": the hall of the ring before and during the run, in the order of the
// narration: the spotlight changing, the crowd of huge creatures, the standing tiers, the drone-camera
// hovering over the ring, the dog-like judge with a whistle, the roar, the dizziness, the hand feeling for
// the stone and the drone looking down. First person, gloves on. Not played by the game (see src/film.js).
// Uses the ring of ring.js (ctx.ring, with its judge and its stone).
import { buildDrone } from './drone.js';
import { ringCreatures, cullCrowd } from './crowd.js';
import { reel, playerArms, ramp, smooth, lerp, clamp } from './common.js';

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const DRONE = [0.6, 3.4, 0.4], CROWD_K = 1.7;
const JUDGE = [Math.sin(0.45) * 3.1, 0, Math.cos(0.45) * 3.1]; // the judge stands inside the ropes here, so no rope crosses his face
const orbit = (r, a, y, ly) => ({ eye: [0, 1.95, 0.2], look: [Math.sin(a) * r, ly, Math.cos(a) * r] });
const o1 = orbit(8, 0.0, 0, 2.5), o2 = orbit(8, 2.6, 0, 2.5);
const R = reel([
  S('holofoteAlto', 5, 'Os holofotes do teto acendendo sobre o ringue: o branco que cega e some em círculos', [{ t: 0, eye: [0, 1.65, 0.6], look: [2.0, 9.5, -1.5] }, { t: 5, eye: [0, 1.65, 0.6], look: [-0.8, 7.0, -1.5] }], (l) => ({ noDrone: true, flashes: [{ t: 0.3, rise: 0.5, fall: 1.6, glare: true, s: 1 }], glareAt: [0.62, 0.15], daze: 0.5 * (1 - ramp(l, 0, 4)), blur: 0.7 * (1 - ramp(l, 0, 3)) })),
  S('plateiaGira', 8, 'A plateia gigante em volta do ringue redondo: criaturas enormes nas arquibancadas, sem um canto para se esconder', [{ t: 0, ...o1 }, { t: 8, ...o2 }], (l, o) => { o.rig.reach('right', [0.3, -0.45, -0.25]); o.rig.reach('left', [-0.3, -0.45, -0.25]); return { noDrone: true, cull: true, fovK: 1.5, excite: 0.6 }; }),
  S('plateiaDePe', 5, 'Criaturas de pé nas arquibancadas, os braços erguidos e as bocas abertas', [{ t: 0, eye: [-1.0, 1.65, 3.2], look: [-3.0, 3.0, 8.5] }, { t: 5, eye: [-1.0, 1.65, 3.2], look: [2.0, 3.4, 8.5] }], () => ({ excite: 1, cull: true })),
  S('droneAlto', 6, 'Lá no alto, o drone-câmera pairando sobre o ringue, a luz vermelha piscando', [{ t: 0, eye: [-1.8, 1.65, 2.0], look: [0.5, 3.3, 0.4] }, { t: 6, eye: [-1.8, 1.65, 2.0], look: [0.6, 3.5, 0.4] }], () => ({ droneFace: true, cull: true })),
  S('droneLente', 4, 'A lente do drone virando para você, de baixo', [{ t: 0, eye: [-2.0, 1.65, 1.9], look: [0.6, 3.4, 0.4] }, { t: 4, eye: [-1.8, 1.65, 1.7], look: [0.6, 3.4, 0.4] }], () => ({ droneFace: true, cull: true })),
  S('juiz', 6, 'Na beira do ringue, o juiz: uma criatura atarracada de rosto chato, coleira grossa e colete listrado, que ergue o apito à boca e finge não ver nada', [{ t: 0, eye: [-0.2, 1.45, 0.9], look: [JUDGE[0], 1.35, JUDGE[2]] }, { t: 6, eye: [0.0, 1.45, 1.1], look: [JUDGE[0], 1.4, JUDGE[2]] }], (l, o) => { o.rig.reach('right', [0.3, -0.5, -0.2]); o.rig.reach('left', [-0.3, -0.5, -0.2]); return { cull: true, keepJudge: true, fovK: 1.15, whistle: smooth(ramp(l, 1.2, 2.2)) * (1 - smooth(ramp(l, 4.2, 5.2))) }; }),
  S('barulho', 5, 'O barulho sobe: a plateia ruge e a visão balança, sem uma voz a seu favor', [{ t: 0, eye: [0, 1.65, 0.0], look: [-6, 2.2, -4] }, { t: 2.5, eye: [0, 1.65, 0.0], look: [-5, 2.4, 3] }, { t: 5, eye: [0, 1.65, 0.0], look: [1, 2.0, -6] }], () => ({ excite: 1, shake: 0.35, cull: true, fovK: 1.3 })),
  S('gira', 6, 'Tudo gira: o chão some, a imagem embaça e os sons chegam abafados', [{ t: 0, eye: [-3.4, 1.0, -0.5], look: [0, 2.0, 0] }, { t: 6, eye: [-3.4, 0.5, -0.5], look: [0, 3.0, 0] }], (l) => ({ noDrone: true, spin: l, daze: 0.8, blur: 0.8, excite: 0.8 })),
  S('maoTateia', 6, 'A mão tateia o chão do ringue, chega até a pedra cinza-clara ao pé do poste amarelo e a toca', [{ t: 0, eye: [3.4, 0.4, 0.74], look: [3.85, 0.25, 1.3] }, { t: 3.5, eye: [3.4, 0.4, 0.76], look: [3.82, 0.22, 1.3], ease: 'ss' }, { t: 6, eye: [3.4, 0.45, 0.74], look: [3.85, 0.35, 1.3] }],
    (l, o) => {
      // the hand feels along the floor, lands on the stone, closes on it and lifts it a little; the camera rises to show the yellow tape of the post
      const u = smooth(ramp(l, 0.0, 2.6)), lift = smooth(ramp(l, 4.2, 5.6)), grip = smooth(ramp(l, 3.3, 4.2));
      o.stoneAt(lift);
      const tgt = o.toCam(o.stone());
      const sweep = Math.sin(l * 3.1) * 0.05 * (1 - u);
      o.rig.reach('right', [lerp(0.14, tgt[0], u) + sweep, lerp(-0.2, tgt[1] + 0.13 - 0.05 * grip, u), lerp(-0.4, tgt[2] + 0.05, u)]); o.rig.reach('left', [-0.2, -0.3, -0.3]);
      return { fovK: 1.2 };
    }),
  S('droneOlha', 6, 'Deitado no ringue, você vê o drone lá em cima, ainda olhando: ele filma tudo', [{ t: 0, eye: [-0.9, 0.35, 0.4], look: [1.2, 2.7, 0.4] }, { t: 6, eye: [-0.7, 0.35, 0.5], look: [1.2, 2.8, 0.4] }], (l, o) => { o.rig.reach('right', [0.34, -0.3, -0.42]); o.rig.reach('left', [-0.36, -0.3, -0.4]); return { droneFace: true, spot: true, cull: true, daze: 0.3, fovK: 1.25 }; }),
]);

export default {
  name: 'ringue-plateia', prefix: 'ringue', filmOnly: true, duration: R.duration, cue: 'ringue', views: R.views,
  anchors: { drone: 'O drone-câmera que transmite a rinha', juiz: 'O juiz, a criatura de coleira e colete listrado que leva um apito', pedra: 'A pedra ao pé do poste de fita amarela' },
  // The spotlight glare and the bell (0.3 s); the crowd level follows 'excite' of each view (it rises to the roar of
  // 'barulho' at 34 s, is muffled in 'gira' from 39 s and falls to a murmur); the drone hum from its first view and again
  // from 39 s; the referee blows the whistle as it reaches his mouth (the 'juiz' view lifts it from 29.2 to 30.2 s,
  // 'fala' ends with the whistle); the hand closes on the stone (48.3 s); the fall in 'gira' (40.15 s).
  sfx: [
    { t: 0.3, flash: true }, { t: 0.3, name: 'sino', opts: { hits: 2 } },
    { t: 1.0, crowd: 0.4 }, { t: 5.0, crowd: 0.55 }, { t: 13.0, crowd: 0.65 }, { t: 34.0, crowd: 0.85 },
    { t: 39.0, crowd: 0.5 }, { t: 41.0, crowd: 0.35 }, { t: 43.0, crowd: 0.2 }, { t: 44.5, crowd: 0.12 },
    { t: 48.0, crowd: 0.2 }, { t: 50.0, crowd: 0.3 }, { t: 57.0, crowd: 0 },
    { t: 24.0, name: 'drone_zumbido', opts: { dur: 15, vol: 0.8 } }, { t: 39.0, name: 'drone_zumbido', opts: { dur: 18, vol: 0.8 } },
    { t: 29.0, name: 'fala', opts: { who: 'apito', dur: 1.4, mood: 'ordena' } },
    { t: 40.15, name: 'knockdown', opts: { vol: 0.6 } },
    { t: 48.3, name: 'pedra_pegar' },
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE, ring = ctx.ring;
    const grp = new T.Group(); r.scene.add(grp);
    const drone = buildDrone(r); grp.add(drone.root);
    const cr = ringCreatures(r, ring, ctx.seed); grp.add(cr.group);
    // the crowd is huge next to the ropes and posts (ring.js builds them at the size of a fighter)
    for (const m of ring.audienceRoots ?? []) m.scale.setScalar(CROWD_K);
    // a cone of light from the ceiling down onto the drone, only for the views that look up at it from below
    const cone = new T.Mesh(new T.CylinderGeometry(0.5, 1.9, 8.0, 14, 1, true), r.mat('#fff0cc', { emissive: 1, opacity: 0.09, transparent: true, depthWrite: false, fogged: 0, side: T.DoubleSide }));
    cone.position.set(DRONE[0], DRONE[1] + 3.0, DRONE[2]); cone.renderOrder = 3; grp.add(cone);
    const stone = new T.Mesh(new T.IcosahedronGeometry(0.15, 0), r.mat('#c8c4b8', { emissive: 0.2, fogged: 0.9 })); stone.scale.set(1.25, 0.85, 1.05);
    if (ring.stone) stone.position.set(ring.stone.x, 0.09, ring.stone.z); grp.add(stone);
    const { arms, rig } = playerArms(r, { bare: false });
    const jr = ring.judge?.root, jp0 = jr?.position.clone(), jy0 = jr?.rotation.y;
    const h = { stone: ring.stone?.mesh ?? null, was: true };
    const tmp = new T.PerspectiveCamera();
    const stp = { x: ring.stone?.x ?? 0, y: 0.09, z: ring.stone?.z ?? 0 };
    const o = { rig, toCam: (p) => tmp.worldToLocal(new T.Vector3(...p)).toArray(), stone: () => [stp.x, stp.y, stp.z], stoneAt(k) { stp.x = (ring.stone?.x ?? 0) - 0.04 * k; stp.z = (ring.stone?.z ?? 0) - 0.05 * k; stp.y = 0.09 + 0.07 * k; } };
    return {
      group: grp, lights: { apply: () => ring.applyLights() }, arms,
      show(on) { if (jr) { if (on) jr.position.set(...JUDGE); else jr.position.copy(jp0); jr.rotation.y = jy0; } grp.visible = on; ring.group.visible = on; cr.show(on); if (h.stone) { if (on) { h.was = h.stone.visible; h.stone.visible = false; } else h.stone.visible = h.was; } if (on) ring.applyLights(); },
      anchors: { drone: () => DRONE, juiz: () => [JUDGE[0], 2.0, JUDGE[2]], pedra: () => (ring.stone ? [ring.stone.x, 0.09, ring.stone.z] : [0, 0, 0]) },
      pose(t, ambient) {
        const { seg, local, cam } = R.at(t);
        tmp.position.set(...cam.eye); tmp.up.set(0, 1, 0); tmp.lookAt(...cam.look); tmp.updateMatrixWorld(true);
        rig.guard(Math.sin(local * 1.5));
        o.stoneAt(0);
        const f = seg.act(local, o) ?? {};
        ring.update(ambient, f.excite ?? 0.9); cr.update(ambient, f.excite ?? 0.9); cr.whistle(f.whistle ?? 0);
        { const J = cr.judge?.joints; if (J) { // the judge's free hand: bigger, with the fingers long, away from the body
          for (const n of ['wristL', 'wristR']) J[n]?.scale.set(1.7, 1.9, 1.7);
          J.shoulderL.rotation.z = 0.28; J.elbowL.rotation.x = -0.5; } }
        drone.pose(ambient, DRONE, {});
        cone.visible = Boolean(f.spot); drone.root.visible = !f.noDrone;
        if (ring.stone) stone.position.set(stp.x, stp.y, stp.z);
        if (f.droneFace) drone.root.rotation.y = Math.atan2(cam.eye[0] - DRONE[0], cam.eye[2] - DRONE[2]);
        const sh = f.shake ?? 0, sp = f.spin ?? 0;
        const eye = [cam.eye[0] + Math.sin(ambient * 77) * 0.03 * sh, cam.eye[1] + Math.sin(ambient * 69) * 0.03 * sh, cam.eye[2]];
        const look = f.spin !== undefined ? [Math.sin(sp * 1.1) * 6, 2.0 + Math.sin(sp * 0.8) * 1.2, Math.cos(sp * 1.1) * 6] : cam.look;
        // no limb may enter by an edge of the picture (shared rule, see crowd.js)
        if (f.cull) cullCrowd(T, tmp, ring, { eye, look, roll: 0, fovK: f.fovK ?? 1, keepJudge: Boolean(f.keepJudge) }); else for (const m of [...(ring.audienceRoots ?? []), ...(ring.judge?.root ? [ring.judge.root] : [])]) m.visible = true;
        return { eye, look, fovK: f.fovK ?? 1, roll: (cam.roll ?? 0) + (f.spin !== undefined ? Math.sin(sp * 0.9) * 0.5 : Math.sin(ambient * 61) * 0.04 * sh), daze: f.daze ?? 0, blur: f.blur ?? 0, flashes: f.flashes ?? [], glareAt: f.glareAt };
      },
    };
  },
};
void clamp;
