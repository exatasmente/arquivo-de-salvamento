// ShiftSystem: opens and closes the night. The shift runs from 00:00 to 06:00 (90 s per hour). No new
// customers arrive after 05:40. At 05:50 the manager phones (the narrative system rings it). At 06:00 the
// clock stops and the till is closed: the player counts the drawer, then the register's report is shown
// against it; a difference counts. Closing the till ends the night: the tasks not done are added up, the
// manager closes the call, the night is saved on the card, and the summary shows the whole performance. The campaign rides on this:
// the night's points go to the week, the sixth night closes the week (goal, salary) before the save, and the last night (24) does not
// close at 06:00 the first time: the clock stops at 05:59 and the event `turno-dobrado` takes over (see events/turno-dobrado.js).
import { mulberry32 } from '../rng.js';
import { money } from '../util.js';
import { DENOMS } from './cash.js';
import { startOfNight } from './sanity.js';

const label = (v) => (v >= 100 ? `R$ ${v / 100}` : `${String(v).padStart(2, '0')} cent.`);

export function createShift(bus, d) {
  const { time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, cash, office, chores, medication, coffee, mirror } = d;
  let open = false, closing = false, rng = mulberry32(1), counting = false, doubled = false;
  const lastNight = rules.campanha.ultimaNoite;
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
    if (progression.st.day >= lastNight && !doubled) {   // the last night: 05:59 is the call from the car park, not the end
      doubled = true;
      if (events.trigger('turno-dobrado')) return;
      time.setCap(endMin);                                // no script: the night closes at six like any other
      return;
    }
    customers.enable(false); customers.closeDown();        // whoever is still here goes; the closing is never held by a customer
    ui.setObjective('Seis horas. Termine os atendimentos e feche o caixa, na registradora.');
    bus.emit('sfx', 'ui_ok', {});
  });
  bus.on('cash:close-request', () => closeCash());

  const servedAll = () => customers.blocking().length === 0;

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
      pile, okLabel: 'CONTAR E FECHAR', calc: true,
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
      closing = false; counting = false; open = true; doubled = false; rng = mulberry32(seed * 11 + day);
      progression.startNight(day, seed);
      sanity.reset(startOfNight(rules, day, progression.st.sanBase), seed);
      customers.clear(); chores.clear(); tasks.clear(); events.reset(); cash.reset(); office.reset();
      customers.beginNight(seed, day);
      inventory.slots.splice(0, 4, 'lanterna', 'pilha', 'pilha', progression.st.pilhasExtra > 0 ? 'pilha' : null); if (progression.st.pilhasExtra > 0) progression.st.pilhasExtra--; inventory.flash.charge = inventory.flash.max; inventory.flash.on = false; inventory.clearCarry();
      medication.beginNight(); coffee.reset(); mirror.reset();
      player.st.carryHeavy = false; player.st.pushing = false; player.st.liftTo = 0; player.st.lift = 0;
      const sp = world.anchor('spawn');
      player.place(sp.pos, Math.atan2(-sp.dir.x, -sp.dir.z));
      time.setCap(day >= lastNight ? endMin - 1 : endMin); time.setRate(1); time.start(0);
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
      // the campaign: the night's points go to the week; the sixth night closes it (goal, salary, dismissal), all before the save
      progression.closeNight(n.pontos);
      const week = day % rules.campanha.noitesPorSemana === 0 ? progression.closeWeek() : null;
      progression.st.sanidade = Math.round(sanity.value);
      progression.st.fase = week ? (week.demitido || week.ultima ? 'fim' : 'folga') : 'noite';
      progression.st.fim = week ? (week.demitido ? 2 : week.ultima ? 1 : 0) : 0;
      summary.week = progression.calendar(day).week;
      const ok = save.saveNight(summary);
      open = false;
      const cal = progression.calendar(day), r = progression.weekRules(cal.week);
      const choice = await ui.showSummary({ ...summary, saved: ok, next: day + 1, flags: progression.st.flags, cal, weekClosed: Boolean(week), weekPts: week ? week.pts : progression.st.weekPts, meta: r.meta, last: cal.last });
      bus.emit('shift:closed', summary, week, choice);
    },
    abort() { open = false; doubled = false; closing = false; counting = false; time.pause(); narrative.endNight(); customers.clear(); customers.enable(false); chores.clear(); tasks.clear(); events.reset(); },
  };
  return this_;
}
