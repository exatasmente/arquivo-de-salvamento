// The game: builds the systems, connects them through the bus, runs the fixed step and owns the
// states (title, play, pause, dayoff, ending). The loop in main.js is the only place with a real clock.
//
// There is a local debugging shortcut (`?debug=...`). It only works on localhost, 127.0.0.1 and ::1, never on the public site, and it
// keeps its own memory card (the key gets a `.debug` suffix), so it never reads or touches the card of whoever plays.
import { createBus } from './bus.js';
import { createWorld } from './systems/world.js';
import { createTime } from './systems/time.js';
import { createPlayer } from './systems/player.js';
import { createLighting } from './systems/lighting.js';
import { createInteraction } from './systems/interaction.js';
import { createInventory } from './systems/inventory.js';
import { createSanity } from './systems/sanity.js';
import { createProgression } from './systems/progression.js';
import { createCustomers } from './systems/customers.js';
import { createTasks } from './systems/tasks.js';
import { createNarrative } from './systems/narrative.js';
import { createEvents } from './systems/events.js';
import { createShift } from './systems/shift.js';
import { createCash } from './systems/cash.js';
import { createTraffic } from './systems/traffic.js';
import { createChores } from './systems/chores.js';
import { createOffice } from './systems/office.js';
import { createCameras } from './systems/cameras.js';
import { createMedication } from './systems/medication.js';
import { createCampaign } from './systems/campaign.js';
import { createSecrets } from './systems/secrets.js';
import { mulberry32 } from './rng.js';
import { createCoffee } from './systems/coffee.js';
import { createMirror } from './systems/mirror.js';
import { createEntity } from './systems/entity.js';
import { createKit } from './systems/events/kit.js';
import { createSaveSystem } from './systems/save.js';
import { createAudioSystem } from './systems/audio.js';
import { createUI } from './ui.js';
import { money } from './util.js';

export const DT = 1 / 60;
const OPT_KEY = 'o-dia-que-sobra.opts';
export function loadOpts() {
  try { return { reduceFlash: false, mute: false, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { reduceFlash: false, mute: false }; }
}
const saveOpts = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* private mode */ } };

export const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/** `?debug=day:13,...` -> { day: 13, secrets: true... } (see the top of the file). */
function parseDebug() {
  const o = {};
  if (typeof location === 'undefined' || !LOCAL.has(location.hostname)) return o;
  for (const part of (new URLSearchParams(location.search).get('debug') || '').split(',')) {
    const [k, v] = part.split(':');
    if (!k) continue;
    o[k] = v === undefined || v === 'all' ? true : Number.isNaN(Number(v)) ? v : Number(v);
  }
  if (o.sanity !== undefined) o.once = true;
  return o;
}

/** The debug card: the same localStorage, every key with a `.debug` suffix. */
function debugStorage() {
  return { getItem: (k) => localStorage.getItem(k + '.debug'), setItem: (k, v) => localStorage.setItem(k + '.debug', v), removeItem: (k) => localStorage.removeItem(k + '.debug') };
}

async function loadData() {
  const names = ['items', 'customers', 'tasks', 'events', 'progression', 'medication'];
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = await (await fetch(`./data/${n}.json`)).json(); }));
  out.dialogue = await (await fetch('./data/dialogue.pt-BR.json')).json();
  try { out.cast = await (await fetch('./data/cast.json')).json(); } catch { out.cast = { tipos: [], recorrentes: [] }; }
  try { out.recurring = await (await fetch('./data/recurring.pt-BR.json')).json(); } catch { out.recurring = { cenas: [] }; }
  try { out.dayoff = await (await fetch('./data/dayoff.pt-BR.json')).json(); } catch { out.dayoff = null; }
  return out;
}

