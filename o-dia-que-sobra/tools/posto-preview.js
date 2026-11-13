// Preview of the posto: free camera (WASD + mouse, click to lock the pointer), collisions with G to fly.
// ?v=<view> starts at a preset, ?manual stops the loop (tests call __p.render(t)), ?open=1 opens all doors,
// ?sorriso=0..1, ?bright raises the ambient for inspection, ?darkness=0..1.
// Night work states: ?burnt=loja1,estoque  ?off=loja,placa (breakers down)  ?qa=1 (breaker door open)  ?ladder=loja3  ?load=0..4 (cart)
// Phase 3: ?armario=0..1 (cabinet doors)  ?frasco=0 (hide the bottle)  ?vintage=1  ?cups=0..2  ?stickers=1 (all)  ?brew=1  ?displace=1  ?mirror=1 (canvas on the mirrors)  ?keys=1,5 (pressed key)  ?vidro (dark-glass car at pump 2).
// ?dirt=0..1 (all stains)  ?full=1 (all bins)  ?jam=1,3 (jammed pumps)  ?valve=rad  ?moto  ?caminhao  ?stock=0..1 (counter shelf).
import { createRender } from './render.js';
import { buildPosto } from '../src/scenes/posto.js';
import { buildProp } from '../src/models/props.js';
import { buildCar } from '../src/models/car.js';
import { buildMoto } from '../src/models/moto.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), hud = document.getElementById('hud');
const r = createRender(canvas);
const T = r.THREE;
const posto = buildPosto(r, { seed: Number(q.get('seed') ?? 1), darkness: Number(q.get('darkness') ?? 1) });
r.scene.add(posto.group);
const bright = q.has('bright');
r.light({ ambient: bright ? '#9a9aa8' : '#464a5e', key: bright ? '#8a8a90' : '#262c40', fog: '#080a12', fogNear: 14, fogFar: 56 });

const VIEWS = {
  chegada: [-34, 1.65, -24.3, 80, 4], placa: [-25.8, 1.65, -12.9, 57, 30], rodovia: [-6, 1.65, -25, 60, 2],
  loja: [3.4, 1.65, 4.1, 100, -4], 'loja-balcao': [10.0, 1.65, 4.2, 144, -8], 'loja-gondola': [3.6, 1.65, 10.4, 33, -10], 'loja-cafe': [13.8, 1.65, 4.9, 90, -14],
  'loja-fundo': [9.0, 1.65, 4.4, 180, -6], 'loja-geladeira': [5.5, 1.65, 5.2, 270, -6],
  bombas: [4.5, 1.65, -3.0, 30, -3], 'bomba-detalhe': [8.5, 1.5, -6.2, 0, -4], 'bomba4': [19.5, 1.5, -6.0, 0, -2], cobertura: [19.5, 1.65, -5.0, 0, 42],
  estoque: [13, 1.65, 12.6, 180, -8], 'estoque-fundo': [10, 1.65, 17.4, 90, -6],
  'banheiro-m': [18, 1.65, 3.5, 180, -8], 'banheiro-f': [22, 1.65, 3.5, 180, -8],
  escritorio: [5.2, 1.65, 12.7, 175, -12], 'escritorio-mesa': [5.4, 1.5, 17.2, 180, -22],
  servico: [19, 1.65, 13.6, 180, -6], deposito: [23.4, 1.65, 14.7, 225, -8], fundos: [19, 1.65, 18.3, 180, -4],
  estacionamento: [-4.5, 1.65, 3.4, 270, -5], 'estacionamento-fundo': [-12, 1.65, 12, 215, -3],
  quadro: [19, 1.5, 13.3, 0, 0], escada: [19.6, 1.5, 15.2, -45, -8], carrinho: [16.4, 1.5, 16.0, -22, -16], 'atras': [10.9, 1.4, 9.6, 180, -6], 'atras-perto': [10.9, 1.25, 10.4, 180, -8],
  teclado: [8.86, 1.6, -6.7, 0, -2], 'teclado-perto': [8.86, 1.6, -7.2, 0, 0], armario: [7.2, 1.65, 13.4, 90, -6], 'armario-perto': [8.0, 1.55, 13.4, 90, -8], cafeteira: [14.0, 1.4, 4.9, 90, -20], copos: [11.3, 1.5, 7.0, 0, -28],
  'porta-estoque': [13, 1.6, 10.2, 0, -4], 'porta-deposito': [20.2, 1.65, 17.5, 90, 0], 'deposito-visor': [20.0, 1.6, 18.6, 41.5, 8.3], 'espelho-banheiro': [18.9, 1.65, 4.85, 90, -2], 'monitor-escritorio': [5.95, 1.3, 17.6, 0, -12], 'geladeira-perto': [3.5, 1.4, 5.0, 270, -4], 'produto-solto': [5.4, 1.5, 6.6, 0, -4],
  registro: [8.5, 1.15, -6.1, 0, -30], 'mostrador-bomba': [8.5, 1.5, -6.0, 0, -8], 'lixeira-bomba': [1.9, 1.3, -5.9, 0, -22], 'lixeira-servico': [18.5, 1.5, 17.2, 160, -18], saco: [18.9, 1.5, 16.6, 150, -22],
  'mancha-loja': [13.0, 1.65, 7.0, 0, -38], 'mancha-bombas': [8.5, 1.65, -4.2, 0, -40], 'mancha-banheiro': [17.9, 1.65, 4.0, 180, -38], 'teto-loja': [8, 1.65, 5, 0, 38], lampada: [6.65, 1.65, 9.0, 0, 28],
  externa: [19, 1.65, 29, 0, -2], 'carro-valdir': [-12.5, 1.65, 20.5, 250, -5], 'fachada': [8, 1.65, 0.5, 5, 3], 'cameras': [14, 1.65, 6, 0, 30],
};
const cam = { x: 11.3, y: 1.65, z: 10.4, yaw: 0, pitch: 0 };
function setView(name) { const v = VIEWS[name]; if (v) Object.assign(cam, { x: v[0], y: v[1], z: v[2], yaw: v[3] * Math.PI / 180, pitch: v[4] * Math.PI / 180 }); }
if (q.get('v')) setView(q.get('v'));
if (q.get('cam')) { const a = q.get('cam').split(',').map(Number); Object.assign(cam, { x: a[0], y: a[1], z: a[2], yaw: a[3] * Math.PI / 180, pitch: (a[4] ?? 0) * Math.PI / 180 }); }

