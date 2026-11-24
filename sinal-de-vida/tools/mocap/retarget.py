"""A cleaned take (tools/mocap/process.mjs) -> a clip on Jonas's skeleton, by script (Blender 4.5, no window):

    blender -b --factory-startup --python tools/mocap/retarget.py -- --take tools/mocap/takes/<name>.json --name <name> \
        --glb assets/models/jonas.glb --out <folder>

Writes <folder>/<name>.test.glb (Jonas, without his other clips, playing the new one: for looking at) and <folder>/<name>.report.json.
The game's own jonas.glb is only read. To put the clip into the model, jonas.py calls `add_takes(arm, ad, takes_dir, log)` (README, "Movimento do corpo").

How: the take has the person's joints (33 points) in Jonas's world and scale. Each bone of Jonas is given the rotation that points it where the
person's limb points (no solver, nothing to converge, the same numbers give the same clip):
  * pelvis, chest and head: a frame from the hip line, the shoulder line and the ears, and the spine's three bones share the turn from the pelvis
    to the chest, the neck takes half of the chest-to-head;
  * arms and legs: the bone is swung to point at the next joint, then turned about its own axis until the elbow's (knee's) bend plane is the
    person's. The twist counts as much as the bend is clear (a straight arm has no plane and keeps the swing alone, which hangs the palm to the body);
  * feet: pointed from the ankle to the toe, and laid flat on the floor while the foot is planted; hands: a little of the wrist's bend, no fingers
    (the game relaxes the hands itself, `hand_relax`);
  * Jonas's rest is a T pose with straight legs and the person's is whatever he stood in: every bone is aimed at an absolute direction, so the
    two rests do not have to match, and the person's own rest is only used for the shoulders (their change from his standing shoulders).
Then Jonas's own legs decide the rest (a person's legs are not his 90% ones): the pelvis goes up or down until the planted foot is on the floor, and
the root moves over the floor opposite to the planted foot (the same pin the gait clips of jonas_gait.py have), so the feet do not slide. In the air
the take's own numbers (the hips in the image) keep the shape."""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

V = Vector
LM = dict(nose=0, earL=7, earR=8, shL=11, shR=12, elL=13, elR=14, wrL=15, wrR=16, pinL=17, pinR=18, idxL=19, idxR=20,
          hipL=23, hipR=24, knL=25, knR=26, anL=27, anR=28, heL=29, heR=30, toL=31, toR=32)
Z = V((0, 0, 1))
DIMS = None


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def frame_matrix(lat, up_hint):
    """The rotation (from Jonas's rest axes) of a body part whose left-right axis is `lat` and whose up is near `up_hint`: x -> lat, z -> up,
    y -> back (Jonas faces -y)."""
    lat = lat.normalized()
    up = up_hint - lat * up_hint.dot(lat)
    if up.length < 1e-6:
        up = V(Z)
    up.normalize()
    back = -(lat.cross(up))
    return Matrix(((lat.x, back.x, up.x), (lat.y, back.y, up.y), (lat.z, back.z, up.z)))


def swing_twist(rest3, d_t, n_t, w, n_rest=None, bent=None):
    """The absolute rotation of a bone (rest rotation `rest3`) that points at `d_t` and whose hinge (the normal of the bend plane) is `n_t`,
    to the degree `w` (0: the swing alone)."""
    d_rest = rest3 @ V((0, 1, 0))
    if n_rest is None:
        n_rest = d_rest.cross(bent).normalized()
    sw = d_rest.rotation_difference(d_t)
    ang = 0.0
    if w > 0 and n_t is not None:
        a = sw @ n_rest
        a = a - d_t * a.dot(d_t)
        b = n_t - d_t * n_t.dot(d_t)
        if a.length > 1e-6 and b.length > 1e-6:
            ang = math.atan2(d_t.dot(a.cross(b)), a.dot(b))
    tw = Quaternion(d_t, w * ang)
    return (tw @ sw).to_matrix() @ rest3


