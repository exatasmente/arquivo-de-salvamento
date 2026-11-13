// CustomerSystem: arrival, order, patience, reactions and vehicles. Also the pump service (nozzles,
// tank cap, trigger, display) and the shop counter service (items, the shelf behind the counter,
// scanner, change from a drawer that really holds the notes and coins), because these are what a
// customer asks for. Every customer is a function of a seed.
//
// Who comes: the types of data/cast.json by category (common, nuisance, suspicious) drawn by weight and
// hour, and the three recurring people on their nights and hours (their short scenes are in
// data/recurring.pt-BR.json). Behaviours: pump, shop, pump then shop, the torn note (accept or ask for
// another), the drunk who does not want to leave, the dark-windowed car that only looks, the man who
// asks for the bathroom, the man who only looks (the 03:33 one).
//
// How a shop customer comes (a function of its seed): by car, like everyone else: along the highway, into a free stall of
// the parking lot (traffic.js reserves it before the car is born), out of the car, on foot to the bell door (nav.js
// finds the way and keeps them from walking through each other, the attendant or a car), through 1 to 4 gondolas and
// fridges taking what they came for (the shelf's stock goes down), then to the counter. After paying they walk back to
// the car, get in and drive off. Whoever comes on foot (the drunk, the man who asks for the bathroom, the 03:33 one)
// walks in from the road. Whoever filled the tank and also comes in leaves the car at the pump.
import { mulberry32 } from '../rng.js';
import { buildHuman } from '../models/human.js';
import { buildCustomer } from '../models/customer.js';
import { customerIdentity, customerLook, poseWalk } from '../look.js';
import { money, fill } from '../util.js';
import { getNav } from './nav.js';

const WORDS = { 'vinte e cinco': 25, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60 };

