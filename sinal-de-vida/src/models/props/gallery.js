// The objects of the gallery, the unfinished station with its abandoned maintenance room: one builder per entity type, built from the baked
// props (assets/props, tools/props/) plus the small pieces that change with the state of the game (the lights of the batteries, the
// element of the filter, the dirt of a broken pump). Same contract as models/objects.js: { root, collider, hide, light, ground, dynamic, ... }.
// In metres, on the floor at the origin, facing +Z. No text anywhere: signs are pictograms.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { place, have } from './place.js';
import { buildRadio, radioReady } from './radio.js';

await radioReady;            // the file of the radio is loaded before the scenes are built (as the baked props are)

const picto = (name) => ({ c: '#ffffff', map: 'p:' + name });
const plate = (b, name, w, pos, o = {}) => b.plane(picto(name), w, w, pos, { full: true, ...o });
/** A sign that hangs by itself: the painted plate on a thin sheet of its own, which takes the outline. */
const sign = (b, name, w, pos, o = {}) => {
  const ry = o.ry ?? 0, back = 0.014, bx = pos[0] - Math.sin(ry) * back, bz = pos[2] - Math.cos(ry) * back;
  b.box({ c: '#3a2a1e', map: 'ferrugem' }, [w + 0.02, w + 0.02, 0.022], [bx, pos[1] - 0.01, bz], { ry, outline: true, nojitter: true });
  plate(b, name, w, pos, o);
};
const C = { // the few flat colours of the code-made pieces (the painted ones are in the props)
  steel: { c: '#8a909a', map: 'metal' }, steelD: { c: '#4a4e56', map: 'metal' }, ochre: { c: '#b98a38', map: 'metal' }, black: { c: '#1c1d20' },
  rust: { c: '#8a5a3a', map: 'ferrugem' }, conc: { c: '#8c8a82', map: 'concreto' }, concD: { c: '#6a6c68', map: 'umido' }, wood: { c: '#8a7e70', map: 'madeira' },
  woodD: { c: '#4e463e', map: 'madeira' }, rubber: { c: '#26262a', map: 'borracha' }, cloth: { c: '#c8c0a0', map: 'tecido' }, mud: { c: '#4a3a24', map: 'ferrugem' },
  lampOn: (c) => ({ c, emissive: 1, fogged: 0.6 }),
};
const make = (kit, fill) => {
  const b = new kit.Batch(), x = fill(b) ?? {};
  const root = new kit.T.Group(); root.add(b.build());
  return { root, ...x };
};
/** A tube between two points. */
function tube(kit, b, spec, a, c, rad, seg = 8, outline = false) {
  const T = kit.T, va = new T.Vector3(...a), vc = new T.Vector3(...c), d = vc.clone().sub(va), len = d.length();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
  const g = new T.CylinderGeometry(rad, rad, len, seg, 1), m = new T.Matrix4().compose(va.add(vc).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1));
  b.add(spec, g, m); if (outline) b.outline(g, m);
}
/** A puddle or a stain: an irregular blob on the floor (a fan of points around the centre, from a seed). */
function blob(kit, b, spec, cx, cz, rx, rz, seed, y = 0.012) {
  const T = kit.T, r = mulberry32(seed), n = 11, pos = [], uv = [], nor = [];
  const pt = (i) => { const a = (i / n) * Math.PI * 2, k = 0.7 + r() * 0.5; return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]; };
  const ring = Array.from({ length: n }, (_, i) => pt(i));
  for (let i = 0; i < n; i++) {
    const p0 = ring[i], p1 = ring[(i + 1) % n];
    for (const [x, z] of [[cx, cz], [p1[0], p1[1]], [p0[0], p0[1]]]) { pos.push(x, y, z); nor.push(0, 1, 0); uv.push((x - cx) / (rx * 2) + 0.5, (z - cz) / (rz * 2) + 0.5); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  b.add(spec, g, new T.Matrix4());
}
export { blob, tube };

const wallSpec = (t, c) => ({ concreto: { c, map: 'concreto' }, umido: { c, map: 'umido' }, tijolo: { c, map: 'tijolo' }, azulejo: { c, map: 'azulejo' }, metal: { c, map: 'metal' }, madeira: { c, map: 'madeira' } }[t]);

export const GALLERY = {
  // a partition, made of what was at hand: sheets, pallets, a tarp, a rebar grille; or the old kinds (concrete, brick ...)
  parede: (kit, p) => make(kit, (b) => {
    const L = p.comprimento, H = p.altura, T = p.espessura, mod = { chapa: 'div_chapa', palete: 'div_palete', lona: 'div_lona', grade: 'div_grade' }[p.textura];
    if (mod && have(mod)) {
      const n = Math.max(1, Math.round(L / 1.9));
      for (let i = 0; i < n; i++) place(kit, b, mod, { pos: [-L / 2 + (i + 0.5) * (L / n), 0, 0], scale: [L / n / 1.9, H / 1.15, 1] });
    } else b.box(wallSpec(p.textura, p.cor) ?? { c: p.cor, map: 'concreto' }, [L, H, T], [0, 0, 0], { tile: 2, outline: true });
    if (p.picto !== 'nenhum') { const py = Math.min(1.55, H * 0.6), ps = Math.min(0.5, H * 0.45), z = mod ? 0.1 : T / 2 + 0.012; sign(b, p.picto, ps, [0, py - ps / 2, z]); sign(b, p.picto, ps, [0, py - ps / 2, -z], { ry: Math.PI }); }
    return { collider: { w: L, d: T } };
  }),
  // the raised floor of the dormitory: a slab with the formwork still on its front edge and rebar stubs at the back
  degrau: (kit, p) => make(kit, (b) => {
    b.box({ c: '#8a8a88', map: 'piso' }, [p.largura, p.altura, p.profundidade], [0, 0, 0], { tile: 2, outline: true });
    b.box({ c: '#8a7e70', map: 'madeira' }, [p.largura, p.altura * 0.9, 0.035], [0, 0.0, p.profundidade / 2 + 0.018], { tile: 0.6 });
    for (let x = -p.largura / 2 + 0.6; x < p.largura / 2; x += 1.2) b.box(C.woodD, [0.07, p.altura * 0.9, 0.1], [x, 0, p.profundidade / 2 + 0.06], { outline: true });
    b.plane({ c: '#ffffff', map: 'faixa' }, p.largura, 0.1, [0, p.altura - 0.001, p.profundidade / 2 - 0.06], { flat: true, tile: 0.6 });
    const r = mulberry32(11);
    for (let i = 0; i < 9; i++) { const x = -p.largura / 2 + 0.4 + r() * (p.largura - 0.8); tube(kit, b, { c: '#6a4026', map: 'ferrugem' }, [x, p.altura, -p.profundidade / 2 + 0.12], [x + (r() - 0.5) * 0.12, p.altura + 0.25 + r() * 0.2, -p.profundidade / 2 + 0.12], 0.009, 5); }
    return { ground: { w: p.largura, d: p.profundidade, h: p.altura } };
  }),
  colchao: (kit, p) => make(kit, (b) => {
    place(kit, b, 'colchao_base', { fb: [0.9, 0.3, 1.95], fbc: '#d8d2c0' });
    place(kit, b, 'colchao_manta', { tint: p.cor });
    // a small story: a lantern by the pillow, a pair of boots at the foot (by the colour, so each bed has its own)
    const h = [...p.cor].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    if (h % 3 === 0) { b.cyl({ c: '#3a3c3a', map: 'metal' }, 0.05, 0.05, 0.14, 8, [-0.28, 0.0, 0.5], {}); b.cyl(C.ochre, 0.045, 0.04, 0.03, 8, [-0.28, 0.14, 0.5]); }
    if (h % 3 === 1) { b.box({ c: '#3a2a22', map: 'borracha' }, [0.1, 0.12, 0.26], [0.2, 0.0, -1.05], { ry: 0.2 }); b.box({ c: '#3a2a22', map: 'borracha' }, [0.1, 0.12, 0.26], [0.34, 0.0, -1.08], { ry: -0.1 }); }
    return { collider: { w: 0.9, d: 1.95 }, soft: true };
  }),
  bomba: (kit, p) => {
    const on = p.estado === 'funcionando', dead = p.estado === 'quebrada';
    const m = make(kit, (b) => {
      place(kit, b, dead ? 'bomba_quebrada' : 'bomba', { fb: [1.3, 0.9, 0.9] });
      plate(b, 'agua', 0.24, [-0.28, 1.0, 0.0], {}); b.box(C.steelD, [0.26, 0.26, 0.012], [-0.28, 0.88, -0.006]);
      if (dead) { b.plane({ c: '#161e26', opacity: 0.7, depthWrite: false }, 0.9, 0.5, [-0.3, 0.012, 0.55], { flat: true, cell: 9 }); b.box(C.rust, [0.3, 0.02, 0.06], [-0.9, 0.0, 0.5], { ry: 0.4 }); }
      else b.plane({ c: '#10141a', opacity: 0.35, depthWrite: false }, 1.3, 0.4, [0, 0.011, 0.5], { flat: true, cell: 9 });
      return { collider: { w: 1.3, d: 0.9 }, dynamic: true };
    });
    const T = kit.T, led = new T.Mesh(new T.BoxGeometry(0.06, 0.04, 0.02), kit.mat({ c: on ? '#6ae090' : dead ? '#3a1a14' : '#c04030', emissive: 1, fogged: 0.4 }));
    led.position.set(0.38, 0.68, 0.135); led.userData.keep = true; m.root.add(led);
    m.animate = (t) => { m.root.position.x = (m.root.userData.x0 ??= m.root.position.x) + (on ? Math.sin(t * 90) * 0.0015 : 0); };
    return m;
  },
  quadro: (kit, p) => make(kit, (b) => {
    place(kit, b, 'quadro', { scale: [1.5, 1.6, 0.8], pos: [0, 0, 0.0], fb: [1.1, 1.9, 0.3] });
    plate(b, 'raio', 0.36, [0, 1.15, 0.2]);
    for (let i = 0; i < 4; i++) b.cyl(p.ligado ? C.lampOn('#e0b040') : C.black, 0.03, 0.03, 0.02, 6, [-0.3 + i * 0.2, 0.62, 0.2], { rx: Math.PI / 2 });
    b.box(C.black, [0.5, 0.1, 0.02], [0, 0.85, 0.2]);
    return { collider: { w: 1.0, d: 0.5 } };
  }),
  bateria: (kit, p) => make(kit, (b) => {
    place(kit, b, 'bateria_base', { fb: [1.6, 0.12, 0.8] });
    for (let i = 0; i < p.celulas; i++) {
      const x = -0.6 + i * 0.4; place(kit, b, 'bateria_celula', { pos: [x, 0.1, 0], fb: [0.34, 0.6, 0.6] });
      for (let k = 0; k < 4; k++) b.box(k < Math.round(p.carga * 4) ? { c: '#6ae090', emissive: 1, fogged: 0.4 } : { c: '#1a2a20' }, [0.05, 0.03, 0.01], [x, 0.5 + k * 0.045, 0.285]);
    }
    return { collider: { w: 1.6, d: 0.8 } };
  }),
  filtro: (kit, p) => make(kit, (b) => {
    const clog = p.estado === 'entupido', gone = p.estado === 'ausente';
    place(kit, b, 'filtro_corpo', { fb: [0.6, 1.3, 0.6] });
    if (!gone) {
      b.cyl({ c: clog ? '#5a4a34' : '#d8d0b0', map: 'tecido' }, 0.17, 0.17, 0.97, 14, [0, 0.19, 0], { tile: 0.3 });
      for (let i = 0; i < 6; i++) b.cyl({ c: clog ? '#3a2c1c' : '#a89f80' }, 0.172, 0.172, 0.012, 14, [0, 0.3 + i * 0.15, 0]);
    } else { b.cyl(C.steelD, 0.03, 0.03, 0.97, 6, [0, 0.19, 0]); b.cyl({ c: '#101418' }, 0.2, 0.2, 0.02, 14, [0, 0.19, 0]); }
    if (clog) { for (let i = 0; i < 6; i++) b.box({ c: '#3a2c1c' }, [0.04 + (i % 3) * 0.02, 0.2 + (i % 2) * 0.1, 0.01], [Math.cos(i * 1.7) * 0.17, 0.4 + i * 0.1, Math.sin(i * 1.7) * 0.17], { ry: -i * 1.7 }); blob(kit, b, { c: '#3a2c1c', opacity: 0.85, depthWrite: false }, 0.05, 0.1, 0.5, 0.4, 5); }
    return { collider: { w: 0.6, d: 0.6 } };
  }),
  // a pipe with its flanges, a valve, the bolts and the straps to the wall (the wall is at its -Z)
  tubo: (kit, p) => make(kit, (b) => {
    const L = p.comprimento, r = p.raio, s = { c: p.cor, map: 'metal' }, y = 0, joints = Math.max(1, Math.floor(L / 1.5));
    if (have('cano')) {   // the painted pipe, a length per joint: its flange at the start, its strap to the wall, and a last flange at the end
      const k = r / 0.06, tint = '#' + new kit.T.Color(p.cor).multiplyScalar(1.9).getHexString();
      for (let i = 0; i < joints; i++) place(kit, b, 'cano', { pos: [-L / 2 + (i * L) / joints, y, 0], scale: [L / joints / 1.5, k, k], tint });
      place(kit, b, 'cano_flange', { pos: [L / 2, y, 0], scale: [1, k, k], tint });
    } else {
      b.cyl(s, r, r, L, 8, [0, y, 0], { rz: Math.PI / 2, cell: 3 });
      for (let i = 0; i <= joints; i++) {
        const x = -L / 2 + (i * L) / joints;
        b.cyl(C.steelD, r * 1.35, r * 1.35, 0.1, 8, [x, y, 0], { rz: Math.PI / 2 });
        for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; b.cyl(C.black, 0.014, 0.014, 0.11, 4, [x, y + Math.sin(a) * r * 1.2, Math.cos(a) * r * 1.2], { rz: Math.PI / 2 }); }
      }
      for (let x = -L / 2 + 0.5; x < L / 2; x += 1.0) { b.box(C.steelD, [0.06, r * 2.8, 0.03], [x, y - r * 1.4, -r - 0.03]); b.box(C.steelD, [0.05, 0.05, 0.14], [x, y - 0.02, -r - 0.1]) }
    }
    if (L > 2.5) { place(kit, b, 'valvula', { pos: [-L / 6, y, 0], scale: r / 0.06 * 0.8 }); b.cyl(C.steel, r * 0.5, r * 0.5, 0.35, 8, [L / 5, y + 0.0, 0.0], { rx: Math.PI / 2, outline: true }); b.cyl(C.ochre, r * 0.7, r * 0.7, 0.04, 8, [L / 5, y, 0.36], { rx: Math.PI / 2, outline: true }); }
    b.plane({ c: '#2a3a46', opacity: 0.5, depthWrite: false }, 0.12, L * 0.3, [L * 0.2, y - 0.4, -r - 0.02], {});   // seepage streak under the joint
  }),
  bancada: (kit, p) => make(kit, (b) => {
    place(kit, b, 'bancada', { scale: [p.comprimento / 3.6, 1, 1], fb: [p.comprimento, 0.9, 0.8] });
    plate(b, 'chave', 0.3, [0, 1.98, -0.36]);
    return { collider: { w: p.comprimento, d: 0.85 } };
  }),
  prateleira: (kit, p) => make(kit, (b) => {
    const L = p.comprimento, n = Math.max(1, Math.round(L)), r = mulberry32(p.semente * 31 + 5);
    for (let i = 0; i < n; i++) place(kit, b, 'prateleira_modulo', { pos: [-L / 2 + (i + 0.5) * (L / n), 0, 0], scale: [L / n, 1, 1], fb: [L / n, 1.9, 0.4] });
    for (let i = 0; i < 4; i++) for (let k = 0; k < Math.floor(L / 0.34); k++) {
      if (r() < 0.45) continue;
      const x = -L / 2 + 0.22 + k * 0.34, y = 0.26 + i * 0.5, z = (r() - 0.5) * 0.1;
      if (p.itens === 'latas') {
        for (const dz of [0.0]) { const h = 0.1 + r() * 0.04, c = ['#f0e8c8', '#e0b060', '#b4c8c6', '#f08a60', '#a0c88a'][Math.floor(r() * 5)], px = x + (r() - 0.5) * 0.08; place(kit, b, 'lata', { pos: [px, y, z + dz], scale: [1, h / 0.12, 1], ry: px * 9, tint: c, fb: [0.1, h, 0.1], fbc: c }); }
        if (r() < 0.1) b.cyl({ c: '#8aa0b0', map: 'vidro' }, 0.045, 0.045, 0.15, 6, [x + 0.1, y, z]);
      } else if (p.itens === 'pecas') {
        const c = ['#7a808a', '#8a6a52', '#4a5a6a', '#b98a38'][Math.floor(r() * 4)];
        if (r() < 0.5) b.box({ c, map: 'metal' }, [0.14 + r() * 0.1, 0.09 + r() * 0.1, 0.16], [x, y, z], { ry: (r() - 0.5) * 0.5, outline: true, tile: 0.5 });
        else { b.cyl({ c, map: 'metal' }, 0.06 + r() * 0.03, 0.06, 0.1 + r() * 0.06, 8, [x, y, z], { outline: true, tile: 0.5 }); b.cyl(C.black, 0.02, 0.02, 0.18, 5, [x, y + 0.04, z], { rz: Math.PI / 2 }); }
      } else if (p.itens === 'caixas') {
        // a cardboard box, taped (the painted prop; the same numbers are drawn from the seed as before, so the shelves keep their order)
        const h = 0.2 + r() * 0.1, tint = ['#f2e6d2', '#ffffff', '#e0d2c0'][Math.floor(r() * 3)], ry = (r() - 0.5) * 0.3; r();
        if (!place(kit, b, 'caixa_papelao', { pos: [x, y, z], scale: [1, h / 0.24, 1], ry: ry + (Math.floor(h * 100) % 2 ? Math.PI / 2 : 0), tint })) { b.box({ c: '#a88a5a', map: 'papelao' }, [0.3, h, 0.3], [x, y, z], { ry, outline: true, tile: 0.4 }); b.box(C.rubber, [0.31, 0.02, 0.31], [x, y + h * 0.5, z], { ry }); }
      } else b.box({ c: ['#a0a090', '#7a6a4a', '#5a6a5a'][Math.floor(r() * 3)], map: 'tecido' }, [0.3, 0.14 + r() * 0.1, 0.3], [x, y, z], { ry: (r() - 0.5) * 0.4, outline: true, tile: 0.5 });
    }
    return { collider: { w: L, d: 0.45 } };
  }),
  // the radio of the station: the piece with parts that move (models/props/radio.js), at its own size (0.48 m wide), no sign on it. The game finds
  // it by `radioProp` on the made entity and drives it (the dial, the display, the lights, the keys, the microphone).
  radio: (kit, p) => {
    const prop = buildRadio(kit.r, { lit: Boolean(p.ligado) });
    return { root: prop.root, dynamic: true, radioProp: prop, collider: { w: 0.48, d: 0.24, soft: true } };
  },
  mesa: (kit, p) => make(kit, (b) => { place(kit, b, 'mesa', { scale: [p.comprimento / 2, 1, 1], fb: [p.comprimento, 0.78, 0.8] }); return { collider: { w: p.comprimento, d: 0.8 } }; }),
  banco: (kit, p) => make(kit, (b) => { place(kit, b, 'banco', { scale: [p.comprimento / 1.8, 1, 1], fb: [p.comprimento, 0.46, 0.3] }); return { collider: { w: p.comprimento, d: 0.3 } }; }),
  cozinha: (kit, p) => make(kit, (b) => {
    place(kit, b, 'cozinha', { scale: [p.comprimento / 3.6, 1, 1], fb: [p.comprimento, 0.9, 0.65] });
    plate(b, 'fogo', 0.26, [-p.comprimento / 2 + 0.55, 1.48, 0.0], { }); b.box(C.black, [0.3, 0.3, 0.01], [-p.comprimento / 2 + 0.55, 1.33, 0.0 - 0.01]);
    return { collider: { w: p.comprimento, d: 0.7 } };
  }),
  caixaDagua: (kit) => make(kit, (b) => {
    place(kit, b, 'caixa_dagua', { fb: [1.1, 1.5, 1.1], fbc: '#4a7aa0' });
    plate(b, 'agua', 0.38, [0, 0.8, 0.505], {});
    return { collider: { w: 1.2, d: 1.2 } };
  }),
  caixote: (kit, p) => make(kit, (b) => {
    const r = mulberry32(p.semente * 17 + 3), k = p.lado / 0.9;
    for (let i = 0; i < p.pilha; i++) {
      const s = k * (1 - i * 0.07); place(kit, b, 'caixote', { pos: [(r() - 0.5) * 0.06, i * 0.72 * k, (r() - 0.5) * 0.06], ry: (r() - 0.5) * 0.3, scale: s, fb: [p.lado, p.lado * 0.7, p.lado] });
    }
    plate(b, 'caixa', Math.min(0.3, p.lado * 0.4), [0, p.lado * 0.4, p.lado / 2 + 0.02]);
    return { collider: { w: p.lado, d: p.lado }, hide: p.esconde ? { radius: p.lado + 0.4 } : undefined };
  }),
  armario: (kit) => make(kit, (b) => { place(kit, b, 'armario', { fb: [0.9, 1.9, 0.5] }); return { collider: { w: 0.9, d: 0.5 }, hide: { radius: 1.0 } }; }),
  balde: (kit) => make(kit, (b) => { place(kit, b, 'balde', { fb: [0.32, 0.3, 0.32], fbc: '#2f5a86' }); return { collider: { w: 0.32, d: 0.32 } }; }),
  // a work lamp hanging on its wire from the vault: a cage with a bulb inside
  lampada: (kit, p) => make(kit, (b) => {
    const y = -p.queda - 0.3;
    tube(kit, b, C.black, [0, 0, 0], [0, -p.queda, 0], 0.008, 4);
    if (have('lampada_gaiola')) place(kit, b, 'lampada_gaiola', { pos: [0, y, 0], scale: 1.0 });
    else b.cyl(C.black, 0.04, 0.04, 0.06, 6, [0, -p.queda - 0.06, 0]);
    b.cyl({ c: p.cor, emissive: p.acesa ? 1 : 0, fogged: 0.5 }, 0.05, 0.035, 0.1, 8, [0, y + 0.06, 0]);
    const lc = '#' + new kit.T.Color(p.cor).lerp(new kit.T.Color('#9fb0d8'), 0.22).multiplyScalar(0.8).getHexString();
    return { light: p.acesa ? { color: lc, range: p.alcance, y: y + 0.12 } : null };
  }),
  goteira: (kit, p) => make(kit, (b) => {
    b.cyl(C.rust, 0.05, 0.05, 0.3, 8, [0, p.altura, 0]); b.cyl(C.steelD, 0.075, 0.075, 0.04, 8, [0, p.altura + 0.06, 0]); b.cyl(C.steelD, 0.075, 0.075, 0.04, 8, [0, p.altura + 0.22, 0]);
    blob(kit, b, { c: '#161e26', opacity: 0.75, depthWrite: false }, 0, 0, 0.62, 0.5, 3);
    blob(kit, b, { c: '#2a3a4a', opacity: 0.6, depthWrite: false }, 0.1, 0.05, 0.28, 0.22, 4, 0.016);
    b.cyl({ c: '#8a8c88' }, 0.1, 0.1, 0.012, 10, [0.3, 0.0, -0.2]);
    return {};
  }),
  cartaz: (kit, p) => make(kit, (b) => { b.box({ c: '#3a2a1e', map: 'ferrugem' }, [p.lado + 0.04, p.lado + 0.04, 0.02], [0, 0, 0], { outline: true, nojitter: true }); plate(b, p.picto, p.lado, [0, 0, 0.012], { y: 0 }); }),
};

