// The humanoid creatures of the pit: tall, standing like people, with legs, arms and hands, and no
// animal behind them. Low poly, PS1 look, painted by code on 32 to 64 px textures.
//
//   buildCreature(r, tipo, { seed, scale }) -> { root, update(t, estado), tris, joints, height }
//   tipo: 'casca' | 'fole' | 'vigia' | 'mestre' | 'apito'   (CREATURES)
//
// Pure function of seed and time: no Math.random, no real clock.
//
// Rig (same names as the human in human.js): root > body (uniform scale) > hips > { spine > { neck >
// head, shoulderL > elbowL > wristL, shoulderR > ... }, hipL > kneeL > ankleL, hipR > ... }.
// Neutral pose: standing, arms down, +Z forward, +Y up, +X is the creature's left; every joint at
// rotation zero. A segment that hangs swings forward with a negative rotation.x (elbow bends forward,
// knee bends back with a positive one); an arm opens sideways and up with +rotation.z on the left
// (shoulderL) and -rotation.z on the right (shoulderR).
//
// update(t, estado) writes every joint rotation on each call and only the position of `body`
// (a child of root): the caller owns root.position and root.scale. A cutscene that wants a gesture
// calls update first and then overrides the joints it wants, or skips update while it holds the pose.
//   estado: undefined / 'parado'  breathing, head turning, weight on one leg and then the other
//           'excitado' | number 0..1 | true   arms up and the body swaying, for the crowd
//           'andar'                   walking steps
//           'guarda'                  fists before the chin, elbows at the ribs, chin down, weight a little forward
//           'bote' | { estado: 'bote', k }  a slow jab from the guard with the left arm; k 0..1 is the phase of
//                                     the blow (0 guard, 0.5 arm fully out, 1 back); without k it loops on t
import { mulberry32 } from '../rng.js';

const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));
const mulc = (c, k) => c.map((v) => clamp255(v * k));
const lerpc = (a, b, t) => a.map((v, i) => clamp255(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const PI = Math.PI, sin = Math.sin, cos = Math.cos;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function parseEstado(estado) {
  let k = null;
  if (estado && typeof estado === 'object') { k = typeof estado.k === 'number' ? clamp01(estado.k) : null; estado = estado.estado ?? (estado.excitado ? 'excitado' : 'parado'); }
  if (typeof estado === 'number') return { ex: clamp01(estado), walk: 0, guard: 0, strike: 0 };
  if (estado === true || estado === 'excitado') return { ex: 1, walk: 0, guard: 0, strike: 0 };
  if (estado === 'andar') return { ex: 0, walk: 1, guard: 0, strike: 0 };
  if (estado === 'guarda') return { ex: 0, walk: 0, guard: 1, strike: 0 };
  if (estado === 'bote') return { ex: 0, walk: 0, guard: 1, strike: 1, k };
  return { ex: 0, walk: 0, guard: 0, strike: 0 };
}

/* ------------------------------------------------------------------ geometry kit */
function makeKit(r, rnd) {
  const T = r.THREE;
  const buckets = new Map(); // group -> Map(mat -> { p, n, u })
  const abs = new Map();     // group -> rest position in the standing pose (x, y, z)
  const V = new T.Vector3(), E = new T.Euler();

  function setAbs(g, x, y, z = 0) { abs.set(g, { x, y, z }); }
  /** A joint placed by its rest position in the standing pose; geometry is written in the same frame. */
  function joint(parent, x, y, z = 0) {
    const g = new T.Group(), p = abs.get(parent);
    g.position.set(x - p.x, y - p.y, z - p.z); setAbs(g, x, y, z); parent.add(g); return g;
  }
  function bucket(group, mat) {
    let m = buckets.get(group); if (!m) { m = new Map(); buckets.set(group, m); }
    let b = m.get(mat); if (!b) { b = { p: [], n: [], u: [] }; m.set(mat, b); }
    return b;
  }
  /** One triangle; the normal is flipped to agree with `ref` (outward) when given. */
  function face(group, mat, A, B, C, ua, ub, uc, ref, nn) {
    let n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
    const l = Math.hypot(...n); if (l < 1e-9) return false;
    let na = nn && nn[0], nb = nn && nn[1], nc = nn && nn[2];
    if (ref && n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) { [B, C] = [C, B]; [ub, uc] = [uc, ub]; [nb, nc] = [nc, nb]; n = n.map((x) => -x); }
    n = n.map((x) => x / l);
    const o = abs.get(group), b = bucket(group, mat);
    for (const [P, U, N] of [[A, ua, na], [B, ub, nb], [C, uc, nc]]) { b.p.push(P[0] - o.x, P[1] - o.y, P[2] - o.z); b.n.push(...(N || n)); b.u.push(U[0], U[1]); }
    return true;
  }
  /**
   * A lofted tube around the Y axis: rings [{ y, rx, rz, cx, cz }] in the standing frame, n sides, the front
   * vertex at +Z (u = 0.5), v from the lowest ring (0) to the highest (1). caps: 'both'|'top'|'bottom'|'none'.
   */
  function tube(group, mat, rings, o = {}) {
    const n = o.n || 6, rot = o.rot || 0, caps = o.caps ?? 'both', xf = o.xf;
    const ys = rings.map((q) => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const vOf = (y) => (y1 === y0 ? 0 : (y - y0) / (y1 - y0));
    const pt = (q, i) => { const th = rot - PI + (2 * PI * i) / n; const p = [(q.cx || 0) + sin(th) * q.rx, q.y, (q.cz || 0) + cos(th) * q.rz]; return xf ? xf(p) : p; };
    const ct = (q) => { const p = [q.cx || 0, q.y, q.cz || 0]; return xf ? xf(p) : p; };
    const smooth = !xf && !o.flat && n > 4;
    const nrm = (k, i) => {
      const q = rings[k], th = rot - PI + (2 * PI * i) / n, a = rings[Math.min(k + 1, rings.length - 1)], b = rings[Math.max(k - 1, 0)];
      const dy = a.y - b.y || 1e-6, slope = ((a.rx + a.rz) / 2 - (b.rx + b.rz) / 2) / dy;
      const hx = sin(th) / Math.max(q.rx, 1e-3), hz = cos(th) / Math.max(q.rz, 1e-3), hl = Math.hypot(hx, hz) || 1;
      const v = [hx / hl, -slope, hz / hl], vl = Math.hypot(...v); return v.map((x) => x / vl);
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const q0 = rings[k], q1 = rings[k + 1], c0 = ct(q0), c1 = ct(q1);
      for (let i = 0; i < n; i++) {
        const A = pt(q0, i), B = pt(q0, i + 1), C = pt(q1, i), D = pt(q1, i + 1);
        const ref = [(A[0] + B[0] + C[0] + D[0]) / 4 - (c0[0] + c1[0]) / 2, 0, (A[2] + B[2] + C[2] + D[2]) / 4 - (c0[2] + c1[2]) / 2];
        const u0 = i / n, u1 = (i + 1) / n, va = vOf(q0.y), vb = vOf(q1.y);
        const nA = smooth && nrm(k, i), nB = smooth && nrm(k, i + 1), nC = smooth && nrm(k + 1, i), nD = smooth && nrm(k + 1, i + 1);
        face(group, mat, A, B, C, [u0, va], [u1, va], [u0, vb], ref, smooth && [nA, nB, nC]);
        face(group, mat, B, D, C, [u1, va], [u1, vb], [u0, vb], ref, smooth && [nB, nD, nC]);
      }
    }
    const cap = (q, up) => {
      if (Math.max(q.rx, q.rz) < 0.004) return;
      const P = []; for (let i = 0; i < n; i++) P.push(pt(q, i));
      for (let i = 1; i < n - 1; i++) face(group, mat, P[0], P[i], P[i + 1], [0.5, vOf(q.y)], [i / n, vOf(q.y)], [(i + 1) / n, vOf(q.y)], [0, up, 0]);
    };
    const hi = rings[ys.indexOf(y1)], lo = rings[ys.indexOf(y0)];
    if (caps === 'both' || caps === 'top') cap(hi, 1);
    if (caps === 'both' || caps === 'bottom') cap(lo, -1);
  }
  /** Box (or tapered box: wt/dt at the top) centred at (cx, cy, cz), with an optional Euler tilt. */
  function box(group, mat, cx, cy, cz, w, h, d, o = {}) {
    const wt = o.wt ?? w, dt = o.dt ?? d;
    let xf; if (o.rx || o.ry || o.rz) { E.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); xf = (p) => { V.set(p[0] - cx, p[1] - cy, p[2] - cz).applyEuler(E); return [V.x + cx, V.y + cy, V.z + cz]; }; }
    const s = Math.SQRT1_2;
    tube(group, mat, [{ y: cy - h / 2, rx: w * s, rz: d * s, cx, cz }, { y: cy + h / 2, rx: wt * s, rz: dt * s, cx, cz }], { n: 4, rot: PI / 4, caps: o.caps ?? 'both', xf });
  }
  /** Pyramid from a base centre to a tip. */
  function cone(group, mat, base, tip, rad, n = 4) {
    const a = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]]; const al = Math.hypot(...a); const an = a.map((x) => x / al);
    let up = Math.abs(an[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = [an[1] * up[2] - an[2] * up[1], an[2] * up[0] - an[0] * up[2], an[0] * up[1] - an[1] * up[0]]; const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
    const v = [an[1] * u[2] - an[2] * u[1], an[2] * u[0] - an[0] * u[2], an[0] * u[1] - an[1] * u[0]];
    const P = []; for (let i = 0; i < n; i++) { const th = (2 * PI * i) / n; P.push([0, 1, 2].map((c) => base[c] + (u[c] * cos(th) + v[c] * sin(th)) * rad)); }
    for (let i = 0; i < n; i++) { const A = P[i], B = P[(i + 1) % n]; face(group, mat, A, B, tip, [i / n, 0], [(i + 1) / n, 0], [0.5, 1], [A[0] - base[0], A[1] - base[1], A[2] - base[2]]); }
  }
  /** A flat scrap of cloth, visible from both sides. pts: [[x, y, z], ...] convex, as a fan. */
  function scrap(group, mat, pts, uvs) {
    for (let i = 1; i < pts.length - 1; i++) {
      face(group, mat, pts[0], pts[i], pts[i + 1], uvs[0], uvs[i], uvs[i + 1], null);
      face(group, mat, pts[0], pts[i + 1], pts[i], uvs[0], uvs[i + 1], uvs[i], null);
    }
  }
  /** Where the surface of a lofted tube stands (z) at height y and sideways x; dir +1 front, -1 back. */
  function surf(rings, n, y, x, dir = 1, rot = 0) {
    const rs = rings.slice().sort((a, b) => a.y - b.y); let q = rs[rs.length - 1];
    for (let k = 0; k < rs.length - 1; k++) if (y >= rs[k].y && y <= rs[k + 1].y) {
      const t = (y - rs[k].y) / (rs[k + 1].y - rs[k].y), L = (f) => (rs[k][f] || 0) + ((rs[k + 1][f] || 0) - (rs[k][f] || 0)) * t;
      q = { rx: L('rx'), rz: L('rz'), cx: L('cx'), cz: L('cz') }; break;
    }
    const P = []; for (let i = 0; i <= n; i++) { const th = rot - PI + (2 * PI * i) / n; P.push([(q.cx || 0) + sin(th) * q.rx, (q.cz || 0) + cos(th) * q.rz]); }
    let best = null;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[i + 1];
      if (Math.abs(x2 - x1) < 1e-6 || x < Math.min(x1, x2) - 1e-6 || x > Math.max(x1, x2) + 1e-6) continue;
      const z = z1 + ((z2 - z1) * (x - x1)) / (x2 - x1);
      if ((z - (q.cz || 0)) * dir > 0 && (best === null || z * dir > best * dir)) best = z;
    }
    return best ?? (q.cz || 0) + dir * q.rz;
  }
  /** x of every vertex of the ring polygon at height y (to split a patch along facet edges). */
  function polyX(rings, n, y) {
    const rs = rings.slice().sort((a, b) => a.y - b.y); let q = rs[rs.length - 1];
    for (let k = 0; k < rs.length - 1; k++) if (y >= rs[k].y && y <= rs[k + 1].y) {
      const t = (y - rs[k].y) / (rs[k + 1].y - rs[k].y), L = (f) => (rs[k][f] || 0) + ((rs[k + 1][f] || 0) - (rs[k][f] || 0)) * t;
      q = { rx: L('rx'), cx: L('cx') }; break;
    }
    const xs = []; for (let i = 0; i < n; i++) xs.push((q.cx || 0) + sin(-PI + (2 * PI * i) / n) * q.rx);
    return xs;
  }
  function bake() {
    let tris = 0;
    for (const [g, m] of buckets) for (const [mat, b] of m) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(b.u, 2));
      const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; g.add(mesh); tris += b.p.length / 9;
    }
    buckets.clear(); return tris;
  }

  /* textures */
  function tex(n, paint) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    paint(c.getContext('2d'), n);
    const t = new T.CanvasTexture(c);
    t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace;
    return t;
  }
  const px = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = css(c); g.fillRect(x | 0, y | 0, w, h); };
  /** canvas y from v (0 = bottom of the tube) */
  const cy = (n, v) => Math.round((1 - v) * (n - 1));
  function fillNoise(g, n, base, amt = 0.14) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(g, x, y, mulc(base, 1 + (rnd() - 0.5) * amt));
  }
  function scars(g, n, base, count) {
    for (let i = 0; i < count; i++) {
      const x0 = 2 + ((rnd() * (n - 12)) | 0), y0 = 2 + ((rnd() * (n - 12)) | 0), d = rnd() < 0.5 ? 1 : -1, len = 5 + ((rnd() * 5) | 0);
      for (let s = 0; s < len; s++) px(g, x0 + s, y0 + s * d * (rnd() < 0.7 ? 1 : 0), lerpc(base, [225, 205, 195], 0.55));
      if (rnd() < 0.6) for (let s = 1; s < 4; s++) px(g, x0 + s * 2, y0 + s * 2 * d - 1, mulc(base, 0.6)); // stitches
    }
  }
  /** Textured material: paint(g, n) runs after the grain. */
  function paint(n, base, paintFn, amt = 0.14) {
    const map = tex(n, (g) => { fillNoise(g, n, base, amt); if (paintFn) paintFn(g, n); });
    return r.mat('#ffffff', { map });
  }
  const glow = (color) => r.glow(color);
  const jit = (c, a = 0.1) => c.map((v) => clamp255(v * (1 + (rnd() - 0.5) * a)));
  return { T, r, rnd, abs, setAbs, joint, tube, box, cone, scrap, surf, polyX, face, bake, tex, px, cy, fillNoise, scars, paint, glow, jit };
}

