// The props of a scene as the engine's entities (vendor/engine/entities.js), so the scene editor can pick,
// move, turn and save them in data/scenes/<scene>.json.
//
// Each prop is still built by the scene's own call: the same builder of props.js, with the same arguments, at
// the same point of the scene's code (so the shared random numbers are drawn in the same order). It goes into
// a group of its own. A prop where the layout leaves it (its origin) keeps that group still at the scene's
// origin: the picture is the one the scene had. A prop moved in the editor gets its move on that group,
// turned and scaled around its origin. A prop the layout adds (made in the editor) is built alone by the
// catalog (buildProp) where the layout puts it. A prop the layout no longer has (deleted in the editor) is
// still built by the scene's call, into a hidden group: what the scene's code takes from it (a door, a fridge,
// the cages) is there and the shared random numbers are drawn as always, and nothing of it is drawn.
import { defineTypes } from '../vendor/engine/layout.js';
import { createEntities } from '../vendor/engine/entities.js';
import { PROPS, buildProp } from './props.js';

/** The entity types: every prop of the catalog, grouped by its scene. Props have no params yet. */
export const ENTITY_TYPES = defineTypes(Object.fromEntries(Object.entries(PROPS).map(([name, p]) => [name, { label: p.label, group: p.scene, desc: p.desc, params: {} }])));

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The entities of one scene. `layout` is its data/scenes/<scene>.json, or { record: [] } to record: then
 * every call is built as before and written down in `record` ({ id, type, origin }), for the layout file to
 * be made from (the scene's calls are the truth of where each prop is).
 * place(type, origin, run, id = type) builds the prop the scene calls for and returns what its builder
 * returned; `run(k)` is the scene's call with the kit to build into.
 */
export function sceneEntities(r, group, k, layout, editor = false) {
  const calls = Object.create(null);
  if (Array.isArray(layout?.record)) {
    return {
      place(type, origin, run, id = type) { layout.record.push({ id, type, origin: [...origin] }); return run(k); },
      finish() {},
      ents: null,
    };
  }
  const T = r.THREE;
  const ents = createEntities({
    r, group, types: ENTITY_TYPES, layout,
    // Only the scene editor's view of one scene (scene-view.js) asks for the door and the outline.
    editor,
    build(e) {
      const c = calls[e.id];
      const root = new T.Group();
      if (!c) {
        // Not called by the scene: a prop made in the editor, built alone where the layout puts it.
        const { root: alone } = buildProp(r, e.type);
        root.add(alone);
        root.position.set(...e.pos); root.rotation.set(...e.rot); root.scale.set(...e.scale);
        return { root, out: null };
      }
      const moved = !same(e.pos, c.origin) || e.rot.some((v) => v !== 0) || e.scale.some((v) => v !== 1);
      let into = root;
      if (moved) {
        root.position.set(...e.pos); root.rotation.set(...e.rot); root.scale.set(...e.scale);
        const inner = new T.Group();
        inner.position.set(-c.origin[0], -c.origin[1], -c.origin[2]);
        root.add(inner);
        into = inner;
      }
      return { root, out: c.run(k.into(into)) };
    },
  });
  return {
    ents,
    place(type, origin, run, id = type) {
      calls[id] = { origin, run };
      if (ents.entity(id)) return ents.X(id).out;
      // Deleted in the editor: built hidden, for the scene's code and the random numbers (see above).
      const hidden = new T.Group();
      hidden.visible = false;
      group.add(hidden);
      return run(k.into(hidden));
    },
    /** Builds what the layout has and the scene never called (props made in the editor). */
    finish() { ents.all(); },
  };
}
