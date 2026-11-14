// The engine's entities in a scene (docs/engine.md): a scene's layout built through the game's own types,
// one entity at a time and on first use, and the editor's door (window.__engine) to pick, outline and
// rebuild them live. What an entity means to the game's rules (lights, colliders, handles) stays the game's:
// it gets each built entity through `onBuilt` and each removed one through `onRemoved`.
import * as THREE from 'three';
import { readLayout, resolveParams, checkEntity, COMPONENTS, TRIGGER_LABELS } from './layout.js';
import { createComponents } from './components.js';
import { currentRender } from './render.js';
import { LOOKS, SHADERS } from './looks.js';

/**
 * scene: { r, group, types, layout, build(entity, params) -> { root, ... }, editor?, onBuilt?, onRemoved?, hooks? }
 *   types: the game's entity types (defineTypes); build: the game's builder of one entity, given the
 *   entity line and its resolved params, returns at least { root } (an Object3D).
 *   hooks: what the components ask of the game (sounds, sound, target, event, say: see components.js).
 * Returns { made, types, scene, X(id) -> what build returned, pos(id), params(id), entity(id), all(),
 * update(t, ctx), event(name), use(id), setParam(id, key, value), components(id), dispose() } and, in editor mode,
 * installs window.__engine. `made` has no prototype: an id like "constructor" is an id.
 * The game calls update(t, { listener, dir, hour }) every frame with its clock: the components run on it.
 */
export function createEntities({ r, group, types, layout, build, editor = false, onBuilt, onRemoved, hooks = {} }) {
  const scene = layout.scene;
  const lines = new Map(readLayout(layout, scene).entities.map((e) => [e.id, e]));
  const made = Object.create(null);
  /** The game's object for one entity line, built but not yet in the scene. */
  const construct = (e) => {
    const m = build(e, resolveParams(types, e.type, e.params));
    if (!m?.root) throw new Error(`${e.id}: the build of type ${e.type} returned no root`);
    m.root.userData.entityId = e.id;
    return m;
  };
  const paramOf = (id, k) => resolveParams(types, lines.get(id)?.type, lines.get(id)?.params)[k];
  /** An action of an interaction changes a param: the entity is rebuilt with it, its components' state kept. */
  const setParam = (id, k, v) => {
    const e = lines.get(id);
    if (!e) return false;
    const next = { ...e, params: { ...e.params, [k]: v } };
    const old = made[id];
    if (!old) { lines.set(id, next); return true; }
    const m = construct(next);
    const release = comps.keep(id);
    try {
      group.remove(old.root);
      delete made[id];
      removed(id, old);
      lines.set(id, next);
      place(id, m, next);
    } catch (err) {
      // The game threw in onRemoved or onBuilt: the old entity goes back, with the game told again.
      if (made[id] === m) { group.remove(m.root); delete made[id]; try { removed(id, m); } catch { /* as below */ } }
      lines.set(id, e);
      made[id] = old;
      group.add(old.root);
      try { built(id, old, e); } catch { /* the game's own state, put back as far as it lets */ }
      throw err;
    } finally { release(); }
    return true;
  };
  const comps = createComponents({ r, group, hooks, editor, setParam, paramOf });
  // The scene's look (layout.look, looks.js): set on the page's render when the scene is made. Its params are
  // changes over the look the game made the render with (`base`), so a scene names only what differs.
  const view = { base: null, now: null, problem: null };
  // The render this scene draws in: the one the game gave (r), or else the page's last one.
  const renderOf = () => (typeof r?.setLook === 'function' ? r : currentRender());
  const applyLook = (l) => {
    const rr = renderOf();
    if (!rr) return;
    view.base ??= { id: rr.look, params: { ...rr.lookParams } };
    // A scene without a look, and none set before: the render stays exactly as the game made it.
    if (!l && !view.now) return;
    const id = l?.id ?? view.base.id;
    rr.setLook(id, id === view.base.id ? { ...view.base.params, ...(l?.params ?? {}) } : l?.params ?? {});
    view.now = l ?? null;
  };
  try { applyLook(readLayout(layout, scene).look); } catch (err) { view.problem = `o visual do cenário: ${err.message}`; }
  // Every entity that goes into the scene gets its components, and every one that leaves loses them,
  // before the game is told: the door's apply and its undo go through these two as well.
  const built = (id, m, e) => { comps.attach(id, m, e); onBuilt?.(id, m, e); };
  const removed = (id, m) => { comps.detach(id); onRemoved?.(id, m); };
  /** Puts a built entity in the scene and tells the game. */
  const place = (id, m, e) => {
    made[id] = m;
    group.add(m.root);
    built(id, m, e);
  };
  const make = (id) => {
    const e = lines.get(id);
    if (!e) throw new Error(`entity not in the layout: ${id}`);
    const m = construct(e);
    place(id, m, e);
    return m;
  };
  const api = {
    scene, made, types,
    /** What the game's builder returned for the entity, built now if it was not yet. */
    X: (id) => made[id] ?? make(id),
    entity: (id) => lines.get(id),
    pos: (id) => lines.get(id)?.pos,
    params: (id) => resolveParams(types, lines.get(id)?.type, lines.get(id)?.params),
    /** Builds every entity the game did not ask for by name (the rest of the layout), in its order. */
    all: () => { for (const id of lines.keys()) api.X(id); return made; },
    /** Runs the components on the game's clock: { listener: [x, y, z], dir: [x, y, z], hour }. */
    update: (t, ctx) => comps.update(t, ctx),
    /** A game event: the interactions waiting on it fire. */
    event: (name) => comps.event(name),
    /** The player used an entity (for a game that aims on its own, without hooks.target). */
    use: (id) => comps.use(id),
    setParam,
    /** Leaving the scene: every emitter out, every sound source stopped, every target given back to the game. */
    dispose: () => {
      comps.dispose();
      // The render goes back to the look the game made it with (one scene per page shows its look at a time).
      if (view.now) try { applyLook(null); } catch { /* the game's own render */ }
    },
    /** The live state of an entity's components: { particles, sound, components }. */
    components: (id) => comps.state(id),
  };
  if (editor && typeof window !== 'undefined') window.__engine = door({ r, group, scene, types, lines, made, construct, place, onBuilt: built, onRemoved: removed, comps, hooks, view, applyLook, renderOf });
  return api;
}

