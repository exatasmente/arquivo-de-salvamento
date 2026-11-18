// The director's view: the full set of the cutscene "radio-teste" (the game's own code: src/cutscenes/radio-teste.js and what it imports),
// shot by the cutscene's own cameras, with Jonas acted live by the capture page. The face arrives by BroadcastChannel (same origin), already
// mapped by the same live mapper; nothing here goes over the network and no image is ever sent.
const GAME = '/game/';
const FRAME_MS = 1000 / 30, STALE_MS = 700;
const $ = (id) => document.getElementById(id);
const fail = (e) => { $('err').style.display = 'block'; $('err').textContent = `Não montou o cenário: ${e?.message ?? e}`; };

try {
  const [{ createRender }, cut, { jonasReady }] = await Promise.all([import(`${GAME}src/render.js`), import(`${GAME}src/cutscenes/radio-teste.js`), import(`${GAME}src/models/jonas.js`)]);
  const def = cut.default, r = createRender($('c'));
  const size = () => { const b = $('stage').getBoundingClientRect(); r.resize(Math.max(320, Math.round(b.width)), Math.max(180, Math.round(b.height))); };
  size(); addEventListener('resize', size); document.addEventListener('fullscreenchange', size);
  await jonasReady.catch(() => {});
  const sc = def.build(r); r.scene.add(sc.group);

  // ---- the state the capture page tells us ------------------------------------------------------------------------------------------
  const jonasLines = def.lines.filter((l) => l.who === 'jonas');
  const S = { line: jonasLines[0], rec: false, recAt: 0, frameAt: 0, shown: 0, shot: 'auto', t: 0, kind: '' };
  const bc = new BroadcastChannel('sinal-capture');
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'frame') { S.frameAt = performance.now(); cut.setLive({ w: 1, morphs: m.f.morphs, gaze: m.f.gaze, head: m.f.head }); }
    else if (m.type === 'line') S.line = def.lines.find((l) => l.id === m.id) ?? S.line;
    else if (m.type === 'rec') { S.rec = !!m.on; if (m.on) S.recAt = performance.now(); }
  };
  bc.postMessage({ type: 'hello' });   // a reloaded main page answers with the line and the recording state: the director can be opened at any time

  // ---- the shots ---------------------------------------------------------------------------------------------------------------------------
  const sel = $('shot'); sel.append(new Option('Automático (segue os cortes da fala)', 'auto'));
  for (const k of def.shotKinds) sel.append(new Option(`${k}: ${def.shotDesc[k] ?? k}`, k));
  sel.onchange = () => { S.shot = sel.value; };
  $('safe').onclick = () => { $('stage').classList.toggle('safe-on'); $('safe').classList.toggle('on'); };
  $('full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else $('stage').requestFullscreen?.(); };

  // while the capture is not recording, the line plays in a loop (its own time, so the body and the cuts are the scene's)
  const sceneTime = (now) => {
    const l = S.line, dur = Math.max(0.5, l.dur);
    if (S.rec) return Math.min(def.total - 0.01, l.start + (now - S.recAt) / 1000);
    return l.start + 0.3 + ((now / 1000) % dur);
  };
  let last = 0;
  const draw = (now) => {
    requestAnimationFrame(draw);
    if (document.hidden || now - last < FRAME_MS - 1) return;   // at most 30 fps, none while hidden
    last = now;
    const live = now - S.frameAt < STALE_MS;
    if (!live) cut.setLive(null);
    $('live').textContent = live ? 'ao vivo' : 'sem dados ao vivo'; $('live').className = live ? 'on' : 'off';
    const t = sceneTime(now); S.t = t;
    let cam, name;
    if (S.shot === 'auto') { cam = def.camera(t); name = def.cuts.find((c) => t >= c.t0 && t < c.t1)?.kind ?? ''; } else { cam = def.shot(S.shot, 0.5); name = S.shot; }
    S.kind = name; $('shotName').textContent = `${name ? `${name} — ${def.shotDesc[name] ?? ''}` : ''}${S.shot === 'auto' ? '  (automático)' : ''}`;
    if (r.camera.fov !== cam.lens) { r.camera.fov = cam.lens; r.camera.updateProjectionMatrix(); }
    sc.lights.apply();
    r.camera.position.set(...cam.eye); r.camera.lookAt(...cam.at);
    sc.update(t, { listener: cam.eye, dir: [cam.at[0] - cam.eye[0], cam.at[1] - cam.eye[1], cam.at[2] - cam.eye[2]] });
    r.draw(); S.shown++;
    const text = `Jonas: ${S.line.text}`; if ($('cap').textContent !== text) $('cap').textContent = text;
  };
  requestAnimationFrame(draw);
  S.jonas = sc.jonas; window.__director = S;
} catch (e) { fail(e); console.error(e); }
