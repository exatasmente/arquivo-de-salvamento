"""Shared pieces of the Blender model scripts (person.py, dog.py).

Run through Blender, never alone:
    "$BLENDER" --background --factory-startup --python tools/models/person.py -- --out assets/models
The path of the Blender binary comes from the BLENDER environment variable (or you just call it by name).

Everything here is deterministic: no clock, no unseeded random.

Conventions: metres, Z up. Models face +Y in Blender, which the glTF exporter turns into -Z in three.js (the game's
"forward"). A character's right hand is +X.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def script_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    out = {'out': 'assets/models'}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--') and i + 1 < len(argv):
            out[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    return out


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


# ----------------------------------------------------------------------------------------------------------------
# colours

def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mixc(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))) if b != a else 0.0
    return t * t * (3 - 2 * t)


_mats = {}


K_MAX = 1.6   # brightest multiplier the ramp holds
T_MAX = 1.5   # warmest tint


def encode_shade(c):
    """A shade (r, g, b) near grey -> (u, v) in the ramp: brightness k = r, warmth t from how much green and blue fall below it."""
    k = max(0.0, min(K_MAX, c[0]))
    t = 0.0 if k < 1e-4 else max(0.0, min(T_MAX, (1.0 - c[1] / k) / 0.07))
    return (k / K_MAX, t / T_MAX)


def material(name, color=(1, 1, 1), rough=0.9, emit=None):
    """A named material (the game recolours it by name: the base colour is only the default)."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = (*color, 1)
    _mats[name] = m
    return m


# ----------------------------------------------------------------------------------------------------------------
# the mesh builder: lists of vertices and faces, a colour per vertex, a material per face

