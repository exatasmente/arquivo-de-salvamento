// The person the player controls: where they are, where they look, how they move (walk, run, crouch) and the
// collision against the scene's `colliders` (boxes on the floor, `{ min: [x, z], max: [x, z] }`).
//
// He moves the way a body can (2026-11-19: with the speed and the heading set at once his feet slid): he goes where his body faces, the
// body turns toward the stick at a rate, the speed comes up and goes down (ACCEL, DECEL), and from standing, asked to go more than
// TURN_MIN off the way he faces, he first turns on the spot (systems/turn.js), unless he is told to run. The speeds are those his clips
// are made for (tools/models/jonas_gait.py has the same numbers): the stick all the way is a brisk walk.
import { turnTime, turnEase, TURN_MIN } from './turn.js';

export const WALK = 1.55, RUN = 4.8, CROUCH = 1.0, RADIUS = 0.3;
export const EYE = 1.62, EYE_CROUCH = 1.05;
/** How fast his speed comes up and goes down (m/s2), walking and running; how fast he turns as he goes (rad/s: at most, running, at least), and the tightest curve he walks (m). */
export const ACCEL = 5, DECEL = 3.75, ACCEL_RUN = 9, DECEL_RUN = 9, TURN_RATE = 7.5, TURN_RATE_RUN = 5.5, TURN_SLOW = 3, TURN_RADIUS = 0.3;
const SETTLE = 0.9;                // seconds after he has stopped during which he is still settling on his feet

export const xz = (p) => (p.length === 2 ? [p[0], p[1]] : [p[0], p[2]]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Whether a circle at (x, z) touches a collider. */
export function hits(colliders, x, z, rad = RADIUS) {
  for (const c of colliders) {
    if (x > c.min[0] - rad && x < c.max[0] + rad && z > c.min[1] - rad && z < c.max[1] + rad) return true;
  }
  return false;
}

export function createPlayer() {
  return {
    pos: [0, 0], yaw: 0, pitch: 0, body: 0,
    crouch: false, run: false, crouchK: 0, speed: 0, moving: false, light: true, hidden: null,
    /** The speed he is making for (m/s), before walls. */
    v: 0,
    /** A turn on the spot under way: { a (radians, + to his left), k (0..1 of its time), from, t, T }, or null. */
    turn: null,
    /** His stopping: { t (seconds since he began to), T (seconds until he stands) }, or null. */
    stop: null,
    /** Metres he has gone since he set off from standing. */
    gone: 0,
    /** The eye height now, easing between standing and crouched. */
    get eye() { return EYE + (EYE_CROUCH - EYE) * this.crouchK; },
    place(pos, yaw) { this.pos = xz(pos); if (yaw !== undefined) { this.yaw = yaw; this.body = yaw; } this.speed = 0; this.v = 0; this.turn = null; this.stop = null; this.gone = 0; this.hidden = null; },
    /** What his body is doing, for the model (models/jonas.js update): { turn, stop, from }. */
    get gait() { return { turn: this.turn ? { a: this.turn.a, k: this.turn.k } : null, stop: this.stop ? { t: this.stop.t, T: this.stop.T } : null, from: this.gone }; },
    /**
     * One step. `dir` is the yaw the stick is relative to (the look in first person, the plane in third). Returns the metres walked this step.
     */
    step(dt, { mx, mz }, dir, world, { run = false } = {}) {
      this.crouchK += ((this.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
      const m = Math.hypot(mx, mz), want = m >= 0.01 && !this.hidden;
      if (this.hidden) { this.speed = 0; this.v = 0; this.moving = false; this.turn = null; this.stop = null; this.gone = 0; return 0; }
      const c = Math.cos(dir), s = Math.sin(dir);
      const wantYaw = want ? Math.atan2(-(mx * c + mz * s), -(-mx * s + mz * c)) : this.body;
      // a turn on the spot runs to its end
      if (this.turn) {
        const T = this.turn;
        T.t += dt; T.k = Math.min(1, T.t / T.T);
        this.body = T.from + T.a * turnEase(T.k);
        if (T.k >= 1) { this.body = wrap(this.body); this.turn = null; }
        this.speed = 0; this.moving = false;
        return 0;
      }
      const running = run && !this.crouch, off = wrap(wantYaw - this.body);
      if (want && this.v < 0.05 && Math.abs(off) > TURN_MIN && !running) {
        this.turn = { a: off, k: 0, from: this.body, t: 0, T: turnTime(off) }; this.stop = null; this.gone = 0;
        this.speed = 0; this.moving = false;
        return 0;
      }
      const top = (this.crouch ? CROUCH : running ? RUN : WALK) * Math.min(1, m), fast = this.v > WALK + 0.3;
      if (want) {
        // (he turns no tighter than his feet can follow: a body spun over a planted foot drags it)
        const rate = (fast ? TURN_RATE_RUN : Math.max(TURN_SLOW, Math.min(TURN_RATE, this.v / TURN_RADIUS))) * dt;
        this.body = wrap(this.body + Math.max(-rate, Math.min(rate, off)));
        if (this.v < 0.05) this.gone = 0;
        this.stop = null;
        this.v = this.v < top ? Math.min(top, this.v + (running ? ACCEL_RUN : ACCEL) * dt) : Math.max(top, this.v - (fast ? DECEL_RUN : DECEL) * dt);
      } else if (this.v > 0) {
        if (!this.stop) this.stop = { t: 0, T: this.v / (fast ? DECEL_RUN : DECEL) }; else this.stop.t += dt;
        this.v = Math.max(0, this.v - (fast ? DECEL_RUN : DECEL) * dt);
      } else if (this.stop) { this.stop.t += dt; if (this.stop.t > this.stop.T + SETTLE) this.stop = null; }
      if (!(this.v > 0)) { this.speed = 0; this.moving = false; return 0; }
      const k = this.v * dt, dx = -Math.sin(this.body) * k, dz = -Math.cos(this.body) * k;
      const cols = world.colliders ?? [], lim = world.limit;
      let [x, z] = this.pos;
      const nx = x + dx; if (!hits(cols, nx, z)) x = nx;
      const nz = z + dz; if (!hits(cols, x, nz)) z = nz;
      if (lim) { x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z)); }
      const walked = Math.hypot(x - this.pos[0], z - this.pos[1]);
      this.pos = [x, z];
      this.speed = walked / dt; this.moving = walked > 1e-4;
      this.gone += walked;
      if (walked < 0.5 * k) this.v = Math.min(this.v, Math.max(walked / dt, 0.6));       // against a wall: he does not build up speed into it
      return walked;
    },
  };
}
