"""Jonas's ways of going over the floor, made by script from the library's clips (called by jonas.py, after the clips are in).

The library has a slow walk, a bounding jog, a sprint and a slow crouched walk, and nothing in between; it has no turn on the spot, no
start and no stop. The game used to cover the gaps by playing a clip much faster or slower than it was made, by mixing two gaits, or by
bending the legs after the feet (the person turned all three down). Here the clips the game needs are made once, offline:

  * the loops ('walk', 'brisk', 'run', 'crouch_walk') are cut to begin where the left foot comes down, their stride and their length
    in time are set to the speed the game goes at (the stride is scaled about the hips and the legs are solved again: an offline stride
    warp), and the foot that carries him is pinned: it goes back under him in a straight line at the clip's own speed, so in the game,
    where the clip is stepped by the ground covered, it stays where it came down with no leg bent after it;
  * 'walk_start', 'crouch_start': from standing into the loop, along the way the game's controller speeds him up, the feet kept where
    they are put in the world;
  * 'walk_stop_0..3', 'crouch_stop_0..3': out of the loop at each quarter of its cycle (the game takes the nearest), down to standing,
    with the last step shortened and the other foot brought beside it;
  * 'turn_l45' ... 'turn_r180' (and 'crouch_turn_...'): a turn on the spot of that many degrees, in steps (two up to a square turn, four
    beyond), the head and the chest a little ahead of the hips.

  * 'jog' (the run with half its stride, for 3.2 m/s) and the loops of the stairs ('stairs_up_run', 'stairs_up_walk', 'stairs_down_run',
    'stairs_down_walk'), made on the flat with a stair's step: the game puts each foot on its own tread.

Every one of them carries its own way over the floor in the `root` bone (root motion): the metres it goes forward and the turn it
makes, frame by frame. The game does not play that track (it moves the root itself); it reads it, to know the stride of a loop and to
find the moment of a start, a stop or a turn by the ground covered or the angle turned.

The strides come from the library's root-motion files (UAL1_Standard_RM.glb): the metres the root goes in a cycle, times the legs'
shortening. Everything is deterministic. Armature space: z up, he faces -y, his left is +x; a turn to his left is positive about z."""
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

V = Vector
FPS = 30
FINGER = ('index', 'middle', 'ring', 'pinky', 'thumb')
UAL1_RM = 'quaternius-ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb'
RM_NAMES = {'walk': 'Walk_Loop', 'run': 'Jog_Fwd_Loop', 'crouch_walk': 'Crouch_Fwd_Loop'}

# The game's speeds (m/s; src/systems/player.js has the same numbers) and how the controller gets to them and back (m/s2).
WALK, RUN, CROUCH, STROLL, JOG = 1.55, 4.8, 1.0, 1.1, 3.2
ACCEL, DECEL = 5.0, 3.75
# The loops: name -> (source clip, frames at 30 a second, stride as a share of the source's, more swing of the arms, lean forward in radians)
LOOPS = {
    'walk': ('walk', 32, 1.0, 1.0, 0.0),               # the library's walk as the game always played it: 1.1 m/s (the stick part of the way)
    'brisk': ('walk', 27, None, 1.3, 0.05),            # the stick all the way: the same walk with a longer stride and a quicker step
    'run': ('run', 28, 1.0, 1.0, 0.0),                 # the library's jog at the length in time it was made with: 4.8 m/s
    'jog': ('run', 22, None, 0.9, -0.03),              # between the two (a breathless run indoors, the chase's 3.2 m/s): the same run with half its stride
    'crouch_walk': ('crouch_walk', 42, None, 1.0, 0.0),
}
SPEED = {'walk': STROLL, 'brisk': WALK, 'run': RUN, 'jog': JOG, 'crouch_walk': CROUCH}
# On stairs: name -> (source clip, frames, metres a cycle, more swing of the arms, lean forward in radians, how much of the hips' bounce stays).
# A step takes one tread, running as walking (the person's decision of 2026-11-23: "um por degrau"), of a stair with treads 0.30 m deep:
# the game steps these by the treads he covers and puts each foot at the height of its own tread (src/models/plant.js: the ground under
# each foot), so the clips are made on the flat. All four come from the walk: on a stair a foot is always down, running too (made from the
# library's run, which flies between two steps, he bounded half a metre over the treads without touching them). The run is the same short
# step taken nearly twice as fast (some 4.4 steps a second), the trunk into the climb and the arms pumping; the walk is upright.
# (The names say what he does, not where the motion came from: a take of motion capture may replace any of them under the same name.)
STAIRS = {
    'stairs_up_run': ('walk', 14, 0.6, 1.7, 0.22, 0.8),
    'stairs_up_walk': ('walk', 24, 0.6, 0.9, 0.09, 0.6),
    'stairs_down_run': ('walk', 14, 0.6, 1.4, 0.04, 0.8),
    'stairs_down_walk': ('walk', 24, 0.6, 0.8, 0.0, 0.6),
}
TURNS = (45, 90, 135, 180)
# keys kept in the file, by clip (common.shrink_glb: 1 is every frame): the loops, the starts and the stops keep them all, for the feet
KEY_STEPS = {**{n: 1 for n in LOOPS}, **{n: 1 for n in STAIRS}, **{f'{p}_start': 1 for p in ('walk', 'crouch')}, **{f'{p}_stop_{j}': 1 for p in ('walk', 'crouch') for j in range(4)}}


