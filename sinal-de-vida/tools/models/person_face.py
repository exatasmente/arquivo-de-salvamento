"""The head of the person model: the skull, the neck, the face (eyes, lids, brows, mouth), hair, beards, glasses, the headlamp
and the backpack. Imported by person.py. Heights are relative to the middle of the head (HZ) so the head can be resized."""
import math

from mathutils import Matrix, Vector

from common import MB, smooth
from person_shared import S as SZ, HEAD_C, HEAD_R, V, tube, limb_fn, skin_fn, shade_z, hair_fn

HZ = HEAD_C.z
EX = 0.05          # half the distance between the eyes
EZ = HZ + 0.020     # eye height
ER = 0.031         # eyeball radius


def head_deform(fem):
    rz = HEAD_R[2]

    def fn(p):
        x, y, z = p
        zn = z / rz
        jaw = smooth(0.15, -0.98, zn)
        x *= 1 - (0.27 if fem else 0.22) * jaw ** 1.3
        y *= 1 - 0.06 * jaw
        x *= 1 + 0.05 * math.exp(-((zn + 0.2) / 0.34) ** 2)   # the cheeks
        if y > 0:
            y *= 1.0 + 0.02 * smooth(0.0, 0.6, zn)
            y += (0.002 if fem else 0.005) * math.exp(-((zn - 0.34) / 0.12) ** 2) * (1 - abs(x) / 0.108)   # the brow
            y += 0.009 * math.exp(-((zn + 0.84) / 0.2) ** 2) * (0.6 if fem else 1.0)                    # the chin
        else:
            y *= 1.05
        x *= 1 - 0.04 * math.exp(-((zn - 0.15) / 0.3) ** 2)
        return (x, y, z)
    return fn


def head_mesh(fem):
    mb = MB(f'head_{"f" if fem else "m"}')
    mb.default_mat = 'skin'
    mb.sphere(HEAD_C, HEAD_R, seg=SZ(24), rings=SZ(15), mat='skin', colfn=skin_fn, deform=head_deform(fem))
    return mb


def surface_y(bvh, x, z, y0=0.5):
    hit = bvh.ray_cast(V((x, y0, z)), V((0, -1, 0)))
    return hit[0].y if hit and hit[0] is not None else 0.1


