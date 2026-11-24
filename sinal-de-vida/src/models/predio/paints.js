// The painted surfaces of the building of the chase, by the same hand as the city's (models/city/paintkit.js): light colours the material
// tints, large masses of value, the damp and the wear painted in, a dark line with a lip of light at every joint, strong values at the end.
// No letter and no number anywhere: a door has a plate with nothing on it, a mailbox a slot and a keyhole. Everything from a seed.
// Registered in the kit under the names `pf:<name>`; `installPredioPaints(kit)` paints them once per render.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import * as P from '../city/paintkit.js';

const INK = P.INK, PALE = P.PALE;
const fill = (g, c, x, y, w, h) => { g.fillStyle = P.css(c); g.fillRect(x, y, w, h); };
const line = (g, x0, y0, x1, y1, col, a, t = 1) => { g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = t; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
/** A joint: a dark line with a lip of light after it (across: horizontal). */
const joint = (g, x, y, len, across = true, a = 0.7) => { if (across) { fill(g, [33, 20, 13], x, y, len, 1.6); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y + 1.6, len, 1); } else { fill(g, [33, 20, 13], x, y, 1.6, len); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x + 1.6, y, 1, len); } void a; };

const S = 256;
const PAINT = {
  // the plaster of the hall and the stairs: a painted dado below (oil paint, chipped), limewash above, the damp coming down from the ceiling
  parede: [S, S, true, (g, r) => {
    fill(g, [222, 214, 196], 0, 0, S, S);
    P.masses(g, r, 0, 0, S, S, 16, 60, '96,84,66', PALE, 0.22);
    const d = S * 0.62; fill(g, [150, 164, 150], 0, d, S, S - d); P.masses(g, r, 0, d, S, S - d, 9, 46, '50,60,54', '236,240,226', 0.24);
    joint(g, 0, d, S); fill(g, [108, 96, 80], 0, S - 16, S, 16); joint(g, 0, S - 16, S);
    for (let i = 0; i < 7; i++) P.chip(g, r, r() * S, d + 8 + r() * (S - d - 30), 5 + r() * 12, 4 + r() * 8, [206, 196, 176]);
    P.drips(g, r, 0, S, 0, 120, '70,58,40', 0.4, 14);
    for (let i = 0; i < 3; i++) P.crack(g, r, r() * S, r() * d * 0.6, 30 + r() * 50, Math.PI / 2 + (r() - 0.5), 1.1, 0.6);
    for (let i = 0; i < 3; i++) P.blob(g, r() * S, 10 + r() * 40, 30 + r() * 30, 18 + r() * 20, '60,74,52', 0.3);        // mould near the ceiling
  }],
  // the flat's wallpaper: faded stripes with a small repeated leaf, lifted and torn at a seam, a pale square where a picture hung
  papel: [S, S, true, (g, r) => {
    fill(g, [214, 200, 172], 0, 0, S, S);
    for (let x = 0; x < S; x += 32) { fill(g, [196, 184, 158], x, 0, 12, S); for (let y = 8; y < S; y += 32) { g.fillStyle = 'rgba(128,112,84,0.5)'; g.beginPath(); g.ellipse(x + 22, y + (x % 64 ? 0 : 16), 3.2, 6, 0.5, 0, 7); g.fill(); } }
    P.masses(g, r, 0, 0, S, S, 14, 64, '90,70,44', PALE, 0.22);
    g.fillStyle = 'rgba(244,236,214,0.5)'; g.fillRect(150, 60, 54, 44); P.inkRect(g, 150, 60, 54, 44, 0.2, 1, 0.3);
    g.fillStyle = P.css([186, 176, 160]); g.beginPath(); g.moveTo(64, 0); g.lineTo(84, 0); g.lineTo(76, 70); g.lineTo(60, 96); g.closePath(); g.fill(); line(g, 64, 0, 60, 96, INK, 0.45, 1.2);
    P.drips(g, r, 0, S, 0, 90, '80,62,40', 0.34, 18); fill(g, [112, 92, 66], 0, S - 14, S, 14); joint(g, 0, S - 14, S);
  }],
  // the hall's floor: square tiles in two tones laid as a chequer, cracked, a worn path, grit in the joints
  ladrilho: [S, S, true, (g, r) => {
    const n = 4, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const k = 0.9 + r() * 0.2; fill(g, P.scale((i + j) % 2 ? [196, 186, 164] : [132, 112, 96], k), i * t, j * t, t, t); P.inkRect(g, i * t, j * t, t, t, 0.5, 1.4, 0.3); }
    P.masses(g, r, 0, 0, S, S, 14, 54, '40,30,22', PALE, 0.22);
    for (let i = 0; i < 4; i++) P.crack(g, r, r() * S, r() * S, 24 + r() * 44, r() * 6.3, 1, 0.6);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(${INK},${0.2 + r() * 0.3})`; g.beginPath(); g.arc(r() * S, r() * S, 0.8 + r() * 1.6, 0, 7); g.fill(); }
  }],
  // the flat's floor: short boards of parquet laid in rows, the varnish gone where feet went, a board missing
  taco: [S, S, true, (g, r) => {
    const bw = S / 4, bh = S / 8;
    for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++) { const x = i * bw + (j % 2 ? bw / 2 : 0), k = 0.82 + r() * 0.3; fill(g, P.scale([186, 142, 98], k), x, j * bh, bw, bh); for (let q = 0; q < 3; q++) line(g, x + 2, j * bh + 4 + r() * (bh - 8), x + bw - 2, j * bh + 4 + r() * (bh - 8), '96,62,34', 0.22, 1); P.inkRect(g, x, j * bh, bw, bh, 0.55, 1.2, 0.25); }
    fill(g, [40, 30, 24], bw * 1.5, bh * 3, bw, bh); P.inkRect(g, bw * 1.5, bh * 3, bw, bh, 0.8, 1.4, 0.2);
    P.masses(g, r, 0, 0, S, S, 12, 60, '50,34,20', '255,236,200', 0.24);
  }],
  // the concrete of the stairs' treads: a worn pale nose, the middle polished, dirt in the corner
  degrau: [128, 64, true, (g, r) => {
    fill(g, [168, 162, 150], 0, 0, 128, 64); P.masses(g, r, 0, 0, 128, 64, 8, 30, '50,44,38', PALE, 0.25);
    g.fillStyle = `rgba(${PALE},0.55)`; g.fillRect(0, 0, 128, 5); g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(0, 58, 128, 6);
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(${INK},${0.15 + r() * 0.25})`; g.beginPath(); g.arc(r() * 128, 8 + r() * 50, 1 + r() * 2, 0, 7); g.fill(); }
  }],
  // a flat's door: four sunk panels, paint peeled to the wood round the handle, a blank plate, a spy hole
  porta: [128, 256, false, (g, r) => {
    fill(g, [150, 132, 112], 0, 0, 128, 256); P.masses(g, r, 0, 0, 128, 256, 10, 50, '54,40,28', PALE, 0.24);
    for (const [x, y, w, h] of [[14, 14, 44, 92], [70, 14, 44, 92], [14, 122, 44, 120], [70, 122, 44, 120]]) { fill(g, [128, 112, 94], x, y, w, h); P.inkRect(g, x, y, w, h, 0.7, 1.5, 0.5); g.fillStyle = `rgba(${INK},0.22)`; g.fillRect(x, y, w, 5); }
    for (let i = 0; i < 9; i++) P.chip(g, r, 96 + r() * 26, 100 + r() * 50, 4 + r() * 8, 3 + r() * 7, [150, 110, 72]);
    fill(g, [190, 180, 150], 52, 30, 24, 12); P.inkRect(g, 52, 30, 24, 12, 0.7, 1.2, 0.5);
    g.fillStyle = `rgba(${INK},0.9)`; g.beginPath(); g.arc(64, 58, 3, 0, 7); g.fill();
    P.drips(g, r, 0, 128, 0, 60, '60,44,30', 0.3, 16); P.inkRect(g, 1, 1, 126, 254, 0.85, 2.4, 0.4);
  }],
  // wired glass: greenish cast glass with a diamond mesh of wire in it, grime at the bottom, a hand print wiped clean
  aramado: [S, S, true, (g, r) => {
    fill(g, [150, 178, 170], 0, 0, S, S); P.masses(g, r, 0, 0, S, S, 12, 70, '30,50,48', '230,250,240', 0.22);
    g.strokeStyle = `rgba(${INK},0.62)`; g.lineWidth = 1.1; for (let k = -S; k < S * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); g.beginPath(); g.moveTo(k, 0); g.lineTo(k - S, S); g.stroke(); }
    const gr = g.createLinearGradient(0, S * 0.6, 0, S); gr.addColorStop(0, 'rgba(50,44,30,0)'); gr.addColorStop(1, 'rgba(50,44,30,0.55)'); g.fillStyle = gr; g.fillRect(0, S * 0.6, S, S * 0.4);
    P.blob(g, 150, 120, 26, 20, '220,240,232', 0.4); g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.moveTo(20, 0); g.lineTo(70, 0); g.lineTo(10, S); g.lineTo(-40, S); g.closePath(); g.fill();
  }],
  // a mailbox bank: three rows of little doors, a slot and a keyhole each, some forced open and dark, one dented
  correio: [S, 192, false, (g, r) => {
    fill(g, [146, 152, 150], 0, 0, S, 192); P.masses(g, r, 0, 0, S, 192, 10, 50, '40,44,46', PALE, 0.24);
    const cw = S / 6, ch = 64;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
      const x = i * cw, y = j * ch, open = r() < 0.22;
      fill(g, open ? [26, 22, 20] : P.scale([158, 164, 160], 0.86 + r() * 0.24), x + 3, y + 3, cw - 6, ch - 6); P.inkRect(g, x + 3, y + 3, cw - 6, ch - 6, 0.8, 1.6, open ? 0 : 0.5);
      if (!open) { fill(g, [30, 26, 24], x + 9, y + 14, cw - 18, 4); g.fillStyle = `rgba(${INK},0.9)`; g.beginPath(); g.arc(x + cw / 2, y + 42, 2.6, 0, 7); g.fill(); if (r() < 0.3) P.chip(g, r, x + 8 + r() * 20, y + 20 + r() * 30, 5, 4, [122, 66, 36]); }
      else { g.fillStyle = 'rgba(214,204,176,0.7)'; g.fillRect(x + 8, y + 40 + r() * 8, cw - 20, 5); }
    }
    P.drips(g, r, 0, S, 0, 50, '90,52,30', 0.3, 20);
  }],
  // the cupboard's door from outside: slats laid like a shutter, each catching the light on its top edge
  ripas: [128, 128, true, (g, r) => {
    fill(g, [176, 160, 132], 0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, `rgba(${PALE},0.6)`); gr.addColorStop(0.6, 'rgba(120,100,70,0.1)'); gr.addColorStop(1, `rgba(${INK},0.85)`); g.fillStyle = gr; g.fillRect(0, y, 128, 16); }
    P.masses(g, r, 0, 0, 128, 128, 8, 50, '60,44,28', PALE, 0.2);
  }],
  // a dust sheet over furniture: the folds as long soft darks and lights, the dust grey on top
  lencol: [S, S, true, (g, r) => {
    fill(g, [224, 220, 208], 0, 0, S, S);
    for (let i = 0; i < 16; i++) { const x = r() * S, w = 8 + r() * 22, gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, `rgba(${INK},0)`); gr.addColorStop(0.5, `rgba(70,66,76,${0.22 + r() * 0.2})`); gr.addColorStop(1, `rgba(${PALE},0.3)`); g.fillStyle = gr; g.save(); g.transform(1, 0, (r() - 0.5) * 0.5, 1, 0, 0); g.fillRect(x, 0, w, S); g.restore(); }
    P.masses(g, r, 0, 0, S, S, 12, 70, '80,78,86', PALE, 0.22);
    const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, 'rgba(120,112,100,0.4)'); gr.addColorStop(1, 'rgba(120,112,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, 60);
  }],
  // the fire escape's steel: painted bars with gaps of night between them (a tread, a landing), the paint blistered to rust
  ferro: [128, 128, true, (g, r) => {
    fill(g, [14, 14, 18], 0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { fill(g, P.scale([96, 100, 98], 0.8 + r() * 0.4), x + 2, 0, 10, 128); g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x + 2, 0, 2, 128); g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x + 10, 0, 2, 128); }
    for (const y of [0, 60]) { fill(g, [88, 92, 90], 0, y, 128, 8); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(0, y, 128, 2); }
    for (let i = 0; i < 20; i++) P.blob(g, r() * 128, r() * 128, 5 + r() * 9, 4 + r() * 8, '150,78,36', 0.5);
  }],
  // a solid plate of the fire escape (stringers, the rails' posts): dark paint, rust blooming at the bolts and running down
  chapa: [128, 128, true, (g, r) => {
    fill(g, [92, 96, 94], 0, 0, 128, 128); P.masses(g, r, 0, 0, 128, 128, 10, 44, '24,22,22', PALE, 0.26);
    for (let i = 0; i < 9; i++) { const x = r() * 128, y = r() * 128; P.blob(g, x, y, 6 + r() * 10, 5 + r() * 8, '150,78,36', 0.55); P.drip(g, r, x, y, 20 + r() * 40, 2 + r() * 3, '120,60,30', 0.4); }
  }],
  // the street front, one bay of one upper floor (3 m by 3.2 m): rendered wall, a window with its shutter half down or boarded, a stained sill
  fachada: [240, S, true, (g, r) => {
    fill(g, [206, 196, 178], 0, 0, 240, S); P.masses(g, r, 0, 0, 240, S, 16, 70, '80,66,48', PALE, 0.24);
    const wx = 62, wy = 70, ww = 116, wh = 120;
    fill(g, [20, 22, 28], wx, wy, ww, wh); fill(g, [150, 150, 140], wx, wy, ww, 38 + r() * 30);
    for (let y = wy; y < wy + 60; y += 9) line(g, wx, y, wx + ww, y, INK, 0.4, 1);
    P.part(g, r, wx - 8, wy - 10, ww + 16, 10, [186, 180, 166]); P.part(g, r, wx - 10, wy + wh, ww + 20, 9, [176, 170, 158]);
    fill(g, [70, 66, 60], wx + ww / 2 - 2, wy, 4, wh); P.inkRect(g, wx, wy, ww, wh, 0.85, 2, 0.4);
    P.drips(g, r, wx - 10, wx + ww + 10, wy + wh + 9, 60, '60,48,34', 0.42, 9);
    joint(g, 0, 0, 240); fill(g, [176, 168, 152], 0, 0, 240, 7); P.drips(g, r, 0, 240, 7, 40, '60,48,34', 0.3, 20);
  }],
  // the ground floor's front: stone-faced render in courses, grime and the splash of the pavement at the foot
  embasamento: [S, S, true, (g, r) => {
    fill(g, [168, 160, 146], 0, 0, S, S);
    for (let y = 0; y < S; y += 42) { joint(g, 0, y, S); for (let x = (y / 42) % 2 ? 0 : 60; x < S; x += 120) joint(g, x, y, 42, false); }
    P.masses(g, r, 0, 0, S, S, 16, 66, '50,42,32', PALE, 0.26);
    const gr = g.createLinearGradient(0, S * 0.7, 0, S); gr.addColorStop(0, 'rgba(36,30,24,0)'); gr.addColorStop(1, 'rgba(36,30,24,0.6)'); g.fillStyle = gr; g.fillRect(0, S * 0.7, S, S * 0.3);
    for (let i = 0; i < 3; i++) P.scribble(g, r, 30 + r() * 150, 120 + r() * 60, 16 + r() * 10, ['150,70,50', '60,80,110', '50,50,46'][i], 0.5);
  }],
};

