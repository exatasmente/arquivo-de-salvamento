// R6, night 10, for who let her wait in the shop: at four the boyfriend comes back, drunk, and does not want to leave (the cast's drunk that will not go: the same
// asking-to-leave as any of them). His name is his own; nothing else about him is known.
export const can = ({ progression, customers }) => progression.hasFlag('r6:deixou') && !customers.list.some((c) => c.kind === 'walk' && c.state !== 'leaving' && !c.noCounter);
export function run({ customers, data, branches, ui }) {
  const tipo = (data.cast?.tipos || []).find((t) => t.id === 'bebado');
  let t = 0, tried = false, ok = false;
  return {
    update(dt) {
      t += dt;
      if (!tried) {
        tried = true;
        const c = tipo ? customers.spawnWalker({ tipo, seed: 1004, name: 'Namorado da moça' }) : null;
        if (c) { ok = true; branches.event('r6', 'bebado'); ui.say('Heitor', '(Ele voltou. Era o carro dele, e ele não está bem.)', { seed: 93, ms: 3600 }); }
      }
      return tried && (ok ? t > 0.6 : t > 25);
    },
  };
}
