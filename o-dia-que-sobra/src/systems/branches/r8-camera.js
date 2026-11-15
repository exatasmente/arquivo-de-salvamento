// R8, night 21, for who took the jug: on the car park camera (cam 6) the lorry of the driver who stopped coming, parked with nobody in it. It is drawn only in the
// camera's render; when it has been looked at on the monitor, or when the player goes to the stall, it is not there. (`sol` + 1, a little sanity.)
const SPOT = [-6.4, 10];   // the east side of the car park, in front of the camera
export const can = ({ cameras }) => Boolean(cameras);
export function run({ cameras, ui, sanity, bus, branches, kit, world }) {
  const a = world.anchor('vaga3') || world.anchor('vaga4');
  const x = a ? a.pos.x : SPOT[0], z = a ? a.pos.z : SPOT[1];
  const ghost = cameras.ghost('cam6', { kind: 'carro', x, z, yaw: a ? Math.atan2(a.dir.x, a.dir.z) : -Math.PI / 2, seed: 8008, car: { style: 'caminhao', color: '#8a8e8a', fuel: 'diesel' } });
  const spot = kit.v3(x, 1.2, z);
  let t = 0, watch = 0, seen = false;
  return {
    update(dt) {
      t += dt;
      if (!ghost) return true;
      if (!seen) {
        if (cameras.watchingCam('cam6')) watch += dt; else watch = Math.max(0, watch - dt * 0.5);
        if (watch > 1.8 || (kit.dist(spot) < 9 && kit.look(spot) > 0.7)) {
          seen = true; sanity.add(-3, 'r8-camera'); bus.emit('event:seen', 'r8-camera');
          cameras.fail('cam6', { kind: 'queda', secs: 1.4 });
          ui.say('Heitor', '(O caminhão do galão, parado no estacionamento. Sem ninguém na boleia. ... Não tem caminhão nenhum.)', { seed: 61, ms: 4400 });
          ghost.remove(); branches.event('r8', 'camera');
        }
      }
      return seen || t > 140;
    },
    dispose() { ghost?.remove(); },
  };
}
