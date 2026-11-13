// The PS1 render is the engine's (vendor/engine/render.js); this game's settings of it.
import { createRender as engineRender, mergeGeos } from '../vendor/engine/render.js';

export const INTERNAL_WIDTH = 320;
export { mergeGeos };
export const createRender = (canvas) => engineRender(canvas, {
  look: 'ps1', params: { pixels: INTERNAL_WIDTH },
  fog: { color: '#0b0d14', near: 9, far: 26 }, fov: { landscape: 62, portrait: 84 },
});
