// What the cutscenes share about the stage: the one posto they all play in (built with buildPosto, never
// copied), the vehicles driving the routes of systems/traffic.js, the lights (the 8 nearest, with the
// flicker held so that no lamp changes more than three times a second), held props and walkers.
// Pure functions of time: a table is simulated once at build time, never per frame.
import { buildPosto } from '../scenes/posto.js';
import { buildCar } from '../models/car.js';
import { buildProp } from '../models/props.js';
import { createTraffic } from '../systems/traffic.js';
import { clamp, lerp, smooth, ramp } from './common.js';

export const DEFAULT_STATE = () => ({ placaSorriso: 0, doors: {}, sino: -99, gaveta: 0, telefoneToca: false, hora: 1.25, quadroAberto: 0 });
const INDOOR = new Set(['loja', 'escritorio', 'estoque', 'banheiros', 'banheiroM', 'banheiroF', 'servico', 'deposito']);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function createWorld(r, { seed = 1 } = {}) {
  const T = r.THREE;
  const posto = buildPosto(r, { seed });
  const group = posto.group; group.visible = false;
  const anchors = {};
  for (const [k, a] of Object.entries(posto.anchors)) anchors[k] = { pos: new T.Vector3(...a.pos), dir: new T.Vector3(...(a.dir ?? [0, 0, 1])).normalize() };
  const sign = posto.props['placa-sol'];
  const color = new T.Color();
  const W = {
    posto, group, anchors, T,
    /** Position of an anchor as [x, y, z], with at least height y. */
    p(name, y = 0, dx = 0, dz = 0) { const a = anchors[name].pos; return [a.x + dx, Math.max(a.y, y), a.z + dz]; },
    /** The state that every frame starts from; the cutscene fills what it changes. */
    state: DEFAULT_STATE(),
    /**
     * Poses the posto at time `t`. f: { state?, spot?, fog?, ambient?, eye, burnt?, breakers?, ray?, signOn?, displays? }.
     * Everything the posto keeps (lamps, pumps, the sign) is written here, so the previous cutscene leaves nothing behind.
     */
    pose(t, f, { reduce = false } = {}) {
      const st = Object.assign(DEFAULT_STATE(), f.state ?? {});
      for (const l of posto.lights) { if (!l.baseOn) Object.defineProperty(l, 'baseOn', { value: l.on, writable: true, enumerable: false }); l.on = f.on?.includes(l.id) ? true : l.baseOn; }
      for (const id of posto.lampIds) posto.setBurnt(id, f.burnt?.includes(id) ?? false);
      for (const a of posto.breakers.areas) posto.breakers.setOn(a, f.off ? !f.off.includes(a) : true);
      for (const n of [1, 2, 3, 4]) {
        const pm = posto.pumps[n]; if (!pm) continue;
        pm.setDisplay(f.displays?.[n] ?? '');
        for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'ligar', 'cancelar']) pm.keypad?.setPressed?.(k, f.pressed?.[0] === n && f.pressed?.[1] === k);
        for (const [k, nz] of Object.entries(pm.nozzles ?? {})) nz.visible = !(f.hideNozzle && f.hideNozzle[0] === n && f.hideNozzle[1] === k);
        // the hose follows the nozzle a cutscene holds (`nozzleAt`: its world point), else it hangs from its hook
        for (const [k, h] of Object.entries(pm.hoses ?? {})) h.set(f.hideNozzle && f.hideNozzle[0] === n && f.hideNozzle[1] === k && f.nozzleAt ? f.nozzleAt : null);
      }
      posto.cups?.setCount?.(f.cups ?? 0);
      posto.props.armario?.setOpen?.(f.armario ?? 0); posto.props.frasco?.setVisible?.(Boolean(f.frasco));
      posto.props.cafeteira?.setBrewing?.(Boolean(f.brewing)); posto.props.cafeteira?.setOn?.(Boolean(f.brewing));
      posto.stickers?.hideAll?.();
      if (posto.cart) { if (f.cart) { posto.cart.place?.(f.cart[0], f.cart[1], f.cart[2] ?? 0); } else posto.cart.reset?.(); posto.cart.setLoad?.(f.cartLoad ?? 0); }
      for (const id of Object.keys(posto.stains ?? {})) posto.setDirt(id, f.dirt?.[id] ?? 0);
      posto.update(t, st);
      // the flicker, held a third of a second at a time (and only dimmed with "reduce flashes")
      const tq = Math.floor(t / 0.34) * 0.34;
      for (const l of posto.lights) {
        if (!l.pisca || !l.on || l.burnt) continue;
        const slot = Math.floor(tq * 9), h = hash(slot + l.id.length * 13);
        let lv = h > 0.74 ? 0.1 + hash(slot * 3 + 1) * 0.35 : 1;
        if (reduce) lv = Math.max(0.65, lv);
        l.level = lv; l.fixture?.setLevel?.(lv); if (l.fixture?.lamp) l.fixture.lamp.visible = lv > 0.05;
      }
      for (const [id, k] of Object.entries(f.dimLights ?? {})) { const l = posto.lights.find((x) => x.id === id); if (l) { l.level *= k; l.fixture?.setLevel?.(l.level); } }
      // the sign: a ray that fails, on a timeline of the cutscene, instead of the posto's own
      if (f.sign) { sign.setPower(f.sign.on !== false); sign.redraw(Math.round(clamp(f.sign.smile ?? 0) * 8) / 8, f.sign.ray ?? -1); }
      // the 8 lights nearest to the eye
      const e = f.eye;
      const sc = [];
      for (const l of posto.lights) {
        if (!l.on || l.burnt || !(l.level > 0.02) || !posto.breakers.powered(l)) continue;
        if (f.sign?.on === false && l.kind === 'placa') continue;
        const d = Math.hypot(l.pos[0] - e[0], l.pos[1] - e[1], l.pos[2] - e[2]);
        if (d > l.range + 14) continue;
        sc.push({ l, s: (d < l.range ? 3 : 0) + l.range / (d + 3) });
      }
      sc.sort((a, b) => b.s - a.s);
      for (let i = 0; i < r.POINT_LIGHTS; i++) {
        const c = sc[i];
        if (!c) { r.point(i, { pos: [0, -50, 0], color: 0x000000, range: 1 }); continue; }
        color.set(c.l.color).multiplyScalar(c.l.level * 0.95);
        r.point(i, { pos: c.l.pos, color: color.getHex(), range: c.l.range });
      }
      const area = posto.areaAt(e[0], e[2]);
      r.light({ ambient: f.ambient ?? (INDOOR.has(area) ? 0x464954 : 0x3c3f4c), key: 0x0a0c14, keyDir: [-0.3, -1, -0.2], fog: '#07080d', fogNear: f.fog?.[0] ?? 10, fogFar: f.fog?.[1] ?? 40 });
      if (f.spot) r.spot({ on: true, ...f.spot }); else r.spot({ on: false });
    },
    reset() { r.spot({ on: false }); r.light({ fog: '#07080d', fogNear: 10, fogFar: 40 }); },
  };
  return W;
}

