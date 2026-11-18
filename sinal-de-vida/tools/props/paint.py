"""The paint of a prop, texel by texel, in the manner of Jonas and of the dog-robot (tools/models/dog.py): by script, with no picture and
no image model. Each texel of the atlas knows its point on the prop, its normal, its piece and material, how far it is from the nearest
sharp edge of its own face (convex: where paint and wood wear pale; concave: where dirt gathers), how near another piece is (the shadow and
the dark line painted where two pieces meet) and how much of the sky it sees (the light painted from above). That comes from the Raster of
tools/models/metal.py; the piece's own frame (procedural.py) gives the grain of a board along the board and a tone to every plank.

What is painted, in this order: the tone of each piece and the fading of the whole; the surface of its kind (wood grain, board joints and
nails; chipped paint with primer and bare metal; brushed steel; rust; pitted concrete; folded cloth); what a prop has drawn on it (DETAILS:
seams, bolts, bands, a pictogram: never a letter); the worn edges and the dark creases; dirt (streaks running down, grime at the joints,
dust on what looks up, the floor's dirt at the foot); the ink of the joints; the light from above with the shadow of each piece on the next;
the brush."""
import math
import numpy as np

BARE = np.array((0.74, 0.73, 0.69))        # metal rubbed bright
PRIMER = np.array((0.25, 0.175, 0.115))    # what shows where the paint has gone
RUST = np.array((0.47, 0.235, 0.10))
RUST_D = np.array((0.235, 0.125, 0.075))
DIRT = np.array((0.185, 0.145, 0.10))
DUST = np.array((0.52, 0.46, 0.36))
INK = np.array((0.13, 0.078, 0.05))        # the outline's dark brown (#21140d), for the lines painted in the texture
PALE = np.array((0.70, 0.66, 0.54))        # stencilled marks: a faded cream
LIGHT = np.array((-0.38, -0.30, 0.875)) / np.linalg.norm((-0.38, -0.30, 0.875))   # from above, a little from the front left
KINDS = ('plain', 'wood', 'steel', 'coat', 'rust', 'rubber', 'conc', 'cloth')


class Ctx:
    """What a DETAILS function gets: the texels' coordinates and normals, masks, and the pens (seam, bolts, band, rrect)."""


