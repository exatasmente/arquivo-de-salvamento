// The kit the scenes and the objects are made with: small painted textures (concrete, brick, asphalt, pictograms ...),
// and a Batch that collects boxes, cylinders and planes with their materials and joins everything of one
// material into one mesh (mergeGeos), so a whole room is a handful of draw calls. No text is ever painted:
// signs are pictograms (colour, shape, glyph). Everything is made from a seed: no Math.random.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { mergeGeos } from '../../vendor/engine/render.js';
import { OUTLINE, hullOf, outlineMaterial } from './outline.js';

const rgb = (c) => `rgb(${c.map((x) => Math.max(0, Math.min(255, x)) | 0).join(',')})`;

// ---- the painted surfaces, in the style of an animated feature ---------------------------------------------------------------------
// Large soft washes of colour (dampness, dirt, wear) instead of fine noise; a painted light edge on the corners and borders; clean joints
// (a dark line with a light line beside it); a few hand-drawn details that read at a glance (a crack, a rust stain, a worn pictogram). The
// palette is shared: warm grey concrete, damp olive in the gallery, cold blue at night on the street (that comes from the light), rust ochre.
const flat = (g, w, h, base, k = 1) => { g.fillStyle = rgb(base.map((v) => v * k)); g.fillRect(0, 0, w, h); };
/** Soft round washes of a colour: n of them, radius in fractions of the texture, tiling at the borders. */
function wash(g, w, h, r, n, r0, r1, col, a0, a1 = a0) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = (r0 + r() * (r1 - r0)) * w, a = a0 + r() * (a1 - a0);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
  }
}
/** A painted bevel: light on the top and left borders, a shade on the bottom and right. */
function bevel(g, x, y, w, h, t = 2, light = 'rgba(255,250,235,0.5)', shade = 'rgba(40,36,30,0.28)') {
  g.fillStyle = light; g.fillRect(x, y, w, t); g.fillRect(x, y, t, h);
  g.fillStyle = shade; g.fillRect(x, y + h - t, w, t); g.fillRect(x + w - t, y, t, h);
}
/** A clean joint: a dark line with a light line right after it. */
function joint(g, x0, y0, x1, y1, t = 2, dark = 'rgba(33,20,13,0.8)', light = 'rgba(255,246,226,0.42)') {
  g.lineCap = 'butt'; g.strokeStyle = dark; g.lineWidth = t; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1, ox = (-dy / n) * t, oy = (dx / n) * t;
  g.strokeStyle = light; g.lineWidth = Math.max(1, t * 0.6); g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke();
}
/** One drawn crack with a branch: a clear dark stroke with a light edge. */
function crack(g, w, h, r, col = '46,42,38') {
  let x = w * (0.2 + r() * 0.5), y = h * (0.1 + r() * 0.2); const pts = [[x, y]];
  for (let i = 0; i < 6; i++) { x += (r() - 0.45) * w * 0.12; y += h * (0.1 + r() * 0.06); pts.push([x, y]); }
  for (const [c, lw, dx] of [['rgba(255,250,235,0.4)', 2.4, 1.4], [`rgba(${col},0.85)`, 1.6, 0]]) { g.strokeStyle = c; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py) : g.moveTo(px + dx, py))); g.stroke(); }
  const [bx, by] = pts[3]; g.strokeStyle = `rgba(${col},0.8)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + w * 0.1, by + h * 0.08); g.lineTo(bx + w * 0.16, by + h * 0.07); g.stroke();
}
/** A rust stain: an ochre wash with a darker core and a drip. */
function rustStain(g, x, y, s) {
  const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(120,64,28,0.7)'); gr.addColorStop(0.5, 'rgba(160,92,44,0.38)'); gr.addColorStop(1, 'rgba(180,110,56,0)');
  g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  const dg = g.createLinearGradient(x, y, x, y + s * 2.4); dg.addColorStop(0, 'rgba(120,64,28,0.45)'); dg.addColorStop(1, 'rgba(120,64,28,0)'); g.fillStyle = dg; g.fillRect(x - s * 0.1, y, s * 0.2, s * 2.4);
}

/** (Ink hatching was tried and dropped: the style is soft washes and clean joints.) */
const hatch = () => {};
/**
 * The last pass of every surface, the hand that painted Jonas and the props (tools/props/paint.py, models/props/station.js): broad strokes of
 * a flat brush in a dark and a light of the surface (they tile), a few dabs, and stronger values (the picture laid over itself).
 * `dir`: the way the brush runs (radians); `n`, `len`, `wide` (fractions of the texture), `a`: the strokes; `punch`: how much stronger.
 */
function finish(g, w, h, r, { n = 22, len = 0.34, wide = 0.055, a = 0.2, cols = ['33,24,18', '255,246,226'], dir = 0, punch = 0.6, dabs = 30 } = {}) {
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, an = dir + (r() - 0.5) * 0.5, l = len * w * (0.5 + r()), bx = (r() - 0.5) * wide * w * 2, by = (r() - 0.5) * wide * w * 2;
    g.strokeStyle = `rgba(${cols[Math.floor(r() * cols.length)]},${a * (0.35 + r() * 0.65)})`; g.lineWidth = wide * w * (0.5 + r());
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(an) * l * 0.5 + bx, y + oy + Math.sin(an) * l * 0.5 + by, x + ox + Math.cos(an) * l, y + oy + Math.sin(an) * l); g.stroke(); }
  }
  for (let i = 0; i < dabs; i++) { g.fillStyle = `rgba(${cols[i % cols.length]},${a * (0.6 + r() * 0.8)})`; const s = w * (0.008 + r() * 0.014); g.beginPath(); g.ellipse(r() * w, r() * h, s, s * 0.6, r() * 3, 0, 7); g.fill(); }
  g.restore();
  if (punch > 0) { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = punch; g.drawImage(g.canvas, 0, 0, w, h); g.restore(); }
}
/** How each surface is finished (see `finish`); a surface that is not here is left as it is drawn (the grille, the sky, a pictogram's own pass). */
const FINISH = {
  concreto: { dir: 0.1 }, umido: { dir: 1.5, cols: ['24,34,26', '226,240,214'] }, piso: { dir: 0.3, a: 0.16 }, tijolo: { dir: 0, a: 0.16, wide: 0.04 },
  madeira: { dir: 0, n: 16, wide: 0.07, cols: ['50,30,16', '255,236,200'], a: 0.24 }, metal: { dir: 1.2, n: 14, wide: 0.09, len: 0.5, cols: ['30,34,44', '255,255,255'], a: 0.2, punch: 0.7 },
  ferrugem: { dir: 1.5, n: 16, wide: 0.08, len: 0.5, cols: ['62,30,14', '236,168,104', '33,20,13'], a: 0.3, punch: 0.75 }, tecido: { dir: 0.5, n: 10, wide: 0.12, a: 0.16 },
  colchao: { dir: 1.5, n: 10, a: 0.14 }, asfalto: { dir: 0.2, a: 0.14, cols: ['12,12,18', '236,236,246'] }, calcada: { dir: 0.3, a: 0.15 },
  borracha: { dir: 0.9, n: 9, wide: 0.12, len: 0.5, cols: ['0,0,0', '210,214,230'], a: 0.22, punch: 0.4 }, modulo: { dir: 1.5, a: 0.14, n: 14 }, azulejo: { dir: 0.4, a: 0.14 },
  papelao: { punch: 0.5, dir: 0.05, n: 14, cols: ['70,44,22', '255,236,200'], a: 0.2 },
};

/** Textures: name -> [w, h, paint(g, w, h, r)]. Light colours: the material's colour tints them. */
const PAINTS = {
  concreto: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [216, 212, 202]);
    wash(g, w, h, r, 5, 0.25, 0.5, '120,112,98', 0.16, 0.26);
    wash(g, w, h, r, 3, 0.2, 0.4, '255,250,235', 0.2);
    joint(g, 0, 1, w, 1, 2); joint(g, 1, 0, 1, h, 2); joint(g, 0, h / 2, w, h / 2, 1.6);
    for (const [x, y] of [[18, 28], [w - 24, 28], [18, h - 24], [w - 24, h - 24]]) { g.fillStyle = 'rgba(48,44,40,0.8)'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); g.fillStyle = 'rgba(255,250,235,0.5)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, 1, 0, 7); g.fill(); }
    crack(g, w, h, r);
    hatch(g, 0, h - 22, w, 22, 4, 0.9, 0.42, true, 1);
  }],
  umido: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [172, 180, 160]);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(110,128,92,0)'); gr.addColorStop(1, 'rgba(70,92,62,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    wash(g, w, h, r, 4, 0.25, 0.45, '64,92,60', 0.22, 0.32);
    wash(g, w, h, r, 3, 0.2, 0.35, '224,236,206', 0.2);
    for (let i = 0; i < 3; i++) { const x = (i + 0.3 + r() * 0.4) * w / 3, g2 = g.createLinearGradient(x, 0, x, h * (0.5 + r() * 0.5)); g2.addColorStop(0, 'rgba(48,70,48,0.34)'); g2.addColorStop(1, 'rgba(48,70,48,0)'); g.fillStyle = g2; g.fillRect(x - 3, 0, 6 + r() * 4, h); }
    joint(g, 0, 1, w, 1, 2, 'rgba(36,50,38,0.6)'); joint(g, 1, 0, 1, h, 2, 'rgba(36,50,38,0.6)');
    hatch(g, 0, h - 26, w, 26, 4, 0.9, 0.45, true, 2);
  }],
  piso: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [204, 200, 190]);
    wash(g, w, h, r, 4, 0.25, 0.45, '110,104,92', 0.16, 0.24);
    wash(g, w, h, r, 1, 0.3, 0.4, '60,96,118', 0.3);
    for (const [x, y] of [[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]]) bevel(g, x + 2, y + 2, w / 2 - 3, h / 2 - 3, 2, 'rgba(255,250,235,0.34)', 'rgba(40,36,30,0.16)');
    joint(g, 0, 1, w, 1, 2.4); joint(g, 1, 0, 1, h, 2.4); joint(g, 0, h / 2, w, h / 2, 2.4); joint(g, w / 2, 0, w / 2, h, 2.4);
    hatch(g, 0, 0, 20, 20, 4, 0.8, 0.4, true, 3); hatch(g, w - 24, h - 24, 24, 24, 4, 0.8, 0.4, true, 4);
  }],
  tijolo: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [232, 224, 214]);
    for (let row = 0; row < 16; row++) for (let col = -1; col < 5; col++) {
      const x = col * 32 + (row % 2 ? 16 : 0), y = row * 8, k = 0.86 + r() * 0.2, hue = r() * 18;
      g.fillStyle = rgb([214 * k, (186 - hue) * k, (170 - hue) * k]); g.fillRect(x + 1, y + 1, 30, 6);
      g.fillStyle = 'rgba(255,240,220,0.35)'; g.fillRect(x + 1, y + 1, 30, 1); g.fillStyle = 'rgba(60,40,30,0.2)'; g.fillRect(x + 1, y + 6, 30, 1);
    }
    wash(g, w, h, r, 4, 0.25, 0.45, '70,56,46', 0.18, 0.26); wash(g, w, h, r, 2, 0.2, 0.3, '255,246,230', 0.2);
    hatch(g, 0, h - 20, w, 20, 4, 0.9, 0.4, true, 5);
  }],
  madeira: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [200, 190, 176]);
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${i % 2 ? '255,236,200' : '120,86,50'},0.14)`; g.fillRect(0, i * 16, w, 16); joint(g, 0, i * 16 + 1, w, i * 16 + 1, 1.4, 'rgba(60,40,24,0.65)', 'rgba(255,236,200,0.35)'); }
    g.strokeStyle = 'rgba(110,76,44,0.3)'; g.lineWidth = 1.2; for (let i = 0; i < 5; i++) { const y = 4 + r() * 56; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y + 1); g.stroke(); }
    wash(g, w, h, r, 2, 0.3, 0.5, '90,60,32', 0.14);
  }],
  metal: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [222, 224, 228]);
    for (const y of [0, 32]) { bevel(g, 1, y + 1, w - 2, 30, 2, 'rgba(255,255,255,0.5)', 'rgba(40,46,56,0.22)'); joint(g, 0, y + 1, w, y + 1, 1.6, 'rgba(40,46,56,0.6)'); }
    wash(g, w, h, r, 2, 0.3, 0.5, '110,118,132', 0.16);
    rustStain(g, w * (0.2 + r() * 0.6), h * (0.15 + r() * 0.2), 9);
    hatch(g, 0, h - 10, w, 10, 3, 0.9, 0.35, false, 6);
  }],
  ferrugem: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [200, 188, 176]);
    wash(g, w, h, r, 3, 0.28, 0.45, '168,96,48', 0.4, 0.55);
    wash(g, w, h, r, 2, 0.15, 0.25, '86,48,28', 0.3, 0.4);
    wash(g, w, h, r, 2, 0.2, 0.3, '255,236,210', 0.2);
    bevel(g, 0, 0, w, h, 2, 'rgba(255,240,220,0.4)', 'rgba(50,30,20,0.25)');
  }],
  tecido: [32, 32, (g, w, h, r) => {
    flat(g, w, h, [232, 232, 230]);
    wash(g, w, h, r, 2, 0.4, 0.6, '110,106,96', 0.14); wash(g, w, h, r, 1, 0.4, 0.5, '255,255,255', 0.2);
    g.strokeStyle = 'rgba(60,56,48,0.18)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, h * 0.7); g.quadraticCurveTo(w * 0.5, h * 0.5, w, h * 0.8); g.stroke();
  }],
  colchao: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [238, 234, 222]);
    for (let x = 4; x < w; x += 16) { g.fillStyle = 'rgba(86,112,150,0.38)'; g.fillRect(x, 0, 7, h); }
    wash(g, w, h, r, 2, 0.3, 0.4, '150,126,80', 0.2);
    bevel(g, 0, 0, w, h, 2);
  }],
  asfalto: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [158, 158, 164]);
    wash(g, w, h, r, 6, 0.25, 0.5, '34,34,42', 0.18, 0.3);
    wash(g, w, h, r, 3, 0.2, 0.35, '236,236,240', 0.16);
    crack(g, w, h, r, '18,18,22');
    hatch(g, 0, h - 16, w, 16, 5, 0.9, 0.3, false, 8);
  }],
  calcada: [128, 128, (g, w, h, r) => {
    flat(g, w, h, [212, 208, 198]);
    wash(g, w, h, r, 4, 0.25, 0.45, '112,106,94', 0.16, 0.24); wash(g, w, h, r, 2, 0.2, 0.35, '255,250,235', 0.2);
    for (const [x, y] of [[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]]) bevel(g, x + 2, y + 2, w / 2 - 3, h / 2 - 3, 2, 'rgba(255,250,235,0.4)', 'rgba(40,36,30,0.14)');
    hatch(g, 0, 0, 24, 24, 4, 0.8, 0.4, true, 7);
    joint(g, 0, 1, w, 1, 2.6); joint(g, 1, 0, 1, h, 2.6); joint(g, 0, h / 2, w, h / 2, 2.6); joint(g, w / 2, 0, w / 2, h, 2.6);
  }],
  grelha: [32, 32, (g, w) => {
    g.fillStyle = 'rgb(14,16,20)'; g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgb(205,205,210)'; for (let y = 2; y < w; y += 8) g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgb(255,255,255)'; for (let y = 2; y < w; y += 8) g.fillRect(0, y, w, 1);
  }],
  painel: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [74, 100, 152]);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(180,210,255,0.35)'); gr.addColorStop(0.5, 'rgba(180,210,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 16) { joint(g, i, 0, i, h, 1.4, 'rgba(200,206,216,0.9)', 'rgba(255,255,255,0.3)'); joint(g, 0, i, w, i, 1.4, 'rgba(200,206,216,0.9)', 'rgba(255,255,255,0.3)'); }
  }],
  modulo: [64, 64, (g, w, h, r) => {
    // one bay of a facade: a clean wall, a recessed dark window with a frame and a sill (the lit windows are separate)
    flat(g, w, h, [220, 216, 208]);
    wash(g, w, h, r, 3, 0.3, 0.5, '110,104,94', 0.16, 0.24); wash(g, w, h, r, 2, 0.25, 0.4, '255,250,235', 0.22);
    g.fillStyle = 'rgb(70,70,76)'; g.fillRect(13, 11, 38, 40);
    g.fillStyle = 'rgb(30,38,54)'; g.fillRect(16, 14, 32, 34);
    const gr = g.createLinearGradient(16, 14, 48, 48); gr.addColorStop(0, 'rgba(140,170,210,0.5)'); gr.addColorStop(0.45, 'rgba(140,170,210,0)'); g.fillStyle = gr; g.fillRect(16, 14, 32, 34);
    g.fillStyle = 'rgb(70,70,76)'; g.fillRect(31, 14, 2, 34);
    bevel(g, 13, 11, 38, 40, 1, 'rgba(255,255,255,0.4)', 'rgba(0,0,0,0.3)');
    g.fillStyle = 'rgb(244,240,232)'; g.fillRect(11, 51, 42, 3); g.fillStyle = 'rgba(40,36,30,0.35)'; g.fillRect(11, 54, 42, 2);
    bevel(g, 0, 0, w, h, 1, 'rgba(255,250,235,0.4)', 'rgba(40,36,30,0.18)');
  }],
  vidro: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [66, 84, 110]);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(160,190,230,0.45)'); gr.addColorStop(0.5, 'rgba(160,190,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,225,255,0.3)'; g.beginPath(); g.moveTo(8, 0); g.lineTo(22, 0); g.lineTo(6, h); g.lineTo(0, h); g.fill();
    g.fillStyle = 'rgb(176,186,200)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 1.5, h);
  }],
  azulejo: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [238, 240, 236]);
    wash(g, w, h, r, 3, 0.3, 0.5, '120,130,110', 0.14, 0.22); wash(g, w, h, r, 1, 0.3, 0.4, '160,130,60', 0.16);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) bevel(g, x + 1, y + 1, 15, 15, 1.5, 'rgba(255,255,255,0.55)', 'rgba(60,70,64,0.2)');
    for (let i = 0; i < w; i += 16) { joint(g, i, 0, i, h, 1.4, 'rgba(84,96,90,0.75)', 'rgba(255,255,255,0.4)'); joint(g, 0, i, w, i, 1.4, 'rgba(84,96,90,0.75)', 'rgba(255,255,255,0.4)'); }
  }],
  papelao: [64, 64, (g, w, h, r) => {
    flat(g, w, h, [226, 196, 150]);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(120,84,44,${0.06 + r() * 0.06})`; g.fillRect(0, y, w, 1); }                  // the flutes
    wash(g, w, h, r, 3, 0.3, 0.5, '110,74,40', 0.16, 0.24); wash(g, w, h, r, 2, 0.2, 0.4, '255,240,210', 0.2);
    bevel(g, 0, 0, w, h, 2, 'rgba(255,244,220,0.45)', 'rgba(60,36,18,0.3)');
  }],
  ceu: [4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgb(110,150,225)'); gr.addColorStop(0.5, 'rgb(180,200,228)'); gr.addColorStop(1, 'rgb(180,200,228)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }],
  borracha: [32, 32, (g, w, h, r) => { flat(g, w, h, [78, 78, 84]); wash(g, w, h, r, 2, 0.4, 0.6, '20,20,24', 0.25); bevel(g, 0, 0, w, h, 2, 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.25)'); }],
  faixa: [32, 32, (g, w, h) => { g.fillStyle = 'rgb(240,200,40)'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgb(30,30,34)'; for (let i = -h; i < w; i += 16) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 8, h); g.lineTo(i + 8 + h, 0); g.lineTo(i + h, 0); g.fill(); } }],
};

// ---- pictograms: the only signs in the world (no letters, no numbers) -----------------------------------------

const plate = (g, S, bg, border = '#22252a') => {
  g.fillStyle = border; g.fillRect(0, 0, S, S);
  g.fillStyle = bg; g.fillRect(3, 3, S - 6, S - 6);
};
const poly = (g, pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const disc = (g, x, y, rad, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
/** Pictograms, drawn in a 128x128 square. */
export const PICTOS = {
  // The Vialume mark (fictional): a road line that ends in a point of light, grey and ochre.
  vialume: (g, S) => {
    plate(g, S, '#4a4d50', '#2a2c2e');
    poly(g, [[S * 0.2, S * 0.92], [S * 0.8, S * 0.92], [S * 0.53, S * 0.34], [S * 0.47, S * 0.34]], '#b98a38');
    poly(g, [[S * 0.46, S * 0.92], [S * 0.54, S * 0.92], [S * 0.505, S * 0.4], [S * 0.495, S * 0.4]], '#4a4d50');
    disc(g, S * 0.5, S * 0.24, S * 0.12, '#ecd08a'); disc(g, S * 0.5, S * 0.24, S * 0.06, '#fff4cc');
  },
  farmacia: (g, S) => { plate(g, S, '#e8efe6'); g.fillStyle = '#2c9a58'; g.fillRect(S * 0.4, S * 0.15, S * 0.2, S * 0.7); g.fillRect(S * 0.15, S * 0.4, S * 0.7, S * 0.2); },
  embarque: (g, S) => {
    plate(g, S, '#2b5f9c');
    g.strokeStyle = '#f2f2f2'; g.lineWidth = S * 0.09; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(S * 0.18, S * 0.78); g.lineTo(S * 0.6, S * 0.78); g.moveTo(S * 0.46, S * 0.64); g.lineTo(S * 0.62, S * 0.78); g.lineTo(S * 0.46, S * 0.92); g.stroke();
    disc(g, S * 0.74, S * 0.24, S * 0.09, '#f2f2f2'); poly(g, [[S * 0.62, S * 0.62], [S * 0.86, S * 0.62], [S * 0.8, S * 0.38], [S * 0.68, S * 0.38]], '#f2f2f2');
  },
  entrega: (g, S) => {
    plate(g, S, '#c8962e');
    g.fillStyle = '#2a2418'; g.fillRect(S * 0.26, S * 0.4, S * 0.48, S * 0.44);
    g.fillStyle = '#e2b858'; g.fillRect(S * 0.3, S * 0.44, S * 0.4, S * 0.36); g.fillStyle = '#2a2418'; g.fillRect(S * 0.46, S * 0.4, S * 0.08, S * 0.44);
    poly(g, [[S * 0.5, S * 0.34], [S * 0.34, S * 0.14], [S * 0.66, S * 0.14]], '#2a2418');
  },
  raio: (g, S) => { plate(g, S, '#e9c21c'); poly(g, [[S * 0.58, S * 0.1], [S * 0.26, S * 0.56], [S * 0.46, S * 0.56], [S * 0.38, S * 0.92], [S * 0.76, S * 0.4], [S * 0.54, S * 0.4]], '#1c1c20'); },
  agua: (g, S) => { plate(g, S, '#2a6aa6'); poly(g, [[S * 0.5, S * 0.12], [S * 0.76, S * 0.58], [S * 0.5, S * 0.58], [S * 0.24, S * 0.58]], '#e8f2fa'); disc(g, S * 0.5, S * 0.62, S * 0.26, '#e8f2fa'); },
  radio: (g, S) => {
    plate(g, S, '#34383c'); disc(g, S * 0.3, S * 0.7, S * 0.07, '#e0b040');
    g.strokeStyle = '#e0b040'; g.lineWidth = S * 0.06;
    for (const k of [0.2, 0.36, 0.52]) { g.beginPath(); g.arc(S * 0.3, S * 0.7, S * k, -Math.PI * 0.45, -Math.PI * 0.05); g.stroke(); }
  },
  perigo: (g, S) => {
    g.fillStyle = '#22252a'; g.fillRect(0, 0, S, S); poly(g, [[S * 0.5, S * 0.08], [S * 0.94, S * 0.88], [S * 0.06, S * 0.88]], '#d6532a'); poly(g, [[S * 0.5, S * 0.2], [S * 0.82, S * 0.8], [S * 0.18, S * 0.8]], '#f0e2c0');
    g.fillStyle = '#22252a'; g.fillRect(S * 0.46, S * 0.38, S * 0.08, S * 0.22); disc(g, S * 0.5, S * 0.7, S * 0.045, '#22252a');
  },
  chave: (g, S) => {
    plate(g, S, '#4a5058'); g.strokeStyle = '#e6e2d6'; g.lineWidth = S * 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(S * 0.28, S * 0.76); g.lineTo(S * 0.62, S * 0.42); g.stroke();
    g.lineWidth = S * 0.08; g.beginPath(); g.arc(S * 0.68, S * 0.34, S * 0.14, Math.PI * 0.9, Math.PI * 2.5); g.stroke();
  },
  fogo: (g, S) => { plate(g, S, '#7a3a24'); poly(g, [[S * 0.5, S * 0.1], [S * 0.76, S * 0.5], [S * 0.7, S * 0.84], [S * 0.3, S * 0.84], [S * 0.24, S * 0.5], [S * 0.4, S * 0.58]], '#f0b030'); poly(g, [[S * 0.5, S * 0.5], [S * 0.62, S * 0.7], [S * 0.5, S * 0.84], [S * 0.38, S * 0.7]], '#fff0b0'); },
  cama: (g, S) => { plate(g, S, '#3c4a78'); g.fillStyle = '#e8e4d8'; g.fillRect(S * 0.12, S * 0.56, S * 0.76, S * 0.14); g.fillRect(S * 0.12, S * 0.46, S * 0.08, S * 0.3); disc(g, S * 0.3, S * 0.5, S * 0.07, '#e8e4d8'); g.fillRect(S * 0.12, S * 0.7, S * 0.06, S * 0.12); g.fillRect(S * 0.82, S * 0.7, S * 0.06, S * 0.12); },
  caixa: (g, S) => { plate(g, S, '#6e5636'); g.fillStyle = '#c9a56c'; g.fillRect(S * 0.18, S * 0.3, S * 0.64, S * 0.5); g.fillStyle = '#6e5636'; g.fillRect(S * 0.46, S * 0.3, S * 0.08, S * 0.5); g.fillRect(S * 0.18, S * 0.3, S * 0.64, S * 0.06); },
  comida: (g, S) => { plate(g, S, '#4d7a3c'); disc(g, S * 0.5, S * 0.55, S * 0.3, '#ece8dc'); disc(g, S * 0.5, S * 0.55, S * 0.2, '#4d7a3c'); g.fillStyle = '#ece8dc'; g.fillRect(S * 0.12, S * 0.18, S * 0.05, S * 0.3); g.fillRect(S * 0.84, S * 0.18, S * 0.05, S * 0.3); },
  proibido: (g, S) => { plate(g, S, '#ece6d6'); g.strokeStyle = '#c0392b'; g.lineWidth = S * 0.1; g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.34, 0, Math.PI * 2); g.moveTo(S * 0.26, S * 0.74); g.lineTo(S * 0.74, S * 0.26); g.stroke(); },
  seta: (g, S) => { plate(g, S, '#2b5f9c'); poly(g, [[S * 0.5, S * 0.12], [S * 0.86, S * 0.5], [S * 0.62, S * 0.5], [S * 0.62, S * 0.88], [S * 0.38, S * 0.88], [S * 0.38, S * 0.5], [S * 0.14, S * 0.5]], '#f2f2f2'); },
  mapa: (g, S) => { plate(g, S, '#d9c99a'); g.strokeStyle = '#5a4a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(S * 0.15, S * 0.8); g.lineTo(S * 0.4, S * 0.5); g.lineTo(S * 0.6, S * 0.62); g.lineTo(S * 0.86, S * 0.2); g.stroke(); disc(g, S * 0.86, S * 0.2, S * 0.06, '#a03020'); },
};
export const PICTO_NAMES = Object.keys(PICTOS);
/**
 * A sign as it hangs in this world, painted by the same hand as the rest: the plate's border a dark brown line with a lip of light, the paint
 * rubbed pale by a brush, chipped at the rim down to the rusted sheet, dirt run down from the top and from the two screws, stronger values.
 */
function weather(g, S, r) {
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {          // the brush: broad pale and dark strokes across the plate
    const x = r() * S, y = r() * S, an = 0.2 + (r() - 0.5) * 0.6, l = S * (0.2 + r() * 0.4);
    g.strokeStyle = `rgba(${r() < 0.5 ? '255,246,226' : '33,20,13'},${0.07 + r() * 0.1})`; g.lineWidth = S * (0.03 + r() * 0.05);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * l * 0.5, y + Math.sin(an) * l * 0.5 + (r() - 0.5) * 8, x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
  }
  for (let i = 0; i < 7; i++) {           // dirt run down
    const x = r() * S, len = S * (0.25 + r() * 0.6), w = 2 + r() * 6, gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(40,26,16,${0.2 + r() * 0.2})`); gr.addColorStop(1, 'rgba(40,26,16,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  for (let i = 0; i < 22; i++) {          // chips at the rim: the rust under the paint, with a dark heart
    const t = r() * 4, k = t % 1, e = 2 + r() * 5, [x, y] = t < 1 ? [k * S, e] : t < 2 ? [k * S, S - e] : t < 3 ? [e, k * S] : [S - e, k * S], rad = 2 + r() * 5;
    g.fillStyle = 'rgba(122,66,30,0.9)'; g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(33,20,13,0.8)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.6, rad * 0.5, rad * 0.3, r() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 3; i++) { const x = S * (0.15 + r() * 0.7), y = S * (0.15 + r() * 0.7), rad = 3 + r() * 6; g.fillStyle = 'rgba(122,66,30,0.75)'; g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(255,246,226,0.4)'; g.beginPath(); g.ellipse(x - 1, y - 1.2, rad * 0.8, rad * 0.3, 0.3, 3.3, 5.6); g.fill(); }
  for (const x of [S * 0.5]) for (const y of [8, S - 8]) { g.fillStyle = 'rgba(33,20,13,0.9)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillStyle = 'rgba(255,246,226,0.6)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, 1.1, 0, 7); g.fill(); }   // the two screws
  const sh = g.createLinearGradient(0, 0, 0, S); sh.addColorStop(0, 'rgba(255,246,226,0.14)'); sh.addColorStop(0.5, 'rgba(255,246,226,0)'); sh.addColorStop(1, 'rgba(33,20,13,0.3)'); g.fillStyle = sh; g.fillRect(0, 0, S, S);   // the light from above
  g.strokeStyle = 'rgba(33,20,13,0.95)'; g.lineWidth = 5; g.strokeRect(1.5, 1.5, S - 3, S - 3);                                   // the outline of the plate
  g.strokeStyle = 'rgba(255,246,226,0.38)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(5.5, S - 6); g.lineTo(5.5, 5.5); g.lineTo(S - 6, 5.5); g.stroke();
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.45; g.drawImage(g.canvas, 0, 0, S, S);
  g.restore();
}

