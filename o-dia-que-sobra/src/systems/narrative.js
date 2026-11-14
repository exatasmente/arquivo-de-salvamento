// NarrativeSystem: what the night tells. The first night's tutorial, driven by the manager's phone
// calls, and the one-line objective on the top of the screen that follows the player's progress (the
// tutorial teaches through the screen, never through a long text). Every night the manager also calls
// at 05:50 and comments on how the night went, from the performance and the occurrences registered.
import { money, fill } from '../util.js';

export function createNarrative(bus, { world, interaction, customers, tasks, progression, time, ui, dialogue, data, cash, office }) {
  const cust = data.customers, DG = data.dialogue;
  let phase = 'off';           // off | ring1 | caixa1 | fuel | ring2 | shop | free
  let ringing = false, ringAt = 0, phoneId = null, shopDone = false, stockDone = false, fuelDone = false;
  let ringKind = null, called = false, answered550 = false, tutNight = false;
  let t0 = 0;                  // real seconds since the night opened
  const phoneMin = time.parse(data.progression.expediente.telefone);

  const obj = (text) => ui.setObjective(text);
  /** The night of `gerente-mudo` (the record's `fixoNoite`): the 05:50 call is the silent one. */
  const muteNight = () => (data.events || []).some((e) => e.id === 'gerente-mudo' && e.fixoNoite === progression.st.day);
  function phonePos() { return world.at('telefone', 0.9); }

  function registerPhone() {
    if (phoneId) return;
    phoneId = interaction.register({
      id: 'telefone', reach: 2.6,
      priority: 2,
      aim: () => ({ box: world.aimBox('telefone', 0.3) }),
      enabled: () => ringing,
      label: () => ({ text: 'Atender o telefone' }),
      tap: () => answer(),
    });
  }
  // a ring that is not the manager's (the phantom call, the voice that is your own): who takes it is decided by `extra.onAnswer`
  let extra = null;
  function ring(on) {
    ringing = on;
    bus.emit('loop', 'telefone', 'telefone_toca', { on, pos: phonePos().toArray() });
  }

  /** The manager's comment at 05:50, from what the night looks like so far. */
  function managerLines() {
    const d = DG.telefone550, n = progression.night, pts = n.pontos;
    const tier = pts >= d.faixas.otimo ? 'otimo' : pts >= d.faixas.bom ? 'bom' : pts >= d.faixas.regular ? 'regular' : 'ruim';
    const lines = [...d.abre, d.desempenho[tier][0]];
    if (n.erros >= 4) lines.push(d.erros);
    if (n.reclamacoes > 0) lines.push(d.reclamacoes);
    const pend = tasks.pending().filter((t) => !['fechar-caixa', 'telefone'].includes(t.id) && t.kind !== 'carro' && t.kind !== 'cliente');
    if (pend.length) lines.push(fill(d.pendentes, { lista: pend.slice(0, 3).map((t) => t.text.replace(/\s*[\[(].*$/, '').replace(/:.*$/, '')).join('; ') }));
    const occ = office.registered;
    if (!occ.length) lines.push(d.ocorrencias.nenhuma);
    else {
      lines.push(fill(d.ocorrencias.algumas, { n: occ.length }));
      const v = occ.find((o) => o.valida && d.ocorrencias[o.tipo]);
      if (v) lines.push(d.ocorrencias[v.tipo]);
      if (occ.some((o) => !o.valida)) lines.push(d.ocorrencias.semMotivo);
    }
    // what last night left for this morning: a customer who really came, the hour nobody was in the station, a call nobody took
    for (const tipo of progression.relatos()) {
      if (d.relatos[tipo]) lines.push(d.relatos[tipo]);
      if (tipo === 'cliente-balcao') progression.complaint('cliente-balcao');
    }
    progression.consumirRelatos();
    // the week: its own line, and where the score stands against the goal (the manager reads it at 05:50)
    const cal = progression.calendar(), r = progression.weekRules(), got = progression.st.weekPts + pts;
    const wl = d.semana?.[cal.week]; if (wl) lines.push(wl[(cal.noite - 1) % wl.length]);
    if (d.meta) {
      if (cal.noite === 6) lines.push(cal.last ? d.meta.dobrado : d.meta.ultimaNoite);
      else if (got >= r.meta) lines.push(fill(d.meta.bateu, { pts: got, meta: r.meta }));
      else if (got >= r.meta * cal.noite / 6) lines.push(fill(d.meta.ritmo, { pts: got, meta: r.meta }));
      else lines.push(fill(d.meta.atrasado, { pts: got, meta: r.meta, falta: Math.max(0, r.meta - got) }));
    }
    lines.push(...d.fecha);
    return lines;
  }

  async function answer() {
    const kind = ringKind;
    if (kind === 'extra' && extra) { const e = extra; extra = null; ring(false); bus.emit('sfx', 'telefone_atende', { pos: phonePos().toArray() }); await e.onAnswer(); bus.emit('sfx', 'telefone_desliga', { pos: phonePos().toArray() }); return; }
    ring(false); bus.emit('sfx', 'telefone_atende', { pos: phonePos().toArray() });
    const was = phase;
    if (kind === 'ring1') {
      phase = 'call'; obj(null);
      await dialogue(DG.gerente, DG.ligacao1, 77);
      bus.emit('sfx', 'telefone_desliga', { pos: phonePos().toArray() });
      tasks.setTillEnabled(true); tasks.addFixed(['abrir-caixa']);
      phase = 'caixa1';
      obj('Abra o caixa: a registradora do balcão. Segure o botão de usar.');
    } else if (kind === 'ring2') {
      phase = 'call'; obj(null);
      await dialogue(DG.gerente, DG.ligacao2, 78);
      bus.emit('sfx', 'telefone_desliga', { pos: phonePos().toArray() });
      const t = cust.tutorial.loja;
      customers.spawnWalker({ seed: t.seed, tutorial: true, produtos: t.itens, pagamento: t.pagamento });
      phase = 'shop'; stockDone = true;       // (the shelf was part of the preparation: only the customer is left of the lesson)
      obj('Tem um cliente na loja. Vá ao balcão.');
    } else if (kind === 'gerente') {
      answered550 = true; tasks.done('telefone'); obj(null);
      if (muteNight()) {   // `gerente-mudo` (week 4): nobody speaks on the other side, only the hum of the tube
        progression.seen('gerente-mudo'); bus.emit('event:seen', 'gerente-mudo'); bus.emit('sanity:add', -6, 'gerente-mudo');
        await dialogue('Telefone', DG.telefoneMudo, 81);
      } else await dialogue(DG.gerente, managerLines(), 80);
      bus.emit('sfx', 'telefone_desliga', { pos: phonePos().toArray() });
      obj(cash.closed ? null : 'Às seis horas, feche o caixa na registradora.');
    }
    void was;
  }

  function finish() {
    phase = 'free'; progression.st.tutorialDone = true;
    obj(null); tasks.addFixed(['banheiro', 'fechar-caixa']); bus.emit('tutorial:done');
  }
  function checkFinish() { if (shopDone && stockDone && phase === 'shop') finish(); }

  bus.on('step', (k, c) => {
    if (phase === 'caixa1' && k === 'till.open') {
      const t = cust.tutorial.carro;
      customers.spawnCar({ pump: t.bomba, seed: t.seed, tutorial: true, valor: t.valor, combustivel: t.combustivel });
      phase = 'fuel';
      obj(`Um carro chegou na bomba ${t.bomba}. Vá até ele.`);
      return;
    }
    if (phase === 'free' && k === 'till.open') { obj(null); return; }
    if (phase === 'fuel') {
      const need = cust.tutorial.carro;
      if (k === 'fuel.arrived') obj(`Chegou. Fale com o cliente do carro (bomba ${need.bomba}).`);
      else if (k === 'fuel.ordered') obj('Olhe o adesivo na tampa do tanque. Pegue na bomba o bico dessa cor.');
      else if (k === 'fuel.nozzle') obj('Ponha o bico na tampa do tanque.');
      else if (k === 'fuel.inserted') obj(`Mire no teclado da bomba, digite ${money(need.valor * 100)} e aperte LIGAR.`);
      else if (k === 'fuel.start') obj('A bomba abastece sozinha e desliga no valor. Espere o bip.');
      else if (k === 'fuel.stop') {
        if (c.typed !== c.value) obj(`O pedido era ${money(c.value)}: valor errado. Dá para cobrar mesmo assim.`);
        else obj('Certo. Toque na tampa para tirar o bico e devolva-o à bomba.');
      } else if (k === 'fuel.pulled') obj('Devolva o bico à bomba (toque no bico).');
      else if (k === 'fuel.returned') obj('Agora cobre o cliente: fale com ele e monte o troco.');
      else if (k === 'fuel.paid' || k === 'fuel.paid-with-errors') {
        fuelDone = true; obj(null);
        phase = 'ring2'; ringAt = t0 + 4;
      }
    } else if (phase === 'shop') {
      if (k === 'shop.placed') obj('Pegue cada item do balcão e passe no leitor.');
      else if (k === 'shop.scanned') obj('Cobre o cliente e monte o troco.');
      else if (k === 'shop.paid' || k === 'shop.paid-with-errors') { shopDone = true; obj(stockDone ? null : 'Agora a prateleira: abra a prancheta (Q) e busque a caixa no estoque.'); checkFinish(); }
      else if (k === 'stock.box') obj('Leve a caixa à prateleira. Segure o botão de usar para repor.');
      else if (k === 'stock.done') { stockDone = true; obj(shopDone ? null : 'Prateleira reposta. Falta o cliente da loja.'); checkFinish(); }
    }
  });
  // the 06:00 stop: a call nobody answered is a task not done
  bus.on('time:cap', () => {
    if (ringing && ringKind === 'gerente') { ring(false); }
    if (called && !answered550) tasks.fail('telefone');
  });

  return {
    get phase() { return phase; },
    /** Opens the night. tutorial: the first night; otherwise the night goes on by itself. */
    begin({ tutorial }) {
      extra = null; t0 = 0; shopDone = stockDone = fuelDone = false; ringing = false; called = false; answered550 = false; ringKind = null;
      registerPhone();
      // every night opens at 23:00 with the preparation: the till stays shut until 00:00 (and in the tutorial until the manager says so)
      tutNight = tutorial; tasks.setTillEnabled(false); phase = 'prep';
      if (!tutorial) progression.st.tutorialDone = true;
      obj(tutorial ? 'Bata o ponto: o relógio de ponto está na parede do escritório.' : 'Prepare o posto antes da meia-noite. Comece batendo o ponto, no escritório.');
    },
    /** The preparation is over (00:00): the night goes on by itself, or the tutorial goes on with the manager's call. */
    endPrep() {
      if (phase !== 'prep') return;
      if (tutNight) { phase = 'ring1'; ringKind = 'ring1'; ringAt = t0 + 6; obj('Fique por perto. O telefone vai tocar.'); }
      else { phase = 'free'; obj('Meia-noite. Abra o caixa: a registradora do balcão. Segure o botão de usar.'); }
    },
    /** The line on top of the screen (the preparation's own guidance in the tutorial). */
    setObjective(t) { if (phase === 'prep') obj(t); },
    /** Rings the office phone on behalf of an event. Returns false if the phone is busy (the manager, the tutorial). */
    ringExtra(secs, onAnswer, onMissed) {
      if (phase !== 'free' || ringing || extra || time.minutes >= phoneMin - 3) return false;
      extra = { until: t0 + secs, onAnswer, onMissed }; ringKind = 'extra'; ring(true); return true;
    },
    get extraRinging() { return Boolean(extra); },
    update(dt) {
      t0 += dt;
      if (extra && t0 >= extra.until) { const e = extra; extra = null; ring(false); e.onMissed?.(); }
      if ((phase === 'ring1' || phase === 'ring2') && !ringing && t0 >= ringAt) {
        ringKind = phase; ring(true); obj('O telefone está tocando, no escritório.');
      }
      if (phase === 'ring2') ringKind = 'ring2';
      if (phase === 'free' && !called && !ringing && time.minutes >= phoneMin) {
        called = true; ringKind = 'gerente'; ring(true);
        tasks.add('telefone', data.tasks.textos.telefone, 'fixa');
        obj('O telefone está tocando, no escritório.');
      }
    },
    endNight() { extra = null; ring(false); phase = 'off'; obj(null); },
    get ringing() { return ringing; },
    get answered550() { return answered550; },
  };
}
