// The orchard at dusk: rows of apple trees, short warm fog, a fence, apples on the branches
// and on the ground, the lit back of the house behind the camera start.
//
// buildScene(r, { seed }) -> { group, anchors, views, parts, lights, update(t), size }
//  - the lane between the two inner rows is clear (about 6 m wide) and the trees thin out at
//    the clearing, so two evolved animals taller than a human fit in front of the camera.
//  - anchors: name -> [x, y, z] (world metres). `javali`, `lobo` are standing spots on the
//    ground, facing +z (toward the player start); `clareira` is the middle of the gap.
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import * as THREE_NS from 'three';
import { kit, tex, rig } from '../textures/paint.js';
import { mergeGeos } from '../render.js';
import { mulberry32 } from '../rng.js';

export const SIZE = { x0: -22, x1: 22, z0: -24, z1: 12 };

const M4 = new THREE_NS.Matrix4(), EU = new THREE_NS.Euler(), QU = new THREE_NS.Quaternion(), V3 = new THREE_NS.Vector3(), S3 = new THREE_NS.Vector3();
function part(geo, [x, y, z], rot = [0, 0, 0], sc = [1, 1, 1]) {
  EU.set(...rot); QU.setFromEuler(EU);
  return { geo, matrix: new THREE_NS.Matrix4().compose(V3.set(x, y, z).clone(), QU.clone(), S3.set(...sc).clone()) };
}

