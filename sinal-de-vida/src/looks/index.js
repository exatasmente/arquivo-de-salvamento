// This game's own looks and shaders (the engine's library is in vendor/engine/library.js). Declare them with
// defineLook / derivedLook / defineShader from '../../vendor/engine/looks.js'; the scene editor shows them.
import { defineLook, defineShader, PS1 } from '../../vendor/engine/looks.js';

const withDefaults = (params, defaults) => Object.fromEntries(Object.entries(params)
  .map(([k, d]) => [k, Object.hasOwn(defaults, k) ? { ...d, default: defaults[k] } : d]));

// PS2 / GameCube era: the PS1's pipeline with its hardware faults turned off (steady vertices, perspective-correct
// filtered texture, 24-bit colour, no dither) at 640x360 (360x640 portrait), plus a light bloom on the bright parts.
// The bloom is a function of the picture alone (no clock), so it never pulses and adds no frame-to-frame jump.
// Written with defineLook (not derivedLook) only for the `fill` below; everything else is the PS1's.
export const PS2 = defineLook({
  id: 'ps2',
  label: 'PS2 / GameCube',
  desc: 'Uma geração depois do PS1: 640x360 com serrilhado, vértices firmes, textura filtrada sem entortar, cor cheia sem pontilhado, até 8 luzes pontuais e um brilho leve nas luzes.',
  params: {
    ...withDefaults(PS1.params, {
      pixels: 640, pixelsPortrait: 360, jitter: false, affine: false, textureFilter: 'linear',
      colorLevels: 255, dither: 0, pointLights: 8,
    }),
    bloom: { type: 'number', label: 'Brilho nas luzes (0 = desligado)', min: 0, max: 1, step: 0.05, default: 0.35 },
    bloomThreshold: { type: 'number', label: 'A partir de que brilho', min: 0.4, max: 0.95, step: 0.05, default: 0.7 },
    bloomRadius: { type: 'number', label: 'Alcance do brilho (px)', min: 1, max: 4, step: 0.5, default: 3 },
  },
  uniforms: PS1.uniforms,
  size: PS1.size,
  // The PS1's fill, but the material keeps its `uniforms` object: three reads the one it saw when the material
  // first got a program, so a material that goes back to a program it already had (setLook 8 lights -> 4 -> 8, as
  // the lab's cost run and the editor's side by side do) would upload stale 4-light arrays and throw.
  fill(m, spec, U, p, THREE) {
    const old = m.uniforms;
    PS1.fill(m, spec, U, p, THREE);
    // The flashlight of this look: the PS1's cone is cut in four steps (concentric discs) and weak. Here it is a smooth
    // pool, hot in the middle and soft at the edge, strong enough to tell on from off at a glance.
    if (m.fragmentShader) {
      m.fragmentShader = m.fragmentShader
        .replace('float cone = floor(smoothstep(uSpotCos, uSpotCos + 0.10, cd) * 4.0 + 0.5) / 4.0;', 'float cone = pow(smoothstep(uSpotCos, 1.0, cd), 0.65);')
        .replace('light += uSpotColor * cone * att * (0.4 + 0.6 * att) * ndl;', 'light += uSpotColor * cone * (0.25 + 0.75 * att) * sqrt(att) * 1.35 * ndl;');
    }
    if (!old || old === m.uniforms) return;
    const fresh = m.uniforms;
    for (const k of Object.keys(old)) delete old[k];
    Object.assign(old, fresh);
    m.uniforms = old;
  },
  // 5 reads of the picture (centre + four diagonal taps, bright-pass only), and an early return with the bloom off.
  post: () => `
vec3 brightPart(vec3 c) { float l = max(c.r, max(c.g, c.b)); return c * smoothstep(p_bloomThreshold, 1.0, l); }
vec3 post(vec2 uv) {
  vec3 c = texture2D(tFrame, uv).rgb;
  if (p_bloom <= 0.0) return c;
  vec2 o = p_bloomRadius / uRes;
  vec3 b = brightPart(texture2D(tFrame, uv + vec2(o.x, o.y)).rgb) + brightPart(texture2D(tFrame, uv + vec2(-o.x, o.y)).rgb)
         + brightPart(texture2D(tFrame, uv + vec2(o.x, -o.y)).rgb) + brightPart(texture2D(tFrame, uv + vec2(-o.x, -o.y)).rgb);
  return c + b * 0.25 * p_bloom;
}`,
});


