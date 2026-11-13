// EventSystem: loads data/events.json and runs the events (never written into the main logic).
// Each record says when it may happen: week, hour window, chance, conditions (sanity, where the player is,
// what is on the task list), what it depends on, and whether it repeats. Its script
// (src/systems/events/<id>.js) does the happening. Three kinds, all by condition and never by a bare draw:
//   story    `fixoNoite` is the night (a number, or a list of nights): it happens at the start of its window, when the conditions allow;
//   drawn    a roll at the start of the night (the seed) puts it at an hour of its window;
//   repeat   `repetivel` with `intervaloMin` and `maxPorNoite` (the hallucinations): while the conditions hold,
//            it is rolled again every few game minutes, and the weaker the sanity the likelier the roll.
// A record with no `roteiro` is registered for another system (`gerente-mudo` is the narrative's silent 05:50 call) and never runs.
// `gatilho: 'shift'`: the shift starts it (`trigger(id)`), never the clock (`turno-dobrado`, the 05:59 of the last night).
// `?event=<id>` forces one to run shortly after the night opens, ignoring its conditions.
import { mulberry32 } from '../rng.js';
import { createKit } from './events/kit.js';

const STAGE_ODDS = [0, 0.6, 1, 1.5, 2.2, 2.5];   // by sanity stage: how much likelier a hallucination is
const RETRY_MIN = 8;                              // game minutes between rolls of a repeating event
const GAP = 16;                                   // real seconds of quiet between two events

