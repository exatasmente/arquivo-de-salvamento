// The grate of the station's ventilation shaft: a thing of the street, fixed in the pavement (models/city/street.js puts it in the entity
// `bocaRua`, under the viaduct). It is not in front of any camera: the first cutscene looks up through it from inside the shaft, the dogs of
// the fleet walk over it, and the street scenes see the same grate from above, where Jonas climbs out.
// It is made as a floor grate is made: flat bars standing on edge (deeper than they are wide) that run along the avenue, square cross rods
// let into their tops, a band of the same flat bar round each of its two leaves (the smaller one, over the ladder, is the access hatch, with
// its hinges and its lifting plate), a beam under the joint of the two, a steel frame level with the pavement and a collar of concrete round
// it. A weld bead where each bar meets its band and where each rod crosses a bar. Under it, the walls of the shaft going down into the dark.
// Everything is in the entity's own frame: x along the avenue, y up with 0 at the top of the pavement, z across (the frame's top is level with the pavement).
// It is painted as the props and the city are (models/city/paintkit.js): dark paint with large masses of value, chipped down to the primer
// and the steel, rust that blooms at the welds and runs, a worn pale edge; the tops of the bars are polished by years of feet. The night is
// in the painting: the undersides are dark, the flanks get lighter toward the street, the walls of the shaft are lit only near the top.
// Nothing of it glows: the material is the look's own, with about the share of unlit painting the props have (models/props/place.js).
// The whole of it is two meshes: the painted one and the shell of its outline (models/outline.js). The painting is made once (kept by the
// grate's numbers) and the meshes carry `keep`, so the street does not join them into its own (scenes/common.js): the grate can be found
// by its name, `grade`, and its place in the world never changes.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { kitOf, OUTLINE_SPEC } from '../models/kit.js';
import { OUTLINE } from '../models/outline.js';
import * as P from '../models/city/paintkit.js';

/**
 * The grate's numbers, in metres: the opening of the shaft (x0..x1 by z0..z1, in the entity's frame), `split` where its two leaves meet,
 * `pitch` between two bars, `bar` their width and `deep` their depth, `rod` the side of a cross rod and `rods` their pitch, `frame` the
 * width of the steel frame and `collar` of the concrete round it, `well` how far down the walls go, `cable` where the thick cable goes in
 * ([x, z]: the bars there are sawn through).
 */
export const GRATE = { x0: -0.9, x1: 1.2, z0: -0.75, z1: 0.75, split: -0.3, pitch: 0.1, bar: 0.016, deep: 0.05, rod: 0.012, rods: 0.2, frame: 0.04, collar: 0.16, well: 2.6, cable: [1.08, 0.02] };
/** What the grate takes of the pavement (the hole the ground leaves for it), in the entity's frame. */
export const footprint = (G = GRATE) => { const m = G.frame + G.collar - 0.004; return { x0: G.x0 - m, x1: G.x1 + m, z0: G.z0 - m, z1: G.z1 + m }; };

// the colours of the painting (as in daylight; the material's tint and the scene's light make the night)
const PAINT = [50, 51, 50], PRIMER = [124, 62, 46], STEEL = [150, 156, 162], BRIGHT = [226, 232, 240], CONC = [120, 121, 122];
const RUST = '160,84,40', RUST_D = '94,48,28', GRIME = '26,22,22', COOL = '196,214,236', SPILL = [128, 146, 178];
const TINT = '#b0aca4', PAINTED = 0.26;            // the night's tint over the painting, and how much of the painting shows whatever the light
const ATLAS = 4096, GUT = 6;                       // the painting's width, the gap between two strips
const LONG = 2250, WALL_S = 420;                   // the pixels of a strip along a bar (1.5 m of it), and of a metre of the shaft's wall

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

