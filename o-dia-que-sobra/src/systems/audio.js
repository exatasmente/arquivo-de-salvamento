// AudioSystem (the bridge): turns what the systems say on the bus into calls to audio/index.js,
// follows the listener, picks the room's reverb and keeps the ambient loops. The audio context is
// created at the first gesture (the browser asks for it) and the sounds are built when they play.
const SFX = {
  sino: 'porta_sino', gatilho_clique: 'bomba_bip', bomba_para: 'bomba_bip', bico_pega: 'bico_tira', bico_devolve: 'bico_poe',
  tampa_abre: 'tampa_tanque', leitor_bip: 'caixa_bip', caixa_gaveta: 'gaveta_abre', produto_pos: 'prateleira_poe',
  carrinho_solta: 'carrinho', pilha_troca: 'lanterna_clique', erro: 'ui_voltar', tarefa_ok: 'ui_ok',
};
const AMBIENT = [['fluorescente', { gain: 0.8 }], ['rodovia', { gain: 0.9 }], ['insetos', { gain: 0.5 }], ['vento', { gain: 0.6 }]];
const ROOMS = { loja: 'loja', escritorio: 'escritorio', estoque: 'estoque', banheiros: 'banheiro', servico: 'deposito' };

export function createAudioSystem(bus, { world, player, lighting, mod, opts }) {
  let audio = null, ctx = null;
  const missing = new Set();   // sounds the game asked for that audio/ does not have (never a warning)
  const loops = new Map();
  let ambient = [], room = null, lastPos = null;

  function init() {
    if (audio) { ctx?.resume?.(); return audio; }
    ctx = mod.createAudioContext ? mod.createAudioContext() : null;
    audio = mod.createAudio(ctx);
    ctx?.resume?.();
    return audio;
  }
  const P = (o) => (o && o.pos ? o.pos : undefined);
  function play(name, o = {}) {
    if (!audio || opts.mute) return;
    let n = SFX[name] || name, g = o.gain;
    if (name === 'passo' || name === 'passo_corrida') {
      const a = lighting.area;
      n = a === 'loja' || a === 'banheiros' ? 'passo_azulejo' : a === 'externa' || a === 'estacionamento' || a === 'bombas' ? 'passo_asfalto' : 'passo_piso';
      if (name === 'passo_corrida') g = (g ?? 1) * 1.5;
    }
    if (name === 'carro_vai') { const l = audio.loop('motor_carro', { pos: P(o), gain: 0.9 }); setTimeout(() => l.stop?.(1.5), 3500); return; }
    if (audio.has && !audio.has(n)) { missing.add(n); return; }
    try { audio.play(n, { pos: P(o), gain: g, ...(o.opts || {}) }); } catch (e) { console.warn('audio', n, e.message); }
  }
  bus.on('sfx', play);
  bus.on('loop', (key, name, o = {}) => {
    if (!audio || opts.mute) return;
    const old = loops.get(key);
    if (o.on === false) { old?.stop?.(0.3); loops.delete(key); return; }
    if (old) return;
    try { loops.set(key, audio.loop(name, { pos: P(o), gain: o.gain })); } catch (e) { console.warn('audio loop', name, e.message); }
  });
  bus.on('audio:sanity', (v) => { audio?.setSanity?.(v); audio?.setHallucination?.(Math.max(0, Math.min(1, (60 - v) / 60))); });
  bus.on('audio:drowsy', (k) => audio?.setDrowsy?.(k));
  bus.on('customer:arrive', (c) => { if ((c.kind === 'car' || c.kind === 'dark') && audio && !opts.mute) { const l = audio.loop('motor_carro', { gain: 0.8 }); setTimeout(() => l.stop?.(1.2), 3800); } });

  return {
    init, get audio() { return audio; }, get ctx() { return ctx; },
    startAmbient() {
      if (!audio || ambient.length) return;
      ambient = AMBIENT.map(([n, o]) => { try { return audio.loop(n, o); } catch { return null; } }).filter(Boolean);
    },
    stopAmbient() { for (const l of ambient) l.stop?.(0.5); ambient = []; for (const l of loops.values()) l.stop?.(0.2); loops.clear(); audio?.stopLoops?.(); },
    update() {
      if (!audio) return;
      const a = lighting.area;
      const r = ROOMS[a] || 'fora';
      if (r !== room) { room = r; audio.setRoom?.(r); }
      audio.listener([player.st.x, player.st.eye, player.st.z], [-Math.sin(player.st.yaw), 0, -Math.cos(player.st.yaw)]);
    },
    babble(seed, text, o = {}) { if (!audio || opts.mute) return Math.max(0.8, text.length * 0.05); try { return audio.babble(seed, text, o); } catch { return text.length * 0.05; } },
    babbleDuration(seed, text, o = {}) { return audio?.babbleDuration ? audio.babbleDuration(seed, text, o) : text.length * 0.05; },
    get missing() { return [...missing]; },
    ui(name) { play(name); },
    setMuted(m) { opts.mute = m; if (m) { for (const l of loops.values()) l.stop?.(0.1); loops.clear(); for (const l of ambient) l.stop?.(0.1); ambient = []; } else this.startAmbient(); },
  };
}
