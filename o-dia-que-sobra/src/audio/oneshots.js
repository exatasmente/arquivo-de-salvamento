// One-shot sounds of the gas station. Each is fn({ K, t, r, o }) -> duration in seconds.
//   K  kit bound to the voice (tone, noise, tick, metal)   t  start time   r  seeded random
//   o  options: intensity (0..1), n, who, fecha, on ... (per sound, documented where used)
// Everything is synthesized: oscillators and filtered noise. No samples.
import { pick, vary } from './util.js';

const METAL_SMALL = [[1, 0.5, 0.9], [2.76, 0.3, 0.6], [5.4, 0.18, 0.35], [8.93, 0.1, 0.2]];

export const ONESHOTS = {
  // ---- footsteps: the material changes the spectrum -----------------------------------------
  // piso: vinyl floor of the store, a soft heel and a quiet sole tick.
  passo_piso({ K, t, r, o }) {
    const n = pick(r, 4), p = vary(r, 0.3), run = o.run ? 0.7 : 1;
    K.noise(t, 0.09 * run, { f0: (480 + n * 50) * p, f1: 150, q: 0.7, g: 0.55, off: r() });
    K.tone(t, 0.08 * run, { f0: 100 * p, f1: 55, g: 0.35 });
    K.noise(t + 0.012, 0.03, { type: 'bandpass', f0: 1700 * p, q: 1.4, g: 0.09, off: r() });
    return 0.16;
  },
  // asfalto: gravel in the grain, a duller heel.
  passo_asfalto({ K, t, r, o }) {
    const n = pick(r, 4), p = vary(r, 0.3), run = o.run ? 0.7 : 1;
    K.noise(t, 0.1 * run, { f0: 650 * p, f1: 200, q: 0.8, g: 0.4, off: r() });
    K.tone(t, 0.09 * run, { f0: 90 * p, f1: 52, g: 0.3 });
    for (let k = 0; k < 3 + n; k++) K.noise(t + 0.01 + k * (0.014 + r() * 0.018), 0.025, { type: 'bandpass', f0: 2200 + r() * 2200, q: 2.5, g: 0.1 + r() * 0.06, att: 0.001, off: r() });
    return 0.2;
  },
  // azulejo: hard tile in a small tiled room (bathroom), bright click and a ring of the room.
  passo_azulejo({ K, t, r }) {
    const n = pick(r, 3), p = vary(r, 0.25);
    K.noise(t, 0.05, { type: 'bandpass', f0: 2300 * p, q: 1.2, g: 0.5, att: 0.001, off: r() });
    K.tone(t, 0.09, { f0: 190 * p, f1: 110, g: 0.35 });
    K.noise(t, 0.12, { f0: 900, f1: 280, g: 0.22, off: r() });
    if (n === 2) K.tone(t + 0.01, 0.2, { f0: 3100 * p, f1: 3050 * p, g: 0.025, att: 0.002 });
    return 0.25;
  },

  // ---- doors ---------------------------------------------------------------------------------
  // The shop bell on the glass door: a small spring bell shaken, two or three strikes.
  porta_sino({ K, t, r }) {
    const base = 2350 * vary(r, 0.06), hits = 2 + pick(r, 2);
    let tt = t;
    for (let h = 0; h < hits; h++) {
      K.metal(tt, base * (1 + h * 0.012), METAL_SMALL, { g: 0.55 - h * 0.1, decay: 1 + (h === hits - 1 ? 0.7 : 0) });
      K.tick(tt, { f0: 5000, g: 0.12 });
      tt += 0.08 + r() * 0.07;
    }
    return 1.6;
  },
  // Glass door pushed open: seal sticking, a squeak in the hinge, the latch letting go.
  porta_abre({ K, t, r }) {
    const p = vary(r, 0.2);
    K.tick(t, { f0: 1200, g: 0.35 }); K.tone(t, 0.06, { type: 'triangle', f0: 340, f1: 220, g: 0.25, att: 0.001 });
    K.noise(t + 0.03, 0.4, { type: 'bandpass', kind: 'pink', f0: 500, f1: 900, q: 0.9, g: 0.14, att: 0.1, sus: 0.2 });
    K.tone(t + 0.07, 0.28, { type: 'sawtooth', f0: 820 * p, f1: 1250 * p, g: 0.05, att: 0.04, sus: 0.14, lp: 2800, vib: { rate: 38, depth: 30 } });
    return 0.6;
  },
  // Door swinging to: air, the thump of the frame, the latch and the glass rattling.
  porta_fecha({ K, t, r }) {
    K.noise(t, 0.2, { type: 'lowpass', f0: 600, f1: 250, g: 0.18, att: 0.12, sus: 0.05 });
    const tc = t + 0.2;
    K.tone(tc, 0.18, { f0: 95, f1: 45, g: 0.65, att: 0.002 });
    K.noise(tc, 0.1, { f0: 1500, f1: 300, q: 0.8, g: 0.45, att: 0.001, off: r() });
    K.tick(tc + 0.02, { f0: 1800, g: 0.4 });
    for (let k = 0; k < 4; k++) K.noise(tc + 0.05 + k * 0.045, 0.06, { type: 'bandpass', f0: 2100 + k * 120, q: 6, g: 0.07 / (1 + k * 0.6), att: 0.002, off: r() });
    return 0.8;
  },

  // ---- pump and tank ---------------------------------------------------------------------------
  // The nozzle drawn from its holster: metal on metal, then the hose dragging.
  bico_tira({ K, t, r }) {
    const p = vary(r, 0.15);
    K.noise(t, 0.22, { type: 'bandpass', f0: 700 * p, f1: 2400 * p, q: 3, g: 0.2, att: 0.03, off: r() });
    K.metal(t + 0.2, 640 * p, [[1, 0.35, 0.22], [2.4, 0.25, 0.14], [4.1, 0.14, 0.08]]);
    K.tick(t + 0.2, { f0: 2500, g: 0.3 });
    K.noise(t + 0.25, 0.3, { kind: 'brown', type: 'lowpass', f0: 380, g: 0.3, att: 0.05, off: r() }); // hose slides
    return 0.6;
  },
  // The nozzle back on the pump: a heavier clank and the holster switch.
  bico_poe({ K, t, r }) {
    const p = vary(r, 0.15);
    K.noise(t, 0.12, { kind: 'brown', f0: 420, g: 0.25, off: r() });
    K.metal(t + 0.1, 470 * p, [[1, 0.5, 0.35], [2.3, 0.3, 0.22], [3.9, 0.2, 0.14], [6.2, 0.1, 0.08]]);
    K.tone(t + 0.1, 0.1, { f0: 120, f1: 60, g: 0.45, att: 0.002 });
    K.tick(t + 0.17, { f0: 3000, g: 0.28 });
    return 0.55;
  },
  // Fuel cap: a ratchet of clicks and the final pop. `fecha: true` closes it (clicks, then thump).
  tampa_tanque({ K, t, r, o }) {
    const n = 5 + pick(r, 3), p = vary(r, 0.1);
    for (let k = 0; k < n; k++) {
      const tt = t + k * (o.fecha ? 0.05 : 0.04) * (1 + k * 0.04);
      K.tick(tt, { f0: 1800 * p, g: 0.28 }); K.tone(tt, 0.03, { type: 'square', f0: 900 * p, f1: 700, g: 0.04, lp: 1800, att: 0.001 });
    }
    const te = t + n * 0.055 + 0.03;
    if (o.fecha) { K.tone(te, 0.12, { f0: 130, f1: 70, g: 0.4, att: 0.001 }); K.noise(te, 0.07, { f0: 1200, f1: 400, g: 0.3, att: 0.001 }); }
    else { K.noise(te, 0.18, { type: 'bandpass', f0: 600, f1: 300, q: 1.4, g: 0.3, att: 0.002 }); K.tone(te, 0.1, { f0: 220, f1: 120, g: 0.3, att: 0.001 }); } // air let in
    return te - t + 0.25;
  },
  // Pump beeps: a double chirp when a value is set or the preset ends.
  bomba_bip({ K, t, r }) {
    const f = 2050 * vary(r, 0.04);
    for (let k = 0; k < 2; k++) K.tone(t + k * 0.15, 0.1, { type: 'square', f0: f, g: 0.09, att: 0.004, sus: 0.02, lp: 4200 });
    return 0.32;
  },
  // Cash register scanner: one short beep, higher and drier than the pump.
  caixa_bip({ K, t, r }) {
    const f = 1560 * vary(r, 0.05);
    K.tone(t, 0.09, { type: 'square', f0: f, g: 0.09, att: 0.003, sus: 0.015, lp: 3800 });
    K.tone(t, 0.09, { type: 'sine', f0: f * 2, g: 0.04, att: 0.003, sus: 0.015 });
    return 0.14;
  },

  // ---- cash drawer and money -------------------------------------------------------------------
  // Drawer: solenoid kick, bell ding, runners sliding.
  gaveta_abre({ K, t, r }) {
    K.tone(t, 0.1, { f0: 150, f1: 70, g: 0.5, att: 0.001 }); K.tick(t, { f0: 1500, g: 0.4 });
    K.metal(t + 0.01, 2650 * vary(r, 0.04), [[1, 0.2, 1.2], [2.76, 0.1, 0.7], [5.4, 0.05, 0.4]]);
    K.noise(t + 0.06, 0.28, { type: 'bandpass', f0: 1100, f1: 1700, q: 1.2, g: 0.16, att: 0.05, sus: 0.1, off: r() });
    K.tone(t + 0.34, 0.07, { f0: 200, f1: 120, g: 0.3, att: 0.001 }); // hits the stop
    return 1.2;
  },
  // Coin set down or dropped on a hard surface: two clinks and a short ring.
  moeda({ K, t, r }) {
    const p = vary(r, 0.3), n = 2 + pick(r, 2);
    for (let k = 0; k < n; k++) {
      const tt = t + [0, 0.07, 0.115, 0.14][k] * (1 + r() * 0.2), g = 0.5 / (1 + k * 0.9);
      K.metal(tt, 3050 * p * (1 + k * 0.05), [[1, g * 0.7, 0.28], [1.5, g * 0.35, 0.2], [2.27, g * 0.22, 0.12]]);
      K.tick(tt, { f0: 4500, g: 0.12 * g });
    }
    return 0.5;
  },
  // Banknote: paper crinkle, quick amplitude flutter.
  nota({ K, t, r }) {
    const n = 4 + pick(r, 4);
    for (let k = 0; k < n; k++) K.noise(t + k * (0.03 + r() * 0.03), 0.04 + r() * 0.03, { type: 'bandpass', f0: 3200 + r() * 2400, q: 1.1, g: 0.11 + r() * 0.07, att: 0.003, off: r() });
    K.noise(t, 0.25, { type: 'highpass', f0: 2200, g: 0.04, att: 0.03, sus: 0.1, off: r() });
    return 0.3 + n * 0.06;
  },

  // ---- stock and cleaning ----------------------------------------------------------------------
  // A product set on a shelf: soft thump and a plastic tick.
  prateleira_poe({ K, t, r }) {
    const p = vary(r, 0.3);
    K.tone(t, 0.08, { f0: 160 * p, f1: 80, g: 0.35, att: 0.002 });
    K.noise(t, 0.07, { f0: 900 * p, f1: 300, g: 0.3, off: r() });
    K.noise(t + 0.01, 0.03, { type: 'bandpass', f0: 2400 * p, q: 2, g: 0.1, off: r() });
    return 0.18;
  },
  // Cardboard box put down or dragged a little: dull thud, flaps rustling.
  caixa_papelao({ K, t, r }) {
    K.tone(t, 0.14, { f0: 120, f1: 60, g: 0.45, att: 0.002 });
    K.noise(t, 0.2, { kind: 'pink', f0: 700, f1: 250, g: 0.4, off: r() });
    for (let k = 0; k < 4; k++) K.noise(t + 0.07 + k * 0.05, 0.08, { type: 'bandpass', f0: 1300 + r() * 900, q: 1.3, g: 0.1, att: 0.01, off: r() });
    K.noise(t + 0.15, 0.3, { type: 'bandpass', kind: 'pink', f0: 500, f1: 800, q: 1, g: 0.1, att: 0.08, sus: 0.14, off: r() });
    return 0.55;
  },
  // Hand truck / cart rolling: bearings, flat spot knocking, a squeak. o.dur (s), default 1.4.
  carrinho({ K, t, r, o }) {
    const dur = o.dur ?? 1.4;
    K.noise(t, dur, { kind: 'brown', type: 'bandpass', f0: 180, q: 1, g: 0.5, att: 0.15, sus: 0.3, off: r() });
    K.noise(t, dur, { kind: 'pink', type: 'bandpass', f0: 1500, q: 0.9, g: 0.05, att: 0.15, sus: 0.3, off: r() });
    const rate = 7 + r() * 2; // wheel revolution
    for (let tt = t + 0.1; tt < t + dur - 0.1; tt += 1 / rate) K.tone(tt, 0.05, { f0: 140, f1: 80, g: 0.12, att: 0.002 });
    K.tone(t + dur * 0.25, dur * 0.4, { type: 'sawtooth', f0: 1900, f1: 2300, g: 0.012, att: 0.1, sus: 0.2, lp: 3000, vib: { rate: 30, depth: 50 } });
    return dur + 0.1;
  },
  // Squeegee over a wet floor: rubber friction, a squeak at the turn. o.dur (s), default 0.8.
  rodo({ K, t, r, o }) {
    const dur = o.dur ?? 0.8;
    K.noise(t, dur, { type: 'bandpass', f0: 1700, f1: 2600, q: 2.2, g: 0.2, att: 0.12, sus: 0.3, off: r() });
    K.noise(t, dur, { kind: 'pink', f0: 700, g: 0.12, att: 0.1, sus: 0.3, off: r() });
    K.tone(t + dur * 0.55, 0.2, { f0: 1400, f1: 1050, g: 0.025, att: 0.02, sus: 0.1, lp: 2500, vib: { rate: 55, depth: 40 } });
    return dur + 0.05;
  },
  // Rubbish into the bin: crumple, a can clink, the thump of the bag settling.
  lixo({ K, t, r }) {
    const n = 5 + pick(r, 4);
    for (let k = 0; k < n; k++) K.noise(t + k * (0.02 + r() * 0.025), 0.05, { type: 'bandpass', f0: 1800 + r() * 2500, q: 1, g: 0.14, att: 0.002, off: r() });
    K.tone(t + 0.12, 0.2, { f0: 85, f1: 48, g: 0.45, att: 0.004 });
    K.noise(t + 0.12, 0.2, { kind: 'pink', f0: 500, f1: 180, g: 0.3, off: r() });
    K.metal(t + 0.09, 1900 * vary(r, 0.3), [[1, 0.1, 0.25], [2.1, 0.07, 0.15]]);
    return 0.5;
  },

  // ---- telephone ------------------------------------------------------------------------------
  // Old desk telephone: the hammer striking two bells, a ringing burst at ~20 Hz. o.rings (default 2).
  telefone_toca({ K, t, o }) {
    const rings = o.rings ?? 2, burst = 0.9, period = 1.2;
    for (let k = 0; k < rings; k++) {
      const t0 = t + k * period;
      // two bells struck in turn by one hammer: the pair of tones is gated at 20 Hz, in opposition
      K.tone(t0, burst, { f0: 1250, g: 0.2, att: 0.005, sus: 0.08, am: { rate: 10, depth: 1, type: 'square' } });
      K.tone(t0 + 0.05, burst, { f0: 1410, g: 0.2, att: 0.005, sus: 0.08, am: { rate: 10, depth: 1, type: 'square' } });
      K.tone(t0, burst, { f0: 2550, g: 0.06, att: 0.005, sus: 0.08, am: { rate: 10, depth: 1, type: 'square' } });
      K.noise(t0, burst, { type: 'bandpass', f0: 160, q: 1, g: 0.05, att: 0.01, sus: 0.05 }); // the case buzzing
    }
    return rings * period + 0.3;
  },
  // Handset lifted from the cradle: switch click, plastic scrape, the line hum starting.
  telefone_atende({ K, t, r }) {
    K.tick(t, { f0: 1800, g: 0.4 }); K.tone(t, 0.05, { type: 'triangle', f0: 400, f1: 250, g: 0.3, att: 0.001 });
    K.noise(t + 0.03, 0.2, { type: 'bandpass', f0: 900, f1: 600, q: 1.5, g: 0.12, att: 0.04, off: r() });
    K.tone(t + 0.12, 0.28, { f0: 60, g: 0.03, att: 0.08, sus: 0.1 });
    K.noise(t + 0.15, 0.3, { type: 'highpass', f0: 4000, g: 0.02, att: 0.1, sus: 0.1, off: r() });
    return 0.5;
  },
  // Handset back: thunk on the cradle and the bells giving a small ting.
  telefone_desliga({ K, t, r }) {
    K.tone(t, 0.1, { f0: 150, f1: 70, g: 0.5, att: 0.001 }); K.noise(t, 0.06, { f0: 1500, f1: 400, g: 0.35, att: 0.001, off: r() });
    K.tick(t + 0.04, { f0: 2000, g: 0.3 });
    K.metal(t + 0.02, 1420, [[1, 0.12, 0.3], [2.04, 0.05, 0.2]]);
    return 0.45;
  },

  // ---- appliances and electrics ---------------------------------------------------------------
  // Coffee maker: gurgle and drip, a steam hiss, a final beep. o.dur (default 3.6).
  cafeteira({ K, t, r, o }) {
    const dur = o.dur ?? 3.6;
    K.noise(t, dur, { kind: 'brown', type: 'bandpass', f0: 230, q: 3, g: 0.22, att: 0.4, sus: 0.6, off: r() });
    K.noise(t + dur * 0.15, dur * 0.8, { type: 'highpass', f0: 3800, g: 0.05, att: 0.5, sus: 0.7, off: r() });
    for (let tt = t + 0.3; tt < t + dur - 0.3;) { // bubbles
      K.tone(tt, 0.07, { f0: 260 + r() * 260, f1: 520 + r() * 300, g: 0.07 + r() * 0.05, att: 0.004 });
      tt += 0.05 + r() * 0.25;
    }
    for (let k = 0; k < 3; k++) K.tone(t + dur + k * 0.2, 0.14, { type: 'square', f0: 2400, g: 0.05, att: 0.003, sus: 0.03, lp: 3800 });
    return dur + 0.7;
  },
  // Fluorescent tube popping: a glass tick, a crackle, and a short buzz.
  lampada_estalo({ K, t, r }) {
    K.tick(t, { f0: 3000, g: 0.5 }); K.tone(t, 0.04, { f0: 5200, f1: 4200, g: 0.1, att: 0.0008 });
    for (let k = 0; k < 4; k++) K.tick(t + 0.03 + r() * 0.1, { f0: 2500 + r() * 2000, g: 0.15 });
    K.tone(t + 0.02, 0.14, { type: 'sawtooth', f0: 120, g: 0.07, att: 0.004, sus: 0.06, lp: 900 });
    return 0.3;
  },
  // Breaker thrown: lever clack, relay thump, then the hum of the building dropping away.
  disjuntor({ K, t, r }) {
    K.tick(t, { f0: 1100, g: 0.5 }); K.tone(t, 0.08, { type: 'triangle', f0: 360, f1: 200, g: 0.4, att: 0.001 });
    K.tone(t + 0.05, 0.16, { f0: 90, f1: 42, g: 0.6, att: 0.002 });
    K.noise(t + 0.05, 0.09, { f0: 900, f1: 250, g: 0.35, att: 0.001, off: r() });
    K.tone(t + 0.1, 0.5, { type: 'sawtooth', f0: 120, f1: 35, g: 0.07, att: 0.01, lp: 500 });
    K.tone(t + 0.1, 0.5, { f0: 60, f1: 22, g: 0.08, att: 0.01 });
    return 0.9;
  },
  // Flashlight switch: two small ticks. o.on (default true) is a little higher than off.
  lanterna_clique({ K, t, r, o }) {
    const on = o.on !== false, p = on ? 1 : 0.82;
    K.tick(t, { f0: 3200 * p, g: 0.4 }); K.tone(t, 0.02, { type: 'square', f0: 1600 * p, g: 0.04, lp: 3000, att: 0.0008 });
    K.tick(t + 0.045, { f0: 2500 * p, g: 0.25 });
    return 0.1;
  },

  // ---- the body --------------------------------------------------------------------------------
  // One breath cycle (inhale, exhale). o.intensity 0..1: slower and soft -> short, loud, ragged.
  // o.cycles repeats it (default 1).
  respiracao({ K, t, r, o }) {
    const k = o.intensity ?? 0.3, cycles = o.cycles ?? 1;
    const T = 3.0 - 2.0 * k, inh = T * 0.42, exh = T * 0.48, g = 0.05 + 0.2 * k, lo = 420 + 420 * k;
    let tt = t;
    for (let c = 0; c < cycles; c++) {
      const s = 1 + (r() - 0.5) * 0.15;
      K.noise(tt, inh * s, { kind: 'pink', type: 'bandpass', f0: lo, f1: lo * 1.7, q: 0.9, g, att: inh * 0.55, sus: inh * 0.35, off: r() });
      K.noise(tt + inh * 0.3, inh * 0.7, { type: 'bandpass', f0: 2300, q: 1.2, g: g * 0.12 * (0.4 + k), att: inh * 0.3, sus: inh * 0.3, off: r() });
      const te = tt + inh + T * 0.04;
      K.noise(te, exh * s, { kind: 'pink', type: 'bandpass', f0: lo * 1.5, f1: lo * 0.7, q: 0.8, g: g * 1.1, att: exh * 0.2, sus: exh * 0.7, off: r() });
      if (k > 0.55) K.tone(te + 0.02, exh * 0.5, { type: 'sawtooth', f0: 150 + r() * 30, g: 0.012 * k, att: 0.05, sus: exh * 0.3, lp: 600 }); // a rasp
      tt += T * s;
    }
    return tt - t;
  },
  // Heartbeat, lub-dub. o.intensity 0..1: calm 62 bpm and soft -> 150 bpm and heavy. o.beats (2..4).
  coracao({ K, t, o }) {
    const k = o.intensity ?? 0.3, beats = o.beats ?? 2 + Math.round(k * 2), T = 60 / (62 + 88 * k), g = 0.22 + 0.4 * k;
    for (let b = 0; b < beats; b++) {
      const tb = t + b * T;
      K.tone(tb, 0.13, { f0: 70, f1: 38, g, att: 0.006 });
      K.noise(tb, 0.08, { f0: 260, f1: 90, g: g * 0.5, att: 0.004 });
      const td = tb + 0.14 + 0.06 * (1 - k);
      K.tone(td, 0.11, { f0: 62, f1: 36, g: g * 0.75, att: 0.006 });
      K.noise(td, 0.07, { f0: 230, f1: 80, g: g * 0.35, att: 0.004 });
    }
    return beats * T + 0.2;
  },

  // ---- interface (soft, short; the menu is a PS1 menu) -----------------------------------------
  ui_mover({ K, t }) { K.tone(t, 0.05, { type: 'triangle', f0: 880, f1: 840, g: 0.14, att: 0.002, lp: 3000 }); return 0.07; },
  ui_ok({ K, t }) {
    K.tone(t, 0.07, { type: 'square', f0: 660, g: 0.07, att: 0.003, sus: 0.02, lp: 3000 });
    K.tone(t + 0.07, 0.12, { type: 'square', f0: 990, g: 0.07, att: 0.003, sus: 0.04, lp: 3000 });
    return 0.2;
  },
  ui_voltar({ K, t }) {
    K.tone(t, 0.07, { type: 'square', f0: 620, g: 0.065, att: 0.003, sus: 0.02, lp: 2800 });
    K.tone(t + 0.07, 0.12, { type: 'square', f0: 410, g: 0.065, att: 0.003, sus: 0.04, lp: 2800 });
    return 0.2;
  },
  // Keyboard key: plastic click and a thock. o.key (any number) changes the pitch a little.
  tecla({ K, t, r, o }) {
    const p = 1 + (((o.key ?? 0) * 7) % 5 - 2) * 0.035 * 1 + (r() - 0.5) * 0.05;
    K.tick(t, { f0: 2400 * p, g: 0.28 }); K.tone(t, 0.03, { f0: 260 * p, f1: 160, g: 0.2, att: 0.001 });
    K.noise(t + 0.012, 0.025, { type: 'bandpass', f0: 1400 * p, q: 2, g: 0.06, att: 0.001, off: r() });
    return 0.06;
  },
};
