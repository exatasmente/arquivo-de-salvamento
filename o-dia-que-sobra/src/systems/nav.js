// NavSystem: how anyone on foot gets from one place of the posto to another. One graph of waypoints for the whole
// site, built once from the scene (its colliders, its doors and its anchors):
//   - a grid of free points every metre, joined to its neighbours where the straight line is clear of every solid;
//   - two points at each door (one on each side), joined through the door; an edge that crosses a door says so;
//   - the named stand points of the scene (shelves, fridges, counter, pumps, bathrooms, rooms, parking) as aliases.
// nav.path(from, to, opts) is A* over it, followed by a line-of-sight pass that drops every waypoint that is not
// needed (the doors always stay). A door that is locked cuts the edge for everyone; a closed door cuts it for whoever
// cannot open it (opts.doors says which doors the walker may use). If there is no way, the answer is null.
//
// On the way, nav.follow(agent, route, speed, dt) walks the route with a very simple local avoidance: whoever is
// ahead (another pedestrian, the attendant) is gone round if there is room, else waited for; a vehicle in the way is
// waited for; doors on the route are opened when the walker gets near and closed again once it has gone.
//
// Frame: x east, z south. Everything is a function of the scene and of what the caller passes; no clock, no Math.random.

const R = 0.32;            // radius of a walker
const STEP = 1.0;          // grid spacing
const X0 = -27.5, X1 = 27.5, Z0 = -27.5, Z1 = 24.5;
const DOOR_OFF = 0.85;

const CACHE = new WeakMap();
/** The one NavSystem of a world (the systems that need it ask for it here, so that they all share the graph). */
export function getNav(world, player) {
  let n = CACHE.get(world);
  if (!n) { n = createNav(world, player); CACHE.set(world, n); }
  return n;
}

