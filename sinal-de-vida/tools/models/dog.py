"""The fleet dog of Sinal de Vida (D6 of the design, as the person changed it on 2026-11-17), built from nothing by script, with a
skeleton, its animations and a texture painted by hand in the manner of Jonas.

    "$BLENDER" --background --factory-startup --python tools/models/dog.py -- --out assets/models

Writes <out>/dog.glb. A four-legged machine of the family of the real quadrupeds, and none of them: no wheels, four legs with a
knee each (the front knees point forward, the hind ones back) on a ball of rubber; a hull with a deep chest and a tucked waist,
and NO head: a block of sensors nested low at the front, on a short yoke, with the band of state light round it (the material
`sensor`: its colour is the game's). Worn industrial metal in the fleet's faded colours (grey and a dull ochre), plates, bolts,
joints and rubber. The empty cargo cradle stays on its back, with the fleet's pictogram on its floor (a road line that ends in a
dot). No arm in front, no blade, no face, no lens that reads as an eye, nothing red, nothing copied from a product or a show.

The paint (metal.py does the atlas, this file the painting): shadow painted where pieces meet and under what overhangs, the
edges worn pale, chipped paint, seams and bolts drawn, dirt, strong contrast of value, a light painted from above. No picture
and no image model: every texel is computed.

  materials  hull ochre dark rubber steel (all five show the one painted atlas) sensor (the band: no texture)
  objects    dog (everything but) sensor_band antenna_a antenna_b (two short aerials on the block of sensors)
  bones      root body neck sensor  leg_{FL,FR,BL,BR}_up / _low / wheel_{FL,FR,BL,BR} (the feet: the name is the old contract's)
  clips      parado andar rolar (a bounding gallop: the name is the old contract's) virar_sensor farejar buscar correr_caca
             derrubar (no claw: it leaps and shoves with the chest and the front legs) desligado (the legs give way)
             sensor_yaw (the block turns -2.4..2.4 rad across its length: the game picks the moment) wheel_spin (nothing turns
             any more: a still clip, kept because the game asks for it)
  uv         TEXCOORD_0 is the old contract's shade into the game's ramp (so the game as it is shows the new shape in flat fleet
             colours); TEXCOORD_1 is the atlas of the painted texture (the materials' base colour texture points at it).
  _outline   per vertex, how much of the game's outline it takes (the band none, the thin pieces less).
Faces +Y here, which is -Z in three.js. The feet are planted by a two-bone solution, so a step lands where it is told.
Debug: DOG_QUICK=<px> (the atlas's size), DOG_DUMP=<folder> (saves the atlas as PNG), DOG_NOSKY=1 (skips the occlusion)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
import metal as M  # noqa: E402
from metal import smooth, mix, fbm, vnoise  # noqa: E402
from person_anim import Pose, Rig, key_pose_clip, ease  # noqa: E402

V = Vector
X, Y, Z = V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))
HZ = 0.54                       # the hips' height, and the body bone's
FOOT_R = 0.046
NECK = V((0, 0.462, 0.598))     # the hinge of the tray the block of sensors sits on, at the front edge of the foredeck
TUR = V((0, 0.40, 0.0))         # the block of sensors turns about this vertical
TZ0, TZ1 = 0.622, 0.716         # the block's underside and top
BZ0, BZ1 = 0.662, 0.688         # the band of light
LEGS = (('FR', 1, 1), ('FL', -1, 1), ('BR', 1, -1), ('BL', -1, -1))   # name, side, end (+1 front)
FPS = 30
TEX = int(os.environ.get('DOG_QUICK', 1024))
MATS = ('hull', 'ochre', 'dark', 'rubber', 'steel', 'sensor')


def leg_points(sx, f):
    """Hip, knee and the centre of the foot's ball. The whole leg lies in a plane across X."""
    x = sx * 0.205
    yh = 0.25 if f > 0 else -0.29
    hip = V((x, yh, HZ))
    knee = hip + V((0, f * 0.19, -0.25))
    foot = V((x, yh + f * 0.03, FOOT_R - 0.001))
    return hip, knee, foot


def skeleton():
    sp = []
    add = lambda n, p, h, t, hint=(1, 0, 0): sp.append((n, p, tuple(h), tuple(t), hint))
    add('root', None, (0, 0, 0), (0, 0, 0.1))
    add('body', 'root', (0, 0, HZ), (0, 0, HZ + 0.1))
    add('neck', 'body', NECK, NECK + V((0, 0.1, 0)), (1, 0, 0))
    add('sensor', 'neck', (TUR.x, TUR.y, 0.61), (TUR.x, TUR.y, 0.71), (1, 0, 0))
    for n, sx, f in LEGS:
        hip, knee, foot = leg_points(sx, f)
        add(f'leg_{n}_up', 'body', hip, knee)
        add(f'leg_{n}_low', f'leg_{n}_up', knee, foot)
        add(f'wheel_{n}', f'leg_{n}_low', foot, foot + V((sx * 0.06, 0, 0)), (0, 1, 0))
    return sp


# ---------------------------------------------------------------------------------------------------------------------
# the shape

BODY = [  # y, half width, top, bottom, where the flank turns into the keel, half width of the keel
    (-0.465, 0.095, 0.655, 0.520, 0.560, 0.055),
    (-0.435, 0.135, 0.685, 0.490, 0.535, 0.080),
    (-0.300, 0.155, 0.685, 0.470, 0.520, 0.090),      # the hips
    (-0.080, 0.130, 0.685, 0.525, 0.560, 0.065),      # the waist, tucked up
    (0.140, 0.160, 0.685, 0.400, 0.500, 0.055),       # the chest, deep
    (0.235, 0.165, 0.685, 0.385, 0.495, 0.055),
    (0.262, 0.165, 0.600, 0.385, 0.495, 0.055),       # a step down: the foredeck, where the block of sensors sits
    (0.440, 0.150, 0.585, 0.420, 0.505, 0.050),
    (0.470, 0.120, 0.560, 0.455, 0.520, 0.035),
]
# the shield over a hip, in its own plane (along the hull toward the leg's end, up): flat on top, drawn to a point below
SHIELD = ((-0.078, 0.078), (0.078, 0.078), (0.097, 0.056), (0.097, -0.012), (0.036, -0.092), (-0.036, -0.092), (-0.097, -0.012), (-0.097, 0.056))
SHIELD_Z = 0.022
BODY_CT = 0.03                  # the chamfer along the top


def body_ring(y, hw, zt, zb, zl, kw):
    ct = BODY_CT
    return [V((hw - ct, y, zt)), V((hw, y, zt - ct)), V((hw, y, zl)), V((kw, y, zb)), V((-kw, y, zb)), V((-hw, y, zl)), V((-hw, y, zt - ct)), V((-(hw - ct), y, zt))]


def body_hw(y):
    """Half width of the hull at y (the flank's x), between the sections."""
    for a, b in zip(BODY, BODY[1:]):
        if y <= b[0] or b is BODY[-1]:
            t = max(0.0, min(1.0, (y - a[0]) / (b[0] - a[0])))
            return a[1] + (b[1] - a[1]) * t


