// MedicationSystem: the white bottle with no name. It is the one direct and strong way back for the sanity
// (+30), and it costs: each dose in the same week heals 8 less and adds one more side effect, the effects last
// 3 game hours, and a third dose in one shift puts Heitor on the floor for an hour of the game.
//
// The bottle is found in the office closet (a leftover of someone's; no name, brand or dose: the chemist's is for
// the day off: `inventory:add { item: 'remedio' }` adds the bought pills). The five side effects (data/medication.json) are drawn by the seed of the week, in an order
// that stays the same inside the week: dose n has the first n of them.
import { mulberry32 } from '../rng.js';

export function createMedication(bus, { data, progression, sanity, time, inventory, interaction, world, ui, player, customers }) {
  const cfg = data.medication, F = cfg.falas;
  const st = { until: {}, nightDoses: 0, out: null, sleepy: 0, confirm: 0, blinkT: 0 };
  const weekOrder = (week) => {
    const r = mulberry32(progression.st.seed * 13 + week * 101 + 7), ids = cfg.efeitos.map((e) => e.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids;
  };
  const dosesThisWeek = () => progression.st.doses?.[progression.st.week] || 0;
  const pills = () => progression.st.frasco?.pilulas || 0;
  const active = (id) => (st.until[id] ?? -1) > time.minutes;
  const sync = () => {
    const i = inventory.slots.indexOf('frasco');
    if (pills() > 0 && i < 0) {
      const f = inventory.slots.indexOf(null);
      if (f < 0 && inventory.slots[3] === 'pilha') progression.st.pilhasExtra = (progression.st.pilhasExtra || 0) + 1;   // the battery waits in the bag
      inventory.slots[f >= 0 ? f : 3] = 'frasco';
    }
    if (pills() <= 0 && i >= 0) inventory.slots[i] = null;
    bus.emit('inventory:change');
  };

  /** One pill. Returns what happened, for the tests and the report. */
  function take() {
    if (st.out) return null;
    if (pills() <= 0) { bus.emit('hint', F.vazio); return null; }
    const week = progression.st.week, n = dosesThisWeek();
    const heal = Math.max(0, cfg.cura - cfg.toleranciaPorDose * n);
    const set = weekOrder(week).slice(0, Math.min(cfg.efeitos.length, n + 1));
    const until = time.minutes + cfg.efeitoHoras * 60;
    for (const id of set) st.until[id] = until;
    progression.st.doses = { ...(progression.st.doses || {}), [week]: n + 1 };
    progression.st.frasco.pilulas = pills() - 1;
    st.nightDoses++;
    sanity.add(heal, 'remedio');
    sync();
    bus.emit('sfx', 'frasco', {}); bus.emit('sfx', 'engolir', { opts: { delay: 0.9 } });
    bus.emit('medication:take', { heal, effects: set, dose: n + 1, night: st.nightDoses });
    bus.emit('hint', heal < cfg.cura * 0.4 ? F.fraco : F.toma);
    if (st.nightDoses > cfg.maxPorExpediente) passOut();
    else st.sense = { t: 4, text: F.efeito[set[set.length - 1]] };
    return { heal, effects: set, dose: n + 1 };
  }

  /** More than two doses in one shift: the floor of the shop for an hour of the game. */
  function passOut() {
    st.out = { t: 0, dur: 5.5, jumped: false };
    player.st.frozen = true;
    bus.emit('sfx', 'sono_pesado', { opts: { dur: 5, depth: 1 } });
    bus.emit('hint', F.apaga);
    progression.relatar('apagou');
    bus.emit('medication:out');
  }

  function update(dt) {
    if (st.sense) { st.sense.t -= dt; if (st.sense.t <= 0 && !st.out) { bus.emit('hint', st.sense.text); st.sense = null; } }
    if (st.out) {
      const o = st.out; o.t += dt;
      if (!o.jumped && o.t > o.dur * 0.45) { o.jumped = true; time.skip(cfg.apagaHoras * 60); customers.fastForward(); }
      if (o.t >= o.dur) { st.out = null; player.st.frozen = false; for (const id of Object.keys(st.until)) delete st.until[id]; bus.emit('hint', F.acorda); bus.emit('medication:woke'); }
    }
    const dz = Math.round(Math.min(1, st.sleepy / 0.55 * 0.8 + (st.out ? 0.2 : 0)) * 20) / 20;
    if (dz !== st.dz) { st.dz = dz; bus.emit('audio:drowsy', dz); }
    if (active('sono')) st.sleepy = Math.min(0.55, st.sleepy + dt * 0.035); else st.sleepy = Math.max(0, st.sleepy - dt * 0.2);
    if (st.blinkT > 0) st.blinkT = Math.max(0, st.blinkT - dt);
  }
  /** Pressing the button blinks: the eyelids lift. */
  function blink() { if (active('sono') && st.sleepy > 0.08) { st.sleepy = Math.max(0, st.sleepy - 0.35); st.blinkT = 0.18; } }

  // two digits swap now and then (a window of a third of a second every few seconds)
  const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return x >>> 0; };
  function scramble(text, t) {
    if (!active('valores') || !/\d{2}/.test(text)) return text;
    const slot = Math.floor(t / 2.6);
    if (t - slot * 2.6 > 0.55 || hash(slot) % 3 !== 0) return text;
    const idx = [...text].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
    const i = idx[hash(slot + 1) % (idx.length - 1)], j = idx[(idx.indexOf(i) + 1) % idx.length], a = [...text];
    [a[i], a[j]] = [a[j], a[i]];
    return a.join('');
  }

  /** Tapping on nothing with the bottle selected: the first tap asks, the second (within 2.5 s of game) takes it. */
  function use() {
    const now = time.minutes;
    if (st.asked !== undefined && now - st.asked <= 2.5 * 60 / time.secondsPerHour * 1.0 + 0.001 && now >= st.asked) { st.asked = undefined; take(); return true; }
    st.asked = now; bus.emit('hint', F.confirma);
    return true;
  }
  inventory.useHandlers.frasco = use;
  // a bottle bought at the chemist's on the day off: more pills in the same bottle
  bus.on('inventory:add', ({ item } = {}) => {
    if (item !== 'remedio') return;
    progression.st.frasco = { pilulas: (progression.st.frasco?.pilulas || 0) + (cfg.frasco.compra || cfg.frasco.comprimidos) };
    sync();
  });

  // the closet in the office: where the bottle is found (once per run)
  const P = world.posto.props || {};
  const shown = () => !progression.hasFlag('frasco:achado');
  const dressCloset = () => { P.armario?.setOpen?.(shown() ? 0 : 1); P.frasco?.setVisible?.(shown()); };
  dressCloset();
  interaction.register({
    id: 'armario-frasco', reach: 2.4, priority: 3,
    aim: () => ({ box: world.aimBox('frasco', 0.25) }),
    enabled: () => shown() && !inventory.carry,
    label: () => ({ text: 'Procurar no armário' }),
    tap: () => {
      progression.flag('frasco:achado');
      progression.st.frasco = { pilulas: cfg.frasco.comprimidos };
      bus.emit('sfx', 'porta_range', { opts: { dur: 0.9 } });
      P.armario?.setOpen?.(1); P.frasco?.setVisible?.(false);
      sync();
      bus.emit('hint', F.acha);
      bus.emit('medication:found');
    },
  });

  return {
    st, take, use, update, blink, scramble, sync, passOut,
    active, pills, dosesThisWeek,
    get activeEffects() { return cfg.efeitos.map((e) => e.id).filter(active); },
    get out() { return st.out; },
    /** 0..1 how far the black has come while Heitor passes out. */
    get fade() { const o = st.out; return o ? Math.min(1, o.t / (o.dur * 0.3), (o.dur - o.t) / (o.dur * 0.35)) : 0; },
    get slow() { return active('lentidao') ? cfg.efeitos.find((e) => e.id === 'lentidao').fator : 1; },
    get sleepy() { return st.sleepy; },
    get blinking() { return st.blinkT > 0; },
    beginNight() { dressCloset(); st.until = {}; st.nightDoses = 0; st.out = null; st.sleepy = 0; st.sense = null; if (!progression.st.frasco) progression.st.frasco = { pilulas: 0 }; sync(); },
  };
}
