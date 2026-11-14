// Human figures in the style of the realistic-people 3D games of the late 1990s: human
// proportions (head about 1/7 of the height), a few rigid segments, block hands under boxing gloves,
// face and clothes painted on tiny textures. Pure function of the look (seed and options).
//
// Options of `look` beyond the seed (everything missing comes from the seed):
//   glove: 'none' (or false)  bare hands, a block with a thumb in skin colour, same pivot on wristL/R,
//                             in buildHuman and in buildFirstPersonArms. The default is boxing gloves.
//   outfit: 'civil'           everyday clothes instead of trunks and tank top: trousers (or a skirt,
//                             look.skirt), a shirt or blouse with short sleeves (look.shirt, look.pants).
//                             build defaults to 'lean' when outfit is 'civil' and the look says nothing.
//   female: true (or sex: 'f') adult woman: narrower shoulders, long hair by default, no beard,
//                             a little shorter. Combine with outfit: 'civil'.
// In buildFirstPersonArms, with the returned root hung on the camera, shoulderL is on the RIGHT of
// the screen (the figure's left is +X) and shoulderR on the left: rotate each by the side it
// is on, or the arms cross.
//
// Rig: root > body (uniform scale = height / 1.75) > hips > { spine > { neck > head,
// shoulderL > elbowL > wristL, shoulderR > ... }, hipL > kneeL > ankleL, hipR > ... }.
// Neutral pose: standing, arms down, +Z forward, +Y up, +X is the figure's left; every rotation zero.
// Seen from above the pivot: a segment that hangs (arms, legs) swings forward with a negative
// rotation.x (elbow bends forward, knee bends back with a positive one); a segment that points up
// (spine, neck, head) leans forward with a positive rotation.x.
import { resolveLook, paintFace, paintTorso, paintTrunks, paintLegs, paintSkin, paintGlove, paintSleeve, makeTexture, mix, mul } from './faces.js';

const BASE_HEIGHT = 1.75;

/**
 * A rigid segment as a lofted tube. rings: [{ y, rx, rz, cx, cz }] (any vertical order); the front
 * is +Z. Positions are shifted by `oy` (the joint's height) so the pivot sits at the origin.
 * u runs around (front centre at 0.5), v from the lowest ring (0) to the highest (1).
 */
