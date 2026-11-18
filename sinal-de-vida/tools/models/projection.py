"""Pictures as samplers, for painting Jonas (paint.py): an image read with bilinear filtering and moved to the concept art's colours
(`Img`), a part picture on white paper whose figure is found by the whiteness of the pixels (`Panel`), the fit of such a picture to
a piece of the model by silhouette (`Sil`), piecewise-linear maps through landmarks (`pw`), and the share of each vertex that
follows an arm (`Rig`). The pictures (FLUX.1 Kontext edits of the concept art, tools/textures/prompts.md) live outside the
repository, in the concept folder. Everything is deterministic."""
import math
import os

import bpy
from mathutils import Vector

from common import smooth

V = Vector
ARM_BONES = ('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb')


class Img:
    """An image as a bilinear sampler (rows counted from the top)."""

    def __init__(self, path):
        im = bpy.data.images.load(path)
        im.colorspace_settings.name = 'Non-Color'          # the numbers of the file, as the game reads them
        self.w, self.h = im.size
        self.px = list(im.pixels)
        bpy.data.images.remove(im)

    def stats(self, box=None, keep=None, step=3):
        """Mean and standard deviation per channel over a box (c0, r0, c1, r1; rows from the top) of the pixels `keep(colour)` accepts."""
        c0, r0, c1, r1 = box or (0, 0, self.w, self.h)
        s, s2, n = [0.0] * 3, [0.0] * 3, 0
        for y in range(r0, r1, step):
            for x in range(c0, c1, step):
                i = ((self.h - 1 - y) * self.w + x) * 4
                c = self.px[i:i + 3]
                if keep and not keep(c):
                    continue
                for k in range(3):
                    s[k] += c[k]
                    s2[k] += c[k] * c[k]
                n += 1
        n = max(1, n)
        mean = tuple(v / n for v in s)
        sd = tuple(math.sqrt(max(1e-8, s2[k] / n - mean[k] ** 2)) for k in range(3))
        return mean, sd

    def match(self, src, dst, lo=0.7, hi=1.5, keep=None):
        """Colour transfer: the pixels are moved so that the statistics `src` (mean, sd) of this image become `dst` (those of the
        concept art). One linear map per channel; with `keep`, only the pixels it accepts change (the white paper stays white)."""
        import numpy as np
        a = np.array(self.px, dtype=np.float32).reshape(-1, 4)
        out = a.copy()
        for k in range(3):
            g = min(hi, max(lo, dst[1][k] / max(1e-4, src[1][k])))
            out[:, k] = (a[:, k] - src[0][k]) * g + dst[0][k]
        if keep is not None:
            m = keep(a)
            out[~m] = a[~m]
        self.px = np.clip(out, 0.0, 1.0).reshape(-1).tolist()
        return self

    def at(self, x, y):
        x = max(0.0, min(self.w - 1.001, x))
        y = max(0.0, min(self.h - 1.001, y))
        x0, y0 = int(x), int(y)
        fx, fy = x - x0, y - y0
        px, w, h = self.px, self.w, self.h
        i00 = ((h - 1 - y0) * w + x0) * 4
        i10 = i00 + 4
        i01 = ((h - 2 - y0) * w + x0) * 4
        i11 = i01 + 4
        out = []
        for k in range(3):
            a = px[i00 + k] * (1 - fx) + px[i10 + k] * fx
            b = px[i01 + k] * (1 - fx) + px[i11 + k] * fx
            out.append(a * (1 - fy) + b * fy)
        return tuple(out)


def pw(pts):
    """A piecewise-linear map through the points [(a, b), ...] (a rising), carried on straight beyond both ends."""
    pts = sorted(pts)

    def f(a):
        for i in range(len(pts) - 1):
            if a <= pts[i + 1][0] or i == len(pts) - 2:
                (a0, b0), (a1, b1) = pts[i], pts[i + 1]
                return b0 + (b1 - b0) * (a - a0) / (a1 - a0)
    return f


