"""The clothes that make each main character a silhouette of their own, and the boots. Imported by person.py.
Everything is in the old proportions: person.py warps it once at the end (person_shared.warp)."""
import math

from mathutils import Matrix, Vector

from common import MB, smooth
from person_shared import S as SZ, V, tube, shade_z, limb_fn, HEAD_C

PI = math.pi
FRONT = PI / 2


def _P():
    import person_shared
    return person_shared.BODY   # person.py: the rows and the arm points live there


def rows_of(fem, g, z0, z1):
    """Torso sections (z, rx, ry) scaled by g, between z0 and z1."""
    P = _P()
    rows = P.torso_sections(fem, False)
    out = [(z, rx / 1.03 * g, ry / 1.03 * g) for z, rx, ry in rows if z0 - 0.06 <= z <= z1]
    return out


def open_front(mb, rows, mat, gap, colfn, sides=14, fem=False, hem_flare=1.0, kfn=None):
    """A garment that wraps the body and is open down the front (a jacket, a cardigan): rings over an arc that leaves a gap."""
    secs = []
    for z, rx, ry in rows:
        secs.append({'c': (0, 0.0, z), 'd': (0, 0, 1), 'rx': rx, 'ry': ry, 'k': kfn(z) if kfn else None})
    secs[0]['rx'] *= hem_flare
    secs[0]['ry'] *= hem_flare
    mb.loft(secs, sides, mat=mat, colfn=colfn, arc=(FRONT + gap, FRONT + 2 * PI - gap))
    # the edges of the opening: a rolled band down each side
    for sgn in (-1, 1):
        a = FRONT + sgn * gap
        pts = [V((math.cos(a) * rx, math.sin(a) * ry, z)) for z, rx, ry in rows]
        tube(mb, pts, [(0.016, 0.011)] * len(pts), SZ(5), mat=mat, colfn=colfn, cap0=0.01, cap1=0.01, hint=(0, 0, 1) if False else (1, 0, 0))


def sleeves(mb, fem, mat, k, colfn, cuff=True):
    P = _P()
    for n, S in (('R', 1), ('L', -1)):
        sh, e, w, hd = P.arm_points(S, fem)
        r0 = (0.052 if not fem else 0.045) * k
        up = [sh + (e - sh) * f for f in (0.0, 0.3, 0.62, 0.92, 1.0)] + [e + (w - e) * 0.12]
        rs = [r0 * 1.0, r0 * 0.98, r0 * 0.92, r0 * 0.88, r0 * 0.87, r0 * 0.85]
        tube(mb, up, [(r, r) for r in rs], SZ(8), mat=mat, colfn=colfn, cap0=0.04, cap1=None, k=lambda i, p: (lambda th: 1 + 0.03 * math.sin(3 * th + i * 1.7)))
        fo = [e + (w - e) * f for f in (0.1, 0.35, 0.6, 0.85, 0.97)]
        rr = r0 * 0.85
        tube(mb, fo, [(rr, rr), (rr * 0.95, rr * 0.95), (rr * 0.9, rr * 0.9), (rr * 0.88, rr * 0.88), (rr * 0.93, rr * 0.93)], SZ(8), mat=mat, colfn=colfn, cap0=None, cap1=0.0 if False else 0.0,
             k=lambda i, p: (lambda th: 1 + 0.035 * math.sin(3 * th + i * 2.3)))
        if cuff:
            cw = w - hd * 0.012
            tube(mb, [cw - (w - e).normalized() * 0.04, cw], [(rr * 1.1, rr * 1.1)] * 2, SZ(8), mat=mat, colfn=lambda p, nn, s: (0.7, 0.7, 0.68), cap0=None, cap1=None)


