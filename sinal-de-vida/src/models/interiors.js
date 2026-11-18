// The inside of the shops and buildings of the street (type `loja`): what stands in them and where, from a seed.
// `lojaPlan` is a pure function of (kind, size, seed): the object `loja` draws from it, and the street's layout can read the
// same plan to know where the hiding places are, so the layout is the one source of truth.
// Local frame of a building: x in [-w/2, w/2], z in [-d/2, d/2]; the front (the door, on the street) is +Z. No text.
import { mulberry32 } from '../../vendor/engine/rng.js';

export const INTERIORS = ['farmacia', 'mercado', 'comida', 'oficina', 'deposito', 'saguao'];
export const DOOR = { x: 0, w: 2.2 };
/** The picture on the sign of each kind. */
export const SIGN = { farmacia: 'farmacia', mercado: 'caixa', comida: 'comida', oficina: 'chave', deposito: 'entrega', saguao: 'nenhum' };

/**
 * A plan: { props: [{ t, x, z, rot, w, d, h, ... }], boxes: [{ x, z, w, d }] (what blocks the way, local, centre and size),
 * spots: [{ x, z, kind }] (where a sack of things lies), hides: [{ x, z, radius }] }.
 */
export function lojaPlan(kind, w, d, seed = 1) {
  const r = mulberry32(seed * 6151 + 29), pick = (l) => l[Math.floor(r() * l.length)], rr = (a, b) => a + r() * (b - a);
  const props = [], boxes = [], spots = [], hides = [];
  const hw = w / 2 - 0.35, hd = d / 2 - 0.35;
  const Q = Math.PI / 2;
  const add = (p, block = true) => {
    props.push(p);
    if (block) { const c = Math.abs(Math.cos(p.rot)), s = Math.abs(Math.sin(p.rot)); boxes.push({ x: p.x, z: p.z, w: p.w * c + p.d * s, d: p.w * s + p.d * c }); }
    return p;
  };
  const clearDoor = (x, z, pw, pd) => Math.abs(x) - pw / 2 < 1.4 && z + pd / 2 > d / 2 - 3.6; // keeps the way in from the door free
  const shelfRow = (x0, x1, z, rot, items, face) => { for (let x = x0 + 0.7; x <= x1 - 0.7; x += 1.45) if (!clearDoor(x, z, 1.3, 0.5) || z < d / 2 - 3.6) add({ t: 'shelf', x, z, rot, w: 1.3, d: 0.5, h: 1.9, items, face }); };

  if (kind === 'farmacia') {
    add({ t: 'counter', x: 0, z: -hd + 1.3, rot: 0, w: Math.min(6, w - 3), d: 0.8, h: 1.05, reg: true });
    shelfRow(-hw, hw, -hd + 0.3, 0, 'frascos', 1);
    for (const s of [-1, 1]) for (let z = -hd + 3.2; z < hd - 4; z += 1.45) add({ t: 'shelf', x: s * (hw - 0.3), z, rot: Q, w: 1.3, d: 0.5, h: 1.9, items: 'frascos', face: -s });
    add({ t: 'fridge', x: hw - 0.5, z: -hd + 1.0, rot: 0, w: 0.9, d: 0.7, h: 1.9 });
    add({ t: 'plate', x: 0, z: -d / 2 + 0.2, rot: 0, w: 1.1, d: 0.02, h: 1.1, picto: 'farmacia' }, false);
    add({ t: 'bench', x: -hw + 1.5, z: hd - 2.6, rot: 0, w: 2.0, d: 0.5, h: 0.45 });
  } else if (kind === 'mercado') {
    const rows = Math.max(2, Math.floor((w - 5) / 3));
    for (let i = 0; i < rows; i++) { const x = -((rows - 1) * 3) / 2 + i * 3; for (let z = -hd + 1.0; z < hd - 5; z += 1.45) add({ t: 'shelf', x, z, rot: Q, w: 1.3, d: 0.6, h: 1.7, items: pick(['latas', 'latas', 'caixas']), face: 0, double: true }); }
    add({ t: 'counter', x: hw - 1.6, z: hd - 3.2, rot: 0, w: 2.2, d: 0.8, h: 1.0, reg: true });
    add({ t: 'counter', x: -hw + 1.6, z: hd - 3.2, rot: 0, w: 2.2, d: 0.8, h: 1.0, reg: true });
    add({ t: 'fridge', x: -hw + 0.5, z: -hd + 0.5, rot: 0, w: 1.0, d: 0.7, h: 1.9 });
    add({ t: 'fridge', x: -hw + 1.7, z: -hd + 0.5, rot: 0, w: 1.0, d: 0.7, h: 1.9 });
    for (let i = 0; i < 3; i++) add({ t: 'basket', x: pick([-1, 1]) * rr(2, 3.4), z: rr(hd - 2.2, hd - 0.8), rot: r() * 3, w: 0.5, d: 0.35, h: 0.3 }, false);
  } else if (kind === 'comida') {
    add({ t: 'counter', x: 0, z: -hd + 2.0, rot: 0, w: Math.min(7, w - 3), d: 0.9, h: 1.05, reg: true });
    add({ t: 'stove', x: -1.5, z: -hd + 0.5, rot: 0, w: 2.4, d: 0.8, h: 1.0 });
    add({ t: 'fridge', x: 1.4, z: -hd + 0.45, rot: 0, w: 0.9, d: 0.7, h: 1.9 });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const x = s * (2.4 + i * 2.4); if (Math.abs(x) < hw - 0.6) add({ t: 'table', x, z: hd - 3.0 - (i % 2) * 0.6, rot: 0, w: 1.2, d: 0.8, h: 0.75 }); }
    for (let i = 0; i < 4; i++) { const x = -2.7 + i * 1.8; if (Math.abs(x) < hw - 0.6) add({ t: 'stool', x, z: -hd + 3.0, rot: 0, w: 0.35, d: 0.35, h: 0.6 }, false); }
    add({ t: 'plate', x: 3, z: -d / 2 + 0.2, rot: 0, w: 0.9, d: 0.02, h: 0.9, picto: 'comida' }, false);
  } else if (kind === 'oficina') {
    add({ t: 'bench', x: -hw + 1.2, z: -hd + 0.7, rot: 0, w: 2.6, d: 0.8, h: 0.95, vise: true });
    add({ t: 'bench', x: hw - 1.6, z: 0.4, rot: Q, w: 3.0, d: 0.8, h: 0.95 });
    for (let z = -hd + 1; z < 1; z += 1.45) add({ t: 'shelf', x: -hw + 0.3, z, rot: Q, w: 1.3, d: 0.5, h: 2.0, items: 'pecas', face: 1 });
    for (let i = 0; i < 8; i++) add({ t: 'barrel', x: rr(-hw + 1, hw - 1), z: rr(-hd + 1.5, hd - 5), rot: 0, w: 0.6, d: 0.6, h: 0.9, color: pick(['#4a5a6a', '#6a4a3a', '#5a6a4a']) });
    add({ t: 'pallet', x: hw - 1.8, z: -hd + 1.4, rot: 0, w: 1.4, d: 1.2, h: 0.9, items: 'caixas' });
    add({ t: 'plate', x: -3, z: -d / 2 + 0.2, rot: 0, w: 0.9, d: 0.02, h: 0.9, picto: 'chave' }, false);
  } else if (kind === 'deposito') {
    for (let i = 0; i < 8 + Math.floor(r() * 4); i++) { const x = rr(-hw + 1, hw - 1), z = rr(-hd + 1, hd - 5); if (Math.abs(x) > 1.4 || z < d / 2 - 5) add({ t: 'crates', x, z, rot: r() * 0.5 - 0.25, w: 1.1, d: 1.0, h: 0.7 + Math.floor(r() * 3) * 0.7 }); }
    for (let z = -hd + 1; z < hd - 5; z += 1.45) add({ t: 'shelf', x: hw - 0.3, z, rot: Q, w: 1.3, d: 0.5, h: 2.2, items: 'caixas', face: -1 });
    add({ t: 'pallet', x: -hw + 1.5, z: hd - 2.2, rot: 0, w: 1.4, d: 1.2, h: 0.8, items: 'caixas' });
    add({ t: 'plate', x: 3, z: -d / 2 + 0.2, rot: 0, w: 0.9, d: 0.02, h: 0.9, picto: 'entrega' }, false);
  } else { // saguao: an apartment lobby, with the mailboxes, a sofa, the foot of the stairs
    for (let i = 0; i < 6; i++) add({ t: 'mail', x: -hw + 0.6 + i * 0.7, z: -d / 2 + 0.2, rot: 0, w: 0.6, d: 0.2, h: 0.7 + (i % 2) * 0.1 }, false);
    boxes.push({ x: 0, z: -d / 2 + 0.45, w: w - 0.7, d: 0.4 });
    add({ t: 'stairs', x: hw - 1.5, z: -hd + 2.2, rot: 0, w: 2.6, d: 4.0, h: 2.0 });
    add({ t: 'sofa', x: -hw + 1.3, z: hd - 3.2, rot: Q, w: 2.0, d: 0.9, h: 0.8 });
    add({ t: 'bench', x: -1.2, z: -hd + 1.6, rot: 0, w: 1.8, d: 0.5, h: 0.45 });
    add({ t: 'plant', x: hw - 0.6, z: hd - 0.7, rot: 0, w: 0.5, d: 0.5, h: 1.0 });
  }
  // the clutter on the floor (never blocks): spilled things, dust, a fallen box
  const clutter = [];
  for (let i = 0; i < 24 + Math.floor(w); i++) {
    const x = rr(-hw, hw), z = rr(-hd, hd);
    if (boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.1 && Math.abs(z - b.z) < b.d / 2 + 0.1)) continue;
    clutter.push({ x, z, s: rr(0.15, 0.6), rot: r() * 3, c: pick(['#5a4a3a', '#6a6a66', '#3a3a38', '#8a7a52', '#4a5a4a', '#7a5a4a']), h: r() < 0.4 ? rr(0.04, 0.2) : 0.01 });
  }
  // the sacks of things: on some of what blocks (the counters, the shelves, the crates) or on the floor in a corner
  const cand = props.filter((p) => ['counter', 'shelf', 'crates', 'bench', 'pallet', 'table', 'sofa'].includes(p.t));
  const nSpots = 2 + Math.floor(r() * 2) + (w * d > 220 ? 1 : 0);
  for (let i = 0; i < nSpots && cand.length; i++) {
    const p = cand.splice(Math.floor(r() * cand.length), 1)[0];
    spots.push({ x: p.x, z: p.z, y: p.h, kind: p.t });
  }
  // a hiding place behind the counter or among the crates
  const hp = props.find((p) => p.t === 'counter' || p.t === 'crates' || p.t === 'stairs');
  if (hp) hides.push({ x: hp.x, z: hp.z - 0.7, radius: 1.3 });
  return { props, boxes, spots, hides, clutter };
}
