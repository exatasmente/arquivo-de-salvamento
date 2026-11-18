"""The animations of the person rig (imported by person.py).

Poses are written in the axes of the whole body (x right, y forward, z up), not in the bones' own axes: a rotation is
Rz(rz) Rx(rx) Ry(ry) about those axes, attached to the parent's posed frame, and `Rig.q` turns it into the bone's local
quaternion. So `rx` swings a hanging limb forward (+) or back (-), `ry` raises a limb to the side or lowers it, `rz` yaws.
For the upright bones (spine, neck, head) a forward lean is a NEGATIVE rx; the helpers below take it as positive.

Every clip is a function of u in [0, 1): a loop (u = 1 is u = 0) or a one-shot that ends where it ends.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

from common import Clip, smooth

PI = math.pi
SIN = math.sin
COS = math.cos

FINGER_NAMES = ('index', 'middle', 'ring', 'pinky')
SIDES = (('R', 1), ('L', -1))


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


def mix_pose(a, b, k):
    """Blend two Pose objects."""
    out = Pose()
    for src, w in ((a, 1 - k), (b, k)):
        for bone, v in src.rot.items():
            t = out.rot.setdefault(bone, [0.0, 0.0, 0.0])
            for i in range(3):
                t[i] += v[i] * w
        for bone, v in src.loc.items():
            t = out.loc.setdefault(bone, [0.0, 0.0, 0.0])
            for i in range(3):
                t[i] += v[i] * w
    return out


class Pose:
    def __init__(self):
        self.rot = {}
        self.loc = {}

    def r(self, bone, rx=0.0, ry=0.0, rz=0.0):
        v = self.rot.setdefault(bone, [0.0, 0.0, 0.0])
        v[0] += rx
        v[1] += ry
        v[2] += rz
        return self

    def at(self, bone, x=0.0, y=0.0, z=0.0):
        v = self.loc.setdefault(bone, [0.0, 0.0, 0.0])
        v[0] += x
        v[1] += y
        v[2] += z
        return self

    # --- the vocabulary
    def lean(self, bone, fwd=0.0, side=0.0, turn=0.0):
        return self.r(bone, -fwd, side, turn)

    def arm(self, n, fwd=0.0, out=0.0, yaw=0.0, elbow=0.0, wrist=0.0, wyaw=0.0, roll=0.0):
        S = 1 if n == 'R' else -1
        self.r(f'upper_arm_{n}', fwd, -S * out, S * yaw)
        self.r(f'forearm_{n}', elbow, 0, 0)
        self.r(f'hand_{n}', wrist, S * roll, S * wyaw)
        return self

    def leg(self, n, thigh=0.0, knee=0.0, foot=0.0, out=0.0, toe=0.0, yaw=0.0):
        S = 1 if n == 'R' else -1
        self.r(f'thigh_{n}', thigh, S * out, S * yaw)
        self.r(f'shin_{n}', -knee, 0, 0)
        self.r(f'foot_{n}', foot, 0, 0)
        self.r(f'toe_{n}', toe, 0, 0)
        return self

    def hand(self, n, curl=0.35, thumb=0.3, spread=0.0, grip=None):
        """curl 0 (flat) .. 1.6 (fist); the fingers fold along their three joints."""
        S = 1 if n == 'R' else -1
        base = (0.55, 0.85, 0.65)
        for k, f in enumerate(FINGER_NAMES):
            f_curl = curl * (1.0 + (k - 1.5) * 0.05)
            for j in range(3):
                self.r(f'{f}{j + 1}_{n}', (spread * (1.5 - k) * 0.12) if j == 0 else 0.0, S * f_curl * base[j] * (1.0 if j else 1.0), 0)
        for j in range(3):
            self.r(f'thumb{j + 1}_{n}', 0, S * thumb * (0.5, 0.7, 0.6)[j], S * (-0.25 if j == 0 else 0) * thumb)
        return self


class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        self.prev = {}

    def q(self, bone, rx, ry, rz):
        Q = Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(ry, 3, 'Y')
        R = self.rest[bone]
        L = R.inverted() @ Q @ R
        q = L.to_quaternion()
        p = self.prev.get(bone)
        if p is not None and q.dot(p) < 0:
            q.negate()
        self.prev[bone] = q.copy()
        return q

    def loc(self, bone, v):
        return self.rest[bone].inverted() @ Vector(v)


def key_pose_clip(rig, clip, fn):
    """Keys a clip from fn(u) -> Pose."""
    arm = rig.arm
    act = bpy.data.actions.new(clip.name)
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    frames = max(2, int(round(clip.seconds * clip.fps)))
    rig.prev = {}
    for k in range(frames + 1):
        u = k / frames
        pose = fn(0.0 if (clip.loop and k == frames) else u)
        for bone, v in pose.rot.items():
            pb = arm.pose.bones[bone]
            pb.rotation_quaternion = rig.q(bone, *v)
            pb.keyframe_insert('rotation_quaternion', frame=k)
        for bone, v in pose.loc.items():
            pb = arm.pose.bones[bone]
            pb.location = rig.loc(bone, v)
            pb.keyframe_insert('location', frame=k)
        sc = getattr(pose, 'scales', {})
        for bone, v in sc.items():
            pb = arm.pose.bones[bone]
            pb.scale = v
            pb.keyframe_insert('scale', frame=k)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    ad.action = None
    tr = ad.nla_tracks.new()
    tr.name = clip.name
    st = tr.strips.new(clip.name, 0, act)
    st.name = clip.name
    return act


# ---------------------------------------------------------------------------------------------------------------
# the building blocks

def relaxed(p, breathe=0.0, weight=0.0):
    """Arms down and loose, hands a little curled."""
    for n, S in SIDES:
        p.arm(n, fwd=0.06 + 0.02 * breathe, out=-0.14, yaw=0.0, elbow=0.2, wrist=-0.05)
        p.hand(n, curl=0.38, thumb=0.2)
    return p


def mouth(p, open_=0.0, smile=0.0, x=1.0):
    pb = p
    sc = getattr(p, 'scales', None)
    if sc is None:
        p.scales = sc = {}
    sc['mouth'] = (1.0 + smile * 0.14, 1.0 + open_ * 2.2, 1.0)
    p.at('mouth', 0, 0, -open_ * 0.006)
    return p


def face(p, brow=0.0, brow_in=0.0, lids=0.0, open_=0.0, smile=0.0):
    for n, S in SIDES:
        p.at(f'brow_{n}', 0, 0, brow * 0.011)
        p.r(f'brow_{n}', 0, -S * brow_in * 0.55, 0)
        p.r(f'lid_{n}', -lids * 1.45, 0, 0)
    mouth(p, open_, smile)
    return p


def walk_pose(ph, A=0.42, K=0.9, arm_amp=0.4, lean=0.05, bob=0.014, twist=0.09, elbow=0.2, crouch=0.0, stagger=0.0, limp=0.0, speed_arms=0.0):
    p = Pose()
    # hips
    p.at('hips', 0, 0, bob * COS(2 * ph) * (1 - crouch) - crouch * 0.27 - 0.012 * (A > 0.6))
    p.at('hips', 0.012 * SIN(ph) * (1 - crouch), -crouch * 0.12, 0)
    p.r('hips', 0, 0.035 * SIN(ph + PI / 2) * 0, -twist * SIN(ph))
    p.r('hips', 0, 0.05 * SIN(ph) * (1 - crouch), 0)
    p.lean('spine1', lean + crouch * 0.35)
    p.lean('spine2', lean * 0.8 + crouch * 0.28, 0, twist * 1.3 * SIN(ph))
    p.lean('neck', -lean * 0.4 - crouch * 0.25, 0, -twist * 0.5 * SIN(ph))
    p.lean('head', -lean * 0.6 - crouch * 0.18)
    for n, S in SIDES:
        pl = ph + (0 if n == 'R' else PI)
        th = A * SIN(pl)
        kn = 0.10 + K * max(0.0, COS(pl + 0.45)) ** 1.1
        th_c = th * (1 - crouch * 0.4) + crouch * 1.05
        kn_c = kn * (1 - crouch * 0.4) + crouch * 1.55 * 1.0
        toeoff = 0.5 * max(0.0, -SIN(pl)) ** 2 * (1 - crouch)
        heel = 0.22 * max(0.0, SIN(pl)) ** 3
        foot = kn_c - th_c - toeoff + heel
        p.leg(n, thigh=th_c, knee=kn_c, foot=foot, out=0.02 + crouch * 0.1, toe=toeoff * 0.8)
        # arms swing against the legs
        sw = -SIN(pl) * arm_amp
        fl = max(0.0, SIN(pl))  # arm forward, elbow folds more
        p.arm(n, fwd=sw * (1 - crouch * 0.4) + crouch * 0.55, out=-0.10 + crouch * 0.1, yaw=crouch * 0.28, elbow=elbow + (0.35 + 0.6 * speed_arms) * max(0.0, -SIN(pl)) + crouch * 0.9 + speed_arms * 0.85,
              wrist=-0.05)
        p.hand(n, curl=0.4 + 0.9 * speed_arms, thumb=0.3)
    return p


def idle_pose(u, t=2.4):
    ph = 2 * PI * u
    p = Pose()
    br = SIN(ph)
    p.at('hips', 0.008 * SIN(ph), 0, -0.004 + 0.004 * br)
    p.r('hips', 0, 0.012 * SIN(ph), 0.02 * SIN(ph))
    p.lean('spine1', 0.02 + 0.006 * br)
    p.lean('spine2', 0.02 + 0.012 * br, 0.01 * SIN(ph))
    p.lean('neck', -0.02)
    p.lean('head', -0.02 + 0.01 * SIN(ph + 0.6), 0, 0.05 * SIN(ph * 0.5))
    p.r('clavicle_R', 0, 0.02 * br, 0)
    p.r('clavicle_L', 0, -0.02 * br, 0)
    for n, S in SIDES:
        p.arm(n, fwd=0.05 + 0.025 * SIN(ph + (0 if n == 'R' else 0.7)), out=-0.14, elbow=0.22 + 0.02 * br, wrist=-0.06)
        p.hand(n, curl=0.38 + 0.03 * br, thumb=0.22)
    p.leg('R', thigh=0.02, knee=0.04, foot=0.02 - 0.04 + 0.0, out=0.02)
    p.leg('L', thigh=-0.01, knee=0.08, foot=-0.07, out=0.02)
    return face(p, brow=0.0)


# ---------------------------------------------------------------------------------------------------------------
# the clips

def clip_idle(u):
    return idle_pose(u)


def clip_walk(u):
    ph = 2 * PI * u
    p = walk_pose(ph)
    return face(p)


def clip_run(u):
    ph = 2 * PI * u
    p = walk_pose(ph, A=0.78, K=1.55, arm_amp=0.85, lean=0.22, bob=0.045, twist=0.16, elbow=0.2, speed_arms=0.9)
    # the flight: both feet up, a stronger bounce
    return face(p, brow=-0.3, brow_in=0.2)


def clip_crouch_walk(u):
    ph = 2 * PI * u
    p = walk_pose(ph, A=0.28, K=0.55, arm_amp=0.18, lean=0.1, bob=0.012, twist=0.07, crouch=1.0)
    return face(p, brow=-0.15, brow_in=0.1)


def clip_crouch_idle(u):
    ph = 2 * PI * u
    p = walk_pose(0.0, A=0.0, K=0.0, arm_amp=0.0, lean=0.1, bob=0.0, twist=0.0, crouch=1.0)
    p.at('hips', 0, 0, 0.006 * SIN(ph))
    p.lean('spine2', 0.012 * SIN(ph))
    p.lean('head', 0.0, 0, 0.35 * SIN(ph * 0.5) + 0.12 * SIN(ph * 1.5))
    return face(p, brow=-0.1, brow_in=0.15)


def clip_mancar(u):
    """A limp: the left leg is the hurt one (short, careful steps), the body drops with it and the hand goes to the thigh."""
    ph = 2 * PI * u
    p = walk_pose(ph, A=0.30, K=0.7, arm_amp=0.18, lean=0.1, bob=0.0, twist=0.05)
    drop = max(0.0, SIN(ph)) if True else 0.0  # body falls onto the good leg
    p.at('hips', 0.035 * SIN(ph), 0, -0.035 * max(0.0, SIN(ph + PI)) + 0.02 * COS(2 * ph))
    p.r('hips', 0, 0.09 * SIN(ph + PI) * -1, 0)
    p.lean('spine2', 0.07, -0.08 * SIN(ph))
    # the left leg: weight off it early
    p.leg('L', thigh=-0.12 + 0.2 * SIN(ph + PI) * 0, knee=0.35, foot=0.0)
    p.arm('L', fwd=0.45, out=0.0, yaw=0.5, elbow=0.55, wrist=0.1)
    p.arm('R', fwd=-0.2 * SIN(ph), out=0.2 + 0.15 * max(0.0, SIN(ph)), elbow=0.3)
    return face(p, brow=0.1, brow_in=0.7, lids=0.25, open_=0.1)


def clip_usar(u):
    """Reach out with the right hand, palm open, and press (a short push loop). Upper body only."""
    ph = 2 * PI * u
    k = 0.5 - 0.5 * COS(ph)
    p = Pose()
    p.lean('spine1', 0.08 + 0.05 * k)
    p.lean('spine2', 0.07 + 0.06 * k, 0, 0.1)
    p.lean('neck', 0.0, 0, -0.1)
    p.lean('head', 0.0, 0, -0.08)
    p.arm('R', fwd=1.42 + 0.05 * k, out=0.0, yaw=0.12, elbow=0.28 + 0.14 * (1 - k), wrist=-0.2 + 0.15 * k, roll=0.3)
    p.hand('R', curl=0.08, thumb=0.0, spread=0.6)
    p.arm('L', fwd=0.1, out=-0.1, elbow=0.4)
    p.hand('L', curl=0.35, thumb=0.2)
    return face(p, brow=0.15, brow_in=0.0)


def clip_manipular(u):
    """Hold something in both hands at the waist and work on it: small turns of the wrists, the head down at it."""
    ph = 2 * PI * u
    p = Pose()
    p.lean('spine1', 0.12)
    p.lean('spine2', 0.14, 0, 0.0)
    p.lean('neck', 0.2)
    p.lean('head', 0.18, 0, 0.05 * SIN(ph))
    for n, S in SIDES:
        a = SIN(ph + (0 if n == 'R' else PI * 0.6))
        p.arm(n, fwd=0.82 + 0.04 * a, out=-0.05, yaw=0.38, elbow=1.15 + 0.1 * a, wrist=0.08 * a - 0.2, wyaw=0.1 * a)
        p.hand(n, curl=0.75 + 0.15 * a, thumb=0.5, spread=-0.1)
    return face(p, brow=-0.12, brow_in=0.25, lids=0.1)


def clip_radio(u):
    """The right hand holds a radio at the mouth and talks into it; the left hand rests low."""
    ph = 2 * PI * u
    talk = max(0.0, SIN(ph * 3.0)) * (0.5 + 0.5 * SIN(ph * 1.0 + 1.0)) * 0.8
    p = Pose()
    p.lean('spine1', 0.03)
    p.lean('spine2', 0.04, 0, 0.12)
    p.lean('neck', 0.0, 0.05, -0.12)
    p.lean('head', -0.02, 0.06, -0.14 + 0.03 * SIN(ph * 1.5))
    p.arm('R', fwd=0.62, out=-0.35, yaw=0.25, elbow=2.28, wrist=0.35, roll=-0.4)
    p.hand('R', curl=1.15, thumb=0.8)
    p.arm('L', fwd=0.12, out=-0.1, elbow=0.55)
    p.hand('L', curl=0.4, thumb=0.2)
    return face(p, brow=0.1, brow_in=0.0, open_=talk, smile=0.0)


def clip_mirar(u):
    """Aim a throw: the right arm points the way, the left one folds in, the weight is on the back leg."""
    ph = 2 * PI * u
    p = Pose()
    p.at('hips', 0, 0.0, -0.03)
    p.lean('spine1', 0.08, 0, -0.18)
    p.lean('spine2', 0.1, 0.0, -0.25)
    p.lean('neck', 0.0, 0, 0.3)
    p.lean('head', -0.04, 0, 0.32)
    p.arm('R', fwd=1.35 + 0.02 * SIN(ph * 2), out=0.15, yaw=-0.12, elbow=0.18, wrist=-0.1)
    p.hand('R', curl=0.5, thumb=0.2)
    p.arm('L', fwd=0.8, out=0.0, yaw=0.5, elbow=1.5)
    p.hand('L', curl=0.7, thumb=0.4)
    p.leg('R', thigh=-0.25, knee=0.35, foot=-0.1, out=0.05)
    p.leg('L', thigh=0.38, knee=0.18, foot=-0.2, out=0.05)
    return face(p, brow=-0.2, brow_in=0.3)


def clip_arremessar(u):
    """The throw: wind up (arm back, weight back), whip it through, follow."""
    wind = ease(u / 0.35)
    thr = ease((u - 0.35) / 0.2)
    fol = ease((u - 0.55) / 0.45)
    p = Pose()
    sh = lerp(lerp(1.35, -0.9, wind), 1.7, thr)
    sh = lerp(sh, 0.5, fol)
    el = lerp(lerp(0.18, 1.4, wind), 0.2, thr)
    el = lerp(el, 0.5, fol)
    twist = lerp(lerp(-0.25, 0.85, wind), -0.7, thr)
    twist = lerp(twist, -0.3, fol)
    p.at('hips', 0, lerp(lerp(0, -0.04, wind), 0.05, thr), -0.03 - 0.03 * thr * (1 - fol))
    p.lean('spine1', lerp(0.08, 0.3, thr) * (1 - fol) + 0.1 * fol, 0, twist * 0.6)
    p.lean('spine2', lerp(-0.1, 0.34, thr) * (1 - fol) + 0.1 * fol, 0, twist)
    p.lean('head', 0.0, 0, -twist * 0.4)
    p.arm('R', fwd=sh, out=lerp(0.2, 0.6, wind) * (1 - thr), yaw=-0.1, elbow=el, wrist=lerp(0.0, -0.6, thr))
    p.hand('R', curl=lerp(0.9, 0.1, thr), thumb=0.3)
    p.arm('L', fwd=lerp(0.8, 0.3, thr), out=0.2, yaw=0.3 * (1 - thr), elbow=0.6)
    p.hand('L', curl=0.4)
    fw = lerp(0.0, 0.5, thr) * (1 - fol * 0.6)
    p.leg('L', thigh=0.3 + fw * 0.7, knee=0.3 + fw * 0.35, foot=-0.1)
    p.leg('R', thigh=-0.25 - fw * 0.1, knee=0.3 + 0.3 * fw, foot=-0.1 + 0.5 * thr)
    return face(p, brow=-0.3, brow_in=0.35, open_=0.5 * thr * (1 - fol))


def clip_comer(u):
    """Sitting (on whatever is there), the right hand brings food to the mouth and the jaw works; the left rests on the table."""
    ph = 2 * PI * u
    cyc = ease(0.5 + 0.5 * SIN(ph - 1.2))
    chew = max(0.0, SIN(ph * 4.0)) * (1.0 - cyc) * 0.6
    p = Pose()
    p.at('hips', 0, 0.0, -0.365)
    p.lean('spine1', 0.12)
    p.lean('spine2', 0.1 + 0.04 * cyc)
    p.lean('neck', 0.1)
    p.lean('head', 0.05 - 0.1 * cyc, 0, 0.05 * SIN(ph * 0.5))
    p.arm('R', fwd=lerp(0.7, 0.95, cyc), out=lerp(0.0, -0.3, cyc), yaw=lerp(0.35, 0.3, cyc), elbow=lerp(1.35, 2.35, cyc), wrist=lerp(0.0, 0.3, cyc))
    p.hand('R', curl=lerp(0.8, 1.0, cyc), thumb=0.7)
    p.arm('L', fwd=0.85, out=0.0, yaw=0.15, elbow=0.9, wrist=-0.1)
    p.hand('L', curl=0.3, thumb=0.2)
    for n, S in SIDES:
        p.leg(n, thigh=1.5, knee=1.52, foot=0.0, out=0.06)
    return face(p, brow=0.05, lids=0.1, open_=chew, smile=0.1)


def clip_dormir(u):
    """Lying on the back, breathing slowly, eyes shut. The body is already laid down by the root."""
    ph = 2 * PI * u
    br = SIN(ph)
    p = Pose()
    p.r('root', PI / 2, 0, 0)
    p.at('root', 0, 0.0, 0.12 + 0.0)
    p.at('hips', 0, 0, 0.004 * br)
    p.lean('spine1', 0.0)
    p.lean('spine2', 0.012 * br)
    p.lean('neck', -0.05)
    p.lean('head', -0.04, 0.0, 0.5)
    p.arm('R', fwd=0.12, out=-0.2, elbow=0.35)
    p.arm('L', fwd=0.65, out=-0.05, yaw=0.9, elbow=1.5)
    p.hand('R', curl=0.5)
    p.hand('L', curl=0.45)
    p.leg('R', thigh=0.04, knee=0.1, out=0.12, foot=-0.2)
    p.leg('L', thigh=0.2, knee=0.5, out=0.18, foot=-0.2)
    return face(p, lids=1.0, brow=-0.05, open_=0.12 + 0.05 * br)


def lying_final(p, k):
    """Knocked down, lying on the back, arms flung, one knee up. k = how far into it."""
    p.r('root', PI / 2 * k * 0.97, 0, 0)
    p.at('root', 0, -0.0, 0.13 * k)
    p.lean('head', -0.1 * k, 0, 0.5 * k)
    p.arm('R', fwd=0.3 * k, out=0.9 * k, elbow=0.4 * k)
    p.arm('L', fwd=0.2 * k, out=0.7 * k, elbow=0.7 * k)
    p.hand('R', curl=0.2)
    p.hand('L', curl=0.3)
    p.leg('R', thigh=0.1 * k, knee=0.2 * k, out=0.2 * k)
    p.leg('L', thigh=0.9 * k, knee=1.4 * k, out=0.1 * k, foot=-0.4 * k)


def clip_caido(u):
    """Knocked down, for the game that tilts the whole body itself (root.rotation.x = about 90 degrees): the pose it takes
    in the body's own axes, arms flung, one knee up, head to the side, eyes shut tight."""
    p = Pose()
    lying_final(p, 1.0)
    p.r('root', -PI / 2 * 0.97, 0, 0)    # undo the lying part of lying_final: the caller does that
    p.at('root', 0, 0, -0.13)
    return face(p, brow=-0.3, brow_in=0.6, lids=0.9, open_=0.25)


