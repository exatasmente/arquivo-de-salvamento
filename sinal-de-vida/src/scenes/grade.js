// The grate of the first cutscene (the city seen through the ventilation grate of the shaft): a welded steel grate of real geometry a little
// in front of the camera, so that what the game plays and what the film mode films is the same picture (a CSS layer would not be in the film).
// It is made as a grate is made: upright flat bars standing on edge (deeper than they are wide), flat cross bars welded behind them, a weld
// bead in each corner where they meet, and a frame of heavier bar round all of it. Each bar has a chamfer on its two near edges, which is
// where the paint has gone and the steel catches the light of the street.
// It is painted as the props and the city are (models/city/paintkit.js): dark paint with large masses of value, chipped down to the primer
// and the steel, rust that blooms at the welds and runs down, a worn pale edge, the shade of a bar on the one behind it. The night is in the
// painting: the faces turned to the shaft are dark, the flanks get lighter toward the street. Nothing of it glows: the material is the
// look's own, with about the share of unlit painting the props have (models/props/place.js).
// The whole grate is two meshes: the painted one and the shell of its outline (models/outline.js), with the outline's material of the render.
// `place(eye, at, t)` puts the grate in front of the camera, looking where it looks, with a very slow sway (the camera is a hand-held thing).
// GRATE: `dist` from the eye to the near face, `pitch` between bars, `bar` the width of a bar's face, `cols` upright bars, `rows` cross bars.
// It is read when the grate is built (a cutscene may tune it for its picture before building).
import { mulberry32 } from '../../vendor/engine/rng.js';
import { kitOf, OUTLINE_SPEC } from '../models/kit.js';
import { OUTLINE } from '../models/outline.js';
import * as P from '../models/city/paintkit.js';

export const GRATE = { dist: 0.62, pitch: 0.21, bar: 0.03, cols: 9, rows: 4 };

// the colours of the painting (as in daylight; the material's tint and the scene's light make the night)
const PAINT = [50, 51, 50], PRIMER = [124, 62, 46], STEEL = [150, 156, 162], BRIGHT = [226, 232, 240];
const RUST = '160,84,40', RUST_D = '94,48,28', GRIME = '26,22,22', COOL = '196,214,236', SPILL = [128, 146, 178];
const TINT = '#b0aca4', PAINTED = 0.26;            // the night's tint over the painting, and how much of the painting shows whatever the light
const ATLAS = 4096, DENSITY = 2048, GUT = 6;     // the painting's width, its most pixels per metre, the gap between two strips

/** The sizes of a grate of these numbers, in metres (x across, y up, z away from the eye). */
function layout(G) {
  const { dist, pitch, bar, cols, rows } = G;
  const w = pitch * (cols - 1), h = pitch * (rows - 1);
  const dv = bar * 1.35, dh = bar * 1.15, fw = bar * 1.7, ch = bar * 0.13, proud = bar * 0.14;
  const iw = w + pitch, ih = h + pitch;                                       // the opening inside the frame: half a pitch beyond the last bars
  return { dist, pitch, bar, cols, rows, w, h, dv, dh, fw, ch, proud, iw, ih, ow: iw + fw * 2, oh: ih + fw * 2, z0: dist - bar / 2 };
}

// ---- the painting ---------------------------------------------------------------------------------------------------------------------
/** Runs fn with the context turned so that "down" (+y) is along the strip (+x of the canvas), at (x, y): for the bars that stand upright. */
const along = (g, x, y, fn) => { g.save(); g.transform(0, -1, 1, 0, x, y); fn(); g.restore(); };
const clipTo = (g, q) => { g.save(); g.beginPath(); g.rect(q.x, q.y, q.w, q.h); g.clip(); };

