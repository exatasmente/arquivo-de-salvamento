// The chase through the building ("a fuga pelo prédio", night 1, scene 4, acts 2 to 4 of the storyboard): what the picture does, as pure
// functions of time, like the splice before it (systems/emenda.js). The game (src/game.js) and the film mode (src/cutscenes/fuga.js) draw
// from here, so what the video films is what is played. No three.js, no clock, no Math.random.
//
// The chase is a list of BEATS, one or two per panel of the storyboard. A beat has a camera of the scene's grammar (`fp` first person: his
// body; `fix` a fixed camera in a corner: the space and the distance; `cine` what he does not see; slow motion only on the dog's leap), a
// stretch that only plays (`pre`), and maybe a command (`cmd`: a step of systems/sequence.js, always fatal but the last one) with what
// follows a hit (`post`). The five saved points of the scene are the start of the splice and the beats with `cp`.
//
//   stepsOf(from)           the steps of the sequence from a saved point (or from the start)
//   chasePose(rec, t)       { beat, cam, jonas, dog, mirror, decoy, lamp, fx, sign, foot, room }
//   filmRec(from)           what a run with every command done right records, and when each beat starts in it
// rec: { steps: [{ id, cmd }], starts: [], wins: [], ends: [], hits: [], prog (the bar of the command that is on), aim, moved: [times he moved on the grate],
//        failAt, slowK }
// While a command is asked for, what moves does so by the share of its window that has gone (`u`), not by the clock: "mais tempo" makes
// the window longer and the dog slower, never the distance different.
import { BLOCK, DOOR, HALL, STAIR, STAIR_CORNERS, CORR, APT, CUPBOARD, WINDOW, ESCAPE, SHAFT, stairAt, stairOf, escapeH, stairStep, escapeStep, STAIR_FLAT_K } from '../scenes/predio-plan.js';
import { DUMP, ATTACK, FLEE } from './emenda.js';
import QUEDA from '../../data/anim/armario-queda.json' with { type: 'json' };

const Y = BLOCK.y;
export const RUN = 4.8, JOG = 3.2, DOG = 6.4;      // m/s: his run (the player's), a breathless run indoors and on stairs, the dog hunting
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => { const c = clamp(u); return c * c * (3 - 2 * c); };
const heading = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnTo = (a, b, k) => a + wrapA(b - a) * clamp(k);
const fwd = (yaw, p = 0) => [-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p)];
const SENSOR = { weak: '#6b4d12', amber: '#e8a42a', white: '#ffffff', off: '#16161a' };

// ---- going along a way -------------------------------------------------------------------------------------------------------------------
/** A way through points [x, z, h?] (h: the floor's height there; none: the street's own ground): its length and the lengths up to each point, in plan. */
function legs(pts) { const at = [0]; for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, at, len: at.at(-1) }; }
function pointAt(L, s) {
  s = clamp(s, 0, L.len); let i = 1; while (i < L.pts.length - 1 && L.at[i] < s) i++;
  const k = (s - L.at[i - 1]) / Math.max(1e-9, L.at[i] - L.at[i - 1]), a = L.pts[i - 1], b = L.pts[i];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] === undefined || b[2] === undefined ? undefined : a[2] + (b[2] - a[2]) * k];
}
/** Where one is after `d` metres of a way (corners rounded over `round` metres each side): { pos, h, yaw, d, len, done }. */
export function along(pts, d, round = 0.45) {
  const L = legs(pts), s = clamp(d, 0, L.len), r = Math.min(round, L.len / 2), m = clamp(s, r, L.len - r), p = pointAt(L, m - r), q = pointAt(L, m + r), c = pointAt(L, s);
  const mid = s < r || s > L.len - r || pts.length === 2 ? c : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, c[2]];
  return { pos: [mid[0], mid[1]], h: c[2], yaw: heading(p, q), d: s, len: L.len, done: d >= L.len };
}
/** Going along a way at a pace from time 0 (already going: no start), stopping dead at its end: the pose of a body at time k. */
function go(pts, k, pace, o = {}) {
  const a = along(pts, Math.max(0, k) * pace, o.round);
  return { pos: a.pos, h: a.h, yaw: a.yaw, speed: a.done || k < 0 ? 0 : pace, run: pace > 3.5, d: a.d, done: a.done, T: a.len / pace };
}
const lenOf = (pts) => legs(pts).len;
/** A way gone at one pace for its first `d0` metres and another after (crouched through a window, then on his feet): as `go`. */
function twoPaces(pts, k, d0, slow, fast, round = 0.3) { const L = lenOf(pts), t0 = d0 / slow, d = k < t0 ? Math.max(0, k) * slow : d0 + (k - t0) * fast, a = along(pts, d, round); return { pos: a.pos, h: a.h, yaw: a.yaw, speed: a.done || k < 0 ? 0 : k < t0 ? slow : fast, run: false, d: a.d, done: a.done, T: t0 + (L - d0) / fast }; }
/** The stairs as a way: from `s0` to `s1` metres of their middle line (scenes/predio-plan.js). */
function climb(s0, s1, k, pace) { const s = Math.min(s1, s0 + Math.max(0, k) * pace), q = stairAt(s); return { pos: q.pos, h: q.h, yaw: q.yaw, speed: s < s1 && k >= 0 ? pace : 0, run: false, d: s - s0, done: s >= s1, T: (s1 - s0) / pace, s }; }
/** What is under a foot `d` metres ahead of a body, as a profile along the way it faces ([[metres ahead, height from there on], ...]: models/jonas.js `ground`), from a height by place. */
function profile(hAt, reach = 1.1) { const out = []; let last = null; for (let d = -reach; d <= reach + 1e-9; d += 0.02) { const h = +hAt(d).toFixed(4); if (h !== last) { out.push([+d.toFixed(2), h]); last = h; } } return out; }
/**
 * Jonas on the stairs (2026-11-23: he walked and slid up them; and then the person's choice, "um por degrau"): he runs up them with a foot
 * on every tread, at the cadence of a run on a stair (STAIR_CAD steps a second), so his speed along a flight is the depth of its treads
 * times that (1.2 to 1.5 m/s), and over a corner's flat he keeps the cadence with a longer step. Slower than the 2.5 m/s the beats had:
 * a flight of stairs is not run faster than that by anyone.
 */
export const STAIR_CAD = 4.4;
const SIDE_S = STAIR.half * 2;
/** How fast he goes at `s` metres of the stairs' middle line (m/s), and where the stretch he is on ends. */
function stairPace(s) {
  const m = ((s % SIDE_S) + SIDE_S) % SIDE_S, base = s - m, st = stairStep(s);
  if (m < STAIR.flat - 1e-9) return { v: STAIR_CAD * STAIR.flat / STAIR_FLAT_K, end: base + STAIR.flat };
  if (m < SIDE_S - STAIR.flat - 1e-9) return { v: STAIR_CAD * st.run, end: base + SIDE_S - STAIR.flat };
  return { v: STAIR_CAD * STAIR.flat / STAIR_FLAT_K, end: base + SIDE_S };
}
/** Where he is on the stairs `k` seconds after `s0`, going up to `s1`: { s, v, T (the seconds the whole of it takes) }. */
function stairRun(s0, s1, k) {
  let s = s0, t = 0, at = null, vAt = 0;
  for (let n = 0; n < 400 && s < s1 - 1e-9; n++) {
    const p = stairPace(s + 1e-6), end = Math.min(s1, p.end), dt = (end - s) / p.v;
    if (at === null && t + dt >= k) { at = s + Math.max(0, k - t) * p.v; vAt = p.v; }
    s = end; t += dt;
  }
  return { s: at ?? s1, v: at === null ? 0 : vAt, T: t };
}
/** The seconds he takes from `s0` to `s1` metres of the stairs. */
export const stairTime = (s0, s1) => stairRun(s0, s1, Infinity).T;
/**
 * His pose on the stairs `k` seconds after `s0`: the place and the height the stairs' middle line gives (as `climb`), and what his model
 * needs to run up the treads: `stairs` (the treads covered: a foot on each), `ground` (the treads under and ahead of him, for each foot),
 * and his body turning through a corner's flat instead of at a point.
 */
function climbJ(s0, s1, k) {
  const r = stairRun(s0, s1, Math.max(0, k)), q = stairAt(r.s), done = r.s >= s1 - 1e-9, st = stairStep(r.s), m = r.s % SIDE_S, R = 0.55;
  const yawAt = (ss) => stairAt(Math.max(0, ss)).yaw, near = m < R ? -1 : m > SIDE_S - R ? 1 : 0;
  const yaw = near < 0 && r.s > R ? turnTo(yawAt(r.s - m - 0.01), q.yaw, 0.5 + 0.5 * ease(m / R)) : near > 0 ? turnTo(q.yaw, yawAt(r.s - m + SIDE_S + 0.01), 0.5 * ease((m - (SIDE_S - R)) / R)) : q.yaw;
  return { pos: q.pos, h: q.h, yaw, speed: done || k < 0 ? 0 : r.v, run: true, d: r.s - s0, done, T: r.T, s: r.s,
    stairs: done ? null : { dir: 1, k: +st.k.toFixed(4), run: st.run, pace: 'run' }, ground: profile((d) => stairStep(r.s + d).h) };
}

// ---- the camera in his eyes -----------------------------------------------------------------------------------------------------------------
const EYE = 1.62, EYE_LOW = 1.02;
/** First person: the eye at his head (`j`: a pose with pos, h, yaw, d), looking where he goes (`yaw`, `pitch` say otherwise), bobbing with the ground he covers. */
function fp(j, o = {}) {
  const yaw = o.yaw ?? j.yaw, pitch = o.pitch ?? -0.04, sp = clamp((j.speed ?? 0) / 3), ph = (j.d ?? 0) * (Math.PI * 2 / 1.7);
  const bob = Math.sin(ph * 2) * 0.045 * sp, sway = Math.sin(ph) * 0.035 * sp, side = [Math.cos(yaw), -Math.sin(yaw)];
  const eye = [j.pos[0] + side[0] * sway + (o.dx ?? 0), (j.h ?? GROUND(j.pos)) + (o.eye ?? EYE) + bob + (o.dy ?? 0), j.pos[1] + side[1] * sway + (o.dz ?? 0)], f = fwd(yaw, pitch);
  return { eye, at: [eye[0] + f[0] * 4, eye[1] + f[1] * 4, eye[2] + f[2] * 4], fov: o.fov ?? 74 };
}
/** The street's own floor (the pavements are a curb above the road), for a pose without a height. */
export const GROUND = (p) => (Math.abs(p[1]) > 6.6 ? 0.15 : 0);
const hOf = (q) => q.h ?? GROUND(q.pos);