export function createNav(world, player) {
  const cols = world.colliders;
  let built = false;
  let solids = [], doorCols = [];
  const nodes = [];                    // { x, z, adj: [{ to, w, doors }], name? }
  const names = new Map();             // alias -> node index
  const agents = new Set();            // pedestrians: { id, pos: {x, z}, r }
  const opened = new Map();            // doors opened by a walker: id -> { near: time }
  let now = 0, lastTick = -1;
  let lockedFn = () => null;

  const relevant = (c) => c.enabled !== false && !(c.min[1] > 1.6 || c.max[1] < 0.35);
  const hit = (c, x, z, r) => x > c.min[0] - r && x < c.max[0] + r && z > c.min[2] - r && z < c.max[2] + r;

  // ------------------------------------------------------------------ the static picture
  function snapshot() {
    solids = []; doorCols = [];
    for (const c of cols) {
      if (c.vehicle || c.id === 'carrinho' || c.min[1] > 1.6 || c.max[1] < 0.35) continue;
      if (c.door) doorCols.push(c); else solids.push(c);
    }
  }
  const solidAt = (x, z, r) => { for (const c of solids) if (hit(c, x, z, r)) return c; return null; };
  /** Walks the segment; null if something solid is in the way, else the doors it goes through. */
  function line(ax, az, bx, bz, r = R, strict = false) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.2));
    let doors = null;
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (solidAt(x, z, r)) return null;
      for (const c of doorCols) {
        if (!hit(c, x, z, strict ? r : 0.15)) continue;
        if (strict) return null;
        const id = c.door;
        if (!doors) doors = [];
        if (!doors.includes(id)) doors.push(id);
      }
    }
    return doors || [];
  }

  function addNode(x, z, name) {
    const i = nodes.length; nodes.push({ x, z, adj: [], name });
    if (name) names.set(name, i);
    return i;
  }
  function join(a, b, doors) {
    const w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) + (doors.length ? 1.2 * doors.length : 0);
    nodes[a].adj.push({ to: b, w, doors }); nodes[b].adj.push({ to: a, w, doors });
  }

  function build() {
    if (built) return; built = true;
    snapshot();
    // the grid
    const W = Math.round((X1 - X0) / STEP) + 1, H = Math.round((Z1 - Z0) / STEP) + 1;
    const idx = new Int32Array(W * H).fill(-1);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i * STEP, z = Z0 + j * STEP;
      if (!solidAt(x, z, R + 0.1)) idx[j * W + i] = addNode(x, z);
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = idx[j * W + i]; if (a < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const ii = i + di, jj = j + dj; if (ii >= W || jj < 0 || jj >= H) continue;
        const b = idx[jj * W + ii]; if (b < 0) continue;
        const doors = line(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
        if (doors) join(a, b, doors);
      }
    }
    // the doors: a point on each side, joined through the door and to what is around them
    for (const id of Object.keys(world.doors || {})) {
      const c = world.doors[id].collider; if (!c) continue;
      const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
      const alongX = (c.max[0] - c.min[0]) > (c.max[2] - c.min[2]);
      const pa = alongX ? [cx, cz - DOOR_OFF] : [cx - DOOR_OFF, cz], pb = alongX ? [cx, cz + DOOR_OFF] : [cx + DOOR_OFF, cz];
      const a = addNode(pa[0], pa[1], id + ':a'), b = addNode(pb[0], pb[1], id + ':b');
      const through = line(pa[0], pa[1], pb[0], pb[1]);
      if (through) join(a, b, through.includes(id) ? through : [...through, id]);
      for (const k of [a, b]) linkLocal(k, 2.6, 6);
      names.set(id, a);
    }
    // the named stand points of the scene
    for (const [k, an] of Object.entries(world.anchors || {})) {
      if (!/^(prateleira|geladeira|balcao|bomba|vaga|banheiro|pia|escritorio|estoque|fundos|servico|deposito|dml|cafeteira|spawn|caixa|leitor|estacionamento|cartazFora|sino|porta-loja-dentro|computador|telefone|calibrador)/.test(k)) continue;
      if (names.has(k)) continue;
      const x = an.pos.x, z = an.pos.z;
      if (solidAt(x, z, R)) { const j = nearest(x, z, 3.0); if (j >= 0) names.set(k, j); continue; }
      const i = addNode(x, z, k);
      if (linkLocal(i, 3.0, 6) === 0) { const j = nearest(x, z, 6); if (j >= 0 && j !== i) join(i, j, [])  ; }
    }
    // the parking: the walking lines between the stalls (the painted lines) from the lot's edge to the sidewalk
    for (let k = 0; k < 7; k++) {
      const z = 3.1 + 2.8 * k;
      let prev = -1;
      for (const x of [-20.2, -18.9, -15, -12.65, -9.5, -6.4, -3.6, -2.2]) {
        if (solidAt(x, z, R)) continue;
        const i = addNode(x, z, `lot${k}:${x}`);
        linkLocal(i, 1.6, 4);
        if (prev >= 0) { const d = line(nodes[prev].x, nodes[prev].z, x, z); if (d) join(prev, i, d); }
        prev = i;
      }
    }
  }
  function nearest(x, z, maxD = 1e9, skipLos = true) {
    let best = -1, bd = maxD * maxD;
    for (let i = 0; i < nodes.length; i++) { const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    void skipLos; return best;
  }
  /** Joins node i to the closest nodes within `radius` that it can see. Returns how many. */
  function linkLocal(i, radius, k) {
    const n = nodes[i], cand = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const d = (nodes[j].x - n.x) ** 2 + (nodes[j].z - n.z) ** 2;
      if (d < radius * radius) cand.push([d, j]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    let m = 0;
    for (const [, j] of cand) {
      if (m >= k) break;
      if (n.adj.some((e) => e.to === j)) { m++; continue; }
      const doors = line(n.x, n.z, nodes[j].x, nodes[j].z);
      if (doors) { join(i, j, doors); m++; }
    }
    return m;
  }

  // ------------------------------------------------------------------ the search
  const pt = (p) => (typeof p === 'string' ? (world.anchor(p)?.pos ?? (names.has(p) ? nodes[names.get(p)] : null)) : p);

  /**
   * A way from `from` to `to` (points {x, z}, or anchor names): [{ x, z, doors? }...] without the start, ending exactly
   * at `to`; null if there is none. opts.doors(id) -> bool: whether this walker may use that door (default: every door
   * that is not locked). Locked doors always cut (unless opts.ignoreLocked: how it would go if they were open). opts.cost(x, z) -> extra metres for passing a point.
   */
  function path(from, to, opts = {}) {
    build();
    const a = pt(from), b = pt(to); if (!a || !b) return null;
    const locked = opts.ignoreLocked ? null : lockedFn();
    const mayUse = (id) => !(locked && locked.has(id)) && (opts.doors ? opts.doors(id) : true);
    // the vehicles (parked or moving) are not in the static graph: the way goes round them as they stand now
    const veh = [];
    for (const c of cols) if (c.vehicle && c.enabled !== false) veh.push(c);
    const vr = R + 0.12;
    const inVeh = (x, z) => { for (const c of veh) if (hit(c, x, z, vr)) return true; return false; };
    const segVeh = (ax, az, bx, bz) => {
      if (!veh.length) return false;
      const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.4));
      for (let i = 0; i <= n; i++) if (inVeh(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return true;
      return false;
    };
    const N = nodes.length, S = N, G = N + 1;
    const extra = new Map();                     // temp edges: node -> [{to, w, doors}]
    const tempAdj = [[], []];
    const addTemp = (t, j, doors) => {
      const x = t === S ? a.x : b.x, z = t === S ? a.z : b.z, w = Math.hypot(nodes[j].x - x, nodes[j].z - z);
      tempAdj[t - N].push({ to: j, w, doors });
      if (!extra.has(j)) extra.set(j, []);
      extra.get(j).push({ to: t, w, doors });
    };
    const attach = (t, p) => {
      const cand = [];
      for (let j = 0; j < N; j++) { const d = (nodes[j].x - p.x) ** 2 + (nodes[j].z - p.z) ** 2; if (d < 36) cand.push([d, j]); }
      cand.sort((u, v) => u[0] - v[0]);
      let m = 0;
      for (const [, j] of cand) { if (m >= 6) break; const doors = line(p.x, p.z, nodes[j].x, nodes[j].z); if (doors) { addTemp(t, j, doors); m++; } }
      if (!m) { const j = nearest(p.x, p.z); if (j >= 0) addTemp(t, j, []); }
    };
    attach(S, a); attach(G, b);
    // straight line
    const direct = line(a.x, a.z, b.x, b.z);
    if (direct && direct.every(mayUse) && !segVeh(a.x, a.z, b.x, b.z)) return [{ x: b.x, z: b.z, doors: direct.length ? direct : undefined }];

    const g = new Float32Array(N + 2).fill(Infinity), came = new Int32Array(N + 2).fill(-1), seen = new Uint8Array(N + 2);
    const pos = (i) => (i === S ? a : i === G ? b : nodes[i]);
    const heap = [[0, S]];
    g[S] = 0;
    const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const relax = (u, e) => {
      if (e.doors.length && !e.doors.every(mayUse)) return;
      if (veh.length && e.to !== G && e.to !== S && segVeh(pos(u).x, pos(u).z, pos(e.to).x, pos(e.to).z) && !(u === S)) return;
      let w = e.w;
      if (opts.cost) w += opts.cost(pos(e.to).x, pos(e.to).z);
      const ng = g[u] + w;
      if (ng < g[e.to]) { g[e.to] = ng; came[e.to] = u; push(ng + Math.hypot(pos(e.to).x - b.x, pos(e.to).z - b.z), e.to); }
    };
    let found = false;
    while (heap.length) {
      const [, u] = pop();
      if (seen[u]) continue; seen[u] = 1;
      if (u === G) { found = true; break; }
      const list = u === S ? tempAdj[0] : u === G ? [] : nodes[u].adj;
      for (const e of list) relax(u, e);
      if (u < N && extra.has(u)) for (const e of extra.get(u)) relax(u, e);
    }
    if (!found) return null;
    const chain = [];
    for (let i = G; i !== -1; i = came[i]) chain.push(pos(i));
    chain.reverse();
    return smooth(chain, segVeh);
  }
  /** Drops the waypoints that are not needed (a clear straight line, never through a door) and says which doors each leg crosses. */
  function smooth(chain, segVeh = () => false) {
    const out = [];
    let i = 0;
    while (i < chain.length - 1) {
      let j = chain.length - 1;
      while (j > i + 1 && (!line(chain[i].x, chain[i].z, chain[j].x, chain[j].z, R, true) || segVeh(chain[i].x, chain[i].z, chain[j].x, chain[j].z))) j--;
      const doors = line(chain[i].x, chain[i].z, chain[j].x, chain[j].z) || [];
      out.push({ x: chain[j].x, z: chain[j].z, doors: doors.length ? doors : undefined });
      i = j;
    }
    return out;
  }
  /** Length of a route from a point. */
  const length = (from, route) => { let s = 0, p = pt(from); for (const q of route || []) { s += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return s; };

  // ------------------------------------------------------------------ walking
  function doorCenter(id) { const c = world.doors[id]?.collider; return c ? { x: (c.min[0] + c.max[0]) / 2, z: (c.min[2] + c.max[2]) / 2 } : null; }
  function touchDoor(id, a, o) {
    const dc = doorCenter(id); if (!dc) return;
    if (Math.hypot(dc.x - a.pos.x, dc.z - a.pos.z) > 2.2) return;
    const locked = lockedFn();
    if (locked && locked.has(id)) return;
    if (!world.doorOpen(id)) { world.setDoor(id, 1); opened.set(id, { near: now }); o?.onDoor?.(id); }
    else if (opened.has(id)) opened.get(id).near = now;
  }
  /** Called once per frame by whoever uses the nav (the same time passed twice in a frame is ignored). */
  function tick(dt, t) {
    build();
    if (t !== undefined) { if (t === lastTick) return; lastTick = t; }
    now += dt;
    for (const [id, o] of [...opened]) {
      if (now - o.near < 0.7) continue;
      const dc = doorCenter(id), inFrame = dc && [...agents].some((a) => Math.hypot(dc.x - a.pos.x, dc.z - a.pos.z) < 1.6);
      if (inFrame) { o.near = now; continue; }
      opened.delete(id);
      if (world.doorOpen(id)) world.setDoor(id, 0);
    }
  }

  const others = (a) => {
    const out = [];
    for (const o of agents) if (o !== a && !o.hidden) out.push({ x: o.pos.x, z: o.pos.z, r: o.r ?? R });
    if (player && !a.noPlayer) out.push({ x: player.st.x, z: player.st.z, r: 0.35 });
    return out;
  };
  /** Is the spot taken by something a walker cannot go through right now (a solid, a vehicle, a closed door it may not open)? */
  function blockedLive(x, z, r, a) {
    for (const c of cols) {
      if (!relevant(c) || c === a.ignore) continue;
      if (c.door) {
        if (!hit(c, x, z, r * 0.6)) continue;
        if (lockedFn()?.has(c.door) || (a.doors && !a.doors(c.door))) return c;
        continue;                                   // a closed door that it may use: it opens as it gets there
      }
      if (c.id === 'carrinho' && c.enabled === false) continue;
      if (hit(c, x, z, r)) return c;
    }
    return null;
  }
  /**
   * One step of a walker toward (tx, tz). Returns { dist, moved, waiting, hx, hz }: the distance left, whether it moved,
   * whether it is waiting for someone (or a vehicle), and the heading it is looking at.
   */
  function step(a, tx, tz, speed, dt, o = {}) {
    const p = a.pos, dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    const r = a.r ?? R;
    if (dist < 1e-4) return { dist, moved: false, waiting: false, hx: 0, hz: 1 };
    const len = Math.min(dist, speed * dt);
    let ux = dx / dist, uz = dz / dist;
    const side = a.side ?? ((a.id * 7919) & 1 ? 1 : -1);
    // is someone in front?
    const look = r + 0.5 + len;
    let blk = null, bd = 1e9;
    for (const q of others(a)) {
      const rx = q.x - p.x, rz = q.z - p.z, ahead = rx * ux + rz * uz, lat = Math.abs(rx * uz - rz * ux);
      if (ahead > -0.05 && ahead < look + q.r && lat < r + q.r + 0.12 && ahead < bd) { bd = ahead; blk = q; }
    }
    const tryMove = (vx, vz, f) => {
      const nx = p.x + vx * len * f, nz = p.z + vz * len * f;
      if (blockedLive(nx, nz, r, a)) return false;
      for (const q of others(a)) if (Math.hypot(q.x - nx, q.z - nz) < r + q.r + 0.05 && Math.hypot(q.x - nx, q.z - nz) < Math.hypot(q.x - p.x, q.z - p.z)) return false;
      p.x = nx; p.z = nz; return true;
    };
    let moved = false, waiting = false, hx = ux, hz = uz;
    if (blk) {
      for (const s of [side, -side]) {
        const c = Math.cos(0.95 * s), sn = Math.sin(0.95 * s), vx = ux * c - uz * sn, vz = ux * sn + uz * c;
        if (tryMove(vx, vz, 0.85)) { moved = true; hx = vx; hz = vz; break; }
      }
      if (!moved) { a.wait = (a.wait || 0) + dt; waiting = true; if (a.wait > 7) { const nx = p.x + ux * len, nz = p.z + uz * len; if (!blockedLive(nx, nz, r, a)) { p.x = nx; p.z = nz; moved = true; waiting = false; } } }
      else a.wait = Math.max(0, (a.wait || 0) - dt);
    } else if (tryMove(ux, uz, 1)) { moved = true; a.wait = 0; }
    else if (Math.abs(ux) > 0.2 && tryMove(Math.sign(ux), 0, Math.abs(ux))) { moved = true; a.wait = 0; }
    else if (Math.abs(uz) > 0.2 && tryMove(0, Math.sign(uz), Math.abs(uz))) { moved = true; a.wait = 0; }
    else { waiting = true; a.wait = (a.wait || 0) + dt; }
    void o;
    return { dist, moved, waiting, hx, hz };
  }
  /** Walks a route made by `path`. Returns { done, moved, waiting, hx, hz }. route.i is where it is. */
  function follow(a, route, speed, dt, o = {}) {
    if (!route || route.i >= route.pts.length) return { done: true, moved: false, waiting: false, hx: 0, hz: 1 };
    agents.add(a);
    for (let k = route.i; k < Math.min(route.pts.length, route.i + 2); k++) for (const id of route.pts[k].doors || []) touchDoor(id, a, o);
    const w = route.pts[route.i], last = route.i === route.pts.length - 1;
    const res = step(a, w.x, w.z, speed, dt, o);
    const d = Math.hypot(w.x - a.pos.x, w.z - a.pos.z);
    a.stuck = res.moved ? 0 : (a.stuck || 0) + dt;
    if (d < (last ? 0.12 : 0.28) || (last && a.stuck > 1.2 && d < 0.8)) { route.i++; a.stuck = 0; }
    return { done: route.i >= route.pts.length, moved: res.moved, waiting: res.waiting, hx: res.hx, hz: res.hz };
  }
  /** A walker that ended up inside something (a car that moved onto it): out to the nearest free spot. Returns true if it moved. */
  function unstick(a) {
    const r = a.r ?? R, p = a.pos;
    if (!blockedLive(p.x, p.z, r, a)) return false;
    for (let d = 0.3; d <= 2.4; d += 0.3) for (let k = 0; k < 12; k++) {
      const ang = k * Math.PI / 6, x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      if (!blockedLive(x, z, r, a)) { p.x = x; p.z = z; return true; }
    }
    return false;
  }
  const route = (pts) => (pts ? { pts, i: 0 } : null);

  return {
    build, tick, path, route, follow, step, length, unstick, line: (ax, az, bx, bz, r) => { build(); return line(ax, az, bx, bz, r); },
    add: (a) => { agents.add(a); return a; }, remove: (a) => { agents.delete(a); },
    agents, names, nodes: () => nodes,
    node: (name) => (names.has(name) ? nodes[names.get(name)] : null),
    /** Where the pedestrians are, for a vehicle that has to give way. */
    pedestrians: () => { const out = []; for (const a of agents) if (!a.hidden) out.push({ x: a.pos.x, z: a.pos.z, r: a.r ?? R }); return out; },
    /** Who may not be walked through: the set of locked doors (the Sun's `locked`). */
    setLocked(fn) { lockedFn = fn; },
    isLocked: (id) => Boolean(lockedFn()?.has(id)),
    solidAt: (x, z, r = R) => { build(); return solidAt(x, z, r); },
  };
}
