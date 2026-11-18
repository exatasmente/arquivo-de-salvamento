// The radio at the bench: no window over the scene. Jonas sits at the radio of the station (the piece of models/props/radio.js on the bench),
// takes the microphone off its hook and the camera goes to the panel; each thing the person does is a thing Jonas does, with its animation
// (models/jonas.js), and the state is read on the radio itself: the pointer on the scale, the number and the letters on the display, the
// TX and RX lights, the needle of the meter, the keys that sink, the colour buttons and the row of eight lights.
// The rules are the radio core's (src/systems/radio.js, which only emits events and gives `view()`); this only shows them and sends it what the
// person does. What stays over the picture is only: the lines of text at the bottom (what the voice says and the answers, with no box), and
// the Falar button (the one you hold with the thumb). The hint, the Reagir, the "foi ouvido" and the Escuta bar are the HUD's (src/ui.js).
//
// Everything runs in steps of 1/60 s (the game's step, or the tests'), so a gesture is at the same place whatever the frame rate.
import { KEY_LETTERS, KEY_LABELS } from './models/props/radio.js';
import { JONAS_MARKS, RADIO_SEAT } from './models/jonas.js';
import { esc } from './ui.js';

const STEP = 1 / 60;
const WHO = { neide: 'Dona Neide', tania: 'Tânia', operadora: 'A operadora', jonas: 'Jonas', voz: 'Uma voz' };
const BLIP = { neide: 250, tania: 380, operadora: 320, jonas: 190, voz: 280 };
const PANEL = [0, Math.sin((15 * Math.PI) / 180), Math.cos((15 * Math.PI) / 180)];     // the panel leans back 15 degrees: this is where it faces
const MULTI_TAP = 1.0;               // seconds: a second press of the same key within this turns its letter (as on an old phone)
const PW_MAX = 40;
/** What each of the twelve keys types, by turns: its letters, then its digit (the star erases, the hash sends). */
export const KEY_TYPES = KEY_LABELS.map((d, i) => (i === 9 || i === 11 ? [] : i === 10 ? [' ', '0'] : [...KEY_LETTERS[i].split(''), d]));
const KEY_OF = {};       // a typed character -> the key that has it
KEY_TYPES.forEach((list, i) => { for (const ch of list) KEY_OF[ch] ??= i; });