/** Steel laid bare, for under a chip: its tone, a few scratches, a little rust. */
const bare = (R, rusty) => (g, x, y, rx, ry) => {
  g.fillStyle = P.css(P.scale(STEEL, 0.85 + R() * 0.3)); g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  g.fillStyle = `rgba(${P.PALE},0.5)`; for (let i = 0; i < 3; i++) g.fillRect(x - rx + R() * rx, y - ry + R() * ry * 2, rx * (0.5 + R()), 1);
  if (R() < rusty) P.blob(g, x + (R() - 0.5) * rx, y + (R() - 0.5) * ry, rx * (0.5 + R() * 0.6), ry * (0.6 + R() * 0.6), R() < 0.5 ? RUST : RUST_D, 0.85);
};
/** Paint chipped off at (x, y): down to the primer, and inside it down to the steel. */
function flake(g, R, x, y, rx, ry, rusty = 0.45) {
  P.chip(g, R, x, y, rx, ry, PRIMER, { lip: 0.35 });
  if (rx > 3) P.chip(g, R, x + (R() - 0.5) * rx * 0.3, y + (R() - 0.5) * ry * 0.3, rx * (0.5 + R() * 0.25), ry * (0.5 + R() * 0.25), bare(R, rusty), { lip: 0.65, line: 0.8 });
}
/** The worn edge along a long side of a strip (y: the row): a pale broken line where the paint is gone, cooler and brighter in places. */
function wornEdge(g, R, x0, x1, y, t, a) {
  for (let x = x0 - R() * 40; x < x1;) {
    const len = 40 + R() * 320, col = R() < 0.3 ? P.PALE : COOL, k = a * (0.35 + R() * 0.65);
    P.blob(g, x + len / 2, y, len * 0.56, t * 1.5, col, k);                                        // soft at its two ends, as a brush leaves it
    g.fillStyle = `rgba(${col},${k * 0.7})`; g.fillRect(x + len * 0.18, y - t * 0.3, len * 0.64, t * 0.6);
    if (R() < 0.3) P.blob(g, x + len * R(), y, 5 + R() * 9, t * 1.6, RUST, 0.5);
    x += len + (R() < 0.6 ? 0 : 6 + R() * R() * 120);
  }
}
/** Rust at (x, y) with its run: `down` 'v' runs down the canvas, 'u' along the strip. */
function rustAt(g, R, x, y, s, down, len) {
  P.blob(g, x, y, s * (1 + R() * 0.6), s * (0.8 + R() * 0.5), RUST_D, 0.55); P.blob(g, x, y, s * 0.6, s * 0.5, RUST, 0.75);
  const run = () => { for (let i = 0; i < 2 + Math.floor(R() * 3); i++) P.drip(g, R, (R() - 0.5) * s * 1.2, 0, len * (0.3 + R() * 0.7), 1.4 + R() * 2.6, R() < 0.6 ? RUST : RUST_D, 0.5 + R() * 0.3); };
  if (down === 'u') along(g, x, y, run); else { g.save(); g.translate(x, y); run(); g.restore(); }
}
/**
 * The near face of a bar, in the strip q (its length along x). o.down: 'v' (a cross bar: down is down the strip) or 'u' (an upright: down is
 * along it); o.cross: where the bars in front of it cross (pixels along) and o.cw their width: their shade and the welds' rust go there;
 * o.bolts: a bolt every so many pixels (the frame).
 */
