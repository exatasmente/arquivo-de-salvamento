// The recorded sound effects of the game (assets/audio/sfx/, made by tools/sfx/ from ElevenLabs Sound Effects), played through the
// WebAudio graph: decoded AudioBuffers kept in a cache and loaded on demand, a seeded pick among the variations of a sound (a take with
// several hits is one file with its slices listed in manifest.json), and a small variation of pitch and level on each play.
//
//   const samples = createSamples(ctx);                       // { base, fetchFn, manifest } are for tests and the offline render
//   samples.preload(['passo', 'ui-ok'])                        // route names; the files are fetched and decoded in the background
//   samples.play('passo', { r, at, dest, gain })               // -> length in seconds, or 0 when it is not loaded (the caller plays the synth)
//   samples.loop('ambiente-rua', { r, at, dest, dur, offset }) -> { stop(at) } or null
//   pickVariant(r, pool, last)                                 // the seeded pick, exported to be tested
// A missing file, a failed decode or no network is never an error: the sound is `null` and the game keeps the synthesised one.
import { dbGain } from './levels.js';
export const SFX_BASE = new URL('../../assets/audio/sfx/', import.meta.url).href;

/**
 * name -> what plays. ids: the files that are the variations of the sound; g: level in dB (to sit where the synth was); pitch: the spread of
 * the rate (0.06 = +-3%); vol: the spread of level in dB; wet: how much of the room's reverb it gets (the interface gets none);
 * mode: 'replace' (the recording takes the place of the synth, which stays as the fallback) or 'layer' (the synth keeps playing, the
 * recording is under it); max: the longest it plays, in seconds; loop: a bed. `sounds` is what these names become, listed in the kb.
 */
