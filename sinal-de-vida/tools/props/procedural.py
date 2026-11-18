"""The props made by hand (no photo, no model from outside): small assembled shapes in metres, z up, the front facing -y (which is +z in the
game). A builder calls box, cyl, bar, sph, torus and planks; each call adds one PIECE to the kit of tools/models/metal.py (the same kit the
dog-robot is made of) and notes the piece's own frame (centre, axes, half sizes) and material, which the painter (paint.py) reads: the grain
of a board runs along the board, a plank has its own tone, a chip follows the edge of its own piece.

Shapes are made for the game as they are (there is no high model and no reduction): a box that is thick enough has its twelve edges
chamfered (44 triangles, one normal per corner, so the painted light and the outline's shell have a turn to follow); a thin one is six
plain faces; a cylinder has chamfered rims and as few sides as its radius allows. The materials only say the first colour (linear, as a
Blender base colour) and the kind of surface: wood, steel, coat (painted metal), rust, rubber, conc(rete), cloth, plain."""
import math
import numpy as np
from mathutils import Vector, Euler

K = None            # the kit being filled: bake.py calls begin(kit) before a builder
FRAMES = []         # per piece: (shape, centre, axes 3x3 (rows), half sizes, a number 0..1 of its own)
MATS = {}           # name -> (display rgb, kind)
BOX, CYL, ROUND = 0, 1, 2
_n = [0]

def begin(kit):
    global K
    K = kit; FRAMES.clear(); MATS.clear(); _n[0] = 0

def _rand(i):
    h = (i * 2654435761 + 97) & 0xFFFFFFFF
    h = ((h ^ (h >> 15)) * 2246822519) & 0xFFFFFFFF
    return ((h ^ (h >> 13)) & 0xFFFF) / 65535.0

# ---- materials ----------------------------------------------------------------------------------------------------
def mat(color, kind='plain', c2=None, rough=0.7):
    """A material by its first colour and kind; 'metal' is read as bare steel (grey), rust (dark orange) or coat (painted)."""
    r, g, b = color
    if kind == 'metal':
        sat = (max(color) - min(color)) / max(max(color), 1e-6)
        kind = 'steel' if sat < 0.2 else 'rust' if (r > g * 1.45 and max(color) < 0.5) else 'coat'
    if kind == 'concrete': kind = 'conc'
    name = f'{kind}:{r:.3f},{g:.3f},{b:.3f}'
    MATS[name] = (tuple(max(0.0, v) ** (1 / 2.2) for v in color), kind)
    return name

WOOD = lambda: mat((0.62, 0.44, 0.26), 'wood')
WOOD_D = lambda: mat((0.38, 0.27, 0.17), 'wood')
PLY = lambda: mat((0.72, 0.58, 0.38), 'wood')
STEEL = lambda: mat((0.55, 0.58, 0.62), 'steel')
STEEL_D = lambda: mat((0.28, 0.3, 0.33), 'steel')
BLUE = lambda: mat((0.17, 0.36, 0.58), 'coat')
GREEN = lambda: mat((0.24, 0.4, 0.3), 'coat')
OCHRE = lambda: mat((0.72, 0.52, 0.2), 'coat')
RED = lambda: mat((0.6, 0.18, 0.12), 'coat')
BLACK = lambda: mat((0.07, 0.07, 0.08))
RUBBER = lambda: mat((0.12, 0.12, 0.13), 'rubber')
CONC = lambda: mat((0.62, 0.6, 0.55), 'conc')
CLOTH = lambda c=(0.6, 0.6, 0.55): mat(c, 'cloth')

# ---- shapes -------------------------------------------------------------------------------------------------------
CHAMFER_FROM = 0.0075    # a box whose bevel is at least this (and that is thick enough) gets real chamfers
CHAMFER_GAIN = 1.5       # ... a little wider than the bevel asked for: the corner is there to be seen

def _piece(shape, c, axes, half):
    i = _n[0]; _n[0] += 1
    K.piece(f'p{i}', None, 'prop')
    FRAMES.append((shape, tuple(c), [tuple(a) for a in axes], tuple(half), _rand(i)))
    return len(K.f)

def _outward(n0, c):
    """Turns the faces made since n0 so that they look away from c (by the sign of the volume they close)."""
    c = Vector(c); vol = 0.0
    for f in K.f[n0:]:
        p = [Vector(K.v[i]) - c for i in f]
        for t in range(1, len(p) - 1): vol += p[0].dot(p[t].cross(p[t + 1]))
    if vol < 0:
        for k in range(n0, len(K.f)): K.f[k] = tuple(reversed(K.f[k]))

def _axes(rot):
    m = Euler(rot, 'XYZ').to_matrix()
    return [Vector(m.col[0]), Vector(m.col[1]), Vector(m.col[2])]

def box(sz, loc, m, rot=(0, 0, 0), bev=0.006):
    ax = _axes(rot); c = Vector(loc); h = [s / 2 for s in sz]
    order = sorted(range(3), key=lambda i: -h[i])                    # the frame the painter gets: the longest side first
    n0 = _piece(BOX, c, [ax[i] for i in order], [h[i] for i in order])
    ch = min(bev, min(sz) * 0.45)
    pt = lambda x, y, z: tuple(c + ax[0] * x + ax[1] * y + ax[2] * z)
    b = len(K.v)
    if ch >= CHAMFER_FROM and min(sz) >= 0.035:
        ch = min(ch * CHAMFER_GAIN, min(sz) * 0.3)
        idx = {}
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz_ in (-1, 1):
                    s = (sx, sy, sz_)
                    for a in range(3):                               # the corner's point on the face across axis a
                        q = [s[k] * (h[k] - (0 if k == a else ch)) for k in range(3)]
                        idx[(s, a)] = len(K.v); K.v.append(pt(*q))
        for a in range(3):                                           # the six faces
            b1, b2 = (a + 1) % 3, (a + 2) % 3
            for sa in (-1, 1):
                q = []
                for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    s = [0, 0, 0]; s[a] = sa; s[b1] = s1; s[b2] = s2; q.append(idx[(tuple(s), a)])
                K._face(q, m)
        for a in range(3):                                           # the twelve chamfers: along axis a, between the faces across the other two
            b1, b2 = (a + 1) % 3, (a + 2) % 3
            for s1 in (-1, 1):
                for s2 in (-1, 1):
                    lo = [0, 0, 0]; lo[a] = -1; lo[b1] = s1; lo[b2] = s2; hi = list(lo); hi[a] = 1
                    K._face((idx[(tuple(lo), b1)], idx[(tuple(hi), b1)], idx[(tuple(hi), b2)], idx[(tuple(lo), b2)]), m)
        for s in [(sx, sy, sz_) for sx in (-1, 1) for sy in (-1, 1) for sz_ in (-1, 1)]:
            K._face((idx[(s, 0)], idx[(s, 1)], idx[(s, 2)]), m)       # the eight corners
        # every face on its own may be either way round: turn each to look away from the centre
        for k in range(n0, len(K.f)):
            p = [Vector(K.v[i]) for i in K.f[k]]
            if (p[1] - p[0]).cross(p[2] - p[0]).dot(sum(p, Vector()) / len(p) - c) < 0: K.f[k] = tuple(reversed(K.f[k]))
    else:
        for a in range(3):
            b1, b2 = (a + 1) % 3, (a + 2) % 3
            for sa in (-1, 1):
                q = []
                for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    s = [0, 0, 0]; s[a] = sa * h[a]; s[b1] = s1 * h[b1]; s[b2] = s2 * h[b2]
                    q.append(len(K.v)); K.v.append(pt(*s))
                if sa < 0: q.reverse()
                K._face(q, m)
        _outward(n0, c)
    return n0

def _sides(r, verts):
    return max(4, min(verts, 4 if r < 0.012 else 5 if r < 0.03 else 8 if r < 0.075 else 10 if r < 0.2 else 12 if r < 0.4 else 16))

def cyl(r, h, loc, m, rot=(0, 0, 0), verts=14, r2=None, bev=0.0, smooth=True):
    """A cylinder (or a cone, r below and r2 above) along its own z."""
    ax = _axes(rot); c = Vector(loc); r2 = r if r2 is None else r2; rm = max(r, r2)
    n0 = _piece(CYL, c, [ax[2], ax[0], ax[1]], (h / 2, rm, rm))
    ch = min(0.014, rm * 0.14, h * 0.28) if (rm >= 0.045 and h >= 0.024) else 0.0
    if ch > 0: prof = [(-h / 2, max(r - ch, 0.001)), (-h / 2 + ch, r), (h / 2 - ch, r2), (h / 2, max(r2 - ch, 0.001))]
    else: prof = [(-h / 2, max(r, 0.001)), (h / 2, max(r2, 0.001))]
    K.lathe(c, ax[2], prof, _sides(rm, verts), m, ref=ax[0])
    _outward(n0, c)
    return n0

def bar(p0, p1, r, m, verts=8):
    """A round bar between two points."""
    a, b = Vector(p0), Vector(p1); d = b - a; w = d.normalized()
    ref = Vector((0, 0, 1)) if abs(w.z) < 0.9 else Vector((1, 0, 0))
    u = (ref - w * ref.dot(w)).normalized(); c = (a + b) / 2
    n0 = _piece(CYL, c, [w, u, w.cross(u)], (d.length / 2, r, r))
    K.lathe(c, w, [(-d.length / 2, r), (d.length / 2, r)], max(3, min(verts, 3 if r < 0.0075 else 4 if r < 0.012 else 6)), m, ref=u)
    _outward(n0, c)
    return n0

def sph(r, loc, m, scale=(1, 1, 1), seg=14):
    c = Vector(loc); n = max(6, min(seg, 10)); lat = (-1.25, -0.68, 0.0, 0.68, 1.25)
    n0 = _piece(ROUND, c, [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))], (r * scale[0], r * scale[1], r * scale[2]))
    rings = [[tuple(c + Vector((math.cos(t) * math.cos(6.2832 * k / n) * r * scale[0], math.cos(t) * math.sin(6.2832 * k / n) * r * scale[1], math.sin(t) * r * scale[2])))
              for k in range(n)] for t in lat]
    K.loft(rings, m)
    _outward(n0, c)
    return n0

