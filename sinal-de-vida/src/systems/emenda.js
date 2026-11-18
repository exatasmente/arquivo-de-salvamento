// The splice of the avenue as an action sequence (scene 4, the first of the "câmera e ação variadas"): what the picture does, as pure functions of
// time. The game (src/game.js) and the film mode (src/cutscenes/emenda.js) both draw from here, so what the video films is what is played.
//
//   cinePose(variant, t)          the cutscene of the dog arriving (planes cut: the dog turning the corner of the avenue, the sensor going from weak
//                                 amber to amber, Jonas looking over his shoulder): { shot, cam, dog, jonas }
//   actionPose(variant, rec, t)   the reaction after it, from what the sequence recorded (rec): { cam, dog, jonas, tail, fx }
//   STEPS[variant]                the steps of the sequence (src/systems/sequence.js)
// A variant is 'cheia' (the dog came for him: four steps) or 'curta' (the decoy took it far away: it only passes at a distance and looks: two steps).
// Poses: { pos: [x, z], yaw, y?, pitch?, speed, state, sensor?, look?, action?, at?, crouch?, walk?, gaze? }. The dog faces -Z at yaw 0, like a person.
import { mulberry32 } from '../../vendor/engine/rng.js';

export const J = [-13.3, 8.1];                  // where Jonas works during the sequence: south of the cable, on the pavement
export const CABLE = { cut: [-13.3, 7.7], right: [-13.1, 7.7], grate: [-15.9, 8.05] };
export const CINE = { cheia: 5.6, curta: 4.0 };
/** The dodge is an event: the world drops to `scale` of its speed (eased in and out), and the camera pushes in on Jonas and the dog. */
export const SLOW = { scale: 0.28, easeIn: 10, easeOut: 5, push: 0.3, fov: 9 };
/** The attack when the dodge is missed (seconds since the dog got to him): the picture fades to black, the game over, and the reload. */
export const ATTACK = { fadeAt: 2.1, overAt: 2.9, reloadAt: 5.0 };
export const SIDE_Z = 0.8;                      // how far to the side of the lane the dog stalks before it leaps

export const STEPS = {
  cheia: [
    { kind: 'hold', window: 2.2, need: 3.0, first: true, after: 0.4 },
    { kind: 'dir', window: 0.6, after: 2.8 },       // (the dodge takes up to 2.6 s after the press: the dash, the fall, getting up, back to the cable)
    { kind: 'mash', window: 3.6, need: 9, after: 0.5 },
    { kind: 'press', window: 1.2, after: 1.4 },
  ],
  curta: [
    { kind: 'hold', window: 1.5, need: 2.0, first: true, after: 0.2 },
    { kind: 'press', window: 1.2, after: 1.0 },
  ],
};
// the dodge window is in WORLD seconds: the game runs the world at SLOW.scale while it is on (about 2.1 s for the person)
// the hold of the first step must fill within its (doubled) window: need 3.0 of 4.4 s; the short one 2.0 of 3.0 s

const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => u * u * (3 - 2 * u);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Heading of a dog (or a person) that goes from a to b on the floor. */
export const heading = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
const SENSOR = { weak: '#6b4d12', amber: '#e8a42a', white: '#ffffff' };
const hexMix = (a, b, u) => { const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(u)).toString(16).padStart(2, '0')).join(''); };
/** A polyline walked at constant speed: the point at distance d. */
function along(pts, d) { let k = d; for (let i = 0; i < pts.length - 1; i++) { const L = dist(pts[i], pts[i + 1]); if (k <= L) return { pos: mix(pts[i], pts[i + 1], L ? k / L : 0), yaw: heading(pts[i], pts[i + 1]) }; k -= L; } const n = pts.length; return { pos: [...pts[n - 1]], yaw: heading(pts[n - 2], pts[n - 1]) }; }
const lenOf = (pts) => pts.slice(1).reduce((a, p, i) => a + dist(pts[i], p), 0);