function paintFace(g, R, q, o = {}) {
  const { x, y, w, h } = q, down = o.down ?? 'v', tone = 0.88 + R() * 0.26;
  clipTo(g, q);
  g.fillStyle = P.css(P.scale(PAINT, tone)); g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, Math.round(w / 70), h * 1.3, '14,14,16', '120,126,134', 0.3);
  // the brush of the coat and the grain of the bar: long thin strokes along it
  for (let i = 0; i < w / 14; i++) { g.fillStyle = `rgba(${R() < 0.55 ? P.INK : COOL},${0.05 + R() * 0.1})`; g.fillRect(x + R() * w, y + R() * h, 30 + R() * 260, 1 + R() * 1.6); }
  // grime run down from the top
  if (down === 'v') P.drips(g, R, x, x + w, y + 1, h * 0.9, GRIME, 0.5, 22);
  else for (let i = 0; i < w / 260; i++) along(g, x + R() * w, y + h * (0.15 + R() * 0.7), () => P.drip(g, R, 0, 0, 90 + R() * 260, 2 + R() * 4, GRIME, 0.45));
  // the bars in front: their shade on this one, the rust of the welds and its run
  for (const cx of o.cross ?? []) {
    const hw = (o.cw ?? h) / 2;
    for (const s of [-1, 1]) { const gr = g.createLinearGradient(cx + s * hw, 0, cx + s * (hw + h * 0.5), 0); gr.addColorStop(0, `rgba(${P.INK},${s < 0 ? 0.75 : 0.5})`); gr.addColorStop(1, `rgba(${P.INK},0)`); g.fillStyle = gr; g.fillRect(Math.min(cx + s * hw, cx + s * (hw + h * 0.5)), y, h * 0.5, h); }
    for (const s of [-1, 1]) if (R() < 0.8) rustAt(g, R, cx + s * (hw + 4 + R() * 5), y + h * (0.25 + R() * 0.5), 5 + R() * 8, down, h * (0.4 + R() * 0.5));
  }
  // paint worn thin (the steel shows through, in long soft patches), then fallen off: most of it by the edges, where things knock
  for (let i = 0; i < w / 220; i++) P.blob(g, x + R() * w, y + h * (0.15 + R() * 0.7), 40 + R() * 150, h * (0.25 + R() * 0.4), '138,146,156', 0.3 + R() * 0.3);
  for (let i = 0; i < w / 46; i++) {
    const edge = R() < 0.62, top = R() < 0.5, rx = 5 + R() * R() * 58, ry = Math.min(h * 0.36, 3 + R() * R() * 20);
    flake(g, R, x + R() * w, edge ? (top ? y + ry * 0.4 : y + h - ry * 0.4) : y + h * (0.25 + R() * 0.5), rx, ry);
  }
  for (let i = 0; i < w / 520; i++) rustAt(g, R, x + R() * w, y + h * (0.2 + R() * 0.5), 7 + R() * 16, down, down === 'v' ? h * 0.7 : 120 + R() * 200);
  for (let i = 0; i < w / 420; i++) P.crack(g, R, x + R() * w, y + R() * h, 12 + R() * 34, (R() - 0.5) * 0.7, 0.8, 0.45);   // scratches
  // bolts of the frame: the head with its shade, the light on its upper edge, the rust under it
  if (o.bolts) for (let bx = x + o.bolts * 0.5; bx < x + w; bx += o.bolts) {
    const by = y + h * 0.5, br = h * 0.2;
    P.blob(g, bx + br * 0.25, by + br * 0.4, br * 1.9, br * 1.9, P.INK, 0.8);
    rustAt(g, R, bx, by + br * 0.6, br * 0.9, down, h * 0.5);
    g.fillStyle = P.css(P.scale(STEEL, 0.62)); g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.3; g.lineTo(bx + Math.cos(a) * br, by + Math.sin(a) * br); } g.closePath(); g.fill();
    g.strokeStyle = `rgba(${P.INK},0.9)`; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = `rgba(${COOL},0.9)`; g.lineWidth = 1.8; g.beginPath(); g.arc(bx, by, br * 0.72, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    g.fillStyle = `rgba(${P.INK},0.6)`; g.beginPath(); g.arc(bx, by, br * 0.3, 0, 6.3); g.fill();
  }
  // the dark crease inside the two long edges, then the worn pale edge on them
  g.fillStyle = `rgba(${P.INK},0.35)`; g.fillRect(x, y + 3.5, w, 1.5); g.fillRect(x, y + h - 5, w, 1.5);
  wornEdge(g, R, x, x + w, y + 1.5, 3, 0.95); wornEdge(g, R, x, x + w, y + h - 1.5, 3, 0.7);
  P.finish(g, R, x, y, w, h, { n: Math.round((w * h) / 2400), wide: 5, len: 44, a: 0.1, dir: 0, drift: 3 });
  g.restore();
}
/**
 * A flank of a bar (the face along its depth), in the strip q: v = 0 is the edge by the eye, v = h the edge by the street. The light of the
 * street spills in over it, so it gets lighter and cooler toward the street; `kind`: 'top' (dust lies on it), 'bottom' (dark, rust hangs
 * from it) or 'side'.
 */
