// Entry point: DOM wiring for the team builder and the real-time board duel.
import './style.css';
import { AXIES, CARD_SETS, setById } from './cards.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as render from './render.js';
import { aiMaybeAct } from './ai.js';
import { initPreview, showAxie } from './axie3d.js';
import * as sfx from './sfx.js';

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
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpCloseBtn = document.getElementById('helpCloseBtn');

let squad = []; // [{ classId, setId, isTank, counts:{attack,defense,heal} }] -- up to SQUAD_SIZE
let state = null;
let lastYouSquad = [];
let lastRivalSquad = [];
let selectedTarget = null; // { side, laneIndex } -- tap-target-first flow, see onUnitClick
let moveMode = false;
let moveSource = null; // laneIndex of the Axie picked up, mid move-selection
let matchFinished = false;
const koPlayed = new WeakSet();

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
  const setId = nativeSetFor(classId);
  const set = setById(setId);
  squad.push({
    classId,
    setId,
    isTank: !squad.some(p => p.isTank),
    evolved: false,
    counts: { ...set.defaultCounts },
  });
  renderTeamScreen();
  previewClass(classId);
}
function changeSet(idx, setId){
  const set = setById(setId);
  squad[idx].setId = setId;
  squad[idx].counts = { ...set.defaultCounts };
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

// ================= Help modal =================
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));

// Browsers only start audio after a user gesture; resume on every gesture in
// case the tab was backgrounded and the context got suspended.
document.addEventListener('pointerdown', sfx.unlockAudio, { passive: true });
document.addEventListener('keydown', sfx.unlockAudio);
const muteBtn = document.getElementById('muteBtn');
function renderMuteBtn(){
  muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', sfx.isMuted() ? 'Unmute sound' : 'Mute sound');
}
muteBtn.addEventListener('click', () => { sfx.toggleMute(); renderMuteBtn(); });
renderMuteBtn();

function playKOIfDied(side, laneIndex){
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const lane = lanes[laneIndex];
  if (lane && !lane.alive && !koPlayed.has(lane)){
    koPlayed.add(lane);
    sfx.playKO();
  }
}
helpCloseBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });

// ================= Match lifecycle =================
function beginMatch(youSquad, rivalSquad){
  lastYouSquad = youSquad;
  lastRivalSquad = rivalSquad;
  state = game.freshState(youSquad, rivalSquad);
  selectedTarget = null;
  moveMode = false;
  moveSource = null;
  matchFinished = false;
  aiMoveTimer = 1 + Math.random() * 1.5;
  aiWandering = false;
  ui.hideBanner();
  ui.buildBoard(state, onUnitClick);
  syncUI();
  ui.setHint('Tap an Axie (yours or the rival’s), then tap a card to use on it.');
}

function syncUI(){
  dropDeadTarget();
  ui.updateBoard(state);
  ui.renderPips(state);
  ui.renderPiles(state);
  ui.renderHand(state, { onPlay: onPlayerCardClick });
  updateMoveBtn();
  updateJoystick();
}

function updateJoystick(){
  const tankIdx = state.youLanes.findIndex(l => l.isTank);
  const canMove = !state.gameOver && tankIdx !== -1 && state.youLanes[tankIdx].alive;
  joystickWrap.classList.toggle('disabled', !canMove);
}

function updateMoveBtn(){
  const canMove = !state.gameOver && state.moveCooldown <= 0;
  moveBtn.disabled = !canMove;
  moveBtn.classList.toggle('active', moveMode);
  moveBtn.textContent = state.moveCooldown > 0
    ? `🔀 ${Math.ceil(state.moveCooldown)}s`
    : '🔀 Move';
}

