// Live sound effects for Rinha, synthesized with the Web Audio API in the same era sound as the
// music (cut treble, a short reverb, oscillators and filtered noise). No files, no samples.
// Every effect has 2 to 4 variations, picked from the seed and a per-name counter, so a repeat
// never sounds identical but the same seed and sequence replay the same way.
//
//   const sfx = createSfx(ctx);
//   sfx.resume();                       // from a user gesture
//   sfx.play('soco_queixo');            // zone punches: soco_testa, soco_queixo, soco_tempora, soco_guarda, soco_ar
//   sfx.play('multidao', { intensity: 0.6 });   // continuous; intensity 0 stops it
//   sfx.play('painel_tecla', { key: 7 });
//   sfx.play('fala', { who: 'fole', mood: 'ordena', dur: 2.5, at });   // creature babble (no words)
//   sfx.play('noite', { dur: 30, at });   // loops by dur: noite, drone_zumbido, cela_zumbido
// opts: seed, vol (0..2), delay (s), at (absolute context time, for offline renders), intensity.

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
const hash = (str, n) => { let h = 2166136261 ^ n; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const lerp = (a, b, k) => a + (b - a) * k;

export const SFX_NAMES = ['soco_testa', 'soco_queixo', 'soco_tempora', 'soco_guarda', 'soco_ar', 'esquiva', 'knockdown', 'clarao', 'sino', 'multidao',
  'passo', 'pedra_pegar', 'pedra_lancar', 'drone_chiado', 'taser', 'spray', 'corvo', 'moeda', 'ui_mover', 'ui_ok', 'ui_voltar', 'painel_tecla', 'porta_cela', 'salvar',
  'fala', 'noite', 'geladeira', 'maca_colher', 'maca_cair', 'drone_zumbido', 'cela_zumbido', 'batida_parede', 'golpe_nuca'];

// ---- building blocks ---------------------------------------------------------------------------
/** Percussive gain: fast attack, exponential decay. */
function perc(g, t, att, peak, dur) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function makeKit(ctx, out, rev, noiseBuf) {
  const K = {
    /** Filtered noise burst. f0 -> f1 sweeps the filter. */
    nz(t, dur, { type = 'lowpass', f0 = 1000, f1 = f0, q = 1, g = 0.3, att = 0.003, off = 0, pan = 0, send = 0.15, loop = false } = {}) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const a = ctx.createGain(); perc(a, t, att, g, dur);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      s.connect(f).connect(a).connect(p).connect(out);
      if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; p.connect(sg).connect(rev); }
      s.start(t, off % 1.5); s.stop(t + dur + 0.03);
    },
    /** Oscillator with a pitch sweep f0 -> f1 and a percussive envelope. */
    tn(t, dur, { type = 'sine', f0 = 200, f1 = f0, g = 0.3, att = 0.003, pan = 0, send = 0.15, lp = 0, fm = 0, fmr = 0 } = {}) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const a = ctx.createGain(); perc(a, t, att, g, dur);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      let n = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
      n.connect(a).connect(p).connect(out);
      if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; p.connect(sg).connect(rev); }
      if (fm) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = f0 * (fmr || 3.5); mg.gain.setValueAtTime(fm, t); mg.gain.exponentialRampToValueAtTime(1, t + dur); m.connect(mg).connect(o.frequency); m.start(t); m.stop(t + dur + 0.03); }
      o.start(t); o.stop(t + dur + 0.03);
    },
  };
  return K;
}

