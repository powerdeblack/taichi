// Entry point: DOM wiring for the team builder and the real-time board duel.
import './style.css';
import { AXIES, CARD_SETS, setById, ARCHETYPES, copyArchetypePicks } from './cards.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as render from './render.js';
import { aiBeginCard, aiMoveIntent } from './ai.js';
import { initPreview, showAxie } from './axie3d.js';
import * as sfx from './sfx.js';
import { createTutorial, tutorialDone, tutorialDismissed, dismissTutorialInvite } from './tutorial.js';

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
let blizzardAnnounced = false;
const koPlayed = new WeakSet();

// ================= Team builder =================
// Which archetype the current squad came from -- cleared by any manual
// edit, since the squad is then the player's own.
let loadedArchetype = null;
function useArchetype(arch){
  squad = copyArchetypePicks(arch);
  loadedArchetype = arch.id;
  renderTeamScreen();
  previewClass(squad.find(p => p.isTank).classId);
}

function renderTeamScreen(){
  if (loadedArchetype){
    const arch = ARCHETYPES.find(a => a.id === loadedArchetype);
    if (JSON.stringify(arch.picks) !== JSON.stringify(squad)) loadedArchetype = null;
  }
  ui.renderArchetypes(ARCHETYPES, AXIES, CARD_SETS, useArchetype, loadedArchetype);
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

// The duel takes over the whole screen (no page title, no scrolling);
// the team builder is a normal scrolling page.
function showDuelScreen(){
  deckScreen.classList.add('hidden');
  duelScreen.classList.remove('hidden');
  document.body.classList.add('in-duel');
  window.scrollTo(0, 0);
  // On phones/tablets, starting a duel (a tap = a user gesture, which the
  // Fullscreen API requires) also hides the browser bars and prefers
  // landscape. Desktop keeps its window; the ⛶ button toggles either way.
  if (window.matchMedia('(pointer: coarse)').matches) enterFullscreen();
}

// ================= Full screen =================
const fullscreenBtn = document.getElementById('fullscreenBtn');
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function isFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function enterFullscreen(){
  if (!canFullscreen || isFullscreen()) return;
  const el = document.documentElement;
  const req = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
  Promise.resolve(req)
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => { /* refused or unsupported: stay as is */ });
}
function exitFullscreen(){
  if (!isFullscreen()) return;
  (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
}
function renderFullscreenBtn(){
  fullscreenBtn.classList.toggle('hidden', !canFullscreen);
  fullscreenBtn.textContent = isFullscreen() ? '🡼' : '⛶';
  fullscreenBtn.setAttribute('aria-label', isFullscreen() ? 'Exit full screen' : 'Full screen');
}
fullscreenBtn.addEventListener('click', () => (isFullscreen() ? exitFullscreen() : enterFullscreen()));
document.addEventListener('fullscreenchange', renderFullscreenBtn);
document.addEventListener('webkitfullscreenchange', renderFullscreenBtn);
renderFullscreenBtn();
function showTeamScreen(){
  duelScreen.classList.add('hidden');
  deckScreen.classList.remove('hidden');
  document.body.classList.remove('in-duel');
}

startDuelBtn.addEventListener('click', () => {
  showDuelScreen();
  // The rival fields one of the archetypes too (a different one when
  // possible), so every duel is a clash of two real synergies.
  const pool = ARCHETYPES.filter(a => a.id !== loadedArchetype);
  const rivalArch = pool[Math.floor(Math.random() * pool.length)];
  beginMatch(squad.slice(), copyArchetypePicks(rivalArch));
});
switchDeckBtn.addEventListener('click', () => {
  endTutorial();
  showTeamScreen();
});

// ================= Tutorial =================
// A guided duel: the player gets Steel Rain (long range, so the first
// cards reach from the start) against Deathmark Hunt, and the coach
// bubble (tutorial.js) gates each step on the player actually doing it.
let tutorial = null;
const tutorialBtn = document.getElementById('tutorialBtn');
const tutorialSmallBtn = document.getElementById('tutorialSmallBtn');
const tutorialCta = document.getElementById('tutorialCta');
const tutorialCtaText = document.getElementById('tutorialCtaText');
// The invite is shown until the player finishes the tutorial or taps
// "Not now"; after that only the small header button offers it.
function renderTutorialCta(){
  const done = tutorialDone();
  const hideInvite = done || tutorialDismissed();
  tutorialCta.classList.toggle('hidden', hideInvite);
  tutorialSmallBtn.classList.toggle('hidden', !hideInvite);
  tutorialCtaText.textContent = 'New here? Learn by playing a short guided duel — optional.';
}
document.getElementById('tutorialDismiss').addEventListener('click', () => {
  dismissTutorialInvite();
  renderTutorialCta();
});
renderTutorialCta();
function endTutorial(){
  if (tutorial) tutorial.end();
  tutorial = null;
  renderTutorialCta();
}
function startTutorial(){
  showDuelScreen();
  const you = copyArchetypePicks(ARCHETYPES.find(a => a.id === 'damage'));
  const rival = copyArchetypePicks(ARCHETYPES.find(a => a.id === 'deathmark'));
  beginMatch(you, rival);
  tutorial = createTutorial(() => state);
}
tutorialBtn.addEventListener('click', startTutorial);
tutorialSmallBtn.addEventListener('click', startTutorial);
resetBtn.addEventListener('click', () => { endTutorial(); beginMatch(lastYouSquad, lastRivalSquad); });

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
  aiThinkTimer = 2.5; // let both squads finish walking in first
  blizzardAnnounced = false;
  ui.setBlizzard(false);
  clearCasts();
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
  ui.renderMatchClock(state.elapsed, game.BLIZZARD_AT, game.MATCH_LIMIT);
  syncHand();
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

  if (result.fizzled) return;

  if (result.missed){
    const el = result.targetIndex >= 0
      ? ui.getLaneSideEl(result.targetSide, result.targetIndex)
      : ui.getLaneSideEl(side, casterIndex);
    render.spawnFloatingText(el, 'MISS! Out of range', 'text-block');
    sfx.playDodge();
    return;
  }

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
      render.spawnFloatingText(el, card.effect === 'regen' ? 'REGEN!' : (result.healed > 0 ? '+'+result.healed : 'FULL HP'), 'text-heal');
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
    const icon = { poison: '☠️', regenRot: '🥀', blizzard: '❄️' }[kind] || '🩸';
    render.spawnFloatingText(el, '-'+dmg+' '+icon, kind === 'blizzard' ? 'text-shield' : 'text-bleed');
    ui.spawnImpact(side, laneIndex, { poison: 'poison', blizzard: 'frost' }[kind] || 'bleed');
    playKOIfDied(side, laneIndex);
  });
}

