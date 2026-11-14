// LightingSystem: of all the lights the station has, the 8 most relevant to where the player is go
// to the renderer each frame (the PS1 look: at most 8 dynamic lights; the rest is baked colour).
// Also: ambient by area, lights that fail, the flashlight cone, the switch board.

export function createLighting(bus, { world, render, player, flash, opts, hours = () => 0 }) {
  const lights = world.lights;
  const N = render.POINT_LIGHTS;
  let chosen = new Set();
  const off = new Set();           // ids switched off (power failure, burnt out)
  const dim = new Map();           // id -> multiplier set by an event
  const THREE = render.THREE;
  const spotDir = new THREE.Vector3(0, 0, -1);
  const color = new THREE.Color();
  let areaId = 'externa';

  // ---- the first blue before the dawn: over the night the sky and the haze go from closed night to a weak grey-blue, never to day. Until 04:00 almost nothing
  // changes; from 04:00 to 06:00 the east horizon glows a little and the trees and the highway show against it. At 06:00 it is still dark: the lights of
  // the station, the sign and the flashlight still matter. `hours()` is the shift's clock in hours, 0 when no night is on (the title, the preparation, the day off).
  const NIGHT = new THREE.Color('#07080d'), DAWN_FOG = new THREE.Color('#161e2c'), DAWN_SKY = new THREE.Color('#121a28'), AMB0 = new THREE.Color(0x3c3f4c), AMB1 = new THREE.Color(0x474f61);
  const fogC = new THREE.Color(), skyC = new THREE.Color(), ambC = new THREE.Color();
  const dawnK = (h) => (h <= 0 ? 0 : h < 4 ? 0.04 * h / 4 : 0.04 + 0.96 * ((u) => u * u * (3 - 2 * u))(Math.min(1, (h - 4) / 2)));
  // a dome of glow around the player: strongest low in the east, none overhead; added to the dark sky, under everything (so what stands in front stays dark)
  const dome = (() => {
    const geo = new THREE.SphereGeometry(95, 20, 10), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, y, z), h = Math.hypot(x, z) || 1;
      const east = Math.max(0, x / h), low = Math.max(0, 1 - Math.abs(y) / (r * 0.55)), up = y < 0 ? 0 : 1;
      const g = up * low * low * (0.22 + 0.78 * east * east);
      col[i * 3] = 0.36 * g; col[i * 3 + 1] = 0.47 * g; col[i * 3 + 2] = 0.62 * g;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, color: 0x000000 }));
    m.name = 'dawn-dome'; m.renderOrder = -10; m.frustumCulled = false; m.visible = false;
    render.scene.add(m);
    return m;
  })();

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
    const k = dawnK(hours());
    fogC.copy(NIGHT).lerp(DAWN_FOG, k); skyC.copy(NIGHT).lerp(DAWN_SKY, k); ambC.copy(AMB0).lerp(AMB1, k * 0.8);
    render.light({ ambient: indoor ? 0x464954 : ambC.getHex(), key: 0x0a0c14, keyDir: [-0.3, -1, -0.2], fog: fogC.getHex() });
    render.scene.background.copy(skyC);
    dome.visible = k > 0.005; dome.position.set(p.x, 0, p.z); dome.material.color.setScalar(k);
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
    /** The dawn's glow goes off at once (a cutscene or an ending takes the picture: it has its own sky). */
    dawnOff() { dome.visible = false; },
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
