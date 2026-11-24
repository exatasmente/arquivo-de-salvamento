// The building of the chase: a residential block on the north pavement of the avenue, built from the plan in scenes/predio-plan.js.
// It is a scene of its own (scenes/predio.js, layout in data/scenes/predio.json): the shell is one entity (`predioCasca`: the street front
// in bays of 3 m with the painted windows of the city's blocks, the blind sides, the roof, and inside the hall, the stairs' core, the
// corridor of the third floor and the flat), and every thing in it is an entity too, to be picked and moved in the scene editor: the
// wired-glass street door, the mailboxes, the porter's desk, the pram, the switchboard, the stairs, the doors of the flats, the boxes,
// the kitchen, the cupboard, the furniture under its sheets, the window's sash, the fire escape, the lamps and the two places of the lure.
// Painted surfaces (models/predio/paints.js) on the kit's batches: one mesh per material and per entity.
//   PREDIO_BUILDERS[type](kit, params, entity) -> { root, dynamic, space, ctl? }
//   `space`: which part of the building it is shown with ('fora' always; 'hall', 'vao', 'andar' only while the chase is there);
//   `ctl`: what the chase moves of it (the street door and its glass, a flat's door, the cupboard's, the sash, the loose step and the ladder).
// The parts that stand where the plan says are built in the street's frame and hung on the entity's own place (`ANCHOR`), so an
// entity left where the layout first had it is exactly where it was built, and one moved in the editor takes its part with it.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { installPredioPaints } from './paints.js';
import { GLTFLoader } from '../../../vendor/three/GLTFLoader.js';
import { FOOT } from '../../scenes/predio-colliders.js';
import { installPaints } from '../city/paints.js';
import { countTris } from '../kit.js';
import { ORIGIN, BLOCK, DOOR, HALL, STAIR, STAIR_CORNERS, CORR, APT, WINDOW, ESCAPE } from '../../scenes/predio-plan.js';

/** The cupboard as it is built (the entity `armario` then stands wherever the layout says: the plan reads its place from there). */
export const CUP0 = { x0: -12.55, x1: -11.85, z0: -17.75, z1: -16.75, h: 2.1 };

const E = 0.09;                      // how much of a painting shows whatever the light (the city's pieces have about this)
const M = {
  wall: { c: '#a8a294', map: 'pf:parede', emissive: E }, paper: { c: '#a69c88', map: 'pf:papel', emissive: E }, ceil: { c: '#6c6a66', map: 'reboco', emissive: 0.06 },
  tile: { c: '#a09a8e', map: 'pf:ladrilho', emissive: E }, wood: { c: '#a08a6c', map: 'pf:taco', emissive: E }, tread: { c: '#9c988e', map: 'pf:degrau', emissive: E },
  conc: { c: '#8a8882', map: 'concreto', emissive: 0.14 }, door: { c: '#a69a88', map: 'pf:porta', emissive: E }, frame: { c: '#4a4c50', map: 'metal', emissive: 0.12 },
  mail: { c: '#a0a4a2', map: 'pf:correio', emissive: E }, slats: { c: '#a4947a', map: 'pf:ripas', emissive: E }, sheet: { c: '#a8a49c', map: 'pf:lencol', emissive: 0.12 },
  iron: { c: '#8a8e8c', map: 'pf:ferro', emissive: 0.2, side: 'double' }, plate: { c: '#7e8280', map: 'pf:chapa', emissive: 0.2 }, dark: { c: '#1a1b1e' },
  front: { c: '#847e72', map: 'pf:fachada', emissive: 0.2 }, base: { c: '#7e786e', map: 'pf:embasamento', emissive: 0.2 }, side: { c: '#7c7870', map: 'empena', emissive: 0.18 },
  roof: { c: '#5c5a56', map: 'concreto', emissive: 0.12 }, darkWood: { c: '#6a5644', map: 'madeira', emissive: 0.16 }, metal: { c: '#8a8e94', map: 'metal', emissive: 0.16 },
  white: { c: '#b8b8b0', map: 'metal', emissive: 0.18 }, cloth: { c: '#6a7484', map: 'tecido', emissive: 0.18 }, card: { c: '#a88a5a', map: 'papelao', emissive: 0.18 },
  glass: { c: '#9ab8b0', map: 'pf:aramado', emissive: 0.3, opacity: 0.5, side: 'double' }, cracked: { c: '#b4ccc6', map: 'pf:aramado-trinca', emissive: 0.42, opacity: 0.72, side: 'double' },
  pane: { c: '#33465c', map: 'vidro', emissive: 0.2, opacity: 0.45, side: 'double' }, water: { c: '#2a3440', emissive: 0.1, opacity: 0.6 }, lampOn: { c: '#ffd9a0', emissive: 1, fogged: 0.4 },
  rust: { c: '#8a6a52', map: 'ferrugem', emissive: 0.18 },
};

