// DOM-based "juice": floating damage/heal numbers and hit/heal/shake flashes
// on lane elements. No canvas -- the board is plain HTML/CSS now.
export function spawnFloatingText(container, text, cssClass){
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'floating-text ' + (cssClass||'');
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

export function flashHit(laneSideEl){
  if (!laneSideEl) return;
  laneSideEl.classList.remove('lane-hit');
  void laneSideEl.offsetWidth;
  laneSideEl.classList.add('lane-hit');
  setTimeout(() => laneSideEl.classList.remove('lane-hit'), 400);
}

export function flashHeal(laneSideEl){
  if (!laneSideEl) return;
  laneSideEl.classList.remove('lane-heal');
  void laneSideEl.offsetWidth;
  laneSideEl.classList.add('lane-heal');
  setTimeout(() => laneSideEl.classList.remove('lane-heal'), 500);
}

export function shakeBoard(boardEl){
  if (!boardEl) return;
  boardEl.classList.remove('board-shake');
  void boardEl.offsetWidth;
  boardEl.classList.add('board-shake');
  setTimeout(() => boardEl.classList.remove('board-shake'), 260);
}
