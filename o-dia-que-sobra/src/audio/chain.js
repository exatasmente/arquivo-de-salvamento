// The master chain. voices -> bus -> sanity (muffle, drive, warble) -> era (narrow band, few bits)
// -> master volume -> compressor -> soft ceiling -> destination. The ceiling is a tanh curve at
// 0.84 (-1.5 dBFS), so nothing leaves the chain above it, whatever the sounds add up to.
import { crushCurve, clipCurve, driveCurve, rng, lerp, clamp } from './util.js';

const ROOMS = { fora: 0.04, loja: 0.16, escritorio: 0.14, estoque: 0.3, banheiro: 0.42, casa: 0.12, deposito: 0.34 };

export function createChain(ctx, { era = true, eraBits = 6, volume = 0.9, destination } = {}) {
  const NY = ctx.sampleRate * 0.45; // keep every filter inside the band the context can carry
  const bus = ctx.createGain();
  const sanLP = ctx.createBiquadFilter(); sanLP.type = 'lowpass'; sanLP.frequency.value = Math.min(18000, NY); sanLP.Q.value = 0.6;
  const dry = ctx.createGain(), wet = ctx.createGain(), drive = ctx.createWaveShaper(); drive.curve = driveCurve(); wet.gain.value = 0;
  const sum1 = ctx.createGain();
  const warble = ctx.createDelay(0.05); warble.delayTime.value = 0.005;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 1.1; lfoG.gain.value = 0; lfo.connect(lfoG).connect(warble.delayTime); lfo.start();
  bus.connect(sanLP); sanLP.connect(dry).connect(sum1); sanLP.connect(drive).connect(wet).connect(sum1); // drowsy: the mix sinks (muffled and lower) for heavy sleep; open and unity unless asked
  const drowsyLP = ctx.createBiquadFilter(); drowsyLP.type = 'lowpass'; drowsyLP.frequency.value = Math.min(18000, NY); drowsyLP.Q.value = 0.5;
  const drowsyG = ctx.createGain();
  sum1.connect(drowsyLP).connect(drowsyG).connect(warble);

  // era: high-pass, low-pass and a companded quantizer; `eraOff` is the clean path
  const eraHP = ctx.createBiquadFilter(); eraHP.type = 'highpass'; eraHP.frequency.value = 50; eraHP.Q.value = 0.7;
  const eraLP = ctx.createBiquadFilter(); eraLP.type = 'lowpass'; eraLP.frequency.value = 7500; eraLP.Q.value = 0.8;
  const eraLP2 = ctx.createBiquadFilter(); eraLP2.type = 'lowpass'; eraLP2.frequency.value = 7500; eraLP2.Q.value = 0.5;
  const crush = ctx.createWaveShaper(); crush.curve = crushCurve(eraBits);
  const eraOn = ctx.createGain(), eraOffG = ctx.createGain();
  warble.connect(eraHP).connect(eraLP).connect(eraLP2).connect(crush).connect(eraOn);
  warble.connect(eraOffG);
  const master = ctx.createGain(); master.gain.value = volume;
  eraOn.connect(master); eraOffG.connect(master);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
  const clip = ctx.createWaveShaper(); clip.curve = clipCurve(0.84);
  master.connect(comp).connect(clip).connect(destination || ctx.destination);

  // reverb: short noisy room built with a running decay (no per-sample exp)
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.1), ir = ctx.createBuffer(2, len, sr), ri = rng(31);
  const kf = Math.min(1, 0.35 * 22050 / sr * 2), step = Math.exp(-1 / (sr * 0.26));
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let l = 0, dec = 1; for (let i = 0; i < len; i++) { l += ((ri() * 2 - 1) - l) * kf; d[i] = l * dec; dec *= step; } }
  const rev = ctx.createConvolver(); rev.buffer = ir; const revG = ctx.createGain(); revG.gain.value = ROOMS.loja; rev.connect(revG).connect(bus);

  function setEra(on) {
    const now = ctx.currentTime;
    eraOn.gain.setTargetAtTime(on ? 1 : 0, now, 0.03); eraOffG.gain.setTargetAtTime(on ? 0 : 1, now, 0.03);
  }
  eraOn.gain.value = era ? 1 : 0; eraOffG.gain.value = era ? 0 : 1;

  /** Sanity 0..100 -> mix. Returns the derived values (also used for the body layer). */
  function setSanity(v, tc = 0.5) {
    v = clamp(v, 0, 100);
    const now = ctx.currentTime;
    // muffle: nothing above 60, a slight dulling to 40, clearly muffled below 40, a tunnel below 20
    let f;
    if (v >= 60) f = 18000;
    else if (v >= 40) f = lerp(9000, 18000, (v - 40) / 20) ;
    else if (v >= 20) f = lerp(2300, 9000, (v - 20) / 20) ;
    else f = lerp(750, 2300, v / 20);
    const driveMix = v >= 20 ? 0 : (20 - v) / 20 * 0.3;
    const warbleDepth = v >= 40 ? 0 : (40 - v) / 40 * 0.0035;
    sanLP.frequency.setTargetAtTime(Math.min(f, NY), now, tc);
    wet.gain.setTargetAtTime(driveMix, now, tc); dry.gain.setTargetAtTime(1 - driveMix * 0.5, now, tc);
    lfoG.gain.setTargetAtTime(warbleDepth, now, tc);
    return { cutoff: f, drive: driveMix, warble: warbleDepth };
  }

  /** Drowsiness 0..1: muffles to ~450 Hz and drops 5 dB at 1. `at` (absolute time) schedules it. */
  function setDrowsy(v, tc = 0.6, at) {
    v = clamp(v, 0, 1);
    const when = at ?? ctx.currentTime, f = Math.min(18000, NY) * (450 / Math.min(18000, NY)) ** v;
    drowsyLP.frequency.setTargetAtTime(f, when, tc); drowsyG.gain.setTargetAtTime(1 - 0.44 * v, when, tc);
  }

  return {
    bus, rev, master, setSanity, setEra, setDrowsy,
    setVolume(vv) { master.gain.setTargetAtTime(vv, ctx.currentTime, 0.05); },
    setRoom(name) { const w = typeof name === 'number' ? name : (ROOMS[name] ?? ROOMS.loja); revG.gain.setTargetAtTime(w, ctx.currentTime, 0.2); },
    rooms: Object.keys(ROOMS),
    eraNodes: { eraHP, eraLP, eraLP2, crush },
  };
}
