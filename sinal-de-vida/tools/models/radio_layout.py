"""Where everything is on the station radio: one table for the script that models it (radio.py) and for the one that animates the
hands that reach for it (jonas_radio.py). Plain Python, no Blender.

The radio's own space is Blender's: metres, z up, the front toward -y, the origin under the middle of the case. The front panel
leans back by TILT; a place on it is (u, v, n): u to the right as one looks at the front, v up along the panel from its lower edge,
n out of it. Every part of the panel is a node whose own axes are the panel's, so that in the exported file (y up) x is u, y is v
and z is n: a button sinks along its own -z, a knob turns about its own z, whatever the lean of the panel.
"""
import math

TILT = math.radians(15.0)
W, DEPTH = 0.48, 0.24                 # the case
PH = 0.20                             # the panel, along its slope
LIP = 0.012                           # the case's straight lower edge under the panel
SIN, COS = math.sin(TILT), math.cos(TILT)
P0 = (0.0, -DEPTH / 2, LIP)           # the middle of the panel's lower edge
AX_U = (1.0, 0.0, 0.0)
AX_V = (0.0, SIN, COS)
AX_N = (0.0, -COS, SIN)
TOP_Z = LIP + PH * COS                # the height of the case
TOP_Y = P0[1] + PH * SIN              # where the panel meets the top


def panel(u, v, n=0.0):
    """(u, v, n) on the panel -> (x, y, z) in the radio's space."""
    return tuple(P0[i] + AX_U[i] * u + AX_V[i] * v + AX_N[i] * n for i in range(3))


# ---- the tuning: a slide-rule scale with a pointer, and the selector under it
SCALE = dict(c=(-0.150, 0.158), size=(0.130, 0.034), travel=0.057)       # the pointer runs c.u ± travel for the channels 1..99
CH_MIN, CH_MAX = 1, 99
DIAL = dict(c=(-0.150, 0.074), r=0.036, h=0.024, skirt=0.041, step=math.radians(30.0))   # a click of 30 degrees a channel


def needle_u(ch):
    return SCALE['c'][0] + ((ch - 50.0) / 49.0) * SCALE['travel']


# ---- the middle: the liquid crystal display, the row of eight lights, the five colour buttons, the speaker
DISPLAY = dict(c=(0.008, 0.156), size=(0.140, 0.044))
SEQ = dict(v=0.1195, u0=0.008, pitch=0.0175, size=(0.0115, 0.0072), h=0.0022, count=8)
COLORS = dict(v=0.091, u0=0.008, pitch=0.030, r=0.0105, h=0.007, travel=0.004, count=5)
COLOR_HEX = ('#4a7bd8', '#4fb36a', '#8c5ad0', '#3ec4d0', '#e07aa8')         # blue, green, violet, cyan, pink
SPEAKER = dict(c=(0.008, 0.042), size=(0.150, 0.050), h=0.003)

# ---- the right: the meter, the 12 keys, the two lights, the microphone's socket
VU = dict(c=(0.137, 0.160), size=(0.072, 0.040), pivot=(0.137, 0.1465), length=0.027, swing=math.radians(42.0))
KEYS = dict(c=(0.137, 0.074), pitch=(0.026, 0.0255), size=(0.021, 0.019), h=0.007, travel=0.004)
KEY_LABELS = (('1', ''), ('2', 'ABC'), ('3', 'DEF'), ('4', 'GHI'), ('5', 'JKL'), ('6', 'MNO'),
              ('7', 'PQRS'), ('8', 'TUV'), ('9', 'WXYZ'), ('*', ''), ('0', ''), ('#', ''))
LEDS = dict(tx=(0.205, 0.166), rx=(0.205, 0.132), r=0.0062, h=0.004)
JACK = (0.205, 0.046)                # where the coiled cord leaves the panel
SWITCH = (0.205, 0.092)              # a painted toggle


def seq_uv(i):
    return (SEQ['u0'] + (i - (SEQ['count'] - 1) / 2) * SEQ['pitch'], SEQ['v'])


def color_uv(i):
    return (COLORS['u0'] + (i - (COLORS['count'] - 1) / 2) * COLORS['pitch'], COLORS['v'])


def key_uv(i):
    row, col = divmod(i, 3)
    return (KEYS['c'][0] + (col - 1) * KEYS['pitch'][0], KEYS['c'][1] + (1.5 - row) * KEYS['pitch'][1])


# ---- the hand microphone, hanging on its hook at the right of the case, facing the front like the panel
MIC = dict(size=(0.052, 0.072, 0.030), rest=(0.288, 0.108, 0.014))          # width, height, depth; (u, v, n) of its middle on the hook
MIC_CORD_END = (0.0, -0.045, 0.0)   # where the cord enters it, in the microphone's own (u, v, n)
MIC_PTT = dict(c=(-0.0255, 0.004, 0.0), size=(0.030, 0.014), h=0.0045, travel=0.003)    # the talk bar, on its left side as one looks at it
HOOK = dict(u=(0.238, 0.304), v=(0.086, 0.132), n=(-0.0095, -0.0065))
CORD = dict(turns=20, r=0.0062, wire=0.0021)
