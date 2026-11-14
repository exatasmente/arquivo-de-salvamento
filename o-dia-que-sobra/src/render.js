// The render is the engine's (vendor/engine/render.js) with the N64 look of its library: firm vertices, textures
// that do not warp and are filtered, many colours and little dithering. This game's settings of it.
import { createRender as engineRender, mergeGeos } from '../vendor/engine/render.js';
import '../vendor/engine/library.js';

export const INTERNAL_WIDTH = 384;
export const INTERNAL_WIDTH_PORTRAIT = 240;
export { mergeGeos };
export const createRender = (canvas) => engineRender(canvas, {
  look: 'n64', params: { pixels: INTERNAL_WIDTH, pixelsPortrait: INTERNAL_WIDTH_PORTRAIT, pointLights: 8, pointFalloff: 'suave', flashlight: true, vertexColors: true },
  fog: { color: '#07080d', near: 10, far: 40 }, fov: { landscape: 64, portrait: 82 },
});
