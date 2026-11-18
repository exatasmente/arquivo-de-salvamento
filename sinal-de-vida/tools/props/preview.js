// A sheet of the props drawn by the game's own render (the look, the night tint, the outline), with Jonas standing among them for
// the comparison: tools/props/preview.html?w=1920&h=1080[&only=a,b][&jonas=0][&outline=0]
// Sets window.__sheet = { ready, tris, calls } when the picture is drawn. Any static server at the root of the game serves it.
import { createRender } from '../../src/render.js';
import { kitOf } from '../../src/models/kit.js';
import { place } from '../../src/models/props/place.js';
import { PROP_NAMES, PROPS_LOADED } from '../../src/models/props/loader.js';
import { OUTLINE } from '../../src/models/outline.js';

const q = new URLSearchParams(location.search), W = Number(q.get('w') ?? 1920), H = Number(q.get('h') ?? 1080);
if (q.get('outline') === '0') OUTLINE.on = false;
const r = createRender(document.getElementById('c')); r.resize(W, H);
const T = r.THREE, kit = kitOf(r);
r.light({ ambient: '#6f7890', key: '#d9d2c2', keyDir: [-0.5, -0.8, -0.55], fog: '#141824', fogNear: 40, fogFar: 120 });
r.point(0, { pos: [-4, 3.4, 5], color: '#ffb868', range: 16 }); r.point(1, { pos: [5, 3.4, 5], color: '#ffb868', range: 16 });
const only = q.get('only')?.split(','), names = PROP_NAMES.filter((n) => PROPS_LOADED.has(n) && n !== 'radio' && (!only || only.includes(n)));
// rows: the props sorted by width, packed into rows of about 15 m, the tall ones at the back
const size = (n) => { const g = PROPS_LOADED.get(n).geo; g.computeBoundingBox(); return g.boundingBox.getSize(new T.Vector3()); };
const sorted = [...names].sort((a, b) => size(b).y - size(a).y), rows = [[]]; let x = 0;
const ROW = Number(q.get('row') ?? 15);
for (const n of sorted) { const w = size(n).x + 0.45; if (x + w > ROW) { rows.push([]); x = 0; } rows[rows.length - 1].push(n); x += w; }
const b = new kit.Batch(); let z = 0, wide = 2;
for (const row of rows) {
  const total = row.reduce((s, n) => s + size(n).x + 0.45, 0); let px = -total / 2; wide = Math.max(wide, total);
  const depth = Math.max(...row.map((n) => size(n).z));
  for (const n of row) { const s = size(n); place(kit, b, n, { pos: [px + s.x / 2 + 0.2, 0, z], ry: 0.35 }); px += s.x + 0.45; }
  z += depth * 0.5 + 1.7;
}
const floor = new T.Mesh(new T.PlaneGeometry(80, 80), r.mat('#565c68')); floor.rotation.x = -Math.PI / 2; r.scene.add(floor);
r.scene.add(b.build());
let jonas = null;
if (q.get('jonas') !== '0') {
  const { buildPerson, personReady } = await import('../../src/models/person.js');
  await personReady; const { jonasReady } = await import('../../src/models/jonas.js'); await jonasReady;
  jonas = buildPerson(r, { role: 'jonas' }); jonas.root.position.set(-wide / 2 - 0.5, 0, z - 1.9); jonas.root.rotation.y = Math.PI + 0.5; r.scene.add(jonas.root);
}
const cam = r.camera; cam.fov = 30; cam.aspect = W / H; cam.near = 0.5; cam.far = 200; cam.updateProjectionMatrix();
const cz = (z - 1.7) / 2;
const span = Math.max(wide + 2.4, (z + 1) * 2.1), dist = 0.66 * (span / 2) / Math.tan((cam.fov * Math.PI / 360)) / cam.aspect;
cam.position.set(-0.4, dist * 0.42, cz + dist * 0.9); cam.lookAt(-0.4, 0.5, cz + 0.2);
let n = 0;
function loop() {
  jonas?.setPose?.({ t: n * 0.016 }); r.draw(); n++;
  if (n === 30) window.__sheet = { ready: true, tris: r.renderer.info.render.triangles, calls: r.renderer.info.render.calls, props: names.length };
  if (n < 40) requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__r = r;