/** The top of a bar: steel polished by the feet in long stretches, what is left of the paint in others, rust, grit caught at its edges. */
function paintTop(g, R, q) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css(P.mixc(PAINT, STEEL, 0.42)); g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, Math.round(w / 90), h * 1.4, '14,14,16', '150,156,164', 0.3);
  for (let px = x - 40; px < x + w;) {
    const len = 60 + R() * R() * 500, k = R();
    if (k < 0.5) P.blob(g, px + len / 2, y + h * (0.35 + R() * 0.3), len * 0.6, h * (0.5 + R() * 0.5), k < 0.18 ? '226,232,240' : '170,176,184', 0.5 + R() * 0.4);
    else if (k < 0.66) P.blob(g, px + len / 2, y + h / 2, Math.min(len, 80) * 0.5, h * 0.9, R() < 0.5 ? RUST : RUST_D, 0.7);
    else if (k < 0.8) { g.fillStyle = P.css(P.scale(PAINT, 0.8 + R() * 0.3), 0.85); g.fillRect(px, y, len * 0.7, h); }
    px += len * (0.5 + R() * 0.6);
  }
  for (let i = 0; i < w / 26; i++) { g.fillStyle = `rgba(${R() < 0.5 ? P.INK : P.PALE},${0.12 + R() * 0.25})`; g.fillRect(x + R() * w, y + R() * h, 6 + R() * 50, 1 + R()); }
  g.fillStyle = `rgba(${P.INK},0.4)`; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2);
  g.restore();
}
/**
 * The concrete collar round the frame, seen from above, in the strip q: v = 0 is its outer edge (by the paving), v = h the edge by the
 * steel, where the rust bleeds out. Floated concrete with its pits, cracks, chips off the outer edge, and the drawn line at its two edges.
 */
function paintConcrete(g, R, q) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css(P.scale(CONC, 0.92 + R() * 0.14)); g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, Math.round(w / 60), h * 0.9, '40,34,30', P.PALE, 0.26);
  for (let i = 0; i < (w * h) / 500; i++) { g.fillStyle = `rgba(${R() < 0.6 ? P.INK : P.PALE},${0.06 + R() * 0.12})`; g.fillRect(x + R() * w, y + R() * h, 8 + R() * 60, 1 + R() * 2); }
  for (let i = 0; i < (w * h) / 900; i++) { const px = x + R() * w, py = y + R() * h, s = 1 + R() * 2.5; g.fillStyle = `rgba(${P.INK},${0.3 + R() * 0.4})`; g.fillRect(px, py, s, s); g.fillStyle = `rgba(${P.PALE},0.35)`; g.fillRect(px, py + s, s, 1); }
  for (let px = x + R() * 120; px < x + w; px += 60 + R() * 420) { const s = 14 + R() * 30; P.blob(g, px, y + h - 2, s * (1.5 + R()), h * (0.3 + R() * 0.4), RUST_D, 0.4); P.blob(g, px, y + h, s, h * 0.2, RUST, 0.4); }
  for (let i = 0; i < w / 300; i++) P.blob(g, x + R() * w, y + R() * h * 0.4, 50 + R() * 120, h * 0.4, GRIME, 0.3);
  for (let i = 0; i < w / 380; i++) P.crack(g, R, x + R() * w, y + (R() < 0.5 ? 0 : h * 0.3), h * (0.5 + R() * 0.6), Math.PI / 2 + (R() - 0.5) * 0.8, 1.2, 0.7);
  for (let i = 0; i < w / 260; i++) P.chip(g, R, x + R() * w, y + 3 + R() * 5, 8 + R() * 22, 4 + R() * 8, P.scale(CONC, 0.62), { lip: 0.4 });
  wornEdge(g, R, x, x + w, y + 5, 3, 0.6);
  g.fillStyle = `rgba(${P.INK},0.7)`; g.fillRect(x, y, w, 2.5); g.fillRect(x, y + h - 3, w, 3);
  P.finish(g, R, x, y, w, h, { n: Math.round((w * h) / 3000), wide: 6, len: 50, a: 0.1, dir: 0, drift: 3 });
  g.restore();
}
/**
 * A wall of the shaft, seen from inside, in the strip q (v = 0 under the frame, v = h down in the well; S pixels to the metre): board-marked
 * concrete with the damp and the rust run down from the frame. The light is painted: the warm light of the street comes in through the grate
 * and lies on the top of the wall, with the shade of the cross rods in it, and the well goes dark below. A shell seen from inside has no
 * outline of geometry, so its line is painted too: a dark band under the frame and down the two corners.
 */
