// The splice of the avenue as an action sequence (scene 4, the first of the "câmera e ação variadas"): what the picture does, as pure functions of
// time. The game (src/game.js) and the film mode (src/cutscenes/emenda.js) both draw from here, so what the video films is what is played.
//
//   cinePose(variant, t)          the cutscene of the dog arriving (planes cut: the dog turning the corner of the avenue, the sensor going from weak
//                                 amber to amber, Jonas looking over his shoulder): { shot, cam, dog, jonas }
//   actionPose(variant, rec, t)   the reaction after it, from what the sequence recorded (rec): { cam, dog, jonas, tail, fx }
//   STEPS[variant]                the steps of the sequence (src/systems/sequence.js)
// A variant is 'cheia' (the dog came for him: four steps) or 'curta' (the decoy took it far away: it only passes at a distance and looks: two steps).
// Poses: { pos: [x, z], yaw, y?, pitch?, speed, state, sensor?, look?, action?, at?, crouch?, walk?, gaze?, twist?, turn?, stop? }. The dog faces -Z at yaw 0, like a person.
// Jonas's feet must not slide (the person's decision of 2026-11-19): he is moved only along a way his steps can follow (a turn on the spot,
// then a walk at the pace of the gait, then the turn to what he faces next: goWay; facing off the way he goes would slide his feet), a look over the shoulder while he kneels is a turn of his upper
// body (`twist`), not of his knees on the pavement, and the dodge is a dive and a roll whose way over the floor is the clip's own (ROLL).
import { mulberry32 } from '../../vendor/engine/rng.js';
import { routeAt, routeLength } from './route.js';
import { turnTime, turnEase } from './turn.js';

export const J = [-13.3, 8.1];                  // where Jonas works during the sequence: south of the cable, on the pavement
export const CABLE = { cut: [-13.3, 7.7], right: [-13.1, 7.7], grate: [-15.9, 8.05] };
export const CINE = { cheia: 5.6, curta: 4.0, fuga: 5.6 };
/** The dodge is an event: the world drops to `scale` of its speed (eased in and out), and the camera pushes in on Jonas and the dog. */
export const SLOW = { scale: 0.28, easeIn: 10, easeOut: 5, push: 0.3, fov: 9 };
/** The attack when the dodge is missed (seconds since the dog got to him): the picture fades to black, the game over, and the reload. */
export const ATTACK = { fadeAt: 2.1, overAt: 2.9, reloadAt: 5.0, off: { fadeAt: -0.05, fade: 0.08, overAt: 0.9, reloadAt: 3.4 }, bite: 1.15 };
// (`off`: with the graphic violence off the picture is black from just before the impact, muffled; `bite`: from the miss to the leap that lands, when the dog recovers and goes for him)
export const SIDE_Z = 0.8;                      // how far to the side of the lane the dog stalks before it leaps

export const STEPS = {
  cheia: [
    { kind: 'hold', window: 2.2, need: 3.0, first: true, after: 0.4 },
    // the dodge: the world is slow while this window runs; the next step waits for the dog to slide into the skip and for Jonas to be back on his feet
    { kind: 'dir', window: 0.6, after: 3.8, landing: 0.6 },       // (after: he is on his feet again and nearly back beside the dog, at a walk: DODGE_END; the dog is stunned a while before that)
    // the dog is stunned against the skip for about 2 s: two options, left (desorientar, quiet) and right (desativar, loud); each is a command of its own, and missing it is the end
    { kind: 'pick', window: 2.0, branches: {
      quiet: [
        { kind: 'hold', window: 1.6, need: 1.0, fatal: true, after: 0.7 },      // the lure pressed against the sensor: its clicks deafen it for 8 s
        { kind: 'mash', window: 3.6, need: 9, after: 0.5 },
        { kind: 'press', window: 1.2, after: 5.2 },                              // (after: the dog recovers its hearing, sniffs and goes; Jonas hides in the skip)
      ],
      loud: [
        { kind: 'press', window: 0.9, fatal: true, after: 1.5 },                 // the bare end of the cable into the socket of its back: the battery shorts
        { kind: 'mash', window: 5.0, need: 12, after: 0.5 },                      // the piece of cable is spent: it closes shorter and slower
        { kind: 'press', window: 1.4, after: 1.8 },
      ],
    } },
  ],
  curta: [
    { kind: 'hold', window: 1.5, need: 2.0, first: true, after: 0.2 },
    { kind: 'press', window: 1.2, after: 1.0 },
  ],
  // the chase (the person's decision of 2026-11-23: the choice by the skip is out): the hold closes the splice, and the click of the connector is the
  // noise the dog leaps at; the dodge; and with the dog stunned against the skip for two seconds, one press: run. Then the chase (systems/fuga.js).
  fuga: [
    { kind: 'hold', window: 2.2, need: 3.0, first: true, after: 0.4 },
    { kind: 'dir', window: 0.6, after: 2.3, landing: 0.6 },                       // (after: he is on his feet, turned to the dog and to the avenue behind it)
    { kind: 'press', window: 2.0, fatal: true, after: 0 },                        // (after: FLEE_TIME, set below: he is off and running when the chase takes him)
  ],
};
/**
 * The run that begins the chase: from where his dive left him, round to the west of the skip (`via`, then `cut`, where the chase's first beat takes him,
 * already at his run), how fast he gets up to it, and the camera that opens on the avenue and the lit door of the building across it.
 */
