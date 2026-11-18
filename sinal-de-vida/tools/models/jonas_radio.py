"""Jonas at the station radio, with the notebook and with his pocket: the clips in which his hands go to things, and the two sockets
his hands hold things by. Used by jonas.py (add_sockets before the animations, build_clips after them).

Everything is solved here, in plain numbers: the skeleton's pose is computed bone by bone (Rig.fk), each arm is put on its target by a
two-bone solution (the elbow on the side a pole gives), the hand takes the orientation asked for, and the point of the hand that has
to arrive (the tip of the index, or the socket in the palm) is brought to the target exactly. The targets at the radio are the places
of radio_layout.py, with the radio standing RADIO_AT in front of him.

His space is the model's (Blender): metres, z up, he faces -y, +x is his left.

Clips written (30 frames a second):
  whole body, seated:  radio_pegar_mic, radio_esperar (loops), radio_falar (loops), radio_pendurar
  left arm only:       radio_seletor, radio_seletor_menos; radio_tecla_a..d (the keys at the four corners: 1, 3, *, #) and
                       radio_cor_a..c (the first, the middle and the last colour button): the game mixes them for the one asked for
  from the chest up:   caderno_pegar, caderno_folhear, bolso_abrir (standing or seated: the game lays them over either)
"""
import math
import re

import bpy
from mathutils import Matrix, Quaternion, Vector

import radio_layout as L

V = Vector
FPS = 30
X, Y, Z = V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))
RADIO_AT = V((0.10, -0.42, 0.79))        # the radio's origin in his space: on the bench in front of him, a hand to his left
MARKS = {
    'radio_pegar_mic': dict(dur=1.6, grab=0.62),
    'radio_esperar': dict(dur=3.0), 'radio_falar': dict(dur=2.4),
    'radio_pendurar': dict(dur=1.5, release=0.82),
    'radio_seletor': dict(dur=1.0, grip=0.36, click=0.48, out=0.62),
    'radio_tecla': dict(dur=0.7, hover=0.24, press=0.31, up=0.46),
    'radio_cor': dict(dur=0.7, hover=0.24, press=0.31, up=0.46),
    'caderno_pegar': dict(dur=1.4, take=0.5, open=0.95),
    'caderno_folhear': dict(dur=1.2, start=0.25, end=0.8),
    'bolso_abrir': dict(dur=1.3, take=0.5, show=1.0),
}
KEY_STEPS = {'radio_esperar': 5, 'radio_falar': 3}      # the two slow loops keep fewer keys in the file (see common.shrink_glb)
KEY_CORNERS = {'a': 0, 'b': 2, 'c': 9, 'd': 11}
COLOR_STOPS = {'a': 0, 'b': 2, 'c': 4}
FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')
LARM = re.compile(r'^(clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)\w*_l$')
UPPER = re.compile(r'^(spine_02|spine_03|neck_01|Head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)')


def radio_pt(p):
    """A point of the radio's space in his: the radio is turned to face him."""
    return V((RADIO_AT.x - p[0], RADIO_AT.y - p[1], RADIO_AT.z + p[2]))


def radio_dir(d):
    return V((-d[0], -d[1], d[2]))


def on_panel(u, v, n=0.0):
    return radio_pt(L.panel(u, v, n))


N_J, V_J, U_J = radio_dir(L.AX_N), radio_dir(L.AX_V), radio_dir(L.AX_U)


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


# ----------------------------------------------------------------------------------------------------------------
# the arms' bones, and the sockets

def fit_arms(arm):
    """jonas.py widens the trunk by scaling x between the waist and the neck, and with the arms out to the sides that takes the arms'
    skin with it (8.5% at their height): the skin's elbow, wrist and knuckles then lie beyond the bones' (the fingertips by 7 cm), and
    a finger that curls folds in the wrong place. The arms' bones take the same scaling here, so that every joint is inside the skin's
    own. Called at the very end of the modelling: nothing before it sees the change, and the model at rest is the same."""
    def k(z):
        s1 = max(0.0, min(1.0, (z - 0.95) / (1.12 - 0.95)))
        s2 = max(0.0, min(1.0, (z - 1.4) / (1.5 - 1.4)))
        return 1 + 0.085 * (s1 * s1 * (3 - 2 * s1)) * (1 - 0.35 * (s2 * s2 * (3 - 2 * s2)))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        if not re.match(r'^(clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)', b.name):
            continue
        zax = b.z_axis.copy()
        b.use_connect = False
        b.head.x *= k(b.head.z)
        b.tail.x *= k(b.tail.z)
        b.align_roll(zax)
    bpy.ops.object.mode_set(mode='OBJECT')