class MB:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.fm = []        # material name per face
        self.col = []       # (r, g, b) per vertex
        self.n = []         # approximate normal per vertex (for the colour function)
        self.flat = False   # hard edges (angular parts)
        self.bone = None    # single bone (rigid), or None: the weights come from `weights`
        self.allowed = None  # bones that may weigh on this mesh
        self.default_mat = 'skin'

    def vert(self, p, n=(0, 0, 1), c=(1, 1, 1)):
        self.v.append(tuple(p))
        self.n.append(tuple(n))
        self.col.append(tuple(c))
        return len(self.v) - 1

    def face(self, idx, mat=None):
        self.f.append(tuple(idx))
        self.fm.append(mat or self.default_mat)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    # a loft of elliptical rings. sections: dicts with c (centre), d (tangent), rx, ry, optional u (side axis), col, k(theta)
    def loft(self, sections, sides=8, cap0=0.0, cap1=0.0, mat=None, colfn=None, close=True, phase=0.0, arc=None):
        rings = []
        for s in sections:
            c = Vector(s['c'])
            d = Vector(s.get('d', (0, 0, 1))).normalized()
            hint = Vector(s.get('u', (1, 0, 0)))
            u = (hint - d * hint.dot(d))
            if u.length < 1e-6:
                u = Vector((0, 1, 0)) - d * d.y
            u.normalize()
            w = d.cross(u).normalized()
            rx, ry = s['rx'], s['ry']
            kf = s.get('k')
            ring = []
            npts = sides + 1 if arc else sides
            for i in range(npts):
                th = (arc[0] + (arc[1] - arc[0]) * i / sides) if arc else phase + 2 * math.pi * i / sides
                k = kf(th) if kf else 1.0
                off = u * (math.cos(th) * rx * k) + w * (math.sin(th) * ry * k)
                n = (u * math.cos(th) * ry + w * math.sin(th) * rx).normalized()
                p = c + off
                col = s.get('col', (1, 1, 1))
                if colfn:
                    col = colfn(p, n, s)
                ring.append(self.vert(p, n, col))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(sides):
                j = i + 1 if arc else (i + 1) % sides
                self.face((a[i], a[j], b[j], b[i]), mat)
        if arc:
            return rings
        # caps: a dome of one extra ring (or a flat fan when depth is 0)
        for end, depth, ring, s in ((0, cap0, rings[0], sections[0]), (1, cap1, rings[-1], sections[-1])):
            if depth is None:
                continue
            c = Vector(s['c'])
            d = Vector(s.get('d', (0, 0, 1))).normalized() * (-1 if end == 0 else 1)
            if depth > 0:
                pole = c + d * depth
                # one extra ring, pulled in toward the axis, so the end is round and not a cone
                ring2 = []
                for vi in ring:
                    q = c + (Vector(self.v[vi]) - c) * 0.74 + d * depth * 0.62
                    ring2.append(self.vert(q, tuple(Vector(self.n[vi]) * 0.7 + d * 0.4), self.col[vi]))
                pv = self.vert(pole, tuple(d), self.col[ring[0]])
                for i in range(sides):
                    j = (i + 1) % sides
                    if end == 1:
                        self.face((ring[i], ring[j], ring2[j], ring2[i]), mat)
                        self.face((ring2[i], ring2[j], pv), mat)
                    else:
                        self.face((ring[j], ring[i], ring2[i], ring2[j]), mat)
                        self.face((ring2[j], ring2[i], pv), mat)
            else:
                cv = self.vert(c, tuple(d), self.col[ring[0]])
                for i in range(sides):
                    j = (i + 1) % sides
                    self.face((ring[i], ring[j], cv) if end == 1 else (ring[j], ring[i], cv), mat)
        return rings

    def orient(self, start):
        """Flip the faces added since `start` that look toward the middle of the group (for convex bits: spheres, boxes)."""
        idx = {i for f in self.f[start:] for i in f}
        cen = sum((Vector(self.v[i]) for i in idx), Vector()) / max(1, len(idx))
        for k in range(start, len(self.f)):
            f = self.f[k]
            pts = [Vector(self.v[i]) for i in f]
            nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            ctr = sum(pts, Vector()) / len(pts)
            if nrm.dot(ctr - cen) < 0:
                self.f[k] = tuple(reversed(f))

    def sphere(self, c, r, seg=10, rings=6, mat=None, col=(1, 1, 1), colfn=None, deform=None):
        """A UV sphere (r may be a 3-tuple of radii). deform(p) -> p can reshape it."""
        f0 = len(self.f)
        rx, ry, rz = (r, r, r) if not isinstance(r, (tuple, list)) else r
        top = None
        grid = []
        for j in range(1, rings):
            ph = math.pi * j / rings
            row = []
            for i in range(seg):
                th = 2 * math.pi * i / seg
                n = Vector((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)))
                p = Vector((n.x * rx, n.y * ry, n.z * rz))
                if deform:
                    p = Vector(deform(p))
                p = p + Vector(c)
                cc = colfn(p, n, None) if colfn else col
                row.append(self.vert(p, n, cc))
            grid.append(row)
        pt = Vector((0, 0, rz)); pb = Vector((0, 0, -rz))
        if deform:
            pt = Vector(deform(pt)); pb = Vector(deform(pb))
        t = self.vert(pt + Vector(c), (0, 0, 1), colfn(pt + Vector(c), Vector((0, 0, 1)), None) if colfn else col)
        b = self.vert(pb + Vector(c), (0, 0, -1), colfn(pb + Vector(c), Vector((0, 0, -1)), None) if colfn else col)
        for i in range(seg):
            j = (i + 1) % seg
            self.face((t, grid[0][j], grid[0][i]), mat)
            self.face((b, grid[-1][i], grid[-1][j]), mat)
        for a, bb in zip(grid, grid[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                self.face((a[i], a[j], bb[j], bb[i]), mat)
        self.orient(f0)
        return grid

    def blob(self, c, r, seg=6, rings=4, mat=None, col=(1, 1, 1), colfn=None, deform=None):
        return self.sphere(c, r, seg, rings, mat, col, colfn, deform)

    def box(self, c, size, mat=None, col=(1, 1, 1), rot=None, bevel=0.0):
        """A box (a rounded one when bevel > 0: the corners are pulled in)."""
        f0 = len(self.f)
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        R = rot if rot is not None else Matrix.Identity(3)
        pts = []
        for z in (-1, 1):
            for y in (-1, 1):
                for x in (-1, 1):
                    pts.append(Vector((x * hx, y * hy, z * hz)))
        idx = []
        for p in pts:
            q = R @ p + Vector(c)
            n = (R @ p).normalized()
            idx.append(self.vert(q, n, col))
        quads = ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))
        for q in quads:
            self.face(tuple(idx[i] for i in q), mat)
        self.orient(f0)
        return idx

    def apply_color(self, fn):
        for i, p in enumerate(self.v):
            self.col[i] = fn(Vector(p), Vector(self.n[i]), self.col[i])

    def transform(self, M):
        M = Matrix(M)
        for i, p in enumerate(self.v):
            self.v[i] = tuple(M @ Vector(p))
        R = M.to_3x3()
        for i, n in enumerate(self.n):
            self.n[i] = tuple((R @ Vector(n)).normalized())

    def merge(self, other):
        o = len(self.v)
        self.v += other.v; self.n += other.n; self.col += other.col
        for f, m in zip(other.f, other.fm):
            self.f.append(tuple(i + o for i in f)); self.fm.append(m)
        return o

    def bvh(self):
        tris = []
        for f in self.f:
            for k in range(1, len(f) - 1):
                tris.append((f[0], f[k], f[k + 1]))
        return BVHTree.FromPolygons(self.v, tris)


