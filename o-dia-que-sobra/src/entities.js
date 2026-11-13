// The entity types of the game and the one function that builds an entity from its layout line, for a scene
// editor that reads and writes data/scenes/<scene>.json.
//
// NOT the same thing as src/models/entity.js: that file builds the figure of the Sun (the "entity" of the story) and has
// a `buildEntity` of its own. This one is about the objects of a scene: a layout line { id, type, pos, rot, scale, params }.
//
//   ENTITY_TYPES[type] = { label, group, desc, params: { name: { type, default, ... } } }
//     param types: { type: 'enum', options: [...], default } | { type: 'bool', default } |
//                  { type: 'number', min, max, step, default } | { type: 'color', default } | { type: 'text', default }
//   buildEntity(r, kit, entity) -> { id, type, params, area, root, ph, update?, colliders?, interactables?, lights? }
//     kit: { builder?, seed, areaAt(x, z), tintOf(area) }. With `kit.builder` the static parts merge into that shared
//     builder (the game: a few dozen draw calls) and `root` holds only the loose parts; without it the entity gets a
//     builder of its own, flushed into `root` (the editor: one group per entity, so it can be picked and rebuilt alone).
//     `root.userData.entityId` is the id. `ph` is what placeProp returned (the handles of the prop: setOpen, setDisplay...).
//     `rot` is in radians. Props are built turned about y (rot[1]); rot[0], rot[2] and `scale` are honoured too.
import { PROPS, placeProp, hasProp, PRODUTOS, ATRAS } from './models/props.js';
import { buildCar } from './models/car.js';
import { buildMoto } from './models/moto.js';
import { FUEL_KEYS, createBuilder } from './scenes/paint.js';

const E = {
  enum: (options, def) => ({ type: 'enum', options, default: def ?? options[0] }),
  bool: (def = false) => ({ type: 'bool', default: def }),
  number: (min, max, def, step = 0.05) => ({ type: 'number', min, max, step, default: def }),
  color: (def) => ({ type: 'color', default: def }),
  text: (def = '') => ({ type: 'text', default: def }),
};
const AREAS = ['banheiroM', 'banheiroF', 'deposito', 'loja', 'estoque', 'escritorio', 'servico', 'banheiros', 'bombas', 'estacionamento', 'externa'];
const PRODUTO_TIPOS = Object.keys(PRODUTOS);
const ATRAS_TIPOS = ['oleo-motor', 'carregador', 'pilha', 'fita', 'chaveiro', 'palito'];
const rowParams = (n, options, empty = 'auto') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`fileira${i + 1}`, E.enum([empty, ...options], empty)]));
const lampParams = (tipo, cor, alcance) => ({ tipo: E.enum(['fluorescente', 'cobertura', 'mesa'], tipo), cor: E.color(cor), alcance: E.number(1, 20, alcance, 0.5), ligada: E.bool(true), queimada: E.bool(false), pisca: E.bool(false) });

