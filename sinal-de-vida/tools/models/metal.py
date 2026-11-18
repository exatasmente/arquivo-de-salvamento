"""Hard-surface pieces painted by hand in the manner of Jonas, for the machines and the props (first user: dog.py).

Three things, all by script and all deterministic (no clock, no unseeded random, no picture and no image model):

  Kit      chamfered pieces as lists of vertices and faces: every piece is closed, its corners are chamfers, and each vertex has
           ONE normal, weighted by the area of the faces round it (the large flat faces stay flat, the chamfers carry the turn).
           That is what the game's outline wants (an inverted hull pushed out along the normals: a split normal would open it).
  Raster   the atlas: every texel is given its point on the model, its normal, its piece and material, how far it is from the
           nearest sharp edge of its own face (convex: where paint wears off; concave: where dirt gathers), how near another
           piece is (the shadow painted where two pieces meet) and how much of the sky it sees (the light painted from above).
  noise    value noise and fbm over arrays, an image out as a packed JPEG.

The painting itself (the colours, the wear, the bolts, the seams) belongs to whoever uses this: see dog.py."""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

V = Vector


# ---------------------------------------------------------------------------------------------------------------------
# the pieces

class Kit:
    def __init__(self):
        self.v = []          # points
        self.f = []          # faces (tuples of vertex indices, counter-clockwise seen from outside)
        self.fmat = []       # material name per face
        self.fpiece = []     # piece index per face
        self.pieces = []     # (name, bone, object name)
        self._cur = None

    def piece(self, name, bone, obj='dog'):
        """What follows belongs to this piece (a name the painter reads), rigid on `bone`, part of the object `obj`."""
        self.pieces.append((name, bone, obj))
        self._cur = len(self.pieces) - 1
        return self._cur

    def _face(self, idx, mat):
        self.f.append(tuple(idx))
        self.fmat.append(mat)
        self.fpiece.append(self._cur)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def loft(self, rings, mat, cap0=True, cap1=True, mats=None):
        """Rings of the same number of points, joined in order; the first and the last closed by a face each. The winding is
        worked out here (from the first ring against the way the rings go). mats(i, j) -> material of the side j of span i."""
        n = len(rings[0])
        c0 = sum((V(p) for p in rings[0]), V()) / n
        c1 = sum((V(p) for p in rings[-1]), V()) / n
        nrm = V()
        r0 = [V(p) for p in rings[0]]
        for j in range(n):                                   # Newell: the ring's own normal
            a, b = r0[j] - c0, r0[(j + 1) % n] - c0
            nrm += a.cross(b)
        if nrm.dot(c1 - c0) < 0:
            rings = [list(reversed(r)) for r in rings]
        base = len(self.v)
        for r in rings:
            self.v.extend(tuple(p) for p in r)
        for i in range(len(rings) - 1):
            for j in range(n):
                a, b = base + i * n + j, base + i * n + (j + 1) % n
                self._face((a, b, b + n, a + n), mats(i, j) if mats else mat)
        if cap0:
            self._face(tuple(base + j for j in reversed(range(n))), mat if cap0 is True else cap0)
        if cap1:
            self._face(tuple(base + (len(rings) - 1) * n + j for j in range(n)), mat if cap1 is True else cap1)

    @staticmethod
    def rect8(c, u, v, hu, hv, ch):
        """A rectangle with its four corners cut, in the plane of u and v round c."""
        c, u, v = V(c), V(u), V(v)
        ch = min(ch, hu * 0.9, hv * 0.9)
        pts = ((hu, -hv + ch), (hu, hv - ch), (hu - ch, hv), (-hu + ch, hv), (-hu, hv - ch), (-hu, -hv + ch), (-hu + ch, -hv), (hu - ch, -hv))
        return [c + u * a + v * b for a, b in pts]

    def beam(self, p0, p1, u, s0, s1, ch, mat, end=1.0):
        """A chamfered bar from p0 to p1. u: its side axis; s0, s1: (half width along u, half depth) at each end."""
        p0, p1 = V(p0), V(p1)
        w = (p1 - p0).normalized()
        u = V(u)
        u = (u - w * u.dot(w)).normalized()
        v = w.cross(u)
        e = ch * end
        rings = [self.rect8(p0, u, v, s0[0] - e, s0[1] - e, ch), self.rect8(p0 + w * e, u, v, s0[0], s0[1], ch),
                 self.rect8(p1 - w * e, u, v, s1[0], s1[1], ch), self.rect8(p1, u, v, s1[0] - e, s1[1] - e, ch)]
        self.loft(rings, mat)

    def box(self, c, size, ch, mat, u=(1, 0, 0), w=(0, 0, 1), end=1.0):
        """A chamfered box of full `size` (along u, along w x u, along w) centred on c. end: the chamfer of the two faces across
        w, as a share of `ch` (a thin plate with cut corners wants a small one)."""
        c, w = V(c), V(w).normalized()
        self.beam(c - w * size[2] / 2, c + w * size[2] / 2, u, (size[0] / 2, size[1] / 2), (size[0] / 2, size[1] / 2), ch, mat, end)

    def lathe(self, c, axis, profile, sides, mat, ref=(0, 0, 1), phase=0.0, mats=None, squash=1.0):
        """A turned piece: profile is [(distance along the axis, radius), ...]; closed at both ends."""
        c, axis = V(c), V(axis).normalized()
        ref = V(ref)
        if abs(ref.dot(axis)) > 0.95:
            ref = V((1, 0, 0))
        u = (ref - axis * ref.dot(axis)).normalized()
        v = axis.cross(u)
        rings = []
        for h, r in profile:
            rings.append([c + axis * h + (u * math.cos(phase + 2 * math.pi * k / sides) + v * squash * math.sin(phase + 2 * math.pi * k / sides)) * r for k in range(sides)])
        self.loft(rings, mat, mats=mats)

    def drum(self, c, axis, r, half, sides, mat, ch=0.008, cap=None, ref=(0, 0, 1)):
        """A cylinder with chamfered rims, centred on c. cap: the material of its two end faces, if another."""
        prof = [(-half, r - ch), (-half + ch, r), (half - ch, r), (half, r - ch)]
        n0 = len(self.f)
        self.lathe(c, axis, prof, sides, mat, ref=ref)
        if cap:
            self.fmat[-1] = cap
            self.fmat[-2] = cap
        return n0

    # ---- what the faces know of each other ---------------------------------------------------------------------------
    def analyse(self, sharp=math.radians(33)):
        """Face normals and areas, one weighted normal per vertex, and for every face its sharp edges: [(a, b, convex)]."""
        v = np.array(self.v, dtype=np.float64)
        fn, fa = [], []
        for f in self.f:
            p = v[list(f)]
            n = np.zeros(3)
            for j in range(len(f)):
                n += np.cross(p[j], p[(j + 1) % len(f)])
            a = np.linalg.norm(n) / 2
            fn.append(n / max(1e-12, 2 * a))
            fa.append(a)
        fn, fa = np.array(fn), np.array(fa)
        vn = np.zeros_like(v)
        for fi, f in enumerate(self.f):
            w = fa[fi] ** 2
            for i in f:
                vn[i] += fn[fi] * w
        ln = np.linalg.norm(vn, axis=1)
        vn /= np.maximum(ln, 1e-20)[:, None]
        edges = {}
        for fi, f in enumerate(self.f):
            for j in range(len(f)):
                a, b = f[j], f[(j + 1) % len(f)]
                edges.setdefault((min(a, b), max(a, b)), []).append((fi, a, b))
        creases = [[] for _ in self.f]
        for (a, b), fs in edges.items():
            if len(fs) != 2:
                for fi, a_, b_ in fs:
                    creases[fi].append((a_, b_, True))
                continue
            (f1, a1, b1), (f2, _, _) = fs
            cosang = float(np.clip(fn[f1].dot(fn[f2]), -1, 1))
            if math.acos(cosang) < sharp:
                continue
            convex = float(np.cross(fn[f1], fn[f2]).dot(v[b1] - v[a1])) > 0
            creases[f1].append((a, b, convex))
            creases[f2].append((a, b, convex))
        self.fn, self.fa, self.vn, self.creases, self.v_np = fn, fa, vn, creases, v
        return self