// ---- the kit of one render ----------------------------------------------------------------------------------

const kits = new WeakMap();
/** The kit of render `r`: textures and materials made once and shared by every scene and object. */
export function kitOf(r) {
  if (kits.has(r)) return kits.get(r);
  const T = r.THREE, textures = new Map(), mats = new Map(), night = new Set();
  let outline = null;
  const texture = (name) => {
    if (textures.has(name)) return textures.get(name);
    let c;
    let s = 7; for (const ch of name) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    if (name.startsWith('p:')) {
      c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.scale(2, 2);
      (PICTOS[name.slice(2)] ?? PICTOS.perigo)(g, 128);
      weather(g, 128, mulberry32(s));
    } else {
      // drawn at twice the size it was laid out in (the layout is in the old pixels), then finished by the painter's hand
      const [w, h, paint] = PAINTS[name] ?? PAINTS.concreto, K = FINISH[name] && w <= 128 ? 2 : 1;
      c = document.createElement('canvas'); c.width = w * K; c.height = h * K;
      const g = c.getContext('2d'), rr = mulberry32(s); g.scale(K, K);
      paint(g, w, h, rr);
      if (FINISH[name]) finish(g, w, h, rr, FINISH[name]);
    }
    const t = new T.CanvasTexture(c);
    // painted, so smooth (as the props and the station's pictures are); the grille keeps its hard bars
    if (name === 'grelha') { t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; }
    else { t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; }
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace;
    textures.set(name, t);
    return t;
  };
  /** A material from a spec: '#rrggbb' or { c, map, emissive, opacity, side, fogged, night }. `night` (+ `dayC`): the glow and the colour follow the night: by day the material is dull `dayC` and does not glow (the rua scene sets kit.night's emissive and colour by the daylight). Shared by key. */
  const mat = (spec) => {
    const s = typeof spec === 'string' ? { c: spec } : spec;
    const key = JSON.stringify([s.c, s.map, s.emissive, s.opacity, s.side, s.fogged, s.depthWrite, s.night, s.dayC]);
    if (mats.has(key)) return mats.get(key);
    const o = {};
    if (s.map) o.map = texture(s.map);
    if (s.emissive !== undefined) o.emissive = s.emissive;
    if (s.fogged !== undefined) o.fogged = s.fogged;
    if (s.opacity !== undefined) { o.opacity = s.opacity; o.transparent = s.opacity < 1; if (o.transparent) o.depthWrite = false; }
    if (s.depthWrite !== undefined) o.depthWrite = s.depthWrite;
    if (s.side === 'outline') return (outline ??= outlineMaterial(r));       // the shells of the outline: one material for the whole render
    if (s.side === 'double') o.side = T.DoubleSide;
    if (s.side === 'back') o.side = T.BackSide;
    const m = r.mat(s.c ?? '#ffffff', o);
    if (s.night) { m.userData.nightBase = s.emissive ?? 0; m.userData.nightColor = new T.Color(s.c); m.userData.dayColor = new T.Color(s.dayC ?? s.c); night.add(m); }
    mats.set(key, m);
    return m;
  };
  const kit = { r, T, texture, mat, night, setTexture: (name, t) => textures.set(name, t), has: (name) => textures.has(name), Batch: null };
  kit.Batch = class extends Batch { constructor() { super(kit); } };
  kits.set(r, kit);
  return kit;
}