function paintFlank(g, R, q, kind) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css(P.scale(PAINT, kind === 'bottom' ? 0.72 : kind === 'top' ? 1.12 : 0.95)); g.fillRect(x, y, w, h);
  const gr = g.createLinearGradient(0, y, 0, y + h), k = kind === 'bottom' ? 0.34 : kind === 'top' ? 0.8 : 0.6;
  gr.addColorStop(0, `rgba(${P.INK},0.6)`); gr.addColorStop(0.4, `rgba(${P.INK},0)`); gr.addColorStop(0.45, P.css(SPILL, 0)); gr.addColorStop(1, P.css(SPILL, k));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, Math.round(w / 90), h * 1.1, '14,14,16', '120,126,134', 0.26);
  for (let i = 0; i < w / 18; i++) { g.fillStyle = `rgba(${R() < 0.55 ? P.INK : COOL},${0.05 + R() * 0.1})`; g.fillRect(x + R() * w, y + R() * h, 30 + R() * 220, 1 + R() * 1.6); }
  for (let i = 0; i < w / 90; i++) { const rx = 4 + R() * R() * 26, ry = 2.5 + R() * R() * 10; flake(g, R, x + R() * w, y + h * (0.1 + R() * 0.85), rx, ry, kind === 'top' ? 0.2 : 0.6); }
  if (kind === 'top') for (let i = 0; i < w / 6; i++) { g.fillStyle = `rgba(${P.PALE},${0.1 + R() * 0.25})`; g.fillRect(x + R() * w, y + h * (0.3 + R() * 0.7), 1 + R() * 2.5, 1 + R() * 1.5); }       // dust and grit
  if (kind !== 'top') for (let i = 0; i < w / (kind === 'bottom' ? 150 : 380); i++) { const px = x + R() * w, py = y + h * (0.2 + R() * 0.7); P.blob(g, px, py, 8 + R() * 18, 5 + R() * 9, RUST_D, 0.55); P.blob(g, px, py, 4 + R() * 8, 3 + R() * 5, RUST, 0.7); }
  wornEdge(g, R, x, x + w, y + h - 1.5, 3, kind === 'bottom' ? 0.6 : 0.95);                                    // the edge by the street catches its light
  wornEdge(g, R, x, x + w, y + 1.5, 2.4, 0.4);
  P.finish(g, R, x, y, w, h, { n: Math.round((w * h) / 2800), wide: 5, len: 44, a: 0.09, dir: 0, drift: 2 });
  g.restore();
}
/** The chamfer of a bar's near edge: the steel itself, bright where things rub, with what is left of the paint and some rust. */
function paintEdge(g, R, q) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css(P.mixc(PAINT, STEEL, 0.3)); g.fillRect(x, y, w, h);
  for (let px = x - 40; px < x + w;) {
    const len = 30 + R() * R() * 420, k = R();
    if (k < 0.58) { P.blob(g, px + len / 2, y + h / 2, len * 0.6, h * 1.6, P.css(P.mixc(STEEL, BRIGHT, 0.2 + R() * 0.8)).slice(5, -3), 0.95); }
    else if (k < 0.7) P.blob(g, px + len / 2, y + h / 2, Math.min(len, 50) * 0.5, h * 1.2, R() < 0.5 ? RUST : RUST_D, 0.8);
    px += len * (0.6 + R() * 0.5);
  }
  for (let i = 0; i < w / 30; i++) { g.fillStyle = `rgba(${R() < 0.5 ? P.INK : P.PALE},${0.12 + R() * 0.25})`; g.fillRect(x + R() * w, y + R() * h, 4 + R() * 40, 1); }
  g.restore();
}
/** A weld bead: steel left as it cooled, in ripples across it, with the tint of the heat and rust in the hollows. v across, u along. */
function paintWeld(g, R, q) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css(P.scale(STEEL, 0.6)); g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, Math.round(w / 14), h, RUST_D, RUST, 0.6);
  for (let px = x + 2; px < x + w; px += 5 + R() * 4) {
    g.strokeStyle = `rgba(${P.INK},${0.45 + R() * 0.3})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, y); g.quadraticCurveTo(px + h * 0.35, y + h / 2, px, y + h); g.stroke();
    g.strokeStyle = `rgba(${COOL},${0.25 + R() * 0.35})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px + 2, y + h * 0.15); g.quadraticCurveTo(px + 2 + h * 0.3, y + h * 0.4, px + 2.5, y + h * 0.6); g.stroke();
    if (R() < 0.3) P.blob(g, px, y + R() * h, 4 + R() * 5, 3 + R() * 4, R() < 0.5 ? RUST : '120,104,150', 0.6);
  }
  g.restore();
}

