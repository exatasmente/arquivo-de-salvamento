// Painted textures, pictograms, the seven-segment display and the merging builder of the posto.
// Everything is drawn in code on tiny canvases (16 to 64 px) and sampled with NearestFilter.
// No Math.random: every painter is a pure function of its name (or of the seed it receives).
// Modules never import three directly: they use r.THREE and r.mat (the PS1 material of the render).

export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (list) => list[Math.floor(r() * list.length)];
  return r;
}

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
const spots = (g, w, h, R, n, col, wmax, hmax) => { for (let i = 0; i < n; i++) rect(g, col, (R() * w) | 0, (R() * h) | 0, 1 + ((R() * wmax) | 0), 1 + ((R() * hmax) | 0)); };

// ---------------------------------------------------------------------------------------------
// Fuels: colour and pictogram of each. The colour is the nozzle's, the car's sticker and the sign's.
export const FUEL = {
  comum: { color: '#b3362e', cell: 0, label: 'comum' },
  aditivada: { color: '#3f68b0', cell: 1, label: 'aditivada' },
  etanol: { color: '#4f8a4a', cell: 2, label: 'etanol' },
  diesel: { color: '#303036', cell: 3, label: 'diesel' },
};
export const FUEL_KEYS = Object.keys(FUEL);

// 16x16 pixel pictograms, white on the fuel colour. 'x' = ink.
const PICTO = {
  comum: ['................', '.......xx.......', '......xxxx......', '......xxxx......', '.....xxxxxx.....', '.....xxxxxx.....', '....xxxxxxxx....', '....xxxxxxxx....', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '....xxxxxxxx....', '.....xxxxxx.....', '................', '................'],
  aditivada: ['.......xx.......', '......xxxx......', '......xxxx...x..', '.....xxxxxx.xxx.', '.....xxxxxx..x..', '....xxxxxxxx....', '....xxxxxxxx....', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '....xxxxxxxx....', '.....xxxxxx.....', '................', '................', '................'],
  etanol: ['................', '.............xx.', '...........xxxx.', '.........xxxxxx.', '.......xxxxxxx..', '.....xxxxxxxx...', '....xxxxxxxx....', '...xxxxxxxx.....', '..xxxxxxxx......', '..xxxxxxx.......', '.xxxxxx.........', '.xxxx...........', 'xxx.............', 'xx..............', '................', '................'],
  diesel: ['................', '................', '................', '.xxxxxxxxxxx....', '.xxxxxxxxxxxxx..', '.xxxxxxxxxxxxxx.', '.xxxxxxxxxxxxxx.', '.xxxxxxxxxxxxxx.', '.xxxxxxxxxxxxxx.', '.xxxxxxxxxxxxxx.', '..xx......xx....', '.xxxx....xxxx...', '.xxxx....xxxx...', '..xx......xx....', '................', '................'],
};

/** Paint the sticker of a fuel (colour square, light border, pictogram) at (x, y), 16x16 px. */
export function paintFuel(g, x, y, key) {
  const f = FUEL[key];
  rect(g, f.color, x, y, 16, 16);
  rect(g, 'rgb(236,228,200)', x, y, 16, 1); rect(g, 'rgb(236,228,200)', x, y + 15, 16, 1);
  rect(g, 'rgb(236,228,200)', x, y, 1, 16); rect(g, 'rgb(236,228,200)', x + 15, y, 1, 16);
  g.fillStyle = 'rgb(246,242,226)';
  PICTO[key].forEach((row, j) => { for (let i = 0; i < 16; i++) if (row[i] === 'x') g.fillRect(x + i, y + j, 1, 1); });
}
/** u, v bounds (0..1, v up) of the fuel's cell in the 'fuel' atlas (2x2 cells). */
export function fuelUV(key) {
  const c = FUEL[key].cell, cx = c % 2, cy = (c / 2) | 0;
  return [cx * 0.5, 1 - (cy + 1) * 0.5, (cx + 1) * 0.5, 1 - cy * 0.5];
}

// ---------------------------------------------------------------------------------------------
// Seven segments. Segments: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle.
export const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', b: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg', h: 'cefg', L: 'def', O: 'abcdef', o: 'cdeg',
  P: 'abefg', r: 'eg', S: 'acdfg', U: 'bcdef', u: 'cde', '-': 'g', _: 'd', ' ': '',
};
/** Draw one digit in a w x h box at (x, y); thickness t. */
export function drawSeg(g, x, y, w, h, ch, on, off, t = 2) {
  const lit = SEG[ch] ?? '';
  const hh = (h - 3 * t) >> 1;
  const S = {
    a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + t + hh, w - 2 * t, t],
    f: [x, y + t / 2, t, hh + t], b: [x + w - t, y + t / 2, t, hh + t],
    e: [x, y + t + hh + t / 2, t, hh + t], c: [x + w - t, y + t + hh + t / 2, t, hh + t],
  };
  for (const k of 'abcdefg') rect(g, lit.includes(k) ? on : off, ...S[k]);
}

