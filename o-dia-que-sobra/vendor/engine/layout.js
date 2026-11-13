// The engine's scene layout (docs/engine.md): data/scenes/<scene>.json, one line per entity. Pure functions,
// no DOM and no three: the game reads a layout with them, and the scene editor checks and writes one with
// the same code, so both agree on what a layout is.

const ID = /^[A-Za-z0-9][\w-]{0,79}$/;
/** A key a map has of its own: a name from the data like "constructor" is never a name of Object. */
const own = (o, k) => (o && typeof k === 'string' && Object.hasOwn(o, k) ? o[k] : undefined);
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
  // The scene's look (looks.js): its id and the params that differ from the look's defaults.
  if (rest.look !== undefined) {
    const l = rest.look;
    if (!l || typeof l !== 'object' || Array.isArray(l) || typeof l.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(l.id)) throw new Error('look must be { id, params }');
    if (l.params !== undefined && (typeof l.params !== 'object' || Array.isArray(l.params) || !plain(l.params))) throw new Error('look.params must be a map of plain values');
  }
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
  // The scene's own keys (its look, say): what changed among them.
  const top = {};
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
    if (k === 'entities') continue;
    if (canon(before?.[k]) !== canon(after[k])) top[k] = [before?.[k], after[k]];
  }
  return { added, removed, changed, top, same: !added.length && !removed.length && !changed.length && !Object.keys(top).length };
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
  for (const [k, d] of Object.entries(own(types, type)?.params ?? {})) out[k] = own(params, k) ?? d.default;
  return out;
}

/**
 * What is wrong with an entity against the game's types, as sentences (empty when nothing). With `ctx`
 * ({ sounds, ids, types: the same types, lines }), its components are checked too (checkComponents).
 */
export function checkEntity(types, e, ctx) {
  const def = own(types, e.type);
  if (!def) return [`${e.id}: unknown type ${e.type}`];
  const out = e.components !== undefined ? checkComponents(e, { ...ctx, types }) : [];
  for (const [k, v] of Object.entries(e.params ?? {})) {
    const d = own(def.params, k);
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
  // The scene's own keys (its look): what the draft changed goes along, unless the disk changed it otherwise.
  const top = { ...disk };
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine)])) {
    if (k === 'entities' || same(base[k], mine[k])) continue;
    const put = () => { if (mine[k] === undefined) delete top[k]; else top[k] = copy(mine[k]); };
    if (same(disk[k], base[k])) put();
    else if (!same(disk[k], mine[k])) conflict('(cenário)', k, mine[k], disk[k], put);
  }
  return { layout: { ...top, entities: out }, conflicts };
}

// ---- components: what any entity can have, declared by the engine ---------------------------------
//
// An entity line may carry `components`: { sound, particles, interaction }. The engine declares their fields
// here, with the same kinds of value as an entity's params plus a few of its own, so the editor builds
// their inspectors the same way and the game, the editor and the service check them with the same code.
// Like params, a component keeps only what differs from the defaults.
//   field kinds: enum, bool, number, color, text (as params), and
//     vec3: three numbers · sound: a name of the game's sound catalog · entity: an entity id, or 'self' ·
//     value: a plain value (number, text, true or false), checked against the param it is set to.

const f = {
  enum: (label, options, def) => ({ type: 'enum', label, options, default: def ?? options[0] }),
  bool: (label, def) => ({ type: 'bool', label, default: def }),
  number: (label, min, max, def, step = 0.05) => ({ type: 'number', label, min, max, step, default: def }),
  color: (label, def) => ({ type: 'color', label, default: def }),
  text: (label, def = '') => ({ type: 'text', label, default: def }),
  vec3: (label, def) => ({ type: 'vec3', label, default: def }),
  sound: (label) => ({ type: 'sound', label, default: '' }),
  entity: (label) => ({ type: 'entity', label, default: 'self' }),
  value: (label) => ({ type: 'value', label, default: '' }),
};

