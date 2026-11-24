// A person: an adult from the Blender model (tools/models/person.py -> assets/models/person.glb), a little stylized
// (a bigger head and hands), with a skeleton and the animations of the game: standing, walking, running, crouching, the
// hands (use, handle), the rope, hiding, being knocked down and getting up, limping, sleeping, eating, the hand radio,
// aiming and throwing. One model serves every person; a seed (and a role that fixes the main characters) picks the body,
// the face, the hair, the clothes and the colours, and the height and build.
//
//   const p = buildPerson(r, { seed, role, pack });   // role: 'jonas' | 'neide' | 'tania' | anything else (by seed)
//   p.root            the person, standing at the origin, facing -Z (set root.rotation.y = yaw)
//   p.update(dt, { speed, crouch, run, action })   walks the pose along (speed in m/s; the poses blend, the step follows speed)
//   p.setPose({ phase, walk, run, crouch, action, at, speed, t })   the same as a pure function (for the film mode): phase in
//                     radians, t the clock (idle sway, blinking), at the seconds since the action began
//   p.height, p.look, p.tris (visible triangles of the level of detail in use), p.lod ('high' close, 'low' far away), p.forceLod
//   update and setPose also take look (the head turns, radians from the body's front, -1.2..1.2) and face ('tenso', 'alivio', 'susto',
//   'falando': an expression added on the face; update eases it in and out), p.ready (the model has arrived)
//
// `action` (the game asks for it; null or absent is plain locomotion): 'usar' (hand out), 'manipular' (work with both
// hands), 'radio' (the hand radio), 'mirar', 'arremessar' (the throw), 'comer' (seated), 'dormir' and 'derrubado' (the clip
// lies the body down itself: the caller must not tilt the root), 'levantar', 'corda' (speed > 0 climbs, < 0 goes down,
// 0 hangs), 'esconder' (curls up, then holds), 'sair' (comes out of it), 'mancar' (limps; the step follows phase).
//
// The model comes from a file: until it arrives (or if it never does) a plain figure of a few solids stands in, with the
// same contract. The materials are the render's own (r.mat), so every look draws them, skinned and with its ink outline.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { loadModel, modelIfReady, FILM, rampTexture, cloneScene, filterClip, visibleTris } from './glb.js';
import * as THREE from 'three';
import { Layers, clamp01, ease } from './anim.js';
import { buildJonas } from './jonas.js';

const FILE = 'person.glb';
const FILE_LOD = 'person_lod.glb';
const loading = loadModel(FILE);
const loadingLod = loadModel(FILE_LOD);
/** Resolves when the model has arrived (or failed). */
export const personReady = loading;
// The film mode waits for the model, so that its frames are the game's.
if (FILM) { await loading; await loadingLod; }

const SKINS = ['#f0d2b4', '#e3b98f', '#cf9c70', '#b88a62', '#9a6a46', '#7a4e32', '#5c3a26'];
const HAIRS = ['#16110d', '#2a1c12', '#4a3322', '#6e4e2e', '#8a6a3a', '#a89060', '#101014'];
const TOPS = ['#6a6240', '#56634a', '#7a5240', '#4a6068', '#5e5668', '#7e6a44', '#5a5a5e', '#6e4a3e', '#3f5a52'];
const UNDER = ['#c9c0a8', '#b8b8b0', '#9aa6a0', '#d0b898', '#a8a0b0', '#cfc8b8'];
const PANTS = ['#3a3d44', '#4a4438', '#2f3a48', '#4a4a4e', '#3c3a32', '#524838'];
const SHOES = ['#2a2420', '#3a3028', '#26282c', '#4a3a2c'];
const EYES = ['#3a2a1a', '#4a3820', '#2a3a4a', '#3a4a2a', '#222222'];

const PRESETS = {
  jonas: { age: 44, h: 1.78, skin: '#b88a62', hair: '#241a14', gray: 0.22, style: 'curto', beard: 'rala', glasses: false, top: 'jaqueta', topC: '#5d6140', under: '#9a917a', pants: '#54503f', shoes: '#33281f', build: 1.04, fem: false, lamp: true, eye: '#3a2a1a' },
  neide: { age: 63, h: 1.58, skin: '#c9a07c', hair: '#c9c9c6', gray: 1, style: 'coque', beard: 'nenhuma', glasses: true, top: 'jaqueta', topC: '#5c6e5f', under: '#a39b8c', pants: '#4b5560', shoes: '#3a3028', build: 0.98, fem: true, eye: '#4a3820' },
  tania: { age: 31, h: 1.68, skin: '#8f6040', hair: '#1a1210', gray: 0, style: 'rabo', beard: 'nenhuma', glasses: false, top: 'jaqueta', topC: '#4a6578', under: '#b5a98e', pants: '#3b4048', shoes: '#2a2a2e', build: 0.96, fem: true, eye: '#2a1a10' },
};

