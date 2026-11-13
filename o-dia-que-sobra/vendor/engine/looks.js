// The engine's looks and shaders (docs/engine.md, "Visuais e shaders"). A look is the way the whole world
// is drawn (the PS1 of the channel's games is the first); a shader is the way one surface is drawn (water,
// dirty glass, a TV with static), inside the look. Both declare typed params, with the same kinds as an
// entity's, so the editor shows controls for them and an agent can make new ones.
//
// A look makes the materials of the render (render.js) and keeps them up to date: changing a look or its
// params at run time refills the same material objects, so every mesh of the game follows.
//
//   defineLook({ id, label, desc, params, uniforms(THREE, p), fill(material, spec, U, p), size(cssW, cssH, p), post? })
//     uniforms: the uniforms all its materials share (lights, fog, resolution), made once per render.
//     fill: makes a ShaderMaterial be this look's material for spec = { color, map, opts, shader }.
//     size: the internal picture size for the window's size.
//     post(p): optional, GLSL that defines `vec3 post(vec2 uv)` over the whole picture once drawn (a tape's
//       colour bleed, scanlines): it reads `tFrame` (the picture), `uRes` (its size in pixels), `uTime` (the
//       game's clock) and the look's params as `p_<param>` (numbers, yes/no as 0/1, colours as vec3).
//   defineShader({ id, label, desc, params, surface })
//     surface: GLSL that defines `vec3 surface(vec3 base, vec2 uv, vec3 world, float t)`, the colour of the
//     surface before light and fog; its params are uniforms named `s_<param>`; `t` is the game's clock in
//     seconds (render.time(t)), so the film mode films what the game shows.
import { defineTypes, checkEntity } from './layout.js';

const own = (o, k) => (o && typeof k === 'string' && Object.hasOwn(o, k) ? o[k] : undefined);

export const LOOKS = Object.create(null);
export const SHADERS = Object.create(null);

/** Checks the params like an entity type's (defineTypes) and registers the look by its id. */
export function defineLook(def) {
  if (!def || typeof def.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(def.id)) throw new Error('a look needs an id (lowercase letters, digits, -)');
  defineTypes({ [def.id]: { label: def.label ?? def.id, params: def.params ?? {} } });
  for (const k of ['uniforms', 'fill', 'size']) if (typeof def[k] !== 'function') throw new Error(`look ${def.id}: ${k} is missing`);
  // A param of a look with a pass over the picture becomes the uniform p_<param>: a name GLSL takes.
  for (const k of Object.keys(def.params ?? {})) if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) throw new Error(`look ${def.id}: param ${k} must be letters, digits or _ (it becomes the uniform p_${k})`);
  if (LOOKS.ps1 && def.id === 'ps1') throw new Error('ps1 is the engine\'s own look: give a new look another id');
  LOOKS[def.id] = def;
  return def;
}

export function defineShader(def) {
  if (!def || typeof def.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(def.id)) throw new Error('a shader needs an id (lowercase letters, digits, -)');
  defineTypes({ [def.id]: { label: def.label ?? def.id, params: def.params ?? {} } });
  // Each param is a uniform s_<param>: its name must be one GLSL takes.
  for (const k of Object.keys(def.params ?? {})) if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) throw new Error(`shader ${def.id}: param ${k} must be letters, digits or _ (it becomes the uniform s_${k})`);
  if (typeof def.surface !== 'string' || !/vec3\s+surface\s*\(/.test(def.surface)) throw new Error(`shader ${def.id}: surface must define vec3 surface(vec3 base, vec2 uv, vec3 world, float t)`);
  SHADERS[def.id] = def;
  return def;
}

export const lookOf = (id) => own(LOOKS, id);
export const shaderOf = (id) => own(SHADERS, id);

/**
 * A look's or shader's params with the value of each: the given one, or the default. Given values are
 * checked like an entity's params (a level of colour of 0, an option that is not one, a param the look does
 * not have): a wrong one throws, so a bad value never reaches the GLSL.
 */
export function paramsOf(def, given = {}) {
  const known = {};
  for (const [k, v] of Object.entries(given ?? {})) if (v !== undefined) known[k] = v;
  const problems = checkEntity({ [def.id]: { label: def.label ?? def.id, params: def.params ?? {} } }, { id: def.id, type: def.id, params: known });
  if (problems.length) throw new Error(problems.join('; '));
  const out = {};
  for (const [k, d] of Object.entries(def?.params ?? {})) out[k] = own(known, k) ?? d.default;
  return out;
}

// ---- the PS1 look ----------------------------------------------------------------------------------

const glslFloat = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const glslType = { number: 'float', bool: 'float', color: 'vec3', enum: 'float', text: null };

/**
 * The PS1 shaders for a set of params. With the params a game used, the text is the one that game had
 * (the tests compare them), so the picture does not change by a pixel when a game moves to the engine.
 */
