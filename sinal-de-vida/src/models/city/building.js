// The buildings of the street. The blocks and the towers are made in block.js (one mesh and one painting each, the front modelled with
// depth); here are the houses with a pitched roof and a low wall and the warehouses with rolling doors (of the other kinds of sector),
// still made of the kit's parts. Each entity makes two versions: `near` (all of it) and `far` (a box with the painted facade,
// the old look), and the windows apart (quads for the `interior` shader). Local frame: the front faces +Z, x across, the origin at
// the bottom centre. No text: signs are pictograms. All of it from the seed of the building.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { buildBlock, GH, FH } from './block.js';

export { GH, FH };
const mix = (a, b, k) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), f = (s) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k); return '#' + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1); };
export { mix };

/** What kind of building this is: 'casa' (a low house in a yard), 'galpao' (a warehouse), 'bloco' (floors with window bays), 'torre' (a glass tower). */
export function styleOf(p, kind) {
  if (p.andares <= 2 && p.fachada !== 'vidro') return kind === 'residencial' ? 'casa' : kind === 'industrial' ? 'galpao' : kind === 'orla' ? (p.semente % 2 ? 'casa' : 'galpao') : 'bloco';
  if (kind === 'industrial' && p.andares <= 3) return 'galpao';
  return p.fachada === 'vidro' ? 'torre' : 'bloco';
}

const tw = (T, w, h) => new T.PlaneGeometry(w, h);
/** One window quad (UV 0..1) facing +Z, its centre at (x, y + h/2, z). */
function quad(T, list, w, h, x, y, z) { list.push({ geo: tw(T, w, h), matrix: new T.Matrix4().makeTranslation(x, y + h / 2, z) }); }

/** A roof with two slopes (ridge along x) and two gable ends: base at y0, rise, overhang o. Added to batch b with specs. */
function gable(b, T, specRoof, specGable, w, d, y0, rise, o, z0 = 0) {
  const hw = w / 2 + o, hd = d / 2 + o, p = (x, y, z) => [x, y, z + z0];
  const tri = (a, c, e) => [...a, ...c, ...e];
  const addTris = (spec, verts, uvs, nrm) => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    void nrm; b.add(spec, g, new T.Matrix4());
  };
  const A = p(-hw, y0, hd), B = p(hw, y0, hd), C = p(-hw, y0 + rise, 0), D = p(hw, y0 + rise, 0), E = p(-hw, y0, -hd), F = p(hw, y0, -hd);
  const sl = Math.hypot(hd, rise), uw = (hw * 2) / 3, us = sl / 3;
  addTris(specRoof, [...tri(A, B, D), ...tri(A, D, C)], [0, 0, uw, 0, uw, us, 0, 0, uw, us, 0, us], 0); // the front slope (normal up and +z)
  addTris(specRoof, [...tri(E, C, D), ...tri(E, D, F)], [0, 0, 0, us, uw, us, 0, 0, uw, us, uw, 0], 0);
  // the gable ends (under the roof, flush with the walls)
  const gw = w / 2, G = [p(-gw, y0, d / 2), p(-gw, y0 + rise * (1 - o / hd) * 0.98, 0), p(-gw, y0, -d / 2)], H = [p(gw, y0, d / 2), p(gw, y0, -d / 2), p(gw, y0 + rise * (1 - o / hd) * 0.98, 0)];
  addTris(specGable, [...tri(G[0], G[2], G[1])], [0, 0, d / 3, 0, d / 6, rise / 3], 0);
  addTris(specGable, [...tri(H[0], H[2], H[1])], [0, 0, d / 3, 0, d / 6, rise / 3], 0);
}

