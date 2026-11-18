// First person on his hands: the notebook (Jonas takes it from the pouch at his belt, opens it and turns its pages) and the pocket (his hand
// goes into the chest pocket and both come up open with what is in it). The camera is in his eyes; what is in the picture is his hands and what
// they hold. Nothing is text over the picture: the channels written in the notebook are drawn on its page (a texture), and the item in the
// hand is the object itself (a caption says its name).
// His head's own pieces (hair, strap, lamp, eyes, mouth) are hidden while the camera is in them, as the model's report says.
// Runs in steps of 1/60 s, like the rest.
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { JONAS_MARKS } from './models/jonas.js';
import { buildDecoy } from './models/decoy.js';

const STEP = 1 / 60;
// what of his head must not be drawn for a camera that sits inside it: the pieces of the head (and the inverted shell of each, its outline), and the head bone itself shrunk to nothing, so that the skin of the head, with its eye and mouth sockets, is not there either
const HEAD = ['hair', 'strap', 'lamp', 'lamp_glow', 'eyes', 'lashes', 'lidshade', 'mouth', 'mouthlow', 'hair_outline', 'strap_outline', 'lamp_outline', 'eyes_outline', 'lashes_outline', 'mouth_outline', 'mouthlow_outline'];
const VIEW = { down: 1.1, fov: 58, fwd: 0.1, up: 0.08 };      // standing, the hands are low and close: the eyes look steeply down at them
/** Where the channels go on the notebook's texture (pixels of the 1024 atlas): the front of the first leaf, the right-hand page of the spread that opens first (the doodle with 21, 63 and 88 painted in the file stays where it is, further in). */
export const PAGE = { x: 433, y: 720, w: 198, h: 301 };
const NB_LIFT = 0.055;
const url = new URL('../assets/props/caderno.glb', import.meta.url).href;

