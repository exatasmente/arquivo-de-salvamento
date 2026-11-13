// Preview of the cast: contact sheets of every type and recurring customer in every pose.
//   ?who=<id>            one customer in the six poses (id from data/cast.json; add &variante=volta)
//   ?pose=<name>&ids=a,b every listed customer (default all) in one pose
//   ?close=<id>          a close-up of face and chest
// window.__cast.sheetWho(id, cols), sheetPose(pose, ids), close(id), errors, ready
import { createRender } from '../src/render.js';
import { buildCustomer, POSES } from '../src/models/customer.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), sheet = document.getElementById('sheet'), hud = document.getElementById('hud');
const r = createRender(canvas);
const T = r.THREE;
r.resize(384, 216);
r.light({ ambient: '#8a8a98', key: '#9a9688', keyDir: [-0.3, -1, -0.6], fog: '#0b0c12', fogNear: 14, fogFar: 40 });
r.camera.rotation.order = 'YXZ';
for (let i = 0; i < r.POINT_LIGHTS; i++) r.point(i, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 });
r.point(0, { pos: [0.6, 2.8, 2.4], color: new T.Color(0.55, 0.62, 0.7), range: 9 });
r.point(1, { pos: [-1.5, 1.6, 2.0], color: new T.Color(0.35, 0.3, 0.22), range: 6 });

const floor = new T.Mesh(new T.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), r.mat(0xffffff, { map: 'floor', repeat: 6 }));
r.scene.add(floor);

const cast = await (await fetch('../data/cast.json')).json();
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
const entries = [];
for (const rec of cast.recorrentes) entries.push({ id: rec.id, nome: rec.nome, cat: 'recorrente', spec: { categoria: 'recorrente', ...rec.aparencia }, seed: rec.aparencia.seed, rec });
for (const t of cast.tipos) {
  const a = t.aparencia.pessoas ? t.aparencia.pessoas[0] : t.aparencia;
  entries.push({ id: t.id, nome: t.nome, cat: t.categoria, spec: { categoria: t.categoria, ...a }, seed: 100 + entries.length * 7, tipo: t, extra: t.aparencia.pessoas?.slice(1) });
}

const casal = cast.tipos.find((t) => t.id === 'casal-festa');
entries.push({ id: 'casal-festa-ela', nome: 'Casal (ela)', cat: 'comum', spec: { categoria: 'comum', ...casal.aparencia.pessoas[1] }, seed: 5, tipo: casal });
let current = null;
function place(e, pose, t, variante) {
  if (current) r.scene.remove(current.root);
  const spec = { ...e.spec, id: e.id }; if (variante) spec.variante = variante;
  const c = buildCustomer(r, spec, { seed: e.seed });
  c.setPose(pose, t); r.scene.add(c.root); current = c; return c;
}
function frame(c, mode = 'full') {
  const h = c.height;
  const full = mode === 'full';
  const d = full ? 1.95 : 0.8, y = full ? h * 0.5 : h * 0.86, lookY = full ? h * 0.5 : h * 0.84;
  r.camera.position.set(0.0, full ? y + 0.1 : lookY + 0.02, d + (c.pose === 'apontando' && full ? 0.3 : 0));
  r.camera.rotation.set(full ? -0.04 : -0.02, 0, 0);
}
function shot(e, pose, t, mode, variante) {
  const c = place(e, pose, t, variante);
  frame(c, mode);
  r.draw();
  return c;
}
function setup(cells, cols) {
  const rows = Math.ceil(cells / cols);
  sheet.width = 384 * cols; sheet.height = 216 * rows;
  sheet.style.width = sheet.width * 2 + 'px'; sheet.style.height = sheet.height * 2 + 'px';
  const g = sheet.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#101014'; g.fillRect(0, 0, sheet.width, sheet.height);
  return g;
}
function label(g, x, y, text) { g.font = '10px monospace'; g.fillStyle = '#000'; g.fillText(text, x + 5, y + 13); g.fillStyle = '#cfe'; g.fillText(text, x + 4, y + 12); }
function paint(g, i, cols, text) {
  const x = (i % cols) * 384, y = Math.floor(i / cols) * 216;
  g.drawImage(canvas, x, y); label(g, x, y, text);
}
const api = {
  errors, entries, POSES,
  sheetWho(id, cols = 3, variante, poses = POSES) {
    const e = entries.find((x) => x.id === id); const g = setup(poses.length, cols);
    poses.forEach((p, i) => { shot(e, p, 1.3 + i * 0.37, 'full', variante); paint(g, i, cols, `${e.nome} (${e.cat}) - ${p}${variante ? ' / ' + variante : ''}`); });
    hud.textContent = id;
  },
  sheetPose(pose, ids, cols = 4) {
    const list = (ids ?? entries.map((e) => e.id)).map((id) => entries.find((e) => e.id === id)); const g = setup(list.length, cols);
    list.forEach((e, i) => { shot(e, e.id === 'frentista-antigo' ? 'costas' : pose, 1.3, 'full'); paint(g, i, cols, `${e.nome} - ${pose}`); });
  },
  close(ids, cols = 3) {
    const list = ids.map((id) => entries.find((e) => e.id === id)); const g = setup(list.length, cols);
    list.forEach((e, i) => { shot(e, 'parado', 1.0, 'close'); paint(g, i, cols, e.nome + ' (close)'); });
  },
  triangles() { return r.renderer.info.render.triangles; },
  ready: true,
};
window.__cast = api;
if (q.get('who')) api.sheetWho(q.get('who'), 3, q.get('variante') || undefined);
else if (q.get('pose')) api.sheetPose(q.get('pose'), q.get('ids')?.split(','));
else if (q.get('close')) api.close(q.get('close').split(','));
