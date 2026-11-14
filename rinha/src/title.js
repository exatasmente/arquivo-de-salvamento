// The title screen: the game's logo over the empty ring, the camera going round it, and one prompt. It is the
// first thing after loading, and the press that leaves it is the gesture the browser wants before sound.
//
//   const t = showTitle({ root, saved, onStart })   saved: the line of the memory card, or null
//   t.setDevice('keyboard' | 'gamepad' | 'touch')   the prompt names the device in use
//   t.close()

const PRESS = { keyboard: 'APERTE ENTER', gamepad: 'APERTE START', touch: 'TOQUE PARA COMEÇAR' };

export function showTitle({ root, saved, onStart }) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.innerHTML = `
    <div class="logo" aria-label="Rinha">${[...'RINHA'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
    <p class="press"></p>
    <p class="saved">${saved ? saved : 'NOVO JOGO'}</p>
    <p class="foot">ARQUIVO DE SALVAMENTO</p>`;
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
