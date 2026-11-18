// The shell of the gallery as an unfinished station: the raw concrete box with its vault of ribs, the mouth of the tunnel (with the
// track left half laid) in the south wall, the pipe and cable runs, the rebar stubs of the walls that were never closed, the work cables
// between the lamps. Floor, walls and vault carry one painted picture each (models/props/station.js) with the baked light.
// Coordinates: x along the station (-14 to 14), z across (-5 to 5), y up; the vault springs at `WH` and rises to `apex`.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { paintFloor, paintWall, paintVault, paintRib } from '../models/props/station.js';
import { place as placeProp, have } from '../models/props/place.js';
import { buildTunnel } from './galeria-tunel.js';

/** The mouth of the tunnel in the south wall: x from X0 to X1, height H. */
export const MOUTH = { x0: -0.4, x1: 3.0, spring: 1.45, rise: 0.85, h: 2.3 };
export const BED = { x0: -0.9, x1: 3.5, z0: 3.5 };
export const PUDDLES = [
  { x: -11.2, z: -3.2, rx: 0.9, rz: 0.55, a: 0.3 }, { x: -9.5, z: 0.6, rx: 0.7, rz: 0.45, a: -0.2 }, { x: 2.4, z: -0.6, rx: 0.65, rz: 0.5, a: 0.1 }, { x: 4.9, z: 0.7, rx: 0.55, rz: 0.42, a: 0.5 },
  { x: -3.6, z: 3.0, rx: 0.8, rz: 0.4, a: 0.0 }, { x: 12.2, z: 1.9, rx: 0.9, rz: 0.5, a: 0.2 }, { x: 7.6, z: -0.9, rx: 0.5, rz: 0.35, a: 0.7 }, { x: -6.1, z: -0.4, rx: 0.6, rz: 0.4, a: -0.4 },
];

