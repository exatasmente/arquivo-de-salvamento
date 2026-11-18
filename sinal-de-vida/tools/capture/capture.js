// The page of the face and voice capture. The camera is only shown (the <video> is read by the landmarker and never drawn into a
// canvas, recorded or sent). What is kept: the audio (WAV mono 48 kHz) and, per frame, the 51 weights and the turn of the head.
// The face comes from the webcam (the landmarker) or from an iPhone running Live Link Face (the server passes its frames on); the audio is always the computer's microphone.
import { BLENDSHAPES, matrixToEuler, averageNeutral, createLiveMapper } from './lib.mjs';

const VERSION = '0.10.21';   // @mediapipe/tasks-vision, fixed
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const RATE = 48000, COUNTDOWN = 3, NEUTRAL_SECONDS = 2;
const SHOWN = ['jawOpen', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'browInnerUp', 'browDownLeft', 'browOuterUpLeft', 'mouthSmileLeft', 'mouthFrownLeft', 'mouthPucker', 'mouthFunnel', 'cheekSquintLeft'];

// ---- the live Jonas and the live gains ------------------------------------------------------------------------------------------------
const GROUPS = [['Boca', ['jaw_open', 'mouth_narrow']], ['Piscar e olhos', ['blink', 'eye_wide', 'squint']], ['Sobrancelhas', ['brow_up', 'brow_down', 'brow_worry']], ['Sorriso e bochechas', ['smile', 'frown', 'cheek']], ['Lábios', ['lips_close', 'lips_funnel', 'upper_lip_up', 'lower_lip_down', 'lips_press', 'mouth_left', 'mouth_right']]];
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (id) => document.getElementById(id);
const msg = (t, err = false) => { $('msg').textContent = t; $('msg').className = err ? 'err' : ''; };
const api = async (path, opt) => { const r = await fetch(path, opt); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r; };

const S = { source: 'webcam', audioReady: false, es: null, wall0: 0, llCount: 0, llIp: '', llLast: 0, landmarker: null, ctx: null, node: null, stream: null, lines: [], cur: null, state: null, last: null, mode: 'idle', frames: [], neutralFrames: [], t0: 0, noFace: 0, chunks: [], countdown: null, replay: null };
window.__capture = S;

// ---- the bars ---------------------------------------------------------------------------------------------------------------------
const bars = {};
for (const n of SHOWN) { const l = document.createElement('span'); l.textContent = n; const b = document.createElement('div'); b.className = 'bar'; b.innerHTML = '<i></i>'; const v = document.createElement('span'); $('bars').append(l, b, v); bars[n] = [b.firstChild, v]; }

// ---- the script and the list ------------------------------------------------------------------------------------------------------
async function loadScript() {
  S.lines = (await (await api('/api/script')).json()).lines; S.state = await (await api('/api/state')).json();
  const ul = $('lines'); ul.textContent = '';
  for (const l of S.lines) {
    const li = document.createElement('li'); li.dataset.id = l.id;
    li.innerHTML = '<b></b><span></span><span class="st"></span>'; li.children[0].textContent = l.id; li.children[1].textContent = l.text;
    li.onclick = () => { if (S.mode === 'idle') pick(l.id); };
    ul.append(li);
  }
  neutralLabel();
  refresh(); if (S.lines[0]) pick(S.lines[0].id);
}
function refresh() {
  for (const li of $('lines').children) { const t = S.state.takes.find((x) => x.id === li.dataset.id); const ok = t?.audio && t?.face; li.classList.toggle('done', !!ok); li.classList.toggle('cur', li.dataset.id === S.cur); li.children[2].textContent = ok ? 'gravada' : ''; }
  $('play').disabled = !S.cur || !S.state.takes.find((x) => x.id === S.cur)?.audio;
}
function pick(id) { S.cur = id; tellLine(); const l = S.lines.find((x) => x.id === id); $('who').textContent = `fala ${l.id} — ${l.who}`; $('text').textContent = l.text; refresh(); }