export function buildScene(r, { seed = 1 } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 1301 + 11);
  const group = new T.Group(); group.name = 'pomar';
  const k = kit(r, group);
  const { x0, x1, z0, z1 } = SIZE;

  // ---- sky, sun, clouds, far hills
  const sky = new T.Mesh(new T.SphereGeometry(72, 14, 8), r.mat('#ffffff', { map: tex(r, 'sky'), emissive: 1, fogged: 0, side: T.BackSide }));
  sky.position.y = 0; group.add(sky);
  const sun = k.add(new T.CircleGeometry(5.5, 12), k.glow('#ffe2a0', { fogged: 0 }), [19, 6, -60], [0, 0, 0]);
  sun.lookAt(0, 7, 0);
  const cloudM = k.glow('#e08a82', { fogged: 0 });
  for (let i = 0; i < 7; i++) {
    const a = rand() * 6.28, d = 54;
    const c = k.add(new T.BoxGeometry(18 + rand() * 20, 0.8, 4), cloudM, [Math.sin(a) * d, 20 + rand() * 18, -Math.abs(Math.cos(a)) * d * 0.9]);
    c.lookAt(0, c.position.y, 0);
  }
  const hillM = k.mat('#6a4a72', null, { fogged: 0.55 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
    const s = k.sphere(1, hillM, [Math.sin(a) * 58, 0, Math.cos(a) * 58], [14 + rand() * 10, 4 + rand() * 5, 10], 6, 3);
    void s;
  }

  // ---- ground: grass grid, a dirt lane, trampled spots
  k.floor({ x0, x1, z0, z1, y: 0, material: k.mat('#a8b070', 'grass'), tile: [2, 2], step: 2.5 });
  const laneM = k.mat('#a89078', 'dirt'); // decals over the ground need a real offset: vertex snapping breaks coplanar depth
  laneM.polygonOffset = true; laneM.polygonOffsetFactor = -4; laneM.polygonOffsetUnits = -4;
  k.floor({ x0: -2.0, x1: 2.0, z0: -24, z1: 9.3, y: 0.05, material: laneM, tile: [2, 2], step: 2.5 });

  // ---- the house (back, lit door and window)
  const house = new T.Group(); group.add(house);
  const hz = 9.4;
  k.box([11, 3.2, 5], k.mat('#a89a84', 'plaster'), [0, 1.6, hz + 2.5], [0, 0, 0], [2, 2], house);
  k.box([11.8, 0.16, 5.8], k.mat('#5a4234', 'wood'), [0, 3.28, hz + 2.5], [0, 0, 0], [2, 2], house);
  k.box([11.4, 0.14, 3.4], k.mat('#5a4234', 'wood'), [0, 3.72, hz + 1.6], [0.35, 0, 0], [2, 2], house);
  k.box([11.4, 0.14, 3.4], k.mat('#5a4234', 'wood'), [0, 3.72, hz + 3.4], [-0.35, 0, 0], [2, 2], house);
  const doorGlow = k.mat('#ffb060', null, { emissive: 0.85, fogged: 0.5 });
  k.add(new T.PlaneGeometry(0.95, 2.05), doorGlow, [0, 1.025, hz - 0.015], [0, Math.PI, 0], house);
  k.add(new T.PlaneGeometry(1.2, 0.9), doorGlow, [-2.6, 1.6, hz - 0.015], [0, Math.PI, 0], house);
  k.add(new T.PlaneGeometry(1.2, 0.9), k.mat('#2a2e50', null, { emissive: 0.7, fogged: 0.5 }), [2.6, 1.6, hz - 0.015], [0, Math.PI, 0], house);
  const fr = k.mat('#4a3a2c', 'wood');
  k.box([1.15, 0.1, 0.1], fr, [0, 2.1, hz - 0.04], [0, 0, 0], [1, 1], house);
  k.box([0.1, 2.1, 0.1], fr, [-0.52, 1.05, hz - 0.04], [0, 0, 0], [1, 1], house); k.box([0.1, 2.1, 0.1], fr, [0.52, 1.05, hz - 0.04], [0, 0, 0], [1, 1], house);
  k.box([1.8, 0.1, 0.9], k.mat('#8c8c84', 'concrete'), [0, 0.05, hz - 0.45], [0, 0, 0], [1, 1], house);
  // lit door spill on the ground
  k.add(new T.PlaneGeometry(1.6, 3.0), k.mat('#ffb060', null, { emissive: 1, opacity: 0.22, transparent: true, depthWrite: false, fogged: 0.4 }), [0, 0.08, hz - 1.6], [-Math.PI / 2, 0, 0]).renderOrder = 2;

  // ---- trees (three variants, instanced) and apples
  const exr = mulberry32(seed * 7 + 3);
  function variant(R) {
    const trunk = [part(new T.CylinderGeometry(0.11, 0.2, 1.7, 5), [0, 0.85, 0]),
      part(new T.CylinderGeometry(0.05, 0.09, 1.1, 4), [0.35, 1.9, 0], [0, 0, -0.55]),
      part(new T.CylinderGeometry(0.05, 0.09, 1.1, 4), [-0.3, 1.85, 0.1], [0, 0, 0.6])];
    const blobs = [[0, 2.6, 0, 1.2], [0.85 + R() * 0.2, 2.2, 0.3, 0.95], [-0.9, 2.3, -0.2 + R() * 0.3, 1.0], [0.1, 3.15, -0.4, 0.85], [-0.1, 2.1, 0.8, 0.8]];
    const leaves = blobs.map(([x, y, z, rad]) => part(new T.SphereGeometry(rad, 6, 3), [x, y, z], [R() * 3, R() * 6, 0], [1, 0.8, 1]));
    const apples = [];
    for (const [x, y, z, rad] of blobs) for (let i = 0; i < 2; i++) {
      const a = R() * 6.28, el = -(0.15 + R() * 0.55);
      const c = Math.sqrt(1 - el * el);
      apples.push([x + Math.cos(a) * c * rad * 0.9, y + el * rad * 0.8, z + Math.sin(a) * c * rad * 0.9]);
    }
    // more apples, from a generator of their own so the tree layout above does not change: the trees are loaded
    for (const [x, y, z, rad] of blobs) for (let i = 0; i < 3; i++) {
      const a = exr() * 6.28, el = -0.55 + exr() * 0.8, c = Math.sqrt(1 - el * el);
      apples.push([x + Math.cos(a) * c * rad * 1.02, y + el * rad * 0.85, z + Math.sin(a) * c * rad * 1.02]);
    }
    return { trunk: mergeGeos(trunk), leaves: mergeGeos(leaves), apples };
  }
  const variants = [0, 1, 2].map(() => variant(rand));
  const trees = [];
  const rows = [-16.5, -12.5, -8.5, -4.5, 4.5, 8.5, 12.5, 16.5];
  for (const rx of rows) for (let z = 5; z >= -21; z -= 4) {
    if (Math.abs(rx) < 5 && z < -0.5 && z > -5.5) continue; // the clearing
    trees.push({ x: rx + (rand() - 0.5) * 0.6, z: z + (rand() - 0.5) * 0.8, yaw: rand() * 6.28, sc: 0.9 + rand() * 0.25, v: (rand() * 3) | 0, ph: rand() * 6.28 });
  }
  const barkM = r.mat('#a08870', { map: tex(r, 'bark') }), leafM = r.mat('#b8d890', { map: tex(r, 'leaves'), emissive: 0.12 });
  const appleM = r.mat('#ffffff', { map: tex(r, 'apple'), emissive: 0.25 });
  const appleGeo = new T.SphereGeometry(0.085, 6, 4); // the same low-poly apple as the one in the hand
  const APPLE_K = 2.0; // the apples on the branches are drawn a little larger so they read at a distance
  let leafK = 1;       // size of the canopy of the target tree (a cutscene can thin it)
  const inst = [];
  variants.forEach((v, vi) => {
    const list = trees.filter((t) => t.v === vi);
    const tm = new T.InstancedMesh(v.trunk, barkM, list.length), lm = new T.InstancedMesh(v.leaves, leafM, list.length);
    const am = new T.InstancedMesh(appleGeo, appleM, list.length * v.apples.length);
    tm.frustumCulled = lm.frustumCulled = am.frustumCulled = false; group.add(tm, lm, am);
    inst.push({ v, list, tm, lm, am });
  });
  const dummy = new T.Object3D(), ap = new T.Object3D();
  function placeTrees(t) {
    for (const { v, list, tm, lm, am } of inst) {
      let ai = 0;
      list.forEach((tr, i) => {
        dummy.position.set(tr.x, 0, tr.z);
        dummy.rotation.set(0, tr.yaw, 0);
        dummy.scale.setScalar(tr.sc); dummy.updateMatrix();
        tm.setMatrixAt(i, dummy.matrix);
        dummy.rotation.z = Math.sin(t * 0.7 + tr.ph) * 0.012; dummy.rotation.x = Math.cos(t * 0.55 + tr.ph) * 0.01;
        if (tr === target) dummy.scale.setScalar(tr.sc * leafK);
        dummy.updateMatrix();
        lm.setMatrixAt(i, dummy.matrix);
        for (const [ax, ay, az] of v.apples) {
          ap.position.set(ax, ay, az).applyMatrix4(dummy.matrix); ap.rotation.set(0, 0, 0); ap.scale.setScalar(APPLE_K); ap.updateMatrix();
          am.setMatrixAt(ai++, ap.matrix);
        }
      });
      tm.instanceMatrix.needsUpdate = lm.instanceMatrix.needsUpdate = am.instanceMatrix.needsUpdate = true;
    }
  }
  // soft dark disc under each tree
  const shadowGeo = new T.CircleGeometry(1.7, 7); shadowGeo.rotateX(-Math.PI / 2);
  const shadows = new T.InstancedMesh(shadowGeo, r.mat('#2a2a20', { opacity: 0.38, transparent: true, depthWrite: false, fogged: 1 }), trees.length);
  shadows.frustumCulled = false; shadows.renderOrder = 1; group.add(shadows);
  trees.forEach((t, i) => { dummy.position.set(t.x, 0.07, t.z); dummy.rotation.set(0, t.yaw, 0); dummy.scale.setScalar(t.sc); dummy.updateMatrix(); shadows.setMatrixAt(i, dummy.matrix); });

  // fallen apples (some in the lane, most under the trees) and grass tufts
  const fallen = [];
  for (let i = 0; i < 70; i++) {
    const t = trees[(rand() * trees.length) | 0];
    fallen.push([t.x + (rand() - 0.5) * 2.8, t.z + (rand() - 0.5) * 2.8]);
  }
  for (let i = 0; i < 8; i++) fallen.push([(rand() - 0.5) * 4, 7 - rand() * 24]);
  const fm = new T.InstancedMesh(appleGeo, appleM, fallen.length); fm.frustumCulled = false; group.add(fm);
  fallen.forEach(([x, z], i) => { dummy.position.set(x, 0.09, z); dummy.rotation.set(rand() * 3, rand() * 3, 0); dummy.scale.setScalar(0.95); dummy.updateMatrix(); fm.setMatrixAt(i, dummy.matrix); });
  const tuftGeo = mergeGeos([part(new T.ConeGeometry(0.07, 0.45, 3), [0, 0.22, 0]), part(new T.ConeGeometry(0.06, 0.38, 3), [0.1, 0.19, 0.04], [0, 0, -0.25]), part(new T.ConeGeometry(0.06, 0.34, 3), [-0.09, 0.17, -0.03], [0, 0, 0.3])]);
  const tuftN = 150, tufts = new T.InstancedMesh(tuftGeo, r.mat('#c8d890', { map: tex(r, 'grass') }), tuftN); tufts.frustumCulled = false; group.add(tufts);
  for (let i = 0; i < tuftN; i++) {
    let x = x0 + 2 + rand() * (x1 - x0 - 4), z = z0 + 2 + rand() * (z1 - z0 - 6);
    if (Math.abs(x) < 2.1 && z > -24) x += 4.2 * Math.sign(x || 1);
    dummy.position.set(x, 0, z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.setScalar(0.8 + rand() * 0.8); dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
  }

  // ---- the fence and the ladder with a basket at the target tree
  const postGeo = new T.BoxGeometry(0.14, 1.3, 0.14);
  const posts = [];
  for (let x = x0; x <= x1; x += 2.75) { posts.push([x, z0], [x, z1 - 1.0]); }
  for (let z = z0 + 2.75; z < z1 - 1; z += 2.75) { posts.push([x0, z], [x1, z]); }
  const pm = new T.InstancedMesh(postGeo, k.mat('#b8a088', 'fence'), posts.length); pm.frustumCulled = false; group.add(pm);
  posts.forEach(([x, z], i) => { dummy.position.set(x, 0.65, z); dummy.rotation.set(0, 0, (rand() - 0.5) * 0.06); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
  const rail = k.mat('#a89078', 'fence');
  for (const y of [0.55, 1.0]) {
    k.box([x1 - x0, 0.09, 0.05], rail, [0, y, z0], [0, 0, 0], [2, 0.3]);
    k.box([x1 - x0, 0.09, 0.05], rail, [0, y, z1 - 1.0], [0, 0, 0], [2, 0.3]);
    k.box([0.05, 0.09, z1 - z0 - 1], rail, [x0, y, (z0 + z1 - 1) / 2], [0, 0, 0], [2, 0.3]);
    k.box([0.05, 0.09, z1 - z0 - 1], rail, [x1, y, (z0 + z1 - 1) / 2], [0, 0, 0], [2, 0.3]);
  }
  // the tree beside the clearing: ladder and basket
  const target = trees.filter((t) => t.x < 0 && t.x > -6).sort((a, b) => Math.abs(a.z + 7) - Math.abs(b.z + 7))[0];
  const lad = new T.Group(); lad.position.set(target.x + 1.0, 0, target.z + 0.9); lad.rotation.set(-0.22, 0.5, 0.18); group.add(lad);
  const lw = k.mat('#8a6a46', 'wood');
  k.box([0.06, 3.0, 0.05], lw, [-0.2, 1.5, 0], [0, 0, 0], [1, 1], lad); k.box([0.06, 3.0, 0.05], lw, [0.2, 1.5, 0], [0, 0, 0], [1, 1], lad);
  for (let i = 0; i < 7; i++) k.box([0.4, 0.04, 0.05], lw, [0, 0.4 + i * 0.4, 0], [0, 0, 0], [1, 1], lad);
  const basket = [target.x + 1.4, 0, target.z - 0.4];
  k.cyl(0.3, 0.22, 0.32, 8, k.mat('#a88458', 'burlap'), [basket[0], 0.16, basket[2]]);
  for (let i = 0; i < 6; i++) k.sphere(0.085, appleM, [basket[0] + Math.cos(i * 1.05) * 0.14, 0.36, basket[2] + Math.sin(i * 1.05) * 0.14], [1, 1, 1], 5, 3);

  // ---- lights and fog: warm door spill, a cool fill in the clearing, the dusk glow
  const L = rig(r, {
    ambient: 0x8c7488, key: 0x6a5048, fog: 0xb8706c, fogNear: 7, fogFar: 36,
    points: [
      { pos: [0, 1.9, hz - 1.2], hex: 0xffa850, k: 1.0, range: 7.5 },     // door light
      { pos: [0, 3.2, -3], hex: 0xffcf9a, k: 0.45, range: 9 },           // sun-warm fill on the clearing
      { pos: [-9, 1.5, -6], hex: 0xff9a78, k: 0.4, range: 10 },          // glow in the rows
      { pos: [9, 1.5, 2], hex: 0xb08ad0, k: 0.3, range: 10 },            // cool shade on the other side
    ],
  });

  const tx = target.x, tz = target.z;
  const anchors = {
    jogadorInicio: [0, 1.65, 7.6],
    portaFundos: [0, 1.1, hz - 0.1],
    soleira: [0, 0, hz - 0.5],
    casa: [0, 0, hz + 2.5],
    trilha: [0, 0, 0],
    clareira: [0, 0, -3],
    javali: [-1.7, 0, -3.8],
    lobo: [1.9, 0, -4.0],
    macieiraAlvo: [tx, 0, tz],
    macaGalho: [tx + variants[target.v].apples[2][0] * target.sc, variants[target.v].apples[2][1] * target.sc, tz + variants[target.v].apples[2][2] * target.sc],
    macaChao: [fallen[0][0], 0.1, fallen[0][1]],
    escada: [lad.position.x, 0, lad.position.z],
    cesto: basket,
    cerca: [x0, 0, 0],
    cercaFundo: [0, 0, z0],
    sol: [19, 6, -60],
  };
  const views = {
    saida: { eye: [0, 1.65, hz - 1.1], at: [0, 1.5, -12] },
    alameda: { eye: [0, 1.65, 6.5], at: [0, 2.0, -10] },
    macas: { eye: [-2.4, 1.6, 0], at: anchors.macaGalho },
    chao: { eye: [1.2, 1.4, 4.2], at: [anchors.macaChao[0], 0.1, anchors.macaChao[2]] },
    clareira: { eye: [0, 1.65, 2.5], at: [0, 2.2, -4] },
    cima: { eye: [0, 1.65, 1.0], at: [0, 3.2, -4] },
    cerca: { eye: [-8, 1.65, 6], at: [-18, 1.0, -8] },
    casa: { eye: [0, 1.65, -10], at: [0, 2.0, hz] },
  };

  function update(t) { placeTrees(t); }
  update(0);
  void sky; void sun;
  return { group, anchors, views, parts: { sky, sun, setTargetLeaf(k) { leafK = k; placeTrees(0); } }, lights: L, update, size: SIZE, treeCount: trees.length };
}