// ---- effects ------------------------------------------------------------------------------------
// fx(K, t, r, o): r is a seeded random, o the options. Variation number v = floor(r() * N).
const v = (r, n) => Math.floor(r() * n);
const FX = {
  // Punches: the zone changes the spectrum. testa = hard bone knock (mid), queixo = sharp crack
  // (high) with a quick low body, tempora = deep dull thud with a ringing high whine, guarda =
  // muffled leather slap, ar = a whoosh with no impact.
  soco_testa(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.18;
    K.tn(t, 0.16, { f0: 150 * p, f1: 55, g: 0.7, send: 0.1 });
    K.tn(t, 0.07, { type: 'triangle', f0: 520 * p, f1: 300, g: 0.35, send: 0.05 });
    K.nz(t, 0.09, { type: 'bandpass', f0: 1900 * p, q: 1.2, g: 0.85, off: r() * 9 });
    if (n === 1) K.nz(t + 0.045, 0.07, { type: 'bandpass', f0: 800, q: 2, g: 0.2, off: r() * 9 }); // knock rebound
    if (n === 2) K.tn(t, 0.22, { f0: 95, f1: 45, g: 0.35 });
  },
  soco_queixo(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.2;
    K.nz(t, 0.06, { type: 'highpass', f0: 3200 * p, q: 0.7, g: 0.7, att: 0.001, off: r() * 9, send: 0.08 });
    K.nz(t, 0.14, { type: 'bandpass', f0: 2600 * p, f1: 1500, q: 1.5, g: 0.5, off: r() * 9 });
    K.tn(t, 0.12, { f0: 240 * p, f1: 100, g: 0.4, send: 0.05 });
    if (n === 1) K.tn(t + 0.02, 0.1, { type: 'square', f0: 1900, f1: 900, g: 0.08, lp: 3000 }); // jaw click
    if (n === 2) K.nz(t + 0.05, 0.18, { type: 'bandpass', f0: 3600, q: 4, g: 0.1, off: r() * 9 });
  },
  soco_tempora(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.15;
    K.tn(t, 0.32, { f0: 100 * p, f1: 36, g: 0.85, send: 0.3 });
    K.nz(t, 0.14, { type: 'lowpass', f0: 700, f1: 200, q: 1, g: 0.5, off: r() * 9, send: 0.25 });
    // the whine in the ear after the blow
    K.tn(t + 0.02, 0.9 + n * 0.25, { f0: (3100 + n * 350) * p, f1: (3000 + n * 330) * p, g: 0.09, att: 0.02, send: 0.5 });
    if (n === 2) K.tn(t + 0.03, 0.8, { f0: 4200, f1: 4150, g: 0.04, att: 0.03, send: 0.5 });
  },
  soco_guarda(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.2;
    K.nz(t, 0.12, { type: 'lowpass', f0: 750 * p, f1: 250, q: 0.8, g: 0.7, off: r() * 9, send: 0.08 });
    K.tn(t, 0.1, { f0: 130 * p, f1: 70, g: 0.4, send: 0.05 });
    if (n === 1) K.nz(t + 0.03, 0.08, { type: 'bandpass', f0: 600, q: 1, g: 0.2, off: r() * 9 }); // glove creak
    if (n === 2) K.tn(t, 0.08, { type: 'triangle', f0: 260, f1: 180, g: 0.15, lp: 800 });
  },
  soco_ar(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.25;
    K.nz(t, 0.26 + n * 0.03, { type: 'bandpass', f0: 500 * p, f1: 2800 * p, q: 2.2, g: 0.6, att: 0.07, off: r() * 9, send: 0.12 });
    K.nz(t + 0.1, 0.18, { type: 'bandpass', f0: 2800 * p, f1: 700, q: 2, g: 0.34, att: 0.03, off: r() * 9 });
  },
  esquiva(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.3;
    K.nz(t, 0.2, { type: 'bandpass', f0: (n === 1 ? 900 : 350) * p, f1: (n === 1 ? 300 : 1100) * p, q: 1.3, g: 0.22, att: 0.06, off: r() * 9 });
    if (n === 2) K.tn(t + 0.12, 0.08, { f0: 110, f1: 80, g: 0.12 }); // a foot slides
  },
  knockdown(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.15;
    K.tn(t, 0.7, { f0: 75 * p, f1: 26, g: 0.95, send: 0.35 });
    K.nz(t, 0.35, { type: 'lowpass', f0: 1100, f1: 120, q: 0.8, g: 0.6, off: r() * 9, send: 0.3 });
    K.nz(t, 0.05, { type: 'highpass', f0: 2500, g: 0.3, off: r() * 9 });
    // the ring boards rattle
    for (let k = 0; k < 3 + n; k++) K.tn(t + 0.22 + k * (0.11 + r() * 0.05), 0.12, { f0: 120 - k * 8, f1: 55, g: 0.28 / (k + 1), send: 0.2 });
  },
  clarao(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.1;
    K.nz(t, 0.35, { type: 'highpass', f0: 5000, f1: 2500, q: 0.6, g: 0.45, att: 0.002, off: r() * 9, send: 0.4 });
    K.tn(t, 1.4 + n * 0.3, { f0: 2400 * p, f1: 2300 * p, g: 0.22, att: 0.004, send: 0.6 });
    K.tn(t, 1.0, { f0: 3600 * p, f1: 3550 * p, g: 0.1, att: 0.004, send: 0.6 });
    K.tn(t, 0.25, { f0: 90, f1: 40, g: 0.5 });
  },
  sino(K, t, r, o) {
    // Boxing bell: a metal strike repeated, partials in inexact ratios so it rings like a pan of iron.
    const hits = o.hits ?? (1 + v(r, 3)), base = 1050 * (1 + (r() - 0.5) * 0.1), gap = 0.2 + r() * 0.05;
    for (let h = 0; h < hits; h++) for (const [ratio, g, d] of [[1, 0.3, 1.9], [2.41, 0.18, 1.3], [3.86, 0.1, 0.9], [5.6, 0.06, 0.5]])
      K.tn(t + h * gap, d, { f0: base * ratio, f1: base * ratio * 0.998, g, att: 0.001, send: 0.4 });
    K.nz(t, 0.03, { type: 'highpass', f0: 4000, g: 0.25, off: r() * 9 });
  },
  passo(K, t, r) {
    const n = v(r, 4), p = 1 + (r() - 0.5) * 0.3;
    K.nz(t, 0.09, { type: 'lowpass', f0: (500 + n * 60) * p, f1: 150, q: 0.7, g: 0.32, off: r() * 9, send: 0.12 });
    K.tn(t, 0.08, { f0: 90 * p, f1: 55, g: 0.2, send: 0.05 });
    if (n === 3) K.nz(t + 0.05, 0.05, { type: 'bandpass', f0: 1500, q: 1.5, g: 0.06, off: r() * 9 }); // grit
  },
  pedra_pegar(K, t, r) {
    const n = v(r, 3);
    for (let k = 0; k < 4 + n; k++) K.nz(t + k * (0.03 + r() * 0.04), 0.04, { type: 'bandpass', f0: 2200 + r() * 1800, q: 2.5, g: 0.2, att: 0.002, off: r() * 9, send: 0.1 });
    K.tn(t + 0.18 + n * 0.03, 0.09, { type: 'triangle', f0: 340, f1: 230, g: 0.18, lp: 1200 }); // the stone knocks the palm
  },
  pedra_lancar(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.2;
    K.nz(t, 0.25, { type: 'bandpass', f0: 700 * p, f1: 2400 * p, q: 2, g: 0.28, att: 0.08, off: r() * 9, send: 0.2 });
    K.nz(t + 0.2, 0.3, { type: 'bandpass', f0: 2400 * p, f1: 500, q: 2, g: 0.16, att: 0.01, off: r() * 9, send: 0.25 });
    K.tn(t, 0.14, { f0: 180, f1: 90, g: 0.15 });
    if (n === 2) K.tn(t + 0.05, 0.2, { type: 'triangle', f0: 400, f1: 700, g: 0.04, lp: 1500 });
  },
  drone_chiado(K, t, r) {
    // The transmission hisses, stutters and cuts.
    const n = v(r, 3), dur = 0.9 + n * 0.2;
    let tt = t;
    for (let k = 0; tt < t + dur; k++) {
      const d = 0.04 + r() * 0.1; K.nz(tt, d, { type: 'bandpass', f0: 1800 + r() * 3000, q: 0.8, g: 0.3 * (1 - (tt - t) / dur * 0.5), att: 0.002, off: r() * 9, send: 0.05 });
      if (k % 3 === 0) K.tn(tt, d * 1.5, { type: 'square', f0: 700 + r() * 900, f1: 300 + r() * 300, g: 0.06, lp: 2500 });
      tt += d + r() * 0.07;
    }
    K.nz(t + dur - 0.02, 0.18, { type: 'lowpass', f0: 2500, f1: 120, g: 0.25, send: 0.1 }); // the signal drops
    K.tn(t + dur, 0.2, { f0: 400, f1: 60, g: 0.25 });
  },
  taser(K, t, r) {
    const n = v(r, 3), dur = 0.8 + n * 0.15;
    for (let tt = t, k = 0; tt < t + dur; k++) {
      const d = 0.018 + r() * 0.03; K.nz(tt, d, { type: 'highpass', f0: 2500 + r() * 2500, q: 0.6, g: 0.4, att: 0.001, off: r() * 9, send: 0.05, pan: r() * 0.4 - 0.2 });
      tt += d + (k % 2 ? 0.01 : 0.03 + r() * 0.04);
    }
    K.tn(t, dur, { type: 'sawtooth', f0: 118 + n * 6, f1: 105, g: 0.12, att: 0.01, lp: 1400, send: 0.05 });
    K.tn(t, 0.12, { type: 'square', f0: 2200, f1: 1200, g: 0.08, lp: 3000 });
  },
  spray(K, t, r) {
    const n = v(r, 3), dur = 0.55 + n * 0.15;
    K.nz(t, dur, { type: 'highpass', f0: 3200 + n * 400, f1: 2400, q: 0.6, g: 0.3, att: 0.03, off: r() * 9, send: 0.1 });
    K.nz(t + 0.02, dur, { type: 'bandpass', f0: 6000, q: 0.6, g: 0.1, att: 0.04, off: r() * 9, send: 0.05 });
    K.tn(t, 0.05, { type: 'square', f0: 1200, f1: 800, g: 0.05, lp: 2000 }); // the nozzle clicks
  },
  corvo(K, t, r) {
    // A common crow: a rough caw, sometimes two or three.
    const caws = 1 + v(r, 3), p = 1 + (r() - 0.5) * 0.2;
    for (let k = 0; k < caws; k++) {
      const tt = t + k * (0.38 + r() * 0.08), d = 0.24 + r() * 0.08;
      for (const [f, q, g] of [[1000, 3, 0.28], [1900, 4, 0.12]]) {
        const o = K.ctx.createOscillator(), b = K.ctx.createBiquadFilter(), a = K.ctx.createGain(), am = K.ctx.createOscillator(), ag = K.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(620 * p, tt); o.frequency.linearRampToValueAtTime(430 * p, tt + d);
        b.type = 'bandpass'; b.frequency.value = f * p; b.Q.value = q; am.frequency.value = 90; ag.gain.value = 0.5; am.connect(ag).connect(a.gain);
        a.gain.setValueAtTime(0.0001, tt); a.gain.linearRampToValueAtTime(g, tt + 0.03); a.gain.setValueAtTime(g, tt + d * 0.6); a.gain.linearRampToValueAtTime(0.0001, tt + d);
        o.connect(b).connect(a).connect(K.out); o.start(tt); am.start(tt); o.stop(tt + d + 0.02); am.stop(tt + d + 0.02);
      }
      K.nz(tt, d, { type: 'bandpass', f0: 1500 * p, q: 1.5, g: 0.12, att: 0.02, off: r() * 9 });
    }
  },
  moeda(K, t, r) {
    // Shimmering metal: two bright notes falling, with FM sparkle.
    const n = v(r, 3), pairs = [[2349, 1976], [2093, 1760], [2637, 2093]][n];
    K.tn(t, 0.5, { type: 'sine', f0: pairs[0], g: 0.16, att: 0.001, fm: 900, fmr: 2.76, send: 0.35 });
    K.tn(t + 0.07, 0.8, { type: 'sine', f0: pairs[1], g: 0.18, att: 0.001, fm: 1100, fmr: 2.76, send: 0.4 });
    K.nz(t, 0.02, { type: 'highpass', f0: 6000, g: 0.1 });
  },
  ui_mover(K, t, r) {
    const n = v(r, 3);
    K.tn(t, 0.05, { type: 'square', f0: 520 + n * 40, f1: 480 + n * 40, g: 0.1, lp: 2400, send: 0.05 });
  },
  ui_ok(K, t, r) {
    const n = v(r, 3), base = [440, 392, 494][n];
    K.tn(t, 0.1, { type: 'square', f0: base, g: 0.1, lp: 2600, send: 0.12 });
    K.tn(t + 0.07, 0.22, { type: 'square', f0: base * 1.5, g: 0.1, lp: 2600, send: 0.2 });
  },
  ui_voltar(K, t, r) {
    const n = v(r, 3), base = [392, 349, 440][n];
    K.tn(t, 0.09, { type: 'square', f0: base, g: 0.09, lp: 2200, send: 0.1 });
    K.tn(t + 0.07, 0.2, { type: 'square', f0: base * 0.667, g: 0.09, lp: 2200, send: 0.2 });
  },
  painel_tecla(K, t, r, o) {
    // A keypad: each digit has its own pitch pair, plus a tiny mechanical click.
    const key = o.key ?? v(r, 10), row = Math.floor(((key + 9) % 10) / 3), col = ((key + 9) % 10) % 3;
    const f1 = [690, 770, 850, 930][row] * (1 + (r() - 0.5) * 0.02), f2 = [1190, 1300, 1420][col];
    K.tn(t, 0.09, { f0: f1, g: 0.08, send: 0.05 }); K.tn(t, 0.09, { f0: f2, g: 0.07, send: 0.05 });
    K.nz(t, 0.012, { type: 'bandpass', f0: 3000, q: 2, g: 0.15, att: 0.001, off: r() * 9, send: 0 });
  },
  porta_cela(K, t, r) {
    // A pneumatic door: a hiss, a servo sweep, and a clunk at the end.
    const n = v(r, 3), dur = 0.7 + n * 0.1;
    K.nz(t, 0.3, { type: 'highpass', f0: 2500, q: 0.6, g: 0.25, att: 0.01, off: r() * 9, send: 0.15 });
    K.tn(t + 0.1, dur, { type: 'sawtooth', f0: 180, f1: 520, g: 0.09, att: 0.1, lp: 1500, send: 0.15 });
    K.tn(t + 0.1, dur, { type: 'square', f0: 90, f1: 260, g: 0.04, att: 0.1, lp: 900 });
    K.tn(t + 0.1 + dur, 0.25, { f0: 100, f1: 40, g: 0.55, send: 0.3 });
    K.nz(t + 0.1 + dur, 0.1, { type: 'bandpass', f0: 800, q: 1, g: 0.35, off: r() * 9 });
  },
  salvar(K, t, r) {
    // Memory card: data blips racing up, then a settled chord.
    const n = v(r, 3), base = [523, 587, 466][n];
    for (let k = 0; k < 5; k++) K.tn(t + k * 0.055, 0.07, { type: 'square', f0: base * 2 ** ((k * 2 + (k % 2) * 3) / 12), g: 0.06, lp: 2800, send: 0.1 });
    for (const [i, m] of [[0, 1], [1, 1.25], [2, 1.5]]) K.tn(t + 0.34 + i * 0.05, 0.6, { type: 'triangle', f0: base * m, g: 0.12, att: 0.005, send: 0.35 });
  },
};