def bend_plane(a, b, c):
    """Normal of the plane of a-b-c (a joint's bend) and the angle at b between the two bones' directions (0 = straight)."""
    u, f = b - a, c - b
    n = u.cross(f)
    if n.length < 1e-9:
        return None, 0.0
    return n.normalized(), u.angle(f, 0.0)


class Rig:
    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.order = []

        def walk(b):
            self.order.append(b)
            for c in b.children:
                walk(c)
        for b in bones:
            if b.parent is None:
                walk(b)
        self.rest_low = min(bones[n].head_local.z for n in ('foot_l', 'foot_r', 'ball_l', 'ball_r'))
        # the heel: a point behind the ankle at the height of the ball, carried by the foot bone
        self.heel = {}
        for s in ('l', 'r'):
            h = V(bones['foot_' + s].head_local)
            self.heel[s] = self.rest['foot_' + s].inverted() @ V((h.x, h.y + 0.075, self.rest_low))
        self.rest3 = {n: m.to_3x3() for n, m in self.rest.items()}

    def fk(self, rots, root_t, pelvis_t):
        """Armature-space matrices of every bone: the mapped ones with the given absolute rotations (the pelvis and the root also a place), the
        others carried by their parent."""
        desired = {}
        for b in self.order:
            rest = self.rest[b.name]
            par = desired.get(b.parent.name) if b.parent else None
            if b.name == 'root':
                mat = Matrix.Translation(root_t + rest.translation) @ self.rest3['root'].to_4x4()
            elif b.name == 'pelvis':
                mat = Matrix.Translation(pelvis_t) @ rots['pelvis'].to_4x4()
            elif b.name in rots:
                head = (par @ (b.parent.matrix_local.inverted() @ rest)).translation
                mat = Matrix.Translation(head) @ rots[b.name].to_4x4()
            else:
                mat = par @ (b.parent.matrix_local.inverted() @ rest)
            desired[b.name] = mat
        return desired

    def basis(self, desired, name):
        b = self.arm.data.bones[name]
        rest = self.rest[name]
        mat = desired[name]
        if b.parent is None:
            return rest.inverted() @ mat
        base = desired[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest)
        return base.inverted() @ mat

    def sole(self, desired, s):
        """The points of a foot that touch the floor: the heel, the ball and the toe."""
        return [desired['foot_' + s] @ self.heel[s], desired['ball_' + s].translation.copy(), desired['ball_leaf_' + s].translation.copy()]


SPAN = {'l': dict(sh='shL', el='elL', wr='wrL', hip='hipL', kn='knL', an='anL', he='heL', to='toL', pin='pinL', idx='idxL'),
        'r': dict(sh='shR', el='elR', wr='wrR', hip='hipR', kn='knR', an='anR', he='heR', to='toR', pin='pinR', idx='idxR')}


