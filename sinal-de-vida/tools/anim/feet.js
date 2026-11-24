// The feet on the floor (the person's decision of 2026-11-19: "o personagem está deslizando"), measured in the browser for
// test/pes.test.mjs: Jonas and the dog are driven the way the game drives them (src/game.js: the root put where the player or the
// sequence is, then update with the time stepped), and the world position of each foot is read every step. A foot of Jonas is down
// while it is on the floor and not swinging forward (carried()); a foot of the dog while it is near its lowest (stances()). Its drift is
// how far it goes over the floor from where it came down. The number is a check, not the goal (the person turned down a repair that
// brought it under 3 cm by bending the legs): held() says how far the legs were bent away from the clips, which must stay small.
import { buildPerson } from '../../src/models/person.js';
import { buildDog } from '../../src/models/dog.js';
import { createPlayer } from '../../src/systems/player.js';
import { actionPose, cinePose } from '../../src/systems/emenda.js';
import { routeAt } from '../../src/systems/route.js';
import { turnTime, turnEase } from '../../src/systems/turn.js';
import { filmRec, recAt, chasePose } from '../../src/systems/fuga.js';

const STEP = 1 / 60;
const JONAS_FEET = ['ball_l', 'ball_r', 'pelvis'], DOG_FEET = ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR'];

function feetOf(model, names) {
  const bones = names.map((n) => { let b = null; model.root.traverse((o) => { if (!b && o.isBone && o.name === n && o.parent) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) b = o; } }); return b; });
  return () => { model.root.updateMatrixWorld(true); return bones.map((b) => b.getWorldPosition(new model.T.Vector3()).toArray()); };
}
/**
 * Which way his hips, his chest, his head and his feet face (radians about the vertical, as a root's yaw: 0 faces -z), read on the bones:
 * the hips across the two thighs, the chest across the two shoulders, the head across the eyes, a foot from its ankle to its ball.
 */
