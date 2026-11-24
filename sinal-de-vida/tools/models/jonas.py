"""Jonas, the pilot: a man of 44 made on the CC0 "Universal Base Characters" body (Quaternius), dressed in modelled clothes, with
the hand-painted texture (tools/models/paint.py: every piece from its own picture, in the concept art's colours), hair made of
modelled locks over a scalp with volume, the animations of the CC0 "Universal Animation Library" 1 and 2 (the same 65-bone
skeleton) and two clips of the CMU motion-capture data (retargeted by tools/models/retarget.py).

    "$BLENDER" --background --factory-startup --python tools/models/jonas.py -- \
        --out assets/models --assets /path/to/assets-externos --concept /path/to/conceito-jonas [--lod 1]

Writes <out>/jonas.glb (close) or jonas_lod.glb (far). Nothing from the downloaded packs is run: they are only read
(the body glTF, the two animation glb files, the concept PNGs). Licences: Quaternius CC0 (credit not required, given in
CREDITOS.md anyway).

Parts: body (skin + painted face), jacket, tee, pants, boots, props (belt, pouches, tools, the jacket's collar), hair (locks), strap
(the headband), lamp and lamp_glow (the head lamp, and its glass lit), mouth and mouthlow (cavity, teeth, tongue), eyes (two globes,
each on its own bone: eye_l, eye_r), lashes (with the eyes' small highlights) and lidshade (the lids' shadow on the globes). The
eyebrows are painted on the skin. Shape keys (morph targets) on the body: blink, eye_wide, brow_up, brow_down, brow_worry, smile,
frown, jaw_open, cheek, mouth_narrow, squint, look_down, look_up, lips_close, lips_funnel, upper_lip_up, lower_lip_down, lips_press,
mouth_left, mouth_right (see jonas_face.py); mouthlow carries jaw_open too, lashes and lidshade the lids' five. The lips' edge is
turned into the mouth and the mouth's inside is built by jonas_mouth.py.

The sleeves are rolled below the elbow: the turns are painted (with their relief in the jacket's normal map) and only the edge has
a body, a ring 4 mm thick in `props`, rigid on the forearm. lowerarm_twist_l and _r carry the
lower half of each forearm's skin, so that a hand that turns over does not wring the wrist. Two bones without skin, grip_l and grip_r, are the sockets of the palms (what he holds is put on them), and the clips of
jonas_radio.py bring his hands to the station radio's parts, to the notebook and to the pocket.
"""
import math
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

import common as C  # noqa: E402
from common import MB, smooth  # noqa: E402
import person_shared as PS  # noqa: E402
import person_face as F  # noqa: E402
import person_outfits as O  # noqa: E402
import paint as P  # noqa: E402
import jonas_face as JF  # noqa: E402
import retarget as RT  # noqa: E402
import jonas_radio as JR  # noqa: E402
import jonas_mouth as JM  # noqa: E402
import jonas_gait as JG  # noqa: E402

V = Vector
BASE = 'quaternius-base-characters/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'
UAL1 = 'quaternius-ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'
UAL2 = 'quaternius-ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb'
CMU = 'rancidmilk-cmu-selecao/Anims_Only_FBX_V1/FBX/'
# CMU clips: game name -> (file, first frame, last frame, loops)
CMU_CLIPS = {'mancar': ('77_19', 38, 76, True), 'esconder': ('69_70', 61, 111, False)}

# game name -> (library, action, reversed)
CLIPS = {
    'idle': (1, 'Idle_Loop'), 'walk': (1, 'Walk_Loop'), 'run': (1, 'Jog_Fwd_Loop'), 'sprint': (1, 'Sprint_Loop'),
    'crouch_idle': (1, 'Crouch_Idle_Loop'), 'crouch_walk': (1, 'Crouch_Fwd_Loop'),
    'usar': (1, 'Interact'), 'manipular': (1, 'Fixing_Kneeling'), 'radio': (1, 'Idle_TalkingPhone_Loop'),
    'mirar': (1, 'Idle_Torch_Loop'), 'arremessar': (1, 'OverhandThrow'), 'comer': (1, 'Consume'),
    'derrubado': (1, 'Hit_Knockback'), 'caido': (1, 'Death01'), 'levantar': (1, 'LayToIdle'),
    'corda_subir': (1, 'ClimbUp_1m'), 'sentar': (1, 'Sitting_Idle_Loop'), 'falar': (1, 'Idle_Talking_Loop'),
    'empurrar': (1, 'Push_Loop'), 'golpe': (1, 'Hit_Chest'),
    'esquivar': (1, 'Roll'),          # the dodge of scene 4: a dive and a roll over the shoulder that comes up in a crouch (the game cuts it there)
}


def log(*a):
    print('JONAS', *a, flush=True)


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def bone_seg(arm, name):
    b = arm.data.bones[name]
    return V(b.head_local), V(b.tail_local)


def group_names(ob):
    return {g.index: g.name for g in ob.vertex_groups}


def top_bone(v, gn):
    best, bw = None, 0.0
    for g in v.groups:
        if g.weight > bw:
            best, bw = gn.get(g.group), g.weight
    return best