/* ------------------------------------------------------------------ shared painters */
function bark(k, g, n, base, crack) {
  // dry bark peeling: irregular plates (cells taller than wide), cracks where cells meet, loose lighter edges
  const { rnd, px } = k;
  const pts = []; for (let i = 0; i < Math.max(7, n >> 2); i++) pts.push([rnd() * n, rnd() * n, 0.84 + rnd() * 0.3]);
  const id = new Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < pts.length; i++) {
      let dx = Math.abs(x - pts[i][0]); dx = Math.min(dx, n - dx); let dy = Math.abs(y - pts[i][1]); dy = Math.min(dy, n - dy);
      const d = dx * dx * 1.6 + dy * dy * 0.35; if (d < bd) { bd = d; best = i; }
    }
    id[y * n + x] = best;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = id[y * n + x], r = id[y * n + ((x + 1) % n)], d = id[((y + 1) % n) * n + x], l = id[y * n + ((x + n - 1) % n)];
    let col = mulc(base, pts[c][2] * (1 + (rnd() - 0.5) * 0.1));
    if (c !== r || c !== d) col = crack; else if (c !== l) col = mulc(col, 1.2);
    px(g, x, y, col);
  }
}
function stitchTear(k, g, n, base, vFrom, vTo, color) { // paints cloth between two heights, torn at the lower edge
  const { rnd, px, cy } = k;
  const yTop = cy(n, vTo), yBot = cy(n, vFrom);
  for (let x = 0; x < n; x++) {
    const tear = ((rnd() * 3) | 0) + ((x * 7 + 3) % 5 === 0 ? 3 : 0);
    for (let y = yTop; y <= yBot - tear; y++) px(g, x, y, mulc(color, 1 + (rnd() - 0.5) * 0.2));
  }
}
function eyeQuad(k, group, mat, rings, nHead, y, x, w, h, seg = 1) {
  // a glowing patch that follows the facets of the head: seg slices, each at the surface height of its ends
  const e = 0.006, zc = k.surf(rings, nHead, y, x, 1) + e;
  const j = k.joint(group, x, y, zc);
  const cuts = [x - w / 2, x + w / 2, ...k.polyX(rings, nHead, y).filter((v) => v > x - w / 2 + 1e-4 && v < x + w / 2 - 1e-4)].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const xa = cuts[i], xb = cuts[i + 1];
    const za = k.surf(rings, nHead, y, xa, 1) + e, zb = k.surf(rings, nHead, y, xb, 1) + e;
    k.face(j, mat, [xa, y - h / 2, za], [xb, y - h / 2, zb], [xb, y + h / 2, zb], [0, 0], [1, 0], [1, 1], [0, 0, 1]);
    k.face(j, mat, [xa, y - h / 2, za], [xb, y + h / 2, zb], [xa, y + h / 2, za], [0, 0], [1, 1], [0, 1], [0, 0, 1]);
  }
  return j;
}
const RAG_COLORS = [[104, 88, 70], [72, 82, 94], [102, 94, 60], [84, 62, 72], [62, 78, 66], [96, 74, 54]];

