// Painted textures and a small geometry kit for the scenes. Everything is drawn in code on tiny
// canvases (16 to 32 px per tile, a few wider ones for dynamic panels) and sampled with
// NearestFilter. Every painter is a pure function of its name and a fixed seed.
import { mulberry32 } from '../rng.js';

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function fill(g, w, h, [r0, g0, b0], amt, R) {
  const id = g.createImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) {
    const k = 1 + (R() - 0.5) * amt;
    d[i * 4] = clamp(r0 * k); d[i * 4 + 1] = clamp(g0 * k); d[i * 4 + 2] = clamp(b0 * k); d[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
}
const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const rgb = (r, gg, b, a = 1) => `rgba(${r},${gg},${b},${a})`;

// [width, height, painter(g, w, h, R)]
const PAINT = {
  plaster: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [150, 142, 124], 0.16, R);
    for (let i = 0; i < 7; i++) rect(g, rgb(90, 84, 70, 0.35), (R() * w) | 0, (R() * h) | 0, 3 + ((R() * 7) | 0), 2 + ((R() * 6) | 0));
    let x = 6 + ((R() * 20) | 0);
    for (let y = 0; y < h; y++) { rect(g, rgb(70, 64, 56, 0.7), x, y, 1, 1); x += R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0; }
    rect(g, rgb(60, 58, 52, 0.5), 0, h - 3, w, 3); // damp at the foot
  }],
  wood: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [150, 104, 64], 0.22, R);
    for (let y = 0; y < h; y += 8) rect(g, rgb(40, 26, 16), 0, y, w, 1);
    for (let i = 0; i < 10; i++) rect(g, rgb(110, 74, 44, 0.8), (R() * w) | 0, (R() * h) | 0, 4 + ((R() * 8) | 0), 1);
    for (let y = 0; y < h; y += 8) rect(g, rgb(40, 26, 16), ((y * 7) % w), y, 1, 8);
  }],
  tile: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [170, 168, 150], 0.18, R);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if ((x + y) & 1) rect(g, rgb(90, 96, 90, 0.5), x * 16, y * 16, 16, 16);
    rect(g, rgb(50, 50, 44), 0, 0, w, 1); rect(g, rgb(50, 50, 44), 0, 16, w, 1);
    rect(g, rgb(50, 50, 44), 0, 0, 1, h); rect(g, rgb(50, 50, 44), 16, 0, 1, h);
    for (let i = 0; i < 8; i++) rect(g, rgb(70, 60, 44, 0.5), (R() * w) | 0, (R() * h) | 0, 2 + ((R() * 4) | 0), 2);
  }],
  grass: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [96, 120, 62], 0.28, R);
    for (let i = 0; i < 26; i++) rect(g, rgb(60, 84, 40, 0.8), (R() * w) | 0, (R() * h) | 0, 1, 2 + ((R() * 2) | 0));
    for (let i = 0; i < 12; i++) rect(g, rgb(150, 160, 80, 0.7), (R() * w) | 0, (R() * h) | 0, 1, 2);
    for (let i = 0; i < 4; i++) rect(g, rgb(88, 70, 44, 0.6), (R() * w) | 0, (R() * h) | 0, 3, 2);
  }],
  dirt: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [120, 98, 76], 0.3, R);
    for (let i = 0; i < 14; i++) rect(g, rgb(70, 56, 44, 0.7), (R() * w) | 0, (R() * h) | 0, 1 + ((R() * 3) | 0), 1 + ((R() * 2) | 0));
  }],
  bark: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [96, 76, 60], 0.3, R);
    for (let x = 0; x < w; x += 3) rect(g, rgb(40, 30, 24, 0.8), x + ((R() * 2) | 0), 0, 1, h);
  }],
  leaves: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [74, 110, 56], 0.3, R);
    for (let i = 0; i < 40; i++) rect(g, rgb(110, 150, 70, 0.8), (R() * w) | 0, (R() * h) | 0, 2, 2);
    for (let i = 0; i < 40; i++) rect(g, rgb(34, 60, 36, 0.8), (R() * w) | 0, (R() * h) | 0, 2, 2);
  }],
  apple: [8, 8, (g, w, h, R) => { fill(g, w, h, [210, 50, 40], 0.25, R); rect(g, rgb(250, 130, 100), 1, 1, 2, 1); }],
  dusk: [8, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1b1a3a'); gr.addColorStop(0.35, '#4a3560'); gr.addColorStop(0.62, '#b4586a');
    gr.addColorStop(0.8, '#f0a05a'); gr.addColorStop(1, '#f6c987');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }],
  // the night seen through a window or a grate: deep navy to violet, a few stars (no horizon glow, no day)
  nightsky: [48, 24, (g, w, h, R) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#080a22'); gr.addColorStop(1, '#1a1a48');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) rect(g, rgb(222, 230, 255, 0.55 + R() * 0.45), (R() * w) | 0, (R() * h) | 0, 1, 1);
    for (let i = 0; i < 4; i++) rect(g, rgb(255, 255, 255), (R() * w) | 0, (R() * h) | 0, 1, 1);
  }],
  nightskyS: [12, 6, (g, w, h, R) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#080a22'); gr.addColorStop(1, '#1a1a48');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) rect(g, rgb(235, 240, 255), (R() * w) | 0, (R() * h) | 0, 1, 1);
  }],
  // the whole sky sphere: zenith at the top, horizon at the middle row, mirrored below
  sky: [8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#15143a'); gr.addColorStop(0.2, '#2c2352'); gr.addColorStop(0.33, '#6a3f68');
    gr.addColorStop(0.42, '#d0707a'); gr.addColorStop(0.47, '#f0a05a'); gr.addColorStop(0.5, '#f6c987');
    gr.addColorStop(1, '#f6c987');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }],
  fence: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [150, 130, 108], 0.3, R);
    for (let y = 0; y < h; y += 5) rect(g, rgb(50, 40, 32, 0.7), 0, y, w, 1);
  }],
  concrete: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [130, 132, 134], 0.2, R);
    rect(g, rgb(60, 62, 66), 0, 0, w, 1); rect(g, rgb(60, 62, 66), 0, 0, 1, h);
    for (let i = 0; i < 10; i++) rect(g, rgb(80, 80, 84, 0.5), (R() * w) | 0, (R() * h) | 0, 2 + ((R() * 5) | 0), 1 + ((R() * 4) | 0));
    rect(g, rgb(150, 140, 120, 0.6), 4, 4, 2, 2);
  }],
  corrug: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [128, 124, 116], 0.16, R);
    for (let x = 0; x < w; x += 4) { rect(g, rgb(190, 184, 170, 0.7), x, 0, 1, h); rect(g, rgb(60, 56, 52, 0.8), x + 2, 0, 1, h); }
    for (let i = 0; i < 6; i++) rect(g, rgb(120, 70, 40, 0.6), (R() * w) | 0, (R() * h) | 0, 2, 3 + ((R() * 6) | 0));
  }],
  metal: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [128, 132, 140], 0.16, R);
    rect(g, rgb(52, 56, 64), 0, 0, w, 1); rect(g, rgb(52, 56, 64), 0, 0, 1, h); rect(g, rgb(52, 56, 64), 16, 0, 1, h);
    for (const [x, y] of [[2, 2], [13, 2], [2, 29], [13, 29], [18, 2], [29, 2], [18, 29], [29, 29]]) rect(g, rgb(190, 194, 200), x, y, 2, 2);
  }],
  scifi: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [168, 176, 190], 0.08, R);
    rect(g, rgb(70, 78, 92), 0, 0, w, 1); rect(g, rgb(70, 78, 92), 0, 0, 1, h);
    rect(g, rgb(70, 78, 92), 0, 16, w, 1); rect(g, rgb(70, 78, 92), 16, 0, 1, 16);
    rect(g, rgb(120, 130, 150), 3, 3, 10, 10); rect(g, rgb(150, 160, 178), 4, 4, 8, 8);
    rect(g, rgb(90, 200, 190), 20, 22, 8, 2);
    for (let i = 0; i < 6; i++) rect(g, rgb(110, 118, 130, 0.5), (R() * w) | 0, (R() * h) | 0, 3, 1);
  }],
  scififloor: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [110, 116, 128], 0.12, R);
    rect(g, rgb(60, 66, 78), 0, 0, w, 1); rect(g, rgb(60, 66, 78), 0, 0, 1, h);
    for (let x = 4; x < w; x += 4) rect(g, rgb(78, 84, 98), x, 8, 1, 16);
    for (let i = 0; i < 5; i++) rect(g, rgb(150, 120, 70, 0.5), (R() * w) | 0, (R() * h) | 0, 3, 1);
  }],
  bars: [16, 16, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (const x of [2, 6, 10, 14]) rect(g, 'rgb(150,154,164)', x, 0, 1, h);
    rect(g, 'rgb(150,154,164)', 0, 0, w, 1);
  }],
  mat: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [76, 96, 126], 0.14, R);
    rect(g, rgb(30, 36, 52), 0, 0, w, 1); rect(g, rgb(30, 36, 52), 0, 0, 1, h);
    rect(g, rgb(30, 36, 52), 0, 16, w, 1); rect(g, rgb(30, 36, 52), 16, 0, 1, h);
    for (let i = 0; i < 12; i++) rect(g, rgb(200, 200, 190, 0.15), (R() * w) | 0, (R() * h) | 0, 3, 1);
  }],
  sheet: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [188, 176, 150], 0.18, R);
    rect(g, rgb(120, 104, 84, 0.6), 0, 5, w, 1); rect(g, rgb(120, 104, 84, 0.6), 0, 11, w, 1);
    rect(g, rgb(110, 90, 70, 0.5), 9, 7, 3, 3);
  }],
  crate: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [150, 112, 70], 0.24, R);
    rect(g, rgb(50, 34, 20), 0, 0, w, 1); rect(g, rgb(50, 34, 20), 0, 8, w, 1);
    rect(g, rgb(50, 34, 20), 0, 0, 1, h); rect(g, rgb(50, 34, 20), 15, 0, 1, h);
  }],
  hazard: [16, 16, (g, w, h) => {
    rect(g, 'rgb(220,190,60)', 0, 0, w, h);
    g.fillStyle = 'rgb(40,38,34)';
    for (let i = -h; i < w; i += 8) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 4, h); g.lineTo(i + h + 4, 0); g.lineTo(i + h, 0); g.fill(); }
  }],
  burlap: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [176, 150, 104], 0.3, R);
    for (let y = 0; y < h; y += 2) rect(g, rgb(110, 88, 56, 0.5), 0, y, w, 1);
  }],
  rubber: [16, 16, (g, w, h, R) => fill(g, w, h, [70, 70, 76], 0.2, R)],
  fridge: [16, 32, (g, w, h, R) => {
    fill(g, w, h, [226, 222, 200], 0.08, R);
    rect(g, rgb(120, 116, 100), 0, 12, w, 1); // seam
    rect(g, rgb(90, 86, 78), 13, 3, 1, 7); rect(g, rgb(90, 86, 78), 13, 16, 1, 9); // handles
    rect(g, rgb(170, 130, 70, 0.4), 0, h - 4, w, 4);
    for (let i = 0; i < 5; i++) rect(g, rgb(150, 120, 80, 0.35), (R() * w) | 0, (R() * h) | 0, 2, 3);
  }],
  fridgeIn: [16, 32, (g, w, h, R) => {
    fill(g, w, h, [236, 242, 246], 0.06, R);
    for (const y of [7, 15, 23]) { rect(g, rgb(150, 170, 180), 0, y, w, 1); rect(g, rgb(200, 220, 230), 0, y + 1, w, 1); }
    rect(g, rgb(120, 170, 120), 2, 26, 4, 5); // one limp lettuce
  }],
  stove: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [200, 196, 184], 0.08, R);
    rect(g, rgb(40, 40, 40), 3, 3, 4, 4); rect(g, rgb(40, 40, 40), 9, 3, 4, 4);
    rect(g, rgb(60, 56, 50), 2, 10, 12, 5); rect(g, rgb(120, 116, 106), 3, 11, 10, 3);
  }],
  cloth: [16, 16, (g, w, h, R) => fill(g, w, h, [150, 150, 156], 0.26, R)],
  skin: [8, 8, (g, w, h, R) => fill(g, w, h, [196, 160, 130], 0.15, R)],
  strip: [8, 8, (g, w, h) => rect(g, 'rgb(255,255,255)', 0, 0, w, h)],
  pad: [16, 16, (g, w, h, R) => { // training dummy body (canvas wrap)
    fill(g, w, h, [150, 110, 70], 0.22, R);
    rect(g, rgb(60, 40, 24), 0, 5, w, 1); rect(g, rgb(60, 40, 24), 0, 11, w, 1);
    rect(g, rgb(190, 60, 50), 6, 7, 4, 3);
  }],
  dummyHead: [32, 16, (g, w, h, R) => { // equirect: front at x=8, +x temple at x=16, -x temple at x=0/32
    fill(g, w, h, [200, 168, 120], 0.1, R);
    g.fillStyle = 'rgb(200,50,40)';
    rect(g, 'rgb(200,50,40)', 5, 5, 7, 1); // forehead
    rect(g, 'rgb(240,200,50)', 6, 11, 5, 1); // chin
    for (const x of [14, 30]) { rect(g, 'rgb(60,130,220)', x, 6, 3, 3); rect(g, 'rgb(230,230,230)', x + 1, 7, 1, 1); } // temples
  }],
  tape: [8, 8, (g, w, h) => rect(g, 'rgb(240,200,50)', 0, 0, w, h)],
  rug: [16, 16, (g, w, h, R) => {
    fill(g, w, h, [130, 70, 60], 0.2, R);
    rect(g, rgb(210, 180, 120), 0, 0, w, 1); rect(g, rgb(210, 180, 120), 0, h - 1, w, 1);
    rect(g, rgb(210, 180, 120), 0, 0, 1, h); rect(g, rgb(210, 180, 120), w - 1, 0, 1, h);
    rect(g, rgb(210, 180, 120, 0.7), 5, 5, 6, 6);
  }],
};