def add_twist(arm):
    """A bone along the lower half of each forearm, lowerarm_twist_l and _r, that turns about the forearm's own length: the skin of
    the forearm goes over to it little by little from below the elbow to the wrist, so that when the hand turns over the turn is
    spread along the forearm instead of wringing the wrist. The clips of the libraries do not move it (it stays as the forearm is)."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    segs = {}
    for side in ('l', 'r'):
        lo, hand = eb['lowerarm_' + side], eb['hand_' + side]
        b = eb.new('lowerarm_twist_' + side)
        b.head = lo.head + (hand.head - lo.head) * 0.5
        b.tail = hand.head.copy()
        b.align_roll(lo.z_axis)
        b.parent = lo
        b.use_deform = True
        segs[side] = (lo.head.copy(), hand.head.copy())
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for side in ('l', 'r'):
            g = ob.vertex_groups.get('lowerarm_' + side)
            if not g:
                continue
            a, b = segs[side]
            tw = ob.vertex_groups.get('lowerarm_twist_' + side) or ob.vertex_groups.new(name='lowerarm_twist_' + side)
            for v in ob.data.vertices:
                w = next((x.weight for x in v.groups if x.group == g.index), 0.0)
                if w <= 0:
                    continue
                t = (v.co - a).dot(b - a) / (b - a).length_squared
                k = smooth((t - 0.3) / 0.6)
                if k > 0.01:
                    g.add([v.index], w * (1 - k), 'REPLACE')
                    tw.add([v.index], w * k, 'REPLACE')


def add_sockets(arm):
    """Two bones without skin, one in each palm: what the hand holds is put on it as it is (grip_r the microphone, grip_l the
    notebook). In the exported file the socket's x runs across the palm toward the wrist on the right hand and toward the fingers on
    the left (the same way in the world, with the arms out), y toward the thumb, z out of the palm."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for side in ('l', 'r'):
        hand, mid = eb['hand_' + side], eb['middle_01_' + side]
        b = eb.new('grip_' + side)
        c = hand.head + (mid.head - hand.head) * 0.62 + V((0, 0, -0.029))
        b.head = c
        b.tail = c + V((0, -0.03, 0))
        b.align_roll(V((0, 0, -1)))
        b.parent = hand
        b.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')


# ----------------------------------------------------------------------------------------------------------------
# the skeleton in numbers

class Rig:
    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.names = [b.name for b in bones]
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.rel = {n: (self.rest[p].inverted() @ self.rest[n] if p else self.rest[n].copy()) for n, p in self.parent.items()}
        self.order = []
        seen = set()

        def visit(n):
            if n in seen:
                return
            if self.parent[n]:
                visit(self.parent[n])
            seen.add(n)
            self.order.append(n)
        for n in self.names:
            visit(n)
        self.curl = {}
        for side in ('l', 'r'):
            for f in FINGERS:
                for k in (1, 2, 3):
                    name = '%s_0%d_%s' % (f, k, side)
                    self.curl[name] = self._axis(name, V((0, 1, -0.45)) if f == 'thumb' else V((0, 0, -1)))
        # the side-to-side axis of each finger's first bone, signed so that a positive turn brings the finger toward the middle one
        self.close = {}
        for side in ('l', 'r'):
            mid = self.rest['middle_01_' + side].translation
            for f in ('index', 'ring', 'pinky'):
                name = '%s_01_%s' % (f, side)
                R = self.rest[name].to_3x3()
                axis = Z if self.curl[name][0].x else X
                d = (R @ Matrix.Rotation(0.3, 3, axis) @ Y) - (R @ Y)
                self.close[name] = (axis.copy(), 1 if d.dot(mid - self.rest[name].translation) > 0 else -1)

    def _axis(self, bone, target):
        R = self.rest[bone].to_3x3()
        d0 = R @ Y
        best, bs = None, -1e9
        for axis in (X, Z):
            for sgn in (1, -1):
                d = R @ Matrix.Rotation(sgn * 0.4, 3, axis) @ Y
                s = (d - d0).dot(target)
                if s > bs:
                    best, bs = (axis.copy(), sgn), s
        return best

    def fk(self, pose):
        M = {}
        q, loc = pose['q'], pose['loc']
        for n in self.order:
            p = self.parent[n]
            m = M[p] @ self.rel[n] if p else self.rest[n].copy()
            if n in loc:
                m = m @ Matrix.Translation(loc[n])
            if n in q:
                m = m @ q[n].to_matrix().to_4x4()
            M[n] = m
        return M

    def set_world(self, pose, bone, R, M=None):
        """Gives a bone the orientation R (3x3, in his space)."""
        M = M or self.fk(pose)
        p = self.parent[bone]
        Rp = (M[p] @ self.rel[bone]).to_3x3() if p else self.rest[bone].to_3x3()
        pose['q'][bone] = (Rp.inverted() @ R).to_quaternion()

    def turn(self, pose, bone, axis, ang):
        """Turns a bone about an axis of his space, on top of what it has."""
        M = self.fk(pose)
        self.set_world(pose, bone, Matrix.Rotation(ang, 3, axis) @ M[bone].to_3x3(), M)

    def fingers(self, pose, side, spec):
        for f, angs in zip(FINGERS, spec):
            for k, a in zip((1, 2, 3), angs):
                name = '%s_0%d_%s' % (f, k, side)
                axis, sgn = self.curl[name]
                pose['q'][name] = Quaternion(axis, sgn * a)
        close = spec[5][0] if len(spec) > 5 else 0.0          # the fingers side by side instead of fanned
        for f, k in (('index', 0.8), ('ring', 0.7), ('pinky', 1.5)):
            name = '%s_01_%s' % (f, side)
            axis, sgn = self.close[name]
            pose['q'][name] = Quaternion(axis, sgn * close * k) @ pose['q'][name]

    def from_action(self, name, frame):
        """The pose a clip has at a frame."""
        act = bpy.data.actions[name]
        q, loc = {}, {}
        pat = re.compile(r'pose\.bones\["([^"]+)"\]\.(\w+)')
        for fc in act.fcurves:
            m = pat.match(fc.data_path)
            if not m or m.group(1) not in self.parent:
                continue
            b, prop = m.groups()
            if prop == 'rotation_quaternion':
                q.setdefault(b, [1.0, 0.0, 0.0, 0.0])[fc.array_index] = fc.evaluate(frame)
            elif prop == 'location':
                loc.setdefault(b, [0.0, 0.0, 0.0])[fc.array_index] = fc.evaluate(frame)
        return {'q': {b: Quaternion(v).normalized() for b, v in q.items()}, 'loc': {b: V(v) for b, v in loc.items()}}


