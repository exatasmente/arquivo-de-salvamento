// Faces, bodies and clothes painted by code from a seed: small canvases (32 to 64 px) with
// nearest filtering, as in the realistic-people 3D games of the late 1990s. Everything here is a
// pure function of the seed; no Math.random, no real clock.
import { mulberry32 } from '../rng.js';

const SKINS = [ // light to dark, with weights
  [[245, 214, 186], 2], [[233, 190, 150], 3], [[214, 164, 120], 3], [[188, 134, 92], 3],
  [[156, 106, 70], 2], [[118, 76, 50], 2], [[84, 54, 38], 1.5],
];
const HAIRS = [
  [[18, 14, 12], 4], [[40, 26, 18], 3], [[72, 48, 30], 2.5], [[116, 80, 44], 1.5],
  [[170, 140, 82], 1], [[150, 62, 34], 0.5], [[142, 142, 142], 0.7],
];
const EYES = [[58, 40, 26], [40, 56, 74], [60, 74, 46], [30, 26, 24], [92, 64, 30]];
const TRUNKS = ['#27434f', '#1e1e26', '#7a2a2a', '#2f4a2a', '#8a6a1e', '#2a2f7a', '#5a5a5a', '#6a2a6a'];
const BANDS = ['#e8e0c8', '#d9b24a', '#5fc3d0', '#d9d9d9', '#c04030'];
const GLOVES = ['#a02a22', '#2a5ea0', '#2a2a34', '#c8962a', '#6a3a9a', '#d8d8d0'];
const TANKS = ['#d8d4c8', '#2a2a30', '#8a3a2a', '#3a5a7a', '#6a6a30'];
const SHIRTS = ['#c8c0a8', '#6a8aa8', '#a85a52', '#7a9a6a', '#d8d0d0', '#5a5a78', '#c89a52'];
const PANTS = ['#3a3a4a', '#4a4036', '#2e3c4e', '#5a5448'];
const SHOES = ['#202028', '#d8d8d0', '#7a2a2a'];
const STYLES = ['short', 'short', 'buzz', 'long', 'bald', 'buzz', 'short'];
const BEARDS = ['none', 'none', 'stubble', 'stubble', 'full', 'goatee'];

const clamp = (x, a = 0, b = 255) => Math.max(a, Math.min(b, x));
export const mul = (c, k) => c.map((x) => clamp(x * k));
export const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
export const css = (c) => `rgb(${c.map((x) => clamp(Math.round(x))).join(',')})`;

function colour(THREE, v) { const c = new THREE.Color(v); return [c.r * 255, c.g * 255, c.b * 255]; }
function weighted(r, list) {
  let t = 0; for (const [, w] of list) t += w;
  let x = r() * t;
  for (const [v, w] of list) { x -= w; if (x <= 0) return v; }
  return list[0][0];
}

