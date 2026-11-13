// Preview of the casa: free camera (WASD + mouse, click to lock the pointer, G toggles collisions).
// ?v=<view> starts at a preset, ?cam=x,y,z,yawDeg,pitchDeg, ?manual stops the loop (tests call __c.render(t)), ?t=seconds,
// ?recados=n  ?adesivo=1  ?toca=1  ?open=0..1 (both doors)  ?bright  ?darkness=0..1  ?seed=n
import { createRender } from '../src/render.js';
import { buildCasa } from '../src/scenes/casa.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), hud = document.getElementById('hud');
const r = createRender(canvas);
const T = r.THREE;
const casa = buildCasa(r, { seed: Number(q.get('seed') ?? 1), darkness: Number(q.get('darkness') ?? 1) });
r.scene.add(casa.group);
const bright = q.has('bright');
r.light(bright ? { ...casa.mood, ambient: '#9a9aa8', key: '#8a8a90' } : casa.mood);

const VIEWS = {
  quarto: [2.7, 1.65, 2.4, -60, -8], cama: [2.35, 1.65, 1.45, -90, -25], 'quarto-porta': [0.7, 1.65, 3.4, 90, -4], spawn: [2.5, 1.65, 2.5, 0, 0],
  sala: [4.4, 1.65, 3.6, 70, -6], cozinha: [5.0, 1.65, 3.9, 20, -4], geladeira: [8.7, 1.5, 1.55, 0, -4], 'geladeira-perto': [8.7, 1.5, 1.25, 0, -2],
  mesa: [5.4, 1.6, 3.4, 0, -40], telefone: [4.95, 1.4, 0.95, -90, -34], vara: [7.6, 1.5, 3.9, 38, -8], janela: [6.0, 1.65, 4.7, 180, 0], porta: [8.2, 1.65, 4.6, 180, 0],
  'casa-fora': [6, 1.65, 10.6, 0, 6], rua: [8.2, 1.65, 6.6, 90, 4], 'rua-farmacia': [11.5, 1.65, 8.6, 70, 6], fachada: [15, 1.65, 9.5, 0, 8], 'farmacia-porta': [16.5, 1.65, 6.5, 0, 0],
  farmacia: [16.5, 1.65, 4.8, 0, -4], balcao: [16.2, 1.65, 3.4, 0, -6], frasco: [18.2, 1.5, 3.3, 0, -28], pilhas: [14.0, 1.65, 4.05, -90, -4], 'farmacia-fundo': [14.0, 1.65, 4.9, 20, -6],
  aereo: [10, 22, 24, 0, -50], 'aereo-casa': [4.7, 9, 11, 0, -45], 'aereo-rua': [16.5, 9, 12, 0, -40],
};
const cam = { x: 2.5, y: 1.65, z: 2.5, yaw: 0, pitch: 0 };
function setView(name) { const v = VIEWS[name]; if (v) Object.assign(cam, { x: v[0], y: v[1], z: v[2], yaw: v[3] * Math.PI / 180, pitch: v[4] * Math.PI / 180 }); }
if (q.get('v')) setView(q.get('v'));
if (q.get('cam')) { const a = q.get('cam').split(',').map(Number); Object.assign(cam, { x: a[0], y: a[1], z: a[2], yaw: a[3] * Math.PI / 180, pitch: (a[4] ?? 0) * Math.PI / 180 }); }

const state = { recados: Number(q.get('recados') ?? 0), adesivoGeladeira: Number(q.get('adesivo') ?? 0), telefoneToca: q.has('toca'), doors: {}, hora: 20.4 };
if (q.get('open')) for (const id in casa.doors) state.doors[id] = Number(q.get('open'));

const keys = new Set();
let fly = !q.has('walk');
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyG') fly = !fly; });
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => canvas.requestPointerLock?.());
addEventListener('mousemove', (e) => { if (document.pointerLockElement) { cam.yaw += e.movementX * 0.0025; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - e.movementY * 0.0025)); } });

function collide(nx, nz) {
  const rad = 0.28;
  for (const c of casa.colliders) {
    if (c.enabled === false || c.min[1] > 1.2) continue;
    const cx = Math.max(c.min[0], Math.min(nx, c.max[0])), cz = Math.max(c.min[2], Math.min(nz, c.max[2]));
    const dx = nx - cx, dz = nz - cz, d = Math.hypot(dx, dz);
    if (d < rad) {
      if (d > 1e-5) { nx = cx + dx / d * rad; nz = cz + dz / d * rad; }
      else { const l = nx - c.min[0], rr = c.max[0] - nx, t = nz - c.min[2], b = c.max[2] - nz, m = Math.min(l, rr, t, b); if (m === l) nx = c.min[0] - rad; else if (m === rr) nx = c.max[0] + rad; else if (m === t) nz = c.min[2] - rad; else nz = c.max[2] + rad; }
    }
  }
  return [nx, nz];
}
function applyLights() {
  const cands = casa.lights.filter((l) => l.on && l.level > 0.02).map((l) => ({ l, d: Math.hypot(l.pos[0] - cam.x, l.pos[2] - cam.z) + Math.abs(l.pos[1] - cam.y) * 0.3 })).sort((a, b) => a.d - b.d).slice(0, 7);
  for (let i = 0; i < 8; i++) {
    const c = cands[i];
    if (i === 7) { r.point(7, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 }); continue; }
    if (c) r.point(i, { pos: c.l.pos, color: new T.Color(c.l.color).multiplyScalar(c.l.level * 1.15), range: c.l.range }); else r.point(i, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 });
  }
}
function render(t) {
  casa.update(t, state);
  applyLights();
  r.camera.position.set(cam.x, cam.y, cam.z);
  r.camera.rotation.order = 'YXZ'; r.camera.rotation.set(cam.pitch, -cam.yaw, 0);
  r.draw();
  const inf = r.renderer.info.render;
  hud.textContent = `${casa.areaAt(cam.x, cam.z)}  (${cam.x.toFixed(1)}, ${cam.z.toFixed(1)})  draws ${inf.calls}  tris ${inf.triangles}${fly ? '  [voo]' : ''}`;
}
function resize() { r.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const sp = (keys.has('ShiftLeft') ? 5 : 2.2) * dt;
  const fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
  let mx = 0, mz = 0;
  if (keys.has('KeyW')) { mx += fx; mz += fz; } if (keys.has('KeyS')) { mx -= fx; mz -= fz; }
  if (keys.has('KeyD')) { mx += rx; mz += rz; } if (keys.has('KeyA')) { mx -= rx; mz -= rz; }
  if (keys.has('ArrowLeft')) cam.yaw -= dt * 1.6; if (keys.has('ArrowRight')) cam.yaw += dt * 1.6;
  if (keys.has('ArrowUp')) cam.pitch = Math.min(1.5, cam.pitch + dt); if (keys.has('ArrowDown')) cam.pitch = Math.max(-1.5, cam.pitch - dt);
  if (mx || mz) { let nx = cam.x + mx * sp, nz = cam.z + mz * sp; if (!fly) [nx, nz] = collide(nx, nz); cam.x = nx; cam.z = nz; }
  render(now / 1000);
  requestAnimationFrame(loop);
}
window.__c = { casa, state, cam, r, setView, render, VIEWS, T };
if (q.has('manual')) render(Number(q.get('t') ?? 1.3)); else requestAnimationFrame(loop);
