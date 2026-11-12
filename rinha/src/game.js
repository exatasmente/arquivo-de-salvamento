// The game: world state and the fixed-step simulation. step(dt) advances the world with no
// real clock and no unseeded randomness; draw() only reads the state and renders.
// Phases: cell (the base between fights), intro, fight, over (the fall), result.
import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { Brain, brainParams, fightSeed, nameFor } from './ai.js';
import { randomLook, PLAYER_LOOK } from './look.js';
import { resolveStrike, ZONE_NAME } from './combat.js';
import { FIGHT_R } from './ring.js';
import { buildScene as buildCell } from './scenes/cela.js';
import { createCard } from './save.js';
import { ITEMS, cycle } from './items.js';
import { playIntroVideo } from './intro-video.js';
import { createUI } from './ui.js';
import { buildScene as buildTrain } from './scenes/treino.js';
import { buildAnimal } from './models/animals.js'; // only for the crow, an ordinary bird
import { buildCreature } from './models/creatures.js';
import { check, tallyGroups } from './secrets.js';
import { createCutscenes } from './cutscene.js';
import { createTutorial } from './tutorial.js';

export const DT = 1 / 60;
const NO_INTENT = { moveX: 0, moveY: 0, guard: false, press: [] };
const EYE = 1.65;