/** The spec of the outline's shells (`side: 'outline'`: the kit answers it with the one outline material) and the shells kept by shape. */
export const OUTLINE_SPEC = { c: OUTLINE.color, emissive: 1, fogged: 1, side: 'outline' };
const hulls = new Map();
const tmp = new Map();
function planeGeo(T, a, b, cell) {
  const na = Math.max(1, Math.ceil(a / cell)), nb = Math.max(1, Math.ceil(b / cell));
  const k = `${a}|${b}|${na}|${nb}`;
  if (!tmp.has(k)) tmp.set(k, new T.PlaneGeometry(a, b, na, nb));
  return tmp.get(k);
}

/**
 * Collects geometry per material and builds one mesh per material (and per chunk, if `chunk` is given).
 * Placement: `pos` is the bottom centre of a box or cylinder; rotations in radians (order YXZ).
 * `o.tile`: metres per texture repeat (number or [u, v]; default 2). `o.cell`: the largest square of a face
 * (the lighting is per vertex, so a big face is cut to catch the point lights); default 1.8.
 */
export class Batch {
  constructor(kit) { this.kit = kit; this.parts = new Map(); this.tris = 0; }
  add(spec, geo, matrix) {
    const s = typeof spec === 'string' ? { c: spec } : spec;
    const key = JSON.stringify([s.c, s.map, s.emissive, s.opacity, s.side, s.fogged, s.depthWrite, s.night, s.dayC]);
    if (!this.parts.has(key)) this.parts.set(key, { spec: s, list: [] });
    this.parts.get(key).list.push({ geo, matrix });
  }
  /** The outline's shell of a geometry at a matrix (models/outline.js): all the shells of a Batch are one mesh. `cacheKey`: the shell is kept under it. */
  outline(geo, matrix, cacheKey) {
    if (!OUTLINE.on) return;
    let hull = cacheKey ? hulls.get(cacheKey) : null;
    if (!hull) { hull = hullOf(this.kit.T, geo); if (cacheKey) hulls.set(cacheKey, hull); }
    this.add(OUTLINE_SPEC, hull, matrix);
  }
  matrix(pos, o = {}, lift = 0) {
    const T = this.kit.T, m = new T.Matrix4();
    m.compose(new T.Vector3(pos[0], pos[1] + lift, pos[2]), new T.Quaternion().setFromEuler(new T.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ')), new T.Vector3(1, 1, 1));
    return m;
  }
  /** A box w (x) by h (y) by d (z); `o.skip`: faces left out ('+x','-x','+y','-y','+z','-z'); `o.specs`: a spec per face. */
  box(spec, [w, h, d], pos = [0, 0, 0], o = {}) {
    const T = this.kit.T, cell = o.cell ?? 1.8, tile = o.tile ?? 2, [tu, tv] = Array.isArray(tile) ? tile : [tile, tile];
    const base = this.matrix(pos, o), skip = o.skip ?? [];
    const faces = [
      ['+z', w, h, [0, h / 2, d / 2], [0, 0, 0]], ['-z', w, h, [0, h / 2, -d / 2], [0, Math.PI, 0]],
      ['+x', d, h, [w / 2, h / 2, 0], [0, Math.PI / 2, 0]], ['-x', d, h, [-w / 2, h / 2, 0], [0, -Math.PI / 2, 0]],
      ['+y', w, d, [0, h, 0], [-Math.PI / 2, 0, 0]], ['-y', w, d, [0, 0, 0], [Math.PI / 2, 0, 0]],
    ];
    const jx = o.nojitter ? 0 : ((pos[0] * 7.3 + pos[2] * 3.1) % 1 + 1) % 1, jy = o.nojitter ? 0 : ((pos[1] * 5.7 + pos[0] * 1.7) % 1 + 1) % 1;
    for (const [name, a, b, at, rot] of faces) {
      if (skip.includes(name) || a <= 0 || b <= 0) continue;
      const g = planeGeo(T, a, b, cell).clone();
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * a) / tu + jx, (uv.getY(i) * b) / tv + jy);
      const m = new T.Matrix4().compose(new T.Vector3(...at), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1));
      this.add(o.specs?.[name] ?? spec, g, base.clone().multiply(m));
    }
    if (o.outline) { const k = `b|${w}|${h}|${d}`; this.outline(hulls.get(k) ? null : new T.BoxGeometry(w, h, d), base.clone().multiply(new T.Matrix4().makeTranslation(0, h / 2, 0)), k); }
  }
  /** A cylinder (or cone) of radii rt (top) and rb (bottom), height h, `seg` sides; `o.open`: no caps. A turned one (rx or rz) has `pos` at its centre. */
  cyl(spec, rt, rb, h, seg, pos = [0, 0, 0], o = {}) {
    const T = this.kit.T, g = new T.CylinderGeometry(rt, rb, h, seg, Math.max(1, Math.ceil(h / (o.cell ?? 1.8))), Boolean(o.open));
    const uv = g.attributes.uv, tile = o.tile ?? 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * Math.max(rt, rb)) / tile, (uv.getY(i) * h) / tile);
    const m = this.matrix(pos, o, o.rx || o.rz ? 0 : h / 2);
    this.add(spec, g, m);
    if (o.outline) { const k = `c|${rt}|${rb}|${h}|${seg}`; this.outline(hulls.get(k) ? null : new T.CylinderGeometry(rt, rb, h, seg, 1, false), m, k); }
  }
  /** A flat plane w by h, standing (facing +z) or lying (`o.flat`: facing up). Bottom centre at pos. */
  plane(spec, w, h, pos = [0, 0, 0], o = {}) {
    const T = this.kit.T, cell = o.cell ?? 1.8, tile = o.tile ?? 2, [tu, tv] = Array.isArray(tile) ? tile : [tile, tile];
    const g = planeGeo(T, w, h, cell).clone(), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, o.full ? uv.getX(i) : (uv.getX(i) * w) / tu, o.full ? uv.getY(i) : (uv.getY(i) * h) / tv);
    const m = this.matrix(pos, o, o.flat ? 0 : h / 2);
    if (o.flat) m.multiply(new T.Matrix4().makeRotationX(-Math.PI / 2));
    this.add(spec, g, m);
  }
  /** Any geometry, placed by a matrix or by pos/rotation. */
  geo(spec, geometry, pos = [0, 0, 0], o = {}) { const m = this.matrix(pos, o); this.add(spec, geometry, m); if (o.outline) this.outline(geometry, m); }
  /** One mesh per material (and per chunk of `o.chunk` metres, so the camera can leave a part out). */
  build(o = {}) {
    const T = this.kit.T, group = new T.Group();
    for (const { spec, list } of this.parts.values()) {
      const buckets = new Map();
      for (const p of list) {
        let k = 'all';
        if (o.chunk) {
          const e = p.matrix.elements; k = `${Math.floor(e[12] / o.chunk)}|${Math.floor(e[14] / o.chunk)}`;
        }
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(p);
      }
      for (const parts of buckets.values()) {
        const geo = mergeGeos(parts);
        this.tris += geo.attributes.position.count / 3;
        const mesh = new T.Mesh(geo, this.kit.mat(spec));
        group.add(mesh);
      }
    }
    return group;
  }
}

