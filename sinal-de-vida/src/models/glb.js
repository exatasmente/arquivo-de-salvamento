// Loads the .glb models of assets/models/ once, shares them, and gives the pieces the people and the dog need: the
// ramp texture that carries the gradients (see tools/models/common.py: the shade of each vertex travels as a UV into
// it), a skeleton-safe clone, and the sort of clip split the animations use. The loader is the three.js one, copied
// into vendor/three/.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { clone } from '../../vendor/three/SkeletonUtils.js';

const loaded = new Map(); // url -> { promise, gltf }

/** Starts loading (once) and returns the promise. */
export function loadModel(file) {
  let e = loaded.get(file);
  if (!e) {
    const url = new URL(`../../assets/models/${file}`, import.meta.url).href;
    e = { gltf: null, failed: false };
    e.promise = new GLTFLoader().loadAsync(url).then((g) => { e.gltf = g; return g; }).catch((err) => { e.failed = true; console.info(`models: ${file} did not load, the stand-in stays`, err?.message ?? err); return null; });
    loaded.set(file, e);
  }
  return e.promise;
}

/** The model if it has arrived, else null. */
export function modelIfReady(file) { return loaded.get(file)?.gltf ?? null; }

/** Whether a model failed to load (the stand-in stays for good). */
export function modelFailed(file) { return Boolean(loaded.get(file)?.failed); }

/**
 * The film mode must wait for the models, or its frames would differ from the game's: with `?film` in the address, the
 * module that imports this waits (top-level await) for the files it names.
 */
export const FILM = /(?:^|[?&])film(?:[=&]|$)/.test(globalThis.location?.search ?? '');

// ---- the ramp texture -----------------------------------------------------------------------------------------------
export const K_MAX = 1.6; // brightest multiplier
export const T_MAX = 1.5; // warmest tint
const ramps = new WeakMap();

/**
 * A 128x16 texture: u = brightness (0..K_MAX), v = warmth (0..T_MAX); the colour is white times that shade.
 * glTF flips v (v' = 1 - v), and a DataTexture's first row is the bottom (v' = 0), so row y holds t = (1 - y/(H-1)) * T_MAX.
 */
export function rampTexture(r) {
  const key = r.renderer;
  if (ramps.has(key)) return ramps.get(key);
  const W = 128, H = 16, data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = (1 - y / (H - 1)) * T_MAX;
    for (let x = 0; x < W; x++) {
      const k = (x / (W - 1)) * K_MAX, i = (y * W + x) * 4;
      data[i] = Math.min(255, Math.round(k * 255)); data[i + 1] = Math.min(255, Math.round(k * (1 - 0.07 * t) * 255)); data[i + 2] = Math.min(255, Math.round(k * (1 - 0.13 * t) * 255)); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  ramps.set(key, tex);
  return tex;
}

/** A skeleton-safe copy of a loaded scene. */
export const cloneScene = (scene) => clone(scene);

// ---- clips ----------------------------------------------------------------------------------------------------------
/** The tracks of a clip whose node name passes `keep`. */
export function filterClip(clip, name, keep) {
  const tracks = clip.tracks.filter((t) => keep(t.name.slice(0, t.name.indexOf('.'))));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** Triangles in a root, counting only what is visible. */
export function visibleTris(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    if (o.userData.noCount) return;
    n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return Math.round(n);
}
