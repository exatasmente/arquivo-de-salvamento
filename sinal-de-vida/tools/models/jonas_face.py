"""The face of Jonas: morph targets (shape keys) on the body mesh, so the skin texture (eyebrows, wrinkles) travels with the
deformation, and his eyes. All the weights come from the position on the head; nothing is random.

Keys: blink, eye_wide, squint (both lids close in a little), look_down, look_up (the lids as they follow the look), brow_up,
brow_down, brow_worry (the inner ends up), smile, frown, jaw_open, cheek (the cheeks rise), mouth_narrow (the corners come in: the
rounded mouth of an "o"), and the lips on their own for speech: lips_close (shut over a jaw a little open: m, b, p), lips_funnel (o, u),
upper_lip_up, lower_lip_down, lips_press, mouth_left, mouth_right.
The eyes: globes that turn under lids of geometry, with lashes and the lids' shadow riding the lids' edges (see "the eyes" below).
The mouth: the base mesh has a pocket behind the lips (a seam of doubled vertices); jonas.py cuts the pocket away and leaves the
lips' inner faces, so the jaw opens onto the mouth's own inside (a dark cavity, two arches of teeth, the tongue)."""
import math

import bmesh
import bpy
from mathutils import Vector

from common import smooth

V = Vector
MZ, MY = 1.6235, -0.09           # the mouth line: height and the front of the lips
LIPX = 0.0235                    # the flood that finds the lower lip stops short of the corners of the mouth (where the lips join)
JAW = 0.034                      # how far the chin drops with jaw_open at 1 (the lower teeth and the tongue drop as much)


def _group_names(ob):
    return {g.index: g.name for g in ob.vertex_groups}


# ---- the eyes ---------------------------------------------------------------------------------------------------------------
# A real globe under real lids. The base body has a socket (a pocket of skin, sixteen vertices a ring) made for a bigger, wider-set
# eye than the concept draws; fit_lids() remakes it round a globe of our own: the opening becomes an almond of the concept's size
# and place, its edge lies on a sphere a lid's thickness above the globe, and no skin near it is left under that sphere, so the
# white cannot come through a lid. The lids' morph targets are the same fit made again with other openings (lid_state), so a lid
# slides over the globe instead of crossing it. Everything here is measured as it will be after jonas.head_scale (SCALE): the globe
# must be a true sphere then, because it turns.
SCALE = (1.0, 1.0, 1.0)          # jonas.py sets it to HEAD_K before anything here is called
BASE_EYE = V((0.0381, -0.0718, 1.7055))     # where the base body's own eye was (the socket's hub is found from it)
EYE_C = V((0.0335, -0.0713, 1.7050))        # the centre of his left globe, before the head is scaled (the right one mirrors it)
EYE_R = 0.0175                   # the globe's radius, after the head is scaled
LID_T = 0.0012                   # the lid's edge rides this far above the globe (a morph target is a straight line: a lid half way
#                                  down cuts the corner of its arc by about 0.5 mm, and must still clear the cornea)
CORNEA = 0.0005                  # how far the cornea stands out of the globe
IRIS_R, PUPIL_R = 0.0063, 0.0024
EYE_W = 0.0140                   # half the width of the opening
CORNER_IN, CORNER_OUT = -0.0006, -0.0011    # the corners' heights from the centre: the outer one a little lower, a tired eye
PEAK_UP, PEAK_LO = 0.44, 0.56    # where along the opening each lid is furthest from the line between the corners
# the openings: how far the upper and the lower lid stand from the line between the corners (metres, before the head is scaled).
# At rest the upper lid covers the top of the iris: his tiredness is the lid, not a line painted across the eye.
REST = (0.0040, 0.0050)
# (looking down or up, the lids go with the iris: it stays framed between them)
LIDS = {'eye_wide': (0.0074, 0.0066), 'squint': (0.0027, 0.0037), 'look_down': (-0.0008, 0.0076), 'look_up': (0.0076, 0.0028)}
CLOSED = 0.0031                  # the line both lids meet on in a blink, below the line between the corners
KEY_FALL = {3: 1.0, 4: 0.5, 5: 0.15}       # how much of the lid edge's travel each ring of skin behind it takes
FIT_FALL = {3: 1.0, 4: 0.85, 5: 0.5, 6: 0.18}
GLINT = (0.21, 0.13)             # where the small highlight sits on the globe (sideways and up, as a share of the radius)