def solve_rotations(rig, take):
    """Per frame, the absolute rotation of every mapped bone (pass A: the rotations do not depend on where the body is)."""
    n = take['n']
    lm = take['lm']
    flags = take['contact']
    P = lambda f, k: V(lm[f][LM[k]])
    # the person's standing shoulders: the clavicle's direction in the chest's own frame, over the first half second
    still = max(2, min(n, int(0.5 * take['fps'])))
    neutral = {}
    chest_of = {}

    def chest_frame(f):
        up_t = (((P(f, 'shL') + P(f, 'shR')) / 2) - ((P(f, 'hipL') + P(f, 'hipR')) / 2))
        return frame_matrix(P(f, 'shL') - P(f, 'shR'), up_t), up_t

    for s in ('l', 'r'):
        acc = V((0, 0, 0))
        for f in range(still):
            Rc, _ = chest_frame(f)
            sh_mid = (P(f, 'shL') + P(f, 'shR')) / 2
            acc += (Rc.transposed() @ (P(f, SPAN[s]['sh']) - sh_mid)).normalized()
        neutral[s] = acc.normalized()
    # the head: the nose is lower than the ears even when the head is level, so the pitch of the ears-to-nose line is taken from his standing
    # head (the first half second: looking ahead) and only the change from it is Jonas's
    def head_fwd(f):
        lat = (P(f, 'earL') - P(f, 'earR')).normalized()
        fwd = P(f, 'nose') - (P(f, 'earL') + P(f, 'earR')) / 2
        return lat, fwd - lat * fwd.dot(lat)

    lat0, f0 = V((0, 0, 0)), V((0, 0, 0))
    for f in range(still):
        l_, f_ = head_fwd(f)
        lat0 += l_
        f0 += f_.normalized()
    lat0.normalize()
    f0.normalize()
    h0 = V((f0.x, f0.y, 0)).normalized() if abs(f0.z) < 0.99 else f0
    head_pitch_fix = math.atan2(lat0.dot(f0.cross(h0)), f0.dot(h0))
    out = []
    for f in range(n):
        R = {}
        hipc = (P(f, 'hipL') + P(f, 'hipR')) / 2
        shc = (P(f, 'shL') + P(f, 'shR')) / 2
        Rc, up_t = chest_frame(f)
        up_p = (Z + up_t.normalized()).normalized()          # the pelvis leans half as much as the trunk, the spine the other half
        Rp = frame_matrix(P(f, 'hipL') - P(f, 'hipR'), up_p)
        lat_h, fwd_h = head_fwd(f)
        if fwd_h.length > 1e-6 and lat_h.length > 1e-6:
            fwd_h = Quaternion(lat_h, head_pitch_fix) @ fwd_h
            Rh = frame_matrix(lat_h, fwd_h.cross(lat_h))
        else:
            Rh = Rc
        qp, qc, qh = Rp.to_quaternion(), Rc.to_quaternion(), Rh.to_quaternion()
        d = {'pelvis': qp, 'spine_01': qp.slerp(qc, 1 / 3), 'spine_02': qp.slerp(qc, 2 / 3), 'spine_03': qc, 'neck_01': qc.slerp(qh, 0.5), 'Head': qh}
        for name, q in d.items():
            R[name] = q.to_matrix() @ rig.rest3[name]
        for s in ('l', 'r'):
            S = SPAN[s]
            # the clavicle: the change of the shoulder's direction from his standing one, in the chest's frame, partly
            t_loc = (Rc.transposed() @ (P(f, S['sh']) - shc)).normalized()
            dq = neutral[s].rotation_difference(t_loc)
            ang = dq.angle
            if ang > 1e-6:
                dq = Quaternion(dq.axis, min(ang, math.radians(30)) * 0.6)
            R['clavicle_' + s] = Rc @ dq.to_matrix() @ rig.rest3['clavicle_' + s]
            # the arm
            sh, el, wr = P(f, S['sh']), P(f, S['el']), P(f, S['wr'])
            n_arm, flex = bend_plane(sh, el, wr)
            w_arm = smoothstep(math.radians(12), math.radians(35), flex)
            bent = V((0, -1, 0))
            R['upperarm_' + s] = swing_twist(rig.rest3['upperarm_' + s], (el - sh).normalized(), n_arm, w_arm, bent=bent)
            R['lowerarm_' + s] = swing_twist(rig.rest3['lowerarm_' + s], (wr - el).normalized(), n_arm, w_arm, bent=bent)
            # the hand: a little of the wrist's bend, from the knuckles
            kn_pt = (P(f, S['pin']) + P(f, S['idx'])) / 2
            dh = kn_pt - wr
            ref = (R['lowerarm_' + s] @ rig.rest3['lowerarm_' + s].inverted()) @ (rig.rest3['hand_' + s] @ V((0, 1, 0)))
            if dh.length > 1e-6:
                q = ref.rotation_difference(dh.normalized())
                q = Quaternion(q.axis, min(q.angle, math.radians(45)) * 0.6) if q.angle > 1e-6 else q
                Rh_ = q.to_matrix() @ (R['lowerarm_' + s] @ rig.rest3['lowerarm_' + s].inverted())
            else:
                Rh_ = R['lowerarm_' + s] @ rig.rest3['lowerarm_' + s].inverted()
            R['hand_' + s] = Rh_ @ rig.rest3['hand_' + s]
            # the leg
            hp, kn, an = P(f, S['hip']), P(f, S['kn']), P(f, S['an'])
            n_leg, flex = bend_plane(hp, kn, an)
            toe = P(f, S['to']) - P(f, S['he'])
            hz = V((toe.x, toe.y, 0))
            n_foot = Z.cross(hz).normalized() if hz.length > 1e-6 else V((1, 0, 0))
            w_leg = smoothstep(math.radians(10), math.radians(30), flex)
            n_t = (n_leg * w_leg + n_foot * (1 - w_leg)).normalized() if n_leg is not None else n_foot
            bent = V((0, 1, 0))
            R['thigh_' + s] = swing_twist(rig.rest3['thigh_' + s], (kn - hp).normalized(), n_t, 1.0, bent=bent)
            R['calf_' + s] = swing_twist(rig.rest3['calf_' + s], (an - kn).normalized(), n_t, 1.0, bent=bent)
            # the foot: from the ankle to the toe, flat on the floor while it is planted
            d_foot = (P(f, S['to']) - an).normalized()
            d_rest = rig.rest3['foot_' + s] @ V((0, 1, 0))
            pitch0 = math.asin(max(-1, min(1, -d_rest.z)))
            hxy = V((d_foot.x, d_foot.y, 0))
            if hxy.length > 1e-6:
                hxy.normalize()
                flat = (hxy * math.cos(pitch0) + V((0, 0, -math.sin(pitch0)))).normalized()
                pitch = math.asin(max(-1, min(1, -d_foot.z)))
                c = take['contact_w'][f][0 if s == 'l' else 1] * (1 - smoothstep(math.radians(10), math.radians(25), abs(pitch - pitch0)))
                d_foot = d_foot.slerp(flat, c * 0.8).normalized() if c > 0 else d_foot
            n_f = Z.cross(V((d_foot.x, d_foot.y, 0))).normalized() if abs(d_foot.z) < 0.95 else (n_leg if n_leg is not None else V((1, 0, 0)))
            R['foot_' + s] = swing_twist(rig.rest3['foot_' + s], d_foot, n_f, 1.0, n_rest=V((1, 0, 0)))
        out.append(R)
    return out