/** The pump's display: 5 digits (up to 999,99) in an 84x24 panel; ',' and '.' attach to the previous digit. set(text) redraws. */
export function createDisplay(r, w = 84, h = 24) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), T = r.THREE;
  const t = new T.CanvasTexture(c);
  t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.NoColorSpace;
  const api = {
    texture: t, canvas: c, text: '',
    set(text) {
      api.text = String(text);
      const toks = [];
      for (const ch of api.text) {
        if ((ch === ',' || ch === '.') && toks.length) toks[toks.length - 1].dp = true;
        else toks.push({ ch, dp: false });
      }
      const cells = 5, cw = (w - 4) / cells;
      rect(g, 'rgb(20,10,8)', 0, 0, w, h);
      const shown = toks.slice(-cells), first = cells - shown.length;
      if (shown.length === cells && shown[0].ch === '0' && !shown[0].dp) shown[0] = { ch: ' ', dp: false }; // a value under 100 leaves the first cell dark, never a zero
      for (let i = 0; i < cells; i++) {
        const tk = i >= first ? shown[i - first] : { ch: ' ', dp: false };
        const x = 2 + i * cw;
        drawSeg(g, x + 1, 3, cw - 4, h - 6, tk.ch, 'rgb(255,128,40)', 'rgb(52,22,12)', 2);
        rect(g, tk.dp ? 'rgb(255,128,40)' : 'rgb(52,22,12)', x + cw - 3, h - 6, 2, 3);
      }
      t.needsUpdate = true;
    },
  };
  api.set('0,00');
  return api;
}

// ---------------------------------------------------------------------------------------------
// The Sun of the advertisement (D2): a flat drawing, never a doll. smile 0..1 widens the grin.
export function paintSol(g, n, smile = 0, dimRay = -1) {
  g.clearRect(0, 0, n, n);
  const c = n / 2, rIn = n * 0.30, rOut = n * 0.48, rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2, da = Math.PI / rays * 0.75;
    g.fillStyle = i === dimRay ? 'rgb(96,66,28)' : 'rgb(222,150,40)';
    g.beginPath();
    g.moveTo(c + Math.cos(a - da) * rIn * 1.05, c + Math.sin(a - da) * rIn * 1.05);
    g.lineTo(c + Math.cos(a) * rOut, c + Math.sin(a) * rOut);
    g.lineTo(c + Math.cos(a + da) * rIn * 1.05, c + Math.sin(a + da) * rIn * 1.05);
    g.fill();
  }
  g.fillStyle = 'rgb(90,56,20)'; g.beginPath(); g.arc(c, c, rIn + 1, 0, 7); g.fill();
  g.fillStyle = 'rgb(236,184,52)'; g.beginPath(); g.arc(c, c, rIn, 0, 7); g.fill();
  // eyes: two ink arcs, a little too wide apart
  g.fillStyle = 'rgb(70,40,16)';
  const ex = n * 0.105, ey = c - n * 0.07, ew = Math.max(2, n * 0.07);
  g.fillRect(c - ex - ew, ey, ew * 2, Math.max(1, n * 0.03)); g.fillRect(c + ex - ew, ey, ew * 2, Math.max(1, n * 0.03));
  g.fillRect(c - ex - ew, ey - 1, 1, 1); g.fillRect(c + ex + ew - 1, ey - 1, 1, 1);
  // mouth: grows from a small curve to a grin wider than the face
  const mw = n * (0.13 + 0.28 * smile), my = c + n * 0.06, mh = n * (0.05 + 0.09 * smile);
  g.fillStyle = 'rgb(60,26,14)';
  for (let x = -mw; x <= mw; x++) {
    const k = Math.abs(x) / mw, yy = my + mh * (1 - k * k) * 0.0 + (k * k) * -mh * 0.6;
    g.fillRect(Math.round(c + x), Math.round(yy), 1, Math.max(1, Math.round(mh * (1 - k * k) + 1)));
  }
  if (smile > 0.3) { // teeth: irregular light blocks along the grin
    g.fillStyle = 'rgb(226,214,184)';
    const nt = 4 + Math.round(smile * 6);
    for (let i = 0; i < nt; i++) {
      const x = -mw * 0.8 + (i / (nt - 1)) * mw * 1.6, k = Math.abs(x) / mw;
      g.fillRect(Math.round(c + x - 1), Math.round(my - mh * 0.6 * k * k + 1), 2, 1 + (i % 2) + (smile > 0.7 ? 1 : 0));
    }
  }
}

// ---------------------------------------------------------------------------------------------
const wallTile = (g, w, h, R, base, band) => {
  fill(g, w, h, base, 0.14, R);
  rect(g, rgb(...band), 0, h - 11, w, 11);
  rect(g, rgb(60, 42, 28), 0, h - 12, w, 1);
  spots(g, w, h, R, 7, rgb(96,76,44,0.35), 7, 5);
  let x = 6 + ((R() * 20) | 0);
  for (let y = 0; y < h - 12; y++) { rect(g, rgb(80,62,40,0.6), x, y, 1, 1); x += R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0; }
};

