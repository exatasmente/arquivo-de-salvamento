// The evolved creatures of the pit and the common raven: low poly, PS1 look, painted by code.
// buildAnimal(r, especie, { seed, scale, stance }) -> { root, update(t, estado), tris }.
// Pure function of seed and time: no Math.random, no real clock.
import { mergeGeos } from '../render.js';
import { mulberry32 } from '../rng.js';

const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));
const mulc = (c, k) => c.map((v) => clamp255(v * k));
const lerpc = (a, b, t) => a.map((v, i) => clamp255(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function makeKit(r, rnd) {
  const T = r.THREE;
  const buckets = new Map();
  const E = new T.Euler(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3();

  /** Queue a geometry into a group; bake() merges everything of the same material into one mesh. */
  function put(group, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let m = buckets.get(group); if (!m) { m = new Map(); buckets.set(group, m); }
    let a = m.get(mat); if (!a) { a = []; m.set(mat, a); }
    E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); P.set(x, y, z); S.set(sx, sy, sz);
    a.push({ geo, matrix: new T.Matrix4().compose(P, Q, S) });
  }
  function bake() {
    let tris = 0;
    for (const [g, m] of buckets) for (const [mat, parts] of m) {
      const geo = mergeGeos(parts); g.add(new T.Mesh(geo, mat)); tris += geo.attributes.position.count / 3;
    }
    buckets.clear(); return tris;
  }

  /** Box with a tapered section: top (wt x dt), bottom (wb x db), height h, top sheared by shz in z. */
  function frustum(wt, dt, wb, db, h, shz = 0, o = {}) {
    const yt = h / 2, yb = -h / 2;
    const t = [[-wt / 2, yt, -dt / 2 + shz], [wt / 2, yt, -dt / 2 + shz], [wt / 2, yt, dt / 2 + shz], [-wt / 2, yt, dt / 2 + shz]];
    const b = [[-wb / 2, yb, -db / 2], [wb / 2, yb, -db / 2], [wb / 2, yb, db / 2], [-wb / 2, yb, db / 2]];
    const faces = [[b[3], b[2], t[2], t[3]], [b[1], b[0], t[0], t[1]], [b[2], b[1], t[1], t[2]], [b[0], b[3], t[3], t[0]]];
    if (!o.noTop) faces.push([t[3], t[2], t[1], t[0]]);
    if (!o.noBottom) faces.push([b[0], b[1], b[2], b[3]]);
    const pos = [], uv = [];
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const f of faces) for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...f[i]); uv.push(...UV[i]); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  const spikeCache = new Map();
  function spike(rad, h) { // four-sided pyramid, base at the origin, pointing +Y
    const key = rad + ':' + h; if (spikeCache.has(key)) return spikeCache.get(key);
    const g = new T.ConeGeometry(rad, h, 4, 1, true); g.translate(0, h / 2, 0); spikeCache.set(key, g); return g;
  }
  const ico = new T.IcosahedronGeometry(1, 0);
  const ell = () => ico;
  /** Longitudinal segment: axis along +z. wf/hf: width/height at the front end, wb/hb at the back. */
  function lseg(group, mat, wf, hf, wb, hb, len, x, y, z0, drop = 0) {
    put(group, frustum(wf, hf, wb, hb, len, drop), mat, x, y, z0 + len / 2, Math.PI / 2);
  }

  /** Chain of rigid segments hanging down from `parent`. segs: { len, wt, wb, ang, m }. */
  function chain(parent, segs, mats, o = {}) {
    let ang = 0, reach = 0;
    for (const s of segs) { ang += s.ang || 0; reach += s.len * Math.cos(ang); }
    const kf = o.reach ? o.reach / reach : 1;
    const joints = []; let cur = parent;
    for (const s of segs) {
      const j = new T.Group(); j.rotation.x = s.ang || 0; cur.add(j); joints.push(j);
      const len = s.len * kf;
      put(j, frustum(s.wt, s.dt ?? s.wt, s.wb, s.db ?? s.wb, len, s.shz || 0), mats[s.m || 0], 0, -len / 2, 0);
      const nxt = new T.Group(); nxt.position.y = -len; j.add(nxt); cur = nxt;
    }
    cur.rotation.x = -ang; // the tip stays aligned with the world: feet and hands sit flat
    return { joints, tip: cur, reach: reach * kf };
  }

  function tex(n, paint) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    paint(c.getContext('2d'), n);
    const t = new T.CanvasTexture(c);
    t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace;
    return t;
  }
  const px = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = css(c); g.fillRect(x, y, w, h); };
  function noiseFill(g, n, base, amt, belly, bellyFrom = 0.62) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const tt = y / (n - 1);
      let c = tt > bellyFrom && belly ? lerpc(base, belly, Math.min(1, (tt - bellyFrom) * 3)) : mulc(base, 0.88 + 0.2 * (1 - tt) * 0.5);
      const kk = 1 + (rnd() - 0.5) * amt;
      px(g, x, y, mulc(c, kk));
    }
  }
  /** Fur: grain, darker back, lighter belly, strand streaks and seeded scars. */
  function fur(base, o = {}) {
    const map = tex(o.n || 32, (g, n) => {
      noiseFill(g, n, base, o.amt ?? 0.18, o.belly);
      const strand = mulc(base, 0.7);
      for (let i = 0; i < n; i++) { const x = (rnd() * n) | 0, y = (rnd() * n * 0.8) | 0, l = 3 + ((rnd() * 5) | 0); px(g, x, y, strand, 1, l); }
      if (o.paint) o.paint(g, n);
      const sc = o.scars || 0;
      for (let i = 0; i < sc; i++) {
        const x0 = 3 + ((rnd() * (n - 12)) | 0), y0 = 3 + ((rnd() * (n - 12)) | 0), d = rnd() < 0.5 ? 1 : -1;
        for (let s = 0; s < 6 + ((rnd() * 5) | 0); s++) px(g, x0 + s, y0 + s * d * (rnd() < 0.7 ? 1 : 0), lerpc(base, [235, 215, 205], 0.7));
      }
    });
    return r.mat('#ffffff', { map });
  }
  /** Hard surface (bone, rock, metal): grain, cracks and optional rivets. */
  function hard(base, o = {}) {
    const map = tex(o.n || 32, (g, n) => {
      noiseFill(g, n, base, o.amt ?? 0.14);
      const crack = mulc(base, 0.55);
      for (let i = 0; i < (o.cracks ?? 4); i++) {
        let x = (rnd() * n) | 0, y = (rnd() * n * 0.5) | 0;
        for (let s = 0; s < 8 + ((rnd() * 10) | 0); s++) { px(g, x & (n - 1), y & (n - 1), crack); y++; x += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1); }
      }
      if (o.rows) { px(g, 0, n >> 1, mulc(base, 0.6), n, 1); for (let x = 3; x < n; x += 8) px(g, x, (n >> 1) - 3, mulc(base, 1.4), 2, 2); }
      if (o.paint) o.paint(g, n);
    });
    return r.mat('#ffffff', { map });
  }
  /** Spike texture: a vertical gradient from base colour to tip colour (v = height). */
  function gradient(base, tip) {
    const map = tex(16, (g, n) => {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(g, x, y, mulc(lerpc(tip, base, Math.min(1, y / (n * 0.8))), 1 + (rnd() - 0.5) * 0.12));
    });
    return r.mat('#ffffff', { map });
  }
  const plain = (color, o = {}) => r.mat(color, o);
  const glow = (color) => r.glow(color);
  const jit = (c, a = 0.1) => c.map((v) => clamp255(v * (1 + (rnd() - 0.5) * a)));
  return { T, r, rnd, put, bake, frustum, spike, ell, lseg, chain, tex, px, fur, hard, gradient, plain, glow, jit };
}

