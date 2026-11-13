// The house at night: a poor bedroom and kitchen, an empty fridge, a back door to the orchard.
//
// buildScene(r, { seed }) -> { group, anchors, views, parts, lights, update(t), size }
//  - anchors: name -> [x, y, z] (world metres, eye height ~1.65).
//  - parts: setFridge(0..1) opens the door and turns the fridge light on, setBackDoor(0..1),
//    plus the meshes (geladeiraPorta, portaFundos).
//  - lights.apply(): put this scene's fog/ambient/point lights on the shared renderer.
import { sceneEntities } from '../scene-entities.js';
import LAYOUT from '../../data/scenes/casa.json' with { type: 'json' };
import { kit, tex, toWorld, rig } from '../textures/paint.js';
import { mulberry32 } from '../rng.js';
import { buildCama, buildCriadoMudo, buildGuardaRoupa, buildTapete, buildRoupasNoChao, buildQuadros, buildFogao, buildBancadaPia,
  buildPrateleiraLatas, buildMesaTigela, buildCadeira, buildGeladeira, buildLampada } from '../props.js';

export const SIZE = { x0: -4, x1: 4, z0: -2.3, z1: 2.3, h: 2.5 };

export function buildScene(r, { seed = 1, layout = LAYOUT, editor = false } = {}) {
  const T = r.THREE, rand = mulberry32(seed * 521 + 9);
  const group = new T.Group(); group.name = 'casa';
  const k = kit(r, group);
  // The props are the scene's entities (scene-entities.js): built here as before, editable in the scene editor.
  const props = sceneEntities(r, group, k, layout, editor);
  const place = props.place;
  const { x0, x1, z0, z1, h } = SIZE;

  const plaster = k.mat('#a8a08c', 'plaster'), plasterK = k.mat('#a8b0a0', 'plaster');
  const wood = k.mat('#a88868', 'wood'), tile = k.mat('#a8a090', 'tile'), ceil = k.mat('#6a6458', 'plaster');
  const metal = k.mat('#8c929c', 'metal');
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
  place('cama', bed, (kk) => buildCama(r, kk, bed));
  const stand = [-2.5, 0, 1.9];
  place('criado-mudo', stand, (kk) => buildCriadoMudo(r, kk, stand));
  const ward = place('guarda-roupa', [-3.7, 0, -1.5], (kk) => buildGuardaRoupa(r, kk, x0));
  place('tapete', [-2.2, 0, -0.5], (kk) => buildTapete(r, kk));
  // clothes on the floor
  place('roupas-no-chao', [-2.8, 0, -0.9], (kk) => buildRoupasNoChao(r, kk));
  // picture frames on the south wall: simple coloured shapes, no faces
  buildQuadros(r, k, south);

  // ---- kitchen: stove, counter with sink, shelf, table, chair, fridge
  place('fogao', [0.75, 0, -1.98], (kk) => buildFogao(r, kk, z0));
  place('bancada-pia', [1.75, 0, -1.98], (kk) => buildBancadaPia(r, kk, z0));
  place('prateleira-latas', [1.45, 0, -2.15], (kk) => buildPrateleiraLatas(r, kk, z0));
  const tbl = [2.2, 0, 0.55];
  place('mesa-tigela', tbl, (kk) => buildMesaTigela(r, kk, tbl));
  const ch = [tbl[0] - 0.1, 0, tbl[2] + 0.62];
  place('cadeira', ch, (kk) => buildCadeira(r, kk, ch));

  // fridge, east wall; front faces the room (-x). Open shell + cavity so the inside shows.
  const F = { x: 3.65, z: 0.5, w: 0.72, d: 0.7, hgt: 1.75 };
  const { fPivot, fDoor, fLight, cav } = place('geladeira', [F.x, 0, F.z], (kk) => buildGeladeira(r, kk, F));
  const frontX = F.x - F.d / 2;

  // a hanging bulb in the kitchen
  const bulb = place('lampada', [2.0, 0, -0.1], (kk) => buildLampada(r, kk));

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
  props.finish(); // props the layout adds (made in the scene editor)
  return { group, anchors, views, parts, lights: L, update, size: SIZE };
}