/** A wall with recessed windows: piers, bands, sills, frames and the quads. Returns the window centres [{ x, y, z, f }]. */
function wallWindows(c, o) {
  const { b, T, r } = c, out = [];
  const n = Math.max(1, Math.round(o.w / o.bay)), bay = o.w / n, ww = o.ww, wh = o.wh, t = o.t, zf = o.zf, zc = zf - t / 2;
  const x0 = -o.w / 2, wall = o.wall, trim = o.trim, dark = o.dark;
  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.fh, sillY = y + o.sill, headY = sillY + wh;
    // the sill band under the windows and the head band over them (their faces toward the opening are the reveal)
    b.box(wall, [o.w, o.sill, t], [0, y, zc], { tile: o.tile ?? 3, cell: 3, nojitter: true, skip: ['-z', '-y'] });
    b.box(wall, [o.w, o.fh - o.sill - wh, t], [0, headY, zc], { tile: o.tile ?? 3, cell: 3, nojitter: true, skip: ['-z', '+y'] });
    // the piers between the windows
    for (let i = 0; i <= n; i++) {
      const xa = i === 0 ? x0 : x0 + i * bay - (bay - ww) / 2, xb = i === n ? x0 + o.w : x0 + i * bay + (bay - ww) / 2;
      if (xb - xa < 0.05) continue;
      b.box(wall, [xb - xa, wh, t], [(xa + xb) / 2, sillY, zc], { tile: o.tile ?? 3, cell: 3, nojitter: true, skip: ['-y', '+y', '-z'], outline: f < 3 });   // (the outline of a pier draws the window beside it; only on the floors the street sees from near)
    }
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * bay, k = r();
      out.push({ x: cx, y: sillY, z: zf, f });
      if (o.skip && k < o.skip) { b.box(wall, [ww, wh, 0.1], [cx, sillY, zf - t + 0.05], { skip: ['-z', '+y', '-y', '+x', '-x'], tile: 3, cell: 3 }); continue; }
      const gz = zf - t + 0.03;
      if (o.board && k < (o.skip ?? 0) + o.board) { // boarded up: planks with a slant
        b.plane({ c: '#b8a07a', map: 'tapume' }, ww, wh, [cx, sillY, gz + 0.05], { tile: 1.4, cell: 3, full: false });
        b.plane({ c: '#3a3028' }, ww * 1.05, 0.12, [cx, sillY + wh * 0.5, gz + 0.07], { cell: 3 });
      } else quad(T, o.winList, ww, wh, cx, sillY, gz);
      // frame (planes in front of the glass), mullion, and a sill that sticks out
      if (!o.noFrame) {
        const fz = gz + 0.035, fw = 0.07;
        b.plane(dark, ww, fw, [cx, sillY, fz], { cell: 3, tile: 1 }); b.plane(dark, ww, fw, [cx, headY - fw, fz], { cell: 3, tile: 1 });
        b.plane(dark, fw, wh, [cx - ww / 2 + fw / 2, sillY, fz], { cell: 3, tile: 1 }); b.plane(dark, fw, wh, [cx + ww / 2 - fw / 2, sillY, fz], { cell: 3, tile: 1 });
        if (o.mullion !== false) b.plane(dark, 0.05, wh, [cx, sillY, fz], { cell: 3, tile: 1 });
      }
      if (o.sillTrim) b.box(trim, [ww + 0.24, 0.09, 0.2], [cx, sillY - 0.08, zf + 0.06], { cell: 3, tile: 1, nojitter: true, outline: f < 3 });
      if (o.lintel) b.box(trim, [ww + 0.2, 0.12, 0.12], [cx, headY, zf + 0.02], { cell: 3, tile: 1, nojitter: true });
      if (o.ac && r() < o.ac) { b.box({ c: '#b8bcc0', map: 'metal' }, [0.7, 0.45, 0.35], [cx + (r() - 0.5) * 0.4, sillY - 0.45, zf + 0.3], { cell: 3 }); b.plane({ c: '#1c1d20' }, 0.4, 0.22, [cx, sillY - 0.38, zf + 0.476], { cell: 3 }); }
      if (o.balcony && f > 0 && r() < o.balcony) {
        b.box({ c: '#8c8a84', map: 'concreto' }, [ww + 0.9, 0.12, 0.9], [cx, y + 0.78, zf + 0.45 - t * 0], { cell: 3, tile: 2 });
        for (let k2 = 0; k2 <= 6; k2++) b.box(dark, [0.03, 0.9, 0.03], [cx - (ww + 0.8) / 2 + (k2 * (ww + 0.8)) / 6, y + 0.9, zf + 0.88], { cell: 3 });
        b.box(dark, [ww + 0.9, 0.04, 0.05], [cx, y + 1.8, zf + 0.88], { cell: 3 });
        if (r() < 0.5) b.box({ c: '#d8d4c8', map: 'tecido' }, [ww * 0.7, 0.5, 0.05], [cx, y + 1.0, zf + 0.84], { cell: 3, tile: 1 }); // laundry on the rail
      }
    }
  }
  return out;
}

