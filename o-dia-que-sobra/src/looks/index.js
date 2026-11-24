// The game's own looks. `prerender` is the picture the game has by default: a 3D image that looks pre-rendered, with dense
// darkness, a hard fluorescent light that casts real shadows, ambient occlusion, a dirty desaturated grade, film grain, a
// vignette and a little chromatic softness. The old picture (the n64 look at 384 px) is the "1998 mode" (src/render.js).
//
// How it is made (everything is a function of the game's clock, `render.time(t)`):
//  - every material is lit per pixel: the moon's key light, the 8 point lights the lighting system chooses, the flashlight's
//    cone, a hemisphere of ambient and a little specular; then an exponential tone curve and the fog;
//  - the strongest lights cast shadows: before the picture, `pre` draws the scene's depth from each of them (a depth texture
//    per light, wide field of view, straight down for a ceiling lamp) and the materials compare against it, with a normal offset
//    and a 2x2 filter. Glowing parts, transparent ones and everything that is not an engine material do not cast;
//  - the ambient occlusion is screen space (a few taps of the depth, with a normal made from its derivatives);
//  - the grade, vignette, grain and the colour fringe are one pass over the finished picture (`post`).
// Params are typed; the quality tiers (src/render.js) are sets of them.
import { defineLook, LOOKS } from '../../vendor/engine/looks.js';

const SLOTS = 4;      // the most shadow maps the look keeps (the `shadows` param says how many are used)
const LIGHTS = 8;

/** The shadow resources are one set per page: the materials keep the uniform objects, so a change of look and back finds them again. */
let shared = null, dummyTex = null;
function sharedUniforms(THREE) {
  if (shared) return shared;
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummy.needsUpdate = true;
  const u = {
    uShMat: { value: Array.from({ length: SLOTS }, () => new THREE.Matrix4()) },
    uShNF: { value: Array.from({ length: SLOTS }, () => new THREE.Vector2(0.1, 10)) },
    uShTx: { value: Array.from({ length: SLOTS }, () => new THREE.Vector2(0.01, 0.001)) },
    uShIdx: { value: Array(SLOTS).fill(-1) },
    uShK: { value: Array(SLOTS).fill(0) },
    uExposure: { value: 1.5 }, uGloss: { value: 0.25 }, uGrime: { value: 0.5 }, uRelief: { value: 0.5 }, uGlow: { value: 1.7 }, uHard: { value: 0.7 }, uAmbK: { value: 0.7 }, uLampK: { value: 1.3 }, uShFloor: { value: 0.12 },
  };
  for (let i = 0; i < SLOTS; i++) u[`uShTex${i}`] = { value: dummy };
  dummyTex = dummy;
  return (shared = u);
}

// ---- the material -----------------------------------------------------------------------------------------

const glslType = { number: 'float', bool: 'float', color: 'vec3', enum: 'float', text: null };