function paintWall(g, R, q, S) {
  const { x, y, w, h } = q;
  clipTo(g, q);
  g.fillStyle = P.css([84, 84, 84]); g.fillRect(x, y, w, h);
  P.masses(g, R, x, y, w, h, 26, w * 0.16, '24,22,22', '170,168,160', 0.3);
  for (let py = y + 0.3 * S; py < y + h; py += S * (0.24 + R() * 0.1)) for (let px = x; px < x + w;) {
    const len = 40 + R() * 200;
    if (R() < 0.6) { g.fillStyle = `rgba(${P.INK},${0.15 + R() * 0.25})`; g.fillRect(px, py + (R() - 0.5) * 3, len, 1.4); g.fillStyle = `rgba(${P.PALE},0.12)`; g.fillRect(px, py + 2, len, 1); }
    px += len + R() * 90;
  }
  P.drips(g, R, x, x + w, y + 0.06 * S, h * 0.6, GRIME, 0.55, 26);
  P.drips(g, R, x, x + w, y + 0.06 * S, h * 0.28, RUST_D, 0.5, 60);
  for (let i = 0; i < 9; i++) P.blob(g, x + R() * w, y + 0.07 * S, 12 + R() * 30, 8 + R() * 14, RUST, 0.6);
  for (let i = 0; i < 5; i++) { const px = x + R() * w, py = y + h * (0.1 + R() * 0.5); P.crack(g, R, px, py, 60 + R() * 160, Math.PI / 2 + (R() - 0.5) * 0.9, 1.3, 0.7); if (R() < 0.6) P.drip(g, R, px, py + 20, 60 + R() * 140, 5 + R() * 6, '214,208,190', 0.3); }
  P.finish(g, R, x, y, w, h, { n: Math.round((w * h) / 4200), wide: 9, len: 60, a: 0.11, dir: Math.PI / 2, drift: 4 });
  const lit = g.createLinearGradient(0, y, 0, y + h * 0.42); lit.addColorStop(0, 'rgba(255,196,128,0.2)'); lit.addColorStop(0.5, 'rgba(255,196,128,0.07)'); lit.addColorStop(1, 'rgba(255,196,128,0)');
  g.fillStyle = lit; g.fillRect(x, y, w, h * 0.42);
  for (let px = x - 0.2 * S; px < x + w; px += 0.2 * S) {
    g.save(); g.transform(1, 0, 0.14, 1, px, y);
    const gr = g.createLinearGradient(0, 0, 0, h * 0.4); gr.addColorStop(0, `rgba(${P.INK},0.26)`); gr.addColorStop(1, `rgba(${P.INK},0)`);
    g.fillStyle = gr; g.fillRect(-0.008 * S, 0, 0.016 * S, h * 0.3); g.restore();
  }
  const dark = g.createLinearGradient(0, y, 0, y + h); dark.addColorStop(0, 'rgba(6,7,10,0)'); dark.addColorStop(0.25, 'rgba(6,7,10,0.22)'); dark.addColorStop(0.6, 'rgba(6,7,10,0.8)'); dark.addColorStop(0.8, 'rgba(6,7,10,1)'); dark.addColorStop(1, 'rgba(6,7,10,1)');
  g.fillStyle = dark; g.fillRect(x, y, w, h);
  g.fillStyle = `rgba(${P.INK},0.8)`; g.fillRect(x, y, w, 0.03 * S); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h);
  g.restore();
}