def torus(R, r, loc, m, rot=(0, 0, 0), seg=18):
    ax = _axes(rot); c = Vector(loc); n = max(6, min(seg, 6 if R < 0.06 else 8 if R < 0.13 else 12 if R < 0.4 else 16)); k_ = 3 if r < 0.013 else 4
    n0 = _piece(ROUND, c, [ax[0], ax[1], ax[2]], (R + r, R + r, r))
    rings = []
    for i in range(n + 1):
        a = 6.2832 * (i % n) / n; out = ax[0] * math.cos(a) + ax[1] * math.sin(a)
        rings.append([tuple(c + out * (R + r * math.cos(6.2832 * j / k_ + 0.7854)) + ax[2] * (r * math.sin(6.2832 * j / k_ + 0.7854))) for j in range(k_)])
    b = len(K.v)
    K.loft(rings, m, cap0=False, cap1=False)
    # the last ring is the first again: its points are dropped and its faces closed on the first ring's
    last = b + n * k_
    for k in range(n0, len(K.f)): K.f[k] = tuple(i - n * k_ if i >= last else i for i in K.f[k])
    del K.v[last:]
    vol = 0.0                                                          # outward: away from the ring's own centre line
    for f in K.f[n0:n0 + 1]:
        p = [Vector(K.v[i]) for i in f]; mid = sum(p, Vector()) / len(p); rel = mid - c
        flat = rel - ax[2] * rel.dot(ax[2]); core = c + flat.normalized() * R
        vol = (p[1] - p[0]).cross(p[2] - p[0]).dot(mid - core)
    if vol < 0:
        for k in range(n0, len(K.f)): K.f[k] = tuple(reversed(K.f[k]))
    return n0

def planks(w, d, h, loc, m, n, gap=0.006, along='x', bev=0.004):
    """A deck of n boards side by side."""
    out = []
    if along == 'x':
        pw = (d - gap * (n - 1)) / n
        for i in range(n): out.append(box((w, pw, h), (loc[0], loc[1] - d / 2 + pw / 2 + i * (pw + gap), loc[2]), m, bev=bev))
    else:
        pw = (w - gap * (n - 1)) / n
        for i in range(n): out.append(box((pw, d, h), (loc[0] - w / 2 + pw / 2 + i * (pw + gap), loc[1], loc[2]), m, bev=bev))
    return out

# ---- the builders -------------------------------------------------------------------------------------------------
def bomba():
    o = [box((1.3, 0.8, 0.12), (0, 0, 0.06), CONC(), bev=0.02)]
    o.append(cyl(0.2, 0.55, (0.28, 0, 0.4), BLUE(), rot=(0, math.pi / 2, 0), verts=20))             # the motor, lying
    for i in range(7): o.append(cyl(0.215, 0.025, (0.07 + i * 0.07, 0, 0.4), STEEL_D(), rot=(0, math.pi / 2, 0), verts=20))
    o.append(cyl(0.17, 0.04, (0.6, 0, 0.4), STEEL(), rot=(0, math.pi / 2, 0), verts=20))
    o.append(cyl(0.12, 0.1, (0.66, 0, 0.4), STEEL_D(), rot=(0, math.pi / 2, 0), verts=14))          # fan cover
    o.append(sph(0.27, (-0.28, 0, 0.42), BLUE(), (1, 0.85, 1)))                                  # the pump body (volute)
    o.append(cyl(0.2, 0.06, (-0.28, -0.22, 0.42), STEEL(), rot=(math.pi / 2, 0, 0), verts=16))      # the front cover
    for k in range(6): a = k * math.pi / 3; o.append(cyl(0.02, 0.05, (-0.28 + math.cos(a) * 0.15, -0.26, 0.42 + math.sin(a) * 0.15), STEEL_D(), rot=(math.pi / 2, 0, 0), verts=6))
    o.append(cyl(0.07, 0.34, (-0.28, 0, 0.75), STEEL(), verts=12)); o.append(cyl(0.1, 0.04, (-0.28, 0, 0.93), OCHRE(), verts=12))    # the outlet standing up, with its flange
    o.append(cyl(0.07, 0.4, (-0.65, 0, 0.42), STEEL(), rot=(0, math.pi / 2, 0), verts=12)); o.append(cyl(0.1, 0.04, (-0.83, 0, 0.42), OCHRE(), rot=(0, math.pi / 2, 0), verts=12))   # the inlet
    o.append(box((0.26, 0.16, 0.2), (0.38, 0.22, 0.66), BLACK(), bev=0.015))                      # the terminal box
    o.append(box((0.16, 0.012, 0.1), (0.38, 0.13, 0.66), STEEL(), bev=0.003))
    for sx in (-0.5, 0.5):
        for sy in (-0.3, 0.3): o.append(cyl(0.025, 0.05, (sx, sy, 0.14), STEEL(), verts=6))
    o.append(box((0.5, 0.1, 0.08), (0.2, -0.3, 0.16), STEEL_D(), bev=0.01))                       # the feet
    o.append(box((0.5, 0.1, 0.08), (0.2, 0.3, 0.16), STEEL_D(), bev=0.01))
    o.append(torus(0.07, 0.012, (-0.28, 0.0, 0.84), STEEL(), rot=(math.pi / 2, 0, 0)))
    return o

def filtro():
    o = [box((0.7, 0.7, 0.1), (0, 0, 0.05), CONC(), bev=0.02)]
    o.append(cyl(0.26, 0.06, (0, 0, 0.14), BLUE(), verts=20)); o.append(cyl(0.26, 0.07, (0, 0, 1.2), BLUE(), verts=20))
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        o.append(cyl(0.014, 1.12, (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.66), STEEL(), verts=6))
        for z in (0.12, 1.23): o.append(cyl(0.028, 0.03, (math.cos(a) * 0.22, math.sin(a) * 0.22, z + (0.04 if z > 1 else -0.04)), STEEL_D(), verts=6))
    o.append(cyl(0.08, 0.16, (0, 0, 1.31), STEEL(), verts=12))                                    # the outlet on top
    o.append(cyl(0.065, 0.3, (0.18, 0, 1.31), STEEL(), rot=(0, math.pi / 2, 0), verts=10))
    o.append(cyl(0.095, 0.035, (0.34, 0, 1.31), OCHRE(), rot=(0, math.pi / 2, 0), verts=12))
    o.append(cyl(0.065, 0.3, (-0.18, 0, 0.14), STEEL(), rot=(0, math.pi / 2, 0), verts=10))
    o.append(cyl(0.095, 0.035, (-0.34, 0, 0.14), OCHRE(), rot=(0, math.pi / 2, 0), verts=12))
    o.append(cyl(0.05, 0.05, (0, -0.12, 1.4), STEEL_D(), rot=(math.pi / 2, 0, 0), verts=12))     # a pressure gauge, no numbers
    o.append(cyl(0.035, 0.012, (0, -0.15, 1.4), mat((0.85, 0.82, 0.7)), rot=(math.pi / 2, 0, 0), verts=12))
    o.append(box((0.01, 0.012, 0.04), (0.005, -0.162, 1.405), RED(), rot=(0, 0.6, 0)))
    return o

def bateria_celula():
    o = [box((0.34, 0.56, 0.58), (0, 0, 0.29), GREEN(), bev=0.02)]
    o.append(box((0.3, 0.52, 0.04), (0, 0, 0.6), STEEL_D(), bev=0.01))
    for sx in (-0.09, 0.09): o.append(cyl(0.035, 0.07, (sx, 0.0, 0.66), STEEL(), verts=10)); o.append(cyl(0.05, 0.02, (sx, 0, 0.64), RED() if sx > 0 else BLACK(), verts=10))
    o.append(box((0.3, 0.012, 0.16), (0, -0.287, 0.3), mat((0.8, 0.74, 0.5)), bev=0.002))      # a blank label
    o.append(box((0.04, 0.5, 0.025), (0, 0, 0.64), STEEL(), bev=0.004))                          # the carry strap
    for z in (0.12, 0.45): o.append(box((0.35, 0.58, 0.02), (0, 0, z), STEEL_D(), bev=0.004))
    return o

def bateria_base():
    o = [box((1.7, 0.78, 0.1), (0, 0, 0.05), STEEL_D(), bev=0.01)]
    for sx in (-0.78, 0.78): o.append(box((0.08, 0.78, 0.14), (sx, 0, 0.17), STEEL_D(), bev=0.01))
    for i in range(3): o.append(box((0.05, 0.9, 0.02), (-0.5 + i * 0.5, 0, 0.7), mat((0.5, 0.4, 0.2), 'cloth'), bev=0.004))
    o.append(bar((-0.84, -0.3, 0.1), (-0.95, -0.5, 0.0), 0.025, RUBBER()))
    o.append(box((1.5, 0.05, 0.05), (0, 0.4, 0.78), BLACK(), bev=0.01))                         # the bus bar
    o.append(cyl(0.045, 0.1, (-0.7, 0.4, 0.74), RED(), verts=8))
    return o