const calm = (ex) => 1 - ex;
function exOf(estado) {
  if (typeof estado === 'number') return Math.max(0, Math.min(1, estado));
  if (estado === true || estado === 'excitado') return 1;
  if (estado && typeof estado === 'object') return estado.excitado ? 1 : (estado.estado === 'excitado' ? 1 : 0);
  return 0;
}
const PI = Math.PI, sin = Math.sin, abs = Math.abs;

/* ------------------------------------------------------------------ Presa-de-osso (boar) */
function buildPresa(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg } = k;
  const kl = rnd.range(0.94, 1.07), kh = rnd.range(0.95, 1.05);
  const hipY = 1.2 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[54, 38, 32], [64, 46, 34], [46, 40, 40]]), 0.14);
  const fur = k.fur(coat, { belly: [96, 76, 62], scars: rnd.pick([0, 1, 2, 3]) });
  const furHead = k.fur(mulc(coat, 1.1), { belly: [96, 76, 62], scars: 1 + (rnd() * 2 | 0), amt: 0.2 });
  const dark = k.fur([26, 22, 22], { amt: 0.2 });
  const bone = k.hard(k.jit([214, 202, 166], 0.08), { cracks: 5 });
  const eyeM = k.glow('#ff6a30');

  // body: low rump, taller chest and a hump behind the neck
  put(torso, frustum(1.15, 1.1, 1.3, 1.25, 1.1 * kh), fur, 0, 0.45 * kh, -0.55 * kl);
  put(torso, frustum(1.45, 1.3, 1.6, 1.45, 1.25 * kh), fur, 0, 0.48 * kh, 0.72 * kl);
  put(torso, ell(), fur, 0, 1.0 * kh, 0.55 * kl, 0, 0, 0, 0.62, 0.3 * kh, 0.62);
  // serrated spine of bone plates, alternating tall and short, plus two slanted flank rows
  const n = 9;
  for (let i = 0; i < n; i++) {
    const z = (-1.05 + i * 0.29) * kl, y = (z < 0.05 ? 0.98 : (z < 0.9 ? 1.2 : 1.1)) * kh;
    const h = (i % 2 ? 0.5 : 0.9) * rnd.range(0.85, 1.15);
    put(torso, spike(0.3, h), bone, 0, y - 0.05, z, -0.35, 0, 0, 0.34, 1, 1);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = (-0.85 + i * 0.4) * kl, y = (z < 0.05 ? 0.85 : 1.0) * kh;
    put(torso, spike(0.22, 0.38 + 0.14 * (i % 2) + rnd() * 0.1), bone, sx * 0.62, y - 0.1, z, -0.3, 0, -sx * 0.85, 0.4, 1, 1);
  }
  // head, low and heavy
  const head = new T.Group(); head.position.set(0, 0.32 * kh, 1.3 * kl); torso.add(head);
  lseg(head, furHead, 0.95, 0.85, 1.0, 0.95, 0.85, 0, 0, -0.1, 0.03);
  lseg(head, furHead, 0.5, 0.42, 0.85, 0.75, 0.85, 0, -0.1, 0.7, 0.05);
  lseg(head, dark, 0.52, 0.4, 0.5, 0.4, 0.14, 0, -0.1, 1.55, 0.05);
  lseg(head, bone, 0.62, 0.1, 0.66, 0.12, 0.75, 0, 0.48, 0.0);
  for (const sx of [-1, 1]) {
    put(head, spike(0.11, 0.78), bone, sx * 0.27, -0.2, 1.05, 1.0, 0, -sx * 0.1);
    put(head, spike(0.1, 0.62), bone, sx * 0.42, -0.02, 0.85, 0.5, 0, -sx * 0.75);
    put(head, frustum(0.1, 0.07, 0.12, 0.09, 0.06), eyeM, sx * 0.48, 0.12, 0.45);
  }
  const ears = [-1, 1].map((sx) => {
    const g = new T.Group(); g.position.set(sx * 0.4, 0.45, 0.05); head.add(g);
    put(g, spike(0.2, 0.42), fur, 0, 0, 0, 0.1, 0, -sx * 0.6, 0.55, 1, 1); return g;
  });
  // legs
  const footM = dark;
  const legs = [];
  const mk = (x, z, y, reach, counter, big) => {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.x = counter;
    const c = chain(g, [{ len: 0.7, wt: big ? 0.6 : 0.55, wb: 0.4, ang: -0.2 }, { len: 0.5, wt: 0.36, wb: 0.3, ang: 0.4 }], [fur], { reach });
    put(c.tip, frustum(0.36, 0.42, 0.4, 0.5, 0.16), footM, 0, 0.08, 0.05);
    for (const dx of [-0.1, 0.1]) put(c.tip, spike(0.06, 0.14), bone, dx, 0.05, 0.3, PI / 2);
    return g;
  };
  const hind = [-1, 1].map((sx) => { const g = mk(sx * 0.5, -0.55 * kl, 0, hipY, 0, false); hips.add(g); return g; });
  const fore = [-1, 1].map((sx) => { const g = mk(sx * 0.62, 0.75 * kl, 0.1 * kh, hipY + 0.1 * kh, st.lift, true); front.add(g); return g; });
  const tailG = new T.Group(); tailG.position.set(0, 0.85 * kh, -1.15 * kl); torso.add(tailG);
  put(tailG, frustum(0.08, 0.08, 0.16, 0.16, 0.7), dark, 0, -0.3, -0.1, 0.5);
  legs.push(...hind, ...fore);
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.9) * 0.012;
      torso.scale.set(1 + br, 1 + br * 1.5, 1);
      head.rotation.x = 0.38 + st.lift * 0.8 + 0.05 * sin(t * 0.8) * calm(ex) + ex * 0.3 * sin(t * 9);
      head.rotation.y = 0.14 * sin(t * 0.55) * calm(ex);
      ears.forEach((e, i) => { e.rotation.x = 0.15 * sin(t * 2.3 + i * 2) + ex * 0.2 * sin(t * 9); });
      tailG.rotation.z = 0.25 * sin(t * 1.4) + ex * 0.4 * sin(t * 10);
      front.rotation.x = -st.lift + ex * 0.03 * sin(t * 9);
      fore[1].rotation.x = st.lift - ex * Math.max(0, sin(t * 6)) * 0.9;
      fore[0].rotation.x = st.lift + 0.02 * sin(t * 0.7);
    },
  };
}

