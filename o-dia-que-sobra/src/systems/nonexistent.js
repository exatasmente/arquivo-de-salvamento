// NonexistentSystem: the customers who do not exist. A share of the people of the shop and the pumps are not people: they look like anyone (the same face,
// outfit and car generator), ask, pay and go. What gives them away is small and different every time, and some real people are odd too, so a tell is not proof.
//
//   the night   how many come (by the week, 0-1 / 1-2 / 2-3 / 3-4, from the night seed and moved by the Sun's attention), when (a seeded plan inside the
//               night) and the ones that come back (the same face as another night, closer and less disguised, when the attention is high)
//   the tells   one to three each (data/entidades.pt-BR.json, `pistas`), subtler as the weeks pass; the camera ones go through `cameras.track` (they show only
//               in the render of the cameras, i.e. on the monitor at the counter), the others are set on the customer for systems/customers.js to read
//               (`noBell`, `noEngine`, `emptyCar`, `oldPack`, `greet`; the missing shadow is done here)
//   the till    their payment is not money (cash.vanish): at six the drawer has less than the report, and that is all that shows
//   strength    each one served raises the Sun's attention (ties.sol) and is remembered; while one is in the shop the sanity drains slowly, faster with the
//               attention and with how many times it has been served; the low sanity then drives the Sun's own stages (systems/entity.js, untouched)
//   refusal     customers.js does the leaving; the consequences are here (`refused`)
//
// Everything is a function of the night seed, the week and the face's seed: no Math.random, no real clock. The plan of the night is saved with "save now"
// (`snapshotState`) and what is remembered between nights is in the run (`run.ent`, read by progression.fromRun; an older card has none and gets a clean one).
import { mulberry32 } from '../rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export const freshEnt = () => ({ known: [], served: 0, refusedE: 0, refusedH: 0 });
/** A saved `ent` (or nothing, from an older card) as a clean object. */
export function cleanEnt(e) {
  const out = freshEnt();
  if (!e || typeof e !== 'object') return out;
  out.served = Math.max(0, Math.floor(Number(e.served) || 0));
  out.refusedE = Math.max(0, Math.floor(Number(e.refusedE) || 0));
  out.refusedH = Math.max(0, Math.floor(Number(e.refusedH) || 0));
  if (Array.isArray(e.known)) out.known = e.known.filter((k) => k && Number.isFinite(Number(k.seed))).slice(0, 4).map((k) => ({ seed: Math.floor(Number(k.seed)), kind: k.kind === 'bomba' ? 'bomba' : 'loja', n: clamp(Math.floor(Number(k.n) || 1), 1, 9) }));
  return out;
}

