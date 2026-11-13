// "A prateleira arrumada": the shelf the player was about to restock is already full, with products of 1998 in the old
// Sun packaging. The job leaves the list without being done (no points: it was not the player's). Seen up close it costs sanity.
export function run({ tasks, world, kit, bus, sanity, progression, event, ui, time }) {
  const sh = [...tasks.shelves.values()].find((s) => !s.done && tasks.list.some((t) => t.id === 'repor-' + s.id && !t.done));
  if (!sh) return { update: () => true };
  const row = sh.row, ctr = world.aimBox(row.id, 0).getCenter(kit.v3());
  sh.done = true; row.setStock(row.slots); row.setVintage?.(true);
  tasks.done('repor-' + sh.id);
  bus.emit('tasks:change');
  let t = 0, seen = false;
  return {
    update(dt) {
      t += dt;
      if (!seen && kit.dist(ctr) < 7 && kit.look(ctr) > 0.8) {
        seen = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
        ui.say('Heitor', '(Embalagens de 1998. Com o Sol. A prateleira estava vazia.)', { seed: 9, ms: 4200 });
        bus.emit('sfx', 'objeto_cai', { pos: ctr.toArray() });
      }
      return seen ? t > 60 : t > 140 || time.minutes > 345;
    },
  };
}
