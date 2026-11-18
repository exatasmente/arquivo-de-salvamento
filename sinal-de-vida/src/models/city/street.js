// The street itself, with form: the lamp (a real pole with an arm), the car (a lofted body with a cabin, wheels and lights), the viaduct
// (girders under the deck, a parapet with a rail, expansion joints), its pillars (a flared head, ribs, a striped plinth), the vent shaft
// of the unfinished station (a wide floor grille, the rope and the cable going down), storm drains, rubble and litter, dead trees,
// kerbs, and the walled-off entrance of the station that was never opened. Builders return what models/objects.js builders return
// ({ root, collider, light, hide, exit ... }); the rua scene uses them in place of the old boxes, by the same entity types.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { addPiece } from './pieces.js';
import { place as placeProp, have as haveProp } from '../props/place.js';

const make = (kit, fill) => {
  const b = new kit.Batch(), x = fill(b) ?? {};
  const root = new kit.T.Group(); root.add(b.build());
  return { root, ...x };
};
const CONC = { c: '#8c8c88', map: 'concreto' }, CONC_D = { c: '#6a6c6a', map: 'umido' }, STEEL = { c: '#6a6e74', map: 'metal' }, DARK = { c: '#26282c', map: 'metal' }, BLACK = { c: '#101114' };

/** A tube between two points. */
function tube(kit, b, spec, a, c, rad, seg = 6) {
  const T = kit.T, from = new T.Vector3(...a), to = new T.Vector3(...c), len = from.distanceTo(to);
  const g = new T.CylinderGeometry(rad, rad, len, seg, 1);
  const m = new T.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize()), new T.Vector3(1, 1, 1));
  b.add(spec, g, m);
}