/** Spec helpers from the params. */
function specs(p, style) {
  const brick = p.fachada === 'tijolo';
  const wall = brick ? { c: p.cor, map: 'tijolo' } : { c: p.cor, map: 'reboco' };
  const trim = { c: mix(p.cor, '#d8d4c8', 0.55), map: 'concreto' };
  const dark = { c: '#2a2c30', map: 'metal' };
  const blind = { c: p.cor, map: brick ? 'tijolo' : 'empena' };
  return { wall, trim, dark, blind, brick };
}

/**
 * The building. p: the entity's params (largura, profundidade, andares, semente, fachada, cor, letreiro, marquise, luzes), ctx: { kind, upperOnly, groundOnly }.
 * Returns { near: Batch, far: Batch, win: { dim, act, shop, hall }: [{ geo, matrix }], w, d, h, style }.
 */
export function buildBuilding(kit, p, ctx = {}) {
  const T = kit.T, r = mulberry32((p.semente >>> 0) * 101 + 7), near = new kit.Batch(), far = new kit.Batch();
  const style = ctx.style ?? styleOf(p, ctx.kind), w = Math.max(6, Math.round(p.largura / 3) * 3), d = p.profundidade, fl = p.andares;
  const win = { dim: [], act: [], shop: [], hall: [] }, S = specs(p, style), upper = p.luzes > 0.075 ? win.act : win.dim;
  const c = { b: near, T, r, kit };
  let h = GH + FH * fl;
  if (style === 'casa') h = houseNear(c, p, w, d, S, win, upper);
  else if (style === 'galpao') h = hallNear(c, p, w, d, S, win);
  else h = buildBlock(kit, p, ctx, style, w, d, r, win, upper, near, far);   // (a block or a tower: one mesh, one painting, its far version with it)
  if (style === 'casa' || style === 'galpao') farBuilding(kit, far, p, w, d, style, h, S, r, ctx);
  return { near, far, win, w, d, h, style };
}