/** Turns the (partial) look of the contract into a full description. What is missing comes from the seed. */
export function resolveLook(THREE, look = {}) {
  const seed = (look.seed ?? 1) | 0;
  const r = mulberry32((seed * 2654435761 + 12345) >>> 0 || 1);
  const has = (k) => look[k] !== undefined;
  const col = (k, fallback) => (has(k) && look[k] !== null ? colour(THREE, look[k]) : fallback);

  let skin = col('skin', null);
  if (!skin) { const s = weighted(r, SKINS); skin = s.map((x) => clamp(x + (r() - 0.5) * 14)); } else r(), r(), r(), r();
  const age = r(); // 0 young .. 1 weathered
  let hair = col('hair', null);
  if (!hair) { hair = weighted(r, HAIRS); if (age > 0.8 && r() < 0.5) hair = mix(hair, [150, 150, 150], 0.7); } else r(), r();
  const civil = look.outfit === 'civil';
  const bare = look.glove === 'none' || look.glove === false;
  const female = look.female === true || ['f', 'female', 'mulher'].includes(look.sex);
  const styleIn = look.hairStyle ?? look.style;
  const style = typeof styleIn === 'string' ? styleIn : female ? 'long' : STYLES[Math.floor(r() * STYLES.length)];
  let beard = BEARDS[Math.floor(r() * BEARDS.length)];
  if (female) beard = 'none';
  if (female) { /* no beard */ } else if (typeof look.beard === 'string') beard = look.beard;
  else if (look.beard === true) beard = r() < 0.5 ? 'full' : 'stubble';
  else if (look.beard === false || look.beard === null) beard = 'none';
  const sc = r(), sx = r(), sy = r(), sa = r();
  let scar = sc < 0.45 ? { x: 0.25 + sx * 0.5, y: 0.25 + sy * 0.4, ang: 0.7 + sa * 1.6, len: 9 + sx * 10 } : null;
  if (look.scar === true && !scar) scar = { x: 0.3 + sx * 0.4, y: 0.35 + sy * 0.3, ang: 1.0 + sa, len: 12 };
  else if (look.scar === false || look.scar === null) scar = null;
  else if (look.scar && typeof look.scar === 'object') scar = { x: 0.5, y: 0.5, ang: 1.2, len: 12, ...look.scar };

  let build = look.build;
  if (typeof build === 'number') build = ['lean', 'mid', 'heavy'][clamp(Math.round(build), 0, 2)];
  build = { magro: 'lean', leve: 'lean', medio: 'mid', 'médio': 'mid', pesado: 'heavy', lean: 'lean', mid: 'mid', heavy: 'heavy' }[build];
  const bRoll = r();
  if (!build) build = civil ? 'lean' : bRoll < 0.3 ? 'lean' : bRoll < 0.72 ? 'mid' : 'heavy';

  let h = look.height; const hRoll = r();
  let scale = (female ? 0.89 + hRoll * 0.07 : 0.93 + hRoll * 0.16); // multiplier on 1.75 m
  if (typeof h === 'number') scale = h > 1.3 ? h / 1.75 : h;

  let top;
  const tankRoll = r(), tankCol = TANKS[Math.floor(r() * TANKS.length)];
  if (look.top === null || look.top === false || look.top === 'bare' || look.top === 'none') top = null;
  else if (look.top === undefined || look.top === true) top = tankRoll < 0.35 ? colour(THREE, tankCol) : null;
  else top = colour(THREE, look.top);

  const shirtRoll = r(), pantsRoll = r(), skirtRoll = r();
  const shirt = col('shirt', colour(THREE, SHIRTS[Math.floor(shirtRoll * SHIRTS.length)]));
  const pants = col('pants', colour(THREE, PANTS[Math.floor(pantsRoll * PANTS.length)]));
  const skirt = look.skirt !== undefined ? Boolean(look.skirt) : female && skirtRoll < 0.5;
  if (civil) top = shirt;
  return {
    civil, bare, female, shirt, pants, skirt,
    seed, skin, hair, style, beard, scar, build, scale, top,
    eye: EYES[Math.floor(r() * EYES.length)],
    nose: 0.85 + r() * 0.45, brow: female ? 1 + (r() < 0.5 ? 1 : 0) : r() < 0.5 ? 2 : 3, eyeSpace: 0.9 + r() * 0.25,
    jaw: 0.92 + r() * 0.16, ear: 0.9 + r() * 0.3, age,
    hairy: r() < 0.5 && !female, tattoo: r() < 0.22,
    trunks: col('trunks', colour(THREE, TRUNKS[Math.floor(r() * TRUNKS.length)])),
    band: colour(THREE, BANDS[Math.floor(r() * BANDS.length)]),
    glove: bare ? [0, 0, 0] : col('glove', colour(THREE, GLOVES[Math.floor(r() * GLOVES.length)])),
    shoe: colour(THREE, SHOES[Math.floor(r() * SHOES.length)]),
    number: has('number') ? look.number | 0 : 1 + Math.floor(r() * 98),
  };
}

