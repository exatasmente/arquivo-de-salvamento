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
import { createWeather } from './systems/weather.js';
import { createInteraction } from './systems/interaction.js';
import { createInventory } from './systems/inventory.js';
import { createSanity } from './systems/sanity.js';
import { createProgression } from './systems/progression.js';
import { createCustomers } from './systems/customers.js';
import { createTasks } from './systems/tasks.js';
import { createNarrative } from './systems/narrative.js';
import { createEvents } from './systems/events.js';
import { createShift } from './systems/shift.js';
import { createBranches } from './systems/branches.js';
import { LACO_IDS } from './systems/ties.js';
import { createCash } from './systems/cash.js';
import { createTraffic } from './systems/traffic.js';
import { createChores } from './systems/chores.js';
import { createOffice } from './systems/office.js';
import { createCameras } from './systems/cameras.js';
import { createNonexistent } from './systems/nonexistent.js';
import { createMedication } from './systems/medication.js';
import { createCampaign } from './systems/campaign.js';
import { createSecrets } from './systems/secrets.js';
import { createGoals } from './systems/goals.js';
import { getNav } from './systems/nav.js';
import { createPrep, PREP_FROM } from './systems/prep.js';
import { createClosing } from './systems/closing.js';
import { createHoses } from './systems/hoses.js';
import { mulberry32 } from './rng.js';
import { createCoffee } from './systems/coffee.js';
import { createMirror } from './systems/mirror.js';
import { createEntity } from './systems/entity.js';
import { createKit } from './systems/events/kit.js';
import { createSaveSystem } from './systems/save.js';
import * as snapshot from './systems/snapshot.js';
import { createAudioSystem } from './systems/audio.js';
import { createUI } from './ui.js';
import { titleCamera, signPower } from './title.js';
import { money } from './util.js';

export const DT = 1 / 60;
const OPT_KEY = 'o-dia-que-sobra.opts';
const OPT_DEFAULT = { quality: 'auto', reduceFlash: false, mute: false, volume: 0.9, look: 1, text: 1, bright: 5, grain: true, contrast: false, gyro: false, gyroSens: 1, gyroDead: 5, gyroFx: 28, gyroFy: 28, left: false, btn: 1, toggle: false };
const OPT_STEPS = { volume: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], look: [0.5, 0.75, 1, 1.25, 1.5, 2], text: [1, 1.25, 1.5], gyroSens: [0.5, 0.75, 1, 1.5, 2], btn: [0.85, 1, 1.2, 1.4], bright: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
/** The player's options: one key of their own in this browser (never in the memory card). A value out of range falls back to the default. */
export function loadOpts() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(OPT_KEY) || '{}') || {}; } catch { o = {}; }
  const out = { ...OPT_DEFAULT };
  for (const k of Object.keys(OPT_DEFAULT)) {
    if (typeof o[k] === typeof OPT_DEFAULT[k] && (!OPT_STEPS[k] || OPT_STEPS[k].some((v) => Math.abs(v - o[k]) < 1e-6))) out[k] = o[k];
  }
  return out;
}
const saveOpts = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* private mode */ } };

