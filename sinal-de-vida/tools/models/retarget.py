"""Retarget of CMU motion-capture clips (43-bone FBX, RancidMilk's conversion) onto the 65-bone Unreal-style skeleton of the
Quaternius body, by script: the clips are only read (the FBX are imported as data), nothing in them is run.

Method (per frame, in armature space, no solver):
  * the spine, neck, head and legs take the world rotation the source bone has turned from its rest pose ("delta"), so the
    bends and twists are the same in both skeletons (the two rests are both upright);
  * the arms take the source's bone direction ("aim"), because the source rests in a T pose and the target in an A pose, so a
    plain delta would swing the arms too far;
  * the root keeps the height bounce and the side sway, scaled by the leg length ratio; the travel is taken out by a line fit
    (the game moves the body), and a cycle is cut where the pose repeats and crossfaded closed.
Everything is deterministic."""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

V = Vector

# target bone -> (source bone, mode, weight-name). 'spine_01' is half of the abdomen's turn, 'spine_02' the whole of it.
MAP = {
    'pelvis': ('hip', 'delta', 1.0),
    'spine_01': ('abdomen', 'delta', 0.5), 'spine_02': ('abdomen', 'delta', 1.0), 'spine_03': ('chest', 'delta', 1.0),
    'neck_01': ('neck', 'delta', 1.0), 'Head': ('head', 'delta', 1.0),
    'clavicle_l': ('lCollar', 'delta', 1.0), 'clavicle_r': ('rCollar', 'delta', 1.0),
    'upperarm_l': ('lShldr', 'aim', 1.0), 'lowerarm_l': ('lForeArm', 'aim', 1.0), 'hand_l': ('lHand', 'aim', 1.0),
    'upperarm_r': ('rShldr', 'aim', 1.0), 'lowerarm_r': ('rForeArm', 'aim', 1.0), 'hand_r': ('rHand', 'aim', 1.0),
    'thigh_l': ('lThigh', 'delta', 1.0), 'calf_l': ('lShin', 'delta', 1.0), 'foot_l': ('lFoot', 'delta', 1.0),
    'thigh_r': ('rThigh', 'delta', 1.0), 'calf_r': ('rShin', 'delta', 1.0), 'foot_r': ('rFoot', 'delta', 1.0),
}
ORDER = None


def _import_fbx(path):
    before = set(bpy.data.objects)
    bact = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in objs if o.type == 'ARMATURE')
    act = next(a for a in bpy.data.actions if a not in bact)
    return arm, act, objs


def _sample_source(arm, act, frames):
    """Armature-space matrices of every source bone at each frame."""
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    out = []
    sc = bpy.context.scene
    for f in frames:
        sc.frame_set(int(f))
        out.append({pb.name: pb.matrix.copy() for pb in arm.pose.bones})
    return out