// ---- Animação: the look of an animated feature or a graphic novel ------------------------------------------------
//
// Written with defineLook, not derivedLook, because nothing of the PS1's pipeline stays: the light is per pixel (soft
// bands, not per vertex), the vertex shader skins (SkinnedMesh) and morphs, the picture is near native and the ink
// outline needs the depth of every pixel.
//
// THE OUTLINE. The engine's pass over the picture (`post`) only gets the colour of the frame (`tFrame`), no depth, and
// this file may not change the engine. So the look's own materials write the depth of each pixel into the ALPHA channel
// of the frame: opaque ones write log2(1 + z) / log2(65) (z is the distance in metres, 8 bits: 1.6 % steps), blended ones
// (the soft shadows under people) keep the alpha that is already there (custom blend factors), so they never show up as
// an edge. The pass reads the four neighbours: a pixel that is farther than a neighbour by more than the threshold
// is the far side of a silhouette, and it is drawn in ink (the line sits outside the nearer thing, one pixel thin). The
// line fades out with the distance of the nearer thing (the fog would hide it anyway). Nothing is asked of the models or
// of the scenes: any mesh made by this render's `mat()` (built in code or loaded from a glTF) has it.
// What it does not see: a crease where two faces meet at the same distance (the corner of a box), and a thing that
// is closer to its background than the threshold (a person leaning on a wall). The `creases` param adds a second,
// colour-based line for those, off by default.
const LOG_Z = 'log2(65.0)';

const animSource = (p, spec) => {
  const N = p.pointLights, soft = p.pointFalloff === 'suave', spot = p.flashlight, vc = p.vertexColors;
  const shader = spec.shader?.def ?? null, blended = Boolean(spec.opts.transparent);
  const bump = Boolean(spec.opts.bump), nmap = Boolean(spec.opts.normalMap);
  const varyings = `varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying float vFog; varying float vZ;${vc ? ' varying vec3 vCol;' : ''}`;
  const vert = `
uniform vec2 uRes;
uniform float uFogNear, uFogFar, uRepeat;
${varyings}
#include <skinning_pars_vertex>
#include <morphtarget_pars_vertex>
void main() {
${vc ? `  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
` : ''}  vec3 objectNormal = vec3(normal);
  vec3 transformed = vec3(position);
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(transformed, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(model) * objectNormal);
  vec4 view = viewMatrix * world;
  vZ = -view.z;
  vFog = clamp((-view.z - uFogNear) / max(uFogFar - uFogNear, 1e-3), 0.0, 1.0);
  vUv = uv * uRepeat;
  gl_Position = projectionMatrix * view;
}`;
  const sUniforms = shader ? Object.entries(shader.params ?? {}).map(([k, d]) => ({ number: 'float', bool: 'float', color: 'vec3', enum: 'float' }[d.type] ? `uniform ${{ number: 'float', bool: 'float', color: 'vec3', enum: 'float' }[d.type]} s_${k};` : '')).filter(Boolean).join(' ') : '';
  const pointLoop = soft
    ? `  for (int i = 0; i < ${N}; i++) {
    vec3 toP = uPointPos[i] - vWorld; float d = length(toP);
    float a = clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
    float k = a * (0.4 + 0.6 * a) * clamp(dot(N, toP / max(d, 1e-3)) * 0.75 + 0.25, 0.0, 1.0);
    l += uPointColor[i] * band(clamp(k * 1.25, 0.0, 1.0));
  }`
    : `  for (int i = 0; i < ${N}; i++) {
    vec3 toP = uPointPos[i] - vWorld; float d = length(toP);
    float k = max(dot(N, toP / max(d, 1e-3)), 0.0) * clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
    l += uPointColor[i] * band(clamp(k * 1.25, 0.0, 1.0));
  }`;
  const frag = `
uniform sampler2D map; uniform float uHasMap, uEmissive, uFogged, uAlpha;
uniform vec3 uColor, uFogColor, uLightDir, uLightColor, uAmbient, uShadowTint;
${bump ? 'uniform sampler2D bumpMap; uniform float uBumpScale;\n' : ''}${nmap ? 'uniform sampler2D normalMapTex; uniform float uNormalScale;\n' : ''}
uniform vec4 uBand, uTone;
uniform vec3 uPointPos[${N}]; uniform vec3 uPointColor[${N}]; uniform float uPointRange[${N}];
${spot ? 'uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotCos, uSpotRange, uSpotOn;\n' : ''}${shader ? `uniform float uTime; ${sUniforms}\n${shader.surface}\n` : ''}${varyings}
${bump ? `// Relief from a height map by screen derivatives (no tangents): works on skinned and morphed meshes too.
vec3 bumpN(vec3 N, vec3 pos, float h, float scale) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * N - scale * grad);
}
` : ''}${nmap ? `// A tangent-space normal map, the frame rebuilt from the derivatives of the position and the uv.
vec3 mapN(vec3 N, vec3 pos, vec2 uv, vec3 m) {
  vec3 dp1 = dFdx(pos), dp2 = dFdy(pos); vec2 d1 = dFdx(uv), d2 = dFdy(uv);
  vec3 p2 = cross(dp2, N), p1 = cross(N, dp1);
  vec3 T = p2 * d1.x + p1 * d2.x, B = p2 * d1.y + p1 * d2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-20));
  return normalize(mat3(T * inv, B * inv, N) * m);
}
` : ''}// Soft steps: 2 or 3 tones with a wide, smooth edge, mixed with the plain gradient by uBand.z.
float band(float x) {
  float s = uBand.y;
  float r = uBand.x > 2.5 ? 0.5 * (smoothstep(0.30 - s, 0.30 + s, x) + smoothstep(0.64 - s, 0.64 + s, x)) : smoothstep(0.45 - s, 0.45 + s, x);
  return mix(x, r, uBand.z);
}
void main() {
  vec2 uv = vUv;
  vec4 tex = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
${bump ? '  N = bumpN(N, vWorld, texture2D(bumpMap, uv).r * uBumpScale * uTone.w, 1.0);\n' : ''}${nmap ? '  { vec3 m = texture2D(normalMapTex, uv).rgb * 2.0 - 1.0; m.xy *= uNormalScale * uTone.w; N = mapN(N, vWorld, uv, normalize(m)); }\n' : ''}  vec3 V = normalize(cameraPosition - vWorld);
  vec3 l = uAmbient + uLightColor * band(clamp(dot(N, normalize(-uLightDir)) * 0.8 + 0.2, 0.0, 1.0));
${pointLoop}
${spot ? `  if (uSpotOn > 0.5) {
    vec3 L = uSpotPos - vWorld; float d = length(L); L /= max(d, 1e-3);
    float cd = dot(-L, uSpotDir);
    float cone = pow(smoothstep(uSpotCos, 1.0, cd), 0.65);
    float att = clamp(1.0 - d / uSpotRange, 0.0, 1.0);
    float ndl = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    l += uSpotColor * cone * (0.25 + 0.75 * att) * sqrt(att) * 1.6 * ndl;
  }
