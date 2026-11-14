// Aiming by tilting the phone, like a stick: held on its side (or upright), tilting it to the left turns the view to the
// left, to the right turns it right, up and down look up and down; back at the resting pose, the view stops. The pose
// at rest is taken when the gyroscope is switched on and every time the game comes back to play (t.recenter()), so the
// player holds the phone the way they like. Small tilts do nothing (the hand's natural sway); past that the turn starts
// slow and grows with the tilt, and keeps growing for a moment while the phone stays tilted.
//
//   const t = createTilt({ onLook(dyaw, dpitch), sensitivity, onChange(state) })   radians, the signs of the game's look (yaw left +, pitch up +)
//   await t.enable()   → true when the sensor is on, 'pending' when the phone asks first and the asking waits for a tap
//                        (iOS: requestPermission only works inside a touchend or a click, never a pointerdown nor a frame;
//                        so a one-shot listener for the next touchend/click asks there), false when there is no sensor
//                        or it was refused. onChange('on' | 'denied') says how a pending ask ended.
//   t.recenter() · t.disable() · t.on · t.pending · t.supported · t.sensitivity = 1.5 · t.invertY = true
//
// The tilt comes from gravity (devicemotion's accelerationIncludingGravity), in the phone's own axes. The turn to the
// sides is the rotation of the phone around the axis out of its screen (a steering wheel): the angle of gravity in the
// screen's plane, measured from the resting pose, so the same in portrait and on either side. Up and down is how much
// the screen faces the sky, from the resting pose. Browsers disagree on the sign of gravity (iOS gives it reversed):
// the resting pose fixes it, since a phone held to be looked at always has its screen facing up-ish.

const DEG = Math.PI / 180;

export function createTilt({ onLook, sensitivity = 1, onChange } = {}) {
  let on = false, last = 0, granted = false, armed = null, asking = false;
  const api = { sensitivity, invertY: false };
  // the stick's feel: dead zone, the tilt that gives the top speed, the top speed, the curve, the ramp while held
  const DEAD = 5 * DEG, FULL = 28 * DEG, TOP = 150 * DEG, CURVE = 1.7, RAMP = 0.9, RAMP_FROM = 0.35;
  let g = null, rest = null, held = 0, wantRest = true;

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function pose(v) {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    const x = v[0] / n, y = v[1] / n, z = v[2] / n;
    return { roll: Math.atan2(x, y), tilt: Math.asin(Math.max(-1, Math.min(1, z))), z };
  }
  const rate = (d) => {
    const a = Math.abs(d);
    if (a <= DEAD) return 0;
    const k = Math.min(1, (a - DEAD) / (FULL - DEAD));
    return Math.sign(d) * TOP * Math.pow(k, CURVE);
  };

  function handle(e) {
    const a = e.accelerationIncludingGravity;
    if (!on || !a || a.x == null) return;
    const now = e.timeStamp || performance.now();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : (e.interval > 1 ? e.interval / 1000 : e.interval) || 1 / 60;
    last = now;
    // a light smoothing of gravity: the hand's shake is not a tilt
    const v = [a.x || 0, a.y || 0, a.z || 0];
    g = g ? g.map((c, i) => c + (v[i] - c) * Math.min(1, dt * 12)) : v;
    if (wantRest) {
      const p = pose(g);
      rest = { roll: p.roll, tilt: p.tilt, sign: p.z < -0.15 ? -1 : 1 };   // gravity reversed (iOS): the screen faces "down" in its numbers
      wantRest = false; held = 0;
      return;
    }
    const s = rest.sign;
    const p = pose(g.map((c) => c * s));
    const dRoll = wrap(p.roll - (s < 0 ? wrap(rest.roll + Math.PI) : rest.roll));
    const dTilt = p.tilt - (s < 0 ? -rest.tilt : rest.tilt);
    let yawRate = rate(dRoll), pitchRate = -rate(dTilt);
    if (yawRate || pitchRate) held = Math.min(RAMP, held + dt); else held = 0;
    const ramp = RAMP_FROM + (1 - RAMP_FROM) * (held / RAMP);
    const k = api.sensitivity * ramp * dt;
    onLook?.(yawRate * k, pitchRate * k * (api.invertY ? -1 : 1));
  }
  const attach = () => { wantRest = true; g = null; if (!on) { on = true; last = 0; addEventListener('devicemotion', handle); } };
  const askFn = () => (typeof window !== 'undefined' && window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function'
    ? window.DeviceMotionEvent.requestPermission : null);
  function disarm() { if (armed) { removeEventListener('touchend', armed, true); removeEventListener('click', armed, true); armed = null; } }
  // the next real tap asks (inside the touchend/click itself, as iOS wants)
  function arm() {
    if (armed) return;
    armed = () => {
      disarm();
      if (granted) { attach(); onChange?.('on'); return; }
      let p;
      try { p = askFn().call(window.DeviceMotionEvent); } catch { onChange?.('denied'); return; }
      Promise.resolve(p).then((res) => {
        if (res === 'granted') { granted = true; attach(); onChange?.('on'); } else onChange?.('denied');
      }, () => arm());   // still outside a gesture (a synthetic tap): wait for the next one
    };
    addEventListener('touchend', armed, true); addEventListener('click', armed, true);
  }

  // (getters through defineProperties: Object.assign would copy their value once, and `on` would stay false)
  Object.defineProperties(api, {
    on: { get: () => on },
    pending: { get: () => Boolean(armed) },
    supported: { get: () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window },
  });
  Object.assign(api, {
    async enable() {
      if (!api.supported) return false;
      const ask = askFn();
      if (!ask || granted) { attach(); return true; }
      // the listener goes first: the finger that chose the option lifts right after (its touchend is a gesture)
      arm();
      if (asking) return 'pending';
      asking = true;
      try {
        const res = await ask.call(window.DeviceMotionEvent);
        asking = false;
        if (res === 'granted') { granted = true; disarm(); attach(); return true; }
        disarm(); return false;
      } catch { asking = false; return 'pending'; }   // not inside a gesture: the armed tap asks
    },
    /** The resting pose is the next one read (the game calls it when play resumes). */
    recenter() { wantRest = true; g = null; held = 0; },
    disable() { disarm(); if (on) { on = false; removeEventListener('devicemotion', handle); } },
    /** For a test: a motion event as the browser would send it. */
    feed: handle,
  });
  return api;
}
