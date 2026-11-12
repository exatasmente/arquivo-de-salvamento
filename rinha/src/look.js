// How a fighter looks: proportions, colours and the small painted textures (face, torso,
// trunks), all drawn in canvas from a seed. Low-poly rigid segments and a face painted on
// the front of the head, as in the realistic-people 3D games of the late 1990s.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const SKINS = ['#efcfae', '#e0b48a', '#c8946a', '#a8744c', '#80502f', '#5c3823'];
const HAIRS = ['#14100c', '#2a1a10', '#4a3220', '#7a5530', '#b0925a', '#8d8d8d', '#0c0c10'];
const TRUNKS = ['#27434f', '#1e1e26', '#4a2a3a', '#2f4a2a', '#5a4a1e', '#2a2f5a', '#3a3a3a'];
const BANDS = ['#e8e0c8', '#c9a24a', '#5fc3d0', '#d9d9d9'];
const GLOVES = ['#8a2b24', '#2b5d8a', '#3b3b44', '#7a3e8a'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mul = (c, k) => c.map((x) => Math.max(0, Math.min(255, x * k)));
const rgb = (c) => `rgb(${c.map((x) => x | 0).join(',')})`;
const mixc = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);

/** Everything that varies between fighters, from a seed. */
export function randomLook(seed, { heavy = 0 } = {}) {
  const r = mulberry32((seed * 2654435761) >>> 0 || 1);
  const style = r.pick(['short', 'short', 'buzz', 'long', 'bald', 'buzz']);
  const beard = r.pick(['none', 'stubble', 'stubble', 'full', 'goatee', 'none']);
  const scar = r() < 0.55 ? { x0: 14 + r() * 26, y0: 18 + r() * 14, len: 7 + r() * 10, ang: 0.9 + r() * 1.2 } : null;
  return {
    seed, skin: r.pick(SKINS), hair: r.pick(HAIRS), style, beard, scar,
    nose: 0.85 + r() * 0.5, brow: r() < 0.5 ? 1 : 2, eye: r.pick(['#3a2a1a', '#2a3a4a', '#3a4a2a', '#222']),
    trunks: r.pick(TRUNKS), band: r.pick(BANDS), glove: r.pick(GLOVES), number: 1 + Math.floor(r() * 98),
    tank: r() < 0.3, tankColor: r.pick(['#8a8a8a', '#2a2a30', '#6a3a2a']),
    scale: 0.94 + r() * 0.14 + heavy * 0.04, build3: heavy > 0.66 ? 'heavy' : heavy > 0.25 ? 'mid' : r.pick(['lean', 'mid']), width: 0.9 + r() * 0.25, tattoo: r() < 0.3,
  };
}
export const PLAYER_LOOK = {
  seed: 7, skin: '#c8946a', hair: '#1b1512', style: 'short', beard: 'stubble', scar: null, nose: 1, brow: 1, eye: '#3a2a1a',
  trunks: '#27434f', band: '#e8e0c8', glove: '#d9a21b', number: 0, tank: false, tankColor: '#444', scale: 1, width: 1, tattoo: false,
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The face: 64x64, drawn by pixels, front projected onto the head. */
export function paintFace(L) {
  const [c, g] = canvas(64, 64);
  const r = mulberry32(L.seed * 977 + 5);
  const skin = hex(L.skin), hair = hex(L.hair);
  const px = (x, y, col) => { g.fillStyle = rgb(col); g.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (x, y, w, h, col) => { g.fillStyle = rgb(col); g.fillRect(x, y, w, h); };
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const ex = Math.abs(x - 32) / 32;
    const k = 1 - 0.3 * ex * ex - (y > 50 ? (y - 50) * 0.012 : 0) + (r() - 0.5) * 0.07;
    px(x, y, mul(skin, k));
  }
  // hair
  const hl = { short: 15, buzz: 11, long: 15, bald: 0 }[L.style] ?? 14;
  const hairCol = L.style === 'buzz' ? mixc(hair, skin, 0.45) : hair;
  if (L.style !== 'bald') {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const edge = Math.abs(x - 32);
      const lim = hl + (edge > 22 ? (edge - 22) * 1.2 : 0) - (edge < 6 ? 1 : 0);
      const side = L.style === 'long' ? (x < 5 || x > 58) && y < 46 : (x < 4 || x > 59) && y < 32;
      if (y < lim || side) px(x, y, mul(hairCol, 0.85 + r() * 0.3));
    }
  } else rect(28, 1, 8, 2, mul(skin, 1.15));
  // brows
  const bc = mul(hair, 0.8), bt = L.brow;
  rect(13, 25, 13, bt, bc); rect(38, 25, 13, bt, bc);
  // eyes
  for (const cx of [21, 43]) {
    rect(cx - 4, 28, 9, 1, mul(skin, 0.7));
    rect(cx - 3, 29, 7, 3, [226, 222, 212]);
    rect(cx - 1, 29, 3, 3, hex(L.eye)); px(cx, 30, [10, 10, 10]);
    rect(cx - 3, 32, 7, 1, mul(skin, 0.82));
  }
  // nose
  for (let y = 28; y < 44; y++) { px(31, y, mul(skin, 1.07)); px(32, y, mul(skin, 1.03)); px(34, y, mul(skin, 0.86)); px(35, y, mul(skin, 0.8)); }
  const nw = Math.round(3 * L.nose);
  rect(32 - nw - 1, 43, 2, 1, [60, 30, 25]); rect(32 + nw - 1, 43, 2, 1, [60, 30, 25]);
  rect(30, 44, 6, 1, mul(skin, 0.8));
  // mouth
  rect(25, 49, 14, 1, mul(skin, 0.85)); rect(24, 50, 16, 1, [88, 40, 40]); rect(27, 51, 10, 1, mixc(skin, [200, 100, 100], 0.4));
  px(24, 51, mul(skin, 0.8)); px(39, 51, mul(skin, 0.8));
  // cheeks, chin shadow
  rect(26, 55, 12, 1, mul(skin, 0.88));
  // beard
  if (L.beard !== 'none') {
    const dens = { stubble: 0.35, full: 0.92, goatee: 0.9 }[L.beard];
    const col = L.beard === 'stubble' ? mixc(skin, hair, 0.6) : hair;
    for (let y = 36; y < 64; y++) for (let x = 0; x < 64; x++) {
      const e = Math.abs(x - 32), mouth = y >= 48 && y <= 52 && e <= 9;
      let inside;
      if (L.beard === 'goatee') inside = (y >= 53 && e <= 8) || (y >= 46 && y <= 48 && e <= 9 && e >= 2);
      else inside = (y >= 44 && e <= 26) || (y >= 38 && e >= 19 && e <= 28);
      if (inside && !mouth && !(y < 44 && e < 19) && r() < dens) px(x, y, mul(col, 0.8 + r() * 0.4));
    }
  }
  // scar
  if (L.scar) {
    const { x0, y0, len, ang } = L.scar;
    for (let i = 0; i < len; i++) {
      const x = x0 + Math.cos(ang) * i, y = y0 + Math.sin(ang) * i;
      px(x, y, mixc(skin, [220, 150, 150], 0.7)); px(x + 1, y, mul(skin, 0.8));
      if (i % 3 === 1) { px(x - 1, y + 1, mul(skin, 0.75)); px(x + 2, y - 1, mul(skin, 0.75)); }
    }
  }
  // edge columns used for the sides and back of the head: hair above the nape, skin below
  const nape = { short: 34, buzz: 30, long: 46, bald: 0 }[L.style];
  for (let y = 0; y < 64; y++) for (const x of [0, 1, 2, 3, 60, 61, 62, 63]) px(x, y, y < nape ? mul(hairCol, 0.8 + r() * 0.3) : mul(skin, 0.85));
  return toTexture(c);
}

