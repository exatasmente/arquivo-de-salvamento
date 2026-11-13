// ProgressionSystem: night, week, money and the performance of the night. The performance is every
// item of the design's "Desempenho e metas": services, sales, fuelings, tasks done, errors, complaints,
// the cash divergence and the tasks left undone. The campaign sits on top of it: the nights are numbered 1 to 24
// (six a week; the calendar day adds one day off per week, so night 24 is followed by the 28th day), the points of the
// closed nights add up to the week's score, the sixth night closes the week (goal met or missed, the salary), two missed
// goals are the dismissal, and the wallet is paid and charged here (`money:pay`, `money:spend`, from the day off).
export function createProgression(bus, { rules }) {
  const fresh = () => ({
    abastecimentos: 0, vendas: 0, atendimentos: 0, tarefas: 0, naoFeitas: 0, erros: 0, reclamacoes: 0, divergencia: 0,
    ocorrencias: 0, ocorrenciasValidas: 0, pontos: 0, caixa: 0,
  });
  const st = {
    day: 1, week: 1, wallet: rules.carteiraInicial, night: fresh(), seed: 1, tutorialDone: false, flags: [], eventsSeen: [],
    recurringSeen: [], occurrences: [], doses: {}, frasco: null, cafe: { streak: 0, last: 0 },
    // the campaign
    misses: 0, weekPts: 0, weekLog: [], collapse: { total: 0, byWeek: {} }, sanBase: rules.sanidade.inicio, sanidade: rules.sanidade.inicio,
    fase: 'noite', atraso: 0, fim: 0, billsPaid: [], paidSum: 0, pilhasExtra: 0,
  };
  const C = rules.campanha;
  const P = rules.pontos;
  function points(n) { st.night.pontos += n; bus.emit('perf:change', st.night); }
  bus.on('customer:done', () => { st.night.atendimentos++; points(P.atendimento); });
  const weekOf = (day) => Math.floor((day - 1) / C.noitesPorSemana) + 1;
  // the wallet: bills and purchases of the day off come on the bus (the day off decides nothing about money)
  bus.on('money:pay', ({ valor, motivo } = {}) => {
    if (!(valor > 0)) return;
    if (st.wallet + 1e-9 < valor) { bus.emit('money:refused', { motivo, valor }); return; }
    st.wallet = Math.round((st.wallet - valor) * 100) / 100; st.paidSum += valor;
    if (motivo && !st.billsPaid.includes(motivo)) st.billsPaid.push(motivo);
    bus.emit('money:change', { wallet: st.wallet });
  });
  bus.on('money:spend', ({ valor, item } = {}) => {
    if (!(valor > 0)) return;
    if (st.wallet + 1e-9 < valor) { bus.emit('money:refused', { motivo: item, valor }); return; }
    st.wallet = Math.round((st.wallet - valor) * 100) / 100;
    bus.emit('money:change', { wallet: st.wallet });
  });
  return {
    st,
    get night() { return st.night; },
    startNight(day, seed) { st.day = day; st.week = weekOf(day); st.night = fresh(); st.seed = seed; st.occurrences = []; },
    fromRun(run) {
      Object.assign(st, {
        day: run.day, week: run.week, wallet: run.wallet, tutorialDone: Boolean(run.tutorialDone), flags: run.flags || [], eventsSeen: run.eventsSeen || [],
        recurringSeen: run.recurringSeen || [], seed: run.seed ?? st.seed,
        doses: run.doses || {}, frasco: run.frasco || null, cafe: run.cafe || { streak: 0, last: 0 },
        misses: run.misses || 0, weekPts: run.weekPts || 0, weekLog: run.weekLog ? run.weekLog.map((w) => ({ ...w })) : [],
        collapse: run.collapse ? { total: run.collapse.total || 0, byWeek: { ...(run.collapse.byWeek || {}) } } : { total: 0, byWeek: {} },
        sanBase: run.sanBase ?? rules.sanidade.inicio, sanidade: run.sanidade ?? rules.sanidade.inicio,
        fase: run.fase || 'noite', atraso: run.atraso || 0, fim: run.fim || 0, billsPaid: [], pilhasExtra: run.pilhasExtra || 0,
      });
    },
    toRun() {
      return {
        day: st.day, week: st.week, wallet: Math.round(st.wallet * 100) / 100, tutorialDone: st.tutorialDone, flags: [...st.flags], eventsSeen: [...st.eventsSeen],
        recurringSeen: [...st.recurringSeen], seed: st.seed,
        doses: { ...st.doses }, frasco: st.frasco ? { ...st.frasco } : null, cafe: { ...st.cafe },
        misses: st.misses, weekPts: st.weekPts, weekLog: st.weekLog.map((w) => ({ ...w })),
        collapse: { total: st.collapse.total, byWeek: { ...st.collapse.byWeek } },
        sanBase: st.sanBase, sanidade: st.sanidade, fase: st.fase, atraso: st.atraso, fim: st.fim, pilhasExtra: st.pilhasExtra,
      };
    },
    // ---------------------------------------------------------------- the campaign
    weekOf,
    weekRules: (w = st.week) => rules.semanas[String(Math.min(4, Math.max(1, w)))],
    /** Where the night is on the calendar: week, night of the week (1..6), the calendar day (1..28) and the weekday label. */
    calendar(day = st.day) {
      const week = weekOf(day), noite = ((day - 1) % C.noitesPorSemana) + 1;
      return { week, noite, calDay: day + (week - 1), dia: C.nomesDia[noite - 1], last: day >= C.ultimaNoite, weekName: rules.semanas[String(Math.min(4, week))].nome };
    },
    /** The night's points go to the week's score. */
    closeNight(pts) { st.weekPts += pts; },
    /** The sixth night closes the week: the goal, the salary (cut when the goal was missed), the count of missed goals. */
    closeWeek() {
      const w = st.week, r = rules.semanas[String(Math.min(4, w))], pts = st.weekPts, bateu = pts >= r.meta;
      if (!bateu) st.misses++;
      const salario = bateu ? r.salario : Math.round(r.salario * C.salarioMetaPerdida);
      st.wallet = Math.round((st.wallet + salario) * 100) / 100;
      const res = { week: w, pts, meta: r.meta, bateu, salario, cheio: r.salario, misses: st.misses, demitido: st.misses >= C.metasPerdidasDemissao, ultima: w >= C.semanas };
      st.weekLog.push({ week: w, pts, meta: r.meta, bateu, salario });
      st.weekPts = 0; bus.emit('money:change', { wallet: st.wallet });
      return res;
    },
    /** The sanity at 0 happened again: counts it for the three-times and two-in-a-week rules. Returns true when the rule is met. */
    collapsed() {
      st.collapse.total++; const w = String(st.week); st.collapse.byWeek[w] = (st.collapse.byWeek[w] || 0) + 1;
      return st.collapse.total >= C.colapso.total || st.collapse.byWeek[w] >= C.colapso.naSemana;
    },
    newRun() {
      Object.assign(st, { day: 1, week: 1, wallet: rules.carteiraInicial, tutorialDone: false, flags: [], eventsSeen: [], recurringSeen: [], occurrences: [], doses: {}, frasco: null, cafe: { streak: 0, last: 0 },
        misses: 0, weekPts: 0, weekLog: [], collapse: { total: 0, byWeek: {} }, sanBase: rules.sanidade.inicio, sanidade: rules.sanidade.inicio, fase: 'noite', atraso: 0, fim: 0, billsPaid: [], pilhasExtra: 0 });
    },
    ok(kind) {
      if (kind === 'abastecimento') { st.night.abastecimentos++; points(P.abastecimento); }
      else if (kind === 'venda') { st.night.vendas++; points(P.venda); }
      else if (kind === 'tarefa') { st.night.tarefas++; points(P.tarefa); }
    },
    error(kind, why) { st.night.erros++; points(P.erro); bus.emit('perf:error', kind, why); },
    complaint(why) { st.night.reclamacoes++; points(P.reclamacao); bus.emit('perf:complaint', why); },
    /** The cash count at 06:00: cents apart from the register's report. */
    divergence(cents) { if (!cents) return; st.night.divergencia += cents; points(Math.round(P.divergenciaPorReal * cents / 100)); },
    undone(n) { if (!n) return; st.night.naoFeitas += n; points(P.tarefaNaoFeita * n); },
    occurrence(valid) { st.night.ocorrencias++; if (valid) st.night.ocorrenciasValidas++; points(valid ? P.ocorrenciaValida : P.ocorrenciaSemMotivo); },
    countError() { points(P.contagemErrada); },
    addCash(cents) { st.night.caixa += cents; },
    flag(f) { if (!st.flags.includes(f)) st.flags.push(f); },
    /** Something from tonight that the manager reads out in the morning call of the NEXT night. */
    relatar(tipo) { const f = `relatar:${tipo}:${st.day}`; if (!st.flags.includes(f)) st.flags.push(f); },
    relatos() { return st.flags.filter((f) => f.startsWith('relatar:') && Number(f.split(':')[2]) < st.day).map((f) => f.split(':')[1]); },
    consumirRelatos() { st.flags = st.flags.filter((f) => !(f.startsWith('relatar:') && Number(f.split(':')[2]) < st.day)); },
    unflag(f) { const i = st.flags.indexOf(f); if (i >= 0) st.flags.splice(i, 1); },
    hasFlag: (f) => st.flags.includes(f),
    seen(id) { if (!st.eventsSeen.includes(id)) st.eventsSeen.push(id); },
    hasSeen: (id) => st.eventsSeen.includes(id),
    recurring(id) { if (!st.recurringSeen.includes(id)) st.recurringSeen.push(id); },
    pay(amount) { st.wallet += amount; },
    points,
  };
}
