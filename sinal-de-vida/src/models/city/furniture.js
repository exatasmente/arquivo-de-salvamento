// The furniture of the street, modelled with chamfers and painted on ONE small atlas (`rua:mob`) by the brush of paintkit.js: traffic
// lights (a tapered post on a flange, an arm, a housing with three hooded lenses, a walker's lamp), sign posts, the hydrant, cones and
// barriers, the solar panels on their frames, dead trees in their pits, weeds, bags of rubbish and scraps, the wires from lamp to lamp
// and down to the houses, and the walls that close the empty lots and the alleys (their own painting, `rua:muro`: render fallen off the
// brick, rain from the coping, spray shapes without a letter, torn posters, a sheet-iron gate). Everything of the atlas is one material,
// so the whole furniture of the street is a draw call or two; what stands near the walker takes the outline.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { Shape } from './geo.js';
import { INK, PALE, css, mixc, scale, blob, masses, drip, drips, chip, crack, inkRect, part, scribble, poster, bricks, finish, punch, canvas, textureOf } from './paintkit.js';
import { outlineSpec, OUTLINE } from '../outline.js';

const AT = 512;
/** The swatches of the atlas, in pixels: [x, y, w, h]. */
const SW = {
  pole: [2, 2, 40, 252], bark: [46, 2, 84, 252], housing: [134, 2, 96, 160], signback: [234, 2, 78, 78], hydrant: [234, 84, 78, 120], cone: [316, 2, 62, 94],
  barrier: [382, 2, 128, 46], iron: [316, 100, 62, 40], concrete: [382, 52, 128, 76], cabinet: [408, 132, 100, 122], panel: [2, 260, 198, 118], panelDirty: [204, 260, 198, 118],
  weed: [2, 384, 62, 62], wire: [70, 388, 12, 12], bag: [152, 384, 94, 94], paper: [250, 384, 94, 94], plank: [348, 384, 94, 94], yellow: [316, 144, 62, 40], lens: [134, 166, 96, 30], cloth: [316, 188, 88, 66],
};
export const MOB = { c: '#9298ac', map: 'rua:mob', emissive: 0.22 };
const rect = (n, pad = 1.5) => { const [x, y, w, h] = SW[n]; return [(x + pad) / AT, 1 - (y + h - pad) / AT, (x + w - pad) / AT, 1 - (y + pad) / AT]; };
/** uv over a swatch for a tube: round it across the swatch, v from v0 to v1 (shares of the swatch's height, 0 at its foot). */
const round = (n, v0 = 0, v1 = 1, seg = 8) => { const R = rect(n); return (k, e) => [R[0] + ((R[2] - R[0]) * k) / seg, R[1] + (R[3] - R[1]) * (e ? v1 : v0)]; };
/** uv over a swatch for a box in space from lo to hi: across by x and z, up by y. */
const fit = (n, lo, hi) => { const R = rect(n), dx = hi[0] - lo[0], dz = hi[2] - lo[2], dy = hi[1] - lo[1] || 1; return (x, y, z) => [R[0] + (R[2] - R[0]) * Math.max(0, Math.min(1, ((x - lo[0]) + (z - lo[2])) / (dx + dz || 1))), R[1] + (R[3] - R[1]) * Math.max(0, Math.min(1, (y - lo[1]) / dy))]; };
const flat = (n, u = 0.5, v = 0.5) => { const R = rect(n); return () => [R[0] + (R[2] - R[0]) * u, R[1] + (R[3] - R[1]) * v]; };