` : ''}  // The rim: a cool edge light on the curved and upright things (not on floors seen at a grazing angle).
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * (1.0 - smoothstep(0.6, 0.95, N.y));
  l += (uAmbient * 1.4 + uLightColor * 0.15) * rim * uBand.w;
  // The shadows lean to a cool tint instead of just getting dark.
  float lum = max(l.r, max(l.g, l.b));
  l *= mix(vec3(1.0), uShadowTint, uTone.x * (1.0 - smoothstep(0.15, 0.75, lum)));
  vec3 base = ${shader ? 'surface(tex.rgb * uColor, uv, vWorld, uTime)' : 'tex.rgb * uColor'}${vc ? ' * vCol' : ''};
  // A soft vertical gradient: a little darker at the ground, a little lighter up high.
  base *= mix(1.0 - 0.12 * uTone.y, 1.0 + 0.07 * uTone.y, smoothstep(0.0, 3.5, vWorld.y));
  vec3 c = base * mix(l, vec3(1.0), uEmissive);
  c = mix(c, uFogColor, vFog * uFogged);
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
${blended ? '  float outA = uAlpha;' : `  float outA = clamp(log2(1.0 + vZ) / ${LOG_Z}, 0.0, 1.0);`}
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), outA);
}`;
  return { vert, frag };
};

const applyStyle = (U, p, THREE) => {
  U.uBand.value.set(p.bands, p.bandSoftness, p.banding, p.rim);
  U.uTone.value.set(p.shadowTintAmount, p.gradient, 0, p.relief ?? 0.7);
  U.uShadowTint.value.set(p.shadowTint);
};