def clip_repouso(u):
    """Resting on the back (sleeping, wounded in a bed), for the game that tilts the body itself: breathing, eyes shut."""
    ph = 2 * PI * u
    br = SIN(ph)
    p = clip_dormir(u)
    p.r('root', -PI / 2, 0, 0)
    p.at('root', 0, 0, -0.12)
    return p


def clip_derrubado(u):
    """Hit and thrown backwards: a stagger, the feet leave the ground, the back lands, the arms fall open."""
    fall = ease(u / 0.8)
    stag = ease(u / 0.25)
    p = Pose()
    lying_final(p, fall)
    # before it all: the body jolts back, the arms fly up
    jolt = SIN(min(1.0, u / 0.35) * PI) * (1 - fall)
    p.lean('spine1', -0.25 * jolt - 0.1 * stag * (1 - fall))
    p.lean('spine2', -0.25 * jolt)
    p.arm('R', fwd=1.2 * jolt, out=0.7 * jolt, elbow=0.5 * jolt)
    p.arm('L', fwd=1.2 * jolt, out=0.7 * jolt, elbow=0.5 * jolt)
    p.leg('R', thigh=-0.35 * jolt, knee=0.5 * jolt)
    p.leg('L', thigh=0.5 * jolt, knee=0.6 * jolt)
    p.at('root', 0, 0.3 * jolt * 0 - 0.1 * ease(u / 0.8) * 0, 0.05 * SIN(min(1.0, u / 0.5) * PI))
    p.at('hips', 0, 0, 0)
    return face(p, brow=0.8 * (1 - fall) - 0.3 * fall, lids=0.9 * fall + 0.2 * jolt, open_=0.9 * (1 - fall) * (u < 0.5))


