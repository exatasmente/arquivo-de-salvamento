// WeatherSystem: the climate of each night and what it does to the station.
//
// Each night draws its weather from the game's seed and the week of the campaign (clear, cloudy, light rain, heavy rain, storm; the storms are rare and
// come mostly in weeks 3 and 4). The draw is made once, when the night opens; after that the weather is a function of the hour of the game clock (the rain
// comes in, holds, goes out) and of a plan of lightning bolts made at the same moment. Nothing here reads a real clock or draws without a seed.
//
//   - The moon (sky.js) has its phase and its path from the date of the night. Moonlight is a weak key light, only when the moon is up, lit and above the clouds.
//   - Rain: a few streaks round the player (fewer on the phone), the asphalt wet (darker, puddles, the lamps' reflections), the sound on the canopy, on the
//     shop's roof (muffled inside) and in the open, a closer fog, and fewer customers (`weather:flow` on the bus, a multiplier that customers.js and traffic.js read).
//   - Storm: lightning with the thunder late by the distance, the lights flicker and now and then a breaker falls (the clipboard asks to put it back), and once
//     in a while, in weeks 3 and 4 with the sanity low, a bolt shows a figure in the yard for the length of one flash. "Reduce flashes": no white flash and no
//     figure; the bolt becomes a short darkening, the lamps only dim, and the thunder stays.
//
// `env()` is what lighting.js reads each frame. `state()` / `restore()` are what "save now" keeps (systems/snapshot.js).
import { mulberry32 } from '../rng.js';
import { moonAt, dateOf, createSky } from './sky.js';

