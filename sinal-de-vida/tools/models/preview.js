// A contact sheet of the models, drawn by the game's own render (so the look and the skinning are the game's).
// Open preview.html through any static server, or drive window.sheet(spec) from a script:
//   spec = { cols, items: [{ kind: 'person' | 'dog', seed, role, pack, pose: {…setPose args}, yaw, label }], dx, dz, fov, height, dist, look }
// Without a spec, a default sheet of the three main people is drawn (?sheet=people|poses|dog also work).
import { createRender } from '../../src/render.js';
import { buildPerson, personReady } from '../../src/models/person.js';
import * as dogMod from '../../src/models/dog.js';
const { buildDog, dogReady } = dogMod;

const canvas = document.getElementById('c');
const r = createRender(canvas);
const { THREE } = r;
r.light({ ambient: '#6a7490', key: '#d9d2c2', keyDir: [-0.5, -0.8, -0.55], fog: '#1a1e2c', fogNear: 30, fogFar: 90 });
r.point(0, { pos: [2, 3.2, 3], color: '#ffb868', range: 14 });
const tags = document.getElementById('tags');
let group = null;

async function sheet(spec) {
  await Promise.all([personReady, dogReady]);
  if (group) { r.scene.remove(group); }
  group = new THREE.Group(); r.scene.add(group);
  tags.innerHTML = '';
  const { items, cols = items.length, dx = 1.1, dz = 1.5, dy = 0, fov = 22, height = 1.0, dist = 12, tilt = 0.0 } = spec;
  if (spec.look) r.setLook(spec.look);
  const rows = Math.ceil(items.length / cols);
  if (spec.floor !== false) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), r.mat(spec.floor ?? '#3b4150'));
    floor.rotation.x = -Math.PI / 2; group.add(floor);
  }
  const live = [];
  items.forEach((it, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    const m = it.kind === 'dog' ? buildDog(r, { seed: it.seed ?? 1 }) : buildPerson(r, { seed: it.seed ?? 1, role: it.role ?? 'pessoa', pack: it.pack });
    m.root.position.set((c - (cols - 1) / 2) * dx, dy ? (rows - 1 - row) * dy : 0, dy ? 0 : (row - (rows - 1) / 2) * dz);
    m.root.rotation.y = it.yaw ?? Math.PI;
    if (it.pose) m.setPose(it.pose);
    group.add(m.root);
    live.push([m, it, c, row]);
  });
  const w = Math.min(innerWidth, spec.w ?? innerWidth), h = Math.min(innerHeight, spec.h ?? innerHeight);
  r.resize(w, h);
  const cam = r.camera;
  cam.fov = fov; cam.aspect = w / h; cam.near = 0.5; cam.far = 200; cam.updateProjectionMatrix();
  const cx = 0, cz = 0, cy = dy ? ((rows - 1) * dy) / 2 : 0;
  cam.position.set(cx, cy + height + Math.tan(tilt) * dist, cz + dist);
  cam.lookAt(cx, cy + height * (spec.aim ?? 0.9), cz);
  r.draw();
  // labels, placed by projecting the feet
  for (const [m, it, c, row] of live) {
    if (!it.label) continue;
    const v = new THREE.Vector3(m.root.position.x, m.root.position.y, m.root.position.z).project(cam);
    const t = document.createElement('div'); t.className = 'tag'; t.textContent = it.label;
    t.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; t.style.top = `${(1 - (v.y * 0.5 + 0.5)) * 100 + 0.6}%`;
    tags.appendChild(t);
  }
  const tris = live.map(([m, it]) => [it.label ?? it.role ?? it.kind, m.tris]);
  return { tris };
}
window.sheet = sheet;
window.__r = r;
window.__make = { buildPerson, buildDog };
window.__ready = Promise.all([personReady, dogReady]);

const q = new URLSearchParams(location.search).get('sheet');
if (q === 'people' || !q) {
  sheet({ cols: 3, items: ['jonas', 'neide', 'tania'].map((role) => ({ kind: 'person', role, label: role, pose: { t: 0.4 } })), dx: 1.3, height: 1.0, dist: 7.5, fov: 24 });
}
