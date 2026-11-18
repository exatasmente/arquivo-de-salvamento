// The input of the game: keyboard, gamepad and touch become one intent per step, by CONTEXT (docs: kb design, "Comandos (versão 2)"): each
// context has one owner per button. Contexts: `walk` (the station and the street, with the quick reaction), `examine` (first person on an
// object), `hands` (first person on the notebook and the pocket: ← → turn the page or change the item), `radio` (the radio of the station,
// where the conversations happen: Jonas sits at it and the person does what he does there), `keys` (the colour buttons of the radio), `field`
// (the password at the radio's keypad, by pad: a cursor on the twelve keys), `screen` (menus) and `cut` (a cutscene). The pieces (dead zones, the look,
// the pad read) are the engine's (vendor/engine/input.js).
//
//   const input = createInput({ canvas, look, S });
//   input.read(ctx) -> {
//     mx, mz, dir (-1 | 0 | 1: left or right pressed this step: the dodge and the alternating hammer of a sequence), run (held), toggleRun, crouch, light, handRadio, pocket, pause, react, aim (held), fire, press { down, at, cancel }, back,
//     radio: { tune, move, pick (0..2 or -1), talk (held), field, leave, advance },
//     keys: { move, tune, put, erase, send (held), close },
//     hands: { dx, back },
//     nav { dx, dy, ok, back, tabL, tabR }, skip (a hold of Esc / Start / touch), device }
// Touch writes to S (src/systems/touch.js): the stick, the press, the buttons pressed since the last read.
import { createPad, radial, axial, typing } from '../../vendor/engine/input.js';

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const HOLD_STEPS = 60;