// ---- long-form helpers (everything is scheduled up front, so it also works offline) ----------------
/** Gain with a fade in/out across [t, t+dur], connected to out (and optionally the reverb). */
function envGain(K, t, dur, g, fade, { pan = 0, send = 0.1 } = {}) {
  const a = K.ctx.createGain(), p = K.ctx.createStereoPanner(); p.pan.value = pan;
  fade = Math.min(fade, dur / 2);
  a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + fade); a.gain.setValueAtTime(g, Math.max(t + fade, t + dur - fade)); a.gain.linearRampToValueAtTime(0.0001, t + dur);
  a.connect(p).connect(K.out);
  if (send > 0) { const sg = K.ctx.createGain(); sg.gain.value = send; p.connect(sg).connect(K.rev); }
  return a;
}
/** Looping filtered noise for dur seconds. Returns the filter so callers can automate it. */
function bed(K, t, dur, { type = 'bandpass', f = 1000, q = 1, g = 0.1, fade = 0.3, off = 0, pan = 0, send = 0.1 } = {}) {
  const s = K.ctx.createBufferSource(); s.buffer = K.noise; s.loop = true;
  const fl = K.ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  s.connect(fl).connect(envGain(K, t, dur, g, fade, { pan, send }));
  s.start(t, off % 1.5); s.stop(t + dur + 0.05);
  return fl;
}
/** Sustained oscillator for dur seconds. Returns the oscillator so callers can automate frequency. */
function drone(K, t, dur, { type = 'sawtooth', f = 100, g = 0.1, fade = 0.3, lp = 0, pan = 0, send = 0.1, detune = 0 } = {}) {
  const o = K.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  let n = o; if (lp) { const b = K.ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = lp; o.connect(b); n = b; }
  n.connect(envGain(K, t, dur, g, fade, { pan, send }));
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}
/** Random walk on an AudioParam: a new target every `step` seconds around base. */
function wander(param, t, dur, step, base, amt, r) {
  for (let tt = t + step; tt < t + dur; tt += step) param.linearRampToValueAtTime(base * (1 + amt * (r() * 2 - 1)), tt);
}