export const ROUTES = {
  // g (dB) was set by tools/sfx/reel.mjs --calibrate: the recording at the level of the synth it replaces (short-term peak), then by hand where that was wrong
  // footsteps: the street is the concrete pavement, the gallery (the abandoned station) is the tiled floor
  passo: { ids: ['passo-hall'], g: -1, pitch: 0.07, vol: 2 },
  'passo-rua': { ids: ['passo-concreto'], g: -0.5, pitch: 0.07, vol: 2 },
  'passo-hall': { ids: ['passo-hall'], g: -5, pitch: 0.07, vol: 2 },
  'passo-grade': { ids: ['passo-grade'], g: -2, pitch: 0.07, vol: 2 },
  'passo-escada': { ids: ['passo-escada'], g: 0, pitch: 0.07, vol: 2 },
  // the cable, the splice, the decoy
  'cabo-puxa': { ids: ['cabo-puxa'], g: -12, pitch: 0.12, vol: 2, max: 0.9 },
  consertar: { ids: ['cabo-torce'], g: 6, pitch: 0.08, vol: 1.5, max: 1.2 },
  'cabo-solta': { ids: ['cabo-conector', 'cabo-conector-b'], g: -3, pitch: 0.06, vol: 1.5 },
  'isca-cai': { ids: ['isca-lanca-cai'], g: 0, pitch: 0.06, vol: 1.5 },
  'isca-estalo': { ids: ['isca-estalo'], g: -4, pitch: 0.1, vol: 2 },
  // the radio
  'radio-tx': { ids: ['radio-ptt'], g: -9, pitch: 0.04, vol: 1.5, wet: 0.15 },
  'radio-solta': { ids: ['radio-squelch', 'radio-squelch-b'], g: -10, pitch: 0.05, vol: 1.5, wet: 0.15 },
  'radio-sintonia': { ids: ['radio-sintonia'], g: -12, pitch: 0.02, vol: 1, wet: 0.1, max: 2.4 },
  'radio-mao': { ids: ['radio-mao'], g: -14, pitch: 0.03, vol: 1, wet: 0.1 },
  chiado: { ids: ['radio-chiado'], g: -1, loop: true, wet: 0 },
  // the interface: physical and quiet, no room
  'ui-ok': { ids: ['ui-ok', 'ui-ok-b'], g: -5, pitch: 0.05, vol: 1.5, wet: 0 },
  'ui-move': { ids: ['ui-move'], g: -10, pitch: 0.06, vol: 1.5, wet: 0 },
  'ui-no': { ids: ['ui-no', 'ui-no-b'], g: -1, pitch: 0.05, vol: 1.5, wet: 0 },
  'ui-voltar': { ids: ['ui-voltar'], g: -3, pitch: 0.05, vol: 1.5, wet: 0 },
  'ui-aba': { ids: ['ui-aba'], g: -8, pitch: 0.06, vol: 1.5, wet: 0 },
  'ui-fader': { ids: ['ui-fader'], g: -11, pitch: 0.1, vol: 2, wet: 0 },
  // the reaction (the prompt): a pulse when it opens, a breath and cloth when it is hit, a thud when it is missed
  'reacao-abre': { ids: ['qte-pulso'], g: -13, pitch: 0.04, vol: 1, wet: 0.2 },
  'reacao-acerto': { ids: ['qte-acerto'], g: -9, pitch: 0.06, vol: 1.5, wet: 0.2 },
  'reacao-erro': { ids: ['qte-erro', 'qte-erro-b'], g: -1, pitch: 0.06, vol: 1.5 },
  // scene 4 impacts (new names, and the layer under the dog's blows)
  'impacto-lixeira': { ids: ['impacto-lixeira'], g: 0, pitch: 0.05, vol: 1.5 },
  'queda-corpo': { ids: ['queda-corpo', 'queda-corpo-b'], g: -1, pitch: 0.06, vol: 1.5 },
  'vidro-aramado': { ids: ['vidro-aramado'], g: -3, pitch: 0.05, vol: 1.5 },
  // the dog: the synth stays as it was approved; the recording is only a layer under the movement
  'cao-rolar': { ids: ['cao-pisada'], mode: 'layer', g: -14, pitch: 0.08, vol: 2, max: 0.5 },
  'cao-busca': { ids: ['cao-servo'], mode: 'layer', g: -14, pitch: 0.04, vol: 1, max: 1.5 },
  'cao-caca': { ids: ['cao-hidraulica'], mode: 'layer', g: -15, pitch: 0.04, vol: 1, max: 1.0 },
  'cao-bate': { ids: ['impacto-lixeira'], mode: 'layer', g: -4, pitch: 0.04, vol: 1 },
  'cao-derruba': { ids: ['queda-corpo', 'queda-corpo-b'], mode: 'layer', g: -6, pitch: 0.04, vol: 1 },
  // the beds
  // what the objects of the scene sound (src/audio/emitters.js): a hum from a lamp, the pump, the board, the wind through a grate, a relay and a drop
  // that come every few seconds. `rate` plays the same recording lower (the board, the viaduct); wet is the room's share, g the level in dB
  'zumbido-lampada': { ids: ['zumbido-lampada'], g: 6, loop: true, pitch: 0.06, wet: 1 },
  'zumbido-quadro': { ids: ['zumbido-lampada'], g: 7, loop: true, rate: 0.62, pitch: 0.04, wet: 1 },
  'bomba-motor': { ids: ['bomba-motor'], g: 3, loop: true, wet: 1 },
  'vento-grade': { ids: ['vento-grade'], g: 2, loop: true, pitch: 0.05, wet: 0.6 },
  'viaduto-vento': { ids: ['vento-grade'], g: 1, loop: true, rate: 0.55, pitch: 0.04, wet: 0.6 },
  'rele-semaforo': { ids: ['rele-semaforo'], g: 10, pitch: 0.06, vol: 2, wet: 0.6 },
  'gota-cano': { ids: ['gota-cano'], g: 6, pitch: 0.12, vol: 3, wet: 1 },
  ambiente: { ids: ['amb-estacao'], g: 3, loop: true, wet: 0 },
  'ambiente-rua': { ids: ['amb-rua'], g: -1, loop: true, wet: 0 },
  'ambiente-poco': { ids: ['amb-poco'], g: 4, loop: true, wet: 0 },
  'ambiente-predio': { ids: ['amb-predio'], g: 1, loop: true, wet: 0 },
  // the chase through the building (2026-11-23): the flat's room tone, his breath while he hides, the sweep of the dog's sensor, the blow on the cupboard, the game over
  'ambiente-apto': { ids: ['apto-fundo'], g: 3, loop: true, wet: 0 },
  'respiracao-escondido': { ids: ['jonas-respira-escondido'], g: -2, pitch: 0.03, vol: 1, wet: 0.2 },
  'sensor-varre': { ids: ['cao-sensor-varre'], g: -5, pitch: 0.04, vol: 1 },
  'armario-racha': { ids: ['armario-golpe'], g: 0, pitch: 0.04, vol: 1 },
  'fim-de-jogo': { ids: ['fim-de-jogo'], g: -3, wet: 0 },
};
export const SAMPLE_NAMES = Object.keys(ROUTES);

/** The variations of a route: one entry per slice of each of its files (a file with no slices is one). */
export function variantsOf(route, manifest, have = () => true) {
  const out = [];
  for (const id of route.ids) {
    const m = manifest?.[id]; if (!m || !have(id)) continue;
    if (m.slices?.length) m.slices.forEach((s, i) => out.push({ id, slice: i, from: s[0], to: s[1] })); else out.push({ id, slice: -1, from: 0, to: m.dur });
  }
  return out;
}
/** The seeded pick: never the same variation twice in a row when there is a choice. `r` is the sound's own random (a function of its seed). */
export function pickVariant(r, pool, last = null) {
  if (!pool.length) return null;
  let i = Math.floor(r() * pool.length);
  if (pool.length > 1 && last && pool[i].id === last.id && pool[i].slice === last.slice) i = (i + 1 + Math.floor(r() * (pool.length - 1))) % pool.length;
  return pool[i];
}

