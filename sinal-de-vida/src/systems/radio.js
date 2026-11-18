// The radio of the station: the centre of the game (docs: kb design, "Como se joga" and "Rádio da estação"). Pure: the radio at the bench
// (src/desk.js) shows `view()` on the piece and sends `select`, `transmit`, `leave`; the tests drive it the same way.
//
//   - fixed channels (numbers), tuned with `tune`; a conversation waits on a channel (`offer`) and starts when it is tuned;
//   - a conversation is a graph of nodes in data: `line` (the other voice speaks), `ask` (up to three answers) and `end`;
//   - choosing an answer does not transmit: Jonas speaks only while the button is held (`transmit(true)`), up to the recorded
//     length (`dur`); letting go early cuts the speech. An answer can carry a `mark` (seconds): letting go before it counts as
//     staying silent for the conversation, but the seconds transmitted still raise the Escuta;
//   - the patience of the voice is the static that fades; if it ends before Jonas transmits, he stayed silent (`silence`):
//     -3 on the Escuta, -1 trust of Neide or Tânia, and the node's `silence` says what happens (the second silence ends the call);
//   - leaving the radio in the middle of a question of the other voice (one with patience) counts as silence and ends the call; a wait
//     with no patience (the call nobody has answered yet) is not a question: leaving it is not silence, the call waits for the radio to
//     open again, and the dial is free until the other voice speaks for the first time;
//   - the field "SENHA DA REDE:" and the colour keyboard of the maintenance channel (three wrong tries and it goes dark).
import { check, hashOf } from './secrets.js';

const EPS = 1e-4;
export const COLORS = [
  { id: 'azul', label: 'AZUL', hex: '#4a7bd8' }, { id: 'verde', label: 'VERDE', hex: '#4fb36a' }, { id: 'violeta', label: 'VIOLETA', hex: '#8c5ad0' },
  { id: 'ciano', label: 'CIANO', hex: '#3ec4d0' }, { id: 'rosa', label: 'ROSA', hex: '#e07aa8' },
];
export const KEYS = { send: 2.0, maxErrors: 3, max: 12 };
export const MIN_HOLD = 0.25;      // a press shorter than this is a slip of the finger: it does not transmit
export const PATIENCE_PLUS = 2;    // the "more patience" option multiplies the patience of the voices by this

