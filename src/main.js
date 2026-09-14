// Entry point: DOM wiring for the team builder and the lane board duel.
import './style.css';
import { AXIES } from './cards.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as render from './render.js';
import { aiTakeTurn } from './ai.js';
import { initPreview, showAxie } from './axie3d.js';

const deckScreen = document.getElementById('deckScreen');
const duelScreen = document.getElementById('duelScreen');
const startDuelBtn = document.getElementById('startDuelBtn');
const switchDeckBtn = document.getElementById('switchDeckBtn');
const resetBtn = document.getElementById('resetBtn');
const boardEl = document.getElementById('board');
const moveBtn = document.getElementById('moveBtn');
const joystickWrap = document.getElementById('joystickWrap');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

let squad = []; // [{ classId, isTank, counts:{attack,defense,heal} }] -- up to SQUAD_SIZE
let state = null;
let lastYouSquad = [];
let lastRivalSquad = [];
let pendingAttack = null; // the attack card currently awaiting a manual target, if any
let moveMode = false;
let moveSource = null; // laneIndex of the Axie picked up, mid move-selection

// ================= Team builder =================
function renderTeamScreen(){
  ui.renderRoster(AXIES, squad, addToSquad);
  ui.renderSquad(squad, AXIES, { onAdjust: adjustCount, onToggleTank: toggleTank, onToggleEvolve: toggleEvolve, onRemove: removeFromSquad });
  ui.renderSquadHeader(squad, game.SQUAD_SIZE);
}
function addToSquad(classId){
  if (squad.length >= game.SQUAD_SIZE) return;
  squad.push({
    classId,
    isTank: !squad.some(p => p.isTank),
    evolved: false,
    counts: { attack: game.LOADOUT_SIZE, defense: 0, heal: 0 },
  });
  renderTeamScreen();
  previewClass(classId);
}
function adjustCount(idx, cat, delta){
  const counts = squad[idx].counts;
  const total = counts.attack + counts.defense + counts.heal;
  const next = counts[cat] + delta;
  if (next < 0) return;
  if (delta > 0 && total >= game.LOADOUT_SIZE) return;
  counts[cat] = next;
  renderTeamScreen();
}
function toggleTank(idx){
  squad.forEach((p, i) => { p.isTank = (i === idx); });
  renderTeamScreen();
}
function toggleEvolve(idx){
  squad[idx].evolved = !squad[idx].evolved;
  renderTeamScreen();
}
function removeFromSquad(idx){
  const wasTank = squad[idx].isTank;
  squad.splice(idx, 1);
  if (wasTank && squad.length) squad[0].isTank = true;
  renderTeamScreen();
}
renderTeamScreen();

// ================= 3D preview (team picker only) =================
const preview3dCanvas = document.getElementById('preview3dCanvas');
const preview3dLabel = document.getElementById('preview3dLabel');
let preview3dReady = null;
function previewClass(classId){
  preview3dLabel.textContent = `Loading ${classId} in 3D...`;
  if (!preview3dReady) preview3dReady = initPreview(preview3dCanvas);
  preview3dReady
    .then(() => showAxie(classId))
    .then(() => { preview3dLabel.textContent = classId; })
    .catch((err) => {
      console.error('3D preview failed:', err);
      preview3dLabel.textContent = '3D preview unavailable';
    });
}

startDuelBtn.addEventListener('click', () => {
  deckScreen.classList.add('hidden');
  duelScreen.classList.remove('hidden');
  beginMatch(squad.slice(), game.randomSquad());
});
switchDeckBtn.addEventListener('click', () => {
  duelScreen.classList.add('hidden');
  deckScreen.classList.remove('hidden');
});
resetBtn.addEventListener('click', () => beginMatch(lastYouSquad, lastRivalSquad));

// ================= Match lifecycle =================
function beginMatch(youSquad, rivalSquad){
  lastYouSquad = youSquad;
  lastRivalSquad = rivalSquad;
  state = game.freshState(youSquad, rivalSquad);
  pendingAttack = null;
  moveMode = false;
  moveSource = null;
  ui.hideBanner();
  ui.buildBoard(state);
  syncUI();
  ui.setHint('Choose a card to play.');
}

function syncUI(){
  ui.updateBoard(state);
  ui.renderPips(state);
  ui.renderPiles(state);
  ui.renderHand(state, { onPlay: onPlayerCardClick });
  updateMoveBtn();
  updateJoystick();
}

function updateJoystick(){
  const tankIdx = state.youLanes.findIndex(l => l.isTank);
  const canMove = state.turn === 'you' && !state.gameOver && !state.movedThisTurn
    && tankIdx !== -1 && state.youLanes[tankIdx].alive;
  joystickWrap.classList.toggle('disabled', !canMove);
}

