// The extra Sunday (R4, accepted): one short night in the closed station, only the Sun's sign lit. No customers, no preparation and no closing: three or
// four minutes with one thing that happens. The office phone rings (Heitor's sister, who rang the house and nobody answered: it was his day off), and
// afterwards somebody in an old attendant's uniform stands under the sign, with his back to the road, until the player looks away.
// It ends in a menu: leaving pays R$ 180 (campaign.endExtra) and the week 2 begins with no rest in between.
// The script gets `end`: the function that closes the Sunday.
const SISTER = [
  'Heitor? Sou eu. Liguei em casa e ninguém atendeu.',
  'Era a sua folga, né? Eu tinha anotado domingo.',
  'Você está no posto de novo? ... Liga quando puder. Eu espero.',
];
export function run({ narrative, ui, kit, world, bus, sanity, progression, branches, end, time }) {
  const fig = kit.figure('frentista-antigo', 12);
  const sign = world.anchor('placaSol');
  const under = sign ? kit.v3(sign.pos.x, 0, sign.pos.z + 4.5) : null;
  if (under) { fig.root.position.set(under.x, 0, under.z); fig.root.rotation.y = Math.PI; fig.setPose?.('fixo', 0); }
  const eye = under ? kit.v3(under.x, 1.4, under.z) : null;
  let t = 0, st = 'wait', tCall = 0, gazed = 0, away = 0, tFig = 0, said = false, called = false;
  ui.setObjective('Domingo, turno extra. O posto está fechado; só a placa está acesa. Fique por perto.');
  ui.say('Heitor', '(Domingo. O posto fechado. Só a placa acesa. Era para ser a minha folga.)', { seed: 12, ms: 4600 });
  return {
    get info() { return { st, t }; },
    update(dt) {
      t += dt;
      if (st === 'wait') {
        if (t > 22 && !called) {
          called = narrative.ringExtra(30, async () => {
            await ui.dialogue('Irmã', SISTER, 31);
            bus.emit('sfx', 'telefone_desliga', {});
            sanity.add(-2, 'irma'); st = 'after'; t = 0; ui.setObjective(null);
          }, () => { st = 'after'; t = 0; ui.setObjective(null); });
          if (called) ui.setObjective('O telefone do escritório está tocando.');
        }
        if (t > 120 && !called) { st = 'after'; t = 0; }
        return false;
      }
      if (st === 'after') {
        // the figure under the sign, seen from the shop's front: it is there when the player is not looking
        if (t > 6 && under && kit.look(eye) < 0.55) { fig.root.visible = true; st = 'fig'; tFig = 0; }
        else if (t > 60 || !under) { st = 'menu'; }
        return false;
      }
      if (st === 'fig') {
        tFig += dt;
        kit.face(fig.root, kit.v3(under.x, 0, under.z - 20));      // with its back to the player: it looks at the road
        if (kit.look(eye) > 0.86 && kit.dist(eye) < 40) {
          gazed += dt; away = 0;
          if (gazed > 1.2 && !said) { said = true; sanity.add(-3, 'domingo'); bus.emit('event:seen', 'domingo-figura'); ui.say('Heitor', '(Sob a placa. De costas. Parado.)', { seed: 12, ms: 3400 }); }
        } else if (said) { away += dt; if (away > 0.9) { fig.root.visible = false; st = 'menu'; } }
        if (tFig > 70) { fig.root.visible = false; st = 'menu'; }
        return false;
      }
      if (st === 'menu') {
        st = 'done';
        ui.setObjective(null);
        ui.menu({ title: 'TURNO EXTRA', subtitle: 'DOMINGO', lines: ['O posto segue fechado. Ninguém mais vai vir.', 'Hora de ir. Amanhã é segunda: a semana 2 começa sem folga.'], items: [{ label: () => 'IR EMBORA', act: () => { ui.closeModal(); end(); } }] });
        void progression; void branches; void time;
      }
      return false;
    },
    dispose() { kit.dispose(fig); },
  };
}