// ---- creature speech: a wordless babble, like the text blips of an old game ---------------------------
// Each syllable is a glottal-ish sawtooth through three parallel formant filters, with a syllabic
// envelope. Pure synthesis: no samples, no speech models.
const VOICES = {
  casca:     { f0: 310, forms: [[1100, 6, 1], [2600, 8, 0.7], [3800, 8, 0.45]], rate: 7, frac: 0.45, rasp: 58, raspDepth: 0.85, breath: 0.05, click: 0.5, pan: -0.25, g: 0.6 },
  fole:      { f0: 62,  forms: [[300, 4, 1], [720, 4, 0.8], [1250, 3, 0.4]], rate: 2.6, frac: 0.85, rasp: 0, breath: 0.55, hiss: 2600, click: 0, pan: 0.25, g: 0.55 },
  vigia:     { f0: 190, forms: [[620, 7, 1], [1800, 9, 0.8], [2750, 9, 0.5]], rate: 11, frac: 0.5, rasp: 0, breath: 0.04, click: 0.15, steps: [0, 3, 5, 7, 2, 9], pan: 0, g: 0.65 },
  mestre:    { f0: 150, forms: [[500, 6, 1], [1500, 7, 0.7], [2500, 8, 0.4]], rate: 4.8, frac: 0.6, rasp: 0, vib: 6, breath: 0.08, click: 0, pan: 0.1, g: 0.7 },
  instrutor: { f0: 108, forms: [[450, 5, 1], [1150, 6, 0.7], [2400, 7, 0.4]], rate: 3.4, frac: 0.7, rasp: 0, vib: 4, breath: 0.1, click: 0, pan: 0, g: 0.75 },
  apito:     { f0: 88,  forms: [[400, 5, 1], [900, 5, 0.8], [2200, 6, 0.3]], rate: 6, frac: 0.38, rasp: 36, raspDepth: 0.35, breath: 0.06, click: 0.1, pan: 0, g: 0.8, whistle: true },
};
VOICES.juiz = VOICES.apito;
const MOODS = {
  calmo:    { rate: 0.8, pitch: 1.0, frac: 1.1, rasp: 0.6, g: 0.85, contour: (u) => 1.04 - 0.1 * u, jitter: 0.02 },
  negocia:  { rate: 1.0, pitch: 1.0, frac: 1.0, rasp: 1.0, g: 1, contour: (u) => 1 + 0.08 * Math.sin(u * 9) + (u > 0.75 ? (u - 0.75) * 0.9 : 0), jitter: 0.04 },
  ordena:   { rate: 1.1, pitch: 0.9, frac: 0.6, rasp: 1.1, g: 1.2, contour: (u) => 1.06 - 0.22 * u, jitter: 0.02, accent: true },
  ri:       { rate: 1.7, pitch: 1.25, frac: 0.5, rasp: 0.8, g: 1, contour: (u) => 1, jitter: 0.03, bounce: true },
  irritado: { rate: 1.35, pitch: 1.1, frac: 0.7, rasp: 1.6, g: 1.25, contour: (u) => 1 + 0.12 * u, jitter: 0.12 },
};

function syllable(K, t, d, V, P, f0a, f0b, vow, gain, r, pan) {
  const c = K.ctx, o = c.createOscillator(), env = c.createGain(), p = c.createStereoPanner(); p.pan.value = pan;
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f0a, t); o.frequency.linearRampToValueAtTime(f0b, t + d);
  if (V.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = V.vib; lg.gain.value = f0a * 0.025; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + d + 0.03); }
  const att = Math.min(0.02, d * 0.25);
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain, t + att); env.gain.setValueAtTime(gain, t + d * 0.6); env.gain.linearRampToValueAtTime(0.0001, t + d);
  if (V.rasp) { // amplitude broken at a low rate: a dry, rough edge
    const am = c.createOscillator(), ag = c.createGain(); am.type = 'square'; am.frequency.value = V.rasp * (0.9 + r() * 0.2);
    ag.gain.value = (V.raspDepth ?? 0.5) * P.rasp * 0.5; const base = c.createGain(); base.gain.value = 1 - ag.gain.value; o.connect(base);
    const mod = c.createGain(); mod.gain.value = 0; am.connect(ag).connect(mod.gain); o.connect(mod); base.connect(env); mod.connect(env); am.start(t); am.stop(t + d + 0.03);
  } else o.connect(env);
  for (const [f, q, g] of V.forms) {
    const b = c.createBiquadFilter(), fg = c.createGain(); b.type = 'bandpass'; b.Q.value = q; b.frequency.value = f * vow; fg.gain.value = g;
    env.connect(b).connect(fg).connect(p);
  }
  p.connect(K.out); const sg = c.createGain(); sg.gain.value = 0.12; p.connect(sg).connect(K.rev);
  o.start(t); o.stop(t + d + 0.03);
}