/** What each type that has a rule of the game (or an option of the prop) declares. The rest of the catalog has no params. */
const PARAMS = {
  bomba: { comum: E.bool(true), aditivada: E.bool(true), etanol: E.bool(true), diesel: E.bool(true), travada: E.bool(false) },
  porta: { tipo: E.enum(['madeira', 'metal', 'vidro'], 'madeira'), largura: E.number(0.6, 2.4, 0.95), giro: E.enum(['1', '-1'], '-1'), trancada: E.bool(false), aberta: E.bool(false), visor: E.bool(false), adesivo: E.bool(false) },
  luminaria: lampParams('fluorescente', '#cfe0c4', 8),
  'carro-abandonado': { variante: E.number(1, 9, 1, 1), combustivel: E.enum(['qualquer', ...FUEL_KEYS], 'qualquer'), estilo: E.enum(['auto', 'sedan', 'hatch', 'perua'], 'auto'), vidro: E.enum(['comum', 'escuro'], 'comum') },
  'camera-teto': { area: E.enum(['auto', ...AREAS], 'auto') },
  mancha: { tamanho: E.number(0.3, 3, 0.9), giro: E.number(0, 6.3, 0, 0.1), cor: E.color('#ffffff'), lado: E.enum(['1', '-1'], '1') },
  lixeira: { cheia: E.bool(false) },
  prateleira: { comprimento: E.number(1, 6, 3, 0.1), semente: E.number(0, 99, 0, 1), antigo: E.bool(false), ...rowParams(6, PRODUTO_TIPOS) },
  'prateleira-antiga': { comprimento: E.number(1, 6, 3, 0.1), semente: E.number(0, 99, 0, 1), ...rowParams(6, PRODUTO_TIPOS) },
  'prateleira-parede': { comprimento: E.number(1, 4, 2.4, 0.1), semente: E.number(0, 99, 0, 1), antigo: E.bool(false), ...rowParams(3, PRODUTO_TIPOS) },
  'prateleira-balcao': { comprimento: E.number(1, 3, 1.6, 0.1), ...Object.fromEntries(ATRAS_TIPOS.map((t, i) => [`fileira${i + 1}`, E.enum(ATRAS_TIPOS, t)])) },
  cabine: { largura: E.number(0.8, 1.5, 1.1), profundidade: E.number(1, 2, 1.5), esconderijo: E.bool(false) },
  armario: { esconderijo: E.bool(true) },
  balcao: { comprimento: E.number(1, 8, 5.7, 0.1) },
  cartaz: { largura: E.number(0.4, 3, 1.9), altura: E.number(0.5, 2.6, 1.9) },
  espelho: { largura: E.number(0.3, 1.2, 0.7), altura: E.number(0.4, 1.4, 0.9) },
  geladeira: { semente: E.number(0, 99, 0, 1) },
  produto: { tipo: E.enum([...PRODUTO_TIPOS, ...Object.keys(ATRAS)], 'garrafa'), variante: E.number(0, 5, 0, 1), solto: E.bool(false) },
  'produto-antigo': { tipo: E.enum(PRODUTO_TIPOS, 'garrafa'), variante: E.number(0, 5, 0, 1), solto: E.bool(false) },
  poste: { luz_cor: E.color('#e8c880'), luz_alcance: E.number(1, 30, 13, 0.5) },
  'placa-sol': { luz_cor: E.color('#e8b050'), luz_alcance: E.number(1, 30, 16, 0.5) },
};

/** type -> { label, group, desc, params }: every prop of the catalog (models/props.js PROPS) plus the abandoned car. */
export const ENTITY_TYPES = Object.fromEntries([
  ...Object.entries(PROPS).map(([k, v]) => [k, { label: v.label, group: v.scene, desc: v.desc, params: PARAMS[k] ?? {} }]),
  ['carro-abandonado', { label: 'Carro abandonado', group: 'posto', desc: 'Carro comum parado numa vaga do estacionamento, de pneu murcho, com a cor desbotada e musgo no teto.', params: PARAMS['carro-abandonado'] }],
]);

/** The parameters of a type with the value of each (the layout's, or the default). */
export function resolveParams(type, params = {}) {
  const out = {};
  for (const [k, d] of Object.entries(ENTITY_TYPES[type]?.params ?? {})) out[k] = params[k] ?? d.default;
  return out;
}

// ---- where a lamp's light sits relative to its fixture, by kind
const LAMP_AT = { cobertura: [0, -0.3, 0], fluorescente: [0, -0.14, 0], mesa: [0.15, 0.385, -0.1] };
const LAMP_KIND = { cobertura: 'cobertura', fluorescente: 'fluorescente', mesa: 'mesa' };