export function createInput({ canvas, look, S = {} }) {
  const keys = new Set(), edges = new Set(), ups = new Set();
  const pad = createPad();
  let wheel = 0, device = 'keyboard', latch = false, mouseAim = false, mouseFire = false, captured = false;
  let escHold = 0, padStartHold = 0;
  S.ptr = null;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') S.ptr = [e.clientX, e.clientY]; });
  S.move = [0, 0]; S.press = { down: false, at: null, cancel: false }; S.edges = new Set(); S.run = false; S.active = false; S.aim = false; S.fire = false; S.hold = false; S.react = false;

  const stop = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
  addEventListener('keydown', (e) => {
    if (typing() || captured) return;
    if (stop.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code); edges.add(e.code); device = 'keyboard';
    if (e.code === 'KeyE') latch = true;
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); ups.add(e.code); });
  addEventListener('blur', () => { keys.clear(); S.press.cancel = true; mouseAim = false; });
  addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { device = 'keyboard'; look.mouse(e.movementX, e.movementY); } });
  // the right button aims, the left one fires (the planes are fixed: there is no pointer lock to walk, so no lock is asked for here)
  addEventListener('mousedown', (e) => { if (e.target.closest?.('button, #screens')) return; if (e.button === 2) mouseAim = true; if (e.button === 0 && mouseAim) mouseFire = true; });
  addEventListener('mouseup', (e) => { if (e.button === 2) mouseAim = false; });
  addEventListener('contextmenu', (e) => { if (e.target === canvas || e.target.closest?.('#app')) e.preventDefault(); });

  const edge = (c) => edges.has(c), held = (c) => keys.has(c), up = (c) => ups.has(c);
  return {
    S,
    get device() { return S.active ? 'touch' : device; },
    /** While the game's own text field is open it takes the typing: the game keys are ignored. */
    capture(on) { captured = on; if (on) { keys.clear(); edges.clear(); } },
    read(ctx = 'walk') {
      const p = pad.read();
      const walk = ctx === 'walk', exam = ctx === 'examine', hands = ctx === 'hands', radio = ctx === 'radio', kb = ctx === 'keys', screen = ctx === 'screen';
      let mx = walk ? (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0) : 0, mz = walk ? (held('KeyS') ? 1 : 0) - (held('KeyW') ? 1 : 0) : 0;
      const o = {
        mx: 0, mz: 0, dir: walk ? (edge('ArrowRight') || edge('KeyD') ? 1 : 0) - (edge('ArrowLeft') || edge('KeyA') ? 1 : 0) : 0, run: walk && (held('ShiftLeft') || held('ShiftRight')), toggleRun: false, crouch: walk && edge('KeyC'), light: (walk || exam) && edge('KeyF'),
        handRadio: walk && edge('KeyR'), pocket: walk && edge('KeyI'), pause: edge('Escape') && walk, react: edge('Space') && walk,
        aim: walk && mouseAim, fire: walk && mouseFire, aimHold: false, back: exam && (edge('Escape') || edge('KeyE')),
        press: { down: (walk || exam) && (held('KeyE') || latch), at: null, cancel: false }, device: this.device, skip: false,
        radio: { tune: 0, move: 0, pick: -1, talk: false, field: false, leave: false, advance: false },
        keys: { move: 0, tune: 0, put: false, erase: false, send: false, close: false },
        hands: { dx: 0, back: false },
        nav: { dx: 0, dy: 0, ok: false, back: false, tabL: false, tabR: false },
      };
      look.keys((walk || exam) ? (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0) : 0, (walk || exam) ? (held('ArrowUp') ? 1 : 0) - (held('ArrowDown') ? 1 : 0) : 0);
      // the radio of the station
      if (radio) {
        const R = o.radio;
        R.tune = (edge('ArrowRight') ? 1 : 0) - (edge('ArrowLeft') ? 1 : 0) + Math.sign(wheel);
        R.move = (edge('ArrowDown') ? 1 : 0) - (edge('ArrowUp') ? 1 : 0);
        R.pick = edge('Digit1') ? 0 : edge('Digit2') ? 1 : edge('Digit3') ? 2 : -1;
        R.talk = held('KeyT'); R.field = edge('Enter') || edge('NumpadEnter'); R.leave = edge('Escape'); R.advance = edge('KeyE');
      }
      if (kb) {
        const K = o.keys;
        K.tune = (edge('ArrowDown') ? 1 : 0) - (edge('ArrowUp') ? 1 : 0) + Math.sign(wheel);
        K.move = (edge('ArrowRight') ? 1 : 0) - (edge('ArrowLeft') ? 1 : 0); K.put = edge('KeyE') || edge('Enter'); K.erase = edge('Backspace'); K.send = held('KeyT'); K.close = edge('Escape');
      }
      if (hands) { o.hands.dx = (edge('ArrowRight') ? 1 : 0) - (edge('ArrowLeft') ? 1 : 0); o.hands.back = edge('Escape') || edge('KeyE'); }
      wheel = 0;
      // the screens: arrows, Enter or E, Esc, Tab / Shift+Tab
      const n = o.nav;
      n.dy = (edge('ArrowDown') ? 1 : 0) - (edge('ArrowUp') ? 1 : 0); n.dx = (edge('ArrowRight') ? 1 : 0) - (edge('ArrowLeft') ? 1 : 0);
      n.ok = edge('Enter') || edge('KeyE') || edge('NumpadEnter'); n.back = edge('Escape') || edge('Backspace');
      n.tabR = edge('Tab') && !held('ShiftLeft'); n.tabL = edge('Tab') && held('ShiftLeft');
      // Esc held for a second skips a cutscene
      escHold = held('Escape') ? escHold + 1 : 0;
      if (escHold >= HOLD_STEPS) { o.skip = true; escHold = 0; }
      if (p) {
        const [sx, sy] = radial(p.axes[0], p.axes[1]);
        if (walk && (sx || sy)) { mx = sx; mz = sy; }
        if (sx || sy) device = 'gamepad';
        look.stick((walk || exam) ? axial(p.axes[2]) : 0, (walk || exam) ? axial(p.axes[3]) : 0);
        if (p.any) device = 'gamepad';
        const d = p.down, h = p.held, lt = p.pad.buttons[PAD.LT]?.value || 0;
        if (walk) {
          if (h[PAD.A]) o.press.down = true;
          if (d[PAD.B]) o.crouch = true;
          if (d[PAD.Y]) o.light = true;
          if (d[PAD.X]) o.react = true;
          if (d[PAD.L3]) o.toggleRun = true;
          if (d[PAD.UP]) o.handRadio = true;
          if (d[PAD.DOWN]) o.pocket = true;
          if (d[PAD.START]) o.pause = true;
          o.dir += (d[PAD.RIGHT] ? 1 : 0) - (d[PAD.LEFT] ? 1 : 0);
          if (lt > 0.5) o.aim = true;
          if (d[PAD.RT]) o.fire = true;
        } else if (exam) {
          if (h[PAD.A]) o.press.down = true;
          if (d[PAD.A] || d[PAD.B]) o.back = true;
          if (d[PAD.Y]) o.light = true;
        } else if (radio) {
          const R = o.radio;
          R.tune += (d[PAD.RB] ? 1 : 0) - (d[PAD.LB] ? 1 : 0);
          R.move += (d[PAD.DOWN] ? 1 : 0) - (d[PAD.UP] ? 1 : 0);
          R.talk ||= h[PAD.RT]; R.field ||= d[PAD.Y]; R.leave ||= d[PAD.B]; R.advance ||= d[PAD.A];
        } else if (hands) {
          o.hands.dx += (d[PAD.RIGHT] || d[PAD.RB] ? 1 : 0) - (d[PAD.LEFT] || d[PAD.LB] ? 1 : 0); o.hands.back ||= d[PAD.A] || d[PAD.B];
        } else if (kb) {
          const K = o.keys;
          K.tune += (d[PAD.RB] ? 1 : 0) - (d[PAD.LB] ? 1 : 0);
          K.move += (d[PAD.RIGHT] ? 1 : 0) - (d[PAD.LEFT] ? 1 : 0); K.put ||= d[PAD.A]; K.erase ||= d[PAD.X]; K.send ||= h[PAD.RT]; K.close ||= d[PAD.B];
        }
        // the screens by pad: d-pad or left stick, A, B, LB/RB for tabs
        const nv = p.nav;
        n.dy ||= (d[PAD.DOWN] ? 1 : 0) - (d[PAD.UP] ? 1 : 0) || (nv?.dy ?? 0); n.dx ||= (d[PAD.RIGHT] ? 1 : 0) - (d[PAD.LEFT] ? 1 : 0) || (nv?.dx ?? 0);
        n.ok ||= d[PAD.A]; n.back ||= d[PAD.B]; n.tabL ||= d[PAD.LB]; n.tabR ||= d[PAD.RB];
        o.nav.start = d[PAD.START]; o.nav.erase = d[PAD.X];
        padStartHold = h[PAD.START] ? padStartHold + 1 : 0;
        if (padStartHold >= HOLD_STEPS) { o.skip = true; padStartHold = 0; }
      }
      // the touch stick, the touch buttons
      const E = S.edges;
      if (walk && (S.move[0] || S.move[1])) { mx = S.move[0]; mz = S.move[1]; }
      if (E.has('crouch') && walk) o.crouch = true;
      if (E.has('light')) o.light = true;
      if (E.has('pause')) o.pause = true;
      if (E.has('run')) o.toggleRun = true;
      if (E.has('handRadio')) o.handRadio = true;
      if (E.has('pocket')) o.pocket = true;
      if (E.has('react')) o.react = true;
      if (walk) o.dir += (E.has('dirR') ? 1 : 0) - (E.has('dirL') ? 1 : 0);
      if (E.has('back')) { o.back = true; o.hands.back = true; o.radio.leave = true; o.keys.close = true; }
      if (hands && S.hand) { o.hands.dx += S.hand; }
      S.hand = 0;
      if (E.has('skip')) o.skip = true;
      if (walk && S.aim) o.aim = true;
      if (S.fire) { o.fire = true; S.fire = false; }
      if (S.hold) { o.skip = true; S.hold = false; }
      if ((walk || exam) && (S.press.down || S.latch)) { o.press.down = true; o.press.at = S.press.at ?? S.latchAt ?? null; }
      S.latch = false; S.latchAt = null; latch = false;
      if (S.press.cancel) { o.press.cancel = true; S.press.cancel = false; }
      E.clear();
      mouseFire = false;
      o.dir = Math.sign(o.dir);
      const m = Math.hypot(mx, mz);
      o.mx = m > 1 ? mx / m : mx; o.mz = m > 1 ? mz / m : mz;
      edges.clear(); ups.clear();
      return o;
    },
    /** For tests: hold or release a key as if typed. */
    keys,
  };
}