def bancada(L=3.6):
    o = []
    o += planks(L, 0.8, 0.06, (0, 0, 0.9), WOOD(), 5, along='x', bev=0.008)
    for sx in (-1, 1):
        for sy in (-0.34, 0.34):
            o.append(box((0.07, 0.07, 0.9), (sx * (L / 2 - 0.15), sy, 0.45), STEEL_D(), bev=0.008))
        o.append(box((0.07, 0.7, 0.05), (sx * (L / 2 - 0.15), 0, 0.3), STEEL_D(), bev=0.008))
    o += planks(L - 0.2, 0.7, 0.04, (0, 0, 0.3), WOOD_D(), 4, along='x')
    o.append(box((L, 0.04, 0.05), (0, 0.4, 0.84), WOOD_D(), bev=0.004))
    # the pegboard on the back wall, with tool shapes
    o.append(box((L - 0.1, 0.03, 0.8), (0, 0.4, 1.55), mat((0.5, 0.4, 0.3), 'wood'), bev=0.006))
    for i in range(7):
        x = -L / 2 + 0.5 + i * ((L - 1.0) / 6)
        kind = i % 4
        if kind == 0: o.append(box((0.03, 0.025, 0.34), (x, 0.37, 1.58), STEEL(), bev=0.004)); o.append(box((0.09, 0.03, 0.07), (x, 0.37, 1.78), STEEL_D(), bev=0.004))   # a hammer
        elif kind == 1: o.append(box((0.05, 0.02, 0.42), (x, 0.375, 1.55), mat((0.6, 0.6, 0.62), 'metal'), bev=0.004)); o.append(cyl(0.035, 0.02, (x, 0.375, 1.78), STEEL(), rot=(math.pi / 2, 0, 0), verts=8))   # a wrench
        elif kind == 2: o.append(box((0.3, 0.015, 0.14), (x, 0.375, 1.62), STEEL(), rot=(0, 0.15, 0), bev=0.003)); o.append(box((0.1, 0.03, 0.05), (x + 0.2, 0.37, 1.55), OCHRE(), bev=0.004))   # a saw with a handle
        else: o.append(box((0.07, 0.03, 0.2), (x, 0.37, 1.6), RED(), bev=0.006)); o.append(box((0.025, 0.025, 0.18), (x, 0.37, 1.74), STEEL(), bev=0.003))   # pliers
    # on the top: a vise, an anvil, a jar of screws, a bench lamp, a few things
    o.append(box((0.22, 0.2, 0.14), (-L / 2 + 0.5, -0.05, 0.99), mat((0.22, 0.24, 0.27), 'metal'), bev=0.012)); o.append(box((0.06, 0.2, 0.06), (-L / 2 + 0.5, 0.0, 1.08), STEEL(), bev=0.006))
    o.append(cyl(0.015, 0.2, (-L / 2 + 0.5, -0.22, 1.0), STEEL(), rot=(math.pi / 2, 0, 0), verts=6)); o.append(box((0.2, 0.025, 0.025), (-L / 2 + 0.5, -0.3, 1.0), STEEL(), bev=0.004))
    o.append(box((0.26, 0.1, 0.12), (0.5, 0.05, 1.02), STEEL_D(), bev=0.012))
    # (no jar of screws at x = 0.95: the station radio stands there in the game)
    for i in range(3): o.append(box((0.04, 0.2 + 0.03 * i, 0.02), (0.1 - i * 0.1, -0.15, 0.95), [STEEL, OCHRE, STEEL][i](), rot=(0, 0, 0.3 * i), bev=0.003))
    o.append(box((0.1, 0.1, 0.03), (-0.6, 0.1, 0.95), BLACK(), bev=0.006)); o.append(bar((-0.6, 0.1, 0.96), (-0.45, 0.2, 1.4), 0.012, STEEL()))
    for i in range(3): o.append(box((0.3, 0.45, 0.08), (-0.9 + i * 0.6, 0.0, 0.52 + 0.0), mat([(0.35, 0.4, 0.45), (0.42, 0.33, 0.2), (0.3, 0.36, 0.3)][i], 'metal'), bev=0.01))   # boxes on the shelf below
    return o

def mesa(L=2.0):
    o = planks(L, 0.8, 0.045, (0, 0, 0.75), WOOD(), 5, along='x', gap=0.012)
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.25)
        for sy in (-0.3, 0.3): o.append(box((0.07, 0.07, 0.73), (x, sy, 0.365), WOOD_D(), bev=0.006))
        o.append(box((0.04, 0.7, 0.08), (x, 0, 0.62), WOOD_D(), bev=0.004))
    o.append(box((L - 0.5, 0.04, 0.08), (0, 0, 0.3), WOOD_D(), bev=0.004))
    o.append(box((0.5, 0.012, 0.012), (0.2, -0.2, 0.775), BLACK()))   # a burn mark
    o.append(cyl(0.08, 0.012, (-0.5, 0.15, 0.778), mat((0.75, 0.72, 0.62)), verts=16)); o.append(cyl(0.08, 0.012, (-0.2, -0.2, 0.778), mat((0.62, 0.66, 0.7)), verts=16))
    return o

def banco(L=1.8):
    o = planks(L, 0.3, 0.04, (0, 0, 0.44), WOOD_D(), 2, along='x', gap=0.01)
    for sx in (-1, 1):
        o.append(box((0.1, 0.26, 0.42), (sx * (L / 2 - 0.15), 0, 0.21), WOOD(), bev=0.008))
        o.append(box((0.1, 0.34, 0.05), (sx * (L / 2 - 0.15), 0, 0.025), WOOD(), bev=0.008))
    o.append(box((L - 0.4, 0.03, 0.07), (0, 0.1, 0.3), WOOD_D(), bev=0.004))
    return o

def colchao_base():
    o = []
    # a pallet-and-crates frame, a mattress with a stained ticking and a flat pillow
    for sx in (-0.4, 0, 0.4): o.append(box((0.12, 1.9, 0.1), (sx, 0, 0.05), WOOD_D(), bev=0.008))
    o += planks(0.9, 1.95, 0.025, (0, 0, 0.115), WOOD(), 9, along='y', gap=0.01)
    o.append(box((0.82, 1.84, 0.16), (0, 0, 0.21), mat((0.78, 0.74, 0.65), 'cloth'), bev=0.045))
    o.append(box((0.8, 0.012, 0.12), (0, -0.92, 0.21), mat((0.4, 0.5, 0.62)), bev=0.002))
    o.append(box((0.5, 0.32, 0.075), (0, 0.72, 0.33), mat((0.8, 0.78, 0.7), 'cloth'), bev=0.03))
    o.append(box((0.82, 0.04, 0.3), (0, 0.96, 0.17), WOOD_D(), bev=0.006))   # a head board
    return o

def colchao_manta():
    """The blanket (neutral, to be tinted): a folded sheet with a few folds, lying on the mattress at the feet."""
    o = [box((0.86, 1.1, 0.05), (0, -0.34, 0.305), CLOTH((0.82, 0.82, 0.8)), bev=0.022)]
    o.append(box((0.84, 0.3, 0.06), (0, 0.14, 0.31), CLOTH((0.78, 0.78, 0.76)), rot=(0.05, 0, 0), bev=0.025))   # the turned-down edge
    for i in range(3): o.append(box((0.8, 0.03, 0.022), (0, -0.5 + i * 0.3, 0.34), CLOTH((0.9, 0.9, 0.88)), rot=(0, 0.03 * (i - 1), 0), bev=0.008))
    return o

def caixa_dagua():
    o = [box((1.1, 1.1, 0.12), (0, 0, 0.06), WOOD_D(), bev=0.01)]
    o.append(box((1.1, 0.14, 0.1), (0, 0.5, 0.17), WOOD_D(), bev=0.01)); o.append(box((1.1, 0.14, 0.1), (0, -0.5, 0.17), WOOD_D(), bev=0.01))
    o.append(cyl(0.5, 1.2, (0, 0, 0.82), BLUE(), verts=22, bev=0.0))
    for z in (0.35, 1.0, 1.4): o.append(torus(0.505, 0.018, (0, 0, z), STEEL_D(), seg=22))
    o.append(cyl(0.5, 0.06, (0, 0, 1.45), BLUE(), verts=22, r2=0.42)); o.append(cyl(0.16, 0.07, (0.0, 0.1, 1.51), STEEL(), verts=14))   # the lid and its cap
    o.append(cyl(0.035, 0.2, (0, -0.54, 0.42), STEEL(), rot=(math.pi / 2, 0, 0), verts=10)); o.append(cyl(0.06, 0.05, (0, -0.65, 0.42), OCHRE(), rot=(math.pi / 2, 0, 0), verts=10))   # the tap
    o.append(bar((0.4, -0.45, 0.4), (0.4, -0.45, 1.3), 0.018, mat((0.7, 0.85, 0.9)), 8))    # the level tube
    return o

def armario():
    o = [box((0.9, 0.5, 1.84), (0, 0, 0.96), mat((0.33, 0.38, 0.4), 'metal', (0.2, 0.24, 0.26)), bev=0.012)]
    o.append(box((0.9, 0.5, 0.06), (0, 0, 0.03), BLACK(), bev=0.01))
    for sx in (-0.22, 0.22):
        o.append(box((0.42, 0.025, 1.76), (sx, -0.26, 0.97), mat((0.3, 0.36, 0.38), 'metal'), bev=0.008))
        for k in range(6): o.append(box((0.28, 0.02, 0.02), (sx, -0.285, 1.5 + k * 0.04), BLACK()))   # the vent slits
    o.append(box((0.03, 0.04, 0.2), (-0.03, -0.29, 1.0), OCHRE(), bev=0.006)); o.append(box((0.03, 0.04, 0.2), (0.03, -0.29, 1.0), OCHRE(), bev=0.006))
    o.append(box((0.06, 0.05, 0.08), (0, -0.29, 0.86), STEEL_D(), bev=0.01))   # the hasp
    o.append(box((0.4, 0.02, 0.25), (-0.2, -0.28, 0.5), mat((0.28, 0.32, 0.34), 'metal'), rot=(0, 0.04, 0), bev=0.004))   # a dent patch
    return o

def balde():
    o = [cyl(0.14, 0.3, (0, 0, 0.15), mat((0.55, 0.15, 0.12), 'metal'), verts=16, r2=0.17)]
    o.append(torus(0.17, 0.012, (0, 0, 0.3), STEEL_D(), seg=16)); o.append(cyl(0.12, 0.01, (0, 0, 0.012), BLACK(), verts=14))
    for k in range(10):
        a = math.pi * k / 9; o.append(cyl(0.008, 0.07, (math.cos(a) * 0.17, 0, 0.3 + math.sin(a) * 0.17), STEEL(), rot=(0, a - math.pi / 2 + 0.0, 0), verts=5))
    return o

