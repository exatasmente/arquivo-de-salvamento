// The Posto Bom Dia at night: the eight areas of the map in one continuous space, human scale
// (doors 2.1 m, counter 1.0 m, eyes at 1.65 m). World: x east, z south, y up. Highway to the north (z < -26).
//
// buildPosto(r, { seed, darkness }) -> { group, anchors, colliders, lights, interactables, areas, update(t, state), ... }
//  - anchors: name -> { pos: [x, y, z], dir: [x, y, z] }.
//  - colliders: [{ min, max, id? }]. Doors carry `door: id` and `enabled` (false while the door is open).
//  - lights: [{ id, area, kind, pos, color, range, on, level, pisca? }]. The LightingSystem chooses which are on;
//    `level` (0..1) is written by update (flicker) and scales the point light as well as the lamp's glow.
//  - interactables: [{ id, kind, object3D, anchor }]; object3D is a mesh the ray can hit (userData.interactId).
//  - areas: id -> { id, min, max, perigo, luz, tint }. areaAt(x, z) tells where a point is.
//  - update(t, state): pure function of time and state. State read: placaSorriso (0..1), doors { id: 0..1 },
//    sino (time of the last ring), gaveta (0..1), telefoneToca, hora (clock hours), quadroAberto, disjuntores.
//  - extras: pumps[1..4] { setDisplay, nozzles, nozzleAnchors, valve { setAngle(rad) }, setJammed(bool) }, shelves[], boxes[], cars, doors,
//    props, seedInfo. Phase 2 (night work): cart, ladder, breakers, bins, bag, stains, lampIds, setBurnt(id, bool), setDirt(id, k),
//    setFull(id, bool); the shelf behind the counter is in `shelves` (ids `atras-<tipo>`).
//  Phase 3 (what the hallucinations change; see "Phase 3" below the header for the details):
//    pumps[n].keypad, shelves[i].setVintage(bool), cups.setCount(0..2), stickers.show(id, bool), displace(id, offset, ry),
//    mirrors[id] { mesh, setTexture(tex) }, props.armario.setOpen(0..1), props.frasco.setVisible(bool), props.cafeteira.setBrewing(bool).
//
// Phase 3 handles (all pure functions of what the game tells them; nothing reads a clock or Math.random):
//  - pumps[n].keypad: { root (interactable 'teclado<n>', kind 'teclado'), keys { '0'..'9', cancelar, ligar -> hit mesh with userData
//    { interactId: 'teclado<n>', kind: 'teclado', tecla } }, ids, setPressed(key, bool), pressed, setLed(bool), ledOn,
//    keyOf(object) -> key | null, keyAtRay(origin, dir, far) -> key | null, worldPos(key) }. Anchor 'teclado<n>' (where to stand).
//    pumps[n].setDisplay(text) shows five digits (up to 999,99); ',' and '.' attach to the digit before them.
//  - shelves[i].setVintage(bool) / .vintage: the row's products become the packaging of 1998 (the shelf behind the counter ignores it).
//  - cups.setCount(0..2) / .count: Sun paper cups on the counter (anchors copoBalcao1 and copoBalcao2).
//  - stickers.show(id, bool) / .shown(id) / .ids / .hideAll(): ids porta-estoque, porta-banheiro-m, porta-banheiro-f, geladeira1,
//    geladeira2, monitor, espelho-m1, espelho-m2, espelho-f1, espelho-f2; aliases geladeira (= geladeira1), porta-banheiro (both), espelho (all four).
//  - displace(id, [dx, dy, dz], ry = 0) -> bool: moves a loose object from its place by a world offset (and turns it by ry).
//    ids in displaceIds: cadeira, balde, rodo, produto (a bottle on top of the first gondola), escada. [0, 0, 0] puts it back; displaced(id).
//  - mirrors[id] (espelho-m1, espelho-m2, espelho-f1, espelho-f2): { mesh, setTexture(tex | canvas | null), setFlipX(bool), center(), normal(), w, h }.
//  - props.armario: setOpen(0..1) / .open (two doors); props.frasco: setVisible(bool) / .visible (the white bottle on the shelf inside;
//    interactable 'frasco', anchors 'armario' and 'frasco'); props.cafeteira.setBrewing(bool) / .brewing.
// The dark of the risk areas is in the material colour (the shader has no vertex colour): `darkness` 0..1
// scales how much each area is darkened (1 = as designed).
import { D, FUEL_KEYS, createBuilder, mulberry32 } from './paint.js';
import { placeProp, boxFaces, PRODUTO_TIPOS, BREAKERS } from '../models/props.js';
import { createEntities } from '../../vendor/engine/entities.js';
import { ENTITY_TYPES, buildEntity } from '../entities.js';

// The layout of the scene: every object the posto puts in the world is a line of data/scenes/posto.json
// ({ id, type, pos, rot, scale, params }); this file keeps the structure (floor, walls, canopy, areas, the one-off geometry),
// builds the entities from the layout and wires them to the game (anchors, colliders, interactables, handles).
// Top-level await: the module is ready once the file is read, so buildPosto stays synchronous for its callers.
const LAYOUT = await (await fetch(new URL('../../data/scenes/posto.json', import.meta.url))).json();

const H_IN = 3.0, H_OUT = 3.2, CANOPY_Y = 4.0;

// [x0, z0, x1, z1]
const AREA_DEFS = {
  banheiroM: { r: [16, 3, 20, 9], perigo: 'alto', tint: 0.68, luz: 'fraca, interruptor por fora', sub: 'banheiros' },
  banheiroF: { r: [20, 3, 24, 9], perigo: 'alto', tint: 0.68, luz: 'fraca, interruptor por fora', sub: 'banheiros' },
  deposito: { r: [21, 14, 24, 20], perigo: 'alto', tint: 0.45, luz: 'nenhuma; lanterna', sub: 'servico' },
  loja: { r: [2, 3, 16, 12], perigo: 'baixo', tint: 1.0, luz: 'fluorescente forte, uma lâmpada que pisca' },
  estoque: { r: [9, 12, 17, 20], perigo: 'alto', tint: 0.62, luz: 'uma lâmpada que falha: lanterna' },
  escritorio: { r: [2, 12, 9, 20], perigo: 'baixo', tint: 0.9, luz: 'luminária de mesa' },
  servico: { r: [17, 12, 24, 20], perigo: 'alto', tint: 0.5, luz: 'nenhuma; lanterna' },
  banheiros: { r: [16, 3, 24, 12], perigo: 'alto', tint: 0.68, luz: 'fraca, interruptor por fora' },
  bombas: { r: [-1, -13, 25, 3], perigo: 'medio', tint: 0.9, luz: 'luminárias da cobertura' },
  estacionamento: { r: [-26, -13, -1, 24], perigo: 'alto', tint: 0.6, luz: 'um poste' },
  externa: { r: [-45, -48, 45, 40], perigo: 'maximo', tint: 0.55, luz: 'nenhuma, só a placa' },
};
const ORDER = ['banheiroM', 'banheiroF', 'deposito', 'loja', 'estoque', 'escritorio', 'servico', 'banheiros', 'bombas', 'estacionamento', 'externa'];
export const AREA_INFO = AREA_DEFS;

const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const toW = (p, ry, lx, ly, lz) => [p[0] + lx * Math.cos(ry) + lz * Math.sin(ry), p[1] + ly, p[2] - lx * Math.sin(ry) + lz * Math.cos(ry)];
const dirW = (ry, lx, lz) => [lx * Math.cos(ry) + lz * Math.sin(ry), 0, -lx * Math.sin(ry) + lz * Math.cos(ry)];

/** Fit the axis-aligned collider `col` around a local footprint [x0, z0, x1, z1] of `obj` (rotated by its yaw), `h` tall. */
function fitBox(col, obj, [x0, z0, x1, z1], h) {
  const ry = obj.rotation.y, p = obj.position;
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const [lx, lz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
    const w = toW([p.x, 0, p.z], ry, lx, 0, lz);
    lo = [Math.min(lo[0], w[0]), Math.min(lo[1], w[2])]; hi = [Math.max(hi[0], w[0]), Math.max(hi[1], w[2])];
  }
  col.min = [lo[0], 0, lo[1]]; col.max = [hi[0], h, hi[1]];
}

