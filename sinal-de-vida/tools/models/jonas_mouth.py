"""Jonas's mouth: the lips' own edge turned into the mouth, and what is inside it. Used by jonas.py.

  lip_roll(bm)      the base body's mouth is a hole cut in the skin where the lips meet: its edge is carried on into the mouth by two
                    more rings of skin (the red of the lips, then the wet inside), all round and through the corners, so that an open
                    mouth shows a lip that turns in, not the cut. The rings ride the lips' edge through every shape key (roll_keys).
  lip_tags(body)    the polygons of those rings, for the paint (paint.py gives them the lips' own colour).
  inside(MB)        the upper arch on the head and, on the jaw, the lower arch, the tongue and the floor: teeth modelled one by one
                    (the upper ones longer and a little in front of the lower), gums, a tongue with a tip and a groove, and a cavity
                    whose colour goes dark toward the throat. Their UVs point into the cells atlas: a place along a cell's height
                    is a place along its gradient (paint.py paints the cells so).

Everything is in the head's own metres before jonas.py scales the head (the mouth line is jonas_face.MZ, the front is -y).
"""
import math

import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree

import jonas_face as JF
import paint as P

V = Vector
MZ = JF.MZ
RINGS = ((0.0030, 0.0013), (0.0085, 0.0026))        # each ring of the roll: how far back of the lip's edge, how far past it toward the other lip
ARCH_Y, ARCH_K, ARCH_W = -0.0888, 0.0125, 0.027     # the upper arch: its front, how far it curves back at half width ARCH_W


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _near_mouth(p):
    return abs(p.x) < 0.046 and abs(p.z - MZ) < 0.02 and -0.106 < p.y < -0.068


def lip_roll(bm, log=None):
    edges = [e for e in bm.edges if e.is_boundary and all(_near_mouth(v.co) for v in e.verts)]
    if not edges:
        return 0
    roll = bm.verts.layers.float.get('roll') or bm.verts.layers.float.new('roll')
    src = bm.verts.layers.float_vector.get('roll_src') or bm.verts.layers.float_vector.new('roll_src')
    uvl = bm.loops.layers.uv.active
    verts = {v for e in edges for v in e.verts}
    # which way the skin runs off each vertex of the edge, across the edge (down off the upper lip, up off the lower, inward at a corner)
    off = {}
    for v in verts:
        d = V((0, 0, 0))
        for f in v.link_faces:
            d += v.co - f.calc_center_median()
        d.y = 0
        off[v] = d.normalized() if d.length > 1e-7 else V((0, 0, -1 if v.co.z > MZ else 1))
    rings = {}
    for v in verts:
        chain = [v]
        for k, (back, past) in enumerate(RINGS):
            q = bm.verts.new(v.co + V((0, back, 0)) + off[v] * past, v)
            q[roll] = (k + 1) * (1 if off[v].z <= 0 else -1)          # the ring's number; below zero on the lower lip
            q[src] = v.co
            chain.append(q)
        rings[v] = chain
    made = 0
    for e in edges:
        f = e.link_faces[0]
        a, b = e.verts
        for l in f.loops:                    # the new face runs the edge the other way from the face it joins
            if l.edge == e:
                a, b = l.vert, l.link_loop_next.vert
                break
        for k in range(len(RINGS)):
            nf = bm.faces.new((b, a, rings[a][k + 1], rings[b][k + 1]) if k == 0 else (rings[b][k], rings[a][k], rings[a][k + 1], rings[b][k + 1]))
            nf.smooth = True
            if uvl:                          # an island of its own: round the mouth along u, into the mouth along v
                ang = lambda w: math.atan2(w.co.z - MZ, w.co.x) / (2 * math.pi) + 0.5
                ua, ub = ang(a), ang(b)
                if abs(ua - ub) > 0.5:
                    ub += 1.0 if ua > ub else -1.0
                for l, (u_, v_) in zip(nf.loops, ((ub, k), (ua, k), (ua, k + 1), (ub, k + 1))):
                    l[uvl].uv = (0.002 + 0.16 * u_, 0.002 + 0.012 * v_)
            made += 1
    if log:
        log('lip roll: edge', len(edges), 'faces', made)
    return made


def lip_tags(body):
    at = body.data.attributes.get('roll')
    if not at:
        return {}
    r = [abs(d.value) for d in at.data]
    out = {}
    for poly in body.data.polygons:
        m = max(r[i] for i in poly.vertices)
        if m > 0.5 and min(r[i] for i in poly.vertices) > m - 1.5 and all(_near_mouth(body.data.vertices[i].co) for i in poly.vertices):
            out[poly.index] = 'lip%d' % int(round(m))
    return out


