// ClosingSystem: the hour after 05:00, every night, the mirror of the preparation (prep.js). At 05:00 nobody new arrives; to close the till the attendant has to
// serve everybody who is already at the station, shut the shop door, put out the yard light and the Sun's sign on the board in the back, and only then close the
// till, which ends the shift. The clock runs from 05:00 to 06:00 in 3 real minutes (a game minute is 3 s, half the rate of the shift), the HUD counts it down
// ("FECHAMENTO 2:31"), and the steps are tasks on the clipboard and goals with the marker and the arrow. What is left at 06:00 counts as a task not done
// (-6 each, when the till is closed, like every other task) and the till closes anyway.
//
// The manager's call at 05:50 goes on as it was: the till waits for it (answered, or the clock reaching six). The last night keeps the 05:59 call from the
// car park: there the till opens to closing only after the doubled shift (the clock reaching six for the second time), and the sign's breaker, which is part of
// the closing, is also the secret ending's move (events/turno-dobrado.js reads the breaker, the closing only asks for it).
//
// Nothing here reads a real clock: the countdown of the HUD is the game's own clock.
export const CLOSE_RATE = 0.5;          // half the speed of the shift: 60 game minutes in 180 real seconds

const STEPS = [
  ['fecha-porta', 'Fechar a porta da loja: tranque depois que o último cliente sair'],
  ['fecha-patio', 'Apagar a luz do pátio no quadro de força, nos fundos'],
  ['fecha-sinal', 'Apagar a placa do Sol no quadro de força, nos fundos'],
];

