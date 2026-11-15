// The sky of the night: the date of each night of the campaign (the campaign's present, 2001), the moon (its age, its phase, its path over the night) and the meshes
// that draw it (the moon disc with its phase, a halo, a few stars, the bolt of a far lightning). The astronomy is the simple kind: the age of the moon
// counts from a known new moon (6 January 2000, 18:14 UTC) in mean synodic months, the sun's place comes from the day of the year, and the moon sits
// at the sun's longitude plus its elongation (so the phase and the position always agree). Everything is a function of the night and of the hour of the
// game clock: no real clock and no draw without a seed. The world frame is the station's: x east, z south, the highway to the north (z < 0).
import { mulberry32 } from '../rng.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const SYNODIC = 29.530588853;                 // days from new moon to new moon (mean)
const NEW_MOON_JD = 2451550.2597;             // 2000-01-06 18:14 UTC
const CAMPAIGN_START = Date.UTC(2001, 10, 5);  // night 1 is Monday 5 November 2001 (the 28 days end on Sunday 2 December: night 24 is Saturday 1 December)
const UTC_OFFSET_H = -2;                      // Brasília summer time in 2001 (it began on 14 October)
const LAT = -23.5, LON = -46.6;               // a highway in the south-east of the country
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PHASES = ['Lua nova', 'Lua crescente', 'Quarto crescente', 'Lua gibosa crescente', 'Lua cheia', 'Lua gibosa minguante', 'Quarto minguante', 'Lua minguante'];

/** The calendar day (1..28) of a night: six nights a week and one day off between the weeks. */
export const calDayOf = (day) => day + Math.floor((Math.max(1, day) - 1) / 6);
/** The date of a night: { y, m, d, wd (0 = Sunday), text: '05/11/2001', short: 'seg 16/11' }. */
export function dateOf(day) {
  const dt = new Date(CAMPAIGN_START + (calDayOf(day) - 1) * 86400000);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate(), wd = dt.getUTCDay(), p2 = (n) => String(n).padStart(2, '0');
  return { y, m, d, wd, text: `${p2(d)}/${p2(m)}/${y}`, short: `${WEEKDAY[wd]} ${p2(d)}/${p2(m)}` };
}
const jdAt = (day, hour) => (CAMPAIGN_START + (calDayOf(day) - 1) * 86400000 + (hour - UTC_OFFSET_H) * 3600000) / 86400000 + 2440587.5;

function sunAt(d) {
  const L = 280.460 + 0.9856474 * d, g = (357.528 + 0.9856003 * d) * RAD;
  return (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360;
}
/** Horizontal place of an ecliptic point (lambda, beta in degrees) at day d (days from J2000): { alt, az } in radians, az from the north to the east. */
function horizontal(d, lambda, beta) {
  const eps = (23.439 - 4e-7 * d) * RAD, l = lambda * RAD, b = beta * RAD;
  const sinD = Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l), dec = Math.asin(sinD);
  const ra = Math.atan2(Math.sin(l) * Math.cos(b) * Math.cos(eps) - Math.sin(b) * Math.sin(eps), Math.cos(l) * Math.cos(b));
  const lst = (280.46061837 + 360.98564736629 * d + LON) * RAD, H = lst - ra, phi = LAT * RAD;
  const alt = Math.asin(Math.sin(phi) * sinD + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), sinD * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
  return { alt, az };
}
const toWorld = ({ alt, az }) => [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];

/**
 * The moon of a night at an hour of the game clock (hour: 0 = midnight; the 23:00 preparation is -1).
 * Returns { age (days), elong (degrees), lit (0..1), waxing, phase (0..7, the eight names), name, alt, az (radians), dir (unit vector, world), sun (unit vector to the sun), visible }.
 * `ageOverride` (a test) puts the moon at that age on that night.
 */