/** Torso 64x32 around the body, front in the middle (u 0.5): bare chest or tank top. */
export function paintTorso(L) {
  const [c, g] = canvas(64, 32);
  const r = mulberry32(L.seed * 313 + 9);
  const skin = hex(L.skin);
  const px = (x, y, col) => { g.fillStyle = rgb(col); g.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (x, y, w, h, col) => { g.fillStyle = rgb(col); g.fillRect(x, y, w, h); };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) px(x, y, mul(skin, 1 - 0.18 * Math.abs(Math.sin((x / 64) * Math.PI * 2 - Math.PI / 2 + Math.PI / 2)) * 0.0 + (r() - 0.5) * 0.08));
  // front muscles (centre x 32)
  rect(31, 2, 2, 28, mul(skin, 0.82));
  for (const sx of [-1, 1]) {
    rect(32 + sx * 6 - 4, 6, 8, 1, mul(skin, 0.78)); // pec line
    rect(32 + sx * 6 - 3, 3, 6, 3, mul(skin, 1.08));
    px(32 + sx * 8, 8, mul(skin, 0.6)); // nipple
    for (const ay of [14, 19, 24]) rect(32 + sx * 4 - 2, ay, 4, 1, mul(skin, 0.78));
    rect(32 + sx * 11, 12, 1, 16, mul(skin, 0.86));
  }
  rect(24, 1, 16, 1, mul(skin, 0.7)); // collarbone
  if (L.tattoo) { rect(41, 5, 5, 5, [40, 50, 70]); rect(43, 3, 1, 9, [40, 50, 70]); }
  if (L.tank) {
    const tc = hex(L.tankColor);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const e = Math.abs(x - 32);
      const strap = y < 8 && e > 6 && e < 13;
      const body = y >= 8 || (e > 6 && e < 13);
      if (body && !(y < 11 && e <= 6) && (y >= 8 || strap)) px(x, y, mul(tc, 0.85 + r() * 0.3));
      if (y >= 8 && e > 20 && x > 0) px(x, y, mul(tc, 0.7 + r() * 0.2)); // side/back
    }
    rect(26, 11, 12, 1, mul(tc, 0.6));
  }
  // back: spine and shoulder blades
  for (const bx of [0, 63]) rect(bx, 2, 1, 28, mul(skin, 0.8));
  return toTexture(c);
}

