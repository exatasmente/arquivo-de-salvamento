// The touch controls (docs: "Comandos", the Toque column): a stick at the left, a drag on the right half to look,
// and the buttons. Shown when the device is touch (coarse pointer or a first touch); `S` is the state the input
// reads (src/systems/input.js).
// [id, label, contexts it shows in] (the game sets the context on #app[data-ctx]: walk, examine, radio, cut, screen)
const BUTTONS = [
  ['use', 'Usar', 'walk'],
  ['run', 'Correr', 'walk'],
  ['crouch', 'Agachar', 'walk'],
  ['aim', 'Item', 'walk'],
  ['light', 'Lanterna', 'walk examine'],
  ['handRadio', 'Rádio', 'walk'],
  ['pocket', 'Bolso', 'walk'],
  ['dirL', '◀', 'seq'],
  ['dirR', '▶', 'seq'],
  ['back', '✗ Voltar', 'examine radio hands'],
  ['skip', 'Pular', 'cut'],
];

export function createTouch({ root, S, look, onTap = null }) {
  const el = document.createElement('div'); el.id = 'touch'; el.hidden = true;
  el.innerHTML = '<div id="stick"><i></i></div>' + BUTTONS.map(([id, label, w]) => `<button class="tb tb-${id} ${w.split(' ').map((x) => 'w-' + x).join(' ')}" data-b="${id}" type="button">${label}</button>`).join('') + '<button id="tb-pause" class="tb" data-b="pause" type="button" aria-label="Menu">☰</button>';
  root.appendChild(el);
  const stick = el.querySelector('#stick'), knob = stick.firstElementChild;
  let on = false;
  const show = () => { if (on) return; on = true; S.active = true; el.hidden = false; document.body.classList.add('touch'); };
  if (matchMedia('(pointer: coarse)').matches) show();
  addEventListener('touchstart', show, { passive: true, once: true });

  const R = 56; // stick radius in px
  let sId = null, sOrigin = [0, 0];
  const setStick = (x, y) => {
    let dx = x - sOrigin[0], dy = y - sOrigin[1];
    const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.hypot(dx, dy) / R, dead = 0.18;
    S.move = k < dead ? [0, 0] : [dx / R, dy / R];
  };
  // Left half: the stick floats to where the finger lands (low enough on the screen not to be the look).
  // Right half: look, and the press on an object (a tap uses, a hold manipulates).
  let lId = null, last = [0, 0], down = [0, 0], downAt = 0, moved = false, pinchD = 0;
  const pts = new Map();
  el.addEventListener('pointerdown', (e) => {
    show();
    if (root.dataset.ctx === 'cut') return;            // a cutscene is skipped with the Pular button
    if (e.target.closest('button')) return;
    // at the radio a touch is a finger on the radio itself (the game finds what is under it); in the hands, a tap on the left or the right half turns the page
    if (root.dataset.ctx === 'radio') { onTap?.(e.clientX, e.clientY); e.preventDefault(); return; }
    if (root.dataset.ctx === 'hands') { S.hand = e.clientX < innerWidth / 2 ? -1 : 1; e.preventDefault(); return; }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (e.clientX < innerWidth * 0.5 && sId === null) {
      sId = e.pointerId; sOrigin = [e.clientX, e.clientY];
      stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`; stick.classList.add('on');
      setStick(e.clientX, e.clientY);
    } else if (e.clientX >= innerWidth * 0.5) {
      if (lId === null) {
        lId = e.pointerId; last = [e.clientX, e.clientY]; down = [e.clientX, e.clientY]; downAt = performance.now(); moved = false;
        S.press.down = true; S.press.at = [e.clientX, e.clientY]; S.latch = true; S.latchAt = [e.clientX, e.clientY];
      } else if (pts.size >= 2) { const [a, b] = [...pts.values()].slice(-2); pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); S.press.down = false; S.press.cancel = true; }
    }
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (e.pointerId === sId) setStick(e.clientX, e.clientY);
    else if (e.pointerId === lId) {
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      if (!moved && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12) { moved = true; S.press.down = false; S.press.cancel = true; }
      if (moved) look.touch(dx, dy);
    }
    if (pts.size >= 2 && lId !== null) {
      const [a, b] = [...pts.values()].slice(-2), d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchD) S.pinch += (pinchD - d) / 60;
      pinchD = d;
    }
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (e.pointerId === sId) { sId = null; S.move = [0, 0]; stick.classList.remove('on'); knob.style.transform = ''; }
    if (e.pointerId === lId) { lId = null; S.press.down = false; pinchD = 0; }
    if (pts.size < 2) pinchD = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // The buttons. Usar is a press (tap uses, hold manipulates); the others are toggles or one-shot presses.
  for (const b of el.querySelectorAll('button')) {
    const id = b.dataset.b;
    b.addEventListener('pointerdown', (e) => {
      show(); e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      if (id === 'use') { S.press.down = true; S.press.at = null; S.latch = true; S.latchAt = null; } else if (id === 'aim') S.aim = true; else S.edges.add(id);
    });
    const up = (e) => { b.classList.remove('down'); if (id === 'use') { S.press.down = false; } else if (id === 'aim' && S.aim) { S.aim = false; S.fire = true; } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  return {
    el,
    /** Shows a toggle's state on its button (run, crouch, light). */
    mark(id, v) { el.querySelector(`.tb-${id}`)?.classList.toggle('on', Boolean(v)); },
    /** The button Usar takes the label of the action in front of the player. */
    label(text) { const b = el.querySelector('.tb-use'); if (b && b.textContent !== text) b.textContent = text; },
    get visible() { return on; },
  };
}