function buildAll(kit) {
  installPaints(kit); installPredioPaints(kit);
  const T = kit.T, Y = BLOCK.y, r = mulberry32(41);
  // everything below is in the street's frame; each part is a node (a batch joins what is of one material in it)
  const N = {}, BS = {}, nodeOf = (id) => (N[id] ??= Object.assign(new T.Group(), { name: id })), B = (id) => (BS[id] ??= new kit.Batch());
  /** A box from corner to corner. */
  const bx = (b, spec, x0, x1, y0, y1, z0, z1, o = {}) => b.box(spec, [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, y0, (z0 + z1) / 2], { cell: 1.1, nojitter: true, ...o });
  /** A bar between two points (a rail, a stringer). */
  const beam = (b, spec, a, c, w = 0.04, h = w) => {
    const va = new T.Vector3(...a), vc = new T.Vector3(...c), len = va.distanceTo(vc), g = new T.BoxGeometry(w, h, len), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), vc.clone().sub(va).normalize());
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * len * 0.5);
    b.add(spec, g, new T.Matrix4().compose(va.clone().add(vc).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1)));
  };
  /** A wall along x at z (thick `t`, centred), from y0 to y1, with openings [[xa, xb, top]] (top: the height of the opening above y0). */
  const wallX = (b, spec, z, x0, x1, y0, y1, holes = [], t = BLOCK.wall, o = {}) => {
    let x = x0;
    for (const [a, c, top] of [...holes].sort((m, n) => m[0] - n[0])) { if (a > x) bx(b, spec, x, a, y0, y1, z - t / 2, z + t / 2, o); if (y0 + top < y1) bx(b, spec, a, c, y0 + top, y1, z - t / 2, z + t / 2, o); x = c; }
    if (x1 > x) bx(b, spec, x, x1, y0, y1, z - t / 2, z + t / 2, o);
  };
  const wallZ = (b, spec, x, z0, z1, y0, y1, holes = [], t = BLOCK.wall, o = {}) => {
    let z = z0;
    for (const [a, c, top] of [...holes].sort((m, n) => m[0] - n[0])) { if (a > z) bx(b, spec, x - t / 2, x + t / 2, y0, y1, z, a, o); if (y0 + top < y1) bx(b, spec, x - t / 2, x + t / 2, y0 + top, y1, a, c, o); z = c; }
    if (z1 > z) bx(b, spec, x - t / 2, x + t / 2, y0, y1, z, z1, o);
  };
  const group = (b, name) => { const g = b.build(); g.name = name; return g; };
  const pivot = (x, y, z, parent) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  // ---- outside ---------------------------------------------------------------------------------------------------------------------------
  const ext = nodeOf('casca:fora');
  {
    const b = new kit.Batch(), { x0, x1, zf, zb } = BLOCK, w = x1 - x0, dl = DOOR.x - DOOR.bay / 2, dr = DOOR.x + DOOR.bay / 2, top = Y[1];
    // the ground floor's front, with the glazed bay of the door; a plinth; the slab over the door
    wallX(b, M.base, zf, x0, x1, Y[0] - 0.15, top, [[dl, dr, 2.75 + 0.15]], 0.24, { tile: [3, 3], cell: 1.5 });
    bx(b, M.conc, x0 - 0.04, x1 + 0.04, Y[0] - 0.15, Y[0] + 0.35, zf + 0.1, zf + 0.2, { cell: 3 });
    bx(b, M.conc, dl - 0.4, dr + 0.4, Y[0] + 2.8, Y[0] + 2.98, zf, zf + 1.3, { cell: 1.5 });
    for (const x of [dl - 0.3, dr + 0.3]) beam(b, M.frame, [x, Y[0] + 3.7, zf + 0.12], [x, Y[0] + 2.98, zf + 1.2], 0.03);
    // the upper floors: a painted bay of 3 m each, the real window left open in its bay
    for (let f = 1; f < 5; f++) for (let k = 0; k < 4; k++) {
      const bx0 = x0 + k * 3, y0 = Y[f], real = f === 3 && Math.abs(bx0 + 1.5 - WINDOW.x) < 0.1;
      if (!real) { b.plane(M.front, 3, 3.2, [bx0 + 1.5, y0, zf + 0.13], { full: true, cell: 1.6 }); continue; }
      // (the same painting, cut round the opening: four pieces of the bay with their own stretch of it)
      const wl = 0.775, wr = 2.225, wb = WINDOW.sill, wt = WINDOW.sill + WINDOW.h;
      for (const [u0, u1, v0, v1] of [[0, wl, 0, 3.2], [wr, 3, 0, 3.2], [wl, wr, 0, wb], [wl, wr, wt, 3.2]]) {
        const g = new T.PlaneGeometry(u1 - u0, v1 - v0), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * (u1 - u0)) / 3, (v0 + uv.getY(i) * (v1 - v0)) / 3.2);
        b.add(M.front, g, new T.Matrix4().makeTranslation(bx0 + (u0 + u1) / 2, y0 + (v0 + v1) / 2, zf + 0.13));
      }
    }
    // behind the painting: the wall itself (with the window's opening), the blind sides, the back, the roof with its parapet and a tank
    { const ws = Y[3] + WINDOW.sill, wt = ws + WINDOW.h;
      wallX(b, M.dark, zf, x0, x1, top, ws, [], 0.24, { cell: 6 }); wallX(b, M.dark, zf, x0, x1, ws, wt, [[WINDOW.x - WINDOW.w / 2, WINDOW.x + WINDOW.w / 2, WINDOW.h]], 0.24, { cell: 6 }); wallX(b, M.dark, zf, x0, x1, wt, BLOCK.roof, [], 0.24, { cell: 6 }); }
    wallZ(b, M.side, x1, zb, zf, 0, BLOCK.roof, [], 0.24, { tile: [6, 6], cell: 3 }); wallZ(b, M.side, x0, zb, zf, 0, BLOCK.roof, [], 0.24, { tile: [6, 6], cell: 4 });
    wallX(b, M.side, zb, x0, x1, 0, BLOCK.roof, [], 0.24, { tile: [6, 6], cell: 4 });
    bx(b, M.roof, x0, x1, BLOCK.roof, BLOCK.roof + 0.2, zb, zf, { cell: 4 });
    for (const [a, c, d, f] of [[x0, x1, zf - 0.02, zf + 0.22], [x0, x1, zb - 0.2, zb + 0.02], [x0 - 0.1, x0 + 0.14, zb, zf], [x1 - 0.14, x1 + 0.1, zb, zf]]) bx(b, M.conc, a, c, BLOCK.roof + 0.2, BLOCK.roof + 1.0, d, f, { cell: 4 });
    b.cyl(M.rust, 1.0, 1.0, 1.7, 10, [x0 + 3.2, BLOCK.roof + 0.9, zb + 3], { cell: 2 }); for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) bx(b, M.frame, x0 + 3.2 + dx - 0.05, x0 + 3.2 + dx + 0.05, BLOCK.roof + 0.2, BLOCK.roof + 0.9, zb + 3 + dz - 0.05, zb + 3 + dz + 0.05);
    bx(b, M.conc, STAIR.cx - 1.9, STAIR.cx + 1.9, BLOCK.roof + 0.2, BLOCK.roof + 2.5, STAIR.cz - 1.9, STAIR.cz + 1.9, { cell: 3 });     // the stair's head on the roof
    // the cornice between the ground floor and the first, and a string course under the roof
    bx(b, M.conc, x0 - 0.05, x1 + 0.05, top - 0.14, top + 0.06, zf + 0.1, zf + 0.26, { cell: 4 }); bx(b, M.conc, x0 - 0.05, x1 + 0.05, BLOCK.roof - 0.1, BLOCK.roof + 0.1, zf + 0.1, zf + 0.3, { cell: 4 });
    // the door's bay: the steel frame, the fixed side lights of wired glass, the lamp under the slab
    const jl = DOOR.x - DOOR.w / 2, jr = DOOR.x + DOOR.w / 2, h = Y[0] + DOOR.h;
    for (const x of [dl, jl - 0.05, jr, dr - 0.05]) bx(b, M.frame, x, x + 0.05, Y[0], Y[0] + 2.75, zf - 0.04, zf + 0.04);
    bx(b, M.frame, dl, dr, h, h + 0.06, zf - 0.04, zf + 0.04); bx(b, M.frame, dl, dr, Y[0] + 2.69, Y[0] + 2.75, zf - 0.04, zf + 0.04);
    for (const [a, c] of [[dl + 0.05, jl - 0.05], [jr + 0.05, dr - 0.05]]) { bx(b, M.base, a, c, Y[0], Y[0] + 0.5, zf - 0.03, zf + 0.03, { tile: 2 }); b.plane(M.glass, c - a, 2.19, [(a + c) / 2, Y[0] + 0.5, zf], { tile: [0.9, 0.9], cell: 2 }); }
    b.plane(M.glass, dr - dl - 0.1, 0.39, [DOOR.x, h + 0.06, zf], { tile: [0.9, 0.9], cell: 3 });
    bx(b, M.lampOn, DOOR.x - 0.14, DOOR.x + 0.14, Y[0] + 2.74, Y[0] + 2.8, zf + 0.5, zf + 0.72);
    ext.add(group(b, 'fachada'));
    void w;
  }
  // the street door: a steel frame with one tall pane of wired glass; its glass whole, cracked or gone
  const door = pivot(DOOR.x - DOOR.w / 2, Y[0], DOOR.z, nodeOf('portaRua')), glass = [];
  {
    const b = new kit.Batch(), w = DOOR.w, h = DOOR.h;
    for (const [a, c, d, f] of [[0, 0.07, 0, h], [w - 0.07, w, 0, h], [0, w, 0, 0.26], [0, w, h - 0.07, h]]) bx(b, M.frame, a, c, d, f, -0.025, 0.025);
    bx(b, M.metal, w - 0.2, w - 0.16, 0.95, 1.25, -0.07, 0.07);                    // the pull handle, both sides
    door.add(group(b, 'porta-rua'));
    for (const spec of [M.glass, M.cracked]) { const g = new kit.Batch(); g.plane(spec, w - 0.14, h - 0.33, [w / 2, 0.26, 0], { full: spec === M.cracked, tile: [0.9, 0.9], cell: 3 }); const m = group(g, 'vidro'); door.add(m); glass.push(m); }
  }
  // the shards on the hall's floor once the glass is gone (one mesh, shown then)
  const shards = (() => { const b = new kit.Batch(), rr = mulberry32(17); for (let i = 0; i < 26; i++) { const s = 0.05 + rr() * 0.14; b.plane(M.cracked, s, s * (0.5 + rr()), [DOOR.x - 0.7 + rr() * 1.6, Y[0] + 0.012 + i * 0.0004, DOOR.z - 0.25 - rr() * 1.7], { flat: true, ry: rr() * 6, full: true }); } const g = group(b, 'cacos'); g.visible = false; nodeOf('portaRua').add(g); return g; })();

  // the fire escape: landings of bars, a stair between each two, rails, brackets, and the drop ladder
  const esc = nodeOf('escadaIncendio');
  const loose = { pivot: null }, ladder = new T.Group();
  {
    const b = new kit.Batch(), { x0, x1, z0, z1, mid, top, foot, steps, rail } = ESCAPE, sx = (top - foot) / steps;
    for (const f of [3, 2, 1]) {
      const y = Y[f];
      b.plane(M.iron, x1 - x0, mid - z0, [(x0 + x1) / 2, y, (z0 + mid) / 2], { flat: true, tile: [0.8, 0.8], cell: 1.2 });       // the walkway against the wall
      b.plane(M.iron, foot - x0, z1 - mid, [(x0 + foot) / 2, y, (mid + z1) / 2], { flat: true, tile: [0.8, 0.8], cell: 1.2 });                                  // the west end of the outer strip (the foot of the stair from above)
      if (f > 1) b.plane(M.iron, x1 - top, z1 - mid, [(top + x1) / 2, y, (mid + z1) / 2], { flat: true, tile: [0.8, 0.8], cell: 1.2 });                                    // the east end (the head of the stair down, or the ladder's hatch)
      for (const [a, c, d, g2] of [[x0, x1, z1 - 0.03, z1 + 0.03], [x0, x1, z0 + 0.02, z0 + 0.08], [x0 - 0.03, x0 + 0.03, z0, z1], [x1 - 0.03, x1 + 0.03, z0, z1], [x0, x1, mid - 0.03, mid + 0.03]]) bx(b, M.plate, a, c, y - 0.14, y, d, g2, { cell: 3 });
      for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) beam(b, M.plate, [x, y - 0.1, z1], [x, y - 1.0, z0 + 0.1], 0.05);                         // the brackets to the wall
      // the rail round the landing: posts and two bars
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 6) bx(b, M.plate, x - 0.02, x + 0.02, y, y + rail, z1 - 0.02, z1 + 0.02);
      for (const hh of [0.5, rail]) { beam(b, M.plate, [x0, y + hh, z1], [x1, y + hh, z1], 0.035); for (const x of [x0, x1]) beam(b, M.plate, [x, y + hh, z0 + 0.05], [x, y + hh, z1], 0.035); }
      if (f > 1) {
        // the stair down to the next landing: two stringers, the treads, a rail on the street side and one between the stair and the walkway
        const yb = Y[f - 1], sy = (y - yb) / steps;
        for (const z of [mid + 0.04, z1 - 0.04]) beam(b, M.plate, [top, y - 0.06, z], [foot, yb - 0.06, z], 0.05, 0.16);
        for (let i = 0; i < steps; i++) { if (f === 3 && i === LOOSE) continue; b.plane(M.iron, sx, z1 - mid - 0.1, [top - (i + 0.5) * sx, y - (i + 1) * sy, (mid + z1) / 2], { flat: true, tile: [0.8, 0.8] }); }
        beam(b, M.plate, [top, y + rail, mid], [foot, yb + rail, mid], 0.035);
        for (let i = 0; i <= 3; i++) { const x = top - (i / 3) * (top - foot), yy = y - (i / 3) * (y - yb); bx(b, M.plate, x - 0.02, x + 0.02, yy, yy + rail, mid - 0.02, mid + 0.02); }
      }
    }
    esc.add(group(b, 'escada-ferro'));
    // the step that gives way (the stair from the third floor): it hangs by one bolt when it goes
    const y3 = Y[3], sy = (Y[3] - Y[2]) / steps, lx = top - (LOOSE + 0.5) * sx, ly = y3 - (LOOSE + 1) * sy, lb = new kit.Batch();
    lb.plane(M.iron, sx, z1 - mid - 0.1, [0, 0, (z1 - mid - 0.1) / 2], { flat: true, tile: [0.8, 0.8] });
    loose.pivot = pivot(lx, ly, mid + 0.05, esc); loose.pivot.add(group(lb, 'degrau-solto'));
    // the drop ladder: two rails and rungs, hung under the first landing until its latch lets it go
    const gb = new kit.Batch(), [lxx, lz] = ESCAPE.ladder, len = 4.2;
    for (const s of [-0.22, 0.22]) bx(gb, M.plate, lxx + s - 0.025, lxx + s + 0.025, 0, len, lz - 0.02, lz + 0.02, { cell: 3 });
    for (let yy = 0.3; yy < len; yy += 0.3) bx(gb, M.plate, lxx - 0.22, lxx + 0.22, yy - 0.015, yy + 0.015, lz - 0.015, lz + 0.015);
    ladder.add(group(gb, 'escada-de-mao')); esc.add(ladder);
    // the latch that holds it, and the two guides it slides in
    const hb = new kit.Batch(); for (const s of [-0.28, 0.28]) bx(hb, M.plate, lxx + s - 0.02, lxx + s + 0.02, Y[1] - 1.4, Y[1] + 1.0, lz - 0.05, lz + 0.05); bx(hb, M.rust, lxx - 0.34, lxx - 0.2, Y[1] + 0.2, Y[1] + 0.3, lz - 0.09, lz + 0.03);
    esc.add(group(hb, 'trava'));
  }

  // ---- inside ----------------------------------------------------------------------------------------------------------------------------
  const parts = { hall: nodeOf('casca:hall'), vao: nodeOf('casca:vao'), andar: nodeOf('casca:andar') };
  // the hall
  {
    const b = new kit.Batch(), { x0, x1, z0, z1, h } = HALL, y = Y[0], sw = STAIR_CORNERS[0];
    bx(b, M.tile, x0, x1, y - 0.1, y, z0, z1 + 0.2, { tile: [1.6, 1.6], skip: ['-y'] }); bx(b, M.ceil, x0, x1, y + h, y + h + 0.1, z0, z1, { tile: 3, skip: ['+y'] });
    wallZ(b, M.wall, x0 - 0.1, z0, z1, y, y + h, [], 0.2, { tile: [3, h] }); wallZ(b, M.wall, x1 + 0.1, z0, z1, y, y + h, [], 0.2, { tile: [3, h] });
    wallX(b, M.wall, z0 - 0.1, x0, x1, y, y + h, [[sw[0] - 0.6, sw[0] + 0.6, 2.4]], 0.2, { tile: [3, h] });                               // the back wall, with the way to the stairs
    wallX(b, M.wall, z1 + 0.05, x0, DOOR.x - DOOR.bay / 2, y, y + h, [], 0.1, { tile: [3, h] }); wallX(b, M.wall, z1 + 0.05, DOOR.x + DOOR.bay / 2, x1, y, y + h, [], 0.1, { tile: [3, h] });
    bx(b, M.wall, DOOR.x - DOOR.bay / 2, DOOR.x + DOOR.bay / 2, y + 2.75, y + h, z1, z1 + 0.1, { tile: [3, h] });
    // the mailboxes on the west wall, with a shelf under them and letters on the floor
    B('correio').plane(M.mail, 2.4, 1.2, [x0 + 0.02, y + 0.95, -15.4], { ry: Math.PI / 2, full: true, cell: 1.2 }); bx(B('correio'), M.frame, x0, x0 + 0.1, y + 0.9, y + 0.95, -16.7, -14.1);
    for (let i = 0; i < 9; i++) B('correio').plane(M.card, 0.22, 0.11, [x0 + 0.3 + r() * 0.9, y + 0.006 + i * 0.001, -16.4 + r() * 2], { flat: true, ry: r() * 6, full: true });
    // the porter's desk by the east wall, a chair fallen behind it, a key board with nothing on it
    bx(B('balcao'), M.darkWood, x1 - 2.3, x1 - 0.5, y, y + 1.05, -14.9, -14.3, { tile: 1.2 }); bx(B('balcao'), M.darkWood, x1 - 2.4, x1 - 0.4, y + 1.05, y + 1.1, -15.0, -14.2, { tile: 1.2 });
    bx(B('balcao'), M.frame, x1 - 1.9, x1 - 1.45, y, y + 0.06, -13.9, -13.1); bx(B('balcao'), M.cloth, x1 - 1.9, x1 - 1.45, y + 0.06, y + 0.5, -13.2, -13.1);
    B('balcao').plane(M.darkWood, 0.9, 0.6, [x1 - 0.02, y + 1.5, -13.6], { ry: -Math.PI / 2, tile: 1 });
    // the pram on its side, in the middle of the floor: a body of cloth, the hood, four wheels in the air, the handle
    { const px = -11.6, pz = -15.6, o = { ry: 0.5 }; B('carrinho').box(M.cloth, [0.5, 0.42, 0.85], [px, y, pz], o); B('carrinho').box(M.dark, [0.52, 0.44, 0.3], [px + 0.14, y, pz - 0.52], o);
      for (const [dx, dz] of [[-0.3, -0.45], [-0.3, 0.3], [-0.36, -0.2], [-0.36, 0.52]]) B('carrinho').cyl(M.dark, 0.13, 0.13, 0.04, 10, [px + dx, y + 0.3 + (dz > 0 ? 0.1 : 0), pz + dz], { rz: Math.PI / 2, ry: 0.5 });
      beam(B('carrinho'), M.metal, [px + 0.1, y + 0.4, pz + 0.4], [px + 0.5, y + 0.25, pz + 1.0], 0.025); beam(B('carrinho'), M.metal, [px - 0.1, y + 0.04, pz + 0.4], [px + 0.3, y + 0.03, pz + 1.0], 0.025); }
    // the switchboard on the east wall, its door hanging, a wire pulled out; under the leak of the ceiling, a puddle
    bx(B('quadroLuz'), M.metal, x1 - 0.14, x1, y + 1.2, y + 1.95, -17.9, -17.3); B('quadroLuz').plane(M.dark, 0.5, 0.62, [x1 - 0.145, y + 1.26, -17.6], { ry: -Math.PI / 2 });
    B('quadroLuz').box(M.metal, [0.03, 0.72, 0.56], [x1 - 0.3, y + 1.2, -17.95], { ry: 0.9 }); beam(B('quadroLuz'), M.dark, [x1 - 0.15, y + 1.3, -17.5], [x1 - 0.5, y + 0.3, -17.2], 0.02);
    B('quadroLuz').plane(M.water, 1.5, 1.0, [x1 - 1.3, y + 0.008, -17.4], { flat: true, ry: 0.3 });
    // a bench, a dead plant in a pot, the lamp of the ceiling (dead) and the emergency lamp over the door (alive)
    bx(B('banco'), M.darkWood, x0 + 0.2, x0 + 0.65, y + 0.4, y + 0.46, -13.8, -12.2); for (const z of [-13.7, -12.3]) bx(B('banco'), M.frame, x0 + 0.25, x0 + 0.6, y, y + 0.4, z - 0.03, z + 0.03);
    B('vaso').cyl(M.rust, 0.22, 0.16, 0.36, 8, [x0 + 0.5, y, -18.9]); for (let i = 0; i < 5; i++) beam(B('vaso'), M.darkWood, [x0 + 0.5, y + 0.36, -18.9], [x0 + 0.5 + Math.cos(i * 1.3) * 0.35, y + 1.0 + (i % 2) * 0.3, -18.9 + Math.sin(i * 1.3) * 0.35], 0.015);
    bx(b, M.white, -12.7, -12.3, y + h - 0.06, y + h, -15.9, -15.3); bx(b, M.lampOn, DOOR.x - 0.16, DOOR.x + 0.16, y + 2.86, y + 2.94, z1 - 0.1, z1 - 0.02);
    parts.hall.add(group(b, 'hall'));
  }
  // the stairs: round the well, a flight on each side, a landing at each corner; the core's walls; the rail on the well's side
  {
    const b = new kit.Batch(), { cx, cz, half, w, flat } = STAIR, out = half + w / 2, inn = half - w / 2, side = half * 2;
    const yTop = Y[4] + 0.2;
    wallZ(b, M.wall, cx - out - 0.1, cz - out, cz + out, Y[0], yTop, [], 0.2, { tile: [3, 3.2] }); wallZ(b, M.wall, cx + out + 0.1, cz - out, cz + out, Y[0], yTop, [], 0.2, { tile: [3, 3.2] });
    wallX(b, M.wall, cz - out - 0.1, cx - out, cx + out, Y[0], yTop, [], 0.2, { tile: [3, 3.2] });
    for (let f = 1; f < 4; f++) { const sw = STAIR_CORNERS[0]; wallX(b, M.wall, cz + out + 0.1, cx - out, cx + out, Y[f] - 0.3, Y[f + 1] - 0.3, f === 3 ? [[sw[0] - 0.6, sw[0] + 0.6, 2.4 + 0.3]] : [], 0.2, { tile: [3, 3.2] }); }
    bx(b, M.ceil, cx - out, cx + out, yTop, yTop + 0.1, cz - out, cz + out, { skip: ['+y'], cell: 2 });
    bx(b, M.conc, cx - out, cx + out, Y[0] - 0.1, Y[0], cz - out, cz + out, { skip: ['-y'], tile: 2 });                                     // the floor of the well
    for (let f = 0; f < 3; f++) {
      const rise = (Y[f + 1] - Y[f]) / 4, n = Math.round(rise / 0.2), run = (side - 2 * flat) / n;
      for (let s = 0; s < 4; s++) {
        const a = STAIR_CORNERS[s], c = STAIR_CORNERS[(s + 1) % 4], dx = Math.sign(c[0] - a[0]), dz = Math.sign(c[1] - a[1]), y0 = Y[f] + rise * s;
        // the landing at the corner this side begins at (the first of a floor is the floor's own), and its steps
        if (!(f === 0 && s === 0)) bx(B('escada'), M.tread, a[0] - w / 2, a[0] + w / 2, y0 - 0.14, y0, a[1] - w / 2, a[1] + w / 2, { tile: [1.2, 0.6] });
        for (let i = 0; i < n; i++) {
          const m0 = flat + i * run, m1 = m0 + run, px0 = a[0] + dx * m0, px1 = a[0] + dx * m1, pz0 = a[1] + dz * m0, pz1 = a[1] + dz * m1, yy = y0 + (i + 1) * (rise / n);
          bx(B('escada'), M.tread, Math.min(px0, px1) - (dx ? 0 : w / 2), Math.max(px0, px1) + (dx ? 0 : w / 2), yy - rise / n - 0.1, yy, Math.min(pz0, pz1) - (dz ? 0 : w / 2), Math.max(pz0, pz1) + (dz ? 0 : w / 2), { tile: [1.2, 0.6], cell: 1.4 });
        }
        // the rail on the well's side: a post at each end of the flight, the bar over them
        const ia = [cx + Math.sign(a[0] - cx) * inn, cz + Math.sign(a[1] - cz) * inn], ic = [cx + Math.sign(c[0] - cx) * inn, cz + Math.sign(c[1] - cz) * inn];
        beam(B('escada'), M.frame, [ia[0], y0 + 0.95, ia[1]], [ic[0], y0 + rise + 0.95, ic[1]], 0.045); beam(B('escada'), M.frame, [ia[0], y0 + 0.5, ia[1]], [ic[0], y0 + rise + 0.5, ic[1]], 0.025);
        bx(B('escada'), M.frame, ia[0] - 0.025, ia[0] + 0.025, y0 - 0.1, y0 + 0.95, ia[1] - 0.025, ia[1] + 0.025);
      }
    }
    // the last landing (the third floor) and a rail across the flight that would go on up (boarded)
    { const a = STAIR_CORNERS[0]; bx(B('escada'), M.tread, a[0] - w / 2, a[0] + w / 2, Y[3] - 0.14, Y[3], a[1] - w / 2, a[1] + w / 2, { tile: [1.2, 0.6] }); }
    for (const f of [1, 3]) bx(b, M.white, cx - 0.1, cx + 0.1, Y[f] + 2.6, Y[f] + 2.66, cz + out - 0.3, cz + out - 0.1);
    parts.vao.add(group(b, 'escada'));
  }
  // the third floor: the corridor and the flat
  const cupDoor = pivot(CUP0.x0, APT.y, CUP0.z1, nodeOf('armario')), sash = pivot(0, 0, 0, nodeOf('janela'));
  {
    const b = new kit.Batch(), y = CORR.y, h = CORR.h, sw = STAIR_CORNERS[0];
    // the corridor: floor, ceiling, the end walls, the flats' doors on both sides (all shut but one)
    bx(b, M.tile, CORR.x0, CORR.x1, y - 0.1, y, CORR.z0, CORR.z1, { tile: [1.6, 1.6], skip: ['-y'] }); bx(b, M.ceil, CORR.x0, CORR.x1, y + h, y + h + 0.1, CORR.z0, CORR.z1, { skip: ['+y'], tile: 3 });
    wallZ(b, M.wall, CORR.x0 - 0.1, CORR.z0, CORR.z1, y, y + h, [], 0.2, { tile: [3, h] }); wallZ(b, M.wall, CORR.x1 + 0.1, CORR.z0, CORR.z1, y, y + h, [], 0.2, { tile: [3, h] });
    wallX(b, M.wall, CORR.z0 - 0.1, CORR.x0, STAIR.cx - STAIR.half - STAIR.w / 2, y, y + h, [], 0.2, { tile: [3, h] });                    // the north wall, west of the stairs
    wallX(b, M.wall, CORR.z1 + 0.1, CORR.x0, CORR.x1, y, y + h, [[APT.door - APT.doorW / 2, APT.door + APT.doorW / 2, 2.1]], 0.2, { tile: [3, h] });
    bx(b, M.white, -13.2, -12.8, y + h - 0.06, y + h, CORR.z0 + 0.7, CORR.z0 + 0.9);
    bx(B('caixas'), M.card, CORR.x0 + 0.1, CORR.x0 + 0.7, y, y + 0.45, CORR.z0 + 0.15, CORR.z0 + 0.7); bx(B('caixas'), M.card, CORR.x0 + 0.2, CORR.x0 + 0.65, y + 0.45, y + 0.8, CORR.z0 + 0.2, CORR.z0 + 0.6);   // boxes someone left at the end
    for (let i = 0; i < 2; i++) b.cyl(M.rust, 0.1, 0.1, 0.5, 8, [-9.2 - i * 0.3, y, CORR.z0 + 0.25 + i * 0.05]);
    // the flat: floor, ceiling, walls (the front one with the window), the things under their sheets
    const A = APT, wx0 = WINDOW.x - WINDOW.w / 2, wx1 = WINDOW.x + WINDOW.w / 2;
    bx(b, M.wood, A.x0, A.x1, y - 0.1, y, A.z0, A.z1, { tile: [1.8, 1.8], skip: ['-y'] }); bx(b, M.ceil, A.x0, A.x1, y + h, y + h + 0.1, A.z0, A.z1, { skip: ['+y'], tile: 3 });
    wallZ(b, M.paper, A.x0 - 0.1, A.z0, A.z1, y, y + h, [], 0.2, { tile: [2.4, h] }); wallZ(b, M.paper, A.x1 + 0.1, A.z0, A.z1, y, y + h, [], 0.2, { tile: [2.4, h] });
    // (the front wall: under the sill, over the head and to each side of the window)
    bx(b, M.paper, A.x0, wx0, y, y + h, A.z1, A.z1 + 0.1, { tile: [2.4, h] }); bx(b, M.paper, wx1, A.x1, y, y + h, A.z1, A.z1 + 0.1, { tile: [2.4, h] });
    bx(b, M.paper, wx0, wx1, y, y + WINDOW.sill, A.z1, A.z1 + 0.1, { tile: [2.4, h] }); bx(b, M.paper, wx0, wx1, y + WINDOW.sill + WINDOW.h, y + h, A.z1, A.z1 + 0.1, { tile: [2.4, h] });
    bx(b, M.darkWood, wx0 - 0.06, wx1 + 0.06, y + WINDOW.sill - 0.05, y + WINDOW.sill, A.z1 - 0.12, A.z1 + 0.2, { tile: 1 });
    for (const x of [wx0 - 0.05, wx1]) bx(b, M.darkWood, x, x + 0.05, y + WINDOW.sill, y + WINDOW.sill + WINDOW.h, A.z1 - 0.02, A.z1 + 0.2, { tile: 1 });
    bx(b, M.darkWood, wx0 - 0.05, wx1 + 0.05, y + WINDOW.sill + WINDOW.h, y + WINDOW.sill + WINDOW.h + 0.05, A.z1 - 0.02, A.z1 + 0.2, { tile: 1 });
    b.plane(M.sheet, 0.5, 1.9, [wx1 + 0.35, y + 0.6, A.z1 - 0.03], { ry: Math.PI, tile: [0.6, 1.9] });                                      // a curtain pulled to one side
    // a rug rolled against the wall, a standing lamp without its shade, a picture's nail, a child's drawing-less cork board
    b.cyl(M.cloth, 0.14, 0.14, 1.8, 8, [-17.55, y + 0.14, -16.6], { rx: Math.PI / 2 }); beam(b, M.frame, [-16.7, y, -12.1], [-16.7, y + 1.5, -12.1], 0.03); b.cyl(M.frame, 0.16, 0.16, 0.03, 8, [-16.7, y, -12.1]);
    // the kitchen along the north wall: a counter with a sink, a stove, the fridge with its door open, and the tall cupboard in the corner
    bx(B('cozinha'), M.white, A.x1 - 0.6, A.x1, y, y + 0.88, -16.6, -14.4, { tile: 1.2 }); bx(B('cozinha'), M.metal, A.x1 - 0.63, A.x1, y + 0.88, y + 0.92, -16.65, -14.35);
    bx(B('cozinha'), M.dark, A.x1 - 0.5, A.x1 - 0.1, y + 0.921, y + 0.925, -15.2, -14.7); beam(B('cozinha'), M.metal, [A.x1 - 0.08, y + 0.92, -14.95], [A.x1 - 0.2, y + 1.15, -14.95], 0.025);
    for (let i = 0; i < 4; i++) B('cozinha').cyl(M.dark, 0.08, 0.08, 0.02, 8, [A.x1 - 0.18 - Math.floor(i / 2) * 0.26, y + 0.92, -16.3 + (i % 2) * 0.3]);
    bx(B('cozinha'), M.white, A.x1 - 0.34, A.x1, y + 1.55, y + 2.2, -16.6, -14.4, { tile: 1.2 });
    bx(B('prateleira'), M.darkWood, -14.6, -13.4, y + 1.3, y + 1.34, A.z0, A.z0 + 0.2, { tile: 1 });                                                 // a shelf on the north wall, high (the floor under it is clear)
    for (let i = 0; i < 4; i++) B('prateleira').cyl(M.rust, 0.05, 0.05, 0.12 + (i % 2) * 0.05, 6, [-14.4 + i * 0.28, y + 1.34, A.z0 + 0.1]);
    bx(B('geladeira'), M.white, -17.6, -16.9, y, y + 1.7, A.z0, A.z0 + 0.66, { tile: 1.2 }); B('geladeira').box(M.white, [0.04, 1.1, 0.64], [-16.9, y + 0.55, A.z0 + 0.95], { ry: 0.5, tile: 1.2 }); bx(B('geladeira'), M.dark, -17.52, -16.98, y + 0.6, y + 1.62, A.z0 + 0.6, A.z0 + 0.665);
    // the cupboard's own box (three sides and a top; inside it is dark, a shelf high up)
    const C = CUP0; bx(B('armario'), M.darkWood, C.x0, C.x1, y, y + C.h, C.z0 - 0.02, C.z0 + 0.02, { tile: 1 }); bx(B('armario'), M.darkWood, C.x0, C.x1, y, y + C.h, C.z1 - 0.02, C.z1 + 0.02, { tile: 1 }); bx(B('armario'), M.darkWood, C.x0, C.x1, y + C.h, y + C.h + 0.04, C.z0, C.z1, { tile: 1 });
    bx(B('armario'), M.darkWood, C.x1 - 0.02, C.x1 + 0.02, y, y + C.h, C.z0, C.z1, { tile: 1 });       // its back (it stands out from the wall: a man fits behind it)
    bx(B('armario'), M.darkWood, C.x0 + 0.05, C.x1, y + 1.7, y + 1.73, C.z0, C.z1, { tile: 1 }); bx(B('armario'), M.dark, C.x1 - 0.01, C.x1, y, y + C.h, C.z0, C.z1);
    parts.andar.add(group(b, 'andar'));
    // the flat's door (hinged on its west edge, opening into the flat) and the cupboard's (hinged at its south edge, opening to the room)
    const c = new kit.Batch(), cw = C.z1 - C.z0;
    // (slats with gaps between them: he sees the room through them, and the dog's light comes in in stripes)
    for (const [a, e2, f2, g2] of [[0, 0.05, 0, C.h], [cw - 0.05, cw, 0, C.h], [0, cw, 0, 0.08], [0, cw, C.h - 0.08, C.h], [0, cw, 1.0, 1.06]]) bx(c, M.darkWood, -0.02, 0.02, f2, g2, -e2, -a, { tile: 1 });
    for (let yy = 0.12; yy < C.h - 0.1; yy += 0.11) { if (Math.abs(yy - 1.03) < 0.06) continue; c.box(M.slats, [0.012, 0.045, cw - 0.1], [0, yy, -cw / 2], { rz: 0.35, tile: [1, 0.4], nojitter: true }); }
    cupDoor.add(group(c, 'porta-armario'));
    // the window's sash: a lower leaf that slides up (wood and four panes)
    const s = new kit.Batch(), sy = Y[3] + WINDOW.sill, half = WINDOW.h / 2;
    for (const [a, e2, f2, g2] of [[wx0, wx1, 0, 0.05], [wx0, wx1, half - 0.05, half], [wx0, wx0 + 0.05, 0, half], [wx1 - 0.05, wx1, 0, half], [WINDOW.x - 0.02, WINDOW.x + 0.02, 0, half]]) bx(s, M.darkWood, a, e2, sy + f2, sy + g2, BLOCK.zf + 0.02, BLOCK.zf + 0.06, { tile: 1 });
    s.plane(M.pane, WINDOW.w - 0.1, half - 0.1, [WINDOW.x, sy + 0.05, BLOCK.zf + 0.04], { full: true });
    sash.add(group(s, 'janela-folha'));
    const u = new kit.Batch();    // the upper leaf, fixed
    for (const [a, e2, f2, g2] of [[wx0, wx1, half, half + 0.05], [wx0, wx1, WINDOW.h - 0.05, WINDOW.h], [wx0, wx0 + 0.05, half, WINDOW.h], [wx1 - 0.05, wx1, half, WINDOW.h], [WINDOW.x - 0.02, WINDOW.x + 0.02, half, WINDOW.h]]) bx(u, M.darkWood, a, e2, sy + f2, sy + g2, BLOCK.zf + 0.07, BLOCK.zf + 0.11, { tile: 1 });
    u.plane(M.pane, WINDOW.w - 0.1, half - 0.1, [WINDOW.x, sy + half + 0.05, BLOCK.zf + 0.09], { full: true });
    nodeOf('janela').add(group(u, 'janela-fixa'));
  }

  for (const [id, b] of Object.entries(BS)) nodeOf(id).add(group(b, id));
  const casca = nodeOf('casca'); for (const k of ['fora', 'hall', 'vao', 'andar']) casca.add(nodeOf(`casca:${k}`));
  return { N, handles: { door, glass, shards, loose: loose.pivot, ladder, cupDoor, sash } };
}
/** Which tread of the fire escape's first stair (from the third floor down) gives way. */
export const LOOSE = 5;

