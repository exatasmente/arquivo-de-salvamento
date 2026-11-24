// Writes the views and the anchors of the chase (src/cutscenes/fuga-views.js) into src/film-manifest.json: `node tools/fuga/manifest.mjs`.
// The views of the other cutscenes are left as they are; run it again when a beat of the chase changes its length.
import { readFileSync, writeFileSync } from 'node:fs';
import { views, anchors } from '../../src/cutscenes/fuga-views.js';

const file = new URL('../../src/film-manifest.json', import.meta.url), man = JSON.parse(readFileSync(file, 'utf8'));
const keep = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('fuga.')));
man.views = { ...keep(man.views), ...Object.fromEntries(Object.entries(views).map(([k, [t0, t1, d]]) => [`fuga.${k}`, `${d} (${(t1 - t0).toFixed(1)} s)`])) };
man.anchors = { ...keep(man.anchors), ...Object.fromEntries(Object.entries(anchors).map(([k, d]) => [`fuga.${k}`, d])) };
writeFileSync(file, JSON.stringify(man, null, 2) + '\n');
console.log(`${Object.keys(views).length} views, ${Object.keys(anchors).length} anchors of the chase`);
