// The objects of the places (the gallery and the street): one builder per entity type, in metres, standing on the
// floor at the origin, facing +Z. Each returns { root, ...what the rules need }:
//   collider { w, d }        its footprint (the scene turns it into a box on the floor)
//   hide { radius }          a hiding place
//   light { color, range, y, night }   a point light (night: only lit at night)
//   exit / ground / dynamic  see the scenes. `dynamic` keeps the object out of the static merge.
// No text anywhere: signs are pictograms (kit.js, PICTOS).
import { mulberry32 } from '../../vendor/engine/rng.js';
import { kitOf, PICTO_NAMES } from './kit.js';
import { buildPerson } from './person.js';
import { buildLoja } from './loja.js';
import { buildDog } from './dog.js';
import { buildDecoy } from './decoy.js';
import { GALLERY, addShaft } from './props/gallery.js';
import { place as placeProp, have as haveProp } from './props/place.js';

const M = {
  conc: { c: '#8c8c88', map: 'concreto' }, concDark: { c: '#6a6c6a', map: 'umido' }, floor: { c: '#8a8a88', map: 'piso' },
  wood: { c: '#9a7a52', map: 'madeira' }, woodDark: { c: '#5a4430', map: 'madeira' }, metal: { c: '#7a808a', map: 'metal' },
  rust: { c: '#8a6a52', map: 'ferrugem' }, steel: { c: '#aab0b8', map: 'metal' }, blue: { c: '#2f5a86', map: 'metal' },
  black: { c: '#1c1d20' }, rubber: { c: '#3a3a3e', map: 'borracha' }, ochre: { c: '#b98a38', map: 'metal' }, grey: { c: '#6a6e74', map: 'metal' },
  tile: { c: '#b8bcb4', map: 'azulejo' }, cloth: { c: '#8a8a80', map: 'tecido' }, glass: { c: '#33465c', map: 'vidro' },
  lampOn: (c) => ({ c, emissive: 1, fogged: 0.6 }),
};
export { M as MATS };

const make = (kit, fill) => {
  const b = new kit.Batch(), x = fill(b) ?? {};
  const root = new kit.T.Group(); root.add(b.build());
  return { root, ...x };
};
const picto = (name, mapName = 'p:' + name) => ({ c: '#ffffff', map: mapName });
const plate = (b, name, w, pos, o = {}) => b.plane(picto(name), w, w, pos, { full: true, ...o });
/** A tube between two points (a pipe, a cable): a cylinder along the segment. */
function tube(kit, b, spec, a, c, rad, seg = 8, outline = false) {
  const T = kit.T, va = new T.Vector3(...a), vc = new T.Vector3(...c), d = vc.clone().sub(va), len = d.length();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
  const g = new T.CylinderGeometry(rad, rad, len, seg, 1), m = new T.Matrix4().compose(va.add(vc).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1));
  b.add(spec, g, m); if (outline) b.outline(g, m);
}

