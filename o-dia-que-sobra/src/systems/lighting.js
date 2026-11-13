// LightingSystem: of all the lights the station has, the 8 most relevant to where the player is go
// to the renderer each frame (the PS1 look: at most 8 dynamic lights; the rest is baked colour).
// Also: ambient by area, lights that fail, the flashlight cone, the switch board.

export function createLighting(bus, { world, render, player, flash, opts }) {
  const lights = world.lights;
  const N = render.POINT_LIGHTS;
  let chosen = new Set();
  const off = new Set();           // ids switched off (power failure, burnt out)
  const dim = new Map();           // id -> multiplier set by an event
  const THREE = render.THREE;
  const spotDir = new THREE.Vector3(0, 0, -1);
  const color = new THREE.Color();
  let areaId = 'externa';

  // The scene writes `level` (0..1) for lights that flicker. It is held for a third of a second at a time, so
  // a light never changes more than 3 times a second; with "reduce flashes" it only dims, never goes out.
  const held = new Map();
  function intensity(l, t) {
    if (!l.on || l.burnt || off.has(l.id) || (world.posto.breakers && !world.posto.breakers.powered(l))) return 0;
    let k = dim.has(l.id) ? dim.get(l.id) : 1;
    if (l.pisca || l.level !== undefined && l.level < 1) {
      let h = held.get(l.id);
      if (!h || t >= h.until) { h = { v: l.level ?? 1, until: t + 0.34 }; held.set(l.id, h); }
      k *= opts.reduceFlash ? Math.max(0.65, h.v) : h.v;
    }
    return k;
  }

  function update(dt, t) {
    const p = player.st;
    const area = world.areaAt(p.x, 1, p.z);
    areaId = area ? area.id : 'externa';
    const indoor = area && ['loja', 'escritorio', 'estoque', 'banheiros', 'servico'].includes(area.id);
    render.light({ ambient: indoor ? 0x464954 : 0x3c3f4c, key: 0x0a0c14, keyDir: [-0.3, -1, -0.2] });
    // score the lights: those that reach the player first, then the closest
    const sc = [];
    for (const l of lights) {
      const k = intensity(l, t); if (k <= 0) continue;
      const d = Math.hypot(l.pos[0] - p.x, l.pos[1] - p.eye, l.pos[2] - p.z);
      if (d > l.range + 14) continue;
      sc.push({ l, k, s: (d < l.range ? 3 : 0) + l.range / (d + 3) + (chosen.has(l.id) ? 0.6 : 0) });
    }
    sc.sort((a, b) => b.s - a.s);
    chosen = new Set();
    for (let i = 0; i < N; i++) {
      const e = sc[i];
      if (!e) { render.point(i, { color: 0x000000, range: 1 }); continue; }
      chosen.add(e.l.id);
      color.set(e.l.color).multiplyScalar(e.k * 0.95);
      render.point(i, { pos: e.l.pos, color: color.getHex(), range: e.l.range });
    }
    // the flashlight
    const f = flash();
    if (f.on && f.charge > 0) {
      const fwd = player.forward();
      spotDir.lerp(fwd, Math.min(1, dt * 12)).normalize();
      const eye = player.eyePos();
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      let k = 1;
      if (f.charge < 30) k = flickerLow(t, f.charge, opts.reduceFlash);
      eye.addScaledVector(right, 0.16); eye.y -= 0.14;
      render.spot({ on: k > 0.01, pos: [eye.x, eye.y, eye.z], dir: [spotDir.x, spotDir.y, spotDir.z], color: new THREE.Color(0.95 * k, 0.88 * k, 0.7 * k).getHex(), range: f.range, cos: f.cos });
    } else render.spot({ on: false });
  }
  function flickerLow(t, charge, reduce) {
    const q = Math.floor(t * 6 + charge) % 9;
    return q === 0 ? (reduce ? 0.7 : 0.15) : 1;
  }
  return {
    update,
    setPower(id, on) { if (on) off.delete(id); else off.add(id); bus.emit('light:power', id, on); },
    isOn: (id) => !off.has(id),
    dimLight(id, k) { if (k === null) dim.delete(id); else dim.set(id, k); },
    get area() { return areaId; },
    get chosen() { return [...chosen]; },
    /** Is the player standing in a lit place? (any light of the area on and close) */
    litAt(x, z) {
      for (const l of lights) { if (!l.on || l.burnt || off.has(l.id) || (world.posto.breakers && !world.posto.breakers.powered(l))) continue; if (Math.hypot(l.pos[0] - x, l.pos[2] - z) < l.range * 0.8 && l.kind !== 'placa') return true; }
      return false;
    },
  };
}