def copy_pose(p):
    return {'q': {k: v.copy() for k, v in p['q'].items()}, 'loc': {k: v.copy() for k, v in p['loc'].items()}}


def frame3(x, y):
    """A rotation whose columns are x, y and x cross y (x and y at right angles)."""
    z = x.cross(y)
    m = Matrix.Identity(3)
    m.col[0], m.col[1], m.col[2] = x, y, z
    return m


def hand_rot(side, palm, thumb):
    """The hand's orientation from where the palm faces and where the thumb points (its fingers then lie across both)."""
    p = palm.normalized()
    t = (thumb - p * thumb.dot(p)).normalized()
    x = p if side == 'l' else -p
    return frame3(x, t.cross(x))


def hand_rot_f(side, fingers, palm):
    """The hand's orientation from where its fingers point and where the palm faces."""
    f = fingers.normalized()
    p = (palm - f * palm.dot(f)).normalized()
    x = p if side == 'l' else -p
    return frame3(x, f)


def solve_arm(rig, pose, side, wrist, R, pole):
    """Puts the wrist at `wrist` with the hand turned to R; the elbow goes to the side `pole` points. Returns how far the wrist fell
    short (0 when it reaches)."""
    up, lo, hd = 'upperarm_' + side, 'lowerarm_' + side, 'hand_' + side
    M = rig.fk(pose)
    S = (M[rig.parent[up]] @ rig.rel[up]).translation
    l1 = (rig.rest[lo].translation - rig.rest[up].translation).length
    l2 = (rig.rest[hd].translation - rig.rest[lo].translation).length
    d = wrist - S
    want = d.length
    dist = max(abs(l1 - l2) + 1e-4, min(l1 + l2 - 1.5e-3, want))
    dn = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    pp = pole - dn * pole.dot(dn)
    pp = pp.normalized() if pp.length > 1e-6 else dn.orthogonal().normalized()
    E = S + dn * a + pp * h
    y1, y2 = (E - S).normalized(), (S + dn * dist - E).normalized()
    hinge = y1.cross(y2)
    hinge = hinge.normalized() if hinge.length > 1e-6 else pp.cross(dn).normalized()
    rig.set_world(pose, up, frame3(hinge, y1), M)
    R2 = frame3(hinge, y2)
    # the hand's turn about the forearm's length is shared out: a little at the elbow, most of it along the forearm (the twist bone
    # carries the skin of its lower half), the rest at the wrist
    qr = (R2.inverted() @ R).to_quaternion()
    tw = 2 * math.atan2(qr.y, qr.w)
    tw = (tw + math.pi) % (2 * math.pi) - math.pi
    R2 = R2 @ Matrix.Rotation(tw * 0.15, 3, 'Y')
    M = rig.fk(pose)
    rig.set_world(pose, lo, R2, M)
    twist = 'lowerarm_twist_' + side
    if twist in rig.parent:
        pose['q'][twist] = Quaternion(Y, tw * 0.6)
    M = rig.fk(pose)
    rig.set_world(pose, hd, R, M)
    return want - dist


def wrist_bend(rig, pose, side):
    """How far the hand is bent at the wrist from the line of the forearm (radians)."""
    M = rig.fk(pose)
    return (M['lowerarm_' + side].to_3x3() @ Y).angle(M['hand_' + side].to_3x3() @ Y)


WRIST = math.radians(27.0)           # the most a held pose bends the wrist


ANCHOR = {'tip': 'index_04_leaf_%s', 'grip': 'grip_%s', 'wrist': 'hand_%s', 'thumb': 'thumb_04_leaf_%s', 'middle': 'middle_04_leaf_%s'}


def resolve(rig, base, side, key):
    """A key of a hand (where a point of it must be, how the hand is turned, how its fingers are) as the wrist's place: so that keys
    that hold the hand by different points can follow one another. A hand asked to bend more than WRIST from the forearm is turned
    back into line about the point it is held by: the point stays where it was asked, the hand comes round to the arm."""
    R = key['R'].copy()
    anchor = ANCHOR[key.get('anchor', 'grip')] % side
    hd, lo = 'hand_' + side, 'lowerarm_' + side
    pole = key.get('pole', POLE[side])
    limit = key.get('wrist', WRIST)
    for _ in range(6):
        pose = copy_pose(base)
        rig.fingers(pose, side, key['fingers'])
        rig.set_world(pose, hd, R)
        M = rig.fk(pose)
        off = M[anchor].translation - M[hd].translation    # the hand's turn is given, so this does not depend on the arm
        w = key['at'] - off
        solve_arm(rig, pose, side, w, R, pole)
        M = rig.fk(pose)
        arm_dir, fingers_dir = M[lo].to_3x3() @ Y, R @ Y
        bend = arm_dir.angle(fingers_dir)
        if bend <= limit + 0.01:
            break
        R = Matrix.Rotation((bend - limit) * 0.8, 3, fingers_dir.cross(arm_dir).normalized()) @ R
    return {'w': w, 'R': R.to_quaternion(), 'fingers': [list(a) for a in key['fingers']], 'pole': pole.copy(), 'bend': bend}