export const FLEE = { via: [-15.9, 9.5], cut: [-16.6, 7.7], pace: 4.8, accel: 6, cam: { eye: [-10.5, 2.25, 10.45], at: [-13.9, 1.5, 1.0], fov: 60 } };
/** The pieces of the staging: the skip the dog slams into, where Jonas kneels to reach it, where he hides, how long it stays deaf, the clock of the slide. */
// (the dog loses its grip and slides sideways into the skip, facing east, the sensor on its east end; Jonas kneels at the head for the lure and reaches over the back for the socket)
export const DUMP = { hit: [-13.1, 6.5], yaw: -Math.PI / 2, slide: 1.0, near: { quiet: [-12.15, 6.8], loud: [-12.85, 7.25] }, nearYaw: { quiet: Math.PI / 2, loud: 0 }, hide: [-13.9, 6.45], deaf: 8, spark: 1.1 };
export const ESCUTA_DISABLE = 10;
const HIDE_WAY = [J, [-14.25, 7.6], DUMP.hide];            // (round the lamp post at his shoulder)
/** How fast Jonas goes crouched (m/s) between the places of the scene (his crouched walk is made for 1.0 m/s: tools/models/jonas_gait.py), and how his speed comes up and goes down along a way (m/s2, as the player's controller: systems/player.js). */
export const CROUCH_PACE = 1.1, WAY_ACCEL = 5, WAY_DECEL = 3.75;
/** How wide he takes a corner of a way (metres of the way each side of it: route.js): a tight one turns him over a planted foot. */
export const WAY_ROUND = 0.6;
/** How far he turns to look at the dog behind him while he kneels (radians, + to his left: the west): the whole turn, over feet that stay; the model spreads it from the hips up (TWIST in models/jonas.js). */
export const LOOK_BACK = 1.1;
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
  // Jonas: kneeling at the cable, working; in the last plane he turns his head and his shoulders (not his knees) to look over his shoulder at the dog
  const turn = shot === 2 ? ease(clamp((t - tB) / 0.9)) : 0, looks = full ? LOOK_BACK : -LOOK_BACK;   // (full: toward the west, where the dog is; short: toward the east)
  const jonas = { pos: J, yaw: 0, twist: turn * looks, crouch: 1, speed: 0, action: 'manipular', gaze: { x: turn * 0.5 * Math.sign(looks), y: 0 }, look: turn * 0.8 * Math.sign(looks) };
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
// once the dog is against the skip: the dog, the skip and Jonas coming up from his roll on the pavement to the south of it
const SLAM_CAM = { eye: [-10.9, 1.8, 10.3], at: [-13.6, 0.5, 8.4], fov: 58 };   // (east of it is the hoarding of the station: x > -10.4)
/**
 * The dodge (2026-11-19: he no longer falls flat on his back, which read as dead): from his knees he spins toward the left of the picture
 * (south, +z) and dives, lands on his hands and rolls over his shoulder, and comes up in a crouch facing away; he turns round to the dog
 * and hurries back on his feet (`pace`: his brisk walk, pressed a little) to where he can reach it (READY), crouching as he gets there (`down` s before). `roll`: when the clip `esquivar` has him crouched on his feet; `spin`: the turn
 * before the dive; `yaw`: the way he dives (south-south-west: the camera is to the east, the shop fronts 2.9 m to the south).
 */
export const DODGE = { spin: 0.16, roll: 0.75, settle: 0.12, yaw: Math.PI - 0.5, ready: [-12.6, 7.7], pace: 1.8, down: 0.3 };
/**
 * The way the dive takes him over the floor at each moment of the clip `esquivar` (seconds of the clip, metres along the dive), read on the
 * clip: what touches the floor stays where it touched (the toes of the push, the hands, the shoulder and the back, then the feet) and the
 * short flight between them goes at 1.2 m/s. After `DODGE.roll` the feet are down and he does not move.
 */
export const ROLL = [[0, 0], [0.05, 0.3], [0.1, 0.62], [0.15, 0.68], [0.2, 0.74], [0.25, 0.8], [0.3, 0.86], [0.35, 1.07], [0.4, 1.38], [0.45, 1.61], [0.5, 1.79],
  [0.55, 1.85], [0.6, 1.93], [0.65, 2.04], [0.7, 2.15], [0.75, 2.31]];