// ---- the places ---------------------------------------------------------------------------------------------------------------------------
const CAR = { hit: [-16.55, 1.85], side: 1 };                         // the car stopped askew across the lanes (`carro-fuga`): where he would run into it
const DOORSTEP = [DOOR.x, DOOR.z + 0.55], INSIDE = [DOOR.x + 0.1, DOOR.z - 1.3];
const W6_A = [FLEE.cut, [-16.75, 6.6], [-16.7, 4.4]], W6_CMD = [[-16.7, 4.4], CAR.hit];
const W6_OUT = (from) => [from, [-13.6, 1.9], [-12.9, -0.4]];
const W7 = [[-12.9, -0.4], [DOOR.x, -4], [DOOR.x, -8.6], DOORSTEP];
const DOG_UP = DUMP.hit, W7_DOG = [DUMP.hit, [-12.1, 6.85], [-12.3, 4.2], [-12.4, 0.5], [DOOR.x, -2.4]];      // (clear of the skip's corner, between it and the broken dog)
const SW = STAIR_CORNERS[0];
const W9 = [[DOORSTEP[0], DOORSTEP[1], Y[0]], [INSIDE[0], INSIDE[1], Y[0]]], W9_B = [[INSIDE[0], INSIDE[1], Y[0]], [-12.8, -14.4, Y[0]]];
const W10 = [[-12.9, -16.0, Y[0]], [-12.8, -17.4, Y[0]], [SW[0], HALL.z0 + 0.5, Y[0]], [SW[0], SW[1], Y[0]]];
const W10_DOG = [[DOOR.x + 0.2, DOOR.z - 1.2, Y[0]], [-12.6, -15.2, Y[0]], [SW[0], HALL.z0 + 0.6, Y[0]]];
const CORR_Z = (CORR.z0 + CORR.z1) / 2, CH = CORR.y;
const W12 = [[SW[0], SW[1], CH], [SW[0], CORR_Z + 0.1, CH], [-14.3, CORR_Z, CH]], W12_CMD = [[-14.3, CORR_Z, CH], [-15.2, CORR_Z, CH]];
const HIDE = [CUPBOARD.in[0], CUPBOARD.in[1], CH], CUP_FRONT = [CUPBOARD.x0 - 0.75, CUPBOARD.in[1], CH];
/** In the flat: where he stops as he comes in, the gap behind the cupboard (between its back and the wall), the end of the table he crouches at with the sheet, the way to the window. */
const STOP = [-14.9, -16.7, CH], BEHIND = [(CUPBOARD.x1 + APT.x1) / 2, CUPBOARD.in[1], CH], TABLE_END = [-13.55, -15.05, CH], SHEET_AT = [-14.55, -16.05, CH];
const W12_IN = (from) => [from, [APT.door, CORR.z1 - 0.25, CH], [APT.door + 0.2, APT.z0 + 0.7, CH], STOP];
const W_PANO = [STOP, SHEET_AT, [-13.55, -16.0, CH], TABLE_END], W_ATRAS = [STOP, [-13.4, -16.25, CH], [BEHIND[0], -16.3, CH], BEHIND], W_DENTRO = [STOP, CUP_FRONT, HIDE];
const TO_WINDOW = (from) => [from, [-13.2, -14.0, CH], [WINDOW.x, APT.z1 - 0.8, CH]];
const DOG_IN = [[SW[0], CORR_Z, CH], [APT.door + 0.05, CORR_Z, CH], [APT.door + 0.05, APT.z0 + 0.25, CH], [APT.door + 0.3, -16.7, CH]];      // (along the corridor, square through the middle of the flat's door, and in)
const DOG_AT_TABLE = [-13.8, -16.2];       // (round the corner of the table from him, 1.2 m away: the sheet's bake has them so)
/**
 * The fall of the cupboard onto the dog, baked (tools/fuga/bake-armario.mjs -> data/anim/armario-queda.json): a rigid box turning on the foot of
 * its front, the blow on the dog's near top corner, the dog going down under it, and the cupboard at rest leaning on it. `fallAt(t)`: seconds
 * since he let it go -> { tip (radians), back (the height of the dog's back), hit (seconds since the blow, or -1) }. The dog stands where the
 * bake has it: its near end 0.55 m from the cupboard's foot, facing it.
 */
export const FALL = { ...QUEDA, dogAt: QUEDA.onDog.near + 0.65 };
export function fallAt(t) { const i = Math.max(0, t) / QUEDA.dt, a = Math.min(QUEDA.tip.length - 1, Math.floor(i)), b = Math.min(QUEDA.tip.length - 1, a + 1), f = i - Math.floor(i); return { tip: QUEDA.tip[a] + (QUEDA.tip[b] - QUEDA.tip[a]) * f, back: QUEDA.dog[a] + (QUEDA.dog[b] - QUEDA.dog[a]) * f, hit: t - QUEDA.hitAt }; }
const DOG_AT_CUP = [CUPBOARD.x0 - FALL.dogAt, CUPBOARD.in[1]];
/** The trap of the cupboard: where the dog stops to sweep the room, the way it searches (in by the door, toward the fridge, back to the middle), and the cameras of its beats. */
const SCAN_AT = [-14.85, -16.35], SCAN_YAW = -2.2, TRAP_WAY = [...DOG_IN, [-16.2, -16.3, CH], [...SCAN_AT, CH]];
/** The dog of the trap by the share `u` of the breath held (0: still in the corridor): in at 0.12, about the room until 0.62, then it stands and sweeps. */
function trapDog(k, u, on) {
  const L = lenOf(TRAP_WAY), d0 = lenOf(DOG_IN.slice(0, 2)) * 0.85, d = !on ? Math.min(d0, lenOf(DOG_IN.slice(0, 2)) * 0.55 + k * 0.6) : d0 + (L - d0) * ease(clamp(u / 0.62)), a = along(TRAP_WAY, d, 0.4), stands = on && u >= 0.62;
  const sweep = stands ? Math.sin((u - 0.62) * 17) : 0;
  return { pos: a.pos, h: CH, yaw: stands ? turnTo(a.yaw, SCAN_YAW, (u - 0.62) / 0.08) : a.yaw, speed: stands || (!on && d >= d0) ? 0 : on ? 1.3 : 0.6, state: 'busca', sensor: SENSOR.amber, y: 0, pitch: 0, look: stands ? sweep * 1.3 : Math.sin(k * 1.7) * 0.6, scan: stands, hidden: a.pos[1] < APT.z0 - 0.35 && d < lenOf(DOG_IN.slice(0, 3)) - 0.6 };
}
const TRAP_CAMS = {
  fresta: (P, k) => fp(P.jonas, { eye: 1.12, yaw: Math.PI / 2 + 0.3, pitch: -0.05 + Math.sin(k * 2.6) * 0.012, fov: 62, dx: 0.06 }),
  seguranca: () => ({ eye: [APT.x0 + 0.45, CH + 2.55, APT.z1 - 0.5], at: [-13.6, CH + 0.7, -16.9], fov: 58 }),
  cao: (P, k) => ({ eye: shake([P.dog.pos[0] - 0.9, CH + 0.42, P.dog.pos[1] + 0.9], k, 0.02), at: [CUPBOARD.x0, CH + 1.0, CUPBOARD.in[1]], fov: 64 }),
};
/** The throw of the sheet: the pointer's zone (as the lure's was), how long the sheet flies. */
export const THROW = { zone: [0.5, 0.86], start: -0.72, fly: 0.38 };      // (`fly`: as the bake has it, tools/fuga/bake-pano.mjs FLY)
/** The names of the moves that are hand-keyed poses for now (a take of motion capture replaces each under the same name: tools/mocap). */
export const MOCAP = { recuar: 'recuar-ofegante', arremessar: 'arremessar-pano', empurrar: 'empurrar-armario', espreitar: 'espreitar-atras-armario', abrir: 'forcar-porta' };
const handheld = (k, a = 0.035) => [Math.sin(k * 1.9) * a + Math.sin(k * 4.3) * a * 0.4, Math.sin(k * 2.6 + 1) * a * 0.7, Math.cos(k * 1.7) * a];
const shake = (e, k, a) => { const h = handheld(k, a); return [e[0] + h[0], e[1] + h[1], e[2] + h[2]]; };
/** His breath as a body does it, hand-keyed (MOCAP.recuar): the chest and the shoulders, about 2.4 a second. */
const pant = (k) => ({ twist: Math.sin(k * 15) * 0.035, y: Math.max(0, Math.sin(k * 15)) * 0.014, pant: true });
const WX = WINDOW.x, E = ESCAPE, WALK_Z = (E.z0 + E.mid) / 2 + 0.05, OUT_Z = (E.mid + E.z1) / 2;
const W16 = [[WX, APT.z1 - 0.8, Y[3]], [WX, APT.z1 - 0.15, Y[3]], [WX, WALK_Z, Y[3]], [E.x1 - 0.45, WALK_Z, Y[3]], [E.x1 - 0.45, OUT_Z, Y[3]], [E.top, OUT_Z, Y[3]], [-12.9, OUT_Z, escapeH(3, -12.9)]];
const LOOSE_X = E.top - 5.5 * ((E.top - E.foot) / E.steps);
/** A stair of the fire escape from the landing `f` down, then along the walkway of the next landing to the head of its own stair (or to the ladder). */
const flight = (f, x0 = E.top) => [[x0, OUT_Z, escapeH(f, x0)], [E.foot, OUT_Z, Y[f - 1]], [E.x0 + 0.45, OUT_Z, Y[f - 1]], [E.x0 + 0.45, WALK_Z, Y[f - 1]], [E.x1 - 0.5, WALK_Z, Y[f - 1]]];
const W17 = [...flight(3, LOOSE_X - 0.25), [E.x1 - 0.45, OUT_Z, Y[2]], [E.top, OUT_Z, Y[2]], ...flight(2).slice(1, 4), [-12.5, WALK_Z, Y[1]], [-12.25, OUT_Z - 0.05, Y[1]]];
const LATCH = [-12.25, OUT_Z - 0.05], LADDER = E.ladder;
const W18_DOG = [[WX, WALK_Z, Y[3]], [E.x1 - 0.45, WALK_Z, Y[3]], [E.x1 - 0.45, OUT_Z, Y[3]], [E.top, OUT_Z, Y[3]], [E.foot, OUT_Z, Y[2]], [E.x0 + 0.45, OUT_Z, Y[2]], [E.x0 + 0.45, WALK_Z, Y[2]], [E.x1 - 0.6, WALK_Z, Y[2]], [E.x1 - 0.5, OUT_Z, Y[2]], [E.top, OUT_Z, Y[2]]];
const GRATE_AT = [SHAFT.hatch[0], SHAFT.pos[1] + 1.05];             // where he stands to lift the hatch: south of it, on the collar
const W19 = [[LADDER[0], LADDER[1] + 0.35], [-6.0, -8.3], [-5.3, -3.0], [-4.7, 3.6], [-4.8, 8.3], [-3.6, 10.4], GRATE_AT];
const W19_DOG = [[-12.0, -9.6], [-6.4, -7.6], [-5.6, -2.6], [-3.6, 2.6], [-1.0, 5.4]];
const LEAP19 = { S: [-1.0, 5.4], C: [-1.8, 9.3] };              // (it comes from the north: the hatch leaf stands open on the west side)
const ON_GRATE = [-0.75, 9.45], W20_OFF = [ON_GRATE, [1.4, 10.2], [5.2, 10.2], [7.0, 8.0], [7.0, 2.6], [16, 2.6]];      // (south of the pillar, off the pavement between the lamp post and the parked van)

/** The well: how many metres of stairs he is seen to climb to the third floor, and the seconds they take him. */
const VAO_CLIMB = 18, VAO_T = stairTime(stairOf(3) - VAO_CLIMB, stairOf(3));
// ---- the beats ----------------------------------------------------------------------------------------------------------------------------
const still = (p, yaw, more = {}) => ({ pos: [p[0], p[1]], h: p[2], yaw, speed: 0, d: 0, ...more });
const dogAt = (q, more = {}) => ({ pos: q.pos, h: q.h, yaw: q.yaw, speed: q.speed, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, ...more });
const hidden = (p) => ({ ...p, hidden: true });
const leapArc = (S, C, u, top = 0.9) => ({ pos: mix(S, C, u * u * 0.35 + u * 0.65), yaw: heading(S, C), y: top * Math.sin(Math.PI * clamp(u)), pitch: -0.35 * Math.cos(Math.PI * clamp(u) * 0.9), speed: 5 });
/** How far into its window a command is: by the bar when it fills one, else by the time. */
const uOf = (B) => (B.hitAt != null ? B.uHit : B.u);

/**
 * Each beat: { id, panel, title, cam ('fp' | 'fix' | 'cine' | 'slow'), pre, cmd?, post?, cp?, room, space, film? (when a perfect run answers, seconds into the window),
 *   pose(k, B, rec) }. `k`: seconds since the beat began; `B`: { pre, open (the command is asked for), u (the share of its window gone), prog, hitAt, uHit, kh (seconds since the hit), aim }.
 */
