// Puts a baked prop (see loader.js) into a Batch of the kit, with a place, a turn, a size and a tint; the Batch joins everything of one
// texture into one mesh. With each prop goes its outline (the shell of models/outline.js: all of them one material, so one mesh more).
// A prop that is missing leaves a plain box of the size `fb` (or nothing).
import { PROPS_LOADED } from './loader.js';
import { outlineSpec, OUTLINE } from '../outline.js';

/** The baked props are painted as in daylight; in the night of the base they are cooler and darker (multiplied by this). */
const NIGHT = '#8c92a6';
/** How much of the painting shows whatever the light of the scene (as Jonas's clothes: the light is painted, the scene's only tints). */
const PAINTED = 0.24;
export const have = (name) => PROPS_LOADED.has(name);
export const trisOf = (name) => PROPS_LOADED.get(name)?.tris ?? 0;

/**
 * place(kit, batch, name, { pos, ry, rx, rz, scale: number | [x, y, z], tint: '#rrggbb', fb: [w, h, d] })
 * The prop stands on y = 0 at `pos`; `outline: false` leaves its outline out; `tint` multiplies its painted colours (white leaves them as painted).
 */
export function place(kit, b, name, o = {}) {
  const T = kit.T, p = PROPS_LOADED.get(name), pos = o.pos ?? [0, 0, 0];
  if (!p) { if (o.fb) b.box({ c: o.fbc ?? '#6a6e74' }, o.fb, pos, { ry: o.ry ?? 0 }); return false; }
  const key = 'prop:' + name;
  if (!kit.has(key)) kit.setTexture(key, p.map);
  const s = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale ?? [1, 1, 1];
  const m = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ')), new T.Vector3(...s));
  b.add({ c: '#' + new T.Color(o.tint ?? '#ffffff').multiply(new T.Color(NIGHT)).getHexString(), map: key, emissive: PAINTED }, p.geo, m);
  if (p.hull && OUTLINE.on && o.outline !== false) b.add(outlineSpec(kit), p.hull, m);
  return true;
}
