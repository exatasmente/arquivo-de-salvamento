// "O telefone com a própria voz": the office phone rings out of its hour. On the other side is Heitor's own voice,
// as an old recording: "Não saia da loja." For the next while, being outside weighs (the shop and the office hold).
// The line is a dialogue box with the protagonist's babble; the recorded voice is paid and comes only with a "yes".
export function run({ narrative, ui, sanity, progression, bus, kit, est, data, event, time }) {
  const D = data.dialogue.telefoneProprio;
  let st = 'ring', t = 0, ringT = 0, out = 0, tTotal = 0, tried = 0;
  const WINDOW = 45;
  return {
    update(dt) {
      t += dt;
      if (st === 'ring') {
        ringT += dt;
        if (ringT > 1 && Math.floor(ringT) !== Math.floor(ringT - dt) && !narrative.extraRinging && tried === 0) {
          const ok = narrative.ringExtra(26, async () => {
            await ui.dialogue(D.quem, D.linhas, 4041, { self: true });
            sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
            st = 'hold'; t = 0; est.naoSair = { until: WINDOW };
          }, () => { st = 'missed'; });
          if (ok) tried = 1; else if (ringT > 90) return true;
        }
        return false;
      }
      if (st === 'missed') return true;
      if (st === 'hold') {
        tTotal += dt;
        const a = kit.area();
        if (a !== 'loja' && a !== 'escritorio') { out += dt; if (Math.floor(out / 6) !== Math.floor((out - dt) / 6)) { sanity.add(-1, 'naoSair'); bus.emit('sfx', 'zumbido_ouvido', {}); } }
        if (tTotal >= WINDOW) {
          if (out < 3) { sanity.add(4, 'naoSair'); progression.flag('obedeceu-telefone'); ui.say('Heitor', '(Fiquei. A voz era a minha.)', { seed: 22, ms: 3000 }); }
          else progression.flag('desobedeceu-telefone');
          return true;
        }
      }
      return false;
    },
    dispose() { est.naoSair = null; },
  };
}
/** the phone is free: not the manager's call, not the lesson, not another ring. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ narrative }) => narrative.phase === 'free' && !narrative.ringing && !narrative.extraRinging;