def turn_time(a):
    """Seconds a turn on the spot of `a` radians takes (src/systems/turn.js has the same)."""
    return 0.24 + 0.2 * abs(a)


def turn_ease(k):
    """How much of the turn is made at the share `k` of its time (the same curve in src/systems/turn.js)."""
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, k)))


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.order = []

        def walk(b):
            self.order.append(b.name)
            for c in b.children:
                walk(c)
        for b in arm.data.bones:
            if b.parent is None:
                walk(b)
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.rel = {n: (self.rest[self.parent[n]].inverted() @ self.rest[n] if self.parent[n] else self.rest[n].copy()) for n in self.order}
        self.pel_inv = self.rest['pelvis'].to_3x3().inverted()

    def fk(self, pose):
        """Armature-space matrices of every bone for a pose ({bone: basis quaternion}, pelvis basis location)."""
        rot, loc = pose
        M = {}
        for n in self.order:
            base = M[self.parent[n]] @ self.rel[n] if self.parent[n] else self.rel[n]
            b = rot[n].to_matrix().to_4x4() if n in rot else Matrix.Identity(4)
            if n == 'pelvis':
                b = Matrix.Translation(loc) @ b
            M[n] = base @ b
        return M

    def set_world_rot(self, pose, M, name, R3):
        """Gives a bone an armature-space orientation (its head stays where its parent puts it); M is updated for it alone."""
        p = self.parent[name]
        base = M[p] @ self.rel[name]
        pose[0][name] = (base.to_3x3().inverted() @ R3).to_quaternion()
        M[name] = Matrix.Translation(base.translation) @ R3.to_4x4()

    def feet(self, M):
        return {s: (M[f'foot_{s}'].translation.copy(), M[f'ball_{s}'].translation.copy(), M[f'foot_{s}'].to_3x3()) for s in 'lr'}

    def leg(self, pose, M, s, ankle, footR):
        """The two bones of a leg bent so that the ankle is at `ankle` (armature space), the foot turned as `footR`; the knee keeps the side it bends to."""
        th, ca, fo = f'thigh_{s}', f'calf_{s}', f'foot_{s}'
        H, K, A = M[th].translation.copy(), M[ca].translation.copy(), M[fo].translation.copy()
        l1, l2 = (K - H).length, (A - K).length
        d = ankle - H
        dist = max(abs(l1 - l2) + 1e-4, min((l1 + l2) * 0.9995, d.length))
        dirn = d.normalized()
        nrm = (K - H).cross(A - H)
        if nrm.length < 1e-7:
            nrm = V((1, 0, 0))
        perp = nrm.normalized().cross(dirn)
        if perp.length < 1e-7:
            perp = V((0, -1, 0))
        perp.normalize()
        if perp.dot(K - H) < 0:
            perp = -perp
        ca_ = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
        Kn = H + dirn * (l1 * ca_) + perp * (l1 * math.sqrt(max(0.0, 1 - ca_ * ca_)))
        An = H + dirn * dist
        q1 = (K - H).rotation_difference(Kn - H)
        self.set_world_rot(pose, M, th, q1.to_matrix() @ M[th].to_3x3())
        Rc = q1.to_matrix() @ M[ca].to_3x3()
        q2 = (q1 @ (A - K)).rotation_difference(An - Kn)
        base = M[th] @ self.rel[ca]
        pose[0][ca] = (base.to_3x3().inverted() @ (q2.to_matrix() @ Rc)).to_quaternion()
        M[ca] = Matrix.Translation(base.translation) @ (q2.to_matrix() @ Rc).to_4x4()
        self.set_world_rot(pose, M, fo, footR)

    def reach(self, M, s):
        return (M[f'calf_{s}'].translation - M[f'thigh_{s}'].translation).length + (M[f'foot_{s}'].translation - M[f'calf_{s}'].translation).length


def copy_pose(p):
    return ({n: q.copy() for n, q in p[0].items()}, p[1].copy())


def mix_pose(a, b, w):
    if w <= 0:
        return copy_pose(a)
    if w >= 1:
        return copy_pose(b)
    return ({n: q.slerp(b[0][n], w) for n, q in a[0].items()}, a[1].lerp(b[1], w))


def play(arm, act):
    ad = arm.animation_data
    ad.use_nla = False
    ad.action = act
    if act is not None and getattr(act, 'slots', None):
        ad.action_slot = act.slots[0]


def sample(arm, f, names):
    sc = bpy.context.scene
    f0 = math.floor(f)
    sc.frame_set(int(f0), subframe=f - f0)
    pb = arm.pose.bones
    return ({n: pb[n].rotation_quaternion.copy() for n in names}, pb['pelvis'].location.copy())


def cycle_frames(arm, act, n, names):
    """`n` poses of a looping clip, evenly over its length (the last frame of the clip is its first again)."""
    play(arm, act)
    f0, f1 = act.frame_range
    out = [sample(arm, f0 + (f1 - f0) * i / n, names) for i in range(n)]
    play(arm, None)
    arm.animation_data.use_nla = True
    return out