// ---- the dog's way into the picture --------------------------------------------------------------------------------------------------------
// full: out of the west along the lane of the road, through the gap between the parked cars, turning onto the pavement, and stopping at the corner
const WAY_FULL = [[-31.5, 3.3], [-24.6, 3.3], [-24.6, 6.7], [-24.5, J[1]]];
const WAY_SHORT = [[10, 3.4], [4.6, 3.4]];

/** The cutscene: three planes cut one after the other. t in seconds from its start. */
export function cinePose(variant, t) {
  const full = variant !== 'curta', total = CINE[full ? 'cheia' : 'curta'];
  const tA = full ? 3.0 : 1.8, tB = full ? 4.3 : 3.0;
  const way = full ? WAY_FULL : WAY_SHORT, end = way.at(-1);
  const shot = t < tA ? 0 : t < tB ? 1 : 2;
  let dog, cam;
  const dogEnd = { pos: end, yaw: full ? heading(way.at(-2), end) : heading(way.at(-2), end), speed: 0, state: 'desconfiada' };
  if (shot === 0) {
    const u = clamp(t / tA), p = along(way, lenOf(way) * u), v = lenOf(way) / tA;
    // the sensor is still weak amber when it comes round the corner of the cars: calm
    dog = { pos: p.pos, yaw: p.yaw, speed: u < 1 ? v : 0, state: u < 0.55 ? 'calma' : 'desconfiada', sensor: hexMix(SENSOR.weak, SENSOR.weak, 0), look: u > 0.6 ? 0 : undefined };
  } else {
    // close on the sensor: weak amber to amber in a second
    const u = clamp((t - tA) / (tB - tA));
    dog = { ...dogEnd, state: 'desconfiada', sensor: hexMix(SENSOR.weak, SENSOR.amber, clamp((u - 0.15) / 0.55)), look: 0 };
  }
  if (full) {
    if (shot === 0) { const u = clamp(t / tA); cam = { eye: mix([-19.5, 2.7, -5.3], [-21.5, 2.5, -5.0], ease(u)), at: mix([-27.5, 0.5, 3.4], [-24.6, 0.5, 5.4], ease(u)), fov: 48 }; }
    else if (shot === 1) { const u = clamp((t - tA) / (tB - tA)); cam = { eye: mix([-22.4, 0.55, 9.3], [-22.9, 0.5, 8.9], ease(u)), at: mix([-24.5, 0.62, 8.1], [-24.5, 0.62, 8.1], u), fov: 38 }; }
    else { const u = clamp((t - tB) / (total - tB)); cam = { eye: mix([-15.9, 1.1, 9.0], [-15.4, 1.15, 8.9], ease(u)), at: mix([-13.3, 0.95, 8.1], [-13.3, 1.0, 8.1], u), fov: 40 }; }
  } else {
    if (shot === 0) { const u = clamp(t / tA); cam = { eye: mix([-16.6, 1.6, 5.9], [-15.9, 1.55, 5.7], ease(u)), at: mix([2, 0.9, 3.6], [4, 0.9, 3.5], u), fov: 36 }; }
    else if (shot === 1) { const u = clamp((t - tA) / (tB - tA)); cam = { eye: mix([2.9, 0.55, 4.1], [3.2, 0.5, 3.9], ease(u)), at: [4.6, 0.62, 3.4], fov: 38 }; }
    else { const u = clamp((t - tB) / (total - tB)); cam = { eye: mix([-15.9, 1.1, 9.0], [-15.4, 1.15, 8.9], ease(u)), at: mix([-13.3, 0.95, 8.1], [-13.3, 1.0, 8.1], u), fov: 40 }; }
  }
  // Jonas: kneeling at the cable, working; in the last plane he turns his head, and then his body, to look over his shoulder at the dog
  const turn = shot === 2 ? ease(clamp((t - tB) / 0.9)) : 0, looks = full ? 1.25 : -1.3;   // (full: toward the west, where the dog is; short: toward the east)
  const jonas = { pos: J, yaw: turn * looks, crouch: 1, speed: 0, action: 'manipular', gaze: { x: turn * 0.5 * Math.sign(looks), y: 0 }, look: turn * 0.8 * Math.sign(looks) };
  return { shot, cam, dog, jonas, total };
}

