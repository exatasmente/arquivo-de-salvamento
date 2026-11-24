// "Movimento do corpo": the pose of the body from a video the person picked (filmed on a phone) or from the webcam, live.
// The video is read here, in the page, frame by frame at its own frame rate, by the MediaPipe Pose Landmarker (VIDEO mode). What is kept is
// numbers only: the 33 world landmarks (metres, hips at the origin) and the 33 image landmarks of each frame, saved by the capture server as
// <name>.pose.json in the --out folder. The image is shown here (the <video> and a skeleton over it) and is never drawn into a canvas,
// recorded or sent. The next step is `node tools/mocap/process.mjs` (see README, "Movimento do corpo").
const VERSION = '0.10.21';   // @mediapipe/tasks-vision, the same fixed version as the face
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = ['full', 'heavy', 'lite'];
const modelUrl = (n) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${n}/float16/1/pose_landmarker_${n}.task`;
// the skeleton drawn over the video (pairs of the 33 landmarks)
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
const $ = (id) => document.getElementById(id);
const say = (t, err = false) => { const e = $('bodyMsg'); e.textContent = t; e.className = err ? 'err' : ''; };
const r = (v, n) => { const k = 10 ** n; return Math.round(v * k) / k; };

const B = { landmarker: null, model: null, running: false, cancel: false, frames: [], video: null, live: null, last: null };
window.__body = B;

async function landmarkerFor(model) {
  const want0 = $('bodyDelegate')?.value ?? 'auto';
  if (B.landmarker && B.model === model && B.want === want0) return B.landmarker;
  B.want = want0;
  B.landmarker?.close?.(); B.landmarker = null;
  say('Carregando o detector de corpo (a primeira vez baixa o modelo)...');
  const { PoseLandmarker, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: modelUrl(model), delegate }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4 });
  const want = $('bodyDelegate')?.value ?? 'auto';
  if (want === 'CPU') { B.landmarker = await make('CPU'); B.delegate = 'CPU'; }
  else { try { B.landmarker = await make('GPU'); B.delegate = 'GPU'; } catch { B.landmarker = await make('CPU'); B.delegate = 'CPU'; } }
  B.model = model;
  return B.landmarker;
}

// one frame of the result, as kept: null when nobody was found
function keep(res, t) {
  const w = res.worldLandmarks?.[0], im = res.landmarks?.[0];
  if (!w || !im) return { t: r(t, 4), w: null, i: null };
  return { t: r(t, 4), w: w.map((p) => [r(p.x, 4), r(p.y, 4), r(p.z, 4), r(p.visibility ?? 0, 3)]), i: im.map((p) => [r(p.x, 5), r(p.y, 5), r(p.z, 5), r(p.visibility ?? 0, 3)]) };
}
function draw(fr) {
  const c = $('bodyOverlay'), v = B.video || $('bodyVideo'); if (!c) return;
  const W = v.videoWidth || 640, H = v.videoHeight || 480; if (c.width !== W) { c.width = W; c.height = H; }
  const g = c.getContext('2d'); g.clearRect(0, 0, W, H); if (!fr?.i) return;
  g.lineWidth = Math.max(2, W / 400); g.strokeStyle = '#e0a24a';
  for (const [a, b] of BONES) { g.beginPath(); g.moveTo(fr.i[a][0] * W, fr.i[a][1] * H); g.lineTo(fr.i[b][0] * W, fr.i[b][1] * H); g.stroke(); }
}

// the frame rate of a video: the media times of a few frames played (the page cannot read the container)
const COMMON = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
async function estimateFps(v) {
  if (!v.requestVideoFrameCallback) return null;
  const times = [];
  await new Promise((done) => {
    const step = (_n, md) => { times.push(md.mediaTime); if (times.length >= 14) done(); else v.requestVideoFrameCallback(step); };
    v.requestVideoFrameCallback(step); v.currentTime = 0; v.play().catch(done); setTimeout(done, 4000);
  });
  v.pause();
  const d = []; for (let k = 1; k < times.length; k++) if (times[k] > times[k - 1]) d.push(times[k] - times[k - 1]);
  if (d.length < 4) return null;
  d.sort((a, b) => a - b); const f = 1 / d[Math.floor(d.length / 2)];
  const near = COMMON.find((c) => Math.abs(c - f) / c < 0.03);
  return near ?? Math.round(f * 100) / 100;
}
const seek = (v, t) => new Promise((ok) => { const on = () => { v.removeEventListener('seeked', on); ok(); }; v.addEventListener('seeked', on); v.currentTime = t; });

async function analyze() {
  const v = $('bodyVideo'); if (!v.src || B.running) return;
  const fps = Number($('bodyFps').value), model = $('bodyModel').value;
  if (!(fps > 0)) return say('Ponha a taxa de quadros do vídeo.', true);
  B.running = true; B.cancel = false; B.frames = []; B.video = v; $('bodyRun').textContent = 'Parar';
  try {
    const lm = await landmarkerFor(model);
    const n = Math.floor(v.duration * fps), t0 = performance.now();
    let found = 0;
    for (let k = 0; k < n && !B.cancel; k++) {
      const t = k / fps;
      await seek(v, t + 0.5 / fps);        // the middle of the frame's interval, so a seek never lands on the neighbour
      const res = lm.detectForVideo(v, Math.round(k * 1000 / fps));
      const fr = keep(res, t); B.frames.push(fr); if (fr.w) found++;
      if (k % 50 === 0) console.log(`body: frame ${k}/${n}, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      if (k % 3 === 0 || k === n - 1) { draw(fr); say(`Lendo o vídeo: quadro ${k + 1} de ${n} (${found} com pessoa)`); await new Promise((q) => setTimeout(q)); }
    }
    const took = (performance.now() - t0) / 1000;
    const doc = { version: 1, kind: 'pose', source: 'video', model: `pose_landmarker_${model}`, lib: VERSION, delegate: B.delegate, fps, width: v.videoWidth, height: v.videoHeight, duration: r(v.duration, 3), frames: B.frames };
    B.doc = doc;
    if (B.cancel) return say(`Parado no quadro ${B.frames.length}. Nada foi salvo.`);
    if (!found) return say('Nenhuma pessoa encontrada no vídeo. Nada foi salvo.', true);
    await save(doc, `${n} quadros em ${took.toFixed(0)} s, ${found} com pessoa`);
  } catch (e) { say(`Erro: ${e.message}`, true); }
  finally { B.running = false; $('bodyRun').textContent = 'Analisar o vídeo'; }
}
async function save(doc, what) {
  const name = ($('bodyName').value || 'take-01').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
  const res = await fetch(`/api/body/${name}`, { method: 'PUT', body: JSON.stringify(doc) });
  if (!res.ok) throw new Error(`salvar: ${res.status}`);
  B.saved = { name, frames: doc.frames.length };
  say(`Salvo ${name}.pose.json: ${what}. Próximo passo: node tools/mocap/process.mjs ${name}.pose.json --name ${name}`);
}

