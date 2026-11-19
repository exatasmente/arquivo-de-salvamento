// The camera of the title: the station at night, a slow move from the hall to the radio on the workshop bench, and then a long breath there.
// It is a function of the time alone (seconds since the title opened), so the film mode and the tests get the same picture at the same second.
// The radio ends up on the right of the picture: the menu is in the column on the left.
const K0 = { eye: [3.6, 2.5, 3.3], at: [-3.2, 1.25, -3.2], fov: 66 };
const K1 = { eye: [1.3, 2.35, -3.1], at: [-3.5, 1.15, -4.3], fov: 50 };
const K2 = { eye: [-2.2, 1.6, -2.4], at: [-4.9, 1.12, -3.7], fov: 42 };
const DUR = 34;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const ease = (k) => k * k * (3 - 2 * k);
/** The camera at second `t`: { eye, at, fov }. After DUR it only breathes (a slow sway of a few centimetres). */
export function titleCamera(t, { calm = false } = {}) {
  const k = ease(Math.max(0, Math.min(1, t / DUR)));
  // a curve through the three keyframes (two linear moves blended: a quadratic path)
  const q = (a, b, c) => mix(mix(a, b, k), mix(b, c, k), k);
  const eye = q(K0.eye, K1.eye, K2.eye), at = q(K0.at, K1.at, K2.at), fov = q([K0.fov], [K1.fov], [K2.fov])[0];
  const sway = calm ? 0.35 : 1, s = Math.max(0, Math.min(1, (t - DUR * 0.6) / (DUR * 0.4)));
  eye[0] += Math.sin(t * 0.21) * 0.07 * s * sway; eye[1] += Math.sin(t * 0.17 + 1) * 0.03 * s * sway;
  at[0] += Math.sin(t * 0.13 + 2) * 0.05 * s * sway;
  return { eye, at, fov };
}