export function makeTexture(THREE, canvas, clampEdge = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function pen(g) {
  return {
    px: (x, y, c) => { g.fillStyle = css(c); g.fillRect(Math.round(x), Math.round(y), 1, 1); },
    rect: (x, y, w, h, c) => { g.fillStyle = css(c); g.fillRect(x, y, w, h); },
  };
}

/**
 * The face, 64x64, projected flat on the front of the head: u across the face, v from chin (bottom)
 * to crown. Eyes at row 28, brows at 23, nose base at 43, mouth at 52.
 */
export function paintFace(THREE, L) {
  const [c, g] = canvas(64, 64); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 977 + 5);
  const skin = L.skin, hair = L.hair;
  const dark = skin.reduce((a, b) => a + b, 0) < 330;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const ex = Math.abs(x - 31.5) / 32;
    let k = 1 - 0.34 * ex * ex * ex - (y > 52 ? (y - 52) * 0.016 : 0) + (r() - 0.5) * 0.06;
    if (y > 40 && y < 46 && Math.abs(x - 32) < 8) k *= 0.97;     // under the nose
    px(x, y, mul(skin, k));
  }
  // cheek warmth, eye sockets
  for (const sx of [-1, 1]) {
    for (let y = 34; y < 42; y++) for (let x = 0; x < 6; x++) px(32 + sx * (13 + x) - (sx < 0 ? 0 : 0), y, mix(mul(skin, 1), [200, 90, 80], dark ? 0.05 : 0.12));
  }
  // hair above the hairline (the crown shell hides most of it) and sideburns
  const hairCol = L.style === 'buzz' ? mix(hair, skin, 0.5) : L.style === 'bald' ? skin : hair;
  if (L.style !== 'bald') {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const edge = Math.abs(x - 31.5);
      const hl = 17 + (edge > 22 ? (edge - 22) * 1.3 : 0) + (edge < 5 ? -1 : 0) + ((x * 7 + L.seed) % 5 === 0 ? 1 : 0);
      const side = edge > (L.style === 'long' ? 25 : 28.5) && y < (L.style === 'long' ? 50 : 36);
      if (y < hl || side) px(x, y, mul(hairCol, 0.8 + r() * 0.35));
    }
  }
  // eyes and brows
  const es = Math.round(12 * L.eyeSpace);
  for (const sx of [-1, 1]) {
    const cx = 32 + sx * es;
    rect(cx - 4, 27, 9, 1, mul(skin, 0.58));                         // upper lid
    rect(cx - 3, 28, 7, 3, [236, 232, 222]);                          // white
    rect(cx - 1, 28, 3, 3, L.eye); px(cx, 29, [8, 8, 10]);            // iris, pupil
    rect(cx - 3, 31, 7, 1, mul(skin, 0.8));                           // lower lid
    if (L.age > 0.55) rect(cx - 3, 32, 7, 1, mul(skin, 0.88));        // bag
    const bc = L.style === 'bald' && L.beard === 'none' ? mul(hair, 1.0) : mul(hair, 0.75);
    const by = 23 + (sx * 0 );
    for (let i = 0; i < 12; i++) {
      const x = cx - 6 + i; const yy = by + (sx > 0 ? Math.floor((i - 6) * -0.12) : Math.floor((i - 6) * 0.12)) + (i > 8 ? 1 : 0);
      for (let t = 0; t < L.brow; t++) px(x, yy - t + (L.brow - 1 ? 0 : 0), bc);
    }
  }
  // nose
  for (let y = 26; y < 42; y++) { px(31, y, mul(skin, 1.08)); px(32, y, mul(skin, 1.04)); px(35, y, mul(skin, 0.88)); px(36, y, mul(skin, 0.82)); }
  const nw = Math.round(3 * L.nose);
  rect(32 - nw - 1, 41, 2, 2, mul(skin, 0.35)); rect(32 + nw - 1, 41, 2, 2, mul(skin, 0.35));
  rect(32 - nw, 43, nw * 2, 1, mul(skin, 0.8));
  // mouth
  const lip = mix(mul(skin, 0.8), [160, 70, 70], (dark ? 0.3 : 0.5) + (L.female ? 0.25 : 0));
  rect(25, 51, 15, 1, mul(skin, 0.25));
  rect(27, 50, 11, 1, lip); rect(26, 52, 13, 2, mix(lip, skin, 0.1));
  px(25, 51, mul(skin, 0.6)); px(39, 51, mul(skin, 0.6));
  rect(28, 55, 9, 1, mul(skin, 0.86));                                // chin crease
  // lines of age
  if (L.age > 0.6) { for (let y = 38; y < 48; y++) { px(24, y, mul(skin, 0.86)); px(40, y, mul(skin, 0.86)); } rect(26, 20, 12, 1, mul(skin, 0.9)); }
  // beard
  if (L.beard !== 'none') {
    const bc = mul(hair, 0.7);
    for (let y = 36; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = Math.abs(x - 31.5);
      let on = false;
      const mouth = y >= 49 && y <= 53 && dx < 7.5;
      const must = y >= 45 && y <= 49 && dx < 9 && dx > 1.5 && !(y === 49 && dx < 7);
      if (L.beard === 'full' || L.beard === 'stubble') on = (y >= 46 && dx < 31 - (y - 46) * 0.2) || (dx > 17 && y >= 33) || must;
      else if (L.beard === 'goatee') on = (y >= 54 && dx < 8) || must || (y >= 52 && y < 54 && dx > 5.5 && dx < 8);
      if (mouth && !(L.beard === 'full' && y >= 53)) on = on && y > 53;
      if (y >= 40 && y <= 44 && dx < 10) on = false; // under the nose stays clear
      if (!on) continue;
      if (L.beard === 'stubble') { if (r() < 0.5) px(x, y, mix(mul(skin, 0.95), bc, 0.5 + r() * 0.3)); }
      else px(x, y, mul(bc, 0.8 + r() * 0.4));
    }
    if (L.beard !== 'stubble') { rect(27, 51, 11, 1, mul(skin, 0.3)); rect(28, 52, 9, 1, lip); } // mouth reopened
  }
  // scar
  if (L.scar) {
    const { x, y, ang, len } = L.scar;
    const x0 = 8 + x * 48, y0 = 18 + y * 28;
    for (let i = 0; i < len; i++) {
      const sx = x0 + Math.cos(ang) * i, sy = y0 + Math.sin(ang) * i;
      px(sx, sy, mix(skin, [210, 150, 150], 0.65)); px(sx + 1, sy, mul(skin, 0.78));
      if (i % 4 === 2) { px(sx - 1, sy - 1, mul(skin, 0.7)); px(sx + 2, sy + 1, mul(skin, 0.7)); }
    }
  }
  return makeTexture(THREE, c, true);
}