export const COMPONENTS = {
  sound: {
    label: 'Fonte de som',
    desc: 'Um som do catálogo do jogo tocando no lugar da entidade, mais baixo com a distância até sumir no alcance.',
    fields: {
      name: f.sound('Som'),
      on: f.bool('Ligada', true),
      loop: f.bool('Em laço', true),
      gain: f.number('Volume', 0, 2, 1),
      radius: f.number('Alcance (m)', 0.5, 60, 8, 0.5),
      delay: f.number('Atraso (s)', 0, 60, 0, 0.1),
      offset: f.vec3('Deslocamento', [0, 0, 0]),
    },
  },
  particles: {
    label: 'Partículas',
    desc: 'Um emissor de partículas quadradas, função do tempo do jogo: o modo filmagem filma igual.',
    fields: {
      on: f.bool('Ligado', true),
      shape: f.enum('Forma', ['cone', 'ponto', 'caixa'], 'cone'),
      rate: f.number('Por segundo', 0, 200, 12, 1),
      life: f.number('Vida (s)', 0.1, 10, 1.2, 0.1),
      speed: f.number('Velocidade (m/s)', 0, 20, 0.6),
      spread: f.number('Abertura (°)', 0, 180, 20, 1),
      gravity: f.number('Gravidade (m/s², + sobe)', -20, 20, 0, 0.1),
      dir: f.vec3('Direção', [0, 1, 0]),
      area: f.vec3('Tamanho da caixa (m)', [0.5, 0.5, 0.5]),
      offset: f.vec3('Deslocamento', [0, 0, 0]),
      colorStart: f.color('Cor no começo', '#d0d0d0'),
      colorEnd: f.color('Cor no fim', '#404040'),
      alphaStart: f.number('Opacidade no começo', 0, 1, 1),
      alphaEnd: f.number('Opacidade no fim', 0, 1, 0),
      sizeStart: f.number('Tamanho no começo (m)', 0.005, 2, 0.08, 0.005),
      sizeEnd: f.number('Tamanho no fim (m)', 0.005, 2, 0.08, 0.005),
      seed: f.number('Semente', 0, 9999, 0, 1),
    },
  },
  shader: {
    label: 'Shader',
    desc: 'Um shader da biblioteca nas superfícies da entidade (água, vidro sujo, tela com chiado), dentro do visual do jogo.',
    fields: {
      name: { type: 'shader', label: 'Shader', default: '' },
      params: { type: 'shaderParams', label: 'Parâmetros do shader', default: {} },
    },
  },
  interaction: {
    label: 'Interação',
    desc: 'Um gatilho e as ações que ele dispara, em sequência. Uma entidade pode ter várias.',
    list: true,
    fields: {
      trigger: f.enum('Gatilho', ['use', 'enter', 'leave', 'look', 'time', 'event'], 'use'),
      label: f.text('Texto para o jogador'),
      radius: f.number('Distância (m)', 0.2, 30, 2, 0.1),
      hour: f.number('Hora do jogo', 0, 24, 0, 0.25),
      event: f.text('Evento'),
      once: f.bool('Só uma vez', false),
    },
    /** Which fields each trigger reads (the editor shows only those). */
    uses: { use: ['label', 'radius'], enter: ['radius'], leave: ['radius'], look: ['label', 'radius'], time: ['hour'], event: ['event'] },
    actions: {
      sound: { label: 'Tocar som', fields: { name: f.sound('Som'), gain: f.number('Volume', 0, 2, 1) } },
      toggle: { label: 'Alternar parâmetro', fields: { target: f.entity('Entidade'), param: f.text('Parâmetro (sim/não)') } },
      set: { label: 'Mudar parâmetro', fields: { target: f.entity('Entidade'), param: f.text('Parâmetro'), value: f.value('Valor') } },
      particles: { label: 'Ligar ou desligar partículas', fields: { target: f.entity('Entidade'), on: f.bool('Ligar', true) } },
      source: { label: 'Ligar ou desligar fonte de som', fields: { target: f.entity('Entidade'), on: f.bool('Ligar', true) } },
      event: { label: 'Disparar evento', fields: { name: f.text('Evento') } },
      say: { label: 'Fala', fields: { text: f.text('Texto') } },
      wait: { label: 'Esperar', fields: { seconds: f.number('Segundos', 0, 60, 1, 0.1) } },
    },
  },
};

