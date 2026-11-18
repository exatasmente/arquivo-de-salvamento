// The scene "rua": the avenue above the station, made by hand. Its entities come from streetLayout in rua-layout.js, and data/scenes/rua.json
// is its output (edited in the scene editor). The terrain (the asphalt, the sidewalks, the markings), the sky with its stars and moon are made
// here; everything standing on it is an entity of the layout (buildings, the viaduct, lamps, cars, the skip, the marquise, the panels and
// the cable, the manhole, the water tower). The city is built of pieces (models/city/); the stretches of the exits (versão 2) are fixed
// stretches of this same street, not streets made from a seed.
//
// Contract with the game: buildScene(r, { layout, editor, hooks }) -> { group, ents, views, lights, update(t, ctx), spawn,
//   colliders, exits, hides, setDaylight(k), ground(x, z), setActive(on), setThing(name, state) }.
//   setThing('cabo', 'cortado' | 'emendado'), ('paineis', 'sujo' | 'limpo').
import { kitOf, countTris } from '../models/kit.js';
import { cityBuilders, createCityLod, stationEntrance, installPaints, setWindowNight, planDetails, buildGround, GROUND, installMob, flush, tree, tuft, bag, scrap, wiring, lotWalls, DRAW, Shape, addPiece } from '../models/city/index.js';
import { placeEntities, invert, makeThings } from './common.js';
import { mulberry32 } from '../../vendor/engine/rng.js';
import { STREET } from './rua-layout.js';
import { footprint as grateFootprint } from './grade.js';
import LAYOUT from '../../data/scenes/rua.json' with { type: 'json' };

export const VIEWS = {
  inicio: { eye: [-4.5, 1.7, 6.2], at: [1, 0.6, 9.6] },
  avenida: { eye: [-40, 1.7, 3], at: [20, 3, -2] },
  alto: { eye: [-22, 14, 30], at: [0, 2, -2] },
};
export const SIZE = 120;
export const BOUNDS = { x: STREET.halfX, z: STREET.walk };

const lerpHex = (T, a, b, k) => '#' + new T.Color(a).lerp(new T.Color(b), k).getHexString();

