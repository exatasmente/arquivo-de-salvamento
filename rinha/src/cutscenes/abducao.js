// The abduction props shared by the cutscenes that take someone away: the cube the creatures carry, the beam of
// light that pulls a person up into it, the freezing gun and the camera path of the pull. All pure functions of time.
//
//  - buildCube(r)       a smooth dark block with lines of light and runes on every face; its underside slides open.
//  - buildBeam(r)       a pale blue-green column of light with specks rising in it (additive, no depth writes).
//  - buildFreezeGun(r)  a chunky barrel with a crystal tip; hang it on a creature's wrist (the barrel points along -Y).
//  - pullPath(l, A)     the eye of the person who is pulled: shrinks first (the world swells), then rises into the cube.
import { mulberry32 } from '../rng.js';
import { ramp, smooth, lerp } from './common.js';

const BEAM = '#aef5df';

/** A rune texture: a few angular strokes of light on a dark ground, seeded. */
function runeTexture(T, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), r = mulberry32(seed * 131 + 7);
  g.fillStyle = '#2c3a48'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#7fe9cf';
  for (let i = 0; i < 5; i++) { // strokes on a 5 x 5 grid, so the glyph reads as one sign
    const x = 6 + ((r() * 4) | 0) * 5, y = 6 + ((r() * 4) | 0) * 5;
    if (r() < 0.5) g.fillRect(x, y, 6 + ((r() * 2) | 0) * 5, 2); else g.fillRect(x, y, 2, 6 + ((r() * 2) | 0) * 5);
  }
  g.fillRect(14, 14, 4, 4);
  g.fillStyle = '#4fb8a2'; g.fillRect(2, 2, 28, 1); g.fillRect(2, 29, 28, 1); g.fillRect(2, 2, 1, 28); g.fillRect(29, 2, 1, 28); // the frame of the face
  const t = new T.CanvasTexture(c);
  t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.NoColorSpace;
  return t;
}

/** The cube: S = 0.5 m. Its local -Y face is the door; open(0..1) slides it aside and shows the lit inside. */
export function buildCube(r, S = 0.5) {
  const T = r.THREE, root = new T.Group(), h = S / 2, e = 0.012;
  const faces = [];
  const faceDefs = [['px', [h, 0, 0], [0, Math.PI / 2, 0]], ['nx', [-h, 0, 0], [0, -Math.PI / 2, 0]], ['py', [0, h, 0], [-Math.PI / 2, 0, 0]],
    ['nz', [0, 0, -h], [0, Math.PI, 0]], ['pz', [0, 0, h], [0, 0, 0]], ['ny', [0, -h, 0], [Math.PI / 2, 0, 0]]];
  faceDefs.forEach(([n, p, rot], i) => {
    const m = new T.Mesh(new T.PlaneGeometry(S, S), r.mat('#ffffff', { map: runeTexture(T, i + 1), emissive: 0.55, fogged: 0.4 }));
    m.position.set(...p); m.rotation.set(...rot); root.add(m); faces.push([n, m]);
  });
  const door = faces.find(([n]) => n === 'ny')[1];
  // the lit inside, seen through the door and from under it
  const inner = new T.Mesh(new T.BoxGeometry(S * 0.96, S * 0.96, S * 0.96), r.mat('#e4fff6', { emissive: 1, fogged: 0, side: T.BackSide }));
  inner.visible = false; root.add(inner);
  // lines of light along the twelve edges
  const lineM = r.mat('#9be8d0', { emissive: 1, fogged: 0.3 });
  const lines = [];
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(S + e, e, e), lineM); m.position.set(0, sy * h, sz * h); root.add(m); lines.push(m); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(e, S + e, e), lineM); m.position.set(sx * h, 0, sz * h); root.add(m); lines.push(m); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(e, e, S + e), lineM); m.position.set(sx * h, sy * h, 0); root.add(m); lines.push(m); }
  root.visible = false;
  return {
    root, size: S,
    /** open 0..1 (door slides), glow 0..1 (the lines and runes brighten). */
    set({ open = 0, glow = 0.3, spin = 0 } = {}) {
      door.position.x = open * (S * 1.02); door.visible = open < 0.98; inner.visible = open > 0.02;
      for (const [, m] of faces) m.material.uniforms.uEmissive.value = 0.45 + 0.5 * glow;
      lineM.uniforms.uEmissive.value = 0.7 + 0.3 * glow;
      root.rotation.y = spin;
    },
  };
}