export function createClosing(bus, { world, render, interaction, time, tasks, progression, ui, customers, narrative, goals, inventory, chores, cash, data, lastNight = 24 }) {
  const THREE = render.THREE;
  const br = world.posto.breakers;
  // (the shift starts it at the minute `semClientesApos`: nobody new arrives from then on)
  const fromMin = time.parse(data.progression.expediente.semClientesApos), endMin = time.parse(data.progression.expediente.fim);
  const S = { on: false, began: false, shop: 'porta-loja' };
  const sfx = (n, o = {}) => bus.emit('sfx', n, o);
  const walkers = () => customers.list.some((c) => c.kind === 'walk');
  const isLast = () => progression.st.day >= lastNight;

  // ---------------------------------------------------------------- the steps: each is true by the state of the world, live
  const check = {
    'fecha-porta': () => world.shut.has(S.shop) && !walkers(),
    'fecha-patio': () => Boolean(br) && !br.isOn('cobertura'),
    'fecha-sinal': () => Boolean(br) && !br.isOn('placa'),
  };
  const stepTasks = () => STEPS.map(([id]) => tasks.list.find((t) => t.id === id)).filter(Boolean);
  const stepsDone = () => stepTasks().length === STEPS.length && stepTasks().every((t) => t.done);

  // ---------------------------------------------------------------- the shop door: lock and unlock (a tap on the door itself only opens and shuts it)
  const doorBox = () => world.aimBox(S.shop, 0.08);
  interaction.register({
    id: 'trancar-loja', reach: 2.4, priority: 1,
    aim: () => ({ box: doorBox() }),
    enabled: () => world.shut.has(S.shop) || (S.on && !world.doorOpen(S.shop)),
    label: () => (world.shut.has(S.shop) ? { text: 'Destrancar a porta da loja' } : { text: 'Trancar a porta da loja' }),
    tap: () => {
      if (world.shut.has(S.shop)) { world.shut.delete(S.shop); sfx('disjuntor'); bus.emit('hint', 'Porta destrancada.'); return; }
      if (walkers()) { bus.emit('hint', 'Ainda há cliente no posto. Atenda antes de trancar.'); sfx('erro'); return; }
      world.setDoor(S.shop, 0); world.shut.add(S.shop); sfx('porta_fecha', { pos: world.anchor(S.shop)?.pos.toArray() }); sfx('disjuntor'); bus.emit('hint', 'Porta da loja trancada.');
    },
  });

  // ---------------------------------------------------------------- the breakers of the yard and of the sign: held to switch off (and back on)
  function breakerTarget(area, textOff, textOn, id, boxId) {
    const P = { p: 0 };
    interaction.register({
      id, reach: 2.6, priority: 2.4,
      aim: () => ({ box: world.aimBox(boxId, 0.06) }),
      enabled: () => S.on && !inventory.carry && !chores.isTripped(area),
      label: () => ({ text: br.isOn(area) ? textOff : textOn, hold: true }),
      tap: () => bus.emit('hint', 'Segure o botão para mexer no disjuntor.'),
      hold: {
        start() { P.p = 0; },
        update(dt, t) {
          if (t < 0.15) return;
          P.p = Math.min(1, P.p + dt / 1.6);
          if (P.p >= 1) { P.p = 0; br.setOn(area, !br.isOn(area)); sfx('disjuntor', { pos: world.at('quadroForca', 1.3).toArray() }); }
        },
        end() { P.p = 0; },
        progress: () => P.p,
      },
    });
  }
  if (br && world.interactable('disjuntor-cobertura')) breakerTarget('cobertura', 'Apagar a luz do pátio (segure)', 'Religar a luz do pátio (segure)', 'fecha-disjuntor-patio', 'disjuntor-cobertura');

  // ---------------------------------------------------------------- the closing
  function start() {
    if (S.began) return;
    S.tillMarked = false;                                    // (the doubled shift of the last night runs through 05:00 a second time)
    S.began = true; S.on = true;
    time.setRate(CLOSE_RATE);
    customers.enable(false);
    for (const [id, text] of STEPS) tasks.add(id, text, 'fechamento');
    bus.emit('hint', 'Cinco da manhã. Ninguém mais chega: atenda quem está no posto e feche.');
    narrative.setClosing(true);
    nextGoal();
  }
  /** The first step still to do is the marked goal, when nothing else is marked (the player's own choice stays). */
  function nextGoal() {
    if (!S.on || goals.key || goals.phoneRinging) return;
    const pend = tasks.list.find((t) => t.kind === 'fechamento' && !t.done);
    if (pend) goals.select('t:' + pend.id);
    else if (tillReady()) goals.select('t:fechar-caixa');
  }
  /** May the till be closed now? The steps are done and the manager has called; the last night waits for the second six o'clock. */
  function tillReady() {
    if (!S.on) return time.minutes >= endMin;
    if (isLast()) return time.minutes >= endMin;
    if (time.minutes >= endMin) return true;
    return stepsDone() && customers.blocking().length === 0 && narrative.callSettled;
  }
  /** What stops the till right now, in words (null when nothing does). */
  function missing() {
    if (!S.on || time.minutes >= endMin) return null;
    if (isLast()) return 'O caixa só fecha às seis, depois do turno.';
    if (customers.blocking().length) return 'Termine os atendimentos antes de fechar o caixa.';
    const left = stepTasks().filter((t) => !t.done);
    if (left.length) return `Falta fechar: ${left.map((t) => t.text.replace(/:.*$/, '').replace(/ no quadro.*$/, '').toLowerCase()).join('; ')}.`;
    if (!narrative.callSettled) return 'Espere o gerente ligar, às 05:50, e atenda.';
    return null;
  }

  function update() {
    if (!S.on) return;
    for (const t of stepTasks()) {
      const ok = check[t.id]();
      if (ok && !t.done) {
        t.done = true; t.failed = false; bus.emit('tasks:change');
        if (!t.paid) { t.paid = true; progression.ok('tarefa'); }
        sfx('tarefa_ok');
        if (!goals.key || goals.key === 't:' + t.id) { goals.select(null); nextGoal(); }      // the next step is the marked goal
      } else if (!ok && t.done) { t.done = false; bus.emit('tasks:change'); }
    }
    // the last step done and the way clear: the till is the goal
    if (!goals.key && !goals.phoneRinging && stepsDone() && tillReady() && !cash.closed && cash.opened && !S.tillMarked) { S.tillMarked = true; goals.select('t:fechar-caixa'); }
  }

  /** For the HUD: "FECHAMENTO 2:31" (the real seconds left of the hour; nothing in the second round of the last night). */
  function text() {
    if (!S.on || time.minutes < fromMin) return null;
    const left = Math.max(0, endMin - time.minutes);
    const sec = Math.ceil(left * (time.secondsPerHour / 60) / CLOSE_RATE);
    return `FECHAMENTO ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function begin() { S.on = false; S.began = false; world.shut.delete(S.shop); }
  /** The night is over (the till is closed) or abandoned: nothing of the closing stays on. */
  function abort() { S.on = false; S.began = false; world.shut.delete(S.shop); }

  return { begin, abort, finish: abort, start, update, text, tillReady, missing, stepsDone, get on() { return S.on; }, get began() { return S.began; } };
}
