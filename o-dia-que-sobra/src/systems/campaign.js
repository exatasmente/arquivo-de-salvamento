// CampaignSystem: what happens between the nights and how the story ends. Four weeks of six nights, a day off after each of the first
// three, and the 28th day after the last night.
//
//   the week      the sixth night closes it (progression.closeWeek: goal met or missed, the salary cut when missed); the balance screen shows it;
//                 two missed goals are the dismissal (ending 2); the fourth week closed with the goals in hand is ending 1.
//   the day off   `dayoff:start { week, day, wallet, contas, contasPorId, sanidade }` -> the day off plays on its own (src/systems/dayoff.js) and pays,
//                 buys and sleeps through the bus (`money:pay`, `money:spend`, `inventory:add`) -> `dayoff:end { sanidade }`: the sleep gives the
//                 sanity back (a floor keeps the week playable, unpaid bills take a little away) and the next night opens.
//   the endings   `ending { id, week, day }` is the one way out of the campaign. Something plays the ending (the game: the cutscene `final<id>`) and
//                 says `ending:done { id }`; the screen of the ending, the card and the "new game" come from here.
//                   1 the 28th day (4 weeks, goals in hand)   2 dismissal (2 missed goals)   3 collapse (sanity at 0 three times in the campaign, or twice
//                   in one week, and no attack within the wait)   4 the Sun reaches the player (any attack)   5 the secret one (turno-dobrado.js).
// Nothing here reads a real clock: the wait of the collapse counts the game's own steps.
import { money } from '../util.js';

export const ENDINGS = {
  1: { titulo: 'O DIA QUE SOBRA', linha: 'A escala mudou. Heitor volta a pé para casa, com a vara na mão.' },
  2: { titulo: 'DEMISSÃO', linha: 'Duas metas perdidas. O gerente recolhe o colete.' },
  3: { titulo: 'COLAPSO', linha: 'O expediente não termina. O relógio volta, os clientes repetem.' },
  4: { titulo: 'DESAPARECIMENTO', linha: 'Na noite seguinte, há um frentista novo na bomba 4, de costas.' },
  5: { titulo: 'A FOLGA DE VALDIR', linha: 'A placa apagou. O carro do fundo acendeu os faróis e foi embora, sem ninguém dentro.' },
};
const TERMINAL = new Set([1, 2, 5]);   // the run is over; 3 and 4 go back to the last saved night

