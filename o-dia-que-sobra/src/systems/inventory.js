// InventorySystem: 4 slots (hands and pockets), the flashlight and its batteries, and the one
// thing carried in the hands (a nozzle, a box). The carried thing is drawn in front of the camera.
export function createInventory(bus, { world, render, items }) {
  const THREE = render.THREE;
  const slots = ['lanterna', 'pilha', 'pilha', null];
  let sel = 0;
  const flash = { on: false, charge: items.lanterna.carga, max: items.lanterna.carga, range: items.lanterna.alcance, cos: items.lanterna.cone };
  let carry = null, carryObj = null;
  const dropHandlers = {};
  const useHandlers = {};    // item -> fn(): what tapping on nothing does with the selected slot (the bottle)   // kind -> fn(carry): what tapping on nothing does with what is in the hands
  const hand = new THREE.Group(); hand.name = 'hand'; hand.position.set(0.3, -0.3, -0.6); render.camera.add(hand);
  render.scene.add(render.camera);

  function setCarry(c, propKind, propOpts) {
    if (carryObj) { hand.remove(carryObj); carryObj = null; }
    carry = c;
    if (c && propKind) {
      carryObj = world.prop(propKind, propOpts);
      carryObj.position.set(0, 0, 0); carryObj.rotation.set(0, 0, 0);
      if (propKind === 'caixa') { carryObj.position.set(-0.3, -0.05, -0.2); }
      if (propKind === 'bico') { carryObj.rotation.set(-0.5, 0.2, 0); carryObj.scale.setScalar(1.6); }
      if (propKind === 'rodo') { carryObj.position.set(0.12, -0.55, -0.1); carryObj.rotation.set(0.35, 0, -0.18); carryObj.scale.setScalar(0.55); }
      if (propKind === 'escada') { carryObj.position.set(-0.55, -0.62, -0.25); carryObj.rotation.set(0.15, 0.6, 0); carryObj.scale.setScalar(0.34); }
      if (propKind === 'copo') { carryObj.position.set(0.02, -0.1, -0.05); carryObj.scale.setScalar(2.2); }
      if (propKind === 'saco') { carryObj.position.set(-0.05, -0.5, -0.05); carryObj.scale.setScalar(0.8); }
      if (propKind === 'atras') { carryObj.position.set(0, -0.12, 0); carryObj.rotation.set(-0.3, 0.3, 0); carryObj.scale.setScalar(1.5); }
      hand.add(carryObj);
    }
    bus.emit('carry', carry);
  }
  return {
    slots, flash, hand, dropHandlers, useHandlers,
    /** Tapping on nothing: puts back what the hands hold, if it can be put back. */
    drop() { const c = carry; if (!c || !dropHandlers[c.kind]) return false; dropHandlers[c.kind](c); return true; },
    get sel() { return sel; }, get carry() { return carry; },
    setCarry, clearCarry: () => setCarry(null),
    select(d) { sel = (sel + d + slots.length) % slots.length; bus.emit('inventory:select', sel); },
    toggleFlash() {
      if (!slots.includes('lanterna')) return false;
      if (flash.charge <= 0) { bus.emit('sfx', 'lanterna_clique', {}); bus.emit('hint', 'A lanterna está sem pilha.'); return false; }
      flash.on = !flash.on; bus.emit('sfx', 'lanterna_clique', {}); return flash.on;
    },
    /** Uses what is in the selected slot. Returns true if something happened. */
    useSelected() {
      const it = slots[sel];
      if (useHandlers[it]) return useHandlers[it]();
      if (it === 'pilha') {
        slots[sel] = null; flash.charge = flash.max; bus.emit('sfx', 'pilha_troca', {}); bus.emit('hint', 'Pilha trocada.'); bus.emit('inventory:change'); return true;
      }
      return false;
    },
    selectedItem: () => slots[sel],
    update(dt) {
      if (flash.on) {
        flash.charge = Math.max(0, flash.charge - dt);
        if (flash.charge === 0) { flash.on = false; bus.emit('hint', 'A pilha acabou.'); bus.emit('inventory:change'); }
      }
      hand.visible = true;
    },
    pilhas: () => slots.filter((s) => s === 'pilha').length,
  };
}