def build_face(mb_head, fem):
    """Neck, nose and ears (into the head mesh) and the parts that move: eyes, lids, brows, mouth. Returns (parts, sy)."""
    bvh = mb_head.bvh()
    sy = lambda x, z: surface_y(bvh, x, z)
    parts = {}
    neck = MB('neck')
    neck.default_mat = 'skin'
    rr = [(0.058, 0.060), (0.053, 0.056), (0.05, 0.053), (0.05, 0.053)] if not fem else [(0.05, 0.053), (0.046, 0.049), (0.043, 0.046), (0.043, 0.046)]
    tube(neck, [V((0, 0.004, 1.40)), V((0, 0.008, 1.45)), V((0, 0.012, 1.50)), V((0, 0.014, 1.56))], rr, SZ(10), mat='skin', colfn=limb_fn, cap0=None, cap1=None)
    parts['neck'] = neck
    extra = MB('headextra')
    extra.default_mat = 'skin'
    # nose: a short ridge and a round tip, with the nostrils' wings
    ny = sy(0.0, HZ - 0.02)
    k = 0.85 if fem else 1.0
    nose = [V((0, sy(0, EZ) - 0.002, EZ - 0.004)), V((0, ny + 0.004, HZ - 0.008)), V((0, ny + 0.011 * k, HZ - 0.026))]
    tube(extra, nose, [(0.011 * k, 0.012), (0.0135 * k, 0.0145), (0.0165 * k, 0.0165)], SZ(8), mat='skin', colfn=skin_fn, cap0=None, cap1=0.012, hint=(1, 0, 0))
    for sgn in (-1, 1):
        extra.sphere((sgn * 0.0125 * k, ny + 0.011 * k, HZ - 0.034), (0.0095 * k, 0.0105, 0.0085), SZ(6), SZ(4), mat='skin', colfn=skin_fn)
        extra.sphere((sgn * 0.1, 0.012, HZ - 0.005), (0.0105, 0.0155, 0.027), SZ(8), SZ(5), mat='skin', colfn=lambda p, n, s: (0.97, 0.88, 0.84))
    parts['extra'] = extra
    # eyes: a ball, an iris cap, a pupil, a glint; and the upper lid as a shell of a slightly bigger sphere
    eyes = MB('eyes')
    eyes.default_mat = 'eye'
    lids = MB('lids')
    lids.default_mat = 'skin'
    ey = sy(EX, EZ)
    for sgn, n in ((1, 'R'), (-1, 'L')):
        c = V((sgn * EX, ey - 0.0105, EZ))
        eyes.sphere(c, ER, SZ(10), SZ(6), mat='eye', colfn=lambda p, nn, s: (1.0, 1.0, 1.0))
        ir = ER * 0.56
        eyes.sphere(c + V((0, ER * 0.86, 0)), (ir, ir * 0.30, ir), SZ(8), SZ(4), mat='iris', colfn=lambda p, nn, s: (1.0, 1.0, 1.0))
        eyes.sphere(c + V((0, ER * 0.92 + 0.0005, 0)), (ir * 0.5, ir * 0.22, ir * 0.5), SZ(6), SZ(3), mat='mouth', colfn=lambda p, nn, s: (1.0, 1.0, 1.0))
        eyes.sphere(c + V((sgn * -0.0045, ER * 0.97, 0.0075)), (0.0042, 0.003, 0.0042), SZ(6), SZ(3), mat='lip', col=(1.6, 1.0, 1.0))
        lr = ER * 1.12
        rows = [34, 60, 86, 112]
        cols = [-78, -39, 0, 39, 78]
        grid = []
        for el in rows:
            row = []
            for az in cols:
                a, b = math.radians(az), math.radians(el)
                p = V((math.sin(a) * math.cos(b), math.cos(a) * math.cos(b), math.sin(b)))
                k2 = 0.55 if el == rows[0] else 0.96   # the lash line is darker
                row.append(lids.vert(c + p * lr, p, (k2, k2 * 0.97, k2 * 0.95)))
            grid.append(row)
        for r0, r1 in zip(grid, grid[1:]):
            for i in range(len(cols) - 1):
                lids.face((r0[i], r1[i], r1[i + 1], r0[i + 1]), 'skin')
    parts['eyes'] = eyes
    parts['lids'] = lids
    # brows: a tapered curve above each eye (thinner and higher on the women)
    brows = MB('brows')
    brows.default_mat = 'brow'
    for sgn in (-1, 1):
        pts = []
        for f in (0.0, 0.33, 0.66, 1.0):
            x = sgn * (0.018 + 0.056 * f)
            z = HZ + 0.066 + (0.006 if fem else 0.0) + 0.011 * math.sin(f * math.pi * 0.85) - 0.003 * f
            pts.append(V((x, sy(x, z) + 0.003, z)))
        w = 0.0135 if not fem else 0.0085
        tube(brows, pts, [(w * 1.0, 0.008), (w * 1.1, 0.0085), (w * 0.95, 0.008), (w * 0.55, 0.006)], SZ(5), mat='brow', colfn=lambda p, n, s: (1, 1, 1), cap0=0.006, cap1=0.008, hint=(0, 0, 1))
    parts['brows'] = brows
    # mouth: a gentle curve (the corners a little up), dark line between two lips
    mouth = MB('mouth')
    mouth.default_mat = 'lip'
    mz = HZ - 0.063
    xs = [-0.030, -0.020, -0.010, 0.0, 0.010, 0.020, 0.030]
    def curve(dz, rv, rd, mat, up=0.0055):
        pts = []
        for x in xs:
            z = mz + dz + up * (x / 0.03) ** 2
            pts.append(V((x, sy(x, z) + 0.001 + rd * 0.5, z)))
        rad = [(rd * 0.5, rv * 0.4), (rd * 0.8, rv * 0.8), (rd, rv), (rd, rv), (rd, rv), (rd * 0.8, rv * 0.8), (rd * 0.5, rv * 0.4)]
        tube(mouth, pts, rad, SZ(6), mat=mat, colfn=lambda p, n, s: (1, 1, 1), cap0=0.004, cap1=0.004, hint=(0, 1, 0))
    curve(-0.0055, 0.0042, 0.0055, 'lip')       # the lower lip
    curve(+0.0045, 0.0034, 0.0046, 'lip')       # the upper lip
    curve(-0.0004, 0.0021, 0.0046, 'mouth')     # the line between
    parts['mouth'] = mouth
    return parts, sy