export function createRadio({ escuta, trust, flags = {}, conversations = {}, channels = [], secrets = {}, options = {}, saved = {}, emit = () => {} }) {
  const st = {
    channel: saved.channel ?? 0,
    known: new Set(saved.known ?? channels.filter((c) => c.known !== false).map((c) => c.id)),
    offers: { ...(saved.offers ?? {}) }, done: [...(saved.done ?? [])],
    open: false, conv: null, last: null,
    password: Boolean(saved.password), passwordTries: 0, passwordMsg: '', blink: false,
    keys: { seq: [], errors: saved.keys?.errors ?? 0, locked: (saved.keys?.errors ?? 0) >= KEYS.maxErrors, solved: Boolean(saved.keys?.solved), held: 0, sending: false, msg: '' },
    pending: [],
  };
  const chan = () => channels[st.channel];
  const knownList = () => channels.filter((c) => st.known.has(c.id));
  const patienceK = () => (options.patience ? PATIENCE_PLUS : 1);
  const say = (type, data = {}) => emit({ type, ...data });

  // ---- the conversation ---------------------------------------------------------------------------------------------------
  const nodeOf = (c) => c.def.nodes[c.node];
  function applyFx(fx) {
    if (!fx) return;
    if (fx.escuta > 0) escuta.raise(fx.escuta, 'fx'); else if (fx.escuta < 0) escuta.lower(fx.escuta, 'fx');
    for (const [k, v] of Object.entries(fx.set ?? {})) flags[k] = v;
    if (fx.read) escuta.read(fx.read);
  }
  function goto(c, key) {
    if (!key || !c.def.nodes[key]) return end(c, 'ended');
    c.node = key; c.t = 0;
    const n = nodeOf(c);
    if (n.kind === 'line') c.spoke = true;                // from the first line of the other voice the call holds the dial
    if (n.kind === 'end') { applyFx(n); return end(c, c.dropOutcome ?? n.outcome ?? 'ended'); }
    if (n.kind === 'line') { c.phase = 'line'; c.said = { who: n.who, text: n.text }; applyFx(n.fx); say('line', { who: n.who, id: n.id }); }
    else if (n.kind === 'ask') {
      c.phase = 'ask';
      if (n.read) escuta.read(n.read);              // the thresholds are read before anything is transmitted
      const total = n.patience == null ? null : n.patience * patienceK();
      c.ask = { sel: n.responses.length === 1 ? 0 : null, since: 0, total, left: total, tx: null };
      say('ask', { id: n.turn ?? c.node, who: n.who });
    } else end(c, 'ended');
  }
  function end(c, outcome, set) {
    for (const [k, v] of Object.entries(set ?? {})) flags[k] = v;
    c.phase = 'ended'; c.outcome = outcome; c.ask = null;
    delete st.offers[c.channel];
    st.done.push(c.id);
    st.last = { id: c.id, outcome, silences: c.silences };
    say('end', st.last);
  }
  function startConv(id, channel) {
    const def = conversations[id];
    if (!def) return null;
    const c = { id, def, channel, node: null, phase: 'idle', t: 0, silences: 0, ask: null, outcome: null, spoke: false };
    st.conv = c; goto(c, def.start);
    return c;
  }
  function silenceFlow(c, reason) {
    const n = nodeOf(c);
    c.silences++;
    escuta.silence();
    if (n.trust) trust.silence(n.trust);
    say('silence', { reason, n: c.silences, id: n.turn ?? c.node });
    c.ask = null;
    if (reason === 'left') return end(c, 'left', c.def.onLeft?.set);
    if (n.silence?.end) return end(c, n.silence.end);                 // the last turn (T3): silence ends the talk, the other voice is still on the air
    if (c.silences >= (c.def.maxSilences ?? 2)) {
      // the call drops; a call that has a farewell (onDrop.next) still plays it (the network says goodbye to everyone, not only to Jonas), and then ends as dropped
      if (c.def.onDrop?.next && c.def.nodes[c.def.onDrop.next]) { for (const [k, v] of Object.entries(c.def.onDrop.set ?? {})) flags[k] = v; c.dropOutcome = c.def.onDrop.outcome ?? 'dropped'; return goto(c, c.def.onDrop.next); }
      return end(c, c.def.onDrop?.outcome ?? 'dropped', c.def.onDrop?.set);
    }
    if (n.silence?.next) return goto(c, n.silence.next);
    return end(c, 'ended');
  }
  function finishTx(c, released) {
    const a = c.ask, n = nodeOf(c), tx = a.tx, r = n.responses[tx.i], held = tx.held;
    a.tx = null;
    if (released && held < MIN_HOLD) { say('tx-end', { held, cancelled: true }); return; }           // a slip of the finger
    const complete = held >= r.dur - EPS;
    escuta.transmit(held, `transmit:${n.turn ?? c.node}`);
    say('tx-end', { held, complete });
    if (r.mark != null && held < r.mark - EPS) return silenceFlow(c, 'cut-before-mark');            // too short to carry the information
    const through = r.mark != null ? true : complete;                                                  // the information got through
    if (n.trust) trust.reply(n.trust, { delay: tx.delay, seconds: held, lie: Boolean(r.lie) });
    if (through && r.heard) { escuta.raise(r.heard, 'heard'); say('heard', { id: n.turn ?? c.node }); }
    if (through) for (const [k, v] of Object.entries(r.gives ?? {})) flags[k] = v;
    applyFx(r.fx);
    c.ask = null;
    goto(c, r.next);
  }

  // ---- the radio ------------------------------------------------------------------------------------------------------------
  function arrive() {
    const c = chan();
    if (!c) return;
    const id = st.offers[c.id];
    if (id && !(st.conv && st.conv.phase !== 'ended' && st.conv.channel === c.id)) startConv(id, c.id);
  }
  const R = {
    COLORS, KEYS,
    get channels() { return channels; },
    get channel() { return chan(); },
    get isOpen() { return st.open; },
    get conv() { return st.conv; },
    get last() { return st.last; },
    get passwordOk() { return st.password; },
    get keys() { return st.keys; },
    /** Whether a conversation is on (and not finished): the dial is locked while it is. */
    get busy() { return Boolean(st.conv && st.conv.phase !== 'ended' && st.conv.spoke && st.open); },
    open() { st.open = true; if (!st.conv || st.conv.phase === 'ended') arrive(); say('open'); },
    /** Leaving the radio. In the middle of a question with patience it counts as silence and ends the call; in a wait with no patience, or
     *  during a line, it only pauses (the call is there when the radio opens again). */
    leave() {
      const c = st.conv;
      if (c && c.phase === 'ask') {
        if (c.ask.tx) { const a = c.ask; escuta.transmit(a.tx.held, 'transmit:left'); a.tx = null; }
        if (c.ask.total !== null) silenceFlow(c, 'left');
      }
      st.open = false; st.keys.held = 0; st.keys.sending = false; say('close');
    },
    offer(channelId, convId) { st.offers[channelId] = convId; if (st.open && chan()?.id === channelId) arrive(); },
    know(channelId) { st.known.add(channelId); },
    isKnown: (id) => st.known.has(id),
    tuneTo(id) { const i = channels.findIndex((c) => c.id === id); if (i >= 0 && st.known.has(id)) { st.channel = i; if (st.open) arrive(); } },
    tune(d) {
      if (R.busy) return false;
      const list = knownList(); if (!list.length) return false;
      const at = Math.max(0, list.findIndex((c) => c.id === chan()?.id)), nx = list[(at + d + list.length * 4) % list.length];
      st.channel = channels.findIndex((c) => c.id === nx.id);
      if (st.conv && (st.conv.phase === 'ended' || !st.conv.spoke)) st.conv = null;      // a call nobody answered yet is parked: its offer starts it again
      say('tune', { channel: nx.id }); if (st.open) arrive();
      return true;
    },
    select(i) { const a = st.conv?.ask; if (a && !a.tx && i >= 0 && i < nodeOf(st.conv).responses.length) { a.sel = i; say('select', { i }); } },
    moveSelect(d) { const a = st.conv?.ask; if (!a || a.tx) return; const n = nodeOf(st.conv).responses.length; R.select(a.sel === null ? (d > 0 ? 0 : n - 1) : (a.sel + d + n) % n); },
    /** The transmit button: down starts Jonas speaking the chosen answer, up cuts it. */
    transmit(down) {
      const c = st.conv, a = c?.ask;
      if (!a) return;
      if (down && !a.tx && a.sel !== null) { const r = nodeOf(c).responses[a.sel]; a.tx = { i: a.sel, held: 0, dur: r.dur, mark: r.mark ?? null, delay: a.since }; say('tx-start', { voice: r.voice ?? null }); }
      else if (!down && a.tx) finishTx(c, true);
    },
    /** Moves a line on without waiting for it (E or a tap on the line). */
    skipLine() { const c = st.conv; if (c?.phase === 'line') { const n = nodeOf(c); c.t = n.dur ?? 0; } },
    step(dt) {
      if (!st.open) return;
      const c = st.conv;
      if (c && c.phase === 'line') { c.t += dt; const n = nodeOf(c); if (c.t >= (n.dur ?? 2) - EPS) goto(c, n.next); }
      else if (c && c.phase === 'ask') {
        const a = c.ask; a.since += dt;
        if (a.tx) { a.tx.held = Math.min(a.tx.dur, a.tx.held + dt); if (a.tx.held >= a.tx.dur - EPS) { a.tx.held = a.tx.dur; finishTx(c, false); } }
        else if (a.left !== null) { a.left -= dt; if (a.left <= 0) silenceFlow(c, 'patience'); }
      }
      // the colour keyboard: the send button held for 2 s
      const k = st.keys;
      if (k.sending) { k.held += dt; if (k.held >= KEYS.send - EPS) { k.sending = false; k.held = 0; sendKeys(); } }
    },
    // ---- the password field ---------------------------------------------------------------------------------------------
    async submitPassword(text) {
      const ok = secrets.senha ? await check(secrets.senha, text) : false;
      st.passwordTries++;
      if (ok && !st.password) { st.password = true; flags.senha = true; say('password'); }
      st.passwordMsg = ok ? 'Senha aceita.' : 'Nada responde.';
      return ok;
    },
    // ---- the colour keyboard ---------------------------------------------------------------------------------------------
    keyPress(color) { const k = st.keys; if (k.locked || k.solved || k.seq.length >= KEYS.max || !COLORS.some((c) => c.id === color)) return false; k.seq.push(color); k.msg = ''; say('key', { color }); return true; },
    keyErase() { const k = st.keys; if (k.locked || !k.seq.length) return false; k.seq.pop(); return true; },
    /** The send button of the keyboard: held for 2 s it transmits and sends; let go before, it only transmits the seconds. */
    keySend(down) {
      const k = st.keys;
      if (down) { if (!k.locked && !k.solved && k.seq.length && !k.sending) { k.sending = true; k.held = 0; say('tx-start'); } }
      else if (k.sending) { k.sending = false; if (k.held >= MIN_HOLD) escuta.transmit(k.held, 'keyboard:cut'); k.held = 0; say('tx-end', { cancelled: true }); }
    },
    /** Promises of checks in flight (the hash is asynchronous): the tests wait for them. */
    settle() { return Promise.all(st.pending.splice(0)); },
    resetNight() { st.keys.errors = 0; st.keys.locked = false; st.keys.seq = []; st.keys.msg = ''; },
    view() {
      const c = st.conv, n = c && c.node ? nodeOf(c) : null, a = c?.ask, k = st.keys;
      const cur = chan();
      return {
        open: st.open, channel: cur?.id, channelN: cur?.n, channelName: cur?.name, channels: channels.map((x) => ({ id: x.id, n: x.n, known: st.known.has(x.id), on: x.id === cur?.id, offer: Boolean(st.offers[x.id]) })),
        phase: c?.phase ?? 'idle', outcome: c?.outcome ?? null, convId: c?.id ?? null,
        line: c?.phase === 'line' ? { who: n.who, text: n.text, t: c.t, dur: n.dur ?? 2, voice: n.voice ?? null } : null,
        who: n?.who ?? null, said: c?.said ?? null,
        ask: a ? {
          who: n.who, turn: n.turn ?? null, text: n.text ?? '', sel: a.sel, since: a.since, left: a.left, total: a.total, locked: Boolean(a.tx),
          choices: n.responses.map((r) => ({ text: r.text, dur: r.dur, mark: r.mark ?? null })),
          tx: a.tx ? { held: a.tx.held, dur: a.tx.dur, mark: a.tx.mark } : null,
        } : null,
        silences: c?.silences ?? 0, escuta: escuta.value,
        password: { ok: st.password, msg: st.passwordMsg, blink: st.blink },
        keys: cur?.keys ? { seq: [...k.seq], errors: k.errors, left: KEYS.maxErrors - k.errors, locked: k.locked, solved: k.solved, sending: k.sending, held: k.held, msg: k.msg } : null,
        hasKeys: Boolean(cur?.keys),
        txHeld: a?.tx?.held ?? (k.sending ? k.held : 0),
      };
    },
    setBlink(v) { st.blink = Boolean(v); },
    state() { return { channel: st.channel, known: [...st.known], offers: { ...st.offers }, done: [...st.done], password: st.password, keys: { errors: st.keys.errors, solved: st.keys.solved } }; },
  };

  function sendKeys() {
    const k = st.keys, seq = [...k.seq];
    escuta.transmit(KEYS.send, 'keyboard');
    const p = (async () => {
      const ok = secrets.cores ? secrets.cores.hashes.includes(await hashOf(secrets.cores.salt, seq.join(' '))) : false;
      if (ok) { k.solved = true; flags.cao = true; k.msg = 'Algo responde.'; say('keys', { ok: true }); }
      else { k.errors++; k.seq = []; k.msg = 'Nada responde.'; if (k.errors >= KEYS.maxErrors) { k.locked = true; k.msg = 'O teclado apagou.'; } say('keys', { ok: false, errors: k.errors }); }
    })();
    st.pending.push(p);
  }
  return R;
}