def rm_strides(assets, log):
    """The metres the root goes in a cycle of each of the library's gaits, read from its root-motion file."""
    before, bobj = set(bpy.data.actions), set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(assets, UAL1_RM))
    out = {}
    for a in [a for a in bpy.data.actions if a not in before]:
        base = a.name.split('.')[0]
        for game, lib in RM_NAMES.items():
            if base == lib and game not in out:
                f0, f1 = a.frame_range
                d = [0.0, 0.0, 0.0]
                for fc in a.fcurves:
                    if fc.data_path == 'pose.bones["root"].location':
                        d[fc.array_index] = fc.evaluate(f1) - fc.evaluate(f0)
                out[game] = math.sqrt(sum(x * x for x in d))
    for a in [a for a in bpy.data.actions if a not in before]:
        bpy.data.actions.remove(a)
    for o in [o for o in bpy.data.objects if o not in bobj]:
        bpy.data.objects.remove(o, do_unlink=True)
    log('root motion of the library (m a cycle)', {k: round(v, 3) for k, v in sorted(out.items())})
    return out


def runs(flags):
    """The stretches of True in a cyclic list: [(first, last)], indices going on past the end."""
    n = len(flags)
    if all(flags):
        return [(0, n - 1)]
    out, i = [], 0
    while flags[i % n]:
        i += 1
    start = i
    while i < start + n:
        if flags[i % n]:
            a = i
            while flags[(i + 1) % n]:
                i += 1
            out.append((a, i))
        i += 1
    return out


def contacts(track, n, v):
    """For each foot of a loop played in place: (first, last) frame of the stretch in which it carries him (the last may be beyond n)."""
    out = {}
    for s in 'lr':
        ank, ball = [t[s][0] for t in track], [t[s][1] for t in track]
        la, lb = min(p.z for p in ank), min(p.z for p in ball)
        down = []
        for i in range(n):
            vy = (ball[(i + 1) % n].y - ball[(i - 1) % n].y) * FPS / 2
            near = ball[i].z < lb + 0.02 or ank[i].z < la + 0.012
            down.append(near and vy > 0.25 * v)
        for i in range(n):          # a one-frame gap is not a step
            if not down[i] and down[(i - 1) % n] and down[(i + 1) % n]:
                down[i] = True
        out[s] = max(runs(down), key=lambda r: r[1] - r[0])
    # a walk never has both feet off the floor: a foot carries him until the other takes over (the library's crouched walk drags the
    # foot along the floor for a while before that: there nobody carried him, and he slid)
    for s, o in (('l', 'r'), ('r', 'l')):
        gap = (out[o][0] - out[s][1] - 1) % n
        if 0 < gap < n / 4:
            out[s] = (out[s][0], out[s][1] + gap)
    return out


def scale_turn(qm, q, k):
    d = qm.inverted() @ q
    if d.w < 0:
        d = -d
    ang = 2 * math.acos(max(-1.0, min(1.0, d.w)))
    if ang < 1e-6:
        return q.copy()
    return qm @ Quaternion(V((d.x, d.y, d.z)).normalized(), ang * k)


def mean_quat(qs):
    m = qs[0].copy()
    for _ in range(3):
        acc = [0.0, 0.0, 0.0, 0.0]
        for q in qs:
            q = q if q.dot(m) >= 0 else -q
            for j in range(4):
                acc[j] += q[j]
        m = Quaternion(acc).normalized()
    return m


def lower_hips(R, pose, targets, slack=0.985):
    """How far the hips must come down (m) for both ankles to be within reach of their legs."""
    M = R.fk(pose)
    need = 0.0
    for s in 'lr':
        H = M[f'thigh_{s}'].translation
        lim = R.reach(M, s) * slack
        a = targets[s]
        hor = math.hypot(a.x - H.x, a.y - H.y)
        if hor < lim:
            need = max(need, (H.z - a.z) - math.sqrt(lim * lim - hor * hor))
        else:
            need = max(need, H.z - a.z)
    return max(0.0, need)


def smooth_over(d, cyclic, passes=4):
    """A curve never under `d`, without its corners."""
    n, out = len(d), list(d)
    for _ in range(passes):
        nx = []
        for i in range(n):
            a = out[(i - 1) % n] if cyclic else out[max(0, i - 1)]
            b = out[(i + 1) % n] if cyclic else out[min(n - 1, i + 1)]
            nx.append(max(d[i], (a + 2 * out[i] + b) / 4))
        out = nx
    return out


