// Input from keyboard, gamepad (Gamepad API) and touch, reduced to one intent per simulation step.
// intent: { moveX (right +), moveY (forward +), guard, press: [{ k, mx, my }] }
// k: jab direct hookL hookR upper dodge item itemNext pause
const KEYS = {
  KeyJ: 'jab', KeyK: 'direct', KeyU: 'hookL', KeyI: 'hookR', KeyL: 'upper', KeyC: 'duck',
  KeyQ: 'item', Tab: 'itemNext', Enter: 'confirm', KeyE: 'interact', KeyF: 'stone',
};
const HOLD_STEPS = 60; // holding pause for 1 s (60 samples) skips a cutscene; a tap pauses
const DODGE_WINDOW = 4; // samples to wait so the direction key can arrive with Space

export function createInput() {
  const keys = new Set();
  const queue = [];
  let dodgeWait = 0, dodgeDir = null;
  const touch = { mx: 0, my: 0, guard: false, active: false, enabled: false, ui: null };
  const pad = { prev: [], last: null };
  // Look: in a fight the camera aims by itself and the right stick is for dodging; out of a
  // fight ('free') the view is free: mouse (pointer locked), arrow keys, right stick, touch drag.
  let mode = 'fight';
  const lookAcc = { yaw: 0, pitch: 0 };
  const MOUSE_SENS = 0.0022, KEY_LOOK = 2.0 / 60, STICK_LOOK = 2.6 / 60, TOUCH_SENS = 0.006;
  addEventListener('mousemove', (e) => {
    if (mode !== 'free' || !document.pointerLockElement) return;
    lookAcc.yaw -= e.movementX * MOUSE_SENS; lookAcc.pitch -= e.movementY * MOUSE_SENS; lastDevice = 'keyboard';
  });
  let lastDevice = 'keyboard';

  // pause button (Esc, Start, touch button): a tap pauses, holding for 1 s sends 'skip'
  const holds = { esc: null, start: null, touch: null };
  const holdStart = (n) => { holds[n] = 0; };
  const holdEnd = (n) => { if (holds[n] !== null && holds[n] < HOLD_STEPS) queue.push({ k: 'pause' }); holds[n] = null; };
  const holdTick = (n, press) => { if (holds[n] === null) return; holds[n]++; if (holds[n] === HOLD_STEPS) press.push({ k: 'skip' }); };
  const inField = () => { const a = document.activeElement; return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)); };

  const onKeyDown = (e) => {
    // with a text field open every key only types; Esc closes the field
    if (inField()) { if (e.code === 'Escape') document.activeElement.blur(); return; }
    if (e.code === 'Escape') { if (!e.repeat && holds.esc === null) holdStart('esc'); e.preventDefault(); return; }
    if (mode === 'cut') return;   // a cutscene: only Esc (tap pauses, hold skips) counts
    if (mode === 'ui') { // menus, shop, card: discrete navigation
      const nav = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] }[e.code];
      if (nav) queue.push({ k: 'nav', dx: nav[0], dy: nav[1] });
      else if (e.code === 'Tab') queue.push({ k: 'tab', d: e.shiftKey ? -1 : 1 });
      else if (e.code === 'Enter' || e.code === 'Space') queue.push({ k: 'confirm' });
      if (nav || e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space') e.preventDefault();
      return;
    }
    if (e.repeat) { if (e.code in KEYS || e.code === 'Space' || e.code === 'Tab') e.preventDefault(); return; }
    lastDevice = 'keyboard';
    if (e.code === 'Space') { startDodge(); e.preventDefault(); return; }
    if (KEYS[e.code]) { queue.push({ k: KEYS[e.code] }); e.preventDefault(); return; }
    keys.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  };
  const onKeyUp = (e) => { keys.delete(e.code); if (e.code === 'Escape') holdEnd('esc'); };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { keys.clear(); holds.esc = null; });

  function kbMove() {
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    return [x, y];
  }
  function startDodge() { if (dodgeWait === 0) { dodgeWait = DODGE_WINDOW; dodgeDir = [0, 0]; } }

  function readPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const p = [...pads].find((g) => g && g.connected);
    if (!p) { pad.prev = []; return null; }
    const b = (i) => Boolean(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const cur = p.buttons.map((_, i) => b(i));
    const edge = (i) => cur[i] && !pad.prev[i];
    const out = { mx: 0, my: 0, guard: b(4), edges: [] };
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m < 0.2) { ax = 0; ay = 0; } else { const k = Math.min(1, (m - 0.2) / 0.8) / m; ax *= k; ay *= k; }
    out.mx = ax; out.my = -ay;
    let map = [[2, 'jab'], [3, 'direct'], [6, 'hookL'], [7, 'hookR'], [0, 'upper'], [5, 'item'], [12, 'stone'], [14, 'itemPrev'], [15, 'itemNext']];
    if (mode === 'free') map = [[0, 'interact'], [5, 'item'], [14, 'itemPrev'], [15, 'itemNext']];
    if (mode === 'ui') {
      map = [[0, 'confirm'], [4, 'tabPrev'], [5, 'tabNext']];
      const nv = [[12, 0, -1], [13, 0, 1], [14, -1, 0], [15, 1, 0]];
      for (const [i, dx, dy] of nv) if (edge(i)) out.navs = (out.navs || []).concat([{ k: 'nav', dx, dy }]);
      // left stick as a d-pad: one step per push
      const sm = Math.hypot(p.axes[0] || 0, p.axes[1] || 0);
      if (sm > 0.6 && !pad.sOn) { pad.sOn = true; const x = p.axes[0] || 0, y = p.axes[1] || 0; out.navs = (out.navs || []).concat([Math.abs(x) > Math.abs(y) ? { k: 'nav', dx: Math.sign(x), dy: 0 } : { k: 'nav', dx: 0, dy: Math.sign(y) }]); }
      else if (sm < 0.35) pad.sOn = false;
      if (edge(1)) out.edges.push('back');
    }
    if (edge(9)) holdStart('start'); else if (!cur[9] && pad.prev[9]) holdEnd('start');
    for (const [i, k] of map) if (edge(i)) out.edges.push(k);
    if (mode === 'fight' && edge(1)) { out.edges.push('dodge'); out.dodgeBack = true; }
    // right stick: sides, forward step, duck (edge when it crosses the threshold)
    const rx = p.axes[2] || 0, ry = p.axes[3] || 0, rm = Math.hypot(rx, ry);
    out.rx = Math.abs(rx) > 0.15 ? rx : 0; out.ry = Math.abs(ry) > 0.15 ? ry : 0;
    if (mode === 'fight' && rm > 0.6 && !pad.rOn) {
      pad.rOn = true;
      if (Math.abs(rx) > Math.abs(ry)) out.rdodge = { k: 'dodge', mx: Math.sign(rx), my: 0 };
      else if (ry < 0) out.rdodge = { k: 'dodge', mx: 0, my: 1 };
      else out.rdodge = { k: 'duck' };
    } else if (rm < 0.35 || mode !== 'fight') pad.rOn = false;
    if (cur.some((v, i) => v && !pad.prev[i])) lastDevice = 'gamepad';
    pad.prev = cur;
    return out;
  }

  /** Called once per simulation step. */
  function sample() {
    let [mx, my] = kbMove();
    let guard = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (touch.active) { if (Math.hypot(touch.mx, touch.my) > 0.05) { mx = touch.mx; my = touch.my; } guard = guard || touch.guard; }
    const press = queue.splice(0);
    const gp = readPad();
    if (!gp && holds.start !== null) holdEnd('start');
    if (gp) {
      if (Math.hypot(gp.mx, gp.my) > 0) { mx = gp.mx; my = gp.my; }
      guard = guard || gp.guard;
      for (const k of gp.edges) {
        if (k === 'dodge') press.push({ k: 'dodge', mx: 0, my: -1 });
        else if (k === 'tabPrev') press.push({ k: 'tab', d: -1 }); else if (k === 'tabNext') press.push({ k: 'tab', d: 1 });
        else if (k === 'back') press.push({ k: 'pause' });
        else press.push({ k });
      }
      if (gp.navs) press.push(...gp.navs);
      if (gp.rdodge) press.push(gp.rdodge);
    }
    for (const n of Object.keys(holds)) holdTick(n, press);
    // a Space press waits a few samples for the direction to arrive
    if (dodgeWait > 0) {
      if (Math.abs(mx) + Math.abs(my) > Math.abs(dodgeDir[0]) + Math.abs(dodgeDir[1])) dodgeDir = [mx, my];
      dodgeWait--;
      if (dodgeWait === 0) { press.push({ k: 'dodge', mx: dodgeDir[0], my: dodgeDir[1] }); dodgeDir = null; }
    }
    const look = { yaw: 0, pitch: 0 };
    if (mode === 'free') {
      look.yaw = lookAcc.yaw + ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * KEY_LOOK;
      look.pitch = lookAcc.pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * KEY_LOOK;
      if (gp) { look.yaw -= gp.rx * STICK_LOOK; look.pitch -= gp.ry * STICK_LOOK; }
    }
    lookAcc.yaw = lookAcc.pitch = 0;
    if (mode === 'ui' || mode === 'cut') { mx = 0; my = 0; guard = false; if (mode === 'cut') press.splice(0, press.length, ...press.filter((p) => p.k === 'skip' || p.k === 'pause')); }
    return { moveX: mx, moveY: my, guard, press, look };
  }

  // ---- touch ----
  function mountTouch(root, labels) {
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div id="stickzone"><div id="stickbase"><div id="stick"></div></div></div>
      <div id="lookzone"></div>
      <div id="btns">
        <button data-k="hookL">${labels.hookL}</button><button data-k="upper">${labels.upper}</button><button data-k="hookR">${labels.hookR}</button>
        <button data-k="jab">${labels.jab}</button><button data-k="direct">${labels.direct}</button><button data-k="item" class="dim">${labels.item}</button>
        <button data-k="guard">${labels.guard}</button><button data-k="dodge">${labels.dodge}</button><button data-k="duck">${labels.duck}</button>
      </div>
      <button id="stonebtn" data-k="stone">${labels.stone || 'PEDRA'}</button>
      <button id="pausebtn" data-k="pause">&#9208;</button>`;
    root.appendChild(el);
    const zone = el.querySelector('#stickzone'), base = el.querySelector('#stickbase'), knob = el.querySelector('#stick');
    let sid = null, cx = 0, cy = 0;
    const R = 50;
    const move = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const n = Math.hypot(dx, dy) / R;
      touch.mx = n < 0.2 ? 0 : dx / R; touch.my = n < 0.2 ? 0 : -dy / R;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (sid !== null) return;
      sid = e.pointerId; zone.setPointerCapture(sid);
      const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      touch.active = true; lastDevice = 'touch'; move(e); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; touch.mx = touch.my = 0; knob.style.transform = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    // safety: when no finger is left on the screen nothing may stay held
    const none = (e) => { if (e.touches && e.touches.length === 0) { sid = null; touch.mx = touch.my = 0; knob.style.transform = ''; touch.guard = false; for (const b of el.querySelectorAll('button.down')) b.classList.remove('down'); } };
    addEventListener('touchend', none); addEventListener('touchcancel', none);

    const lz = el.querySelector('#lookzone');
    let lid = null, lx = 0, ly = 0;
    let t0 = 0, x0 = 0, y0 = 0, moved = 0;
    lz.addEventListener('pointerdown', (e) => { if (lid !== null || mode !== 'free') return; lid = e.pointerId; lz.setPointerCapture(lid); lx = x0 = e.clientX; ly = y0 = e.clientY; t0 = performance.now(); moved = 0; touch.active = true; lastDevice = 'touch'; e.preventDefault(); });
    lz.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; lookAcc.yaw -= (e.clientX - lx) * TOUCH_SENS; lookAcc.pitch -= (e.clientY - ly) * TOUCH_SENS; moved = Math.max(moved, Math.hypot(e.clientX - x0, e.clientY - y0)); lx = e.clientX; ly = e.clientY; });
    // a short touch (under 0.25 s and 10 px) is a tap on an object; anything more is a drag that only looks
    const lend = (e) => { if (e.pointerId !== lid) return; lid = null; if (e.type === 'pointerup' && performance.now() - t0 < 250 && moved < 10) { queue.push({ k: 'tap', x: e.clientX, y: e.clientY }); lookAcc.yaw = lookAcc.pitch = 0; } };
    lz.addEventListener('pointerup', lend); lz.addEventListener('pointercancel', lend);

    let sx = 0;
    for (const b of el.querySelectorAll('button')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down'); lastDevice = 'touch'; touch.active = true;
        if (k === 'pause') holdStart('touch');
        else if (k === 'guard') touch.guard = true;
        else if (k === 'dodge') { queue.push({ k: 'dodge', mx: touch.mx, my: touch.my }); }
        else if (k === 'item') { sx = e.clientX; }
        else queue.push({ k });
      });
      // the Item button: a tap uses the item, a sideways slide changes the active one
      const up = (e) => {
        b.classList.remove('down'); if (k === 'guard') touch.guard = false; if (k === 'pause') holdEnd('touch');
        if (k === 'item' && e && e.type === 'pointerup') { const dx = e.clientX - sx; queue.push({ k: dx > 28 ? 'itemNext' : dx < -28 ? 'itemPrev' : 'item' }); }
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    for (const t of ['touchstart', 'touchmove']) el.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    touch.ui = el; lastDevice = 'touch'; // on a touch screen the prompts speak of buttons from the start
    return el;
  }
  const hasTouch = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches || 'ontouchstart' in window;

  let lockBound = false;
  function setMode(m, canvas) {
    mode = m;
    document.body.classList.toggle('free', m === 'free');
    document.body.classList.toggle('ui', m === 'ui');
    document.body.classList.toggle('cut', m === 'cut');
    if (canvas && !lockBound) {
      lockBound = true;
      canvas.addEventListener('click', () => { if (mode === 'free' && !document.pointerLockElement) canvas.requestPointerLock?.(); });
    }
    if (m !== 'free' && document.pointerLockElement) document.exitPointerLock();
    queue.length = 0; lookAcc.yaw = lookAcc.pitch = 0;
  }
  return { sample, setMode, get mode() { return mode; }, mountTouch, hasTouch, touch, device: () => lastDevice, queue };
}
