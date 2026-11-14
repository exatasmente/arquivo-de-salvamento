// Audio for "O Dia que Sobra": everything synthesized with Web Audio, live. No samples, no
// constant music (silence is a tool), period treatment on the last node.
//
//   const audio = createAudio(ctx);                  // ctx: AudioContext (22.05 kHz is enough, see createAudioContext)
//   audio.play('porta_sino', { pos: [x, y, z], gain: 0.8 });   // -> duration in seconds
//   const l = audio.loop('fluorescente', { pos, gain });       // -> { stop(fade), setGain(g), setPos(p), set(k, v) }
//   audio.listener(pos, dir);                        // every frame, from the camera
//   const dur = audio.babble(seed, 'Completa a comum.');       // plays now, returns the duration
//   audio.setSanity(55);                             // 0..100: muffles, drives, warbles, adds body sounds
//   audio.setHallucination(0.5);                     // 0..1: pointed sounds now and then mirrored and/or half a second late (seeded)
//   audio.setDrowsy(0.8);                            // 0..1: the whole mix sinks; play('sono_pesado') does it for a few seconds
//   audio.babble(seed, text, { self: true });         // the protagonist's own voice, fixed timbre, old recording
//
// Options common to play/loop/babble: pos [x,y,z] (HRTF), gain (x1), at (absolute context time,
// for offline renders and film), seed (makes the variation independent of the call order),
// ref/rolloff (distance model), wet (reverb send). Loops also take dur (seconds, offline) and fade.
// Sounds are built right before they play; loops are small graphs (oscillators + shared noise),
// and the repeating events inside them (cars, flickers, rings) are built about a second ahead.
import { rng, hash, isOffline, makeNoise, lerp, clamp } from './util.js';
import { makeKit } from './kit.js';
import { createChain } from './chain.js';
import { ONESHOTS } from './oneshots.js';
import { SOL_ONESHOTS } from './sol.js';
import { LOOPS as BASE_LOOPS } from './loops.js';
import { EXTRA_ONESHOTS, EXTRA_LOOPS } from './extra.js';
import { playBabble, babbleTimeline } from './babble.js';
import { FASE6_ONESHOTS, FASE6_LOOPS, FASE6_NAMES } from './fase6.js';
import { SUSTO_ONESHOTS, SUSTO_NAMES } from './susto.js';

const LEAD = 1.2;          // live events are built this far ahead
const MAX_HRTF = 6;        // HRTF panners are costly: past this, new one-shots use equal-power
const MAX_HRTF_LOOPS = 10; // loops are few and long-lived: they may go further
const SOL_TRIM = 0.7;      // the Sun is kept low
const SOL_NAMES = new Set(['sol_presenca', 'sol_passos', 'sol_respira', 'sol_sorriso', 'sol_jingle']);
const WET = { luz_oscila: 0.5, passos_cascalho: 0.6, relogio_volta: 0.5, sol_jingle: 0.9, farmacia_sino: 0.5, passo_azulejo: 0.9, porta_fecha: 0.6, bico_poe: 0.6, disjuntor: 0.8, lampada_estalo: 0.7, apagao: 0.8, sol_passos: 0.8, sol_respira: 0.9, sol_sorriso: 1, sol_presenca: 0.6, moeda: 0.6, gaveta_abre: 0.5 };
// Level trims in dB, from the offline measurements (see tools/audio-render.mjs): ambience sits well
// under the one-shots, and the Sun sits under everything.
const TRIM_DB = { fluorescente: -13, rodovia: -15, insetos: -5, vento: -15, geladeira: -19, motor_carro: -11, bomba_corre: -8, chuva: -2,
  sol_presenca: -24, sol_passos: -9, sol_respira: 8, sol_sorriso: -2, apagao: -6, coracao: -5, respiracao: 4, babble: -6, telefone_toca: -6 };
