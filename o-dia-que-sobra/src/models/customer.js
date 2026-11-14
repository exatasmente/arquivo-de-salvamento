// Customers of the posto: a human of models/human.js dressed for the job (trucker, nurse, party couple,
// taxi driver, delivery rider, worn suit, drunk, hooded stranger, the old attendant), plus six poses.
// Everything is a pure function of the spec and the seed: no Math.random, no real clock.
//
//   buildCustomer(r, spec, { seed }) -> {
//     root,            Group, origin at the feet (y = 0), facing +z, to be placed and turned by the caller
//     joints,          the joints of buildHuman (hips, spine, neck, head, shoulderL/R, elbowL/R, ...)
//     height, eyeHeight (metres),
//     castsShadow,     false for the "no shadow" customer; `shadow` is the dark patch under the feet (null then)
//     categoria,       'comum' | 'recorrente' | 'inconveniente' | 'suspeito' | 'sobrenatural'
//     poses,           ['parado', 'impaciente', 'apontando', 'pagando', 'costas', 'fixo'] (POSES_EXTRA: see below)
//     pose,            the current pose name
//     setPose(nome, t) put the figure in a pose at time t (seconds)
//     update(t, estado) per-frame animation; estado = { pose?, andando?: 0..1, fase?: rad, falando?: bool,
//                      olhar?: rad (head yaw, relative to the body), altura?: 0..1 (for 'pegando') }
//                      Called with the time going forward in small steps, update() also reads how far the root moved
//                      since the last call: the legs follow the DISTANCE walked (no skating), the body turns to the
//                      heading over about 0.2 s instead of snapping, and a change of pose blends over 0.22 s.
//                      Called out of sequence (a seek) it falls back to estado.fase and snaps: still a pure function
//                      of what it was given.
//   }
//
// spec (from data/cast.json, "aparencia"): {
//   categoria, roupa,        see OUTFITS; roupa decides the garments painted over the body
//   seed?                    fixed seed of the face and body (recurring customers); else opts.seed
//   look?: {...}             overrides for the look of buildHuman (hair '#rrggbb', female, build, height in m, ...)
//   acessorios?: [names]     see ACC
//   sobrenatural?            'sem-sombra' | 'frentista-antigo'
//   variante?, variantes?    named look changes ({ semCapacete: true, look: {...}, acessorios: [...] ...})
//   manias?: ['balanco', ...] 'balanco' (sways), 'cansado' (head down), 'rigido' (never moves)
//   nota?                    colour of the banknote held in the 'pagando' pose
// }
import { buildHuman } from './human.js';
import { customerLook, customerIdentity } from '../look.js';
import { makeTexture } from './faces.js';
import { mulberry32 } from '../rng.js';

export const POSES = ['parado', 'impaciente', 'apontando', 'pagando', 'costas', 'fixo'];
// Extra poses for the systems that want them (nothing calls them by default; an unknown pose falls back to 'parado'):
//   'pegando'         reach for a product on a shelf and bring it to the chest (estado.altura 0 low .. 1 high)
//   'saindo-carro'    getting up out of the driver's seat, one hand on the door frame (about 0.9 s)
//   'entrando-carro'  the same backwards, ending seated
export const POSES_EXTRA = ['pegando', 'saindo-carro', 'entrando-carro'];
const ALL_POSES = [...POSES, ...POSES_EXTRA];
export const CATEGORIAS = ['comum', 'recorrente', 'inconveniente', 'suspeito', 'sobrenatural'];

// --------------------------------------------------------------------------------------------- colours
const parse = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp = (x) => Math.max(0, Math.min(255, x));
const mulc = (c, k) => c.map((x) => clamp(x * k));
const mixc = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const hexOf = (c) => '#' + c.map((x) => Math.round(clamp(x)).toString(16).padStart(2, '0')).join('');
const css = (c) => `rgb(${c.map((x) => Math.round(clamp(x))).join(',')})`;

