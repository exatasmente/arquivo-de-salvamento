// The city of the street scene: the builders that replace the old boxes (by the same entity types), and the level of detail of the buildings.
//   cityBuilders({ kind, game }): { predio, loja, poste, carro, viaduto, pilar, bueiro, bocaRua, entulho, lixo } for placeEntities' `override`.
//   In the game (`game: true`) a building makes no mesh of its own: it leaves its parts in `m.city`, and createCityLod joins them for the whole street,
//   per side of the avenue, per chunk of 24 m and per material, in two versions (near: all the parts, far: a painted box) that the eye chooses between.
//   In the scene editor each building is its own group, with all of its parts.
import { mergeGeos } from '../../../vendor/engine/render.js';
import { buildLoja } from '../loja.js';
import { DOOR } from '../interiors.js';
import { buildBuilding, styleOf, GH, mix } from './building.js';
import { STREET_BUILDERS } from './street.js';
import { windowMat, WINDOW_KINDS } from './windows.js';
import { installPaints } from './paints.js';
import { FURNITURE } from './furniture.js';
import { VIADUCT } from './viaduct.js';

export { windowMat, setWindowNight, WINDOW_KINDS } from './windows.js';
export { terrainDetails, stationEntrance, planDetails } from './street.js';
export { buildGround, GROUND } from './ground.js';
export { installMob, MOB, flush, tree, tuft, bag, scrap, wiring, lotWalls, DRAW } from './furniture.js';
export { Shape } from './geo.js';
export { addPiece } from './pieces.js';
export { installPaints };

/** Adds to group `g` the meshes of a batch and the window quads (of `win`) with their materials. */
function fill(kit, g, near, win) {
  const T = kit.T;
  for (const m of near.build().children) g.add(m);
  for (const k of WINDOW_KINDS) if (win[k].length) g.add(new T.Mesh(mergeGeos(win[k]), windowMat(kit.r, k)));
}