/* ------------------------------------------------------------------ the rig */
function rig(k, P) {
  const { T, joint, tube, box, rnd } = k;
  const root = new T.Group();
  const body = new T.Group(); root.add(body); k.setAbs(body, 0, 0, 0);
  const J = { body };
  const [thigh, shin] = P.leg, legLen = thigh + shin;
  const hy = P.hy, ankY = P.ank;
  J.hips = joint(body, 0, P.hipsY);
  J.spine = joint(J.hips, 0, P.spineY);
  J.neck = joint(J.spine, 0, P.neckY, P.neckZ || 0);
  J.head = joint(J.neck, 0, P.headY, P.headZ || 0);
  const M = P.mats;

  tube(J.hips, M.pelvis, P.pelvis, { n: 8, caps: 'bottom' });
  tube(J.spine, M.torso, P.torso, { n: P.torsoN || 8 });
  tube(J.neck, M.skin, P.neck, { n: 6, caps: 'none' });
  tube(J.head, M.head, P.headRings, { n: 8 });

  const L = (s) => (s > 0 ? 'L' : 'R');
  for (const s of [1, -1]) {
    // legs
    const hx = s * P.hx, kneeY = hy - thigh, ankleY = hy - legLen;
    const [rt, rk, rc, ra] = P.lr, z = P.lz || 1;
    const hip = J['hip' + L(s)] = joint(J.hips, hx, hy);
    const knee = J['knee' + L(s)] = joint(hip, hx, kneeY);
    const ankle = J['ankle' + L(s)] = joint(knee, hx, ankleY);
    tube(hip, M.thigh, [{ y: hy + rt * 0.35, rx: rt * 0.75, rz: rt * 0.75 * z, cx: hx }, { y: hy - thigh * 0.1, rx: rt, rz: rt * z, cx: hx }, { y: kneeY, rx: rk, rz: rk * z, cx: hx }], { n: 6 });
    tube(knee, M.shin, [{ y: kneeY, rx: rk * 0.92, rz: rk * 0.92 * z, cx: hx }, { y: kneeY - shin * 0.2, rx: rc, rz: rc * z, cx: hx }, { y: ankleY, rx: ra, rz: ra * z, cx: hx }], { n: 6 });
    const [fw, fl, fb] = P.foot;
    box(ankle, M.foot, hx, ankleY - ankY / 2 + 0.005, (fl - fb) / 2, fw, ankY, fl + fb, { wt: fw * 0.85, dt: (fl + fb) * 0.8 });

    // arms
    const sx = s * P.shX;
    const [U, F] = s > 0 ? P.arm : (P.armR || P.arm), [rs, re, rw] = P.ar, az = P.az || 1;
    const shY = P.shY + (s > 0 ? (P.shDy || 0) : 0), elY = shY - U, wrY = elY - F;
    const sh = J['shoulder' + L(s)] = joint(J.spine, sx, shY, P.shZ || 0);
    const el = J['elbow' + L(s)] = joint(sh, sx, elY, P.shZ || 0);
    const wr = J['wrist' + L(s)] = joint(el, sx, wrY, P.shZ || 0);
    const cz = P.shZ || 0;
    tube(sh, M.upper, [{ y: shY + rs * 0.55, rx: rs * 0.8, rz: rs * 0.8 * az, cx: sx, cz }, { y: shY - U * 0.1, rx: rs, rz: rs * az, cx: sx, cz }, { y: elY, rx: re, rz: re * az, cx: sx, cz }], { n: 6 });
    tube(el, M.fore, [{ y: elY, rx: re * 0.93, rz: re * 0.93 * az, cx: sx, cz }, { y: elY - F * 0.18, rx: re * 0.97, rz: re * 0.97 * az, cx: sx, cz }, { y: wrY, rx: rw, rz: rw * az, cx: sx, cz }], { n: 6, caps: 'top' });
    P.hand(k, wr, { side: s, x: sx, wy: wrY, z: cz, mats: M });
  }
  if (P.extra) P.extra(k, J, rnd);

  // rags of human clothes hung from the hips (and wherever the type wants)
  const rags = [];
  for (const g of P.rags || []) {
    const rg = joint(typeof g.parent === 'string' ? J[g.parent] : (g.parent || J.hips), g.x, g.y, g.z);
    const w = g.w, h = g.h, m = g.mat;
    k.scrap(rg, m, [[g.x - w / 2, g.y, g.z], [g.x + w / 2, g.y, g.z], [g.x + w * 0.42, g.y - h * 0.8, g.z], [g.x + w * 0.1, g.y - h, g.z], [g.x - w * 0.25, g.y - h * 0.7, g.z], [g.x - w * 0.45, g.y - h * 0.9, g.z]],
      [[0, 1], [1, 1], [0.9, 0.2], [0.55, 0], [0.3, 0.3], [0.05, 0.1]]);
    rags.push({ g: rg, ph: rnd() * 6.28, tilt: g.tilt || 0 });
  }

  const tris = k.bake();
  const ph0 = rnd() * 6.28, ph1 = rnd() * 6.28;
  const G = P.gait, eyes = P.eyes || [], sc = { v: 1 }, armLen = P.arm[0] + P.arm[1];

  const qa = new T.Quaternion(), va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3(), DOWN = new T.Vector3(0, -1, 0);
  function solveArm(sh, el, S0, Tg, U, F, pole) {
    const d = va.set(Tg[0] - S0[0], Tg[1] - S0[1], Tg[2] - S0[2]);
    let L = d.length(); L = Math.max(Math.abs(U - F) + 0.02, Math.min(U + F - 0.005, L)); d.normalize();
    const a = (U * U - F * F + L * L) / (2 * L), h = Math.sqrt(Math.max(0, U * U - a * a));
    vb.set(...pole); vb.addScaledVector(d, -vb.dot(d)).normalize();
    const E = vc.copy(d).multiplyScalar(a).addScaledVector(vb, h); // elbow relative to the shoulder
    sh.quaternion.setFromUnitVectors(DOWN, E.clone().normalize());
    const f = new T.Vector3(d.x * L - E.x, d.y * L - E.y, d.z * L - E.z).normalize().applyQuaternion(qa.copy(sh.quaternion).invert());
    el.quaternion.setFromUnitVectors(DOWN, f);
  }

  function update(t, estado) {
    const { ex, walk, guard, strike, k: kk0 } = parseEstado(estado);
    const idle = (1 - ex) * (1 - walk), wex = ex * (1 - walk);
    const S = (a) => sin(a);
    // idle
    const br = S(t * 1.5 + ph0);
    const sh = S(t * 0.33 + ph1) * idle; // weight shift: +1 on the left leg
    const look = P.look || 0.5;
    // walking phase
    const ph = t * G.w + ph0, sw = S(ph), cw = cos(ph);
    // excited bounce: knees flex in time with the sway
    const bw = t * 4.4 + ph0, bounce = 0.5 + 0.5 * S(bw * 2), a = wex * 0.22 * bounce;
    // hips, legs
    J.hips.rotation.z = 0.035 * sh + wex * 0.09 * S(bw);
    J.hips.rotation.y = -walk * G.tw * sw;
    J.hips.position.x = 0.04 * sh;
    J.spine.rotation.z = -J.hips.rotation.z * 0.8 - wex * 0.06 * S(bw + 0.9);
    J.spine.rotation.y = walk * G.tw * sw + idle * 0.05 * S(t * 0.4 + ph1);
    J.spine.rotation.x = (P.breathLean || 0.012) * br * (1 - walk) + walk * 0.04 + wex * 0.06 * S(bw * 2);
    const relaxL = Math.max(0, -sh), relaxR = Math.max(0, sh);
    for (const [s, n, relax] of [[1, 'L', relaxL], [-1, 'R', relaxR]]) {
      const swing = -G.A * walk * (s > 0 ? sw : -sw);
      const lift = G.K * walk * Math.max(0, s > 0 ? cw : -cw);
      J['hip' + n].rotation.x = swing - a - relax * 0.12;
      J['hip' + n].rotation.z = -J.hips.rotation.z * 0.9 + (s > 0 ? -1 : 1) * 0.015 * walk;
      J['knee' + n].rotation.x = lift + 2 * a + relax * 0.28 + walk * 0.1;
      J['ankle' + n].rotation.x = -(J['hip' + n].rotation.x + J['knee' + n].rotation.x) * 0.9;
      // arms
      const armSwing = G.B * walk * (s > 0 ? sw : -sw);
      const raise = wex * (2.55 + 0.4 * S(bw * 2 + (s > 0 ? 0 : 1.6)));
      const sag = 0.05 * S(t * 1.1 + (s > 0 ? 0 : 2) + ph1) * idle;
      const base = P.armOut || 0;
      const A = J['shoulder' + n];
      A.rotation.x = armSwing + sag - wex * 0.25 + (P.armForward || 0) * idle;
      A.rotation.z = s * (base * (1 - ex) + raise);
      J['elbow' + n].rotation.x = -(P.elbowIdle || 0.1) * (1 - ex) - walk * 0.18 * (1 + (s > 0 ? -sw : sw)) * 0.5 - wex * (0.35 + 0.3 * S(bw * 2 + (s > 0 ? 0.5 : 2.1)));
      const w = J['wrist' + n];
      w.rotation.x = (P.fidget || 0) * idle * S(t * 7 + (s > 0 ? 0 : 1.7) + ph1) - wex * 0.2 * S(bw * 2);
      w.rotation.z = wex * 0.25 * S(bw * 2 + 1) * s;
    }
    // the body lowers as the legs bend or spread so that the feet stay on the ground
    const spread = walk * (1 - cos(G.A * Math.abs(sw))) * legLen * 0.9;
    const bend = (legLen) * (1 - cos(a)) + wex * 0.0;
    body.position.y = -(spread + bend) * sc.v;
    // head and neck
    const scan = idle * look;
    J.neck.rotation.y = 0.5 * scan * S(t * 0.42 + ph1) * (0.6 + 0.4 * S(t * 0.13)) + wex * 0.3 * S(bw);
    J.neck.rotation.x = idle * 0.03 * br + wex * 0.12 * S(bw * 2);
    J.head.rotation.y = 0.35 * scan * S(t * 0.42 + ph1 - 0.5) + walk * 0.05 * sw;
    J.head.rotation.x = idle * 0.04 * S(t * 0.27 + ph0) - wex * 0.18 + walk * 0.02;
    J.head.rotation.z = wex * 0.1 * S(bw + 0.4) + idle * 0.03 * S(t * 0.2);
    if (P.chest) { const b = br * P.chestAmp * (1 - walk * 0.4) + wex * P.chestAmp * 0.7 * S(t * 7); P.chest.scale.set(1 + b, 1 + b * 0.55, 1 + b * 0.9); }
    else { const b = br * 0.012; J.spine.scale.set(1 + b, 1 + b * 0.6, 1 + b); }
    // blink
    const bl = ((t * 0.37 + ph1) % 1) < 0.045 ? 0.15 : 1;
    for (const e of eyes) e.scale.y = bl;
    for (const rg of rags) rg.g.rotation.x = rg.tilt + 0.12 * S(t * 1.3 + rg.ph) + walk * 0.3 * sw * 0.6 + wex * 0.12 * S(bw + rg.ph);
    if (guard) {
      // guard: the long arms of a creature bend more at the elbow so the fists still land before the chin
      const bend = Math.min(2.6, 2.1 + armLen * 0.28), sg = S(t * 2.2 + ph0);
      const e = strike ? Math.sin(Math.PI * clamp01(kk0 ?? (t * 0.4) % 1)) : 0;
      J.hips.position.x = 0; J.hips.rotation.z = 0.03 * sg; J.hips.rotation.y = 0;
      J.spine.rotation.x = 0.06 + 0.02 * sg + 0.08 * e; J.spine.rotation.z = 0.02 * sg; J.spine.rotation.y = -0.4 * e;
      J.neck.rotation.x = 0.12; J.neck.rotation.y = 0; J.head.rotation.x = 0.28; J.head.rotation.y = 0.4 * e; J.head.rotation.z = 0;
      // arms by two-bone IK in the rest frame of the spine: each wrist goes 26 cm in front of the head, near the
      // chin, the two hands close together and the elbows down by the ribs; in the blow the left wrist goes out.
      const hd = k.abs.get(J.head);
      for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
        const punch = s > 0 ? e : 0, so = k.abs.get(J['shoulder' + n]);
        const [U, F] = s > 0 ? P.arm : (P.armR || P.arm);
        const tg = [s * 0.1, hd.y + 0.02, hd.z + 0.26 + 0.015 * sg], tp = [so.x * 0.5, so.y - 0.03, so.z + 0.96 * (U + F)];
        const Tg = tg.map((v, i) => v + (tp[i] - v) * punch);
        const S0 = [so.x, so.y, so.z];
        solveArm(J['shoulder' + n], J['elbow' + n], S0, Tg, U, F, [s * 0.25, -1, -0.5]);
        // the hand folds into a fist: fingers toward the face, then forward in the blow
        const hdir = new T.Vector3(-s * 0.15 * (1 - punch), -0.6 + 0.5 * punch, -0.6 + 1.6 * punch).normalize();
        qa.copy(J['shoulder' + n].quaternion).multiply(J['elbow' + n].quaternion).invert();
        J['wrist' + n].quaternion.setFromUnitVectors(DOWN, hdir.applyQuaternion(qa));
      }
      J.hipL.rotation.x = -0.3 - 0.25 * e; J.hipL.rotation.z = 0; J.kneeL.rotation.x = 0.35 + 0.15 * e; J.ankleL.rotation.x = -0.05;
      J.hipR.rotation.x = 0.18; J.hipR.rotation.z = 0; J.kneeR.rotation.x = 0.28 + 0.1 * e; J.ankleR.rotation.x = -0.1;
      const drop = legLen * 0.07 + 0.03 * Math.abs(sg);
      body.position.y = -drop * sc.v;
    }
    if (P.tick) P.tick(t, { idle, ex: wex, walk, br, ph, sw, cw, bw });
  }
  return { root, update, tris, joints: J, height: P.height, sc };
}