// [width, height, painter(g, w, h, R)]
const PAINT = {
  wall: [32, 32, (g, w, h, R) => wallTile(g, w, h, R, [196, 158, 88], [112, 78, 52])],
  wallIn: [32, 32, (g, w, h, R) => wallTile(g, w, h, R, [178, 150, 98], [120, 92, 62])],
  wallDark: [32, 32, (g, w, h, R) => wallTile(g, w, h, R, [150, 130, 96], [88, 66, 46])],
  tileWall: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [196, 196, 176], 0.1, R);
    for (let y = 0; y < h; y += 8) rect(g, rgb(110,110,96), 0, y, w, 1);
    for (let x = 0; x < w; x += 8) rect(g, rgb(110,110,96), x, 0, 1, h);
    spots(g, w, h, R, 6, rgb(110,96,60,0.4), 4, 3);
  }],
  asphalt: [32, 32, (g, w, h, R) => { fill(g, w, h, [84, 86, 94], 0.3, R); spots(g, w, h, R, 14, rgb(50,50,56,0.7), 3, 2); spots(g, w, h, R, 6, rgb(120,120,126,0.5), 2, 1); rect(g, rgb(40,40,46), 6, 0, 1, h); }],
  gravel: [32, 32, (g, w, h, R) => { fill(g, w, h, [128, 110, 88], 0.4, R); spots(g, w, h, R, 24, rgb(160,146,120,0.8), 2, 2); spots(g, w, h, R, 16, rgb(70,60,48,0.8), 2, 1); }],
  grass: [32, 32, (g, w, h, R) => { fill(g, w, h, [70, 92, 48], 0.32, R); for (let i = 0; i < 26; i++) rect(g, rgb(44,62,32,0.9), (R() * w) | 0, (R() * h) | 0, 1, 2 + ((R() * 3) | 0)); spots(g, w, h, R, 8, rgb(120,124,66,0.7), 1, 2); }],
  tileStore: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [208, 190, 156], 0.14, R);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if ((x + y) & 1) rect(g, rgb(128,98,66,0.7), x * 16, y * 16, 16, 16);
    rect(g, rgb(70,60,46), 0, 0, w, 1); rect(g, rgb(70,60,46), 0, 16, w, 1); rect(g, rgb(70,60,46), 0, 0, 1, h); rect(g, rgb(70,60,46), 16, 0, 1, h);
    spots(g, w, h, R, 6, rgb(80,64,44,0.45), 4, 2);
  }],
  tileBath: [32, 32, (g, w, h, R) => {
    fill(g, w, h, [186, 192, 176], 0.14, R);
    for (let k = 0; k < 32; k += 8) { rect(g, rgb(96,100,88), 0, k, w, 1); rect(g, rgb(96,100,88), k, 0, 1, h); }
    spots(g, w, h, R, 8, rgb(110,100,60,0.5), 4, 3);
  }],
  concrete: [32, 32, (g, w, h, R) => { fill(g, w, h, [138, 134, 126], 0.22, R); rect(g, rgb(70,68,64), 0, 0, w, 1); rect(g, rgb(70,68,64), 0, 0, 1, h); spots(g, w, h, R, 10, rgb(86,84,78,0.5), 5, 4); rect(g, rgb(120,86,40,0.5), 4, 20, 3, 6); }],
  carpet: [16, 16, (g, w, h, R) => { fill(g, w, h, [104, 86, 62], 0.3, R); spots(g, w, h, R, 6, rgb(70,56,40,0.6), 2, 2); }],
  ceiling: [16, 16, (g, w, h, R) => { fill(g, w, h, [190, 182, 160], 0.1, R); rect(g, rgb(110,104,88), 0, 0, w, 1); rect(g, rgb(110,104,88), 0, 0, 1, h); spots(g, w, h, R, 3, rgb(120,100,60,0.5), 3, 3); }],
  canopyBand: [16, 16, (g, w, h, R) => { fill(g, w, h, [200, 160, 78], 0.1, R); rect(g, rgb(104,70,44), 0, 10, w, 3); rect(g, rgb(60,42,28), 0, 13, w, 1); spots(g, w, h, R, 3, rgb(120,100,60,0.5), 4, 2); }],
  canopyUnder: [32, 32, (g, w, h, R) => { fill(g, w, h, [150, 126, 92], 0.14, R); for (let x = 0; x < w; x += 8) rect(g, rgb(86,70,50), x, 0, 1, h); spots(g, w, h, R, 6, rgb(90,76,50,0.5), 4, 3); }],
  column: [16, 16, (g, w, h, R) => { fill(g, w, h, [190, 150, 80], 0.14, R); rect(g, rgb(104,70,44), 0, 10, w, 6); spots(g, w, h, R, 4, rgb(80,60,36,0.5), 2, 4); }],
  steel: [32, 32, (g, w, h, R) => { fill(g, w, h, [150, 150, 146], 0.16, R); rect(g, rgb(86,86,84), 0, 0, w, 1); rect(g, rgb(86,86,84), 0, 0, 1, h); spots(g, w, h, R, 6, rgb(120,90,50,0.4), 2, 4); }],
  shelf: [32, 32, (g, w, h, R) => { fill(g, w, h, [134, 140, 130], 0.14, R); rect(g, rgb(70,76,70), 0, 0, 1, h); rect(g, rgb(70,76,70), 0, 0, w, 1); for (let y = 4; y < h; y += 8) rect(g, rgb(94,100,92), 0, y, w, 1); }],
  wood: [32, 32, (g, w, h, R) => { fill(g, w, h, [146, 104, 64], 0.22, R); for (let y = 0; y < h; y += 8) rect(g, rgb(60,40,24), 0, y, w, 1); spots(g, w, h, R, 8, rgb(110,74,44,0.8), 8, 1); }],
  doorWood: [16, 32, (g, w, h, R) => { fill(g, w, h, [150, 108, 66], 0.18, R); rect(g, rgb(70,46,28), 0, 0, w, 1); rect(g, rgb(70,46,28), 0, 0, 1, h); rect(g, rgb(70,46,28), w - 1, 0, 1, h); rect(g, rgb(112,76,44), 3, 3, w - 6, 10); rect(g, rgb(112,76,44), 3, 17, w - 6, 12); rect(g, rgb(196,176,90), w - 4, 15, 2, 2); }],
  doorMetal: [16, 32, (g, w, h, R) => { fill(g, w, h, [128, 132, 126], 0.14, R); rect(g, rgb(70,74,70), 0, 0, w, 1); rect(g, rgb(70,74,70), 0, 0, 1, h); rect(g, rgb(70,74,70), w - 1, 0, 1, h); rect(g, rgb(196,176,90), w - 4, 15, 2, 2); spots(g, w, h, R, 6, rgb(120,80,40,0.5), 2, 4); }],
  cardboard: [16, 16, (g, w, h, R) => { fill(g, w, h, [176, 138, 90], 0.22, R); rect(g, rgb(108,80,50), 0, 7, w, 2); spots(g, w, h, R, 4, rgb(120,90,60,0.5), 4, 2); }],
  counter: [32, 32, (g, w, h, R) => { fill(g, w, h, [168, 132, 88], 0.12, R); rect(g, rgb(86,60,36), 0, 0, w, 1); rect(g, rgb(86,60,36), 0, 0, 1, h); rect(g, rgb(208,186,140), 0, 1, w, 2); spots(g, w, h, R, 6, rgb(110,80,50,0.5), 4, 2); }],
  plastic: [16, 16, (g, w, h, R) => { fill(g, w, h, [196, 186, 160], 0.1, R); rect(g, rgb(120,112,92), 0, 0, w, 1); }],
  rubber: [16, 16, (g, w, h, R) => fill(g, w, h, [46, 46, 50], 0.2, R)],
  fridge: [32, 32, (g, w, h, R) => { fill(g, w, h, [210, 206, 184], 0.08, R); rect(g, rgb(100,96,86), 0, 0, w, 1); rect(g, rgb(190,150,70), 0, h - 5, w, 5); spots(g, w, h, R, 4, rgb(150,120,80,0.35), 2, 3); }],
  curb: [16, 16, (g, w, h) => { rect(g, 'rgb(212,176,70)', 0, 0, w, h); g.fillStyle = 'rgb(40,36,30)'; for (let i = -h; i < w; i += 8) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 4, h); g.lineTo(i + h + 4, 0); g.lineTo(i + h, 0); g.fill(); } }],
  lineW: [8, 8, (g, w, h) => rect(g, 'rgb(214,208,190)', 0, 0, w, h)],
  lineY: [8, 8, (g, w, h) => rect(g, 'rgb(220,176,56)', 0, 0, w, h)],
  road: [32, 32, (g, w, h, R) => { fill(g, w, h, [58, 60, 68], 0.26, R); spots(g, w, h, R, 12, rgb(36,36,42,0.7), 3, 2); }],
  fence: [16, 16, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgb(130,128,120)'; g.lineWidth = 1; for (let i = -h; i < w + h; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } }],
  glassDoor: [16, 32, (g, w, h) => { g.clearRect(0, 0, w, h); rect(g, 'rgb(120,92,60)', 0, 0, w, 2); rect(g, 'rgb(120,92,60)', 0, h - 3, w, 3); rect(g, 'rgb(120,92,60)', 0, 0, 2, h); rect(g, 'rgb(120,92,60)', w - 2, 0, 2, h); rect(g, 'rgb(220,214,200)', w - 5, 14, 1, 6); }],
  grid: [16, 16, (g, w, h, R) => { fill(g, w, h, [60, 66, 70], 0.2, R); rect(g, rgb(110,116,120), 0, 0, w, 1); rect(g, rgb(110,116,120), 0, 8, w, 1); }],
  mirror: [16, 16, (g, w, h, R) => { fill(g, w, h, [150, 168, 176], 0.1, R); rect(g, rgb(200,214,220), 2, 2, 4, 1); rect(g, rgb(200,214,220), 3, 3, 1, 3); rect(g, rgb(90,70,50), 0, 0, w, 1); rect(g, rgb(90,70,50), 0, h - 1, w, 1); rect(g, rgb(90,70,50), 0, 0, 1, h); rect(g, rgb(90,70,50), w - 1, 0, 1, h); }],
  porcelain: [16, 16, (g, w, h, R) => fill(g, w, h, [214, 214, 200], 0.08, R)],
  green: [16, 16, (g, w, h, R) => { fill(g, w, h, [78, 98, 70], 0.2, R); rect(g, rgb(40,54,38), 0, 0, w, 1); spots(g, w, h, R, 4, rgb(120,90,50,0.5), 2, 3); }],
  stain: [16, 16, (g, w, h, R) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(40,34,24,0.9)'; for (let i = 0; i < 40; i++) rect(g, 'rgba(40,34,24,0.9)', 3 + ((R() * 10) | 0), 3 + ((R() * 10) | 0), 2, 2); }],
  paperSol: [32, 32, (g, w, h, R) => { fill(g, w, h, [196, 170, 110], 0.1, R); g.save(); g.translate(4, 4); g.scale(24 / 64, 24 / 64); const c = document.createElement('canvas'); c.width = c.height = 64; paintSol(c.getContext('2d'), 64, 0.2); g.drawImage(c, 0, 0); g.restore(); spots(g, w, h, R, 8, rgb(110,90,50,0.45), 4, 3); }],
  fuel: [32, 32, (g) => { FUEL_KEYS.forEach((k, i) => paintFuel(g, (i % 2) * 16, ((i / 2) | 0) * 16, k)); }],
  screenOff: [16, 16, (g, w, h, R) => fill(g, w, h, [18, 30, 24], 0.3, R)],
  solSticker: [16, 16, (g) => paintSol(g, 16, 0.2)],
  // die-cut sticker of the Sun (a cream edge round the flat advertisement), a little peeled at the rim
  adesivoSol: [32, 32, (g, w, h, R) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgb(232,222,190)'; g.beginPath(); g.arc(16, 16, 15.5, 0, 7); g.fill();
    const c = document.createElement('canvas'); c.width = c.height = 64; paintSol(c.getContext('2d'), 64, 0.2); g.drawImage(c, 1, 1, 30, 30);
    for (let i = 0; i < 5; i++) g.clearRect(2 + ((R() * 28) | 0), 2 + ((R() * 28) | 0), 1, 1);
  }],
  // wired glass: a square mesh of thin light wire, the rest cut away
  aramado: [16, 16, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgb(150,152,140)'; for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }],
  // the soft puffs of the coffee machine's steam (cut by alpha, no blur)
  vapor: [16, 16, (g, w, h, R) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgb(236,236,228)';
    for (let i = 0; i < 7; i++) { const x = 3 + ((R() * 8) | 0), y = 1 + i * 2, s = 3 + ((R() * 3) | 0); g.fillRect(x, y, s, 2); }
    g.fillRect(6, 0, 3, 16);
  }],
  // the keys of the pump panel (160x32): digits 0-9 on the top row, then a blank cap, CANCELAR and LIGAR
  teclado: [160, 32, (g) => paintTeclado(g)],
  // the same 4x4 atlas of products, as the packaging looked in 1998: flat colours, stripes and the Sun on everything
  produtos98: [64, 64, (g, _w, _h, R) => paintProdutos98(g, R)],
  // product atlas: 4x4 cells of 16 px. The first two rows of each cell are the cap or lid.
  produtos: [64, 64, (g, _w, _h, R) => paintProdutos(g, R)],
  caixas: [64, 64, (g, _w, _h, R) => paintCaixas(g, R)],
};