/** Trunks 32x32 around the pelvis: waistband, side stripe and a number on the front. */
export function paintTrunks(L) {
  const [c, g] = canvas(32, 32);
  const r = mulberry32(L.seed * 71 + 3);
  const base = hex(L.trunks), band = hex(L.band);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    g.fillStyle = rgb(mul(base, 0.92 + r() * 0.16)); g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = rgb(band); g.fillRect(0, 0, 32, 5);
  g.fillStyle = rgb(mul(band, 0.6)); g.fillRect(0, 5, 32, 1);
  g.fillStyle = rgb(band); g.fillRect(7, 6, 2, 26); g.fillRect(23, 6, 2, 26);
  if (L.number) {
    g.fillStyle = rgb(band); g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(L.number), 16, 18);
  }
  return toTexture(c);
}

/** Skin patch for limbs. */
export function paintSkin(L) {
  const [c, g] = canvas(8, 8);
  const r = mulberry32(L.seed * 17 + 1), skin = hex(L.skin);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = rgb(mul(skin, 0.94 + r() * 0.12)); g.fillRect(x, y, 1, 1); }
  return toTexture(c);
}

export function paintGlove(L) {
  const [c, g] = canvas(16, 16);
  const r = mulberry32(L.seed * 5 + 2), col = hex(L.glove);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = rgb(mul(col, 0.9 + r() * 0.2)); g.fillRect(x, y, 1, 1); }
  g.fillStyle = rgb(mul(col, 0.65)); g.fillRect(0, 7, 16, 1); g.fillRect(0, 12, 16, 1);
  return toTexture(c);
}

/**
 * Head: an 8-sided low-poly ellipsoid with a tapered jaw, the face projected flat from the
 * front; the sides and back use the edge columns of the texture. Never a cube.
 */
export function makeHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 8, 6);
  const p = g.attributes.position, uv = g.attributes.uv;
  const RX = 0.108, RY = 0.138, RZ = 0.122;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.max(0, -y);
    const jaw = 1 - 0.34 * Math.pow(t, 1.4);
    x *= RX * jaw; z *= RZ * (1 - 0.22 * t * t); y *= RY;
    if (y < -0.07) z += 0.012 * (t); // chin pushes forward a little
    p.setXYZ(i, x, y, z);
    const front = z >= -0.01;
    const u = front ? 0.5 + (x / RX) * 0.46 : x >= 0 ? 0.985 : 0.015;
    const v = 0.5 + (y / RY) * 0.46 + 0.01;
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}

export function buildMaterials(r, L) {
  return {
    skin: r.mat('#ffffff', { map: paintSkin(L) }),
    face: r.mat('#ffffff', { map: paintFace(L) }),
    torso: r.mat('#ffffff', { map: paintTorso(L) }),
    trunks: r.mat('#ffffff', { map: paintTrunks(L) }),
    glove: r.mat('#ffffff', { map: paintGlove(L) }),
    noseMat: r.mat('#c8c8c8', { map: paintSkin(L) }),
    tape: r.mat('#d8d2bc', {}),
    boot: r.mat('#1d1d24', {}),
    hair: r.mat(L.hair, {}),
  };
}

/** Shift the u coordinate of a cylinder so its front (+Z) sits at the middle of the texture. */
export function frontAtCentre(geo) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { let u = uv.getX(i) + 0.5; uv.setX(i, u); }
  return geo;
}