def cozinha(L=3.6):
    o = []
    for sx in (-1, 1):
        for sy in (-0.28, 0.28): o.append(box((0.08, 0.08, 0.8), (sx * (L / 2 - 0.1), sy, 0.4), STEEL_D(), bev=0.01))
    o.append(box((L, 0.62, 0.05), (0, 0, 0.84), mat((0.55, 0.57, 0.58), 'metal'), bev=0.01))
    o += planks(L - 0.1, 0.55, 0.035, (0, 0, 0.3), WOOD_D(), 4, along='x')
    for i in range(4): o.append(box((0.8, 0.5, 0.26), (-L / 2 + 0.6 + i * 0.85, 0.0, 0.46), mat([(0.4, 0.3, 0.2), (0.3, 0.4, 0.45), (0.5, 0.2, 0.15), (0.35, 0.38, 0.3)][i], 'metal'), bev=0.015))   # tins and crates under the counter
    x0 = -L / 2 + 0.55
    o.append(box((0.6, 0.42, 0.1), (x0, 0, 0.91), BLACK(), bev=0.01))                            # the camp stove
    for dx in (-0.14, 0.14):
        o.append(cyl(0.085, 0.018, (x0 + dx, -0.04, 0.975), STEEL_D(), verts=12)); 
        for k in range(4): o.append(box((0.1, 0.012, 0.012), (x0 + dx, -0.04, 0.99), STEEL_D(), rot=(0, 0, k * math.pi / 4)))
    o.append(cyl(0.14, 0.18, (x0 - 0.14, -0.04, 1.08), STEEL(), verts=14, r2=0.15)); o.append(cyl(0.15, 0.02, (x0 - 0.14, -0.04, 1.18), STEEL_D(), verts=14))   # a pot
    o.append(cyl(0.015, 0.1, (x0 + 0.1, -0.24, 0.96), OCHRE(), rot=(0, 1.57, 0), verts=8))
    o.append(box((0.5, 0.4, 0.05), (L / 2 - 0.55, 0, 0.88), STEEL(), bev=0.01)); o.append(box((0.4, 0.3, 0.04), (L / 2 - 0.55, 0, 0.9), mat((0.1, 0.12, 0.14)), bev=0.01))   # the sink basin
    o.append(bar((L / 2 - 0.55, 0.2, 0.9), (L / 2 - 0.55, 0.2, 1.1), 0.016, STEEL())); o.append(bar((L / 2 - 0.55, 0.2, 1.1), (L / 2 - 0.55, 0.05, 1.1), 0.016, STEEL()))
    # the wall: pallet boards behind, a shelf of cans, hooks with a ladle
    o += planks(L, 0.04, 0.06, (0, 0.34, 1.3), WOOD(), 1)
    for i in range(6): o.append(box((L - 0.1, 0.03, 0.17), (0, 0.33, 1.05 + i * 0.2), WOOD() if i % 2 else WOOD_D(), bev=0.004))
    o.append(box((1.2, 0.2, 0.04), (0.2, 0.26, 1.55), WOOD_D(), bev=0.005)); o.append(box((1.2, 0.2, 0.04), (0.2, 0.26, 1.95), WOOD_D(), bev=0.005))
    for k in range(8): o.append(cyl(0.04, 0.1, (-0.3 + k * 0.14, 0.26, 1.62), mat([(0.7, 0.66, 0.5), (0.5, 0.58, 0.55), (0.7, 0.35, 0.25)][k % 3], 'metal'), verts=9))
    for k in range(5): o.append(box((0.12, 0.1, 0.12), (-0.1 + k * 0.2, 0.26, 2.03), mat([(0.5, 0.4, 0.25), (0.35, 0.4, 0.35)][k % 2], 'cloth'), bev=0.01))
    o.append(bar((-1.1, 0.3, 1.75), (-1.1, 0.3, 1.35), 0.008, STEEL())); o.append(cyl(0.05, 0.02, (-1.1, 0.3, 1.33), STEEL(), verts=8))
    return o

def palete():
    o = []
    for sy in (-0.5, 0, 0.5): o.append(box((1.2, 0.1, 0.09), (0, sy * 0.78, 0.045), WOOD_D(), bev=0.006))
    o += planks(1.2, 0.78, 0.022, (0, 0, 0.1), WOOD(), 6, along='x', gap=0.04)
    o += planks(1.2, 0.78, 0.022, (0, 0, 0.0), WOOD(), 3, along='x', gap=0.2)
    return o

def saco_cimento():
    o = [box((0.5, 0.32, 0.1), (0, 0, 0.05), mat((0.74, 0.7, 0.6), 'cloth'), bev=0.04)]
    o.append(box((0.42, 0.26, 0.04), (0, 0, 0.12), mat((0.7, 0.66, 0.56), 'cloth'), bev=0.015))
    o.append(box((0.3, 0.012, 0.07), (0, -0.162, 0.06), mat((0.62, 0.3, 0.2)), bev=0.002))
    return o

def betoneira():
    o = []
    for sx in (-1, 1):
        o.append(box((0.06, 0.06, 0.7), (sx * 0.3, 0.2, 0.55), mat((0.7, 0.25, 0.1), 'metal'), rot=(0.25, 0, 0), bev=0.006))
        o.append(box((0.06, 0.06, 0.7), (sx * 0.3, -0.2, 0.55), mat((0.7, 0.25, 0.1), 'metal'), rot=(-0.25, 0, 0), bev=0.006))
        o.append(cyl(0.2, 0.07, (sx * 0.38, -0.35, 0.2), RUBBER(), rot=(0, math.pi / 2, 0), verts=14))
        o.append(box((0.06, 0.8, 0.05), (sx * 0.3, 0, 0.3), mat((0.7, 0.25, 0.1), 'metal'), bev=0.006))
    o.append(box((0.8, 0.06, 0.06), (0, 0.38, 0.3), mat((0.7, 0.25, 0.1), 'metal'), bev=0.006))
    o.append(bar((-0.5, 0.42, 0.3), (-0.5, 0.9, 0.7), 0.025, STEEL_D()))   # the handle
    o.append(bar((0.5, 0.42, 0.3), (0.5, 0.9, 0.7), 0.025, STEEL_D()))
    o.append(box((0.5, 0.06, 0.04), (0, 0.9, 0.7), STEEL_D(), bev=0.006))
    # the drum, tilted: a cone below, a cylinder in the middle, a cone at the mouth
    ax = (0.7, 0, 0)
    o.append(cyl(0.45, 0.4, (0, -0.02, 0.95), mat((0.6, 0.22, 0.1), 'metal', (0.35, 0.14, 0.08)), rot=ax, verts=22, r2=0.45))
    o.append(cyl(0.45, 0.35, (0, 0.17, 1.15), mat((0.6, 0.22, 0.1), 'metal', (0.35, 0.14, 0.08)), rot=ax, verts=22, r2=0.2))
    o.append(torus(0.46, 0.025, (0, -0.02, 0.95), STEEL_D(), rot=ax, seg=22))
    o.append(cyl(0.25, 0.04, (0, -0.2, 0.8), STEEL_D(), rot=ax, verts=16))
    o.append(sph(0.03, (0, 0, 0.72), STEEL(), seg=8))
    o.append(box((0.25, 0.22, 0.2), (0.0, 0.0, 0.7), STEEL_D(), bev=0.02))   # the motor
    o.append(box((0.3, 0.3, 0.02), (0, -0.05, 1.3), mat((0.56, 0.54, 0.5), 'concrete'), rot=(0.7, 0, 0)))   # dried cement crust
    return o

def andaime():
    o = []
    for sx in (-1, 1):
        for sy in (-0.4, 0.4):
            o.append(cyl(0.024, 2.3, (sx * 0.9, sy, 1.15), mat((0.45, 0.48, 0.5), 'metal'), verts=8))
            for z in (0.55, 1.6): o.append(cyl(0.032, 0.05, (sx * 0.9, sy, z), STEEL_D(), verts=8))
    for z in (0.55, 1.6):
        for sy in (-0.4, 0.4): o.append(cyl(0.02, 1.8, (0, sy, z), mat((0.5, 0.52, 0.55), 'metal'), rot=(0, math.pi / 2, 0), verts=8))
        for sx in (-0.9, 0.9): o.append(cyl(0.02, 0.8, (sx, 0, z + 0.02), mat((0.5, 0.52, 0.55), 'metal'), rot=(math.pi / 2, 0, 0), verts=8))
    o.append(bar((-0.9, -0.4, 0.55), (0.9, -0.4, 1.6), 0.014, STEEL_D(), 6)); o.append(bar((0.9, 0.4, 0.55), (-0.9, 0.4, 1.6), 0.014, STEEL_D(), 6))   # cross braces
    o += planks(1.8, 0.8, 0.04, (0, 0, 1.62), WOOD_D(), 3, along='x', gap=0.012)
    o.append(box((0.04, 0.8, 0.05), (0.2, 0, 1.675), WOOD(), bev=0.004))
    o += planks(1.8, 0.04, 0.2, (0, 0.42, 1.8), WOOD(), 1)   # a toe board
    return o

def pilar_forma(H=3.3):
    """A concrete column with its formwork half taken off, rebar standing out of the top, and the marks of the boards."""
    o = [box((0.7, 0.7, 0.14), (0, 0, 0.07), CONC(), bev=0.02)]
    o.append(box((0.5, 0.5, H - 0.1), (0, 0, 0.14 + (H - 0.14) / 2 - 0.05), CONC(), bev=0.012))
    for k in range(7):   # the board marks: strips a little raised
        o.append(box((0.515, 0.515, 0.012), (0, 0, 0.4 + k * 0.45), mat((0.55, 0.52, 0.46), 'concrete'), bev=0.003))
    # formwork still on the lower half of two sides: plywood sheets and the walers (the cross timbers) with their ties
    o.append(box((0.55, 0.035, 1.5), (0, -0.28, 0.9), PLY(), bev=0.004)); o.append(box((0.035, 0.55, 1.5), (0.28, 0, 0.9), PLY(), bev=0.004))
    for z in (0.35, 0.95, 1.55): o.append(box((0.7, 0.07, 0.08), (0, -0.33, z), WOOD_D(), bev=0.006)); o.append(box((0.07, 0.7, 0.08), (0.33, 0, z), WOOD_D(), bev=0.006))
    for z in (0.35, 0.95, 1.55): o.append(cyl(0.012, 0.9, (0, 0, z + 0.0), STEEL_D(), rot=(math.pi / 2, 0, 0), verts=5))   # tie rods
    # the rebar at the top, bent
    for sx in (-0.19, 0.19):
        for sy in (-0.19, 0.19): o.append(bar((sx, sy, H - 0.2), (sx * 1.05, sy * 1.05, H + 0.55), 0.011, mat((0.45, 0.25, 0.14), 'metal'), 6))
    o.append(box((0.5, 0.5, 0.05), (0, 0, H - 0.07), mat((0.5, 0.48, 0.44), 'concrete'), bev=0.01))
    for z in (H + 0.15, H + 0.35): o.append(box((0.42, 0.012, 0.012), (0, -0.2, z), mat((0.45, 0.25, 0.14), 'metal'))); o.append(box((0.42, 0.012, 0.012), (0, 0.2, z), mat((0.45, 0.25, 0.14), 'metal')))
    return o