function updateMoveBtn(){
  const canMove = state.turn === 'you' && !state.gameOver && !state.movedThisTurn;
  moveBtn.disabled = !canMove;
  moveBtn.classList.toggle('active', moveMode);
  moveBtn.textContent = state.movedThisTurn ? '🔀 Already moved this turn' : '🔀 Move an Axie (1 / turn)';
}

function applyResultFx(result){
  if (!result) return;
  const { side, card, casterIndex, targetIndex } = result;
  const enemySide = side === 'you' ? 'rival' : 'you';

  if (card.role === 'defense'){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.flashHeal(el);
    render.spawnFloatingText(el, 'SHIELD!', 'text-shield');
    return;
  }
  if (card.role === 'heal'){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.flashHeal(el);
    render.spawnFloatingText(el, '+'+result.healed, 'text-heal');
    return;
  }
  if (targetIndex === -1){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.spawnFloatingText(el, 'No target!', 'text-dmg');
    return;
  }
  const el = ui.getLaneSideEl(enemySide, targetIndex);
  render.flashHit(el);
  render.shakeBoard(boardEl);
  render.spawnFloatingText(el, '-'+result.dmg, 'text-dmg');
  if (result.ambush) render.spawnFloatingText(el, 'AMBUSH! x2', 'text-ambush');
  if (result.shielded) render.spawnFloatingText(el, 'BLOCKED!', 'text-block');
  if (result.deathmarked) render.spawnFloatingText(el, '+10 MARK', 'text-mark');
  if (result.comboBonus) render.spawnFloatingText(el, 'COMBO! -'+result.comboBonus, 'text-combo');
}

function applyBleedFx(side, statusResults){
  const lanesArr = side === 'you' ? state.youLanes : state.rivalLanes;
  statusResults.forEach(({ lane, dmg, kind }) => {
    const laneIndex = lanesArr.indexOf(lane);
    const el = ui.getLaneSideEl(side, laneIndex);
    render.flashHit(el);
    const icon = kind === 'poison' ? '☠️' : '🩸';
    render.spawnFloatingText(el, '-'+dmg+' '+icon, 'text-bleed');
  });
}

function setHintForResult(side, result){
  const who = side === 'you' ? 'You' : 'The rival';
  if (!result){ ui.setHint(`${who} had no playable card and passed the turn.`); return; }
  if (result.card.role === 'defense'){ ui.setHint(`${who} activated ${result.card.name}!`); return; }
  if (result.card.role === 'heal'){ ui.setHint(`${who} healed with ${result.card.name}!`); return; }
  if (result.targetIndex === -1){ ui.setHint('No target available!'); return; }
  ui.setHint(`${result.card.name} dealt ${result.dmg} damage!`);
}

function finishMatch(){
  if (state.winner === 'draw') ui.showBanner('Draw!', 'Both Tanks fell together.');
  else if (state.winner === 'you') ui.showBanner('You won the duel!', 'The rival Tank was defeated.');
  else ui.showBanner('You lost the duel.', 'Your Tank was defeated.');
}

function onPlayerCardClick(card){
  cancelMoveMode();
  pendingAttack = null;
  ui.clearSelectable();
  if (card.role !== 'attack'){
    playCardAndAdvance(card, -1);
    return;
  }

  const legal = game.getLegalTargets(state, 'you', card, card.laneIndex);
  if (!legal.length){
    ui.setHint('No target available!');
    return;
  }
  pendingAttack = card;
  const taunted = legal.length === 1 && state.rivalLanes[legal[0]].isTank;
  ui.setHint(taunted
    ? `🎯 Taunted! You're too close to the enemy Tank — ${card.name} must hit it.`
    : `${card.name}: choose which enemy to hit.`);
  ui.setSelectable(legal.map(targetIndex => ({
    side: 'rival', laneIndex: targetIndex, cssClass: 'targetable',
    onClick: () => {
      pendingAttack = null;
      ui.clearSelectable();
      playCardAndAdvance(card, targetIndex);
    },
  })));
}

function playCardAndAdvance(card, targetIndex){
  const result = game.playerPlayCard(state, card, targetIndex);
  applyResultFx(result);
  syncUI();
  setHintForResult('you', result);
  if (state.gameOver){ finishMatch(); return; }
  setTimeout(() => {
    state.turn = 'rival';
    ui.setHint('The rival is thinking...');
    runAiTurn();
  }, 500);
}

// ================= Movement (once per your turn) =================
moveBtn.addEventListener('click', () => {
  if (moveBtn.disabled) return;
  if (moveMode) cancelMoveMode();
  else startMoveMode();
});

function startMoveMode(){
  pendingAttack = null;
  ui.clearSelectable();
  moveMode = true;
  moveSource = null;
  updateMoveBtn();
  ui.setHint('Move: tap one of your own Axies to pick it up.');
  offerMoveSourceSelection();
}

