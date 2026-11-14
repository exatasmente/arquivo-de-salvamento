// A small generic motorcycle for the delivery rider: low poly, no shape of a real model, no logo on the box.
// Front is +z, the origin is on the ground under the middle of the bike.
//
// buildMoto(r, { seed, color, tint }) -> { root, setRider(bool), setLights(on), setSpeed(mps), update(t), size, headlight, color }
//   setRider: shows or hides the rider (an adult in a dark jacket and a plain helmet).
//   setLights: headlight and tail light.
//   setSpeed: optional; if the caller never uses it, the wheels turn with the DISTANCE the root covered between two
//   update(t) calls (no skating) and the bike leans into a bend and dips its nose braking, on a spring. With setSpeed(mps) the
//   wheels turn as speed * t instead. Out of sequence (a seek) the state resets quietly.
import { D, createBuilder, mulberry32 } from '../scenes/paint.js';

const COLORS = ['#3a5a7a', '#8a3a2a', '#5a6a38', '#8a8a82'];
const WHEEL_R = 0.3;

export function buildMoto(r, { seed = 1, color, tint = 1 } = {}) {
  const T = r.THREE, rnd = mulberry32(seed * 613 + 29);
  const col = color ?? rnd.pick(COLORS);
  const b = createBuilder(r, { tint: () => tint });
  const c = b.ctx({ area: 'moto' });
  const body = D(col, 'plastic'), dark = D('#26262a', 'rubber'), chrome = D('#9a9a92', 'steel'), seat = D('#2c2a2c', 'rubber');
  const trunk = D('#6a6e62', 'plastic'), plate = D('#c8c4b0', 'plastic');

  // frame and engine
  c.box([0.14, 0.12, 1.0], dark, [0, 0.5, 0.0]);
  c.box([0.26, 0.3, 0.36], D('#5a5c5c', 'steel'), [0, 0.38, 0.08]);
  c.box([0.1, 0.1, 0.34], chrome, [0, 0.27, -0.2], [0.2, 0, 0]);
  c.box([0.28, 0.2, 0.46], body, [0, 0.74, 0.22], [-0.06, 0, 0]);
  c.box([0.3, 0.09, 0.62], seat, [0, 0.74, -0.3]);
  c.box([0.2, 0.03, 0.42], body, [0, 0.6, -0.78], [0.12, 0, 0]);
  c.box([0.14, 0.03, 0.42], body, [0, 0.64, 0.7], [-0.1, 0, 0]);
  c.cyl(0.04, 0.04, 0.72, 6, chrome, [0.19, 0.34, -0.22], [Math.PI / 2 - 0.08, 0, 0]);
  // front fork, handlebar, headlight housing, mirrors
  for (const x of [-0.09, 0.09]) c.cyl(0.018, 0.018, 0.7, 5, chrome, [x, 0.6, 0.56], [-0.38, 0, 0]);
  c.cyl(0.016, 0.016, 0.62, 5, dark, [0, 0.95, 0.46], [0, 0, Math.PI / 2]);
  for (const x of [-0.3, 0.3]) c.cyl(0.022, 0.022, 0.1, 5, seat, [x, 0.95, 0.46], [0, 0, Math.PI / 2]);
  c.cyl(0.09, 0.09, 0.1, 8, dark, [0, 0.9, 0.58], [Math.PI / 2, 0, 0]);
  for (const x of [-0.27, 0.27]) { c.box([0.012, 0.16, 0.012], dark, [x, 1.03, 0.44], [0, 0, x < 0 ? 0.2 : -0.2]); c.box([0.07, 0.045, 0.01], chrome, [x * 1.12, 1.12, 0.44]); }
  // rear rack, blank delivery box, blank plate
  c.box([0.36, 0.03, 0.42], dark, [0, 0.86, -0.7]);
  c.box([0.46, 0.4, 0.46], trunk, [0, 1.07, -0.7]);
  c.box([0.48, 0.03, 0.48], dark, [0, 1.275, -0.7]);
  c.box([0.2, 0.1, 0.01], plate, [0, 0.55, -1.0], [0.1, 0, 0]);

  // wheels: loose groups so they can turn
  const wheels = [];
  const wheelRoot = new T.Group(); c.dyn.add(wheelRoot);
  for (const z of [0.64, -0.64]) {
    const g = new T.Group(); g.position.set(0, WHEEL_R, z); wheelRoot.add(g);
    c.mesh(new T.CylinderGeometry(WHEEL_R, WHEEL_R, 0.12, 10), dark, [0, 0, 0], [0, 0, Math.PI / 2], g);
    c.mesh(new T.CylinderGeometry(0.15, 0.15, 0.14, 8), chrome, [0, 0, 0], [0, 0, Math.PI / 2], g);
    c.mesh(new T.BoxGeometry(0.15, 0.04, 0.3), dark, [0, 0, 0], [0, 0, 0], g);
    wheels.push(g);
  }

  // lights
  const glow = (colr, w, h) => new T.Mesh(new T.PlaneGeometry(w, h), r.glow(colr));
  const head = glow('#f4e8b8', 0.12, 0.12); head.position.set(0, 0.9, 0.635); c.dyn.add(head);
  const tail = glow('#c02a1a', 0.12, 0.05); tail.position.set(0, 0.62, -1.001); tail.rotation.y = Math.PI; c.dyn.add(tail);
  const headlight = new T.Object3D(); headlight.position.set(0, 0.9, 0.7); headlight.name = 'farol'; c.dyn.add(headlight);
  const offH = new T.Color('#4a4a44'), offT = new T.Color('#4a1a14');
  const setLights = (on) => {
    head.material.uniforms.uColor.value.set(on ? '#fff4c8' : offH);
    tail.material.uniforms.uColor.value.set(on ? '#e03020' : offT);
  };
  setLights(false);

  // the rider: leaning toward the bars, helmet with a dark visor
  const rider = new T.Group(); rider.position.z = 0.06; c.dyn.add(rider); // a hand's width forward: the back of the jacket was inside the delivery box
  const jacket = D('#3c3a40', 'rubber'), pants = D('#2e3038', 'rubber'), helmet = D('#cfcbbe', 'plastic'), visor = D('#1c2024', 'rubber');
  c.mesh(new T.BoxGeometry(0.38, 0.52, 0.22), jacket, [0, 1.12, -0.3], [0.38, 0, 0], rider);
  const head3 = new T.Group(); head3.position.set(0, 1.5, -0.1); rider.add(head3);
  const hm = c.mesh(new T.SphereGeometry(0.13, 7, 5), helmet, [0, 0, 0], [0, 0, 0], head3); hm.scale.set(1, 1.08, 1.15);
  c.mesh(new T.BoxGeometry(0.2, 0.07, 0.1), visor, [0, 0.015, 0.1], [0.05, 0, 0], head3);
  for (const x of [-1, 1]) {
    c.mesh(new T.BoxGeometry(0.09, 0.09, 0.62), jacket, [x * 0.26, 1.12, 0.12], [0.5, 0, 0], rider);
    c.mesh(new T.BoxGeometry(0.15, 0.14, 0.46), pants, [x * 0.17, 0.86, -0.12], [0, 0, 0], rider);
    c.mesh(new T.BoxGeometry(0.13, 0.5, 0.13), pants, [x * 0.21, 0.6, 0.1], [-0.15, 0, 0], rider);
  }
  const setRider = (v) => { rider.visible = Boolean(v); };
  setRider(true);

  b.flush(c.dyn);
  const root = c.dyn; root.name = 'moto';
  // everything but the wheels rides on the body group: it leans and dips on a spring
  const body3 = new T.Group(); body3.name = 'corpo';
  for (const ch of [...root.children]) if (ch !== wheelRoot) body3.add(ch);
  const lean = new T.Group(); lean.name = 'inclina'; lean.add(wheelRoot, body3); root.add(lean);   // the wheels lean with the bike; only the body dips
  const st = { speed: 0, forced: false };
  const mv = { t: null, x: 0, z: 0, yaw: 0, v: 0, a: 0, spin: 0, pitch: 0, pv: 0, roll: 0, rv: 0, brake: false };
  const norm = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const tailOn = { on: false };
  function roll(t) {
    const dt = mv.t === null ? -1 : t - mv.t, p = root.position, yaw = root.rotation.y;
    if (dt > 1e-5 && dt <= 0.25) {
      const dx = p.x - mv.x, dz = p.z - mv.z, ds = dx * Math.sin(yaw) + dz * Math.cos(yaw), v = ds / dt;
      if (Math.abs(v) < 40) {
        mv.spin += ds / WHEEL_R;
        const dyaw = norm(yaw - mv.yaw), a = (v - mv.v) / dt; mv.a += (a - mv.a) * (1 - Math.exp(-dt * 8)); mv.v = v;
        const pt = Math.max(-0.05, Math.min(0.05, -mv.a * 0.014)), rt = Math.max(-0.35, Math.min(0.35, (dyaw / dt) * v * -0.06));
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
        for (let i = 0; i < n; i++) { mv.pv += ((pt - mv.pitch) * 80 - mv.pv * 7) * h; mv.pitch += mv.pv * h; mv.rv += ((rt - mv.roll) * 40 - mv.rv * 6) * h; mv.roll += mv.rv * h; }
      }
    } else if (dt < -1e-5 || dt > 0.25 || mv.t === null) { mv.v = mv.a = mv.pitch = mv.pv = mv.roll = mv.rv = 0; }
    if (dt < -1e-5 || dt > 1e-5 || mv.t === null) { mv.x = p.x; mv.z = p.z; mv.yaw = yaw; mv.t = t; }
    body3.rotation.x = mv.pitch; lean.rotation.z = mv.roll;
    const brake = mv.v > 0.3 && mv.a < -0.5;
    if (brake !== mv.brake) { mv.brake = brake; tail.material.uniforms.uColor.value.set(brake ? '#ff4a30' : tailOn.on ? '#e03020' : offT); }
    return mv.spin;
  }
  const setLights2 = (on) => { tailOn.on = Boolean(on); setLights(on); if (mv.brake) tail.material.uniforms.uColor.value.set('#ff4a30'); };
  return {
    root, setRider, setLights: setLights2, setSpeed(mps) { st.speed = mps; st.forced = true; }, headlight, color: col, size: { l: 2.0, w: 0.75, h: 1.65 },
    update(t) {
      const spin = roll(t);
      const a = st.forced ? (st.speed * t) / WHEEL_R : spin;
      for (const w of wheels) w.rotation.x = a;
      head3.rotation.y = rider.visible ? Math.sin(t * 0.45) * 0.3 : 0;
      rider.position.y = rider.visible ? Math.sin(t * 31) * 0.0025 : 0;
    },
  };
}