def forma_tabuas():
    """Plywood sheets leaning on a wall with a timber prop, and a few offcuts on the floor."""
    o = []
    for i in range(3): o.append(box((1.2, 0.02, 1.9), (-0.45 + i * 0.5, 0.18 - i * 0.02, 0.95), PLY(), rot=(-0.11 - i * 0.02, 0, 0), bev=0.003))
    o.append(box((0.07, 0.07, 1.2), (0.3, -0.25, 0.55), WOOD_D(), rot=(-0.55, 0, 0), bev=0.005))
    o.append(box((1.0, 0.2, 0.025), (0.2, -0.45, 0.012), WOOD(), rot=(0, 0, 0.4), bev=0.004)); o.append(box((0.7, 0.14, 0.025), (-0.3, -0.5, 0.012), WOOD_D(), rot=(0, 0, -0.2), bev=0.004))
    return o

def tambor():
    o = [cyl(0.29, 0.88, (0, 0, 0.44), mat((0.2, 0.35, 0.5), 'metal', (0.1, 0.2, 0.3)), verts=20)]
    for z in (0.1, 0.44, 0.78): o.append(torus(0.295, 0.016, (0, 0, z), STEEL_D(), seg=20))
    o.append(cyl(0.3, 0.03, (0, 0, 0.885), STEEL(), verts=20)); o.append(cyl(0.3, 0.03, (0, 0, 0.015), STEEL_D(), verts=20))
    o.append(cyl(0.04, 0.03, (0.12, 0.08, 0.91), STEEL_D(), verts=8)); o.append(cyl(0.025, 0.03, (-0.12, -0.1, 0.91), STEEL_D(), verts=8))
    return o

def caixote():
    o = []
    for sx in (-0.4, 0.4):
        for sy in (-0.4, 0.4): o.append(box((0.07, 0.07, 0.7), (sx, sy, 0.35), WOOD_D(), bev=0.005))
    for k in range(4):
        z = 0.1 + k * 0.17
        o.append(box((0.9, 0.025, 0.12), (0, -0.41, z + 0.05), WOOD(), bev=0.004)); o.append(box((0.9, 0.025, 0.12), (0, 0.41, z + 0.05), WOOD(), bev=0.004))
        o.append(box((0.025, 0.9, 0.12), (-0.41, 0, z + 0.05), WOOD(), bev=0.004)); o.append(box((0.025, 0.9, 0.12), (0.41, 0, z + 0.05), WOOD(), bev=0.004))
    o.append(box((0.8, 0.8, 0.02), (0, 0, 0.08), WOOD_D(), bev=0.003))
    o.append(box((0.5, 0.012, 0.03), (0, -0.425, 0.18), BLACK()))
    return o

def prateleira_modulo():
    o = []
    for sx in (-0.5, 0.5):
        for sy in (-0.2, 0.2): o.append(box((0.04, 0.04, 1.9), (sx, sy, 0.95), mat((0.3, 0.35, 0.38), 'metal'), bev=0.004))
    for k in range(4): o += planks(1.0, 0.42, 0.035, (0, 0, 0.24 + k * 0.5), WOOD_D(), 2, along='x', gap=0.01)
    for sy in (-0.2, 0.2): o.append(bar((-0.5, sy, 0.1), (0.5, sy, 1.6), 0.008, STEEL_D(), 5))
    for z in (0.24, 1.74): o.append(box((1.04, 0.02, 0.04), (0, -0.2, z - 0.04), STEEL_D(), bev=0.003))
    return o

def lampada_gaiola():
    o = [cyl(0.035, 0.07, (0, 0, 0.05), BLACK(), verts=10), cyl(0.05, 0.04, (0, 0, 0.0), STEEL_D(), verts=12)]
    o.append(torus(0.09, 0.008, (0, 0, -0.13), STEEL_D(), seg=14)); o.append(torus(0.075, 0.008, (0, 0, -0.04), STEEL_D(), seg=14))
    for k in range(8):
        a = k * math.pi / 4; o.append(bar((math.cos(a) * 0.075, math.sin(a) * 0.075, -0.04), (math.cos(a) * 0.09, math.sin(a) * 0.09, -0.13), 0.006, STEEL_D(), 4))
    o.append(torus(0.045, 0.008, (0, 0, -0.18), STEEL_D(), seg=10))
    for k in range(4):
        a = k * math.pi / 2; o.append(bar((math.cos(a) * 0.09, math.sin(a) * 0.09, -0.13), (math.cos(a) * 0.03, math.sin(a) * 0.03, -0.19), 0.006, STEEL_D(), 4))
    return o

def valvula():
    o = [cyl(0.06, 0.18, (0, 0, 0.0), mat((0.5, 0.2, 0.12), 'metal'), rot=(0, math.pi / 2, 0), verts=12), cyl(0.1, 0.03, (-0.11, 0, 0), STEEL(), rot=(0, math.pi / 2, 0), verts=14), cyl(0.1, 0.03, (0.11, 0, 0), STEEL(), rot=(0, math.pi / 2, 0), verts=14)]
    o.append(sph(0.085, (0, 0, 0.07), mat((0.5, 0.2, 0.12), 'metal'), seg=12))
    o.append(cyl(0.015, 0.14, (0, 0, 0.18), STEEL(), verts=8))
    o.append(torus(0.1, 0.014, (0, 0, 0.26), RED(), seg=16))
    for k in range(4): a = k * math.pi / 2; o.append(bar((0, 0, 0.26), (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.26), 0.01, RED(), 5))
    return o

def trilho():
    """A stretch of rail the builders left: two rails on loose sleepers, with the fastenings."""
    o = []
    for i in range(4): o.append(box((0.26, 2.4, 0.16), (-0.6 + i * 0.8 + (0.06 if i == 2 else 0), 0, 0.08), CONC(), rot=(0, 0, 0.0), bev=0.015))
    for sy in (-0.72, 0.72):
        o.append(box((3.2, 0.07, 0.04), (0, sy, 0.18), STEEL_D(), bev=0.004)); o.append(box((3.2, 0.03, 0.11), (0, sy, 0.255), mat((0.4, 0.22, 0.13), 'metal', (0.25, 0.14, 0.1)), bev=0.006)); o.append(box((3.2, 0.075, 0.035), (0, sy, 0.33), mat((0.5, 0.3, 0.2), 'metal'), bev=0.008))
        for i in range(4): o.append(box((0.08, 0.1, 0.03), (-0.6 + i * 0.8, sy, 0.2), STEEL_D(), bev=0.004))
    return o

def div_chapa():
    """A partition module of corrugated sheets on posts, 1.9 wide, 1.15 high: the sheets overlap and are bolted to a pallet-wood frame."""
    o = []
    for k in range(5):
        x = -0.76 + k * 0.38
        for j in range(4): o.append(box((0.1, 0.012, 1.1), (x + j * 0.09 - 0.14, 0 + (0.012 if (j % 2) else 0), 0.58 + (0.02 if k % 2 else 0)), mat((0.45, 0.5, 0.5) if k % 2 else (0.52, 0.42, 0.32), 'metal', (0.3, 0.2, 0.15)), bev=0.002))
    for x in (-0.93, 0, 0.93): o.append(box((0.07, 0.06, 1.15), (x, 0.04, 0.575), WOOD_D(), bev=0.005))
    for z in (0.2, 0.95): o.append(box((1.9, 0.05, 0.07), (0, 0.04, z), WOOD(), bev=0.005))
    for x in (-0.55, 0.25): o.append(cyl(0.012, 0.03, (x, -0.02, 0.5), STEEL(), rot=(math.pi / 2, 0, 0), verts=6))
    return o

def div_palete():
    o = []
    for k in range(2):
        x = -0.48 + k * 0.96
        for sx in (-0.4, 0, 0.4): o.append(box((0.07, 0.1, 1.12), (x + sx * 0.8 * 0.5 * 0.0 + (0 if sx == 0 else sx * 0.75), 0, 0.56), WOOD_D(), bev=0.005)) if False else None
        o += [box((0.1, 0.1, 1.15), (x + dx, 0, 0.575), WOOD_D(), bev=0.006) for dx in (-0.4, 0, 0.4)]
        for j in range(6): o.append(box((0.92, 0.022, 0.1), (x, -0.06, 0.1 + j * 0.2), WOOD(), bev=0.003))
    o.append(box((0.04, 0.05, 1.15), (0, 0.07, 0.575), STEEL_D(), bev=0.004))
    o.append(box((1.9, 0.04, 0.04), (0, 0.075, 0.5), STEEL_D(), bev=0.004))
    return o

def div_lona():
    o = [bar((-0.95, 0, 1.12), (0.95, 0, 1.12), 0.014, STEEL_D(), 6)]
    for k in range(10):
        x = -0.85 + k * 0.19
        o.append(box((0.2, 0.02 + (k % 2) * 0.012, 1.05 - (k % 3) * 0.06), (x, (k % 2) * 0.02, 0.6 + (k % 3) * 0.03), mat((0.32, 0.45, 0.5) if True else (0, 0, 0), 'cloth', (0.2, 0.3, 0.36)), rot=(0, 0, 0.02 * ((k % 3) - 1)), bev=0.008))
    for x in (-0.95, 0.95): o.append(cyl(0.025, 1.15, (x, 0, 0.575), STEEL_D(), verts=6))
    for k in range(5): o.append(torus(0.016, 0.005, (-0.76 + k * 0.38, 0, 1.12), BLACK(), rot=(math.pi / 2, 0, 0), seg=8))
    o.append(box((1.8, 0.012, 0.28), (0, 0.02, 0.15), mat((0.32, 0.45, 0.5), 'cloth'), bev=0.004))
    return o