const neutralLabel = (extra = '') => { $('neutralState').textContent = S.state.neutral[S.source] ? `neutro gravado${extra}` : 'sem neutro ainda'; };
// ---- the source: the webcam (the landmarker reads the camera here) or the iPhone (Live Link Face sends the weights by the network) ----
function showSource() {
  const web = S.source === 'webcam';
  $('camBox').style.display = web ? '' : 'none'; $('llBox').style.display = web ? 'none' : '';
  $('camTitle').textContent = web ? 'Câmera (só aparece aqui, nada dela é gravado)' : 'iPhone (Live Link Face)';
  S.found = false; $('found').textContent = 'sem rosto'; $('found').className = 'off'; neutralLabel();
}
async function setSource(v) {
  if (S.mode !== 'idle') { $('source').value = S.source; return; }
  S.source = v; showSource(); resetControls(); loadNeutral().then(applyControls);
  if (v === 'livelink') { startLivelink(); runLoop(); }   // the iPhone needs no camera: show its frames before the microphone is on
  if (S.audioReady) await ensureSource();
}
async function ensureSource() {
  try {
    if (S.source === 'webcam') await startWebcam(); else startLivelink();
    msg(S.source === 'webcam' ? 'Pronto.' : 'Pronto: esperando o iPhone mandar o rosto (veja o README).');
  } catch (e) { msg(`Não deu para começar: ${e.message ?? e}`, true); }
}