export function createNonexistent(bus, { data, progression, time, ui, cameras = null, cash = null }) {
  const D = data.entidades || { contagem: {}, pistas: {}, humano: { estranhoChance: 0, pistas: [] }, falas: {}, dreno: {}, forca: {}, recusa: {} };
  const st = progression.st;
  const ties = progression.ties;
  let plan = [];
  let acc = 0;
  const handles = new Map();      // customer id -> the camera tracks it has

  const week = () => progression.st.week;
  const sutileza = (lvl) => clamp((D.sutileza?.[String(clamp(week(), 1, 4))] ?? 0) - lvl * (D.sutilezaPorNivel ?? 0.25), 0, 1);
  /** How plain a tell is, 0.25 (barely there) to 1 (obvious): the weeks make it subtler, being served and coming back makes it plainer. */
  const clear = (lvl) => clamp(1 - sutileza(lvl), 0.25, 1);

  // ------------------------------------------------------------------ the night
  function count(seed, day) {
    const [lo, hi] = D.contagem?.[String(clamp(week(), 1, 4))] || [0, 0];
    const r = mulberry32(seed * 1009 + day * 7 + 3);
    let n = lo + Math.floor(r() * (hi - lo + 1));
    if (ties.sol >= (D.atencao?.extraAPartir ?? 6)) n = Math.min(hi + (D.atencao?.extra ?? 1), n + (D.atencao?.extra ?? 1));
    return n;
  }
  function beginNight(seed, day) {
    plan = []; acc = 0;
    if (!st.tutorialDone || day < (D.primeiraNoite ?? 2)) return;
    const r = mulberry32(seed * 7919 + day * 31 + 11);
    const fresh = count(seed, day);
    // the ones served before come back when the attention is high: the same face, one step plainer each time
    const pReturn = clamp((ties.sol - 2) / 8, 0, 0.9);
    const back = (st.ent.known || []).filter((k) => r() < pReturn).map((k) => ({ seed: k.seed, kind: k.kind, level: clamp(k.n, 1, D.forca?.nivelMax ?? 3), key: k.seed }));
    const [, hi] = D.contagem?.[String(clamp(week(), 1, 4))] || [0, 0];
    const items = [...back];
    for (let k = 0; k < fresh && items.length < hi + 2; k++) {
      let s2 = Math.floor(r() * 1e6);
      while ((st.ent.known || []).some((q) => q.seed === s2)) s2 = (s2 + 7) % 1000000;
      items.push({ seed: s2, kind: r() < (D.bombaChance ?? 0.3) ? 'bomba' : 'loja', level: 0, key: s2 });
    }
    const [a, z] = (D.janela || ['00:25', '04:50']).map((q) => time.parse(q));
    items.forEach((it, k) => { it.at = Math.round(a + (z - a) * ((k + 0.15 + 0.7 * r()) / items.length)); it.done = false; });
    items.sort((x, y) => x.at - y.at);
    plan = items;
  }
  /** The next one that is due now (its hour has come), or null. The caller makes it and then calls `taken(it)`. */
  function due() { return plan.find((p) => !p.done && p.at <= time.minutes) || null; }
  function taken(it) { if (it) it.done = true; }

  // ------------------------------------------------------------------ the tells
  const rule = (id) => D.pistas?.[id] || {};
  function fits(id, c) {
    const so = rule(id).so;
    if (so === 'loja') return c.kind === 'walk';
    if (so === 'carro') return Boolean(c.car);
    if (id === 'cam-ausente' || id === 'cam-atraso') return Boolean(c.kind === 'walk' ? c.human : c.car);
    return true;
  }
  /** The tells of a face this week and level: a function of the seed. */
  function tellsFor(c, lvl) {
    const rr = mulberry32(c.seed * 131 + 17);
    const [lo, hi] = D.pistasPorSemana?.[String(clamp(week(), 1, 4))] || [1, 2];
    let n = lo + Math.floor(rr() * (hi - lo + 1)); if (lvl >= 2) n++; n = clamp(n, 1, 3);
    const pool = Object.keys(D.pistas || {}).filter((id) => fits(id, c));
    const out = [];
    while (out.length < n && pool.length) {
      const w = pool.map((id) => rule(id).peso || 1); let x = rr() * w.reduce((s, q) => s + q, 0), k = 0;
      for (; k < pool.length - 1; k++) { x -= w[k]; if (x <= 0) break; }
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }
  function oddTells(c) {
    const rr = mulberry32(c.seed * 97 + 13);
    if (rr() >= (D.humano?.estranhoChance ?? 0)) return [];
    const pool = (D.humano?.pistas || []).filter((id) => fits(id, c));
    return pool.length ? [pool[Math.floor(rr() * pool.length)]] : [];
  }
  const dayName = (c) => {
    const today = (progression.calendar().noite - 1) % 6, rr = mulberry32(c.seed * 53 + progression.st.day);
    let k = Math.floor(rr() * 7); if (k === today) k = (k + 2) % 7;
    return NAMES[k];
  };
  const pickOf = (arr, c, salt) => arr[Math.floor(mulberry32(c.seed * 29 + salt)() * arr.length) % arr.length];

  function track(c, spec) {
    if (!cameras?.track) return;
    const root = c.kind === 'walk' ? c.human.root : c.car?.root; if (!root) return;
    const h = cameras.track(root, spec); const list = handles.get(c.id) || []; list.push(h); handles.set(c.id, list);
  }
  /** Puts the tells on a customer that has just been made (called by customers.js for every customer of the night; `ent` is what the plan said, or null). */
  function mark(c, ent = null) {
    if (c.tutorial || c.rec || (c.role && c.role !== 'normal') || !st.tutorialDone) return;
    if (!ent && (c.tipo && c.tipo.categoria && c.tipo.categoria !== 'comum')) return;
    const lvl = ent ? ent.level || 0 : 0;
    let tells;
    if (ent) { tells = tellsFor(c, lvl); c.isEnt = true; c.entLvl = lvl; c.entTells = tells.join(','); }
    else { if (progression.st.day < (D.primeiraNoite ?? 2)) return; tells = oddTells(c); if (!tells.length) return; c.odd = true; c.entTells = tells.join(','); }
    const k = clear(lvl);
    for (const id of tells) {
      switch (id) {
        case 'cam-ausente': track(c, { hide: ent ? k : Math.min(0.5, k) }); break;
        case 'cam-atraso': track(c, { delay: 0.8 + 3.2 * k }); break;
        case 'cam-olha': track(c, { stare: 0.3 + 0.7 * k }); break;
        case 'cam-rosto': track(c, { blur: 6 + 10 * k }); break;
        case 'sem-sombra': { const sh = c.human?.shadow; if (sh) { if (k >= 0.6) sh.visible = false; else sh.scale.multiplyScalar(0.4); } break; }
        case 'sino-mudo': c.noBell = true; break;
        case 'carro-mudo': c.noEngine = true; break;
        case 'carro-vazio': c.emptyCar = true; c.car?.setDriver(false); break;
        case 'embalagem-antiga': c.oldPack = true; break;
        case 'sabe-nome': c.greet = pickOf(D.falas?.sabeNome || ['Boa noite, Heitor.'], c, 1); break;
        case 'data-errada': c.greet = (pickOf(D.falas?.dataErrada || ['Hoje é {dia}, né?'], c, 2)).replace('{dia}', dayName(c)); break;
        default: break;
      }
    }
    if (c.greet && c.kind === 'car' && c.text) c.text = `${c.greet} ${c.text}`;
  }
  function unmark(c) { for (const h of handles.get(c.id) || []) h.remove(); handles.delete(c.id); }
  bus.on('customer:gone', (c) => unmark(c));

  // ------------------------------------------------------------------ strength
  function remember(c) {
    const known = st.ent.known;
    const k = known.find((q) => q.seed === c.seed);
    if (k) k.n = clamp(k.n + 1, 1, 9); else { known.push({ seed: c.seed, kind: c.kind === 'car' ? 'bomba' : 'loja', n: 1 }); while (known.length > (D.forca?.maxConhecidas ?? 4)) known.shift(); }
  }
  /** An entity was served: the Sun notices. */
  function served(c) {
    if (!c.isEnt) return;
    st.ent.served++;
    ties.add('sol', D.forca?.atendida ?? 1);
    remember(c);
    bus.emit('ent:served', c);
  }
  /** A customer was refused at the counter or at the pump. An entity gains nothing and the Sun is not fed; a person is lost, and complains. */
  function refused(c) {
    if (c.isEnt) { st.ent.refusedE++; bus.emit('ent:refused', c); return { ent: true }; }
    st.ent.refusedH++;
    const R = D.recusa?.humano || {};
    if (R.conf) ties.add('conf', R.conf);
    progression.complaint(R.reclamacao || 'recusa');
    bus.emit('ent:refused', c);
    return { ent: false };
  }
  const inShop = (c) => c.isEnt && !c.done && (c.kind === 'walk' ? (c.passed && !c.inCar && c.state !== 'leaving' && c.state !== 'gaze') : ['waiting', 'ordered'].includes(c.state));
  /** While one of them is in the shop the sanity goes down slowly; the more it was served and the higher the Sun's attention, the faster. */
  function update(dt, list) {
    let rate = 0;
    for (const c of list) if (inShop(c)) rate += (D.dreno?.base ?? 0.02) * (1 + (D.dreno?.porAtencao ?? 0.3) * ties.sol) * (1 + (D.dreno?.porNivel ?? 0.35) * (c.entLvl || 0));
    if (!rate) { acc = Math.max(0, acc - dt * 0.2); return; }
    acc += rate * dt;
    if (acc >= 1) { acc -= 1; bus.emit('sanity:add', -(D.dreno?.unidade ?? 1), 'presenca'); }
  }

  return {
    beginNight, due, taken, mark, unmark, served, refused, update, fits, tellsFor, clear,
    get plan() { return plan.map((p) => ({ at: p.at, kind: p.kind, seed: p.seed, level: p.level, done: p.done })); },
    get acc() { return acc; },
    snapshotState: () => ({ plan: plan.map((p) => ({ ...p })), acc }),
    restoreState(s = {}) { if (Array.isArray(s.plan)) plan = s.plan.map((p) => ({ ...p })); acc = Number(s.acc) || 0; },
    D,
  };
}
