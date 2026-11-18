// The engine's components at run time (docs/engine.md): a sound source, a particle emitter, a shader on its
// surfaces and interactions on any entity, from the `components` of its layout line (their fields: COMPONENTS in layout.js).
//
// Everything here is a function of the game's clock, `t` in seconds, given to update(t, ctx) each frame:
// particles are computed from t, not stepped, so the film mode, which sets its own clock, films exactly what
// the game shows. Nothing reads the real clock or Math.random.
//
// What the engine cannot know is asked of the game through `hooks` (all optional):
//   sounds: string[]                      the names of the game's sound catalog (checked, and offered in the editor)
//   sound: { play(name, { gain, pos }),   a one-shot sound at a point
//            start(name, { loop, gain, pos }) -> { gain(v), stop() } }   a source the engine keeps and fades
//   target(id, { label, pos, radius, fire }) -> unregister()   a 'use' interaction, for the game's own aiming
//   events: string[]                      the game's own event names (offered in the editor)
//   event(name, fromId)                   an interaction fired an event: told at the start of the next frame, with
//                                         the engine's own 'event' triggers. Only listens: calling ents.event with
//                                         the same name from here would fire those interactions twice.
//   say(text, fromId)                     an interaction says a line
// A hook that throws is ignored: the frame goes on.
// ctx of update: { listener: [x, y, z] (the player's ears and eyes), dir: [x, y, z] (where they look), hour }.
import * as THREE from 'three';
import { resolveComponents } from './layout.js';
import { mulberry32 } from './rng.js';

/** Most particles one emitter draws at once. */
const MAX_PARTICLES = 1024;
/** How far off the line of sight an entity still counts as looked at, in radians. */
const LOOK_ANGLE = 0.21;
/** Events fired from interactions handled per frame: a loop of events stops here. */
const EVENTS_PER_FRAME = 32;

