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

// ---------------------------------------------------------------------------------------------- small things lying about (R7, R9, R10)
/**
 * A small thing of the story, made of a few boxes, for a script to lay on a surface: 'fita' (a VHS tape), 'bolsa' (a handbag),
 * 'foto' (a photograph), 'envelope' (with the paper Sun leaning on it). Invisible until the script shows it; its origin is the bottom centre.
 */
export function makeThing(render, kind) {
  const T = render.THREE, g = new T.Group();
  const box = (w, h, d, color, x = 0, y = 0, z = 0) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), render.mat(color)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
  if (kind === 'fita') {
    box(0.19, 0.03, 0.105, '#1c1c22');
    box(0.12, 0.004, 0.06, '#d2c8a6', 0, 0.03, 0.012);
    box(0.03, 0.004, 0.03, '#0a0a0c', -0.045, 0.03, -0.034); box(0.03, 0.004, 0.03, '#0a0a0c', 0.045, 0.03, -0.034);
  } else if (kind === 'bolsa') {
    box(0.34, 0.21, 0.13, '#9a5a40');
    box(0.30, 0.03, 0.115, '#5e382c', 0, 0.21);
    box(0.20, 0.012, 0.012, '#4a2c22', 0, 0.245, 0); box(0.012, 0.07, 0.012, '#4a2c22', -0.1, 0.24, 0); box(0.012, 0.07, 0.012, '#4a2c22', 0.1, 0.24, 0);
  } else if (kind === 'foto') {
    box(0.13, 0.004, 0.095, '#e0d8bc');
    box(0.11, 0.002, 0.07, '#5a6a62', 0, 0.004);
    box(0.014, 0.003, 0.03, '#2a2e3a', 0, 0.006, 0.004);
    box(0.02, 0.003, 0.012, '#d8a838', 0.035, 0.006, -0.02);
  } else if (kind === 'envelope') {
    box(0.26, 0.006, 0.15, '#d9cfa4');
    box(0.12, 0.004, 0.07, '#c6bb8c', 0, 0.006);
    // the paper Sun: a round yellow face on a stick of card, leaning on the envelope
    const sun = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.004, 10), render.mat('#e8b050'));
    sun.rotation.x = Math.PI / 2 - 0.25; sun.position.set(-0.04, 0.1, -0.1); g.add(sun);
    const eye = (x) => { const e = new T.Mesh(new T.BoxGeometry(0.012, 0.012, 0.004), render.mat('#3a2410')); e.position.set(-0.04 + x, 0.115, -0.087); e.rotation.x = -0.25; g.add(e); };
    eye(-0.02); eye(0.02);
  }
  if (kind === 'envelope') g.scale.setScalar(1.5); else if (kind === 'foto') g.scale.setScalar(1.6);   // (small things need to be read from a few steps away)
  g.visible = false; render.scene.add(g);
  return g;
}
/** Registers a thing as something to examine with the interaction point; returns the id (for `interaction.unregister`). */
export function examinable(ctx, id, at, { text, tap, enabled = () => true, reach = 2.8, r = 0.35 }) {
  return ctx.interaction.register({ id, reach, priority: 1.3, aim: () => ({ c: at, r }), enabled, label: () => ({ text }), tap });
}
/** Is it time to lay a thing down? When the player is not looking its way (or is far), or when they have looked for `patience` seconds (it is simply there). */
export const unseen = (kit, at, t, patience = 60) => t > patience || kit.look(at) < 0.55 || kit.dist(at) > 7;
