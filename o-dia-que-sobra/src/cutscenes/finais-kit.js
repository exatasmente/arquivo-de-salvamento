// What the five ending cutscenes (final1 ... final5) share: a camera track by position and heading, the dawn
// light, the people (the manager, the old attendant, the new attendant), the things held in the hands (the rod, the
// new calendar), the pages of a calendar painted on a canvas, a car that drives a polyline, and the shooter of the
// pictures of a security camera. Everything is a pure function of time: no Math.random, no real clock.
import { lerp, smooth, ramp, clamp } from './common.js';
import { camPoint, castSpec } from './stagecraft.js';
import { buildCustomer } from '../models/customer.js';
import { canvasTexture, paintSol } from '../scenes/paint.js';
import { mulberry32 } from '../rng.js';

export const PI = Math.PI;
export const EYE = 1.68;

// ---------------------------------------------------------------------------------------------
// Camera by heading. keys: [{ t, eye: [x, y, z], yaw, pitch?, ease? }]. yaw 0 looks toward +z (as the bodies do),
// pitch up is positive. Between two keys everything goes by smoothstep (it stops at both ends), or linearly with
// `ease: 'lin'` on the first key of the pair (a walk that goes through a key without stopping). Unwrapped angles:
// the turn between two keys is the difference as written, so a half turn is written as +/- PI.
export function aimTrack(keys) {
  const K = keys.slice().sort((a, b) => a.t - b.t);
  const out = (eye, yaw, pitch) => ({ eye, yaw, pitch, look: [eye[0] + Math.sin(yaw) * Math.cos(pitch) * 10, eye[1] + Math.sin(pitch) * 10, eye[2] + Math.cos(yaw) * Math.cos(pitch) * 10] });
  return (t) => {
    if (t <= K[0].t) return out(K[0].eye, K[0].yaw, K[0].pitch ?? 0);
    const last = K[K.length - 1];
    if (t >= last.t) return out(last.eye, last.yaw, last.pitch ?? 0);
    let i = 0; while (K[i + 1].t < t) i++;
    const a = K[i], b = K[i + 1], u = (t - a.t) / (b.t - a.t), s = a.ease === 'lin' ? u : smooth(u);
    return out([0, 1, 2].map((c) => lerp(a.eye[c], b.eye[c], s)), lerp(a.yaw, b.yaw, s), lerp(a.pitch ?? 0, b.pitch ?? 0, s));
  };
}
/** The heading (yaw, pitch) from an eye to a point. */
export const aimAt = (eye, p) => ({ yaw: Math.atan2(p[0] - eye[0], p[2] - eye[2]), pitch: Math.atan2(p[1] - eye[1], Math.hypot(p[0] - eye[0], p[2] - eye[2])) });
export const lookFrom = (eye, yaw, pitch = 0) => [eye[0] + Math.sin(yaw) * Math.cos(pitch) * 10, eye[1] + Math.sin(pitch) * 10, eye[2] + Math.cos(yaw) * Math.cos(pitch) * 10];

/** A fade value: black at `a` fading in to clear by `b` (0 at the end), and fading out from `c` to black at `d`. */
export const fadeInOut = (t, a, b, c, d) => Math.max(1 - smooth(ramp(t, a, b)), smooth(ramp(t, c, d)));

// ---------------------------------------------------------------------------------------------
// Light of the early morning, put after the world is posed (use it in `late`). k: 0 (night) .. 1 (the pale morning).
export function dawn(r, k) {
  const mix = (a, b) => Math.round(lerp(a, b, k));
  const amb = (mix(0x3c, 0xa4) << 16) | (mix(0x3f, 0x9c) << 8) | mix(0x4c, 0xa8);
  const fog = '#' + [mix(0x07, 0xb4), mix(0x08, 0xa9), mix(0x0d, 0xa6)].map((v) => v.toString(16).padStart(2, '0')).join('');
  r.light({ ambient: amb, fog, fogNear: lerp(10, 18, k), fogFar: lerp(40, 125, k) });
}