export const BEATS = [
  {
    id: 'corrida', panel: 6, title: 'Correr', cam: 'fp', room: 'rua', space: 'fora', pre: lenOf(W6_A) / RUN, post: 1.2, film: 0.5,
    cmd: { kind: 'dir', window: 0.9, want: CAR.side, fatal: true },
    pose(k, B) {
      // he runs for the gap between the skip and the parked car, straight at a car stopped across the lanes; the dog is still getting up
      let j;
      if (!B.open && B.hitAt == null) j = go(W6_A, k, RUN);
      else if (B.hitAt == null) { const a = along(W6_CMD, lenOf(W6_CMD) * B.u); j = { ...a, speed: RUN, run: true, d: lenOf(W6_A) + a.d }; }
      else { const from = along(W6_CMD, lenOf(W6_CMD) * B.uHit); j = go(W6_OUT(from.pos), B.kh, RUN, { round: 1.1 }); j.d += lenOf(W6_A) + from.d; }
      const up = ease((k - 0.8) / 1.4), dog = { pos: DOG_UP, yaw: turnTo(DUMP.yaw, heading(DOG_UP, W7_DOG[1]), up), speed: 0, state: up > 0.6 ? 'caca' : 'busca', sensor: up > 0.6 ? SENSOR.white : SENSOR.amber, y: 0, pitch: 0.18 * (1 - up) };
      const lookCar = B.open ? -0.1 : -0.04;
      return { jonas: hidden(j), dog, cam: fp(j, { pitch: lookCar }), foot: 'passo-rua', sign: B.open ? { at: [CAR.hit[0] + 0.3, 1.25, CAR.hit[1] - 1.2], arrow: '▶', word: 'desvie' } : null };
    },
    sfx: [[0, 'respiracao', 'jonas'], [0.9, 'cao-busca', 'cao']],
    failFrom: () => ({ from: [-14.2, 5.2], delay: 0.9, fall: true }),
  },
  {
    id: 'semaforo', panel: 7, title: 'Vista do semáforo', cam: 'fix', room: 'rua', space: 'fora', pre: 2.5,
    pose(k) {
      // high and still, from the pole of the traffic light: he is small in the middle of the avenue, the dog leaves the skip and gains on him
      const j = go(W7, k, RUN), g = go(W7_DOG, k - 0.25, DOG, { round: 0.45 });
      return { jonas: j, dog: dogAt(g), cam: { eye: [-19.35, 5.7, 6.9], at: [-13.4, 0.4, -3.6], fov: 54 }, foot: 'passo-rua' };
    },
    sfx: [[0.25, 'cao-caca', 'cao']],
  },
  {
    id: 'porta', panel: 8, title: 'A porta emperrada', cam: 'cine', cp: true, room: 'rua', space: 'hall', pre: 0.7, post: 0.75, film: 2.4,
    cmd: { kind: 'mash', window: 4.2, need: 11, fatal: true },
    pose(k, B) {
      // the camera at his shoulder as he throws himself at the wired-glass door, which does not give; in the glass, the dog coming up behind him
      const open = B.hitAt != null, u = uOf(B), push = open ? 1 : B.prog ?? 0, shove = Math.sin(k * 23) * 0.02 * (B.open ? 1 : 0);
      const j = open ? go([DOORSTEP, [DOOR.x + 0.05, DOOR.z - 0.9]], B.kh - 0.15, JOG) : still(DOORSTEP, 0, { d: k * 0.3, action: 'manipular', lean: 0.4 + push * 0.6, mocap: MOCAP.abrir });
      const from = W7_DOG.at(-1), dogP = mix(from, [DOOR.x - 0.1, DOOR.z + 2.6], ease(u) * 0.96 + (open ? 0.04 * clamp(B.kh / 0.5) : 0));
      const dog = { pos: dogP, yaw: heading(from, DOORSTEP), speed: B.open ? 2.2 : open ? 5 : DOG, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0 };
      const P = { jonas: j, dog, mirror: open ? null : { ...dog, pos: [dogP[0], 2 * DOOR.z - dogP[1]], yaw: Math.PI - dog.yaw }, fx: { door: open ? 0.12 + 1.4 * ease(B.kh / 0.3) : 0.02 + push * 0.1 + Math.abs(shove) }, lamp: { from: 'jonas' },
        sign: B.open ? { at: [DOOR.x + 0.25, Y[0] + 1.25, DOOR.z], word: 'empurre', bar: true } : null };
      return { ...P, cam: this.cams.ombro(P, k) };
    },
    cams: {
      ombro: (P, k) => ({ eye: shake([P.jonas.pos[0] + 0.62, 1.78, P.jonas.pos[1] + 1.15], k, 0.04), at: [DOOR.x - 0.1, 1.3, DOOR.z - 0.4], fov: 58 }),
      seguranca: () => ({ eye: [DOOR.x + 2.3, 2.85, DOOR.z + 2.4], at: [DOOR.x - 0.2, 1.0, DOOR.z + 0.3], fov: 62 }),
      cao: (P, k) => ({ eye: shake([P.dog.pos[0] + 0.55, 0.42, P.dog.pos[1] + 1.5], k, 0.02), at: [DOOR.x, 1.25, DOOR.z], fov: 60 }),
    },
    sfx: [[0.55, 'impacto-lixeira', [DOOR.x, 1.2, DOOR.z]]], sfxHit: [[0, 'porta-abre', [DOOR.x, 1.2, DOOR.z]]],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.35 }),
  },
  {
    id: 'vidro', panel: 9, title: 'O vidro segura', cam: 'cine', room: 'predio', space: 'hall', pre: 6.1,
    pose(k, B, rec) {
      // he is through and slams the door; the dog throws itself at the glass, which stars and holds. He backs away slowly, his eyes on the door, out of
      // breath, while it starts to strike; at the second blow he sees the glass will go, and runs
      const pb = prevOf(rec, 'porta'), dogFrom = mix(W7_DOG.at(-1), [DOOR.x - 0.1, DOOR.z + 2.6], pb ? ease(pb.uHit) * 0.96 + 0.04 : 1);
      const HIT = [1.25, 4.6, 5.7], RUNS = 5.0, glassAt = [DOOR.x, DOOR.z + 0.55], far = [DOOR.x + 0.1, DOOR.z + 2.3];
      let j = go(W9, k + 0.2, JOG), door = 1.52 - 1.52 * ease((k - 0.45) / 0.35);
      if (k > 0.5 && k <= RUNS) {
        // (the slam, the turn to it, and then backwards, a step at a time: MOCAP.recuar)
        const back = clamp((k - 1.5) / 3.3), flinch = Math.exp(-Math.max(0, k - HIT[1]) * 6) * (k >= HIT[1] ? 1 : 0);
        j = still([INSIDE[0] + 0.05 * back, INSIDE[1] - 0.25 - back * 1.0 - flinch * 0.15, Y[0]], Math.PI, { d: 2 + back * 1.2, speed: k > 1.5 && back < 1 ? -0.3 : 0, gaze: { x: 0, y: 0.05 }, mocap: MOCAP.recuar, ...(k > 1.3 ? pant(k) : {}) });
        if (k < 0.95) j.yaw = turnTo(0, Math.PI, (k - 0.5) / 0.45);
      } else if (k > RUNS) { const g = go([[INSIDE[0] + 0.05, INSIDE[1] - 1.25, Y[0]], [-12.9, -16.0, Y[0]]], k - RUNS - 0.35, JOG); j = { ...g, yaw: k < RUNS + 0.35 ? turnTo(Math.PI, g.yaw, (k - RUNS) / 0.35) : g.yaw }; }
      // the dog: the run in and the first blow; it gathers itself, looking in; then blow after blow
      const blow = (t0, from) => { const u = clamp((k - (t0 - 0.38)) / 0.38); return { ...leapArc(from, glassAt, u, 0.45), state: 'caca', sensor: SENSOR.white }; };
      const recoil = (t0) => { const b = clamp((k - t0) / 0.5); return { pos: [far[0], DOOR.z + 0.55 + 1.75 * ease(b)], yaw: 0.05, speed: b < 1 ? -2 : 0, state: 'caca', sensor: SENSOR.white, y: 0.12 * Math.sin(Math.PI * b), pitch: 0.2 * (1 - b), look: b >= 1 ? Math.sin(k * 2.4) * 0.5 : 0 }; };
      let dog, glass = 0, hitAt = null;
      if (k < HIT[0]) dog = k < HIT[0] - 0.38 ? { pos: mix(dogFrom, far, clamp(k / (HIT[0] - 0.38))), yaw: 0, speed: DOG, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0 } : blow(HIT[0], far);
      else { glass = 1; const i = HIT.findLastIndex((t) => k >= t), next = HIT[i + 1]; hitAt = HIT[i]; dog = next !== undefined && k >= next - 0.38 ? blow(next, far) : recoil(HIT[i]); }
      const sh = hitAt != null ? Math.exp(-(k - hitAt) * 7) : 0;
      const P = { jonas: j, dog, fx: { door: Math.max(0, door) + sh * 0.03, glass, shake: sh }, lamp: { from: 'jonas' }, foot: 'passo-hall', pant: k > 1.3 && k < RUNS };
      return { ...P, cam: this.cams.ombro(P, k) };
    },
    cams: {
      // at his shoulder, hand held, going back with him; a camera in the corner of the hall; low, outside, beside the dog
      ombro: (P, k) => { const s = (P.fx.shake ?? 0) * 0.05; return { eye: shake([P.jonas.pos[0] + 0.75, Y[0] + 1.72 + Math.sin(k * 15) * 0.008, P.jonas.pos[1] - 1.25], k + s * 40, 0.035 + s), at: [DOOR.x - 0.15, Y[0] + 1.1, DOOR.z + 0.2], fov: 56 }; },
      seguranca: () => ({ eye: [HALL.x1 - 0.5, Y[0] + 3.4, HALL.z0 + 1.2], at: [DOOR.x, Y[0] + 0.9, DOOR.z], fov: 58 }),
      cao: (P, k) => ({ eye: shake([DOOR.x + 1.5, 0.48, DOOR.z + 2.7], k, 0.015 + (P.fx.shake ?? 0) * 0.04), at: [DOOR.x - 0.1, 1.05, DOOR.z - 1.2], fov: 62 }),
    },
    sfx: [[0.75, 'porta-bate', [DOOR.x, 1.2, DOOR.z]], [1.25, 'vidro-aramado', [DOOR.x, 1.2, DOOR.z]], [1.25, 'cao-bate', [DOOR.x, 1, DOOR.z]], [4.6, 'vidro-aramado', [DOOR.x, 1.2, DOOR.z]], [4.6, 'cao-bate', [DOOR.x, 1, DOOR.z]], [5.7, 'cao-bate', [DOOR.x, 1, DOOR.z]], [5.7, 'vidro-aramado', [DOOR.x, 1.2, DOOR.z]]],
  },
  {
    id: 'hall', panel: 10, title: 'O hall', cam: 'fix', cp: true, room: 'predio', space: 'hall', pre: 5.6,
    pose(k) {
      // from the high corner over the door: the mailboxes, the pram on its side, the stairs at the back; he runs for them and, behind him, the glass goes
      const BURST = 2.3, j = go(W10, k, JOG, { round: 0.7 }), up = j.done ? climbJ(0, 12, k - j.T) : null, glassAt = [DOOR.x, DOOR.z + 0.55];
      let dog;
      if (k < BURST - 0.4) dog = { pos: [DOOR.x + 0.05, DOOR.z + 1.1 + 1.3 * ease(k / 1.2)], yaw: 0, speed: k < 1.2 ? -1.5 : 0, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, look: Math.sin(k * 3) * 0.4 };
      else if (k < BURST + 0.25) { const u = clamp((k - (BURST - 0.4)) / 0.65); dog = { ...leapArc([DOOR.x + 0.05, DOOR.z + 2.4], [W10_DOG[0][0], W10_DOG[0][1]], u, 0.75), state: 'caca', sensor: SENSOR.white }; }
      else if (k < BURST + 1.05) dog = { pos: [W10_DOG[0][0], W10_DOG[0][1]], yaw: 0, speed: 0, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, look: Math.sin((k - BURST) * 7) * 0.9 };
      else { const g = go(W10_DOG, k - BURST - 1.05, DOG * 0.85, { round: 0.7 }); dog = dogAt(g.done ? climb(0, 2.0, k - BURST - 1.05 - g.T, 2.0) : g); }
      void glassAt;
      return { jonas: up ?? j, dog: { h: Y[0], ...dog }, cam: { eye: [-16.05, 3.55, -12.25], at: [-11.4, 0.9, -17.4], fov: 68 }, fx: { door: 0, glass: k < BURST ? 1 : 2 }, lamp: { from: 'jonas' }, foot: up ? 'passo-escada' : 'passo-hall' };
    },
    sfx: [[2.3, 'vidro-estoura', [DOOR.x, 1.2, DOOR.z]], [2.6, 'cao-caca', 'cao']],
  },
  {
    id: 'vao', panel: 11, title: 'O vão da escada', cam: 'fix', room: 'predio', space: 'vao', pre: +(VAO_T + 0.6).toFixed(2),
    pose(k) {
      // from the top of the well, looking down the spiral: he is nearly at the third floor, the dog's sensor comes up the flights below, its light on the walls
      // (2026-11-23, a foot on every tread: the 18 m of stairs take VAO_T seconds, not 7.2; the dog's sensor comes up below him at the pace
      // that leaves it where it was when he gets to the third floor, 6.5 m of stairs behind)
      const top = stairOf(3), j = climbJ(top - VAO_CLIMB, top, k), g = climb(2.0, top - 6.5, k - 0.3, (top - 8.5) / (VAO_T + 0.1));
      const out = j.done ? go([[SW[0], SW[1], CH], [SW[0], SW[1] + 0.9, CH]], k - j.T, 1.55) : null, jj = j.done ? { ...out, d: VAO_CLIMB + out.d } : j;
      return { jonas: jj, dog: dogAt(g), cam: { eye: [STAIR.cx + 0.3, Y[3] + 2.9, STAIR.cz + 0.25], at: [STAIR.cx - 0.05, Y[0], STAIR.cz - 0.05], fov: 76 }, lamp: { from: 'dog', color: SENSOR.amber }, foot: 'passo-escada' };
    },
    // (two more cameras, to see his feet on the treads: from inside the well at his height, turning with him; and low on the stairs behind him)
    cams: {
      seguranca: (P) => ({ eye: [STAIR.cx, P.jonas.h + 1.1, STAIR.cz], at: [P.jonas.pos[0], P.jonas.h + 0.7, P.jonas.pos[1]], fov: 80 }),
      cao: (P) => { const q = stairAt(Math.max(0, (P.jonas.s ?? stairOf(3)) - 2.3)); return { eye: [q.pos[0], q.h + 0.5, q.pos[1]], at: [P.jonas.pos[0], P.jonas.h + 0.55, P.jonas.pos[1]], fov: 64 }; },
    },
    sfx: [[0.2, 'cao-caca', 'cao'], [3.4, 'cao-caca', 'cao'], [7.2, 'cao-caca', 'cao']],
  },
  {
    id: 'corredor', panel: 12, title: 'Portas do terceiro andar', cam: 'fp', room: 'predio', space: 'andar', pre: lenOf(W12) / JOG, post: 2.3, film: 0.7,
    cmd: { kind: 'dir', window: 1.5, want: -1, fatal: true },
    pose(k, B) {
      // the corridor in his eyes: a door on each side. The one on the left stands ajar, the night of a window behind it; the one on the right is shut. He takes one.
      let j, door = 0.5, yawOff = 0;
      if (!B.open && B.hitAt == null) j = go(W12, k, JOG);
      else if (B.hitAt == null) { const a = along(W12_CMD, lenOf(W12_CMD) * B.u); j = { ...a, speed: 1.2, d: lenOf(W12) + a.d }; yawOff = Math.sin(B.u * 9) * 0.22; }
      else {
        const from = along(W12_CMD, lenOf(W12_CMD) * B.uHit), way = W12_IN([from.pos[0], from.pos[1], CH]);
        j = go(way, B.kh, lenOf(way) / 1.7, { round: 0.5 }); j.d += lenOf(W12) + from.d;
        door = 0.5 + 0.85 * ease((B.kh - 0.25) / 0.4);
        if (j.done) j.yaw = turnTo(j.yaw, -Math.PI / 2, (B.kh - 1.7) / 0.5);
      }
      return { jonas: hidden(j), dog: { pos: [SW[0], SW[1]], h: CH - 3, yaw: 0, speed: 0, state: 'caca', sensor: SENSOR.white, hidden: true }, cam: fp(j, { pitch: -0.03, yaw: j.yaw + yawOff, fov: 76 }), fx: { aptDoor: door }, foot: 'passo-hall',
        sign: B.open ? { at: [APT.door, CH + 1.5, CORR_Z], keys: '←|→', word: 'uma porta' } : null };
    },
    sfx: [[0.1, 'cao-caca', 'cao']], sfxHit: [[0.3, 'porta-abre', [APT.door, CH + 1, CORR.z1]]],
    failFrom: () => ({ from: [SW[0], CORR_Z], delay: 1.0, lock: true }),
  },
  {
    id: 'escolha', panel: 13, title: 'No apartamento', cam: 'fp', cp: true, room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 1.5, post: 0.2,
    // it has his signature and it sees heat: hiding is not enough, its sensors must be covered. Behind the cupboard (to push it over onto it), the
    // sheet on the table (to throw over its sensor), or into the cupboard: that last one is a trap.
    cmd: { kind: 'choose', window: 4.5, options: { left: 'atras', right: 'pano', use: 'dentro' }, auto: 'pano', fatal: true },
    pose(k, B) {
      const j = still(STOP, -Math.PI / 2), look = B.open || B.hitAt != null ? Math.sin((B.open ? B.u * 4.5 : 4.5 * B.uHit) * 1.5) * 0.55 : 0.5 * Math.sin(Math.min(k, 1.5) * 2.1);
      const way = go(DOG_IN.slice(0, 2), k - 0.6, 0.55);
      return { jonas: hidden(j), dog: { pos: way.pos, h: CH, yaw: way.yaw, speed: way.speed, state: 'caca', sensor: SENSOR.white, hidden: true }, cam: this.cams.olhos({ jonas: j, look }, k), fx: { aptDoor: 1.35 }, pant: true,
        sign: B.open ? { at: [-13.4, CH + 1.25, -16.6], keys: '←|→', word: '◀ atrás do armário · pano na mesa ▶ · {use} entrar no armário', choose: true } : null };
    },
    cams: {
      olhos: (P, k) => fp(P.jonas, { yaw: -Math.PI / 2 - (P.look ?? 0), pitch: -0.1 + Math.sin(k * 15) * 0.006, fov: 78 }),
      seguranca: () => ({ eye: [APT.x0 + 0.45, CH + 2.55, APT.z1 - 0.5], at: [-13.6, CH + 0.7, -16.6], fov: 64 }),
    },
    sfx: [[0.2, 'cao-caca', 'cao'], [2.4, 'cao-busca', 'cao']],
    failFrom: () => ({ from: [APT.door, APT.z0 - 0.3], delay: 0.9 }),
  },
  // ---- (a) the sheet over its sensor
  {
    id: 'pano', panel: 14, branch: 'pano', title: 'O pano no sensor', cam: 'cine', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 3.4, post: 3.3, film: 2.9,
    cmd: { kind: 'aim', window: 5.5, from: THROW.start, zone: THROW.zone, rate: 0.5, fatal: true },
    pose(k, B) {
      // he snatches the dust sheet off the table and goes down behind its end; the dog comes in, its sensor finds his heat and it comes for him;
      // he stands and throws the sheet over its sensor (MOCAP.arremessar). Blind, it turns about and stumbles, and he is at the window.
      const g = go(W_PANO, k, 2.6, { round: 0.4 }), has = g.d > lenOf(W_PANO.slice(0, 2)) - 0.2, thrown = B.hitAt != null, a = B.aim ?? THROW.start;
      const w = go(DOG_IN, k - 1.1, 2.8, { round: 0.3 }), u = uOf(B), near = mix([w.pos[0], w.pos[1]], DOG_AT_TABLE, ease(B.open || thrown ? u / 0.4 : 0));      // (it is at the table, 1.2 m from him, before the sheet can be aimed: where the bake has it)
      let j = { ...g, crouch: g.done ? 1 : 0, yaw: g.done ? turnTo(g.yaw, heading(TABLE_END, near), (k - g.T) / 0.4) : g.yaw, mocap: MOCAP.arremessar };
      let dog = !B.open && !thrown ? { ...dogAt(w, { state: w.done ? 'caca' : 'busca', sensor: w.done ? SENSOR.white : SENSOR.amber }), look: w.done ? 0 : Math.sin(k * 1.6) * 0.9, hidden: k < 1.1 }
        : { pos: near, h: CH, yaw: heading(near, TABLE_END), speed: B.open ? 0.5 : 0, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0 };
      // the sheet: on the table, in his hands, in the air, over the dog's head
      // (the sheet is a baked cloth, tools/fuga/bake-pano.mjs: bunched in his hands, then `t` seconds of its flight and its hang, in the dog's frame)
      let cloth = has ? { pos: [j.pos[0] - Math.sin(j.yaw) * 0.25, j.pos[1] - Math.cos(j.yaw) * 0.25], h: CH + (j.crouch ? 0.55 : 1.05), yaw: j.yaw + Math.PI } : null;
      if (B.open) { j = { ...j, crouch: 1 - ease((u - 0.1) / 0.25), twist: (a - 0.68) * 0.35 }; if (cloth) cloth.h = CH + 0.55 + 0.7 * ease((u - 0.1) / 0.25); }
      if (thrown) {
        const f = clamp(B.kh / THROW.fly), yaw0 = heading(near, TABLE_END), blind = Math.max(0, B.kh - THROW.fly - 0.25), c2 = near;
        // blind, it backs off and turns about, slowly (the sheet rides on it: the bake has its head shaking under it)
        if (f >= 1) dog = { pos: [c2[0] - (1 - Math.cos(blind * 1.1)) * 0.22, c2[1] - Math.abs(Math.sin(blind * 0.55)) * 0.3], h: CH, yaw: yaw0 + Math.sin(blind * 1.3) * 0.5, speed: blind > 0 ? 0.35 : 0, state: 'busca', sensor: SENSOR.off, y: 0, pitch: 0.05 * Math.sin(blind * 7), look: Math.sin(blind * 5.2) * 0.9 };
        cloth = { t: B.kh, pos: f >= 1 ? dog.pos : near, h: CH, yaw: f >= 1 ? dog.yaw : yaw0, drape: f >= 1 };
        const out = go(TO_WINDOW(TABLE_END), B.kh - 0.55, JOG, { round: 0.5 }); j = { ...out, crouch: 0, twist: 0 };
      }
      const P = { jonas: j, dog, cloth, scan: !dog.hidden && !thrown && !B.open, fx: { aptDoor: 1.5, pano: !has }, lamp: { from: 'dog', color: SENSOR.amber }, foot: 'passo-hall',
        sign: B.open ? { at: [near[0], CH + 1.15, near[1]], keys: '←|→', word: 'mire o pano no sensor e solte', use: true } : null };
      return { ...P, cam: this.cams.ombro(P, k) };
    },
    cams: {
      ombro: (P, k) => ({ eye: shake([TABLE_END[0] + 1.05, CH + 1.45, TABLE_END[1] + 1.25], k, 0.03), at: [(P.dog.pos[0] + TABLE_END[0]) / 2 - 0.2, CH + 0.75, (P.dog.pos[1] + TABLE_END[1]) / 2], fov: 60 }),
      seguranca: () => ({ eye: [APT.x0 + 0.45, CH + 2.55, APT.z1 - 0.5], at: [-14.2, CH + 0.6, -15.9], fov: 62 }),
      cao: (P, k) => ({ eye: shake([P.dog.pos[0] - 0.75, CH + 0.4, P.dog.pos[1] - 0.95], k, 0.02), at: [TABLE_END[0], CH + 0.95, TABLE_END[1]], fov: 64 }),
    },
    sfx: [[0.85, 'pano-puxa', 'jonas'], [1.4, 'cao-busca', 'cao'], [3.0, 'cao-caca', 'cao']], sfxHit: [[0.05, 'pano-voa', 'jonas'], [0.4, 'cao-surdo', 'cao'], [1.4, 'cao-busca', 'cao']],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.5, to: [TABLE_END[0], TABLE_END[1]] }),
  },
  // ---- (b) behind the cupboard, and the cupboard over onto it
  {
    id: 'atras', panel: 13, branch: 'atras', title: 'Atrás do armário', cam: 'cine', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 3.2, post: 0.3, film: 0.4,
    cmd: { kind: 'hold', strict: true, still: true, grace: 1.6, need: 6, window: 8.2, fatal: true },
    pose(k, B) {
      // in the gap between the cupboard's back and the wall, his breath held (MOCAP.espreitar): the dog comes in, turns to his heat, and stands at the cupboard's door
      const g = go(W_ATRAS, k, 2.5, { round: 0.35 }), j = { ...g, crouch: g.d > lenOf(W_ATRAS) - 1.2 ? 1 : 0, mocap: MOCAP.espreitar };      // (he fits the gap side on: 0.75 m between the cupboard's back and the wall, his shoulders across it)
      const w = go(DOG_IN, k - 1.0, 2.8, { round: 0.3 }), u = uOf(B), at = mix([w.pos[0], w.pos[1]], DOG_AT_CUP, ease(B.open || B.hitAt != null ? clamp(u / 0.85) : 0));
      const dog = !B.open && B.hitAt == null ? { ...dogAt(w, { state: 'busca', sensor: SENSOR.amber }), look: Math.sin(k * 1.6) * 0.9, hidden: k < 1.0 }
        : { pos: at, h: CH, yaw: turnTo(heading(DOG_IN.at(-1), DOG_AT_CUP), -Math.PI / 2, ease((u - 0.7) / 0.2)), speed: u < 0.85 ? 0.6 : 0, state: u > 0.5 ? 'caca' : 'busca', sensor: u > 0.5 ? SENSOR.white : SENSOR.amber, y: 0, pitch: 0, look: u > 0.85 ? Math.sin(u * 40) * 0.25 : 0 };
      // (he breathes until he holds it, and again when he lets go)
      const P = { jonas: j, dog, fx: { aptDoor: 1.5 }, lamp: { from: 'dog', color: SENSOR.amber }, foot: 'passo-hall', pant: !(B.open && (B.prog ?? 0) > 0.001) && B.hitAt == null, scan: !dog.hidden && dog.state === 'busca',
        sign: B.open ? { at: [BEHIND[0], CH + 1.35, BEHIND[1] + 0.45], word: 'prenda a respiração', bar: true, hold: true } : null };
      return { ...P, cam: this.cams.ombro(P, k) };
    },
    cams: {
      ombro: (P, k) => ({ eye: shake([APT.x1 - 0.28, CH + 1.62, CUPBOARD.z1 + 1.0], k, 0.02), at: [CUPBOARD.x0 - 0.5, CH + 0.7, CUPBOARD.in[1] + 0.1], fov: 66 }),
      seguranca: () => ({ eye: [APT.x0 + 0.45, CH + 2.55, APT.z1 - 0.5], at: [-13.4, CH + 0.7, -16.9], fov: 58 }),
      cao: (P, k) => ({ eye: shake([P.dog.pos[0] - 0.9, CH + 0.42, P.dog.pos[1] + 0.9], k, 0.02), at: [CUPBOARD.x0, CH + 1.0, CUPBOARD.in[1]], fov: 64 }),
    },
    sfx: [[1.3, 'cao-busca', 'cao'], [2.9, 'cao-busca', 'cao']],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.9, to: [BEHIND[0], BEHIND[1] + 0.3] }),
  },
  {
    id: 'empurra', panel: 14, branch: 'atras', title: 'O armário em cima do cão', cam: 'cine', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 0.25, post: 3.6, film: 1.8,
    cmd: { kind: 'mash', window: 3.2, need: 9, fatal: true },
    pose(k, B) {
      // his shoulder against the cupboard's back (MOCAP.empurrar): it rocks, and goes over onto the dog; pinned under it, its sensors covered, it thrashes. He runs for the window.
      // (he stands up against its back, facing it, and heaves it past its balance; then it falls by its own weight: the baked curve)
      const over = B.hitAt != null, F = over ? fallAt(B.kh) : null, tip = over ? F.tip : (B.prog ?? 0) * FALL.push.from + Math.sin(k * 21) * 0.008 * (B.open ? 1 : 0);
      let j = still([BEHIND[0] + 0.07, BEHIND[1], CH], turnTo(0, Math.PI / 2, ease(k / 0.3)), { crouch: 1 - ease(k / 0.25), lean: 0.5 + (B.prog ?? 0) * 0.5, mocap: MOCAP.empurrar });
      if (over && B.kh > 0.9) j = go(TO_WINDOW([BEHIND[0] + 0.07, BEHIND[1], CH]).toSpliced(1, 0, [BEHIND[0], -16.25, CH], [-13.0, -15.9, CH]), B.kh - 0.9, JOG, { round: 0.45 });
      // the dog: looking up at it as it rocks; at the blow it goes down under it (its own fall), and lies there, its sensors covered
      const down = over && F.hit >= 0;
      const dog = { pos: DOG_AT_CUP, h: CH, yaw: -Math.PI / 2, speed: 0, state: down ? 'desligado' : 'caca', at: down ? F.hit : undefined, sensor: down ? SENSOR.off : SENSOR.white, y: 0, pitch: down ? 0 : -0.12 * clamp(tip / 0.3), look: down ? 0 : Math.sin(k * 9) * 0.2, back: over ? F.back : FALL.onDog.tall };
      const P = { jonas: j, dog, fx: { aptDoor: 1.5, tip }, lamp: { from: over ? 'jonas' : 'dog', color: SENSOR.white }, foot: 'passo-hall',
        sign: B.open ? { at: [CUPBOARD.x1 - 0.1, CH + 1.5, CUPBOARD.in[1]], word: 'empurre o armário', bar: true } : null };
      return { ...P, cam: BEAT.atras.cams.ombro(P, k + 20) };
    },
    cams: { ombro: (P, k) => BEAT.atras.cams.ombro(P, k + 20), seguranca: () => BEAT.atras.cams.seguranca(), cao: (P, k) => ({ eye: shake([DOG_AT_CUP[0] - 1.5, CH + 0.4, DOG_AT_CUP[1] + 1.5], k, 0.02), at: [CUPBOARD.x0, CH + 0.9, CUPBOARD.in[1]], fov: 66 }) },
    sfxCmd: [[0, 'armario-range', [CUPBOARD.x1, CH + 1, CUPBOARD.in[1]]], [0.9, 'armario-range', [CUPBOARD.x1, CH + 1, CUPBOARD.in[1]]]], sfxHit: [[0.05, 'armario-range', [CUPBOARD.x0, CH + 1, CUPBOARD.in[1]]], [FALL.hitAt, 'armario-cai', [DOG_AT_CUP[0] + 0.6, CH + 0.7, DOG_AT_CUP[1]]], [FALL.hitAt + 0.02, 'cao-bate', 'cao'], [FALL.hitAt + 0.3, 'cao-derruba', 'cao'], [FALL.restAt, 'armario-fecha', [DOG_AT_CUP[0], CH + 0.5, DOG_AT_CUP[1]]]],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.9, to: [BEHIND[0], BEHIND[1] + 0.3] }),
  },
  // ---- (c) into the cupboard: a trap (holding his breath does not save him: it has his signature and it sees heat)
  {
    id: 'entra', panel: 13, branch: 'dentro', title: 'Para dentro do armário', cam: 'fp', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 1.5,
    pose(k) {
      const g = go(W_DENTRO, k, 2.4, { round: 0.4 }), cup = g.done ? 1.45 * (1 - ease((k - g.T) / 0.5)) : 1.45 * ease((g.d - (lenOf(W_DENTRO) - 1.6)) / 0.6);
      const j = g.done ? still(HIDE, Math.PI / 2, { crouch: 1 }) : g, way = go(DOG_IN.slice(0, 2), k - 0.2, 1.1);
      return { jonas: hidden(j), dog: { pos: way.pos, h: CH, yaw: way.yaw, speed: way.speed, state: 'busca', sensor: SENSOR.amber, hidden: true }, cam: g.done ? TRAP_CAMS.fresta({ jonas: j, inside: true }, k) : fp(j, { fov: 74 }), fx: { aptDoor: 1.5, cupboard: cup }, pant: true, quiet: g.done, inside: g.done };
    },
    sfx: [[0.45, 'armario-abre', [CUPBOARD.x0, CH + 1, CUPBOARD.in[1]]], [1.3, 'armario-fecha', [CUPBOARD.x0, CH + 1, CUPBOARD.in[1]]]],
  },
  {
    id: 'dentro', panel: 13, branch: 'dentro', title: 'Dentro do armário', cam: 'fp', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 1.5, post: 0, film: 0.5,
    cmd: { kind: 'hold', strict: true, still: true, grace: 1.6, need: 3.6, window: 5.6, fatal: true },
    pose(k, B) {
      // through the slats, his breath held: the dog comes in by the door, goes about the room, stops in the middle of it and sweeps it with its sensor
      const j = still(HIDE, Math.PI / 2, { crouch: 1 }), u = B.open || B.hitAt != null ? uOf(B) : 0, dog = trapDog(k, u, B.open || B.hitAt != null);
      const P = { jonas: hidden(j), dog, fx: { aptDoor: 1.5, cupboard: 0 }, lamp: { from: 'dog', color: SENSOR.amber, at: dog.scan && Math.sin(u * 30) > 0.55 ? HIDE : null }, inside: true, creak: true, scan: Boolean(dog.scan), quiet: true, pant: !(B.open && (B.prog ?? 0) > 0.001),
        sign: B.open ? { at: [CUPBOARD.x0 - 0.05, CH + 0.92, CUPBOARD.in[1] + 0.2], word: 'prenda a respiração', bar: true, hold: true } : null };
      return { ...P, cam: TRAP_CAMS.fresta(P, k) };
    },
    cams: TRAP_CAMS, loop: 'coracao',
    failFrom: (P) => ({ from: P.dog.hidden || P.dog.pos[1] < APT.z0 + 0.4 ? [DOG_IN.at(-1)[0], DOG_IN.at(-1)[1]] : P.dog.pos, delay: 1.0, to: [CUP_FRONT[0] + 0.1, CUP_FRONT[1]], cup: true }),      // (he let his breath go: it comes from where it is in the room, or in by the door)
  },
  {
    id: 'achado', panel: 13, branch: 'dentro', title: 'O cão o acha', cam: 'fp', room: 'predio', amb: 'ambiente-apto', space: 'andar', pre: 0,
    cmd: { kind: 'doom', window: 1.2 },
    pose(k) {
      // it has done with the room: its sensor comes round to the cupboard and stays on it (his heat), and it comes
      const j = still(HIDE, Math.PI / 2, { crouch: 1 }), turn = ease(k / 0.4), w = go([[...SCAN_AT, CH], [CUP_FRONT[0] - 0.15, CUP_FRONT[1], CH]], k - 0.4, 1.6);
      const dog = { pos: w.pos, h: CH, yaw: turnTo(SCAN_YAW, heading(SCAN_AT, CUP_FRONT), turn), speed: w.speed, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, look: 0 };
      const P = { jonas: hidden(j), dog, fx: { aptDoor: 1.5, cupboard: 0 }, lamp: { from: 'dog', color: SENSOR.white, at: HIDE }, inside: true, creak: true, quiet: true, pant: true };
      return { ...P, cam: TRAP_CAMS.fresta(P, k + 9) };
    },
    cams: null, loop: 'coracao',
    sfx: [[0.05, 'cao-caca', 'cao']],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.25, to: [CUP_FRONT[0] + 0.1, CUP_FRONT[1]], cup: true }),
  },
  {
    id: 'janela', panel: 16, title: 'Pela janela', cam: 'fix', cp: true, room: 'rua', space: 'andar', pre: 7.4,
    pose(k) {
      // from the street, looking up at the front: the sash goes up, he is out on the fire escape and down its first stair; a sensor's light comes to the window behind him
      const OUT = 1.3, g = twoPaces(W16, k - OUT, 1.6, 1.0, 1.55), sill = Math.exp(-(((g.d - 0.75) / 0.45) ** 2)), through = g.d < 1.6;
      // (the last of the way is the first treads of the fire escape's stair, going down: each foot on its own)
      const onStair = !through && g.pos[0] < E.top + 0.9 && Math.abs(g.pos[1] - OUT_Z) < 0.05, es = onStair ? escapeStep(3, g.pos[0]) : null;
      const j = { ...g, y: sill * 0.62, crouch: through ? 1 : 0, hidden: k < OUT - 0.2, ...(onStair ? { stairs: g.pos[0] < E.top && !g.done ? { dir: -1, k: +es.k.toFixed(4), run: es.run, pace: 'run' } : null, ground: profile((d) => escapeStep(3, g.pos[0] - d).h) } : {}) };
      const seen = ease((k - 5.5) / 0.8), dog = { pos: [WX + 0.1, APT.z1 - 0.75 + 0.45 * seen], h: Y[3], yaw: Math.PI, speed: seen < 1 && seen > 0 ? 1 : 0, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, look: Math.sin(k * 2.4) * 0.6, hidden: k < 5.2 };
      return { jonas: j, dog, cam: { eye: [-9.6, 1.65, -4.8], at: [-13.0, 10.4, -11.2], fov: 38 }, fx: { window: ease(k / 1.1) }, lamp: { from: k > 5.2 ? 'dog' : 'jonas', color: SENSOR.white }, foot: through ? null : 'passo-grade', halo: k > 5.2 };
    },
    sfx: [[0.1, 'janela-sobe', [WX, Y[3] + 1.4, BLOCK.zf]], [5.4, 'cao-caca', 'cao']],
  },
  {
    id: 'degrau', panel: 17, title: 'O degrau cede', cam: 'fp', room: 'rua', space: 'andar', pre: 1.9, post: 6.2, film: 0.35,
    cmd: { kind: 'press', window: 0.9, fatal: true },
    pose(k, B) {
      // going down backwards, his face to the wall and the window above; a rusted tread lets go and he drops half a metre: the rail
      const x0 = -12.9, x = x0 + (LOOSE_X - x0) * clamp(k / 1.9), fallen = B.open || B.hitAt != null, drop = fallen ? 0.55 * (B.hitAt != null ? ease(1 - (B.kh - 0.15) / 0.7) : clamp((k - 1.9) / 0.14)) : 0;
      let j = { pos: [x, OUT_Z], h: escapeH(3, x) - drop, yaw: -Math.PI / 2, speed: fallen ? 0 : 0.5, d: (x0 - x) * 2 }, pitch = 0.5 - 0.1 * clamp(k / 1.9), yaw = -Math.PI / 2 + 1.0;
      if (B.hitAt != null && B.kh > 0.9) { const g = go(W17, B.kh - 0.9, 3.0, { round: 0.3 }); j = { ...g, d: g.d + 3 }; const t = ease((B.kh - 0.9) / 0.5); yaw = turnTo(yaw, g.yaw, t); pitch = pitch + (-0.32 - pitch) * t; if (g.done) { yaw = turnTo(g.yaw, -Math.PI / 2, ease((B.kh - 0.9 - g.T) / 0.3)); pitch = -0.5; } }
      const jolt = fallen && B.hitAt == null ? Math.sin(k * 40) * 0.03 : B.hitAt != null ? Math.sin(B.kh * 34) * 0.04 * Math.exp(-B.kh * 5) : 0;
      // the dog at the window above: its light, and then all of it out on the landing as he goes on down
      const late = B.hitAt != null ? B.kh : 0, w = go(W18_DOG, late - 3.2, 2.4, { round: 0.3 });
      const dog = late < 3.2 ? { pos: [WX + 0.1, APT.z1 - 0.3], h: Y[3], yaw: Math.PI, speed: 0, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0, look: Math.sin(k * 2.4) * 0.6 } : { ...dogAt(w), y: Math.exp(-(((w.d - 0.5) / 0.4) ** 2)) * 0.6 };
      return { jonas: hidden(j), dog, cam: fp(j, { yaw, pitch, dy: jolt, fov: 72, eye: fallen && (B.hitAt == null || B.kh < 0.9) ? EYE - 0.25 : EYE }), fx: { window: 1, step: fallen ? 1 : 0 }, foot: 'passo-grade', halo: true,
        sign: B.open ? { at: [x - 0.35, escapeH(3, x) + 0.75, E.mid + 0.02], word: 'agarre', react: true } : null };
    },
    sfx: [[1.85, 'degrau-cede', 'jonas']], sfxHit: [[0, 'corrimao', 'jonas'], [3.2, 'cao-caca', 'cao']],
    failFrom: () => ({ from: [WX, WALK_Z], fromH: Y[3], delay: 1.25, to: [LOOSE_X - 0.6, E.z1 + 0.5], toH: Y[0], drop: true }),
  },
  {
    id: 'trava', panel: 18, title: 'A trava da última escada', cam: 'fix', room: 'rua', space: 'fora', pre: 0.9, post: 2.6, film: 2.6,
    cmd: { kind: 'mash', window: 4.6, need: 12, fatal: true },
    pose(k, B) {
      // from the pavement, looking up: he is at the latch of the drop ladder; the dog is on the landing above, steel on steel, coming down
      const u = uOf(B), free = B.hitAt != null, d0 = 7.2 + 0.9 * 2.4, L = lenOf(W18_DOG), a = along(W18_DOG, B.open || free ? d0 + (L - d0) * ease(u) : 7.2 + Math.min(k, 0.9) * 2.4, 0.3);
      const dog = { pos: a.pos, h: a.h, yaw: a.yaw, speed: B.open ? 1.6 : free ? 3 : 2.4, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0 };
      let j = still([LATCH[0], LATCH[1], Y[1]], -Math.PI / 2, { crouch: 1, action: B.open ? 'manipular' : null, lean: B.prog ?? 0 });
      const ladder = free ? ease(B.kh / 0.35) : 0;
      // (the ladder runs out; he swings onto it and goes down its rails, his feet outside them)
      if (free && B.kh > 0.45) { const t = clamp((B.kh - 0.45) / 0.35), dn = clamp((B.kh - 0.8) / 1.5); j = { pos: mix(LATCH, [LADDER[0] - 0.12, LADDER[1] + 0.2], ease(t)), h: Y[1] + (Y[0] - Y[1]) * (dn * dn * 0.4 + dn * 0.6), yaw: Math.PI, speed: 0, d: 0, crouch: dn > 0 && dn < 1 ? 0.6 : 0 }; }
      return { jonas: j, dog, cam: { eye: [-14.5, 1.45, -6.45], at: [-12.7, 5.5, -11.0], fov: 62 }, fx: { window: 1, step: 1, ladder }, lamp: { from: 'jonas' },
        sign: B.open ? { at: [LADDER[0], Y[1] + 0.9, LADDER[1]], word: 'solte a trava', bar: true } : null };
    },
    sfx: [[0.2, 'passo-grade', 'cao'], [0.6, 'passo-grade', 'cao']], sfxHit: [[0, 'trava-solta', [LADDER[0], Y[1], LADDER[1]]], [0.35, 'escada-desce', [LADDER[0], 1, LADDER[1]]]],
    failFrom: (P) => ({ from: P.dog.pos, fromH: P.dog.h, delay: 0.55, to: [LATCH[0], LATCH[1]], toH: Y[1] }),
  },
  {
    id: 'calcada', panel: 19, title: 'A grade', cam: 'fp', room: 'rua', space: 'fora', pre: lenOf(W19) / RUN + 0.25, post: 1.15, film: 0.3,
    cmd: { kind: 'hold', window: 2.6, need: 1.25, fatal: true },
    pose(k, B) {
      // the pavement to the shaft in his eyes; at the grate he lifts the hatch leaf and goes in under it. Behind him the dog is off the fire escape.
      const g = go(W19, k - 0.25, RUN, { round: 1.0 }), there = g.done, T = g.T + 0.25, down = B.hitAt != null ? ease(B.kh / 0.9) : 0;
      const kneel = there ? ease((k - T + 0.2) / 0.3) : 0, lift = B.hitAt != null ? 1 : (B.prog ?? 0);
      const j = { ...g, yaw: there ? 0 : g.yaw, pos: there ? mix(GRATE_AT, [SHAFT.hatch[0], SHAFT.pos[1]], down) : g.pos, h: there ? 0.15 - down * 1.35 : undefined };
      // the dog: down off the landing with a crash as he runs, across the avenue as he lifts
      const dk = k - 1.6, fall = clamp(dk / 0.55), w = go(W19_DOG, dk - 0.75, 0.55 * lenOf(W19_DOG) / (T - 2.35), { round: 0.9 }), u = uOf(B);
      let dog = dk < 0.55 ? { pos: mix([-12.2, -10.7], W19_DOG[0], fall), h: Y[1] + (0.15 - Y[1]) * fall * fall, yaw: -Math.PI / 2, speed: 4, state: 'caca', sensor: SENSOR.white, y: 0, pitch: -0.3 + 0.5 * fall } : dogAt(w);
      if (B.open || B.hitAt != null) { const a = along(W19_DOG, lenOf(W19_DOG) * (0.55 + 0.45 * ease(u)), 0.9); dog = { pos: a.pos, yaw: a.yaw, speed: DOG * 0.6, state: 'caca', sensor: SENSOR.white, y: 0, pitch: 0 }; }
      return { jonas: hidden(j), dog, cam: fp(j, { yaw: j.yaw, pitch: there ? -0.25 - 0.8 * kneel + 0.5 * down : -0.05, eye: EYE - 0.45 * kneel, fov: 74 }), fx: { ladder: 1, step: 1, window: 1, hatch: 1.25 * ease(lift) }, foot: there ? null : 'passo-rua',
        sign: B.open ? { at: [SHAFT.hatch[0], 0.5, SHAFT.pos[1] + 0.2], word: 'levante a folha', bar: true, hold: true } : null };
    },
    sfx: [[0, 'respiracao', 'jonas'], [1.6, 'cao-salta', 'cao'], [2.15, 'queda-corpo', 'cao'], [2.3, 'cao-caca', 'cao']], sfxCmd: [[0, 'grade-range', [SHAFT.hatch[0], 0.2, SHAFT.pos[1]]]],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.6, to: [GRATE_AT[0], GRATE_AT[1] - 0.2] }),
  },
  {
    id: 'fecha', panel: 19, title: 'A grade', cam: 'slow', room: 'poco', space: 'fora', pre: 0.25, post: 1.0, film: 0.42,
    cmd: { kind: 'press', window: 0.6, slow: true, fatal: true },
    pose(k, B) {
      // from the mouth of the shaft, his head just under the pavement: the dog in the air over him, slow; he pulls the leaf down over himself
      const u = B.hitAt != null ? Math.min(1, B.uHit * 0.86 + B.kh / 0.5) : B.open ? B.u * 0.86 : 0, shut = B.hitAt != null ? ease(B.kh / 0.14) : 0;
      const arc = leapArc(LEAP19.S, B.hitAt != null ? mix(LEAP19.C, ON_GRATE, ease(B.kh / 0.3)) : LEAP19.C, u, 1.15);
      const dog = { ...arc, state: 'caca', sensor: SENSOR.white, pos: B.hitAt != null && u >= 1 ? ON_GRATE : arc.pos, y: (B.hitAt != null && u >= 1 ? 0 : arc.y) };
      const j = still([SHAFT.hatch[0], SHAFT.pos[1], 0.15 - 1.35 - 0.5 * shut], 0);
      const eye = [SHAFT.hatch[0] + 0.05, 0.15 - 0.2 - 0.45 * shut, SHAFT.pos[1] + 0.1], at = [dog.pos[0], 0.75 + (dog.y ?? 0), dog.pos[1]];
      return { jonas: hidden(j), dog, cam: { eye, at: mix(at, [SHAFT.top[0], 0.2, SHAFT.top[1]], shut * 0.6), fov: 78 }, fx: { ladder: 1, step: 1, window: 1, hatch: 1.25 * (1 - shut) }, lamp: { from: 'dog', color: SENSOR.white },
        sign: B.open ? { at: [SHAFT.hatch[0] - 0.3, 0.75, SHAFT.pos[1]], word: 'feche', react: true } : null };
    },
    sfx: [[0.2, 'cao-salta', 'cao'], [0.25, 'camera-lenta', null]], sfxHit: [[0.1, 'grade-fecha', [SHAFT.hatch[0], 0.2, SHAFT.pos[1]]], [0.5, 'passo-grade', 'cao']],
    failFrom: (P) => ({ from: P.dog.pos, delay: 0.3, to: [GRATE_AT[0], GRATE_AT[1] - 0.5] }),
  },
  {
    id: 'grade', panel: 20, title: 'Em cima da grade', cam: 'cine', room: 'poco', space: 'fora', pre: 5.2, post: 7.0, film: 8, last: true,
    cmd: { kind: 'still', window: 8 },
    pose(k, B, rec) {
      // the camera of the night's first cutscene, in the shaft, looking up through the grate: the dog stands on it, its light comes down between the bars and goes over him
      const tilt = ease((k - 1.6) / 2.6), heard = (rec.moved ?? []).reduce((m, t) => Math.max(m, Math.exp(-Math.max(0, rec.t - t) * 1.4)), 0);
      const j = { pos: SHAFT.in, h: SHAFT.perch, yaw: Math.PI / 2 + 0.25, speed: 0, d: 0, gaze: { x: 0, y: 0.6 }, lamp: 'off' };
      const leaving = B.hitAt != null ? B.kh - 1.2 : -1, w = go(W20_OFF, leaving, 2.4, { round: 0.6 });
      const sweepT = B.hitAt != null ? rec.t : k, sweep = Math.sin(sweepT * 0.7) * (1 - heard);
      const dog = leaving > 0 ? dogAt(w, { state: 'calma', sensor: SENSOR.weak })
        : { pos: [ON_GRATE[0] + 0.05 * Math.sin(k * 0.5), ON_GRATE[1]], yaw: -Math.PI / 2 + 0.2, speed: 0, state: heard > 0.3 ? 'caca' : 'busca', sensor: heard > 0.3 ? SENSOR.white : SENSOR.amber, y: 0, pitch: 0.2 + heard * 0.12, look: sweep * 0.9 };
      const eye = [-1.38, -0.44, 9.58], at = mix([4.5, 3.3, 10.4], [0.3, 0.02, 9.8], tilt);
      // (its light: from its sensor down through the bars, across the wall he has his back to, over him and on)
      const beam = leaving > 0.4 ? null : { pos: [dog.pos[0] + 0.35, 0.78, dog.pos[1]], dir: [0.25 * sweep + (heard ? (j.pos[0] - dog.pos[0]) * heard * 0.6 : 0), -1, 0.32 * Math.cos(sweepT * 0.45) * (1 - heard) + heard * 0.2], color: heard > 0.3 ? SENSOR.white : SENSOR.amber };
      return { jonas: j, dog, cam: { eye, at, fov: 55 }, fx: { ladder: 1, step: 1, window: 1, hatch: 0 }, lamp: beam ? { ...beam, range: 6, cone: 0.36 } : { off: true },
        sign: B.open ? { at: [j.pos[0] - 0.15, SHAFT.perch + 1.25, j.pos[1] - 0.3], word: 'não se mexa', still: true } : null };
    },
    sfx: [[0.3, 'passo-grade', 'cao'], [0.9, 'passo-grade', 'cao'], [1.5, 'passo-grade', 'cao'], [2.2, 'cao-busca', 'cao']], sfxHit: [[0.4, 'gota-cano', [SHAFT.in[0], -1.5, SHAFT.in[1]]], [1.3, 'passo-grade', 'cao'], [1.9, 'passo-grade', 'cao'], [2.6, 'cao-rolar', 'cao'], [3.3, 'cao-rolar', 'cao'], [4.1, 'cao-rolar', 'cao']],
  },
];
export const BEAT = Object.fromEntries(BEATS.map((b) => [b.id, b]));
/** The saved points of the chase, in order (the first of the scene's five is the start of the splice). */
export const CHECKPOINTS = BEATS.filter((b) => b.cp).map((b) => b.id);
/** What missing a command of the chase raises the Escuta by when it is not the dog (moving on the grate). */
export const STILL_ESCUTA = 8;