def clip_levantar(u):
    """From lying: roll to a hand, push up through a crouch, stand."""
    a = ease(u / 0.45)       # sit up
    b = ease((u - 0.35) / 0.35)  # to a crouch / one knee
    c = ease((u - 0.65) / 0.35)  # stand
    p = Pose()
    lying = Pose()
    lying_final(lying, 1.0)
    # the body angle from lying (90) to upright (0): sitting up to about 40, then straight as the legs take it
    ang = PI / 2 * 0.97 * (1 - ease(u / 0.8))
    p.r('root', ang, 0, 0)
    p.at('root', 0, 0, 0.13 * (1 - ease(u / 0.8)))
    crouch = ease(u / 0.5) * (1 - c)
    p.at('hips', 0, -0.1 * crouch, -0.28 * crouch)
    p.lean('spine1', 0.2 * crouch)
    p.lean('spine2', 0.25 * crouch)
    p.lean('head', 0.0, 0, 0.5 * (1 - a))
    p.arm('R', fwd=lerp(0.3, 0.7, a) * (1 - c) + 0.05 * c, out=lerp(0.9, 0.0, a) * (1 - c), elbow=lerp(0.4, 0.6, a))
    p.arm('L', fwd=lerp(0.2, 0.6, a) * (1 - c), out=lerp(0.7, 0.1, a) * (1 - c), elbow=lerp(0.7, 0.6, a))
    p.hand('R', curl=0.3)
    p.hand('L', curl=0.3)
    p.leg('R', thigh=lerp(0.1, 1.05, crouch), knee=lerp(0.2, 1.7, crouch), out=0.1 * (1 - c), foot=lerp(0.0, 0.65, crouch))
    p.leg('L', thigh=lerp(0.9, 1.05, crouch) * (1 - 0.2 * c), knee=lerp(1.4, 1.7, crouch), foot=lerp(-0.4, 0.65, crouch))
    return face(p, brow=0.1, brow_in=0.4, lids=0.5 * (1 - a))