/* ------------------------------------------------------------------ hands */
function hand(k, g, o) {
  const { box, tube } = k;
  const { side: s, x, wy, z, mat } = o;
  box(g, o.palmMat || mat, x, wy - o.ph / 2, z, o.pw, o.ph, o.pd, { wt: o.pw * 0.9, dt: o.pd * 0.95, caps: 'bottom' });
  const y0 = wy - o.ph + 0.008, nf = o.nf;
  for (let i = 0; i < nf; i++) {
    const fx = x + (i - (nf - 1) / 2) * (o.pw / nf) * 1.0 * (o.spread || 1), curl = (o.curl || 0.03) * (0.8 + 0.4 * ((i * 7) % 3) / 2), fl = o.fl * (i === 1 || (i === 2 && nf > 3) ? 1.08 : 0.92);
    tube(g, mat, [{ y: y0, rx: o.fr, rz: o.fr, cx: fx, cz: z }, { y: y0 - fl, rx: o.fr * 0.3, rz: o.fr * 0.3, cx: fx, cz: z + curl }], { n: o.fn || 3, caps: 'none' });
  }
  // thumb on the inner side
  const tx = x - s * o.pw / 2, ty = wy - o.ph * 0.25, tl = o.fl * 0.55;
  tube(g, mat, [{ y: ty, rx: o.fr * 1.1, rz: o.fr * 1.1, cx: tx, cz: z + 0.005 }, { y: ty - tl * 0.8, rx: o.fr * 0.35, rz: o.fr * 0.35, cx: tx - s * tl * 0.45, cz: z + 0.04 }], { n: o.fn || 3, caps: 'none' });
}