def tee(fem):
    """The shirt under the jacket: the torso only, with a crew neck and short sleeve stubs."""
    P = _P()
    mb = MB(f'tee_{"f" if fem else "m"}')
    mb.default_mat = 'under'
    rows = [(z, rx, ry) for z, rx, ry in P.torso_sections(fem, False) if z >= 0.95]
    secs = [{'c': (0, 0.0, z), 'd': (0, 0, 1), 'rx': rx * 1.0, 'ry': ry * 1.0, 'k': (lambda th, z=z: 1 + 0.02 * math.sin(4 * th + z * 22))} for z, rx, ry in rows]
    mb.loft(secs, SZ(14), cap0=None, cap1=0.01, mat='under', colfn=shade_z(0.95, 1.46, 0.78, 1.05))
    mb.loft([{'c': (0, 0.004, 1.43), 'd': (0, 0, 1), 'rx': 0.07, 'ry': 0.066}, {'c': (0, 0.006, 1.458), 'd': (0, 0, 1), 'rx': 0.06, 'ry': 0.058}], SZ(10), cap0=None, cap1=None, mat='under', colfn=lambda p, n, s: (0.8, 0.8, 0.78))
    for n, S in (('R', 1), ('L', -1)):
        sh, e, w, hd = P.arm_points(S, fem)
        pts = [sh + (e - sh) * f for f in (0.0, 0.2, 0.42)]
        r0 = (0.056 if not fem else 0.048)
        tube(mb, pts, [(r0, r0), (r0 * 0.96, r0 * 0.96), (r0 * 0.93, r0 * 0.93)], SZ(8), mat='under', colfn=shade_z(1.1, 1.45, 0.78, 1.05), cap0=0.04, cap1=None)
    return mb


def work_jacket():
    """Jonas: an open work jacket, thick collar, chest pockets, ribbed cuffs and hem."""
    mb = MB('ojacket_m')
    mb.default_mat = 'top'
    rows = rows_of(False, 1.16, 0.93, 1.44)
    fn = shade_z(0.95, 1.46, 0.7, 1.05)
    open_front(mb, rows, 'top', 0.62, fn, 16, False, 1.04, lambda z: (lambda th: 1 + 0.025 * math.sin(4 * th + z * 22)))
    # the collar: a flared band, open in front
    mb.loft([{'c': (0, 0.0, 1.42), 'd': (0, 0, 1), 'rx': 0.12, 'ry': 0.1}, {'c': (0, 0.012, 1.46), 'd': (0, 0, 1), 'rx': 0.098, 'ry': 0.084}, {'c': (0, 0.014, 1.495), 'd': (0, 0, 1), 'rx': 0.095, 'ry': 0.082}],
            12, mat='top', colfn=shade_z(1.4, 1.5, 0.78, 1.1), arc=(FRONT + 0.5, FRONT + 2 * PI - 0.5))
    # the hem: a rib band
    z0 = rows[0][0]
    mb.loft([{'c': (0, 0, z0 - 0.02), 'd': (0, 0, 1), 'rx': rows[0][1] * 1.06, 'ry': rows[0][2] * 1.06}, {'c': (0, 0, z0 + 0.03), 'd': (0, 0, 1), 'rx': rows[0][1] * 1.05, 'ry': rows[0][2] * 1.05}],
            14, mat='top', colfn=lambda p, n, s: (0.64, 0.64, 0.62), arc=(FRONT + 0.62, FRONT + 2 * PI - 0.62))
    for sgn in (-1, 1):   # chest pockets with a flap
        mb.box((sgn * 0.095, 0.118, 1.24), (0.08, 0.012, 0.06), mat='top', col=(0.86, 0.86, 0.84), rot=Matrix.Rotation(sgn * 0.16, 3, 'Y'))
        mb.box((sgn * 0.095, 0.124, 1.262), (0.082, 0.01, 0.024), mat='top', col=(0.74, 0.74, 0.72), rot=Matrix.Rotation(sgn * 0.16, 3, 'Y'))
    sleeves(mb, False, 'top', 1.2, shade_z(1.1, 1.45, 0.7, 1.04))
    return mb