export function buildPosto(r, { seed = 1, darkness = 1, layout = LAYOUT, editor } = {}) {
  const T = r.THREE, rnd = mulberry32(seed * 7919 + 101);
  const group = new T.Group(); group.name = 'posto';
  const tintOf = (a) => { const t = AREA_DEFS[a]?.tint ?? 1; return 1 - (1 - t) * darkness; };
  const B = createBuilder(r, { tint: tintOf });
  const C = B.ctx({ area: 'externa' }); // free-standing parts of the shell
  const anchors = {}, colliders = [], lights = [], interactables = [], updaters = [], props = {}, doors = {}, shelves = [], boxes = [], pumps = [];
  const stickerReg = {}, mirrors = {};
  const regSticker = (id, list) => { if (list?.length) stickerReg[id] = list; };
  const areaBox = (a) => { const [x0, z0, x1, z1] = AREA_DEFS[a].r; return { id: a, min: [x0, 0, z0], max: [x1, a === 'bombas' ? CANOPY_Y : H_IN, z1], perigo: AREA_DEFS[a].perigo, luz: AREA_DEFS[a].luz, tint: tintOf(a) }; };
  const areas = {};
  for (const a of ORDER) areas[a] = areaBox(a);
  areas.externa.max[1] = 40;
  const areaAt = (x, z) => {
    for (const a of ORDER) { const [x0, z0, x1, z1] = AREA_DEFS[a].r; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return a; }
    return 'externa';
  };

  // ---- the layout: X(id) builds the entity on first use (so the draw order stays the one the wiring asks for) and
  // returns what placeProp returned; EP(id) is its position; PR(id) its params; AT(id, dx, dy, dz) a point relative to it.
  // The editor mode builds every entity into a group of its own (pickable, replaceable); the game merges them.
  const editorMode = editor ?? (typeof location !== 'undefined' && new URLSearchParams(location.search).has('editor'));
  const kit = { builder: editorMode ? null : B, seed, areaAt, tintOf };
  let ready = false; // the wiring below pushes lights in its own order; after that, a rebuilt entity (editor) keeps its light in step
  const ents = createEntities({
    r, group, types: ENTITY_TYPES, layout, editor: editorMode,
    build: (e) => buildEntity(r, kit, e),
    onBuilt(id, m) {
      if (!ready) return;
      for (const l of m.lights) {
        const i = lights.findIndex((q) => q.id === l.id);
        if (i >= 0) { Object.assign(lights[i], { pos: l.pos, color: l.color, range: l.range, on: l.on, kind: l.kind, area: l.area }); Object.defineProperty(lights[i], 'fixture', { value: l.fixture, enumerable: false, configurable: true }); }
        else { Object.defineProperty(l, 'fixture', { value: l.fixture, enumerable: false }); lights.push(l); }
      }
    },
    onRemoved(id, m) { for (let i = lights.length - 1; i >= 0; i--) if (m.lights.includes(lights[i]) || lights[i].id === id) lights.splice(i, 1); },
  });
  const made = ents.made;
  const X = (id) => ents.X(id).ph;
  const EP = (id) => ents.pos(id);
  const EY = (id) => ents.entity(id).rot?.[1] ?? 0;
  const PR = (id) => ents.params(id);
  const AT = (id, dx = 0, dy = 0, dz = 0) => { const q = EP(id); return [q[0] + dx, q[1] + dy, q[2] + dz]; };
  /** the collider an entity's type declares, pushed with extras */
  const colOf = (id, extra = {}) => { X(id); for (const c of made[id].colliders) collide(c.min, c.max, extra); };
  /** the light of a lamp entity (the fixture rides along, hidden from enumeration at the end) */
  const lampLight = (id) => { X(id); return made[id].lights[0]; };
  const anchor = (name, pos, dir = [0, 0, -1]) => { anchors[name] = { pos, dir: unit(dir) }; };
  const collide = (min, max, extra = {}) => colliders.push({ min, max, ...extra });
  const inter = (id, kind, object3D, anchorName) => { object3D.userData.interactId = id; interactables.push({ id, kind, object3D, anchor: anchorName }); };

  // floor stains: each has setDirt(0..1) (0 = clean, it shrinks and fades as it goes) and starts clean
  const stains = {};
  const addStain = (id, anchorName) => {
    const st = X(id), pos = EP(id), area = made[id].area, side = Number(PR(id).lado); st.setDirt(0);
    inter(id, 'mancha', st.hit, id); anchor(id, [pos[0], 0, pos[2] + 0.9 * side], [0, 0, -side]);  // where to stand: `lado` picks the open side
    stains[id] = { id, area, anchor: id, near: anchorName, root: st.dyn, setDirt: st.setDirt, get dirt() { return st.dirt; } };
    props[id] = st;
  };

  // materials
  const M = {
    wall: D('#ffffff', 'wall'), wallIn: D('#ffffff', 'wallIn'), wallDark: D('#ffffff', 'wallDark'), tileWall: D('#ffffff', 'tileWall'),
    tileStore: D('#ffffff', 'tileStore'), tileBath: D('#ffffff', 'tileBath'), concrete: D('#ffffff', 'concrete'), carpet: D('#ffffff', 'carpet'),
    ceiling: D('#ffffff', 'ceiling'), asphalt: D('#ffffff', 'asphalt'), road: D('#ffffff', 'road'), gravel: D('#ffffff', 'gravel'), grass: D('#ffffff', 'grass'),
    band: D('#ffffff', 'canopyBand'), under: D('#ffffff', 'canopyUnder'), column: D('#ffffff', 'column'), curb: D('#ffffff', 'curb'),
    lineW: D('#ffffff', 'lineW'), lineY: D('#ffffff', 'lineY'), fence: D('#ffffff', 'fence', { side: 2 }), sol: D('#ffffff', 'solSticker'),
    caixas: D('#ffffff', 'caixas'), wood: D('#ffffff', 'wood'), cardboard: D('#ffffff', 'cardboard'), paperSol: D('#ffffff', 'paperSol', { side: 2 }),
    trunk: D('#5a4632', 'wood'), pine: D('#ffffff', 'grass'), steel: D('#ffffff', 'steel'), frame: D('#6a4a30', 'plastic'),
  };

  // ------------------------------------------------------------------ ground, road, sky edge
  const flat = (x0, z0, x1, z1, y, d, tile, area, up = true, step = 3) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz), uv = g.attributes.uv, p = g.attributes.position;
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + (x1 - x0) / 2 + x0) / tile[0], (p.getZ(i) + (z1 - z0) / 2 + z0) / tile[1]);
    const c = B.ctx({ area });
    c.geo(g, d, [(x0 + x1) / 2, y, (z0 + z1) / 2]);
  };
  flat(-45, -48, 45, -36, 0, M.grass, [3, 3], 'externa', true, 8);
  flat(-45, -36, 45, -26, 0, M.road, [4, 4], 'externa', true, 8);
  flat(-45, -26, 45, -22, 0, M.gravel, [3, 3], 'externa', true, 8);
  flat(-45, -22, -26, 40, 0, M.grass, [3, 3], 'externa', true, 8); flat(28, -22, 45, 40, 0, M.grass, [3, 3], 'externa', true, 8);
  flat(-26, 24, 28, 40, 0, M.grass, [3, 3], 'externa', true, 8);
  for (const [x0, z0, x1, z1, a] of [[-26, -22, 28, -13, 'externa'], [-26, -13, -1, 24, 'estacionamento'], [-1, -13, 25, 0, 'bombas'], [25, -13, 28, 24, 'externa'],
    [-1, 0, 25, 2.9, 'bombas'], [-1, 2.9, 1.9, 20.1, 'estacionamento'], [24.1, 2.9, 25, 20.1, 'externa'], [-1, 20.1, 25, 24, 'externa']]) flat(x0, z0, x1, z1, 0, M.asphalt, [2.6, 2.6], a, true, 4);
  // road marks
  const mark = (x, z, w, d, mat, area = 'externa') => B.ctx({ area }).quad(w, d, mat, [x, 0.012, z], [-Math.PI / 2, 0, 0]);
  for (let x = -42; x < 44; x += 6) mark(x, -31, 2.4, 0.16, M.lineY);
  mark(0, -26.5, 90, 0.18, M.lineW); mark(0, -35.5, 90, 0.18, M.lineW);
  // lot edge curb with the entry and exit open
  for (const [x0, x1] of [[-26, -5], [4, 20]]) C.box([x1 - x0, 0.14, 0.3], M.curb, [(x0 + x1) / 2, 0.07, -22.15], [0, 0, 0], [0.8, 0.8]);

  // ------------------------------------------------------------------ walls
  // wall({ axis:'x'|'z', at, a, b, lo, hi, matLo, matHi, openings:[{c,w,top,sill,kind}] }): two skins of 0.1 m, tinted by the room on each side
  function wall({ axis, at, a, b, lo, hi, matLo, matHi, hLo = H_IN, hHi = H_IN, openings = [] }) {
    const ops = openings.filter((o) => o.c - o.w / 2 >= a - 1e-6 && o.c + o.w / 2 <= b + 1e-6).sort((p, q) => p.c - q.c);
    for (const [off, area, mat, h] of [[-0.05, lo, matLo, hLo], [0.05, hi, matHi, hHi]]) {
      const c = B.ctx({ area }), put = (s0, s1, y0, y1) => {
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
    // collider: the whole run, cut only at doors
    let cur = a;
    const col = (s0, s1) => { if (s1 - s0 < 1e-3) return; collide(axis === 'x' ? [s0, 0, at - 0.1] : [at - 0.1, 0, s0], axis === 'x' ? [s1, Math.max(hLo, hHi), at + 0.1] : [at + 0.1, Math.max(hLo, hHi), s1]); };
    for (const o of ops.filter((q) => q.kind === 'door')) { col(cur, o.c - o.w / 2); cur = o.c + o.w / 2; }
    col(cur, b);
    // glass in the windows (translucent, a loose mesh each)
    for (const o of ops.filter((q) => q.kind === 'janela')) {
      const w = o.w, h = (o.top ?? 2.3) - o.sill;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), r.mat('#4a6478', { transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
      m.position.set(axis === 'x' ? o.c : at, o.sill + h / 2, axis === 'x' ? at : o.c); if (axis === 'z') m.rotation.y = Math.PI / 2; m.renderOrder = 2; group.add(m);
      const fc = B.ctx({ area: lo }); // frame
      const fsz = axis === 'x' ? [w + 0.08, 0.06, 0.16] : [0.16, 0.06, w + 0.08];
      fc.box(fsz, M.frame, axis === 'x' ? [o.c, o.sill - 0.01, at] : [at, o.sill - 0.01, o.c]);
    }
  }
  const dr = (c, w = 0.95, extra = {}) => ({ c, w, top: 2.1, kind: 'door', ...extra });
  const win = (c, w, sill = 1.0, top = 2.3) => ({ c, w, sill, top, kind: 'janela' });

  // exterior (outer skin tinted by what is outside)
  const NW = [dr(9, 1.2), win(5.2, 3.4), win(13.0, 4.4), dr(18), dr(22)];
  wall({ axis: 'x', at: 3, a: 1.9, b: 16, lo: 'bombas', hi: 'loja', matLo: M.wall, matHi: M.wallIn, hLo: H_OUT, openings: NW });
  wall({ axis: 'x', at: 3, a: 16, b: 24.1, lo: 'bombas', hi: 'banheiros', matLo: M.wall, matHi: M.tileWall, hLo: H_OUT, openings: NW });
  const SW = [dr(19, 1.0)];
  wall({ axis: 'x', at: 20, a: 1.9, b: 9, lo: 'escritorio', hi: 'externa', matLo: M.wallIn, matHi: M.wall, hHi: H_OUT, openings: SW });
  wall({ axis: 'x', at: 20, a: 9, b: 17, lo: 'estoque', hi: 'externa', matLo: M.wallDark, matHi: M.wall, hHi: H_OUT, openings: SW });
  wall({ axis: 'x', at: 20, a: 17, b: 24.1, lo: 'servico', hi: 'externa', matLo: M.wallDark, matHi: M.wall, hHi: H_OUT, openings: SW });
  const WW = [win(15.75, 2.4, 1.1, 2.2)];
  wall({ axis: 'z', at: 2, a: 2.9, b: 12, lo: 'estacionamento', hi: 'loja', matLo: M.wall, matHi: M.wallIn, hLo: H_OUT, openings: WW });
  wall({ axis: 'z', at: 2, a: 12, b: 20.1, lo: 'estacionamento', hi: 'escritorio', matLo: M.wall, matHi: M.wallIn, hLo: H_OUT, openings: WW });
  wall({ axis: 'z', at: 24, a: 2.9, b: 12, lo: 'banheiros', hi: 'externa', matLo: M.tileWall, matHi: M.wall, hHi: H_OUT });
  wall({ axis: 'z', at: 24, a: 12, b: 20.1, lo: 'servico', hi: 'externa', matLo: M.wallDark, matHi: M.wall, hHi: H_OUT });
  // interior
  wall({ axis: 'x', at: 12, a: 1.9, b: 9, lo: 'loja', hi: 'escritorio', matLo: M.wallIn, matHi: M.wallIn, openings: [dr(5), dr(13, 1.0)] });
  wall({ axis: 'x', at: 12, a: 9, b: 16, lo: 'loja', hi: 'estoque', matLo: M.wallIn, matHi: M.wallDark, openings: [dr(5), dr(13, 1.0)] });
  wall({ axis: 'x', at: 12, a: 16, b: 17, lo: 'banheiros', hi: 'estoque', matLo: M.tileWall, matHi: M.wallDark });
  wall({ axis: 'x', at: 12, a: 17, b: 24.1, lo: 'banheiros', hi: 'servico', matLo: M.tileWall, matHi: M.wallDark });
  wall({ axis: 'z', at: 16, a: 3, b: 12.1, lo: 'loja', hi: 'banheiros', matLo: M.wallIn, matHi: M.tileWall, openings: [dr(10.5, 0.9)] });
  wall({ axis: 'z', at: 20, a: 2.9, b: 9, lo: 'banheiroM', hi: 'banheiroF', matLo: M.tileWall, matHi: M.tileWall });
  wall({ axis: 'x', at: 9, a: 16, b: 24.1, lo: 'banheiros', hi: 'banheiros', matLo: M.tileWall, matHi: M.wallDark });
  wall({ axis: 'z', at: 9, a: 12, b: 20.1, lo: 'escritorio', hi: 'estoque', matLo: M.wallIn, matHi: M.wallDark, openings: [dr(16)] });
  wall({ axis: 'z', at: 17, a: 12, b: 20.1, lo: 'estoque', hi: 'servico', matLo: M.wallDark, matHi: M.wallDark, openings: [dr(16)] });
  wall({ axis: 'z', at: 21, a: 14, b: 20.1, lo: 'servico', hi: 'deposito', matLo: M.wallDark, matHi: M.wallDark, openings: [dr(17.5)] });
  wall({ axis: 'x', at: 14, a: 21, b: 24.1, lo: 'servico', hi: 'deposito', matLo: M.wallDark, matHi: M.wallDark });

  // floors and ceilings
  const floors = [['loja', 2, 3, 16, 12, M.tileStore, [2.6, 2.6]], ['banheiroM', 16, 3, 20, 9, M.tileBath, [1.3, 1.3]], ['banheiroF', 20, 3, 24, 9, M.tileBath, [1.3, 1.3]],
    ['banheiros', 16, 9, 24, 12, M.concrete, [2.6, 2.6]], ['escritorio', 2, 12, 9, 20, M.carpet, [1.6, 1.6]], ['estoque', 9, 12, 17, 20, M.concrete, [2.6, 2.6]],
    ['servico', 17, 12, 21, 20, M.concrete, [2.6, 2.6]], ['servico', 21, 12, 24, 14, M.concrete, [2.6, 2.6]], ['deposito', 21, 14, 24, 20, M.concrete, [2.6, 2.6]]];
  for (const [a, x0, z0, x1, z1, mat, tile] of floors) { flat(x0, z0, x1, z1, 0.005, mat, tile, a, true, 2); flat(x0, z0, x1, z1, H_IN, M.ceiling, [1.3, 1.3], a, false, 1.5); }
  C.box([22.4, 0.2, 17.4], M.concrete, [13, H_IN + 0.1, 11.5], [0, 0, 0], [2.6, 2.6]);
  // front fascia above the facade, with the Sun
  C.box([22.4, 0.5, 0.3], M.band, [13, 3.4, 2.8], [0, 0, 0], [0.8, 0.8]);
  for (const x of [5, 13, 21]) C.quad(0.5, 0.5, M.sol, [x, 3.4, 2.652], [0, Math.PI, 0]);

  // ------------------------------------------------------------------ canopy and pumps
  flat(-1, -13, 25, 0, CANOPY_Y, M.under, [2.6, 2.6], 'bombas', false, 1.2);
  C.box([26, 0.5, 13], M.band, [12, CANOPY_Y + 0.26, -6.5], [0, 0, 0], [1, 1]);
  for (const z of [-13.05, 0.05]) C.box([26.2, 0.9, 0.12], M.band, [12, CANOPY_Y + 0.1, z], [0, 0, 0], [0.8, 0.8]);
  for (const x of [-1.05, 25.05]) C.box([0.12, 0.9, 13.1], M.band, [x, CANOPY_Y + 0.1, -6.5], [0, 0, 0], [0.8, 0.8]);
  for (const x of [5, 12, 19]) { C.quad(0.8, 0.8, M.sol, [x, CANOPY_Y + 0.1, 0.115], [0, 0, 0]); C.quad(0.8, 0.8, M.sol, [x, CANOPY_Y + 0.1, -13.115], [0, Math.PI, 0]); }
  const cb = B.ctx({ area: 'bombas' });
  for (const x of [0.4, 12, 24.6]) for (const z of [-12.2, -0.8]) {
    cb.box([0.4, CANOPY_Y, 0.4], M.column, [x, CANOPY_Y / 2, z], [0, 0, 0], [0.6, 0.6]);
    collide([x - 0.2, 0, z - 0.2], [x + 0.2, CANOPY_Y, z + 0.2]);
  }
  const ISL_Y = 0.15;
  for (const [cx, w] of [[6, 9], [17, 10]]) {
    cb.box([w, ISL_Y, 1.3], M.curb, [cx, ISL_Y / 2, -8.0], [0, 0, 0], [0.8, 0.8]);
    cb.box([w - 0.2, 0.01, 1.1], M.concrete, [cx, ISL_Y + 0.005, -8.0], [0, 0, 0], [1, 1]);
    collide([cx - w / 2, 0, -8.65], [cx + w / 2, 1.0, -7.35]);
  }
  ['bomba1', 'bomba2', 'bomba3', 'bomba4'].forEach((bid, i) => {
    const n = i + 1, pump = X(bid), [x, ISL_Y, PUMP_Z] = EP(bid);
    if (PR(bid).travada) pump.setJammed(true);
    colOf(bid, { id: 'bomba' + n });
    anchor('bomba' + n, [x, 0, -6.55], [0, 0, -1]);
    const nz = {};
    FUEL_KEYS.forEach((k) => {
      const l = pump.nozzleAt[k]; if (!l) return; // a pump may leave a fuel out
      const w = [x + l[0], ISL_Y + l[1], PUMP_Z + l[2]];
      anchor(`bico${n}-${k}`, w, [0, 0, 1]); nz[k] = anchors[`bico${n}-${k}`];
      inter(`bico${n}-${k}`, 'bico', pump.nozzles[k], `bico${n}-${k}`);
    });
    const hit = pump.dyn.children.find((m) => m.userData.interactId === 'bomba');
    hit.userData.interactId = 'bomba' + n; interactables.push({ id: 'bomba' + n, kind: 'bomba', object3D: hit, anchor: 'bomba' + n });
    inter('mostrador' + n, 'mostrador', pump.displayMesh, 'bomba' + n);
    anchor('mostrador' + n, [x - 0.22, ISL_Y + 1.45, PUMP_Z + 0.5], [0, 0, 1]);
    inter('teclado' + n, 'teclado', pump.keypad.root, 'teclado' + n);
    anchor('teclado' + n, [x + 0.36, 0, -6.55], [0, 0, -1]);
    // the car lane on the south side: the cap side (left = +x) faces the pump when the car looks east
    anchor('carroBomba' + n, [x + (i % 2 ? -0.5 : 0.5), 0, -4.8], [1, 0, 0]);
    anchor(`carroBomba${n}-r`, [x + (i % 2 ? 0.5 : -0.5), 0, -4.8], [-1, 0, 0]);
    inter('registro' + n, 'registro', pump.valve.hit, 'registro' + n);
    anchor('registro' + n, [x, 0, -6.55], [0, 0, -1]);
    pumps[n] = { n, setDisplay: pump.setDisplay, display: pump.display, keypad: pump.keypad, nozzles: pump.nozzles, nozzleAnchors: nz, root: pump.dyn, valve: pump.valve, setJammed: pump.setJammed, get jammed() { return pump.jammed; } };
    props['bomba' + n] = pump;
    if (n === 4) { // the badge hangs from the luminaire over pump 4
      const ck = X('cracha');
      inter('cracha', 'cracha', ck.dyn.children.find((m) => m.userData.interactId), 'crachaBomba4'); updaters.push(ck.update); props.cracha = ck;
      anchor('crachaBomba4', [EP('cracha')[0], 0, -6.55], [0, 0.6, -1]);
    }
    // luminaire under the canopy
    lights.push(lampLight('cobertura' + n));
  });
  const bins = {};
  const addBin = (id, lx, anchorName) => {
    inter(id, 'lixeira', lx.dyn.children.find((m) => m.userData.interactId), anchorName);
    bins[id] = { id, anchor: anchorName, root: lx.dyn, bag: lx.bag, setFull: lx.setFull, get full() { return lx.full; } };
  };
  for (const n of [1, 2, 3, 4]) {
    const lx = X('lixeira' + n);
    addBin('lixeira' + n, lx, 'bomba' + n);
    colOf('lixeira' + n);
  }
  const cal = X('calibrador');
  inter('calibrador', 'calibrador', cal.dyn.children.find((m) => m.userData.interactId), 'calibrador'); anchor('calibrador', AT('calibrador', -1.1, 0, 0), [1, 0, 0]);
  colOf('calibrador');

  // ------------------------------------------------------------------ doors
  const DOORS = ['porta-loja', 'porta-escritorio', 'porta-estoque', 'porta-estoque-escritorio', 'porta-estoque-servico', 'porta-fundos', 'porta-deposito', 'porta-banheiro-m', 'porta-banheiro-f', 'porta-dml'];
  for (const id of DOORS) {
    const [x, , z] = EP(id), ry = EY(id), w = PR(id).largura;
    const d = X(id);
    regSticker(id, d.sticker);
    const col = ry ? { min: [x - 0.12, 0, z - w / 2], max: [x + 0.12, 2.1, z + w / 2] } : { min: [x - w / 2, 0, z - 0.12], max: [x + w / 2, 2.1, z + 0.12] };
    const cobj = { ...col, door: id, enabled: true }; colliders.push(cobj);
    doors[id] = { id, extras: d, collider: cobj, trancada: PR(id).trancada, aberta: PR(id).aberta };
    d.hit.userData.interactId = id;
    inter(id, 'porta', d.hit, id);
    const side = ry ? [1, 0, 0] : [0, 0, 1];
    anchor(id, [x - (ry ? 0.8 : 0), 0, z - (ry ? 0 : 0.8)], side);
  }
  doors['porta-loja'].collider.glass = true;

  // ------------------------------------------------------------------ the store
  const L = 'loja';
  // counter
  const bal = X('balcao');
  inter('balcao', 'balcao', bal.dyn.children.find((m) => m.userData.interactId), 'balcao');
  colOf('balcao');
  const cash = X('caixa'), lei = X('leitor');
  inter('caixa', 'caixa-registradora', cash.dyn.children.find((m) => m.userData.interactId), 'caixa');
  inter('gaveta', 'gaveta', cash.gaveta, 'caixa');
  inter('leitor', 'leitor', lei.dyn.children.find((m) => m.userData.interactId), 'leitor');
  props.caixa = cash; props.leitor = lei; updaters.push(lei.update);
  anchor('balcao', AT('balcao', -0.05, 0, -1.2), [0, 0, 1]); anchor('caixa', AT('caixa', 0, -1.0, 0.9), [0, 0, -1]); anchor('leitor', AT('leitor', 0, -1.0, 1.15), [0, 0, -1]);
  anchor('copoBalcao1', [11.2, 1.0, 8.35]); anchor('copoBalcao2', [11.5, 1.0, 8.35]);
  anchor('esconderijo4', AT('balcao', -0.75, 0, 0.9), [0, 0, -1]);
  const hb = new T.Mesh(new T.BoxGeometry(1.4, 1.0, 0.9), new T.MeshBasicMaterial({ visible: false })); hb.position.set(...AT('balcao', -0.75, 0.5, 0.8)); group.add(hb);
  inter('esconderijo4', 'esconderijo', hb, 'esconderijo4');
  // coffee corner on the east wall
  const side = X('balcao-cafe');
  colOf('balcao-cafe');
  const caf = X('cafeteira');
  inter('cafeteira', 'cafeteira', caf.dyn.children.find((m) => m.userData.interactId), 'cafeteira');
  inter('copo-cafeteira', 'copo', caf.copo, 'cafeteira'); props.cafeteira = caf; updaters.push(caf.update);
  // two Sun cups on the counter, there only when a hallucination puts them there
  const cupList = ['copo1', 'copo2'].map((cid) => { const cp = X(cid); cp.dyn.visible = false; return cp; });
  const cups = { list: cupList, count: 0, setCount(n) { cups.count = Math.max(0, Math.min(2, n | 0)); cupList.forEach((cp, i) => { cp.dyn.visible = i < cups.count; }); } };
  anchor('cafeteira', AT('cafeteira', -1.05, -1.0, 0), [1, 0, 0]);
  // fridges on the west wall (one collider round both)
  [1, 2].forEach((k) => {
    const gid = 'geladeira' + k, g = X(gid);
    inter(gid, 'geladeira', g.dyn.children.find((m) => m.userData.interactId), gid); updaters.push(g.update);
    anchor(gid, AT(gid, 1.6, 0, 0), [-1, 0, 0]); props[gid] = g; regSticker(gid, g.sticker);
  });
  { const a = made.geladeira1.colliders[0], b = made.geladeira2.colliders[0]; collide([Math.min(a.min[0], b.min[0]), 0, Math.min(a.min[2], b.min[2])], [Math.max(a.max[0], b.max[0]), 2.0, Math.max(a.max[2], b.max[2])]); }
  // shelves: two gondolas and wall units. Each row is an interactable with setStock().
  let shelfN = 0;
  const addShelf = (sid) => {
    const s = X(sid), pos = EP(sid), ry = EY(sid);
    colOf(sid);
    for (const row of s.rows) {
      const n = ++shelfN, id = 'prateleira' + n;
      const at = toW(pos, ry, ...row.localAt), dir = dirW(ry, row.localDir[0], row.localDir[2]);
      anchor(id, [at[0], 0, at[2]], dir);
      row.hit.userData.interactId = id; inter(id, 'prateleira', row.hit, id);
      shelves.push({ id, n, tipo: row.tipo, slots: row.slots, get stock() { return row.stock; }, setStock: row.setStock, setVintage: row.setVintage, get vintage() { return row.vintage; }, mesh: row.mesh, hit: row.hit, face: row.face, nivel: row.nivel });
    }
    return s;
  };
  for (const sid of ['gondola1', 'gondola2', 'prateleira-parede1', 'prateleira-parede2', 'prateleira-parede3']) addShelf(sid);
  // shelf behind the counter: what a customer asks the clerk for (batteries, motor oil, a phone charger, tape, key rings, matches)
  {
    const sh = X('prateleira-balcao'), sp = EP('prateleira-balcao'), sry = EY('prateleira-balcao');
    colOf('prateleira-balcao');
    for (const row of sh.rows) {
      const id = 'atras-' + row.tipo, at = toW(sp, sry, ...row.localAt), dir = dirW(sry, row.localDir[0], row.localDir[2]);
      anchor(id, [at[0], 0, at[2]], dir);
      row.hit.userData.interactId = id; inter(id, 'prateleira', row.hit, id);
      shelves.push({ id, n: ++shelfN, tipo: row.tipo, label: row.label, slots: row.slots, get stock() { return row.stock; }, setStock: row.setStock, slotAt: (i) => toW(sp, sry, ...row.slotAt(i)), mesh: row.mesh, hit: row.hit, face: row.face, nivel: row.nivel, atras: true, setVintage() { return false; }, vintage: false });
    }
  }
  // poster, clock, switches
  const cz = X('cartaz'); anchor('cartaz', AT('cartaz', 0, 0, -2.5), [0, 0, 1]);
  inter('cartaz', 'cartaz', cz.dyn.children.find((m) => m.userData.interactId), 'cartaz');
  const rel = X('relogio'); updaters.push(rel.update); props.relogio = rel;
  X('cartaz-fora');
  anchor('cartazFora', AT('cartaz-fora', 0, 0, -2.09), [0, 0, 1]);
  const sino = X('sino'); updaters.push(sino.update); props.sino = sino; anchor('sino', AT('sino', 0, -0.65, 1.45), [0, 0, -1]);
  anchor('porta-loja-dentro', AT('porta-loja', 0, 0, 1.2), [0, 0, -1]);
  for (const lid of ['loja1', 'loja2', 'loja3']) lights.push(lampLight(lid));
  anchor('spawn', [11.3, 0, 10.4], [0, 0, -1]);

  // ------------------------------------------------------------------ bathrooms
  for (const [tag, x0, doorX] of [['m', 16, 18], ['f', 20, 22]]) {
    const a = tag === 'm' ? 'banheiroM' : 'banheiroF', east = x0 + 3.9;
    [0, 1].forEach((i) => {
      const cid = `cabine-${tag}${i + 1}`, cab = X(cid), sx = EP(cid)[0];
      const hide = PR(cid).esconderijo;
      colOf(cid);
      if (hide) {
        anchor(tag === 'm' ? 'esconderijo1' : 'esconderijo2', [sx, 0, 8.2], [0, 0, -1]);
        doors['cabine-' + tag] = { id: 'cabine-' + tag, extras: cab, collider: null };
        inter(tag === 'm' ? 'esconderijo1' : 'esconderijo2', 'esconderijo', cab.hit, tag === 'm' ? 'esconderijo1' : 'esconderijo2');
        cab.setOpen(0); // closed leaf is not walkable-through: the hide point is inside, so the leaf is passable by design
        cab.hit.visible = true;
      } else cab.setOpen(0.55);
    });
    [4.4, 5.3].forEach((z, i) => {
      X(`pia-${tag}${i + 1}`);
      const mid = `espelho-${tag}${i + 1}`, e = X(mid);
      inter(mid, 'espelho', e.glass, `pia-${tag}`); props[mid] = e; regSticker(mid, e.sticker);
      mirrors[mid] = { id: mid, mesh: e.glass, w: e.w, h: e.h, setTexture: e.setTexture, setFlipX: e.setFlipX, center: e.center, normal: e.normal, get custom() { return e.custom; }, get flipX() { return e.flipX; } };
    });
    { const pa = made[`pia-${tag}1`].colliders[0], pb = made[`pia-${tag}2`].colliders[0]; collide([Math.min(pa.min[0], pb.min[0]), 0, Math.min(pa.min[2], pb.min[2])], [Math.max(pa.max[0], pb.max[0]), 0.9, Math.max(pa.max[2], pb.max[2])]); }
    anchor(`pia-${tag}`, AT(`pia-${tag}1`, -0.775, 0, 0.45), [1, 0, 0]);
    const swid = `interruptor-${tag}`, sw = X(swid);
    inter(swid, 'interruptor', sw.dyn.children.find((m) => m.userData.interactId), swid);
    anchor(swid, AT(swid, 0, 0, -1.29), [0, 0, 1]);
    addBin('lixeira-' + tag, X('lixeira-' + tag), `pia-${tag}`);
    lights.push(lampLight('banheiro-' + tag));
    addStain('mancha-' + tag, `pia-${tag}`);
    addStain(`mancha-${tag}2`, `pia-${tag}`);
    anchor('banheiro-' + tag, AT('banheiro-' + tag, 0, -2.94, -1.8), [0, 0, 1]);
  }
  // cleaning closet
  const rd = X('rodo'), bd = X('balde');
  inter('rodo', 'rodo', rd.dyn.children.find((m) => m.userData.interactId), 'dml'); inter('balde', 'balde', bd.dyn.children.find((m) => m.userData.interactId), 'dml');
  anchor('dml', AT('rodo', 0.2, 0, -1.4), [0, 0, 1]); props.rodo = rd; props.balde = bd;
  // spills: three on the store floor, four on the apron (one per pump, on the player's side of the island). All start clean.
  addStain('mancha-loja', 'balcao'); addStain('mancha-loja2', 'balcao'); addStain('mancha-loja3', 'balcao');
  addStain('mancha-bombas1', 'bomba1'); addStain('mancha-bombas', 'bomba2'); addStain('mancha-bombas3', 'bomba3'); addStain('mancha-bombas4', 'bomba4');

  // ------------------------------------------------------------------ office
  const OF = 'escritorio';
  const desk = X('mesa-escritorio');
  colOf('mesa-escritorio');
  const pc = X('computador'), mon = X('monitor'), tel = X('telefone');
  const lampL = lampLight('escritorio-mesa');
  props.computador = pc; props.monitor = mon; props.telefone = tel; regSticker('monitor', mon.sticker); props.cadeira = desk; updaters.push(pc.update, mon.update, tel.update);
  inter('computador', 'computador', pc.dyn.children.find((m) => m.userData.interactId), 'computador');
  inter('monitor', 'monitor', mon.dyn.children.find((m) => m.userData.interactId), 'monitor');
  inter('telefone', 'telefone', tel.dyn.children.find((m) => m.userData.interactId), 'telefone');
  anchor('computador', AT('computador', 0, -0.765, -1.15), [0, 0, 1]); anchor('monitor', AT('monitor', 0, -0.765, -1.15), [0, 0, 1]); anchor('telefone', AT('telefone', 0, -0.765, -1.0), [0, 0, 1]);
  anchor('computadorTela', AT('computador', -0.18, 0.235, -0.35), [0, 0, -1]); anchor('monitorTela', AT('monitor', 0, 0.235, -0.35), [0, 0, -1]);
  anchor('cadeira', AT('mesa-escritorio', 0.2, 0, -0.9), [0, 0, 1]);
  lights.push(lampL);
  lights.push(lampLight('escritorio-teto'));
  const arm = X('armario'); props.armario = arm;
  colOf('armario');
  if (PR('armario').esconderijo) {
    inter('esconderijo3', 'esconderijo', arm.dyn.children.find((m) => m.userData.interactId), 'esconderijo3'); anchor('esconderijo3', AT('armario', -0.05, 0, 0), [-1, 0, 0]);
  }
  // the white bottle on the shelf inside the cabinet (seen only with the doors open)
  {
    const fr = X('frasco'); props.frasco = fr;
    inter('frasco', 'frasco', fr.hit, 'frasco'); anchor('frasco', AT('armario', -1.15, 0, 0), [1, 0, 0]); anchor('armario', AT('armario', -1.15, 0, 0), [1, 0, 0]);
  }
  const cof = X('cofre');
  colOf('cofre');
  inter('cofre', 'cofre', cof.dyn.children.find((m) => m.userData.interactId), 'cofre'); anchor('cofre', AT('cofre', 1.1, 0, 0), [-1, 0, 0]);
  const qt = X('quadro-tarefas');
  const cal2 = X('calendario'); props.calendario = cal2;
  inter('quadro-tarefas', 'quadro', qt.dyn.children.find((m) => m.userData.interactId), 'quadroTarefas');
  inter('calendario', 'calendario', cal2.dyn.children.find((m) => m.userData.interactId), 'quadroTarefas');
  anchor('quadroTarefas', AT('quadro-tarefas', 0.4, 0, 2.1), [0, 0, -1]); anchor('escritorio', AT('escritorio-teto', 0, -2.94, -1.5), [0, 0, 1]);

  // ------------------------------------------------------------------ storeroom
  const ES = 'estoque';
  const racks = ['estante1', 'estante2', 'estante3', 'estante4'].map((rid) => [EP(rid)[0], EP(rid)[2], EY(rid)]);
  const LV = [0.12, 0.72, 1.32, 1.92];
  const slots = [];
  racks.forEach(([x, z, ry], ri) => {
    X('estante' + (ri + 1)); colOf('estante' + (ri + 1));
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 4; i++) slots.push({ ri, lv, i, pos: toW([x, 0, z], ry, -0.825 + i * 0.55, LV[lv] + 0.02, 0), ry, out: dirW(ry, 0, 1) });
  });
  // pick 12 slots (levels 0..2) for the numbered boxes, shuffled by the seed
  const cand = slots.filter((s) => s.lv < 3 && s.ri !== 2);
  for (let i = cand.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const chosen = new Set(cand.slice(0, 12));
  cand.slice(0, 12).forEach((s, i) => {
    const n = i + 1, bx = placeProp(B, 'caixa-estoque', { pos: s.pos, ry: s.ry, area: ES, n }); group.add(bx.dyn);
    const id = 'estoqueCaixa' + n;
    inter(id, 'caixa-estoque', bx.dyn.children.find((m) => m.userData.interactId), id);
    const out = s.out; anchor(id, [s.pos[0] + out[0] * 0.95, 0, s.pos[2] + out[2] * 0.95], [-out[0], 0, -out[2]]);
    boxes[n] = { n, id, root: bx.dyn, mesh: bx.mesh, slot: s };
  });
  const dc = B.ctx({ area: ES });
  const plain = rect8(12);
  slots.forEach((s) => {
    if (chosen.has(s) || rnd() < 0.45) return;
    const rot = (rnd() - 0.5) * 0.12, h = 0.3 + rnd() * 0.12;
    dc.geo(boxFaces(T, 0.46 + rnd() * 0.06, h, 0.38, [plain, plain, plain, plain, plain, plain]), M.caixas, [s.pos[0], s.pos[1] + h / 2, s.pos[2]], [0, s.ry + rot, 0]);
  });
  const CART_HOME = { pos: [...EP('carrinho')], ry: EY('carrinho') };
  const cartP = X('carrinho');
  inter('carrinho', 'carrinho', cartP.hit, 'carrinho'); anchor('carrinho', AT('carrinho', -0.2, 0, 1.3), [0, 0, -1]); props.carrinho = cartP;
  const cartCol = { min: [0, 0, 0], max: [0, 0, 0], id: 'carrinho', enabled: true }; colliders.push(cartCol);
  const cart = {
    id: 'carrinho', root: cartP.dyn, setLoad: cartP.setLoad, get load() { return cartP.load; }, handleAnchor: cartP.handleAnchor, roll: cartP.roll, collider: cartCol, home: CART_HOME,
    /** the collider follows the root; the game may call this after moving it (update does it every frame as well) */
    syncCollider: () => fitBox(cartCol, cartP.dyn, cartP.footprint, 1.1),
    /** while the player holds the cart the collider is off, so it never pushes the player */
    setHeld(v) { cartCol.enabled = !v; },
    place(x, z, ry) { cartP.dyn.position.set(x, 0, z); cartP.dyn.rotation.y = ry; cart.syncCollider(); },
    reset() { cart.place(CART_HOME.pos[0], CART_HOME.pos[2], CART_HOME.ry); cartP.setLoad(0); cartCol.enabled = true; },
  };
  cart.syncCollider();
  lights.push(lampLight('estoque'));
  anchor('estoque', AT('estoque', 0, -2.94, -3.5), [0, 0, 1]);

  // ------------------------------------------------------------------ service area and old depot
  const SV = 'servico';
  const qf = X('quadro-forca'); updaters.push(qf.update); props['quadro-forca'] = qf;
  inter('quadro-forca', 'quadro-forca', qf.dyn.children.find((m) => m.userData.interactId), 'quadroForca'); anchor('quadroForca', AT('quadro-forca', 0, 0, 1.1), [0, 0, -1]);
  colOf('quadro-forca');
  for (const area of BREAKERS) inter('disjuntor-' + area, 'disjuntor', qf.breakers.switches[area].hit, 'quadroForca');
  addBin('lixeira-servico', X('lixeira-servico'), 'fundos'); X('lixeira-servico2');
  // loose ladder: stands in the corner by the board until the game puts it under a lamp
  const LADDER_HOME = { pos: [...EP('escada')], ry: EY('escada') };
  const esc = X('escada');
  inter('escada', 'escada', esc.dyn.children.find((m) => m.userData.interactId), 'escada'); anchor('escada', AT('escada', 1.4, 0, 0.9), [-1, 0, 0]); props.escada = esc;
  anchor('fundos', AT('quadro-forca', 0, 0, 6.3), [0, 0, 1]); anchor('servico', AT('servico', 0, -2.94, -0.2), [0, 0, 1]);
  const lanterna = X('lanterna');
  inter('lanterna', 'lanterna', lanterna.dyn.children.find((m) => m.userData.interactId), 'servico');
  // a tied bag on the floor of the back area, to be carried to the container
  const sacoP = X('saco-lixo');
  inter('saco-lixo', 'saco', sacoP.hit, 'sacoSolto'); anchor('sacoSolto', AT('saco-lixo', 0, 0, -1.1), [0, 0, 1]);
  const bag = { id: 'saco-lixo', root: sacoP.dyn, home: { pos: [...EP('saco-lixo')], ry: EY('saco-lixo') }, setVisible(v) { sacoP.dyn.visible = Boolean(v); },
    place(x, y, z, ry = 0) { sacoP.dyn.position.set(x, y, z); sacoP.dyn.rotation.y = ry; bag.setVisible(true); }, reset() { bag.place(bag.home.pos[0], 0, bag.home.pos[2], bag.home.ry); } };
  const cont = X('conteiner');
  colOf('conteiner');
  inter('conteiner', 'lixeira', cont.dyn.children.find((m) => m.userData.interactId), 'conteiner'); anchor('conteiner', AT('conteiner', 0, 0, -1.5), [0, 0, 1]);
  lights.push(lampLight('servico'));
  // depot of the old promotion
  const DP = 'deposito', dp = B.ctx({ area: DP });
  const crateP = (x, z, w, d, lv) => dp.geo(boxFaces(T, w, 0.4, d, Array(6).fill(rect8(15))), M.caixas, [x, 0.2 + lv * 0.4, z]);
  crateP(23.4, 19.3, 0.9, 0.7, 0); crateP(23.3, 19.2, 0.8, 0.6, 1); crateP(22.2, 19.4, 0.8, 0.6, 0); crateP(23.5, 18.2, 0.7, 0.7, 0);
  for (let i = 0; i < 3; i++) dp.cyl(0.07, 0.07, 1.4, 6, M.cardboard, [21.5 + i * 0.16, 0.7, 14.5], [0.08, 0, 0.06]);
  // standee: a cardboard Sun on a stand, flat and old
  dp.quad(1.1, 1.1, M.paperSol, [22.5, 1.3, 15.4], [0, 2.8, 0]); dp.box([0.06, 0.9, 0.5], M.cardboard, [22.5, 0.45, 15.4], [0, 2.8, 0]);
  for (let i = 0; i < 4; i++) dp.geo(boxFaces(T, 0.45, 0.2, 0.3, Array(6).fill(rect8(14))), D('#ffffff', 'produtos'), [21.7 + (i % 2) * 0.5, 0.1 + ((i / 2) | 0) * 0.2, 17.8 + (i % 2) * 0.1]);
  anchor('deposito', [22.0, 0, 16.5], [1, 0, 0]);
  lights.push(lampLight('deposito'));

  // ------------------------------------------------------------------ parking
  const ln = B.ctx({ area: 'estacionamento' });
  const zs = [3.1, 5.9, 8.7, 11.5, 14.3, 17.1, 19.9];
  for (const z of zs) { ln.quad(5.2, 0.1, M.lineW, [-6.4, 0.014, z], [-Math.PI / 2, 0, 0]); ln.quad(5.2, 0.1, M.lineW, [-18.9, 0.014, z], [-Math.PI / 2, 0, 0]); }
  ln.quad(0.1, 16.9, M.lineW, [-3.8, 0.014, 11.5], [-Math.PI / 2, 0, 0]); ln.quad(0.1, 16.9, M.lineW, [-16.3, 0.014, 11.5], [-Math.PI / 2, 0, 0]); ln.quad(0.1, 16.9, M.lineW, [-21.5, 0.014, 11.5], [-Math.PI / 2, 0, 0]);
  ln.quad(0.1, 16.9, M.lineW, [-9.0, 0.014, 11.5], [-Math.PI / 2, 0, 0]);
  const slotZ = [4.5, 7.3, 10.1, 12.9, 15.7, 18.5];
  slotZ.forEach((z, i) => { anchor('vaga' + (i + 1), [-6.4, 0, z], [1, 0, 0]); anchor('vaga' + (i + 7), [-18.9, 0, z], [-1, 0, 0]); });
  const cars = {};
  const aband = (key, anchorName) => {
    X(key); const car = made[key].car, a = { pos: EP(key) }, ry = EY(key);
    const hx = Math.abs(Math.sin(ry)) > 0.5 ? car.size.l / 2 : car.size.w / 2, hz = Math.abs(Math.sin(ry)) > 0.5 ? car.size.w / 2 : car.size.l / 2;
    collide([a.pos[0] - hx, 0, a.pos[2] - hz], [a.pos[0] + hx, car.size.h, a.pos[2] + hz], { id: key });
    anchor(anchorName, [a.pos[0], 0, a.pos[2] - 2.2], [0, 0, 1]);
    inter(key, 'carro', car.root.children.find((m) => m.isMesh) ?? car.root, anchorName);
    cars[key] = car; updaters.push(car.update); return car;
  };
  aband('carro-valdir', 'carroValdir'); aband('carro-abandonado', 'carroAbandonado');
  anchor('carroValdir', [-17.2, 0, 21.0], [-0.1, 0, -1]); anchor('carroAbandonado', [-17.2, 0, 12.3], [-0.1, 0, -1]);
  const post = X('poste');
  colOf('poste'); props.poste = post;
  lights.push(lampLight('poste'));
  anchor('estacionamento', [-10.5, 0, 6.0], [-1, 0, 1]);
  // wire fence at the back and a few bushes
  const fc = B.ctx({ area: 'externa' });
  fc.quad(52, 1.8, M.fence, [1, 0.9, 24.6], [0, 0, 0], [0, 0, 26, 3.6]);
  for (let x = -25; x <= 27; x += 4) fc.box([0.1, 1.9, 0.1], M.trunk, [x, 0.95, 24.6]);
  const bush = (x, z, s) => { fc.cyl(0, 0.9 * s, 1.2 * s, 5, M.pine, [x, 0.6 * s, z]); };
  for (let i = 0; i < 46; i++) {
    const side = rnd();
    let x, z;
    if (side < 0.4) { x = -44 + rnd() * 17; z = -21 + rnd() * 60; } else if (side < 0.7) { x = 29 + rnd() * 15; z = -21 + rnd() * 60; } else { x = -25 + rnd() * 52; z = 26 + rnd() * 13; }
    bush(x, z, 0.8 + rnd() * 1.6);
  }
  for (let i = 0; i < 12; i++) { const x = -42 + rnd() * 84, z = -47 + rnd() * 10; fc.cyl(0.25, 0.3, 3, 5, M.trunk, [x, 1.5, z]); fc.cyl(0, 2.2, 7, 6, M.pine, [x, 6, z]); }

  // ------------------------------------------------------------------ the sign
  const sign = X('placa-sol'); updaters.push(sign.update); props['placa-sol'] = sign;
  colOf('placa-sol');
  inter('placa-sol', 'placa', sign.dyn.children.find((m) => m.userData.interactId), 'placaSol');
  anchor('placaSol', AT('placa-sol', 0, 9.2, 0.2), [0, 0, 1]); anchor('placaSolVista', AT('placa-sol', 0, 1.65, 6.5), [0, 0.55, -1]);
  lights.push(lampLight('placa-sol'));
  anchor('chegada', [-38, 0, -24.2], [1, 0, 0.2]); anchor('acostamento', [-30, 0, -24.2], [1, 0, 0.1]);

  // ------------------------------------------------------------------ cameras: seven ceiling cameras (the monitor lists six)
  // the tilt of each camera (the angle down to what it watches); where it points is the yaw of its entity.
  // cam7 hangs on a bracket, lower than the others, so it shows through the peephole of the depot door.
  const CAM_AIM = { // [where the camera hangs, what it watches]: only the angle down matters here
    cam1: [[15.55, H_IN, 3.45], [9, 1.0, 8.5]], cam2: [[0.45, CANOPY_Y, -6.5], [6, 1.0, -6.5]], cam3: [[24.55, CANOPY_Y, -6.5], [17, 1.0, -6.5]], cam4: [[16.7, H_IN, 12.35], [12, 1.0, 17]],
    cam5: [[17.35, H_IN, 19.65], [21, 0.8, 14]], cam6: [[1.5, 3.2, 10.0], [-12, 0.5, 14]], cam7: [[23.65, 2.5, 14.35], [22, 0.8, 19]],
  };
  const camDir = (id, ry) => { const [p, t] = CAM_AIM[id], h = Math.hypot(t[0] - p[0], t[2] - p[2]); return [Math.sin(ry) * h, t[1] - p[1], Math.cos(ry) * h]; };
  ['cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6', 'cam7'].forEach((id) => {
    const cm = X(id), q = EP(id), p = [q[0], q[1] + 0.19, q[2]], ry = EY(id);
    updaters.push(cm.update);
    if (id === 'cam7') B.ctx({ area: 'deposito' }).box([0.06, H_IN - p[1], 0.06], M.steel, [p[0], (H_IN + p[1]) / 2, p[2]]);
    if (id === 'cam6') B.ctx({ area: 'estacionamento' }).box([0.5, 0.1, 0.12], M.steel, [p[0] + 0.25, p[1], p[2]]);
    anchor(id, [p[0], p[1] - 0.12, p[2]], unit(camDir(id, ry)));
    inter(id, 'camera', cm.dyn.children.find((m) => m.userData.interactId), id);
    props[id] = cm;
  });
  // a camera at the pump bays is already cam2/cam3; the seventh is in the depot

  // ------------------------------------------------------------------ maintenance: ladder, burnt tubes, breakers
  const ladderCol = { min: [0, 0, 0], max: [0, 0, 0], id: 'escada', enabled: true }; colliders.push(ladderCol);
  // ---- things the hallucinations move: a world offset on top of the place the game left the object in
  const snap = (o) => ({ x: o.position.x, y: o.position.y, z: o.position.z, ry: o.rotation.y });
  let ladderBase = { x: LADDER_HOME.pos[0], y: 0, z: LADDER_HOME.pos[2], ry: LADDER_HOME.ry };
  const loose = X('produto-solto'); props.produtoSolto = loose;
  const subjects = {
    cadeira: { obj: desk.chair, base: (() => { const b = snap(desk.chair); return () => b; })() },
    balde: { obj: bd.dyn, base: (() => { const b = snap(bd.dyn); return () => b; })() },
    rodo: { obj: rd.dyn, base: (() => { const b = snap(rd.dyn); return () => b; })() },
    produto: { obj: loose.dyn, base: (() => { const b = snap(loose.dyn); return () => b; })() },
    escada: { obj: esc.dyn, base: () => ladderBase },
  };
  const moved = {};
  const displaceIds = Object.keys(subjects);
  function applyDisplace(id) {
    const sj = subjects[id], b = sj.base(), m = moved[id] ?? { offset: [0, 0, 0], ry: 0 };
    const pr = sj.obj.parent?.rotation.y ?? 0, cs = Math.cos(pr), sn = Math.sin(pr), [dx, dy, dz] = m.offset;
    sj.obj.position.set(b.x + dx * cs - dz * sn, b.y + dy, b.z + dx * sn + dz * cs); sj.obj.rotation.y = b.ry + m.ry;
  }
  function setLadder(x, z, ry) { ladderBase = { x, y: 0, z, ry }; applyDisplace('escada'); }
  /** Move a loose object by a world offset [dx, dy, dz] (and turn it by ry); [0, 0, 0] puts it back. false for an unknown id. */
  function displace(id, offset = [0, 0, 0], ry = 0) { if (!subjects[id]) return false; moved[id] = { offset: [...offset], ry }; applyDisplace(id); return true; }
  const displaced = (id) => (moved[id] && (moved[id].offset.some((v) => v) || moved[id].ry) ? { offset: [...moved[id].offset], ry: moved[id].ry } : null);
  const lampOf = (id) => lights.find((l) => l.id === id && l.fixture?.setBurnt) ?? null;
  const ladder = {
    id: 'escada', root: esc.dyn, height: esc.height, collider: ladderCol, home: LADDER_HOME, at: null,
    syncCollider: () => fitBox(ladderCol, esc.dyn, esc.footprint, 1.6),
    /** Stand the ladder under the lamp `lightId` (its platform right below the tube). Returns where the player stands to climb and the way he faces, or null (no such lamp, or out of reach). */
    placeUnder(lightId) {
      const l = lampOf(lightId); if (!l || l.pos[1] > 3.1) return null; // the canopy lamps and the pole are out of reach
      setLadder(l.pos[0], l.pos[2] + 0.12, 0); ladder.at = lightId; ladder.syncCollider();
      return { stand: [l.pos[0], 0, l.pos[2] + 1.0], dir: [0, 0, -1], top: [l.pos[0], esc.height, l.pos[2]] };
    },
    /** Back to the corner by the breaker board. */
    stow() { setLadder(LADDER_HOME.pos[0], LADDER_HOME.pos[2], LADDER_HOME.ry); ladder.at = null; ladder.syncCollider(); },
    setClimbing(v) { ladderCol.enabled = !v; },
  };
  ladder.syncCollider();
  const lampIds = lights.filter((l) => l.fixture?.setBurnt).map((l) => l.id);
  /** Burn out (or replace) the tube of the lamp `id`. false if there is no such lamp. */
  function setBurnt(id, v) { const l = lampOf(id); if (!l) return false; l.burnt = Boolean(v); l.fixture.setBurnt(l.burnt); return true; }
  const BREAKER_OF = { loja: 'loja', bombas: 'cobertura', estoque: 'estoque', banheiroM: 'banheiros', banheiroF: 'banheiros', escritorio: 'escritorio', servico: 'servico', deposito: 'servico', estacionamento: 'estacionamento' };
  const breakerOf = (l) => (l.kind === 'placa' ? 'placa' : BREAKER_OF[l.area] ?? null);
  const powered = (l) => { const b = breakerOf(l); return !b || qf.breakers.isOn(b); };
  const breakers = { areas: BREAKERS, switches: qf.breakers.switches, setOn: qf.breakers.setOn, isOn: qf.breakers.isOn, door: qf.door, powered };
  function setDirt(id, k) { const st = stains[id]; if (!st) return false; st.setDirt(k); return true; }
  function setFull(id, v) { const b = bins[id]; if (!b) return false; b.setFull(v); return true; }

  // ------------------------------------------------------------------ Sun stickers
  const ALIAS = { geladeira: ['geladeira1'], 'porta-banheiro': ['porta-banheiro-m', 'porta-banheiro-f'], espelho: ['espelho-m1', 'espelho-m2', 'espelho-f1', 'espelho-f2'] };
  const shownS = {};
  const stickers = {
    ids: Object.keys(stickerReg),
    /** Show or hide the stickers of `id` (or of an alias). Returns false when the id is unknown. */
    show(id, v = true) { const list = stickerReg[id] ? [id] : ALIAS[id]; if (!list) return false; for (const k of list) { shownS[k] = Boolean(v); for (const m of stickerReg[k]) m.visible = Boolean(v); } return true; },
    shown: (id) => Boolean(shownS[ALIAS[id]?.[0] ?? id]),
    hideAll() { for (const k of Object.keys(stickerReg)) stickers.show(k, false); },
  };

  // ------------------------------------------------------------------ entities the wiring does not know (made in the editor)
  const known = new Set(Object.keys(made));
  ents.all();
  for (const id of Object.keys(made)) {
    if (known.has(id)) continue;
    const m = made[id];
    for (const c of m.colliders) collide(c.min, c.max);
    for (const l of m.lights) lights.push(l);
    if (m.update) updaters.push(m.update);
  }
  ready = true;

  // ------------------------------------------------------------------ build everything
  B.flush(group);
  for (const l of lights) if (l.fixture) Object.defineProperty(l, 'fixture', { value: l.fixture, enumerable: false });

  // ------------------------------------------------------------------ update
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function levelOf(l, t) {
    if (!l.on || l.burnt || !powered(l)) return 0;
    if (!l.pisca) return 1;
    const slot = Math.floor(t * 9), h = hash(slot + (l.id.length * 13));
    return h > 0.74 ? 0.1 + hash(slot * 3 + 1) * 0.35 : 1;
  }
  function update(t, state = {}) {
    for (const l of lights) {
      l.level = levelOf(l, t);
      if (l.fixture?.setLevel) l.fixture.setLevel(l.level);
      if (l.fixture?.lamp) l.fixture.lamp.visible = l.level > 0.05;
    }
    for (const id in doors) {
      const d = doors[id], k = state.doors?.[id] ?? 0;
      if (d.extras.setOpen) d.extras.setOpen(k);
      if (d.collider) d.collider.enabled = k < 0.5;
    }
    cash.setGaveta(state.gaveta ?? 0);
    placaPower(qf.breakers.isOn('placa'));
    cart.syncCollider(); ladder.syncCollider();
    for (const u of updaters) u?.(t, state);
  }
  const placaPower = (on) => props['placa-sol'].setPower(on);
  update(0, {});

  return {
    group, anchors, colliders, lights, interactables, areas, areaAt, update,
    pumps, shelves, boxes, cars, doors, props, cups, stickers, mirrors, displace, displaced, displaceIds, cart, ladder, breakers, bins, bag, stains, lampIds, setBurnt, setDirt, setFull, size: { x0: -45, x1: 45, z0: -48, z1: 40 },
    /** the interactable under a raycast hit (walks up the parents) */
    interactableOf(obj) { for (let o = obj; o; o = o.parent) if (o.userData?.interactId) return interactables.find((i) => i.id === o.userData.interactId) ?? null; return null; },
    seedInfo: { seed, darkness, products: PRODUTO_TIPOS },
  };
}

function rect8(cell) { const cx = cell % 4, cy = (cell / 4) | 0, e = 0.5 / 64; return [cx / 4 + e, 1 - (cy + 1) / 4 + e, (cx + 1) / 4 - e, 1 - cy / 4 - e]; }
