// The cell: a futuristic prison room. Camera-ready for the wake-up, the tally wall (S3), the
// panel with keypad (S1), the grate where the crow lands (S4), the glowing coin and the door.
//
// buildScene(r, { seed, groups }) -> { group, anchors, views, parts, lights, update(t), ... }
//  - groups: the tally counts, left to right (the main builder decides where they come from).
//  - anchors: name -> [x, y, z] in world metres (y up, eye height ~1.65).
//  - views: name -> { eye, at } ready-made first-person views.
//  - parts: meshes the game moves (moeda, porta, compartimento) plus setters:
//      setDoor(0..1), setCompartment(0..1), setPanel(mode, text), setCoin(visible).
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { kit, tex, tallyTexture, toWorld, rig } from '../textures/paint.js';
import { mulberry32 } from '../rng.js';
import { buildCamaCela, buildVasoCela, buildCompartimento, buildPortaCela, buildPainelCela, buildMoeda, buildBancoCela } from '../props.js';

export const SIZE = { x0: -2.6, x1: 2.6, z0: -2.8, z1: 2.8, h: 3.0 };

export function buildScene(r, { seed = 1, groups } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 977 + 3);
  const group = new T.Group(); group.name = 'cela';
  const k = kit(r, group);
  const { x0, x1, z0, z1, h } = SIZE;
  const grp = groups && groups.length ? groups : [5, 5, 5, 5, 5, 5];

  const wallM = k.mat('#c2c8d6', 'scifi'), floorM = k.mat('#aab2c4', 'scififloor');
  const ceilM = k.mat('#6c7384', 'metal'), darkM = k.mat('#4a5060', 'metal');
  const concrete = k.mat('#8890a0', 'concrete');

  // floor and ceiling
  k.floor({ x0, x1, z0, z1, y: 0, material: floorM, tile: [1.5, 1.5] });
  k.floor({ x0, x1, z0, z1, y: h, material: ceilM, tile: [1.5, 1.5], up: false });

  // walls: north (tally), south, west (vent shaft, bed), east (door, panel)
  const north = k.wall({ pos: [0, 0, z0], ry: 0, w: 5.2, h, material: wallM, tile: [1.5, 1.5],
    holes: [{ x0: -0.45, x1: 0.45, y0: 0.18, y1: 0.78 }] });
  k.wall({ pos: [0, 0, z1], ry: Math.PI, w: 5.2, h, material: wallM, tile: [1.5, 1.5] });
  k.wall({ pos: [x0, 0, 0], ry: Math.PI / 2, w: 5.6, h, material: wallM, tile: [1.5, 1.5],
    holes: [{ x0: 0.9, x1: 1.9, y0: 1.55, y1: 2.35 }] });
  const DOOR = { l0: 0.35, l1: 1.65, h: 2.3 };
  k.wall({ pos: [x1, 0, 0], ry: -Math.PI / 2, w: 5.6, h, material: wallM, tile: [1.5, 1.5],
    holes: [{ x0: DOOR.l0, x1: DOOR.l1, y0: 0, y1: DOOR.h }] });

  // skirting and light bands (cheap detail that breaks the big walls)
  const band = k.mat('#7e889c', 'metal');
  k.box([5.2, 0.14, 0.05], band, [0, 0.07, z0 + 0.025]); k.box([5.2, 0.14, 0.05], band, [0, 0.07, z1 - 0.025]);
  k.box([0.05, 0.14, 5.6], band, [x0 + 0.025, 0.07, 0]); k.box([0.05, 0.14, 5.6], band, [x1 - 0.025, 0.07, 0]);
  const cyan = k.glow('#5ee6d0', { fogged: 0.4 });
  k.box([5.2, 0.03, 0.02], cyan, [0, 2.75, z0 + 0.012]); k.box([5.2, 0.03, 0.02], cyan, [0, 2.75, z1 - 0.012]);
  k.box([0.02, 0.03, 5.6], cyan, [x0 + 0.012, 2.75, 0]); k.box([0.02, 0.03, 5.6], cyan, [x1 - 0.012, 2.75, 0]);

  // ceiling lamp strip and vents
  k.box([0.3, 0.06, 2.6], k.glow('#e8f4ff', { fogged: 0.3 }), [0, h - 0.03, 0]);
  k.box([0.5, 0.05, 0.5], darkM, [-1.6, h - 0.025, -1.4]); k.box([0.5, 0.05, 0.5], darkM, [1.6, h - 0.025, 1.5]);

  // ---- north wall: tally decal (S3) and the compartment
  const tallyM = r.mat('#ffffff', { map: tallyTexture(r, grp, seed), emissive: 0.5, fogged: 0.9 });
  const tally = k.add(new T.PlaneGeometry(4.0, 1.57, 1, 1), tallyM, [0, 1.72, z0 + 0.012]);
  const { comp, chips, compPanel } = buildCompartimento(r, k, z0);
  const compartmentX = 0.95;

  // toilet block, north-east corner
  buildVasoCela(r, k, z0);

  // ---- bed (west wall, south end)
  const bedC = [-2.05, 0, 1.6];
  buildCamaCela(r, k, bedC);

  // ---- vent shaft recess with bars (west wall) and the crow's perch behind them (S4)
  // local frame of the west wall: pos [x0,0,0], ry = pi/2, lx = -z
  const west = { pos: [x0, 0, 0], ry: Math.PI / 2 };
  const winL = 1.4, winY0 = 1.55, winY1 = 2.35;
  const recess = k.box([1.0, 0.8, 0.5], k.mat('#c4cee2', 'concrete', { side: T.BackSide, emissive: 0.6 }), [0, 0, 0]);
  recess.position.set(...toWorld(west.pos, west.ry, winL, 1.95, -0.25)); recess.rotation.y = west.ry;
  // the back of the shaft: pale, evenly lit cold concrete (no sky, no horizon), much lighter than the crow so it reads as a silhouette
  const shaftBack = k.mat('#e2e8f4', 'concrete', { emissive: 1 });
  const glowBack = k.add(new T.PlaneGeometry(1.0, 0.8), shaftBack, toWorld(west.pos, west.ry, winL, 1.95, -0.48), [0, west.ry, 0]);
  const ledge = k.box([1.0, 0.06, 0.5], k.mat('#707888', 'concrete'), toWorld(west.pos, west.ry, winL, 1.52, -0.25), [0, west.ry, 0]);
  // the bars: thin boxes, with a wider gap at the perch so none of them crosses the crow
  const barM = k.mat('#c0c6d4', 'metal');
  for (const lx of [0.93, 1.06, 1.19, 1.61, 1.74, 1.87]) k.box([0.035, 0.8, 0.035], barM, toWorld(west.pos, west.ry, lx, 1.95, -0.04), [0, west.ry, 0]);

  k.box([1.12, 0.07, 0.12], darkM, toWorld(west.pos, west.ry, winL, 2.38, -0.04), [0, west.ry, 0]);
  k.box([1.12, 0.07, 0.12], darkM, toWorld(west.pos, west.ry, winL, 1.52, -0.04), [0, west.ry, 0]);

  // ---- door (east wall) with frame, and the corridor beyond
  const doorW = DOOR.l1 - DOOR.l0, doorZ = (DOOR.l0 + DOOR.l1) / 2;
  const doorM = k.mat('#aeb6c8', 'scifi');
  const door = buildPortaCela(r, k, DOOR, x1, doorW, doorZ);

  // corridor (wide and tall for the big animals)
  const cx0 = x1 + 0.2, cx1 = cx0 + 3.9, cz0 = -3.6, cz1 = 5.6, ch = 4.2;
  k.floor({ x0: cx0, x1: cx1, z0: cz0, z1: cz1, y: 0, material: floorM, tile: [1.5, 1.5], step: 1.2 });
  k.floor({ x0: cx0, x1: cx1, z0: cz0, z1: cz1, y: ch, material: ceilM, tile: [1.5, 1.5], up: false, step: 2 });
  k.wall({ pos: [cx0, 0, 1], ry: Math.PI / 2, w: cz1 - cz0, h: ch, material: wallM, tile: [1.5, 1.5], step: 1.2,
    holes: [{ x0: -(doorZ + doorW / 2 - 1), x1: -(doorZ - doorW / 2 - 1), y0: 0, y1: DOOR.h }] });
  k.wall({ pos: [cx1, 0, 1], ry: -Math.PI / 2, w: cz1 - cz0, h: ch, material: k.mat('#9ea6b8', 'scifi'), tile: [1.5, 1.5], step: 1.2 });
  k.wall({ pos: [(cx0 + cx1) / 2, 0, cz0], ry: 0, w: cx1 - cx0, h: ch, material: wallM, tile: [1.5, 1.5], step: 1.2 });
  k.wall({ pos: [(cx0 + cx1) / 2, 0, cz1], ry: Math.PI, w: cx1 - cx0, h: ch, material: wallM, tile: [1.5, 1.5], step: 1.2 });
  for (let i = 0; i < 3; i++) { // other cells' doors, shut
    const z = -2.4 + i * 2.8;
    k.box([0.1, DOOR.h, doorW], doorM, [cx1 - 0.05, DOOR.h / 2, z], [0, 0, 0], [1.5, 1.5]);
    k.box([0.12, 0.05, doorW], k.glow(i === 1 ? '#5ee6d0' : '#ff8a50'), [cx1 - 0.07, 1.9, z]);
  }
  for (let i = 0; i < 3; i++) k.box([0.35, 0.06, 2.4], k.glow('#e8f4ff', { fogged: 0.3 }), [(cx0 + cx1) / 2, ch - 0.03, -2 + i * 3.4]);
  k.box([0.04, 0.05, cz1 - cz0], k.glow('#5ee6d0', { fogged: 0.5 }), [cx0 + 0.02, 1.0, 1]);

  // ---- panel beside the door (S1): body, screen, keypad
  const panelL = -0.55; // along the wall (lx = z), beside the door
  const pz = panelL, px = x1 - 0.09;
  const { scr, screen, pad } = buildPainelCela(r, k, px, pz);

  // ---- the coin (S4): a glowing disc on the floor with a spinning spark
  const coinPos = [0.7, 0.02, -0.9];
  const { coin, spark } = buildMoeda(r, k, coinPos);

  // a bolted stool and a tray with leftovers: small things to make the floor read
  buildBancoCela(r, k);
  void rand; void tex; void concrete; void tally; void ledge; void glowBack; void screen; void pad; void compPanel; void north;

  // ---- lights (4 points) and fog
  const L = rig(r, {
    ambient: 0x4c566e, key: 0x000000, fog: 0x0a0c14, fogNear: 9, fogFar: 24,
    points: [
      { pos: [0, 2.7, -0.2], hex: 0xcfe0ff, k: 1.0, range: 8.5 },    // ceiling strip
      { pos: [2.0, 1.5, -0.55], hex: 0x66ffd8, k: 0.7, range: 3.2 },  // panel glow
      { pos: [0.7, 0.4, -0.9], hex: 0xffd23a, k: 0.0, range: 2.4 },   // coin
      { pos: [-2.0, 1.95, -1.4], hex: 0xc8d4e8, k: 0.5, range: 4.2 }, // neutral cold fill by the vent shaft
    ],
  });

  const W = (lx, ly, lz) => toWorld(west.pos, west.ry, lx, ly, lz);
  const anchors = {
    camaInicio: [-2.05, 0.88, 2.2],
    cama: [-2.05, 0.5, 1.6],
    jogadorDePe: [-1.1, 1.65, 1.2],
    riscos: [0, 1.72, z0 + 0.012],
    compartimento: [0, 0.48, z0 + 0.03],
    painel: [px - 0.05, 1.3, pz],
    painelTela: [px - 0.05, 1.62, pz],
    teclado: [px - 0.05, 1.14, pz],
    moeda: coinPos,
    grade: W(winL, 1.58, -0.3),
    gradeBarras: W(winL, 1.95, -0.04),
    porta: [x1, 1.15, doorZ],
    corredor: [(cx0 + cx1) / 2, 0, 1],
    corredorFundo: [(cx0 + cx1) / 2, 1.65, cz0 + 0.5],
  };
  const views = {
    acordar: { eye: anchors.camaInicio, at: [0, 1.4, z0] },
    riscosPasseio: { eye: [-1.6, 1.55, -0.2], at: [0, 1.7, z0] },
    riscos: { eye: [0, 1.6, -0.55], at: [0, 1.7, z0] },
    painel: { eye: [1.25, 1.55, -0.55], at: [x1, 1.35, pz] },
    teclado: { eye: [1.55, 1.4, -0.55], at: [x1, 1.15, pz] },
    moeda: { eye: [0.2, 1.4, -0.1], at: coinPos },
    grade: { eye: [-1.0, 1.65, -0.5], at: anchors.grade },
    porta: { eye: [0.4, 1.65, 0.6], at: anchors.porta },
    cela: { eye: [-2.2, 1.65, 2.5], at: [1.2, 1.2, -1.2] },
    corredor: { eye: [3.4, 1.65, 1.8], at: [5, 1.6, -3] },
  };

  const spin = new T.Matrix4(); void spin;
  function update(t) {
    spark.rotation.y = t * 1.6;
    coin.position.y = coinPos[1] + 0.012 * Math.sin(t * 3);
    const on = coin.visible ? 1 : 0;
    L.level(2, on * (0.7 + 0.3 * Math.sin(t * 4)) * 1.0);
    L.points[2].k = 0.9; L.level(2, on * (0.7 + 0.3 * Math.sin(t * 4)));
    scr.update(t);
  }
  update(0);

  const parts = {
    moeda: coin, porta: door, compartimento: comp, compartimentoFichas: chips, painelTela: screen,
    setDoor(f) { door.position.z = doorZ + f * (doorW + 0.1); },
    setCompartment(f) { comp.position.x = f * compartmentX; chips.visible = f > 0.5; },
    setPanel: scr.set,
    setCoin(v) { coin.visible = !!v; },
  };
  return { group, anchors, views, parts, lights: L, update, size: SIZE };
}