/* ------------------------------------------------------------------ CASCA: tall, thin, dry bark */
function buildCasca(k) {
  const { rnd, jit, paint, tube, box, cone, T } = k;
  const kl = rnd.range(0.95, 1.06), kw = rnd.range(0.92, 1.1), ka = rnd.range(0.95, 1.08), kb = rnd.range(0.93, 1.07);
  const base = mulc(rnd.pick([[152, 158, 150], [144, 152, 148], [158, 162, 156], [148, 154, 152]]), rnd.range(0.94, 1.06)); // pale grey-green only
  const crack = mulc(base, 0.4), dark = mulc(base, 0.7);
  const nScar = rnd.pick([0, 1, 2, 3]);
  const skinPaint = (cnt, joints) => (g, n) => { bark(k, g, n, base, crack); if (joints) for (const y of [0, n - 1]) k.px(g, 0, y, crack, n, 1); k.scars(g, n, base, cnt); };
  const mats = {
    skin: paint(32, base, skinPaint(0)),
    torso: paint(64, base, skinPaint(nScar)),
    pelvis: paint(32, mulc(base, 0.9), skinPaint(0)),
    thigh: paint(32, base, skinPaint(nScar > 2 ? 1 : 0, true)),
    shin: paint(32, mulc(base, 0.95), skinPaint(0, true)),
    foot: paint(32, dark, (g, n) => bark(k, g, n, dark, mulc(dark, 0.5))),
    upper: paint(32, base, skinPaint(nScar > 1 ? 1 : 0, true)),
    fore: paint(32, mulc(base, 0.96), skinPaint(0, true)),
    hand: paint(32, mulc(base, 0.85), (g, n) => { bark(k, g, n, mulc(base, 0.85), crack); }),
    plate: paint(32, mulc(base, 0.78), (g, n) => { bark(k, g, n, mulc(base, 0.78), mulc(base, 0.32)); }),
  };
  const slit = [238, 228, 150];
  mats.head = paint(64, mulc(base, 1.04), (g, n) => {
    bark(k, g, n, mulc(base, 1.04), crack);
    // the face: smooth band with two pale slits, no mouth, no nose
    const u0 = 24, u1 = 40;
    for (let y = k.cy(n, 0.74); y <= k.cy(n, 0.4); y++) for (let x = u0; x < u1; x++) k.px(g, x, y, mulc(base, 0.92 + 0.05 * rnd()));
    const ey = k.cy(n, 0.62);
    for (const x of [27, 36]) { k.px(g, x, ey - 3, slit, 1, 8); k.px(g, x - 1, ey - 3, mulc(base, 0.55), 1, 8); k.px(g, x + 1, ey - 3, mulc(base, 0.55), 1, 8); }
    k.scars(g, n, base, nScar > 1 ? 1 : 0);
  });
  mats.cloth = paint(16, rnd.pick([[104, 88, 70], [72, 82, 94], [96, 74, 54], [96, 90, 100]]), (g, n) => { k.px(g, 0, 0, [40, 36, 32], n, 1); }, 0.3);

  const thigh = 0.62 * kl, shin = 0.57 * kl, ank = 0.09, hy = thigh + shin + ank;
  const shY = hy + 0.8 * kb, neckY = shY + 0.04, headY = shY + 0.2, hw = 0.13 * kw;
  const R = (y, rx, rz, cz = 0) => ({ y, rx, rz, cz });
  const hr = (y, rx, rz, cz, cx) => ({ y, rx, rz, cz, cx });
  // flat, lopsided head: wide forehead, narrow chin, tilted to one side and pushed forward
  const headRings = [hr(headY - 0.03, 0.05 * kw, 0.05, 0.05, 0.0), hr(headY + 0.05, 0.07 * kw, 0.075, 0.08, 0.004), hr(headY + 0.15, 0.105 * kw, 0.092, 0.115, 0.014), hr(headY + 0.25, 0.122 * kw, 0.088, 0.13, 0.026), hr(headY + 0.31, 0.098 * kw, 0.066, 0.13, 0.036), hr(headY + 0.345, 0.045, 0.036, 0.125, 0.042)];
  const tx = 0.33 * kw;
  const P = {
    height: headY + 0.345, hy, leg: [thigh, shin], ank, hx: hw * 1.15, lr: [0.125 * kw, 0.078 * kw, 0.085 * kw, 0.06 * kw], lz: 0.95, foot: [0.11 * kw, 0.3, 0.05],
    hipsY: hy + 0.06, spineY: hy + 0.13, neckY, headY, neckZ: 0.03, headZ: 0.05, shY, shX: tx, arm: [0.56 * ka, 0.58 * ka], armR: [0.52 * ka, 0.54 * ka], shDy: 0.07, ar: [0.08 * kw, 0.06 * kw, 0.047 * kw], az: 0.95,
    pelvis: [R(hy - 0.12, 0.19 * kw, 0.12), R(hy + 0.0, 0.215 * kw, 0.13), R(hy + 0.14, 0.19 * kw, 0.115)],
    torso: [R(hy + 0.1, 0.19 * kw, 0.115), R(hy + 0.35, 0.185 * kw, 0.125), R(hy + 0.6 * kb, 0.23 * kw, 0.14), R(shY + 0.02, 0.27 * kw, 0.13), R(shY + 0.08, 0.12 * kw, 0.08)],
    neck: [R(shY + 0.03, 0.06, 0.06, 0.01), R(headY - 0.02, 0.05, 0.05, 0.04)],
    headRings, mats,
    hand: (kk, g, o) => hand(kk, g, { ...o, mat: mats.hand, pw: 0.09 * kw, ph: 0.09, pd: 0.045, nf: 4, fl: 0.3, fr: 0.021, curl: 0.05, spread: 0.95, fn: 4 }),
    gait: { A: 0.44, K: 0.75, B: 0.38, w: 4.3, tw: 0.08 }, look: 0.4, chestAmp: 0, elbowIdle: 0.08,
  };
  P.pelvisMat = mats.pelvis;
  P.rags = [];
  const nr = rnd.pick([0, 1, 1, 2]);
  for (let i = 0; i < nr; i++) P.rags.push({ x: (rnd() - 0.5) * 0.16, y: hy + 0.1, z: rnd() < 0.5 ? 0.1 : -0.1, w: 0.16, h: 0.28 + rnd() * 0.18, mat: mats.cloth });
  P.extra = (kk, J) => {
    // loose plates of dry bark: breastbone, upper back, shins
    for (const s of [1, -1]) {
      kk.box(J['knee' + (s > 0 ? 'L' : 'R')], mats.plate, s * hw, hy - thigh - shin * 0.45, 0.06, 0.07, 0.3, 0.035, { wt: 0.04, rx: -0.08, rz: s * 0.06 });
    }
    kk.box(J.spine, mats.plate, 0, hy + 0.5, kk.surf(P.torso, 8, hy + 0.5, 0) + 0.015, 0.15, 0.22, 0.035, { wt: 0.1, rx: -0.1 });
    kk.box(J.spine, mats.plate, 0.0, hy + 0.55, kk.surf(P.torso, 8, hy + 0.55, 0, -1) - 0.015, 0.16, 0.28, 0.035, { wt: 0.11, rx: 0.1 });
  };
  const eyes = P.eyes = [];
  const slitGlow = k.r.glow('#d8cc70', { emissive: 0.6, fogged: 0.3 });
  const prevExtra = P.extra;
  P.extra = (kk, J) => {
    prevExtra(kk, J);
    // the pale slits glow faintly so they still read at night
    for (const x of [-1, 1]) eyes.push(eyeQuad(kk, J.head, slitGlow, headRings, 8, headY + 0.2, x * 0.05 * kw, 0.014, 0.07));
  };
  return rig(k, P);
}

/* ------------------------------------------------------------------ FOLE: huge, hunched, breathing bellows */
function buildFole(k) {
  const { rnd, jit, paint, tube, box, cone, joint, T } = k;
  const kl = rnd.range(0.95, 1.05), kw = rnd.range(0.94, 1.08), kb = rnd.range(0.95, 1.05);
  const base = mulc(rnd.pick([[158, 130, 126], [150, 126, 122], [164, 132, 118], [144, 114, 100]]), rnd.range(0.94, 1.06)); // grey-pink to flesh-brown only
  const bone = jit([214, 202, 168], 0.1);
  const nScar = rnd.pick([1, 2, 3, 4]);
  const wrinkle = (g, n) => { for (let i = 0; i < 9; i++) { const y = 3 + ((rnd() * (n - 6)) | 0); const x = (rnd() * n) | 0; k.px(g, x, y, mulc(base, 0.8), 3 + ((rnd() * 5) | 0), 1); } k.scars(g, n, base, nScar); };
  const mats = {
    skin: paint(32, base, wrinkle),
    pelvis: paint(32, mulc(base, 0.9), wrinkle),
    torso: paint(64, mulc(base, 0.96), wrinkle),
    chest: paint(64, mulc(base, 1.02), (g, n) => {
      // leather with short curved creases that follow the chest as it swells
      for (let i = 0; i < 26; i++) { const x = (rnd() * n) | 0, y = (rnd() * n) | 0, w = 6 + ((rnd() * 10) | 0); for (let q = 0; q < w; q++) k.px(g, (x + q) % n, y + (q < w / 2 ? 0 : 1), mulc(base, 0.62)); k.px(g, x, y + 2, mulc(base, 1.1), w, 1); }
      k.scars(g, n, base, nScar);
    }),
    thigh: paint(32, base, wrinkle), shin: paint(32, mulc(base, 0.95), wrinkle),
    foot: paint(32, mulc(base, 0.7), null), upper: paint(32, base, wrinkle), fore: paint(32, mulc(base, 0.95), wrinkle),
    hand: paint(32, mulc(base, 0.9), null),
    bone: paint(32, bone, (g, n) => { for (let i = 0; i < 4; i++) k.px(g, (rnd() * n) | 0, (rnd() * n * 0.7) | 0, mulc(bone, 0.55), 1, 5); }),
  };
  mats.head = paint(64, mulc(base, 1.02), (g, n) => {
    for (const x of [22, 36]) k.px(g, x - 2, k.cy(n, 0.6), mulc(base, 0.3), 10, 2); // thin eye lines
    k.px(g, 25, k.cy(n, 0.22), mulc(base, 0.38), 14, 2); k.px(g, 23, k.cy(n, 0.25), mulc(base, 0.55), 2, 2); k.px(g, 39, k.cy(n, 0.25), mulc(base, 0.55), 2, 2);
    k.scars(g, n, base, nScar > 2 ? 2 : 1);
  });
  mats.cloth = paint(16, rnd.pick([[104, 88, 70], [72, 82, 94], [96, 74, 54], [96, 90, 100]]), (g, n) => { k.px(g, 0, 0, [40, 36, 32], n, 1); }, 0.3);
  const eyeMat = k.r.mat('#0a0a0e', { fogged: 1 });

  const thigh = 0.46 * kl, shin = 0.42 * kl, ank = 0.08, hy = thigh + shin + ank;
  const shY = hy + 1.0, headY = shY + 0.12;
  const R = (y, rx, rz, cz = 0) => ({ y, rx, rz, cz });
  const chestJ = { y: hy + 0.45 };
  const chestRings = [R(hy + 0.45, 0.42 * kw, 0.32, 0.07), R(hy + 0.6, 0.5 * kw, 0.39, 0.11), R(hy + 0.72, 0.48 * kw, 0.37, 0.15), R(hy + 0.84, 0.53 * kw, 0.4, 0.2), R(hy + 0.96, 0.5 * kw, 0.38, 0.25), R(hy + 1.08, 0.5 * kw, 0.3, 0.24), R(hy + 1.17, 0.36 * kw, 0.22, 0.26), R(hy + 1.24, 0.18 * kw, 0.12, 0.27)];
  const headRings = [R(headY, 0.16 * kw, 0.16, 0.5), R(headY + 0.1, 0.21 * kw, 0.2, 0.54), R(headY + 0.25, 0.21 * kw, 0.21, 0.54), R(headY + 0.37, 0.11 * kw, 0.12, 0.51)];
  const torso = [R(hy + 0.12, 0.29 * kw, 0.21, 0.02), R(hy + 0.3, 0.33 * kw, 0.24, 0.05), R(hy + 0.46, 0.36 * kw, 0.28, 0.07)];
  const eyes = [];
  const P = {
    height: headY + 0.37, hy, leg: [thigh, shin], ank, hx: 0.2 * kw, lr: [0.155 * kw, 0.11 * kw, 0.115 * kw, 0.08 * kw], lz: 1.0, foot: [0.2 * kw, 0.36, 0.06],
    hipsY: hy + 0.06, spineY: hy + 0.2, neckY: shY + 0.02, headY, neckZ: 0.4, headZ: 0.52, shY, shX: 0.62 * kw, shZ: 0.24,
    arm: [0.48, 0.5], ar: [0.14 * kw, 0.105 * kw, 0.085 * kw], az: 1.0,
    pelvis: [R(hy - 0.16, 0.26 * kw, 0.19), R(hy + 0.02, 0.3 * kw, 0.21), R(hy + 0.2, 0.3 * kw, 0.22, 0.02)],
    torso, neck: [R(shY + 0.0, 0.14, 0.13, 0.42), R(headY, 0.13, 0.13, 0.5)],
    headRings, mats: { ...mats }, eyes,
    hand: (kk, g, o) => hand(kk, g, { ...o, mat: mats.hand, pw: 0.15 * kw, ph: 0.15, pd: 0.1, nf: 4, fl: 0.18, fr: 0.03, curl: 0.05, fn: 3 }),
    gait: { A: 0.38, K: 0.8, B: 0.25, w: 3.6, tw: 0.06 }, look: 0.3, chestAmp: 0.17, breathLean: 0.02, elbowIdle: 0.18, armOut: 0.14,
  };
  P.mats.torso = mats.torso;
  P.extra = (kk, J) => {
    const chest = P.chest = joint(J.spine, 0, hy + 0.45, 0);
    kk.tube(chest, mats.chest, chestRings, { n: 8 });
    // hump behind the neck
    const humpRings = [R(hy + 0.8, 0.3 * kw, 0.2, -0.08), R(hy + 1.2, 0.3 * kw, 0.21, -0.02), R(hy + 1.42, 0.16 * kw, 0.13, 0.08)];
    kk.tube(chest, mats.torso, humpRings, { n: 6 });
    // knots of bone along the spine
    for (const [y, h] of [[hy + 0.58, 0.07], [hy + 0.78, 0.09], [hy + 1.0, 0.1], [hy + 1.2, 0.09], [hy + 1.36, 0.06]]) {
      const zz = y > hy + 0.8 ? kk.surf(humpRings, 6, y, 0, -1) : kk.surf(chestRings, 8, y, 0, -1);
      kk.cone(chest, mats.torso, [0, y, zz + 0.03], [0, y + h * 0.3, zz - h * 0.45], 0.07, 5);
    }
    // eyes: two sunk embers, no brow
    for (const x of [-1, 1]) eyes.push(eyeQuad(kk, J.head, eyeMat, headRings, 8, headY + 0.2, x * 0.06 * kw + 0, 0.12, 0.016));
    P.eyes = eyes;
  };
  P.rags = [];
  const nr = rnd.pick([0, 1, 2, 2]);
  for (let i = 0; i < nr; i++) P.rags.push({ x: (i % 2 ? -1 : 1) * 0.26, y: hy + 0.2, z: i % 2 ? -0.12 : 0.1, w: 0.2, h: 0.3 + rnd() * 0.2, mat: mats.cloth });
  const out = rig(k, P);
  return out;
}