def _bump(u, peak):
    u = max(0.0, min(1.0, u))
    return math.sin(math.pi * u ** (math.log(0.5) / math.log(peak))) ** 0.85


def lid_line(u, side):
    """The point of the line between the corners at u (0 = inner corner, 1 = outer): (x, z)."""
    return side * (EYE_C.x - EYE_W + 2 * EYE_W * u), EYE_C.z + CORNER_IN + (CORNER_OUT - CORNER_IN) * u


def upper_z(u, h=REST[0]):
    return h * _bump(u, PEAK_UP)


def lower_z(u, h=REST[1]):
    return -h * _bump(u, PEAK_LO)


def on_globe(x, z, side, rad):
    """The y of the point in front of (x, z) on the sphere of radius `rad` (measured after the head is scaled) round the globe's
    centre; past the sphere's outline, the centre's own y."""
    qx, qz = (x - side * EYE_C.x) * SCALE[0], (z - EYE_C.z) * SCALE[2]
    d = rad * rad - qx * qx - qz * qz
    return EYE_C.y - (math.sqrt(d) / SCALE[1] if d > 0 else 0.0)


def globe_dist(p, side):
    """How far p is from the globe's centre, measured after the head is scaled."""
    return math.sqrt(((p.x - side * EYE_C.x) * SCALE[0]) ** 2 + ((p.y - EYE_C.y) * SCALE[1]) ** 2 + ((p.z - EYE_C.z) * SCALE[2]) ** 2)


class Socket:
    """One eye's socket: the rings of vertices round it (by index), each ring vertex's parents on the ring inside it, the two lids'
    chains along the opening's edge and where each of its vertices sits along the opening."""

    def __init__(self, side):
        self.side = side
        self.level = {}          # vertex -> ring (0 the hub at the back, 1 the wall, 2 the opening's edge, 3.. the lids outward)
        self.parents = {}        # vertex -> its neighbours one ring nearer the edge
        self.u = {}              # edge vertex -> place along the opening
        self.upper, self.lower = [], []      # the edge's vertices from the inner corner to the outer, both corners included
        self.basis = {}          # vertex -> its fitted position


def _find_socket(bm, side):
    c0 = V((side * BASE_EYE.x, BASE_EYE.y, BASE_EYE.z))
    hub = max((v for v in bm.verts if (v.co - c0).length < 0.02), key=lambda v: len(v.link_edges))
    so = Socket(side)
    lev = {hub: 0}
    front = [hub]
    rings = [[hub]]
    for L in range(1, 7):
        nxt = []
        for v in front:
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in lev:
                    lev[w] = L
                    nxt.append(w)
        rings.append(nxt)
        front = nxt
    edge = rings[2]
    es = set(edge)
    inner = min(edge, key=lambda v: side * v.co.x)
    outer = max(edge, key=lambda v: side * v.co.x)
    chains = []
    for first in (w for e in inner.link_edges for w in [e.other_vert(inner)] if w in es):
        chain, prev, cur = [inner], inner, first
        while cur is not outer:
            chain.append(cur)
            nx = next(w for e in cur.link_edges for w in [e.other_vert(cur)] if w in es and w is not prev)
            prev, cur = cur, nx
        chain.append(outer)
        chains.append(chain)
    chains.sort(key=lambda ch: -sum(v.co.z for v in ch) / len(ch))
    for ch, dst in zip(chains, (so.upper, so.lower)):
        acc, tot = [0.0], 0.0
        for a, b in zip(ch, ch[1:]):
            tot += math.hypot(b.co.x - a.co.x, b.co.z - a.co.z)
            acc.append(tot)
        for v, a in zip(ch, acc):
            so.u[v.index] = a / tot
            dst.append(v.index)
    for v, L in lev.items():
        so.level[v.index] = L
        near = 2 if L == 1 else L - 1
        so.parents[v.index] = [e.other_vert(v).index for e in v.link_edges if lev.get(e.other_vert(v)) == near] if L != 2 else []
    return so


