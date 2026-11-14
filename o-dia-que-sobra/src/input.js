// Input from keyboard + mouse, gamepad (Gamepad API) and touch, reduced to one intent per simulation step.
//
// intent: { moveX (right +), moveY (forward +), run, look: { yaw, pitch }, acts: [{ type: 'down' | 'up', immediate, screen }],
//           actDown, press: [{ k, ... }] }
//
// acts: the interact / manipulate button. 'down' and 'up' come in order. `immediate` (left mouse
// button, right trigger) means "manipulate right away"; E and A wait a moment to tell a tap from a hold.
// `screen` is set for touch: the finger position in CSS pixels (the object under the finger is the
// target); without it the target is the central point.
// press k: flash, sheet, inv, invPrev, invNext, crouch, pause, esc, back, confirm, nav {dx,dy}, tab {d}, tap {x,y}
//
// Modes: 'play' (first person), 'ui' (menus: discrete navigation, the pointer is free), 'off' (nothing).
//
// On a phone the touch layer is src/touch/mobile.js (mountMobile below): the stick, the look (and the gyroscope), the
// taps on the picture, the actions by the thumb; it feeds the same intent as the keys and the pad.
import { mountMobile as mountMobileLayer } from './touch/mobile.js';
import { createTilt } from './touch/tilt.js';

const HOLD_STEPS = 60;

