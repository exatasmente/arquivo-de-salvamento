// "O espelho": in the bathroom the reflection lags half a second behind the player (mirror.js draws the body of
// Heitor, seen from the mirror, from the player's own recorded movement). It lasts while the player is there.
export function run({ mirror, kit, player, world, bus, sanity, progression, event, ui }) {
  let t = 0, seen = false, tSeen = 0, near = 0, id = null;
  mirror.setDelay(0.5);
  return {
    update(dt) {
      t += dt;
      id = mirror.nearest();
      const here = kit.area().startsWith('banheiro');
      if (id) near = mirror.facing(id);
      if (!seen && id && near > 0.7 && mirror.distTo(id) < 3.2) {
        tSeen += dt;
        if (tSeen > 1.2 && player.st.moving === false) tSeen = Math.max(0, tSeen - dt);   // it shows when you move
        if (tSeen > 1.0) { seen = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); ui.say('Heitor', '(O reflexo se mexeu depois de mim.)', { seed: 10, ms: 3600 }); bus.emit('sfx', 'passos_longe', { opts: { n: 1 } }); }
      }
      if (seen && !here) return true;
      return t > 60 && !seen ? true : (seen && t > 90);
    },
    dispose() { mirror.setDelay(0); },
  };
}
/** nobody is using the bathroom. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ customers }) => !customers.list.some((c) => c.kind === 'walk' && ['inside', 'route'].includes(c.state));