/** The column of light. set({ x, z, top, bottom, radius, grow 0..1, alpha, t }): grows from the top down to the bottom. */
export function buildBeam(r) {
  const T = r.THREE, root = new T.Group(), N = 40, rand = mulberry32(2718);
  const add = (opacity, color = BEAM) => r.mat(color, { emissive: 1, fogged: 0, opacity, transparent: true, depthWrite: false, side: T.DoubleSide });
  const outerM = add(0.1), innerM = add(0.16, '#d8fff0');
  for (const m of [outerM, innerM]) m.blending = T.AdditiveBlending;
  const outer = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 12, 1, true), outerM), inner = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true), innerM);
  outer.renderOrder = 4; inner.renderOrder = 5; root.add(outer, inner);
  const poolM = add(0.4); poolM.blending = T.AdditiveBlending;
  const pool = new T.Mesh(new T.RingGeometry(0.4, 1, 16), poolM); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 4; root.add(pool);
  const specM = r.mat('#e8fff6', { emissive: 1, fogged: 0, opacity: 0.9, transparent: true, depthWrite: false }); specM.blending = T.AdditiveBlending;
  const specs = Array.from({ length: N }, () => ({ m: new T.Mesh(new T.OctahedronGeometry(1, 0), specM), a: rand() * Math.PI * 2, rr: 0.15 + rand() * 0.8, ph: rand(), sp: 0.12 + rand() * 0.2, sz: 0.02 + rand() * 0.035 }));
  for (const s of specs) { s.m.renderOrder = 5; root.add(s.m); }
  root.visible = false;
  return {
    root,
    set({ x = 0, z = 0, top = 4, bottom = 0, radius = 0.55, grow = 1, alpha = 1, t = 0, sizeK = 1 } = {}) {
      root.visible = grow > 0.01 && alpha > 0.01;
      const len = (top - bottom) * smooth(grow), mid = top - len / 2;
      for (const [m, rk] of [[outer, 1], [inner, 0.45]]) { m.position.set(x, mid, z); m.scale.set(radius * rk, Math.max(0.001, len), radius * rk); }
      outerM.opacity = 0.1 * alpha; innerM.opacity = 0.16 * alpha; poolM.opacity = 0.4 * alpha * smooth(ramp(grow, 0.7, 1));
      pool.position.set(x, bottom + 0.012, z); pool.scale.set(radius * (0.95 + 0.05 * Math.sin(t * 9)), radius * (0.95 + 0.05 * Math.sin(t * 9)), 1); pool.visible = grow > 0.7;
      specM.opacity = 0.9 * alpha;
      for (const s of specs) { // rise inside the column, wrapping, with a slight spiral
        const u = (s.ph + t * s.sp) % 1, y = bottom + u * (top - bottom) * smooth(grow), a = s.a + t * 0.8;
        s.m.position.set(x + Math.cos(a) * radius * s.rr, y, z + Math.sin(a) * radius * s.rr); s.m.scale.setScalar(s.sz * sizeK); s.m.rotation.set(t * 3 + s.a, t * 2, 0);
        s.m.visible = y < bottom + len + 0.01;
      }
    },
  };
}

/** The freezing gun: the barrel points along -Y of the parent (the direction a hanging hand points). */
export function buildFreezeGun(r) {
  const T = r.THREE, g = new T.Group();
  const body = r.mat('#38505c', { map: 'metal', fogged: 0.5 }), dark = r.mat('#1b2a33', { fogged: 0.5 }), glow = r.mat('#9ae6ff', { emissive: 1, fogged: 0.2 });
  const box = (sx, sy, sz, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); g.add(o); return o; };
  box(0.1, 0.26, 0.12, body, 0, -0.05, 0);                         // the grip and the chamber
  box(0.07, 0.2, 0.07, dark, 0, -0.26, 0);                         // the barrel
  for (const y of [-0.2, -0.28, -0.36]) box(0.12, 0.025, 0.12, glow, 0, y, 0); // coils of cold light
  const tip = new T.Mesh(new T.OctahedronGeometry(0.06, 0), glow); tip.scale.set(0.8, 1.7, 0.8); tip.position.set(0, -0.46, 0); g.add(tip);
  const haloM = r.mat('#cdf3ff', { emissive: 1, fogged: 0, opacity: 0.5, transparent: true, depthWrite: false }); haloM.blending = T.AdditiveBlending;
  const halo = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), haloM); halo.position.set(0, -0.5, 0); halo.renderOrder = 5; g.add(halo);
  g.visible = false;
  return { root: g, muzzle: new T.Vector3(0, -0.52, 0), charge(k) { halo.scale.setScalar(0.5 + 0.7 * k); haloM.opacity = 0.2 + 0.4 * k; } };
}

