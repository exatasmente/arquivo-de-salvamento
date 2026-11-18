// The station radio and Jonas at the workshop bench, drawn by the game's own render: the stage of the proofs of the radio's parts
// and of his actions at it (and of the notebook and the pocket). Serve the game's folder with any static server, open
// tools/models/radio-preview.html and drive `window.stage` from a script:
//   await stage.ready
//   stage.camera([x, y, z], [tx, ty, tz], fov)       // in the stage's metres: the bench stands at the origin, its front toward +z
//   stage.jonas.setPose({ … }); stage.radio.setDial(21); stage.radio.update(1 / 30); stage.draw()
// `stage.place` says where things are; `stage.notebook` is the notebook (assets/props/caderno.glb) with its clips, on his left hand.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { createRender } from '../../src/render.js';
import { kitOf } from '../../src/models/kit.js';
import { place } from '../../src/models/props/place.js';
import { buildRadio, radioReady } from '../../src/models/props/radio.js';
import { buildPerson } from '../../src/models/person.js';
import { jonasReady, RADIO_SEAT, JONAS_MARKS } from '../../src/models/jonas.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const r = createRender(canvas);
r.light({ ambient: q.get('ambient') ?? '#565c70', key: '#8c8478', keyDir: [-0.35, -0.8, -0.5], fog: '#0b0d14', fogNear: 12, fogFar: 40 });
const kit = kitOf(r), b = new kit.Batch();
const BENCH_TOP = 0.93, RADIO_X = 1.36;
// the room: a floor and the wall behind the bench
b.box({ c: '#6a6c68', map: 'piso' }, [9, 0.1, 6], [0, -0.1, 0.6], { tile: 2 });
b.box({ c: '#7c7a74', map: 'concreto' }, [9, 3.4, 0.2], [0, 0, -0.55], { tile: 2 });
place(kit, b, 'bancada', { pos: [0, 0, 0], fb: [3.6, 0.9, 0.8] });
// Jonas faces the radio: it stands RADIO_SEAT in front of him (his own metres, x to his right, z to his back)
const U = 1.78 / 1.79;
const jonas = buildPerson(r, { role: 'jonas', seed: 1 });
const jx = RADIO_X - RADIO_SEAT[0] * U, jy = BENCH_TOP - RADIO_SEAT[1] * U, jz = -RADIO_SEAT[2] * U;
jonas.root.position.set(jx, jy, jz);
jonas.root.rotation.y = 0;
place(kit, b, 'banco', { pos: [jx, 0, jz + 0.31], scale: [0.4, (jy + 0.455) / 0.46, 1], fb: [0.7, 0.6, 0.3] });
const world = new THREE.Group(); world.add(b.build()); r.scene.add(world);
const radio = buildRadio(r, { tint: q.get('tint') ?? '#b4b8c4' });
radio.root.position.set(RADIO_X, BENCH_TOP, 0);
r.scene.add(radio.root, jonas.root);
r.point(0, { pos: [RADIO_X - 0.2, 2.1, 0.9], color: '#ffc890', range: 6 });
r.point(1, { pos: [RADIO_X + 1.4, 1.6, 1.6], color: '#5a6c94', range: 5 });

// the notebook: the file's own nodes and clips (open, page_turn_*), held on his left hand's socket
const notebook = { root: new THREE.Group(), mixer: null, clips: {}, parts: {} };
notebook.ready = new GLTFLoader().loadAsync(new URL('../../assets/props/caderno.glb', import.meta.url).href).then((g) => {
  g.scene.traverse((o) => { notebook.parts[o.name] = o; if (o.isMesh) { const map = o.material.map; if (map) { map.colorSpace = THREE.NoColorSpace; map.flipY = false; } o.material = r.mat('#a8a8a8', { map, emissive: 0.12, side: THREE.DoubleSide }); o.frustumCulled = false; } });
  notebook.root.add(g.scene);
  notebook.mixer = new THREE.AnimationMixer(g.scene);
  for (const c of g.animations) { const a = notebook.mixer.clipAction(c); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; notebook.clips[c.name] = a; }
}).catch(() => null);
notebook.root.visible = false; r.scene.add(notebook.root);
/** The clips of the notebook at these times: { open: seconds, page_turn_0: seconds, … } (a clip not named stays at its start). */
notebook.pose = (times = {}) => {
  if (!notebook.mixer) return;
  for (const [n, a] of Object.entries(notebook.clips)) { a.play(); a.paused = true; a.setEffectiveWeight(1); a.time = Math.max(0, Math.min(a.getClip().duration, times[n] ?? 0)); }
  notebook.mixer.update(0);
};
/** Puts the notebook on a socket of Jonas ('grip_l'), or hides it. */
notebook.follow = (name) => {
  const s = name ? jonas.socket?.(name) : null;
  notebook.root.visible = Boolean(s);
  if (!s) return;
  s.updateWorldMatrix(true, false);
  s.matrixWorld.decompose(notebook.root.position, notebook.root.quaternion, new THREE.Vector3());
};

function camera(pos, target, fov = 30, near = 0.05) {
  const cam = r.camera, w = innerWidth, h = innerHeight;
  r.resize(w, h);
  cam.fov = fov; cam.aspect = w / h; cam.near = near; cam.far = 80; cam.updateProjectionMatrix();
  cam.position.set(...pos); cam.lookAt(...target);
}
/** A camera at his eyes, looking where he faces turned down by `down` radians (the first-person shots). The head's own pieces are hidden while `on`. */
const HEAD = ['hair', 'strap', 'lamp', 'lamp_glow', 'eyes', 'lashes', 'lidshade', 'mouth', 'mouthlow'];
function eyes(down = 0.9, fov = 62, on = true) {
  jonas.root.traverse((o) => { if (o.isMesh && HEAD.includes(o.name)) o.userData.fpHidden = !on ? (o.visible = o.userData.fpWas ?? o.visible, false) : (o.userData.fpWas = o.userData.fpHidden ? o.userData.fpWas : o.visible, o.visible = false, true); });
  if (!on) return;
  const head = jonas.socket?.('Head'); if (!head) return;
  head.updateWorldMatrix(true, false);
  const p = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  const yaw = jonas.root.rotation.y;
  const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(down), -Math.sin(down), -Math.cos(yaw) * Math.cos(down));
  p.y += 0.06; p.addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.2);
  camera(p.toArray(), p.clone().add(f).toArray(), fov, 0.03);
}
window.stage = {
  r, THREE, radio, jonas, notebook, camera, eyes, draw: () => r.draw(), marks: JONAS_MARKS,
  place: { bench: BENCH_TOP, radio: [RADIO_X, BENCH_TOP, 0], jonas: [jx, jy, jz] },
  ready: Promise.all([jonasReady, radioReady, notebook.ready]).then(() => new Promise((res) => setTimeout(res, 50))),
};
camera([RADIO_X - 0.5, 1.5, 1.6], [RADIO_X, 1.1, 0], 32);
window.stage.ready.then(() => { jonas.setPose({ action: 'sentado', t: 0 }); radio.setDisplay('CANAL 21'); radio.settle(); r.draw(); });