def hairline(c, front_line, back_line):
    """The height (in head units, -1 chin .. 1 crown) below which there is no hair at the point c of the skull."""
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R
    fr = max(0.0, min(1.0, (c.y - cy) / ry))
    line = back_line + (front_line - back_line) * fr ** 1.4
    side = smooth(0.55, 0.85, abs(c.x) / rx)
    return line * (1 - side) + side * (-0.06 + 0.45 * fr * fr)


def shell_grid(mb, grow, line_fn, seg, rings, from_top, deform, colfn, mat):
    """A cap of the head's ellipsoid on one side of a smooth line (line_fn gives, for a point of the skull, a height in head
    units, -1 chin .. 1 crown). The rows are spread between the pole and the line column by column, so the edge is the
    line itself: no steps, no collapsed faces."""
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R
    grid = []
    for i in range(seg):
        th = 2 * math.pi * i / seg
        zl = line_fn(V((cx + rx * math.cos(th), cy + ry * math.sin(th), 0.0)))
        zl = max(-0.95 * grow, min(0.95 * grow, zl))
        pm = math.acos(zl / grow)
        col = []
        for j in range(rings):
            k = j / (rings - 1)
            ph = pm * k if from_top else pm + (math.pi - pm) * k
            n = V((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)))
            q = V((n.x * rx * grow, n.y * ry * grow, n.z * rz * grow))
            if deform:
                q = V(deform(q))
            q = q + HEAD_C
            col.append(mb.vert(q, n, colfn(q, n, None)))
        grid.append(col)
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(rings - 1):
            if from_top:
                mb.face((grid[i][j], grid[i2][j], grid[i2][j + 1], grid[i][j + 1]), mat)
            else:
                mb.face((grid[i][j], grid[i2][j], grid[i2][j + 1], grid[i][j + 1]), mat)
    mb.orient(0)


