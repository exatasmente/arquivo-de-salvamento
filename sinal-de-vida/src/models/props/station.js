// The painted shell of the unfinished station: the floor, the four walls and the vault each get ONE painted picture of their own (not a tiling
// texture), laid out in metres, with the light of the lamps and the shadow of the objects painted into it (the baked light): a warm island
// under each lamp, a cold dark at the foot of the walls and under every object, the form boards of the raw concrete, the tie holes, the seepage
// of the groundwater, rust drips, spalls with rebar, spray-painted marks (no letters), puddles with their sheen, the gravel of the track bed.
// Everything is from a seed; no Math.random. The engine's own lights (the 8 lamps) add to this at run time.
// The hand is the one that painted Jonas and the props (tools/props/paint.py): strong values (`punch`), broad strokes of the brush, every
// joint a dark brown line (INK, the colour of the outline) with a lip of light beside it, the worn edge pale, the dirt run down, and
// the shadow painted where two surfaces meet. The shell has no outline of geometry (it is seen from inside: a shell would not show);
// its outline is painted: a dark line along the foot and the top of every wall, round the floor and beside each rib of the vault.
import { mulberry32 } from '../../../vendor/engine/rng.js';

const rgba = (c, a) => `rgba(${c},${a})`;
function washes(g, r, W, H, n, r0, r1, col, a0, a1 = a0, sy = 1) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, rad = r0 + r() * (r1 - r0), a = a0 + r() * (a1 - a0);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.save(); g.translate(x, y); g.scale(1, sy); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
  }
}
/** A vertical drip/streak: dark at the top, fading down, a rounded tip. */
function streak(g, x, y, len, w, col, a) {
  const gr = g.createLinearGradient(x, y, x, y + len); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.75, rgba(col, a * 0.6)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(x - w / 2, y, w, len); g.fillStyle = rgba(col, a * 0.5); g.beginPath(); g.arc(x, y + len * 0.8, w * 0.7, 0, 7); g.fill();
}
function island(g, x, y, rad, col, a, mode = 'screen', sy = 1) {
  g.save(); g.globalCompositeOperation = mode; g.translate(x, y); g.scale(1, sy);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.45, rgba(col, a * 0.45)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore();
}
function softBox(g, x0, y0, x1, y1, blur, a) {   // a soft shadow of a rectangle (the shadowBlur trick: the shape is drawn far away and only its shadow lands here)
  g.save(); g.shadowColor = `rgba(8,10,18,${a})`; g.shadowBlur = blur; g.shadowOffsetX = 9000; g.fillStyle = '#000'; g.fillRect(x0 - 9000, y0, x1 - x0, y1 - y0); g.restore();
}
function brush(g, r, W, H, n, len, col, a, thick = 1) {   // short directional strokes, the hand of the painter
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, an = (r() - 0.5) * 0.8 + (r() < 0.3 ? 1.57 : 0), l = len * (0.4 + r());
    g.strokeStyle = rgba(r() < 0.5 ? col[0] : col[1], a * (0.4 + r() * 0.6)); g.lineWidth = thick * (0.6 + r());
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
  }
}
/** The exposure of a picture: a cool dark multiply, before the baked light is added (the night is the base, the lamps are the islands). */
const expose = (g, W, H, c) => { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${c})`; g.fillRect(0, 0, W, H); g.restore(); };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const INK = '33,20,13';
/** Stronger values: the picture laid over itself (an S curve), `a` of it. */
const punch = (g, W, H, a = 0.6) => { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.drawImage(g.canvas, 0, 0); g.restore(); };
/** Broad strokes of a flat brush: long, wide, soft-ended, mostly along `dir` (radians), in a dark and a light of the surface. */
function strokes(g, r, W, H, n, len, wide, cols, a, dir = 0) {
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, an = dir + (r() - 0.5) * 0.5, l = len * (0.5 + r());
    g.strokeStyle = rgba(cols[Math.floor(r() * cols.length)], a * (0.35 + r() * 0.65)); g.lineWidth = wide * (0.5 + r());
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * l * 0.5 + (r() - 0.5) * wide * 2, y + Math.sin(an) * l * 0.5 + (r() - 0.5) * wide * 2, x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
  }
  g.restore();
}
/** A joint as it is drawn everywhere: a dark brown line and, on the side the light comes from, a thin pale lip. */
function joint(g, x0, y0, x1, y1, w = 2.6, a = 0.8, lip = 0.3) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  g.save(); g.lineCap = 'butt';
  g.strokeStyle = rgba(INK, a); g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  if (lip > 0) { g.strokeStyle = rgba('255,246,226', lip); g.lineWidth = Math.max(1, w * 0.5); g.beginPath(); g.moveTo(x0 + nx * w * 0.8, y0 + ny * w * 0.8); g.lineTo(x1 + nx * w * 0.8, y1 + ny * w * 0.8); g.stroke(); }
  g.restore();
}
/** The painted outline along a border of a picture: a dark brown band that fades inward (`side`: 'top' | 'bottom' | 'left' | 'right'). */
function contour(g, W, H, side, w, a = 0.85) {
  const v = side === 'top' || side === 'bottom', gr = v ? g.createLinearGradient(0, side === 'top' ? 0 : H, 0, side === 'top' ? w : H - w) : g.createLinearGradient(side === 'left' ? 0 : W, 0, side === 'left' ? w : W - w, 0);
  gr.addColorStop(0, rgba(INK, a)); gr.addColorStop(0.35, rgba(INK, a * 0.75)); gr.addColorStop(1, rgba(INK, 0));
  g.fillStyle = gr;
  if (v) g.fillRect(0, side === 'top' ? 0 : H - w, W, w); else g.fillRect(side === 'left' ? 0 : W - w, 0, w, H);
}

/** The floor: x from -BX-0.5 to BX+0.5, z from -BZ-0.5 to BZ+0.5, `ppm` pixels per metre. */
export function paintFloor(o) {
  const { BX, BZ, ppm, lamps, boxes, puddles, bed, seed } = o, W = Math.round((BX * 2 + 1) * ppm), H = Math.round((BZ * 2 + 1) * ppm), r = mulberry32(seed), cv = canvas(W, H), g = cv.getContext('2d');
  const X = (x) => (x + BX + 0.5) * ppm, Z = (z) => (z + BZ + 0.5) * ppm;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#8e8b82'); gr.addColorStop(1, '#9a978c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  washes(g, r, W, H, 70, 40, 240, '60,58,52', 0.18, 0.34); washes(g, r, W, H, 40, 40, 200, '236,230,212', 0.14, 0.28);
  brush(g, r, W, H, 2600, 26, ['70,68,60', '230,224,206'], 0.09, 1.2);
  strokes(g, r, W, H, 900, 90, 9, ['58,54,46', '238,230,208', '120,104,78'], 0.11, 0.2);
  washes(g, r, W, H, 16, 80, 260, '150,116,70', 0.08, 0.16); washes(g, r, W, H, 16, 80, 260, '70,104,108', 0.08, 0.16);   // warm and cool drifts of the slab
  // pours and saw cuts: the slab is poured in panels, the cuts are dark with a light lip
  for (let x = -BX + 3.6; x < BX; x += 3.6) { joint(g, X(x), 0, X(x), H, 3.4, 0.8, 0.34); for (let k = 0; k < 14; k++) { const y = r() * H; g.fillStyle = rgba(INK, 0.5); g.beginPath(); g.ellipse(X(x) + (r() - 0.5) * 3, y, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); g.fill(); } }   // the cuts, with their chipped lips
  joint(g, 0, Z(0), W, Z(0), 3, 0.7, 0.3);
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,58,52,0.35)' : 'rgba(240,234,216,0.3)'; g.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let i = 0; i < 9; i++) {   // cracks
    let x = r() * W, y = r() * H; g.strokeStyle = rgba(INK, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += (r() - 0.4) * 40; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke();
  }
  for (let i = 0; i < 14; i++) washes(g, r, W, H, 1, 14, 46, i % 3 ? '30,28,26' : '150,120,60', 0.22, 0.4, 0.6);                    // oil and spilled paint
  for (let i = 0; i < 10; i++) washes(g, r, W, H, 1, 10, 30, '236,232,220', 0.4, 0.55, 0.7);                                     // mortar splashes
  for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * H; g.fillStyle = r() < 0.5 ? 'rgba(220,150,40,0.6)' : 'rgba(200,70,40,0.5)'; g.beginPath(); g.ellipse(x, y, 6 + r() * 12, 4 + r() * 8, r() * 3, 0, 7); g.fill(); }   // paint spills (a worker's colours)
  // the track bed at the mouth of the tunnel: dark gravel, then the platform edge with its worn safety line
  if (bed) {
    const x0 = X(bed.x0), x1 = X(bed.x1), z0 = Z(bed.z0), z1 = Z(BZ + 0.5);
    g.fillStyle = '#4a4742'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
    for (let i = 0; i < 4200; i++) { const x = x0 + r() * (x1 - x0), y = z0 + r() * (z1 - z0), s = 1.5 + r() * 2.6; g.fillStyle = ['#6a665e', '#38362f', '#827c70', '#524e46'][Math.floor(r() * 4)]; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(226,186,40,0.95)'; g.fillRect(x0, z0 - ppm * 0.14, x1 - x0, ppm * 0.1);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(150,146,134,0.7)'; g.fillRect(x0 + r() * (x1 - x0), z0 - ppm * 0.16, 2 + r() * 10, ppm * 0.14); }   // the line is worn
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,28,26,0.4)'; g.fillRect(x0 - 4 + r() * 8, z0, 3, z1 - z0); }
  }
  // puddles: dark water with a sheen on the lit side and a ring where it drips
  for (const p of puddles) {
    const x = X(p.x), y = Z(p.z), rx = p.rx * ppm, rz = p.rz * ppm;
    g.save(); g.translate(x, y); g.rotate(p.a ?? 0);
    const pg = g.createRadialGradient(-rx * 0.2, -rz * 0.2, 0, 0, 0, rx); pg.addColorStop(0, 'rgba(70,96,112,0.8)'); pg.addColorStop(0.7, 'rgba(26,44,56,0.85)'); pg.addColorStop(1, 'rgba(20,30,38,0.5)');
    g.fillStyle = pg; g.beginPath(); g.ellipse(0, 0, rx, rz, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(190,205,215,0.28)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(-rx * 0.1, -rz * 0.08, rx * 0.8, rz * 0.7, 0, 3.3, 5.2); g.stroke();
    g.strokeStyle = 'rgba(14,20,26,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, rx, rz, 0, 0, 7); g.stroke();
    g.restore();
  }
  punch(g, W, H, 0.65);
  expose(g, W, H, '92,104,134');
  // the baked shadow: the foot of the walls, then every object
  g.save(); g.globalCompositeOperation = 'multiply';
  const edge = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => { const e = g.createLinearGradient(gx0, gy0, gx1, gy1); e.addColorStop(0, 'rgba(70,72,88,1)'); e.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = e; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const m = 1.0 * ppm; edge(0, 0, W, m, 0, 0, 0, m); edge(0, H - m, W, H, 0, H, 0, H - m); edge(0, 0, m, H, 0, 0, m, 0); edge(W - m, 0, W, H, W, 0, W - m, 0);
  g.restore();
  for (const b of boxes) { softBox(g, X(b.min[0]) - 4, Z(b.min[1]) - 4, X(b.max[0]) + 4, Z(b.max[1]) + 4, 0.28 * ppm, 0.55); softBox(g, X(b.min[0]), Z(b.min[1]), X(b.max[0]), Z(b.max[1]), 0.07 * ppm, 0.6); }   // (the second: the tight dark where the thing touches the floor)
  for (const sd of ['top', 'bottom', 'left', 'right']) contour(g, W, H, sd, 0.2 * ppm, 0.8);   // the outline where the floor meets the walls
  // the light of the lamps: a warm island with a lighter heart (the light falls straight down; the lamps are over their own spot)
  for (const l of lamps) { const rad = Math.min(8, l.range) * ppm * 0.5; island(g, X(l.x), Z(l.z), rad, l.color, 0.27, 'screen'); island(g, X(l.x), Z(l.z), rad * 0.4, '255,226,170', 0.13, 'screen'); }
  return cv;
}

/**
 * A wall seen from inside: `len` metres along `s` (world x for the long walls, z for the ends), `H` high. lamps: [{ s, d, y, range, color }] with d the
 * distance of the lamp to this wall. `hole`: [s0, s1, h] an opening drawn black. Returns the canvas.
 */
export function paintWall(o) {
  const { len, H, ppm, lamps, seed, hole, marks = true } = o, W = Math.round(len * ppm), Ht = Math.round(H * ppm), r = mulberry32(seed), cv = canvas(W, Ht), g = cv.getContext('2d');
  const S = (s) => (s + len / 2) * ppm, Y = (y) => (H - y) * ppm;
  // board-formed concrete: boards of 0.3 m, each its own tone, the joint lines, the imprint of the grain
  const bh = 0.3 * ppm, rows = Math.ceil(Ht / bh);
  for (let i = 0; i < rows; i++) {
    const k = 0.84 + r() * 0.24; g.fillStyle = `rgb(${178 * k},${172 * k},${156 * k})`; g.fillRect(0, i * bh, W, bh + 1);
    let x = -r() * 2.4 * ppm; while (x < W) { const wd = (1.2 + r() * 1.8) * ppm; g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '60,54,46'},${0.05 + r() * 0.13})`; g.fillRect(x, i * bh, wd, bh); g.fillStyle = 'rgba(54,50,44,0.5)'; g.fillRect(x, i * bh, 1.4, bh); x += wd; }
    // the line between two boards is not ruled: it comes and goes (a ruled grid read as tiles), with the fin of grout pale under it here and there
    for (let x2 = 0; x2 < W;) { const run = (0.25 + r() * 1.3) * ppm, a2 = r() < 0.22 ? 0 : 0.2 + r() * 0.42; g.fillStyle = rgba(INK, a2); g.fillRect(x2, i * bh, run, 1.4 + r() * 1.2); if (r() < 0.4) { g.fillStyle = 'rgba(255,250,236,0.3)'; g.fillRect(x2, i * bh + 2.2, run, 1.3); } x2 += run; }
  }
  brush(g, r, W, Ht, 1500, 22, ['70,66,58', '235,228,210'], 0.08, 1.2);
  strokes(g, r, W, Ht, Math.round(len * 30), 84, 10, ['58,54,46', '240,232,212', '126,108,80'], 0.15, 0.05);
  strokes(g, r, W, Ht, Math.round(len * 5), 150, 26, ['44,52,48', '226,220,200'], 0.1, 1.45);                                        // the large masses: damp that came down, a pale dry patch
  washes(g, r, W, Ht, 10, 60, 200, '156,118,70', 0.08, 0.16); washes(g, r, W, Ht, 10, 60, 200, '66,100,104', 0.08, 0.16);
  for (let x = 2.4 + r(); x < len; x += 2.4 + (r() - 0.5) * 1.2) { const px = S(x - len / 2); let y = 0; while (y < Ht) { const run = (0.2 + r() * 0.7) * ppm; if (r() > 0.25) joint(g, px + (r() - 0.5) * 2, y, px + (r() - 0.5) * 2, Math.min(Ht, y + run), 2.2 + r() * 1.4, 0.6, 0.26); y += run; } }   // the lifts of the pour: a joint about every 2.4 m, broken
  washes(g, r, W, Ht, Math.round(len * 0.5), 70, 230, '40,56,52', 0.16, 0.3, 1.5); washes(g, r, W, Ht, Math.round(len * 0.3), 60, 160, '236,228,206', 0.12, 0.22);
  washes(g, r, W, Ht, 40, 30, 180, '90,92,82', 0.1, 0.2); washes(g, r, W, Ht, 24, 30, 160, '236,230,214', 0.1, 0.18);
  // tie holes of the formwork, every 1.2 m in two rows, with a rust drip under each
  for (let x = 0.6; x < len; x += 1.2) for (const y of [0.55, 1.75]) {
    const px = S(x - len / 2) , py = Y(y);
    g.fillStyle = 'rgba(40,36,32,0.9)'; g.beginPath(); g.arc(px, py, 3.2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,248,230,0.5)'; g.beginPath(); g.arc(px - 1, py - 1, 1.2, 0, 7); g.fill();
    if (r() < 0.6) streak(g, px, py + 3, (0.2 + r() * 0.7) * ppm, 3 + r() * 3, '134,72,34', 0.5);
  }
  // groundwater: seepage from the top, wet and dark at the foot; white salts where it dries
  for (let i = 0; i < Math.round(len * 1.1); i++) { const x = r() * W, l = (0.5 + r() * 1.8) * ppm; streak(g, x, 0, l, 5 + r() * 16, r() < 0.7 ? '44,66,58' : '40,50,60', 0.2 + r() * 0.22); if (r() < 0.45) streak(g, x + 6, 0, l * 0.5, 2.5, '240,238,226', 0.35); }
  const wet = g.createLinearGradient(0, Ht, 0, Ht - 0.95 * ppm); wet.addColorStop(0, 'rgba(22,36,36,0.78)'); wet.addColorStop(0.55, 'rgba(26,40,40,0.4)'); wet.addColorStop(1, 'rgba(26,40,40,0)'); g.fillStyle = wet; g.fillRect(0, Ht - 0.95 * ppm, W, 0.95 * ppm);
  { let x = 0; g.fillStyle = 'rgba(22,34,34,0.5)'; g.beginPath(); g.moveTo(0, Ht); while (x < W) { g.lineTo(x, Ht - (0.1 + r() * 0.2) * ppm); x += (0.1 + r() * 0.3) * ppm; } g.lineTo(W, Ht); g.closePath(); g.fill(); }   // the tide line of the damp: a ragged edge, painted flat
  for (let i = 0; i < 9; i++) { const w = (0.5 + r() * 0.9) * ppm, h = (0.4 + r() * 0.6) * ppm, x = r() * (W - w), y = r() * (Ht - h); g.fillStyle = 'rgba(206,200,184,0.42)'; g.fillRect(x, y, w, h); g.strokeStyle = rgba(INK, 0.55); g.lineWidth = 1.8; g.strokeRect(x, y, w, h); }   // mortar patches
  for (let i = 0; i < 6; i++) {   // spalls: the concrete came off and the rebar shows
    const w = (0.3 + r() * 0.4) * ppm, h = (0.2 + r() * 0.3) * ppm, x = r() * (W - w), y = r() * (Ht * 0.6 - h) + Ht * 0.1;
    g.fillStyle = 'rgba(72,66,58,0.95)'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0.2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(150,80,40,0.95)'; g.lineWidth = 2.2; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + 3, y + (h * k) / 4); g.lineTo(x + w - 3, y + (h * k) / 4); g.stroke(); }
    g.strokeStyle = 'rgba(255,250,236,0.4)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0.2, 0.4, 2.6); g.stroke();
  }
  if (marks) {   // the marks of the builders, in spray: a level line, crosses, an arrow, a circle: no letters
    const cols = ['230,120,30', '60,130,200', '210,50,40'];
    for (let i = 0; i < Math.round(len / 5); i++) {
      const x = r() * W, y = Ht * (0.3 + r() * 0.4), c = cols[Math.floor(r() * 3)]; g.strokeStyle = rgba(c, 0.78); g.lineWidth = 4 + r() * 2; g.lineCap = 'round';
      const k = Math.floor(r() * 4); g.beginPath();
      if (k === 0) { g.moveTo(x, y); g.lineTo(x + 40, y); } else if (k === 1) { g.moveTo(x, y); g.lineTo(x + 26, y + 26); g.moveTo(x + 26, y); g.lineTo(x, y + 26); }
      else if (k === 2) { g.arc(x, y, 14, 0, 7); } else { g.moveTo(x, y); g.lineTo(x + 46, y); g.moveTo(x + 32, y - 12); g.lineTo(x + 46, y); g.lineTo(x + 32, y + 12); }
      g.stroke();
      for (let d = 0; d < 3; d++) streak(g, x + r() * 30, y + 3, 14 + r() * 30, 2, c, 0.5);
    }
    g.fillStyle = 'rgba(226,186,40,0.55)'; g.fillRect(0, Y(1.02), W, 5); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(160,156,142,0.8)'; g.fillRect(r() * W, Y(1.02), 8 + r() * 30, 5); }   // a level line, worn
  }
  // the foot: a band of dirt
  const dirt = g.createLinearGradient(0, Ht - 0.3 * ppm, 0, Ht); dirt.addColorStop(0, 'rgba(40,36,30,0)'); dirt.addColorStop(1, 'rgba(40,36,30,0.7)'); g.fillStyle = dirt; g.fillRect(0, Ht - 0.3 * ppm, W, 0.3 * ppm);
  punch(g, W, Ht, 0.65);
  expose(g, W, Ht, '96,108,134');
  contour(g, W, Ht, 'bottom', 0.16 * ppm, 0.85); contour(g, W, Ht, 'top', 0.1 * ppm, 0.7); contour(g, W, Ht, 'left', 0.12 * ppm, 0.7); contour(g, W, Ht, 'right', 0.12 * ppm, 0.7);   // the outline: the foot, the springing line, the corners
  // the light of the lamps on the wall: warm, high, falling off with the distance from the lamp
  for (const l of lamps) {
    const k = 1 / (1 + (l.d * 0.35) ** 2), rad = Math.min(8, l.range) * ppm * 0.5;
    island(g, S(l.s - 0), Y(Math.min(H, l.y - 0.5)), rad, l.color, 0.38 * k + 0.03, 'screen', 0.8);
  }
  // the top: a shadow where the vault begins
  const top = g.createLinearGradient(0, 0, 0, 0.45 * ppm); top.addColorStop(0, 'rgba(24,26,36,0.55)'); top.addColorStop(1, 'rgba(24,26,36,0)'); g.fillStyle = top; g.fillRect(0, 0, W, 0.45 * ppm);
  if (hole) { const [a, b, hh] = hole; g.fillStyle = '#05070a'; g.fillRect(S(a), Y(hh), S(b) - S(a), Ht - Y(hh)); }
  return cv;
}