def held(rig, pose, side, fingers=None):
    """The key of a hand as a pose already has it (the wrist where it is)."""
    M = rig.fk(pose)
    spec = fingers
    return {'w': M['hand_' + side].translation.copy(), 'R': M['hand_' + side].to_3x3().to_quaternion(), 'fingers': [list(a) for a in (spec or RELAX)],
            'pole': (M['lowerarm_' + side].translation - (M['upperarm_' + side].translation + M['hand_' + side].translation) / 2).normalized()}


def mix_hand(a, b, u, lift=0.0):
    w = a['w'].lerp(b['w'], u)
    w.z += lift * math.sin(math.pi * u)
    return {'w': w, 'R': a['R'].slerp(b['R'], u), 'pole': a['pole'].lerp(b['pole'], u),
            'fingers': [[x + (y - x) * u for x, y in zip(fa, fb)] for fa, fb in zip(pad(a['fingers']), pad(b['fingers']))]}


def pad(f):
    return f if len(f) > 5 else list(f) + [[0.0]]


def track(keys):
    """keys: [(seconds, hand key, lift of the way to it)] -> a function of the time."""
    def at(t):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, k0, *_), (t1, k1, *rest) in zip(keys, keys[1:]):
            if t <= t1:
                return mix_hand(k0, k1, smooth((t - t0) / (t1 - t0)), rest[0] if rest else 0.0)
        return keys[-1][1]
    return at


def curve(keys):
    """keys: [(seconds, number)] -> a function of the time, eased between the keys."""
    def at(t):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t <= t1:
                return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0))
        return keys[-1][1]
    return at


def moved(key, d, fingers=None, turn=None):
    """A resolved key shifted by d (and, if given, with other fingers or turned about an axis through `turn` = (point, axis, angle))."""
    k = {'w': key['w'] + d, 'R': key['R'].copy(), 'pole': key['pole'].copy(), 'fingers': [list(a) for a in (fingers or key['fingers'])]}
    if fingers and len(key['fingers']) > 5 and len(k['fingers']) < 6:
        k['fingers'].append(list(key['fingers'][5]))
    if turn:
        c, axis, ang = turn
        q = Quaternion(axis, ang)
        k['w'] = c + q @ (k['w'] - c)
        k['R'] = q @ k['R']
    return k


# the fingers: (index, middle, ring, pinky, thumb), three joints each, radians of curl
def fing(i, m, r, p, t, close=0.0):
    return (i, m, r, p, t, (close,))


RELAX = fing((0.30, 0.45, 0.30), (0.34, 0.5, 0.32), (0.38, 0.52, 0.34), (0.42, 0.55, 0.36), (0.15, 0.2, 0.2))
FLAT = fing((0.10, 0.16, 0.10), (0.10, 0.16, 0.10), (0.12, 0.18, 0.12), (0.16, 0.2, 0.14), (0.08, 0.1, 0.1))
GRIP = fing((0.62, 1.25, 0.85), (0.66, 1.3, 0.9), (0.72, 1.3, 0.9), (0.8, 1.3, 0.9), (0.62, 0.42, 0.5), 0.13)
GRIP_OPEN = fing((0.3, 0.55, 0.35), (0.32, 0.58, 0.38), (0.35, 0.6, 0.4), (0.4, 0.6, 0.4), (0.1, 0.1, 0.1), 0.08)
PTT = fing((0.72, 1.36, 0.95), (0.76, 1.4, 1.0), (0.74, 1.32, 0.92), (0.8, 1.3, 0.9), (0.66, 0.45, 0.55), 0.13)
POINT = fing((0.12, 0.14, 0.08), (1.15, 1.45, 0.95), (1.25, 1.5, 1.0), (1.3, 1.5, 1.0), (0.6, 0.45, 0.55), 0.08)
KNOB = fing((0.42, 0.62, 0.42), (0.4, 0.6, 0.4), (0.62, 0.9, 0.6), (0.9, 1.1, 0.7), (0.28, 0.3, 0.35), 0.05)
KNOB_OPEN = fing((0.25, 0.4, 0.28), (0.24, 0.38, 0.26), (0.45, 0.65, 0.4), (0.7, 0.8, 0.5), (0.08, 0.1, 0.15), 0.03)
CUP = fing((0.22, 0.3, 0.2), (0.24, 0.32, 0.2), (0.28, 0.34, 0.22), (0.34, 0.38, 0.24), (0.1, 0.15, 0.1))
BOOK = fing((0.12, 0.18, 0.12), (0.14, 0.2, 0.14), (0.18, 0.24, 0.16), (0.24, 0.3, 0.2), (0.3, 0.2, 0.15))
BOOK_SHUT = fing((0.7, 0.75, 0.4), (0.72, 0.78, 0.42), (0.75, 0.8, 0.45), (0.8, 0.82, 0.45), (0.35, 0.3, 0.3))
PINCH = fing((0.5, 0.65, 0.4), (0.65, 0.8, 0.5), (1.0, 1.1, 0.7), (1.1, 1.15, 0.7), (0.5, 0.35, 0.3))
POCKET = fing((0.3, 0.35, 0.25), (0.3, 0.35, 0.25), (0.32, 0.38, 0.25), (0.36, 0.4, 0.26), (0.35, 0.3, 0.25))
POLE = {'l': V((0.9, 0.35, -0.6)), 'r': V((-0.9, 0.35, -0.6))}
ARM = {s: ['clavicle_' + s, 'upperarm_' + s, 'lowerarm_' + s, 'lowerarm_twist_' + s, 'hand_' + s] + ['%s_0%d_%s' % (f, k, s) for f in FINGERS for k in (1, 2, 3)] for s in ('l', 'r')}