/* ------------------------------------------------------------------ VIGIA: slender, long neck, one lens band */
function buildVigia(k) {
  const { rnd, jit, paint, tube, box, T } = k;
  const kl = rnd.range(0.95, 1.05), kw = rnd.range(0.92, 1.08), kn = rnd.range(0.92, 1.1);
  const base = mulc(rnd.pick([[140, 150, 162], [136, 150, 156], [150, 152, 152], [144, 154, 148]]), rnd.range(0.94, 1.06)); // grey-blue, never lilac
  const cloth = jit(rnd.pick([[96, 82, 66], [70, 80, 92], [110, 96, 60], [84, 62, 72]]), 0.12);
  const cloth2 = jit(rnd.pick([[60, 70, 84], [86, 78, 64], [70, 60, 66]]), 0.12);
  const nScar = rnd.pick([0, 1, 2]);
  const veins = (g, n) => { for (let i = 0; i < 5; i++) { let x = (rnd() * n) | 0, y = (rnd() * n) | 0; for (let s = 0; s < 8; s++) { k.px(g, x & (n - 1), y & (n - 1), mulc(base, 0.78)); y++; x += rnd() < 0.4 ? 1 : 0; } } k.scars(g, n, base, nScar); };
  const trim = (c) => (g, n) => { k.px(g, 0, 0, mulc(c, 0.6), n, 1); for (let i = 0; i < 6; i++) k.px(g, (rnd() * n) | 0, (rnd() * n) | 0, mulc(c, 0.72), 2, 1); };
  const mats = {
    skin: paint(32, base, veins),
    // jacket from the shoulders to the waist, skin above the collar and under the hem
    torso: paint(64, base, (g, n) => {
      veins(g, n);
      stitchTear(k, g, n, cloth, 0.12, 0.9, cloth);
      for (let y = 0; y < n; y += 9) k.px(g, 0, y, mulc(cloth, 0.85), n, 1);
      for (let i = 0; i < 4; i++) k.px(g, (rnd() * n) | 0, (rnd() * n * 0.8) | 0, mulc(cloth, 0.7), 3, 4);
      k.px(g, 31, k.cy(n, 0.9), mulc(cloth, 0.6), 2, 24); // zipper-like seam at the front
    }),
    pelvis: paint(32, cloth2, trim(cloth2)),
    thigh: paint(32, cloth2, (g, n) => { stitchTear(k, g, n, cloth2, 0.05, 1, cloth2); trim(cloth2)(g, n); }),
    shin: paint(32, base, veins), foot: paint(32, mulc(cloth2, 0.55), null),
    upper: paint(32, base, (g, n) => { veins(g, n); stitchTear(k, g, n, cloth, 0.35, 1.0, cloth); }),
    fore: paint(32, base, veins), hand: paint(32, mulc(base, 0.95), null),
  };
  const lensDark = mulc(base, 0.3);
  mats.head = paint(64, mulc(base, 1.03), (g, n) => {
    veins(g, n);
    for (let y = k.cy(n, 0.58); y <= k.cy(n, 0.4); y++) for (let x = 14; x < 50; x++) k.px(g, x, y, lensDark); // socket of the lens
    k.px(g, 27, k.cy(n, 0.2), mulc(base, 0.45), 10, 1);
  });
  mats.cloth = paint(16, cloth, trim(cloth), 0.3);
  mats.cloth2 = paint(16, cloth2, trim(cloth2), 0.3);
  const lens = k.glow('#b8ffe0');

  const thigh = 0.5 * kl, shin = 0.46 * kl, ank = 0.09, hy = thigh + shin + ank;
  const shY = hy + 0.55, neckLen = 0.36 * kn, headY = shY + 0.04 + neckLen;
  const R = (y, rx, rz, cz = 0) => ({ y, rx, rz, cz });
  const headRings = [R(headY, 0.04, 0.045, 0.01), R(headY + 0.07, 0.075 * kw, 0.08, 0.01), R(headY + 0.17, 0.085 * kw, 0.09, 0.012), R(headY + 0.27, 0.07 * kw, 0.075, 0.01), R(headY + 0.31, 0.025, 0.03, 0.01)];
  const eyes = [];
  const P = {
    height: headY + 0.31, hy, leg: [thigh, shin], ank, hx: 0.1 * kw, lr: [0.07 * kw, 0.048 * kw, 0.055 * kw, 0.04 * kw], lz: 1, foot: [0.09 * kw, 0.27, 0.05],
    hipsY: hy + 0.06, spineY: hy + 0.13, neckY: shY + 0.04, headY, shY, shX: 0.215 * kw, arm: [0.5, 0.5], ar: [0.05 * kw, 0.04 * kw, 0.033 * kw], az: 0.95,
    pelvis: [R(hy - 0.12, 0.135 * kw, 0.09), R(hy + 0.0, 0.15 * kw, 0.095), R(hy + 0.14, 0.13 * kw, 0.085)],
    torso: [R(hy + 0.1, 0.12 * kw, 0.08), R(hy + 0.28, 0.125 * kw, 0.085), R(hy + 0.45, 0.16 * kw, 0.095), R(shY + 0.02, 0.19 * kw, 0.09), R(shY + 0.08, 0.075 * kw, 0.055)],
    neck: [R(shY + 0.03, 0.055, 0.055), R(shY + 0.2, 0.038, 0.04, 0.006), R(headY, 0.037, 0.04, 0.012)],
    headRings, mats, eyes,
    hand: (kk, g, o) => hand(kk, g, { ...o, mat: mats.hand, pw: 0.075 * kw, ph: 0.08, pd: 0.04, nf: 4, fl: 0.2, fr: 0.012, curl: 0.03 }),
    gait: { A: 0.44, K: 0.8, B: 0.36, w: 4.6, tw: 0.08 }, look: 1.0, chestAmp: 0, elbowIdle: 0.12,
    tick: (t) => {},
  };
  P.extra = (kk, J) => {
    const y = headY + 0.15;
    eyes.push(eyeQuad(kk, J.head, lens, headRings, 8, y, 0, 0.17 * kw, 0.045, 8));
  };
  P.rags = [
    { x: -0.07, y: hy + 0.12, z: 0.1, w: 0.14, h: 0.32 + rnd() * 0.1, mat: mats.cloth2 },
    { x: 0.09, y: hy + 0.12, z: -0.09, w: 0.16, h: 0.42 + rnd() * 0.1, mat: mats.cloth },
  ];
  if (rnd() < 0.7) P.rags.push({ x: 0.0, y: hy + 0.12, z: -0.1, w: 0.12, h: 0.3, mat: mats.cloth2 });
  return rig(k, P);
}