function applyResultFx(result){
  if (!result) return;
  const { side, card, casterIndex } = result;

  if (card.role === 'defense' || card.role === 'heal'){
    if (result.targetIndex === -1){
      const el = ui.getLaneSideEl(side, casterIndex);
      render.spawnFloatingText(el, 'No target!', 'text-dmg');
      if (side === 'you') sfx.playNoTarget();
      return;
    }
    const el = ui.getLaneSideEl(result.targetSide, result.targetIndex);
    if (card.role === 'defense'){
      if (result.reversed){
        render.flashHit(el);
        render.spawnFloatingText(el, 'VULNERABLE!', 'text-block');
        sfx.playDebuff();
      } else {
        render.flashHeal(el);
        const labels = {
          bulwark_cleanse: 'CLEANSE + BULWARK!', bulwark: 'BULWARK!',
          barrier: 'BARRIER!', dodge: 'EVASION!', thorns: 'THORNS!',
        };
        render.spawnFloatingText(el, labels[card.effect] || 'GUARD!', 'text-shield');
        ui.spawnImpact(result.targetSide, result.targetIndex, 'shield');
        sfx.playShield();
      }
      return;
    }
    // heal role
    if (result.reversed){
      render.flashHit(el);
      render.shakeBoard(boardEl);
      render.spawnFloatingText(el, (card.effect === 'regen' ? 'ROT! -' : 'REVERSE HEAL! -')+result.dmg, 'text-dmg');
      ui.spawnImpact(result.targetSide, result.targetIndex, 'hit');
      sfx.playAttack(card, result.dmg);
      playKOIfDied(result.targetSide, result.targetIndex);
    } else {
      render.flashHeal(el);
      render.spawnFloatingText(el, card.effect === 'regen' ? 'REGEN!' : '+'+result.healed, 'text-heal');
      ui.spawnImpact(result.targetSide, result.targetIndex, 'heal');
      sfx.playHeal();
    }
    return;
  }

  if (result.targetIndex === -1){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.spawnFloatingText(el, 'No target!', 'text-dmg');
    if (side === 'you') sfx.playNoTarget();
    return;
  }
  const el = ui.getLaneSideEl(result.targetSide, result.targetIndex);
  if (result.dodged){
    render.spawnFloatingText(el, 'DODGED!', 'text-block');
    sfx.playDodge();
  } else {
    sfx.playAttack(card, result.dmg);
    playKOIfDied(result.targetSide, result.targetIndex);
    render.flashHit(el);
    render.shakeBoard(boardEl);
    render.spawnFloatingText(el, '-'+result.dmg, 'text-dmg');
    ui.spawnImpact(result.targetSide, result.targetIndex, 'hit');
    if (card.effect === 'bleed') ui.spawnImpact(result.targetSide, result.targetIndex, 'bleed');
    if (card.effect === 'poison') ui.spawnImpact(result.targetSide, result.targetIndex, 'poison');
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
    ui.spawnImpact(result.side, result.casterIndex, 'hit');
    sfx.playBleed(0.15);
    playKOIfDied(result.side, result.casterIndex);
  }
}

