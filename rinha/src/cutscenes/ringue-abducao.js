// Film-only reel "ringue-abducao": the cubes in the ring hall. A creature opens a cube and the big fighter comes out of it as a beam of
// light that grows from a toy to full size and runs; the fighter knocks you out; a creature raises its cube over you and a column of
// light pulls you up, shrinking, into it. First person, gloves on. Not played by the game (see src/film.js).
// Uses the ring of ring.js (ctx.ring, with its judge). The cell you wake up in afterwards is the reel "cela-volta".
import { buildHuman } from '../models/human.js';
import { buildCreature } from '../models/creatures.js';
import { ringCreatures, cullCrowd } from './crowd.js';
import { buildCube, buildBeam, buildFrostJet, glowBody, pullPath, clampUp, shrinkCamera } from './abducao.js';
import { reel, playerArms, ramp, smooth, lerp } from './common.js';

const S = (name, dur, desc, keys, act) => ({ name, dur, desc, keys, act });
const V = [0, 1.65, 0.0];            // where you stand in the ring
const SPOT = [-0.3, 0, 3.2];         // where the fighter comes out
const JUDGE = [2.1, 0, 3.3];         // the judge, who opens the cube
const FLOOR = [0.3, 0.42, 0.3];      // where you lie after the blow
const TALL = [0.9, 1.7];             // the tall creature that stands over you
const HOV = [FLOOR[0], 4.3, FLOOR[2] + 0.15];
const GUARD = [-0.35, -2.0], PUNCH = [-1.05, -0.05];
const yawTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);

const R = reel([
  S('cuboLutador', 8, 'O juiz abre um cubo e dele sai um feixe de luz: o lutador grande surge pequenino no feixe, cresce até o tamanho real e começa a correr', [{ t: 0, eye: [0.5, 1.65, 0.2], look: [1.9, 1.3, 3.1] }, { t: 8, eye: [0.5, 1.65, 0.2], look: [1.9, 1.3, 3.1] }],
    (l) => ({
      cam: [{ t: 0, p: [1.9, 1.35, 3.1] }, { t: 2.6, p: [1.9, 1.35, 3.1] }, { t: 3.6, p: [0.9, 1.2, 3.2] }, { t: 6.4, p: [-0.3, 1.1, 3.2] }, { t: 7.0, p: [-0.3, 1.5, 3.2] }, { t: 8, p: [-0.3, 1.5, 2.6] }],
      hold: smooth(ramp(l, 0.2, 1.4)), open: smooth(ramp(l, 1.9, 2.9)), jet: smooth(ramp(l, 2.9, 3.4)) * (1 - smooth(ramp(l, 6.0, 6.7))),
      grow: smooth(ramp(l, 3.3, 6.0)), run: smooth(ramp(l, 6.9, 7.3)), l,
    })),
  S('nocaute', 5, 'O lutador grande bate em você: o soco acerta, a visão tomba e escurece', [{ t: 0, eye: V, look: [0, 1.8, 1.6] }, { t: 5, eye: V, look: [0, 1.8, 1.6] }],
    (l) => ({ ko: l })),
  S('abducao', 10, 'Caído no ringue, você vê uma criatura erguer o cubo: ele flutua sobre você e uma coluna de luz pálida o puxa para cima, encolhendo, até dentro do cubo', [{ t: 0, eye: FLOOR, look: [TALL[0], 2.4, TALL[1]] }, { t: 10, eye: FLOOR, look: [TALL[0], 2.4, TALL[1]] }],
    (l) => ({ pull: l })),
]);

