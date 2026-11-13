// DayOff: the playable day off. Heitor wakes up at home at night (the day off is a night too), and has a few
// minutes to pay the bills on the table, hear the answering machine, buy medicine and batteries at the
// neighbourhood pharmacy, and sleep, which ends the day off and gives sanity back.
//
// const dayoff = createDayOff(bus, { r, input, ui, audio, data, rng });
//   r:      the render (src/render.js); the scene is borrowed while the day off lasts
//   input:  the input layer; the day off samples it itself
//   ui:     the UI manager (prompt, objective, say, dialogue, menu, toast, setFx)
//   audio:  unused, sounds go out as bus 'sfx' / 'loop' like the rest of the game (kept for the contract)
//   data:   the game data; `data.dayoff` is data/dayoff.pt-BR.json (fetched by this module when absent)
//   rng:    unused, everything here comes from the seed (mulberry32 over `seed`)
//
// dayoff.start(info) -> Promise      info: { week, day, wallet, contas: [{ id, valor }], sanidade, seed? }
//   Hides what the render has in the scene, builds (or reuses) the house at `seed` (default week * 31 + day), puts
//   Heitor in the bedroom and takes over `input`. Values are in reais, like the wallet.
// dayoff.update(dt, t)   one fixed step. While `dayoff.active` the game calls ONLY update and draw (no player, no
//                        interaction, no input.sample, no ui.setFx of the night): the day off samples the input, runs
//                        the modals (`ui.handle` of the presses) and the HUD line itself.
// dayoff.draw()          camera, lights, render.draw() (call it instead of the game's own draw while `active`)
// dayoff.stop()          silent cleanup (restores the scene), idempotent; end() does it before emitting 'dayoff:end'
// dayoff.active, dayoff.seed, dayoff.state (read-only snapshot: wallet, contas, recados, compras, sanidade)
//
// Bus, in:   'money:change' { wallet }, 'money:refused' { motivo }
// Bus, out:  'money:pay' { valor, motivo }      (motivo = the conta id; the answer must come in the same call)
//            'money:spend' { valor, item }      (item: 'remedio' | 'pilha')
//            'inventory:add' { item }           (after the purchase went through)
//            'dayoff:event' { id: 'secretaria', week }   (the manager's message was played to the end)
//            'dayoff:pause'                      (Esc in play mode; the game decides)
//            'sfx' ..., 'loop' ...               (like the night)
//            'dayoff:end' { sanidade, ganho, pagas: [id], deixadas: [id], recados: [id], compras: { remedio, pilha }, week, day }
// Sanity: `sanidade` of the end is the final value (0..100): the one at the start, plus data.regras.sanidadeDormir,
// minus the cost of the `secretaria` message (data.regras.sanidadeSecretaria), clamped.
import { createPlayer } from './player.js';
import { createInteraction } from './interaction.js';
import { buildCasa } from '../scenes/casa.js';
import { mulberry32 } from '../rng.js';
import { money, clamp, fill } from '../util.js';

const clampWeek = (w) => Math.max(1, Math.min(4, Math.round(w) || 1));