export const STREET_BUILDERS = {
  poste: (kit, p) => make(kit, (b) => {
    const h = p.altura, pole = new kit.T.CylinderGeometry(1, 1, 1, 10, 1);
    void pole;
    addPiece(b, 'lamp_pole', { pos: [0, 0, 0], scale: [1, h, 1] });
    b.cyl({ c: '#8c8c88', map: 'concreto' }, 0.2, 0.2, 0.22, 10, [0, 0, 0], { tile: 1 }); b.cyl(STEEL, 0.16, 0.16, 0.08, 10, [0, 0.22, 0]);
    addPiece(b, 'lamp_head', { pos: [0, h - 1.1, 0], glow: p.cor, on: p.acesa });
    return { collider: { w: 0.3, d: 0.3 }, light: p.acesa ? { color: p.cor, range: p.alcance, y: h - 0.4, z: 1.4, night: true } : null };
  }),
  carro: (kit, p) => make(kit, (b) => {
    const L = p.tipo === 'furgao' ? 5.0 : p.tipo === 'van' ? 4.6 : 4.2;
    addPiece(b, `car_${p.tipo}`, { body: p.cor, lit: p.luzes, ry: 0 });
    if (p.porta) b.box({ c: p.cor, map: 'metal' }, [0.06, 0.6, 1.2], [1.2, 0.6, 0.3], { ry: -0.9 });
    b.plane({ c: '#ffffff', map: 'p:vialume' }, 0.4, 0.4, [0.925, 0.42, 0.2], { full: true, ry: Math.PI / 2 }); // the pictogram of the company on the door (no name)
    return { collider: { w: 1.9, d: L } };
  }),
  viaduto: (kit, p) => make(kit, (b) => {
    const Lg = p.comprimento, W = p.largura, y = p.altura;
    // the deck's slab, the girders under it (ribs along Z) with cross beams, the edge beams
    b.box({ c: '#6e6e6a', map: 'concreto' }, [W, 0.5, Lg], [0, y + 0.4, 0], { cell: 4, tile: 3 });
    for (let i = 0; i < 5; i++) b.box({ c: '#64645f', map: 'concreto' }, [0.5, 0.9, Lg], [-W / 2 + 0.8 + (i * (W - 1.6)) / 4, y - 0.5, 0], { cell: 4, tile: 3, skip: ['+y'] });
    for (let z = -Lg / 2 + 2; z < Lg / 2; z += 5) b.box({ c: '#5e5e5a', map: 'concreto' }, [W - 1.2, 0.5, 0.3], [0, y - 0.4, z], { cell: 4, tile: 2, skip: ['+y'] });
    b.box({ c: '#7a7a76', map: 'concreto' }, [W + 0.2, 0.35, Lg], [0, y + 0.0, 0], { cell: 4, tile: 3, skip: ['+y'] });
    // the parapet: a low concrete wall with a steel rail over it, posts every 4 m, panels between them
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.2);
      b.box({ c: '#7a7a76', map: 'concreto' }, [0.4, 0.8, Lg], [x, y + 0.9, 0], { cell: 4, tile: 3 });
      b.box({ c: '#8a8a86', map: 'concreto' }, [0.55, 0.12, Lg], [x, y + 1.7, 0], { cell: 4, tile: 3 });
      for (let z = -Lg / 2 + 1; z <= Lg / 2; z += 4) { b.box(DARK, [0.1, 0.9, 0.1], [x, y + 1.82, z]); b.box({ c: '#3a3a3c', map: 'metal' }, [0.04, 0.5, 3.6], [x, y + 1.9, z + 2], { cell: 4, tile: 2 }); }
      b.box(DARK, [0.08, 0.08, Lg], [x, y + 2.72, 0], { cell: 4 });
      for (let z = -Lg / 2 + 6; z < Lg / 2; z += 22) b.box({ c: '#101114' }, [0.1, 0.5, 0.5], [x + s * 0.0, y - 0.6, z]); // drain spouts: dark mouths under the edge
    }
    b.box({ c: '#1c1d20', map: 'asfalto' }, [W - 1.2, 0.03, Lg], [0, y + 1.28, 0], { tile: 4, cell: 6 });
    for (let z = -Lg / 2 + 3; z < Lg / 2; z += 6) b.box({ c: '#d8d0a0' }, [0.15, 0.02, 2.4], [0, y + 1.3, z]);
    for (let z = -Lg / 2 + 8; z < Lg / 2; z += 15) b.box({ c: '#3a3a3c', map: 'metal' }, [W - 1.2, 0.02, 0.18], [0, y + 1.3, z], { cell: 6 }); // expansion joints
    return {};
  }),
  pilar: (kit, p) => make(kit, (b) => {
    const R = p.raio, H = p.altura, T = kit.T;
    b.cyl({ c: '#7a7a76', map: 'concreto' }, R, R * 1.12, H - 1.0, 14, [0, 0, 0], { tile: 2 });
    const cap = new T.CylinderGeometry(R * 1.9, R * 1.05, 1.0, 14, 1); b.geo({ c: '#74746f', map: 'concreto' }, cap, [0, H - 0.5, 0]);   // the flared head
    b.box({ c: '#64645f', map: 'concreto' }, [R * 4.2, 0.5, R * 4.2], [0, H - 0.0, 0], { cell: 3 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box({ c: '#6a6a66', map: 'concreto' }, [0.1, H - 1.2, 0.12], [Math.cos(a) * R * 1.02, 0.4, Math.sin(a) * R * 1.02], { ry: -a, cell: 4 }); } // the ribs
    b.box({ c: '#6a6a66', map: 'concreto' }, [R * 2.9, 0.5, R * 2.9], [0, 0, 0], { cell: 3, tile: 1 });                                 // the plinth
    b.box({ c: '#d6a82a', map: 'faixa' }, [R * 2.5, 0.7, R * 2.5], [0, 0.5, 0], { skip: ['+y', '-y'], tile: 0.5 });
    return { collider: { w: R * 2.3, d: R * 2.3 } };
  }),
  bueiro: (kit) => make(kit, (b) => {
    b.box({ c: '#202226' }, [1.0, 0.02, 0.75], [0, -0.01, 0]);
    b.box({ c: '#3a3c40', map: 'metal' }, [1.1, 0.04, 0.1], [0, 0, 0.4], { cell: 3 }); b.box({ c: '#3a3c40', map: 'metal' }, [1.1, 0.04, 0.1], [0, 0, -0.4], { cell: 3 });
    for (const s of [-1, 1]) b.box({ c: '#3a3c40', map: 'metal' }, [0.1, 0.04, 0.8], [s * 0.5, 0, 0], { cell: 3 });
    for (let i = 0; i < 7; i++) b.box({ c: '#7a7e84', map: 'metal' }, [0.05, 0.035, 0.7], [-0.4 + i * 0.133, 0, 0], { cell: 3 });
    return {};
  }),
  bocaRua: (kit) => {
    // the ventilation shaft of the unfinished metro station: a concrete kerb round a wide grille in the pavement, a dark well under it, the grille
    // bent open at one side, the rope going down and the thick cable coming in. The rope and the cable keep their place (the game climbs there).
    const m = make(kit, (b) => {
      const W = 2.4, D = 1.5;
      for (const s of [-1, 1]) { b.box(CONC, [W + 0.5, 0.2, 0.25], [0, 0, s * (D / 2 + 0.12)], { cell: 3, tile: 1 }); b.box(CONC, [0.25, 0.2, D], [s * (W / 2 + 0.12), 0, 0], { cell: 3, tile: 1 }); }
      b.box(BLACK, [W, 0.02, D], [0, -0.01, 0]);
      // the grille: bars along the length, three cross ties; the two near ones bent up like a lid forced open
      for (let i = 0; i < 11; i++) { const z = -D / 2 + 0.08 + (i * (D - 0.16)) / 10, up = i < 4 ? 0.5 : 0; b.box({ c: '#5a5e64', map: 'metal' }, [W - 0.1, 0.05, 0.06], [0, up ? 0.0 : 0.08, z + (up ? -0.2 : 0)], { rx: up ? 0.62 : 0, cell: 3, nojitter: true }); }
      for (const x of [-W / 2 + 0.2, 0, W / 2 - 0.2]) b.box({ c: '#4a4e54', map: 'metal' }, [0.07, 0.07, D], [x, 0.04, 0], { cell: 3 });
      // down in the well: dark walls with the rungs of an old ladder, the rope tied to an anchor on the kerb and going down through the grille, the cable coming in
      const WALL = { c: '#14161a', map: 'umido' };
      b.plane(WALL, W - 0.1, 2.6, [0, -2.6, -D / 2 + 0.05], { tile: 2, cell: 4 }); b.plane(WALL, W - 0.1, 2.6, [0, -2.6, D / 2 - 0.05], { ry: Math.PI, tile: 2, cell: 4 });
      b.plane(WALL, D - 0.1, 2.6, [-W / 2 + 0.05, -2.6, 0], { ry: Math.PI / 2, tile: 2, cell: 4 }); b.plane(WALL, D - 0.1, 2.6, [W / 2 - 0.05, -2.6, 0], { ry: -Math.PI / 2, tile: 2, cell: 4 });
      for (let i = 0; i < 6; i++) b.box({ c: '#6a6e74', map: 'ferrugem' }, [0.5, 0.04, 0.05], [-0.7, -0.35 - i * 0.4, -D / 2 + 0.1], { cell: 3 });
      const rope = { c: '#d8c8a0', map: 'tecido' };   // the rope: a coil on the paving, tied round a bar of the grille, and down into the well
      for (let k = 0; k < 3; k++) { const a0 = k * 2.1; tube(kit, b, rope, [0.9 + Math.cos(a0) * 0.2, 0.03, 1.2 + Math.sin(a0) * 0.2], [0.9 + Math.cos(a0 + 2.0) * 0.2, 0.03, 1.2 + Math.sin(a0 + 2.0) * 0.2], 0.04, 5); }
      tube(kit, b, rope, [0.9, 0.03, 1.1], [0.62, 0.1, 0.3], 0.04, 5); tube(kit, b, rope, [0.62, 0.1, 0.3], [0.5, 0.0, 0.1], 0.04, 5); tube(kit, b, rope, [0.5, 0.0, 0.1], [0.46, -2.2, 0.05], 0.04, 5);
      b.cyl({ c: '#1e1e22', map: 'borracha' }, 0.07, 0.07, 3.0, 8, [-0.9, 0.0, 0.1], { rz: Math.PI / 2 });                   // the cable
      tube(kit, b, { c: '#1e1e22', map: 'borracha' }, [-W / 2 + 0.1, 0.02, 0.1], [-0.3, -1.6, 0.2], 0.07, 8);
    });
    return { ...m, exit: true };
  },
  entulho: (kit, p) => make(kit, (b) => {
    const T = kit.T, r = mulberry32(p.semente * 13 + 1), spec = [{ c: '#7a7a76', map: 'concreto' }, { c: '#6a5a4a', map: 'concreto' }, { c: '#8a8a86', map: 'concreto' }, { c: '#9a6a52', map: 'tijolo' }];
    for (let i = 0; i < 22; i++) {
      const g = new T.IcosahedronGeometry(0.16 + r() * 0.3, 0); g.scale(1 + r() * 0.6, 0.6 + r() * 0.5, 1 + r() * 0.6);
      const a = r() * 6.3, d = Math.sqrt(r()) * 0.85, y = (1 - d) * 0.35 * r();
      b.add(spec[Math.floor(r() * spec.length)], g, new T.Matrix4().compose(new T.Vector3(Math.cos(a) * d * 1.1, 0.1 + y, Math.sin(a) * d * 0.8), new T.Quaternion().setFromEuler(new T.Euler(r() * 3, r() * 6, r() * 3)), new T.Vector3(1, 1, 1)));
    }
    for (let i = 0; i < 4; i++) tube(kit, b, { c: '#5a3a2a', map: 'ferrugem' }, [(r() - 0.5) * 1.2, 0.1, (r() - 0.5) * 0.8], [(r() - 0.5) * 1.4, 0.7 + r() * 0.5, (r() - 0.5) * 0.9], 0.015, 4); // rebar
    for (let i = 0; i < 3; i++) b.box({ c: '#a88a5a', map: 'madeira' }, [0.8 + r() * 0.5, 0.05, 0.12], [(r() - 0.5), 0.35 + r() * 0.25, (r() - 0.5) * 0.7], { rz: (r() - 0.5) * 0.8, ry: r() * 3 });
    b.box({ c: '#1a1a1a', map: 'borracha' }, [1.5, 0.01, 1.2], [0, 0.002, 0], { cell: 3 });
    return { hide: { radius: 1.3 } };
  }),
  lixo: (kit, p) => make(kit, (b) => {
    // litter and the marks on the ground: scraps, cans, torn bags, a tyre, a stain, cracks; never blocks the way
    const T = kit.T, r = mulberry32(p.semente * 53 + 9), n = p.quantidade, R = p.raio;
    const pal = [{ c: '#a88a5a', map: 'madeira' }, { c: '#8a8a80', map: 'tecido' }, { c: '#5a6a7a', map: 'metal' }, { c: '#7a4a3a', map: 'ferrugem' }, { c: '#c8c4b4', map: 'tecido' }, { c: '#3a3a3a', map: 'borracha' }];
    for (let i = 0; i < n; i++) {
      const a = r() * 6.3, d = Math.sqrt(r()) * R, k = r(), sp = pal[Math.floor(r() * pal.length)], x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (k < 0.3) b.box(sp, [0.08 + r() * 0.25, 0.02 + r() * 0.05, 0.08 + r() * 0.25], [x, 0, z], { ry: r() * 3, cell: 3, nojitter: true });
      else if (k < 0.5) b.cyl(sp, 0.035, 0.035, 0.11, 6, [x, 0, z], { rz: r() < 0.5 ? Math.PI / 2 : 0, ry: r() * 3 });
      else if (k < 0.65) { const g = new T.SphereGeometry(0.16 + r() * 0.1, 6, 4); g.scale(1, 0.45, 0.8); b.geo({ c: ['#2a2a2e', '#c8c8c0', '#4a5a6a'][Math.floor(r() * 3)], map: 'tecido' }, g, [x, 0.04, z], { ry: r() * 3 }); } // a bag
      else if (k < 0.7 && R > 1.4) b.cyl({ c: '#2a2a2c', map: 'borracha' }, 0.28, 0.28, 0.2, 10, [x, 0, z]);                                                // a tyre
      else b.plane({ c: '#d8d4c4', map: 'tecido' }, 0.14 + r() * 0.2, 0.18 + r() * 0.2, [x, 0.008, z], { flat: true, ry: r() * 3, cell: 3 });
    }
    for (let i = 0; i < 3; i++) b.plane({ c: '#16161a', opacity: 0.5 }, 0.6 + r() * 1.2, 0.5 + r() * 1.0, [(r() - 0.5) * R, 0.006, (r() - 0.5) * R], { flat: true, ry: r() * 3, cell: 9 });
    for (let i = 0; i < 4; i++) b.box({ c: '#26262a' }, [0.8 + r() * 1.6, 0.004, 0.025], [(r() - 0.5) * R * 1.2, 0.004, (r() - 0.5) * R * 1.2], { ry: r() * 3, cell: 9 });
    for (let i = 0; i < 5; i++) b.box({ c: '#6a5a3a' }, [0.25 + r() * 0.5, 0.01, 0.2 + r() * 0.4], [(r() - 0.5) * R, 0.005, (r() - 0.5) * R], { ry: r() * 3, cell: 9 });
    return {};
  }),
};

