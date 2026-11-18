// A block of the street (floors of window bays over a ground floor of shops) and a glass tower, built as ONE mesh with ONE painting:
// the front is modelled with depth (windows set back in the wall with their reveals, frames, sills and lintels; pilasters, belts and a
// moulded cornice; balconies with iron rails; machines on brackets, a downpipe, a meter box with its conduit; rolling steel shutters of
// real slats, doors set back, shop windows with their joinery, an awning with its thickness, cheeks and a scalloped valance) and painted in
// elevation by facade.js, which is told where each part is. Corners are chamfered, and the parts of the three lowest floors take the outline.
// The far version is the box with the same painting on its front (the openings are painted in it), so the two versions are one material.
import { Shape, rectUV } from './geo.js';
import { paintFacade } from './facade.js';
import { canvas, textureOf, hex, mixc } from './paintkit.js';
import { outlineSpec, OUTLINE } from '../outline.js';
import { addPiece } from './pieces.js';

export const GH = 4;       // the ground floor
export const FH = 3.2;     // an upper floor
export const BASE = 0.15;  // the pavement's height against the wall (a building stands on the road's level)
const PXL = 40, PXU = 20, Y1 = GH + 2 * FH, REC = 0.24, SIDE_PX = 16;
/** The paintings are made as in daylight; the night of the street cools and darkens them, and a share shows whatever the light (as the props). */
const NIGHT = '#8c92a6', PAINTED = 0.24;

const WALLS = [[198, 160, 104], [188, 128, 106], [112, 152, 148], [206, 194, 160], [126, 146, 172], [152, 154, 112], [202, 142, 112], [150, 172, 152], [176, 150, 170]];
const BRICKS = [[160, 86, 62], [144, 78, 66], [172, 106, 74]];
const TRIMS = [[224, 212, 186], [214, 206, 192], [110, 52, 44], [60, 88, 76], [226, 196, 150]];
const JOIN = [[44, 70, 60], [84, 56, 40], [208, 200, 182], [52, 78, 104], [120, 44, 40]];
const ROLL = [[124, 138, 152], [86, 118, 102], [152, 84, 62], [196, 186, 160], [70, 86, 112]];
const AWN = [[180, 70, 52], [64, 104, 150], [206, 160, 64], [78, 124, 88], [140, 60, 84]];

function palette(p, r, brick, tower) {
  const pick = (l) => l[Math.floor(r() * l.length)], given = hex(p.cor ?? '#9a9894');
  const wall = tower ? mixc([112, 130, 142], given, 0.3) : brick ? pick(BRICKS) : mixc(pick(WALLS), given, 0.22);
  const trim = tower ? [70, 78, 88] : brick ? [214, 202, 180] : pick(TRIMS), lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return {
    wall, trim: Math.abs(lum(trim) - lum(wall)) < 36 ? [226, 214, 190] : trim, stone: [176, 170, 156], under: [150, 142, 130], fascia: tower ? [64, 72, 82] : mixc(wall, pick(TRIMS), 0.6),
    iron: [52, 50, 54], join: tower ? [48, 54, 62] : pick(JOIN), roll: pick(ROLL), door: pick([[110, 70, 44], [60, 88, 76], [120, 44, 40], [70, 86, 112]]), awning: pick(AWN),
  };
}

const quad = (T, list, w, h, x, y, z) => list.push({ geo: new T.PlaneGeometry(w, h), matrix: new T.Matrix4().makeTranslation(x, y + h / 2, z) });

/**
 * p: the entity's params; ctx: { kind, upperOnly, groundOnly }; style 'bloco' | 'torre'; r: the building's random function;
 * win: { dim, act, shop, hall } (the window quads of the `interior` shader); `upper`: the list of the windows above.
 * Fills the batches `near` and `far` and returns the height.
 */