export const KINDS = ['limpo', 'nublado', 'fraca', 'forte', 'temporal'];
export const KIND_TEXT = { limpo: 'céu limpo', nublado: 'céu nublado', fraca: 'chuva fraca', forte: 'chuva forte', temporal: 'temporal' };
/** The odds (percent) of each kind, by week: clear most nights; the storm is rare and from week 2, commoner in 3 and 4. */
const ODDS = { 1: [70, 18, 8, 4, 0], 2: [62, 20, 10, 6, 2], 3: [52, 18, 13, 9, 8], 4: [48, 18, 14, 10, 10] };
const FLOW = { limpo: 1, nublado: 1, fraca: 0.9, forte: 0.7, temporal: 0.55 };      // the multiplier of the flow of customers when it rains
const RAIN = { limpo: 0, nublado: 0, fraca: 0.3, forte: 0.7, temporal: 1 };         // how hard it rains, 0..1
const SOUND_SPEED = 0.343;                                                         // km per second
const CANOPY = { x0: -1, x1: 25, z0: -13, z1: 0.1, y: 4.0 }, ROOF = { x0: 1.9, x1: 24.1, z0: 2.9, z1: 20.1, y: 3.3 };
const ASPHALT = [[-26, -22, 28, -13], [-26, -13, -1, 24], [-1, -13, 25, 0], [25, -13, 28, 24], [-1, 0, 25, 2.9], [-1, 2.9, 1.9, 20.1], [24.1, 2.9, 25, 20.1], [-1, 20.1, 25, 24]];
const INDOOR = new Set(['loja', 'escritorio', 'estoque', 'banheiros', 'banheiroM', 'banheiroF', 'servico', 'deposito']);
const smooth = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The weather of a night, from the seed: the kind, the clouds, when the rain comes and goes, the lightning of a storm. Pure: the same night, the same plan. */
export function planNight({ day, seed, week, force = null, lastNight = 24 }) {
  const rng = mulberry32(((seed >>> 0) * 2654435761 ^ day * 40503 ^ 0x5bd1e995) >>> 0);
  const odds = ODDS[Math.min(4, Math.max(1, week))], roll = rng() * 100;
  let kind = 'limpo', acc = 0;
  for (let i = 0; i < odds.length; i++) { acc += odds[i]; if (roll < acc) { kind = KINDS[i]; break; } }
  if (day <= 1) kind = 'limpo';                                              // the tutorial night is always clear
  if (force && KINDS.includes(force)) kind = force;
  const rain = RAIN[kind] > 0;
  const plan = {
    v: 1, day, kind, rain: RAIN[kind], phase: rng() * 6.28,
    cloud: kind === 'limpo' ? 0.02 + rng() * 0.1 : kind === 'nublado' ? 0.55 + rng() * 0.35 : 0.92,
    rainStart: rain ? -1 + rng() * 1.1 : 0,
    rainEnd: rain ? (kind === 'fraca' ? 3.5 + rng() * 3.6 : kind === 'forte' ? 4.6 + rng() * 3 : 5.6 + rng() * 3) : 0,
    strikes: [], trips: 0, scareArmed: false, wind: 0.6 + rng() * 0.8,
  };
  if (kind === 'temporal') {
    // three storm cells, each with a handful of bolts a few game minutes apart (1 game minute is 1.5 real seconds): never less than a minute apart
    const from = plan.rainStart * 60 + 20, to = Math.min(plan.rainEnd, 5.6) * 60;
    const centers = [rng(), rng(), rng()].sort().map((u) => from + u * Math.max(30, to - from - 30));
    for (const c of centers) {
      let at = c; const n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const u = rng(), near = u < 0.3, dist = near ? 0.4 + rng() * 0.9 : u < 0.7 ? 1.5 + rng() * 2.5 : 4 + rng() * 2.5;
        plan.strikes.push({ at: Math.round(at * 10) / 10, dist: Math.round(dist * 100) / 100, bearing: Math.round(rng() * 628) / 100, double: rng() < 0.6, trip: false });
        at += 1 + -Math.log(1 - rng() * 0.95) * 2.4;
      }
    }
    plan.strikes.sort((a, b) => a.at - b.at);
    for (let i = 1; i < plan.strikes.length; i++) if (plan.strikes[i].at - plan.strikes[i - 1].at < 1) plan.strikes[i].at = plan.strikes[i - 1].at + 1;
    // a fallen breaker: from week 2, never in the tutorial or on the last night, on a bolt that is close, between 00:30 and 05:00
    const week2 = week >= 2 && day < lastNight, maxTrips = week >= 4 ? 2 : 1;
    const cand = plan.strikes.filter((s) => s.dist < 2 && s.at > 30 && s.at < 300);
    for (let i = 0; i < maxTrips && cand.length && week2; i++) { if (rng() < 0.8) { const s = cand.splice(Math.floor(rng() * cand.length), 1)[0]; s.trip = true; } }
    plan.scareArmed = week >= 3 && day < lastNight && rng() < 0.55;
  }
  return plan;
}

/** The pieces of the plan the weather reads as a function of the hour of the clock (h: hours, 0 = midnight, -1 = the 23:00 preparation). */
export const rainAt = (p, h) => (p.rain > 0 ? p.rain * smooth((h - p.rainStart) / 0.35) * (1 - smooth((h - p.rainEnd) / 0.6)) * (0.88 + 0.12 * Math.sin(h * 5.1 + p.phase)) : 0);
export const wetAt = (p, h) => (p.rain > 0 ? (h < p.rainStart ? 0 : h < p.rainEnd ? Math.min(1, (h - p.rainStart) / 0.4) : Math.max(0, 1 - (h - p.rainEnd) / 1.8)) : 0);
export const cloudAt = (p, h) => (p.kind === 'nublado' ? clamp(p.cloud + 0.1 * Math.sin(h * 1.3 + p.phase), 0, 1) : p.kind === 'limpo' ? p.cloud : p.cloud * smooth((h - p.rainStart + 0.6) / 0.6) + (1 - smooth((h - p.rainStart + 0.6) / 0.6)) * 0.2);

