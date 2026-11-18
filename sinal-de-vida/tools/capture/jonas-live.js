// The panel "Jonas ao vivo": the game's own Jonas (src/models/jonas.js, with the game's render and look) acted by the frames the page
// receives, through the same mapping that goes to the cutscene. It only reads the game (served under /game/); nothing is sent anywhere.
// The pose is the cutscene's: seated, the head hanging a little, the head and the face on top of it (see src/cutscenes/radio-teste.js).
const GAME = '/game/';
const CHIN = 0.2;        // the pose leaves his head hanging: this brings the face up to talk (the same as the cutscene's CHIN)
const FRAME_MS = 1000 / 30;
const BONES = ['neck_01', 'Head'];

export async function initJonasLive(canvas, onStatus = () => {}) {
  onStatus('Carregando o Jonas...');
  const [{ createRender }, { jonasReady }, { buildPerson }] = await Promise.all([import(`${GAME}src/render.js`), import(`${GAME}src/models/jonas.js`), import(`${GAME}src/models/person.js`)]);
  const r = createRender(canvas), T = r.THREE;
  const W = 520, H = 440; r.resize(W, H); canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.aspectRatio = `${W} / ${H}`;
  await jonasReady.catch(() => {});
  const jonas = buildPerson(r, { role: 'jonas', seed: 1 });
  jonas.root.position.set(0, 0.14, 0); r.scene.add(jonas.root);
  // a light like the radio scene's: cold night around, the warm work lamp as the key, in front of him and a little to the side
  r.light({ ambient: '#4a5472', key: '#6a6a7c', keyDir: [0.4, 0.8, -0.9], fog: '#05070a', fogNear: 6, fogFar: 24 });
  r.point(0, { pos: [-0.7, 1.9, -1.0], color: '#ffb468', range: 5 });
  r.point(1, { pos: [1.0, 1.5, -0.8], color: '#3a4c7a', range: 4 });
  r.camera.fov = 26; r.camera.updateProjectionMatrix(); r.camera.position.set(0.02, 1.38, -1.15); r.camera.lookAt(0.02, 1.3, 0);   // he faces -z, as in the cutscene

  // the bones turned on top of the pose (what is left in a bone is taken back before the next pose, as in the cutscene)
  let bones = null, morphs = null, count = -1;
  const collect = () => {
    let n = 0; jonas.root.traverse(() => { n++; }); if (n === count) return; count = n;
    bones = Object.fromEntries(BONES.map((b) => [b, []])); morphs = [];
    jonas.root.traverse((o) => { if (o.isBone && bones[o.name]) bones[o.name].push(o); if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
  };
  const q = new T.Quaternion(), pq = new T.Quaternion(), ax = new T.Vector3(), left = new Map(), base = new Map();
  const restore = () => { for (const [b, l] of left) if (b.quaternion.equals(l)) b.quaternion.copy(base.get(b)); left.clear(); };
  const turn = (name, axis, angle) => {
    if (!angle) return;
    for (const b of bones[name]) {
      if (!left.has(b)) base.set(b, b.quaternion.clone());
      b.parent.getWorldQuaternion(pq); q.setFromAxisAngle(ax.set(...axis), angle);
      b.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq)); left.set(b, b.quaternion.clone());
    }
  };
  let frame = null, shown = 0, last = 0, on = true;
  const draw = (now) => {
    requestAnimationFrame(draw);
    if (!on || document.hidden || now - last < FRAME_MS - 1) return;   // at most 30 fps, and none with the tab hidden
    last = now; const t = now / 1000, f = frame;
    restore();
    jonas.setPose({ action: 'sentado', face: null, faceWeight: 0, mouth: null, gaze: f ? f.gaze : null, blink: f ? f.morphs.blink : null, t });
    collect();
    if (f) for (const m of morphs) for (const [k, v] of Object.entries(f.morphs)) { const i = m.morphTargetDictionary[k]; if (i !== undefined && k !== 'blink') m.morphTargetInfluences[i] = v; }
    const yaw = f ? f.head.yaw : 0, pitch = CHIN + (f ? f.head.pitch : 0), roll = f ? f.head.roll : 0;
    const up = [0, 1, 0], hr = [Math.cos(yaw), 0, -Math.sin(yaw)];
    turn('neck_01', up, yaw * 0.45); turn('Head', up, yaw * 0.55);
    turn('neck_01', hr, pitch * 0.4); turn('Head', hr, pitch * 0.6);
    turn('Head', [Math.sin(yaw), 0, Math.cos(yaw)], roll);
    r.draw(); shown++;
  };
  requestAnimationFrame(draw);
  onStatus('');
  return { set(f) { frame = f; }, enable(v) { on = v; }, get shown() { return shown; }, jonas };
}