const stepsFor = (b) => [...(b.pre > 0 ? [{ kind: 'beat', window: b.pre, id: b.id }] : []), ...(b.cmd ? [{ ...b.cmd, after: b.post ?? (b.cmd.kind === 'doom' ? 0 : 0.4), id: b.id }] : [])];
/** The ways out of the flat (the choice of the beat `escolha`), and the beats that are of one of them only. */
export const BRANCHES = ['pano', 'atras', 'dentro'];
/** The steps of a way of the choice: its own beats (from `from`, if it is one of them) and then the rest of the chase (the trap has no rest). */
export function branchSteps(id, from = null) {
  const own = BEATS.filter((b) => b.branch === id), i0 = Math.max(0, own.findIndex((b) => b.id === from)), last = BEATS.findLastIndex((b) => b.branch);
  return [...own.slice(i0).flatMap(stepsFor), ...(id === 'dentro' ? [] : BEATS.slice(last + 1).flatMap(stepsFor))];
}
/** The steps of the sequence (systems/sequence.js) from a beat on: a `beat` step for what only plays, then the command; the choice carries its branches. */
export function stepsOf(from = BEATS[0].id) {
  const b0 = BEAT[from] ?? BEATS[0];
  if (b0.branch) return branchSteps(b0.branch, b0.id);
  const out = BEATS.slice(BEATS.indexOf(b0)).filter((b) => !b.branch).flatMap(stepsFor), i = out.findIndex((s) => s.kind === 'choose');
  if (i >= 0) { out[i] = { ...out[i], branches: Object.fromEntries(BRANCHES.map((k) => [k, branchSteps(k)])) }; out.length = i + 1; }
  return out;
}
/** The command of a beat as it was (or is being) answered, from the recording: see BEATS. */
function stateOf(rec, id, t) {
  const iA = rec.steps.findIndex((s) => s.id === id), iC = rec.steps.findIndex((s) => s.id === id && s.cmd);
  if (iA < 0 || rec.starts[iA] === undefined) return null;
  const t0 = rec.starts[iA], B = { t0, k: t - t0, pre: BEAT[id].pre, open: false, u: 0, prog: null, hitAt: null, uHit: 0, kh: 0, aim: null, win: null };
  if (iC >= 0 && rec.starts[iC] !== undefined) {
    const tc = rec.starts[iC], win = rec.wins[iC] ?? BEAT[id].cmd.window, end = rec.ends[iC];
    B.win = win; B.aim = rec.aims?.[iC] ?? rec.aim ?? null;
    const c = BEAT[id].cmd, byBar = c.kind === 'hold' && c.strict;
    if (end !== undefined && rec.hits[iC]) { B.hitAt = end - t0; B.kh = t - end; B.uHit = byBar ? 1 : clamp((end - tc) / win); B.prog = 1; }
    else if (end !== undefined) { B.open = true; B.missed = true; B.u = byBar ? rec.prog ?? 0 : clamp((end - tc) / win); B.prog = rec.prog ?? 0; if (rec.aim != null) B.aim = rec.aim; }   // (missed: it stays as it was)
    else { B.open = true; B.u = byBar ? rec.prog ?? 0 : clamp((t - tc) / win); B.prog = rec.prog ?? 0; if (rec.aim != null) B.aim = rec.aim; }
  }
  return B;
}
const prevOf = (rec, id) => stateOf(rec, id, rec.t ?? 0);
/** Which beat is on at the recording's last step. */
export function beatOf(rec) { let i = rec.starts.length - 1; while (i > 0 && rec.starts[i] === undefined) i--; return rec.steps[Math.max(0, i)]?.id ?? BEATS[0].id; }

