// "O Sol por dentro" (week 3, night 13): the Sun is inside the shop now. Two cups with the Sun on the counter and, on the monitor's frame
// in the office, a Sun sticker. Nobody put them there. The sticker stays; the cups go when nobody looks.
export function run({ world, kit, bus, sanity, progression, event, ui, time, rng }) {
  const stk = world.posto.stickers, sc = world.posto.cups, a = world.anchor('copoBalcao1')?.pos || kit.v3(12, 1, 8);
  let st = 'wait', t = 0, away = 0, gaze = 0, jingleAt = 0;
  return {
    update(dt) {
      t += dt;
      if (jingleAt > 0 && (jingleAt -= dt) <= 0) bus.emit('sfx', 'sol_jingle', { pos: a.toArray() });   // a second or two after the sticker
      if (st === 'wait') {
        if (kit.area() === 'loja' && kit.look(a) < 0.5) away += dt; else away = 0;
        if (away > 1.5 || t > 100) { sc?.setCount(2); stk?.show('monitor', true); progression.flag('adesivo:monitor'); st = 'on'; t = 0; bus.emit('sfx', 'cafe_sozinho', { pos: a.toArray(), opts: { dur: 3 } }); bus.emit('sfx', 'adesivo_cola', { pos: a.toArray() }); jingleAt = 1 + Math.floor(rng() * 2) + rng(); }
        return false;
      }
      if (kit.look(a) > 0.82 && kit.dist(a) < 8) gaze += dt; else gaze = Math.max(0, gaze - dt);
      if (gaze > 0.8 && !st.seen) { st = { seen: true }; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); ui.say('Heitor', '(Copos com o Sol. Agora aqui dentro.)', { seed: 15, ms: 3400 }); t = 0; }
      if (st.seen && (t > 25 && kit.look(a) < 0.3 || t > 90)) return true;
      return time.minutes > 340;
    },
    dispose() { world.posto.cups?.setCount(0); },
  };
}
/** the shop is lit and nobody is at the counter. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ world, customers }) => world.posto.breakers.isOn('loja') && !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing'].includes(c.state));
