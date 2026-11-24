// The plan of the building of the chase ("a fuga pelo prédio", night 1, scene 4): pure numbers, in the street's own frame (x along the avenue,
// z across it with the south pavement at +z, y up with the pavements at 0.15). The model (src/models/predio/) builds from them and the chase
// (src/systems/fuga.js) walks Jonas and the dog through them, so a wall and a way can not disagree. The entity `predio-fuga` of
// data/scenes/rua.json stands at ORIGIN, unturned: the game's code cites its id, and moving it in the editor would leave the chase behind.
//
// The block: a residential building of five floors on the north pavement, across the avenue from the skip. Ground floor: the entrance hall
// behind a wired-glass door, the stairs at the back. The stairs go round an open well, a square spiral, a flight on each side. Third floor: a
// corridor with doors on both sides, and the flat whose kitchen cupboard hides Jonas, with the window onto the fire escape. The fire escape
// hangs on the street front: three landings, a stair between each two, and a drop ladder to the pavement.
import LAYOUT from '../../data/scenes/predio.json' with { type: 'json' };

/** Where an entity of the building's own layout stands (data/scenes/predio.json, the scene `predio`): what the person may move in the editor is read from there. */
const placeOf = (id, d) => LAYOUT.entities.find((e) => e.id === id)?.pos ?? d;
export const ORIGIN = [-12, 0, -17.6];
/** The outside of the block (x0..x1, the street front zf, the back zb) and the floors' heights (the pavement, then each floor above it). */
export const BLOCK = { x0: -18, x1: -6, zf: -11.6, zb: -23.6, y: [0.15, 4.15, 7.35, 10.55, 13.75], roof: 16.95, wall: 0.2 };
const Y = BLOCK.y;
/** The street door: wired glass in a steel frame, hinged on its west edge, opening inward; `bay` the glazed bay it stands in. */
export const DOOR = { x: -13.3, w: 1.1, h: 2.3, bay: 2.8, z: BLOCK.zf };
/** The hall (ground floor). */
export const HALL = { x0: -16.4, x1: -8.6, z0: -19.6, z1: -11.8, h: 3.85 };
/** The stair: the centre of its well, half the side of the square its middle line goes round, the width of a flight, the flat run at each corner. */
export const STAIR = { cx: -10.6, cz: -21.5, half: 1.3, w: 1.2, flat: 0.6 };
/** The corridor of the third floor and the flat on its south side (the door of the flat is on the corridor's south wall, at `door`; `locked` is the one across it). */
export const CORR = { x0: -17.8, x1: -8.6, z0: -19.6, z1: -18.0, y: Y[3], h: 2.9 };
export const APT = { x0: -17.8, x1: -11.8, z0: -17.8, z1: -11.8, door: -15.6, doorW: 0.9, y: Y[3], h: 2.9 };
/** The kitchen cupboard by the flat's north wall, standing out from the east wall (its door faces west; behind it, a gap a man fits in), and the inside of it: where the entity `armario` stands (its hinge corner), unturned. */
export const CUPBOARD = (() => { const [x0, , z1] = placeOf('armario', [-13.25, 0, -16.75]); return { x0, x1: x0 + 0.7, z0: z1 - 1, z1, h: 2.1, in: [x0 + 0.35, z1 - 0.5] }; })();
/** The window onto the fire escape (on the street front of the flat, in the middle of a bay of the front: the painted windows of the other bays are this size). */
export const WINDOW = { x: -13.5, w: 1.45, sill: 0.825, h: 1.5 };
/**
 * The fire escape on the street front: landings at the floors 3, 2 and 1 (x0..x1 by z0..z1; the inner strip, against the wall, is the walkway, the outer
 * one has the stair's opening), a stair from each down to the next (its top at `top`, its foot at `foot`, along x), and the drop ladder at `ladder`.
 */
export const ESCAPE = { x0: -16.2, x1: -11.4, z0: BLOCK.zf, z1: -10.4, mid: -11.0, top: -12.2, foot: -15.4, ladder: [-11.8, -10.7], rail: 1.0, steps: 12 };
/** The shaft of the station on the south pavement (the entity `boca-rua`): the hatch leaf, where Jonas stands inside (`perch`: the height of the ledge he braces his feet on, his head just under the bars), how deep the well is. */
export const SHAFT = { pos: [-1.2, 9.5], hatch: [-1.8, 9.5], hinge: -2.1, in: [-0.45, 9.75], floor: 0.15 - 2.6, perch: -1.95, top: [-1.05, 9.5] };

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** The corners of the stair's middle line, from the south-west one (where every floor's landing is) round by the north: SW, NW, NE, SE. */
export const STAIR_CORNERS = [[-1, 1], [-1, -1], [1, -1], [1, 1]].map(([sx, sz]) => [STAIR.cx + sx * STAIR.half, STAIR.cz + sz * STAIR.half]);
const SIDE = STAIR.half * 2;
/**
 * A place on the stairs: `s` metres along its middle line from the landing of the ground floor (a floor is four sides of 2.6 m; it rises only on the
 * middle of each side, between the flat corners). { pos: [x, z], h, yaw (going up), floor (how many whole floors are below) }.
 */
