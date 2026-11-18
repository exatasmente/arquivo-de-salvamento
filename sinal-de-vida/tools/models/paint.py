"""Painting the textures of Jonas: every texel of an atlas is given its 3D point on the model (in the rest pose, arms out), and the
colour comes from a picture made for that piece, looked up through landmarks read off the picture (where the eyes, the mouth, the
shoulder, the cuff are), not through a bounding box:
  the head and the neck   a front and a side close-up of the face (rosto-frente-0.png, rosto-lado-0.png), blended by the normal
  the forearms and hands  the back of the hands and the palms (partes/maos-*.png)
  the jacket              its front and back (partes/jaqueta-*.png): the trunk by its edges and the open front, each sleeve along its axis
  the tee, the trousers, the boots, the pouches   their own part pictures
Every picture made by the image model is first moved to the colours of the concept art (one linear map per channel), so the skin of
the hands is the skin of the face and the jacket is the concept's olive. The light is painted: a soft light from above and the
shadows one piece casts on another (under the chin, under the collar, the jacket on the tee, the belt on the trousers) are multiplied
into the texture. What no picture reaches (the scalp, the belt's strap, the tools, the inside of the mouth, the locks of hair) is
painted by script. Plain Python per texel; the whole of it takes a few minutes.

Atlases (each piece has its own, its UV islands packed to fill it): skin (the face, the neck, the hands), jacket, tee, pants, boots,
props (the belt, pouches, tools and collar), hair (strips, one per kind of lock), cells (flat patches for the lamp and the mouth, and
the strip of teeth). Everything is JPEG on the way out (no alpha anywhere): the hair is solid locks, not cards."""
import math
import os

import bpy
from mathutils import Vector

from common import smooth
import projection as PJ
import jonas_face as JF

V = Vector