// ---- the entities --------------------------------------------------------------------------------------------------------------------------
const Y = BLOCK.y, CH = CORR.y;
/** Where each part's entity stands when the layout has not moved it: the part is built round this place. */
export const ANCHOR = {
  casca: [ORIGIN[0], 0, ORIGIN[2]], portaRua: [DOOR.x - DOOR.w / 2, Y[0], DOOR.z], escadaIncendio: [-13.8, 0, BLOCK.zf],
  correio: [HALL.x0, Y[0], -15.4], balcao: [HALL.x1 - 1.4, Y[0], -14.6], carrinho: [-11.6, Y[0], -15.6], quadroLuz: [HALL.x1, Y[0], -17.6], banco: [HALL.x0 + 0.42, Y[0], -13], vaso: [HALL.x0 + 0.5, Y[0], -18.9],
  escada: [STAIR.cx, Y[0], STAIR.cz], caixas: [CORR.x0 + 0.4, CH, CORR.z0 + 0.42], cozinha: [APT.x1, CH, -15.5], prateleira: [-14, CH, APT.z0], geladeira: [-17.25, CH, APT.z0],
  armario: [CUP0.x0, CH, CUP0.z1], janela: [WINDOW.x, Y[3] + WINDOW.sill, BLOCK.zf],
};
const SPACE = { casca: 'fora', portaRua: 'fora', escadaIncendio: 'fora', janela: 'fora', correio: 'hall', balcao: 'hall', carrinho: 'hall', quadroLuz: 'hall', banco: 'hall', vaso: 'hall', escada: 'vao', caixas: 'andar', cozinha: 'andar', prateleira: 'andar', geladeira: 'andar', armario: 'andar' };
// the parts are made together (they share the plan) and handed out one by one; a part asked for again (an entity rebuilt in the editor) makes them anew
const built = new WeakMap();
function take(kit, part) {
  let c = built.get(kit);
  if (!c || c.taken.has(part)) { c = { all: buildAll(kit), taken: new Set() }; built.set(kit, c); }
  c.taken.add(part);
  return c.all;
}
const CTL = {
  portaRua: (h) => ({ pivot: h.door, door: (a) => { h.door.rotation.y = a; }, glass: (n) => { h.glass[0].visible = n === 0; h.glass[1].visible = n === 1; h.shards.visible = n === 2; } }),
  armario: (h) => ({ pivot: h.cupDoor, door: (a) => { h.cupDoor.rotation.y = a; } }),
  janela: (h) => ({ sash: h.sash, set: (k) => { h.sash.position.y = k * (WINDOW.h / 2 - 0.06); } }),
  escadaIncendio: (h) => ({
    looseNode: h.loose, ladderNode: h.ladder,
    step: (k) => { h.loose.rotation.x = k * 1.25; h.loose.position.y = Y[3] - (LOOSE + 1) * ((Y[3] - Y[2]) / ESCAPE.steps) - k * 0.06; },
    ladder: (k) => { h.ladder.position.y = Y[1] - 2.2 - k * (Y[1] - 2.2 - Y[0] - 0.05); },
  }),
};
const partBuilder = (part) => (kit) => {
  const A = take(kit, part), T = kit.T, root = new T.Group(), inner = A.N[part], an = ANCHOR[part];
  // (the cupboard goes over on the foot of its front, which is where its entity stands: `tip` turns it there)
  const tipG = new T.Group(); inner.position.set(-an[0], -an[1], -an[2]); tipG.add(inner); root.add(tipG);
  const m = { root, dynamic: true, space: SPACE[part], part };
  const foot = FOOT[`predio${cap(part)}`]; if (foot) m.colliderBoxes = foot({});          // (what a body can not walk through: scenes/predio-colliders.js)
  if (CTL[part]) { m.ctl = CTL[part](A.handles); if (part === 'portaRua') m.ctl.glass(0); if (part === 'escadaIncendio') { m.ctl.step(0); m.ctl.ladder(0); } }
  if (part === 'armario') m.ctl.tip = (k) => { tipG.rotation.z = k; };
  if (part === 'casca') { m.collider = { w: BLOCK.x1 - BLOCK.x0, d: BLOCK.zf - BLOCK.zb }; m.spaces = Object.fromEntries(['fora', 'hall', 'vao', 'andar'].map((k) => [k, A.N[`casca:${k}`]])); }
  return m;
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const spaceAt = (e) => (e.pos[1] >= Y[3] - 1 ? 'andar' : 'hall');
const isEditor = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('editor');

export const PREDIO_BUILDERS = {
  ...Object.fromEntries(Object.keys(ANCHOR).map((k) => [`predio${cap(k)}`, partBuilder(k)])),
  /** A flat's door: the leaf hinged at the entity's place, along its +x; `aberta`: radians open, into the flat (its +z). `ctl.set(a)` for the one the chase opens. */
  predioPorta(kit, p, e) {
    installPredioPaints(kit);
    const T = kit.T, root = new T.Group(), pivot = new T.Group(), b = new kit.Batch(); root.add(pivot);
    b.box(M.door, [0.9, 2.08, 0.04], [0.45, 0, 0], { tile: [0.9, 2.08], cell: 1.2, nojitter: true }); b.box(M.metal, [0.04, 0.04, 0.14], [0.78, 1.0, 0], { nojitter: true });
    pivot.add(b.build()); pivot.rotation.y = -(p.aberta ?? 0);
    return { root, dynamic: true, space: e.pos[1] >= Y[3] - 1 ? 'andar' : 'vao', ctl: { pivot, set: (a) => { pivot.rotation.y = -a; } } };
  },
  /** A piece of furniture under a dust sheet: its shape a little bigger and softer; `encosto`: the height of a back along its far side (0: none). */
  predioMovel(kit, p, e) {
    installPredioPaints(kit);
    const T = kit.T, root = new T.Group(), b = new kit.Batch(), w = p.largura ?? 1, d = p.profundidade ?? 1, h = p.altura ?? 0.5, back = p.encosto ?? 0;
    b.box(M.sheet, [w, h, d], [0, 0, 0], { tile: [1.1, 1.1], cell: 0.8, nojitter: true });
    if (back > 0) b.box(M.sheet, [w, back, Math.min(0.3, d * 0.4)], [0, h, d / 2 - Math.min(0.3, d * 0.4) / 2], { tile: [1.1, 1.1], cell: 0.8, nojitter: true });
    root.add(b.build());
    return { root, dynamic: true, space: spaceAt(e), colliderBoxes: FOOT.predioMovel({ params: p }) };
  },
  /** A place of the lure (where it leaves his hand, where a good roll comes to rest): only a mark, seen in the scene editor and never in the game. */
  predioIsca(kit, p, e) {
    const T = kit.T, root = new T.Group();
    if (isEditor()) { const b = new kit.Batch(); b.cyl({ c: '#e8a42a', emissive: 0.9 }, 0.14, 0.14, 0.02, 12, [0, 0, 0]); b.cyl({ c: '#e8a42a', emissive: 0.9 }, 0.02, 0.02, 0.5, 5, [0, 0, 0]); root.add(b.build()); }
    return { root, dynamic: true, space: spaceAt(e) };
  },
};

/**
 * The dust sheet he throws over the dog's sensor: a cloth simulated offline and baked (tools/fuga/bake-pano.mjs -> assets/models/pano-fuga.glb:
 * 121 points, 73 frames at 24 a second, each frame a morph target of the first). Nothing is simulated here: `set` picks the two frames
 * round the moment and writes the points between them (the game's materials do not morph in the shader, and 121 points cost nothing).
 *   set(null)                                        hidden
 *   set({ pos: [x, z], h, yaw })                     bunched in his hands (the first frame, its middle at that place)
 *   set({ t, pos: [x, z], h, yaw })                  `t` seconds after it left his hands, in the frame of the dog (its place on the floor, the way it faces)
 * `ready`: a promise, when the bake has loaded (until then it is not drawn); `cost()`: the mean milliseconds of a `set`.
 */
export function buildCloth(kit) {
  installPredioPaints(kit);
  const T = kit.T, root = new T.Group(), mat = kit.mat({ ...M.sheet, side: 'double' });
  root.visible = false; root.name = 'pano-fuga';
  let mesh = null, frames = null, fps = 24, hand = [0, 1.25, 0.95], want = null, spent = 0, calls = 0;
  const apply = (c) => {
    want = c; root.visible = Boolean(c) && Boolean(mesh); if (!c || !mesh) return;
    const t0 = globalThis.performance?.now() ?? 0, pos = mesh.geometry.attributes.position, base = frames[0], thrown = c.t != null;
    root.position.set(c.pos[0], c.h ?? 0, c.pos[1]); root.rotation.y = (c.yaw ?? 0) + Math.PI;                 // (the bake's +z is the way the dog faces)
    mesh.position.set(thrown ? 0 : -hand[0], thrown ? 0 : -hand[1], thrown ? 0 : -hand[2]);
    const f = thrown ? Math.max(0, Math.min(frames.length - 1, c.t * fps)) : 0, a = Math.floor(f), b = Math.min(frames.length - 1, a + 1), k = f - a, A = frames[a], B = frames[b];
    for (let i = 0; i < base.length; i++) pos.array[i] = base[i] + (a ? A[i] : 0) + ((b ? B[i] : 0) - (a ? A[i] : 0)) * k;
    pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
    spent += (globalThis.performance?.now() ?? 0) - t0; calls++;
  };
  const ready = new GLTFLoader().loadAsync(new URL('../../../assets/models/pano-fuga.glb', import.meta.url).href).then((g) => {
    let src = null; g.scene.traverse((o) => { if (o.isMesh) src = o; });
    const geo = src.geometry, ex = src.userData ?? {}; fps = ex.fps ?? fps; hand = ex.hand ?? hand;
    frames = [Float32Array.from(geo.attributes.position.array), ...(geo.morphAttributes.position ?? []).map((m) => Float32Array.from(m.array))];
    const own = new T.BufferGeometry(); own.setAttribute('position', new T.BufferAttribute(Float32Array.from(frames[0]), 3)); own.setAttribute('uv', geo.attributes.uv.clone()); own.setIndex(geo.index.clone()); own.computeVertexNormals();
    mesh = new T.Mesh(own, mat); mesh.frustumCulled = false; root.add(mesh); apply(want);
  }).catch((e) => { console.info('pano: the baked sheet did not load', e?.message ?? e); });
  return { root, set: apply, ready, cost: () => (calls ? spent / calls : 0), get frames() { return frames?.length ?? 0; } };
}
