// All DOM/HUD rendering: deck-builder pool, hand, energy pips, pile counts,
// HP bars, status pills, and the win/lose banner. No game rules live here.
import { MAX_ENERGY } from './game.js';

const poolGrid = document.getElementById('poolGrid');
const deckCountEl = document.getElementById('deckCount');
const startDuelBtn = document.getElementById('startDuelBtn');
const handEl = document.getElementById('hand');
const pipsEl = document.getElementById('pips');
const hintEl = document.getElementById('hint');
const bannerEl = document.getElementById('banner');
const bannerSubEl = document.getElementById('bannerSub');

export function renderPool(pool, selectedDeck, onToggle){
  poolGrid.innerHTML = '';
  pool.forEach(card => {
    const div = document.createElement('div');
    const isSelected = selectedDeck.includes(card);
    div.className = 'card' + (isSelected ? ' selected' : '');
    div.style.borderColor = isSelected ? '#d9b44a' : (card.color+'55');
    div.innerHTML = `
      <div class="card-pick-badge">✓</div>
      <div class="card-top">
        <div class="card-name">${card.name}</div>
        <div class="card-cost">${card.cost}</div>
      </div>
      <div class="card-class" style="color:${card.color}">${card.cls}</div>
      <div class="card-desc">${card.desc}</div>
    `;
    div.addEventListener('click', () => onToggle(card));
    poolGrid.appendChild(div);
  });
}

export function renderDeckHeader(selectedCount, maxCount){
  deckCountEl.textContent = `${selectedCount} / ${maxCount} partes escolhidas`;
  deckCountEl.className = 'deck-count' + (selectedCount===maxCount ? ' ready' : '');
  startDuelBtn.disabled = selectedCount !== maxCount;
  startDuelBtn.textContent = selectedCount===maxCount ? 'Começar Duelo' : `Escolha ${maxCount-selectedCount} parte(s) a mais`;
}

export function renderHand(state, { onSelectAttack, onPlayDefense }){
  handEl.innerHTML = '';
  state.hand.forEach((card) => {
    const div = document.createElement('div');
    const affordable = state.energyYou >= card.cost;
    const isTurn = state.turn === 'you';
    div.className = 'card' + (state.selectedCard===card ? ' selected':'') + ((!affordable||!isTurn) ? ' disabled':'');
    div.style.borderColor = state.selectedCard===card ? '#d9b44a' : (card.color+'55');
    div.innerHTML = `
      <div class="card-top">
        <div class="card-name">${card.name}</div>
        <div class="card-cost">${card.cost}</div>
      </div>
      <div class="card-class" style="color:${card.color}">${card.cls}</div>
      <div class="card-desc">${card.desc}</div>
    `;
    if (affordable && isTurn){
      div.addEventListener('click', () => {
        if (card.type === 'defense') onPlayDefense(card);
        else onSelectAttack(card);
      });
    }
    handEl.appendChild(div);
  });
}

export function renderPips(state){
  pipsEl.innerHTML = '';
  for (let i=0;i<MAX_ENERGY;i++){
    const d = document.createElement('div');
    d.className = 'pip' + (i < state.energyYou ? ' filled' : '');
    pipsEl.appendChild(d);
  }
}

export function renderPiles(state){
  document.getElementById('deckPileCount').textContent = `Baralho: ${state.deck.length}`;
  document.getElementById('discardPileCount').textContent = `Descarte: ${state.discard.length}`;
}

function statusLabel(key){
  return {bleed:'🩸 Sangramento', deathmark:'💀 Marca', shield:'🛡️ Escudo', ambushed:'⚡ 1º golpe'}[key] || key;
}

export function renderStatus(state){
  const yEl = document.getElementById('statusYou');
  const rEl = document.getElementById('statusRival');
  yEl.innerHTML = Object.keys(state.statusYou).filter(k=>state.statusYou[k]>0 || state.statusYou[k]===true)
    .map(k=>`<span class="status-pill">${statusLabel(k)}</span>`).join('');
  rEl.innerHTML = Object.keys(state.statusRival).filter(k=>state.statusRival[k]>0 || state.statusRival[k]===true)
    .map(k=>`<span class="status-pill">${statusLabel(k)}</span>`).join('');
}

export function updateHPBars(state){
  document.getElementById('hpYou').style.width = Math.max(0,state.hpYou) + '%';
  document.getElementById('hpRival').style.width = Math.max(0,state.hpRival) + '%';
}

export function setHint(text){
  hintEl.textContent = text;
}

export function hideBanner(){
  bannerEl.classList.remove('show');
}

export function showBanner(text, sub){
  bannerEl.textContent = text;
  bannerSubEl.textContent = sub;
  bannerEl.appendChild(bannerSubEl);
  bannerEl.classList.add('show');
}
