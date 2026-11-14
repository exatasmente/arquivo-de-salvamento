// "O adesivo novo" (week 2, night 7): a Sun sticker on the stock room door that was not there yesterday, and the face in the reflection of
// the fridge. It goes on while the player is not looking; when it is seen it costs a little sanity. It stays on the wall from then on.
export function run({ world, kit, bus, sanity, progression, event, ui }) {
  const stk = world.posto.stickers;
  const door = world.anchor('porta-estoque') ? world.anchor('porta-estoque').pos.clone().setY(1.4) : kit.v3(13, 1.4, 12);
  let st = 'wait', t = 0, away = 0, gaze = 0;
  return {
    update(dt) {
      t += dt;
      if (!stk) return true;
      if (st === 'wait') {
        if (kit.look(door) < 0.4 || kit.dist(door) > 14) away += dt; else away = 0;
        if (away > 1.5 || t > 90) { stk.show('porta-estoque', true); stk.show('geladeira1', true); progression.flag('adesivo:porta-estoque'); progression.flag('adesivo:geladeira1'); st = 'on'; t = 0; }
        return false;
      }
      if (kit.look(door) > 0.82 && kit.dist(door) < 9) gaze += dt; else gaze = Math.max(0, gaze - dt);
      if (gaze > 0.8) { sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); ui.say('Heitor', '(Um adesivo do Sol na porta. Ontem não tinha.)', { seed: 14, ms: 3400 }); return true; }
      return t > 150;
    },
  };
}
/** the stock room's door is shut (an open one shows what is behind it, not a sticker). Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ world }) => Boolean(world.posto.stickers) && !world.doorOpen('porta-estoque');