/** A dead tree: a trunk, forked branches and a few dry leaves, from a seed. */
function deadTree(kit, b, x, z, seed, y0 = 0.15) {
  const r = mulberry32(seed * 37 + 3), bark = { c: '#5a4a3a', map: 'madeira' }, T = kit.T;
  const H = 3.2 + r() * 1.8;
  b.cyl(bark, 0.07, 0.15, H * 0.7, 7, [x, y0, z], { tile: 1 });
  const grow = (px, py, pz, ax, az, len, rad, depth) => {
    const nx = px + ax * len, ny = py + len * (0.7 + r() * 0.4), nz = pz + az * len;
    tube(kit, b, bark, [px, py, pz], [nx, ny, nz], rad, 5);
    if (depth > 0) for (let i = 0; i < 2; i++) grow(nx, ny, nz, ax + (r() - 0.5) * 1.1, az + (r() - 0.5) * 1.1, len * (0.6 + r() * 0.2), rad * 0.6, depth - 1);
    else if (r() < 0.5) { const g = new T.PlaneGeometry(0.22, 0.18); b.geo({ c: '#8a6a3a', map: 'tecido', side: 'double' }, g, [nx, ny, nz], { ry: r() * 6, rx: r() }); }
  };
  for (let i = 0; i < 3; i++) grow(x, y0 + H * 0.55, z, (r() - 0.5) * 1.5, (r() - 0.5) * 1.5, 0.9 + r() * 0.8, 0.045, 2);
}
const rep = (n, f) => { for (let i = 0; i < n; i++) f(i); };