// ---- the house: a body with windows and shutters, a gable roof, a porch, a yard with a low wall and a gate ---------------------------
function houseNear(c, p, w, d, S, win, upper) {
  const { b, T, r } = c, hw = w - 1.6, hd = Math.min(d - 5.5, 9), z0 = -d / 2 + hd / 2, zf = z0 + hd / 2, fh = 2.9, t = 0.3;
  const body = S.wall, roofC = r() < 0.5 ? '#c07a58' : '#8a5a48';
  // the body (two floors) behind its front of window bays
  b.box(body, [hw, fh * 2, hd - t], [0, 0, z0 - t / 2], { tile: 3, cell: 4, nojitter: true, skip: ['+z', '+y', '-y'], specs: { '+x': S.blind, '-x': S.blind, '-z': { c: p.cor, map: 'reboco' } } });
  b.box(S.trim, [hw + 0.1, 0.5, hd + 0.1], [0, 0, z0], { cell: 4, tile: 2, nojitter: true, skip: ['-y', '+y'] });
  // the windows come through the same wall builder, with the front plane at the house's front
  wallWindows(c, { w: hw, floors: 2, y0: 0, fh, bay: 3, ww: 1.3, wh: 1.35, sill: 0.95, t, zf, wall: body, trim: S.trim, dark: S.dark, winList: upper, skip: 0.05, board: 0.06, sillTrim: true, lintel: false, tile: 3 });
  // the roof, the chimney
  const top = fh * 2;
  b.box({ c: p.cor, map: 'reboco' }, [hw + 0.2, 0.22, hd + 0.2], [0, top - 0.02, z0], { cell: 4, tile: 3, nojitter: true, skip: ['-y'] });
  gable(b, T, { c: roofC, map: 'telha' }, S.wall, hw, hd, top, 1.9 + r() * 0.8, 0.55, z0);
  b.box({ c: '#8a6a58', map: 'tijolo' }, [0.7, 2.6, 0.7], [(r() - 0.5) * hw * 0.6, top + 0.4, z0 - hd * 0.25], { cell: 3, tile: 1 });
  // the porch: a slab, two posts, a shed roof over the door, steps
  const px = (r() - 0.5) * hw * 0.4, pw = 2.6;
  b.box(S.trim, [pw, 0.35, 1.4], [px, 0, zf + 0.7], { cell: 3, tile: 2, nojitter: true });
  for (const s of [-1, 1]) b.box(S.trim, [0.18, 2.5, 0.18], [px + s * (pw / 2 - 0.2), 0.35, zf + 1.25], { cell: 3, tile: 1, nojitter: true });
  b.box({ c: roofC, map: 'telha' }, [pw + 0.4, 0.12, 1.7], [px, 2.85, zf + 0.75], { cell: 3, tile: 2, nojitter: true });
  b.plane({ c: '#6a4a38', map: 'madeira' }, 1.0, 2.2, [px, 0.35, zf + 0.03], { cell: 3, tile: 1 });
  // the yard: a low wall with pillars along the street, a gate (closed), a mailbox post; dead bushes
  const yz = d / 2 - 0.15, gx = (r() - 0.5) * (w - 4), gw = 2.2;
  const wallSpec = { c: mix(p.cor, '#c8c4b8', 0.4), map: 'reboco' };
  for (const [xa, xb] of [[-w / 2, gx - gw / 2], [gx + gw / 2, w / 2]]) if (xb - xa > 0.1) b.box(wallSpec, [xb - xa, 1.1, 0.24], [(xa + xb) / 2, 0, yz], { cell: 3, tile: 3, nojitter: true });
  for (const x of [-w / 2 + 0.15, gx - gw / 2, gx + gw / 2, w / 2 - 0.15]) { b.box(wallSpec, [0.4, 1.5, 0.4], [x, 0, yz], { cell: 3, tile: 1, nojitter: true }); b.box(S.trim, [0.5, 0.1, 0.5], [x, 1.5, yz], { cell: 3, tile: 1, nojitter: true }); }
  for (let k = 0; k <= 8; k++) b.box(S.dark, [0.04, 1.35, 0.04], [gx - gw / 2 + 0.1 + (k * (gw - 0.2)) / 8, 0.1, yz], { cell: 3 });
  b.box(S.dark, [gw, 0.05, 0.05], [gx, 1.1, yz], { cell: 3 }); b.box(S.dark, [gw, 0.05, 0.05], [gx, 0.35, yz], { cell: 3 });
  for (let i = 0; i < 3; i++) { const x = (r() - 0.5) * (w - 3), z = zf + 1.8 + r() * (yz - zf - 2.4); b.cyl({ c: '#5a4a2a', map: 'tecido' }, 0.06, 0.1, 0.7, 5, [x, 0, z]); const g = new T.IcosahedronGeometry(0.38 + r() * 0.2, 0); g.scale(1, 0.7, 1); b.geo({ c: '#6a6a3a', map: 'tecido' }, g, [x, 0.7, z]); }
  return top + 2.4;
}