/**
 * Stand-in for models/human.js: same shape as the contract, { root, joints, height, eyeHeight },
 * with joint groups pivoted at the joints, neutral pose (standing, arms down) at rotation zero,
 * +Z forward, Y up. Also returns what the rig needs: headMesh, the gloves, and the parts to
 * hide in first person. Swap this for buildHuman() when the module arrives.
 */
export function buildStubHuman(r, L) {
  const M = buildMaterials(r, L), w = L.width ?? 1;
  const ARM_A = 0.35, ARM_B = 0.35, LEG_A = 0.44, LEG_B = 0.42;
  const root = new THREE.Group(), joints = {}, bodyParts = [];
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const bone = (len, rt, rb, m, parent, sides = 6) => {
    const g = new THREE.CylinderGeometry(rt, rb, len, sides); g.translate(0, -len / 2, 0);
    const mesh = new THREE.Mesh(g, m); parent.add(mesh); return mesh;
  };
  const hide = (m) => { bodyParts.push(m); return m; };
  const J = joints;
  J.hips = grp(root, 0, 0.84, 0);
  const pelvis = hide(new THREE.Mesh(frontAtCentre(new THREE.CylinderGeometry(0.19 * w, 0.2 * w, 0.26, 8)), M.trunks)); pelvis.scale.z = 0.72; pelvis.position.y = -0.01; J.hips.add(pelvis);
  J.spine = grp(J.hips, 0, 0, 0);
  const chest = hide(new THREE.Mesh(frontAtCentre(new THREE.CylinderGeometry(0.225 * w, 0.165 * w, 0.58, 8, 1, true)), M.torso)); chest.position.y = 0.32; chest.scale.z = 0.66; J.spine.add(chest);
  // head: neck pivot, head pivot above it
  J.neck = grp(J.spine, 0, 0.6, 0);
  hide(bone(-0.12, 0.052, 0.06, M.skin, J.neck)); // short neck stub
  J.head = grp(J.neck, 0, 0.14, 0);
  const headMesh = new THREE.Mesh(makeHeadGeometry(), M.face); J.head.add(headMesh);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017 * L.nose, 0.034, 4), M.noseMat); nose.rotation.x = Math.PI / 2; nose.rotation.z = Math.PI / 4; nose.position.set(0, -0.012, 0.118); 
  for (const sd of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.06, 0.04), M.skin); ear.position.set(sd * 0.108, -0.005, -0.005); headMesh.add(ear); }
  if (L.style === 'long') { const hb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), M.hair); hb.position.set(0, -0.04, -0.105); headMesh.add(hb); }
  const headParts = [headMesh];
  // arms (L is +X)
  const gloves = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = J['shoulder' + side] = grp(J.spine, 0.21 * sx, 0.54, 0);
    const cap = hide(new THREE.Mesh(new THREE.BoxGeometry(0.1 * w, 0.1, 0.1), M.skin)); sh.add(cap);
    bone(ARM_A, 0.056 * w, 0.046 * w, M.skin, sh);
    const el = J['elbow' + side] = grp(sh, 0, -ARM_A, 0);
    bone(ARM_B, 0.046 * w, 0.04 * w, M.skin, el);
    const wr = J['wrist' + side] = grp(el, 0, -ARM_B, 0);
    // hands are blocks: fist, thumb and a taped cuff, built along +Z (the forearm direction)
    const g = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.155, 0.2), M.glove); fist.position.z = 0.03; g.add(fist);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.11), M.glove); thumb.position.set(sx * -0.1, 0, 0); g.add(thumb);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.115, 0.1), M.tape); cuff.position.z = -0.105; g.add(cuff);
    wr.add(g); gloves[side] = g;
  }
  // legs
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const hp = J['hip' + side] = grp(J.hips, 0.1 * sx, 0, 0);
    const up = hide(bone(LEG_A, 0.088 * w, 0.066 * w, M.skin, hp));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.098 * w, 0.1 * w, 0.2, 8, 1, true), M.trunks); cuff.position.y = -0.1; up.add(cuff);
    const kn = J['knee' + side] = grp(hp, 0, -LEG_A, 0);
    hide(bone(LEG_B, 0.062 * w, 0.044 * w, M.skin, kn));
    const an = J['ankle' + side] = grp(kn, 0, -LEG_B, 0);
    const foot = hide(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.27), M.boot)); foot.position.set(0, -0.04, 0.07); an.add(foot);
  }
  return { root, joints, height: 1.74, eyeHeight: 1.6, headMesh, gloves, bodyParts, headParts };
}
