// Preview of the Sol entity: one sheet per pose with the four stages, far (top row) and close (bottom row).
//   ?pose=<name>   window.__ent.sheet(pose, t)
import { createRender } from '../src/render.js';
import { buildEntity, ENTITY_POSES } from '../src/models/entity.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), sheet = document.getElementById('sheet');
const r = createRender(canvas); const T = r.THREE;
r.resize(384, 216);
r.light({ ambient: '#6a6a78', key: '#8a8678', keyDir: [-0.3, -1, -0.6], fog: '#0b0c12', fogNear: 10, fogFar: 30 });
r.camera.rotation.order = 'YXZ';
for (let i = 0; i < r.POINT_LIGHTS; i++) r.point(i, { pos: [0, -50, 0], color: new T.Color(0, 0, 0), range: 1 });
r.point(0, { pos: [0.4, 2.8, 2.6], color: new T.Color(0.6, 0.64, 0.7), range: 9 });
r.point(1, { pos: [-1.2, 1.5, 1.8], color: new T.Color(0.3, 0.26, 0.2), range: 6 });
r.scene.add(new T.Mesh(new T.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), r.mat(0xffffff, { map: 'floor', repeat: 6 })));

const ents = [1, 2, 3, 4].map((s) => buildEntity(r, { seed: 1998, stage: s }));
let cur = null;
const g = sheet.getContext('2d');
function cell(i, cols, ent, pose, t, mode, text) {
  if (cur) r.scene.remove(cur.root);
  ent.setPose(pose, t); r.scene.add(ent.root); cur = ent;
  if (mode === 'far') { r.camera.position.set(0, 1.2, 2.5); r.camera.rotation.set(-0.05, 0, 0); }
  else { const back = pose === 'costas'; r.camera.position.set(0, ent.height * 0.855, 0.6); r.camera.rotation.set(0, 0, 0); }
  r.draw();
  const x = (i % cols) * 384, y = Math.floor(i / cols) * 216;
  g.drawImage(canvas, x, y); g.font = '10px monospace'; g.fillStyle = '#000'; g.fillText(text, x + 5, y + 13); g.fillStyle = '#cfe'; g.fillText(text, x + 4, y + 12);
}
window.__ent = {
  ready: true, POSES: ENTITY_POSES, ents,
  sheet(pose, t = 1.3, opts = {}) {
    sheet.width = 384 * 4; sheet.height = 216 * 2; sheet.style.width = sheet.width * 2 + 'px'; sheet.style.height = sheet.height * 2 + 'px';
    g.imageSmoothingEnabled = false; g.fillStyle = '#101014'; g.fillRect(0, 0, sheet.width, sheet.height);
    ['far', 'near'].forEach((mode, m) => ents.forEach((e, s) => {
      const tt = pose === 'observar' || pose === 'inclinar' || pose === 'sumir' ? t : t;
      if (pose === 'observar') { e.setPose('observar', t, { base: opts.base ?? 'costas' }); }
      cell(m * 4 + s, 4, e, pose, tt, mode, `estagio ${s + 1} - ${pose} - ${mode === 'far' ? 'longe' : 'perto'}`);
    }));
  },
};
if (q.get('pose')) window.__ent.sheet(q.get('pose'), Number(q.get('t') ?? 1.3));