# ---------------------------------------------------------------------------------------------------------------------
# the atlas

def unwrap(kit, angle=66.0, margin=0.003):
    """UVs for every face of the kit, all in one atlas: Blender's own projection by the faces' directions, its islands packed.
    Returns one array (corners, 2) per face."""
    me = bpy.data.meshes.new('unwrap')
    me.from_pydata(kit.v, [], kit.f)
    me.update()
    me.uv_layers.new(name='atlas')
    ob = bpy.data.objects.new('unwrap', me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = me.uv_layers[0].data
    out = [np.array([uv[li].uv[:] for li in p.loop_indices], dtype=np.float64) for p in me.polygons]
    assert all(tuple(p.vertices) == kit.f[i] for i, p in enumerate(me.polygons)), 'the faces changed order'
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return out


class Raster:
    """The texels of the atlas that lie on the model, as flat arrays: yx (row, column), P, N, face, piece, mat (an index into
    `mats`), de and dc (metres to the nearest convex and concave sharp edge of the texel's own face)."""

    def __init__(self, kit, uvs, size, mats):
        n = size
        v, vn = kit.v_np, kit.vn
        Pi = np.zeros((n, n, 3), np.float32)
        Ni = np.zeros((n, n, 3), np.float32)
        Fi = np.full((n, n), -1, np.int32)
        strict = np.zeros((n, n), bool)
        DE = np.full((n, n), 9.0, np.float32)
        DC = np.full((n, n), 9.0, np.float32)
        for fi, f in enumerate(kit.f):
            uv = uvs[fi] * n
            cr = kit.creases[fi]
            for t in range(1, len(f) - 1):
                ia, ib, ic = 0, t, t + 1
                a, b, c = uv[ia], uv[ib], uv[ic]
                det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(det) < 1e-9:
                    continue
                x0, x1 = max(0, int(min(a[0], b[0], c[0])) - 1), min(n, int(max(a[0], b[0], c[0])) + 2)
                y0, y1 = max(0, int(min(a[1], b[1], c[1])) - 1), min(n, int(max(a[1], b[1], c[1])) + 2)
                if x1 <= x0 or y1 <= y0:
                    continue
                X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
                l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
                l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
                l3 = 1 - l1 - l2
                e = 1.2 / max(1.0, math.sqrt(abs(det)))                 # about a texel of slack round the triangle
                ins = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
                near = (l1 >= -e) & (l2 >= -e) & (l3 >= -e)
                sub_s = strict[y0:y1, x0:x1]
                take = ins | (near & ~sub_s & (Fi[y0:y1, x0:x1] < 0))
                if not take.any():
                    continue
                L = np.stack([l1[take], l2[take], l3[take]], axis=1)
                pa, pb, pc = v[f[ia]], v[f[ib]], v[f[ic]]
                P = L[:, :1] * pa + L[:, 1:2] * pb + L[:, 2:3] * pc
                Nn = L[:, :1] * vn[f[ia]] + L[:, 1:2] * vn[f[ib]] + L[:, 2:3] * vn[f[ic]]
                Nn /= np.maximum(np.linalg.norm(Nn, axis=1), 1e-9)[:, None]
                de = np.full(len(P), 9.0)
                dc = np.full(len(P), 9.0)
                for ea, eb, convex in cr:
                    p0, p1 = v[ea], v[eb]
                    d = p1 - p0
                    tt = np.clip((P - p0).dot(d) / max(1e-12, d.dot(d)), 0, 1)
                    dist = np.linalg.norm(P - (p0 + tt[:, None] * d), axis=1)
                    if convex:
                        de = np.minimum(de, dist)
                    else:
                        dc = np.minimum(dc, dist)
                Pi[y0:y1, x0:x1][take] = P
                Ni[y0:y1, x0:x1][take] = Nn
                Fi[y0:y1, x0:x1][take] = fi
                DE[y0:y1, x0:x1][take] = de
                DC[y0:y1, x0:x1][take] = dc
                sub_s |= ins
        self.n = n
        self.yx = np.nonzero(Fi >= 0)
        self.face = Fi[self.yx]
        self.P = Pi[self.yx].astype(np.float64)
        self.N = Ni[self.yx].astype(np.float64)
        self.de = DE[self.yx].astype(np.float64)
        self.dc = DC[self.yx].astype(np.float64)
        self.piece = np.array(kit.fpiece, np.int32)[self.face]
        self.mats = list(mats)
        self.mat = np.array([self.mats.index(m) for m in kit.fmat], np.int32)[self.face]
        self.fill = len(self.face) / (n * n)

    def occlusion(self, kit, reach=0.07, far=0.7):
        """near: metres to the nearest OTHER piece (up to `reach`). sky: the share of a soft light from above that reaches the texel
        (rays to the upper half; the ground is not in it)."""
        m = len(self.face)
        near = np.full(m, reach)
        sky = np.ones(m)
        fpiece = np.array(kit.fpiece)
        whole = BVHTree.FromPolygons(kit.v, kit.f, all_triangles=False, epsilon=0.0)
        dirs = [V((0, 0, 1))] + [V((math.sin(0.9) * math.cos(a), math.sin(0.9) * math.sin(a), math.cos(0.9))) for a in (0.4, 1.66, 2.9, 4.2, 5.4)]
        order = np.argsort(self.piece, kind='stable')
        P, N, piece = self.P.tolist(), self.N.tolist(), self.piece.tolist()
        cur, tree = -1, None
        for i in order.tolist():
            pc = piece[i]
            if pc != cur:
                cur = pc
                others = [kit.f[k] for k in np.nonzero(fpiece != pc)[0]]
                tree = BVHTree.FromPolygons(kit.v, others, all_triangles=False, epsilon=0.0)
            p = V(P[i])
            nn = V(N[i])
            hit = tree.find_nearest(p, reach)
            if hit[0] is not None:
                near[i] = hit[3]
            o = p + nn * 0.004
            tot = got = 0.0
            for d in dirs:
                w = nn.dot(d)
                if w <= 0.05:
                    continue
                tot += w
                if whole.ray_cast(o, d, far)[0] is None:
                    got += w
            if tot > 0:
                sky[i] = got / tot
        self.near, self.sky = near, sky
        return self

    def image(self, name, rgb, bg=(0.2, 0.2, 0.2), spread=8):
        """The painted texels as a packed JPEG image; the paint is spread a few texels past the islands' edges."""
        n = self.n
        img = np.empty((n, n, 3), np.float32)
        img[:] = bg
        mask = np.zeros((n, n), bool)
        img[self.yx] = np.clip(rgb, 0, 1)
        mask[self.yx] = True
        for _ in range(spread):
            acc = np.zeros_like(img)
            cnt = np.zeros((n, n), np.float32)
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                sm = np.roll(mask, (dy, dx), axis=(0, 1))
                acc += np.roll(img, (dy, dx), axis=(0, 1)) * sm[:, :, None]
                cnt += sm
            new = ~mask & (cnt > 0)
            img[new] = acc[new] / cnt[new][:, None]
            mask |= new
        im = bpy.data.images.new(name, n, n, alpha=False)
        im.file_format = 'JPEG'
        im.colorspace_settings.name = 'Non-Color'            # the game reads the numbers as they are
        px = np.ones((n, n, 4), np.float32)
        px[:, :, :3] = img
        im.pixels.foreach_set(px.reshape(-1))
        im.pack()
        self.rgb_image = img
        return im


def save_png(img, path):
    """Debug: an (n, n, 3) array as a PNG file."""
    n = img.shape[0]
    im = bpy.data.images.new('dump', n, n, alpha=False)
    px = np.ones((n, n, 4), np.float32)
    px[:, :, :3] = img
    im.pixels.foreach_set(px.reshape(-1))
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)


