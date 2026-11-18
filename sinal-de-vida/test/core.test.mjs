// The core of the narrative game, without three.js: the Escuta, the trust, the radio conversations, the director. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pbkdf2Sync, createHash } from 'node:crypto';
import { mulberry32 } from '../vendor/engine/rng.js';
import { createEscuta, ESCUTA, transmitCost } from '../src/systems/escuta.js';
import { createTrust } from '../src/systems/trust.js';
import { createRadio, COLORS } from '../src/systems/radio.js';
import { createQuick } from '../src/systems/quick.js';
import { createDirector, matches } from '../src/systems/director.js';
import { pickShot } from '../src/systems/shots.js';
import { hashOf, check, normalize, ITERATIONS } from '../src/systems/secrets.js';
import { resolveStory } from '../src/systems/voicedata.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/story/${p}`, import.meta.url), 'utf8'));
const DURATIONS = JSON.parse(readFileSync(new URL('../assets/audio/n1/durations.json', import.meta.url), 'utf8')), MARCAS = json('marcas.json');
const CONV = resolveStory(json('conversations.json'), DURATIONS, MARCAS), CHANNELS = json('radio.json').channels, SECRETS = json('secrets.json'), NIGHTS = json('nights.json'), SCENES = json('scenes.json');
const DT = 1 / 60;

/** A radio with the real data and a fresh Escuta (at `start`), the way the game makes it; `conversations` can add test fixtures. */
function setup({ start = 10, conversations = {}, options = {} } = {}) {
  const escuta = createEscuta({ value: start }), trust = createTrust(), flags = {}, events = [];
  const radio = createRadio({ escuta, trust, flags, conversations: { ...CONV, ...conversations }, channels: CHANNELS, secrets: SECRETS, options, emit: (e) => events.push(e) });
  return { escuta, trust, flags, radio, events };
}
const run = (radio, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) radio.step(DT); };
/** Waits (the other voice speaks) until the radio is asking, or ended. */
const toAsk = (radio, max = 40) => { for (let t = 0; t < max; t += DT) { const p = radio.conv?.phase; if (p === 'ask' || p === 'ended') return p; radio.step(DT); } throw new Error(`no ask: ${radio.conv?.phase} ${radio.conv?.node}`); };
/** Answers: chooses `i` and holds the button for `seconds` (the answer's own length when it is not given). */
const answer = (radio, i, seconds) => {
  toAsk(radio); if (radio.conv.phase === 'ended') return;
  radio.select(i);
  const r = radio.view().ask.choices[i];
  radio.transmit(true); run(radio, seconds ?? r.dur + 0.1); radio.transmit(false);
};
const keep = (radio) => { toAsk(radio); if (radio.conv.phase === 'ended') return; const n = radio.conv.silences; for (let t = 0; t < 99 && radio.conv.silences === n && radio.conv.phase !== 'ended'; t += DT) radio.step(DT); };   // stay silent until the patience ends
const begin = (radio, channel, conv) => { radio.tuneTo(channel); radio.offer(channel, conv); radio.open(); };

test('the Escuta: 2 per second, rounded per transmission, a ceiling of 100, a floor of 0, 10 less at the start of each night', () => {
  assert.equal(transmitCost(3.4), 7); assert.equal(transmitCost(2.0), 4); assert.equal(transmitCost(7.0), 14); assert.equal(transmitCost(3.2), 6);
  const e = createEscuta({ value: 95 });
  e.raise(20); assert.equal(e.value, 100);
  e.lower(150); assert.equal(e.value, 0);
  const n = createEscuta(); assert.equal(n.value, 10);
  n.raise(29); n.beginNight(2); assert.equal(n.value, 29);
  n.beginNight(1); assert.equal(n.value, 10);
  assert.equal(ESCUTA.mid, 50); assert.equal(ESCUTA.high, 70);
});

test('the trust: starts at 2, +1 for an answer within 3 s, -1 for silence, a lie or more than 6 s, from 0 to 3', () => {
  const t = createTrust();
  assert.equal(t.get('neide'), 2); assert.equal(t.get('tania'), 2);
  t.reply('neide', { delay: 2.5, seconds: 2 }); assert.equal(t.get('neide'), 3);
  t.reply('neide', { delay: 1, seconds: 2 }); assert.equal(t.get('neide'), 3);          // the ceiling
  t.reply('neide', { delay: 5, seconds: 2 }); assert.equal(t.get('neide'), 3);          // late: no change
  t.reply('neide', { delay: 1, seconds: 6.5 }); assert.equal(t.get('neide'), 2);        // too long: she scolds, a fall wins
  t.reply('tania', { delay: 1, seconds: 2, lie: true }); assert.equal(t.get('tania'), 1);
  t.silence('tania'); t.silence('tania'); t.silence('tania'); assert.equal(t.get('tania'), 0);
  assert.equal(t.tier('neide'), 'full'); assert.equal(t.tier('tania'), 'basic');
});

// ---- the example sums of the design --------------------------------------------------------------------------------------------------
// A call of the 22h and the decision 3 are not in the game's data yet (phase B): the test declares them in the same format.
const askOne = (turn, who, dur, extra = {}) => ({ kind: 'ask', turn, who, patience: 12, responses: [{ text: 'x', dur, next: 'fim', ...extra }] });
const CHAMADA = { start: 'a', nodes: {
  a: { ...askOne('N', 'neide', 4), trust: 'neide', responses: [{ text: 'A água voltou.', dur: 4, next: 'b' }] },
  b: { ...askOne('T', 'tania', 4), trust: 'tania', responses: [{ text: 'Vou sair agora.', dur: 4, next: 'fim' }] },
  fim: { kind: 'end', outcome: 'ok' } } };
const D3 = (a) => ({ start: 'x', nodes: { x: { kind: 'ask', turn: 'D3', who: 'operadora', patience: 12, responses: a, silence: { end: 'ended' } }, fim: { kind: 'end', outcome: 'ok' } } });
const FIX = {
  'chamada-22h': CHAMADA,
  // decision 3, careful: (c) the question (3 s, +6) and the unmasking (-15); careless: (a) 4 s (+8) and the position (heard +10, 3 s +6)
  'n2-d3-cuidadoso': D3([{ text: 'Por que você quer que eu fale tanto?', dur: 3, fx: { escuta: -15 }, next: 'fim' }]),
  'n2-d3-descuidado': { start: 'x', nodes: { x: { kind: 'ask', turn: 'D3', who: 'voz', patience: 12, responses: [{ text: 'Vou buscar o remédio.', dur: 4, next: 'y' }] }, y: { kind: 'ask', turn: 'D3b', who: 'voz', patience: 12, responses: [{ text: 'A posição.', dur: 3, heard: 10, next: 'fim' }] }, fim: { kind: 'end', outcome: 'ok' } } },
  'n2-antena': D3([{ text: 'Testando a antena.', dur: 3, next: 'fim' }]),
};
const cut = (radio, i, dur) => answer(radio, i, dur);