def div_grade():
    o = []
    for x in (-0.94, 0.94): o.append(box((0.05, 0.05, 1.15), (x, 0, 0.575), STEEL_D(), bev=0.004))
    for z in (0.08, 0.6, 1.12): o.append(box((1.9, 0.04, 0.04), (0, 0, z), STEEL_D(), bev=0.004))
    for k in range(14): o.append(cyl(0.011, 1.06, (-0.85 + k * 0.13, 0, 0.6), mat((0.4, 0.3, 0.24), 'metal', (0.28, 0.2, 0.15)), verts=5))
    o.append(bar((-0.94, 0, 0.1), (0.94, 0, 1.1), 0.012, STEEL_D(), 5))
    return o

def sinalizacao_faixa():
    return [box((1.0, 0.04, 0.2), (0, 0, 0.1), mat((0.86, 0.7, 0.12)), bev=0.002)]

def cabo_bobina():
    o = [cyl(0.3, 0.05, (0, 0, 0.3), WOOD(), rot=(math.pi / 2, 0, 0), verts=16), cyl(0.3, 0.05, (0, 0.34, 0.3), WOOD(), rot=(math.pi / 2, 0, 0), verts=16)]
    o.append(cyl(0.2, 0.3, (0, 0.17, 0.3), mat((0.1, 0.1, 0.11), 'cloth'), rot=(math.pi / 2, 0, 0), verts=18))
    o.append(cyl(0.06, 0.34, (0, 0.17, 0.3), WOOD_D(), rot=(math.pi / 2, 0, 0), verts=10))
    return o

def trapo_tambor():
    return tambor()

# ---- the props that used to be a downloaded shape: made here now, to the same size, pivot and front ---------------------------------
def galao():
    """A steel jerrycan, 0.34 wide, 0.456 high, 0.174 deep: a pressed body, three handle bars, a spout with a cap."""
    g = mat((0.2, 0.27, 0.17), 'coat')
    o = [box((0.34, 0.174, 0.37), (0, 0, 0.185), g, bev=0.022)]
    o.append(box((0.3, 0.15, 0.03), (0, 0, 0.375), g, bev=0.009))
    for sy in (-0.045, 0, 0.045): o.append(bar((-0.02, sy, 0.44), (0.13, sy, 0.44), 0.009, g, 5))
    for sx in (-0.02, 0.13): o.append(box((0.016, 0.12, 0.06), (sx, 0, 0.415), g, bev=0.003))
    o.append(cyl(0.028, 0.06, (-0.115, 0, 0.415), STEEL_D(), rot=(0, -0.45, 0), verts=8)); o.append(cyl(0.034, 0.02, (-0.128, 0, 0.44), OCHRE(), rot=(0, -0.45, 0), verts=8))
    return o

def caixa_ferramentas():
    """A workshop tool chest on a low frame, 0.69 wide, 0.65 high, 0.42 deep: three drawers, a lid, side handles."""
    r_ = mat((0.52, 0.13, 0.09), 'coat')
    o = [box((0.69, 0.42, 0.44), (0, 0, 0.3), r_, bev=0.014)]
    o.append(box((0.69, 0.42, 0.1), (0, 0, 0.585), r_, bev=0.012))                               # the lid
    o.append(box((0.6, 0.012, 0.02), (0, -0.215, 0.535), STEEL_D(), bev=0.003))                  # its latch bar
    for k in range(3):
        z = 0.15 + k * 0.13
        o.append(box((0.62, 0.016, 0.105), (0, -0.212, z + 0.02), mat((0.46, 0.11, 0.08), 'coat'), bev=0.004))
        o.append(box((0.3, 0.016, 0.016), (0, -0.228, z + 0.045), STEEL(), bev=0.003))
    for sx in (-1, 1):
        o.append(bar((sx * 0.352, -0.08, 0.36), (sx * 0.352, 0.08, 0.36), 0.01, STEEL(), 5))
        for sy in (-0.08, 0.08): o.append(box((0.02, 0.02, 0.03), (sx * 0.348, sy, 0.36), STEEL_D()))
        for sy in (-0.16, 0.16): o.append(box((0.05, 0.05, 0.08), (sx * 0.3, sy, 0.04), STEEL_D(), bev=0.006))
    for sx in (-0.2, 0.2): o.append(box((0.045, 0.02, 0.05), (sx, -0.218, 0.565), STEEL(), bev=0.004))   # latches
    o.append(bar((-0.12, 0, 0.66), (0.12, 0, 0.66), 0.01, STEEL(), 5))
    for sx in (-0.12, 0.12): o.append(box((0.02, 0.03, 0.035), (sx, 0, 0.645), STEEL_D()))
    return o

def cama_improvisada():
    """An iron day bed, 1.97 long, 1.13 high at the back, 0.85 deep: a frame of tube, a thin mattress, a blanket thrown over."""
    it = mat((0.2, 0.2, 0.21), 'steel')
    o = []
    for sx in (-0.95, 0.95):
        o.append(box((0.045, 0.045, 1.13), (sx, 0.4, 0.565), it, bev=0.007)); o.append(box((0.045, 0.045, 0.62), (sx, -0.4, 0.31), it, bev=0.007))
        o.append(box((0.035, 0.8, 0.035), (sx, 0, 0.3), it, bev=0.006)); o.append(box((0.035, 0.8, 0.035), (sx, 0, 0.6), it, bev=0.006))
    for z in (0.75, 1.08): o.append(box((1.9, 0.035, 0.035), (0, 0.4, z), it, bev=0.006))
    for k in range(7): o.append(bar((-0.8 + k * 0.266, 0.4, 0.75), (-0.8 + k * 0.266, 0.4, 1.08), 0.009, it, 5))
    for sy in (-0.4, 0.4): o.append(box((1.9, 0.035, 0.05), (0, sy, 0.3), it, bev=0.006))
    o += planks(1.86, 0.78, 0.02, (0, 0, 0.335), WOOD_D(), 4, along='x', gap=0.02)
    o.append(box((1.84, 0.76, 0.12), (0, 0, 0.405), mat((0.62, 0.6, 0.5), 'cloth'), bev=0.035))
    o.append(box((0.5, 0.3, 0.08), (-0.62, 0.12, 0.5), mat((0.72, 0.7, 0.62), 'cloth'), bev=0.03))
    o.append(box((0.9, 0.8, 0.035), (0.45, 0.0, 0.48), mat((0.3, 0.2, 0.16), 'cloth'), rot=(0, 0, 0.05), bev=0.014))
    return o

def fogareiro():
    """A stove made of a steel drum, 0.6 across, 0.89 high: a door cut in the front, a grate, a flue elbow at the back, three legs."""
    d = mat((0.13, 0.11, 0.1), 'rust')
    o = [cyl(0.3, 0.62, (0, 0, 0.47), d, verts=14)]
    for z in (0.3, 0.64): o.append(torus(0.303, 0.014, (0, 0, z), STEEL_D(), seg=14))
    o.append(cyl(0.31, 0.03, (0, 0, 0.79), STEEL_D(), verts=14))
    o.append(box((0.24, 0.02, 0.2), (0, -0.295, 0.42), BLACK(), bev=0.004)); o.append(box((0.26, 0.015, 0.03), (0, -0.305, 0.535), STEEL_D(), bev=0.003))
    o.append(box((0.2, 0.012, 0.16), (0.13, -0.33, 0.42), d, rot=(0, 0, -0.9), bev=0.004))        # the door, open
    for k in range(3):
        a = k * 2.094 + 0.5; o.append(bar((math.cos(a) * 0.24, math.sin(a) * 0.24, 0.17), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.0), 0.016, STEEL_D(), 5))
    o.append(cyl(0.07, 0.12, (0, 0.2, 0.83), STEEL_D(), verts=8)); o.append(cyl(0.07, 0.16, (0, 0.27, 0.86), STEEL_D(), rot=(math.pi / 2, 0, 0), verts=8))
    for k in range(5): o.append(bar((-0.2 + k * 0.1, -0.2, 0.805), (-0.2 + k * 0.1, 0.12, 0.805), 0.008, STEEL(), 4))
    return o

def gerador():
    """A portable generator in its tube frame, 0.79 wide, 0.56 high, 0.58 deep."""
    y_ = mat((0.62, 0.42, 0.08), 'coat'); k_ = STEEL_D()
    o = []
    for sy in (-0.27, 0.27):
        for z in (0.03, 0.54): o.append(bar((-0.38, sy, z), (0.38, sy, z), 0.014, k_, 6))
        for sx in (-0.38, 0.38): o.append(bar((sx, sy, 0.03), (sx, sy, 0.54), 0.014, k_, 6))
    for sx in (-0.38, 0.38):
        for z in (0.03, 0.54): o.append(bar((sx, -0.27, z), (sx, 0.27, z), 0.014, k_, 6))
    o.append(box((0.5, 0.36, 0.13), (-0.05, 0, 0.455), y_, bev=0.03))                            # the tank
    o.append(cyl(0.035, 0.03, (-0.15, 0.0, 0.53), BLACK(), verts=8))
    o.append(box((0.34, 0.34, 0.26), (-0.14, 0, 0.21), mat((0.2, 0.21, 0.23), 'steel'), bev=0.02))   # the engine
    for k in range(5): o.append(box((0.3, 0.36, 0.012), (-0.14, 0, 0.12 + k * 0.045), k_))        # its fins
    o.append(cyl(0.15, 0.2, (0.2, 0, 0.22), mat((0.2, 0.21, 0.23), 'steel'), rot=(0, math.pi / 2, 0), verts=12))   # the alternator
    o.append(box((0.2, 0.03, 0.2), (0.2, -0.255, 0.3), BLACK(), bev=0.006))                       # the panel: two outlets, a switch
    for sx in (0.15, 0.25): o.append(cyl(0.028, 0.012, (sx, -0.273, 0.33), mat((0.75, 0.72, 0.62)), rot=(math.pi / 2, 0, 0), verts=8))
    o.append(box((0.03, 0.014, 0.045), (0.2, -0.275, 0.25), RED(), bev=0.003))
    o.append(cyl(0.06, 0.05, (-0.14, -0.2, 0.25), BLACK(), rot=(math.pi / 2, 0, 0), verts=10))     # the pull start
    o.append(cyl(0.045, 0.24, (-0.1, 0.22, 0.14), mat((0.3, 0.2, 0.15), 'rust'), rot=(0, math.pi / 2, 0), verts=8))   # the muffler
    for sx in (-0.3, 0.3):
        for sy in (-0.27, 0.27): o.append(cyl(0.03, 0.03, (sx, sy, 0.015), RUBBER(), verts=8))
    return o