// ---------------------------------------------------------------------------------------------
// A 3x5 pixel font for the keys of the pump panel (digits and the letters of LIGAR and CANCELAR).
const FONT35 = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  L: '100100100100111', I: '111010010010111', G: '111100101101111', A: '010101111101101', R: '110101110101101', C: '111100100100111', N: '101111111111101', E: '111100110100111' };
/** Draw `text` in the 3x5 font at (x, y), each pixel `s` big. Returns the width drawn. */
export function drawFont35(g, text, x, y, color, s = 1) {
  g.fillStyle = color;
  [...text].forEach((ch, ci) => { const bits = FONT35[ch]; if (bits) for (let q = 0; q < 15; q++) if (bits[q] === '1') g.fillRect(x + (ci * 4 + (q % 3)) * s, y + ((q / 3) | 0) * s, s, s); });
  return (text.length * 4 - 1) * s;
}
/** Where each key sits in the 'teclado' atlas: [x, y, w, h] in pixels. */
export const TECLADO_CELLS = (() => {
  const c = {}; for (let d = 0; d < 10; d++) c[String(d)] = [d * 16, 0, 16, 16];
  c.vazio = [0, 16, 16, 16]; c.cancelar = [16, 16, 48, 16]; c.ligar = [64, 16, 48, 16];
  return c;
})();
/** u0, v0, u1, v1 (v up) of a cell of the 'teclado' atlas, pulled in half a texel. */
export function tecladoUV(name) {
  const [x, y, w, h] = TECLADO_CELLS[name], e = 0.4;
  return [(x + e) / 160, 1 - (y + h - e) / 32, (x + w - e) / 160, 1 - (y + e) / 32];
}
function paintTeclado(g) {
  g.clearRect(0, 0, 160, 32);
  const cap = (name, bg, ink, label, sc = 1) => {
    const [x, y, w, h] = TECLADO_CELLS[name];
    rect(g, bg, x, y, w, h); rect(g, 'rgba(0,0,0,0.28)', x, y + h - 2, w, 2); rect(g, 'rgba(0,0,0,0.28)', x + w - 2, y, 2, h); rect(g, 'rgba(255,255,255,0.22)', x, y, w, 1);
    if (!label) return;
    const tw = (label.length * 4 - 1) * sc, th = 5 * sc;
    const x0 = x + ((w - tw) >> 1) + (name === 'cancelar' ? 3 : 0), y0 = y + ((h - 2 - th) >> 1);
    drawFont35(g, label, x0, y0, ink, sc);
    if (name === 'cancelar') { g.fillStyle = ink; for (let k = 0; k < 5; k++) { g.fillRect(x + 3 + k, y0 + k, 1, 1); g.fillRect(x + 7 - k, y0 + k, 1, 1); } } // an X before the word
  };
  for (let d = 0; d < 10; d++) cap(String(d), 'rgb(216,206,172)', 'rgb(42,38,34)', String(d), 2);
  cap('vazio', 'rgb(200,190,158)', '', '');
  cap('cancelar', 'rgb(168,54,42)', 'rgb(240,230,204)', 'CANCELAR');
  cap('ligar', 'rgb(62,126,62)', 'rgb(240,230,204)', 'LIGAR', 2);
}

