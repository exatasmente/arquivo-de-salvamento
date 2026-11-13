// The engine's entities in a scene (docs/engine.md): a scene's layout built through the game's own types,
// one entity at a time and on first use, and the editor's door (window.__engine) to pick, outline and
// rebuild them live. What an entity means to the game's rules (lights, colliders, handles) stays the game's:
// it gets each built entity through `onBuilt` and each removed one through `onRemoved`.
import * as THREE from 'three';
import { readLayout, resolveParams, checkEntity } from './layout.js';

/**
 * scene: { r, group, types, layout, build(entity, params) -> { root, ... }, editor?, onBuilt?, onRemoved? }
 *   types: the game's entity types (defineTypes); build: the game's builder of one entity, given the
 *   entity line and its resolved params, returns at least { root } (an Object3D).
 * Returns { made, types, scene, X(id) -> what build returned, pos(id), params(id), entity(id), all() } and,
 * in editor mode, installs window.__engine. `made` has no prototype: an id like "constructor" is an id.
 */
export function createEntities({ r, group, types, layout, build, editor = false, onBuilt, onRemoved }) {
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
  /** Puts a built entity in the scene and tells the game. */
  const place = (id, m, e) => {
    made[id] = m;
    group.add(m.root);
    onBuilt?.(id, m, e);
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
  };
  if (editor && typeof window !== 'undefined') window.__engine = door({ r, group, scene, types, lines, made, construct, place, onBuilt, onRemoved });
  return api;
}

/**
 * The editor's door. apply(scene, layout) rebuilds only the entities whose line changed, adds and drops the
 * others, all or nothing: when the layout is invalid, or the game's build throws for any entity, nothing
 * changes and the error goes up. pick(nx, ny) names the entity under a point of the picture (0..1 from the
 * top left) seen by the camera drawing now; select(id) outlines one; root(id) is its object; describe()
 * says what the editor can show: the types with their params, the layout now, and what in it does not fit.
 */
function door({ r, group, scene, types, lines, made, construct, place, onBuilt, onRemoved }) {
  const outline = new THREE.Box3Helper(new THREE.Box3(), 0xffb020);
  outline.visible = false;
  outline.material.depthTest = false;
  outline.renderOrder = 1e6;
  r.scene.add(outline);
  let selected = null;
  const cur = new Map([...lines].map(([id, e]) => [id, JSON.stringify(e)]));
  const reselect = () => {
    const o = selected && made[selected]?.root;
    if (!o) { outline.visible = false; return; }
    o.updateWorldMatrix(true, true);
    outline.box.setFromObject(o);
    outline.visible = !outline.box.isEmpty();
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
      return { version: 1, scene, types, layout: { scene, version: 1, entities: [...lines.values()] }, problems: [...lines.values()].flatMap((e) => checkEntity(types, e)) };
    },
    apply(sceneId, lay) {
      const res = { changed: [], added: [], removed: [] };
      if (sceneId !== scene) return res;
      const next = readLayout(lay, scene);
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
      // The scene editor's free camera, when it is the one drawing (window.__editorFree); the game's otherwise.
      const free = window.__editorFree;
      const cam = free?.on && free.orbit ? free.camera : free?.player ?? r.camera;
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), cam);
      group.updateWorldMatrix(true, true);
      for (const h of rc.intersectObject(group, true)) {
        if (!h.object.visible) continue;
        for (let o = h.object; o; o = o.parent) if (o.userData?.entityId) return o.userData.entityId;
      }
      return null;
    },
  };
}