def hair_parts(fem, sy):
    """Hair styles. Big locks, a gradient from the root (dark) to the tip."""
    out = {}
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R
    d = head_deform(fem)

    def cap(name, grow, front_line, back_line):
        mb = MB(name)
        mb.default_mat = 'hair'
        shell_grid(mb, grow, lambda c: hairline(c, front_line, back_line), 28, 10, True, d, hair_fn(HZ - 0.12, HZ + 0.15), 'hair')
        return mb

    def lock(mb, pts, w, t, sides=5, cap_end=0.02):
        n = len(pts)
        radii = [(w * 1.3 * (1.0 - 0.68 * (i / (n - 1)) ** 1.5), t * 1.5 * (1.0 - 0.45 * (i / (n - 1)))) for i in range(n)]
        tube(mb, pts, radii, sides, mat='hair', colfn=hair_fn(HZ - 0.3, HZ + 0.15), cap0=None, cap1=cap_end, hint=(1, 0, 0))

    top = HZ + 0.115
    # curto: a cap and a fringe of big locks swept to one side, short at the sides
    mb = cap('hair_curto', 1.07, 0.42, -0.2)
    for x, tilt in ((-0.052, 0.012), (-0.012, 0.004), (0.03, -0.004), (0.065, -0.012)):
        lock(mb, [V((x * 0.6, 0.045, top + 0.008)), V((x * 0.95, 0.098, top - 0.004)), V((x * 1.1 + tilt, 0.124, top - 0.03)), V((x * 1.1 + tilt * 1.6, 0.128, top - 0.062))], 0.026, 0.012)
    for sgn in (-1, 1):
        lock(mb, [V((sgn * 0.075, 0.075, top - 0.005)), V((sgn * 0.103, 0.065, top - 0.04)), V((sgn * 0.109, 0.05, top - 0.085))], 0.019, 0.013)
    out['hair_curto'] = mb
    # raspado: a thin close cap
    out['hair_raspado'] = cap('hair_raspado', 1.016, 0.5, -0.1)
    # longo: a cap, side curtains, and a big fall at the back to the shoulders
    mb = cap('hair_longo', 1.07, 0.4, -0.55)
    for k in range(9):
        a = -1.2 + k * (2.4 / 8)
        x0, y0 = math.sin(a) * 0.092, cy - math.cos(a) * 0.09
        sw = 0.01 * math.sin(k * 1.7)
        lock(mb, [V((x0, y0, top - 0.01)), V((x0 * 1.13, y0 - 0.034, HZ + 0.02)), V((x0 * 1.1 + sw, y0 - 0.05, HZ - 0.1)), V((x0 * 1.04 + sw, y0 - 0.044, HZ - 0.2)), V((x0 * 0.98 + sw * 1.4, y0 - 0.03, HZ - 0.29))], 0.036, 0.017, 5, 0.03)
    for sgn in (-1, 1):
        lock(mb, [V((sgn * 0.06, 0.088, top + 0.005)), V((sgn * 0.102, 0.08, top - 0.04)), V((sgn * 0.113, 0.058, HZ - 0.03)), V((sgn * 0.106, 0.03, HZ - 0.13)), V((sgn * 0.092, 0.012, HZ - 0.22))], 0.024, 0.015, 5, 0.025)
    out['hair_longo'] = mb
    # rabo: the hair pulled back and a ponytail that hangs from the back of the head
    mb = cap('hair_rabo', 1.07, 0.3, -0.28)
    for k in range(4):
        a = (k - 1.5) * 0.04
        lock(mb, [V((a * 0.5, -0.09, top - 0.02)), V((a * 1.0, -0.15, top - 0.05)), V((a * 1.4 + 0.004 * math.sin(k), -0.168, HZ + 0.0)), V((a * 1.2, -0.158, HZ - 0.09)), V((a, -0.14, HZ - 0.17))], 0.03, 0.026, 5, 0.03)
    mb.sphere((0, -0.1, top - 0.03), (0.032, 0.028, 0.028), SZ(8), SZ(4), mat='strap', col=(1, 1, 1))
    for sgn in (-1, 1):
        lock(mb, [V((sgn * 0.06, 0.088, top + 0.005)), V((sgn * 0.102, 0.078, top - 0.04)), V((sgn * 0.109, 0.052, top - 0.075))], 0.021, 0.013)
    out['hair_rabo'] = mb
    # coque: the cap and a bun on top at the back
    mb = cap('hair_coque', 1.07, 0.32, -0.28)
    mb.sphere((0, -0.068, top + 0.045), (0.056, 0.052, 0.048), SZ(10), SZ(6), mat='hair', colfn=hair_fn(HZ + 0.05, HZ + 0.2))
    for k in range(5):
        a = k / 4 * math.pi
        lock(mb, [V((math.cos(a) * 0.052, -0.07 - math.sin(a) * 0.02, top + 0.03)), V((math.cos(a) * 0.062, -0.07, top + 0.062)), V((math.cos(a) * 0.03, -0.07, top + 0.085))], 0.017, 0.012, 4, 0.01)
    for sgn in (-1, 1):
        lock(mb, [V((sgn * 0.06, 0.088, top + 0.005)), V((sgn * 0.102, 0.078, top - 0.04)), V((sgn * 0.11, 0.05, top - 0.08)), V((sgn * 0.102, 0.03, top - 0.11))], 0.021, 0.013)
    out['hair_coque'] = mb
    return out


