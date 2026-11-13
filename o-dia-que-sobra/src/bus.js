// Event bus: the systems talk to each other only through it, never by importing one another.
export function createBus() {
  const map = new Map();
  const bus = {
    on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => bus.off(ev, fn); },
    off(ev, fn) { map.get(ev)?.delete(fn); },
    emit(ev, ...args) { const s = map.get(ev); if (s) for (const fn of [...s]) fn(...args); },
  };
  return bus;
}
