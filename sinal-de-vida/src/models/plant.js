// Feet that stay where they were put down. The clips play in place and the caller moves the root; whatever the two do not agree on
// (a blend of two gaits, a start or a stop, a turn on the spot, a body pushed along a path in a cutscene) would show as a foot gliding
// over the floor. This pass runs after the clips have posed the bones: while the clip says a foot is down, its point of contact is held
// where it touched the floor and the leg (two bones and the foot) is bent to reach it; when the clip lifts it, it is let go. A foot held
// too far from where the clip wants it (the body turned on the spot, or moved on without a step) takes a step there: it lifts, travels
// and is put down again, one foot at a time (or two of a dog's four).
//
//   const feet = plantFeet(THREE, root, legs, opts)
//     legs: [{ hip, knee, foot, toe, bend }]   hip and knee: the two bones the pass turns (thigh and calf); foot: the bone at the
//                end of the knee's, whose turn in the world is kept as the clip's; toe: what touches the floor (a bone or a point);
//                bend: the way the joint folds when the leg is straight (1: the foot swings back, a person's knee; -1: forward)
//     opts:   rest (the toe's height over the floor when it is down), down / up (how far over `rest` it counts as down, and as lifted
//             again), reach (metres the held toe may be from the clip's before it steps), turn (radians the body may turn over a held
//             foot before it steps), step (seconds of a step), lift (metres it lifts), pairs (how many may step at once),
//             far (metres from the clip's at which a held toe steps at once, whatever the others do: none unless given, here or to apply()),
//             above (the toe must be this far below the hip to count as down: a body lying on the floor does not plant its feet),
//             still (m/s: a foot coming down is held only once it has nearly stopped over the floor, or `settle` seconds after it came down),
//             level (true: a foot's height is read in the root's own frame, so a body the caller tips over (a dog rearing against a wall)
//             keeps on the floor the feet its clip keeps there, and the legs reach down for it)
//   feet.apply(dt, { ground, on, far, turn })   after the clips: ground is the floor's height (world y) under the root, `on` 0..1 how much of
//                the planting applies (0 lets every foot go: a seated body, one lying down). dt 0 holds what is held without moving on.
//                `turn` (radians) in place of opts.turn for this call: Infinity while a clip makes the turn's steps itself.
//                `may`: [bool per leg], which feet may be held now (a gait's clip says which foot carries him; the other only passes low);
//                `steps: false`: a held foot too far from the clip's is let go instead of stepping (in a gait the clip does the stepping);
//                `reach` in place of opts.reach for this call.
//   feet.keep(fn)   runs fn (a turn of the hips over the feet) and bends the legs so that the feet stay where they were
//   feet.terrain(dt, { ground, base, hips, on, standing })   after apply(): each foot onto its own ground. The clips are made on a flat floor at
//                the root's height (`base`); `ground(x, z)` gives the height of what is really under a point (a tread of a stair, a step, a
//                slope; null where there is none). Each foot keeps the height the clip gives it over the floor, over its own ground (a foot
//                in the air looks a little ahead, so it clears the edge of the tread it is going to); the hips (`hips`: the bone) come down
//                as far as the leg of the lower foot that carries him needs to reach it (or go up, if both feet stand higher), on a
//                damped spring, and the legs are bent again to reach (two bones); a foot standing on a
//                slope tilts with it; standing, his weight goes a little over the lower foot. A foot with a drop under it deeper than he
//                can step (0.3 m standing, 0.5 m going) stays level, over the edge. Returns { hips (metres the hips moved), feet: [metres each] }.
//   feet.reset()   lets every foot go at once (a jump in time: a teleport, a cut of the film)
//   feet.legs      the state of each foot: { state: 'free' | 'down' | 'step', at (the held point), w }
const E = 1e-6;