/** Torso: u around (front centre at 0.5, back at 0/1), v from the waist (0) to the shoulders (1). */
export function paintTorso(THREE, L) {
  const [c, g] = canvas(64, 64); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 331 + 9);
  const skin = L.skin, lean = L.build === 'lean', heavy = L.build === 'heavy';
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const front = 1 - Math.abs(x - 32) / 32;                      // 1 at the front, 0 at the back
    let k = 0.82 + front * 0.18 + (r() - 0.5) * 0.06;
    px(x, y, mul(skin, k));
  }
  // shape: pecs, sternum, ribs/abs, navel
  for (let x = 20; x < 45; x++) {
    const dx = Math.abs(x - 32.5);
    const y = 26 + Math.round(Math.max(0, 6 - dx * 0.5) * 0.8 + (dx > 3 ? 1 : 0)) * 1;
    if (dx > 1) px(x, y + 1, mul(skin, heavy ? 0.9 : 0.74));
  }
  for (let y = 14; y < 28; y++) { px(32, y, mul(skin, 0.8)); px(33, y, mul(skin, 0.86)); }
  rect(32, 8, 1, 6, mul(skin, 0.86));
  if (!heavy) for (let i = 0; i < 3; i++) for (const x of [28, 36]) rect(x, 32 + i * 5, 1, 1, mul(skin, lean ? 0.8 : 0.9)), rect(x - (x < 32 ? 0 : -1), 34 + i * 5, 4, 1, mul(skin, lean ? 0.78 : 0.88));
  if (!lean) for (let x = 22; x < 43; x++) px(x, 40 + (x > 27 && x < 38 ? 2 : 0) + (heavy ? 3 : 0), mul(skin, 0.84));
  px(32, 49, mul(skin, 0.45)); px(32, 50, mul(skin, 0.6));
  for (const x of [24, 40]) { rect(x, 22, 3, 2, mix(mul(skin, 0.8), [130, 70, 60], 0.4)); }
  if (L.hairy) for (let i = 0; i < 26; i++) { const x = 27 + Math.floor(r() * 11), y = 20 + Math.floor(r() * 14); px(x, y, mix(skin, L.hair, 0.4)); }
  if (false) { const tc = mix(skin, [30, 50, 70], 0.55); for (let i = 0; i < 9; i++) px(10 + i, 18 + Math.floor(Math.sin(i) * 2), tc), px(10 + i, 19, tc); rect(14, 21, 2, 5, tc); }
  if (L.civil) {
    const t = L.shirt;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const angle = Math.abs(x - 32) / 64 * 360;
      const vneck = y < 8 && angle < 6 + (8 - y) * 1.2 && y < 3 + (14 - angle) * 0.6;
      if (!vneck) px(x, y, mul(t, 0.82 + (1 - Math.abs(x - 32) / 32) * 0.18 + (r() - 0.5) * 0.08));
    }
    for (let y = 9; y < 62; y += 9) px(32, y, mul(t, 0.6));
    for (let x = 0; x < 64; x++) px(x, 62, mul(t, 0.75));
    return makeTexture(THREE, c);
  }
  // waist band hint (the trunks overlap it) and the tank top
  if (L.top) {
    const t = L.top;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const th = ((x - 16) / 32) * Math.PI;      // angle from the front, in half turns
      const angle = Math.abs(x - 32) / 64 * 360; // 0 front, 180 back
      let cover = y > 12 || (angle > 38 && angle < 70 ? false : true);
      if (y <= 12) { // neck and strap area: straps over the shoulder, scoop at the front, deeper armholes
        const scoop = angle < 24 && y < 4 + (24 - angle) * 0.35;
        const armhole = angle >= 52 && angle <= 130 && y < 12;
        cover = !scoop && !armhole;
      }
      if (y > 12 && angle > 56 && angle < 124 && y < 20) cover = false;
      if (cover) px(x, y, mul(t, 0.82 + (1 - Math.abs(x - 32) / 32) * 0.18 + (r() - 0.5) * 0.08));
    }
    for (let x = 0; x < 64; x++) { px(x, 60, mul(t, 0.7)); px(x, 61, mul(t, 0.7)); }
    for (const x of [27, 37]) for (let y = 28; y < 60; y += 6) px(x, y, mul(t, 0.9));
  }
  return makeTexture(THREE, c);
}