export const ANIMACAO = defineLook({
  id: 'animacao',
  label: 'Animação estilizada',
  desc: 'Como um filme de animação 3D ou uma graphic novel: luz por pixel em faixas suaves de 2 ou 3 tons, sombra que esfria em vez de só escurecer, ilhas quentes de lâmpada contra o azul da noite, contorno de tinta fino, resolução perto da nativa e um brilho leve nas luzes. Serve malha com esqueleto.',
  params: {
    pixels: { type: 'number', label: 'Largura interna máxima (px)', min: 480, max: 1920, step: 40, default: 1280 },
    pixelsPortrait: { type: 'number', label: 'Largura interna máxima em retrato (px)', min: 270, max: 1080, step: 30, default: 720 },
    pointLights: { type: 'enum', label: 'Luzes pontuais', options: [4, 8], default: 8 },
    pointFalloff: { type: 'enum', label: 'Queda da luz pontual', options: ['linear', 'suave'], default: 'suave' },
    flashlight: { type: 'bool', label: 'Lanterna (cone por pixel)', default: true },
    vertexColors: { type: 'bool', label: 'Cor por vértice', default: false },
    textureFilter: { type: 'enum', label: 'Filtro da textura', options: ['nearest', 'linear'], default: 'linear' },
    bands: { type: 'enum', label: 'Tons da luz', options: [2, 3], default: 3 },
    bandSoftness: { type: 'number', label: 'Maciez da passagem entre tons', min: 0.02, max: 0.3, step: 0.01, default: 0.12 },
    banding: { type: 'number', label: 'Faixas (0 = gradiente liso, 1 = só faixas)', min: 0, max: 1, step: 0.05, default: 0.8 },
    rim: { type: 'number', label: 'Luz de contorno fria', min: 0, max: 1, step: 0.05, default: 0.2 },
    shadowTint: { type: 'color', label: 'Cor da sombra', default: '#8fa0ff' },
    shadowTintAmount: { type: 'number', label: 'Quanto a sombra esfria', min: 0, max: 1, step: 0.05, default: 0.7 },
    gradient: { type: 'number', label: 'Gradiente de cor (chão escuro, alto claro)', min: 0, max: 1, step: 0.05, default: 0.6 },
    relief: { type: 'number', label: 'Força do relevo (mapa de altura e de normal; 0 = sem)', min: 0, max: 2, step: 0.05, default: 0.7 },
    saturation: { type: 'number', label: 'Saturação', min: 0.6, max: 1.6, step: 0.05, default: 1.18 },
    contrast: { type: 'number', label: 'Contraste', min: 0.8, max: 1.5, step: 0.05, default: 1.05 },
    lineStrength: { type: 'number', label: 'Contorno (0 = sem contorno)', min: 0, max: 1, step: 0.05, default: 0.9 },
    lineColor: { type: 'color', label: 'Cor da tinta', default: '#0d1020' },
    lineWidth: { type: 'enum', label: 'Espessura do contorno (px)', options: [1, 2], default: 1 },
    lineThreshold: { type: 'number', label: 'Sensibilidade do contorno (menor = mais linhas)', min: 0.005, max: 0.06, step: 0.005, default: 0.02 },
    lineFade: { type: 'number', label: 'Distância em que o contorno some (m)', min: 10, max: 64, step: 2, default: 44 },
    creases: { type: 'number', label: 'Linha nas quinas e dobras (pela cor)', min: 0, max: 1, step: 0.05, default: 0 },
    smoothing: { type: 'number', label: 'Suavizar serrilhado', min: 0, max: 1, step: 0.05, default: 0.7 },
    bloom: { type: 'number', label: 'Brilho nas luzes (0 = desligado)', min: 0, max: 1, step: 0.05, default: 0.4 },
    bloomThreshold: { type: 'number', label: 'A partir de que brilho', min: 0.4, max: 0.95, step: 0.05, default: 0.8 },
    bloomRadius: { type: 'number', label: 'Alcance do brilho (px)', min: 1, max: 5, step: 0.5, default: 3.5 },
  },
  uniforms(THREE, p) {
    const U = PS1.uniforms(THREE, p);
    U.uBand = { value: new THREE.Vector4() };
    U.uTone = { value: new THREE.Vector4() };
    U.uShadowTint = { value: new THREE.Color() };
    applyStyle(U, p, THREE);
    return U;
  },
  fill(m, spec, U, p, THREE) {
    const old = m.uniforms;
    const { color, map, opts, shader } = spec;
    const was = old ?? {};
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
    // Relief (optional, per material): a height map (`bump`, `bumpScale` = the height of white in metres, 0.02 by default)
    // and/or a tangent-space normal map (`normalMap`, `normalScale`). Without them the shader has none of this code.
    if (opts.bump) { mine.bumpMap = keep('bumpMap', () => opts.bump); mine.uBumpScale = keep('uBumpScale', () => opts.bumpScale ?? 0.02); }
    if (opts.normalMap) { mine.normalMapTex = keep('normalMapTex', () => opts.normalMap); mine.uNormalScale = keep('uNormalScale', () => opts.normalScale ?? 1); }
    applyStyle(U, p, THREE);
    const src = animSource(p, spec);
    m.uniforms = { ...U, ...mine };
    m.vertexShader = src.vert;
    m.fragmentShader = src.frag;
    m.vertexColors = Boolean(opts.vertexColors);
    // A blended material (a soft shadow, glass) must not touch the alpha channel, which carries the depth for the outline.
    if (opts.transparent) {
      m.blending = THREE.CustomBlending;
      m.blendEquation = m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    }
    for (const rt of [opts.bump, opts.normalMap]) {
      if (rt?.isTexture && p.textureFilter === 'linear' && (rt.magFilter !== THREE.LinearFilter || !rt.generateMipmaps)) {
        rt.magFilter = THREE.LinearFilter; rt.minFilter = THREE.LinearMipmapLinearFilter; rt.generateMipmaps = true; rt.anisotropy = 4; rt.needsUpdate = true;
      }
    }
    if (map?.isTexture) {
      const f = p.textureFilter === 'linear' ? THREE.LinearFilter : THREE.NearestFilter;
      const mip = p.textureFilter === 'linear';
      const minF = mip ? THREE.LinearMipmapLinearFilter : f;
      if (map.magFilter !== f || map.minFilter !== minF || map.generateMipmaps !== mip) {
        map.magFilter = f; map.minFilter = minF; map.generateMipmaps = mip; map.anisotropy = mip ? 4 : 1; map.needsUpdate = true;
      }
    }
    m.needsUpdate = true;
    // Three reads the uniforms object the material first got a program with: keep it (see PS2.fill).
    if (!old || old === m.uniforms) return;
    const fresh = m.uniforms;
    for (const k of Object.keys(old)) delete old[k];
    Object.assign(old, fresh);
    m.uniforms = old;
  },
  // The window's width up to the cap: near native, the cap is what keeps a phone at a cost it can pay.
  size(cssW, cssH, p) {
    const cap = cssH > cssW && p.pixelsPortrait ? p.pixelsPortrait : p.pixels;
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const w = Math.max(240, Math.min(cap, Math.round(cssW * dpr)));
    return { w, h: Math.max(135, Math.round(w * cssH / cssW)) };
  },
  // Up to 9 reads of the picture: the centre and 4 neighbours (smoothing, ink), 4 diagonal bloom taps (only with the bloom on).
  post: () => `
const float LOGZ = ${LOG_Z};
float luma3(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 brightPart(vec3 c) { float l = max(c.r, max(c.g, c.b)); return c * smoothstep(p_bloomThreshold, 1.0, l); }
vec3 post(vec2 uv) {
  vec2 px = 1.0 / uRes;
  vec4 c4 = texture2D(tFrame, uv);
  vec4 n = texture2D(tFrame, uv + vec2(0.0, px.y)), s = texture2D(tFrame, uv - vec2(0.0, px.y));
  vec4 e = texture2D(tFrame, uv + vec2(px.x, 0.0)), w = texture2D(tFrame, uv - vec2(px.x, 0.0));
  vec3 c = c4.rgb;
  // Softens the jagged edges where the colour jumps: blends with the neighbours as much as the jump is big.
  float lc = luma3(c);
  float contrast = max(max(abs(luma3(n.rgb) - lc), abs(luma3(s.rgb) - lc)), max(abs(luma3(e.rgb) - lc), abs(luma3(w.rgb) - lc)));
  c = mix(c, (n.rgb + s.rgb + e.rgb + w.rgb) * 0.25, smoothstep(0.04, 0.3, contrast) * 0.6 * p_smoothing);
  if (p_bloom > 0.0) {
    vec2 o = p_bloomRadius * px;
    vec3 b = brightPart(texture2D(tFrame, uv + vec2(o.x, o.y)).rgb) + brightPart(texture2D(tFrame, uv + vec2(-o.x, o.y)).rgb)
           + brightPart(texture2D(tFrame, uv + vec2(o.x, -o.y)).rgb) + brightPart(texture2D(tFrame, uv + vec2(-o.x, -o.y)).rgb);
    c += b * 0.25 * p_bloom;
  }
  if (p_lineStrength > 0.0) {
    vec4 n2 = n, s2 = s, e2 = e, w2 = w;
    if (p_lineWidth > 0.5) { n2 = texture2D(tFrame, uv + vec2(0.0, 2.0 * px.y)); s2 = texture2D(tFrame, uv - vec2(0.0, 2.0 * px.y)); e2 = texture2D(tFrame, uv + vec2(2.0 * px.x, 0.0)); w2 = texture2D(tFrame, uv - vec2(2.0 * px.x, 0.0)); }
    // This pixel is the far side of an edge when a neighbour is nearer by more than the threshold.
    float dd = max(max(c4.a - n2.a, c4.a - s2.a), max(c4.a - e2.a, c4.a - w2.a));
    float zNear = exp2((c4.a - max(dd, 0.0)) * LOGZ) - 1.0;
    float ink = smoothstep(p_lineThreshold, p_lineThreshold * 2.0, dd) * (1.0 - smoothstep(0.55 * p_lineFade, p_lineFade, zNear));
    if (p_creases > 0.0) {
      float jump = max(max(abs(luma3(n2.rgb) - lc), abs(luma3(s2.rgb) - lc)), max(abs(luma3(e2.rgb) - lc), abs(luma3(w2.rgb) - lc)));
      ink = max(ink, smoothstep(0.14, 0.3, jump) * p_creases * (1.0 - smoothstep(0.55 * p_lineFade, p_lineFade, exp2(c4.a * LOGZ) - 1.0)));
    }
    c = mix(c, p_lineColor, clamp(ink, 0.0, 1.0) * p_lineStrength);
  }
  c = (c - 0.4) * p_contrast + 0.4;
  float g = luma3(c);
  return mix(vec3(g), c, p_saturation);
}`,
});

