// BranchSystem: the story branches. Each night from the second brings one thing that happens only once, with a choice that changes what comes
// after (money, sanity, who shows up, what the manager says, how the Sun acts). The choices stay on the card (`run.escolhas`), the three hidden
// measures with them (`run.ties`, systems/ties.js) and the clipboard tells them in "O que aconteceu".
//
// The branches are data (data/branches.pt-BR.json) and scripts (src/systems/branches/<id>.js), in the pattern of the events:
//   a script is `export function run(ctx) -> { update(dt, simT) -> true when it is over, dispose?() }` and an optional `export const can = (ctx) => bool`
//   that is checked before it begins (so nothing starts with the world in the way). A step of a branch (`passos[]`) is either
//     `aplica`   applied when the night opens (an effect and/or a line for the manager's 05:50 call), once; or
//     `roteiro`  a script that starts inside its window (`horario`) when nothing else is going on.
//   The first moment of a branch (`noite` of the record) is a script too, or it is brought by another system: the customers (R1, the scene of
//   Rafael), the manager's call (R4) and the closing of the till (R3's choice).
// A choice is `choose(id, option)`; it applies the `efeitos` of the option: conf, sol, laco, carteira, sanidade, flags, tiraFlags, metaPct, relato, ocorrencia.
// Nothing here reads a real clock; the plan of a night comes from the data and the run, never from a draw.
import { createKit } from './events/kit.js';

const NIGHTS = (n) => [].concat(n ?? []);