// Packaging of 1998 for the "old" products (same cell layout as 'produtos'): a faded colour, two stripes, the Sun of the ad.
function paintProdutos98(g, R) {
  const pal = [['#e6d6a2', '#d8782a', '#7a3a1a'], ['#e6d6a2', '#3a8a86', '#1c3a38'], ['#d8b43c', '#a8442a', '#4a1a10'], ['#ece0b8', '#c8902a', '#6a3a14'],
    ['#e6d6a2', '#5a8a44', '#1c3a1c'], ['#d8b43c', '#b8503a', '#40201a'], ['#ece0b8', '#3c5c9a', '#14203e'], ['#e6d6a2', '#c8642a', '#5a2a10']];
  const sun = document.createElement('canvas'); sun.width = sun.height = 32; paintSol(sun.getContext('2d'), 32, 0.2);
  for (let i = 0; i < 16; i++) {
    const [x, y] = CELL(i), [cap, body, ink] = pal[i % pal.length];
    rect(g, cap, x, y, 16, 2); rect(g, body, x, y + 2, 16, 14);
    rect(g, ink, x, y + 2, 16, 1); rect(g, ink, x, y + 15, 16, 1);
    if (i % 2) { rect(g, 'rgba(255,240,200,0.55)', x, y + 4, 16, 2); } else { rect(g, 'rgba(255,240,200,0.55)', x, y + 12, 16, 2); }
    g.drawImage(sun, x + 3, y + 5, 10, 10);
    for (let k = 0; k < 6; k++) rect(g, 'rgba(0,0,0,0.14)', x + ((R() * 16) | 0), y + 2 + ((R() * 14) | 0), 2, 1);
    for (let k = 0; k < 3; k++) rect(g, 'rgba(236,226,196,0.35)', x + ((R() * 16) | 0), y + 2 + ((R() * 14) | 0), 1, 3);
  }
}