/**
 * The terrain details a scene adds to its ground batch `tb` (the avenue runs along X, road |z| < road, sidewalks to `walk`): a proper kerb
 * with a lip and a gutter, storm grates in the gutters, manhole covers, patches in the asphalt, tactile paving at the crossings, kerb ramps,
 * and by the kind of the sector: dead trees and fences (residencial), bollards, a rail and benches (orla), drums and fences (industrial),
 * benches and bins (comercial, avenida). `S` is STREET, `r` a random function.
 */
export function terrainDetails(kit, tb, S, kindName, r, spots = {}) {
  const { road, walk, curb, halfX } = S, T = kit.T;
  const KB = { c: '#9a9894', map: 'concreto' }, col = spots.collide ?? (() => {}), avoid = spots.avoid ?? (() => false); // avoid(x, z, half): too near a patrol route
  for (const s of [-1, 1]) {
    // the kerb stones: separate blocks with joints and chipped corners, a dark gutter, the lip
    for (let x = -halfX - 3; x < halfX + 3; x += 1.6) {
      const k = 0.9 + r() * 0.15;
      tb.box({ c: mixc(k), map: 'concreto' }, [1.58, curb + 0.04, 0.22], [x + 0.8, -0.02, s * (road + 0.11)], { cell: 3, tile: 1, nojitter: true });
    }
    tb.box({ c: '#3a3a3e' }, [200, 0.012, 0.35], [0, 0.0, s * (road - 0.18)], { cell: 20 });
    for (let x = -halfX; x <= halfX; x += 17 + Math.floor(r() * 6)) {
      const gx = x + (r() - 0.5) * 3;
      if (Math.abs(gx) < 4 || (spots.skipGrate && spots.skipGrate(gx, s))) continue;
      tb.box({ c: '#202226' }, [0.9, 0.012, 0.3], [gx, 0.0, s * (road - 0.3)]);
      rep(6, (i) => tb.box({ c: '#7a7e84', map: 'metal' }, [0.04, 0.02, 0.28], [gx - 0.4 + i * 0.16, 0.0, s * (road - 0.3)], { cell: 3 }));
    }
  }
  // manhole covers in the lanes and patches in the asphalt
  rep(7, (i) => {
    const x = -halfX + 6 + r() * (2 * halfX - 12), z = (r() < 0.5 ? -1 : 1) * (1.2 + r() * 4);
    if (Math.abs(x) < 6) return;
    tb.cyl({ c: '#4a4c50', map: 'ferrugem' }, 0.42, 0.42, 0.02, 14, [x, 0.0, z], { tile: 0.5 });
    tb.cyl({ c: '#2a2c30' }, 0.34, 0.34, 0.024, 14, [x, 0.0, z]);
    rep(3, (k) => tb.box({ c: '#6a6e74', map: 'metal' }, [0.5, 0.026, 0.035], [x, 0.0, z - 0.1 + k * 0.1], { cell: 3 }));
    void i;
  });
  rep(10, () => {
    const x = -halfX + r() * halfX * 2, z = (r() - 0.5) * 11, w = 1.2 + r() * 3, d = 0.8 + r() * 1.4;
    if (Math.abs(z) < 0.3) return;
    tb.box({ c: '#5a5a62', map: 'asfalto' }, [w, 0.008, d], [x, 0.0, z], { ry: (r() - 0.5) * 0.15, cell: 9, tile: 2 });
  });
  // the crossings (x = -24 and 26): yellow tactile paving and kerb ramps
  for (const cx of [-24, 26]) for (const s of [-1, 1]) {
    tb.box({ c: '#c8a838', map: 'faixa' }, [3.2, 0.02, 0.6], [cx, curb, s * (road + 0.5)], { tile: 0.4, cell: 4 });
    for (const dx of [-1.8, 1.8]) tb.box({ c: '#aaa8a0', map: 'calcada' }, [0.4, curb, 0.6], [cx + dx, 0, s * (road + 0.5)], { cell: 4 });
  }
  // by the kind of the sector
  const nT = { residencial: 8, orla: 3, comercial: 3, avenida: 2, industrial: 1 }[kindName] ?? 2;
  rep(nT, (i) => {
    const x = -halfX + 8 + r() * (2 * halfX - 16), s = r() < 0.5 ? -1 : 1, z = s * (road + 0.85);
    if (Math.abs(x) < 8 || (spots.skipTree && spots.skipTree(x, s)) || avoid(x, z, 0.3)) return;
    tb.box({ c: '#4a3a2a', map: 'ferrugem' }, [1.0, 0.04, 1.0], [x, curb, z], { cell: 4 });   // the tree pit's earth
    for (const [dx, dz, w, d] of [[0, -0.55, 1.2, 0.1], [0, 0.55, 1.2, 0.1], [-0.55, 0, 0.1, 1.0], [0.55, 0, 0.1, 1.0]]) tb.box(STEEL, [w, 0.1, d], [x + dx, curb, z + dz], { cell: 3 });
    deadTree(kit, tb, x, z, i * 13 + 5, curb); col(`arvore-${i}`, x, z, 0.3, 0.3);
  });
  if (kindName === 'orla' || kindName === 'comercial' || kindName === 'avenida') rep(kindName === 'orla' ? 6 : 3, (i) => {
    const x = -halfX + 10 + r() * (2 * halfX - 20), s = r() < 0.5 ? -1 : 1;
    if (Math.abs(x) < 8 || (spots.skipFurniture && spots.skipFurniture(x, s))) return;
    if (avoid(x, i % 2 === 0 ? s * (walk - 0.9) : s * (road + 0.7), i % 2 === 0 ? 1.0 : 0.3)) return;
    if (i % 2 === 0) { addPiece(tb, 'bench', { pos: [x, curb, s * (walk - 0.9)], ry: s > 0 ? Math.PI : 0 }); col(`banco-${i}`, x, s * (walk - 0.9), 1.9, 0.55); } else { addPiece(tb, 'trash_bin', { pos: [x, curb, s * (road + 0.7)] }); col(`lixeira-${i}`, x, s * (road + 0.7), 0.5, 0.5); }
  });
  if (kindName === 'orla') for (let x = -halfX + 2; x < halfX - 1; x += 2.2) { if (Math.abs(x) < 6 || x > -10 && x < 6 || avoid(x, -(walk - 0.4), 0.2)) continue; addPiece(tb, 'bollard', { pos: [x, curb, -(walk - 0.4)] }); col(`balizador-${Math.round(x)}`, x, -(walk - 0.4), 0.3, 0.3); }
  if (kindName === 'residencial') rep(4, () => { const x = -halfX + 10 + r() * (2 * halfX - 20), s = r() < 0.5 ? -1 : 1; if (Math.abs(x) > 8 && !avoid(x, s * (walk - 0.5), 0.3)) { addPiece(tb, 'trash_bin', { pos: [x, curb, s * (walk - 0.5)] }); col(`lixeira-r${Math.round(x)}`, x, s * (walk - 0.5), 0.5, 0.5); } });
  if (kindName === 'industrial') rep(5, () => { const x = -halfX + 6 + r() * (2 * halfX - 12), s = r() < 0.5 ? -1 : 1; if (Math.abs(x) < 8 || avoid(x, s * (walk - 0.6), 0.4)) return; tb.cyl({ c: ['#a8442a', '#3a5a8a', '#6a7a4a'][Math.floor(r() * 3)], map: 'metal' }, 0.3, 0.3, 0.9, 10, [x, curb, s * (walk - 0.6)]); col(`barril-${Math.round(x)}`, x, s * (walk - 0.6), 0.7, 0.7); });
  void T; void KB;
}
/**
 * Where the details of the ground go, without drawing them: the same walk through the same random numbers as terrainDetails (so the trees,
 * the benches and the bins, and their colliders, stand where they always stood), for the painted ground of models/city/ground.js.
 * Returns { grates: [[x, side]], manholes: [[x, z]], trees: [{ i, x, s }], benches: [{ i, x, s }], bins: [{ i, x, s }] }.
 */