// ---- the warehouse -------------------------------------------------------------------------------------------------------------
function hallNear(c, p, w, d, S, win) {
  const { b, T, r } = c, h = p.andares >= 3 ? 9.6 : 7.2, sheet = { c: mix(p.cor, '#ffffff', 0.1), map: 'chapa' }, zf = d / 2;
  b.box(sheet, [w, h, d], [0, 0.6, 0], { tile: [4, 4], cell: 4, nojitter: true, skip: ['-y', '+y'], specs: { '+z': sheet } });
  b.box({ c: '#7a7a76', map: 'concreto' }, [w + 0.1, 0.9, d + 0.1], [0, 0, 0], { cell: 4, tile: 2, nojitter: true, skip: ['-y', '+y'] });
  // rolling doors (one or two), a small door, a clerestory band of windows under the eaves, a loading dock
  const nd = w >= 21 ? 2 : 1;
  for (let i = 0; i < nd; i++) {
    const cx = nd === 1 ? -w / 4 : -w / 2 + (i + 0.5) * (w / nd) - (i ? 0 : 0), dw = 4.2, open = r() * 0.45;
    b.box(S.dark, [dw + 0.5, 4.4, 0.4], [cx, 0.6, zf - 0.1], { cell: 4, skip: ['-z'] });
    b.plane({ c: '#d8d8d4', map: 'persiana' }, dw, 3.9 * (1 - open), [cx, 0.7 + 3.9 * open, zf + 0.12], { tile: 2, cell: 4 });
    if (open > 0.05) { b.box({ c: '#101114' }, [dw, 3.9 * open, 0.05], [cx, 0.7, zf + 0.08], { cell: 4 }); b.box(S.dark, [dw, 0.22, 0.3], [cx, 0.7 + 3.9 * open - 0.1, zf + 0.15], { cell: 4 }); }
    b.box({ c: '#6a6a66', map: 'concreto' }, [dw + 1.4, 1.0, 1.6], [cx, 0, zf + 0.8], { cell: 3, tile: 2 }); // the dock
    for (const s of [-1, 1]) b.box({ c: '#26282c', map: 'borracha' }, [0.4, 0.5, 0.2], [cx + s * (dw / 2 + 0.2), 0.3, zf + 1.7]);
  }
  const dx = nd === 1 ? w / 4 : w / 2 - 1.5;
  b.box(S.dark, [1.4, 2.5, 0.2], [dx, 0.6, zf + 0.02], { cell: 3 }); b.plane({ c: '#6a6e74', map: 'metal' }, 1.1, 2.3, [dx, 0.6, zf + 0.13], { tile: 1 });
  const bandY = h - 1.6, n = Math.max(2, Math.round(w / 3.4)), bw = (w - 1) / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + 0.5 + (i + 0.5) * bw; quad(T, win.hall, bw - 0.35, 1.1, cx, bandY, zf + 0.04);
    b.plane(S.dark, bw - 0.3, 0.07, [cx, bandY, zf + 0.08], { cell: 3, tile: 1 }); b.plane(S.dark, bw - 0.3, 0.07, [cx, bandY + 1.03, zf + 0.08], { cell: 3, tile: 1 });
  }
  b.box(S.trim, [w + 0.2, 0.3, 0.5], [0, h + 0.3, zf - 0.15], { cell: 4, tile: 2, nojitter: true });
  gable(b, T, { c: '#7a8086', map: 'chapa' }, sheet, w, d, h + 0.6, 1.4, 0.3, 0);
  // skylights, a stack, pipes on the side wall, drums by the wall
  for (let i = 0; i < 2; i++) b.box({ c: '#5a6a72', map: 'vidro' }, [2.2, 0.35, 1.6], [(r() - 0.5) * (w - 6), h + 1.5, (r() - 0.5) * (d - 6)], { cell: 3, tile: 1 });
  if (r() < 0.5) { b.cyl({ c: '#8a6a52', map: 'ferrugem' }, 0.5, 0.65, h + 5, 10, [w / 2 - 2, 0, -d / 2 + 3]); b.cyl({ c: '#3a3a3c' }, 0.72, 0.5, 0.4, 10, [w / 2 - 2, h + 5, -d / 2 + 3]); }
  for (const s of [-1, 1]) { b.cyl({ c: '#5a646c', map: 'metal' }, 0.1, 0.1, d - 2, 8, [s * (w / 2 + 0.2), 2.6, 0], { rx: Math.PI / 2, cell: 6 }); }
  for (let i = 0; i < 3; i++) b.cyl({ c: ['#a8442a', '#3a5a8a', '#6a7a4a'][Math.floor(r() * 3)], map: 'metal' }, 0.3, 0.3, 0.9, 10, [-w / 2 + 1 + i * 0.7, 0, zf + 0.6 + r() * 0.4]);
  return h + 2;
}