def climb(u, up=True):
    """Hanging on a rope: hands alternate overhead, the feet walk the wall."""
    ph = 2 * PI * u * (1 if up else -1)
    p = Pose()
    p.at('hips', 0, 0.12, 0.0)  # the body hangs a little away from the rope
    p.lean('spine1', 0.1)
    p.lean('spine2', 0.08, 0.02 * SIN(ph))
    p.lean('neck', -0.2)
    p.lean('head', -0.25)
    for n, S in SIDES:
        a = ph + (0 if n == 'R' else PI)
        reach = 0.5 + 0.5 * SIN(a)  # 1 = hand up high, 0 = pulled down
        p.arm(n, fwd=lerp(1.75, 2.85, reach), out=0.05, yaw=lerp(0.2, 0.3, reach), elbow=lerp(1.75, 0.15, reach), wrist=0.0)
        p.hand(n, curl=1.1 if reach < 0.8 else 0.55, thumb=0.7)
    for n, S in SIDES:
        a = ph + (PI if n == 'R' else 0)
        lift = 0.5 + 0.5 * SIN(a)
        p.leg(n, thigh=lerp(0.35, 1.15, lift), knee=lerp(0.7, 1.75, lift), foot=lerp(0.0, 0.45, lift) - 0.4, out=0.12)
    return face(p, brow=-0.25, brow_in=0.35, open_=0.15 + 0.1 * SIN(ph * 2))


