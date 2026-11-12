// The house at night: a poor bedroom and kitchen, an empty fridge, a back door to the orchard.
//
// buildScene(r, { seed }) -> { group, anchors, views, parts, lights, update(t), size }
//  - anchors: name -> [x, y, z] (world metres, eye height ~1.65).
//  - parts: setFridge(0..1) opens the door and turns the fridge light on, setBackDoor(0..1),
//    plus the meshes (geladeiraPorta, portaFundos).
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { kit, tex, toWorld, rig } from '../textures/paint.js';
import { mulberry32 } from '../rng.js';

export const SIZE = { x0: -4, x1: 4, z0: -2.3, z1: 2.3, h: 2.5 };

export function buildScene(r, { seed = 1 } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 521 + 9);
  const group = new T.Group(); group.name = 'casa';
  const k = kit(r, group);
  const { x0, x1, z0, z1, h } = SIZE;

  const plaster = k.mat('#a8a08c', 'plaster'), plasterK = k.mat('#a8b0a0', 'plaster');
  const wood = k.mat('#a88868', 'wood'), tile = k.mat('#a8a090', 'tile'), ceil = k.mat('#6a6458', 'plaster');
  const dark = k.mat('#3a2e26', 'wood'), metal = k.mat('#8c929c', 'metal');
  const night = r.mat('#ffffff', { map: tex(r, 'dusk'), emissive: 1, fogged: 0.4 });
  const nightM = k.mat('#ffffff', 'nightskyS', { emissive: 1, fogged: 0.4 }); // the night outside the windows
  void night;

  // floors and ceiling
  k.floor({ x0, x1: 0, z0, z1, y: 0, material: wood, tile: [1.2, 1.2], step: 1 });
  k.floor({ x0: 0, x1, z0, z1, y: 0, material: tile, tile: [1.2, 1.2], step: 1 });
  k.floor({ x0, x1, z0, z1, y: h, material: ceil, tile: [2, 2], up: false, step: 1.2 });

  // walls
  const DOOR = { l0: 2.55, l1: 3.5, h: 2.05 }; // back door on the north wall (lx = x)
  const north = k.wall({ pos: [0, 0, z0], ry: 0, w: 8, h, material: plaster, tile: [1.6, 1.6],
    holes: [{ x0: -2.9, x1: -1.7, y0: 1.0, y1: 1.95 }, { x0: DOOR.l0, x1: DOOR.l1, y0: 0, y1: DOOR.h }] });
  const south = k.wall({ pos: [0, 0, z1], ry: Math.PI, w: 8, h, material: plaster, tile: [1.6, 1.6],
    holes: [{ x0: -2.6, x1: -1.4, y0: 1.05, y1: 1.9 }] }); // lx = -x: kitchen window at x 1.4..2.6
  const west = k.wall({ pos: [x0, 0, 0], ry: Math.PI / 2, w: 4.6, h, material: plaster, tile: [1.6, 1.6] });
  const east = k.wall({ pos: [x1, 0, 0], ry: -Math.PI / 2, w: 4.6, h, material: plasterK, tile: [1.6, 1.6] });
  // divider at x = 0 with a doorway (z -0.55..0.55)
  k.wall({ pos: [0, 0, 0], ry: Math.PI / 2, w: 4.6, h, material: plaster, tile: [1.6, 1.6], holes: [{ x0: -0.55, x1: 0.55, y0: 0, y1: 2.05 }] });
  k.wall({ pos: [0, 0, 0], ry: -Math.PI / 2, w: 4.6, h, material: plasterK, tile: [1.6, 1.6], holes: [{ x0: -0.55, x1: 0.55, y0: 0, y1: 2.05 }] });
  const jamb = k.mat('#4a3a2c', 'wood');
  k.box([0.14, 2.1, 0.1], jamb, [0, 1.05, -0.6]); k.box([0.14, 2.1, 0.1], jamb, [0, 1.05, 0.6]); k.box([0.14, 0.1, 1.3], jamb, [0, 2.1, 0]);

  // baseboards
  const base = k.mat('#4a3a2c', 'wood');
  k.box([8, 0.12, 0.04], base, [0, 0.06, z0 + 0.02]); k.box([8, 0.12, 0.04], base, [0, 0.06, z1 - 0.02]);
  k.box([0.04, 0.12, 4.6], base, [x0 + 0.02, 0.06, 0]); k.box([0.04, 0.12, 4.6], base, [x1 - 0.02, 0.06, 0]);

  // ---- windows: night behind a frame with a cross
  function windowFrame(grp, lx, ly, w, hh, sky = true) {
    const fr = k.mat('#6a5a46', 'wood');
    k.add(new T.PlaneGeometry(w, hh), nightM, [lx, ly, -0.05], [0, 0, 0], grp);
    k.box([w + 0.12, 0.06, 0.1], fr, [lx, ly + hh / 2 + 0.03, 0.0], [0, 0, 0], [1, 1], grp);
    k.box([w + 0.12, 0.06, 0.1], fr, [lx, ly - hh / 2 - 0.03, 0.0], [0, 0, 0], [1, 1], grp);
    k.box([0.06, hh, 0.1], fr, [lx - w / 2 - 0.03, ly, 0], [0, 0, 0], [1, 1], grp);
    k.box([0.06, hh, 0.1], fr, [lx + w / 2 + 0.03, ly, 0], [0, 0, 0], [1, 1], grp);
    k.box([0.04, hh, 0.06], fr, [lx, ly, -0.02], [0, 0, 0], [1, 1], grp);
    k.box([w, 0.04, 0.06], fr, [lx, ly, -0.02], [0, 0, 0], [1, 1], grp);
    if (sky) k.box([w + 0.2, 0.05, 0.22], fr, [lx, ly - hh / 2 - 0.08, 0.08], [0, 0, 0], [1, 1], grp);
  }
  windowFrame(north, -2.3, 1.475, 1.2, 0.95);
  windowFrame(south, -2.0, 1.475, 1.2, 0.85);
  // moon in the bedroom window
  k.add(new T.CircleGeometry(0.11, 8), k.glow('#e8ecff', { fogged: 0 }), [-2.0, 1.62, -0.045], [0, 0, 0], north);

  // curtain rags
  k.box([0.3, 0.9, 0.04], k.mat('#7a5a58', 'cloth'), [-2.95, 1.45, 0.05], [0, 0, 0.03], [0.6, 0.6], north);

  // ---- back door (north wall): a ledge, the open door leaf and the dusk outside
  const dW = DOOR.l1 - DOOR.l0, dC = (DOOR.l0 + DOOR.l1) / 2;
  k.add(new T.PlaneGeometry(dW, DOOR.h), k.mat('#6a4a62', 'dusk', { emissive: 1, fogged: 0.3 }), [dC, DOOR.h / 2, -0.4], [0, 0, 0], north);
  const doorJ = k.mat('#4a3a2c', 'wood');
  k.box([0.1, DOOR.h, 0.14], doorJ, [DOOR.l0 - 0.05, DOOR.h / 2, 0], [0, 0, 0], [1, 1], north);
  k.box([0.1, DOOR.h, 0.14], doorJ, [DOOR.l1 + 0.05, DOOR.h / 2, 0], [0, 0, 0], [1, 1], north);
  k.box([dW + 0.2, 0.1, 0.14], doorJ, [dC, DOOR.h + 0.05, 0], [0, 0, 0], [1, 1], north);
  k.box([dW + 0.2, 0.06, 0.5], k.mat('#8c8c84', 'concrete'), [dC, 0.03, -0.2], [0, 0, 0], [1, 1], north);
  const leafPivot = new T.Group(); leafPivot.position.set(DOOR.l0, 0, 0.02); north.add(leafPivot);
  k.box([dW, DOOR.h - 0.05, 0.06], k.mat('#8a6a46', 'wood'), [dW / 2, DOOR.h / 2, 0], [0, 0, 0], [1, 1], leafPivot);
  k.box([0.05, 0.05, 0.1], metal, [dW - 0.12, 1.0, 0.0], [0, 0, 0], [1, 1], leafPivot);
  leafPivot.rotation.y = 1.15; // ajar into the room

  // ---- bedroom: bed, nightstand, wardrobe, rug, clothes, frames
  const bed = [-3.3, 0, 1.25];
  k.box([1.0, 0.3, 2.1], dark, [bed[0], 0.15, bed[2]]);
  k.box([0.92, 0.12, 2.0], k.mat('#c0b49a', 'sheet'), [bed[0], 0.36, bed[2]], [0, 0, 0], [0.8, 0.8]);
  k.box([0.6, 0.11, 0.38], k.mat('#d0c8b4', 'sheet'), [bed[0], 0.48, bed[2] + 0.7], [0.04, 0, 0], [0.5, 0.5]);
  k.box([0.88, 0.07, 1.0], k.mat('#6a5a70', 'cloth'), [bed[0] + 0.03, 0.46, bed[2] - 0.35], [0, 0.1, 0.12], [0.8, 0.8]); // thrown-back blanket
  k.box([1.0, 0.7, 0.05], dark, [bed[0], 0.55, bed[2] + 1.07]);
  const stand = [-2.5, 0, 1.9];
  k.box([0.45, 0.5, 0.4], k.mat('#7a5a3e', 'wood'), [stand[0], 0.25, stand[2]]);
  k.cyl(0.06, 0.05, 0.1, 6, k.mat('#c8c0a8', 'concrete'), [stand[0], 0.55, stand[2]]);
  k.cyl(0.03, 0.03, 0.16, 5, k.glow('#ffd890'), [stand[0] + 0.1, 0.58, stand[2] + 0.05]); // candle stub
  k.sphere(0.05, k.glow('#ffe8a0', { fogged: 0.2 }), [stand[0] + 0.1, 0.7, stand[2] + 0.05]);
  const ward = k.box([0.6, 2.0, 1.1], k.mat('#6e5238', 'wood'), [x0 + 0.3, 1.0, -1.5], [0, 0, 0], [2, 2]);
  k.box([0.02, 1.9, 0.02], dark, [x0 + 0.61, 1.0, -1.5]);
  k.box([0.04, 0.12, 0.03], metal, [x0 + 0.62, 1.0, -1.58]); k.box([0.04, 0.12, 0.03], metal, [x0 + 0.62, 1.0, -1.42]);
  k.add(new T.PlaneGeometry(1.7, 1.2), k.mat('#c8c8c8', 'rug'), [-2.2, 0.01, -0.5], [-Math.PI / 2, 0, 0.2]);
  // clothes on the floor
  k.box([0.5, 0.05, 0.35], k.mat('#7a8a9a', 'cloth'), [-3.0, 0.03, -1.1], [0, 0.6, 0]);
  k.box([0.35, 0.07, 0.3], k.mat('#8a6a5a', 'cloth'), [-2.6, 0.04, -0.7], [0, 1.2, 0]);
  // picture frames on the south wall: simple coloured shapes, no faces
  const frames = [[-2.6, 1.55], [-1.2, 1.5]];
  frames.forEach(([lx, ly], i) => {
    const sg = new T.Group(); south.add(sg);
    k.box([0.4, 0.5, 0.04], k.mat('#3a2e26', 'wood'), [lx, ly, 0.03], [0, 0, 0.03 * (i ? -1 : 1)], [1, 1], sg);
    k.add(new T.PlaneGeometry(0.3, 0.4), k.mat(i ? '#8a9a7a' : '#a8908a', 'plaster'), [lx, ly, 0.056], [0, 0, 0.03 * (i ? -1 : 1)], sg);
  });

  // ---- kitchen: stove, counter with sink, shelf, table, chair, fridge
  k.box([0.7, 0.9, 0.6], k.mat('#d0ccc0', 'stove'), [0.75, 0.45, z0 + 0.32], [0, 0, 0], [0.7, 0.7]);
  k.box([1.3, 0.9, 0.6], k.mat('#8a7458', 'wood'), [1.75, 0.45, z0 + 0.32], [0, 0, 0], [2.5, 2.5]);
  k.box([1.34, 0.05, 0.64], k.mat('#9a9a92', 'concrete'), [1.75, 0.92, z0 + 0.32]);
  k.box([0.5, 0.06, 0.4], k.mat('#7a808a', 'metal'), [1.7, 0.945, z0 + 0.32]);
  k.cyl(0.016, 0.016, 0.28, 5, metal, [1.7, 1.1, z0 + 0.12]);
  k.box([1.8, 0.05, 0.25], k.mat('#6e5238', 'wood'), [1.7, 1.75, z0 + 0.15]);
  const cans = ['#a85040', '#c8b060', '#7a8a6a'];
  cans.forEach((c, i) => k.cyl(0.04, 0.04, 0.11, 6, k.mat(c, 'metal'), [1.15 + i * 0.13, 1.83, z0 + 0.16]));
  const tbl = [2.2, 0, 0.55];
  k.box([1.1, 0.05, 0.7], k.mat('#8a6a46', 'wood'), [tbl[0], 0.75, tbl[2]], [0, 0.1, 0], [0.8, 0.8]);
  for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) k.box([0.06, 0.73, 0.06], dark, [tbl[0] + dx, 0.365, tbl[2] + dz]);
  k.cyl(0.11, 0.07, 0.06, 8, k.mat('#c8c0a8', 'concrete'), [tbl[0] - 0.1, 0.81, tbl[2]]); // empty bowl
  k.box([0.02, 0.01, 0.12], metal, [tbl[0] + 0.12, 0.78, tbl[2] + 0.05], [0, 0.5, 0]);
  const ch = [tbl[0] - 0.1, 0, tbl[2] + 0.62];
  k.box([0.42, 0.05, 0.42], k.mat('#7a5a3e', 'wood'), [ch[0], 0.45, ch[2]]);
  k.box([0.42, 0.5, 0.05], k.mat('#7a5a3e', 'wood'), [ch[0], 0.72, ch[2] + 0.2]);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) k.box([0.04, 0.44, 0.04], dark, [ch[0] + dx, 0.22, ch[2] + dz]);

  // fridge, east wall; front faces the room (-x). Open shell + cavity so the inside shows.
  const F = { x: 3.65, z: 0.5, w: 0.72, d: 0.7, hgt: 1.75 };
  const shellGeo = k.boxGeo(F.d, F.hgt, F.w, [1, 1]); // along x: depth, y: height, z: width
  { const idx = shellGeo.index.array; const keep = []; for (let i = 0; i < idx.length; i++) { if (i >= 6 && i < 12) continue; keep.push(idx[i]); } shellGeo.setIndex(keep); }
  k.add(shellGeo, k.mat('#d8d4c0', 'fridge'), [F.x, F.hgt / 2 + 0.03, F.z]);
  const cav = k.box([F.d - 0.08, F.hgt - 0.1, F.w - 0.08], k.mat('#c4ccd0', 'fridgeIn', { side: T.BackSide }), [F.x + 0.02, F.hgt / 2 + 0.03, F.z], [0, 0, 0], [0.6, 0.9]);
  for (const y of [0.55, 0.95, 1.35]) k.box([F.d - 0.1, 0.02, F.w - 0.1], k.mat('#b8d0d8', 'metal'), [F.x + 0.02, y, F.z]);
  k.cyl(0.05, 0.05, 0.14, 6, k.mat('#c8d0a0', 'metal'), [F.x + 0.12, 0.64, F.z - 0.18]); // a jar, nearly empty
  k.cyl(0.04, 0.04, 0.12, 6, k.mat('#d8c060', 'metal'), [F.x + 0.18, 1.04, F.z + 0.2]);
  k.sphere(0.07, k.mat('#8aa070', 'leaves'), [F.x + 0.1, 0.1, F.z + 0.05], [1, 0.6, 1]);
  const frontX = F.x - F.d / 2;
  const fPivot = new T.Group(); fPivot.position.set(frontX - 0.02, F.hgt / 2 + 0.03, F.z + F.w / 2); group.add(fPivot);
  const fDoor = k.box([0.05, F.hgt, F.w], k.mat('#e0dccc', 'fridge'), [0, 0, -F.w / 2], [0, 0, 0], [0.7, 1.7], fPivot);
  k.box([0.04, 0.5, 0.04], metal, [-0.05, 0.1, -F.w + 0.1], [0, 0, 0], [1, 1], fPivot);
  const fLight = k.box([0.4, 0.02, 0.4], k.glow('#dff4ff', { fogged: 0.3 }), [F.x + 0.02, 1.66, F.z]);
  fLight.visible = false;

  // a hanging bulb in the kitchen
  k.cyl(0.005, 0.005, 0.4, 3, dark, [2.0, 2.3, -0.1]);
  const bulb = k.sphere(0.06, k.glow('#ffe0a0', { fogged: 0.2 }), [2.0, 2.08, -0.1]);

  // ---- lights (4 points) and fog
  const L = rig(r, {
    ambient: 0x424a64, key: 0x000000, fog: 0x07080e, fogNear: 6, fogFar: 15,
    points: [
      { pos: [2.0, 2.0, -0.1], hex: 0xffd890, k: 0.9, range: 6.2 },    // kitchen bulb
      { pos: [-2.4, 0.85, 1.95], hex: 0xffa850, k: 1.2, range: 4.2 },    // bedside candle
      { pos: [-2.1, 1.8, -1.7], hex: 0x6a82d8, k: 0.75, range: 4.0 },  // moon through the window
      { pos: [3.2, 1.3, F.z], hex: 0xd8f0ff, k: 0.0, range: 2.8 },     // fridge light
    ],
  });

  const W = (grp, lx, ly, lz = 0) => toWorld(grp.position.toArray(), grp.rotation.y, lx, ly, lz);
  const anchors = {
    cama: [bed[0], 0.5, bed[2]],
    camaOlhos: [bed[0], 0.95, bed[2] + 0.5],
    jogadorQuarto: [-1.8, 1.65, 1.0],
    janelaQuarto: W(north, -2.3, 1.475),
    portaQuarto: [0, 1.05, 0],
    mesa: [tbl[0], 0.8, tbl[2]],
    tigela: [tbl[0] - 0.1, 0.84, tbl[2]],
    fogao: [0.75, 0.9, z0 + 0.4],
    geladeira: [frontX, 1.1, F.z],
    geladeiraInterior: [F.x, 0.9, F.z],
    portaFundos: W(north, dC, 1.1),
    soleira: W(north, dC, 0, -0.3),
    lampada: [2.0, 2.08, -0.1],
    velaCabeceira: [stand[0] + 0.1, 0.7, stand[2] + 0.05],
  };
  const views = {
    quarto: { eye: [-0.4, 1.65, 1.6], at: [-3.3, 0.7, -0.8] },
    acordar: { eye: anchors.camaOlhos, at: [-1.0, 1.5, 0.0] },
    cozinha: { eye: [0.6, 1.65, 1.7], at: [2.8, 1.0, -1.0] },
    geladeira: { eye: [2.1, 1.65, 0.5], at: anchors.geladeira },
    geladeiraAberta: { eye: [1.9, 1.45, 0.15], at: [3.65, 0.95, 0.5] },
    portaFundos: { eye: [2.9, 1.65, 0.5], at: anchors.portaFundos },
    mesa: { eye: [1.2, 1.5, 1.2], at: anchors.tigela },
  };

  function update(t) {
    // the kitchen bulb has a tired flicker, a pure function of time
    const fl = Math.sin(t * 23) * Math.sin(t * 7.1) > 0.86 ? 0.55 : 1;
    L.level(0, fl * (1 + 0.03 * Math.sin(t * 1.3)));
    bulb.scale.setScalar(fl > 0.9 ? 1 : 0.8);
    L.level(1, 0.9 + 0.1 * Math.sin(t * 9.0) * Math.sin(t * 3.7)); // candle
  }
  update(0);

  const parts = {
    geladeiraPorta: fPivot, portaFundos: leafPivot, lampada: bulb,
    setFridge(f) { fPivot.rotation.y = f * 1.9; fLight.visible = f > 0.05; L.points[3].k = 0.5 * Math.min(1, f * 2); L.level(3, 1); },
    setBackDoor(f) { leafPivot.rotation.y = 1.15 + (f - 0.5) * 0.6; },
  };
  void rand; void east; void west; void ward; void cav; void fDoor;
  return { group, anchors, views, parts, lights: L, update, size: SIZE };
}
