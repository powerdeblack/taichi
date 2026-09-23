// Entry point: DOM wiring for the team builder and the real-time board duel.
import './style.css';
import { AXIES, CARD_SETS } from './cards.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as render from './render.js';
import { aiMaybeAct } from './ai.js';
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

let squad = []; // [{ classId, setId, isTank, counts:{attack,defense,heal} }] -- up to SQUAD_SIZE
let state = null;
let lastYouSquad = [];
let lastRivalSquad = [];
let pendingAttack = null; // the attack card currently awaiting a manual target, if any
let moveMode = false;
let moveSource = null; // laneIndex of the Axie picked up, mid move-selection
let matchFinished = false;

// ================= Team builder =================
function renderTeamScreen(){
  ui.renderRoster(AXIES, squad, addToSquad);
  ui.renderSquad(squad, AXIES, CARD_SETS, { onAdjust: adjustCount, onToggleTank: toggleTank, onToggleEvolve: toggleEvolve, onSetChange: changeSet, onRemove: removeFromSquad });
  ui.renderSquadHeader(squad, game.SQUAD_SIZE);
}
// Defaults a freshly-added Axie to its species' native card set (see
// cards.js CARD_SETS) -- the player can still change it via the set picker.
function nativeSetFor(classId){
  const set = CARD_SETS.find(s => s.nativeClassId === classId);
  return set ? set.id : CARD_SETS[0].id;
}
function addToSquad(classId){
  if (squad.length >= game.SQUAD_SIZE) return;
  squad.push({
    classId,
    setId: nativeSetFor(classId),
    isTank: !squad.some(p => p.isTank),
    evolved: false,
    counts: { attack: game.LOADOUT_SIZE, defense: 0, heal: 0 },
  });
  renderTeamScreen();
  previewClass(classId);
}
function changeSet(idx, setId){
  squad[idx].setId = setId;
  renderTeamScreen();
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
  matchFinished = false;
  selectedLaneIndex = null;
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

// Which of the player's own lanes the joystick currently drives -- any
// lane can roam freely now, not just the Tank (see game.js
// moveLaneFreely). Falls back to the Tank, then to any alive lane, if the
// previously-selected one died or nothing's selected yet.
let selectedLaneIndex = null;
function ensureValidSelectedLane(){
  if (selectedLaneIndex != null && state.youLanes[selectedLaneIndex] && state.youLanes[selectedLaneIndex].alive) return;
  const tankIdx = state.youLanes.findIndex(l => l.isTank && l.alive);
  selectedLaneIndex = tankIdx !== -1 ? tankIdx : state.youLanes.findIndex(l => l.alive);
}
function selectJoystickUnit(i){
  if (!state.youLanes[i] || !state.youLanes[i].alive) return;
  if (joyHolding) endJoystickDrag();
  cancelMoveMode();
  pendingAttack = null;
  ui.clearSelectable();
  selectedLaneIndex = i;
  updateJoystick();
}

function updateJoystick(){
  ensureValidSelectedLane();
  const lane = state.youLanes[selectedLaneIndex];
  const canMove = !state.gameOver && lane && lane.alive;
  joystickWrap.classList.toggle('disabled', !canMove);
  ui.renderUnitPicker(state, selectedLaneIndex, selectJoystickUnit);
}

function updateMoveBtn(){
  const canMove = !state.gameOver && state.moveCooldown <= 0;
  moveBtn.disabled = !canMove;
  moveBtn.classList.toggle('active', moveMode);
  moveBtn.textContent = state.moveCooldown > 0
    ? `🔀 Move (${Math.ceil(state.moveCooldown)}s)`
    : '🔀 Move an Axie';
}

function applyResultFx(result){
  if (!result) return;
  const { side, card, casterIndex } = result;

  if (card.role === 'defense' || card.role === 'heal'){
    if (result.targetIndex === -1){
      const el = ui.getLaneSideEl(side, casterIndex);
      render.spawnFloatingText(el, 'No target!', 'text-dmg');
      return;
    }
    const el = ui.getLaneSideEl(result.targetSide, result.targetIndex);
    if (card.role === 'defense'){
      if (result.reversed){
        render.flashHit(el);
        render.spawnFloatingText(el, 'VULNERABLE!', 'text-block');
      } else {
        render.flashHeal(el);
        const labels = {
          bulwark_cleanse: 'CLEANSE + BULWARK!', bulwark: 'BULWARK!',
          barrier: 'BARRIER!', dodge: 'EVASION!', thorns: 'THORNS!',
        };
        render.spawnFloatingText(el, labels[card.effect] || 'GUARD!', 'text-shield');
      }
      return;
    }
    // heal role
    if (result.reversed){
      render.flashHit(el);
      render.shakeBoard(boardEl);
      render.spawnFloatingText(el, (card.effect === 'regen' ? 'ROT! -' : 'REVERSE HEAL! -')+result.dmg, 'text-dmg');
    } else {
      render.flashHeal(el);
      render.spawnFloatingText(el, card.effect === 'regen' ? 'REGEN!' : '+'+result.healed, 'text-heal');
    }
    return;
  }

  if (result.targetIndex === -1){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.spawnFloatingText(el, 'No target!', 'text-dmg');
    return;
  }
  const el = ui.getLaneSideEl(result.targetSide, result.targetIndex);
  if (result.dodged){
    render.spawnFloatingText(el, 'DODGED!', 'text-block');
  } else {
    render.flashHit(el);
    render.shakeBoard(boardEl);
    render.spawnFloatingText(el, '-'+result.dmg, 'text-dmg');
    if (result.ambush) render.spawnFloatingText(el, 'AMBUSH! x2', 'text-ambush');
    if (result.shielded) render.spawnFloatingText(el, 'BLOCKED!', 'text-block');
    if (result.bulwarked) render.spawnFloatingText(el, 'BULWARK!', 'text-block');
    if (result.deathmarked) render.spawnFloatingText(el, '+10 MARK', 'text-mark');
    if (result.comboBonus) render.spawnFloatingText(el, 'COMBO! -'+result.comboBonus, 'text-combo');
  }
  if (result.thornReflected > 0){
    const casterEl = ui.getLaneSideEl(result.side, result.casterIndex);
    render.flashHit(casterEl);
    render.spawnFloatingText(casterEl, '-'+result.thornReflected+' 🌵', 'text-dmg');
  }
}

function applyBleedFx(side, statusResults){
  if (!statusResults) return;
  const lanesArr = side === 'you' ? state.youLanes : state.rivalLanes;
  statusResults.forEach(({ lane, dmg, kind }) => {
    const laneIndex = lanesArr.indexOf(lane);
    const el = ui.getLaneSideEl(side, laneIndex);
    if (kind === 'regen'){
      render.flashHeal(el);
      render.spawnFloatingText(el, '+'+dmg+' 🌿', 'text-heal');
      return;
    }
    render.flashHit(el);
    const icon = kind === 'poison' ? '☠️' : (kind === 'regenRot' ? '🥀' : '🩸');
    render.spawnFloatingText(el, '-'+dmg+' '+icon, 'text-bleed');
  });
}

function setHintForResult(side, result){
  const who = side === 'you' ? 'You' : 'The rival';
  if (!result) return; // no card affordable right now -- not worth a hint, it happens constantly
  if (result.card.role === 'defense' || result.card.role === 'heal'){
    if (result.targetIndex === -1){ ui.setHint(`${who}: no target available!`); return; }
    const onSelf = result.targetSide === side;
    const targetWho = onSelf ? 'its own ally' : 'the enemy';
    ui.setHint(result.reversed
      ? `${who} reversed ${result.card.name} on ${targetWho}!`
      : `${who} used ${result.card.name} on ${targetWho}!`);
    return;
  }
  if (result.targetIndex === -1){ ui.setHint(`${who}: no target available!`); return; }
  ui.setHint(`${who}: ${result.card.name} dealt ${result.dmg} damage!`);
}

function finishMatch(){
  if (matchFinished) return;
  matchFinished = true;
  if (state.winner === 'draw') ui.showBanner('Draw!', 'Both Tanks fell together.');
  else if (state.winner === 'you') ui.showBanner('You won the duel!', 'The rival Tank was defeated.');
  else ui.showBanner('You lost the duel.', 'Your Tank was defeated.');
}

function onPlayerCardClick(card){
  cancelMoveMode();
  pendingAttack = null;
  ui.clearSelectable();

  if (card.role === 'attack'){
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
        playCard(card, targetIndex, 'rival');
      },
    })));
    return;
  }

  // Defense/heal: aim at an ally for the normal effect, or at an enemy to
  // reverse it (Guard/Bulwark -> Vulnerable, Heal/Regen -> damage/DOT).
  const targets = game.getSupportTargets(state, 'you');
  if (!targets.length){
    ui.setHint('No target available!');
    return;
  }
  ui.setHint(`${card.name}: choose an ally to help, or an enemy to reverse it on.`);
  ui.setSelectable(targets.map(({ side, laneIndex, reversed }) => ({
    side, laneIndex, cssClass: reversed ? 'targetable-reverse' : 'targetable-ally',
    onClick: () => {
      ui.clearSelectable();
      playCard(card, laneIndex, side);
    },
  })));
}

