// Generic passenger cars, low poly, no shape of a real model. Colour, body and the fuel of the tank come
// from the seed. Front is +z, the driver (left-hand drive) sits on +x.
//
// buildCar(r, { seed, fuel, capSide, style, color, abandoned, tint, vidro }) ->
//   { root, tankCap, fuel, capSide, style, size, headlights, vidro, seat { x, y, z: where the driver sits; a passenger sits at -x }, setDriver(v), setLights(on), openCap(k), update(t) }
//   vidro: 'escuro' paints every window almost black and keeps the driver out of sight whatever setDriver says
//   (the car that only stops and looks); anything else is the ordinary glass.
//   tankCap: Object3D on the rear quarter; its child `flap` carries the sticker (pictogram + the colour of
//   the nozzle for that fuel). Park the car so that the cap side faces the pump.
import { D, FUEL_KEYS, fuelUV, createBuilder, mulberry32, canvasTexture, tex } from '../scenes/paint.js';

const COLORS = ['#8a8e8a', '#c4b894', '#8a4a40', '#6c7a58', '#58708c', '#d4d0c0', '#9a7a56', '#4a4c54'];
const STYLES = ['sedan', 'hatch', 'perua'];
const DIMS = { // [length, body height, cabin z centre, cabin half length (bottom), cabin height]
  sedan: { L: 4.3, cz: -0.15, ch: 1.0, cabH: 0.55 },
  hatch: { L: 3.8, cz: -0.25, ch: 1.1, cabH: 0.58 },
  perua: { L: 4.5, cz: -0.35, ch: 1.35, cabH: 0.56 },
  caminhao: { L: 6.4, cz: 2.2, ch: 1.0, cabH: 1.0, W: 2.3, H: 3.2, cabL: 2.0 },
};

const cabinTexKey = new Map(); // dark? -> { r, t }
function cabinTexture(r, dark = false) {
  const hit = cabinTexKey.get(dark);
  if (hit && hit.r === r) return hit.t;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark ? '#06070a' : '#20262c';
  for (let q = 0; q < 4; q++) { g.fillRect(q * 4 + 0, 3, 4, 8); }
  g.fillStyle = '#ffffff'; for (let q = 0; q < 4; q++) g.fillRect(q * 4 + 1, 3, 0, 8);
  g.fillStyle = '#ffffff'; for (let q = 0; q < 4; q++) g.fillRect(q * 4 + 3, 3, 1, 8); // pillars
  if (dark) { g.fillStyle = '#161c22'; for (let q = 0; q < 4; q++) g.fillRect(q * 4, 4, 3, 1); } // one faint streak of sky on each pane
  const t = canvasTexture(r, c, false); cabinTexKey.set(dark, { r, t }); return t;
}

