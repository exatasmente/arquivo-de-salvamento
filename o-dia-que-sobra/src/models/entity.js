// The entity of the Sol (phase 4 model): Valdir, still on shift. A tall, thin human in the old attendant's
// uniform (ochre and brown, from the 'frentista-antigo' customer), whose face is hidden by a paper mask
// of the 1998 advertisement, glued on and worn: a flat ochre disc with a painted ad smile. Behind the
// painted smile the paper is torn and irregular human teeth show. No rays, no crown, no costume head:
// the mask is only as big as the face and sits under a plain attendant's cap. No blood anywhere.
//
//   buildEntity(r, { seed, stage }) -> {
//     root, joints, height, eyeHeight,
//     stage,                 1..4 (the week)
//     setStage(n),           repaints the mask: more worn each week, the smile wider, the teeth more visible
//     setPose(nome, t),      'costas' | 'olhando' | 'observar' | 'andar' | 'correr' | 'inclinar' | 'sumir'
//                            t is the time of the game for 'andar'/'correr' (stepped, 4 frames) and the time
//                            SINCE THE POSE STARTED for 'inclinar' (10 s to tilt), 'observar' (4 s) and 'sumir' (2 s)
//     update(t, estado),     estado = { pose?, desde?: time the pose started (default 0), olhar?: 0..1 (observar
//                            overrides the 4 s sweep), base?: 'costas'|'olhando' (what 'observar' stands as) }
//                            Called with the time going forward in small steps it also reads how far the root moved:
//                            the frames of 'andar' and 'correr' advance with the DISTANCE (one frame per 0.35 m / 0.85 m:
//                            the feet do not skate), and the body trails a sudden turn of the root for about 0.25 s.
//                            By the week the stillness is not quite still: from week 2 a hard one-frame twitch of the head
//                            every few seconds (more often and wider each week), a stepped sway from week 2, and the walk
//                            leans and tilts more.
//     mask,                  { mesh, texture, setStage, stage }
//   }
// Stepped animation, few frames, hard poses, as in the games of the time. No Math.random, no real clock.
import { buildCustomer } from './customer.js';
import { makeTexture } from './faces.js';
import { mulberry32 } from '../rng.js';