/** Runs the lines of the other voice until the conversation has ended (the farewell, the end node). */
const finish = (radio, max = 90) => { for (let t = 0; t < max && radio.conv?.phase !== 'ended'; t += DT) radio.step(DT); assert.equal(radio.conv.phase, 'ended'); };
const ESPERAR = SCENES['n1-saida'].beats.find((b) => b.type === 'escuta' && b.if?.is === false).n;      // the decision 1, "esperar": what the scene adds to the Escuta

/** Night 1 up to the radio of scene 5, with the REAL call of 22h (n1-chamada, the lengths of the recordings), as the design counts it.
 *  `how`: 'careful' (short answers, leave now), 'wait' (short answers, wait for the dog: the scene adds ESPERAR), 'careless' (whole answers, leave now, the mistakes on the street). */
function night1(how) {
  const s = setup();
  assert.equal(s.escuta.value, 10);
  begin(s.radio, 'rede', 'n1-chamada');
  if (how === 'careless') { answer(s.radio, 1); answer(s.radio, 0); } else if (how === 'wait') { answer(s.radio, 0); answer(s.radio, 1); } else { answer(s.radio, 0); answer(s.radio, 0); }
  finish(s.radio); s.radio.leave();
  assert.equal(s.flags.saiAgora, how !== 'wait');
  assert.equal(s.escuta.value, { careful: 14, wait: 15, careless: 19 }[how], 'after the call of 22h');
  if (how === 'wait') s.escuta.raise(ESPERAR, 'cao-na-grade');
  // the exit: the careless one misses the splice +8, runs near +3, Tânia's voice makes the dog search +5; the careful one is not heard
  if (how === 'careless') { s.escuta.raise(8, 'quick'); s.escuta.raise(3, 'run'); s.escuta.raise(5, 'dog'); }
  assert.equal(s.escuta.value, { careful: 14, wait: 15 + ESPERAR, careless: 35 }[how], 'after the exit');
  return s;
}

test('the decision "esperar" is worth +18 on the Escuta', () => { assert.equal(ESPERAR, 18); });

test('night 1, careful (the real call): 33 at the end, the night 2 opens 10 lower, under 50: the cut has no dog at the grate', () => {
  const s = night1('careful');
  begin(s.radio, 'operadora', 'n1-cena5');
  answer(s.radio, 0); assert.equal(s.escuta.value, 21, '"Alguém escutando?" 3.4 s: +7');
  answer(s.radio, 0); assert.equal(s.escuta.value, 25, '"Quem é?" 2.0 s: +4');
  answer(s.radio, 1); assert.equal(s.escuta.value, 31, 'not telling, 3.2 s: +6');
  answer(s.radio, 0); assert.equal(s.escuta.value, 33, '"Ainda tem alguém aí?" 1.2 s: +2');
  assert.equal(s.radio.last.outcome, 'ok'); assert.equal(s.flags.contou, false);
  s.escuta.beginNight(2); assert.equal(s.escuta.value, 23);
  assert.ok(!s.escuta.atLeast(50));
});

test('night 1, careful and waiting for the dog: the +18 puts it at 52, so the cut shows the dog at the grate (50 or more)', () => {
  const s = night1('wait');
  assert.equal(s.escuta.value, 33);
  begin(s.radio, 'operadora', 'n1-cena5');
  answer(s.radio, 0); answer(s.radio, 0); answer(s.radio, 1); answer(s.radio, 0);
  assert.equal(s.escuta.value, 52); assert.ok(s.escuta.atLeast(50), 'at 50 or more with the call on the air');
  assert.ok(s.escuta.value >= 50, 'the careful one who waits closes at 50 or more');
});

test('night 1, careless (the one of the video), the real call: 19, 35, 42, 46, 70, 76 at the end; the night 2 opens at 66', () => {
  const s = night1('careless');
  begin(s.radio, 'operadora', 'n1-cena5');
  answer(s.radio, 0); assert.equal(s.escuta.value, 42);
  answer(s.radio, 0); assert.equal(s.escuta.value, 46);
  answer(s.radio, 0);                         // telling: 7 s (+14) and the "heard" (+10)
  assert.equal(s.escuta.value, 70); assert.equal(s.flags.contou, true);
  answer(s.radio, 0);                         // "Não. Ela disse…" +6
  assert.equal(s.flags.soubeComporta, true);
  assert.equal(s.escuta.value, 76);
  assert.ok(s.escuta.atLeast(50)); assert.ok(s.events.some((e) => e.type === 'heard'), 'the "heard" icon was asked for');
  s.escuta.beginNight(2); assert.equal(s.escuta.value, 66);
});

/** Night 2: the call with Neide and Tânia, decision 3, the exit, the antenna test; `start` is the Escuta the night opens with. */
function night2(careless) {
  const s = setup({ start: careless ? 73 : 29, conversations: FIX });
  begin(s.radio, 'rede', 'chamada-22h');
  if (careless) { answer(s.radio, 0); answer(s.radio, 0); } else { cut(s.radio, 0, 2.0); cut(s.radio, 0, 2.0); }
  s.radio.leave();
  assert.equal(s.escuta.value, careless ? 89 : 37, 'the call');
  if (careless) { begin(s.radio, 'operadora', 'n2-d3-descuidado'); answer(s.radio, 0); answer(s.radio, 0); s.radio.leave(); }
  else { begin(s.radio, 'operadora', 'n2-d3-cuidadoso'); answer(s.radio, 0); s.radio.leave(); }
  assert.equal(s.escuta.value, careless ? 100 : 28, 'decision 3');
  if (careless) { s.escuta.raise(16, 'quick'); } assert.equal(s.escuta.value, careless ? 100 : 28, 'exit 2');
  begin(s.radio, 'operadora', 'n2-antena'); answer(s.radio, 0); s.radio.leave();
  return s;
}
test('night 2, careful: 34 at the end, the night 3 opens at 24', () => {
  const s = night2(false); assert.equal(s.escuta.value, 34);
  s.escuta.beginNight(3); assert.equal(s.escuta.value, 24); assert.ok(!s.escuta.atLeast(70));
});
test('night 2, careless: 100 at the ceiling, the night 3 opens at 90 with the escape', () => {
  const s = night2(true); assert.equal(s.escuta.value, 100);
  s.escuta.beginNight(3); assert.equal(s.escuta.value, 90); assert.ok(s.escuta.atLeast(70));
});

// ---- the four cases of silence of scene 5 ---------------------------------------------------------------------------------------------
/** The careful one arrives at T1 with 25 and at T2 with 29. */
function atT1() { const s = setup({ start: 18 }); begin(s.radio, 'operadora', 'n1-cena5'); answer(s.radio, 0); assert.equal(s.escuta.value, 25); return s; }