// ---------------------------------------------------------------------------------------------
// People.
export const buildManager = (r) => buildCustomer(r, {
  categoria: 'comum', roupa: 'polo', seed: 55, id: 'gerente',
  look: { female: false, height: 1.72, build: 'mid', hairStyle: 'short', hair: '#8c8a86', beard: 'none', skin: '#d9b48f', shirt: '#c8c0a8', pants: '#4a4036' },
  acessorios: ['oculos'],
}, { seed: 55 });
export const buildOldAttendant = (r, ctx) => buildCustomer(r, castSpec(ctx.cast, 'frentista-antigo', { categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }), { seed: 5 });
/** The new attendant of ending 4: the work shirt of the posto, a face nobody knows. */
export const buildNewAttendant = (r) => buildCustomer(r, {
  categoria: 'comum', roupa: 'camiseta', seed: 71, id: 'frentista-novo',
  look: { female: false, skirt: false, shirt: '#86652a', pants: '#2e3c4e', hairStyle: 'short', hair: '#5a4a3a', skin: '#d2a884', height: 1.78, build: 'mid' },
}, { seed: 71 });
export const buildDriver = (r, ctx) => buildCustomer(r, castSpec(ctx.cast, 'caminhoneiro', { categoria: 'comum', roupa: 'caminhoneiro' }), { seed: 61 });

/** Heading of a body (yaw 0 faces +z) from a point to another. */
export const faceTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

// ---------------------------------------------------------------------------------------------
// Objects held in the hands: placed in the world from a point in camera space.
/** obj follows the camera: p = [x right, y up, -z ahead] from the eye, rot = Euler (x, y, z) in the camera frame. */
export function placeInCam(T, obj, eye, look, p, rot = [0, 0, 0]) {
  obj.position.copy(camPoint(T, eye, look, p));
  const m = new T.Matrix4().lookAt(new T.Vector3(...eye), new T.Vector3(...look), new T.Vector3(0, 1, 0));
  obj.quaternion.setFromRotationMatrix(m).multiply(new T.Quaternion().setFromEuler(new T.Euler(...rot)));
}

/** The father's fishing rod: cork handle at the origin, the rod along -z (forward), a reel and a thread. */
export function makeVara(r) {
  const T = r.THREE, g = new T.Group();
  const cyl = (rt, rb, len, color, at = 0) => {
    const geo = new T.CylinderGeometry(rt, rb, len, 6); geo.translate(0, len / 2 + at, 0); geo.rotateX(-PI / 2);
    return new T.Mesh(geo, r.mat(color, { map: color === '#8a6a3c' ? 'cloth' : undefined }));
  };
  g.add(cyl(0.017, 0.019, 0.26, '#a98a58'));            // the cork
  g.add(cyl(0.006, 0.012, 1.75, '#2c2a26', 0.26));      // the rod, thinner toward the tip
  const reel = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.03, 8), r.mat('#3a3a3c')); reel.rotation.z = PI / 2; reel.position.set(0, -0.03, -0.3); g.add(reel);
  const thread = new T.Mesh(new T.BoxGeometry(0.002, 0.002, 1.3), r.mat('#c8c4b4')); thread.position.set(0, 0.015, -1.0); g.add(thread);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Calendar pages.
/**
 * Paints a month on a canvas: the sun on top, the header, the weekdays, the days (firstCol: the column of day 1,
 * 0 = Sunday; rows: how many rows). marks: [{ day, kind: 'circle' | 'cross' }] drawn by hand in red marker, notes:
 * [{ x, y, text }] handwritten (x, y in 0..1 of the page). The marks are seeded: the same page every time.
 */
