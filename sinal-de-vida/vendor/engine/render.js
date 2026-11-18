// The engine's render (docs/engine.md, "Render"): the frame every game of the channel draws in. A low
// internal resolution enlarged without smoothing, no antialias and no colour management; the materials
// come from a look (looks.js), PS1 by default, and can change at run time, look and params, with every
// material already made following. The API is the one the games had in their own render.js:
//   r = createRender(canvas, { look, params, fog, fov, camera, paints })
//   r.mat(color, opts) · r.glow(color, opts) · r.shaded(shaderId, params, color, opts)
//   r.texture(name) · r.light({ ambient, key, keyDir, fog, fogNear, fogFar }) · r.point(i, { pos, color, range })
//   r.spot({ on, pos, dir, color, range, cos }) · r.resize(cssW, cssH) · r.draw() · r.time(t)
//   r.setLook(id, params) · r.look · r.lookParams · r.size · r.scene · r.camera · r.renderer · r.THREE
import * as THREE from 'three';
// Importing looks.js registers the PS1 look.
import { lookOf, shaderOf, paramsOf } from './looks.js';

/** The render made last on this page: the scene's look (entities.js) and the editor's door reach it. */
let current = null;
export const currentRender = () => current;
import { mulberry32 } from './rng.js';

/**
 * Small painted textures (nearest filter, repeating): [size, paint(g, n, rng)]. A game passes its own in
 * createRender's `paints` (they are added to these, and replace one of the same name).
 */
export const BASE_PAINTS = {
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

/** Fills a texture with a colour that varies a little per pixel (the base of most paints). */
export function noise(g, n, base, amt, r) {
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = 1 + (r() - 0.5) * amt;
    g.fillStyle = `rgb(${base.map((c) => Math.min(255, c * k) | 0).join(',')})`;
    g.fillRect(x, y, 1, 1);
  }
}

/**
 * opts: look (an id of looks.js, 'ps1' by default) and params (its params; the rest stay the defaults);
 * fog { color, near, far } (the start of the scene's light; r.light changes it); fov { landscape, portrait }
 * (vertical, in degrees); camera { fov, near, far } (the camera made); paints (the game's textures).
 */