function loft(THREE, rings, { n = 8, a0 = -Math.PI, a1 = Math.PI, oy = 0, ox = 0, caps = 'both', uv } = {}) {
  const pos = [], nor = [], uvs = [];
  const ys = rings.map((q) => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const vOf = (y) => (y1 === y0 ? 0 : (y - y0) / (y1 - y0));
  const ring = (k, i) => {
    const q = rings[k], th = a0 + ((a1 - a0) * i) / n;
    const s = Math.sin(th), c = Math.cos(th);
    const a = rings[Math.min(k + 1, rings.length - 1)], b = rings[Math.max(k - 1, 0)];
    const dy = a.y - b.y || 1e-6, slope = ((a.rx + a.rz) / 2 - (b.rx + b.rz) / 2) / dy;
    const hx = s / q.rx, hz = c / q.rz, hl = Math.hypot(hx, hz) || 1;
    const nn = [hx / hl, -slope, hz / hl], nl = Math.hypot(...nn);
    const p = [(q.cx ?? 0) + s * q.rx - ox, q.y - oy, (q.cz ?? 0) + c * q.rz];
    const t = uv ? uv(p[0] + ox, q.y, p[2], i / n, vOf(q.y)) : [i / n, vOf(q.y)];
    return { p, n: nn.map((x) => x / nl), t };
  };
  const tri = (A, B, C, flat) => {
    const e1 = B.p.map((x, i) => x - A.p[i]), e2 = C.p.map((x, i) => x - A.p[i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const want = flat ?? A.n.map((x, i) => x + B.n[i] + C.n[i]);
    if (cr[0] * want[0] + cr[1] * want[1] + cr[2] * want[2] < 0) [B, C] = [C, B];
    for (const V of [A, B, C]) { pos.push(...V.p); nor.push(...(flat ? flat : V.n)); uvs.push(...V.t); }
  };
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const A = ring(k, i), B = ring(k, i + 1), C = ring(k + 1, i), D = ring(k + 1, i + 1);
      tri(A, B, C); tri(B, D, C);
    }
  }
  const cap = (k, up) => {
    if (!up) return;
    const q = rings[k], mid = { p: [(q.cx ?? 0) - ox, q.y - oy, q.cz ?? 0], n: [0, up, 0], t: [0.5, vOf(q.y)] };
    const dir = [0, up, 0];
    for (let i = 0; i < n; i++) {
      const A = ring(k, i), B = ring(k, i + 1);
      tri(mid, { ...A, t: [A.t[0], vOf(q.y)] }, { ...B, t: [B.t[0], vOf(q.y)] }, dir);
    }
  };
  if (caps !== 'none' && a1 - a0 > 6.2) {
    const lo = ys.indexOf(y0), hi = ys.indexOf(y1);
    if (caps === 'both' || caps === 'bottom') cap(lo, -1);
    if (caps === 'both' || caps === 'top') cap(hi, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** A box with optional taper at the front, used for feet and the thumb. */
function block(THREE, w, h, d, { cx = 0, cy = 0, cz = 0, taper = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (taper && z > 0) { x *= 1 - taper; y = y < 0 ? y : y * (1 - taper * 0.7); }
    p.setXYZ(i, x + cx, y + cy, z + cz);
  }
  g.computeVertexNormals();
  return g;
}

/** The head profile (rings) as a function of the face width and jaw. */
function headRings(L, bf) {
  const fw = (0.96 + (bf - 1) * 0.5) * 1, jw = L.jaw * (1 + (bf - 1) * 0.6);
  return [
    { y: 1.50, rx: 0.030 * jw, rz: 0.044, cz: 0.034 },
    { y: 1.525, rx: 0.060 * jw * fw, rz: 0.074, cz: 0.020 },
    { y: 1.56, rx: 0.080 * fw * jw, rz: 0.094, cz: 0.004 },
    { y: 1.62, rx: 0.090 * fw, rz: 0.103 },
    { y: 1.69, rx: 0.088 * fw, rz: 0.100 },
    { y: 1.73, rx: 0.066 * fw, rz: 0.078 },
    { y: 1.75, rx: 0.026 * fw, rz: 0.032 },
  ];
}
function profileAt(rings, y) {
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y), l = (f) => (a[f] ?? 0) + ((b[f] ?? 0) - (a[f] ?? 0)) * t;
      return { y, rx: l('rx'), rz: l('rz'), cx: 0, cz: l('cz') };
    }
  }
  return { ...rings[rings.length - 1], y };
}
const grow = (q, s, dy = 0) => ({ ...q, y: q.y + dy, rx: q.rx * s, rz: q.rz * s, cz: (q.cz ?? 0) * s - 0.002 });

function buildParts(r, L) {
  const THREE = r.THREE;
  const bi = { lean: 0, mid: 1, heavy: 2 }[L.build];
  const fem = L.female ? 0.88 : 1;
  const bw = fem * [0.9, 1.0, 1.2][bi], bd = [0.9, 1.0, 1.25][bi], lm = [0.84, 1.0, 1.28][bi];
  const belly = [0, 0.006, 0.05][bi], bf = [0.97, 1.0, 1.1][bi];
  const sx = 0.196 * (0.94 + 0.06 * bw) * (L.female ? 0.95 : 1);                  // shoulder joint x
  const T = (c) => makeTexture(THREE, c);
  void T;
  const hairRgb = L.style === 'bald' ? L.skin : L.style === 'buzz' ? mix(L.hair, L.skin, 0.5) : L.hair;
  const skinTex = paintSkin(THREE, L), legTex = paintLegs(THREE, L);
  const M = {
    skin: r.mat(0xffffff, { map: skinTex }),
    face: r.mat(0xffffff, { map: paintFace(THREE, L) }),
    torso: r.mat(0xffffff, { map: paintTorso(THREE, L) }),
    trunks: r.mat(0xffffff, { map: paintTrunks(THREE, L) }),
    legs: r.mat(0xffffff, { map: legTex }),
    glove: L.bare ? null : r.mat(0xffffff, { map: paintGlove(THREE, L) }),
    sleeve: L.civil ? r.mat(0xffffff, { map: paintSleeve(THREE, L) }) : null,
    hair: r.mat(new THREE.Color(...hairRgb.map((x) => x / 255)), { map: 'skin' }),
    shoe: r.mat(new THREE.Color(...L.shoe.map((x) => x / 255)), { map: 'cloth' }),
  };
  return { THREE, bw, bd, lm, belly, bf, sx, M, loft: (...a) => loft(THREE, ...a) };
}

export function buildHuman(r, look = {}) {
  const L = resolveLook(r.THREE, look);
  const { THREE, bw, bd, lm, belly, bf, sx, M } = buildParts(r, L);
  const lf = (rings, o) => loft(THREE, rings, o);

  const root = new THREE.Group(); root.name = 'human';
  const body = new THREE.Group(); body.scale.setScalar(L.scale); root.add(body);
  const abs = {}; // absolute (rest) heights, to place each joint relative to its parent
  const joints = {};
  const joint = (name, parent, x, y) => {
    const g = new THREE.Group(); g.name = name;
    const p = parent ? abs[parent.name] : { x: 0, y: 0 };
    g.position.set(x - p.x, y - p.y, 0); abs[name] = { x, y };
    (parent ?? body).add(g); joints[name] = g; return g;
  };
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

  const hips = joint('hips', null, 0, 0.94);
  const spine = joint('spine', hips, 0, 1.03);
  const neck = joint('neck', spine, 0, 1.47);
  const head = joint('head', neck, 0, 1.54);

  const pw = L.female ? (bw / 0.88) * 0.98 : bw; // women: hips not as narrow as shoulders
  // pelvis in trunks (its top is the waistband)
  mesh(lf([
    { y: 0.80, rx: 0.150 * pw, rz: 0.098 * bd },
    { y: 0.88, rx: 0.168 * pw, rz: 0.108 * bd },
    { y: 0.97, rx: 0.164 * pw, rz: 0.108 * bd + belly * 0.6 },
    { y: 1.04, rx: 0.138 * pw, rz: 0.096 * bd + belly },
  ], { n: 8, oy: 0.94, caps: 'bottom' }), M.trunks, hips);

  if (L.skirt) {
    mesh(lf([
      { y: 0.56, rx: 0.27 * pw, rz: 0.21 },
      { y: 0.70, rx: 0.24 * pw, rz: 0.18 },
      { y: 0.86, rx: 0.19 * pw, rz: 0.13 },
    ], { n: 8, oy: 0.94, caps: 'bottom' }), M.trunks, hips);
  }
  // torso: waist to shoulders
  mesh(lf([
    { y: 1.03, rx: 0.136 * bw, rz: 0.094 * bd + belly },
    { y: 1.14, rx: 0.142 * bw, rz: 0.097 * bd + belly * 1.3 },
    { y: 1.27, rx: 0.172 * bw, rz: 0.108 * bd },
    { y: 1.38, rx: 0.186 * bw, rz: 0.106 * bd },
    { y: 1.43, rx: 0.170 * bw, rz: 0.090 * bd },
    { y: 1.465, rx: 0.075 * bw, rz: 0.062 * bd },
  ], { n: 8, oy: 1.03 }), M.torso, spine);

  // neck and head
  const nw = 0.050 * (0.9 + 0.2 * bw) * (bf > 1.05 ? 1.1 : 1);
  mesh(lf([{ y: 1.46, rx: nw * 1.2, rz: nw * 1.1 }, { y: 1.50, rx: nw, rz: nw }, { y: 1.56, rx: nw, rz: nw, cz: 0.004 }], { n: 6, oy: 1.47, caps: 'none' }), M.skin, neck);
  const HR = headRings(L, bf);
  const faceUV = (x, y, z, u, v) => [0.5 + x / 0.19, (y - 1.50) / 0.25];
  mesh(lf(HR, { n: 8, oy: 1.54, uv: faceUV }), M.face, head);
  // hair shells: the crown covers the top (and the forehead down to the hairline), the back covers the nape
  const cutY = 1.675;
  if (L.style === 'bald' || L.style === 'buzz') {
    const s = L.style === 'bald' ? 1.01 : 1.03;
    mesh(lf([cutY, 1.69, 1.73, 1.752].map((y) => grow(profileAt(HR, y), s)), { n: 8, oy: 1.54, caps: 'top' }), M.hair, head);
    mesh(lf([1.505, 1.58, 1.64, cutY + 0.01].map((y) => grow(profileAt(HR, y), s)), { n: 8, a0: 0.52 * Math.PI, a1: 1.48 * Math.PI, oy: 1.54 }), M.hair, head);
  } else {
    const long = L.style === 'long';
    mesh(lf([cutY, 1.69, 1.73, 1.756].map((y) => grow(profileAt(HR, y), 1.07)), { n: 8, oy: 1.54, caps: 'top' }), M.hair, head);
    const low = long ? 1.38 : 1.505;
    const ys = long ? [low, 1.46, 1.52, 1.60, cutY + 0.01] : [low, 1.58, 1.64, cutY + 0.01];
    mesh(lf(ys.map((y) => { const q = grow(profileAt(HR, Math.max(y, 1.5)), long ? 1.16 : 1.06); return { ...q, y }; }), { n: 8, a0: (long ? 0.36 : 0.52) * Math.PI, a1: (long ? 1.64 : 1.48) * Math.PI, oy: 1.54, caps: 'none' }), M.hair, head);
  }
  // ears and nose
  for (const s of [-1, 1]) mesh(block(THREE, 0.012, 0.045 * L.ear, 0.03 * L.ear, { cx: s * 0.097 * (0.96 + (bf - 1) * 0.5), cy: 1.62 - 1.54, cz: -0.012 }), M.skin, head);
  const nz = 0.100 * 1;
  mesh(lf([
    { y: 1.572, rx: 0.026 * L.nose, rz: 0.020, cz: nz + 0.006 },
    { y: 1.600, rx: 0.017 * L.nose, rz: 0.026 * L.nose, cz: nz + 0.014 },
    { y: 1.640, rx: 0.012, rz: 0.014, cz: nz + 0.002 },
  ], { n: 4, oy: 1.54, caps: 'none' }), M.skin, head);

  // arms, legs
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const sh = joint('shoulder' + side, spine, sg * sx, 1.41);
    const ua = 0.056 * lm, fa = 0.046 * lm;
    mesh(lf([
      { y: 1.455, rx: ua * 0.55, rz: ua * 0.55 },
      { y: 1.425, rx: ua * 1.15, rz: ua * 1.15 },
      { y: 1.34, rx: ua * 1.1, rz: ua * 1.1 },
      { y: 1.17, rx: ua * 0.82, rz: ua * 0.85 },
    ], { n: 6, oy: 1.41, caps: 'top' }), L.civil ? M.sleeve : M.skin, sh);
    const el = joint('elbow' + side, sh, sg * sx, 1.15);
    mesh(lf([
      { y: 1.15, rx: ua * 0.82, rz: ua * 0.85 },
      { y: 1.07, rx: fa * 1.04, rz: fa * 1.02 },
      { y: 0.92, rx: fa * 0.85, rz: fa * 0.8 },
    ], { n: 6, oy: 1.15, caps: 'none' }), M.skin, el);
    const wr = joint('wrist' + side, el, sg * sx, 0.90);
    if (L.bare) {
      mesh(lf([
        { y: 0.90, rx: fa * 0.85, rz: fa * 0.8 },
        { y: 0.865, rx: 0.026, rz: 0.040 },
        { y: 0.82, rx: 0.030, rz: 0.050, cz: 0.004 },
        { y: 0.74, rx: 0.032, rz: 0.054, cz: 0.008 },
        { y: 0.715, rx: 0.028, rz: 0.044, cz: 0.008 },
      ], { n: 6, oy: 0.90 }), M.skin, wr);
      mesh(block(THREE, 0.022, 0.07, 0.024, { cx: -sg * 0.012, cy: -0.115, cz: 0.062, taper: 0.1 }), M.skin, wr);
    } else {
    const gw = 0.074;
    mesh(lf([
      { y: 0.90, rx: fa * 0.85, rz: fa * 0.8 },
      { y: 0.86, rx: 0.060, rz: 0.058 },
      { y: 0.78, rx: gw, rz: 0.076, cz: 0.008 },
      { y: 0.70, rx: gw * 0.95, rz: 0.074, cz: 0.014 },
      { y: 0.655, rx: 0.045, rz: 0.048, cz: 0.012 },
    ], { n: 8, oy: 0.90 }), M.glove, wr);
    mesh(block(THREE, 0.034, 0.075, 0.06, { cx: -sg * 0.06, cy: -0.14, cz: 0.045, taper: 0.1 }), M.glove, wr);
    }

    const hp = joint('hip' + side, hips, sg * 0.095, 0.90);
    const tw = 0.092 * lm;
    mesh(lf([
      { y: 0.92, rx: tw, rz: tw * 1.05 },
      { y: 0.80, rx: tw * 1.0, rz: tw * 1.05 },
      { y: 0.62, rx: tw * 0.82, rz: tw * 0.85 },
      { y: 0.50, rx: tw * 0.66, rz: tw * 0.7 },
    ], { n: 6, oy: 0.90 }), M.legs, hp);
    const kn = joint('knee' + side, hp, sg * 0.095, 0.50);
    const sw = tw * 0.66;
    mesh(lf([
      { y: 0.50, rx: sw, rz: sw * 1.05 },
      { y: 0.38, rx: sw * 1.0, rz: sw * 1.12, cz: -0.012 },
      { y: 0.22, rx: sw * 0.74, rz: sw * 0.78 },
      { y: 0.10, rx: sw * 0.66, rz: sw * 0.7 },
    ], { n: 6, oy: 0.50 }), L.civil && !L.skirt ? M.legs : M.skin, kn);
    const an = joint('ankle' + side, kn, sg * 0.095, 0.09);
    mesh(block(THREE, 0.098 * lm ** 0.4, 0.085, 0.27, { cy: -0.048, cz: 0.062, taper: 0.28 }), M.shoe, an);
  }

  const eyeHeight = 1.64 * L.scale;
  return { root, joints: { hips, spine, neck, head, ...Object.fromEntries(Object.entries(joints).filter(([k]) => !['hips', 'spine', 'neck', 'head'].includes(k))) }, height: BASE_HEIGHT * L.scale, eyeHeight, look: L };
}