/**
 * Call it before each draw (src/render.js does). The outline keeps the depth in the alpha channel of the frame, and a
 * blended material that is not this look's (the engine's particle emitters, a plain three material) would blend its own
 * alpha into it and draw a false ring. This gives every such material blend factors that leave the alpha alone. The look's
 * own materials are left out (their `fill` did it). Nothing happens twice: a material is only touched while it still has
 * the normal blending.
 */
export function guardAlpha(scene, THREE) {
  scene.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      if (!x.transparent || x.blending !== THREE.NormalBlending || x.userData?.engineSpec) continue;
      x.blending = THREE.CustomBlending;
      x.blendEquation = x.blendEquationAlpha = THREE.AddEquation;
      x.blendSrc = THREE.SrcAlphaFactor; x.blendDst = THREE.OneMinusSrcAlphaFactor;
      x.blendSrcAlpha = THREE.ZeroFactor; x.blendDstAlpha = THREE.OneFactor;
    }
  });
}


// ---- Pintado: soft light for hand-painted textures -----------------------------------------------------------------
// The material, the skinning, the resolution and the pass of `animacao`, with the settings turned to serve a painted
// texture instead of competing with it: wrapped soft light with no bands (the light and wear are painted in the
// texture), no ink outline (the param is there, off), no gradient over the colour, a cool but light shadow, little
// grading, and a light bloom that "reduzir clarões" turns off.
const dflt = (params, defaults) => Object.fromEntries(Object.entries(params).map(([k, d]) => [k, Object.hasOwn(defaults, k) ? { ...d, default: defaults[k] } : d]));
export const PINTADO = defineLook({
  id: 'pintado',
  label: 'Pintado à mão',
  desc: 'Luz macia e envolvente, sem faixas e sem contorno, para não brigar com textura pintada à mão: sombra levemente fria, lâmpadas como ilhas quentes, lanterna com borda suave, correção de cor leve, resolução alta e lisa e brilho leve desligável. Serve malha com esqueleto.',
  params: dflt(ANIMACAO.params, {
    banding: 0, rim: 0.1, shadowTintAmount: 0.45, gradient: 0, saturation: 1.05, contrast: 1, lineStrength: 0, smoothing: 0.5, bloom: 0.25,
  }),
  uniforms: ANIMACAO.uniforms,
  fill: ANIMACAO.fill,
  size: ANIMACAO.size,
  post: ANIMACAO.post,
});


