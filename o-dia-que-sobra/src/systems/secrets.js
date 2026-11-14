// SecretsSystem: what the campaign hides, and the places of the station that belong to it.
//  S1  the VALDIR account (office.js, hash in vault.js)       S2  the badge on the canopy lamp over pump 4: the ladder reaches it
//  S3  the seventh camera (cameras.js; the occurrence is office.js)   S4  the third cup of coffee (coffee.js)   S5  block 13 of the card (ui.js)
// Here: the badge (it opens the old storeroom), the rule of the storeroom door, the switch of the Sun's sign on the board in the back (the
// move of the secret ending), and the bookkeeping: every `secret:found` goes to the memory card. Nothing in this file is an answer.
export function createSecrets(bus, { world, render, interaction, inventory, progression, player, ui, save }) {
  const THREE = render.THREE;
  const props = world.posto.props || {};
  const br = world.posto.breakers;
  const card = save.card;

  // ------------------------------------------------------------------ the card keeps what was found
  const NAMES = new Set(['s1', 's2', 's3', 's4', 's5', 'valdir']);
  bus.on('secret:found', (id) => {
    if (!NAMES.has(id)) return;
    if (card.addSecret(id)) bus.emit('hint', 'O cartão de memória guardou algo novo.');
  });

  // ------------------------------------------------------------------ S2: the badge
  const cardGroup = props.cracha?.card;
  const hasBadge = () => progression.hasFlag('cracha');
  const ladderInHands = () => inventory.carry?.kind === 'escada';
  const aimC = new THREE.Vector3(), tmp = new THREE.Vector3();
  const S = { p: 0 };
  const dress = () => { if (cardGroup) cardGroup.visible = !hasBadge(); };
  function take() {
    progression.flag('cracha');
    dress(); S.p = 0; player.st.liftTo = 0;
    bus.emit('inventory:add', { item: 'cracha' });
    bus.emit('sfx', 'frasco', {}); bus.emit('sfx', 'cracha_pega', {});
    bus.emit('secret:found', 's2');
    bus.emit('hint', 'Um crachá velho, preso por um cordão. O rosto da foto está apagado. No bolso.');
  }
  if (cardGroup) {
    interaction.register({
      id: 'cracha-pegar', reach: 6, priority: 4,
      aim: () => { cardGroup.getWorldPosition(tmp); return { c: aimC.set(tmp.x, tmp.y - 0.45, tmp.z), r: 0.8 }; },   // the card hangs 40 cm under its hook
      enabled: () => !hasBadge(),
      label: () => (ladderInHands() ? { text: 'Subir na escada e pegar o crachá (segure)', hold: true } : { text: 'Um crachá preso na luminária, alto demais' }),
      tap: () => bus.emit('hint', ladderInHands() ? 'Segure o botão para subir na escada.' : 'Está alto demais para alcançar. Falta algo para subir.'),
      hold: {
        start() { if (ladderInHands()) { player.st.liftTo = 0.55; bus.emit('sfx', 'carrinho', {}); } },
        update(dt, t) {
          if (!ladderInHands() || t < 0.2) return;
          S.p = Math.min(1, S.p + dt / 2.2);
          if (S.p >= 1) take();
        },
        end() { S.p = 0; player.st.liftTo = 0; },
        progress: () => (ladderInHands() ? S.p : null),
      },
    });
  }

  // ------------------------------------------------------------------ the old storeroom: locked in weeks 1 and 2
  const depositoOpen = () => progression.st.week >= 3 || hasBadge() || progression.hasFlag('cam7:ocorrencia') || progression.hasFlag('deposito:aberto');

  // ------------------------------------------------------------------ the sign's breaker (the board in the back)
  const aimBox = () => world.aimBox('disjuntor-placa', 0.06);
  const P = { p: 0 };
  if (br && world.interactable('disjuntor-placa')) {
    interaction.register({
      id: 'placa-disjuntor', reach: 2.6, priority: 2.5,
      aim: () => ({ box: aimBox() }),
      enabled: () => !inventory.carry,
      label: () => ({ text: br.isOn('placa') ? 'Desligar o disjuntor da placa do Sol (segure)' : 'Religar o disjuntor da placa do Sol (segure)', hold: true }),
      tap: () => bus.emit('hint', 'Segure o botão para mexer no disjuntor.'),
      hold: {
        start() { P.p = 0; },
        update(dt, t) {
          if (t < 0.15) return;
          P.p = Math.min(1, P.p + dt / 1.6);
          if (P.p >= 1) { P.p = 0; br.setOn('placa', !br.isOn('placa')); bus.emit('sfx', 'disjuntor', { pos: world.at('quadroForca', 1.3).toArray() }); bus.emit('sign:switch', br.isOn('placa')); }
        },
        end() { P.p = 0; },
        progress: () => P.p,
      },
    });
  }

  return {
    depositoOpen, hasBadge,
    /** The night opens: the badge is back on its hook unless the player took it. */
    beginNight() { dress(); S.p = 0; P.p = 0; },
    /** The four findings of the secret ending (the sign is the fifth, played on the last night). */
    ready: () => ['s1', 's3', 's4', 'valdir'].every((id) => card.hasSecret(id)),
  };
}