// ---- what the unfinished station adds ----------------------------------------------------------------------------------------------------
Object.assign(GALLERY, {
  // six pillars that are not the same: the side with the formwork still on, the height, the tone of the concrete, and what was left lying about
  pilarForma: (kit, p) => make(kit, (b) => {
    const v = p.variante % 6, tint = ['#ffffff', '#e4e6f2', '#f0eee6', '#d4d6cc', '#f4f0ea', '#dde2ee'][v], ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.25][v], H = p.altura;
    place(kit, b, 'pilar_forma', { scale: [1, H / 3.3, 1], ry, tint, fb: [0.5, H, 0.5], fbc: '#8c8a82' });
    if (v === 0) { b.box({ c: '#d8a020', map: 'tecido' }, [0.52, 0.12, 0.52], [0, 1.6, 0], { tile: 0.4, skip: ['+y', '-y'] }); b.box({ c: '#26262a', map: 'borracha' }, [0.525, 0.04, 0.525], [0, 1.66, 0], { tile: 0.4, skip: ['+y', '-y'] }); }                              // a yellow band sprayed on, level mark
    if (v === 1) { for (let k = 0; k < 3; k++) { b.cyl({ c: '#1a1a1d', map: 'borracha' }, 0.03, 0.03, 0.5, 5, [0.24 + k * 0.02, 1.0 + k * 0.5, 0.0], { rz: 0.1 }); b.box({ c: '#9a9a94', map: 'metal' }, [0.05, 0.08, 0.05], [0.27, 1.0 + k * 0.5, 0]); } }       // a cable strapped up the side
    if (v === 2) b.box({ c: '#8a7e70', map: 'madeira' }, [0.08, 0.04, 1.5], [0.38, 0.7, 0.0], { rx: 0.0, rz: 0.55, ry: Math.PI / 2, outline: true });                                    // a plank leaning on it
    if (v === 3) { b.cyl({ c: '#c0b898', map: 'tecido' }, 0.12, 0.12, 0.22, 10, [0.45, 0, 0.2], { outline: true, tile: 0.4 }); b.box({ c: '#6a6c68', map: 'concreto' }, [0.3, 0.12, 0.2], [0.42, 0, -0.1], { ry: 0.4, outline: true, tile: 0.6 }); }   // a coil of rope and a broken block
    if (v === 4) { const o = { tile: 0.4, skip: ['+y', '-y'] }; b.box({ c: '#b82a20', map: 'tecido' }, [0.52, 0.06, 0.52], [0, 2.2, 0], o); b.box({ c: '#e8e4d8', map: 'tecido' }, [0.525, 0.06, 0.525], [0, 2.28, 0], o); b.box({ c: '#b82a20', map: 'tecido' }, [0.52, 0.06, 0.52], [0, 2.36, 0], o); }   // red and white tape
    if (v === 5) { b.plane({ c: '#ffffff', map: 'p:perigo' }, 0.3, 0.3, [0, 1.9, 0.262], { full: true }); }
    return { collider: { w: 0.6, d: 0.6 } };
  }),
  andaime: (kit) => make(kit, (b) => { place(kit, b, 'andaime', { fb: [1.9, 2.3, 0.9] }); return { collider: { w: 1.9, d: 0.9 } }; }),
  betoneira: (kit) => make(kit, (b) => { place(kit, b, 'betoneira', { fb: [0.9, 1.5, 1.0], fbc: '#a04a20' }); return { collider: { w: 0.95, d: 1.0 } }; }),
  formas: (kit) => make(kit, (b) => { place(kit, b, 'forma_tabuas', { fb: [1.2, 1.9, 0.4], fbc: '#b89a6a' }); return { collider: { w: 1.4, d: 0.5 } }; }),
  tambor: (kit, p) => make(kit, (b) => { place(kit, b, 'tambor', { tint: p.cor, fb: [0.58, 0.88, 0.58], fbc: '#4a6a8a' }); return { collider: { w: 0.6, d: 0.6 } }; }),
  galao: (kit) => make(kit, (b) => { place(kit, b, 'galao', { fb: [0.35, 0.46, 0.17], fbc: '#6a7a4a' }); return { collider: { w: 0.35, d: 0.2 } }; }),
  gerador: (kit) => make(kit, (b) => { place(kit, b, 'gerador', { fb: [0.82, 0.58, 0.56] }); return { collider: { w: 0.85, d: 0.6 } }; }),
  fogareiro: (kit, p) => make(kit, (b) => {
    place(kit, b, 'fogareiro', { fb: [0.6, 0.9, 0.6], fbc: '#5a3a28' });
    if (p.aceso) { b.cyl({ c: '#e08a30', emissive: 1, fogged: 0.6 }, 0.22, 0.2, 0.04, 10, [0, 0.8, 0]); }
    return { collider: { w: 0.6, d: 0.6 } };
  }),
  carrinho: (kit) => make(kit, (b) => { place(kit, b, 'carrinho', { fb: [1.27, 0.96, 0.75] }); return { collider: { w: 1.3, d: 0.8 } }; }),
  pneu: (kit) => make(kit, (b) => { place(kit, b, 'pneu', { fb: [0.6, 0.16, 0.6], fbc: '#222' }); return { collider: { w: 0.6, d: 0.6 } }; }),
  caixaFerramentas: (kit) => make(kit, (b) => { place(kit, b, 'caixa_ferramentas', { fb: [0.69, 0.65, 0.41], fbc: '#a04a30' }); return { collider: { w: 0.7, d: 0.45 } }; }),
  palete: (kit, p) => make(kit, (b) => {
    for (let i = 0; i < p.pilha; i++) place(kit, b, 'palete', { pos: [0, i * 0.15, 0], ry: i * 0.12, fb: [1.2, 0.14, 0.8], fbc: '#8a6a42' });
    return { collider: { w: 1.2, d: 0.8 } };
  }),
  sacos: (kit, p) => make(kit, (b) => {
    const r = mulberry32(p.semente * 13 + 1);
    for (let k = 0; k < p.pilha; k++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      if (k > 0 && r() < 0.25) continue;
      place(kit, b, 'saco_cimento', { pos: [(i - 0.5) * 0.5 + (r() - 0.5) * 0.03, k * 0.1, (j - 0.5) * 0.33 + (r() - 0.5) * 0.03], ry: (r() - 0.5) * 0.2, fb: [0.5, 0.1, 0.32], fbc: '#b8b090' });
    }
    return { collider: { w: 1.0, d: 0.7 } };
  }),
  // a stretch of rail the builders left in the mouth of the tunnel: two rails on loose sleepers (turn it to lie across or along)
  trilho: (kit, p) => make(kit, (b) => {
    const n = Math.max(1, Math.round(p.comprimento / 3.2));
    for (let i = 0; i < n; i++) place(kit, b, 'trilho', { pos: [(i - (n - 1) / 2) * 3.2, 0, 0], fb: [3.2, 0.3, 2.4], fbc: '#4a3a30' });
    return {};
  }),
  ralo: (kit) => make(kit, (b) => {
    b.box({ c: '#6a6c68', map: 'concreto' }, [0.62, 0.02, 0.62], [0, 0.0, 0], { nojitter: true, outline: true });
    b.plane({ c: '#ffffff', map: 'grelha' }, 0.5, 0.5, [0, 0.022, 0], { flat: true, tile: 0.12, nojitter: true });
    return {};
  }),
});

