// The hose between the body of a pump and its nozzle: a tube along a drooping curve, rebuilt when the nozzle moves (a few dozen triangles). It hangs in a loop
// when the nozzle is on its hook, follows the nozzle in the hand and into the tank of the car, and does not go through the floor, the car or the player in an absurd way
// (its middle points are pushed up over a box or aside from the player). Pure function of the two ends: no clock, no random.
//
//   createHose(r, { radius, length }) -> { root, set(from, to, { player?, boxes? }), hide() }
//   from, to: world points ({ x, y, z } or [x, y, z]); player: { x, z }; boxes: [{ min: [x, y, z], max: [x, y, z] }] (colliders)
const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);

export function createHose(r, { radius = 0.022, length = 3.4, color = '#17171c' } = {}) {
  const T = r.THREE;
  const mat = r.mat(color, { fogged: 1 });
  const mesh = new T.Mesh(new T.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.name = 'mangueira';
  const root = new T.Group(); root.add(mesh); root.name = 'mangueira';
  const N = 8;
  function set(from, to, { player = null, boxes = null } = {}) {
    const a = pt(from), b = pt(to), d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    // slack: a hose longer than the distance droops in the middle; one that is stretched hardly does
    const sag = d < length ? 0.5 * Math.sqrt(1 - (d / length) ** 2) + 0.05 : 0.03;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = new T.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - sag * Math.sin(Math.PI * u), a.z + (b.z - a.z) * u);
      if (i > 0 && i < N) {
        p.y = Math.max(0.06, p.y);
        if (boxes) for (const c of boxes) if (p.x > c.min[0] - 0.05 && p.x < c.max[0] + 0.05 && p.z > c.min[2] - 0.05 && p.z < c.max[2] + 0.05 && p.y < c.max[1] + 0.04 && p.y > c.min[1] - 0.2 && c.max[1] > 0.3) p.y = c.max[1] + 0.05;
        if (player && u < 0.85) { const dx = p.x - player.x, dz = p.z - player.z, dd = Math.hypot(dx, dz); if (dd < 0.42 && p.y < 1.8) { const k = (0.42 - dd) / (dd || 1); p.x += dx * k + (dd ? 0 : 0.42); p.z += dz * k; } }
      }
      pts.push(p);
    }
    const geo = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, radius, 5, false);
    mesh.geometry.dispose(); mesh.geometry = geo;
  }
  return { root, mesh, set, length, dispose() { mesh.geometry.dispose(); } };
}