test('silence in T1 and in T2: 25 -3 -3 = 19, and the call ends', () => {
  const s = atT1();
  keep(s.radio);                                      // T1: silent; the voice says 02b and goes straight to T2
  assert.equal(s.radio.conv.node, '02b'); assert.equal(s.escuta.value, 22);
  keep(s.radio);                                      // T2: the second silence
  assert.equal(s.escuta.value, 19); assert.equal(s.radio.last.outcome, 'dropped'); assert.equal(s.radio.last.silences, 2);
  assert.ok(!s.events.some((e) => e.type === 'line' && e.id === '04'), 'T1 silence skips line 04');
});
test('silence once in T2, then not telling: 29 -3 +6 +2 = 34', () => {
  const s = atT1(); answer(s.radio, 0); assert.equal(s.escuta.value, 29);
  keep(s.radio);                                      // T2, first silence: the voice repeats with 04b and T2 comes back with the same answers
  assert.equal(s.radio.conv.node, '04b'); assert.equal(s.escuta.value, 26);
  toAsk(s.radio); assert.equal(s.radio.view().ask.choices.length, 2);
  answer(s.radio, 1, 3.0); assert.equal(s.escuta.value, 32);
  toAsk(s.radio); const tem = transmitCost(s.radio.view().ask.choices[0].dur); answer(s.radio, 0); assert.equal(s.escuta.value, 32 + tem); assert.equal(s.escuta.value, 34, 'with the real recordings (the design said 36)');
});
test('silence once in T2, then telling, whole: 29 -3 +14 +10, with the line 07 (+6) 56', () => {
  const s = atT1(); answer(s.radio, 0); keep(s.radio);
  answer(s.radio, 0);                                 // telling: 7 s
  assert.equal(s.escuta.value, 50);
  answer(s.radio, 0);
  assert.equal(s.escuta.value, 56);
});
test('the careless one (46 in T2): silence once and then telling: 46 -3 +14 +10 +6 = 73', () => {
  const s = setup({ start: 35 }); begin(s.radio, 'operadora', 'n1-cena5'); answer(s.radio, 0); answer(s.radio, 0);
  assert.equal(s.escuta.value, 46); keep(s.radio); answer(s.radio, 0); answer(s.radio, 0);
  assert.equal(s.escuta.value, 73);
});
test('silence in the last turn (T3) ends the call and goes on to scene 6', () => {
  const s = atT1(); answer(s.radio, 0); answer(s.radio, 1, 3.0); keep(s.radio);
  assert.equal(s.radio.last.outcome, 'ended'); assert.equal(s.radio.last.silences, 1);
});

test('the mark: letting go before it is silence for the call, but the seconds count on the Escuta, without the "heard"', () => {
  const s = atT1(); answer(s.radio, 0);                      // 29, T2
  answer(s.radio, 0, 2.5);                                   // the "contar" cut at 2.5 s, before the mark (the end of the word "represa", marcas.json)
  assert.equal(s.escuta.value, 29 + 5 - 3, '+5 for the 2.5 s, -3 for the silence, no +10');
  assert.equal(s.flags.contou, undefined, 'the information did not get through');
  assert.equal(s.radio.conv.node, '04b'); assert.ok(!s.events.some((e) => e.type === 'heard'));
  toAsk(s.radio); answer(s.radio, 0, MARCAS['05'].mark + 0.3);                   // past the mark: the information goes, cut or not
  assert.equal(s.flags.contou, true); assert.ok(s.events.some((e) => e.type === 'heard'));
});

test('leaving the radio: a question with patience counts as silence and ends the call; a wait with no patience, or a line, only pauses', () => {
  // a question of the other voice (it has patience): leaving is silence, once, and the call ends
  const s = setup(); begin(s.radio, 'rede', 'demo'); toAsk(s.radio);
  s.radio.leave();
  assert.equal(s.radio.last.outcome, 'left'); assert.equal(s.escuta.value, 7); assert.equal(s.trust.get('neide'), 1);
  // the call nobody has answered yet (T0, no patience): it is not silence, it does not end and the scene does not move on
  const t = setup(); begin(t.radio, 'operadora', 'n1-cena5');
  assert.equal(t.radio.conv.phase, 'ask'); assert.equal(t.radio.view().ask.total, null, 'T0 waits with no patience');
  assert.equal(t.radio.busy, false, 'the dial is free until the other voice speaks');
  t.radio.leave(); assert.equal(t.escuta.value, 10); assert.equal(t.radio.last, null, 'no end event: the director has nothing to move on');
  assert.equal(t.radio.conv.phase, 'ask'); assert.equal(t.trust.get('neide'), 2);
  run(t.radio, 30); assert.equal(t.radio.conv.phase, 'ask', 'closed: no patience runs, nothing ends');
  t.radio.open(); assert.equal(t.radio.conv.phase, 'ask', 'the call is waiting when the radio opens again');
  // the dial is free in T0: tune away and come back, the call is still there; a held button that is let go by leaving counts its seconds only
  assert.equal(t.radio.tune(1), true); assert.notEqual(t.radio.channel.id, 'operadora'); t.radio.tuneTo('operadora'); assert.equal(t.radio.conv.node, 'chamar');
  t.radio.select(0); t.radio.transmit(true); run(t.radio, 1); t.radio.leave(); assert.equal(t.escuta.value, 12, 'the 1 s Jonas spoke counts, nothing is taken'); assert.equal(t.radio.last, null);
  // from the first line of the other voice on, the dial is locked
  t.radio.open(); toAsk(t.radio, 40); answer(t.radio, 0); run(t.radio, 0.5); assert.equal(t.radio.conv.phase, 'line'); assert.equal(t.radio.busy, true);
  const e0 = t.escuta.value; t.radio.leave(); assert.equal(t.escuta.value, e0); assert.equal(t.radio.conv.phase, 'line', 'during a line it only pauses');
});

test('a slip of the finger (under 0.25 s) transmits nothing; choosing does not transmit; the patience pauses while Jonas speaks', () => {
  const s = setup(); begin(s.radio, 'rede', 'demo'); toAsk(s.radio);
  s.radio.select(1); run(s.radio, 2); assert.equal(s.escuta.value, 10);
  s.radio.transmit(true); run(s.radio, 0.1); s.radio.transmit(false); assert.equal(s.escuta.value, 10);
  const left = s.radio.view().ask.left;
  s.radio.transmit(true); run(s.radio, 1); assert.equal(s.radio.view().ask.left, left, 'patience paused while speaking');
  s.radio.transmit(false); assert.equal(s.escuta.value, 12);
});

test('trust: a quick answer to Neide raises it, a long one lowers it, silence lowers it', () => {
  const s = setup(); begin(s.radio, 'rede', 'demo'); toAsk(s.radio);
  s.radio.select(0); run(s.radio, 1); s.radio.transmit(true); run(s.radio, 1.5); assert.equal(s.trust.get('neide'), 3);   // asked, answered after 1 s, 1.4 s long
  toAsk(s.radio); s.radio.select(1); s.radio.transmit(true); run(s.radio, 6); assert.equal(s.trust.get('neide'), 3, 'quick again, 5.5 s is not more than 6: the ceiling holds');
});
test('trust falls with silence and with a long answer', () => {
  const s = setup(); begin(s.radio, 'rede', 'demo'); toAsk(s.radio); keep(s.radio);
  assert.equal(s.trust.get('neide'), 1); assert.equal(s.escuta.value, 7);
  const t = setup({ conversations: { long: { start: 'a', nodes: { a: { kind: 'ask', who: 'neide', trust: 'neide', patience: 10, responses: [{ text: 'x', dur: 7, next: 'f' }] }, f: { kind: 'end' } } } } });
  begin(t.radio, 'rede', 'long'); t.radio.transmit(true); run(t.radio, 7.2); assert.equal(t.trust.get('neide'), 1, 'more than 6 s: she scolds');
});