const state = { placaSorriso: Number(q.get('sorriso') ?? 0), doors: {}, hora: 1.25, telefoneToca: q.has('toca'), gaveta: Number(q.get('gaveta') ?? 0), sino: q.has('sino') ? 0 : undefined };
if (q.get('open')) for (const id in posto.doors) state.doors[id] = Number(q.get('open'));
// a few demo values on the pumps
posto.pumps[1]?.setDisplay('12,50'); posto.pumps[2]?.setDisplay('0,00'); posto.pumps[3]?.setDisplay('50,00'); posto.pumps[4]?.setDisplay(q.get('disp') ?? '34,70');
for (const s of posto.shelves) if (s.n % 5 === 0) s.setStock(Math.floor(s.slots / 3));
if (q.get('armario')) posto.props.armario.setOpen(Number(q.get('armario')));
if (q.get('frasco') === '0') posto.props.frasco.setVisible(false);
if (q.has('vintage')) for (const s of posto.shelves) s.setVintage(true);
if (q.get('cups')) posto.cups.setCount(Number(q.get('cups')));
if (q.has('stickers')) for (const id of posto.stickers.ids) posto.stickers.show(id, true);
if (q.has('brew')) posto.props.cafeteira.setBrewing(true);
if (q.has('displace')) { posto.displace('cadeira', [0.6, 0, -0.5], 1.2); posto.displace('balde', [1.2, 0, 0.5]); posto.displace('rodo', [0.8, 0, -1.2], 0.6); posto.displace('produto', [0.3, -1.645, -1.5]); posto.displace('escada', [0.6, 0, 0.9], 0.5); }
if (q.has('mirror')) { const c2 = document.createElement('canvas'); c2.width = c2.height = 32; const g2 = c2.getContext('2d'); g2.fillStyle = '#304048'; g2.fillRect(0, 0, 32, 32); g2.fillStyle = '#d8c070'; g2.fillRect(8, 6, 16, 20); for (const m of Object.values(posto.mirrors)) m.setTexture(c2); }
for (const k of (q.get('keys') ?? '').split(',').filter(Boolean)) posto.pumps[2].keypad.setPressed(k, true);
if (q.has('keys')) posto.pumps[2].keypad.setLed(true);
if (q.has('vidro')) { const car = buildCar(r, { seed: 4, vidro: 'escuro', capSide: 'left' }); const a = posto.anchors.carroBomba2; car.root.position.set(...a.pos); car.root.rotation.y = Math.PI / 2; car.setDriver(true); r.scene.add(car.root); }
if (q.has('cars')) {
  for (const n of [1, 3]) {
    const car = buildCar(r, { seed: n * 5, fuel: n === 1 ? 'etanol' : 'diesel', capSide: 'left' });
    const a = posto.anchors['carroBomba' + n]; car.root.position.set(...a.pos); car.root.rotation.y = Math.PI / 2; car.setDriver(true); car.setLights(n === 3); r.scene.add(car.root);
  }
}

