// The person the player controls: where they are, where they look, how they move (walk, run, crouch) and the
// collision against the scene's `colliders` (boxes on the floor, `{ min: [x, z], max: [x, z] }`).
export const WALK = 2.6, RUN = 4.8, CROUCH = 1.35, RADIUS = 0.3;
export const EYE = 1.62, EYE_CROUCH = 1.05;

export const xz = (p) => (p.length === 2 ? [p[0], p[1]] : [p[0], p[2]]);

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
    /** The eye height now, easing between standing and crouched. */
    get eye() { return EYE + (EYE_CROUCH - EYE) * this.crouchK; },
    place(pos, yaw) { this.pos = xz(pos); if (yaw !== undefined) { this.yaw = yaw; this.body = yaw; } this.speed = 0; this.hidden = null; },
    /**
     * One step. `dir` is the yaw the stick is relative to (the look in first person, the plane in third). Returns the metres walked this step.
     */
    step(dt, { mx, mz }, dir, world, { run = false } = {}) {
      this.crouchK += ((this.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
      const m = Math.hypot(mx, mz);
      if (this.hidden) { this.speed = 0; this.moving = false; return 0; }
      if (m < 0.01) { this.speed = 0; this.moving = false; return 0; }
      const v = (this.crouch ? CROUCH : run ? RUN : WALK) * Math.min(1, m);
      const c = Math.cos(dir), s = Math.sin(dir), k = v * dt / Math.max(1, m);
      const dx = (mx * c + mz * s) * k, dz = (-mx * s + mz * c) * k;
      const cols = world.colliders ?? [], lim = world.limit;
      let [x, z] = this.pos;
      const nx = x + dx; if (!hits(cols, nx, z)) x = nx;
      const nz = z + dz; if (!hits(cols, x, nz)) z = nz;
      if (lim) { x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z)); }
      const walked = Math.hypot(x - this.pos[0], z - this.pos[1]);
      this.pos = [x, z];
      this.speed = walked / dt; this.moving = walked > 1e-4;
      // The body turns toward where it goes (smoothly); the look turns the camera, and in first person the body.
      if (this.moving) {
        const want = Math.atan2(-dx, -dz);
        let d = want - this.body; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.body += d * Math.min(1, dt * 12);
      }
      return walked;
    },
  };
}