function yawsOf(model) {
  const find = (n) => { let b = null; model.root.traverse((o) => { if (!b && o.isBone && o.name === n && o.parent) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) b = o; } }); return b; };
  const B = Object.fromEntries(['thigh_l', 'thigh_r', 'upperarm_l', 'upperarm_r', 'eye_l', 'eye_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].map((n) => [n, find(n)]));
  const P = (n) => B[n].getWorldPosition(new model.T.Vector3());
  const across = (a, b) => { const l = P(a), r = P(b); return Math.atan2(-(r.z - l.z), r.x - l.x); }, along = (a, b) => { const p = P(a), q = P(b); return Math.atan2(-(q.x - p.x), -(q.z - p.z)); };
  return () => { model.root.updateMatrixWorld(true); return { hips: across('thigh_l', 'thigh_r'), chest: across('upperarm_l', 'upperarm_r'), head: across('eye_l', 'eye_r'), feet: [along('foot_l', 'ball_l'), along('foot_r', 'ball_r')], low: [P('ball_l').y, P('ball_r').y] }; };
}
const turnOf = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/**
 * The trunk over the hips over the feet, at each sample that has `yaws` (radians): how far the chest is turned from the hips, the head from
 * the hips, the hips from the root, and the hips from a foot that is flat on the floor (the lower one, within `h` of it). The most of each
 * between `from` and `to`. A trunk left facing backwards over the legs (the person's note of 2026-11-19) shows as chest far from hips.
 */
export function trunk(samples, { from = -Infinity, to = Infinity, h = 0.035, ground = 0 } = {}) {
  const out = { chest: 0, head: 0, hips: 0, foot: 0 };
  for (const s of samples) {
    if (!s.yaws || s.t < from || s.t > to) continue;
    const y = s.yaws, f = y.low[0] <= y.low[1] ? 0 : 1;
    out.chest = Math.max(out.chest, Math.abs(turnOf(y.chest, y.hips))); out.head = Math.max(out.head, Math.abs(turnOf(y.head, y.hips)));
    if (s.yaw !== undefined) out.hips = Math.max(out.hips, Math.abs(turnOf(y.hips, s.yaw)));
    if (y.low[f] - ground < h) out.foot = Math.max(out.foot, Math.abs(turnOf(y.hips, y.feet[f])));
  }
  return out;
}
/**
 * The same pose asked twice must be the same pose (a turn laid on the bones after the clips once added up frame after frame): the trunk's
 * yaws after one call, after twenty, and after the twist is asked back to nothing against a pose that never had it. Radians, the most of them.
 */
export function twice(r) {
  const j = jonas(r), probe = yawsOf(j), out = {};
  const d = (a, b) => Math.max(...['hips', 'chest', 'head'].map((k) => Math.abs(turnOf(a[k], b[k]))));
  for (const [k, a] of Object.entries({ kneel: { action: 'manipular', at: 2, crouch: 1, twist: 1.1, t: 1 }, stand: { twist: 0.8, t: 1 }, dodge: { action: 'esquivar', at: 0.1, twist: 0.9, crouch: 1, t: 1 } })) {
    j.setPose({ ...a, twist: 0 }); const none = probe();
    j.setPose(a); const once = probe(); for (let i = 0; i < 20; i++) j.setPose(a); const many = probe();
    j.setPose({ ...a, twist: 0 }); const back = probe();
    out[k] = { again: d(many, once), back: d(back, none), turned: Math.abs(turnOf(once.chest, none.chest)), hips: Math.abs(turnOf(once.hips, none.hips)), head: Math.abs(turnOf(once.head, none.head)) };
  }
  j.root.removeFromParent();
  return out;
}
/** A sample of Jonas: his two feet, and where his body is over the floor (the pelvis). */
const jsample = (t, p, more = {}) => ({ t, feet: p.slice(0, 2), body: [p[2][0], p[2][2]], ...more });

/**
 * The drift of each stance of Jonas (metres): a foot is down while its ball is within `h` of the floor (`ground`) and it is not swinging
 * forward (going the body's way at more than `swing` of the body's speed: the crouched walk skims the floor with the foot it brings
 * forward). The moment it lands and the moment it leaves are not stance. `min`: the samples a stance has at least (3; a running step on a
 * stair is on the floor for less). [{ foot, t0, t1, drift }]
 */
export function carried(samples, { from = 0, to = Infinity, h = 0.03, ground = 0, swing = 0.5, min = 3 } = {}) {
  const out = [];
  for (let f = 0; f < 2; f++) {
    let cur = null, was = false;
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i], q = samples[i - 1], p = s.feet[f], o = q.feet[f], dt = s.t - q.t;
      const bx = s.body[0] - q.body[0], bz = s.body[1] - q.body[1], bd = Math.hypot(bx, bz), body = bd / dt;
      const fwd = bd > 1e-6 ? ((p[0] - o[0]) * bx + (p[2] - o[2]) * bz) / (bd * dt) : 0;
      const low = !s.off && s.t >= from && s.t <= to && p[1] - (s.g?.[f] ?? ground) < h && !(fwd > Math.max(0.25, swing * body));       // (`g`: the ground under each foot, where it is not one floor)
      const down = low && was;
      was = low;
      if (down) { if (!cur) cur = { foot: f, t0: q.t, p0: o, drift: 0, n: 0, g: s.g?.[f] }; cur.drift = Math.max(cur.drift, Math.hypot(p[0] - cur.p0[0], p[2] - cur.p0[2])); cur.n++; cur.t1 = s.t; }
      else if (cur) { if (cur.n >= min) out.push(cur); cur = null; }
    }
    if (cur && cur.n >= min) out.push(cur);
  }
  return out;
}
/** How far the feet were held away from where the clips put them (metres): { mean, max, steps } over a model's life (plant.js). */
export function held(model) { const f = model.feetStats?.() ?? []; return { mean: Math.max(0, ...f.map((x) => x.off)), max: Math.max(0, ...f.map((x) => x.offMax)), steps: f.reduce((a, x) => a + x.steps, 0) }; }

/** The drift of each stance (metres): [{ foot, t0, t1, drift }]. `from`/`to` limit the time; `tol` is how near its lowest a foot counts as down. */
export function stances(samples, { from = 0, to = Infinity, tol = 0.025, floor = -Infinity, lowest = true } = {}) {
  const n = samples[0].feet.length, out = [];
  const win = samples.filter((s) => s.t >= from && s.t <= to);
  for (let f = 0; f < n; f++) {
    const low = Math.max(floor, Math.min(...win.map((s) => s.feet[f][1])));
    let cur = null;
    for (const s of win) {
      const p = s.feet[f], others = s.feet.filter((_, i) => i !== f).map((q) => q[1]);
      const down = !s.off && p[1] < low + tol && (!lowest || p[1] <= Math.min(...others) + 0.01);
      if (down) {
        if (!cur) cur = { foot: f, t0: s.t, p0: p, drift: 0, n: 0 };
        cur.drift = Math.max(cur.drift, Math.hypot(p[0] - cur.p0[0], p[2] - cur.p0[2])); cur.n++; cur.t1 = s.t;
      } else if (cur) { if (cur.n >= 3) out.push(cur); cur = null; }
    }
    if (cur && cur.n >= 3) out.push(cur);
  }
  return out;
}
export const worst = (st) => (st.length ? Math.max(...st.map((s) => s.drift)) : 0);