export const TRIGGER_LABELS = { use: 'usar', enter: 'entrar na área', leave: 'sair da área', look: 'olhar', time: 'hora do jogo', event: 'evento' };

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-f]{6}$/i;

/** What is wrong with one field value, or null. ctx: { sounds, ids }. */
function fieldProblem(d, v, ctx = {}) {
  switch (d.type) {
    case 'enum': return d.options.includes(v) ? null : `must be one of ${d.options.join(', ')}`;
    case 'bool': return typeof v === 'boolean' ? null : 'must be true or false';
    case 'number': return typeof v === 'number' && Number.isFinite(v) && (d.min === undefined || v >= d.min) && (d.max === undefined || v <= d.max) ? null : `must be a number from ${d.min ?? '-∞'} to ${d.max ?? '∞'}`;
    case 'color': return typeof v === 'string' && HEX.test(v) ? null : 'must be a color #rrggbb';
    case 'text': return typeof v === 'string' ? null : 'must be text';
    case 'vec3': return VEC(v) ? null : 'must be three numbers';
    case 'sound':
      if (typeof v !== 'string' || !v) return 'must name a sound';
      return ctx.sounds && !ctx.sounds.includes(v) ? `"${v}" is not a sound of the game` : null;
    case 'entity':
      if (typeof v !== 'string' || !v) return 'must name an entity';
      return v !== 'self' && ctx.ids && !ctx.ids.has(v) ? `there is no entity "${v}"` : null;
    case 'value': return ['string', 'number', 'boolean'].includes(typeof v) ? null : 'must be a number, text, or true or false';
    case 'shader':
      if (typeof v !== 'string' || !v) return 'must name a shader';
      return ctx.shaders && !own(ctx.shaders, v) ? `"${v}" is not a shader of the game or the engine` : null;
    case 'shaderParams': return v !== null && typeof v === 'object' && !Array.isArray(v) && plain(v) ? null : 'must be a map of plain values';
    default: return `unknown field kind ${d.type}`;
  }
}

/** One component (or one interaction, or one action) with every field filled: the line's value, or the default. */
function fill(fields, v) {
  const out = {};
  for (const [k, d] of Object.entries(fields)) out[k] = v?.[k] ?? (d.default !== null && typeof d.default === 'object' ? JSON.parse(JSON.stringify(d.default)) : d.default);
  return out;
}

/** The interactions of an entity as a list (the layout holds one as an object, several as a list). */
export const interactionsOf = (components) => {
  const v = components?.interaction;
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};

/**
 * An entity's components with every field filled, as the runtime reads them:
 * { sound?, particles?, interaction: [{ ...fields, actions: [{ do, ...fields }] }] }.
 */
export function resolveComponents(components) {
  const out = { interaction: [] };
  if (!isMap(components)) return out;
  if (isMap(components.sound)) out.sound = fill(COMPONENTS.sound.fields, components.sound);
  if (isMap(components.particles)) out.particles = fill(COMPONENTS.particles.fields, components.particles);
  if (isMap(components.shader)) out.shader = fill(COMPONENTS.shader.fields, components.shader);
  out.interaction = interactionsOf(components).filter(isMap).map((i) => ({
    ...fill(COMPONENTS.interaction.fields, i),
    actions: (Array.isArray(i.actions) ? i.actions : []).filter((a) => isMap(a) && own(COMPONENTS.interaction.actions, a.do))
      .map((a) => ({ do: a.do, ...fill(own(COMPONENTS.interaction.actions, a.do).fields, a) })),
  }));
  return out;
}

