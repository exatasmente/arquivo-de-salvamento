// The HUD: text lives only here, never in the world. Plain DOM over the canvas: the goal of the scene, the line that is being said (captions),
// the prompt of what Jonas can do in front of him, the Escuta bar, the "foi ouvido" icon (no text), the Reagir button with its ring, the toast,
// the fade and the bars of a cutscene. The screens (title, menu, options, card) are src/screens.js; the radio is no window: Jonas does it at the bench (src/desk.js keeps only the lines of text and the Falar button over the picture).
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GLYPH = { keyboard: 'E', gamepad: 'A', touch: '' };
export const EAR = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 38c-2-5 1-8 4-11 3-3 5-5 5-9a7 7 0 0 0-14 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M22 15a9 9 0 0 1 17 4c0 5-3 7-5 10-1 2-1 4-2 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M26 20c2-2 5-1 6 1M24 25c4-4 9-2 10 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

export function createUI(root, h = {}) {
  const make = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const hud = make(`<div id="hud">
    <div id="hud-goal" hidden><span></span></div>
    <div id="hud-escuta" hidden><i></i></div>
    <div id="hud-heard" hidden>${EAR}</div>
    <div id="hud-dot" hidden></div><div id="hud-action" hidden></div><div id="hud-ring" hidden><i></i></div>
    <div id="hud-toast" hidden></div><div id="hud-lock" hidden>Clique para voltar a olhar</div>
    <div id="hud-marker" hidden></div>
    <div id="hud-say" hidden><b></b><span></span></div>
    <div id="hud-hurt" hidden>Jonas manca</div>
    <div id="hud-sign" hidden><span class="arrow"></span><span class="keys"></span><span class="word"></span><i class="bar"><u></u></i><i class="fill"><u></u></i></div>
  </div>`);
  const react = make(`<button id="hud-react" type="button" hidden aria-label="Reagir"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="44"/><circle class="ring" cx="50" cy="50" r="44" pathLength="100"/></svg><span>Reagir</span><em></em></button>`);
  const fade = make('<div id="fade"></div>');
  const over = make(`<div id="gameover" hidden><svg class="flat" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 H300 l10 -5 l10 10 l10 -26 l12 48 l12 -34 l10 12 H430 l8 -3 l8 6 l8 -14 l8 24 l8 -12 l6 3 H1000" pathLength="1"/></svg>
    <div class="gcol"><small class="kick">Sinal de Vida</small><h2>FIM DE JOGO</h2><p class="why"></p><p class="go"></p></div></div>`);
  const bars = make('<div id="cutbars" hidden><i></i><i></i><div id="cut-skip">Segure Esc por 1 s para pular</div></div>');
  root.append(hud, react, fade, over, bars);
  // The loading screen is in index.html (so it is there from the first paint); the game only shows and hides it. A short wait shows nothing (`after` seconds).
  const loadEl = document.getElementById('loading');
  const TIPS = ['Falar no rádio é ser ouvido.', 'Às vezes calar é a resposta.'];
  let loadTimer = null, tipN = 0;
  const $ = (s) => hud.querySelector(s);
  const E = { goal: $('#hud-goal'), escuta: $('#hud-escuta'), heard: $('#hud-heard'), dot: $('#hud-dot'), action: $('#hud-action'), ring: $('#hud-ring'), toast: $('#hud-toast'), lock: $('#hud-lock'), marker: $('#hud-marker'), say: $('#hud-say'), hurt: $('#hud-hurt'), sign: $('#hud-sign') };
  const SG = { arrow: E.sign.querySelector('.arrow'), keys: E.sign.querySelector('.keys'), word: E.sign.querySelector('.word'), bar: E.sign.querySelector('.bar u'), fill: E.sign.querySelector('.fill u'), fillBox: E.sign.querySelector('.fill') };
  const R = { btn: react, ring: react.querySelector('.ring'), hint: react.querySelector('em') };
  let toastUntil = 0, toastQueue = [], toastNow = null, sayUntil = 0, sayQueue = [], captions = true, escutaShown = 0, heardUntil = 0, lastEscuta = null;
  // ONE line of text over the picture at a time. The order: the caption (what is being said) first, then a notice (a toast), then the hint of
  // what the button does where he stands, then the goal of the scene (and the limp tag last). What is waiting is not shown, and a notice that
  // was cut off by a caption is shown again after it. The answer lines and the Falar button of the radio are not text of this kind (they are the radio).
  const slot = { cap: false, toast: false, hint: false, goal: false, goalText: '', act: null, device: 'keyboard', quick: false, hurt: false, deskSay: false };
  const cache = {};
  const set = (key, el, html) => { if (cache[key] !== html) { cache[key] = html; el.innerHTML = html; } };

  // Reagir: the same place on every screen; a click or a tap is the press.
  react.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); h.onReact?.(); });
  react.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); });

  /** Decides which of the lower priorities is on show: the hint of the button, else the goal, else the limp tag, and only if the caption and the notice leave room. */
  function arrange() {
    const free = !slot.cap && !slot.toast && !slot.quick;
    slot.hint = free && Boolean(slot.act);
    slot.goal = free && !slot.hint && Boolean(slot.goalText);
    slot.hurtShown = free && !slot.hint && !slot.goal && slot.hurt;
    E.action.hidden = !slot.hint; E.dot.hidden = !slot.act || Boolean(slot.act.desk);
    E.goal.hidden = !slot.goal; E.hurt.hidden = !slot.hurtShown;
  }

  return {
    el: hud,
    cut(on) { bars.hidden = !on; },
    cutHint(text) { bars.querySelector('#cut-skip').textContent = text; },
    fade(a) { fade.style.opacity = String(a); },
    /** The game over, over the black: `spec` = { why, hint } to show it, null to take it away (the fade under it is the game's). */
    gameOver(spec) {
      over.hidden = !spec; if (!spec) return;
      over.querySelector('.why').textContent = spec.why ?? '';
      // "E: voltar ao último ponto salvo" is drawn as the key and its words
      const m = /^([^:]{1,14}): (.+)$/.exec(spec.hint ?? ''), go = over.querySelector('.go');
      go.innerHTML = m ? `<kbd>${esc(m[1])}</kbd><span>${esc(m[2])}</span>` : esc(spec.hint ?? '');
    },
    get gameOverShown() { return !over.hidden; },
    /** The loading screen: `loading(true, 0.4)` shows it if the wait lasts more than 0.4 s, `loading(false)` takes it away. */
    loading(on, after = 0) {
      if (!loadEl) return;
      clearTimeout(loadTimer);
      if (!on) { loadEl.classList.add('gone'); loadTimer = setTimeout(() => { loadEl.hidden = true; }, 600); return; }
      const show = () => { const t = loadEl.querySelector('.ld-tip'); if (t) t.textContent = TIPS[tipN++ % TIPS.length]; loadEl.hidden = false; void loadEl.offsetWidth; loadEl.classList.remove('gone'); };
      if (after > 0) loadTimer = setTimeout(show, after * 1000); else show();
    },
    get loadingShown() { return Boolean(loadEl) && !loadEl.hidden && !loadEl.classList.contains('gone'); },
    /** A notice: it waits its turn (a caption goes first, one notice at a time) and the same text is not queued twice. */
    toast(text, now) { if (toastNow?.text === text || toastQueue.some((x) => x.text === text)) return; toastQueue.push({ text, at: now }); if (toastQueue.length > 3) toastQueue.shift(); },
    /** A line that is being said. `dur`: how long it stays; several are queued. */
    say(who, text, dur = 3, now = 0) { sayQueue.push({ who, text, dur }); },
    sayClear() { sayQueue = []; sayUntil = 0; E.say.hidden = true; },
    /** Which of the lines of text is on show now: 'caption' | 'toast' | 'hint' | 'goal' | 'hurt' | null (the tests read it). */
    get shown() { return slot.cap ? 'caption' : slot.toast ? 'toast' : slot.hint ? 'hint' : slot.goal ? 'goal' : slot.hurtShown ? 'hurt' : null; },
    setCaptions(on) { captions = on; if (!on) E.say.hidden = true; },
    /** The "foi ouvido" icon: no text. With "reduce flashes" it has no entrance animation. */
    heard(now) { heardUntil = now + 1.3; E.heard.hidden = false; E.heard.classList.remove('in'); void E.heard.offsetWidth; if (!h.flashes?.()) E.heard.classList.add('in'); },
    /** The frame: `d` = { goal, escuta (0..100), marker: {x, y, edge}, hurt, hud (shown or not) }. */
    frame(d, now) {
      hud.classList.toggle('off', !d.hud);
      slot.goalText = d.goal ?? ''; if (d.goal) set('goal', E.goal.firstElementChild, esc(d.goal));
      slot.quick = Boolean(d.quick || d.seq); slot.hurt = Boolean(d.hurt); slot.deskSay = Boolean(d.deskSay);
      // the Escuta bar: shows while it moves (and a few seconds after), always in the radio
      if (lastEscuta !== d.escuta) { if (lastEscuta !== null) escutaShown = now + 4; lastEscuta = d.escuta; }
      const showE = d.hud && (d.escutaAlways || now < escutaShown);
      E.escuta.hidden = !showE; if (showE) E.escuta.firstElementChild.style.width = `${d.escuta}%`;
      if (heardUntil && now > heardUntil) { heardUntil = 0; E.heard.hidden = true; }
      // the caption
      if (captions && now > sayUntil && sayQueue.length) { const s = sayQueue.shift(); E.say.hidden = false; E.say.firstElementChild.textContent = s.who; E.say.lastElementChild.textContent = s.text; sayUntil = now + s.dur; }
      else if (now > sayUntil && !sayQueue.length) E.say.hidden = true;
      if (!captions) sayQueue = [];
      slot.cap = !E.say.hidden || slot.deskSay;
      toastQueue = toastQueue.filter((x) => !(now - (x.at ?? now) > 4));       // a notice that waited too long for its turn is no news any more
      // the notice: shown only when no caption is up (and not over the quick reaction); one at a time, back on the queue when a caption takes the place
      if (toastNow && (slot.cap || slot.quick)) { toastQueue.unshift({ text: toastNow.text, left: toastUntil - now }); toastNow = null; }
      if (toastNow && now > toastUntil) toastNow = null;
      if (!toastNow && !slot.cap && !slot.quick && toastQueue.length) { toastNow = toastQueue.shift(); toastUntil = now + (toastNow.left > 0.8 ? toastNow.left : 2.6); }
      slot.toast = Boolean(toastNow);
      E.toast.hidden = !toastNow; if (toastNow) E.toast.textContent = toastNow.text;
      bars.querySelector('#cut-skip').hidden = slot.cap;                      // the hint of the button waits for the caption in a cutscene too
      arrange();
      if (d.marker) { E.marker.hidden = false; E.marker.style.left = `${d.marker.x}px`; E.marker.style.top = `${d.marker.y}px`; E.marker.textContent = d.marker.label; } else E.marker.hidden = true;
      // the quick reaction
      const q = d.quick;
      react.hidden = !q;
      if (q) { R.ring.style.strokeDashoffset = String(100 - q.u * 100); R.hint.textContent = q.first ? q.hint : ''; react.classList.toggle('first', Boolean(q.first)); react.classList.toggle('calm', Boolean(h.flashes?.())); }
    },
    setAction(act, device, label = '') {
      slot.act = act; slot.device = device;
      if (act) {
        E.action.classList.toggle('desk', Boolean(act.desk));
        const g = act.glyph ?? GLYPH[device] ?? 'E';
        set('action', E.action, `${g && !act.hold ? `<kbd>${g}</kbd> ` : g ? `<kbd>${g}</kbd> segure ` : act.hold ? 'segure ' : ''}${esc(act.label)}`);
      }
      arrange();
    },
    /**
     * The command of a sequence of action, in the scenery next to what it is about (the hand, the cable, the dog): a small key cap of the device (or an arrow), a word,
     * and a thin bar that runs out with the window. `spec` = { x, y, keys, word, arrow, u, progress, tone: 'hit' | 'miss' | null, pulse }, or null to take it away.
     */
    sign(spec) {
      if (!spec) { if (!E.sign.hidden) E.sign.hidden = true; return; }
      E.sign.hidden = false;
      E.sign.style.left = `${spec.x}px`; E.sign.style.top = `${spec.y}px`;
      set('sign-keys', SG.keys, spec.keys ? spec.keys.split('|').map((k) => `<kbd>${esc(k)}</kbd>`).join('') : '');
      set('sign-word', SG.word, esc(spec.word ?? '')); set('sign-arrow', SG.arrow, esc(spec.arrow ?? ''));
      E.sign.dataset.tone = spec.tone ?? ''; E.sign.classList.toggle('pulse', Boolean(spec.pulse) && !h.flashes?.());
      SG.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, spec.u ?? 0))})`;
      SG.fillBox.hidden = spec.progress == null; if (spec.progress != null) SG.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, spec.progress))})`;
      E.sign.querySelector('.bar').hidden = spec.u == null;
    },
    setProgress(u) { E.ring.hidden = !(u > 0); if (u > 0) E.ring.firstElementChild.style.transform = `scaleX(${u})`; },
    setLockHint(on) { E.lock.hidden = !on; },
    get busyCaption() { return !E.say.hidden; },
    reactRect: () => react.getBoundingClientRect(),
  };
}