const rollAt = (tau) => { if (tau <= 0) return 0; for (let i = 1; i < ROLL.length; i++) if (tau <= ROLL[i][0]) { const [a, sa] = ROLL[i - 1], [b, sb] = ROLL[i]; return sa + (sb - sa) * (tau - a) / (b - a); } return ROLL.at(-1)[1]; };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnTo = (a, b, k) => a + wrapA(b - a) * k;
/**
 * Going along a way (a polyline: corners rounded as route.js rounds them) from time t0: a turn on the spot to face the way, the walk
 * up to `pace` (speeding up and slowing down as a body does), and the turn on the spot into `yaw1` at the end. The turns take the time
 * and follow the curve of systems/turn.js, as his turning clips were made. Pure.
 * { pos, yaw, speed, done, end (when it is all over), turn ({ a, k } while he turns on the spot), stop ({ t, T } while he slows down and settles) }:
 * `turn` and `stop` go to his model with the pose (models/jonas.js).
 */
export function goWay(pts, t, t0, yaw0, yaw1, pace = CROUCH_PACE, v0 = 0) {
  const a = pts[0], b = pts.at(-1), way = { from: a, via: pts.slice(1, -1), to: b, round: WAY_ROUND }, L = pts.length > 1 ? routeLength(way) : 0, goes = L > 1e-3;
  const head0 = goes ? routeAt(way, 0).yaw : yaw0, head1 = goes ? routeAt(way, 1).yaw : yaw0;
  const pre = wrapA(head0 - yaw0), post = wrapA(yaw1 - head1);
  // (taken up as he goes, `v0` m/s, and not far off his heading: no stop and no turn on the spot, he bends his way over the first steps)
  const rolling = goes && v0 > 0.3 && Math.abs(pre) < 1.2;
  const tIn = !rolling && Math.abs(pre) > 0.02 ? turnTime(pre) : 0, tOut = Math.abs(post) > 0.02 ? turnTime(post) : 0;
  // the walk: up to the pace (or as fast as the way lets him get), steady, down again
  const vp = goes ? Math.min(pace, Math.sqrt(2 * L * WAY_ACCEL * WAY_DECEL / (WAY_ACCEL + WAY_DECEL))) : 0;
  const vs = rolling ? Math.min(v0, vp) : 0;                 // the speed he has as the way begins
  const tA = (vp - vs) / WAY_ACCEL, tD = vp / WAY_DECEL, dA = (vp + vs) * tA / 2, dD = vp * tD / 2, tC = goes ? Math.max(0, (L - dA - dD) / vp) : 0, T = goes ? tA + tC + tD : 0;
  const k = t - t0, end = tIn + T + tOut;
  if (k <= tIn) return { pos: [...a], yaw: tIn > 0 ? yaw0 + pre * turnEase(clamp(k / tIn)) : yaw0, speed: 0, done: end <= 0, end, turn: tIn > 0 && k >= 0 ? { a: pre, k: clamp(k / tIn) } : null, stop: null };
  const w = k - tIn;
  if (w < T) {
    const d = w < tA ? vs * w + WAY_ACCEL * w * w / 2 : w < tA + tC ? dA + vp * (w - tA) : Math.min(L, L - WAY_DECEL * (T - w) * (T - w) / 2);
    const v = w < tA ? vs + WAY_ACCEL * w : w < tA + tC ? vp : WAY_DECEL * (T - w);
    const q = routeAt(way, clamp(d / L));
    if (rolling) q.yaw = q.yaw - pre * (1 - ease(clamp(w / 0.45)));
    // (the stop's own clip settles his feet after the root stands; with a turn on the spot coming, the turn's steps do that)
    return { pos: q.pos, yaw: q.yaw, speed: v, done: false, end, turn: null, stop: w >= tA + tC ? { t: w - tA - tC, T: tD, clip: tOut <= 0 } : null };
  }
  const o = w - T, y1 = goes ? head1 : yaw0;
  return { pos: [...b], yaw: tOut > 0 ? y1 + post * turnEase(clamp(o / tOut)) : yaw1, speed: 0, done: o >= tOut, end,
    turn: tOut > 0 && o < tOut ? { a: post, k: clamp(o / tOut) } : null, stop: goes && tOut <= 0 && o < 1.2 ? { t: tD + o, T: tD, clip: true } : null };
}
const BACK_VIA = [-12.4, 7.5];
const DOG_YAW = heading(DODGE.ready, DUMP.hit);       // facing the dog against the skip

/**
 * rec: { variant, from (-1|1), starts: [t of each step's start], wins: [window of each step], hits: [bool|undefined], dodge: { side, at } | null, knockedAt, endAt, freedAt, closedAt }
 * t: seconds since the sequence began (the same clock as the starts).
 */
export function actionPose(variant, rec, t) {
  return variant === 'curta' ? shortPose(rec, t) : fullPose(rec, t);
}
/**
 * What the sequence recorded (rec), all on the clock of the sequence:
 *   starts[i], wins[i]  where each step began and its window            choice { id: 'quiet' | 'loud', at }   the pick
 *   b1End               when the lure / the jab step ended (a hit)       closedAt, freedAt   the splice and the cable
 *   deafAt, jabAt       the lure took the dog's hearing / the cable shorted its battery
 *   knockedAt, knock { S, C }  the dog got to him (the dodge missed, or it recovered and bit): where from and to
 *   failAt              the pick or the first step of the branch was missed: the dog gets up and goes for him
 */
