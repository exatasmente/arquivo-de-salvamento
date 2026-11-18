"""Helpers for the city pieces (run inside Blender: blender -b -P build_pieces.py). Every piece is built from a few
primitives with explicit materials by NAME; the game maps the names to its painted materials (src/models/city/pieces.js).
Units are metres, +Z up in Blender (the glTF exporter turns it into +Y up). The front of a vehicle is -Y here (+Z in the game)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


_mats = {}


def mat(name):
    if name not in _mats or _mats[name].name not in bpy.data.materials:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        _mats[name] = m
    return _mats[name]


def cube_uv(bm, scale=0.5):
    """Box projection: each face is mapped on the plane of its dominant normal axis, 1 uv unit = 1/scale metres."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            u, v = [(p.y, p.z), (p.x, p.z), (p.x, p.y)][ax]
            l[uv].uv = (u * scale, v * scale)


def make(name, bm, material, smooth=False, uv_scale=0.5):
    cube_uv(bm, uv_scale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(material))
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(name, material, size, pos=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, smooth=False):
    """size = (x, y, z); pos = centre of the bottom face."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, size[2] / 2), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES')
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot).to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=pos, verts=bm.verts)
    bm.normal_update()
    return make(name, bm, material, smooth)


def cyl(name, material, r0, r1, h, pos=(0, 0, 0), rot=(0, 0, 0), seg=12, smooth=True, caps=True):
    """r0 = bottom radius, r1 = top radius, pos = centre of the bottom."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot).to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=pos, verts=bm.verts)
    bm.normal_update()
    return make(name, bm, material, smooth)


def tube(name, material, a, b, r, seg=6):
    a, b = Vector(a), Vector(b)
    d = b - a
    h = d.length
    q = d.to_track_quat('Z', 'Y')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=a, verts=bm.verts)
    bm.normal_update()
    return make(name, bm, material, False)


def loft(name, material, stations, smooth=True, subsurf=0):
    """stations: list of rings; each ring = list of (x, y, z) points, all rings with the same count, closed. Capped at both ends."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in ring] for ring in stations]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = make(name, bm, material, smooth)
    if subsurf:
        m = ob.modifiers.new('sub', 'SUBSURF')
        m.levels = subsurf
        m.render_levels = subsurf
    return ob


def rrect(w, z0, z1, y, ch=0.12):
    """A ring in the XZ plane at depth y (Blender Y): a rounded rectangle of width w from z0 to z1, 8 points, counter-clockwise seen from -Y."""
    hw = w / 2
    c = min(ch, hw * 0.9, (z1 - z0) * 0.45)
    return [(-hw + c, y, z0), (hw - c, y, z0), (hw, y, z0 + c), (hw, y, z1 - c), (hw - c, y, z1), (-hw + c, y, z1), (-hw, y, z1 - c), (-hw, y, z0 + c)]


def join(name, objs):
    """Joins objects into one (keeps the materials by slot)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:  # apply modifiers first
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
