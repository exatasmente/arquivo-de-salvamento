// The recorded voices of the game (assets/audio/n1/<id>.mp3), played through the WebAudio graph. Jonas is heard as he is (he speaks into the
// microphone); every other voice comes out of a radio: a band-pass, a little drive and a hiss under it. The recording of the dam (the voice of
// the message) is heavier still, like a tape. Listening to a line that is not loaded yet starts it when it arrives.
//
//   const voices = createVoices(ctx, { destination, durations, duck });   // duck({ at, dur }): called when a line starts, so the effects sit under it
//   voices.play('02', { gain: 0.9, filter: 'radio' | 'none' | 'tape', from: 2.15 }) -> { stop() }
//   voices.preload(['02', '03']); voices.names (VOICE_NAMES: the ids that exist)
//   voices.play('02', { spot: [x, y, z] })   the line comes out of a place (the station's radio across the room: it has its direction, its distance and the room's reverb)
//   voices.setNear(0..1)                     how close the listener is to that place: 1 is at the bench, the lines in front of him, centred and dry; 0 is where it stands
// The output goes to opts.destination (the page's mute works on it), never straight to ctx.destination.
/** A line from across the room is a little louder than the distance alone would make it (the player has to follow it: the captions are the only other help). */
const FAR = 1.5;
export const VOICE_FILTERS = ['radio', 'none', 'tape'];
const BASE = new URL('../../assets/audio/n1/', import.meta.url).href;

export function createVoices(ctx, { destination = null, durations = {}, volume = 1, duck = null, spatial = null } = {}) {
  const out = ctx.createGain(); out.gain.value = volume; out.connect(destination ?? ctx.destination);
  const spots = new Set(); let vol = volume, near = 0;
  const blend = (k, tc, sp) => { const c = Math.sin(k * Math.PI / 2), f = Math.cos(k * Math.PI / 2), t = ctx.currentTime; sp.close.gain.setTargetAtTime(c, t, tc); sp.far.gain.setTargetAtTime(f, t, tc); };
  const buffers = new Map(), loading = new Map();
  const names = Object.keys(durations);
  let hissBuf = null;
  const hiss = () => {
    if (hissBuf) return hissBuf;
    const n = Math.floor(ctx.sampleRate * 2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let a = 12345;
    for (let i = 0; i < n; i++) { a = (a * 1664525 + 1013904223) >>> 0; d[i] = (a / 4294967296) * 2 - 1; }
    return (hissBuf = b);
  };
  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (!loading.has(id)) {
      loading.set(id, fetch(`${BASE}${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${id}: ${r.status}`)))).then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
        .then((b) => { buffers.set(id, b); return b; }).catch((e) => { console.info('voice not loaded:', id, e?.message ?? e); buffers.set(id, null); return null; }));
    }
    return loading.get(id);
  }
  function chain(filter, tail) {
    if (filter === 'none') return tail;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = filter === 'tape' ? 500 : 380;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filter === 'tape' ? 2400 : 3300;
    const sh = ctx.createWaveShaper(), curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * (filter === 'tape' ? 3.2 : 2.2)); }
    sh.curve = curve;
    hp.connect(lp); lp.connect(sh); sh.connect(tail);
    return hp;
  }
  function play(id, { gain, vol: level, filter = 'radio', from = 0, to = null, at = null, spot = null } = {}) {
    const g = ctx.createGain(); g.gain.value = gain ?? level ?? 1;
    // out of a place: the voice goes both ways, close (centred, at the volume) and far (a voice of the room, panned and dimmed by where it stands), and `near` says how much of each
    let sp = null;
    if (spot && spatial) {
      const v = spatial({ pos: spot, live: true, rolloff: 0.45, wet: 0.7, gain: 1 }), close = ctx.createGain(), far = ctx.createGain(), fv = ctx.createGain();
      fv.gain.value = vol * FAR; g.connect(close); close.connect(out); g.connect(far); far.connect(fv); fv.connect(v.g);
      close.gain.value = Math.sin(near * Math.PI / 2); far.gain.value = Math.cos(near * Math.PI / 2);
      sp = { v, close, far, fv }; spots.add(sp);
    } else g.connect(out);
    const h = { id, stopped: false, src: null, hissSrc: null, stop() { if (h.stopped) return; h.stopped = true; try { h.src?.stop(); h.hissSrc?.stop(); } catch { /* not started */ } try { g.disconnect(); } catch { /* gone */ } if (sp) { spots.delete(sp); setTimeout(sp.v.free, 400); } } };
    load(id).then((buf) => {
      if (h.stopped || !buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(chain(filter, g));
      const when = at ?? ctx.currentTime + 0.01, len = to != null ? Math.max(0, to - from) : undefined;
      src.start(when, from, len); h.src = src;
      if (sp) src.onended = () => setTimeout(() => h.stop(), 600);          // the line is over: its place in the room is let go
      duck?.({ at: when, dur: len ?? buf.duration - from });                      // the effects go down under the line (audio.duck)
      if (filter !== 'none') {
        const hs = ctx.createBufferSource(); hs.buffer = hiss(); hs.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
        const hg = ctx.createGain(); hg.gain.value = filter === 'tape' ? 0.06 : 0.025;
        hs.connect(bp); bp.connect(hg); hg.connect(g); hs.start(when); hs.stop(when + (len ?? buf.duration - from) + 0.05); h.hissSrc = hs;
      }
    });
    return h;
  }
  /** Where the listener is in relation to the place the lines come from: 1 is right at it (close, centred, dry), 0 far; the change takes about a quarter of a second. */
  function setNear(k) { near = Math.max(0, Math.min(1, k)); for (const sp of spots) blend(near, 0.12, sp); }
  return { play, preload: (ids) => Promise.all(ids.map(load)), load, names, VOICE_NAMES: names, setNear, get near() { return near; }, get spots() { return spots.size; }, setVolume(v) { vol = v; out.gain.value = v; for (const sp of spots) sp.fv.gain.value = v * FAR; } };
}