export function source(p, shader = null) {
  const S = p.shadows;
  const slots = Array.from({ length: S }, (_, i) => i);
  const pcf = p.shadowSoft === 4;
  const sUniforms = shader ? Object.entries(shader.params ?? {}).map(([k, d]) => (glslType[d.type] ? `uniform ${glslType[d.type]} s_${k};` : '')).filter(Boolean).join(' ') : '';
  const vert = `
uniform float uRepeat;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vCol; varying float vDepth;
void main() {
  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(model) * normal;
  vUv = uv * uRepeat;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}`;
  const shadowDecl = S ? `
${slots.map((i) => `uniform sampler2D uShTex${i};`).join(' ')}
uniform mat4 uShMat[${S}]; uniform vec2 uShNF[${S}]; uniform vec2 uShTx[${S}]; uniform float uShIdx[${S}]; uniform float uShK[${S}];
float shTap(sampler2D t, vec2 uv, float z, vec2 nf, float bias) {
  float d = texture2D(t, uv).x;
  float lin = nf.x * nf.y / (nf.y - d * (nf.y - nf.x));
  return z - bias <= lin ? 1.0 : 0.0;
}
// 1 = lit, 0 = in shadow, for the light of slot s seen from this pixel (normal offset against acne, a soft edge at the border of the map)
float shOf(sampler2D t, mat4 M, vec2 nf, vec2 tx, vec3 N, float ndl) {
  vec4 s0 = M * vec4(vWorld, 1.0);
  if (s0.w <= 0.0) return 1.0;
  float tw = tx.x * s0.w;
  vec4 sp = M * vec4(vWorld + N * tw * (1.5 + 2.0 * (1.0 - clamp(ndl, 0.0, 1.0))), 1.0);
  if (sp.w <= 0.0) return 1.0;
  vec2 uv = sp.xy / sp.w * 0.5 + 0.5;
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.07, min(e.x, e.y));
  if (edge <= 0.0) return 1.0;
  float bias = tw * 1.3 + 0.012;
  float s;
${pcf ? `  vec2 o = vec2(0.5 * tx.y);
  s = 0.25 * (shTap(t, uv + vec2(-o.x, -o.y), sp.w, nf, bias) + shTap(t, uv + vec2(o.x, -o.y), sp.w, nf, bias) + shTap(t, uv + vec2(-o.x, o.y), sp.w, nf, bias) + shTap(t, uv + vec2(o.x, o.y), sp.w, nf, bias));` : `  s = shTap(t, uv, sp.w, nf, bias);`}
  return mix(1.0, mix(uShFloor, 1.0, s), edge);
}` : '';
  const shadowRun = S ? `
  ${slots.map((i) => `if (uShK[${i}] > 0.001) {
    int li = int(uShIdx[${i}] + 0.5);
    if (li >= 0) {
      vec3 Lp = li == ${LIGHTS} ? uSpotPos : uPointPos[li];
      vec3 Ls = Lp - vWorld; float dl = length(Ls);
      float rg = li == ${LIGHTS} ? uSpotRange : uPointRange[li];
      float nd = dot(N, Ls / max(dl, 1e-3));
      if (nd > 0.0 && dl < rg) {
        float f = mix(1.0, shOf(uShTex${i}, uShMat[${i}], uShNF[${i}], uShTx[${i}], N, nd), uShK[${i}]);
        if (li == ${LIGHTS}) shS = f; else shP[li] = f;
      }
    }
  }`).join('\n  ')}` : '';
  const frag = `
uniform sampler2D map; uniform float uHasMap, uEmissive, uFogged, uAlpha, uShine;
uniform vec3 uColor, uFogColor;
uniform vec3 uLightDir, uLightColor, uAmbient;
uniform vec3 uPointPos[${LIGHTS}]; uniform vec3 uPointColor[${LIGHTS}]; uniform float uPointRange[${LIGHTS}];
uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotCos, uSpotRange, uSpotOn;
uniform float uFogNear, uFogFar, uTime;
uniform float uExposure, uGloss, uGrime, uRelief, uGlow, uHard, uAmbK, uLampK, uShFloor;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vCol; varying float vDepth;
${shader ? `${sUniforms}\n${shader.surface}\n` : ''}${shadowDecl}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = ${shader ? 'surface(tex.rgb * uColor, vUv, vWorld, uTime)' : 'tex.rgb * uColor'} * vCol;

  // fine dirt: a noise in the plane the surface faces, darkening and giving a little relief under the hard light
  vec2 g = abs(N.y) > 0.7 ? vWorld.xz : (abs(N.x) > 0.7 ? vWorld.zy : vWorld.xy);
  float nz = vn(g * 7.0) * 0.55 + vn(g * 29.0) * 0.45;
  base *= 1.0 + uGrime * (nz - 0.5) * 0.7;
  base *= 1.0 - uGrime * 0.35 * smoothstep(0.55, 0.95, vn(g * 2.3 + 11.0));
  if (uRelief > 0.001) {
    float hgt = nz * 0.5 + dot(tex.rgb, vec3(0.3, 0.5, 0.2)) * 0.5;
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
    N = normalize(abs(det) * N - grad * uRelief * 0.012);
  }

  float shP[${LIGHTS}];
  for (int i = 0; i < ${LIGHTS}; i++) shP[i] = 1.0;
  float shS = 1.0;
${shadowRun}

  vec3 amb = max(uAmbK * uAmbient * (0.72 + 0.28 * N.y) * (0.8 + 0.2 * smoothstep(0.0, 1.4, vWorld.y)), vec3(0.02));   // (a floor: no corner is flat black)
  vec3 diff = uLightColor * max(dot(N, -normalize(uLightDir)), 0.0);
  vec3 spec = vec3(0.0);
  float wrap = 0.3 * (1.0 - uHard);
  for (int i = 0; i < ${LIGHTS}; i++) {
    vec3 toP = uPointPos[i] - vWorld; float d = length(toP);
    float a = clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
    if (a <= 0.0) continue;
    vec3 Ld = toP / max(d, 1e-3);
    float ndl = dot(N, Ld);
    float lam = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
    float att = a * (0.4 + 0.6 * a) * shP[i];
    diff += uLampK * uPointColor[i] * lam * att;
    spec += uLampK * uPointColor[i] * pow(max(dot(N, normalize(Ld + V)), 0.0), 36.0) * att * step(0.0, ndl);
  }
  if (uSpotOn > 0.5) {
    vec3 L = uSpotPos - vWorld; float d = length(L); L /= max(d, 1e-3);
    float cone = smoothstep(uSpotCos - 0.02, uSpotCos + 0.12, dot(-L, uSpotDir));
    float att = clamp(1.0 - d / uSpotRange, 0.0, 1.0);
    att = att * (0.4 + 0.6 * att) * cone * shS;
    float ndl = clamp(dot(N, L) * 0.9 + 0.1, 0.0, 1.0);
    diff += 1.8 * uSpotColor * ndl * att;
    spec += uSpotColor * pow(max(dot(N, normalize(L + V)), 0.0), 30.0) * att * step(0.0, dot(N, L));
  }
  vec3 lit = base * (amb + diff) + spec * uGloss * uShine * 0.5;
  lit = 1.0 - exp(-lit * uExposure);
  // what glows keeps its own colour (the tone curve would turn the amber sign pale): a glow is its colour times the glow, clipped
  vec3 c = mix(lit, min(base * uGlow * 0.5, 1.0), uEmissive);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 1e-3), 0.0, 1.0);
  c = mix(c, uFogColor, fog * uFogged);
  gl_FragColor = vec4(c, uAlpha);
}`;
  return { vert, frag };
}