def roll_keys(body, log=None):
    """Every ring of the roll moves, in every shape key, as the vertex of the lip's edge it grew from."""
    me = body.data
    at, sa = me.attributes.get('roll'), me.attributes.get('roll_src')
    if not at or not me.shape_keys:
        return
    r = [d.value for d in at.data]
    plain = [i for i, v in enumerate(me.vertices) if abs(r[i]) < 0.5 and _near_mouth(v.co)]
    jaw = me.shape_keys.key_blocks.get('jaw_open')
    kd = KDTree(len(plain))
    for k, i in enumerate(plain):
        kd.insert(me.vertices[i].co, k)
    kd.balance()
    n = 0
    for i, v in enumerate(me.vertices):
        if abs(r[i]) < 0.5:
            continue
        # the seam between the lips is of doubled vertices, one of each lip in the same place: the ring takes the one of its own lip
        # (of the two, the lower lip's is the one the jaw carries down)
        near = [plain[k] for _, k, _ in kd.find_range(V(sa.data[i].vector), 2e-4)] or [plain[kd.find(V(sa.data[i].vector))[1]]]
        drop = lambda j_: jaw.data[j_].co.z - me.vertices[j_].co.z
        j = min(near, key=drop) if r[i] < 0 else max(near, key=drop)
        for kb in me.shape_keys.key_blocks[1:]:
            kb.data[i].co = V(v.co) + (V(kb.data[j].co) - V(me.vertices[j].co))
        n += 1
    if log:
        log('lip roll: vertices that follow the edge', n)


# ----------------------------------------------------------------------------------------------------------------
# inside

def cell(name, t):
    """A place in a cell of the cells atlas: t = 0 is the lit front of the thing, 1 its dark back."""
    u, v = P.PATCH[name]
    return (u, v + 0.09 - 0.18 * max(0.0, min(1.0, t)))


def arch_at(s, y0, k=ARCH_K):
    """The arch at the distance s along it from the middle: (x, y, the tangent's x and y)."""
    x, step = 0.0, 0.0004 if s >= 0 else -0.0004
    go = 0.0
    while abs(go) < abs(s):
        dy = 2 * k * x / (ARCH_W ** 2)
        x += step / math.hypot(1, dy)
        go += step
    dy = 2 * k * x / (ARCH_W ** 2)
    ln = math.hypot(1, dy)
    return x, y0 + k * (x / ARCH_W) ** 2, 1 / ln, dy / ln


def teeth(mb, uv, widths, y0, z_edge, z_gum, thick, seed, gum=0.0055):
    """An arch of teeth, each a piece of its own: a front a little rounded, a biting edge with thickness, two flanks (which fall in
    the dark between one tooth's paint and the next), no two of quite the same length. `widths` runs from the middle outward; the
    arch is the two halves. Above the roots (or below, for the lower arch) a band of gum."""
    sgn = 1.0 if z_gum > z_edge else -1.0
    order = []
    s = 0.0
    for w in widths:
        order.append((s, w))
        s += w
    full = [(-(a + w), w, i) for i, (a, w) in enumerate(order)][::-1] + [(a, w, i) for i, (a, w) in enumerate(order)]
    n = len(full)
    gum_pts = []
    for t, (s0, w, rank) in enumerate(full):
        jit = P.hsh(t * 3.1, seed, 1.0) - 0.5
        short = 0.0011 * rank / max(1, len(widths) - 1) + 0.0006 * jit
        ze = z_edge + sgn * short
        gap = 0.00022
        cols = []
        for k, a in enumerate((0.0, 0.5, 1.0)):
            x, y, tx, ty = arch_at(s0 + gap + (w - 2 * gap) * a, y0)
            nx, ny = ty, -tx                       # out of the mouth
            bulge = 0.0007 if k == 1 else 0.0
            front = V((x + nx * bulge, y + ny * bulge + 0.0004 * jit, 0))
            back = V((x - nx * thick, y - ny * thick, 0))
            cols.append((front, back, V((nx, ny, 0))))
        u0, u1 = (t + 1) / 10, (t + 2) / 10          # the strip of the atlas has ten teeth: each of these eight takes one of its own
        grid = []
        for k, (front, back, nn) in enumerate(cols):
            u = u0 + (u1 - u0) * (0.08 + 0.84 * k / 2)
            edge_z = ze - sgn * (0.0005 if k != 1 else 0.0)        # the biting corners are rounded off
            col = []
            for z, v, p in ((z_gum, 0.985, front), ((z_gum + ze) / 2, 0.875, front + nn * 0.0003), (edge_z, 0.772, front), (edge_z, 0.758, back)):
                i = mb.vert((p.x, p.y, z), tuple(nn))
                uv[i] = (u, v)
                col.append(i)
            grid.append(col)
        for a, b in zip(grid, grid[1:]):
            for r in range(3):
                mb.face((a[r + 1], b[r + 1], b[r], a[r]) if sgn > 0 else (a[r], b[r], b[r + 1], a[r + 1]), 'teeth')
        for side, col in ((0, grid[0]), (1, grid[-1])):            # the flanks, in the dark between two teeth
            front, back, nn = cols[0 if side == 0 else -1]
            i0 = mb.vert((back.x, back.y, z_gum), tuple(-nn))
            i1 = mb.vert((back.x, back.y, col_z(mb, col[2])), tuple(-nn))
            uu = u0 + 0.004 if side == 0 else u1 - 0.004
            uv[i0], uv[i1] = (uu, 0.985), (uu, 0.772)
            j0 = mb.vert(mb.v[col[0]], tuple(nn))
            j1 = mb.vert(mb.v[col[2]], tuple(nn))
            uv[j0], uv[j1] = (uu, 0.985), (uu, 0.772)
            quad = (j0, j1, i1, i0) if (side == 0) != (sgn > 0) else (i0, i1, j1, j0)
            mb.face(quad, 'teeth')
        gum_pts.append((cols[0][0], cols[0][2]))
        if t == n - 1:
            gum_pts.append((cols[-1][0], cols[-1][2]))
    # the gum: a band over the roots, standing a little proud of the teeth
    rows = []
    for front, nn in gum_pts:
        row = []
        for k, (dz, out, t_) in enumerate(((-0.0006, 0.0002, 0.15), (gum * 0.45, 0.0011, 0.35), (gum, 0.0002, 0.8))):
            i = mb.vert((front.x + nn.x * out, front.y + nn.y * out, z_gum + sgn * dz), tuple(nn))
            uv[i] = cell('gum', t_)
            row.append(i)
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for r in range(2):
            mb.face((a[r], b[r], b[r + 1], a[r + 1]) if sgn > 0 else (a[r + 1], b[r + 1], b[r], a[r]), 'gum')


