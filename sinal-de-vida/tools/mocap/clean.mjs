// Cleaning the pose of a video before it goes to Jonas: pure node, no dependencies, everything in function of the numbers (no clock, no random).
//
// The input is what the capture page saves (<name>.pose.json): per frame the 33 MediaPipe world landmarks (metres, the hips' centre at the
// origin, x right in the image, y down, z away from the camera being positive) and the 33 image landmarks (0..1). The output is a "take":
// the same landmarks in Jonas's world (x to the image's right, y away from the camera, z up, metres of HIS size), at an even frame rate, with
//   - the noise taken out by a centred filter weighted by how visible each point was, the gaps filled;
//   - the camera's tilt taken out (the start still pose is upright) and the start facing turned to Jonas's (he faces -y, his left is +x);
//   - the scale fixed to Jonas's legs (jonas-dims.json: 90% legs), so the stride and the hip's height are his;
//   - the foot contacts (low and not moving up or down, in the world and in the image), smoothed to a weight 0..1 per foot;
//   - the root: where the hips go over the floor. From the stance feet when one is down (a foot that does not slide moves the body the
//     opposite way), from the image of the hips (the size of the person in the image says how far he is) when none is;
//   - the pelvis height over the floor, from the lowest foot in contact; in the air, the shape of the hips in the image.
// retarget.py reads this and does the last pin on Jonas's own legs (a person's legs are not Jonas's).

import { readFileSync } from 'node:fs';

export const LM = { nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, pinL: 17, pinR: 18, idxL: 19, idxR: 20, thL: 21, thR: 22,
  hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, heL: 29, heR: 30, toL: 31, toR: 32 };
export const JONAS = JSON.parse(readFileSync(new URL('./jonas-dims.json', import.meta.url), 'utf8'));
export const DEFAULTS = { fps: 30, sigma: 0.05, camera: 'static', fov: 65, face: 'start', yaw: 0, level: true, trim: null, stillSec: 0.5, heightThr: 0.06, speedThr: 0.6, slideThr: 0.7, depth: true, depthSigma: 0.3 };

// ---- small vector helpers (arrays of 3) --------------------------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const round = (v, n = 4) => { const k = 10 ** n; return Math.round(v * k) / k; };

/** Rodrigues: the matrix (rows) that turns the unit vector a onto the unit vector b by the shortest way. */
export function rotationBetween(a, b) {
  const v = cross(a, b), c = dot(a, b);
  if (c < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = unit(cross(a, ax)); return [[2 * u[0] * u[0] - 1, 2 * u[0] * u[1], 2 * u[0] * u[2]], [2 * u[1] * u[0], 2 * u[1] * u[1] - 1, 2 * u[1] * u[2]], [2 * u[2] * u[0], 2 * u[2] * u[1], 2 * u[2] * u[2] - 1]]; }
  const k = 1 / (1 + c);
  return [[1 - (v[1] * v[1] + v[2] * v[2]) * k, -v[2] + v[0] * v[1] * k, v[1] + v[0] * v[2] * k], [v[2] + v[0] * v[1] * k, 1 - (v[0] * v[0] + v[2] * v[2]) * k, -v[0] + v[1] * v[2] * k], [-v[1] + v[0] * v[2] * k, v[0] + v[1] * v[2] * k, 1 - (v[0] * v[0] + v[1] * v[1]) * k]];
}
export const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
export const apply = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];

// ---- filtering ---------------------------------------------------------------------------------------------------------------------------
/**
 * A centred Gaussian over an irregular series, each sample weighted (a point the model did not see weighs little). `t` seconds, `x` values,
 * `w` weights, `sigma` seconds. A weight sum too small leaves the value as it was.
 */
