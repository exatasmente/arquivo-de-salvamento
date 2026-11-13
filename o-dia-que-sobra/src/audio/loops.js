// Continuous sounds. Each is fn(L): L is the loop context made by index.js:
//   L.ctx, L.out (GainNode that feeds the loop's gain/position), L.r (seeded random), L.st (live state,
//   changed with loop.set(key, value)), L.spatial (true when positioned: the HRTF panner mixes to mono),
//   L.osc(type, f), L.src(kind, off), L.lfo(type, f, depth, param), L.every(fn(to, ok)), L.K (kit),
//   L.onSanity(fn(v)).
// Oscillators and noise sources never stop by themselves: the loop is a graph, not a buffer, so
// there is no loop point. The only buffers are the shared noise ones, cross-faded at the seam.
import { curveOf, pick, vary } from './util.js';
import { ONESHOTS } from './oneshots.js';

const unipolar = curveOf((x) => (x + 1) / 2, 3);          // -1..1 -> 0..1
const narrowPulse = curveOf((x) => (x > 0.86 ? 1 : 0), 257); // a saw -> a short pulse once per cycle
const gateSlow = (open) => curveOf((x) => Math.min(1, Math.max(0, (x - open) * 4)), 513);

function shaper(ctx, curve) { const s = ctx.createWaveShaper(); s.curve = curve; return s; }
function gain(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function filt(ctx, type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

export const LOOPS = {
  // Fluorescent tubes: 60 Hz mains hum with harmonics (the 120 Hz of the ballast is the strongest),
  // a buzz that follows it, a thin whine, and now and then a flicker with a crackle.
  fluorescente(L) {
    const { ctx, r } = L, mul = gain(ctx, 1), humBus = gain(ctx, 1);
    humBus.connect(mul).connect(L.out);
    const oscs = [];
    for (const [f, g] of [[60, 0.5], [120, 0.72], [180, 0.34], [240, 0.22], [300, 0.12], [420, 0.07]]) {
      const o = L.osc('sine', f * (1 + (r() - 0.5) * 0.0008)); oscs.push(o); o.connect(gain(ctx, g * 0.1)).connect(humBus);
    }
    L.lfo('sine', 0.23, 0.05, humBus.gain);
    const buzz = L.src('white', r()), bp = filt(ctx, 'bandpass', 2600, 1.4), bg = gain(ctx, 0.008);
    L.lfo('sine', 120, 0.007, bg.gain); buzz.connect(bp).connect(bg).connect(mul);
    L.osc('sine', 7100 * vary(r, 0.04)).connect(gain(ctx, 0.0025)).connect(mul);
    L.onSanity((v) => { // 79-60: louder; below, it also drifts flat
      const up = v >= 80 ? 1 : 1 + Math.min(1.2, (80 - v) / 50);
      mul.gain.setTargetAtTime(up, ctx.currentTime, 0.6);
      const cents = v >= 60 ? 0 : -((60 - v) / 60) * 45;
      for (const o of oscs) o.detune.setTargetAtTime(cents, ctx.currentTime, 1);
    });
    let cursor = L.t0 + 2 + r() * 4;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor, flicker = r() < 0.5;
        if (ok(t)) {
          L.K.tick(t, { f0: 2800, g: 0.22 }); L.K.tick(t + 0.012 + r() * 0.02, { f0: 2200, g: 0.1 });
          if (flicker) { humBus.gain.setValueAtTime(1, t); humBus.gain.linearRampToValueAtTime(0.25, t + 0.02); humBus.gain.linearRampToValueAtTime(1, t + 0.09 + r() * 0.1); }
        }
        cursor += 4 + r() * 11;
      }
    });
  },

  // Highway far away: a low roar that never stops, and cars going by in the order the seed says.
  // Without a position, each car crosses the stereo field; with a position the whole stream is one point.
  rodovia(L) {
    const { ctx, r } = L;
    const bed = L.src('brown', r()), lp = filt(ctx, 'lowpass', 200, 0.6);
    bed.connect(lp).connect(gain(ctx, 0.2)).connect(L.out);
    const roll = L.src('pink', r()), rb = filt(ctx, 'bandpass', 650, 0.5); roll.connect(rb).connect(gain(ctx, 0.012)).connect(L.out);
    let cursor = L.t0 + 0.5 + r() * 3;
    L.every((to, ok) => {
      while (cursor < to) {
        const truck = r() < 0.18, d = (truck ? 6 : 3.2) + r() * 2.5, dirn = r() < 0.5 ? -1 : 1, level = (truck ? 0.2 : 0.11) * (0.7 + r() * 0.5), off = r(), t = cursor;
        if (ok(t)) {
          const src = ctx.createBufferSource(); src.buffer = L.A.noise('pink'); src.loop = true;
          const f = filt(ctx, 'bandpass', truck ? 170 : 300, 1.1), a = gain(ctx, 0.0001); a.gain.setValueAtTime(0.0001, t);
          f.frequency.setValueAtTime(truck ? 150 : 260, t); f.frequency.linearRampToValueAtTime(truck ? 230 : 520, t + d * 0.5); f.frequency.linearRampToValueAtTime(truck ? 140 : 240, t + d); // approach, pass, recede
          a.gain.linearRampToValueAtTime(level, t + d * 0.5); a.gain.linearRampToValueAtTime(0.0001, t + d);
          const e = ctx.createOscillator(), eg = gain(ctx, 0.0001), ef = filt(ctx, 'lowpass', 320); eg.gain.setValueAtTime(0.0001, t);
          e.type = 'sawtooth'; const base = truck ? 52 : 88; e.frequency.setValueAtTime(base * 1.07, t); e.frequency.linearRampToValueAtTime(base * 0.93, t + d);
          eg.gain.linearRampToValueAtTime(level * 0.55, t + d * 0.5); eg.gain.linearRampToValueAtTime(0.0001, t + d);
          let tail = a, tail2 = eg;
          if (!L.spatial) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.7 * dirn, t); p.pan.linearRampToValueAtTime(0.7 * dirn, t + d); a.connect(p); eg.connect(p); tail = p; tail2 = null; }
          src.connect(f).connect(a); e.connect(ef).connect(eg);
          tail.connect(L.out); if (tail2) tail2.connect(L.out);
          src.start(t, off * 3); e.start(t); src.stop(t + d + 0.1); e.stop(t + d + 0.1);
        }
        cursor += 2.5 + r() * 9 * (r() < 0.25 ? 2 : 1);
      }
    });
  },

  // Night insects: five crickets, each a tone chopped in trills that start and stop on their own
  // slow rhythm, over a faint hiss of dry grass.
  insetos(L) {
    const { ctx, r } = L;
    for (let i = 0; i < 5; i++) {
      const f = 3900 + i * 420 + r() * 140, o = L.osc('sine', f);
      const pulse = L.osc('square', 24 + r() * 8), ps = shaper(ctx, unipolar), soft = filt(ctx, 'lowpass', 170, 0.5); pulse.connect(ps).connect(soft);
      const chop = gain(ctx, 0); soft.connect(chop.gain);
      const slow = L.osc('sine', 0.28 + r() * 0.5), gs = shaper(ctx, gateSlow(0.05)); slow.connect(gs);
      const gate = gain(ctx, 0); gs.connect(gate.gain);
      o.connect(chop).connect(gate).connect(gain(ctx, 0.016 + r() * 0.006)).connect(L.out);
    }
    const grass = L.src('white', r()); grass.connect(filt(ctx, 'highpass', 5200)).connect(gain(ctx, 0.004)).connect(L.out);
  },

  // Wind: a wandering band of pink noise with two slow gusts, a low rumble and a whistle in the gaps.
  vento(L) {
    const { ctx, r } = L;
    const w = L.src('pink', r()), bp = filt(ctx, 'bandpass', 380, 0.6), swell = gain(ctx, 0.75);
    L.lfo('sine', 0.071 + r() * 0.02, 160, bp.frequency); L.lfo('sine', 0.13 + r() * 0.03, 90, bp.frequency);
    L.lfo('sine', 0.052, 0.2, swell.gain);
    w.connect(bp).connect(swell).connect(gain(ctx, 0.55)).connect(L.out);
    L.src('brown', r()).connect(filt(ctx, 'lowpass', 110)).connect(gain(ctx, 0.18)).connect(L.out);
    const wh = L.osc('sine', 530), wg = gain(ctx, 0), ws = shaper(ctx, gateSlow(0.45)), gl = L.osc('sine', 0.037 + r() * 0.01);
    gl.connect(ws).connect(wg.gain); L.lfo('sine', 0.17, 70, wh.frequency); wh.connect(wg).connect(gain(ctx, 0.0045)).connect(L.out);
  },

  // Refrigerator: compressor hum with a cabinet buzz; it cycles off for 10-20 s with a relay click
  // and a shudder, then comes on again.
  geladeira(L) {
    const { ctx, r } = L, run = gain(ctx, 1);
    const s = L.osc('sawtooth', 55), lp = filt(ctx, 'lowpass', 230); s.connect(lp).connect(gain(ctx, 0.15)).connect(run);
    L.osc('sine', 110).connect(gain(ctx, 0.06)).connect(run);
    L.src('brown', r()).connect(filt(ctx, 'bandpass', 130, 3)).connect(gain(ctx, 0.5)).connect(run);
    const rat = L.osc('sine', 165.3); rat.connect(gain(ctx, 0.014)).connect(run); // a loose panel
    run.connect(L.out);
    let on = true, cursor = L.t0 + 14 + r() * 20;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor;
        if (ok(t)) {
          if (on) { run.gain.setValueAtTime(1, t); run.gain.linearRampToValueAtTime(0.0, t + 1.4); L.K.tick(t, { f0: 900, g: 0.25 }); L.K.tone(t, 0.08, { f0: 90, f1: 60, g: 0.25 }); }
          else { run.gain.setValueAtTime(0, t); run.gain.linearRampToValueAtTime(1, t + 1.1); L.K.tick(t, { f0: 800, g: 0.3 }); L.K.tone(t, 0.12, { f0: 80, f1: 50, g: 0.35 }); L.K.noise(t, 0.4, { kind: 'brown', f0: 200, g: 0.15, att: 0.05 }); }
        }
        on = !on; cursor += on ? 25 + r() * 25 : 10 + r() * 10;
      }
    });
  },

  // Car engine at idle: firing pulses near 26 Hz that hunt a little, a block thump, valve ticks.
  // set('rpm', x): multiplier on the idle (1 = idle, 2 = revving).
  motor_carro(L) {
    const { ctx, r } = L, st = L.st; st.rpm ??= 1;
    const o1 = L.osc('sawtooth', 26), o2 = L.osc('square', 13), mixF = filt(ctx, 'lowpass', 280, 0.9);
    const sh = shaper(ctx, curveOf((x) => Math.tanh(x * 2.2), 513)), pre = gain(ctx, 0.5);
    o1.connect(pre); o2.connect(gain(ctx, 0.4)).connect(pre); pre.connect(sh).connect(mixF).connect(gain(ctx, 0.2)).connect(L.out);
    L.lfo('sine', 0.34, 0.7, o1.frequency); L.lfo('sine', 2.3 + r(), 0.35, o1.frequency); L.lfo('sine', 0.34, 0.35, o2.frequency);
    L.osc('sine', 40).connect(gain(ctx, 0.07)).connect(L.out);
    L.src('pink', r()).connect(filt(ctx, 'lowpass', 520)).connect(gain(ctx, 0.12)).connect(L.out);
    const tk = L.src('white', r()), tg = gain(ctx, 0), tb = L.osc('square', 13), ts = shaper(ctx, unipolar);
    tb.connect(ts).connect(tg.gain); L.lfo('sine', 0.34, 0.9, tb.frequency); tk.connect(filt(ctx, 'bandpass', 2300, 1.5)).connect(tg).connect(gain(ctx, 0.01)).connect(L.out);
    L.onSet((k, v) => {
      if (k !== 'rpm') return; const x = Math.max(0.6, Math.min(4, v)), now = ctx.currentTime;
      o1.frequency.setTargetAtTime(26 * x, now, 0.25); o2.frequency.setTargetAtTime(13 * x, now, 0.25); tb.frequency.setTargetAtTime(13 * x, now, 0.25);
      mixF.frequency.setTargetAtTime(280 + 220 * (x - 1), now, 0.25);
    });
  },

  // The pump running while the nozzle is held: motor whine, fuel flowing, and the register counting
  // with mechanical ticks. set('rate', x): flow, 1 = normal (ticks follow it).
  bomba_corre(L) {
    const { ctx, r } = L, st = L.st; st.rate ??= 1;
    const m = L.osc('sawtooth', 47), mf = filt(ctx, 'lowpass', 320, 1);
    m.connect(mf).connect(gain(ctx, 0.12)).connect(L.out); L.osc('sine', 94).connect(gain(ctx, 0.05)).connect(L.out); L.osc('sine', 141.5).connect(gain(ctx, 0.015)).connect(L.out);
    L.lfo('sine', 0.4, 0.8, m.frequency);
    const fl = L.src('pink', r()), fb = filt(ctx, 'bandpass', 900, 0.8), fg = gain(ctx, 0.6);
    L.lfo('sine', 0.7, 0.2, fg.gain); fl.connect(fb).connect(fg).connect(gain(ctx, 0.07)).connect(L.out);
    const saw = L.osc('sawtooth', 11), ps = shaper(ctx, narrowPulse); saw.connect(ps);
    L.lfo('sine', 0.9, 0.5, saw.frequency);
    const cn = L.src('white', r()), cg = gain(ctx, 0); ps.connect(cg.gain); cn.connect(filt(ctx, 'bandpass', 2400, 2)).connect(cg).connect(gain(ctx, 0.28)).connect(L.out);
    const ct = L.osc('sine', 760), cg2 = gain(ctx, 0); ps.connect(cg2.gain); ct.connect(cg2).connect(gain(ctx, 0.05)).connect(L.out);
    L.onSet((k, v) => {
      if (k !== 'rate') return; const x = Math.max(0.3, Math.min(3, v)), now = ctx.currentTime;
      saw.frequency.setTargetAtTime(11 * x, now, 0.2); m.frequency.setTargetAtTime(47 * (0.9 + 0.1 * x), now, 0.3); mf.frequency.setTargetAtTime(240 + 80 * x, now, 0.3);
    });
  },

  // Rain: a wash of noise, patter of drops as two uneven pulse trains, drumming on the canopy.
  chuva(L) {
    const { ctx, r } = L;
    L.src('white', r()).connect(filt(ctx, 'highpass', 900)).connect(filt(ctx, 'lowpass', 7200)).connect(gain(ctx, 0.07)).connect(L.out);
    L.src('pink', r()).connect(filt(ctx, 'bandpass', 2400, 0.4)).connect(gain(ctx, 0.07)).connect(L.out);
    for (const [fq, fc, g] of [[23, 3600, 0.09], [31, 5200, 0.06], [17, 2500, 0.07]]) {
      const saw = L.osc('sawtooth', fq * vary(r, 0.1)), ps = shaper(ctx, narrowPulse), gg = gain(ctx, 0), n = L.src('white', r());
      saw.connect(ps).connect(gg.gain); L.lfo('sine', 0.7 + r() * 1.5, fq * 0.4, saw.frequency);
      n.connect(filt(ctx, 'bandpass', fc, 5)).connect(gg).connect(gain(ctx, g)).connect(L.out);
    }
    const dr = L.osc('sawtooth', 9.5), dps = shaper(ctx, narrowPulse), dg = gain(ctx, 0), dn = L.src('pink', r());
    dr.connect(dps).connect(dg.gain); L.lfo('sine', 1.3, 3, dr.frequency); dn.connect(filt(ctx, 'bandpass', 620, 4)).connect(dg).connect(gain(ctx, 0.09)).connect(L.out);
  },

  // The phone ringing again and again until someone answers: two rings, a long pause.
  telefone_toca(L) {
    const { r } = L; let cursor = L.t0;
    L.every((to, ok) => {
      while (cursor < to) {
        if (ok(cursor)) ONESHOTS.telefone_toca({ K: L.K, t: cursor, r, o: { rings: 2 } });
        cursor += 5.4;
      }
    });
  },

  // Video static, held. Slow roll bar.
  estatica_camera(L) {
    const { ctx, r } = L;
    const a = L.src('white', r()), bp = filt(ctx, 'bandpass', 2800, 0.45), roll = gain(ctx, 0.8);
    L.lfo('sine', 0.55, 0.2, roll.gain); a.connect(bp).connect(roll).connect(gain(ctx, 0.15)).connect(L.out);
    L.src('white', r()).connect(filt(ctx, 'highpass', 4500)).connect(gain(ctx, 0.04)).connect(L.out);
    L.osc('sine', 60).connect(gain(ctx, 0.03)).connect(L.out);
    L.osc('sine', 120).connect(gain(ctx, 0.015)).connect(L.out);
  },

  // Breathing as a loop. set('intensity', 0..1) changes the pace and force from breath to breath.
  respiracao(L) {
    const { r } = L, st = L.st; st.intensity ??= 0.3; let cursor = L.t0;
    L.every((to, ok) => {
      while (cursor < to) {
        const o = { intensity: st.intensity }; let d = 1;
        if (ok(cursor)) d = ONESHOTS.respiracao({ K: L.K, t: cursor, r, o }); else r();
        cursor += d;
      }
    });
  },

  // Heartbeat as a loop (one lub-dub at a time). set('intensity', 0..1) speeds and strengthens it.
  coracao(L) {
    const { r } = L, st = L.st; st.intensity ??= 0.3; let cursor = L.t0;
    L.every((to, ok) => {
      while (cursor < to) {
        const k = st.intensity, T = 60 / (62 + 88 * k);
        if (ok(cursor)) ONESHOTS.coracao({ K: L.K, t: cursor, r, o: { intensity: k, beats: 1 } });
        cursor += T;
      }
    });
  },

  // The Sun is here. Two sub tones beating at 2.6 Hz, a paper hiss, and every so often the ghost of
  // the 1998 jingle: a music-box phrase that sags flat and stops before its last note.
  sol_presenca(L) {
    const { ctx, r } = L, mix = gain(ctx, 1);
    mix.connect(L.out);
    const a = L.osc('sine', 47), b = L.osc('sine', 49.6), c = L.osc('sine', 94.3), d = L.osc('sine', 99.1);
    a.connect(gain(ctx, 0.2)).connect(mix); b.connect(gain(ctx, 0.18)).connect(mix); c.connect(gain(ctx, 0.05)).connect(mix); d.connect(gain(ctx, 0.045)).connect(mix);
    L.lfo('sine', 0.07, 1.1, a.frequency);
    const air = L.src('pink', r()), ab = filt(ctx, 'bandpass', 1900, 6), ag = gain(ctx, 0.3);
    L.lfo('sine', 0.09, 0.25, ag.gain); air.connect(ab).connect(ag).connect(gain(ctx, 0.016)).connect(mix);
    let cursor = L.t0 + 6 + r() * 6;
    L.every((to, ok) => {
      while (cursor < to) {
        const t = cursor, notes = [587.33, 739.99, 880, 987.77], n = 3 + pick(r, 1), sag = 0.012 + r() * 0.01, step = 0.62 + r() * 0.1, rustle = r() < 0.6;
        if (ok(t)) {
          for (let i = 0; i < n; i++) {
            const f = notes[i] * (1 - sag * i * i), ti = t + i * step * (1 + i * 0.1);
            const last = i === n - 1;
            L.K.tone(ti, last ? 0.5 : 1.0, { f0: f, f1: f * (1 - 0.03 * (i + 1)), g: 0.05 / (1 + i * 0.15), att: 0.03, lp: 1800, vib: { rate: 5.2, depth: f * 0.012 } });
            L.K.tone(ti, last ? 0.3 : 0.5, { f0: f * 2.76, f1: f * 2.7, g: 0.012, att: 0.005, lp: 3200 });
          }
          if (rustle) L.K.noise(t + n * step * 1.15, 0.35, { type: 'bandpass', f0: 3100, q: 3, g: 0.025, att: 0.1, off: r() });
        } else for (let i = 0; i < 4; i++) r();
        cursor += 14 + r() * 16;
      }
    });
  },
};
export const LOOP_NAMES = Object.keys(LOOPS);