export default {
  name: 'ringue-abducao', prefix: 'ringue', filmOnly: true, duration: R.duration, cue: 'ringue', views: R.views,
  anchors: { juiz: 'O juiz, que abre o cubo', cubo: 'O cubo que as criaturas carregam', lutador: 'O lutador grande que sai do cubo' },
  // The crowd and the drone hum under it all; the judge speaks as he lifts the cube (0.6 s); the beam of release (3 s); the first steps of the
  // run (7 s); the blow with its flash (1.4 s of 'nocaute') and the fall (the body lands at 2.4 s; the jet is seen from 3.1 s); then the hush and the beam of the abduction.
  sfx: [
    { t: 0.2, crowd: 0.45 }, { t: R.views.nocaute[0] + 1.0, crowd: 0.85 }, { t: R.views.nocaute[0] + 2.2, crowd: 0.3 }, { t: R.views.abducao[0] + 0.5, crowd: 0.15 }, { t: R.views.abducao[0] + 4.0, crowd: 0 },
    { t: 0, name: 'drone_zumbido', opts: { dur: 8, vol: 0.5 } },
    { t: 0.6, name: 'fala', opts: { who: 'apito', dur: 1.3, mood: 'ordena' } },
    { t: 3.1, name: 'feixe', opts: { mode: 'solta', dur: 3.0 } },
    { t: 7.0, name: 'passo', opts: { vol: 1.6 } }, { t: 7.35, name: 'passo', opts: { vol: 1.6 } }, { t: 7.7, name: 'passo', opts: { vol: 1.6 } },
    { t: R.views.nocaute[0] + 1.35, name: 'soco_testa' }, { t: R.views.nocaute[0] + 1.35, flash: true }, { t: R.views.nocaute[0] + 2.4, name: 'knockdown', opts: { vol: 0.8 } },
    { t: R.views.abducao[0] + 3.7, name: 'feixe', opts: { dur: 6.3 } },
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE, ring = ctx.ring;
    const grp = new T.Group(); r.scene.add(grp);
    const cr = ringCreatures(r, ring, ctx.seed); grp.add(cr.group);
    const big = buildHuman(r, { seed: 99, height: 1.75 * 1.2, build: 'heavy', skin: '#80502f', hair: '#14100c', style: 'bald', beard: 'full', glove: '#8a2b24', trunks: '#4a2a3a', number: 7 });
    grp.add(big.root);
    const tall = buildCreature(r, 'casca', { seed: 11, scale: 1.0 }); const tallH = new T.Group(); tallH.add(tall.root); grp.add(tallH);
    const cube = buildCube(r), beam = buildBeam(r), jet = buildFrostJet(r, '#aef5df'); jet.root.userData.max = 0.3;
    grp.add(cube.root, beam.root, jet.root);
    const { arms, rig } = playerArms(r, { bare: false });
    const jr = ring.judge?.root, jp0 = jr?.position.clone(), jy0 = jr?.rotation.y;
    const stoneMesh = ring.stone?.mesh ?? null; let stoneWas = true;
    const tmp = new T.PerspectiveCamera(), JJ = cr.judge?.joints, BJ = big.joints;
    const wp = new T.Vector3(), q0 = new T.Quaternion(), q1 = new T.Quaternion(), UP = new T.Vector3(0, -1, 0);
    const track = (keys, l) => { let i = 0; while (i < keys.length - 2 && keys[i + 1].t < l) i++; const a = keys[i], b = keys[i + 1], u = smooth((l - a.t) / (b.t - a.t)); return [0, 1, 2].map((c) => lerp(a.p[c], b.p[c], u)); };

    function bigPose(ambient, run, punch = 0) {
      const ph = ambient * 9.5, s = Math.sin(ph), c = Math.cos(ph);
      BJ.hipL.rotation.x = -0.85 * s * run; BJ.hipR.rotation.x = 0.85 * s * run;
      BJ.kneeL.rotation.x = run * (0.25 + 0.9 * Math.max(0, c)); BJ.kneeR.rotation.x = run * (0.25 + 0.9 * Math.max(0, -c));
      BJ.spine.rotation.set(0.3 * run + 0.35 * punch, run ? s * 0.12 : 0, 0);
      for (const [side, sg] of [['L', 1], ['R', -1]]) {
        const sh = BJ['shoulder' + side], el = BJ['elbow' + side];
        if (run > 0.5) { sh.rotation.set(0.9 * s * sg - 0.2, 0, sg * 0.1); el.rotation.x = -1.3; } else { sh.rotation.set(GUARD[0], 0, sg * 0.1); el.rotation.x = GUARD[1]; }
      }
      if (punch > 0) { BJ.shoulderR.rotation.set(lerp(GUARD[0], PUNCH[0], punch), 0.3 * punch, -0.1); BJ.elbowR.rotation.x = lerp(GUARD[1], PUNCH[1], punch); }
    }
    const place = (root, p, yaw, sc = 1) => { root.position.set(p[0], p[1], p[2]); root.rotation.set(0, yaw, 0); root.scale.setScalar(sc); };

    return {
      group: grp, lights: { apply: () => ring.applyLights() }, arms,
      show(on) {
        if (jr) { if (on) jr.position.set(...JUDGE); else jr.position.copy(jp0); jr.rotation.y = jy0; }
        grp.visible = on; ring.group.visible = on; cr.show(on);
        if (stoneMesh) { if (on) { stoneWas = stoneMesh.visible; stoneMesh.visible = false; } else stoneMesh.visible = stoneWas; }
        if (on) ring.applyLights(); else shrinkCamera(r, 1);
      },
      anchors: { juiz: () => [JUDGE[0], 1.6, JUDGE[2]], cubo: () => [JUDGE[0] - 0.4, 1.3, JUDGE[2] - 0.2], lutador: () => [SPOT[0], 1.5, SPOT[2]] },
      pose(t, ambient) {
        const { seg, local, cam } = R.at(t), f = seg.act(local) ?? {};
        ring.update(ambient, 0.7); cr.update(ambient, 0.7);
        if (jr) { jr.position.set(...JUDGE); jr.rotation.y = yawTo(JUDGE, V); }
        big.root.visible = false; tallH.visible = false; cube.root.visible = false; beam.set({ grow: 0 }); jet.set([0, 0, 0], [0, 1, 0], 0);
        for (const m of [big.root]) glowBody(m, 0);
        let eye = cam.eye, look = cam.look, roll = 0, fovK = 1, daze = 0, fade = 0, ice = 0, wash = 0, flashes = [], k = 1, armsOn = true, shake = 0;
        rig.guard(Math.sin(local * 1.5));
        let culled = true;

        if (seg.name === 'cuboLutador') {
          // the judge holds the cube out on his left hand, opens it toward the spot, and the fighter comes out along the beam
          if (JJ) { JJ.shoulderL.rotation.set(-1.15 * f.hold, 0, 0.1); JJ.elbowL.rotation.set(-0.8 * f.hold, 0, 0); }
          cr.judge.root?.updateMatrixWorld?.(true); grp.updateMatrixWorld(true);
          if (JJ) JJ.wristL.getWorldPosition(wp); else wp.set(JUDGE[0] - 0.3, 1.2, JUDGE[2] - 0.4);
          const cp = [wp.x - 0.05, wp.y + 0.33 + Math.sin(ambient * 2) * 0.02, wp.z - 0.05];
          const dir = new T.Vector3(SPOT[0] - cp[0], 0.9 - cp[1], SPOT[2] - cp[2]).normalize();
          q0.identity(); q1.setFromUnitVectors(UP, dir); cube.root.quaternion.copy(q0).slerp(q1, f.open);
          cube.root.visible = true; cube.root.position.set(...cp); cube.set({ open: f.open, glow: 0.3 + 0.7 * f.open }); cube.root.quaternion.copy(q0).slerp(q1, f.open);
          const mouth = [cp[0] + dir.x * 0.2, cp[1] + dir.y * 0.2, cp[2] + dir.z * 0.2];
          jet.set(mouth, [SPOT[0], 0.3, SPOT[2]], f.jet, 0.3);
          // the fighter: a toy in the beam, glowing, growing as it comes down to the floor; then he turns and runs at you
          const g = f.grow, sc = lerp(0.07, 1, g * g * (3 - 2 * g)), run = f.run;
          const pos = [lerp(mouth[0], SPOT[0], g), lerp(mouth[1], 0, g), lerp(mouth[2], SPOT[2], g)];
          const toV = lerp(0, 1, smooth(ramp(f.l, 6.4, 6.9))), yaw = lerp(yawTo(JUDGE, SPOT) + 0.3, yawTo(SPOT, V), toV);
          const rp = run ? 2.6 * Math.max(0, f.l - 6.9) : 0;
          big.root.visible = f.grow > 0.01; place(big.root, [pos[0] + (V[0] - pos[0]) * rp / 3.0, pos[1], pos[2] + (V[2] - pos[2]) * rp / 3.0], yaw, sc);
          bigPose(ambient, run > 0.5 ? 1 : 0); glowBody(big.root, 1 - smooth(ramp(g, 0.6, 1)));
          const p = track(f.cam, f.l); look = p; eye = [0.5, 1.65, 0.2];
        } else if (seg.name === 'nocaute') {
          const l = f.ko, close = smooth(ramp(l, 0, 1.2)), hit = ramp(l, 1.3, 1.5), pu = Math.max(0, Math.min(1, (l - 1.0) / 0.3)) * (l < 1.7 ? 1 : 1 - ramp(l, 1.7, 2.2));
          const fp = [0, 0, lerp(2.7, 1.45, close) + 0.4 * (l > 1.0 ? Math.min(1, (l - 1.0) / 0.35) : 0)];
          big.root.visible = true; place(big.root, fp, yawTo(fp, V)); bigPose(ambient, 0, pu);
          // the blow: the head snaps to the side, the picture tips over and you go down; the light goes out
          const snap = smooth(ramp(l, 1.35, 1.6)), fall = smooth(ramp(l, 1.7, 3.4));
          eye = [lerp(0, -0.35, snap) + lerp(0, -0.5, fall), lerp(1.65, 0.45, fall * fall) - 0.08 * snap, lerp(0, -0.35, snap)];
          look = [lerp(lerp(0, 1.4, snap), 0.5, fall), lerp(lerp(1.8, 1.5, snap), 6, fall), lerp(1.6, 1.0, fall)];
          roll = lerp(0, 0.35, snap) + lerp(0, 0.9, fall); daze = 0.15 + 0.7 * ramp(l, 1.4, 3.5); fade = smooth(ramp(l, 3.6, 4.9));
          shake = l > 1.35 ? 0.9 * Math.exp(-(l - 1.35) * 6) : 0; flashes = [{ t: 1.4, s: 1 }];
          if (l > 1.5) rig.reach('right', [0.3, -0.35, -0.3]), rig.reach('left', [-0.3, -0.35, -0.3]);
          eye = [eye[0] + Math.sin(ambient * 91) * 0.03 * shake, eye[1] + Math.sin(ambient * 77) * 0.025 * shake, eye[2]];
        } else { // abducao
          const l = f.pull;
          const rise = smooth(ramp(l, 0, 1.8)); tallH.visible = true; place(tallH, [TALL[0], 0, TALL[1]], yawTo([TALL[0], 0, TALL[1]], [FLOOR[0], 0, FLOOR[2]]));
          tall.update(ambient, undefined); tall.joints.shoulderR.rotation.set(-2.8 * rise, 0, -0.2 * rise); tall.joints.elbowR.rotation.set(-0.15 * rise, 0, 0);
          tallH.updateMatrixWorld(true); tall.joints.wristR.getWorldPosition(wp);
          const u = smooth(ramp(l, 2.2, 4.0)), hand = [wp.x, wp.y + 0.3, wp.z];
          const cp = [lerp(hand[0], HOV[0], u), lerp(hand[1], HOV[1], u) + 0.9 * Math.sin(Math.PI * u) + Math.sin(ambient * 2) * 0.04 * u, lerp(hand[2], HOV[2], u)];
          cube.root.visible = true; cube.root.position.set(...cp); cube.set({ open: smooth(ramp(l, 3.5, 4.5)), glow: 0.3 + 0.7 * smooth(ramp(l, 0.4, 2)), spin: ambient * 0.7 * u });
          beam.set({ x: HOV[0], z: HOV[2], top: HOV[1] - 0.25, bottom: 0, radius: 0.55, grow: smooth(ramp(l, 4.1, 5.0)), alpha: 1 - 0.6 * smooth(ramp(l, 8.2, 9)), t: ambient });
          const pp = pullPath(l, { e0: FLOOR, hov: HOV, shrink: [4.8, 6.4], rise: [6.4, 9.0], low: 0.06 });
          eye = pp.eye; k = pp.k;
          const head = [TALL[0], 2.4, TALL[1]], lookUp = [eye[0], eye[1] + 5, eye[2] - 0.9];
          const w1 = smooth(ramp(l, 4.2, 4.9)), w2 = smooth(ramp(l, 6.0, 7.0)), mx = (x, y, q) => [lerp(x[0], y[0], q), lerp(x[1], y[1], q), lerp(x[2], y[2], q)];
          look = mx(mx(clampUp(eye, cp), head, w1), lookUp, w2);
          fovK = 1 + 0.3 * smooth(ramp(l, 4.8, 6.4)); roll = 0.5 * smooth(ramp(l, 6.4, 9)); daze = 0.35 * smooth(ramp(l, 6.2, 9)); armsOn = l < 4.8;
          wash = smooth(ramp(l, 8.5, 9.3)); fade = smooth(ramp(l, 9.3, 10)); culled = l < 6;
          rig.reach('right', [0.3, -0.35, -0.3]); rig.reach('left', [-0.3, -0.35, -0.3]);
        }
        shrinkCamera(r, k); arms.root.visible = armsOn;
        if (culled) cullCrowd(T, tmp, ring, { eye, look, roll, fovK, keepJudge: seg.name === 'cuboLutador' });
        else for (const m of [...(ring.audienceRoots ?? []), ...(ring.judge?.root ? [ring.judge.root] : [])]) m.visible = false;
        return { eye, look, roll, fovK, daze, fade, ice, wash, flashes };
      },
    };
  },
};