/** The vault, seen from inside: x along the picture, the arc across (0 at the south springing line, 1 at the north). */
export function paintVault(o) {
  const { len, ppm, arc, lamps, seed, ribs, R } = o, W = Math.round(len * ppm), H = Math.round(arc * ppm), r = mulberry32(seed), cv = canvas(W, H), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#807f76'); gr.addColorStop(0.5, '#8a8a82'); gr.addColorStop(1, '#7c7c74'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  washes(g, r, W, H, 80, 30, 170, '72,76,70', 0.1, 0.22); washes(g, r, W, H, 40, 30, 150, '214,210,196', 0.08, 0.16);
  brush(g, r, W, H, 1800, 26, ['60,60,56', '226,222,208'], 0.07, 1.2);
  const S = (x) => (x + len / 2) * ppm;
  for (let x = -len / 2 + 0.3; x < len / 2; x += 0.9) { g.fillStyle = 'rgba(48,46,42,0.3)'; g.fillRect(S(x), 0, 1.4, H); }          // the joints of the shotcrete panels
  strokes(g, r, W, H, 700, 80, 8, ['52,52,48', '232,226,208', '110,100,80'], 0.1, 1.57);
  for (const x of ribs) for (const sd of [-1, 1]) { const px = S(x + sd * 0.24); joint(g, px, 0, px, H, 3, 0.8, 0); const sh = g.createLinearGradient(px, 0, px + sd * 0.5 * ppm, 0); sh.addColorStop(0, rgba(INK, 0.5)); sh.addColorStop(1, rgba(INK, 0)); g.fillStyle = sh; g.fillRect(Math.min(px, px + sd * 0.5 * ppm), 0, 0.5 * ppm, H); }   // each rib's outline and the shadow it lays on the vault
  for (let i = 0; i < 70; i++) { const x = r() * W; const gg = g.createLinearGradient(0, 0, 0, H * (0.3 + r() * 0.7)); const w = 3 + r() * 10; gg.addColorStop(0, 'rgba(46,70,62,0.0)'); gg.addColorStop(0.5, 'rgba(46,70,62,0.34)'); gg.addColorStop(1, 'rgba(46,70,62,0)'); g.fillStyle = gg; g.fillRect(x, 0, w, H); }   // seepage along the arc
  for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H; g.fillStyle = 'rgba(244,242,230,0.5)'; g.beginPath(); g.ellipse(x, y, 2 + r() * 5, 2 + r() * 9, 0, 0, 7); g.fill(); }   // salts that dripped
  for (let i = 0; i < 10; i++) { const x = r() * W, y = r() * H; g.fillStyle = 'rgba(68,62,54,0.9)'; g.beginPath(); g.ellipse(x, y, 20 + r() * 20, 14 + r() * 10, r(), 0, 7); g.fill(); g.strokeStyle = 'rgba(150,80,40,0.95)'; g.lineWidth = 2.2; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x - 18, y + k * 7); g.lineTo(x + 18, y + k * 7); g.stroke(); } }   // spalls with rebar
  punch(g, W, H, 0.6);
  expose(g, W, H, '84,96,126');
  contour(g, W, H, 'top', 0.14 * ppm, 0.75); contour(g, W, H, 'bottom', 0.14 * ppm, 0.75);
  for (const l of lamps) {
    const t = Math.acos(Math.max(-1, Math.min(1, l.z / R))) / Math.PI, x = S(l.x), y = t * H, rad = Math.min(8, l.range) * ppm * 0.55;
    island(g, x, y, rad * 0.7, l.color, 0.09, 'screen', 0.9); island(g, x, y, rad * 0.25, '255,230,180', 0.05, 'screen');
  }
  return cv;
}

