// The phone's controls (the redesign the person approved, 2026-11-13): one layer over the picture that reads every
// finger and decides by where it started and what it does.
//   - the left thumb, anywhere in the lower left: a stick is born there; pushed to its edge it runs;
//   - a drag anywhere else looks (and the gyroscope, when on: tilt.js);
//   - a short tap on the picture: hooks.tap(x, y) (the game uses the thing under the finger, or walks there);
//   - two fingers tapping together: the flashlight; a swipe up from the bottom edge, or the button in the lower corner opposite flashlight and crouch: the clipboard;
//   - the actions of what is in front come as big buttons by the right thumb, and a marker over the thing
//     (setActions); a hold action shows its ring;
//   - in a hiding place (setHiding) the stick and the hand go, and the big button holds the breath.
// The game owns what each thing does: this file only turns fingers into the hooks below.
//
//   const m = mountMobile(root, hooks, { left: false, scale: 1, toggle: false })
//   hooks: move(mx, my, run) · look(dyaw, dpitch) · press(k) ('flash' | 'crouch' | 'sheet' | 'inv' | 'invNext' | 'invPrev' | 'esc')
//          tap(x, y) · hold(x, y, 'down' | 'up') (a finger resting on the picture: manipulate what is under it)
//          act(i, 'down' | 'up') (the i-th action shown) · breath(on) · used() (a finger touched: the device is touch)
//   m.setActions({ list: [{ text, hold, progress }], at: { x, y } | null, primary }) | null
//   m.setHand({ name, count, icon }) | null · m.setHiding(on) · m.setPlaying(on) · m.setOptions({ left, scale, toggle, lookSens })
//   m.walkMark(x, y) (where a tap sent the player) · m.buzz(ms) · m.setSheet(open) (the clipboard is up: the fingers go to it,
//   a tap on it goes to the game as hooks.tap: on the sheet it picks, outside it closes)
//   m.el · m.dispose()