export function buildScene(r, { layout, editor = false, hooks = {} } = {}) {
  layout = layout ?? LAYOUT;   // the street as the scene editor left it (data/scenes/rua.json)
  const T = r.THREE, kit = kitOf(r), group = new T.Group();
  installPaints(kit);
  const kindName = 'comercial';
  // `?velho` in the address: the street with the old boxes (before the city), only to compare in the captures
  const OLD = !editor && /(?:^|[?&])velho(?:[=&]|$)/.test(globalThis.location?.search ?? '');
  const { road, walk, curb, halfX } = STREET;
  let daylight = 0, eye = [0, 1.6, 0];

  // --- the terrain -------------------------------------------------------------------------------------------
  const tb = new kit.Batch(), L = 420; // the avenue runs on far past the end of the walkable street, into the fog
  const dr = mulberry32(7 * 131 + 7), taken = [], decor = [];
  for (const e of layout.entities) if (['poste', 'hidrante', 'semaforo', 'placa', 'cacamba', 'painelSolar', 'marquise', 'pontoDeEmbarque', 'pontoDeEntrega', 'bocaRua', 'cabo'].includes(e.type)) taken.push([e.pos[0], e.pos[2], e.type === 'marquise' || e.type === 'painelSolar' ? 9 : e.type === 'cabo' ? 10 : 2.2]);
  const clear = (x, z, rad = 0) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + rad);
  const spot = (x, s) => !clear(x, s * (road + 0.85), 1.2) || (s > 0 && x > -12 && x < 8);
  const SPOTS = { skipTree: spot, skipFurniture: (x, s) => !clear(x, s * (walk - 0.9), 1.2) || (s > 0 && x > -12 && x < 21), skipGrate: (x, s) => s > 0 && x > -12 && x < -6 };
  const collide = (id, x, z, w, d) => decor.push({ id, min: [x - w / 2, z - d / 2], max: [x + w / 2, z + d / 2] });
  let stationBoxes = [];
  if (OLD) {
    tb.box({ c: '#7e7c82', map: 'asfalto' }, [L, 0.3, road * 2], [0, -0.3, 0], { tile: 4, cell: 3, skip: ['-y', '+x', '-x', '+z', '-z'] });
    for (const s of [-1, 1]) {
      tb.box({ c: '#b8b6b0', map: 'calcada' }, [L, curb, walk - road], [0, 0, s * (road + (walk - road) / 2)], { tile: 3, cell: 3, skip: ['-y'] });
      tb.box({ c: '#6a6a68', map: 'calcada' }, [L, curb + 0.3, 0.2], [0, -0.3, s * (road + 0.1)], { tile: 2, cell: 8, skip: ['-y', '+y'] });
    }
    tb.box({ c: '#9c9c9a', map: 'calcada' }, [L + 120, 0.2, 200], [0, -0.3, 0], { tile: 6, cell: 12, skip: ['-y'] });
    // markings: double centre line, edge lines, dashes between the lanes, two crossings with a stop line
    const paint = { c: '#d8c05a' }, white = { c: '#dcdcd4' };
    for (const z of [-0.12, 0.12]) tb.box(paint, [L, 0.012, 0.1], [0, 0.0, z], { cell: 20 });
    for (const z of [-6.3, 6.3]) tb.box(white, [L, 0.012, 0.12], [0, 0.0, z], { cell: 20 });
    for (const z of [-3.3, 3.3]) for (let x = -L / 2; x < L / 2; x += 6) tb.box(white, [3, 0.012, 0.12], [x + 1.5, 0.0, z], { cell: 4 });
    for (const cx of [-24, 26]) {
      for (let z = -6; z <= 6; z += 1.0) tb.box(white, [3, 0.012, 0.5], [cx, 0.0, z], { cell: 4 });
      for (const s of [-1, 1]) tb.box(white, [0.4, 0.012, 6.2], [cx + s * 2.4, 0.0, s > 0 ? -3.2 : 3.2], { cell: 4 });
    }
  } else {
    // The ground is painted as one piece (models/city/ground.js): first what is where (the same places the details always had: planDetails walks
    // the same random numbers as the old terrainDetails, so the trees, the benches, the bins and their colliders did not move), then the painting.
    installMob(kit);
    const plan = planDetails(STREET, kindName, dr, SPOTS), of = (...t) => layout.entities.filter((e) => t.includes(e.type)), fr = mulberry32(7 * 59 + 3), H = curb;
    // the buildings' fronts, by side: where the rows are open there are lots and alleys to wall off
    const rows = { 1: [], [-1]: [] };
    for (const e of of('predio', 'loja')) { const w = Math.max(6, Math.round((e.params.largura ?? 9) / 3) * 3); rows[e.pos[2] > 0 ? 1 : -1].push([e.pos[0] - w / 2, e.pos[0] + w / 2]); }
    const walls = [], weeds = [], lifted = [];
    for (const s of [1, -1]) {
      const iv = rows[s].sort((a, b) => a[0] - b[0]); let x = -halfX - 6;
      for (const [a, b] of [...iv, [halfX + 6, halfX + 7]]) {
        const gap = a - x;
        if (gap > 7) walls.push({ x0: x, x1: a, z: s * (GROUND.wall + 0.02), face: -s, seed: Math.round(x * 3 + s * 11), line: true, gates: x < -5 && a > 5 ? [{ at: -2.6 - x, w: 5.2 }] : gap > 14 ? [{ at: gap * 0.3, w: 3.2 }] : [] });
        else if (gap > 0.5) walls.push({ x0: x - 0.1, x1: a + 0.1, z: s * (GROUND.wall + 2.4), face: -s, seed: Math.round(x * 5 + s * 7), kind: 'brick', gates: gap > 3.4 ? [{ at: 0.5, w: gap - 0.8 }] : [] });
        x = Math.max(x, b);
      }
    }
    for (let i = 0; i < 110; i++) { const s = fr() < 0.5 ? 1 : -1, k = fr(), x = -halfX + fr() * halfX * 2; weeds.push([k < 0.45 ? x : Math.round(x / 1.5) * 1.5, s * (k < 0.45 ? GROUND.wall - 0.06 - fr() * 0.12 : k < 0.7 ? road + 0.27 + fr() * 0.05 : road + 0.25 + Math.floor(fr() * 3) * ((GROUND.wall - road - 0.25) / 3) + (k < 0.85 ? 0 : fr() * 1.5)), fr()]); }
    for (const t of plan.trees) lifted.push([Math.floor((t.x + 60) / 1.5) * 1.5 - 60 + 1.5, t.s, 0, 0.05], [Math.floor((t.x + 60) / 1.5) * 1.5 - 60 - 1.5, t.s, 1, 0.04]);
    for (const [x, s, row, h] of [[-28.5, 1, 1, 0.045], [-36, 1, 2, 0.04], [24, 1, 0, 0.05], [-21, -1, 1, 0.05], [9, -1, 0, 0.04], [38, -1, 2, 0.045]]) lifted.push([x, s, row, h]);
    const station = STREET.station, M = {
      crossings: [-24, 26], viaduct: 5.2, manholes: plan.manholes, inlets: plan.grates, trees: plan.trees.map((t) => [t.x, t.s]), lifted, weeds, trenches: [-37.6, 33.4], skids: [[7, -4.4], [-47, 1.1]],
      stains: [...of('carro').map((e) => [e.pos[0], e.pos[2], 0.75]), ...of('cacamba').map((e) => [e.pos[0] + 0.5, e.pos[2] - 0.2, 0.9])],
      puddles: [[-17.6, 5.6, 1.5, 0.42], [-6.2, 5.7, 1.7, 0.36], [2.6, -1.2, 1.3, 0.7], [-28, -5.7, 2.1, 0.36], [12.2, 5.7, 1.2, 0.34], [-44, 2.3, 1.0, 0.6], [30, -2.1, 1.4, 0.8], [44, 5.7, 1.5, 0.34], [-2.4, 3.2, 0.8, 0.5]],
      spots: [...of('poste', 'semaforo', 'placa', 'hidrante').map((e) => [e.pos[0], e.pos[2], 'pole']), ...[0, 1, 2, 3, 4].map((i) => [station.x0 - 0.6 + i * 1.3, station.z0 - 0.3 - (i % 2) * 0.4, 'dust']), [-18.2, 9.4, 'hatch'], [10.6, 8.2, 'hatch'], [-33, -9, 'hatch'], [27, -8.4, 'hatch'], [-48, 9.8, 'stain'], [5, -10.2, 'stain'], [-15, 10.6, 'stain'], [22, 10.2, 'stain']],
    };
    // the grate of the shaft is set into the pavement: the paving leaves its place open
    M.holes = of('bocaRua').map((e) => { const f = grateFootprint(); return [e.pos[0] + f.x0, e.pos[2] + f.z0, e.pos[0] + f.x1, e.pos[2] + f.z1]; });
    buildGround(kit, tb, STREET, M, 7);
    // the lots behind the walls and the alleys: bare damp ground
    for (const s of [-1, 1]) tb.box({ c: '#5e5648', map: 'umido' }, [L + 120, 0.2, 90], [0, curb - 0.21, s * (GROUND.wall + 45)], { tile: 5, cell: 12, skip: ['-y', '+x', '-x', '+z', '-z'] });
    lotWalls(kit, tb, walls, curb);
    // what stands and lies on the pavements, all of one atlas (models/city/furniture.js)
    const F = new Shape(T);
    for (const t of plan.trees) {
      tree(F, t.x, H, t.z, t.i * 13 + 5, { line: true }); collide(`arvore-${t.i}`, t.x, t.z, 0.3, 0.3);
      for (const [dx, dz, w, d] of [[0, -0.56, 1.24, 0.12], [0, 0.56, 1.24, 0.12], [-0.56, 0, 0.12, 1.0], [0.56, 0, 0.12, 1.0]]) F.box([t.x + dx - w / 2, H - 0.02, t.z + dz - d / 2], [t.x + dx + w / 2, H + 0.09, t.z + dz + d / 2], 0.025, ['-y'], { outline: true, uv: (x, y, z) => { const R = [0.75, 0.76, 0.99, 0.89]; return [R[0] + (R[2] - R[0]) * (((x + z) * 0.7 % 1 + 1) % 1), R[1] + (R[3] - R[1]) * Math.min(1, (y - H + 0.02) / 0.11)]; } });
    }
    for (const t of plan.benches) { addPiece(tb, 'bench', { pos: [t.x, H, t.z], ry: t.s > 0 ? Math.PI : 0 }); collide(`banco-${t.i}`, t.x, t.z, 1.9, 0.55); }
    for (const t of plan.bins) { addPiece(tb, 'trash_bin', { pos: [t.x, H, t.z] }); collide(`lixeira-${t.i}`, t.x, t.z, 0.5, 0.5); }
    for (const [x, z, k] of weeds) if (k < 0.75 && Math.abs(Math.abs(z) - (road + 0.85)) > 0.2) tuft(F, x, H, z, fr, 0.7 + k);
    // the dead trees of the lots show over the walls
    for (const [x, z, sd] of [[-15.5, 14.2, 3], [-9, 16.5, 5], [7.5, 14, 8], [12, 17, 13], [-12, -14.5, 21], [-3.5, -16, 34], [6, -14, 55], [15, -15.4, 89], [-19, 17.5, 144]]) tree(F, x, H - 0.1, z, sd, { h: 4.4 });
    // rubbish against the walls (out of the walker's way), scraps anywhere; a cabinet of the street's services by each lot
    for (let i = 0; i < 16; i++) { const s = fr() < 0.5 ? 1 : -1, x = -halfX + 4 + fr() * (halfX * 2 - 8), n = 1 + Math.floor(fr() * 3); for (let k = 0; k < n; k++) bag(F, x + k * 0.42 + fr() * 0.1, H, s * (GROUND.wall - 0.26 - fr() * 0.1), fr, 0.8 + fr() * 0.4, true); }
    for (let i = 0; i < 70; i++) { const s = fr() < 0.5 ? 1 : -1, k = fr(), x = -halfX + fr() * halfX * 2; scrap(F, x, k < 0.5 ? 0.012 : H + 0.008, s * (k < 0.5 ? road - 0.1 - fr() * 0.5 : road + 0.4 + fr() * (walk - road - 0.2)), fr, fr() < 0.6 ? 'paper' : 'plank', 0.12 + fr() * 0.2); }
    for (const [x, s] of [[-19.3, 1], [9.4, 1], [-6.6, -1], [13.2, -1]]) { F.at([x, H, s * (GROUND.wall - 0.24)], s > 0 ? Math.PI : 0); DRAW.armario(F); F.at(null); }
    // the dead signals and signs of the two crossings (the working one is an entity of the layout), each with its little collider like a tree
    for (const [i, [x, z, yaw]] of [[-28.6, -7.1, 0], [21.4, 7.1, Math.PI], [30.6, -7.1, 0]].entries()) { F.at([x, H, z], yaw); DRAW.semaforo(F, null, {}); F.at(null); collide(`semaforo-morto-${i + 1}`, x, z, 0.3, 0.3); }
    for (const [i, [x, z, yaw, picto]] of [[-45.5, -7.2, 0, 'proibido'], [40.5, 7.2, Math.PI, 'proibido'], [50, -7.2, 0, 'seta']].entries()) {
      F.at([x, H, z], yaw); DRAW.placa(F, null, { altura: 2.4 }); F.at(null); collide(`placa-rua-${i + 1}`, x, z, 0.2, 0.2);
      tb.plane({ c: '#ffffff', map: 'p:' + picto, emissive: 0.22 }, 0.58, 0.58, [x, H + 2.4 - 0.59, z + (yaw ? -0.079 : 0.079)], { full: true, ry: yaw });
    }
    // the wires: from lamp to lamp along each pavement (a long span sags under the viaduct), and down to the walls
    for (const s of [1, -1]) wiring(F, of('poste').filter((e) => Math.sign(e.pos[2]) === s).sort((a, b) => a.pos[0] - b.pos[0]).map((e) => [e.pos[0], e.pos[1], e.pos[2]]), 6.25, s * GROUND.wall, fr);
    flush(kit, tb, F);
    stationBoxes = stationEntrance(kit, tb, STREET, 7);
  }
  const terrain = tb.build(); group.add(terrain);

  // --- the sky: a dome that follows the eye, stars that fade by day, a moon -----------------------------------------
  const sky = new T.Group(); group.add(sky);
  const dome = new T.SphereGeometry(80, 16, 10); invert(dome);
  const skyMat = kit.mat({ c: '#0a1022', map: 'ceu', emissive: 1, fogged: 0 });
  const domeMesh = new T.Mesh(dome, skyMat); sky.add(domeMesh);
  const sr = mulberry32(99), sb = new kit.Batch();
  for (let i = 0; i < 160; i++) {
    const a = sr() * Math.PI * 2, e = 0.12 + sr() * 1.35, d = new T.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    const g = new T.PlaneGeometry(0.34 + sr() * 0.3, 0.34 + sr() * 0.3), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), d.clone().negate());
    sb.add({ c: '#e8ecff', emissive: 1, fogged: 0, opacity: 0.999 }, g, new T.Matrix4().compose(d.multiplyScalar(76), q, new T.Vector3(1, 1, 1)));
  }
  const moonDir = new T.Vector3(0.5, 0.45, -0.75).normalize(), mq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), moonDir.clone().negate());
  sb.add({ c: '#f2efe0', emissive: 1, fogged: 0, opacity: 0.999 }, new T.CircleGeometry(3.2, 14), new T.Matrix4().compose(moonDir.clone().multiplyScalar(74), mq, new T.Vector3(1, 1, 1)));
  const stars = sb.build(); sky.add(stars);
  for (const m of stars.children) m.material.opacity = 0.999;

  // --- the entities ------------------------------------------------------------------------------------------------
  const things = new T.Group(); group.add(things);
  const place = placeEntities({ r, layout, editor, hooks, group: things, chunk: 30, night: (k) => 1 - k, points: 8, override: OLD ? null : cityBuilders({ kind: kindName, game: !editor }) });
  place.refreshBoxes();
  const lod = editor || OLD ? null : createCityLod(kit, group, place.ents.made);
  lod?.update(eye);
  const EDGE = [
    ...stationBoxes, ...decor,
    { id: 'borda-norte', min: [-80, -80], max: [80, -walk - 0.3] }, { id: 'borda-sul', min: [-80, walk + 0.3], max: [80, 80] },
    { id: 'borda-oeste', min: [-halfX - 22, -80], max: [-halfX, 80] }, { id: 'borda-leste', min: [halfX, -80], max: [halfX + 22, 80] },
  ];
  const colliders = [...EDGE];
  const sync = () => { colliders.length = EDGE.length; for (const b of place.boxes.values()) colliders.push(b); };
  sync();

  const lights = {
    apply() {
      const k = daylight;
      r.light({ ambient: lerpHex(T, '#4a5684', '#d6d8da', k), key: lerpHex(T, '#8490c0', '#f6f0e2', k), keyDir: [0.55, 1, 0.35], fog: lerpHex(T, '#080b16', '#c4d6ea', k), fogNear: lerp(10, 30, k), fogFar: 66 });
      skyMat.uniforms.uColor.value.set(lerpHex(T, '#0a1022', '#ffffff', Math.min(1, k * 1.2)));
      for (const m of stars.children) m.material.opacity = Math.max(0.001, 0.999 * (1 - Math.min(1, k * 2.2)));
      stars.visible = k < 0.5;
      for (const m of kit.night) {
        const f = Math.max(0, 1 - k * 1.8);
        m.uniforms.uEmissive.value = m.userData.nightBase * f;
        m.uniforms.uColor.value.copy(m.userData.dayColor).lerp(m.userData.nightColor, f);
      }
      setWindowNight(r, 1 - k);
      place.lightsNear(eye, k);
    },
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  const things_ = makeThings(place.ents, {
    cabo: { ids: ['cabo-paineis'], states: { cortado: (ents, id) => ({ emendado: false, corte: ents.params(id).corte >= 0 ? ents.params(id).corte : 0.5 }), emendado: { emendado: true } } },
    paineis: { ids: ['paineis'], states: { sujo: { sujo: true }, limpo: { sujo: false } } },
  });
  const manhole = () => place.ents.pos('boca-rua') ?? [STREET.manhole[0], 0, STREET.manhole[1]];
  const api = {
    group, ents: place.ents, views: VIEWS, lights, size: SIZE, bounds: BOUNDS,
    /** Changes a thing of the street: setThing('cabo', 'cortado' | 'emendado'), ('paineis', 'sujo' | 'limpo'). */
    setThing: things_.setThing, thing: things_.thing,
    spawn: { pos: [-1.2, 0, 8.2], yaw: 0 },
    colliders,
    get exits() { const m = manhole(); return [{ id: 'boca', pos: [m[0], 0, m[2]], radius: 1.4, to: 'galeria', spawn: { pos: [7.7, 0, 1.0], yaw: Math.PI / 2 }, kind: 'corda' }]; },
    /** Where a person arrives when coming up the rope. */
    arrival: () => { const m = manhole(); return { pos: [m[0], 0, m[2] - 1.4], yaw: 0 }; },
    /** 0 is night, 1 noon: the sky, the stars, the sun and moon light, the fog, and the lamps that only burn at night. */
    setDaylight(k) { daylight = Math.max(0, Math.min(1, k)); lights.apply(); },
    /** The floor height: the sidewalks are a curb above the road. */
    ground: (x, z) => (Math.abs(z) > road && Math.abs(z) < walk + 0.01 ? curb : place.ground(x, z)),
    setActive: place.setActive, place,
    get hides() { return [...place.hides.values()]; },
    update(t, ctx) {
      r.time(t); place.ents.update(t, ctx); place.tick(t);
      if (ctx?.listener) { eye = ctx.listener; sky.position.set(eye[0], 0, eye[2]); place.lightsNear(eye, daylight); lod?.update(eye); }
      if (meter) meter(t);
      if (editor) { place.refreshBoxes(); sync(); }
    },
  };
  // `?fps` in the address: a small counter of frames per second and of the triangles drawn, over the picture (for measuring on a real device)
  let meter = null;
  if (!editor && typeof document !== 'undefined' && /(?:^|[?&])fps(?:[=&]|$)/.test(globalThis.location?.search ?? '')) {
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:6px;top:6px;z-index:9;font:12px monospace;color:#cfe;background:#0008;padding:2px 6px;pointer-events:none';
    document.body.appendChild(el); let frames = 0, at = performance.now();
    meter = () => { frames++; const now = performance.now(); if (now - at >= 1000) { el.textContent = `${Math.round((frames * 1000) / (now - at))} fps · ${Math.round(countTris(group) / 1000)}k tri`; frames = 0; at = now; } };
  }
  api.setDaylight(0);
  return api;
}