/** A jet of frost between two points (additive cone): a, b = [x, y, z]; k 0..1 = how far it reaches and how bright. */
export function buildFrostJet(r, color = '#d4f3ff') {
  const T = r.THREE, m = r.mat(color, { emissive: 1, fogged: 0, opacity: 0.4, transparent: true, depthWrite: false, side: T.DoubleSide }); m.blending = T.AdditiveBlending;
  const geo = new T.CylinderGeometry(1, 0.08, 1, 8, 1, true); geo.translate(0, -0.5, 0); // top radius 1 (far end), bottom 0.08 (at the muzzle), origin at the muzzle
  const o = new T.Mesh(geo, m); o.renderOrder = 5; o.visible = false;
  const up = new T.Vector3(0, 1, 0), dir = new T.Vector3();
  return {
    root: o,
    set(a, b, k, spread = 0.5) {
      o.visible = k > 0.01; if (!o.visible) return;
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = dir.length() * k; dir.normalize();
      // the cylinder's axis is +Y with the narrow end at the origin and the wide end at -1: flip it so the wide end goes along dir
      o.position.set(...a); o.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir); o.scale.set(spread * k, len, spread * k); m.opacity = (o.userData.max ?? 0.22) * k; void up;
    },
  };
}

/**
 * The eye of the person who is pulled into the cube. l = seconds from the start of the pull.
 * A = { e0: [x, y, z] where the eye starts, hov: [x, y, z] the cube above, shrink: [a, b], rise: [c, d], low }
 * First the person shrinks (a to b): the eye drops from e0 to `low` and k grows, so everything swells around; then the person rises
 * (c to d) up the column to the open underside of the cube, a little in a spiral. Returns { eye, k }; k is the shrink factor (use it for
 * the camera near plane).
 */
export function pullPath(l, A) {
  const s = smooth(ramp(l, A.shrink[0], A.shrink[1])), u = ramp(l, A.rise[0], A.rise[1]), v = u * u * (3 - 2 * u);
  const y0 = lerp(A.e0[1], A.low, s), top = A.hov[1] + 0.02;
  const y = lerp(y0, top, v * v), a = u * 5.0, sp = (1 - v) * 0.1 * s;
  return { eye: [lerp(A.e0[0], A.hov[0], v) + Math.cos(a) * sp, y, lerp(A.e0[2], A.hov[2], v) + Math.sin(a) * sp], k: lerp(1, 1 / (A.low / A.e0[1]), s) };
}

/** Makes a figure glow like light (k 1) and back to its own colours (k 0): emissive up and colour pulled toward pale blue-green. */
export function glowBody(root, k) {
  root.traverse((o) => {
    const u = o.isMesh && o.material?.uniforms; if (!u?.uColor) return;
    const m = o.material; m.userData.e0 ??= u.uEmissive.value; m.userData.c0 ??= u.uColor.value.clone();
    u.uEmissive.value = lerp(m.userData.e0, 1, k); u.uColor.value.copy(m.userData.c0).lerp({ r: 0.7, g: 1, b: 0.9, isColor: true }, k);
  });
}

/** Aims at `target` from `eye` but never more than 72 degrees up: straight up would make the camera spin about its own axis. */
export function clampUp(eye, target) {
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2], h = Math.hypot(dx, dz) || 1e-6, q = dy / Math.tan(1.26);
  return dy > h * Math.tan(1.26) ? [eye[0] + (dx / h) * q, target[1], eye[2] + (dz / h) * q] : target;
}

/** Shrinks the camera: near plane and far plane follow the factor k (1 = normal). Call every frame from the cutscene. */
export function shrinkCamera(r, k) { r.camera.near = 0.03 / k; r.camera.far = 90 / Math.max(1, k * 0.5); r.camera.updateProjectionMatrix(); }

/** Tints the first-person arms toward ice blue (k 0..1), remembering the original colours. */
export function tintArms(arms, k) {
  arms.root.traverse((o) => {
    const u = o.isMesh && o.material?.uniforms?.uColor; if (!u) return;
    const m = o.material; m.userData.base ??= u.value.clone();
    u.value.copy(m.userData.base).lerp({ r: 0.55, g: 0.8, b: 1.0, isColor: true }, k * 0.7);
  });
}