def cardigan():
    """Dona Neide: a thick cardigan to the hips, open, with a ribbed edge, big pockets and thick sleeves."""
    mb = MB('cardigan_f')
    mb.default_mat = 'top'
    rows = rows_of(True, 1.2, 0.86, 1.44)
    rows = [(0.86, rows[0][1] * 1.04, rows[0][2] * 1.05)] + rows
    fn = shade_z(0.88, 1.46, 0.68, 1.05)
    open_front(mb, rows, 'top', 0.5, fn, 16, True, 1.0, lambda z: (lambda th: 1 + 0.04 * math.sin(6 * th + z * 30)))
    mb.loft([{'c': (0, 0.0, 1.42), 'd': (0, 0, 1), 'rx': 0.108, 'ry': 0.09}, {'c': (0, 0.01, 1.47), 'd': (0, 0, 1), 'rx': 0.092, 'ry': 0.078}, {'c': (0, 0.012, 1.5), 'd': (0, 0, 1), 'rx': 0.09, 'ry': 0.076}],
            12, mat='top', colfn=shade_z(1.4, 1.5, 0.75, 1.1), arc=(FRONT + 0.42, FRONT + 2 * PI - 0.42))
    for sgn in (-1, 1):
        mb.box((sgn * 0.11, 0.122, 1.0), (0.09, 0.014, 0.085), mat='top', col=(0.82, 0.82, 0.8), rot=Matrix.Rotation(sgn * 0.14, 3, 'Y'))
    sleeves(mb, True, 'top', 1.32, shade_z(1.1, 1.45, 0.7, 1.04))
    return mb


def apron():
    """A tool apron: a panel over the front from the chest to the thighs, a neck strap, a tie, big pockets with tools."""
    mb = MB('apron_f')
    mb.default_mat = 'apron'
    rows = [(0.80, 0.15, 0.115), (0.9, 0.158, 0.118), (1.02, 0.145, 0.108), (1.14, 0.13, 0.102), (1.26, 0.125, 0.112), (1.33, 0.1, 0.108)]
    secs = [{'c': (0, 0.012, z), 'd': (0, 0, 1), 'rx': rx * 1.1, 'ry': ry * 1.1} for z, rx, ry in rows]
    mb.loft(secs, SZ(12), mat='apron', colfn=shade_z(0.8, 1.34, 0.74, 1.05), arc=(FRONT - 1.0, FRONT + 1.0))
    for sgn in (-1, 1):
        mb.box((sgn * 0.065, 0.158, 0.95), (0.1, 0.02, 0.1), mat='apron', col=(0.8, 0.8, 0.78))
        mb.box((sgn * 0.075, 0.166, 1.0), (0.012, 0.012, 0.1), mat='metal', col=(0.9, 0.9, 0.9), rot=Matrix.Rotation(sgn * 0.1, 3, 'Y'))   # a tool handle
        tube(mb, [V((sgn * 0.045, 0.1, 1.32)), V((sgn * 0.08, 0.02, 1.43)), V((sgn * 0.055, -0.06, 1.44)), V((0.0, -0.1, 1.42))], [(0.011, 0.005)] * 4, SZ(4), mat='strap', colfn=lambda p, n, s: (0.9, 0.9, 0.9), hint=(0, 0, 1))
    mb.loft([{'c': (0, 0, 1.1), 'd': (0, 0, 1), 'rx': 0.152, 'ry': 0.112}, {'c': (0, 0, 1.13), 'd': (0, 0, 1), 'rx': 0.15, 'ry': 0.11}], SZ(14), mat='strap', colfn=lambda p, n, s: (0.8, 0.8, 0.8))
    return mb