export function createDayOff(bus, { r, input, ui, data, rng } = {}) {
  void rng;
  const THREE = r.THREE;
  let text = data?.dayoff || null, textP = null;
  const loadText = () => {
    if (text) return Promise.resolve(text);
    textP ||= fetch(new URL('../../data/dayoff.pt-BR.json', import.meta.url)).then((x) => x.json()).then((j) => (text = j));
    return textP;
  };
  loadText().catch(() => {});   // warm up; start() waits for it anyway

  let active = false, casa = null, casaSeed = null, player = null, interaction = null, seed = 1, rand = mulberry32(1);
  let clock = 0, wallet = 0, info = null, sanidade = 100, sleeping = null, fadeIn = 1, busy = false;
  let contas = [], heard = new Set(), recados = [], compras = { remedio: 0, pilha: 0 };
  let hidden = [], timers = [], ring = null, lastObj = '', sayN = 0, ended = false;
  const doorTarget = {}, doorWait = {}, doorState = {};
  const occl = [];
  const box = new THREE.Box3();
  let lastMoney = null;   // set by the listeners while a payment is in flight

  // the player and the interaction run on a bus that only lets sounds out: the night's bus has handlers for
  // 'interact:none' (use the selected item) that must not run at home
  const quiet = { emit(ev, ...a) { if (ev === 'sfx') bus.emit(ev, ...a); }, on() { return () => {}; }, off() {} };
  const T = () => text;
  const sfx = (n, o = {}) => bus.emit('sfx', n, o);
  const after = (s, fn) => timers.push({ at: clock + s, fn });
  const self = (t) => ui.say('Heitor', t, { seed: 41 + (sayN++), self: true });
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];

  bus.on('money:change', (d) => { if (d && typeof d.wallet === 'number') { wallet = d.wallet; if (lastMoney) lastMoney.changed = true; } });
  bus.on('money:refused', () => { if (lastMoney) lastMoney.refused = true; });

  /** Pays or spends through the bus; true when the money went. Refuses at once when the wallet is short. */
  function transact(kind, payload) {
    if (wallet + 1e-9 < payload.valor) return false;
    lastMoney = { changed: false, refused: false };
    bus.emit(kind, payload);
    const res = lastMoney; lastMoney = null;
    if (res.refused) return false;
    if (!res.changed) wallet = Math.round((wallet - payload.valor) * 100) / 100;   // the game did not answer: assume it went
    return true;
  }

  // ------------------------------------------------------------------ the HUD line
  const unpaid = () => contas.filter((c) => !c.paga);
  const unheard = () => recados.filter((m) => !heard.has(m.id));
  function objective() {
    const o = T().objetivo, falta = [];
    if (unpaid().length) falta.push(o.contas);
    if (unheard().length) falta.push(o.recados);
    if (!visitedPharmacy) falta.push(o.farmacia);
    falta.push(o.cama);
    return falta.length === 1 ? `${money(wallet * 100)} · ${o.tudo}` : `${money(wallet * 100)} · ${fill(o.falta, { lista: falta.join(' · ') })}`;
  }
  let visitedPharmacy = false;

  // ------------------------------------------------------------------ lights (the 8 closest to Heitor)
  function applyLights() {
    const N = r.POINT_LIGHTS, px = player.st.x, pz = player.st.z, py = player.st.eye;
    const cands = casa.lights.filter((l) => l.on && l.level > 0.02).map((l) => ({ l, d: Math.hypot(l.pos[0] - px, l.pos[2] - pz) + Math.abs(l.pos[1] - py) * 0.3 })).sort((a, b) => a.d - b.d).slice(0, N);
    for (let i = 0; i < N; i++) {
      const c = cands[i];
      if (c) r.point(i, { pos: c.l.pos, color: new THREE.Color(c.l.color).multiplyScalar(c.l.level * 1.1), range: c.l.range });
      else r.point(i, { pos: [0, -50, 0], color: new THREE.Color(0, 0, 0), range: 1 });
    }
    r.light({ ...casa.mood });
    r.spot({ on: false });
  }

  // ------------------------------------------------------------------ doors
  function setDoor(id, k) { doorTarget[id] = k; doorWait[id] = false; }
  function stepDoors(dt) {
    const g = player.st;
    for (const id of Object.keys(casa.doors)) {
      const col = casa.doors[id].collider;
      const inFrame = g.x > col.min[0] - 0.7 && g.x < col.max[0] + 0.7 && g.z > col.min[2] - 0.7 && g.z < col.max[2] + 0.7;
      if ((doorTarget[id] ?? 0) < 0.5 && inFrame) { doorTarget[id] = 1; doorWait[id] = true; sfx('porta_abre'); }
      else if (doorWait[id] && !inFrame) { doorTarget[id] = 0; doorWait[id] = false; sfx('porta_fecha'); }
      const cur = doorState[id] ?? 0, tg = doorTarget[id] ?? 0;
      doorState[id] = cur + Math.sign(tg - cur) * Math.min(Math.abs(tg - cur), dt * 2.2);
    }
    occl.length = 0;
    for (const c of casa.colliders) if (c.enabled !== false) occl.push(c);
  }

  // ------------------------------------------------------------------ what each thing does
  function openBills() {
    const t = T().mesa;
    if (!contas.length) { self(t.vazia); return; }
    ui.menu({
      title: t.titulo, lines: () => [fill(t.linha, { carteira: money(wallet * 100) })],
      items: [
        ...contas.map((c) => ({ label: () => `${T().contas[c.id] || c.id}   ${money(c.valor * 100)}   ${c.paga ? t.paga : t.pagar}`, act: () => payBill(c) })),
        { label: () => t.voltar, act: () => ui.closeModal() },
      ],
      onBack: () => ui.closeModal(),
    });
  }
  function payBill(c) {
    const t = T().mesa;
    if (c.paga) return;
    if (!transact('money:pay', { valor: c.valor, motivo: c.id })) { ui.toast(t.recusa); sfx('erro'); return; }
    c.paga = true; sfx('nota'); ui.toast(fill(t.pagou, { conta: T().contas[c.id] || c.id }));
  }

  async function playMessages() {
    const t = T().telefone;
    const list = unheard();
    if (!list.length) { self(t.sem); return; }
    busy = true;
    ring = null;
    sfx('telefone_atende');
    for (const m of list) {
      const n = recados.indexOf(m) + 1;
      sfx('tecla');
      await ui.dialogue(`${t[m.de]} · ${fill(t.recado, { n, hora: m.hora })}`, [m.texto], m.de === 'gerente' ? 7 : 3 + n);
      heard.add(m.id);
      if (m.evento) {
        sanidade = clamp(sanidade + (T().regras.sanidadeSecretaria || 0), 0, 100);
        bus.emit('dayoff:event', { id: m.evento, week: info.week });
      }
    }
    sfx('telefone_desliga');
    busy = false;
  }

  function openShop() {
    const t = T().balcao, P = T().farmacia.precos, L = T().farmacia.limite;
    visitedPharmacy = true;
    const row = (item) => ({
      label: () => `${t[item]}   ${money(P[item] * 100)}${compras[item] >= L[item] ? '   ' + t.esgotado : ''}`,
      act: () => buy(item),
    });
    ui.menu({
      title: t.titulo, lines: () => [t.boasVindas, fill(t.linha, { carteira: money(wallet * 100) })],
      items: [row('remedio'), row('pilha'), { label: () => t.sair, act: () => ui.closeModal() }],
      onBack: () => ui.closeModal(),
    });
  }
  function buy(item) {
    const t = T().balcao, P = T().farmacia.precos, L = T().farmacia.limite;
    if (compras[item] >= L[item]) { ui.toast(t.limite); sfx('erro'); return; }
    if (!transact('money:spend', { valor: P[item], item })) { ui.toast(t.recusa); sfx('erro'); return; }
    compras[item]++;
    bus.emit('inventory:add', { item });
    sfx('moeda'); ui.toast(t.comprou[item]);
  }

  function openBed() {
    const t = T().cama, open = unpaid().length;
    ui.menu({
      title: t.titulo, lines: () => [t.linha, ...(open ? [t.contasAbertas] : [])],
      items: [{ label: () => t.sim, act: () => { ui.closeModal(); goSleep(); } }, { label: () => t.nao, act: () => ui.closeModal() }],
      onBack: () => ui.closeModal(),
    });
  }
  function goSleep() { sleeping = { t: 0 }; interaction.cancel(); self(T().dormir); }

  function end() {
    if (ended) return;
    ended = true;
    const R = T().regras, ganho = R.sanidadeDormir;
    const out = {
      sanidade: clamp(sanidade + ganho, 0, 100), ganho,
      pagas: contas.filter((c) => c.paga).map((c) => c.id), deixadas: unpaid().map((c) => c.id),
      recados: [...heard], compras: { ...compras }, week: info.week, day: info.day,
    };
    cleanup();
    ui.setFx({ vignette: 0, aimX: 0, aimY: 0, filter: '', lid: 0, black: 0 });
    bus.emit('dayoff:end', out);
  }

  // ------------------------------------------------------------------ interactables
  function reg(id, { label, tap, reach = 2.2, priority = 0, enabled = () => true }) {
    const it = casa.interactables.find((i) => i.id === id);
    interaction.register({
      id, reach, priority,
      aim: () => { it.object3D.updateWorldMatrix(true, false); box.setFromObject(it.object3D); return { box: box.clone().expandByScalar(0.06) }; },
      enabled: () => !busy && !sleeping && enabled(), label, tap,
    });
  }
  function register() {
    const L = T().rotulos, wk = clampWeek(info.week);
    let thoughtN = 0, fridgeN = 0, windowN = 0;
    for (const id of Object.keys(casa.doors)) {
      reg(id, {
        reach: 2.4, priority: -0.5,
        label: () => (doorTarget[id] > 0.5 ? L.portaFechar : L.portaAbrir),
        tap: () => { setDoor(id, doorTarget[id] > 0.5 ? 0 : 1); sfx(doorTarget[id] > 0.5 ? 'porta_abre' : 'porta_fecha'); },
      });
    }
    reg('vara', { label: () => L.vara, tap: () => { const l = T().vara[wk]; self(l[thoughtN++ % l.length]); } });
    reg('janela', { label: () => L.janela, tap: () => { const l = T().janela; self(l[windowN++ % l.length]); } });
    const sticker = wk >= 3;
    reg('geladeira', {
      label: () => (sticker ? L.geladeiraAdesivo : L.geladeira),
      tap: () => { const l = T().geladeira[sticker ? 'adesivo' : 'limpa']; self(l[fridgeN++ % l.length]); },
    });
    reg('telefone', { label: () => L.telefone, tap: () => playMessages() });
    reg('mesaContas', { label: () => L.mesa, tap: openBills, reach: 2.6 });
    reg('cama', { label: () => L.cama, tap: openBed, reach: 2.4 });
    reg('farmaciaBalcao', { label: () => L.balcao, tap: openShop, reach: 2.6 });
    reg('atendente', { label: () => L.atendente, tap: openShop, reach: 3, priority: 0.6 });
    reg('frasco', { label: () => L.frasco, tap: openShop, reach: 2.6, priority: 0.5, enabled: () => compras.remedio < T().farmacia.limite.remedio });
    reg('prateleiraPilhas', { label: () => L.pilhas, tap: openShop, reach: 2.6 });
  }

  // ------------------------------------------------------------------ lifecycle
  async function start(i) {
    await loadText();
    if (active) cleanup();
    info = { week: 1, day: 1, wallet: 0, contas: [], sanidade: 100, ...i };
    ended = false; sleeping = null; busy = false; clock = 0; fadeIn = 1; ring = null; sayN = 0;
    wallet = info.wallet; sanidade = info.sanidade; visitedPharmacy = false;
    contas = (info.contas || []).map((c) => ({ id: c.id, valor: c.valor, paga: false }));
    compras = { remedio: 0, pilha: 0 }; heard = new Set(); timers = [];
    seed = info.seed ?? (clampWeek(info.week) * 31 + (info.day || 1));
    rand = mulberry32(seed * 977 + 5);
    const wk = clampWeek(info.week);
    recados = (T().recados[wk] || []).map((m, n) => ({ ...m, id: `w${wk}r${n + 1}` }));
    for (const k of Object.keys(doorTarget)) { doorTarget[k] = 0; doorState[k] = 0; doorWait[k] = false; }
    if (!casa || casaSeed !== seed) { casa = buildCasa(r, { seed, darkness: 1 }); casaSeed = seed; }
    hidden = [];
    for (const c of r.scene.children) if (c !== casa.group && c.visible) { c.visible = false; hidden.push(c); }
    if (casa.group.parent !== r.scene) r.scene.add(casa.group);
    casa.group.visible = true;
    player = createPlayer(quiet, { world: { r, colliders: casa.colliders } });
    interaction = createInteraction(quiet, { world: { colliders: occl }, render: r, player, aimOffset: () => ({ x: 0, y: 0 }), ui, holdScale: () => 1 });
    const sp = casa.anchors.spawn.pos;
    player.place({ x: sp[0], z: sp[2] }, Math.atan2(-(3.6 - sp[0]), -(3.4 - sp[2])));
    player.freeSpot(sp[0], sp[2]);
    register();
    active = true;
    input.setMode('play', r.canvas); if (input.device() !== 'touch') input.lock();
    ui.hideHud(false); ui.setTotal(null); ui.toggleSheet(false);
    bus.emit('loop', 'dayoff:insetos', 'insetos', { gain: 0.45 });
    bus.emit('loop', 'dayoff:geladeira', 'geladeira', { gain: 0.5 });
    after(1.2, () => self(pick(T().acorda)));
    after(4.2, () => ui.toast(T().dica[input.device()] || T().dica.keyboard));
    const tr = T().regras.toca;
    if (wk === tr.semana) { after(tr.depois, () => { ring = { until: clock + tr.dura, next: clock }; }); }
    stepScene(0);
  }
  function cleanup() {
    if (!active) return;
    active = false;
    for (const c of hidden) c.visible = true;
    hidden = [];
    if (casa) r.scene.remove(casa.group);
    for (const id of ['dayoff:insetos', 'dayoff:geladeira']) bus.emit('loop', id, null, { on: false });
    ui.setObjective(null); ui.setPrompt?.(null);
    if (interaction) interaction.cancel();
    if (ui.modalOpen) ui.closeModal();
    r.spot({ on: false });
  }
  function stop() { cleanup(); }

  function sceneState() {
    const wk = clampWeek(info.week), R = T().regras;
    return {
      adesivoGeladeira: wk >= 3 ? 1 : 0, recados: unheard().length, telefoneToca: Boolean(ring && clock < ring.until),
      doors: doorState, hora: Math.min(R.horaMaxima, R.horaInicial + clock / R.segundosPorHora), frascoVisivel: compras.remedio < T().farmacia.limite.remedio,
    };
  }
  function stepScene(dt) {
    stepDoors(dt);
    casa.update(clock, sceneState());
  }

  function update(dt) {
    if (!active || !casa) return;
    clock += dt;
    const intent = input.sample();
    for (const p of intent.press) {
      if (ui.modalOpen) ui.handle(p);
      else if (p.k === 'esc') bus.emit('dayoff:pause');
    }
    ui.update(dt);
    for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    if (ring) { if (clock >= ring.until) ring = null; else if (clock >= ring.next) { sfx('telefone_toca'); ring.next = clock + 1.6; } }
    const modal = ui.modalOpen;
    if (modal) ui.el.say.hidden = true;   // a spoken line never sits under a box
    if (!modal && !sleeping) { player.step(dt, intent); interaction.update(dt, intent); }
    else { ui.setPrompt(null); player.st.moving = false; }
    stepScene(dt);
    fadeIn = Math.max(0, fadeIn - dt / 1.6);
    let black = fadeIn;
    if (sleeping) { sleeping.t += dt; black = Math.max(black, Math.min(1, sleeping.t / 2.2)); if (sleeping.t > 3.2) { end(); return; } }
    ui.setFx({ vignette: 0.25, aimX: 0, aimY: 0, filter: '', lid: 0, black });
    const o = sleeping ? '' : objective();
    if (o !== lastObj) { lastObj = o; ui.setObjective(o); }
  }
  function draw() {
    if (!active || !casa) return;
    player.apply(r.camera, clock, {});
    applyLights();
    r.draw();
  }

  return {
    start, stop, update, draw, end,
    get active() { return active; }, get seed() { return seed; }, get scene() { return casa?.group || null; }, get casa() { return casa; }, get player() { return player; }, get interaction() { return interaction; },
    get state() { return { wallet, contas: contas.map((c) => ({ ...c })), recados: unheard().length, compras: { ...compras }, sanidade, week: info?.week, clock }; },
  };
}