/** Trunks (pelvis): a 64x32 wrap with the waistband on top and the number at the front. */
export function paintTrunks(THREE, L) {
  const [c, g] = canvas(64, 32); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 733 + 3);
  if (L.civil) {
    const pc = L.skirt ? mix(L.pants, L.shirt, 0.3) : L.pants;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) px(x, y, mul(pc, 0.85 + (1 - Math.abs(x - 32) / 32) * 0.15 + (r() - 0.5) * 0.08));
    rect(0, 0, 64, 3, mul(pc, 0.6));
    if (!L.skirt) { rect(32, 3, 1, 14, mul(pc, 0.7)); }
    else rect(0, 29, 64, 3, mul(pc, 0.7));
    return makeTexture(THREE, c);
  }
  const t = L.trunks, b = L.band;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    const front = 1 - Math.abs(x - 32) / 32;
    px(x, y, mul(t, 0.85 + front * 0.15 + (r() - 0.5) * 0.08 + (y > 4 && y < 30 && (x % 16 === 8) ? -0.05 : 0)));
  }
  rect(0, 0, 64, 6, b);                                             // waistband
  rect(0, 6, 64, 1, mul(b, 0.6)); rect(0, 0, 64, 1, mul(b, 0.8));
  rect(0, 29, 64, 3, b);                                            // hem
  for (const x of [15, 16, 47, 48]) rect(x, 7, 1, 21, mix(t, b, 0.75)); // side stripes
  // number on the front
  const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
  const digits = String(Math.abs(L.number) % 100).split('');
  const w = digits.length * 4 - 1, x0 = 32 - Math.floor(w / 2);
  digits.forEach((d, i) => { for (let k = 0; k < 15; k++) if (FONT[d][k] === '1') px(x0 + i * 4 + (k % 3), 12 + Math.floor(k / 3), mix(b, [255, 255, 255], 0.3)); });
  return makeTexture(THREE, c);
}

