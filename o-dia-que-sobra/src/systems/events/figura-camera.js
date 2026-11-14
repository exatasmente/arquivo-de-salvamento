// "A figura na câmera": on the store camera (cam1) somebody in an old attendant's uniform stands behind the counter, still. It is
// drawn only in the camera's render. When the player goes back to the store it is there, behind the counter, for real; when the
// player looks away, nobody. Needs the CameraSystem (`cameras`); without it, or with the player already in the store, it does not run.
const SPOT = [12.4, 9.6], YAW = Math.PI;           // behind the counter, facing the shop
const ABANDON = 150, AFTER_SEEN = 70;              // real seconds

export function run({ cameras, kit, world, bus, sanity, progression, event, ui, forced }) {
  if (!cameras || (!forced && kit.area() === 'loja')) return { update: () => true };
  const eye = kit.v3(SPOT[0], 1.35, SPOT[1]);
  let ghost = cameras.ghost('cam1', { kind: 'figura', x: SPOT[0], z: SPOT[1], yaw: YAW, pose: 'fixo', seed: 12 });
  let fig = null, shopT = 0, seen = false, t = 0, tSeen = 0, watch = 0, gazed = 0, away = 0, st = 'cam';
  cameras.fail('cam1', { kind: 'chiado', secs: 1.1, level: 0.55 });   // it shows up with a hiccup of the signal
  const sighted = (line) => {
    if (seen) return; seen = true; tSeen = t;
    sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
    bus.emit('incident', 'cliente-suspeito', { id: event.id });
    ui.say('Heitor', line, { seed: 12, ms: 3400 });
  };
  const gone = () => { ghost?.remove(); ghost = null; if (fig) fig.root.visible = false; cameras.fail('cam1', { kind: 'queda', secs: 1.6 }); st = 'end'; };
  return {
    get info() { return { st, seen, real: Boolean(fig?.root.visible) }; },
    update(dt) {
      t += dt;
      if (st === 'cam') {
        if (ghost && cameras.watchingCam('cam1')) watch += dt; else watch = Math.max(0, watch - dt * 0.5);
        if (!seen && watch > 1.6) sighted('(Na câmera da loja. Atrás do balcão.)');
        // the player is back in the store: it stands there, placed while the player is not looking at the spot
        if (kit.area() === 'loja' && (kit.look(eye) < 0.55 || kit.dist(eye) > 13)) {
          fig = kit.figure('frentista-antigo', 12);
          fig.root.position.set(SPOT[0], 0, SPOT[1]); fig.root.rotation.y = YAW; fig.root.visible = true; fig.setPose('fixo', 0);
          ghost?.remove(); ghost = null; st = 'shop'; t = Math.min(t, 100); gazed = 0; away = 0;
        } else if (t > ABANDON || (seen && t - tSeen > AFTER_SEEN)) gone();
        return st === 'end';
      }
      if (st === 'shop') {
        shopT += dt;
        if (kit.look(eye) > 0.86 && kit.dist(eye) < 20) { gazed += dt; away = 0; if (gazed > 0.9) sighted('(Atrás do balcão. Parado.)'); }
        else if (gazed > 0.9 && kit.look(eye) < 0.4) { away += dt; if (away > 0.8) { fig.root.visible = false; st = 'end'; } }   // it goes when you look away from it, not before you have looked
        if (shopT > 60) { fig.root.visible = false; st = 'end'; }
        return st === 'end';
      }
      return true;
    },
    dispose() { ghost?.remove(); if (fig) kit.dispose(fig); },
  };
}
/** the shop's lights are on, so the camera has a picture to put the figure in. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ world, cameras }) => Boolean(cameras) && world.posto.breakers.isOn('loja');
