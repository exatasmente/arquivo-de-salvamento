// R2, week 4 (night 20), for whoever sent the street dweller away: on the car park camera somebody is lying on the pavement where he used to sleep.
// When it has been looked at on the monitor, or when the player goes there, nobody. (`sol` + 1, a little sanity.)
import { sleepSpot } from './common.js';

export const can = ({ cameras, world, render }) => Boolean(cameras) && Boolean(sleepSpot(world, render.THREE));
export function run({ cameras, world, render, ui, sanity, bus, branches, kit }) {
  const sp = sleepSpot(world, render.THREE);
  const ghost = cameras.ghost('cam6', { kind: 'figura', tipo: 'morador-de-rua', x: sp.x, z: sp.z, yaw: Math.atan2(sp.face[0] - sp.x, sp.face[1] - sp.z) + Math.PI, pose: 'fixo', seed: 88 });
  if (ghost) { ghost.root.rotation.order = 'YXZ'; ghost.root.rotation.x = -Math.PI / 2; }
  const spot = kit.v3(sp.x, 0.4, sp.z);
  let t = 0, watch = 0, seen = false, gone = 0;
  return {
    update(dt) {
      t += dt;
      if (!ghost) return true;
      ghost.root.rotation.x = -Math.PI / 2;
      if (!seen) {
        if (cameras.watchingCam('cam6')) watch += dt; else watch = Math.max(0, watch - dt * 0.5);
        if (watch > 1.8 || (kit.dist(spot) < 5 && kit.look(spot) > 0.7)) {
          seen = true; sanity.add(-4, 'r2-camera'); bus.emit('event:seen', 'r2-camera');
          cameras.fail('cam6', { kind: 'queda', secs: 1.6 });
          ui.say('Heitor', '(Alguém deitado na calçada. ... Não tem ninguém.)', { seed: 61, ms: 3600 });
          ghost.remove(); gone = 1; branches.event('r2', 'camera');
        }
      }
      return gone === 1 || t > 140;
    },
    dispose() { ghost?.remove(); },
  };
}