# ----------------------------------------------------------------------------------------------------------------
# writing a clip

def write_clip(arm, ad, name, dur, pose_at, bones, log=None):
    """A clip of dur seconds: pose_at(t) gives the pose, of which the bones named are keyed at every frame."""
    act = bpy.data.actions.new(name)
    ad.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    n = int(round(dur * FPS))
    last = {}
    for fr in range(n + 1):
        pose = pose_at(fr / FPS)
        for b in bones:
            pb = arm.pose.bones[b]
            q = pose['q'].get(b, Quaternion())
            if b in last and last[b].dot(q) < 0:
                q = -q
            last[b] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=fr)
            if b in pose['loc']:
                pb.location = pose['loc'][b]
                pb.keyframe_insert('location', frame=fr)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    ad.action = None
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    if log:
        log('clip', name, n, 'frames,', len(bones), 'bones')
    return act


def look_at(rig, pose, target, amount=1.0, up=Z):
    """Turns the head so that the face looks at a point (its z is the face's front, its y the crown)."""
    M = rig.fk(pose)
    h = M['Head']
    d = (target - (h.translation + h.to_3x3() @ V((0, 0.07, 0)))).normalized()
    cur = h.to_3x3() @ Z
    z = cur.lerp(d, amount).normalized()
    x = up.cross(z).normalized()
    rig.set_world(pose, 'Head', frame3(x, z.cross(x)), M)


def lean(rig, pose, fwd=0.0, twist=0.0, side=0.0):
    for b, k in (('spine_01', 0.3), ('spine_02', 0.35), ('spine_03', 0.35)):
        if fwd:
            rig.turn(pose, b, X, fwd * k)
        if twist:
            rig.turn(pose, b, Z, twist * k)
        if side:
            rig.turn(pose, b, Y, side * k)


