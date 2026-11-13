// Local copy of the Rinha renderer for the preview page only (8 point lights). Not part of the game.
import * as THREE from 'three';

const VERT = /* glsl */ `
uniform vec2 uRes; uniform vec3 uLightDir, uLightColor, uAmbient;
uniform vec3 uPointPos[8]; uniform vec3 uPointColor[8]; uniform float uPointRange[8];
uniform float uFogNear, uFogFar, uRepeat;
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog; varying vec3 vCol;
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
  vec3 n = normalize(mat3(model) * normal);
  vec3 l = uAmbient + uLightColor * max(dot(n, normalize(-uLightDir)), 0.0);
  for (int i = 0; i < 8; i++) {
    vec3 toP = uPointPos[i] - world.xyz; float d = length(toP);
    l += uPointColor[i] * max(dot(n, toP / max(d, 1e-3)), 0.0) * clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
  }
  vLight = l;
  vec4 view = viewMatrix * world;
  vFog = clamp((-view.z - uFogNear) / max(uFogFar - uFogNear, 1e-3), 0.0, 1.0);
  vec4 clip = projectionMatrix * view;
  if (clip.w > 0.0) {
    vec2 g = uRes * 0.5;
    clip.xy = floor(clip.xy / clip.w * g + 0.5) / g * clip.w;
  }
  gl_Position = clip;
  vUvA = uv * uRepeat * clip.w; vW = clip.w;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float uHasMap, uEmissive, uFogged, uAlpha;
uniform vec3 uColor, uFogColor;
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog; varying vec3 vCol;
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec2 uv = vUvA / vW;
  vec4 tex = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 c = tex.rgb * uColor * vCol * mix(vLight, vec3(1.0), uEmissive);
  c = mix(c, uFogColor, vFog * uFogged);
  c += (bayer(gl_FragCoord.xy) - 0.5) / 24.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, uAlpha);
}`;

export function createRender(canvas) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  canvas.style.imageRendering = 'pixelated';
  const FOG = new THREE.Color('#0b0d14');
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.03, 120);
  const U = {
    uRes: { value: new THREE.Vector2(320, 180) },
    uLightDir: { value: new THREE.Vector3(-0.2, -1, -0.15) },
    uLightColor: { value: new THREE.Color(0.2, 0.22, 0.3) },
    uAmbient: { value: new THREE.Color(0.3, 0.32, 0.4) },
    uPointPos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    uPointColor: { value: Array.from({ length: 8 }, () => new THREE.Color(0, 0, 0)) },
    uPointRange: { value: Array(8).fill(1) },
    uFogColor: { value: FOG.clone() }, uFogNear: { value: 12 }, uFogFar: { value: 40 },
  };
  function mat(color, opts = {}) {
    const map = opts.map;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...U, map: { value: map ?? null }, uHasMap: { value: map ? 1 : 0 }, uRepeat: { value: opts.repeat ?? 1 },
        uEmissive: { value: opts.emissive ?? 0 }, uFogged: { value: opts.fogged ?? 1 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: opts.opacity ?? 1 } },
      vertexShader: VERT, fragmentShader: FRAG, side: opts.side ?? THREE.FrontSide,
      transparent: Boolean(opts.transparent), depthWrite: opts.depthWrite ?? true,
    });
    m.vertexColors = Boolean(opts.vertexColors);
    m.opacity = opts.opacity ?? 1;
    m.onBeforeRender = () => { m.uniforms.uAlpha.value = m.opacity; };
    return m;
  }
  const glow = (color, opts = {}) => mat(color, { emissive: 1, fogged: 0.6, ...opts });
  function light(o) {
    if (o.ambient !== undefined) U.uAmbient.value.set(o.ambient);
    if (o.key !== undefined) U.uLightColor.value.set(o.key);
    if (o.fog !== undefined) { U.uFogColor.value.set(o.fog); scene.background.set(o.fog); }
    if (o.fogNear !== undefined) U.uFogNear.value = o.fogNear;
    if (o.fogFar !== undefined) U.uFogFar.value = o.fogFar;
  }
  function point(i, { pos, color, range }) {
    if (pos) U.uPointPos.value[i].set(...pos);
    if (color !== undefined) U.uPointColor.value[i].set(color);
    if (range !== undefined) U.uPointRange.value[i] = range;
  }
  const size = { w: 0, h: 0 };
  function resize(cssW, cssH) {
    const w = 320, h = Math.max(120, Math.round(320 * cssH / cssW));
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    U.uRes.value.set(w, h);
    camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 84 : 62; camera.updateProjectionMatrix();
  }
  return { vertexColors: !new URLSearchParams(location.search).has('novc'), THREE, renderer, scene, camera, canvas, size, mat, glow, light, point, resize, draw: () => renderer.render(scene, camera) };
}
