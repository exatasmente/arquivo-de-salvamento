// R9, nights 18 to 24, for who kept the photograph: it is somewhere else every night (the counter, the coffee bench, the office desk, the floor by the door),
// laid down while the player is not looking. Seen up close it costs a little sanity, once a night. It is a prop (`branches.keep`), so a saved night brings it back in its place.
import { makeThing, examinable, unseen } from './common.js';

const SPOTS = [[14.9, 1.0, 8.55], [15.5, 1.0, 4.35], [5.5, 0.77, 18.45], [9.5, 0.0, 3.7]];
const LINES = ['(A foto. Eu a deixei guardada. Hoje está aqui.)', '(Ninguém entrou aqui sem eu ver. E ela se mexeu de novo.)'];
const spotOf = (day) => SPOTS[(Math.max(18, day) - 18) % SPOTS.length];

function photoProp(ctx, spot, seenAlready) {
  const { render, ui, sanity, bus } = ctx;
  const ph = makeThing(render, 'foto');
  ph.position.set(spot[0], spot[1], spot[2]); ph.rotation.y = 0.5;
  const at = new render.THREE.Vector3(spot[0], spot[1] + 0.06, spot[2]);
  let seen = seenAlready, tid = null, shown = false, t = 0;
  tid = examinable(ctx, 'foto-r9', at, {
    text: 'Ver a foto', r: 0.22, reach: 2.6, enabled: () => shown,
    tap: async () => {
      if (seen) { ui.say('Heitor', '(Continua aqui. Parada.)', { seed: 17, ms: 2600 }); return; }
      seen = true; bus.emit('sfx', 'papel_folha', {});
      await ui.dialogue('Heitor', LINES, 17, { self: true });
      sanity.add(-2, 'r9-foto');
    },
  });
  return { data: { spot, get seen() { return seen; } }, update(dt) { t += dt; if (!shown && (seenAlready || unseen(ctx.kit, at, t))) { shown = true; ph.visible = true; } return false; }, dispose() { if (tid) ctx.interaction.unregister(tid); render.scene.remove(ph); } };
}
export function restoreProp(ctx, data) { return data?.spot ? photoProp(ctx, data.spot, Boolean(data.seen)) : null; }
export const can = ({ customers }) => !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing'].includes(c.state));
export function run(ctx) {
  const spot = spotOf(ctx.progression.st.day);
  ctx.branches.keep(photoProp(ctx, spot, false), 'branches/r9-foto.js');
  ctx.branches.event('r9', 'foto');
  return { update: () => true };
}