/**
 * The ventilation shaft over the floor under it, added to the plain builder of objects.js: the concrete sleeve over the opening, the grille hinged
 * open and hanging from the collar, and the rebar ladder (two rails, rungs, a block at the foot, two braces) down to the floor beside the rope.
 */
export function addShaft(kit, m, p) {
  const A = p.altura, T = kit.T, b = new kit.Batch(), rb = { c: '#6a4026', map: 'ferrugem' }, st = { c: '#4a4e56', map: 'metal' };
  b.cyl({ c: '#6a6c68', map: 'umido', side: 'double' }, 0.62, 0.62, 1.8, 14, [0, A - 0.2, 0], { open: true, nojitter: true });
  // the ladder at the side of the shaft wall (x), rails of rebar, rungs every 0.3 m, brackets into the sleeve at the top
  const lx = -0.2, rz = -0.45;
  if (!place(kit, b, 'escada_poco', { pos: [lx, 0, rz], scale: [1, (A + 1.3) / 5.0, 1] })) {
    for (const sx of [-1, 1]) { b.cyl(rb, 0.016, 0.016, A + 1.3, 6, [lx + sx * 0.2, 0, rz]); b.cyl(rb, 0.012, 0.012, 0.7, 5, [lx + sx * 0.2, 0.0, rz + 0.3], { rx: -1.0 }); }
    for (let y = 0.3; y < A + 1.2; y += 0.3) b.cyl(rb, 0.012, 0.012, 0.4, 5, [lx, y, rz], { rz: Math.PI / 2 });
    b.box({ c: '#6a6c68', map: 'concreto' }, [0.7, 0.1, 0.3], [lx, 0, rz - 0.05], { nojitter: true });
  }
  // the grille: a frame and bars, hinged at the rim and hanging open
  const gp = new T.Group(); gp.position.set(0.0, A - 0.2, 0.66); gp.rotation.x = 1.15;
  const gb = new kit.Batch();
  { const o = { outline: true, tile: 0.5 }; gb.box(st, [1.0, 0.05, 0.05], [0, 0, 0], o); gb.box(st, [1.0, 0.05, 0.05], [0, 0.95, 0], o); gb.box(st, [0.05, 0.95, 0.05], [-0.475, 0, 0], o); gb.box(st, [0.05, 0.95, 0.05], [0.475, 0, 0], o); }
  for (let i = 0; i < 9; i++) gb.cyl({ c: '#3a3c40', map: 'metal' }, 0.012, 0.012, 0.95, 5, [-0.4 + i * 0.1, 0.0, 0]);
  gp.add(gb.build()); m.root.add(gp);
  m.root.add(b.build());
}