/** The picture at time `t` of the recording. */
export function chasePose(rec, t, o = {}) {
  const id = beatOf(rec), b = BEAT[id], r = { ...rec, t }, B = stateOf(r, id, t);
  const cams = b.cams ?? (b.branch === 'dentro' ? TRAP_CAMS : null);
  const alt = (P) => (o.cam && cams?.[o.cam] && !(P.fx?.attack >= 0) ? { ...P, cam: cams[o.cam](P, B.k, B), kind: b.cam === 'fp' ? 'cine' : P.kind, jonas: b.cam === 'fp' ? { ...P.jonas, hidden: false } : P.jonas } : P);
  if (rec.failAt != null && B) {
    // (the command was missed: the picture holds what the beat was doing when it was, and the dog comes)
    const tf = rec.failAt, Bf = stateOf({ ...r, t: tf }, id, tf), P0 = b.pose(Bf.k, Bf, { ...r, t: tf });
    return alt(failPose(b, P0, t - tf, rec));
  }
  const P = b.pose(B.k, B, r);
  return alt(finish(b, P, rec));
}
function finish(b, P, rec) {
  const fx = { space: b.space, door: 0, glass: 0, aptDoor: 0.5, cupboard: 0, window: 0, step: 0, ladder: 0, hatch: 0, tip: 0, pano: true, aim: null, slowK: rec.slowK ?? 0, ...defaultsFor(b.id, rec.branch), ...(P.fx ?? {}) };
  const dog = P.dog?.hidden ? { ...P.dog, pos: [P.dog.pos[0], P.dog.pos[1]], h: -40, heard: [P.dog.pos[0], (P.dog.h ?? GROUND(P.dog.pos)) + 0.8, P.dog.pos[1]] } : P.dog;
  return { beat: b.id, kind: b.cam, room: b.room, foot: null, sign: null, mirror: null, decoy: null, cloth: null, lamp: null, ...P, dog, fx };
}
/** What the building looks like before and after a beat has touched it (a run from a saved point finds it as the run before left it). */
function defaultsFor(id, branch) {
  const i = BEATS.findIndex((b) => b.id === id), after = (x) => i > BEATS.findIndex((b) => b.id === x);
  return { glass: after('hall') ? 2 : after('vidro') ? 1 : 0, aptDoor: after('corredor') ? 1.5 : 0.5, tip: branch === 'atras' && after('empurra') ? FALL.rest : 0, pano: !(branch === 'pano' && after('pano')), window: after('janela') ? 1 : 0, step: after('degrau') ? 1 : 0, ladder: after('trava') ? 1 : 0 };
}
/** How long after the miss the dog is on him: the beat says where it comes from. */
export function failOf(b, P0) { const f = b.failFrom?.(P0) ?? { from: P0.dog.pos, delay: 0.6 }; return { delay: f.delay, ...f }; }
/** The command missed: the dog comes from where the beat says and takes him down; the camera leaves his eyes for the attack. `k`: seconds since the miss. */
function failPose(b, P0, k, rec) {
  const f = failOf(b, P0), J0 = P0.jonas, C = f.to ?? J0.pos, hC = f.toH ?? (f.to ? J0.h ?? GROUND(C) : hOf(J0)), S = f.from, hS = f.fromH ?? hC, hit = k - f.delay;
  const kd = (() => { const L = Math.hypot(C[0] - S[0], C[1] - S[1]) || 1; return [(C[0] - S[0]) / L, (C[1] - S[1]) / L]; })(), yawD = heading(S, C);
  let dog, jonas, cam, fx = { ...(P0.fx ?? {}) };
  if (hit < 0) {
    // it comes: the last of its run and the leap
    const u = clamp(k / f.delay), lp = clamp((u - 0.45) / 0.55), p = mix(S, [C[0] - kd[0] * 0.35, C[1] - kd[1] * 0.35], u);
    dog = { pos: p, h: hS + (hC - hS) * u * u, yaw: yawD, speed: 5, state: 'caca', sensor: SENSOR.white, y: (f.fromH != null ? 0.4 : 0.55) * Math.sin(Math.PI * lp), pitch: -0.3 * Math.cos(Math.PI * lp * 0.9) };
    // he sees it come: the eyes turn to it (or go down with him, when it is a fall)
    const j0 = { ...J0, speed: 0 }, eyeH = (P0.cam.eye[1] - hOf(J0));
    if (f.drop) { const d = u * u; jonas = { ...j0, pos: mix(J0.pos, C, d), h: hOf(J0) + (hC - hOf(J0)) * d, hidden: true }; cam = { eye: [jonas.pos[0], jonas.h + eyeH * (1 - 0.6 * d), jonas.pos[1]], at: [jonas.pos[0] + 0.6, jonas.h + eyeH + 2.5 - 2 * d, jonas.pos[1] - 1.5], fov: P0.cam.fov ?? 72 }; }
    else if (b.cam === 'fp' || b.cam === 'slow') {
      const want = [p[0], dog.h + 0.6 + dog.y, p[1]], t = ease(u / 0.6), lurch = f.fall ? Math.sin(Math.min(1, k / 0.25) * Math.PI) * 0.25 : 0, at0 = P0.cam.at;
      const shakeL = f.lock ? Math.sin(k * 31) * 0.05 * (1 - t) : 0;
      jonas = { ...j0, hidden: true }; cam = { eye: [P0.cam.eye[0] + shakeL, P0.cam.eye[1] - lurch, P0.cam.eye[2]], at: f.lock && u < 0.55 ? [at0[0] + shakeL * 4, at0[1], at0[2] - 2.5 * ease(u / 0.3)] : mix(at0, want, t), fov: P0.cam.fov ?? 72 };
      if (f.cup) fx.cupboard = Math.max(fx.cupboard ?? 0, 1.5 * ease((k - f.delay * 0.55) / (f.delay * 0.4)));
    } else { jonas = { ...j0, action: null }; cam = P0.cam; }
    return finish(b, { ...P0, jonas, dog, cam, fx, sign: null, mirror: null, lamp: { from: 'dog', color: SENSOR.white }, }, rec);
  }
  // on him: he goes down, and it strikes again and again; the picture is close and low, beside them, and shakes at the first blow
  const beat = Math.max(0, Math.sin(hit * 13)), over = [C[0] - kd[0] * 0.35, C[1] - kd[1] * 0.35], tremble = hit > 0.55 ? Math.max(0, 1 - (hit - 0.55) / 2.4) : 0;
  dog = hit < 0.9 ? { pos: over, h: hC, yaw: yawD, speed: 0, state: 'caca', action: 'derrubar', at: hit, y: 0, pitch: 0, sensor: SENSOR.white }
    : { pos: [over[0] + kd[0] * 0.2 * beat, over[1] + kd[1] * 0.2 * beat], h: hC, yaw: yawD, speed: 0.2, state: 'caca', y: 0.03, pitch: -0.55 * beat, sensor: SENSOR.white };
  jonas = { pos: C, h: hC, yaw: turnTo(J0.yaw ?? 0, yawD + Math.PI, ease((hit - 0.06) / 0.16)), twist: Math.sin(hit * 29) * 0.12 * tremble, crouch: 0, speed: 0, action: 'derrubado', at: hit, hidden: false };
  // (beside them, on the side the room has: the corner where there is most of it)
  const side = ['dentro', 'achado', 'atras', 'empurra'].includes(b.id) ? [-1.1, 1.3] : b.id === 'pano' || b.id === 'escolha' ? [-1.3, -1.2] : b.id === 'corredor' ? [1.7, 0.25] : b.id === 'trava' ? [-1.5, 0.3] : b.id === 'porta' ? [1.3, 1.5] : [1.5, 1.45];
  const sh = Math.exp(-hit * 6) * 0.14, a = ease(hit / 0.45), eye1 = [C[0] + side[0] + Math.sin(hit * 0.6) * 0.1, hC + 0.47 + hit * 0.03, C[1] + side[1] - hit * 0.06], at1 = [C[0] - 0.15, hC + 0.3, C[1] - 0.05];
  const eye = mix(b.cam === 'fp' || b.cam === 'slow' ? eye1 : P0.cam.eye, eye1, a), at = mix(b.cam === 'fp' || b.cam === 'slow' ? at1 : P0.cam.at, at1, a);
  cam = { eye: [eye[0] + Math.sin(hit * 61) * sh, eye[1] + Math.cos(hit * 47) * sh, eye[2]], at, fov: 46 };
  if (f.cup) fx.cupboard = 1.5;
  return finish(b, { ...P0, jonas, dog, cam, fx: { ...fx, attack: hit }, sign: null, mirror: null, lamp: { from: 'dog', color: SENSOR.white }, knock: { C, h: hC } }, rec);
}
/** The time of the attack since the miss, for the game's clock of the death (systems/emenda.js: ATTACK). */
export const attackAt = (rec, t) => { if (rec.failAt == null) return null; const id = beatOf(rec), b = BEAT[id], Bf = stateOf({ ...rec, t: rec.failAt }, id, rec.failAt), P0 = b.pose(Bf.k, Bf, { ...rec, t: rec.failAt }); return t - rec.failAt - failOf(b, P0).delay; };
export { ATTACK };

