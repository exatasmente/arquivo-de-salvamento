// The cameras (docs: "Câmera"): the picture is cinema, so most of the time a FIXED plane of the scene (systems/shots.js) with Jonas walking
// in third person inside it; to examine something the camera goes to the eyes (first person, a limited look around). The change is a cut.
// The third person that follows Jonas stays for the street, later.
import { EYE } from './player.js';

export const MODES = ['shot', 'examine', 'third'];

const norm = (v) => { const m = Math.hypot(...v) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const rotate = (dir, yaw, pitch) => {
  // dir: unit [x, y, z]; yaw turns around the vertical, pitch tilts it
  const a = Math.atan2(-dir[0], -dir[2]) + yaw, p = Math.max(-1.2, Math.min(1.2, Math.asin(dir[1]) + pitch)), c = Math.cos(p);
  return [-Math.sin(a) * c, Math.sin(p), -Math.cos(a) * c];
};

export const LOOK = { shot: { yaw: 0.2, pitch: 0.12 }, examine: { yaw: 0.6, pitch: 0.42 } };

/**
 * The camera for a shot: { eye, at, dir, aim } and `peek`, a small nudge of the look inside the plane (mouse, arrows, right stick or drag).
 * `aim` is where the flashlight starts and points: from Jonas.
 */
export function shotCamera(shot, peek = { yaw: 0, pitch: 0 }, p = null) {
  const eye = shot.eye, d0 = norm([shot.at[0] - eye[0], shot.at[1] - eye[1], shot.at[2] - eye[2]]);
  const dir = rotate(d0, peek.yaw, peek.pitch), at = [eye[0] + dir[0] * 4, eye[1] + dir[1] * 4, eye[2] + dir[2] * 4];
  return { eye, at, dir, fov: shot.fov ?? null, aim: p ? bodyAim(p) : { pos: eye, dir } };
}
/** Where the eyes are when examining: the point's own view, the look free inside a limited arc. */
export function examineCamera(view, look = { yaw: 0, pitch: 0 }) {
  const eye = view.eye, d0 = norm([view.at[0] - eye[0], view.at[1] - eye[1], view.at[2] - eye[2]]);
  const dir = rotate(d0, look.yaw, look.pitch);
  return { eye, at: [eye[0] + dir[0] * 3, eye[1] + dir[1] * 3, eye[2] + dir[2] * 3], dir, fov: view.fov ?? null, aim: { pos: eye, dir } };
}
/**
 * The plane is fixed, but its look-at pans a little to keep Jonas in the picture: how much yaw to add so that a person at `pos` ([x, z]) is not past
 * a part of the half of the horizontal field of view (a narrow phone screen needs it far more than a wide one).
 */
export function followOffset(shot, pos, aspect, fovDeg, keep = 0.5) {
  const base = Math.atan2(-(shot.at[0] - shot.eye[0]), -(shot.at[2] - shot.eye[2]));
  const to = Math.atan2(-(pos[0] - shot.eye[0]), -(pos[1] - shot.eye[2]));
  const half = Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect), allowed = half * keep;
  let d = to - base; d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.abs(d) <= allowed ? 0 : d - Math.sign(d) * allowed;
}
/** The flashlight of a person standing at p: from the chest, along the body. */
export function bodyAim(p) { return { pos: [p.pos[0], p.eye - 0.3, p.pos[1]], dir: norm([-Math.sin(p.body), -0.06, -Math.cos(p.body)]) }; }
export { EYE };