/** The painting of a grate and where each of its parts is in it (a strip also says how many metres it is long: `m`). Kept by the grate's numbers. */
const painted = new Map();
function paintingOf(T, G) {
  const key = JSON.stringify(G);
  if (painted.has(key)) return painted.get(key);
  // two columns of shelves: the wall of the shaft at the left, the long thin strips of the steel at the right
  const wallW = Math.round((G.x1 - G.x0) * WALL_S), left = wallW + GUT * 2;
  const cols = [{ x0: GUT, x1: left - GUT, cx: GUT, cy: GUT, rowH: 0 }, { x0: left, x1: ATLAS - GUT, cx: left, cy: GUT, rowH: 0 }], jobs = [];
  const strip = (col, w, h, m, fn) => {
    const c = cols[col]; w = Math.round(w); h = Math.round(h);
    if (c.cx + w > c.x1) { c.cx = c.x0; c.cy += c.rowH + GUT; c.rowH = 0; }
    const q = { x: c.cx, y: c.cy, w, h, m }; c.cx += w + GUT; c.rowH = Math.max(c.rowH, h); jobs.push([q, fn]); return q;
  };
  const R = mulberry32(2026 + 18), many = (n, f) => Array.from({ length: n }, f);
  const ow = G.x1 - G.x0 + (G.frame + G.collar) * 2;
  const A = {
    wall: strip(0, wallW, G.well * WALL_S, G.x1 - G.x0, (g, q) => paintWall(g, R, q, WALL_S)),
    flank: many(6, () => strip(1, LONG, 80, 1.5, (g, q) => paintFlank(g, R, q, 'side'))),
    under: many(4, () => strip(1, LONG, 40, 1.5, (g, q) => paintFace(g, R, q, { down: 'u' }))),
    top: many(4, () => strip(1, LONG, 40, 1.5, (g, q) => paintTop(g, R, q))),
    edge: strip(1, LONG, 14, 1.5, (g, q) => paintEdge(g, R, q)),
    frame: many(2, () => strip(1, LONG, 46, ow, (g, q) => paintFace(g, R, q, { down: 'u' }))),
    beamUnder: strip(1, LONG, 100, 1.5, (g, q) => paintFace(g, R, q, { down: 'u', bolts: LONG / 6 })),
    beamWeb: strip(1, LONG, 100, 1.5, (g, q) => paintFlank(g, R, q, 'side')),
    rodTop: strip(1, LONG, 14, 1.5, (g, q) => paintEdge(g, R, q)),
    rodSide: strip(1, LONG, 26, 1.5, (g, q) => paintFlank(g, R, q, 'bottom')),
    collar: many(2, () => strip(1, LONG, 128, ow, (g, q) => paintConcrete(g, R, q))),
    weld: strip(1, 520, 30, 0.3, (g, q) => paintWeld(g, R, q)),
  };
  const [c, g] = P.canvas(ATLAS, Math.max(cols[0].cy + cols[0].rowH, cols[1].cy + cols[1].rowH) + GUT);
  g.fillStyle = P.css(P.scale(PAINT, 0.9)); g.fillRect(0, 0, c.width, c.height);
  for (const [q, fn] of jobs) fn(g, q);
  P.punch(g, 0.34);
  A.W = c.width; A.H = c.height; A.map = P.textureOf(T, c);
  painted.set(key, A);
  return A;
}