// ---- a run with every command right (the film, the tests, the length of the chase) ------------------------------------------------------
/**
 * What a perfect run from `from` records: the steps, when each starts and ends, and where every beat falls on its clock:
 * { rec, beats: { id: { t0, cmd (when its command opens), hit, end } }, total }. `slow`: the stretches of the world's clock that are slow.
 */
export function filmRec(from = BEATS[0].id, o = {}) {
  let steps = stepsOf(from);
  const branch = o.branch ?? 'pano', rec = { steps: [], starts: [], wins: [], ends: [], hits: [], aims: [], moved: [], film: true, branch: BEAT[from]?.branch ?? null }, beats = {}, slow = [];
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i], b = BEAT[s.id]; beats[s.id] ??= { t0: t };
    rec.starts[i] = t; rec.wins[i] = s.window;
    if (s.kind === 'beat') { t += s.window; rec.ends[i] = t; rec.hits[i] = true; }
    else {
      const missed = o.miss === s.id || s.kind === 'doom';
      const el = missed ? s.window : s.kind === 'hold' && !s.strict ? s.window : Math.min(s.window, s.kind === 'hold' ? (b.film ?? 0.4) + s.need : s.kind === 'choose' ? b.film ?? 1.6 : b.film ?? 0.5);
      beats[s.id].cmd = t; if (s.slow) slow.push([t, t + el]);
      rec.ends[i] = t + el; rec.hits[i] = !missed; if (s.kind === 'aim') rec.aims[i] = (s.zone[0] + s.zone[1]) / 2;
      beats[s.id].hit = t + el; t += el + (s.after ?? 0.4);
      if (missed) { rec.failAt = rec.ends[i]; beats[s.id].end = t; steps = steps.slice(0, i + 1); break; }
      if (s.kind === 'choose') { steps = [...steps.slice(0, i + 1), ...branchSteps(branch)]; rec.branch = branch; rec.chosenAt = rec.ends[i]; }
    }
    beats[s.id].end = t;
  }
  rec.steps = steps.map((s) => ({ id: s.id, cmd: s.kind !== 'beat' }));
  return { rec, beats, total: t, slow };
}
/** The recording of a run as it stood at time `t` (what the game would hold then): a film asks for any moment in any order. */
export function recAt(full, t) {
  const n = full.starts.findLastIndex((s) => s !== undefined && s <= t) + 1, rec = { ...full, starts: full.starts.slice(0, n), ends: [], hits: [], prog: 0 };
  full.ends.forEach((e, i) => { if (i < n && e <= t) { rec.ends[i] = e; rec.hits[i] = full.hits[i]; } });
  const i = n - 1, s = full.steps[i];
  if (s?.cmd && rec.ends[i] === undefined) {
    const u = clamp((t - full.starts[i]) / Math.max(1e-6, full.ends[i] - full.starts[i])), c = BEAT[s.id].cmd;
    rec.prog = c.kind === 'hold' ? clamp((t - full.starts[i] - (c.strict ? BEAT[s.id].film ?? 0.4 : 0.3)) / c.need) : u; if (c.kind === 'aim') rec.aim = c.from + (full.aims[i] - c.from) * ease(u);
  }
  rec.moved = (full.moved ?? []).filter((m) => m <= t);
  if (full.chosenAt != null && t < full.chosenAt) rec.branch = null;
  if (full.failAt != null && t < full.failAt) rec.failAt = null;
  return rec;
}