/* ------------------------------------------------------------------ MESTRE: thin, nervous, arms past the knees */
function buildMestre(k) {
  const { rnd, jit, paint, tube, box, T } = k;
  const kl = rnd.range(0.95, 1.05), kw = rnd.range(0.92, 1.08), ka = rnd.range(0.95, 1.06);
  const base = mulc(rnd.pick([[132, 154, 150], [128, 150, 152], [140, 156, 148], [134, 152, 156]]), rnd.range(0.94, 1.06)); // teal grey, never lilac
  const wrap = jit(rnd.pick([[214, 200, 168], [200, 190, 160], [188, 176, 150]]), 0.08);
  const nScar = rnd.pick([1, 2, 3]);
  const ribs = (g, n) => { for (let y = 10; y < n - 10; y += 6) { k.px(g, 14, y, mulc(base, 0.62), 36, 1); k.px(g, 14, y + 1, mulc(base, 1.1), 36, 1); } k.px(g, 31, 8, mulc(base, 0.6), 2, n - 16); };
  const streak = (g, n) => { for (let i = 0; i < 6; i++) k.px(g, (rnd() * n) | 0, (rnd() * n * 0.6) | 0, mulc(base, 0.74), 1, 5 + ((rnd() * 5) | 0)); k.scars(g, n, base, nScar); };
  const wraps = (g, n, fromV) => { // bandage rolled around: rows of cloth with a loose edge
    const yTop = k.cy(n, fromV);
    for (let y = yTop; y < n; y++) for (let x = 0; x < n; x++) k.px(g, x, y, mulc(wrap, 0.94 + rnd() * 0.12 - ((y + (x >> 2)) % 4 === 0 ? 0.18 : 0)));
    for (let x = 0; x < n; x += 3) k.px(g, x, yTop, mulc(wrap, 0.7), 2, 1);
  };
  const cloth = jit(rnd.pick([[78, 70, 62], [66, 72, 80], [90, 74, 60]]), 0.1);
  const mats = {
    skin: paint(32, base, streak),
    torso: paint(64, base, (g, n) => { streak(g, n); ribs(g, n); }),
    pelvis: paint(32, cloth, (g, n) => { k.px(g, 0, 0, mulc(cloth, 0.6), n, 1); streak(g, n); }, 0.3),
    thigh: paint(32, base, streak), shin: paint(32, base, streak), foot: paint(32, mulc(base, 0.7), null),
    upper: paint(32, base, streak),
    fore: paint(32, base, (g, n) => { streak(g, n); wraps(g, n, 0.55); }),
    hand: paint(32, wrap, (g, n) => { for (let y = 0; y < n; y += 4) k.px(g, 0, y, mulc(wrap, 0.7), n, 1); }, 0.1),
  };
  mats.head = paint(64, mulc(base, 1.04), (g, n) => {
    // an almost human face: deep eyes, thin brows, a nose line, a thin shut mouth, marked cheekbones
    streak(g, n);
    const sk = (f) => mulc(base, f), P = k.px, cy = k.cy;
    for (const x of [-1, 1]) {
      const cx = 32 + x * 5; // eye centre column
      P(g, cx - 4, cy(n, 0.64), sk(0.42), 8, 1); P(g, cx - 4, cy(n, 0.635) + 1, sk(0.58), 8, 1); // thin brow
      P(g, cx - 3, cy(n, 0.57), sk(0.38), 7, 4);          // deep socket
      P(g, cx - 3, cy(n, 0.57) + 4, sk(0.72), 7, 1);      // lower lid shadow
      P(g, cx - 4 + (x > 0 ? 8 : -1), cy(n, 0.55), sk(0.7), 1, 3); // temple-side shadow
      P(g, cx + x * 3 - 2, cy(n, 0.43), sk(1.2), 4, 2);   // cheekbone highlight
      P(g, cx + x * 3 - 2, cy(n, 0.38), sk(0.66), 4, 2);  // hollow below it
    }
    P(g, 32, cy(n, 0.52), sk(1.14), 1, 9); P(g, 31, cy(n, 0.52), sk(0.78), 1, 9); // nose bridge: light line with a shadow side
    P(g, 29, cy(n, 0.36), sk(0.5), 7, 1); P(g, 30, cy(n, 0.36) + 1, sk(0.86), 5, 1); // nostrils and underside
    P(g, 27, cy(n, 0.23), sk(0.36), 11, 1); P(g, 28, cy(n, 0.23) + 1, sk(0.82), 9, 1); // thin shut mouth, lip shadow
    P(g, 29, cy(n, 0.15), sk(0.78), 5, 1); // chin crease
  });
  mats.wrap = paint(16, wrap, (g, n) => { for (let y = 0; y < n; y += 3) k.px(g, 0, y, mulc(wrap, 0.75), n, 1); }, 0.1);
  mats.cloth = paint(16, cloth, (g, n) => { k.px(g, 0, 0, [40, 36, 32], n, 1); }, 0.3);
  const eyeMat = k.glow('#ffd272');

  const thigh = 0.5 * kl, shin = 0.43 * kl, ank = 0.09, hy = thigh + shin + ank;
  const shY = hy + 0.7, headY = shY + 0.14;
  const R = (y, rx, rz, cz = 0) => ({ y, rx, rz, cz });
  const lean = (y) => 0.02 + Math.max(0, y - hy) * 0.36; // nervous stoop baked into the shape
  const hz = lean(headY) + 0.07;
  // oval like a person's head: narrow chin, widest at the temples, rounded crown
  const headRings = [R(headY, 0.036, 0.05, hz + 0.02), R(headY + 0.05, 0.062 * kw, 0.078, hz + 0.02), R(headY + 0.11, 0.079 * kw, 0.094, hz + 0.015), R(headY + 0.17, 0.085 * kw, 0.1, hz + 0.01), R(headY + 0.23, 0.082 * kw, 0.097, hz), R(headY + 0.27, 0.066 * kw, 0.08, hz - 0.005), R(headY + 0.295, 0.04 * kw, 0.05, hz - 0.01), R(headY + 0.305, 0.012, 0.02, hz - 0.015)];
  const eyes = [];
  const P = {
    height: headY + 0.305, hy, leg: [thigh, shin], ank, hx: 0.1 * kw, lr: [0.075 * kw, 0.05 * kw, 0.055 * kw, 0.04 * kw], lz: 1, foot: [0.09 * kw, 0.26, 0.05],
    hipsY: hy + 0.06, spineY: hy + 0.13, neckY: shY + 0.03, neckZ: lean(shY), headY, headZ: hz, shY, shX: 0.21 * kw, shZ: lean(shY), arm: [0.62 * ka, 0.64 * ka], ar: [0.054 * kw, 0.042 * kw, 0.034 * kw], az: 0.95,
    pelvis: [R(hy - 0.12, 0.13 * kw, 0.09), R(hy + 0.0, 0.148 * kw, 0.1), R(hy + 0.14, 0.125 * kw, 0.085, 0.01)],
    torso: [R(hy + 0.1, 0.118 * kw, 0.08, lean(hy + 0.1)), R(hy + 0.28, 0.122 * kw, 0.085, lean(hy + 0.28)), R(hy + 0.5, 0.15 * kw, 0.095, lean(hy + 0.5)), R(shY + 0.02, 0.19 * kw, 0.1, lean(shY + 0.02)), R(shY + 0.08, 0.07 * kw, 0.055, lean(shY + 0.08))],
    neck: [R(shY + 0.03, 0.05, 0.05, lean(shY + 0.03)), R(headY, 0.04, 0.042, hz)],
    headRings, mats, eyes,
    hand: (kk, g, o) => hand(kk, g, { ...o, mat: mats.hand, pw: 0.095 * kw, ph: 0.1, pd: 0.05, nf: 3, fl: 0.17, fr: 0.022, curl: 0.04, fn: 3 }),
    gait: { A: 0.44, K: 0.8, B: 0.34, w: 4.8, tw: 0.09 }, look: 0.9, chestAmp: 0, elbowIdle: 0.14, fidget: 0.16, armForward: 0.0,
  };
  P.extra = (kk, J) => {
    const ey = headY + 0.172;
    for (const x of [-1, 1]) eyes.push(eyeQuad(kk, J.head, eyeMat, headRings, 8, ey, x * 0.032 * kw, 0.02, 0.009));
    // loose bandage ends hanging from the wrists
    for (const s of [1, -1]) {
      const sx = s * P.shX, wy = shY - P.arm[0] - P.arm[1], n = s > 0 ? 'L' : 'R';
      const g = kk.joint(J['wrist' + n], sx + s * 0.05, wy + 0.02, 0.03);
      kk.scrap(g, mats.wrap, [[sx + s * 0.05 - 0.02, wy + 0.02, 0.03], [sx + s * 0.05 + 0.02, wy + 0.02, 0.03], [sx + s * 0.05 + 0.025, wy - 0.12, 0.03], [sx + s * 0.05, wy - 0.2, 0.03], [sx + s * 0.05 - 0.02, wy - 0.1, 0.03]], [[0, 1], [1, 1], [1, 0.3], [0.5, 0], [0, 0.4]]);
    }
  };
  P.rags = [{ x: 0, y: hy + 0.12, z: 0.1, w: 0.2, h: 0.4, mat: mats.cloth }, { x: 0.02, y: hy + 0.12, z: -0.09, w: 0.17, h: 0.3 + rnd() * 0.15, mat: mats.cloth },
    { parent: 'spine', x: 0, y: shY + 0.04, z: lean(shY) + 0.13, w: 0.24, h: 0.62, mat: mats.cloth }, { parent: 'spine', x: 0.01, y: shY + 0.04, z: lean(shY) - 0.12, w: 0.26, h: 0.7, mat: mats.cloth }];
  const out = rig(k, P);
  return out;
}