/**
 * What is wrong with an entity's components, as sentences. ctx: { sounds: the game's sound names,
 * ids: a Set of the layout's ids, types: the game's entity types, lines: Map id → entity line }; what ctx
 * lacks is not checked (a game that gives no sound catalog gets its sound names unchecked).
 */
export function checkComponents(e, ctx = {}) {
  const c = e.components;
  if (c === undefined) return [];
  if (!isMap(c)) return [`${e.id}: components must be a map`];
  const out = [];
  const fields = (where, defs, v, required = [], skip = '') => {
    if (!isMap(v)) { out.push(`${where}: must be a map`); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === skip) continue;
      const d = own(defs, k);
      if (!d) { out.push(`${where}: no field ${k}`); continue; }
      const p = fieldProblem(d, x, ctx);
      if (p) out.push(`${where}.${k}: ${p}`);
    }
    // A value left out is missing; for `value`, an empty text is a value (the empty text a param is set to).
    for (const k of required) if (v[k] === undefined || (v[k] === '' && k !== 'value')) out.push(`${where}.${k}: is missing`);
  };
  for (const [k, v] of Object.entries(c)) {
    if (!own(COMPONENTS, k)) { out.push(`${e.id}: unknown component ${k}`); continue; }
    if (k === 'sound') fields(`${e.id}.sound`, COMPONENTS.sound.fields, v, ['name']);
    if (k === 'particles') fields(`${e.id}.particles`, COMPONENTS.particles.fields, v);
    if (k === 'shader') {
      fields(`${e.id}.shader`, COMPONENTS.shader.fields, v, ['name']);
      // Its params against the shader's own (the page knows the shaders: ctx.shaders, id → { params }).
      const def = isMap(v) && typeof v.name === 'string' ? own(ctx.shaders, v.name) : undefined;
      if (def && isMap(v.params)) for (const p of checkEntity({ s: { label: v.name, params: def.params ?? {} } }, { id: `${e.id}.shader`, type: 's', params: v.params })) out.push(p.replace(/^[^:]*: s has no param/, `${e.id}.shader: ${v.name} has no param`));
    }
  }
  interactionsOf(c).forEach((i, n) => {
    const where = `${e.id}.interaction[${n}]`;
    if (!isMap(i)) { out.push(`${where}: must be a map`); return; }
    fields(where, COMPONENTS.interaction.fields, i, (i.trigger ?? 'use') === 'event' ? ['event'] : [], 'actions');
    if (i.actions !== undefined && !Array.isArray(i.actions)) { out.push(`${where}.actions: must be a list`); return; }
    (i.actions ?? []).forEach((a, m) => {
      const at = `${where}.actions[${m}]`;
      const kind = isMap(a) ? own(COMPONENTS.interaction.actions, a.do) : null;
      if (!kind) { out.push(`${at}: unknown action ${isMap(a) ? a.do : a}`); return; }
      const need = own({ sound: ['name'], toggle: ['param'], set: ['param', 'value'], event: ['name'], say: ['text'] }, a.do) ?? [];
      fields(at, kind.fields, a, need, 'do');
      // A param changed by an action is a param of the target's type, and the value fits it.
      if ((a.do === 'toggle' || a.do === 'set') && typeof a.param === 'string' && a.param && ctx.types && ctx.lines) {
        const target = !a.target || a.target === 'self' ? e : ctx.lines.get(a.target);
        const def = target && own(own(ctx.types, target.type)?.params, a.param);
        if (target && !def) out.push(`${at}.param: ${target.type} has no param ${a.param}`);
        else if (def && a.do === 'toggle' && def.type !== 'bool') out.push(`${at}.param: ${a.param} is not a yes/no param`);
        else if (def && a.do === 'set' && a.value !== undefined) {
          const p = checkEntity(ctx.types, { id: target.id, type: target.type, params: { [a.param]: a.value } });
          if (p.length) out.push(`${at}.value: ${p[0].replace(/^[^:]*: /, '')}`);
        }
      }
    });
  });
  return out;
}