export function paintCalendar(cv, { header = '', sub = '', firstCol = 0, days = 28, rows = 4, marks = [], notes = [], seed = 1, sun = 0.1, reserve = 0 } = {}) {
  const w = cv.width, h = cv.height, g = cv.getContext('2d'), rnd = mulberry32(seed);
  g.fillStyle = 'rgb(226,214,184)'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgb(110,74,44)'; g.fillRect(0, 0, w, Math.round(h * 0.045));
  const s = document.createElement('canvas'); s.width = s.height = 64; paintSol(s.getContext('2d'), 64, sun);
  const sz = Math.round(h * 0.24); g.drawImage(s, Math.round((w - sz) / 2), Math.round(h * 0.05), sz, sz);
  g.fillStyle = 'rgb(70,52,36)'; g.textAlign = 'center'; g.textBaseline = 'top';
  let y = Math.round(h * 0.05) + sz;
  if (header) { g.font = `bold ${Math.round(h * 0.062)}px "Courier New", monospace`; g.fillText(header, w / 2, y); y += Math.round(h * 0.07); }
  if (sub) { g.font = `bold ${Math.round(h * 0.066)}px "Courier New", monospace`; g.fillText(sub, w / 2, y); y += Math.round(h * 0.075); }
  const gx = Math.round(w * 0.06), gw = w - gx * 2, cw = gw / 7;
  g.font = `bold ${Math.round(h * 0.042)}px "Courier New", monospace`;
  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach((d, i) => { g.fillStyle = i === 0 ? 'rgb(170,76,50)' : 'rgb(110,92,70)'; g.fillText(d, gx + cw * (i + 0.5), y); });
  y += Math.round(h * 0.055);
  const gy = y, ch = (h - gy - Math.round(h * (0.04 + reserve))) / rows, cell = {};
  g.font = `bold ${Math.round(Math.min(cw, ch) * 0.52)}px "Courier New", monospace`; g.textBaseline = 'middle';
  for (let d = 1; d <= days; d++) {
    const i = firstCol + d - 1, c = i % 7, rw = Math.floor(i / 7), cx = gx + cw * (c + 0.5), cy = gy + ch * (rw + 0.5);
    cell[d] = [cx, cy];
    g.fillStyle = c === 0 ? 'rgb(170,76,50)' : 'rgb(76,62,48)'; g.fillText(String(d), cx, cy);
  }
  g.strokeStyle = 'rgb(200,40,36)'; g.fillStyle = 'rgb(200,40,36)'; g.lineWidth = Math.max(1.4, h * 0.012); g.lineCap = 'round';
  for (const m of marks) {
    const [cx, cy] = cell[m.day] ?? [w / 2, h / 2];
    if (m.kind === 'cross') { g.beginPath(); g.moveTo(cx - cw * 0.36, cy - ch * 0.32); g.lineTo(cx + cw * 0.36, cy + ch * 0.32); g.moveTo(cx + cw * 0.36, cy - ch * 0.32); g.lineTo(cx - cw * 0.36, cy + ch * 0.32); g.stroke(); continue; }
    for (let k = 0; k < 2; k++) { // a circle drawn twice, by hand: it never closes in the same place
      g.beginPath();
      const a0 = rnd() * PI * 2, rx = cw * (0.5 + k * 0.05 + rnd() * 0.04), ry = ch * (0.44 + k * 0.05 + rnd() * 0.04);
      for (let a = 0; a <= PI * 2.15; a += 0.2) { const px = cx + Math.cos(a0 + a) * rx * (1 + 0.03 * Math.sin(a * 3)), py = cy + Math.sin(a0 + a) * ry; if (a === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
    }
  }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  for (const n of notes) { g.font = `italic bold ${Math.round(h * (n.size ?? 0.07))}px "Courier New", monospace`; g.save(); g.translate(n.x * w, n.y * h); g.rotate(n.rot ?? -0.08); g.fillText(n.text, 0, 0); g.restore(); }
  return cv;
}

/** A calendar page as a thing of the world: a plane with the painted page over a dark backing. */
export function makeCalendarPage(r, opts = {}, size = [0.3, 0.38], px = [96, 120]) {
  const T = r.THREE, g = new T.Group();
  const cv = document.createElement('canvas'); cv.width = px[0]; cv.height = px[1]; paintCalendar(cv, opts);
  const face = new T.Mesh(new T.PlaneGeometry(size[0], size[1]), r.mat('#ffffff', { map: canvasTexture(r, cv) }));
  face.position.z = 0.003; g.add(face);
  const back = new T.Mesh(new T.PlaneGeometry(size[0] + 0.03, size[1] + 0.03), r.mat('#3a2c1e')); g.add(back);
  g.userData.face = face;
  return g;
}

// ---------------------------------------------------------------------------------------------
// A vehicle that drives a polyline: a table of the distance by time, simulated once. `points` [[x, z], ...] is the
// forward path, rounded at the corners. With `reverse: { from: [x, z], yaw }` the car first backs from there to the
// first point (the nose does not turn), stops for `hold` seconds, then drives forward and swings its nose round to
// the heading of the path. Returns { total, pose(t) -> { x, z, yaw, moving } }.
export function drivePath(points, { reverse = null, hold = 0.5, vmax = 5, vhigh = 11, acc = 1.8, highFrom = Infinity, corner = 3 } = {}) {
  const P = points.map((p) => ({ x: p[0], z: p[1] }));
  const poly = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const la = Math.hypot(b.x - a.x, b.z - a.z), lc = Math.hypot(c.x - b.x, c.z - b.z), k = Math.min(corner, la / 2, lc / 2);
    const p0 = { x: b.x + (a.x - b.x) * k / la, z: b.z + (a.z - b.z) * k / la }, p1 = { x: b.x + (c.x - b.x) * k / lc, z: b.z + (c.z - b.z) * k / lc };
    for (let u = 0; u <= 1.0001; u += 0.1) poly.push({ x: (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * b.x + u * u * p1.x, z: (1 - u) * (1 - u) * p0.z + 2 * u * (1 - u) * b.z + u * u * p1.z });
  }
  poly.push(P[P.length - 1]);
  const ss = [0]; for (let i = 1; i < poly.length; i++) ss.push(ss[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z));
  const L = ss[ss.length - 1];
  const at = (s) => {
    s = clamp(s, 0, L); let lo = 0, hi = ss.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    const d = ss[hi] - ss[lo] || 1, k = (s - ss[lo]) / d;
    return { x: lerp(poly[lo].x, poly[hi].x, k), z: lerp(poly[lo].z, poly[hi].z, k), yaw: Math.atan2(poly[hi].x - poly[lo].x, poly[hi].z - poly[lo].z) };
  };
  const R = reverse ? Math.hypot(P[0].x - reverse.from[0], P[0].z - reverse.from[1]) : 0;
  const dt = 1 / 30, tab = [0]; let s = 0, v = 0, th = 0, phase = R > 0 ? 0 : 2;
  for (let i = 0; i < 30 * 120 && s < R + L - 0.05; i++) {
    if (phase === 0) { const tgt = Math.min(2.2, Math.sqrt(2 * 1.4 * Math.max(0, R - s)) + 0.3); v = v < tgt ? Math.min(tgt, v + 1.2 * dt) : Math.max(tgt, v - 3 * dt); s += v * dt; if (s >= R - 0.02) { s = R; phase = 1; v = 0; } }
    else if (phase === 1) { th += dt; if (th >= hold) phase = 2; }
    else { const tgt = s - R >= highFrom ? vhigh : vmax; v = v < tgt ? Math.min(tgt, v + acc * dt) : Math.max(tgt, v - 4 * dt); s = Math.min(R + L, s + v * dt); }
    tab.push(s);
  }
  const sOf = (t) => { if (t <= 0) return 0; const f = t * 30, i = Math.floor(f); return i >= tab.length - 1 ? tab[tab.length - 1] : lerp(tab[i], tab[i + 1], f - i); };
  return {
    total: tab.length / 30,
    pose(t) {
      const s0 = sOf(t);
      if (s0 < R) { const k = s0 / R; return { x: lerp(reverse.from[0], P[0].x, k), z: lerp(reverse.from[1], P[0].z, k), yaw: reverse.yaw, moving: s0 > 0 }; }
      const p = at(s0 - R), k = R > 0 ? smooth(clamp((s0 - R) / 5)) : 1, d = Math.atan2(Math.sin(p.yaw - (reverse?.yaw ?? p.yaw)), Math.cos(p.yaw - (reverse?.yaw ?? p.yaw)));
      return { x: p.x, z: p.z, yaw: R > 0 ? reverse.yaw + d * k : p.yaw, moving: s0 < R + L - 0.05 };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The pictures of a ceiling camera for the monitor overlay (black and white, 160 x 120), as in the "corte" reel.
export function camShooter(r, W, hide, W_ = 160, H_ = 120) {
  const T = r.THREE;
  const rt = new T.WebGLRenderTarget(W_, H_, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  const aux = new T.PerspectiveCamera(62, W_ / H_, 0.45, 60);
  const px = new Uint8Array(W_ * H_ * 4), id = new ImageData(W_, H_);
  const cvs = document.createElement('canvas'); cvs.width = W_; cvs.height = H_;
  return function shoot(camName, t, { fov = 62, aim = null } = {}) {
    const a = W.anchors[camName];
    aux.position.copy(a.pos); aux.up.set(0, 1, 0); aux.lookAt(aim ? new T.Vector3(...aim) : a.pos.clone().add(a.dir)); aux.updateMatrixWorld();
    aux.fov = fov; aux.updateProjectionMatrix();
    const prev = r.renderer.getRenderTarget(), restore = hide?.();
    r.renderer.setRenderTarget(rt); r.renderer.render(r.scene, aux); r.renderer.readRenderTargetPixels(rt, 0, 0, W_, H_, px); r.renderer.setRenderTarget(prev);
    restore?.();
    const d = id.data;
    for (let y = 0; y < H_; y++) for (let x = 0; x < W_; x++) {
      const s = ((H_ - 1 - y) * W_ + x) * 4, o = (y * W_ + x) * 4;
      const L = Math.min(255, Math.max(0, ((0.3 * px[s] + 0.59 * px[s + 1] + 0.11 * px[s + 2]) - 14) * 2.3) + ((x + y + Math.floor(t * 12)) % 7 === 0 ? 10 : 0));
      d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
    }
    cvs.getContext('2d').putImageData(id, 0, 0);
    return cvs;
  };
}