/** What a person looks like, from a seed (and a role that fixes the main characters). */
export function personLook(seed = 1, role = 'pessoa') {
  const r = mulberry32((Math.imul(seed >>> 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1);
  const fem = r() < 0.5, age = 18 + Math.floor(r() * 53);
  const gray = Math.max(0, Math.min(1, (age - 38) / 30 + (r() - 0.5) * 0.3));
  const hair = gray > 0.85 ? '#c6c6c4' : HAIRS[Math.floor(r() * HAIRS.length)];
  const styles = fem ? ['longo', 'rabo', 'coque', 'curto', 'curto'] : ['curto', 'curto', 'raspado', 'careca', 'curto', 'raspado'];
  const look = {
    seed, role, age, fem, gray, hair,
    h: (fem ? 1.58 : 1.69) + r() * 0.15, skin: SKINS[Math.floor(r() * SKINS.length)],
    style: styles[Math.floor(r() * styles.length)],
    beard: fem ? 'nenhuma' : ['nenhuma', 'rala', 'rala', 'cheia', 'cavanhaque'][Math.floor(r() * 5)],
    glasses: r() < (age > 45 ? 0.4 : 0.15), top: r() < 0.55 ? 'jaqueta' : 'camisa',
    topC: TOPS[Math.floor(r() * TOPS.length)], under: UNDER[Math.floor(r() * UNDER.length)],
    pants: PANTS[Math.floor(r() * PANTS.length)], shoes: SHOES[Math.floor(r() * SHOES.length)],
    build: 0.9 + r() * 0.22, eye: EYES[Math.floor(r() * EYES.length)], lamp: false,
  };
  if (look.style === 'careca' && age < 30) look.style = 'raspado';
  const p = PRESETS[role];
  return p ? { ...look, ...p, seed, role } : look;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (c) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const mixh = (a, b, k) => rgb(mix(hex(a), hex(b), k));

// ---- which clips are in which layer ---------------------------------------------------------------------------------
const UPPER = /^(spine|neck|head|brow|lid|mouth|clavicle|upper_arm|forearm|hand|index|middle|ring|pinky|thumb)/;
const isUpper = (n) => UPPER.test(n);
const LOCO = ['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk'];
const OVERLAY = ['usar', 'manipular', 'radio']; // the upper body only; the legs go on with the walking
const DUR = {};
const ONCE = new Set(['arremessar', 'derrubado', 'levantar', 'esconder_entrar', 'esconder_sair']);

/** The clips of a loaded model, split into layers (done once per file). */
function clipsOf(gltf) {
  if (gltf.userData.layers) return gltf.userData.layers;
  const by = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const out = { lo: {}, up: {}, ov: {}, full: {}, blink: by.blink };
  for (const n of LOCO) if (by[n]) { out.lo[n] = filterClip(by[n], `${n}:lo`, (b) => !isUpper(b)); out.up[n] = filterClip(by[n], `${n}:up`, isUpper); DUR[n] = by[n].duration; }
  for (const n of OVERLAY) if (by[n]) { out.ov[n] = filterClip(by[n], `ov:${n}`, isUpper); DUR[n] = by[n].duration; }
  for (const [n, c] of Object.entries(by)) if (!LOCO.includes(n) && !OVERLAY.includes(n) && n !== 'blink') { out.full[n] = c; DUR[n] = c.duration; }
  if (by.blink) out.blink = filterClip(by.blink, 'blink', (b) => b.startsWith('lid_'));
  // the look-at and the expressions are additive: made against their own neutral frame, they add to whatever the body does
  out.add = {};
  const additive = (name, refTime) => {
    if (!by[name]) return;
    const c = by[name].clone();
    THREE.AnimationUtils.makeClipAdditive(c, Math.round(refTime * 15), c, 15);
    out.add[name] = c;
    DUR[name] = c.duration;
  };
  additive('look_yaw', 0.5);
  for (const n of Object.keys(by)) if (n.startsWith('expr_')) additive(n, 0);
  gltf.userData.layers = out;
  return out;
}

// ---- the simple figure that stands in --------------------------------------------------------------------------------
function standIn(r, look) {
  const T = r.THREE, g = new T.Group();
  const cloth = r.mat(look.topC), skin = r.mat(look.skin), pants = r.mat(look.pants);
  const U = look.h / 1.75;
  const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y * U, z); o.userData.noCount = true; g.add(o); return o; };
  add(new T.CapsuleGeometry(0.17 * U, 0.34 * U, 3, 8), cloth, 0, 1.2, 0);
  add(new T.SphereGeometry(0.115 * U, 10, 8), skin, 0, 1.64, 0);
  for (const s of [-1, 1]) {
    add(new T.CapsuleGeometry(0.07 * U, 0.7 * U, 3, 6), pants, s * 0.09, 0.45, 0);
    add(new T.CapsuleGeometry(0.05 * U, 0.5 * U, 3, 6), cloth, s * 0.26, 1.15, 0).rotation.z = s * 0.12;
  }
  return g;
}

function shadowOf(r) {
  const T = r.THREE, g = new T.Group();
  for (const [rad, op] of [[0.46, 0.14], [0.34, 0.16], [0.22, 0.18]]) {
    const m = new T.Mesh(new T.CircleGeometry(rad, 18), r.mat('#000000', { opacity: op, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.014; m.userData.noCount = true; g.add(m);
  }
  return g;
}

/** A blink as a pure function of the clock and the person: 0 open .. 1 closed. */
function blinkAt(t, seed) {
  const period = 3.1 + (seed % 7) * 0.17, k = Math.floor(t / period + (seed % 5) * 0.2);
  const h = mulberry32((k * 2654435761 + seed * 40503) >>> 0)();
  const start = (k - (seed % 5) * 0.2) * period + (0.25 + 0.6 * h) * period, d = 0.17;
  const x = (t - start) / d;
  return x > 0 && x < 1 ? Math.sin(x * Math.PI) : 0;
}

const STYLE_NODE = { curto: 'hair_curto', longo: 'hair_longo', rabo: 'hair_rabo', coque: 'hair_coque', raspado: 'hair_raspado' };
const BEARD_NODE = { rala: 'beard_rala', cheia: 'beard_cheia', cavanhaque: 'beard_cavanhaque' };

export function buildPerson(r, { seed = 1, role = 'pessoa', pack = false } = {}) {
  const T = r.THREE, look = personLook(seed, role);
  // Jonas is the pilot of the new people: the CC0 body with a painted texture (jonas.js); the others stay as they are for now
  if (role === 'jonas' && !new URLSearchParams(globalThis.location?.search ?? '').has('jonasantigo')) return buildJonas(r, look);
  const U = look.h / 1.69;
  const root = new T.Group();
  const api = {
    root, height: look.h, look, ready: false,
    get tris() { return visibleTris(root); },
  };
  const stand = standIn(r, look);
  root.add(stand);
  root.add(shadowOf(r));

  let layers = null, inst = null, rigs = { high: null, low: null }, which = null, state = { phase: 0, walk: 0, run: 0, crouch: 0, action: null, at: 0, speed: 0, t: 0 };
  let lastCall = null;

  function attach(gltf, kind) {
    const clips = clipsOf(gltf);
    const inst = cloneScene(gltf.scene);
    const fem = look.fem, sx = fem ? 'f' : 'm';
    const sk = look.skin, hairBase = look.gray > 0.05 && look.gray < 0.9 ? rgb(mix(hex(look.hair), [190, 190, 188], look.gray * 0.5)) : look.hair;
    const jacket = look.top === 'jaqueta';
    const topColor = jacket ? look.topC : look.under;
    const colors = {
      skin: sk, lip: mixh(sk, '#a8444a', 0.45), mouth: '#2e1518', hair: hairBase, brow: mixh(hairBase, '#000000', 0.3),
      beard: look.beard === 'cheia' ? hairBase : mixh(sk, hairBase, 0.26), eye: '#f3efe6', iris: look.eye,
      top: topColor, under: look.under, pants: look.pants, belt: '#2a221a', shoe: look.shoes, sole: '#1c1c1e', metal: '#a8a8a2',
      strap: '#2c2c30', pack: '#5c5640', frame: '#1c1c20', apron: '#6e6144', scarf: '#7a4632', wrinkle: mixh(sk, '#2a1a14', 0.4),
    };
    const ramp = rampTexture(r);
    const mats = new Map();
    const matFor = (name) => {
      if (mats.has(name)) return mats.get(name);
      const m = name === 'tinta' ? r.glow('#0d1020', { fogged: 0.5 }) : name === 'lamp' ? r.mat('#fff2c8', { map: ramp, emissive: 1, fogged: 0.6 }) : r.mat(colors[name] ?? '#cccccc', { map: ramp });
      mats.set(name, m);
      return m;
    };
    const named = look.role === 'jonas' || look.role === 'neide' || look.role === 'tania';
    const want = new Set([`head_${sx}`, `neck_${sx}`, 'eyes', 'lid_R', 'lid_L', 'brow_R', 'brow_L', 'mouth', `skin_${sx}_R`, `skin_${sx}_L`, 'shoe_R', 'shoe_L']);
    if (look.role === 'jonas') ['ojacket_m', 'tee_m', 'pants_m', 'cargo_m', 'toolbelt'].forEach((n) => want.add(n));
    else if (look.role === 'neide') ['cardigan_f', 'tee_f', 'apron_f', 'pants_w_f', 'cord'].forEach((n) => want.add(n));
    else if (look.role === 'tania') ['jacket_f', 'hood_f', 'scarf', 'pants_f'].forEach((n) => want.add(n));
    else { want.add(`pants_${sx}`); want.add(`${jacket ? 'jacket' : 'shirt'}_${sx}`); }
    if (look.role === 'tania') pack = true;
    if (look.age >= 40) want.add('wrinkles');
    if (STYLE_NODE[look.style]) want.add(STYLE_NODE[look.style]);
    if (BEARD_NODE[look.beard]) want.add(BEARD_NODE[look.beard]);
    if (look.glasses) want.add('glasses');
    if (look.lamp) want.add('lamp_head');
    if (pack) want.add(look.role === 'tania' ? 'pack_small' : 'pack');
    const known = new Set(['head_m', 'head_f', 'neck_m', 'neck_f', 'eyes', 'lid_R', 'lid_L', 'brow_R', 'brow_L', 'mouth', 'skin_m_R', 'skin_m_L', 'skin_f_R', 'skin_f_L', 'jacket_m', 'jacket_f', 'shirt_m', 'shirt_f',
      'pants_m', 'pants_f', 'pants_w_f', 'shoe_R', 'shoe_L', 'hair_curto', 'hair_longo', 'hair_rabo', 'hair_coque', 'hair_raspado', 'beard_rala', 'beard_cheia', 'beard_cavanhaque', 'glasses', 'lamp_head', 'pack', 'pack_small',
      'ojacket_m', 'tee_m', 'tee_f', 'cargo_m', 'toolbelt', 'cardigan_f', 'apron_f', 'hood_f', 'scarf', 'cord', 'wrinkles']);
    const bones = {};
    inst.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.name.startsWith('tinta_')) { const base = o.name.slice(6); if (known.has(base)) o.visible = want.has(base); }
      if (known.has(o.name) && !o.isBone && !o.isMesh && !o.isGroup) return;
      if (known.has(o.name)) o.visible = want.has(o.name);
      if (o.isMesh) {
        o.material = matFor(o.material?.name ?? 'skin');
        o.frustumCulled = false; // skinned bounds are the rest pose's: a crouching or rolling body would pop out
      }
    });
    // the height and the build: a uniform scale by height, a little wider or narrower by build
    const w = 0.96 + (look.build - 1) * 0.55;
    inst.scale.set(U * w, U, U * w);
    const layers = new Layers(inst);
    for (const [n, c] of Object.entries(clips.lo)) layers.add(`lo:${n}`, c);
    for (const [n, c] of Object.entries(clips.up)) layers.add(`up:${n}`, c);
    for (const [n, c] of Object.entries(clips.ov)) layers.add(`ov:${n}`, c);
    for (const [n, c] of Object.entries(clips.full)) layers.add(`full:${n}`, c);
    if (clips.blink) layers.add('blink', clips.blink);
    for (const [n, c] of Object.entries(clips.add)) layers.add(`add:${n}`, c, true);
    rigs[kind] = { inst, layers };
    inst.visible = false;
    root.add(inst);
    if (!api.ready) { root.remove(stand); api.ready = true; }
    choose(true);
    if (lastCall) compose(lastCall);
  }

  // Close, the full model; far away the light one, with the same skeleton.
  let lodTick = 0;
  function choose(force) {
    let want = rigs.high ? 'high' : 'low';
    if (rigs.high && rigs.low && !FILM && !(api.forceLod)) {
      const cam = r.camera, p = root.matrixWorld.elements;
      const d = Math.hypot(cam.position.x - p[12], cam.position.y - p[13], cam.position.z - p[14]);
      want = d > (which === 'low' ? 13 : 16) ? 'low' : 'high';
    }
    if (api.forceLod) want = api.forceLod;
    if (!rigs[want]) want = rigs.high ? 'high' : 'low';
    if (want === which && !force) return;
    if (which && rigs[which]) rigs[which].inst.visible = false;
    which = want;
    layers = rigs[which].layers; inst = rigs[which].inst; inst.visible = true;
    api.lod = which;
    if (lastCall) compose(lastCall);
  }

  /** Which clip an action means, and where in it we are: { layer: 'ov' | 'full', clip, time } or null. */
  function resolve(action, at, phase, speed, t) {
    const dur = (n) => DUR[n] ?? 1;
    const loop = (n, tt) => ({ layer: OVERLAY.includes(n) ? 'ov' : 'full', clip: n, time: (((tt % dur(n)) + dur(n)) % dur(n)) });
    const once = (n, tt) => ({ layer: 'full', clip: n, time: Math.max(0, Math.min(dur(n) - 0.002, tt)) });
    const turn = (n) => ({ layer: 'full', clip: n, time: (((phase / (2 * Math.PI)) % 1) + 1) % 1 * dur(n) });
    switch (action) {
      case 'usar': case 'manipular': case 'radio': return loop(action, t);
      case 'mirar': case 'comer': case 'dormir': case 'caido': case 'repouso': return loop(action, t);
      case 'arremessar': case 'derrubado': case 'levantar': return once(action, at);
      case 'esconder': return at < dur('esconder_entrar') ? once('esconder_entrar', at) : loop('esconder_parado', at - dur('esconder_entrar'));
      case 'sair': return once('esconder_sair', at);
      case 'mancar': return turn('mancar');
      case 'corda': return speed > 0.05 ? turn('corda_subir') : speed < -0.05 ? turn('corda_descer') : loop('corda_parado', t);
      default: return null;
    }
  }

  /** The pose, a pure function of its arguments. fa / oa: how much of a full or an overlay action (fades); default all. */
  function compose(s) {
    lastCall = s;
    if (!layers) return;
    if (!(++lodTick % 20)) { lodTick = 0; const w = which; choose(false); if (w !== which) return; }
    const { phase = 0, walk = 0, run = 0, crouch = 0, action = null, at = 0, speed = 0, t = 0 } = s;
    const act = resolve(action, at, phase, speed, t);
    const isFull = act && act.layer === 'full', isOv = act && act.layer === 'ov';
    const fa = isFull ? (s.fa ?? 1) : 0, oa = isOv ? (s.oa ?? 1) : 0;
    const amt = clamp01(walk), rf = clamp01(run), cr = clamp01(crouch);
    const u = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
    const clock = (n) => ((t % DUR[n]) + DUR[n]) % DUR[n];
    const wl = {
      idle: (1 - cr) * (1 - amt), walk: (1 - cr) * amt * (1 - rf), run: (1 - cr) * amt * rf,
      crouch_idle: cr * (1 - amt), crouch_walk: cr * amt,
    };
    const tl = { idle: clock('idle'), walk: u * DUR.walk, run: u * DUR.run, crouch_idle: clock('crouch_idle'), crouch_walk: u * DUR.crouch_walk };
    const W = {};
    for (const n of LOCO) {
      if (wl[n] <= 0) continue;
      W[`lo:${n}`] = [wl[n] * (1 - fa), tl[n]];
      W[`up:${n}`] = [wl[n] * (1 - fa) * (1 - oa), tl[n]];
    }
    if (isOv) W[`ov:${act.clip}`] = [oa * (1 - fa), act.time];
    if (isFull) W[`full:${act.clip}`] = [fa, act.time];
    // a blink: weigh the closed-eye pose in against whatever the lids were doing
    const b = Math.min(0.97, blinkAt(t, look.seed >>> 0));
    if (b > 0.01 && layers.has('blink')) W.blink = [b / (1 - b), 0];
    // the look-at and an expression (added on top of the body, never replacing it)
    if (s.look !== undefined && s.look !== null && layers.has('add:look_yaw')) W['add:look_yaw'] = [1, (Math.max(-1.2, Math.min(1.2, s.look)) + 1.2) / 2.4 * DUR.look_yaw];
    if (s.face && layers.has(`add:expr_${s.face}`)) W[`add:expr_${s.face}`] = [clamp01(s.faceW ?? 1), DUR[`expr_${s.face}`] * 0.999];
    layers.apply(W);
  }

  // ---- the calls ----------------------------------------------------------------------------------------------------
  let phase = 0, wk = 0, rn = 0, cr = 0, clock = 0, act = null, actAt = 0, fa = 0, oa = 0, fadeName = null;
  const lerp = (a, b, k) => a + (b - a) * Math.min(1, k);
  // A caller that tilts the whole body itself to lay it down (root.rotation.x of about 90 degrees: a knocked-down person, one
  // lying hurt or asleep in a bed) gets the matching pose of the body's own axes ('caido', or 'repouso' for exactly 90):
  // the rotation is the caller's, so the pose does not lay the body down a second time. Noticed when the rotation is set.
  let lastLoco = null, tilted = null, touched = false, nowT = 0;
  const prevChange = root.rotation._onChangeCallback;
  root.rotation._onChange(() => {
    prevChange?.();
    const x = root.rotation.x, lying = x > 1.2 ? (Math.abs(x - Math.PI / 2) < 0.002 ? 'repouso' : 'caido') : null;
    if (lying) { if (touched || lying !== tilted) { compose({ action: lying, t: nowT }); touched = false; } }
    else if (tilted && lastLoco) compose(lastLoco);
    tilted = lying;
  });
  api.setPose = (a = {}) => {
    state = { ...state, ...a };
    if (a.t !== undefined) nowT = a.t;
    lastLoco = { ...a }; touched = true;
    compose({ ...a });
  };
  let faceName = null, faceW = 0;
  api.update = (dt, { speed = 0, crouch = false, run = false, action = null, look = null, face = null } = {}) => {
    faceW = lerp(faceW, face ? 1 : 0, dt * 8); if (face) faceName = face;
    clock += dt; nowT = clock; touched = true;
    if (action !== act) { act = action; if (action) { actAt = 0; fadeName = action; } }
    actAt += dt;
    const sp = Math.abs(speed), moving = sp > 0.08;
    const tw = moving && !run ? 1 : 0, tr = moving && run ? 1 : 0, tc = crouch ? 1 : 0;
    wk = lerp(wk, tw, dt * 9); rn = lerp(rn, tr, dt * 9); cr = lerp(cr, tc, dt * 7);
    const stride = (1.5 - 0.5 * cr) * (1 + rn * 0.6);
    if (act === 'corda') phase += (speed / 0.9) * Math.PI * 2 * dt; else phase += (sp / stride) * Math.PI * 2 * dt;
    const kind = fadeName && ['usar', 'manipular', 'radio'].includes(fadeName) ? 'ov' : 'full';
    const on = act ? 1 : 0;
    // one-shot actions snap in at once (they begin from the pose before); the rest fade in 0.15 s and out in 0.2 s
    fa = kind === 'full' ? lerp(fa, on, dt / (on ? 0.15 : 0.2)) : lerp(fa, 0, dt / 0.15);
    oa = kind === 'ov' ? lerp(oa, on, dt / (on ? 0.15 : 0.2)) : lerp(oa, 0, dt / 0.15);
    const amt = Math.min(1, wk + rn);
    const name = act ?? (fa > 0.01 || oa > 0.01 ? fadeName : null);
    lastLoco = { phase, walk: amt, run: amt > 0.001 ? rn / (wk + rn) : 0, crouch: cr, action: name, at: actAt, speed, t: clock, fa, oa, look, face: faceW > 0.02 ? faceName : null, faceW };
    compose(lastLoco);
  };
  api.setPose({});
  /** Metres one cycle of the gait carries the person ({ walk, run, crouch } as setPose takes them), the same the update steps by. */
  api.stride = (g = {}) => (1.5 - 0.5 * clamp01(g.crouch ?? 0)) * (1 + clamp01(g.run ?? 0) * 0.6);

  if (modelIfReady(FILE_LOD)) attach(modelIfReady(FILE_LOD), 'low'); else loadingLod.then((g) => { if (g) attach(g, 'low'); });
  if (modelIfReady(FILE)) attach(modelIfReady(FILE), 'high'); else loading.then((g) => { if (g) attach(g, 'high'); });
  return api;
}
