// TrafficSystem: how every vehicle (car, truck, bike, the empty car, the dark-windowed one) gets to a pump and
// leaves. A vehicle is born at the far end of the highway, comes along the eastbound lane, turns into the
// station by the west entrance, drives to the nearest free pump bay and, when it is done, goes out by the east
// exit and back onto the highway. The routes are fixed per bay and a bay is reserved before the vehicle is
// born, so two vehicles never plan the same place. On top of that each vehicle brakes and waits when another
// vehicle (or the attendant) is in front of it, and never goes through anything. Every vehicle is also a moving
// collider for the player.
//
// The parking lot has its own routes (the shop's customers come by car): a car goes in by the same entrance, turns
// west north of the canopy, drives down the aisle of the lot and pulls into a free stall; to leave it backs out
// and takes the aisle north again, then the left lane of the entrance gap onto the highway. A stall is reserved
// (reserveLot) before the car is born. The routes never cross the pump bays (they leave the pump entry lane at the
// highway side of the canopy) and every stall route is checked against the scene's solids once.
//
// Frame: x east, z south (highway to the north at z < -26). Lanes: HWY_Z on the highway, THRU_Z under the canopy
// (south of the bays), BAY_Z the row where the cars stand (heading east, the tank cap toward the pumps). The pumps serve from both
// sides: pumps 1 to 4 face the shop (south lane, BAY_Z), pumps 5 to 8 are the faces behind them (north lane, BAY_N, between the canopy's
// columns and the island; the cars also head east, with the cap on their right).

const HWY_Z = -28.5, ENTRY_X = -2.5, EXIT_X = 23.2, THRU_Z = -2.4, BAY_Z = -4.8, BAY_N = -10.9, THRU_N = -14.6, START_X = -50, END_X = 52;
const CRUISE = 9, LOT = 4.6, ACC = 2.6, BRAKE = 7, BACK = 1.8;
const LOT_IN_X = -11.0, LOT_OUT_X = -14.3, LOT_TURN_Z = -16.0, LOT_BACK_Z = -18.7, LOT_EXIT_X = -4.6, STALL_R = 4.6;