def _edge_state(so, up, lo, lift=0.0):
    """The opening's edge with the lids at up(u) and lo(u) from the line between the corners: vertex -> position."""
    out = {}
    for chain, fn, extra in ((so.lower, lo, 0.0), (so.upper, up, lift)):
        for k, i in enumerate(chain):
            if k in (0, len(chain) - 1) and i in out:
                continue
            u = so.u[i]
            x, z = lid_line(u, so.side)
            z += fn(u)
            out[i] = V((x, on_globe(x, z, so.side, EYE_R + LID_T + extra), z))
    return out


def _spread(so, d2, falls, levels):
    """The edge's displacement handed outward ring by ring (the mean of a vertex's parents), unattenuated."""
    bar = dict(d2)
    for L in levels:
        for i, lv in so.level.items():
            if lv == L:
                ps = [bar[j] for j in so.parents[i] if j in bar]
                bar[i] = sum(ps, V((0, 0, 0))) / len(ps) if ps else V((0, 0, 0))
    return bar


def _keep_out(p, side, rad):
    """p moved forward onto the sphere of radius `rad` if it is under it."""
    if globe_dist(p, side) < rad:
        y = on_globe(p.x, p.z, side, rad)
        if y < p.y:
            p.y = y
    return p


def fit_lids(body):
    """Remakes the two sockets of `body` round the globes (see the note above) and returns them."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    sockets = []
    for side in (1, -1):
        so = _find_socket(bm, side)
        c = V((side * EYE_C.x, EYE_C.y, EYE_C.z))
        e2 = _edge_state(so, upper_z, lower_z)
        d2 = {i: p - bm.verts[i].co for i, p in e2.items()}
        bar = _spread(so, d2, FIT_FALL, (3, 4, 5, 6))
        for i, L in so.level.items():
            v = bm.verts[i]
            if L == 2:
                p = e2[i]
            elif L >= 3:
                d = bar[i] * FIT_FALL[L]
                p = V((v.co.x + d.x, v.co.y, v.co.z + d.z))
                if L == 3:
                    p.y = on_globe(p.x, p.z, side, EYE_R + LID_T + 0.0004)
                else:
                    _keep_out(p, side, EYE_R + LID_T + 0.0008)
            else:
                continue
            so.basis[i] = p
        # the wall behind the edge dives into the globe (what shows of it is the lid's thickness), and the back goes inside
        for i, L in so.level.items():
            if L == 1:
                ps = [so.basis[j] for j in so.parents[i]]
                so.basis[i] = c + (sum(ps, V((0, 0, 0))) / len(ps) - c) * 0.6
            elif L == 0:
                so.basis[i] = c + V((0, 0.003, 0))
        for i, p in so.basis.items():
            bm.verts[i].co = p
        sockets.append(so)
    bm.to_mesh(body.data)
    bm.free()
    return sockets


def lid_state(so, up, lo, lift=0.0):
    """Where the socket's vertices go with the lids at up(u) and lo(u): vertex -> position (rings 1 to 5)."""
    side = so.side
    e2 = _edge_state(so, up, lo, lift)
    d2 = {i: p - so.basis[i] for i, p in e2.items()}
    bar = _spread(so, d2, KEY_FALL, (3, 4, 5))
    out = dict(e2)
    for i, L in so.level.items():
        if L in KEY_FALL:
            d = bar[i] * KEY_FALL[L]
            b = so.basis[i]
            p = V((b.x + d.x, b.y, b.z + d.z))
            if L == 3:
                p.y = on_globe(p.x, p.z, side, EYE_R + LID_T + 0.0004 + lift)
            else:
                _keep_out(p, side, EYE_R + LID_T + 0.0008)
            out[i] = p
    c = V((side * EYE_C.x, EYE_C.y, EYE_C.z))
    for i, L in so.level.items():
        if L == 1:
            ps = [out[j] for j in so.parents[i]]
            out[i] = c + (sum(ps, V((0, 0, 0))) / len(ps) - c) * 0.6
    return out


def lid_shapes():
    """The lids' morph targets: name -> (upper lid, lower lid, how much the upper edge lifts off the lower one)."""
    out = {n: ((lambda u, h=hu: upper_z(u, h)), (lambda u, h=hl: lower_z(u, h)), 0.0) for n, (hu, hl) in LIDS.items()}
    shut = lambda u: -CLOSED * _bump(u, PEAK_LO)
    out['blink'] = ((lambda u: shut(u) - 0.0002), shut, 0.00025)       # the upper lashes come to rest just over the lower lid
    return out