const CELL = (i) => [(i % 4) * 16, ((i / 4) | 0) * 16];
function paintProdutos(g, R) {
  const cells = [
    // [cap, body, accent, shape]
    ['#d8d4c4', '#5a8ec0', '#e8e4d4', 'drop'], ['#7a1e14', '#8a4a24', '#e0b84a', 'dots'], ['#d8d4c4', '#d8902a', '#78a43c', 'bars'],
    ['#b8b8b0', '#a83c2a', '#e6dcc0', 'band'], ['#b8b8b0', '#3c5c9a', '#e6dcc0', 'band'], ['#b8b8b0', '#5a8a44', '#e6dcc0', 'band'],
    ['#c8a040', '#d0902a', '#a83020', 'tri'], ['#c8a040', '#5a8a44', '#e8d870', 'tri'], ['#c8a040', '#a83c2a', '#e8d870', 'tri'],
    ['#8a7a60', '#3c5c9a', '#e6d8b0', 'cookie'], ['#8a7a60', '#7a5028', '#e6d8b0', 'cookie'], ['#8a7a60', '#c07a8a', '#e6d8b0', 'cookie'],
    ['#d0a830', '#d8b43c', '#3a2a14', 'drop'], ['#2a2a30', '#34343c', '#c8902a', 'car'], ['#c89a30', '#d6b060', '#8a5a1c', 'sol'], ['#8a7a60', '#b08a58', '#6a4a2a', 'plain'],
  ];
  cells.forEach(([cap, body, acc, shape], i) => {
    const [x, y] = CELL(i);
    rect(g, cap, x, y, 16, 2); rect(g, body, x, y + 2, 16, 14);
    for (let k = 0; k < 10; k++) rect(g, 'rgba(0,0,0,0.12)', x + ((R() * 16) | 0), y + 2 + ((R() * 14) | 0), 2, 1);
    g.fillStyle = acc;
    if (shape === 'drop') { g.fillRect(x + 6, y + 6, 4, 6); g.fillRect(x + 7, y + 4, 2, 2); }
    else if (shape === 'dots') for (let k = 0; k < 6; k++) g.fillRect(x + 2 + (k % 3) * 5, y + 5 + ((k / 3) | 0) * 5, 3, 3);
    else if (shape === 'bars') { g.fillRect(x + 2, y + 6, 12, 2); g.fillRect(x + 2, y + 10, 12, 2); }
    else if (shape === 'band') { g.fillRect(x, y + 6, 16, 5); }
    else if (shape === 'tri') { g.beginPath(); g.moveTo(x + 8, y + 4); g.lineTo(x + 13, y + 13); g.lineTo(x + 3, y + 13); g.fill(); }
    else if (shape === 'cookie') { g.beginPath(); g.arc(x + 8, y + 9, 4, 0, 7); g.fill(); rect(g, '#3a2a14', x + 6, y + 8, 1, 1); rect(g, '#3a2a14', x + 9, y + 10, 1, 1); }
    else if (shape === 'car') { g.fillRect(x + 3, y + 8, 10, 3); g.fillRect(x + 5, y + 6, 6, 2); }
    else if (shape === 'sol') { g.beginPath(); g.arc(x + 8, y + 9, 4, 0, 7); g.fill(); rect(g, '#f0c040', x + 6, y + 7, 4, 4); }
    else { g.fillRect(x + 3, y + 8, 10, 1); }
  });
}
// 12 numbered cardboard faces (cells 0..11, number drawn with seven segments) and 4 plain cells
function paintCaixas(g, R) {
  for (let i = 0; i < 16; i++) {
    const [x, y] = CELL(i);
    rect(g, i < 12 ? '#b08a58' : '#a07c4c', x, y, 16, 16);
    for (let k = 0; k < 8; k++) rect(g, 'rgba(90,64,36,0.35)', x + ((R() * 16) | 0), y + ((R() * 16) | 0), 3, 1);
    rect(g, '#6a4a2a', x, y + 7, 16, 2);
    if (i < 12) {
      rect(g, '#e6dcc0', x + 2, y + 2, 12, 12);
      rect(g, '#6a4a2a', x + 2, y + 2, 12, 1);
      const n = String(i + 1);
      if (n.length === 1) drawSeg(g, x + 5, y + 4, 6, 8, n, 'rgb(40,28,20)', 'rgb(214,204,176)', 2);
      else { drawSeg(g, x + 3, y + 4, 5, 8, n[0], 'rgb(40,28,20)', 'rgb(214,204,176)', 1); drawSeg(g, x + 9, y + 4, 5, 8, n[1], 'rgb(40,28,20)', 'rgb(214,204,176)', 1); }
    }
  }
}

