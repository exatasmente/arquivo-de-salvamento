// What the branch scripts share: the pavement spot where the street dweller stands and sleeps, and his figure.
import { buildCustomer } from '../../models/customer.js';

/** The places by the kerb where he stays (a bin of the forecourt, the poster by the road): the first free one is his spot, the same every night. */
export function sleepSpot(world, THREE) {
  const out = [];
  for (const n of [1, 2, 3, 4]) {
    const b = world.aimBox('lixeira' + n, 0);
    if (b) { const c = b.getCenter(new THREE.Vector3()); out.push({ x: c.x - 0.9, z: c.z + 0.55, face: [c.x, c.z] }); }
  }
  const k = world.anchor('cartazFora'); if (k) out.push({ x: k.pos.x - 1.1, z: k.pos.z - 0.7, face: [k.pos.x, k.pos.z + 2] });
  return out[0] || null;
}
/** The figure of the street dweller (the look of the cast), invisible, in the scene. */
export function moradorFigure({ render, data }) {
  const cast = (data.cast?.tipos || []).find((t) => t.id === 'morador-de-rua');
  const h = buildCustomer(render, { categoria: 'comum', ...(cast?.aparencia || {}) }, { seed: cast?.aparencia?.seed ?? 88 });
  h.root.visible = false; render.scene.add(h.root);
  return h;
}
/** Lays a figure down on the pavement (the head toward the kerb): rotated flat and raised a little. */
export function lieDown(root, sp) {
  root.rotation.order = 'YXZ';
  root.rotation.set(-Math.PI / 2, Math.atan2(sp.face[0] - sp.x, sp.face[1] - sp.z) + Math.PI, 0);
  root.position.set(sp.x, 0.16, sp.z);
}
