// Barramento de eventos do jogo. Contrato: on(nome, fn) -> desligar; emit(nome, dados).
// Eventos conhecidos: noise { pos:[x,z], loud, kind }, machine:state { id, state },
// person:down { id }, machine:lost.
const subs = new Map();

export function on(name, fn) {
  let set = subs.get(name);
  if (!set) subs.set(name, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function once(name, fn) {
  const off = on(name, (d) => { off(); fn(d); });
  return off;
}

export function emit(name, data) {
  const set = subs.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(data); } catch (e) { console.error('bus', name, e); }
  }
}

export function clear() { subs.clear(); }

export const bus = { on, once, emit, clear };
export default bus;
