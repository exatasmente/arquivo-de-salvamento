// The painting of one building: its front drawn in elevation on one canvas, by the brush of paintkit.js, knowing where every part is (the
// builder of block.js gives the list): the wall with its masses, the dirt run down under each sill and cornice, the rust under a machine, the
// paint fallen off down to the brick, cracks from the corners of the windows, the grime of the street on the ground floor, spray marks that
// are only shapes, posters without a letter; then every part that stands out (pilasters, belts, frames, sills, the cornice) with its light
// above, its shade below and the ink round it; then the openings (the glass painted dark, for the building seen from afar, with frames,
// blinds, boards), the doors, the rolling shutters, the machines and the pipes. Beside the elevation, a column of swatches for what is not in
// the plane of the wall (the awning's cloth, the iron of the rails, the roof, a cloth on a rail).
// `M`: { w, EW, CW, CH, X(x), Y(y), R(x0, y0, x1, y1) -> [cx, cy, cw, ch], sx, sy(y), pal, brick, tower, items, extras, r }.
import { INK, PALE, css, mixc, scale, blob, masses, drip, drips, chip, crack, inkRect, part, castShadow, scribble, poster, bricks, finish, punch } from './paintkit.js';

const SPRAY = ['196,70,52', '60,110,160', '226,190,70', '236,232,220', '40,36,40', '90,150,110'];

/** The glass of a window or a shop front as the street sees it from afar: dark, with the sky's streak across it and its frame. */
function glass(g, r, x, y, w, h, frame, o = {}) {
  const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, o.lit ? 'rgb(120,100,60)' : 'rgb(30,40,58)'); gr.addColorStop(1, o.lit ? 'rgb(70,56,34)' : 'rgb(14,18,28)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = 'rgba(150,180,214,0.22)'; g.beginPath(); g.moveTo(x + w * 0.1, y); g.lineTo(x + w * 0.42, y); g.lineTo(x + w * 0.12, y + h); g.lineTo(x - w * 0.2, y + h); g.fill();
  if (o.dirt !== false) masses(g, r, x, y, w, h, 3, Math.max(w, h) * 0.5, '70,60,44', '150,150,140', 0.22);
  if (o.blind) { const bh = h * (0.25 + r() * 0.6); g.fillStyle = css(o.blind); g.fillRect(x, y, w, bh); g.fillStyle = `rgba(${INK},0.3)`; for (let yy = y + 2; yy < y + bh; yy += 3) g.fillRect(x, yy, w, 0.8); g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x, y + bh - 1, w, 1.5); }
  if (o.broken) { g.fillStyle = 'rgb(8,8,12)'; g.beginPath(); const bx = x + w * (0.3 + r() * 0.4), by = y + h * (0.4 + r() * 0.3); for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.3, k = Math.min(w, h) * (0.12 + r() * 0.26); g.lineTo(bx + Math.cos(a) * k, by + Math.sin(a) * k); } g.fill(); }
  g.restore();
  const t = Math.max(1.2, o.bar ?? 2);
  g.fillStyle = css(frame); g.fillRect(x, y, w, t); g.fillRect(x, y + h - t, w, t); g.fillRect(x, y, t, h); g.fillRect(x + w - t, y, t, h);
  if (o.mullion !== false) g.fillRect(x + w / 2 - t / 2, y, t, h);
  if (o.transom) g.fillRect(x, y + h * 0.3 - t / 2, w, t);
  g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y, w, 0.8);
  // the shade of the wall's thickness on the top and the left of the opening
  const sh = g.createLinearGradient(0, y, 0, y + Math.min(h * 0.3, 9)); sh.addColorStop(0, `rgba(${INK},0.6)`); sh.addColorStop(1, `rgba(${INK},0)`); g.fillStyle = sh; g.fillRect(x, y, w, Math.min(h * 0.3, 9));
  inkRect(g, x, y, w, h, 0.85, 1.2, 0);
}

