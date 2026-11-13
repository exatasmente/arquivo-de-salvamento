// ProgressionSystem: night, week, money and the performance of the night. The performance is every
// item of the design's "Desempenho e metas": services, sales, fuelings, tasks done, errors, complaints,
// the cash divergence and the tasks left undone. (Goals, salary, bills and dismissal come with the
// campaign phase; the night already adds everything up.)
export function createProgression(bus, { rules }) {
  const fresh = () => ({
    abastecimentos: 0, vendas: 0, atendimentos: 0, tarefas: 0, naoFeitas: 0, erros: 0, reclamacoes: 0, divergencia: 0,
    ocorrencias: 0, ocorrenciasValidas: 0, pontos: 0, caixa: 0,
  });
  const st = {
    day: 1, week: 1, wallet: rules.carteiraInicial, night: fresh(), seed: 1, tutorialDone: false, flags: [], eventsSeen: [],
    recurringSeen: [], occurrences: [], doses: {}, frasco: null, cafe: { streak: 0, last: 0 },
  };
  const P = rules.pontos;
  function points(n) { st.night.pontos += n; bus.emit('perf:change', st.night); }
  bus.on('customer:done', () => { st.night.atendimentos++; points(P.atendimento); });
  return {
    st,
    get night() { return st.night; },
    startNight(day, seed) { st.day = day; st.week = Math.floor((day - 1) / 6) + 1; st.night = fresh(); st.seed = seed; st.occurrences = []; },
    fromRun(run) {
      Object.assign(st, {
        day: run.day, week: run.week, wallet: run.wallet, tutorialDone: Boolean(run.tutorialDone), flags: run.flags || [], eventsSeen: run.eventsSeen || [],
        recurringSeen: run.recurringSeen || [], seed: run.seed ?? st.seed,
        doses: run.doses || {}, frasco: run.frasco || null, cafe: run.cafe || { streak: 0, last: 0 },
      });
    },
    toRun() {
      return {
        day: st.day, week: st.week, wallet: Math.round(st.wallet * 100) / 100, tutorialDone: st.tutorialDone, flags: [...st.flags], eventsSeen: [...st.eventsSeen],
        recurringSeen: [...st.recurringSeen], seed: st.seed,
        doses: { ...st.doses }, frasco: st.frasco ? { ...st.frasco } : null, cafe: { ...st.cafe },
      };
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