export function createTraffic(bus, { world, render, player }) {
  const THREE = render.THREE;
  let navSys = null, navTried = false;
  /** The pedestrians a vehicle has to give way to (the nav system, found the first time it is needed). */
  const walkers = () => {
    if (!navTried && world.doors) { navTried = true; import('./nav.js').then((m) => { navSys = m.getNav(world, player); }).catch(() => {}); }
    return navSys ? navSys.pedestrians() : [];
  };
  const vehicles = [];
  let ids = 0;
  const nPumps = () => world.pumpCount();
  const isNorth = (n) => n > 4;
  const pumpX = (n) => world.anchor('bomba' + n).pos.x;

  // ------------------------------------------------------------------ paths: dense polylines with cumulative length
  const round = (pts, r = 4) => {
    // corners of a polyline replaced by quadratic arcs
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
      const e = [b[0] - (b[0] - a[0]) / l1 * rr, b[1] - (b[1] - a[1]) / l1 * rr], x = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * e[0] + 2 * u * t * b[0] + t * t * x[0], u * u * e[1] + 2 * u * t * b[1] + t * t * x[1]]); }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  };
  const sCurve = (x0, z0, x1, z1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = t * t * (3 - 2 * t); return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * s]; });
  function finish(pts, rev = false) { return finishSegs([{ pts, rev }]); }
  /** Several stretches in a row, each driven forward or in reverse (the car then looks the other way): resampled every 0.35 m. */
  function finishSegs(segs) {
    const xs = [], zs = [], ss = [], rv = [];
    let acc = 0, prev = segs[0].pts[0]; xs.push(prev[0]); zs.push(prev[1]); ss.push(0); rv.push(false);
    for (const seg of segs) {
      const pts = seg.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], d = Math.hypot(p[0] - prev[0], p[1] - prev[1]); if (d < 1e-6) continue;
        const n = Math.max(1, Math.ceil(d / 0.35));
        for (let k = 1; k <= n; k++) { acc += d / n; xs.push(prev[0] + (p[0] - prev[0]) * k / n); zs.push(prev[1] + (p[1] - prev[1]) * k / n); ss.push(acc); rv.push(Boolean(seg.rev)); }
        prev = p;
      }
    }
    return { xs, zs, ss, rv, L: acc };
  }
  function at(path, s, out) {
    const { xs, zs, ss } = path;
    s = Math.max(0, Math.min(path.L, s));
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    const d = ss[hi] - ss[lo] || 1, k = (s - ss[lo]) / d;
    out.x = xs[lo] + (xs[hi] - xs[lo]) * k; out.z = zs[lo] + (zs[hi] - zs[lo]) * k;
    out.yaw = Math.atan2(xs[hi] - xs[lo], zs[hi] - zs[lo]) + (path.rv && path.rv[hi] ? Math.PI : 0);
    return out;
  }
  /** Highway -> entrance -> the bay (centre x). Direct to the row when the first bay is too close to the entrance for a bend. */
  function inPath(bx, north = false) {
    const BAY = north ? BAY_N : BAY_Z, THRU = north ? THRU_N : THRU_Z;
    const x0 = Math.max(ENTRY_X + 4, bx - 9.5), x1 = bx - 4;
    if (x1 - x0 < (north ? 5.5 : 4.5)) return finish(round([[START_X, HWY_Z], [ENTRY_X, HWY_Z], [ENTRY_X, BAY], [bx, BAY]], 5));
    const head = round([[START_X, HWY_Z], [ENTRY_X, HWY_Z], [ENTRY_X, THRU], [x0, THRU]], 5);
    return finish([...head, ...sCurve(x0, THRU, x1, BAY), [bx, BAY]]);
  }
  /** Bay -> east exit -> highway, heading east. */
  function outPath(bx, north = false) {
    const BAY = north ? BAY_N : BAY_Z, THRU = north ? THRU_N : THRU_Z;
    const x0 = bx + 2.5, x1 = bx + 9;
    if (x1 > EXIT_X - 4) return finish(round([[bx, BAY], [EXIT_X, BAY], [EXIT_X, HWY_Z], [END_X, HWY_Z]], 4));
    return finish([[bx, BAY], ...sCurve(x0, BAY, x1, THRU), ...round([[x1, THRU], [EXIT_X, THRU], [EXIT_X, HWY_Z], [END_X, HWY_Z]], 4)]);
  }

  // ------------------------------------------------------------------ bays
  const bayX = (n, capZ) => pumpX(n) - capZ;
  /** The stretch of the bay row a vehicle needs: its body plus the bend it comes in by. */
  const span = (bx, len) => [bx - len / 2 - 4.6, bx + len / 2 + 0.6];
  function bayFree(n, bx, len) {
    const [a, b] = span(bx, len), north = isNorth(n);
    return !vehicles.some((v) => v.bay && Boolean(v.north) === north && v.state !== 'gone' && !(v.span[1] < a || v.span[0] > b));
  }


  // ------------------------------------------------------------------ the parking lot
  // Stalls: vaga1..6 on the east side of the aisle (nose east), vaga7..12 on the west side (nose west); 9 and 12 hold the
  // abandoned cars. A car goes in nose first from the aisle (south-bound lane x = LOT_IN_X) and backs out into the
  // north-bound lane (x = LOT_OUT_X), which takes it to the highway through the west lane of the entrance gap.
  const arc = (cx, cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
  function lotInPath(sp) {
    const east = sp.dir[0] > 0, R = STALL_R, z = sp.z;
    // down the aisle, then a quarter turn toward the stall and straight in
    const pre = round([[START_X, HWY_Z], [ENTRY_X, HWY_Z], [ENTRY_X, LOT_TURN_Z], [LOT_IN_X, LOT_TURN_Z], [LOT_IN_X, z - R]], 5);
    const turn = east ? arc(LOT_IN_X + R, z - R, R, Math.PI, Math.PI / 2) : arc(LOT_IN_X - R, z - R, R, 0, Math.PI / 2);
    return finishSegs([{ pts: pre }, { pts: [...turn, [sp.x, z]] }]);
  }
  /** The way out of a stall. `run` is how far north the car travels while it slides over to the out lane (variants are tried until one is clear). */
  function lotOutPath(sp, run = 7) {
    const east = sp.dir[0] > 0, R = STALL_R, z = sp.z;
    // back out in an arc (the tail swings south so that the nose ends up north), then forward to the aisle lane and out
    const back = east ? arc(sp.x, z + R, R, -Math.PI / 2, -Math.PI) : arc(sp.x, z + R, R, -Math.PI / 2, 0);
    const bx = back[back.length - 1][0], bz = back[back.length - 1][1];
    // forward again, northbound: x follows a smooth step to the out lane while z runs straight
    const sw = Array.from({ length: 13 }, (_, i) => { const t = i / 12, sm = t * t * (3 - 2 * t); return [bx + (LOT_OUT_X - bx) * sm, bz - run * t]; });
    const out = round([[LOT_OUT_X, bz - run], [LOT_OUT_X, LOT_BACK_Z], [LOT_EXIT_X, LOT_BACK_Z], [LOT_EXIT_X, HWY_Z], [END_X, HWY_Z]], 4);
    return finishSegs([{ pts: back, rev: true }, { pts: sw }, { pts: out }]);
  }
  let spotList = null;
  const spotsCleared = () => (spotList || []).filter((s) => s.ok);
  function allSpots() {
    if (spotList) return spotList;
    spotList = [];
    for (let n = 1; n <= 12; n++) {
      const a = world.anchor && world.anchor('vaga' + n); if (!a) continue;
      const sp = { n, x: a.pos.x, z: a.pos.z, dir: [a.dir.x, a.dir.y, a.dir.z], yaw: Math.atan2(a.dir.x, a.dir.z), ok: false, taken: false };
      sp.inP = lotInPath(sp); sp.outP = lotOutPath(sp);
      spotList.push(sp);
    }
    return spotList;
  }
  /** Does a body len x wid driven along this path stay clear of every solid of the scene (the abandoned cars, the lamp post, the canopy)? */
  function pathClear(path, len, wid) {
    const solids = world.colliders.filter((c) => !c.vehicle && !c.door && c.enabled !== false && c.min[1] <= 1.6 && c.max[1] >= 0.35);
    const rr = wid / 2 + 0.08, off = Math.max(0, len / 2 - wid / 2), p = { x: 0, z: 0, yaw: 0 };
    for (let s = 0; s <= path.L; s += 0.5) {
      at(path, s, p);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const o of [-off, 0, off]) {
        const x = p.x + fx * o, z = p.z + fz * o;
        for (const c of solids) if (x > c.min[0] - rr && x < c.max[0] + rr && z > c.min[2] - rr && z < c.max[2] + rr) return false;
      }
    }
    return true;
  }
  const spotChecked = new Map();
  /** The stalls a body this long can use: free of the abandoned cars and with clear routes in and out. */
  function usable(sp, len, wid) {
    const key = sp.n + ':' + Math.round(len * 2) + ':' + Math.round(wid * 10);
    if (!spotChecked.has(key)) {
      const abandoned = world.colliders.some((c) => !c.vehicle && !c.door && c.id && /^carro-/.test(c.id) && sp.x > c.min[0] && sp.x < c.max[0] && sp.z > c.min[2] && sp.z < c.max[2]);
      let ok = !abandoned && pathClear(sp.inP, len, wid);
      if (ok) {
        ok = false;
        for (const run of [7, 4.6, 10, 13]) { const p = lotOutPath(sp, run); if (pathClear(p, len, wid)) { sp.outP = p; ok = true; break; } }
      }
      spotChecked.set(key, ok);
    }
    return spotChecked.get(key);
  }
  /** Is there a stall for a body this long? */
  function lotAvailable(len = 4.3, wid = 1.8) { return allSpots().some((sp) => !sp.taken && usable(sp, len, wid)); }
  /**
   * Reserves a free stall (before the vehicle is born). `pick` is a seeded random function. Returns the stall or null.
   * Stalls whose neighbours are taken are the last choice (a car backing out would swing across them).
   */
  function reserveLot(len = 4.3, wid = 1.8, pick = () => 0) {
    const free = allSpots().filter((sp) => !sp.taken && usable(sp, len, wid));
    if (!free.length) return null;
    const alone = free.filter((sp) => !allSpots().some((o) => o.taken && o.dir[0] === sp.dir[0] && Math.abs(o.z - sp.z) < 3));
    const list = alone.length ? alone : free;
    const sp = list[Math.min(list.length - 1, Math.floor(pick() * list.length))];
    sp.taken = true;
    return sp;
  }
  function releaseLot(sp) { if (sp) sp.taken = false; }

  // ------------------------------------------------------------------ vehicles
  const tmp = { x: 0, z: 0, yaw: 0 }, probe = { x: 0, z: 0, yaw: 0 };
  function aabb(v) {
    const sn = Math.abs(Math.sin(v.yaw)), cs = Math.abs(Math.cos(v.yaw));
    const hx = sn * v.len / 2 + cs * v.wid / 2, hz = cs * v.len / 2 + sn * v.wid / 2;
    v.col.min = [v.x - hx, 0, v.z - hz]; v.col.max = [v.x + hx, 1.5, v.z + hz];
  }
  /**
   * Registers a vehicle for a pump. opts: { root, len, wid, capZ, pump, onParked, onGone }.
   * Returns the vehicle, or null if that pump is not free for a body this long.
   */
  function add({ root, len = 4.3, wid = 1.8, capZ = -1.4, pump, kind }) {
    const bx = bayX(pump, capZ);
    if (!bayFree(pump, bx, len)) return null;
    const v = {
      id: ++ids, root, len, wid, pump, bx, bay: true, north: isNorth(pump), span: span(bx, len), kind, state: 'arriving', path: inPath(bx, isNorth(pump)), s: 0, speed: CRUISE * 0.8, x: START_X, z: HWY_Z, yaw: Math.PI / 2,
      waited: 0, ghost: 0, col: { min: [0, 0, 0], max: [0, 0, 0], id: 'veiculo' + (ids), vehicle: true }, onParked: null, onGone: null,
    };
    world.colliders.push(v.col);
    vehicles.push(v);
    place(v);
    return v;
  }

  /**
   * Registers a vehicle for a reserved stall of the lot (see reserveLot). opts: { root, len, wid, spot, kind }.
   * The vehicle drives in, parks (onParked) and, when `depart` is called, backs out and goes (onGone).
   */
  function addLot({ root, len = 4.3, wid = 1.8, spot, kind }) {
    const v = {
      id: ++ids, root, len, wid, lot: spot, bay: false, span: [0, 0], kind, state: 'arriving', path: spot.inP, s: 0, speed: CRUISE * 0.8, x: START_X, z: HWY_Z, yaw: Math.PI / 2,
      waited: 0, ghost: 0, col: { min: [0, 0, 0], max: [0, 0, 0], id: 'veiculo' + (ids), vehicle: true }, onParked: null, onGone: null,
    };
    world.colliders.push(v.col);
    vehicles.push(v);
    place(v);
    return v;
  }
  function place(v) {
    at(v.path, v.s, tmp); v.x = tmp.x; v.z = tmp.z; v.yaw = tmp.yaw;
    v.root.position.set(v.x, 0, v.z); v.root.rotation.y = v.yaw;
    aabb(v);
  }
  function depart(v) {
    if (v.state === 'leaving' || v.state === 'gone') return;
    v.state = 'leaving'; v.s = 0; v.speed = 0.4;
    if (v.lot) { v.path = v.lot.outP; return; }
    v.path = outPath(v.bx, v.north); v.span = [v.bx - v.len / 2, v.bx + v.len / 2 + 7];
  }
  function remove(v) {
    v.state = 'gone';
    const i = vehicles.indexOf(v); if (i >= 0) vehicles.splice(i, 1);
    const k = world.colliders.indexOf(v.col); if (k >= 0) world.colliders.splice(k, 1);
    if (v.lot) releaseLot(v.lot);
  }

  // is something in the way, a little ahead on this vehicle's own path?
  function blockedBy(v) {
    const look = v.len / 2 + 0.9 + Math.max(1.4, v.speed * 0.9);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const steps = [v.len / 2 + 0.5, v.len / 2 + 0.5 + (look - v.len / 2 - 0.5) / 2, look];
    for (const d of steps) {
      at(v.path, v.s + d, probe);
      // the attendant: always yields to a person
      if (Math.hypot(player.st.x - probe.x, player.st.z - probe.z) < v.wid / 2 + 0.7) return 'player';
      for (const q of walkers()) if (Math.hypot(q.x - probe.x, q.z - probe.z) < v.wid / 2 + q.r + 0.45) return 'player';
      for (const w of vehicles) {
        if (w === v || w.state === 'gone') continue;
        const hl = Math.max(0, w.len / 2 - 0.9), wx = Math.sin(w.yaw), wz = Math.cos(w.yaw);
        // distance from the probe to the other vehicle's centre line
        const ax = w.x - wx * hl, az = w.z - wz * hl, bx = w.x + wx * hl, bz = w.z + wz * hl;
        const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((probe.x - ax) * abx + (probe.z - az) * abz) / (abx * abx + abz * abz || 1)));
        const dd = Math.hypot(probe.x - (ax + abx * t), probe.z - (az + abz * t));
        if (dd >= w.wid / 2 + v.wid / 2 + 0.2) continue;
        const ahead = (w.x - v.x) * fx + (w.z - v.z) * fz > 0;
        if (w.state === 'parked' || (ahead && Math.abs((w.x - v.x) * fz - (w.z - v.z) * fx) < 1.7) || w.id < v.id) { if (v.ghost > 0 && w.state !== 'parked') continue; return 'vehicle'; }
      }
    }
    return null;
  }

  function update(dt) {
    for (const v of [...vehicles]) {
      if (v.state === 'parked') { aabb(v); continue; }
      const remain = v.path.L - v.s;
      const ix = Math.min(v.path.xs.length - 1, Math.round(v.s / 0.35));
      const cruise = v.state === 'arriving' && v.s < 52 ? CRUISE : (v.state === 'leaving' && (v.path.xs[ix] > EXIT_X - 1 || v.lot) && v.path.zs[ix] < -26) ? CRUISE : LOT;
      let target = cruise;
      if (v.path.rv && v.path.rv[Math.min(v.path.rv.length - 1, Math.round(v.s / 0.35))]) target = BACK;
      if (v.state === 'arriving') target = Math.min(target, Math.sqrt(2 * 2.2 * Math.max(0, remain)) + 0.4);
      const block = blockedBy(v);
      if (block) { target = 0; v.waited += dt; if (v.waited > 22 && block === 'vehicle') v.ghost = 4; } else v.waited = 0;
      if (v.ghost > 0) v.ghost -= dt;
      v.speed = v.speed < target ? Math.min(target, v.speed + ACC * dt) : Math.max(target, v.speed - BRAKE * dt);
      v.s = Math.min(v.path.L, v.s + v.speed * dt);
      place(v);
      if (v.state === 'arriving' && remain < 0.12 && v.speed < 0.6) { v.s = v.path.L; place(v); v.state = 'parked'; v.speed = 0; v.onParked?.(v); }
      else if (v.state === 'leaving' && v.s >= v.path.L - 0.2) { const cb = v.onGone; remove(v); cb?.(v); }
    }
  }

  return {
    vehicles, update, add, depart, remove,
    /** Is the bay of pump n free for a vehicle this long, with its cap this far from the middle? */
    bayFree: (n, len = 4.3, capZ = -1.4) => bayFree(n, bayX(n, capZ), len),
    bayX,
    /** How far the way in to the bay of pump n is (the free pump nearest the entrance is the one with the shortest way). */
    routeLength: (n, capZ = -1.4) => inPath(bayX(n, capZ), isNorth(n)).L,
    routes: { inPath, outPath },
    /** The parking lot: reserveLot(len, wid, pick) -> stall | null, releaseLot(stall), addLot({...}), lotAvailable(len, wid), lotStalls() */
    reserveLot, releaseLot, addLot, lotAvailable, lotStalls: () => allSpots().filter((sp) => usable(sp, 4.3, 1.8)).map((sp) => sp.n),
    lotPaths: (n) => { const sp = allSpots().find((q) => q.n === n); return sp ? { inP: sp.inP, outP: sp.outP } : null; },
    /** Where a person gets out of a car standing in a stall: on its driver's side, on the walking line between the stalls. */
    lotDoor: (sp) => ({ x: sp.x, z: sp.z + (sp.dir[0] > 0 ? -1.4 : 1.4) }),
  };
}