def clip_corda_subir(u):
    return climb(u, True)


def clip_corda_descer(u):
    return climb(u, False)


def clip_corda_parado(u):
    ph = 2 * PI * u
    p = climb(0.25, True)
    p.at('hips', 0.0, 0.0, 0.006 * SIN(ph))
    p.lean('head', 0.03 * SIN(ph))
    return p


def hide_curl(k, ph=0.0):
    """Curled up small: down on the toes, knees to the chest, arms round the knees, head tucked. k 0..1."""
    p = Pose()
    p.at('hips', 0, -0.15 * k, -0.36 * k)
    p.lean('spine1', 0.45 * k)
    p.lean('spine2', 0.5 * k)
    p.lean('neck', 0.3 * k)
    p.lean('head', 0.25 * k)
    for n, S in SIDES:
        p.leg(n, thigh=1.35 * k, knee=2.2 * k, foot=0.95 * k, out=0.12 * k)
        p.arm(n, fwd=1.1 * k, out=0.0, yaw=0.4 * k, elbow=1.9 * k, wrist=0.1)
        p.hand(n, curl=0.7 * k, thumb=0.3)
    return p


def clip_esconder_entrar(u):
    k = ease(u / 0.8)
    p = hide_curl(k)
    # a glance back before it goes down
    p.lean('head', 0.0, 0, 0.5 * SIN(min(1, u / 0.5) * PI))
    return face(p, brow=0.4 * (1 - k), brow_in=0.5, lids=0.0)