/** The same glass with the blow in it: a star of long cracks from where the dog struck, rings between them, the wire holding the pieces. */
function crackGlass(g, r) {
  const cx = S * 0.46, cy = S * 0.6;
  g.lineCap = 'round';
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * 6.283 + r() * 0.3; let x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += Math.cos(a + (r() - 0.5) * 0.5) * (14 + r() * 22); y += Math.sin(a + (r() - 0.5) * 0.5) * (14 + r() * 22); g.lineTo(x, y); }
    g.strokeStyle = 'rgba(240,250,246,0.9)'; g.lineWidth = 1.6; g.stroke(); g.strokeStyle = `rgba(${INK},0.5)`; g.lineWidth = 0.7; g.stroke();
  }
  for (const rad of [14, 30, 52, 80]) { g.beginPath(); for (let i = 0; i <= 17; i++) { const a = (i / 17) * 6.283, q = rad * (0.85 + r() * 0.3); if (i) g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); else g.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.strokeStyle = 'rgba(236,248,244,0.7)'; g.lineWidth = 1.1; g.stroke(); }
  P.blob(g, cx, cy, 26, 24, '240,250,246', 0.6);
}

export const PREDIO_TEXTURES = [...Object.keys(PAINT), 'aramado-trinca'].map((n) => 'pf:' + n);
export function installPredioPaints(kit) {
  const T = kit.T;
  for (const [name, [w, h, tile, paint]] of Object.entries(PAINT)) {
    if (kit.has('pf:' + name)) continue;
    let s = 53; for (const ch of name) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
    const [c, g] = P.canvas(w, h), r = mulberry32(s);
    paint(g, r); P.finish(g, r, 0, 0, w, h, { a: 0.08 }); P.punch(g, 0.4);
    kit.setTexture('pf:' + name, P.textureOf(T, c, [tile, tile]));
    if (name === 'aramado') {
      const [c2, g2] = P.canvas(w, h); g2.drawImage(c, 0, 0); crackGlass(g2, mulberry32(s ^ 0x5eed));
      kit.setTexture('pf:aramado-trinca', P.textureOf(T, c2, [false, false]));
    }
  }
}
