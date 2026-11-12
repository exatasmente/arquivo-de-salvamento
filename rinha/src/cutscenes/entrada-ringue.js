// Cutscene 6, "entrada-ringue": it plays before the first fight of every campaign.
// Spotlight glare and dizziness. The big fighter runs at you and you run, passing the post with
// the yellow tape (a stone at its foot, 1 s, no emphasis). You trip, he catches you: punches with
// a flash (at most 3 per second). Your hand finds the stone at the foot of the post and throws it
// at the drone-camera that broadcasts the fight. Static, cut. First person, 20.5 s (the last 2 s are plain black).
// The punches of this scene do not count as a fight.
//
// The ring (ring.js) has the post with the yellow tape (post index 2 of 10) and the stone at its
// foot (ring.stone: { x, z, mesh }, radius 3.95). The cutscene is designed with the post at
// (-4.09, -1.33) and turned 180 degrees about the vertical axis to the real post (R below); it hides
// ring.stone.mesh while it plays and animates its own copy of the stone.
import { ROPE_R } from '../ring.js';
import { buildHuman } from '../models/human.js';
import { buildDrone } from './drone.js';
import { ringCreatures, cullCrowd } from './crowd.js';
import { track, every, playerArms, ramp, smooth, lerp, clamp, bob } from './common.js';

const D = 20.5;
const views = {
  holofote: [0, 2.4, 'O clarão de um holofote e a cabeça rodando: o ringue, a plateia gigante, nada firme'],
  lutador: [2.4, 5, 'O lutador grande corre na sua direção do outro lado do ringue'],
  corrida: [5, 7.2, 'Você vira as costas e corre pela borda do ringue, ele logo atrás'],
  passaPoste: [7.2, 8.4, 'Na corrida, o poste de fita amarela passa ao lado, com uma pedra ao pé dele'],
  tropeco: [8.4, 9.2, 'Você tropeça e cai: o chão vem de encontro à visão'],
  socos: [9.2, 11.9, 'Ele te alcança e bate: cada soco com um clarão'],
  pedra: [12.2, 13.2, 'A mão tateia o chão, acha a pedra ao pé do poste de fita amarela e fecha em volta dela'],
  arremesso: [13.2, 14.2, 'Você se ergue e arremessa a pedra no drone-câmera que transmite a rinha'],
  impacto: [14.2, 14.85, 'A pedra acerta e o drone solta faíscas: o chiado ainda é parcial e o drone se vê, a tela não está tomada'],
  chiado: [14.2, 16.2, 'A pedra acerta, o drone solta faíscas e a transmissão chia e falha'],
  preto: [16.2, 18.5, 'O chiado final enche a tela, some aos poucos e cai no preto'],
  apagado: [18.5, 20.5, 'A tela inteiramente preta, sem chiado e sem nada'],
};

// Design space: the yellow-tape post at angle 252 degrees; the real one (index 2, 72 degrees) is its
// point reflection. R maps design coordinates to the ring.
const R = (p) => [-p[0], p[1], -p[2]];
export const YELLOW_POST = (() => { const a = (7 / 10) * Math.PI * 2; return [Math.sin(a) * ROPE_R, Math.cos(a) * ROPE_R]; })();
export const STONE = { pos: [Math.sin((7 / 10) * Math.PI * 2) * 3.95, 0.09, Math.cos((7 / 10) * Math.PI * 2) * 3.95], radius: 0.15 };
const DRONE_AT = [0.6, 3.5, 0.4];