/** The painting of a grate and where each of its parts is in it. Kept by the grate's numbers: the game and its cutscene share one. */
const painted = new Map();
function paintingOf(T, L) {
  const key = [L.pitch, L.bar, L.cols, L.rows].join('|');
  if (painted.has(key)) return painted.get(key);
  const S = Math.min(DENSITY, (ATLAS - GUT * 2) / L.ow), px = (m) => Math.max(4, Math.round(m * S));
  // a shelf of strips: each asks for its length and its height
  let cx = GUT, cy = GUT, rowH = 0; const jobs = [];
  const strip = (len, hgt, fn) => { const w = px(len), h = px(hgt); if (cx + w + GUT > ATLAS) { cx = GUT; cy += rowH + GUT; rowH = 0; } const q = { x: cx, y: cy, w, h }; cx += w + GUT; rowH = Math.max(rowH, h); jobs.push([q, fn]); return q; };
  const R = mulberry32(2026 + L.cols * 31 + L.rows);
  const xs = Array.from({ length: L.cols }, (_, i) => -L.w / 2 + i * L.pitch), ys = Array.from({ length: L.rows }, (_, j) => L.h / 2 - j * L.pitch);
  const A = {
    S,
    cross: ys.map(() => strip(L.iw, L.bar, (g, q) => paintFace(g, R, q, { down: 'v', cross: xs.map((x) => q.x + ((x + L.iw / 2 + L.bar * 0.2) / (L.iw + L.bar * 0.4)) * q.w), cw: L.bar * S }))),
    upright: xs.map(() => strip(L.ih, L.bar, (g, q) => paintFace(g, R, q, { down: 'u' }))),
    frameH: strip(L.ow, L.fw, (g, q) => paintFace(g, R, q, { down: 'v', bolts: L.pitch * S })),
    frameV: strip(L.ih, L.fw, (g, q) => paintFace(g, R, q, { down: 'u', bolts: L.pitch * S })),
    top: strip(L.ow, L.dv, (g, q) => paintFlank(g, R, q, 'top')),
    bottom: strip(L.ow, L.dv, (g, q) => paintFlank(g, R, q, 'bottom')),
    side: strip(L.ow, L.dv, (g, q) => paintFlank(g, R, q, 'side')),
    edge: strip(L.ow, 14 / S, (g, q) => paintEdge(g, R, q)),
    weld: strip(520 / S, 30 / S, (g, q) => paintWeld(g, R, q)),
  };
  const [c, g] = P.canvas(ATLAS, cy + rowH + GUT);
  g.fillStyle = P.css(P.scale(PAINT, 0.9)); g.fillRect(0, 0, c.width, c.height);
  for (const [q, fn] of jobs) fn(g, q);
  P.punch(g, 0.34);
  A.W = c.width; A.H = c.height; A.map = P.textureOf(T, c);
  painted.set(key, A);
  return A;
}

// ---- the geometry ---------------------------------------------------------------------------------------------------------------------
/** Collects flat quads (and triangles) with the normal of each and a uv from a strip of the painting. */
function mesher(T, A) {
  const pos = [], nor = [], uv = [], a = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3();
  /** uv of a point of a strip: s along (0..1 over [u0, u1] of its length), t across (kept half a pixel inside it). */
  const at = (q, s, t) => [(q.x + s * q.w) / A.W, 1 - (q.y + 0.5 + t * (q.h - 1)) / A.H];
  const tri = (p, t, want) => {
    n.crossVectors(a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]), b.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2])).normalize();
    const flip = n.dot(a.set(...want)) < 0; if (flip) n.negate();
    for (const k of flip ? [0, 2, 1] : [0, 1, 2]) { pos.push(...p[k]); nor.push(n.x, n.y, n.z); uv.push(...t[k]); }
  };
  return {
    at,
    /** A quad of four corners in order round it, each [x, y, z] with its uv; `want`: roughly where its outside is. */
    quad(p, t, want) { tri([p[0], p[1], p[2]], [t[0], t[1], t[2]], want); tri([p[0], p[2], p[3]], [t[0], t[2], t[3]], want); },
    tri,
    geometry() { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return geo; },
    get tris() { return pos.length / 9; },
  };
}
/**
 * A bar: `up` (it stands upright) or not, its centre (cx, cy), its length, the width f of its face, from z to z + d, with the chamfer c on
 * its two near edges. It is the near face, the two chamfers and the two flanks (the far face is never seen from the shaft).
 * strips: { face, a, b } (a: the flank at the left or the top, b: the other), each [strip, s0, s1] (the stretch of its length used).
 */
