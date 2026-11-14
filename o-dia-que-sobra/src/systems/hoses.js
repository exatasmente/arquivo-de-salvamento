// The hoses of the pumps, in the game: the one of the nozzle in the player's hand follows the hand (to the tank of the car, where it follows the nozzle in the cap), and goes
// back to hanging from its hook when the nozzle is given back. The other hoses hang still. The tube itself is models/hose.js, built with each nozzle by the scene (scenes/posto.js);
// the cutscenes drive the same hoses through `nozzleAt` (cutscenes/stagecraft.js). Called once a frame after the camera is in place (the hand is a child of the camera).
export function createHoses({ world, render, inventory, customers, player }) {
  const V = new render.THREE.Vector3();
  const mode = {};     // 'n-fuel' -> 'rest' | 'active'
  function update() {
    const pumps = world.posto.pumps; if (!pumps) return;
    render.camera.updateMatrixWorld(true);
    const active = new Map(), c = inventory.carry;
    if (c && c.kind === 'bico') { const o = inventory.hand.children[0]; if (o) { o.getWorldPosition(V); active.set(`${c.pump}-${c.fuel}`, V.clone()); } }
    for (const cu of customers.list) if (cu.kind === 'car' && cu.nozzleIn && cu.nozzleObj) { cu.nozzleObj.getWorldPosition(V); active.set(`${cu.pump}-${cu.nozzleFrom?.fuel ?? cu.nozzleType}`, V.clone()); }
    const boxes = world.colliders.filter((q) => q.vehicle && q.enabled !== false);
    const me = { x: player.st.x, z: player.st.z };
    for (const n of Object.keys(pumps)) {
      const hs = pumps[n]?.hoses; if (!hs) continue;
      for (const k of Object.keys(hs)) {
        const key = `${n}-${k}`, end = active.get(key);
        if (end) { hs[k].set(end, { player: me, boxes }); mode[key] = 'active'; }
        else if (mode[key] !== 'rest') { hs[k].set(null); mode[key] = 'rest'; }
      }
    }
  }
  return { update, get mode() { return mode; } };
}