export const BUILDERS = {
  // ---- generic ----
  caixa: (kit, p) => make(kit, (b) => { b.box({ c: p.cor, map: p.textura === 'wall' ? 'concreto' : p.textura === 'floor' ? 'piso' : p.textura === 'cloth' ? 'tecido' : p.textura === 'seat' ? 'borracha' : 'metal' }, [p.lado, p.altura, p.lado]); return { collider: { w: p.lado, d: p.lado } }; }),
  luz: (kit, p) => {
    const m = make(kit, (b) => b.box({ c: p.cor, emissive: p.acesa ? 1 : 0, fogged: 0.6 }, [0.2, 0.2, 0.2], [0, -0.1, 0]));
    return { ...m, light: p.acesa ? { color: p.cor, range: p.alcance, y: 0 } : null };
  },

  // ---- the gallery ----
  cabo: (kit, p) => make(kit, (b) => {
    const L = p.comprimento, rad = p.raio, cut = p.corte >= 0 && !p.emendado, at = -L / 2 + (p.corte >= 0 ? p.corte : 0.5) * L, gap = 0.4;
    const seg = (x0, x1) => { b.cyl({ c: p.cor, map: 'borracha' }, rad, rad, x1 - x0, 8, [(x0 + x1) / 2, rad, 0], { rz: Math.PI / 2, tile: 0.5 }); };
    if (cut) { seg(-L / 2, at - gap / 2); seg(at + gap / 2, L / 2); }
    else seg(-L / 2, L / 2);
    for (let i = 1; i < L; i += 2) { const x = -L / 2 + i; if (cut && Math.abs(x - at) < gap) continue; b.box({ c: '#8a909a', map: 'metal' }, [0.05, rad * 2.9, rad * 3.0], [x, 0, 0]); b.box(M.black, [0.085, rad * 2.2, rad * 2.4], [x, 0.0, 0]); b.cyl({ c: '#c8ccd2', map: 'metal' }, 0.014, 0.014, 0.02, 6, [x, rad * 2.2, 0]); b.box({ c: '#8a909a', map: 'metal' }, [0.08, 0.012, rad * 4], [x, 0, 0], { nojitter: true }); }
    if (cut) for (const s of [-1, 1]) { // the torn ends: bare copper strands fanning out
      for (let k = 0; k < 4; k++) b.cyl({ c: '#c07a3a', map: 'metal' }, 0.006, 0.006, 0.12, 4, [at + s * (gap / 2 + 0.04), rad + (k - 1.5) * 0.012, (k - 1.5) * 0.012], { rz: Math.PI / 2 + s * (k - 1.5) * 0.18 });
      b.cyl({ c: '#d8b070', map: 'metal' }, rad * 0.8, rad * 0.8, 0.03, 8, [at + s * (gap / 2 + 0.01), rad, 0], { rz: Math.PI / 2 });
    }
    if (p.emendado) { // a taped splice: a sleeve with turns of black tape and a clamp
      b.cyl({ c: '#26262a', map: 'borracha' }, rad * 1.7, rad * 1.7, 0.34, 10, [at, rad, 0], { rz: Math.PI / 2 });
      for (let i = -2; i <= 2; i++) b.cyl({ c: '#1a1a1c' }, rad * 1.85, rad * 1.85, 0.03, 10, [at + i * 0.06, rad, 0], { rz: Math.PI / 2 });
      b.box({ c: '#b98a38', map: 'metal' }, [0.05, rad * 3.6, rad * 3.8], [at, 0, 0]);
    }
  }),
  bocaDeInspecao: (kit, p) => {
    const A = p.altura;
    const m = make(kit, (b) => {
      // the opening in the vault: a collar of concrete, the rope hanging to the floor, the thick cable going up
      b.cyl(M.concDark, 0.64, 0.64, 0.32, 14, [0, A - 0.3, 0], { open: true });
      b.cyl({ c: '#5a5a58', map: 'ferrugem' }, 0.7, 0.7, 0.08, 14, [0, A - 0.34, 0], { open: true, tile: 0.8 });
      tube(kit, b, { c: '#b8a47a', map: 'tecido' }, [0.25, A - 0.05, 0.15], [0.25, 0.1, 0.15], 0.03, 6, true);
      for (let i = 0; i < 8; i++) b.box({ c: '#9a8a66', map: 'tecido' }, [0.09, 0.05, 0.09], [0.25, 0.3 + i * 0.42, 0.15], { outline: true, tile: 0.3 });
      b.cyl({ c: '#b8a47a', map: 'tecido' }, 0.16, 0.16, 0.06, 8, [0.25, 0.0, 0.15], { outline: true, tile: 0.4 }); b.cyl({ c: '#b8a47a', map: 'tecido' }, 0.1, 0.1, 0.08, 8, [0.25, 0.06, 0.15], { outline: true, tile: 0.4 });
      tube(kit, b, { c: '#1e1e22', map: 'borracha' }, [-0.45, A - 0.05, 0.3], [-0.45, 0.07, 0.3], 0.07, 8);
      for (let i = 0; i < 6; i++) b.box(M.black, [0.1, 0.1, 0.18], [-0.45, 0.4 + i * 0.55, 0.3]);
      b.cyl({ c: '#1e1e22', map: 'borracha' }, 0.07, 0.07, 0.07, 8, [-0.45, 0.0, 0.3]);
      return {};
    });
    const T = kit.T;
    const hole = new T.Mesh(new T.CircleGeometry(0.56, 14), kit.mat({ c: '#0a0e18', emissive: 1, fogged: 0.3 }));
    hole.rotation.x = Math.PI / 2; hole.position.y = A - 0.2; hole.userData.keep = true; m.root.add(hole);
    const cone = new T.Mesh(new T.CylinderGeometry(0.58, 0.95, A - 0.3, 14, 1, true), kit.mat({ c: '#cfe0ff', emissive: 1, opacity: 0.0, side: 'double', fogged: 0.4, depthWrite: false }));
    cone.position.y = (A - 0.3) / 2 + 0.05; cone.userData.keep = true; m.root.add(cone);
    const patch = new T.Mesh(new T.CircleGeometry(0.95, 14), kit.mat({ c: '#cfe0ff', emissive: 1, opacity: 0.0, fogged: 0.4, depthWrite: false }));
    patch.rotation.x = -Math.PI / 2; patch.position.y = 0.03; patch.userData.keep = true; m.root.add(patch);
    const lt = { color: '#8aa8d8', range: 5, y: A - 0.6, k: 0 };
    const night = new T.Color('#0a0e18'), dayC = new T.Color('#f2f8ff');
    return {
      ...m, dynamic: true, light: lt, shaftTop: A,
      daylight(k) {
        cone.material.opacity = 0.02 + 0.3 * k; patch.material.opacity = 0.05 + 0.55 * k;
        hole.material.uniforms.uColor.value.copy(night).lerp(dayC, k);
        const c = new T.Color('#6a80b0').lerp(new T.Color('#fff2d8'), k); lt.k = k; lt.color = '#' + c.getHexString(); lt.range = 3.5 + 6 * k;
      },
    };
  },

  // ---- the street ----
  predio: (kit, p, e) => make(kit, (b) => {
    const w = Math.max(6, Math.round(p.largura / 3) * 3), d = p.profundidade, fl = p.andares, gh = 4, uh = Math.round(3.2 * fl * 10) / 10;
    const r = mulberry32(p.semente * 101 + 7);
    const wall = { c: p.cor, map: p.fachada === 'tijolo' ? 'tijolo' : 'concreto' };
    const upper = p.fachada === 'vidro' ? { c: '#9aa8b8', map: 'vidro' } : { c: p.cor, map: p.fachada === 'tijolo' ? 'tijolo' : 'modulo' };
    b.box(wall, [w, gh, d], [0, 0, 0], { tile: 3, cell: 6, nojitter: true });
    b.box(upper, [w, uh, d], [0, gh, 0], { tile: [3, 3.2], cell: 6, nojitter: true, specs: { '+y': { c: '#2a2c30', map: 'concreto' }, '-y': wall } });
    b.box({ c: '#2a2c30', map: 'concreto' }, [w + 0.3, 0.4, d + 0.3], [0, gh + uh, 0], { cell: 8 });
    // storefront: dark glass with a door and a pictogram above it
    b.box(M.glass, [w - 2, 2.6, 0.06], [0, 0.35, d / 2 + 0.02], { tile: 2, cell: 4, nojitter: true });
    b.box(M.black, [1.4, 2.5, 0.08], [0, 0.0, d / 2 + 0.05]);
    if (p.letreiro !== 'nenhum') { b.box({ c: '#1c1d20' }, [1.5, 1.5, 0.1], [0, 2.7, d / 2 + 0.06]); b.plane(picto(p.letreiro), 1.3, 1.3, [0, 2.7 + 0.1 + 0.05 - 0.15 + 0.05, d / 2 + 0.12], { full: true }); }
    b.box({ c: '#26282c', map: 'concreto' }, [w, 0.5, 0.3], [0, gh - 0.1, d / 2 + 0.1], { cell: 6 });
    if (p.marquise) { b.box({ c: '#3a3c40', map: 'metal' }, [w, 0.14, 3.4], [0, 3.5, d / 2 + 1.7], { cell: 4 }); for (const s of [-1, 1]) tube(kit, b, M.grey, [s * (w / 2 - 0.2), 3.5, d / 2 + 3.2], [s * (w / 2 - 0.2), 0, d / 2 + 3.2], 0.05, 6); }
    // lit windows (a few, set by the seed): emissive quads on the front face
    const cols = Math.floor(w / 3);
    for (let row = 0; row < fl; row++) for (let c = 0; c < cols; c++) {
      if (r() >= p.luzes) continue;
      const x = -w / 2 + c * 3 + 1.5, y = gh + row * 3.2 + 0.85;
      b.plane({ c: ['#e8c878', '#d8d0a0', '#f0e0a8', '#c8d8e0'][Math.floor(r() * 4)], emissive: 1, fogged: 0.7, night: true, dayC: '#1e2834' }, 1.4, 1.5, [x, y, d / 2 + 0.03], {});
    }
    return { collider: { w, d }, cut: e.pos[2] > 0 ? 'predio-sul' : 'predio-norte' };
  }),
  poste: (kit, p) => make(kit, (b) => {
    b.cyl(M.grey, 0.09, 0.12, p.altura, 8, [0, 0, 0]);
    b.box(M.grey, [0.05, 0.05, 1.3], [0, p.altura - 0.05, 0.55]);
    b.box({ c: '#2a2c30', map: 'metal' }, [0.3, 0.12, 0.6], [0, p.altura - 0.1, 1.0]);
    b.box({ c: p.cor, emissive: p.acesa ? 1 : 0, fogged: 0.5, night: true, dayC: '#3a3a38' }, [0.26, 0.04, 0.5], [0, p.altura - 0.14, 1.0]);
    return { collider: { w: 0.3, d: 0.3 }, light: p.acesa ? { color: p.cor, range: p.alcance, y: p.altura - 0.4, z: 1.0, night: true } : null };
  }),
  carro: (kit, p) => make(kit, (b) => {
    const body = { c: p.cor, map: 'metal' }, L = p.tipo === 'furgao' ? 5.0 : p.tipo === 'van' ? 4.6 : 4.2, H = p.tipo === 'sedan' ? 1.0 : 1.55;
    b.box(body, [1.8, 0.62, L], [0, 0.32, 0], { cell: 3 });
    if (p.tipo === 'sedan') { b.box(M.glass, [1.6, 0.5, 2.1], [0, 0.94, -0.1], { cell: 3, tile: 1 }); b.box(body, [1.62, 0.08, 2.0], [0, 1.44, -0.1]); }
    else { b.box(p.tipo === 'furgao' ? body : M.glass, [1.7, H - 0.5, L - 1.3], [0, 0.94, -0.6], { cell: 3, tile: 1 }); b.box(M.glass, [1.7, 0.55, 1.0], [0, 0.94, L / 2 - 1.0], { cell: 3 }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.black, 0.34, 0.34, 0.22, 10, [sx * 0.9, 0.34, sz * (L / 2 - 0.8)], { rz: Math.PI / 2 });
    b.box({ c: '#e8d8a0', emissive: p.luzes ? 1 : 0.0, fogged: 0.6, night: true, dayC: '#343432' }, [1.4, 0.12, 0.04], [0, 0.55, L / 2 + 0.01]);
    b.box({ c: '#a03a2a', emissive: p.luzes ? 0.7 : 0, fogged: 0.6, night: true, dayC: '#2a1a18' }, [1.4, 0.1, 0.04], [0, 0.55, -L / 2 - 0.01]);
    if (p.porta) b.box(body, [0.06, 0.6, 1.2], [1.2, 0.6, 0.3], { ry: -0.9 });
    b.plane(picto('vialume'), 0.45, 0.45, [0.906, 0.6, 0.6], { full: true, ry: Math.PI / 2 });
    return { collider: { w: 1.9, d: L } };
  }),
  // the skip where one hides: the painted prop (tools/props, `cacamba`: the same footprint and height as the box it replaces, 2.4 x 1.5, its rim at
  // 1.08) and what was thrown in it; the plain box stays for when the file is missing. The collider and the hiding radius are the same either way.
  cacamba: (kit, p) => make(kit, (b) => {
    const r = mulberry32(p.semente * 7);
    if (haveProp('cacamba')) {
      const base = new kit.T.Color('#6a5a3a'), c = new kit.T.Color(p.cor), tint = '#' + new kit.T.Color(Math.min(1, c.r / base.r), Math.min(1, c.g / base.g), Math.min(1, c.b / base.b)).getHexString();
      placeProp(kit, b, 'cacamba', { tint });
      placeProp(kit, b, 'cacamba_entulho', { pos: [0, 1.0, 0], ry: r() < 0.5 ? 0 : Math.PI });
    } else {
      b.box({ c: p.cor, map: 'ferrugem' }, [2.4, 0.9, 1.5], [0, 0.18, 0], { skip: ['+y'], cell: 2, outline: true });
      b.box(M.black, [2.2, 0.05, 1.3], [0, 0.85, 0]);
      for (let i = 0; i < 7; i++) b.box({ c: ['#6a5a4a', '#7a7a70', '#4a3a2a', '#9a9a90'][Math.floor(r() * 4)], map: 'papelao' }, [0.3 + r() * 0.4, 0.2 + r() * 0.3, 0.3 + r() * 0.4], [(r() - 0.5) * 1.8, 0.9 + (r() * 0.1), (r() - 0.5) * 1.0], { ry: r() * 3, outline: true, tile: 0.5 });
      for (const s of [-1, 1]) b.box(M.black, [0.1, 0.2, 1.6], [s * 1.0, 0.0, 0]);
    }
    plate(b, 'perigo', 0.4, [0, 0.42, 0.685], { rx: -0.138 });
    return { collider: { w: 2.4, d: 1.5 }, hide: { radius: 1.6 } };
  }),
  // the canopy over the pavement: lengths of the painted slab (`marquise_modulo`, 3 m by 4 m) and the four painted columns, stretched to the size asked
  marquise: (kit, p) => make(kit, (b) => {
    if (haveProp('marquise_modulo')) {
      const n = Math.max(1, Math.round(p.largura / 3)), w = p.largura / n;
      for (let i = 0; i < n; i++) placeProp(kit, b, 'marquise_modulo', { pos: [-p.largura / 2 + (i + 0.5) * w, p.altura, 0], scale: [w / 3, 1, p.profundidade / 4] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) placeProp(kit, b, 'marquise_coluna', { pos: [sx * (p.largura / 2 - 0.2), 0, sz * (p.profundidade / 2 - 0.2)], scale: [1, p.altura / 3.6, 1], ry: sx * sz > 0 ? 0 : Math.PI / 2 });
    } else {
      b.box({ c: '#3a3c40', map: 'metal' }, [p.largura, 0.16, p.profundidade], [0, p.altura, 0], { cell: 3, outline: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.grey, [0.14, p.altura, 0.14], [sx * (p.largura / 2 - 0.2), 0, sz * (p.profundidade / 2 - 0.2)], { outline: true });
    }
    for (let i = 0; i < 3; i++) b.box({ c: '#e8d8a0', emissive: 1, fogged: 0.6, night: true, dayC: '#343432' }, [0.5, 0.04, 0.12], [(i - 1) * p.largura * 0.3, p.altura - 0.03, 0]);
    return { colliderPosts: [[p.largura / 2 - 0.2, p.profundidade / 2 - 0.2]], light: { color: '#e8d8a0', range: 8, y: p.altura - 0.3, night: true } };
  }),
  viaduto: (kit, p) => make(kit, (b) => {
    b.box({ c: '#6e6e6a', map: 'concreto' }, [p.largura, 0.9, p.comprimento], [0, p.altura, 0], { cell: 4, tile: 3 });
    for (const s of [-1, 1]) { b.box({ c: '#7a7a76', map: 'concreto' }, [0.4, 0.9, p.comprimento], [s * (p.largura / 2 - 0.2), p.altura + 0.9, 0], { cell: 4 }); }
    for (let i = 0; i < Math.floor(p.comprimento / 4); i++) for (const s of [-1, 1]) b.box({ c: '#26282c', map: 'metal' }, [0.1, 0.3, 0.1], [s * (p.largura / 2 - 0.2), p.altura + 1.8, -p.comprimento / 2 + 2 + i * 4]);
    b.box({ c: '#1c1d20' }, [p.largura - 1.5, 0.02, p.comprimento], [0, p.altura + 0.9, 0], { tile: 4 });
    for (let i = 0; i < Math.floor(p.comprimento / 6); i++) b.box({ c: '#d8d0a0' }, [0.15, 0.02, 2.4], [0, p.altura + 0.92, -p.comprimento / 2 + 3 + i * 6]);
    return {};
  }),
  pilar: (kit, p) => make(kit, (b) => {
    b.cyl({ c: '#7a7a76', map: 'concreto' }, p.raio, p.raio * 1.15, p.altura, 12, [0, 0, 0], { tile: 2 });
    b.box({ c: '#6a6a66', map: 'concreto' }, [p.raio * 2.8, 0.6, p.raio * 2.8], [0, p.altura - 0.6, 0]);
    b.box({ c: '#d6a82a', map: 'faixa' }, [p.raio * 2.4, 0.5, p.raio * 2.4], [0, 0, 0], { skip: ['+y', '-y'], tile: 0.5 });
    return { collider: { w: p.raio * 2.3, d: p.raio * 2.3 } };
  }),
  painelSolar: (kit, p) => make(kit, (b) => {
    const w = 1.6, h = 1.0;
    for (let i = 0; i < p.colunas; i++) for (let j = 0; j < p.fileiras; j++) {
      const x = (i - (p.colunas - 1) / 2) * (w + 0.06), z = j * (h * Math.cos(0.5) + 0.2);
      b.box({ c: p.sujo ? '#b8aa90' : '#ffffff', map: 'painel' }, [w, 0.05, h], [x, 0.6 + 0.35, z], { rx: -0.5, tile: 0.5, cell: 4 });
      if (p.sujo) { for (let k = 0; k < 4; k++) b.box({ c: '#8a7a5a', opacity: 0.55 }, [w * (0.3 + 0.15 * k), 0.012, h * 0.2], [x - w * 0.2 + k * 0.1, 0.6 + 0.375 + 0.0, z + 0.1 * k], { rx: -0.5 }); }
      b.box(M.grey, [0.05, 0.9, 0.05], [x - 0.6, 0, z + 0.3]); b.box(M.grey, [0.05, 0.4, 0.05], [x + 0.6, 0, z - 0.3]);
    }
    return { collider: { w: p.colunas * 1.66, d: p.fileiras * 1.1 } };
  }),
  caixaDaguaAlta: (kit, p) => make(kit, (b) => {
    const r = p.raio, H = p.altura;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; tube(kit, b, M.rust, [Math.cos(a) * (r + 0.6), 0, Math.sin(a) * (r + 0.6)], [Math.cos(a) * (r - 0.2), H, Math.sin(a) * (r - 0.2)], 0.14, 6); }
    for (const y of [H * 0.35, H * 0.7]) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, a2 = ((i + 1) / 6) * Math.PI * 2, k = 0.6 - (y / H) * 0.4 + r; tube(kit, b, M.rust, [Math.cos(a) * k, y, Math.sin(a) * k], [Math.cos(a2) * k, y, Math.sin(a2) * k], 0.06, 4); }
    b.cyl({ c: '#8a8e96', map: 'ferrugem' }, r, r, 4.2, 16, [0, H, 0], { tile: 3, cell: 3 });
    b.cyl({ c: '#6a6e76', map: 'ferrugem' }, 0.1, r, 1.2, 16, [0, H + 4.2, 0]);
    b.cyl(M.rust, r + 0.1, r + 0.1, 0.15, 16, [0, H + 1.4, 0]);
    for (let i = 0; i < Math.floor(H / 0.4); i++) b.box(M.rust, [0.5, 0.04, 0.06], [0, i * 0.4, r + 0.5]);
    plate(b, 'agua', 1.8, [0, H + 2.2, r + 0.02], {});
    return { collider: { w: r * 2.6, d: r * 2.6 } };
  }),
  pontoDeEmbarque: (kit, p) => make(kit, (b) => {
    b.box({ c: '#3a3c40', map: 'metal' }, [3.0, 0.1, 1.5], [0, 2.5, 0], { cell: 3, outline: true });
    for (const s of [-1, 1]) b.box(M.grey, [0.08, 2.5, 0.08], [s * 1.4, 0, -0.6], { outline: true });
    b.box(M.glass, [2.8, 1.6, 0.05], [0, 0.5, -0.7], { cell: 3, tile: 1 });
    b.box({ c: '#6a6e74', map: 'metal' }, [2.0, 0.08, 0.4], [0, 0.45, -0.4], { outline: true });
    b.box(M.grey, [0.1, 2.9, 0.1], [2.0, 0, 0.4], { outline: true }); b.box({ c: '#3a2a1e', map: 'ferrugem' }, [0.8, 0.8, 0.06], [2.0, 2.3, 0.4], { outline: true }); plate(b, 'embarque', 0.7, [2.0, 2.3, 0.44]);
    b.plane({ c: '#2b5f9c', opacity: 0.9 }, 3.4, 1.2, [0, 0.01, 1.4], { flat: true, cell: 9 });
    b.plane(picto('seta'), 0.8, 0.8, [0, 0.012, 1.4], { flat: true, full: true });
    b.box({ c: '#e8d8a0', emissive: 1, fogged: 0.6, night: true, dayC: '#343432' }, [2.4, 0.04, 0.2], [0, 2.45, 0]);
    return { colliderPosts: [[1.4, -0.6]], light: { color: '#e8d8a0', range: 6, y: 2.3, night: true } };
  }),
  pontoDeEntrega: (kit, p) => make(kit, (b) => {
    b.plane({ c: '#c8962e', opacity: 0.95 }, 2.4, 2.4, [0, 0.01, 0], { flat: true, cell: 9 }); b.plane(picto('entrega'), 1.6, 1.6, [0, 0.014, 0], { flat: true, full: true });
    b.box({ c: '#1c1d20' }, [2.4, 0.02, 0.1], [0, 0.0, 1.25]);
    b.cyl(M.grey, 0.05, 0.05, 2.4, 6, [1.4, 0, 0], { outline: true }); b.box({ c: '#3a2a1e', map: 'ferrugem' }, [0.6, 0.6, 0.05], [1.4, 2.1, 0], { outline: true }); plate(b, 'entrega', 0.5, [1.4, 2.1, 0.04]);
    b.box({ c: '#c8962e', emissive: 0.6, fogged: 0.6 }, [0.12, 0.12, 0.12], [1.4, 2.5, 0]);
    return {};
  }),
  bueiro: (kit, p) => make(kit, (b) => {
    b.box({ c: '#202226' }, [1.0, 0.02, 0.75], [0, -0.01, 0], {});
    b.box({ c: '#ffffff', map: 'grelha' }, [0.9, 0.03, 0.65], [0, 0.0, 0], { tile: 0.3 });
    b.box(M.grey, [1.0, 0.03, 0.05], [0, 0, 0.35]); b.box(M.grey, [1.0, 0.03, 0.05], [0, 0, -0.35]);
    return {};
  }),
  bocaRua: (kit, p) => {
    const m = make(kit, (b) => {
      b.cyl({ c: '#3a3a3c', map: 'ferrugem' }, 0.55, 0.55, 0.05, 14, [0.5, 0.0, 0.3], { rx: 0.0, tile: 0.6 });
      b.box({ c: '#101114' }, [0.9, 0.02, 0.9], [-0.1, 0.0, 0.0], {});
      b.cyl({ c: '#101114' }, 0.46, 0.46, 0.04, 14, [-0.05, 0.0, 0.0]);
      b.cyl(M.rust, 0.54, 0.54, 0.05, 14, [-0.05, -0.0, 0.0], { open: true });
      b.cyl({ c: '#c8b890', map: 'tecido' }, 0.03, 0.03, 0.5, 6, [0.12, 0, 0.1], { rz: 0.9 });
      b.cyl({ c: '#1e1e22', map: 'borracha' }, 0.07, 0.07, 3.0, 8, [-0.9, 0, 0.1], { rz: Math.PI / 2 });
    });
    return { ...m, exit: true };
  },
  semaforo: (kit, p) => make(kit, (b) => {
    b.cyl(M.grey, 0.07, 0.09, 4.2, 8, [0, 0, 0], { outline: true }); b.box(M.grey, [0.05, 0.05, 2.2], [0, 4.0, 1.0]);
    b.box({ c: '#2a2c30', map: 'borracha' }, [0.34, 0.9, 0.28], [0, 3.3, 2.0], { tile: 0.6 });
    for (let i = 0; i < 3; i++) b.cyl({ c: ['#a03a2a', '#b98a38', '#3a7a4a'][i], emissive: i === p.cor ? 1 : 0.0, fogged: 0.6 }, 0.1, 0.1, 0.04, 8, [0, 3.7 - i * 0.28, 2.0 + 0.15], { rx: Math.PI / 2 });
    return { collider: { w: 0.3, d: 0.3 } };
  }),
  barreira: (kit, p) => make(kit, (b) => { b.box({ c: '#ffffff', map: 'faixa' }, [p.comprimento, 0.3, 0.1], [0, 0.7, 0], { tile: 0.5, outline: true }); for (const s of [-1, 1]) b.box(M.grey, [0.06, 0.8, 0.5], [s * (p.comprimento / 2 - 0.1), 0, 0], { outline: true }); return { collider: { w: p.comprimento, d: 0.5 } }; }),
  cone: (kit, p) => make(kit, (b) => { b.cyl({ c: '#d6692a', map: 'tecido' }, 0.04, 0.17, 0.7, 8, [0, 0.03, 0], { outline: true, tile: 0.6 }); b.box({ c: '#2a2a2c', map: 'borracha' }, [0.4, 0.03, 0.4], [0, 0, 0], { outline: true }); b.cyl({ c: '#e8e4d8' }, 0.07, 0.1, 0.1, 8, [0, 0.35, 0]); return { collider: { w: 0.4, d: 0.4 } }; }),
  hidrante: (kit, p) => make(kit, (b) => { const o = { outline: true, tile: 0.5 }; b.cyl({ c: '#a03a2a', map: 'ferrugem' }, 0.11, 0.13, 0.7, 8, [0, 0, 0], o); b.cyl({ c: '#a03a2a', map: 'ferrugem' }, 0.14, 0.12, 0.1, 8, [0, 0.7, 0], o); b.cyl(M.steel, 0.05, 0.05, 0.4, 6, [0, 0.4, 0], { rz: Math.PI / 2, outline: true }); return { collider: { w: 0.3, d: 0.3 } }; }),
  placa: (kit, p) => make(kit, (b) => { b.cyl(M.grey, 0.04, 0.04, p.altura, 6, [0, 0, 0], { outline: true }); b.box({ c: '#3a2a1e', map: 'ferrugem' }, [0.62, 0.62, 0.03], [0, p.altura - 0.3, 0.04], { outline: true }); plate(b, p.picto, 0.56, [0, p.altura - 0.3, 0.062]); return { collider: { w: 0.2, d: 0.2 } }; }),
  entulho: (kit, p) => make(kit, (b) => {
    const r = mulberry32(p.semente * 13 + 1);
    for (let i = 0; i < 9; i++) b.box({ c: ['#7a7a76', '#6a5a4a', '#8a8a86'][Math.floor(r() * 3)], map: 'concreto' }, [0.3 + r() * 0.5, 0.2 + r() * 0.3, 0.3 + r() * 0.5], [(r() - 0.5) * 1.6, r() * 0.2, (r() - 0.5) * 1.2], { ry: r() * 3, rz: (r() - 0.5) * 0.5 });
    return { hide: { radius: 1.3 } };
  }),
  pessoa: (kit, p, e, ctx) => {
    const per = buildPerson(kit.r, { seed: p.semente, role: p.papel, pack: p.mochila });
    per.setPose({ phase: p.fase, walk: p.pose === 'andando' || p.pose === 'correndo' ? 1 : 0, run: p.pose === 'correndo' ? 1 : 0, crouch: p.pose === 'agachado' ? 1 : 0 });
    return { root: per.root, dynamic: true, collider: { w: 0.5, d: 0.5 }, person: per };
  },
};

BUILDERS.lixo = (kit, p) => make(kit, (b) => {
  // small litter and the marks on the ground: scraps, cans, a torn bag, a stain, cracks, leaves of dirt; never blocks the way
  const r = mulberry32(p.semente * 53 + 9), n = p.quantidade, R = p.raio;
  const pal = [{ c: '#a88a5a', map: 'madeira' }, { c: '#8a8a80', map: 'tecido' }, { c: '#5a6a7a', map: 'metal' }, { c: '#7a4a3a', map: 'ferrugem' }, { c: '#c8c4b4', map: 'tecido' }, { c: '#3a3a3a', map: 'borracha' }];
  for (let i = 0; i < n; i++) { const a = r() * 6.3, d = Math.sqrt(r()) * R, k = r(); const sp = pal[Math.floor(r() * pal.length)];
    if (k < 0.45) b.box(sp, [0.08 + r() * 0.25, 0.02 + r() * 0.05, 0.08 + r() * 0.25], [Math.cos(a) * d, 0, Math.sin(a) * d], { ry: r() * 3, cell: 3, nojitter: true });
    else if (k < 0.7) b.cyl(sp, 0.035, 0.035, 0.11, 6, [Math.cos(a) * d, 0, Math.sin(a) * d], { rz: r() < 0.5 ? Math.PI / 2 : 0, ry: r() * 3 });
    else b.plane({ c: '#d8d4c4', map: 'tecido' }, 0.14 + r() * 0.2, 0.18 + r() * 0.2, [Math.cos(a) * d, 0.008, Math.sin(a) * d], { flat: true, ry: r() * 3, cell: 3 });
  }
  for (let i = 0; i < 3; i++) b.plane({ c: '#16161a', opacity: 0.5 }, 0.6 + r() * 1.2, 0.5 + r() * 1.0, [(r() - 0.5) * R, 0.006, (r() - 0.5) * R], { flat: true, ry: r() * 3, cell: 9 });
  for (let i = 0; i < 4; i++) b.box({ c: '#26262a' }, [0.8 + r() * 1.6, 0.004, 0.025], [(r() - 0.5) * R * 1.2, 0.004, (r() - 0.5) * R * 1.2], { ry: r() * 3, cell: 9 });
  for (let i = 0; i < 5; i++) b.box({ c: '#6a5a3a' }, [0.25 + r() * 0.5, 0.01, 0.2 + r() * 0.4], [(r() - 0.5) * R, 0.005, (r() - 0.5) * R], { ry: r() * 3, cell: 9 });
  return {};
});
BUILDERS.loja = (kit, p, e) => buildLoja(kit, p, e);
BUILDERS.isca = (kit, p) => { const d = buildDecoy(kit.r, { seed: p.semente }); d.setActive(p.ativa); return { root: d.root, dynamic: true, decoy: d, animate: (t) => d.update(0.016, { active: p.ativa, t }) }; };
BUILDERS.cao = (kit, p) => { const d = buildDog(kit.r, { seed: p.semente }); d.setPose({ state: p.estado, speed: p.velocidade, phase: 0.4, t: 1 }); return { root: d.root, dynamic: true, dog: d }; };
for (const t of ['bateria', 'filtro', 'cabo', 'painelSolar', 'radio']) { const f = BUILDERS[t]; BUILDERS[t] = (kit, p, e, c) => ({ ...f(kit, p, e, c), dynamic: true }); }

export { PICTO_NAMES };

// The gallery (the unfinished station) is built from the baked props: its builders replace the plain ones above.
Object.assign(BUILDERS, GALLERY);
const plainShaft = BUILDERS.bocaDeInspecao;
BUILDERS.bocaDeInspecao = (kit, p, e) => { const m = plainShaft(kit, p, e); addShaft(kit, m, p); return m; };