def edge_points(so, state=None):
    """The opening's edge as the lashes and the lid's shadow follow it: (upper chain, lower chain) of positions."""
    at = (lambda i: state[i]) if state else (lambda i: so.basis[i])
    return [at(i) for i in so.upper], [at(i) for i in so.lower]


def _strip(mb, side, pts, us, top, bot, rad, mat):
    """A ribbon along an edge of the opening: for each point, one vertex `top(u)` above it and one `bot(u)` below, both set on the
    sphere of radius `rad`. Returns the vertices' positions (to make the same ribbon for a morph target)."""
    rows = []
    for p, u in zip(pts, us):
        row = []
        for dz in (top(u), -bot(u)):
            z = p.z + dz
            row.append(mb.vert(V((p.x, on_globe(p.x, z, side, rad), z)), (0, -1, 0)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        f = (a[0], a[1], b[1], b[0])
        pa, pb, pc = (V(mb.v[i]) for i in f[:3])
        mb.face(f if (pb - pa).cross(pc - pa).y < 0 else tuple(reversed(f)), mat)


def _taper(u, lo, hi, peak=0.6):
    return lo + (hi - lo) * _bump(u, peak)


def lash_mesh(mb, so, state=None, lift=0.0):
    """The lashes: a dark ribbon along the upper lid's edge, thicker toward the outer third, and a thin soft one along the lower."""
    up, lo = edge_points(so, state)
    uu, ul = [so.u[i] for i in so.upper], [so.u[i] for i in so.lower]
    _strip(mb, so.side, up, uu, lambda u: _taper(u, 0.0002, 0.0005, 0.6), lambda u: _taper(u, 0.0002, 0.0010, 0.66), EYE_R + LID_T + 0.0003 + lift, 'lash')
    _strip(mb, so.side, lo, ul, lambda u: 0.00022 * _bump(u, 0.6), lambda u: 0.00022 * _bump(u, 0.6), EYE_R + LID_T + 0.00025, 'lashlow')


def shade_mesh(mb, so, state=None, lift=0.0):
    """The shadow the lids lay on the globe: ribbons just above the globe, under the lid's edge (two under the upper lid, the
    narrow one over the wide one; one, faint, along the lower lid). The game draws them as dark glass."""
    up, lo = edge_points(so, state)
    uu, ul = [so.u[i] for i in so.upper], [so.u[i] for i in so.lower]
    rad = EYE_R + 0.00068
    _strip(mb, so.side, up, uu, lambda u: 0.0004, lambda u: _taper(u, 0.0011, 0.0030, 0.5), rad, 'shade')
    _strip(mb, so.side, up, uu, lambda u: 0.0004, lambda u: _taper(u, 0.0007, 0.0015, 0.5), rad + 0.00006, 'shade')
    _strip(mb, so.side, lo, ul, lambda u: _taper(u, 0.0007, 0.0013, 0.5), lambda u: 0.0003, rad, 'shade')


GLINT_SINK = {'blink': 0.0016, 'look_down': 0.0016, 'squint': 0.0007}     # how far the highlight goes into the globe with each of the lids' targets


def glint_mesh(mb, side, sink=0.0):
    """The highlight: a small bright spot that stays where the light puts it while the globe turns under it. A lid that comes
    down over it would let it through (a lid half way is a straight line between two places on the sphere), so the targets that
    lower the upper lid also take it into the globe (`sink`)."""
    c = V((side * EYE_C.x, EYE_C.y, EYE_C.z))
    gx, gz = GLINT
    n = V((gx, -math.sqrt(1 - gx * gx - gz * gz), gz))
    a = V((0, 0, 1)).cross(n).normalized()
    b = n.cross(a)
    rad = EYE_R + 0.00058 - sink
    un = lambda q: c + V((q.x / SCALE[0], q.y / SCALE[1], q.z / SCALE[2]))
    mid = mb.vert(un(n * (rad + 0.00005)), n)
    ring = [mb.vert(un(n * rad + (a * math.cos(t) * 1.25 + b * math.sin(t)) * 0.00072), n) for t in (2 * math.pi * k / 7 for k in range(7))]
    for k in range(7):
        f = (mid, ring[k], ring[(k + 1) % 7])
        pa, pb, pc = (V(mb.v[i]) for i in f)
        mb.face(f if (pb - pa).cross(pc - pa).y < 0 else tuple(reversed(f)), 'glint')


EYE_RINGS = (0.0, 0.36, 0.68, 1.0, 1.16, 1.5, 2.1, 2.9, 3.8, 4.8, 5.6)      # polar angles, in iris radii (the limbus is 1)
EYE_SEG = 20
PHI_IRIS = math.asin(IRIS_R / EYE_R)
PHI_MAX = EYE_RINGS[-1] * PHI_IRIS


def eye_uv(phi, th):
    """Where a point of the globe sits in the eye's picture: the pupil in the middle, the angle from it going outward (the iris
    gets more of the picture than its share of the globe)."""
    r = 0.5 * (phi / PHI_MAX) ** 0.6
    return 0.5 + r * math.cos(th), 0.5 + r * math.sin(th)


def eye_mesh(mb, side, uv, lod=False):
    """One globe: a sphere open at the back, its pole looking forward (-Y), the cornea standing a little out of it. It is built
    squashed by 1 / SCALE, so that head_scale makes it a true sphere. Returns its vertices' indices."""
    c = V((side * EYE_C.x, EYE_C.y, EYE_C.z))
    seg = 12 if lod else EYE_SEG
    rings = EYE_RINGS[::2] if lod else EYE_RINGS
    first = len(mb.v)

    def at(phi, th):
        r = EYE_R + CORNEA * math.cos(0.5 * math.pi * min(1.0, phi / (1.18 * PHI_IRIS))) ** 2
        n = V((side * math.sin(phi) * math.cos(th), -math.cos(phi), math.sin(phi) * math.sin(th)))
        i = mb.vert(c + V((n.x * r / SCALE[0], n.y * r / SCALE[1], n.z * r / SCALE[2])), n)
        uv[i] = eye_uv(phi, th)
        return i
    pole = at(0.0, 0.0)
    prev = None
    for k in rings[1:]:
        row = [at(k * PHI_IRIS, 2 * math.pi * j / seg) for j in range(seg)]
        for j in range(seg):
            j2 = (j + 1) % seg
            f = (pole, row[j2], row[j]) if prev is None else (prev[j], prev[j2], row[j2], row[j])
            pa, pb, pc = (V(mb.v[i]) for i in f[:3])
            mb.face(f if (pb - pa).cross(pc - pa).dot((pa + pb + pc) / 3 - c) > 0 else tuple(reversed(f)), 'eye')
        prev = row
    return list(range(first, len(mb.v)))


def check_lids(body, sockets, faces):
    """How far inside the lid's sphere any skin round the eyes comes with each set of morph weights in `faces` (name -> weights):
    name -> the worst depth in metres (0 = nothing under it). A check for the build's log."""
    kb = body.data.shape_keys.key_blocks
    out = {}
    for name, ws in faces.items():
        worst = 0.0
        for so in sockets:
            for i, L in so.level.items():
                if L < 2:
                    continue
                b = V(kb['Basis'].data[i].co)
                p = b + sum(((V(kb[k].data[i].co) - b) * w for k, w in ws.items() if k in kb), V((0, 0, 0)))
                worst = max(worst, EYE_R + CORNEA + 0.0001 - globe_dist(p, so.side))
        out[name] = round(worst, 5)
    return out


# the faces the build checks the lids against (the game's expressions, a blink in the middle, the look down)
CHECK_FACES = {'rest': {}, 'blink': {'blink': 1}, 'half blink': {'blink': 0.5}, 'tenso': {'brow_down': 1, 'squint': 0.7, 'frown': 0.7, 'cheek': 0.35},
               'alivio': {'smile': 1, 'brow_up': 0.55, 'brow_worry': 0.3, 'cheek': 0.9, 'squint': 0.5}, 'susto': {'eye_wide': 1, 'brow_up': 1, 'jaw_open': 0.72},
               'exausto': {'blink': 0.55, 'brow_worry': 0.6, 'frown': 0.5}, 'look down': {'look_down': 1}, 'look down, half blink': {'look_down': 1, 'blink': 0.5},
               'look up': {'look_up': 1}}


_CHEEK = {}


def lid_paint(p, c, pic, skin):
    """The skin round an eye, painted for the lids that are there: the picture of the face has its own eye drawn where ours is
    (white, iris, lash lines), and none of that may land on a lid. Inside the picture's eye the skin is the tone of the cheek under
    that eye (so each side keeps the picture's light), a little redder as the skin round an eye is, painted by where the geometry
    is: lighter on the round of the lid, darker toward the edge and into the fold, a soft crease, and the wall inside the edge dark
    (the root of the lashes). `pic(x, z)` samples the picture of the face; `skin` is the face's mean tone."""
    side = 1.0 if p.x >= 0 else -1.0
    X, Z = abs(p.x) - EYE_C.x, p.z - EYE_C.z
    m = math.hypot(X / 0.0200, Z / 0.0098)
    w = 1.0 - smooth(0.8, 1.3, m)
    if w <= 0.0:
        return c
    key = (round(side), 0)
    if key not in _CHEEK:
        ss = [pic(side * (EYE_C.x + dx), EYE_C.z - dz) for dx, dz in ((-0.006, 0.021), (0.004, 0.022), (0.012, 0.020), (0.0, 0.025))]
        _CHEEK[key] = tuple(sum(q[j] for q in ss) / len(ss) * 0.7 + skin[j] * 0.3 for j in range(3))
    ck = _CHEEK[key]
    mott = 0.96 + 0.08 * math.sin(p.x * 2100.0 + 1.3 * math.sin(p.z * 1700.0)) * math.sin(p.z * 2600.0 + p.x * 900.0)      # a faint brush mottle
    fill = (ck[0] * 0.97 * mott, ck[1] * 0.92 * mott, ck[2] * 0.89 * mott)
    u = (X + EYE_W) / (2 * EYE_W)
    base = EYE_C.z + CORNER_IN + (CORNER_OUT - CORNER_IN) * max(0.0, min(1.0, u)) - EYE_C.z
    hu, hl = Z - (base + upper_z(u)), (base + lower_z(u)) - Z
    ends = smooth(-0.12, 0.1, u) * smooth(1.14, 0.9, u)
    if hu > 0:                                   # the upper lid: darker toward its edge, a crease, the fold above it in shadow
        dome = math.exp(-((hu - 0.0024) / 0.0013) ** 2) * ends
        fill = tuple(v * (1.0 + 0.07 * dome - 0.20 * smooth(0.0012, 0.0, hu) - 0.10 * smooth(0.0045, 0.008, hu) * smooth(0.014, 0.008, hu)) for v in fill)
        crease = math.exp(-((hu - 0.0048) / 0.0006) ** 2) * ends
        fill = tuple(v * (1.0 - 0.34 * crease) + 0.34 * crease * d for v, d in zip(fill, (0.30, 0.15, 0.12)))
    elif hl > 0:                                 # the lower lid: a little red and dark at the edge, a soft bag under it
        fill = tuple(v * (1.0 - 0.20 * smooth(0.0022, 0.0, hl)) for v in fill)
        fill = (fill[0], fill[1] * (1.0 - 0.06 * smooth(0.004, 0.0, hl)), fill[2] * (1.0 - 0.05 * smooth(0.004, 0.0, hl)))
        bag = math.exp(-((hl - 0.0062) / 0.0011) ** 2) * ends
        fill = tuple(v * (1.0 - 0.22 * bag) + 0.22 * bag * d for v, d in zip(fill, (0.30, 0.16, 0.13)))
    # the corners sit in shadow
    fill = tuple(v * (1.0 - 0.16 * (1.0 - ends) * smooth(0.006, 0.0, abs(Z))) for v in fill)
    inside = smooth(EYE_R + LID_T - 0.0001, EYE_R + LID_T - 0.0007, globe_dist(p, side))
    if inside > 0:
        rim = (0.11, 0.065, 0.055) if Z > base + 0.5 * (upper_z(u) + lower_z(u)) else (0.34, 0.17, 0.15)
        fill = tuple(v * (1 - inside) + r * inside for v, r in zip(fill, rim))
    return tuple(a * (1 - w) + b * w for a, b in zip(c, fill))


def lower_lip(me):
    """The vertices of the lower lip and the chin, between the corners of the mouth. The seam between the lips is made of doubled
    vertices (and it rises toward the corners), so neither the height nor the position tells the two lips apart: what does is that
    the lower lip is reached from the chin along the mesh's edges without ever passing a corner of the mouth."""
    bm = bmesh.new()
    bm.from_mesh(me)
    ok = lambda p: abs(p.x) < LIPX and p.z < MZ + 0.006 and p.y < -0.07
    seen = {v for v in bm.verts if ok(v.co) and MZ - 0.02 < v.co.z < MZ - 0.008}
    stack = list(seen)
    while stack:
        v = stack.pop()
        for e in v.link_edges:
            w = e.other_vert(v)
            if w not in seen and ok(w.co) and w.co.z > MZ - 0.02:
                seen.add(w)
                stack.append(w)
    out = {v.index for v in seen}
    bm.free()
    return out


def add_keys(body, sockets):
    """Adds the shape keys to `body` (call it after the mesh is final). `sockets` is what fit_lids returned."""
    gn = _group_names(body)
    me = body.data
    lowset = lower_lip(me)
    body.shape_key_add(name='Basis')
    keys = {n: body.shape_key_add(name=n) for n in ('blink', 'eye_wide', 'brow_up', 'brow_down', 'brow_worry', 'smile', 'frown', 'jaw_open', 'cheek', 'mouth_narrow', 'squint', 'look_down', 'look_up',
                                                       'lips_close', 'lips_funnel', 'upper_lip_up', 'lower_lip_down', 'lips_press', 'mouth_left', 'mouth_right')}
    lids = lid_shapes()
    # round the eyes the lids' own targets rule: the brows and the cheeks let go of the skin as it nears the opening's edge
    hold = {}
    for so in sockets:
        for i, L in so.level.items():
            hold[i] = 0.0 if L <= 3 else 0.5 if L == 4 else 1.0

    def top_bone(v):
        best, bw = None, 0.0
        for g in v.groups:
            if g.weight > bw:
                best, bw = gn.get(g.group), g.weight
        return best
    for i, v in enumerate(me.vertices):
        p = V(v.co)
        if p.z < 1.55 or p.y > 0.02:
            continue
        if top_bone(v) not in ('Head', 'neck_01'):
            continue
        front = smooth(-0.03, -0.075, p.y)
        d = {n: V((0, 0, 0)) for n in keys}
        # ---- brows: a pad of forehead over each eye's brow line
        for side in (1, -1):
            bx = side * 0.034
            u = math.exp(-((p.x - bx) ** 2 / 0.00055 + (p.z - 1.727) ** 2 / 0.00022))        # the brow itself
            inner = smooth(0.062, 0.012, abs(p.x))        # 1 at the inner end of the brow, 0 at the outer
            wide = math.exp(-((p.x - bx) ** 2 / 0.0011 + (p.z - 1.74) ** 2 / 0.0011)) * front
            if p.x * side > -0.01:
                d['brow_up'] += V((0, 0, 0.0090 * u * front + 0.0025 * wide))
                d['brow_down'] += V((-side * 0.0028 * u * front, -0.0018 * u, -0.0056 * u * front - 0.0012 * wide))
                d['brow_worry'] += V((0, 0, (0.0075 * inner + 0.0005) * u * front))
        # ---- the mouth
        mw = math.exp(-(p.x ** 2 / 0.0012 + (p.z - MZ) ** 2 / 0.0006)) * front
        corner = math.exp(-((abs(p.x) - 0.034) ** 2 / 0.00022 + (p.z - MZ) ** 2 / 0.00022)) * front
        cheek = math.exp(-((abs(p.x) - 0.047) ** 2 / 0.0006 + (p.z - 1.665) ** 2 / 0.0005)) * smooth(-0.03, -0.07, p.y)
        sx = math.copysign(1.0, p.x)
        d['smile'] += V((sx * 0.0075 * corner, -0.002 * corner, 0.0115 * corner + 0.004 * cheek))
        d['frown'] += V((-sx * 0.0025 * corner, 0, -0.0095 * corner))
        d['cheek'] += V((0, -0.0025 * cheek, 0.0055 * cheek))
        # the jaw: a hinge below the mouth line. The lower lip and the chin go down and a little back, the upper lip stays; the
        # corners of the mouth stay closed, so the opening is an oval (widest in the middle), not a slot.
        ax = abs(p.x)
        if abs(p.x) < LIPX and p.z > MZ - 0.008:
            low = 1.0 if i in lowset else 0.0
        else:
            low = 1.0 if p.z < MZ + 0.0016 * smooth(0.012, 0.026, abs(p.x)) else 0.0      # the seam is a little higher at the corners
        oval = max(0.0, 1.0 - (ax / 0.0285) ** 2) ** 0.8                 # the lip line's own opening
        block = smooth(MZ - 0.003, MZ - 0.026, p.z)                      # 0 at the lip line, 1 at the chin: the jaw as a block
        inner = low * (oval * (1.0 - block) + block)
        broad = smooth(MZ + 0.012, MZ - 0.03, p.z)                       # the cheeks beside the mouth follow, softly
        cw = smooth(0.028, 0.05, ax)
        jw = (inner * (1 - cw) + 0.75 * broad * cw) * smooth(0.0, -0.05, p.y) * smooth(0.115, 0.06, ax)
        if p.z < MZ - 0.03:
            jw = max(jw, smooth(0.105, 0.05, ax) * smooth(0.0, -0.05, p.y) * smooth(MZ - 0.02, MZ - 0.05, p.z))
        d['jaw_open'] += V((0, 0.0045 * jw, -JAW * jw))
        if low < 0.5 and p.z < MZ + 0.012:                               # the upper lip lifts a little off the teeth
            d['jaw_open'] += V((0, 0, 0.0022 * max(0.0, 1.0 - (ax / 0.03) ** 2) * smooth(MZ + 0.012, MZ, p.z) * front))
        # the corners of the mouth come in a little as the jaw drops, and come in and forward for a narrow, rounded mouth (the "o", "u")
        d['jaw_open'] += V((-sx * 0.0030 * corner, 0, -0.004 * corner))
        d['mouth_narrow'] += V((-sx * 0.0075 * corner - sx * 0.003 * mw * smooth(0.008, 0.03, ax), -0.0035 * mw - 0.002 * corner, 0))
        # ---- the lips on their own, for speech (they add to the jaw and to one another)
        lipz = max(0.0, 1.0 - (ax / 0.031) ** 2)
        upl = (1.0 - low) * smooth(MZ + 0.016, MZ + 0.002, p.z) * lipz * front if p.z >= MZ - 0.004 else 0.0     # the upper lip, strongest at its edge
        lol = low * lipz * (1.0 - block) * front                                                          # the lower lip, strongest at its edge
        # closed over a jaw that is a little open (m, b, p): the lower lip comes up to the upper, which comes down to meet it
        d['lips_close'] += V((0, -0.0006 * (upl + lol), 0.0098 * lol * oval ** 0.5 - 0.0022 * upl))
        # a funnel (o, u): the lips push out and the corners come in, the opening stays round
        d['lips_funnel'] += V((-sx * 0.0085 * corner - sx * 0.0045 * mw * smooth(0.006, 0.03, ax), -0.0062 * mw - 0.0035 * corner, 0.0016 * upl - 0.0022 * lol))
        # the upper lip lifts off the upper teeth; the lower lip comes down off the lower ones
        d['upper_lip_up'] += V((0, -0.0016 * upl, 0.0078 * upl + 0.0016 * mw * (1.0 - low) * smooth(MZ, MZ + 0.012, p.z)))
        d['lower_lip_down'] += V((0, -0.0014 * lol, -0.0064 * lol))
        # pressed: both lips roll in against the teeth and thin
        d['lips_press'] += V((0, 0.0030 * (upl + lol), -0.0020 * upl + 0.0022 * lol))
        # the whole mouth to one side
        side_w = math.exp(-(p.x ** 2 / 0.0024 + (p.z - MZ) ** 2 / 0.0011)) * front
        d['mouth_left'] += V((0.0095 * side_w, 0, 0.0018 * side_w * sx))
        d['mouth_right'] += V((-0.0095 * side_w, 0, -0.0018 * side_w * sx))
        h = hold.get(i, 1.0)
        for n, k in keys.items():
            if n not in lids:
                k.data[i].co = p + d[n] * h
    for so in sockets:
        for n, (up, lo, lift) in lids.items():
            for i, q in lid_state(so, up, lo, lift).items():
                keys[n].data[i].co = q
    return keys
