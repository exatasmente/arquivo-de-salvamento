// Synthesis kit: filtered noise bursts and oscillator tones with envelopes, all wired into one
// destination node (the voice). Every function takes absolute context times.

/**
 * Gain envelope. Percussive by default (fast attack, exponential decay). With `sus` (a release
 * time in seconds) it holds the peak and ramps to zero over the last `sus` seconds.
 */
function envelope(g, t, dur, peak, att, sus) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + att);
  if (sus) { g.setValueAtTime(peak, Math.max(t + att, t + dur - sus)); g.linearRampToValueAtTime(0.0001, t + dur); }
  else g.exponentialRampToValueAtTime(0.0001, t + dur);
}

export function makeKit(A, dest) {
  const ctx = A.ctx;
  const outTo = (node, o) => {
    let n = node;
    if (o.pan && !dest.spatial) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(dest.node);
  };
  return {
    ctx,
    /** Oscillator. o: type, f0, f1 (sweep), g, att, sus, lp, hp, pan, fm {depth, ratio}, vib {rate, depth}. */
    tone(t, dur, o = {}) {
      const { type = 'sine', f0 = 200, f1 = f0, g = 0.3, att = 0.003, sus = 0 } = o;
      if (Math.max(f0, f1) > ctx.sampleRate * 0.45) return null; // above what this context can carry (and past the era band)
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + (o.fdur ?? dur));
      const a = ctx.createGain(); envelope(a.gain, t, dur, g, att, sus);
      let n = osc;
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.lpq ?? 0.7; n.connect(f); n = f; }
      if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; n.connect(f); n = f; }
      const extra = [];
      if (o.am) { // amplitude gating at `rate` Hz, depth 0..1 (bell hammers, flutter)
        const ag = ctx.createGain(); ag.gain.value = 1 - o.am.depth;
        const m = ctx.createOscillator(), mg = ctx.createGain(); m.type = o.am.type ?? 'sine'; m.frequency.value = o.am.rate; mg.gain.value = o.am.depth;
        m.connect(mg).connect(ag.gain); n.connect(ag); n = ag; extra.push(m);
      }
      n.connect(a); outTo(a, o);
      if (o.fm) {
        const m = ctx.createOscillator(), mg = ctx.createGain();
        m.frequency.value = f0 * (o.fm.ratio ?? 3.5); mg.gain.setValueAtTime(o.fm.depth, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
        m.connect(mg).connect(osc.frequency); extra.push(m);
      }
      if (o.vib) {
        const m = ctx.createOscillator(), mg = ctx.createGain();
        m.frequency.value = o.vib.rate; mg.gain.value = o.vib.depth; m.connect(mg).connect(osc.frequency); extra.push(m);
      }
      osc.start(t); osc.stop(t + dur + 0.05);
      for (const m of extra) { m.start(t); m.stop(t + dur + 0.05); }
      return osc;
    },
    /** Filtered noise. o: kind (white|pink|brown), type, f0, f1, q, g, att, sus, off, pan. */
    noise(t, dur, o = {}) {
      const { kind = 'white', type = 'lowpass', f0 = 1000, f1 = f0, q = 1, g = 0.3, att = 0.003, sus = 0 } = o;
      const buf = A.noise(kind), s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const a = ctx.createGain(); envelope(a.gain, t, dur, g, att, sus);
      let n = f;
      const extra = [];
      if (o.am) { // amplitude flutter: depth 0..1 at `rate` Hz (paper, rough breath)
        const ag = ctx.createGain(); ag.gain.value = 1 - o.am.depth;
        const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = o.am.rate; mg.gain.value = o.am.depth;
        m.connect(mg).connect(ag.gain); f.connect(ag); n = ag; extra.push(m);
      }
      s.connect(f); n.connect(a); outTo(a, o);
      s.start(t, ((o.off ?? 0) % 1) * buf.duration); s.stop(t + dur + 0.05);
      for (const m of extra) { m.start(t); m.stop(t + dur + 0.05); }
      return s;
    },
    /** A few ms of broadband tick (switches, clicks). */
    tick(t, o = {}) {
      return this.noise(t, o.dur ?? 0.012, { type: 'highpass', f0: o.f0 ?? 2500, q: 0.7, g: o.g ?? 0.3, att: 0.0008, off: o.off ?? 0, pan: o.pan });
    },
    /** Inharmonic metal partials struck at once (bells, coins, nozzle clanks). */
    metal(t, base, partials, o = {}) {
      for (const [ratio, g, d] of partials) this.tone(t + (o.delay ?? 0), d * (o.decay ?? 1), { f0: base * ratio, f1: base * ratio * 0.998, g: g * (o.g ?? 1), att: 0.0008, pan: o.pan });
    },
  };
}
