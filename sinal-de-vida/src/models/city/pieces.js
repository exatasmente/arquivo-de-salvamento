// The pieces made in Blender (tools/city/build_pieces.py): vehicles, the street lamp, the fire escape, the water tank, roof fittings.
// Loaded once at the start of the module (top-level await: the street is built in one go, and the film mode needs them there), and
// placed into a kit Batch. Each piece carries ONE small atlas painted by hand in the manner of Jonas and of the station's props
// (tools/city/painted.py): every part is drawn with it. The glTF's materials are NAMES (body, glass, rubber ...) that say what the
// game still changes: `body` is painted a pale neutral and tinted with the vehicle's colour; the lights are flat colours that glow
// at night. A piece without an atlas (an old file) falls back to the kit's tiling surfaces. A piece is merged with the rest of its
// entity, and takes the outline of models/outline.js when it is one of those seen from near.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/three/GLTFLoader.js';
import { mergeGeometries } from '../../../vendor/three/BufferGeometryUtils.js';
import { hullOf, outlineSpec, OUTLINE } from '../outline.js';

export const PIECES = ['car_sedan', 'car_van', 'car_furgao', 'lamp_pole', 'lamp_head', 'fire_escape', 'fire_ladder', 'roof_tank', 'roof_ac', 'roof_vent', 'roof_antenna', 'roof_dish', 'trash_bin', 'bench', 'bollard'];
const data = new Map(); // name -> [{ geo, mat }]
const maps = new Map(); // name -> the piece's painted atlas
const hulls = new Map(); // name -> the outline's shell of the piece (models/outline.js), for the pieces seen from near
/** The pieces that take the outline (those of the pavement and the road; the roofs' are too far for a line), and the parts that never do (a sheet of glass, a light). */
const OUTLINED = new Set(['car_sedan', 'car_van', 'car_furgao', 'lamp_pole', 'lamp_head', 'trash_bin', 'bench', 'bollard']);
const NO_HULL = new Set(['glass', 'headlight', 'taillight', 'lamp']);

const load = (name) => new GLTFLoader().loadAsync(new URL(`../../../assets/city/${name}.glb`, import.meta.url).href).then((g) => {
  const parts = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); parts.push({ geo, mat: (o.material?.name ?? 'metal').replace(/[._]\d+$/, '') });
    const map = o.material?.map;
    if (map && !maps.has(name)) {
      map.colorSpace = THREE.NoColorSpace; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
      map.anisotropy = 4; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true; maps.set(name, map);
    }
  });
  data.set(name, parts);
  if (OUTLINED.has(name)) {
    const solid = parts.filter((p) => !NO_HULL.has(p.mat)).map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
    if (solid.length) hulls.set(name, hullOf(THREE, solid.length > 1 ? mergeGeometries(solid) : solid[0]));
  }
}).catch((e) => { console.info(`city: ${name} did not load`, e?.message ?? e); data.set(name, []); });
await Promise.all(PIECES.map(load));

/** How much of a piece's painting shows whatever the light of the scene (as Jonas's clothes and the station's props). */
const PAINTED = 0.2;
/** The parts that are not drawn with the atlas: the lights (a flat colour that glows at night). */
const FLAT = new Set(['headlight', 'taillight', 'lamp']);
/** The material of a glTF material name where there is no atlas (and of the lights always). `o.body`: the paint of a vehicle; `o.glow`: the lamp colour. */
const SPEC = {
  glass: () => ({ c: '#33465c', map: 'vidro' }), rubber: () => ({ c: '#3a3a3e', map: 'borracha' }), chrome: () => ({ c: '#3c3e44', map: 'metal' }),
  plastic: () => ({ c: '#2a2c30', map: 'borracha' }), black: () => ({ c: '#1c1d20' }), metal: () => ({ c: '#6a6e74', map: 'metal' }), rust: () => ({ c: '#8a6a52', map: 'ferrugem' }),
  wood: () => ({ c: '#9a7a52', map: 'madeira' }), roof: () => ({ c: '#6a5a4a', map: 'metal' }), grate: () => ({ c: '#5a5e64', map: 'metal' }), concrete: () => ({ c: '#8c8c88', map: 'concreto' }),
  body: (o) => ({ c: o.body ?? '#6a7a8a', map: 'metal' }),
  headlight: (o) => ({ c: '#e8d8a0', emissive: o.lit ? 1 : 0, fogged: 0.6, night: true, dayC: '#343432' }),
  taillight: (o) => ({ c: '#a03a2a', emissive: o.lit ? 0.7 : 0, fogged: 0.6, night: true, dayC: '#2a1a18' }),
  lamp: (o) => ({ c: o.glow ?? '#ffc078', emissive: o.on ? 1 : 0, fogged: 0.5, night: true, dayC: '#3a3a38' }),
};

/**
 * Puts a piece in a batch, with its outline. `o`: pos [x, y, z], ry, rx, rz (radians), scale (number or [x, y, z]), body, lit, on, glow, outline (false: none).
 * Returns the triangles added.
 */
export function addPiece(b, name, o = {}) {
  const parts = data.get(name);
  if (!parts) return 0;
  const T = b.kit.T, m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'));
  const s = Array.isArray(o.scale) ? o.scale : [o.scale ?? 1, o.scale ?? 1, o.scale ?? 1];
  m.compose(new T.Vector3(...(o.pos ?? [0, 0, 0])), q, new T.Vector3(...s));
  let n = 0;
  const map = maps.get(name), key = 'city:' + name;
  if (map && !b.kit.has(key)) b.kit.setTexture(key, map);
  for (const p of parts) {
    const spec = map && !FLAT.has(p.mat) ? { c: p.mat === 'body' ? (o.body ?? '#8a97a6') : '#ffffff', map: key, emissive: PAINTED } : (SPEC[p.mat] ?? SPEC.metal)(o);
    b.add(spec, p.geo, m);
    n += p.geo.index ? p.geo.index.count / 3 : p.geo.attributes.position.count / 3;
  }
  const hull = hulls.get(name);
  if (hull && OUTLINE.on && o.outline !== false) b.add(outlineSpec(b.kit), hull, m);      // (not counted: the triangles returned are the piece's own)
  return n;
}
export const pieceTris = (name) => (data.get(name) ?? []).reduce((t, p) => t + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
void THREE;