def make_loop(R, src, n, stride, warp, arms, lean, log, name, bounce=1.0):
    """A loop of `n` frames from the poses `src` of a cycle: the stride scaled by `warp` about the hips, the carrying foot pinned (it goes
    back at stride / time), the hips lowered where a leg would not reach. It begins where the left foot comes down.
    Returns { frames, n, stride, speed, down: {side: [bool]}, mid (the feet's mean way back under him) }."""
    v = stride / (n / FPS)
    Ms = [R.fk(p) for p in src]
    track = [R.feet(M) for M in Ms]
    c0 = sum(t[s][0].y for t in track for s in 'lr') / (2 * n)
    for t in track:                    # the stride, longer or shorter about the hips
        for s in 'lr':
            for p in t[s][:2]:
                p.y = c0 + warp * (p.y - c0)
    st = contacts(track, n, v)
    off, worst = {}, 0.0
    for s in 'lr':
        a, b = st[s]
        idx = list(range(a, b + 1))
        yr = sum(track[i % n][s][1].y - v * j / FPS for j, i in enumerate(idx)) / len(idx)
        xr = sum(track[i % n][s][1].x for i in idx) / len(idx)
        o = [None] * n
        for j, i in enumerate(idx):
            p = track[i % n][s][1]
            o[i % n] = V((xr - p.x, yr + v * j / FPS - p.y, 0))
            worst = max(worst, o[i % n].length)
        m = n - len(idx)                                   # the frames it swings
        first, last = o[a % n], o[b % n]
        for j in range(1, m + 1):
            o[(b + j) % n] = last.lerp(first, smooth(j / (m + 1)))
        off[s] = o
    frames = []
    qm = {b: mean_quat([p[0][b] for p in src]) for b in ('upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r')}
    tg = []
    for i in range(n):
        pose = copy_pose(src[i])
        if arms != 1.0:
            for b in ('upperarm_l', 'upperarm_r'):
                pose[0][b] = scale_turn(qm[b], pose[0][b], arms)
            for b in ('lowerarm_l', 'lowerarm_r'):
                pose[0][b] = scale_turn(qm[b], pose[0][b], 1 + (arms - 1) * 0.6)
        if lean:
            M = R.fk(pose)
            R.set_world_rot(pose, M, 'spine_01', Matrix.Rotation(lean, 3, 'X') @ M['spine_01'].to_3x3())
            M = R.fk(pose)                               # the head stays up
            R.set_world_rot(pose, M, 'neck_01', Matrix.Rotation(-lean * 0.7, 3, 'X') @ M['neck_01'].to_3x3())
        frames.append(pose)
        tg.append({s: track[i][s][0] + off[s][i] for s in 'lr'})
    if bounce != 1.0:                 # the hips go up and down less (a short step does not throw him as a long one does)
        up = R.pel_inv @ V((0, 0, 1))
        mean = sum((p[1].dot(up) for p in frames)) / n
        for p in frames:
            p[1].xyz = p[1] + up * ((p[1].dot(up) - mean) * (bounce - 1))
    drop = smooth_over([lower_hips(R, frames[i], tg[i]) for i in range(n)], True)
    for i in range(n):
        pose = frames[i]
        pose[1].xyz = pose[1] + R.pel_inv @ V((0, 0, -drop[i]))
        M = R.fk(pose)
        for s in 'lr':
            R.leg(pose, M, s, tg[i][s], track[i][s][2])
    k0 = st['l'][0] % n
    frames = frames[k0:] + frames[:k0]
    down = {}
    for s in 'lr':
        a, b = st[s]
        d = [False] * n
        for i in range(a, b + 1):
            d[(i - k0) % n] = True
        down[s] = d
    log('loop', name, 'frames', n, 'stride', round(stride, 3), 'speed', round(v, 3), 'warp', round(warp, 3), 'pinned by up to', round(worst, 3),
        'hips lowered by up to', round(max(drop), 3), 'left down', [(st['l'][0] - k0) % n, (st['l'][1] - k0) % n], 'right down', [(st['r'][0] - k0) % n, (st['r'][1] - k0) % n])
    return dict(frames=frames, n=n, stride=stride, speed=v, down=down, mid=c0, name=name)


def loop_pose(L, phase):
    """The pose of a loop at a phase (cycles; any number)."""
    n = L['n']
    x = (phase % 1.0) * n
    i = int(math.floor(x)) % n
    return mix_pose(L['frames'][i], L['frames'][(i + 1) % n], x - math.floor(x))


def loop_down(L, s, phase):
    return L['down'][s][int(math.floor((phase % 1.0) * L['n'] + 1e-6)) % L['n']]


def edge(L, s, rising, after):
    """The first phase after `after` (cycles) at which a foot of a loop comes down (rising) or leaves the floor."""
    n, d = L['n'], L['down'][s]
    k = int(math.floor((after % 1.0) * n + 1e-6))
    for j in range(1, n + 1):
        a, b = d[(k + j - 1) % n], d[(k + j) % n]
        if (rising and b and not a) or (not rising and a and not b):
            return after + ((k + j) / n - (after % 1.0))
    return after + 1.0


def rotz(a):
    return Matrix.Rotation(a, 3, 'Z')


def solve(R, pose, T, feet, shift=None):
    """Puts the feet of a pose (root-relative) where the world wants them. T: (metres gone forward, yaw) of the root at this frame;
    feet: {side: (ball position in the world, yaw of the foot in the world beyond the root's, or None)}; shift: the hips moved in the world."""
    s_fwd, yaw = T[0], T[1]
    Rz = rotz(-yaw)
    M = R.fk(pose)
    F = R.feet(M)
    tg = {}
    for s in 'lr':
        ank, ball, fr = F[s]
        bw, fyaw = feet[s]
        b = Rz @ V((bw.x, bw.y + s_fwd, bw.z))            # the world's point, as the root sees it (the root has gone s_fwd along -y)
        turn = rotz((fyaw - yaw) if fyaw is not None else 0.0)
        tg[s] = (b + turn @ (ank - ball), turn @ fr)
    if shift is not None:
        pose[1].xyz = pose[1] + R.pel_inv @ (Rz @ shift)
    return tg


