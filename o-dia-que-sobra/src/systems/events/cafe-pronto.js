// "Café pronto": at 03:00 the coffee machine starts to run by itself, and on the counter there are two cups with
// the Sun that nobody put there. Seen up close it costs sanity; the cups are gone when the player is not looking.
export function run({ world, kit, bus, sanity, progression, event, ui, render, time }) {
  const a = world.anchor('copoBalcao1').pos, b = world.anchor('copoBalcao2').pos, caf = world.at('cafeteira', 1);
  const sc = world.posto.cups, caf1 = world.posto.props.cafeteira;
  const cups = [{ get visible() { return sc.count > 0; }, set visible(v) { sc.setCount(v ? 2 : 0); } }];
  let t = 0, seen = false, tSeen = 0, started = false;
  return {
    update(dt) {
      t += dt;
      if (!started) {
        // the machine begins when the player is in the shop (it is heard from there)
        if (kit.area() !== 'loja' && t < 40) return false;
        started = true; caf1?.setBrewing?.(true); bus.emit('sfx', 'cafe_sozinho', { pos: caf.toArray(), opts: { dur: 14 } });
        bus.emit('incident', 'barulho', { id: event.id });
        t = 0; return false;
      }
      if (t > 3 && !cups[0].visible && kit.look(a) < 0.6) cups[0].visible = true;   // they are there when you look back
      if (cups[0].visible && !seen && kit.dist(a) < 7 && kit.look(a) > 0.82) {
        seen = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
        ui.say('Heitor', '(Dois copos com o Sol. Ninguém pôs.)', { seed: 6, ms: 3600 });
      }
      if (seen) { tSeen += dt; if (tSeen > 30 && kit.look(a) < 0.3) return true; if (tSeen > 120) return true; }
      return t > 150 || time.minutes > 340;
    },
    dispose() { sc.setCount(0); caf1?.setBrewing?.(false); },
  };
}
/** the shop has power for the machine, and nobody is at the counter being served. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ world, customers }) => world.posto.breakers.isOn('loja') && !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing'].includes(c.state));
