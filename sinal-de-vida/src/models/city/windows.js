// Windows and shop fronts that nobody enters: a quad per window with the engine's `interior` surface shader (a room behind the glass,
// with parallax), one material per kind, shared by the whole street. The game hour goes in through setNight (0 day, 1 night).
const kinds = new WeakMap();
const PARAMS = {
  // upper windows: a share of the rooms burns at night (the street is mostly dead; the Sun's survivors keep a few lamps on)
  dim: { depth: 3.2, rooms: 4, seed: 3, lit: 0.07, glass: 0.55, dirt: 0.5, blind: 0.3, curtain: 0.25, frame: 0.02 },
  act: { depth: 3.2, rooms: 4, seed: 11, lit: 0.3, glass: 0.5, dirt: 0.4, blind: 0.2, curtain: 0.3, frame: 0.02 },
  // shop fronts: deeper, dustier, no curtains
  shop: { depth: 5.5, rooms: 4, seed: 23, lit: 0.16, glass: 0.45, dirt: 0.65, blind: 0, curtain: 0, frame: 0.015, lamp: '#e8d8a0' },
  // the long clerestory of a warehouse
  hall: { depth: 7, rooms: 4, seed: 31, lit: 0.1, glass: 0.4, dirt: 0.85, blind: 0, curtain: 0, frame: 0.02, lamp: '#d8e0c0' },
};
export const WINDOW_KINDS = Object.keys(PARAMS);

/** The material of a kind of window for render `r`. */
export function windowMat(r, kind) {
  let m = kinds.get(r);
  if (!m) kinds.set(r, (m = {}));
  if (!m[kind]) m[kind] = r.shaded('interior', { ...PARAMS[kind], night: 1 }, '#ffffff', { emissive: 1 });
  return m[kind];
}
/** Sets the hour of every window material of the render: night 0 (day) to 1. */
export function setWindowNight(r, night) {
  const m = kinds.get(r); if (!m) return;
  for (const mat of Object.values(m)) if (mat.uniforms?.s_night) mat.uniforms.s_night.value = night;
}