def finish(R, poses, tgs):
    """Lowers the hips where a leg would not reach, and bends the legs to the targets."""
    drop = smooth_over([lower_hips(R, p, {s: t[s][0] for s in 'lr'}) for p, t in zip(poses, tgs)], False)
    miss = 0.0
    for p, t, d in zip(poses, tgs, drop):
        p[1].xyz = p[1] + R.pel_inv @ V((0, 0, -d))
        M = R.fk(p)
        for s in 'lr':
            R.leg(p, M, s, t[s][0], t[s][1])
        M = R.fk(p)
        miss = max(miss, *((M[f'foot_{s}'].translation - t[s][0]).length for s in 'lr'))
    if miss > 0.004:
        print('JONAS gait: an ankle is', round(miss, 4), 'm from where it was asked', flush=True)
    return max(drop) if drop else 0.0


def world_ball(F, s, T):
    """Where the ball of a foot of a root-relative pose is in the world, the root being at T."""
    b = rotz(T[1]) @ F[s][1]
    return V((b.x, b.y - T[0], b.z))


def make_start(R, L, stand, v0, log, name):
    """From standing into the loop L: he speeds up as the controller does (ACCEL), the step quickens from 0.7 of its pace, the stride grows
    with the speed. The foot that stands further back goes first (the loop is taken up just after that foot leaves the floor in it, where
    the other one is about as far forward as it stands); the clip ends where the other foot comes down for the second time, on the loop."""
    n, Tc, tacc, rho = L['n'], L['n'] / FPS, v0 / ACCEL, 0.7
    rate = lambda t: (rho + (1 - rho) * min(1.0, t / tacc)) / Tc
    Fs = R.feet(R.fk(stand))
    first = 'l' if Fs['l'][1].y > Fs['r'][1].y else 'r'       # (+y is behind him)
    other = 'r' if first == 'l' else 'l'
    begin = edge(L, first, False, 0.0) + 0.04                 # just after it leaves the floor
    land = edge(L, first, True, begin)
    end = edge(L, other, True, land)                          # the other one down again: from there on it is the loop
    ph, N = begin, 0
    while ph < end - 1e-9:
        ph += rate((N + 0.5) / FPS) / FPS
        N += 1
    ph0 = begin - (ph - end)
    poses, info, s_fwd, ph = [], [], 0.0, ph0
    for i in range(N + 1):
        t = i / FPS
        v = min(v0, ACCEL * t)
        k = (v / v0) / (rho + (1 - rho) * min(1.0, t / tacc))
        w = smooth(t / 0.3)
        cyc = loop_pose(L, ph)
        Fc = R.feet(R.fk(cyc))
        pose = mix_pose(stand, cyc, w)
        F = R.feet(R.fk(pose))
        free = {}
        for s in 'lr':
            cb = Fc[s][1].copy()
            cb.y = L['mid'] + k * (cb.y - L['mid'])
            b = Fs[s][1].lerp(cb, w)
            b.z = Fs[s][1].z + w * (Fc[s][1].z - Fs[s][1].z) * (0.5 + 0.5 * k)
            free[s] = V((b.x, b.y - s_fwd, b.z))
        info.append(dict(pose=pose, T=(s_fwd, 0.0, ph), free=free, down={s: loop_down(L, s, ph) for s in 'lr'}))
        s_fwd += (min(v0, ACCEL * (t + 0.5 / FPS))) / FPS
        ph += rate((i + 0.5) / FPS) / FPS
    tgs = []
    for s in 'lr':
        flags = [f['down'][s] for f in info]
        flags[0] = True
        if s == first:                                         # it leaves the floor at once
            for q in range(1, len(flags)):
                if not flags[q]:
                    break
                flags[q] = False
        hold, i = None, 0
        tg = [None] * len(info)
        while i < len(info):
            if flags[i]:
                P = info[i]['free'][s]
                j = i
                while j < len(info) and flags[j]:
                    tg[j] = V((P.x, P.y, info[j]['free'][s].z))
                    j += 1
                hold, i = (P, j - 1), j
            else:
                j = i
                while j < len(info) and not flags[j]:
                    j += 1
                o = hold[0] - info[hold[1]]['free'][s]
                for q in range(i, j):
                    f = info[q]['free'][s]
                    e = 1 - smooth((q - hold[1]) / (j - hold[1]))
                    tg[q] = V((f.x + o.x * e, f.y + o.y * e, f.z))
                i = j
        for q, f in enumerate(info):
            f.setdefault('tg', {})[s] = (tg[q], None)
            f['T'] = f['T'][:3] + ((f['T'][3] if len(f['T']) > 3 else 0) + ((1 if s == 'l' else 2) if flags[q] else 0),)
    for f in info:
        poses.append(f['pose'])
        tgs.append(solve(R, f['pose'], f['T'], f['tg']))
    d = finish(R, poses, tgs)
    log('start', name, 'frames', N + 1, 'goes', round(info[-1]['T'][0], 3), 'm; first foot', first, 'from phase', round(ph0, 3), 'to', round(end, 3), 'hips lowered by up to', round(d, 3))
    return poses, [f['T'] for f in info]