export function gaussSmooth(t, x, w, sigma) {
  const n = t.length, out = new Array(n); if (sigma <= 0) return x.slice();
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (t[lo] < t[i] - 3 * sigma) lo++;
    let s = 0, sw = 0;
    for (let k = lo; k < n && t[k] <= t[i] + 3 * sigma; k++) { const d = (t[k] - t[i]) / sigma, g = w[k] * Math.exp(-0.5 * d * d); s += g * x[k]; sw += g; }
    out[i] = sw > 1e-9 ? s / sw : x[i];
  }
  return out;
}
/** The same Gaussian on an evenly sampled series, in samples. */
export const gaussEven = (x, sigmaSamples, w = null) => { const t = x.map((_, i) => i); return gaussSmooth(t, x, w ?? x.map(() => 1), sigmaSamples); };

/** Fills the frames where a value is NaN by a straight line between the nearest ones (holding at the ends). Returns the longest gap in frames. */
export function fillGaps(x) {
  const n = x.length; let longest = 0, i = 0;
  while (i < n) {
    if (Number.isFinite(x[i])) { i++; continue; }
    let j = i; while (j < n && !Number.isFinite(x[j])) j++;
    const a = i > 0 ? x[i - 1] : null, b = j < n ? x[j] : null;
    for (let k = i; k < j; k++) x[k] = a === null ? b : b === null ? a : a + (b - a) * (k - i + 1) / (j - i + 1);
    longest = Math.max(longest, j - i); i = j;
  }
  return longest;
}
/** A point that jumps away from the median of its five neighbours by more than `limit` is put back on the median (a landmark that flicks for a frame). */
export function despike(x, limit) {
  const out = x.slice();
  for (let i = 2; i < x.length - 2; i++) { const m = median([x[i - 2], x[i - 1], x[i], x[i + 1], x[i + 2]]); if (Math.abs(x[i] - m) > limit) out[i] = m; }
  return out;
}

// ---- the take ----------------------------------------------------------------------------------------------------------------------------
/** The frames of a pose file as Jonas's axes: x to the image's right, y away from the camera, z up. null where nobody was found. */
function readFrames(doc, trim) {
  let fr = doc.frames;
  if (trim) fr = fr.filter((f) => f.t >= trim[0] && f.t <= trim[1]);
  if (!fr.length) throw new Error('no frames in the range');
  const t0 = fr[0].t;
  return fr.map((f) => ({ t: f.t - t0, ok: !!f.w, P: f.w ? f.w.map((p) => [p[0], p[2], -p[1]]) : null, V: f.w ? f.w.map((p) => p[3]) : null, I: f.i ? f.i.map((p) => [p[0], p[1]]) : null }));
}

/** Resamples (linear in time) several [n][33][k] arrays that share the times `t` onto the even grid `tk`. */
function resample(t, tk, series) {
  const idx = []; let j = 0;
  for (const tt of tk) { while (j < t.length - 2 && t[j + 1] < tt) j++; const a = Math.min(j, t.length - 1), b = Math.min(j + 1, t.length - 1); const u = b === a ? 0 : Math.min(1, Math.max(0, (tt - t[a]) / (t[b] - t[a]))); idx.push([a, b, u]); }
  return series.map((s) => idx.map(([a, b, u]) => s[a].map((p, jj) => p.map((v, c) => v + (s[b][jj][c] - v) * u))));
}

/**
 * The whole cleaning. `doc` is a pose file, `o` the options (DEFAULTS). Returns the take (see the header) and a `report` of what was done.
 */