export function planDetails(S, kindName, r, spots = {}) {
  const { road, walk, halfX } = S, out = { grates: [], manholes: [], trees: [], benches: [], bins: [] };
  for (const s of [-1, 1]) {
    for (let x = -halfX - 3; x < halfX + 3; x += 1.6) r();
    for (let x = -halfX; x <= halfX; x += 17 + Math.floor(r() * 6)) { const gx = x + (r() - 0.5) * 3; if (Math.abs(gx) < 4 || (spots.skipGrate && spots.skipGrate(gx, s))) continue; out.grates.push([gx, s]); }
  }
  rep(7, () => { const x = -halfX + 6 + r() * (2 * halfX - 12), z = (r() < 0.5 ? -1 : 1) * (1.2 + r() * 4); if (Math.abs(x) < 6) return; out.manholes.push([x, z]); });
  rep(10, () => { r(); const z = (r() - 0.5) * 11; r(); r(); if (Math.abs(z) < 0.3) return; r(); });
  const nT = { residencial: 8, orla: 3, comercial: 3, avenida: 2, industrial: 1 }[kindName] ?? 2;
  rep(nT, (i) => { const x = -halfX + 8 + r() * (2 * halfX - 16), s = r() < 0.5 ? -1 : 1; if (Math.abs(x) < 8 || (spots.skipTree && spots.skipTree(x, s))) return; out.trees.push({ i, x, s, z: s * (road + 0.85) }); });
  if (kindName === 'orla' || kindName === 'comercial' || kindName === 'avenida') rep(kindName === 'orla' ? 6 : 3, (i) => {
    const x = -halfX + 10 + r() * (2 * halfX - 20), s = r() < 0.5 ? -1 : 1;
    if (Math.abs(x) < 8 || (spots.skipFurniture && spots.skipFurniture(x, s))) return;
    if (i % 2 === 0) out.benches.push({ i, x, s, z: s * (walk - 0.9) }); else out.bins.push({ i, x, s, z: s * (road + 0.7) });
  });
  return out;
}
const mixc = (k) => '#' + [0x9a, 0x98, 0x94].map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, '0')).join('');