function setHintForResult(side, result){
  const who = side === 'you' ? 'You' : 'The rival';
  if (!result) return; // no card affordable right now -- not worth a hint, it happens constantly
  if (result.fizzled){ ui.setHint(`${who}: ${result.card.name} fizzled — its caster fell.`); return; }
  if (result.missed){ ui.setHint(`${result.card.name} missed — the target was out of range.`); return; }
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
  clearCasts();
  endTutorial();
  if (state.timeUp){
    if (state.winner === 'draw') ui.showBanner('Time up — draw!', 'Both Tanks ended with the same HP share.');
    else if (state.winner === 'you') ui.showBanner('Time up — you win!', 'Your Tank had more HP left at 3:20.');
    else ui.showBanner('Time up — you lost.', 'The rival Tank had more HP left at 3:20.');
  } else if (state.winner === 'draw') ui.showBanner('Draw!', 'Both Tanks fell together.');
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
  if (tutorial && side === 'rival') tutorial.notify('selected');
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

// ================= Hold a card to aim, release to fire =================
// Pressing a card shows its reach on the board around the Axie that owns
// it (ring + a line to whoever it would hit): green = the aimed enemy is
// inside the reach, red = outside. Releasing fires the card no matter what
// -- an attack released while its target is out of range misses and the
// card is spent. Aim for an attack: the selected enemy if there is one,
// otherwise the nearest enemy (a taunted caster always aims at the enemy
// Tank). Aim for a defense/heal card: the selected Axie on either side,
// otherwise the card's own Axie.
let aiming = null; // the card currently held

function aimFor(card){
  const caster = card.laneIndex;
  if (card.role === 'attack'){
    const taunt = game.tauntedBy(state, 'you', caster);
    const legal = game.getLegalTargets(state, 'you', card, caster);
    const selected = selectedTarget && selectedTarget.side === 'rival' ? selectedTarget.laneIndex : -1;
    // Selected enemy if this card reaches it; otherwise whoever it does
    // reach (nearest first) -- a far-away sticky selection shouldn't make
    // every attack miss while another enemy stands right next to you.
    // Only when nobody is in reach does it aim (and miss) at the selected
    // or nearest enemy.
    let targetIndex;
    if (taunt !== -1) targetIndex = taunt;
    else if (selected >= 0 && legal.includes(selected)) targetIndex = selected;
    else if (legal.length) targetIndex = legal.reduce((best, i) =>
      game.distanceBetween(state, 'you', caster, 'rival', i) < game.distanceBetween(state, 'you', caster, 'rival', best) ? i : best, legal[0]);
    else targetIndex = selected >= 0 ? selected : game.nearestEnemy(state, 'you', caster);
    return { targetSide: 'rival', targetIndex, legal, taunted: taunt !== -1,
      inRange: targetIndex >= 0 && legal.includes(targetIndex) };
  }
  if (selectedTarget) return { targetSide: selectedTarget.side, targetIndex: selectedTarget.laneIndex, legal: [selectedTarget.laneIndex], inRange: true };
  return { targetSide: 'you', targetIndex: caster, legal: [caster], inRange: true };
}

function onCardPress(card){
  if (moveMode || state.gameOver) return;
  aiming = card;
  sfx.playSelect();
  if (tutorial) tutorial.notify('aiming');
  updateAim();
  syncHand();
}

function updateAim(){
  if (!aiming) return;
  const card = aiming;
  const casterLane = state.youLanes[card.laneIndex];
  if (!casterLane || !casterLane.alive || !state.hand.includes(card)){ cancelAim(); return; }
  const a = aimFor(card);
  const targetLanes = a.targetSide === 'you' ? state.youLanes : state.rivalLanes;
  const target = targetLanes[a.targetIndex];
  const isAttack = card.role === 'attack';
  ui.showAim({
    side: 'you', casterXZ: casterLane.localPos,
    radius: isAttack ? game.cardRange(card) : null,
    state: isAttack ? (a.inRange ? 'ok' : 'out') : 'support',
    targetSide: a.targetSide, targetXZ: target ? target.localPos : null,
  });
  ui.markInRange(a.targetSide, isAttack ? a.legal : []);
  if (!isAttack){
    const onSelf = a.targetSide === 'you';
    ui.setHint(`${card.name} → ${onSelf ? 'your' : "the rival's"} ${target.name}${onSelf ? '' : ' (reversed!)'} — release to use.`);
  } else if (a.taunted){
    ui.setHint(`🛡️ Taunted! ${card.name} can only hit the enemy Tank — release to strike.`);
  } else if (a.inRange){
    ui.setHint(`✅ ${target.name} is in range — release to strike!`);
  } else {
    ui.setHint(`❌ ${target ? target.name : 'Target'} is out of range — releasing now MISSES. Move closer!`);
  }
}

function hideAimVisuals(){
  ui.hideAim();
  ui.markInRange('rival', []);
}

function cancelAim(){
  aiming = null;
  hideAimVisuals();
  syncHand();
}

function onCardRelease(card){
  if (aiming !== card) return;
  const a = aimFor(card);
  aiming = null;
  hideAimVisuals();
  const plan = state.gameOver ? null : game.playerBeginCard(state, card, a.targetIndex, a.targetSide);
  if (plan) startCast(plan);
  syncUI();
}

function onCardCancel(card){
  if (aiming === card) cancelAim();
}

function syncHand(){
  ui.renderHand(state, { onPress: onCardPress, onRelease: onCardRelease, onCancel: onCardCancel, aimingUid: aiming && aiming.uid });
}

// ================= Cast timeline =================
// A released card (or the rival's pick) charges on its Axie until
// CAST_LAUNCH_AT, flies to the target, and only lands -- rules applied,
// hit/heal effects, sound -- at CAST_IMPACT_AT; that side can't start
// another card until CAST_TIME. Self-targeted cards just charge longer.
let pendingCasts = [];
let castSeq = 0;

function castColor(card){
  const set = setById(card.setId);
  return set ? set.color : card.color;
}

function startCast(plan){
  const id = ++castSeq;
  const selfCast = plan.targetSide === plan.side && plan.targetIndex === plan.casterIndex;
  const travels = !selfCast && plan.targetIndex >= 0;
  ui.startCastFX(id, plan.side, plan.casterIndex, castColor(plan.card), travels ? game.CAST_LAUNCH_AT : game.CAST_IMPACT_AT);
  sfx.playCastStart(plan.card);
  pendingCasts.push({ id, plan, age: 0, travels, launched: false });
  if (plan.side === 'you') ui.setHint(`⏳ Casting ${plan.card.name}…`);
  else if (!aiming) ui.setHint(`⚠️ The rival is casting ${plan.card.name}!`);
}

function tickPendingCasts(dt){
  pendingCasts = pendingCasts.filter(c => {
    c.age += dt;
    if (c.travels && !c.launched && c.age >= game.CAST_LAUNCH_AT){
      c.launched = true;
      ui.launchCastFX(c.id, c.plan.targetSide, c.plan.targetIndex, game.CAST_IMPACT_AT - game.CAST_LAUNCH_AT, c.plan.missed);
      sfx.playLaunch(c.plan.card);
    }
    if (c.age < game.CAST_IMPACT_AT) return true;
    ui.landCastFX(c.id);
    const result = game.landCast(state, c.plan);
    applyResultFx(result);
    if (tutorial && c.plan.side === 'you') tutorial.notify('landed');
    if (!aiming && (c.plan.side === 'you' || !moveMode)) setHintForResult(c.plan.side, result);
    syncUI();
    return false;
  });
  ui.setCastBars(pendingCasts.map(c => ({
    side: c.plan.side, laneIndex: c.plan.casterIndex,
    frac: Math.min(1, c.age / game.CAST_IMPACT_AT),
    label: `${c.plan.card.setIcon || ''} ${c.plan.card.name}`,
  })));
}

function clearCasts(){
  pendingCasts = [];
  ui.clearCastsFX();
  ui.setCastBars([]);
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

// Follows the squad AI's movement intent (melee squads close in, ranged
// squads hold at long range and back off -- see ai.js aiMoveIntent),
// re-deciding every half second or so, with an occasional sidestep so it
// doesn't move like a rail.
function pickAiWanderMove(){
  const wasWandering = aiWandering;
  const intent = aiMoveIntent(state, 'rival');
  aiMoveTimer = 0.4 + Math.random() * 0.6;
  if (intent && Math.random() < 0.85){
    const jitter = (Math.random() - 0.5) * 0.5;
    const angle = Math.atan2(intent.z, intent.x) + jitter;
    aiMoveDirX = Math.cos(angle);
    aiMoveDirZ = Math.sin(angle);
    aiWandering = true;
  } else if (Math.random() < 0.3){
    const angle = Math.random() * Math.PI * 2;
    aiMoveDirX = Math.cos(angle);
    aiMoveDirZ = Math.sin(angle);
    aiWandering = true;
  } else {
    aiWandering = false;
  }
  if (wasWandering && !aiWandering) state.rivalLanes.forEach((lane, i) => { if (lane.alive) ui.endLiveLanePosition('rival', i); });
}

// ================= Real-time game loop =================
// No turns: both sides regenerate energy and can play cards continuously;
// the rival AI just acts on its own timer. One requestAnimationFrame loop
// drives everything -- per-frame board/position updates are cheap (just
// updating existing DOM refs), so only the heavier full re-renders (hand,
// pips, piles) are throttled to a fixed interval.
const UI_REFRESH_INTERVAL = 0.15;
const AI_THINK_BASE = 0.6;
const AI_THINK_JITTER = 1.2;
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
  game.tickCasts(state, dt);
  if (!blizzardAnnounced && game.isBlizzard(state)){
    blizzardAnnounced = true;
    ui.setBlizzard(true);
    sfx.playBlizzard();
    ui.setHint('❄️ BLIZZARD! The storm hurts every Axie each tick and heals are halved — finish it!');
  }
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
      if (tutorial) tutorial.notify('moved', Math.hypot(joyDirX, joyDirZ) * UNIT_MOVE_SPEED * dt);
      state.youLanes.forEach((lane, i) => { if (lane.alive) ui.setLiveLanePosition('you', i, lane.localPos); });
    }
  }

  const rivalOn = !tutorial || tutorial.rivalActive();
  if (tutorial) tutorial.tick();
  aiMoveTimer -= dt;
  if (rivalOn && aiMoveTimer <= 0) pickAiWanderMove();
  if (!rivalOn) aiWandering = false;
  if (aiWandering){
    const rivalTankIdx = state.rivalLanes.findIndex(l => l.isTank);
    if (rivalTankIdx !== -1 && state.rivalLanes[rivalTankIdx].alive){
      game.moveSquadWithTank(state, 'rival', aiMoveDirX * AI_MOVE_SPEED * dt, aiMoveDirZ * AI_MOVE_SPEED * dt);
      state.rivalLanes.forEach((lane, i) => { if (lane.alive) ui.setLiveLanePosition('rival', i, lane.localPos); });
    }
  }

  // The rival waits out its own cast lock, then pauses a beat before the
  // next card so it doesn't fire the instant the lock clears.
  if (rivalOn && state.castRival <= 0){
    aiThinkTimer -= dt;
    if (aiThinkTimer <= 0){
      aiThinkTimer = AI_THINK_BASE + Math.random() * AI_THINK_JITTER;
      const plan = aiBeginCard(state);
      if (plan) startCast(plan);
    }
  }
  tickPendingCasts(dt);
  ui.renderCastLock(state.castYou, game.CAST_TIME);

  ui.updateBoard(state);
  updateAim();
  ['you', 'rival'].forEach(side => {
    const tank = (side === 'you' ? state.youLanes : state.rivalLanes).find(l => l.isTank);
    ui.setTauntRing(side, tank.localPos, tank.alive);
  });

  uiRefreshTimer += dt;
  if (uiRefreshTimer >= UI_REFRESH_INTERVAL){
    uiRefreshTimer = 0;
    ui.renderPips(state);
    ui.renderPiles(state);
    ui.renderMatchClock(state.elapsed, game.BLIZZARD_AT, game.MATCH_LIMIT);
    syncHand();
    updateMoveBtn();
    updateJoystick();
  }

  if (state.gameOver) finishMatch();
}
requestAnimationFrame(gameLoop);
