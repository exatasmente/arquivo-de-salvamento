// WorldSystem: the one place that knows the shape of scenes/posto.js, models/props.js and
// models/car.js. Everything else asks it for points, cars, props, doors and the state the scene reads.
import { createStandins } from './standins.js';

export async function createWorld(r, { seed }) {
  const THREE = r.THREE;
  const postoMod = await import('../scenes/posto.js');
  const propsMod = await import('../models/props.js');
  const carMod = await import('../models/car.js');
  const motoMod = await import('../models/moto.js');
  const posto = postoMod.buildPosto(r, { seed });
  r.scene.add(posto.group);

  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const anchors = {};
  for (const [k, a] of Object.entries(posto.anchors || {})) anchors[k] = { pos: v3(a.pos), dir: v3(a.dir || [0, 0, 1]).normalize() };

  const areas = (Array.isArray(posto.areas) ? posto.areas : Object.entries(posto.areas || {}).map(([id, a]) => ({ id, ...a })))
    .map((a) => ({ id: a.id || a.nome, min: a.min, max: a.max, perigo: a.perigo || 'baixo' }));
  const DANGER = { nenhum: 0, baixo: 1, medio: 2, alto: 3, maximo: 4 };
  const unwrap = (o) => (o && (o.root || o.group)) || o;

  // what the scene reads every frame (see the header of scenes/posto.js)
  const state = { placaSorriso: 0, doors: {}, sino: -99, gaveta: 0, telefoneToca: false, hora: 0, quadroAberto: 0, disjuntores: [true, true, true, true, true, true, true, true], geladeiraPisca: false };
  const doorTarget = {}, waiting = {};
  const box = new THREE.Box3();
  const stand = createStandins(r);
  const pumpRaw = {}, pumpShown = {};
  const baseOn = new Map(posto.lights.map((l) => [l.id, l.on]));

  const world = {
    r, posto, group: posto.group, colliders: posto.colliders || [], lights: posto.lights || [], interactables: posto.interactables || [], areas, anchors, state,
    boxes: posto.boxes || [], shelves: posto.shelves || [], doors: posto.doors || {},
    has: (n) => Boolean(anchors[n]),
    anchor: (n) => anchors[n] || null,
    /** An anchor's position with at least height y (several anchors stand on the floor under the object). */
    at(n, y = 0) { const p = anchors[n].pos.clone(); p.y = Math.max(p.y, y); return p; },
    names: (prefix) => Object.keys(anchors).filter((k) => k.startsWith(prefix)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    /** The smallest area that contains the point, or null. */
    areaAt(x, y, z) {
      let best = null, bv = Infinity;
      for (const a of areas) {
        if (x < a.min[0] || x > a.max[0] || z < a.min[2] || z > a.max[2] || y < a.min[1] - 0.1 || y > a.max[1]) continue;
        const vol = (a.max[0] - a.min[0]) * (a.max[2] - a.min[2]);
        if (vol < bv) { bv = vol; best = a; }
      }
      return best;
    },
    danger: (a) => (a ? DANGER[a.perigo] ?? 1 : 1),
    pumpCount: () => (posto.pumps ? posto.pumps.filter(Boolean).length : 0),
    /** Where a car stands at pump n: centre, heading (yaw, forward = (sin, cos)) and the side of its cap that faces the pump. */
    carSpot(n) {
      const a = anchors['carroBomba' + n];
      const f = a.dir.clone().setY(0).normalize();
      const yaw = Math.atan2(f.x, f.z);
      const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));           // the car's +x
      const toPump = anchors['bomba' + n].pos.clone().sub(a.pos); toPump.y = 0;
      return { pos: a.pos.clone().setY(0), yaw, fwd: f, capSide: left.dot(toPump) >= 0 ? 'left' : 'right' };
    },
    /** Types of fuel that pump n has a nozzle for. */
    nozzleTypes: (n) => world.names(`bico${n}-`).map((k) => k.split('-')[1]),
    interactable: (id) => world.interactables.find((i) => i.id === id) || null,
    /** A box (Box3) around what the player aims at, from the scene's own mesh: for objects whose anchor is on the floor. */
    aimBox(id, grow = 0.08) {
      const it = world.interactable(id); if (!it?.object3D) return null;
      it.object3D.updateWorldMatrix(true, false); box.setFromObject(it.object3D);
      return box.clone().expandByScalar(grow);
    },
    /** Digits the pumps' display has (4, or 5 with the new panel). */
    pumpDigits: () => posto.pumps?.find?.((p) => p)?.digits ?? 5,
    pumpMaxCents: () => 10 ** world.pumpDigits() - 1,
    /** v: cents (a number) or a ready text. The display shows it through `displayFilter` (the pills confuse digits). */
    pumpDisplay(n, v) { pumpRaw[n] = typeof v === 'number' ? Math.max(0, Math.round(v)) : v; world.refreshPumps(world.simT); },
    refreshPumps(t) {
      for (const n of Object.keys(pumpRaw)) {
        const v = pumpRaw[n], d = world.pumpDigits();
        const text = typeof v === 'number' ? (v / 100).toFixed(2).padStart(d + 1, '0') : v;
        const view = world.displayFilter(text, t);
        if (view !== pumpShown[n]) { pumpShown[n] = view; posto.pumps?.[n]?.setDisplay?.(view); }
      }
    },
    displayFilter: (text) => text, simT: 0,
    /** Our names for what the game carries and shows -> the catalog's. kinds: bico {fuel}, produto {tipo}, caixa {label}, carrinho */
    prop(kind, opts = {}) {
      const map = { bico: ['bico', { tipo: opts.fuel }], produto: ['produto', { tipo: opts.tipo }], caixa: ['caixa-estoque', { n: opts.label }], carrinho: ['carrinho', {}], saco: ['saco-lixo', {}], atras: ['produto', { tipo: opts.tipo }] };
      const [name, o] = map[kind] || [kind, opts];
      return unwrap(propsMod.buildProp(r, name, { seed, ...o }));
    },
    stand,
    /** A delivery bike dressed like a car for the pump service: a tank cap to aim at, a rider in place of the driver. */
    moto(motoSeed, { capSide = 'left', color, bare = false } = {}) {
      const m = motoMod.buildMoto(r, { seed: motoSeed, color });
      if (bare) {   // the rider without the helmet (Rafael, back): a bare head and no visor
        m.root.traverse((o) => {
          const g = o.isMesh && o.geometry;
          if (g?.type === 'SphereGeometry' && Math.abs(g.parameters.radius - 0.13) < 1e-3) o.material = r.mat('#b09474');
          else if (g?.type === 'BoxGeometry' && Math.abs(g.parameters.width - 0.2) < 1e-3 && Math.abs(g.parameters.height - 0.07) < 1e-3) o.visible = false;
        });
      }
      const cap = new THREE.Object3D(); cap.position.set(capSide === 'left' ? 0.2 : -0.2, 0.9, 0.12); m.root.add(cap);
      return { root: m.root, tankCap: cap, fuel: 'comum', moto: true, size: m.size, setDriver: (v) => m.setRider(v), setLights: (v) => m.setLights(v), openCap() {}, update: (t) => m.update(t) };
    },
    light: (id) => posto.lights.find((l) => l.id === id) || null,
    /** Switches a lamp of the scene on or off; "on" only restores a lamp that was on to begin with. */
    setLamp(id, on) { const l = world.light(id); if (l) l.on = on ? baseOn.get(id) : false; },
    lampBase: (id) => baseOn.get(id),
    car(carSeed, extra = {}) { return carMod.buildCar(r, { seed: carSeed, ...extra }); },
    // ---- doors: 0 closed .. 1 open; the player opens them with a tap, customers' doors open by themselves
    doorIds: () => Object.keys(world.doors),
    setDoor(id, k) { doorTarget[id] = k; waiting[id] = false; },
    doorOpen: (id) => (doorTarget[id] ?? 0) > 0.5,
    /** set by the game: where the player is, so a door never closes around someone standing in its frame */
    guard: null,
    update(t, dt, extra = {}) {
      const g = world.guard;
      if (g) for (const id of Object.keys(world.doors)) {
        const col = world.doors[id].collider; if (!col) continue;
        const inFrame = g.x > col.min[0] - 0.7 && g.x < col.max[0] + 0.7 && g.z > col.min[2] - 0.7 && g.z < col.max[2] + 0.7;
        if ((doorTarget[id] ?? 0) < 0.5 && inFrame) { doorTarget[id] = 1; waiting[id] = true; }
        else if (waiting[id] && !inFrame) { doorTarget[id] = 0; waiting[id] = false; }   // it closes once the frame is clear
      }
      for (const id of Object.keys(world.doors)) {
        const target = doorTarget[id] ?? 0, cur = state.doors[id] ?? 0;
        state.doors[id] = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 2.2);
      }
      world.simT = t; world.refreshPumps(t);
      Object.assign(state, extra);
      posto.update?.(t, state);
    },
  };
  return world;
}
