// The fleet dog (D6 of the design, as changed on 2026-11-17), from the Blender model (tools/models/dog.py -> assets/models/dog.glb):
// a four-legged machine of worn fleet metal (grey and a dull ochre), four legs with a knee each and a ball of rubber for a foot (no
// wheels), a hull with NO head: a low block of sensors on the foredeck with the band of state light round it (never red), shields of
// ochre over the hips, an empty cargo cradle on the back with the fleet's pictogram, and NO arm in front. Its texture is painted by
// hand in the manner of Jonas (the file's second set of UVs), and it has his outline (a shell, see below).
//
//   const d = buildDog(r, { seed });         // seed: small variations (the tint of the paint, the antennas)
//   d.root           the dog, on the floor at the origin, FACING -Z like a person (set root.rotation.y = heading)
//   d.update(dt, { speed, state, sensorColor, look, action })
//                    speed (m/s): 0 stands, up to ~1.6 walks, above that it gallops (the clip is still called `rolar`);
//                    state: 'calma' | 'desconfiada' | 'busca' | 'caca' | 'desligado' (also 'calm', 'suspicious',
//                    'search', 'chase', 'off'); sensorColor: '#rrggbb' overrides the band's colour (else it comes from the
//                    state: calm weak amber, suspicious amber, search amber blinking at 1 per second, chase strong white);
//                    look: the sensor's yaw in radians from the nose (the sensor turns, the body does not); without it
//                    the sensor sweeps slowly by state; action: 'derrubar' (the takedown, once)
//   d.setPose({ phase, speed, state, sensorColor, look, t, at, action })   the same as a pure function of time (film mode);
//                    `at` is the seconds since 'desligado' or an action began (absent: the last pose of it)
//   d.setReducedFlashes(bool)                  the band stops blinking (a steady light)
//   d.setOutline({ on, width, min, max, color })   the outline, as Jonas's (models/jonas.js): what is not given stays
//   d.tris, d.height, d.length, d.sensor (the mesh of the band), d.bandMaterial (its material), d.ready, d.outline
// The outline is a shell made here: every painted piece drawn a second time, inside out, in one flat dark brown, its vertices pushed
// out along their normals after the skin by a share of their distance to the camera (so the line stays about as wide on the screen).
// The file says how much of it each vertex takes (`_outline`: the band none, the thin pieces less). Its numbers are OUTLINE's.
// The model comes from a file; until it arrives (or if it never does) a plain figure stands in with the same contract.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { loadModel, modelIfReady, FILM, rampTexture, cloneScene, filterClip, visibleTris } from './glb.js';
import { Layers, clamp01 } from './anim.js';
import { OUTLINE } from './outline.js';
import { plantFeet } from './plant.js';

const FILE = 'dog.glb';
const loading = loadModel(FILE);
/** Resolves when the model has arrived (or failed). */
export const dogReady = loading;
if (FILM) await loading;

const STATE_COLOR = { calma: '#8a6a1c', desconfiada: '#ffb030', busca: '#ffb030', caca: '#ffffff', desligado: '#2a2a2e' };
const ALIAS = { calm: 'calma', suspicious: 'desconfiada', search: 'busca', chase: 'caca', 'caça': 'caca', off: 'desligado', preso: 'desligado' };
export const DOG_STATES = ['calma', 'desconfiada', 'busca', 'caca', 'desligado'];
const norm = (s) => ALIAS[s] ?? (STATE_COLOR[s] ? s : 'calma');

const PAINTED = 0.3;               // how much of the painted texture shows whatever the scene's light (as PAINTED of Jonas)
const DUR = {};
const BODY_CLIPS = ['parado', 'andar', 'rolar', 'virar_sensor', 'farejar', 'buscar', 'correr_caca', 'derrubar', 'desligado'];
const LEGS = ['FL', 'FR', 'BL', 'BR'];
// metres the hull goes in one cycle of each moving clip (tools/models/dog.py: a walk cycle every 0.9 m, a gallop every 0.9 / 0.35 m); they
// are measured on the clips when the file arrives, these are only for before that
const STRIDE = { andar: 0.9, buscar: 0.9, rolar: 0.9 / 0.35, correr_caca: 0.9 / 0.35 };
// its feet stay where they were put down (plant.js): the ball of a foot is down within these of the floor; two step at once
const FEET = { down: 0.006, up: 0.03, reach: 0.09, turn: 0.45, step: 0.16, lift: 0.06, pairs: 2, above: 0.05, level: true };