/**
 * The entrance of the station that was never finished (a landmark of the street, closed and only scenery): a stair going down into the ground,
 * walled in by construction hoarding with no sign or name, rubble heaped over the steps, a dead lamp over it. It stands on the south sidewalk
 * beside the vent shaft. Returns the colliders [{ id, min, max }] it takes.
 */
export function stationEntrance(kit, b, S, seed = 1) {
  const r = mulberry32(seed * 71 + 5), T = kit.T, H = S.curb, st = S.station, cx = (st.x0 + st.x1) / 2, w = st.x1 - st.x0, zA = st.z0, zB = st.z1, hoard = { c: '#c8b48c', map: 'tapume' };
  // the stairwell: a concrete kerb, steps going down into the dark, handrails
  b.box({ c: '#101114' }, [w - 0.8, 0.02, zB - zA - 0.8], [cx, H, (zA + zB) / 2]);
  for (let i = 0; i < 6; i++) b.box({ c: '#7a7a76', map: 'concreto' }, [w - 1.4, 0.2, 0.42], [cx, H - 0.2 * (i + 1), zA + 0.7 + i * 0.42], { cell: 3, tile: 1, nojitter: true, skip: ['-y'] });
  for (const s of [-1, 1]) { b.box({ c: '#8a8a86', map: 'concreto' }, [0.3, 0.5, zB - zA], [cx + s * (w / 2 - 0.15), H, (zA + zB) / 2], { cell: 3, tile: 2, outline: true }); tube(kit, b, STEEL, [cx + s * (w / 2 - 0.5), H + 1.0, zA + 0.5], [cx + s * (w / 2 - 0.5), H + 0.1, zB - 0.5], 0.03, 5); }
  // the hoarding: plywood panels on posts, 2.4 m high, with a gap that was chained shut, and hazard tape
  const painted = haveProp('tapume_painel');
  const panel = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), an = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2 * 0;
    // which way is out: away from the middle of the stairwell (the painted panel has a face and a back)
    const mxm = (x0 + x1) / 2 - cx, mzm = (z0 + z1) / 2 - (zA + zB) / 2, fx = Math.sin(an + Math.PI / 2), fz = Math.cos(an + Math.PI / 2), out = fx * mxm + fz * mzm;
    const n = Math.max(1, Math.round(L / 2.4)), pl = L / n;
    for (let i = 0; i < n; i++) {
      const mx = x0 + ((x1 - x0) * (i + 0.5)) / n, mz = z0 + ((z1 - z0) * (i + 0.5)) / n, tilt = (r() - 0.5) * 0.03;
      // the painted panel (tools/props, `tapume_painel`: two sheets on a post at its start, the rails behind, the tape), its face to the street
      if (painted) { placeProp(kit, b, 'tapume_painel', { pos: [mx, H, mz], ry: an + Math.PI / 2 + (out > 0 ? 0 : Math.PI), rz: tilt, scale: [pl / 2.4, 1, 1] }); continue; }
      b.box(hoard, [pl - 0.04, 2.4, 0.06], [mx, H, mz], { ry: an + Math.PI / 2, rz: tilt, tile: 2.4, cell: 3, nojitter: true });
      const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n; b.box({ c: '#4a3a2a', map: 'madeira' }, [0.12, 2.6, 0.12], [px, H, pz], { cell: 3 });
    }
    if (painted) { placeProp(kit, b, 'tapume_poste', { pos: out > 0 ? [x0, H, z0] : [x1, H, z1] }); return; }   // (each panel brings the post of one end)
    b.box({ c: '#4a3a2a', map: 'madeira' }, [0.12, 2.6, 0.12], [x1, H, z1], { cell: 3 });
    b.box({ c: '#d6a82a', map: 'faixa' }, [0.05, 0.12, L], [(x0 + x1) / 2, H + 1.3, (z0 + z1) / 2], { ry: an, tile: 0.4 });
  };
  panel(st.x0, zA, st.x0, zB); panel(st.x1, zA, st.x1, zB);
  panel(st.x0, zB, st.x1, zB); panel(st.x0, zA, cx - 0.9, zA); panel(cx + 0.9, zA, st.x1, zA);
  b.box({ c: '#4e4f4c', map: 'chapa' }, [1.8, 1.9, 0.08], [cx, H, zA], { cell: 3, outline: true, tile: [1.8, 1.9], nojitter: true });                   // the door in the hoarding, shut, with a chain
  tube(kit, b, STEEL, [cx - 0.5, H + 1.0, zA - 0.07], [cx + 0.5, H + 0.9, zA - 0.07], 0.02, 4);
  b.cyl({ c: '#7a7e84', map: 'metal' }, 0.07, 0.07, 0.1, 6, [cx, H + 0.95, zA - 0.08], { rx: Math.PI / 2 });
  // rubble heaped over the steps and the corners
  for (let i = 0; i < 26; i++) {
    const g = new T.IcosahedronGeometry(0.15 + r() * 0.28, 0); g.scale(1 + r() * 0.5, 0.6 + r() * 0.4, 1 + r() * 0.5);
    const x = cx + (r() - 0.5) * (w - 0.8), z = zA + 0.5 + r() * (zB - zA - 1.0), y = H - 0.5 + r() * 0.5;
    b.add([{ c: '#7a7a76', map: 'concreto' }, { c: '#6a5a4a', map: 'concreto' }, { c: '#9a6a52', map: 'tijolo' }][Math.floor(r() * 3)], g, new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(r() * 3, r() * 6, r() * 3)), new T.Vector3(1, 1, 1)));
  }
  for (let i = 0; i < 3; i++) b.box({ c: '#b0b0a8', map: 'tecido' }, [0.5, 0.5, 0.2], [cx + (r() - 0.5) * 2.2, H + 0.4 * i - 0.3, zA + 1.5 + r()], { ry: r() * 3, cell: 3 }); // cement sacks
  return [
    { id: 'estacao-tapume-fundo', min: [st.x0 - 0.1, zB - 0.12], max: [st.x1 + 0.1, zB + 0.1] },
    { id: 'estacao-tapume-o', min: [st.x0 - 0.1, zA], max: [st.x0 + 0.12, zB] },
    { id: 'estacao-tapume-l', min: [st.x1 - 0.12, zA], max: [st.x1 + 0.1, zB] },
    { id: 'estacao-tapume-frente', min: [st.x0 - 0.1, zA - 0.12], max: [st.x1 + 0.1, zA + 0.12] },
  ];
}