// ---- the pass over the picture ----------------------------------------------------------------------------

function postSource(p) {
  const taps = p.aoTaps;
  const ao = taps > 0 ? `
  float aoK = 0.0;
  float z0 = linZ(uv);
  vec3 P = viewPos(uv, z0);
  vec3 Nv = normalize(cross(dFdx(P), dFdy(P)) + vec3(0.0, 0.0, 1e-6));   // (the derivatives stay out of the branch below)
  if (Nv.z < 0.0) Nv = -Nv;
  if (z0 < uFar * 0.6) {
    float rpx = clamp(p_aoRadius * 0.5 * uRes.y / (uTanHalf * z0), 3.0, 0.07 * uRes.y);
    float a0 = hq(gl_FragCoord.xy) * 6.2831;
    for (int i = 0; i < ${taps}; i++) {
      float fi = (float(i) + 0.5) / ${taps}.0;
      float ang = a0 + float(i) * 2.39996;
      vec2 so = vec2(cos(ang), sin(ang)) * (0.2 + 0.8 * fi) * rpx / uRes;
      float zs = linZ(uv + so);
      vec3 Sv = viewPos(uv + so, zs) - P;
      float len = max(length(Sv), 1e-3);
      aoK += max(dot(Nv, Sv / len) - 0.1, 0.0) * (1.0 - smoothstep(p_aoRadius * 0.6, p_aoRadius * 1.7, len));
    }
    aoK = aoK / ${taps}.0 * (1.0 - smoothstep(14.0, 26.0, z0));
  }` : '';
  return `
float hq(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
${taps > 0 ? `float linZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
vec3 viewPos(vec2 uv, float z) { vec2 q = uv * 2.0 - 1.0; return vec3(q.x * uRes.x / uRes.y * uTanHalf * z, q.y * uTanHalf * z, z); }` : ''}
vec3 post(vec2 uv) {
  float frame = floor(uTime * 30.0);
  vec2 px = 1.0 / uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
${p.chroma ? `  // the colour fringe: red and blue slide apart toward the corners, and the picture is a touch soft
  vec2 fr = cc * r2 * p_soft * 6.0 * px;
  vec3 c = vec3(texture2D(tFrame, uv + fr).r, texture2D(tFrame, uv).g, texture2D(tFrame, uv - fr).b);
  vec3 sf = 0.5 * (texture2D(tFrame, uv + px * 0.75).rgb + texture2D(tFrame, uv - px * 0.75).rgb);
  c = mix(c, sf, 0.3 * clamp(p_soft, 0.0, 1.0));` : '  vec3 c = texture2D(tFrame, uv).rgb;'}
${ao}
${taps > 0 ? '  c *= 1.0 - clamp(aoK * p_ao * 2.2, 0.0, 0.85);' : ''}
  // the grade: grey the colour, cool shadows, sickly highlights, a crushed black and some contrast
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, mix(p_saturation, 1.0, smoothstep(0.5, 0.9, l)));   // (what is bright keeps its colour: the sign, the lamps)
  c *= mix(p_shadowTint, p_lightTint, smoothstep(0.08, 0.6, l));
  c = max(c - p_black, 0.0) / (1.0 - p_black);
  c = clamp((c - 0.22) * p_contrast + 0.22, 0.0, 1.0);
  c *= 1.0 - p_vignette * smoothstep(0.18, 0.62, length(cc * vec2(1.0, 0.85)));
  l = dot(c, vec3(0.299, 0.587, 0.114));
  c += (hq(floor(uv * uRes) + frame * 1.37) - 0.5) * p_grain * (1.1 - 0.7 * l);
  return c;
}`;
}