// ---- the webcam, live (optional): the same numbers, the image only shown here ------------------------------------------------------------
async function live() {
  const btn = $('bodyLive');
  if (B.live) { B.live.stop(); return; }
  try {
    const model = $('bodyModel').value;
    say('Pedindo a câmera...');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    const v = $('bodyVideo'); v.removeAttribute('src'); v.srcObject = stream; v.controls = false; await v.play(); B.video = v;
    const lm = await landmarkerFor(model);
    const L = { frames: [], rec: false, t0: 0, last: -1, stop: null };
    let alive = true;
    L.stop = () => { alive = false; stream.getTracks().forEach((t) => t.stop()); v.srcObject = null; B.live = null; btn.textContent = 'Webcam ao vivo'; $('bodyRec').disabled = true; draw(null); if (L.frames.length) finish(L); };
    B.live = L; btn.textContent = 'Desligar a webcam'; $('bodyRec').disabled = false; $('bodyRec').textContent = 'Gravar os números';
    $('bodyRec').onclick = () => { L.rec = !L.rec; if (L.rec) { L.frames = []; L.t0 = performance.now(); } $('bodyRec').textContent = L.rec ? 'Parar de gravar' : 'Gravar os números'; if (!L.rec && L.frames.length) finish(L); };
    const loop = () => {
      if (!alive) return; requestAnimationFrame(loop);
      if (v.currentTime === L.last) return; L.last = v.currentTime;
      const now = performance.now(), res = lm.detectForVideo(v, Math.round(now));
      const fr = keep(res, (now - L.t0) / 1000); draw(fr);
      if (L.rec) L.frames.push(fr);
    };
    say('Webcam ligada. "Gravar os números" guarda só os números; a imagem não é gravada.'); loop();
  } catch (e) { say(`Erro: ${e.message}`, true); }
}
async function finish(L) {
  const frames = L.frames.splice(0); if (frames.length < 10) return say('Gravação curta demais, nada foi salvo.', true);
  const dur = frames[frames.length - 1].t, v = $('bodyVideo');
  const doc = { version: 1, kind: 'pose', source: 'webcam', model: `pose_landmarker_${B.model}`, lib: VERSION, delegate: B.delegate, fps: r(frames.length / dur, 2), width: v.videoWidth || 1280, height: v.videoHeight || 720, duration: r(dur, 3), frames };
  try { await save(doc, `${frames.length} quadros, ${dur.toFixed(1)} s`); } catch (e) { say(`Erro: ${e.message}`, true); }
}

// ---- the controls ---------------------------------------------------------------------------------------------------------------------------
if ($('bodyFile')) {
  $('bodyModel').innerHTML = MODELS.map((m) => `<option value="${m}">${m === 'full' ? 'full (equilibrado)' : m === 'heavy' ? 'heavy (mais preciso, mais lento)' : 'lite (rápido)'}</option>`).join('');
  $('bodyFile').onchange = async () => {
    const f = $('bodyFile').files[0]; if (!f) return;
    const v = $('bodyVideo'); if (v.srcObject) B.live?.stop(); v.srcObject = null;
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(f); v.controls = true; v.muted = true;     // read here; the file is not uploaded anywhere
    $('bodyName').value = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'take-01';
    await new Promise((ok) => { v.onloadedmetadata = ok; });
    say('Medindo a taxa de quadros...');
    const fps = await estimateFps(v); if (fps) $('bodyFps').value = fps;
    say(`${f.name}: ${v.videoWidth}x${v.videoHeight}, ${v.duration.toFixed(1)} s, ${fps ? fps + ' quadros/s' : 'taxa não detectada, confira o campo'}. Clique em Analisar.`);
    $('bodyRun').disabled = false;
  };
  $('bodyRun').onclick = () => { if (B.running) B.cancel = true; else analyze(); };
  $('bodyLive').onclick = live;
}