const R = 52;            // the stick's radius in CSS pixels
const RUN_AT = 0.92;     // pushed this far, the stick runs
const TAP_MS = 260, TAP_PX = 10;
const REST_MS = 250;     // a finger resting this long on the picture, without moving: hold (manipulate) what is under it
const LOOK = 0.0052;     // radians per pixel of drag (the game's own touch sensitivity)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountMobile(root, hooks, options = {}) {
  const opt = { left: false, scale: 1, toggle: false, lookSens: 1, ...options };
  const el = document.createElement('div');
  el.id = 'mobile';
  el.innerHTML = `
    <div class="m-layer"></div>
    <div class="m-back" hidden></div>
    <div class="m-stick" hidden><i></i></div>
    <div class="m-mark" hidden><b></b><i></i></div>
    <div class="m-acts"></div>
    <div class="m-btns"><button type="button" data-k="flash" aria-label="Lanterna">◐<small>LANT.</small></button><button type="button" data-k="crouch" aria-label="Agachar">▾<small>AGACHAR</small></button></div>
    <button type="button" class="m-sheetbtn" aria-label="Prancheta">▤<small>PRANCHETA</small></button>
    <button type="button" class="m-hand" hidden><i></i><span><b></b><small></small></span></button>
    <button type="button" class="m-pause" aria-label="Pausa">❚❚</button>
    <div class="m-walk" hidden></div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const layer = $('.m-layer'), stickEl = $('.m-stick'), knob = stickEl.querySelector('i');
  const markEl = $('.m-mark'), actsEl = $('.m-acts'), handEl = $('.m-hand'), walkEl = $('.m-walk');
  let playing = true, hiding = false;

  function applyOptions() {
    el.classList.toggle('left-handed', Boolean(opt.left));
    el.style.setProperty('--m-scale', String(opt.scale || 1));
  }
  applyOptions();

  // ---- the fingers on the layer ----
  const fingers = new Map();   // id -> { kind: 'stick' | 'look', x0, y0, x, y, t0, moved }
  let stick = null;            // { id, cx, cy }
  let two = null;              // two fingers down together: a possible flashlight tap
  const inStickZone = (x, y) => {
    const b = layer.getBoundingClientRect(), W = b.width || innerWidth, H = b.height || innerHeight;   // (its own size: an iPhone that turned can report the old window)
    const side = opt.left ? x > W * 0.55 : x < W * 0.45;
    return side && y > H * 0.45;
  };
  function moveStick(x, y) {
    let dx = x - stick.cx, dy = y - stick.cy;
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const n = Math.hypot(dx, dy) / R;
    const mx = n < 0.18 ? 0 : dx / R, my = n < 0.18 ? 0 : -dy / R;
    const run = m >= R * RUN_AT;
    stickEl.classList.toggle('run', run);
    hooks.move?.(mx, my, run);
  }
  function endStick() {
    if (!stick) return;
    stick = null; stickEl.hidden = true; stickEl.classList.remove('run'); knob.style.transform = '';
    hooks.move?.(0, 0, false);
  }
  layer.addEventListener('pointerdown', (e) => {
    if (!playing) return;
    e.preventDefault();
    try { layer.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    hooks.used?.();
    const f = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, kind: 'look' };
    if (!stick && !hiding && !el.classList.contains('sheet-open') && inStickZone(e.clientX, e.clientY)) {
      f.kind = 'stick';
      stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
      stickEl.hidden = false;
      stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`;
      moveStick(e.clientX, e.clientY);
    }
    if (f.kind === 'look') f.rest = setTimeout(() => { if (fingers.get(e.pointerId) === f && f.moved < TAP_PX && !two) { f.holding = true; hooks.hold?.(f.x0, f.y0, 'down'); vibrate(10); } }, REST_MS);
    fingers.set(e.pointerId, f);
    const looks = [...fingers.values()].filter((g) => g.kind === 'look');
    two = looks.length === 2 && looks.every((g) => performance.now() - g.t0 < 160) ? { t0: performance.now(), ok: true } : looks.length > 2 ? null : two;
  });
  layer.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (f.kind === 'stick') { f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.x0, e.clientY - f.y0)); moveStick(e.clientX, e.clientY); return; }
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.x0, e.clientY - f.y0));
    if (two && f.moved > TAP_PX) two.ok = false;
    if (f.holding) return;   // a hold keeps the view still
    if (f.moved > TAP_PX) clearTimeout(f.rest);
    // a swipe up from the bottom edge opens the clipboard instead of looking
    const bottom = layer.getBoundingClientRect().bottom;
    if (f.y0 > bottom - 36 && f.y0 - e.clientY > 70 && !f.swiped) { f.swiped = true; hooks.press?.('sheet'); return; }
    if (f.y0 > bottom - 36) return;
    if (f.moved > TAP_PX) hooks.look?.(-dx * LOOK * opt.lookSens, -dy * LOOK * opt.lookSens);
  });
  const lift = (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    clearTimeout(f.rest);
    // a short tap where a stick would be born is a tap on the picture (a thing in the lower left)
    if (f.kind === 'stick') { endStick(); if (e.type === 'pointerup' && f.moved < TAP_PX && performance.now() - f.t0 < TAP_MS) hooks.tap?.(f.x0, f.y0); return; }
    if (f.holding) { hooks.hold?.(f.x0, f.y0, 'up'); return; }
    if (two) {
      if (e.type === 'pointerup' && two.ok && fingers.size === 0 && performance.now() - two.t0 < 400) hooks.press?.('flash');
      if (fingers.size === 0) two = null;
      return;
    }
    if (e.type === 'pointerup' && !f.swiped && f.moved < TAP_PX && performance.now() - f.t0 < TAP_MS) hooks.tap?.(f.x0, f.y0);
  };
  layer.addEventListener('pointerup', lift);
  layer.addEventListener('pointercancel', lift);
  // safety: no finger left on the glass, nothing stays held
  const none = (e) => { if (e.touches && e.touches.length === 0) { for (const f of fingers.values()) { clearTimeout(f.rest); if (f.holding) hooks.hold?.(f.x0, f.y0, 'up'); } fingers.clear(); two = null; endStick(); releaseHolds(); } };
  addEventListener('touchend', none); addEventListener('touchcancel', none);
  for (const t of ['touchstart', 'touchmove']) el.addEventListener(t, (e) => e.preventDefault(), { passive: false });

  // ---- the two small buttons ----
  for (const b of el.querySelectorAll('.m-btns button')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks.used?.(); b.classList.add('down'); hooks.press?.(b.dataset.k); vibrate(8); });
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  const back = $('.m-back');
  // the backdrop of the open clipboard covers the screen: a tap on it goes to the game as a tap at that point, and the
  // game decides (on a tab or a row of the sheet: that tab or goal; outside the sheet: it closes)
  back.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks.used?.(); hooks.tap?.(e.clientX, e.clientY); });
  // the clipboard button, in the lower corner opposite the flashlight and crouch (the swipe up still opens it too)
  const sheetBtn = $('.m-sheetbtn');
  sheetBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks.used?.(); sheetBtn.classList.add('down'); hooks.press?.('sheet'); vibrate(8); });
  for (const t of ['pointerup', 'pointercancel']) sheetBtn.addEventListener(t, () => sheetBtn.classList.remove('down'));
  $('.m-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); hooks.used?.(); hooks.press?.('esc'); });
  // ---- the hand: a tap opens the pocket, a sideways slide changes the item ----
  let hx = null;
  handEl.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks.used?.(); hx = e.clientX; try { handEl.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
  handEl.addEventListener('pointerup', (e) => {
    if (hx === null) return;
    const dx = e.clientX - hx; hx = null;
    hooks.press?.(dx > 30 ? 'invNext' : dx < -30 ? 'invPrev' : 'inv');
  });
  handEl.addEventListener('pointercancel', () => { hx = null; });

  // ---- the actions by the right thumb ----
  let shown = null;            // what setActions last drew, to redraw only on change
  const held = new Set();      // indexes held down (or switched on, with the toggle option)
  function releaseHolds() { if (!held.size) return; for (const i of held) if (i !== 'breath') hooks.act?.(i, 'up'); if (held.has('breath')) hooks.breath?.(false); held.clear(); for (const b of actsEl.querySelectorAll('.down')) b.classList.remove('down'); settle(); }
  actsEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.preventDefault(); hooks.used?.();
    try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    const i = Number(b.dataset.i), row = shown?.list?.[i];
    if (b.dataset.breath) {
      if (opt.toggle && held.has('breath')) { held.delete('breath'); b.classList.remove('down'); hooks.breath?.(false); return; }
      held.add('breath'); b.classList.add('down'); hooks.breath?.(true); vibrate(10); return;
    }
    if (opt.toggle && row?.hold && held.has(i)) { held.delete(i); b.classList.remove('down'); hooks.act?.(i, 'up'); return; }
    held.add(i); b.classList.add('down'); hooks.act?.(i, 'down'); vibrate(10);
  });
  const actUp = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const i = Number(b.dataset.i), row = shown?.list?.[i];
    if (b.dataset.breath) { if (!opt.toggle) { held.delete('breath'); b.classList.remove('down'); hooks.breath?.(false); } settle(); return; }
    if (opt.toggle && row?.hold) return;   // switched on: a second tap lets go
    if (held.delete(i)) { b.classList.remove('down'); hooks.act?.(i, 'up'); }
    settle();
  };
  actsEl.addEventListener('pointerup', actUp);
  actsEl.addEventListener('pointercancel', actUp);
  function drawActions() {
    const s = shown;
    if (hiding) {
      actsEl.innerHTML = `${s?.list?.length ? s.list.map((r, i) => `<button type="button" class="m-act" data-i="${i}">${esc(r.text)}</button>`).join('') : ''}<button type="button" class="m-act big" data-i="-1" data-breath="1"><span class="ring" style="--p:${Math.round((s?.breath ?? 1) * 100)}%"></span>PRENDER O AR</button>`;
      return;
    }
    if (!s || !s.list || !s.list.length) { actsEl.innerHTML = ''; return; }
    const p = Math.min(s.list.length - 1, Math.max(0, s.primary ?? 0));
    const order = s.list.map((r, i) => i).filter((i) => i !== p).concat(p);  // the main one last: lowest, by the thumb
    actsEl.innerHTML = order.map((i) => {
      const r = s.list[i], big = i === p;
      const ring = r.hold ? `<span class="ring" style="--p:${Math.round((r.progress ?? 0) * 100)}%"></span>` : '';
      return `<button type="button" class="m-act${big ? ' big' : ''}${r.hold ? ' hold' : ''}" data-i="${i}">${ring}${esc(r.text)}${r.hold && !big ? ' <small>(segure)</small>' : ''}</button>`;
    }).join('');
  }
  function drawMark() {
    const s = shown;
    if (!s || !s.at || hiding || !s.list?.length) { markEl.hidden = true; return; }
    markEl.hidden = false;
    markEl.style.left = `${Math.round(s.at.x)}px`; markEl.style.top = `${Math.round(s.at.y)}px`;
    const t = s.label ?? s.list[s.primary ?? 0]?.text ?? '';
    const b = markEl.querySelector('b');
    if (b.textContent !== t) b.textContent = t;
  }
  markEl.addEventListener('pointerdown', (e) => { e.preventDefault(); if (shown?.list?.length) { const i = shown.primary ?? 0; hooks.act?.(i, 'down'); setTimeout(() => hooks.act?.(i, 'up'), 60); } });

  // what changes the buttons themselves (a held button must stay the same element: the rings change in place)
  const sig = (s) => (s ? JSON.stringify([s.list?.map((r) => [r.text, Boolean(r.hold)]), s.primary, hiding]) : (hiding ? 'h' : ''));
  function rings() {
    for (const b of actsEl.querySelectorAll('[data-i]')) {
      const ring = b.querySelector('.ring');
      if (!ring) continue;
      const v = b.dataset.breath ? (shown?.breath ?? 1) : (shown?.list?.[Number(b.dataset.i)]?.progress ?? 0);
      ring.style.setProperty('--p', `${Math.round(v * 100)}%`);
    }
  }
  let lastSig = null, pending = false;
  function settle() { if (pending && !held.size) { pending = false; lastSig = sig(shown); drawActions(); rings(); drawMark(); } }
  function vibrate(ms) { try { navigator.vibrate?.(ms); } catch { /* not here */ } }

  const api = {
    el,
    setActions(s) {
      const next = sig(s);
      // a new target under the thumb: a short buzz, so the person feels it without looking
      if (s && s.list?.length && (!shown || shown.list?.[0]?.text !== s.list[0]?.text)) vibrate(6);
      shown = s;
      // while a button is held its list stays on the screen (the finger keeps its button); the new one comes after
      if (next !== lastSig) { if (held.size) pending = true; else { lastSig = next; drawActions(); } }
      rings();
      drawMark();
    },
    setHand(h) {
      handEl.hidden = !h || hiding;
      if (!h) return;
      handEl.querySelector('i').textContent = h.icon || '◐';
      handEl.querySelector('b').textContent = h.name || 'Mãos vazias';
      handEl.querySelector('small').textContent = h.count ? `BOLSO · ${h.count} ${h.count === 1 ? 'ITEM' : 'ITENS'}` : 'BOLSO VAZIO';
    },
    setHiding(on) {
      if (hiding === Boolean(on)) return;
      hiding = Boolean(on);
      el.classList.toggle('hiding', hiding);
      if (hiding) { endStick(); handEl.hidden = true; }
      releaseHolds(); lastSig = null; drawActions(); drawMark();
    },
    setPlaying(on) {
      playing = Boolean(on);
      el.hidden = !playing;
      if (!playing) { for (const f of fingers.values()) { clearTimeout(f.rest); if (f.holding) hooks.hold?.(f.x0, f.y0, 'up'); } fingers.clear(); two = null; endStick(); releaseHolds(); }
    },
    setOptions(o) { Object.assign(opt, o); applyOptions(); },
    walkMark(x, y) {
      walkEl.hidden = false; walkEl.style.left = `${Math.round(x)}px`; walkEl.style.top = `${Math.round(y)}px`;
      walkEl.classList.remove('go'); void walkEl.offsetWidth; walkEl.classList.add('go');
      clearTimeout(walkEl.t); walkEl.t = setTimeout(() => { walkEl.hidden = true; }, 700);
    },
    buzz: (ms) => vibrate(ms),
    setSheet(open) {
      const on = Boolean(open);
      if (el.classList.contains('sheet-open') === on) return;
      el.classList.toggle('sheet-open', on); back.hidden = !on;
      if (on) { for (const f of fingers.values()) clearTimeout(f.rest); fingers.clear(); two = null; endStick(); }
    },
    dispose() { removeEventListener('touchend', none); removeEventListener('touchcancel', none); el.remove(); },
  };
  return api;
}