// --------------------------------------------------------------------------------------------- outfits
// look: overrides of the look; torso: painted shell over the chest; hem: what hangs below the waist;
// sleeves: 'long' puts cloth over the whole arm; acc: default accessories.
const OUTFITS = {
  'camiseta': { look: { female: false, skirt: false, shirt: '#6a7a8a', pants: '#2e3c4e' }, torso: { kind: 'camiseta', c1: '#6a7a8a' }, acc: [] },
  'polo': { look: { female: false, skirt: false, shirt: '#7a9a6a', pants: '#3a3a4a' }, torso: { kind: 'polo', c1: '#7a9a6a' }, acc: [] },
  'caminhoneiro': { look: { female: false, skirt: false, shirt: '#7a5a3a', pants: '#2e3c4e', build: 'heavy', hairStyle: 'short' }, torso: { kind: 'xadrez', c1: '#7a5a3a', c2: '#c8b890' }, hem: 'belt', acc: ['bone'], bone: '#3d4a3a' },
  'enfermeira': { look: { shirt: '#e4e4dc', pants: '#4a8a8a', female: true, build: 'lean', hairStyle: 'long', skirt: false }, torso: { kind: 'jaleco', c1: '#e4e4dc', c2: '#4a8a8a' }, hem: 'jaleco', sleeves: 'short', acc: ['cracha', 'coque'] },
  'festa-ele': { look: { female: false, skirt: false, shirt: '#d8d0c0', pants: '#26262e', hairStyle: 'short' }, torso: { kind: 'camisa-aberta', c1: '#d8d0c0' }, sleeves: 'long', sleeveColor: '#d8d0c0', acc: [] },
  'festa-ela': { look: { shirt: '#7a2a4a', pants: '#7a2a4a', female: true, skirt: true, hairStyle: 'long' }, torso: { kind: 'vestido', c1: '#7a2a4a', c2: '#d8b0c0' }, hem: 'vestido', acc: ['bolsa'] },
  'taxista-dona': { look: { shirt: '#3d5a4a', pants: '#3a3a4a', female: true, skirt: false, hairStyle: 'short' }, torso: { kind: 'cardigan', c1: '#3d5a4a', c2: '#d0c4a8', c3: '#a85a52' }, sleeves: 'long', sleeveColor: '#3d5a4a', acc: ['oculos', 'bolsa'] },
  'entregador': { look: { female: false, skirt: false, shirt: '#5a5a48', pants: '#262a30', hairStyle: 'short', build: 'lean' }, torso: { kind: 'jaqueta', c1: '#5a5a48', c2: '#6a6a54' }, hem: 'jacket', sleeves: 'long', sleeveColor: '#5a5a48', acc: ['capacete-mao', 'mochila-entrega'] },
  'terno-gasto': { look: { female: false, skirt: false, shirt: '#6c6a62', pants: '#5c5a54', hairStyle: 'short', build: 'mid' }, torso: { kind: 'terno', c1: '#6c6a62', c2: '#7a2a2a' }, hem: 'jacket', sleeves: 'long', sleeveColor: '#6c6a62', acc: ['pasta'] },
  'bebado': { look: { female: false, skirt: false, shirt: '#a85a52', pants: '#4a4036', hairStyle: 'short', beard: 'stubble' }, torso: { kind: 'bebado', c1: '#a85a52' }, hem: 'belt-solto', acc: ['garrafa'], manias: ['balanco'] },
  'reclamao': { look: { female: false, skirt: false, shirt: '#c8c0a8', pants: '#4a4036', build: 'mid' }, torso: { kind: 'polo', c1: '#c8c0a8' }, acc: ['oculos'] },
  'aposentado': { look: { female: false, skirt: false, shirt: '#9a8a6a', pants: '#5a5448', hairStyle: 'short', build: 'lean' }, torso: { kind: 'xadrez', c1: '#9a8a6a', c2: '#d8d0b0' }, acc: ['bone'], bone: '#8a7a5a' },
  'moletom': { look: { female: false, skirt: false, shirt: '#5a5e66', pants: '#262a30', hairStyle: 'short' }, torso: { kind: 'moletom', c1: '#5a5e66' }, sleeves: 'long', sleeveColor: '#5a5e66', acc: ['capuz'] },
  'jaqueta-escura': { look: { female: false, skirt: false, shirt: '#23252b', pants: '#1e2026', hairStyle: 'short' }, torso: { kind: 'jaqueta', c1: '#23252b', c2: '#2c2e35' }, hem: 'jacket', sleeves: 'long', sleeveColor: '#23252b', acc: ['oculos-escuros', 'bone'], bone: '#1e2026' },
  'sobretudo': { look: { female: false, skirt: false, shirt: '#8a8a84', pants: '#3a3a3e', hairStyle: 'short', build: 'lean' }, torso: { kind: 'sobretudo', c1: '#8a8a84' }, hem: 'sobretudo', sleeves: 'long', sleeveColor: '#8a8a84', acc: [] },
  'frentista-antigo': { look: { female: false, skirt: false, shirt: '#86652a', pants: '#3e2c1c', hairStyle: 'short', build: 'lean', skin: '#b4a48c', hair: '#8c8a86', height: 1.97 }, torso: { kind: 'uniforme', c1: '#86652a' }, sleeves: 'short', acc: ['bone'], bone: '#4a3624', hem: 'belt' },
};
const DEFAULT_OUTFIT = { comum: 'polo', recorrente: 'camiseta', inconveniente: 'reclamao', suspeito: 'jaqueta-escura', sobrenatural: 'camiseta' };

// --------------------------------------------------------------------------------------------- painting
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function pen(g) {
  return {
    px: (x, y, c) => { g.fillStyle = css(c); g.fillRect(Math.round(x), Math.round(y), 1, 1); },
    rect: (x, y, w, h, c) => { g.fillStyle = css(c); g.fillRect(x, y, w, h); },
  };
}

