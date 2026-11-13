// ShiftSystem: opens and closes the night. The shift runs from 00:00 to 06:00 (90 s per hour). No new
// customers arrive after 05:40. At 05:50 the manager phones (the narrative system rings it). At 06:00 the
// clock stops and the till is closed: the player counts the drawer, then the register's report is shown
// against it; a difference counts. Closing the till ends the night: the tasks not done are added up, the
// manager closes the call, the night is saved on the card, and the summary shows the whole performance.
import { mulberry32 } from '../rng.js';
import { money } from '../util.js';
import { DENOMS } from './cash.js';
import { startOfNight } from './sanity.js';

const label = (v) => (v >= 100 ? `R$ ${v / 100}` : `${String(v).padStart(2, '0')} cent.`);

export function createShift(bus, d) {
  const { time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, cash, office, chores, medication, coffee, mirror } = d;
  let open = false, closing = false, rng = mulberry32(1), counting = false;
  const endMin = time.parse(rules.expediente.fim), noNewMin = time.parse(rules.expediente.semClientesApos);
  time.setCap(endMin);

  bus.on('tutorial:done', () => { if (open) customers.enable(true, progression.st.seed * 3 + progression.st.day); });
  bus.on('customer:done', (c, errors) => {
    if (!c) return;
    if (errors || c.tipRange || rng() > 0.4) return;
    const tip = 100 * (1 + Math.floor(rng() * 4)); progression.pay(tip / 100); bus.emit('hint', `Gorjeta: ${money(tip)}`);
  });
  bus.on('time:minute', (m) => {
    if (!open) return;
    if (m === noNewMin) customers.enable(false);
  });
  bus.on('time:cap', () => {
    if (!open || closing) return;
    customers.enable(false);
    ui.setObjective('Seis horas. Termine os atendimentos e feche o caixa, na registradora.');
    bus.emit('sfx', 'ui_ok', {});
  });
  bus.on('cash:close-request', () => closeCash());

  const servedAll = () => customers.list.every((c) => c.kind === 'empty' || c.noService || c.done || c.state === 'leaving');

  /** Counts the drawer: first the player's count, then the register's report against it. */
  async function closeCash() {
    if (!open || closing || counting || cash.closed) return;
    if (!servedAll()) { bus.emit('hint', 'Termine os atendimentos antes de fechar o caixa.'); return; }
    counting = true;
    const pile = [];
    for (const dn of DENOMS) if (cash.have(dn) > 0) pile.push([label(dn), `×${cash.have(dn)}`]);
    if (cash.torn) pile.push(['Nota rasgada (não vale)', money(cash.torn)]);
    const declared = await ui.keypad({
      title: 'FECHAR O CAIXA',
      lines: ['Conte o que está na gaveta, nota por nota e moeda por moeda.', 'Digite o valor contado. Notas rasgadas não contam.'],
      pile, okLabel: 'CONTAR E FECHAR',
    });
    if (declared === null) { counting = false; return; }
    const res = cash.close(declared);
    progression.divergence(res.divergence);
    if (res.miscount) progression.countError();
    progression.st.night.caixa = declared;
    const rep = cash.report();
    const verdict = res.miscount ? data.dialogue.caixa.contagem : res.drawerGap === 0 ? data.dialogue.caixa.certo : res.drawerGap > 0 ? data.dialogue.caixa.sobra : data.dialogue.caixa.falta;
    await new Promise((resolve) => {
      ui.menu({
        title: 'CAIXA FECHADO', subtitle: 'Relatório contra a gaveta',
        lines: [
          `Fundo de caixa ${money(rep.fundo)} + vendas ${money(rep.vendas)} = esperado ${money(res.expected)}`,
          `Você contou ${money(res.declared)}. Na gaveta há ${money(res.real)}.`,
          res.divergence ? `Divergência de ${money(res.divergence)} ${res.drawerGap > 0 ? '(sobrou)' : '(faltou)'}.` : 'Sem divergência.',
          verdict,
        ],
        items: [{ label: () => 'CONTINUAR', act: () => { ui.closeModal(); resolve(); } }],
      });
    });
    tasks.done('fechar-caixa'); progression.ok('tarefa');
    counting = false;
    await this_.close(res);
  }

  const this_ = {
    get open() { return open; },
    /** Starts a night. opts: { day, seed, tutorial, event } */
    begin({ day, seed, tutorial, event }) {
      closing = false; counting = false; open = true; rng = mulberry32(seed * 11 + day);
      progression.startNight(day, seed);
      sanity.reset(startOfNight(rules, day), seed);
      customers.clear(); chores.clear(); tasks.clear(); events.reset(); cash.reset(); office.reset();
      customers.beginNight(seed, day);
      inventory.slots.splice(0, 4, 'lanterna', 'pilha', 'pilha', null); inventory.flash.charge = inventory.flash.max; inventory.flash.on = false; inventory.clearCarry();
      medication.beginNight(); coffee.reset(); mirror.reset();
      player.st.carryHeavy = false; player.st.pushing = false; player.st.liftTo = 0; player.st.lift = 0;
      const sp = world.anchor('spawn');
      player.place(sp.pos, Math.atan2(-sp.dir.x, -sp.dir.z));
      time.setCap(endMin); time.start(0);
      tasks.begin({ seed, day, tutorial });
      narrative.begin({ tutorial });
      if (!tutorial) customers.enable(true, seed * 3 + day);
      events.schedule({ day, seed, force: event, tutorialDone: !tutorial });
      bus.emit('shift:open', day);
    },
    update() {},
    async close(res) {
      if (closing) return; closing = true; time.pause(); narrative.endNight(); customers.enable(false);
      const g = data.dialogue.gerenteFim;
      await ui.dialogue(data.dialogue.gerente, [res && res.divergence ? g.divergente : g.ok], 79);
      // the tasks left undone count against the night
      progression.undone(tasks.undone());
      const n = progression.night, day = progression.st.day;
      const recorrentes = [...(customers.nightRecurring || [])];
      const summary = {
        day, seed: progression.st.seed, points: n.pontos, abastecimentos: n.abastecimentos, vendas: n.vendas, atendimentos: n.atendimentos, tarefas: n.tarefas, naoFeitas: n.naoFeitas,
        erros: n.erros, reclamacoes: n.reclamacoes, divergencia: n.divergencia, caixa: n.caixa, ocorrencias: n.ocorrencias, carteira: Math.round(progression.st.wallet * 100) / 100,
        lista: tasks.list.map((t) => ({ texto: t.text.replace(/\s*\[.*$/, ''), feita: t.done })), registros: office.summary(), recorrentes,
      };
      progression.st.tutorialDone = true; ui.setObjective(null); customers.clear(); chores.clear(); tasks.clear();
      const ok = save.saveNight(summary);
      open = false;
      await ui.showSummary({ ...summary, saved: ok, next: day + 1, flags: progression.st.flags });
      bus.emit('shift:closed', summary);
    },
    abort() { open = false; closing = false; counting = false; time.pause(); narrative.endNight(); customers.clear(); customers.enable(false); chores.clear(); tasks.clear(); events.reset(); },
  };
  return this_;
}
