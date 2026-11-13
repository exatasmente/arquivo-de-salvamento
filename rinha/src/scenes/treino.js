// The training hall: tatami, two standing dummies with painted zones (forehead, temples, chin),
// a hanging bag, taped marks on the floor for stance, steps and dodge, a bench and a shelf with
// bandages, a save terminal. High ceiling and room to spare for the instructor (a big animal).
//
// buildScene(r, { seed }) -> { group, anchors, facing, views, parts, lights, update(t), size }
//  - anchors: name -> [x, y, z]; `facing[name]` is a yaw (0 = looking toward +z).
//  - parts.bonecoUm / bonecoDois: dummy groups (rotate them on a hit); parts.saco: the bag.
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { sceneEntities } from '../scene-entities.js';
import LAYOUT from '../../data/scenes/treino.json' with { type: 'json' };
import { kit, tex, rig } from '../textures/paint.js';
import { mulberry32 } from '../rng.js';
import { buildTatame, buildMarcasFita, buildBoneco, buildSacoDePancada, buildArmarios, buildRelogio, buildPrateleira, buildItensLoja,
  buildPanosPrateleira, buildBancoTreino, buildSuporteVaras, buildTerminalSalvar, buildRedeDeCarga, buildTablado } from '../props.js';

export const SIZE = { x0: -8, x1: 8, z0: -7, z1: 7, h: 6.5 };

export function buildScene(r, { seed = 1, layout = LAYOUT, editor = false } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 431 + 29);
  const group = new T.Group(); group.name = 'treino';
  const k = kit(r, group);
  // The props are the scene's entities (scene-entities.js): built here as before, editable in the scene editor.
  const props = sceneEntities(r, group, k, layout, editor);
  const place = props.place;
  const { x0, x1, z0, z1, h } = SIZE;

  const woodFloor = k.mat('#c8ac84', 'wood'), panel = k.mat('#6c7c74', 'plaster'), plaster = k.mat('#a0a4ae', 'concrete');
  const dark = k.mat('#3a3e48', 'metal');

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
  place('tatame', [0, 0, 0], (kk) => buildTatame(r, kk, tx, tz));
  place('marcas-de-fita', [1, 0, 1], (kk) => buildMarcasFita(r, kk));

  // ---- dummies
  const d1 = place('boneco', [-2.0, 0, -2.2], (kk) => buildBoneco(r, kk, -2.0, -2.2, 0), 'boneco-1'), d2 = place('boneco', [-4.6, 0, 1.4], (kk) => buildBoneco(r, kk, -4.6, 1.4, Math.PI / 2), 'boneco-2');

  // hanging heavy bag and a speed ball
  const bag = place('saco-de-pancada', [4.8, 0, -1.5], (kk) => buildSacoDePancada(r, kk, h));
  const bagBaseY = bag.position.y;

  // ---- walls dressing: night window, wooden pole rack, lockers, clock, shelf with bandages, terminal
  const mir = k.add(new T.PlaneGeometry(5.0, 2.2), k.mat('#ffffff', 'nightsky', { emissive: 1, fogged: 0.5 }), [x0 + 0.04, 2.4, -1], [0, Math.PI / 2, 0]);
  k.box([0.06, 2.3, 5.2], dark, [x0 + 0.03, 2.4, -1]);
  mir.position.x = x0 + 0.075; // window pane in front of its frame (night outside, like everywhere in the game)
  place('armarios', [-7.8, 0, 5.95], (kk) => buildArmarios(r, kk, x0));
  place('relogio', [0, 0, -6.94], (kk) => buildRelogio(r, kk, z0));
  // shelf with bandage rolls (east wall) and a bench
  const shelf = [x1 - 0.3, 1.1, -1.5];
  place('prateleira', [shelf[0], 0, shelf[2]], (kk) => buildPrateleira(r, kk, shelf));
  // the shop's items and the cloth piled on the shelf, in the order the scene always built them
  place('itens-loja', [shelf[0], 0, shelf[2]], (kk) => { buildItensLoja(r, kk, shelf); buildPanosPrateleira(r, kk, shelf); });
  k.box([0.4, 1.1, 0.04], k.mat('#4a3a2c', 'wood'), [x1 - 0.06, 0.9, -1.5], [0, 0, 0], [1, 1]).visible = false;
  const bench = [6.7, 0, 2.6];
  place('banco-treino', bench, (kk) => buildBancoTreino(r, kk, bench));
  // wooden pole rack
  const rackX = 3.0, rackZ = z0 + 0.3;
  place('suporte-varas', [rackX, 0, rackZ], (kk) => buildSuporteVaras(r, kk, rackX, rackZ));
  // save terminal: a console with a lit screen and a memory-card slot
  const term = [-7.5, 0, -4.8];
  const scr = place('terminal-salvar', term, (kk) => buildTerminalSalvar(r, kk, term));
  void scr;
  // hazard lines around the tatami and ceiling lamps
  for (const lz of [-4, 0, 4]) { k.box([4.5, 0.08, 0.25], k.glow('#f4f8ff', { fogged: 0.25 }), [0, h - 0.4, lz]); }
  for (let z = -6; z <= 6; z += 4) k.box([x1 - x0, 0.3, 0.22], k.mat('#3c404a', 'metal'), [0, h - 0.15, z]);
  for (let x = -6; x <= 6; x += 6) k.box([0.22, 0.3, z1 - z0], k.mat('#3c404a', 'metal'), [x, h - 0.35, 0]);
  // a heavy cargo net of ropes in the corner (cheap: thin boxes)
  place('rede-de-carga', [-7.9, 0, -5.6], (kk) => buildRedeDeCarga(r, kk, x0));

  // a dais where the instructor stands
  place('tablado', [2.2, 0, -4.9], (kk) => buildTablado(r, kk));

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
  props.finish(); // props the layout adds (made in the scene editor)
  return { group, anchors, facing, views, parts: { bonecoUm: d1.g, bonecoDois: d2.g, saco: bag, openDoor }, lights: L, update, size: SIZE };
}
