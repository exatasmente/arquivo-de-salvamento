// Chores: the hand work that is not fuel or the till. Cleaning (the squeegee on a stain, the bathroom's
// basin, mirror and floor, a bag of rubbish to the container at the back) and maintenance (a dead
// fluorescent tube changed from the ladder, a breaker that tripped, a pump that jams until its valve
// is turned). Each is a task on the clipboard and a gesture: "manipulate" is holding the interaction while
// the work happens; letting go leaves it half done, and it stays half done.
import { mulberry32 } from '../rng.js';
import { fill } from '../util.js';

// The breakers of the board by area (the scene's own list), with the words the clipboard uses.
const BREAKER_NAME = { loja: 'loja', cobertura: 'cobertura das bombas', estoque: 'estoque', banheiros: 'banheiros', escritorio: 'escritório', servico: 'área de serviço', estacionamento: 'poste do estacionamento', placa: 'placa do Sol' };
const TRIPPABLE = ['loja', 'cobertura', 'estoque', 'banheiros', 'escritorio', 'estacionamento', 'placa'];
const AREA_OF_LAMP = { loja: 'loja', estoque: 'estoque', banheiroM: 'banheiros', banheiroF: 'banheiros', escritorio: 'escritório' };

export function createChores(bus, { world, render, interaction, inventory, progression, player, data, tasks, customers }) {
  const THREE = render.THREE;
  const cfg = data.tasks, TX = cfg.textos, M = cfg.manutencao, C = cfg.limpeza;
  const props = world.posto.props || {};
  const reg = [];                        // permanent targets
  const tmpBox = new THREE.Box3();
  let rr = mulberry32(1);
  const stuck = new Set();               // pumps that jam
  const active = new Map();              // task id -> { kind, ids: [target ids], undo() }
  let bathroom = null;                   // { side, steps: {pia, espelho, chao}, ... }
  let busyBathroom = false;
  let boardT = 0;
  const onde = (a) => cfg.onde[a] || a;

  const hands = () => inventory.carry;
  const handsFree = () => !inventory.carry;
  const sphere = (v, r) => ({ c: v, r });
  const boxOf = (id, grow = 0.1) => world.aimBox(id, grow);
  const unreg = (ids) => { for (const i of ids) interaction.unregister(i); };

  function register(spec, bucket) { const id = interaction.register(spec); (bucket || reg).push(id); return id; }

  /** A target that is worked on by holding. idle() -> a text when something is missing (nothing happens), else null. */
  function workTarget(o) {
    let sfxT = 0;
    return {
      id: o.id, reach: o.reach ?? 2.4, priority: o.priority ?? 1,
      aim: o.aim, enabled: o.enabled,
      label: () => { const t = o.idle?.(); return t ? { text: t } : { text: o.text, hold: true }; },
      tap: () => { const t = o.idle?.(); bus.emit('hint', t || 'Segure o botão para continuar.'); },
      hold: {
        start() { sfxT = 0; if (!o.idle?.()) o.start?.(); },
        update(dt, t) {
          if (o.idle?.() || t < 0.18) return;
          sfxT -= dt; if (sfxT <= 0) { sfxT = o.sfxEvery ?? 0.5; if (o.sfx) bus.emit('sfx', o.sfx, { pos: o.sfxPos?.() }); }
          o.set(Math.min(1, o.get() + dt / o.seconds));
          o.tick?.(o.get());
          if (o.get() >= 1) o.done();
        },
        end() { o.stop?.(); },
        progress: () => (o.idle?.() ? null : o.get()),
      },
    };
  }

  // ------------------------------------------------------------------ the cleaning kit (squeegee and bucket)
  const kitProps = [props.rodo?.dyn, props.balde?.dyn].filter(Boolean);
  const showKit = (v) => { for (const k of kitProps) k.visible = v; };
  const hasKit = () => hands()?.kind === 'limpeza';
  if (world.interactable('rodo')) {
    register({
      id: 'kit-limpeza', reach: 2.6, priority: 2,
      aim: () => { if (hasKit()) return null; const a = boxOf('rodo', 0.25), b = boxOf('balde', 0.25); return a ? { box: b ? a.union(b) : a } : null; },
      enabled: () => !hasKit(),
      label: () => (handsFree() ? { text: 'Pegar o rodo e o balde' } : { text: 'Suas mãos estão ocupadas' }),
      tap: () => {
        if (!handsFree()) return bus.emit('hint', 'Suas mãos estão ocupadas.');
        showKit(false); inventory.setCarry({ kind: 'limpeza' }, 'rodo'); bus.emit('sfx', 'carrinho', {});
        bus.emit('hint', 'Rodo e balde na mão. Toque no vazio para devolver.');
      },
    });
    inventory.dropHandlers.limpeza = () => { showKit(true); inventory.clearCarry(); bus.emit('sfx', 'carrinho', {}); bus.emit('hint', 'Rodo e balde de volta no armário de limpeza.'); };
  }

  // ------------------------------------------------------------------ stains on the floor
  const posto = world.posto;
  const stain = {};   // id -> progress 0..1 (1 = clean)
  function stainTarget(id, owner, onClean) {
    stain[id] = 0; posto.setDirt(id, 1);
    register(workTarget({
      id: 'trab-' + id, reach: 2.5, priority: 1,
      aim: () => ({ box: boxOf(id, 0.2) }),
      enabled: () => stain[id] < 1 && owner.on !== false,
      idle: () => (hasKit() ? null : 'Mancha no chão: pegue o rodo (armário de limpeza, ao lado dos banheiros)'),
      text: 'Passar o rodo (segure)', seconds: C.rodoSegundos, sfx: 'rodo', sfxEvery: 0.55,
      get: () => stain[id], set: (v) => { stain[id] = v; },
      tick: (p) => { posto.setDirt(id, 1 - p); },
      done: () => { stain[id] = 1; posto.setDirt(id, 0); onClean(); },
    }), owner.ids);
  }
  function spawnStain() {
    const ids = Object.keys(posto.stains || {}).filter((id) => /^mancha-(loja|bombas)/.test(id) && !(id in stain));
    if (!ids.length) return false;
    const id = ids[Math.floor(rr() * ids.length)];
    const area = id.startsWith('mancha-loja') ? 'loja' : 'bombas';
    const taskId = 'mancha-' + id;
    const owner = { ids: [], on: true };
    stainTarget(id, owner, () => { owner.on = false; unreg(owner.ids); tasks.done(taskId); done('tarefa'); });
    active.set(taskId, { kind: 'mancha', owner, undo() { owner.on = false; unreg(owner.ids); posto.setDirt(id, 0); delete stain[id]; } });
    tasks.add(taskId, fill(TX.mancha, { onde: onde(area) }), 'mancha');
    bus.emit('sfx', 'rodo', { gain: 0.3 });
    return true;
  }

  // ------------------------------------------------------------------ spawn: rubbish (the pump bins fill; a tied bag waits in the back)
  function spawnLixo() {
    const free = [1, 2, 3, 4].map((n) => 'lixeira' + n).filter((id) => posto.bins?.[id] && !posto.bins[id].full && !active.has('lixo-' + id));
    if (posto.bag && !active.has('lixo-saco-lixo')) free.push('saco-lixo');
    if (!free.length) return false;
    const id = free[Math.floor(rr() * free.length)], taskId = 'lixo-' + id;
    const loose = id === 'saco-lixo';
    const S = { taken: false }, owner = { ids: [] };
    const nome = loose ? 'fundos' : 'bomba ' + id.slice(-1);
    if (loose) { posto.bag.reset(); posto.bag.setVisible(true); } else posto.setFull(id, true);
    register({
      id: 'saco-' + id, reach: 2.5, priority: 2,
      aim: () => (S.taken ? null : { box: boxOf(loose ? 'saco-lixo' : id, 0.15) }),
      enabled: () => !S.taken,
      label: () => (handsFree() ? { text: loose ? 'Pegar o saco de lixo dos fundos' : `Pegar o saco de lixo da ${nome}` } : { text: 'Suas mãos estão ocupadas' }),
      tap: () => {
        if (!handsFree()) return bus.emit('hint', 'Suas mãos estão ocupadas.');
        S.taken = true;
        if (loose) posto.bag.setVisible(false); else posto.setFull(id, false);
        inventory.setCarry({ kind: 'saco', id }, 'saco'); player.st.carryHeavy = true;
        bus.emit('sfx', 'lixo', {}); bus.emit('hint', 'Leve ao contêiner, nos fundos. Toque no vazio para largar o saco de volta.');
      },
    }, owner.ids);
    S.putBack = () => { S.taken = false; if (loose) { posto.bag.reset(); } else posto.setFull(id, true); };
    active.set(taskId, { kind: 'lixo', owner, S, undo() { unreg(owner.ids); if (loose) posto.bag.setVisible(false); else posto.setFull(id, false); if (hands()?.kind === 'saco') { inventory.clearCarry(); player.st.carryHeavy = false; } } });
    tasks.add(taskId, loose ? 'Levar o saco de lixo dos fundos ao contêiner' : fill(TX.lixo, { n: id.slice(-1) }), 'lixo');
    return true;
  }
  if (world.interactable('conteiner')) {
    register({
      id: 'conteiner-saco', reach: 3.2, priority: 2,
      aim: () => ({ box: boxOf('conteiner', 0.2) }),
      enabled: () => hands()?.kind === 'saco',
      label: () => ({ text: 'Jogar o saco no contêiner' }),
      tap: () => {
        const c = hands(); const key = 'lixo-' + c.id; const a = active.get(key); if (!a) return;
        inventory.clearCarry(); player.st.carryHeavy = false;
        unreg(a.owner.ids); active.delete(key);
        bus.emit('sfx', 'lixo', {}); tasks.done(key); done('tarefa');
      },
    });
    inventory.dropHandlers.saco = (c) => { const a = active.get('lixo-' + c.id); if (a) a.S.putBack(); inventory.clearCarry(); player.st.carryHeavy = false; bus.emit('hint', 'Saco de volta onde estava.'); };
  }

  // ------------------------------------------------------------------ the ladder and the dead tube
  const ladder = posto.ladder || null;
  const burntIds = new Set();
  if (ladder) {
    register({
      id: 'escada-pegar', reach: 2.6, priority: 2,
      aim: () => (hands()?.kind === 'escada' || ladder.at ? null : { box: boxOf('escada', 0.2) }),
      enabled: () => hands()?.kind !== 'escada' && !ladder.at,
      label: () => (handsFree() ? { text: 'Pegar a escada' } : { text: 'Suas mãos estão ocupadas' }),
      tap: () => {
        if (!handsFree()) return bus.emit('hint', 'Suas mãos estão ocupadas.');
        ladder.root.visible = false; ladder.collider.enabled = false;
        inventory.setCarry({ kind: 'escada' }, 'escada'); player.st.carryHeavy = true; bus.emit('sfx', 'carrinho', {});
        bus.emit('hint', 'Escada na mão. Leve até a lâmpada queimada. Toque no vazio para devolver.');
      },
    });
    inventory.dropHandlers.escada = () => { ladder.stow(); ladder.root.visible = true; ladder.collider.enabled = true; inventory.clearCarry(); player.st.carryHeavy = false; player.st.liftTo = 0; bus.emit('sfx', 'carrinho', {}); bus.emit('hint', 'Escada devolvida.'); };
  }
  function spawnLamp() {
    const pool = (posto.lampIds || []).filter((id) => { const L = world.light(id); return L && L.pos[1] <= 3.1 && !L.burnt && world.lampBase(id) && !active.has('lampada-' + id); });
    if (!pool.length || !ladder) return false;
    const id = pool[Math.floor(rr() * pool.length)], L = world.light(id), taskId = 'lampada-' + id;
    posto.setBurnt(id, true); burntIds.add(id);
    const pos = new THREE.Vector3(...L.pos);
    const S = { p: 0 }, owner = { ids: [] };
    const placed = () => ladder.at === id;
    const near = () => Math.hypot(player.st.x - pos.x, player.st.z - (pos.z + 1.0)) < 2.2;
    const tgt = workTarget({
      id: 'lamp-' + id, reach: 6, priority: 2,
      aim: () => ({ c: pos, r: 1.2 }),
      enabled: () => S.p < 1,
      idle: () => (placed() ? (near() ? null : 'Chegue perto da escada para subir') : hands()?.kind === 'escada' ? null : 'Lâmpada queimada: traga a escada (ao lado do quadro de força)'),
      text: 'Subir e trocar o tubo (segure)', seconds: M.lampadaSegundos, sfx: 'lampada_estalo', sfxEvery: 1.2, sfxPos: () => L.pos,
      start: () => { player.st.liftTo = 0.55; ladder.setClimbing(true); },
      stop: () => { player.st.liftTo = 0; ladder.setClimbing(false); },
      get: () => S.p, set: (v) => { S.p = v; },
      done: () => {
        player.st.liftTo = 0; ladder.setClimbing(false); posto.setBurnt(id, false); burntIds.delete(id); bus.emit('sfx', 'lampada_estalo', { pos: L.pos });
        ladder.stow(); unreg(owner.ids); active.delete(taskId);
        tasks.done(taskId); done('tarefa');
      },
    });
    // with the ladder in the hands, one tap stands it under the lamp
    const hold = tgt.hold, baseLabel = tgt.label;
    tgt.label = () => (hands()?.kind === 'escada' && !placed() ? { text: 'Pôr a escada debaixo da lâmpada' } : baseLabel());
    tgt.tap = () => {
      if (hands()?.kind === 'escada' && !placed()) {
        const w = ladder.placeUnder(id);
        if (!w) return bus.emit('hint', 'Essa lâmpada não dá para alcançar.');
        ladder.root.visible = true; ladder.collider.enabled = true; inventory.clearCarry(); player.st.carryHeavy = false; bus.emit('sfx', 'carrinho', {});
        return bus.emit('hint', 'Escada no lugar. Chegue perto e segure para subir.');
      }
      bus.emit('hint', baseLabel().text);
    };
    tgt.hold = { ...hold, update(dt, t) { if (hands()?.kind === 'escada' && !placed()) return; hold.update(dt, t); } };
    register(tgt, owner.ids);
    active.set(taskId, { kind: 'lampada', owner, undo() { unreg(owner.ids); posto.setBurnt(id, false); burntIds.delete(id); if (ladder.at === id) ladder.stow(); } });
    tasks.add(taskId, fill(TX.lampada, { onde: onde(AREA_OF_LAMP[L.area] || L.area) }), 'lampada');
    bus.emit('sfx', 'lampada_estalo', { pos: L.pos });
    bus.emit('incident', 'equipamento', { where: id });
    return true;
  }

  // ------------------------------------------------------------------ breakers (the board in the back; the dark)
  const board = { open: 0 };
  const down = [];                       // areas tripped, oldest first
  /** `which`: a given area to trip (the blackout of the canopy), or null to draw one. */
  function spawnBreaker(which = null) {
    const br = posto.breakers; if (!br) return false;
    const pool = TRIPPABLE.filter((a) => br.isOn(a) && !down.includes(a) && (!which || a === which));
    if (!pool.length) return false;
    const a = which || pool[Math.floor(rr() * pool.length)], taskId = 'disjuntor-' + a;
    br.setOn(a, false); down.push(a);
    const S = { p: 0 }, owner = { ids: [] };
    register(workTarget({
      id: 'disj-' + a, reach: 2.6, priority: 3,
      aim: () => ({ box: boxOf('disjuntor-' + a, 0.05) }),
      enabled: () => !br.isOn(a),
      idle: () => null,
      text: `Religar o disjuntor: ${BREAKER_NAME[a]} (segure)`, seconds: M.disjuntorSegundos, sfx: 'disjuntor', sfxEvery: 0.9,
      get: () => S.p, set: (v) => { S.p = v; boardT = 1.2; },
      done: () => { br.setOn(a, true); down.splice(down.indexOf(a), 1); unreg(owner.ids); active.delete(taskId); bus.emit('sfx', 'disjuntor', {}); tasks.done(taskId); done('tarefa'); },
    }), owner.ids);
    active.set(taskId, { kind: 'disjuntor', owner, undo() { br.setOn(a, true); unreg(owner.ids); const i = down.indexOf(a); if (i >= 0) down.splice(i, 1); } });
    tasks.add(taskId, fill(TX.disjuntor, { onde: BREAKER_NAME[a] }), 'disjuntor');
    bus.emit('sfx', 'disjuntor', { pos: world.at('quadroForca', 1.3).toArray() });
    bus.emit('hint', `Faltou luz: ${BREAKER_NAME[a]}.`);
    bus.emit('incident', 'falta-de-energia', { where: BREAKER_NAME[a] });
    return true;
  }
  // the board's door swings open while someone works on it, and stays a moment
  let boardT0 = 0;

  // ------------------------------------------------------------------ pump valve (a jammed pump)
  function spawnPump() {
    const n = customers.freePump();
    if (!n || stuck.has(n)) return false;
    const taskId = 'bomba-' + n, P = posto.pumps[n];
    stuck.add(n); P.setJammed(true);
    const S = { p: 0 }, owner = { ids: [] };
    register(workTarget({
      id: 'registro' + n, reach: 2.6, priority: 2,
      aim: () => ({ box: boxOf('registro' + n, 0.12) }),
      enabled: () => S.p < 1,
      idle: () => (handsFree() ? null : 'Suas mãos estão ocupadas'),
      text: 'Girar o registro da bomba (segure)', seconds: M.registroSegundos, sfx: 'bico_poe', sfxEvery: 0.45,
      get: () => S.p, set: (v) => { S.p = v; },
      tick: (p) => { P.valve.setAngle(p * Math.PI * 3); },
      done: () => {
        stuck.delete(n); P.setJammed(false); P.valve.setAngle(0); unreg(owner.ids); active.delete(taskId);
        bus.emit('sfx', 'caixa_bip', { pos: world.anchor('bomba' + n).pos.toArray() }); tasks.done(taskId); done('tarefa');
        bus.emit('pump:freed', n);
      },
    }), owner.ids);
    active.set(taskId, { kind: 'bomba', owner, undo() { stuck.delete(n); P.setJammed(false); P.valve.setAngle(0); unreg(owner.ids); } });
    tasks.add(taskId, fill(TX['bomba-travada'], { n }), 'bomba');
    customers.spawnCar({ pump: n });
    bus.emit('incident', 'equipamento', { where: 'bomba' + n });
    return true;
  }

  // ------------------------------------------------------------------ the bathroom (once per night)
  function startBathroom(side, seedN) {
    const tag = side, east = (tag === 'm' ? 16 : 20) + 3.9;
    const taskBase = fill(cfg.fixas.find((f) => f.id === 'banheiro').texto, { lado: tag === 'm' ? 'masculino' : 'feminino' });
    const B = bathroom = { side: tag, steps: { pia: 0, espelho: 0, chao: 0 }, base: taskBase, owner: { ids: [] }, nodes: [], floor: [`mancha-${tag}`, `mancha-${tag}2`] };
    const sm = (w, h, k) => world.stand.smudge(w, h, seedN + k);
    const place = (sx, x, y, z, rx, ry) => { sx.mesh.position.set(x, y, z); sx.mesh.rotation.set(rx, ry, 0); render.scene.add(sx.mesh); B.nodes.push(sx.mesh); };
    const mirrors = [4.4, 5.3].map((z, i) => { const sx = sm(0.56, 0.74, i); place(sx, east + 0.045, 1.55, z, 0, -Math.PI / 2); return sx; });
    const basins = [4.4, 5.3].map((z, i) => { const sx = sm(0.34, 0.34, 5 + i); place(sx, east - 0.245, 0.862, z, -Math.PI / 2, 0); return sx; });
    const label = () => { const s = B.steps; return `${taskBase}  [${s.pia >= 1 ? 'pia ok' : 'pia'} · ${s.espelho >= 1 ? 'espelho ok' : 'espelho'} · ${s.chao >= 1 ? 'chão ok' : 'chão'}]`; };
    const refresh = () => { tasks.setText('banheiro', label()); };
    const finishStep = () => {
      refresh();
      if (B.steps.pia >= 1 && B.steps.espelho >= 1 && B.steps.chao >= 1) { tasks.done('banheiro'); done('tarefa'); }
    };
    const occupied = () => (busyBathroom && tag === 'm' ? 'Banheiro ocupado' : null);
    const needKit = () => occupied() || (hasKit() ? null : 'Está sujo: pegue o rodo e o balde (armário de limpeza)');
    const aimBox = (min, max) => ({ box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)) });
    register(workTarget({
      id: 'pia-' + tag, reach: 2.4, priority: 1,
      aim: () => aimBox([east - 0.6, 0.72, 4.05], [east - 0.0, 1.05, 5.65]),
      enabled: () => B.steps.pia < 1, idle: needKit, text: 'Esfregar a pia (segure)', seconds: C.piaSegundos, sfx: 'rodo', sfxEvery: 0.6,
      get: () => B.steps.pia, set: (v) => { B.steps.pia = v; },
      tick: (p) => basins.forEach((sx) => sx.setAmount(1 - p)),
      done: () => { B.steps.pia = 1; basins.forEach((sx) => sx.setAmount(0)); bus.emit('sfx', 'tarefa_ok', {}); finishStep(); },
    }), B.owner.ids);
    register(workTarget({
      id: 'espelho-' + tag, reach: 2.4, priority: 1,
      aim: () => aimBox([east - 0.15, 1.1, 4.05], [east + 0.2, 2.05, 5.65]),
      enabled: () => B.steps.espelho < 1, idle: needKit, text: 'Limpar o espelho (segure)', seconds: C.espelhoSegundos, sfx: 'rodo', sfxEvery: 0.5,
      get: () => B.steps.espelho, set: (v) => { B.steps.espelho = v; },
      tick: (p) => mirrors.forEach((sx) => sx.setAmount(1 - p)),
      done: () => { B.steps.espelho = 1; mirrors.forEach((sx) => sx.setAmount(0)); bus.emit('sfx', 'tarefa_ok', {}); finishStep(); },
    }), B.owner.ids);
    // the floor: two stains, both to go
    const floorDone = {};
    for (const sid of B.floor) {
      if (!posto.stains?.[sid]) { floorDone[sid] = true; continue; }
      stain[sid] = 0; posto.setDirt(sid, 1);
      register(workTarget({
        id: 'chao-' + sid, reach: 2.5, priority: 1,
        aim: () => ({ box: boxOf(sid, 0.2) }),
        enabled: () => stain[sid] < 1, idle: needKit, text: 'Passar o rodo no chão (segure)', seconds: C.rodoSegundos, sfx: 'rodo', sfxEvery: 0.55,
        get: () => stain[sid], set: (v) => { stain[sid] = v; B.steps.chao = B.floor.reduce((a, q) => a + (floorDone[q] ? 1 : (stain[q] ?? 0)), 0) / B.floor.length; },
        tick: (p) => posto.setDirt(sid, 1 - p),
        done: () => { stain[sid] = 1; floorDone[sid] = true; posto.setDirt(sid, 0); B.steps.chao = B.floor.every((q) => floorDone[q]) ? 1 : B.steps.chao; bus.emit('sfx', 'tarefa_ok', {}); finishStep(); },
      }), B.owner.ids);
    }
    refresh();
    return B;
  }

  function done(kind) { void kind; bus.emit('sfx', 'tarefa_ok', {}); progression.ok('tarefa'); }

  function clear() {
    for (const [, a] of active) a.undo?.();
    active.clear();
    if (bathroom) {
      unreg(bathroom.owner.ids);
      for (const n of bathroom.nodes) render.scene.remove(n);
      bathroom = null;
    }
    for (const id of Object.keys(posto.stains || {})) posto.setDirt(id, 0);
    for (const k of Object.keys(stain)) delete stain[k];
    for (const id of Object.keys(posto.bins || {})) posto.setFull(id, false);
    posto.bag?.setVisible(false);
    for (const id of [...burntIds]) posto.setBurnt(id, false);
    burntIds.clear(); stuck.clear(); down.length = 0;
    for (const a of posto.breakers?.areas || []) posto.breakers.setOn(a, true);
    for (const n of Object.keys(posto.pumps || {})) { posto.pumps[n]?.setJammed?.(false); posto.pumps[n]?.valve?.setAngle(0); }
    ladder?.stow(); if (ladder) { ladder.root.visible = true; ladder.collider.enabled = true; }
    showKit(true);
    player.st.liftTo = 0; busyBathroom = false;
    board.open = 0; world.state.quadroAberto = 0; boardT = 0;
  }

  void boardT0;
  return {
    clear, startBathroom,
    begin(seed, day) { rr = mulberry32(seed * 7 + day * 13 + 1); },
    /** Spawns one task of a kind. Returns true if it appeared. */
    spawn(kind) {
      switch (kind) {
        case 'mancha': return spawnStain();
        case 'lixo': return spawnLixo();
        case 'lampada': return spawnLamp();
        case 'disjuntor': return spawnBreaker();
        case 'bomba-travada': return spawnPump();
        default: return false;
      }
    },
    /** Trips the breaker of one area on purpose (an event). Returns true if it tripped. */
    trip: (area) => spawnBreaker(area),
    pumpStuck: (n) => stuck.has(n),
    setBathroomBusy(v) { busyBathroom = v; },
    get bathroom() { return bathroom; },
    breakersDown: () => down.map((a) => BREAKER_NAME[a]),
    update(dt) {
      boardT = Math.max(0, boardT - dt);
      if (down.length && Math.hypot(player.st.x - 19, player.st.z - 13.2) < 3) boardT = Math.max(boardT, 0.3);
      const want = boardT > 0 ? 1 : 0;
      board.open += (want - board.open) * Math.min(1, dt * 5);
      world.state.quadroAberto = board.open;
    },
  };
}
