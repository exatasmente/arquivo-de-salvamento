// The fleet dog on a bare stage, drawn by the game's own render: the proofs of tools/models/dog.py come from here.
// Serve the game's folder with any static server, open tools/models/dog-preview.html and drive `window.dogStage`:
//   await dogStage.ready
//   await dogStage.sheet({ items: [{ pose: {…setPose args}, yaw, seed, label }], cols, dx, dy, dz, cam: { pos, target, fov } })
// The dog is built by src/models/dog.js as the game builds it (the painted texture and the outline are dog.js's).
import * as THREE from 'three';
import { createRender } from '../../src/render.js';
import { buildDog, dogReady } from '../../src/models/dog.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const r = createRender(canvas);
r.light({ ambient: q.get('ambient') ?? '#6a7088', key: '#cfc6b4', keyDir: [-0.45, -0.8, -0.5], fog: '#141824', fogNear: 30, fogFar: 90 });
r.point(0, { pos: [2.5, 3.0, 3.5], color: '#ffc890', range: 16 });
const tags = document.getElementById('tags');
let group = null;

async function sheet(spec) {
  await dogReady;
  if (group) r.scene.remove(group);
  group = new THREE.Group(); r.scene.add(group);
  tags.innerHTML = '';
  const { items, cols = items.length, dx = 1.6, dy = 0, dz = 1.8, cam = {} } = spec;
  const rows = Math.ceil(items.length / cols);
  if (spec.floor !== false) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), r.mat(spec.floor ?? '#4a4f5c'));
    floor.rotation.x = -Math.PI / 2; group.add(floor);
  }
  const live = [];
  items.forEach((it, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    const d = buildDog(r, { seed: it.seed ?? 1 });
    if (it.antennas !== undefined) d.root.traverse((o) => { if (o.name.startsWith('antenna_')) o.visible = Boolean(it.antennas); });
    d.root.position.set((c - (cols - 1) / 2) * dx + (it.x ?? 0), dy ? (rows - 1 - row) * dy : 0, dy ? 0 : (row - (rows - 1) / 2) * dz);
    d.root.rotation.y = it.yaw ?? 0;
    d.setPose(it.pose ?? {});
    if (dy && spec.pads !== false) {            // a row that floats gets its own piece of floor
      const pad = new THREE.Mesh(new THREE.BoxGeometry(dx * 0.92, 0.04, 1.5), r.mat(spec.pad ?? '#4a4f5c'));
      pad.position.set(d.root.position.x, d.root.position.y - 0.02, 0); group.add(pad);
    }
    group.add(d.root);
    live.push([d, it]);
  });
  const w = innerWidth, h = innerHeight;
  r.resize(w, h);
  const camera = r.camera;
  camera.fov = cam.fov ?? 24; camera.aspect = w / h; camera.near = 0.3; camera.far = 200; camera.updateProjectionMatrix();
  camera.position.set(...(cam.pos ?? [0, 1.6, 9])); camera.lookAt(...(cam.target ?? [0, 0.4, 0]));
  r.draw();
  for (const [d, it] of live) {
    if (!it.label) continue;
    const v = new THREE.Vector3(d.root.position.x, d.root.position.y - (dy ? 0.06 : 0), d.root.position.z + (dy ? 0 : 0.5)).project(camera);
    const t = document.createElement('div'); t.className = 'tag'; t.textContent = it.label;
    t.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; t.style.top = `${(1 - (v.y * 0.5 + 0.5)) * 100 + 0.4}%`;
    tags.appendChild(t);
  }
  return { tris: live.map(([d]) => d.tris), ready: live.map(([d]) => d.ready) };
}

window.dogStage = { r, THREE, sheet, ready: dogReady.then(() => new Promise((res) => setTimeout(res, 50))) };
if (!q.has('idle')) window.dogStage.ready.then(() => sheet({ items: [{ yaw: -0.7, pose: { state: 'desconfiada' }, label: 'cão' }], cam: { pos: [0, 1.1, 4.2], target: [0, 0.4, 0] } }));