const trim = (n) => 10 ** ((TRIM_DB[n] ?? 0) / 20);
const LOOPS = { ...BASE_LOOPS, ...EXTRA_LOOPS, ...FASE6_LOOPS };
const LOOP_NAMES = Object.keys(LOOPS);
const ONE = { ...ONESHOTS, ...SOL_ONESHOTS, ...EXTRA_ONESHOTS, ...FASE6_ONESHOTS, ...SUSTO_ONESHOTS };
// Phase 3 levels (dB), from the offline measurements.
Object.assign(TRIM_DB, { telefone_mudo: -8, sono_pesado: -14, sino_fantasma: -2, motor_sem_som: -3, bomba4_liga: -3 });
// Sounds that setHallucination never touches: the player's own body and hands, the interface, the voices.
const HALLU_SKIP = new Set(['susto_golpe', 'babble', 'respiracao', 'coracao', 'tecla', 'lanterna_clique', 'caixa_bip', 'engolir', 'frasco', 'sono_pesado', 'zumbido_ouvido', 'secretaria_inicio', 'secretaria_fita', 'secretaria_fim', 'cama_deita', 'sacola', 'papel_folha', 'vara_pega']);
// Phase 6 levels (dB): the new ambiences sit with the old ones (rms about -30 to -38), the small paper and
// plastic sounds come up to the level of the hand sounds, the tape under a message stays under the voice.
Object.assign(TRIM_DB, { rua_noite: -11, casa_tom: -8, farmacia_ar: -9, cracha_pega: 3, sacola: 6, papel_folha: 5, vara_pega: 2, adesivo_cola: 2, secretaria_fita: -4 });
const hasHalluSkip = (n) => HALLU_SKIP.has(n) || n.startsWith('passo_') || n.startsWith('ui_');
export { FASE6_NAMES, SUSTO_NAMES };
export const NAMES = [...new Set([...Object.keys(ONE), ...LOOP_NAMES])];
export const LOOP_ONLY = LOOP_NAMES.filter((n) => !ONE[n]);

/** An AudioContext at 22.05 kHz (the sound is cut near 10 kHz anyway; half the work). */
export function createAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try { return new AC({ sampleRate: 22050, latencyHint: 'interactive' }); } catch { return new AC(); }
}

