// Shared pieces of the cutscenes: camera tracks, the screen flashes (with the safety limits),
// first-person arms with a little IK, and the overlay drawn over the 3D picture (fade, flash,
// daze, static, the memory card screen). Everything here is a pure function of time.
//
// A cutscene module exports a definition (see player.js):
//   { name, duration, cue, views: { name: [t0, t1] }, sfx: [{ t, name, opts }], build(ctx) -> inst }
//   inst.pose(t, ambient) -> frame: { eye, look, roll, fov, fade, flashes, daze, noise, card, ... }
import { mulberry32 } from '../rng.js';
import { buildHuman, buildFirstPersonArms } from '../models/human.js';
import { PLAYER_LOOK } from '../look.js';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
export const ramp = (t, a, b) => clamp((t - a) / (b - a));       // 0 before a, 1 after b
export const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ---------------------------------------------------------------------------------------------
// Camera track. keys: [{ t, eye, look, roll?, fov?, ease? }]. Between two keys the path is a
// Catmull-Rom curve (steady speed through the key) or, with `ease: 'ss'` on the first key of the
// pair, a smoothstep (it stops at both ends: use it for a camera that stays a moment).
export function track(keys) {
  const K = keys.slice().sort((a, b) => a.t - b.t);
  const cr = (p0, p1, p2, p3, u) => {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
  return (t) => {
    if (t <= K[0].t) return { ...K[0], roll: K[0].roll ?? 0 };
    const last = K[K.length - 1];
    if (t >= last.t) return { ...last, roll: last.roll ?? 0 };
    let i = 0; while (K[i + 1].t < t) i++;
    const a = K[i], b = K[i + 1], p = K[Math.max(0, i - 1)], q = K[Math.min(K.length - 1, i + 2)];
    let u = (t - a.t) / (b.t - a.t);
    const out = {};
    for (const f of ['eye', 'look']) {
      if (a.ease === 'ss') { const s = smooth(u); out[f] = [0, 1, 2].map((c) => lerp(a[f][c], b[f][c], s)); }
      else out[f] = [0, 1, 2].map((c) => cr(p[f][c], a[f][c], b[f][c], q[f][c], u));
    }
    const s = a.ease === 'ss' ? smooth(u) : u;
    out.roll = lerp(a.roll ?? 0, b.roll ?? 0, s);
    out.fov = a.fov !== undefined || b.fov !== undefined ? lerp(a.fov ?? 0, b.fov ?? 0, s) : undefined;
    return out;
  };
}

/** Head bob while walking: returns [dx, dy, roll]. */
export function bob(t, amp = 1, freq = 1.9) {
  const p = t * freq * Math.PI * 2;
  return [Math.sin(p * 0.5) * 0.018 * amp, Math.abs(Math.sin(p * 0.5)) * 0.03 * amp - 0.015 * amp, Math.sin(p * 0.5) * 0.012 * amp];
}

// ---------------------------------------------------------------------------------------------
// Screen flashes. Same limits as the game (hud.js): at most 3 per second, each one rising and
// falling over at least 0.1 s, never full white. Events: [{ t, s?, rise?, fall? }]; events closer
// than MIN_GAP are a mistake (checked by `checkFlashes`, used in the tests).
export const FLASH = { rise: 0.12, fall: 0.28, peak: 0.5, minGap: 0.4, color: '#e9e2cc', dark: '#05060a', darkPeak: 0.45 };

export function flashLevel(events, t) {
  let a = 0;
  for (const f of events) {
    const rise = Math.max(0.1, f.rise ?? FLASH.rise), fall = Math.max(0.1, f.fall ?? FLASH.fall), u = t - f.t;
    if (u < 0 || u > rise + fall) continue;
    a = Math.max(a, (u < rise ? u / rise : 1 - (u - rise) / fall) * (f.s ?? 1));
  }
  return a;
}
/** Returns the list of problems (empty when every window of one second has at most 3 flashes). */
export function checkFlashes(events) {
  const bad = [], ts = events.map((e) => e.t).sort((a, b) => a - b);
  for (let i = 0; i + 3 < ts.length; i++) if (ts[i + 3] - ts[i] < 1) bad.push(`4 flashes within 1 s at ${ts[i].toFixed(2)}`);
  for (const e of events) {
    if ((e.rise ?? FLASH.rise) < 0.1 || (e.fall ?? FLASH.fall) < 0.1) bad.push(`flash at ${e.t} too fast`);
    if ((e.s ?? 1) * FLASH.peak >= 0.95) bad.push(`flash at ${e.t} too strong`);
  }
  return bad;
}

// ---------------------------------------------------------------------------------------------
// First-person arms (models/human.js: buildFirstPersonArms hangs on a camera looking along -Z).
// The joint called "L" is on the right of the screen. `reach` puts a hand (the centre of the fist)
// at a point in camera space with a two-bone solve; `hang` and `guard` are presets.
const ARM_A = 0.29, ARM_B = 0.38;
export function armRig(THREE, arms) {
  const rest = {};
  for (const jn of ['L', 'R']) {
    const sg = jn === 'L' ? 1 : -1;
    rest[jn] = {
      d1: new THREE.Vector3(sg * 0.14, -0.70, -0.70).normalize(), d2: new THREE.Vector3(-sg * 0.22, 0.58, -0.78).normalize(),
      S: arms.joints['shoulder' + jn].position.clone(), sg,
    };
  }
  const solve = (S, tgt, pole) => {
    const d = tgt.clone().sub(S);
    let dist = d.length();
    const max = ARM_A + ARM_B - 0.004;
    if (dist > max) { d.multiplyScalar(max / dist); dist = max; }
    if (dist < 0.1) { d.setLength(0.1); dist = 0.1; }
    const dir = d.clone().divideScalar(dist);
    const along = (ARM_A * ARM_A - ARM_B * ARM_B + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(ARM_A * ARM_A - along * along, 0));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
    p.normalize();
    return { E: S.clone().addScaledVector(dir, along).addScaledVector(p, h), H: S.clone().add(d) };
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /** side: 'right' | 'left' (on the screen); p: [x, y, z] in camera space (-z is forward). */
  function reach(side, p, { pole } = {}) {
    const jn = side === 'right' ? 'L' : 'R', r = rest[jn], sh = arms.joints['shoulder' + jn], el = arms.joints['elbow' + jn];
    const sol = solve(r.S, V(...p), pole ? V(...pole) : V(r.sg * 0.5, -1, 0.25));
    sh.quaternion.setFromUnitVectors(r.d1, sol.E.clone().sub(r.S).normalize());
    const dF = sol.H.clone().sub(sol.E).normalize().applyQuaternion(sh.quaternion.clone().invert());
    el.quaternion.setFromUnitVectors(r.d2, dF);
    // setFromUnitVectors leaves the roll of the forearm to chance (the palm could face the camera):
    // turn the forearm about its own axis so the back of the (bare) hand faces up, toward the
    // camera and a little outward. Gloves are not touched.
    const b3 = arms.joints['wrist' + jn].children[0];
    if (!arms.joints['curl' + jn] || !b3) return;
    const base = el.quaternion.clone(), ax = dF; // the forearm axis, in the shoulder frame
    const want = V(r.sg * 0.3, 0.75, 0.55).normalize(), Z = V(0, 0, 1), q = new THREE.Quaternion(), n = new THREE.Vector3();
    const back = (phi) => { el.quaternion.setFromAxisAngle(ax, phi).multiply(base); return n.copy(Z).applyQuaternion(b3.quaternion).applyQuaternion(q.copy(sh.quaternion).multiply(el.quaternion)).dot(want); };
    let best = 0, bestV = -2;
    for (let i = 0; i < 72; i++) { const phi = (i / 72) * Math.PI * 2, v = back(phi); if (v > bestV) { bestV = v; best = phi; } }
    for (let st = Math.PI / 72; st > 0.002; st /= 2) for (const phi of [best - st, best + st]) { const v = back(phi); if (v > bestV) { bestV = v; best = phi; } }
    back(best);
  }
  const rig = {
    reach,
    /** Open (0) to fist (1) hand on a side ('right' | 'left' on the screen); bare hands only. */
    curl(side, k) { const f = arms.joints['curl' + (side === 'right' ? 'L' : 'R')]; if (f) f(k); },
    /** Both hands low and loose, at the bottom corners of the view. */
    hang(sway = 0) { rig.curl('right', 0.2); rig.curl('left', 0.2); reach('right', [0.22 + sway * 0.02, -0.40 + sway * 0.015, -0.34]); reach('left', [-0.22 - sway * 0.02, -0.40 - sway * 0.015, -0.34]); },
    /** Fists up in front of the chin, like the fight stance. */
    guard(k = 0) { reach('right', [0.17, -0.13 + k * 0.01, -0.50]); reach('left', [-0.17, -0.13 - k * 0.01, -0.50]); },
    /** Empty-handed, a little forward, as if feeling in the dark. */
    grope(t) { reach('right', [0.16 + Math.sin(t * 2.1) * 0.05, -0.22 + Math.sin(t * 1.7) * 0.03, -0.46]); reach('left', [-0.20 + Math.sin(t * 1.3) * 0.04, -0.34, -0.38]); },
  };
  return rig;
}

// ---------------------------------------------------------------------------------------------
// The overlay: everything that is drawn flat over the 3D picture, on a canvas twice the internal
// size of the 3D (so the small text stays readable). st: { fade, flash, dark, daze, noise, card, t, glare }.
export const OVERLAY_SCALE = 2;

export function drawOverlay(g, w, h, st) {
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = false;
  if (st.daze > 0.01) { // the view closes in a soft tunnel
    const gr = g.createRadialGradient(w / 2, h / 2, h * 0.18, w / 2, h / 2, h * 0.95);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(0.78 * st.daze).toFixed(3)})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (st.glare > 0.01) { // a lamp straight ahead: a wide soft glow, never a white screen
    const gx = w * (st.glareAt?.[0] ?? 0.5), gy = h * (st.glareAt?.[1] ?? 0.3);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, h * (0.6 + 0.5 * st.glare));
    gr.addColorStop(0, `rgba(240,232,205,${(0.62 * st.glare).toFixed(3)})`); gr.addColorStop(1, 'rgba(240,232,205,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (st.flash > 0.005) { g.globalAlpha = st.flash * FLASH.peak; g.fillStyle = FLASH.color; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.dark > 0.005) { g.globalAlpha = st.dark * FLASH.darkPeak; g.fillStyle = FLASH.dark; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.dim > 0.005) { g.globalAlpha = st.dim; g.fillStyle = '#04050c'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.noise > 0.01) drawNoise(g, w, h, st.noise, st.t);
  if (st.shop) drawShop(g, w, h, st.shop, st.t);
  if (st.card) drawCard(g, w, h, st.card, st.t);
  if (st.hud) drawHud(g, w, h, st.hud);
  if (st.label) drawLabel(g, w, h, st.label);
  if (st.fade > 0.005) { g.globalAlpha = Math.min(1, st.fade); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
}

/** Static: seeded by the frame number of the time, so the same time always gives the same picture. */
function drawNoise(g, w, h, amount, t) {
  const r = mulberry32((Math.floor(t * 24) + 1) * 7919);
  const cw = Math.ceil(w / 4), ch = Math.ceil(h / 4);
  const img = g.createImageData(cw, ch), d = img.data;
  for (let i = 0; i < cw * ch; i++) {
    const v = (r() * 255) | 0, a = Math.min(255, amount * 255 * (0.55 + 0.45 * r())) | 0;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = a;
  }
  const tmp = drawNoise.tmp ?? (drawNoise.tmp = document.createElement('canvas'));
  tmp.width = cw; tmp.height = ch; tmp.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(tmp, 0, 0, w, h);
  // rolling bars, as a tape losing its signal
  const y0 = ((t * 140) % (h + 40)) - 20;
  g.globalAlpha = Math.min(1, amount) * 0.5; g.fillStyle = '#d8dce6'; g.fillRect(0, y0, w, 6 + 8 * amount); g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------
// The memory card screen of the end of the training (the same blocks as the card of the game:
// a grid of 5 columns by 3 rows, read left to right and top to bottom; block 13 is the middle of
// the last row, with a broken icon).
const ICON = {
  campaign: (px) => { px(2, 5, 5, 6, '#d9a21b'); px(9, 5, 5, 6, '#d9a21b'); px(3, 11, 3, 2, '#e8e0c8'); px(10, 11, 3, 2, '#e8e0c8'); },
  fight: (px) => { px(2, 9, 12, 3, '#6a7388'); px(3, 4, 1, 5, '#c9a24a'); px(12, 4, 1, 5, '#c9a24a'); px(3, 5, 10, 1, '#5ee6d0'); px(3, 7, 10, 1, '#5ee6d0'); },
  record: (px) => { px(7, 2, 2, 3, '#e0a526'); px(3, 5, 10, 2, '#e0a526'); px(5, 7, 6, 3, '#e0a526'); px(4, 10, 3, 3, '#e0a526'); px(9, 10, 3, 3, '#e0a526'); },
  corrupt: (px, t) => {
    px(2, 2, 6, 5, '#4a2a3a'); px(9, 3, 5, 4, '#2a2f5a'); px(3, 9, 4, 5, '#2a2f5a'); px(10, 9, 4, 4, '#4a2a3a');
    for (let i = 0; i < 14; i++) px(1 + i, 1 + ((i * 7) % 13), 1, 2, i % 2 ? '#ff6a5c' : '#0b0d14');
    px(7, 6, 2, 5, '#0b0d14');
    void t;
  },
  empty: (px) => { px(5, 5, 6, 6, '#242836'); },
};

/** blocks: the 15 entries of card.blocks() (only `kind` is used; the number shown is the position in the grid, 01 to 15, like the game's card screen); saving: show the "SALVANDO" line. */
export function drawCard(g, w, h, card, t) {
  const blocks = card.blocks ?? defaultBlocks();
  g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(0, 0, w, h);
  const bw = Math.round(w * 0.62), bh = Math.round(h * 0.84), bx = Math.round((w - bw) / 2), by = Math.round((h - bh) / 2);
  g.fillStyle = '#0d1019'; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = '#c9a24a'; g.lineWidth = Math.max(2, Math.round(h / 90)); g.strokeRect(bx, by, bw, bh);
  const fs = Math.round(h * 0.052);
  g.textBaseline = 'top'; g.textAlign = 'left'; g.font = `bold ${fs}px "Courier New", monospace`;
  g.fillStyle = '#c9a24a'; g.fillText('CARTÃO DE MEMÓRIA', bx + bw * 0.04, by + bh * 0.04);
  const blink = Math.floor(t * 2.5) % 2 === 0;
  if (card.saving) { g.fillStyle = '#e0a526'; g.globalAlpha = blink ? 1 : 0.35; g.fillText('SALVANDO...', bx + bw * 0.04, by + bh * 0.04 + fs * 1.5); g.globalAlpha = 1; }
  const gx = bx + bw * 0.04, gy = by + bh * 0.04 + fs * 3.1, gw = bw * 0.92, gap = bw * 0.02;
  const cw = (gw - gap * 4) / 5, ch = Math.round(h * 0.17);
  blocks.forEach((b, i) => {
    const cx = gx + (i % 5) * (cw + gap), cy = gy + Math.floor(i / 5) * (ch + gap);
    g.fillStyle = '#141824'; g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = card.sel === i ? '#5ee6d0' : '#2a3044'; g.lineWidth = 2; g.strokeRect(cx, cy, cw, ch);
    const isz = Math.round(ch * 0.62), ix = cx + (cw - isz) / 2, iy = cy + ch * 0.08, s = isz / 16;
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(ix + x * s, iy + y * s, ww * s, hh * s); };
    px(0, 0, 16, 16, '#1a1d29');
    (ICON[b.kind] ?? ICON.empty)(px, t);
    g.fillStyle = b.kind === 'corrupt' ? '#ff9a8c' : '#aab0c4'; g.font = `bold ${Math.round(h * 0.044)}px "Courier New", monospace`; g.textAlign = 'center';
    g.fillText(String(i + 1).padStart(2, '0'), cx + cw / 2, cy + ch - h * 0.058); g.textAlign = 'left';
  });
}
export function defaultBlocks() {
  const out = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, kind: 'empty' }));
  out[0] = { n: 1, kind: 'campaign' };
  out[12] = { n: 13, kind: 'corrupt' };
  return out;
}