class Rig:
    """Per vertex, how much of it follows each arm (the sum of the weights of the arm's bones) and how much of that is the hand."""

    def __init__(self, arm):
        self.arm = arm

    def weights(self, ob):
        names = {g.index: g.name for g in ob.vertex_groups}
        out = []
        for v in ob.data.vertices:
            wl = wr = wh = 0.0
            for g in v.groups:
                n = names.get(g.group, '')
                if n.startswith(ARM_BONES):
                    if n.endswith('_l'):
                        wl += g.weight
                    elif n.endswith('_r'):
                        wr += g.weight
                    if not n.startswith(('upperarm', 'lowerarm')):
                        wh += g.weight
            out.append((min(1.0, wl), min(1.0, wr), min(1.0, wh)))
        return out


# ---------------------------------------------------------------------------------------------------------------------
# Parts: one generated image per piece of clothing (alone, on white, nothing in front of it), applied to the piece's own mesh
class Panel:
    """A part image on white (FLUX Kontext edits of the concept art, tools/textures/prompts.md). Its figure is found by the
    whiteness of the pixels; `fit` maps a rectangle of the model (a: x or y, z) to a rectangle of the figure."""

    def __init__(self, path):
        self.img = Img(path)
        w, h = self.img.w, self.img.h
        self.mask = [[self._fg(self.img.at(x, y)) for x in range(0, w, 4)] for y in range(0, h, 4)]
        ys = [j * 4 for j, row in enumerate(self.mask) if any(v > 0.5 for v in row)]
        xs = [i * 4 for i in range(len(self.mask[0])) if any(row[i] > 0.5 for row in self.mask)]
        self.box = (min(xs), max(xs), min(ys), max(ys))      # c0, c1, r0, r1 of the figure
        self.rext = []
        for row in self.mask:
            xs_ = [i * 4 for i, m in enumerate(row) if m > 0.9]
            self.rext.append((min(xs_), max(xs_)) if xs_ else None)
        self.flip = False
        self.gain = None
        self._ext = {}

    def mean(self):
        c0, c1, r0, r1 = self.box
        s = [0.0, 0.0, 0.0]
        n = 0
        for y in range(r0, r1, 6):
            for x in range(c0, c1, 6):
                c = self.img.at(x, y)
                if self._fg(c) > 0.99:
                    s = [s[k] + c[k] for k in range(3)]
                    n += 1
        return tuple(v / max(1, n) for v in s)

    @staticmethod
    def _fg(c):
        return smooth(0.16, 0.34, max(1.0 - c[0], 1.0 - c[1], 1.0 - c[2]))

    def cols_at(self, f0, f1):
        """Left and right edge of the figure over the rows between the fractions f0..f1 of its height."""
        c0, c1, r0, r1 = self.box
        ra, rb = int(r0 + (r1 - r0) * f0) // 4, int(r0 + (r1 - r0) * f1) // 4
        xs = [i * 4 for j in range(ra, rb + 1) for i, v in enumerate(self.mask[j]) if v > 0.5]
        return min(xs), max(xs)

    def fit(self, a0, a1, z0, z1, flip=False, cols=None, rows=None):
        """The model's a in [a0, a1] and z in [z0, z1] go to the figure's columns (c0..c1) and rows (r1..r0)."""
        c0, c1, r0, r1 = self.box
        if cols:
            c0, c1 = cols
        if rows:
            r0, r1 = rows
        self.a0, self.a1, self.z0, self.z1 = a0, a1, z0, z1
        self.c0, self.c1, self.r0, self.r1 = c0, c1, r0, r1
        self.flip = flip
        return self

    def uv(self, a, z):
        t = (a - self.a0) / (self.a1 - self.a0)
        if self.flip:
            t = 1.0 - t
        return self.c0 + t * (self.c1 - self.c0), self.r1 - (z - self.z0) / (self.z1 - self.z0) * (self.r1 - self.r0)

    def colour(self, a, z):
        """(colour, weight): the weight is 0 on the white background."""
        u, v = self.uv(a, z)
        c = self.img.at(u, v)
        k = self._fg(c)
        if k >= 0.9 and self.gain:
            c = tuple(min(1.0, c[i] * self.gain[i]) for i in range(3))
        if k < 0.9:
            # outside the figure (the model's sleeve or shoulder is a little wider than the picture's): take the colour at the figure's
            # edge on the same row (clamp to the edge), so the piece is not left flat
            ext = self.rext[min(len(self.rext) - 1, max(0, int(v) // 4))]
            if ext:
                u2 = min(max(u, ext[0] + 5), ext[1] - 5)
                if u2 != u:
                    return self.img.at(u2, v), 1.0
        return c, k

    def row_ext(self, v, lo=None, hi=None):
        """First and last figure column of the row v, between the columns lo and hi (a picture with two things side by side)."""
        j = min(len(self.mask) - 1, max(0, int(v) // 4))
        key = (j, lo, hi)
        c = self._ext.get(key)
        if c is None:
            row = self.mask[j]
            a = 0 if lo is None else max(0, int(lo) // 4)
            b = len(row) if hi is None else min(len(row), int(hi) // 4 + 1)
            xs = [i * 4 for i in range(a, b) if row[i] > 0.9]
            c = self._ext[key] = (min(xs), max(xs)) if xs else False
        return c

    def px(self, u, v, lo=None, hi=None, inset=6):
        """(colour, weight) at the pixel (u, v). Outside the figure on that row, the colour a little inside the figure's edge (so a
        mesh a little wider than the drawing is not left blank, and the drawing's outline is not smeared along the mesh's side)."""
        ext = self.row_ext(v, lo, hi)
        if not ext:
            return self.img.at(u, v), 0.0
        u2 = min(max(u, ext[0] + inset), ext[1] - inset)
        c = self.img.at(u2, v)
        k = self._fg(c)                 # paper inside the figure (between two fingers, inside a collar): no paint there
        if self.gain:
            c = tuple(min(1.0, c[i] * self.gain[i]) for i in range(3))
        return c, k

    def overlay(self, pts, path):
        """Debug: the model's points drawn on the part image (to check the fit)."""
        img = bpy.data.images.new('ov', self.img.w, self.img.h, alpha=False)
        px = list(self.img.px)
        w, h = self.img.w, self.img.h
        for a, z in pts:
            u, v = self.uv(a, z)
            x, y = int(u), int(v)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if 0 <= x + dx < w and 0 <= y + dy < h:
                        i = ((h - 1 - (y + dy)) * w + x + dx) * 4
                        px[i:i + 3] = [1.0, 0.0, 1.0]
        img.pixels.foreach_set(px)
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        bpy.data.images.remove(img)


class Sil:
    """A part picture fitted to a piece by its silhouette: at every height the piece's own width (from its vertices) is stretched
    onto the figure's width on the matching row, so nothing of the paper is ever picked up and the figure's outline lands on the
    piece's own edge. `split` = (z, column): below that height the piece and the figure are two halves side by side (the legs of the
    trousers), each fitted on its own. `flip`: the picture is seen from the other side (the back view)."""

    def __init__(self, panel, pts, zmap=None, split=None, flip=False, inset=8, bins=40):
        self.p, self.flip, self.inset, self.split, self.bins = panel, flip, inset, split, bins
        c0, c1, r0, r1 = panel.box
        zs = [z for a, z in pts]
        self.z0, self.z1 = min(zs), max(zs)
        self.zmap = zmap or pw([(self.z0, r1), (self.z1, r0)])
        ext = {s: [None] * bins for s in (-1, 0, 1)}
        for a, z in pts:
            k = min(bins - 1, int((z - self.z0) / (self.z1 - self.z0 + 1e-9) * bins))
            for s in (0, 1 if a > 0 else -1):
                e = ext[s][k]
                ext[s][k] = (a, a) if e is None else (min(e[0], a), max(e[1], a))
        self.ext = {}
        for s, row in ext.items():
            known = [k for k in range(bins) if row[k] is not None and row[k][1] - row[k][0] > 1e-4]
            if not known:
                continue
            full = [row[min(known, key=lambda q: abs(q - k))] for k in range(bins)]
            # each bin takes the widest of itself and its neighbours (a bin holds few vertices), then a light smoothing
            wide = [(min(full[max(0, k - 1)][0], full[k][0], full[min(bins - 1, k + 1)][0]), max(full[max(0, k - 1)][1], full[k][1], full[min(bins - 1, k + 1)][1])) for k in range(bins)]
            self.ext[s] = [tuple((wide[max(0, k - 1)][i] + 2 * wide[k][i] + wide[min(bins - 1, k + 1)][i]) / 4 for i in (0, 1)) for k in range(bins)]

    def colour(self, a, z):
        v = self.zmap(z)
        two = self.split is not None and z < self.split[0]
        s = (1 if a > 0 else -1) if two else 0
        row = self.ext.get(s) or self.ext[0]
        f = (z - self.z0) / (self.z1 - self.z0 + 1e-9) * self.bins - 0.5
        k = max(0, min(self.bins - 2, int(f)))
        u = max(0.0, min(1.0, f - k))
        a0 = row[k][0] + (row[k + 1][0] - row[k][0]) * u
        a1 = row[k][1] + (row[k + 1][1] - row[k][1]) * u
        t = max(0.0, min(1.0, (a - a0) / max(1e-5, a1 - a0)))
        if self.flip:
            t, s = 1.0 - t, -s
        lo = hi = None
        if two:
            lo, hi = (0, self.split[1]) if s < 0 else (self.split[1], self.p.img.w - 1)
        e = self.p.row_ext(v, lo, hi)
        if not e:
            return self.p.img.at(0, 0), 0.0
        c = self.p.img.at(e[0] + self.inset + t * (e[1] - e[0] - 2 * self.inset), v)
        if self.p.gain:
            c = tuple(min(1.0, c[i] * self.p.gain[i]) for i in range(3))
        return c, 1.0


def crotch(panel):
    """(row, column) where the two legs of a pair of trousers part in its picture: the first row with paper between two runs of
    paint, and the middle of that gap a little lower."""
    c0, c1, r0, r1 = panel.box
    for j in range(r0 // 4 + 4, r1 // 4):
        row = panel.mask[j]
        fg = [i for i, m in enumerate(row) if m > 0.9]
        if not fg:
            continue
        gap = [i for i in range(fg[0], fg[-1]) if row[i] < 0.3]
        if len(gap) >= 2:
            row2 = panel.mask[min(len(panel.mask) - 1, j + 6)]
            g2 = [i for i in range(fg[0], fg[-1]) if row2[i] < 0.3] or gap
            return j * 4, int(sum(g2) / len(g2) * 4)
    return (r0 + r1) // 2, (c0 + c1) // 2


def blend(items, fallback):
    """items: [(weight, (colour, coverage))]: a weighted mean of the colours where the part image has paint, the fallback elsewhere."""
    r = g = b = tw = cov = tot = 0.0
    for w, (c, k) in items:
        if w <= 1e-5:
            continue
        tot += w
        wk = w * k
        r += c[0] * wk
        g += c[1] * wk
        b += c[2] * wk
        tw += wk
    if tot < 1e-5 or tw < 1e-5:
        return fallback
    cover = tw / tot
    c = (r / tw, g / tw, b / tw)
    return tuple(c[i] * cover + fallback[i] * (1 - cover) for i in range(3))
