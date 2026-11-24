// The title screen's picture: the station at night seen from the highway, the camera creeping toward the tall sign of the Sun, whose light fails now
// and then. There is no screen of its own any more: the logotype and the menu are drawn by screens.js over this picture.
//
// Both are functions of the time alone (seconds since the title opened), so the film mode and the tests get the same picture at the same second.
//   titleCamera(t, sign, opts)   -> { x, y, z, yaw, pitch, fov }   `sign`: { x, y, z, face: [fx, fz] } the sign's face on the ground plane
//   signPower(t, { calm })       -> whether the sign's tube is lit at that second

const DUR = 36;                                   // seconds of the approach; after it the camera only breathes
const ease = (k) => k * k * (3 - 2 * k);
const mix = (a, b, k) => a + (b - a) * k;

/**
 * The camera at second `t`. It starts far out on the forecourt side of the sign, low and wide, where the canopy, the pumps and the asphalt are all in the picture
 * and the Sun stands over them as the one lit thing, and walks toward the sign, closing the lens, until the Sun fills the right of the picture (the menu is in the
 * column on the left). In a portrait window (`portrait`, the phone) the menu covers the width, so the camera looks above the sign instead: the Sun sits low in the
 * picture, under the column. `calm` (reduzir clarões) breathes less.
 */
export function titleCamera(t, sign, { calm = false, portrait = false } = {}) {
  const k = ease(Math.max(0, Math.min(1, t / DUR)));
  const [fx, fz] = sign.face, len = Math.hypot(fx, fz) || 1, ux = fx / len, uz = fz / len;       // out of the sign, toward where it is read
  const rx = uz, rz = -ux;                                                                      // to the right of someone who looks at the sign
  const D = portrait ? mix(24, 13, k) : mix(24, 8.5, k);                                       // distance to the sign
  const side = portrait ? mix(6, 0, k) : mix(15, -2, k);
  const eye = mix(1.6, 1.5, k);
  const sway = (calm ? 0.35 : 1) * Math.max(0, Math.min(1, (t - DUR * 0.7) / (DUR * 0.3)));
  const x = sign.x + ux * D + rx * side + Math.sin(t * 0.17) * 0.12 * sway;
  const z = sign.z + uz * D + rz * side + Math.cos(t * 0.13) * 0.12 * sway;
  const y = eye + Math.sin(t * 0.21 + 1) * 0.04 * sway;
  const aimY = mix(5, sign.y - (portrait ? 0.6 : 3), k);
  // it looks a little to the left of the sign (so that the Sun stands right of the menu column), or, in portrait, above it
  const off = portrait ? 0 : D * mix(0.04, 0.32, k), tx = sign.x - rx * off, tz = sign.z - rz * off;
  const dx = tx - x, dz = tz - z, dh = Math.hypot(dx, dz);
  return { x, y, z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(aimY - y, dh) + (portrait ? mix(0.4, 0.62, k) : 0), fov: portrait ? mix(0, -10, k) : mix(16, -8, k) };
}

/** The sign's light: on, with the short failures of an old tube (a long one now and then). `calm`: it never fails. */
export function signPower(t, { calm = false } = {}) {
  if (calm) return true;
  const k = t % 9.1;
  return !((k > 2.1 && k < 2.18) || (k > 2.3 && k < 2.36) || (k > 5.9 && k < 6.55) || (k > 6.7 && k < 6.76));
}
