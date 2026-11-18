// Preview of the street, for the art direction and the tests: tools/city/preview.html?cam=primeira2&day=0
// cam: primeira | primeira2 | terceira | alto | rua | norte | sul | <eye x,y,z>/<at x,y,z>. Sets window.__city = { ready, tris, calls, fps } when the picture is drawn.
import { createRender } from '../../src/render.js';
import { buildScene } from '../../src/scenes/rua.js';
import { countTris } from '../../src/models/kit.js';

const q = new URLSearchParams(location.search);
const day = Number(q.get('day') ?? 0), cam = q.get('cam') ?? 'primeira';
const W = Number(q.get('w') ?? 1280), H = Number(q.get('h') ?? 720);
const canvas = document.getElementById('c');
const r = createRender(canvas); r.resize(W, H);
const sc = buildScene(r);
r.scene.add(sc.group);
const PRE = {
  primeira: [[-36, 1.7, 8.4], [-8, 3.4, -9]], primeira2: [[18, 1.7, 7.5], [-10, 4, -14]], terceira: [[-33.4, 2.5, 8.7], [-26, 1.5, 8.7]],
  alto: [[-22, 14, 30], [0, 2, -2]], rua: [[-40, 1.7, 3], [20, 3, -2]], norte: [[10, 1.7, 4], [14, 5, -16]], sul: [[-8, 1.7, -4], [-12, 5, 16]],
};
let eye, at;
if (PRE[cam]) [eye, at] = PRE[cam];
else { const [a, b] = cam.split('/'); eye = a.split(',').map(Number); at = b.split(',').map(Number); }
if (q.has('focus')) { const f = sc.ents.pos(q.get('focus')), o = (q.get('off') ?? '4,1.6,5').split(',').map(Number); at = [f[0], f[1] + 1, f[2]]; eye = [f[0] + o[0], f[1] + o[1], f[2] + o[2]]; }
const fov = Number(q.get('fov') ?? 0);
r.camera.position.set(...eye); r.camera.lookAt(...at); if (fov) { r.camera.fov = fov; r.camera.updateProjectionMatrix(); }
sc.setDaylight(day);
sc.update(1, { listener: eye });
const FR = Number(q.get("frames") ?? 12);
let n = 0, t0 = performance.now();
function loop() {
  sc.update(1 + n * 0.016, { listener: eye }); r.draw(); n++;
  if (n === 3) {
    const T = r.THREE, fr = new T.Frustum(), pm = new T.Matrix4(); r.camera.updateMatrixWorld(); pm.multiplyMatrices(r.camera.projectionMatrix, r.camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    let calls = 0, tris = 0; sc.group.traverse((m) => { if (!m.isMesh) return; for (let q = m; q; q = q.parent) if (!q.visible) return; if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); const bs = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld); if (fr.intersectsSphere(bs)) { calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
    window.__draw = { calls, tris: Math.round(tris) };
  }
  if (n === 3) window.__city = { draw: window.__draw, ready: true, tris: countTris(sc.group), calls: r.renderer.info.render.calls, trisDrawn: r.renderer.info.render.triangles };
  if (n < FR) requestAnimationFrame(loop); else window.__city.fps = (n * 1000) / (performance.now() - t0);
}
requestAnimationFrame(loop);
window.__scene = sc; window.__r = r;
