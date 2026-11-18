// The camera over the shoulder, for the street (docs: "Câmera e ação variadas"): third person behind and a little above Jonas's right shoulder, the look
// free but limited (mouse or arrows, right stick, a drag on the right of the touch screen), the camera pushed in by buildings, the skip and the cars
// so it never goes through a wall, and, when he hides, close and low at the rim of the skip. The stick walks relative to the camera. Pure: no three.js.
//
//   const cam = createShoulder();
//   cam.step(dt, { look: { yaw, pitch }, moving, forward, body, hidden })   advances the look and the follow
//   cam.pose(pos, colliders, { hidden, eyeY }) -> { eye, at, dir, fov: null, aim, dist, near }   `pos` is [x, z]
// The yaw is the game's: the camera looks along (-sin yaw, -cos yaw) on the floor.
import { hits } from './player.js';

export const SHOULDER = { dist: 2.8, height: 1.62, lift: 0.55, side: 0.52, clearance: 0.3, lookLimit: 1.45, pitchMin: -0.32, pitchMax: 0.5, follow: 2.2, followSide: 0.9, recenter: 0.5, idle: 1.4,
  hide: { dist: 0.12, height: 1.22, ease: 7, limit: 1.0 }, near: 0.8, pitchBase: 0.12 };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createShoulder() {
  const c = { yaw: 0, pitch: 0, dist: SHOULDER.dist, hideK: 0, idle: 0, hideYaw: 0, wasHidden: false };
  return {
    get yaw() { return c.yaw; }, get pitch() { return c.pitch; }, get dist() { return c.dist; }, get hideK() { return c.hideK; },
    /** Puts the camera behind a body that faces `yaw` (a scene starting, a cut). */
    place(yaw) { c.yaw = yaw; c.pitch = 0; c.dist = SHOULDER.dist; c.hideK = 0; c.idle = 0; c.wasHidden = false; },
    step(dt, { look = { yaw: 0, pitch: 0 }, moving = false, forward = 0, body = c.yaw, hidden = false, invert = false } = {}) {
      const looked = Math.abs(look.yaw) + Math.abs(look.pitch) > 1e-5;
      if (hidden && !c.wasHidden) c.hideYaw = c.yaw;
      c.wasHidden = hidden;
      c.hideK += ((hidden ? 1 : 0) - c.hideK) * Math.min(1, dt * SHOULDER.hide.ease);
      c.yaw += look.yaw;
      c.pitch = clamp(c.pitch + look.pitch * (invert ? -1 : 1), SHOULDER.pitchMin, SHOULDER.pitchMax);
      if (hidden) c.yaw = c.hideYaw + clamp(wrap(c.yaw - c.hideYaw), -SHOULDER.hide.limit, SHOULDER.hide.limit);
      else if (looked) {
        // free, but limited around where Jonas faces (the camera is not let to go further than that by the person's hand; the follow may take it any way)
        const d = wrap(c.yaw - body);
        if (Math.abs(d) > SHOULDER.lookLimit && Math.abs(wrap(c.yaw - look.yaw - body)) <= SHOULDER.lookLimit) c.yaw = body + Math.sign(d) * SHOULDER.lookLimit;
      }
      c.idle = looked ? 0 : c.idle + dt;
      if (!hidden) {
        // behind him again: fast when he walks ahead, slower to the side or back, slowly when everything is still (and the person is not looking)
        const rate = moving ? (forward > 0.3 ? SHOULDER.follow : SHOULDER.followSide) : c.idle > SHOULDER.idle ? SHOULDER.recenter : 0;
        if (rate && !looked) c.yaw += wrap(body - c.yaw) * Math.min(1, dt * rate);
        if (!looked) c.pitch -= c.pitch * Math.min(1, dt * 1.5);
      }
    },
    /**
     * The camera for a person at `pos` ([x, z]): at the right shoulder, pulled in by the boxes of the floor. Hidden, it goes close and low to the rim.
     * `own`: a box the person is inside of (the skip) is not an obstacle for the camera.
     */
    pose(pos, colliders, { hidden = false, ground = 0 } = {}) {
      const a = c.yaw, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
      const k = c.hideK, H = SHOULDER.hide;
      const want = SHOULDER.dist + (H.dist - SHOULDER.dist) * k, side = SHOULDER.side * (1 - k);
      const py = ground + SHOULDER.height + (H.height - SHOULDER.height) * k;
      // walk back from his shoulder along the line to where the camera wants to be, until something is there
      const own = hidden || k > 0.2 ? colliders.filter((b) => !(pos[0] > b.min[0] && pos[0] < b.max[0] && pos[1] > b.min[1] && pos[1] < b.max[1])) : colliders;
      // hidden in a skip: the eye goes to the rim on the side it looks to, a little inside it, so the picture is the street over the edge
      let rim = 0;
      if (k > 0.01) {
        const box = colliders.find((b) => pos[0] > b.min[0] && pos[0] < b.max[0] && pos[1] > b.min[1] && pos[1] < b.max[1]);
        if (box) { const tx = fx > 1e-6 ? (box.max[0] - pos[0]) / fx : fx < -1e-6 ? (box.min[0] - pos[0]) / fx : Infinity, tz = fz > 1e-6 ? (box.max[1] - pos[1]) / fz : fz < -1e-6 ? (box.min[1] - pos[1]) / fz : Infinity; rim = Math.max(0, Math.min(tx, tz) - 0.12) * k; }
      }
      let ox = pos[0] + rx * side + fx * rim, oz = pos[1] + rz * side + fz * rim;
      if (hits(own, ox, oz, SHOULDER.clearance - 0.08)) { ox = pos[0]; oz = pos[1]; }         // the shoulder is in a wall: over the head instead
      let free = want;
      if (k < 0.9) { for (let d = 0.12; d <= want; d += 0.08) { const x = ox - fx * d, z = oz - fz * d; if (hits(own, x, z, SHOULDER.clearance)) { free = Math.max(0.05, d - 0.16); break; } } }
      // out: it comes back slowly, so the picture does not jump; in: at once (it never goes through the wall)
      if (free < c.dist) c.dist = free; else c.dist += (free - c.dist) * 0.12;
      const d = Math.min(c.dist, free);
      const eye = [ox - fx * d * Math.cos(c.pitch), py + SHOULDER.lift * (1 - k) + (Math.sin(SHOULDER.pitchBase) * 0.5 - Math.sin(c.pitch) * 0.7) * d * (1 - k), oz - fz * d * Math.cos(c.pitch)];
      // looks past him, a little to the left of the line of the shoulder, level with his chest, tilted by the look
      const tx = pos[0] + rx * side * 0.2 + fx * 6, tz = pos[1] + rz * side * 0.35 + fz * 6, ty = ground + 1.1 + c.pitch * 6 * (0.6 + 0.4 * (1 - k)) + k * 0.05;
      const dir = [tx - eye[0], ty - eye[1], tz - eye[2]];
      const m = Math.hypot(...dir) || 1; const n = [dir[0] / m, dir[1] / m, dir[2] / m];
      const near = d < SHOULDER.near && k < 0.5;
      return { eye, at: [eye[0] + n[0] * 4, eye[1] + n[1] * 4, eye[2] + n[2] * 4], dir: n, fov: null, aim: { pos: [pos[0], ground + 1.3, pos[1]], dir: n }, dist: d, near };
    },
  };
}