/* ------------------------------------------------------------------ Crina-de-espinho (wolf) */
function buildCrina(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg } = k;
  const kl = rnd.range(0.94, 1.08), kh = rnd.range(0.96, 1.05);
  const hipY = 1.3 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[70, 66, 64], [78, 64, 56], [62, 60, 66]]), 0.12);
  const skinPatch = [112, 92, 90];
  const fur = k.fur(coat, { amt: 0.2, scars: rnd.pick([1, 2, 3]), paint: (g, n) => {
    for (let i = 0; i < 5; i++) { const x = (rnd() * (n - 6)) | 0, y = (rnd() * (n - 6)) | 0, w = 3 + ((rnd() * 4) | 0), h = 2 + ((rnd() * 4) | 0); k.px(g, x, y, k.jit(skinPatch, 0.15), w, h); }
  } });
  const darkFur = fur;
  const quills = rnd() < 0.5 ? k.hard([206, 200, 184], { cracks: 3 }) : k.hard([44, 34, 52], { cracks: 2 });
  const eyeM = k.glow('#c8ff3a');
  const tooth = k.hard([232, 226, 206], { cracks: 0 });

  // long, arched body: low rump, high middle, deep narrow chest
  k.put(torso, frustum(0.5, 1.3, 0.54, 1.3, 0.85 * kh), fur, 0, 0.3 * kh, -1.15 * kl, 0.15);
  k.put(torso, frustum(0.62, 1.5, 0.58, 1.5, 0.85 * kh), fur, 0, 0.62 * kh, -0.1 * kl);
  k.put(torso, frustum(0.6, 1.4, 0.62, 1.4, 0.95 * kh), fur, 0, 0.36 * kh, 0.85 * kl, -0.05);
  k.put(torso, frustum(0.4, 0.55, 0.5, 0.7, 0.9), fur, 0, 0.32 * kh, 1.5 * kl, -0.55, 0, 0);
  // the mane of quills: tall and swept back, tallest over the arch
  const nq = 15;
  for (let i = 0; i < nq; i++) {
    const u = i / (nq - 1), z = (1.2 - u * 2.75) * kl;
    const ytop = (z > 1.1 ? 0.62 : z > 0.5 ? 0.82 : z > -0.6 ? 1.06 : 0.76) * kh;
    const arch = 1 - Math.pow(Math.abs(u - 0.4) * 1.6, 2);
    const h = (0.4 + 0.55 * Math.max(0.1, arch)) * rnd.range(0.85, 1.15);
    put(torso, spike(0.14, h), quills, 0, ytop - 0.05, z, -0.65 - 0.2 * u, 0, 0);
  }
  // head: long snout, glowing eyes
  const neck = new T.Group(); neck.position.set(0, 0.5 * kh, 1.85 * kl); torso.add(neck);
  const head = new T.Group(); neck.add(head);
  lseg(head, fur, 0.42, 0.44, 0.5, 0.5, 0.5, 0, 0, -0.1, 0.03);
  lseg(head, fur, 0.22, 0.2, 0.36, 0.34, 0.65, 0, -0.08, 0.38, 0.05);
  lseg(head, darkFur, 0.24, 0.12, 0.22, 0.12, 0.06, 0, -0.04, 1.02, 0.06);
  lseg(head, darkFur, 0.2, 0.08, 0.3, 0.12, 0.6, 0, -0.26, 0.38, 0.03);
  for (const sx of [-1, 1]) {
    put(head, spike(0.04, 0.16), tooth, sx * 0.09, -0.21, 0.85, PI, 0, 0);
    put(head, frustum(0.14, 0.05, 0.12, 0.05, 0.05), eyeM, sx * 0.22, 0.1, 0.34, 0, 0, -sx * 0.4);
    put(head, frustum(0.18, 0.05, 0.18, 0.05, 0.05), darkFur, sx * 0.22, 0.17, 0.33, 0, 0, sx * 0.3);
  }
  const ears = [-1, 1].map((sx) => {
    const g = new T.Group(); g.position.set(sx * 0.18, 0.22, 0.02); head.add(g);
    put(g, spike(0.14, 0.5), fur, 0, 0, 0, -0.2, 0, -sx * 0.25, 0.7, 1, 0.5); return g;
  });
  // legs: long, digitigrade behind
  const mkHind = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.3, 0, -1.1 * kl);
    const c = chain(g, [{ len: 0.7, wt: 0.3, wb: 0.2, ang: -0.55, m: 0 }, { len: 0.65, wt: 0.2, wb: 0.14, ang: 1.0, m: 0 }, { len: 0.55, wt: 0.14, wb: 0.12, ang: -0.45, m: 1 }], [fur, darkFur], { reach: hipY });
    put(c.tip, frustum(0.2, 0.34, 0.22, 0.4, 0.1), darkFur, 0, 0.05, 0.1); hips.add(g); return g;
  };
  const mkFore = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.3, 0.0, 1.0 * kl); g.rotation.x = st.lift;
    const c = chain(g, [{ len: 0.8, wt: 0.26, wb: 0.18, ang: 0.1, m: 0 }, { len: 0.7, wt: 0.18, wb: 0.13, ang: -0.2, m: 1 }], [fur, darkFur], { reach: hipY });
    put(c.tip, frustum(0.2, 0.3, 0.22, 0.36, 0.1), darkFur, 0, 0.05, 0.1); front.add(g); return g;
  };
  const hind = [mkHind(-1), mkHind(1)], fore = [mkFore(-1), mkFore(1)];
  // tail: thin, in three joints, with a few quills
  const tail = [];
  let par = torso, y0 = 0.4 * kh, z0 = -1.55 * kl;
  for (let i = 0; i < 3; i++) {
    const g = new T.Group(); g.position.set(0, i ? 0 : y0, i ? -0.5 : z0); par.add(g); par = g;
    put(g, frustum(0.14 - i * 0.03, 0.14 - i * 0.03, 0.2 - i * 0.03, 0.2 - i * 0.03, 0.5), i ? darkFur : fur, 0, -0.06, -0.25, -1.45);
    g.rotation.x = i ? 0.25 : 0.3; tail.push(g);
  }
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.7) * 0.014; torso.scale.set(1 + br, 1 + br * 1.6, 1);
      neck.rotation.x = 0.35 + st.lift * 0.5 + 0.04 * sin(t * 0.9) * calm(ex) + ex * 0.28 * sin(t * 8);
      head.rotation.x = 0.1 + st.lift * 0.4; head.rotation.y = 0.2 * sin(t * 0.5) * calm(ex);
      ears.forEach((e, i) => { e.rotation.x = 0.12 * sin(t * 2.7 + i * 1.7) + ex * 0.15 * sin(t * 9); });
      tail.forEach((g, i) => { g.rotation.y = (0.18 + ex * 0.2) * sin(t * (1.1 + ex * 6) - i * 0.9); });
      fore[0].rotation.x = st.lift + 0.02 * sin(t * 0.6);
      fore[1].rotation.x = st.lift - ex * Math.max(0, sin(t * 6.5)) * 0.9;
    },
  };
}