// ---- the reaction ---------------------------------------------------------------------------------------------------------------------------
/** Where the dog is when it begins the leap, and where it lands: from which side it comes (rec.from: -1 north of the lane = the right of the picture, 1 south). */
export function leap(from) {
  const S = [-17.2, J[1] + from * SIDE_Z], C = [J[0], J[1]], L = dist(S, C), d = [(C[0] - S[0]) / L, (C[1] - S[1]) / L];
  return { S, C, L, d, land: [C[0] + d[0] * L * 0.3, C[1] + d[1] * L * 0.3] };
}
/** How slow the world is at time t (0..1) when the run has no live value: the dodge window with its easings (the film). */
function slowKOf(rec, t) { const t1 = rec.starts?.[1]; if (t1 === undefined) return 0; const W = rec.wins?.[1] ?? 0.6, a = rec.dodge?.at ?? rec.knockedAt ?? t1 + W; return ease(clamp((t - t1) / 0.15)) * (1 - ease(clamp((t - a) / 0.3))); }
const ACTION_CAM = { eye: [-10.7, 2.1, 9.8], at: [-16.2, 0.45, 7.9], fov: 50 };
/** The dodge: left of the picture is south (+z), right is north: how far he goes and the time each part takes. */
export const DODGE = { dash: 0.3, fall: 0.7, rise: 1.2, back: 0.4, dz: 1.0 };       // (the lengths of the clips `derrubado` and `levantar` of Jonas: 0.67 and 1.2 s)

/**
 * rec: { variant, from (-1|1), starts: [t of each step's start], wins: [window of each step], hits: [bool|undefined], dodge: { side, at } | null, knockedAt, endAt, freedAt, closedAt }
 * t: seconds since the sequence began (the same clock as the starts).
 */