const list = (k) => (q.get(k) ?? '').split(',').filter(Boolean);
for (const id of list('burnt')) posto.setBurnt(id, true);
for (const a of list('off')) posto.breakers.setOn(a, false);
if (q.get('qa')) state.quadroAberto = Number(q.get('qa'));
if (q.get('ladder')) posto.ladder.placeUnder(q.get('ladder'));
if (q.get('load')) posto.cart.setLoad(Number(q.get('load')));
if (q.get('dirt')) for (const id in posto.stains) posto.setDirt(id, Number(q.get('dirt')));
if (q.get('full')) for (const id in posto.bins) posto.setFull(id, true);
for (const n of list('jam')) posto.pumps[Number(n)]?.setJammed(true);
if (q.get('valve')) for (const n of [1, 2, 3, 4]) posto.pumps[n].valve.setAngle(Number(q.get('valve')) * n);
if (q.get('stock')) for (const s of posto.shelves) if (s.atras) s.setStock(Math.round(s.slots * Number(q.get('stock'))));
for (const [name, x, z, ry] of [['moto', -4.0, -6.0, 0.6], ['caminhao', 11, -4.8, Math.PI / 2]]) if (q.has(name)) {
  const m = name === 'moto' ? buildMoto(r, { seed: 3 }) : buildCar(r, { seed: 3, style: 'caminhao', capSide: 'left' });
  m.root.position.set(x, 0, z); m.root.rotation.y = ry; m.setLights(true); m.setDriver?.(true); m.setRider?.(true); r.scene.add(m.root);
}
let flash = q.has('flash');
const keys = new Set();
let fly = !q.has('walk');
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyF') flash = !flash; if (e.code === 'KeyG') fly = !fly; });
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => canvas.requestPointerLock?.());
addEventListener('mousemove', (e) => { if (document.pointerLockElement) { cam.yaw += e.movementX * 0.0025; cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch - e.movementY * 0.0025)); } });

function collide(nx, nz) {
  const rad = 0.28;
  for (const c of posto.colliders) {
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
  const cands = posto.lights.filter((l) => l.on && l.level > 0.02).map((l) => ({ l, d: Math.hypot(l.pos[0] - cam.x, l.pos[2] - cam.z) + Math.abs(l.pos[1] - cam.y) * 0.3 })).sort((a, b) => a.d - b.d).slice(0, 7);
  for (let i = 0; i < 8; i++) {
    const c = cands[i];
    if (i === 7) { const f = flash ? 1 : 0; r.point(7, { pos: [cam.x + Math.sin(cam.yaw) * 0.6, cam.y, cam.z - Math.cos(cam.yaw) * 0.6], color: new T.Color(1, 0.95, 0.8).multiplyScalar(f * 1.1), range: 14 }); continue; }
    if (c) r.point(i, { pos: c.l.pos, color: new T.Color(c.l.color).multiplyScalar(c.l.level * 1.15), range: c.l.range }); else r.point(i, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 });
  }
}

function render(t) {
  posto.update(t, state);
  applyLights();
  r.camera.position.set(cam.x, cam.y, cam.z);
  r.camera.rotation.order = 'YXZ'; r.camera.rotation.set(cam.pitch, -cam.yaw, 0);
  r.draw();
  const inf = r.renderer.info.render;
  hud.textContent = `${posto.areaAt(cam.x, cam.z)}  (${cam.x.toFixed(1)}, ${cam.z.toFixed(1)})  draws ${inf.calls}  tris ${inf.triangles}${fly ? '  [voo]' : ''}`;
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
  if (keys.has('ArrowUp')) cam.pitch = Math.min(1.4, cam.pitch + dt); if (keys.has('ArrowDown')) cam.pitch = Math.max(-1.4, cam.pitch - dt);
  if (mx || mz) { let nx = cam.x + mx * sp, nz = cam.z + mz * sp; if (!fly) [nx, nz] = collide(nx, nz); cam.x = nx; cam.z = nz; }
  render(now / 1000);
  requestAnimationFrame(loop);
}
window.__p = { posto, state, cam, r, setView, render, VIEWS, buildProp, buildCar, scene: r.scene, T };
if (q.has('manual')) render(Number(q.get('t') ?? 1.3)); else requestAnimationFrame(loop);