def hood_and_scarf():
    """Tânia: the hood down on the back (a bunched collar and a drooping bag) and a scarf at the neck with a tail."""
    hood = MB('hood_f')
    hood.default_mat = 'top'
    hood.loft([{'c': (0, -0.01, 1.4), 'd': (0, 0, 1), 'rx': 0.125, 'ry': 0.105}, {'c': (0, -0.02, 1.47), 'd': (0, 0, 1), 'rx': 0.115, 'ry': 0.115, 'k': lambda th: 1 + 0.1 * math.sin(th * 5)},
               {'c': (0, 0.0, 1.52), 'd': (0, 0, 1), 'rx': 0.095, 'ry': 0.09}], SZ(14), mat='top', colfn=shade_z(1.4, 1.55, 0.72, 1.1), arc=(FRONT + 0.8, FRONT + 2 * PI - 0.8))
    hood.sphere((0, -0.115, 1.42), (0.1, 0.07, 0.085), SZ(10), SZ(6), mat='top', colfn=shade_z(1.35, 1.5, 0.7, 1.05))
    hood.sphere((0, -0.125, 1.39), (0.075, 0.05, 0.06), SZ(8), SZ(5), mat='top', col=(0.7, 0.7, 0.68))
    scarf = MB('scarf')
    scarf.default_mat = 'scarf'
    scarf.loft([{'c': (0, 0.006, 1.435), 'd': (0, 0, 1), 'rx': 0.092, 'ry': 0.088, 'k': lambda th: 1 + 0.06 * math.sin(th * 4)}, {'c': (0, 0.01, 1.47), 'd': (0, 0, 1), 'rx': 0.085, 'ry': 0.082, 'k': lambda th: 1 + 0.06 * math.sin(th * 4 + 1)},
                {'c': (0, 0.012, 1.505), 'd': (0, 0, 1), 'rx': 0.08, 'ry': 0.076}], SZ(14), cap0=None, cap1=None, mat='scarf', colfn=shade_z(1.4, 1.52, 0.72, 1.08))
    tube(scarf, [V((0.04, 0.085, 1.44)), V((0.07, 0.12, 1.37)), V((0.075, 0.125, 1.28)), V((0.07, 0.122, 1.2))], [(0.03, 0.01), (0.034, 0.011), (0.036, 0.011), (0.034, 0.01)], SZ(6), mat='scarf', colfn=lambda p, n, s: (0.86, 0.86, 0.84), cap1=0.01, hint=(1, 0, 0))
    return hood, scarf


def cargo_extras():
    """Cargo pockets on the thighs and knee pads (bolted to their bones in person.py)."""
    pk = MB('cargo_m')
    pk.default_mat = 'pants'
    for sgn in (-1, 1):
        pk.box((sgn * 0.168, 0.012, 0.77), (0.04, 0.12, 0.13), mat='pants', col=(0.86, 0.86, 0.84))
        pk.box((sgn * 0.168, 0.012, 0.835), (0.044, 0.125, 0.03), mat='pants', col=(0.74, 0.74, 0.72))
        # knee pads
        pk.sphere((sgn * 0.099, 0.062, 0.505), (0.056, 0.03, 0.07), SZ(10), SZ(6), mat='belt', colfn=lambda p, n, s: (0.8 + 0.2 * n.z, 0.8 + 0.2 * n.z, 0.78 + 0.2 * n.z))
        # a loop for a tool at the thigh
        pk.box((sgn * 0.174, 0.05, 0.9), (0.01, 0.02, 0.1), mat='belt', col=(0.9, 0.9, 0.9))
    return pk


def toolbelt():
    mb = MB('toolbelt')
    mb.default_mat = 'belt'
    mb.loft([{'c': (0, 0, 1.06), 'd': (0, 0, 1), 'rx': 0.17, 'ry': 0.121}, {'c': (0, 0, 1.115), 'd': (0, 0, 1), 'rx': 0.168, 'ry': 0.119}], SZ(14), mat='belt', colfn=lambda p, n, s: (0.9, 0.9, 0.9))
    for x, y, w, h in ((-0.11, 0.1, 0.07, 0.11), (0.115, 0.1, 0.06, 0.09), (-0.185, 0.0, 0.05, 0.12), (0.19, -0.02, 0.05, 0.1)):
        mb.box((x, y, 1.02), (w, 0.04, h), mat='belt', col=(0.82, 0.82, 0.8), rot=Matrix.Rotation(0.2 if x > 0 else -0.2, 3, 'Z'))
    tube(mb, [V((-0.19, -0.02, 1.07)), V((-0.205, -0.02, 0.95)), V((-0.2, -0.02, 0.86))], [(0.011, 0.011)] * 3, SZ(6), mat='metal', colfn=lambda p, n, s: (0.9, 0.9, 0.9), cap1=0.01)   # a hammer
    mb.box((-0.2, -0.02, 0.84), (0.05, 0.02, 0.028), mat='metal', col=(0.7, 0.7, 0.7))
    mb.box((0, 0.122, 1.09), (0.04, 0.008, 0.03), mat='metal', col=(0.85, 0.85, 0.8))
    return mb