export const ENTITY_POSES = ['costas', 'olhando', 'observar', 'andar', 'correr', 'inclinar', 'sumir'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rgb = (c) => `rgb(${c.map((x) => Math.round(Math.max(0, Math.min(255, x)))).join(',')})`;

// ---------------------------------------------------------------- the paper mask texture (64x64)
// Layout (same planar projection as the human face): u = 0.5 + x / 0.19, v = (y - 1.50) / 0.25.
// Eyes on row 28, the smile arc from row 44, the chin at row ~60.
function paintMask(canvas, stage, seed) {
  const g = canvas.getContext('2d'), r = mulberry32(seed * 977 + stage * 131 + 3);
  const px = (x, y, c) => { g.fillStyle = rgb(c); g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const rect = (x, y, w, h, c) => { g.fillStyle = rgb(c); g.fillRect(x, y, w, h); };
  const S = stage;
  const paper = [222, 166, 52];                                     // ochre-yellow ad paper
  // paper with a grain, a little darker toward the edges, stains growing with the weeks
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const ex = Math.abs(x - 31.5) / 32, ey = Math.abs(y - 30) / 34;
    const k = 1 - 0.18 * (ex * ex + ey * ey) + (r() - 0.5) * (0.06 + 0.03 * S);
    px(x, y, paper.map((v) => v * k));
  }
  for (let i = 0; i < 2 + S * 3; i++) {                              // brown water stains
    const cx = r() * 64, cy = r() * 64, rad = 3 + r() * (3 + S * 2);
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y < rad * rad && r() < 0.8) px(cx + x, cy + y, [paper[0] * 0.72, paper[1] * 0.62, paper[2] * 0.5]);
  }
  // cheeks: two flat orange discs, the way the ads did it
  for (const sx of [-1, 1]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) px(32 + sx * 18 + x, 38 + y, [214, 118, 40]);
  // brows: two short strokes
  for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) px(32 + sx * 12 - 4 + i, 22 - (i > 4 ? 1 : 0) * sx * 0, [110, 60, 24]);
  // eyes: black ad ovals with a white spark; from week 3 the right one is a torn hole, in week 4 both
  const hole = (cx) => {
    for (let y = 24; y <= 32; y++) for (let x = cx - 3; x <= cx + 3; x++) if (((x - cx) / 3.2) ** 2 + ((y - 28) / 4.6) ** 2 <= 1 && r() < 0.96) px(x, y, [22, 16, 14]);
    rect(cx - 1, 28, 2, 2, [208, 202, 190]); px(cx, 29, [14, 12, 12]);       // a pale human eye far inside
  };
  const oval = (cx) => { for (let y = 24; y <= 32; y++) for (let x = cx - 3; x <= cx + 3; x++) if (((x - cx) / 3.2) ** 2 + ((y - 28) / 4.6) ** 2 <= 1) px(x, y, [26, 18, 14]); px(cx - 1, 26, [240, 230, 200]); };
  oval(20); oval(44);
  if (S >= 3) hole(44);
  if (S >= 4) hole(20);
  // the painted smile: a thick U from ear to ear; wider and deeper every week
  const hw = [10, 12.5, 15.5, 20][S - 1], depth = [6, 7, 8, 9][S - 1], yc = 44;
  const arcY = (x) => yc + depth * (1 - ((x - 32) / hw) ** 2);
  const th = [0, 2, 4, 7][S - 1];                                    // height of the tear under the line
  const line = [96, 38, 24];
  // the slit: dark cavity, then irregular human teeth hanging from the line (week 1: only a hint at one end)
  const tearAt = (x) => {
    const d = Math.abs(x - 32) / hw; if (d > 1) return 0;
    if (S === 1) return d > 0.62 && x > 32 ? 2 : 0;
    return Math.round(th * Math.sqrt(1 - d * d * 0.9));
  };
  let x = Math.ceil(32 - hw);
  while (x <= 32 + hw) {
    const w = 2 + Math.floor(r() * 2), gap = r() < 0.18 && S >= 3 ? 1 + Math.floor(r() * 2) : 0; // a missing tooth now and then
    for (let xx = x; xx < x + w && xx <= 32 + hw; xx++) {
      const t = tearAt(xx); if (!t) continue;
      const top = Math.round(arcY(xx)) + 1, h = Math.max(1, t - Math.floor(r() * (S >= 3 ? 3 : 2)));
      for (let yy = top; yy < top + t; yy++) px(xx, yy, [26, 19, 16]);                         // dark inside, no colour of blood
      if (xx > x || w === 1) for (let yy = top; yy < top + h; yy++) px(xx, yy, [200 - r() * 24, 188 - r() * 24, 150 - r() * 22]);
      if (xx === x + w - 1 || (S >= 4 && r() < 0.15)) px(xx, top + h - 1, [120, 108, 84]);  // the gap between teeth
      if (S >= 4 && xx % 7 === 3) for (let yy = top + t - 2; yy < top + t; yy++) px(xx, yy, [180 - r() * 30, 170 - r() * 30, 134 - r() * 20]); // a lower tooth
    }
    x += w + gap;
  }
  // the line itself (thick, two pixels), torn away at the weeks' tear
  for (let xx = Math.ceil(32 - hw); xx <= 32 + hw; xx++) {
    const y = Math.round(arcY(xx));
    if (S >= 3 && tearAt(xx) > 3 && ((xx * 5 + y) % 4 === 0)) continue;
    px(xx, y, line); px(xx, y - 1, line);
  }
  for (const sx of [-1, 1]) { px(32 + sx * (hw + 1), yc - 1, line); px(32 + sx * (hw + 1), yc - 2, line); px(32 + sx * (hw + 2), yc - 3, line); } // upturned ends
  // creases and cracks growing with the weeks
  for (let i = 0; i < 2 + S * 3; i++) {
    let cx = 6 + r() * 52, cy = 4 + r() * 56; const len = 5 + r() * (6 + S * 3);
    for (let k = 0; k < len; k++) { px(cx, cy, [112, 68, 28]); cx += (r() - 0.5) * 1.6; cy += r() < 0.5 ? 1 : 0.4; }
  }
  // a fold line down the middle, where it was glued over the nose
  for (let y = 18; y < 52; y++) if (y % 3) px(32, y, [180, 128, 40]);
  // torn, dirty edge; from week 2 two strips of old tape at the forehead
  for (let y = 0; y < 64; y++) for (let xx = 0; xx < 64; xx++) {
    const e = Math.min(xx, 63 - xx, y, 63 - y);
    if (e < 2 + (S >= 3 ? 1 : 0) && r() < 0.8) px(xx, y, [150 - S * 6, 98 - S * 5, 40]);
    else if (e < 4 && r() < 0.1 * S) px(xx, y, [238, 222, 176]);   // peeled white fibres
  }
  if (S >= 2) for (const tx of [10, 46]) { rect(tx, 8, 9, 4, [226, 220, 190]); for (let i = 0; i < 6; i++) px(tx + (r() * 9) | 0, 8 + ((r() * 4) | 0), [196, 188, 150]); }
}