export function plantFeet(T, root, legs, o = {}) {
  const opt = { rest: 0.04, down: 0.03, up: 0.055, reach: 0.13, turn: 0.55, step: 0.2, lift: 0.07, pairs: 1, above: 0.25, still: Infinity, settle: 0.1, level: false, far: Infinity, ...o };
  const v = () => new T.Vector3(), q = () => new T.Quaternion();
  const C = v(), A = v(), H = v(), K = v(), G = v(), P = v(), t1 = v(), t2 = v(), n = v(), back = v(), Lc = v(), qf = q(), qa = q(), qb = q(), qp = q();
  const inv = new T.Matrix4();
  const UP = new T.Vector3(0, 1, 0);
  const L = legs.map((l) => ({ ...l, state: 'free', w: 0, at: v(), from: v(), to: v(), k: 0, yaw: 0, out: v(), wasDown: false, steps: 0, held: 0, off: 0, offMax: 0, prev: v(), seen: false, since: 0 }));
  const yawOf = () => { const e = root.matrixWorld.elements; return Math.atan2(e[8], e[10]); };
  const ease = (x) => x * x * (3 - 2 * x);
  /** Turns a bone by a rotation given in the world (premultiplied), keeping its parent. */
  function turnWorld(b, rot) {
    b.getWorldQuaternion(qa); b.parent.getWorldQuaternion(qp);
    qa.premultiply(rot); b.quaternion.copy(qp.invert().multiply(qa));
    b.updateMatrixWorld(true);
  }
  function setWorld(b, wq) { b.parent.getWorldQuaternion(qp); b.quaternion.copy(qp.invert().multiply(wq)); b.updateMatrixWorld(true); }
  /** The two bones bent so that the foot's bone reaches `goal` (world), the foot keeping the clip's turn. */
  function reachTo(l, goal, footQ) {
    l.hip.getWorldPosition(H); l.knee.getWorldPosition(K); l.foot.getWorldPosition(A);
    const l1 = H.distanceTo(K), l2 = K.distanceTo(A);
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min((l1 + l2) * 0.9995, H.distanceTo(goal)));
    t1.subVectors(A, K); t2.subVectors(H, K);
    const cur = t1.angleTo(t2), want = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    n.crossVectors(t1, t2);
    if (n.lengthSq() < 1e-8) {          // straight: it folds the way this joint folds
      back.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(qb)).multiplyScalar(l.bend ?? 1);
      n.crossVectors(t1, back);
    }
    if (n.lengthSq() > 1e-10 && Math.abs(cur - want) > 1e-5) turnWorld(l.knee, qb.setFromAxisAngle(n.normalize(), cur - want));
    l.foot.getWorldPosition(A);
    t1.subVectors(A, H).normalize(); t2.subVectors(goal, H).normalize();
    if (t1.dot(t2) < 0.999999) turnWorld(l.hip, qb.setFromUnitVectors(t1, t2));
    setWorld(l.foot, footQ);
  }
  const kept = L.map(() => ({ p: v(), q: q() }));
  const ter = { p: 0, v: 0, lean: 0, fb: 0, fv: 0, seen: false };        // the ground under each foot (terrain): how far the hips have moved, his weight over the lower foot
  for (const l of L) { l.gy = 0; l.tilt = 0; l.gSeen = false; }
  const api = {
    legs: L,
    /** Runs `fn` (which turns the hips, say) and then puts every foot back where it was: the legs bend, the feet do not move. */
    keep(fn) {
      root.updateMatrixWorld(true);
      L.forEach((l, i) => { l.foot.getWorldPosition(kept[i].p); l.foot.getWorldQuaternion(kept[i].q); });
      fn();
      L.forEach((l, i) => reachTo(l, kept[i].p, kept[i].q));
    },
    reset() { for (const l of L) { l.state = 'free'; l.w = 0; l.seen = false; l.gSeen = false; } ter.seen = false; },
    terrain(dt, { ground = null, base = 0, hips = null, on = 1, standing = 1 } = {}) {
      root.updateMatrixWorld(true);
      const deep = 0.3 + 0.2 * (1 - standing), out = { hips: 0, feet: L.map(() => 0) };
      let low = Infinity, lowStance = Infinity, hi = -Infinity, lowLeg = null, any = false, need = 0;
      for (const l of L) {
        l.toe.getWorldPosition(C); l.foot.getWorldPosition(A);
        const clear = C.y - base - opt.rest, fx = C.x - A.x, fz = C.z - A.z, fl = Math.hypot(fx, fz) || 1;
        let want = 0, tilt = 0;
        if (ground && on > 0) {
          const gb = ground(C.x, C.z), ga = ground(A.x, A.z);
          let g = Math.max(gb ?? base, ga ?? base);
          if (clear > 0.03) { const gf = ground(C.x + fx / fl * 0.1, C.z + fz / fl * 0.1); if (gf != null && gf - base < 0.6) g = Math.max(g, gf); }      // (in the air: over the edge ahead)
          want = g - base;
          if (want < -deep || want > 0.62) want = 0;                                                 // a drop too deep to step into, or a wall: level
          if (gb != null && ga != null && Math.abs(gb - ga) < 0.09 && clear < 0.06) tilt = Math.atan2(gb - ga, fl);      // a slope under the sole (a riser is not one)
        }
        const k = dt > 0 && l.gSeen ? dt : Infinity, up = clear < 0.03 ? 12 : 7, dn = clear < 0.03 ? 9 : 5;
        l.gy = l.gSeen ? l.gy + Math.max(-dn * k, Math.min(up * k, want - l.gy)) : want;
        l.tilt = l.gSeen ? l.tilt + (tilt - l.tilt) * Math.min(1, k * 10) : tilt;
        if (dt > 0 || !l.gSeen) l.gSeen = true;
        low = Math.min(low, l.gy); hi = Math.max(hi, l.gy); if (clear < 0.05 && l.gy < lowStance) lowStance = l.gy;
        // how far the hips must come down for this leg to reach its foot there, if it carries him (no further: on a stair the body goes
        // up steadily and the legs do the work; brought all the way down to the lower foot at each step, it jolted)
        if (clear < 0.05 && l.gy < 0) { l.hip.getWorldPosition(H); l.knee.getWorldPosition(K); const reach = (H.distanceTo(K) + K.distanceTo(A)) * 0.985, hor = Math.hypot(A.x - H.x, A.z - H.z), d = hor < reach ? (H.y - (A.y + l.gy)) - Math.sqrt(reach * reach - hor * hor) : -l.gy; need = Math.max(need, Math.min(-l.gy, d)); }
        if (lowLeg === null || l.gy < lowLeg.gy) lowLeg = l;
        if (Math.abs(l.gy) > 1e-4 || Math.abs(l.tilt) > 1e-4) any = true;
      }
      // the hips follow the lower foot that is on the floor (the lower of the two when both are in the air), eased
      // (as a damped spring: the hips neither jump nor are left behind when the foot that carries him changes its tread)
      const lowest = Number.isFinite(lowStance) ? lowStance : low, hw = lowest > 0 ? lowest : Math.max(lowest, -need), kk = dt > 0 && ter.seen ? Math.min(1, dt * 11) : 1, W0 = 16;
      if (ter.seen && dt > 0) { for (let h = Math.min(dt, 0.05), left = dt; left > 1e-6; left -= h) { const d = Math.min(h, left); ter.v += (W0 * W0 * (hw - ter.p) - 2 * W0 * ter.v) * d; ter.p += ter.v * d; } } else if (!ter.seen) { ter.p = hw; ter.v = 0; }
      // (the root itself may turn a corner of height in a frame, where a ramp begins or ends: the hips take it on the same kind of spring)
      if (ter.seen && dt > 0 && Math.abs(ter.fb - base) < 0.3) { for (let h = Math.min(dt, 0.05), left = dt; left > 1e-6; left -= h) { const d = Math.min(h, left); ter.fv += (W0 * W0 * (base - ter.fb) - 2 * W0 * ter.fv) * d; ter.fb += ter.fv * d; } } else if (!ter.seen || Math.abs(ter.fb - base) >= 0.3) { ter.fb = base; ter.fv = 0; }
      const ride = ground && on > 0 ? Math.max(-0.12, Math.min(0.12, ter.fb - base)) : 0;
      const lean = standing * Math.max(0, Math.min(1, (hi - low) / 0.2)) * 0.03;
      ter.lean = ter.seen ? ter.lean + (lean - ter.lean) * kk : lean;
      if (dt > 0 || !ter.seen) ter.seen = true;
      if (!any && Math.abs(ter.p) < 1e-4 && Math.abs(ride) < 1e-4) return out;
      // where each ankle goes (taken before the hips move), then the hips, then the legs
      const goals = L.map((l) => { l.foot.getWorldPosition(A); l.foot.getWorldQuaternion(qf); const g = { p: A.clone(), q: qf.clone() }; g.p.y += l.gy * on;
        if (Math.abs(l.tilt) > 1e-4) { l.toe.getWorldPosition(C); t1.set(C.x - A.x, 0, C.z - A.z).normalize(); n.crossVectors(t1, UP); g.q.premultiply(qb.setFromAxisAngle(n, l.tilt * on)); }
        return g; });
      if (hips) {
        t2.set(0, (ter.p + ride) * on, 0);
        if (ter.lean > 1e-4 && lowLeg) { lowLeg.foot.getWorldPosition(A); hips.getWorldPosition(H); t1.set(A.x - H.x, 0, A.z - H.z); const d = t1.length(); if (d > 1e-4) t2.addScaledVector(t1, ter.lean * on / d); }
        // (the hips' own place is in their parent's frame)
        hips.parent.updateWorldMatrix(true, false); inv.copy(hips.parent.matrixWorld).invert();
        hips.getWorldPosition(H); H.add(t2).applyMatrix4(inv); hips.position.copy(H); hips.updateMatrixWorld(true);
        out.hips = (ter.p + ride) * on;
      }
      L.forEach((l, i) => { reachTo(l, goals[i].p, goals[i].q); out.feet[i] = l.gy * on; });
      return out;
    },
    apply(dt, { ground = 0, on = 1, far = opt.far, turn = opt.turn, may = null, steps = true, reach = opt.reach } = {}) {
      root.updateMatrixWorld(true);
      const yaw = yawOf();
      if (opt.level) inv.copy(root.matrixWorld).invert();
      let stepping = L.filter((l) => l.state === 'step').length;
      for (const [li, l] of L.entries()) {
        l.toe.getWorldPosition(C); l.hip.getWorldPosition(H);
        const h = opt.level ? Lc.copy(C).applyMatrix4(inv).y + root.matrixWorld.elements[13] - ground : C.y - ground;
        const down = on > 0.5 && (!may || may[li] !== false) && h < opt.rest + (l.wasDown ? opt.up : opt.down) && H.y - C.y > opt.above;
        // how fast the clip's foot goes over the floor (it is still landing while it slides on)
        const speed = l.seen && dt > 0 ? Math.hypot(C.x - l.prev.x, C.z - l.prev.z) / dt : 0;
        if (dt > 0) { l.prev.copy(C); l.seen = true; }
        l.since = down ? (l.wasDown ? l.since + dt : 0) : 0;
        l.wasDown = down;
        if (dt > 0) {
          if (l.state === 'free') {
            if (down && (speed < opt.still || l.since >= opt.settle)) { l.state = 'down'; l.at.copy(C); l.at.y = opt.level ? ground + Math.max(opt.rest, h) : Math.max(C.y, ground + opt.rest); l.yaw = yaw; l.w = 1; }
            else l.w = Math.max(0, l.w - dt / 0.12);
          } else if (l.state === 'down') {
            if (!down) { l.state = 'free'; l.w = Math.max(0, 1 - dt / 0.12); }
            else {
              let dy = yaw - l.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
              const err = Math.hypot(l.at.x - C.x, l.at.z - C.z);
              l.held++; l.off += err; l.offMax = Math.max(l.offMax, err);          // (how far a held foot is from the clip's: the tests read it)
              if (err > reach || Math.abs(dy) > turn) {
                // too far from where the clip wants it: a foot the clip is lifting anyway is let go; one it keeps on the floor steps there
                // (one at a time, unless it is `far` beyond its reach: then it steps at once, the leg is not stretched after it)
                if (h > opt.rest + opt.down || !steps) { l.state = 'free'; l.w = Math.max(0, 1 - dt / 0.12); }
                else if (stepping < opt.pairs || err > far) {
                  // a long step takes longer and lifts higher (as far as about two short ones)
                  const long = Math.max(1, Math.min(2.2, err / (opt.reach * 2.5)));
                  l.state = 'step'; l.k = 0; l.from.copy(l.at); l.dur = opt.step * long; l.up = opt.lift * Math.min(2, long); stepping++; l.steps++;
                }
              }
            }
          } else if (l.state === 'step') {
            l.k += dt / (l.dur ?? opt.step);
            if (l.k >= 1) {
              stepping--;
              l.at.copy(l.to); l.at.y = Math.max(C.y, ground + opt.rest);
              if (down) { l.state = 'down'; l.yaw = yaw; l.w = 1; } else l.state = 'free';
            }
          }
        }
        if (on <= 0) { l.state = 'free'; l.w = 0; }
        // where the toe goes now
        if (l.state === 'down') P.set(l.at.x, opt.level ? ground + Math.max(opt.rest, h) : Math.max(C.y, ground + opt.rest), l.at.z);      // (and never into the floor)
        else if (l.state === 'step') {
          // up first, over, then down: the foot leaves the floor before it moves and is put down where it goes
          // (where it is put down follows the clip's foot until late in the step, then stays: it lands where it was going, not sliding after it)
          const kk = Math.min(1, l.k), k = ease(Math.max(0, Math.min(1, (kk - 0.1) / 0.62))), y1 = opt.level && down ? ground + Math.max(opt.rest, h) : C.y;
          if (kk < 0.55) {
            l.to.copy(C);
            // the clip's foot went on moving (the body turned further, or knelt): the step grows longer and higher with it
            const far = Math.max(1, Math.min(2.2, Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z) / (opt.reach * 2.5)));
            l.dur = Math.max(l.dur ?? opt.step, opt.step * far); l.up = Math.max(l.up ?? opt.lift, opt.lift * Math.min(2, far));
          }
          P.lerpVectors(l.from, l.to, k); P.y = l.from.y + (y1 - l.from.y) * k + (l.up ?? opt.lift) * Math.sin(Math.PI * kk) ** 0.6;
        }
        else P.set(l.at.x, C.y, l.at.z);
        let w = l.state === 'free' ? l.w * on : on;
        // level: a foot in the air over a tipped body keeps the clip's height over the floor (the swing does not drag through it)
        if (opt.level && l.state === 'free' && on > 0.5 && h < opt.rest + 0.3 && root.matrixWorld.elements[13] - ground < 0.02) { P.set(P.x + (C.x - P.x) * (1 - w), ground + Math.max(opt.rest, h), P.z + (C.z - P.z) * (1 - w)); w = 1; }
        if (w < E) { l.out.copy(C); continue; }
        P.lerpVectors(C, P, w);
        if (on > 0.5) P.y = Math.max(P.y, ground + opt.rest * 0.5);          // (a held or stepping foot never goes into the floor)
        l.out.copy(P);
        if (P.distanceToSquared(C) < 1e-10) continue;
        l.foot.getWorldQuaternion(qf); l.foot.getWorldPosition(A);
        G.copy(A).add(P).sub(C);           // the foot's bone goes where the toe's offset from it puts the toe on the held point
        reachTo(l, G, qf);
      }
    },
  };
  return api;
}

/** Turns a bone by `rot`, a turn given in the world (it goes on before the bone's own), keeping its parent where it is. */
export function turnBoneWorld(T, b, rot) {
  const qa = b.getWorldQuaternion(new T.Quaternion()), qp = b.parent.getWorldQuaternion(new T.Quaternion());
  qa.premultiply(rot); b.quaternion.copy(qp.invert().multiply(qa));
  b.updateMatrixWorld(true);
}