# ---------------------------------------------------------------------------------------------------------------------
# noise over arrays

def _hash(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 974711) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1103515245) & 0xFFFFFFFF
    h = ((h ^ (h >> 15)) * 2246822519) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, z, seed=0):
    """Value noise, 0..1, of three arrays."""
    xi, yi, zi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    xf, yf, zf = x - xi, y - yi, z - zi
    xf, yf, zf = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf), zf * zf * (3 - 2 * zf)
    out = 0.0
    for a in (0, 1):
        for b in (0, 1):
            for c in (0, 1):
                w = (xf if a else 1 - xf) * (yf if b else 1 - yf) * (zf if c else 1 - zf)
                out = out + w * _hash(xi + a, yi + b, zi + c, seed)
    return out


def fbm(P, f, octaves=3, seed=0, stretch=(1, 1, 1)):
    s, a, tot = 0.0, 0.5, 0.0
    for i in range(octaves):
        s = s + a * vnoise(P[:, 0] * f * stretch[0], P[:, 1] * f * stretch[1], P[:, 2] * f * stretch[2], seed + i * 17)
        tot += a
        a *= 0.5
        f *= 2.07
    return s / tot


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(c, d, k):
    """c, d: (m, 3) or a colour; k: (m,)."""
    k = np.asarray(k)[:, None]
    return c * (1 - k) + np.asarray(d) * k
