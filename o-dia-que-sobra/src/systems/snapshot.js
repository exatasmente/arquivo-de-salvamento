// Snapshot: "save now" and the card as a file.
//
// 1. captureNight / restoreNight: the middle of a night, kept inside the run on the card (`run.snap`, see systems/save.js). Capture reads
//    what each system holds (the systems describe themselves: customers.describeAll, chores.describeChores, tasks.describeStock,
//    dayoff.snapshotState ...); restore opens the same night from its seed (shift.begin) and then lays the saved state over it, system by
//    system. The day off saves the same way (captureFolga / the dayoff's own state). Nothing here simulates.
//    What does not come back exact is listed in EXACTNESS_NOTES, which the exported file carries in its `notes`, for whoever debugs from it.
// 2. The file: exportCard builds a .json of the whole card with a header, `notes` and a readable `debug` block; parseCardFile checks one before
//    it touches anything (format, version, size, shape) and rebuilds the card from known fields only. Secrets stay ids ("s1", "s3"...), as
//    on the card; the debug block never carries an answer.
//
// Nothing here reads a real clock or draws a random number; the date in the file header is not part of the simulation.

export const CARD_FORMAT = 'o-dia-que-sobra.card';
export const FILE_VERSION = 1;
export const GAME_VERSION = '1.2.0';
export const SNAP_VERSION = 1;
export const MAX_FILE_BYTES = 512 * 1024;

/** What a saved moment does not give back exactly, and why. Goes into the exported file (`notes`). */
export const EXACTNESS_NOTES = [
  'Tutorial (night 1 before the lesson ends): not saved. The lesson is driven by the manager\'s calls and guided tasks whose state lives in closures; restoring half of it could leave the lesson stuck, so "save now" says so and refuses.',
  'After the till is closed (the night summary is waiting for an answer): not saved. The summary, the week balance and the card write are one async sequence; the end of the night already saves the card by itself.',
  'A scare event that is running (its script and its time): the script is a closure and cannot be described, so it is started again from its beginning (events.trigger). The events already seen, their counts and the rest of the plan do come back.',
  'Partial progress of a ladder climb, a breaker, a pump valve or a bag being carried is not kept (the work in the middle of a hold restarts); stains and the bathroom steps are kept.',
  'The way a walking customer was following (the list of waypoints) is planned again from where it stands, to the same goal, with the same nav: the path is the same, only the index along it is derived again.',
  'The speech bubble a customer was saying and the sounds in the air are not kept; a customer in a state that greets (placing the items) says its greeting again.',
  'Cars or customers of events (the empty car, the dark car) are not saved: their event is what brings them back.',
  'The change tray, the pump panel and any dialogue are modals: the pause cannot open while one is open, so nothing is ever saved inside one.',
];

const round = (v, k = 100) => Math.round(Number(v) * k) / k;
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CHORE_KINDS = ['mancha', 'lixo', 'lampada', 'disjuntor', 'bomba'];
const CLOSING_BREAKERS = ['cobertura', 'placa'];
const prim = (o) => { const out = {}; for (const [k, v] of Object.entries(o || {})) if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v; return out; };

// ---------------------------------------------------------------------------------------------- what can be saved now
/** Null when the moment can be saved, otherwise the reason (for the pause menu). */
export function whyNotNow(S) {
  if (!S.progression.st.tutorialDone) return 'Termine o tutorial antes de salvar.';
  if (!S.shift.open) return 'A noite já fechou.';
  if (S.cash.closed) return 'O caixa já foi fechado: a noite termina e salva sozinha.';
  if (S.medication.out) return 'Não dá para salvar apagado.';
  return null;
}