def make_stop(R, L, stand, v0, entry, log, name):
    """Out of the loop L at the phase `entry`, slowing down as the controller does (DECEL), to standing. The foot in the air (or the rear
    one) is put down where he will stand (a shortened step); if the other is then too far behind, it is brought beside it."""
    n, Tc, tdec, sF = L['n'], L['n'] / FPS, v0 / DECEL, v0 * v0 / (2 * DECEL)
    Fs = R.feet(R.fk(stand))
    F0 = R.feet(R.fk(loop_pose(L, entry)))
    d0 = {s: loop_down(L, s, entry) for s in 'lr'}
    soon = {s: (edge(L, s, True, entry) - entry) if not d0[s] else 0.0 for s in 'lr'}       # cycles until a foot in the air comes down
    if d0['l'] and d0['r']:
        B = min('lr', key=lambda s: edge(L, s, False, entry))          # both down: the one that leaves first
    elif min(soon[s] for s in 'lr' if not d0[s]) < 0.1:
        B = 'l' if d0['l'] else 'r'                                    # one is just coming down: it carries him, the rear one steps
    else:
        B = 'l' if not d0['l'] else 'r'
    A = 'r' if B == 'l' else 'l'
    tA_land = soon[A] * Tc                                      # (0 if it is down already)
    t_lift = (edge(L, B, False, entry) - entry) * Tc if d0[B] else 0.0
    ph_land = edge(L, B, True, entry + (t_lift / Tc if d0[B] else 0.0))
    t_nat = (ph_land - entry) * Tc
    sAt = lambda t: v0 * t - DECEL * t * t / 2 if t < tdec else sF
    # where the carrying foot is (in the world) once it is down
    FA = R.feet(R.fk(loop_pose(L, entry + soon[A])))
    A0 = world_ball(FA, A, (sAt(tA_land), 0.0))
    fin = {s: V((Fs[s][1].x, Fs[s][1].y - sF, Fs[s][1].z)) for s in 'lr'}       # where the feet are when he stands, in the world
    offA = A0.y - fin[A].y                                      # how far behind that the carrying foot is (+: behind)
    one = abs(offA) <= 0.14
    tB = max(t_nat, t_lift + 0.26) if one else max(0.8 * t_nat, t_lift + 0.2)
    if one:
        goalB, tA0, tA1, Tend = V((fin[B].x, fin[B].y + offA, fin[B].z)), None, None, tB + 0.1
    else:
        goalB, tA0, tA1 = fin[B].copy(), tB + 0.03, tB + 0.29
        Tend = tA1 + 0.06
    N = int(math.ceil(Tend * FPS))
    info = []
    for i in range(N + 1):
        t = i / FPS
        s_fwd = sAt(t)
        ph = entry + (ph_land - entry) * min(1.0, t / tB)
        w = 0.0 if i == 0 else 1.0 if i == N else smooth((t - 0.25 * tB) / max(0.05, Tend - 0.06 - 0.25 * tB))
        pose = mix_pose(loop_pose(L, ph), stand, w)
        F = R.feet(R.fk(pose))
        T = (s_fwd, 0.0, ph)
        tg = {}
        # B: where it is at first, then to its goal
        b0 = world_ball(F0, B, (0.0, 0.0))
        fb = world_ball(F, B, T)
        if t <= t_lift:
            tg[B] = V((b0.x, b0.y, fb.z))
        elif t < tB:
            u = (t - t_lift) / (tB - t_lift)
            e = smooth(u)
            p = b0.lerp(goalB, e)
            p.z = goalB.z + (1 - e) * (fb.z - goalB.z) + 0.02 * math.sin(math.pi * u)
            tg[B] = p
        else:
            tg[B] = goalB.copy()
        fa = world_ball(F, A, T)
        if t < tA_land:
            tg[A] = fa                                           # still coming down, as the loop brings it
        elif one or t <= tA0:
            tg[A] = V((A0.x, A0.y, fin[A].z + (A0.z - fin[A].z) * (1 - smooth((t - tA_land) / 0.1))))       # (it comes down on its heel: the ball settles)
        elif t < tA1:
            u = (t - tA0) / (tA1 - tA0)
            p = A0.lerp(fin[A], smooth(u))
            p.z = fin[A].z + 0.06 * math.sin(math.pi * u)
            tg[A] = p
        else:
            tg[A] = fin[A].copy()
        info.append(dict(pose=pose, T=T, tg={s: (tg[s], None) for s in 'lr'}))
    poses = [f['pose'] for f in info]
    tgs = [solve(R, f['pose'], f['T'], f['tg']) for f in info]
    d = finish(R, poses, tgs)
    log('stop', name, 'from phase', entry, 'frames', N + 1, 'goes', round(sF, 3), 'm;', 'one step' if one else 'two steps', '(first', B + ')', 'hips lowered by up to', round(d, 3))
    return poses, [f['T'] for f in info]


