// The picture on the old VHS tape (R7): drawn once on a small canvas, with the grain of worn tape. It shows the station, the attendant from behind at
// pump 4 and the sign lit; in the corner, only a month and a year. No face, no day, nothing written that is an answer to anything.
import { mulberry32 } from '../../rng.js';

export function paintTape(cv, seed = 7) {
  const w = cv.width, h = cv.height, g = cv.getContext('2d'), rnd = mulberry32(seed);
  // dusk sky and the road
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#2a2c4a'); sky.addColorStop(1, '#c0805a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
  g.fillStyle = '#3a3836'; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = '#c8a030'; for (let x = 4; x < w; x += 22) g.fillRect(x, h * 0.86, 12, 2);
  // the canopy, its lights and the pumps
  g.fillStyle = '#8a8680'; g.fillRect(w * 0.12, h * 0.26, w * 0.7, h * 0.07);
  g.fillStyle = '#f0e0a0'; for (const x of [0.2, 0.36, 0.52, 0.68]) g.fillRect(w * x, h * 0.335, w * 0.05, 3);
  g.fillStyle = '#5a5650'; g.fillRect(w * 0.2, h * 0.33, 3, h * 0.3); g.fillRect(w * 0.74, h * 0.33, 3, h * 0.3);
  g.fillStyle = '#a82a22'; for (const x of [0.32, 0.5, 0.64]) { g.fillRect(w * x, h * 0.46, w * 0.05, h * 0.17); g.fillStyle = '#d8d0b0'; g.fillRect(w * x + 3, h * 0.49, w * 0.05 - 6, 5); g.fillStyle = '#a82a22'; }
  // the attendant, from behind, at the last pump: a shirt, a cap, no face
  const ax = Math.round(w * 0.58);
  g.fillStyle = '#2e3c4e'; g.fillRect(ax, h * 0.58, 5, h * 0.06); g.fillRect(ax + 7, h * 0.58, 5, h * 0.06);
  g.fillStyle = '#86652a'; g.fillRect(ax - 1, h * 0.46, 14, h * 0.12);
  g.fillStyle = '#c8a888'; g.fillRect(ax + 2, h * 0.42, 8, h * 0.045);
  g.fillStyle = '#2a2e3a'; g.fillRect(ax + 1, h * 0.40, 10, h * 0.03);
  // the Sun sign, far right, lit
  g.fillStyle = '#4a4640'; g.fillRect(w * 0.9, h * 0.2, 3, h * 0.42);
  g.fillStyle = '#e8b050'; g.beginPath(); g.arc(w * 0.9 + 1, h * 0.18, h * 0.08, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7a4a18'; g.lineWidth = 1.4; g.beginPath(); g.arc(w * 0.9 + 1, h * 0.19, h * 0.04, 0.2, Math.PI - 0.2); g.stroke();
  // tape: scan lines, a band of noise, grain, a dropout, the corner
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const band = Math.floor(rnd() * (h - 16)); g.fillStyle = 'rgba(230,230,230,0.35)';
  for (let x = 0; x < w; x += 2) g.fillRect(x, band + Math.floor(rnd() * 6), 2 + Math.floor(rnd() * 5), 1);
  for (let i = 0; i < w * h * 0.04; i++) { const v = 90 + Math.floor(rnd() * 140); g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1); }
  g.font = `bold ${Math.round(h * 0.09)}px "Courier New", monospace`; g.textBaseline = 'alphabetic';
  g.fillStyle = '#f0a040'; g.textAlign = 'right'; g.fillText('DEZ 1998', w - 6, h - 6);
  g.textAlign = 'left'; g.fillStyle = '#e8e8e8'; g.fillText('PLAY ▶', 6, h * 0.12);
  return cv;
}

/** Shows the picture over the game (the dialogue boxes stay on top, as the overlay sits right after the game's canvas). Returns a function that takes it away. */
export function showTape(seed = 7) {
  const ov = document.createElement('div');
  ov.id = 'tape-ov';
  ov.style.cssText = 'position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;padding-top:' + (innerHeight > innerWidth ? '170px' : '6vh') + ';pointer-events:none;background:rgba(0,0,0,.7)';
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
  cv.style.cssText = 'width:min(86vw,110vh);aspect-ratio:4/3;image-rendering:pixelated;image-rendering:crisp-edges;border:3px solid #111;box-shadow:0 0 0 2px #333';
  paintTape(cv, seed); ov.appendChild(cv); const canvas = document.getElementById('c'); if (canvas) canvas.after(ov); else document.body.appendChild(ov);   // (right after the picture of the game: the HUD and the dialogue boxes stay over it)
  return () => ov.remove();
}