def col_z(mb, i):
    return mb.v[i][2]


def shell(mb, uv, c, r, name, seg=12, rings=7, deform=None, shade=None):
    """A ball of the cells atlas: `shade(p)` says how far into the dark each of its vertices is (0..1)."""
    i0 = len(mb.v)
    mb.sphere(c, r, seg, rings, mat=name, deform=deform)
    for i in range(i0, len(mb.v)):
        uv[i] = cell(name, shade(V(mb.v[i])) if shade else 0.5)
    return i0, len(mb.v)


def inside(MB):
    """-> (mouth, low, the UVs of each, [(first vertex, one past the last, the share of the jaw's drop)] of the lower piece)."""
    mouth, low = MB('mouth'), MB('mouthlow')
    m_uv, l_uv = {}, {}
    deep = lambda p: smooth(-0.078, -0.048, p.y)                    # darker toward the throat
    # on the head: the roof and the back of the mouth, the upper arch
    shell(mouth, m_uv, (0, -0.057, MZ - 0.006), (0.033, 0.0235, 0.017), 'cavity', shade=lambda p: max(deep(p), smooth(MZ - 0.004, MZ - 0.02, p.z) * 0.6))
    teeth(mouth, m_uv, (0.0080, 0.0062, 0.0068, 0.0062), ARCH_Y, MZ - 0.0052, MZ + 0.0052, 0.0022, seed=3)
    # on the jaw: the floor, the tongue, the lower arch (a little behind the upper, and shorter)
    parts = []
    a = shell(low, l_uv, (0, -0.059, MZ - 0.017), (0.029, 0.0205, 0.011), 'cavity', 10, 5, shade=lambda p: 0.35 + 0.65 * deep(p))
    parts.append((a[0], a[1], 0.97))

    def tongue(p):
        # a tip that thins and dips behind the lower teeth, a broad back, a groove down the middle
        f = smooth(-0.066, -0.084, p.y)
        z = p.z - 0.0028 * f - 0.0011 * math.exp(-(p.x / 0.0042) ** 2) * (1 if p.z > MZ - 0.0105 else 0) * (1 - f)
        return V((p.x * (1 - 0.3 * f), p.y, z + 0.0016 * smooth(-0.066, -0.05, p.y)))
    a = shell(low, l_uv, (0, -0.0655, MZ - 0.0105), (0.0172, 0.0185, 0.0068), 'tongue', 12, 7, deform=tongue, shade=lambda p: 0.1 + 0.9 * smooth(-0.078, -0.05, p.y))
    parts.append((a[0], a[1], 0.62))
    i0 = len(low.v)
    teeth(low, l_uv, (0.0052, 0.0056, 0.0064, 0.0064), ARCH_Y + 0.0019, MZ - 0.0036, MZ - 0.0112, 0.0018, seed=8, gum=0.0045)
    parts.append((i0, len(low.v), 0.85))
    return mouth, low, m_uv, l_uv, parts