const cache = new WeakMap();
export function canvasTexture(r, c, repeat = false) {
  const T = r.THREE, t = new T.CanvasTexture(c);
  t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.colorSpace = T.NoColorSpace;
  return t;
}
/** A named painted texture, cached per render object. */
export function tex(r, name) {
  let m = cache.get(r); if (!m) cache.set(r, (m = {}));
  if (m[name]) return m[name];
  const def = PAINT[name]; if (!def) throw new Error('textura? ' + name);
  const [w, h, fn] = def;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  let s = 7; for (const ch of name) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  fn(c.getContext('2d'), w, h, mulberry32(s));
  return (m[name] = canvasTexture(r, c, true));
}
/** Atlas-cell UV bounds (u0, v0, u1, v1; v up) for a 4x4 atlas. */
export const cellUV = (i) => { const cx = i % 4, cy = (i / 4) | 0; return [cx / 4, 1 - (cy + 1) / 4, (cx + 1) / 4, 1 - cy / 4]; };

// The poster of the store: the only text of the world (the slogan).
export function paintPoster(g, w, h) {
  rect(g, 'rgb(214,170,84)', 0, 0, w, h);
  rect(g, 'rgb(110,74,44)', 0, 0, w, 2); rect(g, 'rgb(110,74,44)', 0, h - 2, w, 2); rect(g, 'rgb(110,74,44)', 0, 0, 2, h); rect(g, 'rgb(110,74,44)', w - 2, 0, 2, h);
  const c = document.createElement('canvas'); c.width = c.height = 64; paintSol(c.getContext('2d'), 64, 0.15);
  g.drawImage(c, w - 46, 8, 42, 42);
  g.fillStyle = 'rgb(70,36,18)'; g.font = 'bold 9px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText('Um novo dia', 6, 8); g.fillText('sempre começa', 6, 22); g.fillText('com um sorriso!', 6, 36);
  rect(g, 'rgb(70,36,18)', 6, 50, w - 56, 1);
}

// ---------------------------------------------------------------------------------------------
// The merging builder. Parts (geometry + matrix + material descriptor) are collected and merged by
// material, so the whole posto is a few dozen draw calls. The dark of the risk areas rides on the vertices
// (colour attribute) when the render's shader has them (`r.vertexColors === true`), otherwise it is in the
// material colour, one material per area.

/** Material descriptor: a colour, a texture name and the r.mat options. */
export const D = (color, map = null, opts = null) => ({ key: color + '|' + (map ?? '') + '|' + (opts ? JSON.stringify(opts) : ''), color, map, opts: opts ?? {} });

/** Merge geometries (each with a matrix) into one non-indexed geometry. A part may carry `tint` (vertex colour, grey). */
export function mergeGeos(T, parts, withColor = false) {
  const pos = [], nor = [], uv = [], col = [];
  const v = new T.Vector3(), nm = new T.Matrix3();
  for (const { geo, matrix, tint = 1 } of parts) {
    const g = geo.index ? (geo.userData.flat ??= geo.toNonIndexed()) : geo;
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      if (withColor) col.push(tint, tint, tint);
    }
  }
  const out = new T.BufferGeometry();
  if (withColor) out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return out;
}

/** Box with uv in tile units per face (world metres / tile). Long faces are subdivided (affine textures). */
export function boxGeo(T, w, h, d, tile = [1, 1]) {
  const sx = Math.max(1, Math.ceil(w / 2)), sy = Math.max(1, Math.ceil(h / 2)), sz = Math.max(1, Math.ceil(d / 2));
  const g = new T.BoxGeometry(w, h, d, sx, sy, sz);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const counts = [(sz + 1) * (sy + 1), (sz + 1) * (sy + 1), (sx + 1) * (sz + 1), (sx + 1) * (sz + 1), (sx + 1) * (sy + 1), (sx + 1) * (sy + 1)];
  let i = 0;
  for (let f = 0; f < 6; f++) for (let k = 0; k < counts[f]; k++, i++) uv.setXY(i, uv.getX(i) * dims[f][0] / tile[0], uv.getY(i) * dims[f][1] / tile[1]);
  return g;
}

