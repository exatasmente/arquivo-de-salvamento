// The shapes of the city, written straight into one mesh: boxes with chamfered corners, bars, profiles drawn in section and pulled along a
// length (a cornice, a kerb), tubes and hanging wires. A `Shape` collects triangles (flat faces: one normal per face, as the kit's boxes) with
// the uv given by a function of the place (a facade is painted in elevation: `uv(x, y, z)` is its projection), and apart, the plain boxes of
// the parts that take the outline (the shell is made of them: models/outline.js). Nothing here is merged twice: a building is ONE geometry.
import { hullOf } from '../outline.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Shape {
  constructor(T) { this.T = T; this.p = []; this.n = []; this.t = []; this.hp = []; this.uv = (x, y) => [x, y]; this.tris = 0; this.xf = null; }
  /** What comes next is drawn at `pos`, turned by `yaw` about y (null: back to the shape's own frame). The uv function still gets the place before the move. */
  at(pos = null, yaw = 0) { if (!pos) { this.xf = null; return; } const c = Math.cos(yaw), s = Math.sin(yaw); this.xf = (p) => [pos[0] + p[0] * c + p[2] * s, pos[1] + p[1], pos[2] - p[0] * s + p[2] * c]; }
  /** The uv of what comes next: a function (x, y, z) -> [u, v]. Returns the one before. */
  map(fn) { const old = this.uv; this.uv = fn; return old; }
  /** One triangle (counter-clockwise seen from outside); `uvs`: its three uv, else the projection. */
  tri(a, b, c, uvs) {
    if (!uvs) uvs = [this.uv(a[0], a[1], a[2]), this.uv(b[0], b[1], b[2]), this.uv(c[0], c[1], c[2])];
    if (this.xf) { a = this.xf(a); b = this.xf(b); c = this.xf(c); }
    const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) return;
    for (const [k, v] of [a, b, c].entries()) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0] / l, n[1] / l, n[2] / l); this.t.push(uvs[k][0], uvs[k][1]); }
    this.tris++;
  }
  /** A flat polygon (convex), turned so that it faces `out` (a direction) when given; `uvs` per corner. */
  poly(pts, out, uvs) {
    if (out) { const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])); if (dot(n, out) < 0) { pts = [...pts].reverse(); if (uvs) uvs = [...uvs].reverse(); } }
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], uvs && [uvs[0], uvs[i], uvs[i + 1]]);
  }
  /**
   * A quad facing +z (the wall's face) from (x0, y0) to (x1, y1) at z, cut in pieces no larger than `cell` (the light is per vertex).
   */
  wall(x0, y0, x1, y1, z, cell = 3.3) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx, ya = y0 + ((y1 - y0) * j) / ny, yb = y0 + ((y1 - y0) * (j + 1)) / ny;
      this.tri([xa, ya, z], [xb, ya, z], [xb, yb, z]); this.tri([xa, ya, z], [xb, yb, z], [xa, yb, z]);
    }
  }
  /**
   * A flat sheet from p0 along `du` and `dv` (its face looks along du x dv), cut in pieces no larger than `cell`; `uvs(a, b)`: the uv at the
   * share a of du and b of dv (else the projection).
   */
  sheet(p0, du, dv, cell = 3.3, uvs = null) {
    const nu = Math.max(1, Math.ceil(Math.hypot(...du) / cell)), nv = Math.max(1, Math.ceil(Math.hypot(...dv) / cell));
    const P = (a, b) => [p0[0] + du[0] * a + dv[0] * b, p0[1] + du[1] * a + dv[1] * b, p0[2] + du[2] * a + dv[2] * b];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a0 = i / nu, a1 = (i + 1) / nu, b0 = j / nv, b1 = (j + 1) / nv;
      this.tri(P(a0, b0), P(a1, b0), P(a1, b1), uvs && [uvs(a0, b0), uvs(a1, b0), uvs(a1, b1)]); this.tri(P(a0, b0), P(a1, b1), P(a0, b1), uvs && [uvs(a0, b0), uvs(a1, b1), uvs(a0, b1)]);
    }
  }
  /**
   * A box from `lo` to `hi` with its corners chamfered by `c` (0: sharp). `skip`: the faces left out ('+x', '-x', '+y', '-y', '+z', '-z'): the
   * box is then open on that side and its neighbours run up to it unchamfered (a part that stands on a wall has no back).
   * `o.outline`: its plain box goes to the shell. `o.uv`: a uv function only for this box.
   */
  box(lo, hi, c = 0, skip = [], o = {}) {
    const old = o.uv ? this.map(o.uv) : null;
    const C = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], H = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
    c = Math.min(c, H[0] * 0.9, H[1] * 0.9, H[2] * 0.9);
    const has = (ax, s) => !skip.includes((s > 0 ? '+' : '-') + 'xyz'[ax]);
    // the point of corner `s` that lies on the face of axis `ax`
    const A = (s, ax) => [0, 1, 2].map((k) => C[k] + s[k] * (k === ax ? H[k] : H[k] - (c > 0 && has(k, s[k]) && has(ax, s[ax]) ? c : 0)));
    const S = [-1, 1];
    for (let ax = 0; ax < 3; ax++) for (const s of S) {
      if (!has(ax, s)) continue;
      const u = (ax + 1) % 3, v = (ax + 2) % 3, out = [0, 0, 0]; out[ax] = s;
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const sg = [0, 0, 0]; sg[ax] = s; sg[u] = a; sg[v] = b; return A(sg, ax); });
      this.poly(q, out);
    }
    if (c > 0) {
      // the twelve edges: between the faces of two axes, along the third
      for (let ax = 0; ax < 3; ax++) { const u = (ax + 1) % 3, v = (ax + 2) % 3;
        for (const su of S) for (const sv of S) {
          if (!has(u, su) || !has(v, sv)) continue;
          const sg = (w) => { const g = [0, 0, 0]; g[ax] = w; g[u] = su; g[v] = sv; return g; }, out = [0, 0, 0]; out[u] = su; out[v] = sv;
          this.poly([A(sg(-1), u), A(sg(1), u), A(sg(1), v), A(sg(-1), v)], out);
        } }
      for (const sx of S) for (const sy of S) for (const sz of S) if (has(0, sx) && has(1, sy) && has(2, sz)) { const s = [sx, sy, sz]; this.poly([A(s, 0), A(s, 1), A(s, 2)], s); }
    }
    if (o.outline) this.hull(lo, hi);
    if (old) this.map(old);
  }
  /** A plain box for the outline's shell (no uv, no painting). */
  hull(lo, hi) {
    const [x0, y0, z0] = lo, [x1, y1, z1] = hi, P = this.hp, f = this.xf ?? ((v) => v);
    const q = (a, b, c, d) => { a = f(a); b = f(b); c = f(c); d = f(d); P.push(...a, ...b, ...c, ...a, ...c, ...d); };
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }
  /**
   * A section pulled along x from x0 to x1: `prof` is a list of [z, y] walked from the top at the wall, out and down (a face walked downward looks to +z),
   * open (a cornice on a wall: only the faces between the points) or `closed`. `caps`: the two ends are closed (a convex section).
   * Cut along x in pieces of `cell`. `o.outline`: the box round it goes to the shell.
   */
  extrude(prof, x0, x1, o = {}) {
    const n = Math.max(1, Math.ceil((x1 - x0) / (o.cell ?? 3.3))), m = prof.length, last = o.closed ? m : m - 1;
    for (let k = 0; k < last; k++) {
      const [za, ya] = prof[k], [zb, yb] = prof[(k + 1) % m];
      for (let i = 0; i < n; i++) {
        const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n;
        this.tri([xa, ya, za], [xa, yb, zb], [xb, yb, zb]); this.tri([xa, ya, za], [xb, yb, zb], [xb, ya, za]);
      }
    }
    if (o.caps !== false) { const a = prof.map(([z, y]) => [x0, y, z]), b = prof.map(([z, y]) => [x1, y, z]); this.poly(a, [-1, 0, 0]); this.poly(b, [1, 0, 0]); }
    if (o.outline) { const zs = prof.map((q) => q[0]), ys = prof.map((q) => q[1]); this.hull([x0, Math.min(...ys), Math.min(...zs)], [x1, Math.max(...ys), Math.max(...zs)]); }
  }
  /** A tube between two points, `seg` sides, radius `ra` at a and `rb` at b; `uvs(k, end)`: the uv of side k (0..seg) at the end (0 or 1), else the projection. */
  tube(a, b, ra, rb = ra, seg = 6, uvs = null, caps = false, outline = false) {
    const d = sub(b, a), l = Math.hypot(d[0], d[1], d[2]); if (l < 1e-6) return;
    const w = [d[0] / l, d[1] / l, d[2] / l], ref = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = cross(ref, w); const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul]; const v = cross(w, u);
    const ring = (c, r) => Array.from({ length: seg + 1 }, (_, k) => { const an = (k / seg) * Math.PI * 2, cs = Math.cos(an) * r, sn = Math.sin(an) * r; return [c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn]; });
    const A = ring(a, ra), B = ring(b, rb);
    for (let k = 0; k < seg; k++) {
      const t = uvs ? [uvs(k, 0), uvs(k + 1, 0), uvs(k + 1, 1), uvs(k, 1)] : null;
      this.tri(A[k], A[k + 1], B[k + 1], t && [t[0], t[1], t[2]]); this.tri(A[k], B[k + 1], B[k], t && [t[0], t[2], t[3]]);
    }
    if (caps) { this.poly(B.slice(0, seg), w, uvs && B.slice(0, seg).map((_, k) => uvs(k, 1))); this.poly(A.slice(0, seg), [-w[0], -w[1], -w[2]], uvs && A.slice(0, seg).map((_, k) => uvs(k, 0))); }
    if (outline) {                                                        // its shell: the same tube, closed at both ends
      const P = this.hp, f = this.xf ?? ((q) => q), Ax = A.map(f), Bx = B.map(f), ax = f(a), bx = f(b);
      for (let k = 0; k < seg; k++) { P.push(...Ax[k], ...Ax[k + 1], ...Bx[k + 1], ...Ax[k], ...Bx[k + 1], ...Bx[k]); P.push(...bx, ...Bx[k], ...Bx[k + 1]); P.push(...ax, ...Ax[k + 1], ...Ax[k]); }
    }
  }
  /** A wire hanging between two points (a catenary cut in `n` straight lengths): a thin three-sided tube. `sag`: metres at the middle. */
  wire(a, b, sag, rad = 0.012, n = 7, uvs = null) {
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const k = i / n, p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
      this.tube(prev, p, rad, rad, 3, uvs); prev = p;
    }
  }
  /** The geometry (position, normal, uv), or null when nothing was drawn. */
  geometry() {
    if (!this.p.length) return null;
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(this.t, 2));
    return g;
  }
  /** The outline's shell of the parts marked (models/outline.js), or null. */
  shell() {
    if (!this.hp.length) return null;
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.hp, 3)); g.computeVertexNormals();
    return hullOf(T, g, 0.004);
  }
}

/** The uv function of a rectangle [u0, v0, u1, v1] of a texture stretched over a box of space: the two axes `ax` (0 x, 1 y, 2 z) from lo to hi. */
export const rectUV = (rect, axU, lo0, hi0, axV, lo1, hi1) => (x, y, z) => {
  const p = [x, y, z], a = (p[axU] - lo0) / (hi0 - lo0 || 1), b = (p[axV] - lo1) / (hi1 - lo1 || 1);
  return [rect[0] + (rect[2] - rect[0]) * Math.max(0, Math.min(1, a)), rect[1] + (rect[3] - rect[1]) * Math.max(0, Math.min(1, b))];
};
