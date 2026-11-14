// The title screen: the Sun sign at night, its light failing now and then, and one prompt (no name: the sign is it).
// It is the first thing after loading; the press that leaves it opens the title menu (continue, new game...) and
// is the gesture the browser wants before sound.
//
//   const t = showAttract({ root, saved, onStart })   saved: the line of the memory card, or null
//   t.setDevice('keyboard' | 'gamepad' | 'touch')     the prompt names the device in use
//   t.close()

const PRESS = { keyboard: 'APERTE ENTER', gamepad: 'APERTE START', touch: 'TOQUE PARA COMEÇAR' };

export function showAttract({ root, saved, onStart }) {
  const el = document.createElement('div');
  el.id = 'attract';
  el.setAttribute('aria-label', 'O Dia que Sobra');
  // no name on it: the picture is the sign (the game draws it behind), only the prompt and the card
  el.innerHTML = `
    <p class="press"></p>
    <p class="saved">${saved || 'NOVO JOGO'}</p>`;
  root.appendChild(el);
  const press = el.querySelector('.press');
  let closed = false;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!closed) onStart(); });
  return {
    setDevice(d) { const t = PRESS[d] || PRESS.keyboard; if (press.textContent !== t) press.textContent = t; },
    close() {
      if (closed) return;
      closed = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    },
  };
}