export function createInput() {
  const keys = new Set();
  const queue = [];
  const acts = [];
  const touch = { mx: 0, my: 0, run: false, breath: false, active: false, ui: null, pressing: false };
  const pad = { prev: [], sOn: false };
  let mode = 'play';
  let lastDevice = 'keyboard';
  const lookAcc = { yaw: 0, pitch: 0 };
  let canvasEl = null;
  const MOUSE_SENS = 0.0022, KEY_LOOK = 2.0 / 60, STICK_LOOK = 3.0 / 60, TOUCH_SENS = 0.0052;
  let padAct = false, padTrig = false, keyAct = false, mouseAct = false;
  let touchHold = null; // { id, x, y, t0, moved, started }
  let steps = 0;

  const inField = () => { const a = document.activeElement; return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)); };
  const locked = () => Boolean(document.pointerLockElement);

  addEventListener('mousemove', (e) => {
    if (mode !== 'play' || !locked()) return;
    lookAcc.yaw -= e.movementX * MOUSE_SENS; lookAcc.pitch -= e.movementY * MOUSE_SENS; lastDevice = 'keyboard';
  });
  addEventListener('mousedown', (e) => {
    if (mode !== 'play' || e.button !== 0) return;
    if (!locked()) { if (e.target === canvasEl) lock(); return; }
    lastDevice = 'keyboard'; mouseAct = true; acts.push({ type: 'down', immediate: true }); e.preventDefault();
  });
  addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !mouseAct) return;
    mouseAct = false; acts.push({ type: 'up' });
  });
  addEventListener('contextmenu', (e) => { if (mode === 'play') e.preventDefault(); });

  const KEYMAP = { KeyF: 'flash', KeyQ: 'sheet', Tab: 'inv', KeyC: 'crouch' };
  const onKeyDown = (e) => {
    if (inField()) { if (e.code === 'Escape') document.activeElement.blur(); return; }
    if (e.code === 'Escape') { if (!e.repeat) queue.push({ k: 'esc' }); e.preventDefault(); return; }
    if (mode === 'off') return;
    if (mode === 'ui') {
      if (e.repeat && !/^(Arrow|Key[WASD])/.test(e.code)) return;
      const nav = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] }[e.code];
      if (nav) queue.push({ k: 'nav', dx: nav[0], dy: nav[1] });
      else if (/^(Digit|Numpad)\d$/.test(e.code)) queue.push({ k: 'digit', d: Number(e.code.slice(-1)) });
      else if (e.code === 'Tab') queue.push({ k: 'tab', d: e.shiftKey ? -1 : 1 });
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') queue.push({ k: 'confirm' });
      else if (e.code === 'Backspace') queue.push({ k: 'back' });
      else if (e.code === 'KeyQ') queue.push({ k: 'sheet' });
      if (nav || e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space') e.preventDefault();
      return;
    }
    if (e.repeat) { if (e.code in KEYMAP || e.code === 'Space' || e.code === 'KeyE') e.preventDefault(); return; }
    lastDevice = 'keyboard';
    if (e.code === 'KeyE') { if (!keyAct) { keyAct = true; acts.push({ type: 'down', immediate: false }); } e.preventDefault(); return; }
    if (e.code === 'Space') { keys.add('Space'); e.preventDefault(); return; }
    if (e.code === 'Enter') { queue.push({ k: 'confirm' }); return; }
    if (KEYMAP[e.code]) { queue.push({ k: KEYMAP[e.code] }); e.preventDefault(); return; }
    keys.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyE' && keyAct) { keyAct = false; acts.push({ type: 'up' }); }
  };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  const releaseAll = () => {
    keys.clear();
    if (keyAct) { keyAct = false; acts.push({ type: 'up' }); }
    if (mouseAct) { mouseAct = false; acts.push({ type: 'up' }); }
    if (padAct || padTrig) { padAct = padTrig = false; acts.push({ type: 'up' }); }
    if (touchHold && touchHold.started) acts.push({ type: 'up' });
    touchHold = null;
    if (mobileHeld) { mobileHeld = 0; acts.push({ type: 'up' }); }
  };
  addEventListener('blur', releaseAll);

  function kbMove() {
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    return [x, y];
  }

  function readPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const p = [...pads].find((g) => g && g.connected);
    if (!p) { pad.prev = []; return null; }
    const b = (i) => Boolean(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const cur = p.buttons.map((_, i) => b(i));
    const edge = (i) => cur[i] && !pad.prev[i];
    const out = { mx: 0, my: 0, breath: b(2), run: b(4) || b(10), rx: 0, ry: 0, press: [] };
    const dz = (v) => { const m = Math.abs(v); return m < 0.18 ? 0 : Math.sign(v) * (m - 0.18) / 0.82; };
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m < 0.2) { ax = 0; ay = 0; } else { const k = Math.min(1, (m - 0.2) / 0.8) / m; ax *= k; ay *= k; }
    out.mx = ax; out.my = -ay;
    out.rx = dz(p.axes[2] || 0); out.ry = dz(p.axes[3] || 0);
    if (mode === 'ui') {
      if (edge(0)) out.press.push({ k: 'confirm' });
      if (edge(1)) out.press.push({ k: 'back' });
      if (edge(4)) out.press.push({ k: 'tab', d: -1 });
      if (edge(5)) out.press.push({ k: 'tab', d: 1 });
      if (edge(8)) out.press.push({ k: 'sheet' });
      for (const [i, dx, dy] of [[12, 0, -1], [13, 0, 1], [14, -1, 0], [15, 1, 0]]) if (edge(i)) out.press.push({ k: 'nav', dx, dy });
      const sm = Math.hypot(p.axes[0] || 0, p.axes[1] || 0);
      if (sm > 0.6 && !pad.sOn) { pad.sOn = true; const x = p.axes[0] || 0, y = p.axes[1] || 0; out.press.push(Math.abs(x) > Math.abs(y) ? { k: 'nav', dx: Math.sign(x), dy: 0 } : { k: 'nav', dx: 0, dy: Math.sign(y) }); }
      else if (sm < 0.35) pad.sOn = false;
      if (edge(9)) out.press.push({ k: 'esc' });
    } else if (mode === 'play') {
      if (edge(1)) out.press.push({ k: 'crouch' });
      if (edge(3)) out.press.push({ k: 'flash' });
      if (edge(8)) out.press.push({ k: 'sheet' });
      if (edge(9)) out.press.push({ k: 'esc' });
      if (edge(14)) out.press.push({ k: 'invPrev' });
      if (edge(15)) out.press.push({ k: 'invNext' });
      if (edge(12)) out.press.push({ k: 'inv' });
      // A: tap / hold (waits); RT: manipulate at once
      if (edge(0) && !padTrig) { padAct = true; acts.push({ type: 'down', immediate: false }); }
      if (edge(7) && !padAct) { padTrig = true; acts.push({ type: 'down', immediate: true }); }
      if ((padAct && !cur[0]) || (padTrig && !cur[7])) { padAct = padTrig = false; acts.push({ type: 'up' }); }
    }
    if (cur.some((v, i) => v && !pad.prev[i]) || Math.abs(p.axes[0] || 0) > 0.5 || Math.abs(p.axes[2] || 0) > 0.5) lastDevice = 'gamepad';
    pad.prev = cur;
    return out;
  }

  /** Called once per simulation step. */
  function sample() {
    steps++;
    let [mx, my] = kbMove();
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (touch.active && Math.hypot(touch.mx, touch.my) > 0.05) { mx = touch.mx; my = touch.my; }
    run = run || touch.run;
    let breath = keys.has('Space') || touch.breath;
    const press = queue.splice(0);
    const gp = readPad();
    if (!gp && (padAct || padTrig)) { padAct = padTrig = false; acts.push({ type: 'up' }); }
    if (gp) {
      if (Math.hypot(gp.mx, gp.my) > 0) { mx = gp.mx; my = gp.my; }
      run = run || gp.run; breath = breath || gp.breath;
      press.push(...gp.press);
    }
    // touch: a finger that stays on an object for 0.25 s starts a hold
    if (touchHold && !touchHold.started && !touchHold.moved && steps - touchHold.s0 >= 15) {
      touchHold.started = true; acts.push({ type: 'down', immediate: false, screen: { x: touchHold.x, y: touchHold.y } });
    }
    const look = { yaw: 0, pitch: 0 };
    if (mode === 'play') {
      look.yaw = lookAcc.yaw + ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * KEY_LOOK;
      look.pitch = lookAcc.pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * KEY_LOOK;
      if (gp) { look.yaw -= gp.rx * Math.abs(gp.rx) * STICK_LOOK * 1.4; look.pitch -= gp.ry * Math.abs(gp.ry) * STICK_LOOK * 1.4; }
    }
    lookAcc.yaw = lookAcc.pitch = 0;
    if (mode !== 'play') { mx = 0; my = 0; run = false; acts.length = 0; }
    if (mode === 'off') press.length = 0;
    return { moveX: mx, moveY: my, run, breath: breath && mode === 'play', look, acts: acts.splice(0), press, actDown: keyAct || mouseAct || padAct || padTrig || mobileHeld > 0 || Boolean(touchHold && touchHold.started) };
  }

  // ---- touch ----
  function mountTouch(root, labels) {
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div id="lookzone"></div>
      <div id="stickzone"><div id="stickbase"><div id="stick"></div></div></div>
      <div id="btns">
        <button data-k="sheet">${labels.sheet}</button><button data-k="inv">${labels.inv}</button>
        <button data-k="flash">${labels.flash}</button><button data-k="crouch">${labels.crouch}</button>
        <button data-k="run" class="hold">${labels.run}</button><button data-k="breath" class="hold">${labels.breath || 'RESPIRAR'}</button>
      </div>
      <button id="pausebtn" data-k="esc">&#9208;</button>`;
    root.appendChild(el);
    const zone = el.querySelector('#stickzone'), base = el.querySelector('#stickbase'), knob = el.querySelector('#stick');
    let sid = null, cx = 0, cy = 0;
    const R = 46;
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
      sid = e.pointerId; try { zone.setPointerCapture(sid); } catch { /* synthetic pointer */ }
      const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      touch.active = true; lastDevice = 'touch'; move(e); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; touch.mx = touch.my = 0; knob.style.transform = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    // safety: when no finger is left on the screen nothing may stay held
    const none = (e) => { if (e.touches && e.touches.length === 0) { sid = null; touch.mx = touch.my = 0; knob.style.transform = ''; touch.run = false; touch.breath = false; for (const b of el.querySelectorAll('button.down')) b.classList.remove('down'); } };
    addEventListener('touchend', none); addEventListener('touchcancel', none);

    // the look zone covers the screen: a drag looks, a short touch taps the object under the finger,
    // a finger resting on an object holds
    const lz = el.querySelector('#lookzone');
    let lid = null, lx = 0, ly = 0, x0 = 0, y0 = 0, t0 = 0;
    lz.addEventListener('pointerdown', (e) => {
      if (lid !== null || mode !== 'play') return;
      lid = e.pointerId; try { lz.setPointerCapture(lid); } catch { /* synthetic pointer */ } lx = x0 = e.clientX; ly = y0 = e.clientY; t0 = performance.now();
      touch.active = true; lastDevice = 'touch'; e.preventDefault();
      touchHold = { id: lid, x: x0, y: y0, moved: false, started: false, s0: steps };
    });
    lz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      const far = Math.hypot(e.clientX - x0, e.clientY - y0);
      if (touchHold && !touchHold.started && far > 9) touchHold.moved = true;
      if (touchHold && touchHold.started) return; // a hold keeps the view still
      if (touchHold && touchHold.moved) { lookAcc.yaw -= (e.clientX - lx) * TOUCH_SENS; lookAcc.pitch -= (e.clientY - ly) * TOUCH_SENS; }
      lx = e.clientX; ly = e.clientY;
    });
    const lend = (e) => {
      if (e.pointerId !== lid) return;
      lid = null;
      const h = touchHold; touchHold = null;
      if (!h) return;
      if (h.started) acts.push({ type: 'up' });
      else if (e.type === 'pointerup' && !h.moved && performance.now() - t0 < 400) {
        acts.push({ type: 'down', immediate: false, screen: { x: h.x, y: h.y } }, { type: 'up' });
      }
    };
    lz.addEventListener('pointerup', lend); lz.addEventListener('pointercancel', lend);

    for (const b of el.querySelectorAll('button')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } b.classList.add('down'); lastDevice = 'touch'; touch.active = true;
        if (k === 'run') touch.run = true; else if (k === 'breath') touch.breath = true; else queue.push({ k });
      });
      const up = () => { b.classList.remove('down'); if (k === 'run') touch.run = false; if (k === 'breath') touch.breath = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    for (const t of ['touchstart', 'touchmove']) el.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    touch.ui = el; lastDevice = 'touch';
    return el;
  }
  // ---- the phone's layer (the redesign): the same intent, from src/touch/mobile.js ----
  let mobileHeld = 0;          // action buttons held down (they count as the interact button)
  let mobileList = false;      // whether the actions shown are a list (a choice) or the one in the aim
  let tilt = null;
  let onTilt = null;   // the game hears how a pending gyroscope ask ended ('on' | 'denied')
  function mountMobile(root, options = {}) {
    const m = mountMobileLayer(root, {
      move: (mx, my, run) => { touch.mx = mx; touch.my = my; touch.run = run; touch.active = true; },
      look: (dyaw, dpitch) => { if (mode !== 'play') return; lookAcc.yaw += dyaw; lookAcc.pitch += dpitch; },
      press: (k) => { lastDevice = 'touch'; queue.push({ k }); },
      tap: (x, y) => { acts.push({ type: 'down', immediate: false, screen: { x, y } }, { type: 'up' }); },
      hold: (x, y, phase) => {
        if (phase === 'down') { touchHold = { id: -1, x, y, moved: false, started: true, s0: steps }; acts.push({ type: 'down', immediate: false, screen: { x, y } }); }
        else { if (touchHold && touchHold.started) acts.push({ type: 'up' }); touchHold = null; }
      },
      act: (i, phase) => {
        if (phase === 'down') { mobileHeld++; acts.push(mobileList ? { type: 'down', immediate: false, choice: i } : { type: 'down', immediate: false, pick: i }); }
        else { mobileHeld = Math.max(0, mobileHeld - 1); acts.push({ type: 'up' }); }
      },
      breath: (on) => { touch.breath = on; },
      used: () => { lastDevice = 'touch'; touch.active = true; },
    }, options);
    touch.ui = m.el; touch.mobile = m;
    tilt = createTilt({ onLook: (dyaw, dpitch) => { if (mode === 'play') { lookAcc.yaw += dyaw; lookAcc.pitch += dpitch; } }, onChange: (st) => onTilt?.(st) });
    m.setPlaying(mode === 'play');
    lastDevice = 'touch';
    return m;
  }
  /** The actions on the phone's layer: the game passes what the prompt shows (a list to choose from, or the one in the aim). */
  function setMobileActions(s, isList) { mobileList = Boolean(isList); touch.mobile?.setActions(s); }

  const hasTouch = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches || 'ontouchstart' in window;

  function lock() { if (canvasEl && !locked()) { try { const p = canvasEl.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed now */ } } }
  function unlock() { if (locked()) document.exitPointerLock(); }
  function setMode(m, canvas) {
    if (canvas) canvasEl = canvas;
    if (m !== mode) releaseAll();
    if (m === 'play' && m !== mode) tilt?.recenter?.();   // back to play: the way the phone is held now is the resting pose
    mode = m;
    document.body.classList.toggle('play', m === 'play');
    document.body.classList.toggle('ui', m === 'ui');
    if (m !== 'play') unlock();
    if (touch.mobile) touch.mobile.setPlaying(m === 'play'); else if (touch.ui) touch.ui.hidden = m !== 'play';
    queue.length = 0; acts.length = 0; lookAcc.yaw = lookAcc.pitch = 0;
  }
  const setLastDevice = (d) => { lastDevice = d; };
  return { sample, setMode, get mode() { return mode; }, mountTouch, mountMobile, setMobileActions, get tilt() { return tilt; }, set onTilt(f) { onTilt = f; }, hasTouch, touch, device: () => lastDevice, setLastDevice, queue, lock, unlock, locked, HOLD_STEPS };
}
