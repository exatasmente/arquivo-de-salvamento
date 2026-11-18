// What the scenes share: the entities of a layout built through the engine, and from them the things the game's
// rules ask of a scene (colliders, hiding places, ground heights, the point lights nearest the eye, the
// daylight, the sound that stays quiet while the scene is not the one playing).
import { createEntities } from '../../vendor/engine/entities.js';
import { ENTITY_TYPES, buildEntity } from '../entities.js';
import { SOUND_NAMES } from '../audio/index.js';
import { kitOf, flatten } from '../models/kit.js';

/** The triangles of everything drawn by a scene's group. */
export { countTris } from '../models/kit.js';

/**
 * options: r, layout, editor, hooks, group (where the entities go), chunk (metres of a merged piece, 0 = one),
 * night (() => 0..1, how dark it is, for the lamps that only burn at night), points (the render's point lights),
 * override ({ type: (kit, params, entity) => made }: builders that replace the ones of src/entities.js for this scene, as the street's city does).
 */
export function placeEntities({ r, layout, editor, hooks, group, chunk = 0, night = () => 1, points = 8, override = null }) {
  const T = r.THREE, kit = kitOf(r);
  const lamps = new Map(), colliders = [], hides = new Map(), grounds = new Map(), daylights = new Map(), boxes = new Map();
  // Sound sources of this scene's entities, held so the scene can silence them while it is not the active one.
  const handles = new Set();
  let active = true;
  const sound = hooks.sound && {
    ...hooks.sound,
    start(name, o) {
      const h = hooks.sound.start(name, o);
      if (!h) return h;
      const wrapped = { ...h, gain(v) { if (active) h.gain(v); }, stop() { handles.delete(wrapped); h.stop(); } };
      wrapped.raw = h; handles.add(wrapped);
      if (!active) h.gain(0);
      return wrapped;
    },
  };
  const w = new T.Vector3();
  const toWorld = (m, x, y, z) => { m.root.updateMatrixWorld(true); return w.set(x, y, z).applyMatrix4(m.root.matrixWorld).toArray(); };
  const rect = (id, cx, cz, hw, hd, yaw) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = hw * c + hd * s, ez = hw * s + hd * c;
    return { id, min: [cx - ex, cz - ez], max: [cx + ex, cz + ez] };
  };
  const ents = createEntities({
    r, group, types: ENTITY_TYPES, layout, editor,
    hooks: { sounds: SOUND_NAMES, ...hooks, ...(sound ? { sound } : {}) },
    build: (e, p) => {
      const fn = override?.[e.type];
      if (!fn) return buildEntity(r, e, p);
      const m = fn(kit, p, e);
      m.root.position.set(...e.pos); m.root.rotation.set(...e.rot); m.root.scale.set(...e.scale);
      return m;
    },
    onBuilt(id, m, e) {
      if (m.light) { const o = m.light, p = toWorld(m, 0, o.y ?? 0, o.z ?? 0); lamps.set(id, { pos: p, base: m.light }); }
      const c = m.collider, sc = e.scale;
      if (c && !m.collider.soft) boxes.set(id, rect(id, e.pos[0], e.pos[2], (c.w * sc[0]) / 2, (c.d * sc[2]) / 2, e.rot[1]));
      if (m.colliderPosts) m.colliderPosts.forEach(([lx, lz], i) => { const p = toWorld(m, lx, 0, lz); boxes.set(`${id}#${i}`, rect(`${id}#${i}`, p[0], p[2], 0.15, 0.15, 0)); });
      if (m.colliderBoxes) {
        const yaw = e.rot[1], cs = Math.cos(yaw), sn = Math.sin(yaw);
        m.colliderBoxes.forEach((b, i) => { const x = e.pos[0] + b.x * cs + b.z * sn, z = e.pos[2] - b.x * sn + b.z * cs; boxes.set(`${id}#b${i}`, rect(`${id}#b${i}`, x, z, b.w / 2, b.d / 2, yaw)); });
      }
      if (m.hides) m.hides.forEach((h, i) => { const yaw = e.rot[1], x = e.pos[0] + h.x * Math.cos(yaw) + h.z * Math.sin(yaw), z = e.pos[2] - h.x * Math.sin(yaw) + h.z * Math.cos(yaw); hides.set(`${id}#h${i}`, { id: `${id}#h${i}`, pos: [x, 0, z], radius: h.radius }); });
      if (m.hide) { const p = toWorld(m, 0, 0, 0); hides.set(id, { id, pos: [p[0], 0, p[2]], radius: m.hide.radius }); }
      if (m.ground) { const p = toWorld(m, 0, 0, 0), g = m.ground; grounds.set(id, { min: [p[0] - g.w / 2, p[2] - g.d / 2], max: [p[0] + g.w / 2, p[2] + g.d / 2], y: g.h }); }
      if (m.daylight) daylights.set(id, m);
    },
    onRemoved(id) { lamps.delete(id); boxes.delete(id); for (const k of [...boxes.keys()]) if (k.startsWith(id + '#')) boxes.delete(k); for (const k of [...hides.keys()]) if (k === id || k.startsWith(id + '#')) hides.delete(k); grounds.delete(id); daylights.delete(id); },
  });
  ents.all();
  let merged = null;
  if (!editor) merged = flatten(kit, group, ents.made, chunk);

  /** Puts the 8 point lights on the lamps nearest to `eye` (the render has only 8); a lamp of the night is out by day. */
  function lightsNear(eye, k) {
    const dark = night(k), list = [];
    for (const l of lamps.values()) {
      const f = l.base.night ? dark : 1; if (f <= 0.01) continue;
      const dx = l.pos[0] - eye[0], dy = l.pos[1] - eye[1], dz = l.pos[2] - eye[2];
      list.push({ d: Math.hypot(dx, dy, dz) - l.base.range * 0.5, l, f });
    }
    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < points; i++) {
      const it = list[i];
      if (it) { const c = new T.Color(it.l.base.color).multiplyScalar(it.f); r.point(i, { pos: it.l.pos, color: '#' + c.getHexString(), range: it.l.base.range }); }
      else r.point(i, { pos: [0, -100, 0], color: '#000000', range: 1 });
    }
  }
  // The game shows one scene at a time (group.visible): the sound sources of a scene that is not shown go quiet by themselves.
  if (!editor && typeof requestAnimationFrame === 'function') {
    const watch = () => { const on = group.parent ? isShown(group) : true; if (on !== active) api.setActive(on); requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
  }
  const refreshBoxes = () => { colliders.length = 0; for (const b of boxes.values()) colliders.push(b); };
  const api = {
    ents, kit, lamps, hides, grounds, daylights, merged, lightsNear, colliders, refreshBoxes, boxes,
    /** Runs the little animations of the entities that have one (a pump that shakes, a lamp that blinks). */
    tick(t) { for (const m of Object.values(ents.made)) m.animate?.(t); },
    /** Silences (false) or restores (true) the sound sources of this scene's entities. */
    setActive(on) { active = on; for (const h of handles) if (!on) h.raw.gain(0); },
    /** The floor height at a point: the highest platform under it, else 0. */
    ground(x, z) { let y = 0; for (const g of grounds.values()) if (x >= g.min[0] && x <= g.max[0] && z >= g.min[1] && z <= g.max[1]) y = Math.max(y, g.y); return y; },
  };
  return api;
}
/** Whether an object and every parent of it is visible. */
const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