/**
 * A rib of the vault, unrolled: `arc` metres along the picture (from one springing line over the crown to the other), and across it a side of
 * the rib, its face and the other side (the bands the shell's uv reads: 0..0.27, 0.29..0.71, 0.73..1). Precast pieces bolted end to end: each a
 * tone of its own, the joint a dark line with a lip of light, two bolt pockets beside it; the corners of the face rubbed pale and drawn with the
 * dark line of the outline; the sides dark where they meet the vault; rust run down toward the feet from the rebar left in them.
 */
export function paintRib(o) {
  const { arc, ppm, seed } = o, W = Math.round(arc * ppm), H = 128, r = mulberry32(seed), cv = canvas(W, H), g = cv.getContext('2d');
  const bands = [[0, 0.27 * H], [0.29 * H, 0.71 * H], [0.73 * H, H]], [f0, f1] = bands[1];
  g.fillStyle = '#b9b5a6'; g.fillRect(0, 0, W, H);
  const N = 9, pw = W / N;
  for (let i = 0; i < N; i++) { const k = 0.86 + r() * 0.26; g.fillStyle = `rgba(${k > 1 ? '255,250,236' : '50,46,40'},${Math.abs(k - 1) * 1.2})`; g.fillRect(i * pw, 0, pw, H); }
  washes(g, r, W, H, 26, 20, 90, '70,74,66', 0.14, 0.3); washes(g, r, W, H, 18, 20, 80, '240,234,214', 0.12, 0.24); washes(g, r, W, H, 8, 30, 90, '150,112,66', 0.1, 0.2);
  strokes(g, r, W, H, 260, 60, 7, ['52,48,42', '244,236,214', '122,104,78'], 0.16, 0.0);
  brush(g, r, W, H, 700, 14, ['60,58,52', '236,230,212'], 0.12, 1.1);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.6 ? 'rgba(46,42,36,0.4)' : 'rgba(246,240,222,0.35)'; g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); }   // pits
  // the sides: the shade of the vault on them, darker toward it
  for (const [y0, y1, out] of [[bands[0][0], bands[0][1], 0], [bands[2][0], bands[2][1], 1]]) {
    const sh = g.createLinearGradient(0, out ? y1 : y0, 0, out ? y0 : y1); sh.addColorStop(0, rgba(INK, 0.78)); sh.addColorStop(0.3, rgba(INK, 0.42)); sh.addColorStop(1, rgba(INK, 0.16)); g.fillStyle = sh; g.fillRect(0, y0, W, y1 - y0);
  }
  // rust from the stubs left near the feet, run along the rib toward each foot; green seepage from the crown
  for (let i = 0; i < 18; i++) { const left = i % 2 === 0, x = left ? r() * W * 0.3 : W - r() * W * 0.3, y = r() * H, len = (0.25 + r() * 0.8) * ppm, w = 2 + r() * 5, gr = g.createLinearGradient(x, 0, left ? x - len : x + len, 0); gr.addColorStop(0, 'rgba(140,72,30,0.62)'); gr.addColorStop(1, 'rgba(140,72,30,0)'); g.fillStyle = gr; g.fillRect(left ? x - len : x, y, len, w); g.fillStyle = rgba(INK, 0.8); g.beginPath(); g.arc(x, y + w / 2, 1.8, 0, 7); g.fill(); }
  for (let i = 0; i < 14; i++) { const x = W * (0.3 + r() * 0.4), y = r() * H, len = (0.3 + r() * 0.9) * ppm * (r() < 0.5 ? -1 : 1), w = 3 + r() * 8, gr = g.createLinearGradient(x, 0, x + len, 0); gr.addColorStop(0, 'rgba(44,70,60,0.42)'); gr.addColorStop(1, 'rgba(44,70,60,0)'); g.fillStyle = gr; g.fillRect(Math.min(x, x + len), y, Math.abs(len), w); }
  // the joints of the pieces and their bolt pockets (on the face)
  for (let i = 1; i < N; i++) {
    const x = i * pw + (r() - 0.5) * 4; joint(g, x, 0, x, H, 3, 0.85, 0.36);
    for (const sx of [-1, 1]) for (const y of [f0 + (f1 - f0) * 0.28, f0 + (f1 - f0) * 0.72]) {
      const px = x + sx * 0.11 * ppm; g.fillStyle = rgba(INK, 0.85); g.beginPath(); g.ellipse(px, y, 5, 4, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,246,226,0.5)'; g.beginPath(); g.ellipse(px + 0.8, y + 1.8, 4, 1.4, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(150,80,36,0.55)'; g.beginPath(); g.arc(px, y, 2, 0, 7); g.fill();
    }
  }
  for (let i = 0; i < 26; i++) { const top = r() < 0.5, x = r() * W, w = 5 + r() * 16; g.fillStyle = 'rgba(64,58,50,0.9)'; g.beginPath(); g.ellipse(x, top ? f0 : f1, w, 2 + r() * 3.5, 0, 0, 7); g.fill(); }   // chips knocked off the two corners
  punch(g, W, H, 0.6);
  // the corners of the face: a pale lip inside, the dark line of the outline on the corner itself; the outer borders, where the rib meets the vault
  for (const y of [f0, f1]) { const inward = y === f0 ? 1 : -1; g.fillStyle = 'rgba(255,246,226,0.5)'; g.fillRect(0, y + inward * 3 - 1, W, 2.4); g.fillStyle = rgba(INK, 0.92); g.fillRect(0, y - 2.6, W, 5.2); }
  g.fillStyle = rgba(INK, 0.92); g.fillRect(0, bands[0][1] - 1, W, bands[1][0] - bands[0][1] + 2); g.fillRect(0, bands[1][1] - 1, W, bands[2][0] - bands[1][1] + 2);
  contour(g, W, H, 'top', 9, 0.9); contour(g, W, H, 'bottom', 9, 0.9); contour(g, W, H, 'left', 0.18 * ppm, 0.8); contour(g, W, H, 'right', 0.18 * ppm, 0.8);
  expose(g, W, H, '176,182,200');
  return cv;
}