test('the patience: the option "more patience" doubles it', () => {
  const a = setup(); begin(a.radio, 'rede', 'demo'); toAsk(a.radio);
  const b = setup({ options: { patience: true } }); begin(b.radio, 'rede', 'demo'); toAsk(b.radio);
  assert.equal(b.radio.view().ask.total, a.radio.view().ask.total * 2);
});

test('the dial: fixed channels, locked in a call, an unknown channel is skipped until known', () => {
  const s = setup(); s.radio.open();
  const seen = []; for (let i = 0; i < 5; i++) { seen.push(s.radio.channel.id); s.radio.tune(1); }
  assert.ok(!seen.includes('represa')); s.radio.know('represa'); s.radio.tuneTo('represa'); assert.equal(s.radio.channel.n, '47');
  s.radio.tuneTo('rede'); s.radio.offer('rede', 'demo'); s.radio.leave(); s.radio.open(); assert.equal(s.radio.busy, true); assert.equal(s.radio.tune(1), false);
});

test('the secrets are PBKDF2-SHA-256 with 200 000 iterations and a salt per kind, not a plain hash', async () => {
  assert.equal(ITERATIONS, 200000);
  assert.equal(normalize('  Pão,   com  café! '), 'PAO COM CAFE');
  // the hash is the PBKDF2 of the normalized text (node's own implementation as the reference), and it is the Web Crypto call that is made
  const sub = globalThis.crypto.subtle, real = sub.deriveBits.bind(sub), seen = [];
  sub.deriveBits = (alg, ...rest) => { seen.push(alg); return real(alg, ...rest); };
  let h; try { h = await hashOf('sal-de-teste', 'Pão com café'); } finally { delete sub.deriveBits; }
  assert.equal(h, pbkdf2Sync('PAO COM CAFE', 'sal-de-teste', 200000, 32, 'sha256').toString('hex'));
  assert.equal(seen.length, 1); assert.equal(seen[0].name, 'PBKDF2'); assert.equal(seen[0].hash, 'SHA-256'); assert.equal(seen[0].iterations, 200000);
  assert.notEqual(await hashOf('outro-sal', 'Pão com café'), h, 'the salt counts');
  assert.equal(await hashOf('sal-de-teste', '   '), '', 'nothing typed, nothing to check');
  for (const [kind, secret] of Object.entries(SECRETS)) assert.ok(secret.salt && secret.salt.includes(kind), `a salt of its own for ${kind}`);
});

test('the password field and the colour keyboard are checked by PBKDF2; three wrong tries and the keyboard goes dark', async () => {
  const salt = 'teste', secrets = { senha: { salt, hashes: [await hashOf(salt, 'CAFE COM LEITE')] }, cores: { salt, hashes: [await hashOf(salt, 'rosa ciano')] } };
  assert.equal(await check(secrets.senha, 'café  com leite'), true); assert.equal(await check(secrets.senha, 'cafe com pao'), false);
  const escuta = createEscuta(), flags = {};
  const radio = createRadio({ escuta, trust: createTrust(), flags, conversations: {}, channels: CHANNELS, secrets });
  assert.equal(await radio.submitPassword('errada'), false); assert.equal(flags.senha, undefined);
  assert.equal(await radio.submitPassword('Café com leite'), true); assert.equal(flags.senha, true);
  radio.open(); radio.tuneTo('manutencao'); assert.equal(radio.view().hasKeys, true);
  const send = async () => { radio.keySend(true); run(radio, 2.1); await radio.settle(); };
  for (let n = 1; n <= 3; n++) { radio.keyPress('ciano'); radio.keyPress('violeta'); await send(); assert.equal(radio.keys.errors, n); }
  assert.equal(escuta.value, 10 + 12, 'three tries: +4 each, at most +12'); assert.equal(radio.keys.locked, true);
  assert.equal(radio.keyPress('azul'), false);
  radio.resetNight(); assert.equal(radio.keys.locked, false); radio.keyPress('rosa'); radio.keyPress('ciano'); await send();
  assert.equal(radio.keys.solved, true); assert.equal(flags.cao, true); assert.equal(COLORS.length, 5);
});

test('the secrets of the game are kept only as hashes', () => {
  const text = readFileSync(new URL('../data/story/secrets.json', import.meta.url), 'utf8');
  assert.ok(!/[A-Za-z]{4,} [A-Za-z]{4,}/.test(text.replace(/"salt".*\n/g, '')), 'no readable answer in the data');
  for (const s of Object.values(SECRETS)) for (const h of s.hashes) assert.match(h, /^[0-9a-f]{64}$/);
});

test('the quick reaction: 1.2 s, 2.4 s with more time, always right when off, the first one with double time', () => {
  const ev = []; const o = {}; const q = createQuick({ options: o, emit: (e) => ev.push(e) });
  q.start({ id: 'a' }); assert.equal(q.view().total, 1.2); for (let t = 0; t < 1.3; t += DT) q.step(DT);
  assert.equal(ev.at(-1).hit, false);
  q.start({ id: 'b' }); q.step(0.5); q.press(); assert.equal(ev.at(-1).hit, true);
  o.quick = 'long'; q.start({ id: 'c' }); assert.equal(q.view().total, 2.4); q.cancel();
  q.start({ id: 'd', first: true }); assert.equal(q.view().total, 4.8); q.cancel();
  o.quick = 'off'; assert.equal(q.start({ id: 'e' }), false); assert.deepEqual([ev.at(-1).hit, ev.at(-1).auto], [true, true]);
});

test('the shots: a plane stays while Jonas is in its zone, then cuts', () => {
  const shots = [{ zone: { min: [0, 0], max: [4, 4] } }, { zone: { min: [4, 0], max: [8, 4] } }];
  assert.equal(pickShot(shots, [1, 1]), 0); assert.equal(pickShot(shots, [4.1, 1], 0), 0, 'a margin keeps the plane at the edge'); assert.equal(pickShot(shots, [5, 1], 0), 1);
  assert.equal(pickShot(shots, [20, 1]), 1, 'outside every zone: the nearest');
});