/** Planks nailed over an opening. */
function boards(g, r, x, y, w, h, n = 4) {
  g.fillStyle = 'rgb(16,14,14)'; g.fillRect(x, y, w, h);
  const bh = h / n;
  for (let i = 0; i < n; i++) {
    const c = scale([176, 140, 92], 0.72 + r() * 0.4), yy = y + i * bh + 0.6, hh = bh - 1.6 - r() * 1.5;
    g.fillStyle = css(c); g.fillRect(x, yy, w, hh);
    g.strokeStyle = 'rgba(90,60,34,0.4)'; g.lineWidth = 0.8; for (let k = 0; k < 3; k++) { const ly = yy + r() * hh; g.beginPath(); g.moveTo(x, ly); g.bezierCurveTo(x + w * 0.3, ly + 1.5, x + w * 0.6, ly - 1.5, x + w, ly + 0.6); g.stroke(); }
    g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x, yy, w, 0.9); g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x, yy + hh - 0.9, w, 1.1);
    for (const nx of [x + 2.5, x + w - 2.5]) { g.fillStyle = `rgba(${INK},0.85)`; g.beginPath(); g.arc(nx, yy + hh / 2, 0.9, 0, 6.3); g.fill(); drip(g, r, nx, yy + hh / 2, 5 + r() * 6, 1.2, '110,60,30', 0.5); }
  }
  masses(g, r, x, y, w, h, 3, w * 0.5, '50,34,22', PALE, 0.2);
  inkRect(g, x, y, w, h, 0.8, 1.2, 0);
}

