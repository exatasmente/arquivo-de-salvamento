// PS1 render: low internal resolution (384 wide in landscape), enlarged without smoothing; no
// antialias, no colour management; vertex light (8 point lights) and short fog from the PS1 shader,
// plus the flashlight cone.
import * as THREE from 'three';
import { PS1_VERT, PS1_FRAG, POINT_LIGHTS } from './ps1-shader.js';
import { mulberry32 } from './rng.js';

export const INTERNAL_WIDTH = 384;
export const INTERNAL_WIDTH_PORTRAIT = 240;

const PAINT = {
  floor: [64, (g, n, r) => {
    noise(g, n, [96, 104, 120], 0.22, r);
    g.fillStyle = 'rgb(50,56,68)';
    for (let i = 0; i < n; i += 16) { g.fillRect(i, 0, 1, n); g.fillRect(0, i, n, 1); }
    g.fillStyle = 'rgb(150,120,70)';
    for (let i = 0; i < 14; i++) g.fillRect((r() * n) | 0, (r() * n) | 0, 2 + ((r() * 5) | 0), 1);
  }],
  metal: [32, (g, n, r) => { noise(g, n, [88, 94, 104], 0.14, r); g.fillStyle = 'rgb(46,50,58)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 0, 1, n); g.fillRect(n / 2, 0, 1, n); }],
  wall: [64, (g, n, r) => {
    noise(g, n, [70, 76, 90], 0.16, r);
    g.fillStyle = 'rgb(34,38,48)';
    for (let x = 0; x < n; x += 16) g.fillRect(x, 0, 1, n);
    for (let y = 0; y < n; y += 32) g.fillRect(0, y, n, 2);
    g.fillStyle = 'rgb(170,130,60)';
    for (let x = 4; x < n; x += 16) g.fillRect(x, 8, 2, 2);
  }],
  seat: [16, (g, n, r) => noise(g, n, [48, 46, 56], 0.3, r)],
  skin: [16, (g, n, r) => noise(g, n, [235, 235, 235], 0.1, r)],
  face: [32, (g, n, r) => {
    // equirectangular sphere map: the front of the head sits at u = 0.25
    noise(g, n, [240, 240, 240], 0.08, r);
    g.fillStyle = 'rgb(40,28,24)';
    g.fillRect(6, 7, 3, 1); g.fillRect(11, 7, 3, 1); // brows
    g.fillRect(7, 9, 2, 1); g.fillRect(12, 9, 2, 1); // eyes
    g.fillStyle = 'rgb(150,100,90)'; g.fillRect(9, 12, 3, 1); // mouth
    g.fillStyle = 'rgb(200,190,190)'; g.fillRect(10, 10, 1, 2); // nose
  }],
  cloth: [16, (g, n, r) => { noise(g, n, [235, 235, 235], 0.18, r); g.fillStyle = 'rgb(160,160,160)'; g.fillRect(0, 0, n, 1); }],
};

function noise(g, n, base, amt, r) {
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = 1 + (r() - 0.5) * amt;
    g.fillStyle = `rgb(${base.map((c) => Math.min(255, c * k) | 0).join(',')})`;
    g.fillRect(x, y, 1, 1);
  }
}

export function createRender(canvas) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  canvas.style.imageRendering = 'pixelated';

  const FOG = new THREE.Color('#07080d');
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.03, 90);

  const U = {
    uRes: { value: new THREE.Vector2(INTERNAL_WIDTH, 180) },
    uLightDir: { value: new THREE.Vector3(-0.2, -1, -0.15) },
    uLightColor: { value: new THREE.Color(0.55, 0.52, 0.48) },
    uAmbient: { value: new THREE.Color(0.30, 0.32, 0.40) },
    uPointPos: { value: Array.from({ length: POINT_LIGHTS }, () => new THREE.Vector3()) },
    uPointColor: { value: Array.from({ length: POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    uPointRange: { value: Array.from({ length: POINT_LIGHTS }, () => 1) },
    uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(0, 0, -1) },
    uSpotColor: { value: new THREE.Color(0.9, 0.85, 0.7) }, uSpotCos: { value: 0.9 }, uSpotRange: { value: 14 }, uSpotOn: { value: 0 },
    uFogColor: { value: FOG.clone() },
    uFogNear: { value: 10 },
    uFogFar: { value: 40 },
  };

  const textures = {};
  function texture(kind) {
    if (textures[kind]) return textures[kind];
    const [n, paint] = PAINT[kind];
    const c = document.createElement('canvas'); c.width = c.height = n;
    paint(c.getContext('2d'), n, mulberry32(kind.length * 7919 + n));
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    return (textures[kind] = t);
  }

  /** PS1 material. opts: map (name), repeat, vertexColors (geometry colour attribute multiplies the colour), emissive (0..1), fogged, opacity, transparent, side. */
  function mat(color, opts = {}) {
    const map = typeof opts.map === 'string' ? texture(opts.map) : opts.map;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        map: { value: map ?? null }, uHasMap: { value: map ? 1 : 0 }, uRepeat: { value: opts.repeat ?? 1 },
        uEmissive: { value: opts.emissive ?? 0 }, uFogged: { value: opts.fogged ?? 1 },
        uColor: { value: new THREE.Color(color) }, uAlpha: { value: opts.opacity ?? 1 },
      },
      vertexShader: PS1_VERT, fragmentShader: PS1_FRAG,
      side: opts.side ?? THREE.FrontSide, vertexColors: Boolean(opts.vertexColors), transparent: Boolean(opts.transparent), depthWrite: opts.depthWrite ?? true,
    });
    m.opacity = opts.opacity ?? 1;
    m.onBeforeRender = () => { m.uniforms.uAlpha.value = m.opacity; };
    return m;
  }
  const glow = (color, opts = {}) => mat(color, { emissive: 1, fogged: 0.6, ...opts });

  function light(o) {
    if (o.ambient !== undefined) U.uAmbient.value.set(o.ambient);
    if (o.key !== undefined) U.uLightColor.value.set(o.key);
    if (o.keyDir) U.uLightDir.value.set(...o.keyDir);
    if (o.fog !== undefined) { U.uFogColor.value.set(o.fog); scene.background.set(o.fog); }
    if (o.fogNear !== undefined) U.uFogNear.value = o.fogNear;
    if (o.fogFar !== undefined) U.uFogFar.value = o.fogFar;
  }
  function point(i, { pos, color, range }) {
    if (pos) U.uPointPos.value[i].set(...pos);
    if (color !== undefined) U.uPointColor.value[i].set(color);
    if (range !== undefined) U.uPointRange.value[i] = range;
  }
  /** The flashlight: a cone from pos along dir (unit). cos is the cosine of the half angle. */
  function spot({ on, pos, dir, color, range, cos }) {
    if (on !== undefined) U.uSpotOn.value = on ? 1 : 0;
    if (pos) U.uSpotPos.value.set(...pos);
    if (dir) U.uSpotDir.value.set(...dir).normalize();
    if (color !== undefined) U.uSpotColor.value.set(color);
    if (range !== undefined) U.uSpotRange.value = range;
    if (cos !== undefined) U.uSpotCos.value = cos;
  }

  const size = { w: 0, h: 0, cssW: 0, cssH: 0 };
  /** Internal size: 320 wide, height from the window shape; enlarged by CSS without smoothing. */
  function resize(cssW, cssH) {
    const w = cssH > cssW ? INTERNAL_WIDTH_PORTRAIT : INTERNAL_WIDTH, h = Math.max(120, Math.round(w * cssH / cssW));
    size.w = w; size.h = h; size.cssW = cssW; size.cssH = cssH;
    renderer.setSize(w, h, false);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    U.uRes.value.set(w, h);
    camera.aspect = w / h;
    camera.baseFov = camera.aspect < 1 ? 82 : 64; camera.fov = camera.baseFov; // vertical field of view
    camera.updateProjectionMatrix();
  }

  const draw = () => renderer.render(scene, camera);

  return { vertexColors: true, THREE, renderer, scene, camera, canvas, size, mat, glow, texture, light, point, spot, resize, draw, POINT_LIGHTS };
}

/** Merge geometries (each with a matrix) into one non-indexed geometry. */
export function mergeGeos(parts) {
  const pos = [], nor = [], uv = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const { geo, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
