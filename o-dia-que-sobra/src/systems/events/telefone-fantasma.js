// "O telefone sem chamada": the office phone rings and, when answered, there is only the hum of the fluorescent
// on the other end. Half of the time somebody did call (the manager says so in the morning, the next night):
// the player never knows which.
export function run({ narrative, ui, sanity, progression, bus, event, rng, data }) {
  const real = rng() < 0.45;
  let st = 'ring', t = 0, ok = false;
  const done = () => { sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); if (real) progression.relatar('telefone'); };
  return {
    update(dt) {
      t += dt;
      if (st === 'ring' && !ok && Math.floor(t) !== Math.floor(t - dt)) {
        ok = narrative.ringExtra(22, async () => { bus.emit('sfx', 'telefone_mudo', { opts: { dur: 5 } }); await ui.dialogue('Telefone', data.dialogue.telefoneMudo, 4141); done(); st = 'end'; }, () => { if (real) progression.relatar('telefone'); st = 'end'; });
        if (!ok && t > 80) return true;
      }
      return st === 'end';
    },
  };
}
