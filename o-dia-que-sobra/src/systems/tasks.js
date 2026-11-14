// TaskSystem: the list on the clipboard and the night's plan. Fixed tasks (open the till, clean a
// bathroom once, close the till) and the ones that appear by the seed (a car, a customer, an empty
// shelf, a stain, a dead lamp, a tripped breaker, a jammed pump, full rubbish). It also owns the
// restocking job: a box is found by its number in the stock room, carried in the hands (slow) or
// pushed on the cart (four at a time), and put out on the shelf whose label shows its product.
// A restocking job comes from two sources that never double up on a shelf: the night's plan (by the hour) and a customer who leaves a
// shelf under LOW of its capacity (the 'shelf:taken' event of customers.js).
import { mulberry32 } from '../rng.js';
import { fill, money } from '../util.js';
import { dropSpot, REFUSE } from './dropspot.js';

const LOW = 0.3;       // a shelf under this fraction of its capacity asks to be restocked

export function createTasks(bus, { world, render, interaction, inventory, progression, player, data, time, cash }) {
  const THREE = render.THREE;
  const items = data.items, cfg = data.tasks, cfgR = cfg.repor;
  const list = [];            // { id, text, done, failed, kind }
  const boxes = new Map();    // number -> { n, produto, taken, used }
  const shelves = new Map();  // id -> { id, row, produto, done, units, acc }
  let tids = [], chores = null, customers = null;
  let plan = [], lastSpawn = -99, rr = mulberry32(1);
  const productOf = (tipo) => Object.keys(items.produtos).find((k) => items.produtos[k].tipo === tipo);

  let prepMode = false;       // what is added while it is on belongs to the preparation before the shift (23:00 to 00:00)
  const add = (id, text, kind = 'tarefa') => { if (list.some((t) => t.id === id)) return id; list.push({ id, text, done: false, failed: false, kind, prep: prepMode }); bus.emit('tasks:change'); return id; };
  const done = (id) => { const t = list.find((x) => x.id === id); if (t && !t.done) { t.done = true; t.failed = false; bus.emit('tasks:change'); } };
  const fail = (id) => { const t = list.find((x) => x.id === id); if (t && !t.done) { t.failed = true; bus.emit('tasks:change'); } };
  const setText = (id, text) => { const t = list.find((x) => x.id === id); if (t) { t.text = text; bus.emit('tasks:change'); } };
  /** Takes a task off the list and counts it as not done (a customer who was lost at closing time). */
  function drop(id) { const i = list.findIndex((x) => x.id === id); if (i < 0) return false; const t = list[i]; list.splice(i, 1); if (!t.done) progression.undone(1); bus.emit('tasks:change'); return true; }
  const pending = () => list.filter((t) => !t.done);

  // ------------------------------------------------------------------ the cart
  // The scene's own cart (posto.cart): the player holds the handle and pushes it ahead; up to four boxes ride on the deck.
  const CAP = 4;
  const sc = world.posto.cart || null;
  const cart = { pushing: false, boxes: [] };
  const cartPos = new THREE.Vector3();
  function startPush() {
    cart.pushing = true; player.st.pushing = true; sc.setHeld(true);
    inventory.setCarry({ kind: 'carrinho' }, null);
    bus.emit('sfx', 'carrinho', {});
    bus.emit('hint', `Empurrando o carrinho: cabem ${CAP} caixas. Mire na caixa da estante para pô-la nele.`);
  }
  function stopPush() {
    // set it down as far ahead as there is room for (never on top of a wall or a shelf)
    if (sc) {
      const y = player.st.yaw, fx = -Math.sin(y), fz = -Math.cos(y);
      const fits = (x, z) => !world.colliders.some((c) => c !== sc.collider && c.enabled !== false && !c.vehicle && c.max[1] > 0.3 && c.min[1] < 1.0 && x + 0.6 > c.min[0] && x - 0.6 < c.max[0] && z + 0.6 > c.min[2] && z - 0.6 < c.max[2]);
      for (const d of [1.3, 1.1, 0.85]) { const nx = player.st.x + fx * d, nz = player.st.z + fz * d; if (fits(nx, nz)) { sc.place(nx, nz, y + Math.PI); break; } }
    }
    cart.pushing = false; player.st.pushing = false; sc.setHeld(false);
    if (inventory.carry?.kind === 'carrinho') inventory.clearCarry();
    bus.emit('sfx', 'carrinho', {});
  }
  let lastCx = 0, lastCz = 0;
  function updateCart() {
    if (!cart.pushing || !sc) return;
    const y = player.st.yaw, fx = -Math.sin(y), fz = -Math.cos(y);
    const nx = player.st.x + fx * 0.85, nz = player.st.z + fz * 0.85;
    sc.roll(Math.hypot(nx - lastCx, nz - lastCz) * (Math.abs(lastCx) + Math.abs(lastCz) > 0 ? 1 : 0));
    lastCx = nx; lastCz = nz;
    sc.place(nx, nz, y + Math.PI);
  }
  function returnBox(rec) {
    rec.taken = false; const bx = world.boxes[rec.n]; if (bx?.root) { bx.root.visible = true; if (bx.home) { bx.root.position.copy(bx.home); bx.root.rotation.y = bx.homeRy; } }
    bus.emit('sfx', 'caixa_papelao', {});
  }
  const handleP = new THREE.Vector3(), deckP = new THREE.Vector3();
  if (sc) {
    interaction.register({
      id: 'carrinho', reach: 2.6, priority: 0,
      aim: () => (cart.pushing ? { c: sc.handleAnchor.getWorldPosition(handleP), r: 0.3 } : { box: world.aimBox('carrinho', 0.2) }),
      enabled: () => true,
      label: () => (cart.pushing ? { text: 'Soltar o carrinho' } : inventory.carry ? { text: 'Suas mãos estão ocupadas' } : { text: 'Empurrar o carrinho' }),
      tap: () => {
        if (cart.pushing) return stopPush();
        if (inventory.carry) return bus.emit('hint', 'Suas mãos estão ocupadas.');
        lastCx = lastCz = 0; startPush();
      },
    });
    // a wrong box can be taken off the deck and put back on its rack
    interaction.register({
      id: 'carrinho-caixa', reach: 2.8, priority: -2,
      aim: () => { sc.root.getWorldPosition(deckP); deckP.y += 0.45; return { c: deckP, r: 0.3 }; },
      enabled: () => cart.pushing && cart.boxes.length > 0,
      label: () => ({ text: `Devolver a caixa ${cart.boxes[cart.boxes.length - 1].rec.n} à estante` }),
      tap: () => { const e = cart.boxes.pop(); sc.setLoad(cart.boxes.length); returnBox(e.rec); },
    });
  }

  // ------------------------------------------------------------------ stock-room boxes
  function clearBoxes() {
    for (const id of tids) interaction.unregister(id);
    tids = [];
    for (const b of boxes.values()) { const bx = world.boxes[b.n]; if (bx?.root) { bx.root.visible = true; if (bx.home) { bx.root.position.copy(bx.home); bx.root.rotation.y = bx.homeRy; } } }
    cart.boxes = [];
    if (cart.pushing) stopPush();
    sc?.reset();
    boxes.clear();
    for (const sh of shelves.values()) sh.row.setStock(sh.full);
    shelves.clear();
    player.st.carryHeavy = false;
  }
  function initBoxes(seed) {
    const r = mulberry32(seed * 5 + 1);
    const prods = Object.keys(items.produtos);
    const nums = world.boxes.filter(Boolean).map((b) => b.n);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    nums.forEach((n, i) => boxes.set(n, { n, produto: prods[i % prods.length], taken: false, used: false }));
    world.boxes.forEach((bx) => {
      if (!bx) return;
      if (!bx.home) { bx.home = bx.root.position.clone(); bx.homeRy = bx.root.rotation.y; }   // where the rack keeps it (a dropped box comes back here at the end of the night)
      const b = boxes.get(bx.n);
      tids.push(interaction.register({
        id: bx.id, reach: 2.5, priority: 1,
        aim: () => (b.taken ? null : { box: world.aimBox(bx.id, 0.1) }),
        enabled: () => !b.taken,
        label: () => (cart.pushing ? (cart.boxes.length >= CAP ? { text: 'O carrinho está cheio' } : { text: `Pôr a caixa ${b.n} no carrinho` }) : inventory.carry ? { text: 'Suas mãos estão ocupadas' } : { text: `Caixa ${b.n}` }),
        tap: () => {
          if (cart.pushing) {
            if (cart.boxes.length >= CAP) return bus.emit('hint', 'O carrinho está cheio.');
            b.taken = true; bx.root.visible = false;
            cart.boxes.push({ rec: b }); sc.setLoad(cart.boxes.length);
            bus.emit('sfx', 'caixa_papelao', {}); bus.emit('step', 'stock.box', b); return;
          }
          if (inventory.carry) return bus.emit('hint', 'Suas mãos estão ocupadas.');
          b.taken = true; bx.root.visible = false;
          inventory.setCarry({ kind: 'caixa', n: b.n, produto: b.produto }, 'caixa', { label: b.n });
          player.st.carryHeavy = true;
          bus.emit('sfx', 'caixa_papelao', {}); bus.emit('step', 'stock.box', b);
          bus.emit('hint', 'Nas mãos a caixa pesa e atrasa. O carrinho leva quatro.');
        },
      }));
    });
  }
  /** Letting go of a box leaves it on the floor where the player stands: it can be picked up again, and it is not on a shelf (the job stays open). */
  inventory.dropHandlers.caixa = (c) => {
    const rec = boxes.get(c.n), bx = world.boxes[c.n];
    if (!rec || !bx?.root) { inventory.clearCarry(); player.st.carryHeavy = false; return; }
    const sp = dropSpot({ player, world });
    if (!sp) { bus.emit('hint', REFUSE); return; }          // (the box stays in the hands)
    bx.root.position.set(sp.x, 0, sp.z); bx.root.rotation.y = sp.yaw; bx.root.visible = true; rec.taken = false;
    inventory.clearCarry(); player.st.carryHeavy = false; bus.emit('sfx', 'caixa_papelao', {}); bus.emit('hint', 'Caixa no chão. Mire nela para pegar de novo.');
  };

  // ------------------------------------------------------------------ the shelf job
  function setupShelf(row, produto, keep = false) {
    const P = items.produtos[produto];
    const sh = { id: row.id, row, produto, done: false, units: keep ? row.stock : 0, acc: 0, wrongTried: false, full: row.slots };
    shelves.set(row.id, sh);
    if (!keep) row.setStock(0);
    const perUnit = cfgR.segundosTotal / row.slots;
    const pick = () => {
      const h = inventory.carry;
      if (h && h.kind === 'caixa') return { box: h, from: 'hand' };
      if (cart.pushing && cart.boxes.length) { const e = cart.boxes.find((x) => x.rec.produto === produto) || cart.boxes[0]; return { box: e.rec, from: 'cart', e }; }
      return null;
    };
    tids.push(interaction.register({
      id: 'prat-' + row.id, reach: 2.7, priority: 0,
      aim: () => (sh.done ? null : { box: world.aimBox(row.id, 0.25) }),
      enabled: () => !sh.done,
      label: () => (pick() ? { text: `Repor ${P.nome} (segure)`, hold: true } : { text: `Prateleira vazia: ${P.nome}` }),
      tap: () => { if (!pick()) bus.emit('hint', `A etiqueta é de ${P.nome}. Traga a caixa certa.`); else bus.emit('hint', 'Segure o botão para repor.'); },
      hold: {
        start() { sh.acc = 0; sh.wrongTried = false; },
        update(dt, t) {
          const u = pick(); if (!u) return;
          if (u.box.produto !== produto) {
            if (!sh.wrongTried) { sh.wrongTried = true; progression.error('produto-errado', row.id); bus.emit('hint', `Essa caixa é de ${items.produtos[u.box.produto].nome}. A etiqueta pede ${P.nome}.`); bus.emit('sfx', 'erro', {}); }
            return;
          }
          if (t < 0.2) return;
          sh.acc += dt;
          while (sh.acc >= perUnit && sh.units < row.slots) {
            sh.acc -= perUnit; sh.units++; row.setStock(sh.units);
            bus.emit('sfx', 'produto_pos', {});
          }
          if (sh.units >= row.slots) finishShelf(sh, u);
        },
        end() {},
        progress: () => sh.units / row.slots,
      },
    }));
    return sh;
  }
  function finishShelf(sh, u) {
    sh.done = true;
    u.box.used = true;
    if (u.from === 'hand') { inventory.clearCarry(); player.st.carryHeavy = false; }
    else { cart.boxes.splice(cart.boxes.indexOf(u.e), 1); sc.setLoad(cart.boxes.length); }
    done('repor-' + sh.id); progression.ok('tarefa');
    bus.emit('step', 'stock.done', sh); bus.emit('sfx', 'tarefa_ok', {});
  }

  /** A customer has taken something from this shelf: if what is left is under LOW of its capacity, it asks to be restocked. */
  function restockIfLow(row) {
    if (!row || row.atras || !progression.st.tutorialDone || row.stock >= row.slots * LOW) return false;
    const old = shelves.get(row.id);
    if (old && !old.done) return false;                                                    // already asked for (by the plan or by a customer)
    if ([...shelves.values()].some((q) => !q.done && q.row.tipo === row.tipo)) return false;   // one job per product at a time (the boxes are by product)
    const produto = productOf(row.tipo); if (!produto) return false;
    const mine = [...boxes.values()].filter((b) => b.produto === produto && !b.used && !b.taken);
    if (!mine.length) return false;                                                          // no box of it left in the stock room
    if (old) { shelves.delete(row.id); const i = list.findIndex((x) => x.id === 'repor-' + row.id); if (i >= 0) list.splice(i, 1); }
    interaction.unregister('prat-' + row.id);
    const sh = setupShelf(row, produto, true); sh.boxN = mine[0].n;
    add('repor-' + row.id, fill(cfgR.titulo, { prateleira: row.n, produto: items.produtos[produto].nome }) + ` (caixa ${sh.boxN})`, 'repor');
    bus.emit('step', 'stock.start', [{ row, tipo: row.tipo, box: sh.boxN }]);
    return true;
  }
  bus.on('shelf:taken', (row) => restockIfLow(row));

  /** A restocking job: `n` empty shelves, each needing a box of its product. */
  function startRestock(n = 1, seed = 1) {
    if (!boxes.size) initBoxes(progression.st.seed);
    const r = mulberry32(seed * 101 + 9);
    const usable = world.shelves.filter((s) => s && !s.atras && productOf(s.tipo) && !shelves.has(s.id));
    const rows = [], pool = [...usable];
    while (rows.length < n && pool.length) {
      const row = pool.splice(Math.floor(r() * pool.length), 1)[0];
      if ([...shelves.values()].some((q) => !q.done && q.row.tipo === row.tipo) || rows.some((q) => q.tipo === row.tipo)) continue;
      const produto = productOf(row.tipo);
      if (![...boxes.values()].some((b) => b.produto === produto && !b.used && !b.taken)) continue;
      rows.push(row);
    }
    const reqs = rows.map((row) => {
      const produto = productOf(row.tipo);
      const mine = [...boxes.values()].filter((b) => b.produto === produto && !b.used && !b.taken);
      return { row, tipo: row.tipo, box: mine[Math.floor(r() * mine.length)].n };
    });
    for (const q of reqs) {
      const produto = productOf(q.tipo);
      setupShelf(q.row, produto).boxN = q.box;
      add('repor-' + q.row.id, fill(cfgR.titulo, { prateleira: q.row.n, produto: items.produtos[produto].nome }) + ` (caixa ${q.box})`, 'repor');
    }
    if (reqs.length) bus.emit('step', 'stock.start', reqs);
    return reqs;
  }

  // ------------------------------------------------------------------ the till (open at the start, close at six)
  const caixaBox = () => world.aimBox('caixa', 0.15);
  const endMin = time.parse(data.progression.expediente.fim);
  const till = { p: 0, enabled: true };
  interaction.register({
    id: 'caixa-registradora', reach: 2.6, priority: 2,
    aim: () => ({ box: caixaBox() }),
    enabled: () => (!cash.opened && till.enabled) || (cash.opened && !cash.closed && time.minutes >= endMin),
    label: () => {
      if (!cash.opened) return inventory.carry ? { text: 'Suas mãos estão ocupadas' } : { text: 'Abrir o caixa e contar o fundo (segure)', hold: true };
      return { text: 'Fechar o caixa: contar a gaveta' };
    },
    tap: () => {
      if (!cash.opened) return bus.emit('hint', 'Segure o botão para abrir o caixa e contar o fundo.');
      bus.emit('cash:close-request');
    },
    hold: {
      start() { till.p = 0; },
      update(dt, t) {
        if (cash.opened || inventory.carry || t < 0.2) return;
        till.p += dt / cfg.caixa.abrirSegundos;
        if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) bus.emit('sfx', 'moeda', {});
        if (till.p >= 1) openTill();
      },
      end() { till.p = 0; },
      progress: () => (cash.opened ? null : till.p),
    },
  });
  function openTill() {
    till.p = 0; cash.open();
    bus.emit('sfx', 'gaveta_abre', {}); bus.emit('hint', `Fundo de caixa contado: ${money(cash.float)}.`);
    done('abrir-caixa'); progression.ok('tarefa'); bus.emit('step', 'till.open', null);
  }

  // ------------------------------------------------------------------ customers on the list
  bus.on('customer:arrive', (c) => {
    if (c.noTask || !(c.kind === 'car' || c.kind === 'walk')) return;
    add('cli' + c.id, c.kind === 'car' ? fill(cfg.textos.carro, { n: c.pump }) : fill(cfg.textos.cliente, {}), c.kind === 'car' ? 'carro' : 'cliente');
  });
  bus.on('customer:done', (c) => done('cli' + c.id));
  bus.on('customer:lost', (c) => { if (c.kind === 'car' || c.kind === 'walk') drop('cli' + c.id); });
  bus.on('customer:gone-angry', (c) => fail('cli' + c.id));
  bus.on('customer:gone', (c) => { const t = list.find((x) => x.id === 'cli' + c.id); if (t && !t.done) t.failed = true; });

  // ------------------------------------------------------------------ the night's plan
  function makePlan(seed, day) {
    const r = mulberry32(seed * 29 + day * 5 + 11), out = [];
    for (const def of cfg.aparecem) {
      if (def.chance !== undefined && r() > def.chance) continue;
      const n = def.porNoite[0] + Math.floor(r() * (def.porNoite[1] - def.porNoite[0] + 1));
      const [a, b] = def.janela.map((s) => time.parse(s));
      for (let i = 0; i < n; i++) out.push({ at: a + (b - a) * (i + r() * 0.8) / n, kind: def.id });
    }
    return out.sort((x, y) => x.at - y.at);
  }
  function spawn(kind) {
    if (kind === 'repor') { const q = startRestock(1, progression.st.seed + Math.floor(time.minutes)); return q.length > 0; }
    return chores ? chores.spawn(kind) : false;
  }
  function addFixed(ids) {
    for (const f of cfg.fixas) {
      if (!ids.includes(f.id)) continue;
      if (f.id === 'banheiro') {
        const side = mulberry32(progression.st.seed * 3 + progression.st.day)() < 0.5 ? 'm' : 'f';
        add('banheiro', fill(f.texto, { lado: side === 'm' ? 'masculino' : 'feminino' }), 'fixa');
        chores?.startBathroom(side, progression.st.seed);
      } else add(f.id, f.texto, 'fixa');
    }
  }

  return {
    list, add, done, fail, setText, pending, addFixed,
    drop,
    attach(c, cu) { chores = c; customers = cu; },
    clear() { clearBoxes(); list.length = 0; plan = []; lastSpawn = -99; bus.emit('tasks:change'); },
    /** Starts the night's list. tutorial: only the till is listed (the call teaches the rest). */
    begin({ seed, day, tutorial }) {
      rr = mulberry32(seed * 3 + day);
      chores?.begin(seed, day);
      initBoxes(seed);
      plan = makePlan(seed, day);
      if (!tutorial) addFixed(['fechar-caixa']);      // (the bathroom is part of the preparation, and the till is opened at 00:00)
      bus.emit('tasks:change');
    },
    startRestock, restockIfLow, openTill,
    shelves, boxes, cart,
    update(dt) {
      void dt;
      updateCart();
      // the box named in the job may have gone to another shelf: name another one of the same product
      for (const sh of shelves.values()) {
        if (sh.done || !sh.boxN) continue;
        const rec = boxes.get(sh.boxN);
        if (rec && !rec.used) continue;
        const alt = [...boxes.values()].find((b) => b.produto === sh.produto && !b.used);
        if (alt) { const old = sh.boxN; sh.boxN = alt.n; const t = list.find((x) => x.id === 'repor-' + sh.id); if (t) t.text = t.text.replace(`(caixa ${old})`, `(caixa ${alt.n})`); bus.emit('tasks:change'); }
      }
      if (!progression.st.tutorialDone) return;
      const m = time.minutes;
      while (plan.length && plan[0].at <= m) {
        if (pending().length >= cfg.maxPendentes || m - lastSpawn < 7) break;
        const e = plan.shift();
        if (spawn(e.kind)) lastSpawn = m;
      }
    },
    get plan() { return plan; },
    // what is left of the preparation at 00:00 counts as not done once, right then (`penalized`); it stays pending and is not counted again at the closing
    undone: () => list.filter((t) => !t.done && !t.penalized).length,
    setPrep(v) { prepMode = Boolean(v); },
    penalizePrep() { const left = list.filter((t) => t.prep && !t.done && !t.penalized); for (const t of left) t.penalized = true; if (left.length) bus.emit('tasks:change'); return left.length; },
    prepList: () => list.filter((t) => t.prep),
    setTillEnabled(v) { till.enabled = v; },
    allDone: () => list.every((t) => t.done),
  };
}