/* ------------------------------------------------------------------ Peito-de-pedra (bear) */
function buildPedra(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg } = k;
  const kh = rnd.range(0.96, 1.06), kw = rnd.range(0.94, 1.06);
  const hipY = 1.15 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[104, 76, 52], [92, 70, 54], [112, 84, 58]]), 0.12);
  const fur = k.fur(coat, { belly: [140, 108, 76], scars: rnd.pick([1, 2, 3]) });
  const darkFur = k.fur(mulc(coat, 0.55));
  const rockC = k.jit(rnd.pick([[146, 134, 114], [132, 130, 120], [150, 142, 124]]), 0.1);
  const rock = k.hard(rockC, { cracks: 7, amt: 0.2 });
  const rockDark = k.hard(mulc(rockC, 0.72), { cracks: 5 });
  const claws = k.hard([226, 216, 190], { cracks: 0 });
  const eyeM = k.glow('#ffb838');

  // torso: a block, broad at the shoulders
  lseg(torso, fur, 1.9 * kw, 1.15, 1.2, 0.95, 1.75, 0, 0, -0.2);
  put(torso, ell(), fur, 0, 0.15, 1.3, 0, 0, 0, 0.95 * kw, 0.55, 0.5);
  // chest of rock: three stacked plates on the ventral side (the front, once upright)
  const plates = [[1.7, 0.42, 0.55, 1.15], [1.5, 0.4, 0.5, 0.65], [1.15, 0.36, 0.45, 0.2]];
  plates.forEach(([w, th, hh, z], i) => put(torso, frustum(w * kw, th, w * kw * 0.92, th * 1.1, hh * 1.0), i % 2 ? rockDark : rock, 0, -0.6, z, PI / 2));
  for (const sx of [-1, 1]) put(torso, ell(), fur, sx * 0.95 * kw, -0.05, 1.4, 0.2, 0, 0, 0.5, 0.45, 0.5);
  // head
  const neck = new T.Group(); neck.position.set(0, 0.05, 1.6); torso.add(neck);
  const head = new T.Group(); neck.add(head);
  put(head, ell(), fur, 0, 0.0, 0.25, 0, 0, 0, 0.46, 0.42, 0.46);
  lseg(head, fur, 0.3, 0.26, 0.42, 0.38, 0.4, 0, -0.1, 0.4, 0.03);
  lseg(head, darkFur, 0.18, 0.1, 0.18, 0.1, 0.08, 0, -0.08, 0.78, 0.04);
  const ears = [-1, 1].map((sx) => { const g = new T.Group(); g.position.set(sx * 0.36, 0.34, 0.1); head.add(g); put(g, ell(), fur, 0, 0, 0, 0, 0, 0, 0.14, 0.14, 0.08); return g; });
  for (const sx of [-1, 1]) put(head, frustum(0.1, 0.06, 0.1, 0.06, 0.05), eyeM, sx * 0.17, 0.05, 0.62);
  // arms: heavy forearms of rock, fists the size of boulders
  const mkArm = (sx) => {
    const g = new T.Group(); g.position.set(sx * 1.0 * kw, 0, 1.35); g.rotation.x = st.lift; g.rotation.z = sx * 0.3;
    const c = chain(g, [{ len: 0.85, wt: 0.58, wb: 0.5, ang: 0.0, m: 0 }, { len: 0.95, wt: 0.8, wb: 1.0, ang: -0.15, m: 1, dt: 0.8, db: 0.95 }], [fur, rock], { reach: 1.9 });
    put(c.tip, ell(), rock, 0, 0.05, 0.1, 0, 0, 0, 0.55, 0.42, 0.52);
    for (const dx of [-0.2, 0, 0.2]) put(c.tip, spike(0.05, 0.28), claws, dx, -0.12, 0.45, 2.3, 0, 0);
    put(c.joints[0], ell(), rock, 0, -0.2, 0.0, 0, 0, 0, 0.45, 0.3, 0.45);
    front.add(g); return g;
  };
  const arms = [mkArm(-1), mkArm(1)];
  const mkLeg = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.5, 0, 0.0);
    const c = chain(g, [{ len: 0.7, wt: 0.62, wb: 0.46, ang: -0.1 }, { len: 0.6, wt: 0.46, wb: 0.4, ang: 0.2 }], [fur], { reach: hipY });
    put(c.tip, frustum(0.5, 0.7, 0.54, 0.74, 0.16), darkFur, 0, 0.08, 0.14);
    for (const dx of [-0.14, 0, 0.14]) put(c.tip, spike(0.05, 0.2), claws, dx, 0.05, 0.5, PI / 2);
    hips.add(g); return g;
  };
  const legs = [mkLeg(-1), mkLeg(1)];
  put(torso, ell(), darkFur, 0, 0.1, -0.35, 0, 0, 0, 0.5, 0.5, 0.45); // rump
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.4) * 0.016; torso.scale.set(1 + br, 1 + br, 1 + br);
      neck.rotation.x = st.lift * 0.9 - 0.1 + 0.04 * sin(t * 0.8) * calm(ex) + ex * 0.22 * sin(t * 8);
      head.rotation.y = 0.18 * sin(t * 0.45) * calm(ex);
      ears.forEach((e, i) => { e.rotation.z = 0.1 * sin(t * 2 + i); });
      arms[0].rotation.x = st.lift + 0.03 * sin(t * 1.1) - ex * (0.9 + 0.5 * sin(t * 7)) * (st.lift > 0.8 ? 1 : 0.2);
      arms[1].rotation.x = st.lift - 0.03 * sin(t * 1.1) - ex * Math.max(0, sin(t * 7 + PI)) * 1.6 * (st.lift > 0.8 ? 1 : 0.2);
      arms[0].rotation.z = -0.3 - ex * 0.2; arms[1].rotation.z = 0.3 + ex * 0.2;
      hips.position.y = hipY + ex * 0.04 * abs(sin(t * 7));
    },
  };
}