// ---- the camera, the microphone and the landmarker ---------------------------------------------------------------------------------
async function start() {
  $('start').disabled = true; msg('Pedindo o microfone...');
  try {
    await startAudio(); S.audioReady = true;
    $('neutral').disabled = false; $('rec').disabled = !S.cur;
    await ensureSource();
    runLoop();
  } catch (e) { msg(`Não deu para começar: ${e.message ?? e}`, true); $('start').disabled = false; }
}
async function startAudio() {
  S.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  S.ctx = new AudioContext({ sampleRate: RATE });
  const src = S.ctx.createMediaStreamSource(S.stream);
  const code = `class R extends AudioWorkletProcessor { constructor(){ super(); this.on=false; this.port.onmessage=(e)=>{ this.on=e.data==='start'; if(this.on) this.fresh=true; if(e.data==='stop') this.port.postMessage({stopped:true}); }; }
    process(i){ const c=i[0]&&i[0][0]; if(this.on&&c){ if(this.fresh){ this.fresh=false; this.port.postMessage({started:currentTime}); } this.port.postMessage(c.slice()); } return true; } }
    registerProcessor('rec', R);`;
  await S.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  S.node = new AudioWorkletNode(S.ctx, 'rec', { numberOfInputs: 1, numberOfOutputs: 0 });
  S.node.port.onmessage = (e) => {
    if (e.data.stopped) S.onStopped?.();
    else if (e.data.started !== undefined) { S.t0 = e.data.started; S.wall0 = Date.now() - (S.ctx.currentTime - S.t0) * 1000; S.mode = 'recording'; tellRec(); $('rec').disabled = false; $('rec').textContent = 'Parar'; msg('Gravando...'); }
    else S.chunks.push(e.data);
  };
  src.connect(S.node);
}
async function startWebcam() {
  if (!S.landmarker) {
    msg('Pedindo a câmera...');
    const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    S.camStream = cam; $('cam').srcObject = cam; await $('cam').play();
    msg('Carregando o detector de rosto...');
    const { FaceLandmarker, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
    const make = (delegate) => FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
    try { S.landmarker = await make('GPU'); } catch { S.landmarker = await make('CPU'); }
  }
}
// The iPhone: the server passes on each frame it gets from the Live Link Face app (the weights, already in the MediaPipe names).
function startLivelink() {
  if (S.es) return;
  S.es = new EventSource('/livelink/stream');
  let sec = performance.now(), count = 0;
  S.es.onmessage = (ev) => {
    if (S.source !== 'livelink') return;
    const f = JSON.parse(ev.data); S.llIp = f.ip; S.llLast = performance.now(); count++; S.llCount = f.n;
    ingest(f.b, f.h, (f.at - S.wall0) / 1000);
    const now = performance.now(); if (now - sec >= 1000) { S.llRate = count * 1000 / (now - sec); count = 0; sec = now; }
  };
  S.es.onerror = () => { if (S.source === 'livelink') msg('Sem ligação com o servidor de captura.', true); };
}
// what both sources do with a frame: show it and, while recording or calibrating, keep it. `t` is the time inside the take (iPhone only).
function ingest(b, h, t = null) {
  S.last = { b, h };
  if (S.mapper) { const f = S.mapper.push({ b, h }); S.jl?.set(f); S.bc.postMessage({ type: 'frame', f }); }   // the director's window gets the mapped numbers, never an image
  for (const n of SHOWN) { const x = b[BLENDSHAPES.indexOf(n)] ?? 0; bars[n][0].style.width = `${Math.round(x * 100)}%`; bars[n][1].textContent = x.toFixed(2); }
  $('head').textContent = `cabeça: giro ${(h[0] * 57.3).toFixed(0)}°  inclinação ${(h[1] * 57.3).toFixed(0)}°  rolagem ${(h[2] * 57.3).toFixed(0)}°`;
  if (S.mode === 'recording') { const tt = t ?? S.ctx.currentTime - S.t0; if (tt >= 0) S.frames.push({ t: +tt.toFixed(4), b: b.map((x) => +x.toFixed(4)), h: h.map((x) => +x.toFixed(4)) }); }
  if (S.mode === 'neutral') S.neutralFrames.push({ b, h });
}

let lastVideoTime = -1, looping = false;
function runLoop() { if (!looping) { looping = true; requestAnimationFrame(loop); } }
function loop() {
  requestAnimationFrame(loop);
  if (S.source === 'livelink') {
    const live = performance.now() - S.llLast < 600; S.found = live;
    $('found').textContent = live ? 'iPhone ligado' : 'sem dados do iPhone'; $('found').className = live ? 'on' : 'off';
    $('llInfo').textContent = live ? `recebendo de ${S.llIp}, ${(S.llRate ?? 0).toFixed(0)} quadros/s (${S.llCount} no total)` : 'esperando o iPhone: nenhum quadro chegou agora';
    return;
  }
  const v = $('cam'); if (!S.landmarker || v.readyState < 2 || v.currentTime === lastVideoTime) return;
  lastVideoTime = v.currentTime;
  const r = S.landmarker.detectForVideo(v, performance.now());
  const cats = r.faceBlendshapes?.[0]?.categories, mtx = r.facialTransformationMatrixes?.[0];
  const found = !!(cats && mtx);
  $('found').textContent = found ? 'rosto achado' : 'sem rosto'; $('found').className = found ? 'on' : 'off';
  S.found = found;
  if (!found) { if (S.mode === 'recording') S.noFace++; return; }
  const byName = Object.fromEntries(cats.map((c) => [c.categoryName, c.score]));
  const e = matrixToEuler(mtx.data);
  ingest(BLENDSHAPES.map((n) => byName[n] ?? 0), [e.yaw, e.pitch, e.roll]);
}

// ---- the neutral ----------------------------------------------------------------------------------------------------------------------
async function neutral() {
  if (S.mode !== 'idle') return;
  if (!S.found) { msg(S.source === 'webcam' ? 'Sem rosto na câmera: fique de frente para ela.' : 'O iPhone não está mandando o rosto.', true); return; }
  S.mode = 'neutral'; S.neutralFrames = []; $('neutral').disabled = true; msg('Rosto parado, olhando para a câmera...');
  await new Promise((r) => setTimeout(r, NEUTRAL_SECONDS * 1000));
  S.mode = 'idle'; $('neutral').disabled = false;
  if (S.neutralFrames.length < 5) { msg('Poucos quadros com rosto; tente de novo.', true); return; }
  try { await api(`/api/neutral?source=${S.source}`, { method: 'PUT', body: JSON.stringify(averageNeutral(S.neutralFrames)) }); S.state.neutral[S.source] = true; S.neutralData = averageNeutral(S.neutralFrames); rebuildMapper(); neutralLabel(` (${S.neutralFrames.length} quadros)`); msg('Neutro gravado.'); }
  catch (e) { msg(`Não gravou o neutro: ${e.message}`, true); }
}

// ---- recording a line ------------------------------------------------------------------------------------------------------------------
function wav(chunks) {
  const n = chunks.reduce((s, c) => s + c.length, 0), buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, RATE, true); d.setUint32(28, RATE * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) d.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
  return { blob: new Blob([buf], { type: 'audio/wav' }), seconds: n / RATE };
}
function lock(on) { $('lines').style.pointerEvents = on ? 'none' : ''; $('neutral').disabled = on; }
async function toggleRecord() {
  if (S.mode === 'countdown') { clearInterval(S.countdown); S.mode = 'idle'; $('rec').textContent = 'Gravar'; lock(false); $('text').textContent = S.lines.find((x) => x.id === S.cur).text; msg('Cancelado.'); return; }
  if (S.mode === 'recording') return stop();
  if (S.mode !== 'idle' || !S.cur) return;
  if (!S.found) { msg(S.source === 'webcam' ? 'Sem rosto na câmera: fique de frente para ela.' : 'O iPhone não está mandando o rosto.', true); return; }
  if (S.ctx.state !== 'running') await S.ctx.resume();
  S.mode = 'countdown'; lock(true); $('rec').textContent = 'Cancelar';
  const line = S.lines.find((x) => x.id === S.cur); let n = COUNTDOWN;
  const tick = () => { $('text').innerHTML = `<span id="big">${n}</span>`; if (n-- === 0) { clearInterval(S.countdown); $('text').textContent = line.text; S.frames = []; S.chunks = []; S.noFace = 0; S.node.port.postMessage('start'); } };
  tick(); S.countdown = setInterval(tick, 1000);
}
async function stop() {
  S.mode = 'saving'; tellRec(); $('rec').disabled = true; msg('Salvando...');
  // the worklet answers after the last block it sent, and messages arrive in order: so everything is here when this resolves
  await new Promise((r) => { S.onStopped = r; S.node.port.postMessage('stop'); setTimeout(r, 3000); });
  const id = S.cur, { blob, seconds } = wav(S.chunks), line = S.lines.find((x) => x.id === id);
  try {
    if (S.frames.length < 5) throw new Error('quase nenhum quadro com rosto na tomada');
    const face = { id, source: S.source, text: line.text, sampleRate: RATE, duration: +seconds.toFixed(3), names: BLENDSHAPES, noFace: S.noFace, frames: S.frames };
    await api(`/api/take/${id}/audio`, { method: 'PUT', body: blob }); await api(`/api/take/${id}/face`, { method: 'PUT', body: JSON.stringify(face) });
    S.state = await (await api('/api/state')).json();
    msg(`Fala ${id} gravada: ${seconds.toFixed(1)} s, ${S.frames.length} quadros${S.noFace ? `, ${S.noFace} sem rosto` : ''}.`, false);
  } catch (e) { msg(`Não gravou: ${e.message}`, true); }
  S.mode = 'idle'; $('rec').textContent = 'Gravar'; $('rec').disabled = false; lock(false); refresh();
}
async function play() {
  if (!S.cur) return; S.replay?.pause(); S.replay = new Audio(`/api/take/${S.cur}/audio`); S.replay.play();
}

