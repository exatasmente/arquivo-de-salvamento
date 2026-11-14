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
  G.bus.on('prep:end', (e) => say(`PREP END left=${e.left}`)); G.bus.on('prep:punched', (t) => say(`PREP punched ${t}`));
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
  /** Is `id` among the actions that fit the aim? Then make it the selected one (the player's R / RB), so E does it. */
  function settle(id) {
    interaction.update(0, EMPTY());
    const all = interaction.current?.all || []; if (!all.some((c) => c.target.id === id)) return false;
    for (let i = 0; i < all.length && interaction.current.target.id !== id; i++) { interaction.cycle(1); interaction.update(0, EMPTY()); }
    return interaction.current?.target?.id === id;
  }
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
    const spot = aimAt(c, () => settle(id));
    if (!spot) { say(`cannot aim at ${id}`); return false; }
    wait(B.cfg.think + Math.max(0, dist - 1.5) / B.cfg.walk);
    if (!settle(id)) return false;   // what we aimed at changed while we thought (the phone stopped ringing)
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
    const spot = aimAt(c, () => settle(id));
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
    const spot = aimAt(c, () => { interaction.update(0, EMPTY()); return kp.keyAtRay(player.eyePos(), dirOf(player.st.yaw, player.st.pitch), 2.8) === k && settle('teclado' + n); }, [0.8, 1.0, 1.3]);
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
      if (B.only && !(t.id === B.only || t.id.startsWith(B.only))) continue;
      if (t.id === 'ponto') { if (use('ponto', 'punch')) return true; continue; }
      if (t.kind === 'repor') {
        const sh = tasks.shelves.get(t.id.replace('repor-', '')); if (!sh || sh.done) continue;
        const bx = world.boxes.find((b) => b && b.n === sh.boxN); if (bx && use(bx.id, 'box')) return true;
      } else if (t.kind === 'lixo') { if (use('saco-' + t.id.slice(5), 'bag')) return true; }
      else if (t.kind === 'mancha') { if (use('kit-limpeza', 'kit')) return true; }
      else if (t.kind === 'lampada') {
        const lid = 'lamp-' + t.id.slice(8);
        if (world.posto.ladder?.at === t.id.slice(8)) { if (hold(lid, () => t.done, 8)) return true; }       // the ladder stands under it: climb and change the tube
        else if (use('escada-pegar', 'ladder')) return true;
      }
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
  /** The preparation (23:00 to 00:00) is not what a test is about: step the clock to midnight. */
  B.untilOpen = () => { for (let i = 0; i < 60 * 400 && time.minutes < 0 && G.state === 'play'; i++) G.step(DT); };
  B.aimAt = aimAt; B.settle = settle; B.centerOf = centerOf; B.EMPTY = EMPTY;
  B.flee = flee; B.stats = stats; B.decide = decide; B.step = step; B.wait = wait; B.use = use; B.hold = hold; B.modalStep = modalStep; B.playNight = playNight; B.finishNight = finishNight; B.sum = sum; B.say = say; B.tapE = tapE; B.confirm = confirm; B.kd = kd; B.ku = ku;
  window.__bot = B;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------
async function openPage(browser, base, kind, query) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked/.test(m.text())) errs.push(`${m.type()}: ${m.text()}`); });      // (the tests block service workers so that a route can see every request)
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(`${base}/o-dia-que-sobra/index.html?${query}${mobile ? '&touch' : ''}`);
  return { page, errs, ctx };
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}f6d-${name}.png` }); };

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
    if (process.env.LOG) console.log(s.log.filter((x) => (process.env.LOGALL ? /./ : /ERROR|COMPL|cannot|short|CHASE|flee|fled|PREP/).test(x)).join('\n'));
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
  const { prep, ...rest } = extra; extra = rest;
  await page.evaluate(async () => { const m = await import('/o-dia-que-sobra/src/systems/nav.js'); const G = window.__odq.game; window.__nav = m.getNav(G.world, G.player); });
  await page.evaluate(installBot, { think: Number(process.env.PACE || 0.9), walk: Number(process.env.WALK || 2.8), flee: true, ...extra });
  if (!prep) await page.evaluate(() => window.__bot.untilOpen());      // (tests that are not about the preparation start at 00:00)
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
  await ev(() => window.__odq.game.goals.select(null));       // (the night opened with the punch clock already marked: a tap on it would unmark it)
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
    if (via === 'touch') { await ev(() => window.__odq.advance(2)); await touchTap(page, vp.width / 2, vp.height / 2); await ev(() => window.__bot.step(4)); }      // (the finger on the very spot that was found empty)
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

/** Letting go standing on a door (the shop's, the office's, the stock room's): nothing lands within a metre of it and the doorway stays open, or the player is told "Aqui não". */
async function doorDropCheck(browser, base, kind, tag) {
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const res = await page.evaluate(() => {
    const G = window.__odq.game, B = window.__bot, THREE = G.world.r.THREE, out = [];
    G.tasks.startRestock(1, 7); G.chores.spawn('mancha'); G.chores.spawn('lampada'); G.chores.spawn('lixo');
    const sh = [...G.tasks.shelves.values()].find((q) => !q.done), bx = G.world.boxes[sh.boxN];
    const lixo = G.tasks.list.find((q) => q.kind === 'lixo').id.slice(5);
    const things = {
      caixa: { take: () => B.use(bx.id, 'box'), pos: () => { const p = new THREE.Vector3(); bx.root.getWorldPosition(p); return [p]; }, again: () => B.use(bx.id, 'box again') },
      kit: { take: () => B.use('kit-limpeza', 'kit'), pos: () => ['rodo', 'balde'].map((n) => { const p = new THREE.Vector3(); G.world.posto.props[n].dyn.getWorldPosition(p); return p; }), again: () => B.use('kit-limpeza', 'kit again') },
      escada: { take: () => B.use('escada-pegar', 'ladder'), pos: () => { const p = new THREE.Vector3(); G.world.posto.ladder.root.getWorldPosition(p); return [p]; }, again: () => B.use('escada-pegar', 'ladder again') },
      saco: { take: () => B.use('saco-' + lixo, 'bag'), pos: () => { const f = G.chores.floorBag(lixo); return f ? [f] : []; }, again: () => B.use('saco-solto-' + lixo, 'bag again') },
    };
    for (const [name, th] of Object.entries(things)) {
      if (!th.take()) { out.push({ name, error: 'could not take it' }); continue; }
      for (const door of ['porta-loja', 'porta-escritorio', 'porta-estoque']) {
        const a = G.world.anchor(door).pos;
        G.player.st.x = a.x; G.player.st.z = a.z; G.player.st.yaw = 0.7;
        const y0 = G.player.st.yaw; let found = false;
        for (const dy of [0, 1.2, -1.2, 2.4, 3.6]) for (const p of [-0.9, 0.5, -0.4]) { if (found) break; G.player.st.yaw = y0 + dy; G.player.st.pitch = p; G.interaction.update(0, { acts: [], actDown: false }); if (!G.interaction.current) found = true; }
        // the player stands ON the door anchor; E on nothing lets go
        const had = G.inventory.carry && G.inventory.carry.kind;
        const hints = []; const off = G.bus.on('hint', (t) => hints.push(t));
        B.dropVia('key'); G.step(1 / 60);
        const dropped = !G.inventory.carry;
        const dists = dropped ? th.pos().map((p) => Math.hypot(p.x - a.x, p.z - a.z)) : [];
        out.push({ name, door, had, dropped, minDist: dists.length ? +Math.min(...dists).toFixed(2) : null, doorClear: !G.player.blocked(a.x, a.z), refused: !dropped && hints.some((h) => /Aqui não/.test(h)) });
        if (dropped) { if (!th.again()) out.push({ name, door, error: 'could not pick it up again' }); }
      }
      if (G.inventory.carry) { G.player.st.x = 8; G.player.st.z = 7; B.dropVia('key'); }
    }
    return out;
  });
  for (const r of res) {
    if (r.error) { ok(false, `${tag}: ${r.name} ${r.door || ''}: ${r.error}`); continue; }
    ok((r.dropped && r.minDist >= 1.0 && r.doorClear) || r.refused, `${tag}: ${r.name} let go standing on ${r.door}: ${r.dropped ? 'lands ' + r.minDist + ' m from the door, the doorway is free' : 'refused with "Aqui não"'}`);
  }
  ok(errs.length === 0, `${tag}: console clean (let go at doors) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** Actions that overlap in the aim: all are listed (one line each, with its key / button / touch area) and the player chooses; with one action nothing changes. */