/* ------------------------------------------------------------------ Três-caudas (fox) */
function buildCaudas(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg } = k;
  const kl = rnd.range(0.94, 1.08), kh = rnd.range(0.96, 1.06), ke = rnd.range(0.9, 1.12);
  const hipY = 1.3 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[118, 134, 138], [128, 140, 132], [110, 126, 144]]), 0.1);
  const fur = k.fur(coat, { belly: [226, 232, 224], scars: rnd.pick([0, 1, 2]) });
  const dark = k.fur([36, 44, 52], { amt: 0.2 });
  const cream = k.fur([232, 236, 226], { amt: 0.1 });
  const tailC = k.jit(rnd.pick([[70, 92, 104], [84, 100, 96]]), 0.1);
  const tailFur = k.fur(tailC, { amt: 0.2 });
  const tailTip = k.fur([232, 232, 220], { amt: 0.12 });
  const earIn = k.fur([240, 164, 170], { amt: 0.14 });
  const eyeM = k.glow('#8affff');

  // slim, short body on tall thin legs
  put(torso, frustum(0.5, 1.0, 0.46, 1.0, 0.7), fur, 0, 0.3 * kh, -0.5 * kl, 0.1);
  put(torso, frustum(0.5, 1.1, 0.52, 1.1, 0.8 * kh), fur, 0, 0.36 * kh, 0.5 * kl);
  put(torso, frustum(0.3, 0.4, 0.38, 0.55, 0.7), fur, 0, 0.5 * kh, 1.15 * kl, -0.45, 0, 0);
  lseg(torso, cream, 0.36, 0.1, 0.4, 0.1, 0.65, 0, 0.08 * kh, 0.5 * kl);
  // head: small, narrow, with enormous ears
  const neck = new T.Group(); neck.position.set(0, 0.62 * kh, 1.28 * kl); torso.add(neck);
  const head = new T.Group(); neck.add(head);
  lseg(head, fur, 0.34, 0.34, 0.4, 0.4, 0.38, 0, 0, -0.08, 0.02);
  lseg(head, fur, 0.14, 0.14, 0.3, 0.28, 0.5, 0, -0.05, 0.28, 0.04);
  lseg(head, dark, 0.14, 0.1, 0.13, 0.1, 0.06, 0, 0.0, 0.78, 0.04);
  for (const sx of [-1, 1]) put(head, frustum(0.12, 0.04, 0.1, 0.04, 0.05), eyeM, sx * 0.15, 0.08, 0.2, 0, 0, -sx * 0.35);
  const ears = [-1, 1].map((sx) => {
    const g = new T.Group(); g.position.set(sx * 0.16, 0.2, -0.04); head.add(g);
    put(g, frustum(0.04, 0.05, 0.5 * ke, 0.06, 1.3 * ke), fur, 0, 0.62 * ke, 0, -0.1, 0, -sx * 0.28);
    put(g, frustum(0.03, 0.03, 0.36 * ke, 0.03, 1.1 * ke), earIn, 0, 0.55 * ke, 0.04, -0.1, 0, -sx * 0.28);
    g.rotation.z = -sx * 0.0; return g;
  });
  // legs: thin
  const mkHind = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.22, 0, -0.55 * kl);
    const c = chain(g, [{ len: 0.62, wt: 0.2, wb: 0.12, ang: -0.55 }, { len: 0.62, wt: 0.12, wb: 0.08, ang: 1.0 }, { len: 0.55, wt: 0.08, wb: 0.07, ang: -0.45, m: 1 }], [fur, dark], { reach: hipY });
    put(c.tip, frustum(0.1, 0.3, 0.12, 0.34, 0.07), dark, 0, 0.035, 0.1); hips.add(g); return g;
  };
  const mkFore = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.2, 0.05, 0.72 * kl); g.rotation.x = st.lift;
    const c = chain(g, [{ len: 0.8, wt: 0.14, wb: 0.09, ang: 0.05 }, { len: 0.62, wt: 0.09, wb: 0.07, ang: 0, m: 1 }], [fur, dark], { reach: hipY + 0.05 });
    put(c.tip, frustum(0.1, 0.26, 0.12, 0.3, 0.07), dark, 0, 0.035, 0.08); front.add(g); return g;
  };
  const hind = [mkHind(-1), mkHind(1)], fore = [mkFore(-1), mkFore(1)];
  // three short, blunt tails fanned out: club-shaped, with a pale tip
  const tails = [-1, 0, 1].map((s, i) => {
    const g = new T.Group(); g.position.set(0, 0.5 * kh, -0.95 * kl); torso.add(g);
    const sh = new T.Group(); sh.rotation.set(s === 0 ? 0.75 : 0.4, s * 0.55, 0); sh.scale.setScalar(0.9); g.add(sh);
    put(sh, frustum(0.26, 0.26, 0.16, 0.16, 0.5), tailFur, 0, 0, -0.25, PI / 2);
    put(sh, frustum(0.56, 0.56, 0.28, 0.28, 0.6), tailFur, 0, 0, -0.78, PI / 2);
    put(sh, frustum(0.28, 0.28, 0.56, 0.56, 0.36), tailTip, 0, 0, -1.26, PI / 2);
    return g;
  });
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.8) * 0.012; torso.scale.set(1 + br, 1 + br * 1.4, 1);
      neck.rotation.x = 0.2 + st.lift * 0.6 + 0.05 * sin(t * 0.9) * calm(ex) + ex * 0.3 * sin(t * 8);
      head.rotation.x = st.lift * 0.4; head.rotation.y = 0.25 * sin(t * 0.55) * calm(ex);
      ears.forEach((e, i) => { e.rotation.x = 0.12 * sin(t * 2.4 + i * 2.1) + ex * 0.2 * sin(t * 9); e.rotation.z = (i ? 1 : -1) * 0.1 * Math.max(0, sin(t * 0.37)); });
      tails.forEach((g, i) => { g.rotation.y = (0.14 + ex * 0.25) * sin(t * (1.3 + ex * 5) + i * 1.8); g.rotation.x = 0.08 * sin(t * 1.1 + i); });
      fore[0].rotation.x = st.lift;
      fore[1].rotation.x = st.lift - ex * Math.max(0, sin(t * 6.2)) * 0.9;
    },
  };
}

