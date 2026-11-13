import { createAudio, createAudioContext, NAMES, LOOP_ONLY } from '../src/audio/index.js';
const $ = (id) => document.getElementById(id);
const log = (s) => { $('log').textContent = s + '\n' + $('log').textContent.slice(0, 1500); };
const LOOPS = ['fluorescente', 'rodovia', 'insetos', 'vento', 'geladeira', 'motor_carro', 'bomba_corre', 'chuva', 'sol_presenca', 'telefone_toca', 'estatica_camera', 'respiracao', 'coracao', 'zumbido_ouvido'];
let ctx, audio; const running = {};
function ensure() { if (audio) return; ctx = createAudioContext(); audio = createAudio(ctx); window.audio = audio; window.ctx = ctx; ctx.resume(); log('sr ' + ctx.sampleRate); }
const pos = () => ($('spatial').checked ? { pos: [2, 1.5, -1] } : {});
$('start').onclick = ensure;
$('san').oninput = () => { ensure(); $('sanv').textContent = $('san').value; audio.setSanity(+$('san').value); };
$('era').onchange = () => { ensure(); audio.setEra($('era').checked); };
$('hal').oninput = () => { ensure(); $('halv').textContent = $('hal').value; audio.setHallucination(+$('hal').value / 100); };
$('drw').oninput = () => { ensure(); $('drwv').textContent = $('drw').value; audio.setDrowsy(+$('drw').value / 100, 0.6); };
$('bab').onclick = () => { ensure(); log('babble ' + audio.babble(+$('seed').value, $('txt').value, { ...pos(), self: $('self').checked }).toFixed(2) + ' s'); };
for (const n of NAMES.filter((n) => !LOOP_ONLY.includes(n))) {
  const b = document.createElement('button'); b.textContent = n;
  b.onclick = () => { ensure(); const t0 = performance.now(); const d = audio.play(n, pos()); log(`${n}: ${d.toFixed(2)} s, construído em ${(performance.now() - t0).toFixed(2)} ms`); };
  $('one').append(b);
}
for (const n of LOOPS) {
  const b = document.createElement('button'); b.textContent = n;
  b.onclick = () => { ensure(); if (running[n]) { running[n].stop(0.5); running[n] = null; b.classList.remove('on'); } else { const t0 = performance.now(); running[n] = audio.loop(n, { ...pos(), state: n === 'respiracao' || n === 'coracao' || n === 'zumbido_ouvido' ? { intensity: 0.5 } : {} }); b.classList.add('on'); log(`${n}: laço criado em ${(performance.now() - t0).toFixed(2)} ms`); } };
  $('loops').append(b);
}
// offline render for the measurement script
window.renderSound = async (kind, name, opts, length, sr = 22050, extra = {}) => {
  const oc = new OfflineAudioContext(2, Math.ceil(length * sr), sr), a = createAudio(oc, { seed: 7, body: false, ...extra.create });
  if (extra.sanity !== undefined) a.setSanity(extra.sanity, 0.001);
  if (extra.hallucination !== undefined) a.setHallucination(extra.hallucination);
  if (extra.drowsy !== undefined) a.setDrowsy(extra.drowsy, 0.001);
  if (extra.listener) a.listener(extra.listener.pos, extra.listener.dir, 0);
  if (extra.under) a.loop(extra.under, { at: 0.05, seed: 3, dur: length - 0.5 }); // a bed under the sound, for the mix tests
  let ret;
  if (kind === 'play') ret = a.play(name, { at: 0.05, seed: 3, ...opts });
  else if (kind === 'loop') a.loop(name, { at: 0.05, seed: 3, dur: length - 0.5, ...opts });
  else ret = a.babble(opts.seed ?? 7, opts.text, { at: 0.05, self: opts.self });
  const buf = await oc.startRendering();
  const enc = (x) => { let s = ''; const u = new Uint8Array(x.buffer, x.byteOffset, x.byteLength); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  return { sr, ret, ch: [enc(buf.getChannelData(0)), enc(buf.getChannelData(1))] };
};
window.mk = (oc) => createAudio(oc, { body: false });
window.timeBuild = (name, kind) => { // build cost in a live-sized context (no rendering)
  const oc = new OfflineAudioContext(2, 22050, 22050), a = createAudio(oc, { body: false });
  const t0 = performance.now(); if (kind === 'loop') a.loop(name, { at: 0.01 }); else a.play(name, { at: 0.01 });
  return performance.now() - t0;
};
window.NAMES = NAMES; window.ready = true;
