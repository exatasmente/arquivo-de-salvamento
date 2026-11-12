// The shed of the flashes: a tall hall with hard lamps, cages along the walls with silhouettes
// of adult people, a high negotiation table with big stools, crates, chains, a rolling door.
// Everything is sized for animals taller than a human: 8 m ceiling, a wide central aisle.
//
// buildScene(r, { seed }) -> { group, anchors, facing, views, parts, lights, update(t), size }
//  - anchors: name -> [x, y, z]. `lugar*` are spots around the table for the animals;
//    `facing[name]` gives the yaw (radians, 0 = looking toward +z) to face the table.
//  - the people are dark, clothed silhouettes (some with white bandages), never wounded.
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { kit, tex, rig } from '../textures/paint.js';
import { mergeGeos } from '../render.js';
import { mulberry32 } from '../rng.js';
import { buildJaula, buildMesaNegociacao, buildBanqueta, buildLampadaGalpao, buildCaixote, buildBarril, buildCorrente } from '../props.js';

export const SIZE = { x0: -9, x1: 9, z0: -12, z1: 12, h: 8 };

export function buildScene(r, { seed = 1 } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 733 + 17);
  const group = new T.Group(); group.name = 'galpao';
  const k = kit(r, group);
  const { x0, x1, z0, z1, h } = SIZE;

  const conc = k.mat('#9a9a9c', 'concrete'), corr = k.mat('#a8a496', 'corrug'), floorM = k.mat('#8a8a8c', 'concrete');
  const steel = k.mat('#7a808c', 'metal'), dark = k.mat('#3a3e48', 'metal');

  // ---- floor, ceiling, walls (concrete base, corrugated metal above)
  k.floor({ x0, x1, z0, z1, y: 0, material: floorM, tile: [2, 2], step: 2 });
  k.floor({ x0, x1, z0, z1, y: h, material: k.mat('#4a4e58', 'metal'), tile: [3, 3], up: false, step: 4 });
  const walls = [
    { pos: [0, 0, z0], ry: 0, w: x1 - x0 }, { pos: [0, 0, z1], ry: Math.PI, w: x1 - x0 },
    { pos: [x0, 0, 0], ry: Math.PI / 2, w: z1 - z0 }, { pos: [x1, 0, 0], ry: -Math.PI / 2, w: z1 - z0 },
  ];
  for (const wl of walls) {
    k.wall({ ...wl, h: 2.6, material: conc, tile: [2, 2], step: 2 });
    k.wall({ ...wl, pos: [wl.pos[0], 2.6, wl.pos[2]], h: h - 2.6, material: corr, tile: [1.5, 2], step: 2.7 });
  }
  // rolling door on the south wall, high and wide, hazard stripes on its frame
  const door = k.box([5.6, 5.0, 0.1], k.mat('#8a8e98', 'corrug'), [0, 2.5, z1 - 0.07], [0, 0, 0], [1.5, 2]);
  const hz = k.mat('#ffffff', 'hazard');
  k.box([0.4, 5.3, 0.14], hz, [-3.0, 2.65, z1 - 0.09], [0, 0, 0], [0.8, 0.8]); k.box([0.4, 5.3, 0.14], hz, [3.0, 2.65, z1 - 0.09], [0, 0, 0], [0.8, 0.8]);
  k.box([6.4, 0.4, 0.14], hz, [0, 5.3, z1 - 0.09], [0, 0, 0], [0.8, 0.8]);
  // high windows (night outside) on the back wall
  for (let i = -2; i <= 2; i++) k.box([1.4, 0.8, 0.05], k.mat('#ffffff', 'nightskyS', { emissive: 1, fogged: 0.5 }), [i * 3.4, 5.8, z0 + 0.03]);

  // roof trusses, purlins, chains
  const truss = k.mat('#3c404a', 'metal');
  for (let z = -10; z <= 10; z += 4) {
    k.box([x1 - x0, 0.3, 0.22], truss, [0, h - 0.5, z], [0, 0, 0], [1, 1]);
    k.box([x1 - x0, 0.14, 0.14], truss, [0, h - 1.6, z], [0, 0, 0], [1, 1]);
    for (let x = -8; x < 8; x += 2) k.box([0.12, 1.1, 0.1], truss, [x + 0.5, h - 1.05, z], [0, 0, (x % 4 === 0 ? 0.6 : -0.6)], [1, 1]);
  }
  for (let x = -6; x <= 6; x += 6) k.box([0.2, 0.2, z1 - z0], truss, [x, h - 0.75, 0], [0, 0, 0], [1, 1]);
  for (const [cx, cz, len] of [[-5.5, 3, 3.8], [5.5, 5, 4.4], [4, -8, 3.2], [-3, 9.5, 3.4]]) buildCorrente(r, k, h, cx, cz, len);

  // ---- hanging lamps with hard cones of light
  const lamps = [[-5.6, 6.2, 5], [5.6, 6.2, 5], [0, 5.4, -2.2], [-3.5, 6.2, -8.5], [3.5, 6.2, -8.5]];
  for (const [lx, ly, lz] of lamps) buildLampadaGalpao(r, k, h, lx, ly, lz);

  // ---- cages
  const buckets = { c0: [], c1: [], c2: [], c3: [], skin: [], band: [] };
  const clothCols = ['#6a7a9a', '#9a8268', '#6a8274', '#a0a0b0'];
  const BA = new T.Matrix4(), BQ = new T.Quaternion(), BE = new T.Euler(), BV = new T.Vector3(), BS = new T.Vector3();
  const sphGeo = new T.SphereGeometry(1, 5, 3), boxG = new T.BoxGeometry(1, 1, 1);
  function person(x, y, z, yaw, pose, ci, banded) {
    BA.compose(BV.set(x, y, z), BQ.setFromEuler(BE.set(0, yaw, 0)), BS.set(1, 1, 1));
    const base = BA.clone();
    const P = (bucket, geo, [px, py, pz], [rx, ry, rz], sc) => {
      const m = new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(...sc));
      buckets[bucket].push({ geo, matrix: base.clone().multiply(m) });
    };
    const c = 'c' + ci, B = (pos, rot, sc, b = c) => P(b, boxG, pos, rot, sc), Hd = (pos, rad = 0.115) => P('skin', sphGeo, pos, [0, 0, 0], [rad, rad * 1.15, rad]);
    if (pose === 'stand') {
      B([-0.1, 0.43, 0], [0, 0, 0], [0.15, 0.86, 0.17]); B([0.1, 0.43, 0], [0, 0, 0], [0.15, 0.86, 0.17]);
      B([0, 1.18, 0], [0, 0, 0], [0.4, 0.56, 0.23]); Hd([0, 1.64, 0.02]);
      B([-0.23, 1.38, 0.26], [-0.9, 0, 0], [0.1, 0.1, 0.55]); B([0.23, 1.38, 0.26], [-0.9, 0, 0], [0.1, 0.1, 0.55]);
    } else if (pose === 'sit') {
      B([0, 0.6, -0.04], [0.4, 0, 0], [0.4, 0.55, 0.23]); Hd([0, 1.0, 0.16]);
      B([-0.1, 0.4, 0.28], [0.7, 0, 0], [0.15, 0.15, 0.55]); B([0.1, 0.4, 0.28], [0.7, 0, 0], [0.15, 0.15, 0.55]);
      B([-0.1, 0.2, 0.5], [0, 0, 0], [0.13, 0.4, 0.13]); B([0.1, 0.2, 0.5], [0, 0, 0], [0.13, 0.4, 0.13]);
      B([-0.22, 0.62, 0.3], [0.5, 0, 0], [0.09, 0.09, 0.45]); B([0.22, 0.62, 0.3], [0.5, 0, 0], [0.09, 0.09, 0.45]);
    } else if (pose === 'lie') {
      B([0, 0.18, 0], [0, 0.1, 0], [0.62, 0.3, 0.36]); Hd([-0.5, 0.2, 0.02]);
      B([0.55, 0.12, 0.12], [0, 0.5, 0], [0.5, 0.14, 0.16]); B([0.5, 0.12, -0.12], [0, -0.1, 0], [0.5, 0.14, 0.16]);
      B([-0.15, 0.1, 0.25], [0, -0.4, 0], [0.4, 0.09, 0.09]);
    } else { // slump
      B([0, 0.5, -0.08], [-0.12, 0, 0], [0.4, 0.56, 0.23]); Hd([0.04, 0.94, -0.1]);
      B([-0.1, 0.1, 0.4], [0, 0, 0], [0.15, 0.15, 0.75]); B([0.1, 0.1, 0.4], [0, 0.1, 0], [0.15, 0.15, 0.75]);
      B([-0.23, 0.38, -0.04], [0.1, 0, 0], [0.09, 0.5, 0.09]); B([0.23, 0.38, -0.04], [0.1, 0, 0], [0.09, 0.5, 0.09]);
    }
    if (banded) { // a white head wrap: care, not a wound
      const hy = pose === 'stand' ? 1.7 : pose === 'sit' ? 1.05 : pose === 'lie' ? 0.26 : 1.0;
      const hx = pose === 'lie' ? -0.5 : pose === 'slump' ? 0.04 : 0;
      const hzz = pose === 'sit' ? 0.16 : pose === 'stand' ? 0.02 : pose === 'slump' ? -0.1 : 0.02;
      B([hx, hy, hzz], [0, 0, 0], [0.25, 0.05, 0.25], 'band');
    }
  }

  const cages = [];
  function cage(cx, cz, ry, y, w = 2.4, d = 2.2, ch = 2.4, who = 1, poses = []) {
    const { g, front } = buildJaula(r, k, cx, cz, ry, y, w, d, ch);
    for (let i = 0; i < who; i++) {
      const pose = poses[i] ?? ['stand', 'sit', 'slump', 'lie'][(rand() * 4) | 0];
      const px = (i - (who - 1) / 2) * 0.9 + (rand() - 0.5) * 0.3;
      const pz = pose === 'stand' ? d / 2 - 0.35 : pose === 'slump' ? -d / 2 + 0.5 : (rand() - 0.5) * 0.6;
      const lx = px, lz = pz;
      const wx = cx + lx * Math.cos(ry) + lz * Math.sin(ry), wz = cz - lx * Math.sin(ry) + lz * Math.cos(ry);
      person(wx, y + 0.04, wz, ry + (pose === 'stand' ? 0 : (rand() - 0.5) * 1.2) + (pose === 'slump' ? 0 : 0), pose, (rand() * 4) | 0, rand() < 0.35);
    }
    cages.push({ cx, cz, ry, y, w, d, ch, front });
    return g;
  }
  // west wall (facing +x): ground row of four, two stacked on a platform
  const west = [-7.9, -4.6, -1.3, 2.0, 5.3].map((z) => z);
  west.slice(0, 4).forEach((z, i) => cage(x0 + 1.15, z, Math.PI / 2, 0, 2.4, 2.2, 2.4, i === 2 ? 0 : 1 + (i % 2)));
  for (const z of [-7.9, -4.6]) {
    k.box([2.4, 0.12, 2.2], steel, [x0 + 1.15, 2.46, z], [0, 0, 0], [1, 1]);
    cage(x0 + 1.15, z, Math.PI / 2, 2.52, 2.4, 2.2, 2.2, 1, ['sit']);
  }
  // east wall (facing -x)
  [-6.6, -3.3, 0, 3.3].forEach((z, i) => cage(x1 - 1.15, z, -Math.PI / 2, 0, 2.4, 2.2, 2.4, i === 1 ? 2 : 1, i === 1 ? ['stand', 'sit'] : []));
  // back wall (facing +z)
  [-5.4, -1.8, 1.8, 5.4].slice(0, 3).forEach((x, i) => cage(x - 0.0, z0 + 1.15, 0, 0, 2.6, 2.2, 2.4, 1 + (i % 2), i === 1 ? ['slump', 'sit'] : []));
  const people = [];
  const bucketMats = clothCols.map((c) => k.mat(c, 'cloth', { emissive: 0.3 }));
  ['c0', 'c1', 'c2', 'c3'].forEach((b, i) => { if (buckets[b].length) { const m = new T.Mesh(mergeGeos(buckets[b]), bucketMats[i]); group.add(m); people.push(m); } });
  if (buckets.skin.length) group.add(new T.Mesh(mergeGeos(buckets.skin), k.mat('#c8a080', 'skin', { emissive: 0.1 })));
  if (buckets.band.length) group.add(new T.Mesh(mergeGeos(buckets.band), k.mat('#e8e4d8', 'sheet', { emissive: 0.25 })));

  // ---- the negotiation table (high, for animals) and stools
  const tbl = [0, 0, -2.2];
  buildMesaNegociacao(r, k, tbl);
  // big stools around it
  const stools = [[-1.4, -3.9, 0], [1.4, -3.9, 0], [-1.1, -0.5, Math.PI], [1.2, -0.5, Math.PI]];
  for (const [sx, sz] of stools) buildBanqueta(r, k, sx, sz);

  // ---- crates, barrels, a hand cart, hazard strips on the floor
  const crates = [[-6.2, 7.6, 0.2, 1.2], [-6.6, 9.0, 0, 1], [-5.4, 8.4, 0.4, 1.1], [6.5, 8.0, 0.1, 1.4], [6.8, 9.6, -0.2, 1.1], [7.4, -9.2, 0.3, 1.3], [-8.1, 9.8, 0, 0.9]];
  for (const [cx, cz, ry, s] of crates) buildCaixote(r, k, cx, cz, ry, s);
  for (const [bx, bz] of [[-8.0, 6.3], [-7.9, 7.1], [8.2, 6.4]]) buildBarril(r, k, bx, bz);
  const hazMat = k.decal(k.mat('#ffffff', 'hazard', { fogged: 0.9 }));
  for (const sx of [-3.9, 3.9]) { const f = k.rectGeo(0, 0.35, -9, 9, [0.5, 0.5], 3); k.add(f, hazMat, [sx, 0.04, 0], [-Math.PI / 2, 0, 0]); }

  // ---- lights (4 hard points) and fog
  const L = rig(r, {
    ambient: 0x2e323e, key: 0x20222a, fog: 0x090a0e, fogNear: 10, fogFar: 34,
    points: [
      { pos: [0, 4.4, -2.2], hex: 0xfff0d0, k: 1.5, range: 11 },      // over the table
      { pos: [-5.4, 5.6, 5], hex: 0xfff4e0, k: 1.2, range: 12 },      // west cages
      { pos: [5.4, 5.6, 3], hex: 0xfff4e0, k: 1.1, range: 12 },       // east cages
      { pos: [0, 5.5, -9.5], hex: 0xb8c8ff, k: 0.8, range: 12 },      // cold, back
    ],
  });

  const anchors = {
    entrada: [0, 1.65, 10.6],
    portaoEnrolar: [0, 2.5, z1 - 0.1],
    mesa: [tbl[0], 1.25, tbl[2]],
    lampadaMesa: [0, 4.4, -2.2],
    lugarJavali: [-1.4, 0, -3.9], lugarLobo: [1.4, 0, -3.9], lugarUrso: [-1.1, 0, -0.5], lugarRaposa: [1.2, 0, -0.5],
    corredor: [0, 0, 4],
    corredorJaulas: [-4.2, 1.5, 6],
    jaulaPerto: [x0 + 1.9, 1.3, -1.3],
    jaulaAlta: [x0 + 1.4, 3.5, -4.6],
    jaulaFundo: [0, 1.3, z0 + 1.5],
    caixotes: [-6.2, 0, 8.4],
    teto: [0, h, 0],
  };
  const facing = { lugarJavali: 0, lugarLobo: 0, lugarUrso: Math.PI, lugarRaposa: Math.PI };
  const views = {
    entrada: { eye: [0, 1.65, 10.4], at: [0, 1.9, -6] },
    corredorJaulas: { eye: [-3.0, 1.55, 8], at: [-9, 1.3, -2] },
    jaula: { eye: [3.2, 1.5, -3.3], at: [x1 - 1.4, 1.0, -3.3] },
    mesa: { eye: [0, 1.65, 3.0], at: [0, 1.4, -2.2] },
    altoAlto: { eye: [4, 1.65, 6], at: [-6, 5.5, -6] },
    fundo: { eye: [0, 1.65, -6.5], at: [0, 1.6, z0] },
    leste: { eye: [3.5, 1.55, -1.5], at: [x1, 1.2, -3] },
  };
  function update(t) {
    // one lamp hums: a slow pure function of time
    L.level(0, 1 + 0.04 * Math.sin(t * 6.1) + (Math.sin(t * 17) * Math.sin(t * 2.9) > 0.9 ? -0.35 : 0));
  }
  update(0);
  void rand; void tex; void people; void door;
  return { group, anchors, facing, views, parts: { cages }, lights: L, update, size: SIZE };
}