def glasses_cord():
    mb = MB('cord')
    mb.default_mat = 'strap'
    for sgn in (-1, 1):
        pts = [V((sgn * 0.106, 0.004, 1.665)), V((sgn * 0.112, -0.03, 1.6)), V((sgn * 0.085, -0.075, 1.5)), V((sgn * 0.075, -0.05, 1.44)), V((sgn * 0.07, 0.06, 1.41)), V((sgn * 0.02, 0.115, 1.37))]
        tube(mb, pts, [(0.0035, 0.0035)] * len(pts), SZ(4), mat='strap', colfn=lambda p, n, s: (0.9, 0.9, 0.9), cap0=0.002, cap1=0.002)
    return mb


def wrinkles():
    """Fine creases: the forehead, the corners of the eyes, the cheeks by the nose (thin dark tubes laid on the skin)."""
    mb = MB('wrinkles')
    mb.default_mat = 'wrinkle'
    import person_face as F
    hz = F.HZ
    lines = []
    for dz in (0.082, 0.095):
        lines.append([(x, dz) for x in (-0.05, -0.025, 0.0, 0.025, 0.05)])
    pts_list = []
    for pts in lines:
        pts_list.append([(x, hz + dz + 0.004 * (x / 0.05) ** 2) for x, dz in pts])
    for sgn in (-1, 1):
        for k, dz in enumerate((0.025, 0.012, 0.0)):
            pts_list.append([(sgn * (0.083 + 0.014 * j), hz + dz - 0.013 * k + 0.006 * j) for j in range(3)])
        pts_list.append([(sgn * (0.03 + 0.008 * j), hz - 0.025 - 0.02 * j) for j in range(4)])
    return mb, pts_list


def boots(sx):
    """A chunky boot: a high shaft, a rounded toe cap, a thick sole."""
    mb = MB('boot')
    mb.default_mat = 'shoe'

    def sec(y, zc, rx, ry):
        return {'c': (sx * 0.095, y, zc), 'd': (0, 1, 0), 'rx': rx, 'ry': ry}
    mb.loft([sec(-0.082, 0.085, 0.046, 0.075), sec(-0.03, 0.095, 0.054, 0.082), sec(0.04, 0.078, 0.062, 0.07), sec(0.11, 0.062, 0.066, 0.056), sec(0.18, 0.05, 0.06, 0.044)], SZ(10), cap0=0.02, cap1=0.055, mat='shoe',
            colfn=shade_z(0.01, 0.16, 0.7, 1.04))
    mb.loft([{'c': (sx * 0.095, -0.012, 0.12), 'd': (0, 0, 1), 'rx': 0.058, 'ry': 0.064}, {'c': (sx * 0.095, -0.012, 0.19), 'd': (0, 0, 1), 'rx': 0.062, 'ry': 0.068}, {'c': (sx * 0.095, -0.012, 0.2), 'd': (0, 0, 1), 'rx': 0.066, 'ry': 0.072}],
            SZ(10), cap0=None, cap1=None, mat='shoe', colfn=shade_z(0.12, 0.2, 0.72, 1.0))
    mb.loft([sec(-0.085, 0.022, 0.05, 0.02), sec(0.0, 0.019, 0.066, 0.022), sec(0.1, 0.017, 0.072, 0.02), sec(0.2, 0.019, 0.064, 0.018)], SZ(8), cap0=0.012, cap1=0.03, mat='sole', colfn=lambda p, n, s: (0.88, 0.88, 0.86))
    return mb