def quadro():
    """A switchboard cabinet, 0.52 wide, 1.12 high, 0.43 deep: a door with a handle, hinges, a conduit entering on top, a base."""
    g = mat((0.36, 0.42, 0.44), 'coat')
    o = [box((0.52, 0.4, 1.02), (0, 0.015, 0.61), g, bev=0.014)]
    o.append(box((0.5, 0.4, 0.1), (0, 0.015, 0.05), CONC(), bev=0.012))
    o.append(box((0.46, 0.02, 0.92), (0, -0.2, 0.62), mat((0.4, 0.46, 0.48), 'coat'), bev=0.006))   # the door
    o.append(box((0.03, 0.03, 0.14), (0.17, -0.215, 0.62), STEEL_D(), bev=0.006))
    for z in (0.3, 0.94): o.append(cyl(0.014, 0.08, (-0.235, -0.2, z), STEEL_D(), verts=5))
    o.append(box((0.56, 0.44, 0.02), (0, 0.01, 1.11), g, rot=(0.06, 0, 0), bev=0.004))            # the rain lid
    o.append(cyl(0.03, 0.1, (0.14, 0.1, 1.07), STEEL(), verts=8))
    for k in range(4): o.append(box((0.2, 0.012, 0.012), (-0.08, -0.212, 0.9 + k * 0.03), BLACK()))
    return o

def carrinho():
    """A workshop cart, 1.25 long, 0.965 high, 0.8 deep: two steel trays on a tube frame, a push bar, four castors, things left on it."""
    f = mat((0.42, 0.18, 0.12), 'coat')
    o = []
    for sx in (-0.5, 0.5):
        for sy in (-0.32, 0.32): o.append(box((0.04, 0.04, 0.72), (sx, sy, 0.48), f, bev=0.006)); o.append(cyl(0.05, 0.035, (sx, sy, 0.05), RUBBER(), rot=(math.pi / 2, 0, 0), verts=8)); o.append(box((0.03, 0.05, 0.07), (sx, sy, 0.1), STEEL_D()))
    for z in (0.26, 0.8):
        o.append(box((1.08, 0.72, 0.025), (0, 0, z), mat((0.3, 0.32, 0.35), 'steel'), bev=0.006))
        for sy in (-0.36, 0.36): o.append(box((1.08, 0.02, 0.07), (0, sy, z + 0.035), f, bev=0.004))
        for sx in (-0.54, 0.54): o.append(box((0.02, 0.72, 0.07), (sx, 0, z + 0.035), f, bev=0.004))
    o.append(bar((0.6, -0.32, 0.93), (0.6, 0.32, 0.93), 0.016, STEEL(), 6))
    for sy in (-0.32, 0.32): o.append(bar((0.5, sy, 0.84), (0.6, sy, 0.93), 0.014, STEEL(), 5))
    o.append(box((0.3, 0.2, 0.12), (-0.25, 0.1, 0.875), mat((0.2, 0.3, 0.42), 'coat'), bev=0.012))   # a tool case, a coil, a can
    o.append(torus(0.11, 0.022, (0.2, -0.12, 0.84), RUBBER(), seg=10))
    o.append(cyl(0.06, 0.16, (0.25, 0.2, 0.39), mat((0.5, 0.5, 0.46), 'steel'), verts=8)); o.append(box((0.4, 0.26, 0.14), (-0.2, 0.0, 0.345), WOOD(), bev=0.008))
    return o

def pneu():
    """An old tyre standing on its tread, 0.6 across, 0.166 wide (its axis is y)."""
    o = [torus(0.215, 0.085, (0, 0, 0.3), RUBBER(), rot=(math.pi / 2, 0, 0), seg=14)]
    o.append(cyl(0.3, 0.1, (0, 0, 0.3), RUBBER(), rot=(math.pi / 2, 0, 0), verts=14, r2=0.3))
    o.append(cyl(0.16, 0.04, (0, 0, 0.3), mat((0.3, 0.3, 0.31), 'steel'), rot=(math.pi / 2, 0, 0), verts=10))
    return o

# ---- the second pass: what the scenes used to build out of plain boxes and cylinders (src/models/props/gallery.js, objects.js, city/street.js) ----
CARD = lambda k=1.0: mat((0.50 * k, 0.345 * k, 0.185 * k), 'plain')
TAPE = lambda: mat((0.62, 0.50, 0.30), 'plain')