export function actionPose(variant, rec, t) {
  return variant === 'curta' ? shortPose(rec, t) : fullPose(rec, t);
}
function fullPose(rec, t) {
  const [t0, t1, t2, t3] = rec.starts, [w0, w1] = rec.wins, lp = leap(rec.from);
  const S0 = WAY_FULL.at(-1);
  let dog, jonas = { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular' };
  let cam = { ...ACTION_CAM, eye: [ACTION_CAM.eye[0] - 0.02 * t, ACTION_CAM.eye[1], ACTION_CAM.eye[2]] };
  const fx = { spark: false, strain: 0, flinch: 0 };
  // ---- the dog
  if (t1 === undefined || t < t1) {
    const u = clamp((t - t0) / w0);
    dog = { pos: mix(S0, lp.S, ease(u * 0.35 + u * 0.65 * u)), yaw: heading(S0, lp.S), speed: 1.5, state: 'desconfiada', sensor: hexMix(SENSOR.amber, SENSOR.white, clamp((u - 0.7) / 0.3) * 0.5) };
  } else {
    const tau = t - t1, W = rec.wins[1], coil = 0.28 * W, u = (tau - coil) / (0.72 * W);
    if (tau < coil) dog = { pos: lp.S, yaw: heading(lp.S, lp.C), speed: 0.3, state: 'caca', y: 0, pitch: 0.12 * (tau / coil), sensor: SENSOR.white };
    else if (u < 1) {
      const e = u * u * 0.4 + u * 0.6;
      dog = { pos: mix(lp.S, lp.C, e), yaw: heading(lp.S, lp.C), speed: 4.4, state: 'caca', y: 0.85 * Math.sin(Math.PI * clamp(u)), pitch: -0.35 * Math.cos(Math.PI * clamp(u) * 0.9), sensor: SENSOR.white };
    } else if (rec.knockedAt != null) {
      // on him: the take-down, then it strikes at him again and again (head down, a lunge on every beat)
      const k = Math.max(0, t - rec.knockedAt), beat = Math.max(0, Math.sin(k * 13)), over = [lp.C[0] - lp.d[0] * 0.35, lp.C[1] - lp.d[1] * 0.35];
      dog = k < 0.9 ? { pos: over, yaw: heading(lp.S, lp.C), speed: 0, state: 'caca', action: 'derrubar', at: k, y: 0, pitch: 0, sensor: SENSOR.white }
        : { pos: [over[0] + lp.d[0] * 0.2 * beat, over[1] + lp.d[1] * 0.2 * beat], yaw: heading(lp.S, lp.C), speed: 0.2, state: 'caca', y: 0.03, pitch: -0.55 * beat, sensor: SENSOR.white };
    } else {
      // past him (the dodge worked): it carries on the way it came, lands, skids and turns, lost, its sensor searching
      const k = clamp((u - 1) / 0.3), land = mix(lp.C, lp.land, ease(k)), turnT = Math.max(0, t - (t1 + coil + 1.5 * 0.72 * W));
      dog = { pos: land, yaw: heading(lp.S, lp.C) + (k >= 1 ? Math.sin(turnT * 1.1) * 1.2 + turnT * 0.4 : 0), speed: k < 1 ? 3.0 * (1 - k) : 0, state: k < 1 ? 'caca' : 'busca', y: k < 0.35 ? 0.85 * Math.sin(Math.PI * clamp(0.5 + k)) * 0.2 : 0, pitch: k < 1 ? 0.2 * k : 0 };
    }
  }
  // after the press the dog goes away, round the corner of the hoarding, to the road
  if (t3 !== undefined && rec.closedAt != null && t >= rec.closedAt) {
    const way = [lp.land, [-10.9, 7.3], [-9.4, 6.5], [-9.4, 3.6]], k = Math.max(0, t - rec.closedAt) * 1.3, p = along(way, k);
    dog = { pos: p.pos, yaw: p.yaw, speed: k < lenOf(way) ? 1.3 : 0, state: 'calma', y: 0, pitch: 0 };
  }
  // ---- Jonas
  if (rec.knockedAt != null && t >= rec.knockedAt) {
    const k = t - rec.knockedAt, tremble = Math.max(0, 1 - k / 2.4) * 0.05;       // he struggles under it, less and less
    jonas = { pos: [J[0] + Math.sin(k * 29) * tremble, J[1] + Math.cos(k * 23) * tremble], yaw: 1.3, crouch: 0, speed: 0, action: 'derrubado', at: k };
    fx.flinch = 1; fx.attack = k;
  } else if (rec.dodge && t >= rec.dodge.at) {
    const td = t - rec.dodge.at, dz = (rec.dodge.side === 'left' ? 1 : -1) * DODGE.dz, D = DODGE;
    const yawTo = dz > 0 ? Math.PI : 0;                            // facing the way he goes (south: yaw pi; north: yaw 0)
    if (td < D.dash) { const u = ease(td / D.dash); jonas = { pos: [J[0], J[1] + dz * u], yaw: yawTo, crouch: 0, speed: 3.6, run: true, action: null }; }
    else if (td < D.dash + D.fall) jonas = { pos: [J[0], J[1] + dz], yaw: yawTo, crouch: 0, speed: 0, action: 'derrubado', at: td - D.dash };
    else if (td < D.dash + D.fall + D.rise) jonas = { pos: [J[0], J[1] + dz], yaw: yawTo, crouch: 0, speed: 0, action: 'levantar', at: td - D.dash - D.fall };
    else { const u = ease(clamp((td - D.dash - D.fall - D.rise) / D.back)); jonas = { pos: [J[0], J[1] + dz * (1 - u)], yaw: 1.3 + (0 - 1.3) * u * 0, crouch: u, speed: u < 1 ? 1.2 : 0, action: null }; }
  } else if (t1 !== undefined && t >= t1) {
    // he looks over his shoulder at the dog that crouches to leap
    const tau = clamp((t - t1) / 0.5);
    jonas = { pos: J, yaw: 1.25 * ease(tau), crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0.5 * tau, y: 0 } };
  }
  // ---- the cable: stuck in the grate until he pulls it, then to the cut
  let freed = 0;
  if (t2 !== undefined && t >= t2) {
    // (the film has no live bar: its run records when the cable came free, and the strain follows from there)
    const p = rec.film ? clamp((t - t2) / Math.max(0.01, (rec.freedAt ?? t2 + 2) - t2)) : (rec.mash ?? 0);
    freed = rec.freedAt != null && t >= rec.freedAt ? 1 : p;
    jonas = { pos: J, yaw: 1.57, crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0.3, y: -0.2 }, lean: p };
    fx.strain = rec.freedAt != null && t >= rec.freedAt ? 0 : 0.4 + p * 0.6;
  }
  if (t3 !== undefined && t >= t3 && t2 !== undefined) {
    jonas = { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0, y: -0.3 } };
    freed = 1;
    if (rec.closedAt != null) { fx.spark = t - rec.closedAt < 0.4; if (t - rec.closedAt > 0.5) jonas = { pos: J, yaw: 0, crouch: clamp(1 - (t - rec.closedAt - 0.5) / 0.5), speed: 0, action: null }; }
  }
  // the camera pushes in a little on the leap and shakes when he is hit
  if (t1 !== undefined) { const k = clamp((t - t1) / 1.0); cam = { ...cam, fov: ACTION_CAM.fov - 4 * ease(k), eye: [cam.eye[0] - 0.1 * ease(k), cam.eye[1] - 0.05 * ease(k), cam.eye[2]] }; }
  // the dodge as an event: while the world is slow the camera comes in toward Jonas and the dog (`rec.slowK`, 0..1, the game's; the film has the same from the times)
  const sk = rec.slowK ?? slowKOf(rec, t);
  if (sk > 0.001) { const mid = [(J[0] + dog.pos[0]) / 2, 0.6, (J[1] + dog.pos[1]) / 2], q = SLOW.push * sk; cam = { ...cam, eye: [cam.eye[0] + (mid[0] - cam.eye[0]) * q, cam.eye[1] + (mid[1] - cam.eye[1]) * q, cam.eye[2] + (mid[2] - cam.eye[2]) * q], at: mix(cam.at, mid, 0.5 * sk), fov: cam.fov - SLOW.fov * sk }; }
  fx.slowK = sk;
  if (rec.knockedAt != null && t >= rec.knockedAt) {
    // the attack is framed close and low, from beside them, and shakes at the first blow
    const k = t - rec.knockedAt, sh = Math.exp(-k * 6) * 0.14, a = ease(clamp(k / 0.45)), C = lp.C;
    const eye = mix(cam.eye, [C[0] + 1.5 + Math.sin(k * 0.6) * 0.1, 0.62 + k * 0.03, C[1] + 1.45 - k * 0.08], a), at = mix(cam.at, [C[0] - 0.15, 0.3, C[1] - 0.05], a);
    cam = { eye: [eye[0] + Math.sin(k * 61) * sh, eye[1] + Math.cos(k * 47) * sh, eye[2]], at, fov: cam.fov + (44 - cam.fov) * a };
  }
  return { cam, dog, jonas, tail: tailOf(freed, fx.strain, t), fx };
}

