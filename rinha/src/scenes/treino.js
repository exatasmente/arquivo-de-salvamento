// The training hall: tatami, two standing dummies with painted zones (forehead, temples, chin),
// a hanging bag, taped marks on the floor for stance, steps and dodge, a bench and a shelf with
// bandages, a save terminal. High ceiling and room to spare for the instructor (a big animal).
//
// buildScene(r, { seed }) -> { group, anchors, facing, views, parts, lights, update(t), size }
//  - anchors: name -> [x, y, z]; `facing[name]` is a yaw (0 = looking toward +z).
//  - parts.bonecoUm / bonecoDois: dummy groups (rotate them on a hit); parts.saco: the bag.
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { kit, tex, rig } from '../textures/paint.js';
import { mulberry32 } from '../rng.js';

export const SIZE = { x0: -8, x1: 8, z0: -7, z1: 7, h: 6.5 };

export function buildScene(r, { seed = 1 } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 431 + 29);
  const group = new T.Group(); group.name = 'treino';
  const k = kit(r, group);
  const { x0, x1, z0, z1, h } = SIZE;

  const woodFloor = k.mat('#c8ac84', 'wood'), panel = k.mat('#6c7c74', 'plaster'), plaster = k.mat('#a0a4ae', 'concrete');
  const dark = k.mat('#3a3e48', 'metal'), steel = k.mat('#8a909c', 'metal');

  k.floor({ x0, x1, z0, z1, y: 0, material: woodFloor, tile: [2.5, 2.5], step: 2 });
  k.floor({ x0, x1, z0, z1, y: h, material: k.mat('#50545e', 'metal'), tile: [3, 3], up: false, step: 3 });
  const walls = [
    { pos: [0, 0, z0], ry: 0, w: x1 - x0 }, { pos: [0, 0, z1], ry: Math.PI, w: x1 - x0 },
    { pos: [x0, 0, 0], ry: Math.PI / 2, w: z1 - z0 }, { pos: [x1, 0, 0], ry: -Math.PI / 2, w: z1 - z0 },
  ];
  const DOOR = { l0: -1.1, l1: 1.1, h: 3.4 }; // south wall, lx = -x
  for (const wl of walls) {
    const holes = wl.pos[2] === z1 && wl.ry === Math.PI ? [{ x0: DOOR.l0, x1: DOOR.l1, y0: 0, y1: 1.3 }] : [];
    k.wall({ ...wl, h: 1.3, material: panel, tile: [1.3, 1.3], step: 2, holes });
    // the door opening goes all the way up (the instructor is taller than the lower panel), and beyond it there is a dark corridor
    const upper = wl.pos[2] === z1 && wl.ry === Math.PI ? [{ x0: DOOR.l0, x1: DOOR.l1, y0: 0, y1: DOOR.h - 1.3 }] : [];
    k.wall({ ...wl, pos: [wl.pos[0], 1.3, wl.pos[2]], h: h - 1.3, material: plaster, tile: [2, 2], step: 2.6, holes: upper });
  }
  // trim rails along the walls
  k.box([x1 - x0, 0.08, 0.06], k.mat('#5a4430', 'wood'), [0, 1.32, z0 + 0.03]); k.box([x1 - x0, 0.08, 0.06], k.mat('#5a4430', 'wood'), [0, 1.32, z1 - 0.03]);
  k.box([0.06, 0.08, z1 - z0], k.mat('#5a4430', 'wood'), [x0 + 0.03, 1.32, 0]); k.box([0.06, 0.08, z1 - z0], k.mat('#5a4430', 'wood'), [x1 - 0.03, 1.32, 0]);

  // the door out (south wall): a heavy metal door with a hazard frame
  const doorLeaf = k.box([2.2, DOOR.h, 0.14], k.mat('#8a909c', 'metal'), [0, DOOR.h / 2, z1 - 0.1], [0, 0, 0], [1.1, 1.1]);
  const corridor = k.mat('#2a2e3a', 'metal');
  k.box([2.4, DOOR.h + 0.2, 0.1], corridor, [0, DOOR.h / 2, z1 + 2.2]);
  for (const sx of [-1, 1]) k.box([0.1, DOOR.h + 0.2, 2.3], corridor, [sx * 1.2, DOOR.h / 2, z1 + 1.05]);
  k.box([2.4, 0.1, 2.3], corridor, [0, DOOR.h + 0.1, z1 + 1.05]);
  k.box([2.4, 0.1, 2.3], k.mat('#3a3e48', 'metal'), [0, 0.05, z1 + 1.05]);
  /** k 0 closed to 1 open: the leaf goes behind the wall and slides aside. */
  const openDoor = (u) => { doorLeaf.position.set(-2.3 * u, DOOR.h / 2, z1 - 0.1 + 0.35 * Math.min(1, u * 3)); };
  const hz = k.mat('#ffffff', 'hazard');
  k.box([0.22, DOOR.h + 0.2, 0.2], hz, [-1.2, (DOOR.h + 0.2) / 2, z1 - 0.1], [0, 0, 0], [0.5, 0.5]); k.box([0.22, DOOR.h + 0.2, 0.2], hz, [1.2, (DOOR.h + 0.2) / 2, z1 - 0.1], [0, 0, 0], [0.5, 0.5]);
  k.box([2.6, 0.22, 0.2], hz, [0, DOOR.h + 0.1, z1 - 0.1], [0, 0, 0], [0.5, 0.5]);
  k.box([0.3, 0.06, 0.05], k.glow('#5ee6d0'), [0.8, 1.2, z1 - 0.2]);

  // ---- tatami with a border, and the taped marks
  const tx = 5.6, tz = 4.3;
  k.box([tx * 2, 0.07, tz * 2], k.mat('#b0c0d8', 'mat'), [0, 0.035, 0], [0, 0, 0], [1.2, 1.2]);
  const edge = k.mat('#4a5468', 'rubber');
  k.box([tx * 2 + 0.3, 0.09, 0.15], edge, [0, 0.045, -tz - 0.07]); k.box([tx * 2 + 0.3, 0.09, 0.15], edge, [0, 0.045, tz + 0.07]);
  k.box([0.15, 0.09, tz * 2], edge, [-tx - 0.07, 0.045, 0]); k.box([0.15, 0.09, tz * 2], edge, [tx + 0.07, 0.045, 0]);
  const tape = k.decal(k.mat('#f0d048', 'tape', { emissive: 0.15 }), -6);
  const tapeR = (cx, cz, w, d, ry = 0) => { const m = k.add(new T.PlaneGeometry(w, d), tape, [cx, 0.085, cz], [-Math.PI / 2, 0, ry]); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, 0, 0); m.rotation.z = ry; return m; };
  // stance: two feet in guard, with a line to the dummy
  tapeR(-0.22, 2.2, 0.2, 0.5, 0.2); tapeR(0.22, 2.0, 0.2, 0.5, -0.15);
  tapeR(0, 0.2, 0.12, 4.0); // a line toward the dummies
  // step marks: a cross of arrows (forward, back, left, right)
  const arrow = (cx, cz, yaw) => {
    const g = new T.Group(); g.position.set(cx, 0.086, cz); g.rotation.y = yaw; group.add(g);
    const shaft = new T.Mesh(new T.PlaneGeometry(0.16, 0.7), tape); shaft.rotation.x = -Math.PI / 2; shaft.position.z = -0.05; g.add(shaft);
    const head = new T.Mesh(new T.CircleGeometry(0.25, 3), tape); head.rotation.x = -Math.PI / 2; head.rotation.z = Math.PI / 2 + 0.0; head.position.z = -0.46; g.add(head);
  };
  for (const [dx, dz, yaw] of [[0, -0.9, 0], [0, 0.9, Math.PI], [-0.9, 0, Math.PI / 2], [0.9, 0, -Math.PI / 2]]) arrow(3.8 + dx, 2.2 + dz, yaw);
  // dodge marks: two rings left and right of the stance
  for (const sx of [-1.6, 1.6]) { const g = new T.RingGeometry(0.3, 0.38, 10); g.rotateX(-Math.PI / 2); k.add(g, tape, [sx, 0.086, 1.1]); }
  // distance marks to the dummy
  for (let i = 0; i < 3; i++) tapeR(-2.0, 0.6 - i * 0.6, 0.7, 0.1);

  // ---- dummies
  const padM = k.mat('#e0c898', 'pad'), headM = k.mat('#f0e0c0', 'dummyHead');
  function dummy(x, z, yaw) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; group.add(g);
    k.cyl(0.4, 0.45, 0.1, 8, dark, [0, 0.1, 0], [0, 0, 0], g);
    k.cyl(0.07, 0.07, 1.0, 5, steel, [0, 0.55, 0], [0, 0, 0], g);
    const body = new T.Group(); body.position.y = 0.0; g.add(body);
    k.cyl(0.23, 0.26, 0.62, 8, padM, [0, 1.12, 0], [0, 0, 0], body, 1.5);
    k.cyl(0.26, 0.26, 0.28, 8, padM, [0, 0.72, 0], [0, 0, 0], body, 1.5);
    k.sphere(0.14, headM, [0, 1.62, 0], [1, 1.15, 1], 8, 5, body);
    k.cyl(0.05, 0.06, 0.1, 5, steel, [0, 1.46, 0], [0, 0, 0], body);
    for (const sx of [-1, 1]) k.cyl(0.07, 0.07, 0.56, 5, padM, [sx * 0.31, 1.02, 0.02], [0, 0, sx * 0.1], body); // arms hang at the sides
    return { g, body };
  }
  const d1 = dummy(-2.0, -2.2, 0), d2 = dummy(-4.6, 1.4, Math.PI / 2);

  // hanging heavy bag and a speed ball
  k.box([0.14, 0.14, 7], dark, [4.8, h - 1.2, -2.5], [0, 0, 0], [1, 1]);
  const bag = new T.Group(); bag.position.set(4.8, h - 1.25, -1.5); group.add(bag);
  k.cyl(0.015, 0.015, 1.6, 3, k.mat('#6a6e78', 'metal'), [0, -0.8, 0], [0, 0, 0], bag);
  k.cyl(0.28, 0.28, 1.25, 8, k.mat('#a05a3c', 'burlap'), [0, -2.4, 0], [0, 0, 0], bag, 1.5);
  k.cyl(0.28, 0.2, 0.1, 8, dark, [0, -3.05, 0], [0, 0, 0], bag);
  const bagBaseY = bag.position.y;

  // ---- walls dressing: night window, wooden pole rack, lockers, clock, shelf with bandages, terminal
  const mir = k.add(new T.PlaneGeometry(5.0, 2.2), k.mat('#ffffff', 'nightsky', { emissive: 1, fogged: 0.5 }), [x0 + 0.04, 2.4, -1], [0, Math.PI / 2, 0]);
  k.box([0.06, 2.3, 5.2], dark, [x0 + 0.03, 2.4, -1]);
  mir.position.x = x0 + 0.075; // window pane in front of its frame (night outside, like everywhere in the game)
  k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 5.4]); k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 5.95]); k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 6.5]);
  k.cyl(1.0, 1.0, 0.08, 10, k.mat('#e0dcd0', 'concrete'), [0, 4.2, z0 + 0.06], [Math.PI / 2, 0, 0]);
  k.box([0.04, 0.4, 0.04], dark, [0, 4.35, z0 + 0.12]); k.box([0.3, 0.04, 0.04], dark, [0.1, 4.2, z0 + 0.12], [0, 0, 0.4]);
  // shelf with bandage rolls (east wall) and a bench
  const shelf = [x1 - 0.3, 1.1, -1.5];
  k.box([0.5, 0.06, 2.0], k.mat('#6a4e34', 'wood'), [shelf[0], 1.1, shelf[2]], [0, 0, 0], [1, 1]);
  k.box([0.5, 0.06, 2.0], k.mat('#6a4e34', 'wood'), [shelf[0], 1.8, shelf[2]], [0, 0, 0], [1, 1]);
  // the three items of the shop, large enough to tell apart by shape: a taser, a pepper spray can, a roll of bandage
  {
    const ig = new T.Group(); ig.position.set(shelf[0] - 0.05, 1.13, shelf[2]); ig.scale.setScalar(1.8); group.add(ig);
    const grey = k.mat('#4a4e5c', 'metal', { emissive: 0.3 }), yel = k.mat('#f0c820', 'metal', { emissive: 0.5 }), red = k.mat('#d0402e', 'metal', { emissive: 0.45 }), white = k.mat('#f6f2e6', 'sheet', { emissive: 0.6 });
    const B = (size, m, pos, rot = [0, 0, 0]) => k.box(size, m, pos, rot, undefined, ig), C = (rt, rb, h, seg, m, pos, rot = [0, 0, 0]) => k.cyl(rt, rb, h, seg, m, pos, rot, ig);
    // taser: a grey body with a yellow stripe, a grip and two prongs with blue tips (z -0.55)
    const blk = k.mat('#15161a', 'metal', { emissive: 0.2 }), yel2 = k.mat('#ffd830', 'metal', { emissive: 0.85 });
    B([0.2, 0.12, 0.44], yel2, [0, 0.06, -0.55]); for (const dz of [-0.13, 0, 0.13]) B([0.205, 0.125, 0.045], blk, [0, 0.06, -0.55 + dz]); B([0.14, 0.2, 0.1], blk, [0.02, 0.1, -0.4], [0, 0, 0.25]);
    for (const dx of [-0.05, 0.05]) { C(0.014, 0.014, 0.18, 5, k.mat('#e8ecf4', 'metal', { emissive: 0.9 }), [dx, 0.07, -0.86], [Math.PI / 2, 0, 0]); k.sphere(0.028, k.glow('#4ab8ff'), [dx, 0.07, -0.97], [1, 1, 1], 5, 4, ig); }
    // spray: a red can with a white label band and a black nozzle (z 0)
    C(0.07, 0.07, 0.36, 8, red, [0, 0.18, 0]); C(0.073, 0.073, 0.1, 8, white, [0, 0.17, 0]); C(0.04, 0.05, 0.05, 6, grey, [0, 0.385, 0]); B([0.05, 0.03, 0.04], grey, [-0.06, 0.4, 0]);
    // bandage: a fat cream roll with a loose end (z 0.55)
    C(0.13, 0.13, 0.2, 10, white, [0, 0.1, 0.55]); C(0.05, 0.05, 0.21, 6, k.mat('#8a7a60', 'cloth'), [0, 0.1, 0.55]); B([0.015, 0.003, 0.2], white, [-0.14, 0.012, 0.55]);
  }
  for (let i = 0; i < 4; i++) k.box([0.3, 0.18, 0.22], k.mat(i % 2 ? '#b0503c' : '#4a6a8a', 'cloth'), [shelf[0] + 0.02, 1.9, shelf[2] - 0.6 + i * 0.4], [0, 0, 0], [0.4, 0.4]);
  k.box([0.4, 1.1, 0.04], k.mat('#4a3a2c', 'wood'), [x1 - 0.06, 0.9, -1.5], [0, 0, 0], [1, 1]).visible = false;
  const bench = [6.7, 0, 2.6];
  k.box([0.5, 0.08, 2.2], k.mat('#7a5a3e', 'wood'), [bench[0], 0.45, bench[2]], [0, 0, 0], [1, 1]);
  for (const dz of [-0.9, 0.9]) k.box([0.5, 0.45, 0.08], dark, [bench[0], 0.22, bench[2] + dz]);
  for (const [dz, c] of [[-0.5, '#b0503c'], [0.2, '#b0503c']]) { k.sphere(0.16, k.mat(c, 'cloth'), [bench[0], 0.62, bench[2] + dz], [1.1, 0.8, 1.3]); }
  // wooden pole rack
  const rackX = 3.0, rackZ = z0 + 0.3;
  k.box([2.2, 0.08, 0.3], k.mat('#5a4430', 'wood'), [rackX, 1.0, rackZ]); k.box([2.2, 0.08, 0.3], k.mat('#5a4430', 'wood'), [rackX, 1.8, rackZ]);
  for (let i = 0; i < 5; i++) k.cyl(0.03, 0.03, 1.9, 5, k.mat('#a07848', 'wood'), [rackX - 0.9 + i * 0.45, 1.0, rackZ + 0.02], [0, 0, 0.08]);
  // save terminal: a console with a lit screen and a memory-card slot
  const term = [-7.5, 0, -4.8];
  k.box([0.7, 1.2, 1.3], k.mat('#5b6374', 'metal'), [term[0], 0.6, term[2]]);
  const scr = k.add(new T.PlaneGeometry(0.9, 0.55), r.mat('#6affc8', { emissive: 1, fogged: 0.5 }), [term[0] + 0.36, 1.2, term[2]], [0, Math.PI / 2, 0]);
  k.box([0.08, 0.04, 0.24], k.glow('#ffd23a'), [term[0] + 0.36, 0.9, term[2]]); // card slot
  void scr;
  // hazard lines around the tatami and ceiling lamps
  for (const lz of [-4, 0, 4]) { k.box([4.5, 0.08, 0.25], k.glow('#f4f8ff', { fogged: 0.25 }), [0, h - 0.4, lz]); }
  for (let z = -6; z <= 6; z += 4) k.box([x1 - x0, 0.3, 0.22], k.mat('#3c404a', 'metal'), [0, h - 0.15, z]);
  for (let x = -6; x <= 6; x += 6) k.box([0.22, 0.3, z1 - z0], k.mat('#3c404a', 'metal'), [x, h - 0.35, 0]);
  // a heavy cargo net of ropes in the corner (cheap: thin boxes)
  for (let i = 0; i < 5; i++) k.box([0.03, 2.0, 0.03], k.mat('#b09870', 'burlap'), [x0 + 0.1, 3.4, -6.2 + i * 0.25], [0, 0, 0]);

  // a dais where the instructor stands
  k.box([3.0, 0.16, 1.8], k.mat('#6a6e7a', 'metal'), [2.2, 0.08, -4.9], [0, 0, 0], [1, 1]);

  // ---- lights (4 points) and fog
  const L = rig(r, {
    ambient: 0x4a5266, key: 0x30323a, fog: 0x10121a, fogNear: 11, fogFar: 32,
    points: [
      { pos: [0, 4.6, 0], hex: 0xe8f0ff, k: 1.3, range: 13 },          // over the tatami
      { pos: [-4.5, 4.2, -3], hex: 0xffd8a0, k: 0.8, range: 11 },     // warm, dummies
      { pos: [4.8, 4.4, 3], hex: 0xf4f4ff, k: 0.8, range: 11 },       // bag and bench
      { pos: [2.2, 3.6, -5.8], hex: 0xffc080, k: 0.7, range: 8 },      // instructor
    ],
  });

  const anchors = {
    jogadorInicio: [0, 1.65, 5.0],
    porta: [0, 1.1, z1 - 0.1],
    instrutor: [2.2, 0.16, -4.9],
    boneco1: [-2.0, 0, -2.2], bonecoUm: [-2.0, 0, -2.2],
    boneco2: [-4.6, 0, 1.4], bonecoDois: [-4.6, 0, 1.4],
    bonecoCabeca: [-2.0, 1.62, -2.2],
    bonecoTronco: [-2.0, 1.1, -2.2],
    saco: [4.8, 1.0, -1.5],
    marcaGuarda: [0, 0, 2.1],
    marcaPassos: [3.8, 0, 2.2],
    marcaEsquivaE: [-1.6, 0, 1.1], marcaEsquivaD: [1.6, 0, 1.1],
    prateleira: [shelf[0], 1.18, shelf[2]],
    bandagem: [shelf[0], 1.2, shelf[2] - 0.7],
    banco: [bench[0], 0.5, bench[2]],
    terminalSalvar: [term[0] + 0.4, 1.0, term[2]],
    espelho: [x0 + 0.08, 2.4, -1],
    tatame: [0, 0.07, 0],
  };
  const facing = { instrutor: Math.PI, bonecoUm: 0, bonecoDois: Math.PI / 2 };
  anchors.instrutor = [2.2, 0.16, -4.9];
  const views = {
    entrada: { eye: [0, 1.65, 5.6], at: [0, 1.7, -4] },
    guarda: { eye: [0, 1.65, 3.0], at: [-1.6, 1.4, -2.2] },
    boneco: { eye: [-1.4, 1.65, -0.2], at: anchors.bonecoCabeca },
    marcas: { eye: [1.8, 1.65, 4.2], at: [3.0, 0, 2.2] },
    prateleira: { eye: [5.6, 1.6, 0.0], at: anchors.bandagem },
    instrutor: { eye: [0, 1.65, 1.0], at: [2.2, 2.0, -4.9] },
    terminal: { eye: [-4.8, 1.55, -3.4], at: anchors.terminalSalvar },
    sala: { eye: [-6.5, 1.65, 5.5], at: [3, 1.5, -4] },
  };
  function update(t) {
    bag.rotation.z = Math.sin(t * 0.9) * 0.025; bag.rotation.x = Math.cos(t * 0.7) * 0.02;
    d1.body.rotation.z = Math.sin(t * 1.3) * 0.01;
    L.level(0, 1 + (Math.sin(t * 29) * Math.sin(t * 3.1) > 0.93 ? -0.2 : 0));
  }
  update(0);
  void rand; void tex; void bagBaseY;
  return { group, anchors, facing, views, parts: { bonecoUm: d1.g, bonecoDois: d2.g, saco: bag, openDoor }, lights: L, update, size: SIZE };
}