export async function createEvents(bus, ctx) {
  const { data, progression, time, sanity, world, player } = ctx;
  const records = data.events;
  const scripts = {}, mods = {};   // `mods` holds a script once it has loaded: starting an event never waits for a promise
  const est = { placa: 0, fantasmas: 0, naoSair: null };   // what the scripts share between nights' events
  let plan = [];       // { ev, at (game minutes), pool, next, count, forced }
  let active = null;   // { ev, run }
  let readyAt = null;  // real seconds when the tutorial was done
  let clock = 0, forced = null, lastEnd = -99, rr = mulberry32(1), kit = null;
  const counts = {};   // runs this night, by id

  bus.on('tutorial:done', () => { readyAt = clock; });

  async function load(ev) {
    if (!ev.roteiro) return null;
    if (!scripts[ev.id]) scripts[ev.id] = import(ev.roteiro.replace(/^events\//, './events/')).then((m) => (mods[ev.id] = m), (e) => { console.warn('event script', ev.id, e.message); return (mods[ev.id] = null); });
    return scripts[ev.id];
  }

  function schedule({ day, seed, force, tutorialDone }) {
    plan = []; clock = 0; readyAt = tutorialDone ? 0 : null; forced = force || null; lastEnd = -99;
    for (const k of Object.keys(counts)) delete counts[k];
    rr = mulberry32(seed * 977 + day * 31 + 5);
    kit = createKit(ctx);
    est.placa = est.placaBase(day);
    // the stickers the player has already seen on earlier nights stay on the walls
    const stk = ctx.world.posto.stickers;
    if (stk) { stk.hideAll(); for (const f of progression.st.flags) if (f.startsWith('adesivo:')) stk.show(f.slice(8), true); }
    for (const ev of records) {
      if (!ev.roteiro) continue;
      if (ev.semanaMin > progression.st.week && forced !== ev.id) continue;
      if (!ev.repetivel && progression.hasSeen(ev.id) && forced !== ev.id) continue;
      load(ev);
      if (ev.gatilho === 'shift') continue;
      const [a, b] = ev.horario.map((s) => time.parse(s));
      const roll = rr(), draw = rr(), story = [].concat(ev.fixoNoite ?? []).includes(day);
      if (forced === ev.id) { plan.push({ ev, at: 0, forced: true }); continue; }
      if (ev.repetivel) { plan.push({ ev, at: a, until: b, pool: true, next: a, count: 0 }); continue; }
      const at = story ? a : a + draw * (b - a);   // a story event happens at the start of its window
      if (story || roll < ev.chance) plan.push({ ev, at, until: b });
    }
  }
  function ok(ev, p) {
    if (p && p.forced) return true;
    const c = ev.condicoes || {};
    if (c.sanidadeMax !== undefined && sanity.value > c.sanidadeMax) return false;
    if (c.sanidadeMin !== undefined && sanity.value < c.sanidadeMin) return false;
    for (const d of [...(ev.depende || []), ...(c.depende || [])]) if (!progression.hasSeen(d)) return false;
    for (const n of c.naoAntes || []) if (n === 'tutorial' && !progression.st.tutorialDone) return false;
    if (c.jogadorEm) { const a = world.areaAt(player.st.x, 1, player.st.z); if (!a || !c.jogadorEm.includes(a.id) && !(a.id.startsWith('banheiro') && c.jogadorEm.includes('banheiros'))) return false; }
    if (c.tarefa && !ctx.tasks.pending().some((t) => t.kind === c.tarefa)) return false;
    if (c.flag && !progression.hasFlag(c.flag)) return false;
    if (c.semFlag && progression.hasFlag(c.semFlag)) return false;
    if (c.camera || c.folga) return false;   // needs a later phase
    if (ev.maxPorNoite && (counts[ev.id] || 0) >= ev.maxPorNoite) return false;
    return true;
  }
  /** Not while the player is in a dialogue, a menu or the middle of a payment. */
  const calm = () => !ctx.ui.modalOpen;

  function start(p) {
    const mod = mods[p.ev.id];
    if (!mod || active) return false;
    counts[p.ev.id] = (counts[p.ev.id] || 0) + 1;
    let run;
    try { run = mod.run({ ...ctx, event: p.ev, bus, kit, est, rng: mulberry32(progression.st.seed * 131 + progression.st.day * 17 + p.ev.id.length * 7 + (counts[p.ev.id] || 0)), forced: Boolean(p.forced) }); } catch (e) { console.error('event', p.ev.id, e); return false; }
    active = { ev: p.ev, run };
    bus.emit('event:start', p.ev.id);
    return true;
  }
  function update(dt, t) {
    clock += dt;
    if (active) {
      const cur = active;   // an event may end the night (an ending) and reset this system from inside its own update
      if (cur.run.update(dt, t)) { if (active === cur) { cur.run.dispose?.(); bus.emit('event:end', cur.ev.id); active = null; lastEnd = clock; } }
      return;
    }
    if (readyAt === null || !calm()) return;
    const wait = forced ? 3 : 25;
    if (clock - readyAt < wait || clock - lastEnd < GAP) return;
    const m = time.minutes, stage = sanity.stage;
    for (const p of plan) {
      if (m < p.at || (p.until !== undefined && m > p.until + 30) || !mods[p.ev.id] || !ok(p.ev, p)) continue;
      if (p.pool) {
        if (m < p.next) continue;
        p.next = m + RETRY_MIN;
        if (rr() >= p.ev.chance * STAGE_ODDS[stage]) continue;
        p.count++; p.next = m + (p.ev.intervaloMin || 40);
      } else plan.splice(plan.indexOf(p), 1);
      start(p);
      break;
    }
  }
  /** Starts a `gatilho: 'shift'` event now, whatever else is going on (the last night's 05:59). Returns true when it started. */
  function trigger(id) {
    const ev = records.find((e) => e.id === id); if (!ev || !ev.roteiro) return false;
    if (active) { active.run.dispose?.(); bus.emit('event:end', active.ev.id); active = null; }
    return start({ ev, forced: true });
  }
  /** The sign's smile: wider every night, and once more for good after the night it was seen. */
  est.placaBase = (day) => Math.min(0.9, 0.07 * (day - 1) + (progression.hasSeen('a-placa') ? 0.3 : 0));
  return {
    schedule, update, trigger, state: est, get run() { return active ? active.run : null; }, get active() { return active ? active.ev.id : null; },
    get plan() { return plan.map((p) => ({ id: p.ev.id, at: Math.round(p.at), pool: Boolean(p.pool) })); },
    get placaSorriso() { return est.placa; },
    reset() { if (active) { active.run.dispose?.(); active = null; } plan = []; est.naoSair = null; },
  };
}