def frustum(b, t, h, loc, m, lift=0.0):
    """A box whose top (t = (x, y)) is not the size of its bottom (b = (x, y)), h high, its bottom centre at loc: six flat faces."""
    c = Vector(loc) + Vector((0, 0, h / 2 + lift)); n0 = _piece(BOX, c, [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))][::1], (max(b[0], t[0]) / 2, max(b[1], t[1]) / 2, h / 2))
    z0, z1 = loc[2] + lift, loc[2] + lift + h
    P = lambda sx, sy, top: (loc[0] + sx * (t[0] if top else b[0]) / 2, loc[1] + sy * (t[1] if top else b[1]) / 2, z1 if top else z0)
    quads = [[P(-1, -1, 0), P(1, -1, 0), P(1, -1, 1), P(-1, -1, 1)], [P(1, 1, 0), P(-1, 1, 0), P(-1, 1, 1), P(1, 1, 1)],
             [P(1, -1, 0), P(1, 1, 0), P(1, 1, 1), P(1, -1, 1)], [P(-1, 1, 0), P(-1, -1, 0), P(-1, -1, 1), P(-1, 1, 1)],
             [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [P(-1, 1, 0), P(1, 1, 0), P(1, -1, 0), P(-1, -1, 0)]]
    for q in quads:
        i0 = len(K.v); K.v.extend(q); K._face([i0, i0 + 1, i0 + 2, i0 + 3], m)
    for k in range(n0, len(K.f)):
        p = [Vector(K.v[i]) for i in K.f[k]]
        if (p[1] - p[0]).cross(p[2] - p[0]).dot(sum(p, Vector()) / len(p) - c) < 0: K.f[k] = tuple(reversed(K.f[k]))
    return n0

def caixa_papelao(w=0.3, d=0.3, h=0.24, open_=False):
    """A cardboard box, taped shut: the tape runs over the top and a hand down two sides (drawn in details.py); the flaps' seam is drawn."""
    o = [box((w, d, h), (0, 0, h / 2), CARD(), bev=0.012)]
    if open_:
        o.append(box((w - 0.03, d - 0.03, 0.004), (0, 0, h - 0.03), mat((0.06, 0.045, 0.03))))
        o.append(box((w, 0.008, 0.13), (0, -d / 2 - 0.045, h + 0.03), CARD(0.92), rot=(0.75, 0, 0), bev=0.0))
        o.append(box((w, 0.008, 0.13), (0, d / 2 + 0.03, h + 0.045), CARD(1.06), rot=(-0.45, 0, 0), bev=0.0))
        o.append(box((0.008, d, 0.13), (w / 2 + 0.05, 0, h + 0.02), CARD(0.86), rot=(0, 0.9, 0), bev=0.0))
    return o

def lata():
    """A tin: the body, the two rims, a paper label (drawn)."""
    return [cyl(0.044, 0.12, (0, 0, 0.06), mat((0.56, 0.58, 0.6), 'steel'), verts=7)]

def cacamba():
    """The skip of the street, the size of the box it replaces (2.4 x 1.5, its top at 1.08, on two skids): the tub flares toward its rim, with a
    folded lip, ribs pressed into the long sides, the lugs the truck's chains take, and what was thrown in it under a dark floor near the rim."""
    body = mat((0.36, 0.2, 0.045), 'coat'); dark = mat((0.07, 0.06, 0.05), 'coat'); o = []
    o.append(frustum((1.96, 1.2), (2.34, 1.44), 0.86, (0, 0, 0.2), body))                                  # the tub
    o.append(box((2.4, 0.07, 0.07), (0, -0.715, 1.045), body, bev=0.012)); o.append(box((2.4, 0.07, 0.07), (0, 0.715, 1.045), body, bev=0.012))     # the lip
    o.append(box((0.07, 1.5, 0.07), (-1.165, 0, 1.045), body, bev=0.012)); o.append(box((0.07, 1.5, 0.07), (1.165, 0, 1.045), body, bev=0.012))
    for sy in (-1, 1):                                                                                   # ribs, leaning with the wall
        for x in (-0.72, -0.24, 0.24, 0.72): o.append(box((0.07, 0.035, 0.84), (x, sy * 0.675, 0.62), body, rot=(sy * -0.138, 0, 0), bev=0.008))
        for sx in (-1, 1):                                                                               # the lugs
            o.append(box((0.16, 0.05, 0.2), (sx * 0.86, sy * 0.735, 0.88), dark, bev=0.01)); o.append(cyl(0.035, 0.09, (sx * 0.86, sy * 0.78, 0.88), STEEL(), rot=(math.pi / 2, 0, 0), verts=8))
    for sx in (-1, 1):
        o.append(box((0.035, 1.0, 0.8), (sx * 1.085, 0, 0.62), body, rot=(0, sx * 0.217, 0), bev=0.008))  # the plate on each end
        o.append(box((0.1, 1.6, 0.2), (sx * 1.0, 0, 0.1), dark, bev=0.015))                              # the skids
    o.append(box((2.2, 1.3, 0.02), (0, 0, 1.0), mat((0.05, 0.04, 0.035))))                               # the dark inside
    return o

def cacamba_entulho():
    """What was thrown into the skip and stands above its rim: boxes, a few boards, a bag, a bent sheet. It sits on the dark floor (z = 0 here)."""
    o = []
    o.append(box((0.62, 0.5, 0.42), (-0.55, 0.1, 0.21), CARD(), rot=(0.05, -0.08, 0.3), bev=0.014))
    o.append(box((0.5, 0.44, 0.34), (0.1, -0.18, 0.17), CARD(1.12), rot=(0, 0.06, -0.2), bev=0.014))
    o.append(box((0.44, 0.4, 0.3), (0.06, -0.1, 0.49), CARD(0.88), rot=(0.1, 0, 0.5), bev=0.014))
    o.append(box((0.56, 0.42, 0.3), (0.66, 0.2, 0.15), CARD(0.96), rot=(0, 0.12, 1.2), bev=0.014))
    o.append(box((0.4, 0.3, 0.26), (-0.2, 0.36, 0.13), mat((0.5, 0.5, 0.47), 'plain'), rot=(0, -0.1, 0.9), bev=0.014))
    o.append(box((1.5, 0.14, 0.03), (0.2, 0.42, 0.3), WOOD(), rot=(0.2, -0.25, 0.1), bev=0.004))
    o.append(box((1.2, 0.12, 0.03), (-0.5, -0.4, 0.2), WOOD_D(), rot=(-0.3, 0.2, -0.15), bev=0.004))
    o.append(sph(0.24, (0.82, -0.3, 0.17), mat((0.09, 0.09, 0.1), 'cloth'), (1.1, 0.9, 0.75)))
    o.append(sph(0.2, (-0.92, -0.26, 0.15), mat((0.3, 0.32, 0.3), 'cloth'), (1.0, 1.0, 0.75)))
    o.append(box((0.7, 0.5, 0.012), (0.5, 0.05, 0.36), mat((0.4, 0.42, 0.44), 'metal'), rot=(0.5, 0.2, 0.4), bev=0.0))
    return o

def escada_poco(H=5.0):
    """The ladder of the shaft: two rails of angle iron, rungs of rebar every 0.3 m, a concrete block at its foot and the two braces. Its foot at
    the origin; the game stretches it to the height of the shaft."""
    rb = mat((0.36, 0.2, 0.12), 'metal'); o = []
    for sx in (-1, 1):
        o.append(box((0.04, 0.03, H), (sx * 0.2, 0, H / 2), rb, bev=0.004))
        o.append(bar((sx * 0.2, -0.02, 0.5), (sx * 0.2, -0.56, 0.02), 0.013, rb, 5))
    y = 0.3
    while y < H - 0.1: o.append(bar((-0.2, 0, y), (0.2, 0, y), 0.013, rb, 4)); y += 0.3
    o.append(box((0.7, 0.3, 0.1), (0, 0.05, 0.05), CONC(), bev=0.015))
    return o

def _pipe(L, r, m, x0=0.0, y=0.0, z=0.0, verts=10):
    return cyl(r, L, (x0 + L / 2, y, z), m, rot=(0, math.pi / 2, 0), verts=verts)

def _flange(x, r, y=0.0, z=0.0, bolts=3, m=None):
    """A pair of flanges bolted together, drawn as one thick disc (the seam between the two is painted) with a few bolts through it."""
    o = [cyl(r * 1.42, 0.1, (x, y, z), m or STEEL_D(), rot=(0, math.pi / 2, 0), verts=8)]
    for k in range(bolts):
        a = 6.2832 * k / bolts + 0.4; o.append(cyl(0.013, 0.095, (x, y + math.cos(a) * r * 1.2, z + math.sin(a) * r * 1.2), BLACK(), rot=(0, math.pi / 2, 0), verts=4))
    return o

def cano():
    """1.5 m of the pipe of the machine room (radius 0.06, along x from 0), a flange with its bolts at the start, a strap to the wall behind it (+y)."""
    m = mat((0.5, 0.54, 0.58), 'coat'); o = [_pipe(1.5, 0.06, m, verts=8)]
    o += _flange(0.0, 0.06)
    o.append(box((0.05, 0.03, 0.17), (0.6, 0.075, -0.02), STEEL_D(), bev=0.004)); o.append(box((0.05, 0.12, 0.05), (0.6, 0.12, 0.0), STEEL_D(), bev=0.004))
    o.append(cyl(0.068, 0.022, (0.6, 0, 0), STEEL_D(), rot=(0, math.pi / 2, 0), verts=8))
    return o

def cano_flange():
    return _flange(0.0, 0.06)

def cano_parede():
    """3.5 m of the runs along the station's walls (along x, centred; the wall is behind, at +y): the water pipe (radius 0.09) with a flange in the
    middle and a bracket near one end, and over it the conduit with its clip."""
    m = mat((0.33, 0.39, 0.44), 'coat'); o = [_pipe(3.5, 0.09, m, x0=-1.75, verts=8)]
    o += _flange(0.0, 0.09)
    o.append(box((0.06, 0.03, 0.26), (-0.75, 0.13, -0.15), STEEL_D(), bev=0.004)); o.append(box((0.05, 0.16, 0.05), (-0.75, 0.08, -0.105), STEEL_D(), bev=0.004))
    o.append(cyl(0.1, 0.022, (-0.75, 0, 0), STEEL_D(), rot=(0, math.pi / 2, 0), verts=8))
    o.append(_pipe(3.5, 0.035, mat((0.14, 0.15, 0.16), 'coat'), x0=-1.75, y=0.06, z=0.23, verts=5))
    o.append(box((0.045, 0.07, 0.06), (-0.75, 0.1, 0.23), STEEL_D(), bev=0.004)); o.append(box((0.07, 0.03, 0.09), (0.9, 0.06, 0.23), STEEL(), bev=0.004))
    return o

def cano_descida():
    """The drop from the run to the drain: 1.9 m of pipe standing, a collar near the floor and one at the top, a strap."""
    m = mat((0.33, 0.39, 0.44), 'coat'); o = [cyl(0.05, 1.9, (0, 0, 0.95), m, verts=7)]
    o.append(cyl(0.075, 0.05, (0, 0, 0.14), STEEL_D(), verts=7)); o.append(cyl(0.075, 0.05, (0, 0, 1.7), STEEL_D(), verts=7))
    o.append(box((0.16, 0.03, 0.05), (0, 0.06, 1.0), STEEL_D(), bev=0.004))
    return o

def marquise_modulo():
    """3 m of the canopy over the pavement (4 m deep): the slab of folded sheet with a fascia in front and at the back, two joists under it and
    the gutter. Its top at z = 0.16; the game puts it at the height of the canopy and stretches it."""
    m = mat((0.2, 0.21, 0.23), 'coat'); f = mat((0.3, 0.26, 0.2), 'coat'); o = [box((3.0, 4.0, 0.06), (0, 0, 0.13), m, bev=0.01)]
    o.append(box((3.0, 0.08, 0.3), (0, -1.96, 0.05), f, bev=0.012)); o.append(box((3.0, 0.08, 0.2), (0, 1.96, 0.08), f, bev=0.012))
    for x in (-0.75, 0.75): o.append(box((0.1, 3.84, 0.12), (x, 0, 0.04), STEEL_D(), bev=0.01))
    o.append(cyl(0.05, 3.0, (0, -2.04, -0.06), STEEL_D(), rot=(0, math.pi / 2, 0), verts=8))
    return o

def marquise_coluna(H=3.6):
    """A column of the canopy: a square steel post on a plate with four bolts, a head plate, a band of worn paint at the foot."""
    o = [box((0.14, 0.14, H), (0, 0, H / 2), mat((0.3, 0.31, 0.33), 'coat'), bev=0.014)]
    o.append(box((0.3, 0.3, 0.03), (0, 0, 0.015), STEEL_D(), bev=0.006)); o.append(box((0.26, 0.26, 0.05), (0, 0, H - 0.025), STEEL_D(), bev=0.008))
    for sx in (-1, 1):
        for sy in (-1, 1): o.append(cyl(0.018, 0.03, (sx * 0.11, sy * 0.11, 0.04), STEEL(), verts=6))
    return o

def tapume_painel():
    """2.4 m of the hoarding round the station's entrance: two sheets of plywood, 2.4 high, on a post at its start (x = -1.2) with two rails behind
    (+y), and the hazard tape stapled across it."""
    o = [box((1.17, 0.03, 2.4), (-0.6, 0, 1.2), PLY(), bev=0.004), box((1.17, 0.03, 2.38), (0.6, 0.004, 1.19), mat((0.64, 0.5, 0.32), 'wood'), bev=0.004)]
    o.append(box((0.12, 0.12, 2.6), (-1.2, 0.05, 1.3), WOOD_D(), bev=0.01))
    for z in (0.5, 1.9): o.append(box((2.4, 0.05, 0.09), (0, 0.045, z), WOOD_D(), bev=0.005))
    o.append(box((2.4, 0.006, 0.11), (0, -0.02, 1.3), mat((0.72, 0.5, 0.06), 'plain')))
    return o

def tapume_poste():
    return [box((0.12, 0.12, 2.6), (0, 0, 1.3), WOOD_D(), bev=0.01)]

BUILDERS = {k: v for k, v in dict(globals()).items() if callable(v) and k in (
    'bomba', 'filtro', 'bateria_celula', 'bateria_base', 'bancada', 'mesa', 'banco', 'colchao_base', 'colchao_manta', 'caixa_dagua', 'armario', 'balde',
    'cozinha', 'palete', 'saco_cimento', 'betoneira', 'andaime', 'pilar_forma', 'forma_tabuas', 'tambor', 'caixote', 'prateleira_modulo', 'lampada_gaiola', 'valvula',
    'trilho', 'div_chapa', 'div_palete', 'div_lona', 'div_grade', 'cabo_bobina',
    'galao', 'caixa_ferramentas', 'cama_improvisada', 'fogareiro', 'gerador', 'quadro', 'carrinho', 'pneu',
    'caixa_papelao', 'lata', 'cacamba', 'cacamba_entulho', 'escada_poco', 'cano', 'cano_flange', 'cano_parede', 'cano_descida',
    'marquise_modulo', 'marquise_coluna', 'tapume_painel', 'tapume_poste')}
