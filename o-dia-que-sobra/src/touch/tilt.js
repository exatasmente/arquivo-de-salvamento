// Aiming by moving the phone: the gyroscope's turn rate (devicemotion's rotationRate, degrees per second) becomes
// look deltas, the same as a finger dragging. Relative, so there is nothing to recentre: the view follows how much
// the phone turned, not where it points. Optional (an option of the game), off until switched on.
//
//   const t = createTilt({ onLook(dyaw, dpitch), sensitivity, onChange(state) })   radians, the signs of the game's look (yaw left +, pitch up +)
//   await t.enable()   → true when the sensor is on, 'pending' when the phone asks first and the asking waits for a tap
//                        (iOS: requestPermission only works inside a touchend or a click, never a pointerdown nor a frame;
//                        so a one-shot listener for the next touchend/click asks there), false when there is no sensor
//                        or it was refused. onChange('on' | 'denied') says how a pending ask ended.
//   t.disable() · t.on · t.supported · t.sensitivity = 1.5 · t.invertY = true
//
// rotationRate is given in the phone's own axes (x across the screen, y up the screen, z out of it); the screen's
// rotation (portrait, landscape left or right) says which of them is the turn left/right and which the tilt up/down.

const DEG = Math.PI / 180;

export function createTilt({ onLook, sensitivity = 1, onChange } = {}) {
  let on = false, last = 0, granted = false, armed = null, asking = false;
  const api = { sensitivity, invertY: false };
  const angle = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : (typeof window !== 'undefined' && window.orientation) || 0) || 0;

  function handle(e) {
    const r = e.rotationRate;
    if (!on || !r) return;
    const now = e.timeStamp || performance.now();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : (e.interval > 1 ? e.interval / 1000 : e.interval) || 1 / 60;
    last = now;
    const a = ((angle() % 360) + 360) % 360;
    // the turn around the screen's vertical axis is yaw; around its horizontal axis, pitch
    const bx = r.beta || 0, gy = r.gamma || 0; // beta: around x (across), gamma: around y (up the screen)
    let yawRate, pitchRate;
    if (a === 90) { yawRate = -bx; pitchRate = gy; }
    else if (a === 270) { yawRate = bx; pitchRate = -gy; }
    else if (a === 180) { yawRate = -gy; pitchRate = -bx; }
    else { yawRate = gy; pitchRate = bx; }
    const k = api.sensitivity * DEG * dt;
    // tiny rates are the hand's tremor, not a turn
    const dead = (v) => (Math.abs(v) < 1.2 ? 0 : v);
    onLook?.(dead(yawRate) * k, dead(pitchRate) * k * (api.invertY ? -1 : 1));
  }
  const attach = () => { if (!on) { on = true; last = 0; addEventListener('devicemotion', handle); } };
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
    disable() { disarm(); if (on) { on = false; removeEventListener('devicemotion', handle); } },
    /** For a test: a motion event as the browser would send it. */
    feed: handle,
  });
  return api;
}
