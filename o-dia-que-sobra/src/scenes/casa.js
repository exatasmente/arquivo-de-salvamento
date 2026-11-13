// Heitor's house at night, and the bit of street up to the neighbourhood pharmacy. Human scale
// (doors 2.1 m, eyes at 1.65 m). World: x east, z south, y up. The house is x 0..9.4, z 0..5.5; the street runs
// east-west in front of it (z 5.5..13); the pharmacy is the next building, x 12.5..20.5.
//
// buildCasa(r, { seed, darkness }) -> { group, anchors, colliders, lights, interactables, areas, areaAt, update(t, state), ... }
//  - anchors: name -> { pos: [x, y, z], dir: [x, y, z] }. Like the posto: the spot where the player stands, looking along `dir`
//    (world points of things are in `points`).
//  - colliders: [{ min, max, id? }]. Doors carry `door: id` and `enabled` (false while the door is open).
//  - lights: [{ id, area, kind, pos, color, range, on, level, pisca? }]; `level` (0..1) is written by update (flicker).
//  - interactables: [{ id, kind, object3D, anchor }]; object3D is a mesh the ray can hit (userData.interactId).
//  - areas: id -> { id, min, max, perigo, luz, tint }; areaAt(x, z) tells where a point is.
//  - update(t, state): pure function of time and state. State read:
//      adesivoGeladeira (0..1; > 0 shows the Sun sticker on the fridge), recados (number of messages on the answering
//      machine: the light blinks that many times, then pauses; 0 = dark), telefoneToca (bool), doors { portaRua, portaFarmacia: 0..1 },
//      hora (clock hours, for the wall clock), frascoVisivel (default true: the white bottle on the pharmacy counter).
//  - extras: doors, props, points, mood (a lighting suggestion), seedInfo.
// Nothing here has text: papers are scribbles, signs are pictograms. The only text of the world stays in the HUD.
import { D, createBuilder, mulberry32, canvasTexture, tex } from './paint.js';
import { placeProp } from '../models/props.js';
import { buildCar } from '../models/car.js';

const H = 2.6, H_FARM = 3.0;

const AREA_DEFS = {
  quarto: { r: [0, 0, 3.6, 5.5], perigo: 'nenhum', tint: 0.8, luz: 'abajur' },
  cozinha: { r: [3.6, 0, 9.4, 5.5], perigo: 'nenhum', tint: 0.95, luz: 'lâmpada de teto' },
  farmacia: { r: [12.5, 0, 20.5, 5.5], perigo: 'nenhum', tint: 1.0, luz: 'fluorescente' },
  rua: { r: [-8, -6, 28, 14], perigo: 'baixo', tint: 0.72, luz: 'postes' },
};
const ORDER = ['quarto', 'cozinha', 'farmacia', 'rua'];
export const AREA_INFO = AREA_DEFS;

const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