// ---- the far version: a box with the painted facade (the street from a distance) ------------------------------------------------
function farBuilding(kit, b, p, w, d, style, h, S, r, ctx = {}) {
  if (style === 'casa') {
    const hw = w - 1.6, hd = Math.min(d - 5.5, 9), z0 = -d / 2 + hd / 2;
    b.box(S.wall, [hw, 5.8, hd], [0, 0, z0], { tile: 3, cell: 6, nojitter: true, skip: ['-y', '+y'] });
    gable(b, kit.T, { c: '#a8684c', map: 'telha' }, S.wall, hw, hd, 5.8, 2.1, 0.5, z0);
    b.box({ c: mix(p.cor, '#c8c4b8', 0.4), map: 'reboco' }, [w, 1.2, 0.24], [0, 0, d / 2 - 0.15], { cell: 6, tile: 3, nojitter: true });
    return;
  }
  if (style === 'galpao') {
    b.box({ c: p.cor, map: 'chapa' }, [w, h - 2, d], [0, 0, 0], { tile: [4, 4], cell: 6, nojitter: true, skip: ['-y'] });
    b.box({ c: '#d8d8d4', map: 'persiana' }, [4.2, 3.9, 0.1], [-w / 4, 0.6, d / 2 + 0.03], { cell: 6, tile: 2 });
    return;
  }
  const gh = GH, uh = h - GH, wall = S.wall;
  const upper = p.fachada === 'vidro' ? { c: '#9aa8b8', map: 'vidro' } : { c: p.cor, map: p.fachada === 'tijolo' ? 'tijolo' : 'modulo' };
  if (!ctx.upperOnly) b.box(wall, [w, gh, d], [0, 0, 0], { tile: 3, cell: 6, nojitter: true });
  b.box(upper, [w, uh, d], [0, gh, 0], { tile: [3, 3.2], cell: 6, nojitter: true, specs: { '+y': { c: '#2a2c30', map: 'concreto' }, '-y': wall, '+x': S.blind, '-x': S.blind } });
  b.box({ c: '#2a2c30', map: 'concreto' }, [w + 0.3, 0.4, d + 0.3], [0, gh + uh, 0], { cell: 8 });
  if (!ctx.upperOnly) {
    b.box({ c: '#1c2230', map: 'vidro' }, [w - 2, 2.6, 0.06], [0, 0.35, d / 2 + 0.02], { tile: 2, cell: 6, nojitter: true });
    b.box({ c: '#26282c', map: 'concreto' }, [w, 0.5, 0.3], [0, gh - 0.1, d / 2 + 0.1], { cell: 6 });
  }
  const cols = Math.floor(w / 3);
  for (let row = 0; row < p.andares; row++) for (let cc = 0; cc < cols; cc++) {
    if (r() >= p.luzes) continue;
    b.plane({ c: ['#e8c878', '#d8d0a0', '#f0e0a8', '#c8d8e0'][Math.floor(r() * 4)], emissive: 1, fogged: 0.7, night: true, dayC: '#1e2834' }, 1.4, 1.5, [-w / 2 + cc * 3 + 1.5, gh + row * 3.2 + 0.85, d / 2 + 0.03], {});
  }
}
