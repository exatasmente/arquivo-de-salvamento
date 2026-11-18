"""What each prop has drawn on it, over its surface and under the wear: seams, bolts, bands, a pictogram. Never a letter or a number.
DETAILS[name](c): c is the painter's context (paint.py): coordinates x, y, z (metres, z up, the front at -y), normals, the pens
c.seam(mask, distance), c.bolts(mask, a, b, centres, radius), c.rrect(...), c.fill(mask, colour)."""
import numpy as np

DETAILS = {}
from paint import PALE, INK


def armario(c):
    """The locker: hinges and a row of rivets on each door, a pale band across both (a unit's mark), a dent rubbed bright by a boot."""
    front = (c.ny < -0.6) & (c.z > 0.08)
    c.fill(front * c.smooth(0.045, 0.04, np.abs(c.z - 1.33)), PALE, 0.8, 0.6)
    c.bolts(front, c.x, c.z, [(sx * 0.405, zz) for sx in (-1, 1) for zz in (0.32, 0.98, 1.66)], 0.011)
    c.bolts(front, c.x, c.z, [(sx * xx, 0.14) for sx in (-1, 1) for xx in (0.08, 0.22, 0.36)], 0.006, tone=0.5)
    side = (np.abs(c.nx) > 0.6)
    c.seam(side, c.z - 0.95, lip=0.7)
    c.bolts(side, c.y, c.z, [(yy, zz) for yy in (-0.2, 0.2) for zz in (0.2, 0.95, 1.7)], 0.007, tone=0.5)


def tambor(c):
    """The drum: a pale band round its waist and a thin one under it, a pictogram of a drop on the front; the lid's bolts."""
    wall = (np.abs(c.nz) < 0.5) & (np.hypot(c.x, c.y) > 0.27)
    c.fill(wall * c.smooth(0.05, 0.045, np.abs(c.z - 0.61)), PALE, 0.85, 0.6)
    c.fill(wall * c.smooth(0.012, 0.009, np.abs(c.z - 0.525)), PALE, 0.8, 0.6)
    drop = np.hypot(c.x * 1.0, (c.z - 0.26) * (1.0 - 0.9 * np.clip((c.z - 0.26) / 0.1, 0, 0.75))) - 0.045
    c.fill(wall * (c.ny < -0.8) * c.smooth(0.003, -0.003, drop), PALE, 0.85, 0.5)
    top = c.nz > 0.7
    c.bolts(top, c.x, c.y, [(0.23 * np.cos(a), 0.23 * np.sin(a)) for a in np.arange(8) * 0.7854 + 0.3], 0.008, tone=0.5)


def galao(c):
    """The jerrycan: the X pressed into each side, a seam round its middle."""
    side = (np.abs(c.ny) > 0.6) & (c.z < 0.36)
    u, v = c.x / 0.13, (c.z - 0.185) / 0.15
    inside = c.smooth(1.0, 0.92, np.maximum(np.abs(u), np.abs(v)))
    c.seam(side * inside, (np.abs(u) - np.abs(v)) * 0.09, lip=1.0)
    c.seam(side, c.rrect(c.x, c.z, 0.0, 0.185, 0.14, 0.16, 0.03))
    c.seam((np.abs(c.nz) < 0.5) & (np.abs(c.ny) < 0.6), c.y, lip=0.6)


def bancada(c):
    """The bench: the holes of the pegboard behind it; the outline of the tools that hang there, sprayed pale long ago."""
    board = (c.ny < -0.6) & (c.z > 1.17) & (c.y > 0.3) & c.is_k('wood')
    g = 0.075
    hole = 1 - c.smooth(0.006, 0.011, np.hypot((c.x % g) - g / 2, ((c.z - 1.17) % g) - g / 2))
    c.col = c.mix(c.col, INK, board * hole * 0.8)


def bomba(c):
    """The pump: anchor plates on the plinth, a pale band round the motor, the flange bolts."""
    plinth = c.is_k('conc') & (c.nz > 0.7)
    c.seam(plinth, c.rrect(c.x, c.y, 0.0, 0.0, 0.6, 0.36, 0.03), lip=0.5)
    motor = c.is_k('coat') & (c.x > 0.06) & (np.abs(c.nx) < 0.6) & (c.z > 0.2)
    c.fill(motor * c.smooth(0.03, 0.026, np.abs(c.x - 0.42)), PALE, 0.8, 0.6)