export function createSamples(ctx, { base = SFX_BASE, fetchFn = (u) => fetch(u), manifest = null } = {}) {
  const buffers = new Map(), loading = new Map(), lastOf = new Map();
  let man = manifest, manP = null;
  const getManifest = () => (manP ??= (man ? Promise.resolve(man) : Promise.resolve().then(() => fetchFn(`${base}manifest.json`)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest: ${r.status}`)))).catch((e) => { console.info('sfx manifest not loaded:', e?.message ?? e); return {}; })).then((m) => (man = m)));
  /** One file, decoded: the AudioBuffer, or null when it is missing or does not decode (kept, so it is not asked again). */
  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (!loading.has(id)) {
      loading.set(id, getManifest().then((m) => (m[id] ? Promise.resolve(fetchFn(`${base}${m[id].file}`)) : Promise.reject(new Error('not in the manifest'))))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((ab) => new Promise((ok, no) => { const p = ctx.decodeAudioData(ab, ok, no); p?.then?.(ok, no); }))
        .then((b) => { buffers.set(id, b); return b; })
        .catch((e) => { console.info('sfx not loaded:', id, e?.message ?? e); buffers.set(id, null); return null; }));
    }
    return loading.get(id);
  }
  const idsOf = (names) => [...new Set([].concat(names).flatMap((n) => ROUTES[n]?.ids ?? []))];
  const preload = (names = SAMPLE_NAMES.filter((n) => !ROUTES[n].loop)) => Promise.all(idsOf(names).map(load));
  const loaded = (id) => Boolean(buffers.get(id));
  /** True when this name has a recording ready to play. */
  const ready = (name) => { const rt = ROUTES[name]; return Boolean(rt && man && rt.ids.some(loaded)); };

  /** Plays a variation of `name` into `dest` (a node) at `at`. Returns the length it will sound, 0 if it could not (it starts loading). */
  function play(name, { r = Math.random, at, dest, gain = 1, offset = 0 } = {}) {
    const rt = ROUTES[name];
    if (!rt || rt.loop) return 0;
    if (!man || !rt.ids.every((id) => buffers.has(id))) preload([name]);
    if (!man) return 0;
    const v = pickVariant(r, variantsOf(rt, man, loaded), lastOf.get(name));
    if (!v) return 0;
    lastOf.set(name, v);
    const buf = buffers.get(v.id), rate = 1 + (r() - 0.5) * (rt.pitch ?? 0), lvl = dbGain((rt.g ?? 0) + (r() - 0.5) * (rt.vol ?? 0)) * gain;
    const len = Math.min(v.to - v.from, rt.max ?? Infinity), dur = len / rate;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = lvl; src.connect(g); g.connect(dest);
    if (rt.max && v.to - v.from > rt.max) { const t1 = at + dur; g.gain.setValueAtTime(lvl, Math.max(at, t1 - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t1); }
    src.start(at, v.from + offset, len); src.stop(at + dur + 0.02);
    return dur;
  }

  /** A bed: the loop of `name` from `at` for `dur` seconds (until stop() when dur is not given), starting `offset` seconds in (seeded when not given). */
  function loop(name, { r = Math.random, at, dest, gain = 1, dur = null, offset = null } = {}) {
    const rt = ROUTES[name];
    if (!rt?.loop) return null;
    if (!man || !rt.ids.every((id) => buffers.has(id))) preload([name]);
    const id = rt.ids.find(loaded); if (!id || !man) return null;
    const buf = buffers.get(id), g = ctx.createGain(), src = ctx.createBufferSource(), lvl = dbGain(rt.g ?? 0) * gain;
    src.buffer = buf; src.loop = true; src.connect(g); g.connect(dest);
    const first = (((offset ?? r() * buf.duration) % buf.duration) + buf.duration) % buf.duration;
    // a bed may sit at a pitch of its own (a hum from a lower thing: `rate`) and a little off each time (`pitch`), so two lamps are not one
    src.playbackRate.value = (rt.rate ?? 1) * (1 + (rt.pitch ? (r() - 0.5) * rt.pitch : 0));
    const FADE = 0.5;
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(lvl, at + FADE);
    src.start(at, first);
    const handle = {
      stop(when = ctx.currentTime) { try { g.gain.cancelScheduledValues(when); g.gain.setValueAtTime(lvl, when); g.gain.linearRampToValueAtTime(0.0001, when + FADE); src.stop(when + FADE + 0.05); } catch { /* ended */ } },
      gain(v, tc = 0.1) { g.gain.setTargetAtTime(v * dbGain(rt.g ?? 0), ctx.currentTime, tc); },
    };
    if (dur != null) handle.stop(Math.max(at + FADE, at + dur - FADE));
    return handle;
  }
  return { load, preload, ready, play, loop, manifest: getManifest, loaded, get buffers() { return buffers; } };
}