def paint(R, kit, frames, mats, spec, M, details=None):
    """R: the Raster (with occlusion); frames: procedural.FRAMES; mats: {name: (rgb, kind)}; M: the metal module (noise). -> (texels, 3)."""
    smooth, mix, vnoise, fbm = M.smooth, M.mix, M.vnoise, M.fbm
    P, N = R.P, R.N
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    nz = N[:, 2]
    m = len(x)
    H = max(0.2, float(z.max()))
    px = math.sqrt(float(kit.fa.sum()) / max(1, m))                     # metres across a texel, more or less
    we = max(0.0034, 1.15 * px)                                         # the width of a worn edge
    wl = max(0.0024, 0.85 * px)                                         # the width of an ink line
    grime_k, rust_k = spec.get('grime', 0.6) / 0.6, spec.get('rust', 0.0)
    standing = spec.get('floor', True)

    kind_of = np.array([KINDS.index(mats[n][1]) for n in R.mats])[R.mat]
    is_k = lambda *ks: np.isin(kind_of, [KINDS.index(k) for k in ks])
    col = np.array([mats[n][0] for n in R.mats], dtype=np.float64)[R.mat]
    col = col * np.array(spec.get('tint', (1, 1, 1)))
    wood, steel, coat, rusty, rubber, conc, cloth, plain = (is_k(k).astype(np.float64) for k in ('wood', 'steel', 'coat', 'rust', 'rubber', 'conc', 'cloth', 'plain'))

    # the piece's own frame: L (along its longest side, across, through), its half sizes, its own number
    pc = R.piece
    C = np.array([f[1] for f in frames]); AX = np.array([f[2] for f in frames]); HALF = np.array([f[3] for f in frames])
    RND = np.array([f[4] for f in frames]); SHAPE = np.array([f[0] for f in frames])
    L = np.einsum('ij,ikj->ik', P - C[pc], AX[pc])
    half, rnd, shape = HALF[pc], RND[pc], SHAPE[pc]
    rnd2 = (rnd * 7.31 + 0.137) % 1.0
    Q = L + (rnd * 37.0)[:, None]                                       # the same, shifted piece by piece: no two boards with one grain
    NL = np.einsum('ij,ikj->ik', N, AX[pc])                             # the normal in the piece's frame
    de, dc, near, sky = R.de, R.dc, R.near, R.sky

    n_big = fbm(P, 3.2, 3, 1)
    n_mid = fbm(P, 12.0, 3, 2)
    n_fine = fbm(P, 44.0, 2, 3)
    n_chip = fbm(P, 30.0, 3, 4)
    n_grain = vnoise(x * 230.0, y * 230.0, z * 230.0, 5)
    lines = np.zeros(m)
    lips = np.zeros(m)

    # ---- each piece its own tone; the whole faded in large patches, warm here and cool there ---------------------------------
    tone = 0.88 + 0.24 * rnd + wood * (0.26 * rnd - 0.10)
    col *= tone[:, None]
    col *= (1 + (rnd2 - 0.5)[:, None] * np.array((0.07, 0.0, -0.09)) * (0.4 + wood)[:, None])
    col *= (0.86 + 0.30 * n_big)[:, None]
    warm = smooth(0.45, 0.75, fbm(P, 5.5, 2, 7))
    col = mix(col, col * np.array((1.07, 1.0, 0.88)), warm * 0.7)
    col = mix(col, col * np.array((0.90, 0.98, 1.07)), smooth(0.55, 0.8, 1 - n_mid) * 0.5 * (steel + coat))

    # ---- wood: the grain along the board, a few dark veins and knots, the end grain; a wide face is boards, joined and nailed ----
    if wood.any():
        g = vnoise(Q[:, 0] * 2.6, Q[:, 1] * 80.0, Q[:, 2] * 80.0, 21)
        col *= (1 + wood * 0.26 * (g - 0.5))[:, None]
        vein = smooth(0.70, 0.82, vnoise(Q[:, 0] * 1.5, Q[:, 1] * 150.0, Q[:, 2] * 150.0, 22))
        col = mix(col, col * 0.56, wood * vein * 0.6)
        knot = smooth(0.875, 0.91, vnoise(Q[:, 0] * 6.0, Q[:, 1] * 15.0, Q[:, 2] * 15.0, 23))
        col = mix(col, col * 0.42 + RUST_D * 0.2, wood * knot * 0.75)
        endg = wood * smooth(0.6, 0.85, np.abs(NL[:, 0])) * (shape == 0)
        ring = 0.5 + 0.5 * np.cos(np.hypot(L[:, 1] + half[:, 1] * 0.6, L[:, 2] + half[:, 2] * 1.4) / 0.006)
        col = mix(col, col * (0.62 + 0.16 * ring)[:, None], endg)
        # boards: where the face is wide (more than 22 cm across), every 11 to 15 cm a joint, each board a tone, a nail at each end
        wide = wood * (half[:, 1] > 0.11) * (shape == 0) * smooth(0.6, 0.85, np.abs(NL[:, 2]))
        if wide.any():
            nb = np.maximum(2, np.round(2 * half[:, 1] / (0.115 + 0.04 * rnd)))
            wv = 2 * half[:, 1] / nb
            t = (L[:, 1] + half[:, 1]) / wv
            bi = np.floor(t)
            dj = (0.5 - np.abs(t - bi - 0.5)) * wv                       # metres to the nearest joint
            inner = (bi > 0) | (t - bi > 0.5)
            inner &= (bi < nb - 1) | (t - bi < 0.5)
            bt = ((bi * 0.618 + rnd * 9.7) % 1.0)
            col = mix(col, col * (0.80 + 0.36 * bt)[:, None], wide)
            lines = np.maximum(lines, wide * inner * (1 - smooth(wl * 0.5, wl * 1.1, dj)))
            lips = np.maximum(lips, wide * inner * smooth(wl * 1.0, wl * 1.6, dj) * (1 - smooth(wl * 2.0, wl * 3.6, dj)) * (t - bi < 0.5))
            du = half[:, 0] - np.abs(L[:, 0])
            nail = wide * (1 - smooth(wl * 1.2, wl * 2.0, np.hypot(du - 0.035, (t - bi - 0.5) * wv)))
            col = mix(col, INK * 1.6, nail * 0.85)
        # a single long board: two nails at each end
        single = wood * (half[:, 1] <= 0.11) * (half[:, 1] > 0.03) * (half[:, 0] > 0.25) * (shape == 0) * smooth(0.6, 0.85, np.abs(NL[:, 2]))
        du = half[:, 0] - np.abs(L[:, 0])
        nail = single * (1 - smooth(wl * 1.2, wl * 2.0, np.hypot(du - 0.03, np.abs(L[:, 1]) - half[:, 1] * 0.5)))
        col = mix(col, INK * 1.6, nail * 0.8)

    # ---- painted metal: chipped along the edges and low down; primer at the rim of a chip, bare metal or rust inside -------------
    edge = np.exp(-de / (3.0 * we))
    low = smooth(0.42, 0.05, z) if standing else np.zeros(m)
    thr = 0.75 - 0.36 * edge - 0.08 * low - 0.10 * rust_k + spec.get('chip', 0.0)       # chip: above 0, less of the paint is gone
    chip = smooth(thr, thr + 0.03, n_chip) * coat
    core = smooth(thr + 0.045, thr + 0.085, n_chip) * coat
    col = mix(col, PRIMER * (0.8 + 0.5 * n_mid)[:, None], chip)
    inside = mix(BARE * (0.6 + 0.4 * n_fine)[:, None], RUST * (0.7 + 0.6 * n_mid)[:, None], np.clip(rust_k * 1.4 + 0.25 * low, 0, 1))
    col = mix(col, inside, core * 0.7)
    scr = smooth(0.80, 0.86, vnoise(x * 9.0 + z * 4.0, y * 11.0 + z * 4.0, z * 250.0 - y * 60.0 - x * 40.0, 12)) * smooth(0.35, 0.6, n_mid)
    col = mix(col, BARE * 0.8, scr * 0.5 * coat)
    # rust: blooms on painted and bare metal, more where water sits (low, in the joints); it runs down from where it starts
    if rust_k > 0:
        bloom = smooth(0.72 - 0.2 * rust_k, 0.86 - 0.2 * rust_k, fbm(P, 8.0, 3, 31) + 0.12 * low + 0.2 * smooth(0.03, 0.0, near))
        run = smooth(0.55, 0.8, vnoise(x * 40.0, y * 40.0, z * 5.0, 32)) * smooth(0.5, 0.7, fbm(P + np.array((0, 0, 0.06)), 8.0, 3, 31)) * (1 - np.abs(nz))
        r_amt = np.clip(bloom * 0.85 + run * 0.35, 0, 1) * (coat + steel) * min(1.0, 0.35 + rust_k)
        col = mix(col, mix(RUST, RUST_D, n_mid) * (0.85 + 0.4 * n_fine)[:, None], r_amt)
    # ---- bare steel is brushed along the piece; rust metal is mottled orange and brown; rubber and plastic are dull -----------------
    brushed = vnoise(Q[:, 0] * 18.0, Q[:, 1] * 300.0, Q[:, 2] * 300.0, 8)
    col *= (1 + steel * 0.24 * (brushed - 0.5))[:, None]
    col = mix(col, col * np.array((1.25, 0.86, 0.6)), steel * smooth(0.05, 0.0, near) * (0.3 + 0.5 * n_mid) * (0.4 + rust_k))
    col = mix(col, mix(RUST * 1.15, RUST_D, smooth(0.35, 0.7, n_mid)), rusty * (0.35 + 0.4 * n_chip))
    col *= (1 + (rubber + plain) * 0.4 * (n_fine - 0.5))[:, None]
    # ---- concrete: mottled, pitted, a darker damp at its foot, chipped pale at the corners -----------------------------------------
    col *= (1 + conc * 0.34 * (n_mid - 0.5))[:, None]
    pit = smooth(0.80, 0.86, vnoise(x * 150.0, y * 150.0, z * 150.0, 41))
    col = mix(col, col * 0.5, conc * pit * 0.6)
    col = mix(col, col * np.array((0.62, 0.70, 0.68)), conc * smooth(0.55, 0.8, fbm(P, 4.0, 2, 42) + 0.5 * low) * 0.7)
    # ---- cloth: folds as soft bands of light and shade, a weave, stains, a stitched hem ---------------------------------------------
    if cloth.any():
        fold = fbm(Q * np.array((1.0, 1.0, 1.0)), 7.0, 2, 51)
        fold = smooth(0.30, 0.70, fold + 0.25 * np.sin(Q[:, 0] * 23.0 + 5.0 * fbm(P, 4.0, 2, 52)))
        col *= (1 + cloth * (0.36 * fold - 0.20))[:, None]
        weave = vnoise(x * 420.0, y * 420.0, z * 420.0, 53)
        col *= (1 + cloth * 0.10 * (weave - 0.5))[:, None]
        stain = smooth(0.58, 0.74, fbm(P, 5.0, 3, 54))
        col = mix(col, col * np.array((0.74, 0.66, 0.52)), cloth * stain * 0.55 * grime_k)
        hem = (1 - smooth(wl * 0.5, wl * 1.2, np.abs(de - max(0.016, 4 * px)))) * (0.5 + 0.5 * (np.sin((L[:, 0] + L[:, 1]) / 0.006) > -0.2))
        col = mix(col, col * 0.6, cloth * hem * 0.7)

    # ---- what the prop has drawn on it ------------------------------------------------------------------------------------------------
    if details:
        c = Ctx()
        c.P, c.N, c.x, c.y, c.z, c.nx, c.ny, c.nz = P, N, x, y, z, N[:, 0], N[:, 1], nz
        c.L, c.half, c.rnd, c.piece, c.m, c.H, c.px, c.wl = L, half, rnd, pc, m, H, px, wl
        c.is_k, c.smooth, c.mix, c.vnoise, c.fbm = is_k, smooth, mix, vnoise, fbm
        c.n_mid, c.n_fine = n_mid, n_fine
        c.col, c.lines, c.lips, c.coat = col, lines, lips, coat

        def seam(mask, d, w=None, lip=1.0):
            w = w or wl
            a = np.abs(d)
            c.lines = np.maximum(c.lines, mask * (1 - smooth(w * 0.5, w * 1.1, a)))
            c.lips = np.maximum(c.lips, mask * lip * smooth(w * 0.9, w * 1.5, d) * (1 - smooth(w * 1.9, w * 3.4, d)))

        def bolts(mask, a, b, centres, r, light=(-0.45, 0.9), tone=0.62):
            r = max(r, 1.6 * px)
            for i, (ca, cb) in enumerate(centres):
                da, db = a - ca, b - cb
                d = np.hypot(da, db)
                sel = (mask > 0) & (d < r * 1.9)
                if not sel.any():
                    continue
                ds, das, dbs = d[sel], da[sel], db[sel]
                lit = (das * light[0] + dbs * light[1]) / r
                head = BARE[None, :] * (tone * (0.72 + 0.42 * np.clip(lit, -1, 1)))[:, None]
                cc = c.col[sel]
                shadow = (1 - smooth(r * 1.0, r * 1.9, ds)) * (0.45 + 0.4 * np.clip(-lit / 1.6, 0, 1))
                cc = mix(cc, INK, shadow)
                cc = mix(cc, head, 1 - smooth(r * 0.82, r * 1.0, ds))
                c.col[sel] = cc

        def rrect(a, b, ca, cb, ha, hb, rad):
            qa, qb = np.abs(a - ca) - (ha - rad), np.abs(b - cb) - (hb - rad)
            return np.hypot(np.maximum(qa, 0), np.maximum(qb, 0)) + np.minimum(np.maximum(qa, qb), 0) - rad

        def fill(mask, colour, k=0.9, wear=0.45):
            """Paint over the coat (a band, a mark): it wears where the noise says."""
            a = np.clip(mask, 0, 1) * k * (1 - wear * smooth(0.45, 0.7, c.n_fine * 0.6 + c.n_mid * 0.6))
            c.col = mix(c.col, np.asarray(colour), a)

        c.seam, c.bolts, c.rrect, c.fill = seam, bolts, rrect, fill
        details(c)
        col, lines, lips = c.col, c.lines, c.lips

    # ---- the edges: worn pale where they stand out, dark where two faces meet inward --------------------------------------------------
    rub = np.exp(-de / we) * (0.45 + 0.55 * smooth(0.25, 0.7, n_fine + 0.25 * n_grain))
    edge_col = (BARE[None, :] * (steel + coat)[:, None] + np.array((0.66, 0.43, 0.25))[None, :] * rusty[:, None]
                + (col * 1.3 + 0.05) * wood[:, None] + (col * 1.5 + 0.07) * plain[:, None] + (col * 1.22 + 0.03) * cloth[:, None]
                + np.array((0.30, 0.29, 0.275))[None, :] * rubber[:, None] + (col * 1.32 + 0.05) * conc[:, None])
    col = mix(col, edge_col, np.clip(rub * (0.92 - 0.3 * cloth), 0, 1))
    col *= (1 - 0.6 * np.exp(-dc / (1.3 * we)))[:, None]

    # ---- dirt: streaks running down, grime where pieces meet, dust on what looks up, the floor on the foot ----------------------------
    upright = 1 - np.abs(nz)
    streak = smooth(0.52, 0.86, vnoise(x * 44.0, y * 44.0, z * 4.2, 9)) * upright
    col = mix(col, DIRT, np.clip(streak * 0.42 * grime_k * (0.4 + 0.6 * n_mid) * (1 - 0.5 * rubber - 0.45 * wood), 0, 1))
    grime = smooth(0.05, 0.0, near)
    col = mix(col, DIRT * 0.75, np.clip(grime * 0.42 * grime_k * (0.45 + 0.55 * n_mid) * (1 - 0.4 * wood), 0, 1))
    dust = np.clip(nz, 0, 1) ** 2 * smooth(0.3, 0.7, fbm(P, 9.0, 2, 10))
    col = mix(col, DUST, dust * 0.2 * min(1.2, grime_k))
    if standing:
        foot = smooth(min(0.24, 0.3 * H), 0.01, z) * (0.25 + 0.75 * fbm(P, 15.0, 2, 13))
        col = mix(col, DIRT * (0.95 + 0.5 * n_fine)[:, None], np.clip(foot * 0.5 * grime_k, 0, 1))
        spatter = smooth(0.76, 0.82, vnoise(x * 70.0, y * 70.0, z * 70.0, 15)) * smooth(0.42, 0.1, z)
        col = mix(col, DIRT * 0.9, spatter * 0.5)

    # ---- the drawing: a dark line where two pieces meet and along a crease, the lip that catches the light beside a joint ---------------
    lines = np.maximum(lines, smooth(2.0 * wl, 0.7 * wl, near) * 0.9)
    lines = np.maximum(lines, (1 - smooth(0.5 * wl, 1.2 * wl, dc)) * 0.9)
    col = mix(col, col * 1.42 + 0.04, np.clip(lips, 0, 1) * 0.55)
    col = mix(col, INK, np.clip(lines, 0, 1) * 0.86)

    # ---- the light, painted: from above and a little from the front left; a sheen on metal that turns to it; the shadow of what
    # overhangs and of every piece on its neighbour (cool, as the night of the station is) ----------------------------------------------
    lit = 0.78 + 0.26 * np.clip(nz, 0, 1) - 0.30 * np.clip(-nz, 0, 1) + 0.08 * N.dot(LIGHT)
    sheen = smooth(0.80, 0.985, N.dot(LIGHT)) * (steel * 0.16 + coat * 0.07 + plain * 0.03)
    col = col * lit[:, None] + (sheen * (0.6 + 0.8 * n_fine))[:, None]
    shade = (1 - sky) * 0.55 + 0.36 * smooth(0.04, 0.0, near) * sky
    col = mix(col, col * np.array((0.34, 0.36, 0.46)), np.clip(shade, 0, 1))
    if standing:
        col *= (0.86 + 0.14 * smooth(0.0, min(0.5, 0.5 * H), z))[:, None]
    # the brush: a mottle of two sizes and strokes that follow nothing, so that no patch is flat
    stroke = vnoise(x * 60.0 + y * 25.0, y * 9.0 - x * 4.0, z * 55.0, 61)
    col *= (1 + 0.12 * (n_mid - 0.5) + 0.07 * (n_grain - 0.5) + 0.08 * (stroke - 0.5))[:, None]
    g = col.dot(np.array((0.3, 0.59, 0.11)))[:, None]
    col = g + (col - g) * spec.get('sat', 1.15)
    col = (col - 0.36) * spec.get('contrast', 1.12) + 0.36
    return np.clip(col * spec.get('gain', 1.0), 0.012, 1.0)
