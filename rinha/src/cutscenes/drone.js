// The broadcast drone-camera that hovers over the ring: a small model of ours (boxes and discs,
// materials from r.mat). pose(t, o) is a pure function of time; o.hit is the time of the impact.
export function buildDrone(r) {
  const T = r.THREE, root = new T.Group(); root.name = 'drone';
  const body = r.mat('#aeb6c8', { emissive: 0.45, fogged: 0.3 }), dark = r.mat('#4a5064', { emissive: 0.25, fogged: 0.3 });
  const lens = r.mat('#ffd070', { emissive: 1, fogged: 0.3 }), led = r.mat('#ff3a2a', { emissive: 1, fogged: 0.3 });
  const rotorM = r.mat('#dfe5f2', { opacity: 0.45, transparent: true, depthWrite: false, fogged: 0.5, side: T.DoubleSide });
  const add = (g, m, x = 0, y = 0, z = 0, p = root) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
  add(new T.BoxGeometry(0.46, 0.14, 0.46), body, 0, 0, 0);
  add(new T.BoxGeometry(0.3, 0.07, 0.3), dark, 0, 0.09, 0);
  // the camera pod hangs on a gimbal (pod) that turns its lens around while the drone hovers
  const pod = new T.Group(); pod.position.set(0, -0.12, 0.0); root.add(pod);
  add(new T.CylinderGeometry(0.09, 0.09, 0.1, 8), dark, 0, 0, 0.08, pod);
  add(new T.CylinderGeometry(0.06, 0.06, 0.04, 8), lens, 0, -0.05, 0.08, pod).rotation.x = 0.35;
  const ledMesh = add(new T.BoxGeometry(0.09, 0.07, 0.09), led, 0.15, 0.08, -0.17);
  // a pale outline (back faces of a slightly larger body) so the drone keeps its shape against a black ceiling
  const rim = r.mat('#f2f6ff', { emissive: 1, fogged: 0, side: T.BackSide });
  add(new T.BoxGeometry(0.54, 0.22, 0.54), rim, 0, 0, 0);
  const ledUnder = add(new T.BoxGeometry(0.1, 0.05, 0.1), led, -0.16, -0.09, -0.16); // the recording light, seen from below
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    add(new T.BoxGeometry(0.34, 0.04, 0.05), dark, sx * 0.3, 0.02, sz * 0.3).rotation.y = Math.PI / 4 * sx * sz;
    const rg = new T.Group(); rg.position.set(sx * 0.4, 0.08, sz * 0.4); root.add(rg);
    add(new T.CylinderGeometry(0.2, 0.2, 0.012, 10), rotorM, 0, 0, 0, rg);
    add(new T.BoxGeometry(0.4, 0.01, 0.035), dark, 0, 0.01, 0, rg);
    rotors.push(rg);
  }
  // sparks after the hit: small glowing cubes, shown for a moment
  const sparkM = r.mat('#fff0a0', { emissive: 1, fogged: 0.2 });
  const sparks = [];
  for (let i = 0; i < 9; i++) { const s = add(new T.BoxGeometry(0.11, 0.11, 0.11), sparkM, 0, 0, 0); s.visible = false; sparks.push(s); }
  /** The hover position at time t (before any impact): [x, y, z]. */
  const hoverAt = (t, base, show = false) => [base[0] + Math.sin(t * 0.6) * 0.15, base[1] + Math.sin(t * 1.7) * (show ? 0.2 : 0.08), base[2] + Math.cos(t * 0.5) * 0.1];
  const Q = new T.Quaternion(), QY = new T.Quaternion(), AX = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  /** base: hover point [x, y, z]. o: { hit, contact, push }: time of the impact (Infinity = never), the contact
   *  point on the body (world offset from the centre) and the unit direction the blow pushes the drone. After the
   *  blow the drone is shoved, tilts about 22 degrees and rocks back to level, and the sparks leave the contact point. */
  function pose(t, base, o = {}) {
    const hit = o.hit ?? Infinity, u = Math.max(0, t - hit), hov = t < hit;
    // a drone nobody has hit (the film reels that look up at it) is drawn larger and moves more: it breathes up and down
    // and turns its lens; the one of the impact shots keeps its size
    const show = o.hit === undefined;
    root.scale.setScalar(show ? 2.0 : 1);
    pod.rotation.set(hov && show ? Math.sin(t * 0.8) * 0.45 : 0, hov && show ? Math.sin(t * 1.1 + 1) * 0.9 : 0, 0);
    const hv = hoverAt(hov ? t : hit, base, show), push = o.push ?? [0, 0, -1];
    // the shove: a quick jolt along the blow that settles, plus a little sag
    const jolt = 0.3 * (1 - Math.exp(-u * 14)) * Math.exp(-u * 1.5), sag = Math.min(0.2, 0.5 * u * u);
    root.position.set(hv[0] + push[0] * jolt, hv[1] + push[1] * jolt - sag, hv[2] + push[2] * jolt);
    const yaw = t * 0.25;
    root.rotation.set(hov ? Math.sin(t * 1.1) * (show ? 0.1 : 0.03) : 0, yaw, 0);
    if (!hov) { // tilt about the horizontal axis across the blow, 22 degrees at first, rocking and calming
      const th = 0.38 * Math.exp(-u * 4.5) * Math.cos(u * 22) * (1 - Math.exp(-u * 90));
      AX.set(push[2], 0, -push[0]).normalize(); if (AX.lengthSq() < 0.5) AX.set(1, 0, 0);
      Q.setFromAxisAngle(AX, th); QY.copy(root.quaternion); root.quaternion.copy(Q.multiply(QY));
    }
    rotors.forEach((g, i) => { g.rotation.y = t * (hov ? 90 : Math.max(0, 90 - u * 100)) + i; });
    ledUnder.visible =
    ledMesh.visible = hov ? Math.floor(t * 2) % 2 === 0 : Math.floor(u * 14) % 2 === 0;
    // sparks: born at the contact point (given in the drone's own frame at the time of the blow), spreading and falling
    const c = o.contact ?? [0, -0.1, 0], cl = new T.Vector3(c[0], c[1], c[2]).applyAxisAngle(UP, -(hit * 0.25));
    sparks.forEach((s, i) => {
      const on = !hov && u < 0.6 && Math.floor(u * 40 + i) % 3 !== 0; s.visible = on;
      if (!on) return;
      const a = i * 2.4 + 0.7, el = ((i * 5) % 7) / 7 * 1.4 - 0.5, sp = 1.1 + (i % 4) * 0.5;
      s.position.set(cl.x + Math.cos(a) * Math.cos(el) * sp * u, cl.y + Math.sin(el) * sp * u - 4.5 * u * u, cl.z + Math.sin(a) * Math.cos(el) * sp * u);
      s.scale.setScalar(Math.max(0.25, 1 - u * 1.4));
    });
  }
  return { root, pose, hoverAt };
}