/** A seeded variation helper for the cutscenes: pure, never Math.random. */
export const rng = (seed) => mulberry32(seed >>> 0 || 1);

/**
 * The protagonist's own arms on the camera. bare: fists with a hand wrap in the colour of the skin
 * (home, orchard, cell); otherwise the gloves of the ring. Returns { arms, rig }.
 */
export function playerArms(r, { bare = true } = {}) {
  const A = PLAYER_LOOK;
  const arms = buildFirstPersonArms(r, { seed: A.seed, skin: A.skin, hair: A.hair, trunks: A.trunks, beard: A.beard, glove: bare ? 'none' : A.glove, outfit: bare ? 'civil' : undefined, height: 1.75 });
  arms.root.visible = true;
  return { arms, rig: armRig(r.THREE, arms) };
}

/** Lifts the arms' own light (the night orchard is so dim that skin turns grey): k is the share of emissive light, 0..1. */
export function liftArms(arms, k = 0.4) {
  arms.root.traverse((o) => { const u = o.isMesh && o.material?.uniforms?.uEmissive; if (u) u.value = k; });
}

/** A grown-up person for the cutscenes (buildHuman with a look; rigid joints posed by the caller). */
export function person(r, look) {
  const H = buildHuman(r, { height: 1.75, ...look });
  return H;
}

