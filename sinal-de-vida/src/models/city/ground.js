// The ground of the avenue, painted and modelled as one piece: the asphalt (ONE painting of the whole walkable street: wheel tracks, patches
// with their tar joints, a trench cut across the lanes, cracks, worn markings and crossings, puddles, oil under where the cars stand, manhole
// covers) and the two pavements with their kerbs and gutters (ONE painting, a row per side, laid over the section: gutter, kerb face,
// chamfer, kerb top, three rows of slabs up to the walls: joints, cracked and broken slabs, patches, weeds in the joints, storm inlets,
// tactile paving at the crossings, tree pits, the grime along the walls). The kerb is a stone with a chamfer; a few slabs are lifted by a
// root. Both textures repeat past the ends of the street, where the fog is. Everything from a seed. Two materials for the whole ground.
import { mulberry32 } from '../../../vendor/engine/rng.js';
import { Shape } from './geo.js';
import { INK, PALE, css, scale, blob, masses, drip, chip, crack, shape, finish, punch, canvas, textureOf } from './paintkit.js';

export const GROUND = { len: 120, gutter: 0.4, top: 0.19, wall: 11.62, far: 210 };
const AW = 4096, AH = 448, SW = 4096, SROW = 256;

/** Road paint that has seen years: the bar of colour with holes worn in it down to the asphalt, more where the wheels pass. */
function marking(g, r, x, y, w, h, col, wear = 0.5) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = css(col, 0.9); g.fillRect(x, y, w, h);
  g.fillStyle = `rgba(${PALE},0.18)`; g.fillRect(x, y, w, Math.max(1, h * 0.2));
  const n = Math.round(((w * h) / 60) * wear) + 1;
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${58 + r() * 26},${58 + r() * 26},${66 + r() * 26},${0.7 + r() * 0.3})`; shape(g, r, x + r() * w, y + r() * h, 1.5 + r() * 6 * wear, 1.2 + r() * 4 * wear, 6, 0.6); g.fill(); }
  for (let i = 0; i < n / 3; i++) { g.strokeStyle = 'rgba(40,40,48,0.7)'; g.lineWidth = 0.8 + r(); g.beginPath(); const cx = x + r() * w; g.moveTo(cx, y); g.lineTo(cx + (r() - 0.5) * 10, y + h); g.stroke(); }
  g.restore();
}
/** A joint filled with tar: a thick dark crooked line with a wet shine on one side. */
function tar(g, r, x, y, len, dir, wide = 2.4) {
  const pts = [[x, y]]; const n = Math.max(3, Math.round(len / 14));
  for (let i = 0; i < n; i++) { const a = dir + (r() - 0.5) * 0.9; x += (Math.cos(a) * len) / n; y += (Math.sin(a) * len) / n; pts.push([x, y]); }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [c, lw, d] of [['rgba(14,14,20,0.9)', wide, 0], ['rgba(150,160,190,0.22)', wide * 0.3, -wide * 0.25]]) { g.strokeStyle = c; g.lineWidth = lw * (0.8 + r() * 0.4); g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + d, py + d) : g.moveTo(px + d, py + d))); g.stroke(); }
  g.restore();
}
/** Water lying on the ground: a dark glossy shape, the sky pale in the middle of it, a bright rim on the side of the light, damp round it. */
function puddle(g, r, x, y, rx, ry) {
  blob(g, x, y, rx * 1.7, ry * 1.7, '14,16,24', 0.5);
  const pts = [], n = 11, a0 = r() * 6.3; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283, k = 0.6 + r() * 0.5; pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  const path = () => { g.beginPath(); pts.forEach(([px, py], i) => { const [qx, qy] = pts[(i + 1) % n]; if (!i) g.moveTo((px + qx) / 2, (py + qy) / 2); const [sx, sy] = pts[(i + 2) % n]; g.quadraticCurveTo(qx, qy, (qx + sx) / 2, (qy + sy) / 2); }); g.closePath(); };
  g.save(); path(); g.fillStyle = 'rgb(20,24,36)'; g.fill(); g.clip();
  blob(g, x - rx * 0.15, y - ry * 0.1, rx * 0.8, ry * 0.7, '120,140,176', 0.5); blob(g, x + rx * 0.3, y + ry * 0.2, rx * 0.4, ry * 0.3, '236,206,150', 0.35);
  g.restore(); g.save(); path(); g.lineWidth = 1.5; g.strokeStyle = `rgba(${INK},0.8)`; g.stroke(); g.translate(-0.8, -1); path(); g.lineWidth = 0.9; g.strokeStyle = 'rgba(200,214,236,0.5)'; g.stroke(); g.restore();
}
/** A cast-iron cover, round: the ring, the pattern of studs, two holes for the hook, rust, and the asphalt cracked round its collar. */
function cover(g, r, x, y, rad) {
  blob(g, x, y, rad * 2.3, rad * 2.3, '20,20,26', 0.45);
  for (let i = 0; i < 5; i++) crack(g, r, x + Math.cos(i * 1.3) * rad, y + Math.sin(i * 1.3) * rad, rad * (1 + r() * 1.5), i * 1.3 + (r() - 0.5), 1, 0.7);
  g.fillStyle = 'rgb(128,124,116)'; g.beginPath(); g.arc(x, y, rad * 1.22, 0, 6.3); g.fill();
  g.fillStyle = 'rgb(24,20,18)'; g.beginPath(); g.arc(x, y, rad * 1.04, 0, 6.3); g.fill();
  g.fillStyle = 'rgb(86,74,66)'; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
  g.save(); g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.clip();
  masses(g, r, x - rad, y - rad, rad * 2, rad * 2, 6, rad * 0.8, '30,20,14', '190,130,80', 0.45);
  g.fillStyle = `rgba(${INK},0.6)`; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if ((i + j) % 2 === 0) g.fillRect(x + i * rad * 0.27 - 1.4, y + j * rad * 0.27 - 1.4, 2.8, 2.8);
  g.fillStyle = `rgba(${PALE},0.3)`; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if ((i + j) % 2 === 0) g.fillRect(x + i * rad * 0.27 - 1.4, y + j * rad * 0.27 - 1.4, 2.8, 0.8);
  g.restore();
  g.strokeStyle = `rgba(${INK},0.85)`; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, rad * 0.7, 0, 6.3); g.stroke(); g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.stroke();
  g.strokeStyle = `rgba(${PALE},0.4)`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, rad * 1.22, 3.3, 5); g.stroke();
  g.fillStyle = 'rgb(10,10,12)'; for (const s of [-1, 1]) g.fillRect(x + s * rad * 0.78 - 1.2, y - 2, 2.4, 4);
}
/** Bars of a cast-iron grate over a dark hole. */
function grate(g, r, x, y, w, h, along = true) {
  g.fillStyle = 'rgb(10,10,12)'; g.fillRect(x, y, w, h);
  const n = Math.max(4, Math.round((along ? w : h) / 5));
  for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; g.fillStyle = 'rgb(84,74,66)'; if (along) g.fillRect(x + k * w - 1.3, y + 1.5, 2.6, h - 3); else g.fillRect(x + 1.5, y + k * h - 1.3, w - 3, 2.6); g.fillStyle = `rgba(${PALE},0.3)`; if (along) g.fillRect(x + k * w - 1.3, y + 1.5, 0.8, h - 3); else g.fillRect(x + 1.5, y + k * h - 1.3, w - 3, 0.8); }
  g.strokeStyle = 'rgb(96,86,76)'; g.lineWidth = 2.4; g.strokeRect(x, y, w, h); g.strokeStyle = `rgba(${INK},0.8)`; g.lineWidth = 1; g.strokeRect(x - 1.4, y - 1.4, w + 2.8, h + 2.8);
  for (let i = 0; i < 3; i++) blob(g, x + r() * w, y + r() * h, 4 + r() * 5, 3 + r() * 3, '120,84,50', 0.5);
}

/** `M`: { crossings: [x], manholes: [[x, z]], stains: [[x, z, size]], puddles: [[x, z, rx, rz]], viaduct: half width, road } in metres. */
function paintAsphalt(g, r, M) {
  const W = AW, H = AH, PX = W / GROUND.len, hw = M.road - GROUND.gutter, PZ = H / (hw * 2), X = (x) => (x + GROUND.len / 2) * PX, Z = (z) => (z + hw) * PZ;
  g.fillStyle = 'rgb(80,80,90)'; g.fillRect(0, 0, W, H);
  masses(g, r, 0, 0, W, H, 420, 54, '18,18,26', '176,176,190', 0.2);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(200,200,210,0.16)' : 'rgba(10,10,16,0.2)'; g.fillRect(r() * W, r() * H, 1 + r() * 1.4, 1 + r() * 1.4); }
  // the wheels polish two tracks in each lane, and the engines drip between them
  g.save(); g.lineCap = 'round';
  for (const zc of [-4.95, -1.65, 1.65, 4.95]) {
    for (const o of [-0.78, 0.78]) for (let x = -40; x < W + 40; x += 60 + r() * 90) { const l = 60 + r() * 200, y = Z(zc + o) + (r() - 0.5) * 6; g.strokeStyle = `rgba(178,178,192,${0.05 + r() * 0.08})`; g.lineWidth = 9 + r() * 9; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 7, x + l, y + (r() - 0.5) * 5); g.stroke(); }
    for (let x = 0; x < W; x += 16 + r() * 50) blob(g, x, Z(zc) + (r() - 0.5) * 9, 4 + r() * 10, 3 + r() * 6, '12,12,18', 0.25 + r() * 0.3);
  }
  g.restore();
  // patches of other asphalt, each with its joint of tar
  for (let i = 0; i < 26; i++) {
    const w = (1.2 + r() * 4) * PX, h = (0.8 + r() * 2.2) * PZ, x = r() * (W - w), y = 6 + r() * (H - h - 12), dark = r() < 0.55;
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.12); g.fillStyle = dark ? `rgba(40,40,50,${0.6 + r() * 0.3})` : `rgba(122,120,128,${0.5 + r() * 0.3})`; g.fillRect(-w / 2, -h / 2, w, h);
    masses(g, r, -w / 2, -h / 2, w, h, 4, w * 0.4, '10,10,16', '190,190,200', 0.22); g.restore();
    tar(g, r, x, y, w, 0, 2.2); tar(g, r, x, y + h, w, 0, 2.2); tar(g, r, x, y, h, Math.PI / 2, 2.2); tar(g, r, x + w, y, h, Math.PI / 2, 2.2);
  }
  // a trench dug across all the lanes and filled again, lighter and sunk
  for (const tx of M.trenches ?? []) { g.save(); g.translate(X(tx), 0); g.transform(1, 0, 0.16, 1, 0, 0); g.fillStyle = 'rgba(126,122,126,0.75)'; g.fillRect(-0.4 * PX, 0, 0.8 * PX, H); masses(g, r, -0.4 * PX, 0, 0.8 * PX, H, 12, 16, '20,20,26', PALE, 0.25); g.restore(); tar(g, r, X(tx) - 0.4 * PX, 0, H * 1.02, Math.PI / 2 - 0.16, 2.6); tar(g, r, X(tx) + 0.4 * PX, 0, H * 1.02, Math.PI / 2 - 0.16, 2.6); }
  // cracks: long ones filled with tar, fine ones open, and a few places broken like a dry river bed
  for (let i = 0; i < 22; i++) tar(g, r, r() * W, r() * H, 40 + r() * 150, (r() < 0.6 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.7, 1.3 + r() * 1.1);
  for (let i = 0; i < 150; i++) crack(g, r, r() * W, r() * H, 26 + r() * 90, r() * 6.3, 0.9 + r() * 0.5, 0.65);
  for (let i = 0; i < 9; i++) { const cx = r() * W, cy = 30 + r() * (H - 60), s = 40 + r() * 50; blob(g, cx, cy, s, s * 0.7, '16,16,22', 0.3); for (let k = 0; k < 22; k++) crack(g, r, cx + (r() - 0.5) * s * 1.6, cy + (r() - 0.5) * s, 12 + r() * 22, r() * 6.3, 0.9, 0.75); }
  // the two ends of the picture go back to plain asphalt (the texture repeats past the ends of the street; the markings go on through)
  for (const [xa, xb] of [[0, 70], [W, W - 70]]) { const gr = g.createLinearGradient(xa, 0, xb, 0); gr.addColorStop(0, 'rgba(72,72,82,1)'); gr.addColorStop(1, 'rgba(72,72,82,0)'); g.fillStyle = gr; g.fillRect(Math.min(xa, xb), 0, 70, H); }
  // ---- the markings, worn -------------------------------------------------------------------------------------------------------------
  const yel = [214, 180, 72], wht = [214, 212, 200];
  for (const z of [-0.14, 0.14]) for (let x = 0; x < W; x += 110) marking(g, r, x, Z(z) - 1.9, 110, 3.8, yel, 0.5 + r() * 0.6);
  for (const z of [-hw + 0.28, hw - 0.28]) for (let x = 0; x < W; x += 110) marking(g, r, x, Z(z) - 2, 110, 4, wht, 0.7 + r() * 0.8);
  for (const z of [-3.3, 3.3]) for (let m = -GROUND.len / 2; m < GROUND.len / 2; m += 6) { if ((M.crossings ?? []).some((c) => Math.abs(m + 1.5 - c) < 4.5)) continue; marking(g, r, X(m), Z(z) - 2.2, 3 * PX, 4.4, wht, 0.5 + r() * 0.7); }
  for (const c of M.crossings ?? []) {
    for (let z = -hw + 0.5; z < hw - 0.6; z += 1.0) marking(g, r, X(c - 1.5), Z(z), 3 * PX, 0.5 * PZ, wht, 0.6 + r() * 0.9);
    for (const s of [-1, 1]) marking(g, r, X(c + s * 2.6) - 0.2 * PX, s > 0 ? Z(-hw + 0.2) : Z(0.2), 0.4 * PX, (hw - 0.4) * PZ, wht, 0.8);
  }
  // the wheels rub the paint off where they cross it
  g.save(); g.lineCap = 'round'; for (const zc of [-4.95, -1.65, 1.65, 4.95]) for (const o of [-0.78, 0.78]) for (const c of M.crossings ?? []) { g.strokeStyle = 'rgba(70,70,80,0.5)'; g.lineWidth = 11; g.beginPath(); g.moveTo(X(c - 3.4), Z(zc + o)); g.lineTo(X(c + 3.4), Z(zc + o) + (r() - 0.5) * 4); g.stroke(); } g.restore();
  // ---- under the viaduct: damp, and what drips from its joints --------------------------------------------------------------------------
  if (M.viaduct) { const a = X(-M.viaduct), b = X(M.viaduct), gr = g.createLinearGradient(a - 40, 0, b + 40, 0); gr.addColorStop(0, 'rgba(14,16,24,0)'); gr.addColorStop(0.15, 'rgba(14,16,24,0.4)'); gr.addColorStop(0.85, 'rgba(14,16,24,0.4)'); gr.addColorStop(1, 'rgba(14,16,24,0)'); g.fillStyle = gr; g.fillRect(a - 40, 0, b - a + 80, H); for (const e of [a + 8, b - 8]) for (let y = 0; y < H; y += 5 + r() * 16) blob(g, e + (r() - 0.5) * 10, y, 3 + r() * 6, 3 + r() * 5, r() < 0.3 ? '190,180,160' : '10,12,18', 0.45); }
  for (const [x, z, s] of M.stains ?? []) { blob(g, X(x), Z(z), s * PX, s * PZ * 0.8, '8,8,12', 0.6); for (let i = 0; i < 6; i++) blob(g, X(x) + (r() - 0.5) * s * PX * 1.4, Z(z) + (r() - 0.5) * s * PZ, 3 + r() * 8, 3 + r() * 6, i % 3 ? '8,8,12' : '70,50,90', 0.5); }
  for (const [x, z, rx, rz] of M.puddles ?? []) puddle(g, r, X(x), Z(z), rx * PX, rz * PZ);
  for (const [x, z] of M.manholes ?? []) cover(g, r, X(x), Z(z), 0.42 * PX);
  // skid marks, and the dirt that gathers along the gutters
  g.save(); g.lineCap = 'round'; for (const [x, z] of M.skids ?? []) for (const o of [0, 1.45]) { g.strokeStyle = 'rgba(10,10,14,0.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(X(x), Z(z + o)); g.quadraticCurveTo(X(x + 5), Z(z + o + 0.3), X(x + 9), Z(z + o + 1.6)); g.stroke(); } g.restore();
  for (const [y0, y1] of [[0, 26], [H, H - 26]]) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(24,20,18,0.55)'); gr.addColorStop(1, 'rgba(24,20,18,0)'); g.fillStyle = gr; g.fillRect(0, Math.min(y0, y1), W, 26); }
  for (let i = 0; i < 260; i++) blob(g, r() * W, r() < 0.5 ? r() * 12 : H - r() * 12, 4 + r() * 14, 2 + r() * 5, r() < 0.5 ? '70,56,38' : '16,14,14', 0.4);
  finish(g, r, 0, 0, W, H, { n: 520, a: 0.07, wide: 9, len: 70, drift: 14 });
}

/** One side's row of the pavement painting, at canvas y0: t (metres over the section, from the road's edge) down the row. */
function paintWalk(g, r, y0, s, M) {
  const W = SW, PX = W / GROUND.len, tot = M.section.total, PT = SROW / tot, X = (x) => (x + GROUND.len / 2) * PX, Tt = (t) => y0 + t * PT, { g0, kf, kc, kt } = M.section;
  const tz = (z) => kt + (Math.abs(z) - (M.road + 0.25));   // the section's t of a place on the slabs (z in metres)
  g.save(); g.beginPath(); g.rect(0, y0, W, SROW); g.clip();
  // ---- the slabs ---------------------------------------------------------------------------------------------------------------------
  const sl0 = Tt(kt), slH = Tt(tot) - sl0, rows = 3, rh = slH / rows, cw = 1.5 * PX;
  g.fillStyle = 'rgb(170,164,152)'; g.fillRect(0, sl0, W, slH);
  for (let i = 0; i < W / cw; i++) for (let j = 0; j < rows; j++) {
    const x = i * cw, y = sl0 + j * rh, k = r(), tone = 0.84 + r() * 0.28;
    if (k < 0.07) { g.fillStyle = css([190, 186, 176]); g.fillRect(x, y, cw, rh); g.strokeStyle = `rgba(${INK},0.12)`; g.lineWidth = 1; for (let q = 0; q < 4; q++) { g.beginPath(); g.arc(x + r() * cw, y + r() * rh, 8 + r() * 14, r() * 3, r() * 3 + 2); g.stroke(); } }
    else if (k < 0.11) { g.fillStyle = 'rgb(70,70,80)'; g.fillRect(x, y, cw, rh); masses(g, r, x, y, cw, rh, 3, 16, '14,14,20', '170,170,180', 0.3); }
    else { g.fillStyle = css(scale([176, 170, 156], tone)); g.fillRect(x, y, cw, rh); }
    g.fillStyle = `rgba(${PALE},0.22)`; g.fillRect(x + 1.5, y + 1.5, cw - 3, 1.4); g.fillRect(x + 1.5, y + 1.5, 1.4, rh - 3);
    g.fillStyle = `rgba(${INK},0.14)`; g.fillRect(x + 1.5, y + rh - 3, cw - 3, 1.5); g.fillRect(x + cw - 3, y + 1.5, 1.5, rh - 3);
    if (r() < 0.2) crack(g, r, x + r() * cw, y + 2, rh * (0.6 + r() * 0.5), Math.PI / 2 + (r() - 0.5) * 1.2, 1.1, 0.75);
    if (r() < 0.07) { const cx = x + (r() < 0.5 ? 0 : cw), cy = y + (r() < 0.5 ? 0 : rh), q = 10 + r() * 16; g.fillStyle = 'rgb(40,34,28)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx > x ? -q : q), cy); g.lineTo(cx, cy + (cy > y ? -q : q)); g.fill(); for (let d = 0; d < 5; d++) { g.fillStyle = css(scale([170, 164, 150], 0.7 + r() * 0.5)); g.fillRect(cx + (cx > x ? -1 : 1) * r() * q * 0.7, cy + (cy > y ? -1 : 1) * r() * q * 0.7, 2 + r() * 3, 2 + r() * 2); } }
  }
  masses(g, r, 0, sl0, W, slH, 300, 34, '40,32,26', PALE, 0.2);
  for (let j = 0; j <= rows; j++) { g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(0, sl0 + j * rh - 0.9, W, 1.8); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(0, sl0 + j * rh + 0.9, W, 0.9); }
  for (let i = 0; i <= W / cw; i++) { g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(i * cw - 0.9, sl0, 1.8, slH); g.fillStyle = `rgba(${PALE},0.3)`; g.fillRect(i * cw + 0.9, sl0, 0.9, slH); }
  // the grime along the walls, moss in the damp of it
  { const gr = g.createLinearGradient(0, Tt(tot - 0.9), 0, Tt(tot)); gr.addColorStop(0, 'rgba(40,32,24,0)'); gr.addColorStop(1, 'rgba(34,28,22,0.6)'); g.fillStyle = gr; g.fillRect(0, Tt(tot - 0.9), W, 0.9 * PT); }
  for (let i = 0; i < 160; i++) blob(g, r() * W, Tt(tot - r() * 0.5), 5 + r() * 16, 3 + r() * 6, r() < 0.4 ? '52,70,44' : '30,24,20', 0.4);
  // ---- the places that are somebody's: tree pits, the yellow studs of the crossings, the damp under the viaduct, stains --------------------
  for (const [x, sd] of M.trees ?? []) if (sd === s) { const cx = X(x), cy = Tt(tz(M.road + 0.85)), q = 0.5 * PX; g.fillStyle = 'rgb(66,52,40)'; g.fillRect(cx - q, cy - 0.5 * PT, q * 2, PT); masses(g, r, cx - q, cy - 0.5 * PT, q * 2, PT, 8, 8, '20,14,10', '130,104,70', 0.45); for (let k = 0; k < 9; k++) { g.fillStyle = css([120 + r() * 50, 90 + r() * 30, 40]); g.fillRect(cx + (r() - 0.5) * q * 1.8, cy + (r() - 0.5) * PT * 0.9, 2 + r() * 2, 1.2 + r()); } g.strokeStyle = `rgba(${INK},0.85)`; g.lineWidth = 1.6; g.strokeRect(cx - q, cy - 0.5 * PT, q * 2, PT); for (let k = 0; k < 4; k++) crack(g, r, cx + (r() - 0.5) * q * 2, cy + (r() < 0.5 ? -1 : 1) * 0.5 * PT, 16 + r() * 22, r() * 6.3, 1, 0.7); }
  for (const c of M.crossings ?? []) {
    const xa = X(c - 1.6), w = 3.2 * PX, ya = Tt(kt + 0.08), h = 0.6 * PT;
    g.fillStyle = 'rgb(206,166,54)'; g.fillRect(xa, ya, w, h); for (let dx = 3; dx < w; dx += 5.5) for (let dy = 3; dy < h; dy += 5.5) { g.fillStyle = `rgba(${INK},0.4)`; g.beginPath(); g.arc(xa + dx + 0.5, ya + dy + 0.6, 1.5, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,232,150,0.6)'; g.beginPath(); g.arc(xa + dx, ya + dy, 1.2, 0, 6.3); g.fill(); }
    masses(g, r, xa, ya, w, h, 8, 12, '50,36,20', PALE, 0.35); for (let k = 0; k < 4; k++) chip(g, r, xa + r() * w, ya + r() * h, 3 + r() * 6, 3 + r() * 4, [160, 154, 140], { pts: 6 }); g.strokeStyle = `rgba(${INK},0.7)`; g.lineWidth = 1.2; g.strokeRect(xa, ya, w, h);
    g.fillStyle = 'rgba(206,166,54,0.75)'; g.fillRect(xa - 0.4 * PX, Tt(kf), w + 0.8 * PX, Tt(kt) - Tt(kf)); // the kerb painted yellow at the crossing
  }
  if (M.viaduct) { const a = X(-M.viaduct - 1), b = X(M.viaduct + 1); g.fillStyle = 'rgba(16,18,26,0.36)'; g.fillRect(a, y0, b - a, SROW); for (let i = 0; i < 70; i++) blob(g, a + r() * (b - a), y0 + r() * SROW, 2 + r() * 4, 2 + r() * 3, r() < 0.6 ? '214,208,190' : '14,14,20', 0.6); }
  for (const [x, z, kind] of M.spots ?? []) if (Math.sign(z) === s) { const cx = X(x), cy = Tt(tz(z)); if (kind === 'pole') { blob(g, cx, cy, 9, 8, '90,50,26', 0.55); g.save(); g.translate(cx, cy); g.rotate(Math.PI); drip(g, r, 0, 0, (tz(z) - kt) * PT * (0.5 + r() * 0.5), 3, '40,30,22', 0.5); g.restore(); } else if (kind === 'dust') blob(g, cx, cy, 30 + r() * 30, 16 + r() * 16, '226,220,204', 0.4); else if (kind === 'hatch') grate(g, r, cx - 0.3 * PX, cy - 0.22 * PT, 0.6 * PX, 0.44 * PT, r() < 0.5); else blob(g, cx, cy, 14 + r() * 20, 10 + r() * 14, '20,16,14', 0.5); }
  // weeds where the joints open (the tufts that stand up are geometry: these are the low ones and the shade of all of them)
  for (const [x, z] of M.weeds ?? []) if (Math.sign(z) === s) { const cx = X(x), cy = Tt(tz(z)); blob(g, cx, cy, 9, 6, '20,24,14', 0.5); g.save(); g.lineCap = 'round'; for (let k = 0; k < 9; k++) { g.strokeStyle = css(r() < 0.5 ? [98, 116, 62] : [62, 80, 46], 0.9); g.lineWidth = 1 + r(); const a = r() * 6.3, l = 3 + r() * 6; g.beginPath(); g.moveTo(cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 3); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.7); g.stroke(); } g.restore(); }
  for (let i = 0; i < 130; i++) { const cx = (Math.floor(r() * (W / cw)) + (r() < 0.5 ? 0 : r())) * cw, cy = sl0 + (r() < 0.5 ? Math.floor(r() * (rows + 1)) * rh : r() * slH); g.save(); g.lineCap = 'round'; for (let k = 0; k < 5; k++) { g.strokeStyle = css(r() < 0.5 ? [90, 108, 60] : [58, 74, 44], 0.8); g.lineWidth = 0.9 + r(); const a = r() * 6.3, l = 2 + r() * 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); } g.restore(); }
  for (let i = 0; i < 240; i++) { g.fillStyle = r() < 0.6 ? `rgba(${INK},0.5)` : 'rgba(226,220,206,0.5)'; g.beginPath(); g.arc(r() * W, sl0 + r() * slH, 0.8 + r() * 1.3, 0, 6.3); g.fill(); }   // gum, spilt paint
  // ---- the kerb: stones of 1.2 m with their joints, chipped along the chamfer, scuffed by tyres on the face ---------------------------------
  const st = 1.2 * PX, kTop = Tt(kc), kEnd = Tt(kt), fTop = Tt(g0);
  for (let i = 0; i < W / st; i++) { const x = i * st, tone = 0.86 + r() * 0.26; g.fillStyle = css(scale([188, 182, 170], tone)); g.fillRect(x, fTop, st, kEnd - fTop); }
  g.fillStyle = 'rgba(30,26,24,0.4)'; g.fillRect(0, fTop, W, Tt(kf) - fTop);                                // the face is in the shade of the stone
  g.fillStyle = `rgba(${PALE},0.5)`; g.fillRect(0, Tt(kf), W, kTop - Tt(kf));                               // the chamfer catches the light
  masses(g, r, 0, fTop, W, kEnd - fTop, 200, 14, '34,28,24', PALE, 0.3);
  for (let i = 0; i <= W / st; i++) { g.fillStyle = `rgba(${INK},0.8)`; g.fillRect(i * st - 0.8, fTop, 1.6, kEnd - fTop); }
  for (let i = 0; i < 150; i++) chip(g, r, r() * W, Tt(kf) + r() * (kTop - Tt(kf)) + 1, 2 + r() * 5, 1.5 + r() * 2.5, [120, 114, 104], { pts: 5, lip: 0.3 });
  for (let i = 0; i < 90; i++) { g.strokeStyle = 'rgba(12,12,14,0.5)'; g.lineWidth = 1.5 + r() * 2; const x = r() * W, y = fTop + r() * (Tt(kf) - fTop); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + r() * 30, y + (r() - 0.5) * 2); g.stroke(); }
  g.fillStyle = `rgba(${INK},0.75)`; g.fillRect(0, kEnd - 0.9, W, 1.8);
  // ---- the gutter: a strip of concrete, the damp line at the kerb's foot, silt and leaves, the iron mouths of the storm drain ----------------
  g.fillStyle = 'rgb(126,124,122)'; g.fillRect(0, y0, W, fTop - y0);
  masses(g, r, 0, y0, W, fTop - y0, 160, 14, '20,20,24', '190,186,176', 0.3);
  { const gr = g.createLinearGradient(0, y0, 0, fTop); gr.addColorStop(0, 'rgba(12,12,16,0.1)'); gr.addColorStop(0.6, 'rgba(12,12,16,0.25)'); gr.addColorStop(1, 'rgba(8,8,12,0.75)'); g.fillStyle = gr; g.fillRect(0, y0, W, fTop - y0); }
  for (let x = 0; x < W; x += 3 * PX) { g.fillStyle = `rgba(${INK},0.6)`; g.fillRect(x, y0, 1.4, fTop - y0); }
  for (let i = 0; i < 300; i++) blob(g, r() * W, fTop - 2 - r() * 7, 3 + r() * 10, 1.5 + r() * 3, r() < 0.5 ? '96,70,40' : '40,34,26', 0.5);
  for (let i = 0; i < 260; i++) { g.fillStyle = css([130 + r() * 60, 96 + r() * 40, 40 + r() * 20], 0.85); g.save(); g.translate(r() * W, fTop - 1.5 - r() * 9); g.rotate(r() * 3); g.fillRect(-2, -1, 3 + r() * 2, 1.4 + r()); g.restore(); }
  g.fillStyle = `rgba(${INK},0.7)`; g.fillRect(0, y0, W, 1.4);
  for (const [x, sd] of M.inlets ?? []) if (sd === s) {
    const xa = X(x - 0.5), w = PX;
    g.fillStyle = 'rgb(8,8,10)'; g.fillRect(xa, fTop + 1, w, Tt(kf) - fTop - 2);                             // the mouth under the kerb
    g.fillStyle = 'rgb(150,146,138)'; g.fillRect(xa - 4, Tt(kf), w + 8, kEnd - Tt(kf)); g.strokeStyle = `rgba(${INK},0.8)`; g.lineWidth = 1.4; g.strokeRect(xa - 4, Tt(kf), w + 8, kEnd - Tt(kf));
    grate(g, r, xa + 2, y0 + 3, w - 4, fTop - y0 - 5, true);
    for (let k = 0; k < 6; k++) blob(g, xa + r() * w, y0 + r() * (fTop - y0), 6 + r() * 8, 3 + r() * 4, '70,52,30', 0.5);
  }
  g.restore();
  finish(g, r, 0, y0, W, SROW, { n: 420, a: 0.06, wide: 8, len: 60, drift: 12 });
}

/**
 * Builds the ground into batch `tb`. `S`: STREET (road, walk, curb, halfX); `M`: what is where (see paintAsphalt and paintWalk), plus
 * `lifted`: [[x, side]] slabs pushed up by a root. Returns { walkSpec } (the pavement's material, for what else is painted in its row).
 */
export function buildGround(kit, tb, S, M, seed = 7) {
  const T = kit.T, r = mulberry32(seed * 977 + 3), { road, curb } = S, hw = road - GROUND.gutter, far = GROUND.far, L = GROUND.len;
  // the section of a pavement, from the road's edge: [z from the centre, y, t over the section]
  const z1 = road, zf = road + 0.03, zc = road + 0.06, zk = road + 0.25, zw = GROUND.wall, c = 0.03;
  const g0 = GROUND.gutter, kf = g0 + Math.hypot(curb + 0.02 - c, 0.03), kc = kf + Math.hypot(c, c), kt = kc + (zk - zc), total = kt + (zw - zk);
  const sec = { g0, kf, kc, kt, total };
  if (!kit.has('rua:asfalto')) {
    const [ca, ga] = canvas(AW, AH); paintAsphalt(ga, mulberry32(seed * 31 + 5), { ...M, road }); punch(ga, 0.45); kit.setTexture('rua:asfalto', textureOf(T, ca, [true, false]));
    const [cs, gs] = canvas(SW, SROW * 2); paintWalk(gs, mulberry32(seed * 37 + 9), 0, 1, { ...M, road, section: sec }); paintWalk(gs, mulberry32(seed * 41 + 13), SROW, -1, { ...M, road, section: sec }); punch(gs, 0.42);
    kit.setTexture('rua:calcada', textureOf(T, cs, [true, false]));
  }
  const NIGHT = '#c6cade', I = new T.Matrix4();   // (lighter than the walls' tint: the pools of the street lamps must read on the ground)
  // the asphalt
  const A = new Shape(T);
  A.sheet([-far, 0, hw], [far * 2, 0, 0], [0, 0, -hw * 2], 3, (a, b) => [(-far + far * 2 * a + L / 2) / L, b]);
  tb.add({ c: NIGHT, map: 'rua:asfalto', emissive: 0.16 }, A.geometry(), I);
  // the pavements: the section pulled along the street, slab by slab near, in long pieces far away
  const W = new Shape(T), rows = 3, lifted = new Map((M.lifted ?? []).map(([x, sd, row, h]) => [`${Math.round((x + L / 2) / 1.5)}|${sd}|${row}`, h]));
  for (const s of [1, -1]) {
    const v = (t) => 1 - ((s > 0 ? 0 : SROW) + (t / total) * SROW) / (SROW * 2), u = (x) => (x + L / 2) / L;
    const prof = [[hw, 0, 0], [z1, -0.02, g0], [zf, curb - c, kf], [zc, curb, kc], [zk, curb, kt]];
    for (let i = 0; i <= rows; i++) prof.push([zk + ((zw - zk) * i) / rows, curb, kt + ((zw - zk) * i) / rows]);
    for (let x = -far; x < far - 1e-6;) {
      const fine = x >= -66 && x < 66, x2 = fine ? x + 1.5 : Math.min(x < -66 ? -66 : far, x + 6), ci = Math.round((x + L / 2) / 1.5);
      for (let k = 0; k < prof.length - 1; k++) {
        if (k === 4) continue;   // (the kerb's top ends where the slabs begin: the same place)
        const [za, ya, ta] = prof[k], [zb, yb, tb2] = prof[k + 1], row = k - 5, up = fine && row >= 0 ? lifted.get(`${ci}|${s}|${row}`) : 0;
        const pts = [[x, ya, s * za], [x2, ya, s * za], [x2, yb + (up ?? 0), s * zb], [x, yb + (up ? up * 0.3 : 0), s * zb]], uvs = [[u(x), v(ta)], [u(x2), v(ta)], [u(x2), v(tb2)], [u(x), v(tb2)]];
        W.poly(pts, [0, 1, s * 0.01], uvs);
        if (up) { const e = 0.012 / total * 0.5, vj = v(tb2) + e; W.poly([[x, curb, s * zb], [x2, curb, s * zb], [x2, yb + up, s * zb], [x, yb + up * 0.3, s * zb]], [0, 0, s], [[u(x), vj], [u(x2), vj], [u(x2), vj], [u(x), vj]]); W.poly([[x2, curb, s * za], [x2, curb, s * zb], [x2, curb + up, s * zb]], [1, 0, 0], [[u(x2) - 0.0002, v(ta)], [u(x2) - 0.0002, v(tb2)], [u(x2) - 0.0002, v(tb2)]]); }
      }
      x = x2;
    }
  }
  const walkSpec = { c: NIGHT, map: 'rua:calcada', emissive: 0.2 };
  tb.add(walkSpec, W.geometry(), I);
  return { walkSpec, section: sec };
}