// ---------------------------------------------------------------------------------------------- capture
export function captureNight(S) {
  const { progression, time, sanity, inventory, medication, cash, player, tasks, chores, world, goals, customers, office, narrative, events, prep, entity } = S;
  const st = progression.st, p = player.st, hold = inventory.carry, br = world.posto.breakers;
  const doors = {}; for (const id of world.doorIds()) doors[id] = world.doorOpen(id) ? 1 : 0;
  const breakers = {}; if (br) for (const a of CLOSING_BREAKERS) breakers[a] = br.isOn(a);
  const shelves = {}; for (const row of world.shelves) if (row) shelves[row.id] = row.stock;
  const S0 = clone(entity.S);
  const sun = {
    S: S0, hunt: entity.S.hunts && entity.S.hunt ? entity.S.hunts.indexOf(entity.S.hunt) : -1,
    x: entity.ent.root.position.x, y: entity.ent.root.position.y, z: entity.ent.root.position.z, ry: entity.ent.root.rotation.y, visible: entity.ent.root.visible,
    stage: entity.ent.mask?.stage ?? 1, locked: [...entity.locked], nr: { goal: entity.nr.goal ? { x: entity.nr.goal.x, z: entity.nr.goal.z } : null, bang: entity.nr.bang },
  };
  return {
    v: SNAP_VERSION, type: 'noite',
    day: st.day, seed: S.nightSeed, baseSeed: S.baseSeed, minutes: round(time.minutes, 1000),
    night: clone(st.night), occurrences: clone(st.occurrences), pilhasExtra: st.pilhasExtra || 0,
    sanity: round(sanity.value, 1000),
    inv: { slots: inventory.slots.slice(0, 4).map((s) => s || null), sel: inventory.sel, flash: { on: inventory.flash.on, charge: round(inventory.flash.charge, 1000) }, carry: hold ? prim(hold) : null },
    med: { until: clone(medication.st.until), nightDoses: medication.st.nightDoses, sleepy: medication.st.sleepy, blinkT: medication.st.blinkT },
    cash: cash.state(),
    player: {
      x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, crouch: p.crouch, stamina: p.stamina, tired: p.tired, eye: p.eye, lift: p.lift, liftTo: p.liftTo,
      carryHeavy: p.carryHeavy, pushing: p.pushing, hideYaw: p.hideYaw ?? null, frozen: p.frozen,
    },
    tasks: tasks.list.filter((t) => t.kind !== 'carro' && t.kind !== 'cliente').map((t) => ({ id: t.id, text: t.text, done: t.done, failed: t.failed, kind: t.kind, prep: Boolean(t.prep), penalized: Boolean(t.penalized), paid: Boolean(t.paid) })),
    shelves, stock: tasks.describeStock(), chores: chores.describeChores(),
    world: { doors, shut: [...world.shut], breakers },
    goal: goals.key || null,
    prep: { punched: prep.punched }, call: narrative.callState(),
    office: { registered: clone(office.registered), incidents: clone(office.incidents) },
    events: { ...events.snapshotState(), active: events.active || null },
    recurring: [...(customers.nightRecurring || [])],
    customers: customers.describeAll(),
    sun,
    debug: debugBlock(S),
  };
}