function clipsOf(gltf) {
  if (gltf.userData.layers) return gltf.userData.layers;
  const by = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const [n, c] of Object.entries(by)) DUR[n] = c.duration;
  gltf.userData.layers = by;
  return by;
}

function standIn(r, paint) {
  const T = r.THREE, g = new T.Group(), hull = r.mat(paint), dark = r.mat('#2a2c30');
  const hullM = new T.Mesh(new T.BoxGeometry(0.32, 0.24, 0.9), hull); hullM.position.set(0, 0.57, 0); hullM.userData.noCount = true; g.add(hullM);
  const sens = new T.Mesh(new T.BoxGeometry(0.28, 0.09, 0.17), dark); sens.position.set(0, 0.67, -0.4); sens.userData.noCount = true; g.add(sens);
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const w = new T.Mesh(new T.BoxGeometry(0.07, 0.5, 0.07), dark); w.position.set(x * 0.2, 0.25, z * 0.27 - 0.02); w.userData.noCount = true; g.add(w); }
  return g;
}

export function buildDog(r, { seed = 1 } = {}) {
  const T = r.THREE, rnd = mulberry32((seed >>> 0) * 2654435761 % 4294967296 || 1);
  const paintC = ['#585a57', '#5e5c56', '#525759'][Math.floor(rnd() * 3)];       // (the stand-in's colour)
  const tintC = ['#ffffff', '#f6f1e8', '#eef1f5'][Math.floor(rnd() * 3)];        // the painted texture times this: a warmer or a cooler unit
  const ochreT = ['#ffffff', '#f4f4f0', '#fff6e4'][Math.floor(rnd() * 3)];
  const antennaA = rnd() < 0.7, antennaB = rnd() < 0.4;
  const root = new T.Group();
  const stand = standIn(r, paintC);
  root.add(stand);
  const shadow = new T.Group();
  for (const [rad, op] of [[0.4, 0.14], [0.3, 0.16], [0.2, 0.18]]) {
    const m = new T.Mesh(new T.CircleGeometry(rad, 20), r.mat('#000000', { opacity: op, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.scale.y = 1.6; m.position.y = 0.014; m.userData.noCount = true; shadow.add(m);
  }
  root.add(shadow);

  const sensorMat = r.mat('#ffffff', { emissive: 1, fogged: 0.6 });
  let layers = null, inst = null, reduced = false;
  let lastCall = null;
  const outline = { ...OUTLINE }, outlineW = { value: new T.Vector4(outline.width, outline.min, outline.max, 1) }, hulls = [];
  const api = {
    root, height: 0.74, length: 1.16, sensor: null, bandMaterial: sensorMat, ready: false,
    get tris() { return visibleTris(root); },
    setReducedFlashes(v) { reduced = Boolean(v); if (lastCall) compose(lastCall); },
    /** The outline: { on, width (metres of line per metre of distance), min, max (metres), color }. What is not given stays. */
    setOutline(o = {}) {
      Object.assign(outline, o);
      for (const [h, of] of hulls) { h.visible = Boolean(outline.on) && of.visible; if (o.color) h.material.uniforms.uColor?.value.set(outline.color); }
    },
    outline,
    /** false lets the feet go where the clips put them (to compare; the game keeps it on). */
    plant: true,
  };

  /** The shell's material: the look's flat one, back faces only, pushed out after the skin (as models/jonas.js does). */
  function hullMaterial() {
    const hm = r.mat(outline.color, { emissive: 1, fogged: 1, side: T.BackSide });
    hm.onBeforeCompile = (sh) => {            // (again whenever the look changes: the look writes the shader anew)
      sh.uniforms.uOutline = outlineW;
      sh.vertexShader = 'uniform vec4 uOutline; attribute float outlineW; varying float vOutD;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
        `#include <skinning_vertex>
  { vec4 wp_ = modelMatrix * vec4(transformed, 1.0); vOutD = distance(wp_.xyz, cameraPosition);
    transformed += normalize(objectNormal) * (clamp(vOutD * uOutline.x, uOutline.y, uOutline.z) * outlineW * uOutline.w); }`);
      sh.fragmentShader = 'varying float vOutD;\n' + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m} if (vOutD < ${OUTLINE.near.toFixed(2)}) discard;`);
    };
    hm.customProgramCacheKey = () => 'dog-outline';
    const before = hm.onBeforeRender;
    hm.onBeforeRender = (rdr, scene, camera, ...rest) => {     // a longer lens makes the same line wider on the screen
      before?.(rdr, scene, camera, ...rest);
      outlineW.value.set(outline.width * (camera?.fov ?? 50) / 50, outline.min, outline.max, 1 / (root.scale.x || 1));
    };
    return hm;
  }

  function attach(gltf) {
    const by = clipsOf(gltf);
    inst = cloneScene(gltf.scene);
    const ramp = rampTexture(r);
    // the painted atlas of the file, by the name of each mesh (the copy below loses nothing, but the materials are made here)
    const mats = new Map(), pieces = [];
    const tints = { hull: tintC, ochre: ochreT };
    // the band's material wants the ramp (white times the shade), on the file's first set of UVs
    if (sensorMat.uniforms?.map) { sensorMat.uniforms.map.value = ramp; sensorMat.uniforms.uHasMap.value = 1; }
    inst.traverse((o) => {
      if (o.name === 'antenna_a') o.visible = antennaA;
      if (o.name === 'antenna_b') o.visible = antennaB;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const old = o.material, name = old?.name ?? 'hull', map = old?.map ?? null;
      if (name === 'sensor' || !map) { o.material = sensorMat; if (name === 'sensor') api.sensor = o; return; }
      const g = o.geometry;
      if (g.attributes.uv1 && !g.userData.atlas) { g.setAttribute('uv', g.attributes.uv1); g.userData.atlas = true; }   // the atlas is the second set
      map.colorSpace = T.NoColorSpace; map.flipY = false; map.needsUpdate = true;
      if (!mats.has(name)) mats.set(name, r.mat(tints[name] ?? '#ffffff', { map, emissive: PAINTED }));
      o.material = mats.get(name);
      if (o.isSkinnedMesh) pieces.push(o);
    });
    // the outline's shell: each painted piece once more, inside out, dark, pushed out along its normals
    const hm = hullMaterial();
    for (const o of pieces) {
      const g = o.geometry;
      if (!g.attributes.outlineW) g.setAttribute('outlineW', g.attributes._outline ?? new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
      const h = new T.SkinnedMesh(g, hm);
      h.name = `${o.name}_outline`; h.bind(o.skeleton, o.bindMatrix);
      h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale);
      h.frustumCulled = false; h.userData.noCount = true;
      let shown = true; for (let p = o; p && p !== inst; p = p.parent) if (!p.visible) shown = false;      // (an antenna this unit does not have)
      const of = { visible: shown };
      h.visible = outline.on && shown;
      o.parent.add(h); hulls.push([h, of]);
    }
    root.remove(stand);
    root.add(inst);
    layers = new Layers(inst);
    for (const n of BODY_CLIPS) if (by[n]) layers.add(n, by[n]);
    if (by.sensor_yaw) layers.add('sensor_yaw', by.sensor_yaw);
    // the gait of the moving clips, measured once; and the four feet held to the floor
    const bone = (n) => inst.getObjectByName(n);
    if (!gltf.userData.gait) gltf.userData.gait = gaitOf();
    gait = gltf.userData.gait;
    const legs = LEGS.map((n) => ({ hip: bone(`leg_${n}_up`), knee: bone(`leg_${n}_low`), foot: bone(`wheel_${n}`), toe: bone(`wheel_${n}`), bend: n[0] === 'F' ? 1 : -1 }));
    if (legs.every((l) => l.hip && l.knee && l.foot)) feet = plantFeet(T, root, legs, { ...FEET, rest: gait.rest ?? 0.046 });
    api.ready = true;
    if (lastCall) compose(lastCall);
  }

  let gait = null, feet = null;
  /** For each moving clip, the metres one cycle carries the hull (how fast a foot that is down goes back under it), and how high a foot's ball is standing. */
  function gaitOf() {
    const out = {}, balls = LEGS.map((n) => inst.getObjectByName(`wheel_${n}`));
    if (balls.some((b) => !b)) return out;
    const inv = new T.Matrix4(), p = new T.Vector3();
    const sample = (W) => { layers.apply(W); inst.updateWorldMatrix(true, true); inv.copy(root.matrixWorld).invert(); return balls.map((b) => b.getWorldPosition(p).applyMatrix4(inv).toArray()); };
    if (layers.has('parado')) out.rest = Math.min(...sample({ parado: [1, 0] }).map((q) => q[1]));
    for (const n of Object.keys(STRIDE)) {
      if (!layers.has(n)) continue;
      const N = 96, pts = [];
      for (let i = 0; i < N; i++) pts.push(sample({ [n]: [1, (i / N) * DUR[n]] }));
      let sum = 0, cnt = 0;
      for (let f = 0; f < 4; f++) {
        const ys = pts.map((q) => q[f][1]), lo = Math.min(...ys);
        for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (ys[i] < lo + 0.008 && ys[j] < lo + 0.008) { sum += pts[j][f][2] - pts[i][f][2]; cnt++; } }
      }
      if (cnt) out[n] = { stride: (sum / cnt) * N };
    }
    layers.apply({});
    return out;
  }
  const strideOf = (n) => (gait?.[n]?.stride > 0.2 ? gait[n].stride : STRIDE[n]);
  /** The clips a state walks with, and the share of the gallop at a speed (as compose mixes them). */
  const goOf = (state) => ({ calma: 'andar', desconfiada: 'andar', busca: 'buscar', caca: 'correr_caca' }[state] ?? 'andar');
  const rollShare = (state, sp) => (state === 'caca' ? 0 : clamp01((sp - 1.6) / 0.8));
  /** Metres one cycle of its gait carries it, in a state, with this share of the gallop. */
  const strideFor = (state, roll) => (1 - roll) * strideOf(goOf(state)) + roll * strideOf('rolar');
  api.stride = (state = 'calma', speed = 1) => { const st = norm(state); return strideFor(st, rollShare(st, Math.abs(speed))); };
  api.rollShare = (state, speed) => rollShare(norm(state), Math.abs(speed));
  /** How the feet have been held (see jonas.js). */
  api.feetStats = () => (feet ? feet.legs.map((l) => ({ steps: l.steps, off: l.held ? l.off / l.held : 0, offMax: l.offMax, state: l.state, w: l.w })) : null);

  /** The pose and the band's colour, a pure function of the arguments. */
  function compose(s) {
    lastCall = s._dt || s._reset ? { ...s, _dt: 0, _reset: false } : s;   // (composed again, the same call holds the feet where they are)
    const { phase = 0, speed = 0, sensorColor = null, look = null, t = 0, walk = null, roll = null, at = null, action = null } = s;
    const state = norm(s.state);
    const off = state === 'desligado';
    const sp = Math.abs(speed);
    // the sensor's colour
    let c = sensorColor ?? STATE_COLOR[state];
    if (!sensorColor && state === 'busca' && !reduced) c = (t % 1) < 0.5 ? '#ffb030' : '#3a2c0c';
    if (sensorMat.uniforms?.uColor) sensorMat.uniforms.uColor.value.set(c);
    if (!layers) return;
    const moving = walk ?? (sp > 0.05 && !off ? 1 : 0);
    const rollK = roll ?? rollShare(state, sp);
    const u = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
    const W = {};
    const loopT = (n) => ((t % DUR[n]) + DUR[n]) % DUR[n];
    const add = (n, w, time) => { if (w > 0.001 && layers.has(n)) W[n] = [(W[n]?.[0] ?? 0) + w, time]; };
    if (off) {
      add('desligado', 1, Math.min(DUR.desligado - 0.002, at ?? 1e9));
    } else if (action === 'derrubar') {
      add('derrubar', 1, Math.min(DUR.derrubar - 0.002, at ?? 1e9));
    } else {
      const still = { calma: 'parado', desconfiada: 'virar_sensor', busca: 'farejar', caca: 'virar_sensor' }[state];
      const go = { calma: 'andar', desconfiada: 'andar', busca: 'buscar', caca: 'correr_caca' }[state];
      const stillW = 1 - moving, goW = moving * (state === 'caca' ? 1 : 1 - rollK), rollW = moving * (state === 'caca' ? 0 : rollK);
      add(still, stillW, loopT(still));
      add(go, goW, u * DUR[go]);
      add('rolar', rollW, u * DUR.rolar);
    }
    // the sensor looks where it is told
    let yaw;
    if (off) yaw = Math.sin(t * 0.2) * 0.05;
    else if (look !== null && look !== undefined) yaw = Math.max(-2.4, Math.min(2.4, look));
    else if (state === 'caca') yaw = 0;
    else yaw = Math.sin(t * (state === 'calma' ? 0.55 : 1.1)) * (state === 'calma' ? 0.7 : 1.3);
    add('sensor_yaw', 1, (yaw + 2.4) / 4.8 * DUR.sensor_yaw);
    layers.apply(W);
    // the feet that are down stay where they are (`lift`: how high the caller holds the hull over the floor, as in a leap)
    if (feet && api.plant !== false) {
      if (s._reset) feet.reset();
      root.updateWorldMatrix(true, false);
      feet.apply(s._dt ?? 0, { ground: root.matrixWorld.elements[13] - (s.lift ?? 0), on: 1 });
    }
  }

  let poseT = null;
  api.setPose = (a = {}) => {
    // a film plays its frames in order: the feet go on from the last one; a jump in time (or no time) lets them go
    const go = a.t !== undefined && poseT !== null && a.t > poseT && a.t - poseT < 0.25;
    const step = go ? a.t - poseT : 0;
    poseT = a.t ?? null;
    compose({ ...a, _dt: step, _reset: !go });
  };
  let phase = 0, wk = 0, rn = 0, clock = 0, offAt = 0, prevState = null, actAt = 0, prevAction = null;
  let lastX = null, lastZ = 0, spSeen = 0;
  const lerp = (a, b, k) => a + (b - a) * Math.min(1, k);
  api.update = (dt, { speed = 0, state = 'calma', sensorColor = null, look, action = null, lift = 0 } = {}) => {
    clock += dt;
    // how far the root went since the last call, along where it faces: the gait follows the ground covered, not the speed it is told
    const rp = root.position;
    let moved = null, jumped = lastX === null;
    if (lastX !== null) {
      const dx = rp.x - lastX, dz = rp.z - lastZ, d = Math.hypot(dx, dz);
      if (d > Math.max(0.75, 10 * dt)) jumped = true;
      else { const fwd = -Math.sin(root.rotation.y) * dx - Math.cos(root.rotation.y) * dz; moved = Math.abs(fwd) >= 0.3 * d ? Math.sign(fwd) * d : d; }
    }
    lastX = rp.x; lastZ = rp.z;
    if (dt > 0 && moved !== null) spSeen = lerp(spSeen, Math.abs(moved) / dt, dt * 12);
    const st = norm(state), sp = moved === null ? Math.abs(speed) : spSeen, off = st === 'desligado', moving = sp > 0.05;
    if (st !== prevState) { offAt = 0; prevState = st; }
    offAt += dt;
    if (action !== prevAction) { actAt = 0; prevAction = action; }
    actAt += dt;
    rn = lerp(rn, !off ? rollShare(st, sp) : 0, dt * 6); wk = lerp(wk, !off && moving ? 1 : 0, dt * 8);
    phase += ((moved ?? sp * dt) / strideFor(st, rn)) * Math.PI * 2;
    compose({ phase, speed: sp, state: st, sensorColor, look: look ?? null, t: clock, walk: wk, roll: rn, at: action ? actAt : offAt, action, lift, _dt: dt, _reset: jumped });
  };
  api.setPose({});

  if (modelIfReady(FILE)) attach(modelIfReady(FILE));
  else loading.then((g) => { if (g) attach(g); });
  return api;
}