// ---- footprints (local x0, z0, x1, z1, height) that block the player; `fixed` = not turned with the entity
const FOOT = {
  bomba: () => [-0.62, -0.3, 0.62, 0.4, 1.85], lixeira: () => [-0.25, -0.25, 0.25, 0.25, 0.9], calibrador: () => [-0.2, -0.2, 0.2, 0.2, 1.1],
  balcao: (p) => [-p.comprimento / 2, -0.35, p.comprimento / 2, 0.35, 1.0],
  prateleira: (p) => [-p.comprimento / 2, -0.3, p.comprimento / 2, 0.3, 1.7], 'prateleira-antiga': (p) => [-p.comprimento / 2, -0.3, p.comprimento / 2, 0.3, 1.7],
  'prateleira-parede': (p) => [-p.comprimento / 2, -0.17, p.comprimento / 2, 0.18, 1.7], 'prateleira-balcao': (p) => [-p.comprimento / 2, -0.17, p.comprimento / 2, 0.18, 1.5],
  cabine: (p) => [-(p.largura / 2 + 0.02), -(p.profundidade / 2), p.largura / 2 + 0.02, p.profundidade / 2, 1.9],
  armario: () => [-0.45, -0.25, 0.45, 0.25, 1.9], cofre: () => [-0.25, -0.3, 0.25, 0.25, 0.5], 'mesa-escritorio': () => [-1.1, -0.4, 1.1, 0.4, 0.8],
  'estante-estoque': () => [-1.25, -0.3, 1.25, 0.3, 2.3], 'quadro-forca': () => [-0.4, 0, 0.4, 0.3, 2.0],
  pia: () => [-0.4, -0.325, 0.4, 0.275, 0.9], geladeira: () => [-0.6, 0, 0.6, 0.8, 2.0],
  conteiner: () => [-1, -0.6, 1, 0.6, 1.4, 'fixed'], poste: () => [-0.2, -0.2, 0.2, 0.2, 7, 'fixed'], 'placa-sol': () => [-0.3, -0.3, 0.3, 0.3, 10, 'fixed'],
};
/** World min/max of a local footprint rect turned by `ry` about (x, z). */
export function fitRect([px, , pz], ry, [x0, z0, x1, z1], h) {
  const c = Math.cos(ry), s = Math.sin(ry);
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const [lx, lz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
    const wx = px + lx * c + lz * s, wz = pz - lx * s + lz * c;
    lo = [Math.min(lo[0], wx), Math.min(lo[1], wz)]; hi = [Math.max(hi[0], wx), Math.max(hi[1], wz)];
  }
  return { min: [lo[0], 0, lo[1]], max: [hi[0], h, hi[1]] };
}

/** The options placeProp (or buildCar) gets for an entity of this type. */
function optsOf(type, e, p, kit) {
  switch (type) {
    case 'bomba': return { n: Number(/(\d+)$/.exec(e.id)?.[1]) || undefined, fuels: FUEL_KEYS.filter((k) => p[k] !== false) };
    case 'porta': return { tipo: p.tipo, w: p.largura, swing: Number(p.giro), id: e.id, visor: p.visor, sticker: p.adesivo };
    case 'luminaria': return { kind: p.tipo };
    case 'cabine': return { id: e.id.replace(/\d+$/, ''), w: p.largura, depth: p.profundidade };
    case 'espelho': return { id: e.id, w: p.largura, h: p.altura };
    case 'mancha': return { id: e.id, size: p.tamanho, rot: p.giro, tint: p.cor };
    case 'geladeira': return { seed: kit.seed + p.semente };
    case 'prateleira': case 'prateleira-antiga': return { seed: kit.seed + p.semente, length: p.comprimento, antigo: p.antigo || type === 'prateleira-antiga' || undefined, rows: rowsOf(p, 6) };
    case 'prateleira-parede': return { seed: kit.seed + p.semente, length: p.comprimento, antigo: p.antigo || undefined, rows: rowsOf(p, 3) };
    case 'prateleira-balcao': return { length: p.comprimento, rows: ATRAS_TIPOS.map((t, i) => p[`fileira${i + 1}`] ?? t) };
    case 'balcao': return { length: p.comprimento };
    case 'cartaz': return { w: p.largura, y: p.altura };
    case 'produto': case 'produto-antigo': return { tipo: p.tipo, variante: p.variante, solto: p.solto || undefined, antigo: type === 'produto-antigo' || undefined };
    default: return {};
  }
}
function rowsOf(p, n) { const r = Array.from({ length: n }, (_, i) => p[`fileira${i + 1}`]); return r.every((v) => !v || v === 'auto') ? undefined : r.map((v) => (v === 'auto' ? undefined : v)); }

/**
 * Build one entity. See the header for the shape of `kit` and of the result.
 * Throws for an unknown type.
 */
