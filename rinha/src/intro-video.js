// The opening of the game: one video, the story from the house to the second waking in the cell,
// told with the game's own dialogue boxes. The game starts where it ends, in the cell.
//
//   playIntroVideo({ root, audio, onEnd(info) })   // info: { skipped, failed }
//
// Browsers only play a video with sound after a gesture, so a title asks for a key first. The video
// can be skipped (Enter, Space, Esc, a pad button or the button) after a short grace. If the file
// does not load, onEnd({ failed: true }) lets the game fall back to its real-time cutscenes.

export const INTRO_SRC = 'media/abertura.mp4';
const GRACE = 1.5; // seconds before a skip counts, so the key that started the video does not skip it

export function playIntroVideo({ root, audio, onEnd, src = INTRO_SRC }) {
  const wrap = document.createElement('div');
  wrap.id = 'intro-video';
  wrap.innerHTML = `
    <video playsinline preload="auto"></video>
    <div class="title"><p>ARQUIVO DE SALVAMENTO</p><p class="blink">APERTE QUALQUER TECLA</p></div>
    <div class="skip" hidden>PULAR &gt;&gt;</div>`;
  root.appendChild(wrap);
  const video = wrap.querySelector('video'), title = wrap.querySelector('.title'), skipBtn = wrap.querySelector('.skip');
  video.src = src;
  let started = false, ended = false, startedAt = 0, raf = 0, lastPad = false;

  audio?.stopMusic?.(); audio?.crowd?.(0);

  function finish(info) {
    if (ended) return;
    ended = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true); wrap.removeEventListener('pointerdown', onPointer);
    video.pause(); video.removeAttribute('src'); video.load(); wrap.remove();
    onEnd?.(info);
  }
  const canSkip = () => started && performance.now() - startedAt > GRACE * 1000;

  function start() {
    if (started || ended) return;
    started = true; startedAt = performance.now();
    title.hidden = true; skipBtn.hidden = false;
    audio?.unlock?.();
    video.muted = Boolean(audio?.muted);
    video.play().catch(() => { video.muted = true; video.play().catch(() => finish({ skipped: false, failed: true })); });
  }
  function onKey(e) {
    if (!started) { if (e.code !== 'Escape') { e.preventDefault(); start(); } return; }
    if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') && canSkip()) { e.preventDefault(); finish({ skipped: true }); }
  }
  function onPointer(e) {
    if (!started) { start(); return; }
    if (e.target === skipBtn && canSkip()) finish({ skipped: true });
  }
  function pad() {
    if (ended) return;
    let down = false;
    for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.buttons.some((b) => b.pressed)) down = true;
    if (down && !lastPad) { if (!started) start(); else if (canSkip()) finish({ skipped: true }); }
    lastPad = down;
    raf = requestAnimationFrame(pad);
  }

  addEventListener('keydown', onKey, true);
  wrap.addEventListener('pointerdown', onPointer);
  video.addEventListener('ended', () => finish({ skipped: false }));
  video.addEventListener('error', () => finish({ skipped: false, failed: true }));
  raf = requestAnimationFrame(pad);
  return { skip: () => finish({ skipped: true }) };
}
