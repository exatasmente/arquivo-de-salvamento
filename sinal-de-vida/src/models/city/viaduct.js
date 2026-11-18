// The viaduct over the avenue and its pillars, modelled and painted on one atlas (`rua:viaduto`): the deck's edge and parapet in elevation
// (board-marked concrete, the leak of each expansion joint, rust under the anchors of the rail, concrete burst off the bars), the
// underside (soot, damp, the girders), the pillar unrolled (the rings of its formwork, rain run down from the head, spray shapes and
// torn posters at a hand's height, the hazard stripes of its plinth worn by years). The painting of the side repeats every 12 m, mirrored.
// The same sizes and the same colliders as before: only the look changed.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { Shape } from './geo.js';
import { INK, PALE, css, scale, blob, masses, drip, drips, chip, crack, inkRect, scribble, poster, finish, punch, canvas, textureOf } from './paintkit.js';
import { outlineSpec, OUTLINE } from '../outline.js';

const AT = 1024, SW = { side: [0, 0, 1024, 256], under: [0, 258, 640, 252], girder: [644, 258, 378, 122], pillar: [0, 514, 400, 508], plinth: [404, 514, 300, 130], top: [404, 648, 128, 128], rail: [536, 648, 128, 64], cap: [404, 780, 300, 120], pad: [668, 648, 60, 60] };
const SPEC = { c: '#959bb0', map: 'rua:viaduto', emissive: 0.2 };
const rect = (n, pad = 1.5) => { const [x, y, w, h] = SW[n]; return [(x + pad) / AT, 1 - (y + h - pad) / AT, (x + w - pad) / AT, 1 - (y + pad) / AT]; };
const SPRAY = ['196,70,52', '60,110,160', '226,190,70', '236,232,220', '40,36,40', '90,150,110'];

