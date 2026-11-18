"""Helpers shared by the person model scripts: the head's place, the shade functions and the tube builder."""
import math

from mathutils import Vector

from common import MB, smooth

V = Vector
F = 1.0   # the level of detail: 1.45 close, 0.6 far (set by person.py from --lod)


def S(n):
    return max(4, int(round(n * F)))


BODY = None   # set by person.py: the module with the body's rows
HEAD_C = V((0, 0.012, 1.655))
HEAD_R = (0.108, 0.112, 0.128)


# ---------------------------------------------------------------------------------------------------------------
# colour functions: the soft gradients that stand in for texture (they multiply the material colour)

def shade_z(lo, hi, dark=0.78, bright=1.04):
    def fn(p, n, s):
        k = dark + (bright - dark) * smooth(lo, hi, p.z)
        if n.z < -0.35:
            k *= 0.88
        return (k, k * 0.985, k * 0.97)
    return fn


def skin_fn(p, n, s):
    k = 0.93 + 0.09 * smooth(1.45, 1.78, p.z) - (0.1 * smooth(-0.2, -0.7, n.z))
    # a little redder on the cheeks (a soft patch, no edge), and on the ears
    cheek = math.exp(-((abs(p.x) - 0.062) ** 2 / 0.0006 + (p.z - 1.625) ** 2 / 0.0007)) * smooth(0.02, 0.07, p.y)
    warm = 0.5 * cheek
    return (k, k * (0.97 - 0.06 * warm), k * (0.95 - 0.09 * warm))


def limb_fn(p, n, s):
    k = 0.90 + 0.12 * (n.z * 0.5 + 0.5)
    # the inner side (toward the body) is in shadow
    return (k, k * 0.98, k * 0.96)


def hair_fn(root_z, tip_z):
    def fn(p, n, s):
        t = smooth(root_z, tip_z, p.z)
        k = 0.66 + 0.45 * t
        return (k, k * 0.98, k * 0.95)
    return fn


# ---------------------------------------------------------------------------------------------------------------
# helpers to add parts

def tube(mb, pts, radii, sides=10, mat=None, colfn=None, cap0=0.0, cap1=0.0, hint=(1, 0, 0), k=None, phase=0.0):
    """A tube along a polyline; radii: (rx, ry) per point. Returns the rings."""
    secs = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        d = (b - a).normalized()
        s = {'c': tuple(p), 'd': tuple(d), 'rx': radii[i][0], 'ry': radii[i][1], 'u': hint}
        if k:
            s['k'] = k(i, p) if callable(k) else k
        secs.append(s)
    return mb.loft(secs, sides, cap0=cap0, cap1=cap1, mat=mat, colfn=colfn, phase=phase)


def bones_info(sp):
    return {n: {'head': h, 'tail': t, 'parent': p} for n, p, h, t, _ in sp}


class Part:
    """A mesh plus how it is bound: rigid to one bone, or weighted by distance to a list of bones."""

    def __init__(self, name, bone=None, allowed=None, mat='skin'):
        self.mb = MB(name)
        self.mb.default_mat = mat
        self.bone, self.allowed = bone, allowed
        self.name = name




# ---- the proportions pass: shorter, thicker legs, a bigger head (about 6.4 heads). Everything is built in the old
# proportions and warped once, at the end, so the skeleton and the meshes agree.
LEG_K = 0.90
SHIFT = 0.95 * (1 - LEG_K)
HEAD_K = 1.07


def warp(p):
    x, y, z = p[0], p[1], p[2]
    if z < 0.95:
        w = smooth(0.95, 0.80, z) * smooth(0.21, 0.15, abs(x))      # the legs get thicker
        if w > 0:
            cx = 0.09 if x > 0 else -0.09
            x = cx + (x - cx) * (1 + 0.20 * w)
            y = y * (1 + 0.20 * w)
        z = z * LEG_K
    elif z <= 1.5:
        z = z - SHIFT
    else:
        z = 1.5 - SHIFT + (z - 1.5) * HEAD_K
    s = 1 + (HEAD_K - 1) * smooth(1.44, 1.56, p[2])
    if p[2] > 1.44:
        x = x * s
        y = 0.012 + (y - 0.012) * s
    return (x, y, z)