// ---------------------------------------------------------------------------------------------
// Vehicles on the routes of the traffic system.
const CRUISE = 9, LOT = 4.6, ACC = 2.6, BRAKE = 7, EXIT_X = 23.2;
let _routes = null;
/** The `routes` of systems/traffic.js (pure geometry), built once with a stand-in world. */
export function routes(r, W) {
  if (_routes && _routes.W === W) return _routes;
  const fake = { anchor: (n) => W.anchors[n], pumpCount: () => 4, colliders: [] };
  const tr = createTraffic({}, { world: fake, render: r, player: { st: { x: 1e6, z: 1e6 } } });
  _routes = { W, tr, inPath: (n, capZ) => tr.routes.inPath(tr.bayX(n, capZ)), outPath: (n, capZ) => tr.routes.outPath(tr.bayX(n, capZ)) };
  return _routes;
}
function at(path, s) {
  const { xs, zs, ss } = path; s = clamp(s, 0, path.L);
  let lo = 0, hi = ss.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
  const d = ss[hi] - ss[lo] || 1, k = (s - ss[lo]) / d;
  return { x: xs[lo] + (xs[hi] - xs[lo]) * k, z: zs[lo] + (zs[hi] - zs[lo]) * k, yaw: Math.atan2(xs[hi] - xs[lo], zs[hi] - zs[lo]) };
}
/** Distance along a path as a function of time, with the speeds of the traffic system (a table, simulated once). */
function profile(path, arriving) {
  const dt = 1 / 30, tab = [0]; let s = 0, v = arriving ? CRUISE * 0.8 : 0.4;
  for (let i = 0; i < 30 * 90; i++) {
    const remain = path.L - s;
    let target;
    if (arriving) { target = s < 52 ? CRUISE : LOT; target = Math.min(target, Math.sqrt(2 * 2.2 * Math.max(0, remain)) + 0.4); }
    else { const i2 = Math.min(path.xs.length - 1, Math.round(s / 0.35)); target = path.xs[i2] > EXIT_X - 1 && path.zs[i2] < -26 ? CRUISE : LOT; }
    v = v < target ? Math.min(target, v + ACC * dt) : Math.max(target, v - BRAKE * dt);
    s = Math.min(path.L, s + v * dt);
    if (arriving && path.L - s < 0.12 && v < 0.6) { s = path.L; tab.push(s); break; }
    tab.push(s);
    if (s >= path.L - 0.2) break;
  }
  return (t) => { if (t <= 0) return 0; const f = t * 30, i = Math.floor(f); return i >= tab.length - 1 ? tab[tab.length - 1] : lerp(tab[i], tab[i + 1], f - i); };
}
/** How long the vehicle needs to arrive / to leave from a standing start. */
export function driveTimes(path, arriving) { const f = profile(path, arriving); let t = 0; while (f(t) < path.L - 0.15 && t < 90) t += 1 / 30; return t; }