/** The clock, for the "continue" line on the title: "02:15". */
export function clockText(minutes) {
  const d = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------- the readable summary
/** The state in words and numbers, for whoever reads the exported file. Nothing secret is in it. */
export function debugBlock(S) {
  const st = S.progression.st;
  if (S.state === 'dayoff' && S.dayoff && S.dayoff.state) {
    const d = S.dayoff.snapshotState ? S.dayoff.snapshotState() : {};
    return { modo: 'folga', semana: st.week, carteira: st.wallet, sanidade: S.dayoff.state.sanidade, relogioDaCasa: S.dayoff.clock, contas: d.contas, recadosOuvidos: d.heard, compras: d.compras, jogador: d.player, portas: d.doors?.target, pagoNaFolga: st.paidSum, contasPagas: st.billsPaid };
  }
  const { time, sanity, cash, player, inventory, tasks, customers, entity, events, prep, closing, goals, narrative } = S;
  const p = player.st, e = entity;
  const obj = typeof document !== 'undefined' ? document.getElementById('objective')?.textContent || '' : '';
  return {
    modo: 'noite', noite: st.day, semana: st.week, hora: time.text(), minutos: Math.round(time.minutes * 100) / 100, semente: S.nightSeed, sementeDoJogo: S.baseSeed,
    objetivo: obj, objetivoMarcado: goals.key || null,
    carteira: st.wallet, caixa: { aberto: cash.opened, fechado: cash.closed, fundo: cash.float, vendas: cash.sales, naGaveta: cash.real(), rasgadas: cash.torn },
    sanidade: { valor: Math.round(sanity.value * 100) / 100, estagio: sanity.stage },
    pontosDaNoite: st.night.pontos, desempenho: { ...st.night }, pontosDaSemana: st.weekPts,
    jogador: { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, olhar: Math.round(p.yaw * 100) / 100, agachado: p.crouch, escondido: e.hidden || null },
    maos: inventory.carry ? { ...prim(inventory.carry) } : null, bolsos: inventory.slots.slice(0, 4), lanterna: { ligada: inventory.flash.on, carga: Math.round(inventory.flash.charge) },
    fases: { preparacao: prep.on, fechamento: closing.on, ligacaoDoGerente: narrative.callState() },
    clientes: customers.list.filter((c) => c.kind === 'car' || c.kind === 'walk').map((c) => ({
      id: c.id, tipo: c.kind, nome: c.name, estado: c.state, bomba: c.pump || null, concluido: Boolean(c.done), idade: Math.round((c.age || 0) * 10) / 10, paciencia: c.patience > 1e8 ? null : c.patience,
      pedido: c.kind === 'car' ? { combustivel: c.fuel, valor: c.value, digitado: c.typed, abastecidoEmCentavos: Math.round(c.cents || 0), abastecendo: Boolean(c.fueling), bicoNoTanque: Boolean(c.nozzleIn), pedidoFeito: Boolean(c.ordered) } : { itens: (c.prods || []).map((q) => ({ nome: q.nome, passado: Boolean(q.done), naMao: Boolean(q.taken) })), escaneados: c.scanned, total: c.total },
      notas: c.bills, perna: c.legI ?? null, naPerna: c.atLeg ?? null, veiculo: c.veh ? { estado: c.veh.state, s: Math.round(c.veh.s * 10) / 10, vel: Math.round(c.veh.speed * 100) / 100 } : null,
    })),
    tarefasAbertas: tasks.list.filter((t) => !t.done).map((t) => ({ id: t.id, texto: t.text, tipo: t.kind, falhou: Boolean(t.failed) })),
    tarefasFeitas: tasks.list.filter((t) => t.done).length,
    sol: { estado: e.state, x: Math.round(e.ent.root.position.x * 10) / 10, z: Math.round(e.ent.root.position.z * 10) / 10, visivel: e.ent.root.visible, distancia: Math.round(Math.hypot(e.ent.root.position.x - p.x, e.ent.root.position.z - p.z) * 10) / 10, alvo: e.S.target || null, tempo: Math.round((e.S.t || 0) * 10) / 10 },
    evento: events.active || null, planoDeEventos: events.plan,
  };
}

// ---------------------------------------------------------------------------------------------- restore
/**
 * Lays a saved moment over a night that shift.begin has just opened from the same seed (the game does that first).
 * Returns { notes }: what did not come back exact this time, for the player's line.
 */
export function restoreNight(S, snap) {
  const { progression, time, sanity, inventory, medication, cash, player, tasks, chores, world, goals, customers, office, narrative, events, prep, closing, entity, bus } = S;
  const notes = [];
  const m = clamp(Number(snap.minutes) || 0, -60, 360);
  const st = progression.st;
  const noNew = time.parse(S.data.progression.expediente.semClientesApos);

  // 1. the phase of the night the clock was in
  if (m >= 0) prep.end();
  if (m >= noNew) { customers.enable(false); closing.start(); }

  // 2. the people and the cars: each is made from its seed and then laid over with what it was doing (the clock is still early here, so the
  //    late-night rule does not turn them away)
  let byOld = new Map();
  if (snap.customers && snap.customers.list) {
    const r = customers.restoreAll(snap.customers);
    byOld = r.map;
    if (r.lost) notes.push(`${r.lost} ${r.lost === 1 ? 'cliente não voltou' : 'clientes não voltaram'}.`);
  }

  // 3. the clock; the night's plan: what was due by now already raised its chores (they are in the saved list)
  time.set(m);
  const plan = tasks.plan;
  while (plan.length && plan[0].at <= m) plan.shift();

  // 4. the task list: same ids first, then the chores of the night raised again on the same target
  const resolveTask = (t) => {
    if (t.kind === 'repor') {
      const sh = [...tasks.shelves.values()].find((x) => 'repor-' + x.id === t.id);
      if (sh) { sh.done = true; sh.row.setStock(sh.row.slots); }
    } else if (t.id === 'banheiro') chores.stopBathroom();
    else chores.resolve(t.id);
    tasks.done(t.id);
  };
  const apply = (t, s) => {
    if (s.done && !t.done) resolveTask(t);
    t.failed = Boolean(s.failed) && !t.done; t.penalized = Boolean(s.penalized); t.paid = Boolean(s.paid); t.text = s.text; t.prep = Boolean(s.prep);
  };
  const saved = snap.tasks || [], seen = new Set();
  for (const s of saved) {
    let t = tasks.list.find((x) => x.id === s.id);
    if (!t && CHORE_KINDS.includes(s.kind) && !s.done) { chores.respawn(s.id, s.kind); t = tasks.list.find((x) => x.id === s.id); if (!t) notes.push(`a tarefa ${s.id} não voltou no mesmo lugar.`); }
    if (!t && s.id === 'banheiro' && !s.done) { tasks.addBathroom(snap.chores?.bathroom?.side || 'm'); t = tasks.list.find((x) => x.id === s.id); }
    if (!t && (s.done || !['repor', ...CHORE_KINDS].includes(s.kind))) { if (s.id !== 'telefone' || snap.call?.called) { tasks.add(s.id, s.text, s.kind); t = tasks.list.find((x) => x.id === s.id); } }
    if (t) { seen.add(t); apply(t, s); }
  }
  for (const t of [...tasks.list]) {          // a chore the replay raised that the saved night did not have
    if (seen.has(t) || t.kind === 'carro' || t.kind === 'cliente' || !['repor', ...CHORE_KINDS].includes(t.kind)) continue;
    resolveTask(t); tasks.list.splice(tasks.list.indexOf(t), 1);
  }
  narrative.restoreCall(snap.call || {});
  chores.restoreChores(snap.chores || {});
  tasks.restoreStock(snap.stock || {});
  bus.emit('tasks:change');

  // 5. the till, the pocket, the hands
  cash.restore(snap.cash || {});
  const inv = snap.inv || {};
  for (let i = 0; i < 4; i++) inventory.slots[i] = inv.slots?.[i] || null;
  inventory.flash.charge = clamp(Number(inv.flash?.charge) || 0, 0, inventory.flash.max);
  inventory.flash.on = Boolean(inv.flash?.on) && inventory.flash.charge > 0;
  inventory.select(clamp(Number(inv.sel) || 0, 0, 3) - inventory.sel);
  const cr = inv.carry;
  if (cr) {
    let got = false;
    if (cr.kind === 'copo') { inventory.setCarry({ kind: 'copo' }, 'copo'); got = true; }
    else if (cr.kind === 'caixa') { const rec = tasks.boxes.get(cr.n); if (rec) { inventory.setCarry({ kind: 'caixa', n: rec.n, produto: rec.produto }, 'caixa', { label: rec.n }); got = true; } }
    else if (cr.kind === 'carrinho') got = true;           // (tasks.restoreStock put the hands on the cart)
    else got = chores.restoreHands(cr) || customers.restoreCarry(cr, byOld);
    if (!got) notes.push(`o que estava nas mãos (${cr.kind}) não voltou.`);
  }
  bus.emit('inventory:change');

  // 6. the world: shelves, doors, the shop lock, the breakers of the closing
  for (const row of world.shelves) if (row && snap.shelves && snap.shelves[row.id] !== undefined) row.setStock(clamp(Math.floor(Number(snap.shelves[row.id]) || 0), 0, row.slots));
  for (const sh of tasks.shelves.values()) if (!sh.done) sh.units = sh.row.stock;
  for (const [id, v] of Object.entries(snap.world?.doors || {})) { if (world.doors[id]) { world.setDoor(id, v ? 1 : 0); world.state.doors[id] = v ? 1 : 0; } }
  for (const id of snap.world?.shut || []) if (world.doors[id]) { world.setDoor(id, 0); world.state.doors[id] = 0; world.shut.add(id); }
  const br = world.posto.breakers;
  if (br) for (const [a, on] of Object.entries(snap.world?.breakers || {})) if (CLOSING_BREAKERS.includes(a) && !chores.isTripped(a)) br.setOn(a, Boolean(on));

  // 7. the numbers: sanity, pills, the night's score, the register's report, what the events had done
  sanity.reset(clamp(Number(snap.sanity), 0, 100), S.nightSeed);
  medication.st.until = {}; Object.assign(medication.st.until, snap.med?.until || {}); medication.st.nightDoses = Number(snap.med?.nightDoses) || 0;
  medication.st.sleepy = Number(snap.med?.sleepy) || 0; medication.st.blinkT = Number(snap.med?.blinkT) || 0; medication.sync();
  Object.assign(st.night, snap.night || {}); st.occurrences = Array.isArray(snap.occurrences) ? snap.occurrences : [];
  st.pilhasExtra = Number(snap.pilhasExtra) || 0;
  office.registered.length = 0; office.registered.push(...(snap.office?.registered || []));
  office.incidents.length = 0; office.incidents.push(...(snap.office?.incidents || []));
  events.restoreState(snap.events || {}, m);
  customers.dropRecurringBefore(m);
  for (const n of snap.recurring || []) if (!customers.nightRecurring.includes(n)) customers.nightRecurring.push(n);
  prep.setPunched(snap.prep?.punched);

  // 8. the player and the marked goal
  const pl = snap.player || {};
  if (Number.isFinite(pl.x) && Number.isFinite(pl.z)) {
    player.place({ x: pl.x, z: pl.z }, Number(pl.yaw) || 0);
    const q = player.st;
    q.pitch = clamp(Number(pl.pitch) || 0, -1.35, 1.35); q.crouch = Boolean(pl.crouch); q.stamina = clamp(Number(pl.stamina) || 1, 0, 1); q.tired = Boolean(pl.tired);
    if (Number.isFinite(pl.eye)) q.eye = pl.eye;
    q.lift = Number(pl.lift) || 0; q.liftTo = Number(pl.liftTo) || 0; q.carryHeavy = Boolean(pl.carryHeavy); q.pushing = Boolean(pl.pushing) || q.pushing; q.frozen = Boolean(pl.frozen);
    q.hideYaw = Number.isFinite(pl.hideYaw) ? pl.hideYaw : undefined;
  }
  if (snap.goal) { try { goals.select(snap.goal); } catch { /* the goal's task is gone */ } }

  // 9. the Sun: its machine, where it stands and where it is going; the scare that was running starts again
  const sun = snap.sun;
  if (sun && sun.S) {
    const es = entity.S;
    for (const k of Object.keys(sun.S)) if (k !== 'lastStep') es[k] = sun.S[k];          // (lastStep is a stamp of the page's own sim clock: it starts over)
    if (Array.isArray(es.hunts)) es.hunt = sun.hunt >= 0 ? es.hunts[sun.hunt] : null; else es.hunt = null;
    entity.ent.root.position.set(sun.x, sun.y, sun.z); entity.ent.root.rotation.y = sun.ry; entity.ent.root.visible = Boolean(sun.visible);
    entity.ent.setStage(sun.stage || 1);
    entity.locked.clear(); for (const d of sun.locked || []) entity.locked.add(d);
    entity.nr.goal = null; entity.nr.pts = null; entity.nr.i = 0; entity.nr.t = 0; entity.nr.sig = ''; entity.nr.bang = Number(sun.nr?.bang) || 0;    // (the way is planned again from where it stands)
  }
  if (snap.events?.active && snap.events.active !== 'turno-dobrado') { try { events.trigger(snap.events.active); notes.push(`o evento ${snap.events.active} recomeçou do início.`); } catch { /* it cannot start now */ } }

  if (m >= 0 && cash.opened && m < noNew) S.ui.setObjective(null);          // (the line that asks for the till was the one the midnight wrote)
  S.refresh?.();
  return { notes };
}

// ---------------------------------------------------------------------------------------------- the card as a file
/** The card as the browser holds it (this game's key), or null. */
export function readStoredCard(storage, key) {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function fileName(debug = false, d = new Date()) {
  const stamp = d.toISOString().slice(0, 10);
  return `o-dia-que-sobra-cartao${debug ? '-debug' : ''}-${stamp}.json`;
}

/** The text of the exported file: a header, then the whole card. The date is the file's, not the simulation's. */
export function buildExport(card, { debug = false, seed = 0, now = new Date(), state = null } = {}) {
  // `state`: the readable summary of the moment (live, from the pause) or, from the title, the one that was saved with the moment
  const block = state || card?.run?.snap?.debug || null;
  return JSON.stringify({ format: CARD_FORMAT, fileVersion: FILE_VERSION, game: 'O Dia que Sobra', gameVersion: GAME_VERSION, exportedAt: now.toISOString(), debugCard: Boolean(debug), seed, notes: EXACTNESS_NOTES, debug: block, card }, null, 1);
}

export function canShareFile() {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share || typeof File === 'undefined') return false;
    return navigator.canShare({ files: [new File(['{}'], 'cartao.json', { type: 'application/json' })] });
  } catch { return false; }
}