export function cleanTake(doc, o = {}) {
  o = { ...DEFAULTS, ...o };
  const fr = readFrames(doc, o.trim), n0 = fr.length, report = { frames: n0, missing: fr.filter((f) => !f.ok).length };
  if (report.missing === n0) throw new Error('nobody was found in any frame');
  const t = fr.map((f) => f.t);
  // 1. the gaps: a frame with nobody is filled from its neighbours, and weighs nothing in the filter
  const P = Array.from({ length: n0 }, () => Array.from({ length: 33 }, () => [NaN, NaN, NaN])), V = Array.from({ length: n0 }, () => new Array(33).fill(0)), I = Array.from({ length: n0 }, () => Array.from({ length: 33 }, () => [NaN, NaN]));
  fr.forEach((f, i) => { if (f.ok) for (let j = 0; j < 33; j++) { P[i][j] = f.P[j]; V[i][j] = f.V[j]; if (f.I) I[i][j] = f.I[j]; } });
  let longest = 0;
  for (let j = 0; j < 33; j++) for (let c = 0; c < 3; c++) { const s = P.map((p) => p[j][c]); longest = Math.max(longest, fillGaps(s)); s.forEach((v, i) => { P[i][j][c] = v; }); }
  for (let j = 0; j < 33; j++) for (let c = 0; c < 2; c++) { const s = I.map((p) => p[j][c]); fillGaps(s); s.forEach((v, i) => { I[i][j][c] = v; }); }
  report.longestGapFrames = longest;
  // 2. noise: a flick for a frame is put back, then the centred Gaussian weighted by visibility (at the source's own rate)
  const W = (j, i) => (fr[i].ok ? 0.05 + V[i][j] : 0.001);
  for (let j = 0; j < 33; j++) {
    for (let c = 0; c < 3; c++) { const s = despike(P.map((p) => p[j][c]), 0.12), g = gaussSmooth(t, s, t.map((_, i) => W(j, i)), o.sigma); g.forEach((v, i) => { P[i][j][c] = v; }); }
    for (let c = 0; c < 2; c++) { const g = gaussSmooth(t, I.map((p) => p[j][c]), t.map((_, i) => W(j, i)), o.sigma); g.forEach((v, i) => { I[i][j][c] = v; }); }
  }
  // 3. an even frame rate
  const dur = t[t.length - 1], n = Math.max(2, Math.floor(dur * o.fps + 1e-6) + 1), tk = Array.from({ length: n }, (_, k) => k / o.fps);
  const [Pk, Ik] = resample(t, tk, [P, I]);
  const Vk = resample(t, tk, [V.map((v) => v.map((x) => [x]))])[0].map((v) => v.map((x) => x[0]));
  const lm = Pk, img = Ik;
  report.fps = o.fps; report.frames = n; report.seconds = round(dur, 3);
  // 4. the camera's tilt: the start still pose is upright, so the up of the body (legs and trunk) is taken to the vertical
  const still = Math.max(2, Math.round(o.stillSec * o.fps)), at = (f, j) => lm[f][j];
  const upOf = (f) => unit(add(unit(sub(mid(at(f, LM.shL), at(f, LM.shR)), mid(at(f, LM.hipL), at(f, LM.hipR)))), unit(sub(mid(at(f, LM.hipL), at(f, LM.hipR)), mid(at(f, LM.anL), at(f, LM.anR))))));
  let up = [0, 0, 1];
  for (let f = 0; f < Math.min(still, n); f++) up = add(up, upOf(f));
  up = unit(up);
  const tilt = Math.acos(Math.min(1, up[2])) * 180 / Math.PI; report.tiltDeg = round(tilt, 1);
  let R = null;
  if (o.level && tilt < 30) R = rotationBetween(up, [0, 0, 1]); else if (o.level) report.levelSkipped = `the start pose is ${tilt.toFixed(0)} degrees off the vertical: not an upright still pose, not levelled`;
  if (R) for (const fm of lm) for (let j = 0; j < 33; j++) fm[j] = apply(R, fm[j]);
  // 5. the facing: where the body looks at the start, taken to Jonas's -y. The hip line and the shoulder line say it well from the front and badly
  //    from the side (their depth is the worst number there); the feet (heel to toe) say it well from the side and badly from the front: all four
  //    vote with their lengths, so the one that sees it across the image wins.
  const fwdVotes = (f) => {
    const hl = sub(at(f, LM.hipL), at(f, LM.hipR)), sl = sub(at(f, LM.shL), at(f, LM.shR));
    const fl = sub(at(f, LM.toL), at(f, LM.heL)), fr = sub(at(f, LM.toR), at(f, LM.heR));
    return [[hl[1], -hl[0]], [sl[1], -sl[0]], [fl[0], fl[1]], [fr[0], fr[1]]];
  };
  let fx = 0, fy = 0;
  for (let f = 0; f < Math.min(still, n); f++) for (const v of fwdVotes(f)) { const l = Math.hypot(v[0], v[1]) || 1; fx += v[0] / l * Math.min(l, 0.25); fy += v[1] / l * Math.min(l, 0.25); }
  const a0 = Math.atan2(fy, fx) + Math.PI / 2; report.startFacingDeg = round(a0 * 180 / Math.PI, 1);
  const turn = (o.face === 'start' ? -a0 : 0) + o.yaw * Math.PI / 180, Rz = rotZ(turn); report.turnedDeg = round(turn * 180 / Math.PI, 1);
  for (const fm of lm) for (let j = 0; j < 33; j++) fm[j] = apply(Rz, fm[j]);
  // 6. the scale: the person's leg (hip to ankle, through the knee) to Jonas's
  const legs = [];
  for (const fm of lm) for (const [h, k, a] of [[LM.hipL, LM.knL, LM.anL], [LM.hipR, LM.knR, LM.anR]]) legs.push(len(sub(fm[h], fm[k])) + len(sub(fm[k], fm[a])));
  const leg = median(legs), s = JONAS.leg / leg; report.personLegM = round(leg, 3); report.scale = round(s, 4);
  for (const fm of lm) for (let j = 0; j < 33; j++) fm[j] = mul(fm[j], s);
  // 7. metres per image pixel, per frame (from the long bones that lie across the image), for the hips' path and the feet in the image
  const Wpx = doc.width || 1280, Hpx = doc.height || 720;
  const mpp = new Array(n).fill(NaN);
  const SEG = [[LM.shL, LM.hipL], [LM.shR, LM.hipR], [LM.hipL, LM.knL], [LM.hipR, LM.knR], [LM.knL, LM.anL], [LM.knR, LM.anR], [LM.shL, LM.elL], [LM.shR, LM.elR]];
  for (let f = 0; f < n; f++) {
    let sw = 0, sv = 0;
    for (const [a, b] of SEG) {
      const d = sub(lm[f][a], lm[f][b]), plane = Math.hypot(d[0], d[2]) / s;       // metres of the person, across the image
      const px = Math.hypot((img[f][a][0] - img[f][b][0]) * Wpx, (img[f][a][1] - img[f][b][1]) * Hpx);
      if (plane > 0.12 && px > 8) { sw += plane; sv += plane * (plane / px); }
    }
    if (sw > 0) mpp[f] = sv / sw;
  }
  fillGaps(mpp); const mppS = gaussEven(mpp, Math.max(1, o.depthSigma * o.fps));       // (person's metres per pixel)
  // 8. the foot contacts
  const dt = 1 / o.fps, low = (f, side) => Math.min(lm[f][side ? LM.heR : LM.heL][2], lm[f][side ? LM.toR : LM.toL][2]);
  const lowest = lm.map((_, f) => Math.min(low(f, 0), low(f, 1)));
  const imgLow = (f, side) => Math.max(img[f][side ? LM.heR : LM.heL][1], img[f][side ? LM.toR : LM.toL][1]) * Hpx;
  const win = Math.round(0.6 * o.fps), imgFloor = lm.map((_, f) => { let m = -1e9; for (let g = Math.max(0, f - win); g <= Math.min(n - 1, f + win); g++) m = Math.max(m, imgLow(g, 0), imgLow(g, 1)); return m; });
  const tidy = (flag) => {
    // a gap of two frames inside a contact is closed, a contact of two frames or less is dropped
    for (let f = 1; f < n - 1; f++) if (!flag[f]) { let e = f; while (e < n && !flag[e]) e++; if (e - f <= 2 && e < n && flag[f - 1]) for (let g = f; g < e; g++) flag[g] = 1; f = e; }
    for (let f = 0; f < n; f++) if (flag[f]) { let e = f; while (e < n && flag[e]) e++; if (e - f <= 2) for (let g = f; g < e; g++) flag[g] = 0; f = e; }
    return flag;
  };
  // first by height (in the world and in the image) and by how fast it moves up or down
  const first = [0, 1].map((side) => {
    const flag = new Array(n).fill(0);
    const z = lm.map((_, f) => low(f, side)), vz = z.map((_, f) => (z[Math.min(n - 1, f + 1)] - z[Math.max(0, f - 1)]) / (2 * dt));
    for (let f = 0; f < n; f++) {
      const hW = z[f] - lowest[f], hI = (imgFloor[f] - imgLow(f, side)) * mppS[f] * s;
      flag[f] = hW < o.heightThr && hI < o.heightThr * 1.2 && Math.abs(vz[f]) < o.speedThr ? 1 : 0;
    }
    return flag;
  });
  // then by how fast it moves over the floor: the body's velocity is what the feet that are down say it is (the middle of their velocities over
  // a second); a foot that is low but going its own way (the first moments of a step) is not planted
  const ank0 = (f, side) => lm[f][side ? LM.anR : LM.anL];
  const rv = [0, 1].map((side) => lm.map((_, f) => { const a = Math.max(0, f - 2), b = Math.min(n - 1, f + 2); return [(ank0(b, side)[0] - ank0(a, side)[0]) / ((b - a) * dt), (ank0(b, side)[1] - ank0(a, side)[1]) / ((b - a) * dt)]; }));
  const contact = [0, 1].map((side) => {
    const flag = first[side].slice();
    for (let f = 0; f < n; f++) {
      if (!flag[f]) continue;
      const xs = [], ys = [];
      for (let g = Math.max(0, f - Math.round(0.4 * o.fps)); g <= Math.min(n - 1, f + Math.round(0.4 * o.fps)); g++) for (const sd of [0, 1]) if (first[sd][g]) { xs.push(-rv[sd][g][0]); ys.push(-rv[sd][g][1]); }
      const bx = median(xs), by = median(ys);
      if (Math.hypot(rv[side][f][0] + bx, rv[side][f][1] + by) > o.slideThr) flag[f] = 0;
    }
    return tidy(flag);
  });
  const weight = contact.map((fl) => gaussEven(fl.map(Number), 1.0));        // a weight, so a foot is planted and lifted over a few frames
  report.contactFraction = contact.map((fl) => round(fl.reduce((a, b) => a + b, 0) / n, 2));
  // 9. the root's path: the stance feet (the ankle that stays moves the body the other way), the hips in the image where none is down
  const ank = (f, side) => lm[f][side ? LM.anR : LM.anL];
  const vel = Array.from({ length: n }, () => [NaN, NaN]);
  for (let f = 0; f < n; f++) {
    const fa = Math.max(0, f - 1), fb = Math.min(n - 1, f + 1); let sx = 0, sy = 0, c = 0;
    for (const side of [0, 1]) if (contact[side][f] && contact[side][fa] && contact[side][fb]) { const a = ank(fa, side), b = ank(fb, side); sx += -(b[0] - a[0]) / ((fb - fa) * dt); sy += -(b[1] - a[1]) / ((fb - fa) * dt); c++; }
    if (c) vel[f] = [sx / c, sy / c];
  }
  const hipImg = (f) => mid(img[f][LM.hipL], img[f][LM.hipR]);
  const fpx = (Wpx / 2) / Math.tan(o.fov * Math.PI / 360);
  const rawImg = lm.map((_, f) => { const h = hipImg(f); return [(h[0] * Wpx - Wpx / 2) * mppS[f], o.depth ? mppS[f] * fpx : 0, -(h[1] * Hpx - Hpx / 2) * mppS[f]]; });
  const rI = rawImg.map((p) => mul(p, s));
  const turned = rI.map((p) => apply(Rz, apply(R ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p)));
  const sm = [0, 1, 2].map((c) => gaussEven(turned.map((p) => p[c]), Math.max(1, 0.15 * o.fps)));
  const imgPath = turned.map((_, f) => [sm[0][f] - sm[0][0], sm[1][f] - sm[1][0], sm[2][f] - sm[2][0]]);
  const imgVel = imgPath.map((_, f) => { const fa = Math.max(0, f - 1), fb = Math.min(n - 1, f + 1); return [(imgPath[fb][0] - imgPath[fa][0]) / ((fb - fa) * dt), (imgPath[fb][1] - imgPath[fa][1]) / ((fb - fa) * dt)]; });
  const mode = o.camera === 'static' ? 'image' : 'hold';
  const root = [[0, 0]];
  const vx = vel.map((v) => v[0]), vy = vel.map((v) => v[1]);
  const holes = vx.map((v) => !Number.isFinite(v));
  if (mode === 'image') { for (let f = 0; f < n; f++) if (holes[f]) { vx[f] = imgVel[f][0]; vy[f] = imgVel[f][1]; } } else { fillGaps(vx); fillGaps(vy); }
  fillGaps(vx); fillGaps(vy);
  for (let f = 1; f < n; f++) root.push([root[f - 1][0] + (vx[f] + vx[f - 1]) / 2 * dt, root[f - 1][1] + (vy[f] + vy[f - 1]) / 2 * dt]);
  report.rootFromFeetFraction = round(1 - holes.filter(Boolean).length / n, 2);
  report.rootMetres = round(Math.hypot(root[n - 1][0], root[n - 1][1]), 2);
  report.rootFromImageMetres = round(Math.hypot(imgPath[n - 1][0], imgPath[n - 1][1]), 2);
  // 10. the pelvis' height over the floor: the lowest foot of a contact, and in the air the hips' rise in the image between the contacts
  const hC = lm.map((_, f) => (contact[0][f] || contact[1][f] ? -Math.min(...[0, 1].filter((sd) => contact[sd][f]).map((sd) => low(f, sd))) : NaN));
  const known = hC.map((v) => Number.isFinite(v));
  const zi = imgPath.map((p) => p[2]);
  const height = hC.slice();
  for (let f = 0; f < n; f++) if (!known[f]) {
    let a = f; while (a >= 0 && !known[a]) a--; let b = f; while (b < n && !known[b]) b++;
    if (a >= 0 && b < n) { const u = (f - a) / (b - a); height[f] = hC[a] + (hC[b] - hC[a]) * u + (zi[f] - (zi[a] + (zi[b] - zi[a]) * u)); } else height[f] = a >= 0 ? hC[a] : hC[b];
  }
  const fl = height.map((h) => (Number.isFinite(h) ? h : JONAS.pelvisZ));
  const heightS = gaussEven(fl, 1.0);
  report.pelvisHeightM = { min: round(Math.min(...heightS), 3), max: round(Math.max(...heightS), 3), median: round(median(heightS), 3) };
  return {
    take: { version: 1, kind: 'take', fps: o.fps, n, scale: round(s, 5), source: { model: doc.model ?? null, width: Wpx, height: Hpx, camera: o.camera },
      lm: lm.map((fm) => fm.map((p) => p.map((v) => round(v, 4)))), vis: Vk.map((v) => v.map((x) => round(x, 2))),
      contact: lm.map((_, f) => [round(weight[0][f], 3), round(weight[1][f], 3)]), contactFlag: lm.map((_, f) => [contact[0][f], contact[1][f]]),
      root: root.map((p) => [round(p[0], 4), round(p[1], 4)]), rootFromFeet: holes.map((h) => (h ? 0 : 1)), pelvisHeight: heightS.map((v) => round(v, 4)), rootImage: imgPath.map((p) => [round(p[0], 4), round(p[1], 4)]) },
    report,
  };
}