// ---- the director ------------------------------------------------------------------------------------------------------------------
test('the director: scenes of a night in data, a checkpoint at the start of each scene, the death returns to it', () => {
  const s = setup(); const quick = createQuick({ options: {}, emit: (e) => { s.events.push(e); director.event(e); } });
  const run = { night: 'demo', scene: 0, flags: {}, hurt: false };
  const log = { checkpoints: [], goals: [], said: [], started: [], ended: null };
  let saved = null;
  const director = createDirector({ nights: NIGHTS, scenes: SCENES, run, escuta: s.escuta, trust: s.trust, radio: s.radio, quick, hooks: {
    sceneStart: (sc) => log.started.push(sc.id), checkpoint: () => { saved = JSON.parse(JSON.stringify({ run, escuta: s.escuta.value })); log.checkpoints.push(run.scene); },
    goal: (t) => log.goals.push(t), say: (w, t) => log.said.push(t), nightEnd: (id, sum) => { log.ended = sum; }, closeRadio: () => s.radio.leave() } });
  s.radio.on = null;
  director.beginNight();
  assert.deepEqual(log.started, ['demo-1']); assert.equal(log.checkpoints.length, 1);
  director.update(DT, { pos: [5, 0] }); assert.equal(director.scene.id, 'demo-1');
  director.update(DT, { pos: [-4.9, -3.3] });                // reached the bench
  assert.ok(log.goals.some((g) => /canal 21/.test(g)));
  s.radio.open();                                            // the radio, with the conversation of the beat on the "rede" channel
  s.radio.tuneTo('rede');
  // play the demo call: quick answers, the long one with the mark
  const play = (i, sec) => { toAsk(s.radio); s.radio.select(i); s.radio.transmit(true); run2(sec); s.radio.transmit(false); };
  const run2 = (sec) => { for (let t = 0; t < sec; t += DT) s.radio.step(DT); };
  toAsk(s.radio); play(0, 1.5); toAsk(s.radio); play(1, 5.6);
  run2(6); s.events.filter((e) => e.type === 'end').forEach(() => {});
  for (const e of s.events.filter((e) => e.type === 'end')) director.event(e);
  assert.deepEqual(log.started, ['demo-1', 'demo-2'], 'the conversation ended: next scene'); assert.deepEqual(log.checkpoints, [0, 1]);
  assert.equal(s.flags.contouFarmacia, true);
  // the quick reaction: missed
  const before = s.escuta.value;
  for (let t = 0; t < 8; t += DT) { director.update(DT, { pos: [-4.9, -3] }); quick.step(DT); if (quick.active) break; }
  assert.ok(quick.active); for (let t = 0; t < 5; t += DT) quick.step(DT);
  assert.equal(s.escuta.value, before + 8); assert.equal(run.hurt, true);
  assert.ok(log.ended, 'the night ended'); assert.equal(log.ended.night, 'demo');
  // the death: back to the checkpoint of the scene (the saved run has the scene start)
  assert.equal(saved.run.scene, 1);
});

test('a limp lasts until the end of the night: beginNight clears run.hurt', () => {
  const s = setup();
  const nights = { 'noite-1': { numero: 1, cenas: ['a'] }, 'noite-2': { numero: 2, cenas: ['a'] } }, scenes = { a: { id: 'a', beats: [{ type: 'wait', dur: 99 }] } };
  const quick = createQuick({ options: {}, emit: () => {} });
  const run = { night: 'noite-1', scene: 0, flags: {}, hurt: false };
  const director = createDirector({ nights, scenes, run, escuta: s.escuta, trust: s.trust, radio: s.radio, quick, hooks: {} });
  director.beginNight(); run.hurt = true;
  director.update(DT, { pos: [0, 0] }); assert.equal(run.hurt, true, 'hurt during the night');
  run.night = 'noite-2'; director.beginNight(); assert.equal(run.hurt, false, 'the next night starts on both feet');
});

test('the Escuta read before transmitting is what a condition of the director reads (decision 4: 68 read, 75 after, "A rede acende", not "Ouvido")', () => {
  const d4 = { start: 'a', nodes: { a: { kind: 'ask', who: 'jonas', patience: null, read: 'd4', responses: [{ text: 'transmitir', dur: 3.5, gives: { tx4: true }, next: 'f' }] }, f: { kind: 'end' } } };
  const finals = [
    { id: 'Silêncio', if: { flag: 'tx4', is: false } },
    { id: 'Ouvido', if: { all: [{ flag: 'tx4' }, { any: [{ escutaRead: 'd4', gte: 70 }, { flag: 'posicao' }] }] } },
    { id: 'A rede acende', if: { all: [{ flag: 'tx4' }, { escutaRead: 'd4', lt: 70 }, { flag: 'posicao', is: false }] } },
  ];
  const finalOf = (s) => finals.find((f) => matches(f.if, { flags: s.flags, escuta: s.escuta }))?.id;
  const s = setup({ start: 68, conversations: { d4 } }); begin(s.radio, 'operadora', 'd4'); toAsk(s.radio);
  assert.equal(s.escuta.readOf('d4'), 68, 'read when the question opens');
  answer(s.radio, 0); assert.equal(s.escuta.value, 75, 'the transmission carried it to 75');
  assert.equal(s.escuta.readOf('d4'), 68, 'the stored reading does not move with the transmission');
  assert.equal(matches({ escuta: { gte: 70 } }, { flags: s.flags, escuta: s.escuta }), true, 'the live value alone would say 70 or more');
  assert.equal(matches({ escutaRead: 'd4', gte: 70 }, { flags: s.flags, escuta: s.escuta }), false);
  assert.equal(finalOf(s), 'A rede acende');
  // 70 read: Ouvido (the limit is "70 or more"); the position given: Ouvido at any reading; never read: no condition on it holds
  const u = setup({ start: 70, conversations: { d4 } }); begin(u.radio, 'operadora', 'd4'); answer(u.radio, 0); assert.equal(finalOf(u), 'Ouvido');
  const v = setup({ start: 30, conversations: { d4 } }); v.flags.posicao = true; begin(v.radio, 'operadora', 'd4'); answer(v.radio, 0); assert.equal(finalOf(v), 'Ouvido');
  assert.equal(matches({ escutaRead: 'nunca', gte: 0 }, { flags: {}, escuta: createEscuta() }), false);
});

// ---- phase B: the recordings, the street, the colours, the story in data ------------------------------------------------------------------------
import { createStreet, RULES as STREET_RULES } from '../src/systems/street.js';
import { flashColors, flashAt, FLASH } from '../src/systems/cores.js';
import { durOf } from '../src/systems/voicedata.js';
import { existsSync } from 'node:fs';

test('the lengths come from the recordings (durations.json), never from the conversations; a missing one is guessed from the text', () => {
  const raw = json('conversations.json');
  for (const conv of Object.values(raw)) for (const n of Object.values(conv.nodes)) { assert.equal(n.dur, conv.nodes === raw.demo?.nodes ? n.dur : n.dur, 'checked below'); }
  for (const id of ['n1-cena5', 'n1-chamada', 'n1-recado', 'n1-represa']) {
    for (const n of Object.values(raw[id].nodes)) { assert.equal(n.dur, undefined, `${id}: no length written in the data`); for (const r of n.responses ?? []) { assert.equal(r.dur, undefined); assert.equal(r.mark, undefined, 'the mark comes from marcas.json'); } }
  }
  const t2 = CONV['n1-cena5'].nodes.T2.responses[0];
  assert.equal(t2.dur, DURATIONS['05']); assert.equal(t2.mark, MARCAS['05'].mark); assert.ok(t2.mark > 1 && t2.mark < t2.dur, 'the mark is inside the recording');
  assert.equal(CONV['n1-chamada'].nodes.c03.dur, DURATIONS.c03);
  assert.equal(durOf('does-not-exist', DURATIONS, 'a text of twenty chars'), Math.max(1, 22 * 0.07));
  const cut = MARCAS['08'].cutFrom; assert.ok(cut > 0 && cut < DURATIONS['08'], 'the cut of line 08 is inside the recording');
});