def build_shape():
    k = M.Kit()
    # ---- the hull: a deep chest, a tucked waist, the hips; a floor, rails and posts for the box it no longer carries
    k.piece('body', 'body')
    k.loft([body_ring(*s) for s in BODY], 'hull')
    k.piece('floor', 'body')
    k.box((0, -0.12, 0.689), (0.20, 0.50, 0.012), 0.003, 'dark')
    for sx in (-1, 1):
        k.piece('rail', 'body')
        k.box((sx * 0.104, -0.12, 0.708), (0.022, 0.50, 0.04), 0.006, 'steel')
    for yy in (-0.37, 0.13):
        k.piece('rail', 'body')
        k.box((0, yy, 0.702), (0.20, 0.022, 0.028), 0.006, 'steel')
    for sx in (-1, 1):
        for yy in (-0.37, 0.13):
            k.piece('post', 'body')
            k.box((sx * 0.104, yy, 0.722), (0.034, 0.034, 0.066), 0.007, 'ochre')
    k.piece('rear_box', 'body')
    k.box((0, -0.452, 0.60), (0.15, 0.055, 0.085), 0.01, 'dark')
    k.piece('skid', 'body')
    k.box((0, 0.2, 0.39), (0.10, 0.22, 0.022), 0.007, 'steel')
    for n, sx, f in LEGS:
        hip, knee, foot = leg_points(sx, f)
        k.piece(f'saddle_{n}', 'body')
        k.box((sx * 0.156, hip.y, HZ + 0.005), (0.056, 0.17, 0.15), 0.014, 'hull')
        # a shield of ochre over each hip, on an arm from the saddle: the joint works behind it
        k.piece(f'arm_{n}', 'body')
        k.box((sx * 0.215, hip.y, HZ + 0.088), (0.11, 0.05, 0.018), 0.006, 'steel')
        k.piece(f'shield_{n}', 'body')
        rings = []
        for xo, sc in ((0.258, 0.93), (0.2615, 1.0), (0.2705, 1.0), (0.274, 0.93)):
            rings.append([V((sx * xo, hip.y + f * a * sc, HZ + SHIELD_Z + b * sc)) for a, b in SHIELD])
        k.loft(rings, 'ochre')
    # ---- the tray (the bone `neck`): hinged at the front edge of the foredeck, it tips the block of sensors toward the ground
    k.piece('yoke_hinge', 'neck')
    k.drum(NECK, X, 0.02, 0.085, 10, 'dark', cap='steel', ch=0.005)
    k.piece('yoke', 'neck')
    k.box((0, 0.405, 0.603), (0.13, 0.135, 0.014), 0.005, 'steel')
    k.piece('pedestal', 'neck')
    k.lathe((TUR.x, TUR.y, 0.606), Z, [(0.0, 0.066), (0.004, 0.072), (0.014, 0.072), (0.018, 0.066)], 12, 'dark', ref=X)
    # ---- the block of sensors (the bone `sensor`): a low, wide bar with cut corners, the band of light round it, two short
    # aerials. It rides no higher than the rails of the cradle: the machine has no head
    c = lambda z: (TUR.x, TUR.y, z)
    k.piece('turret', 'sensor')
    k.loft([k.rect8(c(TZ0), X, Y, 0.13, 0.076, 0.036), k.rect8(c(TZ0 + 0.01), X, Y, 0.14, 0.086, 0.04), k.rect8(c(TZ1 - 0.01), X, Y, 0.14, 0.086, 0.04),
            k.rect8(c(TZ1), X, Y, 0.13, 0.076, 0.036)], 'hull')
    k.piece('band', 'sensor', 'sensor_band')
    k.loft([k.rect8(c(BZ0 - 0.004), X, Y, 0.1395, 0.0855, 0.04), k.rect8(c(BZ0), X, Y, 0.1455, 0.0915, 0.0425), k.rect8(c(BZ1), X, Y, 0.1455, 0.0915, 0.0425),
            k.rect8(c(BZ1 + 0.004), X, Y, 0.1395, 0.0855, 0.04)], 'sensor', cap0=False, cap1=False)
    k.piece('turret_back', 'sensor')
    k.box((TUR.x, TUR.y - 0.083, 0.5 * (BZ0 + BZ1)), (0.16, 0.03, 0.05), 0.008, 'dark')
    k.piece('turret_cap', 'sensor')
    k.box((TUR.x, TUR.y + 0.004, TZ1 + 0.004), (0.15, 0.09, 0.012), 0.004, 'ochre')
    for name, base, axis, h in (('antenna_a', V((-0.085, TUR.y - 0.045, TZ1 - 0.002)), V((-0.14, -0.2, 1)), 0.125), ('antenna_b', V((0.09, TUR.y - 0.05, TZ1 - 0.002)), V((0.12, -0.12, 1)), 0.08)):
        k.piece(name, 'sensor', name)
        k.lathe(base, axis, [(0.0, 0.013), (0.012, 0.013), (0.017, 0.0065), (h, 0.0045), (h + 0.004, 0.009), (h + 0.016, 0.009), (h + 0.02, 0.004)], 6, 'dark')
    # ---- the legs
    for n, sx, f in LEGS:
        hip, knee, foot = leg_points(sx, f)
        up, low, wh = f'leg_{n}_up', f'leg_{n}_low', f'wheel_{n}'
        w1 = (knee - hip).normalized()
        o1 = w1.cross(X)
        if o1.y * f > 0:
            o1 = -o1                       # the thigh's back (away from where the knee points)
        k.piece(f'hip_{n}', up)
        k.drum(hip, X, 0.072, 0.043, 14, 'dark')
        k.piece(f'hipcap_{n}', up)
        k.drum(hip + X * sx * 0.047, X, 0.05, 0.007, 14, 'steel', ch=0.004)
        k.piece(f'thigh_{n}', up)
        k.beam(hip, knee, X, (0.031, 0.052), (0.028, 0.04), 0.011, 'hull')
        k.piece(f'ram_{n}', up)            # the ram along the back of the thigh: its barrel, its rod
        a0, a1, a2 = hip + w1 * 0.035 + o1 * 0.066, hip + w1 * 0.175 + o1 * 0.066, knee - w1 * 0.035 + o1 * 0.05
        k.lathe(a0, a1 - a0, [(0.0, 0.014), (0.006, 0.021), ((a1 - a0).length - 0.006, 0.021), ((a1 - a0).length, 0.014)], 8, 'dark', ref=X)
        k.piece(f'rod_{n}', up)
        k.lathe(a1 - w1 * 0.01, a2 - a1, [(0.0, 0.009), ((a2 - a1).length, 0.009), ((a2 - a1).length + 0.004, 0.015), ((a2 - a1).length + 0.03, 0.015)], 6, 'steel', ref=X)
        k.piece(f'knee_{n}', up)
        k.drum(knee, X, 0.05, 0.041, 12, 'dark', cap='steel')
        ank = foot + (knee - foot).normalized() * 0.05
        w2 = (ank - knee).normalized()
        o2 = w2.cross(X)
        if o2.y * f < 0:
            o2 = -o2                       # the shin's front
        k.piece(f'shin_{n}', low)
        k.beam(knee, ank, X, (0.026, 0.04), (0.021, 0.025), 0.009, 'hull')
        k.piece(f'guard_{n}', low)
        k.beam(knee + w2 * 0.055 + o2 * 0.04, knee + w2 * 0.205 + o2 * 0.03, X, (0.034, 0.01), (0.029, 0.009), 0.005, 'ochre')
        ax = (knee - foot).normalized()
        k.piece(f'foot_{n}', wh)
        k.lathe(foot, ax, [(-0.046, 0.014), (-0.040, 0.026), (-0.026, 0.039), (-0.008, 0.046), (0.012, 0.045), (0.028, 0.036), (0.04, 0.026)], 10, 'rubber', ref=X)
        k.piece(f'ankle_{n}', wh)
        k.drum(foot + ax * 0.05, ax, 0.03, 0.015, 10, 'steel', ch=0.005, ref=X)
    k.analyse()
    body = next(i for i, p in enumerate(k.pieces) if p[0] == 'body')
    for fi, f in enumerate(k.f):          # the foredeck is ochre
        if k.fpiece[fi] == body and k.fn[fi][2] > 0.3 and sum(k.v[i][1] for i in f) / len(f) > 0.27:
            k.fmat[fi] = 'ochre'
    return k


