// The engine's scene layout (docs/engine.md): data/scenes/<scene>.json, one line per entity. Pure functions,
// no DOM and no three: the game reads a layout with them, and the scene editor checks and writes one with
// the same code, so both agree on what a layout is.

const ID = /^[A-Za-z0-9][\w-]{0,79}$/;
const VEC = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

const vec = (v, what, fallback) => {
  if (v === undefined && fallback) return fallback;
  if (!VEC(v)) throw new Error(`${what} must be three numbers`);
  return [v[0], v[1], v[2]];
};

/** A value the game's JSON can hold: a number, text, true/false, null, or lists and maps of them. */
export function plain(v, depth = 0) {
  if (depth > 6) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => plain(x, depth + 1));
  if (typeof v === 'object') return Object.values(v).every((x) => plain(x, depth + 1));
  return false;
}

/**
 * Checks a layout; throws with the reason. Each entity gets rot [0, 0, 0], scale [1, 1, 1], params {} when
 * missing; `components` (when there) must be a map of plain values; unknown fields are kept as they are.
 */
export function readLayout(raw, scene) {
  if (!raw || typeof raw !== 'object') throw new Error('the layout must be an object');
  if (scene !== undefined && raw.scene !== scene) throw new Error(`the layout is of scene "${raw.scene}", not "${scene}"`);
  if (!Array.isArray(raw.entities)) throw new Error('entities must be a list');
  const seen = new Set();
  const entities = raw.entities.map((e, i) => {
    if (!e || typeof e !== 'object') throw new Error(`entity ${i} is not an object`);
    if (typeof e.id !== 'string' || !ID.test(e.id)) throw new Error(`entity ${i}: id must be letters, digits, - or _`);
    if (seen.has(e.id)) throw new Error(`two entities are called "${e.id}"`);
    seen.add(e.id);
    if (typeof e.type !== 'string' || !e.type.trim()) throw new Error(`${e.id}: type is missing`);
    const params = e.params ?? {};
    if (typeof params !== 'object' || Array.isArray(params) || !plain(params)) throw new Error(`${e.id}: params must be a map of plain values`);
    if (e.components !== undefined && (typeof e.components !== 'object' || Array.isArray(e.components) || !plain(e.components))) throw new Error(`${e.id}: components must be a map of plain values`);
    const { id, type, pos, rot, scale, params: _p, ...extra } = e;
    return { id, type, pos: vec(pos, `${id}.pos`), rot: vec(rot, `${id}.rot`, [0, 0, 0]), scale: vec(scale, `${id}.scale`, [1, 1, 1]), params, ...extra };
  });
  const { scene: s, version, entities: _e, ...rest } = raw;
  return { scene: s, version: Number.isInteger(version) ? version : 1, ...rest, entities };
}

/** JSON with the keys of every object in order: two values that differ only in key order are the same. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}

/** What changed between two layouts, by entity id: added, removed, and the fields of each changed one. */
export function diffLayouts(before, after) {
  const old = new Map((before?.entities ?? []).map((e) => [e.id, e]));
  const now = new Map(after.entities.map((e) => [e.id, e]));
  const added = [...now.keys()].filter((id) => !old.has(id));
  const removed = [...old.keys()].filter((id) => !now.has(id));
  const changed = [];
  for (const [id, e] of now) {
    const b = old.get(id);
    if (!b) continue;
    const fields = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(e)])) if (canon(b[k]) !== canon(e[k])) fields[k] = [b[k], e[k]];
    if (Object.keys(fields).length) changed.push({ id, fields });
  }
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length };
}

/**
 * The file as the editor writes it, so each save changes only the lines it should: the top keys two
 * spaces in, one entity per line in compact JSON (id, type, pos, rot, scale, params, components, the rest).
 */
export function formatLayout(l) {
  const top = Object.entries(l).filter(([k]) => k !== 'entities').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const ents = l.entities.map((e) => {
    const { id, type, pos, rot, scale, params, components, ...rest } = e;
    return `    ${JSON.stringify({ id, type, pos, rot, scale, params, ...(components !== undefined ? { components } : {}), ...rest })}`;
  });
  const list = ents.length ? `[\n${ents.join(',\n')}\n  ]` : '[]';
  return `{\n${[...top, `  "entities": ${list}`].join(',\n')}\n}\n`;
}

// ---- entity types: what a game declares ----------------------------------------------------------

const PARAM_TYPES = {
  enum: (d) => Array.isArray(d.options) && d.options.length > 0 && d.options.includes(d.default),
  bool: (d) => typeof d.default === 'boolean',
  number: (d) => typeof d.default === 'number' && (d.min === undefined || d.default >= d.min) && (d.max === undefined || d.default <= d.max),
  color: (d) => typeof d.default === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(d.default),
  text: (d) => typeof d.default === 'string',
};

/**
 * A game's entity types, checked: each { label, group?, desc?, params: { name: { type, default, ... } } }
 * with a param type the editor knows (enum with options, bool, number with min/max/step, color, text).
 * Throws on the first wrong one, so a mistake shows when the game loads, not in the editor.
 */