// ---- effects added for the no-narration cut -----------------------------------------------------------
Object.assign(FX, {
  /** Creature babble. opts: who (casca|fole|vigia|mestre|apito|instrutor|juiz), dur (s), mood (calmo|negocia|ordena|ri|irritado). */
  fala(K, t, r, o) {
    const V = VOICES[o.who] || VOICES.instrutor, P = MOODS[o.mood] || MOODS.calmo, dur = o.dur ?? 1.5;
    const whistle = V.whistle && o.mood === 'ordena', end = t + dur - (whistle ? 0.3 : 0.02), gBase = V.g * P.g;
    const rate = V.rate * P.rate; let tt = t, i = 0, left = 0, first = false; const total = Math.max(0.1, end - t);
    if (V.hiss) bed(K, t, dur, { type: 'bandpass', f: V.hiss, q: 0.7, g: 0.05 * V.breath, fade: Math.min(0.3, dur / 3), off: r() * 9, send: 0.15 }); // the bellows wheeze
    while (tt < end - 0.03) {
      if (left <= 0) { left = 1 + v(r, 4); first = true; tt += 0.04 + r() * 0.1; if (tt >= end - 0.03) break; } // a word ends: a small pause
      const sd = Math.min(end - tt, (1 / rate) * (0.75 + r() * 0.5)), d = Math.max(0.03, sd * V.frac * P.frac * 1);
      const u = (tt - t) / total;
      let f = V.f0 * P.pitch * P.contour(u) * (1 + (r() * 2 - 1) * P.jitter);
      if (V.steps) f *= 2 ** (V.steps[(i * 5 + v(r, 3)) % V.steps.length] / 24); // number-reading: stepped pitches
      if (P.bounce) f *= i % 2 ? 0.8 : 1.12; // laugh: ha-ha-ha
      const vow = 0.85 + r() * 0.35;
      let gn = gBase * (P.accent && first ? 1.3 : 1) * (P.bounce ? 1 - u * 0.5 : 1) * (0.8 + r() * 0.3);
      syllable(K, tt, d, V, P, f * 1.04, f * 0.94, vow, gn, r, V.pan);
      if (V.click) K.nz(tt, 0.02, { type: 'highpass', f0: 3600, g: V.click * 0.18 * P.g, att: 0.001, off: r() * 9, send: 0.05, pan: V.pan });
      if (V.breath > 0.2 && i % 3 === 0) K.nz(tt, d, { type: 'bandpass', f0: 1400, q: 0.8, g: 0.1 * V.breath * P.g, att: 0.05, off: r() * 9, send: 0.1, pan: V.pan });
      tt += sd; left--; i++; first = false;
    }
    if (whistle) { // the referee's whistle: a trilled pea whistle at the end
      const w = K.ctx.createOscillator(), tr = K.ctx.createOscillator(), tg = K.ctx.createGain(), a = K.ctx.createGain(), ws = t + dur - 0.28;
      w.type = 'sine'; w.frequency.setValueAtTime(2750, ws); w.frequency.linearRampToValueAtTime(3050, ws + 0.05); tr.frequency.value = 38; tg.gain.value = 120; tr.connect(tg).connect(w.frequency);
      a.gain.setValueAtTime(0.0001, ws); a.gain.linearRampToValueAtTime(0.1, ws + 0.02); a.gain.setValueAtTime(0.1, ws + 0.22); a.gain.linearRampToValueAtTime(0.0001, ws + 0.28);
      w.connect(a).connect(K.out); const sg = K.ctx.createGain(); sg.gain.value = 0.12; a.connect(sg).connect(K.rev);
      for (const x of [w, tr]) { x.start(ws); x.stop(t + dur + 0.03); }
      K.nz(ws, 0.28, { type: 'bandpass', f0: 3200, q: 3, g: 0.05, att: 0.02, off: r() * 9, send: 0.1 });
    }
  },
  /** Orchard at night, looped for dur seconds (default 20): crickets, light wind, a far owl now and then. Quiet. */
  noite(K, t, r, o) {
    const dur = o.dur ?? 20;
    for (let c = 0; c < 4; c++) { // each cricket: pulses in short trills at its own pitch
      const f = 4100 + c * 330 + r() * 120, a = K.ctx.createOscillator(), env = K.ctx.createGain(), pan = c / 3 * 1.4 - 0.7, pp = K.ctx.createStereoPanner(), gp = 0.012 + r() * 0.006;
      a.type = 'sine'; a.frequency.value = f; env.gain.setValueAtTime(0.0001, t); pp.pan.value = pan;
      let tt = t + r() * 1.2; const rate = 26 + r() * 6, gap = 0.5 + r() * 0.5, trill = 3 + v(r, 3);
      while (tt < t + dur - 0.2) {
        const quiet = r() < 0.25; const n = quiet ? 0 : trill;
        for (let k = 0; k < n && tt < t + dur - 0.1; k++) { env.gain.setValueAtTime(0.0001, tt); env.gain.linearRampToValueAtTime(gp, tt + 0.008); env.gain.linearRampToValueAtTime(0.0001, tt + 0.026); tt += 1 / rate; }
        tt += gap * (quiet ? 1.5 : 1) + r() * 0.5;
      }
      a.connect(env).connect(pp).connect(K.out); a.start(t); a.stop(t + dur + 0.05);
    }
    const w = bed(K, t, dur, { type: 'bandpass', f: 380, q: 0.7, g: 0.05, fade: 1, off: r() * 9, send: 0.2 }); wander(w.frequency, t, dur, 1.2, 380, 0.5, r);
    bed(K, t, dur, { type: 'highpass', f: 5000, q: 0.5, g: 0.006, fade: 1.5, off: r() * 9, send: 0.1 }); // leaves
    for (let tt = t + 2 + r() * 4; tt < t + dur - 2; tt += 7 + r() * 9) { // a distant owl: soft hoots, a low sine with a short drop
      const pan = r() * 1.4 - 0.7;
      for (const [dt, d] of [[0, 0.35], [0.5, 0.2], [0.8, 0.2], [1.1, 0.5]]) K.tn(tt + dt, d, { f0: 370, f1: 330, g: 0.035, att: 0.06, pan, send: 0.7, lp: 700 });
    }
  },
  /** Fridge door: rubber seal pop, latch, a motor hum that comes in under it. */
  geladeira(K, t, r, o) {
    const n = v(r, 3), dur = o.dur ?? 1.8;
    K.nz(t, 0.09, { type: 'bandpass', f0: 600 + n * 80, f1: 250, q: 1.2, g: 0.6, att: 0.002, off: r() * 9, send: 0.1 }); // rubber seal lets go
    K.tn(t, 0.1, { f0: 210, f1: 90, g: 0.35, send: 0.05 });
    K.nz(t + 0.09, 0.4, { type: 'bandpass', f0: 1200, q: 0.8, g: 0.08, att: 0.05, off: r() * 9, send: 0.1 }); // air out
    K.tn(t, 0.03, { type: 'square', f0: 1800, f1: 900, g: 0.08, lp: 3000 }); // latch tick
    const m = drone(K, t + 0.12, dur, { type: 'sawtooth', f: 58 + n * 2, g: 0.09, fade: 0.5, lp: 380, send: 0.15 }); wander(m.frequency, t + 0.12, dur, 0.2, 58 + n * 2, 0.02, r);
    drone(K, t + 0.12, dur, { type: 'sine', f: 116, g: 0.04, fade: 0.5, send: 0.1 });
    bed(K, t + 0.12, dur, { type: 'bandpass', f: 320, q: 2, g: 0.05, fade: 0.5, off: r() * 9, send: 0.1 }); // compressor buzz
  },
  /** Apple pulled off the branch: twig snap and rustling leaves. */
  maca_colher(K, t, r) {
    const n = v(r, 3);
    for (let k = 0; k < 4 + n; k++) K.nz(t + k * (0.02 + r() * 0.04), 0.07, { type: 'bandpass', f0: 3000 + r() * 2500, q: 2, g: 0.12, att: 0.005, off: r() * 9, send: 0.1, pan: r() * 0.6 - 0.3 }); // leaves
    K.nz(t + 0.12, 0.014, { type: 'highpass', f0: 2800, g: 0.7, att: 0.0005, off: r() * 9, send: 0.08 }); // the twig cracks
    K.tn(t + 0.12, 0.05, { type: 'triangle', f0: 1400, f1: 700, g: 0.12, lp: 2400 });
    K.nz(t + 0.14, 0.4 + n * 0.08, { type: 'bandpass', f0: 4200, f1: 2600, q: 1, g: 0.14, att: 0.04, off: r() * 9, send: 0.12 }); // the branch springs back
    if (n === 2) K.nz(t + 0.24, 0.02, { type: 'highpass', f0: 3000, g: 0.3, att: 0.0005, off: r() * 9 });
  },
  /** Apple hits the grass and rolls off. */
  maca_cair(K, t, r) {
    const n = v(r, 3), p = 1 + (r() - 0.5) * 0.2;
    K.tn(t, 0.12, { f0: 140 * p, f1: 70, g: 0.5, send: 0.1 }); K.nz(t, 0.08, { type: 'lowpass', f0: 1200, f1: 300, g: 0.35, off: r() * 9 });
    K.nz(t, 0.18, { type: 'bandpass', f0: 4000, q: 0.8, g: 0.1, att: 0.01, off: r() * 9 }); // grass
    let bt = t + 0.2, gb = 0.28; // two small bounces
    for (let k = 0; k < 2; k++) { K.tn(bt, 0.08, { f0: 120 * p, f1: 65, g: gb, send: 0.08 }); K.nz(bt, 0.05, { type: 'lowpass', f0: 800, g: gb * 0.6, off: r() * 9 }); bt += 0.16 - k * 0.04; gb *= 0.5; }
    K.nz(bt, 0.7 + n * 0.15, { type: 'bandpass', f0: 1800, f1: 800, q: 0.7, g: 0.12, att: 0.1, off: r() * 9, send: 0.1 }); // rolling in the grass
    K.nz(bt, 0.7 + n * 0.15, { type: 'lowpass', f0: 300, f1: 120, g: 0.12, att: 0.1, off: r() * 9, send: 0.05 });
  },
  /** Propeller buzz, looped for dur seconds (default 4), with a slight wander. */
  drone_zumbido(K, t, r, o) {
    const dur = o.dur ?? 4, base = 118 + v(r, 3) * 6;
    for (let k = 0; k < 4; k++) { // four rotors, slightly out of tune with each other
      const f = base * (1 + k * 0.012), d = drone(K, t, dur, { type: 'sawtooth', f, g: 0.045, fade: 0.2, lp: 1500, pan: k % 2 ? 0.3 : -0.3, send: 0.08, detune: k * 7 });
      wander(d.frequency, t, dur, 0.15 + k * 0.03, f, 0.05, r);
    }
    drone(K, t, dur, { type: 'square', f: base * 2.02, g: 0.012, fade: 0.2, lp: 2500, send: 0.05 });
    const b = bed(K, t, dur, { type: 'bandpass', f: 2400, q: 0.9, g: 0.05, fade: 0.2, off: r() * 9, send: 0.05 }); wander(b.frequency, t, dur, 0.2, 2400, 0.25, r); // blade air
    const l = K.ctx.createOscillator(), lg = K.ctx.createGain(); l.frequency.value = 0.7 + r() * 0.4; lg.gain.value = 3; // slow gust of pitch
    l.connect(lg); const ref = drone(K, t, dur, { type: 'triangle', f: base * 0.5, g: 0.04, fade: 0.2, lp: 400, send: 0.05 }); lg.connect(ref.frequency); l.start(t); l.stop(t + dur + 0.05);
  },
  /** Fluorescent tube hum, looped for dur seconds (default 4), with rare flickers. */
  cela_zumbido(K, t, r, o) {
    const dur = o.dur ?? 4;
    for (const [m, g] of [[1, 0.06], [2, 0.05], [3, 0.035], [4, 0.02], [6, 0.012]]) drone(K, t, dur, { type: m === 1 ? 'sine' : 'sawtooth', f: 120 * m, g, fade: 0.3, lp: m > 1 ? 1800 : 0, send: 0.2 });
    bed(K, t, dur, { type: 'bandpass', f: 2200, q: 4, g: 0.012, fade: 0.3, off: r() * 9, send: 0.1 }); // electrical fizz
    drone(K, t, dur, { type: 'sine', f: 7800, g: 0.003, fade: 0.5, send: 0.3 }); // ballast whine
    for (let tt = t + 0.8 + r() * 1.2; tt < t + dur - 0.3; tt += 1.5 + r() * 2.5) { // a flicker: a few crackles
      for (let k = 0; k < 3; k++) K.nz(tt + k * 0.035, 0.02, { type: 'bandpass', f0: 3000 + r() * 2000, q: 1.5, g: 0.1, att: 0.001, off: r() * 9, send: 0.1 });
      K.tn(tt, 0.1, { type: 'square', f0: 120, f1: 120, g: 0.03, lp: 700 });
    }
  },
  /** A fist on the metal wall of the cell, muffled. opts: hits (1 to 4). */
  batida_parede(K, t, r, o) {
    const hits = o.hits ?? 1, p = 1 + (r() - 0.5) * 0.15;
    for (let h = 0; h < hits; h++) {
      const tt = t + h * (0.28 + r() * 0.1), g = 1 - h * 0.12;
      K.tn(tt, 0.14, { f0: 120 * p, f1: 55, g: 0.7 * g, send: 0.2 });
      K.nz(tt, 0.05, { type: 'lowpass', f0: 900, f1: 300, g: 0.5 * g, att: 0.001, off: r() * 9, send: 0.15 }); // flesh on metal
      for (const [f, d] of [[210, 0.5], [340, 0.4], [590, 0.3]]) K.tn(tt, d, { f0: f * p, f1: f * p * 0.99, g: 0.12 * g, att: 0.002, send: 0.35, lp: 900 }); // the panel rings, dull
    }
  },
  /** Blow to the back of the head: a heavy dull thud, then ear ringing that fades away ("everything goes out"). */
  golpe_nuca(K, t, r, o) {
    const dur = o.dur ?? 3.5, p = 1 + (r() - 0.5) * 0.1;
    K.tn(t, 0.5, { f0: 85 * p, f1: 28, g: 0.95, send: 0.3 });
    K.nz(t, 0.2, { type: 'lowpass', f0: 600, f1: 90, g: 0.7, att: 0.002, off: r() * 9, send: 0.2 });
    K.nz(t, 0.03, { type: 'bandpass', f0: 1200, q: 1, g: 0.3, att: 0.001, off: r() * 9 });
    const a = K.ctx.createGain(), w = K.ctx.createOscillator(), w2 = K.ctx.createOscillator(), s = t + 0.08;
    w.frequency.setValueAtTime(3900 * p, s); w.frequency.exponentialRampToValueAtTime(3500 * p, s + dur); w2.frequency.value = 5300 * p;
    const g2 = K.ctx.createGain(); g2.gain.value = 0.35; w2.connect(g2).connect(a); w.connect(a);
    a.gain.setValueAtTime(0.0001, s); a.gain.linearRampToValueAtTime(0.13, s + 0.05); a.gain.setTargetAtTime(0.0001, s + 0.3, dur / 5);
    a.connect(K.out); const sg = K.ctx.createGain(); sg.gain.value = 0.4; a.connect(sg).connect(K.rev);
    for (const x of [w, w2]) { x.start(s); x.stop(s + dur + 0.3); }
    K.nz(t + 0.1, dur, { type: 'lowpass', f0: 500, f1: 60, q: 0.7, g: 0.12, att: 0.2, off: r() * 9, send: 0.3 }); // the room drains out
  },
});