const cache = new WeakMap();
const dyn = new WeakMap();

/** A named painted texture (cached per renderer object). */
export function tex(r, name) {
  let m = cache.get(r); if (!m) cache.set(r, (m = {}));
  if (m[name]) return m[name];
  const def = PAINT[name]; if (!def) throw new Error('texture? ' + name);
  const [w, h, fn] = def;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  let s = 7; for (const ch of name) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  fn(c.getContext('2d'), w, h, mulberry32(s));
  return (m[name] = canvasTexture(r, c, true));
}

function canvasTexture(r, c, repeat) {
  const T = r.THREE;
  const t = new T.CanvasTexture(c);
  t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.colorSpace = T.NoColorSpace;
  return t;
}

/** Tally marks. `groups` is a list of counts (0 to 9), left to right; the caller decides it. */
export function tallyTexture(r, groups, seed = 1) {
  const n = Math.max(1, groups.length), cw = 22, w = n * cw, h = 52, R = mulberry32(seed * 131 + 5);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  fill(g, w, h, [96, 100, 108], 0.14, R);
  rect(g, 'rgb(52,56,64)', 0, 0, w, 1); rect(g, 'rgb(52,56,64)', 0, h - 1, w, 1);
  const mark = (x, y, len) => { rect(g, 'rgb(225,220,196)', x, y, 1, len); rect(g, 'rgb(150,146,130)', x + 1, y, 1, len); };
  groups.forEach((count, gi) => {
    const x0 = gi * cw + 3;
    if (gi) rect(g, 'rgb(60,64,72)', gi * cw, 4, 1, h - 8); // faint divider scratched in the wall
    for (let row = 0; row < 2; row++) {
      const k = Math.min(5, Math.max(0, count - row * 5)); if (!k) continue;
      const y = 6 + row * 22;
      const bars = Math.min(4, k);
      for (let i = 0; i < bars; i++) mark(x0 + i * 4, y + ((R() * 2) | 0), 15 + ((R() * 2) | 0));
      if (k === 5) for (let i = 0; i < 15; i++) rect(g, 'rgb(225,220,196)', x0 - 1 + i, y + 15 - i, 1, 1);
    }
  });
  return canvasTexture(r, c, false);
}