/** Concrete cast against boards: the grain of each board, the joints between them broken here and there, never a ruled grid. */
function boards(g, r, x, y, w, h, bh, base) {
  g.fillStyle = css(base); g.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += bh) {
    for (let xx = x; xx < x + w;) { const l = 60 + r() * 200; g.fillStyle = css(scale(base, 0.9 + r() * 0.2)); g.fillRect(xx, yy, l, bh); if (r() < 0.8) { g.fillStyle = `rgba(${INK},${0.25 + r() * 0.3})`; g.fillRect(xx + 2, yy + bh - 1, l * (0.4 + r() * 0.6), 1); } g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(xx + l - 1, yy + 1, 1, bh - 2); xx += l; }
  }
}
function paintViaduct(g, r) {
  g.fillStyle = 'rgb(40,36,34)'; g.fillRect(0, 0, AT, AT);
  { const [x, y, w, h] = SW.side, base = [176, 172, 160], px = w / 12, py = h / 2.5;   // 12 m by 2.5 m: from under the edge beam (the foot) to over the parapet's cap
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    boards(g, r, x, y, w, h, 15, base); masses(g, r, x, y, w, h, 46, 60, '40,34,30', PALE, 0.26);
    // the parts in elevation (y down the canvas): the cap, the parapet, the slab's edge, the edge beam
    const Y = (m) => y + h - m * py, cap = [Y(2.32), Y(2.2)], slab = [Y(1.4), Y(0.9)], beam = [Y(0.85), Y(0.5)];
    g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, cap[0], w, cap[1] - cap[0]); g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(x, cap[1], w, 2.2); g.fillStyle = `rgba(${INK},0.25)`; g.fillRect(x, cap[1] + 2.2, w, 7);
    g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x, slab[0] - 1, w, 2); g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x, slab[0] + 1, w, 1.4); g.fillStyle = `rgba(${INK},0.55)`; g.fillRect(x, slab[1], w, 2.4); g.fillStyle = `rgba(${INK},0.22)`; g.fillRect(x, slab[1] + 2.4, w, 10);
    g.fillStyle = 'rgba(30,26,26,0.25)'; g.fillRect(x, beam[0], w, h); g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(x, beam[1], w, 2);
    // the anchors of the rail's posts every 4 m, rust run down from each; a scupper with its long stain; an expansion joint that leaks
    for (const m of [1, 5, 9]) { const ax = x + m * px; g.fillStyle = `rgba(${INK},0.8)`; g.fillRect(ax - 3, cap[0] + 1, 6, 4); drip(g, r, ax, cap[1], 60 + r() * 60, 3, '130,70,34', 0.7); drip(g, r, ax + 2, cap[1], 30 + r() * 40, 2, '130,70,34', 0.5); }
    for (const m of [3.2, 8.6]) { const sx = x + m * px; g.fillStyle = 'rgb(12,12,14)'; g.fillRect(sx - 6, slab[1] - 9, 12, 8); for (let k = 0; k < 4; k++) drip(g, r, sx + (r() - 0.5) * 8, slab[1], 50 + r() * 60, 4 + r() * 4, k % 2 ? '30,34,30' : '200,196,180', 0.5); }
    { const jx = x + 6.9 * px; g.fillStyle = 'rgb(10,10,12)'; g.fillRect(jx - 1.6, y, 3.2, h); for (let k = 0; k < 9; k++) drip(g, r, jx + (r() - 0.5) * 12, slab[0] + r() * 40, 40 + r() * 90, 3 + r() * 6, k % 3 ? '26,30,28' : '206,200,184', 0.5); blob(g, jx, slab[1], 30, 40, '20,24,22', 0.35); }
    drips(g, r, x, x + w, cap[1], 80, '40,34,28', 0.4, 12); drips(g, r, x, x + w, slab[1], 50, '40,34,28', 0.35, 14);
    // concrete burst off the bars: a dark hollow, the bars rusted in it
    for (let i = 0; i < 4; i++) { const cx = x + r() * w, cy = Y(0.6 + r() * 1.3), rx = 12 + r() * 22, ry = 6 + r() * 12; chip(g, r, cx, cy, rx, ry, (gg) => { gg.fillStyle = 'rgb(96,88,78)'; gg.fillRect(cx - rx, cy - ry, rx * 2, ry * 2); for (let k = -2; k <= 2; k++) { gg.fillStyle = 'rgb(150,78,38)'; gg.fillRect(cx - rx, cy + k * 5, rx * 2, 1.8); } }); drip(g, r, cx, cy + ry, 30 + r() * 40, 3, '130,70,34', 0.6); }
    for (let i = 0; i < 9; i++) crack(g, r, x + r() * w, y + r() * h, 30 + r() * 70, r() * 6.3, 1.1, 0.65);
    g.fillStyle = 'rgba(188,184,170,0.7)'; g.fillRect(x + 1.3 * px, Y(2.1), 1.5 * px, 0.5 * py);                 // something painted over on the parapet
    g.restore(); finish(g, r, x, y, w, h, { a: 0.08 }); }
  { const [x, y, w, h] = SW.under; boards(g, r, x, y, w, h, 13, [124, 122, 116]); masses(g, r, x, y, w, h, 40, 60, '14,14,18', '190,186,170', 0.34); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); for (let i = 0; i < 26; i++) blob(g, x + r() * w, y + r() * h, 12 + r() * 40, 10 + r() * 30, r() < 0.5 ? '10,10,14' : '70,84,70', 0.4); for (let i = 0; i < 12; i++) { const cx = x + r() * w, cy = y + r() * h; blob(g, cx, cy, 10, 10, '214,208,190', 0.5); g.fillStyle = 'rgb(226,220,204)'; g.fillRect(cx - 1, cy - 4, 2, 9); } for (let i = 0; i < 8; i++) crack(g, r, x + r() * w, y + r() * h, 40 + r() * 80, r() * 6.3, 1, 0.6); g.restore(); finish(g, r, x, y, w, h, { a: 0.08 }); }
  { const [x, y, w, h] = SW.girder; boards(g, r, x, y, w, h, 12, [150, 146, 136]); masses(g, r, x, y, w, h, 16, 40, '20,20,24', PALE, 0.3); g.fillStyle = `rgba(${INK},0.35)`; g.fillRect(x, y, w, 10); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y + h - 3, w, 3); drips(g, r, x, x + w, y, h * 0.9, '30,30,28', 0.45, 10); for (let i = 0; i < 6; i++) blob(g, x + r() * w, y + r() * h, 10, 14, '130,70,34', 0.4); finish(g, r, x, y, w, h, { a: 0.08, drift: 1 }); }
  { const [x, y, w, h] = SW.pillar, base = [152, 148, 138], py = h / 7;                                       // the shaft unrolled, 7 m high: the top of the canvas is the head
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = css(base); g.fillRect(x, y, w, h);
    for (let yy = y + h; yy > y; yy -= 1.2 * py) { g.fillStyle = css(scale(base, 0.9 + r() * 0.2)); g.fillRect(x, yy - 1.2 * py, w, 1.2 * py); for (let xx = x; xx < x + w;) { const l = 30 + r() * 120; if (r() < 0.75) { g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(xx, yy - 1, l, 1.6); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(xx, yy + 0.6, l, 1); } xx += l + r() * 30; } }
    masses(g, r, x, y, w, h, 40, 60, '40,34,30', PALE, 0.28);
    for (let i = 0; i < 16; i++) drip(g, r, x + r() * w, y, h * (0.2 + r() * 0.6), 4 + r() * 8, i % 3 ? '34,36,32' : '200,196,180', 0.45);
    const sg = g.createLinearGradient(0, y, 0, y + h * 0.25); sg.addColorStop(0, 'rgba(20,22,26,0.5)'); sg.addColorStop(1, 'rgba(20,22,26,0)'); g.fillStyle = sg; g.fillRect(x, y, w, h * 0.25);
    for (let i = 0; i < 5; i++) crack(g, r, x + r() * w, y + r() * h * 0.7, 50 + r() * 90, Math.PI / 2 + (r() - 0.5) * 0.8, 1.2, 0.7);
    for (let i = 0; i < 5; i++) chip(g, r, x + r() * w, y + r() * h, 8 + r() * 16, 8 + r() * 14, [116, 108, 96]);
    // at a hand's height: spray shapes, the rest of posters, a band of paint over older marks
    const hand = y + h - 2.3 * py; g.fillStyle = 'rgba(190,186,172,0.75)'; g.fillRect(x + w * 0.1, hand + 0.3 * py, w * 0.5, 0.9 * py);
    for (let i = 0; i < 5; i++) scribble(g, r, x + r() * (w - 80), hand + r() * 1.2 * py, 36 + r() * 46, SPRAY[Math.floor(r() * SPRAY.length)], 0.82);
    for (let i = 0; i < 4; i++) poster(g, r, x + w * 0.56 + (i % 2) * 44, hand + Math.floor(i / 2) * 56 + (r() - 0.5) * 5, 40, 52, [[214, 204, 180], [[178, 70, 52], [64, 104, 150], [204, 160, 64]][i % 3], [40, 36, 40]]);
    const dg = g.createLinearGradient(0, y + h - 1.1 * py, 0, y + h); dg.addColorStop(0, 'rgba(40,32,24,0)'); dg.addColorStop(1, 'rgba(30,24,18,0.75)'); g.fillStyle = dg; g.fillRect(x, y + h - 1.1 * py, w, 1.1 * py);
    g.restore(); finish(g, r, x, y, w, h, { a: 0.09 }); }
  { const [x, y, w, h] = SW.plinth;                                                                            // the plinth: hazard stripes worn down to the concrete, knocks, the splash of the road
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = 'rgb(160,156,146)'; g.fillRect(x, y, w, h); const band = [y + h * 0.08, h * 0.56];
    g.fillStyle = 'rgb(222,176,48)'; g.fillRect(x, band[0], w, band[1]); g.fillStyle = 'rgb(30,28,30)'; for (let i = -band[1]; i < w; i += 46) { g.beginPath(); g.moveTo(x + i, band[0] + band[1]); g.lineTo(x + i + 23, band[0] + band[1]); g.lineTo(x + i + 23 + band[1], band[0]); g.lineTo(x + i + band[1], band[0]); g.fill(); }
    masses(g, r, x, y, w, h, 14, 30, '40,30,22', PALE, 0.3); for (let i = 0; i < 9; i++) chip(g, r, x + r() * w, band[0] + r() * band[1], 8 + r() * 18, 5 + r() * 10, [140, 136, 126], { pts: 8, lip: 0.25 });
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(14,14,16,0.6)'; g.lineWidth = 2 + r() * 3; const sx = x + r() * w, sy = band[0] + r() * band[1]; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 20 + r() * 50, sy + (r() - 0.5) * 6); g.stroke(); }
    g.fillStyle = `rgba(${PALE},0.45)`; g.fillRect(x, y, w, 2.4); const dg = g.createLinearGradient(0, y + h * 0.6, 0, y + h); dg.addColorStop(0, 'rgba(30,24,18,0)'); dg.addColorStop(1, 'rgba(26,20,16,0.8)'); g.fillStyle = dg; g.fillRect(x, y + h * 0.6, w, h * 0.4); drips(g, r, x, x + w, band[0] + band[1], h * 0.3, '40,30,22', 0.4, 9);
    g.restore(); finish(g, r, x, y, w, h, { n: 14, a: 0.09, drift: 1 }); }
  { const [x, y, w, h] = SW.cap; boards(g, r, x, y, w, h, 12, [166, 162, 150]); masses(g, r, x, y, w, h, 12, 40, '30,28,26', PALE, 0.3); g.fillStyle = `rgba(${INK},0.4)`; g.fillRect(x, y, w, 12); drips(g, r, x, x + w, y + 10, h * 0.8, '30,30,28', 0.5, 9); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y + h - 3, w, 3); finish(g, r, x, y, w, h, { n: 10, a: 0.08, drift: 1 }); }
  { const [x, y, w, h] = SW.top; g.fillStyle = 'rgb(60,60,68)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 12, 30, '14,14,20', '170,170,180', 0.3); for (let i = 0; i < 5; i++) crack(g, r, x + r() * w, y + r() * h, 40, r() * 6.3, 1, 0.6); }
  { const [x, y, w, h] = SW.rail; g.fillStyle = 'rgb(58,60,68)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 10, 16, '14,12,12', '196,150,110', 0.4); for (let i = 0; i < 14; i++) blob(g, x + r() * w, y + r() * h, 4 + r() * 8, 3 + r() * 5, '150,80,40', 0.6); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(x, y, w, 1.6); }
  { const [x, y, w, h] = SW.pad; g.fillStyle = 'rgb(26,26,30)'; g.fillRect(x, y, w, h); g.fillStyle = `rgba(${PALE},0.25)`; g.fillRect(x, y, w, 2); }
}
function install(kit) { if (kit.has('rua:viaduto')) return; const [c, g] = canvas(AT, AT); paintViaduct(g, mulberry32(9311)); punch(g, 0.42); kit.setTexture('rua:viaduto', textureOf(kit.T, c)); }
const end = (kit, S, extra = {}) => { const b = new kit.Batch(), I = new kit.T.Matrix4(), g = S.geometry(); if (g) b.add(SPEC, g, I); const sh = OUTLINE.on ? S.shell() : null; if (sh) b.add(outlineSpec(), sh, I); const root = new kit.T.Group(); root.add(b.build()); return { root, ...extra }; };
const tri = (z, n = 12) => { const k = ((z / n) % 2 + 2) % 2; return k > 1 ? 2 - k : k; };   // the painting of the side laid along z, there and back

export const VIADUCT = {
  viaduto: (kit, p) => {
    install(kit);
    const S = new Shape(kit.T), Lg = p.comprimento, W = p.largura, y = p.altura, hw = W / 2, z0 = -Lg / 2, z1 = Lg / 2;
    const SD = rect('side'), UN = rect('under'), GI = rect('girder'), TP = rect('top'), RL = rect('rail');
    const side = (px, py, pz) => [SD[0] + (SD[2] - SD[0]) * tri(pz), SD[1] + (SD[3] - SD[1]) * Math.max(0, Math.min(1, (py - (y - 0.5)) / 2.5))];
    const under = (px, py, pz) => [UN[0] + (UN[2] - UN[0]) * tri(pz), UN[1] + (UN[3] - UN[1]) * Math.max(0, Math.min(1, (px + hw + 0.1) / (W + 0.2)))];
    const girder = (px, py, pz) => [GI[0] + (GI[2] - GI[0]) * tri(pz), GI[1] + (GI[3] - GI[1]) * Math.max(0, Math.min(1, (py - (y - 0.5)) / 0.9))];
    const flatUV = (R, a = 0.5, b = 0.5) => () => [R[0] + (R[2] - R[0]) * a, R[1] + (R[3] - R[1]) * b];
    for (let z = z0; z < z1 - 1e-6; z += 3) {
      const za = z, zb = Math.min(z1, z + 3);
      // the underside of the slab between the girders, the girders (their two cheeks and their soffit), the edge beam and the slab's edge
      S.map(under); S.poly([[-hw, y + 0.4, za], [hw, y + 0.4, za], [hw, y + 0.4, zb], [-hw, y + 0.4, zb]], [0, -1, 0]);
      for (let i = 0; i < 5; i++) { const gx = -hw + 0.8 + (i * (W - 1.6)) / 4; S.map(girder); S.poly([[gx - 0.25, y - 0.5, za], [gx - 0.25, y + 0.4, za], [gx - 0.25, y + 0.4, zb], [gx - 0.25, y - 0.5, zb]], [-1, 0, 0]); S.poly([[gx + 0.25, y - 0.5, za], [gx + 0.25, y + 0.4, za], [gx + 0.25, y + 0.4, zb], [gx + 0.25, y - 0.5, zb]], [1, 0, 0]); S.map(under); S.poly([[gx - 0.25, y - 0.5, za], [gx + 0.25, y - 0.5, za], [gx + 0.25, y - 0.5, zb], [gx - 0.25, y - 0.5, zb]], [0, -1, 0]); }
      S.map(side);
      for (const s of [-1, 1]) {
        const xo = s * (hw + 0.1), xi = s * (hw - 0.4), c = 0.04;
        S.poly([[xo, y, za], [xo, y + 0.9, za], [xo, y + 0.9, zb], [xo, y, zb]], [s, 0, 0]);                        // the edge beam and the slab's edge, one face
        S.poly([[xo, y, za], [xo - s * 0.5, y, za], [xo - s * 0.5, y, zb], [xo, y, zb]], [0, -1, 0]);
        S.poly([[xo - s * 0.5, y, za], [xo - s * 0.5, y + 0.4, za], [xo - s * 0.5, y + 0.4, zb], [xo - s * 0.5, y, zb]], [-s, 0, 0]);
        // the parapet: its outer face, its top with a chamfer each side, its inner face; the cap over it
        const xp = s * hw, yb = y + 0.9, yt = y + 1.7;
        S.poly([[xp, yb, za], [xp, yt, za], [xp, yt, zb], [xp, yb, zb]], [s, 0, 0]); S.poly([[xi, yb, za], [xi, yt, za], [xi, yt, zb], [xi, yb, zb]], [-s, 0, 0]);
        S.poly([[xo, y + 0.9, za], [xp, y + 0.9, za], [xp, y + 0.9, zb], [xo, y + 0.9, zb]], [0, 1, 0]);
        const xa = s * (hw + 0.07), xb2 = s * (hw - 0.47);
        for (const [pa, pb, out] of [[[xa, yt, 0], [xa, yt + 0.12 - c, 0], [s, 0, 0]], [[xa, yt + 0.12 - c, 0], [xa - s * c, yt + 0.12, 0], [s, 1, 0]], [[xa - s * c, yt + 0.12, 0], [xb2 + s * c, yt + 0.12, 0], [0, 1, 0]], [[xb2 + s * c, yt + 0.12, 0], [xb2, yt + 0.12 - c, 0], [-s, 1, 0]], [[xb2, yt + 0.12 - c, 0], [xb2, yt, 0], [-s, 0, 0]], [[xa, yt, 0], [xp, yt, 0], [0, -1, 0]]]) S.poly([[pa[0], pa[1], za], [pb[0], pb[1], za], [pb[0], pb[1], zb], [pa[0], pa[1], zb]], out);
      }
      S.map(flatUV(TP, tri(z, 6), 0.5)); S.poly([[-hw + 0.4, y + 0.92, za], [hw - 0.4, y + 0.92, za], [hw - 0.4, y + 0.92, zb], [-hw + 0.4, y + 0.92, zb]], [0, 1, 0]);
    }
    // the cross beams, the ends, the rail (posts every 4 m, two bars and a panel of mesh drawn as bars), the scuppers and their pipes
    S.map(girder); for (let z = z0 + 2; z < z1; z += 5) for (const [dz, out] of [[-0.15, -1], [0.15, 1]]) S.poly([[-hw + 0.6, y - 0.4, z + dz], [hw - 0.6, y - 0.4, z + dz], [hw - 0.6, y + 0.4, z + dz], [-hw + 0.6, y + 0.4, z + dz]], [0, 0, out]);
    S.map(under); for (let z = z0 + 2; z < z1; z += 5) S.poly([[-hw + 0.6, y - 0.4, z - 0.15], [hw - 0.6, y - 0.4, z - 0.15], [hw - 0.6, y - 0.4, z + 0.15], [-hw + 0.6, y - 0.4, z + 0.15]], [0, -1, 0]);
    S.map(flatUV(RL, 0.4, 0.5));
    for (const s of [-1, 1]) {
      const x = s * (hw - 0.2);
      for (let z = z0 + 1; z <= z1; z += 4) S.box([x - 0.05, y + 1.82, z - 0.05], [x + 0.05, y + 2.76, z + 0.05], 0, ['-y']);
      for (const yy of [y + 2.2, y + 2.72]) S.box([x - 0.035, yy - 0.035, z0], [x + 0.035, yy + 0.035, z1], 0, ['-z', '+z']);
      for (let z = z0 + 1.5; z < z1; z += 1) S.box([x - 0.012, y + 1.84, z - 0.012], [x + 0.012, y + 2.2, z + 0.012], 0, ['-y', '+y']);
      for (let z = z0 + 6; z < z1; z += 22) { S.map(flatUV(rect('pad'))); S.box([x + s * 0.28 - 0.12, y + 0.2, z - 0.2], [x + s * 0.28 + 0.12, y + 0.42, z + 0.2], 0, []); S.map(flatUV(RL, 0.4, 0.5)); S.tube([x + s * 0.3, y + 0.2, z], [x + s * 0.3, y - 0.3, z], 0.07, 0.07, 6, null); }
    }
    return end(kit, S);
  },
  pilar: (kit, p, e) => {
    install(kit);
    const S = new Shape(kit.T), R = p.raio, H = p.altura, seg = 14, PL = rect('pillar'), PN = rect('plinth'), CP = rect('cap'), seed = Math.round((e?.pos?.[0] ?? 0) * 7 + (e?.pos?.[2] ?? 0) * 13);
    S.at([0, 0, 0], (seed % 7) * 0.9);
    const pu = (v0, v1) => (k, en) => [PL[0] + ((PL[2] - PL[0]) * k) / seg, PL[1] + (PL[3] - PL[1]) * (en ? v1 : v0)];
    const hs = [0.9, 2.4, 3.9, H - 1.0], rad = (yy) => R * (1.12 - 0.12 * (yy / (H - 1)));
    let ya = 0.9; for (const yb of hs.slice(1)) { S.tube([0, ya, 0], [0, yb, 0], rad(ya), rad(yb), seg, pu(ya / 7, yb / 7), false, ya < 3); ya = yb; }
    // the head: it flares to the pad under the girders; the plinth with its chamfers and worn stripes
    S.tube([0, H - 1.0, 0], [0, H - 0.3, 0], R * 1.0, R * 1.75, seg, (k, en) => [CP[0] + ((CP[2] - CP[0]) * k) / seg, CP[1] + (CP[3] - CP[1]) * (en ? 0.75 : 0)]); S.tube([0, H - 0.3, 0], [0, H, 0], R * 1.75, R * 1.9, seg, (k, en) => [CP[0] + ((CP[2] - CP[0]) * k) / seg, CP[1] + (CP[3] - CP[1]) * (en ? 1 : 0.75)]);
    S.at(null);
    const a = R * 2.1, lo = [-a, H, -a], hi = [a, H + 0.5, a];
    S.box(lo, hi, 0.05, ['+y'], { uv: (x, y, z) => [CP[0] + (CP[2] - CP[0]) * (((x + z) / (a * 4)) + 0.5), CP[1] + (CP[3] - CP[1]) * Math.min(1, (y - H) / 0.5)] });
    const q = R * 1.45, plo = [-q, 0, -q], phi = [q, 0.9, q];
    S.box(plo, phi, 0.06, ['-y'], { outline: true, uv: (x, y, z) => [PN[0] + (PN[2] - PN[0]) * Math.max(0, Math.min(1, (Math.abs(x) > q - 0.07 ? z + q : x + q) / (q * 2))), PN[1] + (PN[3] - PN[1]) * Math.min(1, y / 0.9)] });
    return end(kit, S, { collider: { w: R * 2.3, d: R * 2.3 } });
  },
};