def sole_low(rig, desired, flag):
    """The lowest sole point (z) among the planted feet, or None."""
    lows = []
    for i, s in enumerate(('l', 'r')):
        if flag[i]:
            lows.append(min(p.z for p in rig.sole(desired, s)))
    return min(lows) if lows else None


def plant_point(rig, desired, s):
    sp = rig.sole(desired, s)
    return V(((sp[0].x + sp[1].x) / 2, (sp[0].y + sp[1].y) / 2, 0))


def smooth(xs, sigma):
    """A centred Gaussian over a list of floats or Vectors, in samples."""
    if sigma <= 0:
        return list(xs)
    k = int(math.ceil(3 * sigma))
    w = [math.exp(-0.5 * (i / sigma) ** 2) for i in range(-k, k + 1)]
    out = []
    n = len(xs)
    for i in range(n):
        acc, sw = None, 0.0
        for j, wj in zip(range(i - k, i + k + 1), w):
            if 0 <= j < n:
                acc = xs[j] * wj if acc is None else acc + xs[j] * wj
                sw += wj
        out.append(acc / sw)
    return out


def build_clip(arm, take, name, log=print, pin=True):
    """Makes the action `name` on `arm` from a take (a dict). Returns (action, report)."""
    rig = Rig(arm)
    n, fps = take['n'], take['fps']
    take['contact_w'] = take['contact']
    flags = take['contactFlag']
    dims = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jonas-dims.json')))
    leg = (V(arm.data.bones['thigh_l'].head_local) - V(arm.data.bones['calf_l'].head_local)).length + (V(arm.data.bones['calf_l'].head_local) - V(arm.data.bones['foot_l'].head_local)).length
    if abs(leg - dims['leg']) > 0.01:
        log('MOCAP warning: Jonas legs are %.4f m, the take was scaled to %.4f m (jonas-dims.json)' % (leg, dims['leg']))
    rots = solve_rotations(rig, take)
    pel0 = V(arm.data.bones['pelvis'].head_local)
    dt = 1.0 / fps
    # pass A: the body at the origin and at its rest height, to read where Jonas's own feet fall
    A = [rig.fk(r, V((0, 0, 0)), pel0) for r in rots]
    # the height: the lowest planted sole on the floor; in the air the take's own shape between the planted frames
    dz = [None] * n
    for f in range(n):
        low = sole_low(rig, A[f], flags[f])
        if low is not None:
            dz[f] = rig.rest_low - low
    ph = take['pelvisHeight']
    known = [i for i in range(n) if dz[i] is not None]
    if not known:
        known = None
        dz = [0.0] * n
    else:
        for f in range(n):
            if dz[f] is None:
                a = max([i for i in known if i < f], default=None)
                b = min([i for i in known if i > f], default=None)
                if a is not None and b is not None:
                    u = (f - a) / (b - a)
                    dz[f] = dz[a] + (dz[b] - dz[a]) * u + (ph[f] - (ph[a] + (ph[b] - ph[a]) * u))
                else:
                    dz[f] = dz[a if a is not None else b]
    dz_s = smooth(dz, 1.0)
    # the root: opposite to the planted soles' velocity; the take's own path where nothing is planted
    node_v = []
    for f in range(n):
        fa, fb = max(0, f - 1), min(n - 1, f + 1)
        node_v.append(V((take['root'][fb][0] - take['root'][fa][0], take['root'][fb][1] - take['root'][fa][1], 0)) / ((fb - fa) * dt))
    pts = [[plant_point(rig, A[f], 'l'), plant_point(rig, A[f], 'r')] for f in range(n)]
    vel, planted_frames = [], 0
    for f in range(n):
        fa, fb = max(0, f - 1), min(n - 1, f + 1)
        vs = [(pts[fb][i] - pts[fa][i]) / ((fb - fa) * dt) for i in (0, 1) if flags[fa][i] and flags[f][i] and flags[fb][i]]
        if vs and pin:
            planted_frames += 1
            vel.append(-sum(vs, V((0, 0, 0))) / len(vs))
        else:
            vel.append(node_v[f])
    vel = smooth(vel, 1.0)
    root = [V((0, 0, 0))]
    for f in range(1, n):
        root.append(root[-1] + (vel[f] + vel[f - 1]) * 0.5 * dt)
    # pass B: the final place of the body
    B = [rig.fk(rots[f], root[f], pel0 + root[f] + V((0, 0, dz_s[f]))) for f in range(n)]
    report = measure(rig, A, B, root, take, flags, dz_s, planted_frames, dt)
    # the action
    act = bpy.data.actions.new(name)
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    mapped = ['root'] + list(rots[0].keys())
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    scene_fps = bpy.context.scene.render.fps
    prev = {}
    for f in range(n):
        fr = f * scene_fps / fps
        for bn in mapped:
            m = rig.basis(B[f], bn)
            loc, rot, _ = m.decompose()
            if bn in prev and prev[bn].dot(rot) < 0:
                rot.negate()
            prev[bn] = rot
            pb = arm.pose.bones[bn]
            if bn != 'root':
                pb.rotation_quaternion = rot
                pb.keyframe_insert('rotation_quaternion', frame=fr)
            if bn in ('root', 'pelvis'):
                pb.location = loc
                pb.keyframe_insert('location', frame=fr)
    ad.action = None
    log('MOCAP clip', name, n, 'frames', json.dumps(report))
    return act, report