// ---------------------------------------------------------------- the mask shell: a partial tube over the face
function maskGeometry(THREE, L) {
  const bf = { lean: 0.97, mid: 1.0, heavy: 1.1 }[L.build] ?? 1;
  const fw = 0.96 + (bf - 1) * 0.5, jw = L.jaw * (1 + (bf - 1) * 0.6);
  const prof = [
    { y: 1.50, rx: 0.030 * jw, rz: 0.044, cz: 0.034 }, { y: 1.525, rx: 0.060 * jw * fw, rz: 0.074, cz: 0.020 },
    { y: 1.56, rx: 0.080 * fw * jw, rz: 0.094, cz: 0.004 }, { y: 1.62, rx: 0.090 * fw, rz: 0.103, cz: 0 },
    { y: 1.69, rx: 0.088 * fw, rz: 0.100, cz: 0 }, { y: 1.73, rx: 0.066 * fw, rz: 0.078, cz: 0 },
  ];
  const at = (y) => {
    for (let k = 0; k < prof.length - 1; k++) {
      const a = prof[k], b = prof[k + 1];
      if (y >= a.y && y <= b.y) { const t = (y - a.y) / (b.y - a.y), l = (f) => a[f] + (b[f] - a[f]) * t; return { rx: l('rx'), rz: l('rz'), cz: l('cz') }; }
    }
    return prof[prof.length - 1];
  };
  const y0 = 1.516, y1 = 1.696, NR = 14, NA = 12, A = 1.1;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= NR; k++) {
    const y = y0 + ((y1 - y0) * k) / NR, q = at(y);
    for (let i = 0; i <= NA; i++) {
      const th = -A + (2 * A * i) / NA;
      // the jaw end is rounder: pull the corners in so the paper outlines a face, not a plate
      const pull = 1 - 0.18 * Math.max(0, (1.56 - y) / 0.05);
      let x = Math.sin(th) * q.rx * 1.06 * pull, z = (q.cz + Math.cos(th) * q.rz) * 1.06 + 0.004;
      z += 0.034 * Math.exp(-(((y - 1.605) / 0.032) ** 2)) * Math.exp(-((x / 0.03) ** 2));          // the paper tents over the nose
      pos.push(x, y - 1.54, z);
      uv.push(0.5 + x / 0.19, (y - 1.50) / 0.25);
    }
  }
  const W = NA + 1;
  for (let k = 0; k < NR; k++) for (let i = 0; i < NA; i++) { const a = k * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the entity
export function buildEntity(r, { seed = 1998, stage = 1 } = {}) {
  const THREE = r.THREE;
  const cust = buildCustomer(r, {
    categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', seed, castsShadow: false,
    acessorios: [], look: { height: 2.02, build: 'lean', skin: '#a89a86', hair: '#7e7c78', hairStyle: 'short' },
  }, { seed });
  const J = cust.joints, root = cust.root, fig = root.children[0];
  const L = cust.look;

  // the plain attendant's cap, set high so the mask shows under it (a cap, not a crown)
  const cap = r.mat(new THREE.Color('#3e2c1c'), { map: 'cloth' });
  const dome = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5); dome.scale(0.112, 0.085, 0.118);
  const d = new THREE.Mesh(dome, cap); d.position.set(0, 0.158, -0.006); J.head.add(d);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.007, 0.07), cap); vis.position.set(0, 0.16, 0.12); vis.rotation.x = 0.1; J.head.add(vis);

  // the mask
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const texture = makeTexture(THREE, canvas, true);
  const mesh = new THREE.Mesh(maskGeometry(THREE, L), r.mat(0xffffff, { map: texture }));
  mesh.name = 'mask'; J.head.add(mesh);
  // a curled flap of paper at the jaw, bigger each week (a thin box, not a ray)
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.002, 0.03), r.mat(new THREE.Color('#c89a3c'), { map: 'cloth' }));
  flap.position.set(-0.068, -0.012, 0.072); flap.rotation.set(0.35, 0.9, 0.5); J.head.add(flap);

  const mask = { mesh, texture, stage: 0, setStage(n) { return setStage(n); } };
  let stageNow = 0;
  function setStage(n) {
    const s = Math.max(1, Math.min(4, Math.round(n)));
    stageNow = mask.stage = s;
    paintMask(canvas, s, seed); texture.needsUpdate = true;
    flap.visible = s >= 2; flap.scale.set(1 + (s - 2) * 0.25, 1, 1 + (s - 2) * 0.25);
    return s;
  }
  setStage(stage);

  // ---- poses: hard, few frames
  const all = Object.values(J);
  const reset = () => { for (const j of all) j.rotation.set(0, 0, 0); fig.rotation.set(0, 0, 0); fig.position.x = 0; root.visible = true; };
  const step = (t, fps) => Math.floor(t * fps) / fps;
  const hash = (n) => { const x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); };
  let current = 'costas';
  function arms(sh, el) { J.shoulderL.rotation.z = sh; J.shoulderR.rotation.z = -sh; J.elbowL.rotation.x = el; J.elbowR.rotation.x = el; }
  function setPose(nome, t = 0, o = {}) {
    const p = ENTITY_POSES.includes(nome) ? nome : 'costas';
    current = p; reset();
    const w = stageNow;
    // idle life: a one-frame twitch every (10 - 2w) s from week 2, and a stepped sway; never in motion poses
    const idleLife = (t0) => {
      if (w < 2) return;
      const per = 10 - 2 * w, slot = Math.floor(t0 / per), local = t0 - slot * per;
      if (local < 0.12) { J.head.rotation.z += (hash(slot * 3 + 1) - 0.5) * 0.16 * w; J.head.rotation.y += (hash(slot * 3 + 2) - 0.5) * 0.12 * w; if (w >= 3) J.wristL.rotation.x += -0.5 * hash(slot * 3 + 3); }
      fig.position.x = Math.round(Math.sin(t0 * 0.5) * 3) / 3 * 0.012 * w;
    };
    switch (p) {
      case 'costas':
        fig.rotation.y = Math.PI; arms(0.03, -0.03); J.head.rotation.x = 0.05; J.neck.rotation.x = 0.05; J.spine.rotation.x = 0.02;
        idleLife(o.now ?? t);
        break;
      case 'olhando':
        arms(0.03, -0.03); J.head.rotation.x = -0.05; J.head.rotation.z = 0.03 * w;
        idleLife(o.now ?? t);
        break;
      case 'observar': {
        // only the head turns: from the back (or the front) it sweeps round until the mask looks at you
        const base = o.base ?? 'costas';
        if (base === 'costas') fig.rotation.y = Math.PI;
        arms(0.03, -0.03);
        const k = Math.round(clamp01(o.olhar ?? t / 4) * 12) / 12;           // 12 hard steps
        J.head.rotation.y = (base === 'costas' ? Math.PI : 0.9) * k * (base === 'costas' ? 1 : 1);
        J.head.rotation.x = -0.03 - 0.05 * k; J.head.rotation.z = 0.05 + 0.08 * k;
        J.neck.rotation.y = 0;
        break;
      }
      case 'andar': {
        const f = (o.dist !== undefined ? Math.floor(o.dist / 0.35) : Math.floor(t * 4)) % 4, sw = [-0.34, 0, 0.34, 0][f];
        J.hipL.rotation.x = sw; J.hipR.rotation.x = -sw; J.kneeL.rotation.x = f === 2 ? 0.1 : 0; J.kneeR.rotation.x = f === 0 ? 0.1 : 0;
        J.shoulderL.rotation.x = -sw * 0.4; J.shoulderR.rotation.x = sw * 0.4; arms(0.03, -0.04);
        J.head.rotation.z = 0.06 + 0.02 * w; J.head.rotation.x = -0.04 - 0.02 * (w - 1); J.spine.rotation.z = 0.02 * (f - 1.5) * (0.5 + 0.25 * w); J.spine.rotation.x = 0.02 * (w - 1);
        break;
      }
      case 'correr': {
        const f = (o.dist !== undefined ? Math.floor(o.dist / 0.85) : Math.floor(t * 8)) % 4, sw = [-0.95, 0, 0.95, 0][f];
        J.hipL.rotation.x = sw; J.hipR.rotation.x = -sw; J.kneeL.rotation.x = sw < 0 ? 1.0 : 0.25; J.kneeR.rotation.x = sw > 0 ? 1.0 : 0.25;
        J.shoulderL.rotation.x = -sw * 0.9; J.shoulderR.rotation.x = sw * 0.9; J.elbowL.rotation.x = -1.25; J.elbowR.rotation.x = -1.25;
        J.spine.rotation.x = 0.32; J.head.rotation.x = -0.3; J.head.rotation.z = 0.14;
        break;
      }
      case 'inclinar': {
        // standing facing you, the head leaning over slowly, a notch at a time, and staying
        arms(0.03, -0.03);
        const k = Math.round(clamp01(t / 10) * 10) / 10;
        J.head.rotation.z = 1.0 * k; J.head.rotation.y = 0.12 * k; J.head.rotation.x = -0.04;
        break;
      }
      case 'sumir': {
        // dissolves in hard flickers: more and more frames empty until it is gone
        arms(0.03, -0.03); const k = clamp01(t / 2), fr = Math.floor(t * 12);
        root.visible = hash(fr) > k * 1.15;
        break;
      }
    }
  }
  setPose('costas', 0);

  const st = { t: null, px: 0, pz: 0, dist: 0, yaw: 0 };
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  return {
    root, joints: J, height: cust.height, eyeHeight: cust.eyeHeight, mask, setStage,
    get stage() { return stageNow; }, get pose() { return current; }, poses: ENTITY_POSES, look: L,
    setPose,
    update(t, estado = {}) {
      const dt = st.t === null ? -1 : t - st.t, p = root.position;
      const seq = dt > 1e-5 && dt <= 0.25, same = dt >= 0 && dt <= 1e-5;
      if (seq) {
        const d = Math.hypot(p.x - st.px, p.z - st.pz);
        if (d / dt < 12) st.dist += d;                          // a jump (placed, not walked) turns no frame
        const dy = wrap(root.rotation.y - st.yaw);
        st.yaw = Math.abs(dy) > 2.6 ? root.rotation.y : st.yaw + dy * (1 - Math.exp(-dt * 10));
      } else if (!same) { st.dist = 0; st.yaw = root.rotation.y; }
      if (!same) { st.px = p.x; st.pz = p.z; st.t = t; }
      setPose(estado.pose ?? current, t - (estado.desde ?? 0), { ...estado, now: t, dist: seq || same ? st.dist : undefined });
      if (seq || same) { const lag = wrap(st.yaw - root.rotation.y); fig.rotation.y += lag; J.head.rotation.y -= lag * 0.4; }
    },
  };
}