def retarget(target_arm, cmu_path, name, f0=None, f1=None, step=1, zshift=0.0):
    """Return a new action on `target_arm` with the CMU clip's motion, plus info about the travel (dict)."""
    sarm, sact, objs = _import_fbx(cmu_path)
    sc = bpy.context.scene
    lo, hi = int(sact.frame_range[0]), int(sact.frame_range[1])
    f0 = lo if f0 is None else f0
    f1 = hi if f1 is None else f1
    frames = list(range(f0, f1 + 1, step))
    S = _sample_source(sarm, sact, frames)
    srest = {b.name: b.matrix_local.copy() for b in sarm.data.bones}
    shead = {b.name: V(b.head_local) for b in sarm.data.bones}
    stail = {b.name: V(b.tail_local) for b in sarm.data.bones}

    tb = target_arm.data.bones
    trest = {b.name: b.matrix_local.copy() for b in tb}
    order = []

    def walk(b):
        order.append(b)
        for c in b.children:
            walk(c)
    for b in tb:
        if b.parent is None:
            walk(b)
    # the scale: leg length of the target over the source's
    tleg = (V(tb['thigh_l'].head_local) - V(tb['foot_l'].head_local)).length
    sleg = (shead['lThigh'] - shead['lFoot']).length
    k = tleg / sleg
    # the heading of the subject: the source faces -Y at rest; the clip may face anywhere, so the average facing is turned back to -Y
    fx = fy = 0.0
    for m in S:
        d = m['hip'].to_3x3() @ srest['hip'].to_3x3().inverted() @ V((0, -1, 0))
        fx += d.x
        fy += d.y
    yaw = math.atan2(fx, -fy)          # the angle (about Z) from -Y to the facing
    Rc = Matrix.Rotation(-yaw, 3, 'Z')
    Qc = Rc.to_quaternion()
    # the source hip's travel: the line fit of (x, y) over the frames
    hp = [Rc @ m['hip'].translation for m in S]
    n = len(hp)
    ts = [i / max(1, n - 1) for i in range(n)]
    tm = sum(ts) / n
    var = sum((t - tm) ** 2 for t in ts) or 1.0
    fit = []
    for ax in (0, 1):
        vm = sum(p[ax] for p in hp) / n
        slope = sum((t - tm) * (p[ax] - vm) for t, p in zip(ts, hp)) / var
        fit.append((vm, slope))
    travel = V((fit[0][1], fit[1][1], 0.0)) * k          # target units of travel from the first to the last frame
    # the stride: if the clip walks in place (a treadmill), the feet slide backwards while they carry the weight
    fz = [min(m['lFoot'].translation.z, m['rFoot'].translation.z) for m in S]
    zmin = min(fz)
    sp = []
    for a in range(1, n):
        for foot in ('lFoot', 'rFoot'):
            p0, p1 = S[a - 1][foot].translation, S[a][foot].translation
            if p1.z < zmin + 4.0 and p0.z < zmin + 4.0:
                sp.append(math.hypot(p1.x - p0.x, p1.y - p0.y))
    stance = (sum(sp) / len(sp)) if sp else 0.0
    stride_cycle = max(travel.length, stance * k * (n - 1))
    s_hip_rest_z = srest['hip'].translation.z
    t_pel_rest = trest['pelvis'].translation.copy()

    act = bpy.data.actions.new(name)
    ad = target_arm.animation_data or target_arm.animation_data_create()
    ad.action = act
    for pb in target_arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    sc_fps = 30
    q_id = Quaternion((1, 0, 0, 0))
    for i, (fr, M) in enumerate(zip(frames, S)):
        desired = {}
        # source world deltas
        delta = {}
        for sn, m in M.items():
            delta[sn] = Qc @ (m.to_3x3() @ srest[sn].to_3x3().inverted()).to_quaternion()
        for b in order:
            rest = trest[b.name]
            par = desired.get(b.parent.name) if b.parent else None
            if b.name in MAP:
                sn, mode, w = MAP[b.name]
                R_t = rest.to_3x3()
                if mode == 'delta':
                    q = delta[sn]
                    if w != 1.0:
                        q = q_id.slerp(q, w)
                    Rm = q.to_matrix() @ R_t
                else:
                    sd = Rc @ (M[sn].to_3x3() @ V((0, 1, 0)))     # the source bone's direction (local +Y is the bone's axis in Blender)
                    td = R_t @ V((0, 1, 0))
                    q = td.rotation_difference(sd)
                    Rm = q.to_matrix() @ R_t
                if b.name == 'pelvis':
                    p = V((t_pel_rest.x, t_pel_rest.y, t_pel_rest.z))
                    h = Rc @ M['hip'].translation
                    p.z = t_pel_rest.z * (h.z / s_hip_rest_z) + zshift
                    # sway: the hip's offset from the fitted line, scaled
                    tt = ts[i]
                    p.x += (h.x - (fit[0][0] + fit[0][1] * (tt - tm))) * k
                    p.y += (h.y - (fit[1][0] + fit[1][1] * (tt - tm))) * k
                    mat = Matrix.Translation(p) @ Rm.to_4x4()
                else:
                    # the bone's head stays where the parent's chain puts it
                    head_in_par = (par @ (b.parent.matrix_local.inverted() @ rest)).translation if par is not None else rest.translation
                    mat = Matrix.Translation(head_in_par) @ Rm.to_4x4()
            else:
                if par is None:
                    mat = rest.copy()
                else:
                    mat = par @ (b.parent.matrix_local.inverted() @ rest)
            desired[b.name] = mat
            # the local pose
            if b.parent is None:
                basis = rest.inverted() @ mat
            else:
                base = desired[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest)
                basis = base.inverted() @ mat
            pb = target_arm.pose.bones[b.name]
            loc, rot, _ = basis.decompose()
            pb.rotation_quaternion = rot
            pb.location = loc
            pb.keyframe_insert('rotation_quaternion', frame=i)
            if b.name == 'pelvis':
                pb.keyframe_insert('location', frame=i)
    ad.action = None
    # clean the imported source
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(sact)
    return act, dict(k=k, n=len(frames), travel_len=travel.length, stance_speed=stance * k * 30, cycle_travel=stride_cycle)