/**
 * First-person arms for the camera (which looks along -Z from the origin = the eyes). The guard is
 * baked into the geometry: with every rotation at zero both gloves sit up in front of the chin,
 * low on the screen. Rotate shoulder/elbow/wrist around their pivots to punch.
 */
export function buildFirstPersonArms(r, look = {}) {
  const L = resolveLook(r.THREE, look);
  const { THREE, lm, M } = buildParts(r, L);
  const lf = (rings, o) => loft(THREE, rings, o);
  const root = new THREE.Group(); root.name = 'fp-arms';
  const joints = {};
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const ua = 0.056 * lm, fa = 0.046 * lm;
    const sh = new THREE.Group(); sh.name = 'shoulder' + side; sh.position.set(sg * 0.21, -0.18, -0.02); root.add(sh);
    // upper arm: from the shoulder down, out and forward to the elbow
    const d1 = norm([sg * 0.14, -0.70, -0.70]);
    const bone1 = new THREE.Group(); bone1.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d1)); sh.add(bone1);
    bone1.add(new THREE.Mesh(lf([
      { y: 0.0, rx: ua * 1.1, rz: ua * 1.1 }, { y: -0.12, rx: ua * 1.0, rz: ua * 1.0 }, { y: -0.29, rx: ua * 0.82, rz: ua * 0.85 },
    ], { n: 6, caps: 'none' }), M.skin));
    const el = new THREE.Group(); el.name = 'elbow' + side; el.position.set(...d1.map((x) => x * 0.29)); sh.add(el);
    // forearm: up, forward and in, the guard
    const d2 = norm([-sg * 0.22, 0.58, -0.78]);
    const bone2 = new THREE.Group(); bone2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d2)); el.add(bone2);
    bone2.add(new THREE.Mesh(lf([
      { y: 0.0, rx: ua * 0.82, rz: ua * 0.85 }, { y: -0.08, rx: fa * 1.04, rz: fa * 1.02 }, { y: -0.26, rx: fa * 0.85, rz: fa * 0.8 },
    ], { n: 6, caps: 'none' }), M.skin));
    const wr = new THREE.Group(); wr.name = 'wrist' + side; wr.position.set(...d2.map((x) => x * 0.26)); el.add(wr);
    const bone3 = new THREE.Group(); bone3.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...norm([-sg * 0.10, 0.30, -0.95]))); wr.add(bone3);
    if (L.bare) {
      // a low-poly hand seen from behind: a wrist, a palm, a separate thumb and four fingers of two
      // joints each that curl into a fist (joints['curl' + side](k), k 0 open .. 1 fist)
      bone3.add(new THREE.Mesh(lf([
        { y: 0.0, rx: fa * 0.85, rz: fa * 0.8 }, { y: -0.03, rx: 0.040, rz: 0.028 }, { y: -0.075, rx: 0.052, rz: 0.020, cz: 0.002 },
      ], { n: 6 }), M.skin));
      bone3.add(new THREE.Mesh(block(THREE, 0.100, 0.060, 0.026, { cx: 0, cy: -0.07, cz: 0.0, taper: 0.06 }), M.skin));
      const fingers = [];
      const fl = [0.046, 0.054, 0.050, 0.040];
      for (let i = 0; i < 4; i++) {
        const fx = -0.038 + i * 0.0255;
        const g1 = new THREE.Group(); g1.position.set(fx, -0.098, 0.002); bone3.add(g1);
        g1.add(new THREE.Mesh(block(THREE, 0.0225, fl[i], 0.022, { cy: -fl[i] / 2 }), M.skin));
        const g2 = new THREE.Group(); g2.position.set(0, -fl[i], 0); g1.add(g2);
        g2.add(new THREE.Mesh(block(THREE, 0.0205, fl[i] * 0.8, 0.02, { cy: -fl[i] * 0.4 }), M.skin));
        fingers.push([g1, g2]);
      }
      const th = new THREE.Group(); th.position.set(-sg * 0.056, -0.055, 0.004); bone3.add(th);
      th.rotation.z = sg * 0.55; th.rotation.x = 0.1;
      th.add(new THREE.Mesh(block(THREE, 0.026, 0.05, 0.024, { cy: -0.025 }), M.skin));
      const th2 = new THREE.Group(); th2.position.set(0, -0.05, 0); th.add(th2);
      th2.add(new THREE.Mesh(block(THREE, 0.022, 0.034, 0.021, { cy: -0.017 }), M.skin));
      const curl = (k) => {
        for (const [g1, g2] of fingers) { g1.rotation.x = 0.25 + 1.25 * k; g2.rotation.x = 0.3 + 1.15 * k; }
        th.rotation.z = sg * (0.55 - 0.45 * k); th.rotation.x = 0.1 + 0.9 * k; th2.rotation.x = 0.3 * k;
      };
      curl(0.2);
      joints['curl' + side] = curl;
    } else {
    const gw = 0.074;
    bone3.add(new THREE.Mesh(lf([
      { y: 0.0, rx: fa * 0.85, rz: fa * 0.8 }, { y: -0.04, rx: 0.060, rz: 0.058 },
      { y: -0.12, rx: gw, rz: 0.076, cz: 0.008 }, { y: -0.20, rx: gw * 0.95, rz: 0.074, cz: 0.014 }, { y: -0.245, rx: 0.045, rz: 0.048, cz: 0.012 },
    ], { n: 8 }), M.glove));
    }
    joints['shoulder' + side] = sh; joints['elbow' + side] = el; joints['wrist' + side] = wr;
  }
  // ---- life for the hands (nothing calls these by default; with no call the arms stay exactly as they were)
  // grip(kind, side): the fingers of a bare hand for what it holds ('aberta' | 'solta' | 'bico' | 'lanterna' | 'carrinho');
  // side is 'right' | 'left' (on the screen) or 'both'. A gloved hand has no fingers: it does nothing.
  const GRIPS = { aberta: 0, solta: 0.2, bico: 0.75, lanterna: 0.9, carrinho: 0.65 };
  const grip = (kind, side = 'both') => {
    const k = GRIPS[kind] ?? 0.2;
    if (side !== 'left') joints.curlL?.(k);
    if (side !== 'right') joints.curlR?.(k);
  };
  // idle(t, walk, phase): breathing and a hand-held sway on the root that hangs on the camera, plus a step bob when walk > 0
  // (phase in radians from the caller's walk, or from t). Offsets stay under 2 cm and never move the hands toward the lens.
  const idle = (t, walk = 0, phase = t * 7) => {
    const w = Math.max(0, Math.min(1, walk));
    root.position.set(Math.sin(t * 0.9) * 0.003 + Math.cos(phase * 0.5) * 0.008 * w, Math.sin(t * 1.3) * 0.004 - Math.abs(Math.sin(phase * 0.5)) * 0.012 * w, 0);
    root.rotation.set(Math.sin(t * 0.8 + 1) * 0.004, 0, Math.sin(t * 0.6) * 0.006 + Math.sin(phase * 0.5) * 0.01 * w);
  };
  return { root, joints, grip, idle };
}