const STUN_WOBBLE = (t) => Math.sin(t * 9) * 0.05;
/**
 * After the leap (2026-11-19: it no longer glides sideways into the skip, which slid its feet over the pavement): it lands past Jonas still
 * running, its feet scrabbling as it swings round, and runs on, slowing, straight into the south face of the skip, head first; the blow
 * spins it round against it (see `stunned`). SKID.via is the corner it swings round (clear of the hydrant and the lamp post), and the way
 * slows from the leap's speed to SKID.end of it.
 */
export const SKID = { via: [-12.75, 7.65], end: 0.4 };
const dumpAt = (t, lp) => {
  const k = clamp(t / DUMP.slide), way = { from: lp.C, via: [lp.land, SKID.via], to: DUMP.hit }, L = routeLength(way);
  const f = (u) => (u - (1 - SKID.end) * u * u / 2) / (1 - (1 - SKID.end) / 2);          // the share of the way covered: a steady slowing down
  const q = routeAt(way, f(k)), v = L / DUMP.slide * (1 - (1 - SKID.end) * k) / (1 - (1 - SKID.end) / 2);
  return { pos: q.pos, yaw: q.yaw, speed: k < 1 ? v : 0, y: k < 0.12 ? 0.12 * Math.sin(Math.PI * k / 0.12) : 0, pitch: k < 0.12 ? 0.06 : 0.02, k };
};
/** Which way the dog faces as it hits the skip (the last stretch of the skid). */
const SKID_YAW = heading(SKID.via, DUMP.hit);
/** Where the dive ends (he is up on his feet, crouched), and the way he dives (yaw), for a side: 'left' (south, +z) or 'right' (north). */
export function rollEnd(side) {
  const yaw = side === 'left' ? DODGE.yaw : DODGE.yaw - Math.PI, s = ROLL.at(-1)[1];
  return { pos: [J[0] - Math.sin(yaw) * s, J[1] - Math.cos(yaw) * s], yaw };
}
/** Jonas dodging, `td` seconds after the press: the spin and the dive, the roll, up in a crouch; then the turn to the dog and the way to READY. `twist0`: his look over the shoulder when he pressed. */
function dodgeJ(rec, td, twist0 = LOOK_BACK) {
  const D = DODGE, end = rollEnd(rec.dodge.side), yaw = end.yaw, dir = [-Math.sin(yaw), -Math.cos(yaw)];
  if (td < D.roll) {
    // he spins on his knees toward the dive (the upper body, already turned to the dog, leads), and the clip's own way carries him
    const k = ease(clamp(td / D.spin)), s = rollAt(td), y = turnTo(0, yaw, k);
    return { pos: [J[0] + dir[0] * s, J[1] + dir[1] * s], yaw: y, crouch: 1, speed: 0, action: 'esquivar', at: td, twist: twist0 * (1 - k) };
  }
  if (rec.variant === 'fuga') return fleeJ(rec, td, end);
  // up, facing away: he gets to his feet as he turns round, hurries back (upright, at a brisk walk) to READY and crouches there, facing the dog
  const t0 = D.roll + D.settle, g = goWay([end.pos, D.ready], td, t0, yaw, DOG_YAW, D.pace);
  return { pos: g.pos, yaw: g.yaw, crouch: Math.max(1 - ease(clamp((td - t0) / D.down)), ease(clamp((td - (t0 + g.end - D.down)) / D.down))), speed: g.speed, action: null, gaze: { x: 0, y: 0.1 }, turn: g.turn, stop: g.stop };
}
/** After the dive, the chase's way: up on his feet as he turns to the dog against the skip; and at the press (rec.runAt) he is off, round the skip, up to his run. */
function fleeJ(rec, td, end) {
  const D = DODGE, t0 = D.roll + D.settle, toDog = heading(end.pos, DUMP.hit), turn = goWay([end.pos], td, t0, end.yaw, toDog);
  const run = rec.runAt != null ? rec.dodge.at + td - rec.runAt : -1;
  if (run < 0) return { pos: end.pos, yaw: turn.yaw, crouch: 1 - ease(clamp((td - t0) / 0.5)), speed: 0, action: null, gaze: { x: 0, y: 0.1 }, turn: turn.turn };
  const way = { from: end.pos, via: [FLEE.via], to: FLEE.cut, round: 0.8 }, L = routeLength(way), tA = FLEE.pace / FLEE.accel, dA = FLEE.pace * tA / 2;
  const d = run < tA ? FLEE.accel * run * run / 2 : dA + FLEE.pace * (run - tA), q = routeAt(way, clamp(d / L));
  const y0 = goWay([end.pos], rec.runAt - rec.dodge.at, t0, end.yaw, toDog).yaw;
  return { pos: q.pos, yaw: turnTo(y0, q.yaw, ease(clamp(run / 0.4))), crouch: 0, speed: Math.min(FLEE.pace, FLEE.accel * run), run: true, action: null };
}
/** How long the run to FLEE.cut takes from the press. */
export const FLEE_TIME = (() => { const L = routeLength({ from: rollEnd('left').pos, via: [FLEE.via], to: FLEE.cut, round: 0.8 }), tA = FLEE.pace / FLEE.accel; return tA + (L - FLEE.pace * tA / 2) / FLEE.pace; })();
STEPS.fuga[2].after = FLEE_TIME;
/** When the dodge has him at READY facing the dog (seconds after the press). */
export const DODGE_END = DODGE.roll + DODGE.settle + goWay([rollEnd('left').pos, DODGE.ready], 0, 0, rollEnd('left').yaw, DOG_YAW, DODGE.pace).end;
/** Jonas before any branch: kneeling at the cut, looking back at the dog over his shoulder, the dodge. Pure, from the recording. */
function jonasBefore(rec, t) {
  const t1 = rec.starts?.[1];
  if (rec.dodge && t >= rec.dodge.at) return dodgeJ(rec, t - rec.dodge.at, t1 === undefined ? 0 : LOOK_BACK * ease(clamp((rec.dodge.at - t1) / 0.5)));
  if (t1 !== undefined && t >= t1) { const tau = clamp((t - t1) / 0.5); return { pos: J, yaw: 0, twist: LOOK_BACK * ease(tau), crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0.5 * tau, y: 0 } }; }
  return { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular' };
}
function fullPose(rec, t) {
  const [t0, t1, t2, t3, t4, t5] = rec.starts, [w0, w1] = rec.wins, lp = leap(rec.from);
  const S0 = WAY_FULL.at(-1), ch = rec.choice?.id ?? null;
  const knock = rec.knock ?? { S: lp.S, C: lp.C };
  const kd = (() => { const L = dist(knock.S, knock.C) || 1; return [(knock.C[0] - knock.S[0]) / L, (knock.C[1] - knock.S[1]) / L]; })();
  let dog, jonas = { pos: J, yaw: 0, crouch: 1, speed: 0, action: 'manipular' };
  let cam = { ...ACTION_CAM, eye: [ACTION_CAM.eye[0] - 0.02 * t, ACTION_CAM.eye[1], ACTION_CAM.eye[2]] };
  const fx = { spark: false, strain: 0, flinch: 0, dogSpark: 0, clicks: false, stun: 0 };
  const tF = t1 === undefined ? Infinity : t1 + w1;            // the leap ends
  const slamAt = tF + DUMP.slide;
  const bit = rec.failAt != null && rec.knockedAt != null;     // it recovered and went for him
  // ---- the dog
  if (t1 === undefined || t < t1) {
    const u = clamp((t - t0) / w0);
    dog = { pos: mix(S0, lp.S, ease(u * 0.35 + u * 0.65 * u)), yaw: heading(S0, lp.S), speed: 1.5, state: 'desconfiada', sensor: hexMix(SENSOR.amber, SENSOR.white, clamp((u - 0.7) / 0.3) * 0.5) };
  } else {
    const tau = t - t1, W = w1, coil = 0.28 * W, u = (tau - coil) / (0.72 * W);
    if (tau < coil) dog = { pos: lp.S, yaw: heading(lp.S, lp.C), speed: 0.3, state: 'caca', y: 0, pitch: 0.12 * (tau / coil), sensor: SENSOR.white };
    else if (u < 1) {
      const e = u * u * 0.4 + u * 0.6;
      dog = { pos: mix(lp.S, lp.C, e), yaw: heading(lp.S, lp.C), speed: 4.4, state: 'caca', y: 0.85 * Math.sin(Math.PI * clamp(u)), pitch: -0.35 * Math.cos(Math.PI * clamp(u) * 0.9), sensor: SENSOR.white };
    } else if (rec.knockedAt != null && !bit) {
      dog = attackDog(rec, t, knock, kd);
    } else if (t < slamAt) {
      const g = dumpAt(t - tF, lp);
      dog = { pos: g.pos, yaw: g.yaw, speed: g.speed, state: 'caca', y: g.y, pitch: g.pitch, sensor: SENSOR.white };
    } else {
      // stunned against the skip, then what Jonas did
      const ts = t - slamAt, flick = (Math.floor(ts * 2.4) % 2) ? SENSOR.weak : SENSOR.amber;
      const spin = ease(clamp(ts / 0.45));                   // the blow turns it along the skip, its sensor to the east (a few quick steps)
      const stunned = { pos: DUMP.hit, yaw: turnTo(SKID_YAW, DUMP.yaw, spin) + STUN_WOBBLE(ts) * 3 * Math.exp(-ts * 0.5) * spin, speed: 0, state: 'busca', y: 0, pitch: 0.18 + Math.sin(ts * 11) * 0.03 * Math.exp(-ts), sensor: flick, look: Math.sin(ts * 3) * 0.5 };
      dog = stunned; fx.stun = 1;
      if (bit) {
        // the pick or the first step went wrong: it gets its head up (white sensor), rears and leaps at him
        const k = t - rec.failAt;
        fx.stun = 0;
        if (k < 0.7) dog = { ...stunned, state: 'caca', sensor: hexMix(SENSOR.amber, SENSOR.white, clamp(k / 0.5)), pitch: 0.18 - 0.4 * ease(clamp(k / 0.7)), look: 0 };
        else if (t >= rec.knockedAt) dog = attackDog(rec, t, knock, kd);
        else { const fl = clamp((k - 0.7) / Math.max(0.1, rec.knockedAt - rec.failAt - 0.7)); dog = { pos: mix(DUMP.hit, knock.C, ease(fl) * 0.85), yaw: heading(DUMP.hit, knock.C), speed: 4.4, state: 'caca', y: 0.5 * Math.sin(Math.PI * fl), pitch: -0.3 * Math.cos(Math.PI * fl * 0.9), sensor: SENSOR.white }; }
      } else if (ch === 'quiet' && t3 !== undefined && t >= t3) {
        const dA = rec.deafAt;
        if (dA == null || t < dA) { dog = { ...stunned, pitch: 0.18 + Math.sin(t * 40) * 0.025, sensor: flick }; fx.clicks = true; }       // the lure's clicks at its sensor
        else {
          // deaf: it turns on the spot and stumbles about, looking; then it hears again, sniffs, and goes along its route without finding him
          const k = t - dA, c2 = [DUMP.hit[0], DUMP.hit[1] + 0.1];
          fx.stun = 0;
          const spin = (kk) => ({ pos: [c2[0] + Math.sin(kk * 1.1) * 0.25, c2[1] + (1 - Math.cos(kk * 1.1)) * 0.12], yaw: kk * 1.7 + Math.sin(kk * 3) * 0.7 });
          if (k < DUMP.deaf) {
            const sp = spin(k);
            dog = { pos: sp.pos, yaw: sp.yaw, speed: 0.5, state: 'busca', y: 0, pitch: 0.05, sensor: (Math.floor(k * 2) % 2) ? SENSOR.weak : SENSOR.amber, look: Math.sin(k * 2.2) * 1.2 };
          } else {
            const q = k - DUMP.deaf, sp = spin(DUMP.deaf), way = [sp.pos, [-10.9, 7.3], [-9.4, 6.5], [-9.4, 3.6]], sn = Math.max(0, q - 1.3), pp = along(way, sn * 1.3);
            dog = q < 1.3 ? { pos: sp.pos, yaw: sp.yaw + Math.sin(q * 4) * 0.4, speed: 0, state: 'desconfiada', y: 0, pitch: 0, sensor: SENSOR.amber, look: Math.sin(q * 5) * 0.8 }
              : { pos: pp.pos, yaw: pp.yaw, speed: sn * 1.3 < lenOf(way) ? 1.3 : 0, state: 'calma', y: 0, pitch: 0, sensor: SENSOR.weak };
          }
        }
      } else if (ch === 'loud' && rec.jabAt != null && t >= rec.jabAt) {
        const k = t - rec.jabAt;
        fx.stun = 0;
        if (k < DUMP.spark) { dog = { ...stunned, pos: [DUMP.hit[0] + Math.sin(k * 70) * 0.03, DUMP.hit[1]], pitch: 0.2 + Math.sin(k * 50) * 0.08, sensor: (Math.floor(k * 3) % 2) ? SENSOR.white : SENSOR.weak, look: 0 }; fx.dogSpark = 1 - k / DUMP.spark * 0.4; }
        else { dog = { pos: DUMP.hit, yaw: DUMP.yaw, speed: 0, state: 'desligado', y: 0, pitch: 0, sensor: '#16161a', at: k - DUMP.spark }; if (k - DUMP.spark < 0.35) fx.dogSpark = 0.35; }
      } else if (ch === 'loud' && t3 !== undefined && t >= t3) { dog = { ...stunned, pitch: 0.2 }; }
    }
  }
  // ---- Jonas
  // (where the look over the shoulder had got to when he pressed; and where he is when a branch begins)
  const lookAt = (tt) => (t1 === undefined || tt < t1 ? 0 : LOOK_BACK * ease(clamp((tt - t1) / 0.5)));
  const dodged = (tt) => dodgeJ(rec, tt - rec.dodge.at, lookAt(rec.dodge.at));
  if (rec.knockedAt != null && t >= rec.knockedAt) {
    // the dog on him: he turns to it as it hits (the shoulders first) and goes down; then his shoulders shake under it (the body stays where
    // it fell: shaking the whole of him would slide it over the pavement)
    const k = t - rec.knockedAt, tremble = k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 2.4) : 0, P = bit ? (rec.knock?.C ?? J) : J;
    const tk = ease(clamp((k - 0.06) / 0.16)), y0 = bit ? jonasBefore(rec, rec.failAt ?? rec.knockedAt).yaw : 0;     // (the turn is once his feet have left the pavement)
    jonas = { pos: P, yaw: turnTo(y0, 1.3, tk), twist: lookAt(rec.knockedAt) * (1 - tk) + Math.sin(k * 29) * 0.12 * tremble, crouch: 0, speed: 0, action: 'derrubado', at: k };
    fx.flinch = 1; fx.attack = k;
  } else jonas = jonasBefore(rec, t);
  // the branch: he goes to the dog (the lure at its sensor, or the cable at the socket of its back), does it, and goes back to the cable
  const goes = t3 !== undefined && t >= t3 && (ch === 'quiet' || ch === 'loud') && !(rec.knockedAt != null && t >= rec.knockedAt);
  let back = null;
  if (goes) {
    const endB = rec.b1End ?? Infinity, nearP = DUMP.near[ch], nearY = DUMP.nearYaw[ch];
    const from = jonasBefore(rec, t3);
    if (t < endB) {
      const g = goWay([from.pos, nearP], t, t3, from.yaw, nearY, CROUCH_PACE, from.speed ?? 0);
      jonas = { pos: g.pos, yaw: g.yaw, crouch: 1, speed: g.speed, action: g.done ? 'manipular' : null, gaze: { x: 0, y: 0.3 }, turn: g.turn, stop: g.stop };
    } else {
      // (from where he had got to: the command may come before he is all the way there)
      const there = goWay([from.pos, nearP], endB, t3, from.yaw, nearY, CROUCH_PACE, from.speed ?? 0);
      // (back round the dog's side, clear of it as it turns about deaf and of the hydrant: at his walking pace he is beside it for longer)
      back = goWay(ch === 'quiet' ? [there.pos, BACK_VIA, J] : [there.pos, J], t, endB, there.yaw, Math.PI / 2);
      if (!back.done || t4 === undefined || t < t4) jonas = { pos: back.pos, yaw: back.yaw, crouch: 1, speed: back.speed, action: back.done ? 'manipular' : null, turn: back.turn, stop: back.stop };
    }
  }
  // ---- the cable: stuck in the grate until he pulls it, then to the cut
  let freed = 0;
  if (t4 !== undefined && t >= t4 && !(back && !back.done)) {
    // (the film has no live bar: its run records when the cable came free, and the strain follows from there)
    const p = rec.film ? clamp((t - t4) / Math.max(0.01, (rec.freedAt ?? t4 + 2) - t4)) : (rec.mash ?? 0);
    freed = rec.freedAt != null && t >= rec.freedAt ? 1 : p;
    jonas = { pos: J, yaw: Math.PI / 2, crouch: 1, speed: 0, action: 'manipular', gaze: { x: 0.3, y: -0.2 }, lean: p };
    fx.strain = rec.freedAt != null && t >= rec.freedAt ? 0 : 0.4 + p * 0.6;
  }
  if (t5 !== undefined && t >= t5 && t4 !== undefined) {
    // he turns on his knees' spot back to the cut (crouched, a step at a time), kneels and closes it
    const g = goWay([J], t, t5, Math.PI / 2, 0);
    jonas = { pos: J, yaw: g.yaw, crouch: 1, speed: 0, action: g.done ? 'manipular' : null, gaze: { x: 0, y: -0.3 }, turn: g.turn };
    freed = 1;
    if (rec.closedAt != null) {
      const k = t - rec.closedAt;
      fx.spark = k < 0.4;
      if (ch === 'quiet') {
        // he gets up crouched and goes to the skip, round the lamp post, and climbs in (and is out of sight)
        if (k > 0.5) { const h = goWay(HIDE_WAY, t, rec.closedAt + 0.5, 0, heading(HIDE_WAY.at(-2), DUMP.hide)); jonas = { pos: h.pos, yaw: h.yaw, crouch: 1, speed: h.speed, action: null, hidden: h.done, turn: h.turn, stop: h.stop }; }
      } else if (k > 0.5) jonas = { pos: J, yaw: 0, crouch: clamp(1 - (k - 0.5) / 0.5), speed: 0, action: null };
    }
  }
  // the camera pushes in a little on the leap, and frames the dog and Jonas once it is against the skip
  if (t1 !== undefined) { const k = clamp((t - t1) / 1.0); cam = { ...cam, fov: ACTION_CAM.fov - 4 * ease(k), eye: [cam.eye[0] - 0.1 * ease(k), cam.eye[1] - 0.05 * ease(k), cam.eye[2]] }; }
  if (t > slamAt && rec.knockedAt == null) { const k = ease(clamp((t - slamAt) / 0.6)), to = rec.variant === 'fuga' ? FLEE.cam : SLAM_CAM; cam = { ...cam, eye: mix(cam.eye, to.eye, k), at: mix(cam.at, to.at, k), fov: cam.fov + (to.fov - cam.fov) * k }; }
  // the dodge as an event: while the world is slow the camera comes in toward Jonas and the dog (`rec.slowK`, 0..1, the game's; the film has the same from the times)
  const sk = rec.slowK ?? slowKOf(rec, t);
  if (sk > 0.001) { const mid = [(jonas.pos[0] + dog.pos[0]) / 2, 0.6, (jonas.pos[1] + dog.pos[1]) / 2], q = SLOW.push * sk; cam = { ...cam, eye: [cam.eye[0] + (mid[0] - cam.eye[0]) * q, cam.eye[1] + (mid[1] - cam.eye[1]) * q, cam.eye[2] + (mid[2] - cam.eye[2]) * q], at: mix(cam.at, mid, 0.5 * sk), fov: cam.fov - SLOW.fov * sk }; }
  fx.slowK = sk;
  if (rec.knockedAt != null && t >= rec.knockedAt) {
    // the attack is framed close and low, from beside them, and shakes at the first blow
    const k = t - rec.knockedAt, sh = Math.exp(-k * 6) * 0.14, a = ease(clamp(k / 0.45)), C = knock.C;
    const eye = mix(cam.eye, [C[0] + 1.5 + Math.sin(k * 0.6) * 0.1, 0.62 + k * 0.03, C[1] + 1.45 - k * 0.08], a), at = mix(cam.at, [C[0] - 0.15, 0.3, C[1] - 0.05], a);
    cam = { eye: [eye[0] + Math.sin(k * 61) * sh, eye[1] + Math.cos(k * 47) * sh, eye[2]], at, fov: cam.fov + (44 - cam.fov) * a };
  }
  return { cam, dog, jonas, tail: rec.variant === 'fuga' ? null : tailOf(freed, fx.strain, t, rec.spent ? 0.7 : 1), fx };
}
/** The dog on him: the take-down, and then it strikes again and again (head down, a lunge on every beat). */
function attackDog(rec, t, knock, kd) {
  const k = Math.max(0, t - rec.knockedAt), beat = Math.max(0, Math.sin(k * 13)), over = [knock.C[0] - kd[0] * 0.35, knock.C[1] - kd[1] * 0.35], yaw = heading(knock.S, knock.C);
  return k < 0.9 ? { pos: over, yaw, speed: 0, state: 'caca', action: 'derrubar', at: k, y: 0, pitch: 0, sensor: SENSOR.white }
    : { pos: [over[0] + kd[0] * 0.2 * beat, over[1] + kd[1] * 0.2 * beat], yaw, speed: 0.2, state: 'caca', y: 0.03, pitch: -0.55 * beat, sensor: SENSOR.white };
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
export function tailOf(freed, strain, t, len = 1) {
  const a = [CABLE.right[0], 0.2, CABLE.right[1]], g = [CABLE.grate[0], 0.19, CABLE.grate[1]], c = [CABLE.cut[0] + 0.12, 0.19, CABLE.cut[1] + 0.05];
  const end = mix(mix(c, g, len), c, ease(clamp(freed)));      // (len < 1: a piece of it is spent, the loose end is nearer the cut)
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
export const BLOOD = { n: 150, at: 0.12, seed: 4 };
/**
 * The spray, the pool and the stains at `tau` seconds after the dog got to him: pure, from a seed. `pts` are [x, y, z] of the drops in the air or landed (null: not yet),
 * `pool` the radius of the pool on the pavement under him, `stains` the blots on him: { x, z, r } (laid flat over his body, a darker red).
 */
export function bloodAt(tau, at = J, seed = BLOOD.seed) {
  const r = mulberry32((seed >>> 0) ^ 0xb100d), pts = [];
  for (let i = 0; i < BLOOD.n; i++) {
    const a = r() * Math.PI * 2, sp = 0.5 + r() * 1.7, up = 1.2 + r() * 2.6, delay = (i < 80 ? 0 : r() * 1.6), t = tau - BLOOD.at - delay;
    if (t < 0) { pts.push(null); continue; }
    const land = (up + Math.sqrt(up * up + 4 * 4.9 * 0.5)) / 9.8, tt = Math.min(t, land);
    pts.push([at[0] + Math.cos(a) * sp * tt * 0.6, Math.max(0.03, 0.5 + up * tt - 4.9 * tt * tt), at[1] + Math.sin(a) * sp * tt * 0.6]);
  }
  const grow = (d) => 1 - Math.exp(-Math.max(0, tau - d) * 1.1);
  return { pts, pool: 1.05 * grow(0.3), stains: [{ x: at[0] - 0.25, z: at[1] + 0.05, r: 0.36 * grow(0.35) }, { x: at[0] + 0.12, z: at[1] - 0.12, r: 0.27 * grow(0.5) }, { x: at[0] + 0.4, z: at[1] + 0.1, r: 0.2 * grow(0.7) }] };
}