function bar(M, A, { up, cx, cy, len, f, z, d, c }, strips) {
  // (al along from the left or the top, ac across from the left or the top, dz into the depth) -> a place
  const at = up ? (al, ac, dz) => [cx - f / 2 + ac, cy + len / 2 - al, z + dz] : (al, ac, dz) => [cx - len / 2 + al, cy + f / 2 - ac, z + dz];
  const dir = up ? (ac, dz) => [ac, 0, dz] : (ac, dz) => [0, -ac, dz];
  const face = (q, ac0, dz0, ac1, dz1, t0, t1, want) => { const [st, s0, s1] = q; M.quad([at(0, ac0, dz0), at(len, ac0, dz0), at(len, ac1, dz1), at(0, ac1, dz1)], [M.at(st, s0, t0), M.at(st, s1, t0), M.at(st, s1, t1), M.at(st, s0, t1)], want); };
  face(strips.face, c, 0, f - c, 0, c / f, 1 - c / f, dir(0, -1));
  face(strips.edge, 0, c, c, 0, 0, 1, dir(-1, -1)); face(strips.edge2, f, c, f - c, 0, 0, 1, dir(1, -1));
  face(strips.a, 0, c, 0, d, c / d, 1, dir(-1, 0)); face(strips.b, f, c, f, d, c / d, 1, dir(1, 0));
}
/** A weld bead along y from y0 to y1, in the corner between a flank at x (the bead goes to the side s) and a face at z. */
function bead(M, A, R, x, s, z, y0, y1, r) {
  const n = 3, q = A.weld, u0 = R() * 0.55, du = 0.42 / n, ring = [];
  for (let i = 0; i <= n; i++) { const k = i === 0 || i === n ? 0.45 : 0.8 + R() * 0.4, y = y0 + (y1 - y0) * (i / n) + (i > 0 && i < n ? (R() - 0.5) * (y1 - y0) * 0.12 : 0); ring.push([[x, y, z - r * k], [x + s * r * k * 0.66, y, z - r * k * 0.66], [x + s * r * k, y, z]]); }
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) M.quad([ring[i][j], ring[i + 1][j], ring[i + 1][j + 1], ring[i][j + 1]], [M.at(q, u0 + du * i, j / 2), M.at(q, u0 + du * (i + 1), j / 2), M.at(q, u0 + du * (i + 1), (j + 1) / 2), M.at(q, u0 + du * i, (j + 1) / 2)], [s * (j ? 0.9 : 0.4), 0, j ? -0.4 : -0.9]);
  for (const [i, up] of [[0, -1], [n, 1]]) M.tri(ring[i], [M.at(q, u0, 0), M.at(q, u0, 0.5), M.at(q, u0, 1)], [0, up, -0.2]);
}
/** The outline's shell of a box: its eight corners, each with the normal of a corner, so the shell does not open (models/outline.js). */
function shellBox(out, x0, x1, y0, y1, z0, z1) {
  const base = out.pos.length / 3, k = 1 / Math.sqrt(3);
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) { out.pos.push(x, y, z); out.nor.push((x === x0 ? -1 : 1) * k, (y === y0 ? -1 : 1) * k, (z === z0 ? -1 : 1) * k); }
  for (const f of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) out.idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
}

export function buildGrate(r) {
  const T = r.THREE, g = new T.Group();
  g.visible = false; g.name = 'grade';
  const G = { ...GRATE };
  // it is made when it is first shown: a game that begins past the first cutscene never pays for the painting
  let made = false;
  const make = () => { if (!made) { made = true; fill(r, g, G); } };
  const p = new T.Vector3();
  return {
    group: g,
    show(on) { if (on) make(); g.visible = Boolean(on); },
    get visible() { return g.visible; },
    place(eye, at, t = 0) {
      p.set(...eye); g.position.copy(p);
      g.position.y += Math.sin(t * 0.7) * 0.004;
      g.lookAt(at[0], at[1], at[2]);
      g.updateMatrixWorld(true);
    },
  };
}