/* ------------------------------------------------------------------ Mão-longa (monkey) */
function buildMaolonga(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg, px } = k;
  const kh = rnd.range(0.95, 1.06), ka = rnd.range(0.96, 1.06);
  const hipY = 0.95 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[98, 100, 80], [88, 92, 78], [108, 104, 84]]), 0.12);
  const fur = k.fur(coat, { belly: [138, 130, 104], scars: rnd.pick([1, 2, 3]) });
  const darkFur = k.fur(mulc(coat, 0.55), { amt: 0.2 });
  const skinC = k.jit(rnd.pick([[196, 152, 124], [178, 138, 112], [206, 166, 136]]), 0.08);
  const skin = k.fur(skinC, { amt: 0.1 });
  const face = k.fur(skinC, {
    amt: 0.08, paint: (g, n) => {
      const dk = [58, 36, 32];
      px(g, 5, 11, dk, 8, 2); px(g, 19, 11, dk, 8, 2); // brows
      px(g, 7, 14, mulc(skinC, 0.55), 5, 3); px(g, 20, 14, mulc(skinC, 0.55), 5, 3); // eye sockets
      px(g, 15, 15, mulc(skinC, 0.78), 2, 7); px(g, 13, 22, dk, 2, 1); px(g, 17, 22, dk, 2, 1); // nose
      px(g, 11, 26, [120, 62, 60], 10, 1); px(g, 12, 27, mulc(skinC, 0.7), 8, 1); // mouth
    },
  });
  const eyeM = k.glow('#fff2b0');

  // pelvis and a chest that leans well forward over the knuckles
  lseg(torso, fur, 1.3, 0.75, 0.8, 0.6, 1.3, 0, 0, -0.15);
  put(torso, ell(), darkFur, 0, 0.12, 0.95, 0, 0, 0, 0.85, 0.45, 0.5); // mantle of long fur over the shoulders
  lseg(torso, skin, 0.7, 0.1, 0.62, 0.1, 0.9, 0, -0.4, 0.2);
  const neck = new T.Group(); neck.position.set(0, 0.0, 1.3); torso.add(neck);
  const head = new T.Group(); neck.add(head);
  put(head, ell(), darkFur, 0, 0.06, 0.15, 0, 0, 0, 0.36, 0.36, 0.38);
  lseg(head, face, 0.4, 0.5, 0.46, 0.56, 0.14, 0, -0.04, 0.3); // near-human face, flat
  lseg(head, darkFur, 0.46, 0.08, 0.46, 0.08, 0.2, 0, 0.27, 0.22);
  lseg(head, skin, 0.3, 0.18, 0.36, 0.2, 0.2, 0, -0.3, 0.18, 0.02);
  for (const sx of [-1, 1]) {
    put(head, frustum(0.1, 0.05, 0.1, 0.05, 0.05), eyeM, sx * 0.11, 0.02, 0.45);
    put(head, frustum(0.08, 0.2, 0.08, 0.22, 0.12), skin, sx * 0.36, -0.02, 0.18);
  }
  for (let i = -1; i <= 1; i++) put(head, spike(0.07, 0.28), darkFur, i * 0.13, 0.3, 0.08, -0.5, 0, i * -0.3);
  // arms: reach the ground. Hands with four fingers.
  const shoulderY = hipY + 1.1 * Math.sin(st.lift) + 0.05 * Math.cos(st.lift);
  const armReach = Math.max(0.9, shoulderY - 0.04) * ka;
  const mkArm = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.78, 0.05, 1.1); g.rotation.x = st.lift; g.rotation.z = sx * 0.34;
    const c = chain(g, [{ len: 1.0, wt: 0.34, wb: 0.26, ang: 0.08 }, { len: 1.0, wt: 0.26, wb: 0.2, ang: -0.16, m: 1 }], [fur, darkFur], { reach: armReach });
    put(c.tip, frustum(0.34, 0.4, 0.34, 0.4, 0.14), skin, 0, 0.07, 0.04);
    for (let i = 0; i < 4; i++) put(c.tip, frustum(0.06, 0.07, 0.07, 0.09, 0.34, 0, { noBottom: true }), skin, (i - 1.5) * 0.085, 0.05, 0.3, PI / 2);
    front.add(g); return g;
  };
  const arms = [mkArm(-1), mkArm(1)];
  const mkLeg = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.42, 0, -0.05);
    const c = chain(g, [{ len: 0.5, wt: 0.46, wb: 0.32, ang: -0.3 }, { len: 0.55, wt: 0.32, wb: 0.26, ang: 0.45, m: 1 }], [fur, darkFur], { reach: hipY });
    put(c.tip, frustum(0.3, 0.55, 0.32, 0.6, 0.12), skin, 0, 0.06, 0.12);
    hips.add(g); return g;
  };
  const legs = [mkLeg(-1), mkLeg(1)];
  // long thin tail with a curled end
  const tail = [];
  let par = torso;
  for (let i = 0; i < 4; i++) {
    const g = new T.Group(); g.position.set(0, i ? 0 : 0.1, i ? -0.42 : -0.5); par.add(g); par = g;
    put(g, frustum(0.1 - i * 0.015, 0.1 - i * 0.015, 0.11 - i * 0.015, 0.11 - i * 0.015, 0.44), darkFur, 0, 0, -0.22, PI / 2);
    g.rotation.x = i ? 0.35 : 0.2; tail.push(g);
  }
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.6) * 0.018; torso.scale.set(1 + br, 1 + br, 1 + br);
      neck.rotation.x = st.lift * 0.9 + 0.06 * sin(t * 0.8) * calm(ex) + ex * 0.2 * sin(t * 8) - 0.1;
      head.rotation.y = 0.35 * sin(t * 0.5) * calm(ex) + ex * 0.2 * sin(t * 5);
      const lean = ex * (-1.3 - 0.4 * sin(t * 8));
      arms[0].rotation.x = st.lift + 0.04 * sin(t * 1.1) + lean * (st.lift > 0.8 ? 1 : 0.5);
      arms[1].rotation.x = st.lift - 0.04 * sin(t * 1.1) + ex * (-1.3 - 0.4 * sin(t * 8 + PI)) * (st.lift > 0.8 ? 1 : 0.5);
      tail.forEach((g, i) => { g.rotation.x = 0.2 + i * 0.2 + 0.1 * sin(t * 1.3 - i * 0.7); g.rotation.y = 0.2 * sin(t * 0.9 - i * 0.6); });
      hips.position.y = hipY + ex * 0.05 * abs(sin(t * 8));
    },
  };
}