export function createHands({ r, body, audio, ui, getPlayer, ground, getRadio, channels }) {
  const T = r.THREE;
  const S = { kind: null, t: 0, clock: 0, n: 0, page: 0, turn: null, items: [], item: 0, sinceHide: 0, ready: false, onEnd: null, itemBuilt: new Map(), shown: -1 };
  const nb = { root: new T.Group(), mixer: null, clips: {}, atlas: null, tex: null, loaded: null };
  nb.root.visible = false; r.scene.add(nb.root);
  const itemRoot = new T.Group(); itemRoot.visible = false; r.scene.add(itemRoot);

  // ---- the notebook ------------------------------------------------------------------------------------------------------------
  function load() {
    nb.loaded ??= new GLTFLoader().loadAsync(url).then((g) => {
      let mat = null;
      g.scene.traverse((o) => { if (o.isMesh && !nb.atlas) nb.atlas = o.material.map?.image ?? null; });
      const cv = document.createElement('canvas'); cv.width = cv.height = 1024; nb.cv = cv;
      nb.tex = new T.CanvasTexture(cv); nb.tex.flipY = false; nb.tex.colorSpace = T.NoColorSpace; nb.tex.anisotropy = 4;
      mat = r.mat('#8a8780', { map: nb.tex, emissive: 0.05, side: T.DoubleSide });
      g.scene.traverse((o) => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });
      nb.root.add(g.scene);
      nb.mixer = new T.AnimationMixer(g.scene);
      for (const c of g.animations) { const a = nb.mixer.clipAction(c); a.setLoop(T.LoopOnce); a.clampWhenFinished = true; nb.clips[c.name] = a; }
      drawNotes();
    }).catch((e) => { console.info('hands: the notebook did not load', e?.message ?? e); });
    return nb.loaded;
  }
  const clipLen = (n) => nb.clips[n]?.getClip().duration ?? 1;
  function pose(times = {}) {
    if (!nb.mixer) return;
    for (const [n, a] of Object.entries(nb.clips)) { a.play(); a.paused = true; a.setEffectiveWeight(1); a.time = Math.max(0, Math.min(a.getClip().duration, times[n] ?? 0)); }
    nb.mixer.update(0);
  }
  /** The channels written by hand on the page: the atlas as it came, with the right-hand page written again from what Jonas knows. */
  function drawNotes() {
    if (!nb.cv || !nb.atlas) return;
    const g = nb.cv.getContext('2d'), { x, y, w, h } = PAGE;
    g.drawImage(nb.atlas, 0, 0, 1024, 1024);
    // the page as it was (the paper, the blue rules, the red margin), then the notes on it
    const paper = g.createLinearGradient(x, y, x + w, y + h); paper.addColorStop(0, '#e6dcb9'); paper.addColorStop(1, '#ddd2ad');
    g.fillStyle = paper; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(120,140,190,0.55)'; g.lineWidth = 1;
    for (let yy = y + 14; yy < y + h; yy += 17) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
    g.strokeStyle = 'rgba(190,70,60,0.6)'; g.beginPath(); g.moveTo(x + 27, y); g.lineTo(x + 27, y + h); g.stroke();
    const rad = getRadio(), list = (rad?.view().channels ?? []).filter((c) => c.known);
    const meta = Object.fromEntries((channels ?? []).map((c) => [c.id, c]));
    g.fillStyle = '#23283a'; g.textBaseline = 'middle';
    list.slice(0, 5).forEach((c, i) => {
      const cy = y + 40 + i * 54, name = (meta[c.id]?.name ?? '').replace(/^A /, '');
      g.save(); g.translate(x + 40, cy); g.rotate(-0.03 + (i % 2) * 0.05);
      g.font = 'bold 34px "Segoe Print","Bradley Hand","Comic Sans MS",cursive, sans-serif'; g.fillText(String(c.n), 0, 0);
      g.font = '19px "Segoe Print","Bradley Hand","Comic Sans MS",cursive, sans-serif'; g.fillText(name.slice(0, 11), 52, 4);
      if (c.offer) { g.strokeStyle = '#b8453a'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(22, 0, 28, 20, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    });
    nb.tex.needsUpdate = true;
  }

  // ---- the things in the pocket -----------------------------------------------------------------------------------------------------
  function paperItem(draw, w, h) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * (h / w));
    draw(cv.getContext('2d'), cv.width, cv.height);
    const tex = new T.CanvasTexture(cv); tex.flipY = true; tex.colorSpace = T.NoColorSpace; tex.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), r.mat('#9c988a', { map: tex, emissive: 0.05, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.frustumCulled = false;
    const g = new T.Group(); g.add(m); return g;
  }
  function buildItem(name) {
    if (name === 'mapa') {
      // the paper map of the way out: a few streets, a route, and an X (drawn here, no words on it)
      return paperItem((g, w, h) => {
        g.fillStyle = '#d6cfae'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(60,56,48,0.7)'; g.lineWidth = 3;
        for (const [a, b, c, d] of [[0, 60, w, 80], [0, 150, w, 128], [50, 0, 70, h], [150, 0, 190, h], [210, 0, 200, h]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
        g.lineWidth = 2; g.strokeStyle = 'rgba(120,110,90,0.6)'; for (let i = 0; i < 9; i++) { g.strokeRect(20 + (i % 3) * 62 + 8, 30 + Math.floor(i / 3) * 56, 36, 26); }
        g.strokeStyle = '#b8453a'; g.lineWidth = 4; g.setLineDash([9, 6]); g.beginPath(); g.moveTo(24, 192); g.lineTo(60, 140); g.lineTo(130, 150); g.lineTo(188, 92); g.stroke(); g.setLineDash([]);
        g.lineWidth = 5; g.beginPath(); g.moveTo(180, 82); g.lineTo(198, 102); g.moveTo(198, 82); g.lineTo(180, 102); g.stroke();
        g.strokeStyle = 'rgba(40,40,36,0.5)'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
      }, 0.15, 0.105);
    }
    if (/isca/i.test(name)) { const d = buildDecoy(r, { seed: 3 }); d.setActive(false); const g = new T.Group(); g.add(d.root); g.userData.decoy = d; return g; }
    // the things of the pump: a cloth, a can, the lid of the filter, the filter that was made of the two
    const solid = (geo, color, pos = [0, 0, 0]) => { const m = new T.Mesh(geo, r.mat(color)); m.position.set(...pos); m.frustumCulled = false; return m; };
    if (name === 'pano') { const g = new T.Group(); g.add(solid(new T.BoxGeometry(0.15, 0.02, 0.12), '#a09a88'), solid(new T.BoxGeometry(0.1, 0.02, 0.08), '#8d8878', [0.01, 0.02, 0.0])); return g; }
    if (name === 'lata') { const g = new T.Group(); g.add(solid(new T.CylinderGeometry(0.045, 0.045, 0.1, 12), '#8a8f94', [0, 0.05, 0]), solid(new T.CylinderGeometry(0.036, 0.036, 0.012, 12), '#2a2c30', [0, 0.1, 0])); return g; }
    if (name === 'tampa') { const g = new T.Group(); g.add(solid(new T.CylinderGeometry(0.085, 0.085, 0.03, 16), '#5a5f66', [0, 0.015, 0]), solid(new T.CylinderGeometry(0.03, 0.03, 0.04, 8), '#3a3e44', [0, 0.04, 0])); return g; }
    if (name === 'filtro-novo') { const g = new T.Group(); g.add(solid(new T.CylinderGeometry(0.05, 0.05, 0.11, 12), '#8a8f94', [0, 0.055, 0]), solid(new T.BoxGeometry(0.09, 0.03, 0.09), '#b4ae9a', [0, 0.115, 0])); return g; }
    // anything else: a slip of paper with a mark on it
    return paperItem((g, w, h) => { g.fillStyle = '#cfc8a8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2c3040'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 60); g.bezierCurveTo(80, 30, 120, 90, 200, 50); g.moveTo(30, 100); g.lineTo(190, 100); g.stroke(); }, 0.08, 0.05);
  }
  const NAMES = { mapa: 'Mapa de papel da saída', pano: 'Pano', lata: 'Lata furada', tampa: 'Tampa do filtro', 'filtro-novo': 'Filtro de pano e lata' };
  const itemName = (k) => NAMES[k] ?? (/isca/i.test(k) ? 'Isca sonora' : k);
  function showItem(i) {
    for (const c of [...itemRoot.children]) itemRoot.remove(c);
    const key = S.items[i]; if (key === undefined) { itemRoot.visible = false; return; }
    if (!S.itemBuilt.has(key)) S.itemBuilt.set(key, buildItem(key));
    itemRoot.add(S.itemBuilt.get(key)); S.shown = i;
    ui.sayClear(); ui.say('', itemName(key), 2.4);
  }

  // ---- hiding what is in the way of the eyes ---------------------------------------------------------------------------------------------
  function headParts(on) {
    const hb = body.socket?.('Head');
    if (hb) { if (on) { hb.userData.fpScale ??= hb.scale.x; hb.scale.setScalar(0.001); } else if (hb.userData.fpScale !== undefined) { hb.scale.setScalar(hb.userData.fpScale); delete hb.userData.fpScale; } }
    body.root.traverse((o) => {
      if (!o.isMesh || !HEAD.includes(o.name)) return;
      if (!on) { if (o.userData.fpWas !== undefined) { o.visible = o.userData.fpWas; delete o.userData.fpWas; } return; }
      if (o.userData.fpWas === undefined) o.userData.fpWas = o.visible;
      o.visible = false;
    });
  }

  // ---- the person's hands, step by step -------------------------------------------------------------------------------------------------
  function start(kind, { face = null, items = [], onEnd = null } = {}) {
    if (S.kind) return false;
    const p = getPlayer();
    Object.assign(S, { kind, t: 0, clock: 0, n: 0, page: 0, turn: null, item: 0, shown: -1, onEnd, items: ['mapa', ...items], sinceHide: 0 });
    let yaw = p.body;
    if (face) yaw = Math.atan2(-(face[0] - p.pos[0]), -(face[1] - p.pos[1]));
    S.yaw = yaw;
    body.root.position.set(p.pos[0], ground(p.pos[0], p.pos[1]), p.pos[1]); body.root.rotation.y = yaw;
    nb.root.visible = false; itemRoot.visible = false;
    if (kind === 'caderno') load().then(() => { if (S.kind === 'caderno') drawNotes(); });      // (what Jonas knows is written on the page as he takes it out)
    audio.play('corte', { gain: 0.4 });
    update(0); headParts(true);
    return true;
  }
  function end() {
    if (!S.kind) return;
    S.kind = null; nb.root.visible = false; itemRoot.visible = false; headParts(false); ui.sayClear();
    audio.play('corte', { gain: 0.4 });
    const f = S.onEnd; S.onEnd = null; f?.();
  }
  const m4 = new T.Matrix4(), v3 = new T.Vector3(), q4 = new T.Quaternion(), s3 = new T.Vector3();
  function follow(root, socketName) {
    const s = body.socket?.(socketName); if (!s) return false;
    s.updateWorldMatrix(true, false); s.matrixWorld.decompose(root.position, root.quaternion, s3);
    return true;
  }
  function update(dt) {
    const k = S.kind, t = S.t;
    if (k === 'caderno') {
      const M = JONAS_MARKS;
      const turning = S.turn;
      let action = 'caderno_pegar', at = t;
      if (turning) { action = 'caderno_folhear'; at = S.clock - turning.t0; }
      else if (S.turned) { action = 'caderno_folhear'; at = 99; }
      body.update(dt, { action, at: undefined, n: S.n, lamp: 'off', gaze: { x: 0, y: -0.4 }, t: S.clock });
      // the notebook comes out at `take`, opens up to `open`, follows his left palm
      const times = {};
      const open = Math.max(0, Math.min(1, (t - M.caderno_pegar.take) / (M.caderno_pegar.open - M.caderno_pegar.take)));
      times.open = open * clipLen('open');
      const pages = S.pages ?? (S.pages = [0, 0, 0]);
      if (turning) {
        const u = Math.max(0, Math.min(1, (S.clock - turning.t0 - M.caderno_folhear.start) / (M.caderno_folhear.end - M.caderno_folhear.start)));
        pages[turning.k] = turning.dir > 0 ? u : 1 - u;
        if (S.clock - turning.t0 >= M.caderno_folhear.dur) S.turn = null;
      }
      pages.forEach((u, i) => { times[`page_turn_${i}`] = u * clipLen(`page_turn_${i}`); });
      nb.root.visible = t >= M.caderno_pegar.take && Boolean(nb.mixer);
      pose(times);
      if (nb.root.visible && follow(nb.root, 'grip_l')) nb.root.position.y += NB_LIFT;      // a little above the palm: the fingers that hold it from behind stay under the page, not through it
    } else if (k === 'bolso') {
      const M = JONAS_MARKS.bolso_abrir;
      body.update(dt, { action: 'bolso_abrir', n: 0, lamp: 'off', gaze: { x: 0, y: -0.4 }, t: S.clock });
      const show = t >= M.show;
      if (show && S.shown !== S.item) showItem(S.item);
      itemRoot.visible = show && S.items.length > 0;
      if (itemRoot.visible && follow(itemRoot, 'grip_r')) { itemRoot.quaternion.multiply(q4.setFromAxisAngle(v3.set(1, 0, 0), Math.PI / 2)); itemRoot.translateY(0.02); itemRoot.rotateY(0.0); }
    }
  }
  /** `it.hands` { dx, back }. */
  function step(it) {
    if (!S.kind) return;
    S.t += STEP; S.clock += STEP;
    const dx = it.hands?.dx ?? 0;
    if (it.hands?.back) { end(); return; }
    if (S.kind === 'caderno' && S.t > JONAS_MARKS.caderno_pegar.open && dx) {
      const pages = S.pages ?? (S.pages = [0, 0, 0]);
      if (dx > 0) { const k = pages.findIndex((u) => u < 0.5); if (k >= 0 && !S.turn) { S.turn = { t0: S.clock, k, dir: 1 }; S.n++; S.turned = true; audio.play('corte', { gain: 0.25 }); } else if (k < 0 && !S.turn) { S.pages = [0, 0, 0]; } }
      else { let k = -1; pages.forEach((u, i) => { if (u > 0.5) k = i; }); if (k >= 0 && !S.turn) { S.turn = { t0: S.clock, k, dir: -1 }; S.n++; audio.play('corte', { gain: 0.25 }); } }
    }
    if (S.kind === 'bolso' && S.t > JONAS_MARKS.bolso_abrir.show && dx && S.items.length > 1) {
      S.item = (S.item + dx + S.items.length) % S.items.length; showItem(S.item); audio.play('corte', { gain: 0.25 });
    }
    update(STEP);
    headParts(true);
  }
  /** The camera in his eyes. */
  const head = new T.Vector3();
  function camera() {
    const sock = body.socket?.('Head'); if (!sock) return null;
    sock.updateWorldMatrix(true, false); head.setFromMatrixPosition(sock.matrixWorld);
    const yaw = S.yaw ?? 0, c = Math.cos(VIEW.down), eye = [head.x - Math.sin(yaw) * VIEW.fwd, head.y + VIEW.up, head.z - Math.cos(yaw) * VIEW.fwd];
    const dir = [-Math.sin(yaw) * c, -Math.sin(VIEW.down), -Math.cos(yaw) * c];
    return { eye, at: [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]], dir, fov: r.camera.aspect < 1 ? 84 : VIEW.fov, aim: { pos: eye, dir } };      // (a phone held upright is narrow: a wider lens keeps the open notebook in the picture)
  }
  function hint(dev) {
    if (!S.kind) return null;
    const g = dev === 'touch' ? '' : dev === 'gamepad' ? 'LB RB' : '← →';
    return { label: S.kind === 'caderno' ? 'Folhear' : 'Trocar', glyph: g, desk: true };
  }
  return {
    start, step, end, camera, hint, drawNotes, view: VIEW,
    get active() { return Boolean(S.kind); },
    get kind() { return S.kind; },
    /** The canvas of the notebook's texture and the texture (for the tests and the pictures). */
    get canvas() { return nb.cv ?? null; },
    get texture() { return nb.tex ?? null; },
    get state() { return { kind: S.kind, t: +S.t.toFixed(2), notebook: nb.root.visible, loaded: Boolean(nb.mixer), atlas: Boolean(nb.atlas), pos: nb.root.position.toArray().map((x) => +x.toFixed(2)) }; },
    get item() { return S.items[S.item]; },
    get page() { return (S.pages ?? [0, 0, 0]).map((u) => Math.round(u)); },
    get ready() { return nb.loaded ?? Promise.resolve(); },
    load,
  };
}