export function stairAt(s) {
  const top = (Y.length - 2) * 4 * SIDE, d = clamp(s, 0, top - 1e-6), n = Math.floor(d / SIDE), side = n % 4, floor = Math.floor(n / 4), k = d - n * SIDE;
  const a = STAIR_CORNERS[side], b = STAIR_CORNERS[(side + 1) % 4], u = k / SIDE, rise = (Y[floor + 1] - Y[floor]) / 4;
  const up = clamp((k - STAIR.flat) / (SIDE - 2 * STAIR.flat));
  return { pos: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], h: Y[floor] + rise * (side + up), yaw: Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])), floor, side };
}
/** The treads of a flight of the floor `floor` (every side of it has the same): how many, how deep (m), how high each (m). The model builds them from this. */
export function stairTreads(floor) { const rise = (Y[Math.min(floor, Y.length - 2) + 1] - Y[Math.min(floor, Y.length - 2)]) / 4, n = Math.round(rise / 0.2); return { n, run: (SIDE - 2 * STAIR.flat) / n, rise: rise / n }; }
/**
 * What is under a foot at `s` metres of the stairs' middle line: { h: the top of the tread there (or of the flat of the corner), k: the treads
 * covered up to there, run, rise }. `k` counts the flats too, STAIR_FLAT_K for each half of a corner's flat (three steps of 0.4 m over the
 * 1.2 m of a corner: he keeps his cadence there with a longer step), so a flight always begins and ends at a whole number.
 */
export const STAIR_FLAT_K = 1.5;
export function stairStep(s) {
  const top = (Y.length - 2) * 4 * SIDE, d = clamp(s, 0, top - 1e-6), nS = Math.floor(d / SIDE), side = nS % 4, floor = Math.floor(nS / 4), m = d - nS * SIDE;
  const T = stairTreads(floor), y0 = Y[floor] + (Y[floor + 1] - Y[floor]) / 4 * side;
  const FK = STAIR_FLAT_K;
  let k0 = 0; for (let f = 0; f < floor; f++) k0 += 4 * (stairTreads(f).n + 2 * FK); k0 += side * (T.n + 2 * FK);
  if (m < STAIR.flat) return { h: y0, k: k0 + FK * m / STAIR.flat, ...T, flat: true };
  if (m >= SIDE - STAIR.flat) return { h: y0 + T.rise * T.n, k: k0 + FK + T.n + FK * (m - (SIDE - STAIR.flat)) / STAIR.flat, ...T, flat: true };
  const u = (m - STAIR.flat) / T.run, i = Math.min(T.n - 1, Math.floor(u));
  return { h: y0 + (i + 1) * T.rise, k: k0 + FK + u, ...T, flat: false };
}
/** The treads of a stair of the fire escape (the same for each): how deep, how high. And the top of what is under a foot at x on the stair from the landing `from` down (the landing itself beyond its two ends). */
export const ESCAPE_TREAD = { run: (ESCAPE.top - ESCAPE.foot) / ESCAPE.steps, rise: (Y[3] - Y[2]) / ESCAPE.steps };
export function escapeStep(from, x) {
  const run = (ESCAPE.top - ESCAPE.foot) / ESCAPE.steps, rise = (Y[from] - Y[from - 1]) / ESCAPE.steps;
  if (x >= ESCAPE.top) return { h: Y[from], k: -(x - ESCAPE.top) / run, run, rise };
  if (x <= ESCAPE.foot) return { h: Y[from - 1], k: ESCAPE.steps + (ESCAPE.foot - x) / run, run, rise };
  const u = (ESCAPE.top - x) / run; return { h: Y[from] - (Math.min(ESCAPE.steps - 1, Math.floor(u)) + 1) * rise, k: u, run, rise };
}
/** How far along the stairs the landing of floor `n` is. */
export const stairOf = (n) => n * 4 * SIDE;
/** The height of the fire escape's stair between the landings `from` (above) and `from - 1`, at x. */
export function escapeH(from, x) { const u = clamp((ESCAPE.top - x) / (ESCAPE.top - ESCAPE.foot)); return Y[from] + (Y[from - 1] - Y[from]) * u; }