function playCard(card, targetIndex, targetSide){
  const result = game.playerPlayCard(state, card, targetIndex, targetSide);
  applyResultFx(result);
  syncUI();
  setHintForResult('you', result);
}

// ================= Discrete move (cooldown-gated swap) =================
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
    ui.animateMove('you', src, state.youLanes[src].localPos);
    ui.animateMove('you', destIndex, state.youLanes[destIndex].localPos);
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

// ================= Unit joystick (continuous free-roam, no cooldown) =================
// Holding the stick nudges whichever lane is currently selected (see
// selectJoystickUnit/renderUnitPicker -- any lane can roam now, not just
// the Tank) around the formation's local space every frame (see the game
// loop below) -- releasing just stops it where it is. "Up" on the stick =
// toward the enemy (the rival row renders above yours), since that's also
// the direction that brings a unit closer to the enemy Tank's taunt radius.
const JOY_MAX_PX = 24;
const UNIT_MOVE_SPEED = 1.8; // local units/sec at full stick deflection
let joyHolding = false;
let joyDirX = 0, joyDirZ = 0;
let joyStartX = 0, joyStartY = 0;

joystickBase.addEventListener('pointerdown', (e) => {
  if (joystickWrap.classList.contains('disabled')) return;
  cancelMoveMode();
  joyHolding = true;
  joyStartX = e.clientX;
  joyStartY = e.clientY;
  joyDirX = 0; joyDirZ = 0;
  joystickBase.setPointerCapture(e.pointerId);
});
joystickBase.addEventListener('pointermove', (e) => {
  if (!joyHolding) return;
  const dx = e.clientX - joyStartX, dy = e.clientY - joyStartY;
  const dist = Math.min(Math.hypot(dx, dy), JOY_MAX_PX);
  const angle = Math.atan2(dy, dx);
  joystickKnob.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px)`;
  const mag = dist / JOY_MAX_PX;
  joyDirX = Math.cos(angle) * mag;
  joyDirZ = -Math.sin(angle) * mag; // screen-up (negative dy) -> local +z (forward, toward the enemy)
});
function endJoystickDrag(){
  if (!joyHolding) return;
  joyHolding = false;
  joyDirX = 0; joyDirZ = 0;
  joystickKnob.style.transform = '';
  if (state.youLanes[selectedLaneIndex]) ui.endLiveLanePosition('you', selectedLaneIndex);
}
joystickBase.addEventListener('pointerup', endJoystickDrag);
joystickBase.addEventListener('pointercancel', endJoystickDrag);

// ================= Real-time game loop =================
// No turns: both sides regenerate energy and can play cards continuously;
// the rival AI just acts on its own timer. One requestAnimationFrame loop
// drives everything -- per-frame board/position updates are cheap (just
// updating existing DOM refs), so only the heavier full re-renders (hand,
// pips, piles) are throttled to a fixed interval.
const UI_REFRESH_INTERVAL = 0.15;
const AI_THINK_BASE = 1.5;
const AI_THINK_JITTER = 1.0;
let uiRefreshTimer = 0;
let aiThinkTimer = AI_THINK_BASE;
let lastFrameMs = null;

function gameLoop(nowMs){
  requestAnimationFrame(gameLoop);
  if (!state || matchFinished){ lastFrameMs = nowMs; return; }
  if (lastFrameMs == null) lastFrameMs = nowMs;
  const dt = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  if (state.gameOver){ finishMatch(); return; }

  game.tickEnergyRealtime(state, dt);
  game.tickMoveCooldown(state, dt);
  const statusResults = game.tickStatusTimer(state, dt);
  if (statusResults){
    applyBleedFx('you', statusResults.you);
    applyBleedFx('rival', statusResults.rival);
  }
  game.cullDeadHand(state);

  if (joyHolding){
    const lane = state.youLanes[selectedLaneIndex];
    if (lane && lane.alive){
      game.moveLaneFreely(state, 'you', selectedLaneIndex, joyDirX * UNIT_MOVE_SPEED * dt, joyDirZ * UNIT_MOVE_SPEED * dt);
      ui.setLiveLanePosition('you', selectedLaneIndex, lane.localPos);
    }
  }

  aiThinkTimer -= dt;
  if (aiThinkTimer <= 0){
    aiThinkTimer = AI_THINK_BASE + Math.random() * AI_THINK_JITTER;
    const result = aiMaybeAct(state);
    if (result){
      applyResultFx(result);
      if (!pendingAttack && !moveMode) setHintForResult('rival', result);
    }
  }

  ui.updateBoard(state);

  uiRefreshTimer += dt;
  if (uiRefreshTimer >= UI_REFRESH_INTERVAL){
    uiRefreshTimer = 0;
    ui.renderPips(state);
    ui.renderPiles(state);
    ui.renderHand(state, { onPlay: onPlayerCardClick });
    updateMoveBtn();
    updateJoystick();
  }

  if (state.gameOver) finishMatch();
}
requestAnimationFrame(gameLoop);