def beard_shell(name, grow, top_line, side_line, narrow=None):
    """A shell over the jaw: from the chin up to a smooth line (higher at the cheeks)."""
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R

    def line(c):
        v = top_line + 0.3 * smooth(0.5, 0.9, abs(c.x) / rx)
        if narrow is not None and abs(c.x) > narrow * 2:
            v = -0.9
        if c.y < cy - 0.01:
            v = -0.9
        return v
    mb = MB(name)
    mb.default_mat = 'beard'
    shell_grid(mb, grow, line, 28, 9, False, head_deform(False), lambda p, n, s: (0.86 + 0.16 * smooth(HZ - 0.12, HZ - 0.02, p.z),) * 3, 'beard')
    keep = []
    for f_, m in zip(mb.f, mb.fm):
        a = [V(mb.v[j]) for j in f_]
        c = sum(a, V()) / len(a)
        area = (a[1] - a[0]).cross(a[2] - a[0]).length
        if area > 2e-7 and not (abs(c.x) < 0.034 and -0.5 < (c.z - cz) / rz < -0.33 and c.y > cy):
            keep.append((f_, m))
    mb.f = [k[0] for k in keep]
    mb.fm = [k[1] for k in keep]
    return mb


def beards(fem, sy):
    out = {}
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R
    d = head_deform(False)

    def shell(name, grow, pred):
        mb = MB(name)
        mb.default_mat = 'beard'
        mb.sphere(HEAD_C, (rx * grow, ry * grow, rz * grow), SZ(26), SZ(17), mat='beard', colfn=lambda p, n, s: (0.86 + 0.16 * smooth(HZ - 0.12, HZ - 0.02, p.z),) * 3, deform=d)
        keep = [(f, m) for f, m in zip(mb.f, mb.fm) if pred(sum((V(mb.v[i]) for i in f), V()) / len(f))]
        mb.f = [k[0] for k in keep]
        mb.fm = [k[1] for k in keep]
        return mb

    # stubble: a thin shell on the lower face, from the cheeks to the chin, left open around the mouth by the lips themselves
    out['beard_rala'] = beard_shell('beard_rala', 1.012, -0.12, -0.2)
    mb = beard_shell('beard_cheia', 1.06, 0.12, -0.0)
    tube(mb, [V((0, 0.086, HZ - 0.11)), V((0, 0.098, HZ - 0.14)), V((0, 0.092, HZ - 0.175)), V((0, 0.078, HZ - 0.195))], [(0.04, 0.018), (0.042, 0.022), (0.034, 0.02), (0.016, 0.012)], SZ(8), mat='beard',
         colfn=lambda p, n, s: (0.8 + 0.3 * smooth(HZ - 0.2, HZ - 0.1, p.z),) * 3, cap1=0.012, cap0=None)
    out['beard_cheia'] = mb
    out['beard_cavanhaque'] = beard_shell('beard_cavanhaque', 1.04, -0.55, -0.6, narrow=0.05)
    return out