export function createAudio(ctx, opts = {}) {
  const offline = isOffline(ctx);
  const chain = createChain(ctx, { era: opts.era !== false, eraBits: opts.eraBits ?? 6, volume: opts.volume ?? 0.9, destination: opts.destination });
  let seed = (opts.seed ?? 1) >>> 0, sanity = 100, hrtfLive = 0, voices = 0, hallu = 0, drowsy = 0;
  let lPos = [0, 0, 0], lDir = [0, 0, -1];
  const counts = {}, noises = {}, sanityFns = new Set(), warned = new Set(), liveLoops = new Set();
  const A = {
    ctx,
    noise(kind) { return noises[kind] ??= makeNoise(ctx, kind, 4, hash('noise-' + kind, 5)); },
  };
  for (const k of ['white', 'pink', 'brown']) A.noise(k); // built once, at load, not in the middle of a scene
  const warnOnce = (n) => { if (!warned.has(n)) { warned.add(n); console.warn('audio: unknown sound', n); } };
  const setParam = (p, v, at) => { if (at !== undefined) p.setValueAtTime(v, at); else p.value = v; };

  // ---- voice: gain -> (HRTF panner) -> bus, plus a reverb send ------------------------------
  function voice(o, name, limit = MAX_HRTF) {
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * trim(name) * (SOL_NAMES.has(name) ? SOL_TRIM : 1);
    let tail = g, panner = null, hrtf = false;
    if (o.pos) {
      panner = ctx.createPanner();
      hrtf = hrtfLive < limit; if (hrtf) hrtfLive++;
      panner.panningModel = hrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse'; panner.refDistance = o.ref ?? 2; panner.rolloffFactor = o.rolloff ?? 1; panner.maxDistance = 120;
      place(panner, o.pos); g.connect(panner); tail = panner;
    }
    tail.connect(chain.bus);
    const wet = ctx.createGain(); wet.gain.value = o.wet ?? WET[name] ?? 0.35; tail.connect(wet).connect(chain.rev);
    voices++;
    let done = false;
    const free = () => { if (done) return; done = true; voices--; if (hrtf) hrtfLive--; try { g.disconnect(); panner?.disconnect(); wet.disconnect(); } catch { /* gone */ } };
    return {
      in: g, dest: { node: g, spatial: !!o.pos },
      setPos(p) { if (panner) place(panner, p); },
      /** Free the nodes once the sound has ended (absolute context time). */
      release(end) { if (offline) return; setTimeout(free, Math.max(0, (end - ctx.currentTime)) * 1000 + 400); },
      free,
    };
  }
  function place(p, pos) {
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
  }

  // ---- one-shots -----------------------------------------------------------------------------
  function play(name, o = {}) {
    const fx = ONE[name];
    if (!fx) {
      if (LOOPS[name]) { const d = o.dur ?? 4, l = loop(name, o); if (offline) return d; setTimeout(() => l.stop(0.4), d * 1000); return d; }
      warnOnce(name); return 0;
    }
    const n = counts[name] = (counts[name] || 0) + 1;
    const r = rng(o.seed !== undefined ? hash(name, o.seed >>> 0) : hash(name, seed * 977 + n));
    let late = 0;
    if (hallu > 0 && o.hallucinate !== false && !hasHalluSkip(name)) {
      // an auditory hallucination: now and then a pointed sound comes from the mirrored side and/or half a second late.
      // Its own seeded generator, so the sound itself (r) is the same with or without it.
      const h = rng(hash(name + '#h', o.seed !== undefined ? o.seed >>> 0 : seed * 977 + n));
      if (o.pos && h() < 0.45 * hallu) o = { ...o, pos: mirror(o.pos) };
      if (h() < 0.3 * hallu) late = 0.35 + h() * 0.3;
    }
    const t = (o.at ?? (ctx.currentTime + (o.delay || 0) + 0.01)) + late;
    const v = voice(o, name), K = makeKit(A, v.dest);
    const dur = fx({ K, t, r, o });
    if (name === 'sono_pesado') { const d = o.dur ?? 5, k = o.depth ?? 1; chain.setDrowsy(k, 0.9, t); chain.setDrowsy(drowsy, 1.1, t + d * 0.7); }
    v.release(t + dur + 0.5);
    return dur + late;
  }

  /** The position mirrored across the listener's facing axis (left <-> right), distance kept. */
  function mirror(p) {
    const d = Math.hypot(lDir[0], lDir[2]) || 1, rx = -lDir[2] / d, rz = lDir[0] / d; // right of the listener, on the floor plane
    const k = 2 * ((p[0] - lPos[0]) * rx + (p[2] - lPos[2]) * rz);
    return [p[0] - k * rx, p[1], p[2] - k * rz];
  }

  // ---- loops ---------------------------------------------------------------------------------
  function loop(name, o = {}) {
    const def = LOOPS[name];
    if (!def) { warnOnce(name); return { stop() {}, setGain() {}, setPos() {}, set() {} }; }
    const n = counts[name] = (counts[name] || 0) + 1;
    const r = rng(o.seed !== undefined ? hash(name, o.seed >>> 0) : hash(name, seed * 977 + n));
    const t0 = o.at ?? (ctx.currentTime + 0.01), tEnd = o.dur ? t0 + o.dur : (offline ? ctx.length / ctx.sampleRate : Infinity);
    const target = o.gain ?? 1, fade = o.fade ?? 0.4;
    const content = ctx.createGain(), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t0); lg.gain.setTargetAtTime(target, t0, fade / 4);
    content.connect(lg);
    const v = voice({ pos: o.pos, gain: 1, ref: o.ref, rolloff: o.rolloff, wet: o.wet }, name, MAX_HRTF_LOOPS); lg.connect(v.in);
    const srcs = [], tickers = [], setFns = [], sanFns = [], st = { ...(o.state || {}) };
    const track = (s) => { s.start(t0); if (Number.isFinite(tEnd)) s.stop(tEnd + 0.3); srcs.push(s); return s; };
    const K = makeKit(A, { node: content, spatial: !!o.pos });
    const L = {
      ctx, A, out: content, r, st, t0, tEnd, K, spatial: !!o.pos,
      osc(type, f) { const x = ctx.createOscillator(); x.type = type; x.frequency.value = f; return track(x); },
      src(kind, off = 0) { const s = ctx.createBufferSource(); s.buffer = A.noise(kind); s.loop = true; s.start(t0, (off % 1) * s.buffer.duration); if (Number.isFinite(tEnd)) s.stop(tEnd + 0.3); srcs.push(s); return s; },
      lfo(type, f, depth, param) { const x = L.osc(type, f), g = ctx.createGain(); g.gain.value = depth; x.connect(g).connect(param); return x; },
      every(fn) {
        const ok = offline ? () => true : (t) => t > ctx.currentTime - 0.05;
        if (offline) { fn(tEnd, ok); return; }
        const tick = () => fn(ctx.currentTime + LEAD, ok);
        tick(); tickers.push(setInterval(tick, 200));
      },
      onSet(fn) { setFns.push(fn); },
      onSanity(fn) { sanFns.push(fn); sanityFns.add(fn); fn(sanity); },
    };
    def(L);
    // a loop may start with a state (e.g. rpm) given in o.state: tell the handlers
    for (const [k, val] of Object.entries(st)) for (const f of setFns) f(k, val);
    let stopped = false;
    const handle = {
      /** Fade out and free. `at` (absolute time) is for offline renders. */
      stop(fadeOut = 0.3, at) {
        if (stopped) return; stopped = true;
        const when = at ?? ctx.currentTime;
        lg.gain.setTargetAtTime(0, when, fadeOut / 4);
        for (const id of tickers) clearInterval(id);
        for (const f of sanFns) sanityFns.delete(f);
        liveLoops.delete(handle);
        const endT = when + fadeOut * 1.6 + 0.05;
        for (const s of srcs) { try { s.stop(endT); } catch { /* already stopped */ } }
        v.release(endT);
      },
      setGain(g, tc = 0.1, at) { lg.gain.setTargetAtTime(g, at ?? ctx.currentTime, tc); },
      setPos(p) { v.setPos(p); },
      /** Loop-specific parameter: motor_carro rpm, bomba_corre rate, respiracao/coracao intensity. */
      set(k, val) { st[k] = val; for (const f of setFns) f(k, val); },
      name,
    };
    if (!offline) liveLoops.add(handle);
    return handle;
  }

  // ---- listener ------------------------------------------------------------------------------
  function listener(pos, dir = [0, 0, -1], at) {
    lPos = pos; lDir = dir;
    const L = ctx.listener, d = Math.hypot(dir[0], dir[1], dir[2]) || 1, f = [dir[0] / d, dir[1] / d, dir[2] / d];
    if (L.positionX) {
      setParam(L.positionX, pos[0], at); setParam(L.positionY, pos[1], at); setParam(L.positionZ, pos[2], at);
      setParam(L.forwardX, f[0], at); setParam(L.forwardY, f[1], at); setParam(L.forwardZ, f[2], at);
      setParam(L.upX, 0, at); setParam(L.upY, 1, at); setParam(L.upZ, 0, at);
    } else { L.setPosition(pos[0], pos[1], pos[2]); L.setOrientation(f[0], f[1], f[2], 0, 1, 0); }
  }

  // ---- babble --------------------------------------------------------------------------------
  function babble(s, texto, o = {}) {
    const t = o.at ?? (ctx.currentTime + 0.01);
    const v = voice(o, 'babble'), dur = playBabble(A, v.dest, t, s, texto, o);
    v.release(t + dur + 0.5);
    return dur;
  }

  // ---- sanity --------------------------------------------------------------------------------
  // The mix follows the table of the design: 79-60 the fluorescent hum louder and audible breathing;
  // 59-40 a heartbeat comes in; 39-20 the sound is muffled; 19-1 tunnel, drive and a seasick warble.
  let breath = null, heart = null;
  const bodyOn = opts.body !== false;
  function setSanity(v, tc = 0.5) {
    sanity = clamp(v, 0, 100);
    const info = chain.setSanity(sanity, tc);
    for (const f of sanityFns) f(sanity);
    if (bodyOn && !offline) body();
    return info;
  }
  function body() {
    const wantBreath = sanity < 80, wantHeart = sanity < 60;
    if (wantBreath && !breath) breath = loop('respiracao', { gain: 0, state: { intensity: 0.2 } });
    if (!wantBreath && breath) { breath.stop(1); breath = null; }
    if (wantHeart && !heart) heart = loop('coracao', { gain: 0, state: { intensity: 0.2 } });
    if (!wantHeart && heart) { heart.stop(1); heart = null; }
    if (breath) { const k = (80 - sanity) / 80; breath.set('intensity', 0.2 + 0.8 * k); breath.setGain(lerp(0.35, 0.9, k), 0.6); }
    if (heart) { const k = (60 - sanity) / 60; heart.set('intensity', 0.15 + 0.85 * k); heart.setGain(lerp(0.3, 0.9, k), 0.6); }
  }

  return {
    play, loop, listener, babble, setSanity,
    /** Auditory hallucination 0..1 (suggested: (60 - sanity) / 60, clamped): pointed sounds sometimes come mirrored and/or late. Seeded. */
    setHallucination(v) { hallu = clamp(+v || 0, 0, 1); },
    /** Heavy sleep 0..1: the whole mix sinks (muffled, lower). tc: seconds to get there (default 0.6). */
    setDrowsy(v, tc = 0.6) { drowsy = clamp(+v || 0, 0, 1); chain.setDrowsy(drowsy, tc); },
    /** How long a babble lasts, without playing it. */
    babbleDuration(s, texto, o = {}) { return babbleTimeline(s, texto, !!o.self).dur; },
    setEra: chain.setEra, setRoom: chain.setRoom, setVolume: chain.setVolume,
    setSeed(s) { seed = s >>> 0 || 1; },
    resume() { return ctx.state === 'suspended' && ctx.resume ? ctx.resume() : Promise.resolve(); },
    /** Stop every live loop (scene change, pause menu). */
    stopLoops(fade = 0.4) { for (const l of [...liveLoops]) l.stop(fade); breath = heart = null; },
    has: (n) => NAMES.includes(n),
    names: NAMES, loopNames: LOOP_NAMES, rooms: chain.rooms,
    get sanity() { return sanity; },
    get hallucination() { return hallu; },
    get drowsy() { return drowsy; },
    stats() { return { voices, hrtf: hrtfLive, loops: liveLoops.size }; },
    output: chain.master,
  };
}