export function buildBlock(kit, p, ctx, style, w, d, r, win, upper, near, far) {
  const T = kit.T, fl = p.andares, top = GH + FH * fl, zf = d / 2, zin = zf - REC, tower = style === 'torre', brick = p.fachada === 'tijolo' && !tower;
  const orn = tower ? 3 : brick ? 2 : (p.semente >>> 0) % 2 ? 0 : 1;   // 0 classical (surrounds, pilasters, a moulded cornice), 1 plain (eyebrows, slab bands), 2 brick, 3 tower
  const Htot = top + 1.1, n = Math.max(1, Math.round(w / 3)), bay = w / n, x0 = -w / 2;
  // ---- the canvas: the elevation, the swatches, the side wall --------------------------------------------------------------------------
  const PXH = w <= 15 ? 40 : 34, EW = Math.round(w * PXH), XW = 116, SW = Math.round(d * SIDE_PX), SH = Math.round(Htot * SIDE_PX), CW = EW + 8 + XW + 8 + SW;
  const pyOf = (y) => (y <= Y1 ? y * PXL : Y1 * PXL + (y - Y1) * PXU), CH = Math.max(Math.ceil(pyOf(Htot)) + 2, SH + 4, 300);
  const Xc = (x) => (x + w / 2) * PXH, Yc = (y) => CH - pyOf(Math.max(0, y));
  const R = (xa, ya, xb, yb) => [Xc(xa), Yc(yb), (xb - xa) * PXH, pyOf(yb) - pyOf(ya)];
  const proj = (x, y) => [Xc(Math.max(-w / 2, Math.min(w / 2, x))) / CW, pyOf(Math.max(0, Math.min(Htot, y))) / CH];
  const ex = EW + 8, E = { awning: [ex, 2, XW, 124], iron: [ex, 130, XW, 22], roof: [ex, 156, XW, 84], cloth: [ex, 244, XW, 36], side: [ex + XW + 8, 2, SW, SH] };
  const rc = ([x, y, ww, hh], pad = 1.5) => [(x + pad) / CW, 1 - (y + hh - pad) / CH, (x + ww - pad) / CW, 1 - (y + pad) / CH];
  const items = [], it = (t, xa, ya, xb, yb, more) => { const o = { t, x0: xa, y0: ya, x1: xb, y1: yb, ...more }; items.push(o); return o; };
  const pal = palette(p, r, brick, tower);
  const key = `fac:${p.semente}|${w}|${d}|${fl}|${p.fachada}|${p.cor}|${style}|${ctx.upperOnly ? 'u' : ctx.groundOnly ? 'g' : 'a'}`;
  const spec = { c: NIGHT, map: key, emissive: PAINTED };

  const S = new Shape(T), F = new Shape(T); S.map(proj); F.map(proj);
  const iron = rc(E.iron), ironUV = (x, y, z) => [iron[0] + (iron[2] - iron[0]) * (((x * 3.1 + z * 2.3 + y * 0.7) % 1 + 1) % 1), iron[1] + (iron[3] - iron[1]) * (((y * 2.7 + x) % 1 + 1) % 1)];
  /** The four faces of the wall's thickness round an opening, shaded as the wall is painted just outside it. */
  const reveals = (xa, ya, xb, yb, zi = zin, sides = 'lrtb') => {
    const e = 0.05;
    if (sides.includes('l')) S.poly([[xa, ya, zi], [xa, ya, zf], [xa, yb, zf], [xa, yb, zi]], [1, 0, 0], [proj(xa - e, ya), proj(xa - e, ya), proj(xa - e, yb), proj(xa - e, yb)]);
    if (sides.includes('r')) S.poly([[xb, ya, zi], [xb, ya, zf], [xb, yb, zf], [xb, yb, zi]], [-1, 0, 0], [proj(xb + e, ya), proj(xb + e, ya), proj(xb + e, yb), proj(xb + e, yb)]);
    if (sides.includes('b')) S.poly([[xa, ya, zi], [xb, ya, zi], [xb, ya, zf], [xa, ya, zf]], [0, 1, 0], [proj(xa, ya - e), proj(xb, ya - e), proj(xb, ya - e), proj(xa, ya - e)]);
    if (sides.includes('t')) S.poly([[xa, yb, zi], [xb, yb, zi], [xb, yb, zf], [xa, yb, zf]], [0, -1, 0], [proj(xa, yb + e), proj(xb, yb + e), proj(xb, yb + e), proj(xa, yb + e)]);
  };
  /** The joinery of an opening: a frame of bars with thickness, a mullion, a transom at 30% from the top. */
  const joinery = (xa, ya, xb, yb, z, fw = 0.07, mull = true, tran = true) => {
    const z1 = z + 0.07, sk = ['-z'];
    S.box([xa, ya, z], [xa + fw, yb, z1], 0, sk); S.box([xb - fw, ya, z], [xb, yb, z1], 0, sk); S.box([xa + fw, yb - fw, z], [xb - fw, yb, z1], 0, [...sk, '-x', '+x']); S.box([xa + fw, ya, z], [xb - fw, ya + fw, z1], 0, [...sk, '-x', '+x']);
    if (mull) S.box([(xa + xb) / 2 - fw / 2, ya + fw, z], [(xa + xb) / 2 + fw / 2, yb - fw, z1], 0, [...sk, '+y', '-y']);
    if (tran) { const ty = yb - (yb - ya) * 0.3; S.box([xa + fw, ty - fw / 2, z], [xb - fw, ty + fw / 2, z1], 0, [...sk, '-x', '+x']); }
  };

  // ---- the floors above -----------------------------------------------------------------------------------------------------------------
  if (!ctx.groundOnly) {
    const ww = tower ? 2.7 : brick ? 1.5 : 1.8, wh = tower ? 1.9 : orn === 0 ? 1.7 : 1.5, sillH = tower ? 0.75 : 0.9;
    const balc = new Set();
    if (orn === 0 && n >= 3 && r() < 0.75) balc.add(Math.floor(n / 2)); else if (orn === 1 && r() < 0.65) for (let i = r() < 0.5 ? 0 : 1; i < n; i += 2) balc.add(i); else if (orn === 2 && r() < 0.45) balc.add(Math.floor(r() * n));
    let fire = -1;
    if (brick && fl >= 3 && r() < 0.6) { fire = 1 + Math.floor(r() * Math.max(1, n - 2)); if (fire >= n) fire = n - 1; balc.delete(fire); }
    const pipeSide = r() < 0.8 ? (r() < 0.5 ? -1 : 1) : 0, pilX = orn === 0 || orn === 2 ? [x0 + 0.22, -x0 - 0.22] : [];
    if (orn === 0 && n >= 4) pilX.push(x0 + Math.floor(n / 2) * bay);
    for (let f = 0; f < fl; f++) {
      const y0 = GH + f * FH, fine = f < 4, line = OUTLINE.on && f < 3, ch = fine ? 0.025 : 0;
      for (let i = 0; i < n; i++) {
        const xa = x0 + i * bay, xb = xa + bay, cx = (xa + xb) / 2, isB = balc.has(i), wx0 = cx - ww / 2, wx1 = cx + ww / 2, wy0 = y0 + (isB ? 0.14 : sillH), wy1 = y0 + sillH + wh;
        S.wall(xa, y0, wx0, y0 + FH, zf); S.wall(wx1, y0, xb, y0 + FH, zf); S.wall(wx0, y0, wx1, wy0, zf); S.wall(wx0, wy1, wx1, y0 + FH, zf);
        reveals(wx0, wy0, wx1, wy1);
        const k = r(), state = k < 0.03 && !isB ? 'bricked' : k < 0.11 ? 'boards' : !tower && orn !== 1 && k < 0.19 ? 'louver' : 'glass', planks = isB ? 6 : 4;
        const lit = state === 'glass' && r() < p.luzes;
        it('win', wx0, wy0, wx1, wy1, { state, planks, blind: r() < 0.3, broken: r() < 0.07, transom: !tower, mullion: !tower || r() < 0.5, lit: false });
        if (state === 'glass') { quad(T, upper, ww, wy1 - wy0, cx, wy0, zin + 0.02); if (fine) joinery(wx0, wy0, wx1, wy1, zin + 0.025, tower ? 0.05 : 0.07, !tower, !tower); }
        else {
          S.wall(wx0, wy0, wx1, wy1, state === 'bricked' ? zf - 0.1 : zin + 0.05);
          if (state === 'boards' && fine) for (let q = 0; q < planks; q++) { const hh = (wy1 - wy0) / planks; S.box([wx0, wy1 - (q + 1) * hh + 0.03, zin + 0.05], [wx1, wy1 - q * hh - 0.02, zin + 0.09 + (q % 2) * 0.015], 0, ['-z', '-x', '+x']); }
        }
        if (lit) far.plane({ c: ['#e8c878', '#d8d0a0', '#f0e0a8', '#c8d8e0'][Math.floor(r() * 4)], emissive: 1, fogged: 0.7, night: true, dayC: '#1e2834' }, ww - 0.2, wy1 - wy0 - 0.2, [cx, wy0 + 0.1, zf + 0.03], {});
        if (tower) {
          it('panel', xa + 0.08, y0 + 0.12, xb - 0.08, wy0 - 0.03); it('panel', xa + 0.08, wy1 + 0.03, xb - 0.08, y0 + FH - 0.1);
          continue;
        }
        if (!isB) { S.box([wx0 - 0.13, wy0 - 0.1, zf - 0.02], [wx1 + 0.13, wy0, zf + 0.15], ch, ['-z'], { outline: line }); it('sill', wx0 - 0.13, wy0 - 0.1, wx1 + 0.13, wy0, { d: 0.15 }); }
        if (orn === 0) {
          S.box([wx0 - 0.17, wy1, zf], [wx1 + 0.17, wy1 + 0.2, zf + 0.1], ch, ['-z'], { outline: line }); it('lintel', wx0 - 0.17, wy1, wx1 + 0.17, wy1 + 0.2, { d: 0.1 });
          for (const [ja, jb] of [[wx0 - 0.14, wx0], [wx1, wx1 + 0.14]]) { S.box([ja, wy0, zf], [jb, wy1, zf + 0.06], 0, ['-z', '+y', '-y']); it('frame', ja, wy0, jb, wy1, { d: 0.06 }); }
        } else if (orn === 1) { S.box([wx0 - 0.1, wy1, zf], [wx1 + 0.1, wy1 + 0.1, zf + 0.22], ch, ['-z'], { outline: line }); it('lintel', wx0 - 0.1, wy1, wx1 + 0.1, wy1 + 0.1, { d: 0.22 }); }
        else { S.box([wx0 - 0.12, wy1, zf], [wx1 + 0.12, wy1 + 0.24, zf + 0.05], 0, ['-z']); it('lintel', wx0 - 0.12, wy1, wx1 + 0.12, wy1 + 0.24, { d: 0.05 }); }
        if (orn !== 1 && state === 'glass' && !isB && r() < 0.25) {   // shutters folded back on the wall, one a side
          const lw = Math.min(ww / 2, (bay - ww) / 2 - 0.06);
          for (const [la, lb] of [[wx0 - 0.02 - lw, wx0 - 0.02], [wx1 + 0.02, wx1 + 0.02 + lw]]) { S.box([la, wy0, zf], [lb, wy1, zf + 0.04], 0, ['-z'], { outline: line }); it('leaf', la, wy0, lb, wy1); }
        } else if (state === 'glass' && !isB && r() < 0.16) {         // a machine hung under the sill on two brackets, rust run down from it
          const ax = cx + (r() - 0.5) * 0.7, ay = wy0 - 0.66;
          S.box([ax - 0.38, ay, zf], [ax + 0.38, ay + 0.48, zf + 0.42], fine ? 0.03 : 0, ['-z'], { outline: line }); it('ac', ax - 0.38, ay, ax + 0.38, ay + 0.48);
          for (const s of [-1, 1]) S.box([ax + s * 0.28 - 0.02, ay - 0.22, zf], [ax + s * 0.28 + 0.02, ay, zf + 0.3], 0, ['-z', '+y'], { uv: ironUV });
        }
        if (isB) {                                                    // a balcony: a slab on two corbels, an iron rail of bars, sometimes a cloth on it
          const ba = wx0 - 0.35, bb = wx1 + 0.35, zo = zf + 0.95, step = fine ? 0.13 : 0.3;
          S.box([ba, y0 - 0.02, zf], [bb, y0 + 0.12, zo], ch, ['-z'], { outline: line }); it('balcony', ba, y0 - 0.02, bb, y0 + 0.12, { d: 0.5 });
          for (const cxx of [ba + 0.3, bb - 0.3]) { S.box([cxx - 0.07, y0 - 0.3, zf], [cxx + 0.07, y0 - 0.02, zf + 0.55], fine ? 0.02 : 0, ['-z', '+y']); it('frame', cxx - 0.07, y0 - 0.3, cxx + 0.07, y0 - 0.02, { d: 0.3 }); }
          const old = S.map(ironUV), ry0 = y0 + 0.2, ry1 = y0 + 1.14;
          S.box([ba, ry1, zo - 0.05], [bb, ry1 + 0.05, zo], 0, []); S.box([ba, ry0, zo - 0.04], [bb, ry0 + 0.03, zo - 0.01], 0, []);
          for (const sx of [ba, bb - 0.04]) { S.box([sx, ry1, zf], [sx + 0.04, ry1 + 0.05, zo], 0, ['-z']); S.box([sx, ry0, zf], [sx + 0.03, ry0 + 0.03, zo], 0, ['-z']); S.box([sx, y0 + 0.12, zo - 0.045], [sx + 0.04, ry1, zo - 0.005], 0, ['+y', '-y']); }
          for (let bx = ba + step; bx < bb - 0.06; bx += step) S.box([bx, ry0 + 0.03, zo - 0.036], [bx + 0.022, ry1, zo - 0.014], 0, ['+y', '-y']);
          for (const sx of [ba + 0.009, bb - 0.031]) for (let bz = zf + step; bz < zo - 0.08; bz += step) S.box([sx, ry0 + 0.03, bz], [sx + 0.022, ry1, bz + 0.022], 0, ['+y', '-y']);
          S.map(old);
          if (line) { S.hull([ba, ry1, zo - 0.05], [bb, ry1 + 0.05, zo]); }
          if (r() < 0.4) { const q = Math.floor(r() * 4), c4 = rc(E.cloth), cu = [c4[0] + ((c4[2] - c4[0]) * q) / 4, c4[1], c4[0] + ((c4[2] - c4[0]) * (q + 1)) / 4, c4[3]], lx = ba + 0.3 + r() * (bb - ba - 1.3), lw = 0.6 + r() * 0.3; S.box([lx, y0 + 0.5 + r() * 0.2, zo - 0.002], [lx + lw, ry1 + 0.06, zo + 0.02], 0, ['-z'], { uv: rectUV(cu, 0, lx, lx + lw, 1, y0 + 0.5, ry1 + 0.06) }); }
        }
      }
      // what ties a floor to the next: a moulded belt, a slab's band, the fins of the tower
      if (tower) { for (let i = 0; i <= n; i++) { const fx = x0 + i * bay; S.box([Math.max(x0, fx - 0.06), y0, zf], [Math.min(-x0, fx + 0.06), y0 + FH, zf + 0.16], 0, ['-z', '+y', '-y'], { outline: line }); it('fin', fx - 0.06, y0, fx + 0.06, y0 + FH, { d: 0.16 }); } S.extrude([[zf, y0 + 0.1], [zf + 0.07, y0 + 0.1], [zf + 0.07, y0 - 0.1], [zf, y0 - 0.1]], x0, -x0, { caps: false }); it('belt', x0, y0 - 0.1, -x0, y0 + 0.1, { d: 0.07 }); }
      else if (orn === 0 && f >= 1) { S.extrude([[zf, y0 + 0.09], [zf + 0.1, y0 + 0.09], [zf + 0.1, y0 - 0.02], [zf + 0.04, y0 - 0.09], [zf, y0 - 0.09]], x0, -x0, { caps: false }); it('belt', x0, y0 - 0.09, -x0, y0 + 0.09, { d: 0.1 }); }
      else if (orn === 1 && f >= 1) { S.extrude([[zf, y0 + 0.11], [zf + 0.05, y0 + 0.11], [zf + 0.05, y0 - 0.11], [zf, y0 - 0.11]], x0, -x0, { caps: false }); it('belt', x0, y0 - 0.11, -x0, y0 + 0.11, { d: 0.05 }); }
      else if (orn === 2 && f >= 1 && f % 3 === 0) { S.extrude([[zf, y0 + 0.12], [zf + 0.06, y0 + 0.12], [zf + 0.06, y0 - 0.12], [zf, y0 - 0.12]], x0, -x0, { caps: false }); it('belt', x0, y0 - 0.12, -x0, y0 + 0.12, { d: 0.06 }); }
      for (const px of pilX) { const half = px === x0 + Math.floor(n / 2) * bay && pilX.length > 2 ? 0.16 : 0.22; S.box([px - half, y0, zf], [px + half, y0 + FH, zf + 0.1], fine ? 0.03 : 0, ['-z', '+y', '-y'], { outline: line }); it('pilaster', px - half, y0, px + half, y0 + FH, { d: 0.1 }); }
    }
    // the fire escape of a brick block (a piece of pieces.js, with its own painting)
    if (fire >= 0) { const fx = x0 + (fire + 0.5) * bay; for (let f = 0; f < fl; f++) addPiece(near, 'fire_escape', { pos: [fx, GH + f * FH + 0.85, zf + 0.05], outline: f < 3 }); addPiece(near, 'fire_ladder', { pos: [fx + 0.7, GH + 0.85 - 2.4, zf + 0.55] }); }
    // the downpipe: from the roof down the last pier, a jog over the shop's cornice, and a shoe at the pavement
    if (pipeSide && !tower) {
      const xu = pipeSide * (w / 2 - 0.52), xl = pipeSide * (w / 2 - 0.13), pz = zf + 0.17, rad = 0.055, yj = ctx.upperOnly ? GH + 0.1 : GH + 0.35, pc = [96, 72, 56];
      const bands = []; for (let f = 0; f < fl; f++) bands.push(GH + f * FH + 1.6);
      S.tube([xu, yj, pz], [xu, top - 0.25, pz], rad, rad, 6); it('pipe', xu - rad, yj, xu + rad, top - 0.25, { bands, col: pc });
      for (const by of bands) if (by < GH + 4 * FH) S.box([xu - 0.09, by - 0.03, zf], [xu + 0.09, by + 0.03, pz + 0.07], 0, ['-z']);
      S.tube([xu, top - 0.25, pz], [xu, top + 0.02, zf + 0.3], rad, rad * 1.5, 6);
      if (!ctx.upperOnly) {
        S.tube([xu, yj, pz], [xl, yj - 0.45, pz + 0.12], rad, rad, 6); S.tube([xl, yj - 0.45, pz + 0.12], [xl, BASE + 0.3, pz + 0.12], rad, rad, 6); S.tube([xl, BASE + 0.3, pz + 0.12], [xl, BASE + 0.1, pz + 0.36], rad, rad * 1.1, 6, null, true);
        it('pipe', xl - rad, BASE + 0.2, xl + rad, yj - 0.45, { bands: [1.2, 2.6], col: pc });
        if (OUTLINE.on) S.hull([xl - rad, BASE + 0.2, pz + 0.12 - rad], [xl + rad, yj - 0.5, pz + 0.12 + rad]);
      }
    }
    // ---- the cornice, the parapet, the roof -------------------------------------------------------------------------------------------
    const xa = x0 - 0.18, xb = -x0 + 0.18;
    if (tower) { S.box([x0 - 0.05, top - 0.3, zf], [-x0 + 0.05, top + 1.0, zf + 0.18], 0, ['-z']); it('hood', x0, top - 0.3, -x0, top + 1.0, { d: 0.18 }); }
    else if (orn === 1) { S.extrude([[zf, top + 0.2], [zf + 0.32, top + 0.2], [zf + 0.32, top - 0.08], [zf, top - 0.08]], xa, xb); it('cornice', x0, top - 0.08, -x0, top + 0.2, { d: 0.32 }); }
    else { S.extrude([[zf, top + 0.3], [zf + 0.52, top + 0.3], [zf + 0.52, top + 0.18], [zf + 0.42, top + 0.1], [zf + 0.42, top - 0.02], [zf + 0.24, top - 0.16], [zf + 0.12, top - 0.16], [zf + 0.12, top - 0.3], [zf, top - 0.3]], xa, xb); it('cornice', x0, top - 0.3, -x0, top + 0.3, { d: 0.5, dentils: fl <= 8 ? 0.3 : 0 }); }
    if (!tower) { S.wall(x0, top, -x0, top + 0.9, zf); S.box([x0 - 0.06, top + 0.9, zf - 0.34], [-x0 + 0.06, top + 1.02, zf + 0.08], 0.03, []); it('coping', x0, top + 0.9, -x0, top + 1.02, { d: 0.08 }); }
    // the roof and the rest of the parapet, in the swatches: nobody walks up there
    const side = rc(E.side), roof = rc(E.roof), sideAt = (a, y) => [side[0] + (side[2] - side[0]) * a, side[1] + (side[3] - side[1]) * Math.min(1, y / Htot)];
    S.sheet([x0, top, zf], [w, 0, 0], [0, 0, -d], 6, (a, b) => [roof[0] + (roof[2] - roof[0]) * a, roof[1] + (roof[3] - roof[1]) * b]);
    for (const [pA, du] of [[[x0 + 0.3, top, zf], [0, 0, -d]], [[-x0 - 0.3, top, -zf], [0, 0, d]], [[x0, top, -zf + 0.3], [w, 0, 0]], [[-x0, top, zf - 0.3], [-w, 0, 0]]]) S.sheet(pA, du, [0, 0.9, 0], 6, (a, b) => sideAt(a, top + b * 0.9));
    for (const [lo, hi] of [[[x0 - 0.04, top + 0.9, -zf - 0.04], [x0 + 0.34, top + 1.0, zf - 0.3]], [[-x0 - 0.34, top + 0.9, -zf - 0.04], [-x0 + 0.04, top + 1.0, zf - 0.3]], [[x0 + 0.34, top + 0.9, -zf - 0.04], [-x0 - 0.34, top + 1.0, -zf + 0.34]]]) S.box(lo, hi, 0, ['-y'], { uv: (x, y, z) => sideAt(((x + z) * 0.07 % 1 + 1) % 1, top + 0.8) });
    // the stair's head and the fittings of the roof
    { const ix = (a) => (r() - 0.5) * (w - a), iz = (a) => (r() - 0.5) * (d - a), y = top + 0.02;
      for (let i = 0, k = 1 + Math.floor(r() * 3); i < k; i++) addPiece(near, 'roof_ac', { pos: [ix(3), y, iz(3)], ry: r() * 6, outline: false });
      for (let i = 0, k = Math.floor(r() * 3); i < k; i++) addPiece(near, 'roof_vent', { pos: [ix(3), y, iz(3)], ry: r() * 6, outline: false });
      if (r() < 0.4 && w >= 9) addPiece(near, 'roof_tank', { pos: [ix(5), y, -d / 4 + iz(d / 2)], ry: r() * 3, outline: false });
      if (r() < 0.45) addPiece(near, 'roof_antenna', { pos: [ix(2), y, iz(2)], ry: r() * 6, scale: 0.9 + r() * 0.4, outline: false });
      if (r() < 0.25) addPiece(near, 'roof_dish', { pos: [ix(2), y, iz(2)], ry: r() * 6, outline: false });
      if (r() < 0.55) { const sw = 2.2 + r() * 1.4, hx = ix(sw + 2), hz = iz(4); S.box([hx - sw / 2, top, hz - 1.2], [hx + sw / 2, top + 2.4, hz + 1.2], 0.04, ['-y'], { uv: (x, yy, z) => sideAt(((x + z) * 0.11 % 1 + 1) % 1, yy * 0.6) }); } }
    // the two sides and the back: the blind wall's painting (the sides are seen from the lots and the alleys)
    const h0 = ctx.upperOnly ? GH : 0;
    const hs = top + 0.9 - h0;
    S.sheet([-x0, h0, zf], [0, 0, -d], [0, hs, 0], 3.3, (a, b) => sideAt(1 - a, h0 + b * hs));
    S.sheet([x0, h0, -zf], [0, 0, d], [0, hs, 0], 3.3, (a, b) => sideAt(a, h0 + b * hs));
    S.sheet([-x0, h0, -zf], [-w, 0, 0], [0, hs, 0], 6, (a, b) => sideAt(a, h0 + b * hs));
    for (const [pA, du, flip] of [[[-x0, h0, zf], [0, 0, -d], 1], [[x0, h0, -zf], [0, 0, d], 0], [[-x0, h0, -zf], [-w, 0, 0], 0]]) F.sheet(pA, du, [0, top + 0.9 - h0, 0], 8, (a, b) => sideAt(flip ? 1 - a : a, h0 + b * (top + 0.9 - h0)));
    F.sheet([x0, top + 0.9, zf], [w, 0, 0], [0, 0, -d], 12, (a, b) => [roof[0] + (roof[2] - roof[0]) * a, roof[1] + (roof[3] - roof[1]) * b]);
    for (let f = 0; f < fl; f++) F.wall(x0, GH + f * FH, -x0, GH + (f + 1) * FH, zf, 6);
    F.wall(x0, top, -x0, top + 1.02, zf, 6);
  }

  // ---- the ground floor: shops ---------------------------------------------------------------------------------------------------------
  if (!ctx.upperOnly) {
    const HEAD = 3.05, FAS = 3.8, door = Math.floor(r() * n), kinds = [];
    for (let i = 0; i < n; i++) { const k = r(); kinds.push(i === door ? 'door' : k < 0.3 ? 'vitrine' : k < 0.58 ? 'shutter' : k < 0.7 ? 'half' : k < 0.82 ? 'boards' : k < 0.93 ? 'blank' : 'vitrine'); }
    const strip = orn === 0 || orn === 2, line = OUTLINE.on;
    // the band over the shops and the cornice that ends the ground floor
    for (let i = 0; i < n; i++) S.box([x0 + i * bay, HEAD, zf], [x0 + (i + 1) * bay, FAS, zf + 0.05], 0, ['-z', '+x', '-x', '+y']);
    it('fascia', x0, HEAD, -x0, FAS, { d: 0.05 });
    S.extrude([[zf, GH + 0.06], [zf + 0.28, GH + 0.06], [zf + 0.28, GH - 0.03], [zf + 0.17, GH - 0.1], [zf + 0.17, GH - 0.16], [zf + 0.06, FAS], [zf, FAS]], x0 - 0.1, -x0 + 0.1, { outline: line });
    it('cornice', x0, FAS, -x0, GH + 0.06, { d: 0.28 });
    const boxPier = n > 1 ? 1 + Math.floor(r() * (n - 1)) : -1;
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * bay, xb = xa + bay, cx = (xa + xb) / 2, ox0 = cx - 1.2, ox1 = cx + 1.2, kind = kinds[i], sillY = BASE + 0.5;
      S.wall(xa, 0, ox0, HEAD, zf); S.wall(ox1, 0, xb, HEAD, zf);
      // the plinth of stone under the piers (and under a window), the strip of a pilaster on each pier
      for (const [pa, pb] of [[xa, ox0], [ox1, xb]]) { S.box([pa, 0, zf], [pb, sillY, zf + 0.07], 0.03, ['-z', '-y', ...(pa === xa && i > 0 ? ['-x'] : []), ...(pb === xb && i < n - 1 ? ['+x'] : [])], { outline: line }); it('plinth', pa, 0, pb, sillY, { d: 0.07 }); }
      if (i > 0) it('pier', xa - 0.3, sillY, xa + 0.3, HEAD);
      if (strip && i > 0) { S.box([xa - 0.2, sillY, zf], [xa + 0.2, HEAD, zf + 0.07], 0.03, ['-z', '-y', '+y'], { outline: line }); it('pilaster', xa - 0.2, sillY, xa + 0.2, HEAD, { d: 0.07 }); }
      if (i === boxPier) {                                             // the meter box on a pier, its conduit up to the band
        const bz = zf + (strip ? 0.07 : 0); S.box([xa - 0.2, 1.25, bz], [xa + 0.2, 1.95, bz + 0.16], 0.025, ['-z'], { outline: line }); it('box', xa - 0.2, 1.25, xa + 0.2, 1.95, { mark: true, d: 0.16 });
        S.tube([xa + 0.1, 1.95, bz + 0.07], [xa + 0.1, HEAD + 0.02, bz + 0.07], 0.022, 0.022, 5); it('pipe', xa + 0.078, 1.95, xa + 0.122, HEAD, { bands: [2.5] });
      }
      const under = () => { S.box([ox0, 0, zf], [ox1, sillY, zf + 0.07], 0.03, ['-z', '-y', '-x', '+x'], { outline: line }); it('plinth', ox0, 0, ox1, sillY, { d: 0.07 }); };
      const sill = () => { S.box([ox0 - 0.04, sillY - 0.02, zf - 0.02], [ox1 + 0.04, sillY + 0.05, zf + 0.13], 0.02, ['-z'], { outline: line }); it('sill', ox0 - 0.04, sillY - 0.02, ox1 + 0.04, sillY + 0.05, { d: 0.13 }); };
      /** A curtain of steel slats from `ya` up to the head, with its guides and the box of the roll. */
      const roll = (ya) => {
        const slat = 0.09, zc = zf - 0.13, yt = HEAD - 0.26, prof = [[zc, yt]];
        for (let y = yt; y > ya + slat * 0.5; y -= slat) prof.push([zc + 0.024, y - slat * 0.35], [zc, Math.max(ya, y - slat)]);
        S.extrude(prof, ox0 + 0.06, ox1 - 0.06, { caps: false, cell: 1.3 });
        S.box([ox0 + 0.06, ya, zc - 0.01], [ox1 - 0.06, ya + 0.08, zc + 0.045], 0, ['-z', '-x', '+x']);
        for (const gx of [ox0, ox1 - 0.07]) S.box([gx, BASE, zc - 0.03], [gx + 0.07, yt, zc + 0.05], 0, ['-z', '-y', '+y'], { uv: ironUV });
        S.box([ox0 - 0.04, yt, zf - 0.16], [ox1 + 0.04, HEAD, zf + 0.07], 0.03, ['-z'], { outline: line, uv: ironUV });
        it('shutter', ox0 + 0.06, ya, ox1 - 0.06, yt, { slat });
      };
      if (kind === 'door') {
        const da = cx - 0.8, db = cx + 0.8, dh = 2.75, metal = r() < 0.4;
        S.wall(ox0, 0, da, HEAD, zf); S.wall(db, 0, ox1, HEAD, zf); S.wall(da, dh, db, HEAD, zf);
        for (const [pa, pb] of [[ox0, da], [db, ox1]]) { S.box([pa, 0, zf], [pb, sillY, zf + 0.07], 0.03, ['-z', '-y', '-x', '+x'], { outline: line }); it('plinth', pa, 0, pb, sillY, { d: 0.07 }); }
        reveals(da, BASE, db, dh, zin, 'lrt'); it('open', da, BASE, db, dh, { kind: 'door' });
        S.wall(da, BASE, db, dh, zin + 0.03); it('door', da + 0.07, BASE + 0.02, db - 0.07, dh - 0.07, { metal });
        S.box([da, BASE, zin + 0.03], [da + 0.07, dh, zin + 0.11], 0, ['-z', '-y']); S.box([db - 0.07, BASE, zin + 0.03], [db, dh, zin + 0.11], 0, ['-z', '-y']); S.box([da + 0.07, dh - 0.07, zin + 0.03], [db - 0.07, dh, zin + 0.11], 0, ['-z', '-x', '+x']);
        S.box([cx - 0.02, BASE, zin + 0.03], [cx + 0.02, dh - 0.07, zin + 0.075], 0, ['-z', '-y', '+y']);
        S.box([da - 0.2, BASE - 0.05, zin + 0.03], [db + 0.2, BASE + 0.05, zf + 0.3], 0.02, ['-y'], { outline: line }); it('step', da - 0.2, BASE - 0.05, db + 0.2, BASE + 0.05, { d: 0.3 });
        if (p.letreiro && p.letreiro !== 'nenhum') {
          // the shop's signs: a board over the door and a blade out from the pier, each with the pictogram (never a word)
          S.box([cx - 0.5, HEAD + 0.08, zf + 0.05], [cx + 0.5, FAS - 0.06, zf + 0.11], 0.02, ['-z'], { outline: line }); it('signboard', cx - 0.5, HEAD + 0.08, cx + 0.5, FAS - 0.06);
          near.plane({ c: '#ffffff', map: `p:${p.letreiro}`, emissive: PAINTED }, 0.5, 0.5, [cx, HEAD + 0.12, zf + 0.116], { full: true });
          const bx = da - 0.5, by = 2.55, bz = zf + 0.5;
          near.box({ c: '#3a2a1e', map: 'ferrugem' }, [0.06, 0.72, 0.72], [bx, by, bz], { outline: true, cell: 3, tile: 1 });
          for (const s of [-1, 1]) near.plane({ c: '#ffffff', map: `p:${p.letreiro}`, emissive: PAINTED }, 0.6, 0.6, [bx + s * 0.034, by + 0.06, bz], { full: true, ry: s * Math.PI / 2 });
          S.box([bx - 0.02, by + 0.72, zf], [bx + 0.02, by + 0.76, bz + 0.34], 0, ['-z'], { uv: ironUV }); S.tube([bx, by + 0.74, zf + 0.72], [bx, by + 1.1, zf], 0.012, 0.012, 4, () => [iron[0] + 0.004, iron[1] + 0.004]);
        }
      } else if (kind === 'blank') { S.wall(ox0, 0, ox1, HEAD, zf); under(); it('blank', ox0, sillY, ox1, HEAD); }
      else if (kind === 'shutter') { reveals(ox0, BASE, ox1, HEAD, zin, 'lr'); it('open', ox0, BASE, ox1, HEAD, { kind: 'dark' }); roll(BASE); }
      else {
        under(); sill(); reveals(ox0, sillY, ox1, HEAD);
        if (kind === 'boards') { it('open', ox0, sillY, ox1, HEAD, { kind: 'dark' }); S.box([ox0, sillY, zin + 0.1], [ox1, HEAD, zin + 0.13], 0, ['-z', '-x', '+x', '-y', '+y']); it('ply', ox0, sillY, ox1, HEAD); for (const by of [sillY + 0.5, HEAD - 0.7]) S.box([ox0, by, zin + 0.13], [ox1, by + 0.14, zin + 0.16], 0, ['-z', '-x', '+x']); }
        else {
          it('open', ox0, sillY, ox1, HEAD, { kind: 'vitrine' });
          quad(T, win.shop, ox1 - ox0, HEAD - sillY, cx, sillY, zin + 0.02); joinery(ox0, sillY, ox1, HEAD, zin + 0.025, 0.07, true, true);
          if (kind === 'half') roll(sillY + 0.5 + r() * 1.1);
        }
      }
    }
    // the awning over the door's bay (and the next one): cloth with a thickness on a frame, two cheeks, a valance cut in scallops
    if (r() < 0.8) {
      const i0 = Math.max(0, Math.min(n - 1, door - (r() < 0.5 ? 0 : 1))), span = Math.min(n - i0, r() < 0.6 ? 2 : 1), aa = x0 + i0 * bay + 0.12, ab = x0 + (i0 + span) * bay - 0.12;
      const yT = HEAD - 0.04, yF = 2.42, zw = zf + 0.06, zo = zf + 1.45, A = rc(E.awning), vy = A[1] + (A[3] - A[1]) * 0.2, th = 0.035;
      const segs = Math.max(1, Math.round((ab - aa) / 1.5));
      for (let s = 0; s < segs; s++) {
        const sa = aa + ((ab - aa) * s) / segs, sb = aa + ((ab - aa) * (s + 1)) / segs, ua = s % 2 ? A[2] : A[0], ub = s % 2 ? A[0] : A[2];
        S.poly([[sa, yT, zw], [sb, yT, zw], [sb, yF, zo], [sa, yF, zo]], [0, 1, 0.4], [[ua, A[3]], [ub, A[3]], [ub, vy], [ua, vy]]);
        S.poly([[sa, yT - th, zw], [sb, yT - th, zw], [sb, yF - th, zo], [sa, yF - th, zo]], [0, -1, -0.4], [[ua, A[3]], [ub, A[3]], [ub, vy], [ua, vy]]);
        const m = Math.max(1, Math.round((sb - sa) / 0.3));
        for (let q = 0; q < m; q++) {
          const qa = sa + ((sb - sa) * q) / m, qb = sa + ((sb - sa) * (q + 1)) / m, u0 = ua + ((ub - ua) * q) / m, u1 = ua + ((ub - ua) * (q + 1)) / m, um = (u0 + u1) / 2;
          const pts = [[qa, yF, zo], [qb, yF, zo], [qb, yF - 0.2, zo], [(qa + qb) / 2, yF - 0.29, zo], [qa, yF - 0.2, zo]], uvs = [[u0, vy], [u1, vy], [u1, A[1] + (vy - A[1]) * 0.3], [um, A[1]], [u0, A[1] + (vy - A[1]) * 0.3]];
          S.poly(pts, [0, 0, 1], uvs); S.poly(pts.map(([x, y, z]) => [x, y, z - 0.012]), [0, 0, -1], uvs);
        }
      }
      for (const [cxx, out, u] of [[aa, -1, A[0]], [ab, 1, A[2]]]) { const pts = [[cxx, yT, zw], [cxx, yF, zo], [cxx, yF, zw]], uvs = [[u, A[3]], [u, vy], [u + (A[2] - A[0]) * 0.2 * (out < 0 ? 1 : -1), vy]]; S.poly(pts, [out, 0, 0], uvs); S.poly(pts.map(([x, y, z]) => [x - out * 0.012, y, z]), [-out, 0, 0], uvs); }
      const old = S.map(ironUV);
      S.box([aa - 0.02, yF - 0.035, zo - 0.03], [ab + 0.02, yF + 0.005, zo + 0.012], 0, []);
      for (const axx of [aa + 0.03, ab - 0.03]) { S.tube([axx, yF - 0.02, zw], [axx, yF - 0.02, zo], 0.02, 0.02, 5); S.tube([axx, yT - 0.6, zw - 0.04], [axx, yF - 0.02, zo - 0.2], 0.016, 0.016, 4); }
      S.map(old);
      if (OUTLINE.on) { S.hull([aa - 0.02, yF - 0.035, zo - 0.03], [ab + 0.02, yF + 0.005, zo + 0.012]); S.hull([aa, yT - th, zw], [ab, yT, zw + 0.04]); }
      it('shade', aa, yF - 0.5, ab, yT);
    }
    F.wall(x0, 0, -x0, GH, zf, 6);
    if (ctx.groundOnly) { const side = rc(E.side), sideAt = (a, y) => [side[0] + (side[2] - side[0]) * a, side[1] + (side[3] - side[1]) * Math.min(1, y / Htot)]; for (const [pA, du] of [[[-x0, 0, zf], [0, 0, -d]], [[x0, 0, -zf], [0, 0, d]], [[-x0, 0, -zf], [-w, 0, 0]]]) { S.sheet(pA, du, [0, GH, 0], 3.3, (a, b) => sideAt(a, b * GH)); F.sheet(pA, du, [0, GH, 0], 6, (a, b) => sideAt(a, b * GH)); } }
  }

  // ---- the painting ------------------------------------------------------------------------------------------------------------------------
  if (!kit.has(key)) {
    const [c, g] = canvas(CW, CH);
    g.fillStyle = 'rgb(33,26,22)'; g.fillRect(0, 0, CW, CH);
    paintFacade(g, { w, EW, CW, CH, X: Xc, Y: Yc, R, sx: PXH, sy: (y) => (y < Y1 ? PXL : PXU), Y1, pal, brick, tower, items, extras: E, sidePx: SIDE_PX, r });
    kit.setTexture(key, textureOf(T, c));
  }
  const I = new T.Matrix4(), ng = S.geometry(), fg = F.geometry();
  if (ng) near.add(spec, ng, I);
  if (fg) far.add(spec, fg, I);
  const shell = OUTLINE.on ? S.shell() : null;
  if (shell) near.add(outlineSpec(), shell, I);
  return Htot - 0.08;
}