// ---- crowd: rumbles, grunts, growls and stomps of big animals, never a human voice ----------------
const CROWD = {
  stomp(K, t, r, lvl) { K.tn(t, 0.2, { f0: 80 + r() * 25, f1: 40, g: 0.25 * lvl, send: 0.3 }); if (r() < 0.5) K.tn(t + 0.18, 0.18, { f0: 70, f1: 38, g: 0.18 * lvl, send: 0.3 }); },
  grunt(K, t, r, lvl) { // boar: short, nasal, low
    const d = 0.18 + r() * 0.12, f = 85 + r() * 40, o = K.ctx.createOscillator(), b = K.ctx.createBiquadFilter(), a = K.ctx.createGain(), pan = K.ctx.createStereoPanner();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + d);
    b.type = 'bandpass'; b.frequency.value = 350 + r() * 200; b.Q.value = 2.5; perc(a, t, 0.02, 0.3 * lvl, d); pan.pan.value = r() * 1.6 - 0.8;
    o.connect(b).connect(a).connect(pan).connect(K.out); const s = K.ctx.createGain(); s.gain.value = 0.4; pan.connect(s).connect(K.rev);
    o.start(t); o.stop(t + d + 0.03); K.nz(t, d, { type: 'bandpass', f0: 500, q: 1, g: 0.12 * lvl, off: r() * 9, pan: pan.pan.value });
  },
  growl(K, t, r, lvl) { // wolf or bear: long rolling growl, amplitude broken at 25 to 40 Hz
    const d = 0.7 + r() * 0.8, f = 60 + r() * 40, o = K.ctx.createOscillator(), o2 = K.ctx.createOscillator(), b = K.ctx.createBiquadFilter(), a = K.ctx.createGain();
    const am = K.ctx.createOscillator(), ag = K.ctx.createGain(), pan = K.ctx.createStereoPanner();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.8 + r() * 0.5), t + d); o2.frequency.value = f * 1.5; o2.detune.value = 12;
    o2.frequency.setValueAtTime(f * 1.5, t); o2.frequency.linearRampToValueAtTime(f * 1.5 * 0.9, t + d);
    b.type = 'bandpass'; b.frequency.value = 280 + r() * 240; b.Q.value = 1.8; am.frequency.value = 22 + r() * 18; ag.gain.value = 0.5; am.connect(ag).connect(a.gain);
    a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(0.5 * 0.28 * lvl, t + d * 0.3); a.gain.linearRampToValueAtTime(0.0001, t + d); pan.pan.value = r() * 1.6 - 0.8;
    o.connect(b); o2.connect(b); b.connect(a).connect(pan).connect(K.out); const s = K.ctx.createGain(); s.gain.value = 0.5; pan.connect(s).connect(K.rev);
    for (const x of [o, o2, am]) { x.start(t); x.stop(t + d + 0.05); }
  },
  bark(K, t, r, lvl) { // fox or dog: a short bark
    const d = 0.1 + r() * 0.06, pan = r() * 1.6 - 0.8;
    K.nz(t, d, { type: 'bandpass', f0: 900 + r() * 400, f1: 500, q: 2, g: 0.28 * lvl, att: 0.005, off: r() * 9, pan, send: 0.3 });
    K.tn(t, d, { type: 'sawtooth', f0: 420 + r() * 120, f1: 250, g: 0.12 * lvl, lp: 1500, pan, send: 0.3 });
  },
  roar(K, t, r, lvl) { // bear: wide and loud, only at high intensity
    const d = 1.1 + r() * 0.7, pan = r() * 1.2 - 0.6;
    K.nz(t, d, { type: 'bandpass', f0: 220, f1: 360, q: 1.2, g: 0.3 * lvl, att: 0.15, off: r() * 9, pan, send: 0.4 });
    K.tn(t, d, { type: 'sawtooth', f0: 58, f1: 48, g: 0.14 * lvl, att: 0.12, lp: 500, pan, send: 0.4 });
  },
};