function jonas(r) { const j = buildPerson(r, { role: 'jonas', seed: 1 }); j.T = r.THREE; r.scene.add(j.root); return j; }
function dog(r) { const d = buildDog(r, { seed: 3 }); d.T = r.THREE; d.root.rotation.order = 'YXZ'; r.scene.add(d.root); return d; }

/** The player's controller and body: `input(t)` -> { mx, mz, run, crouch, k (how far the stick is pushed, 0..1) }. */
export function player(r, input, T) {
  const j = jonas(r), p = createPlayer(), probe = feetOf(j, JONAS_FEET), yaws = yawsOf(j), samples = [];
  p.place([0, 0], 0);
  for (let t = 0; t < T; t += STEP) {
    const it = input(t), k = it.k ?? 1;
    p.crouch = Boolean(it.crouch);
    p.step(STEP, { mx: (it.mx ?? 0) * k, mz: (it.mz ?? 0) * k }, 0, { colliders: [] }, { run: Boolean(it.run) });
    j.root.position.set(p.pos[0], 0, p.pos[1]); j.root.rotation.y = p.body;
    j.update(STEP, { speed: p.speed, crouch: p.crouch, run: p.speed > 3.5, turn: p.gait.turn, stop: p.gait.stop });
    samples.push(jsample(t, probe(), { speed: p.speed, yaw: p.body, turning: Boolean(p.turn), yaws: yaws(), ik: Math.max(0, ...(j.feetStats?.() ?? []).map((l) => l.w)), shares: j.shares?.() }));
  }
  j.root.removeFromParent();
  return { samples, gait: j.gait?.(), held: held(j), log: [...(j.moves?.log ?? [])] };
}

/** Jonas in scene 4 as src/game.js poses him from the sequence (`rec`), from t0 to t1. */
export function scene4(r, rec, t0, t1) {
  const j = jonas(r), probe = feetOf(j, JONAS_FEET), yaws = yawsOf(j), samples = [];
  for (let t = t0; t < t1; t += STEP) {
    const sj = t < 0 ? cinePose('cheia', 5.6 + t).jonas : actionPose('cheia', rec, t).jonas;
    j.root.position.set(sj.pos[0], 0, sj.pos[1]); j.root.rotation.y = sj.yaw;
    j.update(STEP, { speed: sj.speed ?? 0, crouch: (sj.crouch ?? 0) > 0.5, run: Boolean(sj.run), action: sj.action ?? null, gaze: sj.gaze ?? { x: 0, y: 0 }, twist: sj.twist ?? 0, turn: sj.turn ?? null, stop: sj.stop ?? null });
    samples.push(jsample(t, probe(), { action: sj.action ?? null, yaws: yaws(), twist: sj.twist ?? 0, yaw: sj.yaw, pos: sj.pos, off: Boolean(sj.hidden) || sj.action === 'derrubado' }));
  }
  j.root.removeFromParent();
  samples.held = held(j);
  return samples;
}

/** A dog driven as the game drives it (src/systems/machines.js and the cutscenes of src/game.js): `pose(t)` -> { pos, yaw, y, pitch, speed, state, action }. */
export function dogRun(r, pose, t0, t1, plant = true) {
  const d = dog(r); d.plant = plant;
  const probe = feetOf(d, DOG_FEET), samples = [];
  for (let t = t0; t < t1; t += STEP) {
    const s = pose(t);
    d.root.position.set(s.pos[0], s.y ?? 0, s.pos[1]); d.root.rotation.y = s.yaw; d.root.rotation.x = s.pitch ?? 0;
    d.update(STEP, { speed: s.speed ?? 0, state: s.state ?? 'calma', action: s.action ?? null, look: s.look, lift: s.y ?? 0 });
    samples.push({ t, feet: probe() });
  }
  d.root.removeFromParent();
  samples.held = held(d);
  return samples;
}
export const route = (a) => (t) => { const u = Math.max(0, Math.min(1, (t - a.t0) / Math.max(0.01, a.t1 - a.t0))), q = routeAt(a, u); return { pos: q.pos, yaw: q.yaw, speed: u > 0 && u < 1 ? a.speed ?? 1.1 : 0, state: a.state ?? 'calma' }; };
export const scene4Dog = (rec) => (t) => actionPose('cheia', rec, t).dog;
/** The seconds between two landings of the same foot, on average, over the stances given (0 if fewer than two of a foot). */
export function cycle(st) { const l = st.filter((s) => s.foot === 0); return l.length > 1 ? (l.at(-1).t0 - l[0].t0) / (l.length - 1) : 0; }