export function createGame({ render, ring, input, audio, hud, params }) {
  const state = {
    t: 0, paused: false, hitstop: 0, shake: 0, hits: 0, last: null,
    seed: params.seed, debug: params.debug, oppGuard: false, camMode: 'auto', mode: params.free ? 'free' : 'fight', yaw: 0, pitch: 0, debugCmds: [], excite: 0, skipped: 0,
    phase: 'fight', phaseT: 0, fightNo: params.fight || 1, wins: 0, winner: null, name: '', fightSeed: 0, lastResult: null,
    credits: 0, coins: 0, inv: {}, active: null, fightT: 0, knockLevel: null, payout: null, ui: null, msg: '',
    curN: params.fight || 1, special: null, trained: false, coinFloor: true, appleUsed: false, stoneHeld: false, tempTaser: false,
    flags: { apple: false, compartment: false, stone: false, key: false, veteran: false },
  };
  const canvas = render.canvas, root = document.getElementById('app');

  const player = new Fighter(render, { id: 'player', fp: true, appearance: PLAYER_LOOK });
  render.scene.add(render.camera); render.camera.add(player.fpArms.root); // the arms ride on the camera
  let opp = null, brain = null;
  const fighters = [player];

  // ---- the cell and the memory card ----
  const cell = buildCell(render, { seed: params.seed, groups: tallyGroups() });
  render.scene.add(cell.group); cell.group.visible = false;
  const card = createCard();
  const cellPos = { x: -1.1, z: 1.2, step: 0 };
  // the crow on the grate (an ordinary crow) and a small locked cage next to the door
  const crow = buildAnimal(render, 'corvo', { seed: params.seed * 5 + 1, scale: 1.0 });
  // the creature's update() drives its own height, so it sits on a perch group that carries the place
  const crowPerch = new THREE.Group(); crowPerch.position.set(-2.42, cell.anchors.grade[1] + 0.02, cell.anchors.grade[2]);
  crow.root.rotation.y = -Math.PI / 2; crowPerch.add(crow.root); cell.group.add(crowPerch);
  const cage = new THREE.Group();
  { const bar = render.mat('#6c7384', {}), dark = render.mat('#2a2e3a', {});
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); cage.add(o); };
    box(0.9, 0.06, 0.8, dark, 0, 0.03, 0); box(0.9, 0.06, 0.8, dark, 0, 0.82, 0);
    for (const [x, z] of [[-0.42, -0.37], [0.42, -0.37], [-0.42, 0.37], [0.42, 0.37], [-0.14, 0.37], [0.14, 0.37], [0.42, 0], [-0.42, 0], [0, -0.37]]) box(0.04, 0.8, 0.04, bar, x, 0.42, z);
    cage.position.set(2.0, 0, 2.1); cell.group.add(cage); }
  const train = buildTrain(render, { seed: params.seed });
  render.scene.add(train.group); train.group.visible = false;
  const instructor = buildCreature(render, 'mestre', { seed: params.seed * 3 + 2, scale: 1.0 });
  instructor.root.position.set(train.anchors.instrutor[0], train.anchors.instrutor[1], train.anchors.instrutor[2]); instructor.root.rotation.y = train.facing.instrutor;
  train.group.add(instructor.root);
  train.parts.bonecoUm.visible = false;
  const cuts = createCutscenes(root);
  const TARGETS = [
    { id: 'painel', label: 'PAINEL', pos: new THREE.Vector3(cell.anchors.painel[0], 1.45, cell.anchors.painel[2]), reach: 2.7 },
    { id: 'porta', label: 'PORTA', pos: new THREE.Vector3(cell.anchors.porta[0], 1.5, cell.anchors.porta[2]), reach: 3.4 },
    { id: 'moeda', label: 'MOEDA', pos: new THREE.Vector3(cell.anchors.moeda[0], cell.anchors.moeda[1] + 0.1, cell.anchors.moeda[2]), reach: 2.6, when: () => state.coinFloor },
    { id: 'corvo', label: 'CORVO', pos: new THREE.Vector3(cell.anchors.grade[0] + 0.1, cell.anchors.grade[1] - 0.1, cell.anchors.grade[2]), reach: 3.6, when: () => state.coinFloor || state.coins > 0 },
    { id: 'jaula', label: 'JAULA', pos: new THREE.Vector3(2.0, 0.5, 2.1), reach: 2.4 },
  ];
  const cue = (name) => audio.cue(name);

  const uiApi = {
    sound: { play: (n, o) => audio.play(n, o), menu: () => audio.menu() },
    getCredits: () => state.credits,
    getInv: () => state.inv,
    buy(key) {
      const it = ITEMS[key];
      if (state.credits < it.price) return { ok: false, msg: 'CR INSUFICIENTES' };
      state.credits -= it.price; state.inv[key] = (state.inv[key] ?? 0) + it.uses;
      if (!state.active) state.active = key;
      tut.event({ type: 'bought', key });
      return { ok: true, msg: `${it.label} COMPRADO` };
    },
    /** The phrase and the number are checked against their hashes; anything else is refused. */
    async submit(text, kind) {
      if (!(await check(kind, text))) return 'NEGADO';
      if (kind === 'phrase') { state.flags.apple = true; found('S1'); return 'ABERTO'; }
      if (!state.flags.compartment) { state.flags.compartment = true; state.credits += 300; cell.parts.setCompartment(1); found('S3'); return 'ABERTO +300 CR'; }
      return 'ABERTO';
    },
    onCorrupt() { // block 13 (S5): readable after the first victory
      if (card.data.record.wins < 1 || state.phase !== 'cell') return false;
      ui.card.close(); found('S5');
      playCut('familia', () => { enterCell(); openUI('card', {}); });
      return true;
    },
    setPanel: (mode, text) => cell.parts.setPanel(mode, text),
  };
  const ui = createUI(root, uiApi);
  function openUI(which, opts) {
    state.ui = which; input.setMode('ui', canvas);
    if (which === 'shop') { ui.shop.open(opts); audio.play('painel_tecla', { key: 3 }); }
    else { ui.card.open(card.blocks(), opts); cue('cartao'); }
  }
  function closedUI() {
    const was = state.ui; state.ui = null;
    if (state.phase === 'cell') { input.setMode('free', canvas); cue('cela'); }
    else if (state.phase === 'train') input.setMode('fight', canvas);
    return was;
  }
  uiApi.onClose = () => { audio.back(); closedUI(); };
  uiApi.onCardClose = () => {
    const was = state.ui; state.ui = null; if (was !== 'card') return;
    input.setMode(state.phase === 'cell' ? 'free' : 'fight', canvas);
    if (state.paused) hud.menu.show(); else if (state.phase === 'cell') cue('cela');
  };

  function snapshot() { return { fightNo: state.fightNo, credits: state.credits, coins: state.coins, inv: { ...state.inv }, active: state.active, seed: params.seed, flags: { ...state.flags }, coinFloor: state.coinFloor }; }
  function loadCard() {
    const c = card.data.campaign;
    if (!c) return false;
    state.fightNo = c.fightNo; state.curN = c.fightNo; state.credits = c.credits; state.coins = c.coins ?? 0; state.inv = { ...c.inv }; state.active = c.active ?? null;
    state.flags = { apple: false, compartment: false, stone: false, key: false, veteran: false, ...(c.flags || {}) }; state.coinFloor = c.coinFloor ?? true;
    return true;
  }
  function freshCampaign() {
    state.fightNo = 1; state.curN = 1; state.credits = 0; state.coins = 0; state.inv = {}; state.active = null;
    state.flags = { apple: false, compartment: false, stone: false, key: false, veteran: false }; state.coinFloor = true;
  }
  /** A secret found: remembered on the card, it survives a game over. */
  function found(id) { if (card.addSecret(id)) hud.toast('SEGREDO ENCONTRADO', 2200); }

  // ---- cutscenes: one-second stand-ins until src/cutscenes/ is wired in ----
  function playCut(name, onEnd, extra = {}) {
    state.phase = 'cutscene'; state.ui = null; state.paused = false;
    ring.group.visible = false; cell.group.visible = false; train.group.visible = false; player.fpArms.root.visible = false;
    if (opp) opp.root.visible = false;
    hud.setCell(true); hud.setTut(null); hud.setApple(false); hud.result.hide();
    input.setMode('cut', canvas); audio.crowd(0); hud.setTitle('');
    cue({ 'entrada-ringue': 'ringue', 'fim-campanha': 'vitoria', familia: 'cartao' }[name] ?? 'cela');
    cuts.play(name, { onEnd, skippable: true, extra });
  }
  /**
   * The first time: the opening video (the house, the orchard, the first fight and the waking in the
   * cell, see intro-video.js), then the player walks in the cell where it ends. Without the video file
   * (or with ?cutscenes), the real-time cutscenes tell the start instead.
   */
  function story() {
    const cutscenes = () => playCut('casa', () => playCut('pomar', () => playCut('flashes', () => playCut('cela-acordar', () => enterCell()))));
    if (params.cutscenes || params.film) { cutscenes(); return; }
    state.phase = 'cutscene'; state.ui = null; state.paused = false;
    ring.group.visible = false; cell.group.visible = false; train.group.visible = false; player.fpArms.root.visible = false;
    if (opp) opp.root.visible = false;
    hud.setCell(true); hud.setTut(null); hud.setApple(false); hud.result.hide(); hud.setTitle('');
    input.setMode('cut', canvas);
    playIntroVideo({ root: document.getElementById('app'), audio, onEnd: (info) => (info.failed ? cutscenes() : enterCell()) });
  }

  function enterCell() {
    state.phase = 'cell'; state.ui = null; state.paused = false; state.special = null;
    ring.group.visible = false; cell.group.visible = true; train.group.visible = false; cell.lights.apply();
    if (opp) opp.root.visible = false;
    player.fpArms.root.visible = false;
    hud.setCell(true); hud.setTitle(''); hud.setFight(''); hud.result.hide(); hud.setDaze(null); hud.setTut(null); hud.setApple(false); hud.setStoneNear(false);
    cellPos.x = -1.1; cellPos.z = 1.2; state.yaw = 2.37; state.pitch = 0.05;
    input.setMode('free', canvas);
    cell.parts.setPanel('idle', ''); cell.parts.setDoor(0);
    cell.parts.setCoin(state.coinFloor); cell.parts.setCompartment(state.flags.compartment ? 1 : 0);
    crowPerch.visible = state.coinFloor || state.coins > 0;
    audio.crowd(0); cue('cela');
    cam.init = false;
  }

  /** Builds the opponent of fight n from the campaign seed and starts the fight (special: 'veteran'). */
  function startFight(n, special = null) {
    if (opp) { opp.dispose(); fighters.pop(); }
    state.curN = n; state.special = special;
    if (!special) state.fightNo = n;
    state.wins = Math.max(0, n - 1); state.winner = null; state.fightT = 0; state.knockLevel = null; state.payout = null; state.appleUsed = false; state.stoneHeld = false;
    ring.group.visible = true; ring.applyLights(); cell.group.visible = false; train.group.visible = false; player.fpArms.root.visible = true; hud.setCell(false); hud.setTut(null);
    ring.stone.mesh.visible = !state.flags.stone;
    input.setMode('fight', canvas); audio.setSeed(seed0(n));
    const seed = state.fightSeed = special ? fightSeed(params.seed ^ 0x5a5a, 99) : fightSeed(params.seed, n);
    const bp = brainParams(seed, special ? 5 : n);       // the Veteran has the fixed hardness of fight 5
    const look = randomLook(seed, { heavy: bp.d });
    if (n === 7 && !special) look.scale *= 1.07;          // the champion of the house
    if (special) Object.assign(look, { hair: '#8d8d8d', style: 'buzz', beard: 'full', scar: { x0: 20, y0: 20, len: 14, ang: 1.1 } });
    opp = new Fighter(render, { id: 'opp', appearance: look });
    fighters.push(opp);
    state.name = special ? 'VETERANO' : n === 7 ? 'CAMPE\u00c3O' : nameFor(seed);
    player.reset(0, -0.95, 0);
    opp.reset(0, 0.95, Math.PI);
    opp.power = bp.power; opp.takes = bp.takes; opp.speedScale = bp.speed;
    brain = params.dummy ? null : new Brain(bp, seed);
    if (params.dummy) { opp.fixed = true; opp.home = { x: 0, z: 0.95 }; }
    state.bp = bp;
    for (const f of fighters) { f.pose(); f.savePrev(); }
    cam.init = false;
    hud.result.hide(); hud.setTitle('');
    const label = special ? 'VETERANO' : `LUTA ${n}`;
    if (params.dummy || params.nointro) { state.phase = 'fight'; hud.setFight(label); cue('luta'); audio.crowd(0.3); }
    else { state.phase = 'intro'; hud.setTitle(label, state.name); hud.setFight(''); cue('ringue'); audio.crowd(0.25); audio.bell(); audio.whistle(); }
    state.phaseT = 0;
  }
  const seed0 = (n) => fightSeed(params.seed, n);
  function reset() { startFight(state.curN, state.special); }

  // ---- the training hall: the lesson against a fixed dummy ----
  const tut = createTutorial({
    state, player, hud, audio,
    device: () => input.device(),
    pushDummy: (k) => state.debugCmds.push(k),
    grantCredits: (n) => { state.credits += n; },
    ensureItem: (k) => { if (!state.inv[k]) { state.inv[k] = 1; state.tempTaser = true; } },
    openShop: (only) => openUI('shop', { only }),
    shopOpen: () => ui.shop.isOpen,
    closeShop: () => { if (ui.shop.isOpen) setTimeout(() => ui.shop.close(), 700); },
    openSave: () => {
      state.fightNo = 1;
      card.save(snapshot()); card.setIntroSeen(); state.trained = true;
      openUI('card', { saving: true, onClose: () => tut.event({ type: 'saved' }) });
    },
    onDone: () => {
      if (state.tempTaser) { delete state.inv.taser; state.tempTaser = false; if (state.active === 'taser') state.active = cycle(state.inv, 'taser', 1); }
      card.save(snapshot());
      playCut('treino-fim', () => beginFight(1), { blocks: card.blocks() });
    },
  });
  function startTraining() {
    if (opp) { opp.dispose(); fighters.pop(); }
    state.phase = 'train'; state.special = null; state.winner = null; state.ui = null;
    ring.group.visible = false; cell.group.visible = false; train.group.visible = true; train.lights.apply(); player.fpArms.root.visible = true;
    hud.setCell(false); hud.setTitle(''); hud.setFight('TREINO'); hud.setDaze(null);
    input.setMode('fight', canvas); cue('treino'); audio.crowd(0);
    opp = new Fighter(render, { id: 'dummy', appearance: randomLook(params.seed * 11 + 5, { heavy: 0.2 }) });
    fighters.push(opp); brain = null;
    player.reset(0, 1.1, Math.PI); opp.reset(0, -0.35, 0);
    opp.fixed = true; opp.home = { x: 0, z: -0.35 }; opp.takes = 0;
    for (const f of fighters) { f.pose(); f.savePrev(); }
    cam.init = false; state.credits = 0; state.inv = {}; state.active = null;
    tut.begin();
  }
  /** Starts fight n; the first fight of a campaign is preceded by the entrance to the ring. */
  function beginFight(n) {
    if (n === 1 && state.fightNo === 1 && !card.data.fights[1]) playCut('entrada-ringue', () => startFight(1));
    else startFight(n);
  }

  // ---- camera: the player's eyes. In a fight it aims at the opponent by itself; out of a fight
  // ('free') the view is turned by hand. Dodges move the head (the body pose already does), a
  // blow shakes the view toward the side it came from. ----
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, yaw: 0, pitch: 0, roll: 0 };
  const _t = new THREE.Vector3();
  function cameraStep(dt) {
    if (state.phase === 'cell') { cam.pos.set(cellPos.x, EYE + Math.sin(cellPos.step) * 0.015, cellPos.z); cam.roll = 0; return; }
    player.eye(cam.pos);
    if (state.camMode === 'side') { // debug view to inspect poses from the side
      cam.pos.set(3.3, 1.35, (player.z + opp.z) / 2); cam.look.set(0, 1.2, (player.z + opp.z) / 2); cam.roll = 0; return;
    }
    for (const sd of ['L', 'R']) opp.J['shoulder' + sd].visible = state.camMode !== 'face';
    if (state.camMode === 'face') { // debug close-up of the opponent's face
      const hc = opp.headCenter(new THREE.Vector3()), fw = opp.fwd();
      cam.pos.set(hc.x + fw[0] * 0.62 - fw[1] * 0.05, hc.y + 0.02, hc.z + fw[1] * 0.62 + fw[0] * 0.05); cam.look.copy(hc); cam.roll = 0; cam.yawOff = cam.pitchOff = 0; return;
    }
    if (state.mode === 'free') { cam.roll = 0; return; }
    if (player.knockdown) { // down on the canvas: the view follows the head
      const q = player.J.head.getWorldQuaternion(new THREE.Quaternion());
      cam.look.copy(cam.pos).add(new THREE.Vector3(0, 0, 1).applyQuaternion(q)); cam.roll = 0; cam.yawOff = cam.pitchOff = 0; cam.init = true; return;
    }
    opp.headCenter(_t); _t.y = Math.max(_t.y, 1.45); // a fallen opponent does not pull the view to the floor
    if (!cam.init) { cam.look.copy(_t); cam.init = true; }
    cam.look.lerp(_t, 1 - Math.exp(-14 * dt));
    const h = player.head, pre = player._pre ?? {};
    cam.roll = -(pre.leanZ ?? 0) * 0.7 - h.z * 1.6;
    cam.yawOff = h.y * 1.6; cam.pitchOff = -h.x * 1.4 - (pre.duck ?? 0) * 0.12;
    // disorientation: the view sways (light), more (medium), widest (heavy)
    const dz = player.daze;
    if (dz) {
      const k = THREE.MathUtils.clamp(dz.left / dz.dur, 0, 1) * { leve: 1, media: 0.8, pesada: 1.3 }[dz.level], t = state.t;
      cam.roll += Math.sin(t * 6.3) * 0.07 * k; cam.yawOff += Math.sin(t * 4.1) * 0.05 * k; cam.pitchOff += Math.sin(t * 5.2) * 0.03 * k;
    }
  }

  function applyCamera() {
    const c = render.camera;
    c.position.copy(cam.pos);
    if (state.shake > 0.001) {
      const s = state.shake, t = state.t;
      c.position.x += Math.sin(t * 91) * 0.012 * s; c.position.y += Math.sin(t * 77 + 1) * 0.01 * s;
    }
    if ((state.mode === 'free' || state.phase === 'cell') && state.camMode === 'auto') {
      c.rotation.set(state.pitch, state.yaw + Math.PI, 0, 'YXZ');
    } else {
      c.lookAt(cam.look);
      if (state.camMode === 'auto') { c.rotateZ(cam.roll); c.rotateY(cam.yawOff ?? 0); c.rotateX(cam.pitchOff ?? 0); }
    }
  }

  // ---- hits ----
  function onHit(info) {
    info.def.receiveHit(info);
    audio.hit(info.level, info.zone);
    if (state.phase === 'train' && info.att === player) { tut.event({ type: 'hit', info }); hud.popup(({ forehead: 'TESTA', chin: 'QUEIXO', temple: 'T\u00caMPORA', body: 'CORPO' })[info.zone], info.def.headCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0)), state.t, info.level); }
    if (info.def === opp && opp.knockdown) state.knockLevel = info.level;
    state.hits++; state.last = info;
    state.hitstop = info.level === 'pesada' ? 5 : info.level === 'bloq' ? 1 : 3;
    state.shake = Math.min(1, state.shake + (info.def === player ? 1 : 0.5) * ({ leve: 0.4, media: 0.7, pesada: 1, corpo: 0.3, bloq: 0.2 }[info.level] ?? 0.4));
    state.excite = Math.min(1, state.excite + 0.3);
    if (info.level === 'pesada' && hud.flash(state.t, 1)) audio.flash();
    if (state.debug) {
      const head = info.def.headCenter(new THREE.Vector3());
      const txt = `${ZONE_NAME[info.zone]} ${info.amount}${info.counter ? ' CONTRA' : ''}${info.blocked ? ' GUARDA' : ''}`;
      hud.popup(txt, head.add(new THREE.Vector3(0, 0.25, 0)), state.t, info.level);
    }
  }

  // ---- pause ----
  function setPause(p) {
    state.paused = p;
    if (p) { hud.menu.show(); state.cueBefore = audio.currentCue; cue('menu'); }
    else { hud.menu.hide(); if (state.cueBefore) cue(state.cueBefore); }
  }
  /** The pause menu's "memory card" entry. */
  function openCardFromPause() { hud.menu.hide(); openUI('card', {}); }
  let navLatch = 0;

  /** After the result: pay, save, and go back to the cell (a loss wipes the campaign). */
  function confirm() {
    if (state.phase !== 'result') return;
    hud.result.hide();
    if (state.winner === 'player') {
      const n = state.curN;
      if (state.special === 'veteran') {
        state.flags.veteran = true; card.save(snapshot());
        enterCell(); openUI('card', { saving: true, onClose: () => {} });
        return;
      }
      state.fightNo = n + 1;
      card.save(snapshot(), { n: Math.min(n, 7), seed: state.fightSeed, name: state.name, secs: state.fightT, reward: state.payout ? state.payout.total : 0 });
      const after = () => { enterCell(); openUI('card', { saving: true, onClose: () => {} }); };
      if (n === 7) playCut('fim-campanha', after); else after();
    } else {
      card.wipeCampaign(Math.max(0, state.fightNo - 1));   // the record and the secrets stay
      freshCampaign();
      enterCell();
    }
  }
  hud.result.onConfirm = confirm;

  function endFight(winner) {
    state.phase = 'over'; state.phaseT = 0; state.winner = winner;
    state.hitstop = 0; audio.knockdown(); audio.bell(); audio.whistle();
    cue(winner === 'player' ? 'vitoria' : 'gameover');
    if (winner === 'player') {
      if (state.special === 'veteran') {
        const gaveApple = !state.flags.apple; state.flags.apple = true;
        state.payout = { base: 500, quick: 0, knock: 0, coin: false, apple: gaveApple, total: 500 };
        state.credits += 500;
        return;
      }
      const n = state.curN, base = 100 + 25 * n, quick = state.fightT < 60 ? 50 : 0, knock = state.knockLevel === 'pesada' ? 50 : 0;
      state.payout = { base, quick, knock, coin: knock > 0, total: base + quick + knock };
      state.credits += state.payout.total;
      if (state.payout.coin) { state.coins++; crowPerch.visible = true; }
    }
  }

  // ---- S2: the stone at the foot of the yellow-taped post ----
  const stoneNear = () => !state.flags.stone && !state.stoneHeld && Math.hypot(player.x - ring.stone.x, player.z - ring.stone.z) < 1.0;
  function useStone() {
    if (state.stoneHeld) { // throw it: the opponent is stunned for 3 s, once per campaign
      state.stoneHeld = false; state.flags.stone = true; opp.stunT = 3; audio.play('pedra_lancar'); found('S2'); hud.toast('PEDRA!', 1500);
    } else if (stoneNear()) { state.stoneHeld = true; ring.stone.mesh.visible = false; audio.play('pedra_pegar'); hud.toast('ARREMESSE: F / \u2191 / PEDRA', 2200); }
  }

  // ---- items in the fight ----
  function useItem() {
    const k = state.active;
    if (!k || !(state.inv[k] > 0) || (state.phase !== 'fight' && state.phase !== 'train')) { audio.play('ui_voltar'); return; }
    if (k === 'taser') { opp.stunT = 2; audio.play('taser'); }
    else if (k === 'spray') { opp.blindT = 4; audio.play('spray'); }
    else if (k === 'bandage') { player.balance = Math.min(100, player.balance + 30); player.noGuardT = 1.5; audio.play('ui_ok'); }
    state.inv[k]--; tut.event({ type: 'used', key: k });
    if (state.inv[k] <= 0) { delete state.inv[k]; state.active = cycle(state.inv, k, 1); }
  }

  // ---- the cell: walking, looking, and what the centre dot points at ----
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  function currentTarget() {
    _f.set(Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), Math.cos(state.yaw) * Math.cos(state.pitch));
    let best = null, bestAng = 0.42;
    for (const t of TARGETS) {
      if (t.when && !t.when()) continue;
      _v.set(t.pos.x - cellPos.x, t.pos.y - EYE, t.pos.z - cellPos.z);
      const d = _v.length(); if (d > t.reach) continue;
      const ang = _v.normalize().angleTo(_f);
      if (ang < bestAng) { best = t; bestAng = ang; }
    }
    return best;
  }
  function tapTarget(x, y) {
    // a tap on the object itself, or near the centre dot, uses it
    const w = render.size.cssW, h = render.size.cssH, p = new THREE.Vector3();
    let best = null, bd = 80;
    for (const t of TARGETS) {
      if (t.when && !t.when()) continue;
      if (Math.hypot(t.pos.x - cellPos.x, t.pos.z - cellPos.z) > t.reach * 1.25) continue;
      p.copy(t.pos).project(render.camera);
      if (p.z > 1) continue;
      const d = Math.hypot((p.x * 0.5 + 0.5) * w - x, (-p.y * 0.5 + 0.5) * h - y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best && Math.hypot(x - w / 2, y - h / 2) < 70) best = currentTarget();
    return best;
  }
  function interact(t) {
    if (!t) return;
    if (t.id === 'painel') openUI('shop');
    else if (t.id === 'porta') { audio.play('porta_cela'); cell.parts.setDoor(1); if (!state.trained) startTraining(); else beginFight(state.fightNo); }
    else if (t.id === 'moeda') { state.coinFloor = false; state.coins++; cell.parts.setCoin(false); audio.play('moeda'); hud.toast('MOEDA BRILHANTE', 1800); }
    else if (t.id === 'corvo') {
      if (state.coins < 1) { hud.toast('O CORVO N\u00c3O TIRA O OLHO DA MOEDA', 2200); audio.play('corvo'); return; }
      state.coins--; audio.play('corvo');
      if (!state.flags.key) { state.flags.key = true; found('S4'); hud.toast('O CORVO TROCA A MOEDA POR UMA CHAVE', 2800); }
      else { state.credits += 40; hud.toast('+40 CR', 1800); }
      crowPerch.visible = state.coinFloor || state.coins > 0;
    }
    else if (t.id === 'jaula') {
      if (!state.flags.key) { hud.toast('TRANCADA', 1600); audio.play('ui_voltar'); }
      else if (state.flags.veteran) hud.toast('A JAULA EST\u00c1 VAZIA', 2000);
      else { audio.play('porta_cela'); startFight(5, 'veteran'); }
    }
  }
  state.target = null;

  function cellStep(dt, intent) {
    state.t += dt;
    state.yaw += intent.look.yaw; state.pitch = THREE.MathUtils.clamp(state.pitch + intent.look.pitch, -1.2, 1.2);
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw), rx = -Math.cos(state.yaw), rz = Math.sin(state.yaw);
    const sp = 2.0, mx = intent.moveX, my = intent.moveY, m = Math.hypot(mx, my) || 1, k = Math.min(1, m) / m;
    const vx = (fx * my + rx * mx) * k * sp, vz = (fz * my + rz * mx) * k * sp;
    cellPos.x += vx * dt; cellPos.z += vz * dt;
    const S = cell.size, M = 0.45;
    cellPos.x = Math.max(S.x0 + M, Math.min(S.x1 - M, cellPos.x)); cellPos.z = Math.max(S.z0 + M, Math.min(S.z1 - M, cellPos.z));
    const moving = Math.hypot(vx, vz) > 0.3;
    if (moving) { const before = Math.floor(cellPos.step / Math.PI); cellPos.step += dt * 8; if (Math.floor(cellPos.step / Math.PI) !== before) audio.play('passo'); }
    state.target = currentTarget();
    for (const p of intent.press) {
      if (p.k === 'interact' || (p.k === 'confirm' && false)) interact(state.target);
      else if (p.k === 'tap') interact(tapTarget(p.x, p.y));
    }
    cell.update(state.t); if (crowPerch.visible) crow.update(state.t, 0);
    cameraStep(dt);
  }

  function uiStep(intent) {
    const cur = state.ui === 'shop' ? ui.shop : ui.card;
    for (const p of intent.press) {
      if (p.k === 'nav') cur.nav(p.dx, p.dy);
      else if (p.k === 'tab' && state.ui === 'shop') ui.shop.tab(p.d);
      else if (p.k === 'confirm') cur.confirm();
      else if (p.k === 'pause') { cur.back(); }
    }
    cameraStep(DT);
  }

  function step(dt = DT) {
    const intent = input.sample();
    if (state.ui) { uiStep(intent); return; }
    for (const p of intent.press) {
      if (p.k === 'pause' && state.phase !== 'result' && state.phase !== 'cutscene') { setPause(!state.paused); audio.menu(); } // a cutscene runs on its own clock: no pause there
      else if (p.k === 'skip') { state.skipped++; cuts.skip(); }
    }
    if (state.paused) {
      const dir = intent.moveY > 0.6 ? -1 : intent.moveY < -0.6 ? 1 : 0;
      if (dir && !navLatch) { hud.menu.nav(dir); audio.menu(); }
      navLatch = dir;
      if (intent.press.some((p) => p.k === 'upper' || p.k === 'confirm')) hud.menu.activate();
      return;
    }
    if (state.phase === 'cutscene') { state.t += dt; cuts.update(dt); return; }
    if (state.phase === 'cell') { cellStep(dt, intent); return; }
    if (state.phase === 'result') {
      if (intent.press.some((p) => p.k === 'confirm' || p.k === 'upper')) confirm();
      cameraStep(dt);
      return;
    }
    if (state.hitstop > 0) { state.hitstop--; state.shake *= 0.9; cameraStep(dt); return; }

    state.t += dt; state.phaseT += dt;
    if (state.mode === 'free') {
      state.yaw += intent.look.yaw; state.pitch = THREE.MathUtils.clamp(state.pitch + intent.look.pitch, -1.2, 1.2);
      player.freeYaw = state.yaw;
    }
    const training = state.phase === 'train', live = state.phase === 'fight' || training;
    if (state.phase === 'fight') state.fightT += dt;
    if (state.phase === 'intro' && state.phaseT >= 2.2) { state.phase = 'fight'; state.phaseT = 0; hud.setTitle(''); hud.setFight(state.special ? 'VETERANO' : `LUTA ${state.curN}`); cue('luta'); audio.crowd(0.3); }
    if (live) {
      for (const p of intent.press) {
        if (p.k === 'item') useItem();
        else if (p.k === 'itemNext' || p.k === 'itemPrev') { const before = state.active; state.active = cycle(state.inv, state.active, p.k === 'itemNext' ? 1 : -1); if (state.active !== before) tut.event({ type: 'swap' }); }
        else if (p.k === 'stone' && state.phase === 'fight') useStone();
      }
    }
    if (state.phase === 'fight' && state.flags.apple && !state.appleUsed && player.balance < 25 && !player.knockdown) { // S1: the golden apple, bitten at once
      player.balance = 100; state.appleUsed = true; hud.toast('VOC\u00ca MORDE A MA\u00c7\u00c3 DOURADA', 2200); audio.play('ui_ok');
    }
    const myIntent = live ? intent : { ...NO_INTENT };
    let oppIntent = { ...NO_INTENT, guard: state.oppGuard };
    if (live && brain) oppIntent = brain.think(dt, opp, player);
    oppIntent.press = [...(oppIntent.press ?? []), ...state.debugCmds.splice(0).map((k) => ({ k }))];
    player.step(dt, myIntent, opp);
    opp.step(dt, oppIntent, player);

    // fighters do not overlap; a dummy is not pushed, the others share the push
    const dx = player.x - opp.x, dz = player.z - opp.z, d = Math.hypot(dx, dz), min = 0.8;
    if (d < min && d > 1e-4) {
      const push = min - d, ux = dx / d, uz = dz / d, sh = opp.fixed ? 1 : 0.5;
      player.x += ux * push * sh; player.z += uz * push * sh;
      if (!opp.fixed) { opp.x -= ux * push * (1 - sh); opp.z -= uz * push * (1 - sh); }
    }
    for (const f of fighters) { const r = Math.hypot(f.x, f.z); if (r > FIGHT_R) { f.x *= FIGHT_R / r; f.z *= FIGHT_R / r; } }

    for (const f of fighters) { f.pose(); f.trackGloves(dt); }
    if (training) { opp.balance = 100; if (player.knockdown) { player.knockdown = false; player.fallT = 0; player.balance = 55; } }
    if (live || state.phase === 'over') {
      const hits = state.phase === 'over' ? [] : [resolveStrike(player, opp), resolveStrike(opp, player)].filter(Boolean);
      for (const h of hits) onHit(h);
    }
    for (const f of fighters) {
      f.savePrev();
      for (const e of f.events.splice(0)) {
        if (e.type === 'wind') audio.swing(e.kind);
        if (e.type === 'dodge') { audio.dodge(); if (f === player) tut.event({ type: 'dodge', dir: e.dir }); }
      }
    }
    if (training) tut.update(dt, { speed: Math.hypot(player.vx, player.vz), guardAmt: player.guardAmt });
    if (state.phase === 'fight') {
      if (player.knockdown) endFight('opp'); else if (opp.knockdown) endFight('player');
    } else if (state.phase === 'over' && state.phaseT >= 1.8) {
      state.phase = 'result';
      const won = state.winner === 'player';
      state.lastResult = won ? 'win' : 'loss';
      const P = state.payout, lines = won ? [`PR\u00caMIO +${P.base}`, P.quick ? `LUTA CURTA +${P.quick}` : '', P.knock ? `NOCAUTE +${P.knock}` : '', P.coin ? 'MOEDA BRILHANTE +1' : '', P.apple ? 'MA\u00c7\u00c3 DOURADA' : ''].filter(Boolean) : [`RECORDE: LUTA ${card.data.record.best}`];
      hud.result.show(won ? (state.curN === 7 && !state.special ? 'CAMPANHA COMPLETA' : 'VIT\u00d3RIA') : 'DERROTA',
        won ? `${state.special ? 'VETERANO' : 'LUTA ' + state.curN} - ${state.name}` : 'A CAMPANHA FOI APAGADA', `SEMENTE ${params.seed}-${state.curN}`, lines);
    }
    state.shake *= Math.exp(-6 * dt); state.excite *= Math.exp(-0.8 * dt);
    if (training) {
      train.update(state.t);
      // the master shows the guard while the guard step is on, and waits at rest otherwise
      instructor.update(state.t, tut.active && tut.steps[tut.i].id === 'guard' ? 'guarda' : 'parado');
    } else { ring.setJudgeRaised((state.phase === 'intro' && state.phaseT < 1.4) || (state.phase === 'over' && state.phaseT < 1.4)); ring.setExcited(Math.min(player.balance, opp.balance) < 50); ring.update(state.t, state.excite); } // the fight heats up
    if (state.phase === 'fight' && Math.floor(state.t * 2) !== Math.floor((state.t - dt) * 2)) audio.crowd(Math.min(1, 0.25 + 0.55 * state.excite + (ring.excited ? 0.2 : 0)));
    cameraStep(dt);
  }

  let lastItemText = '';
  function draw() {
    applyCamera();
    hud.setCredits(state.credits);
    const it = state.stoneHeld ? 'PEDRA' : state.active && state.inv[state.active] > 0 ? `${ITEMS[state.active].label} x${state.inv[state.active]}` : '';
    hud.setItem(it);
    hud.setApple(state.phase === 'fight' && state.flags.apple && !state.appleUsed);
    hud.setStoneNear(state.phase === 'fight' && (stoneNear() || state.stoneHeld));
    if (input.touch.ui && it !== lastItemText) { // the Item button shows the active item
      lastItemText = it; const b = input.touch.ui.querySelector('[data-k="item"]');
      if (b) { b.textContent = it ? it.split(' ')[0].slice(0, 5) : 'ITEM'; b.classList.toggle('dim', !it); }
    }
    if (state.phase === 'cell') {
      hud.setTarget(state.ui ? null : state.target && state.target.label);
      render.draw();
      return;
    }
    hud.setTarget(null);
    hud.update(player, opp);
    hud.setDaze(player.daze);
    hud.drawFlash(state.t);
    hud.drawPopups(render.camera, state.t, render.size.cssW, render.size.cssH);
    if (state.debug) {
      const l = state.last;
      hud.debugText(`${state.phase} fight ${state.fightNo} ${state.name} fseed ${state.fightSeed}  t ${state.t.toFixed(2)}  seed ${state.seed}  ${input.device()}  hits ${state.hits}` + (l ? `\n${l.kind} ${l.traj} ${ZONE_NAME[l.zone]} ${l.level} -${l.amount}` : '') + `\nEQ ${opp.balance.toFixed(0)} FO ${player.stamina.toFixed(1)}`);
    }
    player.updateFpArms(render.camera);
    render.draw();
  }

  // debug keys: 1-5 make the opponent throw a punch, G toggles his guard, R restarts
  function attachDebug() {
    const names = ['jab', 'direct', 'hookL', 'hookR', 'upper'];
    addEventListener('keydown', (e) => {
      if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)) - 1; if (names[n]) state.debugCmds.push(names[n]); }
      if (e.code === 'KeyG') state.oppGuard = !state.oppGuard;
      if (e.code === 'KeyR') reset();
      if (e.code === 'KeyV') state.camMode = { auto: 'side', side: 'face', face: 'auto' }[state.camMode];
    });
  }
  if (state.debug) attachDebug();
  addEventListener('keydown', (e) => { // arrows also move through the pause menu
    if (!state.paused) return;
    if (e.code === 'ArrowDown') { hud.menu.nav(1); audio.menu(); e.preventDefault(); }
    if (e.code === 'ArrowUp') { hud.menu.nav(-1); audio.menu(); e.preventDefault(); }
  });

  // pointer lock: the browser spends the first Esc on releasing it, and the game pauses at once
  let wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = Boolean(document.pointerLockElement);
    if (wasLocked && !locked && state.phase === 'cell' && !state.ui && !state.paused) { setPause(true); }
    wasLocked = locked;
  });

  ring.update(0, 0);
  if (params.dummy || params.nointro || params.fight || params.free) startFight(state.fightNo);
  else {
    const loaded = !params.fresh && loadCard();
    state.trained = card.introSeen || Boolean(params.skipintro) || loaded;
    startFight(state.fightNo); // builds the ring and its first opponent; the story or the cell takes over
    if (loaded || card.introSeen) enterCell();
    else if (params.skipintro) { state.credits = 70; enterCell(); }
    else story();
  }
  if (params.free) input.setMode('free', canvas);
  return { playCut, cuts, crow, crowPerch, ringStone: ring.stone, targets: TARGETS, cellPos, cell, card, ui, openCardFromPause, enterCell, useItem, state, player, get opp() { return opp; }, get brain() { return brain; }, step, draw, reset, startFight, confirm, setPause, camera: cam };
}