export async function createBranches(bus, ctx) {
  const { data, progression, time, ui, ties, events } = ctx;
  const D = data.branches || { ramos: [], noites: {}, falas: {} };
  const records = D.ramos || [];
  const st = progression.st;
  const kit = createKit(ctx);
  const byId = (id) => records.find((r) => r.id === id);
  const mods = {}, loading = {};
  let plan = [], active = null, ran = new Set(), clock = 0, lastEnd = -99;
  const props = [];   // what a script leaves in the world after it is over (the street dweller asleep on the pavement): { path, update(dt, simT) -> true to go, dispose(), data }
  let whistled = false;

  const R = (c) => `R$ ${Math.abs(c)}`;
  function dropProps() { for (const p of props.splice(0)) p.prop.dispose?.(); }
  function load(path) {
    if (!loading[path]) loading[path] = import('./' + path).then((m) => (mods[path] = m), (e) => { console.warn('branch script', path, e.message); return (mods[path] = null); });
    return loading[path];
  }

  // ------------------------------------------------------------------ effects and the log
  function apply(ef = {}, tag = '') {
    if (!ef) return;
    if (ef.conf) ties.add('conf', ef.conf);
    if (ef.sol) ties.add('sol', ef.sol);
    for (const [id, n] of Object.entries(ef.laco || {})) ties.add('laco', n, id);
    if (ef.carteira) {
      st.wallet = Math.max(0, Math.round((st.wallet + ef.carteira) * 100) / 100); bus.emit('money:change', { wallet: st.wallet });
      bus.emit('hint', ef.carteira > 0 ? `Carteira: +${R(ef.carteira)}` : `Carteira: -${R(ef.carteira)}`);
    }
    if (ef.sanidade) bus.emit('sanity:add', ef.sanidade, 'ramo:' + tag);
    for (const f of ef.flags || []) progression.flag(f);
    for (const f of ef.tiraFlags || []) progression.unflag(f);
    for (const [w, p] of Object.entries(ef.metaPct || {})) st.metaPct[w] = Math.round(((st.metaPct[w] || 0) + p) * 100) / 100;
    if (ef.relato) progression.flag('fala:' + ef.relato);
    if (ef.ocorrencia) {
      ctx.office?.registered.push({ tipo: 'nota-falsa', nome: 'Nota falsa no caixa', hora: time.text(), at: time.minutes, valida: true });
      progression.occurrence(true);
    }
  }
  /** The player (or the story) took option `k` of branch `id`: it is logged, its effects applied. Returns false when it is not a known option. */
  function choose(id, k) {
    const b = byId(id), e = b?.escolhas?.[k]; if (!e) return false;
    if (st.escolhas.some((x) => x.b === id && x.k === k)) return false;
    st.escolhas.push({ b: id, k, d: st.day });
    apply(e.efeitos, id);
    bus.emit('branch:choice', { id, k });
    return true;
  }
  /** What a choice brought later (a consequence): logged once and applied. */
  function event(id, k) {
    const b = byId(id), e = b?.eventos?.[k]; if (!e) return false;
    const key = 'ev:' + k;
    if (st.escolhas.some((x) => x.b === id && x.k === key)) return false;
    st.escolhas.push({ b: id, k: key, d: st.day });
    apply(e.efeitos, id);
    bus.emit('branch:event', { id, k });
    return true;
  }
  const done = (id, k) => st.escolhas.some((x) => x.b === id && (x.k === k || x.k === 'ev:' + k));
  /** "O que aconteceu": one line per choice made and per consequence that came, in order. */
  function log() {
    const out = [];
    for (const x of st.escolhas) {
      const b = byId(x.b); if (!b) continue;
      const t = x.k.startsWith('ev:') ? b.eventos?.[x.k.slice(3)]?.linha : b.escolhas?.[x.k]?.linha;
      if (t) out.push(t);
    }
    return out;
  }

  /** A menu of the branch's options (modal). Resolves with the option taken, already applied. */
  function offer(id, extraLines = []) {
    const b = byId(id);
    return new Promise((resolve) => {
      if (!b) { resolve(null); return; }
      const items = Object.entries(b.escolhas).map(([k, e]) => ({ label: () => e.rotulo, act: () => { ui.closeModal(); choose(id, k); resolve(k); } }));
      ui.menu({ title: b.menu.titulo, lines: [...b.menu.linhas, ...extraLines], items });
    });
  }

  // ------------------------------------------------------------------ the night
  const stepOn = (s, day) => NIGHTS(s.noite).includes(day) && (!s.se || progression.hasFlag(s.se)) && (!s.sem || !progression.hasFlag(s.sem));
  function beginNight(day) {
    dropProps(); plan = []; ran = new Set(); active = null; clock = 0; lastEnd = -99; whistled = false; if (events) events.state.hold = false;
    const tonight = day;
    for (const b of records) {
      const steps = [...(b.roteiro ? [{ id: b.id, noite: b.noite, roteiro: b.roteiro, horario: b.horario }] : []), ...(b.passos || [])];
      for (const s of steps) {
        if (!stepOn(s, tonight)) continue;
        if (s.aplica) {
          if (progression.hasFlag('ap:' + s.id)) continue;
          progression.flag('ap:' + s.id);
          if (s.aplica.evento) event(b.id, s.aplica.evento);
          continue;
        }
        if (!s.roteiro) continue;
        const [a, z] = (s.horario || ['01:00', '04:00']).map((q) => time.parse(q));
        load(s.roteiro);
        plan.push({ id: s.id, b, path: s.roteiro, at: a, until: z });
      }
    }
  }
  function ok(p) {
    const m = mods[p.path]; if (!m) return false;
    if (m.can) { try { if (!m.can(sc(p)) ) return false; } catch (e) { console.warn('branch can', p.id, e.message); return false; } }
    return true;
  }
  const sc = (p) => ({ ...ctx, bus, ties, kit, est: events?.state, branches: api, branch: p.b, step: p });
  function start(p) {
    let run;
    try { run = mods[p.path].run(sc(p)); } catch (e) { console.error('branch', p.id, e); ran.add(p.id); return false; }
    ran.add(p.id);
    active = { p, run };
    if (events) events.state.hold = true;
    bus.emit('branch:start', p.id);
    return true;
  }
  const calm = () => !ui.modalOpen;

  function update(dt, simT) {
    clock += dt;
    for (const q of [...props]) if (q.prop.update(dt, simT)) { q.prop.dispose?.(); props.splice(props.indexOf(q), 1); }
    if (active) {
      const cur = active;
      if (cur.run.update(dt, simT)) { if (active === cur) { cur.run.dispose?.(); active = null; lastEnd = clock; if (events) events.state.hold = false; bus.emit('branch:end', cur.p.id); } }
      return;
    }
    whistle();
    if (!st.tutorialDone || !calm() || events?.active || ctx.narrative?.ringing || clock - lastEnd < 8 || clock < 20) return;
    const m = time.minutes;
    for (const p of [...plan]) {
      if (ran.has(p.id)) continue;
      if (m > p.until + 20) { plan.splice(plan.indexOf(p), 1); continue; }
      if (m < p.at || !ok(p)) continue;
      plan.splice(plan.indexOf(p), 1);
      if (start(p)) break;
    }
  }
  /** Weeks 3 and 4, after the morador was let stay: he whistles from the pavement when the Sun is about in the yard (a warning, no more). */
  function whistle() {
    const S = ctx.entity?.S; if (!S) return;
    const on = ['observacao', 'aproximacao', 'perseguicao'].includes(S.state);
    if (!on) { whistled = false; return; }
    if (whistled || st.week < 3 || !progression.hasFlag('r2:ficou')) return;
    whistled = true;
    ui.say('Lá fora', '(Dois assobios curtos, vindos da calçada.)', { seed: 61, ms: 3200 });
    bus.emit('sfx', 'sino_fantasma', { opts: { gain: 0.25 } });
    event('r2', 'assobio');
  }

  // ------------------------------------------------------------------ what the other systems ask
  /** The extra lines of the manager's 05:50 call from what the branches left (each is read once). */
  function callLines() {
    const out = [];
    for (const f of [...st.flags]) {
      if (!f.startsWith('fala:')) continue;
      const lines = D.falas?.[f.slice(5)]; progression.unflag(f);
      if (lines) out.push(...lines);
    }
    return out;
  }
  /** R3: the till was closed with the missing note. The player decides what to do with the difference; the report then shows what is left. */
  async function cashGap(res) {
    if (!progression.hasFlag('r3:nota') || done('r3', 'repor') || done('r3', 'registrar') || done('r3', 'ajustar')) return res;
    await offer('r3');
    res.drawerGap += 2000; res.divergence = Math.abs(res.drawerGap);
    progression.unflag('r3:nota');
    return res;
  }
  /** "Save now": what ran tonight (a script that was on starts again from its beginning). */
  function snapshotState() { return { ran: [...ran], active: active ? active.p.id : null, whistled, props: props.map((q) => ({ path: q.path, data: q.prop.data || null })) }; }
  function restoreState(s = {}, m = 0) {
    for (const id of s.ran || []) ran.add(id);
    plan = plan.filter((p) => !ran.has(p.id) && !(p.until + 20 < m));
    if (s.active && !plan.some((p) => p.id === s.active)) { /* it began before the save: it starts again if it can */
      const b = records.find((r) => r.id === s.active || (r.passos || []).some((q) => q.id === s.active));
      const s0 = b && (b.id === s.active ? { id: b.id, roteiro: b.roteiro, horario: b.horario } : b.passos.find((q) => q.id === s.active));
      if (s0?.roteiro) { ran.delete(s.active); const [a, z] = (s0.horario || ['01:00', '04:00']).map((q) => time.parse(q)); load(s0.roteiro); plan.push({ id: s.active, b, path: s0.roteiro, at: Math.min(a, m), until: Math.max(z, m + 5) }); }
    }
    whistled = Boolean(s.whistled);
    for (const q of s.props || []) load(q.path).then((mod) => { const prop = mod?.restoreProp?.(sc({ id: q.path, b: null, path: q.path }), q.data); if (prop) props.push({ path: q.path, prop }); });
  }
  /** Starts a script now, out of any plan (the extra Sunday). Returns its run, or null. */
  async function runNow(path, extra = {}) {
    const m = await load(path); if (!m) return null;
    const p = { id: path, b: null, path };
    const run = m.run({ ...sc(p), ...extra });
    return run;
  }

  const api = {
    records, byId, choose, event, offer, done, log, beginNight, update, callLines, cashGap, snapshotState, restoreState, runNow, apply,
    /** A script leaves something in the world (`prop`: update(dt, simT) -> true when it goes, dispose(), data) that outlives it; `path` is the script that can make it again after a saved night. */
    keep(prop, path) { props.push({ path, prop }); },
    nightName: (day) => D.noites?.[String(day)] || '',
    extraName: () => D.noites?.extra || '',
    get active() { return active ? active.p.id : null; },
    get busy() { return Boolean(active); },
    get plan() { return plan.map((p) => ({ id: p.id, at: p.at, until: p.until, loaded: Boolean(mods[p.path]), can: Boolean(mods[p.path]) && (!mods[p.path].can || (() => { try { return mods[p.path].can(sc(p)); } catch { return false; } })()) })); },
    reset() { if (active) { active.run.dispose?.(); active = null; } dropProps(); plan = []; ran = new Set(); if (events) events.state.hold = false; },
  };
  return api;
}