/**
 * The lining of the tunnel, unrolled: `L` metres along the picture, `arc` metres across (from the left foot over the crown to the right foot).
 * Precast rings every 1.2 m with six segments each, bolt pockets, grout, seepage, a dirt band at the feet, and the baked light: the spill of the
 * room at the mouth, one small warm island around the lamp that is still lit (`sLit`), and the dark growing with the depth.
 */
export function paintTunnel(o) {
  const { L, arc, ppm, sLit, seed } = o, W = Math.round(L * ppm), H = Math.round(arc * ppm), r = mulberry32(seed), cv = canvas(W, H), g = cv.getContext('2d');
  const S = (s) => s * ppm, A = (a) => (a / arc) * H;
  g.fillStyle = '#8a8c88'; g.fillRect(0, 0, W, H);
  washes(g, r, W, H, 90, 30, 160, '58,62,60', 0.16, 0.3); washes(g, r, W, H, 50, 30, 150, '220,218,206', 0.1, 0.2);
  brush(g, r, W, H, 2200, 24, ['60,62,58', '226,224,210'], 0.08, 1.2);
  strokes(g, r, W, H, 900, 70, 7, ['52,54,50', '230,226,210', '112,100,80'], 0.1, 1.57);
  for (let s = 0; s <= L; s += 1.2) { g.fillStyle = rgba(INK, 0.72); g.fillRect(S(s) - 1.5, 0, 3, H); g.fillStyle = 'rgba(240,238,225,0.3)'; g.fillRect(S(s) + 1.5, 0, 1.5, H); }   // the rings
  for (let k = 1; k < 6; k++) { g.fillStyle = 'rgba(30,30,32,0.5)'; g.fillRect(0, A((arc * k) / 6) - 1, W, 2.4); }                                                 // the segments
  for (let s = 0.6; s < L; s += 1.2) for (let k = 1; k < 6; k++) { const x = S(s + ((k % 2) ? 0.6 : 0)), y = A((arc * k) / 6); g.fillStyle = 'rgba(20,20,22,0.7)'; g.fillRect(x - 3, y - 3, 6, 6); }   // bolt pockets, staggered
  for (let i = 0; i < Math.round(L * 2.2); i++) { const x = r() * W, y = r() * H * 0.5, l = (0.5 + r() * 2) * ppm * 0.7; const gg = g.createLinearGradient(x, y, x, y + l); gg.addColorStop(0, 'rgba(40,66,58,0.0)'); gg.addColorStop(0.3, 'rgba(40,66,58,0.35)'); gg.addColorStop(1, 'rgba(40,66,58,0)'); g.fillStyle = gg; g.fillRect(x, y, 4 + r() * 12, l); }
  for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H; g.fillStyle = 'rgba(240,238,226,0.5)'; g.beginPath(); g.ellipse(x, y, 3 + r() * 8, 2 + r() * 4, 0, 0, 7); g.fill(); }
  for (const [a0, a1] of [[0, 0.5], [arc - 0.5, arc]]) { const gg = g.createLinearGradient(0, A(a0), 0, A(a1)); const up = a0 === 0; gg.addColorStop(up ? 0 : 1, 'rgba(24,24,22,0.55)'); gg.addColorStop(up ? 1 : 0, 'rgba(24,24,22,0)'); g.fillStyle = gg; g.fillRect(0, A(a0), W, A(a1) - A(a0)); }   // the dirt at the feet
  // the dark of the depth, then the light that is baked in
  punch(g, W, H, 0.6);
  const dk = g.createLinearGradient(0, 0, W, 0); dk.addColorStop(0, 'rgb(150,158,178)'); dk.addColorStop(0.18, 'rgb(86,92,112)'); dk.addColorStop(0.7, 'rgb(46,50,64)'); dk.addColorStop(1, 'rgb(30,32,40)');
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = dk; g.fillRect(0, 0, W, H); g.restore();
  island(g, S(0.2), H / 2, 3.6 * ppm, '170,190,230', 0.26, 'screen', 1.8);                // the room's light spilling in, cold
  island(g, S(sLit), H / 2, 5.5 * ppm, '255,176,96', 0.5, 'screen', 1.5); island(g, S(sLit), H / 2, 1.8 * ppm, '255,226,170', 0.34, 'screen', 1.3);
  return cv;
}

/** Dark track-bed gravel, tiled (every 1.5 m). */
export function paintGravel(seed) {
  const r = mulberry32(seed), W = 256, cv = canvas(W, W), g = cv.getContext('2d');
  g.fillStyle = '#46433e'; g.fillRect(0, 0, W, W); washes(g, r, W, W, 14, 20, 70, '24,22,20', 0.3, 0.5); washes(g, r, W, W, 8, 20, 60, '140,134,120', 0.14, 0.24);
  for (let i = 0; i < 1500; i++) { const x = r() * W, y = r() * W, s = 2 + r() * 4; g.fillStyle = ['#6a665e', '#2c2a26', '#807a6c', '#4e4a42', '#98907c'][Math.floor(r() * 5)]; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - s * 0.4, y + s * 0.4, s, 1.2); }
  return cv;
}
