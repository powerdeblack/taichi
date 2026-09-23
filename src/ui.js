// All DOM rendering: team-builder roster/squad, the lane board, hand, energy
// pips, pile counts, and the win/lose banner. No game rules live here.
import { MAX_ENERGY, LOADOUT_SIZE } from './game.js';
import { portraitHTML } from './axieArt.js';
import { initBoard3D, syncBoardAxies, projectLane, setLaneAlive, moveLaneVisual, setLaneLivePosition, setLaneRoaming } from './board3d.js';

const rosterGrid = document.getElementById('rosterGrid');
const squadListEl = document.getElementById('squadList');
const deckCountEl = document.getElementById('deckCount');
const startDuelBtn = document.getElementById('startDuelBtn');
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
      <div class="card-desc">${axie.desc}</div>
    `;
    div.addEventListener('click', () => onAdd(axie.classId));
    rosterGrid.appendChild(div);
  });
}

const CATS = [
  { key:'attack', label:'⚔️ Attack' },
  { key:'defense', label:'🛡️ Defense' },
  { key:'heal', label:'💚 Heal' },
];

// The set picker: a row of small icon buttons (one per card set), one per
// squad slot. A set whose color matches the Axie's own species color is
// the "native" combo (see cards.js CARD_SETS) -- gets a small star so the
// pairing that unlocks bonus signature cards is obvious at a glance.
export function renderSquad(squad, axies, sets, { onAdjust, onToggleTank, onToggleEvolve, onSetChange, onRemove }){
  squadListEl.innerHTML = '';
  squad.forEach((pick, idx) => {
    const axie = axies.find(a => a.classId === pick.classId);
    const set = sets.find(s => s.id === pick.setId) || sets[0];
    const total = pick.counts.attack + pick.counts.defense + pick.counts.heal;
    const row = document.createElement('div');
    row.className = 'squad-slot' + (pick.isTank ? ' is-tank' : '');
    row.innerHTML = `
      ${portraitHTML(pick.classId, axie.color, 'squad-portrait')}
      <div class="squad-slot-info">
        <div class="squad-slot-name">
          ${axie.name}${pick.evolved ? '<span class="role-badge evolved">+</span>' : ''}
          <span class="set-tag" style="color:${set.color}">${set.icon} ${set.name}${set.nativeClassId===pick.classId ? ' ⭐' : ''}</span>
          <button type="button" class="tank-toggle${pick.isTank?' active':''}" title="Mark as Tank">${pick.isTank ? '🎯 TANK' : 'mark as Tank'}</button>
          <button type="button" class="evolve-toggle${pick.evolved?' active':''}" title="Evolve this Axie's loadout (+15% power/HP/MP)">${pick.evolved ? '✦ Evolved' : 'evolve (+)'}</button>
        </div>
        <div class="set-picker">
          ${sets.map(s => `<button type="button" class="set-btn${pick.setId===s.id?' active':''}" data-set="${s.id}" title="${s.name}${s.nativeClassId===pick.classId ? ' (native -- bonus card!)' : ''}" style="--set-color:${s.color}">${s.icon}${s.nativeClassId===pick.classId ? '⭐' : ''}</button>`).join('')}
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
        <div class="loadout-total${total===LOADOUT_SIZE?' ok':''}">${total} / ${LOADOUT_SIZE} cards</div>
      </div>
      <button type="button" class="squad-remove" aria-label="Remove">×</button>
    `;
    row.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => onAdjust(idx, btn.dataset.cat, Number(btn.dataset.delta)));
    });
    row.querySelectorAll('.set-btn').forEach(btn => {
      btn.addEventListener('click', () => onSetChange(idx, btn.dataset.set));
    });
    row.querySelector('.tank-toggle').addEventListener('click', () => onToggleTank(idx));
    row.querySelector('.evolve-toggle').addEventListener('click', () => onToggleEvolve(idx));
    row.querySelector('.squad-remove').addEventListener('click', () => onRemove(idx));
    squadListEl.appendChild(row);
  });
}

export function renderSquadHeader(squad, maxCount){
  const tankCount = squad.filter(p => p.isTank).length;
  const full = squad.length === maxCount;
  const loadoutsOk = squad.every(p => p.counts.attack + p.counts.defense + p.counts.heal === LOADOUT_SIZE);
  const valid = full && tankCount === 1 && loadoutsOk;
  deckCountEl.textContent = `${squad.length} / ${maxCount} Axies · ${tankCount} Tank${tankCount===1?'':'s'}`;
  deckCountEl.className = 'deck-count' + (valid ? ' ready' : '');
  startDuelBtn.disabled = !valid;
  if (valid) startDuelBtn.textContent = 'Start Duel';
  else if (!full) startDuelBtn.textContent = `Pick ${maxCount-squad.length} more Axie(s)`;
  else if (!loadoutsOk) startDuelBtn.textContent = `Each Axie needs ${LOADOUT_SIZE} cards total`;
  else if (tankCount === 0) startDuelBtn.textContent = 'Mark 1 Axie as Tank';
  else startDuelBtn.textContent = 'Needs exactly 1 Tank';
}

// ================= Board (3D) =================
// The battlefield itself is a shared three.js scene (board3d.js): every
// alive Axie on both squads is a real 3D model standing in two facing rows.
// HP/name/status stay plain HTML "unit tags" absolutely positioned over
// each model by projecting its world position through the camera.
const board3dCanvas = document.getElementById('board3dCanvas');
const boardOverlay = document.getElementById('boardOverlay');
let board3dReady = null;
let unitRefs = { you: [], rival: [] };
let resizeListenerBound = false;
let currentState = null;
let activeSelectable = []; // { ref, cssClass, handler } -- see setSelectable/clearSelectable

// Numeric fields that ride along a status entry (e.g. dodgeChance next to
// dodgeCharges) but aren't themselves a status to show a pill for.
const STATUS_COMPANION_KEYS = new Set(['dodgeChance', 'thornsPct']);

const STATUS_LABELS = {
  bleed:'🩸 Bleed', poison:'☠️ Poison', deathmark:'💀 Mark', shield:'🛡️ Shield',
  bulwark:'🛡️+ Bulwark', vulnerable:'⚡ Vulnerable', barrier:'🔵 Barrier',
  dodgeCharges:'💨 Evasion', thornsHits:'🌵 Thorns', regen:'🌿 Regen', regenRot:'🥀 Rot',
};

function statusLabel(key, value){
  const label = STATUS_LABELS[key] || key;
  if (key === 'barrier') return `${label} ${value}`;
  if (typeof value === 'number' && value > 1) return `${label} x${value}`;
  return label;
}

function buildUnitTag(){
  const wrap = document.createElement('div');
  wrap.className = 'unit-tag';
  wrap.innerHTML = `
    <div class="unit-chip">
      <div class="lane-name"></div>
      <div class="hp-bar-bg"><div class="hp-bar-fill"></div></div>
      <div class="mp-label"></div>
      <div class="status-icons"></div>
    </div>
  `;
  boardOverlay.appendChild(wrap);
  return {
    wrap,
    chip: wrap.querySelector('.unit-chip'),
    nameEl: wrap.querySelector('.lane-name'),
    hpFill: wrap.querySelector('.hp-bar-fill'),
    mpEl: wrap.querySelector('.mp-label'),
    statusEl: wrap.querySelector('.status-icons'),
  };
}

// Overlay position tracks each lane's live `localPos` (mutable via the
// discrete move swap or, for the Tank, continuous free-roam), not its
// array index -- repositionUnits reads it off the live game state.
function repositionUnits(){
  if (!currentState) return;
  ['you','rival'].forEach(side => {
    const lanes = side === 'you' ? currentState.youLanes : currentState.rivalLanes;
    unitRefs[side].forEach((ref, i) => {
      const lane = lanes[i];
      if (!ref || !lane) return;
      const p = projectLane(side, lane.localPos);
      if (!p) return;
      ref.wrap.style.left = (p.x*100) + '%';
      ref.wrap.style.top = (p.y*100) + '%';
    });
  });
}

// Continuous per-frame repositioning for one lane (the Tank while its
// joystick is held) -- bypasses the CSS transition used by the discrete
// move swap so it tracks the drag 1:1 instead of chasing it, and drives
// the 3D model the same way (no lerp).
export function setLiveLanePosition(side, laneIndex, localPos){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  if (ref) ref.wrap.classList.add('no-transition');
  setLaneLivePosition(side, laneIndex, localPos);
  const p = projectLane(side, localPos);
  if (ref && p){
    ref.wrap.style.left = (p.x*100) + '%';
    ref.wrap.style.top = (p.y*100) + '%';
  }
}

export function endLiveLanePosition(side, laneIndex){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  if (ref) ref.wrap.classList.remove('no-transition');
  setLaneRoaming(side, laneIndex, false);
}

// `onUnitClick(side, laneIndex)` is wired once per unit chip here (not via
// setSelectable) so it's always live, independent of any one-shot
// targeting mode -- the tap-target-first flow: pick an Axie on the board,
// then a card in hand to use on it. main.js no-ops the callback while
// move-mode (setSelectable) is active instead of us coordinating here.
export function buildBoard(state, onUnitClick){
  currentState = state;
  boardOverlay.innerHTML = '';
  unitRefs = {
    you: state.youLanes.map(() => buildUnitTag()),
    rival: state.rivalLanes.map(() => buildUnitTag()),
  };
  if (onUnitClick){
    ['you','rival'].forEach(side => {
      unitRefs[side].forEach((ref, i) => {
        ref.chip.addEventListener('click', () => onUnitClick(side, i));
      });
    });
  }

  // initBoard3D sets up the camera synchronously, so overlays can be
  // positioned right away -- they shouldn't wait on the 3D models (which
  // load asynchronously and pop in a moment later via syncBoardAxies).
  if (!board3dReady) board3dReady = initBoard3D(board3dCanvas);
  repositionUnits();
  board3dReady
    .then(() => syncBoardAxies(state.youLanes, state.rivalLanes))
    .catch(err => console.error('3D board failed:', err));

  if (!resizeListenerBound){
    resizeListenerBound = true;
    window.addEventListener('resize', repositionUnits);
  }
  updateBoard(state);
}

export function updateBoard(state){
  currentState = state;
  state.youLanes.forEach((lane, i) => updateUnit(unitRefs.you[i], lane, 'you', i));
  state.rivalLanes.forEach((lane, i) => updateUnit(unitRefs.rival[i], lane, 'rival', i));
  repositionUnits();
}

// Animates a lane's overlay tag sliding to its new local {x,z} (in
// lockstep with the 3D model's slide, see board3d.js moveLaneVisual) and
// triggers the 3D slide itself. Used after the discrete move-swap
// (moveLane), not for the Tank's continuous roam -- see setLiveLanePosition.
export function animateMove(side, laneIndex, newLocalPos){
  moveLaneVisual(side, laneIndex, newLocalPos);
  repositionUnits();
}

// Highlights a set of unit chips as clickable (targeting an enemy, or
// picking a lane to move) and wires a click handler on each. Call
// clearSelectable() to remove any previous highlight/handlers first --
// setSelectable does this automatically.
export function setSelectable(entries){
  clearSelectable();
  entries.forEach(({ side, laneIndex, cssClass, onClick }) => {
    const ref = unitRefs[side] && unitRefs[side][laneIndex];
    if (!ref) return;
    ref.chip.classList.add(cssClass);
    ref.chip.style.pointerEvents = 'auto';
    const handler = (e) => { e.stopPropagation(); onClick(); };
    ref.chip.addEventListener('click', handler);
    activeSelectable.push({ ref, cssClass, handler });
  });
}

export function clearSelectable(){
  activeSelectable.forEach(({ ref, cssClass, handler }) => {
    ref.chip.classList.remove(cssClass);
    ref.chip.style.pointerEvents = '';
    ref.chip.removeEventListener('click', handler);
  });
  activeSelectable = [];
}

export function markMoveSource(side, laneIndex, on){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  if (ref) ref.chip.classList.toggle('move-source', on);
}

function updateUnit(ref, lane, side, laneIndex){
  if (!ref) return;
  const { attack, defense, heal } = lane.counts;
  ref.nameEl.innerHTML = `${lane.name}${lane.evolved ? '<span class="role-badge evolved">+</span>' : ''}${lane.isTank ? '<span class="role-badge tank">🎯</span>' : ''}`;
  ref.hpFill.style.width = Math.max(0, lane.hp/lane.maxHp*100) + '%';
  ref.mpEl.textContent = `MP ${lane.mp} · ⚔️${attack} 🛡️${defense} 💚${heal}`;
  ref.statusEl.innerHTML = Object.keys(lane.status)
    .filter(k => !STATUS_COMPANION_KEYS.has(k) && (lane.status[k]>0 || lane.status[k]===true))
    .map(k => `<span class="status-pill">${statusLabel(k, lane.status[k])}</span>`).join('');
  ref.chip.classList.toggle('dead', !lane.alive);
  setLaneAlive(side, laneIndex, lane.alive);
}

export function getLaneSideEl(side, laneIndex){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  return ref ? ref.chip : null;
}

// A persistent highlight for "this is the currently selected target" (the
// tap-target-first flow: pick an Axie on the board, then pick a card to
// use on it). Independent of setSelectable/clearSelectable's one-shot
// targeting modes, which are only used for the move-swap flow now.
export function markSelectedTarget(side, laneIndex, on){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  if (ref) ref.chip.classList.toggle('selected-target', on);
}

// ================= Hand / energy / piles =================
// Reconciles by card.uid instead of wiping+rebuilding the whole hand every
// call -- renderHand runs on a fast fixed tick (energy is continuous, so
// affordability can flip at any moment), and a full innerHTML='' + rebuild
// every ~150ms was destroying and recreating the exact DOM node a real tap
// or click was targeting, which could make the tap land on nothing and the
// card visibly fail to respond. Keeping one persistent element per uid
// means a click's target never gets pulled out from under it.
const handNodes = new Map(); // card.uid -> element
export function renderHand(state, { onPlay }){
  const seen = new Set();
  state.hand.forEach((card, i) => {
    seen.add(card.uid);
    const casterLane = state.youLanes[card.laneIndex];
    const laneAlive = casterLane && casterLane.alive;
    const affordable = state.energyYou >= card.cost;
    const playable = affordable && !state.gameOver && laneAlive;
    const rangeLabel = card.range==='short' ? 'Short' : card.range==='long' ? 'Long'
      : card.role==='heal' ? 'Heal' : 'Defense';

    let div = handNodes.get(card.uid);
    if (!div){
      div = document.createElement('div');
      handNodes.set(card.uid, div);
    }
    div.className = 'card' + (!playable ? ' disabled' : '');
    div.style.borderColor = card.color + '55';
    div.innerHTML = `
      <div class="card-top">
        <div class="card-name">${card.name}</div>
        <div class="card-cost">${card.cost}</div>
      </div>
      <div class="card-class" style="color:${card.color}">${card.setIcon ? card.setIcon+' ' : ''}${card.setName || card.cls} · ${rangeLabel}</div>
      <div class="card-desc">${card.desc}${!laneAlive ? ' <b>(lane destroyed)</b>' : ''}</div>
    `;
    div.onclick = playable ? () => onPlay(card) : null;
    if (handEl.children[i] !== div) handEl.insertBefore(div, handEl.children[i] || null);
  });
  for (const [uid, div] of handNodes){
    if (!seen.has(uid)){
      div.remove();
      handNodes.delete(uid);
    }
  }
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
  document.getElementById('deckPileCount').textContent = `Deck: ${state.deck.length}`;
  document.getElementById('discardPileCount').textContent = `Discard: ${state.discard.length}`;
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