export function createWeather(bus, { world, render, player, time, progression, sanity, kit, chores, est, audioSys, ui, opts, area, lite = false, lastNight = 24 }) {
  const T = render.THREE;
  const sky = createSky(render, { seed: 5 });
  let on = false, plan = planNight({ day: 2, seed: 1, week: 1 }), rng = mulberry32(1), clock = 0, idx = 0, trips = 0, scared = false, flowSent = 1, moon = moonAt(2, 0), moonKey = -1, ageOverride = null, tutorial = false;
  const flashes = [], thunder = [];      // the bolts in the air (their pulses) and the thunder still on its way
  let flashLvl = 0, darkLvl = 0, lampK = 1, boltT = 0, dripT = 8;
  let fig = null, figUntil = 0, sil = null;

  // ---- rain: a single set of line segments round the player, reused (the same few streaks fall again and again)
  const NMAX = lite ? 110 : 240;
  const rpos = new Float32Array(NMAX * 6), px = new Float32Array(NMAX), py = new Float32Array(NMAX), pz = new Float32Array(NMAX), pv = new Float32Array(NMAX);
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rpos, 3));
  const rainMat = new T.LineBasicMaterial({ color: 0x9fb2d6, transparent: true, opacity: 0.4, depthWrite: false, fog: false });
  const rain = new T.LineSegments(rainGeo, rainMat); rain.name = 'rain'; rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 3;
  render.scene.add(rain);
  let rainSeeded = false;
  function seedRain(cx, cz) {
    const r = mulberry32(plan.day * 977 + 31);
    for (let i = 0; i < NMAX; i++) { px[i] = cx + (r() - 0.5) * 26; pz[i] = cz + (r() - 0.5) * 26; py[i] = r() * 10; pv[i] = 12 + r() * 6; }
    rainSeeded = true;
  }

  // ---- the wet ground: a dark film on the asphalt, puddles, and the lamps' reflections
  const ground = new T.Group(); ground.name = 'wet-ground'; ground.visible = false; render.scene.add(ground);
  const filmMat = new T.MeshBasicMaterial({ color: 0x03050a, transparent: true, opacity: 0, depthWrite: false, fog: false });
  for (const [x0, z0, x1, z1] of ASPHALT) {
    const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), filmMat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); m.renderOrder = 1; ground.add(m);
  }
  const puddles = [];
  {
    const r = mulberry32(4242), spots = [[-18, -18], [-8, -16], [-3, -12], [-14, -6], [-20, 4], [-7, 8], [-12, 15], [-5, 20], [6, -11.5], [11, -2], [18, -9], [3.5, 1.2], [22, 1.6], [14, 22], [26.5, 10], [0, 22]];
    for (const [x, z] of spots) {
      const mat = new T.MeshBasicMaterial({ color: 0x24344f, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const m = new T.Mesh(new T.CircleGeometry(1, 14), mat); m.rotation.x = -Math.PI / 2; m.position.set(x + (r() - 0.5) * 2, 0.024, z + (r() - 0.5) * 2); m.renderOrder = 2;
      m.userData = { s: 0.9 + r() * 1.7, e: 0.45 + r() * 0.35, rz: r() * 3 }; m.scale.set(0.01, 0.01, 0.01); ground.add(m); puddles.push(m);
    }
  }
  // the reflections: a stretched glint under the nearest lamps, pointing at the player, as the light of a lamp lies on a wet road
  const glints = [];
  for (let i = 0; i < 7; i++) {
    const mat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending });
    const m = new T.Mesh(new T.PlaneGeometry(0.7, 4.2), mat); m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; ground.add(m); glints.push(m);
  }
  const outdoorLights = () => world.lights.filter((l) => l.on && !l.burnt && l.pos[1] > 2.2 && !INDOOR.has(l.area));
  function wetGround(wet, rainK, fl) {
    ground.visible = wet > 0.01;
    if (!ground.visible) return;
    filmMat.opacity = 0.45 * wet;
    const p = player.st;
    for (const m of puddles) { const s = m.userData.s * (0.35 + 0.65 * wet); m.scale.set(s, s * m.userData.e, 1); m.rotation.z = m.userData.rz; m.material.opacity = 0.62 * wet; m.material.color.setRGB(0.12 + 0.35 * fl, 0.19 + 0.38 * fl, 0.31 + 0.4 * fl); }
    const near = outdoorLights().map((l) => ({ l, d: Math.hypot(l.pos[0] - p.x, l.pos[2] - p.z) })).filter((q) => q.d < 34).sort((a, b) => a.d - b.d).slice(0, glints.length);
    for (let i = 0; i < glints.length; i++) {
      const g = glints[i], q = near[i];
      if (!q) { g.visible = false; continue; }
      const { l, d } = q, br = world.posto.breakers, power = br && !br.powered(l) ? 0 : 1, k = power * wet * (l.level ?? 1) * clamp(1.15 - d / 40, 0.2, 1);
      const dx = p.x - l.pos[0], dz = p.z - l.pos[2], len = Math.max(1, Math.hypot(dx, dz)), L = clamp(2.2 + d * 0.13, 2.4, 6.5);
      g.visible = k > 0.02; g.scale.set(1 + d * 0.025, L / 4.2, 1);
      g.position.set(l.pos[0] + dx / len * L * 0.5, 0.03, l.pos[2] + dz / len * L * 0.5); g.rotation.y = Math.atan2(dx, dz); g.rotation.x = -Math.PI / 2;
      g.material.color.set(l.color).multiplyScalar(0.34 * k);
    }
  }

  // ---- sound: the rain in the open, on the canopy and on the shop's roof, one loop each, mixed by where the player stands
  const loops = { open: null, canopy: null, roof: null };
  function stopLoops() { for (const k of Object.keys(loops)) { loops[k]?.stop?.(0.4); loops[k] = null; } }
  function mixRain(level) {
    const a = audioSys.audio;
    if (!a || opts.mute || level < 0.02 || !on) { if (loops.open || loops.canopy || loops.roof) stopLoops(); return; }
    if (!loops.open) {
      try { loops.open = a.loop('chuva', { gain: 0 }); loops.canopy = a.loop('chuva_cobertura', { gain: 0 }); loops.roof = a.loop('chuva_loja', { gain: 0 }); } catch { stopLoops(); return; }
    }
    const ar = area(), under = ar === 'bombas', inside = INDOOR.has(ar), k = 0.22 + 0.78 * level;
    const gOpen = inside ? 0.04 : under ? 0.3 : 0.5, gCan = inside ? 0 : under ? 0.75 : 0.1, gRoof = inside ? 0.8 : 0;
    loops.open.setGain?.(gOpen * k, 0.3); loops.canopy.setGain?.(gCan * k, 0.3); loops.roof.setGain?.(gRoof * k, 0.3);
  }

  // ---- lightning
  const pulsesOf = (s, amp) => {
    const p = [{ a: 0, d: 0.1, k: amp }];
    if (s.double) p.push({ a: 0.36, d: 0.08, k: amp * 0.65 });         // two flashes, never closer than a third of a second
    return p;
  };
  function fire(s, o = {}) {
    const amp = s.dist < 1.4 ? 0.9 : s.dist < 3 ? 0.66 : 0.42;
    flashes.push({ t0: clock, pulses: pulsesOf(s, amp), amp, s });
    thunder.push({ at: clock + Math.max(o.delay ?? 0.45, s.dist / SOUND_SPEED), dist: s.dist, gain: s.dist < 1.4 ? 1 : s.dist < 3 ? 0.9 : 0.8 });
    if (!opts.reduceFlash) sky.strike(player.st, s.bearing, amp, rng);
    boltT = clock + 0.45;
    if (s.trip) tripBreaker();
    maybeScare(s);
  }
  function tripBreaker() {
    const br = world.posto.breakers; if (!br || !chores || tutorial || trips >= (progression.st.week >= 4 ? 2 : 1)) return;
    const pool = ['cobertura', 'loja', 'estacionamento'].filter((a) => br.isOn(a) && !chores.isTripped(a));
    if (!pool.length) return;
    if (chores.trip(pool[Math.floor(rng() * pool.length)])) trips++;
  }
  /** The rare scare: a bolt very near, a figure in the yard for one flash, when the sanity is low, in weeks 3 and 4, and the player is outside. */
  function maybeScare(s) {
    if (scared || !plan.scareArmed || s.dist >= 1.5 || time.minutes < 60 || time.minutes > 300 || sanity.value >= 45 || progression.st.week < 3 || ui.modalOpen) return;
    const ar = area(); if (ar !== 'externa' && ar !== 'estacionamento' && ar !== 'bombas') return;
    const f = player.forward(), eye = player.eyePos();
    for (let i = 0; i < 8; i++) {
      const ang = (rng() - 0.5) * 0.7, d = 8 + rng() * 7, c = Math.cos(ang), sn = Math.sin(ang);
      const x = player.st.x + (f.x * c - f.z * sn) * d, z = player.st.z + (f.x * sn + f.z * c) * d;
      if (x < -24 || x > 26 || z < -20 || z > 18 || player.blocked(x, z) || (x > -1 && x < 25 && z > -13 && z < 3)) continue;   // the yard, never under the canopy or in the building
      const p = new T.Vector3(x, 0, z);
      if (!kit.clear(eye, new T.Vector3(x, 1.4, z))) continue;
      scared = true;
      sanity.add(opts.reduceFlash ? -2 : -5, 'relampago');
      if (opts.reduceFlash) { if (est()) est().cut = Math.max(est().cut || 0, 0.7); return; }   // no figure, no flash: a darkening and the thunder
      if (!fig) { fig = kit.figure('sem-sombra', 91); sil = kit.silhouette(fig.root, '#020203'); }
      fig.root.position.copy(p); kit.face(fig.root, eye); fig.root.visible = true; sil.set(0.95); figUntil = clock + 0.12;
      if (est()) est().shake = Math.max(est().shake || 0, 0.04);
      return;
    }
  }
  /** The light of the bolts in the air right now: flash (0..1, how much the sky and the walls light up) and dark (the "reduce flashes" dip). */
  function bolts() {
    let fl = 0, dk = 0;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], age = clock - f.t0; let alive = false;
      for (const p of f.pulses) {
        const x = age - p.a;
        if (x < -0.001) { alive = true; continue; }
        const env = x < 0.025 ? x / 0.025 : Math.exp(-(x - 0.025) / (p.d * 0.8));
        if (env > 0.02) { alive = true; if (opts.reduceFlash) dk = Math.max(dk, p.k * Math.exp(-x / 0.25) * 0.55); else fl = Math.max(fl, p.k * env); }
      }
      if (!alive) flashes.splice(i, 1);
    }
    return { fl: Math.min(0.85, fl), dk };
  }

  const flowOf = (rainK) => (rainK > 0.05 ? FLOW[plan.kind] : 1);
  function sendFlow(v) { if (Math.abs(v - flowSent) > 0.005) { flowSent = v; bus.emit('weather:flow', v); } }
  function hideAll() { sky.hide(); rain.visible = false; ground.visible = false; if (fig) { fig.root.visible = false; } }

  const api = {
    get on() { return on; },
    get plan() { return plan; },
    get moon() { return moon; },
    get kind() { return plan.kind; },
    /** The multiplier of the flow of customers the weather last announced (1 = dry). */
    get flow() { return flowSent; },
    /** Is the figure of the scare on the yard right now? */
    get figureVisible() { return Boolean(fig && fig.root.visible); },
    get date() { return dateOf(plan.day); },
    /** Opens a night. o: { day, seed, week, tutorial, force (a kind), age (the moon's age in days, for a test) }. */
    begin(o) {
      stopLoops(); flashes.length = 0; thunder.length = 0; clock = 0; idx = 0; trips = 0; scared = false; flashLvl = darkLvl = 0; lampK = 1; rainSeeded = false; moonKey = -1; dripT = 6 + (o.day % 5);
      tutorial = Boolean(o.tutorial); ageOverride = o.age ?? null;
      plan = planNight({ day: o.day, seed: o.seed, week: o.week, force: o.force, lastNight });
      rng = mulberry32(((o.seed >>> 0) * 31 + o.day * 17 + 5) >>> 0);
      on = true; moon = moonAt(plan.day, time.minutes / 60, ageOverride);
      flowSent = 1; sendFlow(1);
      return plan;
    },
    /** Off: the title, the day off, a cutscene or an ending take the picture. */
    stop() { on = false; stopLoops(); hideAll(); sendFlow(1); if (fig) { kit.dispose(fig); fig = null; sil = null; } },
    /** One line for the opening of the night and the clipboard: "Lua cheia · chuva fraca". */
    line() { const m = moonAt(plan.day, 3, ageOverride); return `${m.lit < 0.03 ? 'Sem lua' : m.name} · ${KIND_TEXT[plan.kind]}`; },
    /** The opening line of the night (a sentence). */
    opening() { const m = moonAt(plan.day, 3, ageOverride); return `${m.lit < 0.03 ? 'Noite sem lua' : m.name}. ${KIND_TEXT[plan.kind][0].toUpperCase()}${KIND_TEXT[plan.kind].slice(1)}.`; },
    /** What lighting.js reads each frame (null when no night is on). */
    env() { return on ? env : null; },
    /** A modal, the pause or a menu is up and the clock is still: a flash in the middle of its length must not stay on the screen. */
    calm() {
      if (!on || (!flashes.length && flashLvl === 0 && darkLvl === 0 && !(fig && fig.root.visible))) return;
      flashes.length = 0; flashLvl = darkLvl = 0; lampK = 1; env.flash = env.dark = 0; env.lampK = 1; sky.hideBolt();
      if (fig && fig.root.visible) { fig.root.visible = false; sil.set(0); }
    },
    /** A bolt now (a test, or the editor): dist in km. */
    strikeNow(dist = 0.8, o = {}) { fire({ at: time.minutes, dist, bearing: o.bearing ?? 0.3, double: o.double ?? false, trip: Boolean(o.trip) }, o); },
    update(dt) {
      if (!on) return;
      clock += dt;
      const m = time.minutes, h = m / 60, p = player.st;
      // the moon is slow: its place is made again each half minute of the game clock
      const mk = Math.floor(m * 2); if (mk !== moonKey) { moonKey = mk; moon = moonAt(plan.day, h, ageOverride); }
      const rainK = rainAt(plan, h), wet = wetAt(plan, h), cloud = cloudAt(plan, h);
      // lightning: the plan (by the clock of the night) and the thunder on its way
      while (idx < plan.strikes.length && m >= plan.strikes[idx].at) { const s = plan.strikes[idx++]; if (m - s.at < 3 && !tutorial) fire(s); }
      for (let i = thunder.length - 1; i >= 0; i--) {
        const t = thunder[i]; if (clock < t.at) continue;
        thunder.splice(i, 1); bus.emit('sfx', 'trovao', { gain: t.gain, opts: { dist: t.dist } });
      }
      const b = bolts(); flashLvl = b.fl; darkLvl = b.dk;
      lampK = 1 - 0.75 * Math.max(b.fl / 0.85, b.dk / 0.5);
      if (opts.reduceFlash && darkLvl > 0.2 && est()) est().cut = Math.max(est().cut || 0, Math.min(0.5, darkLvl));
      if (clock > boltT) sky.hideBolt();
      if (fig && fig.root.visible && clock > figUntil) { fig.root.visible = false; sil.set(0); }
      // the sky
      const dawn = h <= 4 ? 0.04 * Math.max(0, h) / 4 : smooth((h - 4) / 2);
      sky.set(p, moon, h, { cloud, dawn, brightness: 1 - 0.8 * flashLvl });
      // the rain
      const ar = area(), indoors = INDOOR.has(ar);
      const nAct = rainK > 0.02 ? Math.ceil(NMAX * clamp(0.4 + rainK * 0.75, 0, 1)) : 0;
      rain.visible = nAct > 0 && !indoors;
      if (nAct > 0) {
        if (!rainSeeded) seedRain(p.x, p.z);
        const wind = (0.4 + plan.wind * rainK * 3) * (1 + 0.35 * Math.sin(clock * 0.7 + plan.phase)), len = 0.045, a = 0.5 + 0.5 * rainK;
        rainMat.opacity = 0.28 + 0.2 * rainK;
        for (let i = 0; i < NMAX; i++) {
          if (i >= nAct) { rpos.fill(0, i * 6, i * 6 + 6); continue; }
          let x = px[i], y = py[i] - pv[i] * dt, z = pz[i];
          x += wind * dt * 0.9;
          if (y < 0) { y = 9 + rng() * 2; x = p.x + (rng() - 0.5) * 26; z = p.z + (rng() - 0.5) * 26; }
          else { if (x - p.x > 13) x -= 26; else if (x - p.x < -13) x += 26; if (z - p.z > 13) z -= 26; else if (z - p.z < -13) z += 26; }
          px[i] = x; py[i] = y; pz[i] = z;
          const covered = (x > CANOPY.x0 && x < CANOPY.x1 && z > CANOPY.z0 && z < CANOPY.z1 && y < CANOPY.y) || (x > ROOF.x0 && x < ROOF.x1 && z > ROOF.z0 && z < ROOF.z1 && y < ROOF.y);
          const o = i * 6, l = covered ? 0 : len * a;
          rpos[o] = x; rpos[o + 1] = y; rpos[o + 2] = z; rpos[o + 3] = x - wind * l; rpos[o + 4] = y + pv[i] * l; rpos[o + 5] = z;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      wetGround(wet, rainK, flashLvl);
      mixRain(rainK);
      if (rainK > 0.1 && ar === 'loja' && (dripT -= dt) <= 0) { dripT = 5 + rng() * 9; bus.emit('sfx', 'goteira', { gain: 0.6, pos: [6 + rng() * 6, 2.9, 5 + rng() * 5] }); }
      sendFlow(flowOf(rainK));
      // what lighting.js reads
      env.cloud = cloud; env.rain = rainK; env.wet = wet; env.flash = flashLvl; env.dark = darkLvl; env.lampK = lampK;
      env.fogNear = 10 - 3.6 * rainK - 0.4 * cloud; env.fogFar = 40 - 17 * rainK - 2 * cloud;
      const up = moon.visible ? moon.lit ** 1.3 * smooth((moon.alt - 0.08) / 0.5) * (1 - cloud * 0.85) : 0;
      env.moonLight = up; env.moonDir = [-moon.dir[0], -moon.dir[1], -moon.dir[2]];
    },
    /** "Save now": the plan of the night and how far along it is (a bolt that has gone is not fired again). */
    state() { return { v: 1, plan: JSON.parse(JSON.stringify(plan)), idx, trips, scared, age: ageOverride }; },
    /** Lays a saved moment over the night that begin() has just opened from the same seed. m: the game minute. */
    restore(s, m = 0) {
      if (!s || s.v !== 1 || !s.plan || !KINDS.includes(s.plan.kind)) return false;
      const q = s.plan, num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
      plan = { v: 1, day: num(q.day, plan.day), kind: q.kind, rain: num(q.rain), phase: num(q.phase), cloud: clamp(num(q.cloud), 0, 1), rainStart: num(q.rainStart), rainEnd: num(q.rainEnd), trips: 0, scareArmed: Boolean(q.scareArmed), wind: num(q.wind, 1),
        strikes: (Array.isArray(q.strikes) ? q.strikes : []).slice(0, 40).map((x) => ({ at: num(x.at), dist: clamp(num(x.dist, 2), 0.2, 8), bearing: num(x.bearing), double: Boolean(x.double), trip: Boolean(x.trip) })) };
      idx = plan.strikes.findIndex((x) => x.at >= m); if (idx < 0) idx = plan.strikes.length;
      trips = clamp(num(s.trips), 0, 2); scared = Boolean(s.scared); ageOverride = s.age ?? null; moonKey = -1; rainSeeded = false;
      flashes.length = 0; thunder.length = 0; flowSent = 1;
      return true;
    },
    dispose() { stopLoops(); sky.dispose(); render.scene.remove(rain, ground); rainGeo.dispose(); },
  };
  bus.on('weather:off', () => api.stop());
  const env = { cloud: 0, rain: 0, wet: 0, flash: 0, dark: 0, lampK: 1, fogNear: 10, fogFar: 40, moonLight: 0, moonDir: [0, -1, 0] };
  void flowOf;
  return api;
}