/* ------------------------------------------------------------------ Focinho-largo (dog, the referee) */
function buildFocinho(k, st) {
  const { T, rnd, put, frustum, spike, ell, chain, lseg, px } = k;
  const kh = rnd.range(0.95, 1.05), kw = rnd.range(0.95, 1.08);
  const hipY = 1.1 * kh;
  const root = new T.Group();
  const hips = new T.Group(); hips.position.y = hipY; root.add(hips);
  const front = new T.Group(); front.rotation.x = -st.lift; hips.add(front);
  const torso = new T.Group(); front.add(torso);
  const coat = k.jit(rnd.pick([[152, 140, 122], [142, 134, 124], [160, 146, 124]]), 0.1);
  const fur = k.fur(coat, { belly: [214, 204, 186], scars: rnd.pick([1, 2, 3]) });
  const mask = k.fur(k.jit([104, 84, 70], 0.12), { amt: 0.2, scars: 1 });
  const metal = k.hard([128, 134, 144], { cracks: 0, rows: true, amt: 0.1 });
  const silver = k.hard([200, 206, 214], { cracks: 0, amt: 0.08 });
  const shirt = k.tex(32, (g, n) => { for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) px(g, x, y, ((x >> 2) & 1) ? [230, 230, 226] : [28, 28, 32]); });
  const shirtM = k.r.mat('#ffffff', { map: shirt });
  const tooth = k.hard([232, 226, 206], { cracks: 0 });
  const eyeM = k.glow('#ffe060');

  // torso, straight, wide at the shoulders, wearing a striped vest
  lseg(torso, fur, 1.5 * kw, 0.85, 1.0, 0.7, 1.3, 0, 0, -0.1);
  lseg(torso, shirtM, 1.58 * kw, 0.92, 1.12, 0.78, 0.85, 0, 0, 0.3);
  const neck = new T.Group(); neck.position.set(0, 0.0, 1.2); torso.add(neck);
  lseg(neck, metal, 0.82, 0.68, 0.8, 0.66, 0.2, 0, 0, 0.0); // metal collar
  put(neck, frustum(0.24, 0.06, 0.24, 0.06, 0.22), silver, 0, -0.38, 0.1);
  const head = new T.Group(); head.position.set(0, 0, 0.2); head.scale.setScalar(0.82); neck.add(head);
  lseg(head, fur, 0.82, 0.74, 0.88, 0.8, 0.58, 0, 0, 0.0, 0.0);
  lseg(head, mask, 0.78, 0.45, 0.84, 0.6, 0.45, 0, -0.1, 0.55, 0.04); // wide, short muzzle
  lseg(head, mask, 0.7, 0.2, 0.76, 0.26, 0.5, 0, -0.38, 0.45, 0.0); // heavy jaw
  put(head, frustum(0.22, 0.12, 0.2, 0.12, 0.1), k.plain('#050506'), 0, 0.14, 1.03);
  for (const sx of [-1, 1]) {
    put(head, spike(0.05, 0.2), tooth, sx * 0.24, -0.4, 0.95, 0.15, 0, 0);
    put(head, frustum(0.24, 0.1, 0.2, 0.1, 0.06), eyeM, sx * 0.25, 0.2, 0.62);
    put(head, frustum(0.22, 0.06, 0.22, 0.06, 0.05), mask, sx * 0.24, 0.29, 0.6);
  }
  const ears = [-1, 1].map((sx) => { const g = new T.Group(); g.position.set(sx * 0.42, 0.3, 0.14); head.add(g); put(g, spike(0.26, 0.62), mask, sx * 0.1, 0, 0, 0, 0, -sx * 1.3, 0.35, 1, 1); return g; });
  // the whistle in the corner of the mouth, on a cord
  const whistle = new T.Group(); whistle.position.set(0.2, -0.3, 1.02); head.add(whistle);
  put(whistle, frustum(0.1, 0.1, 0.12, 0.12, 0.2), silver, 0, 0, 0.06, PI / 2);
  put(whistle, frustum(0.08, 0.08, 0.08, 0.08, 0.08), silver, 0, 0.06, -0.04);
  put(neck, frustum(0.03, 0.03, 0.03, 0.03, 0.5), k.plain('#101014'), 0.2, -0.28, 0.5, 0.0, 0, 0.05);
  // arms
  const mkArm = (sx, raised) => {
    const g = new T.Group(); g.position.set(sx * 0.88 * kw, 0.0, 1.05); g.rotation.x = st.lift;
    const segs = raised ? [{ len: 0.8, wt: 0.46, wb: 0.38, ang: -1.0 }, { len: 0.8, wt: 0.36, wb: 0.42, ang: -0.9, m: 1 }] : [{ len: 0.8, wt: 0.46, wb: 0.38, ang: 0.05 }, { len: 0.85, wt: 0.36, wb: 0.42, ang: -0.3, m: 1 }];
    const c = chain(g, segs, [fur, mask], {});
    put(c.tip, frustum(0.4, 0.34, 0.4, 0.34, 0.34), mask, 0, 0.12, 0.05);
    for (const dx of [-0.12, 0, 0.12]) put(c.tip, spike(0.04, 0.12), tooth, dx, 0.0, 0.2, 2.3);
    front.add(g); return { g, c };
  };
  const armL = mkArm(-1, false), armR = mkArm(1, true);
  const mkLeg = (sx) => {
    const g = new T.Group(); g.position.set(sx * 0.4, 0, -0.1);
    const c = chain(g, [{ len: 0.65, wt: 0.58, wb: 0.4, ang: -0.5 }, { len: 0.6, wt: 0.4, wb: 0.3, ang: 0.95 }, { len: 0.45, wt: 0.3, wb: 0.28, ang: -0.5, m: 1 }], [fur, mask], { reach: hipY });
    put(c.tip, frustum(0.36, 0.7, 0.4, 0.74, 0.14), mask, 0, 0.07, 0.2);
    for (const dx of [-0.1, 0.1]) put(c.tip, spike(0.05, 0.14), tooth, dx, 0.04, 0.56, PI / 2);
    hips.add(g); return g;
  };
  const legs = [mkLeg(-1), mkLeg(1)];
  const tail = new T.Group(); tail.position.set(0, 0.0, -0.3); torso.add(tail);
  put(tail, frustum(0.1, 0.1, 0.22, 0.22, 0.6), fur, 0, 0.0, -0.3, -1.9);
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const br = sin(t * 1.5) * 0.015; torso.scale.set(1 + br, 1 + br, 1 + br);
      neck.rotation.x = st.lift * 0.95 + 0.3 + 0.04 * sin(t * 0.8) * calm(ex) + ex * 0.2 * sin(t * 8);
      head.rotation.y = 0.3 * sin(t * 0.5) * calm(ex) + ex * 0.15 * sin(t * 5);
      ears.forEach((e, i) => { e.rotation.x = 0.1 * sin(t * 2.1 + i * 1.3); });
      whistle.rotation.x = 0.05 * sin(t * 1.5) + ex * 0.1 * sin(t * 12);
      armL.g.rotation.x = st.lift + 0.03 * sin(t * 1.1) - ex * (0.9 + 0.5 * sin(t * 7));
      armR.g.rotation.x = st.lift + 0.05 * sin(t * 1.2 + 1) - ex * 0.5 * (1 + sin(t * 9)); armR.g.rotation.z = 0.25;
      tail.rotation.y = (0.3 + ex * 0.4) * sin(t * (2 + ex * 8));
    },
  };
}

