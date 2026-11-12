// The training hall lesson. Each step asks for one thing, on screen, in a few words that depend
// on the device in use, and moves on when the player has done it. The dummy is a fixed fighter.
const K = {
  move: { keyboard: 'ANDE: W A S D', gamepad: 'ANDE: STICK ESQUERDO', touch: 'ANDE: DIRECIONAL' },
  guard: { keyboard: 'GUARDA: SEGURE SHIFT', gamepad: 'GUARDA: SEGURE LB', touch: 'GUARDA: SEGURE O BOTÃO' },
  side: { keyboard: 'ESQUIVE PARA O LADO: ESPAÇO + A OU D', gamepad: 'ESQUIVE PARA O LADO: STICK DIREITO < >', touch: 'ESQUIVE: DIRECIONAL PARA O LADO + ESQ' },
  back: { keyboard: 'ESQUIVE PARA TRÁS: ESPAÇO + S', gamepad: 'ESQUIVE PARA TRÁS: B', touch: 'ESQUIVE: DIRECIONAL PARA TRÁS + ESQ' },
  step: { keyboard: 'PASSO À FRENTE: ESPAÇO + W', gamepad: 'PASSO À FRENTE: STICK DIREITO ^', touch: 'PASSO: DIRECIONAL PARA FRENTE + ESQ' },
  duck: { keyboard: 'ABAIXE: C', gamepad: 'ABAIXE: STICK DIREITO v', touch: 'ABAIXE: BOTÃO ABX' },
  jab: { keyboard: 'JAB NO BONECO: J', gamepad: 'JAB NO BONECO: X', touch: 'JAB NO BONECO: BOTÃO JAB' },
  direct: { keyboard: 'DIRETO: K', gamepad: 'DIRETO: Y', touch: 'DIRETO: BOTÃO DIR' },
  hookL: { keyboard: 'GANCHO ESQUERDO: U', gamepad: 'GANCHO ESQUERDO: LT', touch: 'GANCHO ESQUERDO: BOTÃO GE' },
  hookR: { keyboard: 'GANCHO DIREITO: I', gamepad: 'GANCHO DIREITO: RT', touch: 'GANCHO DIREITO: BOTÃO GD' },
  upper: { keyboard: 'UPPERCUT: L', gamepad: 'UPPERCUT: A', touch: 'UPPERCUT: BOTÃO UP' },
  swap: { keyboard: 'TROQUE O ITEM ATIVO: TAB', gamepad: 'TROQUE O ITEM: DIRECIONAL < >', touch: 'TROQUE O ITEM: DESLIZE O BOTÃO ITEM' },
  use: { keyboard: 'USE A BANDAGEM: Q', gamepad: 'USE A BANDAGEM: RB', touch: 'USE A BANDAGEM: BOTÃO ITEM' },
};
const ZONE = { forehead: 'TESTA', chin: 'QUEIXO', temple: 'TÊMPORA' };

/** G: { state, player, hud, device(), pushDummy(kind), openShop(only), openSave(), grantCredits(n), ensureItem(k), cycle } */
export function createTutorial(G) {
  const T = { active: false, i: 0, t: 0, ctx: {}, zones: new Set() };
  const steps = [
    { id: 'move', text: (d) => K.move[d], init: (c) => { c.dist = 0; }, tick: (c, dt, p) => { c.dist += p.speed * dt; return c.dist >= 2.5; } },
    { id: 'guard', text: (d) => K.guard[d], init: (c) => { c.hold = 0; }, tick: (c, dt, p) => { c.hold = p.guardAmt > 0.9 ? c.hold + dt : 0; return c.hold >= 0.6; } },
    { id: 'side', text: (d) => K.side[d], on: (e) => e.type === 'dodge' && (e.dir === 'L' || e.dir === 'R') },
    { id: 'back', text: (d) => K.back[d], on: (e) => e.type === 'dodge' && e.dir === 'B' },
    { id: 'step', text: (d) => K.step[d], on: (e) => e.type === 'dodge' && e.dir === 'F' },
    { id: 'duck', text: (d) => K.duck[d], on: (e) => e.type === 'dodge' && e.dir === 'D' },
    ...['jab', 'direct', 'hookL', 'hookR', 'upper'].map((k) => ({ id: k, text: (d) => K[k][d], on: (e) => e.type === 'hit' && e.info.kind === k })),
    { id: 'zones', text: () => `ACERTE: TESTA ${T.zones.has('forehead') ? '[X]' : '[ ]'}  QUEIXO ${T.zones.has('chin') ? '[X]' : '[ ]'}  TÊMPORA ${T.zones.has('temple') ? '[X]' : '[ ]'}`, tick: () => T.zones.size >= 3 },
    { id: 'daze', text: () => 'GANCHO NA TÊMPORA: A VISÃO FECHA E OS COMANDOS ATRASAM', init: (c) => { c.t = 0; G.pushDummy('hookL'); }, tick: (c, dt, p) => { c.t += dt; if (c.t > 4.2) return true; return false; } },
    { id: 'money', text: () => 'PRESENTE DA CASA: +150 CR', init: (c) => { c.t = 0; G.grantCredits(150); }, tick: (c, dt) => { c.t += dt; return c.t > 2.4; } },
    { id: 'shop', leave: () => G.closeShop(), text: () => 'COMPRE A BANDAGEM NO PAINEL (80 CR)', init: () => G.openShop(['bandage']), on: (e) => e.type === 'bought' && e.key === 'bandage', tick: (c, dt) => { if (!G.shopOpen() && !G.state.inv.bandage) { c.wait = (c.wait || 0) + dt; if (c.wait > 0.5) { c.wait = 0; G.openShop(['bandage']); } } return false; } },
    { id: 'swap', text: (d) => K.swap[d], init: () => { G.ensureItem('taser'); }, on: (e) => e.type === 'swap' },
    { id: 'use', text: (d) => K.use[d], init: () => { G.state.active = 'bandage'; G.player.balance = 62; }, on: (e) => e.type === 'used' && e.key === 'bandage' },
    { id: 'save', text: () => 'SALVANDO NO TERMINAL...', init: () => { G.openSave(); }, on: (e) => e.type === 'saved' },
  ];
  T.steps = steps;

  function begin() { T.active = true; T.i = 0; T.t = 0; T.zones = new Set(); T.ctx = {}; init(); }
  function init() { const s = steps[T.i]; T.ctx = {}; s.init?.(T.ctx); T.t = 0; show(); }
  function show() {
    if (!T.active) { G.hud.setTut(null); return; }
    const s = steps[T.i];
    G.hud.setTut(s.text(G.device()), `${T.i + 1}/${steps.length}`);
  }
  function next() { steps[T.i].leave?.(); T.i++; G.audio.play('ui_ok'); if (T.i >= steps.length) { T.active = false; G.hud.setTut(null); G.onDone(); return; } init(); }
  function update(dt, p) {
    if (!T.active) return;
    T.t += dt; const s = steps[T.i];
    if (s.tick && s.tick(T.ctx, dt, p)) { next(); return; }
    if (T.t > 0.5) show(); // the text follows the device in use
  }
  function event(e) {
    if (!T.active) return;
    if (e.type === 'hit') T.zones.add(e.info.zone === 'body' ? '' : e.info.zone);
    T.zones.delete('');
    const s = steps[T.i];
    if (s.on && s.on(e)) next(); else show();
  }
  T.begin = begin; T.update = update; T.event = event; T.ZONE = ZONE;
  return T;
}