/** Keypad with 12 keys (1-9, *, 0, #) in a 3x4 grid; the slab around it is dark. */
export function keypadTexture(r) {
  const c = document.createElement('canvas'); c.width = 36; c.height = 48;
  const g = c.getContext('2d');
  rect(g, 'rgb(30,34,42)', 0, 0, 36, 48);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  keys.forEach((k, i) => {
    const x = 2 + (i % 3) * 11, y = 2 + ((i / 3) | 0) * 12;
    rect(g, 'rgb(96,106,124)', x, y, 10, 10); rect(g, 'rgb(150,160,178)', x, y, 10, 1); rect(g, 'rgb(60,66,82)', x, y + 9, 10, 1);
    g.fillStyle = 'rgb(240,240,230)'; g.fillText(k, x + 5, y + 5.5);
  });
  return canvasTexture(r, c, false);
}

/** The cell's panel screen. update(text, t) redraws only when the picture changes. */
export function screenPanel(r) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d'); const t = canvasTexture(r, c, false);
  const st = { text: '', mode: 'idle', key: '' };
  function draw(time) {
    const blink = Math.floor(time * 2) % 2 === 0;
    const key = st.mode + '|' + st.text + '|' + blink;
    if (key === st.key) return; st.key = key;
    rect(g, st.mode === 'ok' ? 'rgb(10,70,40)' : st.mode === 'bad' ? 'rgb(80,16,16)' : 'rgb(8,26,30)', 0, 0, 64, 32);
    for (let y = 0; y < 32; y += 2) rect(g, 'rgba(0,0,0,0.25)', 0, y, 64, 1);
    g.font = 'bold 9px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
    const col = st.mode === 'bad' ? 'rgb(255,120,110)' : 'rgb(110,255,210)';
    g.fillStyle = col;
    if (st.mode === 'idle' || st.mode === 'type') {
      g.fillText('FRASE:', 3, 3);
      g.font = 'bold 7px monospace';
      const s = st.text.slice(-9);
      g.fillText(s + (blink ? '_' : ' '), 3, 17);
    } else g.fillText(st.mode === 'ok' ? 'ABERTO' : 'NEGADO', 6, 11);
    t.needsUpdate = true;
  }
  draw(0);
  return {
    texture: t,
    /** mode: 'idle' | 'type' | 'ok' | 'bad' */
    set(mode, text = '') { st.mode = mode; st.text = text; st.key = ''; },
    update: draw,
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry kit. `kit(r, parent)` returns helpers that build with r.mat only.

export function kit(r, parent) {
  const T = r.THREE;
  const mats = new Map();
  function mat(color, map, o = {}) {
    const key = [color, map ?? '', JSON.stringify(o)].join('|');
    if (mats.has(key)) return mats.get(key);
    const m = r.mat(color, { ...o, map: map ? tex(r, map) : undefined });
    mats.set(key, m); return m;
  }
  const glow = (color, o = {}) => mat(color, null, { emissive: 1, fogged: 0.6, ...o });

  /** Grid rectangle in local space (x, y, normal +z) with uv in tile units; ~1 quad per `step` m. */
  function rectGeo(x0, x1, y0, y1, tile, step = 1) {
    const sx = Math.max(1, Math.ceil((x1 - x0) / step)), sy = Math.max(1, Math.ceil((y1 - y0) / step));
    const pos = [], uv = [], nor = [], idx = [];
    for (let j = 0; j <= sy; j++) for (let i = 0; i <= sx; i++) {
      const x = x0 + ((x1 - x0) * i) / sx, y = y0 + ((y1 - y0) * j) / sy;
      pos.push(x, y, 0); nor.push(0, 0, 1); uv.push(x / tile[0], y / tile[1]);
    }
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i, b = a + 1, c = a + sx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }

  function add(geo, material, pos = [0, 0, 0], rot = [0, 0, 0], to = parent) {
    if (material.side === T.BackSide && geo.attributes.normal && !geo.userData.inward) { // seen from inside: light it as such
      const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
      geo.userData.inward = true;
    }
    const m = new T.Mesh(geo, material); m.position.set(...pos); m.rotation.set(...rot); to.add(m); return m;
  }

  /** Wall in a local frame: x in [-w/2, w/2], y in [0, h], facing local +z. Holes are cut out. */
  function wall({ pos, ry = 0, w, h, material, tile = [2, 2], holes = [], step = 1 }) {
    const grp = new T.Group(); grp.position.set(...pos); grp.rotation.y = ry; parent.add(grp);
    const X0 = -w / 2, X1 = w / 2;
    const sorted = holes.slice().sort((a, b) => a.x0 - b.x0);
    let cursor = X0;
    for (const hl of sorted) {
      if (hl.x0 > cursor + 1e-3) add(rectGeo(cursor, hl.x0, 0, h, tile, step), material, [0, 0, 0], [0, 0, 0], grp);
      if (hl.y0 > 1e-3) add(rectGeo(hl.x0, hl.x1, 0, hl.y0, tile, step), material, [0, 0, 0], [0, 0, 0], grp);
      if (hl.y1 < h - 1e-3) add(rectGeo(hl.x0, hl.x1, hl.y1, h, tile, step), material, [0, 0, 0], [0, 0, 0], grp);
      cursor = hl.x1;
    }
    if (cursor < X1 - 1e-3) add(rectGeo(cursor, X1, 0, h, tile, step), material, [0, 0, 0], [0, 0, 0], grp);
    return grp;
  }

  /** Horizontal rectangle at height y. up=true is a floor (faces up), false a ceiling (faces down). */
  function floor({ x0, x1, z0, z1, y = 0, material, tile = [2, 2], step = 1, up = true }) {
    if (up) return add(rectGeo(x0, x1, -z1, -z0, tile, step), material, [0, y, 0], [-Math.PI / 2, 0, 0]);
    return add(rectGeo(x0, x1, z0, z1, tile, step), material, [0, y, 0], [Math.PI / 2, 0, 0]);
  }

  /** Box with uv in tile units per face (world metres / tile). */
  function boxGeo(w, h, d, tile = [1, 1]) {
    const g = new T.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile[0], uv.getY(i) * dims[f][1] / tile[1]);
    }
    return g;
  }
  const box = (size, material, pos, rot, tile, to) => add(boxGeo(...size, tile), material, pos, rot, to);
  const cyl = (rt, rb, h, seg, material, pos, rot, to, scaleUV = 1) => {
    const g = new T.CylinderGeometry(rt, rb, h, seg);
    if (scaleUV !== 1) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scaleUV, uv.getY(i) * scaleUV); }
    return add(g, material, pos, rot, to);
  };
  const sphere = (rad, material, pos, sc = [1, 1, 1], ws = 6, hs = 4, to) => {
    const m = add(new T.SphereGeometry(rad, ws, hs), material, pos, [0, 0, 0], to); m.scale.set(...sc); return m;
  };

  /** Cone of light: a see-through open cylinder from a lamp (y) down to the floor. */
  function shaft(x, y, z, radTop, radBot, color = '#ffe2a8', op = 0.07) {
    const m = add(new T.CylinderGeometry(radTop, radBot, y, 8, 1, true),
      r.mat(color, { emissive: 1, opacity: op, transparent: true, depthWrite: false, fogged: 0 }), [x, y / 2, z]);
    m.renderOrder = 3; return m;
  }

  /** Mark a material as a decal laid over a surface (vertex snapping breaks coplanar depth). */
  function decal(material, n = -4) { material.polygonOffset = true; material.polygonOffsetFactor = n; material.polygonOffsetUnits = n; return material; }

  return { T, shaft, decal, mat, glow, rectGeo, add, wall, floor, boxGeo, box, cyl, sphere, group: parent };
}

/** Rotate local wall coordinates to world, for anchors: wall at pos with yaw ry. */
export function toWorld(pos, ry, lx, ly, lz = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [pos[0] + lx * c + lz * s, pos[1] + ly, pos[2] - lx * s + lz * c];
}

/** Scene light rig: applies fog/ambient and up to 4 point lights to the shared renderer uniforms. */
export function rig(r, cfg) {
  const T = r.THREE;
  const L = { ...cfg, points: cfg.points.map((p) => ({ ...p })) };
  const col = (p, k = 1) => new T.Color(p.hex).multiplyScalar(p.k * k);
  L.apply = () => {
    r.light({ ambient: L.ambient, key: L.key, fog: L.fog, fogNear: L.fogNear, fogFar: L.fogFar });
    L.points.forEach((p, i) => r.point(i, { pos: p.pos, color: col(p), range: p.range }));
    for (let i = L.points.length; i < 4; i++) r.point(i, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 });
  };
  /** Change the strength of point i by a factor (a pure function of time in update). */
  L.level = (i, f) => r.point(i, { color: col(L.points[i], f) });
  L.apply();
  return L;
}
