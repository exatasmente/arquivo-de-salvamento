"""Builds the pieces of the city (vehicles, street lamp, fire escape, water tank, roof fittings) and exports them to
assets/city/*.glb. Run: <blender> -b -P tools/city/build_pieces.py   (no path of this machine is kept: the output is next to the game).
Materials are NAMES (body: the paint of a vehicle, tinted by the game; glass, rubber, chrome, headlight, taillight, plastic, black,
metal, rust, wood, roof, lamp, grate, concrete); every part of a piece is painted into the piece's one atlas, by hand in the manner
of Jonas and of the station's props (painted.py); src/models/city/pieces.js reads the names for what the game changes (the tint, the lights)."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blend_lib import *
import painted

OUT = os.environ.get('CITY_OUT') or os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'city'))   # CITY_OUT: another folder, to try a change
os.makedirs(OUT, exist_ok=True)
P = math.pi


def out(name, objs):
    """One piece: its parts (each with one named material) are painted into one atlas and exported (painted.py)."""
    painted.finish(name, objs, os.path.join(OUT, name + '.glb'))


def wheels(L, front, rear, r=0.34, w=0.24, x=0.83):
    objs = []
    for sx in (-1, 1):
        for y in (-L / 2 + front, L / 2 - rear):
            objs.append(cyl('tire', 'rubber', r, r, w, (x * sx - (w / 2) * sx, y, r), (0, P / 2 * sx, 0), 12))
            objs.append(cyl('hub', 'chrome', r * 0.55, r * 0.55, w + 0.03, (x * sx - (w / 2) * sx, y, r), (0, P / 2 * sx, 0), 10))
    return objs


def lights(L, zf, zr, hw=0.62, wd=0.38):
    o = []
    for sx in (-1, 1):
        o.append(box('hl', 'headlight', (wd, 0.06, 0.15), (sx * hw, -L / 2 + 0.02, zf)))
        o.append(box('tl', 'taillight', (wd * 0.8, 0.06, 0.14), (sx * hw, L / 2 - 0.02, zr)))
        o.append(box('mirror', 'body', (0.2, 0.1, 0.12), (sx * 1.0, -0.55, 1.0)))
    o.append(box('grille', 'black', (0.8, 0.05, 0.14), (0, -L / 2 + 0.01, zf - 0.02)))
    o.append(box('bumper-f', 'plastic', (1.76, 0.2, 0.17), (0, -L / 2 + 0.06, 0.26)))
    o.append(box('bumper-r', 'plastic', (1.76, 0.2, 0.17), (0, L / 2 - 0.06, 0.26)))
    return o


def trap(wb, wt, z0, z1, y):
    """A ring of the greenhouse: a trapezoid, wider at the base (wb) than at the roof (wt), with a rounded top edge."""
    return [(-wb / 2, y, z0), (wb / 2, y, z0), (wt / 2 + 0.04, y, z1 - 0.05), (wt / 2 - 0.05, y, z1), (-wt / 2 + 0.05, y, z1), (-wt / 2 - 0.04, y, z1 - 0.05)]


def lerp(a, b, k):
    return a + (b - a) * k


def cabin(name, st, sides, front=True, rear=True):
    """The greenhouse: a body-coloured loft (flat shaded) with dark glass quads laid on it: the windscreen and rear window on the sloped faces,
    the side windows between the pillars (`sides` = list of (y0, y1) along the car). st = [(y, wb, wt, z0, z1), ...] (4 stations: slope, roof, roof, slope)."""
    objs = [loft(name, 'body', [trap(s[1], s[2], s[3], s[4], s[0]) for s in st], False, 0)]
    def glass_poly(pts, off):
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        bm.faces.new(vs)
        bm.faces.new([bm.verts.new(p) for p in pts[::-1]])  # both ways: the quad is seen from outside whichever side its winding faces
        ob = make('glass', bm, 'glass', False)
        return ob
    inset = 0.09
    if front:  # windscreen on the face between stations 0 and 1 (its upper edge on the roof line)
        y0, wb0, wt0, z00, z10 = st[0]; y1, wb1, wt1, z01, z11 = st[1]
        a0, a1 = 0.12, 0.88
        P = lambda k, sx: (sx * lerp(wt0, wt1, k) / 2 * (1 - inset * 1.4), lerp(y0, y1, k), lerp(z10, z11, k) - 0.02 * 0)
        objs.append(glass_poly([P(a0, -1), P(a0, 1), P(a1, 1), P(a1, -1)], 0))
    if rear:
        y2, wb2, wt2, z02, z12 = st[2]; y3, wb3, wt3, z03, z13 = st[3]
        P = lambda k, sx: (sx * lerp(wt2, wt3, k) / 2 * (1 - inset * 1.4), lerp(y2, y3, k), lerp(z12, z13, k))
        objs.append(glass_poly([P(0.12, 1), P(0.12, -1), P(0.88, -1), P(0.88, 1)], 0))
    for sx in (-1, 1):
        for (ya, yb) in sides:
            def side(y, sv):  # a point on the side face of the greenhouse at y, sv in 0..1 up the face
                # the width at y between stations 1 and 2 is constant; use station 1 (the flat part)
                _, wb, wt, z0, z1 = st[1]
                return (sx * (lerp(wb / 2, wt / 2 + 0.04, sv) + 0.012), y, lerp(z0, z1 - 0.05, sv))
            pts = [side(ya, 0.2), side(yb, 0.2), side(yb, 0.86), side(ya, 0.86)]
            if sx > 0:
                pts = pts[::-1]
            objs.append(glass_poly(pts, 0))
    return objs


def car(L, lower, cab, sides, wheelf, wheelr, lightsz, cargo=None, front=True, rear=True, W=1.8):
    body = loft('body', 'body', lower, True, 1)
    parts = [body, *cabin('cab', cab, sides, front, rear), *wheels(L, wheelf, wheelr), *lights(L, *lightsz)]
    if cargo:
        parts += cargo
    return parts


def sedan():
    L = 4.2
    lower = [rrect(1.5, 0.32, 0.6, -2.1, .1), rrect(1.72, 0.28, 0.7, -1.9), rrect(1.82, 0.26, 0.8, -0.9), rrect(1.82, 0.26, 0.82, 0.7), rrect(1.8, 0.28, 0.86, 1.8), rrect(1.6, 0.32, 0.76, 2.1, .1)]
    cab = [(-0.95, 1.56, 1.42, 0.74, 0.84), (-0.2, 1.62, 1.36, 0.74, 1.32), (1.0, 1.62, 1.36, 0.74, 1.32), (1.7, 1.56, 1.40, 0.74, 0.9)]
    out('car_sedan', car(L, lower, cab, [(-0.15, 0.4), (0.5, 0.95)], 0.85, 0.9, (0.55, 0.62)))


def van():
    L = 4.6
    lower = [rrect(1.5, 0.32, 0.62, -2.3, .1), rrect(1.74, 0.28, 0.78, -2.1), rrect(1.82, 0.26, 0.92, -1.3), rrect(1.82, 0.26, 1.0, 0.0), rrect(1.82, 0.26, 1.0, 2.2), rrect(1.7, 0.3, 0.9, 2.3, .1)]
    cab = [(-1.55, 1.7, 1.5, 0.84, 0.98), (-0.75, 1.76, 1.56, 0.84, 1.68), (2.2, 1.76, 1.56, 0.84, 1.7), (2.3, 1.7, 1.5, 0.84, 1.55)]
    out('car_van', car(L, lower, cab, [(-0.7, 0.45), (0.65, 1.6)], 0.9, 0.9, (0.6, 0.7), rear=False))


def furgao():
    L = 5.0
    lower = [rrect(1.5, 0.32, 0.62, -2.5, .1), rrect(1.76, 0.28, 0.8, -2.3), rrect(1.84, 0.26, 0.95, -1.2), rrect(1.84, 0.26, 1.0, -0.9), rrect(1.84, 0.26, 1.0, 2.5, .08)]
    cab = [(-1.75, 1.7, 1.5, 0.84, 0.98), (-0.95, 1.76, 1.56, 0.84, 1.62), (-0.25, 1.76, 1.56, 0.84, 1.62), (-0.2, 1.7, 1.5, 0.84, 1.55)]
    cargo = [box('cargo', 'body', (1.86, 2.8, 1.55), (0, 1.15, 0.9), bevel=0.07), box('seam', 'plastic', (1.9, 0.03, 1.2), (0, 2.56, 0.95)), box('seam2', 'plastic', (0.03, 0.03, 1.2), (0, 2.57, 0.95))]
    out('car_furgao', car(L, lower, cab, [(-0.85, -0.3)], 0.9, 0.9, (0.6, 0.7), cargo, rear=False))


def lamp_pole():
    # a unit-height pole: the game scales it in height. Thin base plate and collar are separate pieces in lamp_head? no: the game keeps them here
    pole = cyl('pole', 'metal', 0.12, 0.07, 1.0, (0, 0, 0), seg=10)
    return pole


def lamp():
    # the pole alone, unit height (the game scales it in height and puts the base plate under it)
    out('lamp_pole', [cyl('pole', 'metal', 0.12, 0.07, 1.0, seg=10)])
    # the arm: a quarter arc from the top of the pole toward -Y (+Z in the game), the head hangs at its end; origin = the top of the pole minus 1 m
    arm = []
    R, n = 1.1, 7
    pts = [(0, -R * (1 - math.cos(i * P / 2 / n)), R * math.sin(i * P / 2 / n)) for i in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        arm.append(tube('arm', 'metal', a, b, 0.045, 6))
    head = [box('head', 'metal', (0.36, 0.78, 0.16), (0, -R - 0.55, R - 0.14), bevel=0.05, smooth=False), box('glass', 'lamp', (0.3, 0.66, 0.03), (0, -R - 0.55, R - 0.165)),
            box('cap', 'black', (0.2, 0.3, 0.06), (0, -R - 0.2, R + 0.02), bevel=0.02)]
    out('lamp_head', arm + head)


def fire_escape():
    # one floor of a fire escape (3.2 m): the landing at the foot (2.4 wide, 1.0 out, toward -Y = the street), its rail, and the stair that climbs to the next landing
    o = []
    W, D = 2.4, 1.0
    o.append(box('deck', 'grate', (W, D, 0.05), (0, -D / 2, -0.05)))
    for x in (-W / 2, W / 2):
        o.append(box('edge', 'metal', (0.05, D, 0.1), (x, -D / 2, -0.1)))
    o.append(box('edgef', 'metal', (W, 0.05, 0.1), (0, -D, -0.1)))
    # railing: posts and two rails on the front and on the two ends
    for x in [-W / 2 + 0.03 + i * (W - 0.06) / 4 for i in range(5)]:
        o.append(box('post', 'metal', (0.04, 0.04, 1.0), (x, -D + 0.03, 0)))
    for z in (0.5, 1.0):
        o.append(box('rail', 'metal', (W, 0.04, 0.04), (0, -D + 0.03, z)))
    for sx in (-1, 1):
        for z in (0.5, 1.0):
            o.append(box('rail', 'metal', (0.04, D, 0.04), (sx * (W / 2 - 0.02), -D / 2, z)))
        o.append(box('post', 'metal', (0.04, 0.04, 1.0), (sx * (W / 2 - 0.02), -0.02, 0)))
    # the stair: from the landing's back-left corner up to z = 3.2 at the back-right, stringers and steps (it climbs along the wall)
    H = 3.2
    n = 13
    x0, x1 = -W / 2 + 0.25, W / 2 - 0.25
    for s in (-0.18, 0.18):
        o.append(tube('stringer', 'metal', (x0, -0.15 + s * 0, 0.0), (x1, -0.15 + s * 0, H), 0.025, 4)) if False else None
    for yy in (-0.28, -0.62):
        o.append(tube('stringer', 'metal', (x0, yy, 0.0), (x1, yy, H), 0.03, 5))
    for i in range(n):
        t = (i + 0.5) / n
        o.append(box('step', 'grate', (0.26, 0.5, 0.03), (x0 + (x1 - x0) * t - 0.13, -0.45, H * t)))
    # a rail along the stair
    o.append(tube('srail', 'metal', (x0, -0.66, 0.95), (x1, -0.66, H + 0.95), 0.025, 5))
    out('fire_escape', o)
    # the drop ladder
    l = [tube('s', 'metal', (sx * 0.22, 0, 0), (sx * 0.22, 0, 2.4), 0.025, 5) for sx in (-1, 1)]
    l += [tube('r', 'metal', (-0.22, 0, 0.2 + i * 0.3), (0.22, 0, 0.2 + i * 0.3), 0.02, 4) for i in range(8)]
    out('fire_ladder', l)


def tank():
    o = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(tube('leg', 'metal', (sx * 1.0, sy * 1.0, 0), (sx * 0.95, sy * 0.95, 1.6), 0.07, 5))
    for z in (0.5, 1.1):
        for a, b in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            o.append(tube('brace', 'metal', (a[0] * 1.0, a[1] * 1.0, z), (b[0] * 1.0, b[1] * 1.0, z), 0.035, 4))
    o.append(box('deck', 'wood', (2.3, 2.3, 0.1), (0, 0, 1.6)))
    o.append(cyl('barrel', 'wood', 1.15, 1.15, 2.0, (0, 0, 1.7), seg=18))
    for z in (0.3, 1.0, 1.7):
        o.append(cyl('hoop', 'rust', 1.18, 1.18, 0.07, (0, 0, 1.7 + z), seg=18))
    o.append(cyl('roof', 'roof', 1.3, 0.05, 0.75, (0, 0, 3.7), seg=18))
    o.append(tube('ladder', 'metal', (1.2, 0.3, 0), (1.2, 0.3, 3.2), 0.03, 4))
    o.append(tube('ladder', 'metal', (1.2, -0.3, 0), (1.2, -0.3, 3.2), 0.03, 4))
    o += [tube('rung', 'metal', (1.2, -0.3, 0.3 + i * 0.35), (1.2, 0.3, 0.3 + i * 0.35), 0.02, 4) for i in range(9)]
    out('roof_tank', o)


def fittings():
    o = [box('unit', 'metal', (0.95, 0.55, 0.7), (0, 0, 0.12), bevel=0.03), cyl('fan', 'black', 0.26, 0.26, 0.04, (0, -0.28, 0.47), (P / 2, 0, 0), 12),
         box('foot', 'rust', (0.9, 0.5, 0.12), (0, 0, 0))]
    out('roof_ac', o)
    v = [cyl('stack', 'metal', 0.18, 0.18, 1.2, seg=10), cyl('cap', 'metal', 0.3, 0.02, 0.3, (0, 0, 1.2), seg=10)]
    out('roof_vent', v)
    a = [tube('mast', 'metal', (0, 0, 0), (0, 0, 3.6), 0.03, 5)]
    for i, (z, L) in enumerate([(3.4, 1.0), (3.0, 0.9), (2.6, 0.8), (2.2, 0.7), (1.8, 0.6)]):
        a.append(tube('arm', 'metal', (-L / 2, 0, z), (L / 2, 0, z), 0.015, 4))
    a.append(tube('boom', 'metal', (0, -0.5, 3.4), (0, 0.5, 3.4), 0.015, 4))
    out('roof_antenna', a)
    # a dish
    d = [cyl('dish', 'metal', 0.05, 0.4, 0.2, (0, 0, 0.5), (0, 0, 0), 14), tube('post', 'metal', (0, 0, 0), (0, 0, 0.6), 0.03, 5)]
    out('roof_dish', d)


def street():
    out('trash_bin', [cyl('bin', 'metal', 0.22, 0.26, 0.8, seg=10), cyl('lid', 'black', 0.28, 0.28, 0.05, (0, 0, 0.8), seg=10), cyl('band', 'rust', 0.265, 0.265, 0.05, (0, 0, 0.45), seg=10)])
    # a bench: two legs, a slatted seat and back
    b = []
    for sx in (-1, 1):
        b.append(box('leg', 'metal', (0.06, 0.45, 0.45), (sx * 0.8, 0, 0)))
        b.append(box('arm', 'metal', (0.06, 0.45, 0.06), (sx * 0.8, 0, 0.6)))
    for i in range(4):
        b.append(box('slat', 'wood', (1.8, 0.09, 0.04), (0, -0.18 + i * 0.12, 0.45)))
    for i in range(3):
        b.append(box('back', 'wood', (1.8, 0.04, 0.12), (0, 0.22, 0.6 + i * 0.16), rot=(-0.15, 0, 0)))
    out('bench', b)
    out('bollard', [cyl('b', 'concrete', 0.12, 0.1, 0.8, seg=10), cyl('cap', 'metal', 0.11, 0.0, 0.08, (0, 0, 0.8), seg=10)])


if __name__ == '__main__':
    reset()
    sedan(); van(); furgao(); lamp(); fire_escape(); tank(); fittings(); street()