# the props atlas: 4 x 4 cells; a prop mesh points all its UVs at the centre of its cell
CELLS = ['metal', 'strap', 'lamp', 'cavity', 'teeth', 'lens', 'case', 'gum', 'tongue', 'lash', 'lashlow', 'glint']      # the fourth row holds the strip of teeth
PATCH = {n: ((i % 4 + 0.5) / 4, (i // 4 + 0.5) / 4) for i, n in enumerate(CELLS)}
TAG = None            # the tag of the polygon being baked (set by bake)
AW = (0.0, 0.0, 0.0)  # how much of the texel follows the left and the right arm, and how much is the hand (set by bake)


def hsh(x, y, z):
    return (math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453) % 1.0


def vnoise(x, y, z):
    xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
    xf, yf, zf = x - xi, y - yi, z - zi
    xf, yf, zf = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf), zf * zf * (3 - 2 * zf)
    c = [[[hsh(xi + a, yi + b, zi + d) for d in (0, 1)] for b in (0, 1)] for a in (0, 1)]
    l = lambda a, b, t: a + (b - a) * t
    return l(l(l(c[0][0][0], c[0][0][1], zf), l(c[0][1][0], c[0][1][1], zf), yf), l(l(c[1][0][0], c[1][0][1], zf), l(c[1][1][0], c[1][1][1], zf), yf), xf)


def fbm(p, f=6.0, o=3):
    s, a, tot = 0.0, 0.5, 0.0
    for i in range(o):
        s += a * vnoise(p.x * f, p.y * f, p.z * f)
        tot += a
        a *= 0.5
        f *= 2.1
    return s / tot


def mix(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def mul(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


def line(d, w):
    """Coverage (0..1) of a stroke of width w at distance d from its axis, with a soft anti-aliased edge."""
    return 1.0 - smooth(w * 0.5, w * 1.0, d)


def stroke(c, d, w, col, a=1.0):
    return mix(c, col, line(d, w) * a)


# ---------------------------------------------------------------------------------------------------------------
class Img:
    def __init__(self, size, bg=(0.2, 0.2, 0.2)):
        self.n = size
        self.px = [0.0] * (size * size * 4)
        self.mask = bytearray(size * size)
        for i in range(size * size):
            self.px[i * 4:i * 4 + 4] = [bg[0], bg[1], bg[2], 1.0]

    def put(self, x, y, c, a=1.0):
        i = y * self.n + x
        self.px[i * 4:i * 4 + 3] = c
        self.px[i * 4 + 3] = a
        self.mask[i] = 1

    def dilate(self, passes=3):
        n = self.n
        for _ in range(passes):
            add = []
            for y in range(n):
                for x in range(n):
                    i = y * n + x
                    if self.mask[i]:
                        continue
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < n and 0 <= yy < n and self.mask[yy * n + xx]:
                            j = (yy * n + xx) * 4
                            add.append((i, self.px[j:j + 3]))
                            break
            for i, c in add:
                self.px[i * 4:i * 4 + 3] = c
                self.mask[i] = 1

    def to_image(self, name, fmt='JPEG'):
        img = bpy.data.images.new(name, self.n, self.n, alpha=False)
        img.file_format = fmt
        img.colorspace_settings.name = 'Non-Color'   # the game reads the numbers as they are
        img.pixels.foreach_set(self.px)
        img.pack()
        return img


def bake(ob, img, fn, tags=None, aw=None):
    """Rasterise the object's triangles into the atlas by its first UV layer, calling fn(position, normal) per texel.
    `tags` maps a polygon index to a tag (read in fn as paint.TAG)."""
    global TAG, AW
    me = ob.data
    me.calc_loop_triangles()
    uv = me.uv_layers[0].data
    n = img.n
    for tri in me.loop_triangles:
        TAG = tags.get(tri.polygon_index) if tags else None
        ls = tri.loops
        a, b, c = (uv[l].uv for l in ls)
        pa, pb, pc = (V(me.vertices[i].co) for i in tri.vertices)
        na, nb, nc = (V(me.vertices[i].normal) for i in tri.vertices)
        wa, wb_, wc = (aw[i] if aw else (0.0, 0.0, 0.0) for i in tri.vertices)
        d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
        if abs(d) < 1e-14:
            continue
        x0, x1 = int(min(a.x, b.x, c.x) * n), int(max(a.x, b.x, c.x) * n) + 1
        y0, y1 = int(min(a.y, b.y, c.y) * n), int(max(a.y, b.y, c.y) * n) + 1
        for y in range(max(0, y0), min(n, y1)):
            py = (y + 0.5) / n
            for x in range(max(0, x0), min(n, x1)):
                px = (x + 0.5) / n
                l1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / d
                l2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / d
                l3 = 1 - l1 - l2
                if l1 < -0.02 or l2 < -0.02 or l3 < -0.02:
                    continue
                p = pa * l1 + pb * l2 + pc * l3
                nn = (na * l1 + nb * l2 + nc * l3).normalized()
                if aw:
                    AW = tuple(wa[k] * l1 + wb_[k] * l2 + wc[k] * l3 for k in range(3))
                img.put(x, y, fn(p, nn))
    TAG = None
    AW = (0.0, 0.0, 0.0)


# the head lamp's atlas: its face (the rim, the screws and the dark glass) in a disc at the top left, the same glass lit in a disc at
# the top right, and its side in a band along the bottom. (u, v, radius) of the discs; the band's v range; the glass's share of the face.
LAMP_FACE, LAMP_GLOW, LAMP_SIDE, LAMP_GLASS = (0.25, 0.74, 0.225), (0.78, 0.74, 0.225), (0.05, 0.40), 0.64


def normal_from_height(h, n, strength):
    """A tangent-space normal map (OpenGL convention, as glTF wants it) from a height map (a list of n * n heights, 0..1)."""
    import numpy as np
    a = np.array(h, dtype=np.float32).reshape(n, n)
    for ax in (0, 1):                                   # a little blur, so that a step is a bevel
        a = (np.roll(a, 1, axis=ax) + 2 * a + np.roll(a, -1, axis=ax)) / 4
    dx = (np.roll(a, -1, axis=1) - np.roll(a, 1, axis=1)) * strength * n / 256
    dy = (np.roll(a, -1, axis=0) - np.roll(a, 1, axis=0)) * strength * n / 256
    ln = np.sqrt(dx * dx + dy * dy + 1.0)
    rgb = np.stack([-dx / ln * 0.5 + 0.5, -dy / ln * 0.5 + 0.5, 1.0 / ln * 0.5 + 0.5, np.ones_like(ln)], axis=2)
    im = bpy.data.images.new('jonas_lamp_n', n, n, alpha=False)
    im.file_format = 'JPEG'
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(rgb.reshape(-1).tolist())
    im.pack()
    return im


def lamp_images(size):
    """The head lamp, painted: (the colour atlas, its normal map). The shape is a plain drum; the knurled rim, the four screws, the
    facets of the reflector behind the glass and the wear of the metal and the rubber are paint here, and a height map painted
    beside it (turned into the normal map) gives them their relief. The glass is painted off, dark and dull; lit, it is the second
    disc (the game shows it unlit by the scene: it is the light)."""
    img = Img(size, (0.08, 0.082, 0.09))
    height = [0.5] * (size * size)
    G = LAMP_GLASS
    FLAT, KNURL = 0.80, 0.925
    SECT, RINGS = 14, (0.2, 0.47, 0.75, 1.0)

    def facet(rg, th):
        """The reflector's facet at (radius as a share of the glass, angle): (its own shade 0..1, its height as a little pyramid)."""
        j = next(k for k, r1 in enumerate(RINGS) if rg <= r1)
        if j == 0:
            return 0.5, 1.0 - rg / RINGS[0] * 0.4
        r0, r1 = RINGS[j - 1], RINGS[j]
        t = th / (2 * math.pi) * SECT + 0.5 * (j % 2)
        a, b = (t - math.floor(t)) * 2 - 1, (rg - r0) / (r1 - r0) * 2 - 1
        return hsh(math.floor(t) % SECT, j, 3.0), 1.0 - max(abs(a), abs(b))

    def face(rho, th, x, y):
        grime = 0.86 + 0.28 * vnoise(x * 0.09, y * 0.09, 2.0)
        up = 0.86 + 0.2 * math.sin(th)                                   # the painted light, from above
        if rho < G:
            rg = rho / G
            shade, pyr = facet(rg, th)
            c = mul((0.085, 0.095, 0.105), 0.7 + 0.55 * shade + 0.25 * pyr)
            if rg < RINGS[0]:                                             # the bulb, off: a dull chip in its cup
                c = mix((0.33, 0.30, 0.22), (0.10, 0.10, 0.10), smooth(0.55, 1.0, rg / RINGS[0]))
            arc = math.exp(-((rg - 0.72) / 0.13) ** 2) * max(0.0, math.cos(th - 2.2)) ** 3     # a dull, cold reflection on the glass
            c = mix(c, (0.26, 0.29, 0.31), 0.38 * arc)
            c = mul(c, 1.0 - 0.55 * smooth(0.82, 1.0, rg))               # the rim's shadow on the sunk glass
            return mul(c, grime), 0.22 + 0.10 * pyr
        if rho < FLAT:                                                    # the flat ring that holds the glass, with its four screws
            brushed = 0.9 + 0.2 * vnoise(th * 30.0, rho * 5.0, 5.0)
            c = mul((0.27, 0.27, 0.28), brushed * up)
            c = mix(c, (0.52, 0.51, 0.49), 0.6 * smooth(G + 0.035, G, rho) * (0.5 + 0.5 * vnoise(th * 7.0, 1.0, 8.0)))      # the lip, worn bright
            h = 0.78
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2
                dx, dy = rho * math.cos(th) - 0.72 * math.cos(a), rho * math.sin(th) - 0.72 * math.sin(a)
                d = math.hypot(dx, dy) / 0.052
                if d < 1.25:
                    sa = 0.6 + 2.0 * hsh(k, 1.0, 4.0)
                    slot = abs(dx * math.sin(sa) - dy * math.cos(sa)) / 0.052
                    head = mul((0.50, 0.48, 0.43), (0.8 + 0.3 * (dy / 0.052) * 0.5) * (0.92 + 0.16 * hsh(k, 2.0, 1.0)))
                    head = mix(head, (0.10, 0.09, 0.08), smooth(0.28, 0.12, slot) * 0.9)
                    c = mix(mix(head, (0.09, 0.09, 0.09), smooth(0.8, 1.0, d)), c, smooth(1.0, 1.25, d))
                    h = h + (0.14 * (1.0 - d * d * 0.5) - 0.2 * smooth(0.28, 0.12, slot)) * smooth(1.0, 0.85, d) - 0.1 * smooth(0.85, 1.0, d) * smooth(1.25, 1.0, d)
            return mul(c, grime), h
        if rho < KNURL:                                                   # the knurled rim: teeth all round
            t = th / (2 * math.pi) * 30
            k = t - math.floor(t)
            tooth = smooth(0.08, 0.26, k) * smooth(0.92, 0.74, k)
            c = mix((0.10, 0.10, 0.105), mul((0.40, 0.40, 0.41), up), tooth)
            c = mix(c, (0.62, 0.61, 0.58), 0.5 * tooth * smooth(0.55, 0.85, vnoise(th * 9.0, 3.0, 6.0)))            # teeth rubbed bright
            return mul(c, grime), 0.55 + 0.45 * tooth
        edge = smooth(KNURL, 1.0, rho)                                    # the housing's rounded edge: rubber, scuffed pale
        c = mix((0.07, 0.072, 0.08), (0.24, 0.24, 0.245), 0.7 * smooth(0.45, 0.8, vnoise(th * 11.0, rho * 9.0, 7.0)) * (1.0 - edge * 0.5))
        return mul(c, up * grime), 0.6 - 0.55 * edge

    def lit(rho, th):
        rg = min(1.0, rho / G)
        shade, pyr = facet(rg, th)
        c = mix((1.0, 0.985, 0.88), (1.0, 0.86, 0.47), smooth(0.1, 0.55, rg))
        c = mix(c, (0.93, 0.63, 0.20), smooth(0.55, 1.0, rg))
        return mul(c, 0.84 + 0.14 * shade + 0.12 * pyr) if rg > RINGS[0] else c

    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            if v < 0.5:                                                   # the side: rubber with three grip ribs, scuffed, lit from above
                w = (v - LAMP_SIDE[0]) / (LAMP_SIDE[1] - LAMP_SIDE[0])    # 0 at the band, 1 at the face
                th = 2 * math.pi * u
                rib = max(math.exp(-((w - c0) / 0.055) ** 2) for c0 in (0.3, 0.52, 0.74))
                front = smooth(0.86, 0.95, w)                             # the metal rim's own edge shows at the front
                c = mix((0.068, 0.07, 0.078), (0.21, 0.21, 0.215), 0.55 * rib * smooth(0.35, 0.75, vnoise(u * 60.0, w * 3.0, 3.0)) + 0.1 * rib)
                k = (u * 30) % 1.0
                tooth = smooth(0.08, 0.26, k) * smooth(0.92, 0.74, k)
                c = mix(c, mix((0.10, 0.10, 0.105), (0.40, 0.40, 0.41), tooth), front)
                c = mul(c, (0.8 + 0.32 * max(0.0, math.sin(th))) * (0.9 + 0.2 * vnoise(x * 0.07, y * 0.07, 4.0)))
                img.put(x, y, c)
                height[y * size + x] = 0.45 + 0.4 * rib + front * (0.1 + 0.3 * tooth)
                continue
            for (cu, cv, cr), is_lit in ((LAMP_FACE, False), (LAMP_GLOW, True)):
                du, dv = (u - cu) / cr, (v - cv) / cr
                rho = math.hypot(du, dv)
                if rho < (G * 1.2 if is_lit else 1.1):
                    th = math.atan2(dv, du)
                    if is_lit:
                        img.put(x, y, lit(rho, th))
                    else:
                        c, h = face(min(rho, 1.0), th, x * 256 / size, y * 256 / size)
                        img.put(x, y, c)
                        height[y * size + x] = h
    return img, normal_from_height(height, size, 9.0)


def eye_image(size, phi_iris, phi_max, pupil):
    """The globe's picture, painted by hand like the rest of him: the pupil in the middle, the angle from it going outward (see
    jonas_face.eye_uv). A brown iris with its fibres, lighter round the pupil and where the light comes through at the bottom, a
    soft dark rim instead of an inked ring, and a cream white that goes warm and dark toward the corners (the globe turns away
    there, and the lids shade it). No highlight here: that is a piece of its own, which stays put while the globe turns."""
    img = Img(size, (0.5, 0.36, 0.3))
    for y in range(size):
        for x in range(size):
            du, dv = (x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5
            r = min(0.5, math.hypot(du, dv))
            th = math.atan2(dv, du)
            rho = phi_max * (2 * r) ** (1 / 0.6) / phi_iris            # the angle from the pupil, in iris radii
            ax, ay = math.cos(th), math.sin(th)
            # the white: cream, mottled a little, warmer and darker away from the iris; a touch of red toward the corners
            k = smooth(1.15, 3.7, rho)
            c = mix((0.84, 0.775, 0.69), (0.52, 0.36, 0.30), 0.8 * k)
            c = mul(c, 0.95 + 0.1 * vnoise(ax * 2.2 * rho, ay * 2.2 * rho, 4.0))
            vein = smooth(0.62, 0.8, vnoise(th * 5.0, rho * 1.3, 9.0)) * smooth(1.5, 2.6, rho) * abs(ax) ** 2
            c = mix(c, (0.62, 0.36, 0.30), 0.35 * vein)
            if rho < 1.12:
                # the iris: fibres running out from the pupil, in two sizes, on a brown that is lighter near the pupil
                fib = 0.6 * vnoise(th * 9.0, rho * 1.6, 1.0) + 0.4 * vnoise(th * 23.0, rho * 3.0, 2.0)
                blot = vnoise(ax * 3.0 * rho, ay * 3.0 * rho, 6.0)
                ic = mix((0.215, 0.115, 0.055), (0.47, 0.275, 0.115), smooth(0.95, 0.42, rho) * (0.55 + 0.45 * fib))
                ic = mul(ic, 0.78 + 0.3 * fib + 0.14 * blot)
                # the light that comes through the iris, low, across from where the highlight sits
                low = max(0.0, -ay * 0.94 - ax * 0.2) ** 1.6 * smooth(0.42, 0.66, rho) * smooth(1.0, 0.8, rho)
                ic = mix(ic, (0.66, 0.43, 0.19), 0.55 * low * (0.6 + 0.4 * fib))
                # the upper lid's shadow lies on the top of it
                ic = mul(ic, 1.0 - 0.3 * max(0.0, ay) ** 1.5 * smooth(0.3, 0.9, rho))
                # the rim: the iris goes dark toward its edge and melts into the white
                ic = mix(ic, (0.105, 0.06, 0.04), 0.82 * smooth(0.74, 0.99, rho))
                ic = mix(ic, (0.03, 0.02, 0.02), smooth(pupil + 0.045, pupil - 0.03, rho) * 0.97)      # the pupil
                c = mix(ic, c, smooth(0.94, 1.12, rho))
            img.put(x, y, c)
    return img


# ---------------------------------------------------------------------------------------------------------------
class Concept:
    """The concept art as a sampler (bilinear, rows counted from the top)."""

    def __init__(self, path):
        im = bpy.data.images.load(path)
        im.colorspace_settings.name = 'Non-Color'          # the numbers of the file, as the game reads them
        self.w, self.h = im.size
        self.px = list(im.pixels)
        bpy.data.images.remove(im)

    def at(self, x, y):
        x = max(0.0, min(self.w - 1.001, x))
        y = max(0.0, min(self.h - 1.001, y))
        x0, y0 = int(x), int(y)
        fx, fy = x - x0, y - y0

        def g(xx, yy):
            i = ((self.h - 1 - yy) * self.w + xx) * 4
            return self.px[i:i + 3]
        a, b, c, d = g(x0, y0), g(x0 + 1, y0), g(x0, y0 + 1), g(x0 + 1, y0 + 1)
        return tuple((a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy for k in range(3))

    def avg(self, x0, y0, x1, y1, step=4):
        s, n = [0, 0, 0], 0
        for y in range(y0, y1, step):
            for x in range(x0, x1, step):
                c = self.at(x, y)
                for k in range(3):
                    s[k] += c[k]
                n += 1
        return tuple(v / n for v in s)


MZ = 1.6235
HEAD_C = V((0, 0.01, 1.72))
INK = (0.045, 0.045, 0.045)
HAIR_DARK = (0.052, 0.040, 0.036)
HAIR_LIGHT = (0.165, 0.118, 0.092)
HAIR_GREY = (0.37, 0.355, 0.34)           # (it was 0.74: the grey locks behind the ears came out white)
HAIR_GREY_DARK = (0.16, 0.155, 0.15)
LOCK_STRIPS = 8           # strips of the hair atlas: 0..4 brown (darker to lighter), 5..7 brown going grey at the tip
LEATHER = (0.60, 0.42, 0.20)


def band_z(p):
    """Height of the headband's centre at a point of the head: high on the forehead, lower toward the ears and the back."""
    a = math.atan2(abs(p.x), -(p.y + 0.005))
    return 1.756 - 0.03 * smooth(0.0, 1.5, a)


_HAIRLINE = PJ.pw([(0.0, 1.787), (0.5, 1.787), (0.9, 1.768), (1.15, 1.735), (1.32, 1.695), (1.48, 1.700), (1.56, 1.733), (1.93, 1.731), (2.1, 1.700),
                   (2.4, 1.665), (math.pi, 1.642)])


def azimuth(p):
    """0 at the middle of the forehead, pi/2 over the ear, pi at the nape."""
    return math.atan2(abs(p.x), -p.y)


def hairline_z(p):
    """The height above which hair grows, round the head: the forehead, the recess at the temple, the sideburn in front of the ear,
    over and behind the ear, down to the nape."""
    return _HAIRLINE(azimuth(p))


def grey_zone(p):
    """How grey the hair is at a point: the temples and over the ears, under the headband."""
    a = azimuth(p)
    return smooth(0.85, 1.1, a) * (1.0 - smooth(2.0, 2.5, a)) * (1.0 - smooth(band_z(p) - 0.012, band_z(p) + 0.02, p.z))


def scalp(p, n):
    """The hair painted on the head itself, under the locks: dark, with strands that run from the crown, grey at the temples."""
    crown = V((0.0, 0.04, 1.84))
    d = p - crown
    phi = math.atan2(d.y, d.x)
    r = math.hypot(d.x, d.y) + 0.6 * max(0.0, crown.z - p.z)
    s = 0.5 + 0.5 * math.sin(phi * 46 + 3.0 * math.sin(r * 38 + phi * 3) + 2.0 * vnoise(p.x * 60, p.y * 60, p.z * 60))
    s2 = vnoise(p.x * 34, p.y * 34, p.z * 34)
    g = 0.6 * grey_zone(p)
    dark = mix(HAIR_DARK, HAIR_GREY_DARK, g)
    light = mix(HAIR_LIGHT, HAIR_GREY, g)
    c = mix(dark, light, smooth(0.55, 0.95, s) * (0.35 + 0.5 * s2) * (0.5 + 0.5 * g))
    return mul(c, 0.8 + 0.25 * max(0.0, n.z))


# the jacket's front picture: where a height and a place across the trunk fall in it (and back: jonas.py raises the pockets where
# the picture paints them)
J_ROW = lambda z: 778 - 976 * (z - 1.0)
J_PL = lambda row: 455 + (row - 320) * 5 / 460          # the open front's edge, left panel of the picture
J_PR = lambda row: 555 + (row - 350) * 10 / 435         # and right panel
J_GAIN = 0.74                                           # the jacket a little darker than its picture: the game's light adds to it


def jacket_xz(col, row, left, wt, xopen):
    """The (x, z) of the trunk that the pixel (col, row) of the jacket's front picture paints."""
    z = 1.0 + (778 - row) / 976
    xo = xopen(z)
    if left:
        return -wt + (col - 325) / (J_PL(row) - 325) * (wt - xo), z
    return xo + (col - J_PR(row)) / (700 - J_PR(row)) * (wt - xo), z


def relief(img, out, strength, radius=5, extra=None):
    """The fine relief of a painted atlas, as a tangent-space normal map (OpenGL convention, as glTF wants it): the height is read off
    the paint itself. An inked line (a seam, a row of stitches, the edge of a pocket, a fold, a wrinkle) is darker than what lies round
    it, so the paint minus its own blur is a height: lines are grooves, the paint between them stands a little proud."""
    import numpy as np
    n = img.n
    a = np.array(img.px, dtype=np.float32).reshape(n, n, 4)
    lum = a[:, :, 0] * 0.3 + a[:, :, 1] * 0.59 + a[:, :, 2] * 0.11

    def blur(x, r):
        for ax in (0, 1):
            acc = np.zeros_like(x)
            for d in range(-r, r + 1):
                acc += np.roll(x, d, axis=ax)
            x = acc / (2 * r + 1)
        return x
    h = blur(np.clip(lum - blur(lum, radius), -0.12, 0.06), 1)
    if extra:                               # a height painted on purpose (0.5 is level), added to the one read off the paint
        e = np.array(extra[0].px, dtype=np.float32).reshape(n, n, 4)[:, :, 0] - 0.5
        h = h + extra[1] * blur(e, 2)
    k = n // out
    h = h.reshape(out, k, out, k).mean(axis=(1, 3))
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength * out / 512
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength * out / 512
    ln = np.sqrt(dx * dx + dy * dy + 1.0)
    rgb = np.stack([-dx / ln * 0.5 + 0.5, -dy / ln * 0.5 + 0.5, 1.0 / ln * 0.5 + 0.5, np.ones_like(ln)], axis=2)
    im = bpy.data.images.new('jonas_n', out, out, alpha=False)
    im.file_format = 'JPEG'
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(rgb.reshape(-1).tolist())
    im.pack()
    return im


def paint_all(obs, arm, concept_dir, size, tags, info):
    """obs: body, jacket, tee, pants, boots, props. tags: polygon tags of the body and of the props. info: xopen(z) (half width of the
    jacket's open front), belt (zb, cy), pouches (the frames of the pouch boxes)."""
    body, jacket, tee, pants, boots, props_ob = (obs[k] for k in ('body', 'jacket', 'tee', 'pants', 'boots', 'props'))
    j = lambda *a: os.path.join(concept_dir, *a)
    rig = PJ.Rig(arm)
    aws = {o.name: rig.weights(o) for o in (body, jacket, tee, pants, boots)}
    np_ink = lambda a: (1.0 - a[:, :3].min(axis=1)) > 0.2          # the pixels that are not the white paper

    # ---- the concept art: the colours every generated picture is moved to ---------------------------------------------------
    concept = PJ.Img(j('jonas-frente.png'))
    whole = PJ.Img(j('frente-inteira-0.png'))
    skin_dst = concept.stats((468, 196, 552, 232), step=1)            # the cheeks and the nose
    jacket_dst = concept.stats((300, 340, 430, 600), step=2)          # the left front panel, with its pocket
    tee_dst = concept.stats((462, 360, 560, 640), step=2)
    pants_dst = whole.stats((415, 620, 610, 780), step=2)
    boots_dst = whole.stats((385, 830, 640, 985), step=2, keep=lambda c: c[0] > c[2] * 1.15)

    def G(c, gamma=1.0, gain=1.0):
        return tuple(min(1.0, (max(0.0, x) ** gamma) * gain) for x in c)

    def light(n, top=0.13, under=0.12):
        """The painted light: a little more on what looks up, less on what looks down."""
        return 1.0 + top * max(0.0, n.z) - under * max(0.0, -n.z)

    def brush(p, f=26.0, a=0.08):
        """A faint brush mottle, so that flat areas are not flat."""
        return 1.0 + a * (vnoise(p.x * f, p.y * f, p.z * f * 0.6) - 0.5) * 2.0

    # ---- the head: a front and a side close-up ----------------------------------------------------------------------------------
    face = PJ.Img(j('rosto-frente-0.png'))
    side = PJ.Img(j('rosto-lado-0.png'))
    face_src = face.stats((350, 480, 700, 580), step=2)
    face.match(face_src, skin_dst, 0.8, 1.35)
    side_src = side.stats((360, 470, 520, 580), step=2)
    side.match(side_src, (tuple(v * 0.97 for v in skin_dst[0]), skin_dst[1]), 0.8, 1.35)
    FZ = PJ.pw([(1.50, 1012), (1.578, 790), (MZ, 640), (1.652, 588), (1.705, 457), (1.722, 410), (1.78, 255), (1.825, 120)])
    SY = PJ.pw([(-0.125, 208), (-0.095, 252), (0.0125, 640), (0.115, 815)])
    SZ = PJ.pw([(1.50, 965), (1.578, 770), (MZ, 635), (1.652, 590), (1.705, 462), (1.722, 415), (1.825, 105)])
    neck_c = face.stats((440, 880, 600, 960), step=3)[0]
    if os.environ.get('JONAS_DEBUG'):
        print('JONAS TONES skin', skin_dst, 'face', face_src, 'jacket', jacket_dst, 'tee', tee_dst, 'pants', pants_dst, 'boots', boots_dst)

    def head_c(p, n):
        cf = face.at(523 + 2850 * p.x, FZ(p.z))
        cs = side.at(SY(p.y), SZ(p.z))
        wf = max(smooth(0.2, 0.62, -n.y), smooth(-0.09, -0.102, p.y) * smooth(0.036, 0.024, abs(p.x)))      # the nose is the front picture's all round
        c = mix(cs, cf, wf)
        # the flanks of the nose: seen from the front they are a sliver, and the nostril's ink would smear all along them
        nose_side = smooth(0.5, 0.85, abs(n.x)) * smooth(-0.088, -0.1, p.y) * smooth(0.04, 0.026, abs(p.x)) * smooth(1.70, 1.675, p.z)
        if nose_side > 0:
            c = mix(c, mul(skin_dst[0], 0.84), nose_side)
        # the picture's hot highlights (the nose, the brow) are taken down: the game's light adds its own
        lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
        hot = smooth(0.62, 0.86, lum)
        if hot > 0:
            c = mix(c, mul(skin_dst[0], 1.12), 0.6 * hot)
        # the lids: the picture's own eye (its white, its iris, its lash lines) must not land on them
        c = JF.lid_paint(p, c, lambda x, z: face.at(523 + 2850 * x, FZ(z)), skin_dst[0])
        # below the neck the pictures end: the neck's own colour
        c = mix(mul(neck_c, brush(p, 40, 0.06)), c, smooth(1.50, 1.535, p.z))
        # painted shadow: under the jaw and where the collars sit
        under = smooth(1.585, 1.555, p.z) * smooth(-0.11, -0.03, p.y) * 0.22 + 0.25 * smooth(1.54, 1.49, p.z)
        c = mul(c, 1.0 - min(0.4, under))
        # the sides of the neck: there the pictures show their outline and their paper, not skin
        c = mix(c, mul(neck_c, 0.9 * brush(p, 40, 0.06)), smooth(0.3, 0.7, abs(n.x)) * smooth(1.59, 1.565, p.z))
        # the side of the head. The side picture has his grey temple hair where the model has skin (the temple, the top of the
        # ear): painted on the skin it read as a pale band and a white ear. What the picture gives there that is grey (pale and
        # without colour) is taken back to skin; the grey stays in the hair, and in a sideburn painted below.
        az = azimuth(p)
        if az > 0.7 and p.z > 1.625:
            hi, lo = max(c), min(c)
            grey = smooth(0.34, 0.18, (hi - lo) / max(hi, 1e-3)) * smooth(0.30, 0.46, 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])
            c = mix(c, mul(skin_dst[0], 0.84 * brush(p, 40, 0.07) * brush(p, 12, 0.06)), grey * smooth(0.7, 0.95, az) * smooth(1.625, 1.65, p.z))
        # the ear is skin: the face's own tone, the hollow of it in a warm shadow, the rim catching the light
        ear = smooth(0.074, 0.085, abs(p.x)) * smooth(-0.022, -0.006, p.y) * smooth(0.058, 0.042, p.y) * smooth(1.622, 1.64, p.z) * smooth(1.728, 1.712, p.z)
        if ear > 0:
            rim = smooth(0.25, 0.85, abs(n.x))
            deep = mix(mul(skin_dst[0], 0.52), (0.40, 0.16, 0.12), 0.25)
            ec = mix(deep, mix(mul(skin_dst[0], 0.86), (1.0, 0.62, 0.46), 0.14), rim)
            ec = mul(ec, (1.0 - 0.18 * smooth(0.3, 0.8, n.y)) * brush(p, 50, 0.06))
            c = mix(c, ec, ear)
        # the sideburn: short hair in front of the ear, grey among the dark, its edges soft
        sb = smooth(0.058, 0.07, abs(p.x)) * smooth(-0.040, -0.030, p.y) * smooth(-0.004, -0.014, p.y) * smooth(1.648, 1.676, p.z) * (1.0 - ear)
        if sb > 0:
            strand = vnoise(p.y * 520.0, p.z * 70.0, 3.0)
            c = mix(c, mix(mul(HAIR_DARK, 1.5), HAIR_GREY, 0.3 + 0.6 * strand), 0.9 * sb * (0.6 + 0.4 * vnoise(p.y * 300.0, p.z * 300.0, 5.0)))
        # the nape and the back of the neck: no picture looks at them. The neck's colour brought toward the face's, so that no step
        # of colour shows where the pictures end
        nape = mix(neck_c, mul(skin_dst[0], 0.9), 0.55)
        c = mix(c, mul(nape, 0.9 * brush(p, 40, 0.06) * brush(p, 12, 0.05)), smooth(0.2, 0.8, n.y))
        # the red of the lips: darker and less saturated than the skin, fuller below; the stubble the picture paints over it stays
        ax_ = abs(p.x)
        if ax_ < 0.032 and abs(p.z - JF.MZ) < 0.014 and p.y < -0.07:
            arch = 1.0 - (ax_ / 0.032) ** 2
            up_h = 0.0050 * arch ** 0.7 * (1.0 - 0.28 * math.exp(-(p.x / 0.0055) ** 2))
            lo_h = 0.0086 * arch ** 0.6
            dz = p.z - (JF.MZ + 0.0010 * smooth(0.012, 0.026, ax_))
            w = smooth(up_h + 0.0013, up_h - 0.0010, dz) * smooth(-lo_h - 0.0016, -lo_h + 0.0012, dz) * smooth(-0.072, -0.084, p.y)
            if w > 0:
                lip = mix(mul(skin_dst[0], 0.70), (0.42, 0.24, 0.22), 0.55)
                if dz < 0:
                    lip = mul(lip, 1.0 + 0.16 * math.exp(-((dz + lo_h * 0.45) / 0.0028) ** 2))       # the lower lip's roundness
                lip = mul(lip, (1.0 - 0.35 * smooth(0.0016, 0.0, abs(dz))) * brush(p, 60, 0.07))     # darker into the line where they meet
                c = mix(c, lip, 0.66 * w)
        hz = hairline_z(p)
        hw = smooth(hz - 0.002, hz + 0.011, p.z)
        if hw > 0:
            c = mix(c, scalp(p, n), hw)
        return c

    def lip_inside(p, n):
        """The lips' edge as it turns into the mouth (jonas_mouth.lip_roll): their red, then the wet dark behind them."""
        red = mix(mul(skin_dst[0], 0.62), (0.40, 0.21, 0.20), 0.6)
        if TAG == 'lip1':
            return mul(red, 0.92 * brush(p, 60, 0.06))
        return mul(mix(red, (0.16, 0.06, 0.06), 0.72), brush(p, 60, 0.06))

    # ---- the forearms and the hands: the back of the hands and the palms, each hand its half of the picture -------------------
    hb = PJ.Panel(j('partes', 'maos-costas-0.png'))
    hp = PJ.Panel(j('partes', 'maos-palma-0.png'))
    hand_dst = ((skin_dst[0][0] * 0.90, skin_dst[0][1] * 0.86, skin_dst[0][2] * 0.84), skin_dst[1])      # the hands: the face's skin, a little more weathered
    for pn in (hb, hp):
        pn.img.match(pn.img.stats(keep=lambda c: min(c) < 0.8), hand_dst, 0.8, 1.25, keep=np_ink)
    # (the rows of the picture at the mesh's own forearm, wrist, knuckles and fingertips: the arms' skin is 8.5% longer than the
    # bones jonas.py started from, see jonas_radio.fit_arms, and the fingers reach x = 0.99)
    # (the picture's forearm runs up under the rolled sleeve: no bare patch between the hand's paint and the cloth)
    BROW = PJ.pw([(0.54, 108), (0.766, 400), (0.885, 590), (0.992, 920)])
    PROW = PJ.pw([(0.54, 150), (0.766, 320), (0.885, 610), (0.992, 865)])

    # the hands and the forearms are painted here, not taken from a picture: the face's own skin in broad soft gradients, the light
    # and the shadow painted in (the back of the hand and the knuckles lighter, the palm and the sides of the fingers darker), clean
    # nails, two soft veins, a thin matt dirt at the fingertips and the knuckles, a few fine hairs on the forearm.
    F_Y = (0.026, 0.051, 0.076, 0.101)                       # where each finger lies across the hand (index to little)
    F_MCP, F_TIP = (0.894, 0.893, 0.885, 0.873), (0.985, 0.996, 0.984, 0.961)
    THUMB_A, THUMB_B = V((0.803, 0.024, 1.331)), V((0.897, -0.017, 1.278))
    SKIN = mul(skin_dst[0], 0.84)                            # (the face's mean tone, as dark as the face reads with its ink and its shadows)
    SKIN_LIGHT = mix(SKIN, (1.0, 0.80, 0.62), 0.17)
    SKIN_DEEP = mix(mul(SKIN, 0.62), (0.38, 0.16, 0.12), 0.25)                               # the shadow: darker and a little redder
    NAIL = mix(mul(SKIN, 1.14), (0.80, 0.66, 0.60), 0.4)

    HAND_INK = mix(INK, mul(SKIN, 0.45), 0.55)               # the pen's line on the skin: a dark brown, as on the face

    def arm_skin(p, n):
        q = V((abs(p.x), p.y, p.z))
        back = smooth(-0.25, 0.45, n.z)                      # 1 on the back of the hand and the top of the arm, 0 on the palm
        c = mix(mix(SKIN, SKIN_DEEP, 0.5), mix(SKIN, SKIN_LIGHT, 0.45), back)
        # the brush: broad patches warmer and cooler, a grain, as the face has
        patch = vnoise(q.x * 34.0, q.y * 34.0, q.z * 34.0)
        c = mix(c, mix(c, (0.62, 0.26, 0.20), 0.3), smooth(0.5, 0.85, patch))
        c = mix(c, mul(c, 0.8), smooth(0.55, 0.2, patch) * 0.7)
        c = mul(c, brush(p, 14.0, 0.08) * brush(p, 70.0, 0.11) * brush(p, 180.0, 0.08))      # (the hands have about a texel a millimetre: nothing finer shows)
        ink = 0.0
        if q.x < 0.77:                                       # the forearm: rounder light, fine hairs, the tendons' shadow toward the wrist
            c = mix(c, SKIN_LIGHT, 0.14 * smooth(0.2, 0.9, n.z))
            hair = vnoise(q.x * 38.0, q.y * 420.0 + q.x * 90.0, q.z * 260.0)
            ink = max(ink, 0.55 * smooth(0.74, 0.9, hair) * smooth(0.0, 0.5, n.z) * smooth(0.55, 0.62, q.x))
            c = mix(c, SKIN_DEEP, 0.3 * smooth(0.7, 0.765, q.x) * (0.5 + 0.5 * math.sin(q.y * 330.0)) * back)
            for xw in (0.752, 0.762):                        # the wrist's creases, under it
                ink = max(ink, 0.5 * smooth(0.0022, 0.0007, abs(q.x - xw - 0.002 * math.sin(q.y * 90.0))) * (1.0 - back))
        else:
            # the back of the hand: the tendons to each finger (light on them, shadow between), two soft veins
            if q.x < 0.895:
                tend = 0.5 + 0.5 * math.cos((q.y - 0.026) / 0.025 * 2 * math.pi)
                tk = back * smooth(0.79, 0.83, q.x) * smooth(0.895, 0.87, q.x)
                c = mix(c, SKIN_LIGHT, 0.22 * tk * smooth(0.5, 1.0, tend))
                c = mix(c, SKIN_DEEP, 0.3 * tk * smooth(0.5, 0.0, tend))
            for y0, y1 in ((0.040, 0.047), (0.082, 0.071)):
                t = max(0.0, min(1.0, (q.x - 0.78) / 0.09))
                dv = abs(q.y - (y0 + (y1 - y0) * t) - 0.004 * math.sin(q.x * 70.0))
                c = mix(c, mix(SKIN, (0.36, 0.38, 0.46), 0.35), 0.24 * smooth(0.0042, 0.001, dv) * back * smooth(0.775, 0.8, q.x) * smooth(0.885, 0.86, q.x))
            # the fingers: each lighter along its back and at its knuckles, darker down its sides and between them; the folds of the
            # knuckles and the edge of each finger drawn with the pen
            k = min(range(4), key=lambda i: abs(q.y - F_Y[i]))
            side = abs(q.y - F_Y[k])
            mcp, tip = F_MCP[k], F_TIP[k]
            if q.x > mcp - 0.012:
                on_finger = smooth(mcp - 0.004, mcp + 0.012, q.x)
                c = mix(c, SKIN_DEEP, 0.85 * smooth(0.0045, 0.0105, side) * on_finger)
                ink = max(ink, 0.62 * smooth(0.0072, 0.0095, side) * smooth(0.013, 0.0105, side) * on_finger)
                for j in (0.0, 0.40, 0.72):
                    xj = mcp + (tip - mcp) * j
                    kn = math.exp(-((q.x - xj) / 0.0065) ** 2) * smooth(0.009, 0.003, side)
                    c = mix(c, SKIN_LIGHT, 0.55 * kn * back)                                    # the knuckle, lit
                    c = mix(c, (0.60, 0.25, 0.20), 0.16 * kn * back)                           # and a little red
                    if j:
                        for dx in (-0.0022, 0.0024):                                           # its folds: two lines across
                            fold = smooth(0.0013, 0.0004, abs(q.x - xj - dx - 0.0008 * math.sin(q.y * 500.0 + dx * 900.0)))
                            ink = max(ink, 0.62 * fold * back * smooth(0.0078, 0.0045, side))
                    else:
                        ink = max(ink, 0.45 * smooth(0.0016, 0.0005, abs((q.x - xj) + 0.004 - 0.35 * side)) * back * smooth(0.008, 0.003, side))    # the knuckle's arc
                    ink = max(ink, 0.55 * smooth(0.0015, 0.0005, abs(q.x - xj - 0.0015)) * (1.0 - back) * smooth(0.008, 0.004, side) * (1 if j else 0))     # the fold inside
                nail = smooth(tip - 0.018, tip - 0.0135, q.x) * smooth(tip - 0.0005, tip - 0.0045, q.x) * smooth(0.0075, 0.0048, side) * smooth(0.35, 0.7, n.z)
                if nail > 0:
                    nc = mix(NAIL, mul(NAIL, 1.12), smooth(0.004, 0.0, side))
                    nc = mix(nc, mul(SKIN_DEEP, 0.7), 0.6 * smooth(tip - 0.0058, tip - 0.003, q.x))                     # dirt under the edge
                    c = mix(c, nc, nail)
                    ink = max(ink, 0.75 * nail * (1.0 - nail) * 4.0)                                                  # the nail's border
                c = mix(c, mul(SKIN_DEEP, 0.75), 0.22 * smooth(tip - 0.03, tip, q.x) * (0.4 + 0.6 * vnoise(q.x * 260.0, q.y * 260.0, q.z * 260.0)))   # matt dirt at the tips
            # the thumb: lighter along its back, its folds, its nail
            ab = THUMB_B - THUMB_A
            tt = (q - THUMB_A).dot(ab) / ab.length_squared
            if 0.1 < tt < 1.25:
                dth = (q - (THUMB_A + ab * tt)).length
                if dth < 0.02:
                    up = n.dot(V((0.0, -0.75, 0.66)))
                    for j in (0.38, 0.72):
                        c = mix(c, SKIN_LIGHT, 0.34 * math.exp(-((tt - j) / 0.08) ** 2) * smooth(0.2, 0.7, up))
                        ink = max(ink, 0.5 * smooth(0.012, 0.004, abs(tt - j)) * (0.5 + 0.5 * math.sin(tt * 260.0)) * smooth(0.3, 0.8, up) * smooth(0.6, 0.9, vnoise(tt * 40.0, dth * 300.0, 1.0)))
                    nail = smooth(0.80, 0.86, tt) * smooth(1.12, 1.04, tt) * smooth(0.3, 0.75, up)
                    if nail > 0:
                        c = mix(c, mix(NAIL, mul(SKIN_DEEP, 0.7), 0.5 * smooth(1.0, 1.08, tt)), nail)
                        ink = max(ink, 0.7 * nail * (1.0 - nail) * 4.0)
            # the palm: the hollow darker, the pads lighter, its lines drawn
            if back < 0.5 and q.x < 0.895:
                hollow = math.exp(-(((q.x - 0.84) / 0.03) ** 2 + ((q.y - 0.06) / 0.025) ** 2))
                c = mix(c, SKIN_DEEP, 0.4 * hollow * (1.0 - back))
                c = mix(c, SKIN_LIGHT, 0.2 * math.exp(-(((q.x - 0.80) / 0.02) ** 2 + ((q.y - 0.035) / 0.02) ** 2)) * (1.0 - back))
                for a0, b0, c0 in ((0.868, -0.25, 0.0), (0.848, 0.3, 4.0), (0.80, 1.1, 0.0)):                        # the heart, the head and the life lines
                    d = abs(q.x - a0 - b0 * (q.y - 0.06) - c0 * (q.y - 0.06) ** 2)
                    ink = max(ink, 0.6 * smooth(0.0022, 0.0007, d) * (1.0 - back) * smooth(0.02, 0.03, q.y) * smooth(0.11, 0.1, q.y))
        c = mix(c, HAND_INK, min(0.8, ink))
        return mul(c, light(n, 0.12, 0.2))

    skin = Img(size, skin_dst[0])

    def skin_fn(p, n):
        if TAG in ('lip1', 'lip2'):
            return lip_inside(p, n)
        if max(AW[0], AW[1]) > 0.35:
            return arm_skin(p, n)
        return head_c(p, n)
    bake(body, skin, lambda p, n: mul(skin_fn(p, n), 0.94), tags.get('body'), aws[body.name])
    skin.dilate(4)

    # ---- the jacket -------------------------------------------------------------------------------------------------------------
    jf = PJ.Panel(j('partes', 'jaqueta-frente-0.png'))
    jb = PJ.Panel(j('partes', 'jaqueta-costas-0.png'))
    not_paper = lambda c: min(c) < 0.8
    for pn in (jf, jb):
        pn.img.match(pn.img.stats(keep=not_paper), jacket_dst, 0.75, 1.3, keep=np_ink)
    xopen = info['xopen']
    WT = info['trunk_w']                          # half width of the trunk
    SR = info['sleeve_r']                         # the sleeve's radius
    SLEEVE = {False: ((300.0, 335.0), (216.0, 726.0), -1.0), True: ((722.0, 335.0), (806.0, 726.0), 1.0)}

    def sleeve_c(p, n):
        left = p.x > 0
        (ax, ay), (bx, by), out = SLEEVE[left]
        t = max(-0.12, min(1.0, (abs(p.x) - 0.19) / 0.40))
        s = max(-0.86, min(0.86, (p.z - 1.456) / SR))
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy)
        hw = 50.0 + 12.0 * t
        # the top of the arm (arms out) is the outer edge of the hanging sleeve of the picture
        u = ax + dx * t + s * hw * out * (dy / ln)
        v = ay + dy * t + s * hw * out * (-dx / ln)
        return jf.px(u, v, 512 if left else 0, 1023 if left else 511, 10)

    # the rolled sleeve: three turns of the cloth painted on the last centimetres of the sleeve, the one at the very end showing the
    # paler lining; `cuff` gives the turn a place is on, how far across it, and its height (the turns stand proud, the folds between
    # them are grooves: the height goes to the normal map)
    CUFF_X, TURN = info.get('cuff_x'), 0.0155

    def cuff(p):
        if CUFF_X is None:
            return None
        du = CUFF_X - abs(p.x)
        if du > 3 * TURN + 0.006:
            return None
        k = min(2, int(max(0.0, du) / TURN))
        f = max(0.0, min(1.0, (du - k * TURN) / TURN))
        over = smooth(3 * TURN, 3 * TURN + 0.006, du)             # past the last turn: the sleeve itself, in the roll's shadow
        return k, f, (math.sin(math.pi * f) ** 0.55) * (1.0 - over), over

    def jacket_c(p, n):
        row = min(766.0, J_ROW(p.z))
        xo = xopen(p.z)
        pl, pr_ = J_PL(row), J_PR(row)
        if p.x < 0:
            col = min(325 + (pl - 325) * (p.x + WT) / (WT - xo), pl - 3)
            row = max(row, 258 + 0.5 * max(0.0, 410 - col))                  # not above the slope of the picture's shoulder
            cf = jf.px(col, row, 320 if row > 400 else 0, pl, 8)
        else:
            col = max(pr_ + (700 - pr_) * (p.x - xo) / (WT - xo), pr_ + 3)
            row = max(row, 258 + 0.5 * max(0.0, col - 600))
            cf = jf.px(col, row, pr_, 704 if row > 400 else 1023, 8)
        colb = 511.5 - 156.5 / WT * p.x
        rb = max(min(764.0, 775 - 860 * (p.z - 1.0)), 314 + 0.56 * max(0.0, 400 - colb, colb - 600))
        cb = jb.px(colb, rb, 357 if rb > 420 else 320, 666 if rb > 420 else 705, 10)
        wf = smooth(0.25, -0.25, n.y)
        trunk = PJ.blend([(wf + 1e-3, cf), (1.0 - wf + 1e-3, cb)], jacket_dst[0])
        w = smooth(0.3, 0.8, max(AW[0], AW[1]))
        c = mix(trunk, sleeve_c(p, n)[0], w) if w > 0 else trunk
        # over the shoulder and along the top and the underside of the sleeve the pictures are stretched into rings: plain cloth there
        tt = (abs(p.x) - 0.19) / 0.40
        plain = max(smooth(0.72, 0.9, abs(p.z - 1.456) / SR) * w, smooth(0.22, 0.02, tt) * smooth(0.1, 0.5, w), 0.8 * smooth(0.5, 0.9, n.z) * smooth(1.4, 1.47, p.z))
        if plain > 0:
            c = mix(c, mul(jacket_dst[0], 0.95 * brush(p, 22, 0.14) * brush(p, 70, 0.06)), plain)
        # painted shadow: under the arm, round the neck under the collar, along the open front's edge
        ao = 0.22 * smooth(0.16, 0.2, abs(p.x)) * smooth(1.44, 1.36, p.z) * smooth(1.2, 1.3, p.z) * (1 - w)
        ao += 0.2 * smooth(0.17, 0.11, math.hypot(p.x, p.y - 0.04)) * smooth(1.44, 1.5, p.z)
        cf_ = cuff(p) if abs(p.x) > 0.3 else None
        if cf_:
            k, f, hh, over = cf_
            cloth = mul(jacket_dst[0], 0.92) if k else mul(mix(jacket_dst[0], (0.60, 0.60, 0.48), 0.72), 1.18)      # the last turn is the lining
            th = math.atan2(p.z - 1.456, p.y)
            roll = mul(cloth, brush(p, 34, 0.12) * brush(p, 90, 0.06) * (0.34 + 0.84 * hh))                     # dark in the folds, light on each turn's back
            if abs(math.sin(th * 19 + k * 1.7 + 6.0 * f)) > 0.975:
                roll = mul(roll, 0.82)                                                                         # creases across the turns
            c = mix(roll, mul(c, 0.62), over)
        return mul(c, light(n, 0.10, 0.2) * (1.0 - ao))

    jacket_i = Img(size, jacket_dst[0])
    bake(jacket, jacket_i, lambda p, n: mul(jacket_c(p, n), J_GAIN), None, aws[jacket.name])
    jacket_i.dilate(4)
    jacket_h = Img(size, (0.5, 0.5, 0.5))                         # the height of the rolled sleeves' turns, for the normal map

    def cuff_h(p, n):
        cf_ = cuff(p) if abs(p.x) > 0.3 else None
        hh = 0.5 + (0.5 * cf_[2] - 0.12 * cf_[3] if cf_ else 0.0)
        return (hh, hh, hh)
    bake(jacket, jacket_h, cuff_h, None, aws[jacket.name])
    jacket_h.dilate(4)

    # ---- the tee, the trousers: a front and a back picture each, fitted to the piece ---------------------------------------
    PD = os.path.join(concept_dir, 'partes')

    def rng(pts, ax):
        vals = [getattr(q, ax) for q in pts]
        return min(vals), max(vals)

    def pair(front, back, pts, dst, cols_frac=None, zr=None):
        pf, pb = PJ.Panel(os.path.join(PD, front)), PJ.Panel(os.path.join(PD, back))
        x0, x1 = rng(pts, 'x')
        z0, z1 = zr if zr else rng(pts, 'z')
        out = []
        for pn, fl in ((pf, False), (pb, True)):
            pn.img.match(pn.img.stats(keep=not_paper), dst, 0.75, 1.3, keep=np_ink)
            cols = pn.cols_at(*cols_frac) if cols_frac else None
            out.append(pn.fit(x0, x1, z0, z1, flip=fl, cols=cols))
        return out

    def two_sided(pf, pb, p, n, fb):
        wf = smooth(0.25, -0.25, n.y)
        return PJ.blend([(wf + 1e-3, pf.colour(p.x, p.z)), (1.0 - wf + 1e-3, pb.colour(p.x, p.z))], fb)

    tp = [V(v.co) for v in tee.data.vertices]
    tf, tb = pair('camiseta-frente-0.png', 'camiseta-costas-0.png', tp, tee_dst, cols_frac=(0.78, 0.96))
    pp = [V(v.co) for v in pants.data.vertices]
    zc = min(q.z for q in pp if abs(q.x) < 0.015)                    # the crotch of the piece
    ztop = max(q.z for q in pp)
    pants_s = []
    for name, fl in (('calca-frente-0.png', False), ('calca-costas-0.png', True)):
        pn = PJ.Panel(os.path.join(PD, name))
        pn.img.match(pn.img.stats(keep=not_paper), pants_dst, 0.75, 1.3, keep=np_ink)
        rc, cm = PJ.crotch(pn)
        zmap = PJ.pw([(0.05, pn.box[3]), (zc, rc), (ztop, pn.box[2] + 6)])
        pants_s.append(PJ.Sil(pn, [(q.x, q.z) for q in pp], zmap, split=(zc, cm), flip=fl, inset=9))
    pf_, pb_ = pants_s
    zb = info['belt'][0]
    BOOT_SHADE = max(v.co.z for v in boots.data.vertices)        # the trousers' shadow on the top of the boots

    def tee_c(p, n):
        c = two_sided(tf, tb, p, n, tee_dst[0])
        # the jacket's shadow on the tee, beside the open front, and the chin's under the neck
        ao = 0.3 * smooth(xopen(p.z) - 0.035, xopen(p.z) + 0.005, abs(p.x)) + 0.18 * smooth(1.44, 1.53, p.z) + 0.2 * smooth(zb + 0.09, zb + 0.03, p.z)
        ao += 0.3 * smooth(0.17, 0.09, math.hypot(p.x, p.y - 0.04)) * smooth(1.42, 1.5, p.z)          # inside the collar
        return mul(c, light(n, 0.08, 0.1) * (1.0 - min(0.5, ao)) * brush(p, 30, 0.04))

    def pants_c(p, n):
        wf = smooth(0.25, -0.25, n.y)
        c = PJ.blend([(wf + 1e-3, pf_.colour(p.x, p.z)), (1.0 - wf + 1e-3, pb_.colour(p.x, p.z))], pants_dst[0])
        ao = 0.28 * smooth(zb - 0.16, zb - 0.03, p.z) + 0.2 * smooth(0.07, 0.0, abs(p.x)) * smooth(0.6, 0.85, p.z) + 0.25 * smooth(0.40, 0.31, p.z)
        return mul(c, light(n, 0.10, 0.2) * (1.0 - min(0.5, ao)))

    tee_i = Img(size // 2, tee_dst[0])
    bake(tee, tee_i, lambda p, n: mul(tee_c(p, n), 0.78), None, aws[tee.name])
    tee_i.dilate(4)
    pants_i = Img(size // 2, pants_dst[0])
    bake(pants, pants_i, lambda p, n: mul(pants_c(p, n), 0.9), None, aws[pants.name])
    pants_i.dilate(4)

    # ---- the boots: one boot in profile and one from the front, each fitted by silhouette to each boot (the same pictures, mirrored) --
    bside = PJ.Panel(os.path.join(PD, 'bota-lado-0.png'))
    bfront = PJ.Panel(os.path.join(PD, 'bota-frente-0.png'))
    for pn in (bside, bfront):
        pn.img.match(pn.img.stats(keep=not_paper), boots_dst, 0.8, 1.25, keep=np_ink)
    bpts = [V(v.co) for v in boots.data.vertices]
    bside_s = PJ.Sil(bside, [(q.y, q.z) for q in bpts], inset=10)
    bfront_s = {sg: PJ.Sil(bfront, [(q.x, q.z) for q in bpts if q.x * sg > 0], inset=10, flip=sg < 0) for sg in (1, -1)}

    def boots_c(p, n):
        wf = max(0.0, -n.y) ** 2 + 0.5 * max(0.0, n.z) ** 2 * (1.0 if p.y < 0.02 else 0.0) + 0.02
        ws = abs(n.x) ** 2 + max(0.0, n.y) ** 2 + 0.02
        c = PJ.blend([(wf, bfront_s[1 if p.x > 0 else -1].colour(p.x, p.z)), (ws, bside_s.colour(p.y, p.z))], boots_dst[0])
        c = mul(c, light(n, 0.10, 0.3) * (1.0 - 0.3 * smooth(BOOT_SHADE - 0.07, BOOT_SHADE, p.z)))
        return mul(c, 0.45) if p.z < 0.0 else c

    boots_i = Img(size // 4, boots_dst[0])
    bake(boots, boots_i, boots_c, None, aws[boots.name])
    boots_i.dilate(4)

    # ---- the belt, its pouches and tools, and the jacket's collar ------------------------------------------------------------------
    pouch = PJ.Panel(os.path.join(PD, 'bolso-frente-0.png'))
    ptags = tags.get('props') or {}
    frames = info['pouches']
    cy = info['belt'][1]
    STRAP = (0.30, 0.185, 0.115)
    FLAT = {'metal': (0.36, 0.37, 0.39), 'h_yellow': (0.60, 0.46, 0.15), 'h_red': (0.45, 0.13, 0.11), 'h_green': (0.17, 0.26, 0.16), 'h_dark': (0.09, 0.09, 0.10),
            'h_wood': (0.40, 0.27, 0.15)}
    RECT = {'pouch': (517.0, 327.0, 645.0, 320.0, 205, 830), 'pocket': (515.0, 225.0, 740.0, 175.0, 300, 730), 'loop': (512.0, 55.0, 180.0, 140.0, 462, 562)}

    def leather(c):
        """Matte and a little yellower: less saturated than the picture's wet orange, and as dark as the concept's worn tan."""
        l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
        return (c[0] * 0.68 + l * 0.14, c[1] * 0.72 + l * 0.14, c[2] * 0.64 + l * 0.14)

    def props_c(p, n):
        tag = TAG or 'metal'
        kind, _, idx = tag.partition(':')
        if kind in RECT:
            fr = frames[int(idx)][kind]
            d = p - fr['c']
            u = max(-1.0, min(1.0, d.dot(fr['r']) / (fr['w'] / 2)))
            v = max(-1.0, min(1.0, d.z / (fr['h'] / 2)))
            cc, hw, cr, hh, lo, hi = RECT[kind]
            facing = n.dot(fr['n'])
            if n.z > 0.6 and kind != 'loop':                     # the open top: the dark inside
                return (0.10, 0.06, 0.04)
            if facing > 0.45:
                c = pouch.img.at(cc + u * hw * 0.97, cr - v * hh * 0.97)
            else:                                               # the sides and the back: the leather beside the stitching, darker
                c = mul(pouch.img.at(lo + 30 if d.dot(fr['r']) < 0 else hi - 30, cr - v * hh * 0.9), 0.82 if facing > -0.3 else 0.6)
            c = mul(leather(c), light(n, 0.08, 0.25) * (0.86 + 0.14 * smooth(-1.0, 0.2, v)))
            if facing > 0.45 and kind != 'loop':                 # the stitching, drawn again by script so that it reads from a metre away
                du, dv = (1 - abs(u)) * fr['w'] / 2, (1 - abs(v)) * fr['h'] / 2
                near = min(du, dv if v < 0 or kind == 'pouch' else 9.0)
                along = (v * fr['h'] if du < dv else u * fr['w']) / 2
                if 0.007 < near < 0.0115:
                    c = mix(c, (0.74, 0.64, 0.47), 0.7) if (along / 0.011) % 1.0 < 0.6 else mul(c, 0.8)
                elif near < 0.004:
                    c = mul(c, 0.55)                               # the inked edge of the piece
            return c
        if kind == 'belt':
            v = (p.z - zb) / 0.031
            th = math.atan2(p.y - cy, p.x)
            c = mul(STRAP, 0.85 + 0.3 * vnoise(th * 9, p.z * 60, 2.0))
            if 0.55 < abs(v) < 0.72 and math.sin(th * 150) > -0.2:
                c = mix(c, (0.62, 0.52, 0.40), 0.75)             # the stitching
            c = mix(c, INK, 0.8 * smooth(0.8, 0.98, abs(v)))
            return mul(c, light(n, 0.1, 0.2))
        if kind == 'collar':
            rho = math.hypot(p.x, p.y - 0.04)
            c = mul(jacket_dst[0], (0.55 + 0.4 * smooth(0.085, 0.13, rho)) * brush(p, 30, 0.05))
            return mul(c, light(n, 0.12, 0.45))
        if kind == 'olive':                                      # the raised pockets: the jacket's own paint, a line of shadow under the flap
            return mul(jacket_c(p, n), J_GAIN * (0.7 if n.z < -0.5 else 1.0))
        if kind == 'button':
            return mul((0.11, 0.105, 0.085), light(n, 0.5, 0.2))
        if kind in ('roll', 'lining'):                           # the rolled sleeve: the jacket's cloth, dark in the folds between the turns;
            fold = abs(n.x)                                      # its last turn is the lining, paler and greyer
            base = jacket_dst[0] if kind == 'roll' else mul(mix(jacket_dst[0], (0.60, 0.60, 0.48), 0.75), 1.25)
            c = mul(base, J_GAIN * 1.08 * brush(p, 34, 0.12) * brush(p, 90, 0.06) * (1.0 - 0.62 * smooth(0.35, 0.95, fold)))
            th = math.atan2(p.z - 1.456, p.y)
            if kind == 'roll' and abs(math.sin(th * 23 + p.x * 400)) > 0.985:
                c = mul(c, 0.8)                                  # a few creases across the turns
            return mul(c, light(n, 0.12, 0.3))
        if kind == 'inside':                                     # the dark inside of a sleeve or of a trouser leg
            return (0.06, 0.064, 0.05)
        if kind == 'collar_edge':
            return mix(INK, jacket_dst[0], 0.25)
        c = FLAT.get(kind, FLAT['metal'])
        return mul(c, light(n, 0.2, 0.3) * (0.85 + 0.3 * vnoise(p.x * 90, p.y * 90, p.z * 50)))

    props_i = Img(size * 3 // 4, LEATHER)
    bake(props_ob, props_i, props_c, ptags)
    props_i.dilate(8)             # the islands are small and their colours far apart: more margin, or the JPEG bleeds one into the other

    # ---- flat patches for the lamp and the mouth, and the strip of teeth (the fourth row) --------------------------------------
    cellsi = Img(256, (0.3, 0.3, 0.3))
    cols = {'metal': (0.5, 0.5, 0.52), 'strap': (0.07, 0.07, 0.08), 'lamp': (0.95, 0.9, 0.55), 'cavity': (0.085, 0.028, 0.032),
            'teeth': (0.86, 0.80, 0.66), 'lens': (0.98, 0.93, 0.55), 'case': (0.12, 0.125, 0.13), 'gum': (0.50, 0.22, 0.22), 'tongue': (0.56, 0.25, 0.25),
            'lash': (0.075, 0.045, 0.04), 'lashlow': (0.36, 0.20, 0.16), 'glint': (0.97, 0.95, 0.90)}
    GRAD = {'cavity': ((0.27, 0.085, 0.085), (0.018, 0.006, 0.008)), 'tongue': ((0.62, 0.30, 0.30), (0.25, 0.085, 0.09)), 'gum': ((0.60, 0.29, 0.29), (0.30, 0.11, 0.12))}
    cell = cellsi.n // 4
    for name, (u, v) in PATCH.items():
        cx, cy_ = int(u * cellsi.n), int(v * cellsi.n)
        for y in range(cy_ - cell // 2, cy_ + cell // 2):
            for x in range(cx - cell // 2, cx + cell // 2):
                c = mul(cols[name], 0.92 + 0.16 * vnoise(x * 0.15, y * 0.15, 1.0))
                if name in GRAD:                 # a gradient down the cell: the lit front of the thing at the top, its dark back at the bottom (jonas_mouth.cell)
                    t_ = smooth(0.14, 0.86, (cy_ + cell // 2 - y) / cell)
                    c = mul(mix(GRAD[name][0], GRAD[name][1], t_), 0.95 + 0.1 * vnoise(x * 0.15, y * 0.15, 1.0))
                if name == 'lens':
                    r = math.hypot(x - cx, y - cy_) / (cell * 0.5)
                    c = mix((1.0, 0.92, 0.5), (0.86, 0.62, 0.16), smooth(0.0, 1.0, r))
                cellsi.put(x, y, c)
    n = cellsi.n
    for y in range(3 * cell, n):                   # teeth: ten along the strip, the root at the top of it (v = 1), the biting edge at v = 0.75
        v = (y - 3 * cell) / (cell - 1)
        for x in range(n):
            u = x / n * 10.0
            k = u - math.floor(u)
            tooth = hsh(math.floor(u), 5.0, 2.0)
            c = mul((0.80, 0.75, 0.61), 0.92 + 0.12 * tooth)                                  # ivory, each tooth its own; a smoker's, not a white bar
            c = mix(c, (0.62, 0.50, 0.30), 0.42 * smooth(0.3, 0.95, v) + 0.16 * vnoise(u * 3.0, v * 4.0, 7.0))   # a little yellower and stained toward the root
            round_ = 1.0 - smooth(0.0, 0.07 + 0.09 * (1 - smooth(0.0, 0.2, v)), min(k, 1 - k))  # the gap: a little wider at the rounded biting corners
            c = mix(c, (0.20, 0.13, 0.10), 0.8 * round_)
            c = mul(c, 1.0 - 0.34 * smooth(0.35, 1.0, v))                                     # the shadow of the lip over the roots
            cellsi.put(x, y, c)

    # ---- the locks of hair: one strip per kind of lock (u across the lock, v from the root to the tip) -------------------------
    hairi = Img(256, HAIR_DARK)
    sw = hairi.n // LOCK_STRIPS
    for i in range(LOCK_STRIPS):
        grey = i >= 5
        dark, lite = (HAIR_GREY_DARK, HAIR_GREY) if grey else (HAIR_DARK, HAIR_LIGHT)
        bright = (0.78, 0.9, 1.0, 1.12, 1.25, 0.85, 1.0, 1.12)[i]
        for y in range(hairi.n):
            v = y / (hairi.n - 1)
            for x in range(sw):
                u = (x + 0.5) / sw
                e = smooth(0.0, 0.2, min(u, 1 - u))
                st = 0.5 + 0.5 * math.sin((u * 2.6 + 0.35 * math.sin(v * 6.0 + i * 1.9) + 0.13 * i) * 2 * math.pi)
                fine = vnoise(u * 14 + i * 7, v * 5, 3.0)
                if grey:                                      # (the temples' strands: the hair's own dark, a touch of grey toward the tip)
                    g_ = 0.55 * smooth(0.6, 0.97, v)
                    dark, lite = mix(HAIR_DARK, HAIR_GREY_DARK, g_), mix(HAIR_LIGHT, HAIR_GREY, g_)
                c = mix(dark, lite, (0.25 + 0.75 * smooth(0.45, 0.95, st)) * (0.4 + 0.6 * fine) * e)
                c = mul(c, bright * (0.72 + 0.28 * smooth(0.0, 0.35, v)) * (1.0 + 0.18 * smooth(0.55, 1.0, v)))
                c = mix(c, mul(dark, 0.45), 0.7 * (1.0 - e))                                   # the lock's inked edge
                hairi.put(i * sw + x, y, c)

    eye_i = eye_image(256 if size > 512 else 128, JF.PHI_IRIS, JF.PHI_MAX, JF.PUPIL_R / JF.IRIS_R)
    lamp_i, lamp_n = lamp_images(256 if size > 512 else 128)
    half = size // 2
    reliefs = {'skin_n': relief(skin, half, 4.0), 'jacket_n': relief(jacket_i, half, 14.0, extra=(jacket_h, 0.34)), 'pants_n': relief(pants_i, half // 2, 12.0, 3),
               'boots_n': relief(boots_i, size // 4, 7.0, 3), 'props_n': relief(props_i, props_i.n // 2 if props_i.n % 2 == 0 else props_i.n, 14.0, 4)}
    return {**reliefs, 'skin': skin.to_image('jonas_skin'), 'jacket': jacket_i.to_image('jonas_jacket'), 'tee': tee_i.to_image('jonas_tee'),
            'pants': pants_i.to_image('jonas_pants'), 'boots': boots_i.to_image('jonas_boots'),
            'props': props_i.to_image('jonas_props'), 'cells': cellsi.to_image('jonas_cells'), 'hair': hairi.to_image('jonas_hair'),
            'eye': eye_i.to_image('jonas_eye'), 'lamp': lamp_i.to_image('jonas_lamp'), 'lamp_n': lamp_n}