/** Legs: 16x32, trunks hem at the top (above v = 0.5), bare skin below. */
export function paintLegs(THREE, L) {
  const [c, g] = canvas(16, 32); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 521 + 1);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    const front = 1 - Math.abs(x - 8) / 8;
    const cloth = L.civil ? !L.skirt : y < 14;
    const base = cloth ? (L.civil ? L.pants : L.trunks) : L.skin;
    px(x, y, mul(base, 0.84 + front * 0.16 + (r() - 0.5) * 0.07));
  }
  if (!L.civil) rect(0, 12, 16, 2, L.band);
  if (L.hairy && !L.civil) for (let i = 0; i < 20; i++) px(Math.floor(r() * 16), 16 + Math.floor(r() * 16), mix(L.skin, L.hair, 0.45));
  return makeTexture(THREE, c);
}

/** Plain skin for limbs: 16x16 with a little grain. */
export function paintSkin(THREE, L) {
  const [c, g] = canvas(16, 16); const { px } = pen(g);
  const r = mulberry32(L.seed * 17 + 2);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, mul(L.skin, 0.84 + (1 - Math.abs(x - 8) / 8) * 0.12 + (r() - 0.5) * 0.07));
  return makeTexture(THREE, c);
}

/** Glove: 16x16, leather grain plus a white cuff stripe near the top. */
export function paintGlove(THREE, L) {
  const [c, g] = canvas(16, 16); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 71 + 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const hi = x > 3 && x < 8 && y > 4 && y < 12 ? 1.12 : 1;
    px(x, y, mul(L.glove, hi * (0.86 + (1 - Math.abs(x - 8) / 8) * 0.14 + (r() - 0.5) * 0.08)));
  }
  rect(0, 0, 16, 3, [226, 222, 208]);                              // tape at the wrist
  rect(0, 3, 16, 1, [150, 146, 134]);
  rect(0, 13, 16, 1, mul(L.glove, 0.7));                             // seam near the fingertips
  return makeTexture(THREE, c);
}

/** Upper arm with a short sleeve (civil clothes): cloth at the top, skin below. 16x32, v = 1 at the shoulder. */
export function paintSleeve(THREE, L) {
  const [c, g] = canvas(16, 32); const { px, rect } = pen(g);
  const r = mulberry32(L.seed * 29 + 6);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    const base = y < 17 ? L.shirt : L.skin;
    px(x, y, mul(base, 0.84 + (1 - Math.abs(x - 8) / 8) * 0.14 + (r() - 0.5) * 0.07));
  }
  rect(0, 16, 16, 1, mul(L.shirt, 0.7));
  return makeTexture(THREE, c);
}