// The runner's path (t 5 to 8.4), as keys of eye positions. It hugs the ropes so that the post with the
// yellow tape and the stone at its foot come close enough to read.
const RUN = track([
  { t: 4.6, eye: [2.2, 1.65, 1.8], look: [0, 0, 0] },
  { t: 5.0, eye: [2.2, 1.65, 1.8], look: [0, 0, 0] },
  { t: 5.8, eye: [0.7, 1.65, 2.85], look: [0, 0, 0] },
  { t: 6.8, eye: [-1.8, 1.65, 2.8], look: [0, 0, 0] },
  { t: 7.2, eye: [-3.0, 1.65, 1.8], look: [0, 0, 0] },
  { t: 7.8, eye: [-3.3, 1.6, 0.95], look: [0, 0, 0] },
  { t: 8.4, eye: [-3.45, 1.55, 0.15], look: [0, 0, 0] },
]);
const STOP = [1.55, -0.55];                      // where the fighter pulls up, close in front of you, before the chase
const FALL = [-3.55, -0.55];                    // where you end up on the floor
const STAND = [-1.25, 0.8];                    // where he stands over you while he punches

// the big fighter: position and what he does, as pure functions of the time
function fighterAt(t) {
  if (t < 2.4) return { p: [-0.3, 0, -3.4], mode: 'idle', yaw: 0 };
  if (t < 5.0) { // he charges: fast at first (so he is big in the frame at once), then he closes the last metres
    const u = ramp(t, 2.4, 4.4), e = 1 - (1 - u) * (1 - u) * (1 - u);
    const x = lerp(-0.3, STOP[0], e), z = lerp(-3.4, STOP[1], e);
    return { p: [x, 0, z], mode: 'run', yaw: Math.atan2(2.2 - x, 1.8 - z) };
  }
  if (t < 9.0) { // chasing, two metres and a bit behind you
    const k = smooth(ramp(t, 5.0, 6.1)), tr = RUN(clamp(t - 1.3, 4.6, 8.4)).eye;
    const x = lerp(STOP[0], tr[0], k), z = lerp(STOP[1], tr[2], k);
    const ex = RUN(clamp(t, 4.6, 8.4)).eye;
    return { p: [x, 0, z], mode: 'run', yaw: Math.atan2(ex[0] - x, ex[2] - z) };
  }
  // standing over you
  const stand = STAND;
  const k = smooth(ramp(t, 9.0, 9.5));
  const start = [-2.1, 0.9];
  const p = [lerp(start[0], stand[0], k), 0, lerp(start[1], stand[1], k)];
  const lunge = PUNCHES.reduce((m, tp) => Math.max(m, punchE(t, tp)), 0) * 1.3, dl = Math.hypot(FALL[0] - p[0], FALL[1] - p[2]) || 1;
  p[0] += ((FALL[0] - p[0]) / dl) * lunge; p[2] += ((FALL[1] - p[2]) / dl) * lunge;
  const side = ramp(t, 11.9, 12.7); // after the last punch he steps aside, out of the way of the throw
  p[0] = lerp(p[0], FALL[0] + 0.3, smooth(side)); p[2] = lerp(p[2], FALL[1] + 2.0, smooth(side));
  return { p, mode: t < 11.9 ? 'punch' : 'loom', yaw: t < 12.3 ? Math.atan2(FALL[0] - p[0], FALL[1] - p[2]) : Math.atan2(-p[0], -p[2]) };
}
// The flash of each punch peaks 0.12 s after its time. In the 'socos' shot (9.2 to 11.9) the peaks fall on the
// instants of the key frames (10.01 and 11.09) and between the others; never more than 3 a second.
const PUNCHES = [9.5, 9.9, 10.5, 10.97, 11.38];
const punchE = (t, tp) => { const u = (t - (tp - 0.22)) / 0.5; return u < 0 || u > 1 ? 0 : u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.55); };
const FLASHES = PUNCHES.map((t) => ({ t, s: 1 }));
const GLARE = [{ t: -0.5, rise: 0.5, fall: 2.2, glare: true, s: 1 }];
const GUARD = [-0.35, -2.0], PUNCH = [-1.05, -0.05];    // shoulder and elbow angles of his guard and of a punch
const THROW = 13.55, HIT = 14.08, T_LEAVE = THROW + 0.12;
// The stone hits the drone on the side that is on the right of the picture, at mid height, coming from the lower right
// of the picture: in the image it is always beside the drone, never in front of it (see `flightFrame`). ELL is the body of
// the drone (rotors included) grown by the radius of the stone.
const ELL = [0.92, 0.52, 0.92], SWING_END = [0.24, -0.1, -0.65], START_STONE = 0.62;
const GRAV = 75;                                              // m/s^2 in scene time: the shot after the impact is slowed 3 to 4 times