// ---- the geometry ---------------------------------------------------------------------------------------------------------------------
/** Where everything of a grate of these numbers is: its two leaves, each with its bars (their z) and its cross rods (their x). */
function layout(G) {
  const play = 0.004, strip = 0.03;                                             // the play of a leaf in the frame; the beam's top, between the leaves
  const leaves = [[G.x0 + play, G.split - strip / 2 - play / 2], [G.split + strip / 2 + play / 2, G.x1 - play]].map(([a, b]) => {
    const za = G.z0 + play, zb = G.z1 - play, n = Math.round((zb - za - G.bar) / G.pitch) - 1, step = (zb - za - G.bar) / (n + 1);
    const nr = Math.max(1, Math.round((b - a) / G.rods) - 1);
    return { a, b, za, zb, zs: Array.from({ length: n }, (_, i) => za + G.bar / 2 + step * (i + 1)), xs: Array.from({ length: nr }, (_, j) => a + ((b - a) * (j + 1)) / (nr + 1)) };
  });
  return { play, strip, leaves, c: G.bar * 0.2, seat: 0.03 };
}
/** Collects flat quads (and triangles) with the normal of each and a uv from a strip of the painting. */
function mesher(T, A) {
  const pos = [], nor = [], uv = [], a = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3();
  /** uv of a point of a strip: s along (0..1 of its length), t across (kept half a pixel inside it). */
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
 * A flat bar on edge: it runs along `ax` ('x' or 'z') from a0 to a1 with its middle at `mid` on the other axis, f wide, from y1 (its top)
 * down to y0, with the chamfer c on its two lower edges (where the paint has gone and the steel catches the light, seen from the shaft).
 * strips: { top, under, a, b, edge, edge2 } (a: the flank on the low side of the other axis), each [strip, s0, s1]; one left out is not made.
 */
function bar(M, { ax, a0, a1, mid, f, y0, y1, c }, strips) {
  const len = a1 - a0;
  const at = ax === 'x' ? (al, ac, y) => [a0 + al, y, mid - f / 2 + ac] : (al, ac, y) => [mid - f / 2 + ac, y, a0 + al];
  const dir = ax === 'x' ? (ac, y) => [0, y, ac] : (ac, y) => [ac, y, 0];
  const face = (q, ac0, ya, ac1, yb, want) => { if (!q) return; const [st, s0, s1] = q; M.quad([at(0, ac0, ya), at(len, ac0, ya), at(len, ac1, yb), at(0, ac1, yb)], [M.at(st, s0, 0), M.at(st, s1, 0), M.at(st, s1, 1), M.at(st, s0, 1)], want); };
  face(strips.top, 0, y1, f, y1, dir(0, 1));
  face(strips.under, c, y0, f - c, y0, dir(0, -1));
  face(strips.edge, 0, y0 + c, c, y0, dir(-1, -1)); face(strips.edge2, f, y0 + c, f - c, y0, dir(1, -1));
  face(strips.a, 0, y0 + c, 0, y1, dir(-1, 0)); face(strips.b, f, y0 + c, f, y1, dir(1, 0));          // (the painting's far edge is the one by the street: the top)
}
/** A box with a strip of the painting on each face asked for: faces { px, nx, py, ny, pz, nz }, each [strip, s0, s1, t0 = 0, t1 = 1], laid along the face's longer side. */
function box(M, x0, x1, y0, y1, z0, z1, faces) {
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (const [name, q] of Object.entries(faces)) {
    if (!q) continue;
    const n = 'xyz'.indexOf(name[1]), s = name[0] === 'p' ? 1 : -1, [u, v] = [0, 1, 2].filter((k) => k !== n).sort((i, j) => (hi[j] - lo[j]) - (hi[i] - lo[i]));
    const pt = (ku, kv) => { const p = [0, 0, 0]; p[n] = s > 0 ? hi[n] : lo[n]; p[u] = ku ? hi[u] : lo[u]; p[v] = kv ? hi[v] : lo[v]; return p; };
    const want = [0, 0, 0]; want[n] = s;
    const [st, s0, s1, t0 = 0, t1 = 1] = q;
    M.quad([pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)], [M.at(st, s0, t0), M.at(st, s1, t0), M.at(st, s1, t1), M.at(st, s0, t1)], want);
  }
}
/** A weld bead in a corner: along the line p0..p1, between the two faces that go out of it along the unit vectors a and b; r its size. */
function bead(M, A, R, p0, p1, a, b, r, n = 3) {
  const q = A.weld, u0 = R() * 0.55, du = 0.42 / n, ring = [], d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  for (let i = 0; i <= n; i++) {
    const k = i === 0 || i === n ? 0.45 : 0.8 + R() * 0.4, f = i / n + (i > 0 && i < n ? (R() - 0.5) * 0.12 : 0), p = [p0[0] + d[0] * f, p0[1] + d[1] * f, p0[2] + d[2] * f];
    const at = (ka, kb) => [p[0] + (a[0] * ka + b[0] * kb) * r * k, p[1] + (a[1] * ka + b[1] * kb) * r * k, p[2] + (a[2] * ka + b[2] * kb) * r * k];
    ring.push([at(1, 0), at(0.66, 0.66), at(0, 1)]);
  }
  const out = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) M.quad([ring[i][j], ring[i + 1][j], ring[i + 1][j + 1], ring[i][j + 1]], [M.at(q, u0 + du * i, j / 2), M.at(q, u0 + du * (i + 1), j / 2), M.at(q, u0 + du * (i + 1), (j + 1) / 2), M.at(q, u0 + du * i, (j + 1) / 2)], out);
  M.tri(ring[0], [M.at(q, u0, 0), M.at(q, u0, 0.5), M.at(q, u0, 1)], [-d[0], -d[1], -d[2]]); M.tri(ring[n], [M.at(q, u0, 0), M.at(q, u0, 0.5), M.at(q, u0, 1)], d);
}
/** The outline's shell of a box: its eight corners, each with the normal of a corner, so the shell does not open (models/outline.js). */
function shellBox(out, x0, x1, y0, y1, z0, z1) {
  const base = out.pos.length / 3, k = 1 / Math.sqrt(3);
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) { out.pos.push(x, y, z); out.nor.push((x === x0 ? -1 : 1) * k, (y === y0 ? -1 : 1) * k, (z === z0 ? -1 : 1) * k); }
  for (const f of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) out.idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
}

