// The catalog of objects the scene editor's library shows (its Objects tab): every entity type of the game, built
// alone with its default params, through the same builder the scenes use (src/entities.js).
import { resolveParams } from '../vendor/engine/layout.js';
import { ENTITY_TYPES, buildEntity } from './entities.js';

export const PROPS = Object.fromEntries(Object.entries(ENTITY_TYPES).map(([name, t]) => [name, { label: t.label, desc: t.desc, scene: t.group }]));

export function buildProp(r, name) {
  const e = { id: name, type: name, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], params: {} };
  return buildEntity(r, e, resolveParams(ENTITY_TYPES, name, {}));
}