# ---------------------------------------------------------------------------------------------------------------------
# the paint

PAL = {'hull': (0.42, 0.43, 0.405), 'ochre': (0.47, 0.365, 0.175), 'dark': (0.155, 0.155, 0.165), 'rubber': (0.115, 0.11, 0.105), 'steel': (0.47, 0.49, 0.50),
       'sensor': (0.5, 0.4, 0.2)}
BARE = np.array((0.74, 0.73, 0.69))        # metal rubbed bright
PRIMER = np.array((0.25, 0.175, 0.115))    # what shows where the paint has gone: a brown primer
DIRT = np.array((0.185, 0.145, 0.10))
DUST = np.array((0.52, 0.46, 0.36))
INK = np.array((0.05, 0.045, 0.042))
PALE = np.array((0.66, 0.62, 0.50))        # the stencilled marks: a faded cream
GLASS = np.array((0.045, 0.06, 0.075))
LIGHT = np.array((-0.38, 0.30, 0.875)) / np.linalg.norm((-0.38, 0.30, 0.875))


def paint(R, kit):
    """The colour of every texel of the atlas (an array (texels, 3))."""
    P, N = R.P, R.N
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    nx, ny, nz = N[:, 0], N[:, 1], N[:, 2]
    m = len(x)
    names = [p[0] for p in kit.pieces]
    pid = {}
    for i, nme in enumerate(names):
        pid.setdefault(nme, []).append(i)

    def is_piece(*prefixes):
        ids = [i for i, nme in enumerate(names) if any(nme == s or nme.startswith(s) for s in prefixes)]
        return np.isin(R.piece, ids)

    mat_i = {nme: i for i, nme in enumerate(R.mats)}
    is_mat = lambda *ms: np.isin(R.mat, [mat_i[q] for q in ms])
    col = np.array([PAL[q] for q in R.mats])[R.mat].astype(np.float64)
    coat = is_mat('hull', 'ochre').astype(np.float64)          # where there is paint to chip
    lines = np.zeros(m)                                        # ink drawn over everything at the end
    lips = np.zeros(m)                                         # the lit lip beside a line
    de, dc = R.de, R.dc
    clean = np.zeros(m)                                        # where the road's dirt is held back (the rubber shows its own wear)

    n_big = fbm(P, 4.0, 3, 1)
    n_mid = fbm(P, 13.0, 3, 2)
    n_fine = fbm(P, 46.0, 2, 3)
    n_chip = fbm(P, 34.0, 3, 4)
    n_grain = vnoise(x * 240.0, y * 240.0, z * 240.0, 5)

    # ---- marks painted over the grey ---------------------------------------------------------------------------------
    body = is_piece('body')
    flank = body & (np.abs(nx) > 0.6)
    # a slanted ochre band and a thin one beside it, between the shoulders and the hips
    t = y - 0.5 * (z - 0.56)
    band = flank * smooth(0.030, 0.033, t) * smooth(0.088, 0.085, t)
    band = np.maximum(band, flank * smooth(0.100, 0.103, t) * smooth(0.116, 0.113, t))
    col = mix(col, PAL['ochre'], band)
    # the fleet's pictogram, small, above the hind hip: a road line that narrows and ends in a dot
    u = np.clip((y + 0.40) / 0.17, 0, 1)
    road = flank * smooth(-0.405, -0.40, y) * smooth(-0.228, -0.232, y) * smooth(0.0135 - 0.008 * u, 0.0115 - 0.008 * u, np.abs(z - 0.648))
    road = np.maximum(road, flank * smooth(0.0125, 0.0105, np.hypot(y + 0.205, z - 0.648)))
    col = mix(col, PALE, road * 0.9)
    # three tally bars on the yoke's side and the turret's upper edge: a unit's mark without a letter
    tur = is_piece('turret')
    tside = tur & (np.abs(nx) > 0.7)
    bars = np.zeros(m)
    for k_ in range(3):
        bars = np.maximum(bars, smooth(0.0046, 0.0034, np.abs(y - (TUR.y - 0.02 + 0.014 * k_))) * smooth(0.0085, 0.007, np.abs(z - (BZ1 + 0.014))))
    col = mix(col, PALE, tside * bars * 0.85)
    # the cradle's floor: the same pictogram, large, along the back
    floor = is_piece('floor') & (nz > 0.7)
    col[floor] = np.array((0.20, 0.20, 0.205)) * (0.85 + 0.3 * n_mid[floor])[:, None]
    u = np.clip((y + 0.33) / 0.27, 0, 1)
    road = smooth(-0.335, -0.33, y) * smooth(-0.056, -0.062, y) * smooth(0.052 - 0.038 * u, 0.049 - 0.038 * u, np.abs(x))
    road = np.maximum(road, smooth(0.026, 0.023, np.hypot(x, y - 0.012)))
    col = mix(col, PAL['ochre'], floor * road * 0.92)
    coat = np.maximum(coat, floor * road)
    # the floor is scored along its length by the boxes that slid on it
    score = smooth(0.62, 0.8, vnoise(x * 190.0, y * 6.0, z * 3.0, 11))
    col = mix(col, BARE * 0.62, floor * score * 0.5 * (1 - 0.6 * road))

    # ---- the paint itself: faded in large patches, a warm and a cool drift --------------------------------------------
    painted = np.maximum(coat, band)
    col *= (0.86 + 0.28 * n_big)[:, None]
    warm = smooth(0.45, 0.75, fbm(P, 6.5, 2, 7))
    col = mix(col, col * np.array((1.07, 1.0, 0.88)), warm * 0.8)
    col = mix(col, col * np.array((0.9, 0.98, 1.06)), smooth(0.55, 0.8, 1 - n_mid) * 0.6 * is_mat('hull'))
    sun = smooth(0.35, 0.75, fbm(P, 8.0, 3, 21))               # the ochre bleached by the sun in patches
    col = mix(col, np.array((0.50, 0.45, 0.33)), sun * 0.45 * np.maximum(is_mat('ochre'), band))
    # steel is brushed, the joints are cast: each its own grain
    brushed = vnoise(x * 30.0, y * 30.0, z * 330.0, 8)
    col *= (1 + is_mat('steel') * 0.22 * (brushed - 0.5))[:, None]
    col *= (1 + is_mat('dark') * 0.4 * (n_fine - 0.5) + is_mat('rubber') * 0.2 * (n_fine - 0.5))[:, None]

    # ---- the paint chipped: most along the convex edges and low down; primer at the rim of a chip, bright metal inside --
    edge = np.exp(-de / 0.011)
    low = smooth(0.42, 0.08, z)
    thr = 0.76 - 0.40 * edge - 0.07 * low - 0.04 * is_mat('ochre') - 0.05 * band
    chip = smooth(thr, thr + 0.03, n_chip) * painted
    core = smooth(thr + 0.045, thr + 0.085, n_chip) * painted
    col = mix(col, PRIMER * (0.8 + 0.5 * n_mid)[:, None], chip)
    col = mix(col, BARE * (0.6 + 0.4 * n_fine)[:, None], core * 0.9)
    # long scratches along the flanks and the legs
    scr = smooth(0.80, 0.86, vnoise(x * 9.0, y * 11.0 + z * 4.0, z * 260.0 - y * 60.0, 12)) * smooth(0.35, 0.6, n_mid)
    col = mix(col, BARE * 0.8, scr * 0.55 * is_mat('hull', 'ochre'))

    # ---- what is drawn on each piece: seams, hatches, slits, bolts, windows ----------------------------------------------
    def seam(mask, d, w=0.0024, lip=1.0):
        nonlocal lines, lips
        a = np.abs(d)
        lines = np.maximum(lines, mask * (1 - smooth(w * 0.45, w, a)))
        lips = np.maximum(lips, mask * lip * smooth(w * 0.9, w * 1.5, d) * (1 - smooth(w * 1.8, w * 3.4, d)))

    def bolts(mask, a, b, centres, r, light=(-0.45, 0.9), tone=0.62):
        """Bolt heads drawn in the plane (a, b): a dark ring, a head lit from `light`, a slot."""
        nonlocal col
        for i, (ca, cb) in enumerate(centres):
            da, db = a - ca, b - cb
            d = np.hypot(da, db)
            sel = mask & (d < r * 1.9)
            if not sel.any():
                continue
            ds, das, dbs = d[sel], da[sel], db[sel]
            lit = (das * light[0] + dbs * light[1]) / r
            head = BARE[None, :] * (tone * (0.72 + 0.42 * np.clip(lit, -1, 1)))[:, None]
            ang = 6.283 * ((i * 0.618 + ca * 13.7 + cb * 7.1) % 1.0)
            slot = 1 - smooth(0.1 * r, 0.24 * r, np.abs(das * math.sin(ang) - dbs * math.cos(ang)))
            head = mix(head, INK, slot * 0.85)
            c = col[sel]
            shadow = (1 - smooth(r * 1.0, r * 1.9, ds)) * (0.45 + 0.4 * np.clip(-lit / 1.6, 0, 1))      # deeper on the side away from the light
            c = mix(c, INK, shadow)
            c = mix(c, head, 1 - smooth(r * 0.82, r * 1.0, ds))
            col[sel] = c

    def rrect(a, b, ca, cb, ha, hb, rad):
        """Signed distance to a rounded rectangle in the plane (a, b)."""
        qa, qb = np.abs(a - ca) - (ha - rad), np.abs(b - cb) - (hb - rad)
        return np.hypot(np.maximum(qa, 0), np.maximum(qb, 0)) + np.minimum(np.maximum(qa, qb), 0) - rad

    # the hull's flanks: two seams, a belt line, a hatch with its fasteners, cooling slits above the shoulder
    seam(flank, y + 0.2)
    seam(flank, y - 0.152)
    seam(flank & (y < -0.2), z - 0.612)
    hatch = rrect(y, z, -0.092, 0.586, 0.072, 0.046, 0.012)
    seam(flank, hatch, 0.0022)
    col = mix(col, col * 1.1, flank * smooth(0.002, -0.004, hatch) * 0.6)
    bolts(flank, y, z, [(-0.092 + sa * 0.058, 0.586 + sb * 0.033) for sa in (-1, 1) for sb in (-1, 1)], 0.0058)
    bolts(flank, y, z, [(yy, zz) for yy in (-0.19, 0.142, 0.163) for zz in (0.632, 0.585)] + [(-0.21, 0.632), (-0.21, 0.585)], 0.0056)
    slits = np.zeros(m)
    for i in range(5):
        dd = (y - (0.20 + i * 0.028)) + 0.35 * (z - 0.642)
        slits = np.maximum(slits, (1 - smooth(0.003, 0.0052, np.abs(dd))) * smooth(0.019, 0.016, np.abs(z - 0.642)))
    slits *= flank
    col = mix(col, INK, slits * 0.95)
    lips = np.maximum(lips, flank * 0.8 * smooth(0.0052, 0.0062, (y - 0.2) % 0.028) * 0.0)
    # the hull's top chamfers and its back: a row of bolts, the seams carried over
    topc = body & (nz > 0.45)
    seam(topc, y + 0.2)
    seam(topc, y - 0.152)
    cham = body & (nz > 0.5) & (nz < 0.92)
    for sx in (-1, 1):
        bolts(cham & (x * sx > 0), y, x * sx, [(-0.40 + 0.075 * i, body_hw(-0.40 + 0.075 * i) - 0.015) for i in range(11) if abs(-0.40 + 0.075 * i - 0.25) > 0.1], 0.0052, light=(0.9, 0.3))
    # the belly: a centre seam and drain holes
    belly = body & (nz < -0.5)
    seam(belly, x, 0.003, 0.0)
    bolts(belly, x, y, [(sa * 0.03, yy) for sa in (-1, 1) for yy in (-0.36, -0.2, -0.05, 0.36)], 0.006, tone=0.45)
    # the prow's plate of ochre: a seam where it begins, bolts along its sides
    prow = body & is_mat('ochre')
    bolts(prow & (nz > 0.75), x, y, [(sa * 0.112, yy) for sa in (-1, 1) for yy in (0.29, 0.36, 0.43)], 0.006, light=(-0.5, 0.85))
    wall = body & (ny > 0.7) & (z > 0.59) & (y < 0.3)           # the step behind the foredeck: three slots
    for i in range(3):
        col = mix(col, INK, wall * (1 - smooth(0.003, 0.005, np.abs(z - (0.625 + 0.016 * i)))) * smooth(0.075, 0.07, np.abs(x)) * 0.95)
    # the saddles the legs hang from
    for n, sx, f in LEGS:
        hip, knee, foot = leg_points(sx, f)
        sad = is_piece(f'saddle_{n}')
        side = sad & (np.abs(nx) > 0.6)
        top = sad & (nz > 0.6)
        bolts(top, x, y, [(sx * 0.165, hip.y + s * 0.062) for s in (-1, 1)], 0.0056)
        seam(sad & (np.abs(ny) > 0.6), z - (HZ + 0.02), 0.002)
        bolts(side, y, z, [(hip.y + s * 0.07, HZ + 0.062) for s in (-1, 1)], 0.005)
        # ---- the shield over the hip: bolts at its corners, a sunk field with the unit's bar; the arm that holds it
        shl = is_piece(f'shield_{n}') & (np.abs(nx) > 0.6)
        sy_, sz_ = (y - hip.y) * f, z - (HZ + SHIELD_Z)
        bolts(shl, sy_, sz_, [(-0.072, 0.052), (0.072, 0.052), (-0.072, -0.008), (0.072, -0.008), (0.0, -0.07)], 0.0062)
        field = rrect(sy_, sz_, 0.0, 0.022, 0.05, 0.036, 0.01)
        seam(shl, field, 0.0022)
        col = mix(col, col * 0.88, shl * smooth(0.0, -0.004, field) * 0.8)
        bar = shl * (x * sx > 0.27) * smooth(0.0075, 0.006, np.abs(sz_ - 0.03)) * smooth(0.034, 0.032, np.abs(sy_))
        col = mix(col, PALE, bar * 0.85)
        arm = is_piece(f'arm_{n}') & (nz > 0.6)
        bolts(arm, x * sx, y, [(0.185, hip.y), (0.235, hip.y)], 0.0052)
        # ---- the hip: its cap of steel, a ring of bolts, a hub
        cap = is_piece(f'hipcap_{n}') & (np.abs(nx) > 0.6)
        ry, rz = y - hip.y, z - hip.z
        rr = np.hypot(ry, rz)
        bolts(cap, ry, rz, [(0.036 * math.cos(a), 0.036 * math.sin(a)) for a in (0.3 + 1.0472 * i for i in range(6))], 0.005)
        seam(cap, rr - 0.019, 0.0022)
        bolts(cap, ry, rz, [(0.0, 0.0)], 0.009, tone=0.5)
        # the drum under it: grooves round it
        drum = is_piece(f'hip_{n}', f'knee_{n}')
        for q in (hip, knee):
            rq = np.hypot(y - q.y, z - q.z)
            near_q = drum & (rq < 0.08) & (np.abs(nx) < 0.5)
            for xo in (-0.016, 0.016):
                seam(near_q, (x - q.x) - xo, 0.0022, 0.6)
        # ---- the knee's caps of steel: one large bolt, a groove
        kc = is_piece(f'knee_{n}') & (np.abs(nx) > 0.6)
        ky, kz = y - knee.y, z - knee.z
        seam(kc, np.hypot(ky, kz) - 0.03, 0.002)
        bolts(kc, ky, kz, [(0.0, 0.0)], 0.013, tone=0.55)
        bolts(kc, ky, kz, [(0.0385 * math.cos(a), 0.0385 * math.sin(a)) for a in (0.6 + 1.5708 * i for i in range(4))], 0.0038)
        # ---- the thigh: a sunk panel along it, two bolts, a pale ring of wear where the ram's clamp sits
        th = is_piece(f'thigh_{n}') & (np.abs(nx) > 0.6)
        w1 = (knee - hip).normalized()
        s = (P - np.array(hip)).dot(np.array(w1))
        tv = (y - hip.y) * w1.z - (z - hip.z) * w1.y
        pan = rrect(s, tv, 0.165, 0.0, 0.062, 0.024, 0.009)
        seam(th, pan, 0.0022)
        col = mix(col, col * 0.86, th * smooth(0.0, -0.004, pan) * 0.8)
        bolts(th, s, tv, [(0.118, 0.0), (0.212, 0.0)], 0.005)
        tha = is_piece(f'thigh_{n}')
        seam(tha & (np.abs(nx) < 0.6), s - 0.09, 0.0022)
        seam(tha & (np.abs(nx) < 0.6), s - 0.245, 0.0022)
        # the ram: its barrel banded, its rod bright
        ram = is_piece(f'ram_{n}')
        sr = (P - np.array(hip)).dot(np.array(w1))
        for so in (0.06, 0.15):
            seam(ram, sr - so, 0.003, 0.7)
        rod = is_piece(f'rod_{n}')
        col = mix(col, BARE * 0.92, rod * 0.6)
        # ---- the shin: two rings near the ankle, a seam under the knee; the guard: bolts
        sh = is_piece(f'shin_{n}')
        w2 = (foot - knee).normalized()
        s2 = (P - np.array(knee)).dot(np.array(w2))
        seam(sh, s2 - 0.07, 0.0022)
        ring = sh * np.maximum(smooth(0.006, 0.0045, np.abs(s2 - 0.215)), smooth(0.0035, 0.0022, np.abs(s2 - 0.232)))
        col = mix(col, PALE, ring * 0.8)
        gd = is_piece(f'guard_{n}') & (np.abs(nx) < 0.5)
        bolts(gd, x - hip.x, s2, [(sa * 0.02, so) for sa in (-1, 1) for so in (0.072, 0.19)], 0.0048, light=(-0.4, -0.9))
        seam(gd, s2 - 0.13, 0.002)
        # ---- the foot: a ball of rubber with a tread of rings, scuffed pale where it meets the ground; the ankle's collar
        ft = is_piece(f'foot_{n}')
        ax = np.array((knee - foot).normalized())
        sa = (P - np.array(foot)).dot(ax)
        tread = 0.5 + 0.5 * np.cos(sa / 0.0085 * 2 * math.pi)
        col = mix(col, INK, ft * smooth(0.6, 0.9, tread) * smooth(0.024, 0.006, sa) * 0.8)
        col = mix(col, np.array((0.33, 0.315, 0.29)), ft * smooth(-0.02, -0.044, sa) * (0.45 + 0.4 * n_fine))
        clean = np.maximum(clean, ft * 0.7)
        an = is_piece(f'ankle_{n}')
        seam(an, sa - 0.05, 0.0022, 0.6)

    # ---- the yoke and the block of sensors ---------------------------------------------------------------------------
    yk = is_piece('yoke')
    bolts(yk & (nz > 0.6), x, y, [(sa * 0.052, 0.455) for sa in (-1, 1)], 0.0048)
    hinge = is_piece('yoke_hinge') & (np.abs(nx) > 0.6)
    hy, hz_ = y - NECK.y, z - NECK.z
    bolts(hinge, hy, hz_, [(0.0, 0.0)], 0.009, tone=0.55)
    
    # the block: the band's channel, dark behind the light; below it a window of dark glass to one side and a grille of
    # pinholes to the other (an array, not a pair: it has no face); slits on its sides; a seam under its lid
    chan = tur * smooth(BZ0 - 0.008, BZ0 - 0.005, z) * smooth(BZ1 + 0.008, BZ1 + 0.005, z)
    col = mix(col, np.array(PAL['dark']) * 0.7, chan)
    coat = coat * (1 - chan)
    seam(tur, z - (BZ0 - 0.008), 0.0022)
    seam(tur, (BZ1 + 0.008) - z, 0.0022, 0.0)
    front = tur & (ny > 0.75)
    wz = 0.5 * (TZ0 + 0.01 + BZ0 - 0.008)                        # the middle of the strip under the band
    win = rrect(x, z, -0.05, wz, 0.036, 0.0082, 0.0035)
    inwin = front * smooth(0.001, -0.001, win)
    glass = GLASS[None, :] * (1 + 2.6 * smooth(0.011, 0.0, np.abs((x + 0.05) + 1.3 * (z - wz) - 0.012)) + 0.9 * smooth(0.006, 0.0, np.abs((x + 0.05) + 1.3 * (z - wz) + 0.014)))[:, None]
    col = mix(col, glass, inwin)
    coat = coat * (1 - inwin)
    seam(front, win, 0.0022)
    holes = np.zeros(m)
    for i in range(5):
        for j in range(2):
            holes = np.maximum(holes, 1 - smooth(0.0028, 0.0042, np.hypot(x - (0.012 + 0.0145 * i), z - (wz - 0.0048 + 0.0096 * j))))
    col = mix(col, INK, front * holes * 0.95)
    coat = coat * (1 - front * holes)
    tslit = np.zeros(m)
    for i in range(2):
        tslit = np.maximum(tslit, (1 - smooth(0.0022, 0.004, np.abs(z - (wz - 0.005 + 0.01 * i)))) * smooth(0.03, 0.027, np.abs(y - TUR.y)))
    col = mix(col, INK, tside * tslit * 0.95)
    # the corner faces of the block: one round port each, capped
    corner = tur & (np.abs(nx) > 0.35) & (ny > 0.35) & (np.abs(nx) < 0.93) & (ny < 0.93)
    cu = (np.abs(x) - 0.12) * 0.7071 - (y - (TUR.y + 0.066)) * 0.7071
    bolts(corner, cu, z, [(0.0, wz)], 0.0075, tone=0.42)
    # the lid of ochre: bolts, a hatch line
    lid = is_piece('turret_cap') & (nz > 0.7)
    bolts(lid, x, y, [(sa * 0.062, TUR.y + 0.004 + sb * 0.032) for sa in (-1, 1) for sb in (-1, 1)], 0.005)
    seam(lid, rrect(x, y, 0.0, TUR.y + 0.004, 0.04, 0.02, 0.006), 0.002)
    # the aerials: a pale tip, a banded foot
    aer = is_piece('antenna')
    col = mix(col, PAL['ochre'], aer * smooth(0.83, 0.845, z) * 0.0)
    col = mix(col, np.array((0.30, 0.30, 0.31)), aer * 0.5)
    # the rails and posts of the cradle: bolts on the posts' tops, rub marks on the rails
    post = is_piece('post') & (nz > 0.7)
    for sx in (-1, 1):
        bolts(post, x, y, [(sx * 0.104, yy) for yy in (-0.37, 0.13)], 0.0075, tone=0.5)
    rail = is_piece('rail')
    col = mix(col, BARE * 0.85, rail * smooth(0.5, 0.75, vnoise(x * 14.0, y * 14.0, z * 60.0, 14)) * 0.5 * (nz > 0.5))
    rear = is_piece('rear_box') & (ny < -0.7)                   # a grille of slats at the back
    slat = (1 - smooth(0.0035, 0.0055, np.abs(((z - 0.565) % 0.0135) - 0.00675))) * smooth(0.06, 0.056, np.abs(x)) * smooth(0.034, 0.031, np.abs(z - 0.60))
    col = mix(col, INK, rear * slat * 0.9)
    seam(rear, rrect(x, z, 0.0, 0.60, 0.066, 0.036, 0.006), 0.002)

    # ---- the edges: worn pale where they stand out, dark where two faces meet inward ---------------------------------
    rub = np.exp(-de / 0.0036) * (0.5 + 0.5 * smooth(0.25, 0.7, n_fine + 0.25 * n_grain))
    edge_col = np.where(is_mat('rubber')[:, None], np.array((0.30, 0.29, 0.275)), np.where(is_mat('dark')[:, None], np.array((0.40, 0.40, 0.41)), BARE))
    col = mix(col, edge_col, np.clip(rub * 0.92, 0, 1) * (1 - chan * 0.7))
    col *= (1 - 0.6 * np.exp(-dc / 0.0045))[:, None]
    col *= (1 - 0.22 * np.exp(-dc / 0.028))[:, None]

    # ---- dirt: streaks running down, grime where pieces meet, dust on what looks up, the road on the legs ----------------
    upright = 1 - np.abs(nz)
    streak = smooth(0.52, 0.86, vnoise(x * 46.0, y * 46.0, z * 4.5, 9)) * upright
    col = mix(col, DIRT, streak * 0.42 * (0.4 + 0.6 * n_mid)[:, ] * (1 - 0.5 * is_mat('dark', 'rubber')))
    near = R.near
    grime = smooth(0.05, 0.0, near)
    col = mix(col, DIRT * 0.75, grime * 0.5 * (0.45 + 0.55 * n_mid))
    dust = np.clip(nz, 0, 1) ** 2 * smooth(0.3, 0.7, fbm(P, 9.0, 2, 10))
    col = mix(col, DUST, dust * 0.26)
    road_dirt = smooth(0.24, 0.02, z) * (0.25 + 0.75 * fbm(P, 15.0, 2, 13))
    col = mix(col, DIRT * (0.95 + 0.5 * n_fine)[:, None], np.clip(road_dirt * 0.55, 0, 1) * (1 - clean))
    spatter = smooth(0.76, 0.82, vnoise(x * 70.0, y * 70.0, z * 70.0, 15)) * smooth(0.42, 0.1, z)
    col = mix(col, DIRT * 0.9, spatter * 0.55 * (1 - clean))

    # ---- the drawing: the ink of the seams, and the lip that catches the light beside each ------------------------------
    col = mix(col, col * 1.45 + 0.04, np.clip(lips, 0, 1) * 0.55)
    col = mix(col, INK * 1.3, np.clip(lines, 0, 1) * 0.88)

    # ---- the light, painted: from above and a little from the front left; a sheen on what turns to it; the shadow of what
    # overhangs and of every piece on its neighbour
    lit = 0.80 + 0.30 * np.clip(nz, 0, 1) - 0.27 * np.clip(-nz, 0, 1) + 0.05 * N.dot(LIGHT)
    sheen = smooth(0.80, 0.985, N.dot(LIGHT))
    amount = np.array([0.045, 0.05, 0.085, 0.03, 0.17, 0.0])[R.mat]
    col = col * lit[:, None] + (sheen * amount * (0.6 + 0.8 * n_fine))[:, None]
    col *= (0.40 + 0.60 * R.sky)[:, None]
    col *= (1 - 0.45 * smooth(0.035, 0.0, near))[:, None]
    # the brush: a mottle of two sizes, so that nothing is flat
    col *= (1 + 0.11 * (n_mid - 0.5) * 2 * 0.6 + 0.07 * (n_grain - 0.5) * 2)[:, None]
    return np.clip(col, 0.015, 1.0)


