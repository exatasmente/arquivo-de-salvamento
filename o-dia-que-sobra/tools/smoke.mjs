// End-to-end smoke test of the game as a person meets it: the page served over http, the real game.step, the real input events, the
// real interaction pick (the bot only moves the player and aims; what it presses goes through the keyboard path of input.js).
//
//   node tools/smoke.mjs                  the whole check (desktop 1920x1080 and phone 390x844), exit code 1 with a clear message if anything breaks
//   node tools/smoke.mjs --balance 1 6    plays nights 1..6 of the campaign with the bot and prints the points per night (for the goals)
//
// Environment: PLAYWRIGHT_CORE (path to playwright-core, default the installed package), CHROME (default /usr/bin/google-chrome), OUT_DIR (where the
// screenshots go; none when unset), PACE (the bot's seconds of thinking per action, default 0.9), WALK (its m/s, default 2.8).
// The bot cheats on nothing the game hides, except two things a person can see: it reads the value on the pump display before it
// presses LIGAR, and it counts the drawer for the closing from the cash object (a person counts it by hand).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');                 // the channel repository: the page is /o-dia-que-sobra/index.html
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = createRequire(import.meta.url)(PW);
const OUT = process.env.OUT_DIR ? process.env.OUT_DIR.replace(/\/?$/, '/') : null;
const ARGS = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const failures = [];
const ok = (cond, msg) => { console.log((cond ? 'ok    ' : 'FAIL  ') + msg); if (!cond) failures.push(msg); return cond; };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The bot. It runs in the page (one function, serialised by Playwright), so everything it touches is the game as it is.
function installBot(cfg) {
  const O = window.__odq, G = O.game, THREE = O.render.THREE;
  const { customers, interaction, player, inventory, ui, tasks, cash, progression, time, world, sanity, entity } = G;
  const DT = 1 / 60;
  const B = { cfg: { think: 0.9, walk: 2.8, ...cfg }, log: [], errors: [], dead: false };
  // a headless page has no pointer lock; the game pauses when it loses it, so tell it the lock is held
  try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* already there */ }
  const disp = {};
  const origDisp = world.pumpDisplay; world.pumpDisplay = (n, c) => { disp[n] = c; return origDisp.call(world, n, c); };
  G.bus.on('perf:error', (k, why) => say(`ERROR ${k} ${why}`)); G.bus.on('perf:complaint', (why) => say(`COMPLAINT ${why}`));
  function say(m) { B.log.push(`${time.text()} ${m}`); if (B.log.length > 4000) B.log.shift(); }

  // --- time and input
  const kd = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  const ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  const EMPTY = () => ({ acts: [], actDown: false, press: [], look: { yaw: 0, pitch: 0 } });
  function step(n = 1) { for (let i = 0; i < n; i++) G.step(DT); }
  const wait = (sec) => step(Math.max(1, Math.round(sec * 60)));
  const tapE = () => { kd('KeyE'); step(1); ku('KeyE'); step(2); };
  const confirm = () => { kd('Enter'); step(1); ku('Enter'); step(1); };

  // --- standing and aiming: find a spot on the floor from where the real pick of the game returns what we want
  const eyeY = () => player.st.eye;
  function aimAt(c, ok, radii = [1.0, 1.4, 1.8, 2.2, 2.6]) {
    const px = player.st.x, pz = player.st.z, base = Math.atan2(px - c.x, pz - c.z);
    for (const r of radii) {
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8;
        const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        if (player.blocked(x, z)) continue;
        player.st.x = x; player.st.z = z; player.st.yaw = Math.atan2(-(c.x - x), -(c.z - z)); player.st.pitch = Math.atan2(c.y - eyeY(), r);
        if (ok()) return { x, z };
      }
    }
    player.st.x = px; player.st.z = pz;
    return null;
  }
  function centerOf(t) {
    const a = t.aim(); if (!a) return null;
    if (a.c) return a.c.clone();
    if (a.box) return a.box.getCenter(new THREE.Vector3());
    return null;
  }
  function walkTo(x, z) { const d = Math.hypot(x - player.st.x, z - player.st.z); wait(d / B.cfg.walk); }
  function use(id, label) {
    const from = { x: player.st.x, z: player.st.z };
    const t = interaction.targets.get(id); if (!t || !t.enabled()) return false;
    const c = centerOf(t); if (!c) return false;
    const dist = Math.hypot(c.x - from.x, c.z - from.z);
    const spot = aimAt(c, () => { interaction.update(0, EMPTY()); return interaction.current?.target?.id === id; });
    if (!spot) { say(`cannot aim at ${id}`); return false; }
    wait(B.cfg.think + Math.max(0, dist - 1.5) / B.cfg.walk);
    interaction.update(0, EMPTY()); if (interaction.current?.target?.id !== id) return false;   // what we aimed at changed while we thought (the phone stopped ringing)
    say(`use ${id}${label ? ' (' + label + ')' : ''}`);
    tapE();
    return true;
  }
  /** Holds the button on `id` until `done()` or `maxSec`. */
  function hold(id, done, maxSec = 12) {
    const from = { x: player.st.x, z: player.st.z };
    const t = interaction.targets.get(id); if (!t || !t.enabled()) return false;
    const c = centerOf(t); if (!c) return false;
    const dist = Math.hypot(c.x - from.x, c.z - from.z);
    const spot = aimAt(c, () => { interaction.update(0, EMPTY()); return interaction.current?.target?.id === id; });
    if (!spot) { say(`cannot aim at ${id}`); return false; }
    wait(B.cfg.think + Math.max(0, dist - 1.5) / B.cfg.walk);
    say(`hold ${id}`);
    kd('KeyE');
    for (let i = 0; i < maxSec * 60 && !done(); i++) { step(1); if (!interaction.targets.get(id)?.enabled()) break; }
    ku('KeyE'); step(2);
    return true;
  }

  // --- the pump's physical keypad: aim at each key, press it with E
  function pressKey(n, k) {
    const kp = world.posto.pumps[n].keypad, c = kp.worldPos(k);
    const dirOf = (yaw, pitch) => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const spot = aimAt(c, () => { interaction.update(0, EMPTY()); return kp.keyAtRay(player.eyePos(), dirOf(player.st.yaw, player.st.pitch), 2.8) === k && interaction.current?.target?.id === 'teclado' + n; }, [0.8, 1.0, 1.3]);
    if (!spot) { say(`cannot aim at key ${k} of pump ${n}`); return false; }
    wait(0.35); tapE();
    return true;
  }
  function typeValue(c) {
    const n = c.pump, digits = String(c.value);
    for (let tries = 0; tries < 3; tries++) {
      for (const d of digits) pressKey(n, d);
      if (disp[n] === c.value) { pressKey(n, 'ligar'); return true; }
      pressKey(n, 'cancelar');
    }
    return false;
  }

  // --- the modals
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clickCell = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  function drawerCents() { return cash.real(); }
  function modalStep() {
    if (ui.dialogueOpen) { confirm(); wait(0.1); return true; }
    if (!ui.modalOpen) return false;
    const box = document.querySelector('#modal .box');
    if (!box) { step(2); return true; }
    const title = box.querySelector('h1')?.textContent || '';
    if (box.classList.contains('tray')) {
      const payer = customers.list.find((c) => c.paying);
      let need = payer ? (payer.kind === 'car' ? payer.bill - Math.round(payer.cents) : payer.bill - payer.total) : 0;
      const stock = {};
      for (const b of $$('#modal button[data-v]')) stock[b.dataset.v] = b.classList.contains('out') ? 0 : Number((b.querySelector('small')?.textContent || '×99').replace('×', ''));
      for (const dn of cash.DENOMS) {
        while (need >= dn && (stock[dn] || 0) > 0) {
          const b = $$('#modal button[data-v]').find((x) => Number(x.dataset.v) === dn); if (!b) break;
          clickCell(b); stock[dn]--; need -= dn; step(2);
        }
      }
      if (need > 0) say(`change short by ${need}`);
      clickCell(document.querySelector('#modal [data-a=ok]')); step(3);
      return true;
    }
    if (box.classList.contains('keypad')) {
      if (title === 'FECHAR O CAIXA') {
        for (const d of String(drawerCents())) { kd('Digit' + d); step(1); ku('Digit' + d); step(1); }
        clickCell(document.querySelector('#modal [data-k=ok]')); step(3); return true;
      }
      clickCell(document.querySelector('#modal [data-k=back]')); step(3); return true;
    }
    if (/^MONITOR|^CÂMERAS/.test(title)) { kd('Escape'); step(1); ku('Escape'); step(2); return true; }
    // a menu: a choice that lets things go on (accept, allow, continue, next night)
    const cells = $$('#modal li[data-cell]');
    // a torn note or an old coin costs more taken than refused (a person learns it): ask for another way to pay
    const pick = (/RASGADA|ANTIGA/.test(title) ? cells.find((x) => /PEDIR/.test(x.textContent)) : null) || cells.find((x) => /ACEITAR|DEIXAR|CONTINUAR|PRÓXIMA|IR PARA CASA/.test(x.textContent)) || cells[0];
    if (!pick) { step(2); return true; }
    say(`menu "${title}" -> ${pick.textContent.trim()}`);
    clickCell(pick); step(3);
    return true;
  }

  // --- what there is to do
  const near = (c) => Math.hypot(player.st.x - c.x, player.st.z - c.z);
  function carStep(c) {
    if (c.done || ['arriving', 'leaving'].includes(c.state) || c.talking) return false;
    const carry = inventory.carry;
    if (carry && carry.kind !== 'item' && carry.kind !== 'bico' && carry.kind !== 'carrinho' && (chores().pumpStuck(c.pump) || c.ordered)) { inventory.drop(); say(`put down ${carry.kind}`); return true; }
    if (chores().pumpStuck(c.pump)) return hold('registro' + c.pump, () => !chores().pumpStuck(c.pump));
    if (!c.ordered) return use(`cliente${c.id}`, 'talk');
    if (c.fueling || c.panel) return false;
    if (carry && carry.kind === 'item') return false;   // finish the shopper first
    if (carry && carry.kind !== 'bico' && carry.kind !== 'carrinho') { inventory.drop(); say(`put down ${carry.kind}`); return true; }
    if (c.cents > 0) {
      if (c.nozzleIn) return use(`tampa${c.id}`, 'pull nozzle');
      if (carry?.kind === 'bico') return use(`bico${carry.pump}-${carry.fuel}`, 'return nozzle');
      return use(`cliente${c.id}`, 'charge');
    }
    if (!c.nozzleIn) {
      if (carry?.kind === 'bico') return carry.pump === c.pump && carry.fuel === c.fuel ? use(`tampa${c.id}`, 'nozzle in') : use(`bico${carry.pump}-${carry.fuel}`, 'wrong nozzle back');
      if (carry) return false;
      return use(`bico${c.pump}-${c.fuel}`, 'take nozzle');
    }
    return typeValue(c);
  }
  function walkerStep(c) {
    if (c.done || c.state === 'entering' || c.state === 'leaving' || c.state === 'inside' || c.state === 'route') return false;
    const carry = inventory.carry;
    if (c.state === 'ready') return carry ? false : use(`cliente${c.id}`, 'charge');
    if (c.state === 'asking') return use(`cliente${c.id}`, 'bathroom');
    if (c.state === 'linger') return hold(`cliente${c.id}`, () => c.state !== 'linger', 4);
    if (c.state === 'watch') return false;
    if (c.state === 'scanning' || c.state === 'placing') {
      if (carry?.kind === 'item') return use('leitor', 'scan');
      if (carry) return false;
      for (let i = 0; i < c.prods.length; i++) {
        const p = c.prods[i]; if (p.done || p.taken) continue;
        if (use(p.atras ? `atras${c.id}-${i}` : `item${c.id}-${i}`, 'item')) return true;
      }
    }
    return false;
  }
  const chores = () => G.chores;
  function taskStep() {
    const carry = inventory.carry;
    const pend = tasks.pending().filter((t) => !['carro', 'cliente'].includes(t.kind));
    if (carry?.kind === 'saco') return use('conteiner-saco', 'rubbish');
    if (carry?.kind === 'caixa') {
      const sh = [...tasks.shelves.values()].find((s) => !s.done && s.produto === carry.produto); if (sh) return hold('prat-' + sh.id, () => sh.done, 14);
      return false;
    }
    if (carry?.kind === 'escada') {
      const id = [...interaction.targets.keys()].find((k) => k.startsWith('lamp-') && interaction.targets.get(k).enabled());
      if (id) return use(id, 'ladder');
    }
    if (carry?.kind === 'limpeza') {
      const ids = [...interaction.targets.keys()].filter((k) => /^(trab-|pia-|espelho-|chao-)/.test(k) && interaction.targets.get(k).enabled());
      for (const id of ids) if (hold(id, () => !interaction.targets.get(id) || !interaction.targets.get(id).enabled(), 8)) return true;
      inventory.drop(); return true;
    }
    if (carry) return false;
    for (const t of pend) {
      if (t.id === 'abrir-caixa' || t.id === 'fechar-caixa' || t.id === 'telefone') continue;
      if (t.kind === 'repor') {
        const sh = tasks.shelves.get(t.id.replace('repor-', '')); if (!sh || sh.done) continue;
        const bx = world.boxes.find((b) => b && b.n === sh.boxN); if (bx && use(bx.id, 'box')) return true;
      } else if (t.kind === 'lixo') { if (use('saco-' + t.id.slice(5), 'bag')) return true; }
      else if (t.kind === 'mancha') { if (use('kit-limpeza', 'kit')) return true; }
      else if (t.kind === 'lampada') { if (use('escada-pegar', 'ladder')) return true; }
      else if (t.kind === 'disjuntor') { const id = 'disj-' + t.id.slice(10); if (hold(id, () => !interaction.targets.get(id)?.enabled(), 5)) return true; }
      else if (t.kind === 'bomba') { /* the jam is cleared when its car is served */ }
      else if (t.id === 'banheiro') { if (use('kit-limpeza', 'kit')) return true; }
    }
    return false;
  }
  // --- the Sun: when it runs, the bot runs for the nearest lit place (or stops and hides if one of the hiding places is closer)
  const stats = { chases: 0, caught: 0, escaped: 0 };
  G.bus.on('entity:chase', () => { stats.chases++; say('CHASE begins'); });
  function flee() {
    const cands = [];
    for (const n of world.names('bomba')) cands.push(world.anchor(n).pos);
    cands.push(world.anchor('spawn').pos);
    const lit = cands.filter((p) => G.lighting.litAt(p.x, p.z));
    let best = null, bd = 1e9;
    for (const p of lit) { const d = Math.hypot(p.x - player.st.x, p.z - player.st.z); if (d < bd) { bd = d; best = p; } }
    if (!best || bd < 1.5 || time.minutes < (flee.until || 0)) return false;   // already in the light (or just got there): carry on with the work
    say(`flee to ${best.x.toFixed(1)},${best.z.toFixed(1)} (${bd.toFixed(1)} m)`);
    const path = window.__nav?.path({ x: player.st.x, z: player.st.z }, { x: best.x, z: best.z }) || [{ x: best.x, z: best.z }];
    kd('ShiftLeft'); kd('KeyW');
    let wi = 0, stuckN = 0;
    for (let i = 0; i < 60 * 14 && entity.state === 'perseguicao' && Math.hypot(best.x - player.st.x, best.z - player.st.z) > 1.2 && !G.entity.done && wi < path.length; i++) {
      const w = path[wi];
      if (Math.hypot(w.x - player.st.x, w.z - player.st.z) < 0.5) { wi++; continue; }
      const px = player.st.x, pz = player.st.z;
      player.st.yaw = Math.atan2(-(w.x - px), -(w.z - pz)); step(1);
      stuckN = Math.hypot(player.st.x - px, player.st.z - pz) < 0.01 ? stuckN + 1 : 0;
      if (stuckN > 12) {   // a closed door: open the nearest one (a tap, like anyone)
        stuckN = 0; ku('KeyW');
        const doors = [...interaction.targets.keys()].filter((k) => k.startsWith('porta-') && interaction.targets.get(k).enabled() && interaction.targets.get(k).label?.()?.text?.startsWith('Abrir'));
        let near = null, nd = 6;
        for (const k of doors) { const c = centerOf(interaction.targets.get(k)); const d = c ? Math.hypot(c.x - player.st.x, c.z - player.st.z) : 99; if (d < nd) { nd = d; near = k; } }
        if (near) { const keep = { x: player.st.x, z: player.st.z, yaw: player.st.yaw }; use(near, 'open door'); player.st.x = keep.x; player.st.z = keep.z; player.st.yaw = keep.yaw; }
        kd('KeyW');
      }
    }
    ku('KeyW'); ku('ShiftLeft'); step(2);
    flee.until = time.minutes + 0.15;
    say(`  fled: path ${path.length} wp, got to wp ${wi}, now ${player.st.x.toFixed(1)},${player.st.z.toFixed(1)} ent=${entity.state} frozen=${player.st.frozen} hidden=${entity.hidden}`);
    return true;
  }
  /** One decision. Returns what it did, or '' when there was nothing to do. */
  function decide() {
    if (modalStep()) return 'modal';
    if (B.cfg.flee && entity.state === 'perseguicao' && !entity.hidden) { if (flee()) return 'flee'; }
    const tel = interaction.targets.get('telefone');
    if (tel?.enabled() && use('telefone', 'answer')) return 'phone';
    if (!cash.opened) { if (hold('caixa-registradora', () => cash.opened, 4)) return 'till'; }
    // the customers first (oldest first), then the chores, then the closing
    const live = customers.list.filter((c) => !c.done && (c.kind === 'car' || c.kind === 'walk')).sort((a, b) => b.age - a.age);
    for (const c of live) if (c.kind === 'car' ? carStep(c) : walkerStep(c)) return 'customer';
    if (taskStep()) return 'task';
    if (cash.opened && !cash.closed && time.minutes >= 360 && customers.blocking().length === 0 && use('caixa-registradora', 'close')) return 'close';
    return '';
  }
  /** Plays the open night until its summary is on the screen (or `budgetMs` of real time is used up: call again to go on). */
  async function playNight(budgetMs = 20000) {
    const t0 = performance.now(), day = progression.st.day; let idle = 0;
    while (performance.now() - t0 < budgetMs && !B.dead) {
      if (G.state !== 'play') return 'left';
      if (B.stopAt && time.minutes >= B.stopAt) return 'summary';
      if (progression.st.day !== day) return 'next';
      const h1 = document.querySelector('#modal h1')?.textContent || '';
      if (/^NOITE .*FECHADA/.test(h1)) return 'summary';
      const a = decide();
      if (a) idle = 0; else { idle++; step(20); }
      await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));   // the game's own awaits (dialogues, the change tray) go on between decisions
    }
    return 'budget';
  }
  const shiftOpen = () => G.shift.open;
  async function finishNight() {   // after the closing: dialogues and the summary, up to the choice
    let k = 0;
    while ((ui.modalOpen || G.shift.open) && k++ < 300) { if (!modalStep()) step(10); await new Promise((r) => setTimeout(r, 0)); if (G.state !== 'play') break; }
  }
  const sum = () => ({ day: progression.st.day, week: progression.st.week, pts: progression.night.pontos, n: { ...progression.night }, wallet: progression.st.wallet, san: Math.round(sanity.value), t: time.text() });
  // --- the day off: the same keys, at the places of the house (the anchors and points of the scene)
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function dayOffTalk() { for (let k = 0; k < 60 && ui.modalOpen; k++) { if (!modalStep()) step(2); await tick(); } }
  async function playDayOff() {
    const D = G.dayoff, casa = D.casa, P = D.player;
    const faceAt = (a, pt, dy = 0) => {
      const A = casa.anchors[a].pos, T = casa.points[pt];
      P.st.x = A[0]; P.st.z = A[2]; const dx = T[0] - A[0], dz = T[2] - A[2];
      P.st.yaw = Math.atan2(-dx, -dz); P.st.pitch = Math.atan2(T[1] + dy - 1.65, Math.hypot(dx, dz)); step(3);
    };
    const press = async () => { kd('KeyE'); step(2); ku('KeyE'); step(3); await tick(); };
    const pickItem = async (i) => { const cells = $$('#modal li[data-cell]'); if (cells[i]) { clickCell(cells[i]); step(3); await tick(); } };
    const out = { steps: [] };
    step(120); await tick();
    faceAt('telefone', 'telefone'); await press(); await dayOffTalk(); out.steps.push('recados');
    faceAt('mesaContas', 'mesaContas'); await press(); await tick();
    const n = $$('#modal li[data-cell]').length; await pickItem(0); await pickItem(1); await pickItem(n - 1); out.steps.push('contas');
    faceAt('farmaciaBalcao', 'frasco'); await press(); await tick();
    const m = $$('#modal li[data-cell]').length; await pickItem(0); await pickItem(1); await pickItem(m - 1); out.steps.push('farmacia');
    faceAt('cama', 'cama'); await press(); await pickItem(0); out.steps.push('cama');
    for (let k = 0; k < 40 && G.state === 'dayoff'; k++) { step(30); await tick(); }
    out.state = G.state; out.day = progression.st.day; out.week = progression.st.week; out.wallet = progression.st.wallet;
    return out;
  }
  /** After the closing screen of the sixth night: the balance, then the day off (or the end). Returns where the bot stands. */
  async function afterNight() {
    for (let k = 0; k < 400; k++) {
      if (G.state === 'dayoff') return 'dayoff';
      if (G.state === 'ending') return 'ending';
      if (!modalStep()) step(10);
      await tick();
      if (G.state === 'play' && !G.shift.open && !ui.modalOpen && !G.campaign.dayOffOpen) break;
    }
    return G.state;
  }
  B.playDayOff = playDayOff; B.afterNight = afterNight; B.tick = tick;
  // --- a pad the page can hold buttons on (the Gamepad API of the page, read by input.js like a real one)
  const pad = { b: new Array(17).fill(false), on: false };
  function padOn() {
    if (pad.on) return; pad.on = true;
    navigator.getGamepads = () => [{ connected: true, id: 'smoke pad', axes: [0, 0, 0, 0], buttons: pad.b.map((v) => ({ pressed: v, value: v ? 1 : 0 })) }];
  }
  function padPress(i, steps = 2) { padOn(); pad.b[i] = true; step(steps); pad.b[i] = false; step(2); }
  /** Looks at the floor in front of the player and presses "use" on nothing: the way to let go of what the hands hold. via: 'key' | 'pad' | 'touch' (a tap on the screen) */
  function dropVia(via) {
    if (via === 'pad') padPress(0, 2);
    else if (via === 'touch') { const r = O.render.canvas.getBoundingClientRect(); window.__tapAt?.(r.left + r.width / 2, r.top + r.height * 0.8); step(3); }
    else tapE();
    step(3);
  }
  B.pad = pad; B.padPress = padPress; B.dropVia = dropVia;
  B.flee = flee; B.stats = stats; B.decide = decide; B.step = step; B.wait = wait; B.use = use; B.hold = hold; B.modalStep = modalStep; B.playNight = playNight; B.finishNight = finishNight; B.sum = sum; B.say = say; B.tapE = tapE; B.confirm = confirm; B.kd = kd; B.ku = ku;
  window.__bot = B;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------
