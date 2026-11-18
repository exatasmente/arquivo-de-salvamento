// The brush of the city: what every painted surface of the street is made with (the facades, the ground, the walls, the furniture), in the
// manner of Jonas and of the station's props (tools/props/paint.py): one tone per part with large masses of value over it, the dark warm
// line where two parts meet, the pale worn edge, paint chipped down to what is under it (a dark rim above, a lip of light below), dirt run
// down from whatever sticks out, the shade a part throws on the next, and a last pass of broad strokes that makes the values stronger.
// It draws on a 2D canvas, in pixels; nothing here knows what is being painted. Everything comes from a seed (no Math.random).
export const INK = '33,20,13';          // the outline's dark brown (models/outline.js)
export const PALE = '255,244,222';      // the worn edge, the lip of light

export const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const scale = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** A soft round mass of a colour: a small picture of it made once per colour and stretched (far cheaper than a gradient each time). */
const sprites = new Map();
export function blob(g, x, y, rx, ry, col, a) {
  let sp = sprites.get(col);
  if (!sp) {
    sp = document.createElement('canvas'); sp.width = sp.height = 48; const sg = sp.getContext('2d', { willReadFrequently: true });
    const gr = sg.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.6, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
    sg.fillStyle = gr; sg.fillRect(0, 0, 48, 48); sprites.set(col, sp);
  }
  const old = g.globalAlpha; g.globalAlpha = old * Math.min(1, a); g.drawImage(sp, x - rx, y - ry, rx * 2, ry * 2); g.globalAlpha = old;
}
/** Large masses of value over a rectangle: n darks and lights, `s` their size in pixels. */
export function masses(g, r, x, y, w, h, n, s, dark = '40,30,24', light = PALE, a = 0.2) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  n = Math.max(1, Math.round(n * 0.6));                                    // (fewer and a little stronger: a soft mass is the dearest thing to paint)
  a *= 1.15;
  for (let i = 0; i < n; i++) {
    const k = r() < 0.6, rad = s * (0.5 + r());
    blob(g, x + r() * w, y + r() * h, rad * (0.8 + r() * 0.9), rad * (0.6 + r() * 0.8), k ? dark : light, a * (0.5 + r() * 0.7) * (k ? 1 : 0.8));
  }
  g.restore();
}
/** A streak run down from (x, y): a soft dark column that fades, a little crooked, with a darker head. */
export function drip(g, r, x, y, len, wide, col = '46,34,24', a = 0.4) {
  // (two strokes with a gradient along them, not a chain of short ones: a street has tens of thousands of these)
  const bend = (r() - 0.5) * wide * 0.9, gr = g.createLinearGradient(0, y, 0, y + len);
  gr.addColorStop(0, `rgba(${col},${a * 0.75})`); gr.addColorStop(0.35, `rgba(${col},${a * 0.4})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.save(); g.lineCap = 'round'; g.strokeStyle = gr;
  g.lineWidth = Math.max(0.6, wide); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bend, y + len * 0.5, x + bend * 0.4, y + len); g.stroke();
  g.lineWidth = Math.max(0.5, wide * 0.45); g.beginPath(); g.moveTo(x, y); g.lineTo(x + bend * 0.5, y + len * 0.5); g.stroke();
  g.restore();
}
/** Several streaks under a horizontal edge from x0 to x1 at y (under a sill, a cornice, a box). */
export function drips(g, r, x0, x1, y, len, col = '46,34,24', a = 0.36, every = 9) {
  // (never a comb: they come in bunches, with bare stretches between)
  for (let x = x0 + r() * every; x < x1; x += every * (0.4 + r() * 1.6)) { if (r() < 0.45) { x += every * (1 + r() * 3); continue; } const k = r(); drip(g, r, x, y, len * (k < 0.2 ? 1 + r() * 0.6 : 0.15 + r() * 0.6), 1.5 + r() * 3.5, col, a * (0.4 + r() * 0.8)); }
}
/** An irregular closed shape round (x, y): `pts` corners, radius rx/ry, `rough` 0..1. Leaves the path open for fill/stroke/clip. */
export function shape(g, r, x, y, rx, ry, pts = 9, rough = 0.4) {
  g.beginPath();
  const a0 = r() * 6.3;
  for (let i = 0; i < pts; i++) {
    const a = a0 + (i / pts) * Math.PI * 2, k = 1 - rough + r() * rough * 2 * 0.5;
    const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
/**
 * Paint fallen off: an irregular patch that shows what is under (`under`: a colour, or a function (g, x, y, rx, ry) that draws it, clipped),
 * with the thickness of the coat drawn: a dark rim along its upper side (the coat's shade), a pale lip along its lower one.
 */
export function chip(g, r, x, y, rx, ry, under, o = {}) {
  const seedPts = [], pts = o.pts ?? 8 + Math.floor(r() * 5), a0 = r() * 6.3, rough = o.rough ?? 0.45;
  for (let i = 0; i < pts; i++) { const a = a0 + (i / pts) * Math.PI * 2, k = 1 - rough + r() * rough; seedPts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  const path = (dx = 0, dy = 0) => { g.beginPath(); seedPts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy))); g.closePath(); };
  g.save();
  path(0, 1.4); g.fillStyle = `rgba(${PALE},${o.lip ?? 0.5})`; g.fill();                       // the lip of light under it
  path(); g.save(); g.clip();
  if (typeof under === 'function') under(g, x, y, rx, ry); else { g.fillStyle = css(under); g.fillRect(x - rx, y - ry, rx * 2, ry * 2); }
  // the coat's shade on what is under: a dark band along the top of the hole
  path(0, 2.2); g.lineWidth = 3; g.strokeStyle = `rgba(${INK},0.55)`; g.stroke();
  g.restore();
  path(); g.lineWidth = o.line ?? 1; g.strokeStyle = `rgba(${INK},0.5)`; g.stroke();
  g.restore();
}
/** A crack: a crooked dark line with a pale edge and a branch or two. `dir` radians (0 = right, PI/2 = down). */
export function crack(g, r, x, y, len, dir = Math.PI / 2, wide = 1.1, a = 0.75) {
  const pts = [[x, y]], n = Math.max(3, Math.round(len / 9));
  let an = dir;
  for (let i = 0; i < n; i++) { an = dir + (r() - 0.5) * 1.3; x += Math.cos(an) * len / n; y += Math.sin(an) * len / n; pts.push([x, y]); }
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [c, lw, dx] of [[`rgba(${PALE},${a * 0.45})`, wide * 1.6, 1.1], [`rgba(${INK},${a})`, wide, 0]]) {
    g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dx * 0.4) : g.moveTo(px + dx, py + dx * 0.4))); g.stroke();
  }
  if (n > 3) { const [bx, by] = pts[1 + Math.floor(r() * (n - 2))], ba = dir + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6); g.strokeStyle = `rgba(${INK},${a * 0.8})`; g.lineWidth = wide * 0.7; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * len * 0.22, by + Math.sin(ba) * len * 0.22); g.lineTo(bx + Math.cos(ba + 0.5) * len * 0.34, by + Math.sin(ba + 0.5) * len * 0.34); g.stroke(); }
  g.restore();
}
/** The ink round a rectangle (the dark line where a part meets the next) with the worn pale edge inside its top and left. */
export function inkRect(g, x, y, w, h, a = 0.75, t = 1.3, worn = 0.4) {
  g.save();
  if (worn > 0) { g.strokeStyle = `rgba(${PALE},${worn})`; g.lineWidth = Math.max(1, t); g.beginPath(); g.moveTo(x + t, y + h - t); g.lineTo(x + t, y + t); g.lineTo(x + w - t, y + t); g.stroke(); }
  g.strokeStyle = `rgba(${INK},${a})`; g.lineWidth = t; g.strokeRect(x, y, w, h);
  g.restore();
}
/** A part that stands out of the wall, in elevation: its tone with masses, light on its top edge, shade on its underside, the ink round it. */
export function part(g, r, x, y, w, h, col, o = {}) {
  g.fillStyle = css(col); g.fillRect(x, y, w, h);
  masses(g, r, x, y, w, h, o.n ?? Math.max(2, Math.round((w * h) / 2600)), o.s ?? Math.max(6, Math.min(w, h) * 0.9), o.dark, o.light, o.a ?? 0.2);
  const e = o.edge ?? Math.max(1.2, Math.min(3, Math.min(w, h) * 0.14));
  g.fillStyle = `rgba(${PALE},${o.top ?? 0.5})`; g.fillRect(x, y, w, e);
  g.fillStyle = `rgba(${INK},${o.under ?? 0.4})`; g.fillRect(x, y + h - e, w, e);
  if (o.side !== false) { g.fillStyle = `rgba(${PALE},0.22)`; g.fillRect(x, y, e * 0.8, h); g.fillStyle = `rgba(${INK},0.22)`; g.fillRect(x + w - e * 0.8, y, e * 0.8, h); }
  if (o.ink !== false) inkRect(g, x, y, w, h, o.ink ?? 0.75, o.line ?? 1.2, 0);
}
/** The shade a part throws on the wall under and beside it (the light comes from above and a little from the left). */
export function castShadow(g, x, y, w, h, depth, a = 0.34) {
  const gr = g.createLinearGradient(0, y + h, 0, y + h + depth); gr.addColorStop(0, `rgba(${INK},${a})`); gr.addColorStop(1, `rgba(${INK},0)`);
  g.fillStyle = gr; g.fillRect(x + depth * 0.25, y + h, w, depth);
  const gs = g.createLinearGradient(x + w, 0, x + w + depth * 0.5, 0); gs.addColorStop(0, `rgba(${INK},${a * 0.7})`); gs.addColorStop(1, `rgba(${INK},0)`);
  g.fillStyle = gs; g.fillRect(x + w, y + depth * 0.2, depth * 0.5, h);
}
/**
 * A spray mark without meaning: only a shape, never anything that could be read as a letter or a number (no zigzag of three points, no row
 * of rings, no loops): a long wave, a patch scrubbed back and forth, a blot, a cloud with hatching; with its runs.
 */
export function scribble(g, r, x, y, s, col, a = 0.8) {
  g.save(); g.strokeStyle = `rgba(${col},${a})`; g.fillStyle = `rgba(${col},${a})`; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, s * 0.09);
  const kind = Math.floor(r() * 4);
  g.beginPath();
  if (kind === 0) { g.moveTo(x, y); const n = 6 + Math.floor(r() * 3), amp = s * (0.1 + r() * 0.08); for (let i = 1; i <= n * 4; i++) g.lineTo(x + (i / (n * 4)) * s * 1.2, y + Math.sin((i / 4) * Math.PI) * amp + (r() - 0.5) * amp * 0.3); g.stroke(); }   // a long wave: many periods, so it is a band and not a sign
  else if (kind === 1) { g.lineWidth = Math.max(2, s * 0.14); const an = (r() - 0.5) * 0.9; for (let i = 0; i < 9; i++) { const ox = x + i * s * 0.11 + (r() - 0.5) * s * 0.08, l = s * (0.3 + r() * 0.35); g.beginPath(); g.moveTo(ox - Math.sin(an) * l * 0.5, y - Math.cos(an) * l * 0.5 + (r() - 0.5) * s * 0.1); g.lineTo(ox + Math.sin(an) * l * 0.5, y + Math.cos(an) * l * 0.5); g.stroke(); } }
  else if (kind === 2) { shape(g, r, x + s * 0.5, y, s * 0.5, s * 0.3, 10, 0.5); g.fill(); }
  else { shape(g, r, x + s * 0.5, y, s * 0.55, s * 0.36, 9, 0.35); g.stroke(); g.lineWidth = Math.max(1, s * 0.04); for (let i = 0; i < 6; i++) { const hx = x + s * (0.15 + i * 0.12); g.beginPath(); g.moveTo(hx, y + s * 0.18); g.lineTo(hx + s * 0.12, y - s * 0.18); g.stroke(); } }
  for (let i = 0; i < 3; i++) if (r() < 0.6) drip(g, r, x + s * (0.1 + r() * 0.8), y + s * 0.12, s * (0.3 + r() * 0.6), 1.4, col, a * 0.8);
  g.restore();
}
/** A poster long since torn (blocks of faded colour, never a letter): a paper rectangle with a ragged lower edge, a few bars of colour, a torn corner. */
export function poster(g, r, x, y, w, h, cols) {
  g.save();
  g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(x + 1.5, y + 1.5, w, h);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * (0.75 + r() * 0.25));
  for (let i = 5; i >= 0; i--) g.lineTo(x + (w * i) / 5, y + h * (0.6 + r() * 0.4));
  g.closePath(); g.clip();
  g.fillStyle = css(cols[0]); g.fillRect(x, y, w, h);
  g.fillStyle = css(cols[1], 0.85); g.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * (0.2 + r() * 0.25));
  g.fillStyle = css(cols[2] ?? cols[1], 0.8); g.beginPath(); g.arc(x + w * (0.3 + r() * 0.4), y + h * 0.62, Math.min(w, h) * 0.18, 0, 6.3); g.fill();
  for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(${INK},0.35)`; g.fillRect(x + w * 0.12, y + h * (0.42 + i * 0.07), w * (0.3 + r() * 0.45), Math.max(1, h * 0.025)); }
  masses(g, r, x, y, w, h, 3, w * 0.5, '60,44,30', PALE, 0.25);
  g.restore();
  g.strokeStyle = `rgba(${INK},0.4)`; g.lineWidth = 0.8; g.strokeRect(x, y, w, h * 0.6);
}
/** Brick courses over a rectangle: `bw` by `bh` pixels, joints in a pale mortar, each brick a little off the tone. */
export function bricks(g, r, x, y, w, h, bw, bh, base, o = {}) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = css(o.mortar ?? mixc(base, [214, 204, 186], 0.6)); g.fillRect(x, y, w, h);
  const j = Math.max(0.7, bh * 0.16), tones = [];
  for (let i = 0; i < 14; i++) { const k = 0.78 + r() * 0.4; tones.push(css(i === 0 ? mixc(base, [60, 40, 34], 0.5) : [base[0] * k, base[1] * (k - 0.02 + r() * 0.06), base[2] * (k - 0.04 + r() * 0.08)])); }
  // (a tone at a time: the fill style is set fourteen times, not once a brick)
  const rows = Math.ceil(h / bh), cols = Math.ceil(w / bw) + 1, pick = new Uint8Array(rows * cols);
  for (let i = 0; i < pick.length; i++) pick[i] = r() < 0.08 ? 0 : 1 + Math.floor(r() * 13);
  for (let t = 0; t < 14; t++) { g.fillStyle = tones[t]; g.beginPath(); for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) if (pick[row * cols + c] === t) g.rect(x - (row % 2 ? bw / 2 : 0) + c * bw + j / 2, y + row * bh + j / 2, bw - j, bh - j); g.fill(); }
  if (bh >= 3) { g.fillStyle = `rgba(${PALE},0.22)`; g.beginPath(); for (let row = 0; row < rows; row++) g.rect(x, y + row * bh + j / 2, w, 0.8); g.fill(); }
  g.restore();
}
/**
 * The last pass over a whole painting (or a part of it): broad strokes of a flat brush in a dark and a light, a warm drift and a cool one,
 * (the values are made stronger by `punch`, once for the whole canvas).
 */
