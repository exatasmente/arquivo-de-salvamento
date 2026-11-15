// R10, night 20: the paper Sun is on the counter, leaning on an envelope: "SALÁRIO — 1998". Look at it, then choose: open it (R$ 300 in old notes, the Sun
// pays attention: the last nights begin darker), leave it shut (it is gone when you blink) or burn it in the container out back (the Sun's attention drops,
// a little sanity goes, and the smell of burnt paper comes back on the last night). The money is in the choice's effects (data/branches.pt-BR.json).
import { makeThing, examinable, unseen } from './common.js';

const AT = [12.9, 1.0, 8.55];
export const can = ({ customers, narrative }) => !narrative.ringing && !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing'].includes(c.state));
export function run(ctx) {
  const { render, kit, ui, branches, bus, time } = ctx;
  const env = makeThing(render, 'envelope');
  env.position.set(AT[0], AT[1], AT[2]); env.rotation.y = 0.15;   // (it is laid down when the player is not looking)
  const at = kit.v3(AT[0], AT[1] + 0.08, AT[2]);
  let st = 'hidden', t = 0, tid = null, after = 0;
  async function look() {
    st = 'talking';
    bus.emit('sfx', 'papel_folha', {});
    await ui.dialogue('Heitor', ['(O Sol de papel, recortado à mão, encostado num envelope.)', '(Escrito a caneta: "SALÁRIO — 1998". Sem selo, sem endereço.)', '(O papel está morno, como se alguém tivesse acabado de pôr.)'], 20, { self: true });
    const k = await branches.offer('r10');
    if (k === 'abrir') { bus.emit('sfx', 'nota', {}); await ui.dialogue('Heitor', ['(Notas de um dinheiro que não se usa mais. Trezentos, contados duas vezes.)', '(A farmácia não ia aceitar. Mesmo assim, ficam na carteira.)'], 20, { self: true }); }
    else if (k === 'queimar') { bus.emit('sfx', 'lixo', {}); await ui.dialogue('Heitor', ['(Levo ao contêiner dos fundos e acendo o canto do papel.)', '(O Sol de papel é o último a escurecer.)'], 20, { self: true }); }
    else await ui.dialogue('Heitor', ['(Piscou, e o Sol de papel não estava mais ali.)'], 20, { self: true });
    env.visible = false; st = 'done'; after = 0;
  }
  tid = examinable(ctx, 'envelope-r10', at, { text: 'Ver o envelope', tap: () => look(), enabled: () => st === 'there', r: 0.3 });
  return {
    get info() { return { st, t }; },
    update(dt) { t += dt; if (st === 'hidden' && unseen(kit, at, t)) { st = 'there'; env.visible = true; } if (st === 'done') { after += dt; return after > 0.3; } return time.minutes > 345; },
    dispose() { if (tid) ctx.interaction.unregister(tid); render.scene.remove(env); },
  };
}