export function createCampaign(bus, { progression, sanity, entity, ui, save, secrets, rules, data, hooks }) {
  const C = rules.campanha, st = progression.st;
  let endingNow = 0, collT = 0, atDayOff = false, shownFor = 0;

  // ------------------------------------------------------------------ the endings
  function ending(id) {
    if (endingNow || !ENDINGS[id]) return false;
    endingNow = id; collT = 0; shownFor = 0;
    bus.emit('ending', { id, week: st.week, day: st.day });
    return true;
  }
  bus.on('ending:done', (e) => { if (e && e.id === endingNow && shownFor !== endingNow) { shownFor = endingNow; showEnd(endingNow); } });

  function showEnd(id) {
    const card = save.card, first = card.addEnding(id), E = ENDINGS[id];
    const total = card.endings.length;
    if (TERMINAL.has(id)) { save.wipe(); }
    hooks.onEndScreen?.(id);
    const lines = [E.linha, '', `Finais encontrados: ${total} de 5.`,
      `Semana ${st.week} · noite ${st.day} · carteira ${money(st.wallet * 100)} · metas perdidas ${st.misses}.`,
      `Semente do jogo: ${hooks.seed()}.`];
    if (first) lines.splice(1, 0, 'Um final novo.');
    const items = [{ label: () => 'NOVO JOGO', act: () => { endingNow = 0; hooks.newGame(); } }];
    if (!TERMINAL.has(id) && save.hasRun()) items.push({ label: () => 'CONTINUAR DA ÚLTIMA NOITE SALVA', act: () => { endingNow = 0; hooks.continueRun(); } });
    items.push({ label: () => 'CARTÃO DE MEMÓRIA', act: () => ui.cardScreen(save.card, () => showEnd2(id, lines, items)) });
    items.push({ label: () => 'VOLTAR AO TÍTULO', act: () => { endingNow = 0; hooks.showTitle(); } });
    ui.endingScreen({ title: E.titulo, subtitle: `FIM ${id}`, lines, items });
  }
  /** Back to the screen of the ending from the card screen. */
  function showEnd2(id, lines, items) { ui.endingScreen({ title: ENDINGS[id].titulo, subtitle: `FIM ${id}`, lines, items }); }

  // ------------------------------------------------------------------ the end of the night
  /** Called when the summary of a night closes. week: the result of closeWeek() on the sixth night, or null. choice: 'next' | 'title'. */
  async function onClosed(summary, week, choice) {
    if (endingNow) return;
    if (choice === 'title') { hooks.showTitle(); return; }
    if (!week) { hooks.startNight(summary.day + 1); return; }
    await balance(week);
    if (week.demitido) ending(2);
    else if (week.ultima) ending(1);
    else startDayOff(week.week);
  }
  async function balance(w) {
    const D = data.dialogue.balanco, fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
    const lines = [fill(D.meta, { meta: w.meta, pts: w.pts }),
      w.bateu ? fill(D.bateu, { sal: money(w.salario * 100) }) : fill(D.perdeu, { sal: money(w.salario * 100), cheio: money(w.cheio * 100) })];
    if (!w.bateu) lines.push(w.misses >= C.metasPerdidasDemissao ? D.perdidas2 : w.ultima ? D.perdidas1Ultima : fill(D.perdidas1, {}));
    if (!w.demitido && !w.ultima) lines.push(D.folga);
    lines.push(`Carteira: ${money(st.wallet * 100)}.`);
    await ui.showBalance({ title: fill(D.titulo, { w: w.week }), sub: progression.weekRules(w.week).nome, lines, ok: w.demitido ? 'CONTINUAR' : w.ultima ? 'CONTINUAR' : 'IR PARA CASA' });
  }

  // ------------------------------------------------------------------ the day off
  async function startDayOff(week) {
    const r = progression.weekRules(week);
    atDayOff = true; st.paidSum = 0; st.billsPaid = [];
    const contas = r.contas.map((c) => ({ ...c })), porId = Object.fromEntries(contas.map((c) => [c.id, c.valor]));
    await hooks.enterDayOff();
    bus.emit('dayoff:start', { week, day: progression.calendar(week * C.noitesPorSemana).calDay + 1, wallet: st.wallet, contas, contasPorId: porId, sanidade: st.sanidade });
  }
  bus.on('dayoff:end', (e = {}) => {
    if (!atDayOff) return;
    atDayOff = false;
    const week = progression.weekOf(st.day), r = progression.weekRules(week), owed = r.contas.reduce((a, c) => a + c.valor, 0) - st.paidSum;
    const late = owed > 0 ? Math.min(3, Math.ceil(owed / 60)) * C.atrasoSanidade : 0;
    const got = Number.isFinite(e.sanidade) ? e.sanidade : st.sanidade + 40;
    st.sanBase = Math.max(0, Math.min(100, Math.max(rules.sanidade.pisoSemana, got) - late));
    st.atraso = late ? st.atraso + 1 : st.atraso; st.fase = 'noite'; st.fim = 0;
    const next = st.day + 1;
    save.saveRun({ day: next, week: progression.weekOf(next) });
    hooks.leaveDayOff();
    hooks.startNight(next);
  });

  // ------------------------------------------------------------------ collapse and the attack
  bus.on('sanity:zero', () => {
    if (!hooks.playing() || endingNow) return;
    if (progression.collapsed() && !collT) collT = C.colapso.esperaSegundos;   // a collapse that the Sun does not interrupt
  });

  return {
    ending, onClosed, startDayOff, showEnd, ENDINGS,
    get endingId() { return endingNow; },
    get dayOffOpen() { return atDayOff; },
    /** One game step while a night is played (the attack, if it comes, takes the ending 4 before the wait of the collapse is over). */
    update(dt) {
      if (endingNow) return;
      if (collT > 0) { collT -= dt; if (collT <= 0) { collT = 0; ending(3); } }
    },
    attacked() { ending(4); },
    caught() { entity.catchNow(); },
    secretReady: () => secrets.ready(),
    resetNight() { endingNow = 0; collT = 0; },
    reset() { endingNow = 0; collT = 0; atDayOff = false; },
    /** The title's "continue": the run said where it stopped. */
    resume(run) {
      if (run.fase === 'folga') { st.day = run.day - 1; startDayOff(progression.weekOf(st.day)); return true; }
      if (run.fase === 'fim' && run.fim) { ending(run.fim); return true; }
      return false;
    },
  };
}