export async function createGame({ root, render, input, params }) {
  const bus = createBus();
  const opts = loadOpts();
  const data = await loadData();
  const rules = data.progression;
  const baseSeed = params.seed;
  const dbg = parseDebug();

  const world = await createWorld(render, { seed: baseSeed });
  const audioMod = params.silent ? await import('./stubs/audio.js') : await import('./audio/index.js');
  const time = createTime(bus, { secondsPerHour: rules.expediente.segundosPorHora });
  const player = createPlayer(bus, { world });
  world.guard = player.st;
  const sanity = createSanity(bus, { opts });
  const progression = createProgression(bus, { rules });
  const inventory = createInventory(bus, { world, render, items: data.items, stock: progression.st });
  const lighting = createLighting(bus, { world, render, player, flash: () => inventory.flash, opts });
  const audioSys = createAudioSystem(bus, { world, player, lighting, mod: audioMod, opts });
  const save = createSaveSystem(bus, { progression, storage: (params.debug || Object.keys(dbg).length) ? debugStorage() : undefined });
  const cash = createCash(bus, { items: data.items });

  let lastDevice = 'keyboard', tick = 0, simT = 0, state = 'title', modalCount = 0, lastPauseAt = -1e9, nightSeedNow = 1;
  const glyph = (k) => ({ tap: { keyboard: 'E', gamepad: 'A', touch: 'TOQUE' }, hold: { keyboard: 'SEGURE E', gamepad: 'SEGURE A', touch: 'SEGURE' } }[k][input.device()] || 'E');
  let fx = sanity.fx(0);

  const ui = createUI(root, {
    device: () => input.device(), glyph,
    babble: (seed, text, o) => audioSys.babble(seed, text, o),
    canvas: render.canvas,
    fx: () => fx,
    keyFails: () => sanity.keyFails(),
    scramble: (t) => medication.scramble(t, simT),
    valuesKey: () => (medication.active('valores') ? Math.floor(simT * 4) : ''),
    sfx: (n) => bus.emit('sfx', n, {}),
    setModal(open) {
      modalCount += open ? 1 : -1; if (modalCount < 0) modalCount = 0;
      if (open) { input.setMode('ui', render.canvas); interaction.cancel(); }
      else if (modalCount === 0 && (state === 'play' || state === 'dayoff')) { input.setMode('play', render.canvas); if (input.device() !== 'touch') input.lock(); }
    },
    sheetData: () => ({
      time: time.text(), day: progression.st.day, week: progression.st.week, wallet: progression.st.wallet,
      cal: progression.calendar(), weekNow: progression.st.weekPts + progression.night.pontos, meta: progression.weekRules().meta,
      tasks: tasks.list, perf: progression.night, undone: tasks.undone(),
      blank: medication.active('concentracao') && Math.floor(simT / 7) % 2 === 1, mind: fx.mind,
      orders: [...customers.list.filter((c) => c.kind === 'car' && c.ordered && !c.done).map((c) => `Bomba ${c.pump}: ${money(c.value)}`),
        ...customers.list.filter((c) => c.kind === 'walk' && !c.done).flatMap((c) => c.prods.filter((p) => p.atras && !p.done).map((p) => `Balcão: ${p.nome} (prateleira atrás do balcão)`))],
      fuels: Object.values(data.items.combustiveis).map((f) => ({ nome: f.nome, cor: f.cor })),
    }),
    inventory: () => ({ slots: inventory.slots, sel: inventory.sel, flash: inventory.flash }),
    tick: () => tick,
  });
  const interaction = createInteraction(bus, { world, render, player, ui, aimOffset: () => ({ x: fx.aimX, y: fx.aimY }), holdScale: () => 1 / medication.slow });
  const secrets = createSecrets(bus, { world, render, interaction, inventory, progression, player, ui, save });
  // doors: a tap opens or closes (the scene animates them and takes the collider away while open)
  for (const id of world.doorIds()) {
    interaction.register({
      id: 'porta-' + id, reach: 2.4, priority: -0.5,
      aim: () => ({ box: world.aimBox(id, 0.05) }),
      enabled: () => true,
      label: () => ({ text: id === 'porta-deposito' && !secrets.depositoOpen() ? 'Porta do depósito (trancada)' : entity.locked.has(id) ? 'Porta trancada' : world.doorOpen(id) ? 'Fechar a porta' : 'Abrir a porta' }),
      tap: () => {
        if (entity.locked.has(id)) return bus.emit('hint', 'Trancada por dentro. Destranque pelo outro botão.');
        if (id === 'porta-deposito' && !secrets.depositoOpen()) { bus.emit('hint', 'O depósito está trancado.'); bus.emit('sfx', 'porta_range', { opts: { dur: 0.5 } }); return; }
        world.setDoor(id, world.doorOpen(id) ? 0 : 1); bus.emit('sfx', world.doorOpen(id) ? 'porta_abre' : 'porta_fecha', { pos: world.anchor(id)?.pos.toArray() }); },
    });
  }
  const traffic = createTraffic(bus, { world, render, player });
  const customers = createCustomers(bus, { device: () => input.device(), keyFails: () => sanity.keyFails(), world, render, interaction, inventory, progression, ui, time, sanityFx: () => fx, sanityValue: () => sanity.value, data, cash, player, traffic });
  const tasks = createTasks(bus, { world, render, interaction, inventory, progression, player, data, time, cash });
  const chores = createChores(bus, { world, render, interaction, inventory, progression, player, data, tasks, customers });
  tasks.attach(chores, customers); customers.attach(chores);
  const office = createOffice(bus, { world, render, interaction, ui, time, progression, tasks, cash, data, inventory });
  const cameras = createCameras(bus, { render, world, ui, time, sanity, input, data, player, interaction, office, lighting, progression });
  const dialogue = (who, lines, seed) => ui.dialogue(who, lines, seed);
  const narrative = createNarrative(bus, { world, interaction, customers, tasks, progression, time, ui, dialogue, data, cash, office });
  const mirror = createMirror({ world, render, player });
  const kit = createKit({ world, player, render, data });
  const entity = createEntity(bus, { world, render, player, sanity, lighting, inventory, progression, time, interaction, ui, kit });
  const medication = createMedication(bus, { data, progression, sanity, time, inventory, interaction, world, ui, player, customers });
  const coffee = createCoffee(bus, { world, render, interaction, inventory, progression, sanity, time, ui, customers, data });
  world.displayFilter = (text, t) => medication.scramble(text, t);
  bus.on('sanity:add', (d, why) => sanity.add(d, why));
  const campaign = createCampaign(bus, { progression, sanity, entity, ui, save, secrets, rules, data, hooks: {
    startNight: (day) => startNight(day, false, false, true), showTitle: () => showTitle(), seed: () => baseSeed, playing: () => state === 'play',
    enterDayOff, leaveDayOff, newGame: () => { save.wipe(); startNight(1, !params.skiptutorial, false); }, continueRun: () => continueRun(),
  } });
  const events = await createEvents(bus, { world, customers, progression, sanity, time, ui, player, lighting, data, render, tasks, narrative, inventory, office, medication, mirror, audioSys, cameras, chores, campaign, entity });
  const shift = createShift(bus, { time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, input, cash, office, chores, medication, coffee, mirror });

  bus.on('hint', (t) => ui.toast(t));
  bus.on('shift:closed', (summary, week, choice) => campaign.onClosed(summary, week, choice));
  bus.on('time:hour', () => ui.setCalendar(calText()));
  bus.on('shift:open', () => ui.setCalendar(calText()));
  bus.on('interact:none', () => { if (inventory.drop()) return; if (inventory.selectedItem()) inventory.useSelected(); });
  bus.on('inventory:change', () => ui.showInventory());
  bus.on('sanity:stage', (s) => { if (s >= 2 && !opts.reduceFlash) bus.emit('sfx', 'coracao', { gain: 0.5 }); });

  // ------------------------------------------------------------------ states
  function titleCamera() {
    const b = world.anchor('bomba2') || world.anchor('spawn');
    const p = b.pos.clone().addScaledVector(b.dir, 11); p.y = 0;
    player.place(p, Math.atan2(b.dir.x, b.dir.z));
    player.st.eye = 1.7;
  }
  function showTitle() {
    state = 'title'; shift.abort(); audioSys.stopAmbient();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null);
    input.setMode('ui', render.canvas);
    campaign.reset(); leaveDayOff(true);
    save.card.reload();
    titleCamera();
    const hasRun = save.hasRun();
    const run = save.card.data.run;
    const items = [];
    if (hasRun) items.push({ label: () => (run.fase === 'folga' ? `CONTINUAR  (FOLGA, SEMANA ${progression.weekOf(run.day - 1)})` : run.fase === 'fim' ? 'CONTINUAR  (O FIM)' : `CONTINUAR  (SEMANA ${progression.weekOf(run.day)} · NOITE ${run.day})`), act: () => continueRun() });
    items.push({ label: () => (hasRun ? 'NOVO JOGO' : 'COMEÇAR'), act: () => (hasRun ? confirmNew() : startNight(1, !params.skiptutorial, false)) });
    items.push({ label: () => 'CONTROLES', act: () => ui.controlsScreen(showTitle) });
    items.push({ label: () => 'CARTÃO DE MEMÓRIA', act: () => ui.cardScreen(save.card, showTitle) });
    items.push(...optionItems(() => ui.redrawModal()));
    ui.menu({
      title: 'O DIA QUE SOBRA', subtitle: 'Posto Bom Dia · Um novo dia sempre começa com um sorriso!',
      lines: titleLines, items, foot: () => `Semente do jogo: ${baseSeed}  (?seed=N)`,
    });
  }
  function titleLines() {
    const d = input.device();
    const how = d === 'gamepad' ? 'Controle: analógicos andam e olham · A usa · segure A para manipular · Y lanterna · Select prancheta'
      : d === 'touch' ? 'Toque: direcional à esquerda anda · arraste para olhar · toque no objeto usa · segure para manipular'
        : 'Teclado: WASD anda · mouse olha · E usa (segure para manipular) · F lanterna · Q prancheta · Esc pausa';
    return ['Você é o frentista da madrugada. Abasteça, atenda, reponha.', how];
  }
  function optionItems(redraw) {
    return [
      { label: () => `REDUZIR CLARÕES: ${opts.reduceFlash ? 'SIM' : 'NÃO'}`, act: () => { opts.reduceFlash = !opts.reduceFlash; saveOpts(opts); redraw(); } },
      { label: () => `SOM: ${opts.mute ? 'NÃO' : 'SIM'}`, act: () => { audioSys.init(); audioSys.setMuted(!opts.mute); saveOpts(opts); redraw(); } },
    ];
  }
  function confirmNew() {
    ui.menu({
      title: 'NOVO JOGO', lines: ['Isto apaga a noite salva no cartão de memória. O resto do cartão fica.'],
      items: [{ label: () => 'NÃO, VOLTAR', act: showTitle }, { label: () => 'SIM, APAGAR E COMEÇAR', act: () => { save.wipe(); startNight(1, !params.skiptutorial, false); } }],
      onBack: showTitle,
    });
  }
  /** The title's "continue": the run says where it stopped (a night, the day off after a week, or the end that was being told). */
  function continueRun() {
    audioSys.init();
    save.card.reload();
    const run = save.card.data.run;
    if (!run) { startNight(1, !params.skiptutorial, false); return; }
    progression.fromRun(run);
    ui.closeModal(); modalCount = 0;
    if (campaign.resume(run)) return;
    startNight(run.day, false, true);
  }
  /** from: the card (`fromCard`), a new run (default), or what is in memory already (`keep`: the next night of the run that is going on). */
  function startNight(day, tutorial, fromCard, keep = false) {
    audioSys.init();
    if (fromCard) save.load();
    else if (!keep) { progression.newRun(); }
    progression.st.fase = 'noite'; progression.st.fim = 0;
    campaign.resetNight(); secrets.beginNight();
    nightSeedNow = baseSeed * 100 + day;
    ui.closeModal();
    state = 'play'; modalCount = 0;
    ui.hideHud(false);
    input.setMode('play', render.canvas); input.lock();
    audioSys.startAmbient();
    entity.reset();
    shift.begin({ day, seed: nightSeedNow, tutorial: tutorial && !progression.st.tutorialDone, event: params.event || null });
    if (params.sol) entity.force(params.sol, 2);
    if (dbg.sanity !== undefined && dbg.once) { sanity.reset(dbg.sanity, nightSeedNow); dbg.once = false; }
  }
  function openPause() {
    if (state !== 'play' || ui.modalOpen) return;
    if (performance.now() - lastPauseAt < 200) return;
    lastPauseAt = performance.now();
    state = 'pause'; time.pause();
    const back = () => { resume(); };
    const root_ = () => ui.menu({
      title: 'PAUSA', foot: () => `Semana ${progression.st.week} · noite ${progression.st.day} · dia ${progression.calendar().calDay} de 28 · ${time.text()} · Semente ${nightSeedNow}`,
      items: [
        { label: () => 'CONTINUAR', act: back },
        ...optionItems(() => ui.redrawModal()),
        { label: () => 'CONTROLES', act: () => ui.controlsScreen(root_) },
        { label: () => 'CARTÃO DE MEMÓRIA', act: () => ui.cardScreen(save.card, root_) },
        { label: () => 'SAIR PARA O TÍTULO (perde a noite)', act: () => { ui.closeModal(); showTitle(); } },
      ],
      onBack: back,
    });
    root_();
  }
  function resume() { state = 'play'; time.resume(); ui.closeModal(); }

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'play' && !ui.modalOpen) openPause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !ui.modalOpen) openPause(); });

  // ------------------------------------------------------------------ the day off and the endings
  const calText = () => { const c = progression.calendar(); return `SEMANA ${c.week} · ${c.dia} · DIA ${c.calDay}/28`; };
  let dayoff = null, dayoffTried = false;
  // what the day off gets as `audio`: the same calls as audio/index.js, forwarded to it once the context exists
  const audioFacade = {
    play: (n, o) => audioSys.audio?.play(n, o), babble: (sd, t, o) => audioSys.babble(sd, t, o),
    loop: (n, o) => audioSys.audio?.loop(n, o) ?? { stop() {}, setGain() {}, setPos() {} },
    listener: (p, d) => audioSys.audio?.listener(p, d), stopLoops: (f) => audioSys.audio?.stopLoops?.(f), setRoom: (r) => audioSys.audio?.setRoom?.(r),
    setSanity: (v) => audioSys.audio?.setSanity?.(v), get raw() { return audioSys.audio; }, sys: audioSys,
  };
  async function enterDayOff() {
    state = 'dayoff'; time.pause(); shift.abort(); audioSys.stopAmbient(); audioSys.init();
    ui.el.inv.hidden = true;
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.closeModal(); modalCount = 0;
    input.setMode('play', render.canvas);
    if (!dayoffTried) {
      dayoffTried = true;
      try { const m = await import('./systems/dayoff.js'); dayoff = m.createDayOff(bus, { r: render, input, ui, audio: audioFacade, data, rng: mulberry32(baseSeed * 31 + 7) }); }
      catch (e) { console.warn('the day off is not there:', e.message); dayoff = false; }
    }
  }
  function leaveDayOff(quiet) {
    if (dayoff) { try { (dayoff.stop || dayoff.dispose || dayoff.leave)?.call(dayoff); } catch (e) { console.warn('day off stop', e.message); } }
    if (!quiet && state === 'dayoff') state = 'title';
  }
  // Esc / the pause button in the day off: the same pause menu, and out of it back to the house
  bus.on('dayoff:pause', () => {
    if (state !== 'dayoff' || ui.modalOpen) return;
    const back = () => ui.closeModal();
    const root_ = () => ui.menu({
      title: 'PAUSA', foot: () => `Folga · semana ${progression.weekOf(progression.st.day)} · Semente ${baseSeed}`,
      items: [
        { label: () => 'CONTINUAR', act: back }, ...optionItems(() => ui.redrawModal()),
        { label: () => 'CONTROLES', act: () => ui.controlsScreen(root_) },
        { label: () => 'SAIR PARA O TÍTULO (a folga recomeça depois)', act: () => { ui.closeModal(); showTitle(); } },
      ],
      onBack: back,
    });
    root_();
  });
  // the manager's message that he says he never left (week 3): the next 05:50 call mentions it
  bus.on('dayoff:event', (e) => { if (e && e.id === 'secretaria') { progression.flag('secretaria'); progression.relatar('secretaria'); } });
  // without the day off's own file the week still turns: the sleep is counted as done
  bus.on('dayoff:start', (e) => {
    if (dayoff) { dayoff.start({ ...e, seed: baseSeed * 100 + e.week }); return; }     // the day off starts from this event (its own contract: `start(info)`)
    if (dayoff === false && !globalThis.__odqDayoffStub) Promise.resolve().then(() => bus.emit('dayoff:end', { sanidade: Math.min(100, e.sanidade + 40) }));
  });

  // the endings: the cutscene `final<id>` (src/cutscenes) when there is one, then `ending:done` and the screen of the ending
  bus.on('ending', async ({ id }) => {
    state = 'ending'; time.pause(); shift.abort(); audioSys.stopAmbient(); entity.reset();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.closeModal(); modalCount = 0;
    input.setMode('ui', render.canvas);
    const done = () => bus.emit('ending:done', { id });
    let played = false;
    try {
      const cs = await import('./cutscenes/player.js');
      if (cs.CUTSCENES['final' + id]) {
        const blocks = save.card.blocks();
        cs.configureCutscenes({ render, audio: () => audioSys.audio, seed: baseSeed });
        cs.playCutscene('final' + id, { render, audio: () => audioSys.audio, seed: baseSeed, blocks, skippable: true, onEnd: done });
        played = true;
      }
    } catch (e) { console.warn('the ending cutscene did not play:', e.message); }
    if (!played) { ui.setFx({ vignette: 0.9, aimX: 0, aimY: 0, filter: '', lid: 0, black: 0.92 }); done(); }
  });

  // ------------------------------------------------------------------ the step
  function presses(list) {
    for (const p of list) {
      if (ui.modalOpen || state !== 'play') {
        ui.handle(p);
        continue;
      }
      if (p.k === 'esc') openPause();
      else if (p.k === 'flash') { inventory.toggleFlash(); ui.showInventory(); }
      else if (p.k === 'sheet') ui.toggleSheet();
      else if (p.k === 'inv') { inventory.select(1); ui.showInventory(); }
      else if (p.k === 'invNext') { inventory.select(1); ui.showInventory(); }
      else if (p.k === 'invPrev') { inventory.select(-1); ui.showInventory(); }
      else if (p.k === 'crouch') player.toggleCrouch();
    }
  }
  function step(dt) {
    tick++;
    // the day off samples the input and runs its own modals and HUD (never two samples in a frame)
    if (state === 'dayoff') { simT += dt; if (dayoff) { if (dayoff.update) dayoff.update(dt, simT); else dayoff.step?.(dt, simT); } return; }
    const intent = input.sample();
    presses(intent.press);
    ui.update(dt);
    if (input.device() !== lastDevice) { lastDevice = input.device(); if (state === 'title' || state === 'pause') ui.redrawModal(); }
    simT += dt;
    const wx = () => ({ hora: time.minutes / 60, telefoneToca: narrative.ringing, gaveta: ui.trayOpen ? 1 : 0, placaSorriso: events.placaSorriso });
    if (state === 'ending') return;
    if (state === 'title') { world.update(simT, dt, wx()); lighting.update(dt, simT); audioSys.update(); return; }
    if ((ui.modalOpen && !cameras.watching) || state !== 'play') { world.update(simT, dt, wx()); lighting.update(dt, simT); audioSys.update(); return; }
    fx = sanity.fx(simT);
    if (medication.active('cor')) fx.filter = `saturate(0.3) contrast(0.9)${fx.filter ? ' ' + fx.filter : ''}`;
    fx.black = Math.max(entity.black, 0);
    fx.droop = medication.sleepy; fx.lid = medication.sleepy / 0.55 * 0.28 + (medication.blinking ? 0.4 : 0); fx.black = Math.max(medication.fade, entity.black);
    // hidden: the view is through the crack of the door, darker
    if (entity.hidden) { fx.lid = Math.max(fx.lid || 0, 0.34); fx.filter = `brightness(0.5)${fx.filter ? ' ' + fx.filter : ''}`; fx.vignette = Math.max(fx.vignette, 0.7); }
    time.step(dt);
    player.step(dt, intent);
    interaction.update(dt, intent);
    inventory.update(dt);
    medication.update(dt); coffee.update(dt); mirror.update(dt, simT);
    if (intent.acts.some((a) => a.type === 'down')) medication.blink();
    inventory.hand.position.set(0.3 + Math.sin(simT * 11.3) * fx.hand, -0.3 + Math.sin(simT * 8.7 + 1) * fx.hand, -0.6);
    tasks.update(dt);
    chores.update(dt);
    traffic.update(dt);
    customers.update(dt, simT);
    narrative.update(dt);
    events.update(dt, simT);
    cameras.update(dt, simT);
    const a = world.areaAt(player.st.x, 1, player.st.z);
    sanity.update(dt, { danger: world.danger(a), lit: lighting.litAt(player.st.x, player.st.z) || (inventory.flash.on && inventory.flash.charge > 0), calmArea: a && (a.id === 'loja' || a.id === 'escritorio') });
    const dng = world.danger(a);
    entity.update(dt, simT, { sanity: sanity.value, danger: dng, breath: intent.breath });
    entity.darkTick(dt, dng >= 3 && !lighting.litAt(player.st.x, player.st.z) && !(inventory.flash.on && inventory.flash.charge > 0));
    if (entity.done) { campaign.attacked(); return; }   // the Sun reached the player: ending 4
    shift.update(dt); campaign.update(dt);
    world.update(simT, dt, wx());
    lighting.update(dt, simT);
    audioSys.update();
    ui.setFx({ vignette: fx.vignette, aimX: fx.aimX, aimY: fx.aimY, filter: fx.filter, lid: fx.lid, black: fx.black });
  }
  function draw() {
    if (state === 'dayoff') { if (dayoff && dayoff.draw) dayoff.draw(); else render.draw(); return; }
    if (state === 'ending') return;
    const f = state === 'title' ? { roll: 0, fov: 0, shakeX: Math.sin(simT * 0.2) * 0.05, shakeY: 0 } : { roll: fx.roll, fov: fx.fov, shakeX: Math.sin(simT * 1.7) * fx.sway, shakeY: Math.sin(simT * 1.3) * fx.sway };
    if (state !== 'title') { f.shakeY = (f.shakeY || 0) + Math.sin(simT * 1.9) * fx.breath; f.droop = fx.droop; }
    player.apply(render.camera, simT, f);
    mirror.draw();
    cameras.draw();
    render.draw();
  }

  showTitle();
  function debugStart() {
    const st = progression.st, day = dbg.day ?? (dbg.week ? dbg.week * 6 - 5 : null);
    if (!(day || dbg.dayoff || dbg.ending)) { if (dbg.secrets) for (const id of ['s1', 's3', 's4', 'valdir']) save.card.addSecret(id); return; }
    progression.newRun();
    if (dbg.wallet !== undefined) st.wallet = dbg.wallet;
    if (dbg.miss) st.misses = dbg.miss;
    if (dbg.collapse) st.collapse.total = dbg.collapse;
    if (dbg.secrets) for (const id of ['s1', 's3', 's4', 'valdir']) save.card.addSecret(id);
    const upTo = day ? progression.weekOf(day) : dbg.dayoff ? dbg.dayoff + 1 : 4;
    for (let w = 1; w < upTo; w++) st.weekLog.push({ week: w, pts: progression.weekRules(w).meta, meta: progression.weekRules(w).meta, bateu: true, salario: progression.weekRules(w).salario });
    st.tutorialDone = true;
    if (day) { startNight(day, false, false, true); return; }
    if (dbg.dayoff) { st.day = dbg.dayoff * 6; st.week = dbg.dayoff; campaign.startDayOff(dbg.dayoff); return; }
    st.day = dbg.ending === 1 ? 24 : 7; st.week = progression.weekOf(st.day); campaign.ending(dbg.ending);
  }
  if (dbg.day || dbg.week || dbg.dayoff || dbg.ending || dbg.secrets) debugStart();
  const api = {
    bus, campaign, secrets, get dayoff() { return dayoff; }, entity, medication, coffee, mirror, world, time, player, sanity, progression, inventory, lighting, interaction, customers, traffic, tasks, chores, cash, office, narrative, events, cameras, shift, save, ui, audioSys, data,
    step, draw, showTitle, startNight, continueRun, openPause, resume,
    get state() { return state; }, get modalCount() { return modalCount; }, get fx() { return fx; }, get simT() { return simT; }, get nightSeed() { return nightSeedNow; },
  };
  return api;
}