export function buildCasa(r, { seed = 1, darkness = 1 } = {}) {
  const T = r.THREE, rnd = mulberry32(seed * 6151 + 17);
  const group = new T.Group(); group.name = 'casa';
  const tintOf = (a) => { const t = AREA_DEFS[a]?.tint ?? 1; return 1 - (1 - t) * darkness; };
  const B = createBuilder(r, { tint: tintOf });
  const anchors = {}, points = {}, colliders = [], lights = [], interactables = [], updaters = [], props = {}, doors = {};
  const areas = {};
  for (const a of ORDER) { const [x0, z0, x1, z1] = AREA_DEFS[a].r; areas[a] = { id: a, min: [x0, 0, z0], max: [x1, a === 'rua' ? 40 : (a === 'farmacia' ? H_FARM : H), z1], perigo: AREA_DEFS[a].perigo, luz: AREA_DEFS[a].luz, tint: tintOf(a) }; }
  const areaAt = (x, z) => {
    for (const a of ORDER) { const [x0, z0, x1, z1] = AREA_DEFS[a].r; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return a; }
    return 'rua';
  };
  const anchor = (name, pos, dir = [0, 0, -1]) => { anchors[name] = { pos, dir: unit(dir) }; };
  const collide = (min, max, extra = {}) => colliders.push({ min, max, ...extra });
  const inter = (id, kind, object3D, anchorName = id) => { object3D.userData.interactId = id; interactables.push({ id, kind, object3D, anchor: anchorName }); };
  const hitBox = (id, size, pos) => { const m = new T.Mesh(new T.BoxGeometry(...size), new T.MeshBasicMaterial({ visible: false })); m.position.set(...pos); group.add(m); return m; };
  const loose = (geo, mat, pos, rot = [0, 0, 0]) => { const m = new T.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); group.add(m); return m; };

  // ------------------------------------------------------------------ materials and painted bits
  const mine = {};
  const paint = (name, w, h, fn, color = '#ffffff', opts = {}) => {
    if (mine[name]) return mine[name];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h, mulberry32(name.length * 331 + w));
    return (mine[name] = { ...D(color, null, opts), key: 'casa:' + name + color, texture: canvasTexture(r, c, true) });
  };
  const bar = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // papers with scribble lines: never legible (the amount is in the HUD)
  const paperA = paint('paperA', 16, 22, (g, w, h, R) => {
    bar(g, 'rgb(222,214,190)', 0, 0, w, h); bar(g, 'rgb(150,140,118)', 0, 0, w, 1);
    for (let y = 4; y < h - 2; y += 2) bar(g, 'rgb(120,112,96)', 2, y, 4 + ((R() * (w - 7)) | 0), 1);
    bar(g, 'rgb(170,120,70)', w - 5, h - 5, 3, 3);
  });
  const paperB = paint('paperB', 16, 22, (g, w, h, R) => {
    bar(g, 'rgb(212,206,186)', 0, 0, w, h); bar(g, 'rgb(150,64,44)', 0, 0, w, 3);
    for (let y = 6; y < h - 2; y += 2) bar(g, 'rgb(110,104,90)', 2, y, 3 + ((R() * (w - 6)) | 0), 1);
    bar(g, 'rgb(150,64,44)', 2, h - 5, 6, 2);
  });
  const envelope = paint('envelope', 16, 10, (g, w, h) => {
    bar(g, 'rgb(206,190,150)', 0, 0, w, h); g.strokeStyle = 'rgb(130,110,80)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h * 0.6); g.lineTo(w, 0); g.stroke(); bar(g, 'rgb(150,70,50)', w - 5, h - 4, 3, 2);
  });
  // battery blister card: a coloured band and two cells drawn as pictograms
  const pilhaCard = paint('pilhaCard', 16, 24, (g, w, h) => {
    bar(g, 'rgb(214,176,92)', 0, 0, w, h); bar(g, 'rgb(96,64,40)', 0, 0, w, 6); bar(g, 'rgb(60,40,28)', 0, 6, w, 1);
    for (const x of [3, 9]) { bar(g, 'rgb(60,44,34)', x, 10, 4, 10); bar(g, 'rgb(190,150,60)', x, 12, 4, 2); bar(g, 'rgb(150,150,142)', x + 1, 8, 2, 2); }
    bar(g, 'rgb(150,110,56)', 0, h - 1, w, 1);
  });
  const crossPoster = paint('crossPoster', 16, 24, (g, w, h) => {
    bar(g, 'rgb(226,214,180)', 0, 0, w, h); bar(g, 'rgb(130,96,60)', 0, 0, w, 1); bar(g, 'rgb(130,96,60)', 0, h - 1, w, 1);
    bar(g, 'rgb(150,70,50)', 6, 3, 4, 12); bar(g, 'rgb(150,70,50)', 2, 7, 12, 4); for (let y = 18; y < 22; y += 2) bar(g, 'rgb(120,104,84)', 3, y, 10, 1);
  });
  const rugTex = paint('rug', 16, 16, (g, w, h, R) => {
    bar(g, 'rgb(120,78,56)', 0, 0, w, h); bar(g, 'rgb(86,54,40)', 1, 1, w - 2, h - 2); bar(g, 'rgb(150,112,76)', 3, 3, w - 6, h - 6);
    for (let i = 0; i < 12; i++) bar(g, 'rgb(110,76,52)', 3 + ((R() * 9) | 0), 3 + ((R() * 9) | 0), 2, 1);
  });

  const M = {
    wall: D('#e0d4b4', 'wallIn'), wallOut: D('#d8c49a', 'wall'), wallFarm: D('#e4d6ae', 'wallIn'), wallNeighbor: D('#8a7860', 'wall'), floorWood: D('#a07c58', 'wood'),
    tile: D('#b4a88c', 'tileStore'), ceiling: D('#d8cdb0', 'ceiling'), roof: D('#5a463a', 'concrete'), concrete: D('#ffffff', 'concrete'), asphalt: D('#ffffff', 'asphalt'), grass: D('#ffffff', 'grass'),
    gravel: D('#ffffff', 'gravel'), curb: D('#b0a890', 'concrete'), lineY: D('#ffffff', 'lineY'), lineW: D('#ffffff', 'lineW'),
    wood: D('#ffffff', 'wood'), woodDark: D('#7a5a3e', 'wood'), counter: D('#ffffff', 'counter'), fridge: D('#e2dcc2', 'fridge'), plastic: D('#d8cdb0', 'plastic'),
    steel: D('#ffffff', 'steel'), black: D('#2a2622', 'rubber'), cream: D('#d8ceb0', 'plastic'), shelf: D('#ffffff', 'shelf'), grid: D('#b8a888', 'grid'), cardboard: D('#ffffff', 'cardboard'),
    porcelain: D('#ffffff', 'porcelain'), sheet: D('#b0a07c', 'carpet'), blanket: D('#b07c5c', 'carpet'), pillow: D('#d4c8a8', 'plastic'),
    curtain: D('#9a6a48', 'carpet'), hedge: D('#566a3e', 'grass'), metal: D('#8a8c84', 'steel'), sol: D('#ffffff', 'solSticker'), doorFrame: D('#7a5434', 'plastic'),
    awning: D('#ffffff', 'canopyBand'), glowWarm: D('#f0d490', null, { emissive: 1 }), glowTube: D('#e8f0d0', null, { emissive: 1 }), glowCross: D('#f4e6b0', null, { emissive: 1 }),
    winLit: D('#c8a860', null, { emissive: 1 }), carton1: D('#d6cdb4', 'cardboard'), carton2: D('#c4b896', 'cardboard'), carton3: D('#b7a888', 'cardboard'), boxBlue: D('#9ab0b4', 'plastic'),
    glass: null,
  };
  const C = B.ctx({ area: 'rua' });
  const A = (a) => B.ctx({ area: a });

  // ------------------------------------------------------------------ flat floors
  const flat = (x0, z0, x1, z1, y, d, tile, area, up = true, step = 3) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz), uv = g.attributes.uv, p = g.attributes.position;
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + (x1 - x0) / 2 + x0) / tile[0], (p.getZ(i) + (z1 - z0) / 2 + z0) / tile[1]);
    A(area).geo(g, d, [(x0 + x1) / 2, y, (z0 + z1) / 2]);
  };
  flat(-40, -30, 60, 5.5, -0.02, M.grass, [3, 3], 'rua', true, 10);
  flat(-8, 5.5, 28, 7.3, 0, M.concrete, [2.6, 2.6], 'rua', true, 3);        // sidewalk, house side
  flat(-8, 7.5, 28, 11.5, 0, M.asphalt, [2.6, 2.6], 'rua', true, 4);        // street
  flat(-8, 11.7, 28, 13.3, 0, M.concrete, [2.6, 2.6], 'rua', true, 3);      // sidewalk, other side
  flat(-8, 7.3, 28, 7.5, 0, M.curb, [1, 1], 'rua', true, 8); flat(-8, 11.5, 28, 11.7, 0, M.curb, [1, 1], 'rua', true, 8);
  for (let x = -6; x < 27; x += 4) A('rua').quad(2, 0.14, M.lineY, [x, 0.012, 9.5], [-Math.PI / 2, 0, 0]);
  for (const [x0, x1] of [[-8, 28]]) { C.box([x1 - x0, 0.1, 0.22], M.curb, [(x0 + x1) / 2, 0.05, 7.4]); }
  flat(0, 0, 3.6, 5.5, 0.005, M.floorWood, [1.6, 1.6], 'quarto', true, 2);
  flat(3.6, 0, 9.4, 5.5, 0.005, M.floorWood, [1.6, 1.6], 'cozinha', true, 2);
  flat(5.7, 0, 9.4, 1.3, 0.008, M.tile, [1.3, 1.3], 'cozinha', true, 2);       // kitchen tiles
  flat(12.5, 0, 20.5, 5.5, 0.005, M.tile, [2.0, 2.0], 'farmacia', true, 2);
  // ceilings and roofs (a slab whose underside is the ceiling)
  A('cozinha').box([9.9, 0.2, 5.9], M.ceiling, [4.7, H + 0.1, 2.75], [0, 0, 0], [2, 2]);
  A('farmacia').box([8.4, 0.2, 5.9], M.ceiling, [16.5, H_FARM + 0.1, 2.75], [0, 0, 0], [2, 2]);
  A('rua').box([9.9, 0.05, 5.9], M.roof, [4.7, H + 0.225, 2.75], [0, 0, 0], [2.6, 2.6]);
  A('rua').box([8.4, 0.05, 5.9], M.roof, [16.5, H_FARM + 0.225, 2.75], [0, 0, 0], [2.6, 2.6]);

  // ------------------------------------------------------------------ walls
  // wall({ axis, at, a, b, lo, hi, matLo, matHi, h, openings:[{c,w,top,sill,kind}] }): two skins of 0.1 m, tinted by the room on each side.
  function wall({ axis, at, a, b, lo, hi, matLo, matHi, h = H, openings = [], collider = true }) {
    const ops = openings.filter((o) => o.c - o.w / 2 >= a - 1e-6 && o.c + o.w / 2 <= b + 1e-6).sort((p, q) => p.c - q.c);
    for (const [off, area, mat] of [[-0.05, lo, matLo], [0.05, hi, matHi]]) {
      const c = A(area), put = (s0, s1, y0, y1) => {
        if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
        const len = s1 - s0, mid = (s0 + s1) / 2, size = axis === 'x' ? [len, y1 - y0, 0.1] : [0.1, y1 - y0, len];
        c.box(size, mat, axis === 'x' ? [mid, (y0 + y1) / 2, at + off] : [at + off, (y0 + y1) / 2, mid], [0, 0, 0], [3.2, 3.2]);
      };
      let cur = a;
      for (const o of ops) {
        put(cur, o.c - o.w / 2, 0, h);
        const top = o.top ?? 2.1, sill = o.sill ?? 0;
        put(o.c - o.w / 2, o.c + o.w / 2, top, h); if (sill > 0) put(o.c - o.w / 2, o.c + o.w / 2, 0, sill);
        cur = o.c + o.w / 2;
      }
      put(cur, b, 0, h);
    }
    if (collider) {
      let cur = a;
      const col = (s0, s1) => { if (s1 - s0 < 1e-3) return; collide(axis === 'x' ? [s0, 0, at - 0.1] : [at - 0.1, 0, s0], axis === 'x' ? [s1, h, at + 0.1] : [at + 0.1, h, s1]); };
      for (const o of ops.filter((q) => q.kind === 'door')) { col(cur, o.c - o.w / 2); cur = o.c + o.w / 2; }
      col(cur, b);
    }
    for (const o of ops.filter((q) => q.kind === 'janela')) { // night glass + frame
      const w = o.w, gh = (o.top ?? 2.1) - o.sill;
      const m = new T.Mesh(new T.PlaneGeometry(w, gh), r.mat('#3e5266', { transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
      m.position.set(axis === 'x' ? o.c : at, o.sill + gh / 2, axis === 'x' ? at : o.c); if (axis === 'z') m.rotation.y = Math.PI / 2; m.renderOrder = 2; group.add(m);
      const fc = A(lo), t = 0.05;
      if (axis === 'x') { fc.box([w + 0.12, t, 0.2], M.doorFrame, [o.c, o.sill - 0.02, at]); fc.box([w + 0.12, t, 0.2], M.doorFrame, [o.c, o.top + 0.02, at]); fc.box([t, gh, 0.2], M.doorFrame, [o.c - w / 2, o.sill + gh / 2, at]); fc.box([t, gh, 0.2], M.doorFrame, [o.c + w / 2, o.sill + gh / 2, at]); fc.box([0.03, gh, 0.06], M.doorFrame, [o.c, o.sill + gh / 2, at]); }
      else { fc.box([0.2, t, w + 0.12], M.doorFrame, [at, o.sill - 0.02, o.c]); fc.box([0.2, t, w + 0.12], M.doorFrame, [at, o.top + 0.02, o.c]); }
    }
  }
  const dr = (c, w = 0.95, extra = {}) => ({ c, w, top: 2.1, kind: 'door', ...extra });
  const win = (c, w, sill = 1.0, top = 2.1) => ({ c, w, sill, top, kind: 'janela' });

  // house
  const FRONT = [win(6.0, 1.5), dr(8.2, 0.95)];
  wall({ axis: 'x', at: 0, a: -0.1, b: 3.6, lo: 'rua', hi: 'quarto', matLo: M.wallOut, matHi: M.wall, openings: [win(1.8, 1.0, 1.1, 2.0)] });
  wall({ axis: 'x', at: 0, a: 3.6, b: 9.5, lo: 'rua', hi: 'cozinha', matLo: M.wallOut, matHi: M.wall });
  wall({ axis: 'x', at: 5.5, a: -0.1, b: 3.6, lo: 'quarto', hi: 'rua', matLo: M.wall, matHi: M.wallOut });
  wall({ axis: 'x', at: 5.5, a: 3.6, b: 9.5, lo: 'cozinha', hi: 'rua', matLo: M.wall, matHi: M.wallOut, openings: FRONT });
  wall({ axis: 'z', at: 0, a: -0.1, b: 5.6, lo: 'rua', hi: 'quarto', matLo: M.wallOut, matHi: M.wall });
  wall({ axis: 'z', at: 9.4, a: -0.1, b: 5.6, lo: 'cozinha', hi: 'rua', matLo: M.wall, matHi: M.wallOut });
  wall({ axis: 'z', at: 3.6, a: 0.1, b: 5.4, lo: 'quarto', hi: 'cozinha', matLo: M.wall, matHi: M.wall, openings: [dr(3.4, 0.9)] });
  // doorway frame between the rooms
  { const f = A('cozinha'); f.box([0.2, 2.15, 0.06], M.doorFrame, [3.6, 1.075, 2.92]); f.box([0.2, 2.15, 0.06], M.doorFrame, [3.6, 1.075, 3.88]); f.box([0.2, 0.06, 1.0], M.doorFrame, [3.6, 2.13, 3.4]); }
  // fence-wall between the house and the pharmacy (a closed side passage)
  A('rua').box([3.0, 2.2, 0.2], M.wallOut, [11.0, 1.1, 5.4], [0, 0, 0], [3.2, 3.2]); collide([9.5, 0, 5.3], [12.5, 2.2, 5.5]);
  A('rua').box([3.0, 2.2, 0.2], M.wallNeighbor, [11.0, 1.1, 0.0], [0, 0, 0], [3.2, 3.2]); collide([9.5, 0, -0.1], [12.5, 2.2, 0.1]);
  // pharmacy
  const FARM_FRONT = [win(13.7, 1.5, 0.9, 2.3), dr(16.5, 1.1, { top: 2.2 }), win(19.3, 1.7, 0.9, 2.3)];
  wall({ axis: 'x', at: 0, a: 12.4, b: 20.6, lo: 'rua', hi: 'farmacia', matLo: M.wallOut, matHi: M.wallFarm, h: H_FARM });
  wall({ axis: 'x', at: 5.5, a: 12.4, b: 20.6, lo: 'farmacia', hi: 'rua', matLo: M.wallFarm, matHi: M.wallOut, h: H_FARM, openings: FARM_FRONT });
  wall({ axis: 'z', at: 12.5, a: -0.1, b: 5.6, lo: 'rua', hi: 'farmacia', matLo: M.wallOut, matHi: M.wallFarm, h: H_FARM });
  wall({ axis: 'z', at: 20.5, a: -0.1, b: 5.6, lo: 'farmacia', hi: 'rua', matLo: M.wallFarm, matHi: M.wallOut, h: H_FARM });
  // the sign band over the pharmacy front: a generic cross (cream, never green) and nothing written
  { const f = A('rua');
    f.box([8.6, 0.8, 0.28], D('#6a4a30', 'wood'), [16.5, H_FARM + 0.4, 5.62], [0, 0, 0], [1, 1]);
    f.box([0.22, 0.7, 0.05], M.glowCross, [16.5, H_FARM + 0.4, 5.78]); f.box([0.7, 0.22, 0.05], M.glowCross, [16.5, H_FARM + 0.4, 5.79]);
    for (const x of [14.0, 19.0]) { f.box([0.12, 0.4, 0.05], M.glowCross, [x, H_FARM + 0.4, 5.78]); f.box([0.4, 0.12, 0.05], M.glowCross, [x, H_FARM + 0.4, 5.79]); }
    f.box([4.2, 0.08, 1.0], M.awning, [16.5, 2.5, 6.0], [0.18, 0, 0], [1, 1]);          // awning over the door
    f.box([0.06, 2.5, 0.06], M.steel, [14.45, 1.25, 6.45]); f.box([0.06, 2.5, 0.06], M.steel, [18.55, 1.25, 6.45]);
    collide([14.4, 0, 6.4], [14.5, 2.5, 6.5]); collide([18.5, 0, 6.4], [18.6, 2.5, 6.5]);
  }

  // ------------------------------------------------------------------ doors (house front, pharmacy front)
  const addDoor = (id, x, z, tipo, w, area, anchorPos, anchorDir, matDoorCollider = true) => {
    const d = placeProp(B, 'porta', { pos: [x, 0, z], ry: 0, area, tipo, w, swing: 1, id }); group.add(d.dyn);
    const col = { min: [x - w / 2, 0, z - 0.12], max: [x + w / 2, 2.1, z + 0.12], door: id, enabled: true };
    colliders.push(col); doors[id] = { id, extras: d, collider: col };
    inter(id, 'porta', d.hit, id); anchor(id, anchorPos, anchorDir);
    if (!matDoorCollider) col.enabled = false;
  };
  addDoor('portaRua', 8.2, 5.5, 'madeira', 0.95, 'cozinha', [8.2, 0, 4.6], [0, 0, 1]);
  addDoor('portaFarmacia', 16.5, 5.5, 'vidro', 1.1, 'farmacia', [16.5, 0, 6.5], [0, 0, -1]);
  anchor('ruaCasa', [8.2, 0, 6.6], [1, 0, 0.2]); anchor('ruaFarmacia', [14.0, 0, 6.6], [1, 0, 0]);

  // ------------------------------------------------------------------ small furniture helpers
  const table = (c, x, z, w, d, h, top, leg) => {
    c.box([w, 0.05, d], top, [x, h - 0.025, z], [0, 0, 0], [0.8, 0.8]);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.box([0.05, h - 0.05, 0.05], leg, [x + dx * (w / 2 - 0.05), (h - 0.05) / 2, z + dz * (d / 2 - 0.05)]);
  };
  const chair = (c, x, z, ry) => {
    const cc = B.ctx({ pos: [x, 0, z], ry, area: 'cozinha' });
    cc.box([0.4, 0.04, 0.4], M.woodDark, [0, 0.45, 0]); cc.box([0.4, 0.45, 0.04], M.woodDark, [0, 0.68, -0.18]);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cc.box([0.04, 0.43, 0.04], M.woodDark, [dx * 0.17, 0.215, dz * 0.17]);
  };

  // ------------------------------------------------------------------ bedroom
  {
    const q = A('quarto');
    // bed: head against the north wall, long side along the west wall
    q.box([1.5, 0.28, 2.0], M.woodDark, [0.85, 0.16, 1.15], [0, 0, 0], [0.8, 0.8]);
    q.box([1.5, 0.5, 0.08], M.woodDark, [0.85, 0.55, 0.14]);
    q.box([1.4, 0.16, 1.9], M.sheet, [0.85, 0.38, 1.15], [0, 0, 0], [0.7, 0.7]);
    q.box([1.42, 0.07, 1.1], M.blanket, [0.85, 0.49, 1.7], [0, 0, 0], [0.7, 0.7]);
    q.box([0.55, 0.1, 0.35], M.pillow, [0.55, 0.51, 0.4]); q.box([0.55, 0.1, 0.35], M.pillow, [1.15, 0.51, 0.4]);
    collide([0.1, 0, 0.1], [1.6, 0.65, 2.15], { id: 'cama' });
    // nightstand with the lamp
    q.box([0.42, 0.5, 0.4], M.wood, [1.95, 0.25, 0.3], [0, 0, 0], [0.7, 0.7]); q.box([0.36, 0.02, 0.34], M.woodDark, [1.95, 0.51, 0.3]);
    q.cyl(0.04, 0.05, 0.12, 6, M.black, [1.95, 0.58, 0.3]); q.cyl(0.1, 0.07, 0.14, 8, M.cream, [1.95, 0.71, 0.3]);
    collide([1.72, 0, 0.1], [2.18, 0.55, 0.5]);
    // alarm clock: a body and two dials, no digits
    q.box([0.1, 0.07, 0.05], M.black, [1.82, 0.545, 0.4]);
    // wardrobe on the west wall, near the south corner
    q.box([0.55, 1.9, 1.25], M.wood, [0.35, 0.95, 4.7], [0, 0, 0], [1, 1]);
    for (const dz of [-0.3, 0.3]) q.box([0.02, 1.6, 0.02], M.black, [0.64, 1.0, 4.7 + dz * 0.2]);
    q.box([0.02, 1.8, 0.02], M.black, [0.64, 0.95, 4.7]);
    collide([0.08, 0, 4.07], [0.63, 1.9, 5.33], { id: 'guardaRoupa' });
    // rug and a chair with clothes
    q.box([1.5, 0.012, 1.0], rugTex, [2.2, 0.012, 3.0], [0, 0, 0], [1.5, 1]);
    q.box([0.5, 0.04, 0.5], M.woodDark, [3.1, 0.45, 5.0]); q.box([0.5, 0.5, 0.04], M.woodDark, [3.1, 0.7, 5.24]);
    q.box([0.4, 0.06, 0.34], D('#6a6a62', 'carpet'), [3.1, 0.51, 4.98]); collide([2.82, 0, 4.72], [3.38, 0.9, 5.3]);
    // curtains in the north window
    for (const dx of [-0.62, 0.62]) q.box([0.3, 1.25, 0.05], M.curtain, [1.8 + dx, 1.5, 0.12]);
    // door-side wall hook with a jacket
    q.box([0.3, 0.9, 0.06], D('#7a5c44', 'carpet'), [3.5, 1.5, 0.9]);
    q.box([0.04, 0.04, 0.12], M.black, [3.54, 1.95, 0.9]);
  }

  // ------------------------------------------------------------------ kitchen + living
  const ck = A('cozinha');
  // kitchen run on the north wall: stove, counter with sink, wall cabinets
  ck.box([0.6, 0.9, 0.6], M.plastic, [6.1, 0.45, 0.4]); ck.box([0.6, 0.02, 0.6], M.black, [6.1, 0.91, 0.4]);
  for (const [dx, dz] of [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.13], [0.14, 0.13]]) ck.cyl(0.07, 0.07, 0.015, 8, D('#46423c', 'rubber'), [6.1 + dx, 0.93, 0.4 + dz]);
  ck.box([0.5, 0.3, 0.02], D('#3a342c', 'rubber'), [6.1, 0.45, 0.71]);
  ck.box([1.4, 0.88, 0.6], M.counter, [7.1, 0.44, 0.4], [0, 0, 0], [0.8, 0.8]); ck.box([1.44, 0.04, 0.64], M.woodDark, [7.1, 0.9, 0.4]);
  ck.box([0.5, 0.08, 0.38], M.steel, [7.1, 0.9, 0.4]); ck.cyl(0.015, 0.015, 0.22, 5, M.metal, [7.1, 1.02, 0.18]); ck.box([0.02, 0.02, 0.12], M.metal, [7.1, 1.12, 0.24]);
  ck.box([1.9, 0.6, 0.34], M.wood, [6.65, 1.85, 0.2], [0, 0, 0], [0.8, 0.8]);
  for (const x of [6.0, 6.65, 7.3]) ck.box([0.02, 0.5, 0.02], M.black, [x + 0.28, 1.8, 0.385]);
  collide([5.8, 0, 0.1], [7.8, 1.0, 0.7]);
  // the fridge: old, off-white, with a handle; the Sun sticker (state.adesivoGeladeira) goes on the door
  ck.box([0.72, 1.7, 0.68], M.fridge, [8.7, 0.85, 0.42], [0, 0, 0], [0.8, 0.8]);
  ck.box([0.7, 0.02, 0.02], M.black, [8.7, 1.18, 0.77]);
  ck.box([0.04, 0.5, 0.05], M.metal, [8.46, 0.8, 0.79]); ck.box([0.04, 0.3, 0.05], M.metal, [8.46, 1.5, 0.79]);
  ck.box([0.74, 0.02, 0.7], D('#b8b09a', 'plastic'), [8.7, 1.71, 0.42]);
  ck.box([0.5, 0.04, 0.5], D('#8a7a60', 'plastic'), [8.7, 1.74, 0.45]);
  collide([8.32, 0, 0.08], [9.08, 1.75, 0.8], { id: 'geladeira' });
  const stickerPos = [8.88, 1.38, 0.775];
  const sticker = loose(new T.PlaneGeometry(0.2, 0.2), r.mat('#ffffff', { map: tex(r, 'solSticker') }), stickerPos); sticker.visible = false;
  // magnets: three small blocks, no photos
  for (const [dx, dy] of [[-0.18, 1.5], [-0.05, 1.28], [0.1, 1.58]]) ck.box([0.05, 0.05, 0.015], D('#8a6a48', 'plastic'), [8.7 + dx, dy, 0.772]);
  const geladeiraHit = hitBox('geladeira', [0.72, 1.7, 0.68], [8.7, 0.85, 0.42]);
  inter('geladeira', 'geladeira', geladeiraHit);
  anchor('geladeira', [8.7, 0, 1.55], [0, 0, -1]); points.adesivoGeladeira = stickerPos;
  anchor('adesivoGeladeira', [8.7, 0, 1.55], [0.1, 0.1, -1]);
  // the dining table with the bills
  table(ck, 5.4, 2.3, 1.1, 0.8, 0.75, M.wood, M.woodDark); collide([4.85, 0, 1.9], [5.95, 0.8, 2.7], { id: 'mesa' });
  chair(ck, 4.45, 2.3, Math.PI / 2); chair(ck, 5.4, 1.45, 0); collide([4.25, 0, 2.1], [4.65, 0.9, 2.5]); collide([5.2, 0, 1.25], [5.6, 0.9, 1.65]);
  {
    const tc = B.ctx({ pos: [5.4, 0.755, 2.3], area: 'cozinha' });
    const sheets = [[-0.3, -0.1, 0.4, paperA], [-0.12, 0.1, -0.2, paperB], [0.05, -0.15, 0.1, paperA], [0.25, 0.08, -0.5, paperB], [-0.35, 0.2, 0.9, paperB], [0.32, -0.2, 0.7, paperA]];
    sheets.forEach(([dx, dz, ry, m], i) => tc.box([0.2, 0.004, 0.28], m, [dx, 0.003 + i * 0.0035, dz], [0, ry + (rnd() - 0.5) * 0.2, 0], [0.2, 0.28]));
    tc.box([0.24, 0.006, 0.12], envelope, [0.1, 0.03, 0.2], [0, 0.3, 0], [0.24, 0.12]);
    tc.cyl(0.03, 0.026, 0.07, 8, D('#6a3a2a', 'plastic'), [-0.42, 0.04, -0.28]);      // a cup
    tc.box([0.14, 0.012, 0.012], M.black, [0.36, 0.01, 0.28], [0, 0.5, 0]);          // a pen
  }
  const mesaHit = hitBox('mesaContas', [1.1, 0.3, 0.8], [5.4, 0.85, 2.3]);
  inter('mesaContas', 'contas', mesaHit); anchor('mesaContas', [5.4, 0, 3.4], [0, 0, -1]); points.mesaContas = [5.4, 0.78, 2.3];
  // the phone table with the landline and the answering machine
  {
    const tc = A('cozinha');
    table(tc, 3.95, 0.9, 0.5, 0.55, 0.7, M.woodDark, M.woodDark); collide([3.68, 0, 0.62], [4.22, 0.75, 1.18], { id: 'mesaTelefone' });
    // landline: base + handset + a dial pad (no digits)
    tc.box([0.2, 0.06, 0.22], M.cream, [3.95, 0.73, 1.0]); tc.box([0.12, 0.012, 0.1], M.grid, [3.95, 0.765, 1.03], [-0.2, 0, 0], [0.12, 0.12]);
    tc.box([0.04, 0.05, 0.05], M.cream, [3.88, 0.79, 0.93]); tc.box([0.04, 0.05, 0.05], M.cream, [4.02, 0.79, 0.93]);
    // answering machine: grey body, tape window, two buttons, an LED (loose glow mesh below)
    tc.box([0.26, 0.07, 0.2], D('#8c8a82', 'plastic'), [3.97, 0.735, 0.76]); tc.box([0.1, 0.012, 0.07], M.black, [3.92, 0.775, 0.76]);
    tc.box([0.025, 0.012, 0.025], D('#a04a34', 'plastic'), [4.04, 0.775, 0.7]); tc.box([0.025, 0.012, 0.025], D('#d8cdb0', 'plastic'), [4.04, 0.775, 0.8]);
  }
  const hc = A('cozinha'); group.add(hc.dyn); const handset = hc.mesh(new T.BoxGeometry(0.2, 0.035, 0.05), M.cream, [3.95, 0.81, 0.93]);
  const led = new T.Mesh(new T.BoxGeometry(0.018, 0.01, 0.018), r.glow('#ff2a1a')); led.position.set(4.04, 0.775, 0.75); led.visible = false; group.add(led);
  const ledLight = { id: 'recados', area: 'cozinha', kind: 'led', pos: [4.0, 0.9, 0.75], color: '#ff3a22', range: 1.6, on: true, level: 0 };
  lights.push(ledLight);
  const telHit = hitBox('telefone', [0.5, 0.25, 0.5], [3.95, 0.82, 0.88]);
  inter('telefone', 'telefone', telHit); anchor('telefone', [4.95, 0, 0.95], [-1, 0, 0]); points.telefone = [3.95, 0.8, 0.88];
  // armchair on the west wall of the room
  { const a = A('cozinha');
    a.box([0.8, 0.4, 0.9], D('#8a6a4a', 'carpet'), [4.1, 0.25, 4.7]); a.box([0.2, 0.55, 0.9], D('#8a6a4a', 'carpet'), [3.8, 0.6, 4.7]);
    a.box([0.8, 0.14, 0.12], D('#8a6a4a', 'carpet'), [4.1, 0.5, 4.32]); a.box([0.8, 0.14, 0.12], D('#8a6a4a', 'carpet'), [4.1, 0.5, 5.08]);
    a.box([0.5, 0.1, 0.66], D('#a58660', 'carpet'), [4.18, 0.5, 4.7]);
    collide([3.7, 0, 4.2], [4.55, 0.8, 5.2], { id: 'poltrona' });
    // floor lamp in the corner
    a.cyl(0.04, 0.05, 1.5, 6, M.black, [4.6, 0.75, 5.1]); a.cyl(0.13, 0.2, 0.28, 8, M.cream, [4.6, 1.6, 5.1]);
  }
  // the window to the street (curtains + a sill)
  { const w = A('cozinha');
    for (const dx of [-0.95, 0.95]) w.box([0.3, 1.3, 0.05], M.curtain, [6.0 + dx, 1.5, 5.38]);
    w.box([1.8, 0.04, 0.18], M.woodDark, [6.0, 1.0, 5.4]);
    w.cyl(0.07, 0.05, 0.14, 7, D('#8a5a3a', 'plastic'), [5.5, 1.09, 5.4]); w.cyl(0.04, 0.05, 0.2, 5, D('#566a3e', 'grass'), [5.5, 1.26, 5.4]);   // a plant on the sill
  }
  const janelaHit = hitBox('janela', [1.5, 1.1, 0.3], [6.0, 1.55, 5.4]);
  inter('janela', 'janela', janelaHit); anchor('janela', [6.0, 0, 4.7], [0, 0, 1]); points.janela = [6.0, 1.55, 5.5];
  // the clock on the north wall
  { const cl = placeProp(B, 'relogio', { pos: [5.4, 0, 0.05], ry: 0, area: 'cozinha' }); group.add(cl.dyn); updaters.push(cl.update); props.relogio = cl; }

  // the father's fishing rod, leaning on the east wall, with a tackle box on the floor
  {
    const v = A('cozinha'), tilt = Math.atan2(0.3, 1.9);
    v.cyl(0.009, 0.02, 2.05, 6, D('#c09a64', 'wood'), [9.15, 1.0, 2.6], [0, 0, -tilt]);               // blank
    v.cyl(0.03, 0.03, 0.3, 6, D('#d0b078', 'wood'), [9.0, 0.18, 2.6], [0, 0, -tilt]);               // cork grip
    v.cyl(0.04, 0.04, 0.05, 8, M.metal, [8.98, 0.62, 2.62], [Math.PI / 2, 0, 0]);                      // reel
    v.box([0.03, 0.03, 0.14], M.black, [9.0, 0.62, 2.68]);
    v.box([0.44, 0.2, 0.26], D('#6a5a3a', 'wood'), [8.85, 0.1, 3.2], [0, 0.2, 0]); v.box([0.2, 0.02, 0.03], M.metal, [8.85, 0.21, 3.2], [0, 0.2, 0]);
    collide([8.62, 0, 3.05], [9.08, 0.22, 3.35]);
  }
  const varaHit = hitBox('vara', [0.35, 2.05, 0.35], [9.15, 1.0, 2.6]);
  inter('vara', 'vara', varaHit); anchor('vara', [8.3, 0, 2.6], [1, 0, 0]); points.vara = [9.1, 1.0, 2.6];
  // coat hooks next to the door with a hat (no text)
  { const h = A('cozinha'); h.box([0.5, 0.08, 0.06], M.woodDark, [7.0, 1.8, 5.38]); h.cyl(0.14, 0.18, 0.12, 7, D('#6a5a3a', 'carpet'), [7.0, 1.92, 5.34]); }

  // ------------------------------------------------------------------ bedroom/kitchen anchors
  anchor('spawn', [2.5, 0, 2.5], [0, 0, 1]);
  anchor('cama', [2.35, 0, 1.45], [-1, 0, -0.1]); points.cama = [1.0, 0.5, 1.4];
  const camaHit = hitBox('cama', [1.5, 0.7, 2.0], [0.85, 0.4, 1.15]);
  inter('cama', 'cama', camaHit);
  // lights: bedside lamp, kitchen bulb
  const lampMeshes = {};
  const addLamp = (id, area, kind, pos, color, range, geo, opts = {}) => {
    const mesh = new T.Mesh(geo, r.glow(color)); mesh.position.set(...pos); group.add(mesh); lampMeshes[id] = mesh;
    lights.push({ id, area, kind, pos: opts.lightPos ?? [pos[0], pos[1] - 0.05, pos[2]], color, range, on: true, level: 1, pisca: opts.pisca });
  };
  addLamp('abajur', 'quarto', 'abajur', [1.95, 0.72, 0.3], '#e4a45c', 5.5, new T.CylinderGeometry(0.075, 0.098, 0.12, 8));
  addLamp('luz-cozinha', 'cozinha', 'teto', [6.0, H - 0.1, 2.7], '#f0d49a', 8.5, new T.SphereGeometry(0.08, 6, 4), { lightPos: [6.0, H - 0.25, 2.7] });
  { const l = A('cozinha'); l.cyl(0.015, 0.015, 0.12, 4, M.black, [6.0, H - 0.04, 2.7]); }
  addLamp('luz-sala', 'cozinha', 'abajur', [4.6, 1.62, 5.1], '#d89a58', 4.5, new T.CylinderGeometry(0.1, 0.17, 0.24, 8), { lightPos: [4.6, 1.5, 5.0] });

  // ------------------------------------------------------------------ street
  const poste = (id, x, z, pisca) => {
    const p = A('rua');
    p.cyl(0.06, 0.09, 5.2, 6, D('#5a5a54', 'steel'), [x, 2.6, z]); p.box([0.08, 0.08, 1.2], D('#5a5a54', 'steel'), [x, 5.15, z + 0.55]); p.box([0.3, 0.1, 0.5], D('#3a3a36', 'steel'), [x, 5.1, z + 1.05]);
    collide([x - 0.12, 0, z - 0.12], [x + 0.12, 5, z + 0.12]);
    const lamp = new T.Mesh(new T.PlaneGeometry(0.26, 0.4), r.glow('#f4d890')); lamp.rotation.x = Math.PI / 2; lamp.position.set(x, 5.04, z + 1.05); group.add(lamp); lampMeshes[id] = lamp;
    lights.push({ id, area: 'rua', kind: 'poste', pos: [x, 4.8, z + 1.05], color: '#f2d594', range: 12, on: true, level: 1, pisca });
  };
  poste('poste-1', 3.0, 6.9, false); poste('poste-2', 22.5, 6.9, true);
  // the pharmacy: fluorescent over the counter, its cross outside
  addLamp('fluorescente', 'farmacia', 'fluorescente', [17.0, H_FARM - 0.08, 2.9], '#e4eed0', 9.5, new T.BoxGeometry(1.2, 0.05, 0.14), { lightPos: [17.0, H_FARM - 0.3, 2.9] });
  addLamp('fluorescente-2', 'farmacia', 'fluorescente', [14.2, H_FARM - 0.08, 3.6], '#e4eed0', 7.5, new T.BoxGeometry(1.2, 0.05, 0.14), { lightPos: [14.2, H_FARM - 0.3, 3.6] });
  lights.push({ id: 'cruz', area: 'rua', kind: 'cruz', pos: [16.5, 3.2, 6.6], color: '#f0e2a8', range: 6, on: true, level: 1 });
  // neighbours across the street: dark fronts with two lit windows, one door
  {
    const n = A('rua');
    n.box([34, 3.6, 0.4], M.wallNeighbor, [10, 1.8, 13.7], [0, 0, 0], [3.2, 3.2]); collide([-7, 0, 13.4], [27, 3.6, 14]);
    n.box([34, 0.3, 0.7], D('#5a4a3a', 'wood'), [10, 3.7, 13.5]);
    for (const x of [-2, 4, 14, 20]) n.box([0.9, 0.9, 0.04], D('#1a1a20', null, { emissive: 0 }), [x, 1.9, 13.48]);
    for (const x of [8.5]) n.box([0.9, 0.9, 0.05], M.winLit, [x, 1.9, 13.48]);
    n.box([1.0, 2.1, 0.06], D('#4a3a2c', 'doorWood'), [1, 1.05, 13.48]);
    // a pair of hedges closing the ends of the street, and a bin by the house
    n.box([1.6, 2.2, 8.6], M.hedge, [-7.4, 1.1, 9.6]); collide([-8.2, 0, 5.3], [-6.6, 2.2, 14]);
    n.box([1.6, 2.2, 8.6], M.hedge, [27.4, 1.1, 9.6]); collide([26.6, 0, 5.3], [28.2, 2.2, 14]);
    n.cyl(0.22, 0.2, 0.7, 8, D('#566a3e', 'green'), [1.2, 0.35, 6.4]); collide([0.98, 0, 6.18], [1.42, 0.7, 6.62]);
    n.box([0.4, 0.5, 0.3], D('#8a6a48', 'wood'), [9.6, 0.25, 6.3]); collide([9.4, 0, 6.15], [9.8, 0.5, 6.45]);
    // house numbers as pictograms: three dots over the door
    for (const dx of [-0.12, 0, 0.12]) n.box([0.06, 0.06, 0.02], M.black, [8.2 + dx, 2.4, 5.62]);
  }
  // a parked car, from the posto's own model, to make the street feel lived in
  { const car = buildCar(r, { seed: seed * 3 + 2, fuel: 'comum', capSide: 'left' }); car.root.position.set(5.5, 0, 8.6); car.root.rotation.y = Math.PI / 2; car.setLights(false); group.add(car.root); props.carro = car; collide([3.3, 0, 7.5], [7.7, 1.5, 9.8]); }

  // ------------------------------------------------------------------ pharmacy interior
  {
    const f = A('farmacia');
    // counter parallel to the back wall (gap at the west end is closed by the shelf, the clerk stays behind)
    f.box([5.6, 1.0, 0.7], M.counter, [17.3, 0.5, 2.45], [0, 0, 0], [0.9, 0.9]); f.box([5.7, 0.05, 0.8], M.woodDark, [17.3, 1.025, 2.45]);
    collide([14.45, 0, 2.1], [20.15, 1.05, 2.8], { id: 'balcao' });
    // a register without digits, a little bell and a tray
    f.box([0.3, 0.22, 0.32], M.cream, [19.3, 1.17, 2.5]); f.box([0.2, 0.08, 0.04], D('#1c2a22', 'screenOff'), [19.3, 1.3, 2.6]); f.box([0.34, 0.03, 0.2], M.cream, [19.3, 1.07, 2.78]);
    f.cyl(0.05, 0.05, 0.03, 8, D('#c8a448', 'steel'), [15.1, 1.07, 2.6]); f.cyl(0.03, 0.05, 0.05, 8, D('#c8a448', 'steel'), [15.1, 1.1, 2.6]);
    f.box([0.3, 0.015, 0.2], D('#6a3a2a', 'plastic'), [17.0, 1.06, 2.7]);
    // shelves behind the counter, with plain boxes, no brand
    f.box([6.2, 2.2, 0.06], M.woodDark, [17.0, 1.1, 0.1]);
    for (const y of [0.5, 0.95, 1.4, 1.85]) f.box([6.0, 0.04, 0.36], M.shelf, [17.0, y, 0.28]);
    const cart = [M.carton1, M.carton2, M.carton3, M.boxBlue];
    for (const y of [0.5, 0.95, 1.4, 1.85]) {
      let x = 14.1;
      while (x < 19.9) { const w = 0.12 + rnd() * 0.16, h = 0.16 + rnd() * 0.18; f.box([w, h, 0.22], cart[(rnd() * 4) | 0], [x + w / 2, y + 0.02 + h / 2, 0.3]); x += w + 0.03 + rnd() * 0.04; }
    }
    collide([13.9, 0, 0.05], [20.1, 2.0, 0.5]);
    // gondola in the middle-east with plain cartons
    f.box([2.0, 1.4, 0.4], M.shelf, [19.0, 0.7, 4.55]);
    for (const y of [0.35, 0.7, 1.05, 1.4]) f.box([2.0, 0.03, 0.42], M.woodDark, [19.0, y, 4.55]);
    for (const y of [0.37, 0.72, 1.07]) { let x = 18.1; while (x < 19.9) { const w = 0.1 + rnd() * 0.14; f.box([w, 0.2 + rnd() * 0.08, 0.3], cart[(rnd() * 4) | 0], [x + w / 2, y + 0.12, 4.55]); x += w + 0.04; } }
    collide([17.95, 0, 4.3], [20.05, 1.45, 4.8]);
    // posters with the generic cross, on the east wall
    f.quad(0.5, 0.75, crossPoster, [20.44, 1.7, 3.2], [0, -Math.PI / 2, 0]); f.quad(0.5, 0.75, crossPoster, [20.44, 1.7, 2.4], [0, -Math.PI / 2, 0]);
    // a plastic chair for waiting
    f.box([0.45, 0.04, 0.45], M.boxBlue, [20.1, 0.45, 5.0]); f.box([0.04, 0.45, 0.45], M.boxBlue, [20.3, 0.68, 5.0]); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box([0.03, 0.43, 0.03], M.steel, [20.1 + dx * 0.2, 0.215, 5.0 + dz * 0.2]);
    collide([19.85, 0, 4.75], [20.4, 0.9, 5.25]);
  }
  // the battery shelf: a pegboard on the west wall, three rows of blister cards, boxes below
  {
    const f = A('farmacia'), cards = [];
    f.box([0.06, 1.5, 1.8], M.grid, [12.6, 1.4, 4.0], [0, 0, 0], [0.5, 0.5]);
    f.box([0.5, 0.04, 1.9], M.shelf, [12.8, 0.6, 4.0]); f.box([0.4, 0.04, 1.9], M.shelf, [12.75, 0.3, 4.0]);
    collide([12.5, 0, 3.0], [13.05, 2.15, 5.0], { id: 'prateleiraPilhas' });
    for (const y of [0.78, 1.2, 1.62]) for (let i = 0; i < 8; i++) {
      const z = 3.2 + i * 0.22 + (rnd() - 0.5) * 0.02;
      f.quad(0.14, 0.2, pilhaCard, [12.64, y + (rnd() - 0.5) * 0.015, z], [0, Math.PI / 2, 0]); f.box([0.02, 0.02, 0.02], M.black, [12.63, y + 0.1, z]);
    }
    for (let i = 0; i < 6; i++) f.box([0.24, 0.2 + rnd() * 0.08, 0.22], [M.carton1, M.carton2, M.carton3][i % 3], [12.82, 0.4, 3.2 + i * 0.3]);
    for (let i = 0; i < 6; i++) f.box([0.24, 0.12, 0.26], [M.carton2, M.boxBlue, M.carton3][i % 3], [12.8, 0.68, 3.15 + i * 0.3]);
    void cards;
  }
  const pilhasHit = hitBox('prateleiraPilhas', [0.5, 1.7, 1.9], [12.85, 1.2, 4.05]);
  inter('prateleiraPilhas', 'prateleira', pilhasHit); anchor('prateleiraPilhas', [14.0, 0, 4.05], [-1, 0, 0]); points.prateleiraPilhas = [12.65, 1.2, 4.0];
  // counter, clerk and the bottle
  const balcaoHit = hitBox('farmaciaBalcao', [5.6, 1.1, 0.8], [17.3, 0.55, 2.45]);
  inter('farmaciaBalcao', 'balcao', balcaoHit); anchor('farmaciaBalcao', [16.2, 0, 3.4], [0, 0, -1]); points.farmaciaBalcao = [16.2, 1.05, 2.5];
  anchor('atendente', [16.2, 0, 1.35], [0, 0, 1]);
  const atendHit = hitBox('atendente', [0.7, 1.8, 0.5], [16.2, 0.9, 1.35]);
  inter('atendente', 'atendente', atendHit, 'farmaciaBalcao');
  const frasco = placeProp(B, 'frasco', { pos: [18.2, 1.05, 2.6], ry: 0, area: 'farmacia' }); group.add(frasco.dyn); props.frasco = frasco;
  { const hit = frasco.dyn.children.find((m) => m.userData.interactId); hit.userData.interactId = 'frasco'; interactables.push({ id: 'frasco', kind: 'frasco', object3D: hit, anchor: 'frasco' }); }
  A('farmacia').box([0.16, 0.012, 0.16], D('#c8bc9c', 'plastic'), [18.2, 1.056, 2.6]);            // a small mat so it reads on the dark wood
  anchor('frasco', [18.2, 0, 3.4], [0, 0, -1]); points.frasco = [18.2, 1.1, 2.6];

  // ------------------------------------------------------------------ build everything
  B.flush(group);
  for (const l of lights) if (l.fixture) Object.defineProperty(l, 'fixture', { value: l.fixture, enumerable: false });

  // ------------------------------------------------------------------ update
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const levelOf = (l, t) => {
    if (!l.on) return 0;
    if (!l.pisca) return 1;
    const slot = Math.floor(t * 9), h = hash(slot + l.id.length * 13);
    return h > 0.86 ? 0.15 + hash(slot * 3 + 1) * 0.35 : 1;
  };
  function update(t, state = {}) {
    for (const l of lights) {
      if (l === ledLight) continue;
      l.level = levelOf(l, t);
      const m = lampMeshes[l.id]; if (m) m.visible = l.level > 0.05;
    }
    // the answering machine: n blinks, then a pause (state.recados = n); quiet at 0
    const n = Math.max(0, Math.floor(state.recados ?? 0)), cyc = n * 0.6 + 1.6, ph = ((t % cyc) + cyc) % cyc;
    const lit = n > 0 && ph < n * 0.6 && (ph % 0.6) < 0.3;
    led.visible = lit; ledLight.level = lit ? 1 : 0;
    // ring: the handset trembles
    const ring = Boolean(state.telefoneToca), s = ring ? Math.sin(t * 38) : 0;
    handset.position.y = 0.81 + (ring ? 0.006 * Math.abs(s) : 0); handset.rotation.z = ring ? 0.03 * s : 0;
    sticker.visible = (state.adesivoGeladeira ?? 0) > 0;
    frasco.dyn.visible = state.frascoVisivel !== false;
    for (const id in doors) {
      const d = doors[id], k = state.doors?.[id] ?? 0;
      d.extras.setOpen?.(k); d.collider.enabled = k < 0.5;
    }
    for (const u of updaters) u?.(t, state);
  }
  update(0, {});

  return {
    group, anchors, colliders, lights, interactables, areas, areaAt, update,
    doors, props, points, size: { x0: -8, x1: 28, z0: -6, z1: 14 },
    /** a lighting suggestion for the render: a night with a dim blue ambient and warm lamps */
    mood: { ambient: '#4a4e64', key: '#2a3046', fog: '#080a12', fogNear: 14, fogFar: 52 },
    /** the interactable under a raycast hit (walks up the parents) */
    interactableOf(obj) { for (let o = obj; o; o = o.parent) if (o.userData?.interactId) return interactables.find((i) => i.id === o.userData.interactId) ?? null; return null; },
    seedInfo: { seed, darkness },
  };
}
