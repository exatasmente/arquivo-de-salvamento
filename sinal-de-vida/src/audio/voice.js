// One voice of the game's sound: a gain (the sound's own), an optional low-pass (the sound heard through something: `occlude`),
// a panner when it has a place (`pos`) with its distance (the volume falls, the top fades, the room's share grows), the dry path to the
// chain's bus and a send to the reverb of the room it is in.
//
//   const make = createVoiceFactory(ctx, { bus, space, rolloff });
//   const v = make({ gain, pos: [x, y, z], occlude: 0..1, room: 'poco', wet: 0..1, live: true, at }, bus?);   // v.g (the gain), v.dest (for the kit), v.free()
//   make.listener(pos, dir, at)  puts the listener (where the player is, where the camera looks); make.distance(pos)
// `wet` scales the room's send (0: a dry sound, such as the interface).
// `live`: the voice lasts (a bed from an object, a line from a radio across the room) and the listener moves: its air (the top that fades
// with distance) and its room's share follow the listener at each make.listener(), instead of being fixed when it starts. A one-shot is fixed.
// `at` (the offline render, where the listener is a timeline): the voice starts at that second, and its distance is the listener's then; a
// listener put with `at` is scheduled there, so a moving camera pans and dims what it passes.
const airOf = (d) => Math.max(2400, 17000 / (1 + Math.max(0, d - 5) / 14));      // the top a sound of distance d keeps (Hz)
const shareOf = (d) => Math.min(1.6, 1 + d / 25);                                   // how much more of the room a far sound is

export function createVoiceFactory(ctx, { bus: defaultBus, space, rolloff = 1 } = {}) {
  const L = { pos: null, track: [] }, lives = new Set();
  const modern = Boolean(ctx.listener.positionX);
  /** Where the listener was at second t of an offline render (the last one put at or before it), else where it is. */
  const posAt = (t) => {
    if (t == null || !L.track.length) return L.pos;
    let p = L.track[0].pos; for (const e of L.track) { if (e.t <= t) p = e.pos; else break; }
    return p;
  };
  function listener(pos, dir = [0, 0, -1], at) {
    const l = ctx.listener, t = at ?? ctx.currentTime, p = [...pos];
    if (at != null) { L.track.push({ t: at, pos: p }); L.track.sort((a, b) => a.t - b.t); } else L.pos = p;
    if (modern) {
      l.positionX.setValueAtTime(p[0], t); l.positionY.setValueAtTime(p[1], t); l.positionZ.setValueAtTime(p[2], t);
      l.forwardX.setValueAtTime(dir[0], t); l.forwardY.setValueAtTime(dir[1], t); l.forwardZ.setValueAtTime(dir[2], t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else if (at == null) { l.setPosition(...p); l.setOrientation(dir[0], dir[1], dir[2], 0, 1, 0); }
    for (const v of lives) {
      const d = Math.hypot(v.pos[0] - p[0], v.pos[1] - p[1], v.pos[2] - p[2]);
      if (at != null) { v.air.frequency.setValueAtTime(airOf(d), t); v.wet?.gain.setValueAtTime(v.share * shareOf(d), t); }
      else { v.air.frequency.setTargetAtTime(airOf(d), t, 0.08); v.wet?.gain.setTargetAtTime(v.share * shareOf(d), t, 0.1); }
    }
  }
  const distance = (pos, from = L.pos) => (from ? Math.hypot(pos[0] - from[0], pos[1] - from[1], pos[2] - from[2]) : Math.hypot(pos[0], pos[1], pos[2]));
  function make(o = {}, bus = defaultBus) {
    const g = ctx.createGain(); g.gain.value = o.gain ?? o.vol ?? 1;
    const nodes = [g]; let tail = g, d = 0, air = null;
    const occ = Math.min(1, Math.max(0, Number(o.occlude) || 0));
    if (occ > 0) {           // through a grate or a wall: the top goes, the body stays a little lower
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000 * (650 / 18000) ** occ; f.Q.value = 0.5;
      const k = ctx.createGain(); k.gain.value = 1 - 0.45 * occ;
      tail.connect(f); f.connect(k); tail = k; nodes.push(f, k);
    }
    if (o.pos) {
      d = distance(o.pos, posAt(o.at));
      if (d > 5 || o.live) {           // air takes the top off a far sound
        air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = airOf(d); air.Q.value = 0.4;
        tail.connect(air); tail = air; nodes.push(air);
      }
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 2; p.maxDistance = 120; p.rolloffFactor = o.rolloff ?? rolloff;
      if (p.positionX) { p.positionX.value = o.pos[0]; p.positionY.value = o.pos[1]; p.positionZ.value = o.pos[2]; } else p.setPosition(...o.pos);
      tail.connect(p); tail = p; nodes.push(p);
    }
    tail.connect(bus);
    // the room's share grows with distance (the far sound is mostly the room), and is smaller behind something
    const base = (o.wet ?? 1) * space.wetOf(o.room) * (1 - 0.5 * occ), share = base * shareOf(d);
    let wet = null;
    if (share > 0.001 || (o.live && base > 0.001)) { wet = ctx.createGain(); wet.gain.value = share; tail.connect(wet).connect(space.input(o.room)); nodes.push(wet); }
    const live = o.live && o.pos && air ? { pos: o.pos, air, wet, share: base } : null;
    if (live) lives.add(live);
    return { g, dest: { node: g, spatial: Boolean(o.pos) }, free: () => { if (live) lives.delete(live); for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } } };
  }
  make.listener = listener; make.distance = distance; make.live = () => lives.size;
  return make;
}