export function createRender(canvas, opts = {}) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  canvas.style.imageRendering = 'pixelated';

  const fog = { color: '#0b0d14', near: 9, far: 26, ...(opts.fog ?? {}) };
  const fov = { landscape: 62, portrait: 84, ...(opts.fov ?? {}) };
  const FOG = new THREE.Color(fog.color);
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  const cam = { fov: 55, near: 0.03, far: 90, ...(opts.camera ?? {}) };
  const camera = new THREE.PerspectiveCamera(cam.fov, 16 / 9, cam.near, cam.far);

  let look = lookOf(opts.look ?? 'ps1');
  if (!look) throw new Error(`no look ${opts.look}`);
  let p = paramsOf(look, opts.params);
  let U = look.uniforms(THREE, p);
  U.uFogColor.value.copy(FOG);
  U.uFogNear.value = fog.near;
  U.uFogFar.value = fog.far;

  const paints = { ...BASE_PAINTS, ...(opts.paints ?? {}) };
  // (the look's full-picture pass is made below, once `size` exists)
  const textures = {};
  function texture(kind) {
    if (textures[kind]) return textures[kind];
    const [n, paint] = paints[kind];
    const c = document.createElement('canvas'); c.width = c.height = n;
    paint(c.getContext('2d'), n, mulberry32(kind.length * 7919 + n));
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    return (textures[kind] = t);
  }

  /**
   * Every material made, with what it was made of, so a change of look refills them all. Held weakly: a
   * material the game dropped (a scene made again) goes with the garbage, never kept here.
   */
  const made = new Set();
  const live = () => {
    const out = [];
    for (const ref of made) { const m = ref.deref(); if (m) out.push(m); else made.delete(ref); }
    return out;
  };
  function make(color, o, shader) {
    const map = typeof o.map === 'string' ? texture(o.map) : o.map;
    const m = new THREE.ShaderMaterial({ side: o.side ?? THREE.FrontSide, transparent: Boolean(o.transparent), depthWrite: o.depthWrite ?? true });
    m.userData.engineSpec = { color, map, opts: o, shader };
    look.fill(m, m.userData.engineSpec, U, p, THREE);
    m.opacity = o.opacity ?? 1;
    m.onBeforeRender = () => { m.uniforms.uAlpha.value = m.opacity; };
    made.add(new WeakRef(m));
    return m;
  }

  /** The look's material. opts: map (name), repeat, vertexColors, emissive (0..1), fogged, opacity, transparent, side, depthWrite. */
  const mat = (color, o = {}) => make(color, o, null);
  const glow = (color, o = {}) => mat(color, { emissive: 1, fogged: 0.6, ...o });
  /** A material of a shader of the library (looks.js), with its params, inside the look. */
  function shaded(id, params, color, o = {}) {
    const def = shaderOf(id);
    if (!def) throw new Error(`no shader ${id}`);
    return make(color, o, { def, params: paramsOf(def, params) });
  }

  /**
   * What the game set through light, point and spot, kept so that a change of look (setLook) puts all of it
   * back, also what the look in between did not have (the 5th to 8th point lights, the flashlight).
   */
  const set = { light: {}, points: new Map(), spot: {} };
  function light(o) {
    Object.assign(set.light, o);
    if (!U.uAmbient) return;
    if (o.ambient !== undefined) U.uAmbient.value.set(o.ambient);
    if (o.key !== undefined) U.uLightColor.value.set(o.key);
    if (o.keyDir) U.uLightDir.value.set(...o.keyDir);
    if (o.fog !== undefined) { U.uFogColor.value.set(o.fog); scene.background.set(o.fog); }
    if (o.fogNear !== undefined) U.uFogNear.value = o.fogNear;
    if (o.fogFar !== undefined) U.uFogFar.value = o.fogFar;
  }
  function point(i, { pos, color, range }) {
    set.points.set(i, { ...(set.points.get(i) ?? {}), ...(pos ? { pos: [...pos] } : {}), ...(color !== undefined ? { color } : {}), ...(range !== undefined ? { range } : {}) });
    if (!U.uPointPos || i >= U.uPointPos.value.length) return;
    if (pos) U.uPointPos.value[i].set(...pos);
    if (color !== undefined) U.uPointColor.value[i].set(color);
    if (range !== undefined) U.uPointRange.value[i] = range;
  }
  /** The flashlight: a cone from pos along dir (unit). cos is the cosine of the half angle (a look without it ignores it). */
  function spot(o) {
    Object.assign(set.spot, o);
    const { on, pos, dir, color, range, cos } = o;
    if (!U.uSpotOn) return;
    if (on !== undefined) U.uSpotOn.value = on ? 1 : 0;
    if (pos) U.uSpotPos.value.set(...pos);
    if (dir) U.uSpotDir.value.set(...dir).normalize();
    if (color !== undefined) U.uSpotColor.value.set(color);
    if (range !== undefined) U.uSpotRange.value = range;
    if (cos !== undefined) U.uSpotCos.value = cos;
  }
  /** The game's clock, in seconds, for the shaders that move (water, static): the film mode sets its own. */
  const time = (t) => { if (U.uTime) U.uTime.value = t; };

  /**
   * The look's pass over the whole picture (look.post), when it has one: the scene is drawn into a target of
   * the internal size, then a full-screen quad draws it through the pass. Made again on each change of look.
   */
  let post = null;
  const glslT = { number: 'float', bool: 'float', color: 'vec3', enum: 'float' };
  function makePost() {
    const src = typeof look.post === 'function' ? look.post(p) : null;
    // The same pass with other params (a slider in the editor): only its uniforms change, nothing recompiles.
    if (post && src && post.src === src && post.look === look) {
      for (const [k, d] of Object.entries(look.params ?? {})) {
        const u = post.mat.uniforms[`p_${k}`];
        if (!u) continue;
        const v = p[k];
        if (d.type === 'color') u.value.set(v); else u.value = d.type === 'bool' ? (v ? 1 : 0) : d.type === 'enum' ? d.options.indexOf(v) : v;
      }
      return;
    }
    if (post) { post.rt.dispose(); post.mat.dispose(); post.quad.geometry.dispose(); post = null; }
    if (!src) return;
    const uniforms = { tFrame: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 } };
    const decl = [];
    for (const [k, d] of Object.entries(look.params ?? {})) {
      if (!glslT[d.type]) continue;
      const v = p[k];
      uniforms[`p_${k}`] = { value: d.type === 'color' ? new THREE.Color(v) : d.type === 'bool' ? (v ? 1 : 0) : d.type === 'enum' ? d.options.indexOf(v) : v };
      decl.push(`uniform ${glslT[d.type]} p_${k};`);
    }
    const mat = new THREE.ShaderMaterial({
      uniforms, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tFrame; uniform vec2 uRes; uniform float uTime; ${decl.join(' ')}
varying vec2 vUv;
${src}
void main() { gl_FragColor = vec4(clamp(post(vUv), 0.0, 1.0), 1.0); }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const pscene = new THREE.Scene();
    pscene.add(quad);
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    post = { rt, mat, quad, scene: pscene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), src, look };
    if (size.w) { rt.setSize(size.w, size.h); mat.uniforms.uRes.value.set(size.w, size.h); }
  }

  const size = { w: 0, h: 0, cssW: 0, cssH: 0 };
  /** Internal size from the look (enlarged by CSS without smoothing); the vertical field of view by shape. */
  function resize(cssW, cssH) {
    const { w, h } = look.size(cssW, cssH, p);
    size.w = w; size.h = h; size.cssW = cssW; size.cssH = cssH;
    renderer.setSize(w, h, false);
    if (post) { post.rt.setSize(w, h); post.mat.uniforms.uRes.value.set(w, h); }
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    U.uRes?.value.set(w, h);
    camera.aspect = w / h;
    camera.baseFov = camera.aspect < 1 ? fov.portrait : fov.landscape; camera.fov = camera.baseFov;
    camera.updateProjectionMatrix();
  }

  /**
   * Another look, or other params of this one: the shared uniforms are made again (the light, fog and points
   * set so far carried over) and every material is refilled, so every mesh follows at once.
   */
  function setLook(id, params) {
    const next = lookOf(id ?? look.id);
    if (!next) throw new Error(`no look ${id}`);
    // The same look: the params given change, the others stay as they are. Another look: its defaults and the params given.
    const np = paramsOf(next, next === look ? { ...p, ...(params ?? {}) } : params ?? {});
    const old = U;
    const nu = next.uniforms(THREE, np);
    for (const [k, u] of Object.entries(nu)) {
      const was = old[k];
      // The resolution is the new look's (resize sets it from its size).
      if (!was || k === 'uRes') continue;
      if (Array.isArray(u.value) && Array.isArray(was.value)) u.value.forEach((v, i) => { if (i < was.value.length) (v?.copy ? v.copy(was.value[i]) : (u.value[i] = was.value[i])); });
      else if (u.value?.copy && was.value?.copy) u.value.copy(was.value);
      else if (typeof u.value === typeof was.value) u.value = was.value;
    }
    look = next; p = np; U = nu;
    // Everything the game set goes on again, as it was (the copy above only reaches what both looks have).
    if (Object.keys(set.light).length) light({ ...set.light });
    for (const [i, v] of set.points) point(i, { ...v });
    if (Object.keys(set.spot).length) spot({ ...set.spot });
    for (const m of live()) look.fill(m, m.userData.engineSpec, U, p, THREE);
    makePost();
    if (size.cssW) resize(size.cssW, size.cssH);
    api.look = look.id; api.lookParams = { ...p };
    api.POINT_LIGHTS = U.uPointPos?.value.length ?? 0;
    api.vertexColors = Boolean(p.vertexColors);
  }

  makePost();
  const draw = () => {
    if (!post) { renderer.render(scene, camera); return; }
    // The scene into the target, then the pass over it to the screen (an orthographic quad: the editor's
    // free camera leaves such passes alone).
    renderer.setRenderTarget(post.rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    post.mat.uniforms.tFrame.value = post.rt.texture;
    post.mat.uniforms.uTime.value = U.uTime?.value ?? 0;
    renderer.render(post.scene, post.cam);
  };
  /** The picture drawn now, as a PNG data URL (for the editor's side-by-side comparison of looks). */
  const snapshot = () => { draw(); return canvas.toDataURL('image/png'); };

  const api = {
    THREE, renderer, scene, camera, canvas, size, mat, glow, shaded, texture, light, point, spot, time, resize, draw, snapshot, setLook,
    look: look.id, lookParams: { ...p },
    /** How many point lights the look has (point(i) beyond it does nothing). */
    POINT_LIGHTS: U.uPointPos?.value.length ?? 0,
    /** Whether the look multiplies by the geometry's colour attribute (a game paints with vertex colours then). */
    vertexColors: Boolean(p.vertexColors),
  };
  current = api;
  return api;
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
