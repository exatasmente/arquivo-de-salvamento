// TimeSystem: the game clock. One game hour lasts `secondsPerHour` real seconds (90). The clock
// starts at 00:00; it moves only when the simulation steps, never by the real clock.
export function createTime(bus, { secondsPerHour = 90 } = {}) {
  let minutes = 0, running = false, lastWhole = 0, cap = Infinity, capped = false;
  const fmt = (m) => { const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  const parse = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  function advanceTo(m) {
    minutes = Math.min(cap, m);
    while (lastWhole < Math.floor(minutes)) { lastWhole++; bus.emit('time:minute', lastWhole); if (lastWhole % 60 === 0) bus.emit('time:hour', lastWhole / 60); }
    if (minutes >= cap && !capped) { capped = true; bus.emit('time:cap', cap); }
  }
  return {
    get minutes() { return minutes; },
    get running() { return running; },
    secondsPerHour,
    start(from = 0) { minutes = from; lastWhole = Math.floor(from); running = true; capped = false; },
    /** The clock stops here (the end of the shift): it never goes past this minute, even after a pause. */
    setCap(m) { cap = m; capped = false; },
    pause() { running = false; }, resume() { running = true; },
    set(m) { minutes = m; lastWhole = Math.floor(m); },
    step(dt) {
      if (!running) return;
      advanceTo(minutes + dt * 60 / secondsPerHour);
    },
    /** The clock jumps ahead (the player passed out): every minute still ticks, so nothing that waits for a minute is missed. */
    skip(n) { advanceTo(minutes + n); },
    text: () => fmt(minutes), fmt, parse,
    /** Real seconds that a number of game minutes take. */
    realSeconds: (m) => m * secondsPerHour / 60,
  };
}