let hitMat;
const HIT = (T) => (hitMat ??= new T.MeshBasicMaterial({ visible: false }));

/**
 * createBuilder(r, { tint(area) -> 0..1 }) -> { ctx(opts), material(desc, area, loose), flush(parent) -> meshes }.
 * ctx({ pos, ry, area, matrix }) is a local frame with box / cyl / sph / quad / geo that collect parts,
 * `dyn` (a Group with the same transform, for objects that move), `mesh` (a loose mesh in `dyn`),
 * `sub` (parts with their own meshes) and `hit` (an invisible box the ray can hit).
 */
export function createBuilder(r, { tint = () => 1 } = {}) {
  const T = r.THREE, useVC = r.vertexColors === true;
  const buckets = new Map(), mats = new Map();
  const tmpE = new T.Euler(), tmpQ = new T.Quaternion(), tmpV = new T.Vector3(), tmpS = new T.Vector3(1, 1, 1);
  const local = (pos = [0, 0, 0], rot = [0, 0, 0], sc = [1, 1, 1]) =>
    new T.Matrix4().compose(tmpV.set(...pos), tmpQ.setFromEuler(tmpE.set(...rot)), tmpS.set(...sc));

  /** Material of a descriptor. `loose` meshes (no colour attribute) always get the area tint in the material colour. */
  function material(d, area = 'externa', loose = false) {
    const vc = useVC && !loose, k = d.key + (vc ? '#vc' : '@' + area);
    if (mats.has(k)) return mats.get(k);
    const lit = vc || (d.opts.emissive ?? 0) > 0 ? 1 : tint(area);
    const m = r.mat(new T.Color(d.color).multiplyScalar(lit), { ...d.opts, vertexColors: vc, map: d.map ? tex(r, d.map) : d.texture });
    mats.set(k, m); return m;
  }
  function add(geo, d, matrix, area) {
    const k = useVC ? d.key : d.key + '@' + area;
    let b = buckets.get(k); if (!b) buckets.set(k, (b = { d, area, parts: [] }));
    b.parts.push({ geo, matrix, tint: (d.opts.emissive ?? 0) > 0 ? 1 : tint(area) });
  }
  function flush(parent) {
    const out = [];
    for (const b of buckets.values()) {
      const m = new T.Mesh(mergeGeos(T, b.parts, useVC), material(b.d, b.area));
      m.name = b.d.map ?? b.d.color; m.userData.area = useVC ? '*' : b.area; parent.add(m); out.push(m);
    }
    buckets.clear(); return out;
  }
  function ctx({ pos = [0, 0, 0], ry = 0, area = 'externa', matrix = null } = {}) {
    const base = matrix ?? local(pos, [0, ry, 0]);
    const dyn = new T.Group(); dyn.position.set(...pos); dyn.rotation.y = ry;
    const put = (geo, d, p, rot, sc) => add(geo, d, base.clone().multiply(local(p, rot, sc)), area);
    return {
      T, r, area, dyn, base, builder: api,
      box: (size, d, p, rot, tile) => put(boxGeo(T, ...size, tile ?? [1, 1]), d, p, rot),
      cyl: (rt, rb, h, seg, d, p, rot, sc) => put(new T.CylinderGeometry(rt, rb, h, seg), d, p, rot, sc),
      sph: (rad, d, p, sc, ws = 6, hs = 4) => put(new T.SphereGeometry(rad, ws, hs), d, p, [0, 0, 0], sc),
      /** quad w x h facing +z (rotate with rot), uv rect [u0, v0, u1, v1] */
      quad: (w, h, d, p, rot, uvr = [0, 0, 1, 1]) => {
        const g = new T.PlaneGeometry(w, h), uv = g.attributes.uv;
        for (let i = 0; i < 4; i++) uv.setXY(i, uvr[uv.getX(i) ? 2 : 0], uvr[uv.getY(i) ? 3 : 1]);
        put(g, d, p, rot);
      },
      geo: (g, d, p, rot, sc) => put(g, d, p, rot, sc),
      /** loose mesh (own draw call), in the frame of `dyn` */
      mesh: (geo, d, p = [0, 0, 0], rot = [0, 0, 0], parent = dyn) => {
        const m = new T.Mesh(geo, material(d, area, true)); m.position.set(...p); m.rotation.set(...rot); parent.add(m); return m;
      },
      /** run fn(subCtx) with parts collected into their own meshes (own draw calls), added to `dyn` */
      sub: (fn) => {
        const sb = createBuilder(r, { tint }), sc = sb.ctx({ area });
        const res = fn(sc);
        return { meshes: sb.flush(dyn), res };
      },
      hit: (size, p, id, kind) => {
        const m = new T.Mesh(new T.BoxGeometry(...size), HIT(T)); m.position.set(...p); m.userData.interactId = id; m.userData.kind = kind; dyn.add(m); return m;
      },
    };
  }
  const api = { ctx, material, flush, add };
  return api;
}