# ----------------------------------------------------------------------------------------------------------------
# object, weights, materials

def make_object(mb, collection=None):
    me = bpy.data.meshes.new(mb.name)
    me.from_pydata(mb.v, [], mb.f)
    me.update()
    mats = []
    for name in dict.fromkeys(mb.fm):
        mats.append(name)
        me.materials.append(material(name))
    for poly, m in zip(me.polygons, mb.fm):
        poly.material_index = mats.index(m)
        poly.use_smooth = not mb.flat
    # The per-vertex shade (a soft gradient) travels as UVs into a small ramp texture that the game makes (see
    # K_MAX and T_MAX): u is the brightness, v the warmth. Interpolated UVs on a linear ramp are interpolated colours.
    uv = me.uv_layers.new(name='UVMap')
    vals = []
    for loop in me.loops:
        vals += list(encode_shade(mb.col[loop.vertex_index]))
    uv.data.foreach_set('uv', vals)
    ob = bpy.data.objects.new(mb.name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def textured_material(name, image):
    """A material whose base colour is an image (the exporter packs it into the glb)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    return m


def flat_material(name, color):
    return material(name, color)


def make_object_patch(mb, image, patches, mat_name, patch_fn=None):
    """An object from an MB whose UVs all point at a patch (by material name, or by patch_fn(position)) of an image."""
    me = bpy.data.meshes.new(mb.name)
    me.from_pydata(mb.v, [], mb.f)
    me.update()
    me.materials.append(textured_material(mat_name, image))
    uv = me.uv_layers.new(name='UVMap')
    vals = []
    fm = mb.fm
    for poly in me.polygons:
        poly.use_smooth = True
    for poly, m in zip(me.polygons, fm):
        for li in poly.loop_indices:
            p = Vector(mb.v[me.loops[li].vertex_index])
            key = patch_fn(p) if patch_fn else m
            u, v = patches.get(key, patches[next(iter(patches))])
            uv.data[li].uv = (u, v)
    ob = bpy.data.objects.new(mb.name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def make_object_uvs(mb, image, mat_name, uvs):
    """An object from an MB with a UV per vertex (uvs[i] for vertex i), textured by `image`."""
    me = bpy.data.meshes.new(mb.name)
    me.from_pydata(mb.v, [], mb.f)
    me.update()
    me.materials.append(textured_material(mat_name, image))
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    ob = bpy.data.objects.new(mb.name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def weigh(ob, mb, bones, allowed, power=3.0, eps=0.012, top=4):
    """Skin weights by the distance of each vertex to the segments of the allowed bones."""
    segs = [(n, Vector(bones[n]['head']), Vector(bones[n]['tail'])) for n in allowed]
    groups = {}
    for vi, p in enumerate(mb.v):
        p = Vector(p)
        ws = []
        for n, a, b in segs:
            d = seg_dist(p, a, b)
            ws.append((1.0 / (d + eps) ** power, n))
        ws.sort(reverse=True)
        ws = ws[:top]
        tot = sum(w for w, _ in ws)
        for w, n in ws:
            if w / tot > 0.02:
                groups.setdefault(n, []).append((vi, w / tot))
    for n, items in groups.items():
        vg = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        for vi, w in items:
            vg.add([vi], w, 'REPLACE')


def rigid(ob, mb, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(mb.v))), 1.0, 'REPLACE')


# ----------------------------------------------------------------------------------------------------------------
# armature

def build_armature(name, spec):
    """spec: list of (name, parent, head, tail, hint). The bone's local X follows `hint` (a world vector), Y goes head -> tail."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    info = {}
    for bn, parent, head, tail, hint in spec:
        eb = arm.edit_bones.new(bn)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        y = (Vector(tail) - Vector(head)).normalized()
        h = Vector(hint)
        x = (h - y * h.dot(y))
        x.normalize()
        z = x.cross(y)
        eb.align_roll(z)
        if parent:
            eb.parent = arm.edit_bones[parent]
        info[bn] = {'head': tuple(head), 'tail': tuple(tail), 'parent': parent}
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ob, info


def bind(mesh_ob, arm_ob):
    mod = mesh_ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_ob
    mesh_ob.parent = arm_ob


# ----------------------------------------------------------------------------------------------------------------
# animation

class Clip:
    def __init__(self, name, seconds, fps=15, loop=True):
        self.name, self.seconds, self.fps, self.loop = name, seconds, fps, loop


def key_clip(arm_ob, clip, fn, bones=None):
    """fn(u) -> {bone: (rx, ry, rz)} (radians) and optionally {'@loc': {bone: (x, y, z)}}; u in [0, 1] (the last frame repeats the first when it loops)."""
    act = bpy.data.actions.new(clip.name)
    ad = arm_ob.animation_data or arm_ob.animation_data_create()
    ad.action = act
    frames = max(2, int(round(clip.seconds * clip.fps)))
    last = frames if clip.loop else frames
    f0 = 1
    touched = set()
    for k in range(frames + 1):
        u = k / frames
        pose = fn(u if not (clip.loop and k == frames) else 0.0)
        loc = pose.get('@loc', {})
        for bn, r in pose.items():
            if bn == '@loc':
                continue
            pb = arm_ob.pose.bones[bn]
            pb.rotation_euler = r
            pb.keyframe_insert('rotation_euler', frame=f0 + k)
            touched.add(bn)
        for bn, l in loc.items():
            pb = arm_ob.pose.bones[bn]
            pb.location = l
            pb.keyframe_insert('location', frame=f0 + k)
            touched.add(bn)
    # park the bones back at rest
    for pb in arm_ob.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    ad.action = None
    tr = ad.nla_tracks.new()
    tr.name = clip.name
    st = tr.strips.new(clip.name, f0, act)
    st.name = clip.name
    return act


def export_glb(path, extra=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    kw = dict(
        filepath=path, export_format='GLB', export_apply=False, export_skins=True, export_animations=True,
        export_animation_mode='NLA_TRACKS', export_vertex_color='NONE', export_materials='EXPORT',
        export_image_format='NONE', export_yup=True, export_force_sampling=True, export_optimize_animation_size=True,
        export_def_bones=False, export_shared_accessors=True, export_extras=False, export_cameras=False, export_lights=False, export_normals=True,
        export_texcoords=True, export_influence_nb=4,
    )
    kw.update(extra or {})
    bpy.ops.export_scene.gltf(**kw)
    minify_glb(path)


def minify_glb(path):
    """The exporter writes three channels per bone per clip and indents its JSON, which is most of a model with many clips.
    Rewrite the file compact, without the channels that only hold the bone's rest value and the accessors nothing uses."""
    import json
    import struct
    data = open(path, 'rb').read()
    jl = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jl])
    bin_chunk = data[20 + jl:]            # header (length, type) + data, kept as it is
    blob = bin_chunk[8:]
    accessors = doc['accessors']
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def values(ai):
        ac = accessors[ai]
        bv = doc['bufferViews'][ac['bufferView']]
        n = ncomp[ac['type']]
        off = bv.get('byteOffset', 0) + ac.get('byteOffset', 0)
        return [struct.unpack_from('<%df' % n, blob, off + i * n * 4) for i in range(ac['count'])]

    rest_of = {'translation': (0.0, 0.0, 0.0), 'rotation': (0.0, 0.0, 0.0, 1.0), 'scale': (1.0, 1.0, 1.0)}
    for anim in doc.get('animations', []):
        keep, samplers = [], []
        for ch in anim['channels']:
            sm = anim['samplers'][ch['sampler']]
            path_ = ch['target']['path']
            node = doc['nodes'][ch['target']['node']]
            rest = node.get(path_, rest_of[path_])
            vals = values(sm['output'])
            if path_ == 'rotation':
                same = all(abs(abs(sum(a * b for a, b in zip(v, rest))) - 1.0) < 1e-6 for v in vals)
            else:
                same = all(max(abs(a - b) for a, b in zip(v, rest)) < 1e-5 for v in vals)
            if same:
                continue
            keep.append(ch)
        used = {}
        for ch in keep:
            si = ch['sampler']
            if si not in used:
                used[si] = len(samplers)
                samplers.append(anim['samplers'][si])
            ch['sampler'] = used[si]
        anim['channels'], anim['samplers'] = keep, samplers
    # drop the accessors nothing uses and renumber
    refs = set()
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            refs.update(p['attributes'].values())
            for t in p.get('targets', []):
                refs.update(t.values())
            if 'indices' in p:
                refs.add(p['indices'])
    for sk in doc.get('skins', []):
        if 'inverseBindMatrices' in sk:
            refs.add(sk['inverseBindMatrices'])
    for anim in doc.get('animations', []):
        for sm in anim['samplers']:
            refs.update((sm['input'], sm['output']))
    order = sorted(refs)
    remap = {old: new for new, old in enumerate(order)}
    doc['accessors'] = [accessors[i] for i in order]
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: remap[v] for k, v in p['attributes'].items()}
            if 'targets' in p:
                p['targets'] = [{k: remap[v] for k, v in t.items()} for t in p['targets']]
            if 'indices' in p:
                p['indices'] = remap[p['indices']]
    for sk in doc.get('skins', []):
        if 'inverseBindMatrices' in sk:
            sk['inverseBindMatrices'] = remap[sk['inverseBindMatrices']]
    for anim in doc.get('animations', []):
        for sm in anim['samplers']:
            sm['input'], sm['output'] = remap[sm['input']], remap[sm['output']]
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(bin_chunk)) + struct.pack('<II', len(js), 0x4E4F534A) + js + bin_chunk
    open(path, 'wb').write(out)