def loop_close(act, target_arm, n, blend=5):
    """Crossfade the last `blend` frames of the clip toward its first, so the end meets the start."""
    # rotation channels are per bone; blend each key's quaternion with the start's
    fcs = {}
    for fc in act.fcurves:
        fcs.setdefault(fc.data_path, {})[fc.array_index] = fc
    for path, comps in fcs.items():
        cnt = len(comps)
        for j in range(blend):
            f = n - 1 - j
            t = 1 - j / blend           # 0 at the start of the blend, 1 at the last frame
            t = t * t * (3 - 2 * t)
            if cnt == 4:
                a = Quaternion([comps[c].evaluate(f) for c in range(4)])
                b = Quaternion([comps[c].evaluate(0) for c in range(4)])
                q = a.slerp(b, t)
                vals = list(q)
            else:
                vals = [comps[c].evaluate(f) * (1 - t) + comps[c].evaluate(0) * t for c in range(cnt)]
            for c in range(cnt):
                for kp in comps[c].keyframe_points:
                    if int(round(kp.co.x)) == f:
                        kp.co.y = vals[c]
                        kp.handle_left.y = kp.handle_right.y = vals[c]


def find_loop(cmu_path, min_len, max_len, start=0, stop=None):
    """The frame pair (i, j) of a source clip, min_len..max_len frames apart, where the body is in the same pose and moving the
    same way (a stride cycle). Returns (i, j, distance)."""
    sarm, sact, objs = _import_fbx(cmu_path)
    lo, hi = int(sact.frame_range[0]), int(sact.frame_range[1])
    frames = list(range(lo, hi + 1))
    S = _sample_source(sarm, sact, frames)
    names = ('lFoot', 'rFoot', 'lHand', 'rHand', 'head', 'lShin', 'rShin', 'lForeArm', 'rForeArm', 'chest')
    sig = []
    for m in S:
        inv = m['hip'].inverted()
        sig.append([(inv @ m[n].translation) for n in names])
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(sact)
    n = len(sig)
    stop = n - 2 if stop is None else min(stop, n - 2)
    best = (None, None, 1e18)
    for i in range(max(1, start), stop):
        for j in range(i + min_len, min(n - 1, i + max_len + 1)):
            d = 0.0
            for a, b, a1, b1 in zip(sig[i], sig[j], sig[i + 1], sig[j + 1]):
                d += (a - b).length_squared + 4 * ((a1 - a) - (b1 - b)).length_squared
            if d < best[2]:
                best = (i + lo, j + lo, d)
    return best


def lowest_foot(target_arm, act, n):
    """Lowest height reached by the feet and toes over the clip (armature space), to set the clip on the ground."""
    ad = target_arm.animation_data
    ad.action = act
    sc = bpy.context.scene
    low = 1e9
    for i in range(n):
        sc.frame_set(i)
        for bn in ('foot_l', 'foot_r', 'ball_l', 'ball_r'):
            low = min(low, target_arm.pose.bones[bn].head.z)
    ad.action = None
    return low