# ---------------------------------------------------------------------------------------------------------------
def reshape(body, extras, arm):
    """From a superhero to an ordinary tired man: the muscle smoothed away, a little belly, a bigger head. The shoulders stay broad
    and the forearms and hands thick: the concept art draws a stocky man with big hands."""
    gn = group_names(body)
    seg = {n: bone_seg(arm, n) for n in ('upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r')}

    def closest(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return a + ab * t

    hc = V((0, 0.017, 1.6))
    for ob in (body,) + tuple(extras):
        gnames = group_names(ob)
        for v in ob.data.vertices:
            p = V(v.co)
            tb = top_bone(v, gnames) or ''
            # the shoulders and the chest
            p.x *= 1 + 0.085 * smooth(0.95, 1.12, p.z) * (1 - 0.35 * smooth(1.4, 1.5, p.z))        # a broad, thick trunk
            # the arms: pulled toward their axis
            if tb.startswith(('upperarm', 'lowerarm', 'hand')) and ob is body:
                side = tb[-1]
                key = 'upperarm_' + side if tb.startswith('upper') else 'lowerarm_' + side if tb.startswith('lower') else 'hand_' + side
                a, b = seg[key]
                q = closest(p, a, b)
                k = 0.95 if not tb.startswith('hand') else 1.05
                p = q + (p - q) * k
            # a little belly, in front (the front is -Y)
            if ob is body:
                bel = math.exp(-((p.z - 1.08) / 0.11) ** 2) * smooth(0.02, -0.08, p.y) * (1 - smooth(0.12, 0.2, abs(p.x)))
                p.y -= 0.024 * bel
                p.x *= 1 + 0.03 * math.exp(-((p.z - 1.05) / 0.12) ** 2)
            # the head (it is made bigger and wider still at the very end, by head_scale, once everything on it is built)
            if tb in ('Head',) or ob is not body:
                p = hc + (p - hc) * 1.07
            v.co = p
    # sculpt: the heroic muscle is smoothed off the chest, the arms and the legs (the body is a closed mesh: smoothing is safe),
    # then the pecs are pulled back
    bm = bmesh.new()
    bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.active
    sel = []
    for v in bm.verts:
        best, bw = None, 0.0
        for g, w in v[dl].items():
            if w > bw:
                best, bw = gn.get(g), w
        if best and not best.startswith(('Head', 'neck', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb', 'foot', 'ball', 'thigh', 'calf', 'pelvis')):
            sel.append(v)
    # the importer splits the vertices along the UV seams: weld them first (not on the head: the mouth's seam is doubled on purpose),
    # or the smoothing pulls the two sides of a seam apart and a crack opens along it (at the belly, down the flanks)
    bmesh.ops.remove_doubles(bm, verts=sel, dist=1e-5)
    sel = [v for v in sel if v.is_valid]
    for _ in range(9):
        bmesh.ops.smooth_vert(bm, verts=sel, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:
        z = v.co.z
        if 1.2 < z < 1.5 and v.co.y < 0:
            v.co.y += 0.034 * smooth(1.2, 1.32, z) * (1 - smooth(1.42, 1.5, z)) * smooth(0.0, -0.07, v.co.y)      # a flat chest under the tee
    bm.to_mesh(body.data)
    bm.free()
    log('reshaped')


# ---------------------------------------------------------------------------------------------------------------
def weld_islands(bm, dist, pred=None):
    """The body's arms and legs are separate pieces whose open ends sit inside the trunk. Cut to a garment, the trunk's hole and the
    limb's end are two rings with a gap once the garment is pushed out: weld each vertex of a ring to the nearest vertex of the ring
    of another piece."""
    island = {}
    n = 0
    for v in bm.verts:
        if v in island or not v.link_faces:
            continue
        stack = [v]
        island[v] = n
        while stack:
            a = stack.pop()
            for e in a.link_edges:
                w = e.other_vert(a)
                if w not in island:
                    island[w] = n
                    stack.append(w)
        n += 1
    bverts = [v for v in bm.verts if v.link_faces and any(e.is_boundary for e in v.link_edges) and (pred is None or pred(v))]
    tmap = {}
    for v in bverts:
        best = None
        for w in bverts:
            if island[w] < island[v]:
                d = (v.co - w.co).length
                if d < dist and (best is None or d < best[0]):
                    best = (d, w)
        if best:
            tmap[v] = best[1]
    if tmap:
        bmesh.ops.weld_verts(bm, targetmap=tmap)
    return len(tmap)


def garment(body, name, keepv, push, pre=None, post=None, smooth_boundary=3, smooth_iter=0, smooth_after=0, relax=0):
    """A copy of the body kept where `keepv(position, bone)` holds for every vertex of a face (so the cut follows a clean line, not
    the ragged edge of the bone weights), the cut's edge straightened by smoothing along it, and pushed out along the normals by
    push(vertex, bone). `pre(bm)` cuts the mesh first (planes), `post(bm)` removes more faces after."""
    ob = body.copy()
    ob.data = body.data.copy()
    ob.name = name
    bpy.context.scene.collection.objects.link(ob)
    gn = group_names(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # the importer splits the vertices at the UV seams: weld them, or the cut edges, the smoothing and the push open cracks along them
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    if pre:
        pre(bm)
        bm.verts.index_update()
    dl = bm.verts.layers.deform.active
    vb = {}
    for v in bm.verts:
        best, bw = None, 0.0
        for g, w in v[dl].items():
            if w > bw:
                best, bw = gn.get(g), w
        vb[v.index] = best
    kill = [f for f in bm.faces if not all(keepv(V(v.co), vb[v.index]) for v in f.verts)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    if post:
        post(bm, vb)
    for _ in range(4):                     # thin spikes left by the cut (faces hanging by a corner) go
        spikes = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 2]
        if not spikes:
            break
        bmesh.ops.delete(bm, geom=spikes, context='FACES')
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    welded = weld_islands(bm, 0.06)
    if os.environ.get('JONAS_DEBUG'):
        log('WELD', name, welded)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    # the cut's edge: each boundary vertex moves toward the mean of its two neighbours along the boundary
    for _ in range(smooth_boundary):
        new = {}
        for v in bm.verts:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = (nb[0].co + nb[1].co) / 2
        for v, p in new.items():
            v.co = v.co.lerp(p, 0.5)
    for _ in range(smooth_iter):       # a rounder shape (the toes of the body merge into one boot)
        bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    base = {v: v.co.copy() for v in bm.verts}
    nrm = {v: v.normal.copy() for v in bm.verts}
    fn0 = {f: f.normal.copy() for f in bm.faces}
    amount = {v: push(v, vb.get(v.index)) for v in bm.verts}
    for it in range(8):
        for v in bm.verts:
            v.co = base[v] + nrm[v] * amount[v]
        bm.normal_update()
        flipped = [f for f in bm.faces if f.normal.dot(fn0[f]) < 0.25]
        if os.environ.get('JONAS_DEBUG'):
            log('PUSH', name, it, 'flipped faces', len(flipped))
        if not flipped:
            break
        for f in flipped:                   # a face the push turned inside out: its vertices are pushed less
            for v in f.verts:
                amount[v] *= 0.6
    for _ in range(smooth_after):          # the push follows each vertex's own normal, which leaves an open edge ragged: straighten it again
        new = {}
        for v in bm.verts:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = (nb[0].co + nb[1].co) / 2
        for v, p in new.items():
            q = v.co.lerp(p, 0.6)
            v.co = q + nrm[v] * (amount[v] - (q - base[v]).dot(nrm[v]))       # along the edge only: it keeps its distance from the body
    # the cloth itself is smooth: what the push left of the body's muscle and of its own facets is ironed out (not the open edges)
    inner_v = [v for v in bm.verts if not v.is_boundary]
    for _ in range(relax):
        bmesh.ops.smooth_vert(bm, verts=inner_v, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.materials.clear()
    return ob


def decimate(ob, ratio):
    """Fewer triangles for the far version: the same object, simplified, keeping its UVs and weights."""
    dec = ob.modifiers.new('d', 'DECIMATE')
    dec.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(dec)
    old = ob.data
    ob.data = me
    me.materials.clear()
    for m in old.materials:
        me.materials.append(m)
    for p in me.polygons:
        p.material_index = 0


def axis_for(arm, bone, target, ang):
    """The local axis (and its sign) about which turning the bone by `ang` moves its tip most toward `target` (a world vector)."""
    R = arm.data.bones[bone].matrix_local.to_3x3()
    d0 = R @ Vector((0, 1, 0))
    best, bs = None, -1e9
    for axis in ((1, 0, 0), (0, 0, 1)):
        for sgn in (1, -1):
            d = R @ Matrix.Rotation(sgn * ang, 3, Vector(axis)) @ Vector((0, 1, 0))
            s = (d - d0).dot(V(target))
            if s > bs:
                best, bs = (Vector(axis), sgn), s
    return best


def pose_clip(arm, name, spec, ad):
    """A two-frame clip (frame 0 the rest, frame 1 the pose) that the game adds on top of the other animations.
    spec: {bone: (target direction, angle)}."""
    act = bpy.data.actions.new(name)
    ad.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for fr in (0, 1):
        for bone, (tgt, ang) in spec.items():
            pb = arm.pose.bones[bone]
            if fr == 0:
                pb.rotation_quaternion = (1, 0, 0, 0)
            else:
                axis, sgn = axis_for(arm, bone, tgt, 0.4)
                pb.rotation_quaternion = Quaternion(axis, sgn * ang)
            pb.keyframe_insert('rotation_quaternion', frame=fr)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
    ad.action = None
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name


def segment_param(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))


# ---------------------------------------------------------------------------------------------------------------
HEAD_PIVOT = V((0.0, 0.017, 1.565))
HEAD_K = (1.03, 0.97, 0.90)          # the head for a lean adult about 7 heads tall in his close clothes (it was 1.17, 1.10, 1.02 when the
                                     # clothes were bulky): as wide for its height as the concept art draws it


def hair_volume(body):
    """The scalp swells above the hairline: the mass of the hair is part of the head itself (painted dark), so no skin shows
    between the locks that are set on it."""
    gn = group_names(body)
    c = V((0, 0.01, 1.70))
    for v in body.data.vertices:
        if v.co.z < 1.62 or top_bone(v, gn) != 'Head':
            continue
        p = V(v.co)
        hz = P.hairline_z(p)
        w = smooth(hz - 0.002, hz + 0.022, p.z)
        if w > 0:
            v.co = p + (p - c).normalized() * (0.013 + 0.012 * smooth(1.76, 1.83, p.z)) * w


def build_locks(body, lod):
    """The hair: short messy curls, each a small tapered piece set on the scalp that follows the flow from the crown and winds about
    its own axis (a turn, more or less, either way), so the mass reads as curls and not as spikes; the ones above the headband stand up
    and spill over it, the ones below (the temples, the nape) lie closer and point down, thin strands at each temple and behind the ear, grey only at their tips.
    Returns the mesh builder and a UV per vertex (a strip of the hair atlas per lock)."""
    me = body.data
    me.calc_loop_triangles()
    bvh = C.BVHTree.FromPolygons([tuple(v.co) for v in me.vertices], [tuple(t.vertices) for t in me.loop_triangles])
    rg = random.Random(44)
    mb = MB('hair')
    uvs = []
    centre = V((0, 0.01, 1.70))
    crown = V((0, 0.05, 1.86))
    K = 4 if lod else 5
    count_ = [0]

    def lock(loc, nrm, rnd, temple=False):
        bz = P.band_z(loc)
        above = loc.z > bz
        n = (loc - centre).normalized() if nrm.dot(loc - centre) < 0 else nrm.normalized()
        if above:
            # from the crown outward; just over the headband the hair is pushed up and out by it, instead of falling over it
            out_up = V((loc.x - centre.x, loc.y - centre.y, 0)).normalized() * 0.7 + V((0, 0, 1.0))
            kb = smooth(bz + 0.065, bz + 0.02, loc.z)
            flow = (loc - crown).normalized() * (1 - kb) + out_up.normalized() * kb
        else:
            flow = V((0.0, 0.5 * smooth(2.4, 1.2, P.azimuth(loc)), -1.0)) if not temple else V((0.0, 0.85, -0.8))
        t = flow - n * flow.dot(n)
        if t.length < 1e-4:
            t = V((0, -1, 0)) - n * (-n.y)
        t.normalize()
        t = (Quaternion(n, (rnd[0] - 0.5) * (1.5 if above else 0.7)) @ t).normalized()
        grey = temple or (not above and P.grey_zone(loc) > 0.4 and rnd[6] < 0.85)
        if above and rnd[8] < 0.3 and loc.z > 1.80:          # a short tuft that stands up, among the curls that lie
            L, W = 0.026 + 0.012 * rnd[1], 0.026 + 0.012 * rnd[2]
            lift, tip = 0.016 + 0.008 * rnd[3], 0.018 + 0.012 * rnd[4]
        elif above:
            L, W = 0.034 + 0.020 * rnd[1], 0.030 + 0.014 * rnd[2]
            lift, tip = 0.012 + 0.012 * rnd[3], 0.004 + 0.018 * rnd[4]
        elif grey:                                           # at the temples and behind the ears: thin strands that fall back, close to the head
            L, W = 0.030 + 0.014 * rnd[1], 0.010 + 0.005 * rnd[2]
            lift, tip = 0.004 + 0.003 * rnd[3], 0.001 + 0.003 * rnd[4]
        else:
            L, W = 0.024 + 0.012 * rnd[1], 0.018 + 0.008 * rnd[2]
            lift, tip = 0.003 + 0.003 * rnd[3], 0.0005 + 0.003 * rnd[4]
        W *= 1.5 if lod else 1.15
        s = t.cross(n).normalized()
        p0 = loc - n * 0.004
        p1 = loc + t * L * 0.5 + n * lift
        p2 = loc + t * L + n * tip + s * (rnd[5] - 0.5) * 0.03 * (1.0 if above else 0.4)
        turns = (0.45 + 0.75 * rnd[9]) * (1 if rnd[5] > 0.5 else -1) * 2 * math.pi
        rad = W * (0.42 if above else 0.26)
        strip = 5 + int(rnd[7] * 2.999) if grey else min(4, int(rnd[7] * 3.2 + 1.9 * smooth(1.77, 1.85, loc.z)))
        f0 = len(mb.f)

        def at(u):
            c = p0 * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + p2 * u * u
            T = ((p1 - p0) * (1 - u) + (p2 - p1) * u).normalized()
            S = T.cross(n).normalized()
            U = S.cross(T)
            if U.dot(n) < 0:
                U = -U
            ph = turns * u
            return c + (S * math.sin(ph) + U * (1 - math.cos(ph))) * rad * u, S, U
        rows = []
        for k in range(K):
            u = k / K
            c, S, U = at(u)
            w = W * (0.6 + 0.4 * math.sin(math.pi * min(1.0, u * 1.5))) * (1 - u ** 2.5)
            vv = 0.03 + 0.94 * u
            row = []
            for off, nn, uu in ((-S * w / 2, -S, 0.08), (U * w * 0.4, U, 0.5), (S * w / 2, S, 0.92)):
                row.append(mb.vert(c + off, nn))
                uvs.append(((strip + uu) / P.LOCK_STRIPS, vv))
            rows.append(row)
        tipv = mb.vert(at(1.0)[0], t)
        uvs.append(((strip + 0.5) / P.LOCK_STRIPS, 0.97))
        for a, b in zip(rows, rows[1:]):
            mb.face((a[0], b[0], b[1], a[1]), 'hair')
            mb.face((a[1], b[1], b[2], a[2]), 'hair')
            mb.face((a[2], b[2], b[0], a[0]), 'hair')
        a = rows[-1]
        mb.face((a[0], tipv, a[1]), 'hair')
        mb.face((a[1], tipv, a[2]), 'hair')
        mb.face((a[2], tipv, a[0]), 'hair')
        mb.orient(f0)
        count_[0] += 1

    for j in range(12):
        el = 0.08 + 0.17 * j
        count = int(4 + 25 * math.sin(el))
        for i in range(count):
            az = 2 * math.pi * (i + rg.random() * 0.8) / count + j * 0.37
            el2 = el + rg.uniform(-0.06, 0.06)
            rnd = [rg.random() for _ in range(10)]            # drawn for every candidate, so a lock keeps its shape whatever is skipped
            d = V((math.sin(el2) * math.sin(az), -math.sin(el2) * math.cos(az), math.cos(el2)))
            loc, nrm, _, _ = bvh.ray_cast(centre, d)
            if loc is None or (lod and i % 2):
                continue
            if loc.z < P.hairline_z(loc) + 0.006 or abs(loc.z - P.band_z(loc)) < 0.017:
                continue
            lock(loc, nrm, rnd)
    # the grey tufts at the temples: two rows of curls under the headband, from in front of the ear to behind it
    for sg in (1, -1):
        for r_, dz in enumerate((0.024, 0.044)):
            for q, az in enumerate((1.0, 1.2, 1.42, 1.66, 1.9, 2.12)):
                rnd = [rg.random() for _ in range(10)]
                if lod and (q + r_) % 2:
                    continue
                a2 = az + 0.1 * r_
                pt = V((sg * 0.3 * math.sin(a2), -0.3 * math.cos(a2), 0.0))
                pt.z = P.band_z(pt) - dz
                loc, nrm, _, _ = bvh.ray_cast(centre, (pt - centre).normalized())
                if loc is None or loc.z < P.hairline_z(loc) + 0.002:
                    continue
                lock(loc, nrm, rnd, temple=True)
    log('locks', count_[0], 'tris', mb.tris())
    return mb, uvs


def calm_weights(ob):
    """The base body lets the upper arm pull on the chest (a hero's chest moves with his arms). On a loose jacket that tears the open
    front into a saw edge when the arms hang: on the trunk the arm's share of each vertex goes to the spine, more toward the middle,
    and the weights are then smoothed over the neighbours."""
    names = {g.index: g.name for g in ob.vertex_groups}
    spine = {n: ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n) for n in ('spine_02', 'spine_03')}
    for v in ob.data.vertices:
        if v.co.z > 1.47 or abs(v.co.x) > 0.23:
            continue
        keep = smooth(0.14, 0.23, abs(v.co.x))
        moved = 0.0
        for g in v.groups:
            n = names.get(g.group, '')
            if n.startswith(('upperarm', 'lowerarm')):
                moved += g.weight * (1 - keep)
                g.weight *= keep
        if moved > 0:
            spine['spine_03' if v.co.z > 1.3 else 'spine_02'].add([v.index], moved, 'ADD')
    # smoothing: each vertex takes half of the mean of its neighbours' weights, twice (only on the trunk)
    me = ob.data
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    w = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]
    trunk = [v.index for v in me.vertices if v.co.z < 1.5 and abs(v.co.x) < 0.25]
    for _ in range(2):
        new = {}
        for i in trunk:
            acc = {}
            for j in nb[i]:
                for n, x in w[j].items():
                    acc[n] = acc.get(n, 0.0) + x / len(nb[i])
            mixd = {n: 0.5 * w[i].get(n, 0.0) + 0.5 * acc.get(n, 0.0) for n in set(w[i]) | set(acc)}
            tot = sum(mixd.values()) or 1.0
            new[i] = {n: x / tot for n, x in mixd.items() if x / tot > 0.01}
        for i, d in new.items():
            w[i] = d
    for i in trunk:
        for g in ob.vertex_groups:
            x = w[i].get(g.name)
            if x:
                g.add([i], x, 'REPLACE')
            else:
                try:
                    g.remove([i])
                except RuntimeError:
                    pass
        for n in w[i]:
            if not ob.vertex_groups.get(n):
                ob.vertex_groups.new(name=n).add([i], w[i][n], 'REPLACE')


def pack_uv(ob, margin=0.004):
    """The piece's UV islands, packed to fill its own atlas (the base body's layout leaves most of it empty once the piece is cut)."""
    bpy.context.view_layer.objects.active = ob
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.uv.select_all(action='SELECT')
    except RuntimeError:
        pass
    bpy.ops.uv.pack_islands(rotate=False, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def head_scale(body, rigid):
    """The head made bigger and wider (HEAD_K, about the top of the neck), with everything on it: the eyes, the hair, the lamp, the
    mouth's inside, and every shape key. The neck follows by a ramp."""
    def tr(p, w):
        return V((p.x + (p.x - HEAD_PIVOT.x) * (HEAD_K[0] - 1) * w, p.y + (p.y - HEAD_PIVOT.y) * (HEAD_K[1] - 1) * w, p.z + (p.z - HEAD_PIVOT.z) * (HEAD_K[2] - 1) * w))
    for ob in (body,) + tuple(rigid):
        me = ob.data
        ws = [smooth(1.50, 1.565, v.co.z) if ob is body else 1.0 for v in me.vertices]
        if me.shape_keys:
            for kb in me.shape_keys.key_blocks:
                for i, dd in enumerate(kb.data):
                    dd.co = tr(V(dd.co), ws[i])
        for i, v in enumerate(me.vertices):
            v.co = tr(V(v.co), ws[i])


def eye_bones(arm):
    """A bone at the centre of each globe (eye_l, eye_r, children of the head, looking forward): the game turns them to make him look."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for side, name in ((1, 'eye_l'), (-1, 'eye_r')):
        c = V((side * JF.EYE_C.x, JF.EYE_C.y, JF.EYE_C.z))
        c = V((c.x + (c.x - HEAD_PIVOT.x) * (HEAD_K[0] - 1), c.y + (c.y - HEAD_PIVOT.y) * (HEAD_K[1] - 1), c.z + (c.z - HEAD_PIVOT.z) * (HEAD_K[2] - 1)))
        b = eb.new(name)
        b.head, b.tail, b.roll = c, c + V((0, -0.03, 0)), 0.0
        b.parent = eb['Head']
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    for name in ('eye_l', 'eye_r'):
        m = arm.data.bones[name].matrix_local
        log('eye bone', name, 'x', tuple(round(x, 3) for x in m.col[0][:3]), 'y', tuple(round(x, 3) for x in m.col[1][:3]), 'z', tuple(round(x, 3) for x in m.col[2][:3]))


LEG_K, HIP_Z = 0.90, 0.971          # the concept's legs are shorter for his trunk than the base body's


def short_legs(arm, meshes):
    """Shorter legs: everything under the hip joint (bones and skin alike) is scaled down toward the ground, and everything above
    comes down by what the legs lost. The bones keep their directions, so every clip still plays; the hips' travel in the clips is
    scaled by the same factor where the clips are brought in (or the feet would sink when he crouches)."""
    f = lambda z: z * LEG_K if z <= HIP_Z else z - (1 - LEG_K) * HIP_Z
    for ob in meshes:
        me = ob.data
        if me.shape_keys:
            for kb in me.shape_keys.key_blocks:
                for dd in kb.data:
                    dd.co.z = f(dd.co.z)
        for v in me.vertices:
            v.co.z = f(v.co.z)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.data.objects:
        o.select_set(o is arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        eb.use_connect = False
    for eb in arm.data.edit_bones:
        roll = eb.roll
        eb.head.z, eb.tail.z = f(eb.head.z), f(eb.tail.z)
        eb.roll = roll
    bpy.ops.object.mode_set(mode='OBJECT')


def scale_hips(act):
    for fc in act.fcurves:
        if fc.data_path in ('pose.bones["pelvis"].location', 'pose.bones["root"].location'):
            for kp in fc.keyframe_points:
                kp.co.y *= LEG_K
                kp.handle_left.y *= LEG_K
                kp.handle_right.y *= LEG_K
            fc.update()


# the clips whose feet stand on the floor: each is set down so that its lowest foot is where the feet are at rest. (The library's
# crouch held the feet some 5 cm over the floor, and the walk 1.5 cm, once the legs were shortened: the feet floated and, held to the
# floor in the game, slid.) The lying and rolling ones are left as they are.
GROUNDED = ('idle', 'walk', 'run', 'sprint', 'crouch_idle', 'crouch_walk', 'usar', 'manipular', 'radio', 'mirar', 'arremessar', 'falar',
            'empurrar', 'golpe')


def ground_clip(arm, act, rest_low):
    """Moves the hips of a clip up or down (in the armature's vertical) so that its lowest foot touches the floor. Returns the shift."""
    ad = arm.animation_data
    nla, ad.use_nla = ad.use_nla, False        # (the clips already laid down would fill the bones this one does not key)
    ad.action = act
    if getattr(act, 'slots', None):            # (Blender 4.4 on: an action plays only through one of its slots)
        ad.action_slot = act.slots[0]
    sc, low = bpy.context.scene, 1e9
    for i in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
        sc.frame_set(i)
        low = min(low, *(arm.pose.bones[b].head.z for b in ('foot_l', 'foot_r', 'ball_l', 'ball_r')))
    ad.action = None
    ad.use_nla = nla
    dz = rest_low - low
    if abs(dz) < 0.002:
        return 0.0
    d = arm.data.bones['pelvis'].matrix_local.to_3x3().inverted() @ V((0, 0, dz))
    for fc in act.fcurves:
        if fc.data_path == 'pose.bones["pelvis"].location':
            for kp in fc.keyframe_points:
                kp.co.y += d[fc.array_index]
                kp.handle_left.y += d[fc.array_index]
                kp.handle_right.y += d[fc.array_index]
            fc.update()
    return dz


def patch_uvs(mb, explicit):
    """A UV per vertex of a mesh builder: the middle of the cell of its face's material (paint.PATCH), or the one given."""
    uv = [None] * len(mb.v)
    for f, m in zip(mb.f, mb.fm):
        for i in f:
            uv[i] = explicit.get(i) or P.PATCH[m]
    return [u or (0.5, 0.5) for u in uv]


def teeth_arch(mb, explicit, z_edge, z_gum, y0, seed=1):
    """An arch of eight teeth: a strip that follows the jaw's curve, two columns per tooth, so that the biting edge is notched between
    one tooth and the next and no two teeth are of the same length or stand quite in line (a man of 44, not a white bar). Its UVs
    run along the strip of teeth of the cells atlas, a tooth of the strip per tooth of the arch."""
    N = 16
    rg = random.Random(seed)
    jit = [(rg.uniform(-0.0006, 0.0006), rg.uniform(-0.0005, 0.0004)) for _ in range(N // 2 + 1)]
    sgn = 1 if z_gum > z_edge else -1
    cols = []
    for k in range(N + 1):
        x = -0.027 + 0.054 * k / N
        tooth = min(N // 2 - 1, k // 2)
        dy, dz = jit[tooth] if k % 2 else ((jit[tooth][0] + jit[max(0, tooth - 1)][0]) / 2, 0.0)
        y = y0 + 0.0125 * (x / 0.027) ** 2 + dy
        notch = 0.0005 if k % 2 == 0 else 0.0
        short = 0.0010 * smooth(0.016, 0.027, abs(x))                  # the teeth at the sides are shorter
        nn = V((x * 14, -1, 0)).normalized()
        e = mb.vert((x, y, z_edge + sgn * (notch + short) + dz), nn)
        g = mb.vert((x, y + 0.0012, z_gum), nn)
        u = (k / 2 + 1) / 10
        explicit[e], explicit[g] = (u, 0.765), (u, 0.985)
        cols.append((e, g))
    for (e0, g0), (e1, g1) in zip(cols, cols[1:]):
        mb.face((e0, e1, g1, g0) if z_gum > z_edge else (g0, g1, e1, e0), 'teeth')


def main():
    args = C.script_args()
    out = args['out']
    assets = args['assets']
    concept = args['concept']
    lod = args.get('lod') == '1'
    TEX = 512 if lod else 1024
    if os.environ.get('JONAS_QUICK'):
        TEX = int(os.environ['JONAS_QUICK'])
    C.reset_scene()
    objs = import_gltf(os.path.join(assets, BASE))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    body = bpy.data.objects['SuperHero_Male']
    JF.SCALE = HEAD_K                                                          # the eyes are measured as the scaled head will have them
    for gone in ('Icosphere', 'Eyebrows', 'Eyes'):                             # the eyebrows are painted on the skin and move with it;
        bpy.data.objects.remove(bpy.data.objects[gone], do_unlink=True)        # the eyes are our own (jonas_face.py)
    reshape(body, (), arm)
    seg = {n: bone_seg(arm, n) for n in ('lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'thigh_l', 'thigh_r', 'upperarm_l', 'upperarm_r', 'spine_03', 'Head')}
    nh = V(arm.data.bones['neck_01'].head_local)

    TORSO = ('spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01')
    ARMS_UP = ('upperarm_l', 'upperarm_r')
    ARMS_LO = ('lowerarm_l', 'lowerarm_r')
    THIGHS, CALVES, FEET = ('thigh_l', 'thigh_r'), ('calf_l', 'calf_r'), ('foot_l', 'foot_r', 'ball_l', 'ball_r', 'ball_leaf_l', 'ball_leaf_r')
    HEM, TEE_HEM, WAIST, CUFF, BOOT_TOP = 0.995, 0.945, 1.0, 0.27, 0.33
    RING = 0.004                              # how thick the ring at the end of a rolled sleeve is, over the cloth
    EPS = 2e-4

    def rho(p):
        return math.hypot(p.x, p.y - nh.y)

    def xopen(z):
        return 0.062 + 0.08 * (z - 1.0)                # half width of the jacket's open front, wider at the chest (as the concept wears it)

    def cut_z(bm, z):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z), plane_no=(0, 0, 1))

    # ---- where each garment lies: by position (so the cut edges are clean lines), not by the bone weights alone
    def jacket_keep(p, bone):
        if bone in ARMS_UP:
            return True
        if bone in ARMS_LO:
            a, b = seg[bone]
            return segment_param(p, a, b) <= 0.5          # the sleeves are rolled to mid forearm
        if bone in TORSO:
            return HEM - EPS < p.z < 1.57 and (rho(p) > 0.094 or p.z < 1.42)
        if bone == 'pelvis' or bone in THIGHS:
            return p.z > HEM - EPS                        # the hem ends at the belt, as in the concept
        return False

    def tee_keep(p, bone):
        if bone in TORSO or bone == 'pelvis' or bone in THIGHS:
            return TEE_HEM - EPS < p.z < 1.56 and (rho(p) > 0.070 or p.z < 1.42) and abs(p.x) < 0.3      # a crew neck, close to the neck
        return abs(p.x) < 0.1 and p.y < 0 and 1.0 < p.z < 1.12          # (the belly's vertices follow a bone of their own)

    def pants_keep(p, bone):
        return ((bone == 'pelvis' or bone in TORSO) and p.z < WAIST + EPS and p.z > 0.8) or (bone in THIGHS and p.z < WAIST + EPS) or (bone in CALVES + FEET and p.z > CUFF - EPS)

    def boots_keep(p, bone):
        return bone in CALVES + FEET and p.z <= BOOT_TOP + EPS

    def jacket_push(v, bone):
        t = 0.019 + 0.011 * smooth(1.28, 1.02, v.co.z)   # a field jacket close to the body: a finger of room at the chest, a little more at the waist
        if bone in ARMS_UP + ARMS_LO:
            t += 0.004                                   # the sleeves, a little looser than the trunk
        elif v.co.y < 0:
            t += 0.010 * smooth(0.17, 0.09, abs(v.co.x)) * smooth(1.5, 1.4, v.co.z)      # the open front stands a little off the chest
        if bone in ARMS_LO:
            a, b = seg[bone]
            u = segment_param(v.co, a, b)
            t -= 0.007 * smooth(-0.05, 0.36, u)                 # the forearm of the sleeve narrows to the arm: at its end it is only a little wider
            t += 0.003 * smooth(0.33, 0.355, u)                 # the rolled part: a shade thicker (its turns are painted, see paint.py)
        return t

    def jacket_pre(bm):
        # clean cuts down the open front, along two slanted planes (wider at the chest), and along the hem
        for sgn in (-1, 1):
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(sgn * 0.062, 0, 1.0), plane_no=(1, 0, -sgn * 0.08))
        cut_z(bm, HEM)

    def jacket_post(bm, vb):
        bm.normal_update()
        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            if c.z > 0.97 and f.normal.y < -0.35 and c.y < 0.0 and all(abs(v.co.x) <= xopen(v.co.z) + 2e-4 for v in f.verts):
                kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context='FACES')

    def pants_push(v, bone):
        z = v.co.z
        return 0.011 + 0.013 * smooth(0.80, 0.50, z)     # work trousers: close at the thigh, straight below the knee, over the boot

    def pants_pre(bm):
        cut_z(bm, WAIST)
        cut_z(bm, CUFF)

    def boots_push(v, b):
        z, y = v.co.z, v.co.y
        t = 0.014 + 0.011 * smooth(0.05, 0.03, z)                      # the sole stands out from the upper: a welt all round
        return t + 0.010 * smooth(-0.04, -0.09, y) * smooth(0.0, 0.05, z) * smooth(0.14, 0.09, z)      # a blunt, high toe cap

    jacket = garment(body, 'jacket', jacket_keep, jacket_push, pre=jacket_pre, post=jacket_post, smooth_iter=3, smooth_after=4, relax=3)
    tee = garment(body, 'tee', tee_keep, lambda v, b: 0.007, pre=lambda bm: cut_z(bm, TEE_HEM), relax=2)
    pants = garment(body, 'pants', pants_keep, pants_push, pre=pants_pre, smooth_iter=1, relax=3)
    boots = garment(body, 'boots', boots_keep, boots_push, pre=lambda bm: cut_z(bm, BOOT_TOP), smooth_iter=6)
    if not lod:                               # the pieces with more triangles than their shape needs (the far model is reduced further on)
        for ob, ratio in ((boots, 0.42), (pants, 0.5), (tee, 0.3), (jacket, 0.62)):
            decimate(ob, ratio)
    # the body under the clothes is never seen: a face goes if one garment covers it whole. The head, the neck, the hands and the
    # forearms below the sleeve stay.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.active
    gnb = group_names(body)
    log('body faces before', len(bm.faces))
    kill = []
    for f in bm.faces:
        vs = []
        for v in f.verts:
            best, bw = None, 0.0
            for g, w in v[dl].items():
                if w > bw:
                    best, bw = gnb.get(g), w
            vs.append((V(v.co), best))
        c = f.calc_center_median()
        if 1.36 < c.z < 1.62 and all(b in TORSO or b == 'Head' for p, b in vs) and all(rho(p) < 0.12 for p, b in vs):
            continue                      # the base of the neck stays, so that no hole opens inside the collars
        if any(all(fn(p, b) for p, b in vs) for fn in (jacket_keep, tee_keep, pants_keep, boots_keep)) or (c.z < 1.5 and all(b in TORSO + THIGHS + CALVES + FEET + ('pelvis',) for p, b in vs)):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    # the mouth: the base mesh has a pocket behind the lips whose back wall stretches into a pink sheet when the jaw drops. The
    # pocket goes (every face that touches its back edge); the lips keep their inner faces, and the mouth's own inside is built below.
    back = [v for v in bm.verts if v.co.y > -0.0765 and abs(v.co.x) < 0.03 and abs(v.co.z - 1.6256) < 0.0012]
    pocket = {f for v in back for f in v.link_faces}
    log('mouth pocket faces removed', len(pocket))
    bmesh.ops.delete(bm, geom=list(pocket), context='FACES')
    bm.normal_update()
    # what is left of it behind the lips (faces that look backwards, some of them tied to both lips) would stretch the same way
    inner = [f for f in bm.faces if f.normal.y > -0.1 and all(abs(v.co.x) < 0.04 and abs(v.co.z - JF.MZ) < 0.009 and -0.1 < v.co.y < -0.074 for v in f.verts)]
    bmesh.ops.delete(bm, geom=inner, context='FACES')
    log('inner lip faces removed', len(inner))
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    # the neck is a tube of its own set in the trunk's hole: weld the two rims, or a gap opens at the neck when the head bends; then
    # the small holes the weld leaves (they showed the night through the chest) are filled
    log('neck weld', weld_islands(bm, 0.07, lambda v: abs(v.co.x) < 0.13 and (1.38 < v.co.z < 1.62 or (v.co.z < 1.72 and v.co.y > 0.02))))
    uvl = bm.loops.layers.uv.active
    edges = [e for e in bm.edges if e.is_boundary and all(1.42 < v.co.z < 1.70 and abs(v.co.x) < 0.2 and (v.co.y > 0.02 or v.co.z < 1.6) for v in e.verts)]
    filled = bmesh.ops.holes_fill(bm, edges=edges, sides=40)['faces']
    fs = set(filled)
    for f in filled:
        for l in f.loops:
            l[uvl].uv = (0.001, 0.001)        # no texels of its own: the atlas's background there is the neck's colour
    log('neck holes filled', len(filled))
    bm.normal_update()
    for f in filled:                      # a patch must look outward, like the neck round it
        c = f.calc_center_median()
        if f.normal.dot(V((c.x, c.y - nh.y, 0))) < 0:
            f.normal_flip()
    JM.lip_roll(bm, log)                      # the lips' edge turned into the mouth: the red of the lips, then the wet inside
    bm.to_mesh(body.data)
    bm.free()
    sockets = JF.fit_lids(body)               # the eye sockets remade round the globes: real lids, the opening the concept draws
    hair_volume(body)
    for ob in (body, jacket, tee, pants, boots):
        while len(ob.data.uv_layers) > 1:
            ob.data.uv_layers.remove(ob.data.uv_layers[-1])
    for ob in (jacket, tee):
        calm_weights(ob)
    # the rolled end of each sleeve is stiff: its last centimetres go with the forearm alone, so that the roll keeps its shape when
    # the elbow bends (and the ring at its edge, which is the forearm's, stays on it)
    # for the game's outline: the jacket's shell is left out round the neck and along the open front's edge (the collar lies on it
    # there, and a shell under the collar shows through as dark patches)
    ja = jacket.data.attributes.new('_outline', 'FLOAT', 'POINT')
    bmj = bmesh.new()
    bmj.from_mesh(jacket.data)
    edge_v = [V(v.co) for v in bmj.verts if v.is_boundary and abs(v.co.x) < 0.2 and v.co.z > 1.0]
    bmj.free()
    for i, v in enumerate(jacket.data.vertices):
        p_ = V(v.co)
        w_ = 1.0 - smooth(1.34, 1.40, p_.z) * smooth(0.19, 0.13, rho(p_))
        if abs(p_.x) < 0.22 and p_.y < 0.02 and edge_v:
            w_ *= smooth(0.008, 0.03, min((p_ - q_).length for q_ in edge_v))
        ja.data[i].value = w_
    xe_ = max(abs(v.co.x) for v in jacket.data.vertices)
    # ... and it is a clean tube: its last centimetres are brought to one radius round the forearm's axis and its edge to one plane
    # (the push along the normals leaves the end of a narrow sleeve ragged)
    for sg_ in (1, -1):
        a_, b_ = seg['lowerarm_l' if sg_ > 0 else 'lowerarm_r']
        axis_at = lambda x: a_ + (b_ - a_) * ((abs(x) - abs(a_.x)) / abs(b_.x - a_.x))
        end = [v for v in jacket.data.vertices if v.co.x * sg_ > xe_ - 0.06]
        rads = sorted(math.hypot(v.co.y - axis_at(v.co.x).y, v.co.z - axis_at(v.co.x).z) for v in end)
        r_end = rads[len(rads) // 2]
        for v in end:
            c_ = axis_at(v.co.x)
            d_ = V((0, v.co.y - c_.y, v.co.z - c_.z))
            k = smooth(xe_ - 0.06, xe_ - 0.04, abs(v.co.x))
            if d_.length > 1e-6:
                q_ = c_ + d_.normalized() * (d_.length + (r_end - d_.length) * k)
                v.co.y, v.co.z = q_.y, q_.z
            if abs(v.co.x) > xe_ - 0.007:
                v.co.x = sg_ * xe_
    for v in jacket.data.vertices:
        k = smooth(xe_ - 0.075, xe_ - 0.04, abs(v.co.x))
        if k <= 0:
            continue
        for g in v.groups:
            g.weight *= 1 - k
        name = 'lowerarm_l' if v.co.x > 0 else 'lowerarm_r'
        (jacket.vertex_groups.get(name) or jacket.vertex_groups.new(name=name)).add([v.index], k, 'ADD')
    for ob in (body, jacket, tee, pants, boots):
        pack_uv(ob)
    log('garments', [len(o.data.polygons) for o in (jacket, tee, pants, boots)], 'body', len(body.data.polygons))
    tags = {}
    if os.environ.get('JONAS_STOP'):
        return

    # ---- props: the belt, its pouches with the tools in them, and the jacket's collar
    props = MB('props')
    zb = 0.972
    ring = [V(v.co) for o in (tee, pants) for v in o.data.vertices if abs(v.co.z - zb) < 0.022]
    rx = max(abs(p.x) for p in ring) + 0.012
    ymin = min(p.y for p in ring) - 0.012
    ymax = max(p.y for p in ring) + 0.012
    cy, ry = (ymin + ymax) / 2, (ymax - ymin) / 2
    props.loft([{'c': (0, cy, z), 'd': (0, 0, 1), 'rx': rx, 'ry': ry} for z in (zb - 0.031, zb + 0.031)], 24, cap0=None, cap1=None, mat='belt')
    by = ymin - 0.006
    for dx, dz, w, h in ((-0.034, 0, 0.011, 0.07), (0.034, 0, 0.011, 0.07), (0, 0.030, 0.079, 0.011), (0, -0.030, 0.079, 0.011)):
        props.box((dx, by, zb + dz), (w, 0.014, h), mat='metal')
    props.box((0, by - 0.002, zb), (0.007, 0.012, 0.052), mat='metal')
    frames = []
    UP = V((0, 0, 1))

    def tool(base, R, kind, tilt):
        """A tool standing in a pouch, the part that shows above the leather: the open jaw of a spanner, the jaws and pivot of a pair
        of pliers, the bulbous handle of a screwdriver, the head and claw of a hammer."""
        Rt = R @ Matrix.Rotation(tilt, 3, 'Y')
        at = lambda dz, dx=0.0, dy=0.0: base + Rt @ V((dx, dy, dz))
        ax = Rt @ V((0, 0, 1))
        side = Rt @ V((1, 0, 0))

        def rod(z0, z1, r0, r1, mat, n=6, cap=0.0):
            props.loft([{'c': at(z0), 'd': ax, 'u': side, 'rx': r0, 'ry': r0}, {'c': at(z1), 'd': ax, 'u': side, 'rx': r1, 'ry': r1}], n, cap0=None, cap1=cap, mat=mat)
        if kind == 'wrench':                    # a flat shaft, and a head with two prongs round the opening
            props.box(at(0.035), (0.016, 0.006, 0.11), mat='metal', rot=Rt)
            props.box(at(0.096), (0.038, 0.008, 0.016), mat='metal', rot=Rt)
            for sg in (-1, 1):
                props.box(at(0.115, sg * 0.0135), (0.011, 0.008, 0.026), mat='metal', rot=Rt @ Matrix.Rotation(-sg * 0.22, 3, 'Y'))
        elif kind == 'pliers':                  # the handles come out of the pouch, cross at the pivot and end in two tapered jaws
            for sg in (-1, 1):
                props.box(at(0.03, sg * 0.011), (0.010, 0.009, 0.075), mat='h_red', rot=Rt @ Matrix.Rotation(sg * 0.16, 3, 'Y'))
                props.box(at(0.098, sg * 0.0045), (0.008, 0.007, 0.05), mat='metal', rot=Rt @ Matrix.Rotation(-sg * 0.07, 3, 'Y'))
            props.loft([{'c': at(0.07, 0, -0.006), 'd': Rt @ V((0, 1, 0)), 'u': side, 'rx': 0.011, 'ry': 0.011},
                        {'c': at(0.07, 0, 0.006), 'd': Rt @ V((0, 1, 0)), 'u': side, 'rx': 0.011, 'ry': 0.011}], 8, cap0=0.0, cap1=0.0, mat='metal')
        elif kind == 'hammer':                  # a wooden handle, the head across it: a face on one side, the claw on the other
            rod(-0.02, 0.105, 0.011, 0.0095, 'h_wood')
            props.box(at(0.118, 0.006), (0.052, 0.024, 0.026), mat='metal', rot=Rt)
            props.box(at(0.118, 0.04), (0.012, 0.03, 0.03), mat='metal', rot=Rt)
            props.box(at(0.126, -0.036), (0.034, 0.02, 0.008), mat='metal', rot=Rt @ Matrix.Rotation(0.45, 3, 'Y'))
        else:                                   # a screwdriver, handle up: a waist, a bulb, a rounded end, and the ferrule under it
            rod(0.0, 0.02, 0.006, 0.006, 'metal')
            rod(0.02, 0.045, 0.011, 0.0085, kind, 6)
            rod(0.045, 0.085, 0.0085, 0.0125, kind, 6)
            rod(0.085, 0.096, 0.0125, 0.0115, kind, 6, cap=0.008)

    def pouch(x, W, H, D, back=False, tools=()):
        """A leather pouch hung on the belt at x: a box that follows the belt's curve, a smaller pocket sewn on its front, the loop
        that holds it over the belt, and tools standing in it."""
        sq = math.sqrt(max(0.0, 1 - (x / rx) ** 2))
        y = cy + (ry * sq if back else -ry * sq)
        nrm = V((x / rx ** 2, (y - cy) / ry ** 2, 0)).normalized()
        r = V((-nrm.y, nrm.x, 0))
        R = Matrix((r, nrm, UP)).transposed()
        i = len(frames)
        p0 = V((x, y, zb))
        c = p0 + nrm * (D / 2 + 0.004) + UP * (-0.006 - H / 2)
        props.box(c, (W, D, H), mat=f'pouch:{i}', rot=R)
        pc = c + nrm * (D / 2 + 0.008) - UP * (H * 0.20)
        props.box(pc, (W * 0.72, 0.018, H * 0.52), mat=f'pocket:{i}', rot=R)
        lc = p0 + nrm * 0.008 + UP * 0.002
        props.box(lc, (0.036, 0.014, 0.082), mat=f'loop:{i}', rot=R)
        frames.append({'pouch': {'c': c, 'r': r, 'n': nrm, 'w': W, 'h': H}, 'pocket': {'c': pc, 'r': r, 'n': nrm, 'w': W * 0.72, 'h': H * 0.52},
                       'loop': {'c': lc, 'r': r, 'n': nrm, 'w': 0.036, 'h': 0.082}})
        for du, dn, kind, tilt in tools:
            tool(c + r * du + nrm * dn + UP * (H / 2 - 0.012), R, kind, tilt)

    pouch(-0.15, 0.165, 0.19, 0.055, tools=((-0.045, 0.0, 'wrench', 0.16), (-0.008, -0.006, 'h_green', -0.05), (0.03, 0.004, 'h_yellow', -0.2), (0.052, -0.01, 'hammer', 0.06)))
    pouch(0.15, 0.165, 0.19, 0.055, tools=((0.045, 0.0, 'wrench', -0.14), (0.01, -0.006, 'h_red', 0.08), (-0.028, 0.004, 'pliers', 0.12), (-0.052, -0.012, 'h_green', 0.2)))
    pouch(0.115, 0.11, 0.12, 0.04, back=True, tools=((0.0, 0.0, 'hammer', 0.1),))
    n_belt = len(props.v)

    # the collar: a leaf folded out round the neck of the jacket, from one edge of the open front, behind the neck, to the other
    surf = []
    for ob in (jacket, tee, body):
        m = ob.data
        m.calc_loop_triangles()
        surf.append(C.BVHTree.FromPolygons([tuple(v.co) for v in m.vertices], [tuple(t.vertices) for t in m.loop_triangles]))

    def ground(x, y):
        zs = [h[0].z for h in (b.ray_cast(V((x, y, 1.60)), V((0, 0, -1))) for b in surf) if h[0] is not None and h[0].z > 1.38]
        return max(zs) if zs else 1.5
    NC, th_e = 20, 1.0
    rows = []
    for k in range(NC + 1):
        t = k / NC
        th = th_e + t * (2 * math.pi - 2 * th_e)
        dirv = V((math.sin(th), -math.cos(th), 0))
        endw = 1.0 - smooth(0.0, 0.16, min(t, 1 - t))              # 1 at the two front ends
        backw = math.exp(-((t - 0.5) / 0.22) ** 2)
        rf = 0.094 - 0.004 * backw
        wdt = 0.040 + 0.05 * endw ** 2
        ax = V((0, nh.y, 0))
        fpt = ax + dirv * rf
        opt = ax + dirv * (rf + wdt) + V((0, -0.02 * endw, 0))      # the points come forward and down onto the chest
        ipt = ax + dirv * (rf - 0.012)
        zf = ground(fpt.x, fpt.y) + 0.016 + 0.012 * backw
        zo = ground(opt.x, opt.y) + 0.007 - 0.012 * endw
        zi = ground(ipt.x, ipt.y) - 0.004
        rows.append((props.vert(V((ipt.x, ipt.y, zi)), -dirv), props.vert(V((fpt.x, fpt.y, zf)), UP), props.vert(V((opt.x, opt.y, zo)), dirv),
                     props.vert(V((opt.x, opt.y, zo - 0.004)), -UP), props.vert(V((fpt.x, fpt.y, zf - 0.006)), -UP)))
    f0 = len(props.f)
    for a, b in zip(rows, rows[1:]):
        props.face((a[1], a[0], b[0], b[1]), 'collar')       # the stand, seen from the front behind the neck
        props.face((a[2], a[1], b[1], b[2]), 'collar')       # the leaf, from above
        props.face((a[3], a[2], b[2], b[3]), 'collar_edge')  # its edge: an inked line
        props.face((a[4], a[3], b[3], b[4]), 'collar')       # and from below
    # winding: the leaf's upper face must look up
    pa, pb_, pc_ = (V(props.v[i]) for i in props.f[f0 + 1][:3])
    if (pb_ - pa).cross(pc_ - pa).z < 0:
        for k in range(f0, len(props.f)):
            props.f[k] = tuple(reversed(props.f[k]))

    # the chest pockets: where the jacket's picture paints them, the surface is raised (the pocket, its flap over it, the button on
    # the flap), and painted by the same lookup as the jacket under it, so paint and relief agree
    trunk_w = max(abs(v.co.x) for v in jacket.data.vertices if 1.08 < v.co.z < 1.28)
    jbvh = surf[0]

    def on_jacket(col, row, left, d):
        x, z = P.jacket_xz(col, row, left, trunk_w, xopen)
        loc, nrm, _, _ = jbvh.ray_cast(V((x, -1.0, z)), V((0, 1, 0)))
        if loc is None:
            return None
        return loc + nrm * d, nrm

    def patch(c0, c1, r0, r1, left, d, nx=4, nz=3, open_bottom=False):
        grid = []
        for jz in range(nz + 1):
            line = []
            for ix in range(nx + 1):
                edge = ix in (0, nx) or jz == 0 or (jz == nz and not open_bottom)
                hit = on_jacket(c0 + (c1 - c0) * ix / nx, r0 + (r1 - r0) * jz / nz, left, d * (0.12 if edge else 1.0))
                line.append(props.vert(hit[0], hit[1]) if hit else None)
            grid.append(line)
        for jz in range(nz):
            for ix in range(nx):
                q = (grid[jz][ix], grid[jz + 1][ix], grid[jz + 1][ix + 1], grid[jz][ix + 1])
                if None in q:
                    continue
                pa, pb2, pc2 = (V(props.v[i]) for i in q[:3])
                props.face(q if (pb2 - pa).cross(pc2 - pa).y < 0 else tuple(reversed(q)), 'olive')
    for left, (c0, c1, bc) in ((True, (331, 434, 382)), (False, (599, 696, 652))):
        patch(c0, c1, 424, 553, left, 0.006)
        patch(c0 - 2, c1 + 2, 418, 474, left, 0.013, nz=2, open_bottom=True)
        hit = on_jacket(bc, 461, left, 0.014)
        if hit:
            props.sphere(hit[0], (0.0085, 0.004, 0.0085), 8, 4, mat='button')
    n_chest = len(props.v)

    # the open ends of the sleeves and of the trousers' legs: a dark disc inside each, so that nobody looks through the piece at
    # the night behind it. Each is of its own bone (the forearm, the shin).
    caps = []
    for side, sg in (('l', 1), ('r', -1)):
        a, b = seg['lowerarm_' + side]
        xs = [abs(v.co.x) for v in jacket.data.vertices if v.co.x * sg > 0]
        rim = [V(v.co) for v in jacket.data.vertices if v.co.x * sg > 0 and abs(v.co.x) > max(xs) - 0.012]
        c = a + (b - a) * ((max(xs) - 0.012 - abs(a.x)) / abs(b.x - a.x))
        rad = sorted(math.hypot(q.y - c.y, q.z - c.z) for q in rim)[len(rim) // 3] * 0.84
        start = len(props.v)
        props.loft([{'c': c, 'd': (sg, 0, 0), 'rx': rad, 'ry': rad}, {'c': c + V((sg * 0.001, 0, 0)), 'd': (sg, 0, 0), 'rx': rad, 'ry': rad}], 10, cap0=None, cap1=0.0, mat='inside')
        caps.append((None, start, len(props.v)))             # it moves as the sleeve's end does (the weights of the jacket's nearest vertex)
        # the sleeve is rolled up below the elbow. Its turns are paint, with their relief in the normal map (paint.py, the cuff); here
        # only its edge gets a body: one thin ring, RING thick over the cloth, so that the end of the sleeve is not a sheet of paper
        # seen from the side. Rigid on the forearm.
        xe = max(xs)
        cx = V((sg * xe, c.y, c.z))
        NS = 14                                              # the ring takes the sleeve's own outline: its radius round the arm, sector by sector
        sect = [0.0] * NS
        for q in rim:
            th = math.atan2((q.z - c.z) * sg, q.y - c.y) % (2 * math.pi)
            k = int(th / (2 * math.pi) * NS + 0.5) % NS
            sect[k] = max(sect[k], math.hypot(q.y - c.y, q.z - c.z))
        mean = sum(r_ for r_ in sect if r_ > 0) / max(1, sum(1 for r_ in sect if r_ > 0))
        sect = [r_ if r_ > 0 else mean for r_ in sect]
        sect = [(sect[k - 1] + 2 * sect[k] + sect[(k + 1) % NS]) / 4 for k in range(NS)]
        sect = [(sect[k - 1] + 2 * sect[k] + sect[(k + 1) % NS]) / 4 for k in range(NS)]

        def outline(dr):
            return lambda th: (sect[int((th % (2 * math.pi)) / (2 * math.pi) * NS + 0.5) % NS] + dr) / mean
        start = len(props.v)
        prof = [(-0.0075, -0.0005), (-0.005, RING), (0.0005, RING), (0.0025, RING * 0.4), (0.003, -0.002)]
        props.loft([{'c': cx + V((sg * dx, 0, 0)), 'd': (sg, 0, 0), 'rx': mean, 'ry': mean, 'k': outline(dr)} for dx, dr in prof], NS, cap0=None, cap1=None, mat='lining')
        caps.append(('lowerarm_' + side, start, len(props.v)))
        a, b = seg['calf_' + side]
        zs = [v.co.z for v in pants.data.vertices if v.co.x * sg > 0]
        zc = min(zs) + 0.022
        rim = [V(v.co) for v in pants.data.vertices if v.co.x * sg > 0 and v.co.z < min(zs) + 0.012]
        c = a + (b - a) * ((zc - a.z) / (b.z - a.z))
        rad = sorted(math.hypot(q.x - c.x, q.y - c.y) for q in rim)[len(rim) // 3] * 0.9
        start = len(props.v)
        props.loft([{'c': c, 'd': (0, 0, -1), 'rx': rad, 'ry': rad}, {'c': c - V((0, 0, 0.001)), 'd': (0, 0, -1), 'rx': rad, 'ry': rad}], 10, cap0=None, cap1=0.0, mat='inside')
        caps.append(('calf_' + side, start, len(props.v)))

    # the headband follows the head (with the hair's volume), tilted down toward the ears; the lamp sits on it, small and flat
    hb = MB('strap')
    hb.default_mat = 'strap'
    cx0, cy0 = 0.0, -0.005
    NB = 36
    env = [0.0] * NB
    for v in body.data.vertices:
        p = v.co
        if p.z > 1.68 and abs(p.z - P.band_z(p)) < 0.014:
            th = math.atan2(p.y - cy0, p.x - cx0) % (2 * math.pi)
            k = int(th / (2 * math.pi) * NB) % NB
            env[k] = max(env[k], math.hypot(p.x - cx0, p.y - cy0))
    default_r = [0.1 + 0.025 * abs(math.sin(2 * math.pi * k / NB)) for k in range(NB)]
    env = [e if e > 0.05 else default_r[k] for k, e in enumerate(env)]
    env = [max(env[(k - 1) % NB], env[k], env[(k + 1) % NB]) for k in range(NB)]
    for _ in range(3):
        env = [(env[(k - 1) % NB] + 2 * env[k] + env[(k + 1) % NB]) / 4 for k in range(NB)]
    rows = []
    for k in range(NB):
        th = 2 * math.pi * k / NB
        r0 = env[k] + 0.002
        px, py = cx0 + r0 * math.cos(th), cy0 + r0 * math.sin(th)
        zc = P.band_z(V((px, py, 0)))
        n = V((math.cos(th), math.sin(th), 0))
        o, i = V((px, py, zc)) + n * 0.005, V((px, py, zc))
        hw = 0.0115
        rows.append([hb.vert(i + V((0, 0, -hw)), -n), hb.vert(i + V((0, 0, hw)), -n), hb.vert(o + V((0, 0, hw)), n), hb.vert(o + V((0, 0, -hw)), n)])
    for k in range(NB):
        a, b = rows[k], rows[(k + 1) % NB]
        for jj in range(4):
            hb.face((a[jj], a[(jj + 1) % 4], b[(jj + 1) % 4], b[jj]), 'strap')
    kf = min(range(NB), key=lambda k: abs(((2 * math.pi * k / NB) - 1.5 * math.pi + math.pi) % (2 * math.pi) - math.pi))
    yf = cy0 - env[kf] - 0.002 - 0.005
    zf = P.band_z(V((0, yf, 0)))
    # the lamp: a short drum on the band, few polygons (only what the outline needs: a flat plane would vanish from the side).
    # Everything else about it is paint and relief (paint.lamp_images): the knurled rim, the screws, the facets of the glass, the
    # worn rubber. The glass is painted off; `lamp_glow` is the same glass lit, a disc of its own that the game shows when it is on.
    lamp, lamp_uv, glow, glow_uv = MB('lamp'), {}, MB('lamp_glow'), {}
    LN, LR0, LR1 = 20, 0.0262, 0.0246
    y_back, y_face = yf + 0.002, yf - 0.0150

    def lamp_ring(mb, uvs, y, r, uvfn, n):
        out = []
        for k in range(LN + 1):
            th = 2 * math.pi * k / LN
            i = mb.vert((r * math.cos(th), y, zf + r * math.sin(th)), n(th))
            uvs[i] = uvfn(k / LN, th)
            out.append(i)
        return out
    (fu, fv, fr), (gu, gv, _), (sv0, sv1) = P.LAMP_FACE, P.LAMP_GLOW, P.LAMP_SIDE
    side_n = lambda th: (math.cos(th), 0, math.sin(th))
    r_back = lamp_ring(lamp, lamp_uv, y_back, LR0, lambda u, th: (u, sv0), side_n)
    r_front = lamp_ring(lamp, lamp_uv, y_face, LR1, lambda u, th: (u, sv1), side_n)
    for k in range(LN):
        lamp.face((r_back[k], r_back[k + 1], r_front[k + 1], r_front[k]), 'lamp')
    face = lamp_ring(lamp, lamp_uv, y_face, LR1, lambda u, th: (fu - fr * math.cos(th), fv + fr * math.sin(th)), lambda th: (0, -1, 0))
    mid = lamp.vert((0, y_face, zf), (0, -1, 0))
    lamp_uv[mid] = (fu, fv)
    for k in range(LN):
        lamp.face((mid, face[k], face[k + 1]), 'lamp')
    gr = LR1 * P.LAMP_GLASS
    gring = lamp_ring(glow, glow_uv, y_face - 0.0003, gr, lambda u, th: (gu - fr * P.LAMP_GLASS * math.cos(th), gv + fr * P.LAMP_GLASS * math.sin(th)), lambda th: (0, -1, 0))
    gmid = glow.vert((0, y_face - 0.0003, zf), (0, -1, 0))
    glow_uv[gmid] = (gu, gv)
    for k in range(LN):
        glow.face((gmid, gring[k], gring[k + 1]), 'lamp')
    lamp.orient(0)
    glow.f = [f if (V(glow.v[f[1]]) - V(glow.v[f[0]])).cross(V(glow.v[f[2]]) - V(glow.v[f[0]])).y < 0 else tuple(reversed(f)) for f in glow.f]

    # the eyes: two globes that turn (each on a bone of its own, added once the head has its size), the lashes along the lids'
    # edges with the small highlights, and the shadow the lids lay on the globes
    eye, eye_uv = MB('eyes'), {}
    eye_side = {i: sd for sd in (1, -1) for i in JF.eye_mesh(eye, sd, eye_uv, lod)}
    lash, shade = MB('lashes'), MB('lidshade')
    for so in sockets:
        JF.lash_mesh(lash, so)
        JF.glint_mesh(lash, so.side)
        if not lod:
            JF.shade_mesh(shade, so)

    # the inside of the mouth. On the head: a dark cavity and the upper arch of teeth with its gum. On the jaw (they carry the same
    # jaw_open morph target as the chin): the lower arch, the tongue and the floor of the mouth.
    MZ = JF.MZ
    mouth, low, m_uv, l_uv, jaw_parts = JM.inside(MB)       # teeth one by one, gums, a tongue, a cavity that darkens toward the throat

    locks, lock_uv = build_locks(body, lod)

    # ---- the textures
    log('painting', TEX)
    cells0 = bpy.data.images.new('cells0', 4, 4)
    pr = C.make_object_patch(props, cells0, P.PATCH, 'props')
    pr.name = 'props'
    # the belt, the pouches, the tools and the collar get UVs of their own (smart project), painted like the rest
    bpy.context.view_layer.objects.active = pr
    for o in bpy.data.objects:
        o.select_set(o is pr)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    ptags = {i: m for i, m in enumerate(props.fm)}
    tags.update(JM.lip_tags(body))
    paints = P.paint_all({'body': body, 'jacket': jacket, 'tee': tee, 'pants': pants, 'boots': boots, 'props': pr}, arm, concept, TEX,
                         {'body': tags, 'props': ptags}, {'xopen': xopen, 'belt': (zb, cy), 'pouches': frames,
                                                         'trunk_w': trunk_w, 'cuff_x': max(abs(v.co.x) for v in jacket.data.vertices),
                                                         'sleeve_r': max(abs(v.co.z - 1.456) for v in jacket.data.vertices if 0.32 < abs(v.co.x) < 0.48)})
    if os.environ.get('JONAS_DUMP'):
        for k_, im_ in paints.items():
            im_.filepath_raw = os.path.join(os.environ['JONAS_DUMP'], 'tex_' + k_ + '.png')
            im_.file_format = 'PNG'
            im_.save()
            im_.file_format = 'JPEG'

    # ---- the objects
    def finish(ob, mat_name, img):
        ob.data.materials.clear()
        mat = C.textured_material(mat_name, img)
        ob.data.materials.append(mat)
        nimg = paints.get(mat_name + '_n')
        if nimg:                               # the fine relief (seams, stitching, folds, wrinkles) travels as the glTF normal texture
            nt = mat.node_tree
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = nimg
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], nt.nodes.get('Principled BSDF').inputs['Normal'])
        for p in ob.data.polygons:
            p.use_smooth = True

    finish(body, 'skin', paints['skin'])
    finish(jacket, 'jacket', paints['jacket'])
    finish(pants, 'pants', paints['pants'])
    finish(boots, 'boots', paints['boots'])
    finish(tee, 'tee', paints['tee'])
    finish(pr, 'props', paints['props'])
    hair = C.make_object_uvs(locks, paints['hair'], 'hair', lock_uv)
    hair.name = 'hair'
    strap = C.make_object_patch(hb, paints['cells'], P.PATCH, 'cells')
    strap.name = 'strap'
    lp = C.make_object_uvs(lamp, paints['lamp'], 'lamp', [lamp_uv[i] for i in range(len(lamp.v))])
    lp.name = 'lamp'
    finish(lp, 'lamp', paints['lamp'])
    lg = C.make_object_uvs(glow, paints['lamp'], 'lampglow', [glow_uv[i] for i in range(len(glow.v))])
    lg.name = 'lamp_glow'
    eo = C.make_object_uvs(eye, paints['eye'], 'eye', [eye_uv[i] for i in range(len(eye.v))])
    eo.name = 'eyes'
    for sd, bone in ((1, 'eye_l'), (-1, 'eye_r')):
        eo.vertex_groups.new(name=bone).add([i for i, s_ in eye_side.items() if s_ == sd], 1.0, 'REPLACE')
    la = C.make_object_uvs(lash, paints['cells'], 'cells', patch_uvs(lash, {}))
    la.name = 'lashes'
    heads = [(strap, hb), (lp, lamp), (lg, glow), (la, lash)]
    if not lod:
        sh = C.make_object_uvs(shade, paints['cells'], 'cells', [P.PATCH['lash']] * len(shade.v))
        sh.name = 'lidshade'
        heads.append((sh, shade))
    mo = C.make_object_uvs(mouth, paints['cells'], 'cells', patch_uvs(mouth, m_uv))
    mo.name = 'mouth'
    ml = C.make_object_uvs(low, paints['cells'], 'cells', patch_uvs(low, l_uv))
    ml.name = 'mouthlow'
    # the belt and what hangs on it are of the hips (they do not stretch with the legs); the collar is of the chest
    vg = pr.vertex_groups.new(name='pelvis')
    vg.add(list(range(n_belt)), 1.0, 'REPLACE')
    # the collar and the chest pockets move as the jacket under them does: each vertex takes the weights of the nearest of the jacket's
    kd = KDTree(len(jacket.data.vertices))
    for v in jacket.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    jn = group_names(jacket)
    for i in range(n_belt, n_chest):
        _, j, _ = kd.find(V(props.v[i]))
        for g in jacket.data.vertices[j].groups:
            if g.weight > 0.01:
                (pr.vertex_groups.get(jn[g.group]) or pr.vertex_groups.new(name=jn[g.group])).add([i], g.weight, 'REPLACE')
    for bone, i0, i1 in caps:
        if bone is None:
            for i in range(i0, i1):
                _, j, _ = kd.find(V(props.v[i]))
                for g in jacket.data.vertices[j].groups:
                    if g.weight > 0.01:
                        (pr.vertex_groups.get(jn[g.group]) or pr.vertex_groups.new(name=jn[g.group])).add([i], g.weight, 'REPLACE')
            continue
        vg = pr.vertex_groups.get(bone) or pr.vertex_groups.new(name=bone)
        vg.add(list(range(i0, i1)), 1.0, 'REPLACE')
    for ob_, mb_ in heads:
        C.rigid(ob_, mb_, 'Head')
    C.rigid(mo, mouth, 'Head')
    C.rigid(ml, low, 'Head')
    C.rigid(hair, locks, 'Head')
    for ob in (jacket, tee, pants, boots, pr, hair, mo, ml, eo) + tuple(o_ for o_, _ in heads):
        if not any(m.type == 'ARMATURE' for m in ob.modifiers):
            C.bind(ob, arm)
        ob.parent = arm
    if lod:
        for ob, ratio in ((body, 0.3), (jacket, 0.3), (tee, 0.3), (pants, 0.3), (boots, 0.3)):       # (the globes are never reduced: a faceted eye shows)
            decimate(ob, ratio)
    else:
        JF.add_keys(body, sockets)
        JM.roll_keys(body, log)
        # the lashes and the lids' shadow ride the lids' edges: the same morph targets, made from the edge as each one leaves it
        for ob_, fn in ((la, JF.lash_mesh), (sh, JF.shade_mesh)):
            ob_.shape_key_add(name='Basis')
            for n_, (up, lo, lift) in JF.lid_shapes().items():
                m2 = MB('k')
                for so in sockets:
                    fn(m2, so, JF.lid_state(so, up, lo, lift), lift)
                    if fn is JF.lash_mesh:
                        JF.glint_mesh(m2, so.side, JF.GLINT_SINK.get(n_, 0.0))
                kb = ob_.shape_key_add(name=n_)
                for k_, q in enumerate(m2.v):
                    kb.data[k_].co = q
        log('lids under the globe (m, 0 = none)', JF.check_lids(body, sockets, JF.CHECK_FACES))
        # the lower teeth, the tongue and the floor of the mouth follow the jaw: the same morph target, the same drop as the chin
        ml.shape_key_add(name='Basis')
        jk = ml.shape_key_add(name='jaw_open')
        for k_, v_ in enumerate(ml.data.vertices):
            share = next((k for i0, i1, k in jaw_parts if i0 <= k_ < i1), 0.97)      # the tongue rides higher than the jaw drops; the teeth stay behind the lip
            jk.data[k_].co = V(v_.co) + V((0, 0.0045, -JF.JAW * share))
    head_scale(body, (hair, mo, ml, eo) + tuple(o_ for o_, _ in heads))
    eye_bones(arm)
    short_legs(arm, [o for o in bpy.data.objects if o.type == 'MESH'])
    JR.fit_arms(arm)                      # the arms' bones go where the skin's joints are (the trunk's widening had carried the skin away)
    JR.add_sockets(arm)                   # grip_l, grip_r: what his hands hold
    JR.add_twist(arm)                     # lowerarm_twist_l, _r: the turn of the hand spread along the forearm

    # ---- the animations of the libraries, under the game's names (without the fingers: the game relaxes the hands itself)
    log('animations')
    FING = re.compile(r'pose\.bones\["(index|middle|ring|pinky|thumb)')
    actions = {}
    for lib, path in ((1, UAL1), (2, UAL2)):
        new = import_gltf(os.path.join(assets, path))
        for a in bpy.data.actions:
            if a.name not in actions:
                actions.setdefault(a.name, a)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    rest_low = min(arm.data.bones[b].head_local.z for b in ('foot_l', 'foot_r', 'ball_l', 'ball_r'))
    for game, (lib, aname) in (CLIPS.items() if not lod else []):
        act = actions.get(aname)
        if not act:
            log('missing', aname)
            continue
        a2 = act.copy()
        a2.name = game
        scale_hips(a2)
        for fc in list(a2.fcurves):
            if FING.match(fc.data_path):
                a2.fcurves.remove(fc)
        if game in GROUNDED:
            log('ground', game, round(ground_clip(arm, a2, rest_low), 4))
        tr = ad.nla_tracks.new()
        tr.name = game
        st = tr.strips.new(game, int(a2.frame_range[0]), a2)
        st.name = game
        log('clip', game, aname, tuple(round(x) for x in a2.frame_range))
    if not lod:
        # the CMU clips, retargeted: a limp (loops) and a squat down beside something (plays once and holds)
        for game, (fname, f0, f1, loops) in CMU_CLIPS.items():
            path = os.path.join(assets, CMU, fname + '.fbx')
            a0, info = RT.retarget(arm, path, game + '_0', f0, f1)
            low = RT.lowest_foot(arm, a0, info['n'])
            bpy.data.actions.remove(a0)
            act, info = RT.retarget(arm, path, game, f0, f1, zshift=rest_low - low)
            if loops:
                RT.loop_close(act, arm, info['n'])
            tr = ad.nla_tracks.new()
            tr.name = game
            st = tr.strips.new(game, 0, act)
            st.name = game
            log('CMU', game, fname, info['n'], 'frames; cycle travel (m)', round(info['cycle_travel'], 3), 'ground shift', round(rest_low - low, 4))
        down = (0, 0, -1)
        relax = {}
        for side in ('l', 'r'):
            for f in ('index', 'middle', 'ring', 'pinky'):
                for n, a in ((1, 0.35), (2, 0.5), (3, 0.35)):
                    relax[f'{f}_0{n}_{side}'] = (down, a)
            for n, a in ((1, 0.15), (2, 0.2), (3, 0.2)):
                relax[f'thumb_0{n}_{side}'] = (down, a)
        pose_clip(arm, 'hand_relax', relax, ad)
        # the library's idle stands like a fighter (feet wide, arms out): Jonas stands with his feet under him and his arms hanging
        stance = {'thigh_l': ((-1, 0, 0), 0.075), 'thigh_r': ((1, 0, 0), 0.075), 'upperarm_l': (down, 0.13), 'upperarm_r': (down, 0.13)}
        pose_clip(arm, 'stance', stance, ad)
        # his ways of going over the floor, made from the library's loops for the speeds of the game: the loops with the carrying foot
        # pinned, the brisk walk, the starts, the stops and the turns on the spot (jonas_gait.py). They stand as he stands (the stance).
        stand_extra = {}
        for bone_, (tgt_, ang_) in stance.items():
            axis_, sgn_ = axis_for(arm, bone_, tgt_, 0.4)
            stand_extra[bone_] = Quaternion(axis_, sgn_ * ang_)
        JG.build(arm, ad, assets, stand_extra, LEG_K, log)
        # seated at a table: the hands come up from the knees onto it; and the hand that holds the radio comes down from the ear to the mouth
        fwd = (0, -1, 0)
        pose_clip(arm, 'sit_hands', {'upperarm_l': (fwd, 0.2), 'upperarm_r': (fwd, 0.2), 'lowerarm_l': (fwd, 0.18), 'lowerarm_r': (fwd, 0.18)}, ad)
        pose_clip(arm, 'radio_low', {'upperarm_r': (fwd, 0.5), 'lowerarm_r': ((0, 1, 0), 0.3)}, ad)
        pose_clip(arm, 'tired', {'spine_02': ((0, -1, 0), 0.07), 'spine_03': ((0, -1, 0), 0.08), 'neck_01': ((0, 1, 0), 0.06), 'Head': ((0, 1, 0), 0.20),
                                 'clavicle_l': (down, 0.14), 'clavicle_r': (down, 0.14)}, ad)
        # at the station radio, with the notebook, with the pocket: the hands on their targets (jonas_radio.py)
        JR.build_clips(arm, ad, log)
    # the corda_descer: the climb, backwards
    act = actions.get('ClimbUp_1m')
    if act and not lod:
        a2 = act.copy()
        a2.name = 'corda_descer'
        scale_hips(a2)
        for fc in list(a2.fcurves):
            if FING.match(fc.data_path):
                a2.fcurves.remove(fc)
        lo, hi = a2.frame_range
        for fc in a2.fcurves:
            for kp in fc.keyframe_points:
                kp.co.x = lo + hi - kp.co.x
                kp.handle_left.x = lo + hi - kp.handle_left.x
                kp.handle_right.x = lo + hi - kp.handle_right.x
            fc.keyframe_points.sort()
            fc.update()
        tr = ad.nla_tracks.new()
        tr.name = 'corda_descer'
        st = tr.strips.new('corda_descer', int(lo), a2)
        st.name = 'corda_descer'
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.render.fps = 30
    bpy.context.view_layer.objects.active = arm
    # for the game's outline (a shell pushed out along the normals): how much of it each vertex of the skin takes. None inside the
    # mouth (the lips' edge turned in) and none round the eyes, where the shell would show as a dark rim on the globes.
    oa = body.data.attributes.get('_outline') or body.data.attributes.new('_outline', 'FLOAT', 'POINT')
    ra = body.data.attributes.get('roll')
    eyes_at = [V(arm.data.bones[n].head_local) for n in ('eye_l', 'eye_r') if n in arm.data.bones]
    for i, v in enumerate(body.data.vertices):
        w = 0.0 if (ra and abs(ra.data[i].value) > 0.5) else 1.0
        for e in eyes_at:
            w *= smooth(0.021, 0.034, (V(v.co) - e).length)
        oa.data[i].value = w
    # (of the pieces on him, the collar is a folded leaf and the sleeves' insides are discs: a shell of them shows as dark patches)
    pa = pr.data.attributes.get('_outline') or pr.data.attributes.new('_outline', 'FLOAT', 'POINT')
    pw = [1.0] * len(props.v)
    for f_, m_ in zip(props.f, props.fm):
        if m_ in ('collar', 'collar_edge', 'inside'):
            for i_ in f_:
                pw[i_] = 0.0
    for i_, w_ in enumerate(pw):
        pa.data[i_].value = w_

    path = os.path.join(out, 'jonas_lod.glb' if lod else 'jonas.glb')
    C.export_glb(path, dict(export_image_format='JPEG', export_jpeg_quality=84, export_texcoords=True, export_morph=True, export_morph_normal=False,
                            export_animations=not lod, export_force_sampling=True, export_materials='EXPORT', export_vertex_color='NONE', export_attributes=True))
    if os.environ.get('JONAS_SAVE'):           # the scene as it was exported, to look at in Blender
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['JONAS_SAVE']))
    C.shrink_glb(path, steps={**JR.KEY_STEPS, **JG.KEY_STEPS})
    log('WROTE', path, os.path.getsize(path))
    tri = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'}
    log('TRIS', tri, sum(tri.values()))


main()
