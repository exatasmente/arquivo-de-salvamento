// The shop's coffee. Taking a cup at the coffee machine costs the player's own money. With the cup in the hands:
//  - tap on nothing drinks it: +5 sanity, once per game hour (a second cup in the same hour only warms);
//  - the counter takes it: put on the counter while the man of 03:33 is in the shop, it is the coffee for him.
//    That counts the streak (`cafeSeguidas`) and the kindness `cafe`; his first two lines (cafe.um, cafe.dois) play.
//    The third one is the secret S4: the man says the date and where the car is. Those two words are sealed in vault.js (AES-GCM) and
//    filled into the markers {s4.data} and {s4.carro} of data/recurring.pt-BR.json only when the third cup is put on the counter.
import { fill } from '../util.js';
import { openCoffee } from './vault.js';

export function createCoffee(bus, { world, render, interaction, inventory, progression, sanity, time, ui, customers, data }) {
  const THREE = render.THREE;
  const price = data.items.extras.cafe.preco;
  const lines = data.recurring?.personagens?.homem0333?.cafe || {};
  let lastHour = -1, cupObj = null, cupT = 0;

  bus.on('recurring:end', (id, info) => {
    if (id !== 'homem0333') return;
    if (!info.gotCafe) progression.st.cafe = { streak: 0, last: progression.st.day };   // he came and had none: the string breaks
  });

  function setCup() { inventory.setCarry({ kind: 'copo' }, 'copo'); }
  interaction.register({
    id: 'cafeteira-copo', reach: 2.4, priority: 2,
    aim: () => ({ box: world.aimBox('cafeteira', 0.12) }),
    enabled: () => !inventory.carry || inventory.carry.kind === 'copo',
    label: () => (inventory.carry ? { text: 'Já há um copo nas suas mãos' } : { text: `Pegar um café (R$ ${price.toFixed(2).replace('.', ',')}, do seu bolso)` }),
    tap: () => {
      if (inventory.carry) return;
      if (progression.st.wallet < price) return bus.emit('hint', 'Sem dinheiro para o café.');
      progression.pay(-price);
      bus.emit('sfx', 'cafeteira', { pos: world.at('cafeteira', 1).toArray() });
      setCup();
      bus.emit('hint', 'O copo está quente. Toque no vazio para beber, ou ponha no balcão.');
    },
  });
  inventory.dropHandlers.copo = () => {
    inventory.clearCarry();
    const h = Math.floor(time.minutes / 60);
    if (h === lastHour) { bus.emit('hint', 'Já tomou um café nesta hora. Este só esquenta.'); return; }
    lastHour = h;
    sanity.add(5, 'cafe');
    bus.emit('sfx', 'engolir', {});
    bus.emit('hint', 'O café esquenta o peito.');
  };
  // the counter
  const spot = () => { const b = world.anchor('balcao'); return b.pos.clone().addScaledVector(b.dir, 1.25).setY(1.0).add(new THREE.Vector3(-0.7, 0, 0)); };
  interaction.register({
    id: 'balcao-copo', reach: 2.8, priority: 1.5,
    aim: () => ({ box: world.aimBox('balcao', 0.05) }),
    enabled: () => inventory.carry?.kind === 'copo' && !cupObj,
    label: () => ({ text: customers.watcher() ? 'Pôr o café no balcão, para ele' : 'Pôr o café no balcão' }),
    tap: () => {
      inventory.clearCarry();
      cupObj = world.prop('copo', {}); cupObj.position.copy(spot()); render.scene.add(cupObj); cupT = 40;
      bus.emit('sfx', 'produto_pos', {});
      const w = customers.watcher();
      if (w && !w.cafe) give(w);
    },
  });
  async function give(c) {
    c.cafe = true;
    const st = progression.st.cafe || { streak: 0, last: 0 };
    progression.st.cafe = { streak: st.streak + 1, last: progression.st.day };
    progression.flag('gentileza:cafe');
    bus.emit('kindness', 'cafe', c);
    const n = progression.st.cafe.streak;
    const key = n === 1 ? 'um' : n === 2 ? 'dois' : n === 3 ? 'tres' : null;
    let s4 = null;
    if (key === 'tres') s4 = await openCoffee();                // secret S4: unsealed now, never kept in the clear
    if (key && lines[key] && (key !== 'tres' || s4)) {
      const put = (t) => (s4 ? t.replace('{s4.data}', s4.data).replace('{s4.carro}', s4.carro) : t);
      await ui.dialogue(c.name, lines[key].map((f) => (f.q === 'pensamento' ? `(${fill(f.t, {})})` : put(f.t))), c.seed + 40 + n);
      if (key === 'tres') { bus.emit('secret:found', 's4'); progression.flag('s4:cafe'); }
    } else bus.emit('hint', 'Ele segura o copo. Não bebe.');
  }
  // the flashlight battery: bought at the shelf behind the counter, from the player's own money
  const pilha = data.items.atras?.pilha;
  interaction.register({
    id: 'comprar-pilha', reach: 2.6, priority: 1.5,
    aim: () => ({ box: world.aimBox('atras-pilha', 0.12) }),
    enabled: () => Boolean(pilha) && !inventory.carry,
    label: () => ({ text: `Comprar uma pilha (R$ ${pilha.preco.toFixed(2).replace('.', ',')}, do seu bolso)` }),
    tap: () => {
      if (progression.st.wallet < pilha.preco) return bus.emit('hint', 'Sem dinheiro para a pilha.');
      const i = inventory.slots.indexOf(null);
      if (i < 0) return bus.emit('hint', 'Os bolsos estão cheios.');
      progression.pay(-pilha.preco); inventory.slots[i] = 'pilha'; bus.emit('inventory:change'); bus.emit('sfx', 'caixa_bip', {});
      bus.emit('hint', 'Pilha no bolso.');
    },
  });
  return {
    update(dt) { if (cupObj) { cupT -= dt; if (cupT <= 0) { render.scene.remove(cupObj); cupObj = null; } } },
    reset() { lastHour = -1; if (cupObj) { render.scene.remove(cupObj); cupObj = null; } },
  };
}