export function createDesk({ r, root, audio, ui, body, getRadio, getWorld, getPlayer, options, input, device = () => 'keyboard' }) {
  const T = r.THREE;
  // ---- the two things over the picture ------------------------------------------------------------------------------------------
  const lines = document.createElement('div'); lines.id = 'radio-lines'; lines.hidden = true;
  lines.innerHTML = '<div class="who"></div><div class="say"></div><div class="ch"></div>';
  const talk = document.createElement('button'); talk.id = 'hud-talk'; talk.type = 'button'; talk.hidden = true; talk.innerHTML = 'Falar<small>segure</small>'; talk.setAttribute('aria-label', 'Falar (segure)');
  root.append(lines, talk);
  const E = { who: lines.querySelector('.who'), say: lines.querySelector('.say'), ch: lines.querySelector('.ch') };
  const D = {
    phase: 'off',              // off | sit (taking the microphone) | on | bye (hanging it back)
    t: 0, clock: 0, ent: null, prop: null, root: null, seat: null, plane: 'painel', planeAt: 0,
    n: 0, gest: null, talking: false, talkBtn: false, pw: null, pwMsg: '', pwMsgUntil: 0, pwBusy: false, shown: null, tuneTo: null, tuneDir: 1,
    later: [], chiado: null, blipAt: 0, cursor: 0, colorCursor: 0, lastDisplay: '', lastSeq: '', lastLit: null, sig: '', capture: null, mic: false, dialAt: null,
  };
  const U = () => (body.height ?? 1.78) / 1.79;
  const dur = (n) => body.duration?.(n) ?? JONAS_MARKS[n]?.dur ?? 1;
  const later = (sec, fn) => D.later.push({ at: D.clock + sec, fn });

  // ---- where Jonas sits --------------------------------------------------------------------------------------------------------
  /** Jonas's root for a radio at `p` turned `yaw`: the radio stands RADIO_SEAT in front of him (his own axes, times his scale). */
  function seatOf(p, yaw) {
    const k = U(), sx = RADIO_SEAT[0] * k, sz = RADIO_SEAT[2] * k, c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: p.x - (sx * c + sz * s), y: p.y - RADIO_SEAT[1] * k, z: p.z - (-sx * s + sz * c), yaw };
  }
  function find(id) {
    const w = getWorld(); const m = w?.sc?.ents?.made?.[id];
    return m?.radioProp ? m : null;
  }

  // ---- opening and leaving ------------------------------------------------------------------------------------------------------
  function open(entityId = 'radio-bancada') {
    if (D.phase !== 'off') return false;
    const m = find(entityId); if (!m) return false;
    D.ent = entityId; D.prop = m.radioProp; D.root = m.root;
    m.root.updateWorldMatrix(true, false);
    const p = new T.Vector3().setFromMatrixPosition(m.root.matrixWorld);
    D.seat = seatOf(p, m.root.rotation.y);
    D.phase = 'sit'; D.t = 0; D.mic = false; D.tuneTo = null; D.gest = null; D.talking = false; D.pw = null; D.pwMsg = ''; D.plane = 'painel'; D.later = []; D.lastDisplay = ''; D.lastSeq = ''; D.lastLit = null; D.sig = '';
    D.shown = getRadio().view().channelN; D.prop.setDial(Number(D.shown) || 21, { now: true }); D.prop.setLed('tx', 0); D.prop.setLed('rx', 0.2); D.prop.setVu(0); D.prop.setPtt(0);
    D.chiado = audio.start('chiado', { gain: 0.12 });
    audio.play('radio-tx', { gain: 0.3 });
    place(); pose(); sync(); D.prop.settle?.();
    return true;
  }
  /** Gets up: the radio's core leaves first (a question with patience counts as silence), then Jonas hangs the microphone and stands. */
  function leave() {
    if (D.phase !== 'on') { if (D.phase === 'sit') reset(); return; }
    closePw();
    press(false);
    getRadio().leave();
    D.phase = 'bye'; D.t = 0; D.gest = null; D.talkBtn = false;
    audio.play('radio-solta', { gain: 0.5 });
  }
  /** At once, with nothing played (a new game, the title): the microphone back on its hook, the person back to walking. */
  function reset() {
    if (D.phase === 'off') return;
    closePw(); D.prop?.micTo('hook', null, { now: true }); D.prop?.setLed('tx', 0); D.prop?.setPtt(0); D.prop?.settle?.();
    D.chiado?.stop(); D.chiado = null; D.phase = 'off'; D.talking = false; D.talkBtn = false; D.later = []; D.tuneTo = null;
    lines.hidden = true; talk.hidden = true; D.sig = '';
  }
  function finish() { D.chiado?.stop(); D.chiado = null; D.phase = 'off'; lines.hidden = true; talk.hidden = true; D.sig = ''; D.gest = null; }

  // ---- what Jonas is doing ------------------------------------------------------------------------------------------------------
  const speech = (t) => Math.abs(Math.sin(t * 9.1)) * Math.abs(Math.sin(t * 5.3 + 1)) * (0.65 + 0.35 * Math.sin(t * 2.3));
  function pose() {
    const t = D.clock;
    let action, extra = {};
    if (D.phase === 'sit') action = 'radio_pegar_mic';
    else if (D.phase === 'bye') action = 'radio_pendurar';
    else {
      const base = D.talking ? 'radio_falar' : 'radio_esperar';
      const g = D.gest;
      if (g && g.at < dur(g.name) + 0.04) { action = g.name; extra = { base, key: g.key, color: g.color, dir: g.dir }; }
      else action = base;
    }
    const player = getPlayer();
    body.update(STEP, { action, at: D.phase === 'on' ? undefined : D.t, n: D.n, ...extra, mouth: D.talking ? speech(D.clock) : null, lamp: player.light ? 'on' : 'off', gaze: { x: 0, y: -0.12 }, t });
  }
  function place() {
    const s = D.seat; body.root.position.set(s.x, s.y, s.z); body.root.rotation.y = s.yaw;
  }
  function gesture(name, o = {}) { D.gest = { name, at: 0, ...o }; D.n++; }

  // ---- the radio piece ----------------------------------------------------------------------------------------------------------
  function sync() {
    const rad = getRadio(), v = rad.view(), prop = D.prop, t = D.clock;
    if (!prop) return;
    // a channel changed by the story (a call that tunes it for him): the pointer goes there
    if (!D.tuneTo && v.channelN !== D.shown) { D.shown = v.channelN; prop.setDial(Number(v.channelN) || 21); }
    // the lights and the needle
    const rx = v.line ? 1 : v.ask && v.ask.total ? Math.max(0, v.ask.left / v.ask.total) : v.ask ? 1 : v.phase === 'idle' || v.phase === 'ended' ? 0.12 : 0.5;
    prop.setLed('tx', D.talking ? 1 : 0); prop.setLed('rx', rx); prop.setPtt(D.talking ? 1 : 0);
    const env = speech(t);
    prop.setVu(D.talking ? 0.3 + 0.62 * env : v.line ? 0.12 + 0.4 * env : 0.04 + 0.03 * Math.sin(t * 3));
    // the colour buttons and the row of lights (the keys channel)
    const keysMode = inKeys(v), lit = keysMode && !v.keys.locked;
    if (D.lastLit !== lit) { D.lastLit = lit; for (let i = 0; i < 5; i++) prop.setColorLit(i, lit); }
    const ids = rad.COLORS.map((c) => c.id), seq = v.keys ? v.keys.seq.map((c) => ids.indexOf(c)) : [];
    const sig = seq.join(',');
    if (sig !== D.lastSeq) { D.lastSeq = sig; prop.setSeq(seq); }
    // the display
    const txt = displayText(v);
    if (txt !== D.lastDisplay) { D.lastDisplay = txt; prop.setDisplay(txt); }
    prop.update(STEP);
  }
  const inKeys = (v) => Boolean(v.hasKeys && v.keys && !v.ask && !v.line);
  function displayText(v) {
    const n = v.channelN ?? '--';
    let r1 = `CANAL ${D.tuneTo ? '--' : n}`, r2 = '';
    if (D.tuneTo) return `${r1}\n`;
    if (D.pw) {
      const tail = D.pw.text.slice(-9), cur = Math.floor(D.clock * 2) % 2 ? '_' : ' ';
      r2 = `SENHA:${tail}${cur}`;
      if (device() === 'gamepad') r1 = `${r1}`.padEnd(12) + `[${KEY_LABELS[D.cursor]}]`;
    } else if (D.pwMsgUntil > D.clock) r2 = D.pwMsg;
    else if (D.talking) r2 = 'TRANSMITINDO';
    else if (pwBlinks(v)) r2 = pwBlinkOn() ? 'SENHA DA REDE:' : '';
    else if (inKeys(v)) r2 = v.keys.locked ? 'TECLADO APAGADO' : v.keys.msg ? v.keys.msg.toUpperCase() : `COR: ${v.keys.seq.length ? v.keys.seq.length + '/8 ' : ''}${activeColor(v)}`;
    else r2 = (v.channelName ?? '').toUpperCase().slice(0, 16);
    return `${r1}\n${r2}`;
  }
  /** The field of the password blinks on the channel of the dam once the story has turned it on. Slow and fixed (a text that swaps, no flash of light): 1 s on and 1 s off, 1.5 s each with "reduce flashes". */
  const pwBlinks = (v) => Boolean(v.password?.blink && !v.password.ok && v.channel === 'represa' && !v.ask && !v.line);
  const pwBlinkOn = () => { const half = options.flashes ? 1.5 : 1.0; return Math.floor(D.clock / half) % 2 === 0; };
  const activeColor = (v) => (getRadio().COLORS[D.colorCursor]?.label ?? '');

  // ---- the keypad: the password -------------------------------------------------------------------------------------------------
  function openPw() {
    if (D.pw || D.phase !== 'on') return;
    D.pw = { text: '', last: null }; D.cursor = 4;
    input.capture(true);
    D.capture = (e) => typed(e); document.addEventListener('keydown', D.capture, true);
    audio.play('ui-move', { gain: 0.4 });
  }
  function closePw() {
    if (!D.pw) return;
    D.pw = null; input.capture(false);
    if (D.capture) { document.removeEventListener('keydown', D.capture, true); D.capture = null; }
  }
  /** The keyboard of the computer while the password is open: the letters go straight in (and the key that has them sinks). */
  function typed(e) {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); closePw(); return; }
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); pressKey(9); return; }
    if (e.key.length === 1 && /[\p{L}0-9 ]/u.test(e.key)) {
      e.preventDefault();
      const ch = e.key.toUpperCase(), k = KEY_OF[ch.normalize('NFD').replace(/[̀-ͯ]/g, '')];
      if (k !== undefined) pressKey(k, { ch });
    }
  }
  /** A finger on key `i` of the radio: Jonas presses it, and at the moment it is down the display answers. */
  function pressKey(i, { ch = null } = {}) {
    if (D.phase !== 'on') return;
    const rad = getRadio(), v = rad.view();
    if (inKeys(v)) {                                   // the colour keyboard: the star erases, the other keys only sink
      gesture('radio_tecla', { key: i });
      later(JONAS_MARKS.radio_tecla.press, () => { D.prop.pressKey(i); if (i === 9) { rad.keyErase(); audio.play('ui-move', { gain: 0.4 }); } });
      return;
    }
    if (!D.pw) openPw();
    gesture('radio_tecla', { key: i });
    later(JONAS_MARKS.radio_tecla.press, () => {
      const p = D.pw; if (!p) return;
      D.prop.pressKey(i);
      if (i === 11) { submit(); return; }
      audio.play('ui-move', { gain: 0.5 });
      if (i === 9) { if (!p.text) { closePw(); return; } p.text = p.text.slice(0, -1); p.last = null; return; }      // the star erases; on an empty field it puts the keypad away
      if (ch) { if (p.text.length < PW_MAX) p.text += ch; p.last = null; return; }
      const cycle = KEY_TYPES[i], same = p.last && p.last.key === i && D.clock - p.last.at < MULTI_TAP;
      if (same) { const c = (p.last.c + 1) % cycle.length; p.text = p.text.slice(0, -1) + cycle[c]; p.last = { key: i, c, at: D.clock }; }
      else if (p.text.length < PW_MAX) { p.text += cycle[0]; p.last = { key: i, c: 0, at: D.clock }; }
    });
  }
  function submit() {
    const p = D.pw; if (!p || D.pwBusy) return;
    const text = p.text; closePw(); D.pwBusy = true;
    getRadio().submitPassword(text).then((ok) => {
      D.pwBusy = false; D.pwMsg = ok ? 'SENHA ACEITA' : 'NADA RESPONDE'; D.pwMsgUntil = D.clock + 2.4;
      audio.play(ok ? 'cartao' : 'ui-no', { gain: 0.6 });
    });
  }
  function colorPress(i) {
    const rad = getRadio();
    if (!inKeys(rad.view())) return;
    D.colorCursor = i;
    gesture('radio_cor', { color: i });
    later(JONAS_MARKS.radio_cor.press, () => { if (rad.keyPress(rad.COLORS[i].id)) { D.prop.pressColor(i); audio.play('cor', { gain: 0.5, n: i }); } });
  }
  function tune(d) {
    const rad = getRadio();
    if (D.phase !== 'on') return;
    closePw();                                           // the hand goes to the selector: the keypad is put away
    D.tuneDir = d;
    if (rad.tune(d)) {
      // Jonas turns the selector: at the grip the pointer starts to run, the number lights when it gets there, with static between the channels
      gesture('radio_seletor', { dir: d });
      D.tuneTo = { to: Number(rad.view().channelN) || 21, at: D.clock + JONAS_MARKS.radio_seletor.grip, set: false };
      D.shown = null;
      audio.play('radio-solta', { gain: 0.25 });
    } else audio.play('ui-no', { gain: 0.3 });
  }

  // ---- the person's hands: the keys, the pad, the touch --------------------------------------------------------------------------
  function press(on) {
    if (D.talking === on) return;
    const rad = getRadio(), v = rad.view();
    D.talking = on;
    if (inKeys(v)) rad.keySend(on); else rad.transmit(on);
    // the core may not have started (nothing chosen): then Jonas does not speak either
    if (on) { const w = rad.view(); D.talking = Boolean(w.ask?.tx || w.keys?.sending); }
  }
  talk.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); talk.setPointerCapture?.(e.pointerId); D.talkBtn = true; });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) talk.addEventListener(ev, () => { D.talkBtn = false; });
  talk.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); });
  lines.addEventListener('click', (e) => {
    if (D.phase !== 'on') return;
    const b = e.target.closest('[data-i]'); if (b) { getRadio().select(Number(b.dataset.i)); return; }
    if (e.target.closest('.say')) getRadio().skipLine();
  });

  const ray = new T.Raycaster(), ndc = new T.Vector2();
  /** What is under a screen point of the radio piece: { part: 'key_4' | 'color_1' | 'dial', local: the point in the radio's axes } or null. */
  function pick(x, y) {
    if (!D.prop || !D.prop.ready) return null;
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    r.camera.updateMatrixWorld(); D.root.updateWorldMatrix(true, true);
    ray.setFromCamera(ndc, r.camera);
    const names = [...Array(12).keys()].map((i) => `key_${i}`).concat([...Array(5).keys()].map((i) => `color_${i}`), ['dial']);
    let best = null;
    for (const n of names) {
      const o = D.prop.parts[n]; if (!o) continue;
      const hit = ray.intersectObject(o, true)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { part: n, distance: hit.distance, point: hit.point };
    }
    return best && { part: best.part, local: D.root.worldToLocal(best.point.clone()) };
  }
  /** A finger (touch) or a click (mouse) on the radio. */
  function tap(x, y) {
    if (D.phase !== 'on') return false;
    const h = pick(x, y); if (!h) return false;
    if (h.part.startsWith('key_')) pressKey(Number(h.part.slice(4)));
    else if (h.part.startsWith('color_')) colorPress(Number(h.part.slice(6)));
    else if (h.part === 'dial') { const c = D.prop.anchor('dial'); D.root.worldToLocal(c); tune(h.local.x >= c.x ? 1 : -1); }
    return true;
  }
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || D.phase !== 'on') return;
    if (e.target.closest('#radio-lines, #hud-talk, #screens, button')) return;
    tap(e.clientX, e.clientY);
  });

  /** One step. `it` is what the game's input read for the context `sub`. */
  function step(it) {
    D.clock += STEP;
    for (let i = 0; i < D.later.length;) { if (D.clock >= D.later[i].at) { const f = D.later.splice(i, 1)[0]; f.fn(); } else i++; }
    if (D.gest) D.gest.at += STEP;
    const tt = D.tuneTo;
    if (tt && D.prop) {
      if (!tt.set && D.clock >= tt.at) { D.prop.setDial(tt.to); tt.set = true; }
      if (tt.set && Math.abs(D.prop.dial - tt.to) < 0.5) { D.tuneTo = null; D.shown = getRadio().view().channelN; audio.play('ui-move', { gain: 0.5 }); }
    }
    if (D.phase === 'sit') {
      D.t += STEP;
      if (!D.mic && D.t >= JONAS_MARKS.radio_pegar_mic.grab) { D.mic = true; D.prop.micTo('hand', body); }
      if (D.t >= dur('radio_pegar_mic')) { D.phase = 'on'; D.gest = null; getRadio().open(); }
      pose(); sync(); return;
    }
    if (D.phase === 'bye') {
      D.t += STEP;
      if (D.mic && D.t >= JONAS_MARKS.radio_pendurar.release) { D.mic = false; D.prop.micTo('hook'); }
      pose(); sync();
      if (D.t >= dur('radio_pendurar')) finish();
      return;
    }
    if (D.phase !== 'on') return;
    const rad = getRadio();
    let v = rad.view(), sub = D.pw ? 'field' : inKeys(v) ? 'keys' : 'radio';
    if (sub === 'field') {
      if (device() === 'gamepad') {                     // a cursor on the twelve keys: the d-pad moves it, A presses, X erases, B closes, Start sends
        const n = it.nav;
        if (n.dx) D.cursor = (Math.floor(D.cursor / 3) * 3) + ((D.cursor % 3) + n.dx + 3) % 3;
        if (n.dy) D.cursor = (D.cursor + n.dy * 3 + 12) % 12;
        if (n.ok) pressKey(D.cursor); if (n.erase) pressKey(9); if (n.start) pressKey(11); if (n.back) closePw();
      }
    } else if (sub === 'keys') {
      const K = it.keys;
      if (K.tune) tune(K.tune);
      if (K.move) { D.colorCursor = (D.colorCursor + K.move + 5) % 5; audio.play('ui-move', { gain: 0.3 }); }
      if (K.put) colorPress(D.colorCursor);
      if (K.erase) { gesture('radio_tecla', { key: 9 }); later(JONAS_MARKS.radio_tecla.press, () => { D.prop.pressKey(9); rad.keyErase(); }); }
      press(Boolean(K.send || D.talkBtn));
      if (K.close) leave();
    } else {
      const R = it.radio;
      if (R.tune) tune(Math.sign(R.tune));
      if (R.move) rad.moveSelect(R.move);
      if (R.pick >= 0) rad.select(R.pick);
      if (R.advance) rad.skipLine();
      press(Boolean(R.talk || D.talkBtn));
      if (R.field) openPw();
      if (R.leave) leave();
    }
    if (D.phase !== 'on') return;
    rad.step(STEP);
    v = rad.view();
    if (D.talking && !(v.ask?.tx || v.keys?.sending)) D.talking = false;          // the speech ended by itself (its whole length said)
    tickSound(v);
    // the sound: the static is the patience of the voice (full while someone speaks or nobody asks); a blip runs under a voice that is only text
    const burst = Boolean(D.tuneTo);
    const gain = burst ? 0.42 : v.ask?.tx || v.keys?.sending ? 0.04 : v.ask && v.ask.total ? 0.06 + 0.3 * Math.max(0, v.ask.left / v.ask.total) : v.line ? 0.1 : 0.22;
    D.chiado?.gain(gain);
    if (v.line && !v.line.voice && D.clock > D.blipAt) { D.blipAt = D.clock + 0.09; if (v.line.t < v.line.dur * 0.8) audio.play('blip', { gain: 0.5, f: (BLIP[v.line.who] ?? 280) + ((Math.floor(D.clock * 13) % 5) * 12) }); }
    // the plane: the panel from over the shoulder, a close on the keys when they are in use
    const want = D.pw || (D.gest && D.gest.at < dur(D.gest.name) + 0.4 && D.gest.name !== 'radio_seletor') ? 'perto' : inKeys(v) ? 'perto' : 'painel';
    if (want !== D.plane) { D.plane = want; D.planeAt = D.clock; audio.play('corte', { gain: 0.3 }); }
    pose(); sync(); texts(v);
  }

  // ---- the lines of text at the bottom -------------------------------------------------------------------------------------------
  function texts(v) {
    lines.hidden = D.phase !== 'on';
    if (D.phase !== 'on') { talk.hidden = true; return; }
    let who = '', say = '';
    if (v.line) { who = WHO[v.line.who] ?? v.line.who; const k = Math.ceil(v.line.text.length * Math.min(1, v.line.t / Math.max(0.5, v.line.dur * 0.8))); say = v.line.text.slice(0, k); }
    else if (v.ask && v.said) { who = WHO[v.said.who] ?? v.said.who; say = v.said.text; }
    else if (v.ask && v.ask.text) { who = WHO[v.ask.who] ?? ''; say = v.ask.text; }
    else if (v.phase === 'ended') say = v.outcome === 'left' ? 'Você saiu da chamada.' : v.outcome === 'dropped' || v.outcome === 'ended' ? 'A chamada acabou. Só o chiado.' : '';   // (a recording that ended, or a call that closed well, says nothing)
    else if (v.phase === 'idle' && !inKeys(v)) say = v.channel === 'represa' ? '' : 'Só o chiado.';
    if (E.who.textContent !== who) E.who.textContent = who;
    if (E.say.textContent !== say) E.say.textContent = say;
    const ask = v.ask, g = device() === 'touch' ? '' : 'k';
    const sig = ask ? ask.choices.map((c) => c.text).join('|') + `#${ask.sel}#${ask.locked}#${g}` : '';
    if (sig !== D.sig) {
      D.sig = sig;
      E.ch.innerHTML = ask ? ask.choices.map((c, i) => `<button type="button" class="rl${ask.sel === i ? ' sel' : ''}" data-i="${i}"${ask.locked ? ' tabindex="-1"' : ''}>${g ? `<kbd>${i + 1}</kbd>` : ''}<span class="t">${esc(c.text)}${c.mark != null && c.dur ? `<u style="left:${(c.mark / c.dur) * 100}%" hidden></u>` : ''}</span></button>`).join('') : '';
    }
    // the chosen line fills as Jonas speaks, with a tick at its mark
    if (ask) {
      const rows = E.ch.children;
      for (let i = 0; i < rows.length; i++) {
        const c = ask.choices[i], on = ask.tx && ask.sel === i, t = rows[i].querySelector('.t'), tick = t.querySelector('u');
        rows[i].classList.toggle('tx', Boolean(on));
        t.style.setProperty('--p', on ? `${Math.min(100, (ask.tx.held / ask.tx.dur) * 100)}%` : '0%');
        if (tick) { tick.hidden = !(ask.sel === i && c.mark != null); tick.style.opacity = on && ask.tx.held >= c.mark ? '0.35' : '1'; }
      }
    }
    // the Falar button: only when there is something to say (a chosen answer, or the colours to send)
    const k = v.keys, canTalk = (ask && ask.sel !== null) || (inKeys(v) && k.seq.length > 0 && !k.locked) || D.talking;
    talk.hidden = !canTalk; talk.classList.toggle('down', D.talking);
    talk.firstChild.textContent = inKeys(v) ? 'Enviar' : 'Falar';
  }
  // the first spoken tick (the mark) also sounds: a short click when the held time passes it
  let lastTick = false;
  function tickSound(v) {
    const a = v.ask, on = a?.tx && a.tx.mark != null && a.tx.held >= a.tx.mark;
    if (on && !lastTick) audio.play('bip', { gain: 0.5 });
    lastTick = Boolean(on);
  }

  // ---- the camera -----------------------------------------------------------------------------------------------------------------
  const tv = new T.Vector3(), tq = new T.Quaternion(), tn = new T.Vector3(), tr = new T.Vector3(), tu = new T.Vector3();
  /** The camera: { eye, at, dir, fov, aim }. `half` is how many metres to each side of the target must fit (across, and up). */
  function camera(aspect, baseFov) {
    const root = D.root; if (!root || !D.prop) return null;
    root.updateWorldMatrix(true, true);
    root.getWorldQuaternion(tq);
    tn.set(...PANEL).applyQuaternion(tq);
    tr.set(1, 0, 0).applyQuaternion(tq); tu.set(0, 1, 0).applyQuaternion(tq);
    const L = (x, y, z) => root.localToWorld(new T.Vector3(x, y, z));
    let eye, at, halfX, halfY, sway = 0;
    if (D.plane === 'painel') {
      // over his right shoulder, a little above: the whole panel, the microphone in his hand at the edge
      eye = L(-0.62, 0.8, 1.1); at = L(0.05, 0.11, 0.06); halfX = aspect < 1 ? 0.34 : 0.44; halfY = 0.2; sway = 0.006;
    } else {
      const keys = D.pw || (D.gest && D.gest.name === 'radio_tecla') || !D.lastLit;
      const target = D.prop.anchor(keys ? 'key_4' : 'color_2', tv.clone());
      if (keys) target.addScaledVector(tr, -0.05);
      at = target; eye = target.clone().addScaledVector(tn, keys ? 0.58 : 0.42).addScaledVector(tr, keys ? 0.0 : 0.0).addScaledVector(tu, keys ? 0.06 : 0.04);
      halfX = aspect < 1 ? (keys ? 0.17 : 0.22) : keys ? 0.24 : 0.2; halfY = keys ? 0.15 : 0.1;
    }
    const t = D.clock; eye.x += Math.sin(t * 0.9) * sway; eye.y += Math.sin(t * 1.3 + 1) * sway;
    const d = eye.distanceTo(at), need = Math.max(halfY, halfX / aspect);
    const fov = Math.max(20, Math.min(100, 2 * Math.atan(need / d) * (180 / Math.PI)));
    const dirv = at.clone().sub(eye).normalize();
    return { eye: eye.toArray(), at: at.toArray(), dir: dirv.toArray(), fov, aim: { pos: eye.toArray(), dir: dirv.toArray() } };
  }

  /** The small hint next to the picture: what the button does here. */
  function hint(dev) {
    if (D.phase !== 'on') return null;
    const v = getRadio().view();
    const G = { keyboard: { talk: 'T', tune: '← →', pick: '↑ ↓', keys: '← →' }, gamepad: { talk: 'RT', tune: 'LB RB', pick: '↑ ↓', keys: '← →' }, touch: { talk: '', tune: '', pick: '', keys: '' } }[dev] ?? {};
    if (D.pw) return { label: dev === 'touch' ? 'Toque nas teclas · # envia' : dev === 'gamepad' ? 'A digita · Start envia · B fecha' : 'Enter envia · Esc fecha', glyph: '', desk: true };
    if (inKeys(v)) return { label: dev === 'touch' ? 'Toque nos botões' : 'Cor · segure para enviar', glyph: dev === 'touch' ? '' : G.keys, desk: true };
    // the first question of the first call teaches, on the spot and in one short line at a time: letting go early cuts the speech, and the static that
    // fades with the RX light is her patience (if it ends before he speaks, he stayed silent)
    if (v.convId === 'n1-chamada' && v.ask?.turn === 'T1' && !v.ask.locked) {
      if (v.ask.sel !== null) return { label: dev === 'touch' ? 'Segure Falar até o fim. Soltar antes corta a fala' : 'Segure para falar até o fim. Soltar antes corta a fala', glyph: G.talk, desk: true };
      if (v.ask.total && v.ask.left / v.ask.total < 0.7) return { label: 'O chiado e a luz RX são a paciência dela. Se acabar sem você falar, você calou', glyph: '', desk: true };
    }
    if (v.ask && v.ask.sel !== null) return { label: 'Falar', hold: dev !== 'touch', glyph: G.talk, desk: true };
    if (v.ask) return { label: dev === 'touch' ? 'Escolha uma resposta' : 'Escolher', glyph: G.pick, desk: true };
    if (pwBlinks(v)) return { label: dev === 'touch' ? 'Toque nas teclas: a senha' : 'Digitar a senha', glyph: dev === 'keyboard' ? 'Enter' : dev === 'gamepad' ? 'Y' : '', desk: true };
    return { label: dev === 'touch' ? 'Gire o seletor' : 'Sintonizar', glyph: G.tune, desk: true };
  }

  return {
    open, leave, reset, step, camera, hint, tap, pick,
    get active() { return D.phase !== 'off'; },
    get phase() { return D.phase; },
    get plane() { return D.plane; },
    get prop() { return D.prop; },
    get gesture() { return D.gest; },
    get password() { return D.pw ? D.pw.text : null; },
    get display() { return D.lastDisplay; },
    get talking() { return D.talking; },
    /** Whether the other voice is speaking now (its line is the caption: the hints wait). */
    get saying() { return D.phase === 'on' && Boolean(getRadio().view().line); },
    get seat() { return D.seat; },
    /** Whether the colour buttons are lit. */
    get lit() { return D.lastLit; },
    /** Which context of the input owns the buttons now. */
    get sub() { if (D.phase !== 'on') return 'radio'; const v = getRadio().view(); return D.pw ? 'field' : inKeys(v) ? 'keys' : 'radio'; },
    lines, talk,
    destroy() { closePw(); lines.remove(); talk.remove(); },
  };
}