/** Starts a download of the text as a file. Works on the phone's browser too (an anchor with `download`). */
export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  return true;
}

/** The share sheet with the file in it (a phone that offers it). Resolves true when it was shared or closed by the person, false when it is not possible. */
export async function shareText(name, text) {
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: 'Cartão de memória · O Dia que Sobra' });
    return true;
  } catch (e) { return e && e.name === 'AbortError'; }
}

/** Opens the file chooser. Resolves { name, size, text } or null when the person closes it. */
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
    let done = false;
    const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return finish(null);
      if (f.size > MAX_FILE_BYTES) return finish({ name: f.name, size: f.size, text: null });
      try { finish({ name: f.name, size: f.size, text: await f.text() }); } catch { finish({ name: f.name, size: f.size, text: null }); }
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

// ---- reading a file: nothing of it is trusted. A card is rebuilt from the fields this game knows.
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,23}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** A deep copy with limits: depth, node count, text length, no odd keys, numbers finite. Returns undefined when something is out of bounds. */
function safeClone(v, budget = { n: 0 }, depth = 0) {
  if (++budget.n > 40000 || depth > 9) throw new Error('limit');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('number'); return v; }
  if (typeof v === 'string') { if (v.length > 600) throw new Error('text'); return v; }
  if (Array.isArray(v)) { if (v.length > 2000) throw new Error('list'); return v.map((x) => safeClone(x, budget, depth + 1)); }
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) { if (BAD_KEYS.has(k)) throw new Error('key'); out[k] = safeClone(v[k], budget, depth + 1); }
    return out;
  }
  throw new Error('type');
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

