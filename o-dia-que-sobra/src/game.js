// The game: builds the systems, connects them through the bus, runs the fixed step and owns the
// states (title, play, pause). The loop in main.js is the only place with a real clock.
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

async function loadData() {
  const names = ['items', 'customers', 'tasks', 'events', 'progression', 'medication'];
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = await (await fetch(`./data/${n}.json`)).json(); }));
  out.dialogue = await (await fetch('./data/dialogue.pt-BR.json')).json();
  try { out.cast = await (await fetch('./data/cast.json')).json(); } catch { out.cast = { tipos: [], recorrentes: [] }; }
  try { out.recurring = await (await fetch('./data/recurring.pt-BR.json')).json(); } catch { out.recurring = { cenas: [] }; }
  return out;
}

export async function createGame({ root, render, input, params }) {
  const bus = createBus();
  const opts = loadOpts();
  const data = await loadData();
  const rules = data.progression;
  const baseSeed = params.seed;

  const world = await createWorld(render, { seed: baseSeed });
  const audioMod = params.silent ? await import('./stubs/audio.js') : await import('./audio/index.js');
  const time = createTime(bus, { secondsPerHour: rules.expediente.segundosPorHora });
  const player = createPlayer(bus, { world });
  world.guard = player.st;
  const sanity = createSanity(bus, { opts });
  const progression = createProgression(bus, { rules });
  const inventory = createInventory(bus, { world, render, items: data.items });
  const lighting = createLighting(bus, { world, render, player, flash: () => inventory.flash, opts });
  const audioSys = createAudioSystem(bus, { world, player, lighting, mod: audioMod, opts });
  const save = createSaveSystem(bus, { progression });
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
      else if (modalCount === 0 && state === 'play') { input.setMode('play', render.canvas); input.lock(); }
    },
    sheetData: () => ({
      time: time.text(), day: progression.st.day, week: progression.st.week, wallet: progression.st.wallet,
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
  // doors: a tap opens or closes (the scene animates them and takes the collider away while open)
  for (const id of world.doorIds()) {
    interaction.register({
      id: 'porta-' + id, reach: 2.4, priority: -0.5,
      aim: () => ({ box: world.aimBox(id, 0.05) }),
      enabled: () => true,
      label: () => ({ text: id === 'porta-deposito' && progression.st.week < 3 ? 'Porta do depósito (trancada)' : entity.locked.has(id) ? 'Porta trancada' : world.doorOpen(id) ? 'Fechar a porta' : 'Abrir a porta' }),
      tap: () => {
        if (entity.locked.has(id)) return bus.emit('hint', 'Trancada por dentro. Destranque pelo outro botão.');
        if (id === 'porta-deposito' && progression.st.week < 3 && !progression.hasFlag('cracha')) { bus.emit('hint', 'O depósito está trancado.'); bus.emit('sfx', 'porta_range', { opts: { dur: 0.5 } }); return; }
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
  const events = await createEvents(bus, { world, customers, progression, sanity, time, ui, player, lighting, data, render, tasks, narrative, inventory, office, medication, mirror, audioSys, cameras });
  const shift = createShift(bus, { time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, input, cash, office, chores, medication, coffee, mirror });

  bus.on('hint', (t) => ui.toast(t));
  bus.on('shift:closed', () => showTitle());
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
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null);
    input.setMode('ui', render.canvas);
    save.card.reload();
    titleCamera();
    const hasRun = save.hasRun();
    const run = save.card.data.run;
    const items = [];
    if (hasRun) items.push({ label: () => `CONTINUAR  (NOITE ${run.day})`, act: () => startNight(run.day, false, true) });
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
  function startNight(day, tutorial, fromCard) {
    audioSys.init();
    if (fromCard) save.load();
    else progression.fromRun({ day, week: 1, wallet: data.progression.carteiraInicial, tutorialDone: false, flags: [], eventsSeen: [] });
    nightSeedNow = baseSeed * 100 + day;
    ui.closeModal();
    state = 'play'; modalCount = 0;
    ui.hideHud(false);
    input.setMode('play', render.canvas); input.lock();
    audioSys.startAmbient();
    entity.reset();
    shift.begin({ day, seed: nightSeedNow, tutorial: tutorial && !progression.st.tutorialDone, event: params.event || null });
    if (params.sol) entity.force(params.sol, 2);
  }
  function openPause() {
    if (state !== 'play' || ui.modalOpen) return;
    if (performance.now() - lastPauseAt < 200) return;
    lastPauseAt = performance.now();
    state = 'pause'; time.pause();
    const back = () => { resume(); };
    const root_ = () => ui.menu({
      title: 'PAUSA', foot: () => `Noite ${progression.st.day} · ${time.text()} · Semente ${nightSeedNow}`,
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
    const intent = input.sample();
    presses(intent.press);
    ui.update(dt);
    if (input.device() !== lastDevice) { lastDevice = input.device(); if (state === 'title' || state === 'pause') ui.redrawModal(); }
    simT += dt;
    const wx = () => ({ hora: time.minutes / 60, telefoneToca: narrative.ringing, gaveta: ui.trayOpen ? 1 : 0, placaSorriso: events.placaSorriso });
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
    if (entity.done) { entity.reset(); startNight(progression.st.day, false, save.hasRun()); return; }
    shift.update(dt);
    world.update(simT, dt, wx());
    lighting.update(dt, simT);
    audioSys.update();
    ui.setFx({ vignette: fx.vignette, aimX: fx.aimX, aimY: fx.aimY, filter: fx.filter, lid: fx.lid, black: fx.black });
  }
  function draw() {
    const f = state === 'title' ? { roll: 0, fov: 0, shakeX: Math.sin(simT * 0.2) * 0.05, shakeY: 0 } : { roll: fx.roll, fov: fx.fov, shakeX: Math.sin(simT * 1.7) * fx.sway, shakeY: Math.sin(simT * 1.3) * fx.sway };
    if (state !== 'title') { f.shakeY = (f.shakeY || 0) + Math.sin(simT * 1.9) * fx.breath; f.droop = fx.droop; }
    player.apply(render.camera, simT, f);
    mirror.draw();
    cameras.draw();
    render.draw();
  }

  showTitle();
  const api = {
    bus, entity, medication, coffee, mirror, world, time, player, sanity, progression, inventory, lighting, interaction, customers, traffic, tasks, chores, cash, office, narrative, events, cameras, shift, save, ui, audioSys, data,
    step, draw, showTitle, startNight, openPause, resume,
    get state() { return state; }, get modalCount() { return modalCount; }, get fx() { return fx; }, get simT() { return simT; }, get nightSeed() { return nightSeedNow; },
  };
  return api;
}
