// What the event scripts share: where the player looks, what is in the way, the figures that appear
// (a dark silhouette for the corner of the eye, the old attendant for the pump 4), and a fade for them.
// Everything is a function of the player's state and the seed; nothing reads a real clock.
import { buildCustomer } from '../../models/customer.js';

export function createKit(ctx) {
  const { world, player, render, data } = ctx;
  const THREE = render.THREE;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

  const kit = {
    THREE,
    /** Half of the horizontal field of view, radians (a phone held upright sees much less than a wide window). */
    edge: () => Math.atan(Math.tan(render.camera.fov * Math.PI / 360) * render.camera.aspect),
    /** Where a point is relative to where the player looks: bearing (left positive, radians) and distance, on the floor plane. */
    bearing(p) {
      const s = player.st, dx = p.x - s.x, dz = p.z - s.z;
      return { ang: wrap(Math.atan2(-dx, -dz) - s.yaw), dist: Math.hypot(dx, dz) };
    },
    /** Dot between the look direction and the direction to a point (eye height). */
    look(p) {
      a.copy(p).sub(player.eyePos()).normalize();
      return player.forward().dot(a);
    },
    dist: (p) => Math.hypot(p.x - player.st.x, p.z - player.st.z),
    /** Is the flashlight on and pointing at the point (the thing in the corner of the eye goes when the light lands on it)? */
    flashOn(p) {
      const f = ctx.inventory?.flash; if (!f || !f.on || f.charge <= 0) return false;
      a.copy(p).sub(player.eyePos()); const d = a.length(); if (d > f.range) return false;
      return player.forward().dot(a.normalize()) > 0.9;
    },
    /** "Reduce flashes" is on: a scare becomes a dark cut with the same sound, and what vanishes fades instead of cutting. */
    soft: () => Boolean(ctx.opts?.reduceFlash),
    /** Is the straight line from a to b free of walls and furniture (at chest height)? */
    clear(from, to) {
      const dx = to.x - from.x, dz = to.z - from.z;
      for (const c of world.colliders) {
        if (c.enabled === false || c.min[1] > 1.6 || c.max[1] < 1.0) continue;
        let t0 = 0, t1 = 1;
        for (const [o, d, lo, hi] of [[from.x, dx, c.min[0], c.max[0]], [from.z, dz, c.min[2], c.max[2]]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
          let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
          t0 = Math.max(t0, u); t1 = Math.min(t1, v);
          if (t0 > t1) break;
        }
        if (t0 <= t1 && t0 >= 0 && t0 <= 1) return false;
      }
      return true;
    },
    area: () => world.areaAt(player.st.x, 1, player.st.z)?.id || 'externa',
    /** A floor point at the edge of what the player sees (the corner of the eye), that the player can see from where they stand. */
    peripheral(rng, { min = 5, max = 10, side = 0 } = {}) {
      const s = player.st, E = kit.edge();
      for (let i = 0; i < 14; i++) {
        const sd = side || (rng() < 0.5 ? 1 : -1), ang = s.yaw + sd * E * (0.74 + rng() * 0.18);
        const d = min + rng() * (max - min) * (1 - i / 28);
        const x = s.x - Math.sin(ang) * d, z = s.z - Math.cos(ang) * d;
        if (player.blocked(x, z)) continue;
        const p = new THREE.Vector3(x, 0, z);
        if (!kit.clear(player.eyePos(), a.set(x, 1.4, z))) continue;
        return p;
      }
      return null;
    },
    /** A figure of the cast (by type id), standing at the origin and facing +z. */
    figure(tipoId, seed = 7) {
      const tipo = (data.cast?.tipos || []).find((t) => t.id === tipoId);
      const h = buildCustomer(render, { categoria: 'sobrenatural', ...(tipo?.aparencia || {}) }, { seed });
      h.root.visible = false; render.scene.add(h.root);
      return h;
    },
    /** Makes every part of a figure one dark, faintly transparent shape (the thing in the corner of the eye). */
    silhouette(root, color = '#040406') {
      const mats = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = render.mat(color, { transparent: true, opacity: 0, depthWrite: false, fogged: 1 });
        o.material = m; mats.push(m);
      });
      let alpha = 0;
      return { set(v) { alpha = v; for (const m of mats) m.opacity = v; }, get alpha() { return alpha; } };
    },
    face(root, p) { root.rotation.y = Math.atan2(p.x - root.position.x, p.z - root.position.z); },
    dispose(h) { if (h?.root) render.scene.remove(h.root); },
    near: (p, r) => kit.dist(p) < r,
    v3: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
    tmp: b,
  };
  return kit;
}