function paintMob(g, r) {
  const P = (n) => SW[n];
  g.fillStyle = 'rgb(40,34,30)'; g.fillRect(0, 0, AT, AT);
  { const [x, y, w, h] = P('pole');                                   // galvanised steel: lit from one side, rust creeping up from the foot, a band, the ghost of stickers
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgb(96,100,108)'); gr.addColorStop(0.35, 'rgb(176,180,186)'); gr.addColorStop(1, 'rgb(60,62,70)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    masses(g, r, x, y, w, h, 14, 18, '30,30,38', PALE, 0.3); for (let i = 0; i < 16; i++) blob(g, x + r() * w, y + h - r() * h * 0.3, 5 + r() * 9, 6 + r() * 14, '140,74,36', 0.55);
    for (let i = 0; i < 7; i++) drip(g, r, x + r() * w, y + r() * h * 0.7, 20 + r() * 50, 2, '110,60,30', 0.4);
    for (const by of [0.3, 0.62]) { g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x, y + h * by, w, 2.4); g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x, y + h * by + 2.4, w, 1); }
    for (let i = 0; i < 3; i++) { g.fillStyle = css([[196, 70, 52], [226, 190, 70], [236, 232, 220]][i], 0.7); g.fillRect(x + r() * w * 0.5, y + h * (0.66 + i * 0.07), w * 0.4, 9); }
    g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x, y + h - 5, w, 5); }
  { const [x, y, w, h] = P('bark');                                   // dead bark: grey-brown, long dark furrows, pale where it peeled
    g.fillStyle = 'rgb(112,92,74)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 16, 22, '30,22,16', '206,190,160', 0.35);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.lineCap = 'round';
    for (let i = 0; i < 46; i++) { const fx = x + r() * w, fy = y + r() * h, l = 14 + r() * 50; g.strokeStyle = `rgba(${INK},${0.4 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(fx, fy); g.bezierCurveTo(fx + (r() - 0.5) * 6, fy + l * 0.3, fx + (r() - 0.5) * 6, fy + l * 0.7, fx + (r() - 0.5) * 4, fy + l); g.stroke(); g.strokeStyle = `rgba(${PALE},0.25)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(fx + 1.6, fy); g.lineTo(fx + 1.6, fy + l); g.stroke(); }
    for (let i = 0; i < 6; i++) chip(g, r, x + r() * w, y + r() * h, 4 + r() * 7, 8 + r() * 14, [196, 178, 146], { pts: 7, lip: 0.2 });
    const gr = g.createLinearGradient(0, y + h * 0.75, 0, y + h); gr.addColorStop(0, 'rgba(20,14,10,0)'); gr.addColorStop(1, 'rgba(20,14,10,0.6)'); g.fillStyle = gr; g.fillRect(x, y + h * 0.75, w, h * 0.25); g.restore(); }
  { const [x, y, w, h] = P('housing');                                // the signal's body: black-green paint chipped to the primer, three dead lenses under their hoods
    part(g, r, x, y, w, h, [44, 54, 50], { top: 0.5, under: 0.5, n: 6 });
    for (let i = 0; i < 3; i++) { const cy = y + h * (0.19 + i * 0.31), cx = x + w / 2, rad = w * 0.26; g.fillStyle = 'rgb(10,10,12)'; g.beginPath(); g.arc(cx, cy, rad * 1.18, 0, 6.3); g.fill(); g.fillStyle = css([[92, 34, 28], [104, 78, 30], [30, 76, 50]][i]); g.beginPath(); g.arc(cx, cy, rad, 0, 6.3); g.fill(); blob(g, cx - rad * 0.3, cy - rad * 0.35, rad * 0.5, rad * 0.4, PALE, 0.4); g.fillStyle = `rgba(${INK},0.75)`; g.beginPath(); g.arc(cx, cy - rad * 0.2, rad * 1.2, 3.4, 6.0); g.arc(cx, cy - rad * 0.55, rad * 1.1, 6.0, 3.4, true); g.fill(); }
    for (let i = 0; i < 9; i++) chip(g, r, x + r() * w, y + r() * h, 3 + r() * 5, 2 + r() * 5, r() < 0.5 ? [150, 80, 44] : [196, 170, 70], { pts: 6 });
    for (let i = 0; i < 5; i++) drip(g, r, x + r() * w, y + r() * h * 0.6, 20 + r() * 40, 2, '120,64,30', 0.45); }
  { const [x, y, w, h] = P('lens'); for (let i = 0; i < 3; i++) { g.fillStyle = css([[92, 34, 28], [104, 78, 30], [30, 76, 50]][i]); g.fillRect(x + (i * w) / 3, y, w / 3, h); blob(g, x + (i + 0.4) * (w / 3), y + h * 0.4, w / 7, h / 3, PALE, 0.35); } }
  { const [x, y, w, h] = P('signback'); part(g, r, x, y, w, h, [120, 124, 128], { top: 0.5, under: 0.5, n: 5 }); for (let i = 0; i < 12; i++) blob(g, x + r() * w, y + r() * h, 4 + r() * 9, 3 + r() * 7, '140,74,36', 0.55); for (const [bx, by] of [[0.5, 0.3], [0.5, 0.7]]) { g.fillStyle = `rgba(${INK},0.9)`; g.beginPath(); g.arc(x + w * bx, y + h * by, 2.4, 0, 6.3); g.fill(); drip(g, r, x + w * bx, y + h * by, 18, 2, '110,60,30', 0.6); } }
  { const [x, y, w, h] = P('hydrant');                                // red paint over rust, a chain's shine, the cap bolts
    part(g, r, x, y, w, h, [170, 52, 40], { top: 0.5, under: 0.5, n: 7 }); for (let i = 0; i < 14; i++) chip(g, r, x + r() * w, y + r() * h, 3 + r() * 6, 3 + r() * 6, [110, 62, 36], { pts: 6 });
    for (const by of [0.14, 0.3, 0.86]) { g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x, y + h * by, w, 2); g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x, y + h * by + 2, w, 1); }
    for (let i = 0; i < 6; i++) drip(g, r, x + r() * w, y + h * 0.3, 30 + r() * 40, 2.4, '70,30,20', 0.5); const gr = g.createLinearGradient(0, y + h * 0.7, 0, y + h); gr.addColorStop(0, 'rgba(30,20,14,0)'); gr.addColorStop(1, 'rgba(30,20,14,0.6)'); g.fillStyle = gr; g.fillRect(x, y + h * 0.7, w, h * 0.3); }
  { const [x, y, w, h] = P('cone'); part(g, r, x, y, w, h, [214, 104, 44], { top: 0.4, under: 0.5, n: 5 }); g.fillStyle = 'rgb(226,220,204)'; g.fillRect(x, y + h * 0.3, w, h * 0.2); masses(g, r, x, y, w, h, 6, 14, '40,26,16', PALE, 0.3); inkRect(g, x, y + h * 0.3, w, h * 0.2, 0.5, 1, 0); const gr = g.createLinearGradient(0, y + h * 0.6, 0, y + h); gr.addColorStop(0, 'rgba(30,22,16,0)'); gr.addColorStop(1, 'rgba(30,22,16,0.7)'); g.fillStyle = gr; g.fillRect(x, y + h * 0.6, w, h * 0.4); }
  { const [x, y, w, h] = P('barrier'); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = 'rgb(226,188,52)'; g.fillRect(x, y, w, h); g.fillStyle = 'rgb(30,28,30)'; for (let i = -h; i < w; i += 30) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 15, y + h); g.lineTo(x + i + 15 + h, y); g.lineTo(x + i + h, y); g.fill(); } masses(g, r, x, y, w, h, 8, 16, '40,28,18', PALE, 0.3); for (let i = 0; i < 12; i++) chip(g, r, x + r() * w, y + r() * h, 3 + r() * 6, 2 + r() * 4, [150, 146, 140], { pts: 6 }); g.fillStyle = `rgba(${PALE},0.5)`; g.fillRect(x, y, w, 1.6); g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x, y + h - 2, w, 2); g.restore(); }
  { const [x, y, w, h] = P('iron'); g.fillStyle = 'rgb(54,52,58)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 8, 12, '14,12,12', '196,150,110', 0.4); for (let i = 0; i < 9; i++) blob(g, x + r() * w, y + r() * h, 3 + r() * 6, 2 + r() * 4, '150,80,40', 0.6); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(x, y, w, 1.4); }
  { const [x, y, w, h] = P('yellow'); g.fillStyle = 'rgb(214,170,50)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 6, 12, '50,36,16', PALE, 0.35); for (let i = 0; i < 7; i++) chip(g, r, x + r() * w, y + r() * h, 3 + r() * 5, 2 + r() * 4, [120, 110, 100], { pts: 6 }); }
  { const [x, y, w, h] = P('concrete'); part(g, r, x, y, w, h, [164, 160, 150], { top: 0.5, under: 0.5, n: 8 }); crack(g, r, x + w * 0.3, y, h * 0.9, 1.4, 1, 0.7); drips(g, r, x, x + w, y, h * 0.7, '50,40,30', 0.4, 9); for (let i = 0; i < 4; i++) blob(g, x + r() * w, y + h, 10, 8, '36,30,22', 0.5); }
  { const [x, y, w, h] = P('cabinet');                                // a grey-green cabinet: two doors, louvres, rust at the foot, a spray shape, a torn poster
    part(g, r, x, y, w, h, [108, 126, 116], { top: 0.55, under: 0.5, n: 7 }); for (const dx of [0.06, 0.52]) { inkRect(g, x + w * dx, y + h * 0.08, w * 0.42, h * 0.84, 0.6, 1.1, 0.3); for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(x + w * (dx + 0.08), y + h * 0.14 + i * 3.5, w * 0.26, 1.2); } }
    for (let i = 0; i < 12; i++) blob(g, x + r() * w, y + h - r() * h * 0.2, 5 + r() * 9, 3 + r() * 7, '140,74,36', 0.6); scribble(g, r, x + w * 0.15, y + h * 0.55, w * 0.5, '236,232,220', 0.8); poster(g, r, x + w * 0.58, y + h * 0.4, w * 0.3, h * 0.3, [[214, 204, 180], [178, 70, 52], [40, 36, 40]]); drips(g, r, x, x + w, y, h * 0.5, '50,40,30', 0.4, 8); }
  for (const [n, dirty] of [['panel', 0], ['panelDirty', 1]]) { const [x, y, w, h] = P(n);   // the cells of a solar panel under their glass; the dirty one under a film of dust with the runs of rain in it
    g.fillStyle = 'rgb(34,58,112)'; g.fillRect(x, y, w, h); const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(170,200,250,0.4)'); gr.addColorStop(0.5, 'rgba(170,200,250,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    for (let i = 0; i <= 8; i++) { g.fillStyle = 'rgba(206,212,222,0.8)'; g.fillRect(x + (i * w) / 8 - 0.7, y, 1.4, h); } for (let j = 0; j <= 5; j++) { g.fillStyle = 'rgba(206,212,222,0.8)'; g.fillRect(x, y + (j * h) / 5 - 0.7, w, 1.4); }
    g.strokeStyle = 'rgb(150,154,160)'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4); inkRect(g, x, y, w, h, 0.8, 1.2, 0.4);
    if (dirty) { g.fillStyle = 'rgba(176,158,120,0.72)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 16, 26, '90,74,48', '226,214,180', 0.35); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); for (let i = 0; i < 14; i++) drip(g, r, x + r() * w, y + r() * h * 0.4, h * (0.4 + r() * 0.5), 3, '40,58,100', 0.5); for (let i = 0; i < 9; i++) blob(g, x + r() * w, y + r() * h, 3 + r() * 4, 2 + r() * 3, '236,232,220', 0.7); g.restore(); }
    else { masses(g, r, x, y, w, h, 6, 30, '10,14,30', PALE, 0.2); } }
  { const [x, y, w, h] = P('weed'); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgb(150,160,84)'); gr.addColorStop(0.5, 'rgb(96,116,60)'); gr.addColorStop(1, 'rgb(40,52,32)'); g.fillStyle = gr; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 6, 14, '30,30,14', '214,200,120', 0.35); }
  { const [x, y, w, h] = P('wire'); g.fillStyle = 'rgb(18,16,18)'; g.fillRect(x - 2, y - 2, w + 4, h + 4); }
  { const [x, y, w, h] = P('bag'); g.fillStyle = 'rgb(30,30,36)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 10, 20, '6,6,10', '120,126,150', 0.5); g.save(); g.lineCap = 'round'; for (let i = 0; i < 16; i++) { g.strokeStyle = `rgba(150,160,190,${0.2 + r() * 0.35})`; g.lineWidth = 1 + r() * 1.6; const fx = x + r() * w, fy = y + r() * h; g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + (r() - 0.5) * 20, fy + 10, fx + (r() - 0.5) * 16, fy + 18 + r() * 14); g.stroke(); } g.restore(); }
  { const [x, y, w, h] = P('paper'); g.fillStyle = 'rgb(206,198,178)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 8, 20, '70,54,36', PALE, 0.35); for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(x + 6, y + 8 + i * 9, w * (0.4 + r() * 0.45), 2.2); } g.fillStyle = css([178, 70, 52], 0.7); g.fillRect(x + w * 0.55, y + 6, w * 0.35, h * 0.28); }
  { const [x, y, w, h] = P('plank'); g.fillStyle = 'rgb(150,116,78)'; g.fillRect(x, y, w, h); for (let i = 0; i < 4; i++) { g.fillStyle = css(scale([160, 124, 82], 0.76 + r() * 0.4)); g.fillRect(x, y + (i * h) / 4 + 1, w, h / 4 - 2); g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x, y + (i * h) / 4, w, 1.4); } masses(g, r, x, y, w, h, 8, 20, '40,26,14', PALE, 0.3); }
  { const [x, y, w, h] = P('cloth'); g.fillStyle = 'rgb(72,96,132)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 8, 20, '20,26,40', '190,200,220', 0.4); for (let i = 0; i < 6; i++) drip(g, r, x + r() * w, y, h * 0.8, 3, '20,24,36', 0.4); }
  finish(g, r, 0, 0, AT, AT, { n: 60, a: 0.08, drift: 3 });
}

export function installMob(kit) {
  if (kit.has('rua:mob')) return;
  const [c, g] = canvas(AT, AT); paintMob(g, mulberry32(4177)); punch(g, 0.42); kit.setTexture('rua:mob', textureOf(kit.T, c));
}

/** Ends a Shape into a batch: its mesh with the atlas and its outline's shell. */
export function flush(kit, b, S, spec = MOB, matrix = null) {
  const I = matrix ?? new kit.T.Matrix4(), g = S.geometry(); if (g) b.add(spec, g, I);
  const sh = OUTLINE.on ? S.shell() : null; if (sh) b.add(outlineSpec(), sh, I);
}

// ---- trees, weeds, rubbish ------------------------------------------------------------------------------------------------------------
/** A dead tree: a trunk that leans and tapers, with a flare at the root, forked boughs to the twigs. `o.line`: its trunk takes the outline. */
export function tree(S, x, y0, z, seed, o = {}) {
  const r = mulberry32(seed * 37 + 3), H = (o.h ?? 3.4) + r() * 1.6, lean = [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5], R0 = 0.13 + r() * 0.05;
  const at = (k) => [x + lean[0] * k * k * H * 0.4, y0 + H * 0.62 * k, z + lean[1] * k * k * H * 0.4];
  S.tube([x, y0 - 0.03, z], at(0.1), R0 * 1.7, R0 * 1.1, 8, round('bark', 0, 0.12), false, o.line);
  S.tube(at(0.1), at(0.55), R0 * 1.1, R0 * 0.85, 8, round('bark', 0.12, 0.55), false, o.line); S.tube(at(0.55), at(1), R0 * 0.85, R0 * 0.7, 8, round('bark', 0.55, 0.8), false, o.line);
  const grow = (p, dir, len, rad, depth) => {
    const q = [p[0] + dir[0] * len, p[1] + len * (0.55 + r() * 0.5), p[2] + dir[1] * len];
    S.tube(p, q, rad, rad * 0.62, depth > 1 ? 6 : 4, round('bark', 0.6, 1, depth > 1 ? 6 : 4), false, o.line && depth > 1);
    if (depth > 0) for (let i = 0, n = depth > 1 ? 2 + (r() < 0.4 ? 1 : 0) : 2; i < n; i++) grow(q, [dir[0] + (r() - 0.5) * 1.3, dir[1] + (r() - 0.5) * 1.3], len * (0.55 + r() * 0.25), rad * 0.6, depth - 1);
  };
  for (let i = 0; i < 3; i++) { const a = r() * 6.3; grow(at(0.75 + i * 0.125), [Math.cos(a) * 0.8, Math.sin(a) * 0.8], 0.9 + r() * 0.7, R0 * 0.5, 3); }
}
/** A tuft of weeds: a few blades leaning out of one root. */
export function tuft(S, x, y, z, r, size = 1) {
  const R = rect('weed');
  for (let i = 0, n = 5 + Math.floor(r() * 4); i < n; i++) {
    const a = r() * 6.3, l = (0.12 + r() * 0.22) * size, w = 0.018 + r() * 0.02, out = 0.04 + r() * 0.1, c = Math.cos(a), s = Math.sin(a), bx = x + (r() - 0.5) * 0.08, bz = z + (r() - 0.5) * 0.08;
    const p = [[bx - s * w, y, bz + c * w], [bx + s * w, y, bz - c * w], [bx + c * out, y + l, bz + s * out]], uv = [[R[0], R[1]], [R[2], R[1]], [(R[0] + R[2]) / 2, R[3]]];
    S.tri(p[0], p[1], p[2], uv); S.tri(p[1], p[0], p[2], [uv[1], uv[0], uv[2]]);
  }
}
/** A tied bag of rubbish, slumped. */
export function bag(S, x, y, z, r, size = 1, line = false) {
  const h = (0.34 + r() * 0.16) * size, w = (0.24 + r() * 0.1) * size, lx = (r() - 0.5) * 0.08;
  S.tube([x, y, z], [x, y + h * 0.3, z], w * 0.8, w, 7, round('bag', 0, 0.3, 7), false, line); S.tube([x, y + h * 0.3, z], [x + lx, y + h * 0.75, z], w, w * 0.7, 7, round('bag', 0.3, 0.75, 7), false, line);
  S.tube([x + lx, y + h * 0.75, z], [x + lx * 2, y + h, z + lx], w * 0.7, 0.04, 7, round('bag', 0.75, 0.95, 7)); S.tube([x + lx * 2, y + h, z + lx], [x + lx * 3 + 0.03, y + h + 0.1, z], 0.03, 0.06, 5, round('bag', 0.9, 1, 5), true);
}
/** A sheet on the ground (a newspaper, a flattened box): `n` the swatch. */
export function scrap(S, x, y, z, r, n = 'paper', size = 0.3) {
  const R = rect(n), a = r() * 6.3, w = size * (0.7 + r() * 0.6), d = size * (0.5 + r() * 0.5), c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + c * u - s * v, y + (u > 0 && v > 0 ? 0.03 * r() : 0), z + s * u + c * v];
  S.poly([P(-w, -d), P(w, -d), P(w, d), P(-w, d)], [0, 1, 0], [[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]]);
}

// ---- the wires --------------------------------------------------------------------------------------------------------------------------
/**
 * The wiring of one side: on each lamp post a crossarm with insulators, three wires from post to post (they hang), and a drop from some posts
 * to the wall behind. `posts`: [[x, y, z]] the feet, in order along the street; `h`: the crossarm's height; `back`: the z of the walls.
 */
export function wiring(S, posts, h, back, r) {
  const W = flat('wire'), I = round('iron', 0, 1, 4);
  const arm = ([x, y, z]) => { S.box([x - 0.05, y + h - 0.05, z - 0.42], [x + 0.05, y + h + 0.04, z + 0.42], 0, [], { uv: fit('iron', [x - 0.05, y + h - 0.05, z - 0.42], [x + 0.05, y + h + 0.04, z + 0.42]) }); for (const o of [-0.34, 0, 0.34]) S.tube([x, y + h + 0.04, z + o], [x, y + h + 0.16, z + o], 0.03, 0.02, 5, round('concrete', 0.2, 0.8, 5)); S.tube([x, y + h - 0.5, z], [x, y + h - 0.05, z + 0.3], 0.014, 0.014, 4, I); };
  posts.forEach(arm);
  for (let i = 0; i < posts.length - 1; i++) {
    const [ax, ay, az] = posts[i], [bx, by, bz] = posts[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (const o of [-0.34, 0, 0.34]) S.wire([ax, ay + h + 0.16, az + o], [bx, by + h + 0.16, bz + o], len * (0.028 + r() * 0.02), 0.013, Math.max(6, Math.round(len / 2.4)), W);
  }
  for (const [x, y, z] of posts) if (back && r() < 0.7) { const s = Math.sign(back - z) || 1; S.wire([x, y + h + 0.1, z + s * 0.4], [x + (r() - 0.5) * 6, y + 4.6 + r() * 2.4, back], 0.3 + r() * 0.3, 0.011, 5, W); }
}

// ---- the walls of the empty lots and of the alleys ----------------------------------------------------------------------------------------
const MW = 2048, MROW = 128, MPX = 44, WALL_H = 2.8;
const SPRAY = ['196,70,52', '60,110,160', '226,190,70', '236,232,220', '40,36,40', '90,150,110'];
function paintWall(g, r, x, y, w, o) {
  const h = MROW, base = o.brick ? [156, 86, 62] : o.col, px = MPX;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = css(base); g.fillRect(x, y, w, h);
  if (o.brick) bricks(g, r, x, y, w, h, 0.23 * px, 3.4, base); else if (o.block) bricks(g, r, x, y, w, h, 0.4 * px, 8.6, [150, 148, 142], { mortar: [110, 106, 100] });
  masses(g, r, x, y, w, h, Math.round(w / 12), 46, '40,30,24', PALE, 0.28);
  if (!o.brick && !o.block) { for (let i = 0; i < w / 260; i++) { const pw = 60 + r() * 160; g.fillStyle = css(mixc(base, r() < 0.5 ? [220, 210, 190] : scale(base, 0.62), 0.4), 0.75); g.fillRect(x + r() * (w - pw), y + h * (0.2 + r() * 0.3), pw, h * (0.3 + r() * 0.3)); } for (let i = 0; i < w / 70; i++) chip(g, r, x + r() * w, y + r() * h, 7 + r() * 18, 6 + r() * 14, (gg, cx, cy, rx, ry) => bricks(gg, r, cx - rx, cy - ry, rx * 2, ry * 2, 0.23 * px, 3.4, [164, 94, 68])); }
  drips(g, r, x, x + w, y + 5, h * 0.8, '40,32,26', 0.45, 11);
  for (let i = 0; i < w / 110; i++) crack(g, r, x + r() * w, y + r() * h * 0.5, 30 + r() * 70, Math.PI / 2 + (r() - 0.5) * 1.2, 1.1, 0.7);
  const gr = g.createLinearGradient(0, y + h * 0.62, 0, y + h); gr.addColorStop(0, 'rgba(46,36,26,0)'); gr.addColorStop(1, 'rgba(30,24,18,0.7)'); g.fillStyle = gr; g.fillRect(x, y + h * 0.62, w, h * 0.38);
  for (let i = 0; i < w / 60; i++) blob(g, x + r() * w, y + h - r() * 8, 6 + r() * 14, 4 + r() * 8, r() < 0.4 ? '52,70,44' : '30,24,18', 0.45);
  // the street's hand: spray shapes (never a letter), a band painted over them, rows of torn posters
  for (let i = 0; i < w / 90; i++) scribble(g, r, x + r() * (w - 60), y + h * (0.3 + r() * 0.4), 26 + r() * 44, SPRAY[Math.floor(r() * SPRAY.length)], 0.82);
  for (let i = 0; i < w / 420; i++) { const bw = 80 + r() * 140; g.fillStyle = css(mixc(base, [200, 196, 184], 0.6), 0.8); g.fillRect(x + r() * (w - bw), y + h * (0.34 + r() * 0.2), bw, h * (0.22 + r() * 0.14)); }
  for (let i = 0; i < w / 300; i++) { const px0 = x + r() * (w - 120), n = 2 + Math.floor(r() * 4), pw = 0.5 * px, ph = 0.7 * px; for (let k = 0; k < n; k++) poster(g, r, px0 + k * pw * 1.06, y + h * 0.3 + (r() - 0.5) * 5, pw, ph, [[214, 204, 180], [[178, 70, 52], [64, 104, 150], [204, 160, 64], [78, 124, 88]][Math.floor(r() * 4)], [40, 36, 40]]); }
  g.save(); g.lineCap = 'round'; for (let i = 0; i < w / 40; i++) { const wx = x + r() * w; for (let k = 0; k < 6; k++) { g.strokeStyle = css(r() < 0.5 ? [90, 108, 60] : [58, 74, 44], 0.85); g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(wx, y + h); g.lineTo(wx + (r() - 0.5) * 9, y + h - 3 - r() * 9); g.stroke(); } } g.restore();
  // the plinth and the band under the coping (the coping and the pilasters are modelled: their shade is painted here)
  g.fillStyle = `rgba(${INK},0.45)`; g.fillRect(x, y, w, 5); g.fillStyle = `rgba(${INK},0.18)`; g.fillRect(x, y + 5, w, 5);
  for (const gt of o.gates ?? []) {                                  // a gate of sheet iron in two leaves, chained
    const gx = x + gt.at * px, gw = gt.w * px, c = [96, 110, 104];
    part(g, r, gx, y + 8, gw, h - 8, c, { top: 0.5, under: 0.5 }); for (let k = gx + 5; k < gx + gw; k += 7) { g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(k, y + 8, 1.2, h - 8); g.fillStyle = `rgba(${PALE},0.22)`; g.fillRect(k + 1.2, y + 8, 1, h - 8); }
    for (const by of [0.22, 0.78]) { g.fillStyle = css(scale(c, 0.6)); g.fillRect(gx, y + h * by, gw, 4); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(gx, y + h * by, gw, 1); }
    g.fillStyle = `rgba(${INK},0.9)`; g.fillRect(gx + gw / 2 - 0.8, y + 8, 1.6, h - 8);
    for (let i = 0; i < 14; i++) blob(g, gx + r() * gw, y + h - r() * h * 0.3, 5 + r() * 12, 4 + r() * 10, '140,74,36', 0.6); for (let i = 0; i < 6; i++) drip(g, r, gx + r() * gw, y + 10 + r() * 30, 30 + r() * 50, 2.4, '110,60,30', 0.5);
    scribble(g, r, gx + gw * 0.15, y + h * 0.5, gw * 0.5, SPRAY[Math.floor(r() * SPRAY.length)], 0.8);
    g.strokeStyle = 'rgb(170,170,176)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(gx + gw / 2 - 8, y + h * 0.5); g.quadraticCurveTo(gx + gw / 2, y + h * 0.5 + 9, gx + gw / 2 + 8, y + h * 0.5); g.stroke();
    inkRect(g, gx, y + 8, gw, h - 8, 0.85, 1.4, 0);
  }
  g.restore();
  finish(g, r, x, y, w, h, { a: 0.09 });
}
const WALL_COLS = [[198, 160, 104], [126, 146, 172], [206, 194, 160], [188, 128, 106], [150, 172, 152]];
/**
 * The walls of the street: `list` of { x0, x1, z, face (+1: its face looks to +z, -1 to -z), seed, gates: [{ at (metres from x0), w }], kind }.
 * One painting for all of them (`rua:muro`), a row of pilasters with chamfers, a plinth and a coping; the outline on what is near the walker.
 */
export function lotWalls(kit, b, list, y0 = 0.15) {
  const T = kit.T, S = new Shape(T), [c, g] = kit.has('rua:muro') ? [null, null] : canvas(MW, MROW * 4);
  if (g) { g.fillStyle = 'rgb(40,34,30)'; g.fillRect(0, 0, MW, MROW * 4); }
  let cx = 0, row = 0;
  for (const w of list) {
    const r = mulberry32((w.seed ?? 1) * 613 + 7), len = w.x1 - w.x0, f = w.face, z = w.z, kind = w.kind ?? (r() < 0.35 ? 'brick' : r() < 0.3 ? 'block' : 'render');
    const o = { brick: kind === 'brick', block: kind === 'block', col: WALL_COLS[Math.floor(r() * WALL_COLS.length)], gates: w.gates };
    let done = 0;
    while (done < len - 1e-6) {
      if (cx >= MW - 8) { cx = 0; row++; }
      const seg = Math.min(len - done, (MW - cx) / MPX), pw = Math.round(seg * MPX), ya = row * MROW;
      if (g && row < 4) paintWall(g, r, cx, ya, pw, { ...o, gates: (o.gates ?? []).filter((q) => q.at >= done && q.at + q.w <= done + seg + 1e-6).map((q) => ({ ...q, at: f > 0 ? q.at - done : seg - (q.at - done) - q.w })) });
      const xa = w.x0 + done, xb = xa + seg, u0 = (cx + 1) / MW, u1 = (cx + pw - 1) / MW, v0 = 1 - (ya + MROW - 1) / (MROW * 4), v1 = 1 - (ya + 1) / (MROW * 4);
      const uv = (x, y) => [u0 + (u1 - u0) * Math.max(0, Math.min(1, f > 0 ? (x - xa) / seg : (xb - x) / seg)), v0 + (v1 - v0) * Math.max(0, Math.min(1, (y - y0 + 0.15) / (WALL_H + 0.15)))];
      const old = S.map(uv), n = Math.max(1, Math.round(seg / 3));
      // the face (two sides: the back is seen over the wall from the far pavement), a plinth, pilasters, the coping
      S.sheet(f > 0 ? [xa, y0 - 0.15, z] : [xb, y0 - 0.15, z], [f > 0 ? seg : -seg, 0, 0], [0, WALL_H + 0.15, 0], 3.1, null);
      S.sheet(f > 0 ? [xb, y0 - 0.15, z - 0.22] : [xa, y0 - 0.15, z + 0.22], [f > 0 ? -seg : seg, 0, 0], [0, WALL_H + 0.15, 0], 6, null);
      const zl = f > 0 ? [z, z + 0.07] : [z - 0.07, z], sk = [f > 0 ? '-z' : '+z', '-y'];
      S.box([xa, y0 - 0.15, zl[0]], [xb, y0 + 0.42, zl[1]], 0.03, [...sk, '-x', '+x'], { outline: w.line });
      for (let i = 0; i <= n; i++) { const px = xa + (seg * i) / n; if ((o.gates ?? []).some((q) => px > w.x0 + q.at - 0.1 && px < w.x0 + q.at + q.w + 0.1)) continue; S.box([Math.max(xa, px - 0.2), y0 + 0.42, f > 0 ? z : z - 0.1], [Math.min(xb, px + 0.2), y0 + WALL_H, f > 0 ? z + 0.1 : z], 0.03, [f > 0 ? '-z' : '+z', '-y', '+y'], { outline: w.line }); }
      S.box([xa, y0 + WALL_H - 0.02, Math.min(z + f * 0.13, z - f * 0.26)], [xb, y0 + WALL_H + 0.1, Math.max(z + f * 0.13, z - f * 0.26)], 0.03, ['-x', '+x'], { outline: w.line });
      S.map(old);
      done += seg; cx += pw + 4;
    }
  }
  if (g) { punch(g, 0.42); kit.setTexture('rua:muro', textureOf(T, c)); }
  flush(kit, b, S, { c: '#9298ac', map: 'rua:muro', emissive: 0.25 });
}

// ---- the entities of the street, remade ---------------------------------------------------------------------------------------------------
const make = (kit, fill) => { installMob(kit); const b = new kit.Batch(), S = new Shape(kit.T), x = fill(S, b) ?? {}; flush(kit, b, S); const root = new kit.T.Group(); root.add(b.build()); return { root, ...x }; };
/** A post: a concrete foot, a flange with its bolts, the tapered tube. */
function post(S, h, r0 = 0.085, r1 = 0.06, line = true) {
  S.box([-0.2, 0, -0.2], [0.2, 0.1, 0.2], 0.03, ['-y'], { uv: fit('concrete', [-0.2, 0, -0.2], [0.2, 0.1, 0.2]), outline: line });
  S.tube([0, 0.1, 0], [0, 0.14, 0], r0 * 1.9, r0 * 1.9, 8, round('iron', 0, 1), true);
  S.tube([0, 0.14, 0], [0, h * 0.5, 0], r0, (r0 + r1) / 2, 8, round('pole', 0, 0.5), false, line); S.tube([0, h * 0.5, 0], [0, h, 0], (r0 + r1) / 2, r1, 8, round('pole', 0.5, 1), true, line);
}
/** A signal head at (x, y, z) facing +z: the housing with its chamfers, three hoods, the lit lens apart (`b`: the batch, `on`: 0..2 or -1). */
function signalHead(S, b, x, y, z, on) {
  const lo = [x - 0.17, y, z - 0.14], hi = [x + 0.17, y + 0.95, z + 0.14], H = rect('housing');
  S.box(lo, hi, 0.035, [], { outline: true, uv: (px, py, pz) => (pz > z + 0.13 ? [H[0] + (H[2] - H[0]) * ((px - lo[0]) / 0.34), H[1] + (H[3] - H[1]) * ((py - y) / 0.95)] : [H[0] + (H[2] - H[0]) * 0.04, H[1] + (H[3] - H[1]) * ((py - y) / 0.95)]) });
  for (let i = 0; i < 3; i++) {
    const cy = y + 0.95 * (1 - (0.19 + i * 0.31)), old = S.map(flat('housing', 0.05, 0.5));
    S.box([x - 0.14, cy + 0.1, z + 0.14], [x + 0.14, cy + 0.125, z + 0.34], 0, ['-z']); S.box([x - 0.14, cy - 0.02, z + 0.14], [x - 0.12, cy + 0.1, z + 0.3], 0, ['-z', '+y']); S.box([x + 0.12, cy - 0.02, z + 0.14], [x + 0.14, cy + 0.1, z + 0.3], 0, ['-z', '+y']);
    S.map(old);
    if (i === on) b.cyl({ c: ['#e0452e', '#f0b040', '#58d080'][i], emissive: 1, fogged: 0.6 }, 0.095, 0.095, 0.02, 10, [x, cy, z + 0.152], { rx: Math.PI / 2 });
  }
}
/**
 * The things themselves, drawn into a Shape at its place (`S.at`): DRAW.semaforo(S, b, p) ... `b`: the batch for what is not of the atlas
 * (a lit lens, a pictogram), or null for a dead thing of the scenery.
 */
export const DRAW = {
  semaforo(S, b, p) {
    post(S, 4.4);
    // the arm over the road with its brace, the head hanging at its end, a walker's lamp and its button on the post
    S.tube([0, 4.15, 0], [0, 4.3, 2.3], 0.05, 0.04, 6, round('pole', 0.3, 0.6, 6), true, true); S.tube([0, 3.5, 0], [0, 4.2, 1.1], 0.022, 0.022, 4, round('iron', 0, 1, 4));
    S.tube([0, 4.26, 2.0], [0, 4.14, 2.0], 0.03, 0.03, 5, round('iron', 0, 1, 5));
    signalHead(S, b, 0, 3.2, 2.0, b ? p.cor : -1);
    S.box([-0.13, 2.25, 0.07], [0.13, 2.75, 0.25], 0.03, [], { outline: true, uv: flat('housing', 0.05, 0.5) }); if (b) b.cyl({ c: '#b8552e', emissive: 0.5, fogged: 0.6 }, 0.07, 0.07, 0.02, 8, [0, 2.6, 0.257], { rx: Math.PI / 2 });
    S.box([-0.06, 1.15, 0.07], [0.06, 1.35, 0.15], 0.02, [], { uv: flat('yellow', 0.4, 0.5) });
  },
  /** A sign post; the pictogram is put by the caller (it is another material). */
  placa(S, b, p) {
    const h = p.altura; post(S, h + 0.1, 0.045, 0.04);
    const lo = [-0.32, h - 0.62, 0.045], hi = [0.32, h + 0.02, 0.075];
    S.box(lo, hi, 0.012, [], { outline: true, uv: fit('signback', lo, hi) });
    for (const yy of [h - 0.45, h - 0.15]) S.box([-0.09, yy - 0.025, -0.05], [0.09, yy + 0.025, 0.05], 0, [], { uv: flat('iron', 0.3, 0.5) });
    if (b) b.plane({ c: '#ffffff', map: 'p:' + p.picto, emissive: 0.22 }, 0.58, 0.58, [0, h - 0.59, 0.079], { full: true });
  },
  hidrante(S) {
    const U = (a, c2) => round('hydrant', a, c2);
    S.tube([0, 0, 0], [0, 0.06, 0], 0.17, 0.17, 8, U(0, 0.08), true, true); S.tube([0, 0.06, 0], [0, 0.52, 0], 0.125, 0.11, 8, U(0.08, 0.68), false, true);
    S.tube([0, 0.52, 0], [0, 0.57, 0], 0.15, 0.15, 8, U(0.68, 0.74), true, true); S.tube([0, 0.57, 0], [0, 0.7, 0], 0.12, 0.07, 8, U(0.74, 0.92), false, true); S.tube([0, 0.7, 0], [0, 0.77, 0], 0.035, 0.035, 6, U(0.92, 1), true);
    for (const s of [-1, 1]) { S.tube([0, 0.4, 0], [s * 0.2, 0.4, 0], 0.06, 0.06, 7, round('hydrant', 0.4, 0.6, 7), false, true); S.tube([s * 0.2, 0.4, 0], [s * 0.235, 0.4, 0], 0.075, 0.075, 7, round('hydrant', 0.2, 0.3, 7), true); }
    S.tube([0, 0.36, 0], [0, 0.36, 0.2], 0.075, 0.075, 7, round('hydrant', 0.4, 0.6, 7), false, true); S.tube([0, 0.36, 0.2], [0, 0.36, 0.24], 0.09, 0.09, 7, round('hydrant', 0.2, 0.3, 7), true);
  },
  cone(S) {
    S.box([-0.2, 0, -0.2], [0.2, 0.035, 0.2], 0.012, ['-y'], { uv: flat('cone', 0.5, 0.06), outline: true });
    S.tube([0, 0.035, 0], [0, 0.72, 0], 0.16, 0.035, 8, round('cone', 0.1, 1), true, true);
  },
  barreira(S, b, p) {
    const L = p.comprimento, lo = [-L / 2, 0.66, -0.03], hi = [L / 2, 0.98, 0.03], B = rect('barrier');
    S.box(lo, hi, 0.015, [], { outline: true, uv: (x, y) => [B[0] + (B[2] - B[0]) * ((x + L / 2) / L), B[1] + (B[3] - B[1]) * ((y - 0.66) / 0.32)] });
    for (const s of [-1, 1]) for (const d of [-1, 1]) S.tube([s * (L / 2 - 0.12), 0.9, 0], [s * (L / 2 - 0.12), 0, d * 0.26], 0.022, 0.022, 5, round('iron', 0, 1, 5), true, true);
    for (const s of [-1, 1]) S.box([s * (L / 2 - 0.12) - 0.02, 0.3, -0.1], [s * (L / 2 - 0.12) + 0.02, 0.33, 0.1], 0, [], { uv: flat('iron', 0.3, 0.5) });
  },
  /** The solar panels, where they always were (the same places, the same slope): each in its frame on two legs with a brace, a junction box, its lead. */
  painelSolar(S, b, p) {
    const w = 1.6, h = 1.0, tilt = 0.5, cs = Math.cos(tilt), sn = Math.sin(tilt), R = rect(p.sujo ? 'panelDirty' : 'panel');
    for (let i = 0; i < p.colunas; i++) for (let j = 0; j < p.fileiras; j++) {
      const x = (i - (p.colunas - 1) / 2) * (w + 0.06), z = j * (h * cs + 0.2), yc = 0.975, P = (u, v, t = 0) => [x + u, yc + v * sn + t * cs, z + v * cs - t * sn];
      const q = (t) => [P(-w / 2, h / 2, t), P(w / 2, h / 2, t), P(w / 2, -h / 2, t), P(-w / 2, -h / 2, t)], top = q(0.025), bot = q(-0.025);
      S.poly(top, [0, 1, 0], [[R[0], R[3]], [R[2], R[3]], [R[2], R[1]], [R[0], R[1]]]);
      const old = S.map(flat('iron', 0.6, 0.2)); S.poly(bot, [0, -1, 0]);
      for (let k = 0; k < 4; k++) S.poly([top[k], top[(k + 1) % 4], bot[(k + 1) % 4], bot[k]], [k === 1 ? 1 : k === 3 ? -1 : 0, 0.1, k === 0 ? 1 : k === 2 ? -1 : 0]);
      S.map(old);
      const I4 = round('pole', 0.1, 0.4, 5), hi = yc + 0.342 * sn - 0.04, lw = yc - 0.342 * sn - 0.04;
      S.tube([x - 0.6, 0, z + 0.3], [x - 0.6, hi, z + 0.3], 0.028, 0.028, 5, I4, false, true); S.tube([x + 0.6, 0, z - 0.3], [x + 0.6, lw, z - 0.3], 0.028, 0.028, 5, I4, false, true);
      S.tube([x + 0.6, 0, z + 0.3], [x + 0.6, hi, z + 0.3], 0.028, 0.028, 5, I4, false, true); S.tube([x - 0.6, 0, z - 0.3], [x - 0.6, lw, z - 0.3], 0.028, 0.028, 5, I4, false, true);
      S.tube([x - 0.6, 0.12, z + 0.3], [x - 0.6, lw - 0.06, z - 0.3], 0.016, 0.016, 4, I4); S.tube([x + 0.6, 0.12, z + 0.3], [x + 0.6, lw - 0.06, z - 0.3], 0.016, 0.016, 4, I4);
      S.box([x - 0.12, yc - 0.17, z - 0.06], [x + 0.12, yc - 0.07, z + 0.06], 0.012, [], { uv: flat('housing', 0.05, 0.5) });
      S.wire([x, yc - 0.17, z], [x - 0.5, 0.04, z + 0.42], 0.1, 0.014, 4, flat('wire'));
    }
  },
  /** A cabinet of the street's services against a wall. */
  armario(S) { const lo = [-0.45, 0, -0.2], hi = [0.45, 1.3, 0.2], C = rect('cabinet'); S.box([-0.5, 0, -0.24], [0.5, 0.08, 0.24], 0.02, ['-y'], { uv: fit('concrete', lo, hi) }); S.box([lo[0], 0.08, lo[2]], hi, 0.03, ['-y'], { outline: true, uv: (x, y, z) => (z > 0.19 ? [C[0] + (C[2] - C[0]) * ((x + 0.45) / 0.9), C[1] + (C[3] - C[1]) * ((y - 0.08) / 1.22)] : [C[0] + (C[2] - C[0]) * 0.02, C[1] + (C[3] - C[1]) * ((y - 0.08) / 1.22)]) }); },
};
export const FURNITURE = {
  semaforo: (kit, p) => make(kit, (S, b) => { DRAW.semaforo(S, b, p); return { collider: { w: 0.3, d: 0.3 } }; }),
  placa: (kit, p) => make(kit, (S, b) => { DRAW.placa(S, b, p); return { collider: { w: 0.2, d: 0.2 } }; }),
  hidrante: (kit) => make(kit, (S) => { DRAW.hidrante(S); return { collider: { w: 0.3, d: 0.3 } }; }),
  cone: (kit) => make(kit, (S) => { DRAW.cone(S); return { collider: { w: 0.4, d: 0.4 } }; }),
  barreira: (kit, p) => make(kit, (S, b) => { DRAW.barreira(S, b, p); return { collider: { w: p.comprimento, d: 0.5 } }; }),
  painelSolar: (kit, p) => ({ ...make(kit, (S, b) => { DRAW.painelSolar(S, b, p); return { collider: { w: p.colunas * 1.66, d: p.fileiras * 1.1 } }; }), dynamic: true }),
};