export function defineTypes(types) {
  for (const [t, def] of Object.entries(types)) {
    if (!def || typeof def.label !== 'string') throw new Error(`entity type ${t}: label is missing`);
    for (const [k, d] of Object.entries(def.params ?? {})) {
      const ok = PARAM_TYPES[d?.type];
      if (!ok) throw new Error(`${t}.${k}: unknown param type ${d?.type}`);
      if (!ok(d)) throw new Error(`${t}.${k}: the default does not fit a ${d.type}`);
    }
  }
  return types;
}

/** The parameters of a type with the value of each: the layout's, or the default. */
export function resolveParams(types, type, params = {}) {
  const out = {};
  for (const [k, d] of Object.entries(types[type]?.params ?? {})) out[k] = params[k] ?? d.default;
  return out;
}

/** What is wrong with an entity against the game's types, as sentences (empty when nothing). */
export function checkEntity(types, e) {
  const def = types[e.type];
  if (!def) return [`${e.id}: unknown type ${e.type}`];
  const out = [];
  for (const [k, v] of Object.entries(e.params ?? {})) {
    const d = def.params?.[k];
    if (!d) { out.push(`${e.id}: ${e.type} has no param ${k}`); continue; }
    if (d.type === 'enum' && !d.options.includes(v)) out.push(`${e.id}.${k}: ${JSON.stringify(v)} is not one of ${d.options.join(', ')}`);
    if (d.type === 'bool' && typeof v !== 'boolean') out.push(`${e.id}.${k}: must be true or false`);
    if (d.type === 'number' && (typeof v !== 'number' || (d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))) out.push(`${e.id}.${k}: must be a number from ${d.min ?? '-∞'} to ${d.max ?? '∞'}`);
    if (d.type === 'color' && !(typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v))) out.push(`${e.id}.${k}: must be a color #rrggbb`);
    if (d.type === 'text' && typeof v !== 'string') out.push(`${e.id}.${k}: must be text`);
  }
  return out;
}

/**
 * The changes made from `base` to `mine` carried onto `disk` (the layout as it is now on disk, changed by
 * someone else meanwhile): only what was changed moves, what the other side added or changed stays. Values
 * are compared by content (key order does not count), and `params` and `components` key by key, so a change
 * to one param and another side's change to a different one both stay. What both sides changed differently
 * is a conflict, kept as on disk unless `prefer` is 'mine'.
 * Returns { layout, conflicts: [{ id, field, mine, disk }] } (field '*' for a whole entity, 'params.cor' for a key).
 */
export function rebaseLayout(base, mine, disk, prefer = 'disk') {
  const b = new Map(base.entities.map((e) => [e.id, e]));
  const m = new Map(mine.entities.map((e) => [e.id, e]));
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const out = disk.entities.map(copy);
  const at = (id) => out.findIndex((e) => e.id === id);
  const same = (x, y) => canon(x) === canon(y);
  const conflicts = [];
  const conflict = (id, field, mineV, diskV, take) => { conflicts.push({ id, field, mine: mineV ?? null, disk: diskV ?? null }); if (prefer === 'mine') take(); };
  const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  // added here
  for (const [id, e] of m) {
    if (b.has(id)) continue;
    const i = at(id);
    if (i < 0) out.push(copy(e));
    else if (!same(out[i], e)) conflict(id, '*', e, out[i], () => { out[at(id)] = copy(e); });
  }
  // removed here
  for (const [id, e] of b) {
    if (m.has(id)) continue;
    const i = at(id);
    if (i < 0) continue;
    if (same(out[i], e)) out.splice(i, 1);
    else conflict(id, '*', null, out[i], () => { out.splice(at(id), 1); });
  }
  // changed here, field by field (and key by key inside params and components)
  for (const [id, e] of m) {
    const was = b.get(id);
    if (!was || same(was, e)) continue;
    if (at(id) < 0) { conflict(id, '*', e, null, () => { out.push(copy(e)); }); continue; }
    const target = () => out[at(id)];
    for (const k of new Set([...Object.keys(was), ...Object.keys(e)])) {
      if (same(was[k], e[k])) continue;
      const d = target()[k];
      const set = (obj, key, v) => { if (v === undefined) delete obj[key]; else obj[key] = copy(v); };
      if ((k === 'params' || k === 'components') && isMap(was[k] ?? {}) && isMap(e[k] ?? {}) && isMap(d ?? {})) {
        const wk = was[k] ?? {}, ek = e[k] ?? {};
        for (const sk of new Set([...Object.keys(wk), ...Object.keys(ek)])) {
          if (same(wk[sk], ek[sk])) continue;
          const dv = (target()[k] ?? {})[sk];
          const put = () => { const t = target(); t[k] = t[k] ?? {}; set(t[k], sk, ek[sk]); if (k === 'components' && !Object.keys(t[k]).length) delete t[k]; };
          if (same(dv, wk[sk])) put();
          else if (!same(dv, ek[sk])) conflict(id, `${k}.${sk}`, ek[sk], dv, put);
        }
        continue;
      }
      const put = () => set(target(), k, e[k]);
      if (same(d, was[k])) put();
      else if (!same(d, e[k])) conflict(id, k, e[k], d, put);
    }
  }
  return { layout: { ...disk, entities: out }, conflicts };
}
