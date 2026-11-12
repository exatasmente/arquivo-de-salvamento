// The ring and the hall: a round low-poly ring in a dark futuristic shed, hard lights from
// above, and an audience of the humanoid creatures. Layout comes from a seed.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { buildCreature } from './models/creatures.js';

export const FIGHT_R = 3.55;   // fighters stay inside this radius
export const ROPE_R = 4.3;     // the ropes
export const CAMERA_R = 3.95;  // the camera never goes past this radius

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// Cheering arms: the creature's own excited pose swings the arms through every angle between a
// diagonal and straight up, and with the crowd this big the diagonal arms cross their neighbours.
// After update() the arms are put nearly vertical (more than 60 degrees above the horizontal) and
// only wave a little, so no arm lies flat and none reaches the next body. Pure function of time.
function cheerArms(J, t) {
  for (const [s, n, ph] of [[1, 'L', 0], [-1, 'R', 1.9]]) {
    const w = Math.sin(t * 4.4 * 2 + ph);
    J['shoulder' + n].rotation.set(-0.1, 0, s * (3.0 + 0.08 * w));
    J['elbow' + n].rotation.set(-(0.18 + 0.12 * (0.5 + 0.5 * w)), 0, 0);
    J['wrist' + n].rotation.set(0, 0, 0);
  }
}

