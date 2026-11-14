// "Você na câmera": the camera of the store room (cam4) shows you in there, now, while you are in the office. It is a figure of you
// (models/human.js, dressed as Heitor) that repeats a stretch of your own recorded path in the store room (or, if you were never in
// there tonight, a walk along the shelves). It is drawn only in the camera's render. After it has been seen it stops, turns to the
// camera for a moment and the picture drops. Needs the CameraSystem (`cameras`) and the player in the office.
const ABANDON = 140, TURN_AFTER = 10, TURN_FOR = 4;   // real seconds

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** A walk along the store room's shelves, as a recorded path would be: [{ t, x, z, yaw, d, moving, crouch }]. */
function walk(points, speed) {
  const out = []; let t = 0, d = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[i + 1];
    if (!q) { out.push({ t, x: p[0], z: p[1], yaw: out.length ? out[out.length - 1].yaw : 0, d, moving: false, crouch: false }); break; }
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), yaw = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])), steps = Math.max(1, Math.round(len / speed / 0.1));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      out.push({ t: t + (len / speed) * f, x: p[0] + (q[0] - p[0]) * f, z: p[1] + (q[1] - p[1]) * f, yaw, d: d + len * f, moving: true, crouch: false });
    }
    t += len / speed; d += len;
  }
  return out;
}
const SHELF_WALK = [[13.0, 12.7], [13.0, 14.6], [11.6, 16.2], [11.6, 18.3], [14.4, 18.3], [14.4, 15.6], [13.0, 14.2], [13.0, 12.7]];

export function run({ cameras, kit, world, bus, sanity, progression, event, ui, forced }) {
  if (!cameras || (!forced && kit.area() !== 'escritorio')) return { update: () => true };
  const path = cameras.segment({ area: 'estoque', min: 5, max: 14 }) || walk(SHELF_WALK, 1.35);
  let ghost = cameras.ghost('cam4', { kind: 'voce', path, loop: true });
  cameras.fail('cam4', { kind: 'chiado', secs: 0.9, level: 0.5 });
  let st = 'play', t = 0, tSeen = 0, watch = 0, seen = false, turned = 0, end = false;
  const camPos = world.anchor('cam4').pos;
  return {
    get info() { return { st, seen }; },
    update(dt) {
      t += dt;
      if (end) return true;
      if (kit.area() === 'estoque' && !forced) { ghost?.remove(); ghost = null; return true; }   // you are not in there: it goes
      if (st === 'play') {
        if (cameras.watchingCam('cam4')) watch += dt; else watch = Math.max(0, watch - dt * 0.5);
        if (!seen && watch > 2) {
          seen = true; tSeen = t;
          sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          bus.emit('incident', 'cliente-suspeito', { id: event.id });
          ui.say('Heitor', '(Sou eu. No estoque. E estou aqui.)', { seed: 13, ms: 3600 });
        }
        if ((seen && t - tSeen > TURN_AFTER) || t > ABANDON) {
          // it stops where it is, and turns to the camera
          const at = ghost.root.position;
          ghost.remove();
          ghost = cameras.ghost('cam4', { kind: 'voce', x: at.x, z: at.z, yaw: wrap(Math.atan2(-(camPos.x - at.x), -(camPos.z - at.z))) });
          st = 'turn'; turned = 0;
          if (!seen) { end = true; ghost.remove(); ghost = null; }
        }
        return false;
      }
      turned += dt;
      if (turned > TURN_FOR) { ghost?.remove(); ghost = null; cameras.fail('cam4', { kind: 'queda', secs: 2.2 }); end = true; }
      return end;
    },
    dispose() { ghost?.remove(); },
  };
}
/** the stock room has power, so its camera shows something. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ world, cameras }) => Boolean(cameras) && world.posto.breakers.isOn('estoque');
