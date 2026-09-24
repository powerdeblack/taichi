// All DOM rendering: team-builder roster/squad, the lane board, hand, energy
// pips, pile counts, and the win/lose banner. No game rules live here.
import { MAX_ENERGY, LOADOUT_SIZE, SQUAD_SIZE } from './game.js';
import { portraitHTML } from './axieArt.js';
import { initBoard3D, syncBoardAxies, projectLane, setLaneAlive, moveLaneVisual, setLaneLivePosition, setLaneRoaming, spawnImpact as spawnImpact3D, setTauntRing, showAim, hideAim,
  startCastFX, launchCastFX, landCastFX, clearCastsFX, setBlizzard, hitSquash, cinematics } from './board3d.js';
export { setTauntRing, showAim, hideAim, startCastFX, launchCastFX, landCastFX, clearCastsFX, setBlizzard, hitSquash, cinematics };

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
  const full = squad.length >= SQUAD_SIZE;
  axies.forEach(axie => {
    const count = squad.filter(p => p.classId === axie.classId).length;
    const div = document.createElement('div');
    div.className = 'card roster-card' + (count > 0 ? ' selected' : '') + (full ? ' at-cap' : '');
    div.style.setProperty('--roster-color', axie.color);
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

const archetypeRow = document.getElementById('archetypeRow');

// Ready-made teams with their style and how they work -- deliberately no
// rankings or matchup data: players find out what beats what themselves.
export function renderArchetypes(archetypes, axies, sets, onUse, activeId){
  archetypeRow.innerHTML = '';
  archetypes.forEach(arch => {
    const card = document.createElement('div');
    card.className = 'arch-card' + (arch.id === activeId ? ' active' : '');
    card.style.setProperty('--arch-color', arch.color);
    const members = arch.picks.map(p => {
      const axie = axies.find(a => a.classId === p.classId);
      const set = sets.find(s => s.id === p.setId);
      return `<div class="arch-member">
        ${portraitHTML(p.classId, axie.color, 'arch-portrait')}
        <div class="arch-member-set" style="color:${set.color}">${set.icon} ${set.name}</div>
        ${p.isTank ? '<div class="arch-tank">🛡️ Tank</div>' : ''}
      </div>`;
    }).join('');
    card.innerHTML = `
      <div class="arch-head"><span class="arch-icon">${arch.icon}</span><span class="arch-name">${arch.name}</span></div>
      <div class="arch-tags">${arch.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="arch-members">${members}</div>
      <p class="arch-how">${arch.how}</p>
      <button type="button" class="arch-use">${arch.id === activeId ? '✓ Loaded' : 'Use this team'}</button>
    `;
    card.querySelector('.arch-use').addEventListener('click', () => onUse(arch));
    archetypeRow.appendChild(card);
  });
}

const CATS = [
  { key:'attack', label:'⚔️ Attack', color:'var(--clay)' },
  { key:'defense', label:'🛡️ Defense', color:'var(--aqua)' },
  { key:'heal', label:'💚 Heal', color:'#8fd08f' },
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
    row.style.setProperty('--slot-color', axie.color);
    row.innerHTML = `
      ${portraitHTML(pick.classId, axie.color, 'squad-portrait')}
      <div class="squad-slot-info">
        <div class="squad-slot-name">
          ${axie.name}${pick.evolved ? '<span class="role-badge evolved">+</span>' : ''}
          <span class="set-tag" style="color:${set.color}">${set.icon} ${set.name}${set.nativeClassId===pick.classId ? ' ⭐' : ''}</span>
          <button type="button" class="tank-toggle${pick.isTank?' active':''}" title="Mark as Tank">${pick.isTank ? '🛡️ TANK' : 'mark as Tank'}</button>
          <button type="button" class="evolve-toggle${pick.evolved?' active':''}" title="Evolve this Axie's loadout (+15% power/HP/MP)">${pick.evolved ? '✦ Evolved' : 'evolve (+)'}</button>
        </div>
        <div class="micro-label">Card set</div>
        <div class="set-picker">
          ${sets.map(s => `<button type="button" class="set-btn${pick.setId===s.id?' active':''}" data-set="${s.id}" title="${s.name}${s.nativeClassId===pick.classId ? ' (native -- bonus card!)' : ''}" style="--set-color:${s.color}">${s.icon}${s.nativeClassId===pick.classId ? '⭐' : ''}</button>`).join('')}
        </div>
        <div class="micro-label">Loadout</div>
        <div class="stat-steppers">
          ${CATS.map(c => `
            <div class="stat-stepper">
              <span class="stat-stepper-label">${c.label}</span>
              <button type="button" class="stepper-btn" data-cat="${c.key}" data-delta="-1">−</button>
              <span class="stat-stepper-value" style="color:${c.color}">${pick.counts[c.key]}</span>
              <button type="button" class="stepper-btn" data-cat="${c.key}" data-delta="1">+</button>
            </div>
          `).join('')}
        </div>
        <div class="loadout-total${total===LOADOUT_SIZE?' ok':''}">
          <div class="loadout-bar"><div class="loadout-bar-fill${total===LOADOUT_SIZE?' ok':''}" style="width:${Math.min(100,total/LOADOUT_SIZE*100)}%"></div></div>
          <span>${total} / ${LOADOUT_SIZE} cards</span>
        </div>
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
  for (let i = squad.length; i < SQUAD_SIZE; i++){
    const ghost = document.createElement('div');
    ghost.className = 'squad-slot squad-slot-empty';
    ghost.innerHTML = `<span class="squad-slot-empty-num">${i+1}</span><span>Pick an Axie below</span>`;
    squadListEl.appendChild(ghost);
  }
}

export function renderSquadHeader(squad, maxCount){
  const tankCount = squad.filter(p => p.isTank).length;
  const full = squad.length === maxCount;
  const loadoutsOk = squad.every(p => p.counts.attack + p.counts.defense + p.counts.heal === LOADOUT_SIZE);
  const valid = full && tankCount === 1 && loadoutsOk;
  deckCountEl.textContent = `${squad.length} / ${maxCount} Axies · ${tankCount} Tank${tankCount===1?'':'s'}`;
  deckCountEl.className = 'deck-count' + (valid ? ' ready' : '');
  startDuelBtn.disabled = !valid;
  startDuelBtn.classList.toggle('ready', valid);
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
const STATUS_COMPANION_KEYS = new Set(['dodgeChance', 'thornsPct', 'bleedTicks']);

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
    <div class="cast-bar"><div class="cast-bar-fill"></div><span class="cast-bar-label"></span></div>
  `;
  boardOverlay.appendChild(wrap);
  return {
    wrap,
    chip: wrap.querySelector('.unit-chip'),
    nameEl: wrap.querySelector('.lane-name'),
    hpFill: wrap.querySelector('.hp-bar-fill'),
    mpEl: wrap.querySelector('.mp-label'),
    statusEl: wrap.querySelector('.status-icons'),
    castBar: wrap.querySelector('.cast-bar'),
    castFill: wrap.querySelector('.cast-bar-fill'),
    castLabel: wrap.querySelector('.cast-bar-label'),
  };
}

// A small bar over each Axie that's mid-cast (both sides), filling up to
// the moment the card lands -- so you can see the rival's card coming.
export function setCastBars(bars){
  ['you', 'rival'].forEach(side => {
    (unitRefs[side] || []).forEach((ref, i) => {
      if (!ref) return;
      const bar = bars.find(b => b.side === side && b.laneIndex === i);
      ref.castBar.classList.toggle('active', !!bar);
      if (!bar) return;
      ref.castFill.style.width = `${Math.round(bar.frac * 100)}%`;
      if (ref.castLabel.textContent !== bar.label) ref.castLabel.textContent = bar.label;
    });
  });
}

// The hand's cast lock: while it runs every card is greyed out and a
// countdown + draining bar sit over the hand.
const castLockEl = document.getElementById('castLock');
const castLockFill = document.getElementById('castLockFill');
const castLockText = document.getElementById('castLockText');
export function renderCastLock(remaining, total){
  const on = remaining > 0;
  castLockEl.classList.toggle('active', on);
  handEl.classList.toggle('locked', on);
  if (!on) return;
  castLockFill.style.width = `${(remaining / total) * 100}%`;
  castLockText.textContent = `⏳ Next card in ${remaining.toFixed(1)}s`;
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
  // The 3D models walk in from further back at match start (see
  // board3d.js's introWalk) -- fade the name/HP tags in only once they've
  // (roughly) arrived, instead of having them sit at the final formation
  // spot while the visible model is still approaching from behind.
  boardOverlay.classList.remove('overlay-intro');
  void boardOverlay.offsetWidth;
  boardOverlay.classList.add('overlay-intro');
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
  ref.nameEl.innerHTML = `${lane.name}${lane.evolved ? '<span class="role-badge evolved">+</span>' : ''}${lane.isTank ? '<span class="role-badge tank">🛡️</span>' : ''}`;
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

// A brief 3D burst (ring + sparks) at a lane's current position -- real
// visual impact on attacks/heals, alongside the DOM flash/floating text.
export function spawnImpact(side, laneIndex, kind){
  spawnImpact3D(side, laneIndex, kind);
}

// A persistent highlight for "this is the currently selected target" (the
// tap-target-first flow: pick an Axie on the board, then pick a card to
// use on it). Independent of setSelectable/clearSelectable's one-shot
// targeting modes, which are only used for the move-swap flow now.
export function markSelectedTarget(side, laneIndex, on){
  const ref = unitRefs[side] && unitRefs[side][laneIndex];
  if (ref) ref.chip.classList.toggle('selected-target', on);
}

// While a card is held: glow every lane on `side` whose index is in
// `indices` (the ones the card would reach), clear the glow everywhere else.
export function markInRange(side, indices){
  ['you', 'rival'].forEach(sd => {
    (unitRefs[sd] || []).forEach((ref, i) => {
      if (ref) ref.chip.classList.toggle('in-range', sd === side && indices.includes(i));
    });
  });
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
export function renderHand(state, { onPress, onRelease, onCancel, aimingUid }){
  const seen = new Set();
  state.hand.forEach((card, i) => {
    seen.add(card.uid);
    const casterLane = state.youLanes[card.laneIndex];
    const laneAlive = casterLane && casterLane.alive;
    const affordable = state.energyYou >= card.cost;
    const playable = affordable && !state.gameOver && laneAlive && state.castYou <= 0;
    const rangeLabel = card.range==='short' ? 'Short' : card.range==='long' ? 'Long'
      : card.role==='heal' ? 'Heal' : 'Defense';

    let div = handNodes.get(card.uid);
    if (!div){
      div = document.createElement('div');
      handNodes.set(card.uid, div);
    }
    div.className = 'card' + (!playable ? ' disabled' : '') + (card.uid === aimingUid ? ' aiming' : '');
    div.style.borderColor = card.color + '55';
    div.innerHTML = `
      <div class="card-top">
        <div class="card-name">${card.name}</div>
        <div class="card-cost">${card.cost}</div>
      </div>
      <div class="card-class" style="color:${card.color}">${card.setIcon ? card.setIcon+' ' : ''}${card.setName || card.cls} · ${rangeLabel}</div>
      <div class="card-desc">${card.desc}${!laneAlive ? ' <b>(lane destroyed)</b>' : ''}</div>
    `;
    // Hold to aim (shows the card's reach on the board), release to fire.
    // Pointer capture keeps the release on this card even if the finger
    // drifts off it.
    div.onpointerdown = playable ? (e) => {
      e.preventDefault();
      div.setPointerCapture(e.pointerId);
      onPress(card);
    } : null;
    div.onpointerup = () => onRelease(card);
    div.onpointercancel = () => onCancel(card);
    if (handEl.children[i] !== div) handEl.insertBefore(div, handEl.children[i] || null);
  });
  for (const [uid, div] of handNodes){
    if (!seen.has(uid)){
      div.remove();
      handNodes.delete(uid);
    }
  }
}

// Countdown to the Blizzard, then the time left before the 3:20 limit.
const matchClockEl = document.getElementById('matchClock');
const fmtClock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export function renderMatchClock(elapsed, blizzardAt, limit){
  const storm = elapsed >= blizzardAt;
  matchClockEl.classList.toggle('storm', storm);
  matchClockEl.textContent = storm
    ? `⏱ ${fmtClock(Math.max(0, limit - elapsed))} left`
    : `❄️ in ${fmtClock(Math.max(0, blizzardAt - elapsed))}`;
  matchClockEl.title = storm ? 'Blizzard! The match ends at 3:20.' : 'Time until the Blizzard';
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