export function ps1Source(p, shader = null) {
  const N = p.pointLights;
  const soft = p.pointFalloff === 'suave';
  const spot = p.flashlight;
  const vc = p.vertexColors;
  const world = spot || Boolean(shader);
  const varyings = `varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog;${world ? ' varying vec3 vWorld; varying vec3 vNormal;' : ''}${vc ? ' varying vec3 vCol;' : ''}`;
  const pointDecl = `uniform vec3 uPointPos[${N}]; uniform vec3 uPointColor[${N}]; uniform float uPointRange[${N}];`;
  const pointLoop = soft
    ? `  for (int i = 0; i < ${N}; i++) {
    vec3 toP = uPointPos[i] - world.xyz; float d = length(toP);
    float a = clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
    l += uPointColor[i] * clamp(dot(n, toP / max(d, 1e-3)) * 0.75 + 0.25, 0.0, 1.0) * a * (0.4 + 0.6 * a);
  }`
    : `  for (int i = 0; i < ${N}; i++) {
    vec3 toP = uPointPos[i] - world.xyz; float d = length(toP);
    l += uPointColor[i] * max(dot(n, toP / max(d, 1e-3)), 0.0) * clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
  }`;
  const snap = p.jitter
    ? `  if (clip.w > 0.0) {
    vec2 g = uRes * 0.5;
    clip.xy = floor(clip.xy / clip.w * g + 0.5) / g * clip.w;
  }
`
    : '';
  const vert = `
uniform vec2 uRes; uniform vec3 uLightDir, uLightColor, uAmbient;
${pointDecl}
uniform float uFogNear, uFogFar, uRepeat;
${varyings}
void main() {
${vc ? `  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
` : ''}  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(position, 1.0);
  vec3 n = normalize(mat3(model) * normal);
  vec3 l = uAmbient + uLightColor * max(dot(n, normalize(-uLightDir)), 0.0);
${pointLoop}
  vLight = l;${world ? ' vWorld = world.xyz; vNormal = n;' : ''}
  vec4 view = viewMatrix * world;
  vFog = clamp((-view.z - uFogNear) / max(uFogFar - uFogNear, 1e-3), 0.0, 1.0);
  vec4 clip = projectionMatrix * view;
${snap}  gl_Position = clip;
${p.affine === false ? `  // uv interpolated with perspective: no affine warp.
  vUvA = uv * uRepeat; vW = 1.0;` : `  // uv * w interpolated with perspective, divided by w per pixel: affine, as on the hardware.
  vUvA = uv * uRepeat * clip.w; vW = clip.w;`}
}`;
  const sUniforms = shader ? Object.entries(shader.params ?? {}).map(([k, d]) => (glslType[d.type] ? `uniform ${glslType[d.type]} s_${k};` : '')).filter(Boolean).join(' ') : '';
  const levels = glslFloat(p.colorLevels);
  const dither = p.dither === 1 ? '(bayer(gl_FragCoord.xy) - 0.5) / 24.0' : `(bayer(gl_FragCoord.xy) - 0.5) * ${glslFloat(p.dither / 24)}`;
  const frag = `
uniform sampler2D map; uniform float uHasMap, uEmissive, uFogged, uAlpha;
uniform vec3 uColor, uFogColor;
${spot ? 'uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotCos, uSpotRange, uSpotOn;\n' : ''}${shader ? `uniform float uTime; ${sUniforms}\n${shader.surface}\n` : ''}${varyings}
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec2 uv = vUvA / vW;
  vec4 tex = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
${spot ? `  vec3 light = vLight;
  if (uSpotOn > 0.5) {
    vec3 L = uSpotPos - vWorld; float d = length(L); L /= max(d, 1e-3);
    float cd = dot(-L, uSpotDir);
    float cone = floor(smoothstep(uSpotCos, uSpotCos + 0.10, cd) * 4.0 + 0.5) / 4.0;
    float att = clamp(1.0 - d / uSpotRange, 0.0, 1.0);
    float ndl = clamp(dot(normalize(vNormal), L) * 0.6 + 0.4, 0.0, 1.0);
    light += uSpotColor * cone * att * (0.4 + 0.6 * att) * ndl;
  }
` : ''}  vec3 c = ${shader ? 'surface(tex.rgb * uColor, uv, vWorld, uTime)' : 'tex.rgb * uColor'}${vc ? ' * vCol' : ''} * mix(${spot ? 'light' : 'vLight'}, vec3(1.0), uEmissive);
  c = mix(c, uFogColor, vFog * uFogged);
  c += ${dither};
  c = floor(clamp(c, 0.0, 1.0) * ${levels} + 0.5) / ${levels};
  gl_FragColor = vec4(c, uAlpha);
}`;
  return { vert, frag };
}

