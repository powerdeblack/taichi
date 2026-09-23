// DOM-based "juice": floating damage/heal numbers, hit/heal/shake flashes on
// lane elements, and a card-face popup when a card resolves. No canvas --
// the board is plain HTML/CSS now. Durations here are intentionally
// generous (not the snappiest possible) -- activations were reading as too
// fast/hard to follow, so every effect below lingers long enough to
// actually register before it clears.
export function spawnFloatingText(container, text, cssClass){
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'floating-text ' + (cssClass||'');
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

export function flashHit(laneSideEl){
  if (!laneSideEl) return;
  laneSideEl.classList.remove('lane-hit');
  void laneSideEl.offsetWidth;
  laneSideEl.classList.add('lane-hit');
  setTimeout(() => laneSideEl.classList.remove('lane-hit'), 650);
}

export function flashHeal(laneSideEl){
  if (!laneSideEl) return;
  laneSideEl.classList.remove('lane-heal');
  void laneSideEl.offsetWidth;
  laneSideEl.classList.add('lane-heal');
  setTimeout(() => laneSideEl.classList.remove('lane-heal'), 750);
}

export function shakeBoard(boardEl){
  if (!boardEl) return;
  boardEl.classList.remove('board-shake');
  void boardEl.offsetWidth;
  boardEl.classList.add('board-shake');
  setTimeout(() => boardEl.classList.remove('board-shake'), 320);
}
