// The creatures of the ring hall for the cutscenes that show the ring: the crowd of the stands and the judge.
// ring.js builds its own crowd and judge (today still the old animal models, to be swapped by the game's
// main builder). While a cutscene is on screen this module hides those and puts humanoid creatures
// (models/creatures.js) in the same places; if ring.js already builds creatures (slot species is a creature
// type, or ring.judge has joints) it leaves them alone and only drives them.
import { buildCreature, CREATURES } from '../models/creatures.js';

const CROWD = ['casca', 'fole', 'vigia', 'casca', 'fole', 'mestre'];

export function ringCreatures(r, ring, seed = 1) {
  const T = r.THREE, grp = new T.Group();
  const slots = ring.audienceSlots ?? [];
  const nativeCrowd = slots.length > 0 && CREATURES.includes(slots[0].species);
  const nativeJudge = Boolean(ring.judge?.joints);
  const olds = [];
  if (!nativeCrowd) ring.group.children.forEach((c) => { if (slots.some((q) => Math.hypot(c.position.x - q.x, c.position.y - q.y, c.position.z - q.z) < 1e-3)) olds.push(c); });
  const crowd = nativeCrowd ? [] : slots.map((q, i) => {
    const c = buildCreature(r, CROWD[i % CROWD.length], { seed: seed * 31 + i, scale: 0.95 + ((i * 37) % 10) / 100 });
    c.root.position.set(q.x, q.y, q.z); c.root.rotation.y = q.yaw; grp.add(c.root); return { c, ph: (i * 1.7) % 6.28 };
  });
  let judge = ring.judge ?? null;
  const jOld = [];
  if (!nativeJudge && ring.judge?.root) {
    jOld.push(ring.judge.root);
    const p = ring.judge.root.position;
    judge = buildCreature(r, 'apito', { seed: seed * 7 + 3, scale: 1.0 });
    judge.root.position.copy(p); judge.root.rotation.y = ring.judge.root.rotation.y; grp.add(judge.root);
  }
  const hidden = new Map();
  return {
    group: grp, judge,
    show(on) {
      grp.visible = on;
      for (const o of [...olds, ...jOld]) { if (on) { hidden.set(o, o.visible); o.visible = false; } else if (hidden.has(o)) o.visible = hidden.get(o); }
    },
    /** excite 0..1: the crowd in its excited state; call after ring.update. */
    update(t, excite = 0.9) {
      for (const { c, ph } of crowd) c.update(t + ph, excite);
      if (judge && !nativeJudge) judge.update(t, 0);
    },
    /** k 0..1: the judge raises the whistle to the mouth (arm joints are overridden after update). */
    whistle(k) {
      const J = judge?.joints; if (!J || k <= 0) return;
      J.shoulderR.rotation.x = -0.5 * k; J.shoulderR.rotation.z = -0.2 * k; J.elbowR.rotation.x = -2.3 * k; J.head.rotation.x = -0.1 * k;
    },
  };
}

/**
 * Edge rule for the crowd: a creature (or the judge) that the frame of the picture would cut is left out of that frame, so
 * the crowd is whole or absent and no limb enters by an edge. Call it every frame after the camera is known;
 * `cam` is a THREE.PerspectiveCamera used only for the projection. Creatures not cut stay as they are.
 */
export function cullCrowd(T, cam, ring, { eye, look, roll = 0, fovK = 1, aspect = 16 / 9, base = 62, keepJudge = false }) {
  const crowd = ring.audienceRoots ?? [], judge = ring.judge?.root ?? null, roots = judge ? [...crowd, judge] : crowd;
  for (const m of roots) m.visible = true;
  cam.fov = base * fovK; cam.aspect = aspect; cam.updateProjectionMatrix();
  cam.position.set(...eye); cam.up.set(0, 1, 0); cam.lookAt(...look); cam.rotateZ(roll); cam.updateMatrixWorld(true);
  const M = 0.95, box = new T.Box3(), p = new T.Vector3(), seen = [];
  for (const m of roots) {
    // the real extent of the creature (arms raised included), projected: x and y range on the picture
    box.setFromObject(m);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9, front = true;
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      if (p.z > 1) front = false;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (!front) continue;
    const cut = (a, b) => (a < M && b > M) || (a < -M && b > -M);
    if ((cut(x0, x1) || cut(y0, y1)) && !(keepJudge && m === judge)) { m.visible = false; continue; } // the judge too: whole or out, unless he is the subject (keepJudge)
    seen.push({ m, d: cam.position.distanceTo(m.position), x0, x1, y0, y1 });
  }
  // neighbours whose arms would overlap on the picture: the nearer stays, the farther is left out (the judge always stays)
  seen.sort((a, b) => (a.m === judge ? -1 : b.m === judge ? 1 : a.d - b.d));
  const kept = [], over = (a, b, f) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > f * Math.min(a.x1 - a.x0, b.x1 - b.x0) && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;
  for (const q of seen) {
    if (q.m !== judge && kept.some((k) => over(k, q, 0.7))) { q.m.visible = false; continue; }
    kept.push(q);
  }
}