// ---- stairs, steps and slopes (2026-11-23: going up the stairs of the chase he walked and slid) ------------------------------------------
/**
 * A straight stair to measure on: he goes toward -z from z = 0 over `lead` metres of floor, then `n` treads `run` deep and `rise` high,
 * then a floor again. { hAt(z): the top of what is under a point, ramp(z): the height a body is carried at (a line through the flight, as
 * the chase's stairs give it), k(z): the treads covered, tread(z): which tread a point is over (-1 before the flight, n after) }.
 */
export function stair({ run = 0.3, rise = 0.2, n = 10, lead = 2.4 } = {}) {
  const d = (z) => -z - lead;
  return { run, rise, n, lead, top: -(lead + n * run),
    hAt: (z) => (d(z) <= 0 ? 0 : Math.min(n, Math.floor(d(z) / run + 1e-9) + 1) * rise), ramp: (z) => Math.max(0, Math.min(n * rise, d(z) / run * rise)),
    k: (z) => d(z) / run, tread: (z) => (d(z) <= 0 ? -1 : Math.min(n, Math.floor(d(z) / run + 1e-9))) };
}
/**
 * Jonas up (`dir` 1) or down (-1) a stair at `pace` m/s, as the chase drives him: the root on the ramp, `stairs` and `ground` given to his
 * model (over 1 m/s he runs them, a foot on every tread all the same). `per`: treads a step takes. `stopAt`: seconds after which he stands still where he is (a run pulled up on a step). Samples carry
 * `g` (the ground under each foot), `hips` (the height of his pelvis), `tread` (the tread each foot is over) and the state of his moves.
 */
export function stairRun(r, S, { pace = 1.3, dir = 1, per = 1, T = 6, stopAt = Infinity, tail = 2.0 } = {}) {
  const j = jonas(r), probe = feetOf(j, JONAS_FEET), yaws = yawsOf(j), samples = [], hip = feetOf(j, ['pelvis', 'spine_03']);
  const z0 = dir > 0 ? 0 : S.top - tail, yaw = dir > 0 ? 0 : Math.PI, ground = (x, z) => S.hAt(z);
  let z = z0, v = 0;
  for (let t = 0; t < T; t += STEP) {
    const going = t < stopAt && (dir > 0 ? z > S.top - tail : z < 0);
    v = going ? Math.min(pace, v + 9 * STEP) : Math.max(0, v - 9 * STEP);
    z -= dir * v * STEP;
    const on = S.k(z) > 0 && S.k(z) < S.n, k = dir > 0 ? S.k(z) : S.n - S.k(z);
    j.root.position.set(0, S.ramp(z), z); j.root.rotation.y = yaw;
    j.update(STEP, { speed: v, run: v > 3.5, stairs: on && v > 0.05 ? { dir, k, per, run: S.run } : null, ground });
    const p = probe(), hp = hip();
    samples.push(jsample(t, p, { speed: v, z, g: [S.hAt(p[0][2]), S.hAt(p[1][2])], tread: [S.tread(p[0][2]), S.tread(p[1][2])], hips: hp[0][1], chest: hp[1], pelvis: hp[0], on, yaws: yaws(), yaw, move: j.move?.(), shares: j.shares?.(), ik: Math.max(0, ...(j.feetStats?.() ?? []).map((l) => l.w)) }));
  }
  j.root.removeFromParent();
  samples.log = [...(j.moves?.log ?? [])];
  return samples;
}
/** Of the stances of a stair's samples (carried()), those on the flight: for each, the tread, how far from that tread's top the ball stood (m) and from its middle along the stair (m). */
export function treads(samples, S, st) {
  return st.map((c) => { const s = samples.find((x) => x.t >= (c.t0 + c.t1) / 2) ?? samples.at(-1), p = s.feet[c.foot], i = S.tread(p[2]); return { ...c, tread: i, high: p[1] - S.hAt(p[2]), off: i < 0 || i >= S.n ? 0 : (-p[2] - S.lead) - (i + 0.5) * S.run }; }).filter((c) => c.tread >= 0 && c.tread < S.n);
}
/** How fast his hips change their height from one step to the next (m/s2, the most between `from` and `to`): a jump of the body shows here. */
export function jolt(samples, { from = -Infinity, to = Infinity } = {}) {
  let worst = 0;
  for (let i = 2; i < samples.length; i++) { const a = samples[i - 2], b = samples[i - 1], c = samples[i]; if (c.t < from || c.t > to) continue; worst = Math.max(worst, Math.abs(c.hips - 2 * b.hips + a.hips) / (STEP * STEP)); }
  return worst;
}
/**
 * Jonas standing where the floor is not flat: `ground(x, z)` the height of it, the root at `at` ([x, z]) on it, facing `yaw`; after `turnAt`
 * seconds he turns on the spot by `turn` radians (as the controller turns him). Samples as stairRun's, with `g` under each foot.
 */
