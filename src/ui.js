// All DOM rendering: team-builder roster/squad, the lane board, hand, energy
// pips, pile counts, and the win/lose banner. No game rules live here.
import { MAX_ENERGY, LOADOUT_SIZE } from './game.js';
import { portraitHTML } from './axieArt.js';

const rosterGrid = document.getElementById('rosterGrid');
const squadListEl = document.getElementById('squadList');
const deckCountEl = document.getElementById('deckCount');
const startDuelBtn = document.getElementById('startDuelBtn');
const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const pipsEl = document.getElementById('pips');
const hintEl = document.getElementById('hint');
const bannerEl = document.getElementById('banner');
const bannerSubEl = document.getElementById('bannerSub');

// ================= Team builder =================
export function renderRoster(axies, squad, onAdd){
  rosterGrid.innerHTML = '';
  axies.forEach(axie => {
    const count = squad.filter(p => p.classId === axie.classId).length;
    const div = document.createElement('div');
    div.className = 'card roster-card' + (count > 0 ? ' selected' : '');
    div.style.borderColor = count > 0 ? '#d9b44a' : (axie.color+'55');
    div.innerHTML = `
      <div class="card-pick-badge">${count > 0 ? '×'+count : ''}</div>
      ${portraitHTML(axie.classId, axie.color, 'roster-portrait')}
      <div class="card-top"><div class="card-name">${axie.name}</div></div>
      <div class="card-class" style="color:${axie.color}">${axie.classId}</div>
      <div class="card-desc">${axie.attackCards.map(c => `<b>${c.name}</b>: ${c.desc}`).join('<br>')}</div>
    `;
    div.addEventListener('click', () => onAdd(axie.classId));
    rosterGrid.appendChild(div);
  });
}

const CATS = [
  { key:'attack', label:'⚔️ Ataque' },
  { key:'defense', label:'🛡️ Defesa' },
  { key:'heal', label:'💚 Cura' },
];

export function renderSquad(squad, axies, { onAdjust, onToggleTank, onRemove }){
  squadListEl.innerHTML = '';
  squad.forEach((pick, idx) => {
    const axie = axies.find(a => a.classId === pick.classId);
    const total = pick.counts.attack + pick.counts.defense + pick.counts.heal;
    const row = document.createElement('div');
    row.className = 'squad-slot' + (pick.isTank ? ' is-tank' : '');
    row.innerHTML = `
      ${portraitHTML(pick.classId, axie.color, 'squad-portrait')}
      <div class="squad-slot-info">
        <div class="squad-slot-name">
          ${axie.name}
          <button type="button" class="tank-toggle${pick.isTank?' active':''}" title="Marcar como Tanque">${pick.isTank ? '🎯 TANQUE' : 'marcar Tanque'}</button>
        </div>
        <div class="stat-steppers">
          ${CATS.map(c => `
            <div class="stat-stepper">
              <span class="stat-stepper-label">${c.label}</span>
              <button type="button" class="stepper-btn" data-cat="${c.key}" data-delta="-1">−</button>
              <span class="stat-stepper-value">${pick.counts[c.key]}</span>
              <button type="button" class="stepper-btn" data-cat="${c.key}" data-delta="1">+</button>
            </div>
          `).join('')}
        </div>
        <div class="loadout-total${total===LOADOUT_SIZE?' ok':''}">${total} / ${LOADOUT_SIZE} cartas</div>
      </div>
      <button type="button" class="squad-remove" aria-label="Remover">×</button>
    `;
    row.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => onAdjust(idx, btn.dataset.cat, Number(btn.dataset.delta)));
    });
    row.querySelector('.tank-toggle').addEventListener('click', () => onToggleTank(idx));
    row.querySelector('.squad-remove').addEventListener('click', () => onRemove(idx));
    squadListEl.appendChild(row);
  });
}

export function renderSquadHeader(squad, maxCount){
  const tankCount = squad.filter(p => p.isTank).length;
  const full = squad.length === maxCount;
  const loadoutsOk = squad.every(p => p.counts.attack + p.counts.defense + p.counts.heal === LOADOUT_SIZE);
  const valid = full && tankCount === 1 && loadoutsOk;
  deckCountEl.textContent = `${squad.length} / ${maxCount} Axies · ${tankCount} Tanque${tankCount===1?'':'s'}`;
  deckCountEl.className = 'deck-count' + (valid ? ' ready' : '');
  startDuelBtn.disabled = !valid;
  if (valid) startDuelBtn.textContent = 'Começar Duelo';
  else if (!full) startDuelBtn.textContent = `Escolha ${maxCount-squad.length} Axie(s) a mais`;
  else if (!loadoutsOk) startDuelBtn.textContent = `Cada Axie precisa de ${LOADOUT_SIZE} cartas no total`;
  else if (tankCount === 0) startDuelBtn.textContent = 'Marque 1 Axie como Tanque';
  else startDuelBtn.textContent = 'Precisa de exatamente 1 Tanque';
}

// ================= Board =================
let laneRefs = [];

function statusLabel(key){
  return {bleed:'🩸 Sangramento', deathmark:'💀 Marca', shield:'🛡️ Escudo'}[key] || key;
}

function laneSideHTML(lane){
  const { attack, defense, heal } = lane.counts;
  return `
    ${portraitHTML(lane.classId, lane.color, 'board-portrait')}
    <div class="lane-info">
      <div class="lane-name">${lane.name} ${lane.isTank ? '<span class="role-badge tank">🎯 TANQUE</span>' : ''}</div>
      <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:${Math.max(0,lane.hp/lane.maxHp*100)}%"></div></div>
      <div class="mp-label">MP ${lane.mp} · ⚔️${attack} 🛡️${defense} 💚${heal}</div>
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
    youSide.className = 'lane-side you' + (state.youLanes[i].isTank ? ' is-tank' : '');
    youSide.innerHTML = laneSideHTML(state.youLanes[i]);
    const mid = document.createElement('div');
    mid.className = 'lane-mid';
    mid.textContent = 'VS';
    const rivalSide = document.createElement('div');
    rivalSide.className = 'lane-side rival' + (state.rivalLanes[i].isTank ? ' is-tank' : '');
    rivalSide.innerHTML = laneSideHTML(state.rivalLanes[i]);

    row.appendChild(youSide);
    row.appendChild(mid);
    row.appendChild(rivalSide);
    boardEl.appendChild(row);

    laneRefs.push({
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
  ref.hpFill.style.width = Math.max(0, lane.hp/lane.maxHp*100) + '%';
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
    const casterLane = state.youLanes[card.laneIndex];
    const laneAlive = casterLane && casterLane.alive;
    const affordable = state.energyYou >= card.cost;
    const isTurn = state.turn === 'you';
    const playable = affordable && isTurn && laneAlive;
    div.className = 'card' + (!playable ? ' disabled' : '');
    div.style.borderColor = card.color + '55';
    const rangeLabel = card.range==='short' ? 'Curto' : card.range==='long' ? 'Longo'
      : card.role==='heal' ? 'Cura' : 'Defesa';
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