export function finish(g, r, x, y, w, h, o = {}) {
  const n = o.n ?? Math.round((w * h) / 5200), wide = o.wide ?? 7, len = o.len ?? 46, a = o.a ?? 0.1, dir = o.dir ?? 0;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = x + r() * w, py = y + r() * h, an = dir + (r() - 0.5) * 0.7 + (r() < 0.3 ? Math.PI / 2 : 0), l = len * (0.5 + r());
    g.strokeStyle = `rgba(${r() < 0.5 ? INK : PALE},${a * (0.4 + r() * 0.8)})`; g.lineWidth = wide * (0.5 + r());
    g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(an) * l * 0.5 + (r() - 0.5) * 8, py + Math.sin(an) * l * 0.5 + (r() - 0.5) * 8, px + Math.cos(an) * l, py + Math.sin(an) * l); g.stroke();
  }
  for (let i = 0; i < (o.drift ?? 4); i++) blob(g, x + r() * w, y + r() * h, w * (0.2 + r() * 0.3), h * (0.15 + r() * 0.25), i % 2 ? '70,104,118' : '176,120,66', 0.1);
  g.restore();
}
/**
 * The values of a whole painting made stronger: the picture laid over itself. ONCE per canvas, at the end: a canvas drawn on itself is
 * copied whole each time.
 */
export function punch(g, a = 0.42) { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.drawImage(g.canvas, 0, 0); g.restore(); }
/**
 * A canvas of w by h pixels and its context. It is painted in memory (`willReadFrequently`), not on the graphics card: a painting is
 * thousands of strokes drawn once and then read whole by the texture, and a canvas kept on the card pays for all of them at the first frame
 * (measured on a software renderer: 47 s for the first frame of the street against 5 s; in memory the painting is done while the scene loads).
 */
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(4, Math.round(w)); c.height = Math.max(4, Math.round(h)); return [c, c.getContext('2d', { willReadFrequently: true })]; }
/** The texture of a painted canvas for the kit: smooth, with mipmaps; `repeat`: [wrapS, wrapT] repeat or not. */
export function textureOf(T, c, repeat = [false, false]) {
  const t = new T.CanvasTexture(c);
  t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.wrapS = repeat[0] ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.wrapT = repeat[1] ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.colorSpace = T.NoColorSpace;
  return t;
}