export function standOn(r, ground, { at = [0, 0], yaw = 0, T = 2.4, turnAt = Infinity, turn = Math.PI / 2 } = {}) {
  const j = jonas(r), probe = feetOf(j, JONAS_FEET), hip = feetOf(j, ['pelvis']), yaws = yawsOf(j), samples = [], TT = turnTime(turn);
  for (let t = 0; t < T; t += STEP) {
    const k = (t - turnAt) / TT, y = yaw + (k > 0 ? turn * turnEase(k) : 0);
    j.root.position.set(at[0], ground(at[0], at[1]), at[1]); j.root.rotation.y = y;
    j.update(STEP, { speed: 0, ground, turn: k > 0 && k < 1 ? { a: turn, k } : null });
    const p = probe();
    samples.push(jsample(t, p, { g: [ground(p[0][0], p[0][2]), ground(p[1][0], p[1][2])], hips: hip()[0][1], base: ground(at[0], at[1]), yaws: yaws(), yaw: y, move: j.move?.(), terrain: j.terrain?.() }));
  }
  j.root.removeFromParent();
  return samples;
}
/**
 * Jonas in a beat of the chase through the building (src/systems/fuga.js), driven as src/game.js drives him from its poses, a run with
 * every command done right: the stairs of the well ('vao'), the hall and the first flight ('hall'), the window and the fire escape
 * ('janela'). Samples carry `g` (the ground under each foot, by the pose's own `ground`), `stairs` (whether he is on a flight) and his moves.
 */
export function chase(r, id, { branch = 'pano', lead = 0.5 } = {}) {
  const run = filmRec(undefined, { branch }), b = run.beats[id], j = jonas(r), probe = feetOf(j, JONAS_FEET), hip = feetOf(j, ['pelvis']), samples = [];
  for (let t = b.t0 - lead; t < b.end; t += STEP) {
    const sj = chasePose(recAt(run.rec, t), t).jonas, h = (sj.h ?? 0) + (sj.y ?? 0);
    j.root.position.set(sj.pos[0], h, sj.pos[1]); j.root.rotation.y = sj.yaw;
    j.update(STEP, { speed: sj.speed ?? 0, crouch: (sj.crouch ?? 0) > 0.5, run: Boolean(sj.run), action: sj.action ?? null, twist: sj.twist ?? 0, turn: sj.turn ?? null, stop: sj.stop ?? null, stairs: sj.stairs ?? null, ground: sj.ground ?? null });
    const p = probe(), fx = -Math.sin(sj.yaw), fz = -Math.cos(sj.yaw);
    const gAt = (q) => { if (!sj.ground) return h; const d = (q[0] - sj.pos[0]) * fx + (q[2] - sj.pos[1]) * fz; let g = sj.ground[0][1]; for (const [at, hh] of sj.ground) { if (at <= d) g = hh; else break; } return g; };
    samples.push(jsample(t, p, { g: [gAt(p[0]), gAt(p[1])], hips: hip()[0][1], stairs: Boolean(sj.stairs), speed: sj.speed ?? 0, off: Boolean(sj.hidden) || t < b.t0, yaw: sj.yaw, move: j.move?.(), shares: j.shares?.() }));
  }
  j.root.removeFromParent();
  samples.log = [...(j.moves?.log ?? [])];
  return samples;
}