/**
 * The editor's door. apply(scene, layout) rebuilds only the entities whose line changed, adds and drops the
 * others, all or nothing: when the layout is invalid, or the game's build throws for any entity, nothing
 * changes and the error goes up. pick(nx, ny) names the entity under a point of the picture (0..1 from the
 * top left) seen by the camera drawing now; select(id) outlines one; root(id) is its object; describe()
 * says what the editor can show: the types with their params, the layout now, and what in it does not fit.
 */
function door({ r, group, scene, types, lines, made, construct, place, onBuilt, onRemoved, comps, hooks, view, applyLook, renderOf }) {
  const outline = new THREE.Box3Helper(new THREE.Box3(), 0xffb020);
  outline.visible = false;
  outline.material.depthTest = false;
  outline.renderOrder = 1e6;
  r.scene.add(outline);
  // The reaches of the selected entity's components: a ring on the ground for each (blue for sound, green
  // for an interaction's distance).
  const rings = new THREE.Group();
  r.scene.add(rings);
  const ring = (radius, color) => {
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
    line.renderOrder = 1e6;
    return line;
  };
  let selected = null;
  const cur = new Map([...lines].map(([id, e]) => [id, JSON.stringify(e)]));
  /** A ray through a point of the picture (0..1 from the top left), from the camera drawing now. */
  const ray = (nx, ny) => {
    // The scene editor's free camera, when it is the one drawing (window.__editorFree); the game's otherwise.
    const free = window.__editorFree;
    const cam = free?.on && free.orbit ? free.camera : free?.player ?? r.camera;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), cam);
    return rc;
  };
  /** What the ray meets in the scene's entities, nearest first (only what is drawn). */
  const hits = (nx, ny) => {
    group.updateWorldMatrix(true, true);
    return ray(nx, ny).intersectObject(group, true).filter((h) => {
      for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
  };
  const reselect = () => {
    for (const c of [...rings.children]) { rings.remove(c); c.geometry.dispose(); c.material.dispose(); }
    const o = selected && made[selected]?.root;
    if (!o) { outline.visible = false; return; }
    o.updateWorldMatrix(true, true);
    outline.box.setFromObject(o);
    outline.visible = !outline.box.isEmpty();
    for (const { kind, radius, at } of comps.reaches(selected)) {
      const l = ring(radius, kind === 'sound' ? 0x60a0ff : 0x60ff90);
      l.position.copy(at);
      rings.add(l);
    }
  };
  const drop = (id) => {
    const m = made[id];
    if (m) { group.remove(m.root); onRemoved?.(id, m); }
    delete made[id];
  };
  return {
    version: 1,
    scene,
    describe() {
      const shaders = Object.fromEntries(Object.values(SHADERS).map((d) => [d.id, { params: d.params ?? {} }]));
      const ctx = { sounds: Array.isArray(hooks.sounds) ? hooks.sounds : undefined, ids: new Set(lines.keys()), lines, shaders };
      const rr = renderOf();
      const describeDef = (d) => ({ id: d.id, label: d.label ?? d.id, desc: d.desc ?? '', params: d.params ?? {} });
      return {
        version: 1, scene, types, layout: { scene, version: 1, ...(view.now ? { look: view.now } : {}), entities: [...lines.values()] },
        problems: [...(view.problem ? [view.problem] : []), ...[...lines.values()].flatMap((e) => checkEntity(types, e, ctx))],
        // What any entity can have, and what the game offers to fill it with.
        components: COMPONENTS, triggers: TRIGGER_LABELS,
        catalog: {
          sounds: ctx.sounds ?? null, events: Array.isArray(hooks.events) ? hooks.events : null,
          shaders: Object.values(SHADERS).map(describeDef), looks: Object.values(LOOKS).map(describeDef),
        },
        // The render's look: the one the game made it with (base) and the one drawing now. Null for a game
        // that does not draw with the engine's render.
        look: rr ? { base: view.base ?? { id: rr.look, params: { ...rr.lookParams } }, now: { id: rr.look, params: { ...rr.lookParams } } } : null,
      };
    },
    /**
     * The picture drawn now and the same picture in another look ({ id, params }: params over the game's,
     * as in a layout), side by side for the person; the look drawing before comes back. Null without a render.
     */
    compare(other) {
      const rr = renderOf();
      if (!rr) return null;
      const was = { id: rr.look, params: { ...rr.lookParams } };
      outline.visible = false; rings.visible = false;
      try {
        const a = rr.snapshot();
        const base = view.base ?? was;
        // `exact`: the params are the whole set (a look of the library as it comes), not changes over the game's.
        rr.setLook(other.id, other.exact || other.id !== base.id ? other.params ?? {} : { ...base.params, ...(other.params ?? {}) });
        const b = rr.snapshot();
        return { a, b };
      } finally {
        rr.setLook(was.id, was.params);
        rings.visible = true;
        reselect();
      }
    },
    /** The live state of an entity's components (particles drawn, sound playing). */
    components(id) { return comps.state(id); },
    apply(sceneId, lay) {
      const res = { changed: [], added: [], removed: [] };
      if (sceneId !== scene) return res;
      const next = readLayout(lay, scene);
      // The scene's look first: one the render refuses (a bad param) throws before any entity is touched.
      const lookBefore = view.now;
      const lookChanged = JSON.stringify(next.look ?? null) !== JSON.stringify(view.now ?? null);
      if (lookChanged) {
        try { applyLook(next.look); } catch (err) { throw new Error(`o visual do cenário: ${err.message}`); }
      }
      // A look that failed before and is gone now (or applied now) leaves no problem behind.
      if (lookChanged || !next.look) view.problem = null;
      const ids = new Set(next.entities.map((e) => e.id));
      const gone = [...lines.keys()].filter((id) => !ids.has(id));
      const fresh = next.entities.filter((e) => cur.get(e.id) !== JSON.stringify(e));
      // Everything is built before anything is touched: a build that throws leaves the scene as it was.
      const built = fresh.map((e) => [e, construct(e)]);
      const order = [...lines.keys()];
      // Then each step is written down, so a game callback that throws (onRemoved, onBuilt) is undone
      // in reverse: what was put in comes out, what was taken out goes back, with the game told again.
      const done = [];
      const takeOut = (id) => {
        const step = { kind: 'out', id, m: made[id], line: lines.get(id), cur: cur.get(id) };
        done.push(step);
        if (step.m) group.remove(step.m.root);
        delete made[id];
        lines.delete(id);
        cur.delete(id);
        if (step.m) onRemoved?.(id, step.m);
      };
      const putIn = (e, m) => {
        done.push({ kind: 'in', id: e.id, m });
        lines.set(e.id, e);
        cur.set(e.id, JSON.stringify(e));
        place(e.id, m, e);
      };
      try {
        for (const id of gone) { takeOut(id); res.removed.push(id); }
        for (const [e, m] of built) {
          const had = cur.has(e.id);
          if (had) takeOut(e.id);
          putIn(e, m);
          (had ? res.changed : res.added).push(e.id);
        }
      } catch (err) {
        for (const step of done.reverse()) {
          if (step.kind === 'in') {
            if (made[step.id] === step.m) { group.remove(step.m.root); delete made[step.id]; }
            lines.delete(step.id);
            cur.delete(step.id);
            try { onRemoved?.(step.id, step.m); } catch { /* the game's own state, put back as far as it lets */ }
          } else {
            if (step.line) { lines.set(step.id, step.line); cur.set(step.id, step.cur); }
            if (step.m) {
              made[step.id] = step.m;
              group.add(step.m.root);
              try { onBuilt?.(step.id, step.m, step.line); } catch { /* as above */ }
            }
          }
        }
        // Taking a line out and putting it back moves it to the end of the map: the old order goes back too.
        // (made and group hold the same entities as before, in another insertion order: nothing reads them
        // in order; all() and describe() go by lines.)
        const back = order.filter((id) => lines.has(id)).map((id) => [id, lines.get(id)]);
        lines.clear();
        for (const [id, e] of back) lines.set(id, e);
        if (lookChanged) try { applyLook(lookBefore); } catch { /* the look before was the render's */ }
        reselect();
        throw err;
      }
      // The lines in the layout's order, as describe() gives them back.
      const ordered = next.entities.map((e) => [e.id, lines.get(e.id)]);
      lines.clear();
      for (const [id, e] of ordered) lines.set(id, e);
      reselect();
      return res;
    },
    select(id) { selected = id || null; reselect(); return Boolean(id && made[id]); },
    /** The object of an entity in the scene (rebuilt by apply: ask again after one). */
    root(id) { return made[id]?.root ?? null; },
    pick(nx, ny) {
      for (const h of hits(nx, ny)) for (let o = h.object; o; o = o.parent) if (o.userData?.entityId) return o.userData.entityId;
      return null;
    },
    /**
     * Where a new entity goes for a point of the picture: on the first surface of the scene under it, or
     * on the ground plane (y = 0) when nothing is there; null when the point looks at the sky.
     */
    pointAt(nx, ny) {
      const h = hits(nx, ny).find((x) => !x.object.isPoints && !x.object.isLine);
      if (h) return h.point.toArray().map((v) => Number(v.toFixed(3)));
      const p = new THREE.Vector3();
      return ray(nx, ny).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p.toArray().map((v) => Number(v.toFixed(3))) : null;
    },
  };
}