export function createSfx(ctx, { seed = 1, destination, volume = 0.8 } = {}) {
  const offline = isOffline(ctx), sr = ctx.sampleRate;
  const master = ctx.createGain(); master.gain.value = volume;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 10500; lp.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
  master.connect(lp).connect(comp).connect(destination || ctx.destination);
  const out = ctx.createGain(); out.connect(master);
  const len = Math.floor(sr * 1.3), ir = ctx.createBuffer(2, len, sr), ri = rng(31);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let l = 0; for (let i = 0; i < len; i++) { l += ((ri() * 2 - 1) - l) * Math.min(1, 0.35 * 22050 / sr * 2); d[i] = l * Math.exp(-i / (sr * 0.28)); } }
  const rev = ctx.createConvolver(); rev.buffer = ir; const revG = ctx.createGain(); revG.gain.value = 0.6; rev.connect(revG).connect(master);
  const noise = ctx.createBuffer(1, Math.floor(sr * 1.6), sr), nd = noise.getChannelData(0), nr = rng(5);
  for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
  const K = makeKit(ctx, out, rev, noise); K.ctx = ctx; K.out = out; K.rev = rev; K.noise = noise;

  let curSeed = seed >>> 0; const counts = {};
  let crowd = null; // { level, timer, next, gain, nodes }

  function startCrowd() {
    const bed = ctx.createBufferSource(); bed.buffer = noise; bed.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 330; f.Q.value = 1.2;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.35; lg.gain.value = 0.35;
    const g = ctx.createGain(); g.gain.value = 0; lfo.connect(lg).connect(g.gain); // slow swell of the bed
    bed.connect(f).connect(g).connect(out); bed.start(0); lfo.start(0);
    const bg = ctx.createGain(); bg.gain.value = 0;
    return { gain: g, level: 0, bed, lfo, f, bg, rr: rng(hash('multidao', curSeed)), next: 0, timer: null };
  }
  function eventAt(c, t, lvl) {
    const x = c.rr(); // heavier animals as the crowd gets louder
    const pick = x < 0.28 ? 'stomp' : x < 0.55 ? 'grunt' : x < 0.8 ? 'growl' : (x < 0.93 && lvl > 0.35) ? 'bark' : (lvl > 0.65 ? 'roar' : 'stomp');
    CROWD[pick](K, t, c.rr, 0.35 + 0.65 * lvl);
  }
  function crowdSchedule(c, horizon, levelAt) {
    while (c.next < horizon) {
      const lvl = levelAt(c.next);
      if (lvl > 0.02) eventAt(c, c.next, lvl);
      c.next += lerp(1.5, 0.16, Math.max(0.02, lvl)) * (0.5 + c.rr());
    }
  }
  function setCrowd(level, o = {}) {
    level = Math.max(0, Math.min(1, level));
    if (offline) { // renders the whole length at once; ramp: [from, to] goes across the render
      const total = o.length ?? ctx.length / sr, c = crowd = crowd || startCrowd(); c.level = level;
      const ramp = o.ramp || [level, level], at = o.at ?? 0, levelAt = (t) => lerp(ramp[0], ramp[1], Math.min(1, (t - at) / total));
      c.next = at; crowdSchedule(c, at + total, levelAt);
      for (let t = 0; t <= total; t += 0.5) c.gain.gain.linearRampToValueAtTime(0.26 * levelAt(at + t) ** 1.2 + 0.0001, at + t);
      return;
    }
    if (level <= 0.001) { if (crowd) { const c = crowd; crowd = null; clearInterval(c.timer); c.gain.gain.cancelScheduledValues(ctx.currentTime); c.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(() => { try { c.bed.stop(); c.lfo.stop(); c.gain.disconnect(); } catch { /* ok */ } }, 2000); } return; }
    if (!crowd) { crowd = startCrowd(); crowd.next = ctx.currentTime + 0.1; const c = crowd; c.timer = setInterval(() => crowdSchedule(c, ctx.currentTime + 1.2, () => c.level), 250); }
    crowd.level = level;
    crowd.gain.gain.setTargetAtTime(0.26 * level ** 1.2, ctx.currentTime, 0.4);
    crowd.f.frequency.setTargetAtTime(240 + 400 * level, ctx.currentTime, 0.4);
  }

  function play(name, o = {}) {
    if (name === 'multidao') { setCrowd(o.intensity ?? 0.5, o); return; }
    const fx = FX[name]; if (!fx) throw new Error('unknown sfx: ' + name);
    const n = counts[name] = (counts[name] || 0) + 1;
    const r = rng(hash(name, (o.seed ?? curSeed) * 977 + n));
    const t = o.at ?? (ctx.currentTime + (o.delay || 0) + 0.005);
    const vol = o.vol ?? 1;
    if (vol !== 1) { // scale through a temporary gain
      const g = ctx.createGain(); g.gain.value = vol; g.connect(master);
      const kit = makeKit(ctx, g, rev, noise); kit.ctx = ctx; kit.out = g; kit.rev = rev; kit.noise = noise; fx(kit, t, r, o); return;
    }
    fx(K, t, r, o);
  }

  return {
    play,
    setCrowd, stop(name) { if (name === 'multidao' || !name) setCrowd(0); },
    setSeed(s) { curSeed = s >>> 0; },
    setVolume(vv) { master.gain.setTargetAtTime(vv, ctx.currentTime, 0.05); },
    resume() { return ctx.state === 'suspended' && ctx.resume ? ctx.resume() : Promise.resolve(); },
    names: SFX_NAMES,
    output: out,
  };
}