/**
 * A car at pump `n`: { car, pose(t) } with the car arriving at `tIn`, standing, and leaving at `tOut` (null: stays).
 * opts: { seed, fuel, driver, lights, abandoned }.
 */
export function pumpCar(r, W, n, { tIn = 0, tPark, tOut = null, seed = 1, fuel = 'comum', driver = true, style, color, lights = true } = {}) {
  const car = buildCar(r, { seed, fuel, capSide: 'left', style, color });
  const capZ = car.tankCap?.position?.z ?? -1.4;
  const R = routes(r, W);
  const pin = R.inPath(n, capZ), pout = R.outPath(n, capZ), sin = profile(pin, true), sout = profile(pout, false);
  car.setDriver(driver); car.setLights(lights);
  const arrive = driveTimes(pin, true);
  if (tPark !== undefined) tIn = tPark - arrive;
  return {
    car, arrive, tPark: tIn + arrive, capZ,
    /** Places the car at time t (hidden before it is born and after it is gone). Returns the speed state. */
    pose(t) {
      let p, state;
      if (t < tIn) { car.root.visible = false; return 'unborn'; }
      if (tOut !== null && t >= tOut) {
        const s = sout(t - tOut); p = at(pout, s); state = s >= pout.L - 0.2 ? 'gone' : 'leaving';
      } else { p = at(pin, sin(t - tIn)); state = t - tIn >= arrive ? 'parked' : 'arriving'; }
      car.root.visible = state !== 'gone';
      car.root.position.set(p.x, 0, p.z); car.root.rotation.y = p.yaw;
      car.update?.(t);
      return state;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Props held by the hands: placed in camera space, where the hand goes.
export function heldProp(r, kind, opts = {}) {
  const o = buildProp(r, kind, { seed: 1, ...opts });
  const root = o.root ?? o.group ?? o.dyn ?? o;
  root.visible = false;
  return { root, o };
}
/** A point given in camera space ([x right, y up, -z ahead]) as a world point, for a camera looking from eye to look. */
export function camPoint(THREE, eye, look, p) {
  const e = new THREE.Vector3(...eye), f = new THREE.Vector3(...look).sub(e).normalize();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, f).normalize();
  return e.addScaledVector(right, p[0]).addScaledVector(up, p[1]).addScaledVector(f, -p[2]);
}
/** The work vest of the posto: a folded ochre vest with two pale stripes. */
export function makeVest(r) {
  const T = r.THREE, g = new T.Group();
  const body = new T.Mesh(new T.BoxGeometry(0.34, 0.05, 0.3), r.mat('#c78a1a', { map: 'cloth' })); g.add(body);
  for (const x of [-0.08, 0.08]) { const s = new T.Mesh(new T.BoxGeometry(0.04, 0.052, 0.3), r.mat('#d8d4c0')); s.position.x = x; g.add(s); }
  return g;
}
/** A hand torch: black body, a ring and a lens that glows. Long axis is z, lens at +z. */
export function makeTorch(r) {
  const T = r.THREE, g = new T.Group();
  const body = new T.Mesh(new T.CylinderGeometry(0.03, 0.026, 0.2, 8), r.mat('#1c1a1a')); body.rotation.x = Math.PI / 2; g.add(body);
  const head = new T.Mesh(new T.CylinderGeometry(0.042, 0.032, 0.07, 8), r.mat('#2a2828')); head.rotation.x = Math.PI / 2; head.position.z = 0.12; g.add(head);
  const lens = new T.Mesh(new T.CircleGeometry(0.036, 8), r.glow('#f0e0a0')); lens.position.z = 0.156; g.add(lens);
  return g;
}
export { smooth, ramp, clamp, lerp };

/** The inverse of camPoint: a world point as [x right, y up, -z ahead] in the camera looking from eye to look. */
export function toCam(THREE, eye, look, wp) {
  const e = new THREE.Vector3(...eye), f = new THREE.Vector3(...look).sub(e).normalize();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, f).normalize();
  const d = (Array.isArray(wp) ? new THREE.Vector3(...wp) : wp.clone()).sub(e);
  return [d.dot(right), d.dot(up), -d.dot(f)];
}

/** The appearance of a person of data/cast.json (recorrentes or tipos) as buildCustomer takes it; `fallback` when the file is not there. */
export function castSpec(cast, id, fallback) {
  const e = cast?.recorrentes?.find((x) => x.id === id) ?? cast?.tipos?.find((x) => x.id === id);
  if (!e?.aparencia) return fallback;
  return { categoria: e.categoria ?? fallback.categoria, ...e.aparencia };
}
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