def glasses_mesh(sy):
    mb = MB('glasses')
    mb.default_mat = 'frame'
    for sgn in (-1, 1):
        y = sy(sgn * EX, EZ) + 0.014
        n = 12
        pts = [V((sgn * EX + math.cos(2 * math.pi * i / n) * 0.036, y, EZ + math.sin(2 * math.pi * i / n) * 0.029)) for i in range(n)]
        for i in range(n):
            tube(mb, [pts[i], pts[(i + 1) % n]], [(0.0034, 0.0034)] * 2, SZ(4), mat='frame', colfn=lambda p, nn, s: (1, 1, 1), cap0=None, cap1=None)
        tube(mb, [V((sgn * (EX + 0.036), y, EZ + 0.005)), V((sgn * 0.104, 0.04, EZ + 0.006)), V((sgn * 0.106, 0.0, EZ + 0.002))], [(0.003, 0.003)] * 3, SZ(4), mat='frame', colfn=lambda p, nn, s: (1, 1, 1), cap0=None, cap1=0.003)
    yb = sy(0, EZ) + 0.016
    tube(mb, [V((-0.012, yb - 0.003, EZ + 0.01)), V((0, yb + 0.001, EZ + 0.012)), V((0.012, yb - 0.003, EZ + 0.01))], [(0.003, 0.003)] * 3, SZ(4), mat='frame', colfn=lambda p, nn, s: (1, 1, 1), cap0=0.002, cap1=0.002)
    return mb


def lamp_mesh(sy):
    mb = MB('lamp_head')
    mb.default_mat = 'strap'
    n = 20
    zb = HZ + 0.085
    ring = [V((math.sin(2 * math.pi * i / n) * 0.112, HEAD_C.y + math.cos(2 * math.pi * i / n) * 0.121, zb)) for i in range(n)]
    for i in range(n):
        tube(mb, [ring[i], ring[(i + 1) % n]], [(0.012, 0.0045)] * 2, SZ(4), mat='strap', colfn=lambda p, nn, s: (0.9, 0.9, 0.9), cap0=None, cap1=None, hint=(0, 0, 1))
    mb.box((0, ring[0].y + 0.016, zb + 0.002), (0.05, 0.032, 0.038), mat='metal', col=(0.7, 0.7, 0.7))
    mb.sphere((0, ring[0].y + 0.033, zb + 0.002), (0.017, 0.006, 0.017), SZ(8), SZ(4), mat='lamp', col=(1, 1, 1))
    return mb


def pack_mesh():
    mb = MB('pack')
    mb.default_mat = 'pack'
    mb.loft([{'c': (0, -0.155, 1.10), 'd': (0, 0, 1), 'rx': 0.135, 'ry': 0.05}, {'c': (0, -0.168, 1.18), 'd': (0, 0, 1), 'rx': 0.158, 'ry': 0.078}, {'c': (0, -0.168, 1.31), 'd': (0, 0, 1), 'rx': 0.152, 'ry': 0.078}, {'c': (0, -0.155, 1.41), 'd': (0, 0, 1), 'rx': 0.115, 'ry': 0.05}],
            SZ(12), cap0=0.02, cap1=0.03, mat='pack', colfn=shade_z(1.1, 1.45, 0.72, 1.05))
    mb.box((0, -0.208, 1.35), (0.22, 0.02, 0.07), mat='strap', col=(0.8, 0.8, 0.8))
    mb.loft([{'c': (-0.14, -0.2, 1.04), 'd': (1, 0, 0), 'rx': 0.045, 'ry': 0.045}, {'c': (0.14, -0.2, 1.04), 'd': (1, 0, 0), 'rx': 0.045, 'ry': 0.045}], SZ(8), cap0=0.02, cap1=0.02, mat='strap', colfn=lambda p, n, s: (0.95, 0.95, 0.95))
    for sgn in (-1, 1):
        tube(mb, [V((sgn * 0.085, -0.085, 1.40)), V((sgn * 0.115, 0.0, 1.445)), V((sgn * 0.125, 0.085, 1.33)), V((sgn * 0.095, 0.098, 1.17)), V((sgn * 0.078, 0.0, 1.12)), V((sgn * 0.082, -0.1, 1.2))], [(0.017, 0.007)] * 6, SZ(4), mat='strap',
             colfn=lambda p, n, s: (0.9, 0.9, 0.9), cap0=None, cap1=None, hint=(0, 0, 1))
    return mb