/** Chest of a garment, 64x64: u around (figure front at x = 32, back at the edges), v = 1 at the shoulders (row 0). */
function paintTorso(THREE, T, skin, seed) {
  const [c, g] = canvas(64, 64), { px, rect } = pen(g), r = mulberry32(seed * 131 + 7);
  const c1 = parse(T.c1), c2 = parse(T.c2 ?? T.c1), c3 = parse(T.c3 ?? T.c1), sk = parse(skin);
  const shade = (x) => 0.8 + (1 - Math.abs(x - 32) / 32) * 0.2;
  const base = (col, wob = 0.07) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) px(x, y, mulc(col, shade(x) + (r() - 0.5) * wob)); };
  const fx = Math.abs; // |x - 32|
  switch (T.kind) {
    case 'camiseta': base(c1); for (let x = 25; x < 39; x++) for (let y = 0; y < 3; y++) px(x, y, mulc(c1, 0.68)); break;
    case 'polo':
      base(c1); rect(25, 0, 14, 3, mulc(c1, 1.12)); rect(32, 3, 1, 10, mulc(c1, 0.6));
      px(32, 5, mulc(c1, 1.3)); px(32, 9, mulc(c1, 1.3)); break;
    case 'xadrez':
      base(c1);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const a = x % 6 < 1, b = y % 6 < 1;
        if (a && b) px(x, y, mulc(mixc(c1, c2, 0.55), shade(x) * 0.9)); else if (a || b) px(x, y, mulc(mixc(c1, c2, 0.3), shade(x)));
      }
      rect(24, 0, 16, 3, mulc(c1, 0.7));
      rect(37, 14, 9, 9, mulc(c1, 0.72)); rect(38, 15, 7, 7, mulc(c1, 0.95));
      for (let y = 4; y < 64; y += 10) px(32, y, mulc(c2, 1.2)); break;
    case 'jaleco': {
      base(c1, 0.05);
      for (let y = 0; y < 12; y++) { const w = 6 - y * 0.35; if (w > 0) for (let x = 32 - Math.round(w); x <= 32 + Math.round(w); x++) px(x, y, mulc(c2, shade(x))); }
      for (let y = 0; y < 14; y++) { px(32 - 6 + Math.floor(y * 0.5) - 1, y, mulc(c1, 0.62)); px(32 + 6 - Math.floor(y * 0.5) + 1, y, mulc(c1, 0.62)); }
      rect(32, 10, 1, 54, mulc(c1, 0.6));
      for (const x of [12, 42]) { rect(x, 44, 10, 1, mulc(c1, 0.62)); rect(x, 45, 1, 9, mulc(c1, 0.7)); rect(x + 9, 45, 1, 9, mulc(c1, 0.7)); }
      rect(39, 17, 6, 7, [210, 210, 214]); rect(39, 17, 6, 2, c2); rect(40, 20, 2, 2, [140, 120, 100]);
      rect(46, 36, 1, 4, [160, 40, 40]);                                // a pen in the pocket
      break;
    }
    case 'terno': {
      base(c1, 0.1);
      for (let y = 0; y < 34; y++) { const w = Math.max(0, 7 - y * 0.22); for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) px(x, y, mulc([212, 206, 188], shade(x))); }
      rect(31, 2, 3, 32, c2); rect(30, 1, 5, 3, mulc(c2, 0.75));       // loose tie
      for (let i = 0; i < 28; i++) { px(25 + Math.floor(i * 0.25), 2 + i, mulc(c1, 0.62)); px(39 - Math.floor(i * 0.25), 2 + i, mulc(c1, 0.62)); }
      px(32, 38, mulc(c1, 0.5)); px(32, 46, mulc(c1, 0.5));
      for (const x of [11, 43]) rect(x, 48, 10, 2, mulc(c1, 0.68));
      for (let i = 0; i < 40; i++) px(Math.floor(r() * 64), 8 + Math.floor(r() * 50), mulc(c1, 1.18)); // worn shine
      break;
    }
    case 'jaqueta':
      base(c1, 0.1);
      rect(0, 0, 64, 10, mulc(c2, 0.9)); rect(22, 0, 20, 4, mulc(c1, 0.6));
      for (let y = 4; y < 64; y += 2) px(32, y, [170, 170, 160]);
      rect(0, 26, 64, 3, [196, 196, 176]); rect(0, 46, 64, 3, [196, 196, 176]);   // reflective bands
      for (const x of [14, 44]) rect(x, 52, 8, 1, mulc(c1, 0.55));
      break;
    case 'vestido':
      base(c1, 0.05);
      for (let y = 0; y < 18; y++) { const w = 10 - y * 0.55; for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) if (w > 0) px(x, y, mulc(sk, shade(x))); }
      rect(0, 0, 18, 5, mulc(sk, 0.9)); rect(46, 0, 18, 5, mulc(sk, 0.9));
      for (let i = 0; i < 70; i++) px(Math.floor(r() * 64), 18 + Math.floor(r() * 46), mixc(c1, c2, 0.8));
      break;
    case 'camisa-aberta':
      base(c1, 0.08);
      for (let y = 0; y < 22; y++) { const w = 9 - y * 0.38; if (w > 0) for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) px(x, y, mulc(sk, shade(x))); }
      rect(21, 0, 7, 3, mulc(c1, 1.05)); rect(36, 0, 7, 3, mulc(c1, 1.05));
      for (const y of [26, 36, 46, 56]) px(32, y, mulc(c1, 0.55));
      break;
    case 'bebado':
      base(c1, 0.14);
      for (let y = 0; y < 30; y++) { const w = 9 - y * 0.28; if (w > 0) for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) px(x, y, mulc(sk, shade(x))); }
      for (let y = 0; y < 14; y++) for (let x = 22; x < 36; x++) if ((x - 28) ** 2 + (y - 7) ** 2 < 30) px(x, 30 + y, mulc(c1, 0.66));
      for (let i = 0; i < 24; i++) px(Math.floor(r() * 64), 30 + Math.floor(r() * 30), mulc(c1, 0.8));
      for (const y of [34, 44, 54]) px(32, y, mulc(c1, 0.5)); rect(0, 62, 64, 2, mulc(c1, 0.7));
      break;
    case 'moletom':
      base(c1, 0.1); rect(18, 0, 28, 5, mulc(c1, 0.72));
      rect(16, 38, 32, 1, mulc(c1, 0.6)); rect(16, 38, 1, 20, mulc(c1, 0.6)); rect(47, 38, 1, 20, mulc(c1, 0.6)); rect(32, 38, 1, 20, mulc(c1, 0.66));
      rect(28, 5, 1, 12, [190, 190, 184]); rect(36, 5, 1, 12, [190, 190, 184]); rect(0, 60, 64, 4, mulc(c1, 0.74));
      break;
    case 'uniforme':
      base(c1, 0.1); rect(25, 0, 14, 3, mulc(c1, 0.6)); rect(31, 3, 3, 1, mulc(c1, 0.7));
      for (let y = 6; y < 64; y += 9) px(32, y, mulc(c1, 0.55));
      rect(37, 14, 10, 9, mulc(c1, 0.7)); rect(38, 15, 8, 7, mulc(c1, 1.0)); rect(39, 17, 6, 3, mixc(c1, [228, 200, 130], 0.45)); // worn patch, no letters
      for (let i = 0; i < 20; i++) px(Math.floor(r() * 64), 10 + Math.floor(r() * 50), mulc(c1, 0.82));
      // faded sun emblem between the shoulder blades (back = the edges of the strip): a disc and rays, no face
      for (const cx of [0, 64]) {
        const ec = mixc(c1, [214, 176, 96], 0.6);
        for (let y = 6; y < 44; y++) for (let x = cx - 12; x <= cx + 12; x++) {
          if (x < 0 || x > 63) continue;
          const dx = x - cx, dy = y - 24, d = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx), ray = Math.abs(Math.sin(ang * 4)) > 0.7 && d > 6.5 && d < 12;
          if (d < 6 || ray) px(x, y, mulc(ec, shade(x) * (0.88 + r() * 0.1)));
        }
      }
      break;
    case 'sobretudo':
      base(c1, 0.12); for (let y = 0; y < 30; y++) { px(26 + Math.floor(y * 0.12), y, mulc(c1, 0.62)); px(38 - Math.floor(y * 0.12), y, mulc(c1, 0.62)); }
      rect(23, 0, 18, 4, mulc(c1, 0.72));
      for (let y = 12; y < 64; y += 9) { px(27, y, mulc(c1, 0.5)); px(37, y, mulc(c1, 0.5)); }
      rect(32, 8, 1, 56, mulc(c1, 0.66)); break;
    case 'cardigan':
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (fx(x - 32) < 8 && y > 3) { const dot = r() < 0.16; px(x, y, mulc(dot ? c3 : c2, shade(x))); }
        else px(x, y, mulc(c1, shade(x) * (y % 2 ? 0.94 : 1.02) + (r() - 0.5) * 0.06));
      }
      rect(25, 0, 14, 3, mulc(c2, 0.9)); rect(0, 62, 64, 2, mulc(c1, 0.75)); break;
    default: base(c1);
  }
  return makeTexture(THREE, c);
}

