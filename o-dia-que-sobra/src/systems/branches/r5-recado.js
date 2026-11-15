// R5, night 22 (week 4): the office phone rings and it is the answering machine with the sister's voice. What it says is what the week 2 day off decided:
// she was sent the money (a warm message), half (a short one) or none (a message from a day off Heitor did not have, with the voice a little wrong).
// The calm of the start of the night is already applied (the `aplica` steps of the record); here is only the call, and, for the third, its price.
const TEXT = {
  mandou: ['Heitor, sou eu. Deu tudo certo com a conta, e eu quis te ouvir mesmo assim.', 'Faltam poucas noites, né? Eu conto junto com você. Aguenta, irmão.'],
  metade: ['Heitor, sou eu. Foi o que deu para pagar, e já ajudou muito.', 'Cuida de você aí. Liga na folga.'],
  nao: ['Heitor? Sou eu. Liguei na sua folga de domingo e atendeu um homem.', 'Ele disse que você estava no turno. Mas você nunca tem folga de domingo, né?', 'Ele disse que ia te esperar.'],
};
const which = (progression) => (progression.hasFlag('r5:mandou') ? 'mandou' : progression.hasFlag('r5:metade') ? 'metade' : progression.hasFlag('r5:nao') ? 'nao' : null);

export function run({ narrative, ui, bus, branches, time, progression }) {
  const k = which(progression);
  let st = 'ring', t = 0, tried = false;
  return {
    update(dt) {
      t += dt;
      if (st !== 'ring') return t > 0.4;
      if (!tried && t > 1) {
        const ok = narrative.ringExtra(28, async () => {
          bus.emit('sfx', 'secretaria_inicio', {});
          bus.emit('sfx', 'secretaria_fita', { opts: { dur: 6, ...(k === 'nao' ? { estranho: true } : {}) } });
          await ui.dialogue('Secretária eletrônica', TEXT[k], 31);
          bus.emit('sfx', 'secretaria_fim', {});
          if (k === 'nao') branches.event('r5', 'errada');
          st = 'done'; t = 0;
        }, () => { st = 'done'; t = 0; });
        if (ok) tried = true; else if (t > 70 || time.minutes > 140) return true;
      }
      return false;
    },
  };
}
export const can = ({ narrative, progression }) => Boolean(which(progression)) && narrative.phase === 'free' && !narrative.ringing && !narrative.extraRinging;