/** A rolling steel shutter: slats with their light and shade, rust that comes up from the foot, dents, a spray shape, the bottom bar and the lock. */
function shutter(g, r, x, y, w, h, col, slat) {
  g.fillStyle = css(col); g.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += slat) {
    const gr = g.createLinearGradient(0, yy, 0, yy + slat); gr.addColorStop(0, `rgba(${PALE},0.42)`); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(${INK},0.5)`);
    g.fillStyle = gr; g.fillRect(x, yy, w, slat);
  }
  masses(g, r, x, y, w, h, 5, w * 0.45, '40,30,26', PALE, 0.22);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0; i < 6; i++) blob(g, x + r() * w, y + h - r() * h * 0.22, w * (0.08 + r() * 0.14), h * (0.05 + r() * 0.1), '132,70,34', 0.5);
  for (let i = 0; i < 5; i++) drip(g, r, x + r() * w, y + r() * h * 0.5, h * (0.2 + r() * 0.4), 2 + r() * 3, '110,58,30', 0.3);
  if (r() < 0.75) scribble(g, r, x + w * (0.12 + r() * 0.3), y + h * (0.35 + r() * 0.3), w * (0.3 + r() * 0.25), SPRAY[Math.floor(r() * SPRAY.length)], 0.75);
  for (let i = 0; i < 2; i++) { const dx = x + w * (0.2 + r() * 0.6), dy = y + h * (0.3 + r() * 0.5); blob(g, dx, dy, w * 0.07, h * 0.04, INK, 0.4); blob(g, dx - 1, dy - 2, w * 0.05, h * 0.02, PALE, 0.3); }
  g.restore();
  g.fillStyle = css(scale(col, 0.6)); g.fillRect(x, y + h - slat * 1.3, w, slat * 1.3); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(x, y + h - slat * 1.3, w, 1);
  g.fillStyle = `rgba(${INK},0.9)`; g.fillRect(x + w / 2 - 2.2, y + h - slat * 1.25, 4.4, slat * 0.9);
  inkRect(g, x, y, w, h, 0.85, 1.3, 0);
}

/** A door leaf: panels, a kick plate, a handle, the grime of hands. */
function door(g, r, x, y, w, h, col, kind) {
  g.fillStyle = css(col); g.fillRect(x, y, w, h);
  masses(g, r, x, y, w, h, 4, w * 0.6, '40,28,20', PALE, 0.22);
  const leaves = w > h * 0.5 ? 2 : 1, lw = w / leaves;
  for (let k = 0; k < leaves; k++) {
    const lx = x + k * lw;
    if (kind === 'metal') { for (const py of [0.08, 0.52]) { inkRect(g, lx + lw * 0.12, y + h * py, lw * 0.76, h * 0.38, 0.5, 1, 0.3); } for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(lx + lw * 0.3, y + h * 0.12 + i * 3, lw * 0.4, 1); } }
    else { for (const [py, ph] of [[0.06, 0.3], [0.42, 0.22], [0.7, 0.2]]) { g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(lx + lw * 0.14, y + h * py, lw * 0.72, h * ph); g.fillStyle = `rgba(${PALE},0.16)`; g.fillRect(lx + lw * 0.18, y + h * py + 2, lw * 0.64, h * ph - 3.5); inkRect(g, lx + lw * 0.14, y + h * py, lw * 0.72, h * ph, 0.55, 1, 0); } }
    g.fillStyle = `rgba(${INK},0.75)`; g.fillRect(lx, y, 1, h);
    const hx = k === 0 && leaves === 2 ? lx + lw - 4 : lx + 3.5; g.fillStyle = 'rgb(190,170,110)'; g.fillRect(hx - 1, y + h * 0.52, 2.4, 5); g.fillStyle = `rgba(${INK},0.8)`; g.fillRect(hx - 1, y + h * 0.52 + 5, 2.4, 1);
    blob(g, hx, y + h * 0.54, lw * 0.22, h * 0.07, '30,22,16', 0.3);
  }
  g.fillStyle = css(scale(col, 0.55)); g.fillRect(x, y + h * 0.92, w, h * 0.08); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y + h * 0.92, w, 0.9);
  const dg = g.createLinearGradient(0, y + h * 0.7, 0, y + h); dg.addColorStop(0, 'rgba(50,38,26,0)'); dg.addColorStop(1, 'rgba(50,38,26,0.45)'); g.fillStyle = dg; g.fillRect(x, y + h * 0.7, w, h * 0.3);
  inkRect(g, x, y, w, h, 0.85, 1.3, 0);
}

export function paintFacade(g, M) {
  const { r, pal, items, R, X, Y, EW, CH, sx } = M, wall = pal.wall, it = (t) => items.filter((i) => i.t === t);
  const H0 = Y(0), under = M.brick ? mixc(pal.wall, [70, 44, 36], 0.55) : pal.under;
  // ---- the wall ----------------------------------------------------------------------------------------------------------------
  g.fillStyle = css(wall); g.fillRect(0, 0, EW + 6, CH);
  if (M.brick) { bricks(g, r, 0, Y(M.Y1), EW, H0 - Y(M.Y1), 0.23 * sx, Math.max(3, 0.075 * M.sy(0)), wall); bricks(g, r, 0, 0, EW, Y(M.Y1), 0.23 * sx, Math.max(2.4, 0.11 * M.sy(99)), wall); }
  if (M.tower) for (const p of it('panel')) { const [x, y, w, h] = R(p.x0, p.y0, p.x1, p.y1); g.fillStyle = css(scale(wall, 0.84 + r() * 0.3)); g.fillRect(x, y, w, h); g.fillStyle = `rgba(${PALE},0.25)`; g.fillRect(x, y, w, 1); inkRect(g, x, y, w, h, 0.5, 1, 0); }
  masses(g, r, 0, 0, EW, CH, Math.round((EW * CH) / 9000), 70, '46,34,28', PALE, M.brick ? 0.2 : 0.26);
  // the wall painted again in places, in a tone that never matched
  if (!M.brick && !M.tower) for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
    const w = EW * (0.15 + r() * 0.35), h = 40 + r() * 120, x = r() * (EW - w), y = r() * (CH - h), c = mixc(wall, r() < 0.5 ? pal.trim : scale(wall, 0.7), 0.3 + r() * 0.3);
    g.fillStyle = css(c, 0.7); g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.lineCap = 'round'; for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(${PALE},${0.06 + r() * 0.1})`; g.lineWidth = 5 + r() * 6; const yy = y + r() * h; g.beginPath(); g.moveTo(x - 4, yy); g.lineTo(x + w + 4, yy + (r() - 0.5) * 10); g.stroke(); } g.restore();
  }
  // soot and rain from the top down, the street's grime from the ground up
  let gr = g.createLinearGradient(0, 0, 0, CH * 0.5); gr.addColorStop(0, 'rgba(34,40,52,0.34)'); gr.addColorStop(1, 'rgba(34,40,52,0)'); g.fillStyle = gr; g.fillRect(0, 0, EW, CH * 0.5);
  const dirtH = 1.3 * M.sy(0); gr = g.createLinearGradient(0, H0 - dirtH, 0, H0); gr.addColorStop(0, 'rgba(60,46,32,0)'); gr.addColorStop(0.7, 'rgba(60,46,32,0.34)'); gr.addColorStop(1, 'rgba(40,30,22,0.62)'); g.fillStyle = gr; g.fillRect(0, H0 - dirtH, EW, dirtH);
  for (let i = 0; i < EW / 14; i++) blob(g, r() * EW, H0 - r() * dirtH * 0.5, 6 + r() * 16, 5 + r() * 12, '44,34,24', 0.3);
  // ---- what runs down the wall --------------------------------------------------------------------------------------------------
  for (const s of [...it('sill'), ...it('belt'), ...it('cornice'), ...it('box'), ...it('balcony')]) {
    const [x, y, w, h] = R(s.x0, s.y0, s.x1, s.y1), long = s.t === 'cornice' ? 2.2 : s.t === 'belt' ? 0.8 : 1.1;
    drips(g, r, x + 1, x + w - 1, y + h, long * M.sy(s.y0) * (0.5 + r()), s.t === 'box' ? '120,64,30' : '44,34,26', s.t === 'box' ? 0.55 : 0.42, s.t === 'cornice' ? 13 : 7);
    if (s.t === 'sill') for (const ex of [x + 1.5, x + w - 1.5]) drip(g, r, ex, y + h, (0.7 + r() * 1.3) * M.sy(s.y0), 3 + r() * 2.5, '40,30,24', 0.6);   // the two ends of a sill run longest
  }
  for (const p of it('pipe')) { const [x, y, w, h] = R(p.x0 - 0.12, p.y0, p.x1 + 0.12, p.y1); const pg = g.createLinearGradient(x, 0, x + w, 0); pg.addColorStop(0, 'rgba(50,40,30,0)'); pg.addColorStop(0.5, 'rgba(50,40,30,0.4)'); pg.addColorStop(1, 'rgba(50,40,30,0)'); g.fillStyle = pg; g.fillRect(x, y, w, h); }
  for (const s of it('shade')) { const [x, y, w, h] = R(s.x0, s.y0, s.x1, s.y1); const sg = g.createLinearGradient(0, y, 0, y + h); sg.addColorStop(0, `rgba(${INK},0.5)`); sg.addColorStop(1, `rgba(${INK},0.12)`); g.fillStyle = sg; g.fillRect(x, y, w, h); }
  // the wall's thickness shades the wall round each opening (so the reveals are dark)
  for (const o of [...it('win'), ...it('open')]) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1), e = 0.09 * sx; g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(x - e, y - e, w + e * 2, h + e * 2); g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(x - e * 0.5, y - e * 0.5, w + e, h + e); }
  // ---- wear ---------------------------------------------------------------------------------------------------------------------
  const brickUnder = (gg, x, y, rx, ry) => bricks(gg, r, x - rx, y - ry, rx * 2, ry * 2, 0.23 * sx, 3.2, [168, 96, 70]);
  if (!M.tower) for (let i = 0, n = Math.round((EW * CH) / 26000) + 2; i < n; i++) {
    const low = r() < 0.55, x = r() * EW, y = low ? H0 - r() * (H0 - Y(M.Y1)) : r() * CH, s = (low ? 9 : 5) + r() * (low ? 26 : 14);
    chip(g, r, x, y, s * (0.8 + r() * 0.8), s * (0.6 + r() * 0.7), M.brick ? under : r() < 0.6 ? brickUnder : pal.under);
  }
  for (const o of it('win')) if (r() < 0.22) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1), right = r() < 0.5; crack(g, r, right ? x + w : x, y + h, (0.6 + r() * 1.2) * M.sy(o.y0), Math.PI / 2 + (right ? -0.5 : 0.5), 1, 0.7); }
  for (let i = 0; i < 2 + EW / 220; i++) crack(g, r, r() * EW, r() * CH, 30 + r() * 80, Math.PI / 2 + (r() - 0.5), 1, 0.6);
  // ---- the parts that stand out -------------------------------------------------------------------------------------------------
  const TR = { plinth: pal.stone, pilaster: pal.trim, belt: pal.trim, cornice: pal.trim, frame: pal.trim, lintel: pal.trim, sill: pal.stone, coping: pal.stone, fascia: pal.fascia, hood: pal.iron, rail: pal.iron, balcony: scale(pal.stone, 0.78), step: pal.stone, fin: pal.iron };
  for (const s of items) if (TR[s.t]) { const [x, y, w, h] = R(s.x0, s.y0, s.x1, s.y1); castShadow(g, x, y, w, h, (s.d ?? 0.1) * sx * 1.2, s.t === 'cornice' ? 0.5 : 0.34); }
  for (const s of items) {
    const c = TR[s.t]; if (!c) continue;
    const [x, y, w, h] = R(s.x0, s.y0, s.x1, s.y1);
    part(g, r, x, y, w, h, scale(c, 0.9 + r() * 0.2), { top: s.t === 'pilaster' ? 0.25 : 0.55, under: s.t === 'pilaster' ? 0.2 : 0.5 });
    if (s.t === 'plinth') { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); for (let bx = x + r() * 30; bx < x + w; bx += 36 + r() * 30) { g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(bx, y, 1.1, h); g.fillStyle = `rgba(${PALE},0.25)`; g.fillRect(bx + 1.1, y, 0.8, h); } for (let i = 0; i < w / 30; i++) blob(g, x + r() * w, y + h, 8 + r() * 12, 4 + r() * 6, '36,28,20', 0.5); g.restore(); }
    if (s.t === 'cornice') { g.fillStyle = `rgba(${INK},0.35)`; g.fillRect(x, y + h * 0.42, w, 1); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(x, y + h * 0.42 + 1, w, 0.8); if (s.dentils) for (let dx = x + 2; dx < x + w - 2; dx += s.dentils * sx) { g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(dx, y + h * 0.62, s.dentils * sx * 0.45, h * 0.26); } }
    if (s.t === 'pilaster' && h > 30) { g.fillStyle = `rgba(${INK},0.2)`; g.fillRect(x + w * 0.3, y + 3, 1, h - 6); g.fillRect(x + w * 0.68, y + 3, 1, h - 6); }
    if ((s.t === 'cornice' || s.t === 'belt' || s.t === 'fascia') && r() < 0.8) chip(g, r, x + r() * w, y + h * 0.5, 4 + r() * 9, h * 0.45, pal.under, { pts: 6 });
    if (s.t === 'fascia') { drips(g, r, x, x + w, y, h * 0.9, '44,34,26', 0.4, 10); for (let i = 0; i < 2; i++) if (r() < 0.6) { const pw = 0.5 * sx, px = x + r() * (w - pw); g.fillStyle = css(scale(c, 0.78), 0.8); g.fillRect(px, y + h * 0.18, pw * (1 + r()), h * 0.62); } }   // (the ghost of a sign taken down: a cleaner rectangle, no letter)
  }
  // ---- the openings --------------------------------------------------------------------------------------------------------------
  for (const o of it('win')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1);
    if (o.state === 'boards') boards(g, r, x, y, w, h, o.planks ?? 4);
    else if (o.state === 'bricked') { bricks(g, r, x, y, w, h, 0.3 * sx, Math.max(3, 0.14 * M.sy(o.y0)), [150, 142, 130]); masses(g, r, x, y, w, h, 3, w * 0.5, '40,34,30', PALE, 0.25); inkRect(g, x, y, w, h, 0.7, 1.2, 0); }
    else if (o.state === 'louver') { g.fillStyle = css(pal.join); g.fillRect(x, y, w, h); for (let yy = y + 1; yy < y + h; yy += Math.max(2, 0.06 * M.sy(o.y0))) { g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x, yy, w, 0.9); g.fillStyle = `rgba(${PALE},0.22)`; g.fillRect(x, yy + 0.9, w, 0.7); } g.fillStyle = `rgba(${INK},0.8)`; g.fillRect(x + w / 2 - 0.6, y, 1.2, h); masses(g, r, x, y, w, h, 3, w * 0.5, '30,24,20', PALE, 0.25); if (r() < 0.5) chip(g, r, x + r() * w, y + r() * h, 3 + r() * 4, 3 + r() * 5, [150, 128, 96], { pts: 6 }); inkRect(g, x, y, w, h, 0.85, 1.2, 0); }
    else glass(g, r, x, y, w, h, pal.join, { lit: o.lit, blind: o.blind ? (r() < 0.5 ? [196, 188, 166] : [150, 160, 150]) : null, broken: o.broken, transom: o.transom, mullion: o.mullion, bar: Math.max(1.2, 0.07 * sx * (M.sy(o.y0) / M.sy(0))) });
  }
  for (const o of it('leaf')) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1); g.fillStyle = css(pal.join); g.fillRect(x, y, w, h); for (let yy = y + 1; yy < y + h; yy += Math.max(2, 0.06 * M.sy(o.y0))) { g.fillStyle = `rgba(${INK},0.45)`; g.fillRect(x, yy, w, 0.9); } inkRect(g, x, y, w, h, 0.8, 1.1, 0.3); }
  for (const o of it('open')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1);
    if (o.kind === 'vitrine') glass(g, r, x, y, w, h, pal.iron, { mullion: true, transom: true, bar: 2.6 });
    else if (o.kind === 'door') { g.fillStyle = 'rgb(14,12,12)'; g.fillRect(x, y, w, h); }
    else if (o.kind === 'boards') { boards(g, r, x, y, w, h, 2); for (let k = 1; k < 3; k++) { g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x + (w * k) / 3, y, 1.2, h); } }
    else if (o.kind === 'dark') { g.fillStyle = 'rgb(12,12,16)'; g.fillRect(x, y, w, h); }
  }
  for (const o of it('door')) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1); door(g, r, x, y, w, h, o.metal ? pal.roll : pal.door, o.metal ? 'metal' : 'wood'); }
  for (const o of it('shutter')) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1); shutter(g, r, x, y, w, h, scale(pal.roll, 0.85 + r() * 0.3), o.slat * M.sy(o.y0)); }
  for (const o of it('ply')) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1); part(g, r, x, y, w, h, [186, 150, 100], { top: 0.4, under: 0.4 }); for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(100,66,36,0.35)'; g.lineWidth = 0.9; const ly = y + r() * h; g.beginPath(); g.moveTo(x, ly); g.bezierCurveTo(x + w * 0.3, ly + 3, x + w * 0.6, ly - 3, x + w, ly + 1); g.stroke(); } drips(g, r, x, x + w, y, h * 0.6, '60,40,24', 0.4, 8); if (r() < 0.7) scribble(g, r, x + w * 0.15, y + h * (0.4 + r() * 0.2), w * 0.5, SPRAY[Math.floor(r() * SPRAY.length)], 0.8); }
  // ---- machines, boxes, pipes ----------------------------------------------------------------------------------------------------
  for (const o of it('ac')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1);
    part(g, r, x, y, w, h, [196, 196, 186], { top: 0.6, under: 0.5 });
    for (let yy = y + h * 0.22; yy < y + h * 0.86; yy += Math.max(1.6, h * 0.11)) { g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(x + w * 0.1, yy, w * 0.56, 0.9); }
    g.fillStyle = `rgba(${INK},0.5)`; g.fillRect(x + w * 0.74, y + h * 0.22, w * 0.16, h * 0.3);
    blob(g, x + w * 0.3, y + h, w * 0.4, h * 0.3, '130,70,34', 0.6); drip(g, r, x + w * (0.2 + r() * 0.6), y + h, (1 + r() * 1.6) * M.sy(o.y0), 3, '110,66,36', 0.6);
  }
  for (const o of it('box')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1);
    part(g, r, x, y, w, h, o.col ?? [112, 122, 126], { top: 0.6, under: 0.5 });
    inkRect(g, x + w * 0.12, y + h * 0.1, w * 0.76, h * 0.8, 0.55, 1, 0.3); g.fillStyle = `rgba(${INK},0.8)`; g.fillRect(x + w * 0.78, y + h * 0.45, 1.6, 3.2);
    blob(g, x + w * 0.5, y + h * 0.9, w * 0.5, h * 0.2, '130,70,34', 0.5);
    if (o.mark) { g.fillStyle = 'rgb(220,180,50)'; g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.24); g.lineTo(x + w * 0.72, y + h * 0.56); g.lineTo(x + w * 0.28, y + h * 0.56); g.fill(); g.fillStyle = `rgba(${INK},0.9)`; g.fillRect(x + w * 0.47, y + h * 0.34, w * 0.06, h * 0.12); }
  }
  for (const p of it('pipe')) {
    const [x, y, w, h] = R(p.x0, p.y0, p.x1, p.y1), c = p.col ?? pal.iron;
    const pg = g.createLinearGradient(x, 0, x + w, 0); pg.addColorStop(0, css(scale(c, 1.5))); pg.addColorStop(0.45, css(c)); pg.addColorStop(1, css(scale(c, 0.45))); g.fillStyle = pg; g.fillRect(x, y, w, h);
    for (let yy = y + r() * 30; yy < y + h; yy += 30 + r() * 40) { blob(g, x + w / 2, yy, w * 1.2, 5 + r() * 8, '140,74,34', 0.7); }
    for (const by of p.bands ?? []) { const yy = Y(by); g.fillStyle = css(scale(c, 0.5)); g.fillRect(x - 1.5, yy - 1.6, w + 3, 3.2); g.fillStyle = `rgba(${PALE},0.4)`; g.fillRect(x - 1.5, yy - 1.6, w + 3, 0.8); }
    g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(x - 0.6, y, 0.9, h); g.fillRect(x + w - 0.3, y, 0.9, h);
  }
  for (const o of it('signboard')) { const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1); castShadow(g, x, y, w, h, 4, 0.4); part(g, r, x, y, w, h, [86, 62, 44], { top: 0.5, under: 0.5 }); drips(g, r, x, x + w, y + h, 26, '120,64,30', 0.5, 8); }
  // ---- the street's hand on the ground floor: spray shapes, posters, a painted-over rectangle -----------------------------------------
  for (const o of it('pier')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1), k = r();
    if (k < 0.3) scribble(g, r, x + w * 0.1, y + h * (0.4 + r() * 0.3), Math.min(w * 0.8, 40), SPRAY[Math.floor(r() * SPRAY.length)], 0.8);
    else if (k < 0.5) { const pw = Math.min(w * 0.7, 0.5 * sx), ph = pw * 1.35; for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) poster(g, r, x + (w - pw) / 2 + (r() - 0.5) * 4, y + h * 0.28 + i * ph * 0.8, pw, ph, [[214, 204, 180], [[178, 70, 52], [64, 104, 150], [204, 160, 64]][Math.floor(r() * 3)], [40, 36, 40]]); }
    else if (k < 0.62) { g.fillStyle = css(mixc(wall, pal.trim, 0.5), 0.75); g.fillRect(x + 2, y + h * 0.35, w - 4, h * 0.4); }
  }
  for (const o of it('blank')) {
    const [x, y, w, h] = R(o.x0, o.y0, o.x1, o.y1);
    for (let i = 0; i < 3; i++) scribble(g, r, x + w * (0.08 + r() * 0.5), y + h * (0.35 + r() * 0.35), w * (0.2 + r() * 0.25), SPRAY[Math.floor(r() * SPRAY.length)], 0.8);
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) { const pw = 0.48 * sx, ph = pw * 1.35; poster(g, r, x + w * 0.1 + i * pw * 1.08, y + h * 0.3 + (r() - 0.5) * 6, pw, ph, [[214, 204, 180], [[178, 70, 52], [64, 104, 150], [204, 160, 64], [78, 124, 88]][Math.floor(r() * 4)], [40, 36, 40]]); }
  }
  finish(g, r, 0, 0, EW, CH, { a: 0.085 });
  // (the lamps of the street light the wall from above: nothing is painted for them; the top of the tall ones is left in the dark of the night)
  // ---- the swatches ------------------------------------------------------------------------------------------------------------
  const E = M.extras;
  { const [x, y, w, h] = E.awning, n = 6, sw = w / n, c = pal.awning;                                    // stripes down the slope, the valance in the lowest fifth
    for (let i = 0; i < n; i++) { g.fillStyle = css(i % 2 ? c : [232, 224, 204]); g.fillRect(x + i * sw, y, sw + 0.5, h); }
    masses(g, r, x, y, w, h, 6, w * 0.4, '50,36,26', PALE, 0.26); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let i = 0; i < 7; i++) drip(g, r, x + r() * w, y + r() * h * 0.3, h * (0.3 + r() * 0.5), 2 + r() * 4, '50,40,28', 0.4);
    for (let i = 0; i < 4; i++) blob(g, x + r() * w, y + r() * h * 0.7, 3 + r() * 5, 2 + r() * 4, '236,232,220', 0.7);
    if (r() < 0.6) chip(g, r, x + w * (0.2 + r() * 0.6), y + h * (0.3 + r() * 0.3), 5 + r() * 6, 4 + r() * 5, [26, 22, 22], { pts: 6 });
    g.fillStyle = `rgba(${INK},0.55)`; g.fillRect(x, y + h * 0.8, w, 1.4); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(x, y + h * 0.8 + 1.4, w, 0.9); g.fillStyle = `rgba(${INK},0.4)`; g.fillRect(x, y + h - 2, w, 2);
    g.restore(); finish(g, r, x, y, w, h, { n: 8, a: 0.1, drift: 1 }); }
  { const [x, y, w, h] = E.iron, c = pal.iron; g.fillStyle = css(c); g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 8, 12, '20,16,14', '200,150,110', 0.4); for (let i = 0; i < 10; i++) blob(g, x + r() * w, y + r() * h, 4 + r() * 6, 2 + r() * 3, '150,80,40', 0.6); g.fillStyle = `rgba(${PALE},0.35)`; g.fillRect(x, y, w, 1.5); }
  { const [x, y, w, h] = E.roof; g.fillStyle = 'rgb(84,84,88)'; g.fillRect(x, y, w, h); masses(g, r, x, y, w, h, 10, 26, '26,26,30', '170,170,160', 0.4); for (let i = 0; i < 4; i++) crack(g, r, x + r() * w, y + r() * h, 30, r() * 3, 1, 0.6); for (let i = 0; i < 5; i++) blob(g, x + r() * w, y + r() * h, 8, 6, '40,60,44', 0.5); finish(g, r, x, y, w, h, { n: 6, a: 0.1, drift: 1 }); }
  { const [x, y, w, h] = E.cloth, cols = [[206, 198, 180], [150, 84, 70], [84, 110, 140], [190, 170, 96]]; for (let i = 0; i < 4; i++) { g.fillStyle = css(cols[i]); g.fillRect(x + (i * w) / 4, y, w / 4, h); } masses(g, r, x, y, w, h, 6, 16, '40,30,24', PALE, 0.3); for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${INK},0.3)`; g.fillRect(x + (i * w) / 4 + w / 9, y, 1, h); } g.fillStyle = `rgba(${INK},0.4)`; g.fillRect(x, y + h - 2, w, 2); }
  paintSide(g, M);
  punch(g, 0.42);
}

/**
 * The blind side wall of a building (the two sides and the back are the same painting): the render or the brick in large masses, the rain run
 * down from the coping, the ghost of a mural painted over long ago (big flat shapes, never a letter), patches of another tone, iron tie
 * plates, cracks, and at the foot the grime, the spray shapes and the torn posters of the street. `M.extras.side`: [x, y, w, h] in pixels,
 * `M.sidePx`: pixels per metre.
 */
function paintSide(g, M) {
  const { r, pal } = M, [x, y, w, h] = M.extras.side, px = M.sidePx, c = M.brick ? pal.wall : mixc(pal.wall, [156, 150, 140], 0.4);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = css(c); g.fillRect(x, y, w, h);
  if (M.brick) bricks(g, r, x, y, w, h, 0.26 * px, Math.max(2.4, 0.12 * px), c);
  masses(g, r, x, y, w, h, Math.round((w * h) / 6000), 60, '44,34,28', PALE, 0.28);
  // the ghost of a mural: two or three large flat shapes under a coat of paint
  const mc = [[178, 84, 60], [70, 110, 150], [210, 170, 80], [86, 130, 100]], my = y + h * (0.25 + r() * 0.3), mh = Math.min(h * 0.4, 9 * px);
  for (let i = 0; i < 3; i++) { g.fillStyle = css(mixc(mc[Math.floor(r() * 4)], c, 0.62), 0.9); const k = r(); if (k < 0.4) { g.beginPath(); g.arc(x + w * (0.25 + r() * 0.5), my + mh * 0.5, mh * (0.25 + r() * 0.2), 0, 6.3); g.fill(); } else if (k < 0.7) g.fillRect(x + w * 0.06, my + mh * (0.1 + i * 0.3), w * 0.88, mh * 0.16); else { g.beginPath(); g.moveTo(x + w * 0.1, my + mh); g.lineTo(x + w * 0.5, my); g.lineTo(x + w * 0.9, my + mh); g.fill(); } }
  for (let i = 0; i < 4; i++) { const pw = w * (0.2 + r() * 0.4), ph = (1.2 + r() * 3) * px; g.fillStyle = css(mixc(c, r() < 0.5 ? pal.trim : scale(c, 0.6), 0.35), 0.75); g.fillRect(x + r() * (w - pw), y + r() * (h - ph), pw, ph); }
  for (let i = 0; i < w / 9; i++) drip(g, r, x + r() * w, y, h * (0.15 + r() * 0.6), 3 + r() * 6, '40,32,26', 0.42);
  const sg = g.createLinearGradient(0, y, 0, y + h * 0.4); sg.addColorStop(0, 'rgba(30,36,48,0.4)'); sg.addColorStop(1, 'rgba(30,36,48,0)'); g.fillStyle = sg; g.fillRect(x, y, w, h * 0.4);
  for (let i = 0; i < 6; i++) chip(g, r, x + r() * w, y + r() * h, 6 + r() * 14, 5 + r() * 10, M.brick ? [120, 70, 56] : (gg, cx, cy, rx, ry) => bricks(gg, r, cx - rx, cy - ry, rx * 2, ry * 2, 0.26 * px, 2.6, [168, 96, 70]));
  for (let i = 0; i < 5; i++) crack(g, r, x + r() * w, y + r() * h, 40 + r() * 90, Math.PI / 2 + (r() - 0.5), 1.1, 0.65);
  for (let yy = y + h - 3.2 * px; yy > y + 20; yy -= 3.2 * px) for (let i = 0; i < 2; i++) { const tx = x + w * (0.25 + i * 0.5); g.strokeStyle = `rgba(${INK},0.85)`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(tx - 3, yy - 3); g.lineTo(tx + 3, yy + 3); g.moveTo(tx + 3, yy - 3); g.lineTo(tx - 3, yy + 3); g.stroke(); drip(g, r, tx, yy + 3, 14 + r() * 20, 2, '120,64,30', 0.55); }
  const dh = 1.5 * px, dg = g.createLinearGradient(0, y + h - dh, 0, y + h); dg.addColorStop(0, 'rgba(50,40,28,0)'); dg.addColorStop(1, 'rgba(36,28,20,0.7)'); g.fillStyle = dg; g.fillRect(x, y + h - dh, w, dh);
  for (let i = 0; i < 4; i++) scribble(g, r, x + w * (0.05 + r() * 0.6), y + h - (0.7 + r() * 1.1) * px, (0.8 + r() * 1.2) * px, SPRAY[Math.floor(r() * SPRAY.length)], 0.8);
  for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) poster(g, r, x + w * 0.1 + i * 0.62 * px, y + h - 1.9 * px + (r() - 0.5) * 5, 0.55 * px, 0.75 * px, [[214, 204, 180], mc[Math.floor(r() * 4)], [40, 36, 40]]);
  g.restore();
  finish(g, r, x, y, w, h, { a: 0.09 });
}
