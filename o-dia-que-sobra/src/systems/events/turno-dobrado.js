// "Turno dobrado" (week 4, the last night). At 05:59 the shop's clock stops, and from the car park somebody calls. For the next while the
// player has a choice, and nothing says what it is: the voice asks to come outside. Leaving the shop (the building: shop, office, stock room,
// back area) is the Sun reaching the player. Staying keeps the clock: at 06:00 it goes back to 00:00, once, and the shift is done twice (the
// second round runs faster, with nobody coming). If the secrets of Valdir are on the card, the sign's breaker on the board in the back is the
// other way out: switching the Sun's sign off ends the night as the secret ending.
// The shift starts this event (`events.trigger`), never the clock, so it does not depend on what the player is doing at 05:59.
const INSIDE = new Set(['loja', 'escritorio', 'estoque', 'servico', 'deposito', 'banheiros', 'banheiroM', 'banheiroF']);
const WINDOW = 48;                // seconds of the call
const OUTSIDE_LIMIT = 4;          // seconds outside before it reaches you
const CALLS = ['Ei! Vem cá um instante!', 'O turno acabou. Vem pra fora!', 'Preciso de ajuda com o carro. Vem!', 'Você não vai me deixar aqui de novo, vai?', 'Vem. Ninguém mais vai vir.'];

export function run({ world, kit, bus, sanity, progression, event, ui, time, player, campaign, entity, customers, data, lighting }) {
  const br = world.posto.breakers;
  const fig = kit.figure('frentista-antigo', 12);
  const a = world.anchor('vaga12').pos;
  fig.root.position.set(a.x + 1.9, 0, a.z - 0.6); fig.root.visible = true; fig.setPose?.('fixo', 0);
  let t = 0, nextCall = 1.5, n = 0, out = 0, st = 'call', placaThought = false, bellT = 0;
  bus.emit('turno:call');
  bus.emit('hint', 'O relógio da loja parou nas 05:59.');
  return {
    get info() { return { st, t, out, n }; },
    update(dt) {
      t += dt;
      kit.face(fig.root, player.eyePos());
      if (st === 'call') {
        if (t >= nextCall) {
          nextCall += 9.5; ui.say('Voz', CALLS[n % CALLS.length], { seed: 91 + n, ms: 3000 }); n++; sanity.add(-1, 'chamado');
          bus.emit('sfx', 'sol_presenca', { pos: [fig.root.position.x, 1.2, fig.root.position.z], opts: { dur: 3 } });
        }
        // the sign: switched off on the board in the back
        if (!br.isOn('placa')) {
          if (campaign.secretReady()) { st = 'secret'; campaign.ending(5); return true; }
          if (!placaThought) { placaThought = true; ui.say('Heitor', '(A placa apagou. A voz continua.)', { seed: 92, ms: 3000 }); }
        }
        // outside: the voice is not asking
        if (!INSIDE.has(kit.area())) out += dt; else out = Math.max(0, out - dt * 0.5);
        if (out > OUTSIDE_LIMIT) { st = 'caught'; campaign.caught(); return true; }
        if (t >= WINDOW) {
          st = 'dobra'; progression.seen(event.id); bus.emit('event:seen', event.id); sanity.add(event.sanidade, event.id);
          fig.root.visible = false;
          // the clock goes back to 00:00 once; the second round runs fast
          time.setCap(time.parse(data.progression.expediente.fim)); time.rewind(); time.setRate(4);
          bus.emit('sfx', 'relogio_volta', {});
          ui.say('Heitor', '(O relógio voltou. Zero hora.)', { seed: 93, ms: 3600 });
          bus.emit('sfx', 'sino_fantasma', { pos: world.anchor('sino').pos.toArray() });
          entity.force('aproximacao', 4);
          return true;
        }
      }
      return false;
    },
    dispose() { kit.dispose(fig); },
  };
}