const hashId = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const VERT = `attribute float size; attribute vec4 rgba; uniform float scale; varying vec4 vC;
void main() { vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, size * scale / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `varying vec4 vC; void main() { if (vC.a < 0.02) discard; gl_FragColor = vC; }`;

/**
 * One emitter: square points, each particle k born at k / rate after the emitter started, moving from the
 * emitter at its own random direction and speed, pulled by gravity, its color, opacity and size going from
 * start to end over its life. Positions are worked out from the time, so any moment can be drawn alone.
 */
function emitter(p, id) {
  const cap = Math.min(MAX_PARTICLES, Math.ceil(p.rate * p.life) + 1);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), rgba = new Float32Array(cap * 4), size = new Float32Array(cap);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('rgba', new THREE.BufferAttribute(rgba, 4));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { scale: { value: 500 } }, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.engineParticles = id;
  const c0 = new THREE.Color(p.colorStart), c1 = new THREE.Color(p.colorEnd);
  const axis = new THREE.Vector3(...p.dir);
  if (axis.lengthSq() < 1e-9) axis.set(0, 1, 0);
  const seed = (hashId(id) ^ Math.imul(p.seed + 1, 2654435761)) >>> 0;
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const spread = (p.spread * Math.PI) / 180;
  return {
    points,
    /** Draws the moment `age` seconds after the emitter started, at `origin` with the entity's turn `turn`. */
    draw(age, origin, turn) {
      let n = 0;
      if (p.rate > 0 && age >= 0) {
        const first = Math.max(0, Math.ceil((age - p.life) * p.rate));
        const last = Math.floor(age * p.rate);
        const dirW = v.copy(axis).applyQuaternion(turn).normalize().clone();
        q.setFromUnitVectors(up, dirW);
        for (let k = Math.max(first, last - cap + 1); k <= last && n < cap; k++) {
          const a = age - k / p.rate;
          if (a < 0 || a > p.life) continue;
          const r = mulberry32((seed + Math.imul(k, 0x9e3779b1)) >>> 0);
          let sx = 0, sy = 0, sz = 0;
          // The direction: anywhere for a point, inside the cone's opening otherwise (a box also throws along it).
          const cosMax = p.shape === 'ponto' ? -1 : Math.cos(spread / 2);
          const cz = cosMax + (1 - cosMax) * r(), sinT = Math.sqrt(Math.max(0, 1 - cz * cz)), phi = r() * Math.PI * 2;
          v.set(Math.cos(phi) * sinT, cz, Math.sin(phi) * sinT).applyQuaternion(q);
          const speed = p.speed * (0.75 + 0.5 * r());
          if (p.shape === 'caixa') {
            o.set((r() - 0.5) * p.area[0], (r() - 0.5) * p.area[1], (r() - 0.5) * p.area[2]).applyQuaternion(turn);
            sx = o.x; sy = o.y; sz = o.z;
          }
          const u = a / p.life;
          pos[n * 3] = origin.x + sx + v.x * speed * a;
          pos[n * 3 + 1] = origin.y + sy + v.y * speed * a + 0.5 * p.gravity * a * a;
          pos[n * 3 + 2] = origin.z + sz + v.z * speed * a;
          rgba[n * 4] = c0.r + (c1.r - c0.r) * u;
          rgba[n * 4 + 1] = c0.g + (c1.g - c0.g) * u;
          rgba[n * 4 + 2] = c0.b + (c1.b - c0.b) * u;
          rgba[n * 4 + 3] = p.alphaStart + (p.alphaEnd - p.alphaStart) * u;
          size[n] = p.sizeStart + (p.sizeEnd - p.sizeStart) * u;
          n++;
        }
      }
      geo.setDrawRange(0, n);
      for (const name of ['position', 'rgba', 'size']) geo.attributes[name].needsUpdate = true;
      return n;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/**
 * The components of a scene's entities. attach(id, m, line) starts them for a built entity, detach(id)
 * stops them; createEntities calls both for every entity it puts in or takes out, so a rebuilt entity
 * gets its components rebuilt too. `editor`: the person is editing the scene, so interactions do not fire
 * (particles and sound sources still run, to be seen and heard). `setParam(id, key, value)` is how an
 * action changes an entity: createEntities rebuilds it with the new value.
 */
export function createComponents({ r, group, hooks = {}, editor = false, setParam, paramOf }) {
  const live = new Map();
  /** What survives a rebuild of an entity caused by an action: fired-once marks, inside/outside, on/off. */
  const kept = new Map();
  const queue = [];
  const runs = [];
  let now = null;
  let keepNext = new Set();
  const stateOf = (id) => {
    if (!kept.has(id)) kept.set(id, { fired: new Set(), inside: new Map(), looked: new Map(), emStart: undefined, src: null });
    return kept.get(id);
  };
  const safe = (f) => { try { return f(); } catch { return undefined; } };

  const worldOf = (m, offset) => {
    m.root.updateWorldMatrix(true, false);
    const turn = new THREE.Quaternion();
    m.root.getWorldQuaternion(turn);
    const at = new THREE.Vector3(...offset).applyQuaternion(turn).add(m.root.getWorldPosition(new THREE.Vector3()));
    return { at, turn };
  };

  function attach(id, m, line) {
    detach(id, true);
    const c = resolveComponents(line.components);
    const st = stateOf(id);
    const x = { id, m, c, st, unregister: [] };
    // In `live` first: whatever fails below, detach finds and frees what was made.
    live.set(id, x);
    if (c.particles) {
      x.em = emitter(c.particles, id);
      group.add(x.em.points);
      // An emitter on from its layout counts from before the clock's start, as if it had been running a whole
      // life already: the same moment draws the same picture whenever the entity was built (the game builds
      // lazily, the film mode at its own clock), and the editor, with its clock stopped, shows it full. One
      // switched on by an action counts from then; an entity rebuilt by an action keeps its emitter's start.
      if (st.emStart === undefined) st.emStart = c.particles.on ? -c.particles.life : null;
    }
    // The sound source's state lives in st, so a rebuild by an action neither repeats a sound that played
    // once nor restarts its delay.
    if (c.sound) st.src ??= { on: c.sound.on, start: 0, done: false };
    // A shader of the library on the entity's surfaces (the render's own materials keep their colour and
    // options; a plain three material gives its colour). Without a render that makes shaders, or with a
    // shader no one declared, the entity stays as it is (the editor shows the problem).
    if (c.shader?.name && typeof r?.shaded === 'function') {
      x.swapped = [];
      m.root.traverse((o) => {
        if (!o.isMesh || o.isPoints) return;
        const one = (mat) => {
          const spec = mat?.userData?.engineSpec;
          const color = spec?.color ?? (mat?.color ? `#${mat.color.getHexString()}` : '#ffffff');
          try { return r.shaded(c.shader.name, c.shader.params, color, spec?.opts ?? {}); } catch { return mat; }
        };
        const was = o.material;
        o.material = Array.isArray(was) ? was.map(one) : one(was);
        x.swapped.push([o, was]);
      });
    }
    if (!editor && hooks.target) {
      c.interaction.forEach((i, n) => {
        if (i.trigger !== 'use') return;
        const pos = () => worldOf(m, [0, 0, 0]).at.toArray();
        const off = safe(() => hooks.target(id, { label: i.label, radius: i.radius, get pos() { return pos(); }, fire: () => fire(id, n) }));
        if (typeof off === 'function') x.unregister.push(off);
      });
    }
  }

  function detach(id, rebuilding = false) {
    const x = live.get(id);
    if (!x) return;
    if (x.em) { group.remove(x.em.points); x.em.dispose(); }
    // The surfaces get their own materials back (an entity rebuilt has new ones anyway).
    for (const [o, was] of x.swapped ?? []) o.material = was;
    safe(() => x.handle?.stop());
    for (const off of x.unregister) try { off(); } catch { /* the game's own list */ }
    live.delete(id);
    // An entity rebuilt by an action keeps what its interactions remember; one removed from the layout does not.
    if (!rebuilding && !keepNext.has(id)) kept.delete(id);
  }

  /** Fires interaction n of an entity: its actions start running now, on the game's clock. */
  function fire(id, n) {
    const x = live.get(id);
    const i = x?.c.interaction[n];
    if (!i || editor) return false;
    if (i.once) { if (x.st.fired.has(n)) return false; x.st.fired.add(n); }
    const run = { id, actions: i.actions, at: 0, until: null };
    runs.push(run);
    step(run);
    return true;
  }

  const targetOf = (id, a) => (!a.target || a.target === 'self' ? id : a.target);

  /** Runs a sequence until it ends or waits; true when it ended. */
  function step(run) {
    while (run.at < run.actions.length) {
      const a = run.actions[run.at];
      if (a.do === 'wait') {
        if (run.until === null) run.until = (now ?? 0) + a.seconds;
        if ((now ?? 0) < run.until) return false;
        run.until = null;
        run.at++;
        continue;
      }
      run.at++;
      act(run.id, a);
    }
    return true;
  }

  function act(id, a) {
    const tid = targetOf(id, a);
    switch (a.do) {
      case 'sound': {
        const m = live.get(id)?.m;
        safe(() => hooks.sound?.play?.(a.name, { gain: a.gain, pos: m ? worldOf(m, [0, 0, 0]).at.toArray() : null }));
        break;
      }
      // A change the game refuses (its build throws) leaves the entity as it was.
      case 'toggle': safe(() => setParam(tid, a.param, !paramOf(tid, a.param))); break;
      case 'set': safe(() => setParam(tid, a.param, a.value)); break;
      case 'particles': {
        const st = stateOf(tid);
        st.emStart = a.on ? (st.emStart ?? now ?? 0) : null;
        break;
      }
      case 'source': {
        const st = stateOf(tid);
        st.src ??= { on: false, start: 0, done: false };
        if (a.on && !st.src.on) { st.src.on = true; st.src.start = now ?? 0; st.src.done = false; }
        if (!a.on) {
          st.src.on = false;
          const x = live.get(tid);
          if (x) { safe(() => x.handle?.stop()); x.handle = null; }
        }
        break;
      }
      case 'event': queue.push({ name: a.name, from: id }); break;
      case 'say': safe(() => hooks.say?.(a.text, id)); break;
      default: break;
    }
  }

  /** The interactions waiting on a game event fire. */
  function event(name) {
    let n = 0;
    for (const x of live.values()) x.c.interaction.forEach((i, k) => { if (i.trigger === 'event' && i.event === name && fire(x.id, k)) n++; });
    return n;
  }

  /** The 'use' interactions of an entity fire (for a game that aims on its own, without hooks.target). */
  function use(id) {
    const x = live.get(id);
    let n = 0;
    x?.c.interaction.forEach((i, k) => { if (i.trigger === 'use' && fire(id, k)) n++; });
    return n;
  }

  /**
   * One frame, in this order, so whatever a frame's actions change shows in that same frame: the events
   * fired before it, the sequences waiting on the clock, the triggers (area, look, hour), and then the
   * particles drawn and the sound sources started and faded.
   */
  function update(t, c = {}) {
    now = t;
    const lis = c.listener;
    if (!editor) {
      // The events fired before this frame; those their interactions fire wait for the next one, so a loop of
      // events goes one step a frame instead of hanging the game, and more than EVENTS_PER_FRAME are dropped.
      const batch = queue.splice(0, queue.length).slice(0, EVENTS_PER_FRAME);
      for (const { name, from } of batch) { safe(() => hooks.event?.(name, from)); event(name); }
      for (let i = runs.length - 1; i >= 0; i--) if (step(runs[i])) runs.splice(i, 1);
      // A snapshot: an action that rebuilds an entity replaces it in `live` while this loop runs.
      for (const x of [...live.values()]) {
        x.c.interaction.forEach((i, k) => {
          if (lis && (i.trigger === 'enter' || i.trigger === 'leave')) {
            const inside = dist(lis, worldOf(x.m, [0, 0, 0]).at.toArray()) <= i.radius;
            const was = x.st.inside.get(k);
            x.st.inside.set(k, inside);
            // The first frame only learns where the player is: nothing fires for having started inside.
            if (was !== undefined && was !== inside && inside === (i.trigger === 'enter')) fire(x.id, k);
          }
          if (lis && c.dir && i.trigger === 'look') {
            const at = worldOf(x.m, [0, 0, 0]).at.toArray();
            const d = dist(lis, at);
            const to = [at[0] - lis[0], at[1] - lis[1], at[2] - lis[2]];
            const dl = Math.hypot(...c.dir) || 1;
            const cos = d > 1e-6 ? (to[0] * c.dir[0] + to[1] * c.dir[1] + to[2] * c.dir[2]) / (d * dl) : 1;
            const seen = d <= i.radius && cos >= Math.cos(LOOK_ANGLE);
            const was = x.st.looked.get(k) ?? false;
            x.st.looked.set(k, seen);
            if (seen && !was) fire(x.id, k);
          }
          if (i.trigger === 'time' && typeof c.hour === 'number' && typeof x.st.hour === 'number') {
            const a = x.st.hour, b = c.hour;
            // The hour passed since the last frame, also across midnight.
            const passed = a <= b ? a < i.hour && i.hour <= b : i.hour > a || i.hour <= b;
            if (passed) fire(x.id, k);
          }
        });
        if (typeof c.hour === 'number') x.st.hour = c.hour;
      }
    }
    // particles: the camera's picture height turns a size in meters into pixels
    const cam = r?.camera;
    const h = r?.renderer?.domElement?.height ?? 720;
    const scale = cam?.isPerspectiveCamera ? h / 2 / Math.tan((cam.fov * Math.PI) / 360) : h / 2;
    for (const x of live.values()) {
      if (x.em) {
        x.em.points.material.uniforms.scale.value = scale;
        const { at, turn } = worldOf(x.m, x.c.particles.offset);
        x.em.draw(x.st.emStart === null ? -1 : t - x.st.emStart, at, turn);
      }
      if (x.c.sound?.name && x.st.src) {
        const s = x.st.src, p = x.c.sound;
        if (s.on && !x.handle && !s.done && t - s.start >= p.delay && hooks.sound?.start) {
          const at = worldOf(x.m, p.offset).at.toArray();
          x.handle = safe(() => hooks.sound.start(p.name, { loop: p.loop, gain: 0, pos: at })) ?? null;
          if (!p.loop) s.done = true;
        }
        if (x.handle) {
          const at = worldOf(x.m, p.offset).at.toArray();
          const d = lis ? dist(lis, at) : 0;
          // Full volume near the source, fading to silence at its reach.
          const near = p.radius * 0.15;
          const fall = d <= near ? 1 : d >= p.radius ? 0 : 1 - (d - near) / (p.radius - near);
          safe(() => x.handle.gain(p.gain * fall * fall));
        }
      }
    }
  }

  /** Stops everything: every emitter out of the scene, every sound stopped, every target given back. */
  function dispose() {
    for (const id of [...live.keys()]) detach(id);
    kept.clear();
    runs.length = 0;
    queue.length = 0;
  }

  return {
    attach, detach, update, event, use, fire, dispose,
    /** Marks an entity whose next detach is a rebuild by an action (its interaction state stays). */
    keep(id) { keepNext.add(id); return () => keepNext.delete(id); },
    /** The live particle count of an entity, and whether its sound plays (for the editor and tests). */
    state(id) {
      const x = live.get(id);
      if (!x) return null;
      return { particles: x.em ? x.em.points.geometry.drawRange.count : null, sound: x.c.sound ? Boolean(x.handle) : null, components: x.c };
    },
    /** The reaches to draw around a selected entity in the editor: [{ kind, radius, at }]. */
    reaches(id) {
      const x = live.get(id);
      if (!x) return [];
      const out = [];
      if (x.c.sound) out.push({ kind: 'sound', radius: x.c.sound.radius, at: worldOf(x.m, x.c.sound.offset).at });
      x.c.interaction.forEach((i) => { if (['use', 'enter', 'leave', 'look'].includes(i.trigger)) out.push({ kind: 'interaction', radius: i.radius, at: worldOf(x.m, [0, 0, 0]).at }); });
      return out;
    },
  };
}
