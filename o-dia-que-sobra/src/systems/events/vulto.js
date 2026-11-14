// "O vulto": a dark, thin figure stands at the edge of what the player sees, a few metres away, and is gone the
// moment the player turns to it. It costs a little sanity and nothing else: the one thing it shows is that
// the corner of the eye is not to be trusted. It never moves, never makes a sound, and does not come twice in a row.
export function run({ kit, player, sanity, bus, progression, event, rng }) {
  const fig = kit.figure('frentista-antigo', 31);
  const sil = kit.silhouette(fig.root);
  let st = 'seek', t = 0, seen = 0, pos = null, fade = 0;
  return {
    get info() { return { st, t, seen, fade, vis: fig.root.visible, pos: pos && pos.toArray() }; },
    update(dt) {
      t += dt;
      if (st === 'seek') {
        if (t > 14) return true;
        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          pos = kit.peripheral(rng, { min: 5, max: 10 });
          if (pos) { fig.root.position.copy(pos); kit.face(fig.root, player.eyePos()); fig.root.visible = true; st = 'show'; t = 0; }
        }
        return false;
      }
      if (st === 'show') {
        fade = Math.min(0.82, fade + dt * 1.1); sil.set(fade);
        const { ang, dist } = kit.bearing(pos), E = kit.edge();
        const inFrame = Math.abs(ang) < E * 0.97;
        if (inFrame) seen += dt;
        // the player turns toward it: it is gone before it can be looked at
        if (seen > 0.35 && Math.abs(ang) < E * 0.5 && dist < 14) {
          st = 'gone'; t = 0; fig.root.visible = false;
          sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          return false;
        }
        if (t > 8) st = 'gone2';
        return false;
      }
      if (st === 'gone2') { fade = Math.max(0, fade - dt * 0.8); sil.set(fade); if (fade <= 0) { fig.root.visible = false; return true; } return false; }
      return t > 0.6;
    },
    dispose() { kit.dispose(fig); },
  };
}
/** the player is not hidden (a hiding place has no corner of the eye). Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ entity }) => entity.hidden === null;