async function openPage(browser, base, kind, query) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(`${base}/o-dia-que-sobra/index.html?${query}${mobile ? '&touch' : ''}`);
  return { page, errs, ctx };
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}f6b-${name}.png` }); };

/** Plays each night of `days` on its own (a fresh page with `?debug=day:N`) and prints the points: what the goals are calibrated against. */
async function balance(browser, base, days) {
  for (const day of days) {
    const { page, errs, ctx } = await openPage(browser, base, 'desktop', `debug=day:${day}&manual&silent&skiptutorial&nointro&seed=${process.env.SEED || 1}`);
    await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
    await page.evaluate(async () => { const m = await import('/o-dia-que-sobra/src/systems/nav.js'); const G = window.__odq.game; window.__nav = m.getNav(G.world, G.player); });
    await page.evaluate(installBot, { think: Number(process.env.PACE || 0.9), walk: Number(process.env.WALK || 2.8), flee: process.env.FLEE !== '0' });
    let r = 'budget', t0 = Date.now();
    while (r === 'budget' && Date.now() - t0 < Number(process.env.MAXSEC || 300) * 1000) r = await page.evaluate(() => window.__bot.playNight(20000));
    const s = await page.evaluate((full) => { const B = window.__bot, G = window.__odq.game; return { sum: B.sum(), result: 'x', ent: G.entity.state, log: B.log.slice(full ? -4000 : -6), ending: G.campaign.endingId, chases: window.__bot.stats, dbg: { h1: document.querySelector('#modal h1')?.textContent, dlg: G.ui.dialogueOpen, modal: G.ui.modalOpen, closed: G.cash.closed, opened: G.cash.opened, blocking: G.customers.blocking().map((c) => `${c.kind}:${c.state}:${c.id}`), carry: G.inventory.carry && G.inventory.carry.kind, st: G.state, open: G.shift.open, pend: G.tasks.pending().map((t) => t.id) } }; }, Boolean(process.env.LOG));
    const n = s.sum.n;
    console.log(`night ${day} (week ${s.sum.week}): ${r} pts=${s.sum.pts} fuel=${n.abastecimentos} shop=${n.vendas} tasks=${n.tarefas} undone=${n.naoFeitas} errors=${n.erros} complaints=${n.reclamacoes} sanity=${s.sum.san} ending=${s.ending} chases=${s.chases.chases}${errs.length ? ' CONSOLE: ' + errs.join(' | ') : ''}`);
    if (r === 'budget') console.log(`  stuck at ${s.sum.t}; last actions: ${s.log.slice(-6).join(' / ')} ${JSON.stringify(s.dbg)}`);
    if (process.env.LOG) console.log(s.log.filter((x) => (process.env.LOGALL ? /./ : /ERROR|COMPL|cannot|short|CHASE|flee|fled/).test(x)).join('\n'));
    await ctx.close();
  }
}

/** A finger tap at (x, y): pointer events on the touch layer with real coordinates (this Chrome's emulated tap reports 0,0 for pointer events; a phone does not). */
const touchTap = (page, x, y) => page.evaluate(([x, y]) => {
  const z = document.getElementById('lookzone'), o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 41, pointerType: 'touch', isPrimary: true };
  z.dispatchEvent(new PointerEvent('pointerdown', o)); z.dispatchEvent(new PointerEvent('pointerup', o));
}, [x, y]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titles = (page) => page.evaluate(() => [...document.querySelectorAll('#modal li[data-cell]')].map((x) => x.textContent.trim()));
const clickText = async (page, txt) => {
  const ok = await page.evaluate((t) => { const c = [...document.querySelectorAll('#modal [data-cell]')].find((x) => x.textContent.trim().startsWith(t)); if (!c) return false; const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.right - 8, clientY: r.top + r.height / 2 })); return true; }, txt);
  await page.evaluate(() => window.__odq.advance(3));
  return ok;
};
const advance = (page, n = 3) => page.evaluate((n) => window.__odq.advance(n), n);
const botInstall = async (page, extra = {}) => {
  await page.evaluate(async () => { const m = await import('/o-dia-que-sobra/src/systems/nav.js'); const G = window.__odq.game; window.__nav = m.getNav(G.world, G.player); });
  await page.evaluate(installBot, { think: Number(process.env.PACE || 0.9), walk: Number(process.env.WALK || 2.8), flee: true, ...extra });
};
/** Plays the open night to its summary. Returns the last answer of the bot. */
async function playToSummary(page, maxSec = 240) {
  let r = 'budget', t0 = Date.now();
  while (r === 'budget' && Date.now() - t0 < maxSec * 1000) r = await page.evaluate(() => window.__bot.playNight(20000));
  return r;
}

/** The Sun: a chase from the same place in the lot, twice. Running for the light lives; standing still in the dark is the ending 4. */
async function ending4(browser, base, kind, tag) {
  let page, errs, ctx;
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:20&manual&silent&skiptutorial&nointro'));
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  // the chase, twice from the same place in the parking lot: the player who runs for the light lives; the one who stops in the dark is reached
  const runs = await page.evaluate(() => {
    const B = window.__bot, G = window.__odq.game, out = {};
    const snap = JSON.stringify(G.progression.st);
    G.player.st.x = -12; G.player.st.z = 6; G.entity.force('perseguicao', 4);
    for (let i = 0; i < 120 && G.entity.state !== 'perseguicao'; i++) G.step(1 / 60);
    B.flee();
    for (let i = 0; i < 60 * 12; i++) G.step(1 / 60);
    out.fled = { done: G.entity.done, state: G.entity.state, game: G.state };
    G.entity.reset(); G.player.st.frozen = false;
    // a dark corner of the lot: no light within 7 m
    let dark = null;
    for (let x = -24; x <= -2 && !dark; x += 2) for (let z = -10; z <= 22 && !dark; z += 2) {
      if (G.player.blocked(x, z)) continue;
      let lit = false; for (let a = 0; a < 8 && !lit; a++) for (const r of [0, 3.5, 7]) if (G.lighting.litAt(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r)) lit = true;
      if (!lit) dark = { x, z };
    }
    out.dark = dark;
    G.player.st.x = dark ? dark.x : -22; G.player.st.z = dark ? dark.z : 18; G.entity.force('perseguicao', 4);
    for (let i = 0; i < 60 * 40 && G.state === 'play'; i++) G.step(1 / 60);
    out.stopped = { done: G.entity.done, state: G.entity.state, game: G.state, ending: G.campaign.endingId, t: G.time.text(), dark };
    void snap; return out;
  });
  ok(!runs.fled.done && runs.fled.state !== 'ataque', `${tag}: running for the light escapes the Sun (${JSON.stringify(runs.fled)})`);
  ok(runs.stopped.game === 'ending' && runs.stopped.ending === 4, `${tag}: standing still in the dark is the ending 4 (${JSON.stringify(runs.stopped)})`);
  await page.waitForFunction(() => window.__odq.game.state === 'ending', null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.evaluate(async () => { (await import('/o-dia-que-sobra/src/cutscenes/player.js')).skipCutscene(); });
  await page.waitForFunction(() => /FIM \\d/.test(document.querySelector('#modal h2')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  await advance(page, 3);
  const e4 = await page.evaluate(() => ({ h1: document.querySelector('#modal h1')?.textContent, h2: document.querySelector('#modal h2')?.textContent, card: window.__odq.game.save.card.endings.slice(), fits: (() => { const b = document.querySelector('#modal .box')?.getBoundingClientRect(); return Boolean(b) && b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; })() }));
  ok(e4.h2 === 'FIM 4' && e4.fits, `${tag}: ending 4 screen (${e4.h1}, ${e4.h2}, endings on the card ${JSON.stringify(e4.card)}, fits: ${e4.fits})`);
  await shot(page, `smoke-fim4-${tag}`);
  ok(errs.length === 0, `${tag}: console clean through ending 4 (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();

}