export function buildCar(r, { seed = 1, fuel, capSide, style, color, abandoned = false, tint = 1, flatTire = abandoned, vidro } = {}) {
  const T = r.THREE, rnd = mulberry32(seed * 977 + 13);
  const st = style ?? rnd.pick(STYLES), P = DIMS[st];
  const truck = st === 'caminhao';
  const fuelKey = fuel ?? (truck ? 'diesel' : rnd.pick(FUEL_KEYS));
  const side = capSide ?? (rnd() < 0.5 ? 'left' : 'right'), sx = side === 'left' ? 1 : -1;
  let col = color ?? rnd.pick(COLORS);
  if (abandoned) col = '#' + new T.Color(col).lerp(new T.Color('#8a826e'), 0.45).getHexString();
  const b = createBuilder(r, { tint: () => tint });
  const c = b.ctx({ area: 'car' });
  const body = D(col, 'plastic'), dark = D('#26262a', 'rubber'), chrome = D('#9a9a92', 'steel');
  const W = P.W ?? 1.78, L = P.L;
  const tinted = vidro === 'escuro';
  const glass = D(tinted ? '#050608' : '#1c2428', 'rubber');
  if (truck) {
    // box truck: flat-nosed cab in front, light cargo box behind, dark chassis between the axles
    const cabZ = L / 2 - P.cabL / 2, boxL = L - P.cabL - 0.1, boxZ = -L / 2 + boxL / 2, boxCol = D('#d4d0c0', 'plastic');
    c.box([W - 0.3, 0.3, L - 0.1], dark, [0, 0.62, 0]);
    c.box([W, 1.5, P.cabL], body, [0, 1.4, cabZ]);
    c.box([W - 0.2, 0.4, 0.06], dark, [0, 0.95, L / 2 + 0.01]);
    c.quad(W - 0.3, 0.75, glass, [0, 1.75, L / 2 + 0.003], [0, 0, 0]);
    for (const sx of [-1, 1]) c.quad(P.cabL - 0.5, 0.65, glass, [sx * (W / 2 + 0.003), 1.78, cabZ - 0.1], [0, sx * Math.PI / 2, 0]);
    c.box([W + 0.04, 0.12, 0.2], dark, [0, 0.7, L / 2 - 0.02]);
    c.box([W, P.H - 0.8, boxL], boxCol, [0, 0.8 + (P.H - 0.8) / 2, boxZ]);
    c.box([W + 0.02, 0.06, boxL], dark, [0, 0.8, boxZ]);
    c.box([0.02, P.H - 1.0, 0.02], dark, [0, 0.8 + (P.H - 0.8) / 2, -L / 2 - 0.005]);
    for (const sx of [-1, 1]) c.box([0.1, 0.1, 0.5], dark, [sx * (W / 2 - 0.1), 0.45, -L / 2 + 0.4]);
  } else {
    // lower body, hood and trunk slightly lower than the belt
    c.box([W, 0.5, L], body, [0, 0.55, 0]);
    c.box([W - 0.1, 0.12, L * 0.3], body, [0, 0.86, L * 0.31]);
    if (st !== 'perua') c.box([W - 0.1, 0.1, L * 0.2], body, [0, 0.85, -L * 0.4]);
    c.box([W + 0.04, 0.16, 0.18], dark, [0, 0.4, L / 2 - 0.05]); c.box([W + 0.04, 0.16, 0.18], dark, [0, 0.4, -L / 2 + 0.05]);
    c.box([W + 0.02, 0.1, L - 0.4], dark, [0, 0.27, 0]);
    // cabin: a four-sided frustum with the windows painted on it
    const fr = new T.CylinderGeometry(0.64, 0.8, P.cabH, 4);
    fr.rotateY(Math.PI / 4);
    const cabin = D(col, null, null); cabin.texture = cabinTexture(r, tinted); cabin.key += tinted ? 'cabinDark' : 'cabin';
    c.geo(fr, cabin, [0, 0.8 + P.cabH / 2, P.cz], [0, 0, 0], [(W / 2 - 0.1) / 0.566, 1, P.ch / 0.566 * 1.0]);
  }
  // wheels (the truck has a front axle and a rear axle with twin wheels)
  const wR = truck ? 0.45 : 0.3, axles = truck ? [[1, L / 2 - 1.0], [-1, -L / 2 + 1.0], [-1, -L / 2 + 1.6]] : [[1, L / 2 - 0.75], [-1, -(L / 2 - 0.75)]];
  for (const [fz, z] of axles) for (const x of [-1, 1]) {
    const flat = flatTire && x === -1 && fz === 1 && !truck;
    c.cyl(wR, wR, truck ? 0.3 : 0.22, 8, dark, [x * (W / 2 - 0.02), flat ? 0.24 : wR, z], [0, 0, Math.PI / 2], [flat ? 0.8 : 1, 1, flat ? 0.8 : 1]);
    c.cyl(wR * 0.47, wR * 0.47, truck ? 0.32 : 0.24, 6, chrome, [x * (W / 2 - 0.02), flat ? 0.24 : wR, z], [0, 0, Math.PI / 2]);
  }
  if (abandoned) for (let i = 0; i < 5; i++) c.box([0.28 + rnd() * 0.2, 0.012, 0.2 + rnd() * 0.25], D('#556040', 'grass'), [(rnd() - 0.5) * 0.7, 0.8 + P.cabH + 0.005 - 0.03, P.cz + (rnd() - 0.5) * 0.7]);
  // number plates: blank, no text
  const py = truck ? 0.62 : 0.42;
  c.box([0.4, 0.12, 0.01], D('#c8c4b0', 'plastic'), [0, py, L / 2 + (truck ? 0.07 : 0.05)]); c.box([0.4, 0.12, 0.01], D('#c8c4b0', 'plastic'), [0, py, -L / 2 - 0.05]);
  // fuel cap on the rear quarter with the sticker on the flap
  const capY = truck ? 1.0 : 0.78, capZ = truck ? L / 2 - P.cabL - 0.15 : -L / 2 + 0.75;
  const tankCap = new T.Object3D(); tankCap.position.set(sx * (W / 2), capY, capZ); tankCap.name = 'tankCap';
  const flapPivot = new T.Group(); flapPivot.position.set(0, 0, -0.1); tankCap.add(flapPivot);
  const fl = new T.Mesh(new T.BoxGeometry(0.02, 0.2, 0.2), b.material(body, 'car', true)); fl.position.set(sx * 0.01, 0, 0.1); flapPivot.add(fl);
  const sticker = new T.Mesh(new T.PlaneGeometry(0.13, 0.13), r.mat('#ffffff', { map: tex(r, 'fuel') }));
  const uv = fuelUV(fuelKey), a = sticker.geometry.attributes.uv;
  for (let i = 0; i < 4; i++) a.setXY(i, a.getX(i) ? uv[2] : uv[0], a.getY(i) ? uv[3] : uv[1]);
  sticker.position.set(sx * 0.0215, 0, 0.1); sticker.rotation.y = sx * Math.PI / 2; flapPivot.add(sticker);
  c.box([0.01, 0.17, 0.17], dark, [sx * (W / 2 - 0.005), capY, capZ]);
  tankCap.userData.flap = flapPivot; tankCap.userData.fuel = fuelKey;
  const openCap = (k) => { flapPivot.rotation.y = -sx * 1.9 * Math.max(0, Math.min(1, k)); };
  // lights
  const hl = [], tl = [];
  const mk = (x, z, y, w, h, colr, list) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), r.glow(colr)); m.position.set(x, y, z); if (z < 0) m.rotation.y = Math.PI; c.dyn.add(m); list.push(m); return m;
  };
  const lx = truck ? W / 2 - 0.3 : 0.6, ly = truck ? 0.85 : 0.62;
  for (const x of [-lx, lx]) { mk(x, L / 2 + 0.041, ly, 0.26, 0.12, '#f4e8b8', hl); mk(x, -L / 2 - 0.041, truck ? 0.95 : 0.62, 0.22, 0.1, '#c02a1a', tl); }
  const headlights = hl.map((m, i) => { const o = new T.Object3D(); o.position.set(m.position.x, m.position.y, m.position.z + 0.1); c.dyn.add(o); o.name = 'farol' + i; return o; });
  const off = new T.Color('#4a4a44'), offT = new T.Color('#4a1a14');
  const setLights = (on) => {
    hl.forEach((m) => m.material.uniforms.uColor.value.set(on ? '#fff4c8' : off));
    tl.forEach((m) => m.material.uniforms.uColor.value.set(on ? '#e03020' : offT));
  };
  setLights(false);
  // driver: an adult silhouette in dark clothes behind the glass
  const driver = new T.Group(); // the head tops out at 0.48 + 0.62 + 0.14 = 1.24 m: inside the painted window (about 0.97 to 1.25 m) and under every roof (1.35 m and up)
  const seat = { x: truck ? 0.5 : 0.4, y: truck ? 1.1 : 0.48, z: truck ? L / 2 - 1.0 : P.cz + 0.2 };
  driver.position.set(seat.x, seat.y, seat.z); driver.visible = false; c.dyn.add(driver);
  const cloth = D('#3c3a40', 'rubber'), skin = D('#a88468', 'plastic');
  c.mesh(new T.BoxGeometry(0.42, 0.5, 0.2), cloth, [0, 0.25, 0], [0, 0, 0], driver);
  const head = c.mesh(new T.SphereGeometry(0.12, 6, 4), skin, [0, 0.62, 0], [0, 0, 0], driver); head.scale.set(1, 1.15, 1);
  c.mesh(new T.BoxGeometry(0.4, 0.06, 0.34), cloth, [0, 0.35, 0.28], [0.1, 0, 0], driver);
  const setDriver = (v) => { driver.visible = tinted ? false : Boolean(v); }; // behind tinted glass nobody shows
  b.flush(c.dyn);
  const root = c.dyn; root.add(tankCap); root.name = 'carro';
  return {
    root, tankCap, fuel: fuelKey, capSide: side, style: st, color: col, vidro: tinted ? 'escuro' : 'comum', seat, size: { l: L, w: W, h: truck ? P.H : 0.8 + P.cabH }, headlights, setDriver, setLights, openCap,
    update(t) { head.rotation.y = driver.visible ? Math.sin(t * 0.4) * 0.25 : 0; },
  };
}