def caixote(c):
    """The crate: a pale arrow pointing up on two sides (this way up), half worn away."""
    for mask, a in (((c.ny < -0.6), c.x), ((c.nx > 0.6), c.y)):
        m_ = mask & c.is_k('wood') & (np.abs(a) < 0.4)
        shaft = c.smooth(0.022, 0.018, np.abs(a + 0.24)) * c.smooth(0.2, 0.21, c.z) * c.smooth(0.47, 0.46, c.z)
        head = c.smooth(0.0, -0.004, np.abs(a + 0.24) * 1.0 + (c.z - 0.56) * 0.8) * c.smooth(0.45, 0.46, c.z)
        c.fill(m_ * np.maximum(shaft, head), INK * 1.6, 0.7, 0.7)


KRAFT = np.array((0.72, 0.585, 0.43))

def _card(c, card):
    """Cardboard: a calm kraft brown (the noise of the plain surface is too loud on it), a little lighter above, with soft large stains."""
    tone = 0.9 + 0.2 * c.rnd
    flat = KRAFT[None, :] * (tone * (0.9 + 0.16 * c.fbm(c.P, 6.0, 2, 61)))[:, None]
    c.col = c.mix(c.col, flat, card * 0.82)
    stain = c.smooth(0.6, 0.75, c.fbm(c.P, 4.0, 2, 62))
    c.col = c.mix(c.col, c.col * np.array((0.72, 0.66, 0.58)), card * stain * 0.5)


def caixa_papelao(c):
    """The cardboard box: the seam of the flaps on top, a strip of pale tape over it and a hand down the two ends, a stamped arrow (no letter)."""
    card = c.is_k('plain')
    _card(c, card)
    top = card & (c.nz > 0.7)
    ends = card & (np.abs(c.nx) > 0.6) & (c.z > c.H * 0.62)
    c.seam(top, np.abs(c.y) - 0.002, lip=0.0)
    tape = c.smooth(0.034, 0.03, np.abs(c.y)) * (top | ends)
    c.fill(tape, np.array((0.80, 0.72, 0.52)), 0.9, 0.2)
    c.seam((top | ends), np.abs(c.y) - 0.033, lip=0.5)
    c.seam(ends, c.z - c.H * 0.63, lip=0.0)
    front = card & (c.ny < -0.6)
    shaft = c.smooth(0.011, 0.008, np.abs(c.x + 0.08)) * c.smooth(0.05, 0.055, c.z) * c.smooth(0.15, 0.145, c.z)
    head = c.smooth(0.0, -0.003, np.abs(c.x + 0.08) + (c.z - 0.185) * 0.8) * c.smooth(0.14, 0.145, c.z)
    c.fill(front * np.maximum(shaft, head), INK * 1.5, 0.7, 0.5)


def cacamba_entulho(c):
    """What is in the skip: the boxes are cardboard, each taped across."""
    card = c.is_k('plain')
    _card(c, card)
    across = np.abs(c.L[:, 1])
    lid = card & (c.nz > 0.6)
    c.fill(lid * c.smooth(0.04, 0.035, across), np.array((0.80, 0.72, 0.52)), 0.9, 0.2)
    c.seam(lid, across - 0.038, lip=0.4)


def lata(c):
    """The tin: a paper label round it, torn at one side."""
    wall = np.abs(c.nz) < 0.5
    lab = c.smooth(0.036, 0.033, np.abs(c.z - 0.06)) * (c.fbm(c.P, 30.0, 2, 3) < 0.72)
    c.fill(wall * lab, PALE, 0.9, 0.3)
    c.fill(wall * lab * c.smooth(0.012, 0.01, np.abs(c.z - 0.066)), np.array((0.5, 0.2, 0.12)), 0.8, 0.4)