/** What hangs below the waist (coat, dress, jaleco): folds and a hem. 32x32. */
function paintSkirt(THREE, T, seed) {
  const [c, g] = canvas(32, 32), { px, rect } = pen(g), r = mulberry32(seed * 71 + 3);
  const c1 = parse(T.c1);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const fold = x % 5 === 0 ? 0.86 : 1;
    px(x, y, mulc(c1, (0.82 + (1 - Math.abs(x - 16) / 16) * 0.16) * fold + (r() - 0.5) * 0.06));
  }
  if (T.kind === 'vestido') for (let i = 0; i < 40; i++) px(Math.floor(r() * 32), Math.floor(r() * 32), mixc(c1, parse(T.c2), 0.8));
  if (T.kind === 'jaleco') { rect(15, 0, 1, 32, mulc(c1, 0.6)); }
  if (T.kind === 'sobretudo') { rect(15, 0, 1, 32, mulc(c1, 0.55)); }
  rect(0, 29, 32, 3, mulc(c1, 0.7));
  return makeTexture(THREE, c);
}

// --------------------------------------------------------------------------------------------- geometry
/** A lofted tube: rings [{ y, rx, rz, cz }] (any order), front is +z, shifted down by oy. Open at both ends. */
function tube(THREE, rings, { n = 10, oy = 0 } = {}) {
  const rs = [...rings].sort((a, b) => a.y - b.y), y0 = rs[0].y, y1 = rs[rs.length - 1].y;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < rs.length; k++) {
    const q = rs[k];
    for (let i = 0; i <= n; i++) {
      const th = -Math.PI + (2 * Math.PI * i) / n;
      pos.push(Math.sin(th) * q.rx, q.y - oy, (q.cz ?? 0) + Math.cos(th) * q.rz);
      uv.push(i / n, y1 === y0 ? 0 : (q.y - y0) / (y1 - y0));
    }
  }
  const W = n + 1;
  for (let k = 0; k < rs.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// --------------------------------------------------------------------------------------------- the builder
export function buildCustomer(r, specIn = {}, { seed = 1 } = {}) {
  const THREE = r.THREE;
  // named variants (Rafael comes back different): merge them over the base spec
  let spec = { ...specIn };
  if (spec.variante && spec.variantes?.[spec.variante]) {
    const v = spec.variantes[spec.variante];
    spec = { ...spec, ...v, look: { ...(spec.look ?? {}), ...(v.look ?? {}) }, acessorios: v.acessorios ?? spec.acessorios };
  }
  const categoria = CATEGORIAS.includes(spec.categoria) ? spec.categoria : 'comum';
  const roupaName = OUTFITS[spec.roupa] ? spec.roupa : DEFAULT_OUTFIT[categoria];
  const O = OUTFITS[roupaName];
  const faceSeed = (spec.seed ?? seed) | 0 || 1;
  const rng = mulberry32(faceSeed * 48271 + 11);

  // ---- the look: seed -> outfit -> spec
  const base = customerLook(faceSeed);
  const look = { ...base, ...O.look, ...(spec.look ?? {}), seed: faceSeed, outfit: 'civil', glove: 'none' };
  if (O.look?.female === undefined && spec.look?.female === undefined) look.female = customerIdentity(faceSeed).female;
  if (typeof look.height === 'number') look.height = Math.max(1.56, look.height);  // everyone is an adult
  const human = buildHuman(r, look);
  const L = human.look, J = human.joints;

  // ---- dimensions of the body to fit the garments
  const bi = { lean: 0, mid: 1, heavy: 2 }[L.build];
  const fem = L.female ? 0.88 : 1;
  const bw = fem * [0.9, 1.0, 1.2][bi], bd = [0.9, 1.0, 1.25][bi], lm = [0.84, 1.0, 1.28][bi], belly = [0, 0.006, 0.05][bi];
  const pw = L.female ? (bw / 0.88) * 0.98 : bw;
  const skinHex = '#' + L.skin.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const tint = (hex, opts = {}) => r.mat(new THREE.Color(hex), { map: 'cloth', ...opts });
  const flat = (hex, opts = {}) => r.mat(new THREE.Color(hex), opts);
  const add = (geo, mat, joint, [x, y, z] = [0, 0, 0], rot) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); joint.add(m); return m;
  };
  const absY = { hips: 0.94, spine: 1.03, neck: 1.47, head: 1.54, shoulder: 1.41, elbow: 1.15, wrist: 0.90 };

  // ---- garments
  const T = O.torso;
  if (T) {
    const G = T.kind === 'vestido' ? 1.08 : 1.085, off = 0.006;
    const chest = [
      { y: 1.03, rx: 0.136 * bw, rz: 0.094 * bd + belly }, { y: 1.14, rx: 0.142 * bw, rz: 0.097 * bd + belly * 1.3 },
      { y: 1.27, rx: 0.172 * bw, rz: 0.108 * bd }, { y: 1.38, rx: 0.186 * bw, rz: 0.106 * bd },
      { y: 1.43, rx: 0.170 * bw, rz: 0.090 * bd }, { y: 1.465, rx: 0.075 * bw, rz: 0.062 * bd },
    ];
    const lower = (O.hem === 'jacket' || O.hem === 'jaleco' || O.hem === 'sobretudo' || O.hem === 'bebado' || O.hem === 'belt-solto')
      ? [{ y: 0.90, rx: 0.170 * pw, rz: 0.110 * bd + belly * 0.6 }, { y: 0.97, rx: 0.166 * pw, rz: 0.110 * bd + belly * 0.6 }] : [];
    const rings = [...lower, ...chest].map((q) => ({ ...q, rx: q.rx * G + off, rz: q.rz * G + off }));
    add(tube(THREE, rings, { n: 12, oy: absY.spine }), r.mat(0xffffff, { map: paintTorso(THREE, T, skinHex, faceSeed) }), J.spine);
    // below the waist: a flared shell hung from the hips
    if (O.hem === 'jaleco' || O.hem === 'sobretudo' || O.hem === 'vestido') {
      const long = O.hem === 'sobretudo', dress = O.hem === 'vestido';
      const yb = long ? 0.46 : dress ? 0.52 : 0.62;
      const wide = long ? 1.0 : dress ? 1.05 : 0.9;
      const sk = [
        { y: 0.99, rx: 0.17 * pw * 1.06, rz: 0.115 * bd * 1.06 + belly * 0.6 },
        { y: (0.99 + yb) / 2 + 0.06, rx: (0.2 + (long ? 0.03 : 0)) * pw * wide, rz: (0.15 + (long ? 0.02 : 0)) * bd * wide },
        { y: yb, rx: (0.24 + (dress ? 0.03 : 0)) * pw * wide, rz: (0.19 + (dress ? 0.02 : 0)) * bd * wide },
      ];
      add(tube(THREE, sk, { n: 12, oy: absY.hips }), r.mat(0xffffff, { map: paintSkirt(THREE, T, faceSeed) }), J.hips);
    }
    if (O.hem === 'belt' || O.hem === 'belt-solto') {
      const belt = [{ y: 0.985, rx: 0.17 * pw * 1.02, rz: 0.108 * bd * 1.02 + belly * 0.9 }, { y: 1.015, rx: 0.17 * pw * 1.02, rz: 0.108 * bd * 1.02 + belly * 0.9 }];
      add(tube(THREE, belt, { n: 12, oy: absY.hips }), flat(O.hem === 'belt' ? '#241c14' : '#3a3228'), J.hips);
    }
    // long sleeves: cloth down to the wrist (upper arm on the shoulder, forearm on the elbow)
    if (O.sleeves === 'long') {
      const col = O.sleeveColor ?? T.c1, ua = 0.056 * lm, fa = 0.046 * lm;
      for (const s of ['L', 'R']) {
        add(tube(THREE, [{ y: 1.43, rx: ua * 1.2, rz: ua * 1.2 }, { y: 1.34, rx: ua * 1.26, rz: ua * 1.26 }, { y: 1.17, rx: ua * 1.0, rz: ua * 1.05 }, { y: 1.12, rx: ua * 0.96, rz: ua * 1.0 }], { n: 8, oy: absY.shoulder }), tint(col), J['shoulder' + s]);
        add(tube(THREE, [{ y: 1.19, rx: ua * 1.04, rz: ua * 1.08 }, { y: 1.07, rx: fa * 1.2, rz: fa * 1.2 }, { y: 0.93, rx: fa * 1.06, rz: fa * 1.0 }], { n: 8, oy: absY.elbow }), tint(col), J['elbow' + s]);
        add(tube(THREE, [{ y: 0.935, rx: fa * 1.08, rz: fa * 1.02 }, { y: 0.915, rx: fa * 1.12, rz: fa * 1.06 }], { n: 8, oy: absY.elbow }), tint(hexOf(mulc(parse(col), 0.8))), J['elbow' + s]); // cuff
      }
    }
  }

  // ---- fillers at the elbows (the arm segments are open tubes; a bent elbow would show a gap)
  for (const sd of ['L', 'R']) {
    const colr = O.sleeves === 'long' ? (O.sleeveColor ?? T?.c1 ?? '#808080') : skinHex;
    const sph = new THREE.SphereGeometry(0.056 * lm * 0.98, 6, 4);
    add(sph, O.sleeves === 'long' ? tint(colr) : flat(skinHex), J['elbow' + sd], [0, 0.0, 0]);
  }

  // ---- accessories
  const accs = spec.acessorios ?? O.acc ?? [];
  const held = {};
  const hairHex = '#' + L.hair.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  for (const a of accs) {
    if (a === 'bone' || a === 'bone-visor') {
      const col = spec.bone ?? O.bone ?? '#3d4a3a';
      const dome = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5); dome.scale(0.113, 0.118, 0.118);
      add(dome, tint(col), J.head, [0, 0.104, -0.006]);
      add(new THREE.BoxGeometry(0.16, 0.008, 0.085), tint(col), J.head, [0, 0.100, 0.125], [0.13, 0, 0]);
    } else if (a === 'oculos-escuros') {
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.028, 0.012), flat('#08080a'), J.head, [sx * 0.037, 0.10, 0.106]);
      add(new THREE.BoxGeometry(0.03, 0.006, 0.01), flat('#08080a'), J.head, [0, 0.108, 0.108]);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.006, 0.1), flat('#08080a'), J.head, [sx * 0.074, 0.108, 0.058]);
    } else if (a === 'oculos') {
      const fr = flat('#3a2c20');
      for (const sx of [-1, 1]) {
        const cx = sx * 0.037, cy = 0.10;
        add(new THREE.BoxGeometry(0.052, 0.004, 0.008), fr, J.head, [cx, cy + 0.016, 0.105]); add(new THREE.BoxGeometry(0.052, 0.004, 0.008), fr, J.head, [cx, cy - 0.016, 0.105]);
        add(new THREE.BoxGeometry(0.004, 0.034, 0.008), fr, J.head, [cx - 0.026, cy, 0.105]); add(new THREE.BoxGeometry(0.004, 0.034, 0.008), fr, J.head, [cx + 0.026, cy, 0.105]);
        add(new THREE.BoxGeometry(0.004, 0.004, 0.1), fr, J.head, [sx * 0.074, cy + 0.012, 0.056]);
      }
      add(new THREE.BoxGeometry(0.02, 0.004, 0.008), fr, J.head, [0, 0.11, 0.106]);
    } else if (a === 'coque') {
      add(new THREE.SphereGeometry(0.05, 7, 5), tint(hairHex), J.head, [0, 0.145, -0.105]);
    } else if (a === 'capuz') {
      const hood = new THREE.SphereGeometry(1, 10, 7, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.72); hood.scale(0.128, 0.13, 0.14);
      add(hood, tint(O.look.shirt, { side: THREE.DoubleSide }), J.head, [0, 0.105, -0.016]);
    } else if (a === 'cracha') {
      add(new THREE.BoxGeometry(0.05, 0.065, 0.006), flat('#d6d6da'), J.spine, [0.07, 1.27 - absY.spine, 0.128 * bd + 0.014]);
      add(new THREE.BoxGeometry(0.05, 0.016, 0.007), flat('#3a6a8a'), J.spine, [0.07, 1.292 - absY.spine, 0.128 * bd + 0.016]);
    } else if (a === 'bolsa') {
      // a shoulder bag: the body on the left hip, a strap across the chest
      add(new THREE.BoxGeometry(0.07, 0.15, 0.2), tint('#5a3a2a'), J.spine, [0.235 * bw, 0.99 - absY.spine, 0.0]);
      add(new THREE.BoxGeometry(0.07, 0.03, 0.2), flat('#3a2418'), J.spine, [0.235 * bw, 1.07 - absY.spine, 0.0]);
      add(new THREE.BoxGeometry(0.022, 0.56, 0.006), flat('#3a2418'), J.spine, [0.03, 1.19 - absY.spine, 0.112 * bd + 0.014], [0, 0, 0.68]);
      add(new THREE.BoxGeometry(0.022, 0.56, 0.006), flat('#3a2418'), J.spine, [0.03, 1.19 - absY.spine, -(0.112 * bd + 0.014)], [0, 0, -0.68]);
    } else if (a === 'pasta') {
      add(new THREE.BoxGeometry(0.36, 0.26, 0.07), tint('#3a2a20'), J.wristL, [0, -0.3, 0.02]);
      add(new THREE.BoxGeometry(0.1, 0.012, 0.012), flat('#1c130d'), J.wristL, [0, -0.17, 0.02]);
    } else if (a === 'garrafa') {
      const bot = new THREE.CylinderGeometry(0.034, 0.034, 0.17, 8); add(bot, flat('#4a3a1c'), J.wristL, [0, -0.2, 0.04]);
      add(new THREE.CylinderGeometry(0.014, 0.034, 0.07, 8), flat('#4a3a1c'), J.wristL, [0, -0.32, 0.04]);
    } else if (a === 'capacete-mao') {
      // the helmet hangs from the right hand: shell, dark visor, chin strap; no maker's mark
      const sh = new THREE.SphereGeometry(1, 10, 8); sh.scale(0.118, 0.122, 0.145);
      const g = new THREE.Group(); g.position.set(0.0, -0.33, 0.03); J.wristL.add(g);
      add(sh, flat(spec.capacete ?? '#7a2a22'), g, [0, 0, 0]);
      add(new THREE.BoxGeometry(0.15, 0.05, 0.05), flat('#14161a'), g, [0, 0.01, 0.115], [0.1, 0, 0]);
      add(new THREE.BoxGeometry(0.008, 0.2, 0.008), flat('#1a1a1a'), J.wristL, [0.0, -0.17, 0.03]);
      held.capacete = g;
    } else if (a === 'mochila-entrega') {
      add(new THREE.BoxGeometry(0.34, 0.34, 0.26), tint(spec.mochila ?? '#4a4a3c'), J.spine, [0, 1.25 - absY.spine, -0.2 * bd - 0.12]);
    }
  }
  if (spec.semCapacete) { held.capacete?.parent.remove(held.capacete); }

  // ---- the banknote for the 'pagando' pose
  const note = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.003, 0.075), flat(spec.nota ?? '#b4bc9a'));
  note.position.set(0.0, -0.17, 0.09); note.rotation.set(0.0, 0.4, 0); note.visible = false; J.wristR.add(note);

  // ---- tall and thin: the old attendant
  const fig = human.root;
  if (spec.sobrenatural === 'frentista-antigo') fig.scale.set(0.9, 1, 0.9);
  const root = new THREE.Group(); root.name = 'customer:' + (spec.id ?? roupaName);
  root.add(fig);

  // ---- the dark patch under the feet (the "no shadow" customer has none)
  const castsShadow = spec.castsShadow !== false && spec.sobrenatural !== 'sem-sombra';
  let shadow = null;
  if (castsShadow) {
    const g = new THREE.CircleGeometry(0.34, 10); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.8);
    shadow = new THREE.Mesh(g, r.mat(0x000000, { opacity: 0.5, transparent: true, depthWrite: false, fogged: 1 }));
    shadow.position.y = 0.012; shadow.name = 'shadow'; root.add(shadow);
  }

  // ---- poses
  const all = Object.values(J);
  const manias = new Set(spec.manias ?? O.manias ?? []);
  const state = { pose: 'parado', since: 0 };
  const sw = Math.sin;
  function reset() {
    for (const j of all) j.rotation.set(0, 0, 0);
    fig.rotation.set(0, 0, 0); note.visible = false; J.hips.position.y = hipsY0;
  }
  function rest(t, k = 1) {
    J.shoulderL.rotation.z = 0.07 * k; J.shoulderR.rotation.z = -0.07 * k;
    J.elbowL.rotation.x = -0.12; J.elbowR.rotation.x = -0.12;
    J.spine.rotation.x = sw(t * 1.7) * 0.008 * k;
  }
  const hipsY0 = J.hips.position.y;
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  function setPose(nome, t = 0, o = {}) {
    const p = ALL_POSES.includes(nome) ? nome : 'parado';
    if (p !== state.pose || t < state.since) state.since = t;
    const ts = t - state.since;
    state.pose = p; reset();
    const rigid = manias.has('rigido') || p === 'fixo';
    rest(t, rigid ? 0 : 1);
    if (manias.has('balanco')) { J.hips.rotation.z = sw(t * 0.9) * 0.07; J.spine.rotation.z = -sw(t * 0.9) * 0.1; J.head.rotation.z = sw(t * 0.9 + 1) * 0.1; J.hips.rotation.y = sw(t * 0.5) * 0.12; }
    if (manias.has('cansado')) { J.spine.rotation.x += 0.06; J.head.rotation.x = 0.16; J.neck.rotation.x = 0.06; }
    switch (p) {
      case 'parado':
        J.hips.rotation.z += sw(t * 0.45) * 0.015; J.head.rotation.y += sw(t * 0.37) * 0.08;
        J.hipL.rotation.x = -0.03; J.hipR.rotation.x = 0.03;
        break;
      case 'impaciente': {
        // one hand up to check the wrist, a foot tapping, the head turning to the door
        J.shoulderR.rotation.set(-0.85, 0, -0.1); J.elbowR.rotation.x = -1.65; J.wristR.rotation.x = -0.2;
        J.hipL.rotation.x = -Math.max(0, sw(t * 7)) * 0.2; J.kneeL.rotation.x = Math.max(0, sw(t * 7)) * 0.2;
        J.hips.rotation.z = sw(t * 1.3) * 0.045; J.spine.rotation.z = -sw(t * 1.3) * 0.04;
        J.head.rotation.y = sw(t * 0.8) * 0.5; J.head.rotation.x = 0.05 + Math.max(0, sw(t * 0.8 + 2)) * 0.1;
        J.spine.rotation.x += 0.03 + Math.max(0, sw(t * 0.3)) * 0.02;
        break;
      }
      case 'apontando':
        J.shoulderR.rotation.set(-1.42, 0, -0.14); J.elbowR.rotation.x = -0.1; J.wristR.rotation.x = 0.1;
        J.spine.rotation.x += 0.04; J.spine.rotation.y = -0.1; J.head.rotation.y = 0.1; J.head.rotation.x = -0.02 + sw(t * 2.2) * 0.02;
        break;
      case 'pagando': {
        // the hand comes up from the side and out over the counter (0.55 s), the note held out and nudged now and then
        const k = ease(ts / 0.55), nudge = Math.max(0, sw(ts * 2.3)) * Math.max(0, sw(ts * 0.7)) * 0.08 * k;
        J.shoulderR.rotation.set(-1.0 * k - nudge, 0, -0.12); J.elbowR.rotation.x = -0.12 + (-0.63) * k; J.wristR.rotation.x = -0.1 * k;
        J.spine.rotation.x += 0.05 * k; J.head.rotation.x = 0.1 * k + sw(t * 1.4) * 0.015; J.head.rotation.y = -0.05 * k;
        note.visible = k > 0.25; note.rotation.z = sw(t * 3) * 0.03;
        break;
      }
      case 'pegando': {
        // right arm out toward the shelf (0.45 s), a pause with the fingers closing, then the product is brought to the chest
        const hi = o.altura ?? 0.5, out = ease(ts / 0.45), back = ease((ts - 0.8) / 0.5), k = out * (1 - back);
        const low = Math.max(0, 0.55 - hi) / 0.55;
        J.shoulderR.rotation.set(-(0.55 + 0.95 * hi) * k - 0.5 * back, 0, -0.1 - 0.12 * k);
        J.elbowR.rotation.x = -0.2 - 0.3 * k - 0.9 * back; J.wristR.rotation.x = -0.15 * back;
        J.spine.rotation.x += (0.07 + 0.35 * low) * k; J.head.rotation.x = 0.14 * k + 0.05 * back; J.head.rotation.y = 0.12 * k;
        J.hipL.rotation.x = -0.5 * low * k; J.hipR.rotation.x = -0.5 * low * k; J.kneeL.rotation.x = 0.8 * low * k; J.kneeR.rotation.x = 0.8 * low * k;
        J.hips.position.y = hipsY0 - 0.12 * low * k;
        break;
      }
      case 'saindo-carro':
      case 'entrando-carro': {
        // seated at the start (or the end): the thighs forward, the shins down, the hips low; one hand on the frame
        const up = ease(p === 'saindo-carro' ? ts / 0.9 : 1 - ts / 0.9), sit = 1 - up, lean = Math.sin(Math.PI * Math.max(0, Math.min(1, p === 'saindo-carro' ? ts / 0.9 : 1 - ts / 0.9)));
        J.hips.position.y = hipsY0 - 0.42 * sit;
        J.hipL.rotation.x = J.hipR.rotation.x = -1.35 * sit; J.kneeL.rotation.x = J.kneeR.rotation.x = 1.3 * sit;
        J.spine.rotation.x += 0.12 * sit + 0.4 * lean; J.head.rotation.x = 0.1 * lean - 0.05;
        J.shoulderL.rotation.set(-0.9 * lean - 0.2 * sit, 0, 0.1 + 0.15 * lean); J.elbowL.rotation.x = -0.8 * lean - 0.4 * sit;
        J.shoulderR.rotation.set(-0.7 * sit, 0, -0.07); J.elbowR.rotation.x = -0.12 - 0.4 * sit;
        break;
      }
      case 'costas':
        fig.rotation.y = Math.PI;
        J.head.rotation.x = 0.04; J.neck.rotation.x = 0.03;
        break;
      case 'fixo':
        // rigid, hands straight at the sides, the head just a little too high, never blinking or breathing
        J.shoulderL.rotation.z = 0.025; J.shoulderR.rotation.z = -0.025; J.elbowL.rotation.x = -0.02; J.elbowR.rotation.x = -0.02;
        J.head.rotation.x = -0.05; J.head.rotation.y = sw(t * 0.06) * 0.03;
        break;
    }
  }
  setPose('parado', 0);

  // ---- walking: the legs follow the distance the root covered, not the clock
  const SCALE = human.height / 1.75, LEG = 0.9 * SCALE, SWING = 0.4;
  const CYCLE = 4 * LEG * Math.sin(SWING);        // metres per full cycle (two steps) so the planted foot does not slide
  // hip angle over the cycle: a straight line while the foot is on the ground (so it keeps the ground still while the body
  // moves over it) and a soft arc to bring it forward again. u in [-pi/2, 3pi/2): stance first, swing after.
  const swingAngle = (u) => {
    while (u < -Math.PI / 2) u += Math.PI * 2; while (u >= Math.PI * 1.5) u -= Math.PI * 2;
    return u < Math.PI / 2 ? u / (Math.PI / 2) : Math.cos(u - Math.PI / 2);     // -1 .. 1 .. -1
  };
  function gait(phase, k) {
    const s = sw(phase), c = Math.cos(phase), A = SWING * k;
    const hl = swingAngle(phase) * A, hr = swingAngle(phase + Math.PI) * A;
    J.hipL.rotation.x = hl; J.hipR.rotation.x = hr;
    J.kneeL.rotation.x = (Math.max(0, -c) * 0.85 + 0.06) * k; J.kneeR.rotation.x = (Math.max(0, c) * 0.85 + 0.06) * k;
    J.ankleL.rotation.x = -(hl - J.kneeL.rotation.x * 0.4) * 0.55; J.ankleR.rotation.x = -(hr - J.kneeR.rotation.x * 0.4) * 0.55;
    J.shoulderL.rotation.x = -s * A * 0.9; J.shoulderR.rotation.x = s * A * 0.9;
    J.elbowL.rotation.x = -0.14 - Math.max(0, -s) * 0.35 * k; J.elbowR.rotation.x = -0.14 - Math.max(0, s) * 0.35 * k;
    J.hips.rotation.y = s * 0.09 * k; J.spine.rotation.y = -s * 0.07 * k; J.spine.rotation.x += 0.03 * k;
    J.hips.position.y = hipsY0 - Math.abs(c) * 0.018 * SCALE * k + 0.009 * SCALE * k;        // lowest as the feet pass under, up on the strides
    J.head.rotation.y += s * 0.04 * k; J.head.rotation.x += Math.abs(c) * 0.012 * k;
  }
  const norm = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const nj = all.length;
  const anim = { t: null, px: 0, pz: 0, phase: 0, speed: 0, yaw: 0, key: '', last: null, from: null, blendT: -9, k: 1 };
  const capture = () => { const a = new Float32Array(nj * 3 + 4); all.forEach((j, i) => { a[i * 3] = j.rotation.x; a[i * 3 + 1] = j.rotation.y; a[i * 3 + 2] = j.rotation.z; }); a[nj * 3] = fig.rotation.y; a[nj * 3 + 1] = fig.rotation.x; a[nj * 3 + 2] = J.hips.position.y; return a; };
  const apply = (a) => { all.forEach((j, i) => j.rotation.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])); fig.rotation.y = a[nj * 3]; fig.rotation.x = a[nj * 3 + 1]; J.hips.position.y = a[nj * 3 + 2]; };
  function update(t, estado = {}) {
    const dt = anim.t === null ? -1 : t - anim.t, p = root.position;
    const same = dt >= 0 && dt < 1e-5, seq = dt > 1e-5 && dt <= 0.25;
    if (seq) {
      const d = Math.hypot(p.x - anim.px, p.z - anim.pz);
      const v = d / dt;
      if (v < 6) {   // faster than anyone walks: the caller moved the figure (a warp), not the figure walking
        anim.speed += (v - anim.speed) * (1 - Math.exp(-dt * 12));
        anim.phase += (d / CYCLE) * Math.PI * 2;
      }
      const dy = norm(root.rotation.y - anim.yaw);
      anim.yaw = Math.abs(dy) > 2.6 ? root.rotation.y : anim.yaw + dy * (1 - Math.exp(-dt * 14));
    } else if (!same) {
      anim.phase = estado.fase ?? t * 6; anim.speed = estado.andando > 0 ? 1.4 : 0; anim.yaw = root.rotation.y; anim.last = null;
    }
    if (!same) { anim.px = p.x; anim.pz = p.z; anim.t = t; }
    const want = estado.andando > 0;
    const k = want ? Math.max(0, Math.min(1, (anim.speed - 0.08) / 0.5)) * Math.min(1, estado.andando) : 0;
    const walking = want && k > 0.02;
    const pose = estado.pose ?? state.pose;
    setPose(walking ? 'parado' : pose, t, estado);
    if (walking) { gait(seq || same ? anim.phase : (estado.fase ?? anim.phase), k); }
    if (estado.falando) { J.head.rotation.x += sw(t * 9) * 0.03; J.head.rotation.y += sw(t * 5.3) * 0.04; }
    if (typeof estado.olhar === 'number') J.head.rotation.y += estado.olhar;
    // the body trails the heading: the caller turns the root at once, the figure catches up in about 0.2 s
    if (seq || same) { const lag = norm(anim.yaw - root.rotation.y); fig.rotation.y += lag; J.head.rotation.y -= lag * 0.5; J.spine.rotation.y -= lag * 0.25; }
    // a change of pose or of gait blends from what was on screen
    const key = walking ? 'walk' : state.pose;
    const target = capture();
    if (anim.last && key !== anim.key) { anim.from = anim.last; anim.blendT = t; }
    anim.key = key;
    if (anim.from && t - anim.blendT < 0.22 && t >= anim.blendT) {
      const e = ease((t - anim.blendT) / 0.22), out = new Float32Array(target.length);
      for (let i = 0; i < out.length; i++) out[i] = anim.from[i] + (target[i] - anim.from[i]) * e;
      apply(out); anim.last = out;
    } else { anim.from = null; anim.last = target; }
  }

  const idEyes = human.eyeHeight;
  return {
    root, joints: J, height: human.height, eyeHeight: idEyes, castsShadow, shadow, categoria, roupa: roupaName,
    poses: POSES, look: L, seed: faceSeed,
    get pose() { return state.pose; },
    setPose,
    update,
  };
}

/** Face-only helper for the UI: the seed-made name of a customer (same as the CustomerSystem uses). */
export { customerIdentity };
