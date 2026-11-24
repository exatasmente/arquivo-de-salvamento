// The render is the engine's (vendor/engine/render.js), with this game's two pictures:
//  - the new one (`novo`, the default): the `prerender` look of src/looks, in three quality tiers (alto, medio, leve);
//  - the "1998 mode" (`1998`): the picture the game had before, the N64 look of the engine's library at 384 px: firm vertices,
//    textures that do not warp and are filtered, many colours and little dithering. It is exactly the settings it had.
// `render.setMode('1998' | 'novo')` and `render.setTier('alto' | 'medio' | 'leve' | 'auto')` switch them while the game runs.
import { createRender as engineRender, mergeGeos } from '../vendor/engine/render.js';
import '../vendor/engine/library.js';
import { lookOf } from '../vendor/engine/looks.js';
import { restoreTextures } from './looks/index.js';

export const INTERNAL_WIDTH = 384;
export const INTERNAL_WIDTH_PORTRAIT = 240;
export { mergeGeos };

/** The 1998 mode: what the game drew with before the new picture. */
export const LOOK_1998 = { id: 'n64', params: { pixels: INTERNAL_WIDTH, pixelsPortrait: INTERNAL_WIDTH_PORTRAIT, pointLights: 8, pointFalloff: 'suave', flashlight: true, vertexColors: true } };

/** The quality tiers of the new picture: sets of the look's params (every one stays a param in the editor). */
export const TIERS = {
  alto: { scale: 1, dprMax: 2, maxWidth: 1920, shadows: 4, shadowSize: 1024, shadowSoft: 4, shadowEvery: 1, flashShadow: true, aoTaps: 8, relief: 0.5, chroma: true },
  medio: { scale: 1, dprMax: 1.5, maxWidth: 1280, shadows: 2, shadowSize: 512, shadowSoft: 4, shadowEvery: 2, flashShadow: true, aoTaps: 4, relief: 0.3, chroma: true },
  // the phone: a smaller picture, one shadow (the flashlight's, else the strongest lamp), no screen-space occlusion; the grade stays so it is still dark and readable
  leve: { scale: 1, dprMax: 1, maxWidth: 960, shadows: 1, shadowSize: 512, shadowSoft: 1, shadowEvery: 2, flashShadow: true, aoTaps: 0, relief: 0, chroma: false, grain: 0.04, exposure: 1.75, ambient: 0.85 },
};
export const TIER_NAMES = Object.keys(TIERS);
const BASE = { vertexColors: true };
/** The new look's params for a tier: its defaults, then the tier's (so a tier never keeps what the last one set). */
const paramsFor = (tier) => ({ ...Object.fromEntries(Object.entries(lookOf('prerender').params).map(([k, d]) => [k, d.default])), ...BASE, ...TIERS[tier] });

/** The tier for this device: the lightest on a phone or a small touch screen, the middle one on a modest computer, the top one else. */
export function autoTier(env = globalThis) {
  try {
    const nav = env.navigator ?? {}, scr = env.screen ?? {};
    const touch = Boolean(env.matchMedia?.('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '') || (nav.maxTouchPoints ?? 0) > 1 && /Macintosh/.test(nav.userAgent ?? '');
    const small = Math.min(scr.width ?? 9999, scr.height ?? 9999) < 700;
    if (touch || small) return 'leve';
    const cores = nav.hardwareConcurrency ?? 4, mem = nav.deviceMemory ?? 4;
    return cores >= 8 && mem >= 4 ? 'alto' : 'medio';
  } catch { return 'medio'; }
}

/** `opts.mode`: '1998' or 'novo' (default); `opts.tier`: a tier name or 'auto' (default). */
export const createRender = (canvas, opts = {}) => {
  let mode = opts.mode === '1998' ? '1998' : 'novo';
  let quality = TIER_NAMES.includes(opts.tier) ? opts.tier : 'auto';
  const tierNow = () => (quality === 'auto' ? autoTier() : quality);
  const first = mode === '1998' ? LOOK_1998 : { id: 'prerender', params: paramsFor(tierNow()) };
  const r = engineRender(canvas, {
    look: first.id, params: first.params,
    fog: { color: '#07080d', near: 10, far: 40 }, fov: { landscape: 64, portrait: 82 },
  });
  const apply = () => {
    if (mode === '1998') { if (r.look !== LOOK_1998.id) { restoreTextures(); r.setLook(LOOK_1998.id, LOOK_1998.params); } }
    else r.setLook('prerender', paramsFor(tierNow()));
    r.mode = mode; r.quality = quality; r.tier = tierNow();
  };
  r.mode = mode; r.quality = quality; r.tier = tierNow();
  /** '1998' or 'novo'. Returns the mode now. */
  r.setMode = (m) => { const next = m === '1998' ? '1998' : 'novo'; if (next !== mode) { mode = next; apply(); } return mode; };
  /** A tier name or 'auto'. The picture of the 1998 mode has no tiers: the choice is kept for when the new one is back. */
  r.setTier = (t) => { quality = TIER_NAMES.includes(t) ? t : 'auto'; if (mode === 'novo') apply(); else { r.quality = quality; r.tier = tierNow(); } return quality; };
  // The grain moves with the game's clock; whoever draws a picture sets it with r.time(t).
  return r;
};
