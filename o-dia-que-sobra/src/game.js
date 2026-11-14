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
import { createGoals } from './systems/goals.js';
import { createPrep } from './systems/prep.js';
import { createHoses } from './systems/hoses.js';
import { mulberry32 } from './rng.js';
import { createCoffee } from './systems/coffee.js';
import { createMirror } from './systems/mirror.js';
import { createEntity } from './systems/entity.js';
import { createKit } from './systems/events/kit.js';
import { createSaveSystem } from './systems/save.js';
import { createAudioSystem } from './systems/audio.js';
import { createUI } from './ui.js';
import { showAttract } from './title.js';
import { firstPad } from '../vendor/engine/input.js';
import { money } from './util.js';

export const DT = 1 / 60;
const OPT_KEY = 'o-dia-que-sobra.opts';
const OPT_DEFAULT = { reduceFlash: false, mute: false, volume: 0.9, look: 1, text: 1, gyro: false, gyroSens: 1, left: false, btn: 1, toggle: false };
const OPT_STEPS = { volume: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], look: [0.5, 0.75, 1, 1.25, 1.5, 2], text: [1, 1.25, 1.5], gyroSens: [0.5, 0.75, 1, 1.5, 2], btn: [0.85, 1, 1.2, 1.4] };
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

  applyOpts();
  let lastDevice = 'keyboard', tick = 0, simT = 0, state = 'title', modalCount = 0, lastPauseAt = -1e9, nightSeedNow = 1;
  const glyph = (k) => ({ tap: { keyboard: 'E', gamepad: 'A', touch: 'TOQUE' }, hold: { keyboard: 'SEGURE E', gamepad: 'SEGURE A', touch: 'SEGURE' } }[k][input.device()] || 'E');
  let fx = sanity.fx(0);

  const ui = createUI(root, {
    device: () => input.device(), glyph,
    onPrompt: (p) => { mobilePrompt = p; },
    sheetPick: (k) => { if (k.startsWith('tab:')) ui.setSheetTab(k.slice(4)); else goals.toggle(k); },
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
      orders: goals.orders(), goalKey: goals.key, prep: prep.text(),
      pickHint: { keyboard: 'Tab escolhe o objetivo', gamepad: '\u25C4 \u25BA escolhe o objetivo', touch: 'toque numa linha para marcar' }[input.device()] || '',
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
  const goals = createGoals(bus, { world, render, player, tasks, customers, chores, inventory, progression, ui, lastNight: rules.campanha.ultimaNoite });
  const office = createOffice(bus, { world, render, interaction, ui, time, progression, tasks, cash, data, inventory });
  const cameras = createCameras(bus, { render, world, ui, time, sanity, input, data, player, interaction, office, lighting, progression });
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
  } });
  const events = await createEvents(bus, { opts, interaction, world, customers, progression, sanity, time, ui, player, lighting, data, render, tasks, narrative, inventory, office, medication, mirror, audioSys, cameras, chores, campaign, entity });
  const hoses = createHoses({ world, render, inventory, customers, player });
  const prep = createPrep(bus, { world, render, interaction, time, tasks, chores, progression, ui, narrative, customers, goals });
  const shift = createShift(bus, { prep, time, progression, sanity, customers, tasks, events, narrative, inventory, player, world, ui, save, rules, data, input, cash, office, chores, medication, coffee, mirror });

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
  bus.on('shift:open', () => { ui.setCalendar(calText()); ui.setClock(time.text()); ui.setPrep(prep.text()); });
  // what the hands hold and how to let go of it, on the screen, for the device in use
  const DROPPABLE = new Set(['caixa', 'limpeza', 'escada', 'saco']);
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
  function titleCamera() {
    const b = world.anchor('bomba2') || world.anchor('spawn');
    const p = b.pos.clone().addScaledVector(b.dir, 11); p.y = 0;
    player.place(p, Math.atan2(b.dir.x, b.dir.z));
    player.st.eye = 1.7;
  }
  function showTitle() {
    state = 'title'; shift.abort(); audioSys.stopAmbient();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null);
    input.setMode('ui', render.canvas);
    campaign.reset(); leaveDayOff(true);
    save.card.reload();
    titleCamera();
    const hasRun = save.hasRun();
    const run = save.card.data.run;
    const items = [];
    if (hasRun) items.push({ label: () => (run.fase === 'folga' ? `CONTINUAR  (FOLGA, SEMANA ${progression.weekOf(run.day - 1)})` : run.fase === 'fim' ? 'CONTINUAR  (O FIM)' : `CONTINUAR  (SEMANA ${progression.weekOf(run.day)} · NOITE ${run.day})`), act: () => continueRun() });
    items.push({ label: () => (hasRun ? 'NOVO JOGO' : 'COMEÇAR'), act: () => (hasRun ? confirmNew() : newCampaign()) });
    items.push({ label: () => 'OPÇÕES', act: () => optionsScreen(showTitle) });
    items.push({ label: () => 'CONTROLES', act: () => ui.controlsScreen(showTitle) });
    items.push({ label: () => 'CARTÃO DE MEMÓRIA', act: () => ui.cardScreen(save.card, showTitle) });
    const openMenu = () => ui.menu({
      title: 'O DIA QUE SOBRA', subtitle: 'Posto Bom Dia · Um novo dia sempre começa com um sorriso!',
      lines: titleLines, items, foot: () => `Semente do jogo: ${baseSeed}  (?seed=N)`,
    });
    // The first time after loading: the title screen (the name, the moving camera, one prompt); the menu after the press.
    // Tests (?manual, ?debug, ?nointro) and ?notitle go straight to the menu.
    if (!attractDone && !skipAttract) {
      attractDone = true;
      const saved = !hasRun ? null : run.fase === 'folga' ? 'CONTINUAR · FOLGA' : run.fase === 'fim' ? 'CONTINUAR · O FIM' : `CONTINUAR · SEMANA ${progression.weekOf(run.day)} · NOITE ${run.day}`;
      attractAt = simT; attractNext = openMenu;
      attract = showAttract({ root, saved, onStart: leaveAttract });
      attract.setDevice(attractDevice());
    } else openMenu();
  }
  // ---- the title screen before the title menu ----
  let attract = null, attractNext = null, attractAt = 0, attractDone = false;
  const skipAttract = params.manual || params.debug || /[?&](nointro|notitle)(=|&|$)/.test(location.search);
  const attractDevice = () => (firstPad() ? 'gamepad' : input.device() === 'gamepad' ? 'keyboard' : input.device());
  function leaveAttract() {
    if (!attract || simT - attractAt < 0.35) return;
    attract.close(); attract = null;
    bus.emit('sfx', 'ui_mover', {});
    const next = attractNext; attractNext = null;
    if (state === 'title' && next) next();
  }
  /** On the title the picture is the Sun sign at night, face on, from below, the camera only breathing. */
  let signFace = null;
  function titleDrift(t) {
    const a = world.anchor('placaSol');
    if (!a) return;
    if (!signFace) {   // the way the sign's face looks, in the world (the anchor's direction is the model's, not turned)
      const m = world.posto.props['placa-sol']?.mesh?.[0];
      signFace = m ? m.getWorldDirection(new render.THREE.Vector3()).setY(0).normalize() : a.dir.clone().setY(0).normalize();
    }
    const D = 7.5 + Math.sin(t * 0.11) * 0.4;
    const yaw = Math.atan2(signFace.x, signFace.z) + Math.sin(t * 0.07) * 0.05;
    const p = a.pos.clone(); p.x += Math.sin(yaw) * D; p.z += Math.cos(yaw) * D; p.y = 0;
    player.place(p, yaw);
    player.st.pitch = Math.atan2(a.pos.y - 1.3 - player.st.eye, D);
  }
  /** The sign's light during the title: mostly on, with the short failures of an old tube. */
  function titleSign(t) {
    const k = t % 7.3;
    const off = (k > 2.1 && k < 2.18) || (k > 2.3 && k < 2.36) || (k > 4.9 && k < 5.55) || (k > 5.7 && k < 5.76);
    world.posto.props['placa-sol']?.setPower(!off);
  }
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
    input.touch?.mobile?.setOptions({ left: opts.left, scale: opts.btn, toggle: opts.toggle, lookSens: opts.look });
    if (input.tilt) input.tilt.sensitivity = opts.gyroSens;
  }
  /** One setting that goes through a list of values: left/right (or a click) move along it. */
  function stepper(key, label, fmt) {
    const list = OPT_STEPS[key];
    const move = (d) => {
      const i = Math.max(0, list.findIndex((v) => Math.abs(v - opts[key]) < 1e-6));
      opts[key] = list[Math.max(0, Math.min(list.length - 1, i + d))]; saveOpts(opts); applyOpts();      // it stops at the ends: 10 / 10 never falls to 0 / 0
    };
    return { label: () => `${label}:\u00A0\u2039\u00A0${fmt(opts[key]).replace(/ /g, '\u00A0')}\u00A0\u203A`, act: () => move(1), adj: move };
  }
  /** The options screen (from the title and from the pause): volume, how fast the view turns, fewer flashes, the size of the text. */
  function optionsScreen(back) {
    const items = [
      stepper('volume', 'VOLUME', (v) => `${Math.round(v * 10)} / 10`),
      { label: () => `SOM: ${opts.mute ? 'DESLIGADO' : 'LIGADO'}`, act: () => { audioSys.init(); audioSys.setMuted(!opts.mute); saveOpts(opts); } },
      stepper('look', 'SENSIBILIDADE DO OLHAR', (v) => `${v}×`),
      { label: () => `REDUZIR CLARÕES: ${opts.reduceFlash ? 'SIM' : 'NÃO'}`, act: () => { opts.reduceFlash = !opts.reduceFlash; saveOpts(opts); } },
      stepper('text', 'TAMANHO DO TEXTO', (v) => (v === 1 ? 'NORMAL' : v === 1.25 ? 'GRANDE' : 'MAIOR')),
      // the phone: aiming by moving it, the side of the stick, the size of the buttons, holding or tapping
      ...(input.touch?.mobile ? [
        { label: () => `GIROSCÓPIO: ${opts.gyro ? 'LIGADO' : 'DESLIGADO'}`, act: async () => {
          if (opts.gyro) { opts.gyro = false; input.tilt?.disable(); }
          else if (await input.tilt?.enable()) opts.gyro = true;
          else ui.toast('Este aparelho não deu o giroscópio.');
          saveOpts(opts); ui.redrawModal();
        } },
        stepper('gyroSens', 'SENSIBILIDADE DO GIROSCÓPIO', (v) => `${v}×`),
        { label: () => `CANHOTO: ${opts.left ? 'SIM' : 'NÃO'}`, act: () => { opts.left = !opts.left; saveOpts(opts); applyOpts(); } },
        stepper('btn', 'TAMANHO DOS BOTÕES', (v) => (v < 1 ? 'MENOR' : v === 1 ? 'NORMAL' : v < 1.3 ? 'GRANDE' : 'MAIOR')),
        { label: () => `SEGURAR AÇÕES: ${opts.toggle ? 'TOCAR LIGA E DESLIGA' : 'SEGURAR O DEDO'}`, act: () => { opts.toggle = !opts.toggle; saveOpts(opts); applyOpts(); } },
      ] : []),
      { label: () => 'VOLTAR', act: back },
    ];
    items.forEach((it) => { if (it.adj) it.cls = 'adj'; });
    return ui.menu({
      title: 'OPÇÕES', items, onBack: back, cls: 'wide',
      lines: ['Esquerda e direita mudam o valor. No toque, o lado esquerdo da linha abaixa e o resto sobe.', 'Reduzir clarões troca o que pisca por escurecimentos suaves.'],
      foot: () => 'Ficam salvas neste navegador.',
    });
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
    state = 'cutscene'; time.pause(); shift.abort(); audioSys.stopAmbient();
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
    if (tutorial && !progression.st.tutorialDone) ui.coach(coachLines(), 18); else ui.coach(null);
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
      title: 'PAUSA', lines: ['Sair para o título perde a noite em andamento.'], foot: () => `Semana ${progression.st.week} · noite ${progression.st.day} · dia ${progression.calendar().calDay} de 28 · ${time.text()} · Semente ${nightSeedNow}`,
      items: [
        { label: () => 'CONTINUAR', act: back },
        { label: () => 'OPÇÕES', act: () => optionsScreen(root_) },
        { label: () => 'CONTROLES', act: () => ui.controlsScreen(root_) },
        { label: () => 'CARTÃO DE MEMÓRIA', act: () => ui.cardScreen(save.card, root_) },
        { label: () => 'SAIR PARA O TÍTULO', act: () => { ui.closeModal(); showTitle(); } },
        { label: () => 'MENU INICIAL', act: () => leaveToMenu() },
      ],
      onBack: back,
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
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null); ui.closeModal(); modalCount = 0; ui.setCarryHint(null);
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
      title: 'PAUSA', lines: ['Sair para o título guarda a folga: ela recomeça depois.'], foot: () => `Folga · semana ${progression.weekOf(progression.st.day)} · Semente ${baseSeed}`,
      items: [
        { label: () => 'CONTINUAR', act: back },
        { label: () => 'OPÇÕES', act: () => optionsScreen(root_) },
        { label: () => 'CONTROLES', act: () => ui.controlsScreen(root_) },
        { label: () => 'SAIR PARA O TÍTULO', act: () => { ui.closeModal(); showTitle(); } },
        { label: () => 'MENU INICIAL', act: () => leaveToMenu() },
      ],
      onBack: back,
    });
    root_();
  });
  // the manager's message that he says he never left (week 3): the next 05:50 call mentions it
  bus.on('dayoff:event', (e) => { if (e && e.id === 'secretaria') { progression.flag('secretaria'); progression.relatar('secretaria'); } });
  // without the day off's own file the week still turns: the sleep is counted as done
  bus.on('dayoff:start', (e) => {
    ui.setCalendar(`FOLGA \u00B7 SEMANA ${e.week}`); ui.setClock(dayoff?.clock || null);
    if (dayoff) { dayoff.start({ ...e, seed: baseSeed * 100 + e.week }); return; }     // the day off starts from this event (its own contract: `start(info)`)
    if (dayoff === false && !globalThis.__odqDayoffStub) Promise.resolve().then(() => bus.emit('dayoff:end', { sanidade: Math.min(100, e.sanidade + 40) }));
  });

  // the endings: the cutscene `final<id>` (src/cutscenes) when there is one, then `ending:done` and the screen of the ending
  bus.on('ending', async ({ id }) => {
    state = 'ending'; time.pause(); shift.abort(); audioSys.stopAmbient(); entity.reset();
    ui.hideHud(true); ui.toggleSheet(false); ui.setObjective(null); ui.setTotal(null); ui.setCalendar(null); ui.setClock(null); ui.closeModal(); modalCount = 0;
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
    // the day off samples the input and runs its own modals and HUD (never two samples in a frame)
    if (state === 'dayoff') { simT += dt; if (tick % 20 === 0 && dayoff && dayoff.clock) ui.setClock(dayoff.clock); if (dayoff) { if (dayoff.update) dayoff.update(dt, simT); else dayoff.step?.(dt, simT); } return; }
    const intent = input.sample();
    // actions that overlap in the aim: a finger on one line of the list does that action; the keys 1 to 3 do the n-th; RB changes the selected one; R too
    for (const a of intent.acts) if (a.type === 'down' && a.screen) { const row = ui.choiceRowAt(a.screen.x, a.screen.y); if (row !== null) { a.choice = row; delete a.screen; } }
    if (padRB()) { if (interaction.cycle(1)) bus.emit('sfx', 'ui_mover', {}); }
    if (extraActs.length) intent.acts.push(...extraActs.splice(0));
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
    if (attract) {   // the title screen: any press leaves it (and nothing else reads it)
      attract.setDevice(attractDevice());
      if (intent.press.some((p) => p.k !== 'nav' && p.k !== 'tab' && p.k !== 'digit')) leaveAttract();
      intent.press.length = 0;
    }
    presses(intent.press);
    ui.update(dt);
    if (input.device() !== lastDevice) { lastDevice = input.device(); if (state === 'title' || state === 'pause') ui.redrawModal(); bus.emit('carry', inventory.carry); }   // (the let-go hint follows the device in use)
    simT += dt;
    if (state === 'play' && tick % 20 === 0) { ui.setClock(time.text()); ui.setPrep(prep.text()); }
    const wx = () => ({ hora: time.minutes / 60, telefoneToca: narrative.ringing, gaveta: ui.trayOpen ? 1 : 0, placaSorriso: events.placaSorriso });
    if (state === 'ending' || state === 'cutscene') return;
    if (state === 'title') { titleDrift(simT); world.update(simT, dt, wx()); titleSign(simT); lighting.update(dt, simT); audioSys.update(); return; }
    if ((ui.modalOpen && !cameras.watching) || state !== 'play') { world.update(simT, dt, wx()); lighting.update(dt, simT); audioSys.update(); return; }
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
    traffic.update(dt);
    customers.update(dt, simT);
    narrative.update(dt);
    if (time.minutes >= 0) events.update(dt, simT);      // (the preparation before 00:00 has no scare events)
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
    lighting.update(dt, simT);
    audioSys.update();
    ui.setFx({ vignette: fx.vignette, aimX: fx.aimX, aimY: fx.aimY, filter: fx.filter, lid: fx.lid, black: fx.black });
  }
  // ---- the phone: a tap on the floor walks there; the actions, the hand and the hiding place on its layer ----
  let mobilePrompt = null, walkTo = null, handT = 0, beatT = 0;
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
    walkTo = { x: px, z: pz, t: 0, best: Infinity, still: 0 };
    input.touch.mobile.walkMark(x, y);
    return true;
  }
  /** Walking toward the tapped point: the stick's intent, until there, stuck, or the stick takes over. */
  function walkStep(dt, intent) {
    if (!walkTo) return;
    if (state !== 'play' || entity.hidden || ui.modalOpen || Math.abs(intent.moveX) + Math.abs(intent.moveY) > 0.05) { walkTo = null; return; }
    const st = player.st, dx = walkTo.x - st.x, dz = walkTo.z - st.z, dist = Math.hypot(dx, dz);
    walkTo.t += dt;
    if (dist < walkTo.best - 0.05) { walkTo.best = dist; walkTo.still = 0; } else walkTo.still += dt;
    if (dist < 0.35 || walkTo.still > 1.2 || walkTo.t > 15) { walkTo = null; return; }
    const fx_ = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    const k = Math.min(1, dist / 0.8) / dist;
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
    if (state === 'dayoff') { goals.frame(0, simT, render.camera, { w: 1, h: 1 }, false); if (dayoff && dayoff.draw) dayoff.draw(); else render.draw(); return; }
    if (state !== 'play') goals.frame(0, simT, render.camera, { w: 1, h: 1 }, false);
    if (state === 'ending' || state === 'cutscene') return;
    const f = state === 'title' ? { roll: 0, fov: 0, shakeX: Math.sin(simT * 0.2) * 0.05, shakeY: 0 } : { roll: fx.roll, fov: fx.fov, shakeX: Math.sin(simT * 1.7) * fx.sway, shakeY: Math.sin(simT * 1.3) * fx.sway };
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
    bus, campaign, secrets, get dayoff() { return dayoff; }, entity, medication, coffee, mirror, world, time, player, sanity, progression, inventory, lighting, interaction, customers, traffic, tasks, chores, cash, office, narrative, events, cameras, shift, save, ui, audioSys, data,
    opts, goals, prep, hoses, step, draw, showTitle, startNight, continueRun, openPause, resume,
    get state() { return state; }, get modalCount() { return modalCount; }, get fx() { return fx; }, get simT() { return simT; }, get nightSeed() { return nightSeedNow; },
  };
  return api;
}