async function overlapCheck(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const rows = () => ev(() => { const c = document.getElementById('choice'); return c.hidden ? null : { n: c.querySelectorAll('.crow').length, texts: [...c.querySelectorAll('.crow span')].map((x) => x.textContent), keys: [...c.querySelectorAll('.crow b')].map((x) => x.textContent), sel: [...c.querySelectorAll('.crow')].findIndex((x) => x.classList.contains('sel')), foot: c.querySelector('small')?.textContent || '' }; });
  const vp = page.viewportSize();

  // ---- the counter: the customer's product and hiding behind the counter
  const w = await ev(async () => {
    const G = window.__odq.game, B = window.__bot;
    const c = G.customers.spawnWalker({ seed: 23, tutorial: true, produtos: ['biscoito', 'lata'], pagamento: 20 });
    for (let i = 0; i < 60 * 60 && c.state !== 'scanning'; i++) { B.step(1); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const item = `item${c.id}-0`, hide = 'esconder-esconderijo4', t = G.interaction.targets.get(item);
    const ctr = B.centerOf(t); let spot = null;
    if (ctr) spot = B.aimAt(ctr, () => { G.interaction.update(0, B.EMPTY()); const all = G.interaction.current?.all || []; return all.some((x) => x.target.id === item) && all.some((x) => x.target.id === hide); }, [0.6, 0.9, 1.2, 1.6]);
    G.interaction.update(0, B.EMPTY());
    return { state: c.state, item, spot: Boolean(spot), ids: (G.interaction.current?.all || []).map((x) => x.target.id), cid: c.id };
  });
  ok(w.spot && w.ids.length >= 2 && w.ids[0] === w.item && w.ids[w.ids.length - 1] === 'esconder-esconderijo4', `${tag}: at the counter the product and hiding both fit the aim, the product first and hiding last (${w.ids.join(' > ')})`);
  await ev(() => window.__odq.advance(2));
  const r1 = await rows();
  ok(r1 && r1.n >= 2 && /Pegar/.test(r1.texts[0]) && /Esconder/.test(r1.texts[r1.n - 1]), `${tag}: the screen lists every action, one line each (${r1 && r1.texts.join(' | ')})`);
  if (!touch) ok(r1 && r1.keys[0] === 'E' && r1.keys[1] === '2' && /R troca/.test(r1.foot), `${tag}: the keyboard keys are shown: E for the selected, the number of the others, R changes (${r1 && r1.keys.join(',')} / ${r1 && r1.foot})`);
  await shot(page, `smoke3-lista-balcao-${tag}`);
  // choosing: touch taps the line; keyboard presses 2; E does the selected (the product by default)
  const choose = async (i) => {
    if (touch) { const p = await ev((i) => { const r = document.querySelectorAll('#choice .crow')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i); await touchTap(page, p.x, p.y); await ev(() => window.__bot.step(4)); }
    else { await ev((i) => { const B = window.__bot; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + (i + 1), bubbles: true })); B.step(2); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit' + (i + 1), bubbles: true })); B.step(3); }, i); }
  };
  if (!touch) { await ev(() => window.__bot.tapE()); } else { await ev(() => window.__bot.step(1)); }
  if (touch) {
    // a finger on the overlapped spot opens the list; then a tap on a line does that action: first the hiding (the last line)
    const sc = await ev(() => { const G = window.__odq.game, c = G.interaction.targets.get('esconder-esconderijo4'); const p = G.world.r.THREE; const ctr = window.__bot.centerOf(G.interaction.targets.get(`item${window.__cid}-0`) || c); return null; });
    void sc;
  }
  const afterE = await ev(() => { const G = window.__odq.game; return { carry: G.inventory.carry && G.inventory.carry.kind, hidden: G.entity.hidden }; });
  if (!touch) ok(afterE.carry === 'item' && !afterE.hidden, `${tag}: E does the first one, the product (${JSON.stringify(afterE)})`);
  if (!touch) {
    // put the product on the scanner? no: let go of it and choose hiding by its number
    await ev(() => { const G = window.__odq.game; G.inventory.drop(); });
  }
  void w;

  // ---- the Sun about: hiding comes first, so one E, one A or one touch hides, with a product in the aim (the achado of round 3)
  const hideSetup = await ev(async () => {
    const G = window.__odq.game, B = window.__bot;
    G.inventory.clearCarry(); G.player.st.carryHeavy = false; G.entity.reset(); G.player.st.frozen = false;
    const cid = G.customers.list.find((c) => c.kind === 'walk')?.id, item = `item${cid}-1`, hide = 'esconder-esconderijo4', t = G.interaction.targets.get(item);
    const ctr = B.centerOf(t);
    const both = () => { G.interaction.update(0, B.EMPTY()); const all = G.interaction.current?.all || []; return all.some((x) => x.target.id === item) && all.some((x) => x.target.id === hide); };
    const quiet = both() ? true : Boolean(B.aimAt(ctr, both, [0.6, 0.9, 1.2, 1.6]));
    const orderQuiet = (G.interaction.current?.all || []).map((x) => x.target.id);
    G.entity.force('perseguicao', 4); G.entity.ent.root.position.set(-30, 0, -30); G.interaction.update(0, B.EMPTY());
    const orderChase = (G.interaction.current?.all || []).map((x) => x.target.id);
    window.__hide = { item, spot: { x: G.player.st.x, z: G.player.st.z, yaw: G.player.st.yaw, pitch: G.player.st.pitch } };
    return { quiet, orderQuiet, orderChase, item };
  });
  ok(hideSetup.quiet && hideSetup.orderQuiet[0] === hideSetup.item && hideSetup.orderQuiet.at(-1) === 'esconder-esconderijo4', `${tag}: with the Sun away, the product comes first (${hideSetup.orderQuiet.join(' > ')})`);
  ok(hideSetup.orderChase[0] === 'esconder-esconderijo4', `${tag}: with the Sun chasing, "Esconder-se" is the first of the list (${hideSetup.orderChase.join(' > ')})`);
  await ev(() => window.__odq.advance(2)); await shot(page, `smoke5-lista-esconder-primeiro-${tag}`);
  const heardKeys = await ev(() => { const c = document.getElementById('choice'); return c.hidden ? null : [...c.querySelectorAll('.crow')].map((x) => x.textContent.trim()); });
  ok(heardKeys && /Esconder/.test(heardKeys[0]), `${tag}: the list shows "Esconder-se" in the first line (${heardKeys && heardKeys.join(' | ')})`);
  if (!touch) {
    const k1 = await ev(() => { const G = window.__odq.game, B = window.__bot; B.tapE(); B.step(3); return { hidden: G.entity.hidden, carry: G.inventory.carry && G.inventory.carry.kind }; });
    ok(k1.hidden && !k1.carry, `${tag}: ONE press of E hides (${JSON.stringify(k1)})`);
    // out again, and the same with the pad: one press of A
    const k2 = await ev(() => { const G = window.__odq.game, B = window.__bot, h = window.__hide; B.tapE(); B.step(3); const out = !G.entity.hidden; G.entity.reset(); G.player.st.frozen = false; Object.assign(G.player.st, { x: h.spot.x, z: h.spot.z, yaw: h.spot.yaw, pitch: h.spot.pitch }); G.entity.force('perseguicao', 4); G.entity.ent.root.position.set(-30, 0, -30); G.interaction.update(0, B.EMPTY()); B.padPress(0, 3); return { out, hidden: G.entity.hidden, carry: G.inventory.carry && G.inventory.carry.kind }; });
    ok(k2.out && k2.hidden && !k2.carry, `${tag}: E gets out, and ONE press of A on the pad hides too (${JSON.stringify(k2)})`);
  } else {
    // a finger on the product: with the Sun about the first touch hides, with no list in between
    const p = await ev(() => { const G = window.__odq.game, B = window.__bot, h = window.__hide, t = G.interaction.targets.get(h.item), v = B.centerOf(t).clone(); G.entity.leaveHide?.(); G.entity.reset(); G.player.st.frozen = false; Object.assign(G.player.st, { x: h.spot.x, z: h.spot.z, yaw: h.spot.yaw, pitch: h.spot.pitch }); G.entity.force('perseguicao', 4); G.entity.ent.root.position.set(-30, 0, -30); const cam = G.world.r.camera; window.__odq.advance(2); cam.updateMatrixWorld(true); v.project(cam); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight }; });
    await touchTap(page, p.x, p.y); await ev(() => window.__bot.step(4));
    const k = await ev(() => { const G = window.__odq.game; return { hidden: G.entity.hidden, choosing: G.interaction.choosing, carry: G.inventory.carry && G.inventory.carry.kind }; });
    ok(k.hidden && !k.choosing && !k.carry, `${tag}: ONE touch on the spot hides, without opening the list (${JSON.stringify(k)})`);
  }
  await ev(() => { const G = window.__odq.game; G.entity.leaveHide?.(); G.entity.reset(); G.player.st.frozen = false; G.inventory.clearCarry(); });

  // ---- the car: the nozzle and the customer, with the nozzle in the hands
  const car = await ev(async () => {
    const G = window.__odq.game, B = window.__bot;
    for (const c of [...G.customers.list]) if (!c.done) c.state === 'leaving' || G.customers.clear();
    G.customers.clear(); G.entity.leaveHide?.(); G.player.st.frozen = false; G.inventory.clearCarry(); G.player.st.carryHeavy = false;
    const c = G.customers.spawnCar({ pump: 2, seed: 5, valor: 3000, combustivel: 'comum' });
    for (let i = 0; i < 60 * 40 && ['arriving'].includes(c.state); i++) { B.step(1); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    B.use(`cliente${c.id}`, 'talk'); for (let i = 0; i < 40; i++) { if (!B.modalStep()) B.step(3); await new Promise((r) => setTimeout(r, 0)); }
    B.use(`bico2-${c.fuel}`, 'nozzle');
    const t = G.interaction.targets.get(`tampa${c.id}`), ctr = B.centerOf(t), both = [`tampa${c.id}`, `cliente${c.id}`];
    const spot = B.aimAt(ctr, () => { G.interaction.update(0, B.EMPTY()); const all = G.interaction.current?.all || []; return both.every((id) => all.some((x) => x.target.id === id)); }, [0.9, 1.2, 1.6, 2.0]);
    G.interaction.update(0, B.EMPTY());
    window.__cid = c.id;
    return { id: c.id, spot: Boolean(spot), ids: (G.interaction.current?.all || []).map((x) => x.target.id), carry: G.inventory.carry && G.inventory.carry.kind };
  });
  ok(car.spot && car.carry === 'bico' && car.ids.length >= 2, `${tag}: at the car with the nozzle in the hands, the tank cap and the customer both fit (${car.ids.join(' > ')})`);
  await ev(() => window.__odq.advance(2));
  const r2 = await rows();
  ok(r2 && r2.n >= 2, `${tag}: ...and both are listed (${r2 && r2.texts.join(' | ')})`);
  await shot(page, `smoke3-lista-carro-${tag}`);
  const state = () => ev(() => { const G = window.__odq.game, c = G.customers.list.find((q) => q.kind === 'car'); return { carry: G.inventory.carry && G.inventory.carry.kind, nozzleIn: c.nozzleIn }; });
  if (!touch) {
    // 2 does the second action (the customer): the nozzle stays in the hands; R then E also does it; the pad does it with RB and A; E alone does the first (the cap)
    await choose(1); let st = await state();
    ok(st.carry === 'bico' && !st.nozzleIn, `${tag}: the key 2 does the second action, the customer, and the nozzle stays in the hands (${JSON.stringify(st)})`);
    await ev(() => { const B = window.__bot; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); B.step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true })); B.step(2); window.__odq.advance(2); });
    const rr = await rows(); ok(rr && rr.sel === 1 && rr.keys[1] === 'E', `${tag}: R moves the selection to the second line, which now shows E (${rr && rr.keys.join(',')}, selected ${rr && rr.sel})`);
    await ev(() => { const B = window.__bot; B.padPress(5); B.step(1); window.__odq.advance(2); });
    const rp = await rows(); ok(rp && rp.sel === 0, `${tag}: RB on the pad changes it back (selected ${rp && rp.sel})`);
    await ev(() => { const B = window.__bot; B.padPress(5); B.padPress(0); });
    st = await state(); ok(st.carry === 'bico' && !st.nozzleIn, `${tag}: with the pad, RB then A does the second action (${JSON.stringify(st)})`);
    await ev(() => { const B = window.__bot; B.padPress(5); window.__odq.advance(2); });
    await ev(() => { const B = window.__bot; B.padPress(0); });
    st = await state(); ok(st.nozzleIn && !st.carry, `${tag}: with the pad, A on the first line puts the nozzle in the tank (${JSON.stringify(st)})`);
  } else {
    // a finger on the overlapped spot opens the list, and a tap on a line does that action
    await ev(() => { const G = window.__odq.game; G.player.st.yaw += 0.32; G.interaction.update(0, window.__bot.EMPTY()); window.__odq.advance(2); });   // the cap off the middle: the finger is what points at it
    const tapCap = async () => {
      const p = await ev(() => { const G = window.__odq.game, c = G.customers.list.find((q) => q.kind === 'car'), t = G.interaction.targets.get(`tampa${c.id}`), v = window.__bot.centerOf(t).clone(); const cam = G.world.r.camera; cam.updateMatrixWorld(true); v.project(cam); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight }; });
      await touchTap(page, p.x, p.y); await ev(() => { window.__bot.step(2); window.__odq.advance(2); });
    };
    await tapCap();
    const rt = await rows();
    ok(rt && rt.n >= 2 && (await ev(() => window.__odq.game.interaction.choosing)), `${tag}: a finger on the cap opens the list and does nothing yet (${rt && rt.texts.join(' | ')})`);
    await shot(page, `smoke3-lista-toque-${tag}`);
    await choose(1); let st = await state();
    ok(st.carry === 'bico' && !st.nozzleIn, `${tag}: a tap on the second line does the customer's action, the nozzle stays in the hands (${JSON.stringify(st)})`);
    await tapCap(); await choose(0); st = await state();
    ok(st.nozzleIn && !st.carry, `${tag}: a tap on the first line puts the nozzle in the tank (${JSON.stringify(st)})`);
  }
  // one action only: nothing changes (a single prompt, no list)
  const one = await ev(() => { const G = window.__odq.game, B = window.__bot; const t = G.interaction.targets.get('caixa-registradora'); const ctr = B.centerOf(t); B.aimAt(ctr, () => { G.interaction.update(0, B.EMPTY()); return (G.interaction.current?.all || []).length === 1 && G.interaction.current.target.id === 'caixa-registradora'; }, [1, 1.4, 1.8]); G.interaction.update(0, B.EMPTY()); window.__odq.advance(2); return { n: (G.interaction.current?.all || []).length, choice: !document.getElementById('choice').hidden, prompt: !document.getElementById('prompt').hidden }; });
  ok(one.n === 1 && !one.choice && one.prompt, `${tag}: with one action only, the usual single prompt (${JSON.stringify(one)})`);
  ok(errs.length === 0, `${tag}: console clean (overlapping actions) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The colours of the fuels (ethanol green, regular red, none repeated, sticker and nozzle from the same table), the tutorial never names a colour, the chase toast mentions the lock, and the let-go hint follows the device in use. */
async function smallChecks(browser, base, kind, tag) {
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:20&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const col = await page.evaluate(async () => {
    const G = window.__odq.game, THREE = G.world.r.THREE, P = await import('/o-dia-que-sobra/src/scenes/paint.js');
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const nozzle = {}; for (const k of Object.keys(P.FUEL)) { const o = G.world.prop('bico', { fuel: k }); let h = null; o.traverse?.((m) => { const u = m.material?.uniforms?.uColor; if (u && h === null && m.userData?.bico) h = '#' + u.value.getHexString(); }); nozzle[k] = h; }
    return { table: Object.fromEntries(Object.entries(P.FUEL).map(([k, v]) => [k, v.color])), items: Object.fromEntries(Object.entries(G.data.items.combustiveis).map(([k, v]) => [k, v.cor])), nozzle };
  });
  const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
  ok(eq(col.table.etanol, '#4f8a4a') && /^#b/i.test(col.table.comum) && Number.parseInt(col.table.comum.slice(1, 3), 16) > 150 && Number.parseInt(col.table.comum.slice(3, 5), 16) < 90, `${tag}: ethanol is green and regular is red (${col.table.etanol}, ${col.table.comum})`);
  ok(new Set(Object.values(col.table)).size === 4, `${tag}: no two fuels share a colour (${Object.values(col.table).join(' ')})`);
  ok(Object.keys(col.table).every((k) => eq(col.table[k], col.items[k])), `${tag}: the clipboard's key (items.json) has the same colours as the nozzles and stickers`);
  ok(Object.keys(col.table).every((k) => col.nozzle[k] && eq(col.nozzle[k], col.table[k])), `${tag}: every nozzle is painted with its fuel's colour (${JSON.stringify(col.nozzle)})`);
  await page.evaluate(() => { const G = window.__odq.game, B = window.__bot, t = G.interaction.targets.get('bico1-etanol'); B.aimAt(B.centerOf(t), () => { G.interaction.update(0, B.EMPTY()); return true; }, [1.6]); G.player.st.pitch -= 0.1; window.__odq.advance(3); });
  await shot(page, `smoke4-bicos-${tag}`);
  const words = /verde|vermelh|laranja|azul|preto|amarel/i;
  const files = ['src/systems/narrative.js', 'data/customers.json', 'data/dialogue.pt-BR.json'].map((f) => [f, fs.readFileSync(path.join(here, '..', f), 'utf8')]);
  const bad = files.filter(([, t]) => words.test(t.split('\n').filter((l) => /obj\(|"texto"|tutorial|ligacao|"falas"/i.test(l)).join('\n'))).map(([f]) => f);
  ok(bad.length === 0, `${tag}: the tutorial's hints name no colour, only "essa cor" (${bad.join(', ') || 'none'})`);
  // the chase toast: week 4, a hunt due, the player in a dark corner of the lot
  const hints = await page.evaluate(() => {
    const G = window.__odq.game, out = []; G.bus.on('hint', (t) => out.push(t));
    for (const a of G.world.posto.breakers.areas) G.world.posto.breakers.setOn(a, false);
    G.player.st.x = -24; G.player.st.z = -10; G.entity.S.hunts = [{ at: 0, done: false }]; G.entity.S.cool = 0;
    for (let i = 0; i < 60 * 90 && !out.some((h) => /tranque/.test(h)) && G.state === 'play'; i++) G.step(1 / 60);
    return out;
  });
  ok(hints.some((h) => /Esconda-se ou tranque-se no estoque ou no escritório/.test(h)), `${tag}: the chase toast mentions the lock ("${hints.find((h) => /tranque/.test(h)) || hints.join(' | ')}")`);
  // the let-go hint follows the device that was used last
  const dev = await page.evaluate(() => {
    const G = window.__odq.game, B = window.__bot, out = {}; G.entity.reset(); G.player.st.frozen = false; G.player.st.x = 8; G.player.st.z = 7;
    G.tasks.startRestock(1, 7); const sh = [...G.tasks.shelves.values()].find((q) => !q.done), bx = G.world.boxes[sh.boxN]; B.use(bx.id, 'box');
    const read = () => { G.step(1 / 60); const h = document.getElementById('carryhint'); return h.hidden ? null : h.textContent; };
    out.keyboard = read();
    window.__odq.input.setLastDevice('gamepad'); out.gamepad = read();
    window.__odq.input.setLastDevice('touch'); out.touch = read();
    window.__odq.input.setLastDevice('keyboard'); out.back = read();
    return out;
  });
  ok(/E em lugar vazio/.test(dev.keyboard) && /A em lugar vazio/.test(dev.gamepad) && /toque em lugar vazio/.test(dev.touch) && /E em lugar vazio/.test(dev.back), `${tag}: the let-go hint follows the last device (${JSON.stringify(dev)})`);
  ok(errs.length === 0, `${tag}: console clean (small checks) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The preparation before the shift: a night with everything done and a night with the preparation left half done (points and pending tasks), and the new tutorial in its order. */
async function prepCheck(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  // ---- a night with the whole preparation done
  let { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:5&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page, { prep: true, think: 0.5 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__bot.step(25));
  const start = await ev(() => { const G = window.__odq.game; return { t: G.time.text(), min: G.time.minutes, hud: document.querySelector('#calhud b').textContent, prepLine: document.querySelector('#calhud i').textContent, prepTasks: G.tasks.prepList().map((t) => t.id), customers: G.customers.list.length, till: G.interaction.targets.get('caixa-registradora').enabled(), obj: document.getElementById('objective').textContent, goal: G.goals.key }; });
  ok(start.t === '23:00' && start.hud === '23:00', `${tag}: the night opens at 23:00 (${start.t}, HUD ${start.hud})`);
  ok(/^PREPARAÇÃO \d:\d\d$/.test(start.prepLine), `${tag}: the HUD shows the time left of the preparation without the clipboard ("${start.prepLine}")`);
  ok(start.prepTasks.includes('ponto') && start.prepTasks.length >= 5, `${tag}: the preparation is made of the night's own tasks (${start.prepTasks.join(', ')})`);
  ok(start.goal === 't:ponto' && start.customers === 0 && !start.till, `${tag}: the punch clock is the marked goal, nobody is in the shop and the till cannot be opened yet (${JSON.stringify({ goal: start.goal, customers: start.customers, till: start.till })})`);
  // the shop has the same colour and light in the preparation as in the shift: no medicine effect is "on" (the clock is negative: a `-1` default counted every effect as active), no
  // CSS filter on the picture, eyelids up (the coordinator's gray shop at 23:05)
  const look = () => ev(() => { const G = window.__odq.game; return { filter: document.getElementById('c').style.filter, effects: ['valores', 'lentidao', 'concentracao', 'cor', 'sono'].filter((id) => G.medication.active(id)), lid: document.getElementById('lid').hidden, t: G.time.text() }; });
  const l1 = await look();
  ok(l1.filter === '' && l1.effects.length === 0 && l1.lid, `${tag}: at ${l1.t} the picture has no filter and no medicine effect is on, like in the shift (${JSON.stringify(l1)})`);
  await ev(() => { const G = window.__odq.game; Object.assign(G.player.st, { x: 8, z: 7, yaw: 0, pitch: 0 }); for (let i = 0; i < 3 * 60 * 5; i++) G.step(1 / 60); Object.assign(G.player.st, { x: 8, z: 7, yaw: 0, pitch: 0 }); G.step(1 / 60); window.__odq.advance(2); });
  await shot(page, `smoke6-loja-2305-${tag}`);
  await ev(() => window.__odq.advance(2)); await shot(page, `smoke6-hud-preparacao-${tag}`);
  // the punch clock, with the device in hand: the pad's A on the desktop, a finger on the phone (the bot then goes on with the rest)
  const punch = await ev(() => { const G = window.__odq.game, B = window.__bot, t = G.interaction.targets.get('ponto'); const spot = B.aimAt(B.centerOf(t), () => B.settle('ponto'), [0.9, 1.3, 1.8]); window.__odq.advance(2); return { spot: Boolean(spot), label: G.interaction.current?.label?.text, punched: G.prep.punched }; });
  ok(punch.spot && punch.label === 'Bater o ponto', `${tag}: standing at the clock the prompt says "Bater o ponto" (${JSON.stringify(punch)})`);
  if (touch) {
    const p = await ev(() => { const G = window.__odq.game, v = G.world.punch.pos.clone(), cam = G.world.r.camera; cam.updateMatrixWorld(true); v.project(cam); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight }; });
    await touchTap(page, p.x, p.y); await ev(() => window.__bot.step(4));
  } else await ev(() => window.__bot.padPress(0, 3));
  const sound = await ev(() => ({ punched: window.__odq.game.prep.punched, task: window.__odq.game.tasks.list.find((t) => t.id === 'ponto').done, shown: document.querySelector('#toast')?.textContent }));
  ok(sound.punched && sound.task, `${tag}: ${touch ? 'a touch' : 'the pad'} punches the clock, the task is done ("${sound.shown}")`);
  // the till does not open before midnight, and nothing scary happens
  const early = await ev(() => { const G = window.__odq.game, B = window.__bot; const held = B.hold('caixa-registradora', () => G.cash.opened, 2); return { held, opened: G.cash.opened }; });
  ok(!early.opened, `${tag}: the till does not open before 00:00 (${JSON.stringify(early)})`);
  // the bot does the whole preparation, its own way and at a person's pace, until the clock reaches 00:00 (the clock is the game's: 3 real minutes)
  const run = await ev(async () => {
    const G = window.__odq.game, B = window.__bot; const seen = { events: 0, sun: false, cars: 0 };
    G.bus.on('event:seen', () => { seen.events++; });
    let n = 0, punchedAt = null, doneAt = null;
    while (G.time.minutes < 0 && n++ < 3000) {
      const a = B.decide(); if (!a) B.step(20);
      if (G.prep.punched && punchedAt === null) punchedAt = G.time.text();
      if (G.entity.state !== 'ausente') seen.sun = true;
      if (G.customers.list.length) seen.cars++;
      if (G.tasks.prepList().every((t) => t.done) && doneAt === null) doneAt = G.time.text();
      await new Promise((r) => setTimeout(r, 0));
    }
    return { t: G.time.text(), punchedAt, doneAt, seen, left: G.tasks.prepList().filter((t) => !t.done).map((t) => t.id), naoFeitas: G.progression.night.naoFeitas, pts: G.progression.night.pontos, tarefas: G.progression.night.tarefas };
  });
  ok(run.punchedAt && run.left.length === 0 && run.naoFeitas === 0, `${tag}: the whole preparation done before 00:00 (punched ${run.punchedAt}, all done ${run.doneAt}; left ${run.left.join(', ') || 'none'}): no task counts as not done (${run.tarefas} tasks, ${run.pts} points)`);
  ok(run.seen.events === 0 && !run.seen.sun && run.seen.cars === 0, `${tag}: no customers, no cars and no scare events during the preparation (${JSON.stringify(run.seen)})`);
  const mid = await ev(async () => { const G = window.__odq.game, B = window.__bot; for (let i = 0; i < 400 && G.time.minutes < 0.5; i++) { G.step(1 / 60); if (i % 40 === 0) await new Promise((r) => setTimeout(r, 0)); } return { t: G.time.text(), till: G.interaction.targets.get('caixa-registradora').enabled(), obj: document.getElementById('objective').textContent, abrir: G.tasks.list.some((x) => x.id === 'abrir-caixa'), prepLine: document.querySelector('#calhud i').hidden, customersOn: true }; });
  ok(mid.till && mid.abrir && mid.prepLine && /Abra o caixa/.test(mid.obj), `${tag}: at 00:00 the till can be opened, the task appears and the preparation line leaves the HUD (${JSON.stringify(mid)})`);
  await shot(page, `smoke6-meia-noite-${tag}`);
  await ev(() => { const G = window.__odq.game; for (let i = 0; i < 60 * 45; i++) G.step(1 / 60); Object.assign(G.player.st, { x: 8, z: 7, yaw: 0, pitch: 0 }); G.step(1 / 60); window.__odq.advance(2); });
  await shot(page, `smoke6-loja-0030-${tag}`);
  const l2 = await look(); ok(l2.filter === '' && l2.effects.length === 0, `${tag}: and at ${l2.t} the same (${JSON.stringify(l2)})`);
  ok(errs.length === 0, `${tag}: console clean (preparation done) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ---- a night with the preparation left half done: nothing is punched, nothing cleaned
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:5&manual&silent&skiptutorial&nointro'));
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page, { prep: true });
  const half = await ev(async () => {
    const G = window.__odq.game, B = window.__bot, toasts = []; G.bus.on('hint', (t) => toasts.push(t));
    // does the bathroom and the stain only (a person who ran out of time)
    B.only = 'mancha-'; let n = 0; while (G.time.minutes < -20 && n++ < 3000) { if (!B.decide()) B.step(20); await new Promise((r) => setTimeout(r, 0)); }
    B.only = null;
    const before = { pts: G.progression.night.pontos, naoFeitas: G.progression.night.naoFeitas, pending: G.tasks.prepList().filter((t) => !t.done).length };
    for (let i = 0; i < 60 * 200 && G.time.minutes < 0.2; i++) { G.step(1 / 60); if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const after = { pts: G.progression.night.pontos, naoFeitas: G.progression.night.naoFeitas, pending: G.tasks.prepList().filter((t) => !t.done).map((t) => t.id), penalized: G.tasks.list.filter((t) => t.penalized).length, undoneAtClose: G.tasks.undone(), toast: toasts.find((t) => /Preparação incompleta/.test(t)) };
    return { before, after };
  });
  const k = half.after.pending.length;
  ok(k >= 3 && half.after.naoFeitas === k && half.after.pts - half.before.pts === -6 * k, `${tag}: at 00:00 the ${k} tasks not done count as not done, -6 each (${half.before.pts} -> ${half.after.pts} points, ${half.after.naoFeitas} not done)`);
  ok(half.after.penalized === k && half.after.pending.length === k, `${tag}: they stay on the list, pending (${half.after.pending.join(', ')})`);
  ok(half.after.undoneAtClose <= 3 && /Preparação incompleta/.test(half.after.toast || ''), `${tag}: the closing will not count them a second time (${half.after.undoneAtClose} others pending) and the screen says it ("${half.after.toast}")`);
  const late = await ev(async () => { const G = window.__odq.game, B = window.__bot; const p0 = G.progression.night.pontos; B.use('ponto', 'late punch'); B.step(3); return { done: G.tasks.list.find((t) => t.id === 'ponto').done, gained: G.progression.night.pontos - p0 }; });
  ok(late.done && late.gained === 8, `${tag}: a late punch still works and gives the task's points (${JSON.stringify(late)})`);
  ok(errs.length === 0, `${tag}: console clean (preparation left) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The tutorial of the first night in its new order: the punch clock, the preparation with one task of each kind (guided), then the manager's call and the till. */
async function tutorialCheck(browser, base, kind, tag) {
  const touch = kind === 'mobile';
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug&manual&silent&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'COMEÇAR'); await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 20000 });
  await botInstall(page, { prep: true });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const steps = [['ponto', /ponto/i], ['mancha-', /mancha/i], ['lampada-', /lâmpada/i], ['repor-', /prateleira/i], ['lixo-', /lixo/i]];
  const t0 = await ev(() => { const G = window.__odq.game; return { obj: document.getElementById('objective').textContent, t: G.time.text(), till: G.interaction.targets.get('caixa-registradora').enabled(), pend: G.tasks.prepList().map((t) => t.id) }; });
  ok(/ponto/i.test(t0.obj) && t0.t === '23:00' && !t0.till, `${tag}: the tutorial starts at 23:00 and asks for the punch clock first ("${t0.obj}")`);
  ok(steps.slice(1).every(([p]) => t0.pend.some((id) => id.startsWith(p))), `${tag}: the preparation has one task of each kind (${t0.pend.join(', ')})`);
  for (const [prefix, re] of steps) {
    const g = await ev((prefix) => { const G = window.__odq.game, B = window.__bot; B.step(30); window.__odq.advance(2); const t = G.tasks.prepList().find((q) => q.id === prefix || q.id.startsWith(prefix)); return { obj: document.getElementById('objective').textContent, goal: G.goals.key, task: t && t.id, marker: G.goals.visible, hud: document.getElementById('goalhud').textContent, clock: G.time.text() }; }, prefix);
    ok(re.test(g.obj) && g.goal === 't:' + g.task && g.marker, `${tag}: guided step "${prefix}": the objective says what to do, the goal is marked and the marker is on (${g.obj.slice(0, 50)}... | ${g.hud})`);
    await shot(page, `smoke6-tutorial-${prefix.replace('-', '')}-${tag}`);
    const done = await ev(async (prefix) => { const G = window.__odq.game, B = window.__bot; B.only = prefix; let n = 0; const id = G.tasks.prepList().find((q) => q.id === prefix || q.id.startsWith(prefix)).id; while (!G.tasks.list.find((t) => t.id === id).done && n++ < 1500) { if (!B.decide()) B.step(20); await new Promise((r) => setTimeout(r, 0)); } B.only = null; return G.tasks.list.find((t) => t.id === id).done; }, prefix);
    ok(done, `${tag}: guided step "${prefix}" done`);
  }
  // the preparation is done: the manager's call comes, and only then the till
  await ev(async () => { const G = window.__odq.game; for (let i = 0; i < 60 * 3; i++) G.step(1 / 60); });
  const after = await ev(() => { const G = window.__odq.game; return { obj: document.getElementById('objective').textContent, prep: G.prep.on, till: G.interaction.targets.get('caixa-registradora').enabled(), phone: G.narrative.ringing, t: G.time.text(), clock: document.querySelector('#calhud b').textContent }; });
  ok(!after.prep && !after.till, `${tag}: the preparation is over and the till is still shut until the manager says so (${JSON.stringify(after)})`);
  const call = await ev(async () => { const G = window.__odq.game, B = window.__bot; for (let i = 0; i < 60 * 12 && !G.narrative.ringing; i++) G.step(1 / 60); const rang = G.narrative.ringing; B.use('telefone', 'answer'); for (let i = 0; i < 80; i++) { if (!B.modalStep()) B.step(3); await new Promise((r) => setTimeout(r, 0)); } return { rang, till: G.interaction.targets.get('caixa-registradora').enabled(), obj: document.getElementById('objective').textContent }; });
  ok(call.rang && call.till && /caixa/i.test(call.obj), `${tag}: the manager's call rings, and after it the till opens ("${call.obj}")`);
  const till = await ev(() => { const G = window.__odq.game, B = window.__bot; B.hold('caixa-registradora', () => G.cash.opened, 4); B.step(5); return { opened: G.cash.opened, car: G.customers.list.some((c) => c.kind === 'car'), min: G.time.minutes >= 0 }; });
  ok(till.opened && till.car && till.min, `${tag}: the till opens only after midnight and the lesson goes on with the first car (${JSON.stringify(till)})`);
  ok(errs.length === 0, `${tag}: console clean (new tutorial) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The last night after the preparation was added: the doubled shift (the clock goes back to 00:00 once) and the secret ending (the sign's breaker) still work. */
async function lastNightCheck(browser, base, kind, tag) {
  for (const secret of [false, true]) {
    const { page, errs, ctx } = await openPage(browser, base, kind, `debug=${secret ? 'secrets:all,' : ''}day:24&manual&silent&skiptutorial&nointro`);
    await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
    await botInstall(page, { prep: true });
    const r = await page.evaluate(async (secret) => {
      const G = window.__odq.game, B = window.__bot, out = {};
      out.start = G.time.text(); out.prep = G.prep.on;
      B.untilOpen(); out.open = G.time.text();
      G.customers.clear(); G.customers.enable(false); G.player.st.x = 8; G.player.st.z = 6; G.player.st.yaw = 0;
      G.time.skip(359 - G.time.minutes + 0.2); for (let i = 0; i < 90; i++) G.step(1 / 60);
      out.stopped = G.time.text(); out.event = G.events.active ? Boolean(G.events.active.length ?? G.events.active) : null;
      if (secret) {
        const held = B.hold('placa-disjuntor', () => G.state !== 'play', 4); await new Promise((r) => setTimeout(r, 200)); for (let i = 0; i < 120; i++) { G.step(1 / 60); }
        out.held = held; out.state = G.state; out.ending = G.campaign.endingId;
      } else {
        let back = null; for (let i = 0; i < 60 * 70 && G.state === 'play'; i++) { G.step(1 / 60); if (G.time.minutes < 30 && back === null) back = G.time.text(); }
        out.back = back; out.state = G.state; out.after = G.time.text();
      }
      return out;
    }, secret);
    if (secret) ok(r.state === 'ending' && r.ending === 5, `${tag}: last night, the sign's breaker at 05:59 still ends it as the secret ending (${JSON.stringify(r)})`);
    else ok(r.start === '23:00' && r.stopped === '05:59' && r.back !== null && r.state === 'play', `${tag}: last night, the clock stops at 05:59 and goes back to 00:00 once, the shift is done twice (${JSON.stringify(r)})`);
    ok(errs.length === 0, `${tag}: console clean (last night) (${errs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
}

/** Items 8 and 9: every strange event checks the world first, a person near reacts, the street dweller shows up, a figure at the corner of the eye goes when it is looked at. */
async function strangeCheck(browser, base, kind, tag) {
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:15&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // ---- every script with a roteiro has `can`, and the world stops it
  const mods = await ev(async () => {
    const G = window.__odq.game, out = { missing: [], n: 0 }, can = {};
    for (const e of G.data.events) {
      if (!e.roteiro || e.gatilho === 'shift') continue;
      const m = await import('/o-dia-que-sobra/src/systems/' + e.roteiro); out.n++;
      if (typeof m.can !== 'function') out.missing.push(e.id); else can[e.id] = m.can;
    }
    const ctxOf = () => ({ ...G, world: G.world, customers: G.customers, narrative: G.narrative, entity: G.entity, inventory: G.inventory, player: G.player, ui: G.ui, cameras: G.cameras, lighting: G.lighting, event: { local: 'bomba-3' } });
    const c = ctxOf(), br = G.world.posto.breakers, res = {};
    G.customers.clear(); G.entity.reset(); for (const d of G.world.doorIds()) G.world.setDoor(d, 0); G.player.st.x = 8; G.player.st.z = 7;
    res.sinoClosed = can['sino-sem-ninguem'](c);
    G.world.setDoor('porta-loja', 1); res.sinoOpen = can['sino-sem-ninguem'](c); G.world.setDoor('porta-loja', 0);
    res.depositoClosed = can['deposito-aberto'](c); G.world.setDoor('porta-deposito', 1); res.depositoOpen = can['deposito-aberto'](c); G.world.setDoor('porta-deposito', 0);
    res.luzOn = can['luz-oscila'](c); br.setOn('loja', false); res.luzOff = can['luz-oscila'](c); res.sombraOff = can['sombra-errada'](c); res.cafeOff = can['cafe-pronto'](c); br.setOn('loja', true);
    res.placaOn = can['a-placa'](c); br.setOn('placa', false); res.placaOff = can['a-placa'](c); br.setOn('placa', true);
    res.pump4Free = can['bomba-4'](c); G.customers.spawnEmptyCar(4, 5); res.pump4Taken = can['bomba-4'](c); G.customers.clear();
    const w = G.customers.spawnWalker({ seed: 23, tutorial: true, produtos: ['biscoito'], pagamento: 20 });
    for (let i = 0; i < 60 * 40 && w.state !== 'scanning'; i++) { G.step(1 / 60); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    res.cafeCustomer = can['cafe-pronto'](c); res.objetoCustomer = can['objeto-muda'](c); res.clienteSomeCustomer = can['cliente-some'](c);
    res.colado = can['vulto-colado'](c); G.customers.clear();
    return { ...out, res };
  });
  ok(mods.n >= 24 && mods.missing.length === 0, `${tag}: all ${mods.n} event scripts check the world first (a \`can\`); missing: ${mods.missing.join(', ') || 'none'}`);
  const R = mods.res;
  ok(R.sinoClosed && !R.sinoOpen, `${tag}: the bell does not ring with the door open (closed ${R.sinoClosed}, open ${R.sinoOpen})`);
  ok(R.depositoClosed && !R.depositoOpen && R.luzOn && !R.luzOff && !R.sombraOff && !R.cafeOff && R.placaOn && !R.placaOff, `${tag}: the storeroom, the lamp, the shadow, the coffee and the sign need their own conditions (${JSON.stringify({ d: [R.depositoClosed, R.depositoOpen], luz: [R.luzOn, R.luzOff], sombra: R.sombraOff, cafe: R.cafeOff, placa: [R.placaOn, R.placaOff] })})`);
  ok(R.pump4Free && !R.pump4Taken && !R.cafeCustomer && !R.objetoCustomer && !R.clienteSomeCustomer && !R.colado, `${tag}: pump 4 taken, a customer at the counter or near the player stops the events that need that place (${JSON.stringify({ p4: [R.pump4Free, R.pump4Taken], cafe: R.cafeCustomer, objeto: R.objetoCustomer, some: R.clienteSomeCustomer, colado: R.colado })})`);

  // ---- somebody near reacts in a short box
  const react = await ev(async () => {
    const G = window.__odq.game, B = window.__bot; G.customers.clear();
    G.player.st.x = 10.5; G.player.st.z = 8.4; G.player.st.yaw = 0;
    const w = G.customers.spawnWalker({ seed: 23, tutorial: true, produtos: ['biscoito', 'lata'], pagamento: 20 });
    for (let i = 0; i < 60 * 40 && w.state !== 'scanning'; i++) { G.step(1 / 60); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const lines = G.data.dialogue.reacoesEvento.sino; let said = null;
    G.world.setDoor('porta-loja', 0);
    G.events.trigger('sino-sem-ninguem');
    for (let i = 0; i < 60 * 6 && !said; i++) { G.step(1 / 60); const e = document.getElementById('say'); if (!e.hidden && lines.some((l) => e.querySelector('p').textContent && l.startsWith(e.querySelector('p').textContent.slice(0, 6)))) said = { who: e.querySelector('b').textContent, text: e.querySelector('p').textContent }; if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0)); }
    return { said, name: w.name };
  });
  ok(react.said && react.said.who === react.name, `${tag}: with a customer in the shop the bell is answered by him in a short box ("${react.said && react.said.who}": "${react.said && react.said.text}...")`);
  await ev(() => window.__odq.advance(2)); await shot(page, `smoke7-reacao-cliente-${tag}`);

  // ---- the street dweller
  const mor = await ev(async () => {
    const G = window.__odq.game, B = window.__bot; G.customers.clear(); G.inventory.clearCarry();
    G.player.st.x = 8; G.player.st.z = 9; G.player.st.yaw = Math.PI;       // looking into the shop: he is there when nobody looks his way
    G.events.trigger('morador-de-rua');
    let info = null; for (let i = 0; i < 60 * 8; i++) { G.step(1 / 60); info = G.events.run?.info; if (info && info.st === 'there') break; }
    const here = G.interaction.targets.has('morador');
    const at = info ? [...info.at] : null;
    return { here, st: info && info.st, at };
  });
  ok(mor.here && mor.st === 'there', `${tag}: the street dweller appears near the kerb or a bin (${JSON.stringify(mor.at)}) and can be talked to`);
  const talk = await ev(async () => {
    const G = window.__odq.game, B = window.__bot; const lines = [];
    const grab = () => { const d = document.querySelector('#dlg'); if (!d.hidden) { const t = d.querySelector('p').textContent; if (t && !lines.includes(t)) lines.push(t); } };
    const t = G.interaction.targets.get('morador'); const c = B.centerOf(t);
    G.player.st.x = c.x + 1.6; G.player.st.z = c.z + 0.2;
    B.use('morador', 'talk'); for (let i = 0; i < 80 && (G.ui.dialogueOpen || i < 4); i++) { grab(); B.confirm(); for (let k = 0; k < 40; k++) { G.step(1 / 60); grab(); } await new Promise((r) => setTimeout(r, 0)); }
    const first = [...lines]; lines.length = 0;
    // something strange is seen with him near: the next talk is the one that believes
    G.bus.emit('event:seen', 'vulto');
    for (let i = 0; i < 60 * 2.5; i++) G.step(1 / 60);
    const said = !document.getElementById('say').hidden ? document.getElementById('say').querySelector('p').textContent : '';
    B.use('morador', 'talk again'); for (let i = 0; i < 80 && (G.ui.dialogueOpen || i < 4); i++) { grab(); B.confirm(); for (let k = 0; k < 40; k++) { G.step(1 / 60); grab(); } await new Promise((r) => setTimeout(r, 0)); }
    return { first, believes: [...lines], said, name: G.data.recurring.moradorDeRua.quem };
  });
  ok(talk.first.length >= 1 && /troco|noite|Boa/i.test(talk.first.join(' ')), `${tag}: he speaks little ("${talk.first.join(' / ')}")`);
  ok(talk.believes.some((l) => /ouviu|sempre teve/i.test(l)) && !/Valdir|1998|dezembro/i.test(talk.believes.join(' ')), `${tag}: when something strange was seen, he believes it, with no answer to a secret ("${talk.believes.join(' / ')}")`);
  await ev(() => window.__odq.advance(2)); await shot(page, `smoke7-morador-${tag}`);
  ok(errs.length === 0, `${tag}: console clean (events) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
}

/** The things at the corner of the eye go when looked at (or lit); the scares (the design allows them now: rare, weeks 3 and 4, low sanity) hit with a sound and a tremor, or with a dark cut when "reduce flashes" is on. */
async function scareCheck(browser, base, kind, tag) {
  let { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:20&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // ---- an apparition is there while nobody looks, and goes when looked at straight (and when the flashlight lands on it)
  const app = await ev(async () => {
    const G = window.__odq.game, THREE = G.world.r.THREE;
    const { createKit } = await import('/o-dia-que-sobra/src/systems/events/kit.js'), { apparition } = await import('/o-dia-que-sobra/src/systems/events/aparicao.js');
    const kit = createKit({ world: G.world, player: G.player, render: G.world.r, data: G.data, inventory: G.inventory, opts: G.opts });
    G.customers.clear(); const out = {};
    const ctx = { kit, sanity: G.sanity, progression: G.progression, bus: G.bus, event: { id: 'teste-vulto', sanidade: -2 }, player: G.player };
    const seen = []; G.bus.on('event:seen', (id) => seen.push(id));
    for (const mode of ['look', 'flash']) {
      G.player.st.x = 8; G.player.st.z = 8; G.player.st.yaw = 0; G.player.st.pitch = 0; G.inventory.flash.on = false;
      const at = new THREE.Vector3(8, 0, 8 + 7);                      // behind the player (who looks to the north, -z)
      const run = apparition(ctx, { seed: 31, seekFor: 4, ttl: 30, cone: 0.9, maxDist: 20, where: () => at.clone() });
      let n = 0; while (run.info.st !== 'show' && n++ < 300) run.update(1 / 60);
      for (let i = 0; i < 120; i++) run.update(1 / 60);                // it is there, not looked at
      const before = { st: run.info.st, vis: run.info.vis, fade: +run.info.fade.toFixed(2), sanity: G.sanity.value };
      G.player.st.yaw = Math.PI;                                      // turns round: now it is straight ahead
      G.player.st.pitch = Math.atan2(1.2 - G.player.st.eye, 7);
      if (mode === 'flash') { G.inventory.flash.on = true; G.inventory.flash.charge = 100; }
      let m = 0; while (run.info.st === 'show' && m++ < 200) run.update(1 / 60);
      for (let i = 0; i < 60; i++) run.update(1 / 60);
      out[mode] = { before, after: { st: run.info.st, vis: run.info.vis, sanity: G.sanity.value }, seen: seen.length };
      run.dispose?.();
    }
    G.inventory.flash.on = false;
    return out;
  });
  for (const mode of ['look', 'flash']) {
    const o = app[mode];
    ok(o.before.st === 'show' && o.before.vis && o.before.fade > 0.5 && o.after.st !== 'show' && !o.after.vis && o.after.sanity < o.before.sanity, `${tag}: the figure at the corner of the eye is there while nobody looks and is gone when ${mode === 'look' ? 'looked at straight' : 'the flashlight lands on it'} (${JSON.stringify(o)})`);
  }

  // ---- the scares: the figure close for half a second, the hit, the tremor; with "reduce flashes", a dark cut and the same sound
  const scare = await ev(async () => {
    const G = window.__odq.game, B = window.__bot, out = {};
    const sounds = []; G.bus.on('sfx', (n) => { if (n === 'susto_golpe') sounds.push(G.time.minutes); });
    const place = (x, z, yaw) => { Object.assign(G.player.st, { x, z, yaw, pitch: 0, frozen: false }); };
    for (const soft of [false, true]) {
      G.opts.reduceFlash = soft;
      for (const id of ['vulto-colado', 'figura-vidro']) {
        G.customers.clear(); G.entity.reset(); G.events.reset(); G.events.state.shake = 0; G.events.state.cut = 0; G.sanity.reset(25, 3);
        place(10, 6, id === 'figura-vidro' ? Math.PI : 0);                               // in the shop near the glass (the glass is to the north, z lower); the figure appears while the player looks into the shop
        G.events.trigger(id);
        const n0 = sounds.length; const rec = { max: { shake: 0, cut: 0, black: 0 } };
        let phase = 0;
        for (let i = 0; i < 60 * 60 && G.events.run; i++) {
          G.step(1 / 60);
          const info = G.events.run?.info;
          if (id === 'vulto-colado' && phase === 0 && info && info.t > 2.5) { phase = 1; G.player.st.yaw += Math.PI; }              // turns round fast
          if (id === 'figura-vidro' && info && info.st === 'far' && info.vis && phase === 0) { phase = 1; G.player.st.yaw = 0; G.player.st.pitch = Math.atan2(1.2 - G.player.st.eye, 9.2); }     // turns to the glass and looks at it
          if (info && info.st === 'scare') {
            rec.max.shake = Math.max(rec.max.shake, G.events.state.shake); rec.max.cut = Math.max(rec.max.cut, G.events.state.cut); rec.max.black = Math.max(rec.max.black, G.fx.black);
            const v = G.world.r.scene.children.filter((c) => c.visible && c.userData?.cast !== undefined).length; rec.figureVisible = rec.figureVisible || info.vis;
          }
        }
        rec.sounds = sounds.length - n0; rec.ended = !G.events.run; rec.sanity = G.sanity.value;
        out[`${id}${soft ? '-soft' : ''}`] = rec;
      }
    }
    G.opts.reduceFlash = false;
    return out;
  });
  for (const id of ['vulto-colado', 'figura-vidro']) {
    const n = scare[id], q = scare[id + '-soft'];
    ok(n && n.sounds === 1 && n.max.shake > 0.03 && n.max.cut === 0 && n.sanity < 25, `${tag}: ${id}: one hit of sound, a tremor of the picture and no dark cut (${JSON.stringify(n)})`);
    ok(q && q.sounds === 1 && q.max.cut >= 0.9 && q.max.black >= 0.8 && q.max.shake === 0 && !q.figureVisible, `${tag}: ${id} with "reduce flashes": the same sound on a dark cut, no figure, no tremor (${JSON.stringify(q)})`);
  }
  // the attack of the ending 4
  const att = await ev(async () => {
    const G = window.__odq.game, out = {}, sounds = [];
    G.bus.on('sfx', (n) => { if (n === 'susto_golpe') sounds.push(n); });
    for (const soft of [false, true]) {
      G.opts.reduceFlash = soft; G.entity.reset(); G.customers.clear(); G.player.st.frozen = false; G.player.st.x = 8; G.player.st.z = 7; sounds.length = 0;
      G.entity.catchNow(); let shake = 0, black = 0;
      for (let i = 0; i < 90 && !G.entity.done && G.state === 'play'; i++) { G.step(1 / 60); shake = Math.max(shake, G.entity.shake); black = Math.max(black, G.entity.black); }
      out[soft ? 'soft' : 'hard'] = { sounds: sounds.length, shake: +shake.toFixed(3), black: +black.toFixed(2), state: G.state };
      G.opts.reduceFlash = false;
      if (G.state !== 'play') break;
    }
    return out;
  });
  ok(att.hard.sounds === 1 && att.hard.shake >= 0.05, `${tag}: the attack of the ending 4 has the hit and the tremor (${JSON.stringify(att.hard)})`);
  ok(errs.length === 0, `${tag}: console clean (scares) (${errs.slice(0, 3).join(' | ')})`);
  await ctx.close();
  // the soft attack on a page of its own (the first attack ended the night)
  ({ page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:20&manual&silent&skiptutorial&nointro'));
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const soft = await page.evaluate(() => {
    const G = window.__odq.game, sounds = []; G.bus.on('sfx', (n) => { if (n === 'susto_golpe') sounds.push(n); });
    G.opts.reduceFlash = true; G.entity.reset(); G.customers.clear(); G.player.st.x = 8; G.player.st.z = 7; G.entity.catchNow();
    G.step(1 / 60); return { sounds: sounds.length, black: +G.entity.black.toFixed(2), shake: G.entity.shake, visible: G.entity.ent.root.visible };
  });
  ok(soft.sounds === 1 && soft.black >= 0.9 && soft.shake === 0 && !soft.visible, `${tag}: with "reduce flashes" the attack is a dark cut with the same sound (${JSON.stringify(soft)})`);
  await ctx.close();

  // ---- never in weeks 1 and 2; and not a rule of every shape: the plain vulto has no hit
  const plan = [];
  for (const day of [3, 8, 15, 20]) {
    ({ page, errs, ctx } = await openPage(browser, base, kind, `debug=day:${day}&manual&silent&skiptutorial&nointro`));
    await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
    plan.push([day, await page.evaluate(() => ({ week: window.__odq.game.progression.st.week, ids: window.__odq.game.events.plan.map((p) => p.id) }))]);
    await ctx.close();
  }
  const SCARES = ['vulto-colado', 'figura-vidro'];
  ok(plan.filter(([, p]) => p.week <= 2).every(([, p]) => !p.ids.some((i) => SCARES.includes(i))) && plan.some(([, p]) => p.week >= 3 && SCARES.some((i) => p.ids.includes(i))), `${tag}: the scares are never planned in weeks 1 and 2 and are in the plan of weeks 3 and 4 (${plan.map(([d, p]) => `n${d}:${p.ids.filter((i) => SCARES.includes(i)).join('+') || '-'}`).join(' ')})`);
  const src = ['vulto', 'passante-canto', 'silhueta-vitrine', 'sombra-errada', 'vulto-corredor'].map((f) => fs.readFileSync(path.join(here, '..', 'src', 'systems', 'events', f + '.js'), 'utf8')).join('\n');
  ok(!/susto_golpe/.test(src), `${tag}: the other shapes at the corner of the eye have no hit (the scare is not a rule of every vulto)`);
  const recs = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'events.json'), 'utf8'));
  ok(SCARES.every((i) => { const r = recs.find((e) => e.id === i); return r && r.semanaMin >= 3 && r.condicoes.sanidadeMax <= 39 && r.chance <= 0.15; }), `${tag}: each scare is week 3 or later, low sanity only, with a small chance (data/events.json)`);
  const both = recs.filter((r) => /silhueta-vitrine|passante-canto|sombra-errada|vulto-corredor/.test(r.id));
  ok(both.length >= 4 && both.every((r) => r.sanidadeOdds && r.crescePorSemana > 0 && r.semanaMin >= 1) && both.some((r) => r.alucinacao) && both.some((r) => !r.alucinacao), `${tag}: four new shapes, in the lottery of the head and of the world, rarer with a steady mind and growing with the weeks (${both.map((r) => r.id + (r.alucinacao ? ' (head)' : ' (world)')).join(', ')})`);
  ok(errs.length === 0, `${tag}: console clean (plan) (${errs.slice(0, 3).join(' | ')})`);
}

/** The peak of the scare's sound, measured after the chain (offline render): under -3 dBFS. */
async function soundPeak(browser, base) {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}/o-dia-que-sobra/tools/audio-preview.html`); await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const peaks = await page.evaluate(async () => {
    const out = {};
    for (const n of ['susto_golpe']) {
      const r = await window.renderSound('play', n, {}, 1.5, 22050, {});
      const f32 = (b64) => { const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return new Float32Array(u.buffer); };
      let pk = 0; for (const ch of r.ch) for (const v of f32(ch)) pk = Math.max(pk, Math.abs(v));
      out[n] = { peak: +(20 * Math.log10(pk || 1e-9)).toFixed(1), dur: +Number(r.ret).toFixed(2) };
    }
    return out;
  });
  for (const [n, v] of Object.entries(peaks)) ok(v.peak < -3 && v.peak > -14, `sound: ${n} peaks at ${v.peak} dBFS (under -3, and strong), ${v.dur} s`);
  ok(errs.filter((e) => !/404/.test(e)).length === 0, `sound: console clean (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

/** "MENU INICIAL" in the pause (night and day off): goes to '../' (the navigation is intercepted here), after leaving the game as "sair para o título" does, and never writes the real card. */
async function menuCheck(browser, base, kind, tag) {
  for (const where of ['noite', 'folga']) {
    const { page, errs, ctx } = await openPage(browser, base, kind, where === 'noite' ? 'debug=day:3&manual&silent&skiptutorial&nointro' : 'debug=dayoff:1&manual&silent');
    await page.waitForFunction((w) => window.__odq?.game?.state === (w === 'noite' ? 'play' : 'dayoff'), where, { timeout: 90000 });
    await page.evaluate(() => window.__bot ? 0 : 0);
    await page.waitForTimeout(where === 'folga' ? 800 : 0);
    const realBefore = await page.evaluate(() => localStorage.getItem('o-dia-que-sobra.card.v1'));
    let hit = null;
    await page.route('**/*', (route) => { const u = route.request().url(); if (u === `${base}/`) { hit = u; return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>menu</title><link rel="icon" href="data:,">' }); } return route.continue(); });
    if (where === 'noite') await page.evaluate(() => { window.__odq.game.openPause(); });
    else await page.evaluate(() => { window.__odq.game.bus.emit('dayoff:pause'); });
    await page.evaluate(() => window.__odq?.advance?.(2)).catch(() => {});
    const items = await titles(page);
    ok(items.includes('MENU INICIAL') && items.includes('SAIR PARA O TÍTULO'), `${tag}: the pause of the ${where} has "MENU INICIAL" (${items.join(' | ')})`);
    await shot(page, `smoke8-menu-inicial-${where}-${tag}`);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#modal [data-cell]')].find((x) => x.textContent.trim().startsWith('MENU INICIAL')); const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.right - 8, clientY: r.top + 5 })); });
    await page.waitForURL(`${base}/`, { timeout: 15000 }).catch(() => {});
    ok(page.url() === `${base}/` && hit === `${base}/`, `${tag}: "MENU INICIAL" in the ${where} goes to '../' (${page.url()})`);
    const realAfter = await page.evaluate(() => localStorage.getItem('o-dia-que-sobra.card.v1'));
    ok(realBefore === realAfter, `${tag}: the real memory card is not written on the way out (${realBefore === null ? 'still empty' : 'unchanged'})`);
    ok(errs.length === 0, `${tag}: console clean (menu inicial, ${where}) (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }
}

/** The HUD on top of the picture, in one layout at any size: no element of the HUD overlaps another (bounding boxes), nothing sits on the touch buttons, the canvas covers the window (no black band), and
 * the tutorial of the preparation reads in all of them. Sizes: the phone upright and sideways, and the desktop. */
async function hudCheck(browser, base, sizes) {
  for (const [w, h, label] of sizes) {
    for (const touch of [true, false]) {
      if (!touch && w !== 390) continue;                                       // (a narrow window without touch is the other way to meet the narrow layout)
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 900 });
      const page = await ctx.newPage(); const errs = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
      const tag = `${label}${touch ? '' : ' sem toque'}`;
      await page.goto(`${base}/o-dia-que-sobra/index.html?debug&manual&silent&nointro${touch ? '&touch' : ''}`);
      await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
      await clickText(page, 'COMEÇAR'); await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 20000 });
      await botInstall(page, { prep: true });
      const ev = (fn, arg) => page.evaluate(fn, arg);
      // the pieces of the HUD that can be on screen together in the preparation: clock, goal, narrative line, coach, toast, hands, prompt, buttons
      const boxes = async () => ev(() => {
        const sel = { relogio: '#calhud', objetivo: '#goalhud', mensagem: '#objective', dica: '#coach', aviso: '#toast', bolso: '#invstrip', mira: '#prompt', lista: '#choice', pausa: '#pausebtn', botoes: '#btns', direcional: '#stickbase', soltar: '#carryhint' };
        const out = {}; for (const [k, s] of Object.entries(sel)) { const e = document.querySelector(s); if (!e || e.hidden || e.closest('[hidden]')) continue; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; out[k] = [r.left, r.top, r.right, r.bottom]; }
        return { out, w: innerWidth, h: innerHeight };
      });
      const overlaps = (o) => { const ks = Object.keys(o), bad = []; for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = o[ks[i]], b = o[ks[j]]; if (!(a[2] <= b[0] + 0.5 || b[2] <= a[0] + 0.5 || a[3] <= b[1] + 0.5 || b[3] <= a[1] + 0.5)) bad.push(`${ks[i]}x${ks[j]}`); } return bad; };
      const check = async (name) => {
        const b = await boxes(); const bad = overlaps(b.out);
        const outside = Object.entries(b.out).filter(([, r]) => r[0] < -1 || r[1] < -1 || r[2] > b.w + 1 || r[3] > b.h + 1).map(([k]) => k);
        ok(bad.length === 0 && outside.length === 0, `${tag}: ${name}: no HUD element overlaps another or leaves the screen (${Object.keys(b.out).join(', ')}${bad.length ? '; OVERLAP ' + bad.join(' ') : ''}${outside.length ? '; OUT ' + outside.join(' ') : ''})`);
        return b;
      };
      // the first moment of the night: the narrative line is up, the goal is marked, the clock has its preparation line
      await ev(() => { window.__bot.step(30); window.__odq.advance(2); });
      const b0 = await check('the first seconds of the preparation');
      ok(b0.out.relogio && b0.out.objetivo && b0.out.mensagem, `${tag}: clock, marked goal and the narrative line are all on screen`);
      const goalText = await ev(() => document.getElementById('goalhud').textContent);
      const goalLines = await ev(() => { const e = document.getElementById('goalhud'); return Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2)); });
      ok(goalLines <= 2 && !/…$/.test(goalText), `${tag}: the goal line wraps instead of being cut ("${goalText}", ${goalLines} line(s))`);
      await shot(page, `smoke9-hud-${w}x${h}${touch ? '' : '-sem-toque'}`);
      // the canvas covers the window: no black band (the bands of the picture would be black pixels at the top and the bottom rows of the canvas)
      const cover = await ev(() => { const c = document.getElementById('c'), r = c.getBoundingClientRect(); const t = document.createElement('canvas'); t.width = 40; t.height = 40; const g = t.getContext('2d', { willReadFrequently: true }); window.__odq.advance(1); g.drawImage(c, 0, 0, 40, 40); const row = (y) => { const d = g.getImageData(0, y, 40, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (40 * 3); }; return { rect: [r.left, r.top, r.width, r.height], win: [innerWidth, innerHeight], top: Math.round(row(0)), bottom: Math.round(row(39)), size: window.__odq.render.size }; });
      ok(Math.abs(cover.rect[2] - cover.win[0]) < 1 && Math.abs(cover.rect[3] - cover.win[1]) < 1 && cover.rect[0] === 0 && cover.rect[1] === 0, `${tag}: the canvas covers the window (${cover.rect.map(Math.round).join('x')} in ${cover.win.join('x')}; ${cover.size.w}x${cover.size.h} px)`);
      ok(cover.top > 6 && cover.bottom > 6, `${tag}: no black band at the top or the bottom of the picture (mean level ${cover.top} / ${cover.bottom})`);
      // the tutorial of the preparation, step by step, at this size: nothing overlaps while a guided task is on
      const steps = ['ponto', 'mancha-', 'lampada-', 'repor-', 'lixo-'];
      let all = true;
      for (const prefix of steps) {
        await ev(async (prefix) => { const G = window.__odq.game, B = window.__bot; B.step(30); B.only = prefix; let n = 0; const t = G.tasks.prepList().find((q) => q.id === prefix || q.id.startsWith(prefix)); const half = () => { n++; return n < 25; }; while (half() && !t.done) { if (!B.decide()) B.step(20); await new Promise((r) => setTimeout(r, 0)); } B.only = null; window.__odq.advance(2); }, prefix);
        const bb = await boxes(); const bad = overlaps(bb.out); if (bad.length) { all = false; console.log(`   (${prefix}: ${bad.join(' ')})`); }
        const outside = Object.entries(bb.out).filter(([, r]) => r[0] < -1 || r[1] < -1 || r[2] > bb.w + 1 || r[3] > bb.h + 1); if (outside.length) all = false;
        await ev(async (prefix) => { const G = window.__odq.game, B = window.__bot; B.only = prefix; let n = 0; const t = G.tasks.prepList().find((q) => q.id === prefix || q.id.startsWith(prefix)); while (!t.done && n++ < 1500) { if (!B.decide()) B.step(20); await new Promise((r) => setTimeout(r, 0)); } B.only = null; }, prefix);
      }
      ok(all, `${tag}: through the tutorial of the preparation (the clock, the goal and the guide of each task) nothing overlaps`);
      // the aim label follows the device: the touch screen never says "E"
      const lab = await ev(() => { const G = window.__odq.game, B = window.__bot; window.__odq.input.setLastDevice(window.__odq.input.hasTouch() ? 'touch' : 'keyboard'); const t = G.interaction.targets.get('bico1-comum'); B.aimAt(B.centerOf(t), () => B.settle('bico1-comum'), [1.4]); window.__odq.input.setLastDevice(window.__odq.input.hasTouch() ? 'touch' : 'keyboard'); G.step(1 / 60); window.__odq.advance(2); return { key: document.querySelector('#prompt b')?.textContent, hidden: document.getElementById('prompt').hidden, touch: window.__odq.input.hasTouch(), dev: window.__odq.input.device() }; });
      if (touch) ok(lab.key !== 'E' && !lab.hidden, `${tag}: on a touch device the aim label shows the touch key, not "E" (${JSON.stringify(lab)})`);
      ok(errs.length === 0, `${tag}: console clean (HUD) (${errs.slice(0, 2).join(' | ')})`);
      await ctx.close();
    }
  }
}

