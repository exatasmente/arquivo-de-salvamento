// The painted surfaces of the city, in the same hand-painted manner as models/kit.js (light colours that the material's
// colour tints; the light, the damp, the wear are painted in): awnings, roof tiles, corrugated sheet, hoarding, a
// blind wall with a painted-over mural (only shapes, never a letter), plaster and rolling shutters. No text anywhere.
// Each gets the same last pass (`finish`): the strong values and the broad brush of Jonas and of the station's props.
// Everything comes from a seed. They are registered in the kit (kit.setTexture) under the names below.
import { mulberry32 } from '../../../vendor/engine/rng.js';

const rgb = (c, k = 1) => `rgb(${c.map((x) => Math.max(0, Math.min(255, x * k)) | 0).join(',')})`;
const tilePaint = (g, w, h, draw) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); draw(); g.restore(); } };
/** Soft round washes that tile at the borders. */
function wash(g, w, h, r, n, r0, r1, col, a0, a1 = a0) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = (r0 + r() * (r1 - r0)) * w, a = a0 + r() * (a1 - a0);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; tilePaint(g, w, h, () => g.fillRect(x - rad, y - rad, rad * 2, rad * 2));
  }
}
/** Dirt that runs down from the top: long vertical soft streaks. */
function streaks(g, w, h, r, n, col, a) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, len = h * (0.3 + r() * 0.7), t = 2 + r() * 7, gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(${col},${a * (0.5 + r() * 0.5)})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x, 0, t, len);
  }
}
/** Dry brush: short light strokes of a colour (the painter's mark). */
function brush(g, w, h, r, n, col, a, len = 22, thick = 2.4) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, an = (r() - 0.5) * 0.5 + (r() < 0.5 ? 0 : Math.PI / 2);
    g.strokeStyle = `rgba(${col},${a * (0.4 + r() * 0.6)})`; g.lineWidth = thick * (0.5 + r());
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * len * (0.4 + r()), y + Math.sin(an) * len * (0.4 + r())); g.stroke();
  }
}
const edge = (g, x, y, w, h, t = 2, light = 'rgba(255,250,235,0.45)', shade = 'rgba(30,26,22,0.3)') => {
  g.fillStyle = light; g.fillRect(x, y, w, t); g.fillRect(x, y, t, h); g.fillStyle = shade; g.fillRect(x, y + h - t, w, t); g.fillRect(x + w - t, y, t, h);
};
/** A scribble loop made of bezier curves: a shape with no meaning (the ghost of a painted-over mural). */
function scribble(g, r, x, y, s, col, a) {
  g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = s * 0.16; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < 4; i++) g.bezierCurveTo(x + (r() - 0.2) * s * 2, y - r() * s * 1.6, x + (r() + 0.2) * s * 2.4, y + r() * s * 1.4, x += s * (0.7 + r() * 0.9), y += (r() - 0.5) * s * 0.9);
  g.stroke();
}

const S = 256;
/**
 * The last pass over every surface, the hand that painted Jonas and the station: stronger values (the picture laid over itself), a few
 * broad strokes of a flat brush in a dark and a light, and nothing left in neutral grey (a warm drift and a cool one).
 */