def make_turn(R, stand, deg, log, name, crouched=False):
    """A turn on the spot of `deg` degrees (+ to his left), in steps: the foot of the side he turns to goes first, the other follows; two
    such pairs beyond a square turn. The feet are put where they will stand; the head and the chest go a little ahead."""
    A = math.radians(deg)
    pairs = 1 if abs(deg) <= 100 else 2
    N = int(round(turn_time(A) * FPS))
    lead, trail = ('l', 'r') if deg > 0 else ('r', 'l')
    Fs = R.feet(R.fk(stand))
    lift = (0.035 if crouched else 0.045) + 0.02 * abs(A) / pairs
    look = math.copysign(min(0.3, 0.22 * abs(A) / pairs), A)
    info = []
    for i in range(N + 1):
        k = i / N
        yaw = A * turn_ease(k)
        m = min(pairs - 1, int(k * pairs))
        u = k * pairs - m
        pose = copy_pose(stand)
        # the head, the neck and the chest lead the turn and come back to the hips as it ends
        lk = look * math.sin(math.pi * k)
        for b, share in (('spine_03', 0.25), ('neck_01', 0.25), ('Head', 0.5)):
            M = R.fk(pose)
            R.set_world_rot(pose, M, b, rotz(lk * share) @ M[b].to_3x3())
        tg, shift = {}, V((0, 0, 0))
        for s, (u0, u1) in ((lead, (0.06, 0.5)), (trail, (0.5, 0.94))):
            a0, a1 = A * m / pairs, A * (m + 1) / pairs
            uu = (u - u0) / (u1 - u0)
            ang = a0 if uu <= 0 else a1 if uu >= 1 else a0 + (a1 - a0) * smooth(uu)
            p = rotz(ang) @ Fs[s][1]
            if 0 < uu < 1:
                p.z += lift * math.sin(math.pi * uu)
                other = trail if s == lead else lead        # his weight goes over the foot that stays
                oa = (a1 if s == trail else a0)
                op = rotz(oa) @ Fs[other][0]
                side = V((op.x, op.y, 0))
                if side.length > 1e-6:
                    shift = side.normalized() * (0.028 * math.sin(math.pi * uu)) + V((0, 0, -0.01 * math.sin(math.pi * uu)))
            tg[s] = (p, ang)
        info.append(dict(pose=pose, T=(0.0, yaw, 0.0), tg=tg, shift=shift))
    poses = [f['pose'] for f in info]
    tgs = [solve(R, f['pose'], f['T'], f['tg'], f['shift']) for f in info]
    d = finish(R, poses, tgs)
    log('turn', name, 'degrees', deg, 'frames', N + 1, 'pairs of steps', pairs, 'hips lowered by up to', round(d, 3))
    return poses, [f['T'] for f in info]


def write(R, ad, name, poses, roots, keyed, log):
    """A clip of the poses (a key a frame), laid down as an NLA track of its name (in place of one already there). The `root` bone carries
    what the game reads and does not play: the metres gone forward (along -y), the turn (about z), as its height (z) the phase of the
    loop the pose belongs to (cycles: a start says where the loop takes over, a stop where it was left), and across (x) which feet carry
    him in that frame (1 the left, 2 the right, 3 both or not told: the game may hold only a foot that carries him)."""
    arm = R.arm
    for tr in list(ad.nla_tracks):
        if tr.name == name:
            ad.nla_tracks.remove(tr)
    old = bpy.data.actions.get(name)
    if old:
        old.name = name + '_src'
    act = bpy.data.actions.new(name)
    ad.use_nla = False
    ad.action = act
    pb = arm.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'
    last = {}
    for i, ((rot, loc), T) in enumerate(zip(poses, roots)):
        s_fwd, yaw, ph = T[0], T[1], T[2]
        feet = T[3] if len(T) > 3 else 3
        for n in keyed:
            q = rot[n]
            if n in last and q.dot(last[n]) < 0:
                q = -q
            last[n] = q
            pb[n].rotation_quaternion = q
            pb[n].keyframe_insert('rotation_quaternion', frame=i)
        pb['pelvis'].location = loc
        pb['pelvis'].keyframe_insert('location', frame=i)
        pb['root'].location = (float(feet), -s_fwd, ph)
        pb['root'].rotation_quaternion = Quaternion((0, 0, 1), yaw)
        pb['root'].keyframe_insert('location', frame=i)
        pb['root'].keyframe_insert('rotation_quaternion', frame=i)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    ad.action = None
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)
    ad.use_nla = True
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name


def check_loop(R, L, log):
    """How far the carrying foot of a loop strays from the straight way back (m): what is left for the game to show as a slide."""
    n, v, worst = L['n'], L['speed'], 0.0
    for s in 'lr':
        pts = [(i, R.feet(R.fk(L['frames'][i]))[s][1]) for i in range(n) if L['down'][s][i]]
        # the frames in order of the stretch (it may wrap round the end of the loop)
        idx = [i for i, _ in pts]
        k0 = next((j for j in range(len(idx)) if idx[j] - idx[j - 1] != 1 and j > 0), 0)
        seq = pts[k0:] + pts[:k0]
        base = None
        for j, (i, p) in enumerate(seq):
            y = p.y - v * j / FPS
            base = (p.x, y) if base is None else base
            worst = max(worst, math.hypot(p.x - base[0], y - base[1]))
    log('loop', L['name'], 'a foot down strays', round(worst, 4), 'm from the straight way back')
    return worst