// camera keys for the whole scene (look-at is filled in for the run by the path)
const CAM = track([
  { t: 0.0, eye: [0.0, 1.65, 1.6], look: [2.6, 7.6, -2.6] },
  { t: 0.9, eye: [0.0, 1.65, 1.6], look: [1.8, 6.0, -2.8] },
  { t: 1.8, eye: [0.0, 1.65, 1.6], look: [0.6, 2.8, -3.0] },
  { t: 2.4, eye: [0.2, 1.65, 1.7], look: [-0.3, 1.9, -3.2], ease: 'ss' },
  { t: 3.6, eye: [2.2, 1.65, 1.8], look: [0.2, 1.9, -2.4] },
  { t: 5.0, eye: [2.2, 1.65, 1.8], look: [1.7, 1.9, 0.2] },
]);

const trip = track([
  { t: 8.4, eye: [-3.45, 1.65, 0.15], look: [-3.9, 1.2, -1.2] },
  { t: 8.6, eye: [-3.5, 0.9, -0.2], look: [-3.8, 0.1, -1.4], roll: 0.5 },
  // the floor rushes up to the lens (the last picture of the trip), then the head snaps round to the man standing over you
  { t: 8.85, eye: [-3.55, 0.36, -0.45], look: [-3.3, -0.1, -0.05], roll: 0.3, ease: 'ss' },
  { t: 9.199, eye: [-3.55, 0.36, -0.45], look: [-3.3, -0.1, -0.05], roll: 0.3, ease: 'ss' }, // the trip view holds the floor to its last instant
  { t: 9.2, eye: [FALL[0], 0.42, FALL[1]], look: [STAND[0] - 0.1, 1.95, STAND[1] - 0.1], roll: 0.1, ease: 'ss' },
  { t: 11.7, eye: [FALL[0], 0.42, FALL[1]], look: [STAND[0], 2.0, STAND[1]], roll: 0.04 },
  { t: 11.899, eye: [FALL[0], 0.42, FALL[1]], look: [STAND[0], 2.0, STAND[1]], roll: 0.04, ease: 'ss' }, // the punches view holds to its last instant
  { t: 12.2, eye: [FALL[0] - 0.05, 0.38, FALL[1] - 0.2], look: [STONE.pos[0] + 0.02, 0.12, STONE.pos[2] + 0.12], roll: -0.04, ease: 'ss' },
  { t: 12.6, eye: [FALL[0] - 0.05, 0.38, FALL[1] - 0.2], look: [STONE.pos[0], 0.1, STONE.pos[2] + 0.2], roll: 0, ease: 'ss' },
  { t: 13.3, eye: [-3.5, 1.15, -0.6], look: [0.3, 2.9, 0.3], roll: 0.04, ease: 'ss' },
  { t: 14.2, eye: [-3.5, 1.3, -0.6], look: [DRONE_AT[0], DRONE_AT[1] - 0.25, DRONE_AT[2]], roll: 0.0 },
  { t: 15.2, eye: [-3.5, 1.3, -0.6], look: [DRONE_AT[0] + 0.1, DRONE_AT[1] - 0.55, DRONE_AT[2]], roll: 0.02 },
  { t: 18.5, eye: [-3.5, 1.3, -0.6], look: [DRONE_AT[0] + 0.1, DRONE_AT[1] - 0.55, DRONE_AT[2]], roll: 0.03 },
]);

// field of view: a little narrower while the post with the stone goes by (so the stone reads), then the zoom on the drone
function fovK(t) {
  if (t < 13.0) return t < 7.2 ? 1 : 1 - 0.26 * (1 - smooth(ramp(t, 7.7, 8.3)));
  if (t < 14.2) return 1 - (1 - 0.7282) * smooth(ramp(t, 13.0, 14.2)); // closing in on the drone (the value at 14.2 is the one the impact shot starts from)
  return 1 - 0.42 * smooth(ramp(t, 13.9, 14.4));
}