/**
 * The one light that is aimed (the render's spot) for a pose and its camera ({ eye, at }): his head lamp (in his eyes, or from his head in a fixed plane),
 * or the dog's sensor when the beat says so: { on, pos, dir, color, range, cos }.
 */
export function lampOf(P, cam) {
  const L = P?.lamp; if (!P) return { on: false };
  if (L?.off) return { on: false, pos: cam.eye, dir: [0, -1, 0] };
  if (L?.pos) return { on: true, pos: L.pos, dir: L.dir, color: L.color ?? SENSOR.amber, range: L.range ?? 9, cos: Math.cos(L.cone ?? 0.45) };
  const inside = P.room === 'predio';
  if (L?.from === 'dog') {
    const d = P.dog, y = (d.yaw ?? 0) + (d.look ?? 0) * 0.6, pos = [d.pos[0] - Math.sin(d.yaw ?? 0) * 0.5, (d.h ?? GROUND(d.pos)) + 0.66 + (d.y ?? 0), d.pos[1] - Math.cos(d.yaw ?? 0) * 0.5];
    const dir = L.at ? [L.at[0] - pos[0], (L.at[2] ?? pos[1]) + 0.9 - pos[1], L.at[1] - pos[2]] : [-Math.sin(y), -0.12, -Math.cos(y)];
    return { on: !d.hidden, pos, dir, color: L.color ?? SENSOR.amber, range: 10, cos: Math.cos(0.5) };
  }
  if (P.kind === 'fp' || P.kind === 'slow') return { on: true, pos: cam.eye, dir: [cam.at[0] - cam.eye[0], cam.at[1] - cam.eye[1], cam.at[2] - cam.eye[2]], color: inside ? '#7a705c' : '#fff2d0', range: inside ? 11 : 15, cos: Math.cos(0.55) };
  const j = P.jonas, pos = [j.pos[0], (j.h ?? GROUND(j.pos)) + 1.6 + (j.y ?? 0), j.pos[1]];
  return { on: !j.hidden, pos, dir: [-Math.sin(j.yaw ?? 0), -0.18, -Math.cos(j.yaw ?? 0)], color: inside ? '#a09478' : '#fff2d0', range: 13, cos: Math.cos(0.5) };
}