def clip_esconder_parado(u):
    ph = 2 * PI * u
    p = hide_curl(1.0)
    p.at('hips', 0, 0, 0.004 * SIN(ph))
    p.lean('spine2', 0.012 * SIN(ph))
    p.lean('head', 0.0, 0, 0.18 * SIN(ph * 0.5))
    return face(p, brow=0.2, brow_in=0.5, lids=0.1 + 0.2 * max(0.0, SIN(ph * 3)))


def clip_esconder_sair(u):
    k = 1 - ease(u / 0.85)
    p = hide_curl(k)
    p.lean('head', 0.0, 0, 0.4 * SIN(min(1, u / 0.6) * PI))
    return face(p, brow=0.3 * (1 - k), brow_in=0.2)


def clip_blink(u):
    """Only the lids, closed: the game blends it in for a blink (and it is the same shut eye as sleeping)."""
    p = Pose()
    for n, S in SIDES:
        p.r(f'lid_{n}', -1.45, 0, 0)
    return p


def expr(**kw):
    def fn(u):
        p = Pose()
        # a single pose: the clip is made additive in the game against its first frame, so frame 0 is the neutral face
        return face(p, **kw) if u > 0.3 else face(p)
    return fn


def clip_look_yaw(u):
    """Only the neck and the head turning from -1.2 (u = 0) to +1.2 rad (u = 1): the game makes it additive on frame u = 0.5."""
    p = Pose()
    y = -1.2 + 2.4 * u
    p.r('neck', 0, 0, y * 0.4)
    p.r('head', 0, 0, y * 0.6)
    return p


