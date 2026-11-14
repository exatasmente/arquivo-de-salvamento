// The apparitions at the corner of the eye (item 9): a dark figure that is there while nobody looks and is gone when it is looked at straight, or when the
// flashlight lands on it. It never comes closer and never makes a sound. It costs a little sanity the moment it is seen, once. A scene says where it may stand
// (`where`, which also checks the world: a lit place, a place with nobody in it), how it moves and how long it stays. "Reduce flashes" makes the vanishing a slow
// fade instead of a cut. Everything is a function of the player's state and the seed; nothing reads a real clock.
export function apparition(ctx, o) {
  const { kit, sanity, progression, bus, event } = ctx;
  const fig = kit.figure(o.tipo || 'sem-sombra', o.seed || 21);
  const sil = kit.silhouette(fig.root);
  let st = 'seek', t = 0, seen = 0, fade = 0, pos = null, mv = null;
  const eye = kit.v3();
  return {
    get info() { return { st, t, seen, fade, vis: fig.root.visible, pos: pos && pos.toArray() }; },
    update(dt) {
      t += dt;
      if (st === 'seek') {
        if (t > (o.seekFor ?? 16)) return true;
        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          const p = o.where();
          if (p) { pos = p; mv = typeof o.move === 'function' ? o.move(p) : o.move; fig.root.position.copy(p); kit.face(fig.root, ctx.player.eyePos()); fig.root.visible = true; st = 'show'; t = 0; }
        }
        return false;
      }
      eye.set(pos.x, 1.2, pos.z);
      if (st === 'show') {
        if (mv) { pos.x += mv[0] * dt; pos.z += mv[1] * dt; fig.root.position.copy(pos); fig.root.rotation.y = Math.atan2(mv[0], mv[1]); }
        fade = Math.min(o.alpha ?? 0.8, fade + dt * (o.fadeIn ?? 1.1)); sil.set(fade);
        const looked = kit.look(eye) > (o.cone ?? 0.9) && kit.dist(pos) < (o.maxDist ?? 16), flashed = kit.flashOn(eye);
        seen = looked || flashed ? seen + dt : Math.max(0, seen - dt);
        if (seen > (o.after ?? 0.3)) {
          st = 'gone'; t = 0;
          sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          if (!kit.soft()) { fig.root.visible = false; fade = 0; sil.set(0); }          // gone at once; with "reduce flashes", it fades below
          return false;
        }
        if (t > (o.ttl ?? 20)) st = 'gone';
        return false;
      }
      fade = Math.max(0, fade - dt * (kit.soft() ? 1.4 : 3)); sil.set(fade);
      if (fade <= 0) { fig.root.visible = false; return t > 0.6 || st === 'gone' && fade <= 0; }
      return false;
    },
    dispose() { kit.dispose(fig); },
  };
}