/* ------------------------------------------------------------------ APITO: squat, flat face, metal collar, striped vest */
function buildApito(k) {
  const { rnd, jit, paint, tube, box, T } = k;
  const kl = rnd.range(0.96, 1.05), kw = rnd.range(0.94, 1.08);
  const base = mulc(rnd.pick([[138, 136, 112], [148, 138, 120], [130, 132, 118], [142, 132, 114]]), rnd.range(0.94, 1.06));
  const stripeA = jit([126, 128, 130], 0.08), stripeB = jit([28, 28, 32], 0.2);
  const metal = jit([58, 60, 68], 0.08), brass = [206, 210, 216];
  const nScar = rnd.pick([1, 2, 3]);
  const blotch = (g, n) => { for (let i = 0; i < 7; i++) k.px(g, (rnd() * n) | 0, (rnd() * n) | 0, mulc(base, 0.85 + rnd() * 0.2), 3, 2); k.scars(g, n, base, nScar); };
  const pants = jit(rnd.pick([[58, 64, 60], [70, 62, 56], [52, 58, 70]]), 0.1);
  const mats = {
    skin: paint(32, base, blotch),
    torso: paint(64, base, (g, n) => {
      blotch(g, n);
      // striped vest from the waist to just under the collar
      const yTop = k.cy(n, 0.9), yBot = k.cy(n, 0.04);
      for (let y = yTop; y < yBot; y++) for (let x = 0; x < n; x++) {
        const c = (x % 4 < 2) ? stripeB : stripeA; k.px(g, x, y, mulc(c, 1 + (rnd() - 0.5) * 0.14));
      }
      for (let x = 0; x < n; x += 2) k.px(g, x, yBot - 1 - (x % 4 === 0 ? 1 : 0), mulc(stripeB, 0.8));
      k.px(g, 31, yTop, mulc(stripeB, 0.7), 2, yBot - yTop); // open front seam
    }),
    pelvis: paint(32, pants, (g, n) => { k.px(g, 0, 0, mulc(pants, 0.6), n, 1); blotch(g, n); }, 0.2),
    thigh: paint(32, pants, (g, n) => { for (let i = 0; i < 4; i++) k.px(g, (rnd() * n) | 0, (rnd() * n) | 0, mulc(pants, 0.7), 3, 3); }, 0.2),
    shin: paint(32, pants, (g, n) => { stitchTear(k, g, n, pants, 0.2, 1, pants); blotch(g, n); }, 0.2),
    foot: paint(32, [44, 40, 38], null),
    upper: paint(32, base, blotch), fore: paint(32, base, blotch), hand: paint(32, mulc(base, 0.96), null),
    metal: paint(32, metal, (g, n) => { for (let x = 3; x < n; x += 8) k.px(g, x, n >> 1, mulc(metal, 1.5), 2, 2); k.px(g, 0, 0, mulc(metal, 0.5), n, 1); }, 0.18),
    brass: paint(16, brass, (g, n) => { k.px(g, 0, 0, mulc(brass, 0.6), n, 1); }, 0.15),
  };
  mats.head = paint(64, mulc(base, 1.02), (g, n) => {
    blotch(g, n);
    k.px(g, 20, k.cy(n, 0.26), mulc(base, 0.4), 24, 2); k.px(g, 18, k.cy(n, 0.3), mulc(base, 0.55), 2, 2); k.px(g, 44, k.cy(n, 0.3), mulc(base, 0.55), 2, 2); // wide flat mouth
    for (const x of [20, 38]) { k.px(g, x, k.cy(n, 0.68), mulc(base, 0.4), 7, 2); k.px(g, x, k.cy(n, 0.56), mulc(base, 0.6), 7, 3); }
  });
  const eyeMat = k.glow('#9fd8ff');

  const thigh = 0.38 * kl, shin = 0.3 * kl, ank = 0.08, hy = thigh + shin + ank;
  const shY = hy + 0.84, headY = shY + 0.16;
  const R = (y, rx, rz, cz = 0) => ({ y, rx, rz, cz });
  const headRings = [R(headY, 0.13 * kw, 0.11, 0.01), R(headY + 0.07, 0.19 * kw, 0.14), R(headY + 0.2, 0.205 * kw, 0.145), R(headY + 0.3, 0.18 * kw, 0.13), R(headY + 0.34, 0.09 * kw, 0.07)];
  const eyes = [];
  const P = {
    height: headY + 0.34, hy, leg: [thigh, shin], ank, hx: 0.18 * kw, lr: [0.17 * kw, 0.13 * kw, 0.135 * kw, 0.1 * kw], lz: 1, foot: [0.17 * kw, 0.3, 0.06],
    hipsY: hy + 0.06, spineY: hy + 0.15, neckY: shY + 0.02, headY, shY, shX: 0.5 * kw, arm: [0.38, 0.4], ar: [0.14 * kw, 0.105 * kw, 0.085 * kw], az: 1,
    pelvis: [R(hy - 0.14, 0.27 * kw, 0.18), R(hy + 0.0, 0.32 * kw, 0.2), R(hy + 0.16, 0.31 * kw, 0.2)],
    torso: [R(hy + 0.12, 0.3 * kw, 0.2), R(hy + 0.3, 0.34 * kw, 0.22), R(hy + 0.6, 0.43 * kw, 0.25), R(shY + 0.02, 0.47 * kw, 0.23), R(shY + 0.11, 0.2 * kw, 0.15)],
    neck: [R(shY + 0.05, 0.17 * kw, 0.15), R(headY + 0.02, 0.15 * kw, 0.14)],
    headRings, mats, eyes,
    hand: (kk, g, o) => hand(kk, g, { ...o, mat: mats.hand, pw: 0.12 * kw, ph: 0.12, pd: 0.08, nf: 4, fl: 0.13, fr: 0.025, curl: 0.04 }),
    gait: { A: 0.4, K: 0.8, B: 0.3, w: 5.0, tw: 0.07 }, look: 0.45, chestAmp: 0, elbowIdle: 0.12, armOut: 0.12,
  };
  P.extra = (kk, J) => {
    // thick metal collar
    const cy0 = shY + 0.1;
    kk.tube(J.neck, mats.metal, [R(cy0, 0.22 * kw, 0.2), R(cy0 + 0.1, 0.22 * kw, 0.2)], { n: 8 });
    kk.box(J.neck, mats.metal, 0, cy0 + 0.05, 0.21, 0.05, 0.06, 0.04); // lock block at the front
    // the whistle in the right hand (the right is -X): raised with shoulderR/elbowR
    const sx = -P.shX, wy = shY - 0.78, wr = J.wristR;
    kk.box(wr, mats.brass, sx, wy - 0.07, 0.07, 0.04, 0.045, 0.13);
    kk.box(wr, mats.brass, sx, wy - 0.07, 0.15, 0.025, 0.025, 0.05);
    for (const x of [-1, 1]) eyes.push(eyeQuad(kk, J.head, eyeMat, headRings, 8, headY + 0.2, x * 0.075 * kw, 0.045, 0.02));
  };
  P.rags = [{ x: 0.0, y: hy + 0.12, z: 0.18, w: 0.28, h: 0.2, mat: mats.pelvis }];
  return rig(k, P);
}

const TYPES = { casca: buildCasca, fole: buildFole, vigia: buildVigia, mestre: buildMestre, apito: buildApito };
export const CREATURES = Object.keys(TYPES);

export function buildCreature(r, tipo, opts = {}) {
  const build = TYPES[tipo];
  if (!build) throw new Error('unknown creature: ' + tipo);
  const seed = opts.seed ?? 1;
  const rnd = mulberry32((Math.imul(seed | 0, 2654435761) ^ hashStr(tipo)) >>> 0);
  const k = makeKit(r, rnd);
  const built = build(k);
  const scale = opts.scale ?? 1;
  built.joints.body.scale.setScalar(scale); built.sc.v = scale;
  built.height *= scale;
  const { sc, ...out } = built; return { ...out, tipo, seed };
}
