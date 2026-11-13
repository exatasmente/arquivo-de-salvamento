// Shared pieces of the cutscenes of "O Dia que Sobra": camera tracks, the screen flashes (with the
// safety limits), Heitor's first-person arms, dialogue lines with their babble timing, and the overlay
// drawn over the 3D picture (fade, flash, static, dialogue box, clipboard, the screens of the office
// and the memory card). Everything here is a pure function of time: no Math.random, no real clock.
//
// A cutscene module exports a definition (see player.js):
//   { name, duration, views: { name: [t0, t1, description] }, anchors, sfx: [{ t, name, opts }], build(ctx) -> inst }
//   inst.pose(t, ambient) -> frame: { eye, look, roll, fovK, fade, flashes, daze, noise, dim, dialog, sheet, screen, ... }
import { mulberry32 } from '../rng.js';
import { buildFirstPersonArms } from '../models/human.js';
import { babbleTimeline } from '../audio/babble.js';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
export const ramp = (t, a, b) => clamp((t - a) / (b - a));       // 0 before a, 1 after b
export const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** A seeded variation helper for the cutscenes: pure, never Math.random. */
export const rng = (seed) => mulberry32(seed >>> 0 || 1);

// ---------------------------------------------------------------------------------------------
// Camera track. keys: [{ t, eye, look, roll?, fov?, ease? }]. Between two keys the path is a
// Catmull-Rom curve (steady speed through the key) or, with `ease: 'ss'` on the first key of the
// pair, a smoothstep (it stops at both ends: use it for a camera that stays a moment).
export function track(keys) {
  const K = keys.slice().sort((a, b) => a.t - b.t);
  const cr = (p0, p1, p2, p3, u) => {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
  return (t) => {
    if (t <= K[0].t) return { ...K[0], roll: K[0].roll ?? 0 };
    const last = K[K.length - 1];
    if (t >= last.t) return { ...last, roll: last.roll ?? 0 };
    let i = 0; while (K[i + 1].t < t) i++;
    // two keys closer than 0.06 s are a cut between two views: the curve never reaches across it
    const a = K[i], b = K[i + 1], CUT = 0.06;
    const p = i > 0 && a.t - K[i - 1].t >= CUT ? K[i - 1] : a;
    const q = i + 2 < K.length && K[i + 2].t - b.t >= CUT ? K[i + 2] : b;
    const u = (t - a.t) / (b.t - a.t);
    const out = {};
    for (const f of ['eye', 'look']) {
      if (a.ease === 'ss') { const s = smooth(u); out[f] = [0, 1, 2].map((c) => lerp(a[f][c], b[f][c], s)); }
      else out[f] = [0, 1, 2].map((c) => cr(p[f][c], a[f][c], b[f][c], q[f][c], u));
    }
    const s = a.ease === 'ss' ? smooth(u) : u;
    out.roll = lerp(a.roll ?? 0, b.roll ?? 0, s);
    out.fov = a.fov !== undefined || b.fov !== undefined ? lerp(a.fov ?? 0, b.fov ?? 0, s) : undefined;
    return out;
  };
}

/** Head bob while walking: returns [dx, dy, roll]. */
export function bob(t, amp = 1, freq = 1.9) {
  const p = t * freq * Math.PI * 2;
  return [Math.sin(p * 0.5) * 0.018 * amp, Math.abs(Math.sin(p * 0.5)) * 0.03 * amp - 0.015 * amp, Math.sin(p * 0.5) * 0.012 * amp];
}

// ---------------------------------------------------------------------------------------------
// Sound timelines: `sfx: [{ t, name, opts }]` (t in seconds of the cutscene; names are the ones of
// src/audio/: one-shots, loops with `dur`, and 'babble' with opts { seed, text }).
/** Footfalls of a first-person walk driven by bob(t, amp, freq): the head is lowest at t = n / freq. */
export function footfalls(from, to, freq = 1.9, opts, name = 'passo_piso') {
  const out = [];
  for (let n = Math.ceil(from * freq - 1e-9); n / freq < to - 1e-9; n++) out.push({ t: +(n / freq).toFixed(3), name, ...(opts ? { opts } : {}) });
  return out;
}
/** `name` every `period` seconds from `from` while t < `to`. */
export function every(from, to, period, name, opts) {
  const out = [];
  for (let i = 0; from + i * period < to - 1e-9; i++) { const o = typeof opts === 'function' ? opts(i) : opts; out.push({ t: +(from + i * period).toFixed(3), name, ...(o ? { opts: o } : {}) }); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dialogue. lines: [{ t, who, text, seed, hold? }]. `who` is only ever 'Gerente', 'Cliente' or
// 'Telefone', or '' for a thought of the protagonist (no label). The text shows as the babble plays
// (the same timeline the audio uses); the box stays `hold` seconds after the last letter.
export const BABBLE_SEEDS = { gerente: 7, cliente: 23, telefone: 41, heitor: 5 };
export function dialogue(lines) {
  const L = lines.map((l) => { const tl = babbleTimeline(l.seed ?? BABBLE_SEEDS.heitor, l.text); return { ...l, tl, end: l.t + tl.dur + (l.hold ?? 1.2) }; });
  return {
    lines: L,
    /** The dialogue overlay at time t, or null. */
    at(t) {
      for (const l of L) {
        if (t < l.t || t >= l.end) continue;
        const u = t - l.t;
        let n = 0; for (const it of l.tl.items) if (it.t <= u) n = it.i + 1;
        const done = u >= l.tl.dur;
        return { who: l.who ?? '', text: l.text, n: done ? l.text.length : n };
      }
      return null;
    },
    /** The sound events: one babble per line. */
    sfx: L.map((l) => ({ t: l.t, name: 'babble', opts: { seed: l.seed ?? BABBLE_SEEDS.heitor, text: l.text } })),
  };
}

// ---------------------------------------------------------------------------------------------
// Scene cuts. The first views of a cutscene run its whole choreography at its own pace. `withSegments` appends
// views made for one scene of the video each: a short window built from pieces of the original timeline (a piece
// plays `d` seconds from `src`, at `rate` times the speed), with its own dialogue boxes (times relative to the
// window) and flags the cutscene reads from `ctx.flags`. The sounds of the pieces come along, retimed; the original
// boxes never do (their babble is dropped and the window shows only its own).
const BEDS = new Set(['rodovia', 'insetos', 'vento', 'fluorescente', 'geladeira', 'motor_carro', 'bomba_corre', 'telefone_toca', 'chuva', 'estatica_camera', 'respiracao', 'coracao', 'sol_presenca']);
export function withSegments(base, segs) {
  const D0 = base.duration, views = { ...base.views }, sfx = base.sfx.filter((e) => e.t < D0), S = [];
  let t = D0;
  for (const s of segs) {
    const pieces = s.pieces.map((p) => ({ rate: 1, ...p })), dur = +pieces.reduce((a, p) => a + p.d, 0).toFixed(3);
    const say = dialogue(s.say ?? []);
    S.push({ ...s, pieces, dur, t0: t, say });
    views[s.name] = [t, +(t + dur).toFixed(3), s.desc];
    let off = 0;
    for (const p of pieces) {
      const a = p.src, b = p.src + p.d * p.rate;
      for (const e of base.sfx) {
        if (e.name === 'babble') continue;
        const o = e.opts ? { ...e.opts } : undefined;
        if (e.t >= a && e.t < b) {
          if (o?.dur !== undefined) o.dur = +Math.min(o.dur / p.rate, (b - e.t) / p.rate).toFixed(3);
          sfx.push({ ...e, t: +(t + off + (e.t - a) / p.rate).toFixed(3), ...(o ? { opts: o } : {}) });
        } else if (e.t < a && BEDS.has(e.name) && o?.dur !== undefined && e.t + o.dur > a) {
          sfx.push({ ...e, t: +(t + off).toFixed(3), opts: { ...o, dur: +(Math.min(e.t + o.dur, b) - a) / p.rate } });
        }
      }
      off += p.d;
    }
    for (const e of say.sfx) sfx.push({ ...e, t: +(t + e.t).toFixed(3) });
    t += dur;
  }
  const build = (ctx) => {
    const inst = base.build(ctx), pose0 = inst.pose;
    inst.pose = (tt, ambient) => {
      if (tt < D0 || !S.length) { ctx.flags = {}; return pose0(tt, ambient); }
      const seg = S.find((x) => tt >= x.t0 && tt < x.t0 + x.dur) ?? S[S.length - 1];
      const rel = Math.min(seg.dur, tt - seg.t0);
      let off = 0, told = seg.pieces[seg.pieces.length - 1].src;
      for (const p of seg.pieces) { if (rel < off + p.d || p === seg.pieces[seg.pieces.length - 1]) { told = p.src + Math.min(p.d, rel - off) * p.rate; break; } off += p.d; }
      ctx.flags = seg.flags ?? {};
      const f = pose0(told, ambient - tt + told);
      f.dialog = seg.say.at(rel);
      if (seg.sheet !== undefined) f.sheet = seg.sheet || null;
      if (seg.noFade) f.fade = 0;
      return f;
    };
    return inst;
  };
  return { ...base, duration: +t.toFixed(3), views, sfx, build, segments: S };
}

// ---------------------------------------------------------------------------------------------
// Screen flashes. Same limits as the game: at most 3 per second, each one rising and falling over
// at least 0.1 s, never full white. Events: [{ t, s?, rise?, fall? }].
export const FLASH = { rise: 0.12, fall: 0.28, peak: 0.5, minGap: 0.4, color: '#e9e2cc', dark: '#05060a', darkPeak: 0.45 };
export function flashLevel(events, t) {
  let a = 0;
  for (const f of events) {
    const rise = Math.max(0.1, f.rise ?? FLASH.rise), fall = Math.max(0.1, f.fall ?? FLASH.fall), u = t - f.t;
    if (u < 0 || u > rise + fall) continue;
    a = Math.max(a, (u < rise ? u / rise : 1 - (u - rise) / fall) * (f.s ?? 1));
  }
  return a;
}
/** Returns the list of problems (empty when every window of one second has at most 3 flashes). */
export function checkFlashes(events) {
  const bad = [], ts = events.map((e) => e.t).sort((a, b) => a - b);
  for (let i = 0; i + 3 < ts.length; i++) if (ts[i + 3] - ts[i] < 1) bad.push(`4 flashes within 1 s at ${ts[i].toFixed(2)}`);
  for (const e of events) {
    if ((e.rise ?? FLASH.rise) < 0.1 || (e.fall ?? FLASH.fall) < 0.1) bad.push(`flash at ${e.t} too fast`);
    if ((e.s ?? 1) * FLASH.peak >= 0.95) bad.push(`flash at ${e.t} too strong`);
  }
  return bad;
}

// ---------------------------------------------------------------------------------------------
// Heitor's arms (models/human.js: buildFirstPersonArms hangs on a camera looking along -Z). The joint
// called "L" is on the right of the screen. `reach` puts a hand (the centre of the fist) at a point in
// camera space with a two-bone solve; `hang` is the loose preset.
const ARM_A = 0.29, ARM_B = 0.38;
export function armRig(THREE, arms) {
  const rest = {};
  for (const jn of ['L', 'R']) {
    const sg = jn === 'L' ? 1 : -1;
    rest[jn] = {
      d1: new THREE.Vector3(sg * 0.14, -0.70, -0.70).normalize(), d2: new THREE.Vector3(-sg * 0.22, 0.58, -0.78).normalize(),
      S: arms.joints['shoulder' + jn].position.clone(), sg,
    };
  }
  const solve = (S, tgt, pole) => {
    const d = tgt.clone().sub(S);
    let dist = d.length();
    const max = ARM_A + ARM_B - 0.004;
    if (dist > max) { d.multiplyScalar(max / dist); dist = max; }
    if (dist < 0.1) { d.setLength(0.1); dist = 0.1; }
    const dir = d.clone().divideScalar(dist);
    const along = (ARM_A * ARM_A - ARM_B * ARM_B + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(ARM_A * ARM_A - along * along, 0));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
    p.normalize();
    return { E: S.clone().addScaledVector(dir, along).addScaledVector(p, h), H: S.clone().add(d) };
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /** side: 'right' | 'left' (on the screen); p: [x, y, z] in camera space (-z is forward). */
  function reach(side, p, { pole } = {}) {
    const jn = side === 'right' ? 'L' : 'R', r = rest[jn], sh = arms.joints['shoulder' + jn], el = arms.joints['elbow' + jn];
    const sol = solve(r.S, V(...p), pole ? V(...pole) : V(r.sg * 0.5, -1, 0.25));
    sh.quaternion.setFromUnitVectors(r.d1, sol.E.clone().sub(r.S).normalize());
    const dF = sol.H.clone().sub(sol.E).normalize().applyQuaternion(sh.quaternion.clone().invert());
    el.quaternion.setFromUnitVectors(r.d2, dF);
    const b3 = arms.joints['wrist' + jn].children[0];
    if (!arms.joints['curl' + jn] || !b3) return;
    // turn the forearm about its own axis so the back of the (bare) hand faces up and a little outward
    const base = el.quaternion.clone(), ax = dF;
    const want = V(r.sg * 0.3, 0.75, 0.55).normalize(), Z = V(0, 0, 1), q = new THREE.Quaternion(), n = new THREE.Vector3();
    const back = (phi) => { el.quaternion.setFromAxisAngle(ax, phi).multiply(base); return n.copy(Z).applyQuaternion(b3.quaternion).applyQuaternion(q.copy(sh.quaternion).multiply(el.quaternion)).dot(want); };
    let best = 0, bestV = -2;
    for (let i = 0; i < 72; i++) { const phi = (i / 72) * Math.PI * 2, v = back(phi); if (v > bestV) { bestV = v; best = phi; } }
    for (let st = Math.PI / 72; st > 0.002; st /= 2) for (const phi of [best - st, best + st]) { const v = back(phi); if (v > bestV) { bestV = v; best = phi; } }
    back(best);
  }
  const rig = {
    reach,
    /** Open (0) to fist (1) hand on a side ('right' | 'left' on the screen). */
    curl(side, k) { const f = arms.joints['curl' + (side === 'right' ? 'L' : 'R')]; if (f) f(k); },
    /** Both hands low and loose, at the bottom corners of the view. */
    hang(sway = 0) { rig.curl('right', 0.2); rig.curl('left', 0.2); reach('right', [0.22 + sway * 0.02, -0.40 + sway * 0.015, -0.34]); reach('left', [-0.22 - sway * 0.02, -0.40 - sway * 0.015, -0.34]); },
  };
  return rig;
}

/** Heitor's look: a man of 41, in the work shirt of the posto (short sleeves). */
export const HEITOR_LOOK = { seed: 41, skin: '#c8a07a', hair: '#1f1a16', outfit: 'civil', glove: 'none', shirt: '#86652a', pants: '#2e3c4e', height: 1.75, build: 'mid' };
export function heitorArms(r) {
  const arms = buildFirstPersonArms(r, HEITOR_LOOK);
  arms.root.visible = true;
  return { arms, rig: armRig(r.THREE, arms) };
}

// ---------------------------------------------------------------------------------------------
// The overlay: everything drawn flat over the 3D picture, on a canvas twice the internal size of
// the 3D (so the small text stays readable). st: { fade, flash, dark, daze, noise, dim, glare, dialog, sheet, screen, card, t }.
export const OVERLAY_SCALE = 2;
const GOLD = '#c9a24a', INK = '#e8dfc4', NAME = '#e0b24a';
const mono = (px, bold = true) => `${bold ? 'bold ' : ''}${Math.round(px)}px "Courier New", monospace`;

export function drawOverlay(g, w, h, st) {
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = false;
  if (st.daze > 0.01) {
    const gr = g.createRadialGradient(w / 2, h / 2, h * 0.18, w / 2, h / 2, h * 0.95);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(0.78 * st.daze).toFixed(3)})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (st.glare > 0.01) { // a lamp straight ahead: a wide soft glow, never a white screen
    const gx = w * (st.glareAt?.[0] ?? 0.5), gy = h * (st.glareAt?.[1] ?? 0.3);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, h * (0.6 + 0.5 * st.glare));
    gr.addColorStop(0, `rgba(240,232,205,${(0.62 * st.glare).toFixed(3)})`); gr.addColorStop(1, 'rgba(240,232,205,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (st.flash > 0.005) { g.globalAlpha = st.flash * FLASH.peak; g.fillStyle = FLASH.color; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.dark > 0.005) { g.globalAlpha = st.dark * FLASH.darkPeak; g.fillStyle = FLASH.dark; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.dim > 0.005) { g.globalAlpha = st.dim; g.fillStyle = '#04050c'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (st.noise > 0.01) drawNoise(g, w, h, st.noise, st.t);
  if (st.screen) drawScreen(g, w, h, st.screen, st.t);
  if (st.card) drawCard(g, w, h, st.card, st.t);
  if (st.sheet) drawSheet(g, w, h, st.sheet);
  if (st.dialog) drawDialog(g, w, h, st.dialog);
  if (st.fade > 0.005) { g.globalAlpha = Math.min(1, st.fade); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
}

/** Static: seeded by the frame number of the time, so the same time always gives the same picture. */
function drawNoise(g, w, h, amount, t) {
  const r = mulberry32((Math.floor(t * 24) + 1) * 7919);
  const cw = Math.ceil(w / 4), ch = Math.ceil(h / 4);
  const img = g.createImageData(cw, ch), d = img.data;
  for (let i = 0; i < cw * ch; i++) {
    const v = (r() * 255) | 0, a = Math.min(255, amount * 255 * (0.55 + 0.45 * r())) | 0;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = a;
  }
  const tmp = drawNoise.tmp ?? (drawNoise.tmp = document.createElement('canvas'));
  tmp.width = cw; tmp.height = ch; tmp.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(tmp, 0, 0, w, h);
  const y0 = ((t * 140) % (h + 40)) - 20;
  g.globalAlpha = Math.min(1, amount) * 0.5; g.fillStyle = '#d8dce6'; g.fillRect(0, y0, w, 6 + 8 * amount); g.globalAlpha = 1;
}

/** The dialogue box of the game (#dlg): who talks (or nothing for a thought), the text as far as it has been said. */
function drawDialog(g, w, h, d) {
  const tall = h > w * 1.1; // vertical picture: the type follows the width, the box sits lower
  const bw = Math.round(Math.min(w * 0.94, h * 1.55)), fs = tall ? Math.min(h * 0.052, w * 0.062) : h * 0.052, pad = tall ? w * 0.04 : h * 0.03;
  const words = d.text.split(' '), lines = [];
  g.font = mono(fs);
  let cur = '';
  for (const wd of words) { const tryL = cur ? cur + ' ' + wd : wd; if (g.measureText(tryL).width > bw - pad * 2 && cur) { lines.push(cur); cur = wd; } else cur = tryL; }
  lines.push(cur);
  const head = d.who ? fs * 1.35 : 0, bh = Math.round(pad * 2 + head + lines.length * fs * 1.3), bx = Math.round((w - bw) / 2), by = Math.round(h * (tall ? 0.95 : 0.9) - bh);
  g.fillStyle = 'rgba(8,10,16,0.9)'; g.fillRect(bx + 4, by + 4, bw, bh); // the hard shadow
  g.fillStyle = 'rgba(8,10,16,0.92)'; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = GOLD; g.lineWidth = Math.max(2, Math.round(h / 150)); g.strokeRect(bx, by, bw, bh);
  g.textBaseline = 'top'; g.textAlign = 'left';
  let y = by + pad;
  if (d.who) { g.fillStyle = NAME; g.font = mono(fs * 0.8); g.fillText(d.who.toUpperCase(), bx + pad, y); y += head; }
  g.font = mono(fs); g.fillStyle = INK;
  let left = d.n;
  const full = d.text.split(' ');
  void full;
  let consumed = 0;
  for (const ln of lines) {
    const take = Math.max(0, Math.min(ln.length, left - consumed));
    g.fillText(ln.slice(0, take), bx + pad, y);
    consumed += ln.length + 1; y += fs * 1.3;
  }
}

/**
 * The clipboard of the game (#sheet). sheet: { time, day, week, wallet, tasks: [{ text, done }], perf?: [[label, value]] }.
 * Every line is measured: a text that is too long for the box is wrapped (a task, with a hanging indent) or its type is
 * reduced a little (never below 70%), so nothing leaves the box; the header has the time and the money on one line and
 * the week and the night on the next.
 */
function drawSheet(g, w, h, s) {
  const fs = h * 0.04, pad = h * 0.03, bw = Math.round(Math.min(w * 0.94, h * 0.8)), inner = bw - pad * 2;
  const bx = Math.round(Math.max(h * 0.02, w - bw - h * 0.04)), by = Math.round(h * 0.1);
  const ops = []; let y = pad;
  const width = (text, px) => { g.font = mono(px); return g.measureText(text).width; };
  const fit = (text, px, max) => { let k = px; while (k > px * 0.7 && width(text, k) > max) k -= 0.5; return k; };
  const line = (text, px, color, x = 0, align = 'left', max = inner - x) => { const k = fit(text, px, max); ops.push({ text, px: k, color, x, y, align }); };
  line('PRANCHETA', fs * 1.05, NAME); y += fs * 1.5;
  ops.push({ text: s.time, px: fs * 1.25, color: '#ff9a4a', x: 0, y, align: 'left' });
  line(`R$ ${s.wallet}`, fs * 0.85, '#ff9a4a', inner, 'right', inner - width(s.time, fs * 1.25) - fs * 0.6); y += fs * 1.55;
  line(`SEMANA ${s.week} · NOITE ${s.day}`, fs * 0.8, '#b09a5a'); y += fs * 1.6;
  const tpx = fs * 0.85;
  for (const t of s.tasks) {
    const mark = t.done ? '[x] ' : '[ ] ', indent = width(mark, tpx), color = t.done ? '#7a9a6a' : INK;
    const words = t.text.split(' '), rows = []; let cur = '';
    for (const wd of words) { const tryL = cur ? cur + ' ' + wd : wd; if (width(tryL, tpx) > inner - indent && cur) { rows.push(cur); cur = wd; } else cur = tryL; }
    rows.push(cur);
    rows.forEach((r, i) => { if (i === 0) line(mark + r, tpx, color); else line(r, tpx, color, indent); y += fs * 1.3; });
    y += fs * 0.2;
  }
  if (s.perf) {
    y += fs * 0.3; line('DESEMPENHO DA NOITE', fs * 0.85, '#b09a5a'); y += fs * 1.5;
    const cells = s.perf.map(([k, v]) => `${k} ${v}`), colW = inner / 2 - fs * 0.3;
    for (let i = 0; i < cells.length; i += 2) {
      line(cells[i], fs * 0.8, INK, 0, 'left', colW); if (cells[i + 1]) line(cells[i + 1], fs * 0.8, INK, inner / 2, 'left', colW);
      y += fs * 1.35;
    }
  }
  const bh = Math.round(y + pad * 0.6);
  g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(bx + 4, by + 4, bw, bh);
  g.fillStyle = 'rgba(14,12,10,0.92)'; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = GOLD; g.lineWidth = Math.max(2, Math.round(h / 150)); g.strokeRect(bx, by, bw, bh);
  g.textBaseline = 'top';
  for (const o of ops) { g.font = mono(o.px); g.fillStyle = o.color; g.textAlign = o.align; g.fillText(o.text, bx + pad + o.x, by + o.y + pad * 0.6 - pad * 0.6 + 0); }
  g.textAlign = 'left';
}

/** The screens of the office, seen straight on (a provisional drawing until the game has its own, phase 4). */
function drawScreen(g, w, h, s, t) {
  const tall = h > w * 1.1; // a vertical picture (the 9:16 cut): the screen takes the width and a tall frame instead of a small 4:3 one
  const sw = tall ? Math.round(w * 0.94) : Math.round(Math.min(w * 0.8, h * 1.2)), sh = tall ? Math.round(Math.min(h * 0.62, sw * (s.kind === 'cam' ? 1.2 : 0.9))) : Math.round(sw * 0.72), x = Math.round((w - sw) / 2), y = Math.round((h - sh) / 2);
  g.fillStyle = '#1a1814'; g.fillRect(x - 14, y - 14, sw + 28, sh + 28); // the bezel
  g.fillStyle = '#050805'; g.fillRect(x, y, sw, sh);
  g.save(); g.beginPath(); g.rect(x, y, sw, sh); g.clip();
  const fs = sh * 0.065;
  g.textBaseline = 'top'; g.textAlign = 'left';
  if (s.kind === 'login') {
    g.font = mono(fs); g.fillStyle = '#8fd08a';
    g.fillText('POSTO  -  ENTRADA', x + sw * 0.06, y + sh * 0.07);
    g.fillStyle = '#5a8a58'; g.fillText('ESCOLHA A CONTA', x + sw * 0.06, y + sh * 0.17);
    const accounts = [['GERENTE', 'SENHA: ' + '*'.repeat(6)], ['VALDIR', 'SENHA:']];
    accounts.forEach(([n, p], i) => {
      const yy = y + sh * (0.34 + i * 0.27), sel = s.sel === i;
      g.strokeStyle = sel ? '#8fd08a' : '#2a4a28'; g.lineWidth = 3; g.strokeRect(x + sw * 0.06, yy, sw * 0.88, sh * 0.2);
      g.fillStyle = sel ? '#bff0b8' : '#5a8a58'; g.font = mono(fs * 1.1); g.fillText(n, x + sw * 0.09, yy + sh * 0.02);
      g.font = mono(fs * 0.9); g.fillText(p, x + sw * 0.09, yy + sh * 0.1);
      if (i === 1 && sel && Math.floor(t * 2) % 2 === 0) { g.fillStyle = '#bff0b8'; g.fillRect(x + sw * 0.09 + g.measureText('SENHA: ').width, yy + sh * 0.1, fs * 0.55, fs * 0.9); }
    });
  } else if (s.kind === 'grid') {
    drawCamGrid(g, x, y, sw, sh, s, t);
  } else if (s.kind === 'cam' && s.image) {
    g.imageSmoothingEnabled = false;
    const zm = s.zoom ?? 1, ih = s.image.height / zm, iw = tall ? Math.min(s.image.width, ih * sw / sh) : s.image.width / zm, ax = (s.at?.[0] ?? 0.5), ay = (s.at?.[1] ?? 0.5);
    g.drawImage(s.image, Math.min(s.image.width - iw, Math.max(0, ax * s.image.width - iw / 2)), Math.min(s.image.height - ih, Math.max(0, ay * s.image.height - ih / 2)), iw, ih, x, y, sw, sh);
    g.fillStyle = 'rgba(190,230,190,0.9)'; g.font = mono(fs * 0.7); g.fillText(s.label ?? 'CAM 1', x + sw * 0.04, y + sh * 0.04);
  }
  // scanlines and a green cast
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = y; yy < y + sh; yy += 4) g.fillRect(x, yy, sw, 2);
  g.restore();
}
function drawCamGrid(g, x, y, sw, sh, s, t) {
  const cw = sw / 3, ch = sh / 2;
  for (let i = 0; i < 6; i++) {
    const cx = x + (i % 3) * cw, cy = y + Math.floor(i / 3) * ch, img = s.images?.[i];
    g.fillStyle = '#0c120c'; g.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);
    if (img) { g.imageSmoothingEnabled = false; g.drawImage(img, cx + 2, cy + 2, cw - 4, ch - 4); }
    g.fillStyle = 'rgba(190,230,190,0.9)'; g.font = mono(sh * 0.05); g.textBaseline = 'top'; g.fillText('CAM ' + (i + 1), cx + 8, cy + 8);
  }
  void t;
}

// ---------------------------------------------------------------------------------------------
// The memory card screen (the same 5 x 3 grid as the card of the game, 15 blocks read left to right
// and top to bottom). Block 13 is corrupted in every game of the channel.
const ICON = {
  run: (px) => { px(2, 11, 12, 3, '#6a5a3a'); px(3, 3, 10, 8, '#d9a21b'); px(5, 5, 6, 4, '#2a1a08'); px(7, 6, 2, 2, '#e8e0c8'); },
  night: (px) => { px(3, 3, 10, 10, '#3a4a5a'); px(5, 5, 3, 3, '#e0d890'); },
  record: (px) => { px(7, 2, 2, 3, '#e0a526'); px(3, 5, 10, 2, '#e0a526'); px(5, 7, 6, 3, '#e0a526'); px(4, 10, 3, 3, '#e0a526'); px(9, 10, 3, 3, '#e0a526'); },
  rinha: (px) => { px(2, 9, 12, 3, '#6a7388'); px(3, 4, 1, 5, '#c9a24a'); px(12, 4, 1, 5, '#c9a24a'); px(3, 5, 10, 1, '#5ee6d0'); px(3, 7, 10, 1, '#5ee6d0'); },
  corrupt: (px) => {
    px(2, 2, 6, 5, '#4a2a3a'); px(9, 3, 5, 4, '#2a2f5a'); px(3, 9, 4, 5, '#2a2f5a'); px(10, 9, 4, 4, '#4a2a3a');
    for (let i = 0; i < 14; i++) px(1 + i, 1 + ((i * 7) % 13), 1, 2, i % 2 ? '#ff6a5c' : '#0b0d14');
    px(7, 6, 2, 5, '#0b0d14');
  },
  empty: (px) => { px(5, 5, 6, 6, '#242836'); },
};
/** card: { blocks (15 entries with `kind`), saving, sel }. */
export function drawCard(g, w, h, card, t) {
  const blocks = card.blocks ?? defaultBlocks();
  g.fillStyle = `rgba(0,0,0,${card.veil ?? 0.86})`; g.fillRect(0, 0, w, h);
  g.globalAlpha = card.alpha ?? 1;
  const bw = Math.round(Math.min(w * 0.7, h * 1.25)), bh = Math.round(h * 0.76), bx = Math.round((w - bw) / 2), by = Math.round(h * 0.04);
  g.fillStyle = '#0d1019'; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = GOLD; g.lineWidth = Math.max(2, Math.round(h / 90)); g.strokeRect(bx, by, bw, bh);
  const fs = Math.round(h * 0.052);
  g.textBaseline = 'top'; g.textAlign = 'left'; g.font = mono(fs);
  g.fillStyle = GOLD; g.fillText('CARTÃO DE MEMÓRIA', bx + bw * 0.04, by + bh * 0.04);
  const blink = Math.floor(t * 2.5) % 2 === 0;
  if (card.saving) { g.fillStyle = '#e0a526'; g.globalAlpha = blink ? 1 : 0.35; g.fillText('SALVANDO...', bx + bw * 0.04, by + bh * 0.04 + fs * 1.5); g.globalAlpha = 1; }
  const gx = bx + bw * 0.04, gy = by + bh * 0.04 + fs * 3.1, gw = bw * 0.92, gap = bw * 0.02;
  const cw = (gw - gap * 4) / 5, ch = Math.round(h * 0.15);
  blocks.forEach((b, i) => {
    const cx = gx + (i % 5) * (cw + gap), cy = gy + Math.floor(i / 5) * (ch + gap);
    g.fillStyle = '#141824'; g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = card.sel === i ? '#5ee6d0' : '#2a3044'; g.lineWidth = 2; g.strokeRect(cx, cy, cw, ch);
    const isz = Math.round(ch * 0.62), ix = cx + (cw - isz) / 2, iy = cy + ch * 0.08, s = isz / 16;
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(ix + x * s, iy + y * s, ww * s, hh * s); };
    px(0, 0, 16, 16, '#1a1d29');
    (ICON[b.kind] ?? ICON.empty)(px, t);
    g.fillStyle = b.kind === 'corrupt' ? '#ff9a8c' : '#aab0c4'; g.font = mono(h * 0.044); g.textAlign = 'center';
    g.fillText(String(i + 1).padStart(2, '0'), cx + cw / 2, cy + ch - h * 0.058); g.textAlign = 'left';
  });
  g.globalAlpha = 1;
}
/** The card of the game: block 1 the run, 2 and 3 finished nights, 9 the record, 13 corrupted. `rinha` puts the other game's block at 11. */
export function defaultBlocks({ rinha = false } = {}) {
  const out = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, kind: 'empty' }));
  out[0] = { n: 1, kind: 'run' };
  out[1] = { n: 2, kind: 'night' };
  out[8] = { n: 9, kind: 'record' };
  if (rinha) out[10] = { n: 11, kind: 'rinha' };
  out[12] = { n: 13, kind: 'corrupt' };
  return out;
}
