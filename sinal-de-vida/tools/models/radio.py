"""The station radio: an old fleet base set for a desk, with the parts the game moves as nodes of their own.

    "$BLENDER" --background --factory-startup --python tools/models/radio.py -- --out assets/props

Writes <out>/radio.glb. Few polygons for the shape; the detail (knurling, slots, screws, the scale, the letters of the keys, wear) is
painted here, texel by texel with numpy, into one atlas, and a height map painted beside it becomes the normal map. Nothing is
downloaded and nothing is random without a seed.

The layout is radio_layout.py. Nodes (all children of `radio`; the origin of each is its pivot):
  body                      the case, the panel, the scale's and the meter's faces
  dial                      the selector: turns about its own z
  needle                    the pointer of the scale: slides along its own x
  display                   the liquid crystal display: one quad, UV 0..1, a material of its own
  led_tx, led_rx            the two lights; each has a child `<name>_on`, the same lens lit (hidden until the game shows it)
  vu_needle                 the meter's needle: turns about its own z
  key_0 .. key_11           the 12 keys, row by row (1 2 3 / 4 5 6 / 7 8 9 / * 0 #): sink along their own -z
  color_0 .. color_4        the five colour buttons (blue, green, violet, cyan, pink), with `color_<i>_on`: sink along -z
  seq_0 .. seq_7            the row of eight lights under the display, with `seq_<i>_on` (painted white: the game tints it)
  speaker                   the grille
  mic_hook                  the hook at the right of the case
  mic                       the hand microphone, on the hook; children: `mic_ptt` (the talk bar, sinks along its own -z, which is
                            the microphone's +x) and `mic_cord_end` (an empty where the cord enters it)
  mic_cord                  the coiled cord: a helix along its own y from the socket in the panel (its origin) to the microphone on
                            the hook. The game bends it between the socket and `mic_cord_end` (src/models/props/radio.js).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
import radio_layout as L  # noqa: E402

SIZE = 1024
NSIZE = 512
PAD = 3


def log(*a):
    print('RADIO', *a, flush=True)


# ----------------------------------------------------------------------------------------------------------------
# paint helpers (numpy; X and Y are arrays of metres inside a rectangle of the atlas)

_GRIDS = {}


def vnoise(X, Y, scale, seed):
    g = _GRIDS.get(seed)
    if g is None:
        g = _GRIDS[seed] = np.random.RandomState(seed).rand(64, 64).astype(np.float32)
    sx, sy = (scale, scale) if not isinstance(scale, tuple) else scale
    x, y = X / sx + seed * 7.13, Y / sy + seed * 3.71
    xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - xi, y - yi
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = g[yi % 64, xi % 64], g[yi % 64, (xi + 1) % 64]
    c, d = g[(yi + 1) % 64, xi % 64], g[(yi + 1) % 64, (xi + 1) % 64]
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def fbm(X, Y, scale, seed, o=3):
    s, k, t = 0.0, 1.0, 0.0
    for i in range(o):
        s = s + k * vnoise(X, Y, scale / (2 ** i), seed + i * 17)
        t += k
        k *= 0.5
    return s / t


def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def col(c):
    return np.array(c, dtype=np.float32)


def mixc(a, b, k):
    return a + (b - a) * np.asarray(k)[..., None]


def sd_box(X, Y, cx, cy, hw, hh, r=0.0):
    qx, qy = np.abs(X - cx) - hw + r, np.abs(Y - cy) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def sd_circle(X, Y, cx, cy, r):
    return np.hypot(X - cx, Y - cy) - r


def surface(X, Y, base, seed, ang=0.2, amt=1.0):
    """Painted by hand: a flat colour broken by broad patches, by strokes along one direction and by a little grain; warmer where it
    is lighter and cooler where it is darker."""
    ca, sa = math.cos(ang), math.sin(ang)
    A, B = X * ca + Y * sa, -X * sa + Y * ca
    big = fbm(X, Y, 0.06, seed)
    st = vnoise(A, B, (0.028, 0.0035), seed + 5) * 0.65 + vnoise(A, B, (0.012, 0.0017), seed + 9) * 0.35
    fine = vnoise(X, Y, 0.0012, seed + 3)
    val = 0.86 + 0.2 * big + 0.13 * (st - 0.5) * amt + 0.05 * (fine - 0.5)
    rgb = col(base)[None, None, :] * val[..., None]
    warm = (val - 0.95)[..., None] * np.array([0.10, 0.02, -0.10], dtype=np.float32)
    return np.clip(rgb + warm * float(np.mean(base)) * 1.5, 0, 1)


def edges(X, Y, w, h, rgb, wear=0.5, seed=1, dark=0.35, light=(0.62, 0.60, 0.55)):
    """A face of a box: darker toward its borders (the paint's own shadow), with the border itself rubbed light here and there."""
    d = np.minimum(np.minimum(X, w - X), np.minimum(Y, h - Y))
    rgb = rgb * (1 - dark * sm(0.012, 0.0, d))[..., None]
    k = sm(0.0020, 0.0006, d) * (0.25 + 0.75 * sm(0.4, 0.8, fbm(X, Y, 0.03, seed + 40, 2))) * wear * 0.7
    return mixc(rgb, col(light), k)


def shade_up(Y, h, a=0.9, b=1.1):
    """The painted light: from above."""
    return a + (b - a) * np.clip(Y / h, 0, 1)


# a 5x7 font (columns, bit 0 at the top): the digits, the capitals, * and #
FONT = {
    '0': (0x3E, 0x51, 0x49, 0x45, 0x3E), '1': (0x00, 0x42, 0x7F, 0x40, 0x00), '2': (0x42, 0x61, 0x51, 0x49, 0x46), '3': (0x21, 0x41, 0x45, 0x4B, 0x31),
    '4': (0x18, 0x14, 0x12, 0x7F, 0x10), '5': (0x27, 0x45, 0x45, 0x45, 0x39), '6': (0x3C, 0x4A, 0x49, 0x49, 0x30), '7': (0x01, 0x71, 0x09, 0x05, 0x03),
    '8': (0x36, 0x49, 0x49, 0x49, 0x36), '9': (0x06, 0x49, 0x49, 0x29, 0x1E), 'A': (0x7E, 0x11, 0x11, 0x11, 0x7E), 'B': (0x7F, 0x49, 0x49, 0x49, 0x36),
    'C': (0x3E, 0x41, 0x41, 0x41, 0x22), 'D': (0x7F, 0x41, 0x41, 0x22, 0x1C), 'E': (0x7F, 0x49, 0x49, 0x49, 0x41), 'F': (0x7F, 0x09, 0x09, 0x09, 0x01),
    'G': (0x3E, 0x41, 0x49, 0x49, 0x7A), 'H': (0x7F, 0x08, 0x08, 0x08, 0x7F), 'I': (0x00, 0x41, 0x7F, 0x41, 0x00), 'J': (0x20, 0x40, 0x41, 0x3F, 0x01),
    'K': (0x7F, 0x08, 0x14, 0x22, 0x41), 'L': (0x7F, 0x40, 0x40, 0x40, 0x40), 'M': (0x7F, 0x02, 0x0C, 0x02, 0x7F), 'N': (0x7F, 0x04, 0x08, 0x10, 0x7F),
    'O': (0x3E, 0x41, 0x41, 0x41, 0x3E), 'P': (0x7F, 0x09, 0x09, 0x09, 0x06), 'Q': (0x3E, 0x41, 0x51, 0x21, 0x5E), 'R': (0x7F, 0x09, 0x19, 0x29, 0x46),
    'S': (0x46, 0x49, 0x49, 0x49, 0x31), 'T': (0x01, 0x01, 0x7F, 0x01, 0x01), 'U': (0x3F, 0x40, 0x40, 0x40, 0x3F), 'V': (0x1F, 0x20, 0x40, 0x20, 0x1F),
    'W': (0x3F, 0x40, 0x38, 0x40, 0x3F), 'X': (0x63, 0x14, 0x08, 0x14, 0x63), 'Y': (0x07, 0x08, 0x70, 0x08, 0x07), 'Z': (0x61, 0x51, 0x49, 0x45, 0x43),
    '*': (0x14, 0x08, 0x3E, 0x08, 0x14), '#': (0x14, 0x7F, 0x14, 0x7F, 0x14), ' ': (0, 0, 0, 0, 0),
}


def text(X, Y, s, cx, cy, height, bold=1.0):
    """The coverage (0..1) of a string centred at (cx, cy), `height` metres tall: the dots of the font, softened into strokes."""
    n = len(s)
    cols = n * 6 - 1
    bm = np.zeros((7 + 4, cols + 4), dtype=np.float32)
    for k, ch in enumerate(s):
        for cxi, bits in enumerate(FONT[ch]):
            for r in range(7):
                if bits >> r & 1:
                    bm[2 + (6 - r), 2 + k * 6 + cxi] = 1.0
    px = height / 7.0
    gx = (X - (cx - cols * px / 2)) / px + 2 - 0.5
    gy = (Y - (cy - height / 2)) / px + 2 - 0.5
    xi, yi = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - xi, gy - yi
    ok = (xi >= 0) & (xi < cols + 3) & (yi >= 0) & (yi < 10)
    xi, yi = np.clip(xi, 0, cols + 2), np.clip(yi, 0, 9)
    v = (bm[yi, xi] * (1 - fx) + bm[yi, xi + 1] * fx) * (1 - fy) + (bm[yi + 1, xi] * (1 - fx) + bm[yi + 1, xi + 1] * fx) * fy
    return sm(0.5 - 0.22 * bold, 0.5 + 0.12, v) * ok


# ----------------------------------------------------------------------------------------------------------------
# the atlas: rectangles asked for in metres, packed in rows, painted after the packing

class Rect:
    def __init__(self, name, wm, hm, density, fn):
        self.name, self.wm, self.hm, self.fn = name, wm, hm, fn
        self.w, self.h = max(4, int(round(wm * density))), max(4, int(round(hm * density)))
        self.x = self.y = 0

    def uv(self, sx, sy):
        return ((self.x + sx / self.wm * self.w) / SIZE, (self.y + sy / self.hm * self.h) / SIZE)


class Atlas:
    def __init__(self):
        self.rects = {}

    def rect(self, name, wm, hm, density, fn):
        if name not in self.rects:
            self.rects[name] = Rect(name, wm, hm, density, fn)
        return self.rects[name]

    def pack(self):
        x = y = row = 0
        for r in sorted(self.rects.values(), key=lambda r: (-r.h, -r.w, r.name)):
            w, h = r.w + 2 * PAD, r.h + 2 * PAD
            if x + w > SIZE:
                x, y, row = 0, y + row, 0
            r.x, r.y = x + PAD, y + PAD
            x += w
            row = max(row, h)
        if y + row > SIZE:
            raise SystemExit('the atlas is full: %d rows of %d' % (y + row, SIZE))
        log('atlas rows used', y + row, 'of', SIZE)

    def paint(self):
        rgb = np.zeros((SIZE, SIZE, 3), dtype=np.float32) + col((0.16, 0.17, 0.18))
        hgt = np.full((SIZE, SIZE), 0.5, dtype=np.float32)
        for r in self.rects.values():
            xs = (np.arange(-PAD, r.w + PAD) + 0.5) / r.w * r.wm
            ys = (np.arange(-PAD, r.h + PAD) + 0.5) / r.h * r.hm
            X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
            c, h = r.fn(X, Y, r.wm, r.hm)
            rgb[r.y - PAD:r.y + r.h + PAD, r.x - PAD:r.x + r.w + PAD] = np.clip(c, 0, 1)
            hgt[r.y - PAD:r.y + r.h + PAD, r.x - PAD:r.x + r.w + PAD] = np.broadcast_to(h, X.shape)
        return rgb, hgt


def image(name, rgb, fmt='JPEG'):
    n, m = rgb.shape[1], rgb.shape[0]
    im = bpy.data.images.new(name, n, m, alpha=False)
    im.file_format = fmt
    im.colorspace_settings.name = 'Non-Color'            # the game reads the numbers as they are
    px = np.concatenate([rgb, np.ones((m, n, 1), dtype=np.float32)], axis=2)
    im.pixels.foreach_set(px.reshape(-1))
    im.pack()
    return im


def normal_map(hgt, strength, out):
    a = hgt
    for ax in (0, 1):
        a = (np.roll(a, 1, axis=ax) + 2 * a + np.roll(a, -1, axis=ax)) / 4
    k = a.shape[0] // out
    if k > 1:
        a = a.reshape(out, k, out, k).mean(axis=(1, 3))
    dx = (np.roll(a, -1, axis=1) - np.roll(a, 1, axis=1)) * strength * out / 256
    dy = (np.roll(a, -1, axis=0) - np.roll(a, 1, axis=0)) * strength * out / 256
    ln = np.sqrt(dx * dx + dy * dy + 1.0)
    return np.stack([-dx / ln * 0.5 + 0.5, -dy / ln * 0.5 + 0.5, 1.0 / ln * 0.5 + 0.5], axis=2).astype(np.float32)


# ----------------------------------------------------------------------------------------------------------------
# the meshes: faces with a place in a rectangle of the atlas for every corner

class Part:
    def __init__(self, name):
        self.name = name
        self.v, self.f, self.uv, self.smooth = [], [], [], []
        self.index = {}
        self.M = Matrix.Identity(4)

    def face(self, pts, rect, st, smooth=False):
        idx = []
        for p in pts:
            q = tuple(self.M @ Vector(p))
            key = (round(q[0], 6), round(q[1], 6), round(q[2], 6))
            if key not in self.index:
                self.index[key] = len(self.v)
                self.v.append(q)
            idx.append(self.index[key])
        self.f.append(tuple(idx))
        self.uv.append([(rect, s, t) for s, t in st])
        self.smooth.append(smooth)

    def prism(self, outline, n0, n1, front, side, bevel=0.0, smooth=False, fit=None, back=False, sides=True):
        """A flat shape (x, z), counter-clockwise seen from the front, raised from n0 to n1 out of the panel (toward -y), its front
        edge chamfered by `bevel`. The front is laid flat into the rectangle `front` (over its bounding box, or the box `fit`); the
        sides run along `side`."""
        xs, zs = [p[0] for p in outline], [p[1] for p in outline]
        x0, z0 = (min(xs), min(zs)) if fit is None else (fit[0], fit[1])
        n = len(outline)
        cx, cz = sum(xs) / n, sum(zs) / n
        if bevel > 0:
            rad = max(math.hypot(x - cx, z - cz) for x, z in outline)
            k = max(0.0, 1 - bevel / rad)
            inner = [(cx + (x - cx) * k, cz + (z - cz) * k) for x, z in outline]
        else:
            inner = outline
        nb = n1 - bevel
        per, acc = [0.0], 0.0
        for i in range(n):
            a, b = outline[i], outline[(i + 1) % n]
            acc += math.hypot(b[0] - a[0], b[1] - a[1])
            per.append(acc)
        ks = side.wm / acc
        for i in range(n):
            j = (i + 1) % n
            a, b = outline[i], outline[j]
            if sides:
                self.face([(a[0], -n0, a[1]), (b[0], -n0, b[1]), (b[0], -nb, b[1]), (a[0], -nb, a[1])], side,
                          [(per[i] * ks, 0), (per[i + 1] * ks, 0), (per[i + 1] * ks, side.hm), (per[i] * ks, side.hm)], smooth)
            if bevel > 0:
                c, d = inner[i], inner[j]
                self.face([(a[0], -nb, a[1]), (b[0], -nb, b[1]), (d[0], -n1, d[1]), (c[0], -n1, c[1])], front,
                          [(a[0] - x0, a[1] - z0), (b[0] - x0, b[1] - z0), (d[0] - x0, d[1] - z0), (c[0] - x0, c[1] - z0)], smooth)
        self.face([(x, -n1, z) for x, z in inner], front, [(x - x0, z - z0) for x, z in inner], smooth and bevel > 0)
        if back:
            self.face([(x, -n0, z) for x, z in reversed(outline)], side, [(0, 0)] * n)

    def build(self, mat, world, parent=None):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        me.materials.append(mat)
        me.uv_layers.new(name='UVMap')
        for poly, s in zip(me.polygons, self.smooth):
            poly.use_smooth = s
        PENDING.append((me, self.uv))                    # the UVs wait for the packing of the atlas
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = world
        if parent:
            ob.parent = parent
            ob.matrix_parent_inverse = parent.matrix_world.inverted()
        return ob


PENDING = []


def assign_uvs():
    for me, uvs in PENDING:
        uv = me.uv_layers[0]
        for poly, corners in zip(me.polygons, uvs):
            for li, (rect, a, b) in zip(poly.loop_indices, corners):
                uv.data[li].uv = rect.uv(a, b) if rect else (a, b)


def circle(r, n, cx=0.0, cz=0.0, a0=0.0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cz + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def rrect(hw, hh, r, seg=3, cx=0.0, cz=0.0):
    out = []
    for qx, qz, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            out.append((cx + qx * (hw - r) + r * math.cos(a), cz + qz * (hh - r) + r * math.sin(a)))
    return out


def box(hw, hh, cx=0.0, cz=0.0):
    return [(cx - hw, cz - hh), (cx + hw, cz - hh), (cx + hw, cz + hh), (cx - hw, cz + hh)]


def panel_matrix(u, v, n=0.0):
    """The frame of a part on the panel: its x along u, its z along v, its -y out of the panel."""
    m = Matrix.Identity(4)
    m.col[0][:3] = L.AX_U
    m.col[1][:3] = tuple(-a for a in L.AX_N)
    m.col[2][:3] = L.AX_V
    m.col[3][:3] = L.panel(u, v, n)
    return m


# ----------------------------------------------------------------------------------------------------------------
# the colours

CASE = (0.165, 0.185, 0.20)          # the case: dark blue-grey enamel
PANEL = (0.33, 0.37, 0.35)           # the panel: grey-green hammered paint
BAKELITE = (0.075, 0.07, 0.07)
IVORY = (0.80, 0.76, 0.66)
CREAM = (0.90, 0.84, 0.64)
STEEL = (0.50, 0.50, 0.49)
INK = (0.10, 0.09, 0.09)
LABEL = (0.84, 0.80, 0.68)
LCD = (0.42, 0.47, 0.36)
RED, GREEN = (0.93, 0.16, 0.10), (0.25, 0.92, 0.36)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


# ----------------------------------------------------------------------------------------------------------------
# the painters: fn(X, Y, w, h) -> (rgb, height)

def paint_case(seed, light=1.0, slots=False, back=False):
    def fn(X, Y, w, h):
        c = surface(X, Y, CASE, seed, ang=0.05) * light
        c = edges(X, Y, w, h, c, wear=0.75, seed=seed)
        hg = np.full(X.shape, 0.5, dtype=np.float32)
        hg = hg - 0.3 * sm(0.003, 0.0, np.minimum(np.minimum(X, w - X), np.minimum(Y, h - Y)))
        if slots:                                         # the vents of the top, toward the back
            for row in range(2):
                cy = h * (0.66 + 0.16 * row)
                for k in range(9):
                    cx = w * 0.5 + (k - 4) * 0.044
                    d = sd_box(X, Y, cx, cy, 0.016, 0.0028, 0.0028)
                    c = mixc(c, col((0.03, 0.03, 0.035)), sm(0.0006, -0.0004, d))
                    c = mixc(c, col((0.42, 0.44, 0.45)), 0.6 * sm(0.0012, 0.0004, d) * sm(-0.0002, 0.0006, d) * (Y < cy))
                    hg = hg - 0.4 * sm(0.0008, -0.0006, d)
            for sx in (0.02, w - 0.02):                    # two screws at the front
                c, hg = screw(X, Y, c, hg, sx, 0.02, 0.0042, seed + int(sx * 100))
        if back:                                          # the back: a plate with two sockets and a fuse, all dull
            d = sd_box(X, Y, w * 0.5, h * 0.5, w * 0.36, h * 0.3, 0.004)
            c = mixc(c, col((0.24, 0.25, 0.24)), 0.7 * sm(0.0005, -0.0005, d))
            hg = hg + 0.12 * sm(0.0008, -0.0008, d)
            for cx, rr in ((w * 0.28, 0.014), (w * 0.5, 0.009), (w * 0.72, 0.014)):
                dd = sd_circle(X, Y, cx, h * 0.5, rr)
                c = mixc(c, col((0.42, 0.40, 0.36)), sm(0.0006, -0.0004, dd))
                c = mixc(c, col((0.04, 0.04, 0.04)), sm(0.0, -0.001, dd + rr * 0.45))
                hg = hg + 0.2 * sm(0.0006, -0.0006, dd) - 0.4 * sm(0.0, -0.001, dd + rr * 0.45)
        grime = sm(0.05, 0.0, Y) * 0.25 if not slots else 0.0
        c = c * (1 - grime * (0.6 + 0.4 * vnoise(X, Y, 0.02, seed + 2)))[..., None] if not slots else c
        return c, hg
    return fn


def screw(X, Y, c, hg, cx, cy, r, seed):
    d = sd_circle(X, Y, cx, cy, r)
    ang = (seed * 2.399) % math.pi
    slot = np.abs((X - cx) * math.sin(ang) - (Y - cy) * math.cos(ang))
    head = col((0.56, 0.55, 0.51))[None, None, :] * (0.82 + 0.3 * (Y - cy) / r)[..., None]
    head = mixc(head, col((0.08, 0.07, 0.07)), sm(r * 0.22, r * 0.1, slot))
    k = sm(0.0005, -0.0003, d)
    c = c * (1 - 0.45 * sm(r * 0.9, 0.0, d) * (1 - k))[..., None]              # its shadow on the paint
    c = mixc(c, head, k)
    hg = hg + k * (0.25 - 0.3 * sm(r * 0.22, r * 0.1, slot))
    return c, hg


def window(X, Y, c, hg, cx, cy, hw, hh, r, fill, rim=0.0032):
    """A window sunk in the panel: a black rim, lit along its lower inner edge and shadowed along the upper one."""
    d = sd_box(X, Y, cx, cy, hw, hh, r)
    c = c * (1 - 0.4 * sm(rim + 0.006, rim, d) * sm(rim - 0.001, rim + 0.001, d))[..., None]
    ring = sm(rim + 0.0005, rim - 0.0003, d)
    rimc = col((0.06, 0.06, 0.065))[None, None, :] * (0.8 + 0.5 * sm(-hh, hh, Y - cy))[..., None]
    c = mixc(c, rimc, ring)
    inside = sm(0.0004, -0.0004, d)
    if fill is not None:
        c = mixc(c, fill, inside)
    c = c * (1 - 0.5 * inside * sm(-0.004, 0.0, d) * (Y > cy))[..., None]       # the rim's shadow on what lies inside
    hg = hg + 0.25 * ring * (1 - inside) - 0.3 * inside
    return c, hg


def recess(X, Y, c, hg, d, depth=0.5, soft=0.0045):
    """The shadow a raised part lays on the panel round itself (and a little below)."""
    k = sm(soft, 0.0, d)
    return c * (1 - depth * k)[..., None], hg - 0.12 * sm(0.001, 0.0, d)


def paint_panel(X, Y, w, h):
    u, v = X - w / 2, Y                                    # the panel's own (u, v)
    c = surface(X, Y, PANEL, 11, ang=0.12)
    c = c * (0.86 + 0.2 * (v / h))[..., None]
    ham = vnoise(X, Y, 0.0032, 71)                         # hammered paint: small dimples
    c = c * (0.94 + 0.12 * ham)[..., None]
    hg = 0.5 + 0.1 * (ham - 0.5)
    c = edges(X, Y, w, h, c, wear=0.3, seed=12, dark=0.45)
    # two engraved lines divide the panel in three
    for gu in (-0.075, 0.092):
        d = np.abs(u - gu)
        k = sm(0.0009, 0.0003, d) * sm(0.012, 0.02, v) * sm(h - 0.012, h - 0.02, v)
        c = mixc(c, col((0.10, 0.12, 0.12)), k * 0.8)
        c = mixc(c, col((0.55, 0.60, 0.56)), 0.5 * sm(0.0016, 0.001, np.abs(u - gu - 0.0012)) * sm(0.012, 0.02, v) * sm(h - 0.012, h - 0.02, v))
        hg = hg - 0.25 * k
    # the scale's window and the meter's (their faces are quads of their own, painted apart), and the display's
    sc, vu, dp = L.SCALE, L.VU, L.DISPLAY
    c, hg = window(u, v, c, hg, sc['c'][0], sc['c'][1], sc['size'][0] / 2, sc['size'][1] / 2, 0.003, col(CREAM)[None, None, :] * 0.8)
    c, hg = window(u, v, c, hg, vu['c'][0], vu['c'][1], vu['size'][0] / 2, vu['size'][1] / 2, 0.004, col(CREAM)[None, None, :] * 0.8)
    lcd = col(LCD)[None, None, :] * (0.9 + 0.12 * vnoise(X, Y, 0.02, 31))[..., None]
    c, hg = window(u, v, c, hg, dp['c'][0], dp['c'][1], dp['size'][0] / 2 + 0.003, dp['size'][1] / 2 + 0.003, 0.003, lcd, rim=0.004)
    # the selector's seat: a ring of index marks round it, one every click
    dc = L.DIAL['c']
    rr, th = np.hypot(u - dc[0], v - dc[1]), np.arctan2(v - dc[1], u - dc[0])
    c, hg = recess(u, v, c, hg, rr - L.DIAL['skirt'], 0.55, 0.008)
    tick = np.abs(((th / L.DIAL['step']) + 0.5) % 1.0 - 0.5) * L.DIAL['step'] * rr
    c = mixc(c, col(LABEL), 0.85 * sm(0.0008, 0.0003, tick) * sm(L.DIAL['skirt'] + 0.003, L.DIAL['skirt'] + 0.004, rr) * sm(L.DIAL['skirt'] + 0.009, L.DIAL['skirt'] + 0.008, rr))
    c = mixc(c, col(LABEL), 0.9 * text(u, v, 'CANAL', dc[0], dc[1] - 0.056, 0.0058))
    # the row of lights, the colour buttons, the keys, the two lights: each casts its shadow
    for i in range(L.SEQ['count']):
        su, sv = L.seq_uv(i)
        c, hg = recess(u, v, c, hg, sd_box(u, v, su, sv, L.SEQ['size'][0] / 2 + 0.001, L.SEQ['size'][1] / 2 + 0.001, 0.002), 0.6, 0.003)
    d = sd_box(u, v, L.SEQ['u0'], L.SEQ['v'], L.SEQ['pitch'] * 4 + 0.003, 0.0075, 0.003)       # the strip they sit in
    c = mixc(c, col((0.09, 0.10, 0.10)), 0.85 * sm(0.0005, -0.0005, d))
    hg = hg - 0.15 * sm(0.0005, -0.0005, d)
    for i in range(L.COLORS['count']):
        cu, cv = L.color_uv(i)
        dd = sd_circle(u, v, cu, cv, L.COLORS['r'])
        c = mixc(c, col((0.62, 0.61, 0.56)), 0.9 * sm(0.0026, 0.0018, dd) * sm(0.0006, 0.0014, dd) * (0.7 + 0.5 * sm(-0.01, 0.01, v - cv)))     # a steel collar
        c, hg = recess(u, v, c, hg, sd_circle(u, v, cu, cv - 0.0015, L.COLORS['r'] + 0.0026), 0.5, 0.004)
        hg = hg + 0.2 * sm(0.0028, 0.0018, dd) * sm(0.0004, 0.0014, dd)
    kc, ks, kp = L.KEYS['c'], L.KEYS['size'], L.KEYS['pitch']
    d = sd_box(u, v, kc[0], kc[1], kp[0] * 1.5 + 0.002, kp[1] * 2 + 0.002, 0.004)                # the keys' well
    c = mixc(c, col((0.10, 0.11, 0.11)), 0.9 * sm(0.0005, -0.0005, d))
    c = mixc(c, col((0.58, 0.62, 0.58)), 0.5 * sm(0.0016, 0.0008, np.abs(d - 0.001)) * (v < kc[1]))
    hg = hg - 0.3 * sm(0.0005, -0.0005, d)
    for name in ('tx', 'rx'):
        lu, lv = L.LEDS[name]
        dd = sd_circle(u, v, lu, lv, L.LEDS['r'])
        c = mixc(c, col((0.60, 0.59, 0.54)), 0.9 * sm(0.0022, 0.0015, dd) * sm(0.0003, 0.001, dd))
        c, hg = recess(u, v, c, hg, sd_circle(u, v, lu, lv - 0.001, L.LEDS['r'] + 0.002), 0.45, 0.003)
        c = mixc(c, col(LABEL), 0.9 * text(u, v, name.upper(), lu, lv - 0.0135, 0.0052))
    # the speaker's seat
    sp = L.SPEAKER
    c, hg = recess(u, v, c, hg, sd_box(u, v, sp['c'][0], sp['c'][1] - 0.0015, sp['size'][0] / 2, sp['size'][1] / 2, 0.004), 0.55, 0.005)
    # the microphone's socket: a steel ring round a dark hole; a toggle above it
    ju, jv = L.JACK
    dd = sd_circle(u, v, ju, jv, 0.0105)
    ring = col(STEEL)[None, None, :] * (0.75 + 0.5 * sm(-0.01, 0.01, v - jv) + 0.2 * (vnoise(th * 0 + np.arctan2(v - jv, u - ju), dd, (0.2, 0.002), 5) - 0.5))[..., None]
    c, hg = recess(u, v, c, hg, sd_circle(u, v, ju, jv - 0.0015, 0.0115), 0.5, 0.004)
    c = mixc(c, ring, sm(0.0005, -0.0003, dd))
    c = mixc(c, col((0.03, 0.03, 0.03)), sm(0.0, -0.0008, dd + 0.0045))
    hg = hg + 0.3 * sm(0.0005, -0.0003, dd) - 0.6 * sm(0.0, -0.0008, dd + 0.0045)
    c = mixc(c, col(LABEL), 0.9 * text(u, v, 'MIC', ju, jv - 0.0175, 0.0052))
    su, sv = L.SWITCH
    dd = sd_circle(u, v, su, sv, 0.0058)
    c, hg = recess(u, v, c, hg, sd_circle(u, v, su, sv - 0.001, 0.0066), 0.45, 0.003)
    c = mixc(c, col(STEEL)[None, None, :] * (0.7 + 0.6 * sm(-0.006, 0.006, v - sv))[..., None], sm(0.0005, -0.0003, dd))
    lever = sd_box(u, v, su, sv + 0.004, 0.0017, 0.0052, 0.0017)
    c = mixc(c, col((0.80, 0.79, 0.74))[None, None, :] * (0.8 + 0.3 * sm(su - 0.002, su + 0.002, u))[..., None], sm(0.0004, -0.0003, lever))
    hg = hg + 0.25 * sm(0.0005, -0.0003, dd) + 0.3 * sm(0.0004, -0.0003, lever)
    # screws at the corners
    for k, (sx, sy) in enumerate(((-0.215, 0.022), (0.222, 0.016), (-0.215, 0.119), (0.228, 0.184), (-0.079, 0.184), (0.092, 0.012))):
        c, hg = screw(u, v, c, hg, sx, sy, 0.0036, 20 + k)
    # dirt in the lower corners, and a few scratches
    c = c * (1 - 0.22 * sm(0.03, 0.0, v) * (0.5 + 0.5 * vnoise(X, Y, 0.015, 77)))[..., None]
    scr = sm(0.93, 0.97, vnoise(X + Y * 0.6, Y - X * 0.6, (0.06, 0.0009), 91)) * sm(0.4, 0.6, vnoise(X, Y, 0.05, 93))
    c = mixc(c, col((0.56, 0.60, 0.57)), 0.28 * scr)
    return c, hg


def paint_scale(X, Y, w, h):
    """The slide-rule scale behind its window: the channels 1 to 99, a tick every one, a longer one every five, a number every ten."""
    c = col(CREAM)[None, None, :] * (0.78 + 0.26 * sm(0.0, h, Y) * (0.85 + 0.3 * vnoise(X, Y, 0.03, 4)))[..., None]
    c = c * (1 - 0.45 * sm(0.012, 0.0, np.minimum(X, w - X)))[..., None]             # the lamp behind it reaches the ends less
    c = c * (0.93 + 0.1 * vnoise(X, Y, (0.02, 0.002), 6))[..., None]
    u = X - w / 2
    ch = 50 + u / L.SCALE['travel'] * 49
    near = np.round(ch)
    du = np.abs(ch - near) * L.SCALE['travel'] / 49
    ok = (near >= 1) & (near <= 99)
    long_ = (near % 10 == 0) * 1.0 + (near % 5 == 0) * 0.5
    top = h * 0.5 + 0.0018 * (1 + long_ * 1.5)
    k = sm(0.00034, 0.00012, du) * sm(h * 0.5 - 0.0035, h * 0.5 - 0.0028, Y) * sm(top + 0.0004, top - 0.0003, Y) * ok
    c = mixc(c, col(INK), 0.9 * k)
    base = sm(0.0005, 0.0002, np.abs(Y - (h * 0.5 - 0.0032))) * sm(L.SCALE['travel'] + 0.001, L.SCALE['travel'], np.abs(u))
    c = mixc(c, col(INK), 0.85 * base)
    for n in range(10, 100, 10):
        c = mixc(c, col((0.45, 0.10, 0.07)) if n in (20, 50, 90) else col(INK), 0.92 * text(X, Y, str(n), w / 2 + (n - 50) / 49 * L.SCALE['travel'], h * 0.5 + 0.0105, 0.0052))
    c = mixc(c, col(INK), 0.8 * text(X, Y, 'CANAL', w / 2, h * 0.5 - 0.0095, 0.004))
    return c, np.full(X.shape, 0.5, dtype=np.float32)


def paint_vu(X, Y, w, h):
    """The meter's face: an arc of ticks, the last third red."""
    c = col(CREAM)[None, None, :] * (0.8 + 0.22 * sm(0.0, h, Y) * (0.85 + 0.3 * vnoise(X, Y, 0.02, 8)))[..., None]
    c = c * (1 - 0.35 * sm(0.008, 0.0, np.minimum(X, w - X)))[..., None]
    px, py = w / 2, h / 2 + (L.VU['pivot'][1] - L.VU['c'][1])
    rr, th = np.hypot(X - px, Y - py), np.arctan2(X - px, Y - py)             # the angle from straight up, positive to the right
    sw = L.VU['swing']
    inarc = sm(sw + 0.02, sw, np.abs(th))
    arc = sm(0.0005, 0.0002, np.abs(rr - 0.0235)) * inarc
    red = sm(sw * 0.3, sw * 0.36, th)
    c = mixc(c, mixc(np.broadcast_to(col(INK), c.shape), col((0.70, 0.12, 0.08)), red), 0.9 * arc)
    band = sm(0.0008, 0.0004, np.abs(rr - 0.0262)) * inarc * red
    c = mixc(c, col((0.70, 0.12, 0.08)), 0.9 * band)
    t = (th + sw) / (2 * sw) * 10
    dt = np.abs(t - np.round(t)) * (2 * sw / 10) * rr
    tk = sm(0.0004, 0.00015, dt) * sm(0.0195, 0.0203, rr) * sm(0.0240, 0.0232, rr) * inarc
    c = mixc(c, mixc(np.broadcast_to(col(INK), c.shape), col((0.70, 0.12, 0.08)), red), 0.9 * tk)
    c = mixc(c, col(INK), 0.85 * text(X, Y, 'VU', w / 2 - 0.0, py + 0.0125, 0.0046))
    cap = sd_circle(X, Y, px, py - 0.001, 0.0062)                               # the cover over the pivot
    c = mixc(c, col((0.07, 0.07, 0.075)), sm(0.0004, -0.0003, cap))
    return c, 0.5 + 0.2 * sm(0.0004, -0.0003, cap)


def paint_key(i):
    digit, letters = L.KEY_LABELS[i]

    def fn(X, Y, w, h):
        c = surface(X, Y, IVORY, 100 + i, ang=0.3, amt=0.6)
        d = -sd_box(X, Y, w / 2, h / 2, w / 2, h / 2, 0.003)
        c = c * shade_up(Y, h, 0.86, 1.06)[..., None]
        c = c * (1 - 0.5 * sm(0.0022, 0.0, d))[..., None]                       # the chamfer falls into shadow
        c = mixc(c, col((0.95, 0.92, 0.84)), 0.6 * sm(0.0016, 0.0024, d) * sm(0.0036, 0.0026, d) * (Y > h * 0.55))       # the top edge catches the light
        worn = sm(0.006, 0.0, np.hypot(X - w / 2, Y - h * 0.45)) * (0.3 + 0.7 * vnoise(X, Y, 0.004, 200 + i))
        c = mixc(c, col((0.88, 0.85, 0.77)), 0.35 * worn)
        c = c * (1 - 0.22 * sm(0.004, 0.0015, d) * vnoise(X, Y, 0.003, 300 + i))[..., None]      # grime at the edges
        big = letters == ''
        c = mixc(c, col(INK), 0.95 * text(X, Y, digit, w / 2, h * (0.5 if big else 0.62), 0.0098 if big else 0.0082, 1.2) * (1 - 0.3 * worn))
        if letters:
            c = mixc(c, col((0.42, 0.13, 0.09)), 0.9 * text(X, Y, letters, w / 2, h * 0.235, 0.0038))
        return c, 0.5 + 0.3 * sm(0.0, 0.003, d)
    return fn


def paint_plastic(base, seed, ribs=0, ang=0.0):
    def fn(X, Y, w, h):
        c = surface(X, Y, base, seed, ang=ang, amt=0.7) * shade_up(Y, h, 0.8, 1.15)[..., None]
        hg = np.full(X.shape, 0.5, dtype=np.float32)
        if ribs:                                          # knurling: grooves across the strip, the ridges rubbed lighter
            k = (X / w * ribs) % 1.0
            ridge = sm(0.1, 0.4, k) * sm(0.9, 0.6, k)
            c = c * (0.55 + 0.7 * ridge)[..., None]
            c = mixc(c, col((0.36, 0.35, 0.34)), 0.35 * ridge * sm(0.5, 0.8, vnoise(X, Y, 0.01, seed + 4)))
            hg = 0.3 + 0.5 * ridge
        return c, hg
    return fn


def paint_dial(X, Y, w, h):
    """The selector seen from the front: a brushed aluminium skirt with a white index, the bakelite knob inside it with a finger
    dimple and a cream line to point with."""
    cx, cy = w / 2, h / 2
    rr, th = np.hypot(X - cx, Y - cy), np.arctan2(Y - cy, X - cx)
    R = L.DIAL['r']
    alu = col((0.60, 0.60, 0.58))[None, None, :] * (0.75 + 0.3 * vnoise(th, rr, (0.05, 0.02), 13) + 0.2 * np.cos(th * 2 - 0.9))[..., None]
    c = alu
    c = mixc(c, col((0.95, 0.93, 0.86)), sm(0.0011, 0.0005, np.abs(X - cx)) * (Y > cy) * (rr > R))         # the skirt's index
    knob = surface(X, Y, BAKELITE, 14, ang=0.5, amt=0.5)
    rings = 0.75 + 0.5 * vnoise(rr, th, (0.0009, 3.0), 15)                                # turned on a lathe: fine rings
    knob = knob * (rings * (0.9 + 0.5 * sm(-R, R, Y - cy)))[..., None]
    knob = mixc(knob, col((0.30, 0.29, 0.28)), 0.8 * sm(R - 0.0035, R - 0.0015, rr))       # the chamfer catches the light
    dim = np.hypot(X - cx, Y - (cy - R * 0.45))                                           # a dimple for the finger
    knob = knob * (1 - 0.55 * sm(0.008, 0.004, dim) * sm(-0.004, 0.006, Y - (cy - R * 0.45)))[..., None]
    knob = mixc(knob, col((0.24, 0.23, 0.22)), 0.8 * sm(0.0085, 0.0075, dim) * sm(0.006, 0.0072, dim) * (Y < cy - R * 0.45))
    line = sm(0.0014, 0.0008, np.abs(X - cx)) * sm(R * 0.3, R * 0.36, Y - cy) * sm(R - 0.002, R - 0.004, Y - cy)
    knob = mixc(knob, col(CREAM), 0.95 * line)
    cap = sm(0.0062, 0.0056, rr)
    knob = mixc(knob, col((0.55, 0.54, 0.50))[None, None, :] * (0.75 + 0.5 * sm(-0.006, 0.006, Y - cy))[..., None], cap)
    c = mixc(c, knob, sm(R + 0.0004, R - 0.0004, rr))
    hg = 0.45 + 0.1 * sm(R + 0.0004, R - 0.0004, rr) - 0.25 * sm(0.008, 0.004, dim) + 0.2 * cap + 0.2 * line
    return c, hg


def paint_lens(base, lit, tint=True):
    """A round or square lens: dark with a small reflection when off; when lit, its own colour going white at the middle."""
    def fn(X, Y, w, h):
        cx, cy = w / 2, h / 2
        r = np.hypot((X - cx) / (w / 2), (Y - cy) / (h / 2))
        b = col(base)[None, None, :]
        if lit:
            c = mixc(b * 1.05, np.minimum(b * 0.45 + 0.62, 1.0), sm(0.95, 0.1, r))
            c = c * (1 - 0.25 * sm(0.75, 1.05, r))[..., None]
            c = c * (0.96 + 0.08 * vnoise(X, Y, 0.002, 44))[..., None]
        else:
            dark = b * 0.34 + col((0.035, 0.035, 0.04))
            c = dark * (0.75 + 0.5 * sm(-1, 1, (Y - cy) / (h / 2)))[..., None]
            c = c * (1 - 0.45 * sm(0.7, 1.05, r))[..., None]
            gl = np.hypot((X - cx) / (w / 2) + 0.3, (Y - cy) / (h / 2) - 0.36)
            c = mixc(c, np.minimum(b * 0.5 + 0.5, 1.0), 0.5 * sm(0.3, 0.08, gl))
            c = c * (0.92 + 0.14 * vnoise(X, Y, 0.003, 45))[..., None]
        return c, 0.5 + 0.35 * sm(1.0, 0.5, r)
    return fn


def paint_speaker(X, Y, w, h):
    c = surface(X, Y, (0.20, 0.215, 0.215), 51, ang=0.0) * shade_up(Y, h, 0.85, 1.1)[..., None]
    c = edges(X, Y, w, h, c, wear=0.8, seed=52, dark=0.3)
    hg = np.full(X.shape, 0.6, dtype=np.float32)
    n = 6
    for k in range(n):
        cy = h * 0.5 + (k - (n - 1) / 2) * 0.0066
        d = sd_box(X, Y, w / 2, cy, w / 2 - 0.009, 0.0019, 0.0019)
        cloth = col((0.055, 0.05, 0.045))[None, None, :] * (0.7 + 0.6 * vnoise(X, Y, (0.0012, 0.0012), 53))[..., None]
        c = mixc(c, cloth, sm(0.0004, -0.0003, d))
        c = mixc(c, col((0.50, 0.53, 0.52)), 0.55 * sm(0.0011, 0.0004, d) * sm(-0.0002, 0.0004, d) * (Y < cy))     # the slot's lower lip, lit
        c = c * (1 - 0.5 * sm(-0.0012, 0.0, d) * sm(0.0004, -0.0002, d) * (Y > cy))[..., None]
        hg = hg - 0.5 * sm(0.0005, -0.0004, d)
    for sx in (0.0045, w - 0.0045):
        for sy in (0.0045, h - 0.0045):
            c, hg = screw(X, Y, c, hg, sx, sy, 0.0024, int(sx * 1000 + sy * 3000))
    return c, hg


def paint_mic_front(X, Y, w, h):
    c = surface(X, Y, (0.10, 0.10, 0.105), 61, ang=1.3, amt=0.6) * shade_up(Y, h, 0.8, 1.2)[..., None]
    d = -sd_box(X, Y, w / 2, h / 2, w / 2, h / 2, 0.012)
    c = c * (1 - 0.5 * sm(0.004, 0.0, d))[..., None]
    c = mixc(c, col((0.36, 0.36, 0.36)), 0.6 * sm(0.003, 0.0045, d) * sm(0.0065, 0.005, d) * sm(0.6, 0.8, vnoise(X, Y, 0.008, 62)))
    hg = 0.4 + 0.2 * sm(0.0, 0.004, d)
    gx, gy, gr = w / 2, h * 0.60, 0.0185
    dd = sd_circle(X, Y, gx, gy, gr)
    ring = col((0.55, 0.55, 0.53))[None, None, :] * (0.7 + 0.6 * sm(-gr, gr, Y - gy))[..., None]
    c = mixc(c, ring, sm(0.0022, 0.0014, dd) * sm(-0.0004, 0.0004, dd))
    q = 0.0033                                                                              # the perforated grille
    hx, hy = (X - gx) / q, (Y - gy) / q
    hx = hx + 0.5 * (np.floor(hy) % 2)
    hole = np.hypot((hx % 1.0) - 0.5, (hy % 1.0) - 0.5)
    grille = mixc(np.broadcast_to(col((0.24, 0.245, 0.25)), c.shape) * (0.8 + 0.5 * sm(-gr, gr, Y - gy))[..., None], col((0.02, 0.02, 0.02)), sm(0.36, 0.26, hole))
    inside = sm(0.0003, -0.0003, dd)
    c = mixc(c, grille, inside)
    hg = hg + 0.3 * sm(0.0022, 0.0014, dd) * sm(-0.0004, 0.0004, dd) + inside * (0.1 - 0.3 * sm(0.36, 0.26, hole))
    for k in range(4):                                                                      # ribs under the grille
        cy = h * 0.2 + (k - 1.5) * 0.0042
        dr = sd_box(X, Y, w / 2, cy, w * 0.3, 0.001, 0.001)
        c = mixc(c, col((0.03, 0.03, 0.03)), 0.9 * sm(0.0004, -0.0003, dr))
        c = mixc(c, col((0.30, 0.30, 0.30)), 0.5 * sm(0.001, 0.0004, dr) * sm(-0.0001, 0.0004, dr) * (Y < cy))
        hg = hg - 0.35 * sm(0.0004, -0.0003, dr)
    return c, hg


def paint_mic_back(X, Y, w, h):
    c = surface(X, Y, (0.09, 0.09, 0.095), 63, ang=1.3, amt=0.6) * shade_up(Y, h, 0.8, 1.15)[..., None]
    d = -sd_box(X, Y, w / 2, h / 2, w / 2, h / 2, 0.012)
    c = c * (1 - 0.5 * sm(0.004, 0.0, d))[..., None]
    hg = 0.4 + 0.2 * sm(0.0, 0.004, d)
    dd = sd_circle(X, Y, w / 2, h * 0.62, 0.007)
    c = mixc(c, col((0.50, 0.50, 0.48))[None, None, :] * (0.7 + 0.6 * sm(-0.007, 0.007, Y - h * 0.62))[..., None], sm(0.0004, -0.0003, dd))
    hg = hg + 0.3 * sm(0.0004, -0.0003, dd)
    pl = sd_box(X, Y, w / 2, h * 0.27, w * 0.3, 0.007, 0.001)
    c = mixc(c, col((0.42, 0.40, 0.33))[None, None, :] * (0.85 + 0.3 * vnoise(X, Y, (0.01, 0.001), 64))[..., None], sm(0.0003, -0.0003, pl))
    for sx in (w * 0.2, w * 0.8):
        c, hg = screw(X, Y, c, hg, sx, h * 0.5, 0.002, int(sx * 5000))
    return c, hg


def paint_metal(base, seed):
    def fn(X, Y, w, h):
        c = surface(X, Y, base, seed, ang=0.0, amt=1.4) * shade_up(Y, h, 0.85, 1.12)[..., None]
        c = edges(X, Y, w, h, c, wear=0.6, seed=seed, dark=0.25, light=(0.78, 0.78, 0.76))
        return c, np.full(X.shape, 0.5, dtype=np.float32)
    return fn


def paint_flat(base, seed=0):
    def fn(X, Y, w, h):
        c = col(base)[None, None, :] * (0.9 + 0.2 * vnoise(X, Y, 0.004, 80 + seed))[..., None]
        return c, np.full(X.shape, 0.5, dtype=np.float32)
    return fn


def paint_cord(X, Y, w, h):
    c = col((0.065, 0.065, 0.07))[None, None, :] * (0.7 + 0.9 * sm(0.0, 1.0, np.sin(Y / h * 2 * math.pi) * 0.5 + 0.5) ** 2 + 0.2 * vnoise(X, Y, 0.004, 85))[..., None]
    return c, np.full(X.shape, 0.5, dtype=np.float32)


def paint_ptt(X, Y, w, h):
    c = surface(X, Y, (0.42, 0.11, 0.08), 66, ang=0.0, amt=0.6) * shade_up(Y, h, 0.8, 1.15)[..., None]
    k = (X / w * 7) % 1.0
    ridge = sm(0.1, 0.4, k) * sm(0.9, 0.6, k)
    c = c * (0.7 + 0.45 * ridge)[..., None]
    return edges(X, Y, w, h, c, wear=0.4, seed=67, dark=0.4, light=(0.75, 0.45, 0.38)), 0.35 + 0.4 * ridge


# ----------------------------------------------------------------------------------------------------------------

def main():
    args = C.script_args()
    out = args.get('out', 'assets/props')
    C.reset_scene()
    A = Atlas()
    mat = bpy.data.materials.new('radio')            # the images come after the packing
    mat.use_nodes = True
    made = {}
    root = bpy.data.objects.new('radio', None)
    bpy.context.scene.collection.objects.link(root)

    def put(part, world, parent=None):
        ob = part.build(mat, world, parent or root)
        made[part.name] = ob
        return ob

    # ---- the case
    W2, D2 = L.W / 2, L.DEPTH / 2
    body = Part('body')
    R_panel = A.rect('panel', L.W, L.PH, 2000, paint_panel)
    R_top = A.rect('top', L.W, D2 - L.TOP_Y, 640, paint_case(21, 1.12, slots=True))
    R_side = A.rect('side', L.DEPTH, L.TOP_Z, 640, paint_case(22, 0.9))
    R_back = A.rect('back', L.W, L.TOP_Z, 420, paint_case(23, 0.72, back=True))
    R_trim = A.rect('trim', 0.20, 0.012, 1300, paint_case(24, 1.0))
    p_a, p_b = Vector(L.panel(-W2, 0)), Vector(L.panel(W2, 0))
    p_c, p_d = Vector(L.panel(W2, L.PH)), Vector(L.panel(-W2, L.PH))
    body.face([p_a, p_b, p_c, p_d], R_panel, [(0, 0), (L.W, 0), (L.W, L.PH), (0, L.PH)])
    body.face([(-W2, -D2, 0), (W2, -D2, 0), p_b, p_a], R_trim, [(0, 0), (0.2, 0), (0.2, 0.012), (0, 0.012)])
    body.face([p_d, p_c, (W2, D2, L.TOP_Z), (-W2, D2, L.TOP_Z)], R_top, [(0, 0), (L.W, 0), (L.W, D2 - L.TOP_Y), (0, D2 - L.TOP_Y)])
    body.face([(W2, D2, 0), (-W2, D2, 0), (-W2, D2, L.TOP_Z), (W2, D2, L.TOP_Z)], R_back, [(0, 0), (L.W, 0), (L.W, L.TOP_Z), (0, L.TOP_Z)])
    prof = [(-D2, 0), (-D2, L.LIP), (L.TOP_Y, L.TOP_Z), (D2, L.TOP_Z), (D2, 0)]            # the side, (y, z)
    body.face([(W2, y, z) for y, z in reversed(prof)], R_side, [(D2 - y, z) for y, z in reversed(prof)])
    body.face([(-W2, y, z) for y, z in prof], R_side, [(y + D2, z) for y, z in prof])
    body.face([(-W2, D2, 0), (W2, D2, 0), (W2, -D2, 0), (-W2, -D2, 0)], R_trim, [(0, 0), (0.2, 0), (0.2, 0.012), (0, 0.012)])
    # the frame round the panel: four bars standing a little proud of it
    body.M = panel_matrix(0, 0)
    BAR = 0.0095
    R_barh = A.rect('barh', L.W, BAR, 1000, paint_case(25, 1.1))
    R_barv = A.rect('barv', BAR, L.PH - 2 * BAR, 1000, paint_case(28, 1.0))
    R_barside = A.rect('barside', 0.24, 0.007, 1000, paint_case(26, 0.8))
    for cx, cz, hw, hh, R_ in ((0, BAR / 2, W2, BAR / 2, R_barh), (0, L.PH - BAR / 2, W2, BAR / 2, R_barh),
                               (-W2 + BAR / 2, L.PH / 2, BAR / 2, L.PH / 2 - BAR, R_barv), (W2 - BAR / 2, L.PH / 2, BAR / 2, L.PH / 2 - BAR, R_barv)):
        body.prism(box(hw, hh, cx, cz), 0.0, 0.007, R_, R_barside, bevel=0.0015)
    # the faces behind the two windows, a little above the panel's paint
    sc, vu = L.SCALE, L.VU
    R_scale = A.rect('scale', sc['size'][0], sc['size'][1], 3700, paint_scale)
    R_vu = A.rect('vu', vu['size'][0], vu['size'][1], 3700, paint_vu)
    for d_, R_ in ((sc, R_scale), (vu, R_vu)):
        (cu, cv), (sw, sh) = d_['c'], d_['size']
        body.face([(cu - sw / 2, -0.0004, cv - sh / 2), (cu + sw / 2, -0.0004, cv - sh / 2), (cu + sw / 2, -0.0004, cv + sh / 2), (cu - sw / 2, -0.0004, cv + sh / 2)], R_, [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    put(body, Matrix.Identity(4))

    # ---- the selector and the scale's pointer
    dl = L.DIAL
    dial = Part('dial')
    DS = dl['skirt'] * 2
    R_dial = A.rect('dial', DS, DS, 1750, paint_dial)
    R_knurl = A.rect('knurl', 0.226, dl['h'], 1100, paint_plastic(BAKELITE, 16, ribs=40))
    R_skirt = A.rect('skirt', 0.12, 0.005, 1100, paint_metal((0.55, 0.55, 0.53), 17))
    fit = (-dl['skirt'], -dl['skirt'])
    dial.prism(circle(dl['skirt'], 20), 0.0, 0.005, R_dial, R_skirt, bevel=0.001, smooth=True, fit=fit)
    dial.prism(circle(dl['r'], 20), 0.005, dl['h'], R_dial, R_knurl, bevel=0.003, smooth=True, fit=fit)
    put(dial, panel_matrix(dl['c'][0], dl['c'][1]))
    needle = Part('needle')
    R_red = A.rect('red', 0.004, 0.03, 1500, paint_flat((0.86, 0.20, 0.10)))
    needle.prism(box(0.0011, sc['size'][1] / 2 - 0.002), 0.0012, 0.0022, R_red, R_red)
    put(needle, panel_matrix(sc['c'][0], sc['c'][1]))

    # ---- the display: one quad with the whole of its own texture
    dp = L.DISPLAY
    lcd = bpy.data.images.new('display', 64, 20, alpha=False)
    lcd.file_format = 'JPEG'
    lcd.colorspace_settings.name = 'Non-Color'
    lcd.pixels.foreach_set(np.tile(np.array(LCD + (1.0,), dtype=np.float32), 64 * 20))
    lcd.pack()
    dmat = C.textured_material('display', lcd)
    display = Part('display')
    hw, hh = dp['size'][0] / 2, dp['size'][1] / 2
    display.face([(-hw, -0.0006, -hh), (hw, -0.0006, -hh), (hw, -0.0006, hh), (-hw, -0.0006, hh)], None, [(0, 0), (1, 0), (1, 1), (0, 1)])
    ob = display.build(dmat, panel_matrix(dp['c'][0], dp['c'][1]), root)
    made['display'] = ob

    # ---- lights: each lens, and the same lens lit as a child that the game shows
    def lens(name, outline, h, base, world, fit_size, bevel, lit_base=None, dens=2600, key=None):
        k = key or name
        R_off = A.rect(k + ':off', fit_size[0], fit_size[1], dens, paint_lens(base, False))
        R_on = A.rect(k + ':on', fit_size[0], fit_size[1], dens, paint_lens(lit_base or base, True))
        R_edge = A.rect(k + ':edge', 0.03, 0.004, 1200, paint_flat(tuple(0.3 * x + 0.03 for x in base)))
        fit = (-fit_size[0] / 2, -fit_size[1] / 2)
        p = Part(name)
        p.prism(outline, 0.0, h, R_off, R_edge, bevel=bevel, smooth=True, fit=fit)
        ob = put(p, world)
        q = Part(name + '_on')
        q.prism(outline, 0.0003, h + 0.0003, R_on, R_on, bevel=bevel, smooth=True, fit=fit, sides=False)
        on = q.build(mat, world, ob)
        made[q.name] = on
        return ob

    ld = L.LEDS
    lens('led_tx', circle(ld['r'], 10), ld['h'], RED, panel_matrix(*ld['tx']), (ld['r'] * 2, ld['r'] * 2), 0.0025)
    lens('led_rx', circle(ld['r'], 10), ld['h'], GREEN, panel_matrix(*ld['rx']), (ld['r'] * 2, ld['r'] * 2), 0.0025)
    sq = L.SEQ
    for i in range(sq['count']):
        lens('seq_%d' % i, rrect(sq['size'][0] / 2, sq['size'][1] / 2, 0.002, 1), sq['h'], (0.55, 0.57, 0.6), panel_matrix(*L.seq_uv(i)), sq['size'], 0.0009,
             lit_base=(0.86, 0.86, 0.86), key='seq')
    cb = L.COLORS
    for i in range(cb['count']):
        lens('color_%d' % i, circle(cb['r'], 12), cb['h'], hexrgb(L.COLOR_HEX[i]), panel_matrix(*L.color_uv(i)), (cb['r'] * 2, cb['r'] * 2), 0.003)

    # ---- the meter's needle
    vn = Part('vu_needle')
    R_ink = A.rect('ink', 0.004, 0.03, 1500, paint_flat((0.07, 0.06, 0.06)))
    vn.prism([(-0.0007, 0.0), (0.0007, 0.0), (0.00025, vu['length']), (-0.00025, vu['length'])], 0.001, 0.0017, R_ink, R_ink)
    put(vn, panel_matrix(*vu['pivot']))

    # ---- the 12 keys
    ky = L.KEYS
    R_keyside = A.rect('keyside', 0.08, ky['h'], 1500, paint_plastic((0.55, 0.52, 0.45), 18))
    for i in range(12):
        p = Part('key_%d' % i)
        R_k = A.rect('key%d' % i, ky['size'][0], ky['size'][1], 3800, paint_key(i))
        p.prism(rrect(ky['size'][0] / 2, ky['size'][1] / 2, 0.003, 1), 0.0, ky['h'], R_k, R_keyside, bevel=0.0018, fit=(-ky['size'][0] / 2, -ky['size'][1] / 2))
        put(p, panel_matrix(*L.key_uv(i)))

    # ---- the speaker's grille
    sp = L.SPEAKER
    spk = Part('speaker')
    R_spk = A.rect('speaker', sp['size'][0], sp['size'][1], 2000, paint_speaker)
    R_spkside = A.rect('spkside', 0.2, sp['h'], 1200, paint_case(27, 0.8))
    spk.prism(rrect(sp['size'][0] / 2, sp['size'][1] / 2, 0.004, 2), 0.0, sp['h'], R_spk, R_spkside, bevel=0.001, fit=(-sp['size'][0] / 2, -sp['size'][1] / 2))
    put(spk, panel_matrix(*sp['c']))

    # ---- the hook, and the microphone hanging on it
    hk = L.HOOK
    hook = Part('mic_hook')
    R_steel = A.rect('steel', 0.066, 0.046, 1500, paint_metal(STEEL, 28))
    R_steeledge = A.rect('steeledge', 0.1, 0.004, 1200, paint_metal((0.4, 0.4, 0.4), 29))
    mr = L.MIC['rest']
    hook.prism(box((hk['u'][1] - hk['u'][0]) / 2, (hk['v'][1] - hk['v'][0]) / 2, (hk['u'][0] + hk['u'][1]) / 2 - mr[0], (hk['v'][0] + hk['v'][1]) / 2 - mr[1]),
               hk['n'][0], hk['n'][1], R_steel, R_steeledge, back=True)
    for sx in (-0.011, 0.011):                             # the two prongs of the clip
        hook.prism(box(0.003, 0.012, sx, 0.010), hk['n'][1], hk['n'][1] + 0.0045, R_steel, R_steeledge, bevel=0.001)
    put(hook, panel_matrix(mr[0], mr[1], 0.0))

    mw, mh, md = L.MIC['size']
    mic = Part('mic')
    R_mf = A.rect('mic_front', mw, mh, 2300, paint_mic_front)
    R_mb = A.rect('mic_back', mw, mh, 1500, paint_mic_back)
    R_ms = A.rect('mic_side', 0.21, md, 1300, paint_plastic((0.085, 0.085, 0.09), 65, ang=0.0))
    o = [(x * (1.0 - 0.16 * max(0.0, -z / (mh / 2))), z) for x, z in rrect(mw / 2, mh / 2, 0.012, 3)]       # narrower toward the cord
    mic.prism(o, -md / 2, md / 2, R_mf, R_ms, bevel=0.004, smooth=True, fit=(-mw / 2, -mh / 2))
    mic.face([(x, md / 2, z) for x, z in reversed(o)], R_mb, [(mw / 2 - x, z + mh / 2) for x, z in reversed(o)])
    mic.prism(circle(0.006, 8), md / 2 * -1 - 0.0045, -md / 2, R_steel, R_steeledge, back=True)             # the button it hangs by, on its back
    Mrel = Matrix.Rotation(math.radians(90), 4, 'X')        # the cord's sleeve: a short tube out of its lower end (the prism's -y turned to -z)
    mic.M = Mrel
    mic.prism(circle(0.0045, 8), mh / 2 - 0.002, mh / 2 + 0.009, R_ms, R_ms, smooth=True)
    mic.M = Matrix.Identity(4)
    mic_ob = put(mic, panel_matrix(*mr))
    pt = L.MIC_PTT
    ptt = Part('mic_ptt')
    R_ptt = A.rect('ptt', pt['size'][0], pt['size'][1], 2300, paint_ptt)
    ptt.prism(rrect(pt['size'][0] / 2, pt['size'][1] / 2, 0.003, 2), -0.001, pt['h'], R_ptt, R_ptt, bevel=0.0012)
    # the bar's own frame: its outward side (-y) is the microphone's -x, its long side (x) runs up the microphone
    Mp = Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1)))
    Mp = Matrix.Translation((pt['c'][0], -pt['c'][2], pt['c'][1])) @ Mp
    ptt_ob = ptt.build(mat, mic_ob.matrix_world @ Mp, mic_ob)
    made['mic_ptt'] = ptt_ob
    end = bpy.data.objects.new('mic_cord_end', None)
    bpy.context.scene.collection.objects.link(end)
    end.matrix_world = mic_ob.matrix_world @ Matrix.Translation((L.MIC_CORD_END[0], -L.MIC_CORD_END[2], L.MIC_CORD_END[1]))
    end.parent = mic_ob
    end.matrix_parent_inverse = mic_ob.matrix_world.inverted()

    # ---- the coiled cord: a helix along its own z (y in the exported file), from the socket to the microphone on the hook
    a = Vector(L.panel(L.JACK[0], L.JACK[1], 0.004))
    b = Vector(end.matrix_world.translation)
    axis = b - a
    length = axis.length
    zc = axis.normalized()
    xc = zc.cross(Vector((0, 0, 1))).normalized()
    yc = zc.cross(xc)
    Mc = Matrix.Identity(4)
    Mc.col[0][:3], Mc.col[1][:3], Mc.col[2][:3], Mc.col[3][:3] = xc, yc, zc, a
    cord = Part('mic_cord')
    cd = L.CORD
    R_cord = A.rect('cord', 0.25, 0.012, 1000, paint_cord)
    SEG, SIDES = 8, 4
    rings = []
    n = cd['turns'] * SEG
    for k in range(n + 1):
        t = k / n
        ease = min(1.0, t * 12, (1 - t) * 12)               # the coil closes to the axis at both ends
        ang = 2 * math.pi * cd['turns'] * t
        cen = Vector((math.cos(ang) * cd['r'] * ease, math.sin(ang) * cd['r'] * ease, t * length))
        rad = Vector((math.cos(ang), math.sin(ang), 0))
        ring = []
        for s in range(SIDES):
            q = 2 * math.pi * s / SIDES
            ring.append(cen + rad * (math.cos(q) * cd['wire']) + Vector((0, 0, 1)) * (math.sin(q) * cd['wire']))
        rings.append(ring)
    for k in range(n):
        for s in range(SIDES):
            s2 = (s + 1) % SIDES
            u0, u1 = k / n * 0.25, (k + 1) / n * 0.25
            v0, v1 = s / SIDES * 0.012, (s + 1) / SIDES * 0.012
            cord.face([rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]], R_cord, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], True)
    put(cord, Mc)
    log('cord length', round(length, 4))

    # ---- pack, paint, and give the material its images
    A.pack()
    assign_uvs()
    rgb, hgt = A.paint()
    img = image('radio', rgb)
    nimg = image('radio_n', normal_map(hgt, 5.0, NSIZE))
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.9
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    ntex = nt.nodes.new('ShaderNodeTexImage')
    ntex.image = nimg
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(ntex.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if os.environ.get('RADIO_DUMP'):
        for im_, nme in ((img, 'radio.png'), (nimg, 'radio_n.png')):
            im_.filepath_raw = os.path.join(os.environ['RADIO_DUMP'], nme)
            im_.file_format = 'PNG'
            im_.save()
            im_.file_format = 'JPEG'

    path = os.path.join(out, 'radio.glb')
    C.export_glb(path, dict(export_image_format='JPEG', export_jpeg_quality=int(os.environ.get('RADIO_JPEG', '76')), export_texcoords=True, export_animations=False,
                            export_materials='EXPORT', export_vertex_color='NONE', export_skins=False))
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'}
    log('WROTE', path, os.path.getsize(path), 'tris', sum(tris.values()))
    log('TRIS', tris)
    for name in sorted(made):
        ob = made[name]
        log('PIVOT', name, tuple(round(x, 4) for x in ob.matrix_world.translation))


if __name__ == '__main__':
    main()