def cacamba(c):
    """The skip: a pale band sprayed round it (half worn), the weld seams of the plates, rivets on the lip."""
    side = c.is_k('coat') & (np.abs(c.nz) < 0.6) & (c.z > 0.25) & (c.z < 0.98)
    c.fill(side * c.smooth(0.07, 0.06, np.abs(c.z - 0.62)), PALE, 0.8, 0.75)
    c.fill(side * c.smooth(0.012, 0.009, np.abs(c.z - 0.5)), PALE, 0.7, 0.75)
    long_ = side & (np.abs(c.ny) > 0.6)
    c.seam(long_, np.abs(c.x) - 0.48, lip=0.6)
    c.seam(side, c.z - 0.3, lip=0.5)
    lip = c.is_k('coat') & (c.nz > 0.7) & (c.z > 1.0)
    c.bolts(lip, c.x, c.y, [(x, sy * 0.715) for sy in (-1, 1) for x in (-0.96, -0.48, 0, 0.48, 0.96)], 0.012, tone=0.55)


def tapume_painel(c):
    """The hoarding: the screws of each sheet into the rails, a patch painted over in grey, the black stripes of the hazard tape."""
    sheet = c.is_k('wood') & (c.ny < -0.6) & (c.z < 2.45) & (np.abs(c.y) < 0.03)
    c.bolts(sheet, c.x, c.z, [(x, z) for x in (-1.1, -0.62, -0.1, 0.1, 0.62, 1.1) for z in (0.5, 1.9)], 0.011, tone=0.5)
    patch = c.smooth(0.0, -0.01, c.rrect(c.x, c.z, 0.55, 1.05, 0.3, 0.22, 0.03)) * (c.fbm(c.P, 14.0, 2, 9) < 0.7)
    c.fill(sheet * patch, np.array((0.42, 0.44, 0.42)), 0.8, 0.5)
    patch2 = c.smooth(0.0, -0.01, c.rrect(c.x, c.z, -0.7, 1.75, 0.22, 0.3, 0.03))
    c.fill(sheet * patch2, np.array((0.5, 0.46, 0.36)), 0.6, 0.5)
    tape = c.is_k('plain')
    c.fill(tape * (((c.x + c.z) % 0.16) < 0.08), INK * 1.3, 0.92, 0.2)


def marquise_coluna(c):
    """The column: a band of yellow at knee height, worn."""
    post = c.is_k('coat') & (np.abs(c.nz) < 0.5)
    c.fill(post * c.smooth(0.16, 0.15, np.abs(c.z - 0.75)), np.array((0.72, 0.52, 0.1)), 0.85, 0.7)
    c.fill(post * c.smooth(0.16, 0.15, np.abs(c.z - 0.75)) * (((c.x + c.y + c.z) % 0.14) < 0.07), INK * 1.3, 0.8, 0.6)


def cano_parede(c):
    """The run: a band of colour on the water pipe either side of the flange (what runs in it), the seam between the two flanges, the pipe's welds."""
    pipe = c.is_k('coat') & (np.abs(c.z) < 0.1) & (np.abs(c.nx) < 0.5)
    c.fill(pipe * c.smooth(0.07, 0.065, np.abs(np.abs(c.x) - 0.3)), np.array((0.16, 0.36, 0.55)), 0.85, 0.6)
    c.seam(pipe, np.abs(c.x) - 1.2, lip=0.6)
    c.seam(c.is_k('steel') & (np.abs(c.nx) < 0.5) & (np.abs(c.x) < 0.06), c.x, lip=0.6)
    cond = c.is_k('coat') & (c.z > 0.15) & (np.abs(c.nx) < 0.5)
    c.seam(cond, np.abs(c.x + 0.2) - 0.05, lip=0.5)


def cano(c):
    pipe = c.is_k('coat') & (np.abs(c.nx) < 0.5)
    c.fill(pipe * c.smooth(0.05, 0.045, np.abs(c.x - 0.28)), np.array((0.16, 0.36, 0.55)), 0.85, 0.6)
    c.seam(pipe, c.x - 1.05, lip=0.6)
    c.seam(c.is_k('steel') & (np.abs(c.nx) < 0.5) & (np.abs(c.x) < 0.06), c.x, lip=0.6)


DETAILS.update(caixa_papelao=caixa_papelao, cacamba_entulho=cacamba_entulho, lata=lata, cacamba=cacamba, tapume_painel=tapume_painel,
               marquise_coluna=marquise_coluna, cano_parede=cano_parede, cano=cano, cano_flange=cano)
DETAILS.update(armario=armario, tambor=tambor, galao=galao, bancada=bancada, bomba=bomba, caixote=caixote)