/** A geometry turned inside out: the faces and the normals look inward (a vault seen from inside). */
export function invert(geo) {
  const idx = geo.index;
  if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1), b = idx.getX(i + 2); idx.setX(i + 1, b); idx.setX(i + 2, a); }
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}

/**
 * The states of the things of a scene as the game changes them: `table` is { name: { ids: [entity ids], states: { state: params | (ents, id) => params } } }.
 * setThing(name, state) changes the params of the entities (they are rebuilt); `state` may also be a map of params, or for a
 * number the table's `number` (a function). Returns false for an unknown thing or state, true when applied.
 */
export function makeThings(ents, table) {
  const now = {};
  return {
    setThing(name, state) {
      const t = table[name] ?? Object.entries(table).find(([, v]) => v.ids.includes(name))?.[1];
      if (!t) return false;
      const ids = table[name] ? t.ids : [name];
      let spec = typeof state === 'object' && state ? state : typeof state === 'number' ? t.number?.(state) : t.states[state];
      if (!spec) return false;
      for (const id of ids) {
        if (!ents.entity(id)) continue;
        const params = typeof spec === 'function' ? spec(ents, id) : spec;
        for (const [k, v] of Object.entries(params)) ents.setParam(id, k, v);
        now[id] = state;
      }
      return true;
    },
    thing: (id) => now[id] ?? null,
  };
}