/** The lock (design: "the door holds for 20 s, then it gives up"), in the dark so that the light cannot hide a defect: locked, the player lives past 20 s and the Sun gives up; unlocked, it attacks. */
async function lockRoom(browser, base, kind, tag, room) {
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:20&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const res = await page.evaluate(async (only) => {
    const G = window.__odq.game, B = window.__bot, out = {}; window.__trace = false;
    for (const a of G.world.posto.breakers.areas) G.world.posto.breakers.setOn(a, false);
    G.inventory.flash.on = false;
    const rooms = { escritorio: { x: 5.5, z: 17.2, door: 'trancar-porta-escritorio' }, estoque: { x: 13, z: 16.2, door: 'trancar-porta-estoque' } };
    for (const [name, R] of Object.entries(rooms).filter(([n]) => n === only)) {
      for (const lockIt of [true, false]) {
        G.entity.reset(); G.player.st.frozen = false;
        G.player.st.x = R.x; G.player.st.z = R.z; G.player.st.yaw = 0;
        for (const d of G.world.doorIds()) G.world.setDoor(d, 0);
        G.entity.force('perseguicao', 4);
        G.entity.ent.root.position.set(-30, 0, -30);                   // far away while the player locks (a tap on the real target)
        // outside the room, 3 to 6 m from its main door, on free floor (the Sun starts in the dark, away from the player)
        const dc = G.world.anchor(R.door.replace('trancar-', '')).pos; let spot = null;
        for (let r = 3; r <= 6 && !spot; r += 0.5) for (let k = 0; k < 16 && !spot; k++) {
          const x = dc.x + Math.cos(k * Math.PI / 8) * r, z = dc.z + Math.sin(k * Math.PI / 8) * r;
          if (!G.player.blocked(x, z) && G.world.areaAt(x, 1, z)?.id !== name) spot = { x, z };
        }
        const lit = G.lighting.litAt(R.x, R.z) || G.lighting.litAt(spot.x, spot.z);
        let locked = false;
        if (lockIt) { locked = B.use(R.door, 'lock'); }
        G.player.st.x = R.x; G.player.st.z = R.z;
        G.entity.ent.root.position.set(spot.x, 0, spot.z); G.entity.S.aware = 6; G.entity.S.target = { x: R.x, z: R.z }; G.entity.S.t = 0;
        let t = 0, attacked = false, gaveUp = null;
        const lockedDoors = [...G.entity.locked];
        for (let i = 0; i < 60 * 45 && G.state === 'play'; i++) {
          G.step(1 / 60); t = i / 60;
          if (window.__trace && i % 90 === 0) (out.trace ||= []).push([Math.round(t), G.entity.state, G.entity.ent.root.position.toArray().map((v) => +v.toFixed(1)).join(','), G.entity.S.target ? 'T' : '-', +(G.entity.S.search || 0).toFixed(1), +G.entity.nr.bang.toFixed(1), G.entity.nr.lockedDoor, G.entity.nr.hasFree, +G.entity.S.stuck.toFixed(1)].join(' '));
          if (G.entity.state === 'sumindo' || G.entity.state === 'ausente') { gaveUp = t; break; }
        }
        attacked = G.state === 'ending' || G.entity.state === 'ataque';
        const nr = G.entity.nr; out[`${name}-${lockIt ? 'locked' : 'open'}`] = { dbg: { pos: G.entity.ent.root.position.toArray().map((v) => +v.toFixed(1)), stuck: +G.entity.S.stuck.toFixed(2), bang: +nr.bang.toFixed(1), door: nr.lockedDoor, free: nr.hasFree, search: G.entity.S.search, target: G.entity.S.target }, lit, locked, lockedDoors, attacked, gaveUp, state: G.entity.state, game: G.state };
        if (G.state === 'ending') { G.campaign.reset?.(); G.showTitle?.(); return out; }
      }
    }
    return out;
  }, room);
  console.log(JSON.stringify({ ...res, trace: undefined }));
  for (const name of [room]) {
    const L = res[`${name}-locked`], O = res[`${name}-open`];
    if (!L || !O) { ok(false, `${tag}: lock test of ${name} did not run (${JSON.stringify(res)})`); continue; }
    ok(!L.lit && !O.lit, `${tag}: the ${name} test runs with the lights out`);
    ok(L.locked && L.lockedDoors.length >= 2, `${tag}: locking the ${name} closes every way in (${L.lockedDoors.join(', ')})`);
    ok(!L.attacked && L.gaveUp !== null && L.gaveUp >= 18, `${tag}: locked ${name}: the Sun bangs on the doors and gives up after ${L.gaveUp && L.gaveUp.toFixed(1)} s, nobody attacked`);
    ok(O.attacked, `${tag}: unlocked ${name}: the Sun reaches the player in the dark (${JSON.stringify({ gaveUp: O.gaveUp, state: O.state })})`);
  }
  ok(errs.length === 0, `${tag}: console clean in the lock test (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

async function lockCheck(browser, base, kind, tag) { for (const room of ['escritorio', 'estoque']) await lockRoom(browser, base, kind, tag, room); }

/** Round 2 of phase 6: the clock and the goal on the HUD, the marker and the arrow, choosing a goal (keys, pad, touch), and letting go of what the hands hold. */
async function roundTwo(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const rectOf = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, text: e.textContent }; }, sel);
  const hit = (a, b) => a && b && !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  const draw = () => advance(page, 2);

  // ---- D: the clock and the day's goal line are on the HUD without opening the clipboard
  await ev(() => window.__bot.step(60 * 20)); await draw();
  const clk = await rectOf('#calhud b'), cal = await rectOf('#calhud span');
  ok(clk && /^\d\d:\d\d$/.test(clk.text.trim()), `${tag}: the HUD shows the clock without the clipboard (${clk && clk.text})`);
  ok(cal && /SEMANA 1/.test(cal.text), `${tag}: ...and the calendar line under it (${cal && cal.text})`);
  await shot(page, `smoke2-hud-relogio-${tag}`);

  // ---- C: choose a goal on the clipboard
  const keyOf = () => ev(() => window.__odq.game.goals.key);
  await ev(() => { const B = window.__bot; B.kd('KeyQ'); B.step(1); B.ku('KeyQ'); B.step(2); });
  ok(await ev(() => window.__odq.game.ui.sheetOpen), `${tag}: Q opens the clipboard`);
  if (touch) {
    const row = await page.evaluate(() => { const r = document.querySelector('#sheet li[data-g]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, g: document.querySelector('#sheet li[data-g]').dataset.g }; });
    await touchTap(page, row.x, row.y); await ev(() => window.__bot.step(3));
    ok((await keyOf()) === row.g, `${tag}: a tap on a row of the clipboard marks that goal (${row.g})`);
  } else {
    await ev(() => { const B = window.__bot; B.kd('Tab'); B.step(1); B.ku('Tab'); B.step(2); });
    ok((await keyOf())?.startsWith('t:'), `${tag}: Tab on the open clipboard marks the first goal (${await keyOf()})`);
  }
  await draw();
  await shot(page, `smoke2-prancheta-objetivo-${tag}`);
  await ev(() => { const B = window.__bot; B.kd('KeyQ'); B.step(1); B.ku('KeyQ'); B.step(2); });
  await draw();
  const gh = await rectOf('#goalhud');
  ok(gh && /^\u25B6 /.test(gh.text), `${tag}: the marked goal stays on the HUD with the clipboard closed ("${gh && gh.text}")`);
  if (touch) { for (const sel of ['#btns', '#stickbase', '#pausebtn']) { const o = await rectOf(sel); ok(!hit(gh, o) && !hit(clk, o), `${tag}: the clock and the goal do not cover ${sel}`); } }
  const view = await ev(() => { const G = window.__odq.game, g = G.goals; const m = g.marker.position; const dx = m.x - G.player.st.x, dz = m.z - G.player.st.z; return { vis: g.visible, yawTo: Math.atan2(-dx, -dz), dist: Math.hypot(dx, dz), at: [m.x, m.y, m.z].map((v) => +v.toFixed(1)) }; });
  ok(view.vis, `${tag}: the marker is in the world over the place (${view.at.join(', ')}, ${view.dist.toFixed(1)} m away)`);
  // looking away: the arrow on the edge; looking at it: no arrow
  await ev((y) => { const G = window.__odq.game; G.player.st.yaw = y + Math.PI; G.player.st.pitch = 0; window.__odq.advance(2); }, view.yawTo);
  const ar = await rectOf('#arrow i');
  const vp = page.viewportSize();
  ok(ar && ar.l > -2 && ar.r < vp.width + 2 && ar.t > -2 && ar.b < vp.height + 2, `${tag}: out of sight, an arrow on the edge of the screen points to it (${ar && [ar.l, ar.t].map(Math.round)})`);
  await shot(page, `smoke2-seta-${tag}`);
  await ev((y) => { const G = window.__odq.game; const m = G.goals.marker.position; G.player.st.yaw = y; G.player.st.pitch = Math.atan2(m.y - G.player.st.eye, Math.hypot(m.x - G.player.st.x, m.z - G.player.st.z)); window.__odq.advance(2); }, view.yawTo);
  ok(!(await rectOf('#arrow i')), `${tag}: looking at the place, the arrow goes away`);
  await shot(page, `smoke2-marcador-${tag}`);
  // done: the marker leaves
  const k0 = await keyOf();
  await ev(() => { const B = window.__bot; B.hold('caixa-registradora', () => window.__odq.game.cash.opened, 4); B.step(3); window.__odq.advance(2); });
  const gone = await ev(() => { const G = window.__odq.game; return { key: G.goals.key, vis: G.goals.visible, hud: !document.getElementById('goalhud').hidden, opened: G.cash.opened }; });
  if (k0 === 't:abrir-caixa') ok(gone.opened && !gone.key && !gone.vis && !gone.hud, `${tag}: doing the goal removes the marker and the HUD line (${JSON.stringify(gone)})`);
  // an order of the night is a goal too: a car that has ordered
  const ord = await ev(async () => {
    const G = window.__odq.game, B = window.__bot;
    for (let i = 0; i < 60 * 90 && !G.customers.list.some((c) => c.kind === 'car' && !['arriving', 'leaving'].includes(c.state)); i++) B.step(1);
    const c = G.customers.list.find((q) => q.kind === 'car'); if (!c) return { none: true };
    B.use('cliente' + c.id, 'talk'); for (let i = 0; i < 40; i++) { if (!B.modalStep()) B.step(3); await new Promise((r) => setTimeout(r, 0)); }
    const os = G.goals.orders(); G.goals.select(os[0]?.key); B.step(2); window.__odq.advance(2);
    return { orders: os.map((o) => o.text), key: G.goals.key, hud: document.getElementById('goalhud').textContent, vis: G.goals.visible };
  });
  ok(!ord.none && ord.orders.length > 0 && ord.vis && /Bomba/.test(ord.hud), `${tag}: an open order is a goal too (${JSON.stringify(ord)})`);
  if (!touch) {
    // the pad: Select opens the clipboard, the d-pad right and left choose the goal
    const pd = await ev(() => { const B = window.__bot, G = window.__odq.game; G.goals.select(null); if (G.ui.sheetOpen) G.ui.toggleSheet(false); B.padPress(8); const open = G.ui.sheetOpen; B.padPress(15); const a = G.goals.key; B.padPress(15); const b = G.goals.key; B.padPress(14); const c = G.goals.key; return { open, a, b, c }; });
    ok(pd.open && pd.a && pd.b && pd.a !== pd.b && pd.c === pd.a, `${tag}: with a pad, Select opens the clipboard and the d-pad left/right choose the goal (${JSON.stringify(pd)})`);
    await ev(() => window.__odq.game.ui.toggleSheet(false));
  }
  // a cutscene never shows the marker nor the arrow: the real path, an ending that plays its cutscene with a goal marked
  const cs = await ev(async () => {
    const G = window.__odq.game; G.goals.select('t:banheiro'); G.step(1 / 60); window.__odq.advance(2);
    const before = G.goals.marker.visible && !document.getElementById('goalhud').hidden;
    G.campaign.ending(2);
    const m = await import('/o-dia-que-sobra/src/cutscenes/player.js');
    for (let i = 0; i < 150 && !m.isCutsceneActive(); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 600));
    const during = { state: G.state, marker: G.goals.marker.visible, arrow: !document.getElementById('arrow').hidden, active: m.isCutsceneActive() };
    m.skipCutscene(); await new Promise((r) => setTimeout(r, 200));
    return { before, during };
  });
  ok(cs.before && cs.during.active && !cs.during.marker && !cs.during.arrow, `${tag}: a cutscene does not show the marker or the arrow (${JSON.stringify(cs)})`);
  ok(errs.length === 0, `${tag}: console clean (goals) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** Letting go of what the hands hold: boxes, the cleaning kit, the ladder and the bag stay on the floor where the player stands, can be picked up again, and the task stays coherent. */
async function dropCheck(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const vp = page.viewportSize();
  // lets go the way the device does: a key press on nothing, the pad's A on nothing, or a tap on an empty place of the screen
  const letGo = async (via) => {
    // look at a place with nothing to use (a person aims at bare floor or wall to let go)
    await ev(() => { const G = window.__odq.game; const y0 = G.player.st.yaw; for (const dy of [0, 1.2, -1.2, 2.4, 3.6]) for (const p of [-0.9, 0.5, -0.4]) { G.player.st.yaw = y0 + dy; G.player.st.pitch = p; G.interaction.update(0, { acts: [], actDown: false }); if (!G.interaction.current) return; } });
    if (via === 'touch') { await touchTap(page, vp.width / 2, vp.height * 0.86); await ev(() => window.__bot.step(4)); }
    else await ev((v) => window.__bot.dropVia(v), via);
    await ev(() => window.__odq.advance(2));
  };
  const hintShown = () => ev(() => { const h = document.getElementById('carryhint'); return h.hidden ? null : h.textContent; });
  const where = (sel) => ev((sel) => { const G = window.__odq.game, p = new G.world.r.THREE.Vector3(); eval(sel).getWorldPosition(p); return { d: Math.hypot(p.x - G.player.st.x, p.z - G.player.st.z), y: p.y, area: Boolean(G.world.areaAt(p.x, 1, p.z)), x: p.x, z: p.z }; }, sel);
  const expectHint = { keyboard: /E em lugar vazio/, pad: /A em lugar vazio/, touch: /toque em lugar vazio/ };
  const via = touch ? 'touch' : 'key';
  if (touch) await ev(() => window.__odq.input.setLastDevice('touch'));    // a phone's first touch does this

  // each object is let go in a place of its own in the shop (a kit left lying must not be under the next let-go)
  const moveTo = (i) => ev((i) => { const G = window.__odq.game, c = []; for (let x = 3; x <= 15; x += 1.5) for (let z = 4; z <= 11; z += 1.5) if (!G.player.blocked(x, z) && G.world.areaAt(x, 1, z)?.id === 'loja') c.push([x, z]); const p = c[Math.floor(c.length * (i + 0.5) / 5)] || c[0]; G.player.st.x = p[0]; G.player.st.z = p[1]; G.player.st.yaw = 0; }, i);
  await moveTo(0);
  // ---- a stock-room box
  const b0 = await ev(() => {
    const G = window.__odq.game, B = window.__bot; G.tasks.startRestock(1, 7);
    const sh = [...G.tasks.shelves.values()].find((q) => !q.done), bx = G.world.boxes[sh.boxN];
    return { n: sh.boxN, id: bx.id, row: sh.row.id, took: B.use(bx.id, 'box'), carry: G.inventory.carry && G.inventory.carry.kind };
  });
  ok(b0.took && b0.carry === 'caixa', `${tag}: the box is in the hands (${JSON.stringify(b0)})`);
  if (touch) await ev(() => { window.__odq.input.setLastDevice('touch'); const G = window.__odq.game; G.bus.emit('carry', G.inventory.carry); });   // (the bot's key presses had made it a keyboard)
  const hint = await hintShown();
  ok(hint && (touch ? expectHint.touch : expectHint.keyboard).test(hint), `${tag}: the screen says how to let go ("${hint}")`);
  await shot(page, `smoke2-solta-dica-${tag}`);
  await letGo(via);
  const b1 = await ev(() => { const G = window.__odq.game, sh = [...G.tasks.shelves.values()].find((q) => !q.done), bx = G.world.boxes[sh.boxN]; const p = new G.world.r.THREE.Vector3(); bx.root.getWorldPosition(p); return { carry: G.inventory.carry, vis: bx.root.visible, d: Math.hypot(p.x - G.player.st.x, p.z - G.player.st.z), y: p.y, blocked: G.player.blocked(p.x, p.z), area: Boolean(G.world.areaAt(p.x, 1, p.z)), taskOpen: G.tasks.pending().some((t) => t.id === 'repor-' + sh.row.id), done: sh.done, used: G.tasks.boxes.get(sh.boxN).used, taken: G.tasks.boxes.get(sh.boxN).taken }; });
  ok(!b1.carry && b1.vis && b1.d < 1.5 && Math.abs(b1.y) < 0.05 && b1.area && !b1.blocked, `${tag}: the box lies on the floor where the player stands (${JSON.stringify({ d: +b1.d.toFixed(2), y: +b1.y.toFixed(2), blocked: b1.blocked })})`);
  ok(b1.taskOpen && !b1.done && !b1.used && !b1.taken, `${tag}: a box on the floor is not on the shelf: the job stays open`);
  await shot(page, `smoke2-solta-caixa-${tag}`);
  const b2 = await ev(() => { const G = window.__odq.game, B = window.__bot, sh = [...G.tasks.shelves.values()].find((q) => !q.done), bx = G.world.boxes[sh.boxN]; const took = B.use(bx.id, 'box again'); const carry = G.inventory.carry && G.inventory.carry.kind; B.hold('prat-' + sh.row.id, () => sh.done, 14); return { took, carry, done: sh.done }; });
  ok(b2.took && b2.carry === 'caixa' && b2.done, `${tag}: the box is picked up again and the shelf is restocked (${JSON.stringify(b2)})`);

  // ---- the cleaning kit
  await moveTo(1);
  const k0 = await ev(() => {
    const G = window.__odq.game, B = window.__bot; G.chores.spawn('mancha');
    const t = G.tasks.list.find((q) => q.kind === 'mancha'), tid = 'trab-' + t.id.slice(7);
    const took = B.use('kit-limpeza', 'kit'); B.hold(tid, () => false, 1.3);
    const pr = G.interaction.targets.get(tid).hold.progress(); return { task: t.id, tid, took, carry: G.inventory.carry && G.inventory.carry.kind, progress: +(pr || 0).toFixed(2) };
  });
  ok(k0.took && k0.carry === 'limpeza' && k0.progress > 0.2 && k0.progress < 0.95, `${tag}: the squeegee is in the hands and the stain is half clean (${JSON.stringify(k0)})`);
  await letGo(via);
  const k1 = await ev((k0) => { const G = window.__odq.game, P = G.world.posto.props, o = new G.world.r.THREE.Vector3(); P.rodo.dyn.getWorldPosition(o); const b = new G.world.r.THREE.Vector3(); P.balde.dyn.getWorldPosition(b); return { pl: [G.player.st.x, G.player.st.z].map((v) => +v.toFixed(1)), ro: [o.x, o.z].map((v) => +v.toFixed(1)), par: P.rodo.dyn.parent && P.rodo.dyn.parent.type, carry: G.inventory.carry, rodo: P.rodo.dyn.visible, balde: P.balde.dyn.visible, dr: Math.hypot(o.x - G.player.st.x, o.z - G.player.st.z), db: Math.hypot(b.x - G.player.st.x, b.z - G.player.st.z), open: G.tasks.pending().some((t) => t.id === k0.task), prog: +(G.interaction.targets.get(k0.tid).hold.progress() || 0).toFixed(2), idle: G.interaction.targets.get(k0.tid).label().text, area: Boolean(G.world.areaAt(o.x, 1, o.z)) }; }, k0);
  ok(!k1.carry && k1.rodo && k1.balde && k1.dr < 1.6 && k1.db < 1.6 && k1.area, `${tag}: the squeegee and the bucket lie on the floor where the player stands (${JSON.stringify({ dr: +k1.dr.toFixed(2), db: +k1.db.toFixed(2), pl: k1.pl, ro: k1.ro, carry: k1.carry && k1.carry.kind, vis: [k1.rodo, k1.balde] })})`);
  ok(k1.open && /pegue o rodo/i.test(k1.idle), `${tag}: the stain stays open and says to pick the kit up again ("${k1.idle}")`);
  const k2 = await ev((k0) => { const G = window.__odq.game, B = window.__bot; const took = B.use('kit-limpeza', 'kit again'); const prog = +(G.interaction.targets.get(k0.tid).hold.progress() || 0).toFixed(2); B.hold(k0.tid, () => !G.tasks.pending().some((t) => t.id === k0.task), 8); return { took, prog, done: !G.tasks.pending().some((t) => t.id === k0.task) }; }, k0);
  ok(k2.took && k2.prog >= 0.2 && k2.done, `${tag}: the kit is picked up again, what was cleaned stays cleaned (${k2.prog}) and the job is finished (${JSON.stringify(k2)})`);
  await ev(() => window.__bot.step(20));
  if (await ev(() => window.__odq.game.inventory.carry?.kind === 'limpeza')) { await letGo(via); }

  // ---- the ladder
  await moveTo(2);
  const l0 = await ev(() => {
    const G = window.__odq.game, B = window.__bot; G.chores.spawn('lampada');
    const t = G.tasks.list.find((q) => q.kind === 'lampada'); const took = B.use('escada-pegar', 'ladder');
    return { task: t.id, lamp: 'lamp-' + t.id.slice(8), took, carry: G.inventory.carry && G.inventory.carry.kind };
  });
  ok(l0.took && l0.carry === 'escada', `${tag}: the ladder is in the hands (${JSON.stringify(l0)})`);
  await letGo(touch ? 'touch' : 'pad');
  const l1 = await ev(() => { const G = window.__odq.game, L = G.world.posto.ladder, p = new G.world.r.THREE.Vector3(); L.root.getWorldPosition(p); return { carry: G.inventory.carry, vis: L.root.visible, d: Math.hypot(p.x - G.player.st.x, p.z - G.player.st.z), area: Boolean(G.world.areaAt(p.x, 1, p.z)), at: L.at }; });
  ok(!l1.carry && l1.vis && l1.d < 2.5 && l1.area && !l1.at, `${tag}: the ladder lies on the floor where the player stands (let go with ${touch ? 'a touch' : 'the pad'}; ${l1.d.toFixed(2)} m)`);
  await shot(page, `smoke2-solta-escada-${tag}`);
  const l2 = await ev((l0) => { const G = window.__odq.game, B = window.__bot; const took = B.use('escada-pegar', 'ladder again'); const carry = G.inventory.carry && G.inventory.carry.kind; const placed = B.use(l0.lamp, 'place'); B.hold(l0.lamp, () => !G.tasks.pending().some((t) => t.id === l0.task), 8); return { took, carry, placed, done: !G.tasks.pending().some((t) => t.id === l0.task) }; }, l0);
  ok(l2.took && l2.carry === 'escada' && l2.done, `${tag}: the ladder is picked up again and the lamp is changed (${JSON.stringify(l2)})`);

  // ---- the bag of rubbish
  await moveTo(3);
  const g0 = await ev(() => {
    const G = window.__odq.game, B = window.__bot; G.chores.spawn('lixo');
    const t = G.tasks.list.find((q) => q.kind === 'lixo'); const id = t.id.slice(5), took = B.use('saco-' + id, 'bag');
    return { task: t.id, id, took, carry: G.inventory.carry && G.inventory.carry.kind };
  });
  ok(g0.took && g0.carry === 'saco', `${tag}: the bag is in the hands (${JSON.stringify(g0)})`);
  await letGo(via);
  const g1 = await ev((g0) => { const G = window.__odq.game, f = G.chores.floorBag(g0.id); return { carry: G.inventory.carry, d: f ? Math.hypot(f.x - G.player.st.x, f.z - G.player.st.z) : null, tgt: G.interaction.targets.has('saco-solto-' + g0.id), open: G.tasks.pending().some((t) => t.id === g0.task) }; }, g0);
  ok(!g1.carry && g1.d !== null && g1.d < 1.5 && g1.tgt && g1.open, `${tag}: the bag lies on the floor, can be picked up, and the job stays open (${JSON.stringify(g1)})`);
  const g2 = await ev((g0) => { const G = window.__odq.game, B = window.__bot; const took = B.use('saco-solto-' + g0.id, 'bag again'); const carry = G.inventory.carry && G.inventory.carry.kind; B.use('conteiner-saco', 'bin'); return { took, carry, done: !G.tasks.pending().some((t) => t.id === g0.task) }; }, g0);
  ok(g2.took && g2.carry === 'saco' && g2.done, `${tag}: the bag is picked up again and goes to the container (${JSON.stringify(g2)})`);
  // nothing falls out of the map or into a wall: every let-go spot above was checked; the end of the night puts everything back
  ok(errs.length === 0, `${tag}: console clean (let go) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The calculator of the closing: opened and closed without leaving the closing, used with the keyboard, the pad and touch, fits the phone, and fills nothing by itself. */
async function calcCheck(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // the closing, the real way: the till is open, it is six o'clock, and the player uses the register
  const opened = await ev(async () => {
    const G = window.__odq.game, B = window.__bot;
    B.hold('caixa-registradora', () => G.cash.opened, 4); G.customers.clear(); G.time.skip(360 - G.time.minutes + 1); B.step(30);
    const used = B.use('caixa-registradora', 'close'); for (let i = 0; i < 20 && !document.querySelector('#modal .keypad'); i++) { B.step(2); await new Promise((r) => setTimeout(r, 0)); }
    return { used, title: document.querySelector('#modal h1')?.textContent, calcKey: Boolean(document.querySelector('#modal [data-k=calc]')) };
  });
  ok(opened.title === 'FECHAR O CAIXA' && opened.calcKey, `${tag}: the closing opens with a CALCULADORA key (${JSON.stringify(opened)})`);
  const lcd = () => ev(() => document.querySelector('#modal .lcd')?.dataset.v ?? null);
  const kdisp = () => ev(() => document.querySelector('#modal .kdisp')?.textContent.replace(/\s+/g, ' ').trim());
  const clickSel = (sel) => ev((sel) => { const e = document.querySelector(sel); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, sel);
  await clickSel('#modal [data-k=calc]');
  ok(await ev(() => Boolean(document.querySelector('#modal .box.calc')) && document.querySelectorAll('#modal .lcd svg').length === 10), `${tag}: the calculator opens beside the keypad with a ten-cell seven-segment display`);
  await shot(page, `smoke2-calculadora-${tag}`);
  // fits the screen, and does not cover the value field
  const geo = await ev(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }; return { calc: r('#modal .box.calc'), pad: r('#modal .box.keypad'), disp: r('#modal .kdisp'), vw: innerWidth, vh: innerHeight }; });
  const inside = (g) => g.l >= -1 && g.r <= geo.vw + 1 && g.t >= -1 && g.b <= geo.vh + 1;
  const overlap = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  ok(inside(geo.calc) && inside(geo.pad), `${tag}: the keypad and the calculator both fit ${geo.vw}x${geo.vh}`);
  ok(!overlap(geo.calc, geo.disp), `${tag}: the calculator does not cover the value field`);
  if (!touch) {
    // the keyboard: 12 x 3 + 4 = 40 (Enter also does =), Backspace, C
    for (const k of ['1', '2', '*', '3', '+', '4', '=']) await page.keyboard.press(k);
    ok((await lcd()) === '40', `${tag}: keyboard 12 * 3 + 4 = gives ${await lcd()}`);
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    for (const k of ['9', '/', '3', 'Enter']) await page.keyboard.press(k);
    ok((await lcd()) === '3', `${tag}: Backspace, 9 / 3 Enter gives ${await lcd()}`);
    await page.keyboard.press('c'); ok((await lcd()) === '0', `${tag}: C clears it`);
    for (const k of ['1', '0', '/', '0', '=']) await page.keyboard.press(k);
    ok((await lcd()) === 'E', `${tag}: dividing by zero shows E`);
    await page.keyboard.press('c');
    for (const k of ['2', '.', '5', '*', '4', '=']) await page.keyboard.press(k);
    ok((await lcd()) === '10', `${tag}: decimals, 2.5 * 4 = ${await lcd()}`);
    // Tab: the keyboard goes back to the count, the calculator keeps its number; the count is typed by the player
    await page.keyboard.press('Tab');
    for (const k of ['4', '0', '0', '0']) await page.keyboard.press(k);
    await advance(page, 2);
    ok((await kdisp()) === 'R$ 40,00' && (await lcd()) === '10', `${tag}: the count is typed by hand and the result fills nothing (count "${await kdisp()}", calculator ${await lcd()})`);
    // closing and opening again without leaving the closing: the count stays
    await clickSel('#modal [data-k=calc]');
    ok(await ev(() => !document.querySelector('#modal .box.calc') && Boolean(document.querySelector('#modal .keypad'))), `${tag}: the calculator closes and the closing is still there`);
    ok((await kdisp()) === 'R$ 40,00', `${tag}: ...with the typed count kept (${await kdisp()})`);
    await page.keyboard.press('c');
    ok(await ev(() => Boolean(document.querySelector('#modal .box.calc'))), `${tag}: the C key opens the calculator again`);
    // the pad: LB moves between the panels, the d-pad moves on the keys, A presses
    const pd = await ev(() => { const B = window.__bot; B.padPress(4); const f1 = document.querySelector('#modal .box.calc.focus') ? 'calc' : 'pad'; B.padPress(4); const f2 = document.querySelector('#modal .box.calc.focus') ? 'calc' : 'pad'; B.padPress(0); const a = document.querySelector('#modal .lcd').dataset.v; B.padPress(15); B.padPress(0); const b = document.querySelector('#modal .lcd').dataset.v; return { f1, f2, a, b }; });
    ok(pd.f1 === 'pad' && pd.f2 === 'calc' && pd.a === '7' && pd.b === '78', `${tag}: with a pad, LB changes panel, the d-pad moves and A presses (${JSON.stringify(pd)})`);
    // Esc closes only the calculator
    await page.keyboard.press('Escape');
    ok(await ev(() => !document.querySelector('#modal .box.calc') && Boolean(document.querySelector('#modal .keypad'))), `${tag}: Esc closes the calculator, not the closing`);
  } else {
    // touch: tap the keys of the calculator and of the keypad
    for (const k of ['1', '2', '*', '3', '+', '4', '=']) await clickSel(`#modal [data-calc="${k}"]`);
    ok((await lcd()) === '40', `${tag}: touch 12 x 3 + 4 = gives ${await lcd()}`);
    for (const k of ['4', '0', '0', '0']) await clickSel(`#modal [data-k="${k}"]`);
    ok((await kdisp()) === 'R$ 40,00' && (await lcd()) === '40', `${tag}: the count is typed on the keypad and the calculator result stays apart (count "${await kdisp()}")`);
    await shot(page, `smoke2-calculadora-contagem-${tag}`);
    await clickSel('#modal [data-calc="close"]');
    ok(await ev(() => !document.querySelector('#modal .box.calc') && Boolean(document.querySelector('#modal .keypad'))), `${tag}: FECHAR closes the calculator and the closing stays`);
  }
  // and the closing goes on: the count is confirmed
  await clickSel('#modal [data-k=ok]');
  await ev(async () => { for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 0)); } });
  const after = await ev(() => document.querySelector('#modal h1')?.textContent);
  ok(/CAIXA FECHADO/.test(after || ''), `${tag}: the count typed by the player closes the till (${after})`);
  ok(errs.length === 0, `${tag}: console clean (calculator) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The whole check on one viewport. `full` also plays the week that turns, the endings and the film mode (desktop). */
async function fullCheck(browser, base, kind, full) {
  const tag = kind === 'mobile' ? 'celular' : 'desktop';
  console.log(`\n== ${tag} ==`);
  // ---- the title, the options (saved in this browser), the controls
  let { page, errs, ctx } = await openPage(browser, base, kind, `debug&manual${full ? '' : '&silent'}`);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await advance(page, 5);
  let items = await titles(page);
  ok(items.includes('COMEÇAR') && items.includes('OPÇÕES') && items.includes('CONTROLES'), `${tag}: title menu has COMEÇAR, OPÇÕES, CONTROLES (${items.join(' | ')})`);
  const tooWide = await page.evaluate(() => { const b = document.querySelector('#modal .box'); const r = b.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1; });
  ok(!tooWide, `${tag}: the title box fits the screen`);
  await shot(page, `smoke-titulo-${tag}`);
  await clickText(page, 'OPÇÕES');
  await shot(page, `smoke-opcoes-${tag}`);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#modal li[data-cell]')].map((x) => ({ t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height) })));
  ok(rows.every((x) => x.h >= 44 && x.h <= 47), `${tag}: every line of the options menu is a 44 px target on one line (${rows.map((x) => x.h).join(',')})`);
  ok(!rows.some((x) => /^[\u203A]/.test(x.t)), `${tag}: no arrow is left alone on a line`);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('o-dia-que-sobra.opts') || '{}'));
  for (const t of ['VOLUME', 'SENSIBILIDADE', 'REDUZIR', 'TAMANHO']) ok(await clickText(page, t), `${tag}: option "${t}" is there and takes a click`);
  await clickText(page, 'VOLUME'); await clickText(page, 'VOLUME');
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('o-dia-que-sobra.opts')).volume)) === 1, `${tag}: the volume stops at 10 / 10 and does not fall to 0`);
  const saved = await page.evaluate(() => ({ o: JSON.parse(localStorage.getItem('o-dia-que-sobra.opts') || '{}'), ts: document.getElementById('app').style.getPropertyValue('--ts') }));
  ok(saved.o.reduceFlash === true && saved.o.text === 1.25 && saved.o.volume === 1 && saved.o.look === 1.25 && saved.ts === '1.25', `${tag}: the options are saved in their own key (${JSON.stringify(saved.o)}) and the text size applies (--ts ${saved.ts})`);
  void before;
  await shot(page, `smoke-opcoes-mudadas-${tag}`);
  await clickText(page, 'VOLTAR');
  await clickText(page, 'CONTROLES'); await shot(page, `smoke-controles-${tag}`);
  for (let i = 0; i < 2; i++) { await clickText(page, 'MOSTRAR'); }
  await shot(page, `smoke-controles-toque-${tag}`);
  await clickText(page, 'VOLTAR');
  // reload: the options come back
  await page.reload(); await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  const again = await page.evaluate(() => ({ o: JSON.parse(localStorage.getItem('o-dia-que-sobra.opts') || '{}'), ts: document.getElementById('app').style.getPropertyValue('--ts') }));
  ok(again.o.reduceFlash === true && again.ts === '1.25', `${tag}: after a reload the options are still there`);
  // put the defaults back for the rest (the text size is checked above; the rest runs at the normal size)
  await page.evaluate(() => localStorage.removeItem('o-dia-que-sobra.opts')); await page.reload();
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await advance(page, 3);

  // ---- a new game: the arrival and the manager play (skippable), then the tutorial night
  await page.evaluate(() => { const c = [...document.querySelectorAll('#modal [data-cell]')].find((x) => /COME|NOVO/.test(x.textContent)); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => window.__odq.game.state === 'cutscene', null, { timeout: 20000 }).catch(() => {});
  let st = await page.evaluate(() => window.__odq.game.state);
  ok(st === 'cutscene', `${tag}: a new game starts with the cutscene (state ${st})`);
  await sleep(2500);
  const cs = await page.evaluate(async () => { const m = await import('/o-dia-que-sobra/src/cutscenes/player.js'); return { active: m.isCutsceneActive(), overlay: Boolean(document.getElementById('cs-overlay')), skip: Boolean(document.getElementById('cs-skip')) }; });
  ok(cs.active && cs.overlay && cs.skip, `${tag}: the cutscene is on screen with its PULAR button (${JSON.stringify(cs)})`);
  await shot(page, `smoke-chegada-${tag}`);
  await page.evaluate(async () => { (await import('/o-dia-que-sobra/src/cutscenes/player.js')).skipCutscene(); });
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 20000 }).catch(() => {});
  st = await page.evaluate(() => window.__odq.game.state);
  ok(st === 'play', `${tag}: skipping the cutscene goes to the first night (state ${st})`);
  await advance(page, 3);
  const coach = await page.evaluate(() => { const c = document.getElementById('coach'); return !c.hidden && c.textContent.length > 20; });
  ok(coach, `${tag}: the first night teaches the controls on the screen`);
  await shot(page, `smoke-tutorial-${tag}`);
  await botInstall(page);
  await page.evaluate(() => { window.__bot.stopAt = 150; });
  let r = await playToSummary(page);
  await advance(page, 3); await page.evaluate(() => window.__odq.game.ui.toggleSheet(true)); await advance(page, 3);
  await shot(page, `smoke-prancheta-${tag}`);
  const sheetFits = await page.evaluate(() => { const b = document.getElementById('sheet').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; });
  ok(sheetFits, `${tag}: the clipboard fits the screen`);
  await page.evaluate(() => window.__odq.game.ui.toggleSheet(false));
  await page.evaluate(() => { window.__bot.stopAt = 0; });
  r = await playToSummary(page, 280);
  const n1 = await page.evaluate(() => window.__bot.sum());
  ok(r === 'summary' && n1.n.tarefas >= 3, `${tag}: the tutorial night played to its summary (${r}; ${n1.n.tarefas} tasks, ${n1.n.atendimentos} customers, ${n1.pts} points)`);
  await advance(page, 3); await shot(page, `smoke-resumo-noite-${tag}`);
  const fitsS = await page.evaluate(() => { const b = document.querySelector('#modal .box').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; });
  ok(fitsS, `${tag}: the night summary fits the screen`);
  // the pause, with the options inside
  await page.evaluate(() => { window.__odq.game.openPause(); }); await advance(page, 3); await shot(page, `smoke-pausa-${tag}`);
  await page.evaluate(() => { window.__odq.game.resume(); });
  // ---- save and reload: the next night is on the card
  await page.evaluate(() => window.__bot.finishNight()); await advance(page, 2);
  const mid = await page.evaluate(() => { const G = window.__odq.game; return { state: G.state, day: G.progression.st.day, hasRun: G.save.hasRun() }; });
  ok(mid.hasRun, `${tag}: the night is saved on the memory card (${JSON.stringify(mid)})`);
  await page.reload(); await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 }); await advance(page, 3);
  items = await titles(page);
  ok(items.some((x) => x.startsWith('CONTINUAR')), `${tag}: after a reload the title offers to continue (${items[0]})`);
  await clickText(page, 'CONTINUAR'); await advance(page, 3);
  const cont = await page.evaluate(() => { const G = window.__odq.game; return { state: G.state, day: G.progression.st.day }; });
  ok(cont.state === 'play' && cont.day === 2, `${tag}: continuing opens night 2 (${JSON.stringify(cont)})`);
  ok(errs.length === 0, `${tag}: console clean in the first part (${errs.slice(0, 3).join(' | ')})`);
  const missing = await page.evaluate(() => window.__odq.game.audioSys.missing);
  if (full) ok(missing.length === 0, `${tag}: no sound the game asked for is missing (${missing.join(', ')})`);
  await ctx.close();

  // ---- a week that turns: night 6, the balance, the day off played, night 7
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:6&manual&silent&skiptutorial&nointro'));
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  r = await playToSummary(page, 280);
  await page.evaluate(() => window.__bot.finishNight()).catch(() => {});
  let where = await page.evaluate(() => window.__bot.afterNight());
  await advance(page, 3);
  ok(where === 'dayoff', `${tag}: the sixth night closes the week and goes to the day off (${r} -> ${where})`);
  await sleep(300); await advance(page, 5); await shot(page, `smoke-folga-${tag}`);
  const obj = await page.evaluate(() => { const o = document.getElementById('objective'); const r = o.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(o).fontSize); return { text: o.textContent, hidden: o.hidden, lines: Math.round((r.height - 16) / (fs * 1.2)) }; });
  ok(!obj.hidden && obj.text.length > 10 && obj.text.length <= 52 && obj.lines <= 2, `${tag}: the day off shows its goal in at most two lines ("${obj.text}", ${obj.lines} lines)`);
  const wk = await page.evaluate(() => window.__bot.playDayOff());
  ok(wk.state === 'play' && wk.day === 7 && wk.week === 2, `${tag}: the day off was played (${wk.steps.join(', ')}) and night 7 of week 2 opened (${JSON.stringify(wk)})`);
  await shot(page, `smoke-noite7-${tag}`);
  ok(errs.length === 0, `${tag}: console clean through the week turn (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
  if (!full) { await roundTwo(browser, base, kind, tag); await dropCheck(browser, base, kind, tag); await calcCheck(browser, base, kind, tag); return; }

  // ---- endings: 2 (the second goal lost, played) and 4 (the Sun reaches a player who stops in the dark)
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'debug=miss:1,day:12&manual&silent&skiptutorial&nointro'));
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  r = await playToSummary(page, 280);
  await page.evaluate(() => window.__bot.finishNight()).catch(() => {}); await page.evaluate(() => window.__bot.afterNight()).catch(() => {});
  const endScreen = async (id) => {
    await page.waitForFunction(() => window.__odq.game.state === 'ending', null, { timeout: 30000 }).catch(() => {});
    await sleep(800);
    await page.evaluate(async () => { (await import('/o-dia-que-sobra/src/cutscenes/player.js')).skipCutscene(); });
    await page.waitForFunction(() => /FIM \d/.test(document.querySelector('#modal h2')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    await advance(page, 3);
    const e = await page.evaluate(() => ({ h1: document.querySelector('#modal h1')?.textContent, h2: document.querySelector('#modal h2')?.textContent, card: window.__odq.game.save.card.endings.slice(), fits: (() => { const b = document.querySelector('#modal .box')?.getBoundingClientRect(); return Boolean(b) && b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; })() }));
    ok(e.h2 === `FIM ${id}` && e.fits, `${tag}: ending ${id} reached by playing (${e.h1}, ${e.h2}, endings on the card ${JSON.stringify(e.card)}, the screen fits: ${e.fits})`);
    await shot(page, `smoke-fim${id}-${tag}`);
  };
  await endScreen(2);
  ok(errs.length === 0, `${tag}: console clean through ending 2 (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  await ending4(browser, base, kind, tag);
  await lockCheck(browser, base, kind, tag);
  await roundTwo(browser, base, kind, tag);
  await dropCheck(browser, base, kind, tag);
  await calcCheck(browser, base, kind, tag);

  // ---- the film mode
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'film'));
  await page.waitForFunction(() => typeof window.setup === 'function', null, { timeout: 60000 });
  const f = await page.evaluate(async () => { const r = await window.setup({ width: 960, height: 540, seed: 1 }); const first = r.views.find((v) => v.startsWith('chegada')); window.shot({ from: first, duration: 2 }); const url = window.frame(1); return { views: r.views.length, actions: r.actions, anchors: r.anchors.length, chegada: r.views.some((v) => v.startsWith('chegada')), gerente: r.views.some((v) => v.startsWith('gerente')), finais: r.views.filter((v) => /^final/.test(v)).length, jpeg: url.startsWith('data:image/jpeg') }; });
  ok(f.views > 100 && f.chegada && f.gerente && f.finais >= 5 && f.jpeg && f.actions.includes('escurecer'), `${tag}: film mode setup() gives ${f.views} views (${f.finais} of the endings), ${f.anchors} anchors, a frame renders`);
  ok(errs.length === 0, `${tag}: console clean in film mode (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  if (ARGS[0] === '--balance') await balance(browser, base, ARGS.slice(1).map(Number));
  else if (ARGS[0] === '--mobile') await fullCheck(browser, base, 'mobile', false);
  else if (ARGS[0] === '--calc') { await calcCheck(browser, base, 'desktop', 'desktop'); await calcCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--drops') { await dropCheck(browser, base, 'desktop', 'desktop'); if (!process.env.ONLYDESK) await dropCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--round2') { await roundTwo(browser, base, 'desktop', 'desktop'); await roundTwo(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--lock') await lockCheck(browser, base, 'desktop', 'desktop');
  else if (ARGS[0] === '--ending4') await ending4(browser, base, 'desktop', 'desktop');
  else if (ARGS[0] === '--tutorial') {
    const { page, errs } = await openPage(browser, base, 'desktop', 'debug&manual&silent&nointro');
    await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
    await clickText(page, 'COMEÇAR'); await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 20000 });
    await botInstall(page); await page.evaluate(() => { window.__bot.stopAt = 90; });
    let r = 'budget'; while (r === 'budget') r = await page.evaluate(() => window.__bot.playNight(20000));
    console.log(await page.evaluate(() => JSON.stringify({ sum: window.__bot.sum(), obj: document.getElementById('objective').textContent, till: (() => { const G = window.__odq.game, t = G.interaction.targets.get('caixa-registradora'); return { enabled: t.enabled(), opened: G.cash.opened, modal: G.ui.modalOpen, dlg: G.ui.dialogueOpen, carry: G.inventory.carry, cur: G.interaction.current?.target.id }; })(), log: window.__bot.log.slice(-25) }, null, 0)));
    console.log(errs.join('\n') || 'no console errors');
  }
  else { await fullCheck(browser, base, 'desktop', true); await fullCheck(browser, base, 'mobile', false); }
} finally { await browser.close(); srv.close(); }
if (failures.length) { console.error('\nSMOKE FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