/**
 * The grate of the shaft, built in the entity's frame: { group, footprint }. The group is named `grade` and holds the painted mesh and the
 * outline's shell; it is to be added to the entity's root and never moved.
 */
export function buildGrate(r, G = GRATE) {
  const T = r.THREE, g = new T.Group(), t0 = globalThis.performance?.now() ?? 0;
  g.name = 'grade';
  const L = layout(G), A = paintingOf(T, G), t1 = globalThis.performance?.now() ?? 0, M = mesher(T, A), R = mulberry32(77 + L.leaves[0].zs.length * 13);
  const shell = { pos: [], nor: [], idx: [] }, shellH = { pos: [], nor: [], idx: [] }, MH = mesher(T, A);
  const { x0, x1, z0, z1, bar: bw, deep, rod } = G, yb = -deep, c = L.c;
  /** A stretch of a long strip for a shorter piece, begun at a place of its own (so no two bars show the same painting side by side). */
  const part = (q, len) => { const k = Math.min(1, len / q.m), s = R() * (1 - k); return R() < 0.5 ? [q, s, s + k] : [q, s + k, s]; };
  const any = (list) => list[Math.floor(R() * list.length)];
  const steel = (len) => ({ top: part(any(A.top), len), under: part(any(A.under), len), a: part(any(A.flank), len), b: part(any(A.flank), len), edge: part(A.edge, len), edge2: part(A.edge, len) });

  // the shaft: its four walls seen from inside, and the dark at the bottom of it
  const wall = (p0, p1, s0, s1, want) => M.quad([[p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], -G.well, p1[1]], [p0[0], -G.well, p0[1]]], [M.at(A.wall, s0, 0), M.at(A.wall, s1, 0), M.at(A.wall, s1, 1), M.at(A.wall, s0, 1)], want);
  const kz = (z1 - z0) / (x1 - x0);
  wall([x0, z0], [x1, z0], 0, 1, [0, 0, 1]); wall([x1, z1], [x0, z1], 0, 1, [0, 0, -1]);
  wall([x0, z1], [x0, z0], 0, kz, [1, 0, 0]); wall([x1, z0], [x1, z1], 1 - kz, 1, [-1, 0, 0]);
  const pit = M.at(A.wall, 0.5, 0.995);
  M.quad([[x0, -G.well, z0], [x1, -G.well, z0], [x1, -G.well, z1], [x0, -G.well, z1]], [pit, pit, pit, pit], [0, 1, 0]);

  // the seat of the leaves: a ledge of the steel frame all round, under them
  const ys = yb - 0.008, se = L.seat;
  box(M, x0, x1, ys, yb, z0, z0 + se, { ny: part(A.frame[0], x1 - x0), pz: part(A.rodSide, x1 - x0) });
  box(M, x0, x1, ys, yb, z1 - se, z1, { ny: part(A.frame[1], x1 - x0), nz: part(A.rodSide, x1 - x0) });
  box(M, x0, x0 + se, ys, yb, z0, z1, { ny: part(A.frame[0], z1 - z0), px: part(A.rodSide, z1 - z0) });
  box(M, x1 - se, x1, ys, yb, z0, z1, { ny: part(A.frame[1], z1 - z0), nx: part(A.rodSide, z1 - z0) });

  // the beam under the joint of the two leaves: its top between them, level with the bars, the flange they sit on, the web and the lower flange
  const sx = G.split, bl = z1 - z0, by = -0.12, bf = 0.032;
  box(M, sx - L.strip / 2, sx + L.strip / 2, yb, 0.001, z0, z1, { py: part(A.frame[0], bl) });
  box(M, sx - bf, sx + bf, ys, yb, z0, z1, { ny: part(A.frame[1], bl), px: part(A.rodSide, bl), nx: part(A.rodSide, bl) });
  box(M, sx - 0.005, sx + 0.005, by + 0.012, ys, z0, z1, { px: part(A.beamWeb, bl), nx: part(A.beamWeb, bl) });
  box(M, sx - bf, sx + bf, by, by + 0.012, z0, z1, { ny: part(A.beamUnder, bl), px: part(A.rodSide, bl), nx: part(A.rodSide, bl), py: part(A.frame[0], bl) });
  shellBox(shell, sx - bf, sx + bf, by, by + 0.012, z0, z1); shellBox(shell, sx - 0.005, sx + 0.005, by, ys, z0, z1);

  // the steel frame, level with the pavement, and the collar of concrete round it (a hair over the paving, so their meeting does not flicker)
  const fw = G.frame, m = fw + G.collar, fy = 0.003, cy = 0.002;
  box(M, x0 - fw, x1 + fw, -0.02, fy, z0 - fw, z0, { py: part(A.frame[0], x1 - x0 + fw * 2) });
  box(M, x0 - fw, x1 + fw, -0.02, fy, z1, z1 + fw, { py: part(A.frame[1], x1 - x0 + fw * 2) });
  box(M, x0 - fw, x0, -0.02, fy, z0, z1, { py: part(A.frame[1], z1 - z0) });
  box(M, x1, x1 + fw, -0.02, fy, z0, z1, { py: part(A.frame[0], z1 - z0) });
  box(M, x0 - m, x1 + m, -0.02, cy, z0 - m, z0 - fw, { py: [A.collar[0], 0, 1, 0, 1] });
  box(M, x0 - m, x1 + m, -0.02, cy, z1 + fw, z1 + m, { py: [A.collar[1], 1, 0, 1, 0] });
  { const k = (z1 - z0 + fw * 2) / A.collar[0].m; box(M, x0 - m, x0 - fw, -0.02, cy, z0 - fw, z1 + fw, { py: [A.collar[1], 0.05, 0.05 + k, 0, 1] }); box(M, x1 + fw, x1 + m, -0.02, cy, z0 - fw, z1 + fw, { py: [A.collar[0], 0.3 + k, 0.3, 1, 0] }); }

  // the two leaves: the band round each, its bars along the avenue, the cross rods let into their tops, the welds
  let bars = 0;
  const cut = G.cable;
  for (const lf of L.leaves) {
    const { a, b, za, zb } = lf, MM = lf === L.leaves[0] ? MH : M, SS = lf === L.leaves[0] ? shellH : shell;      // (the hatch leaf is a mesh of its own: it lifts on its hinges)
    for (const z of [za + bw / 2, zb - bw / 2]) { bar(MM, { ax: 'x', a0: a, a1: b, mid: z, f: bw, y0: yb, y1: 0, c }, steel(b - a)); shellBox(SS, a, b, yb, 0, z - bw / 2, z + bw / 2); }
    for (const x of [a + bw / 2, b - bw / 2]) { bar(MM, { ax: 'z', a0: za, a1: zb, mid: x, f: bw, y0: yb, y1: 0, c }, steel(zb - za)); shellBox(SS, x - bw / 2, x + bw / 2, yb, 0, za, zb); }
    for (const z of lf.zs) {
      // where the thick cable goes down, the bars are sawn through
      const sawn = cut && cut[0] > a && cut[0] < b && Math.abs(z - cut[1]) < 0.1;
      for (const [p, q] of sawn ? [[a + bw, cut[0] - 0.11], [cut[0] + 0.11, b - bw]] : [[a + bw, b - bw]]) {
        if (q - p < 0.03) continue;
        bar(MM, { ax: 'x', a0: p, a1: q, mid: z, f: bw, y0: yb, y1: 0, c }, steel(q - p)); shellBox(SS, p, q, yb, 0, z - bw / 2, z + bw / 2); bars++;
        for (const [xe, ex, open] of [[p, 1, p > a + bw + 1e-6], [q, -1, q < b - bw - 1e-6]]) {
          if (open) { box(MM, xe - 0.001, xe, yb, 0, z - bw / 2, z + bw / 2, { [ex > 0 ? 'nx' : 'px']: [A.edge, 0.2, 0.22] }); continue; }      // the sawn end: bare steel
          for (const s of [-1, 1]) bead(MM, A, R, [xe, yb + c, z + s * bw / 2], [xe, -0.006, z + s * bw / 2], [ex, 0, 0], [0, 0, s], 0.006 + R() * 0.002);
        }
      }
    }
    for (const x of lf.xs) {
      const hole = cut && Math.abs(x - cut[0]) < 0.11;
      for (const [p, q] of hole ? [[za + bw, cut[1] - 0.1], [cut[1] + 0.1, zb - bw]] : [[za + bw, zb - bw]]) if (q - p > 0.03) box(MM, x - rod / 2, x + rod / 2, 0.002 - rod, 0.002, p, q, { py: part(A.rodTop, q - p), ny: part(A.rodSide, q - p), px: part(A.rodSide, q - p), nx: part(A.rodSide, q - p) });
      for (const z of lf.zs) { if (hole && Math.abs(z - cut[1]) < 0.1) continue; for (const s of [-1, 1]) bead(MM, A, R, [x - rod / 2, 0.002 - rod, z + s * bw / 2], [x + rod / 2, 0.002 - rod, z + s * bw / 2], [0, 0, s], [0, -1, 0], 0.0045 + R() * 0.0015, 2); }
    }
  }
  // the hatch (the first leaf): two hinges on the frame at its far side, and the plate it is lifted by
  const hatch = L.leaves[0];
  for (const z of [-0.45, 0.45]) { const hx0 = x0 - 0.03, hx1 = x0 + 0.03, f = part(A.frame[0], 0.1); box(M, hx0, hx1, 0, 0.012, z - 0.05, z + 0.05, { py: f, px: part(A.rodSide, 0.1), nx: part(A.rodSide, 0.1), pz: part(A.rodSide, 0.06), nz: part(A.rodSide, 0.06) }); shellBox(shell, hx0, hx1, 0, 0.012, z - 0.05, z + 0.05); }
  { const px0 = hatch.b - 0.2, px1 = hatch.b - 0.04, f = part(A.frame[1], 0.16); box(MH, px0, px1, 0, 0.006, -0.07, 0.07, { py: f, px: part(A.rodSide, 0.14), nx: part(A.rodSide, 0.14), pz: part(A.rodSide, 0.16), nz: part(A.rodSide, 0.16) }); }

  const keep = (mesh) => { mesh.userData.keep = true; g.add(mesh); return mesh; };
  keep(new T.Mesh(M.geometry(), r.mat(TINT, { map: A.map, emissive: PAINTED }))).name = 'grade-pintada';
  // the hatch leaf, on its hinges (the frame's far side, x0): shut, it lies where it always lay; the chase lifts it (rotation.z of `grade-folha`)
  const leaf = new T.Group(); leaf.name = 'grade-folha'; leaf.position.set(x0, 0, 0); g.add(leaf);
  const inLeaf = (mesh) => { mesh.userData.keep = true; mesh.position.set(-x0, 0, 0); leaf.add(mesh); return mesh; };
  inLeaf(new T.Mesh(MH.geometry(), r.mat(TINT, { map: A.map, emissive: PAINTED }))).name = 'grade-folha-pintada';
  const hullOf = (sh) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(sh.pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(sh.nor, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array((sh.pos.length / 3) * 2), 2)); geo.setIndex(sh.idx);
    const hull = new T.Mesh(geo, kitOf(r).mat(OUTLINE_SPEC)); hull.renderOrder = 1; return hull;
  };
  if (OUTLINE.on) { keep(hullOf(shell)).name = 'grade_hull'; inLeaf(hullOf(shellH)).name = 'grade-folha_hull'; }
  g.userData.bars = bars;                                                      // (the tests count the bars: they are one mesh)
  g.userData.rods = L.leaves.reduce((n, lf) => n + lf.xs.length, 0);
  g.userData.tris = M.tris + MH.tris + (shell.idx.length + shellH.idx.length) / 3;
  g.userData.paintMs = Math.round(t1 - t0);                                    // (0 when the painting was already made for another grate)
  return { group: g, footprint: footprint(G) };
}
