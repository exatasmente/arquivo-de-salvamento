// Sound for the game: one AudioContext shared by the music (audio/music.js) and the effects
// (audio/sfx.js). The context is created at the first gesture (browsers refuse earlier) and
// resumed there; cues asked for before that play as soon as it exists.
import { createMusic } from './audio/music.js';
import { createSfx } from './audio/sfx.js';

const ZONE_SFX = { forehead: 'soco_testa', chin: 'soco_queixo', temple: 'soco_tempora', body: 'soco_testa' };

export function createSound() {
  let ctx = null, master = null, music = null, sfx = null, muted = false;
  let wantCue = null, wantCrowd = 0, seed = 1, curCue = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      // 22 kHz: the game's sound is cut above ~10.5 kHz anyway (the period's sampler), and half the
      // rate halves the audio thread's work, reverbs included. Falls back where the rate is refused.
      try { ctx = new AC({ sampleRate: 22050, latencyHint: 'interactive' }); } catch { ctx = new AC(); }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      music = createMusic(ctx, { seed, destination: master });
      sfx = createSfx(ctx, { seed, destination: master });
      if (wantCue) music.play(wantCue);
      if (wantCrowd > 0) sfx.setCrowd(wantCrowd);
    } catch { ctx = null; }
    return ctx;
  }
  // Esc does not count as a user gesture for the browser: the context waits for another key, a click or a touch
  const unlock = (e) => { if (e && e.code === 'Escape') return; const c = ensure(); if (c && c.state === 'suspended') c.resume(); };
  for (const e of ['pointerdown', 'keydown', 'touchstart', 'click']) addEventListener(e, unlock, { passive: true });

  const live = () => ctx && ctx.state === 'running';
  const api = {
    ensure, unlock,
    get muted() { return muted; },
    get currentCue() { return curCue; },
    get context() { return ctx; },
    setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03); },
    setSeed(s) { seed = s >>> 0 || 1; music?.setSeed?.(seed); sfx?.setSeed(seed); },
    /** The music for the current moment: cela, ringue, luta, vitoria, gameover, cartao, menu. */
    cue(name) { if (name === curCue) return; curCue = name; wantCue = name; if (music && live()) music.play(name); },
    stopMusic() { curCue = null; wantCue = null; music?.stop(1); },
    duck(on) { music?.duck(on); },
    play(name, o) { if (live()) { try { sfx.play(name, o); } catch { /* unknown name: ignore */ } } },
    /** Crowd noise, 0 (off) to 1 (roaring). */
    crowd(level) { wantCrowd = level; if (sfx && live()) sfx.setCrowd(level); },
    // named moments
    hit(level, zone) { api.play(level === 'bloq' ? 'soco_guarda' : ZONE_SFX[zone] ?? 'soco_testa', { vol: level === 'pesada' ? 1.2 : level === 'corpo' ? 0.8 : 1 }); },
    swing() { api.play('soco_ar'); },
    dodge() { api.play('esquiva'); },
    flash() { api.play('clarao'); music?.duck(true); setTimeout(() => music?.duck(false), 600); },
    knockdown() { api.play('knockdown'); },
    bell() { api.play('sino'); },
    /** The judge's whistle: a short shrill with a trill. */
    whistle() {
      if (!live()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(2900, t); l.frequency.value = 28; lg.gain.value = 140; l.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(master); o.start(t); l.start(t); o.stop(t + 0.55); l.stop(t + 0.55);
    },
    menu() { api.play('ui_mover'); },
    ok() { api.play('ui_ok'); },
    back() { api.play('ui_voltar'); },
  };
  return api;
}
