// R6, night 10, for who called for help: some time later a patrol car passes on the highway without slowing, the couple is long gone, and nobody comes back.
export const can = ({ progression, narrative }) => progression.hasFlag('r6:telefone') && !narrative.ringing;
export function run({ ui, bus, branches, time }) {
  let t = 0, st = 'wait', at = time.minutes + 12;
  return {
    update(dt) {
      t += dt;
      if (st === 'wait' && time.minutes >= at) {
        st = 'pass'; t = 0;
        bus.emit('sfx', 'motor_carro', { pos: [10, 1, -20], opts: { dur: 5, gain: 0.7 } });
        ui.say('Heitor', '(Uma viatura passa pela rodovia sem diminuir. O casal já foi. Ninguém volta.)', { seed: 93, ms: 4600 });
        branches.event('r6', 'viatura');
      }
      return st === 'pass' && t > 1;
    },
  };
}