export function cityBuilders({ kind, game }) {
  const occ = (f) => (kit, p, e) => ({ ...f(kit, p, e), dynamic: true, occ: true });
  return {
    predio(kit, p, e) {
      installPaints(kit);
      const res = buildBuilding(kit, p, { kind });
      const root = new kit.T.Group(), cut = e.pos[2] > 0 ? 'predio-sul' : 'predio-norte';
      if (game) return { root, collider: { w: res.w, d: res.d }, cut, city: res };
      fill(kit, root, res.near, res.win);
      return { root, collider: { w: res.w, d: res.d }, cut };
    },
    loja(kit, p, e) {
      installPaints(kit);
      const m = buildLoja(kit, p, e), shell = m.root.children[0], cap = m.root.children[2];
      // the floors above the shop, with real windows (the old cap is replaced)
      for (const o of [...cap.children]) { cap.remove(o); o.geometry?.dispose?.(); }
      const style = styleOf({ ...p, andares: Math.max(3, p.andares) }, kind);
      const up = buildBuilding(kit, p, { kind, upperOnly: true, style: style === 'torre' ? 'torre' : 'bloco' });
      const capNear = new kit.T.Group(), capFar = new kit.T.Group();
      fill(kit, capNear, up.near, up.win);
      cap.add(capNear);
      if (game) { for (const mesh of up.far.build().children) capFar.add(mesh); cap.add(capFar); m.lod = { near: capNear, far: capFar, inside: m.root.children[1], x: e.pos[0], z: e.pos[2] }; capFar.visible = false; }
      // an awning over the door, and a pictogram plate, on the front wall
      const front = shell.children.find((g) => g.name === 'p-frente');
      if (front) {
        const b = new kit.Batch(), w = m.w, d = m.d, col = ['#b8553a', '#4a6a8a', '#c0a050', '#5a7a5a'][(p.semente >>> 0) % 4];
        b.plane({ c: col, map: 'toldo', side: 'double' }, Math.min(w - 1, 4.2), 1.6, [DOOR.x, 2.85, d / 2 + 0.78], { flat: true, rx: 0.38, tile: 1.5 });
        b.plane({ c: col, map: 'toldo' }, Math.min(w - 1, 4.2), 0.3, [DOOR.x, 2.25, d / 2 + 1.6], { tile: 1.5, cell: 3 });
        for (const s of [-1, 1]) b.cyl({ c: '#26282c', map: 'metal' }, 0.025, 0.025, 1.7, 5, [DOOR.x + s * (Math.min(w - 1, 4.2) / 2 - 0.15), 2.35, d / 2 + 0.85], { rx: Math.PI / 2 });
        for (const mesh of b.build().children) front.add(mesh);
        // the shop windows get a room behind the glass (the old dark panes stay behind them): quads of the shop material and a frame
        const T = kit.T, wl = [], fb = new kit.Batch(), doorL = DOOR.x - DOOR.w / 2, doorR = DOOR.x + DOOR.w / 2, dark = { c: '#2a2c30', map: 'metal' };
        for (const [x0, x1] of [[-w / 2 + 0.6, doorL - 0.5], [doorR + 0.5, w / 2 - 0.6]]) if (x1 - x0 > 1) {
          const cx = (x0 + x1) / 2, ww = x1 - x0;
          wl.push({ geo: new T.PlaneGeometry(ww, 2.0), matrix: new T.Matrix4().makeTranslation(cx, 0.55 + 1.0, d / 2 + 0.07) });
          fb.plane(dark, ww, 0.08, [cx, 0.55, d / 2 + 0.09], { cell: 3, tile: 1 }); fb.plane(dark, ww, 0.08, [cx, 2.47, d / 2 + 0.09], { cell: 3, tile: 1 });
          for (let x = x0; x <= x1 + 0.01; x += ww / Math.max(1, Math.round(ww / 1.6))) fb.plane(dark, 0.07, 2.0, [x, 0.55, d / 2 + 0.09], { cell: 3, tile: 1 });
        }
        // the old bare concrete of the front is covered by the painted wall of the block, with a plinth and pilasters in stone
        const wallSpec = p.fachada === 'tijolo' ? { c: p.cor, map: 'tijolo' } : { c: p.cor, map: 'reboco' }, trim = { c: mix(p.cor, '#d8d4c8', 0.55), map: 'concreto' }, zf = d / 2 + 0.035;
        const strip = (xa, xb, ya, yb) => { if (xb - xa > 0.05) fb.plane(wallSpec, xb - xa, yb - ya, [(xa + xb) / 2, ya, zf], { tile: 3, cell: 3 }); };
        strip(-w / 2, w / 2, 2.62, 3.78);
        strip(-w / 2, -w / 2 + 0.6, 0.0, 2.62); strip(doorL - 0.5, doorL, 0.0, 2.62); strip(doorR, doorR + 0.5, 0.0, 2.62); strip(w / 2 - 0.6, w / 2, 0.0, 2.62);
        strip(-w / 2 + 0.6, doorL - 0.5, 0.0, 0.52); strip(doorR + 0.5, w / 2 - 0.6, 0.0, 0.52);
        fb.box(trim, [w + 0.1, 0.45, 0.14], [0, 0, d / 2 + 0.05], { cell: 4, tile: 2, nojitter: true });
        for (const x of [-w / 2 + 0.3, doorL - 0.25, doorR + 0.25, w / 2 - 0.3]) fb.box(trim, [0.34, 3.6, 0.16], [x, 0.45, d / 2 + 0.06], { cell: 3, tile: 1, nojitter: true });
        for (const mesh of fb.build().children) front.add(mesh);
        if (wl.length) front.add(new T.Mesh(mergeGeos(wl), windowMat(kit.r, 'shop')));
      }
      return m;
    },
    poste: STREET_BUILDERS.poste, carro: STREET_BUILDERS.carro, bueiro: STREET_BUILDERS.bueiro, bocaRua: STREET_BUILDERS.bocaRua,
    entulho: STREET_BUILDERS.entulho, lixo: STREET_BUILDERS.lixo,
    viaduto: occ(VIADUCT.viaduto), pilar: occ(VIADUCT.pilar),   // (modelled and painted in viaduct.js: the same sizes and colliders)
    ...FURNITURE,   // the traffic light, the sign post, the hydrant, the cone, the barrier and the solar panels, modelled and painted (furniture.js)
  };
}

