// Bakes the dust sheet Jonas throws over the dog's sensor (the chase, beat `pano`) as vertex animation: `node tools/fuga/bake-pano.mjs`.
// A cloth simulated here, offline, and never in the game: 11 x 11 points (1.2 m square) joined by distance constraints (structural, shear,
// bend), stepped by Verlet at 240 Hz with gravity and air drag, colliding with the floor and with the dog as a row of spheres (its back and
// its head, where the sensor is). It leaves his hands bunched and opening, flies `FLY` seconds, lands over the sensor and hangs; then the
// head swings from side to side (the dog, blind, shaking it) and the sheet sags and slides with it.
// The frame of the bake is the dog's: the origin on the floor under its middle, +z the way it faces (toward Jonas), y up, metres.
// Written as a small glb: one mesh, its first frame as the positions and every other frame as a morph target (a difference from the
// first), 24 frames a second. The game reads the frames and sets the positions itself (src/models/predio/index.js: buildCloth): no shader
// morphing, no simulation at runtime. assets/models/pano-fuga.glb; `extras` of the mesh: { fps, frames, fly, hand: [x, y, z] }.
import { writeFileSync } from 'node:fs';

export const N = 11, SIZE = 1.2, FPS = 24, SECONDS = 3.0, FLY = 0.38, HAND = [0, 1.25, 0.95], HEAD = [0, 0.7, 0.6];
const G = 9.81, SUB = 240, DRAG = 0.9965, ITER = 8, REST0 = 0.3, OPEN = 0.22;
// (the dog's back is flat and 0.5 m wide: two rows of spheres, so the sheet lies on it and does not roll off a round one)
const body = [-0.6, -0.34, -0.08, 0.18, 0.44].flatMap((z) => [-0.14, 0.14].map((x) => ({ c: [x, 0.52, z], r: 0.26 }))), head = { c: [...HEAD], r: 0.22 };
// a seeded shuffle of nothing: the sim is deterministic (no random numbers at all)
const P = [], Q = [], idx = (i, j) => i * N + j, sp = SIZE / (N - 1);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  // bunched in his hands (a third of its size), a little crumpled by a fixed wave
  const u = (j / (N - 1) - 0.5) * SIZE, v = (i / (N - 1) - 0.5) * SIZE, x = HAND[0] + u * REST0, y = HAND[1] + Math.sin(i * 1.7 + j * 2.3) * 0.03, z = HAND[2] + v * REST0;
  // thrown at the head: there in FLY seconds under gravity, opening as it goes
  const vx = (HEAD[0] - HAND[0]) / FLY + u * 1.5, vy = (HEAD[1] + 0.32 - HAND[1]) / FLY + 0.5 * G * FLY, vz = (HEAD[2] - 0.2 - HAND[2]) / FLY + v * 1.5;
  P.push([x, y, z]); Q.push([x - vx / SUB, y - vy / SUB, z - vz / SUB]);
}
const links = [];
const link = (a, b) => links.push([a, b, Math.hypot((Math.floor(a / N) - Math.floor(b / N)) * sp, ((a % N) - (b % N)) * sp)]);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  if (j + 1 < N) link(idx(i, j), idx(i, j + 1)); if (i + 1 < N) link(idx(i, j), idx(i + 1, j));
  if (i + 1 < N && j + 1 < N) { link(idx(i, j), idx(i + 1, j + 1)); link(idx(i + 1, j), idx(i, j + 1)); }
  if (j + 2 < N) link(idx(i, j), idx(i, j + 2)); if (i + 2 < N) link(idx(i, j), idx(i + 2, j));
}
const frames = [];
const total = Math.round(SECONDS * SUB), every = SUB / FPS;
for (let s = 0; s <= total; s++) {
  const t = s / SUB;
  if (s % every === 0) frames.push(P.map((p) => [...p]));
  // the head swings once it has the sheet over it: the dog shaking it, slower and slower
  const sway = t > 1.1 ? Math.sin((t - 1.1) * 5.2) * 0.06 * Math.exp(-(t - 1.1) * 0.9) : 0;
  head.c[0] = HEAD[0] + sway;
  const k = REST0 + (1 - REST0) * Math.min(1, t / OPEN);                     // the sheet opens: its links grow to their length
  for (let i = 0; i < P.length; i++) { const p = P[i], q = Q[i], n = [p[0] + (p[0] - q[0]) * DRAG, p[1] + (p[1] - q[1]) * DRAG - G / (SUB * SUB), p[2] + (p[2] - q[2]) * DRAG]; Q[i] = p; P[i] = n; }
  for (let it = 0; it < ITER; it++) {
    for (const [a, b, L] of links) { const pa = P[a], pb = P[b], dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2], d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - L * k) / d / 2; pa[0] += dx * f; pa[1] += dy * f; pa[2] += dz * f; pb[0] -= dx * f; pb[1] -= dy * f; pb[2] -= dz * f; }
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = Q[i];
      for (const sph of [...body, head]) { const dx = p[0] - sph.c[0], dy = p[1] - sph.c[1], dz = p[2] - sph.c[2], d = Math.hypot(dx, dy, dz), R = sph.r + 0.02; if (d < R) { const f = R / (d || 1e-6); p[0] = sph.c[0] + dx * f; p[1] = sph.c[1] + dy * f; p[2] = sph.c[2] + dz * f; for (let c = 0; c < 3; c++) q[c] += (p[c] - q[c]) * 0.92; } }   // (friction: it does not slide off like ice)
      if (p[1] < 0.015) { p[1] = 0.015; q[0] += (p[0] - q[0]) * 0.6; q[2] += (p[2] - q[2]) * 0.6; }
    }
  }
}
// ---- the glb ------------------------------------------------------------------------------------------------------------------------------
const F = frames.length, V = N * N, tri = [];
for (let i = 0; i + 1 < N; i++) for (let j = 0; j + 1 < N; j++) tri.push(idx(i, j), idx(i + 1, j), idx(i, j + 1), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1));
const chunks = [], views = [], accessors = [];
const add = (arr, target) => { const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), at = chunks.reduce((n, c) => n + c.length, 0); chunks.push(buf, Buffer.alloc((4 - (buf.length % 4)) % 4)); views.push({ buffer: 0, byteOffset: at, byteLength: buf.length, ...(target ? { target } : {}) }); return views.length - 1; };
const minmax = (a) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < a.length; i++) { mn[i % 3] = Math.min(mn[i % 3], a[i]); mx[i % 3] = Math.max(mx[i % 3], a[i]); } return { min: mn, max: mx }; };
const vec3 = (a, view) => { accessors.push({ bufferView: view, componentType: 5126, count: V, type: 'VEC3', ...minmax(a) }); return accessors.length - 1; };
const base = new Float32Array(frames[0].flat()), uv = new Float32Array(V * 2);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { uv[idx(i, j) * 2] = j / (N - 1); uv[idx(i, j) * 2 + 1] = i / (N - 1); }
const aPos = vec3(base, add(base, 34962));
accessors.push({ bufferView: add(uv, 34962), componentType: 5126, count: V, type: 'VEC2' }); const aUv = accessors.length - 1;
accessors.push({ bufferView: add(new Uint16Array(tri), 34963), componentType: 5123, count: tri.length, type: 'SCALAR' }); const aIdx = accessors.length - 1;
const targets = frames.slice(1).map((fr) => { const d = new Float32Array(fr.flat().map((v, i) => v - base[i])); return { POSITION: vec3(d, add(d)) }; });
const bin = Buffer.concat(chunks);
const json = { asset: { version: '2.0', generator: 'tools/fuga/bake-pano.mjs' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'pano' }],
  meshes: [{ name: 'pano', primitives: [{ attributes: { POSITION: aPos, TEXCOORD_0: aUv }, indices: aIdx, targets }], weights: targets.map(() => 0), extras: { fps: FPS, frames: F, fly: FLY, hand: HAND, head: HEAD, size: SIZE } }],
  accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head12 = Buffer.alloc(12); head12.writeUInt32LE(0x46546c67, 0); head12.writeUInt32LE(2, 4); head12.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4); const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.writeUInt32LE(0x004e4942, 4);
