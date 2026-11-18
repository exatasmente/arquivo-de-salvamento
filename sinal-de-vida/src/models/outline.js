// The outline of the things that do not move: the same dark line Jonas has round his silhouette (models/jonas.js), for the props and
// whatever else is joined into a still mesh. It is a shell: the thing drawn a second time, inside out (only its back faces), in one flat
// dark brown, each vertex pushed out along its normal in the vertex shader by a share of its distance to the camera, between a floor and
// a ceiling, so that the line stays about as wide on the screen; nearer the camera than 20 cm it is not drawn.
//   hullOf(T, geo): the shell's geometry of a mesh: its triangles, with ONE normal per place (the mean of the faces that meet there), so
//                   that the shell of a box with hard corners does not open at its corners. Positions, normals and uv only: it joins
//                   with the others in a Batch and in the kit's flatten.
//   outlineSpec(kit): the spec to give a Batch for the shells (`b.add(outlineSpec(kit), hull, matrix)`): all the shells of a scene are
//                   one material, so the Batch and flatten join them into one mesh per part of the scene, one draw call more.
//   OUTLINE: the line's numbers, the same as JONAS_OUTLINE (they are repeated here because jonas.js loads his model when imported).
export const OUTLINE = { on: true, width: 0.0042, min: 0.0008, max: 0.016, color: '#21140d', near: 0.2 };

/** The shell of a geometry: see the head of this file. `grid`: places nearer than this (metres) are one place. */
export function hullOf(T, geo, grid = 0.0015) {
  const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, n = P.count;
  const key = (i) => `${Math.round(P.getX(i) / grid)},${Math.round(P.getY(i) / grid)},${Math.round(P.getZ(i) / grid)}`;
  const sums = new Map(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), fn = new T.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    fn.copy(b).sub(a).cross(c.sub(a));                                    // its length is twice the area: large faces weigh more
    if (fn.lengthSq() < 1e-16) continue;
    // each face counts once per direction at a place: the two triangles of a quad must not count twice against a thin chamfer
    const d = fn.clone().normalize(), dk = `${Math.round(d.x * 8)},${Math.round(d.y * 8)},${Math.round(d.z * 8)}`;
    for (let k = 0; k < 3; k++) {
      const id = key(t + k); let s = sums.get(id);
      if (!s) sums.set(id, (s = { v: new T.Vector3(), seen: new Set() }));
      if (s.seen.has(dk)) continue;
      s.seen.add(dk); s.v.add(d);
    }
  }
  const nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sums.get(key(i)), v = s && s.v.lengthSq() > 1e-12 ? a.copy(s.v).normalize() : a.fromBufferAttribute(g.attributes.normal, i);
    nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
    pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return out;
}

/** The shells' material of a render: the look's own flat material, back faces only, with the push written into its vertex shader. */
export function outlineMaterial(r, o = OUTLINE) {
  const T = r.THREE, u = { value: new T.Vector4(o.width, o.min, o.max, 1) };
  const m = r.mat(o.color, { emissive: 1, fogged: 1, side: T.BackSide });
  m.onBeforeCompile = (sh) => {             // (again whenever the look changes: the look writes the shader anew)
    sh.uniforms.uOutline = u;
    sh.vertexShader = 'uniform vec4 uOutline; varying float vOutD;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
      `#include <skinning_vertex>
  { vec4 wp_ = modelMatrix * vec4(transformed, 1.0); vOutD = distance(wp_.xyz, cameraPosition);
    transformed += normalize(objectNormal) * clamp(vOutD * uOutline.x, uOutline.y, uOutline.z); }`);
    sh.fragmentShader = 'varying float vOutD;\n' + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `${s} if (vOutD < ${o.near.toFixed(2)}) discard;`);
  };
  m.customProgramCacheKey = () => 'still-outline';
  const before = m.onBeforeRender;
  m.onBeforeRender = (rdr, scene, camera, ...rest) => {                   // a longer lens makes the same line wider on the screen, as Jonas's
    before?.(rdr, scene, camera, ...rest);
    u.value.x = o.width * (camera?.fov ?? 50) / 50;
    // the shells are drawn after the things themselves (from the next frame on): nearly all of a shell is behind its thing, and the
    // depth test then throws those fragments away before they are shaded
    const mesh = rest[1]; if (mesh && mesh.renderOrder < 1) mesh.renderOrder = 1;
  };
  m.userData.outline = true;
  return m;
}

const SPEC = { c: OUTLINE.color, emissive: 1, fogged: 1, side: 'outline' };
/** The spec of the shells for a Batch: the kit answers `side: 'outline'` itself (kit.js, `mat`), with one material per render. */
export function outlineSpec() { return SPEC; }
