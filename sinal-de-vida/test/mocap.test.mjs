// The video-to-motion pipeline's logic: the filter, the levelling, the scale, the foot contacts, the root from the feet, the server's pose
// file. A synthetic walker stands in for a person: his hips go along x at a speed, his feet are planted while the body passes over them.
// Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gaussSmooth, fillGaps, despike, rotationBetween, apply, cleanTake, LM, JONAS } from '../tools/mocap/clean.mjs';
import { parseArgs } from '../tools/mocap/process.mjs';
import { createCaptureServer } from '../tools/capture/server.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

/**
 * A person walking to the image's right, seen from the side by a still camera, as the capture page would save it: world landmarks (x right, y down,
 * z away; the hips at the origin; metres of a 1.7 m person) and image landmarks. Left foot first. `tilt` turns the camera about x (radians).
 */
function walker({ fps = 30, seconds = 6, speed = 1.2, stride = 0.7, legs = 0.9, noise = 0, tilt = 0, facing = 'right' } = {}) {
  const half = stride / speed, hipH = legs, frames = [];
  // the world x of a planted foot is constant over its stance: foot n is planted at x = n*stride + offset
  const footWorld = (t, phase) => {
    const u = t / half + phase, n = Math.floor(u / 2), f = u - 2 * n;
    const x0 = n * 2 * stride, x1 = (n + 1) * 2 * stride;       // two half-cycles: planted (f in 0..1) then swing to the next plant
    if (f < 1) return [x0, 0];
    const s = (f - 1);
    return [x0 + (x1 - x0) * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI)), Math.sin(Math.PI * s) * 0.08];
  };
  const rnd = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 - 0.5; }; })();
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const t = i / fps, hx = i < fps * 0.6 ? 0 : speed * (t - 0.6), still = i < fps * 0.6;
    const L = still ? [0, 0] : footWorld(t - 0.6, 0), R = still ? [0, 0] : footWorld(t - 0.6, 1);
    const Lx = still ? 0.0 : L[0] - hx, Rx = still ? 0.0 : R[0] - hx;
    const lm = Array.from({ length: 33 }, () => [0, 0, 0]);
    const set = (j, x, up, depth) => { lm[j] = [x, -up, depth]; };           // x right, y down, z away
    const hw = 0.1, up = (h) => h - hipH;                                     // heights above the hip centre
    set(LM.hipL, 0, 0, hw); set(LM.hipR, 0, 0, -hw);                          // facing right: his left is away from the camera (z > 0)
    set(LM.shL, 0, 0.5, hw * 1.6); set(LM.shR, 0, 0.5, -hw * 1.6);
    set(LM.nose, 0.05, 0.75, 0); set(LM.earL, 0, 0.75, 0.08); set(LM.earR, 0, 0.75, -0.08);
    for (const [side, F] of [[0, L], [1, R]]) {
      const x = side ? Rx : Lx, d = side ? -hw : hw, lift = still ? 0 : F[1];
      set(side ? LM.anR : LM.anL, x, up(0.08 + lift), d); set(side ? LM.heR : LM.heL, x - 0.06, up(0.03 + lift), d); set(side ? LM.toR : LM.toL, x + 0.12, up(0.02 + lift), d);
      set(side ? LM.knR : LM.knL, x / 2 + 0.05, up(0.5 + lift / 2), d);
      set(side ? LM.elR : LM.elL, 0, 0.2, d * 2); set(side ? LM.wrR : LM.wrL, 0, -0.05, d * 2);
    }
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    const w = lm.map(([x, y, z]) => [x + (noise ? noise * rnd() : 0), y * c - z * sn + (noise ? noise * rnd() : 0), y * sn + z * c]);
    const px = 400;                                                            // pixels per metre, a still camera at 4 m
    const img = lm.map(([x, y]) => [0.15 + (hx + x) * px / 1280, 0.5 + (y + hipH * 0.0) * px / 720 - 0.0, 0]);
    frames.push({ t, w: w.map((p) => [...p, 0.95]), i: img.map((p) => [...p, 0.95]) });
  }
  return { version: 1, kind: 'pose', fps, width: 1280, height: 720, frames };
}