/* ------------------------------------------------------------------ Corvo (a plain raven, real size) */
function buildCorvo(k) {
  const { T, rnd, put, frustum, spike, ell, lseg } = k;
  const root = new T.Group();
  const ks = rnd.range(0.94, 1.08);
  const ink = k.jit(rnd.pick([[38, 42, 64], [46, 48, 66], [34, 40, 60]]), 0.12);
  const body = k.fur(ink, { n: 32, belly: mulc(ink, 1.5), amt: 0.2, scars: 0, paint: (g, n) => { for (let y = 0; y < n; y += 4) k.px(g, 0, y, lerpc(ink, [90, 100, 150], 0.4), n, 1); } });
  const dark = k.fur(mulc(ink, 0.6), { amt: 0.15 });
  const beakM = k.hard([12, 14, 18], { cracks: 0 }); // dark beak: it reads in profile against the pale concrete
  const bead = k.plain('#e8e0d0', { emissive: 0.25 });

  const bodyG = new T.Group(); bodyG.position.y = 0.2; bodyG.rotation.x = -0.95; root.add(bodyG);
  put(bodyG, ell(), body, 0, 0, 0, 0, 0, 0, 0.08 * ks, 0.085 * ks, 0.19 * ks);
  lseg(bodyG, dark, 0.14, 0.015, 0.11, 0.015, 0.28, 0, -0.02, -0.45, 0.0); // tail feathers
  const wings = [-1, 1].map((sx) => {
    const g = new T.Group(); g.position.set(sx * 0.075, 0.03, 0.06); bodyG.add(g);
    put(g, frustum(0.02, 0.15, 0.03, 0.12, 0.34), dark, sx * 0.02, 0, -0.14, PI / 2);
    return g;
  });
  const neck = new T.Group(); neck.position.set(0, 0.05, 0.16); bodyG.add(neck);
  const head = new T.Group(); neck.add(head);
  put(head, ell(), body, 0, 0.02, 0.05, 0, 0, 0, 0.065, 0.065, 0.075);
  lseg(head, beakM, 0.01, 0.03, 0.065, 0.08, 0.18, 0, 0.0, 0.09, 0.0); // upper beak: long, deep wedge
  lseg(head, beakM, 0.008, 0.012, 0.05, 0.035, 0.11, 0, -0.04, 0.09, 0.0); // lower beak
  for (const sx of [-1, 1]) put(head, frustum(0.02, 0.02, 0.02, 0.02, 0.02), bead, sx * 0.055, 0.04, 0.06);
  const legs = [-1, 1].map((sx) => {
    const g = new T.Group(); g.position.set(sx * 0.035, 0.17, 0.0); root.add(g);
    put(g, frustum(0.02, 0.02, 0.014, 0.014, 0.17), dark, 0, -0.085, 0);
    put(g, frustum(0.03, 0.12, 0.05, 0.14, 0.01), dark, 0, -0.165, 0.04);
    return g;
  });
  const tris = k.bake();
  return {
    root, tris, tick(t, ex) {
      const hop = ex * abs(sin(t * 7)) * 0.07;
      root.position.y = hop;
      bodyG.position.y = 0.2 + 0.004 * sin(t * 3.2);
      neck.rotation.x = 1.3 + (0.35 * Math.max(0, sin(t * 0.7)) * calm(ex)) + ex * 0.4 * sin(t * 9);
      head.rotation.y = 0.5 * sin(t * 0.9) * calm(ex);
      head.rotation.z = 0.25 * sin(t * 0.6 + 1) * calm(ex);
      wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.04 + ex * 0.25 * abs(sin(t * 10)) + 0.06 * Math.max(0, sin(t * 0.43))); });
      legs.forEach((l, i) => { l.rotation.x = ex * 0.2 * sin(t * 7 + i); });
    },
  };
}

const SPECIES = {
  presa: { stance: 'quad', up: 0.85, build: buildPresa },
  crina: { stance: 'quad', up: 0.95, build: buildCrina },
  pedra: { stance: 'upright', up: 1.38, quad: 0.15, build: buildPedra },
  caudas: { stance: 'quad', up: 1.2, build: buildCaudas },
  maolonga: { stance: 'upright', up: 1.05, quad: 0.5, build: buildMaolonga },
  focinho: { stance: 'upright', up: 1.46, build: buildFocinho },
  corvo: { stance: 'quad', build: buildCorvo },
};

export const ESPECIES = Object.keys(SPECIES);

export function buildAnimal(r, especie, opts = {}) {
  const spec = SPECIES[especie];
  if (!spec) throw new Error('unknown species: ' + especie);
  const seed = opts.seed ?? 1;
  const rnd = mulberry32((Math.imul(seed | 0, 2654435761) ^ hashStr(especie)) >>> 0);
  const stance = opts.stance ?? spec.stance;
  const lift = stance === 'upright' ? (spec.up ?? 0) : (spec.quad ?? 0);
  const kit = makeKit(r, rnd);
  const built = spec.build(kit, { lift, stance });
  const scale = opts.scale ?? 1;
  built.root.scale.setScalar(scale);
  return {
    root: built.root, tris: built.tris, stance,
    update(t, estado) { built.tick(t, exOf(estado)); },
  };
}