function shortPose(rec, t) {
  const [t0, t1] = rec.starts, end = WAY_SHORT.at(-1);
  const u = clamp((t - t0) / (rec.wins[0] ?? 3));
  // the dog far off in the street looks around: its sensor turns toward the noise and then away
  const away = rec.closedAt != null ? Math.max(0, t - rec.closedAt) : 0;
  let dog = { pos: end, yaw: heading(WAY_SHORT[0], end) + Math.sin(t * 0.8) * 0.5, speed: 0, state: 'busca', y: 0, pitch: 0, look: Math.sin(t * 1.3) * 1.2 * (0.4 + u) };
  if (away > 0) { const p = along([end, [-3, 3.4]], away * 1.4); dog = { pos: p.pos, yaw: p.yaw, speed: 1.4, state: 'calma', y: 0, pitch: 0 }; }
  let jonas = { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular' };
  if (t1 !== undefined) jonas = { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0, y: -0.3 } };
  if (rec.closedAt != null && t - rec.closedAt > 0.5) jonas = { pos: J, yaw: 0, crouch: clamp(1 - (t - rec.closedAt - 0.5) / 0.5), speed: 0, action: null };
  const cam = { eye: [-16.2, 1.6, 9.2], at: [-9.5, 0.8, 6.8], fov: 56 };
  return { cam, dog, jonas, tail: null, fx: { spark: rec.closedAt != null && t - rec.closedAt < 0.4, strain: 0, flinch: 0 } };
}