const out = Buffer.concat([head12, h1, js, h2, bin]);
if (process.argv[1]?.endsWith('bake-pano.mjs')) {
  writeFileSync(new URL('../../assets/models/pano-fuga.glb', import.meta.url), out);
  // what the sheet does, in numbers: where its middle is, how wide it is, how many points lie on the floor, at a few moments
  const at = (t) => { const fr = frames[Math.round(t * FPS)], c = fr.reduce((a, p) => [a[0] + p[0] / V, a[1] + p[1] / V, a[2] + p[2] / V], [0, 0, 0]), lo = fr.filter((p) => p[1] < 0.03).length, top = Math.max(...fr.map((p) => p[1])), over = fr.filter((p) => Math.hypot(p[0] - HEAD[0], p[2] - HEAD[2]) < 0.3 && p[1] > HEAD[1]).length; return `${t.toFixed(2)} s: middle ${c.map((v) => v.toFixed(2)).join(',')} top ${top.toFixed(2)} over the head ${over} on the floor ${lo}`; };
  console.log(`pano-fuga.glb: ${out.length} bytes, ${V} points, ${tri.length / 3} triangles, ${F} frames at ${FPS}/s`);
  for (const t of [0, 0.2, FLY, 0.6, 1.0, 1.6, 2.4, 3.0]) console.log(at(t));
}
export const BAKE = { frames, fps: FPS };
