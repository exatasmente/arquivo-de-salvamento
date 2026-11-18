// The render is the engine's (vendor/engine/render.js); this game's settings of it. The engine's library of looks and
// shaders, and this game's own (src/looks/), are loaded with it, for the scene editor's Visual tab.
// The default look is `animacao` (an animated feature: soft light bands, ink outline, near native resolution); the `ps2`
// look stays in src/looks/ to compare (the editor's side by side, or `?look=ps2` in the address).
import { createRender as engineRender, mergeGeos } from '../vendor/engine/render.js';
import '../vendor/engine/library.js';
import { guardAlpha } from './looks/index.js';

export const INTERNAL_WIDTH = 1280;
export { mergeGeos };

// Settings of each look this game ships with.
const LOOKS = {
  pintado: { pixels: INTERNAL_WIDTH, pixelsPortrait: 720, pointLights: 8, pointFalloff: 'suave', flashlight: true },
  animacao: { pixels: INTERNAL_WIDTH, pixelsPortrait: 720, pointLights: 8, pointFalloff: 'suave', flashlight: true },
  ps2: { pixels: 640, pixelsPortrait: 360, pointLights: 8, pointFalloff: 'suave', flashlight: true },
};

export const createRender = (canvas) => {
  const asked = new URLSearchParams(globalThis.location?.search ?? '').get('look');
  const look = Object.hasOwn(LOOKS, asked) ? asked : 'pintado';
  const r = engineRender(canvas, {
    look, params: LOOKS[look],
    fog: { color: '#121521', near: 14, far: 48 }, fov: { landscape: 64, portrait: 82 },
  });
  // A near-native picture is shown smooth (the engine's blocky enlargement is for the low-resolution looks).
  const smooth = () => { canvas.style.imageRendering = r.look === 'ps2' ? 'pixelated' : 'auto'; };
  smooth();
  // The animated look keeps depth in the frame's alpha channel: blended materials of the engine's emitters must not touch it.
  const draw = r.draw;
  r.draw = () => { guardAlpha(r.scene, r.THREE); draw(); };
  const setLook = r.setLook;
  r.setLook = (id, params) => { setLook(id, params); smooth(); };
  return r;
};
