// The engine's input pieces (docs/engine.md, "Entrada"): what the channel's games repeat when they read a
// keyboard, a gamepad and touch, so a new game does not write it again. Which key or button does what, and
// the game's modes (playing, menus, a cutscene), stay the game's: it builds its intent from these pieces.

/** A button counts as held when the pad says pressed, or when an analog one is past half. */
export const buttonHeld = (b) => Boolean(b && (b.pressed || b.value > 0.5));

/** The first connected gamepad, or null. `list`: navigator.getGamepads(), passed for a test. */
export function firstPad(list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []) {
  return [...(list || [])].find((g) => g && g.connected) ?? null;
}

/**
 * A stick with a round dead zone: under `dead` it is still, past it the push is rescaled from 0 to 1, so a
 * light touch starts slow (the left stick of both games: walking).
 */
export function radial(x = 0, y = 0, dead = 0.2) {
  const m = Math.hypot(x, y);
  if (m < dead || m === 0) return [0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead)) / m;
  return [x * k, y * k];
}

/** One axis with its own dead zone, rescaled past it (a look stick). */
export function axial(v = 0, dead = 0.18) {
  const m = Math.abs(v);
  return m < dead ? 0 : Math.sign(v) * (m - dead) / (1 - dead);
}

/**
 * A gamepad read once per step: which buttons are held, which went down this step (edges), and the stick
 * pushed far enough to be one step of menu navigation (once per push: past `navAt`, and back under
 * `resetAt` to push again; 0.6 and 0.35 in both games). Returns null without a pad.
 */
export function createPad({ navAt = 0.6, resetAt = 0.35 } = {}) {
  let prev = [], navOn = false;
  return {
    read(list) {
      const p = firstPad(list);
      if (!p) { prev = []; navOn = false; return null; }
      const held = p.buttons.map((b) => buttonHeld(b));
      const down = held.map((h, i) => h && !prev[i]);
      const up = held.map((h, i) => !h && Boolean(prev[i]));
      prev = held;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, m = Math.hypot(ax, ay);
      let nav = null;
      if (m > navAt && !navOn) { navOn = true; nav = Math.abs(ax) > Math.abs(ay) ? { dx: Math.sign(ax), dy: 0 } : { dx: 0, dy: Math.sign(ay) }; }
      else if (m < resetAt) navOn = false;
      return { pad: p, held, down, up, axes: [...p.axes], nav, any: down.some(Boolean) };
    },
  };
}

/**
 * The pause button of the channel's games: a tap pauses, holding it for `steps` simulation steps (1 s at 60)
 * skips (a cutscene). start(name) when it goes down, end(name) when it comes up → 'tap' when it was a tap;
 * tick() once per step → 'hold' the step it becomes a hold. Several sources (Esc, Start, a touch button)
 * each have their own name.
 */
export function createHold(steps = 60) {
  const holds = new Map();
  return {
    start(name) { if (!holds.has(name)) holds.set(name, 0); },
    end(name) {
      if (!holds.has(name)) return null;
      const n = holds.get(name);
      holds.delete(name);
      return n < steps ? 'tap' : null;
    },
    tick() {
      let out = null;
      for (const [name, n] of holds) { holds.set(name, n + 1); if (n + 1 === steps) out = 'hold'; }
      return out;
    },
    holding: (name) => holds.has(name),
    /** Stops counting without a tap (the page lost focus with the button down). */
    cancel(name) { holds.delete(name); },
  };
}

/** Whether the page is typing into a field (then the game's keys must not act). `doc` for a test. */
export function typing(doc = typeof document !== 'undefined' ? document : null) {
  const a = doc?.activeElement;
  return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
}

/**
 * Where the player looks, gathered between steps from every source with its own sensitivity (mouse with the
 * pointer locked, keys, the right stick, a touch drag) and taken once per step. The last device used is kept
 * for the game's on-screen hints. The default sensitivities are the Rinha's (the other game uses stick 3/60
 * and touch 0.0052, and shapes its stick before: pass yours). Signs: mouse, stick and touch take screen
 * deltas (y down); keys take arrow directions (x right, y up), as the games' arrows do.
 */
export function createLook({ mouse = 0.0022, keys = 2.0 / 60, stick = 2.6 / 60, touch = 0.006 } = {}) {
  const acc = { yaw: 0, pitch: 0 };
  let device = 'keyboard';
  const add = (dyaw, dpitch, from) => { acc.yaw += dyaw; acc.pitch += dpitch; if (from) device = from; };
  return {
    mouse(dx, dy) { add(-dx * mouse, -dy * mouse, 'keyboard'); },
    keys(x, y) { add(-x * keys, y * keys, 'keyboard'); },
    stick(x, y) { if (x || y) add(-x * stick, -y * stick, 'gamepad'); },
    touch(dx, dy) { add(-dx * touch, -dy * touch, 'touch'); },
    /** What was gathered since the last step, and back to zero. */
    take() { const out = { ...acc }; acc.yaw = 0; acc.pitch = 0; return out; },
    get device() { return device; },
    set device(d) { device = d; },
  };
}
