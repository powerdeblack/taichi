// All DOM rendering: team-picker roster, the 3-lane board, hand, energy
// pips, pile counts, and the win/lose banner. No game rules live here.
import { MAX_ENERGY } from './game.js';
import { portraitHTML } from './axieArt.js';

const rosterGrid = document.getElementById('rosterGrid');
const deckCountEl = document.getElementById('deckCount');
const startDuelBtn = document.getElementById('startDuelBtn');
const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const pipsEl = document.getElementById('pips');
const hintEl = document.getElementById('hint');
const bannerEl = document.getElementById('banner');
const bannerSubEl = document.getElementById('bannerSub');

// ================= Team picker (roster) =================
export function renderRoster(axies, selectedClassIds, onToggle){
  rosterGrid.innerHTML = '';
  axies.forEach(axie => {
    const laneNum = selectedClassIds.indexOf(axie.classId) + 1;
    const isSelected = laneNum > 0;
    const div = document.createElement('div');
    div.className = 'card roster-card' + (isSelected ? ' selected' : '');
    div.style.borderColor = isSelected ? '#d9b44a' : (axie.color+'55');
    div.innerHTML = `
      <div class="card-pick-badge">${isSelected ? laneNum : ''}</div>
      ${portraitHTML(axie.classId, axie.color, 'roster-portrait')}
      <div class="card-top">
        <div class="card-name">${axie.name}</div>
      </div>
      <div class="card-class" style="color:${axie.color}">${axie.classId}</div>
      <div class="card-desc">${axie.cards.map(c => `<b>${c.name}</b> (${c.range==='short'?'curto':c.range==='long'?'longo':c.role==='heal'?'cura':'defesa'}): ${c.desc}`).join('<br>')}</div>
    `;
    div.addEventListener('click', () => onToggle(axie.classId));
    rosterGrid.appendChild(div);
  });
}

export function renderRosterHeader(selectedCount, maxCount){
  deckCountEl.textContent = `${selectedCount} / ${maxCount} Axies escolhidos`;
  deckCountEl.className = 'deck-count' + (selectedCount===maxCount ? ' ready' : '');
  startDuelBtn.disabled = selectedCount !== maxCount;
  startDuelBtn.textContent = selectedCount===maxCount ? 'Começar Duelo' : `Escolha ${maxCount-selectedCount} Axie(s) a mais`;
}

// ================= Board =================
let laneRefs = [];

function statusLabel(key){
  return {bleed:'🩸 Sangramento', deathmark:'💀 Marca', shield:'🛡️ Escudo'}[key] || key;
}

function laneSideHTML(lane){
  return `
    ${portraitHTML(lane.classId, lane.color, 'board-portrait')}
    <div class="lane-info">
      <div class="lane-name">${lane.name}</div>
      <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:${Math.max(0,lane.hp)}%"></div></div>
      <div class="status-icons"></div>
    </div>
  `;
}

export function buildBoard(state){
  boardEl.innerHTML = '';
  laneRefs = [];
  for (let i=0; i<state.youLanes.length; i++){
    const row = document.createElement('div');
    row.className = 'lane-row';
    const youSide = document.createElement('div');
    youSide.className = 'lane-side you';
    youSide.innerHTML = laneSideHTML(state.youLanes[i]);
    const mid = document.createElement('div');
    mid.className = 'lane-mid';
    mid.textContent = 'VS';
    const rivalSide = document.createElement('div');
    rivalSide.className = 'lane-side rival';
    rivalSide.innerHTML = laneSideHTML(state.rivalLanes[i]);

    row.appendChild(youSide);
    row.appendChild(mid);
    row.appendChild(rivalSide);
    boardEl.appendChild(row);

    laneRefs.push({
      row,
      you: { side: youSide, hpFill: youSide.querySelector('.hp-bar-fill'), status: youSide.querySelector('.status-icons') },
      rival: { side: rivalSide, hpFill: rivalSide.querySelector('.hp-bar-fill'), status: rivalSide.querySelector('.status-icons') },
    });
  }
  updateBoard(state);
}

export function updateBoard(state){
  state.youLanes.forEach((lane, i) => updateLaneSide(laneRefs[i].you, lane));
  state.rivalLanes.forEach((lane, i) => updateLaneSide(laneRefs[i].rival, lane));
}

function updateLaneSide(ref, lane){
  ref.hpFill.style.width = Math.max(0, lane.hp) + '%';
  ref.status.innerHTML = Object.keys(lane.status).filter(k => lane.status[k]>0 || lane.status[k]===true)
    .map(k => `<span class="status-pill">${statusLabel(k)}</span>`).join('');
  ref.side.classList.toggle('dead', !lane.alive);
}

export function getLaneSideEl(side, laneIndex){
  const ref = laneRefs[laneIndex];
  if (!ref) return null;
  return side === 'you' ? ref.you.side : ref.rival.side;
}

// ================= Hand / energy / piles =================
export function renderHand(state, { onPlay }){
  handEl.innerHTML = '';
  state.hand.forEach((card) => {
    const div = document.createElement('div');
    const casterLane = state.youLanes.find(l => l.classId === card.cls);
    const laneAlive = casterLane && casterLane.alive;
    const affordable = state.energyYou >= card.cost;
    const isTurn = state.turn === 'you';
    const playable = affordable && isTurn && laneAlive;
    div.className = 'card' + (!playable ? ' disabled' : '');
    div.style.borderColor = card.color + '55';
    const rangeLabel = card.range==='short' ? 'Curto' : card.range==='long' ? 'Longo' : card.role==='heal' ? 'Cura' : 'Defesa';
    div.innerHTML = `
      <div class="card-top">
        <div class="card-name">${card.name}</div>
        <div class="card-cost">${card.cost}</div>
      </div>
      <div class="card-class" style="color:${card.color}">${card.cls} · ${rangeLabel}</div>
      <div class="card-desc">${card.desc}${!laneAlive ? ' <b>(linha destruída)</b>' : ''}</div>
    `;
    if (playable) div.addEventListener('click', () => onPlay(card));
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