test('every voice the story names exists as a recording with a length', () => {
  const ids = new Set();
  for (const conv of Object.values(json('conversations.json'))) for (const n of Object.values(conv.nodes)) { if (n.voice) ids.add(n.voice); for (const r of n.responses ?? []) if (r.voice) ids.add(r.voice); }
  for (const sc of Object.values(SCENES)) { for (const b of sc.beats ?? []) { if (b.voice) ids.add(b.voice); for (const l of b.lines ?? []) if (l.voice) ids.add(l.voice); } for (const p of sc.points ?? []) if (p.say?.voice) ids.add(p.say.voice); }
  for (const l of json('falas-noite1.json').lines) if (/^s0/.test(l.id)) ids.add(l.id);          // Tânia's, said by the street
  for (const id of ids) { assert.ok(DURATIONS[id] > 0, `${id} has no length (is the mp3 there and readable? node tools/voice/durations.mjs)`); }
  assert.ok(ids.size > 30);
});

test('the six scenes of the night 1 are in data, playable (no marker left): every beat is of a type the director knows, every point of a beat exists', () => {
  const KNOWN = new Set(['goal', 'say', 'wait', 'reach', 'use', 'await', 'radio', 'quick', 'escuta', 'flag', 'pocket', 'thing', 'light', 'sfx', 'blink', 'cutscene', 'tune', 'know', 'end']);
  assert.deepEqual(NIGHTS['noite-1'].cenas, ['n1-cidade', 'n1-bomba', 'n1-chamada', 'n1-saida', 'n1-radio', 'n1-corte']);
  for (const id of NIGHTS['noite-1'].cenas) {
    const sc = SCENES[id]; assert.ok(!sc.pendente, `${id} is still a marker`); assert.ok(sc.beats.length > 2 && sc.beats.at(-1).type === 'end' || sc.beats.some((b) => b.type === 'cutscene'), id);
    const pts = new Set((sc.points ?? []).map((p) => p.id));
    for (const b of sc.beats) {
      assert.ok(KNOWN.has(b.type), `${id}: unknown beat ${b.type}`);
      if (b.type === 'use') for (const p of [].concat(b.point)) assert.ok(pts.has(p), `${id}: no point ${p}`);
      if (b.type === 'reach' || b.type === 'radio') assert.ok(pts.has(b.point), `${id}: no point ${b.point}`);
      if (b.type === 'radio') assert.ok(CONV[b.conversation], `${id}: no conversation ${b.conversation}`);
      if (b.type === 'await' && b.marker) assert.ok(pts.has(b.marker));
    }
  }
  // the spawn of a scene is outside every collider that matters: at least the zones of its shots cover it
  for (const id of NIGHTS['noite-1'].cenas) { const sc = SCENES[id]; if (!sc.shots?.[0]?.zone) continue; assert.ok(pickShot(sc.shots, sc.spawn.pos) >= 0); }
});

test('the broken dog blinks eight colours, 0.75 s each, three times, then the battery is done; what it blinks is what the keyboard accepts (S3)', async () => {
  const seq = flashColors();
  assert.equal(seq.length, 8);
  assert.ok(seq.every((c) => COLORS.some((x) => x.id === c)));
  assert.ok(await check(SECRETS.cores, seq.join(' ')), 'the radio keyboard accepts the sequence the dog blinks (PBKDF2, salt sinal-de-vida/cores/v2)');
  // the sensor shows each colour for most of its 0.75 s, in order, and a short dark between two (so that two equal colours read as two)
  const shown = []; for (let i = 0; i < 8; i++) shown.push(flashAt(i * FLASH.each + 0.2)?.id);
  assert.deepEqual(shown, seq);
  assert.equal(flashAt(i8(0.7)), null, 'a short dark at the end of a colour'); assert.equal(flashAt(8 * FLASH.each + 0.3), null, 'a pause between the cycles');
  assert.ok(flashAt(0.2).power > flashAt(8 * FLASH.each + FLASH.gap + 0.2).power, 'the battery fades from one cycle to the next');
  assert.equal(flashAt((8 * FLASH.each + FLASH.gap) * FLASH.cycles + 0.1), null, 'then it is dark for good');
  assert.equal(8 * FLASH.each, 6, 'the video shows it for 6 s');
});
const i8 = (u) => u;

/** The guard of the secrets: no window of words of the repository is the answer of S1 or S3. The repository must not hold the answer in clear, not even to forbid it,
 *  so the guard holds only 12 bits of a salted hash of each answer (a prefilter that says nothing about the words); the windows that pass the prefilter are
 *  then checked against the real PBKDF2 hashes of data/story/secrets.json. `n` is how many words long the answer is. */