// ---- Interior: rooms behind a window (interior mapping) -----------------------------------------------------------
// A shader of surface for a window or a shop front: a quad with UV 0..1. Each fragment casts the eye's ray into a virtual
// box of a room (width and height of the quad, `depth` metres deep) and takes the colour of the face it hits: the back
// wall, the two side walls, the floor or the ceiling. No loop, no real geometry behind the glass: the room shifts with
// the eye (parallax) as it would through a real window.
//
// The rooms: with an atlas (the material's `map`, a texture of `rooms` rooms side by side) each room is a square cell,
// cut in 3x3 tiles in an unfolded cross: back wall in the middle, left wall to its left, right wall to its right,
// ceiling above, floor below (in each tile, up is up in the room; the walls' edge next to the back wall is the far
// edge). Without a `map` the shader paints its own rooms from a hash of the cell (walls, floor boards, a lamp, a shelf,
// a picture), enough to test it and to use as it is.
// The room of a window is drawn by a hash of where the window is in the world (the quad's own corner), so it is stable
// from any side and for any camera, and the same window never changes room.
// Light: `night` (0 day, 1 night) is for the game to move with its clock (the shader has no game hour; set
// `material.uniforms.s_night.value`): by day all the rooms are dim and bluish, at night a share of them (`lit`) has a
// warm lamp on, each window turning on at its own point of `night`, so nothing flashes. The glass on top: a light
// reflection of the sky, dirt (streaks) and, per window by hash, a blind and a curtain. The shader ignores the
// material's colour (pass '#ffffff'); use `emissive: 1`, since the rooms have their own light.
export const INTERIOR = defineShader({
  id: 'interior',
  label: 'Interior (janela com cômodo)',
  desc: 'Cômodo de verdade atrás do vidro de uma janela ou vitrine (interior mapping): o fundo, as paredes, o chão e o teto mudam com o olhar. Cômodos de um atlas (o mapa do material) ou pintados pelo próprio shader, sorteados pela posição da janela; de noite uma parte acende. Vidro com reflexo do céu e sujeira, persiana e cortina opcionais.',
  params: {
    depth: { type: 'number', label: 'Profundidade do cômodo (m)', min: 1, max: 8, step: 0.25, default: 3.5 },
    rooms: { type: 'number', label: 'Cômodos no atlas', min: 1, max: 16, step: 1, default: 4 },
    seed: { type: 'number', label: 'Semente do sorteio dos cômodos', min: 0, max: 99, step: 1, default: 0 },
    night: { type: 'number', label: 'Noite (0 dia, 1 noite; o jogo move com a hora)', min: 0, max: 1, step: 0.05, default: 0 },
    lit: { type: 'number', label: 'Parte dos cômodos que acende à noite', min: 0, max: 1, step: 0.05, default: 0.3 },
    lamp: { type: 'color', label: 'Cor da luz acesa', default: '#ffc27a' },
    glass: { type: 'number', label: 'Reflexo do céu no vidro', min: 0, max: 1, step: 0.05, default: 0.5 },
    sky: { type: 'color', label: 'Cor do céu refletido', default: '#8fa4d8' },
    dirt: { type: 'number', label: 'Sujeira no vidro', min: 0, max: 1, step: 0.05, default: 0.4 },
    blind: { type: 'number', label: 'Parte das janelas com persiana', min: 0, max: 1, step: 0.05, default: 0.25 },
    curtain: { type: 'number', label: 'Parte das janelas com cortina', min: 0, max: 1, step: 0.05, default: 0.2 },
    frame: { type: 'number', label: 'Moldura escura na borda', min: 0, max: 0.15, step: 0.01, default: 0.03 },
  },
  surface: `
float ih(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float inz(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ih(i), ih(i + vec2(1.0, 0.0)), f.x), mix(ih(i + vec2(0.0, 1.0)), ih(i + vec2(1.0, 1.0)), f.x), f.y);
}
// the room's own painting, when there is no atlas: face 0 back, 1 left, 2 right, 3 floor, 4 ceiling; f in 0..1
vec3 inPaint(int face, vec2 f, float cell) {
  float h1 = ih(vec2(cell, 1.0)), h2 = ih(vec2(cell, 2.0)), h3 = ih(vec2(cell, 3.0));
  vec3 wall = 0.45 + 0.35 * vec3(ih(vec2(cell, 4.0)), ih(vec2(cell, 5.0)), ih(vec2(cell, 6.0)));
  wall = mix(wall, vec3(dot(wall, vec3(0.33))), 0.45);
  if (face == 3) { vec3 fl = mix(vec3(0.34, 0.24, 0.17), vec3(0.26, 0.28, 0.31), step(0.5, h2)); return fl * (0.82 + 0.18 * step(0.07, fract(f.x * 9.0))); }
  if (face == 4) { vec3 c = vec3(0.78); vec2 d = abs(f - 0.5); if (max(d.x, d.y) < 0.09 + 0.05 * h1) c = vec3(1.4); return c; }
  vec3 c = wall * (0.9 + 0.1 * step(0.5, fract(f.x * 6.0)));
  if (f.y < 0.07) c *= 0.6;
  if (face == 0) {
    if (f.x > 0.1 + 0.4 * h1 && f.x < 0.4 + 0.4 * h1 && f.y < 0.3 + 0.3 * h2) c = vec3(0.22, 0.15, 0.1) * (0.8 + 0.4 * step(0.5, fract(f.y * 9.0)));
    if (h3 > 0.5 && f.x > 0.62 && f.x < 0.86 && f.y > 0.38 && f.y < 0.78) c = vec3(0.7, 0.62, 0.45);
  }
  return c;
}
vec3 inFace(int face, vec2 f, float cell, float rooms, float lod) {
  if (uHasMap > 0.5) {
    vec2 tile = face == 0 ? vec2(1.0, 1.0) : face == 1 ? vec2(0.0, 1.0) : face == 2 ? vec2(2.0, 1.0) : face == 3 ? vec2(1.0, 0.0) : vec2(1.0, 2.0);
    vec2 g = clamp(f, 0.004, 0.996);
    return textureLod(map, vec2((cell + (tile.x + g.x) / 3.0) / rooms, (tile.y + g.y) / 3.0), lod).rgb;
  }
  return inPaint(face, f, cell);
}
vec3 surface(vec3 base, vec2 uv, vec3 world, float t) {
  // the quad's own axes in the world, from the derivatives (a window needs no tangent attribute)
  vec3 dpx = dFdx(world), dpy = dFdy(world); vec2 dux = dFdx(uv), duy = dFdy(uv);
  float det = dux.x * duy.y - duy.x * dux.y;
  if (abs(det) < 1e-12) return vec3(0.0);
  vec3 T = (dpx * duy.y - dpy * dux.y) / det, B = (dpy * dux.x - dpx * duy.x) / det;
  float W = max(length(T), 1e-4), H = max(length(B), 1e-4);
  vec3 Tn = T / W, Bn = B / H, Nn = normalize(cross(Tn, Bn));
  vec3 ray = normalize(world - cameraPosition);
  if (dot(ray, Nn) < 0.0) Nn = -Nn;            // Nn points into the room
  float D = s_depth;
  vec3 d = vec3(dot(ray, Tn), dot(ray, Bn), max(dot(ray, Nn), 1e-3));
  vec3 org = world - T * uv.x - B * uv.y;      // the window's corner: the room's key, steady for any camera
  float key = ih(floor(org.xz * 20.0 + 0.5) + floor(org.y * 20.0 + 0.5) * 7.0 + s_seed * 13.0);
  float cell = floor(ih(vec2(key, 5.0)) * s_rooms);
  float flipX = step(0.5, ih(vec2(key, 9.0)));
  vec2 p = vec2(flipX > 0.5 ? 1.0 - uv.x : uv.x, uv.y) * vec2(W, H);
  d.x = flipX > 0.5 ? -d.x : d.x;
  // the ray to the three slabs: no loop
  float tx = (d.x > 0.0 ? W - p.x : -p.x) / (abs(d.x) > 1e-5 ? d.x : 1e-5);
  float ty = (d.y > 0.0 ? H - p.y : -p.y) / (abs(d.y) > 1e-5 ? d.y : 1e-5);
  float tz = D / d.z;
  float tm = min(tz, min(tx, ty));
  vec3 hit = vec3(p, 0.0) + d * tm;
  int face; vec2 f;
  if (tm == tz) { face = 0; f = vec2(hit.x / W, hit.y / H); }
  else if (tm == tx) { if (d.x < 0.0) { face = 1; f = vec2(hit.z / D, hit.y / H); } else { face = 2; f = vec2(1.0 - hit.z / D, hit.y / H); } }
  else if (d.y < 0.0) { face = 3; f = vec2(hit.x / W, hit.z / D); }
  else { face = 4; f = vec2(hit.x / W, 1.0 - hit.z / D); }
  float tile = max(length(dux), length(duy)) * 100.0;
  float lod = uHasMap > 0.5 ? log2(max(1.0, tile * float(textureSize(map, 0).y) / 3.0 / 100.0)) : 0.0;
  vec3 room = inFace(face, f, cell, s_rooms, lod);
  // the light: a lamp (a share of the rooms, each turning on at its own point of the night) or the dim, bluish day
  float on = step(ih(vec2(key, 3.0)), s_lit * s_night);
  float deep = face == 0 ? 0.6 : clamp(hit.z / D, 0.0, 1.0);
  vec3 lamp = s_lamp * (1.25 - 0.7 * deep);
  vec3 day = mix(vec3(0.5, 0.55, 0.65), vec3(0.1, 0.12, 0.2), s_night) * (1.1 - 0.5 * deep);
  vec3 col = room * mix(day, lamp, on);
  // a curtain and a blind, by hash, on top of the room
  vec2 q = uv;
  float cw = 0.14 + 0.1 * ih(vec2(key, 21.0));
  if (ih(vec2(key, 22.0)) < s_curtain && (q.x < cw || q.x > 1.0 - cw)) {
    vec3 fabric = (0.35 + 0.4 * vec3(ih(vec2(key, 23.0)), ih(vec2(key, 24.0)), ih(vec2(key, 25.0)))) * (0.8 + 0.2 * sin(q.x * 70.0));
    col = fabric * mix(mix(vec3(0.5, 0.55, 0.65), vec3(0.1, 0.12, 0.2), s_night), s_lamp * 0.9, on);
  }
  float drop = 0.3 + 0.7 * ih(vec2(key, 31.0));
  if (ih(vec2(key, 32.0)) < s_blind && q.y > 1.0 - drop) {
    float slat = 0.72 + 0.28 * step(0.5, fract(q.y * H / 0.045));
    col = vec3(0.72, 0.69, 0.6) * slat * mix(mix(vec3(0.5, 0.55, 0.65), vec3(0.1, 0.12, 0.2), s_night), s_lamp * 0.9, on);
  }
  // the glass: the sky's light reflection (stronger at a grazing look), dirt in streaks, the dark frame
  float fres = pow(1.0 - abs(dot(ray, Nn)), 3.0);
  col += s_sky * (0.05 + 0.55 * fres) * s_glass * mix(1.0, 0.3, s_night);
  float streak = inz(vec2(uv.x * 14.0 + key * 40.0, uv.y * 2.5)), blot = inz(uv * vec2(5.0, 8.0) + key * 17.0);
  col = mix(col, vec3(0.3, 0.31, 0.3) * mix(1.0, 0.4, s_night), clamp((streak * 0.6 + blot * 0.4 - 0.25) * 1.4, 0.0, 1.0) * s_dirt * 0.7);
  float e = min(min(uv.x, 1.0 - uv.x) * W, min(uv.y, 1.0 - uv.y) * H) / max(min(W, H), 1e-3);
  col = mix(vec3(0.05, 0.06, 0.08), col, smoothstep(s_frame * 0.7, s_frame, e));
  return col;
}`,
});
