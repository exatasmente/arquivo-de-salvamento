"""The person model of Sinal de Vida, built from nothing by script: one rig, two bodies, parts that the game switches on by
name (hair, beard, glasses, headlamp, backpack), and the animations.

    "$BLENDER" --background --factory-startup --python tools/models/person.py -- --out assets/models

Writes <out>/person.glb. Everything is by name so the game can recolour and switch it from a seed:

  materials  skin hair brow eye iris lip mouth top under pants belt shoe sole metal strap pack frame lamp
  objects    head_m head_f eyes lids brows mouth skin_m skin_f jacket_m jacket_f shirt_m shirt_f pants_m pants_f shoes
             hair_curto hair_longo hair_rabo hair_coque hair_raspado beard_rala beard_cheia beard_cavanhaque
             glasses lamp_head pack
  bones      root hips spine1 spine2 neck head brow_L/R lid_L/R mouth clavicle_* upper_arm_* forearm_* hand_*
             index1..3_* middle.. ring.. pinky.. thumb1..3_*  thigh_* shin_* foot_* toe_*   (_L / _R)
Proportions: a little stylized (a bigger head and hands), adults, 1.75 m. Faces +Y here, which is -Z in three.js.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

import common as C  # noqa: E402
from common import MB, hexc, mixc, smooth  # noqa: E402
import person_anim as A  # noqa: E402

V = Vector
SIDES = {'R': 1, 'L': -1}

# ---------------------------------------------------------------------------------------------------------------
# the skeleton

HEAD_C = V((0, 0.012, 1.655))
HEAD_R = (0.108, 0.112, 0.128)

FINGERS = {  # name: (lateral offset on the knuckle line, lengths of the three phalanges, radius)
    'index': (0.023, (0.048, 0.029, 0.025), 0.0125),
    'middle': (0.008, (0.054, 0.034, 0.026), 0.013),
    'ring': (-0.009, (0.048, 0.03, 0.025), 0.0122),
    'pinky': (-0.025, (0.039, 0.025, 0.021), 0.011),
}
THUMB = (0.04, 0.031, 0.026)


def arm_points(S, fem):
    """Shoulder, elbow, wrist, and the direction of the hand, in the rest A-pose."""
    sh = V((S * (0.172 if fem else 0.188), 0.0, 1.40))
    e = sh + V((S * 0.12, 0.012, -0.262)) * (0.96 if fem else 1.0)
    w = e + V((S * 0.08, 0.08, -0.226)) * (0.96 if fem else 1.0)
    hd = V((S * 0.30, 0.18, -0.93)).normalized()
    return sh, e, w, hd


def hand_frame(S, hd):
    """lateral (front, toward the thumb) and thickness (across, toward the inside) axes of the hanging hand."""
    lat = (V((0, 1, 0)) - hd * hd.y).normalized()
    thick = lat.cross(hd).normalized()
    return lat, thick


def skeleton():
    """(name, parent, head, tail, hint) for every bone; the male proportions (the female body uses the same bones)."""
    sp = []
    add = lambda n, p, h, t, hint=(1, 0, 0): sp.append((n, p, tuple(warp(h)), tuple(warp(t)), hint))
    add('root', None, (0, 0, 0), (0, 0, 0.12))
    add('hips', 'root', (0, 0, 0.95), (0, 0, 1.05))
    add('spine1', 'hips', (0, 0, 1.05), (0, 0, 1.20))
    add('spine2', 'spine1', (0, 0, 1.20), (0, 0, 1.40))
    add('neck', 'spine2', (0, 0, 1.40), (0, 0.012, 1.50))
    add('head', 'neck', (0, 0.012, 1.50), (0, 0.012, 1.79))
    # face bones: small, at the places they move
    for n, S in (('R', 1), ('L', -1)):
        add(f'brow_{n}', 'head', (S * 0.048, 0.108, 1.728), (S * 0.048, 0.108, 1.745))
        add(f'lid_{n}', 'head', (S * 0.05, 0.088, 1.675), (S * 0.05, 0.1, 1.675), (0, 0, 1))
    add('mouth', 'head', (0, 0.1, 1.592), (0, 0.1, 1.607))
    for n, S in (('R', 1), ('L', -1)):
        sh, e, w, hd = arm_points(S, False)
        add(f'clavicle_{n}', 'spine2', (S * 0.03, 0.0, 1.405), (S * 0.17, 0.0, 1.41), (0, 1, 0))
        add(f'upper_arm_{n}', f'clavicle_{n}', sh, e)
        add(f'forearm_{n}', f'upper_arm_{n}', e, w)
        wr = w + hd * 0.10
        add(f'hand_{n}', f'forearm_{n}', w, wr, (0, 1, 0))
        lat, thick = hand_frame(S, hd)
        for fname, (off, lens, rad) in FINGERS.items():
            p0 = wr + lat * off
            prev = f'hand_{n}'
            for j, ln in enumerate(lens):
                p1 = p0 + hd * ln
                add(f'{fname}{j + 1}_{n}', prev, p0, p1, (0, 1, 0))
                prev = f'{fname}{j + 1}_{n}'
                p0 = p1
        # thumb: from the base of the palm, out to the front
        tb = w + hd * 0.035 + lat * 0.022 + thick * (-S * 0.0 if False else 0)
        td = (hd * 0.62 + lat * 0.72).normalized()
        p0 = tb
        prev = f'hand_{n}'
        for j, ln in enumerate(THUMB):
            p1 = p0 + td * ln
            add(f'thumb{j + 1}_{n}', prev, p0, p1, (0, 1, 0))
            prev = f'thumb{j + 1}_{n}'
            p0 = p1
    for n, S in (('R', 1), ('L', -1)):
        add(f'thigh_{n}', 'hips', (S * 0.09, 0, 0.93), (S * 0.096, 0.018, 0.50))
        add(f'shin_{n}', f'thigh_{n}', (S * 0.096, 0.018, 0.50), (S * 0.095, 0.0, 0.092))
        add(f'foot_{n}', f'shin_{n}', (S * 0.095, 0.0, 0.092), (S * 0.095, 0.12, 0.035))
        add(f'toe_{n}', f'foot_{n}', (S * 0.095, 0.12, 0.035), (S * 0.095, 0.21, 0.022))
    return sp


from person_shared import *  # noqa: F401,F403,E402
import person_face as F  # noqa: E402
import person_outfits as O  # noqa: E402
import person_shared as PS  # noqa: E402
SZ = PS.S
PS.BODY = sys.modules[__name__]

# ---------------------------------------------------------------------------------------------------------------
# the body of each sex: torso (cloth), arms, legs

def torso_sections(fem, jacket):
    """Half widths and depths down the body. The jacket is bigger and ends lower; the shirt hugs."""
    g = 1.085 if jacket else 1.03
    if fem:
        rows = [(0.905, .165, .105), (1.00, .178, .113), (1.10, .136, .092), (1.19, .139, .092), (1.275, .152, .106), (1.34, .176, .104), (1.395, .168, .092), (1.428, .118, .074), (1.455, .066, .060)]
    else:
        rows = [(0.905, .160, .104), (1.00, .170, .110), (1.10, .152, .100), (1.19, .160, .102), (1.285, .190, .114), (1.35, .204, .110), (1.40, .184, .094), (1.43, .125, .076), (1.458, .068, .062)]
    out = []
    for z, rx, ry in rows:
        if z > 1.42:
            out.append((z, rx, ry))
        else:
            out.append((z, rx * g, ry * g))
    return out


def build_torso(fem, jacket, top_name, under_name):
    """The garment of the upper body (one piece with the collar and the details). Returns a Part."""
    P = Part(f'{"jacket" if jacket else "shirt"}_{"f" if fem else "m"}', allowed=['hips', 'spine1', 'spine2', 'neck', 'clavicle_L', 'clavicle_R'], mat='top')
    mb = P.mb
    rows = torso_sections(fem, jacket)
    lo = 0.93 if jacket else 1.0
    secs = []
    for z, rx, ry in rows:
        if z < lo - 0.02:
            continue
        # a soft ripple at the waist, a belly of folds, and the breasts
        def kf(th, z=z):
            kk = 1.0 + 0.022 * math.sin(4 * th + z * 22) * (1.0 if jacket else 0.5)
            if fem and 1.24 < z < 1.36:
                for sgn in (-1, 1):
                    kk += 0.10 * math.exp(-((th - math.pi / 2 - sgn * 0.62) ** 2) / 0.10) * (1.0 if jacket else 1.25)
            return kk
        secs.append({'c': (0, 0.0 if z < 1.4 else 0.004, z), 'd': (0, 0, 1), 'rx': rx, 'ry': ry, 'k': kf})
    if jacket:  # the hem flares a little and the cut at the hip
        secs[0]['rx'] *= 1.04
        secs[0]['ry'] *= 1.05
    mb.loft(secs, SZ(14), cap0=None, cap1=0.012, mat='top', colfn=shade_z(0.95, 1.46, 0.74, 1.06))
    # under the jacket at the neck: the collar of the shirt below it
    mb.loft([{'c': (0, 0.006, 1.425), 'd': (0, 0, 1), 'rx': 0.064, 'ry': 0.062}, {'c': (0, 0.008, 1.475), 'd': (0, 0, 1), 'rx': 0.056, 'ry': 0.055}],
            SZ(10), cap0=None, cap1=None, mat='under', colfn=shade_z(1.4, 1.5, 0.9, 1.05))
    if jacket:
        # the collar: a flared ring that stands up around the neck
        mb.loft([{'c': (0, 0.002, 1.43), 'd': (0, 0, 1), 'rx': 0.105, 'ry': 0.085, 'k': lambda th: 1 + 0.07 * math.sin(th * 3)},
                 {'c': (0, 0.012, 1.468), 'd': (0, 0, 1), 'rx': 0.086, 'ry': 0.074},
                 {'c': (0, 0.012, 1.508), 'd': (0, 0, 1), 'rx': 0.08, 'ry': 0.068}],
                SZ(12), cap0=None, cap1=None, mat='top', colfn=shade_z(1.4, 1.5, 0.78, 1.1))
        # the zip down the front and two pockets
        fy = (0.108 if not fem else 0.106) * 1.085 + 0.003
        for z0 in (1.30, 1.18, 1.06):
            mb.box((0, fy, z0), (0.012, 0.007, 0.115), mat='metal', col=(0.8, 0.8, 0.8))
        for sgn in (-1, 1):
            mb.box((sgn * 0.085, 0.108 * 1.085 - 0.002, 1.05), (0.07, 0.008, 0.045), mat='top', col=(0.86, 0.86, 0.86),
                   rot=Matrix.Rotation(sgn * 0.12, 3, 'Y'))
    else:
        # a shirt: buttons, and a collar flat on the neck
        for z0 in (1.33, 1.22, 1.12, 1.02):
            mb.sphere((0, 0.103 * 1.03 + 0.001, z0), 0.007, SZ(5), SZ(3), mat='metal', col=(0.85, 0.85, 0.85))
        mb.loft([{'c': (0, 0.002, 1.43), 'd': (0, 0, 1), 'rx': 0.08, 'ry': 0.07}, {'c': (0, 0.006, 1.47), 'd': (0, 0, 1), 'rx': 0.062, 'ry': 0.058}],
                SZ(10), cap0=None, cap1=None, mat='top', colfn=shade_z(1.4, 1.5, 0.8, 1.1))
    return P


def build_sleeves(fem, jacket, P):
    """Sleeves go into the garment part (weighted by the arm bones)."""
    mb = P.mb
    for n, S in (('R', 1), ('L', -1)):
        sh, e, w, hd = arm_points(S, fem)
        g = 1.0
        up = (sh + (e - sh) * 0.0, sh + (e - sh) * 0.28, sh + (e - sh) * 0.62, e + (sh - e) * 0.08, e, e + (w - e) * 0.1)
        r0 = (0.060 if not fem else 0.051) * (1.14 if jacket else 1.04)
        rs = [r0 * 1.0, r0 * 1.0, r0 * 0.95, r0 * 0.91, r0 * 0.9, r0 * 0.88]
        tube(mb, list(up), [(r, r * 0.97) for r in rs], SZ(8), mat='top', colfn=shade_z(1.1, 1.45, 0.72, 1.04), cap0=0.045, cap1=None,
             k=lambda i, p: (lambda th: 1 + 0.03 * math.sin(3 * th + i * 1.7)))
        fo = (e + (w - e) * 0.1, e + (w - e) * 0.3, e + (w - e) * 0.55, e + (w - e) * 0.8, e + (w - e) * 0.94)
        rr = r0 * 0.88
        rs2 = [rr, rr * 0.95, rr * 0.9, rr * 0.88, rr * 0.9 * (1.03 if jacket else 1.0)]
        tube(mb, list(fo), [(r, r) for r in rs2], SZ(8), mat='top', colfn=shade_z(1.0, 1.4, 0.72, 1.0), cap0=None, cap1=0.0 if True else None,
             k=lambda i, p: (lambda th: 1 + 0.035 * math.sin(3 * th + i * 2.3)))
        # the cuff (a ring a little thicker, darker)
        cw = w - hd * 0.012
        tube(mb, [cw - (w - e).normalized() * 0.035, cw], [(rr * 1.09, rr * 1.09), (rr * 1.1, rr * 1.1)], SZ(8), mat='top',
             colfn=lambda p, n, s: (0.68, 0.68, 0.66), cap0=None, cap1=None)


def build_skin(fem, P):
    """Arms from the shoulder to the wrist, hands with fingers. (The sleeves hide most of the arm.)"""
    mb = P.mb
    thick = 0.88 if fem else 1.0
    hand_k = 1.16
    for n, S in (('R', 1), ('L', -1)):
        sh, e, w, hd = arm_points(S, fem)
        r0 = 0.046 * thick
        pts = [sh, sh + (e - sh) * 0.5, e, e + (w - e) * 0.5, w]
        rad = [r0, r0 * 0.94, r0 * 0.82, r0 * 0.78, r0 * 0.62]
        tube(mb, pts, [(r, r * 0.95) for r in rad], SZ(8), mat='skin', colfn=limb_fn, cap0=0.02, cap1=None)
        # hand
        lat, thick_ax = hand_frame(S, hd)
        wr = w + hd * 0.10 * hand_k
        palm = [w - hd * 0.004, w + hd * 0.04, w + hd * 0.075, wr]
        tube(mb, palm, [(0.034, 0.024), (0.038, 0.027), (0.039, 0.028), (0.037, 0.024)], SZ(8), mat='skin', colfn=limb_fn, cap1=0.012, hint=tuple(lat), cap0=None)
        for fname, (off, lens, rad_) in FINGERS.items():
            p0 = wr + lat * off
            pts = [p0]
            for ln in lens:
                p0 = p0 + hd * ln
                pts.append(p0)
            rads = [rad_ * 1.02, rad_, rad_ * 0.9, rad_ * 0.78]
            tube(mb, pts, [(r, r) for r in rads], SZ(6), mat='skin', colfn=limb_fn, cap1=0.008, cap0=None, hint=tuple(lat))
            if PS.F > 1:
                # the knuckle, and a nail on the tip of the finger
                mb.sphere(pts[0] + hd * 0.004, rad_ * 1.12, 6, 4, mat='skin', colfn=limb_fn)
                mb.sphere(pts[-1] + hd * 0.001 - lat * 0.0, (rad_ * 0.62, rad_ * 0.5, rad_ * 0.8), 6, 3, mat='nail', col=(1.05, 1.0, 0.98))
        tb = w + hd * 0.035 + lat * 0.022
        td = (hd * 0.62 + lat * 0.72).normalized()
        pts = [tb, tb + td * 0.04, tb + td * 0.071, tb + td * 0.097]
        tube(mb, pts, [(0.0152, 0.0148), (0.014, 0.0138), (0.0126, 0.0126), (0.0108, 0.0108)], SZ(6), mat='skin', colfn=limb_fn, cap1=0.008, cap0=None, hint=(1, 0, 0))


def build_pants(fem, P, wide=1.0):
    mb = P.mb
    g = 1.0
    if fem:
        rows = [(1.105, .134, .092), (1.04, .160, .108), (0.985, .175, .114), (0.93, .168, .112)]
    else:
        rows = [(1.105, .150, .100), (1.04, .160, .106), (0.985, .168, .112), (0.93, .160, .108)]
    secs = [{'c': (0, 0.0, z), 'd': (0, 0, 1), 'rx': rx, 'ry': ry, 'k': (lambda th, z=z: 1 + 0.02 * math.sin(5 * th + z * 30))} for z, rx, ry in reversed(rows)]
    # from the crotch up to the waist
    mb.loft(list(reversed(secs)), SZ(14), cap0=None, cap1=None, mat='pants', colfn=shade_z(0.9, 1.1, 0.72, 1.0))
    # the belt
    mb.loft([{'c': (0, 0, 1.095), 'd': (0, 0, 1), 'rx': rows[0][1] * 1.035, 'ry': rows[0][2] * 1.04}, {'c': (0, 0, 1.125), 'd': (0, 0, 1), 'rx': rows[0][1] * 1.03, 'ry': rows[0][2] * 1.035}],
            SZ(14), cap0=None, cap1=None, mat='belt', colfn=lambda p, n, s: (0.9, 0.9, 0.9))
    mb.box((0, rows[0][2] * 1.04 + 0.002, 1.11), (0.032, 0.008, 0.026), mat='metal', col=(0.85, 0.85, 0.8))
    for n, S in (('R', 1), ('L', -1)):
        hip = V((S * 0.09, 0.0, 0.94))
        kn = V((S * 0.096, 0.018, 0.50))
        an = V((S * 0.095, 0.0, 0.092))
        t = (0.087 if not fem else 0.090) * wide
        # thigh: sections with a little more near the knee for the bend
        pts = [hip + (kn - hip) * f for f in (0.0, 0.18, 0.4, 0.62, 0.82, 0.93, 1.0)]
        rr = [t * 1.06, t * 1.08, t * 1.0, t * 0.88, t * 0.78, t * 0.76, t * 0.76]
        tube(mb, pts, [(r, r * 1.02) for r in rr], SZ(8), mat='pants', colfn=shade_z(0.05, 1.0, 0.7, 1.02), cap0=None, cap1=None,
             k=lambda i, p: (lambda th: 1 + 0.04 * math.sin(3 * th + i * 1.3)))
        pts = [kn + (an - kn) * f for f in (-0.06, 0.07, 0.25, 0.5, 0.78, 0.94, 1.0)]
        rr = [t * 0.8, t * 0.75, t * 0.70, t * 0.62, t * 0.58, t * 0.62, t * 0.65]
        tube(mb, pts, [(r, r * 0.96) for r in rr], SZ(8), mat='pants', colfn=shade_z(0.05, 1.0, 0.7, 1.02), cap0=None, cap1=None,
             k=lambda i, p: (lambda th: 1 + 0.045 * math.sin(3 * th + i * 2.1) * (1 if i > 4 else 0.6)))


def build_shoes(P):
    mb = P.mb
    for sx in (1, -1):
        mb.merge(O.boots(sx))


def main():
    args = C.script_args()
    out = args['out']
    lod = args.get('lod') == '1'
    PS.F = 0.6 if lod else 1.45
    C.reset_scene()
    sp = skeleton()
    arm, info = C.build_armature('person_rig', sp)
    info = bones_info(sp)
    objs = []
    stats = {}

    def emit(mb, bone=None, allowed=None, name=None):
        if not mb.f:
            return None
        mb.v = [warp(q) for q in mb.v]
        ob = C.make_object(mb)
        if name:
            ob.name = name
        if bone:
            C.rigid(ob, mb, bone)
        else:
            C.weigh(ob, mb, info, allowed)
        C.bind(ob, arm)
        stats[ob.name] = mb.tris()
        objs.append(ob)
        return ob

    legs = lambda S: [f'thigh_{S}', f'shin_{S}', f'foot_{S}', f'toe_{S}']

    def arm_chain(S):
        return [f'clavicle_{S}', f'upper_arm_{S}', f'forearm_{S}', f'hand_{S}']

    for fem in (False, True):
        sx = 'f' if fem else 'm'
        hm = F.head_mesh(fem)
        parts, sy = F.build_face(hm, fem)
        # head: rigid to the head; neck: weighted
        hm.merge(parts['extra'])
        emit(hm, bone='head', name=f'head_{sx}')
        emit(parts['neck'], allowed=['spine2', 'neck', 'head'], name=f'neck_{sx}')
        if not fem:
            emit(parts['eyes'], bone='head', name='eyes')
            # the lids are two shells, one per eye; split by side so each follows its own bone
            lid_all = parts['lids']
            for n, S in (('R', 1), ('L', -1)):
                sub = MB(f'lid_{n}')
                sub.default_mat = 'skin'
                keep = [(f, m) for f, m in zip(lid_all.f, lid_all.fm) if (sum((V(lid_all.v[i]).x for i in f)) / len(f)) * S > 0]
                used = sorted({i for f, _ in keep for i in f})
                remap = {o: k for k, o in enumerate(used)}
                for o in used:
                    sub.v.append(lid_all.v[o]); sub.n.append(lid_all.n[o]); sub.col.append(lid_all.col[o])
                for f, m in keep:
                    sub.f.append(tuple(remap[i] for i in f)); sub.fm.append(m)
                ob = emit(sub, bone=f'lid_{n}', name=f'lid_{n}')
            for n, S in (('R', 1), ('L', -1)):
                sub = MB(f'brow_{n}')
                sub.default_mat = 'brow'
                bw = parts['brows']
                keep = [(f, m) for f, m in zip(bw.f, bw.fm) if (sum((V(bw.v[i]).x for i in f)) / len(f)) * S > 0]
                used = sorted({i for f, _ in keep for i in f})
                remap = {o: k for k, o in enumerate(used)}
                for o in used:
                    sub.v.append(bw.v[o]); sub.n.append(bw.n[o]); sub.col.append(bw.col[o])
                for f, m in keep:
                    sub.f.append(tuple(remap[i] for i in f)); sub.fm.append(m)
                emit(sub, bone=f'brow_{n}', name=f'brow_{n}')
            emit(parts['mouth'], bone='mouth', name='mouth')
            for k, mb in F.hair_parts(False, sy).items():
                emit(mb, bone='head', name=k)
            for k, mb in F.beards(False, sy).items():
                emit(mb, bone='head', name=k)
            emit(F.glasses_mesh(sy), bone='head', name='glasses')
            emit(F.lamp_mesh(sy), bone='head', name='lamp_head')
            wr, lines = O.wrinkles()
            for pts in lines:
                P3 = [V((x, sy(x, z) + 0.0012, z)) for x, z in pts]
                F.tube(wr, P3, [(0.0016, 0.0011)] * len(P3), SZ(4), mat='wrinkle', colfn=lambda q, n, s: (1, 1, 1), cap0=0.001, cap1=0.001, hint=(0, 0, 1))
            emit(wr, bone='head', name='wrinkles')

            emit(F.pack_mesh(), allowed=['spine1', 'spine2', 'clavicle_L', 'clavicle_R', 'neck'], name='pack')
            shoes = Part('shoes', mat='shoe')
            build_shoes(shoes)
            # the shoes: each foot is its own mesh bound to its foot bones; they are built together, so split by side
            sh = shoes.mb
            for n, S in (('R', 1), ('L', -1)):
                sub = MB(f'shoe_{n}')
                keep = [(f, m) for f, m in zip(sh.f, sh.fm) if (sum((V(sh.v[i]).x for i in f)) / len(f)) * S > 0]
                used = sorted({i for f, _ in keep for i in f})
                remap = {o: k for k, o in enumerate(used)}
                for o in used:
                    sub.v.append(sh.v[o]); sub.n.append(sh.n[o]); sub.col.append(sh.col[o])
                for f, m in keep:
                    sub.f.append(tuple(remap[i] for i in f)); sub.fm.append(m)
                emit(sub, allowed=[f'shin_{n}', f'foot_{n}', f'toe_{n}'], name=f'shoe_{n}')
        # the skin of the arms and hands, per body
        for S, n in ((1, 'R'), (-1, 'L')):
            sk = Part(f'skin_{sx}_{n}')
            sub = sk.mb
            full = MB('x'); full.default_mat = 'skin'
            # build both arms into the same MB and split by side
        skin = Part('skin', mat='skin')
        build_skin(fem, skin)
        for n, S in (('R', 1), ('L', -1)):
            src = skin.mb
            sub = MB(f'skin_{sx}_{n}')
            sub.default_mat = 'skin'
            keep = [(f, m) for f, m in zip(src.f, src.fm) if (sum((V(src.v[i]).x for i in f)) / len(f)) * S > 0]
            used = sorted({i for f, _ in keep for i in f})
            remap = {o: k for k, o in enumerate(used)}
            for o in used:
                sub.v.append(src.v[o]); sub.n.append(src.n[o]); sub.col.append(src.col[o])
            for f, m in keep:
                sub.f.append(tuple(remap[i] for i in f)); sub.fm.append(m)
            emit(sub, allowed=['spine2'] + arm_chain(n) + [f'{f}{j}_{n}' for f in ('index', 'middle', 'ring', 'pinky', 'thumb') for j in (1, 2, 3)], name=f'skin_{sx}_{n}')
        # the garments
        for jacket in (True, False):
            g = build_torso(fem, jacket, 'top', 'under')
            build_sleeves(fem, jacket, g)
            emit(g.mb, allowed=['hips', 'spine1', 'spine2', 'neck', 'clavicle_L', 'clavicle_R', 'upper_arm_L', 'upper_arm_R', 'forearm_L', 'forearm_R'], name=g.name)
        body_all = ['hips', 'spine1', 'spine2', 'neck', 'clavicle_L', 'clavicle_R', 'upper_arm_L', 'upper_arm_R', 'forearm_L', 'forearm_R']
        leg_all = ['hips', 'spine1', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R']
        emit(O.tee(fem), allowed=body_all, name=f'tee_{sx}')
        if not fem:
            emit(O.work_jacket(), allowed=body_all, name='ojacket_m')
            emit(O.cargo_extras(), allowed=['hips', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R'], name='cargo_m')
            emit(O.toolbelt(), allowed=['hips', 'spine1', 'thigh_L', 'thigh_R'], name='toolbelt')
        else:
            emit(O.cardigan(), allowed=body_all + ['thigh_L', 'thigh_R'], name='cardigan_f')
            emit(O.apron(), allowed=['hips', 'spine1', 'spine2', 'neck', 'thigh_L', 'thigh_R'], name='apron_f')
            pw = Part('pants_w_f', mat='pants')
            build_pants(True, pw, 1.28)
            emit(pw.mb, allowed=leg_all, name='pants_w_f')
            hood, scarf = O.hood_and_scarf()
            emit(hood, allowed=['spine2', 'neck', 'head', 'clavicle_L', 'clavicle_R'], name='hood_f')
            emit(scarf, allowed=['spine2', 'neck', 'head'], name='scarf')
            emit(O.glasses_cord(), allowed=['head', 'neck', 'spine2'], name='cord')
            small = F.pack_mesh()
            c = V((0, -0.16, 1.25))
            small.transform(Matrix.Translation(c) @ Matrix.Scale(0.7, 4) @ Matrix.Translation(-c))
            emit(small, allowed=['spine1', 'spine2', 'clavicle_L', 'clavicle_R', 'neck'], name='pack_small')
        pants = Part(f'pants_{sx}', mat='pants')
        build_pants(fem, pants)
        emit(pants.mb, allowed=['hips', 'spine1', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R'], name=f'pants_{sx}')
    # animations
    A.make_all(arm, C)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(out, 'person_lod.glb' if lod else 'person.glb')
    C.export_glb(path)
    tot = {k: v for k, v in stats.items()}
    print('PARTS', tot)
    print('WROTE', path, os.path.getsize(path))


main()