/**
 * Checks and rebuilds a card from the text of a file. { ok: true, card, header } or { ok: false, reason } (pt-BR, for the screen).
 * `size` is the byte size reported by the file (the text is measured too).
 */
export function parseCardFile(text, size = 0, { lastNight = 24 } = {}) {
  if (typeof text !== 'string' || size > MAX_FILE_BYTES || text.length > MAX_FILE_BYTES) return { ok: false, reason: 'O arquivo é grande demais para ser um cartão (limite de 512 KB).' };
  let f;
  try { f = JSON.parse(text); } catch { return { ok: false, reason: 'O arquivo não é um JSON válido.' }; }
  if (!isObj(f) || f.format !== CARD_FORMAT) return { ok: false, reason: 'Este arquivo não é um cartão de O Dia que Sobra.' };
  if (!Number.isInteger(f.fileVersion) || f.fileVersion < 1) return { ok: false, reason: 'O arquivo não diz a versão do formato.' };
  if (f.fileVersion > FILE_VERSION) return { ok: false, reason: 'O arquivo vem de uma versão mais nova do jogo. Atualize a página e tente de novo.' };
  const c = f.card;
  if (!isObj(c) || c.v !== 1) return { ok: false, reason: 'O cartão dentro do arquivo é de outro formato.' };
  try {
    const card = { v: 1, run: null, nights: {}, record: { best: 0, nights: 0 }, secrets: [], endings: [], meta: { intro: Boolean(c.meta && c.meta.intro) } };
    if (c.run !== null && c.run !== undefined) {
      if (!isObj(c.run)) throw new Error('run');
      const r = safeClone(c.run);
      if (!Number.isInteger(r.day) || r.day < 1 || r.day > lastNight + 1) throw new Error('run.day');
      if (!Number.isInteger(r.week) || r.week < 1 || r.week > 5) throw new Error('run.week');
      if (typeof r.wallet !== 'number') throw new Error('run.wallet');
      if (r.snap !== undefined) {
        const s = r.snap;
        if (!isObj(s) || s.v !== SNAP_VERSION) throw new Error('snap.v');
        if (s.day !== r.day) throw new Error('snap.day');
        if (s.type === 'folga') { if (!isObj(s.dayoff) || !Array.isArray(s.dayoff.contas)) throw new Error('snap.shape'); }
        else {
          if (typeof s.minutes !== 'number' || s.minutes < -60 || s.minutes > 360) throw new Error('snap.day');
          if (!Array.isArray(s.tasks) || !isObj(s.cash) || !isObj(s.inv) || !isObj(s.player) || !isObj(s.customers) || !Array.isArray(s.customers.list)) throw new Error('snap.shape');
        }
      }
      card.run = r;
    }
    if (c.nights !== undefined) {
      if (!isObj(c.nights)) throw new Error('nights');
      for (const k of Object.keys(c.nights)) { const d = Number(k); if (Number.isInteger(d) && d >= 1 && d <= lastNight && isObj(c.nights[k])) card.nights[d] = safeClone(c.nights[k]); }
    }
    if (c.record !== undefined) {
      if (!isObj(c.record)) throw new Error('record');
      card.record = { best: Number(c.record.best) || 0, nights: Number(c.record.nights) || 0 };
    }
    if (c.secrets !== undefined) {
      if (!Array.isArray(c.secrets) || c.secrets.length > 64) throw new Error('secrets');
      card.secrets = [...new Set(c.secrets.filter((s) => typeof s === 'string' && ID.test(s)))];
    }
    if (c.endings !== undefined) {
      if (!Array.isArray(c.endings)) throw new Error('endings');
      card.endings = [...new Set(c.endings.filter((e) => Number.isInteger(e) && e >= 1 && e <= 5))];
    }
    return { ok: true, card, header: { gameVersion: String(f.gameVersion || '').slice(0, 24), exportedAt: String(f.exportedAt || '').slice(0, 40), debug: Boolean(f.debugCard) } };
  } catch (e) {
    return { ok: false, reason: `O cartão do arquivo está quebrado (${String(e.message).slice(0, 40)}).` };
  }
}

/** A line about what a card holds, for the confirmation screen. */
export function describeCard(card) {
  const parts = [];
  const r = card.run;
  if (r) {
    const week = r.week;
    if (r.snap && r.snap.type === 'folga') parts.push(`Salvo no meio da FOLGA da semana ${week - 1 || 1}`);
    else if (r.snap) parts.push(`Salvo no meio da NOITE ${r.day} (semana ${week}, ${clockText(r.snap.minutes)})`);
    else if (r.fase === 'folga') parts.push(`FOLGA da semana ${week}`);
    else if (r.fase === 'fim') parts.push('O FIM da campanha');
    else parts.push(`Começa na NOITE ${r.day} (semana ${week})`);
  } else parts.push('Sem noite em andamento');
  parts.push(`${Object.keys(card.nights).length} noites guardadas, ${card.secrets.length} segredos, ${card.endings.length} de 5 finais`);
  return parts.join(' · ');
}

/** Writes a checked card to the storage. True when it was written. */
export function writeCard(storage, key, card) {
  try { storage.setItem(key, JSON.stringify(card)); return true; } catch { return false; }
}