export const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/** `?wx=temporal` (limpo, nublado, fraca, forte, temporal): forces the night's weather, only on the local addresses (the tests and whoever is making the game). */
const wxParam = () => (typeof location !== 'undefined' && LOCAL.has(location.hostname) ? new URLSearchParams(location.search).get('wx') : null);
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
  try { out.entidades = await (await fetch('./data/entidades.pt-BR.json')).json(); } catch { out.entidades = null; }
  try { out.branches = await (await fetch('./data/branches.pt-BR.json')).json(); } catch { out.branches = { ramos: [], noites: {}, falas: {} }; }
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
  let weather = null;      // (made after the events: the sky, the rain and the moon of the night; lighting reads its env)
  const lighting = createLighting(bus, { world, render, player, flash: () => inventory.flash, opts, hours: () => (state === 'play' && time.minutes > 0 ? time.minutes / 60 : 0), weather: () => weather?.env() });
  const audioSys = createAudioSystem(bus, { world, player, lighting, mod: audioMod, opts });
  const save = createSaveSystem(bus, { progression, storage: (params.debug || Object.keys(dbg).length) ? debugStorage() : undefined });
  // ------------------------------------------------------------------ the picture: the new look by default, the "1998 mode" (the old picture) as an easter egg
  // It opens by the code 1998 typed on the monitor (cameras.onCode, below) and, once an ending has been seen, by an option; it is kept on the memory card.
  const mode1998Unlocked = () => save.card.endings.length > 0;
  /** 'novo' or '1998': draws the game in it from now on, keeps the choice on the card and tells the others (`look:mode`). Returns the mode now. */
  function setLookMode(mode, persist = true) {
    const m = render.setMode ? render.setMode(mode) : 'novo';
    if (persist) save.card.setLook1998(m === '1998');
    root.dataset.look = m; thaw();
    bus.emit('look:mode', m);
    return m;
  }
  const cash = createCash(bus, { items: data.items });

  applyOpts();
  // the gyroscope stays as the player left it: on a reload it is switched on again (on an iPhone, by the first tap,
  // which is where the phone lets the game ask); if the phone refuses, the option goes back to off
  input.onTilt = (st) => {
    if (st === 'denied') { opts.gyro = false; saveOpts(opts); ui.toast('O giroscópio não foi liberado.'); }
  };
  if (opts.gyro && input.tilt) input.tilt.enable().then((got) => { if (!got) { opts.gyro = false; saveOpts(opts); } });
  let lastDevice = 'keyboard', tick = 0, simT = 0, state = 'title', modalCount = 0, lastPauseAt = -1e9, nightSeedNow = 1, restoreSeed = null, saveNote = '', pendingDayoff = null;
  let extraNow = false, extraRun = null;      // the extra Sunday of the story (R4): a night with no shift, `extraRun` is its script
  const glyph = (k) => ({ tap: { keyboard: 'E', gamepad: 'A', touch: 'TOQUE' }, hold: { keyboard: 'SEGURE E', gamepad: 'SEGURE A', touch: 'SEGURE' } }[k][input.device()] || 'E');
  let fx = sanity.fx(0);

  const ui = createUI(root, {
    device: () => input.device(), glyph,
    onPrompt: (p) => { mobilePrompt = p; },
    sheetPick: (k) => { if (k.startsWith('tab:')) ui.setSheetTab(k.slice(4)); else goals.toggle(k); },
    babble: (seed, text, o) => audioSys.babble(seed, text, o),
    canvas: render.canvas,
    week: () => (state === 'title' ? (save.card.data.run?.week || 1) : progression.st.week || 1),
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
      time: time.text(), day: progression.st.day, week: progression.st.week, wallet: progression.st.wallet, sky: weather.on ? { line: weather.line(), date: weather.date.short } : null,
      cal: progression.calendar(), weekNow: progression.st.weekPts + progression.night.pontos, meta: progression.weekRules().meta,
      tasks: tasks.list, perf: progression.night, undone: tasks.undone(),
      blank: medication.active('concentracao') && Math.floor(simT / 7) % 2 === 1, mind: fx.mind,
      orders: goals.orders(), goalKey: goals.key, prep: prep.text(), closing: closing.text(),
      pickHint: { keyboard: 'Tab escolhe o objetivo', gamepad: '\u25C4 \u25BA escolhe o objetivo', touch: 'toque numa linha para marcar' }[input.device()] || '',
      fuels: Object.values(data.items.combustiveis).map((f) => ({ nome: f.nome, cor: f.cor })),
      aconteceu: branches ? branches.log() : [],
    }),
    inventory: () => ({ slots: inventory.slots, sel: inventory.sel, flash: inventory.flash }),
    tick: () => tick,
  });
  ui.setBright(opts.bright);
  const interaction = createInteraction(bus, { world, render, player, ui, aimOffset: () => ({ x: fx.aimX, y: fx.aimY }), holdScale: () => 1 / medication.slow });
  const secrets = createSecrets(bus, { world, render, interaction, inventory, progression, player, ui, save });
  // doors: a tap opens or closes (the scene animates them and takes the collider away while open)
  for (const id of world.doorIds()) {
    interaction.register({
      id: 'porta-' + id, reach: 2.4, priority: -0.5,
      aim: () => ({ box: world.aimBox(id, 0.05) }),
      enabled: () => !world.shut.has(id),
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
  tasks.attach(chores, customers); customers.attach(chores, tasks);
  const goals = createGoals(bus, { world, render, player, tasks, customers, chores, inventory, progression, ui, lastNight: rules.campanha.ultimaNoite });
  const office = createOffice(bus, { world, render, interaction, ui, time, progression, tasks, cash, data, inventory });
  const cameras = createCameras(bus, { render, world, ui, time, sanity, input, data, player, interaction, office, lighting, progression });
  cameras.onCode((typed) => { if (typed.endsWith('1998')) ui.toast(setLookMode(render.mode === '1998' ? 'novo' : '1998') === '1998' ? 'Modo 1998 ligado.' : 'Modo 1998 desligado.'); });
  // the customers who do not exist: the plan of the night, the tells, the strength they get from being served (customers.js asks through `hooks.ent`)
  const nonexistent = createNonexistent(bus, { data, progression, time, ui, cameras, cash });
  customers.hooks.ent = nonexistent;
  const dialogue = (who, lines, seed) => ui.dialogue(who, lines, seed);
  const narrative = createNarrative(bus, { world, interaction, customers, tasks, progression, time, ui, dialogue, data, cash, office });
  const mirror = createMirror({ world, render, player });
  const kit = createKit({ world, player, render, data });
  const entity = createEntity(bus, { world, render, player, sanity, lighting, inventory, progression, time, interaction, ui, kit, opts });
  const medication = createMedication(bus, { data, progression, sanity, time, inventory, interaction, world, ui, player, customers });
  const coffee = createCoffee(bus, { world, render, interaction, inventory, progression, sanity, time, ui, customers, data });
  world.displayFilter = (text, t) => medication.scramble(text, t);
  bus.on('sanity:add', (d, why) => sanity.add(d, why));
  const campaign = createCampaign(bus, { progression, sanity, entity, ui, save, secrets, rules, data, hooks: {
    startNight: (day) => startNight(day, false, false, true), showTitle: () => showTitle(), seed: () => baseSeed, playing: () => state === 'play',
    enterDayOff, leaveDayOff, newGame: () => { save.wipe(); newCampaign(); }, continueRun: () => continueRun(),
    enterExtra: () => enterExtra(), onExtraEnd: () => { extraNow = false; branches.event('r4', 'domingo'); },
  } });
  const events = await createEvents(bus, { opts, interaction, world, customers, progression, sanity, time, ui, player, lighting, data, render, tasks, narrative, inventory, office, medication, mirror, audioSys, cameras, chores, campaign, entity });
  weather = createWeather(bus, { world, render, player, time, progression, sanity, kit, chores, est: () => events.state, audioSys, ui, opts, area: () => lighting.area, lite: Boolean(input.touch?.mobile), lastNight: rules.campanha.ultimaNoite });
  const branchCtx = { opts, interaction, world, customers, traffic, progression, sanity, time, ui, player, lighting, data, render, tasks, narrative, inventory, office, medication, mirror, audioSys, cameras, chores, campaign, entity, cash, events, ties: progression.ties };
  const branches = await createBranches(bus, branchCtx);
  // the story branches plug into the manager's call (what they left to say, and the offer of the extra shift) and into the scenes of the regulars
  narrative.hooks.lines = () => {
    const out = [], tier = progression.ties.tier(), L = data.dialogue.telefone550.confianca?.[tier];
    if (L && progression.st.day > 1) out.push(L[(progression.st.day + progression.st.seed) % L.length]);
    out.push(...branches.callLines());
    return out;
  };
  narrative.hooks.after = async () => { if (progression.st.day === 6 && !branches.done('r4', 'aceitar') && !branches.done('r4', 'recusar')) await branches.offer('r4'); };
  customers.hooks.scene = async (scene, c) => {
    if (scene.evento) { branches.event(scene.ramo, scene.evento); return null; }
    return branches.offer(scene.ramo, [`${c.name} espera, na bomba ${c.pump}.`]);
  };
  const hoses = createHoses({ world, render, inventory, customers, player });
  const prep = createPrep(bus, { world, render, interaction, time, tasks, chores, progression, ui, narrative, customers, goals });
  const closing = createClosing(bus, { world, render, interaction, time, tasks, progression, ui, customers, narrative, goals, inventory, chores, cash, data, lastNight: rules.campanha.ultimaNoite });
  tasks.attachClosing(closing);
  const shift = createShift(bus, { nonexistent, branches, prep, closing, time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, input, cash, office, chores, medication, coffee, mirror });

  // on the phone the passing lines (the teaching, the hints, the speech, how to let go) sit in one place above the thumbs (mobile.css);
  // the objective of the night stays at the top, under the clock
  if (input.touch?.mobile) {
    const low = document.createElement('div'); low.id = 'mbottom';
    for (const id of ['coach', 'toast', 'say', 'carryhint']) { const e = ui.el[id]; if (e) low.appendChild(e); }
    ui.el.hud.appendChild(low);
  }
  bus.on('hint', (t) => ui.toast(t));
  bus.on('shift:closed', (summary, week, choice) => campaign.onClosed(summary, week, choice));
  bus.on('time:hour', () => ui.setCalendar(calText()));
  bus.on('time:minute', () => { if (state === 'play') ui.setClock(time.text()); });
  bus.on('shift:open', () => { ui.setCalendar(calText()); ui.setClock(time.text()); ui.setPrep(prep.text() || closing.text()); });
  // what the hands hold and how to let go of it, on the screen, for the device in use
  const DROPPABLE = new Set(['caixa', 'limpeza', 'escada', 'saco', 'entrega']);
  const dropText = () => ({ keyboard: 'Soltar: E em lugar vazio', gamepad: 'Soltar: A em lugar vazio', touch: 'Soltar: toque em lugar vazio' }[input.device()] || 'Soltar: E em lugar vazio');
  bus.on('carry', (c) => ui.setCarryHint(c && DROPPABLE.has(c.kind) ? dropText() : null));
  bus.on('interact:none', (act) => {
    if (inventory.drop()) return;
    const it = inventory.selectedItem();
    // on the phone, a tap on the floor (nothing there to use) walks there; the battery and the flask keep their "tap on nothing"
    if (act?.screen && input.touch?.mobile && it !== 'pilha' && it !== 'frasco' && walkToScreen(act.screen.x, act.screen.y)) return;
    if (it) inventory.useSelected();
  });
  bus.on('inventory:change', () => ui.showInventory());
  bus.on('sanity:stage', (s) => { if (s >= 2 && !opts.reduceFlash) bus.emit('sfx', 'coracao', { gain: 0.5 }); });

  // ------------------------------------------------------------------ states
  function showTitle() {
    state = 'title'; shift.abort(); audioSys.stopAmbient(); extraNow = false; if (extraRun) { extraRun.dispose?.(); extraRun = null; } branches.reset();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null);
    input.setMode('ui', render.canvas);
    campaign.reset(); leaveDayOff(true); thaw();
    save.card.reload();
    titleAt = simT; lighting.setTitle(true); titleStep(simT);
    if (audioSys.audio) audioSys.startTitleAmbient();
    const hasRun = save.hasRun();
    const run = save.card.data.run;
    const items = [];
    const where = () => (run.fase === 'folga' ? `Folga, semana ${progression.weekOf(run.day - 1)}` : run.fase === 'fim' ? 'O fim' : `Semana ${progression.weekOf(run.day)} · noite ${run.day}${run.snap && run.snap.v === snapshot.SNAP_VERSION ? ' · ' + snapshot.clockText(run.snap.minutes) : ''}`);
    if (hasRun) items.push({ label: () => 'CONTINUAR', sub: where, act: () => continueRun() });
    items.push({ label: () => (hasRun ? 'NOVO JOGO' : 'COMEÇAR'), act: () => (hasRun ? confirmNew() : newCampaign()) });
    items.push({ label: () => 'OPÇÕES', act: () => optionsScreen(showTitle) });
    items.push({ label: () => 'CONTROLES', act: () => ui.controlsScreen(showTitle) });
    items.push({ label: () => 'CARTÃO DE MEMÓRIA', act: () => openCard(showTitle) });
    items.push({ label: () => 'IMPORTAR CARTÃO', act: () => importCard(showTitle) });
    ui.menu({ title: 'O DIA QUE SOBRA', kind: 'title', lines: () => [titleLines()[0]], items });
  }
  /** The memory card screen, with the seed of the game on its foot (it is the place the seed lives). */
  const openCard = (back) => ui.cardScreen(save.card, back, cardRows(back), `Semente do jogo: ${baseSeed}  (?seed=N)`);
  // the title's picture: the station from the highway, the camera creeping to the Sun's sign, its light failing now and then
  let titleAt = 0, titleFov = 0, signFace = null;
  const unlockTitle = () => { if (state !== 'title') return; audioSys.init(); audioSys.startTitleAmbient(); };
  addEventListener('pointerdown', unlockTitle, true); addEventListener('keydown', unlockTitle, true);
  function titleStep(t) {
    const a = world.anchor('placaSol');
    if (!a) return;
    if (!signFace) {   // the way the sign's face looks, in the world (the anchor's direction is the model's, not turned)
      const m = world.posto.props['placa-sol']?.mesh?.[0];
      signFace = m ? m.getWorldDirection(new render.THREE.Vector3()).setY(0).normalize() : a.dir.clone().setY(0).normalize();
    }
    const c = titleCamera(t - titleAt, { x: a.pos.x, y: a.pos.y, z: a.pos.z, face: [signFace.x, signFace.z] }, { calm: opts.reduceFlash, portrait: render.size.cssH > render.size.cssW });
    player.place(new render.THREE.Vector3(c.x, 0, c.z), c.yaw);
    player.st.eye = c.y; player.st.pitch = c.pitch; titleFov = c.fov;
    world.posto.props['placa-sol']?.setPower(signPower(t - titleAt, { calm: opts.reduceFlash }));
  }
  /** The pause stops drawing the scene (the blur behind the menu is made once); anything that changes the picture lets it draw again. */
  let pauseDrawn = false;
  function thaw() { pauseDrawn = false; }
  // ---- end of the title screen ----
  const HOW = { gamepad: 'Analógicos andam e olham · A usa · Start pausa', touch: 'Direcional anda · arraste olha · toque usa', keyboard: 'WASD anda · mouse olha · E usa · Esc pausa' };
  function titleLines() {
    return ['Você é o frentista da madrugada. Abasteça, atenda, reponha.', HOW[input.device()] || HOW.keyboard];
  }
  /** The first minutes of a new game: what the buttons do, on the screen, for the device in the player's hands. */
  function coachLines() {
    const d = input.device();
    if (d === 'gamepad') return ['Analógicos andam e olham · LB corre', 'A usa · segure A para manipular', 'Select prancheta · Y lanterna · Start pausa'];
    if (d === 'touch') return ['Direcional anda · arraste a tela olha', 'Toque usa · toque e segure manipula', 'PRANCH. lista · LANT. lanterna'];
    return ['WASD anda · mouse olha · Shift corre', 'Mire no ponto central: E usa, segure E manipula', 'Q prancheta · F lanterna · Esc pausa'];
  }
  /** Applies the options that something outside the menus depends on (the text size, the volume). */
  function applyOpts() {
    root.style.setProperty('--ts', String(opts.text)); audioSys.setVolume(opts.volume);
    root.dataset.contrast = opts.contrast ? 'on' : 'off'; root.dataset.calm = opts.reduceFlash ? 'on' : 'off'; root.dataset.grain = opts.grain ? 'on' : 'off'; root.dataset.look = render.mode;
    input.touch?.mobile?.setOptions({ left: opts.left, scale: opts.btn, toggle: opts.toggle, lookSens: opts.look });
    if (input.tilt) {
      input.tilt.sensitivity = opts.gyroSens;
      const c = (v, a, b) => Math.max(a, Math.min(b, Number(v) || a));
      input.tilt.calib = { dead: c(opts.gyroDead, 2, 12), fullX: c(opts.gyroFx, 10, 50), fullY: c(opts.gyroFy, 10, 50) };
    }
  }
  /** One setting that goes through a list of values (OPT_STEPS): it stops at the ends (10 / 10 never falls to 0 / 0). */
  const stepIdx = (key) => Math.max(0, OPT_STEPS[key].findIndex((v) => Math.abs(v - opts[key]) < 1e-6));
  function stepMove(key, d) {
    const list = OPT_STEPS[key];
    opts[key] = list[Math.max(0, Math.min(list.length - 1, stepIdx(key) + d))]; saveOpts(opts); applyOpts();
    if (key === 'bright') ui.setBright(opts.bright);
  }
  const fader = (id, key, label, help, seg, cells) => ({ id, kind: 'fader', label, help, n: OPT_STEPS[key].length, i: () => stepIdx(key), set: (d) => stepMove(key, d), seg: () => seg(opts[key]), cells });
  const flag = (id, key, label, help, extra = {}) => ({ id, kind: 'switch', label, help, get: () => Boolean(opts[key]), toggle: () => { opts[key] = !opts[key]; saveOpts(opts); applyOpts(); }, ...extra });
  const qualityText = () => (opts.quality === 'auto' ? `AUTOMÁTICA (${(render.tier || 'medio').toUpperCase().replace('MEDIO', 'MÉDIA').replace('ALTO', 'ALTA')})` : { alto: 'ALTA', medio: 'MÉDIA', leve: 'LEVE' }[opts.quality] || 'AUTOMÁTICA');
  /** The options screen (from the title and from the pause): five tabs of controls, drawn as the panel of the station (see screens.js). */
  function optionsScreen(back, tab) {
    const touch = Boolean(input.touch?.mobile);
    const goTab = (t) => () => optionsScreen(back, t);
    const tabs = [
      { id: 'imagem', name: 'Imagem', rows: [
        { id: 'quality', kind: 'choice', label: 'QUALIDADE DA IMAGEM', help: 'Quanto o jogo desenha. Automática escolhe pelo aparelho; no celular a mais leve é a de partida.', text: qualityText,
          set: (d) => { const L = ['auto', 'alto', 'medio', 'leve']; opts.quality = L[(L.indexOf(opts.quality) + d + L.length) % L.length]; saveOpts(opts); render.setTier?.(opts.quality); thaw(); } },
        { id: 'modo1998', kind: 'switch', label: 'MODO 1998', help: 'A imagem e a interface do jogo como seriam em 1998. Troca na hora.', rebuild: true, hide: () => !(mode1998Unlocked() || render.mode === '1998'),
          get: () => render.mode === '1998', toggle: () => { setLookMode(render.mode === '1998' ? 'novo' : '1998'); } },
        fader('bright', 'bright', 'BRILHO', 'Clareia ou escurece a imagem do jogo. A noite é escura de propósito: aumente se não enxergar bem.', (v) => String(v)),
        flag('grain', 'grain', 'GRANULAÇÃO', 'Ruído e linhas finas sobre os menus, como numa tela antiga. Desligado, a interface fica limpa.'),
      ] },
      { id: 'som', name: 'Som', rows: [
        fader('volume', 'volume', 'VOLUME', 'O volume geral do jogo, de 0 a 10.', (v) => String(Math.round(v * 10))),
        { id: 'mute', kind: 'switch', label: 'SOM', help: 'Liga e desliga todo o som do jogo.', get: () => !opts.mute, toggle: () => { audioSys.init(); audioSys.setMuted(!opts.mute); saveOpts(opts); } },
      ] },
      { id: 'controles', name: 'Controles', rows: [
        fader('look', 'look', 'SENSIBILIDADE DO OLHAR', 'Quão rápido o olhar acompanha o mouse, o analógico ou o dedo.', (v) => String(v), 4),
        ...(touch ? [
          { id: 'gyro', kind: 'switch', label: 'GIROSCÓPIO', help: 'Olhar inclinando o celular.', get: () => opts.gyro, toggle: async () => {
            if (opts.gyro) { opts.gyro = false; input.tilt?.disable(); }
            else {
              const got = await input.tilt?.enable();
              if (got) { opts.gyro = true; if (got === 'pending') ui.toast('Toque na tela para liberar o giroscópio.'); }
              else ui.toast('Este aparelho não deu o giroscópio.');
            }
            saveOpts(opts); ui.redrawModal();
          } },
          fader('gyroSens', 'gyroSens', 'SENSIBILIDADE DO GIROSCÓPIO', 'Quão rápido o olhar acompanha a inclinação.', (v) => String(v), 4),
          { id: 'calib', kind: 'button', label: 'CALIBRAR O GIROSCÓPIO', help: 'Dois passos: o descanso e até onde inclinar.', act: () => gyroCalibrate(goTab('controles')) },
          flag('left', 'left', 'CANHOTO', 'Troca os lados do direcional e dos botões.', { on: 'SIM', off: 'NÃO' }),
          { id: 'btn', kind: 'choice', label: 'TAMANHO DOS BOTÕES', help: 'O tamanho dos botões na tela.', text: () => { const v = opts.btn; return v < 1 ? 'MENOR' : v === 1 ? 'NORMAL' : v < 1.3 ? 'GRANDE' : 'MAIOR'; }, set: (d) => stepMove('btn', d) },
          flag('toggle', 'toggle', 'SEGURAR AÇÕES', 'Tocar liga e desliga, ou segurar o dedo.', { on: 'TOCAR LIGA E DESLIGA', off: 'SEGURAR O DEDO' }),
        ] : []),
        { id: 'comandos', kind: 'button', label: 'VER OS CONTROLES', hint: 'teclado, controle e toque', help: 'O que cada tecla, botão ou toque faz.', act: () => ui.controlsScreen(goTab('controles')) },
      ] },
      { id: 'acess', name: 'Acessibilidade', rows: [
        { id: 'text', kind: 'choice', label: 'TAMANHO DO TEXTO', help: 'Aumenta o texto dos menus, das dicas e das falas.', text: () => (opts.text === 1 ? 'NORMAL' : opts.text === 1.25 ? 'GRANDE' : 'MAIOR'), set: (d) => stepMove('text', d) },
        flag('contrast', 'contrast', 'ALTO CONTRASTE', 'Fundos fechados e letras claras nos textos sobre a imagem e nos menus.'),
        flag('reduceFlash', 'reduceFlash', 'REDUZIR CLARÕES', 'Troca o que pisca por escurecimentos suaves. A placa do título não falha e a interface fica parada.', { on: 'SIM', off: 'NÃO' }),
      ] },
      { id: 'conteudo', name: 'Conteúdo', rows: [
        { id: 'n1', kind: 'note', text: 'O Dia que Sobra é um jogo de terror psicológico para adultos: uma noite de trabalho num posto que não fecha, com sustos, silêncio e luz que falha. Não tem sangue.' },
        { id: 'n2', kind: 'note', text: 'Há imagens que piscam e escurecem de repente.' },
        { id: 'goacc', kind: 'button', label: 'REDUZIR CLARÕES', hint: 'em Acessibilidade', help: 'Abre a aba de Acessibilidade, onde ficam os clarões e o contraste.', act: goTab('acess') },
      ] },
    ];
    return ui.optionsScreen({ tabs, back, tab, foot: 'Ficam salvas neste navegador.' });
  }
  /**
   * Calibrating the gyroscope (the phone): 1) the resting pose, held the way the player will play; 2) how far each way is
   * comfortable (that is the full speed); and the size of the still zone around rest. The screen shows the tilt live.
   */
  async function gyroCalibrate(back) {
    const t = input.tilt; if (!t) return back();
    if (!t.on) {
      const got = await t.enable();
      if (!got) { ui.toast('Este aparelho não deu o giroscópio.'); return back(); }
      opts.gyro = true; saveOpts(opts);
      if (got === 'pending') ui.toast('Toque na tela para liberar o giroscópio.');
    }
    const deg = (v) => `${Math.round(Math.abs(v))}°`;
    const now = () => t.live || { x: 0, y: 0 };
    const arrows = () => { const l = now(); return `${l.x >= 0 ? '◀' : '▶'} ${deg(l.x)}   ${l.y >= 0 ? '▲' : '▼'} ${deg(l.y)}`; };
    const meter = () => {   // a little level: the dot is the tilt, the brackets are the still zone
      const l = now(), W = 21, mid = 10, span = Math.max(opts.gyroFx, 12);
      const pos = Math.max(0, Math.min(W - 1, Math.round(mid - (l.x / span) * mid)));
      const dz = Math.max(1, Math.round((opts.gyroDead / span) * mid));
      return Array.from({ length: W }, (_, i) => (i === pos ? '●' : i === mid - dz || i === mid + dz ? '|' : '·')).join('');
    };
    let timer = null;
    const live = () => { clearInterval(timer); timer = setInterval(() => { if (!ui.modalOpen) { clearInterval(timer); return; } ui.redrawModal(); }, 120); };
    const leave = (fn) => () => { clearInterval(timer); fn(); };
    const DEAD = [3, 5, 8];
    // step 1: the resting pose
    const step1 = () => {
      t.recenter();
      ui.menu({
        title: 'CALIBRAR O GIROSCÓPIO', subtitle: '1 de 2 · DESCANSO', cls: 'wide',
        lines: () => ['Segure o celular do jeito que vai jogar, parado, e toque em PRONTO.', '', `Agora: ${arrows()}`, meter()],
        items: [
          { label: () => 'PRONTO', act: () => { t.recenter(); setTimeout(step2, 120); } },
          { label: () => 'VOLTAR', act: leave(back) },
        ],
        onBack: leave(back),
      });
      live();
    };
    // step 2: how far is comfortable each way, and the still zone
    const step2 = () => {
      const max = { l: 0, r: 0, u: 0, d: 0 };
      const watch = setInterval(() => {
        if (!ui.modalOpen) { clearInterval(watch); return; }
        const l = now();
        if (l.x > 0) max.l = Math.max(max.l, l.x); else max.r = Math.max(max.r, -l.x);
        if (l.y > 0) max.u = Math.max(max.u, l.y); else max.d = Math.max(max.d, -l.y);
      }, 60);
      const ok = () => Math.min(max.l, max.r) >= 8 && Math.min(max.u, max.d) >= 8;
      ui.menu({
        title: 'CALIBRAR O GIROSCÓPIO', subtitle: '2 de 2 · ATÉ ONDE INCLINAR', cls: 'wide',
        lines: () => ['Incline até onde é confortável para a esquerda, a direita, para cima e para baixo. Esse é o giro mais rápido.', '',
          `Esquerda ${deg(max.l)} · Direita ${deg(max.r)} · Cima ${deg(max.u)} · Baixo ${deg(max.d)}`, `Agora: ${arrows()}`, meter(),
          ok() ? 'Pode salvar.' : 'Incline um pouco mais em cada direção.'],
        items: [
          { label: () => 'SALVAR', act: () => {
            if (!ok()) { ui.toast('Incline um pouco mais em cada direção.'); return; }
            const c = (v) => Math.max(10, Math.min(50, Math.round(v * 0.85)));   // a bit inside the most: the full speed without straining
            opts.gyroFx = c(Math.min(max.l, max.r)); opts.gyroFy = c(Math.min(max.u, max.d));
            saveOpts(opts); applyOpts(); clearInterval(watch); clearInterval(timer); ui.toast('Giroscópio calibrado.'); back();
          } },
          { label: () => `ZONA PARADA:\u00A0\u2039\u00A0${opts.gyroDead <= 3 ? 'PEQUENA' : opts.gyroDead <= 5 ? 'MÉDIA' : 'GRANDE'}\u00A0\u203A`, cls: 'adj',
            act: () => {}, adj: (dx) => { const i = Math.max(0, DEAD.indexOf(opts.gyroDead)); opts.gyroDead = DEAD[Math.max(0, Math.min(2, (i < 0 ? 1 : i) + dx))]; saveOpts(opts); applyOpts(); } },
          { label: () => 'REFAZER', act: () => { clearInterval(watch); step1(); } },
          { label: () => 'VOLTAR', act: () => { clearInterval(watch); clearInterval(timer); back(); } },
        ],
        onBack: () => { clearInterval(watch); clearInterval(timer); back(); },
      });
      live();
    };
    step1();
  }
  function confirmNew() {
    ui.menu({
      title: 'NOVO JOGO', lines: ['Isto apaga a noite salva no cartão de memória. O resto do cartão fica.'],
      items: [{ label: () => 'NÃO, VOLTAR', act: showTitle }, { label: () => 'SIM, APAGAR E COMEÇAR', act: () => { save.wipe(); newCampaign(); } }],
      onBack: showTitle,
    });
  }
  /** A new game: the arrival and the manager (skippable), then the first night. `?nointro` and `?skiptutorial` go straight to the night. */
  async function newCampaign() {
    audioSys.init();
    const skip = params.skiptutorial || new URLSearchParams(location.search).has('nointro');
    if (!skip) await playIntro();
    startNight(1, !params.skiptutorial, false);
  }
  /** `chegada` then `gerente`. Holding Esc, Start or the PULAR button for a second skips what is playing and the rest of the intro. */
  async function playIntro() {
    state = 'cutscene'; time.pause(); shift.abort(); audioSys.stopAmbient(); lighting.dawnOff();
    ui.closeModal(); modalCount = 0; ui.hideHud(true); ui.toggleSheet(false);
    input.setMode('ui', render.canvas);
    try {
      const cs = await import('./cutscenes/player.js');
      cs.configureCutscenes({ render, audio: () => audioSys.audio, seed: baseSeed });
      for (const name of ['chegada', 'gerente']) {
        const info = await new Promise((res) => cs.playCutscene(name, { render, audio: () => audioSys.audio, seed: baseSeed, skippable: true, reduceFlash: opts.reduceFlash, onEnd: res }));
        if (info?.skipped) break;
      }
    } catch (e) { console.warn('the intro did not play:', e.message); }
  }
  /** The title's "continue": the run says where it stopped (a night, the day off after a week, or the end that was being told). */
  function continueRun() {
    audioSys.init();
    save.card.reload();
    const run = save.card.data.run;
    if (!run) { newCampaign(); return; }
    progression.fromRun(run);
    ui.closeModal(); modalCount = 0;
    pendingDayoff = run.snap && run.snap.type === 'folga' && run.snap.v === snapshot.SNAP_VERSION ? run.snap : null;
    if (campaign.resume(run)) return;
    pendingDayoff = null;
    const snap = run.snap && run.snap.type !== 'folga' && run.snap.v === snapshot.SNAP_VERSION && run.snap.day === run.day ? run.snap : null;
    if (snap) restoreSaved(snap);
    else startNight(run.day, false, true);
  }
  // ------------------------------------------------------------------ "save now", and the card as a file (systems/snapshot.js)
  const snapSys = () => ({
    bus, ui, time, progression, sanity, inventory, medication, cash, player, tasks, chores, customers, goals, narrative, events, branches, nonexistent, prep, closing, office, world, shift, data,
    nightSeed: nightSeedNow, baseSeed, entity, dayoff, state, weather,
    refresh: () => { ui.setClock(time.text()); ui.setCalendar(calText()); ui.setPrep(prep.text() || closing.text()); ui.showInventory(); },
  });
  /** Opens the saved night from its seed, then lays the saved moment over it. */
  function restoreSaved(snap) {
    restoreSeed = Number.isFinite(snap.seed) ? snap.seed : null;
    startNight(snap.day, false, true);
    let notes = [];
    try { notes = snapshot.restoreNight(snapSys(), snap).notes; } catch (e) { console.error('restore', e); ui.toast('Algo do salvamento não voltou.'); }
    ui.coach(null);
    ui.toast(`Noite retomada às ${time.text()}.`);
    restoreNotes = notes;
  }
  let restoreNotes = [];
  /** The pause's "save now": one saved moment per night (the next one replaces it). */
  function saveNow() {
    // the day off: the bills paid and left, the purchases, the messages heard, the money and where Heitor stands; `paidSum` and `billsPaid` come
    // with it so that what was paid is not charged again when the day off ends
    if (state === 'dayoff') {
      if (!dayoff || !dayoff.snapshotState) return report(false, '');
      const st = progression.st, next = st.day + 1;
      const snap = { v: snapshot.SNAP_VERSION, type: 'folga', day: next, slots: inventory.slots.slice(0, 4).map((q) => q || null), sel: inventory.sel, paidSum: st.paidSum, billsPaid: [...st.billsPaid], dayoff: dayoff.snapshotState(), debug: snapshot.debugBlock(snapSys()) };
      return report(save.saveNow(snap, { day: next, week: progression.weekOf(next), fase: 'folga', fim: 0 }), `FOLGA · SEMANA ${progression.weekOf(st.day)} · ${dayoff.clock}`);
    }
    const why = snapshot.whyNotNow({ progression, shift, cash, medication, extra: extraNow });
    if (why) { saveNote = why; ui.redrawModal(); return false; }
    const snap = snapshot.captureNight(snapSys());
    return report(save.saveNow(snap), `SEMANA ${progression.st.week} · NOITE ${progression.st.day} · ${time.text()}`);
  }
  function report(ok, what) {
    saveNote = ok ? `Salvo: ${what}.` : 'Não foi possível salvar neste navegador.';
    bus.emit('sfx', ok ? 'ui_ok' : 'ui_voltar', {});
    ui.redrawModal();
    return ok;
  }
  const isDebugCard = () => Boolean(params.debug || Object.keys(dbg).length);
  /** "EXPORTAR CARTÃO": the whole card of this browser as a .json file (a download; on a phone the share sheet is a second row). */
  function exportCard(share = false) {
    const card = snapshot.readStoredCard(save.storage, save.key);
    if (!card) { saveNote = 'O cartão está vazio: nada para exportar.'; ui.redrawModal(); return false; }
    let live = null;
    if (state === 'pause' || state === 'dayoff') { try { live = snapshot.debugBlock(snapSys()); } catch (e) { console.warn('debug block', e.message); } }
    const text = snapshot.buildExport(card, { debug: isDebugCard(), seed: baseSeed, state: live });
    const name = snapshot.fileName(isDebugCard());
    if (share) snapshot.shareText(name, text).then((ok) => { saveNote = ok ? 'Cartão compartilhado.' : 'Este aparelho não compartilha arquivos.'; ui.redrawModal(); });
    else { snapshot.downloadText(name, text); saveNote = `Cartão exportado: ${name}`; ui.redrawModal(); }
    return true;
  }
  const notice = (title, lines, back) => ui.menu({ title, lines, items: [{ label: () => 'VOLTAR', act: back }], onBack: back });
  /** "IMPORTAR CARTÃO": choose a file, check it, ask, and only then replace the card of this browser. */
  async function importCard(back) {
    const f = await snapshot.pickFile();
    if (!f) return;
    if (f.text === null) return notice('CARTÃO RECUSADO', ['O arquivo é grande demais ou não pôde ser lido.', 'Nada foi apagado.'], back);
    const res = snapshot.parseCardFile(f.text, f.size, { lastNight: rules.campanha.ultimaNoite });
    if (!res.ok) return notice('CARTÃO RECUSADO', [res.reason, 'Nada foi apagado.'], back);
    const extra = res.header.debug && !isDebugCard() ? ['Este arquivo veio do cartão de testes.'] : !res.header.debug && isDebugCard() ? ['Este arquivo veio do cartão de verdade; aqui ele vai para o cartão de testes.'] : [];
    ui.menu({
      title: 'IMPORTAR CARTÃO', subtitle: f.name.slice(0, 48),
      lines: [snapshot.describeCard(res.card), ...extra, 'Isto substitui o cartão deste navegador.'],
      items: [
        { label: () => 'NÃO, VOLTAR', act: back },
        { label: () => 'SIM, SUBSTITUIR', act: () => {
          const ok = snapshot.writeCard(save.storage, save.key, res.card);
          if (!ok) return notice('CARTÃO RECUSADO', ['Não foi possível gravar neste navegador.', 'Nada foi apagado.'], back);
          save.card.reload();
          if (state === 'pause') { ui.closeModal(); modalCount = 0; }
          showTitle();
          ui.toast('Cartão importado.');
        } },
      ],
      onBack: back, cls: 'wide',
    });
  }
  /** The two rows under the blocks of the card screen. */
  const cardRows = (back) => [
    { label: 'EXPORTAR CARTÃO', hint: 'Baixa o cartão inteiro, com o salvamento, como um arquivo .json.', act: () => exportCard(false) },
    ...(snapshot.canShareFile() ? [{ label: 'COMPARTILHAR CARTÃO', hint: 'Abre o compartilhar do aparelho com o arquivo do cartão.', act: () => exportCard(true) }] : []),
    { label: 'IMPORTAR CARTÃO', hint: 'Escolhe um arquivo .json de cartão e o põe no lugar deste.', act: () => importCard(() => openCard(back)) },
  ];
  /** from: the card (`fromCard`), a new run (default), or what is in memory already (`keep`: the next night of the run that is going on). */
  function startNight(day, tutorial, fromCard, keep = false) {
    audioSys.init();
    if (fromCard) save.load();
    else if (!keep) { progression.newRun(); }
    progression.st.fase = 'noite'; progression.st.fim = 0;
    campaign.resetNight(); secrets.beginNight();
    const resuming = restoreSeed !== null, wasExtra = extraNow;
    extraNow = false; if (extraRun) { extraRun.dispose?.(); extraRun = null; }
    nightSeedNow = restoreSeed ?? baseSeed * 100 + day; restoreSeed = null;      // (a saved moment keeps the seed of its night, whatever ?seed says now)
    ui.closeModal();
    state = 'play'; modalCount = 0;
    ui.hideHud(false);
    input.setMode('play', render.canvas); input.lock();
    audioSys.startAmbient();
    entity.reset();
    shift.begin({ day, seed: nightSeedNow, tutorial: tutorial && !progression.st.tutorialDone, event: params.event || null });
    if (!resuming) { const nm = branches.nightName(day), cal = progression.calendar(day); ui.nightCard(`Noite ${day}${nm ? ' · ' + nm : ''}`, `${cal.dia} · semana ${cal.week} · ${cal.weekName}`); }
    void wasExtra;
    weather.begin({ day, seed: nightSeedNow, week: progression.weekOf(day), tutorial: tutorial && !progression.st.tutorialDone, force: dbg.weather || wxParam(), age: dbg.moon ?? null });
    if (tutorial && !progression.st.tutorialDone) ui.coach(coachLines(), 18); else ui.coach([weather.opening()], 7);   // (the night's moon and weather, one line)
    if (params.sol) entity.force(params.sol, 2);
    if (dbg.sanity !== undefined && dbg.once) { sanity.reset(dbg.sanity, nightSeedNow); dbg.once = false; }
  }
  /** What the pause's punch card shows: the 28 days with the worked ones, tonight and its entry time, the week's goal and the marked objective. */
  function pauseInfo() {
    const st = progression.st, off = state === 'dayoff', wk = progression.weekOf(st.day), worked = [];
    for (let d = 1; d <= (off ? st.day : st.day - 1); d++) worked.push(d + progression.weekOf(d) - 1);
    const last = st.weekLog[st.weekLog.length - 1], rules_ = progression.weekRules(wk);
    // the entry time: when the attendant punched the clock; before he has, the start of the shift (23:00), so it never comes after "now"
    const entry = off ? '' : prep.punched && prep.punchedAt ? prep.punchedAt : time.fmt(PREP_FROM);
    return {
      worked, calDay: off ? st.day + wk : progression.calendar().calDay, week: wk, night: st.day, weekName: rules_.nome, folga: off, entry, punched: !off && prep.punched, time: off ? (dayoff?.clock || '') : time.text(),
      weekNow: off ? (last ? last.pts : 0) : st.weekPts + progression.night.pontos, meta: off && last ? last.meta : rules_.meta,
      goal: ui.el.goal.hidden ? '' : ui.el.goal.textContent.replace(/^\u25B6\s*/, ''),
    };
  }
  const pauseItems = (root_, back) => [
    { label: () => 'CONTINUAR', act: back },
    { label: () => 'SALVAR AGORA', act: () => saveNow() },
    { label: () => 'OPÇÕES', act: () => optionsScreen(root_) },
    { label: () => 'CONTROLES', act: () => ui.controlsScreen(root_) },
    { label: () => 'CARTÃO DE MEMÓRIA', act: () => openCard(root_) },
    { label: () => 'EXPORTAR CARTÃO', act: () => exportCard(false) },
    { label: () => 'SAIR PARA O TÍTULO', act: () => { ui.closeModal(); showTitle(); } },
    { label: () => 'MENU INICIAL', act: () => leaveToMenu() },
  ];
  function openPause() {
    if (state !== 'play' || ui.modalOpen) return;
    if (performance.now() - lastPauseAt < 200) return;
    lastPauseAt = performance.now();
    state = 'pause'; time.pause(); saveNote = ''; thaw();
    const back = () => { resume(); };
    const root_ = () => ui.menu({
      title: 'PAUSA', kind: 'pause', lines: () => [saveNote || 'Sair para o título perde o que não foi salvo agora.'],
      foot: () => `Semana ${progression.st.week} · noite ${progression.st.day} · dia ${progression.calendar().calDay} de 28 · ${time.text()}${params.debug ? ` · Semente ${nightSeedNow}` : ''}`,
      items: pauseItems(root_, back), side: () => ui.punchCard(pauseInfo()), onBack: back,
    });
    root_();
  }
  /** "MENU INICIAL" (the channel's console menu, one folder up): saves the way "sair para o título" does (the run on the card stays as it was; with `?debug` it is the separate debug card,
   *  so never the real one) and goes to the channel page. Nothing is written by the jump itself. */
  function leaveToMenu() { ui.closeModal(); showTitle(); location.href = '../'; }
  function resume() { state = 'play'; time.resume(); ui.closeModal(); }

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'play' && !ui.modalOpen) openPause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !ui.modalOpen) openPause(); });

  // ------------------------------------------------------------------ the day off and the endings
  const calText = () => { const c = progression.calendar(); return extraNow ? `SEMANA ${c.week} · DOMINGO EXTRA · DIA ${c.calDay + 1}/28` : `SEMANA ${c.week} · ${c.dia} · DIA ${c.calDay}/28`; };
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
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null); ui.closeModal(); modalCount = 0; ui.setCarryHint(null);
    input.setMode('play', render.canvas);
    if (!dayoffTried) {
      dayoffTried = true;
      try { const m = await import('./systems/dayoff.js'); dayoff = m.createDayOff(bus, { r: render, input, ui, audio: audioFacade, data, rng: mulberry32(baseSeed * 31 + 7) }); }
      catch (e) { console.warn('the day off is not there:', e.message); dayoff = false; }
    }
  }
  /** The extra Sunday (R4): the station shut, only the Sun's sign lit, no customers and no shift (the script `branches/domingo.js` is the whole night). */
  async function enterExtra() {
    audioSys.init();
    const st = progression.st;
    state = 'play'; modalCount = 0; extraNow = true;
    shift.abort(); entity.reset(); customers.clear(); customers.enable(false); chores.clear(); tasks.clear(); events.reset(); branches.reset(); cash.reset(); office.reset(); coffee.reset(); mirror.reset();
    ui.closeModal(); ui.hideHud(false); ui.toggleSheet(false); ui.coach(null);
    input.setMode('play', render.canvas); input.lock();
    audioSys.startAmbient();
    progression.startNight(st.day, nightSeedNow);
    sanity.reset(Math.max(0, st.sanidade), nightSeedNow);
    inventory.slots.splice(0, 4, 'lanterna', 'pilha', 'pilha', null); inventory.flash.charge = inventory.flash.max; inventory.flash.on = false; inventory.clearCarry();
    const br = world.posto.breakers; for (const a of br.areas) br.setOn(a, a === 'placa');
    const sp = world.anchor('spawn'); player.place(sp.pos, Math.atan2(-sp.dir.x, -sp.dir.z));
    time.setCap(240); time.setRate(2); time.start(0);
    narrative.openExtra();
    ui.setCalendar(calText()); ui.setClock(time.text()); ui.setPrep(''); ui.showInventory();
    ui.nightCard(`Domingo · ${branches.extraName()}`, `semana 1 · turno extra · dia ${progression.calendar().calDay + 1}`);
    extraRun = await branches.runNow('branches/domingo.js', { end: () => campaign.endExtra() });
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
      title: 'PAUSA', kind: 'pause', lines: () => [saveNote || 'Sair para o título guarda a folga: ela recomeça depois.'],
      foot: () => `Folga · semana ${progression.weekOf(progression.st.day)}${params.debug ? ` · Semente ${baseSeed}` : ''}`,
      items: pauseItems(root_, back), side: () => ui.punchCard(pauseInfo()), onBack: back,
    });
    saveNote = '';
    root_();
  });
  // the manager's message that he says he never left (week 3): the next 05:50 call mentions it
  bus.on('dayoff:ramo', (e) => { if (!e) return; if (e.k) branches.choose(e.ramo, e.k); if (e.evento) branches.event(e.ramo, e.evento); });   // a story choice made at home (R5)
  bus.on('dayoff:event', (e) => { if (e && e.id === 'secretaria') { progression.flag('secretaria'); progression.relatar('secretaria'); } });
  // without the day off's own file the week still turns: the sleep is counted as done
  bus.on('dayoff:start', (e) => {
    ui.setCalendar(`FOLGA \u00B7 SEMANA ${e.week}`); ui.setClock(dayoff?.clock || null);
    if (dayoff) {
      const saved = pendingDayoff; pendingDayoff = null;
      Promise.resolve(dayoff.start({ ...e, seed: saved?.dayoff?.seed ?? baseSeed * 100 + e.week })).then(() => {
        if (!saved) return;
        progression.st.paidSum = Number(saved.paidSum) || 0; progression.st.billsPaid = [...(saved.billsPaid || [])];
        for (let i = 0; i < 4; i++) inventory.slots[i] = saved.slots?.[i] || null;
        dayoff.restoreState(saved.dayoff); ui.setClock(dayoff.clock); ui.toast('Folga retomada.');
      });
      return;
    }     // the day off starts from this event (its own contract: `start(info)`)
    if (dayoff === false && !globalThis.__odqDayoffStub) Promise.resolve().then(() => bus.emit('dayoff:end', { sanidade: Math.min(100, e.sanidade + 40) }));
  });

  /**
   * What the story did, for the cutscene of the ending (src/cutscenes/final1.js to final4.js; the ending 5 does not change).
   *   ending 1: who comes with the manager (Rafael if the tank was put on credit, Dona Cida if her bag was given back, the street dweller if he was let stay),
   *             how the manager greets (his trust) and whether the sign has turned to the highway (the Sun's attention high).
   *   endings 2 to 4: a line from the manager's trust and one from the ties.
   */
  function endingVariant(id) {
    const P = progression, T = P.ties, tier = T.tier(), laco = LACO_IDS.reduce((a, k) => a + Math.max(0, T.laco(k)), 0);
    if (id === 1) return { chegam: [P.hasFlag('r1:fiar') && 'rafael', P.hasFlag('r9:devolver') && 'cida', P.hasFlag('r2:ficou') && 'morador'].filter(Boolean), saudacao: tier === 'neutro' ? undefined : tier, placa: T.solHigh() ? 'frente' : undefined };
    if (id >= 2 && id <= 4) return { conf: tier === 'neutro' ? undefined : tier, laco: laco >= 3 };
    return null;
  }
  // the endings: the cutscene `final<id>` (src/cutscenes) when there is one, then `ending:done` and the screen of the ending
  bus.on('ending', async ({ id }) => {
    state = 'ending'; time.pause(); shift.abort(); audioSys.stopAmbient(); entity.reset(); lighting.dawnOff();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null); ui.closeModal(); modalCount = 0;
    input.setMode('ui', render.canvas);
    const done = () => bus.emit('ending:done', { id });
    let played = false;
    try {
      const cs = await import('./cutscenes/player.js');
      if (cs.CUTSCENES['final' + id]) {
        const blocks = save.card.blocks();
        cs.configureCutscenes({ render, audio: () => audioSys.audio, seed: baseSeed });
        cs.playCutscene('final' + id, { render, audio: () => audioSys.audio, seed: baseSeed, blocks, cast: data.cast, variant: endingVariant(id), skippable: true, onEnd: done });
        played = true;
      }
    } catch (e) { console.warn('the ending cutscene did not play:', e.message); }
    if (!played) { ui.setFx({ vignette: 0.9, aimX: 0, aimY: 0, filter: '', lid: 0, black: 0.92 }); done(); }
  });

  // ------------------------------------------------------------------ the step
  // keys for the list of overlapping actions (input.js does not know them): R changes the selected action, 1 to 3 do that action (hold it to hold it)
  const extraActs = [], digitsDown = new Set();
  addEventListener('keydown', (e) => {
    if (state !== 'play' || ui.modalOpen || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyR') { if (interaction.cycle(1)) bus.emit('sfx', 'ui_mover', {}); return; }
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m && (interaction.current?.all?.length || 0) > 1) { extraActs.push({ type: 'down', immediate: false, pick: Number(m[1]) - 1 }); digitsDown.add(e.code); }
  });
  addEventListener('keyup', (e) => { if (digitsDown.delete(e.code)) extraActs.push({ type: 'up' }); });
  let rbWas = false;
  const padRB = () => { const gp = (navigator.getGamepads?.() || []).find((g) => g && g.connected); const now = Boolean(gp && gp.buttons[5] && gp.buttons[5].pressed); const edge = now && !rbWas; rbWas = now; return edge; };
  function presses(list) {
    for (const p of list) {
      if (ui.modalOpen || state !== 'play') {
        ui.handle(p);
        continue;
      }
      if (p.k === 'esc') openPause();
      else if (p.k === 'flash') { inventory.toggleFlash(); ui.showInventory(); }
      else if (p.k === 'sheet') ui.toggleSheet();
      // with the clipboard open the same keys choose the goal (Tab, the pad's left and right); closed, they choose what is in the hands
      else if (p.k === 'inv' || p.k === 'invNext') { if (ui.sheetOpen) goals.cycle(1); else { inventory.select(1); ui.showInventory(); } }
      else if (p.k === 'invPrev') { if (ui.sheetOpen) goals.cycle(-1); else { inventory.select(-1); ui.showInventory(); } }
      else if (p.k === 'crouch') player.toggleCrouch();
    }
  }
  function step(dt) {
    tick++;
    lighting.setTitle(state === 'title'); ui.setTitleLift(state === 'title');
    // the day off samples the input and runs its own modals and HUD (never two samples in a frame)
    if (state === 'dayoff') { simT += dt; if (tick % 20 === 0 && dayoff && dayoff.clock) ui.setClock(dayoff.clock); if (dayoff) { if (dayoff.update) dayoff.update(dt, simT); else dayoff.step?.(dt, simT); } return; }
    const intent = input.sample();
    // actions that overlap in the aim: a finger on one line of the list does that action; the keys 1 to 3 do the n-th; RB changes the selected one; R too
    for (const a of intent.acts) if (a.type === 'down' && a.screen) { const row = ui.choiceRowAt(a.screen.x, a.screen.y); if (row !== null) { a.choice = row; delete a.screen; } }
    if (padRB()) { if (interaction.cycle(1)) bus.emit('sfx', 'ui_mover', {}); }
    if (extraActs.length) intent.acts.push(...extraActs.splice(0));
    // a finger on the marked goal's strip (the phone): walk there, and nothing else
    if (input.touch?.mobile && !ui.sheetOpen && intent.acts.length) {
      intent.acts = intent.acts.filter((a) => {
        if (a.type !== 'down' || !a.screen || !ui.goalAt(a.screen.x, a.screen.y)) return true;
        walkToGoal(); return false;
      });
    }
    // a finger on the open clipboard marks a goal and does nothing else
    if (ui.sheetOpen && intent.acts.length) {
      intent.acts = intent.acts.filter((a) => {
        if (a.type !== 'down' || !a.screen) return true;
        const k = ui.sheetKeyAt(a.screen.x, a.screen.y);
        // on the phone, a tap outside the open sheet closes it (and does nothing else)
        if (k === null) { if (input.touch?.mobile) { ui.toggleSheet(false); return false; } return true; }
        if (k.startsWith('tab:')) ui.setSheetTab(k.slice(4)); else if (k) goals.toggle(k);
        return false;
      });
    }
    if (opts.look !== 1) { intent.look.yaw *= opts.look; intent.look.pitch *= opts.look; }
    if (state === 'title' && intent.press.length) unlockTitle();      // (the first press is the gesture the browser wants before sound)
    presses(intent.press);
    ui.update(dt);
    if (input.device() !== lastDevice) { lastDevice = input.device(); if (state === 'title' || state === 'pause') ui.redrawModal(); bus.emit('carry', inventory.carry); }   // (the let-go hint follows the device in use)
    simT += dt;
    if (state === 'play' && tick % 20 === 0) { ui.setClock(time.text()); ui.setPrep(prep.text() || closing.text()); }
    const wx = () => ({ hora: time.minutes / 60, telefoneToca: narrative.ringing, gaveta: ui.trayOpen ? 1 : 0, placaSorriso: events.placaSorriso });
    if (state === 'ending' || state === 'cutscene') return;
    if (state === 'title') { weather.stop(); titleStep(simT); world.update(simT, dt, wx()); lighting.update(dt, simT); audioSys.update(); return; }
    if (state === 'dayoff') weather.stop();
    if ((ui.modalOpen && !cameras.watching) || state !== 'play') { weather.calm(); world.update(simT, dt, wx()); lighting.update(dt, simT); audioSys.update(); return; }
    fx = sanity.fx(simT);
    if (medication.active('cor')) fx.filter = `saturate(0.3) contrast(0.9)${fx.filter ? ' ' + fx.filter : ''}`;
    fx.black = Math.max(entity.black, 0);
    fx.droop = medication.sleepy; fx.lid = medication.sleepy / 0.55 * 0.28 + (medication.blinking ? 0.4 : 0); fx.black = Math.max(medication.fade, entity.black, events.state.cut || 0);
    // hidden: the view is through the crack of the door, darker
    if (entity.hidden) { fx.lid = Math.max(fx.lid || 0, 0.34); fx.filter = `brightness(0.5)${fx.filter ? ' ' + fx.filter : ''}`; fx.vignette = Math.max(fx.vignette, 0.7); }
    time.step(dt);
    walkStep(dt, intent);
    player.step(dt, intent);
    interaction.update(dt, intent);
    feedMobile(dt);
    inventory.update(dt);
    medication.update(dt); coffee.update(dt); mirror.update(dt, simT);
    if (intent.acts.some((a) => a.type === 'down')) medication.blink();
    inventory.hand.position.set(0.3 + Math.sin(simT * 11.3) * fx.hand, -0.3 + Math.sin(simT * 8.7 + 1) * fx.hand, -0.6);
    tasks.update(dt);
    chores.update(dt);
    closing.update();
    traffic.update(dt);
    customers.update(dt, simT);
    nonexistent.update(dt, customers.list);
    narrative.update(dt);
    if (time.minutes >= 0) events.update(dt, simT);      // (the preparation before 00:00 has no scare events)
    if (time.minutes >= 0 && !extraNow) branches.update(dt, simT);
    if (extraRun && extraRun.update(dt, simT)) { extraRun.dispose?.(); extraRun = null; }
    prep.update(dt);
    cameras.update(dt, simT);
    const a = world.areaAt(player.st.x, 1, player.st.z);
    sanity.update(dt, { danger: world.danger(a), lit: lighting.litAt(player.st.x, player.st.z) || (inventory.flash.on && inventory.flash.charge > 0), calmArea: a && (a.id === 'loja' || a.id === 'escritorio') });
    const dng = world.danger(a);
    if (time.minutes >= 0) entity.update(dt, simT, { sanity: sanity.value, danger: dng, breath: intent.breath });      // (nor the Sun)
    entity.darkTick(dt, dng >= 3 && !lighting.litAt(player.st.x, player.st.z) && !(inventory.flash.on && inventory.flash.charge > 0));
    if (entity.done) { campaign.attacked(); return; }   // the Sun reached the player: ending 4
    shift.update(dt); campaign.update(dt);
    world.update(simT, dt, wx());
    weather.update(dt);
    lighting.update(dt, simT);
    audioSys.update();
    ui.setFx({ vignette: fx.vignette, aimX: fx.aimX, aimY: fx.aimY, filter: fx.filter, lid: fx.lid, black: fx.black });
  }
  /** A door that stays shut for the player: the old storeroom's before it is open to them, a room locked from inside, the shop's at closing. */
  const doorLocked = (id) => entity.locked.has(id) || world.shut.has(id) || (id === 'porta-deposito' && !secrets.depositoOpen());
  world.isLocked = doorLocked;
  // ---- the phone: a tap on the floor walks there; the actions, the hand and the hiding place on its layer ----
  let mobilePrompt = null, walkTo = null, aiming = null, handT = 0, beatT = 0;
  const _v = new render.THREE.Vector3(), _ray = new render.THREE.Raycaster(), _ndc = new render.THREE.Vector2();
  function walkToScreen(x, y) {
    if (state !== 'play' || entity.hidden) return false;
    const r = render.canvas.getBoundingClientRect();
    _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, render.camera);
    const d = _ray.ray.direction, o = _ray.ray.origin;
    if (d.y > -0.02) return false;                      // the sky, or the horizon: nowhere to walk to
    const k = -o.y / d.y, px = o.x + d.x * k, pz = o.z + d.z * k;
    if (k > 14 || k < 0.6) return false;
    if (!planWalk(px, pz)) return false;
    input.touch.mobile.walkMark(x, y);
    return true;
  }
  /**
   * The way to a floor point, round the walls and through the doors (the same A* the customers walk, nav.js). A point
   * inside something (a wall, a shelf, the counter) walks to the nearest free spot next to it; a point that cannot be
   * reached at all (a locked door, behind glass with no way round) answers false and nothing moves.
   */
  function planWalk(px, pz, stands = [], aim = null) {
    const nav = getNav(world, player), st = player.st, R = 0.34;
    // a vehicle (parked at a pump, or on its way) is a solid for the player too, but the nav keeps it out of its static graph
    const vehicles = world.colliders.filter((c) => c.vehicle && c.enabled !== false);
    const blocked = (x, z) => Boolean(nav.solidAt(x, z, R)) || vehicles.some((c) => x > c.min[0] - R - 0.12 && x < c.max[0] + R + 0.12 && z > c.min[2] - R - 0.12 && z < c.max[2] + R + 0.12);
    // the places to try, best first: where to stand for the thing (if the caller knows), the point itself, then free spots round it
    // (the nearest ring first, on the player's side of it)
    const cand = [];
    for (const s of stands) if (s && !blocked(s.x, s.z)) cand.push({ x: s.x, z: s.z });
    if (!blocked(px, pz)) cand.push({ x: px, z: pz });
    for (let r = 0.4; r <= 3.4 && cand.length < 10; r += 0.3) {
      const ring = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        if (!blocked(x, z)) ring.push({ x, z, d: Math.hypot(x - st.x, z - st.z) });
      }
      ring.sort((u, v) => u.d - v.d);
      cand.push(...ring.slice(0, 3));
    }
    let route = null;
    for (const t of cand.slice(0, 10)) { route = nav.path({ x: st.x, z: st.z }, { x: t.x, z: t.z }, { doors: (d) => !doorLocked(d) }); if (route && route.length) break; route = null; }
    if (!route) { ui.toast('Não dá para chegar lá por aqui.'); return false; }
    walkTo = { route, i: 0, t: 0, best: Infinity, still: 0, aim };
    aiming = null;
    return true;
  }
  /** Walking to the marked goal: to the floor by the place the marker shows, and then the view turns to what is to be used. */
  function walkToGoal() {
    const g = goals.current;
    const w = g?.where?.();
    if (!w || state !== 'play' || entity.hidden) return false;
    // a goal with fixed places to stand (the pump, behind the counter, the shelf, the tool) goes only there: the point where the marker hangs
    // may be a person or a car that moves
    let stands = g.stand?.() || [];
    const aimAt = () => g.aim?.() || g.where?.() || null;
    // the places from where the thing can be seen (no wall between) come first
    const target = aimAt();
    if (target && stands.length > 1) {
      const nav = getNav(world, player);
      const sees = (q) => { const d = Math.hypot(target.x - q.x, target.z - q.z), n = Math.max(1, Math.ceil(d / 0.25)); for (let i = 1; i < n; i++) { const c = nav.solidAt(q.x + (target.x - q.x) * i / n, q.z + (target.z - q.z) * i / n, 0.04); if (c && !(target.x > c.min[0] - 0.3 && target.x < c.max[0] + 0.3 && target.z > c.min[2] - 0.3 && target.z < c.max[2] + 0.3)) return false; } return true; };
      stands = [...stands.filter(sees), ...stands.filter((q) => !sees(q))];
    }
    if (!(stands.length ? planWalk(stands[0].x, stands[0].z, stands, aimAt) : planWalk(w.x, w.z, [], aimAt))) return false;
    bus.emit('sfx', 'ui_ok', {});
    return true;
  }
  /** On arriving at a goal: the view turns (yaw and pitch, quick but not a snap) to the middle of what the goal is about. */
  function aimStep(dt, intent) {
    if (!aiming) return;
    const looking = Math.abs(intent.look.yaw) + Math.abs(intent.look.pitch) > 1e-4;
    if (state !== 'play' || entity.hidden || ui.modalOpen || looking || Math.abs(intent.moveX) + Math.abs(intent.moveY) > 0.05) { aiming = null; return; }
    const p = aiming.p, st = player.st;
    const dx = p.x - st.x, dz = p.z - st.z, dy = p.y - st.eye, h = Math.hypot(dx, dz);
    const wantYaw = h > 0.05 ? Math.atan2(-dx, -dz) : st.yaw, wantPitch = Math.max(-1.0, Math.min(1.0, Math.atan2(dy, Math.max(h, 0.3))));
    const dyaw = Math.atan2(Math.sin(wantYaw - st.yaw), Math.cos(wantYaw - st.yaw)), dpit = wantPitch - st.pitch;
    aiming.t += dt;
    if ((Math.abs(dyaw) < 0.01 && Math.abs(dpit) < 0.01) || aiming.t > 1.6) { aiming = null; return; }
    intent.look.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), Math.max(2.2, Math.abs(dyaw) * 8) * dt);
    intent.look.pitch += Math.sign(dpit) * Math.min(Math.abs(dpit), Math.max(1.6, Math.abs(dpit) * 8) * dt);
  }
  /** Walking toward the tapped point: the stick's intent, until there, stuck, or the stick takes over. */
  function walkStep(dt, intent) {
    if (!walkTo) { aimStep(dt, intent); return; }
    if (state !== 'play' || entity.hidden || ui.modalOpen || Math.abs(intent.moveX) + Math.abs(intent.moveY) > 0.05) { walkTo = null; return; }
    const st = player.st, route = walkTo.route;
    let wp = route[walkTo.i];
    // a waypoint reached: on to the next one (the last one is where the player stops)
    while (walkTo.i < route.length - 1 && Math.hypot(wp.x - st.x, wp.z - st.z) < 0.45) { walkTo.i++; walkTo.best = Infinity; walkTo.still = 0; wp = route[walkTo.i]; }
    // a closed door on the way: it opens as the player comes near (the player would open it by hand anyway)
    for (const id of wp.doors || []) {
      const c = world.doors?.[id]?.collider; if (!c || world.doorOpen(id) || doorLocked(id)) continue;
      const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
      if (Math.hypot(cx - st.x, cz - st.z) < 1.8) { world.setDoor(id, 1); bus.emit('sfx', 'porta_abre', { pos: [cx, 1.2, cz] }); }
    }
    const dx = wp.x - st.x, dz = wp.z - st.z, dist = Math.hypot(dx, dz);
    const last = walkTo.i === route.length - 1;
    walkTo.t += dt;
    if (dist < walkTo.best - 0.05) { walkTo.best = dist; walkTo.still = 0; } else walkTo.still += dt;
    if ((last && dist < 0.35) || walkTo.still > 1.5 || walkTo.t > 40) {
      // got there (or as near as it gets) on the way to a goal: the view goes to the thing to be used
      const arrived = last && dist < 0.9, at = walkTo.aim && arrived ? walkTo.aim() : null;
      walkTo = null;
      if (at) aiming = { p: { x: at.x, y: at.y, z: at.z }, t: 0 };
      return;
    }
    // the view goes with the body: it turns to face where the player walks (quick but not a snap) and levels a little,
    // unless the finger is looking around right now (then the walk goes on sideways and the view is theirs)
    const looking = Math.abs(intent.look.yaw) + Math.abs(intent.look.pitch) > 1e-4;
    if (!looking) {
      // aim a little ahead: the waypoint after this one when this one is close, so the turn starts before the corner
      const nx = walkTo.i < route.length - 1 && dist < 1.4 ? route[walkTo.i + 1] : wp;
      const want = Math.atan2(-(nx.x - st.x), -(nx.z - st.z));
      const d = Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw));
      const turn = Math.sign(d) * Math.min(Math.abs(d), Math.max(2.4, Math.abs(d) * 7) * dt);
      intent.look.yaw += turn;
      intent.look.pitch += (-0.08 - st.pitch) * Math.min(1, dt * 3);
    }
    // a long way is run, a short one walked (and the last metre always walked, to stop where tapped)
    let rest = dist;
    for (let j = walkTo.i + 1; j < route.length; j++) rest += Math.hypot(route[j].x - route[j - 1].x, route[j].z - route[j - 1].z);
    if (rest > 3.5 && !(last && dist < 1.2)) intent.run = true;
    const fx_ = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    const k = (last ? Math.min(1, dist / 0.8) : 1) / dist;
    intent.moveY = (dx * fx_ + dz * fz) * k; intent.moveX = (dx * rx + dz * rz) * k;
  }
  function project(target) {
    const a = target?.aim?.();
    if (!a) return null;
    if (a.c) _v.copy(a.c); else if (a.box) a.box.getCenter(_v); else return null;
    _v.project(render.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    const W = render.size.cssW, H = render.size.cssH;
    return { x: Math.max(40, Math.min(W - 40, (_v.x + 1) / 2 * W)), y: Math.max(130, Math.min(H - 60, (1 - _v.y) / 2 * H - 14)) };
  }
  function feedMobile(dt) {
    const m = input.touch?.mobile;
    if (!m) return;
    const hid = state === 'play' && entity.hidden !== null;
    m.setHiding(hid);
    m.setSheet(state === 'play' && ui.sheetOpen);
    const p = state === 'play' && !ui.modalOpen ? mobilePrompt : null;
    if (p && p.text) {
      const list = p.list ? p.list.map((r) => ({ text: r.text, hold: r.hold })) : [{ text: p.text, hold: p.hold }];
      const primary = p.list ? Math.max(0, p.sel) : 0;
      if (p.progress !== null && p.progress !== undefined) list[primary].progress = Math.min(1, p.progress);
      input.setMobileActions({ list, primary, at: hid ? null : project(interaction.current?.target), label: list[primary].text, breath: entity.S.breath / 6 }, Boolean(p.list));
    } else input.setMobileActions(hid ? { list: [], breath: entity.S.breath / 6 } : null, false);
    // the hand: what the selected slot holds, and how many things are in the pocket
    if ((handT -= dt) <= 0) {
      handT = 0.25;
      const it = inventory.selectedItem(), n = inventory.slots.filter(Boolean).length;
      const name = { lanterna: `Lanterna ${inventory.flash.on ? 'ligada' : 'apagada'}`, pilha: 'Pilha', frasco: 'Frasco branco', cracha: 'Crachá' }[it] || 'Mãos vazias';
      m.setHand(state === 'play' && !ui.modalOpen ? { name, count: n, icon: it === 'lanterna' ? '◐' : it === 'pilha' ? '▮' : it ? '◆' : '·' } : null);
    }
    // in a hiding place, the phone beats like a heart while something is near
    if (hid && entity.S.near > 0 && !opts.reduceFlash) { if ((beatT -= dt) <= 0) { beatT = 0.8; m.buzz([18, 90, 28]); } } else beatT = 0;
  }
  function draw() {
    render.time(simT);
    if (state === 'dayoff') { goals.frame(0, simT, render.camera, { w: 1, h: 1 }, false); if (dayoff && dayoff.draw) dayoff.draw(); else render.draw(); return; }
    if (state !== 'play') goals.frame(0, simT, render.camera, { w: 1, h: 1 }, false);
    if (state === 'ending' || state === 'cutscene') return;
    if (state === 'pause') { if (pauseDrawn) return; pauseDrawn = true; } else pauseDrawn = false;
    const f = state === 'title' ? { roll: 0, fov: titleFov, shakeX: Math.sin(simT * 0.2) * 0.01, shakeY: 0 } : { roll: fx.roll, fov: fx.fov, shakeX: Math.sin(simT * 1.7) * fx.sway, shakeY: Math.sin(simT * 1.3) * fx.sway };
    if (state !== 'title') { f.shakeY = (f.shakeY || 0) + Math.sin(simT * 1.9) * fx.breath; f.droop = fx.droop; }
    { const sh = entity.shake + (events.state.shake || 0); if (sh > 0) { f.shakeX = (f.shakeX || 0) + Math.sin(simT * 61) * sh; f.shakeY = (f.shakeY || 0) + Math.cos(simT * 53) * sh; } }   // (the tremor of a scare)
    player.apply(render.camera, simT, f);
    if (state === 'play') goals.frame(0, simT, render.camera, { w: render.size.cssW, h: render.size.cssH }, true);
    hoses.update();
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
    bus, campaign, secrets, get dayoff() { return dayoff; }, entity, medication, coffee, mirror, world, time, player, sanity, progression, inventory, lighting, interaction, customers, traffic, tasks, chores, cash, office, narrative, events, branches, cameras, nonexistent, shift, save, ui, audioSys, data,
    opts, setLookMode, goals, prep, closing, hoses, planWalk, walkToGoal, get walking() { return walkTo; }, step, draw, showTitle, startNight, continueRun, openPause, resume,
    endingVariant, saveNow, exportCard, importCard, snapshot, get restoreNotes() { return restoreNotes; },
    get extraRun() { return extraRun; }, get extraNow() { return extraNow; },
    get state() { return state; }, get modalCount() { return modalCount; }, get fx() { return fx; }, get simT() { return simT; }, get nightSeed() { return nightSeedNow; }, get weather() { return weather; },
  };
  return api;
}