export function createRing(r, seed = 1) {
  const rand = mulberry32(seed * 7919 + 13);
  const group = new THREE.Group();
  r.scene.add(group);
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };

  const LIGHT = { ambient: 0x626b88, key: 0x2c2a27, keyDir: [-0.15, -1, -0.1], fog: 0x0b0d14, fogNear: 14, fogFar: 40 };
  const POINTS = [];
  r.light(LIGHT);

  // platform: textured polar grid (many vertices so vertex light varies across the floor)
  const floorGeo = new THREE.RingGeometry(0.001, 4.75, 28, 9); floorGeo.rotateX(-Math.PI / 2);
  scaleUV(floorGeo, 0.5, 0.5);
  const floor = add(floorGeo, r.mat('#b8c0d4', { map: 'floor', repeat: 1 }), 0, 0.001, 0);
  floor.name = 'floor';
  add(new THREE.CylinderGeometry(4.75, 4.9, 0.6, 28, 1, true), r.mat('#4a505e', { map: 'metal', repeat: 6 }), 0, -0.3, 0);
  add(new THREE.CylinderGeometry(7, 7, 0.1, 28), r.mat('#2a2e3a', { map: 'metal' }), 0, -0.65, 0);
  for (const [a, b, col] of [[1.1, 1.22, '#c9a24a'], [3.25, 3.4, '#c9a24a']]) {
    const g = new THREE.RingGeometry(a, b, 28, 1); g.rotateX(-Math.PI / 2);
    add(g, r.mat(col, { emissive: 0.35, fogged: 0.8 }), 0, 0.012, 0);
  }

  // posts and ropes
  const POSTS = 10, ropeH = [0.55, 0.95, 1.35];
  const postMat = r.mat('#7b8496', { map: 'metal', repeat: 1 });
  const ropeMat = r.mat('#3ab4c8', { emissive: 0.5, fogged: 0.8 });
  const postPos = [];
  for (let i = 0; i < POSTS; i++) {
    const a = (i / POSTS) * Math.PI * 2;
    const x = Math.sin(a) * ROPE_R, z = Math.cos(a) * ROPE_R;
    postPos.push([x, z]);
    add(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6), postMat, x, 0.8, z);
    add(new THREE.SphereGeometry(0.11, 6, 4), r.glow('#ffb347'), x, 1.65, z);
  }
  for (let i = 0; i < POSTS; i++) {
    const [x0, z0] = postPos[i], [x1, z1] = postPos[(i + 1) % POSTS];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    for (const h of ropeH) {
      const m = add(new THREE.CylinderGeometry(0.035, 0.035, len, 5), ropeMat, (x0 + x1) / 2, h, (z0 + z1) / 2);
      m.rotation.set(Math.PI / 2, 0, 0); m.rotation.order = 'YXZ'; m.rotation.y = ang;
    }
  }

  // hall: walls, ceiling, beams, lamps with light shafts
  add(scaleUV(new THREE.CylinderGeometry(19, 19, 13, 28, 3, true), 12, 3), r.mat('#9aa2b6', { map: 'wall' }), 0, 5.8, 0).material.side = THREE.BackSide;
  const ceilGeo = new THREE.CircleGeometry(19, 24); ceilGeo.rotateX(Math.PI / 2);
  add(ceilGeo, r.mat('#2a2e3a', { map: 'metal', repeat: 3 }), 0, 11.3, 0);
  const beamMat = r.mat('#3c4252', { map: 'metal' });
  for (let i = -2; i <= 2; i++) {
    add(new THREE.BoxGeometry(38, 0.4, 0.4), beamMat, 0, 10.9, i * 4);
    add(new THREE.BoxGeometry(0.4, 0.4, 38), beamMat, i * 4, 10.7, 0);
  }
  const lampPos = [[-2.6, 8.6, -2.6], [2.6, 8.6, -2.6], [-2.6, 8.6, 2.6], [2.6, 8.6, 2.6]];
  const shaftMat = r.mat('#ffe2a8', { emissive: 1, opacity: 0.06, transparent: true, depthWrite: false, fogged: 0 });
  lampPos.forEach(([x, y, z], i) => {
    add(new THREE.CylinderGeometry(0.5, 0.8, 0.5, 8), r.mat('#20242e', { map: 'metal' }), x, y + 0.35, z);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 8), r.glow('#fff1cc'), x, y + 0.08, z);
    const shaft = add(new THREE.CylinderGeometry(0.55, 2.3, y, 8, 1, true), shaftMat, x, y / 2, z);
    shaft.renderOrder = 3;
    POINTS[i] = i < 2 ? { pos: [x * 0.8, 5.2, z * 0.8], color: new THREE.Color(0xffe9bd).multiplyScalar(0.42), range: 13 } : { pos: [x * 2.6, 7.5, z * 2.6], color: new THREE.Color(0xffc98a).multiplyScalar(0.9), range: 18 };
    r.point(i, POINTS[i]);
  });

  // stands
  const seatMat = r.mat('#c8c8e0', { map: 'seat', repeat: 8, emissive: 0.8 });
  const tiers = [{ r0: 7.4, h: 0.9, w: 2.6 }, { r0: 10.0, h: 2.3, w: 2.6 }, { r0: 12.6, h: 3.7, w: 2.6 }];
  for (const t of tiers) {
    const riser = new THREE.CylinderGeometry(t.r0, t.r0, t.h + 0.7, 28, 1, true);
    add(riser, r.mat('#8890aa', { map: 'metal', repeat: 1, emissive: 0.65 }), 0, (t.h - 0.7) / 2, 0).material.side = THREE.BackSide;
    const top = new THREE.RingGeometry(t.r0, t.r0 + t.w, 28, 1); top.rotateX(-Math.PI / 2);
    add(scaleUV(top, 0.5, 0.5), seatMat, 0, t.h, 0);
    const lip = new THREE.RingGeometry(t.r0, t.r0 + 0.3, 28, 1); lip.rotateX(-Math.PI / 2); // a pale lip on the edge of each tier so the stands read
    add(lip, r.mat('#f0e2b0', { emissive: 1, fogged: 0.3 }), 0, t.h + 0.02, 0);
  }

  // audience
  const slots = [];
  for (let ti = 0; ti < tiers.length; ti++) {
    const n = 12 + ti * 3;
    for (let k = 0; k < n; k++) {
      if (rand() < 0.22) continue;
      const a = ((k + rand() * 0.6) / n) * Math.PI * 2;
      const rad = tiers[ti].r0 + 1.2 + rand() * 0.5;
      slots.push({ x: Math.sin(a) * rad, z: Math.cos(a) * rad, y: tiers[ti].h, yaw: Math.atan2(-Math.sin(a), -Math.cos(a)) + (rand() - 0.5) * 0.4, sc: 2.0 + rand() * 0.9, ph: rand() * 6.28, sp: 1.2 + rand() * 1.5 });
    }
  }
  // the humanoid creatures (models/creatures.js) in a spread of the places: about twenty, so the
  // pit stays light on a phone. Default stances, scale 1 = the size of an evolved one.
  const pedMat = r.mat('#b4bad0', { map: 'metal', repeat: 1, emissive: 0.75 });
  const KINDS = ['casca', 'fole', 'vigia', 'casca', 'fole', 'vigia', 'mestre'];
  // creatures are huge next to the ring, so a slot is taken only when it is far enough (in angle) from the ones already taken on its own row:
  // no creature stands behind another one's shoulder, and no arm reaches a neighbour
  const angOf = (q) => Math.atan2(q.x, q.z), angGap = (a, b) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
  const chosen = [];
  for (let i = 0; i < slots.length && chosen.length < 28; i++) if (chosen.every((j) => slots[j].y !== slots[i].y || angGap(angOf(slots[i]), angOf(slots[j])) > 0.3)) chosen.push(i);
  const audience = [];
  for (const i of chosen) {
    const q = slots[i], kind = KINDS[(audience.length + Math.floor(rand() * 2)) % KINDS.length];
    const an = buildCreature(r, kind, { seed: seed * 101 + i + audience.length * 17, scale: 1.0 + rand() * 0.22 });
    an.root.position.set(q.x, q.y, q.z); an.root.rotation.y = q.yaw;
    group.add(an.root); audience.push({ an, q, kind });
    // a pale step under the feet, so every creature visibly stands on something
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 8), pedMat); ped.position.set(q.x, q.y - 0.06, q.z); group.add(ped);
  }
  let update = function (t, excite = 0) {
    // below ~0.75 the arm mix of a creature is a horizontal "assembly" pose: split the crowd into the ones that
    // cheer (full excite) and the ones that stand idle, so every figure keeps a natural pose
    for (const { an, q } of audience) {
      const ex = excite >= 0.75 || excite <= 0 ? excite : ((q.ph / 6.28) < excite ? 1 : 0);
      an.update(t + q.ph, ex);
      if (ex >= 0.5) cheerArms(an.joints, t + q.ph);
    }
    // one failing lamp: a pure function of time
    const fl = Math.sin(t * 37) * Math.sin(t * 11.3) > 0.82 ? 0.45 : 1;
    r.point(3, { color: new THREE.Color(0xffc98a).multiplyScalar(fl * 0.9) });
  };
  // the judge (a evolved creature, standing outside the ropes), the post with yellow tape and the stone at its foot
  const jang = 0.45, judge = buildCreature(r, 'apito', { seed: seed * 7 + 3, scale: 1.0 });
  let judgeRaised = false;
  judge.root.position.set(Math.sin(jang) * 4.55, 0, Math.cos(jang) * 4.55); judge.root.rotation.y = Math.atan2(-Math.sin(jang), -Math.cos(jang));
  group.add(judge.root);
  const TAPE = 2, ta = (TAPE / POSTS) * Math.PI * 2;
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.8, 6), r.mat('#ffd23a', { emissive: 1, fogged: 0.4 }));
  tape.position.set(Math.sin(ta) * ROPE_R, 0.55, Math.cos(ta) * ROPE_R); group.add(tape);
  const stoneGeo = new THREE.IcosahedronGeometry(0.15, 0); stoneGeo.scale(1.25, 0.85, 1.05);
  const stoneMesh = new THREE.Mesh(stoneGeo, r.mat('#c8c4b8', { emissive: 0.2 })); stoneMesh.position.set(Math.sin(ta) * 3.95, 0.09, Math.cos(ta) * 3.95); group.add(stoneMesh);
  const stone = { x: Math.sin(ta) * 3.95, z: Math.cos(ta) * 3.95, mesh: stoneMesh };
  const _upd = update;
  update = (t, excite = 0) => {
    _upd(t, excite); judge.update(t, 0);
    if (judgeRaised) { // the judge lifts the whistle to his mouth (applied after update, which writes every joint)
      const J = judge.joints; J.shoulderR.rotation.x = -2.5; J.shoulderR.rotation.z = -0.25; J.elbowR.rotation.x = -1.7; J.head.rotation.x = 0.12;
    }
  };
  update(0);
  const audienceSlots = audience.map(({ q, kind }) => ({ x: q.x, y: q.y, z: q.z, yaw: q.yaw, species: kind }));

  // excited: the crowd stands up and bounces more when the fight heats up (read by update)
  let excited = false;
  /** The fog and the lights are global in the renderer: call this when the ring comes back on screen. */
  const applyLights = () => { r.light(LIGHT); POINTS.forEach((p, i) => r.point(i, p)); };
  return { group, applyLights, stone, judge, setJudgeRaised(on) { judgeRaised = Boolean(on); }, update: (t, excite = 0) => update(t, excited ? Math.max(excite, 0.85) : excite), setExcited(on) { excited = Boolean(on); }, get excited() { return excited; }, count: audience.length, audienceRoots: audience.map(({ an }) => an.root), audienceSlots, triangles: audience.reduce((n, x) => n + (x.an.tris || 0), 0) };
}
