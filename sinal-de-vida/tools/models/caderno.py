"""Jonas's notebook: a pocket notebook that opens and whose pages turn, made to lie on the socket of his left palm (grip_l, see
jonas_radio.py) as it is.

    "$BLENDER" --background --factory-startup --python tools/models/caderno.py -- --out assets/props

Writes <out>/caderno.glb. In the exported file x is to the reader's right, y up the page (away from him), z out of the page toward
his eyes; the origin is the socket of the palm, the spine a little to its right. Painted like the radio (radio.py's tools): one
atlas, no downloads, nothing random without a seed.

Nodes: `cover` (the back cover and the right-hand block of pages, still), `cover_l` (the front cover with the left-hand block: turns
about the spine, its own y), `page_0` .. `page_2` (three loose leaves on the right-hand block: each turns about the spine).
Clips: `open` (the front cover from shut to open) and `page_turn_0` .. `page_turn_2` (a leaf from the right to the left). At rest
the notebook is open and no leaf is turned; a clip held at its start shows the state before it (`open` at 0 is the notebook shut).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix  # noqa: E402

import common as C  # noqa: E402
import radio as R  # noqa: E402
from radio import Part, box, col, mixc, sm, vnoise, surface, edges, text  # noqa: E402

PW, PH = 0.092, 0.140                # a page
CW, CH = 0.097, 0.146                # a cover
COVER, BLOCK = 0.002, 0.005          # how thick a cover is, and a block of pages
SPINE = (0.03, 0.004, 0.01)          # the spine's middle from the socket: to the right, behind the socket (toward the palm), up the page
PIVOT = COVER + BLOCK + 0.0003       # the height of the spine's hinge over the back cover's outside
FPS = 30
TURN, OPEN = 0.55, 0.45              # seconds
PAPER = (0.86, 0.82, 0.70)
LEATHER = (0.24, 0.12, 0.09)


def paint_cover(seed, label):
    def fn(X, Y, w, h):
        c = surface(X, Y, LEATHER, seed, ang=1.2, amt=0.8)
        c = c * (0.9 + 0.2 * vnoise(X, Y, 0.0016, seed + 1))[..., None]            # the grain of the cloth
        c = edges(X, Y, w, h, c, wear=1.0, seed=seed, dark=0.3, light=(0.62, 0.50, 0.40))
        hg = 0.5 + 0.1 * (vnoise(X, Y, 0.0016, seed + 1) - 0.5)
        if label:
            band = sm(0.0045, 0.0038, np.abs(X - w * 0.84))                          # the elastic band
            c = mixc(c, col((0.06, 0.055, 0.05))[None, None, :] * (0.7 + 0.6 * vnoise(X, Y, (0.01, 0.0008), seed + 2))[..., None], band)
            hg = hg + 0.25 * band
            d = R.sd_box(X, Y, w * 0.42, h * 0.72, 0.026, 0.012, 0.002)             # a paper label, blank and stained
            lab = col((0.80, 0.75, 0.62))[None, None, :] * (0.85 + 0.25 * vnoise(X, Y, 0.012, seed + 3))[..., None]
            c = mixc(c, lab, sm(0.0004, -0.0003, d))
            c = mixc(c, col((0.25, 0.2, 0.18)), 0.7 * sm(0.0007, 0.0002, np.abs(d + 0.002)))
        return c, hg
    return fn


def paint_page(seed, lines=True, sketch=False):
    """A ruled page with his notes: rows of handwriting (a shaky line that breaks into words), a number here and there, a margin."""
    def fn(X, Y, w, h):
        c = col(PAPER)[None, None, :] * (0.9 + 0.14 * vnoise(X, Y, 0.03, seed) + 0.05 * (vnoise(X, Y, 0.0015, seed + 1) - 0.5))[..., None]
        c = c * (1 - 0.3 * sm(0.012, 0.0, X) * (1 if seed % 2 else 0) - 0.3 * sm(0.012, 0.0, w - X) * (0 if seed % 2 else 1))[..., None]     # the shadow of the gutter
        c = c * (1 - 0.12 * sm(0.006, 0.0, np.minimum(np.minimum(X, w - X), np.minimum(Y, h - Y))))[..., None]
        stain = sm(0.55, 0.8, vnoise(X, Y, 0.02, seed + 2))
        c = mixc(c, col((0.70, 0.62, 0.45)), 0.25 * stain)
        pitch, top = 0.0078, h - 0.016
        row = np.floor((top - Y) / pitch + 0.5)
        yl = top - row * pitch
        ok = (row >= 0) & (yl > 0.008)
        if lines:
            c = mixc(c, col((0.45, 0.55, 0.66)), 0.55 * sm(0.0004, 0.00015, np.abs(Y - yl)) * ok)
            c = mixc(c, col((0.72, 0.30, 0.26)), 0.55 * sm(0.0004, 0.00015, np.abs(X - 0.012)))
        # the handwriting: a pen line riding just over each rule, wobbling, broken into words of different lengths
        rs = np.random.RandomState(seed)
        nrow = int(top / pitch)
        fill = rs.rand(nrow + 2)
        indent = rs.rand(nrow + 2) * 0.012
        r_i = np.clip(row.astype(np.int64), 0, nrow)
        wob = (vnoise(X, row, (0.0011, 1.0), seed + 5) - 0.5) * 0.0042 + (vnoise(X, row, (0.0045, 1.0), seed + 6) - 0.5) * 0.0016
        word = sm(0.32, 0.42, vnoise(X, row, (0.0075, 1.0), seed + 7))
        pen = sm(0.00062, 0.00026, np.abs(Y - (yl + 0.0026) - wob)) * word * ok
        pen = pen * (X > 0.015 + indent[r_i]) * (X < 0.015 + indent[r_i] + (w - 0.022) * (0.35 + 0.65 * fill[r_i])) * (fill[r_i] > 0.18)
        if sketch:
            pen = pen * (Y > h * 0.5)
        c = mixc(c, col((0.13, 0.14, 0.24)), 0.85 * pen)
        if sketch:                                         # a little drawing: a mast with rings of signal, and numbers beside it
            cx, cy = w * 0.34, h * 0.24
            rr = np.hypot(X - cx, Y - (cy + 0.022))
            ink = sm(0.0005, 0.0002, np.abs(X - cx - 0.002 * np.sin(Y * 180))) * (Y > cy - 0.022) * (Y < cy + 0.022)
            for k in (0.008, 0.014, 0.020):
                ink = np.maximum(ink, sm(0.0005, 0.0002, np.abs(rr - k)) * (Y > cy + 0.022 + (X - cx) * 0.3) * (np.abs(X - cx) > 0.003))
            ink = np.maximum(ink, text(X, Y, '21', w * 0.72, cy + 0.02, 0.0085, 1.2))
            ink = np.maximum(ink, text(X, Y, '63', w * 0.72, cy + 0.004, 0.0085, 1.2))
            ink = np.maximum(ink, text(X, Y, '88', w * 0.72, cy - 0.012, 0.0085, 1.2))
            ring = sm(0.0006, 0.0002, np.abs(np.hypot((X - w * 0.72) / 1.5, Y - (cy - 0.012)) - 0.0075))
            c = mixc(c, col((0.13, 0.14, 0.24)), 0.85 * ink)
            c = mixc(c, col((0.62, 0.18, 0.14)), 0.8 * ring)
        return c, np.full(X.shape, 0.5, dtype=np.float32)
    return fn


def paint_edge(X, Y, w, h):
    c = col(PAPER)[None, None, :] * (0.62 + 0.3 * vnoise(X, Y, (0.02, 0.0004), 9))[..., None]
    return c, np.full(X.shape, 0.5, dtype=np.float32)


def key_turn(ob, name, frames, a0, a1):
    """A clip of a node turning about its own z (the spine) from a0 to a1, eased."""
    ob.rotation_mode = 'XYZ'
    ad = ob.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    for f in range(frames + 1):
        u = f / frames
        u = u * u * (3 - 2 * u)
        ob.rotation_euler = (0, 0, a0 + (a1 - a0) * u)
        ob.keyframe_insert('rotation_euler', frame=f)
    ob.rotation_euler = (0, 0, 0)
    ad.action = None
    tr = ad.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 0, act).name = name


def main():
    args = C.script_args()
    out = args.get('out', 'assets/props')
    C.reset_scene()
    R.SIZE = 1024
    A = R.Atlas()
    mat = bpy.data.materials.new('caderno')
    mat.use_nodes = True
    root = bpy.data.objects.new('caderno', None)
    bpy.context.scene.collection.objects.link(root)
    D = 2150
    R_out = A.rect('cover_out', CW, CH, D, paint_cover(3, False))
    R_front = A.rect('cover_front', CW, CH, D, paint_cover(5, True))
    R_in = A.rect('cover_in', CW, CH, 900, paint_cover(7, False))
    R_edge = A.rect('edge', 0.2, BLOCK, 1500, paint_edge)
    R_cedge = A.rect('cedge', 0.2, COVER, 1500, paint_cover(9, False))
    R_right = A.rect('page_right', PW, PH, D, paint_page(12, sketch=True))
    R_left = A.rect('page_left', PW, PH, D, paint_page(11))
    R_leaf = [(A.rect('leaf%d_a' % i, PW, PH, D, paint_page(20 + 2 * i)), A.rect('leaf%d_b' % i, PW, PH, D, paint_page(21 + 2 * i, sketch=(i == 1)))) for i in range(3)]
    # the frame of the whole: x to the right, z up the page, -y toward the reader; the spine's line is its z axis
    base = Matrix.Translation((SPINE[0], SPINE[1], SPINE[2]))

    def put(part, world, parent=None):
        return part.build(mat, world, parent or root)

    # the back cover with the right-hand block (n is the height over the back cover's outside, toward the reader)
    cover = Part('cover')
    cover.prism(box(CW / 2, CH / 2, CW / 2, 0), 0.0, COVER, R_in, R_cedge)
    cover.face([(x, 0.0, z) for x, z in reversed(box(CW / 2, CH / 2, CW / 2, 0))], R_out, [(CW - (x), z + CH / 2) for x, z in reversed(box(CW / 2, CH / 2, CW / 2, 0))])
    cover.prism(box(PW / 2, PH / 2, PW / 2 + 0.001, 0), COVER, COVER + BLOCK, R_right, R_edge, fit=(0.001, -PH / 2))
    cover.prism(box(0.0025, CH / 2, 0, 0), -0.0005, PIVOT, R_cedge, R_cedge)            # the spine
    put(cover, base)
    # the front cover with the left-hand block, hinged on the spine: open it lies to the left
    hinge = base @ Matrix.Translation((0, -PIVOT, 0))
    left = Part('cover_l')
    left.prism(box(CW / 2, CH / 2, -CW / 2, 0), -PIVOT, -PIVOT + COVER, R_in, R_cedge)
    left.face([(x, PIVOT, z) for x, z in reversed(box(CW / 2, CH / 2, -CW / 2, 0))], R_front, [(-x, z + CH / 2) for x, z in reversed(box(CW / 2, CH / 2, -CW / 2, 0))])
    left.prism(box(PW / 2, PH / 2, -PW / 2 - 0.001, 0), -PIVOT + COVER, -PIVOT + COVER + BLOCK, R_left, R_edge, fit=(-PW - 0.001, -PH / 2))
    cl = put(left, hinge)
    key_turn(cl, 'open', int(OPEN * FPS), math.radians(176), 0.0)
    # three loose leaves on the right-hand block, each a sheet with two sides, hinged on the spine
    for i in range(3):
        leaf = Part('page_%d' % i)
        n = 0.0002 + (2 - i) * 0.00025
        SEG = 4
        for k in range(SEG):
            x0, x1 = 0.001 + PW * k / SEG, 0.001 + PW * (k + 1) / SEG
            lift = lambda x: n + 0.0012 * math.sin(math.pi * (x - 0.001) / PW)      # a leaf never lies quite flat
            a, b = R_leaf[i]
            leaf.face([(x0, -lift(x0), -PH / 2), (x1, -lift(x1), -PH / 2), (x1, -lift(x1), PH / 2), (x0, -lift(x0), PH / 2)], a,
                      [(x0 - 0.001, 0), (x1 - 0.001, 0), (x1 - 0.001, PH), (x0 - 0.001, PH)], True)
            leaf.index = {}
            leaf.face([(x1, -lift(x1) + 0.00008, -PH / 2), (x0, -lift(x0) + 0.00008, -PH / 2), (x0, -lift(x0) + 0.00008, PH / 2), (x1, -lift(x1) + 0.00008, PH / 2)], b,
                      [(PW - (x1 - 0.001), 0), (PW - (x0 - 0.001), 0), (PW - (x0 - 0.001), PH), (PW - (x1 - 0.001), PH)], True)
            leaf.index = {}
        ob = put(leaf, hinge)
        key_turn(ob, 'page_turn_%d' % i, int(TURN * FPS), 0.0, -math.radians(174 - 1.5 * i))
    A.pack()
    R.assign_uvs()
    rgb, hgt = A.paint()
    img = R.image('caderno', rgb)
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.95
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if os.environ.get('RADIO_DUMP'):
        img.filepath_raw = os.path.join(os.environ['RADIO_DUMP'], 'caderno.png')
        img.file_format = 'PNG'
        img.save()
        img.file_format = 'JPEG'
    bpy.context.scene.render.fps = FPS
    path = os.path.join(out, 'caderno.glb')
    C.export_glb(path, dict(export_image_format='JPEG', export_jpeg_quality=78, export_texcoords=True, export_animations=True, export_materials='EXPORT',
                            export_vertex_color='NONE', export_skins=False, export_optimize_animation_size=False))
    R.log('WROTE', path, os.path.getsize(path), 'tris', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons))


if __name__ == '__main__':
    main()