$('source').onchange = (e) => setSource(e.target.value); $('start').onclick = start; $('neutral').onclick = neutral; $('rec').onclick = toggleRecord; $('play').onclick = play;
// the mapping: `base` is what is saved, `work` is base with the controls on top, for the source on screen
// the director's view (a window of its own): it gets the mapped frames, the chosen line and when the recording starts and stops
S.bc = new BroadcastChannel('sinal-capture');
const tellLine = () => { if (S.cur) S.bc.postMessage({ type: 'line', id: S.cur }); };
const tellRec = () => S.bc.postMessage({ type: 'rec', on: S.mode === 'recording', id: S.cur });
S.bc.onmessage = (e) => { if (e.data.type === 'hello') { tellLine(); tellRec(); } };
const directorOpen = () => !!S.dirWin && !S.dirWin.closed;
function updateDraw() { S.jl?.enable($('jlOn').checked && !($('jlOnlyDir').checked && directorOpen())); }
$('director').onclick = () => { S.dirWin = window.open('/director.html', 'sinal-director', 'width=1120,height=700'); setTimeout(() => { tellLine(); tellRec(); }, 1500); };
$('jlOnlyDir').onchange = updateDraw; setInterval(updateDraw, 1000);
const ctl = { mult: {}, gaze: 1, head: 1, invGaze: false, invHead: false };
function resetControls() { ctl.mult = Object.fromEntries(GROUPS.map(([n]) => [n, 1])); ctl.gaze = 1; ctl.head = 1; ctl.invGaze = false; ctl.invHead = false; buildTune(); }
function applyControls() {
  const w = clone(S.mapBase), src = (w.sources[S.source] ??= {}); src.channels ??= {}; src.gaze ??= {}; src.head ??= {};
  for (const [name, chans] of GROUPS) for (const c of chans) src.channels[c] = { ...(src.channels[c] ?? {}), gain: (S.mapBase.sources?.[S.source]?.channels?.[c]?.gain ?? 1) * ctl.mult[name] };
  const bg = S.mapBase.sources?.[S.source]?.gaze ?? {}, bh = S.mapBase.sources?.[S.source]?.head ?? {};
  src.gaze = { ...bg, gain: (bg.gain ?? 1) * ctl.gaze, xSign: (bg.xSign ?? 1) * (ctl.invGaze ? -1 : 1), ySign: bg.ySign ?? 1 };
  src.head = { ...bh, gain: (bh.gain ?? 1) * ctl.head, yawSign: (bh.yawSign ?? 1) * (ctl.invHead ? -1 : 1) };
  S.work = w; rebuildMapper();
}
function rebuildMapper() { if (S.work) S.mapper = createLiveMapper(S.work, S.source, S.neutralData ?? null); }
async function loadNeutral() { try { S.neutralData = await (await api(`/api/neutral?source=${S.source}`)).json(); } catch { S.neutralData = null; } rebuildMapper(); }
function buildTune() {
  const t = $('tune'); t.textContent = '';
  const slider = (label, get, set) => { const l = document.createElement('span'), r = document.createElement('input'), v = document.createElement('span'); l.textContent = label; r.type = 'range'; r.min = 0; r.max = 3; r.step = 0.05; r.value = get(); v.textContent = `×${(+r.value).toFixed(2)}`; r.oninput = () => { set(+r.value); v.textContent = `×${(+r.value).toFixed(2)}`; applyControls(); }; t.append(l, r, v); };
  const check = (label, get, set) => { const l = document.createElement('span'), c = document.createElement('input'); l.textContent = label; c.type = 'checkbox'; c.checked = get(); c.onchange = () => { set(c.checked); applyControls(); }; t.append(l, c, document.createElement('span')); };
  for (const [name] of GROUPS) slider(name, () => ctl.mult[name], (v) => { ctl.mult[name] = v; });
  slider('Olhar', () => ctl.gaze, (v) => { ctl.gaze = v; }); slider('Giro da cabeça', () => ctl.head, (v) => { ctl.head = v; });
  check('Inverter o olhar', () => ctl.invGaze, (v) => { ctl.invGaze = v; }); check('Inverter o giro', () => ctl.invHead, (v) => { ctl.invHead = v; });
}
async function saveMapping() {
  $('mapState').textContent = '';
  try { await api('/api/mapping', { method: 'PUT', body: JSON.stringify(S.work) }); S.mapBase = clone(S.work); resetControls(); applyControls(); $('mapState').textContent = `salvo em mapping.json (${S.source})`; }
  catch (e) { $('mapState').textContent = `não salvou: ${e.message}`; }
}
async function startJonas() {
  try {
    const { initJonasLive } = await import('./jonas-live.js');
    S.jl = await initJonasLive($('jonasCanvas'), (t) => { $('jlStatus').textContent = t; });
    $('jlOn').onchange = updateDraw;
  } catch (e) { $('jlStatus').textContent = `Jonas ao vivo indisponível: ${e.message ?? e}`; }
}
(async () => { try { S.mapBase = await (await api('/api/mapping')).json(); resetControls(); await loadNeutral(); applyControls(); } catch (e) { msg(`Não carregou mapping.json: ${e.message}`, true); } startJonas(); })();
$('saveMap').onclick = saveMapping;
loadScript().catch((e) => msg(`Não carregou o roteiro: ${e.message}`, true));
addEventListener('pagehide', () => { S.stream?.getTracks().forEach((t) => t.stop()); S.camStream?.getTracks().forEach((t) => t.stop()); S.es?.close(); });