function camAt(t) {
  if (t < 5.0) return CAM(t);
  if (t < 8.4) {
    const e = RUN(t).eye, ahead = RUN(Math.min(8.4, t + 0.45)).eye, fp = fighterAt(t).p;
    // over the shoulder: the camera keeps the big fighter in the middle of the picture while you run away from him
    const back = [fp[0], 1.45, fp[2]];
    // then the turn to the track and to the post with the yellow tape, ready for the next shot (7.2 s)
    const dir = [ahead[0] - e[0], ahead[2] - e[2]], len = Math.hypot(...dir) || 1;
    // aim at the stone and the tape just above it: the stone sits in the gap between the gloves, the post right above it
    const post = [STONE.pos[0] - 0.1, -0.15, STONE.pos[2] - 0.1];
    const fwd = [e[0] + (dir[0] / len) * 3, 1.3, e[2] + (dir[1] / len) * 3];
    // the view of the run ends at 7.2 s looking back at him; the next view (the post) starts there: a cut, no turn across it
    const f1 = fwd, look = t < 7.2 ? back : post;
    return { eye: e, look, roll: Math.sin(t * 9) * 0.03 * ramp(t, 5.4, 6) };
  }
  return trip(t);
}

export default {
  name: 'entrada-ringue', prefix: 'ringue', duration: D, cue: 'ringue', views,
  anchors: { poste: 'O poste de fita amarela', pedra: 'A pedra ao pé do poste de fita amarela', drone: 'O drone-câmera que transmite a rinha', lutador: 'O lutador grande que corre na sua direção' },
  // The bell and the crowd at the start; the big fighter's heavy steps as he charges (2.4 to 4.4 s) and the chase
  // (5 to 8.4 s, ~0.35 s a step); the drone hum from the start of the charge; the fall (8.6 to 8.85 s); the five
  // punches with their flashes (PUNCHES); the hand closes on the stone (12.35 s); the throw leaves the hand at T_LEAVE;
  // the stone hits the drone at HIT (a short spark) and the transmission fails (14.2 s), then the last static (16.2 s).
  sfx: [
    { t: 0.1, name: 'sino' }, { t: 0.4, crowd: 0.55 },
    ...every(2.55, 4.4, 0.35, 'passo', { vol: 1.6 }), ...every(5.05, 8.4, 0.35, 'passo'),
    { t: 2.4, name: 'drone_zumbido', opts: { dur: 11.8, vol: 0.8 } },
    { t: 7.2, crowd: 0.8 }, { t: 8.45, name: 'esquiva' }, { t: 8.75, name: 'knockdown', opts: { vol: 0.8 } }, { t: 9.2, crowd: 0.9 },
    ...PUNCHES.flatMap((t, i) => [{ t, name: i === 4 ? 'soco_tempora' : i % 2 ? 'soco_queixo' : 'soco_testa' }, { t, flash: true }]),
    { t: 12.2, crowd: 0.4 }, { t: 12.4, name: 'pedra_pegar' }, { t: 13.2, crowd: 0.6 }, { t: T_LEAVE, name: 'pedra_lancar' }, { t: 13.7, crowd: 0.8 },
    { t: HIT, name: 'taser', opts: { vol: 0.25 } }, { t: 14.2, name: 'drone_chiado' }, { t: 14.3, name: 'taser', opts: { vol: 0.5 } }, { t: 14.5, crowd: 0 },
    { t: 16.2, name: 'drone_chiado', opts: { seed: 7 } },
  ],
  build(ctx) {
    const { r } = ctx;
    const T = r.THREE, ring = ctx.ring;
    const grp = new T.Group(); grp.name = 'entrada-ringue';
    const stone = new T.Mesh(new T.IcosahedronGeometry(STONE.radius, 0), r.mat('#c8c4b8', { emissive: 0.2, fogged: 0.9 }));
    stone.scale.set(1.25, 0.85, 1.05); grp.add(stone);
    const big = buildHuman(r, { seed: 99, height: 1.75 * 1.2, build: 'heavy', skin: '#80502f', hair: '#14100c', style: 'bald', beard: 'full', glove: '#8a2b24', trunks: '#4a2a3a', number: 7 });
    grp.add(big.root);
    const drone = buildDrone(r); grp.add(drone.root);
    const cr = ringCreatures(r, ring, ctx.seed); grp.add(cr.group); // the crowd and the judge are creatures
    // gloves for the fight stance; the bare hand (skin, fingers) from the moment you feel for the stone to the throw
    const { arms: gArms, rig: rigG } = playerArms(r, { bare: false });
    const { arms: bArms, rig: rigB } = playerArms(r, { bare: true });
    const arms = { root: new T.Group() }; arms.root.add(gArms.root, bArms.root);
    r.scene.add(grp);
    const cam = new T.PerspectiveCamera(), cam2 = new T.PerspectiveCamera(), camCull = new T.PerspectiveCamera();
    // the stone in camera space at the instant the hand closes on it (the camera rests there), reachable by the arm
    // where the stone is thrown to: the contact point (a fixed point: the drone is at its hover spot of that instant),
    // and where it leaves the hand (the hand at the end of the swing, with the camera at rest at that instant)
    // The flight is laid out in angles seen from the camera at rest (the camera of the instant of the impact): the stone
    // goes from the hand, at the lower right, to the right side of the drone, and the angle between it and the drone
    // never gets below the sum of their angular radii, so the two never overlap in the picture.
    // Angles are taken in the frame of each instant (the camera eye rises a little during the throw, which matters
    // for something close to the lens), so what holds in the picture holds in every frame.
    const frameAt = (tt) => {
      const c = camAt(tt), E = new T.Vector3(...R(c.eye)), D = new T.Vector3(...drone.hoverAt(tt, R(DRONE_AT)));
      const f = D.clone().sub(E).normalize(), r = new T.Vector3().crossVectors(f, new T.Vector3(0, 1, 0)).normalize(), up = new T.Vector3().crossVectors(r, f).normalize();
      return { E, D, f, r, up, ang(p) { const v = new T.Vector3(...p).sub(E); return [v.length(), Math.atan2(v.dot(r), v.dot(f)), Math.atan2(v.dot(up), v.dot(f))]; } };
    };
    let FR = null;
    const flightFrame = () => {
      if (FR) return FR;
      const F = frameAt(HIT), off = F.r.clone().multiplyScalar(0.9).addScaledVector(F.up, -0.1);
      const n = new T.Vector3(off.x / ELL[0] ** 2, off.y / ELL[1] ** 2, off.z / ELL[2] ** 2).normalize();
      const cam3 = new T.PerspectiveCamera(), c2 = camAt(T_LEAVE), e2 = R(c2.eye), l2 = R(c2.look);
      cam3.position.set(...e2); cam3.up.set(0, 1, 0); cam3.lookAt(...l2); cam3.updateMatrixWorld(true);
      const leaveP = cam3.localToWorld(new T.Vector3(SWING_END[0], SWING_END[1] + 0.045, SWING_END[2] - 0.05)).toArray();
      const tgt = F.D.clone().add(off).toArray();
      return (FR = { off: off.toArray(), norm: n.toArray(), a0: frameAt(T_LEAVE).ang(leaveP), a1: F.ang(tgt) });
    };
    const grabAt = () => {
      const c = camAt(12.4), e = R(c.eye), l = R(c.look);
      cam2.position.set(...e); cam2.up.set(0, 1, 0); cam2.lookAt(...l); cam2.updateMatrixWorld(true);
      const p = cam2.worldToLocal(new T.Vector3(...REAL_STONE)).toArray();
      return [clamp(p[0], -0.2, 0.2), clamp(p[1], -0.4, 0.14), clamp(p[2], -0.7, -0.36)];
    };
    const J = big.joints;
    const h = { stone: ring.stone?.mesh ?? null, stoneWas: true };
    const REAL_STONE = ring.stone ? [ring.stone.x, 0.09, ring.stone.z] : R(STONE.pos);

    function poseBig(t, ambient) {
      const f = fighterAt(t), bobY = f.mode === 'run' ? Math.abs(Math.sin(ambient * 9)) * 0.05 : 0;
      const fp = R(f.p); big.root.position.set(fp[0], bobY, fp[2]); big.root.rotation.set(0, f.yaw + Math.PI, 0);
      const phi = ambient * 9.5, s = Math.sin(phi), c = Math.cos(phi), run = f.mode === 'run' ? 1 : 0;
      J.hipL.rotation.x = -0.85 * s * run; J.hipR.rotation.x = 0.85 * s * run;
      J.kneeL.rotation.x = run * (0.25 + 0.9 * Math.max(0, c)); J.kneeR.rotation.x = run * (0.25 + 0.9 * Math.max(0, -c));
      J.spine.rotation.set(0.3 * run + (f.mode === 'punch' ? 0.45 : f.mode === 'loom' ? 0.2 : 0), run ? s * 0.12 : 0, 0);
      J.hips.position.y = J.hips.position.y; // the pivot stays
      // arms: running swing, guard when he stands, punches
      for (const [side, sg] of [['L', 1], ['R', -1]]) {
        const sh = J['shoulder' + side], el = J['elbow' + side];
        if (run) { sh.rotation.set(-1.0 * s * sg * -1 * 0.9 - 0.2, 0, sg * 0.1); el.rotation.x = -1.3; }
        else { sh.rotation.set(GUARD[0], 0, sg * 0.1); el.rotation.x = GUARD[1]; }
      }
      if (f.mode === 'punch') {
        PUNCHES.forEach((tp, i) => {
          const e = punchE(t, tp); if (!e) return;
          const side = i % 2 ? 'L' : 'R', sg = side === 'L' ? 1 : -1;
          J['shoulder' + side].rotation.set(lerp(GUARD[0], PUNCH[0], e), sg * -0.3 * e, sg * 0.1);
          J['elbow' + side].rotation.x = lerp(GUARD[1], PUNCH[1], e);
        });
      }
      if (f.mode === 'loom') { // heavy breathing over you
        J.spine.rotation.x += Math.sin(ambient * 3) * 0.03;
      }
      J.head.rotation.x = f.mode === 'punch' ? 0.2 : 0;
    }

    return {
      group: grp, lights: { apply: () => ring.applyLights() }, arms,
      show(on) {
        grp.visible = on; ring.group.visible = on; cr.show(on);
        if (h.stone) { if (on) { h.stoneWas = h.stone.visible; h.stone.visible = false; } else h.stone.visible = h.stoneWas; }
        if (on) { ring.applyLights(); }
      },
      anchors: { poste: () => R([YELLOW_POST[0], 1.0, YELLOW_POST[1]]), pedra: () => REAL_STONE, drone: () => R(DRONE_AT), lutador: () => R([fighterAt(0).p[0], 1.8, fighterAt(0).p[2]]) },
      pose(t, ambient) {
        const useBare = false; // the gloves stay on the whole scene (the fight is going on)
        gArms.root.visible = !useBare; bArms.root.visible = useBare;
        const rig = useBare ? rigB : rigG;
        ring.update(ambient, 0.9); cr.update(ambient, 0.9);
        const c = camAt(t);
        let eye = c.eye;
        // camera shake on every punch and on the trip
        let shake = 0;
        for (const tp of PUNCHES) { const u = t - tp; if (u >= 0 && u < 0.5) shake = Math.max(shake, Math.exp(-u * 9)); }
        if (t > 8.55 && t < 9.1) shake = Math.max(shake, 0.8 * (1 - ramp(t, 8.55, 9.1)));
        eye = [eye[0] + Math.sin(t * 91) * 0.03 * shake, eye[1] + Math.sin(t * 77 + 1) * 0.025 * shake, eye[2] + Math.cos(t * 83) * 0.02 * shake];
        const b = t < 2.4 ? [Math.sin(t * 2.5) * 0.02, 0, 0] : [0, 0, 0];
        eye = [eye[0] + b[0], eye[1], eye[2]];
        const rollShake = Math.sin(t * 53) * 0.05 * shake;
        // dizzy sway, strongest at the start and after the punches
        const dz = t < 2.4 ? 0.9 * (1 - ramp(t, 0, 2.4)) + 0.2 : t < 8.4 ? 0.15 : t < 12.2 ? 0.45 : lerp(0.45, 0.2, smooth(ramp(t, 12.2, 13.0)));
        const sway = (t < 5 ? 0.06 : 0.035) * dz;
        const look = [c.look[0] + Math.sin(t * 2.1) * sway * 6, c.look[1] + Math.sin(t * 1.6 + 1) * sway * 3, c.look[2]];
        const roll = (c.roll ?? 0) + rollShake + Math.sin(t * 1.9) * sway;

        eye = R(eye); const lk = R(look); look[0] = lk[0]; look[2] = lk[2];
        poseBig(t, ambient);
        // drone and stone
        { const fr = flightFrame(); drone.pose(t, R(DRONE_AT), { hit: HIT, push: fr.norm.map((x) => -x), contact: fr.off.map((x) => x * 0.68) }); } // the cutscene time, not the ambient one (a shot may add an offset to it)
        cam.position.set(...eye); cam.up.set(0, 1, 0); cam.lookAt(...look); cam.rotateZ(roll); cam.updateMatrixWorld(true);
        const toWorld = (p) => cam.localToWorld(new T.Vector3(...p));
        // hands: gloves up in the stance, the right closes on the stone (12.2 to 12.45), lifts it as you sit up and throws
        const hs = Math.sin(t * 1.6);
        let stonePos = null, stoneVisible = true;
        if (t < 11.9) rig.guard(hs);
        const H0 = grabAt(), HOLD = [0.14, -0.2, -0.5];
        // hand in camera space: reaching for the stone, the fist on it, then back to the side to wind up
        const reachU = smooth(ramp(t, 11.9, 12.35)), liftU = smooth(ramp(t, 12.55, 13.3));
        let hand = HOLD;
        if (t >= 11.9) {
          const g0 = [0.17, -0.13, -0.5];
          hand = t < 12.55 ? [lerp(g0[0], H0[0], reachU), lerp(g0[1], H0[1], reachU), lerp(g0[2], H0[2], reachU)]
            : [lerp(H0[0], HOLD[0], liftU), lerp(H0[1], HOLD[1], liftU), lerp(H0[2], HOLD[2], liftU)];
        }
        if (t >= 11.9) rig.reach('left', [-0.17, -0.13 - hs * 0.01, -0.5]);
        // the right fist with the stone: held at the side, wound back, then swung forward (the stone leaves it)
        const w = smooth(ramp(t, THROW - 0.25, THROW)), s2 = smooth(ramp(t, THROW, THROW + 0.12)), rec = smooth(ramp(t, THROW + 0.2, THROW + 0.45));
        const swing = [lerp(lerp(HOLD[0], 0.2, w), SWING_END[0], s2), lerp(lerp(HOLD[1], -0.12, w), SWING_END[1], s2), lerp(lerp(HOLD[2], -0.52, w), SWING_END[2], s2)];
        if (t >= 12.9 && t < THROW + 0.45) { hand = t < THROW - 0.25 ? hand : swing; if (t >= THROW) hand = [lerp(swing[0], 0.17, rec), lerp(swing[1], -0.13, rec), lerp(swing[2], -0.5, rec)]; }
        if (t < 11.9 || t >= THROW + 0.45) { if (t >= THROW + 0.45) rig.guard(hs); }
        else rig.reach('right', hand);
        if (useBare) { rig.curl('right', 0.15 + 0.85 * smooth(ramp(t, 12.05, 12.45))); rig.curl('left', 0.7); } // the fingers close round the stone
        // the stone: at the foot of the post, then in the hand, then thrown in an arc that ends on the outside of the drone
        // (never inside it), where it bounces off and falls under gravity
        let k = 1 + 0.6 * (1 - ramp(t, 12.0, 12.2)) * (t < 12.2 ? 1 : 0) - 0.38 * smooth(ramp(t, 12.2, 12.5));
        if (t < 12.0) k = 1.6;
        const inFlight = (tt) => { // position of the stone in flight, tt in [T_LEAVE, HIT]: [x, y, z, distance from the camera]
          const fr = flightFrame(), u = (tt - T_LEAVE) / (HIT - T_LEAVE), e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
          const d = lerp(fr.a0[0], fr.a1[0], e), ax = lerp(fr.a0[1], fr.a1[1], e), ay = lerp(fr.a0[2], fr.a1[2], e);
          const F = frameAt(tt), dir = F.f.clone().addScaledVector(F.r, Math.tan(ax)).addScaledVector(F.up, Math.tan(ay)).normalize();
          const p = F.E.clone().addScaledVector(dir, d);
          return [p.x, p.y, p.z, d];
        };
        let dist = 0;
        if (t < 12.35) stonePos = REAL_STONE;
        else if (t < T_LEAVE) stonePos = toWorld([hand[0], hand[1] + 0.045, hand[2] - 0.05]).toArray(); // in the fist, the fingers round it
        else if (t <= HIT) { const q = inFlight(t); stonePos = q.slice(0, 3); dist = q[3]; }
        else { // the bounce: off the surface (the normal) with some of the speed it came with, then gravity
          const fr = flightFrame(), p1 = inFlight(HIT), p0 = inFlight(HIT - 0.02), vin = [0, 1, 2].map((i) => (p1[i] - p0[i]) / 0.02);
          const vout = vin.map((x, i) => 0.4 * x + 3.4 * fr.norm[i]), u = t - HIT;
          stonePos = [p1[0] + vout[0] * u, p1[1] + vout[1] * u - 0.5 * GRAV * u * u, p1[2] + vout[2] * u];
        }
        // the stone grows as it goes away, so its apparent size stays about the same until it reaches 1.8
        k = t < T_LEAVE ? k : Math.min(1.8, START_STONE + 0.45 * (dist || flightFrame().a1[0] - 0.0) - 0.3);
        stoneVisible = t < HIT + 1.2;
        stone.scale.set(1.25 * k, 0.85 * k, 1.05 * k);
        stone.position.set(...stonePos); stone.visible = stoneVisible && !(t >= 12.6 && t < THROW - 0.0 && false);
        stone.rotation.set(t * 8 * (t > THROW ? 1 : 0), t * 5 * (t > THROW ? 1 : 0), 0);
        // the end: static grows after the hit, then black
        const noise = t >= HIT ? clamp((t - HIT) / 1.8) * 0.85 * (1 - smooth(ramp(t, 17.0, 17.6))) : 0;
        const fade = smooth(ramp(t, 16.6, 17.4));
        cullCrowd(T, camCull, ring, { eye, look, roll, fovK: fovK(t) }); // no creature cut by an edge, no limb entering by one
        return {
          eye, look, roll, fade, noise, fovK: fovK(t), flashes: [...FLASHES, ...GLARE], glareAt: [0.62, 0.18],
          daze: t < 5 ? clamp(0.25 + 0.7 * (1 - ramp(t, 0, 3))) : t < 8.4 ? 0.2 : t < 12.2 ? 0.35 + 0.4 * shake : lerp(0.35, 0.15, smooth(ramp(t, 12.2, 13.0))),
          blur: t < 2.4 ? 0.8 * (1 - ramp(t, 0.2, 2.4)) : t >= 9.2 && t < 12 ? 0.25 : 0,
        };
      },
    };
  },
};