function offerMoveSourceSelection(){
  const entries = state.youLanes
    .map((lane, i) => ({ lane, i }))
    .filter(({ lane }) => lane.alive)
    .map(({ i }) => ({
      side: 'you', laneIndex: i, cssClass: 'selectable-move',
      onClick: () => pickMoveSource(i),
    }));
  ui.setSelectable(entries);
}

function pickMoveSource(laneIndex){
  moveSource = laneIndex;
  ui.clearSelectable();
  ui.markMoveSource('you', laneIndex, true);
  ui.setHint('Move: now tap where it should swap to.');
  const entries = state.youLanes
    .map((lane, i) => ({ lane, i }))
    .filter(({ i }) => i !== moveSource)
    .map(({ i }) => ({
      side: 'you', laneIndex: i, cssClass: 'selectable-move',
      onClick: () => performMove(i),
    }));
  ui.setSelectable(entries);
}

function performMove(destIndex){
  const src = moveSource;
  ui.clearSelectable();
  ui.markMoveSource('you', src, false);
  const moved = game.moveLane(state, 'you', src, destIndex);
  if (moved){
    ui.animateMove('you', src, state.youLanes[src].col);
    ui.animateMove('you', destIndex, state.youLanes[destIndex].col);
  }
  moveMode = false;
  moveSource = null;
  updateMoveBtn();
  updateJoystick();
  ui.setHint(moved ? 'Axie moved! Choose a card to play.' : 'Choose a card to play.');
}

function cancelMoveMode(){
  if (!moveMode) return;
  if (moveSource !== null) ui.markMoveSource('you', moveSource, false);
  ui.clearSelectable();
  moveMode = false;
  moveSource = null;
  updateMoveBtn();
}

// ================= Tank joystick (dedicated control, same 1/turn limit) =================
// Push a direction to swap the Tank into that formation slot (col 1-4):
// up-left/up-right are the front line (closer to the enemy and to the
// Tank's own taunt radius), down-left/down-right are the back line.
// "Up" on screen = toward the enemy, since the rival row renders above
// yours.
const JOY_MAX_PX = 24;
const JOY_DEAD_ZONE_PX = 12;
let joyDragging = false;
let joyStartX = 0, joyStartY = 0;

function quadrantFromDelta(dx, dy){
  if (dy < 0) return dx < 0 ? 1 : 2; // front-left / front-right
  return dx < 0 ? 3 : 4; // back-left / back-right
}

function moveTankToSlot(targetCol){
  if (joystickWrap.classList.contains('disabled')) return;
  cancelMoveMode();
  const tankIdx = state.youLanes.findIndex(l => l.isTank);
  if (tankIdx === -1 || state.youLanes[tankIdx].col === targetCol) return;
  const destIdx = state.youLanes.findIndex(l => l.col === targetCol);
  if (destIdx === -1) return;
  const moved = game.moveLane(state, 'you', tankIdx, destIdx);
  if (!moved) return;
  ui.animateMove('you', tankIdx, state.youLanes[tankIdx].col);
  ui.animateMove('you', destIdx, state.youLanes[destIdx].col);
  updateMoveBtn();
  updateJoystick();
  ui.setHint('Tank moved! Choose a card to play.');
}

joystickBase.addEventListener('pointerdown', (e) => {
  if (joystickWrap.classList.contains('disabled')) return;
  joyDragging = true;
  joyStartX = e.clientX;
  joyStartY = e.clientY;
  joystickBase.setPointerCapture(e.pointerId);
});
joystickBase.addEventListener('pointermove', (e) => {
  if (!joyDragging) return;
  const dx = e.clientX - joyStartX, dy = e.clientY - joyStartY;
  const dist = Math.min(Math.hypot(dx, dy), JOY_MAX_PX);
  const angle = Math.atan2(dy, dx);
  joystickKnob.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px)`;
});
function endJoystickDrag(e){
  if (!joyDragging) return;
  joyDragging = false;
  joystickKnob.style.transform = '';
  const dx = e.clientX - joyStartX, dy = e.clientY - joyStartY;
  if (Math.hypot(dx, dy) >= JOY_DEAD_ZONE_PX) moveTankToSlot(quadrantFromDelta(dx, dy));
}
joystickBase.addEventListener('pointerup', endJoystickDrag);
joystickBase.addEventListener('pointercancel', endJoystickDrag);

function runAiTurn(){
  aiTakeTurn(state, {
    onResolved: ({ bleedResults, result }) => {
      applyBleedFx('rival', bleedResults);
      applyResultFx(result);
      syncUI();
      setHintForResult('rival', result);
      if (state.gameOver){ finishMatch(); return; }
      setTimeout(() => {
        const bleedYou = game.startYourTurn(state);
        applyBleedFx('you', bleedYou);
        syncUI();
        if (state.gameOver){ finishMatch(); return; }
        ui.setHint('Choose a card to play.');
      }, 700);
    },
  });
}