/** The triangles drawn for an object or a scene (meshes that are visible). */
export function countTris(obj) {
  let n = 0;
  obj.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    for (let p = m; p; p = p.parent) if (!p.visible) return;
    n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
  });
  return Math.round(n);
}

/**
 * Joins the meshes of the entities that never change (every mesh under `group` whose entity's `made` has no
 * `dynamic`) into one mesh per material, per `cut` group (a name an entity may carry, to be shown or hidden as one) and per chunk. The entity roots stay (empty) for picking. Only for the
 * game: the scene editor needs each entity as its own group. Returns the number of meshes before and after.
 */
export function flatten(kit, group, madeById, chunk = 0) {
  group.updateMatrixWorld(true);
  const T = kit.T, buckets = new Map(), inv = new T.Matrix4().copy(group.matrixWorld).invert();
  let before = 0;
  for (const [id, m] of Object.entries(madeById)) {
    if (m.dynamic) continue;
    const meshes = [];
    m.root.traverse((o) => { if (o.isMesh && o.userData.keep !== true) meshes.push(o); });
    for (const mesh of meshes) {
      before++;
      const mm = new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      const e = mm.elements, k = `${mesh.material.uuid}|${m.cut ?? ''}|${chunk ? `${Math.floor(e[12] / chunk)}|${Math.floor(e[14] / chunk)}` : 'all'}`;
      if (!buckets.has(k)) buckets.set(k, { material: mesh.material, parts: [], cut: m.cut });
      buckets.get(k).parts.push({ geo: mesh.geometry, matrix: mm });
      mesh.parent.remove(mesh);
    }
  }
  const out = new T.Group(), cuts = new Map();
  for (const { material, parts, cut } of buckets.values()) {
    const mesh = new T.Mesh(mergeGeos(parts), material); out.add(mesh);
    if (cut) { if (!cuts.has(cut)) cuts.set(cut, []); cuts.get(cut).push(mesh); }
  }
  group.add(out);
  return { before, after: out.children.length, group: out, cuts };
}