function finish(g, w, h, r) {
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5; g.drawImage(g.canvas, 0, 0); g.restore();
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, an = (r() - 0.5) * 0.6 + (r() < 0.3 ? Math.PI / 2 : 0), l = 30 + r() * 50;
    g.strokeStyle = `rgba(${r() < 0.5 ? '33,20,13' : '255,244,220'},${0.05 + r() * 0.07})`; g.lineWidth = 4 + r() * 7;
    tilePaint(g, w, h, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke(); });
  }
  g.restore();
  wash(g, w, h, r, 2, 0.25, 0.45, '170,120,70', 0.07, 0.12); wash(g, w, h, r, 2, 0.25, 0.45, '70,104,112', 0.07, 0.12);
}
const PAINT = {
  reboco: (g, w, h, r) => {
    g.fillStyle = rgb([228, 222, 210]); g.fillRect(0, 0, w, h);
    wash(g, w, h, r, 7, 0.25, 0.5, '120,108,92', 0.12, 0.22); wash(g, w, h, r, 4, 0.2, 0.4, '255,250,232', 0.22);
    brush(g, w, h, r, 60, '255,248,230', 0.2); brush(g, w, h, r, 36, '96,84,70', 0.13);
    streaks(g, w, h, r, 7, '70,60,48', 0.2);
    const gr = g.createLinearGradient(0, h * 0.72, 0, h); gr.addColorStop(0, 'rgba(70,60,46,0)'); gr.addColorStop(1, 'rgba(70,60,46,0.34)'); g.fillStyle = gr; g.fillRect(0, h * 0.72, w, h * 0.28);
    // the plaster has fallen off in one place: the brick shows
    const x = w * (0.15 + r() * 0.6), y = h * (0.1 + r() * 0.4); g.fillStyle = 'rgb(176,112,86)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y + 6); g.lineTo(x + 36, y + 30); g.lineTo(x + 8, y + 36); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,44,32,0.5)'; g.lineWidth = 1.4; g.stroke(); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 4, y + 10 + k * 8); g.lineTo(x + 32, y + 8 + k * 8); g.stroke(); }
  },
  toldo: (g, w, h, r) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? rgb([158, 150, 140]) : rgb([250, 244, 228]); g.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
    wash(g, w, h, r, 5, 0.25, 0.5, '90,70,50', 0.16, 0.26); wash(g, w, h, r, 3, 0.2, 0.4, '255,252,235', 0.24);
    streaks(g, w, h, r, 8, '60,48,36', 0.25); brush(g, w, h, r, 40, '255,250,232', 0.16, 26, 2.6);
    g.fillStyle = 'rgba(30,24,18,0.28)'; g.fillRect(0, h - 10, w, 10); g.fillStyle = 'rgba(255,250,235,0.35)'; g.fillRect(0, 0, w, 3);
    for (let i = 0; i < 3; i++) { const x = r() * w, y = h * (0.2 + r() * 0.6); g.fillStyle = 'rgba(40,32,24,0.5)'; g.beginPath(); g.ellipse(x, y, 4 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); g.fill(); }
  },
  telha: (g, w, h, r) => {
    g.fillStyle = rgb([226, 200, 180]); g.fillRect(0, 0, w, h);
    const rows = 8, cols = 8;
    for (let row = 0; row < rows; row++) for (let col = -1; col < cols; col++) {
      const x = ((col + (row % 2 ? 0.5 : 0)) * w) / cols, y = (row * h) / rows, k = 0.84 + r() * 0.26, tw = w / cols, th = h / rows;
      const gr = g.createLinearGradient(x, y, x + tw, y); gr.addColorStop(0, rgb([236, 190, 160], k * 1.1)); gr.addColorStop(0.5, rgb([220, 168, 136], k)); gr.addColorStop(1, rgb([170, 120, 96], k));
      g.fillStyle = gr; g.fillRect(x + 1, y + 1, tw - 2, th + 2);
      g.fillStyle = 'rgba(40,24,16,0.45)'; g.fillRect(x + 1, y + th - 3, tw - 2, 3);
      g.fillStyle = 'rgba(255,236,210,0.4)'; g.fillRect(x + 1, y + 1, tw - 2, 2);
    }
    wash(g, w, h, r, 6, 0.2, 0.4, '70,90,50', 0.16, 0.28); wash(g, w, h, r, 3, 0.25, 0.4, '30,20,14', 0.18); streaks(g, w, h, r, 6, '40,30,22', 0.2);
  },
  chapa: (g, w, h, r) => {
    g.fillStyle = rgb([214, 218, 220]); g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(120,128,136,0.1)'); gr.addColorStop(1, 'rgba(40,46,56,0.35)'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    wash(g, w, h, r, 5, 0.2, 0.4, '150,90,50', 0.2, 0.36); wash(g, w, h, r, 3, 0.2, 0.4, '60,66,76', 0.16);
    streaks(g, w, h, r, 10, '128,70,34', 0.34); streaks(g, w, h, r, 5, '40,40,46', 0.22);
    g.fillStyle = 'rgba(40,30,24,0.4)'; g.fillRect(0, 0, w, 4); g.fillStyle = 'rgba(40,30,24,0.4)'; g.fillRect(0, h - 4, w, 4);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(30,26,24,0.8)'; g.beginPath(); g.arc(8 + i * 64 + 16, 14, 2.4, 0, 7); g.fill(); }
  },
  tapume: (g, w, h, r) => {
    g.fillStyle = rgb([210, 190, 156]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const x = (i * w) / 4, k = 0.88 + r() * 0.2; g.fillStyle = rgb([214, 192, 154], k); g.fillRect(x + 1, 0, w / 4 - 2, h);
      g.strokeStyle = 'rgba(100,72,40,0.28)'; g.lineWidth = 1.2; for (let j = 0; j < 7; j++) { const y = r() * h; g.beginPath(); g.moveTo(x + 2, y); g.bezierCurveTo(x + w / 12, y + 3, x + w / 6, y - 3, x + w / 4 - 2, y + 1); g.stroke(); }
      g.fillStyle = 'rgba(33,20,13,0.78)'; g.fillRect(x, 0, 2.5, h); g.fillStyle = 'rgba(255,244,220,0.3)'; g.fillRect(x + 2.5, 0, 1.2, h);   // the joint: a dark line, a lip of light
    }
    g.fillStyle = 'rgba(40,30,20,0.55)'; for (const y of [24, h - 28]) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((i * w) / 4 + w / 8, y, 2.4, 0, 7); g.fill(); }
    wash(g, w, h, r, 6, 0.2, 0.4, '70,50,30', 0.16, 0.3); streaks(g, w, h, r, 10, '50,38,26', 0.3); brush(g, w, h, r, 34, '255,240,210', 0.2);
    // painted-over scuffs and a dirty brush mark, no letters
    for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(${i % 2 ? '120,126,120' : '172,170,150'},0.4)`; g.fillRect(r() * w * 0.7, r() * h * 0.7, 36 + r() * 60, 26 + r() * 50); }
  },
  empena: (g, w, h, r) => {
    // a blind side wall: concrete, painted-over rectangles that do not match, and the ghost of old marks under them (shapes only)
    g.fillStyle = rgb([210, 206, 196]); g.fillRect(0, 0, w, h);
    wash(g, w, h, r, 7, 0.25, 0.5, '110,102,90', 0.14, 0.24); wash(g, w, h, r, 3, 0.2, 0.4, '255,250,235', 0.22);
    for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(40,36,30,0.25)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,250,235,0.3)'; g.fillRect(0, y + 2, w, 1); }
    const cols = [[200, 196, 178], [176, 184, 178], [214, 200, 176], [160, 170, 176]];
    for (let i = 0; i < 3; i++) {
      const bw = 80 + r() * 110, bh = 70 + r() * 100, x = r() * (w - bw), y = r() * (h - bh), c = cols[Math.floor(r() * cols.length)];
      for (let k = 0; k < 3; k++) scribble(g, r, x + 8, y + bh * (0.3 + k * 0.25), 22 + r() * 16, ['190,90,60', '70,100,150', '70,66,60'][(i + k) % 3], 0.6);
      g.fillStyle = rgb(c); g.globalAlpha = 0.86; g.fillRect(x, y, bw, bh); g.globalAlpha = 1;
      brush(g, bw, bh, r, 14, '255,250,236', 0.3, 30, 4); // brush marks over the patch
      g.strokeStyle = 'rgba(60,54,44,0.3)'; g.lineWidth = 2; g.strokeRect(x, y, bw, bh);
    }
    streaks(g, w, h, r, 8, '60,52,42', 0.26);
    const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(60,52,40,0)'); gr.addColorStop(1, 'rgba(60,52,40,0.4)'); g.fillStyle = gr; g.fillRect(0, h * 0.75, w, h * 0.25);
  },
  persiana: (g, w, h, r) => {
    g.fillStyle = rgb([200, 202, 204]); g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) {
      const gr = g.createLinearGradient(0, y, 0, y + 12); gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.7, 'rgba(120,126,134,0.08)'); gr.addColorStop(1, 'rgba(24,26,32,0.55)');
      g.fillStyle = gr; g.fillRect(0, y, w, 12);
    }
    wash(g, w, h, r, 6, 0.2, 0.4, '150,90,52', 0.2, 0.34); streaks(g, w, h, r, 9, '110,62,34', 0.3);
    for (let i = 0; i < 3; i++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(20,20,24,0.4)'; g.beginPath(); g.ellipse(x, y, 10 + r() * 14, 5, 0, 0, 7); g.fill(); }
  },
};

export function installPaints(kit) {
  const T = kit.T;
  for (const [name, paint] of Object.entries(PAINT)) {
    if (kit.has(name)) continue;
    const c = document.createElement('canvas'); c.width = c.height = S;
    let s = 91; for (const ch of name) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
    const g = c.getContext('2d'), rnd = mulberry32(s);
    paint(g, S, S, rnd);
    finish(g, S, S, rnd);
    const t = new T.CanvasTexture(c);
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace;
    kit.setTexture(name, t);
  }
}
export const CITY_TEXTURES = Object.keys(PAINT);