test('the Gaussian: a line stays a line, a spike is flattened, a missing point does not pull', () => {
  const t = Array.from({ length: 50 }, (_, i) => i / 30), x = t.map((v) => 2 * v + 1);
  const g = gaussSmooth(t, x, t.map(() => 1), 0.05);
  for (let i = 5; i < 45; i++) near(g[i], x[i], 1e-3);
  const y = x.slice(); y[25] += 1; const h = gaussSmooth(t, y, t.map(() => 1), 0.05);
  assert.ok(Math.abs(h[25] - x[25]) < 0.6);
  const w = t.map((_, i) => (i === 25 ? 0 : 1)); assert.ok(Math.abs(gaussSmooth(t, y, w, 0.05)[25] - x[25]) < 0.05);
});

test('gaps are filled by a line, spikes put back on the median', () => {
  const x = [0, 1, NaN, NaN, 4, 5]; assert.equal(fillGaps(x), 2); assert.deepEqual(x, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(despike([0, 0, 0, 5, 0, 0, 0], 0.5), [0, 0, 0, 0, 0, 0, 0]);
});

test('the rotation between two vectors turns one onto the other, also the opposite', () => {
  for (const [a, b] of [[[0, 0, 1], [0, 1, 0]], [[1, 0, 0], [-1, 0, 0]], [[0, 0, 1], [0.1, 0.05, 1]]]) {
    const n = Math.hypot(...b), u = apply(rotationBetween(a, b.map((v) => v / n)), a);
    near(u[0], b[0] / n, 1e-9); near(u[1], b[1] / n, 1e-9); near(u[2], b[2] / n, 1e-9);
  }
});

test('the take: Jonas\'s scale, the camera tilt out, the contacts alternate and the root follows the stance feet', () => {
  const { take, report } = cleanTake(walker({ tilt: 0.12 }), {});
  assert.equal(take.n, take.lm.length); assert.equal(take.fps, 30);
  // the scale: his legs are 0.9 m, Jonas's are JONAS.leg
  assert.ok(report.personLegM > 0.78 && report.personLegM < 0.9); near(report.scale, JONAS.leg / report.personLegM, 1e-3);
  near(report.tiltDeg, 6.9, 0.6);
  // levelled: the hip-to-shoulder line is vertical at the start
  const f = take.lm[3], mid = (a, b) => [0, 1, 2].map((c) => (f[a][c] + f[b][c]) / 2), up = mid(LM.shL, LM.shR).map((v, c) => v - mid(LM.hipL, LM.hipR)[c]);
  assert.ok(Math.hypot(up[0], up[1]) / Math.hypot(...up) < 0.04, 'upright after the levelling');
  // each foot is down about half of the walking, and the two take turns
  for (const c of report.contactFraction) assert.ok(c > 0.35 && c < 0.8, `contact fraction ${c}`);
  let both = 0, none = 0; for (let k = 30; k < take.n; k++) { const [l, r] = take.contactFlag[k]; if (l && r) both++; if (!l && !r) none++; }
  assert.ok(none < take.n * 0.08, `no foot down in ${none} frames`);
  // the root: 1.2 m/s of the walker, in Jonas's metres, straight along the facing (the start facing is turned to Jonas's -y by itself)
  const s = report.scale, end = take.root[take.n - 1], moved = Math.hypot(...end), expect = 1.2 * s * (6 - 0.6);
  assert.ok(Math.abs(moved - expect) / expect < 0.12, `the root moved ${moved.toFixed(2)} m, expected ${expect.toFixed(2)}`);
  assert.ok(Math.abs(end[0]) < 0.25 * moved + 0.1 || Math.abs(end[1]) > 0.8 * moved, 'it goes along one axis of the facing');
});

test('the stance foot does not slide in the world once the root follows it', () => {
  const { take } = cleanTake(walker({}), {});
  // the world position of the ankle in the frames where only that foot is down: a run of contact moves (nearly) nothing
  let worst = 0;
  for (const side of [0, 1]) {
    let k = 0;
    while (k < take.n) {
      if (!take.contactFlag[k][side]) { k++; continue; }
      let e = k; while (e < take.n && take.contactFlag[e][side]) e++;
      if (e - k >= 6) { const w = []; for (let q = k + 1; q < e - 1; q++) w.push(take.lm[q][side ? LM.anR : LM.anL][0] + take.root[q][0], take.lm[q][side ? LM.anR : LM.anL][1] + take.root[q][1]); const xs = w.filter((_, i) => i % 2 === 0), ys = w.filter((_, i) => i % 2 === 1); worst = Math.max(worst, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); }
      k = e;
    }
  }
  assert.ok(worst < 0.04, `the stance ankle drifted ${worst.toFixed(3)} m`);
});

test('noise on the landmarks is smoothed away: the stance foot stays put and the take has no jitter', () => {
  const noisy = cleanTake(walker({ noise: 0.03 }), {}).take, clean = cleanTake(walker({}), {}).take;
  let d = 0, c = 0; for (let k = 5; k < clean.n - 5; k++) { d += Math.hypot(...noisy.lm[k][LM.anL].map((v, i) => v - clean.lm[k][LM.anL][i])); c++; }
  assert.ok(d / c < 0.03, `the mean error of the ankle after smoothing is ${(d / c).toFixed(3)} m`);
});

test('a still pose for the whole take: both feet down, no root travel, the pelvis at a steady height', () => {
  const { take, report } = cleanTake(walker({ speed: 0.0001, seconds: 3 }), {});
  assert.ok(report.contactFraction.every((c) => c > 0.9));
  assert.ok(Math.hypot(...take.root[take.n - 1]) < 0.15);
  const h = take.pelvisHeight; assert.ok(Math.max(...h) - Math.min(...h) < 0.05);
});

test('no person in the video is refused, not guessed', () => {
  assert.throws(() => cleanTake({ kind: 'pose', width: 100, height: 100, fps: 30, frames: [{ t: 0, w: null, i: null }, { t: 0.03, w: null, i: null }] }), /nobody/);
});

test('the command line parser: flags, no- flags, values', () => {
  const a = parseArgs(['x.pose.json', '--name', 'recuar', '--fps', '60', '--no-level', '--camera', 'follow']);
  assert.deepEqual(a._, ['x.pose.json']); assert.equal(a.name, 'recuar'); assert.equal(a.fps, '60'); assert.equal(a.level, false); assert.equal(a.camera, 'follow');
});

test('the capture server keeps a pose file (numbers only) and refuses what is not one', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mocap-')), script = path.join(dir, 's.json'); writeFileSync(script, '{"lines":[]}');
  const s = createCaptureServer({ out: dir, script, port: 0, log: () => {} }); const port = await s.listen();
  const req = (method, p, body) => new Promise((ok, no) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: `127.0.0.1:${port}` } }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ code: res.statusCode, body: Buffer.concat(c).toString() })); }); r.on('error', no); r.end(body); });
  try {
    const doc = walker({ seconds: 1 });
    assert.equal((await req('PUT', '/api/body/teste-1', JSON.stringify(doc))).code, 200);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'teste-1.pose.json'), 'utf8')).kind, 'pose');
    assert.equal(JSON.parse((await req('GET', '/api/body/teste-1')).body).frames.length, 30);
    assert.equal((await req('PUT', '/api/body/teste-1', '{"kind":"x"}')).code, 400);
    assert.equal((await req('PUT', '/api/body/..%2Fx', JSON.stringify(doc))).code, 404);
    assert.equal((await req('GET', '/body.js')).code, 200);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});
