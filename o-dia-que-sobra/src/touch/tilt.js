// Aiming by moving the phone: the gyroscope's turn rate (devicemotion's rotationRate, degrees per second) becomes
// look deltas, the same as a finger dragging. Relative, so there is nothing to recentre: the view follows how much
// the phone turned, not where it points. Optional (an option of the game), off until switched on.
//
//   const t = createTilt({ onLook(dyaw, dpitch), sensitivity })   radians, the signs of the game's look (yaw left +, pitch up +)
//   await t.enable()   → true when the browser gives the sensor (iOS asks, and only inside a tap)
//   t.disable() · t.on · t.supported · t.sensitivity = 1.5 · t.invertY = true
//
// rotationRate is given in the phone's own axes (x across the screen, y up the screen, z out of it); the screen's
// rotation (portrait, landscape left or right) says which of them is the turn left/right and which the tilt up/down.

const DEG = Math.PI / 180;

export function createTilt({ onLook, sensitivity = 1 } = {}) {
  let on = false, last = 0;
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

  Object.assign(api, {
    get on() { return on; },
    get supported() { return typeof window !== 'undefined' && 'DeviceMotionEvent' in window; },
    async enable() {
      if (!api.supported) return false;
      try {
        const ask = window.DeviceMotionEvent.requestPermission;
        if (typeof ask === 'function' && (await ask.call(window.DeviceMotionEvent)) !== 'granted') return false;
      } catch { return false; }
      if (!on) { on = true; last = 0; addEventListener('devicemotion', handle); }
      return true;
    },
    disable() { if (on) { on = false; removeEventListener('devicemotion', handle); } },
    /** For a test: a motion event as the browser would send it. */
    feed: handle,
  });
  return api;
}