// ---- the sound comes from the thing ------------------------------------------------------------------------------------------------------
const STRIDE = { 'passo-rua': 1.5, 'passo-hall': 1.2, 'passo-escada': 0.66, 'passo-grade': 0.85 };      // (on the stairs a step is a tread: 0.28 to 0.4 m)
const placeOfActor = (q, up = 0.8) => q.heard ?? [q.pos[0], (q.h ?? GROUND(q.pos)) + up, q.pos[1]];
/** What a run of the chase keeps between two steps of its sounds. */
export const soundState = () => ({ said: new Set(), foot: 0, breath: 0, heart: 0, servo: 0.4, scan: 0.1, creak: 1.2, dogAt: -1 });
/**
 * The sounds of one step of the chase, each from the thing that makes it: [{ name, pos, gain }]. What a beat lists by its clock (`sfx`,
 * `sfxCmd`, `sfxHit`: 'cao' and 'jonas' are where they are at that moment); his steps by the ground he covers; the dog's steps, its
 * servo and the sweep of its sensor from the dog as it goes (also out of the picture: it is heard through the wall from where it is);
 * his breath at his mouth (none while he holds it; quiet, and inside the cupboard, when he is in it); his heart while he hides; the
 * cupboard creaking round him; the door or the latch hammered. Pure: the game plays them (src/fuga-run.js) and the film lists them.
 */
export function soundStep(S, rec, P, t, dt, o = {}) {
  const out = [], b = BEAT[P.beat], iA = rec.steps.findIndex((s) => s.id === b.id), iC = rec.steps.findIndex((s) => s.id === b.id && s.cmd);
  if (rec.failAt != null && t >= rec.failAt) return out;
  const say = (name, at, gain = 0.85) => out.push({ name, gain, pos: Array.isArray(at) ? at : at === 'cao' ? placeOfActor(P.dog) : at === 'jonas' ? placeOfActor(P.jonas) : null });
  const k = t - (rec.starts[iA] ?? t), open = iC >= 0 && rec.starts[iC] !== undefined && t >= rec.starts[iC], hit = open && rec.hits[iC] && rec.ends[iC] <= t ? t - rec.ends[iC] : -1;
  const list = (arr, kk, tag) => (arr ?? []).forEach(([at, name, where], i) => { const key = `${b.id}:${tag}${i}`; if (kk >= at && !S.said.has(key)) { S.said.add(key); say(name, where); } });
  list(b.sfx, k, 's'); if (open) list(b.sfxCmd, t - rec.starts[iC], 'c'); if (hit >= 0) list(b.sfxHit, hit, 'h');
  const j = P.jonas, sp = j.speed ?? 0, dg = P.dog, dsp = Math.abs(dg.speed ?? 0);
  if (P.foot && sp > 0.4) { S.foot += sp * dt; if (S.foot >= (STRIDE[P.foot] ?? 1.2) / 2) { S.foot = 0; out.push({ name: P.foot, gain: P.kind === 'fp' ? 0.75 : 0.55, pos: placeOfActor(j, 0.1) }); } }
  if (dsp > 0.15 && t - S.dogAt > (dsp > 2 ? 0.36 : 0.62)) { S.dogAt = t; say((dg.h ?? 0) > 1 && b.room === 'rua' ? 'passo-grade' : 'cao-rolar', 'cao', dg.hidden ? 0.6 : 0.8); }
  if (dsp > 0.15 && b.room === 'predio') { S.servo -= dt; if (S.servo <= 0) { S.servo = 2.1; say(dg.state === 'caca' ? 'cao-caca' : 'cao-busca', 'cao', 0.45); } }
  if (P.scan) { S.scan -= dt; if (S.scan <= 0) { S.scan = 3.1; out.push({ name: 'sensor-varre', gain: 0.6, pos: [dg.pos[0] - Math.sin(dg.yaw ?? 0) * 0.5, (dg.h ?? GROUND(dg.pos)) + 0.66, dg.pos[1] - Math.cos(dg.yaw ?? 0) * 0.5] }); } }
  if (P.creak) { S.creak -= dt; if (S.creak <= 0) { S.creak = 2.3; out.push({ name: 'armario-range', gain: 0.35, pos: placeOfActor(j, 1) }); } }
  if ((P.kind === 'fp' && sp > 2) || P.pant) { S.breath -= dt; if (S.breath <= 0) { S.breath = P.quiet ? 4.4 : 0.95; out.push({ name: P.quiet ? 'respiracao-escondido' : 'respiracao', gain: P.quiet ? 0.8 : 0.5, pos: placeOfActor(j, P.quiet ? 1.1 : 1.45) }); } }
  else if (P.quiet) S.breath = Math.min(S.breath, 0.6);        // (when he lets his breath go, it is heard at once)
  if (['entra', 'dentro', 'achado', 'atras', 'grade'].includes(b.id)) { S.heart -= dt; if (S.heart <= 0) { S.heart = 0.52 + clamp(Math.hypot(dg.pos[0] - j.pos[0], dg.pos[1] - j.pos[1]) / 4) * 0.42; out.push({ name: 'coracao', gain: 0.7, pos: placeOfActor(j, 1.2) }); } }
  if (o.mash) say(b.id === 'porta' ? 'porta-bate' : b.id === 'empurra' ? 'armario-range' : 'passo-grade', 'jonas', 0.55);
  return out;
}
/** The sounds of a whole recording (a film's run), from `t0` to `t1`: [{ t, name, pos, gain }], and those of the attack when it ends in one. */
export function soundsOf(rec, t0, t1) {
  const S = soundState(), out = [];
  for (let t = t0; t < t1; t += 1 / 60) { const r = recAt(rec, t), P = chasePose(r, t); for (const e of soundStep(S, r, P, t, 1 / 60)) out.push({ t, ...e }); }
  if (rec.failAt != null) { const f = rec.failAt, P0 = chasePose(recAt(rec, f), f), d = failOf(BEAT[P0.beat], P0).delay, A = chasePose(recAt(rec, f + d + 0.01), f + d + 0.01), at = placeOfActor(A.dog, 0.6); if (f + d < t1) { if (A.fx.cupboard > 1.2) out.push({ t: f + d, name: 'armario-racha', gain: 0.9, pos: at }); out.push({ t: f + d, name: 'cao-ataque', gain: 0.95, pos: at }); } }
  return out;
}
