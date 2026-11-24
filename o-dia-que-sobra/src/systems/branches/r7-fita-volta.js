// R7, nights 13 to 23, for who kept the tape in the drawer: on the monitor again, alone, rewound. It is laid there while the player is not looking at the monitor.
// Looked at, it costs a little (once a night); it stays on the monitor all night (a prop: `branches.keep`, so a saved night brings it back).
import { makeThing, examinable, unseen } from './common.js';
import { TAPE_AT } from './r7-fita.js';

const AT = [14.72, 1.345, 8.55];   // on top of the monitor (the small tube at the counter)
function tapeProp(ctx, seenAlready) {
  const { render, ui, sanity, bus, kit } = ctx;
  const tape = makeThing(render, 'fita');
  tape.position.set(AT[0], AT[1], AT[2]); tape.rotation.y = -0.2;
  const at = kit.v3(AT[0], AT[1] + 0.05, AT[2]);
  let seen = seenAlready, tid = null, shown = false, t = 0;
  tid = examinable(ctx, 'fita-volta-r7', at, {
    text: 'Ver a fita', r: 0.3, reach: 3, enabled: () => shown,
    tap: async () => {
      if (seen) { ui.say('Heitor', '(Continua aí em cima. Rebobinada.)', { seed: 12, ms: 2600 }); return; }
      seen = true; bus.emit('sfx', 'cracha_pega', {});
      await ui.dialogue('Heitor', ['(A fita. Eu a guardei na gaveta de baixo do balcão, e ela está em cima do monitor.)', '(A ponta da fita está rebobinada até o começo.)'], 12, { self: true });
      sanity.add(-1, 'r7-fita');
    },
  });
  return { data: { get seen() { return seen; } }, update(dt) { t += dt; if (!shown && (seenAlready || unseen(kit, at, t))) { shown = true; tape.visible = true; } return false; }, dispose() { if (tid) ctx.interaction.unregister(tid); render.scene.remove(tape); } };
}
export function restoreProp(ctx, data) { return tapeProp(ctx, Boolean(data?.seen)); }
export const can = () => true;
export function run(ctx) { ctx.branches.keep(tapeProp(ctx, false), 'branches/r7-fita-volta.js'); ctx.branches.event('r7', 'volta'); return { update: () => true }; }