def check_world(R, poses, roots, log, name):
    """The most a foot on the floor moves in the world over a start, a stop or a turn (m in a frame, while it is low and not being stepped)."""
    prev, worst = None, 0.0
    for p, T in zip(poses, roots):
        F = R.feet(R.fk(p))
        cur = {s: world_ball(F, s, T) for s in 'lr'}
        if prev:
            for s in 'lr':
                if cur[s].z < 0.03 and prev[s].z < 0.03:
                    worst = max(worst, math.hypot(cur[s].x - prev[s].x, cur[s].y - prev[s].y))
        prev = cur
    log('feet', name, 'a low foot moves at most', round(worst, 4), 'm a frame')
    return worst


def build(arm, ad, assets, stand_extra, leg_k, log):
    """Makes the clips (see the head of this file). stand_extra: {bone: quaternion} turned on top of the idle's first frame to stand as the
    game stands him (jonas.py's 'stance'); leg_k: how much shorter his legs are than the library's body. Returns the names of the clips written."""
    R = Rig(arm)
    src_act = {n: bpy.data.actions[n] for n in ('idle', 'walk', 'run', 'crouch_idle', 'crouch_walk')}
    keyed = sorted({fc.data_path.split('"')[1] for fc in src_act['walk'].fcurves if fc.data_path.endswith('rotation_quaternion')} - {'root'})
    keyed = [n for n in R.order if n in keyed and not n.startswith(FINGER)]
    names = [n for n in R.order]
    rm = rm_strides(assets, log)
    cyc = {n: cycle_frames(arm, src_act[n], int(round(src_act[n].frame_range[1] - src_act[n].frame_range[0])), names) for n in ('walk', 'run', 'crouch_walk')}
    play(arm, src_act['idle'])
    stand = sample(arm, src_act['idle'].frame_range[0], names)
    play(arm, src_act['crouch_idle'])
    squat = sample(arm, src_act['crouch_idle'].frame_range[0], names)
    play(arm, None)
    ad.use_nla = True
    for b, q in stand_extra.items():
        stand[0][b] = stand[0][b] @ q
    loops, written = {}, []
    for name, (src, n, share, arms, lean) in LOOPS.items():
        base = rm[src] * leg_k
        stride = SPEED[name] * n / FPS if share is None else base * share
        # the source cycle resampled to n frames
        m = len(cyc[src])
        frames = [mix_pose(cyc[src][int(math.floor(i * m / n)) % m], cyc[src][(int(math.floor(i * m / n)) + 1) % m], i * m / n - math.floor(i * m / n)) for i in range(n)]
        L = make_loop(R, frames, n, stride, stride / base, arms, lean, log, name)
        check_loop(R, L, log)
        loops[name] = L
        write(R, ad, name, L['frames'] + [L['frames'][0]], [(L['stride'] * i / n, 0.0, i / n, (1 if L['down']['l'][i % n] else 0) + (2 if L['down']['r'][i % n] else 0)) for i in range(n + 1)], keyed, log)
        written.append(name)
    for name, (src, n, stride, arms, lean, bounce) in STAIRS.items():
        base = rm[src] * leg_k
        m = len(cyc[src])
        frames = [mix_pose(cyc[src][int(math.floor(i * m / n)) % m], cyc[src][(int(math.floor(i * m / n)) + 1) % m], i * m / n - math.floor(i * m / n)) for i in range(n)]
        L = make_loop(R, frames, n, stride, stride / base, arms, lean, log, name, bounce)
        check_loop(R, L, log)
        write(R, ad, name, L['frames'] + [L['frames'][0]], [(L['stride'] * i / n, 0.0, i / n, (1 if L['down']['l'][i % n] else 0) + (2 if L['down']['r'][i % n] else 0)) for i in range(n + 1)], keyed, log)
        written.append(name)
    for pre, L, base, v0, crouched in (('walk', loops['brisk'], stand, WALK, False), ('crouch', loops['crouch_walk'], squat, CROUCH, True)):
        poses, roots = make_start(R, L, base, v0, log, f'{pre}_start')
        check_world(R, poses, roots, log, f'{pre}_start')
        write(R, ad, f'{pre}_start', poses, roots, keyed, log)
        written.append(f'{pre}_start')
        for j in range(4):
            poses, roots = make_stop(R, L, base, v0, j / 4, log, f'{pre}_stop_{j}')
            check_world(R, poses, roots, log, f'{pre}_stop_{j}')
            write(R, ad, f'{pre}_stop_{j}', poses, roots, keyed, log)
            written.append(f'{pre}_stop_{j}')
        for deg in TURNS:
            for sgn, side in ((1, 'l'), (-1, 'r')):
                nm = ('crouch_' if crouched else '') + f'turn_{side}{deg}'
                poses, roots = make_turn(R, base, sgn * deg, log, nm, crouched)
                write(R, ad, nm, poses, roots, keyed, log)
                written.append(nm)
    return written