def measure(rig, A, B, root, take, flags, dz, planted, dt):
    """How much a planted foot slides, with the root as the take's own (before) and as pinned on Jonas's legs (after), and how high the planted
    soles are over the floor."""
    n = take['n']

    def drift(world_pts):
        runs = []
        for i in (0, 1):
            f = 0
            while f < n:
                if not flags[f][i]:
                    f += 1
                    continue
                e = f
                while e < n and flags[e][i]:
                    e += 1
                if e - f >= 5:
                    seg = world_pts[i][f + 1:e - 1]
                    c = sum(seg, V((0, 0, 0))) / len(seg)
                    runs.append(max((p - c).length for p in seg))
                f = e
        return runs

    before = [[plant_point(rig, A[f], 'l') + V((take['root'][f][0], take['root'][f][1], 0)) for f in range(n)],
              [plant_point(rig, A[f], 'r') + V((take['root'][f][0], take['root'][f][1], 0)) for f in range(n)]]
    after = [[plant_point(rig, B[f], 'l') for f in range(n)], [plant_point(rig, B[f], 'r') for f in range(n)]]
    lows = []
    for f in range(n):
        low = sole_low(rig, B[f], flags[f])
        if low is not None:
            lows.append(low - rig.rest_low)
    rb, ra = drift(before), drift(after)
    ms = lambda xs: dict(runs=len(xs), mean_cm=round(100 * sum(xs) / len(xs), 2) if xs else None, max_cm=round(100 * max(xs), 2) if xs else None)
    travel = (root[-1] - root[0]).length
    return dict(frames=n, seconds=round(n * dt, 2), travel_m=round(travel, 2), planted_frames=planted,
                slide_before_take_root=ms(rb), slide_after_pin=ms(ra),
                planted_sole_height_cm=dict(mean=round(100 * sum(abs(x) for x in lows) / max(1, len(lows)), 2), max=round(100 * max([abs(x) for x in lows], default=0), 2)),
                pelvis_dz_cm=dict(min=round(100 * min(dz), 1), max=round(100 * max(dz), 1)))


