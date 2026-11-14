// "O morador de rua" (no name in the video; the game calls him only "Morador de rua"): on some nights he is near the kerb by the sign or by a rubbish bin of the forecourt,
// standing, head a little down. He is a real person: no sanity, no occurrence. He talks little ("Boa noite, moço. Tem um troco?"), and when something strange is seen with him
// near he is the one who believes it: "Você também ouviu? Isso aqui sempre teve." Never an answer to a secret, never an explanation. He is gone after a while, or when nobody looks.
// Lines: data/recurring.pt-BR.json, `moradorDeRua`. His look: data/cast.json (`morador-de-rua`), the outfit `morador` of models/customer.js.
import { buildCustomer } from '../../models/customer.js';

function spots(world) {
  const out = [];
  for (const n of [1, 2, 3, 4]) { const b = world.aimBox('lixeira' + n, 0); if (b) { const c = b.getCenter(world.r.THREE ? new world.r.THREE.Vector3() : { x: 0, y: 0, z: 0 }); out.push({ x: c.x - 0.9, z: c.z + 0.55, face: [c.x, c.z] }); } }
  const k = world.anchor('cartazFora'); if (k) out.push({ x: k.pos.x - 1.1, z: k.pos.z - 0.7, face: [k.pos.x, k.pos.z + 2] });
  return out;
}
const free = (s, { player, customers }) => !player.blocked(s.x, s.z) && !customers.list.some((c) => c.car && Math.hypot(c.car.root.position.x - s.x, c.car.root.position.z - s.z) < 3.2);
export const can = (ctx) => spots(ctx.world).some((s) => free(s, ctx)) && ctx.entity.state === 'ausente';
export function run(ctx) {
  const { world, kit, ui, interaction, bus, progression, data, render, rng, time, est, player } = ctx;
  const D = data.recurring.moradorDeRua, cast = (data.cast?.tipos || []).find((t) => t.id === 'morador-de-rua');
  const cand = spots(world).filter((s) => free(s, ctx));
  if (!cand.length) return { update: () => true };
  const sp = cand[Math.floor(rng() * cand.length)];
  const h = buildCustomer(render, { categoria: 'comum', ...(cast?.aparencia || {}) }, { seed: cast?.aparencia?.seed ?? 88 });
  h.root.position.set(sp.x, 0, sp.z); h.root.rotation.y = Math.atan2(sp.face[0] - sp.x, sp.face[1] - sp.z); h.root.visible = false; render.scene.add(h.root);
  const visits = progression.st.flags.filter((f) => f.startsWith('morador:')).length;
  const ctr = h.root.position.clone().setY(1.1);
  let st = 'wait', t = 0, away = 0, lastSeen = -999, told = false, reactAt = -1, reactN = 0, tid = null;
  est.morador = { name: 'Morador de rua' };
  const onSeen = () => { lastSeen = time.minutes; if (st === 'there' && kit.dist(ctr) < 14 && !ui.modalOpen) reactAt = t + 1.3; };
  const off = bus.on?.('event:seen', onSeen);
  async function talk() {
    st = 'talking';
    const fresh = time.minutes - lastSeen < 25;
    const lines = fresh ? (told ? D.acreditaDepois : D.acredita) : (visits === 0 && !told ? D.primeira : D.volta);
    if (fresh) told = true;
    if (!progression.hasFlag('morador:' + progression.st.day)) progression.flag('morador:' + progression.st.day);
    await ui.dialogue(D.quem, lines.map((l) => l.t), 88 + reactN);
    st = 'there'; t = Math.min(t, 100);
  }
  return {
    get info() { return { st, t, at: [sp.x, sp.z] }; },
    update(dt, simT) {
      t += dt; h.update?.(simT, { pose: 'parado', andando: 0 });
      if (st === 'wait') {
        // he is there when the player is not looking his way (or is far), outside the shop's front
        if (kit.look(ctr) < 0.5 || kit.dist(ctr) > 14) {
          h.root.visible = true; st = 'there'; t = 0;
          tid = interaction.register({ id: 'morador', reach: 3.4, priority: 1, aim: () => ({ c: ctr, r: 0.7 }), enabled: () => st === 'there', label: () => ({ text: 'Falar com o morador de rua' }), tap: () => talk() });
        } else if (t > 40) return true;
        return false;
      }
      if (st === 'there') {
        if (reactAt >= 0 && t >= reactAt) { reactAt = -1; if (!ui.modalOpen) ui.say(D.quem, D.reagem[reactN++ % D.reagem.length], { seed: 90 + reactN, ms: 2800 }); }
        if (kit.look(ctr) < 0.3) away += dt; else away = 0;
        if ((t > 150 && away > 1) || t > 260) { h.root.visible = false; return true; }
      }
      return false;
    },
    dispose() { if (tid) interaction.unregister(tid); render.scene.remove(h.root); est.morador = null; off?.(); },
  };
}