def shrink_glb(path, anim_step=2, steps=None):
    """Smaller file: the animation keyframes are kept every `anim_step` frames (the game interpolates between them), the skin weights
    become normalised bytes, and the buffer is rewritten without what nothing uses. `steps` gives other steps by the clip's name (a slow
    clip needs fewer keys)."""
    import json
    import struct
    data = open(path, 'rb').read()
    jl = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jl])
    blob = data[20 + jl + 8:]
    acc, views = doc['accessors'], doc['bufferViews']
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B', 5120: 'b', 5122: 'h'}

    def read(ai):
        a = acc[ai]
        bv = views[a['bufferView']]
        n = ncomp[a['type']]
        cs = struct.calcsize(fmt[a['componentType']])
        stride = bv.get('byteStride', n * cs)
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<%d%s' % (n, fmt[a['componentType']]), blob, off + i * stride) for i in range(a['count'])]

    new = {}       # accessor index -> (bytes, componentType, normalized, count)
    # animations: keep every anim_step-th key (and the last). Several samplers may share an input: the same keys go for all of them.
    keeps = {}
    for anim in doc.get('animations', []):
        anim_step_ = (steps or {}).get(anim.get('name'), anim_step)
        for sm in anim['samplers']:
            ti, vi = sm['input'], sm['output']
            if acc[ti].get('sparse') or acc[ti]['count'] < 5 or acc[vi].get('sparse'):
                continue
            if ti not in keeps:
                times = read(ti)
                keep = list(range(0, len(times), anim_step_))
                if keep[-1] != len(times) - 1:
                    keep.append(len(times) - 1)
                keeps[ti] = keep
                kt = [times[k][0] for k in keep]
                new[ti] = (struct.pack('<%df' % len(kt), *kt), 5126, False, len(kt), [min(kt)], [max(kt)])
            if vi not in new:
                vals = read(vi)
                flat = [c for k in keeps[ti] for c in vals[k]]
                new[vi] = (struct.pack('<%df' % len(flat), *flat), 5126, False, len(keeps[ti]), None, None)
    # skin weights as normalised bytes
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            wi = p['attributes'].get('WEIGHTS_0')
            if wi is not None and wi not in new and acc[wi]['componentType'] == 5126:
                rows = read(wi)
                out = bytearray()
                for r in rows:
                    q = [int(round(max(0.0, x) * 255)) for x in r]
                    d = 255 - sum(q)
                    if d:
                        q[q.index(max(q))] += d
                    out += bytes(q)
                new[wi] = (bytes(out), 5121, True, len(rows), None, None)
    # rebuild the buffer: every bufferView in use, in order, with the changed accessors given views of their own
    used = set()
    for i, a in enumerate(acc):
        if i not in new and 'bufferView' in a:
            used.add(a['bufferView'])
        sp = a.get('sparse')
        if sp:
            used.add(sp['indices']['bufferView'])
            used.add(sp['values']['bufferView'])
    for im in doc.get('images', []):
        if 'bufferView' in im:
            used.add(im['bufferView'])
    out_blob = bytearray()
    new_views = []
    remap = {}

    def add(b, target=None):
        while len(out_blob) % 4:
            out_blob.append(0)
        v = {'buffer': 0, 'byteOffset': len(out_blob), 'byteLength': len(b)}
        if target:
            v['target'] = target
        out_blob.extend(b)
        new_views.append(v)
        return len(new_views) - 1
    for vi in sorted(used):
        v = views[vi]
        b = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        nv = {k: v[k] for k in ('byteStride', 'target') if k in v}
        while len(out_blob) % 4:
            out_blob.append(0)
        nv.update({'buffer': 0, 'byteOffset': len(out_blob), 'byteLength': len(b)})
        out_blob.extend(b)
        new_views.append(nv)
        remap[vi] = len(new_views) - 1
    for i, a in enumerate(acc):
        if i in new:
            b, ct, norm, cnt, mn, mx = new[i]
            a['bufferView'] = add(b)
            a['byteOffset'] = 0
            a['componentType'] = ct
            a['count'] = cnt
            if norm:
                a['normalized'] = True
            if mn is not None:
                a['min'], a['max'] = mn, mx
            else:
                a.pop('min', None)
                a.pop('max', None)
        else:
            if 'bufferView' in a:
                a['bufferView'] = remap[a['bufferView']]
            sp = a.get('sparse')
            if sp:
                sp['indices']['bufferView'] = remap[sp['indices']['bufferView']]
                sp['values']['bufferView'] = remap[sp['values']['bufferView']]
    for im in doc.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = remap[im['bufferView']]
    doc['bufferViews'] = new_views
    doc['buffers'] = [{'byteLength': len(out_blob)}]
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    while len(out_blob) % 4:
        out_blob.append(0)
    blob_chunk = struct.pack('<II', len(out_blob), 0x004E4942) + bytes(out_blob)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(blob_chunk)) + struct.pack('<II', len(js), 0x4E4F534A) + js + blob_chunk
    open(path, 'wb').write(out)
