// The inside of the tunnel that opens in the south wall of the station: ~34 m of precast lining that bends gently to the east and is
// lost in the dark, a gravel bed, the rail laid only halfway (then the sleepers alone), work cables on the walls, a burnt lamp and one
// still lit far in, rubble and a puddle on the bed, and at the mouth a fallen work barrier and a toppled hoarding that close the way a few
// metres in (the colliders are returned). The dark is the fog of the render plus the light painted into the lining (station.js, paintTunnel).
import { mulberry32 } from '../../vendor/engine/rng.js';
import { paintTunnel, paintGravel } from '../models/props/station.js';
import { place as placeProp } from '../models/props/place.js';
import { blob } from '../models/props/gallery.js';

export const TUNNEL = { L: 34, K: 7, ring: 1.2, half: 1.7, spring: 1.45, rise: 0.85, lit: 28.5, burnt: 15, stop: 3.5 };

export function buildTunnel({ T, kit, place, parent, BZ, cx, picture }) {
  const { L, K, ring, half: a, spring, rise } = TUNNEL, rnd = mulberry32(4242);
  // the path: s metres from the wall, the centre drifts east (K at the far end), the section is a horseshoe
  const frame = (s) => { const x = cx + K * (s / L) ** 2, sl = (2 * K * s) / (L * L), n = Math.hypot(sl, 1), tx = sl / n, tz = 1 / n; return { x, z: BZ + s, tx, tz, nx: tz, nz: -tx, yaw: Math.atan2(tx, tz) }; };
  const at = (s, px, py) => { const f = frame(s); return [f.x + f.nx * px, py, f.z + f.nz * px]; };
  const prof = [[-a, 0], [-a, spring]]; for (let k = 1; k <= 8; k++) { const t = Math.PI * (1 - k / 9); prof.push([a * Math.cos(t), spring + rise * Math.sin(t)]); } prof.push([a, spring], [a, 0]);
  const cum = [0]; for (let i = 1; i < prof.length; i++) cum.push(cum[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const arc = cum[cum.length - 1];
  const group = new T.Group(); group.name = 'tunel'; parent.add(group);

  // ---- the lining ----
  const lin = picture('tunel', paintTunnel({ L, arc, ppm: 44, sLit: TUNNEL.lit, seed: 77 }));
  const pos = [], nor = [], uv = [], N = Math.round(L / ring);
  for (let i = 0; i < N; i++) for (let j = 0; j < prof.length - 1; j++) {
    const s0 = (i * L) / N, s1 = ((i + 1) * L) / N, p = [at(s0, ...prof[j]), at(s1, ...prof[j]), at(s1, ...prof[j + 1]), at(s0, ...prof[j + 1])], uvs = [[s0, cum[j]], [s1, cum[j]], [s1, cum[j + 1]], [s0, cum[j + 1]]];
    const c = at((s0 + s1) / 2, 0, 0.9), mid = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2];
    const e1 = new T.Vector3(...p[1]).sub(new T.Vector3(...p[0])), e2 = new T.Vector3(...p[3]).sub(new T.Vector3(...p[0])), nrm = e1.clone().cross(e2).normalize();
    const toC = new T.Vector3(c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]); const flip = nrm.dot(toC) < 0, n2 = flip ? nrm.clone().negate() : nrm;
    for (const k of (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3])) { pos.push(...p[k]); nor.push(n2.x, n2.y, n2.z); uv.push(uvs[k][0] / L, 1 - uvs[k][1] / arc); }
  }
  const mk = (p, n, u) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(u, 2)); return g; };
  group.add(new T.Mesh(mk(pos, nor, uv), kit.mat(lin)));

  // ---- the gravel bed, the end of the tunnel ----
  const gt = new T.CanvasTexture(paintGravel(5)); gt.wrapS = gt.wrapT = T.RepeatWrapping; gt.colorSpace = T.NoColorSpace; gt.minFilter = T.LinearMipmapLinearFilter; gt.magFilter = T.LinearFilter; kit.setTexture('gal:brita', gt);
  { const p = [], n = [], u = []; for (let i = 0; i < N; i++) { const s0 = (i * L) / N, s1 = ((i + 1) * L) / N, q = [at(s0, -a, 0.005), at(s1, -a, 0.005), at(s1, a, 0.005), at(s0, a, 0.005)]; for (const k of [0, 3, 2, 0, 2, 1]) { p.push(...q[k]); n.push(0, 1, 0); u.push((k === 0 || k === 3 ? 0 : 1) * (2 * a / 1.5), (k < 2 ? s0 : s1) / 1.5); } }
    group.add(new T.Mesh(mk(p, n, u), kit.mat({ c: '#b8b8c0', map: 'gal:brita' }))); }
  { const q = [at(L, -a, 0), at(L, -a, spring + rise), at(L, a, spring + rise), at(L, a, 0)]; group.add(new T.Mesh(mk([...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]], Array(6).fill([0, 0, -1]).flat(), Array(12).fill(0)), kit.mat({ c: '#020304', side: 'double' }))); }

  // ---- what lies in it ----
  const d = new kit.Batch(), rail = { c: '#7a5038', map: 'ferrugem' }, slp = { c: '#8e8c86', map: 'concreto' };
  for (let s = 0.4; s < 24; s += 0.8) {                    // sleepers, some missing, the far ones out of line
    if (rnd() < 0.14) continue;
    const f = frame(s), off = s > 8 ? (rnd() - 0.5) * 0.3 : 0, yaw = f.yaw + (s > 10 ? (rnd() - 0.5) * 0.5 : 0), p = at(s, off, 0.0);
    d.box(slp, [1.9, 0.14, 0.22], p, { ry: yaw, rz: s > 12 ? (rnd() - 0.5) * 0.25 : 0, nojitter: true, outline: s < 10 });   // (the outline on what the room sees)
  }
  for (let s = 0; s < 14.4; s += 1.2) for (const sx of [-0.72, 0.72]) {                    // rails: both to 9.6 m, one to 14.4 m
    if (s >= 9.6 && sx > 0) continue;
    const f = frame(s + 0.6), p = at(s + 0.6, sx, 0.14);
    d.box({ c: '#3a3a3e', map: 'metal' }, [0.15, 0.03, 1.2], p, { ry: f.yaw, nojitter: true }); d.box(rail, [0.07, 0.14, 1.2], [p[0], 0.17, p[2]], { ry: f.yaw, nojitter: true }); d.box(rail, [0.1, 0.03, 1.2], [p[0], 0.31, p[2]], { ry: f.yaw, nojitter: true, outline: s < 7 });
  }
  const tube = (p0, p1, rad, spec, seg = 5) => { const va = new T.Vector3(...p0), vc = new T.Vector3(...p1), dd = vc.clone().sub(va); d.add(spec, new T.CylinderGeometry(rad, rad, dd.length(), seg, 1), new T.Matrix4().compose(va.clone().add(vc).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dd.normalize()), new T.Vector3(1, 1, 1))); };
  for (const [sx, y] of [[-1, 1.3], [1, 1.1], [-1, 1.75]]) for (let s = 2; s < L - 6; s += 4.5) {          // work cables on the walls, in swags
    const pts = []; for (let k = 0; k <= 4; k++) { const u = k / 4; pts.push(at(s + u * 4.5, sx * (a - 0.05), y - Math.sin(u * Math.PI) * 0.28)); }
    for (let k = 0; k < 4; k++) tube(pts[k], pts[k + 1], 0.026, { c: '#1a1a1d', map: 'borracha' });
    d.box({ c: '#9a9a94', map: 'metal' }, [0.05, 0.1, 0.05], [pts[0][0], pts[0][1] + 0.02, pts[0][2]], { nojitter: true });
  }
  // lamps: one burnt (dark bulb, hanging crooked) and, far in, the one still lit
  for (const [s, lit] of [[TUNNEL.burnt, false], [TUNNEL.lit, true]]) {
    const top = at(s, 0.1, spring + rise - 0.03), bot = at(s, 0.1, 1.85);
    tube(top, bot, 0.008, { c: '#101012' }, 4);
    placeProp(kit, d, 'lampada_gaiola', { pos: [bot[0], bot[1] - 0.26, bot[2]], rz: lit ? 0 : 0.25, fb: [0.2, 0.28, 0.2] });
    d.cyl(lit ? { c: '#ffc880', emissive: 1, fogged: 0.5 } : { c: '#26262a' }, 0.05, 0.035, 0.1, 8, [bot[0], bot[1] - 0.2, bot[2]]);
    if (lit) { const p = at(s, 0.1, 1.5); place.lamps.set('lamp-tunel', { pos: p, base: { color: '#ffb870', range: 7 } }); }
  }
  // rubble, a toppled drum, bags and a puddle on the bed
  for (let i = 0; i < 16; i++) { const s = 18.2 + rnd() * 3, px = (rnd() - 0.5) * 2.4, w = 0.12 + rnd() * 0.3; d.box({ c: '#8a8a82', map: 'concreto' }, [w, w * (0.5 + rnd() * 0.5), w * (0.6 + rnd() * 0.6)], at(s, px, 0), { ry: rnd() * 3, rx: (rnd() - 0.5) * 0.5, nojitter: true }); }
  { const p = at(20.2, 0.9, 0.29); placeProp(kit, d, 'tambor', { pos: [p[0], 0.29, p[2]], rz: Math.PI / 2, ry: 0.6, fb: [0.58, 0.88, 0.58], fbc: '#4a6a8a' }); }
  for (let i = 0; i < 3; i++) { const p = at(18.6 + i * 0.5, -0.9, 0); placeProp(kit, d, 'saco_cimento', { pos: p, ry: rnd() * 2, fb: [0.5, 0.1, 0.32], fbc: '#b8b090' }); }
  { const p = at(22.6, -0.2, 0); blob(kit, d, { c: '#101c26', opacity: 0.85, depthWrite: false }, p[0], p[2], 0.95, 0.6, 9, 0.02); blob(kit, d, { c: '#2c4254', opacity: 0.5, depthWrite: false }, p[0] - 0.1, p[2] - 0.05, 0.5, 0.3, 10, 0.024); }
  // the mouth: a fallen work barrier and a toppled hoarding, low enough to be seen over
  { const s = TUNNEL.stop, p = at(s, 0, 0), f = frame(s), stripe = { c: '#ffffff', map: 'faixa' };
    d.box(stripe, [1.7, 0.22, 0.05], [p[0] - 0.55, 0.12, p[2] + 0.05], { ry: f.yaw + 0.2, rx: 1.0, nojitter: true, outline: true }); d.box(stripe, [1.7, 0.22, 0.05], [p[0] + 0.7, 0.14, p[2] - 0.15], { ry: f.yaw - 0.15, rx: 1.15, nojitter: true, outline: true });
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) tube([p[0] + sx * 0.9, 0.05, p[2] - 0.2 + k * 0.5], [p[0] + sx * 1.0, 0.45, p[2] - 0.3 + k * 0.55], 0.02, { c: '#5a5e66', map: 'metal' });
    d.box({ c: '#b8a888', map: 'madeira' }, [2.2, 0.04, 1.2], [p[0] + 0.1, 0.34, p[2] + 0.45], { ry: f.yaw + 0.1, rx: -0.28, nojitter: true, outline: true, tile: 1.2 });           // the hoarding panel, tipped over the barrier
    d.box({ c: '#a89878', map: 'madeira' }, [1.4, 0.04, 1.0], [p[0] - 0.9, 0.12, p[2] - 0.6], { ry: f.yaw - 0.5, rx: 0.1, nojitter: true, outline: true, tile: 1.2 });
    for (let k = 0; k < 3; k++) d.box({ c: '#7a6a58', map: 'madeira' }, [0.08, 0.04, 1.1], [p[0] + 0.2 * k - 0.2, 0.5, p[2] + 0.3], { ry: 0.4 * k, rx: -0.3, nojitter: true, outline: true });
  }
  group.add(d.build());
  const f3 = frame(TUNNEL.stop);
  return { group, colliders: [{ id: 'tunel-esq', min: [cx - a - 1, BZ], max: [cx - a, BZ + 5] }, { id: 'tunel-dir', min: [cx + a, BZ], max: [cx + a + 1, BZ + 5] }, { id: 'tunel-barreira', min: [cx - a, f3.z - 0.4], max: [cx + a, f3.z + 0.5] }] };
}