export function moonAt(day, hour = 0, ageOverride = null) {
  const jd = jdAt(day, hour), d = jd - 2451545.0;
  const age = ageOverride ?? ((((jd - NEW_MOON_JD) % SYNODIC) + SYNODIC) % SYNODIC);
  const elong = age / SYNODIC * 360, ls = sunAt(d);
  const F = (93.272 + 13.22935 * d) * RAD, beta = 5.145 * Math.sin(F);
  const pos = horizontal(d, ls + elong, beta), sun = horizontal(d, ls, 0);
  const lit = (1 - Math.cos(elong * RAD)) / 2, phase = Math.floor(((age / SYNODIC) * 8 + 0.5)) % 8;
  return { age, elong, lit, waxing: elong < 180, phase, name: PHASES[phase], alt: pos.alt, az: pos.az, dir: toWorld(pos), sun: toWorld(sun), visible: lit > 0.03 && pos.alt > -0.02 };
}
export const phaseName = (m) => m.name;
/** When (hours of the game clock, from -1 to 7) the moon is above the horizon on that night: [{ from, to }]. */
export function moonWindows(day, ageOverride = null) {
  const out = []; let from = null;
  for (let h = -1; h <= 7.001; h += 0.1) {
    const up = moonAt(day, h, ageOverride).alt > 0;
    if (up && from === null) from = h;
    if (!up && from !== null) { out.push({ from: +from.toFixed(1), to: +h.toFixed(1) }); from = null; }
  }
  if (from !== null) out.push({ from: +from.toFixed(1), to: 7 });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- the meshes
const MOON_R = 78, STAR_R = 84, MOON_SIZE = 6.4;   // the disc is about 4.7 degrees wide: bigger than the real one, so that the phase is readable at the low resolution

/** The disc of the moon as a small texture: the lit side to the right (the mesh is turned toward the sun), lit = the lit fraction (0..1), the seams of the maria seeded. */
function moonTexture(lit, seed) {
  const N = 48, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), rr = mulberry32(seed * 31 + 7);
  const blobs = Array.from({ length: 9 }, () => ({ x: (rr() - 0.5) * 1.3, y: (rr() - 0.5) * 1.3, r: 0.14 + rr() * 0.2, k: 0.1 + rr() * 0.16 }));
  const k = 1 - 2 * lit;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N * 2 - 1, v = 1 - (j + 0.5) / N * 2, r2 = u * u + v * v, o = (j * N + i) * 4;
    if (r2 > 1) { img.data[o + 3] = 0; continue; }
    const edge = 1 - 0.28 * r2 * r2;
    let m = 1; for (const b of blobs) { const d = Math.hypot(u - b.x, v - b.y); if (d < b.r) m -= b.k * (1 - d / b.r) * 1.6; }
    const sunlit = u > k * Math.sqrt(1 - v * v) - 0.02, c = sunlit ? 1 : 0;
    // the side the sun does not reach is only a dark disc, faint (earthshine); the lit side is pale, warm grey
    img.data[o] = (c ? 236 * m * edge : 14); img.data[o + 1] = (c ? 232 * m * edge : 17); img.data[o + 2] = (c ? 214 * m * edge : 26); img.data[o + 3] = c ? 255 : 120;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
function haloTexture() {
  const N = 32, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 1, N / 2, N / 2, N / 2); gr.addColorStop(0, 'rgba(190,205,240,0.55)'); gr.addColorStop(0.35, 'rgba(120,140,190,0.16)'); gr.addColorStop(1, 'rgba(60,80,130,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  return cv;
}

/**
 * The sky meshes of a night: the moon with its phase, its halo, the stars and a bolt. `set` places them for the player's place and the night's hour.
 * They sit under everything (depth tested, no fog) and follow the player, so they never come closer.
 */
export function createSky(render, { seed = 1 } = {}) {
  const T = render.THREE, group = new T.Group(); group.name = 'sky'; group.visible = false;
  const tex = (cv) => { const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; return t; };
  const moonMat = new T.MeshBasicMaterial({ map: null, transparent: true, depthWrite: false, fog: false });
  const moon = new T.Mesh(new T.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMat); moon.name = 'moon'; moon.renderOrder = -9; moon.frustumCulled = false;
  const haloMat = new T.MeshBasicMaterial({ map: tex(haloTexture()), transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending });
  const halo = new T.Mesh(new T.PlaneGeometry(MOON_SIZE * 4.2, MOON_SIZE * 4.2), haloMat); halo.name = 'moon-halo'; halo.renderOrder = -9; halo.frustumCulled = false;
  // the stars: a hundred and sixty points on the upper dome, fixed to the sky (the group turns about the celestial pole with the hours)
  const stars = (() => {
    const rr = mulberry32(seed * 977 + 13), n = 110, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = rr() * Math.PI * 2, el = Math.asin(rr() * 0.97 - 0.1), c = Math.cos(el);
      pos[i * 3] = Math.sin(az) * c * STAR_R; pos[i * 3 + 1] = Math.sin(el) * STAR_R; pos[i * 3 + 2] = -Math.cos(az) * c * STAR_R;
      const b = 0.45 + rr() * 0.55; col[i * 3] = b * 0.82; col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.Points(geo, new T.PointsMaterial({ size: 1.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    m.name = 'stars'; m.renderOrder = -9; m.frustumCulled = false;
    return m;
  })();
  const bolt = (() => {
    const n = 16, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.Line(geo, new T.LineBasicMaterial({ color: 0xc9d4ff, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    m.name = 'bolt'; m.visible = false; m.frustumCulled = false; m.renderOrder = -8;
    return m;
  })();
  group.add(stars, halo, moon, bolt);
  render.scene.add(group);

  const _x = new T.Vector3(), _y = new T.Vector3(), _s = new T.Vector3(), _c = new T.Vector3(), _a = new T.Vector3();
  const pole = new T.Vector3(0, Math.sin(-LAT * RAD), Math.cos(-LAT * RAD)).normalize();   // the celestial pole of the south, seen from here
  let texKey = '';
  return {
    group, moon, halo, stars, bolt,
    /** Puts the sky for a player at `center` ({x, y, z}), with the moon `m` (moonAt), the hour `hour` and `o`: { cloud (0..1), dawn (0..1), brightness }. */
    set(center, m, hour, o = {}) {
      group.visible = true; group.position.set(center.x, 0, center.z);
      const cloud = o.cloud ?? 0, dawn = o.dawn ?? 0;
      const lowK = Math.min(1, Math.max(0, m.alt / 0.12));                       // within seven degrees of the horizon the moon is dimmer and redder
      moon.visible = halo.visible = m.visible;
      if (m.visible) {
        const key = `${Math.round(m.lit * 40)}`;
        if (key !== texKey) { texKey = key; if (moonMat.map) moonMat.map.dispose(); moonMat.map = tex(moonTexture(m.lit, seed)); moonMat.needsUpdate = true; }
        _c.set(...m.dir).multiplyScalar(MOON_R); moon.position.copy(_c); halo.position.copy(_c).multiplyScalar(1.004);
        moon.lookAt(group.position); halo.lookAt(group.position);
        // the lit side turns toward the sun: the angle of the sun's direction in the plane of the disc
        _a.set(...m.sun); _x.set(1, 0, 0).applyQuaternion(moon.quaternion); _y.set(0, 1, 0).applyQuaternion(moon.quaternion);
        moon.rotateZ(Math.atan2(_a.dot(_y), _a.dot(_x)));
        const show = (1 - cloud * 0.88) * (0.35 + 0.65 * lowK) * (1 - dawn * 0.5);
        moonMat.color.setRGB(1, 0.78 + 0.22 * lowK, 0.6 + 0.4 * lowK).multiplyScalar(show); moonMat.opacity = 1;
        haloMat.color.setScalar(show * (0.25 + 0.75 * m.lit)); haloMat.opacity = 1;
      }
      stars.visible = cloud < 0.95 && dawn < 0.9;
      stars.material.opacity = (1 - cloud) * (1 - dawn * 0.85) * (1 - (m.visible ? 0.65 * m.lit * Math.min(1, m.alt / 0.5 + 0.2) : 0)) * (o.brightness ?? 1);
      _s.copy(pole); stars.quaternion.setFromAxisAngle(_s, -(hour + 1) * 15 * RAD);
    },
    /** A bolt: from the cloud to near the horizon, at `bearing` (radians, as the world's angle: 0 is the north, positive to the east), seeded. */
    strike(center, bearing, k, rr) {
      const p = bolt.geometry.attributes.position, n = p.count; let x = Math.sin(bearing) * 66, z = -Math.cos(bearing) * 66;
      const sx = Math.cos(bearing), sz = Math.sin(bearing);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), y = 52 - 50 * u, j = (rr() - 0.5) * 7 * (1 - u * 0.4);
        p.setXYZ(i, x + sx * j, y, z + sz * j); if (i % 5 === 4) { x += sx * (rr() - 0.5) * 4; z += sz * (rr() - 0.5) * 4; }
      }
      p.needsUpdate = true; bolt.material.opacity = 0.55 + 0.4 * k; bolt.visible = true;
    },
    hideBolt() { bolt.visible = false; },
    hide() { group.visible = false; bolt.visible = false; },
    dispose() { render.scene.remove(group); moonMat.map?.dispose(); haloMat.map.dispose(); moon.geometry.dispose(); halo.geometry.dispose(); stars.geometry.dispose(); bolt.geometry.dispose(); },
  };
}