CLIPS = [
    # name, seconds, loop, fn
    ('idle', 2.4, True, clip_idle),
    ('walk', 1.0, True, clip_walk),
    ('run', 0.66, True, clip_run),
    ('crouch_walk', 1.2, True, clip_crouch_walk),
    ('crouch_idle', 2.4, True, clip_crouch_idle),
    ('mancar', 1.3, True, clip_mancar),
    ('usar', 1.2, True, clip_usar),
    ('manipular', 1.6, True, clip_manipular),
    ('radio', 2.4, True, clip_radio),
    ('mirar', 1.2, True, clip_mirar),
    ('arremessar', 1.0, False, clip_arremessar),
    ('comer', 2.4, True, clip_comer),
    ('dormir', 4.0, True, clip_dormir),
    ('derrubado', 1.0, False, clip_derrubado),
    ('caido', 1.0, True, clip_caido),
    ('repouso', 4.0, True, clip_repouso),
    ('levantar', 1.5, False, clip_levantar),
    ('corda_subir', 1.2, True, clip_corda_subir),
    ('corda_descer', 1.2, True, clip_corda_descer),
    ('corda_parado', 2.4, True, clip_corda_parado),
    ('esconder_entrar', 0.7, False, clip_esconder_entrar),
    ('esconder_parado', 2.4, True, clip_esconder_parado),
    ('esconder_sair', 0.6, False, clip_esconder_sair),
    ('blink', 0.2, False, clip_blink),
    ('look_yaw', 1.0, False, clip_look_yaw),
    ('expr_tenso', 0.2, False, expr(brow=-0.5, brow_in=0.9, lids=0.25, open_=0.0, smile=-0.4)),
    ('expr_alivio', 0.2, False, expr(brow=0.5, brow_in=-0.2, lids=0.3, open_=0.25, smile=1.0)),
    ('expr_susto', 0.2, False, expr(brow=1.0, brow_in=-0.4, lids=-0.0, open_=0.9, smile=0.0)),
    ('expr_falando', 0.2, False, expr(brow=0.15, open_=0.7)),
]

FPS = 15


def make_all(arm_ob, C):
    rig = Rig(arm_ob)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0
    for pb in arm_ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for name, secs, loop, fn in CLIPS:
        key_pose_clip(rig, Clip(name, secs, FPS, loop), fn)
    print('CLIPS', [c[0] for c in CLIPS])