/** A walking pose for a buildHuman figure (joints): phase in radians, k = 0 (standing) to 1 (walking), arm: extra lift. */
export function poseWalk(J, phase, k = 1, arm = {}) {
  const s = Math.sin(phase), c = Math.cos(phase);
  J.hipL.rotation.x = -0.45 * s * k; J.hipR.rotation.x = 0.45 * s * k;
  J.kneeL.rotation.x = k * 0.5 * Math.max(0, c); J.kneeR.rotation.x = k * 0.5 * Math.max(0, -c);
  J.spine.rotation.x = 0.06 * k;
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const o = arm[side] ?? {};
    J['shoulder' + side].rotation.set(o.x ?? 0.3 * s * sg * -k, 0, o.z ?? sg * 0.06);
    J['elbow' + side].rotation.x = o.elbow ?? -0.2 * k;
  }
}

/** A long skirt (a cone on the hips) so a figure built on trunks reads as someone in everyday clothes. */
export function addSkirt(r, J, color, len = 0.8, scaleY = 1) {
  const T = r.THREE;
  const m = new T.Mesh(new T.CylinderGeometry(0.17, 0.3, len, 8, 1, true), r.mat(color, { map: 'cloth', side: T.DoubleSide }));
  m.position.y = -len / 2 + 0.06; m.scale.y = scaleY; J.hips.add(m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Pieces of the game's interface that the training cutscenes show: the credits, the active item,
// a one-word label (a zone, a lesson) and the shop screen of the cell.
export const SHOP_ITEMS = [['TASER', 150, 'ATORDOA 2 S'], ['SPRAY', 120, 'ERRA MAIS, 4 S'], ['BANDAGEM', 80, '+30 EQ, 1,5 S SEM GUARDA']];
/** hud: { credits, item } (item: text of the active item, or ''). */
export function drawHud(g, w, h, hud) {
  g.textBaseline = 'top'; g.font = `bold ${Math.round(h * 0.05)}px "Courier New", monospace`; g.textAlign = 'right';
  g.fillStyle = '#000'; g.fillText(`CR ${hud.credits}`, w - h * 0.03 + 2, h * 0.035 + 2); g.fillStyle = '#e0a526'; g.fillText(`CR ${hud.credits}`, w - h * 0.03, h * 0.035);
  if (hud.item) { const y = h * 0.9; g.fillStyle = '#000'; g.fillText(hud.item, w - h * 0.03 + 2, y + 2); g.fillStyle = '#e8dfc4'; g.fillText(hud.item, w - h * 0.03, y); }
  g.textAlign = 'left';
}
export function drawLabel(g, w, h, text) {
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = `bold ${Math.round(h * 0.075)}px "Courier New", monospace`;
  g.fillStyle = '#000'; g.fillText(text, w / 2 + 3, h * 0.2 + 3); g.fillStyle = '#ffe27a'; g.fillText(text, w / 2, h * 0.2); g.textAlign = 'left';
}
/** shop: { credits, sel (0 to 2), msg, bought }. */
export function drawShop(g, w, h, shop, t) {
  g.fillStyle = 'rgba(0,0,0,0.72)'; g.fillRect(0, 0, w, h);
  const bw = Math.round(w * 0.62), bh = Math.round(h * 0.8), bx = Math.round((w - bw) / 2), by = Math.round((h - bh) / 2), fs = Math.round(h * 0.05);
  g.fillStyle = '#0d1019'; g.fillRect(bx, by, bw, bh); g.strokeStyle = '#c9a24a'; g.lineWidth = Math.max(2, Math.round(h / 90)); g.strokeRect(bx, by, bw, bh);
  g.textBaseline = 'top'; g.textAlign = 'left'; g.font = `bold ${fs}px "Courier New", monospace`;
  g.fillStyle = '#c9a24a'; g.fillText('LOJA DA CELA', bx + bw * 0.04, by + bh * 0.04);
  g.textAlign = 'right'; g.fillStyle = '#e0a526'; g.fillText(`CR ${shop.credits}`, bx + bw * 0.96, by + bh * 0.04); g.textAlign = 'left';
  SHOP_ITEMS.forEach(([name, price, text], i) => {
    const y = by + bh * 0.2 + i * bh * 0.22, on = shop.sel === i;
    g.fillStyle = on ? '#1c2a30' : '#141824'; g.fillRect(bx + bw * 0.04, y, bw * 0.92, bh * 0.19);
    if (on) { g.strokeStyle = '#5ee6d0'; g.lineWidth = 3; g.strokeRect(bx + bw * 0.04, y, bw * 0.92, bh * 0.19); }
    g.fillStyle = on ? '#fff' : '#e8dfc4'; g.font = `bold ${fs}px "Courier New", monospace`; g.fillText(name, bx + bw * 0.07, y + bh * 0.025);
    g.fillStyle = '#e0a526'; g.textAlign = 'right'; g.fillText(`CR ${price}`, bx + bw * 0.93, y + bh * 0.025); g.textAlign = 'left';
    g.fillStyle = '#7d8296'; g.font = `bold ${Math.round(fs * 0.62)}px "Courier New", monospace`; g.fillText(text, bx + bw * 0.07, y + bh * 0.12);
  });
  if (shop.msg) { g.fillStyle = '#5ee6d0'; g.font = `bold ${fs}px "Courier New", monospace`; g.textAlign = 'center'; g.fillText(shop.msg, bx + bw / 2, by + bh * 0.87); g.textAlign = 'left'; }
  void t;
}

/**
 * A reel: a list of segments played one after the other, each with its own camera track
 * (keys in the segment's own time). segs: [{ name, dur, desc, keys, act?(local, u) }].
 * Returns { views, duration, at(t) -> { seg, local, u, cam } }.
 */
export function reel(segs) {
  let t = 0; const views = {}, S = [];
  for (const s of segs) { views[s.name] = [t, t + s.dur, s.desc]; S.push({ ...s, t0: t, track: track(s.keys) }); t += s.dur; }
  return {
    views, duration: t, segs: S,
    at(time) {
      let i = S.findIndex((s) => time >= s.t0 && time < s.t0 + s.dur); if (i < 0) i = S.length - 1;
      const seg = S[i], local = Math.min(seg.dur, Math.max(0, time - seg.t0));
      return { seg, local, u: local / seg.dur, cam: seg.track(local) };
    },
  };
}

/**
 * Hides, in one frame, the instance of an InstancedMesh (apples, in the orchard) that sits nearest to
 * `pos` within `radius`: its matrix gets scale 0. The scene rewrites its matrices on every update, so
 * call this after the scene's update, every frame. Returns true when one was hidden.
 */
export function hideInstanceNear(group, pos, radius = 0.2) {
  const meshes = group.userData._apples ?? (group.userData._apples = (() => { const l = []; group.traverse((o) => { if (o.isInstancedMesh && o.geometry?.parameters?.radius === 0.085) l.push(o); }); return l; })());
  let best = null, bd = radius;
  const m = hideInstanceNear.m ?? (hideInstanceNear.m = { a: null, v: null });
  for (const im of meshes) {
    const mat = hideInstanceNear.mat4 ?? (hideInstanceNear.mat4 = new im.matrixWorld.constructor());
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, mat);
      const e = mat.elements, d = Math.hypot(e[12] - pos[0], e[13] - pos[1], e[14] - pos[2]);
      if (d < bd && e[0] > 1e-4) { bd = d; best = [im, i]; }
    }
  }
  void m;
  if (!best) return false;
  const [im, i] = best, mat = hideInstanceNear.mat4;
  im.getMatrixAt(i, mat); mat.elements[0] = mat.elements[5] = mat.elements[10] = 0; mat.elements[1] = mat.elements[2] = mat.elements[4] = mat.elements[6] = mat.elements[8] = mat.elements[9] = 0;
  im.setMatrixAt(i, mat); im.instanceMatrix.needsUpdate = true;
  return true;
}