export const PS1 = defineLook({
  id: 'ps1',
  label: 'PS1',
  desc: 'Resolução interna baixa ampliada sem suavizar, vértices que tremem na grade da tela, textura afim, luz por vértice, névoa curta, pontilhado e poucas cores.',
  params: {
    pixels: { type: 'number', label: 'Largura interna (px)', min: 120, max: 960, step: 8, default: 320 },
    pixelsPortrait: { type: 'number', label: 'Largura interna em retrato (px; 0 = a mesma)', min: 0, max: 960, step: 8, default: 0 },
    jitter: { type: 'bool', label: 'Vértices na grade da tela', default: true },
    colorLevels: { type: 'number', label: 'Níveis de cor por canal', min: 3, max: 255, step: 1, default: 31 },
    dither: { type: 'number', label: 'Pontilhado', min: 0, max: 4, step: 0.25, default: 1 },
    pointLights: { type: 'enum', label: 'Luzes pontuais', options: [4, 8], default: 4 },
    pointFalloff: { type: 'enum', label: 'Queda da luz pontual', options: ['linear', 'suave'], default: 'linear' },
    flashlight: { type: 'bool', label: 'Lanterna (cone por pixel)', default: false },
    vertexColors: { type: 'bool', label: 'Cor por vértice', default: false },
    affine: { type: 'bool', label: 'Textura afim (entorta de perto)', default: true },
    textureFilter: { type: 'enum', label: 'Filtro da textura', options: ['nearest', 'linear'], default: 'nearest' },
  },
  uniforms(THREE, p) {
    const N = p.pointLights;
    return {
      uRes: { value: new THREE.Vector2(p.pixels, 180) },
      uLightDir: { value: new THREE.Vector3(-0.2, -1, -0.15) },
      uLightColor: { value: new THREE.Color(0.55, 0.52, 0.48) },
      uAmbient: { value: new THREE.Color(0.30, 0.32, 0.40) },
      uPointPos: { value: Array.from({ length: N }, () => new THREE.Vector3()) },
      uPointColor: { value: Array.from({ length: N }, () => new THREE.Color(0, 0, 0)) },
      uPointRange: { value: Array.from({ length: N }, () => 1) },
      uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(0, 0, -1) },
      uSpotColor: { value: new THREE.Color(0.9, 0.85, 0.7) }, uSpotCos: { value: 0.9 }, uSpotRange: { value: 14 }, uSpotOn: { value: 0 },
      uFogColor: { value: new THREE.Color(0, 0, 0) },
      uFogNear: { value: 9 },
      uFogFar: { value: 26 },
      uTime: { value: 0 },
    };
  },
  fill(m, spec, U, p, THREE) {
    const { color, map, opts, shader } = spec;
    const src = ps1Source(p, shader?.def ?? null);
    // A material filled again (another look, other params) keeps its own uniforms as the game left them:
    // a colour a cutscene changed, a glow, a shader param moved. Only the first fill makes them.
    const was = m.uniforms ?? {};
    const keep = (k, make) => (Object.hasOwn(was, k) && was[k] ? was[k] : { value: make() });
    const mine = {
      map: keep('map', () => map ?? null), uHasMap: keep('uHasMap', () => (map ? 1 : 0)), uRepeat: keep('uRepeat', () => opts.repeat ?? 1),
      uEmissive: keep('uEmissive', () => opts.emissive ?? 0), uFogged: keep('uFogged', () => opts.fogged ?? 1),
      uColor: keep('uColor', () => new THREE.Color(color)), uAlpha: keep('uAlpha', () => opts.opacity ?? 1),
    };
    if (shader) for (const [k, d] of Object.entries(shader.def.params ?? {})) {
      if (d.type === 'text') continue;
      const v = shader.params[k];
      mine[`s_${k}`] = keep(`s_${k}`, () => (d.type === 'color' ? new THREE.Color(v) : d.type === 'bool' ? (v ? 1 : 0) : d.type === 'enum' ? d.options.indexOf(v) : v));
    }
    m.uniforms = { ...U, ...mine };
    m.vertexShader = src.vert;
    m.fragmentShader = src.frag;
    m.vertexColors = Boolean(opts.vertexColors);
    // The texture's filter is the look's: nearest (blocky) for the PS1, linear (smooth) for an N64-like one.
    // A texture is shared by every material of the render, all in one look, so it is set where it differs.
    if (map?.isTexture) {
      const f = p.textureFilter === 'linear' ? THREE.LinearFilter : THREE.NearestFilter;
      if (map.magFilter !== f || map.minFilter !== f) { map.magFilter = map.minFilter = f; map.needsUpdate = true; }
    }
    m.needsUpdate = true;
  },
  size(cssW, cssH, p) {
    const w = cssH > cssW && p.pixelsPortrait ? p.pixelsPortrait : p.pixels;
    return { w, h: Math.max(120, Math.round(w * cssH / cssW)) };
  },
});

/**
 * A look made from the PS1's machinery with other defaults (and, optionally, a pass over the whole picture):
 * every PS1 param stays available, so the editor can still move any of them.
 */
export function derivedLook({ id, label, desc, defaults = {}, extra = {}, post = null }) {
  const params = {};
  for (const [k, d] of Object.entries(PS1.params)) params[k] = own(defaults, k) !== undefined ? { ...d, default: defaults[k] } : d;
  return defineLook({ id, label, desc, params: { ...params, ...extra }, uniforms: PS1.uniforms, fill: PS1.fill, size: PS1.size, ...(post ? { post } : {}) });
}