/** The strand of cable the dog dragged into the grate: its points (x, y, z) from the cut to the loose end; `freed` 0 (in the grate) to 1 (at the cut). */
export function tailOf(freed, strain, t) {
  const a = [CABLE.right[0], 0.2, CABLE.right[1]], g = [CABLE.grate[0], 0.19, CABLE.grate[1]], c = [CABLE.cut[0] + 0.12, 0.19, CABLE.cut[1] + 0.05];
  const end = mix(g, c, ease(clamp(freed)));
  const pts = [];
  const slack = 0.18 * (1 - strain) + 0.02;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, p = mix(a, end, u);
    p[2] += Math.sin(u * Math.PI) * slack * 0.8 + Math.sin(u * 17 + t * 38) * 0.012 * strain;
    p[1] += Math.sin(u * Math.PI) * 0.03 + (freed > 0.999 ? 0 : 0);
    pts.push(p);
  }
  return pts;
}

// ---- the blood (the attack of the dog, in this game only: the person's decision of 2026-11-17) -------------------------------------------------
export const BLOOD = { n: 72, at: 0.12, seed: 4 };
/**
 * The spray, the pool and the stains at `tau` seconds after the dog got to him: pure, from a seed. `pts` are [x, y, z] of the drops in the air or landed (null: not yet),
 * `pool` the radius of the pool on the pavement under him, `stains` the blots on him: { x, z, r } (laid flat over his body, a darker red).
 */
export function bloodAt(tau, at = J, seed = BLOOD.seed) {
  const r = mulberry32((seed >>> 0) ^ 0xb100d), pts = [];
  for (let i = 0; i < BLOOD.n; i++) {
    const a = r() * Math.PI * 2, sp = 0.5 + r() * 1.7, up = 1.2 + r() * 2.6, delay = (i < 40 ? 0 : r() * 1.6), t = tau - BLOOD.at - delay;
    if (t < 0) { pts.push(null); continue; }
    const land = (up + Math.sqrt(up * up + 4 * 4.9 * 0.5)) / 9.8, tt = Math.min(t, land);
    pts.push([at[0] + Math.cos(a) * sp * tt * 0.6, Math.max(0.03, 0.5 + up * tt - 4.9 * tt * tt), at[1] + Math.sin(a) * sp * tt * 0.6]);
  }
  const grow = (d) => 1 - Math.exp(-Math.max(0, tau - d) * 1.1);
  return { pts, pool: 0.85 * grow(0.3), stains: [{ x: at[0] - 0.25, z: at[1] + 0.05, r: 0.28 * grow(0.35) }, { x: at[0] + 0.12, z: at[1] - 0.12, r: 0.2 * grow(0.5) }, { x: at[0] + 0.4, z: at[1] + 0.1, r: 0.15 * grow(0.7) }] };
}