# ---- for jonas.py ------------------------------------------------------------------------------------------------------------------------
def add_takes(arm, ad, takes_dir, log=print):
    """For every <takes_dir>/<name>.json (a take of process.mjs), makes the clip `<name>` and lays it on its own NLA track, as jonas.py does with
    the other clips. Call it after the legs have been shortened (the take was made for those legs). Returns the names."""
    names = []
    if not os.path.isdir(takes_dir):
        return names
    for fn in sorted(os.listdir(takes_dir)):
        if not fn.endswith('.json'):
            continue
        name = fn[:-5]
        take = json.load(open(os.path.join(takes_dir, fn)))
        act, rep = build_clip(arm, take, name, log)
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        st.name = name
        names.append(name)
    return names


# ---- the standalone run: a test GLB to look at -----------------------------------------------------------------------------------------------
def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            k = argv[i][2:]
            if i + 1 < len(argv) and not argv[i + 1].startswith('--'):
                opt[k] = argv[i + 1]
                i += 1
            else:
                opt[k] = True
        i += 1
    take = json.load(open(opt['take']))
    name = opt.get('name') or take.get('name', 'take')
    out = opt.get('out', '.')
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=opt['glb'])
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    act, rep = build_clip(arm, take, name, pin=not opt.get('no-pin'))
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, int(round((take['n'] - 1) * 30 / take['fps']))
    with open(os.path.join(out, name + '.report.json'), 'w') as fh:
        json.dump(rep, fh, indent=2)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.test.glb'), export_format='GLB', export_apply=False, export_skins=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_materials='EXPORT', export_image_format='NONE',
                              export_yup=True, export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False,
                              export_cameras=False, export_lights=False, export_influence_nb=4)
    print('MOCAP wrote', os.path.join(out, name + '.test.glb'))
    if opt.get('save'):
        bpy.ops.wm.save_as_mainfile(filepath=opt['save'])


if __name__ == '__main__':
    main()