/**
 * The level of detail of the buildings left by the game's builders (`made`: the entities' results): one merged mesh per side, chunk, version
 * and material. `update(eye)` shows the near version of the chunks within `near` metres of the eye and the far version of the rest.
 */
export function createCityLod(kit, group, made, { chunk = 24, near = 40 } = {}) {
  const T = kit.T, buckets = new Map(), root = new T.Group(); root.name = 'cidade';
  group.add(root);
  const add = (key, ent, mat, geo, matrix) => { let b = buckets.get(key); if (!b) buckets.set(key, (b = { ent, mat, parts: [] })); b.parts.push({ geo, matrix }); };
  const mw = new T.Matrix4();
  for (const m of Object.values(made)) {
    if (!m.city) continue;
    m.root.updateMatrix(); mw.copy(m.root.matrix);
    const x = mw.elements[12], side = mw.elements[14] > 0 ? 'sul' : 'norte', ck = Math.floor(x / chunk), res = m.city;
    for (const [lod, batch] of [['near', res.near], ['far', res.far]]) {
      for (const [sk, { spec, list }] of batch.parts) for (const it of list) add(`${side}|${ck}|${lod}|${sk}`, { side, ck, lod }, spec, it.geo, new T.Matrix4().multiplyMatrices(mw, it.matrix));
    }
    for (const k of WINDOW_KINDS) for (const it of res.win[k]) add(`${side}|${ck}|near|W${k}`, { side, ck, lod: 'near' }, k, it.geo, new T.Matrix4().multiplyMatrices(mw, it.matrix));
  }
  const groups = new Map(); // `${side}|${ck}|${lod}` -> Group
  for (const b of buckets.values()) {
    const gk = `${b.ent.side}|${b.ent.ck}|${b.ent.lod}`;
    let g = groups.get(gk); if (!g) { g = new T.Group(); g.userData = { ...b.ent }; groups.set(gk, g); root.add(g); }
    g.add(new T.Mesh(mergeGeos(b.parts), typeof b.mat === 'string' ? windowMat(kit.r, b.mat) : kit.mat(b.mat)));
  }
  const swaps = Object.values(made).map((m) => m.lod).filter(Boolean); // the lojas' upper floors: the same two versions
  const sides = { sul: true, norte: true };
  let last = null;
  const api = {
    root, groups,
    update(eye) {
      const key = `${Math.round(eye[0] / 3)}|${Math.round(eye[2] / 3)}|${sides.sul}|${sides.norte}`;
      if (key === last) return; last = key;
      for (const g of groups.values()) {
        const { side, ck, lod } = g.userData, x0 = ck * chunk, x1 = x0 + chunk, z0 = side === 'sul' ? 11 : -34, z1 = side === 'sul' ? 34 : -11;
        const dx = Math.max(x0 - eye[0], 0, eye[0] - x1), dz = Math.max(z0 - eye[2], 0, eye[2] - z1), isNear = Math.hypot(dx, dz) < near;
        g.visible = sides[side] && (lod === 'near') === isNear;
      }
      // a shop's insides are only drawn near it (from afar the walls hide them): the room is not seen from outside
      for (const o of swaps) { const dd = Math.hypot(o.x - eye[0], o.z - eye[2]), nr = dd < near + 8; o.near.visible = nr; o.far.visible = !nr; o.inside.visible = dd < 24; }
    },
  };
  return api;
}
void GH;