def shade_of(kit, vi, mat):
    """The old contract's shade of a vertex (it travels as TEXCOORD_0 into the game's ramp): lighter on top, darker below."""
    n, p = kit.vn[vi], kit.v[vi]
    if mat == 'sensor':                                        # the band: brightest along its middle
        return 1.0 - 0.3 * min(1.0, abs(p[2] - 0.5 * (BZ0 + BZ1)) / (0.5 * (BZ1 - BZ0) + 0.004))
    return 0.70 + 0.2 * max(0.0, n[2]) - 0.2 * max(0.0, -n[2]) + 0.08 * C.smooth(0.1, 0.7, p[2])


OUTLINE = {'band': 0.0, 'antenna': 0.45, 'rod': 0.5, 'hose': 0.6, 'ram': 0.7}


def make_objects(kit, uvs, image, arm):
    mats = {}
    for name in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = 0.85
        if name == 'sensor':
            bsdf.inputs['Base Color'].default_value = (1.0, 0.75, 0.3, 1)
        else:
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = image
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'atlas'
            nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        mats[name] = m
    stats = {}
    for oname in dict.fromkeys(p[2] for p in kit.pieces):
        fis = [i for i in range(len(kit.f)) if kit.pieces[kit.fpiece[i]][2] == oname]
        remap, verts = {}, []
        for fi in fis:
            for vi in kit.f[fi]:
                if vi not in remap:
                    remap[vi] = len(verts)
                    verts.append(vi)
        me = bpy.data.meshes.new(oname)
        me.from_pydata([kit.v[vi] for vi in verts], [], [tuple(remap[vi] for vi in kit.f[fi]) for fi in fis])
        me.update()
        used = list(dict.fromkeys(kit.fmat[fi] for fi in fis))
        for name in used:
            me.materials.append(mats[name])
        shade = me.uv_layers.new(name='UVMap')
        atlas = me.uv_layers.new(name='atlas')
        shade.active_render = True
        for poly, fi in zip(me.polygons, fis):
            poly.material_index = used.index(kit.fmat[fi])
            poly.use_smooth = True
            for j, li in enumerate(poly.loop_indices):
                vi = kit.f[fi][j]
                shade.data[li].uv = C.encode_shade((shade_of(kit, vi, kit.fmat[fi]),) * 3)
                atlas.data[li].uv = tuple(uvs[fi][j])
        me.normals_split_custom_set_from_vertices([tuple(kit.vn[vi]) for vi in verts])
        ol = me.attributes.new('_outline', 'FLOAT', 'POINT')
        vpiece = {}
        for fi in fis:
            for vi in kit.f[fi]:
                vpiece[vi] = kit.fpiece[fi]
        for i, vi in enumerate(verts):
            pname = kit.pieces[vpiece[vi]][0]
            ol.data[i].value = next((w for key, w in OUTLINE.items() if pname.startswith(key)), 1.0)
        ob = bpy.data.objects.new(oname, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i, vi in enumerate(verts):
            groups.setdefault(kit.pieces[vpiece[vi]][1], []).append(i)
        for bone, idx in groups.items():
            ob.vertex_groups.new(name=bone).add(idx, 1.0, 'REPLACE')
        C.bind(ob, arm)
        stats[oname] = sum(len(kit.f[fi]) - 2 for fi in fis)
    return stats


# ---------------------------------------------------------------------------------------------------------------------
# the animations: the hull is placed, the feet are told where to stand, and each leg is solved to reach its foot

HB = V((0, 0, HZ))
LEG = {n: leg_points(sx, f) for n, sx, f in LEGS}
HOME = {n: LEG[n][2].copy() for n, _, _ in LEGS}
SIDE = {n: sx for n, sx, _ in LEGS}
END = {n: f for n, _, f in LEGS}


def rot3(rx, ry, rz):
    return Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(ry, 3, 'Y')      # as person_anim.Rig.q


def stand(body=(0, 0, 0), rot=(0, 0, 0), feet=None, neck=0.0):
    """A pose: the hull moved by `body` and turned by `rot` (pitch: + is nose up; roll; yaw), each foot's ball at feet[n] (or at
    home), the yoke pitched by `neck` (+ is up)."""
    p = Pose()
    p.at('body', *body)
    p.r('body', *rot)
    p.r('neck', min(neck, 0.03), 0, 0)                       # (the tray tips forward only: behind its hinge lies the deck)
    B = rot3(*rot)
    Bi = B.inverted()
    for n, _, _ in LEGS:
        hip, knee, foot = LEG[n]
        target = (feet or {}).get(n, HOME[n])
        d = Bi @ (V(target) - (HB + V(body) + B @ (hip - HB)))
        v1, v2 = knee - hip, foot - knee
        l1, l2 = v1.length, v2.length
        L = max(abs(l1 - l2) + 0.04, min((l1 + l2) * 0.996, d.length))
        d = d.normalized() * L
        phi0 = math.atan2(v2.z, v2.y) - math.atan2(v1.z, v1.y)
        phi0 = math.atan2(math.sin(phi0), math.cos(phi0))
        psi = math.copysign(math.acos(max(-1.0, min(1.0, (L * L - l1 * l1 - l2 * l2) / (2 * l1 * l2)))), phi0)
        c = psi - phi0
        wy = v1.y + v2.y * math.cos(c) - v2.z * math.sin(c)
        wz = v1.z + v2.y * math.sin(c) + v2.z * math.cos(c)
        b = math.asin(max(-0.95, min(0.95, d.x / wz))) if abs(wz) > 1e-4 else 0.0
        a = math.atan2(d.z, d.y) - math.atan2(wz * math.cos(b), wy)
        a = math.atan2(math.sin(a), math.cos(a))
        p.r(f'leg_{n}_up', a, b, 0)
        p.r(f'leg_{n}_low', c, 0, 0)
    return p


def step(q, beta, stride, lift):
    """A foot through one cycle (q 0..1): on the ground for `beta` of it, carried back by `stride`; then up, forward and down, with
    the flat top of a machine's step. Returns (forward, up)."""
    q = q % 1.0
    if q < beta:
        return stride * (0.5 - q / beta), 0.0
    s = (q - beta) / (1 - beta)
    return stride * (-0.5 + ease(s)), lift * ease(s / 0.3) * ease((1 - s) / 0.3)


def gait(u, phases, beta, stride, lift, track=0.0):
    return {n: HOME[n] + V((SIDE[n] * track, *step(u + phases[n], beta, stride, lift))) for n, _, _ in LEGS}


WALK = {'FR': 0.0, 'BL': 0.08, 'FL': 0.5, 'BR': 0.58}          # the diagonals, the hind foot a beat late: four ticks
BOUND = {'BL': 0.0, 'BR': 0.07, 'FL': 0.43, 'FR': 0.5}         # the hind pair, then the front pair
CHASE = {'BL': 0.0, 'BR': 0.1, 'FR': 0.42, 'FL': 0.52}
# the game advances a cycle of `andar` and `buscar` every 0.9 m, and of `rolar` and `correr_caca` every 0.9 / 0.35 m (dog.js): the
# strides below are those lengths times the share of the cycle a foot is down, so a planted foot does not slide
WALK_M, RUN_M = 0.9, 0.9 / 0.35 / 2                            # (two bounds to a cycle of the run)


def clip_parado(u):
    ph = 2 * math.pi * u
    return stand(body=(0, 0, 0.003 * math.sin(ph)), rot=(0.006 * math.sin(ph), 0, 0), neck=0.012 * math.sin(ph + 0.6))


def clip_andar(u):
    ph = 2 * math.pi * u
    beta = 0.6
    return stand(body=(0, 0, -0.018 + 0.005 * math.cos(2 * ph)), rot=(0.008 * math.sin(2 * ph), 0.012 * math.sin(ph), 0.0),
                 feet=gait(u, WALK, beta, WALK_M * beta, 0.085), neck=-0.008 * math.sin(2 * ph))


def clip_buscar(u):
    """Searching on the move: low in front, the block of sensors down near the ground, a shorter lift."""
    ph = 2 * math.pi * u
    beta = 0.6
    return stand(body=(0, 0, -0.045 + 0.004 * math.cos(2 * ph)), rot=(-0.085 + 0.008 * math.sin(2 * ph), 0.012 * math.sin(ph), 0.02 * math.sin(ph)),
                 feet=gait(u, WALK, beta, WALK_M * beta, 0.06), neck=-0.42 + 0.05 * math.sin(2 * ph))


def clip_rolar(u):
    """The run (the name is the old contract's: it rolled): a bounding gallop, twice in the clip. The hind pair drives, the hull
    flies, the front pair lands."""
    q = 2 * u
    ph = 2 * math.pi * q
    beta = 0.34
    return stand(body=(0, 0, -0.035 + 0.03 * math.sin(ph - 0.3)), rot=(0.075 * math.sin(ph + 0.35), 0, 0), feet=gait(q, BOUND, beta, RUN_M * beta, 0.13, 0.01),
                 neck=-0.06 - 0.06 * math.sin(ph + 0.35))


def clip_correr_caca(u):
    """The chase: lower and longer than the run, the block of sensors held level on the target while the hull pitches."""
    q = 2 * u
    ph = 2 * math.pi * q
    beta = 0.36
    pitch = -0.05 + 0.10 * math.sin(ph + 0.3)
    return stand(body=(0, 0.02, -0.075 + 0.028 * math.sin(ph - 0.3)), rot=(pitch, 0, 0), feet=gait(q, CHASE, beta, RUN_M * beta, 0.11, 0.02), neck=-pitch - 0.1)


def clip_virar_sensor(u):
    """On alert: up on its legs, a slow shift of weight (the block's turn is the game's)."""
    ph = 2 * math.pi * u
    return stand(body=(0.008 * math.sin(ph), 0, 0.03 + 0.003 * math.sin(2 * ph)), rot=(0.035, 0, 0.012 * math.sin(ph)), neck=0.1 + 0.02 * math.sin(2 * ph))


def clip_farejar(u):
    """Sniffing: the front legs fold, the chest goes down and the block of sensors sweeps just above the ground."""
    ph = 2 * math.pi * u
    dip = 0.5 + 0.5 * math.sin(2 * ph)
    feet = {n: HOME[n] + V((SIDE[n] * 0.02, 0.03 if END[n] > 0 else 0.0, 0)) for n, _, _ in LEGS}
    return stand(body=(0.012 * math.sin(ph), 0.02, -0.105 - 0.012 * dip), rot=(-0.27 - 0.03 * dip, 0, 0.05 * math.sin(ph)), feet=feet, neck=-0.5 + 0.1 * math.sin(2 * ph + 1))


def clip_derrubar(u):
    """The takedown, without a claw: it sinks on its legs, springs, shoves with the chest and both front legs, and comes down
    on what it hit, its weight on the front feet."""
    crouch = ease(u / 0.26) * (1 - ease((u - 0.26) / 0.12))
    spring = ease((u - 0.27) / 0.16)
    air = spring * (1 - ease((u - 0.46) / 0.2))
    land = ease((u - 0.5) / 0.18)
    settle = land * (1 - 0.35 * ease((u - 0.7) / 0.25))
    body = (0, -0.07 * crouch + 0.30 * spring + 0.03 * land, -0.115 * crouch + 0.10 * air - 0.10 * settle)
    rot = (0.07 * crouch + 0.36 * air - 0.20 * settle, 0, 0)
    feet = {}
    for n, sx, f in LEGS:
        if f > 0:      # the front feet leave the ground, strike forward at chest height, and come down far ahead
            feet[n] = HOME[n] + V((sx * 0.03 * land, 0.26 * spring + 0.19 * air + 0.06 * land, 0.36 * air))
        else:          # the hind feet drive, then hop up under the hull
            feet[n] = HOME[n] + V((sx * 0.02 * land, 0.21 * land, 0.07 * ease((u - 0.44) / 0.1) * (1 - ease((u - 0.56) / 0.1))))
    return stand(body=body, rot=rot, feet=feet, neck=-0.12 * crouch - 0.3 * air + 0.16 * land)


def clip_desligado(u):
    """Powering down: the front legs give way first, then the hind ones; the hull drops onto its keel, a little to one side,
    the feet sliding outward, and the block of sensors sags. The last frame is held."""
    kf = ease(u / 0.5)
    kr = ease((u - 0.22) / 0.55)
    k = 0.5 * (kf + kr)
    bounce = 0.012 * math.sin(math.pi * min(1.0, max(0.0, (u - 0.77) / 0.2)))
    feet = {n: HOME[n] + V((sx * (0.02 if f > 0 else 0.035) * (kf if f > 0 else kr), f * 0.03 * k, 0)) for n, sx, f in LEGS}
    return stand(body=(0.02 * kr, 0.015 * kf, -0.335 * k + bounce), rot=(-0.20 * (kf - kr) - 0.035 * kr, 0.085 * kr, 0.03 * kr), feet=feet, neck=-0.62 * ease(u / 0.8))


def clip_sensor_yaw(u):
    """Only the block of sensors: yaw from -2.4 (u = 0) to +2.4 rad (u = 1). The game picks u from where it wants to look."""
    p = Pose()
    p.r('sensor', 0, 0, -2.4 + 4.8 * u)
    return p


def clip_wheel_spin(u):
    """Nothing spins any more. The clip stays because the game plays it: the feet's bones held within a hair of their rest."""
    p = Pose()
    for n, _, _ in LEGS:
        p.r(f'wheel_{n}', 0.004 * math.sin(2 * math.pi * u), 0, 0)
    return p


DOG_CLIPS = [
    ('parado', 2.4, True, clip_parado),
    ('andar', 0.9, True, clip_andar),
    ('rolar', 0.8, True, clip_rolar),
    ('virar_sensor', 2.4, True, clip_virar_sensor),
    ('farejar', 2.0, True, clip_farejar),
    ('buscar', 1.0, True, clip_buscar),
    ('correr_caca', 0.6, True, clip_correr_caca),
    ('derrubar', 1.0, False, clip_derrubar),
    ('desligado', 1.4, False, clip_desligado),
    ('sensor_yaw', 1.0, False, clip_sensor_yaw),
    ('wheel_spin', 1.0, True, clip_wheel_spin),
]


def main():
    args = C.script_args()
    C.reset_scene()
    log = lambda *a: print('DOG', *a, flush=True)
    kit = build_shape()
    log('shape', len(kit.v), 'vertices', kit.tris(), 'triangles', len(kit.pieces), 'pieces')
    uvs = M.unwrap(kit)
    R = M.Raster(kit, uvs, TEX, MATS)
    log('atlas', TEX, 'px, filled', round(R.fill, 3), 'texels', len(R.face))
    if os.environ.get('DOG_NOSKY'):
        R.near, R.sky = np.full(len(R.face), 0.07), np.ones(len(R.face))
    else:
        R.occlusion(kit)
    image = R.image('dog_paint', paint(R, kit))
    if os.environ.get('DOG_DUMP'):
        os.makedirs(os.environ['DOG_DUMP'], exist_ok=True)
        M.save_png(R.rgb_image, os.path.join(os.environ['DOG_DUMP'], 'dog_paint.png'))
    sp = skeleton()
    arm, _ = C.build_armature('dog_rig', sp)
    stats = make_objects(kit, uvs, image, arm)
    rig = Rig(arm)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0
    for name, secs, loop, fn in DOG_CLIPS:
        key_pose_clip(rig, C.Clip(name, secs, FPS, loop), fn)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(args['out'], 'dog.glb')
    C.export_glb(path, dict(export_image_format='JPEG', export_jpeg_quality=86, export_texcoords=True, export_attributes=True, export_materials='EXPORT',
                            export_vertex_color='NONE'))
    C.shrink_glb(path, anim_step=2, steps={'andar': 1, 'buscar': 1, 'rolar': 1, 'correr_caca': 1, 'derrubar': 1, 'parado': 4, 'virar_sensor': 4, 'wheel_spin': 6})
    log('PARTS', stats, 'TOTAL', sum(stats.values()))
    log('WROTE', path, os.path.getsize(path))


main()