export function createCustomers(bus, { world, render, interaction, inventory, progression, ui, time, sanityFx, sanityValue, data, cash, player, traffic, device = () => 'keyboard', keyFails = () => false }) {
  const THREE = render.THREE;
  const nav = getNav(world, player);
  const cfg = data.customers, items = data.items;
  const cast = data.cast || { tipos: [], recorrentes: [] };
  const scenes = (data.recurring && data.recurring.cenas) || [];
  const list = [];
  const reserved = new Set();           // pumps an event is using
  const taken = new Set();              // nozzles out of their holster, "pump-type"
  const followQ = [];                   // customers who walk in after the pump
  let recQueue = [], chores = null;
  let counter = 0, simNow = 0;
  let rng = mulberry32(1);
  let timer = 30, enabled = false;
  const nightRecurring = [];
  const pickOf = (arr) => arr[Math.floor(rng() * arr.length)];
  const say = (c, lines) => ui.say(c.name, Array.isArray(lines) ? pickOf(lines) : lines, { seed: c.seed });
  const pick = (k) => cfg.falas[k];

  const tank = new THREE.Vector3();

  // ------------------------------------------------------------------ vehicles on the road (the routes are in traffic.js)
  const vspec = (car) => ({ len: car.size?.l ?? 4.3, wid: car.size?.w ?? 1.8, capZ: car.tankCap.position.z });
  /** Puts a car in the traffic for pump n. Returns the vehicle, or null if the bay is not free. */
  function drive(c, n) {
    const sp = vspec(c.car);
    const v = traffic.add({ root: c.car.root, ...sp, pump: n, kind: c.kind });
    if (!v) return null;
    c.veh = v;
    v.onParked = () => { c.state = c.kind === 'empty' || c.kind === 'dark' ? 'parked' : 'waiting'; c.age = 0; bus.emit('car:parked', c); if (c.kind === 'car') bus.emit('step', 'fuel.arrived', c); };
    v.onGone = () => remove(c);
    return v;
  }
  function departCar(c) { if (c.veh && !c.departed) { c.departed = true; traffic.depart(c.veh); bus.emit('sfx', 'carro_vai', { pos: c.car.root.position.toArray() }); } }

  /** The free pump nearest the entrance (or `prefer`, for the scripted ones). len/capZ: the body that has to fit the bay. */
  function freePump(prefer = 0, len = 4.3, capZ = -1.4) {
    const n = world.pumpCount();
    const free = (i) => !list.some((c) => c.pump === i) && !reserved.has(i) && !chores?.pumpStuck(i) && traffic.bayFree(i, len, capZ);
    if (prefer && free(prefer)) return prefer;
    for (let i = 1; i <= n; i++) if (free(i)) return i;
    return 0;
  }
  const nozzleName = (t) => items.combustiveis[t]?.nome ?? t;

  // ------------------------------------------------------------------ who a customer is
  const pickRange = (v, r) => (Array.isArray(v) ? v[Math.floor(r() * v.length)] : v);
  /** The bills a customer pays with so that they cover `needCents`. */
  function billsFor(pay, needCents, r) {
    const notas = (pay?.notas?.length ? pay.notas : [20, 50, 100]).map((n) => n * 100).sort((a, b) => a - b);
    const one = notas.find((n) => n >= needCents + 100);
    if (one) { const ok = notas.filter((n) => n >= needCents + 100); return [ok[Math.floor(r() * Math.min(2, ok.length))]]; }
    const out = []; let sum = 0; const big = notas[notas.length - 1];
    while (sum < needCents + 100) { out.push(big); sum += big; }
    return out;
  }
  function appearance(src, seed, extra = {}) {
    const spec = { categoria: src.categoria || 'comum', roupa: 'civil', ...(src.aparencia || {}), ...extra };
    if (spec.pessoas) Object.assign(spec, spec.pessoas[0]);
    try { return buildCustomer(render, spec, { seed }); } catch (e) { console.warn('customer model', e.message); return buildHuman(render, customerLook(seed)); }
  }
  function reactions(c, kind, errId) {
    if (c.scene?.reacoes?.[kind]) return c.scene.reacoes[kind];
    const R = c.tipo?.reacoes?.[kind];
    if (R) return (errId && R.porTipo?.[errId]) || R.falas;
    return null;
  }

  /** The second person of a couple: a silhouette of the passenger seat, dressed by the cast's outfit colour. */
  const OUTFIT_COL = { 'festa-ela': ['#8a3a5a', '#d8b894'], 'festa-ele': ['#2a2a3a', '#c8a888'] };
  function addPassenger(car, spec, s) {
    const [cloth, skin] = OUTFIT_COL[spec.roupa] || ['#4a4a52', '#c8a888'];
    const g = new THREE.Group();
    const m = (geo, col, pos) => { const o = new THREE.Mesh(geo, render.mat(col)); o.position.set(...pos); g.add(o); return o; };
    m(new THREE.BoxGeometry(0.4, 0.5, 0.2), cloth, [0, 0.25, 0]);
    const head = m(new THREE.SphereGeometry(0.12, 6, 4), skin, [0, 0.62, 0]); head.scale.set(1, 1.15, 1);
    m(new THREE.BoxGeometry(0.38, 0.06, 0.32), cloth, [0, 0.35, 0.28]).rotation.x = 0.1;
    // the driver sits on +x; the passenger on the other side, one seat over, a little turned to the driver
    const p = car.root.children.flatMap((c) => c.children || []).length ? null : null; void p;
    g.position.set(-0.4, car.size?.h > 1.2 ? 1.1 : 0.78, 0.0 + (car.size?.l ? -car.size.l * 0.05 : 0));
    g.rotation.y = 0.2 + (mulberry32(s)() - 0.5) * 0.3;
    car.root.add(g);
    return g;
  }

  // ------------------------------------------------------------------ the car customer (pump)
  function spawnCar({ pump = 0, seed, tutorial = false, valor, combustivel, tipo = null, rec = null, scene = null, entry = null } = {}) {
    const truck = (rec || tipo)?.veiculo?.tipo === 'caminhao';
    let n = pump && !list.some((c) => c.pump === pump) ? pump : freePump(0, truck ? 6.4 : (rec || tipo)?.veiculo?.tipo === 'moto' ? 2.0 : 4.3, truck ? 1.05 : -1.4);
    if (truck) n = [1, 3].find((i) => !list.some((c) => c.pump === i) && !reserved.has(i) && !chores?.pumpStuck(i) && traffic.bayFree(i, 6.4, 1.05)) || 0;
    if (!n) return null;
    const id = ++counter, s = seed ?? Math.floor(rng() * 1e6);
    const src = rec || tipo;
    const ident = rec ? { name: rec.nome } : customerIdentity(s);
    const spot0 = world.carSpot(n);
    const V = src?.veiculo || {};
    const fuelWanted = combustivel || V.combustivel;
    const vopts = { capSide: spot0.capSide, style: V.estilo, color: V.cor, fuel: fuelWanted };
    const car = V.tipo === 'moto' ? world.moto(s, { capSide: spot0.capSide, color: V.cor, bare: entry?.variante === 'volta' }) : world.car(s, V.tipo === 'caminhao' ? { ...vopts, style: 'caminhao' } : vopts);
    car.setDriver(true); car.setLights(true);
    render.scene.add(car.root);
    const rr = mulberry32(s * 13 + 5);
    let value = (valor ?? pickRange(src?.pedido?.valor, rr) ?? rr.pick(cfg.carro.valores));
    const fuel = car.fuel;
    // the words of the order
    let lines = null, text;
    if (rec && scene) {
      const v = (scene.variantes || []).find((q) => condOk(q.condicao)) || scene;
      lines = v.falas.map((f) => ({ q: f.q, t: f.t }));
      const joined = lines.filter((l) => l.q === 'cliente').map((l) => l.t.toLowerCase()).join(' ');
      for (const [w, num] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b(?=\\s+(reais|de|em)\\b)`).test(joined)) { value = num; break; }
      text = lines.filter((l) => l.q === 'cliente').slice(-1)[0]?.t || 'Põe {valor}.';
    } else if (tipo?.falas?.pedido) text = pickOf(tipo.falas.pedido);
    else {
      const named = tutorial || rr() < 0.6;
      text = tutorial ? cfg.tutorial.carro.texto : rr.pick(cfg.carro.pedidos.filter((p) => (p.tipo === 'com-combustivel') === named)).texto;
    }
    value = Math.min(value, world.pumpMaxCents() / 100 - 4) * 100;     // the pump's display has four digits (99.99) or five (999.99)
    const vars = { valor: `${value / 100} reais`, combustivel: nozzleName(fuel).toLowerCase() };
    text = fill(text, vars);
    if (lines) lines.forEach((l) => { l.t = fill(l.t, vars); });
    const volta = entry?.variante === 'volta' && rec?.pagamentoVolta;
    const bills = volta ? [value] : billsFor(src?.pagamento || { notas: cfg.carro.pagamento }, value, rr);
    const c = {
      id, kind: 'car', seed: s, name: ident.name, pump: n, car, state: 'arriving', tutorial, value, text, fuel, cents: 0, bills, bill: bills.reduce((a, b) => a + b, 0),
      nozzleIn: false, nozzleType: null, fueling: false, rate: 0, wrong: false, typed: 0, ordered: false, tipo, rec, scene, lines, entry, nota: src?.pagamento?.nota,
      patience: tutorial ? 1e9 : (src?.paciencia ?? cfg.carro.paciencia), age: 0, capPos: new THREE.Vector3(), targets: [], pay: null,
      tipRange: volta ? [0, 0] : src?.pagamento?.gorjeta, cat: src?.categoria || 'comum',
    };
    if (volta) c.nota = rec.pagamentoVolta.nota;
    if (!drive(c, n)) { render.scene.remove(car.root); return null; }
    list.push(c);
    world.pumpDisplay(n, 0);
    if (rec) { progression.recurring(rec.id + ':' + scene.id); nightRecurring.push(rec.nome); }
    if (c.cat === 'inconveniente') bus.emit('incident', 'cliente-inconveniente', { id });
    if ((tipo?.aparencia?.pessoas?.length || 0) > 1) c.passenger = addPassenger(car, tipo.aparencia.pessoas[1], s);
    const T = (t) => { c.targets.push(interaction.register(t)); };
    T({
      id: `cliente${id}`, reach: 4.2, priority: 0,
      aim: () => (c.state === 'arriving' || c.state === 'leaving' ? null : { c: car.root.position.clone().setY(1.1), r: V.tipo === 'caminhao' ? 2.8 : 1.5 }),
      enabled: () => !['arriving', 'leaving'].includes(c.state) && !(c.fueling),
      label: () => {
        if (c.cents > 0 && !c.paying) return { text: `Receber ${money(c.cents)}` };
        if (!c.ordered) return { text: 'Falar com o cliente' };
        return { text: 'Ouvir o pedido de novo' };
      },
      tap: () => {
        if (c.cents > 0) return charge(c);
        talkCar(c);
      },
    });
    T({
      id: `tampa${id}`, reach: 2.6, priority: 2,
      aim: () => { car.tankCap.getWorldPosition(c.capPos); return c.state === 'arriving' || c.state === 'leaving' ? null : { c: c.capPos, r: 0.32 }; },
      enabled: () => !['arriving', 'leaving'].includes(c.state),
      label: () => {
        const cr = inventory.carry;
        if (c.nozzleIn) return { text: c.fueling ? 'Abastecendo: espere o bip' : 'Tirar o bico do tanque' };
        if (cr && cr.kind === 'bico') return { text: 'Pôr o bico no tanque' };
        const tag = c.tutorial ? ` (${nozzleName(c.fuel)})` : '';
        return { text: 'Tampa do tanque' + tag };
      },
      tap: () => {
        const cr = inventory.carry;
        if (c.nozzleIn) { if (c.fueling) return bus.emit('hint', 'A bomba está abastecendo. Espere desligar.'); pullNozzle(c); return; }
        if (cr && cr.kind === 'bico') insertNozzle(c, cr);
        else bus.emit('hint', 'Pegue o bico na bomba primeiro.');
      },
    });
    bus.emit('customer:arrive', c);
    return c;
  }
  async function talkCar(c) {
    if (c.talking) return;
    c.talking = true;
    if (c.lines && !c.ordered) {
      const lines = c.lines.map((l) => (l.q === 'pensamento' ? `(${l.t})` : l.t));
      await ui.dialogue(c.name, lines, c.seed);
      c.sceneSeen = true;
    } else say2(c, c.text);
    c.talking = false;
    c.ordered = true; if (c.state === 'waiting') c.state = 'ordered';
    bus.emit('step', 'fuel.ordered', c);
  }
  function say2(c, text) { ui.say(c.name, text, { seed: c.seed }); }

  function accrue(c, dt) {
    const speed = 110 + 150 * c.rate;             // cents per second: about R$ 2,60 at full flow
    c.cents = Math.min(world.pumpMaxCents(), c.cents + speed * dt);
    world.pumpDisplay(c.pump, c.cents);
  }
  /** The pump runs by itself up to the typed value, then shuts off and beeps. */
  function autoPump(c, dt) {
    c.rate = Math.min(1, c.rate + dt * 1.4);
    accrue(c, dt);
    if (c.cents >= c.typed) { c.cents = c.typed; world.pumpDisplay(c.pump, c.cents); stopFuel(c); }
  }
  function stopFuel(c) {
    c.fueling = false; c.rate = 0;
    bus.emit('loop', 'bomba' + c.pump, 'bomba_corre', { on: false });
    bus.emit('sfx', 'bomba_para', { pos: c.capPos.toArray() });
    bus.emit('sfx', 'bomba_bip', { pos: c.capPos.toArray() });
    bus.emit('step', 'fuel.stop', c);
  }
  /** The attendant has typed the value on the pump's panel and pressed to start. */
  function startPump(c, cents) {
    c.typed = cents; c.cents = 0; c.fueling = true; c.rate = 0;
    if (c.nozzleType !== c.fuel) c.wrong = true;
    world.pumpDisplay(c.pump, 0);
    bus.emit('sfx', 'gatilho_clique', { pos: c.capPos.toArray() });
    bus.emit('loop', 'bomba' + c.pump, 'bomba_corre', { on: true, pos: c.capPos.toArray() });
    bus.emit('step', 'fuel.start', c);
  }
  async function openPanel(c) {
    if (c.panel) return;
    c.panel = true;
    const v = await ui.keypad({
      title: `BOMBA ${c.pump}: VALOR`,
      lines: [`Bico no tanque: ${nozzleName(c.nozzleType)}.`, 'Digite o valor e ligue. A bomba abastece sozinha e desliga no valor.'],
      okLabel: 'LIGAR', backLabel: 'CANCELAR', max: world.pumpMaxCents(),
      onChange: (cents) => world.pumpDisplay(c.pump, cents),   // the display shows what is typed
    });
    c.panel = false;
    if (v === null) world.pumpDisplay(c.pump, 0);
    if (v === null) return;
    if (v <= 0) { bus.emit('hint', 'Digite um valor maior que zero.'); return; }
    startPump(c, v);
  }
  function registerPanels() {
    for (let n = 1; n <= world.pumpCount(); n++) {
      const cust = () => list.find((c) => c.kind === 'car' && c.pump === n && !['arriving', 'leaving'].includes(c.state) && !c.done);
      // the physical keypad on the pump (keyboard and mouse): aim at a key and press; the screen's keypad stays for the gamepad and touch
      const kp = world.posto.pumps?.[n]?.keypad;
      const keyAim = () => { if (!kp) return null; const o = player.eyePos(), off = sanityFx(), yaw = player.st.yaw + off.aimX, pitch = player.st.pitch + off.aimY; const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); return kp.keyAtRay(o, d, 2.8); };
      if (kp) {
        const buf = { cents: 0 };
        const show = () => world.pumpDisplay(n, buf.cents);
        interaction.register({
          id: 'teclado' + n, reach: 2.6, priority: 2,
          aim: () => (device() === 'keyboard' ? { box: world.aimBox('teclado' + n, 0.05) } : null),
          enabled: () => Boolean(cust()) && device() === 'keyboard',
          label: () => {
            const c = cust(), k = keyAim(); if (!c || !k) return null;
            if (c.fueling) return { text: 'A bomba está abastecendo' };
            if (c.cents > 0) return { text: 'Já abasteceu. Tire o bico e cobre o cliente' };
            if (!c.nozzleIn) return { text: 'Teclado: ponha o bico no tanque antes' };
            return { text: k === 'ligar' ? 'LIGAR a bomba' : k === 'cancelar' ? 'CANCELAR (zera o valor)' : `Tecla ${k}` };
          },
          tap: () => {
            const c = cust(), k = keyAim(); if (!c || !k) return;
            if (chores?.pumpStuck(n)) { bus.emit('hint', 'A bomba travou. Gire o registro, na frente da bomba.'); bus.emit('sfx', 'erro', {}); return; }
            if (c.fueling || c.cents > 0) return bus.emit('hint', c.fueling ? 'Espere a bomba desligar sozinha.' : 'Já abasteceu. Tire o bico e cobre o cliente.');
            if (!c.nozzleIn) return bus.emit('hint', 'Ponha o bico no tanque antes de ligar a bomba.');
            kp.setPressed(k, true); setTimeout(() => kp.setPressed(k, false), 140);
            bus.emit('sfx', 'tecla', { pos: world.at('teclado' + n, 1).toArray() });
            if (k === 'cancelar') { buf.cents = 0; show(); return; }
            if (k === 'ligar') { if (buf.cents <= 0) return bus.emit('hint', 'Digite um valor maior que zero.'); const v = buf.cents; buf.cents = 0; kp.setLed?.(true); startPump(c, v); return; }
            if (keyFails()) { bus.emit('sfx', 'erro', {}); return; }   // the key did not take
            const nx = buf.cents * 10 + Number(k); if (nx <= world.pumpMaxCents()) buf.cents = nx;
            show();
          },
        });
      }
      interaction.register({
        id: 'painel' + n, reach: 2.6, priority: 1,
        aim: () => ({ box: world.aimBox('mostrador' + n, 0.25) }),
        enabled: () => Boolean(cust()) && (!kp || device() !== 'keyboard'),
        label: () => {
          const c = cust(); if (!c) return null;
          if (c.fueling) return { text: 'A bomba está abastecendo' };
          if (c.cents > 0) return { text: `Painel: ${money(c.cents)} abastecidos` };
          return c.nozzleIn ? { text: 'Digitar o valor no painel da bomba' } : { text: 'Painel da bomba: ponha o bico no tanque' };
        },
        tap: () => {
          const c = cust(); if (!c) return;
          if (chores?.pumpStuck(n)) { bus.emit('hint', 'A bomba travou. Gire o registro, na frente da bomba.'); bus.emit('sfx', 'erro', {}); return; }
          if (c.fueling) return bus.emit('hint', 'Espere a bomba desligar sozinha.');
          if (c.cents > 0) return bus.emit('hint', 'Já abasteceu. Tire o bico e cobre o cliente.');
          if (!c.nozzleIn) return bus.emit('hint', 'Ponha o bico no tanque antes de ligar a bomba.');
          bus.emit('sfx', 'tecla', {}); openPanel(c);
        },
      });
    }
  }

  function insertNozzle(c, cr) {
    c.nozzleIn = true; c.nozzleType = cr.fuel; c.nozzleFrom = cr;
    inventory.clearCarry();
    const nz = world.prop('bico', { fuel: cr.fuel });
    nz.scale.setScalar(1.6);
    c.car.tankCap.add(nz); nz.position.set(0, 0, 0.05); nz.rotation.set(0, 0, 0); c.nozzleObj = nz; c.car.openCap?.(1);
    bus.emit('sfx', 'tampa_abre', { pos: c.capPos.toArray() });
    bus.emit('step', 'fuel.inserted', c);
  }
  function pullNozzle(c) {
    if (!c.nozzleIn || inventory.carry) { if (inventory.carry) bus.emit('hint', 'Suas mãos estão ocupadas.'); return; }
    c.nozzleIn = false; c.car.openCap?.(0);
    if (c.nozzleObj) { c.car.tankCap.remove(c.nozzleObj); c.nozzleObj = null; }
    inventory.setCarry({ ...c.nozzleFrom }, 'bico', { fuel: c.nozzleFrom.fuel });
    bus.emit('sfx', 'bico_pega', {});
    bus.emit('step', 'fuel.pulled', c);
  }

  // ------------------------------------------------------------------ paying
  /** The torn note: accept it (it cannot be banked) or ask for another. Returns 'aceitar' | 'recusar'. */
  function decideTorn(c) {
    return new Promise((resolve) => {
      ui.menu({
        title: 'NOTA RASGADA', lines: [`${c.name} entrega uma nota rasgada e colada com fita.`, 'Aceitar a nota ou pedir outra?'],
        items: [
          { label: () => 'ACEITAR A NOTA', act: () => { ui.closeModal(); resolve('aceitar'); } },
          { label: () => 'PEDIR OUTRA NOTA', act: () => { ui.closeModal(); resolve('recusar'); } },
        ],
      });
    });
  }
  /** The old coin Rafael pays with when he is back: it is not money. Accept it (it cannot be banked) or ask for another way. */
  function decideCoin(c) {
    return new Promise((resolve) => {
      ui.menu({
        title: 'MOEDA ANTIGA', lines: [`${c.name} estende uma moeda de cobre apagado, de um valor que ninguém lê mais.`, 'Ela não é do troco e não entra na gaveta como dinheiro.', 'Aceitar a moeda ou pedir outra forma de pagar?'],
        items: [
          { label: () => 'ACEITAR A MOEDA', act: () => { ui.closeModal(); resolve('aceitar'); } },
          { label: () => 'PEDIR OUTRA FORMA', act: () => { ui.closeModal(); resolve('recusar'); } },
        ],
      });
    });
  }
  /** Common start of a payment: returns { res, torn } or null if nothing was delivered. */
  async function collect(c, total) {
    if (!cash.opened) { bus.emit('hint', 'O caixa ainda está fechado. Abra a registradora.'); return null; }
    if (c.nota === 'moeda-antiga' && !c.tornDecided) {
      const ch = await decideCoin(c);
      c.tornDecided = true; c.tornAccepted = ch === 'aceitar';
      if (c.tornAccepted) { say(c, reactions(c, 'gentileza')); progression.flag('item:moeda-antiga'); bus.emit('sanity:add', -3, 'moeda-antiga'); bus.emit('sfx', 'moeda_antiga', {}); bus.emit('hint', 'A moeda fica com você. O caixa não vai bater por ela.'); }
      else { say(c, reactions(c, 'erro')); c.state = 'leaving'; c.done = true; c.leaveAfter = 0.6; bus.emit('customer:done', c, 0); return null; }
    }
    if (c.nota === 'rasgada' && !c.tornDecided) {
      const ch = await decideTorn(c);
      c.tornDecided = true; c.tornAccepted = ch === 'aceitar';
      const dec = c.tipo?.decisao?.[ch];
      if (dec) say(c, dec.falas);
      if (ch === 'aceitar') { if (dec?.efeito?.gorjeta) progression.pay(dec.efeito.gorjeta / 100); }
      else { c.age = Math.max(0, c.age - 0); c.patience += (dec?.efeito?.paciencia ?? -40) < 0 ? -(dec.efeito.paciencia) * -1 : 0; progression.complaint('nota'); }
    }
    // the bills the customer paid are in the drawer before the change goes out (a torn note is not usable)
    const st = { ...cash.stock };
    c.bills.forEach((b, i) => { if (!(c.tornAccepted && i === 0)) st[b] = (st[b] || 0) + 1; });
    const res = await ui.openChange({ total, paid: c.bill, hint: c.tutorial, who: c.name, stock: st });
    if (res === null) return null;
    return { res, torn: c.tornAccepted };
  }
  function book(c, total, res, torn) {
    c.bills.forEach((b, i) => cash.receive(b, torn && i === 0));
    cash.give(res.pieces); cash.ring(total);
  }
  function tipFor(c, errors) {
    if (errors || !c.tipRange) return;
    const [a, b] = c.tipRange; if (!b) return;
    const cents = Math.round(a + rng() * (b - a));
    if (cents > 0) { progression.pay(cents / 100); bus.emit('hint', `Gorjeta: ${money(cents)}`); }
  }
  function thanks(c, errors) {
    if (errors) return;
    const fast = c.age < c.patience * 0.4;
    const g = reactions(c, 'gentileza');
    if (g && fast) { say(c, g); return; }
    say(c, c.tipo?.falas?.obrigado || pick('obrigado'));
  }
  function errorLine(c, fallbackKey, errId) {
    const r = reactions(c, 'erro', errId);
    say(c, r || pick(fallbackKey));
  }

  async function charge(c) {
    if (c.paying || c.fueling) return;
    c.paying = true;
    const got = await collect(c, c.cents);
    c.paying = false;
    if (!got) return;
    settleCar(c, got.res, got.torn);
  }
  function settleCar(c, res, torn) {
    const given = res.sum;
    const correct = c.bill - Math.round(c.cents);
    const diff = given - Math.round(correct);
    let errors = 0;
    const T = c.value, C = c.cents;
    book(c, C, res, torn);
    if (c.wrong) { progression.error('combustivel', c.id); progression.complaint('combustivel'); errorLine(c, 'combustivel_errado', 'combustivel-errado'); errors++; }
    if (c.typed !== T) { progression.error('valor-digitado', c.id); errorLine(c, c.typed < T ? 'faltou' : 'passou', c.typed < T ? 'valor-curto' : 'valor-passado'); errors++; }
    if (c.nozzleIn) { progression.error('bico-esquecido', c.id); progression.complaint('bico'); errorLine(c, 'bico', 'bico-esquecido'); errors++; forgetNozzle(c); }
    if (diff !== 0) { progression.error('troco', c.id); errorLine(c, diff < 0 ? 'troco_curto' : 'troco_longo', diff < 0 ? 'troco-curto' : 'troco-longo'); errors++; if (diff < 0) progression.complaint('troco'); }
    if (!errors) { progression.ok('abastecimento'); thanks(c, 0); bus.emit('sfx', 'caixa_gaveta', {}); tipFor(c, 0); }
    c.state = 'leaving'; c.done = true;
    bus.emit('step', errors ? 'fuel.paid-with-errors' : 'fuel.paid', c);
    bus.emit('customer:done', c, errors);
    c.leaveAfter = 1.4;
    if (!errors && c.tipo?.pedido?.modo === 'bomba+loja') { c.hold = true; c.holdT = 0; followQ.push({ t: 4, tipo: c.tipo, seed: c.seed + 1, name: c.name, owner: c }); }   // the car stays at the pump until they are back
  }
  function forgetNozzle(c) {
    if (c.nozzleObj) { c.car.tankCap.remove(c.nozzleObj); c.nozzleObj = null; }
    c.nozzleIn = false; c.car.openCap?.(0);
    const key = `${c.pump}-${c.nozzleFrom.fuel}`; taken.delete(key); showHolster(c.pump, c.nozzleFrom.fuel, true);
  }

  // ------------------------------------------------------------------ nozzles on the pumps
  function showHolster(n, t, on) { const it = world.interactable(`bico${n}-${t}`); if (it?.object3D) it.object3D.visible = on; }
  function registerPumps() {
    const N = world.pumpCount();
    for (let n = 1; n <= N; n++) {
      for (const t of world.nozzleTypes(n)) {
        const key = `${n}-${t}`, anc = world.anchor(`bico${n}-${t}`);
        interaction.register({
          id: `bico${key}`, reach: 2.4, priority: 2,
          aim: () => ({ c: anc.pos, r: 0.15 }),
          enabled: () => !taken.has(key) || (inventory.carry && inventory.carry.kind === 'bico' && inventory.carry.pump === n),
          label: () => {
            const cr = inventory.carry;
            if (cr && cr.kind === 'bico') return cr.pump === n ? { text: 'Devolver o bico' } : null;
            if (cr) return { text: 'Suas mãos estão ocupadas' };
            const f = items.combustiveis[t];
            return { text: `Bico ${f.nome}` };
          },
          tap: () => {
            const cr = inventory.carry;
            if (cr && cr.kind === 'bico') {
              if (cr.pump !== n) return;
              inventory.clearCarry(); const k2 = `${cr.pump}-${cr.fuel}`; taken.delete(k2); showHolster(cr.pump, cr.fuel, true);
              bus.emit('sfx', 'bico_devolve', { pos: anc.pos.toArray() }); bus.emit('step', 'fuel.returned', null); return;
            }
            if (cr) { bus.emit('hint', 'Suas mãos estão ocupadas.'); return; }
            taken.add(key); showHolster(n, t, false);
            inventory.setCarry({ kind: 'bico', fuel: t, pump: n }, 'bico', { fuel: t });
            bus.emit('sfx', 'bico_pega', { pos: anc.pos.toArray() });
            bus.emit('step', 'fuel.nozzle', { fuel: t, pump: n });
          },
        });
      }
    }
  }

  // ------------------------------------------------------------------ the shop customer
  const counterGeo = () => {
    const b = world.anchor('balcao'), side = new THREE.Vector3(-b.dir.z, 0, b.dir.x).normalize();
    return { b, side, stand: b.pos.clone().setY(0), top: b.pos.clone().addScaledVector(b.dir, 1.2).setY(1.0) };
  };
  const scannerAim = () => world.aimBox('leitor', 0.12);
  const WATCH = new THREE.Vector3(9.4, 0, 6.6);
  // ------------------------------------------------------------------ on foot: where to, and how
  const PUBLIC_DOORS = new Set(['porta-loja', 'porta-banheiro-m', 'porta-banheiro-f']);    // the only doors a customer uses
  const ROAD = new THREE.Vector3(1.6, 0, -23.5);                                              // where the ones on foot come from and go back to
  const WALK = 1.5;
  /** Where a person stands to get out of (or into) the car of a pump customer: its south side, between the car and the lane. */
  const ownerDoor = (o) => ({ x: o.car.root.position.x, z: o.car.root.position.z + 1.5 });
  /** The point a shelf, fridge or the coffee machine is looked at from, and the way it faces. */
  function facing(x, z) {
    let best = null, bd = 1e9;
    for (const c of world.colliders) {
      if (c.vehicle || c.door || c.enabled === false || c.min[1] > 0.3 || c.max[1] < 1.0 || c.max[1] > 2.6) continue;
      const px = Math.max(c.min[0], Math.min(c.max[0], x)), pz = Math.max(c.min[2], Math.min(c.max[2], z)), d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
    return best && bd < 2 ? best : { x: x, z: z + 1 };
  }
  /** The shelves and fridges a shop customer goes to: 1 to 4 stops, the ones that hold what they came for and, to fill the visit, others. */
  function chooseStops(c, rr) {
    const rows = world.shelves.filter((q) => q && !q.atras && world.anchor(q.id));
    const fridges = ['geladeira1', 'geladeira2'].filter((n) => world.anchor(n));
    const stops = [];
    const stopAt = (key, p, row) => {
      let st = stops.find((q) => q.key === key);
      if (!st) { const a = world.anchor(key); st = { key, kind: 'shop', p: { x: a.pos.x, z: a.pos.z }, row, take: [], hold: 1.1 + rr() * 1.3 }; st.face = facing(st.p.x, st.p.z); stops.push(st); }
      if (p) st.take.push({ p, row });
    };
    for (const p of c.prods) {
      if (p.atras) continue;
      if (p.copo) { if (world.anchor('cafeteira')) stopAt('cafeteira', p, null); continue; }
      const cold = (p.tipo === 'garrafa' || p.tipo === 'lata') && fridges.length && rr() < 0.6;
      if (cold) { stopAt(fridges[Math.floor(rr() * fridges.length)], p, rows.find((q) => q.tipo === p.tipo) || null); continue; }
      const mine = rows.filter((q) => q.tipo === p.tipo);
      const row = mine.length ? mine[Math.floor(rr() * mine.length)] : rows[Math.floor(rr() * rows.length)];
      if (row) stopAt(row.id, p, row);
    }
    // 1 to 4 stops in all; the ones with no product are a look around
    const want = 1 + Math.floor(rr() * 4);
    let guard = 0;
    while (stops.length < Math.min(4, want) && guard++ < 12) {
      const pool = [...rows.map((q) => q.id), ...fridges];
      stopAt(pool[Math.floor(rr() * pool.length)], null, null);
    }
    while (stops.length > 4) { const last = stops.pop(); stops[stops.length - 1].take.push(...last.take); }
    // nearest first, starting from the door
    const out = []; let cur = { x: c.inside.x, z: c.inside.z };
    while (stops.length) {
      let bi = 0, bd = 1e9;
      stops.forEach((q, i) => { const d = Math.hypot(q.p.x - cur.x, q.p.z - cur.z); if (d < bd) { bd = d; bi = i; } });
      const q = stops.splice(bi, 1)[0]; out.push(q); cur = q.p;
    }
    return out;
  }
  /** What a customer who has just got out does, in order: through the bell door, past the stops, to the counter. */
  function planShop(c) {
    const rr = mulberry32(c.seed * 31 + 7);
    const legs = [{ kind: 'bell', p: { x: c.inside.x, z: c.inside.z } }];
    if (c.role === 'normal' && !c.tutorial) legs.push(...chooseStops(c, rr));
    legs.push({ kind: 'stand' });
    c.legs = legs; c.legI = 0; c.nr = null; c.atLeg = false; c.legT = 0;
  }
  /** Customers ahead of this one at the counter (the first stands at the counter, the next behind). */
  const queuePlace = (c) => list.filter((o) => o !== c && o.kind === 'walk' && !o.noCounter && o.id < c.id && !o.inCar && ['entering', 'placing', 'scanning', 'ready', 'asking', 'queue'].includes(o.state) && (o.state !== 'entering' || o.legI >= o.legs.length - 1)).length;
  function standPoint(c) {
    if (c.role === 'observa') return c.stand;
    const { b } = counterGeo(), k = queuePlace(c);
    return { x: c.stand.x - b.dir.x * 1.1 * k, z: c.stand.z - b.dir.z * 1.1 * k };
  }
  function routeTo(c, p) {
    const pts = nav.path(c.human.root.position, p, { doors: (d) => PUBLIC_DOORS.has(d) });
    c.nr = nav.route(pts || [{ x: p.x, z: p.z }]);
  }
  function walkRoute(c, speed, dt) {
    const h = c.human.root, r = nav.follow(c.agent, c.nr, speed, dt);
    if (r.moved) { h.rotation.y = Math.atan2(r.hx, r.hz); c.walkPhase += dt * 8; }
    return r;
  }
  /** The customer gets out of the car (or off the pump's side) and the visit starts. */
  function stepOut(c) {
    const h = c.human.root, p = traffic.lotDoor(c.spot);
    h.position.set(p.x, 0, p.z);
    render.scene.add(h);
    if (c.comp) { c.comp.root.position.copy(h.position); render.scene.add(c.comp.root); }
    c.inCar = false; c.agent.hidden = false; nav.add(c.agent);
    c.car.setDriver(false); c.car.setLights(false);
    planShop(c);
    c.state = 'entering';
  }
  function getInCar(c) {
    const h = c.human.root;
    render.scene.remove(h); if (c.comp) render.scene.remove(c.comp.root);
    nav.remove(c.agent); c.agent.hidden = true; c.inCar = true;
    c.car.setDriver(true); c.car.setLights(true);
    c.leaveAfter = 0.9;
  }
  /** Leaves: back through the bell door if they are in the shop, then to the car (or the pump's side, or the road). */
  function startLeave(c) {
    const p = c.human.root.position;
    c.lv = { stage: (p.x > 2 && p.x < 16 && p.z > 3 && p.z < 12) ? 0 : 1 };
    routeTo(c, c.lv.stage === 0 ? c.inside : exitPoint(c));
  }
  function exitPoint(c) { return c.owner ? ownerDoor(c.owner) : c.spot ? traffic.lotDoor(c.spot) : ROAD; }
  /** Called when a leaving customer has got to the end of the route. Returns true if the customer is gone. */
  function leaveStep(c, t) {
    if (c.lv.stage === 0) {
      c.lv.stage = 1; world.state.sino = t; bus.emit('sfx', 'sino', { pos: c.inside.toArray() });
      routeTo(c, exitPoint(c)); return false;
    }
    if (c.car) { getInCar(c); c.lv.stage = 2; return false; }
    if (c.owner) { c.owner.hold = false; c.owner.leaveAfter = Math.min(c.owner.leaveAfter, 0.8); }
    remove(c); return true;
  }

  const walkerBusy = () => list.some((c) => c.kind === 'walk' && c.state !== 'leaving' && !c.noCounter);

  function productList(ids, rr) {
    return ids.map((k) => {
      if (items.produtos[k]) return { k, ...items.produtos[k], cents: Math.round(items.produtos[k].preco * 100) };
      if (items.atras[k]) return { k, ...items.atras[k], tipo: k, atras: true, cents: Math.round(items.atras[k].preco * 100) };
      if (items.extras[k]) return { k, ...items.extras[k], tipo: k, copo: true, cents: Math.round(items.extras[k].preco * 100) };
      return null;
    }).filter(Boolean);
  }
  function spawnWalker({ seed, tutorial = false, produtos, pagamento, tipo = null, rec = null, scene = null, entry = null, role = 'normal', name, owner = null } = {}) {
    const s = seed ?? Math.floor(rng() * 1e6);
    const src = rec || tipo;
    const V = src?.veiculo || {};
    // who comes by car: everyone who shops, except the ones that walk in from the road and the ones that left the car at the pump
    const byCar = !tutorial && !owner && V.tipo !== 'a-pe' && role === 'normal';
    let car = null, spot = null;
    if (byCar) {
      car = V.tipo === 'moto' ? world.moto(s, { capSide: 'left', color: V.cor }) : world.car(s, { capSide: 'left', style: V.tipo === 'caminhao' ? 'caminhao' : V.estilo, color: V.cor, fuel: 'comum' });
      const sp = vspec(car);
      spot = traffic.reserveLot(sp.len, sp.wid, mulberry32(s * 3 + 11));     // the stall is taken before the car is born
      if (!spot) return null;
    }
    const id = ++counter;
    const ident = rec ? { name: rec.nome } : { name: name || customerIdentity(s).name };
    const h = appearance({ categoria: src?.categoria, ...(src || {}) }, rec?.aparencia?.seed ?? s, entry?.variante ? { variante: entry.variante } : {});
    let comp = null;       // the other half of a couple walks in beside the first
    if ((src?.aparencia?.pessoas?.length || 0) > 1) {
      try { comp = buildCustomer(render, { categoria: 'comum', roupa: 'civil', ...src.aparencia.pessoas[1] }, { seed: s + 99 }); } catch (e) { console.warn('companion', e.message); }
    }
    const { stand } = counterGeo();
    const rr = mulberry32(s * 17 + 3);
    let ids = produtos ?? src?.pedido?.itens ?? (role === 'normal' ? Array.from({ length: rr.pick(cfg.loja.itens) }, () => rr.pick(Object.keys(items.produtos))) : []);
    if (!tutorial && role === 'normal' && !rec && !ids.some((k) => items.atras[k]) && rr() < cfg.atras.chance) ids = [...ids, rr.pick(Object.keys(items.atras))];
    const prods = productList(ids, rr);
    const total = prods.reduce((a, p) => a + p.cents, 0);
    const bills = role === 'normal' && total > 0 ? (pagamento ? [pagamento * 100] : billsFor(src?.pagamento || { notas: [10, 20, 50, 100] }, total, rr)) : [];
    const door = world.anchor('porta-loja-dentro');
    const inside = door.pos.clone().setY(0), entryPt = inside.clone().addScaledVector(door.dir, 3.2);
    const goal = role === 'observa' ? WATCH.clone() : stand;
    const c = {
      id, kind: 'walk', seed: s, name: ident.name, human: h, state: byCar ? 'driving' : 'entering', stand: goal, entry: entryPt, inside, prods, total, bill: bills.reduce((a, b) => a + b, 0), bills, tutorial,
      patience: tutorial ? 1e9 : (src?.paciencia ?? cfg.loja.paciencia), age: 0, scanned: 0, itemObjs: [], targets: [], walkPhase: 0, bag: 0, tipo, rec, scene, noite: entry, role, nota: src?.pagamento?.nota,
      comp, tipRange: src?.pagamento?.gorjeta, cat: src?.categoria || 'comum', noTask: role !== 'normal', noCounter: role === 'banheiro' ? false : role === 'observa', pose: 'parado', tries: 0,
      car, spot, inCar: byCar, owner, agent: { id, pos: h.root.position, r: 0.3, hidden: byCar, doors: (d) => PUBLIC_DOORS.has(d) },
    };
    if (byCar) {
      car.setDriver(true); car.setLights(true);
      render.scene.add(car.root);
      c.veh = traffic.addLot({ root: car.root, ...vspec(car), spot, kind: 'walk' });
      c.veh.onGone = () => remove(c);
    } else {
      const from = owner ? ownerDoor(owner) : tutorial ? entryPt : ROAD;
      h.root.position.set(from.x, 0, from.z); if (comp) comp.root.position.copy(h.root.position);
      render.scene.add(h.root); if (comp) render.scene.add(comp.root);
      nav.add(c.agent);
      planShop(c);
    }
    list.push(c);
    if (rec) { progression.recurring(rec.id + ':' + scene.id); nightRecurring.push(rec.nome); }
    if (c.cat === 'inconveniente') bus.emit('incident', 'cliente-inconveniente', { id });
    if (c.cat === 'suspeito') bus.emit('incident', 'cliente-suspeito', { id });
    const T = (t) => { c.targets.push(interaction.register(t)); };
    T({
      id: `cliente${id}`, reach: 3.2, priority: 0,
      aim: () => (c.state === 'entering' || c.state === 'leaving' || c.state === 'inside' ? null : { c: h.root.position.clone().setY(1.0), r: 0.5 }),
      enabled: () => ['scanning', 'ready', 'asking', 'watch', 'linger', 'placing'].includes(c.state),
      label: () => {
        if (c.state === 'ready') return { text: `Cobrar ${money(c.total)}` };
        if (c.state === 'asking') return { text: 'Falar com o cliente' };
        if (c.state === 'watch') return { text: c.talked ? 'Ouvir de novo' : 'Falar com o cliente' };
        if (c.state === 'linger') return { text: 'Pedir para ele sair (segure)', hold: true };
        return { text: 'Cliente: passe as compras no leitor' };
      },
      tap: () => {
        if (c.state === 'ready') chargeWalker(c);
        else if (c.state === 'asking') askBathroom(c);
        else if (c.state === 'watch') talkWatch(c);
        else if (c.state === 'linger') bus.emit('hint', 'Segure o botão para pedir que ele saia.');
        else bus.emit('hint', 'Pegue cada item e passe no leitor.');
      },
      hold: {
        start() { c.holdT = 0; },
        update(dt) {
          if (c.state !== 'linger') return;
          c.holdT += dt;
          if (c.holdT >= cfg.bebado.segurar) { c.holdT = -99; askLeave(c); }
        },
        end() { c.holdT = 0; },
        progress: () => (c.state === 'linger' ? Math.max(0, c.holdT) / cfg.bebado.segurar : null),
      },
    });
    bus.emit('customer:arrive', c);
    return c;
  }
  function askLeave(c) {
    c.tries++;
    const need = c.tipo?.pedirParaSair?.tentativas ?? cfg.bebado.tentativas;
    if (c.tries >= need) {
      const g = reactions(c, 'gentileza'); say(c, g || 'Tá bom, já vou.');
      c.state = 'leaving'; c.leaveAfter = 0.6;
    } else say(c, cfg.bebado.recusa);
  }
  async function askBathroom(c) {
    if (c.asked) return; c.asked = true;
    say(c, c.tipo.falas.pedido);
    const ch = await new Promise((resolve) => {
      ui.menu({
        title: 'BANHEIRO', lines: [`${c.name} pergunta se pode usar o banheiro.`],
        items: [{ label: () => 'DEIXAR USAR', act: () => { ui.closeModal(); resolve(true); } }, { label: () => 'NEGAR', act: () => { ui.closeModal(); resolve(false); } }],
      });
    });
    if (!ch) { say(c, 'Tá, tudo bem.'); c.state = 'leaving'; c.leaveAfter = 0.6; return; }
    say(c, 'Obrigado.');
    c.state = 'route'; c.nr = null;
    c.route = new THREE.Vector3(18, 0, 4.6);            // the men's room: the way there is the nav's (the bell door, the apron, the bathroom door)
    c.routeDone = () => { c.state = 'inside'; c.insideT = 0; chores?.setBathroomBusy(true); };
  }
  async function talkWatch(c) {
    if (c.talking) return; c.talking = true;
    if (c.scene) {
      const v = (c.scene.variantes || []).find((q) => condOk(q.condicao)) || c.scene;
      await ui.dialogue(c.name, v.falas.map((f) => (f.q === 'pensamento' ? `(${f.t})` : f.t)), c.seed);
    } else say(c, c.tipo?.falas?.pedido || '...');
    c.talked = true; c.talking = false;
  }
  function placeItems(c) {
    const { top, side } = counterGeo();
    const counterItems = c.prods.filter((p) => !p.atras);
    c.prods.forEach((p, i) => {
      if (p.atras) {
        const row = world.shelves.find((q) => q.id === 'atras-' + p.k);
        c.targets.push(interaction.register({
          id: `atras${c.id}-${i}`, reach: 2.6, priority: 2,
          aim: () => (row && !p.done && !p.taken ? { box: world.aimBox('atras-' + p.k, 0.12) } : null),
          enabled: () => !p.done && !p.taken && c.state === 'scanning',
          label: () => (inventory.carry ? { text: 'Suas mãos estão ocupadas' } : { text: `Pegar ${p.nome} (atrás do balcão)` }),
          tap: () => {
            if (inventory.carry) return bus.emit('hint', 'Suas mãos estão ocupadas.');
            p.taken = true; row.setStock(Math.max(0, row.stock - 1));
            inventory.setCarry({ kind: 'item', cust: c.id, index: i, atras: true, k: p.k }, 'atras', { tipo: p.k });
            bus.emit('sfx', 'produto_pos', {}); bus.emit('step', 'shop.item', c);
          },
        }));
        return;
      }
      const o = world.prop(p.copo ? 'copo' : 'produto', { tipo: p.tipo });
      const k = (counterItems.indexOf(p) - (counterItems.length - 1) / 2) * 0.3;
      o.position.copy(top).addScaledVector(side, k);
      render.scene.add(o); c.itemObjs.push(o);
      c.targets.push(interaction.register({
        id: `item${c.id}-${i}`, reach: 2.4, priority: 1,
        aim: () => (o.visible && !p.done ? { c: o.position.clone().setY(o.position.y + 0.12), r: 0.2 } : null),
        enabled: () => o.visible && !p.done,
        label: () => (inventory.carry ? { text: 'Suas mãos estão ocupadas' } : { text: `Pegar ${p.nome}` }),
        tap: () => {
          if (inventory.carry) return bus.emit('hint', 'Suas mãos estão ocupadas.');
          o.visible = false; inventory.setCarry({ kind: 'item', cust: c.id, index: i }, p.copo ? 'copo' : 'produto', { tipo: p.tipo });
          bus.emit('step', 'shop.item', c);
        },
      }));
    });
    c.state = 'scanning';
    ui.setTotal(money(0));
    say(c, c.tipo?.falas?.chegada || cfg.loja.cumprimentos);
    const back = c.prods.filter((p) => p.atras);
    if (back.length) setTimeout(() => {}, 0);
    if (back.length) c.askBack = { t: 2.6, p: back[0] };
    bus.emit('step', 'shop.placed', c);
  }
  inventory.dropHandlers.item = (cr) => {
    if (!cr.atras) return;
    const c = list.find((x) => x.id === cr.cust); const p = c?.prods[cr.index]; if (p) p.taken = false;
    const row = world.shelves.find((q) => q.id === 'atras-' + cr.k); if (row) row.setStock(row.stock + 1);
    inventory.clearCarry(); bus.emit('hint', 'Item de volta na prateleira.');
  };
  function registerScanner() {
    interaction.register({
      id: 'leitor', reach: 2.8, priority: 2,
      aim: () => ({ box: scannerAim() }),
      enabled: () => Boolean(inventory.carry && inventory.carry.kind === 'item'),
      label: () => ({ text: 'Passar no leitor' }),
      tap: () => {
        const cr = inventory.carry; const c = list.find((x) => x.id === cr.cust); if (!c) return;
        const p = c.prods[cr.index]; p.done = true; c.scanned++;
        if (cr.atras) { const row = world.shelves.find((q) => q.id === 'atras-' + cr.k); row?.setStock(row.slots); }
        inventory.clearCarry();
        bus.emit('sfx', 'leitor_bip', { pos: world.at('leitor', 1.0).toArray() });
        const sum = c.prods.filter((q) => q.done).reduce((a, q) => a + q.cents, 0);
        ui.setTotal(money(sum));
        if (c.scanned === c.prods.length) { c.state = 'ready'; bus.emit('step', 'shop.scanned', c); }
      },
    });
  }
  async function chargeWalker(c) {
    if (c.paying) return; c.paying = true;
    say(c, c.tipo?.falas?.chegada && c.cat === 'inconveniente' ? c.tipo.reacoes?.erro?.falas || pick('cobrar') : pick('cobrar'));
    const got = await collect(c, c.total);
    c.paying = false;
    if (!got) return;
    const { res, torn } = got;
    const given = res.sum;
    const correct = c.bill - c.total, diff = given - correct;
    let errors = 0;
    book(c, c.total, res, torn);
    if (diff !== 0) { progression.error('troco', c.id); errorLine(c, diff < 0 ? 'troco_curto' : 'troco_longo', diff < 0 ? 'troco-curto' : 'troco-longo'); errors++; if (diff < 0) progression.complaint('troco'); }
    if (!errors) { progression.ok('venda'); thanks(c, 0); bus.emit('sfx', 'caixa_gaveta', {}); tipFor(c, 0); }
    ui.setTotal(null);
    c.done = true;
    for (const o of c.itemObjs) o.visible = false;
    if (c.tipo?.id === 'bebado') { c.state = 'linger'; c.lingerT = 0; c.stand = counterGeo().stand.clone().add(new THREE.Vector3(-1.5, 0, 0)); }
    else { c.state = 'leaving'; c.leaveAfter = 1.2; }
    bus.emit('step', errors ? 'shop.paid-with-errors' : 'shop.paid', c);
    bus.emit('customer:done', c, errors);
  }

  // ------------------------------------------------------------------ a dark-windowed car that only looks
  function spawnDark(tipo) {
    const n = freePump(); if (!n) return null;
    const s = Math.floor(rng() * 1e6), V = tipo.veiculo;
    const car = world.car(s, { capSide: world.carSpot(n).capSide, style: V.estilo, color: V.cor, vidro: V.vidro });
    const person = (mulberry32(s)() < 0.6);   // the game never says whether there was anyone
    car.setDriver(false); car.setLights(true);
    render.scene.add(car.root);
    const c = { id: ++counter, kind: 'dark', seed: s, name: 'Carro de vidro escuro', pump: n, car, state: 'arriving', capPos: new THREE.Vector3(), targets: [], tipo, noTask: true, noService: true, age: 0, stay: tipo.pedido.permanencia, person, cat: 'suspeito', patience: 1e9 };
    if (!drive(c, n)) { render.scene.remove(car.root); return null; }
    list.push(c);
    c.targets.push(interaction.register({
      id: `vidro${c.id}`, reach: 3.4, priority: 0,
      aim: () => (c.state === 'parked' ? { c: car.root.position.clone().setY(1.1), r: 1.4 } : null),
      enabled: () => c.state === 'parked',
      label: () => ({ text: 'Bater no vidro' }),
      tap: () => {
        if (c.knocked) return;
        c.knocked = true;
        if (c.person) say(c, cfg.suspeitos.vidro); else bus.emit('hint', 'Ninguém responde.');
        c.stay = Math.min(c.stay, c.age + 8);
      },
    }));
    bus.emit('incident', 'cliente-suspeito', { id: c.id });
    bus.emit('customer:arrive', c);
    return c;
  }

  // ------------------------------------------------------------------ an empty car (for events)
  function spawnEmptyCar(pump, seed) {
    const n = pump || freePump(); if (!n) return null;
    reserved.add(n);
    const car = world.car(seed, { capSide: world.carSpot(n).capSide });
    car.setDriver(false); car.setLights(true);
    render.scene.add(car.root);
    const c = { id: ++counter, kind: 'empty', pump: n, car, state: 'arriving', capPos: new THREE.Vector3(), targets: [], seed };
    if (!drive(c, n)) { render.scene.remove(car.root); reserved.delete(n); return null; }
    list.push(c);
    return c;
  }
  function releaseEmptyCar(c) { c.state = 'leaving'; c.leaveAfter = 0; reserved.delete(c.pump); }

  // ------------------------------------------------------------------ who comes next
  function condOk(cd = {}) {
    if (cd.sanidadeMax !== undefined && sanityValue() > cd.sanidadeMax) return false;
    if (cd.sanidadeMin !== undefined && sanityValue() < cd.sanidadeMin) return false;
    if (cd.evento && !progression.hasSeen(cd.evento)) return false;
    if (cd.semEvento && (progression.hasSeen(cd.semEvento) || (cd.semEvento === 'telefone' && time.minutes >= 350))) return false;
    if (cd.flag && !progression.hasFlag(cd.flag)) return false;
    if (cd.cafeSeguidas && (progression.st.cafe?.streak || 0) < cd.cafeSeguidas) return false;
    return true;
  }
  const calendar = (day) => ({ semana: Math.floor((day - 1) / 6) + 1, dia: ((day - 1) % 6) + 1 });
  function beginNight(seed, day) {
    nightRecurring.length = 0; followQ.length = 0; recQueue = [];
    const { semana, dia } = calendar(day);
    for (const rec of cast.recorrentes || []) {
      if ((rec.ausencias || []).some((a) => a.semana === semana && a.dias.includes(dia))) continue;
      const entry = (rec.noites || []).find((n) => n.semana === semana && n.dia === dia); if (!entry) continue;
      const scene = scenes.find((q) => q.id === entry.cena); if (!scene) continue;
      const ev = scene.gatilho.condicao?.evento;
      if (ev && (data.events || []).some((e) => e.id === ev && e.roteiro) && !progression.hasSeen(ev)) continue;   // that event brings them
      if (!condOk(scene.gatilho.condicao)) continue;
      const at = time.parse(scene.gatilho.janela[0]), until = time.parse(scene.gatilho.janela[1]) + 80;
      recQueue.push({ rec, scene, entry, at, until, seed: seed + rec.id.length * 31 });
    }
    recQueue.sort((a, b) => a.at - b.at);
  }
  // the night is quiet: nearly always one vehicle at a time, rarely two, a queue almost never
  let canCar = true;
  const carsOn = () => list.filter((c) => c.car && c.kind !== 'empty' && c.state !== 'leaving').length;
  function pickTipo() {
    const m = time.minutes, week = progression.st.week;
    const hot = list.some((c) => (c.cat === 'inconveniente' || c.cat === 'suspeito') && !c.done && c.state !== 'leaving');
    const pool = (cast.tipos || []).filter((t) => {
      if (!(t.peso > 0) || (t.semanaMin || 1) > week) return false;
      if (t.horas && (m < time.parse(t.horas[0]) || m > time.parse(t.horas[1]))) return false;
      if (t.categoria !== 'comum' && hot) return false;
      const modo = t.pedido.modo;
      if ((modo === 'bomba' || modo === 'bomba+loja' || (modo === 'observa' && t.veiculo.tipo !== 'a-pe')) && (!canCar || !freePump())) return false;
      if (t.veiculo.tipo === 'caminhao' && ![1, 3].some((i) => !list.some((c) => c.pump === i) && !reserved.has(i))) return false;
      if ((modo === 'loja' || modo === 'banheiro') && walkerBusy()) return false;
      if (modo === 'loja' && t.veiculo.tipo !== 'a-pe' && (!canCar || !traffic.lotAvailable())) return false;
      return true;
    });
    if (!pool.length) return null;
    const w = pool.map((t) => t.peso * (t.categoria === 'comum' ? 1 : 0.55));
    let x = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function arrive() {
    const busy = carsOn();
    canCar = busy === 0 || (busy === 1 && rng() < 0.18);
    const t = pickTipo();
    if (!t) {
      if (canCar && rng() < 0.66 && freePump()) spawnCar(); else if (!walkerBusy() && canCar) spawnWalker();
      return;
    }
    const modo = t.pedido.modo, seed = Math.floor(rng() * 1e6);
    if (modo === 'bomba' || modo === 'bomba+loja') spawnCar({ tipo: t, seed });
    else if (modo === 'loja') spawnWalker({ tipo: t, seed });
    else if (modo === 'banheiro') spawnWalker({ tipo: t, seed, role: 'banheiro' });
    else if (modo === 'observa' && t.veiculo.tipo !== 'a-pe') spawnDark(t);
  }
  function arriveRecurring(q) {
    const { rec, scene, entry } = q;
    if (rec.veiculo.tipo === 'a-pe') { if (walkerBusy()) return false; spawnWalker({ rec, scene, entry, seed: q.seed, role: 'observa' }); return true; }
    const n = freePump(rec.bomba); if (!n) return false;
    spawnCar({ pump: n, rec, scene, entry, seed: q.seed });
    return true;
  }

  // ------------------------------------------------------------------ update
  function remove(c) {
    for (const id of c.targets) interaction.unregister(id);
    if (c.veh && c.veh.state !== 'gone') traffic.remove(c.veh);
    if (c.car) { render.scene.remove(c.car.root); if (c.pump) { world.pumpDisplay(c.pump, 0); } }
    if (c.human) render.scene.remove(c.human.root);
    if (c.comp) render.scene.remove(c.comp.root);
    if (c.agent) nav.remove(c.agent);
    if (c.owner) c.owner.hold = false;           // the car at the pump is free to go
    for (const o of c.itemObjs || []) render.scene.remove(o);
    if (c.state === 'inside' || c.insideT !== undefined) chores?.setBathroomBusy(false);
    const i = list.indexOf(c); if (i >= 0) list.splice(i, 1);
    bus.emit('customer:gone', c);
  }
  function animate(c, t, moving) {
    const h = c.human;
    if (h.update) {
      const pose = c.state === 'entering' ? (c.tipo?.poses?.chegada || 'parado') : c.state === 'leaving' ? (c.tipo?.poses?.saindo || c.rec?.poses?.saindo || 'parado') : c.paying ? (c.tipo?.poses?.pagando || 'pagando') : (c.state === 'watch' ? (c.rec?.poses?.esperando || 'fixo') : (c.tipo?.poses?.esperando || 'parado'));
      h.update(t, { pose, andando: moving ? 1 : 0, fase: c.walkPhase, falando: false });
    } else poseWalk(h.joints, c.walkPhase, moving ? 1 : 0);
  }
  /** Moves a walker toward a point. Returns the distance left. */
  function step(c, to, speed, dt) {
    const h = c.human.root;
    const dv = new THREE.Vector3().subVectors(to, h.position); dv.y = 0; const dist = dv.length();
    if (dist > 0.06) { dv.normalize(); h.position.addScaledVector(dv, Math.min(dist, speed * dt)); h.rotation.y = Math.atan2(dv.x, dv.z); c.walkPhase += dt * 8; }
    return dist;
  }
  function update(dt, t) {
    simNow = t;
    nav.tick(dt, t);
    // recurring people, on their hour
    if (enabled && progression.st.tutorialDone) {
      while (recQueue.length && time.minutes >= recQueue[0].until) recQueue.shift();
      const q = recQueue[0];
      if (q && time.minutes >= q.at && arriveRecurring(q)) recQueue.shift();
    }
    for (let i = followQ.length - 1; i >= 0; i--) {
      followQ[i].t -= dt;
      if (followQ[i].t <= 0 && !walkerBusy()) {
        const f = followQ.splice(i, 1)[0];
        if (f.owner && !list.includes(f.owner)) continue;
        if (!spawnWalker({ tipo: f.tipo, seed: f.seed, name: f.name, owner: f.owner }) && f.owner) f.owner.hold = false;
      }
    }
    if (enabled) {
      timer -= dt;
      if (timer <= 0 && list.filter((c) => !c.done && c.kind !== 'empty' && !c.noService).length < 3) {
        timer = rng.range(...cfg.chegada.intervalo);
        arrive();
      }
    }
    for (const c of [...list]) {
      c.age += dt;
      if (c.kind === 'car' || c.kind === 'empty' || c.kind === 'dark') {
        c.car.update?.(t);
        if (c.state === 'arriving') c.age = 0;
        if (c.kind === 'car') {
          if (c.fueling) autoPump(c, dt);
          if (c.state === 'leaving') {
            c.leaveAfter -= dt;
            if (c.hold) { c.holdT += dt; if (c.holdT > 240) c.hold = false; }       // never keep the pump for ever
            if (c.leaveAfter <= 0 && !c.hold) departCar(c);
          }
          else if (c.state !== 'arriving' && c.age > c.patience && !c.paying && !c.fueling && !c.talking && !c.panel) abandon(c);
        } else if (c.kind === 'dark') {
          if (c.state === 'parked' && c.age > c.stay) { c.state = 'leaving'; departCar(c); }
        } else if (c.state === 'leaving') departCar(c);
      } else if (c.kind === 'walk') {
        const h = c.human.root;
        let moving = false;
        c.car?.update?.(t);
        if (c.inCar) {
          // in the car: it is still coming in, the customer is about to get out, or has got back in and the car is about to go
          if (c.state === 'driving') {
            if (!c.engine && c.veh.s > 50) { c.engine = true; bus.emit('sfx', 'carro_vai', { pos: [c.spot.x, 0, c.spot.z] }); }
            if (c.veh.state === 'parked') { c.state = 'exiting'; c.exitT = 0.9; }
          } else if (c.state === 'exiting') { c.exitT -= dt; if (c.exitT <= 0) stepOut(c); }
          else if (c.state === 'leaving' && c.veh.state === 'parked' && !c.departed) { c.leaveAfter -= dt; if (c.leaveAfter <= 0) departCar(c); }
          continue;
        }
        if (c.state === 'entering') {
          const leg = c.legs[c.legI];
          if (!c.nr && !c.atLeg) routeTo(c, leg.kind === 'stand' ? standPoint(c) : leg.p);
          if (!c.atLeg) {
            const r = walkRoute(c, WALK, dt); moving = r.moved;
            if (r.done) { c.atLeg = true; c.legT = 0; }
          }
          if (c.atLeg) {
            c.legT += dt; moving = false;
            if (leg.face) h.rotation.y = Math.atan2(leg.face.x - h.position.x, leg.face.z - h.position.z);
            if (c.legT >= (leg.hold || 0)) {
              c.atLeg = false; c.nr = null; c.legI++;
              if (leg.kind === 'bell') { c.passed = true; world.state.sino = t; bus.emit('sfx', 'sino', { pos: c.inside.toArray() }); }
              else if (leg.kind === 'shop') {
                for (const tk of leg.take) if (tk.row) { tk.row.setStock(Math.max(0, tk.row.stock - 1)); bus.emit('shelf:taken', tk.row); }      // what they take is gone from the shelf; a shelf that runs low asks for a restock (tasks.js)
                if (leg.take.length) bus.emit('sfx', 'produto_pos', { pos: [leg.p.x, 1.1, leg.p.z], gain: 0.5 });
              } else if (leg.kind === 'stand') {
                if (queuePlace(c) > 0 && c.role !== 'observa') { c.state = 'queue'; c.legI--; }
                else {
                  c.age = 0; c.t0 = 0; moving = false;
                  if (c.role === 'observa') { c.state = 'watch'; c.watchT = 0; h.rotation.y = Math.PI; }
                  else { h.rotation.y = Math.atan2(world.anchor('balcao').dir.x, world.anchor('balcao').dir.z); c.state = c.role === 'banheiro' ? 'asking' : 'placing'; if (c.role === 'banheiro') say(c, c.tipo.falas.chegada); }
                }
              }
            }
          }
        } else if (c.state === 'queue') {
          // waiting behind someone at the counter: step up when it is free
          if (!c.nr) routeTo(c, standPoint(c));
          const r = walkRoute(c, WALK, dt); moving = r.moved;
          if (r.done && queuePlace(c) === 0) { c.state = 'entering'; c.nr = null; c.atLeg = false; c.legI = c.legs.length - 1; }
          else if (r.done) c.nr = null;
        } else if (c.state === 'placing') {
          if (c.age - c.t0 > 1.2) placeItems(c);
        } else if (c.state === 'watch') {
          c.watchT += dt;
          const near = Math.hypot(player.st.x - h.position.x, player.st.z - h.position.z) < 6;
          if (!near) c.leftAlone = true;
          h.rotation.y = Math.atan2(player.st.x - h.position.x, player.st.z - h.position.z);
          if (c.watchT > (c.rec?.pedido?.permanencia ?? c.tipo?.pedido?.permanencia ?? 120)) endWatch(c);
        } else if (c.state === 'route') {
          // to the bathroom
          if (!c.nr) routeTo(c, c.route);
          const r = walkRoute(c, 1.6, dt); moving = r.moved;
          if (r.done) { moving = false; c.nr = null; c.routeDone(); }
        } else if (c.state === 'inside') {
          c.insideT += dt; h.rotation.y = Math.PI / 2;
          if (c.insideT > Math.min(c.tipo.pedido.permanencia, 110)) { c.state = 'leaving'; c.leaveAfter = 0; c.lv = { stage: 1 }; c.nr = null; chores?.setBathroomBusy(false); c.insideT = undefined; }
        } else if (c.state === 'linger') {
          if (!c.nr) routeTo(c, c.stand);
          const r = walkRoute(c, 1.0, dt); moving = r.moved; c.lingerT += dt;
          if (r.done) { c.nr = null; h.rotation.y = Math.atan2(world.anchor('balcao').dir.x, world.anchor('balcao').dir.z); }
          if (c.lingerT > (c.tipo?.pedido?.permanencia ?? 90)) { c.state = 'leaving'; c.leaveAfter = 0; c.nr = null; c.lv = null; }
        } else if (c.state === 'leaving') {
          c.leaveAfter -= dt;
          if (c.leaveAfter <= 0) {
            if (!c.lv) startLeave(c);
            else if (!c.nr) routeTo(c, exitPoint(c));
            const r = walkRoute(c, 1.7, dt); moving = r.moved;
            if (r.done && leaveStep(c, t)) continue;
          }
        }
        animate(c, t, moving);
        if (c.comp) {
          const q = c.comp.root, yaw = h.rotation.y, side = c.state === 'scanning' || c.state === 'ready' ? 1.3 : 0.8;
          q.position.set(h.position.x + Math.cos(yaw) * side - Math.sin(yaw) * -0.35, 0, h.position.z - Math.sin(yaw) * side - Math.cos(yaw) * -0.35);
          q.rotation.y = yaw; c.comp.update?.(t, { pose: 'parado', andando: moving ? 1 : 0, fase: c.walkPhase + 0.7 });
        }
        if (c.askBack && c.state === 'scanning') { c.askBack.t -= dt; if (c.askBack.t <= 0) { say(c, fill(pickOf(cfg.atras.pedidos), { item: c.askBack.p.nome.toLowerCase() })); c.askBack = null; } }
        if (['scanning', 'ready', 'placing'].includes(c.state) && !c.tutorial && c.age > c.patience && !c.paying) giveUp(c);
        if (c.state === 'asking' && c.age > c.patience) { c.state = 'leaving'; c.leaveAfter = 0.4; }
      }
    }
  }
  function endWatch(c) {
    if (c.rec && !c.leftAlone) {
      const g = reactions(c, 'gentileza');
      if (g) say(c, g);
    }
    c.state = 'leaving'; c.leaveAfter = 0.5; c.done = true; c.noService = true;
    bus.emit('recurring:end', c.rec?.id, { gotCafe: Boolean(c.cafe) });
  }
  /** The player left a night's worth of time behind (passed out): whoever was waiting has gone, angry. */
  function fastForward() {
    for (const c of [...list]) {
      if (c.done || c.state === 'leaving') continue;
      if (c.kind === 'car') abandon(c); else if (c.kind === 'walk' && c.role === 'normal') giveUp(c);
      else if (c.kind === 'dark' || c.kind === 'walk') { c.state = 'leaving'; c.leaveAfter = 0; if (c.kind === 'dark') departCar(c); }
    }
  }
  /** Brings one recurring person at once (an event that owns the scene). */
  function spawnRecurring(recId, sceneId) {
    const rec = (cast.recorrentes || []).find((r) => r.id === recId), scene = scenes.find((q) => q.id === sceneId);
    const entry = rec && (rec.noites || []).find((n) => n.cena === sceneId);
    if (!rec || !scene || !entry) return false;
    return arriveRecurring({ rec, scene, entry, seed: progression.st.seed + rec.id.length * 31 });
  }
  function giveUp(c) {
    const r = reactions(c, 'demora');
    say(c, r || pick('demora')); progression.complaint('demora'); progression.error('demora', c.id);
    c.state = 'leaving'; c.leaveAfter = 0.4; ui.setTotal(null); for (const o of c.itemObjs) o.visible = false;
    if (inventory.carry?.cust === c.id) { const cr = inventory.carry; inventory.dropHandlers.item(cr); if (inventory.carry) inventory.clearCarry(); }
    c.done = true;
    bus.emit('customer:gone-angry', c);
  }
  function abandon(c) {
    const r = reactions(c, 'demora');
    say(c, r || pick('demora')); progression.complaint('demora'); progression.error('demora', c.id);
    if (c.nozzleIn) forgetNozzle(c);
    c.state = 'leaving'; c.leaveAfter = 0.5; c.done = true;
    bus.emit('customer:gone-angry', c);
  }

  registerPumps(); registerPanels(); registerScanner();
  // the walking graph and the parking routes are built behind the title screen, not at the first customer
  setTimeout(() => { nav.build(); traffic.lotAvailable(); }, 0);
  return {
    list, update, fastForward, spawnRecurring, spawnCar, spawnWalker, spawnEmptyCar, releaseEmptyCar, spawnDark, freePump, beginNight,
    attach(ch) { chores = ch; },
    reserve: (n) => reserved.add(n), unreserve: (n) => reserved.delete(n),
    enable(on, seed) { if (on) nav.build(); enabled = on; if (seed !== undefined) rng = mulberry32(seed); timer = cfg.chegada.primeiro; },
    clear() { for (const c of [...list]) remove(c); ui.setTotal(null); followQ.length = 0; recQueue = []; taken.clear(); chores?.setBathroomBusy(false); for (const [i, it] of world.interactables.entries()) { void i; if (it.kind === 'bico' && it.object3D) it.object3D.visible = true; } },
    watcher: () => list.find((c) => c.rec?.id === 'homem0333' && c.state === 'watch' && !c.done) || null,
    activeCount: () => list.filter((c) => !c.done).length,
    nozzleName, nightRecurring, simNow: () => simNow,
  };
}