/** Item 10: the hose between the body of the pump and the nozzle follows the nozzle in the hand, into the tank and back to its hook, and does not go through the floor or the car; in the cutscenes too. */
async function hoseCheck(browser, base, kind, tag) {
  const { page, errs, ctx } = await openPage(browser, base, kind, 'debug=day:3&manual&silent&skiptutorial&nointro');
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await botInstall(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const r = await ev(async () => {
    const G = window.__odq.game, B = window.__bot, THREE = G.world.r.THREE, out = {};
    const hose = () => G.world.posto.pumps[2].hoses.comum.hose;
    const ends = (h) => { const pos = h.mesh.geometry.attributes.position, n = pos.count, ring = 6, a = new THREE.Vector3(), b = new THREE.Vector3(); for (let i = 0; i < ring; i++) { a.add(new THREE.Vector3().fromBufferAttribute(pos, i)); b.add(new THREE.Vector3().fromBufferAttribute(pos, n - 1 - i)); } return { start: a.divideScalar(ring), end: b.divideScalar(ring) }; };
    const verts = (h) => { const pos = h.mesh.geometry.attributes.position, v = []; for (let i = 0; i < pos.count; i++) v.push(new THREE.Vector3().fromBufferAttribute(pos, i)); return v; };
    const hook = G.world.anchor('bico2-comum').pos;
    const adv = () => window.__odq.advance(2);
    adv(); out.rest = { end: ends(hose()).end.distanceTo(hook), mode: G.hoses.mode['2-comum'] ?? 'rest', tris: hose().mesh.geometry.index ? hose().mesh.geometry.index.count / 3 : 0 };
    // the nozzle in the hand
    out.took = B.use('bico2-comum', 'nozzle'); adv();
    const hand = new THREE.Vector3(); G.inventory.hand.children[0].getWorldPosition(hand);
    out.hand = { mode: G.hoses.mode['2-comum'], end: ends(hose()).end.distanceTo(hand), lowest: Math.min(...verts(hose()).map((q) => q.y)) };
    // the player walks off 2.5 m: the hose goes with the hand
    G.player.st.x += 2.5; G.player.st.z += 0.5; adv(); G.inventory.hand.children[0].getWorldPosition(hand);
    out.walk = { end: ends(hose()).end.distanceTo(hand), mode: G.hoses.mode['2-comum'], start: ends(hose()).start.distanceTo(hook) };
    // the car at pump 2, the nozzle in its tank
    G.player.st.x -= 2.5; G.player.st.z -= 0.5;
    const c = G.customers.spawnCar({ pump: 2, seed: 5, valor: 3000, combustivel: 'comum' });
    for (let i = 0; i < 60 * 40 && c.state === 'arriving'; i++) { G.step(1 / 60); if (i % 30 === 0) await new Promise((q) => setTimeout(q, 0)); }
    B.use(`cliente${c.id}`, 'talk'); for (let i = 0; i < 40; i++) { if (!B.modalStep()) B.step(3); await new Promise((q) => setTimeout(q, 0)); }
    if (!G.inventory.carry) B.use('bico2-comum', 'nozzle again');
    const ins = B.use(`tampa${c.id}`, 'nozzle in'); B.step(5); adv();
    const nz = new THREE.Vector3(); c.nozzleObj?.getWorldPosition(nz);
    const vs = verts(hose()), e = ends(hose()).end;
    const boxes = G.world.colliders.filter((q) => q.vehicle);
    const inside = vs.filter((q) => q.distanceTo(e) > 0.45 && boxes.some((b) => q.x > b.min[0] && q.x < b.max[0] && q.z > b.min[2] && q.z < b.max[2] && q.y > b.min[1] && q.y < b.max[1] - 0.05)).length;
    out.tank = { inserted: ins && c.nozzleIn, end: c.nozzleObj ? e.distanceTo(nz) : null, inside, lowest: Math.min(...vs.map((q) => q.y)), mode: G.hoses.mode['2-comum'] };
    // pulled out and given back: it hangs from the hook again
    B.use(`tampa${c.id}`, 'pull'); B.use('bico2-comum', 'return'); B.step(3); adv();
    out.back = { mode: G.hoses.mode['2-comum'], end: ends(hose()).end.distanceTo(hook), carry: G.inventory.carry && G.inventory.carry.kind };
    return out;
  });
  ok(r.rest.end < 0.12 && r.rest.tris > 20 && r.rest.tris < 400, `${tag}: on its hook the nozzle has its hose hanging in a loop (${r.rest.tris} triangles, end ${r.rest.end.toFixed(2)} m from the hook)`);
  ok(r.took && r.hand.mode === 'active' && r.hand.end < 0.1 && r.hand.lowest >= 0.04, `${tag}: with the nozzle in the hand the hose follows it, above the floor (end ${r.hand.end.toFixed(3)} m from the hand, lowest point ${r.hand.lowest.toFixed(2)} m)`);
  ok(r.walk.end < 0.1 && r.walk.start < 0.7, `${tag}: it goes with the hand when the player walks off, and still comes out of the pump (end ${r.walk.end.toFixed(3)}, start ${r.walk.start.toFixed(2)} m from the hook)`);
  ok(r.tank.inserted && r.tank.end < 0.1 && r.tank.inside === 0 && r.tank.lowest >= 0.04, `${tag}: into the tank of the car the hose follows the nozzle and does not go through the car (end ${r.tank.end && r.tank.end.toFixed(3)}, ${r.tank.inside} points inside the car)`);
  ok(r.back.mode === 'rest' && r.back.end < 0.12 && !r.back.carry, `${tag}: given back, the hose is on its hook again (${JSON.stringify({ mode: r.back.mode, end: +r.back.end.toFixed(3) })})`);
  await ev(() => { const G = window.__odq.game, B = window.__bot, t = G.interaction.targets.get('bico2-comum'); B.aimAt(B.centerOf(t), () => B.settle('bico2-comum'), [1.5]); B.use('bico2-comum', 'again'); G.player.st.x += 1.2; window.__odq.advance(3); });
  await shot(page, `smoke10-mangueira-na-mao-${tag}`);
  ok(errs.filter((e) => !/willReadFrequently/.test(e)).length === 0, `${tag}: console clean (hose) (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

/** The hose in the cutscenes that show a nozzle (rotina, bomba4): the hose of the pump goes to the nozzle the cutscene holds. */
async function hoseFilmCheck(browser, base, tag) {
  const { page, errs, ctx } = await openPage(browser, base, 'desktop', 'film');
  await page.waitForFunction(() => typeof window.setup === 'function', null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const info = await window.setup({ width: 960, height: 540, seed: 1 }), film = window.__film.current, THREE = film.render.THREE, out = [];
    const pick = (cs, t) => Object.entries(film.views).find(([, v]) => v.cutscene === cs && v.t0 <= t && v.t1 > t + 0.5)?.[0];
    const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    for (const [cs, t, ex] of [['rotina', 30, [8.5, 0.86, -5.95]], ['bomba4', 10, [19.5, 0.86, -5.95]]]) {
      const name = pick(cs, t); if (!name) { out.push({ cs, error: 'no view' }); continue; }
      const v = film.views[name]; window.shot({ from: name, duration: 10 }); window.frame(((t - v.t0) / (v.t1 - v.t0)) * 10);
      const nozzles = [], hoses = [];
      film.render.scene.traverse((o) => { if (!o.isMesh) return; if (o.name === 'bico-comum' && vis(o)) { const p = new THREE.Vector3(); o.getWorldPosition(p); nozzles.push(p); } if (o.name === 'mangueira' && vis(o)) { o.updateWorldMatrix(true, false); const pos = o.geometry.attributes.position, n = pos.count, e = new THREE.Vector3(); for (let i = 0; i < 6; i++) e.add(new THREE.Vector3().fromBufferAttribute(pos, n - 1 - i)); e.divideScalar(6).applyMatrix4(o.matrixWorld); hoses.push(e); } });
      const E = new THREE.Vector3(...ex), near = Math.min(...hoses.map((h) => h.distanceTo(E)));
      out.push({ cs, view: name, nozzles: nozzles.length, hoses: hoses.length, toTheHeldNozzle: +near.toFixed(3) });
    }
    return out;
  });
  for (const o of r) ok(!o.error && o.nozzles >= 1 && o.hoses >= 4 && o.toTheHeldNozzle < 0.15, `${tag}: cutscene ${o.cs} (${o.view}): the hose goes to the nozzle the cutscene holds (${JSON.stringify(o)})`);
  ok(errs.length === 0, `${tag}: console clean (film hose) (${errs.slice(0, 2).join(' | ')})`);
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
  await botInstall(page, { prep: true });
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
  if (!full) { await roundTwo(browser, base, kind, tag); await dropCheck(browser, base, kind, tag); await calcCheck(browser, base, kind, tag); await doorDropCheck(browser, base, kind, tag); await overlapCheck(browser, base, kind, tag); await prepCheck(browser, base, kind, tag); await tutorialCheck(browser, base, kind, tag); await hoseCheck(browser, base, kind, tag); await menuCheck(browser, base, kind, tag); return; }

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
  await doorDropCheck(browser, base, kind, tag);
  await overlapCheck(browser, base, kind, tag);
  await smallChecks(browser, base, kind, tag);
  await prepCheck(browser, base, kind, tag);
  await tutorialCheck(browser, base, kind, tag);
  await lastNightCheck(browser, base, kind, tag);
  await soundPeak(browser, base);
  await strangeCheck(browser, base, kind, tag);
  await scareCheck(browser, base, kind, tag);
  await hoseCheck(browser, base, kind, tag);
  await hoseFilmCheck(browser, base, tag);
  await menuCheck(browser, base, kind, tag);
  await hudCheck(browser, base, [[390, 844, '390x844'], [844, 390, '844x390'], [1920, 1080, '1920x1080']]);

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
  else if (ARGS[0] === '--doors') { await doorDropCheck(browser, base, 'desktop', 'desktop'); await doorDropCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--overlap') { await overlapCheck(browser, base, 'desktop', 'desktop'); await overlapCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--small') { await smallChecks(browser, base, 'desktop', 'desktop'); }
  else if (ARGS[0] === '--prep') { await prepCheck(browser, base, 'desktop', 'desktop'); await prepCheck(browser, base, 'mobile', 'celular'); await tutorialCheck(browser, base, 'desktop', 'desktop'); await tutorialCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--last') { await lastNightCheck(browser, base, 'desktop', 'desktop'); }
  else if (ARGS[0] === '--strange') { await strangeCheck(browser, base, 'desktop', 'desktop'); }
  else if (ARGS[0] === '--scare') { await soundPeak(browser, base); await scareCheck(browser, base, 'desktop', 'desktop'); }
  else if (ARGS[0] === '--menu') { await menuCheck(browser, base, 'desktop', 'desktop'); await menuCheck(browser, base, 'mobile', 'celular'); }
  else if (ARGS[0] === '--hud') { await hudCheck(browser, base, [[390, 844, '390x844'], [844, 390, '844x390'], [1920, 1080, '1920x1080']]); }
  else if (ARGS[0] === '--hose') { await hoseCheck(browser, base, 'desktop', 'desktop'); await hoseCheck(browser, base, 'mobile', 'celular'); await hoseFilmCheck(browser, base, 'desktop'); }
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