def build_clips(arm, ad, log=print):
    rig = Rig(arm)
    mouth_ob = bpy.data.objects.get('mouth')
    if mouth_ob:
        co = [v.co for v in mouth_ob.data.vertices]
        m0 = V((0, min(c.y for c in co) - 0.012, sum(c.z for c in co) / len(co)))
    else:
        m0 = rig.rest['Head'].translation + V((0, -0.105, 0.03))
    mouth_in_head = rig.rest['Head'].inverted() @ m0

    # ============================================================== seated at the radio
    seat0 = rig.from_action('sentar', 20)
    for b in list(seat0['q']):
        if re.match(r'^(index|middle|ring|pinky|thumb)', b):
            del seat0['q'][b]
    lean(rig, seat0, fwd=0.10)
    display = on_panel(L.DISPLAY['c'][0], L.DISPLAY['c'][1])
    bench = RADIO_AT.z

    def body(fwd=0.0, twist=0.0, breath=0.0, look=None, look_k=0.85):
        p = copy_pose(seat0)
        if fwd or twist:
            lean(rig, p, fwd=fwd, twist=twist)
        if breath:
            rig.turn(p, 'spine_03', X, -breath)
            rig.turn(p, 'neck_01', X, breath * 0.5)
        look_at(rig, p, look if look is not None else display, look_k)
        return p

    def arms(p, lh, rh):
        miss = 0.0
        for side, k in (('l', lh), ('r', rh)):
            if k is None:
                continue
            rig.fingers(p, side, k['fingers'])
            R = k['R'].to_matrix()
            miss = max(miss, solve_arm(rig, p, side, k['w'], R, k['pole']))
            bend = wrist_bend(rig, p, side)
            if bend > WRIST + 0.035:             # on the way from one key to the next: the hand comes back into line with the arm
                M = rig.fk(p)
                arm_dir, fingers_dir = M['lowerarm_' + side].to_3x3() @ Y, R @ Y
                R = Matrix.Rotation(bend - WRIST - 0.035, 3, fingers_dir.cross(arm_dir).normalized()) @ R
                solve_arm(rig, p, side, k['w'], R, k['pole'])
                bend = wrist_bend(rig, p, side)
            bends[side] = max(bends.get(side, 0.0), bend)
        return miss

    bends = {}

    def write(name, dur, fn, bones):
        bends.clear()
        write_clip(arm, ad, name, dur, fn, bones, log)
        log(name, 'most the wrists bend (degrees)', {k: round(math.degrees(v)) for k, v in bends.items()})

    still = body()
    # the hands at rest on the bench, each side of the radio's front
    Lrest = resolve(rig, still, 'l', dict(at=V((0.30, -0.19, bench + 0.045)), R=hand_rot_f('l', V((-0.35, -1, 0.05)), V((0.1, 0, -1))), fingers=FLAT))
    Rrest = resolve(rig, still, 'r', dict(at=V((-0.20, -0.17, bench + 0.045)), R=hand_rot_f('r', V((0.3, -1, 0.05)), V((-0.1, 0, -1))), fingers=FLAT))
    # the microphone on its hook: the socket of the right palm at its middle, the palm on its outer side, the thumb up its length
    mic = on_panel(*L.MIC['rest'])
    Rg = hand_rot('r', V((1, 0.15, 0)), V_J)
    Rgrab = resolve(rig, still, 'r', dict(at=mic, R=Rg, fingers=GRIP))
    Rgrab_open = moved(Rgrab, V((0, 0, 0)), GRIP_OPEN)
    Rpre = moved(Rgrab_open, V((-0.06, 0.05, 0.02)))
    Rlift = moved(Rgrab, N_J * 0.03 + V((0, 0, 0.025)))
    # held at rest: low in front of him, over the bench's edge, its face turned up toward his own
    hold_at = V((-0.15, -0.12, bench + 0.135))
    Rhold = resolve(rig, still, 'r', dict(at=hold_at, R=hand_rot_f('r', V((0.5, -0.82, 0.2)), V((0.4, 0.45, 0.8))), fingers=GRIP, pole=V((-0.8, 0.5, -0.7))))
    # held to speak: under and in front of the mouth, to his right of it, so that the mouth shows
    talk = body(fwd=0.03, look=display + V((0, 0, 0.14)), look_k=0.8)
    mouth = rig.fk(talk)['Head'] @ mouth_in_head
    talk_at = mouth + V((-0.045, -0.075, -0.075))
    Rtalk = resolve(rig, talk, 'r', dict(at=talk_at, R=hand_rot_f('r', V((0.7, -0.2, 0.68)), (mouth + V((0.03, 0.0, 0.03)) - talk_at)), fingers=PTT, pole=V((-0.75, 0.25, -1))))
    log('mouth', tuple(round(x, 3) for x in mouth), 'talk', tuple(round(x, 3) for x in talk_at))

    def pegar(t):
        p = body(fwd=curve([(0, 0), (0.5, 0.07), (0.8, 0.07), (1.45, 0)])(t), twist=curve([(0, 0), (0.5, -0.09), (0.8, -0.09), (1.45, 0)])(t),
                 look=mic.lerp(display, curve([(0, 1), (0.25, 0), (0.8, 0), (1.3, 1)])(t)))
        rh = track([(0, Rrest), (0.4, Rpre, 0.05), (0.55, Rgrab_open), (0.66, Rgrab), (0.82, Rlift), (1.45, Rhold, 0.03), (1.6, Rhold)])(t)
        arms(p, Lrest, rh)
        return p

    def pendurar(t):
        p = body(fwd=curve([(0, 0), (0.55, 0.07), (0.95, 0.07), (1.5, 0)])(t), twist=curve([(0, 0), (0.55, -0.09), (0.95, -0.09), (1.5, 0)])(t),
                 look=mic.lerp(display, curve([(0, 1), (0.3, 0), (1.0, 0), (1.4, 1)])(t)))
        rh = track([(0, Rhold), (0.58, Rlift, 0.03), (0.78, Rgrab), (0.9, Rgrab), (1.0, Rgrab_open), (1.12, Rpre), (1.5, Rrest, 0.04)])(t)
        arms(p, Lrest, rh)
        return p

    def esperar(t):
        w = 2 * math.pi * t / MARKS['radio_esperar']['dur']
        p = body(breath=0.012 * math.sin(w), look=display + V((0.02 * math.sin(w), 0, 0.01 * math.sin(2 * w))))
        arms(p, Lrest, moved(Rhold, V((0, 0, 0.003 * math.sin(w)))))
        return p

    def falar(t):
        w = 2 * math.pi * t / MARKS['radio_falar']['dur']
        p = body(fwd=0.03 + 0.008 * math.sin(2 * w), breath=0.010 * math.sin(w), look=display + V((0.03 * math.sin(w), 0, 0.14 + 0.03 * math.sin(2 * w + 0.6))), look_k=0.8)
        arms(p, Lrest, moved(Rtalk, V((0.003 * math.sin(w), 0, 0.004 * math.sin(2 * w + 0.6) + 0.002 * math.sin(w)))))
        return p

    whole = [b for b in rig.names if not b.endswith('_leaf_l') and not b.endswith('_leaf_r') and not b.startswith('grip_') and not b.startswith('eye_') and b != 'root']
    write('radio_pegar_mic', MARKS['radio_pegar_mic']['dur'], pegar, whole)
    write('radio_esperar', MARKS['radio_esperar']['dur'], esperar, whole)
    write('radio_falar', MARKS['radio_falar']['dur'], falar, whole)
    write('radio_pendurar', MARKS['radio_pendurar']['dur'], pendurar, whole)

    # ---- the left hand's gestures, over the body as it waits
    wait = esperar(0.0)

    def left(keys):
        def at(t):
            p = copy_pose(wait)
            miss = arms(p, track(keys)(t), None)
            at.miss = max(at.miss, miss)
            return p
        at.miss = 0.0
        return at

    # the selector: the palm in front of the knob, the fingers round it; a click is a turn of the hand about the knob's axis
    dl = L.DIAL
    knob = on_panel(dl['c'][0], dl['c'][1], dl['h'])

    def dial_key(phi, fingers):
        """The hand comes at the knob from the front, in line with the forearm: the index and the middle finger on its upper left (as
        he sees it), the thumb under it on the right; `phi` turns the whole hand about the knob's own axis."""
        th = math.radians(128)
        rim = knob - N_J * (dl['h'] * 0.45) + (U_J * math.cos(th) + V_J * math.sin(th)) * (dl['r'] + 0.003)
        q = Quaternion(N_J, phi)
        R = q.to_matrix() @ hand_rot_f('l', -N_J * 0.85 + U_J * 0.4 + V_J * 0.12, U_J * 0.55 - V_J * 0.7 - N_J * 0.25)
        return resolve(rig, wait, 'l', dict(at=knob + q @ (rim - knob), R=R, fingers=fingers, anchor='tip'))

    for name, a0, a1 in (('radio_seletor', 0.12, 0.12 - dl['step']), ('radio_seletor_menos', -0.3, -0.3 + dl['step'])):
        m = MARKS['radio_seletor']
        fn = left([(0, Lrest), (0.28, moved(dial_key(a0, KNOB_OPEN), N_J * 0.02), 0.03), (m['grip'], dial_key(a0, KNOB)), (0.42, dial_key(a0, KNOB)), (0.56, dial_key(a1, KNOB)), (m['out'], dial_key(a1, KNOB)),
                   (0.7, moved(dial_key(a1, KNOB_OPEN), N_J * 0.02)), (1.0, Lrest, 0.03)])
        write(name, m['dur'], fn, ARM['l'])
        log(name, 'short by', round(fn.miss, 4))

    # a key or a colour button: the index comes down on it along the panel's own normal
    def press_keys(top, travel):
        R = hand_rot_f('l', -N_J * 0.72 + V_J * 0.45 + U_J * 0.25, V((-0.25, -0.2, -1)))
        down = resolve(rig, wait, 'l', dict(at=top - N_J * (travel - 0.001), R=R, fingers=POINT, anchor='tip', pole=V((0.9, 0.3, -0.5))))
        return moved(down, N_J * (0.022 + travel)), down

    def presser(name, top, travel):
        m = MARKS['radio_tecla']
        hover, down = press_keys(top, travel)
        fn = left([(0, Lrest), (m['hover'], hover, 0.035), (m['press'], down), (0.38, down), (m['up'], hover), (m['dur'], Lrest, 0.035)])
        write(name, m['dur'], fn, ARM['l'])
        return fn

    def tip_of(pose):
        return rig.fk(pose)['index_04_leaf_l'].translation

    ky, cb = L.KEYS, L.COLORS
    key_top = [on_panel(*L.key_uv(i), ky['h']) for i in range(12)]
    col_top = [on_panel(*L.color_uv(i), cb['h']) for i in range(cb['count'])]
    fns = {c: presser('radio_tecla_' + c, key_top[i], ky['travel']) for c, i in KEY_CORNERS.items()}
    cfn = {c: presser('radio_cor_' + c, col_top[i], cb['travel']) for c, i in COLOR_STOPS.items()}
    log('keys short by', round(max(f.miss for f in fns.values()), 4), 'colours short by', round(max(f.miss for f in cfn.values()), 4))

    # how far the finger lands from each key when the game mixes the corner clips (it mixes the bones' turns, not the places)
    def blend(poses, ws):
        out = copy_pose(wait)
        for b in ARM['l']:
            acc = Quaternion((0, 0, 0, 0))
            ref = poses[0]['q'][b]
            for p, w in zip(poses, ws):
                q = p['q'][b]
                acc = acc + (q if q.dot(ref) >= 0 else -q) * w
            out['q'][b] = acc.normalized()
        return out
    tp = MARKS['radio_tecla']['press'] + 0.02
    worst = 0.0
    for i in range(12):
        row, c = divmod(i, 3)
        u, v = c / 2, row / 3
        mixp = blend([fns[k](tp) for k in 'abcd'], [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v])
        worst = max(worst, (tip_of(mixp) - (key_top[i] - N_J * (ky['travel'] - 0.001))).length)
    log('mixed keys: worst miss of the finger (m)', round(worst, 4))
    worst = 0.0
    for i in range(cb['count']):
        k = i / 2
        ws = [max(0, 1 - k), 1 - abs(1 - k), max(0, k - 1)]
        mixp = blend([cfn[c](tp) for c in 'abc'], ws)
        worst = max(worst, (tip_of(mixp) - (col_top[i] - N_J * (cb['travel'] - 0.001))).length)
    log('mixed colours: worst miss of the finger (m)', round(worst, 4))

    # ============================================================== from the chest up: the notebook and the pocket
    stand0 = rig.from_action('idle', 0)
    for b in list(stand0['q']):
        if re.match(r'^(index|middle|ring|pinky|thumb)', b):
            del stand0['q'][b]
    rig.turn(stand0, 'upperarm_l', Y, 0.13)
    rig.turn(stand0, 'upperarm_r', Y, -0.13)
    Ms = rig.fk(stand0)
    chest = Ms['spine_03'].translation
    front = V((0, -1, 0))
    Lhang, Rhang = held(rig, stand0, 'l'), held(rig, stand0, 'r')
    hands_at = chest + V((0, -0.33, -0.04))                  # where he holds things to look at them
    upper = [b for b in whole if UPPER.match(b)]

    def chest_up(lh, rh, look=None, look_k=0.0):
        def at(t):
            p = copy_pose(stand0)
            if look is not None:
                k = look_k(t) if callable(look_k) else look_k
                rig.turn(p, 'neck_01', X, 0.22 * k)
                look_at(rig, p, look, 0.8 * k)
            at.miss = max(at.miss, arms(p, lh(t), rh(t)))
            return p
        at.miss = 0.0
        return at

    # the notebook lies open on the left palm (its socket), the page's top away from him; the right hand turns the pages
    book_c = hands_at + V((0.035, 0, 0))
    book_up = V((0, 0.42, 0.91)).normalized()                 # the page faces his eyes
    book_top = (front - book_up * front.dot(book_up)).normalized()
    book_x = book_top.cross(book_up)                          # to his right
    Lbook = resolve(rig, stand0, 'l', dict(at=book_c - book_x * 0.03 - book_top * 0.01 + book_up * 0.02, R=hand_rot('l', book_up, book_top + book_x * 0.25), fingers=BOOK, pole=V((0.7, 0.5, -0.8))))
    pouch = Ms['pelvis'].translation + V((0.2, -0.07, 0.06))  # the pouch on his belt, at the left hip
    Lpouch = resolve(rig, stand0, 'l', dict(at=pouch + V((0.03, 0, 0)), R=hand_rot_f('l', V((-0.1, -0.25, -1)), V((-1, 0.1, 0))), fingers=GRIP_OPEN, pole=V((0.8, 0.8, 0.1))))
    Lpouch_shut = moved(Lpouch, V((0, 0, 0)), BOOK_SHUT)
    Lbook_shut = moved(Lbook, V((0, 0, 0)), BOOK_SHUT)

    def page_key(u, v, h, fingers, tilt=0.0):
        """The right hand with the tip of its index at (u to his right, v up the page, h above it) of the open notebook."""
        at_ = book_c + book_x * u + book_top * v + book_up * h
        f = (-book_x * (0.75 - tilt) + book_top * 0.45 - book_up * (0.45 + tilt)).normalized()
        return resolve(rig, stand0, 'r', dict(at=at_, R=hand_rot_f('r', f, -book_up * 0.8 - book_x * 0.5 * (1 - tilt)), fingers=fingers, anchor='tip', pole=V((-0.8, 0.4, -0.7))))

    Rpage = page_key(0.088, -0.045, 0.012, PINCH)
    Rpage_far = page_key(0.12, -0.06, 0.03, RELAX)
    m = MARKS['caderno_pegar']
    fn = chest_up(track([(0, Lhang), (0.38, Lpouch, 0.02), (m['take'], Lpouch_shut), (0.62, moved(Lpouch_shut, V((0.02, -0.03, 0.06)))), (1.0, Lbook_shut, 0.03), (1.15, Lbook), (m['dur'], Lbook)]),
                  track([(0, Rhang), (0.6, Rhang), (1.1, Rpage_far, 0.02), (m['dur'], Rpage_far)]), look=book_c, look_k=curve([(0, 0), (0.5, 0.3), (1.1, 1)]))
    write('caderno_pegar', m['dur'], fn, upper)
    log('caderno_pegar short by', round(fn.miss, 4))
    m = MARKS['caderno_folhear']
    fn = chest_up(lambda t: moved(Lbook, book_up * 0.003 * math.sin(math.pi * smooth((t - 0.2) / 0.7))),
                  track([(0, Rpage_far), (m['start'], Rpage, 0.01), (0.52, page_key(0.0, -0.02, 0.085, PINCH, 0.3), 0.01), (m['end'], page_key(-0.078, -0.04, 0.02, PINCH, 0.5)), (0.92, page_key(-0.07, -0.045, 0.04, RELAX, 0.5)),
                         (m['dur'], Rpage_far, 0.03)]), look=book_c, look_k=1.0)
    write('caderno_folhear', m['dur'], fn, upper)
    log('caderno_folhear short by', round(fn.miss, 4))

    # the pocket: the right hand goes into the jacket's chest pocket, and both come up open, side by side, with what was in it
    pocket = chest + V((-0.115, -0.125, 0.045))
    Rpocket = resolve(rig, stand0, 'r', dict(at=pocket, R=hand_rot_f('r', V((0.35, 0.1, -1)), V((0.15, 1, 0.1))), fingers=POCKET, anchor='middle', pole=V((-1, 0.2, 0.3))))
    palm_up = V((0, 0.38, 0.93)).normalized()
    Rshow = resolve(rig, stand0, 'r', dict(at=hands_at + V((-0.075, 0, 0.03)), R=hand_rot_f('r', V((0.42, -1, 0.1)), palm_up), fingers=CUP, pole=V((-0.7, 0.5, -0.8))))
    Lshow = resolve(rig, stand0, 'l', dict(at=hands_at + V((0.075, 0, 0.03)), R=hand_rot_f('l', V((-0.42, -1, 0.1)), palm_up), fingers=CUP, pole=V((0.7, 0.5, -0.8))))
    m = MARKS['bolso_abrir']
    fn = chest_up(track([(0, Lhang), (0.45, Lhang), (m['show'], Lshow, 0.03), (m['dur'], Lshow)]),
                  track([(0, Rhang), (0.4, moved(Rpocket, V((0, -0.03, 0.07))), 0.03), (m['take'], Rpocket), (0.62, moved(Rpocket, V((0, -0.035, 0.08)))), (m['show'], Rshow, 0.02), (m['dur'], Rshow)]),
                  look=hands_at, look_k=curve([(0, 0), (0.4, 0.5), (1.0, 1)]))
    write('bolso_abrir', m['dur'], fn, upper)
    log('bolso_abrir short by', round(fn.miss, 4))