function applyBleedFx(side, statusResults){
  if (!statusResults) return;
  const lanesArr = side === 'you' ? state.youLanes : state.rivalLanes;
  const kinds = new Set(statusResults.map(r => r.kind));
  if (kinds.has('regen')) sfx.playRegenTick();
  if (kinds.has('poison')) sfx.playPoison();
  if (kinds.has('bleed') || kinds.has('regenRot')) sfx.playBleed();
  statusResults.forEach(({ lane, dmg, kind }) => {
    const laneIndex = lanesArr.indexOf(lane);
    const el = ui.getLaneSideEl(side, laneIndex);
    if (kind === 'regen'){
      render.flashHeal(el);
      render.spawnFloatingText(el, '+'+dmg+' 🌿', 'text-heal');
      ui.spawnImpact(side, laneIndex, 'heal');
      return;
    }
    render.flashHit(el);
    const icon = kind === 'poison' ? '☠️' : (kind === 'regenRot' ? '🥀' : '🩸');
    render.spawnFloatingText(el, '-'+dmg+' '+icon, 'text-bleed');
    ui.spawnImpact(side, laneIndex, kind === 'poison' ? 'poison' : 'bleed');
    playKOIfDied(side, laneIndex);
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
  // Let the final KO boom land before the fanfare.
  setTimeout(state.winner === 'you' ? sfx.playVictory : sfx.playDefeat, 450);
}

// Tap-target-first flow: tapping any alive Axie (yours or the rival's)
// selects it -- independent of which card, if any, you're about to play.
// The selection is sticky: it survives playing cards and only changes when
// another Axie is tapped (or clears itself when the target dies), so you
// can chain several cards on one target. Wired once per unit chip in ui.buildBoard (always live,
// not a one-shot setSelectable mode), so it no-ops during move-mode
// (which has its own tap-tap flow via setSelectable) instead of fighting it.
function onUnitClick(side, laneIndex){
  if (moveMode) return;
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const lane = lanes[laneIndex];
  if (!lane || !lane.alive) return;
  if (selectedTarget && selectedTarget.side === side && selectedTarget.laneIndex === laneIndex) return;
  clearTargetSelection();
  selectedTarget = { side, laneIndex };
  ui.markSelectedTarget(side, laneIndex, true);
  sfx.playSelect();
  const who = side === 'you' ? `your ${lane.name}` : `the rival's ${lane.name}`;
  ui.setHint(`🎯 ${who} selected — now tap a card to use on it.`);
}

function clearTargetSelection(){
  if (selectedTarget) ui.markSelectedTarget(selectedTarget.side, selectedTarget.laneIndex, false);
  selectedTarget = null;
}

function dropDeadTarget(){
  if (!selectedTarget) return;
  const lanes = selectedTarget.side === 'you' ? state.youLanes : state.rivalLanes;
  if (!lanes[selectedTarget.laneIndex]?.alive) clearTargetSelection();
}

function onPlayerCardClick(card){
  if (moveMode) return;
  if (!selectedTarget){
    ui.setHint('Tap an Axie (yours or the rival’s) first, then tap a card.');
    return;
  }
  const { side: tSide, laneIndex: tIndex } = selectedTarget;
  const tLanes = tSide === 'you' ? state.youLanes : state.rivalLanes;
  if (!tLanes[tIndex] || !tLanes[tIndex].alive){
    clearTargetSelection();
    ui.setHint('That target is no longer available -- pick a new one.');
    return;
  }

  if (card.role === 'attack'){
    if (tSide !== 'rival'){
      ui.setHint(`${card.name} is an attack card -- select an enemy Axie first.`);
      return;
    }
    const legal = game.getLegalTargets(state, 'you', card, card.laneIndex);
    if (!legal.length){
      ui.setHint('No target available!');
      return;
    }
    if (!legal.includes(tIndex)){
      const taunted = legal.length === 1 && state.rivalLanes[legal[0]].isTank;
      ui.setHint(taunted
        ? `🎯 Taunted! You're too close to the enemy Tank — ${card.name} must hit it instead.`
        : `${card.name} can't reach that target -- try a closer target or a long-range card.`);
      return;
    }
    playCard(card, tIndex, 'rival');
    return;
  }

  // Defense/heal: any alive lane on either side is a legal target -- an
  // ally gets the card's normal effect, an enemy gets it reversed
  // (Guard/Bulwark -> Vulnerable, Heal/Regen -> damage/DOT).
  playCard(card, tIndex, tSide);
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
  if (selectedTarget) ui.markSelectedTarget(selectedTarget.side, selectedTarget.laneIndex, false);
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
  restoreTargetMark();
  updateMoveBtn();
  updateJoystick();
  ui.setHint(moved ? 'Axie moved! Choose a card to play.' : 'Choose a card to play.');
}

function restoreTargetMark(){
  dropDeadTarget();
  if (selectedTarget) ui.markSelectedTarget(selectedTarget.side, selectedTarget.laneIndex, true);
}

function cancelMoveMode(){
  if (!moveMode) return;
  if (moveSource !== null) ui.markMoveSource('you', moveSource, false);
  ui.clearSelectable();
  moveMode = false;
  moveSource = null;
  restoreTargetMark();
  updateMoveBtn();
}

// ================= Tank joystick (continuous free-roam, no cooldown) =================
// Holding the stick nudges the Tank around the formation's local space
// every frame (see the game loop below); the other 4 lanes escort it,
// keeping their formation offset relative to the Tank's live position (see
// game.js moveSquadWithTank) -- the whole squad advances/retreats
// together. Releasing just stops everyone where they are. "Up" on the
// stick = toward the enemy (the rival row renders above yours), since
// that's also the direction that brings the squad closer to the enemy
// Tank's taunt radius.
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
  state.youLanes.forEach((lane, i) => { if (lane.alive) ui.endLiveLanePosition('you', i); });
}
joystickBase.addEventListener('pointerup', endJoystickDrag);
joystickBase.addEventListener('pointercancel', endJoystickDrag);

// ================= Rival wander (autonomous Tank+escort movement) =================
// The rival's Tank -- and its escort, same as the player's -- roams the
// hall on its own timer instead of standing still: drives the exact same
// game.moveSquadWithTank the player's joystick uses, just picking a
// random direction/hold period instead of reading a pointer.
const AI_MOVE_SPEED = 1.3; // a bit slower than the player's own joystick
let aiMoveTimer = 1 + Math.random() * 1.5;
let aiMoveDirX = 0, aiMoveDirZ = 0;
let aiWandering = false;

function pickAiWanderMove(){
  const wasWandering = aiWandering;
  aiWandering = Math.random() < 0.65; // mostly on the move, sometimes holds still
  if (aiWandering){
    const angle = Math.random() * Math.PI * 2;
    aiMoveDirX = Math.cos(angle);
    aiMoveDirZ = Math.sin(angle);
    aiMoveTimer = 1.2 + Math.random() * 1.6;
  } else {
    aiMoveTimer = 0.6 + Math.random() * 1.0;
    if (wasWandering) state.rivalLanes.forEach((lane, i) => { if (lane.alive) ui.endLiveLanePosition('rival', i); });
  }
}

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
    const tankIdx = state.youLanes.findIndex(l => l.isTank);
    if (tankIdx !== -1 && state.youLanes[tankIdx].alive){
      game.moveSquadWithTank(state, 'you', joyDirX * UNIT_MOVE_SPEED * dt, joyDirZ * UNIT_MOVE_SPEED * dt);
      state.youLanes.forEach((lane, i) => { if (lane.alive) ui.setLiveLanePosition('you', i, lane.localPos); });
    }
  }

  aiMoveTimer -= dt;
  if (aiMoveTimer <= 0) pickAiWanderMove();
  if (aiWandering){
    const rivalTankIdx = state.rivalLanes.findIndex(l => l.isTank);
    if (rivalTankIdx !== -1 && state.rivalLanes[rivalTankIdx].alive){
      game.moveSquadWithTank(state, 'rival', aiMoveDirX * AI_MOVE_SPEED * dt, aiMoveDirZ * AI_MOVE_SPEED * dt);
      state.rivalLanes.forEach((lane, i) => { if (lane.alive) ui.setLiveLanePosition('rival', i, lane.localPos); });
    }
  }

  aiThinkTimer -= dt;
  if (aiThinkTimer <= 0){
    aiThinkTimer = AI_THINK_BASE + Math.random() * AI_THINK_JITTER;
    const result = aiMaybeAct(state);
    if (result){
      applyResultFx(result);
      if (!selectedTarget && !moveMode) setHintForResult('rival', result);
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