export function buildEntity(r, kit, entity) {
  const { id, type } = entity;
  const def = ENTITY_TYPES[type]; if (!def) throw new Error('tipo de entidade desconhecido: ' + type);
  const pos = entity.pos ?? [0, 0, 0], rot = entity.rot ?? [0, 0, 0], scale = entity.scale ?? [1, 1, 1], ry = rot[1] ?? 0;
  const p = resolveParams(type, entity.params);
  let area = p.area && p.area !== 'auto' ? p.area : null;
  if (!area) area = type === 'porta' ? kit.areaAt(pos[0] + (ry ? 0.3 : 0), pos[2] + (ry ? 0 : 0.3)) : kit.areaAt(pos[0], pos[2]);
  const out = { id, type, params: p, area, pos, ry, colliders: [], interactables: [], lights: [] };
  let root;
  if (type === 'carro-abandonado') {
    const car = buildCar(r, { seed: kit.seed * 3 + p.variante, abandoned: true, tint: kit.tintOf(kit.areaAt(pos[0], pos[2])), fuel: p.combustivel === 'qualquer' ? undefined : p.combustivel, style: p.estilo === 'auto' ? undefined : p.estilo, vidro: p.vidro === 'escuro' ? 'escuro' : undefined });
    car.root.position.set(pos[0], pos[1], pos[2]); car.root.rotation.set(rot[0], ry, rot[2]); if (scale.some((v) => v !== 1)) car.root.scale.set(...scale);
    root = car.root; out.ph = car; out.car = car; out.update = car.update;
  } else if (type === 'moto' || type === 'caminhao' || type === 'carro-vidro-escuro') {
    const m = type === 'moto' ? buildMoto(r, { seed: kit.seed }) : buildCar(r, { seed: kit.seed, style: type === 'caminhao' ? 'caminhao' : 'sedan', vidro: type === 'carro-vidro-escuro' ? 'escuro' : undefined });
    m.setLights?.(true); m.setDriver?.(type === 'caminhao'); root = m.root; root.position.set(...pos); root.rotation.set(rot[0], ry, rot[2]); out.ph = m; out.update = m.update;
  } else {
    if (!hasProp(type)) throw new Error('objeto desconhecido: ' + type);
    let ph;
    if (kit.builder) ph = placeProp(kit.builder, type, { pos, ry, area, euler: rot[0] || rot[2] ? rot : null, scale, ...optsOf(type, entity, p, kit) });
    else {
      // alone: built at the origin, flushed into its own group, and the group is then put where the entity is
      const builder = createBuilder(r, { tint: kit.tintOf });
      ph = placeProp(builder, type, { pos: [0, 0, 0], ry: 0, area, ...optsOf(type, entity, p, kit) });
      builder.flush(ph.dyn);
      ph.dyn.position.set(...pos); ph.dyn.rotation.set(rot[0], ry, rot[2]); ph.dyn.scale.set(...scale);
    }
    root = ph.dyn; out.ph = ph; if (ph.update) out.update = (t, st) => ph.update(t, st);
    // lights of lamps, the pole and the sign
    if (type === 'luminaria') {
      const o = LAMP_AT[p.tipo] ?? LAMP_AT.fluorescente;
      out.lights.push({ id, area, kind: LAMP_KIND[p.tipo] ?? 'fluorescente', pos: [pos[0] + o[0], pos[1] + o[1], pos[2] + o[2]], color: p.cor, range: p.alcance, on: p.ligada, level: 1, ...(p.pisca ? { pisca: true } : {}), fixture: ph });
    } else if (type === 'poste') out.lights.push({ id: 'poste', area, kind: 'poste', pos: [pos[0] + 1.2, 6.9, pos[2]], color: p.luz_cor, range: p.luz_alcance, on: true, level: 1, fixture: ph });
    else if (type === 'placa-sol') out.lights.push({ id: 'placa', area: 'externa', kind: 'placa', pos: [pos[0], 8.0, pos[2] + 2.5], color: p.luz_cor, range: p.luz_alcance, on: true, level: 1 });
    const hit = root.children.find((m) => m.userData?.interactId);
    if (hit) out.interactables.push({ id: hit.userData.interactId, kind: hit.userData.kind ?? type, object3D: hit });
    const f = FOOT[type];
    if (f) { const [x0, z0, x1, z1, h, fixed] = f(p); out.colliders.push({ ...fitRect(pos, fixed ? 0 : ry, [x0, z0, x1, z1], h) }); }
  }
  root.userData.entityId = id;
  out.root = root;
  return out;
}