/** Puts the grate's two meshes into its group. */
function fill(r, g, G) {
  const T = r.THREE, t0 = globalThis.performance?.now() ?? 0;
  const L = layout(G), A = paintingOf(T, L), t1 = globalThis.performance?.now() ?? 0, M = mesher(T, A), R = mulberry32(77 + L.cols * 13 + L.rows);
  const shell = { pos: [], nor: [], idx: [] };
  const xs = Array.from({ length: L.cols }, (_, i) => -L.w / 2 + i * L.pitch), ys = Array.from({ length: L.rows }, (_, j) => L.h / 2 - j * L.pitch);
  const zc = L.z0 + L.dv, tuck = L.bar * 0.2;                                   // the cross bars begin where the uprights end; a bar goes a little into the frame
  const whole = (q, flipped = false) => (flipped ? [q, 1, 0] : [q, 0, 1]);
  /** A stretch of a long strip for a shorter bar, begun at a place of its own (so no two bars show the same painting side by side). */
  const part = (q, len) => { const k = Math.min(1, (len * A.S) / q.w), s = R() * (1 - k); return R() < 0.5 ? [q, s, s + k] : [q, s + k, s]; };
  const sides = (len) => ({ edge: part(A.edge, len), edge2: part(A.edge, len) });
  // the uprights, in front
  xs.forEach((x, i) => {
    const len = L.ih + tuck * 2;
    bar(M, A, { up: true, cx: x, cy: 0, len, f: L.bar, z: L.z0, d: L.dv, c: L.ch }, { face: whole(A.upright[i]), a: part(A.side, len), b: part(A.side, len), ...sides(len) });
    shellBox(shell, x - L.bar / 2, x + L.bar / 2, -L.ih / 2, L.ih / 2, L.z0, L.z0 + L.dv);
  });
  // the cross bars, behind them
  ys.forEach((y, j) => {
    const len = L.iw + tuck * 2;
    bar(M, A, { up: false, cx: 0, cy: y, len, f: L.bar, z: zc, d: L.dh, c: L.ch }, { face: whole(A.cross[j]), a: part(A.top, len), b: part(A.bottom, len), ...sides(len) });
    shellBox(shell, -L.iw / 2, L.iw / 2, y - L.bar / 2, y + L.bar / 2, zc, zc + L.dh);
  });
  // the welds: one each side of an upright, on every cross bar
  for (const x of xs) for (const y of ys) for (const s of [-1, 1]) bead(M, A, R, x + s * L.bar / 2, s, zc, y - L.bar * (0.4 + R() * 0.08), y + L.bar * (0.4 + R() * 0.08), L.bar * (0.3 + R() * 0.1));
  // the frame: heavier bar, a little proud of the uprights and as deep as the two layers
  const fz = L.z0 - L.proud, fd = L.dv + L.dh + L.proud, fy = (L.ih + L.fw) / 2, fx = (L.iw + L.fw) / 2;
  for (const s of [-1, 1]) {
    bar(M, A, { up: false, cx: 0, cy: s * fy, len: L.ow, f: L.fw, z: fz, d: fd, c: L.ch * 1.3 }, { face: whole(A.frameH, s < 0), a: part(A.top, L.ow), b: part(A.bottom, L.ow), ...sides(L.ow) });
    shellBox(shell, -L.ow / 2, L.ow / 2, s * fy - L.fw / 2, s * fy + L.fw / 2, fz, fz + fd);
    bar(M, A, { up: true, cx: s * fx, cy: 0, len: L.ih, f: L.fw, z: fz, d: fd, c: L.ch * 1.3 }, { face: whole(A.frameV, s < 0), a: part(A.side, L.ih), b: part(A.side, L.ih), ...sides(L.ih) });
    shellBox(shell, s * fx - L.fw / 2, s * fx + L.fw / 2, -L.ih / 2, L.ih / 2, fz, fz + fd);
  }
  const body = new T.Mesh(M.geometry(), r.mat(TINT, { map: A.map, emissive: PAINTED }));
  body.name = 'grade-pintada'; body.frustumCulled = false; g.add(body);
  if (OUTLINE.on) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(shell.pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(shell.nor, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array((shell.pos.length / 3) * 2), 2)); geo.setIndex(shell.idx);
    const hull = new T.Mesh(geo, kitOf(r).mat(OUTLINE_SPEC));
    hull.name = 'grade_hull'; hull.frustumCulled = false; hull.renderOrder = 1; g.add(hull);
  }
  g.userData.bars = L.cols + L.rows;                                           // (the tests count the bars: they are one mesh now)
  g.userData.tris = M.tris + shell.idx.length / 3;
  g.userData.paintMs = Math.round(t1 - t0);                                    // (0 when the painting was already made for another grate)
}