const GUARD = [{ kind: 'senha', n: 3, pre: ['088', '43d'] }, { kind: 'cores', n: 8, pre: ['a2f'] }];
const fastPre = (words) => createHash('sha256').update(`guarda|${words.join(' ')}`).digest('hex').slice(0, 3);
const wordsOf = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z]+/g) ?? [];
async function scanForSecrets(text) {
  const w = wordsOf(text), found = [];
  for (const g of GUARD) {
    const seen = new Set();
    for (let i = 0; i + g.n <= w.length; i++) {
      const win = w.slice(i, i + g.n); if (!g.pre.includes(fastPre(win))) continue;
      const key = win.join(' '); if (seen.has(key)) continue; seen.add(key);
      if (await check(SECRETS[g.kind], key)) found.push(g.kind);
    }
  }
  return found;
}
const repoFiles = () => {
  const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) { if (f.name === 'vendor' || f.name === 'node_modules' || f.name === 'models') continue; const rel = `${dir}${f.name}`; if (f.isDirectory()) walk(`${rel}/`, out); else if (/\.(js|mjs|json|md|html|css|py)$/.test(f.name) && !/\.glb\./.test(f.name)) out.push(rel); } return out; };
  return [...walk('../src/'), ...walk('../data/story/'), ...walk('./'), ...walk('../tools/').filter((f) => !/models|city|textures/.test(f)), '../README.md'];
};
test('the guard finds an answer when it is there (the prefilter and the PBKDF2 check agree), and does not when it is not', async () => {
  // the candidates the guard is built for are only the ones that pass the prefilter: it is a real prefilter (12 bits), not the answer
  assert.ok(GUARD.every((g) => g.pre.every((p) => /^[0-9a-f]{3}$/.test(p))));
  // a window that passes the prefilter but is not an answer is dropped by the real check: scan a made-up text for a hundred thousand random windows
  const rnd = mulberry32(4); const noise = Array.from({ length: 6000 }, () => 'ABCDEFGHJKLMNP'[Math.floor(rnd() * 14)] + 'XYZ'[Math.floor(rnd() * 3)]).join(' ');
  assert.deepEqual(await scanForSecrets(noise), []);
  // the way it works: a window that the real hash accepts is found (the answers of the data are compared by the very check the radio uses, so a custom secret proves the path)
  const salt = 'guarda-teste', win = ['PAO', 'COM', 'CAFE'];
  SECRETS.__t = { salt, hashes: [await hashOf(salt, win.join(' '))] }; GUARD.push({ kind: '__t', n: 3, pre: [fastPre(win)] });
  try { assert.deepEqual(await scanForSecrets('um pão com café quente'), ['__t']); assert.deepEqual(await scanForSecrets('um pão sem café'), []); }
  finally { GUARD.pop(); delete SECRETS.__t; }
});
test('nothing of the answers of S1 or S3 is written in the repository (src, data, test, tools, README): no window of words hashes to them, and no three colour names in a row', async () => {
  const names = COLORS.map((c) => c.id);
  for (const f of repoFiles()) {
    const raw = readFileSync(new URL(f, import.meta.url), 'utf8'), text = raw.toLowerCase();
    // the three colours in a row (the sequence in words) never appear together outside the colour table itself
    const row = new RegExp(`(?:${names.join('|')})[\\s,"'\\-]+(?:${names.join('|')})[\\s,"'\\-]+(?:${names.join('|')})`);
    if (!/radio\.js$/.test(f)) assert.ok(!row.test(text), `${f}: three colour names in a row`);
    assert.deepEqual(await scanForSecrets(raw), [], `${f}: holds an answer`);
    // no two colours that are neighbours in the real sequence either (a vector of ids in a test is as good as the words): the pairs come from the generator, never written here
    const seq = flashColors(), sep = `[\\s,"'\\[\\]\\-]+`;
    for (let i = 0; i + 1 < seq.length; i++) assert.ok(!new RegExp(`${seq[i]}${sep}${seq[i + 1]}(?![a-z])`).test(text), `${f}: two neighbouring colours of the sequence`);
  }
});

test('the street: the noise of Jonas makes a calm dog suspicious (+5 once), running near a dog is +3 once per bout, the voice of Tânia only with the hand radio on and trust 2 or 3', () => {
  const escuta = createEscuta({ value: 10 }), s = createStreet({ escuta, durOf: () => 3 });
  const here = { pos: [0, 0], run: false, crouch: false };
  const upd = (dt, o = {}) => s.update(dt, { player: here, dogs: [], ...o });
  // a dog that was calm hears a step of Jonas's and turns suspicious
  upd(0.1, { dogs: [{ id: 'd', state: 'calm', pos: [5, 0] }] });
  s.noise({ pos: [0, 0], loud: 0.22, kind: 'step', src: 'jonas' });
  const ev = upd(0.1, { dogs: [{ id: 'd', state: 'suspicious', pos: [5, 0] }] });
  assert.equal(escuta.value, 15); assert.ok(ev.some((e) => e.type === 'heard-by-dog'));
  // the decoy's noise and a fall are not his: no +5
  upd(0.1, { dogs: [{ id: 'e', state: 'calm', pos: [5, 0] }] }); s.noise({ pos: [8, 0], loud: 0.5, kind: 'isca' });
  upd(0.1, { dogs: [{ id: 'e', state: 'suspicious', pos: [5, 0] }] }); assert.equal(escuta.value, 15);
  // running within 15 m of a dog: +3 once, not again while he keeps running
  const run = { pos: [0, 0], run: true, crouch: false };
  s.update(0.1, { player: run, dogs: [{ id: 'f', state: 'calm', pos: [10, 0] }] }); assert.equal(escuta.value, 18);
  for (let i = 0; i < 20; i++) s.update(0.1, { player: run, dogs: [{ id: 'f', state: 'calm', pos: [10, 0] }] });
  assert.equal(escuta.value, 18, 'once for the whole bout');
  for (let i = 0; i < 20; i++) s.update(0.1, { player: here, dogs: [] });
  s.update(0.1, { player: run, dogs: [{ id: 'f', state: 'calm', pos: [10, 0] }] }); assert.equal(escuta.value, 21, 'a new bout counts again');
  // far from every dog, running is free
  const e2 = createEscuta({ value: 10 }), s2 = createStreet({ escuta: e2 }); s2.update(0.1, { player: run, dogs: [{ id: 'g', state: 'calm', pos: [40, 0] }] }); assert.equal(e2.value, 10);
  // Tânia: nothing with the radio off or without trust; with it on, in order
  const q = (o) => { const e = createEscuta(), z = createStreet({ escuta: e, durOf: () => 1 }); const out = []; for (let i = 0; i < 40; i++) out.push(...z.update(0.1, { player: here, dogs: [{ id: 'd', state: 'calm', pos: [30, 0] }], ...o })); return out.filter((x) => x.type === 'say').map((x) => x.id); };
  assert.deepEqual(q({ handRadio: false }), []); assert.deepEqual(q({ handRadio: true, trustTania: 1 }), []);
  assert.deepEqual(q({ handRadio: true, trustTania: 2 }), ['s01']);
});

test('the splice: held next to the cut, a reaction at the middle with the dog coming, then it goes on to the end; letting go keeps what was done', () => {
  const s = createStreet({ escuta: createEscuta(), durOf: () => 1 });
  let w = s.work(1, true); assert.ok(w.progress > 0.2 && w.state === 'idle');
  w = s.work(1, false); assert.equal(w.progress, s.splice.progress, 'let go: nothing lost, nothing gained');
  const before = w.progress; s.work(1, true);
  const evs = s.take(); assert.ok(s.splice.progress >= STREET_RULES.quickAt && s.splice.state === 'quick' && evs.some((e) => e.type === 'splice-quick'), 'the reaction asks at 45 per cent');
  const frozen = s.splice.progress; s.work(1, true); assert.equal(s.splice.progress, frozen, 'it waits for the answer');
  s.resolveQuick(true); assert.equal(s.splice.state, 'resumed');
  for (let i = 0; i < 10; i++) s.work(0.5, true);
  assert.equal(s.splice.state, 'done'); assert.ok(s.take().some((e) => e.type === 'spliced')); assert.ok(before < STREET_RULES.quickAt);
});

