// The recorded voices of the game (assets/audio/n1/<id>.mp3), played through the WebAudio graph. Jonas is heard as he is (he speaks into the
// microphone); every other voice comes out of a radio: a band-pass, a little drive and a hiss under it. The recording of the dam (the voice of
// the message) is heavier still, like a tape. Listening to a line that is not loaded yet starts it when it arrives.
//
//   const voices = createVoices(ctx, { destination, durations });
//   voices.play('02', { gain: 0.9, filter: 'radio' | 'none' | 'tape', from: 2.15 }) -> { stop() }
//   voices.preload(['02', '03']); voices.names (VOICE_NAMES: the ids that exist)
// The output goes to opts.destination (the page's mute works on it), never straight to ctx.destination.
export const VOICE_FILTERS = ['radio', 'none', 'tape'];
const BASE = new URL('../../assets/audio/n1/', import.meta.url).href;

export function createVoices(ctx, { destination = null, durations = {}, volume = 1 } = {}) {
  const out = ctx.createGain(); out.gain.value = volume; out.connect(destination ?? ctx.destination);
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
  function play(id, { gain, vol, filter = 'radio', from = 0, to = null, at = null } = {}) {
    const g = ctx.createGain(); g.gain.value = gain ?? vol ?? 1; g.connect(out);
    const h = { id, stopped: false, src: null, hissSrc: null, stop() { if (h.stopped) return; h.stopped = true; try { h.src?.stop(); h.hissSrc?.stop(); } catch { /* not started */ } try { g.disconnect(); } catch { /* gone */ } } };
    load(id).then((buf) => {
      if (h.stopped || !buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(chain(filter, g));
      const when = at ?? ctx.currentTime + 0.01, len = to != null ? Math.max(0, to - from) : undefined;
      src.start(when, from, len); h.src = src;
      if (filter !== 'none') {
        const hs = ctx.createBufferSource(); hs.buffer = hiss(); hs.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
        const hg = ctx.createGain(); hg.gain.value = filter === 'tape' ? 0.06 : 0.025;
        hs.connect(bp); bp.connect(hg); hg.connect(g); hs.start(when); hs.stop(when + (len ?? buf.duration - from) + 0.05); h.hissSrc = hs;
      }
    });
    return h;
  }
  return { play, preload: (ids) => Promise.all(ids.map(load)), load, names, VOICE_NAMES: names, setVolume(v) { out.gain.value = v; } };
}