// ---- the shadow pass --------------------------------------------------------------------------------------

let st = null;
function stateOf(THREE) {
  if (st) return st;
  st = {
    THREE, frame: 0, size: 0, rts: [], sets: new Map(), hidden: [],
    cams: Array.from({ length: SLOTS }, () => new THREE.PerspectiveCamera(100, 1, 0.12, 10)),
    slots: Array.from({ length: SLOTS }, () => ({ key: null, k: 1, t0: -1e9, c: null, dirty: true })),
    depthMat: new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    v: new THREE.Vector3(), w: new THREE.Vector3(),
  };
  return st;
}
const lumaOf = (c) => 0.3 * c.r + 0.6 * c.g + 0.1 * c.b;

function pre({ renderer, scene, camera, U, p, THREE }) {
  const S = p.shadows, X = stateOf(THREE), sh = sharedUniforms(THREE);
  X.frame++;
  // The fade-in of a shadow is a function of the game's clock (a jump of the clock, as the film mode makes, shows the shadows whole).
  const now = U.uTime.value, disc = Math.abs(now - (X.last ?? now)) > 0.5; X.last = now;
  if (disc) for (const sl of X.slots) sl.t0 = now - 1;
  const K = sh.uShK.value, IDX = sh.uShIdx.value;
  if (!S) { K.fill(0); return; }
  if (X.size !== p.shadowSize) {
    // The targets of each size are kept (a tier change is rare and the memory small): disposing a depth target that a material
    // still samples made three throw, so none is disposed; a slot picks up the target of the size it has now.
    for (let i = 0; i < SLOTS; i++) sh[`uShTex${i}`].value = dummyTex;
    X.rts = X.sets.get(p.shadowSize) ?? X.sets.set(p.shadowSize, []).get(p.shadowSize); X.size = p.shadowSize;
    for (const sl of X.slots) sl.dirty = true;
  }
  const spotOn = p.flashShadow && U.uSpotOn.value > 0.5;
  // the point lights worth a shadow: the brightest ones near the camera
  const cand = [];
  for (let i = 0; i < LIGHTS; i++) {
    const col = U.uPointColor.value[i], l = lumaOf(col);
    if (l < 0.04) continue;
    const pos = U.uPointPos.value[i], range = U.uPointRange.value[i];
    const d = pos.distanceTo(camera.position);
    if (d > range + 6) continue;
    cand.push({ i, key: `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}`, pos, range, score: l * range / (4 + d) });
  }
  cand.sort((a, b) => b.score - a.score);
  const avail = [];
  for (let s = 0; s < S; s++) if (!(spotOn && s === S - 1)) avail.push(s);
  const top = cand.slice(0, avail.length + 1), taken = new Set(), free = [];
  for (const s of avail) {
    const sl = X.slots[s], c = sl.key && top.find((q) => q.key === sl.key);
    if (c && !taken.has(c.key)) { taken.add(c.key); sl.c = c; } else free.push(s);
  }
  for (const s of free) {
    const sl = X.slots[s], c = cand.find((q) => !taken.has(q.key));
    if (c) { taken.add(c.key); sl.key = c.key; sl.c = c; sl.t0 = disc ? now - 1 : now; sl.dirty = true; } else { sl.key = null; sl.c = null; }
  }
  if (spotOn) {
    const sl = X.slots[S - 1];
    if (sl.key !== 'spot') { sl.key = 'spot'; sl.t0 = disc ? now - 1 : now; }
    sl.c = { i: LIGHTS };
  } else if (p.flashShadow && X.slots[S - 1].key === 'spot') { X.slots[S - 1].key = null; X.slots[S - 1].c = null; }

  // what to draw into the depth: the meshes of the engine's materials that are solid and do not glow
  const work = [];
  for (let s = 0; s < S; s++) {
    const sl = X.slots[s];
    if (!sl.c) { K[s] = 0; IDX[s] = -1; continue; }
    sl.k = Math.max(0, Math.min(1, (now - (sl.t0 ?? now - 1)) / 0.3));
    K[s] = sl.k; IDX[s] = sl.c.i;
    if (sl.c.i === LIGHTS || sl.dirty || Math.floor(now * 30) % p.shadowEvery === (s % p.shadowEvery)) work.push(s);
  }
  for (let s = S; s < SLOTS; s++) { K[s] = 0; IDX[s] = -1; }
  if (!work.length) return;

  const hidden = X.hidden; hidden.length = 0;
  const prevRT = renderer.getRenderTarget(), prevBg = scene.background, prevOv = scene.overrideMaterial, prevAuto = renderer.autoClear;
  const prevBlock = renderer.getClearAlpha();
  scene.traverseVisible((o) => {
    if (o === scene) return;
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
    const m = o.material;
    const ok = o.isMesh && !Array.isArray(m) && m.userData?.engineSpec && !m.transparent && m.uniforms.uEmissive.value < 0.5 && m.uniforms.uAlpha.value > 0.5 && !o.userData.noShadow;
    if (!ok) { o.visible = false; hidden.push(o); }
  });
  try {
    scene.background = null; scene.overrideMaterial = X.depthMat; renderer.autoClear = true;
    for (const s of work) {
      const sl = X.slots[s], cam = X.cams[s];
      let rt = X.rts[s];
      if (!rt) {
        rt = X.rts[s] = new THREE.WebGLRenderTarget(X.size, X.size, { depthBuffer: true, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        rt.depthTexture = new THREE.DepthTexture(X.size, X.size);
        rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
      }
      sh[`uShTex${s}`].value = rt.depthTexture;
      let fov, near = 0.12, far;
      if (sl.c.i === LIGHTS) {
        cam.position.copy(U.uSpotPos.value);
        cam.up.set(0, 1, 0);
        X.v.copy(U.uSpotPos.value).add(U.uSpotDir.value);
        cam.lookAt(X.v);
        fov = Math.min(120, Math.max(30, 2 * Math.acos(Math.min(0.999, U.uSpotCos.value)) * 180 / Math.PI + 14)); far = U.uSpotRange.value;
      } else {
        const c = sl.c;
        cam.position.copy(c.pos);
        if (c.pos.y > 1.7) { cam.up.set(0, 0, -1); X.v.copy(c.pos); X.v.y -= 1; fov = p.shadowFov; }
        else {
          // a low lamp: toward where the camera looks, in steps so the map does not crawl while the player walks
          camera.getWorldDirection(X.w); X.v.copy(camera.position).addScaledVector(X.w, 2.5).sub(c.pos).normalize();
          X.v.set(Math.round(X.v.x * 4) / 4, Math.round(X.v.y * 4) / 4, Math.round(X.v.z * 4) / 4);
          if (X.v.lengthSq() < 0.01) X.v.set(0, -1, 0);
          X.v.normalize().add(c.pos); cam.up.set(0, 1, 0); fov = Math.max(90, p.shadowFov - 12);
        }
        cam.lookAt(X.v);
        far = Math.max(3, c.range * 1.05);
      }
      if (cam.fov !== fov || cam.far !== far || cam.near !== near || cam.aspect !== 1) { cam.fov = fov; cam.far = far; cam.near = near; cam.aspect = 1; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
      sh.uShMat.value[s].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      sh.uShNF.value[s].set(near, far);
      sh.uShTx.value[s].set(2 * Math.tan(fov * Math.PI / 360) / X.size, 1 / X.size);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      sl.dirty = false;
    }
  } finally {
    scene.overrideMaterial = prevOv; scene.background = prevBg; renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevRT);
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
  }
}

// ---- the look ---------------------------------------------------------------------------------------------

// The textures this look changed (a texture is shared by every material that uses it, whatever the look): what they had before.
const was0 = new WeakMap(), touched = new Set();
/** Gives back the filter, mipmaps and anisotropy the textures had before this look touched them (the 1998 mode needs them as they were). */
export function restoreTextures() {
  for (const ref of touched) {
    const t = ref.deref(), o = t && was0.get(t);
    if (!t) { touched.delete(ref); continue; }
    if (o) { t.generateMipmaps = o.gen; t.minFilter = o.min; t.magFilter = o.mag; t.anisotropy = o.an; t.needsUpdate = true; was0.delete(t); touched.delete(ref); }
  }
}

export const PRERENDER = defineLook({
  id: 'prerender',
  label: 'Pré-renderizado sujo',
  desc: 'Imagem 3D de aparência pré-renderizada: escuridão densa, luz dura de fluorescente com sombra em tempo real, oclusão ambiente, cor suja e dessaturada, grão, vinheta e um pouco de franja de cor. Sem tremida de vértice nem pontilhado.',
  postDepth: true,
  smooth: true,
  params: {
    scale: { type: 'number', label: 'Resolução (fração da tela)', min: 0.3, max: 1, step: 0.05, default: 1 },
    dprMax: { type: 'number', label: 'Densidade de pixels máxima', min: 1, max: 2, step: 0.25, default: 2 },
    maxWidth: { type: 'number', label: 'Largura máxima (px)', min: 320, max: 2560, step: 64, default: 1920 },
    shadows: { type: 'enum', label: 'Luzes com sombra em tempo real', options: [0, 1, 2, 3, 4], default: 4 },
    shadowSize: { type: 'enum', label: 'Tamanho do mapa de sombra (px)', options: [256, 512, 1024], default: 1024 },
    shadowSoft: { type: 'enum', label: 'Filtro da sombra (leituras)', options: [1, 4], default: 4 },
    shadowEvery: { type: 'enum', label: 'Sombra refeita a cada N quadros', options: [1, 2, 3], default: 1 },
    shadowFloor: { type: 'number', label: 'Luz mínima dentro da sombra', min: 0, max: 0.6, step: 0.02, default: 0.12 },
    shadowFov: { type: 'number', label: 'Abertura da sombra de uma lâmpada (graus)', min: 70, max: 130, step: 5, default: 120 },
    flashShadow: { type: 'bool', label: 'Sombra da lanterna', default: true },
    aoTaps: { type: 'enum', label: 'Oclusão ambiente: amostras (0 = sem)', options: [0, 4, 8], default: 8 },
    ao: { type: 'number', label: 'Oclusão ambiente', min: 0, max: 1, step: 0.05, default: 0.75 },
    aoRadius: { type: 'number', label: 'Alcance da oclusão (m)', min: 0.2, max: 1.5, step: 0.05, default: 0.6 },
    ambient: { type: 'number', label: 'Luz ambiente (fração)', min: 0, max: 1.5, step: 0.05, default: 0.7 },
    lamps: { type: 'number', label: 'Força das lâmpadas', min: 0.5, max: 2.5, step: 0.05, default: 1.3 },
    exposure: { type: 'number', label: 'Exposição', min: 0.6, max: 3, step: 0.05, default: 1.6 },
    glow: { type: 'number', label: 'Brilho das peças que emitem luz', min: 0.5, max: 3, step: 0.1, default: 2.2 },
    hardness: { type: 'number', label: 'Dureza da luz', min: 0, max: 1, step: 0.05, default: 0.75 },
    gloss: { type: 'number', label: 'Brilho especular', min: 0, max: 1, step: 0.05, default: 0.3 },
    relief: { type: 'number', label: 'Relevo fino das superfícies', min: 0, max: 1, step: 0.05, default: 0.5 },
    grime: { type: 'number', label: 'Sujeira', min: 0, max: 1, step: 0.05, default: 0.55 },
    saturation: { type: 'number', label: 'Saturação', min: 0, max: 1.2, step: 0.05, default: 0.62 },
    contrast: { type: 'number', label: 'Contraste', min: 0.7, max: 1.6, step: 0.05, default: 1.12 },
    black: { type: 'number', label: 'Preto esmagado', min: 0, max: 0.1, step: 0.005, default: 0.012 },
    shadowTint: { type: 'color', label: 'Tom das sombras', default: '#d8e8f0' },
    lightTint: { type: 'color', label: 'Tom das luzes', default: '#f4f2dc' },
    vignette: { type: 'number', label: 'Vinheta', min: 0, max: 1, step: 0.05, default: 0.55 },
    grain: { type: 'number', label: 'Grão', min: 0, max: 0.2, step: 0.005, default: 0.055 },
    chroma: { type: 'bool', label: 'Franja de cor e suavidade', default: true },
    soft: { type: 'number', label: 'Franja de cor (px nos cantos)', min: 0, max: 2, step: 0.1, default: 0.9 },
    vertexColors: { type: 'bool', label: 'Cor por vértice', default: true },
  },
  uniforms(THREE, p) {
    const ps1 = LOOKS.ps1.uniforms(THREE, { pointLights: LIGHTS, pixels: 384 });
    return { ...ps1, ...sharedUniforms(THREE) };
  },
  fill(m, spec, U, p, THREE) {
    const { color, map, opts, shader } = spec;
    const src = source(p, shader?.def ?? null);
    // A material filled again keeps its own uniforms as the game left them, and the object that holds them stays
    // the same (three keeps the one it first met): the new uniforms go into it.
    const was = m.uniforms ?? {};
    const keep = (k, make) => (Object.hasOwn(was, k) && was[k] ? was[k] : { value: make() });
    const mine = {
      map: keep('map', () => map ?? null), uHasMap: keep('uHasMap', () => (map ? 1 : 0)), uRepeat: keep('uRepeat', () => opts.repeat ?? 1),
      uEmissive: keep('uEmissive', () => opts.emissive ?? 0), uFogged: keep('uFogged', () => opts.fogged ?? 1),
      uColor: keep('uColor', () => new THREE.Color(color)), uAlpha: keep('uAlpha', () => opts.opacity ?? 1), uShine: keep('uShine', () => opts.shine ?? 1),
    };
    if (shader) for (const [k, d] of Object.entries(shader.def.params ?? {})) {
      if (d.type === 'text') continue;
      const v = shader.params[k];
      mine[`s_${k}`] = keep(`s_${k}`, () => (d.type === 'color' ? new THREE.Color(v) : d.type === 'bool' ? (v ? 1 : 0) : d.type === 'enum' ? d.options.indexOf(v) : v));
    }
    U.uExposure.value = p.exposure; U.uGloss.value = p.gloss; U.uGrime.value = p.grime; U.uRelief.value = p.relief; U.uGlow.value = p.glow; U.uHard.value = p.hardness; U.uAmbK.value = p.ambient; U.uLampK.value = p.lamps; U.uShFloor.value = p.shadowFloor;
    if (m.uniforms) Object.assign(m.uniforms, U, mine); else m.uniforms = { ...U, ...mine };
    m.vertexShader = src.vert;
    m.fragmentShader = src.frag;
    m.vertexColors = Boolean(opts.vertexColors);
    // The textures are enlarged with a smooth, mipmapped filter. What each one had is kept, so `restoreTextures` (the 1998 mode) gives it back.
    if (map?.isTexture) {
      if (!was0.has(map)) { was0.set(map, { gen: map.generateMipmaps, min: map.minFilter, mag: map.magFilter, an: map.anisotropy }); touched.add(new WeakRef(map)); }
      if (!map.generateMipmaps || map.minFilter !== THREE.LinearMipmapLinearFilter || map.magFilter !== THREE.LinearFilter) {
        map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 4; map.needsUpdate = true;
      }
    }
    m.needsUpdate = true;
  },
  size(cssW, cssH, p) {
    const dpr = Math.min(typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1, p.dprMax);
    const w = Math.max(320, Math.min(p.maxWidth, Math.round(cssW * dpr * p.scale)));
    return { w, h: Math.max(180, Math.round(w * cssH / cssW)) };
  },
  pre,
  post: postSource,
});