/** A rectangle in space, cut into cells (the lighting is per vertex), with the picture's uv given by `uvOf(x, y, z)`. `skip(a, b)` leaves a cell out. */
function panel(T, { o, a, b, w, h, n, cell = 1, uvOf, skip, grid }) {
  const na = Math.max(1, Math.ceil(w / cell)), nb = Math.max(1, Math.ceil(h / cell)), pos = [], uv = [], nor = [];
  const A = new T.Vector3(...a), B = new T.Vector3(...b), O = new T.Vector3(...o), N = new T.Vector3(...n);
  const as = grid?.a ?? Array.from({ length: na + 1 }, (_, i) => (i * w) / na), bs = grid?.b ?? Array.from({ length: nb + 1 }, (_, i) => (i * h) / nb);
  const pt = (s, t) => O.clone().addScaledVector(A, s).addScaledVector(B, t);
  const geoN = A.clone().cross(B), flip = geoN.dot(N) < 0;
  for (let i = 0; i < as.length - 1; i++) for (let j = 0; j < bs.length - 1; j++) {
    if (skip?.((as[i] + as[i + 1]) / 2, (bs[j] + bs[j + 1]) / 2)) continue;
    const q = [[as[i], bs[j]], [as[i + 1], bs[j]], [as[i + 1], bs[j + 1]], [as[i], bs[j + 1]]].map(([s, t]) => pt(s, t));
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) { const v = q[k]; pos.push(v.x, v.y, v.z); nor.push(N.x, N.y, N.z); const [u, vv] = uvOf(v.x, v.y, v.z); uv.push(u, vv); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildShell({ r, T, kit, shell, walls, lampList, boxes, place, BX, BZ, WH, apex }) {
  const rnd = mulberry32(2027), rise = apex - WH, R = BZ + 0.25;
  const picture = (name, canvas) => {
    const t = new T.CanvasTexture(canvas);
    t.colorSpace = T.NoColorSpace; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.anisotropy = 4; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
    kit.setTexture('gal:' + name, t); return { c: '#ffffff', map: 'gal:' + name };
  };
  const mesh = (geo, spec) => new T.Mesh(geo, kit.mat(spec));
  const PPM = 64;

  // ---- the floor: one picture, 29 x 11 m ----
  const fx = BX + 0.5, fz = BZ + 0.5;
  const floorSpec = picture('piso', paintFloor({ BX, BZ, ppm: PPM, lamps: lampList, boxes, puddles: PUDDLES, bed: BED, seed: 11 }));
  shell.add(mesh(panel(T, { o: [-fx, 0, -fz], a: [1, 0, 0], b: [0, 0, 1], w: fx * 2, h: fz * 2, n: [0, 1, 0], cell: 1.2, uvOf: (x, y, z) => [(x + fx) / (fx * 2), 1 - (z + fz) / (fz * 2)] }), floorSpec));

  // ---- the walls: each a group of its own, tagged with where it faces ----
  const wall = (name, nx, nz, len, o, a, spec, geoOpts) => {
    const g = new T.Group(); g.userData.normal = [nx, nz]; g.name = `parede-${name}`;
    g.add(mesh(panel(T, { ...geoOpts, o, a, b: [0, 1, 0], w: len, h: WH, n: [nx, 0, nz] }), spec)); shell.add(g); walls.push(g); return g;
  };
  const wallLamps = (axis, at) => lampList.map((l) => ({ s: axis === 'x' ? l.x : l.z, d: Math.abs((axis === 'x' ? l.z : l.x) - at), y: l.y, range: l.range, color: l.color }));
  const long = (name, nz, z, hole, seed) => {
    const spec = picture('parede-' + name, paintWall({ len: BX * 2, H: WH, ppm: PPM, lamps: wallLamps('x', z), seed, hole: null }));
    const uvOf = (x, y) => [(x + BX) / (BX * 2), y / WH];
    const opts = { uvOf, cell: 1.4 };
    if (hole) {   // the opening is an arch: a fine grid around it, a cell is left out when its centre is under the arch
      const { x0, x1, spring, rise } = MOUTH, cxm = (x0 + x1) / 2, ax = (x1 - x0) / 2, fine = []; for (let x = x0; x <= x1 + 1e-6; x += 0.2) fine.push(+(x + BX).toFixed(3));
      opts.grid = { a: [...new Set([0, ...Array.from({ length: 27 }, (_, i) => i + 1), BX * 2, ...fine])].sort((p, q) => p - q), b: [0, 0.8, 1.4, 1.6, 1.8, 2.0, 2.2, WH] };
      opts.skip = (sa, sb) => { const x = sa - BX; if (x <= x0 || x >= x1) return false; const u = (x - cxm) / ax; return sb < spring + rise * Math.sqrt(Math.max(0, 1 - u * u)); };
    }
    return wall(name, 0, nz, BX * 2, [-BX, 0, z], [1, 0, 0], spec, opts);
  };
  long('norte', 1, -BZ, null, 21);
  const south = long('sul', -1, BZ, [MOUTH.x0, MOUTH.x1, MOUTH.h], 22);
  const end = (name, nx, x, seed) => {
    const spec = picture('parede-' + name, paintWall({ len: BZ * 2, H: WH, ppm: PPM, lamps: wallLamps('z', x), seed }));
    return wall(name, nx, 0, BZ * 2, [x, 0, nx > 0 ? -BZ : BZ], [0, 0, nx > 0 ? 1 : -1], spec, { uvOf: (px, y, z) => [(nx > 0 ? z + BZ : BZ - z) / (BZ * 2), y / WH], cell: 1.4 });
  };
  end('oeste', 1, -BX, 23); end('leste', -1, BX, 24);

  // ---- the vault: ribs of precast rings every 3.5 m, the picture between them ----
  const vault = new T.Group(); vault.name = 'abobada'; shell.add(vault);
  const ribsX = []; for (let x = -BX + 1; x <= BX; x += 3.5) ribsX.push(x);
  const ell = (t, R2, h2, x) => new T.Vector3(x, WH + h2 * Math.sin(t), R2 * Math.cos(t));
  const arcLen = 8.6;
  {
    const vs = picture('abobada', paintVault({ len: BX * 2 + 1, ppm: 48, arc: arcLen, lamps: lampList, seed: 31, ribs: ribsX, R }));
    const pos = [], nor = [], uv = [], NX = Math.ceil((BX * 2 + 1) / 1.0), NT = 18;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NT; j++) {
      const x0 = -BX - 0.5 + (i * (BX * 2 + 1)) / NX, x1 = -BX - 0.5 + ((i + 1) * (BX * 2 + 1)) / NX, t0 = (j / NT) * Math.PI, t1 = ((j + 1) / NT) * Math.PI;
      const p = [ell(t0, R, rise, x0), ell(t0, R, rise, x1), ell(t1, R, rise, x1), ell(t1, R, rise, x0)], uvs = [[x0, t0], [x1, t0], [x1, t1], [x0, t1]];
      for (const k of [0, 2, 1, 0, 3, 2]) {
        const v = p[k], tt = uvs[k][1]; pos.push(v.x, v.y, v.z);
        const n = new T.Vector3(0, -(v.y - WH) / (rise * rise), -v.z / (R * R)).normalize(); nor.push(n.x, n.y, n.z);
        uv.push((uvs[k][0] + BX + 0.5) / (BX * 2 + 1), 1 - tt / Math.PI);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    vault.add(mesh(g, vs));
  }
  {   // the ribs: an inner strip, protruding 0.3 m, with its two sides
    // one painted picture for all of them (station.js, paintRib): u runs along the arc, v across: a side (0..0.27), the face (0.29..0.71), the other side
    const vb = new kit.Batch(), spec = { ...picture('nervura', paintRib({ arc: arcLen, ppm: 112, seed: 41 })), c: '#cfcdc2' }, inset = 0.3, hw = 0.22, NT = 18;
    for (const xc of ribsX) {
      const pos = [], nor = [], uv = [];
      const push = (v, n, u, w) => { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(u, w); };
      for (let j = 0; j < NT; j++) {
        const t0 = (j / NT) * Math.PI, t1 = ((j + 1) / NT) * Math.PI;
        const q = (x, tt, R2, h2) => ell(tt, R2, h2, x);
        const inner = [q(xc - hw, t0, R - inset, rise - inset), q(xc + hw, t0, R - inset, rise - inset), q(xc + hw, t1, R - inset, rise - inset), q(xc - hw, t1, R - inset, rise - inset)];
        for (const k of [0, 2, 1, 0, 3, 2]) { const v = inner[k]; push(v, new T.Vector3(0, -(v.y - WH), -v.z * (rise * rise) / (R * R)).normalize(), (k < 2 ? t0 : t1) / Math.PI, k < 2 ? (k === 0 ? 0.29 : 0.71) : (k === 2 ? 0.71 : 0.29)); }
        for (const sd of [-1, 1]) {   // the side faces: the ring between the vault and the strip, facing along the station
          const x = xc + sd * hw, o2 = [q(x, t0, R, rise), q(x, t1, R, rise), q(x, t1, R - inset, rise - inset), q(x, t0, R - inset, rise - inset)];
          for (const k of (sd > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) push(o2[k], new T.Vector3(sd, 0, 0), (k === 0 || k === 3 ? t0 : t1) / Math.PI, sd < 0 ? (k < 2 ? 0.0 : 0.27) : (k < 2 ? 1.0 : 0.73));
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      vb.add(spec, g, new T.Matrix4());
      // rebar stubs left at the foot of each rib, and a drip of rust from them
      for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) vb.cyl({ c: '#6a4026', map: 'ferrugem' }, 0.012, 0.012, 0.35 + rnd() * 0.3, 5, [xc - 0.12 + k * 0.12, WH - 0.1, sz * (R - 0.45)], { rx: sz * 0.5 });
    }
    vault.add(vb.build());
  }
  {   // the lunettes: the half-ellipse of the ends, closed by the raw end walls above the springing line
    const lb = new kit.Batch(), spec = { c: '#8a8a82', map: 'umido' }, NT = 18;
    for (const sx of [-1, 1]) {
      const xw = sx * BX, pos = [], nor = [], uv = [];
      for (let j = 0; j < NT; j++) {
        const t0 = (j / NT) * Math.PI, t1 = ((j + 1) / NT) * Math.PI, a = ell(t0, R, rise, xw), c = ell(t1, R, rise, xw), m = new T.Vector3(xw, WH, 0);
        for (const v of (sx > 0 ? [m, c, a] : [m, a, c])) { pos.push(v.x, v.y, v.z); nor.push(-sx, 0, 0); uv.push(v.z / 2.4, v.y / 2.4); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      lb.add(spec, g, new T.Matrix4());
    }
    vault.add(lb.build());
  }
  {   // the work cables between the lamps (they hang under the vault, strapped at each lamp) and a main run along the crown
    const cb = new kit.Batch(), s = { c: '#17171a', map: 'borracha' }, xs = lampList.map((l) => l).sort((p, q) => p.x - q.x);
    const tube = (a, c, rad, seg = 5) => {
      const va = new T.Vector3(...a), vc = new T.Vector3(...c), d = vc.clone().sub(va);
      cb.add(s, new T.CylinderGeometry(rad, rad, d.length(), seg, 1), new T.Matrix4().compose(va.clone().add(vc).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()), new T.Vector3(1, 1, 1)));
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], c = xs[i + 1], n = 7, pts = [];
      for (let k = 0; k <= n; k++) { const u = k / n, x = a.x + (c.x - a.x) * u, z = a.z + (c.z - a.z) * u, ceil = WH + rise * Math.sqrt(Math.max(0, 1 - (z / R) ** 2)) - 0.12; pts.push([x, ceil - Math.sin(u * Math.PI) * 0.12, z]); }
      for (let k = 0; k < n; k++) tube(pts[k], pts[k + 1], 0.018);
      for (let k = 1; k < n; k += 2) cb.box({ c: '#9a9a94', map: 'metal' }, [0.05, 0.03, 0.05], [pts[k][0], pts[k][1] + 0.01, pts[k][2]]);
    }
    vault.add(cb.build());
  }

  // ---- the wall runs: a pipe with flanges and valves, a conduit, cables in swags, a curb at the foot ----
  const d = new kit.Batch(), steel = { c: '#5a6670', map: 'metal' }, dark = { c: '#2a2c2e', map: 'metal' }, rust = { c: '#8a5a3a', map: 'ferrugem' };
  for (const sz of [-1, 1]) {
    const zw = sz * BZ, face = -sz;   // face points into the room
    d.box({ c: '#6a6a64', map: 'concreto' }, [BX * 2, 0.16, 0.16], [0, 0, zw + face * 0.08], { cell: 3, nojitter: true, outline: true });
    // the runs stop at the mouth of the tunnel on the south wall (the arch and its ring are in the way)
    const spans = sz > 0 ? [[-BX, MOUTH.x0 - 0.7], [MOUTH.x1 + 0.7, BX]] : [[-BX, BX]];
    if (have('cano_parede')) {
      // the painted run (tools/props, `cano_parede`): 3.5 m of pipe and conduit with the flange in the middle and the bracket; a length that the
      // mouth of the tunnel cuts is drawn shorter
      for (let x = -BX + 1.75; x < BX; x += 3.5) for (const [xa, xb] of spans) {
        const a = Math.max(xa, x - 1.75), c = Math.min(xb, x + 1.75); if (c - a < 0.4) continue;
        placeProp(kit, d, 'cano_parede', { pos: [(a + c) / 2, 2.05, zw + face * 0.16], ry: sz > 0 ? Math.PI : 0, scale: [(c - a) / 3.5, 1, 1] });
      }
    } else {
    for (const [xa, xb] of spans) { d.cyl(steel, 0.09, 0.09, xb - xa, 8, [(xa + xb) / 2, 2.05, zw + face * 0.16], { rz: Math.PI / 2, cell: 3 }); d.cyl(dark, 0.035, 0.035, xb - xa, 6, [(xa + xb) / 2, 2.28, zw + face * 0.1], { rz: Math.PI / 2, cell: 3 }); }
    for (let x = -BX + 1.75; x < BX; x += 3.5) {
      d.cyl(dark, 0.125, 0.125, 0.05, 10, [x - 0.04, 2.05, zw + face * 0.16], { rz: Math.PI / 2 }); d.cyl(dark, 0.125, 0.125, 0.05, 10, [x + 0.04, 2.05, zw + face * 0.16], { rz: Math.PI / 2 });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; d.cyl({ c: '#101010' }, 0.014, 0.014, 0.1, 4, [x, 2.05 + Math.sin(a) * 0.11, zw + face * (0.16 + Math.cos(a) * 0.11)], { rz: Math.PI / 2 }); }
    }
    for (let x = -BX + 1; x < BX; x += 3.5) { d.box(dark, [0.06, 0.26, 0.03], [x, 1.9, zw + face * 0.03], { nojitter: true }); d.box(dark, [0.05, 0.05, 0.15], [x, 2.03, zw + face * 0.1], { nojitter: true }); d.box(dark, [0.04, 0.04, 0.06], [x, 2.27, zw + face * 0.04]); }
    }
    // the cables in swags, hung from hooks every 2.8 m
    for (let x = -BX + 1.4; x < BX - 4.2; x += 4.2) {
      const pts = []; for (let k = 0; k <= 4; k++) { const u = k / 4; pts.push([x + u * 4.2, 1.78 - Math.sin(u * Math.PI) * 0.3, zw + face * 0.1]); }
      for (let k = 0; k < 4; k++) { const va = new T.Vector3(...pts[k]), vc = new T.Vector3(...pts[k + 1]), dd = vc.clone().sub(va); d.add({ c: '#1a1a1d', map: 'borracha' }, new T.CylinderGeometry(0.026, 0.026, dd.length(), 5, 1), new T.Matrix4().compose(va.clone().add(vc).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dd.normalize()), new T.Vector3(1, 1, 1))); }
      d.box({ c: '#9a9a94', map: 'metal' }, [0.05, 0.1, 0.05], [x, 1.76, zw + face * 0.06]);
    }
  }
  // valve wheels on the pipe, a drop with an elbow to the drain, and the rust under them
  for (const [x, sz] of [[-9.8, -1], [5.4, -1], [-6.5, 1], [7.2, 1]]) {
    const zw = sz * BZ, face = -sz;
    placeProp(kit, d, 'valvula', { pos: [x, 2.05, zw + face * 0.16], ry: sz > 0 ? 0 : 0, scale: 1.2, fb: [0.2, 0.2, 0.2] });
    d.plane({ c: '#6a3e22', opacity: 0.5 }, 0.16, 0.9, [x + 0.15, 1.1, zw + face * 0.02], { ry: sz < 0 ? 0 : Math.PI, cell: 9 });
    if (!placeProp(kit, d, 'cano_descida', { pos: [x + 0.5, 0.0, zw + face * 0.15], ry: sz > 0 ? Math.PI : 0 })) { d.cyl(steel, 0.05, 0.05, 1.9, 8, [x + 0.5, 0.0, zw + face * 0.15]); d.cyl(dark, 0.075, 0.075, 0.04, 8, [x + 0.5, 0.12, zw + face * 0.15]); }
  }
  // the unfinished walls at the ends: rebar left standing out of the concrete, to be bent into the next pour, and a form-board ledger
  for (const sx of [-1, 1]) {
    const xw = sx * BX, face = -sx;
    for (let i = 0; i < 12; i++) {
      const z = -BZ + 0.5 + rnd() * (BZ * 2 - 1), y = 0.4 + rnd() * 1.8, L = 0.3 + rnd() * 0.4;
      d.cyl({ c: '#6a4026', map: 'ferrugem' }, 0.011, 0.011, L, 5, [xw + face * L / 2, y, z], { rz: Math.PI / 2 });
    }
    d.box({ c: '#9a7a52', map: 'madeira' }, [0.06, 0.12, BZ * 2 - 1], [xw + face * 0.04, 0.9, 0], { nojitter: true, outline: true, tile: [0.5, 1.6] }); d.box({ c: '#9a7a52', map: 'madeira' }, [0.06, 0.12, BZ * 2 - 1], [xw + face * 0.04, 1.9, 0], { nojitter: true, outline: true, tile: [0.5, 1.6] });
  }
  // the mouth of the tunnel: an arch of raw concrete protruding from the wall, with rebar left in it; the tunnel itself is in galeria-tunel.js
  const { x0, x1, spring: msp, rise: mrs } = MOUTH, cxm = (x0 + x1) / 2, ax = (x1 - x0) / 2, ex = 0.36, zf = BZ - 0.22, concrete = { c: '#a8a69c', map: 'concreto' };
  {
    const quads = [], arch = (t, k, z) => [cxm + (ax + k) * Math.cos(t), msp + (mrs + k) * Math.sin(t), z];
    for (let k = 0; k < 14; k++) {
      const t0 = (Math.PI * k) / 14, t1 = (Math.PI * (k + 1)) / 14;
      quads.push([arch(t0, 0, zf), arch(t0, ex, zf), arch(t1, ex, zf), arch(t1, 0, zf), [0, 0, -1]]);             // the front of the ring
      quads.push([arch(t0, ex, zf), arch(t0, ex, BZ), arch(t1, ex, BZ), arch(t1, ex, zf), null]);                 // its outer face
    }
    const pos = [], nor = [], uv = [];
    for (const [p0, p1, p2, p3, n0] of quads) {
      const e1 = new T.Vector3(...p1).sub(new T.Vector3(...p0)), e2 = new T.Vector3(...p3).sub(new T.Vector3(...p0)), nrm = e1.cross(e2).normalize();
      let n = n0 ? new T.Vector3(...n0) : nrm.clone(); if (!n0) { const mid = new T.Vector3(...p0).add(new T.Vector3(...p2)).multiplyScalar(0.5), out = new T.Vector3(mid.x - cxm, mid.y - msp, 0); if (n.dot(out) < 0) n.negate(); }
      const flip = nrm.dot(n) < 0;
      for (const k of (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3])) { const v = [p0, p1, p2, p3][k]; pos.push(...v); nor.push(n.x, n.y, n.z); uv.push(v[0] / 1.5, v[1] / 1.5 + v[2]); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    d.add(concrete, g, new T.Matrix4());
  }
  for (const sx of [-1, 1]) { const x = sx < 0 ? x0 - ex : x1; d.box(concrete, [ex, msp, 0.22], [x + ex / 2, 0, zf + 0.11], { cell: 1, nojitter: true, outline: true }); }
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { const a = Math.PI * (sx < 0 ? 1 - (k + 0.5) / 12 : (k + 0.5) / 12); d.cyl({ c: '#6a4026', map: 'ferrugem' }, 0.012, 0.012, 0.5, 5, [cxm + (ax + ex * 0.5) * Math.cos(a), msp + (mrs + ex * 0.5) * Math.sin(a) - 0.05, zf - 0.16], { rx: Math.PI / 2 }); }   // rebar standing out of the arch
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) d.cyl({ c: '#6a4026', map: 'ferrugem' }, 0.012, 0.012, 0.45, 5, [(sx < 0 ? x0 - ex * 0.5 : x1 + ex * 0.5) + sx * 0.03 * k, 0.3 + k * 0.35, zf - 0.14], { rx: Math.PI / 2 });
  const tun = buildTunnel({ T, kit, place, parent: south, BZ, cx: cxm, picture });
  shell.add(d.build());
  return { vault, tunnelColliders: tun.colliders };
}
