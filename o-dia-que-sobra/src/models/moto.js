// A small generic motorcycle for the delivery rider: low poly, no shape of a real model, no logo on the box.
// Front is +z, the origin is on the ground under the middle of the bike.
//
// buildMoto(r, { seed, color, tint }) -> { root, setRider(bool), setLights(on), setSpeed(mps), update(t), size, headlight, color }
//   setRider: shows or hides the rider (an adult in a dark jacket and a plain helmet).
//   setLights: headlight and tail light.
//   setSpeed: wheels turn as speed * t, so update(t) stays a pure function of time.
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
  for (const z of [0.64, -0.64]) {
    const g = new T.Group(); g.position.set(0, WHEEL_R, z); c.dyn.add(g);
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
  const rider = new T.Group(); c.dyn.add(rider);
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
  const st = { speed: 0 };
  return {
    root, setRider, setLights, setSpeed(mps) { st.speed = mps; }, headlight, color: col, size: { l: 2.0, w: 0.75, h: 1.65 },
    update(t) {
      const a = (st.speed * t) / WHEEL_R;
      for (const w of wheels) w.rotation.x = a;
      head3.rotation.y = rider.visible ? Math.sin(t * 0.45) * 0.3 : 0;
      rider.position.y = rider.visible ? Math.sin(t * 31) * 0.0025 : 0;
    },
  };
}
