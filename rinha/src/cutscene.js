// Cutscenes. The real ones live in src/cutscenes/ (another builder); until they are wired in with
// setProvider(), each plays as a one-second black card with its name. Holding Esc, Start or the
// pause button for 1 s skips whatever is playing (the input layer sends 'skip').
export const NAMES = ['casa', 'pomar', 'flashes', 'cela-acordar', 'treino-fim', 'entrada-ringue', 'fim-campanha', 'familia'];

let provider = null;
export function setProvider(mod) { provider = mod; }

export function createCutscenes(root) {
  root.insertAdjacentHTML('beforeend', '<div id="cutscene" hidden><span></span></div>');
  const el = root.querySelector('#cutscene'), label = el.querySelector('span');
  let cur = null, holdBtn = null, holdTimer = 0;
  function dropBtn() { clearTimeout(holdTimer); if (holdBtn) { holdBtn.remove(); holdBtn = null; } }
  return {
    get playing() { return Boolean(cur); },
    get name() { return cur && cur.name; },
    /**
     * Starts a cutscene; onEnd runs once, at the end or when it is skipped. extra: options for the
     * real cutscene (for example { blocks } for the memory card). The one way to skip is to hold
     * (Esc, Start or the button for 1 s): the real player's own skip is switched off.
     */
    play(name, { onEnd, skippable = true, extra = {} } = {}) {
      const finish = () => { if (!cur) return; const c = cur; cur = null; el.hidden = true; dropBtn(); if (c.handle && c.handle.stop) c.handle.stop(); c.onEnd && c.onEnd(); };
      cur = { name, t: 0, dur: 1, onEnd, skippable, finish };
      if (provider && provider.playCutscene) {
        el.hidden = true;
        cur.handle = provider.playCutscene(name, { ...extra, onEnd: finish, skippable: false }) || null;
        cur.dur = provider.cutsceneDuration ? provider.cutsceneDuration(name) : 1;
        cur.external = true;
        if (skippable) { // touch: press and hold the button for 1 s (it carries the id the cutscene stylesheet leaves visible)
          holdBtn = document.createElement('div'); holdBtn.id = 'cs-skip'; holdBtn.textContent = 'PULAR: SEGURE 1 S';
          const stop = () => { clearTimeout(holdTimer); holdBtn && holdBtn.classList.remove('down'); };
          holdBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); holdBtn.classList.add('down'); clearTimeout(holdTimer); holdTimer = setTimeout(() => finish(), 1000); });
          holdBtn.addEventListener('pointerup', stop); holdBtn.addEventListener('pointercancel', stop); holdBtn.addEventListener('pointerleave', stop);
          root.appendChild(holdBtn);
        }
      } else { label.textContent = name.toUpperCase(); el.hidden = false; }
    },
    /** Advance in simulation time; returns true while a cutscene is running. */
    update(dt) {
      if (!cur) return false;
      cur.t += dt;
      if (!cur.external && cur.t >= cur.dur) cur.finish();
      return Boolean(cur);
    },
    skip() { if (cur && cur.skippable) cur.finish(); },
  };
}