test('the director: await waits for a signal of the game (and one that came first is not lost), use of several points with `all`, a beat with a condition on the hand radio', () => {
  const s = setup(); const run = { night: 'noite-1', scene: 0, flags: {}, pocket: [], hurt: false, choices: [] }; const log = []; let hand = false;
  const scenes = { a: { id: 'a', points: [{ id: 'p', pos: [0, 0] }, { id: 'q', pos: [1, 1] }], beats: [
    { type: 'await', event: 'light' }, { type: 'use', point: ['p', 'q'], all: true }, { type: 'say', who: 'x', text: 'on', voice: 'v1', if: { handRadio: true } }, { type: 'say', who: 'x', text: 'off', voice: 'v2', if: { handRadio: false } }, { type: 'await', event: 'late' }, { type: 'end' }] } };
  const director = createDirector({ nights: { 'noite-1': { numero: 1, cenas: ['a'] } }, scenes, run, escuta: s.escuta, trust: s.trust, radio: s.radio, quick: createQuick({}), hooks: { say: (who, text, d, v) => log.push([text, d, v]), voiceDur: (v) => (v === 'v2' ? 4.5 : 1), handRadio: () => hand, nightEnd: () => log.push('end') } });
  director.beginNight(); assert.equal(director.waitName, 'light');
  director.signal('late');                                  // too early: remembered
  assert.equal(director.use('p'), false, 'not waiting for a use yet');
  assert.ok(director.signal('light')); assert.equal(director.use('p'), true); assert.equal(director.waitName, null, 'one of two: still waiting');
  director.use('q');
  assert.deepEqual(log.slice(0, 1), [['off', 4.5, 'v2']], 'the line with the hand radio off, its length from the recording');
  director.update(0.1, {}); assert.ok(log.includes('end'), 'the signal that came first was kept');
});

test('the radio: silence in the last turn ends the talk with the voice still on the air (ended), the second silence of T1/T2 drops it (dropped, chamadaAcabou)', () => {
  const a = setup(); begin(a.radio, 'operadora', 'n1-cena5'); answer(a.radio, 0); keep(a.radio); keep(a.radio);
  assert.equal(a.radio.last.outcome, 'dropped'); assert.equal(a.flags.chamadaAcabou, true);
  const b = setup(); begin(b.radio, 'operadora', 'n1-cena5'); answer(b.radio, 0); answer(b.radio, 0); keep(b.radio);      // once in T2
  answer(b.radio, 1, 3.0); keep(b.radio);                                                                              // not telling, then silent in T3
  assert.equal(b.radio.last.outcome, 'ended'); assert.equal(b.flags.chamadaAcabou, undefined, 'the call is still on the air for the cut of scene 6');
});

test('the chamada of 22h: two questions, the decision 1 comes out of what is said, the farewell ends it', () => {
  const s = setup(); begin(s.radio, 'rede', 'n1-chamada');
  answer(s.radio, 1);                                     // the long answer to Neide
  answer(s.radio, 0);                                     // "Vou agora."
  finish(s.radio); assert.equal(s.flags.saiAgora, true); assert.equal(s.radio.last.outcome, 'ok');
  const t = setup(); begin(t.radio, 'rede', 'n1-chamada'); answer(t.radio, 0); answer(t.radio, 1);
  finish(t.radio);
  assert.equal(t.flags.saiAgora, false); assert.equal(t.radio.last.outcome, 'ok');
  assert.ok(t.events.some((e) => e.type === 'line' && e.id === 'c06'), 'the call ends with "Escutamos. Respondemos."');
});

test('the farewell "Escutamos. Respondemos." also plays when the call dropped by two silences (the network says goodbye to everyone), and then it counts as dropped, "wait"', () => {
  const u = setup(); begin(u.radio, 'rede', 'n1-chamada'); keep(u.radio); keep(u.radio);       // silent in Q1 and in Q2: the call drops
  assert.equal(u.flags.saiAgora, false);
  assert.equal(u.radio.conv.node, 'c06', 'the farewell is next');
  assert.ok(u.events.some((e) => e.type === 'line' && e.id === 'c06'), 'the line of the farewell was said');
  finish(u.radio);
  assert.equal(u.radio.last.outcome, 'dropped'); assert.equal(u.radio.last.silences, 2);
  assert.equal(u.escuta.value, 10 - 3 - 3, 'two silences: -3 each');
  // leaving the radio in the middle of a question is not the same: no farewell
  const v = setup(); begin(v.radio, 'rede', 'n1-chamada'); toAsk(v.radio); v.radio.leave();
  assert.ok(!v.events.some((e) => e.type === 'line' && e.id === 'c06'));
});

test('no "tell" branch, silence in T3 with the Escuta at 50 or more: the call is still on the air and the cut plays only the second sentence of the line 08', () => {
  const beats = SCENES['n1-corte'].beats.filter((b) => b.type === 'cutscene' && b.lines?.some((l) => l.voice === '08'));
  const s = setup({ start: 46 });                          // the careless one, at T1
  begin(s.radio, 'operadora', 'n1-cena5'); answer(s.radio, 0); answer(s.radio, 0); answer(s.radio, 1); keep(s.radio);      // not telling, silent in T3
  assert.equal(s.radio.last.outcome, 'ended'); assert.equal(s.flags.contou, false); assert.ok(s.flags.chamadaAcabou !== true);
  assert.ok(s.escuta.value >= 50);
  const ctx = { flags: s.flags, escuta: s.escuta, handRadio: false };
  const plays = beats.filter((b) => matches(b.if, ctx));
  assert.equal(plays.length, 1); assert.equal(plays[0].lines[0].from, '@08.cutFrom', 'only the second sentence');
  // telling and then silent in T3 plays the whole line
  const t = setup({ start: 46 }); begin(t.radio, 'operadora', 'n1-cena5'); answer(t.radio, 0); answer(t.radio, 0); answer(t.radio, 0, 7.1); keep(t.radio);
  assert.equal(t.flags.contou, true);
  const whole = beats.filter((b) => matches(b.if, { flags: { ...t.flags }, escuta: createEscuta({ value: 70 }), handRadio: false }));
  assert.equal(whole.length, 1); assert.equal(whole[0].lines[0].from, undefined, 'the whole line');
});

test('the cut with the Escuta under 50: the dog passing far away is in the picture (its path crosses the view of the last shot)', () => {
  const b = SCENES['n1-corte'].beats.find((x) => x.noJonas), sh = b.shots[0], a = b.actors[0];
  // the camera at the end of the shot looks from `eye2` to `at2`; the dog at the end of its walk must be inside the view cone (fov 70 vertical, 16:9)
  const eye = sh.eye2, at = sh.at2, tEnd = b.plan[0].dur, k = Math.max(0, Math.min(1, (tEnd - a.t0) / (a.t1 - a.t0))), end = [a.from[0] + (a.to[0] - a.from[0]) * k, 0.4, a.from[1] + (a.to[1] - a.from[1]) * k];
  const f = at.map((v, i) => v - eye[i]), d = end.map((v, i) => v - eye[i]), n = (v) => Math.hypot(...v);
  const cos = (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / (n(f) * n(d));
  assert.ok(Math.acos(cos) < (sh.fov / 2) * Math.PI / 180 * 1.2, 'the dog is inside the view at the end of the shot');
  assert.ok(n(d) < 9, 'near enough to be seen well (a few metres, not thirteen)');
  assert.ok(b.actors[0].t0 < 1, 'it is already walking in the first second');
});
