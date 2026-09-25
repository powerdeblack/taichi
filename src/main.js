// Entry point: DOM wiring for the team builder and the real-time board duel.
import './style.css';
import { AXIES, CARD_SETS, setById, ARCHETYPES, copyArchetypePicks, buildLoadout } from './cards.js';
import { initStage, showTeam, setStageActive, portraitFor } from './teamStage.js';
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
  previewPick(squad.find(p => p.isTank));
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
  previewPick(squad[squad.length - 1]);
}
function changeSet(idx, setId){
  const set = setById(setId);
  squad[idx].setId = setId;
  squad[idx].counts = { ...set.defaultCounts };
  renderTeamScreen();
  previewPick(squad[idx]);
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
  previewPick(squad[idx]);
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
// Shows one squad pick in 3D: its class colour, its card set's weapon and,
// when Evolved, the Mystic look.
function previewPick(pick){
  const { classId, setId, evolved } = pick;
  const set = setById(setId);
  const label = `${classId}${set ? ' · ' + set.icon + ' ' + set.name : ''}${evolved ? ' · ✨ Mystic' : ''}`;
  preview3dLabel.textContent = `Loading ${classId} in 3D...`;
  if (!preview3dReady) preview3dReady = initPreview(preview3dCanvas);
  preview3dReady
    .then(() => showAxie(classId, { setId, evolved }))
    .then(() => { preview3dLabel.textContent = label; })
    .catch((err) => {
      console.error('3D preview failed:', err);
      preview3dLabel.textContent = '3D preview unavailable';
    });
}

// The duel takes over the whole screen (no page title, no scrolling);
// the team builder is a normal scrolling page.
function showDuelScreen(){
  deckScreen.classList.add('hidden');
  document.getElementById('teamSelectScreen').classList.add('hidden');
  document.body.classList.remove('in-select');
  setStageActive(false);
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
// The squad builder ("Edit" / "New Team").
function showTeamScreen(){
  duelScreen.classList.add('hidden');
  teamSelectScreen.classList.add('hidden');
  deckScreen.classList.remove('hidden');
  document.body.classList.remove('in-duel', 'in-select');
  setStageActive(false);
  window.scrollTo(0, 0);
}

function startDuelWith(picks, archId){
  showDuelScreen();
  teamSelectScreen.classList.add('hidden');
  document.body.classList.remove('in-select');
  setStageActive(false);
  // The rival fields one of the archetypes too (a different one when
  // possible), so every duel is a clash of two real synergies.
  const pool = ARCHETYPES.filter(a => a.id !== archId);
  const rivalArch = pool[Math.floor(Math.random() * pool.length)];
  beginMatch(picks.map(p => ({ ...p, counts: { ...p.counts } })), copyArchetypePicks(rivalArch));
}

startDuelBtn.addEventListener('click', () => {
  if (loadedArchetype === null) saveCustomTeam(squad);
  startDuelWith(squad.slice(), loadedArchetype);
});
switchDeckBtn.addEventListener('click', () => {
  endTutorial();
  showSelectScreen();
});

// ================= Team select (arena lobby) =================
// The first screen: pick a team from wooden panels, see its three Axies on
// stone pedestals in 3D, then Battle, Edit it in the builder, or build a
// New Team. A team built or edited by hand is kept as "My Team" (saved in
// this browser) at the top of the list.
const teamSelectScreen = document.getElementById('teamSelectScreen');
const guideModal = document.getElementById('guideModal');
const CUSTOM_KEY = 'axieDuelCustomTeam';
let customTeam = loadCustomTeam();
let selectedTeamId = customTeam ? 'custom' : 'arch:' + ARCHETYPES[0].id;

function loadCustomTeam(){
  try {
    const picks = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    return Array.isArray(picks) && picks.length === game.SQUAD_SIZE && picks.some(p => p.isTank) ? picks : null;
  } catch { return null; }
}
function saveCustomTeam(picks){
  if (picks.length !== game.SQUAD_SIZE || !picks.some(p => p.isTank)) return;
  customTeam = picks.map(p => ({ ...p, counts: { ...p.counts } }));
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customTeam)); } catch { /* storage blocked: keep for this visit */ }
}

const colorOf = classId => AXIES.find(a => a.classId === classId)?.color;
function teamList(){
  const teams = ARCHETYPES.map(a => ({
    id: 'arch:' + a.id, archId: a.id, name: a.name, icon: a.icon, color: a.color, tags: a.tags, how: a.how,
    picks: a.picks.map(p => ({ ...p, color: colorOf(p.classId) })),
  }));
  if (customTeam) teams.unshift({
    id: 'custom', archId: null, name: 'My Team', icon: '✎', color: '#e8893a', custom: true,
    tags: customTeam.map(p => setById(p.setId)?.name).filter(Boolean),
    how: 'Your own squad, built in the team editor. Tap Edit to change it.',
    picks: customTeam.map(p => ({ ...p, color: colorOf(p.classId) })),
  });
  return teams;
}
const selectedTeam = () => teamList().find(t => t.id === selectedTeamId) || teamList()[0];

function showSelectScreen(){
  duelScreen.classList.add('hidden');
  deckScreen.classList.add('hidden');
  teamSelectScreen.classList.remove('hidden');
  document.body.classList.remove('in-duel');
  document.body.classList.add('in-select');
  window.scrollTo(0, 0);
  initStage(document.getElementById('stageCanvas')).catch(err => console.error('stage failed', err));
  setStageActive(true);
  selectTeam(selectedTeam().id, true);
}

function selectTeam(id, force){
  if (id === selectedTeamId && !force) return;
  selectedTeamId = id;
  const team = selectedTeam();
  selectedTeamId = team.id;
  ui.renderTeamList(teamList(), selectedTeamId, (tid) => { sfx.playSelect(); selectTeam(tid); });
  ui.renderTeamPlaque(team);
  ui.setStageLoading(true);
  showTeam(team.picks).then(() => {
    ui.setStageLoading(false);
    // Fill the list's faces with 3D portraits, one at a time in the background.
    ui.fillTeamFaces(portraitFor);
  });
}

document.getElementById('tsBattleBtn').addEventListener('click', () => {
  const team = selectedTeam();
  loadedArchetype = team.archId;
  squad = team.picks.map(({ color, ...p }) => ({ ...p, counts: { ...p.counts } }));
  startDuelWith(squad, team.archId);
});
document.getElementById('tsEditBtn').addEventListener('click', () => {
  const team = selectedTeam();
  if (team.archId) useArchetype(ARCHETYPES.find(a => a.id === team.archId));
  else { squad = team.picks.map(({ color, ...p }) => ({ ...p, counts: { ...p.counts } })); loadedArchetype = null; renderTeamScreen(); previewPick(squad.find(p => p.isTank) || squad[0]); }
  showTeamScreen();
});
document.getElementById('tsNewBtn').addEventListener('click', () => {
  squad = [];
  loadedArchetype = null;
  renderTeamScreen();
  showTeamScreen();
});
document.getElementById('builderBackBtn').addEventListener('click', () => {
  // A finished hand-built (or edited) squad becomes "My Team".
  if (loadedArchetype === null && squad.length === game.SQUAD_SIZE && squad.some(p => p.isTank)){
    saveCustomTeam(squad);
    selectedTeamId = 'custom';
  } else if (loadedArchetype){
    selectedTeamId = 'arch:' + loadedArchetype;
  }
  showSelectScreen();
});
document.getElementById('tsGuideBtn').addEventListener('click', () => {
  const team = selectedTeam();
  const members = team.picks.map(p => {
    const set = setById(p.setId);
    return {
      name: AXIES.find(a => a.classId === p.classId)?.name || p.classId, classId: p.classId, color: p.color,
      isTank: p.isTank, evolved: p.evolved, counts: p.counts,
      setIcon: set.icon, setName: set.name, setColor: set.color,
      cards: [...new Map(buildLoadout(p.setId, p.classId, p.counts).map(c => [c.id, c])).values()],
    };
  });
  ui.renderTeamGuide(team, members);
  guideModal.classList.remove('hidden');
});
document.getElementById('guideCloseBtn').addEventListener('click', () => guideModal.classList.add('hidden'));
guideModal.addEventListener('click', (e) => { if (e.target === guideModal) guideModal.classList.add('hidden'); });
document.getElementById('tsHelpBtn').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('tsTutorialBtn').addEventListener('click', () => { teamSelectScreen.classList.add('hidden'); document.body.classList.remove('in-select'); setStageActive(false); startTutorial(); });

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
    // A knockout gets the full treatment: slow motion, a white flash, a
    // big shockwave and the camera leaning in on the fallen Axie.
    cine.slowMo(0.3, lane.isTank ? 1.4 : 0.9);
    cine.flash(lane.isTank ? '#ffffff' : '#ffe9c4', lane.isTank ? 0.85 : 0.5);
    cine.shockwave(side, laneIndex, side === 'you' ? '#ff6b6b' : '#ffd23f', 2);
    cine.shake(0.3, 0.6);
    cine.zoomPunch(side, laneIndex, 4);
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
  cine.clearCinematics();
  cine.letterbox(false);
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

  if (result.fizzled){
    if (result.interrupted){
      render.spawnFloatingText(ui.getLaneSideEl(side, casterIndex), '😵 INTERRUPTED', 'text-mark');
      sfx.playDodge();
    }
    return;
  }

  if (result.missed){
    if (result.targetIndex >= 0) cine.afterimage(result.targetSide, result.targetIndex, '#ffffff');
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
        cine.vulnerable(result.targetSide, result.targetIndex);
        ui.hitSquash(result.targetSide, result.targetIndex, 0.6);
        render.flashHit(el);
        render.spawnFloatingText(el, 'VULNERABLE!', 'text-block');
        sfx.playDebuff();
      } else {
        render.flashHeal(el);
        const labels = {
          bulwark_cleanse: 'CLEANSE + BULWARK!', bulwark: 'BULWARK!',
          barrier: 'BARRIER!', dodge: 'EVASION!', thorns: 'THORNS!',
          secret: side === 'you' ? `❓ ${card.name} set` : '❓ SECRET SET',
        };
        render.spawnFloatingText(el, labels[card.effect] || 'GUARD!', 'text-shield');
        defenseCinematic(card, result.targetSide, result.targetIndex);
        ui.spawnImpact(result.targetSide, result.targetIndex, 'shield');
        sfx.playShield();
      }
      return;
    }
    // heal role
    if (result.reversed){
      cine.drainBeam(result.targetSide, result.targetIndex);
      ui.hitSquash(result.targetSide, result.targetIndex, 0.8);
      cine.shake(0.08, 0.25);
      render.flashHit(el);
      render.shakeBoard(boardEl);
      render.spawnFloatingText(el, (card.effect === 'regen' ? 'ROT! -' : 'REVERSE HEAL! -')+result.dmg, 'text-dmg');
      ui.spawnImpact(result.targetSide, result.targetIndex, 'hit');
      sfx.playAttack(card, result.dmg);
      playKOIfDied(result.targetSide, result.targetIndex);
    } else {
      if (card.effect === 'regen') cine.regenSpiral(result.targetSide, result.targetIndex);
      else cine.healBeam(result.targetSide, result.targetIndex);
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
  if (result.feared){
    render.spawnFloatingText(ui.getLaneSideEl(side, casterIndex), '😱 FEAR — missed!', 'text-mark');
    cine.afterimage(result.targetSide, result.targetIndex, '#b89cff');
    sfx.playDodge();
    return;
  }
  if (result.dodged){
    cine.afterimage(result.targetSide, result.targetIndex);
    render.spawnFloatingText(el, 'DODGED!', 'text-block');
    sfx.playDodge();
  } else {
    attackCinematic(result);
    // Heavy blows stagger the target (stun clip), the rest flinch.
    ui.playLaneAction(result.targetSide, result.targetIndex, result.dmg >= 30 || result.ambush ? 'stun' : 'hit');
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
    if (result.deathmarked) render.spawnFloatingText(el, '+'+game.DEATHMARK_BONUS+' MARK', 'text-mark');
    if (result.comboBonus) render.spawnFloatingText(el, 'COMBO! -'+result.comboBonus, 'text-combo');
    // Origin control landed on the target.
    const ctl = { stun: `😵 STUN ${card.duration || game.STUN_TIME}s`, chill: `🥶 CHILL ${card.duration || game.CHILL_TIME}s`, fear: '😱 FEAR' }[card.effect];
    if (ctl){
      render.spawnFloatingText(el, ctl, 'text-mark');
      if (card.effect === 'stun') ui.playLaneAction(result.targetSide, result.targetIndex, 'stun');
      if (card.effect === 'chill') ui.spawnImpact(result.targetSide, result.targetIndex, 'frost');
    }
  }
  if (result.secret) applySecretFx(result);
  if (result.thornReflected > 0){
    const casterEl = ui.getLaneSideEl(result.side, result.casterIndex);
    render.flashHit(casterEl);
    render.spawnFloatingText(casterEl, '-'+result.thornReflected+' 🌵', 'text-dmg');
    ui.spawnImpact(result.side, result.casterIndex, 'hit');
    cine.thornSpikes(result.side, result.casterIndex);
    ui.playLaneAction(result.side, result.casterIndex, 'hit');
    ui.hitSquash(result.side, result.casterIndex, 0.7);
    sfx.playBleed(0.15);
    playKOIfDied(result.side, result.casterIndex);
  }
}

// ================= Card cinematics =================
// Every card plays a short 3D scene that shows WHAT it does (cinematics.js):
// Rangers rain arrows, Warriors/Rogues slash, magic sets blast; bleed
// splashes blood, poison leaves a toxic cloud, Deathmark hangs a skull;
// each defense raises its own shield shape and heals pour light or leaves.
// Heavy hits add a shockwave, camera shake, a zoom punch and a hit-stop.
const cine = ui.cinematics;

function projectileStyle(card){
  if (card.role !== 'attack') return 'orb';
  if (card.setId === 'ranger') return 'arrow';
  if (card.setId === 'warrior' || card.setId === 'rogue') return 'blade';
  return 'orb';
}

function attackCinematic(result){
  const { card, targetSide: ts, targetIndex: ti } = result;
  const color = castColor(card);
  cine.strikeTrail(result.side, result.casterIndex, ts, ti, color);
  if (card.setId === 'ranger') cine.arrowRain(ts, ti, card.effect === 'multi' ? 5 : 2, color);
  else if (card.setId === 'warrior' || card.setId === 'rogue') cine.slash(ts, ti, color, !!result.ambush || result.dmg >= 18);
  else cine.arcaneBlast(ts, ti, color);
  if (card.effect === 'bleed') cine.bloodSplash(ts, ti);
  if (card.effect === 'poison') cine.poisonCloud(ts, ti);
  if (card.effect === 'deathmark') cine.deathmark(ts, ti);
  if (result.deathmarked) cine.flash('#9f7aea', 0.35);
  ui.hitSquash(ts, ti, Math.min(1.6, 0.6 + result.dmg / 20));
  if (result.dmg >= 18 || result.ambush || result.comboBonus || result.deathmarked){
    cine.shockwave(ts, ti, color, 1);
    cine.shake(0.2, 0.4);
    cine.zoomPunch(ts, ti, 2.5);
    cine.hitStop(0.12);
  } else {
    cine.shake(0.06, 0.2);
  }
}

function defenseCinematic(card, side, index){
  switch (card.effect){
    case 'bulwark': cine.bulwarkWall(side, index); break;
    case 'bulwark_cleanse': cine.cleansePillar(side, index); cine.bulwarkWall(side, index); break;
    case 'barrier': cine.bubble(side, index); break;
    case 'dodge': cine.afterimage(side, index); break;
    case 'thorns': cine.thornSpikes(side, index); break;
    case 'secret': cine.shockwave(side, index, '#b89cff', 0.5); break;
    default: cine.dome(side, index);
  }
}

// A Secret sprang: reveal it over its owner, then show what it did to the
// attacker (or the heal on its owner).
function applySecretFx(result){
  const sec = result.secret;
  const ownerEl = ui.getLaneSideEl(sec.side, sec.index);
  const casterEl = ui.getLaneSideEl(result.side, result.casterIndex);
  render.spawnFloatingText(ownerEl, `❗ SECRET: ${sec.name}`, 'text-ambush');
  cine.flash('#b89cff', 0.35);
  cine.shockwave(sec.side, sec.index, '#b89cff', 0.8);
  sfx.playShield();
  if (sec.attackerDmg){
    render.flashHit(casterEl);
    render.spawnFloatingText(casterEl, '-' + sec.attackerDmg, 'text-dmg');
    ui.spawnImpact(result.side, result.casterIndex, 'hit');
    ui.playLaneAction(result.side, result.casterIndex, 'hit');
    playKOIfDied(result.side, result.casterIndex);
  }
  if (sec.control === 'stun' || sec.trap === 'snare'){ render.spawnFloatingText(casterEl, '😵 STUN', 'text-mark'); ui.playLaneAction(result.side, result.casterIndex, 'stun'); }
  if (sec.control === 'chill') render.spawnFloatingText(casterEl, '🥶 CHILL', 'text-mark');
  if (sec.control === 'venom') render.spawnFloatingText(casterEl, '🩸☠️ BLEED + POISON', 'text-bleed');
  if (sec.trap === 'shadow') render.spawnFloatingText(casterEl, '😱 FEAR', 'text-mark');
  if (sec.healed){ render.flashHeal(ownerEl); render.spawnFloatingText(ownerEl, '+' + sec.healed, 'text-heal'); cine.healBeam(sec.side, sec.index); }
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
  if (result && result.dodged && !result.secret){ ui.setHint(`${side === 'you' ? 'You' : 'The rival'}: ${result.card.name} was dodged!`); return; }
  const who = side === 'you' ? 'You' : 'The rival';
  if (!result) return; // no card affordable right now -- not worth a hint, it happens constantly
  if (result.fizzled){ ui.setHint(result.interrupted ? `${who}: ${result.card.name} was INTERRUPTED — its caster is stunned.` : `${who}: ${result.card.name} fizzled — its caster fell.`); return; }
  if (result.feared){ ui.setHint(`${who}: ${result.card.name} missed — the caster was Feared.`); return; }
  if (result.secret){ ui.setHint(`❗ ${result.secret.side === 'you' ? 'Your' : "The rival's"} Secret ${result.secret.name} sprang — it ${result.secret.text}!`); return; }
  if (result.missed){ ui.setHint(`${result.card.name} missed — the target was out of range.`); return; }
  if (result.card.role === 'defense' || result.card.role === 'heal'){
    if (result.targetIndex === -1){ ui.setHint(`${who}: no target available!`); return; }
    const onSelf = result.targetSide === side;
    const targetWho = onSelf ? 'its own ally' : 'the enemy';
    ui.setHint(result.reversed
      ? `${who} reversed ${result.card.name} on ${targetWho}!`
      : `${who} used ${cardLabel(result.card, side)} on ${targetWho}!`);
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
  cine.letterbox(true);
  cine.slowMo(0.25, 1.6);
  // The winning squad strikes its weapon's Skill pose.
  if (state.winner === 'you' || state.winner === 'rival'){
    const lanes = state.winner === 'you' ? state.youLanes : state.rivalLanes;
    lanes.forEach((l, i) => { if (l.alive) setTimeout(() => ui.playLaneAction(state.winner, i, 'victory'), 500 + i * 150); });
  }
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
  ui.setHint(side === 'you'
    ? `🎯 ${who} selected — heals and defenses go to it.`
    : `🎯 ${who} selected — attacks go to it; a heal played now becomes Reverse Heal (damage).`);
  syncHand();
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
let aimCancelling = false; // finger dragged off the held card: letting go cancels
let castAim = null; // your played card: its reach ring/line stay up until impact
let previewTimer = 0; // how long the post-release confirmation stays up

// Live answer, per card in hand, to "does it reach right now?": attacks
// check their real reach (short 2.3 / long 6) against the Axie they'd hit.
function reachFor(card){
  const caster = state.youLanes[card.laneIndex];
  if (!caster || !caster.alive) return null;
  if (caster.status.stun > 0) return { ok: false, text: `😵 stunned ${Math.ceil(caster.status.stun)}s` };
  const a = aimFor(card);
  const lanes = a.targetSide === 'you' ? state.youLanes : state.rivalLanes;
  const target = lanes[a.targetIndex];
  if (!target) return { ok: false, text: '❌ no target' };
  if (card.role !== 'attack'){
    return { ok: true, text: a.targetSide === 'you' ? `→ ${a.targetIndex === card.laneIndex ? 'itself' : target.name}` : `↩ → rival ${target.name}` };
  }
  const d = game.distanceBetween(state, 'you', card.laneIndex, 'rival', a.targetIndex);
  const reach = game.cardRange(card);
  if (a.inRange) return { ok: true, text: `${a.taunted ? '🛡️' : '✅'} hits ${target.name}` };
  return { ok: false, text: `❌ ${target.name} ${d.toFixed(1)} away · reach ${reach}` };
}

// First value chip of a card (its damage / heal / protection) as text.
function mainValue(card){
  const v = game.cardValues(state, card, state.youLanes[card.laneIndex], card.role === 'heal' && aimFor(card).targetSide === 'rival')[0];
  return v ? `${v.icon} ${v.text}` : '';
}

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
  // Heal cards follow the 🎯 to either side: on an ally they heal, on an
  // enemy they turn into Reverse Heal (damage) -- the card turns red while
  // that is what it would do (see ui.renderHand). Defense cards only ever
  // go to your own squad. With no 🎯 on a valid target, both pick the ally
  // that needs them most.
  if (card.role === 'heal' && selectedTarget && selectedTarget.side === 'rival' && state.rivalLanes[selectedTarget.laneIndex]?.alive){
    return { targetSide: 'rival', targetIndex: selectedTarget.laneIndex, legal: [selectedTarget.laneIndex], inRange: true, reversed: true };
  }
  const targetIndex = selectedTarget && selectedTarget.side === 'you' && state.youLanes[selectedTarget.laneIndex]?.alive
    ? selectedTarget.laneIndex : supportTargetFor(card, caster);
  return { targetSide: 'you', targetIndex, legal: [targetIndex], inRange: true };
}

// Heal: the most hurt ally (lowest HP share). Thorns: the Tank, who draws
// the hits. Other defenses: the most hurt ally not already carrying that
// protection. Ties keep the card's own Axie.
function supportTargetFor(card, caster){
  const alive = state.youLanes.map((l, i) => ({ l, i })).filter(x => x.l.alive);
  if (card.effect === 'secret'){
    const open = alive.filter(x => !x.l.secret);
    const pick = open.find(x => x.l.isTank) || open[0] || alive.find(x => x.l.isTank) || alive[0];
    return pick ? pick.i : caster;
  }
  if (card.role === 'defense' && card.effect === 'thorns'){
    const tank = alive.find(x => x.l.isTank);
    if (tank) return tank.i;
  }
  const statusKey = { shield: 'shield', bulwark: 'bulwark', bulwark_cleanse: 'bulwark', barrier: 'barrier', dodge: 'dodgeCharges' }[card.effect] || (card.role === 'defense' ? 'shield' : null);
  const pool = card.role === 'defense' ? alive.filter(x => !x.l.status[statusKey]) : alive;
  const list = pool.length ? pool : alive;
  let best = list.find(x => x.i === caster) || list[0];
  list.forEach(x => { if (x.l.hp / x.l.maxHp < best.l.hp / best.l.maxHp - 0.001) best = x; });
  return best ? best.i : caster;
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
  // The big "if you let go now" bubble above the hand.
  const tname = target ? target.name : 'nobody';
  if (aimCancelling){
    ui.showReleasePreview('✋ Let go to <b>cancel</b> — the card stays in your hand', 'cancel');
  } else if (!isAttack){
    const reversed = a.targetSide === 'rival';
    ui.showReleasePreview(`Let go → <b>${mainValue(card)}</b> on ${reversed ? "the rival's" : 'your'} <b>${tname}</b>${reversed ? ' (REVERSE HEAL)' : ''}<small>drag off the card to cancel</small>`, reversed ? 'bad' : 'ok');
  } else if (a.inRange){
    ui.showReleasePreview(`Let go → <b>${mainValue(card)}</b> on <b>${tname}</b> ✅ in reach<small>${card.range === 'short' ? '🗡️ short' : '🏹 long'} reach ${game.cardRange(card)} · drag off to cancel</small>`, 'ok');
  } else {
    const d = target ? game.distanceBetween(state, 'you', card.laneIndex, 'rival', a.targetIndex) : 0;
    const gap = Math.max(0, d - game.cardRange(card));
    ui.showReleasePreview(`Let go → <b>❌ MISS</b>: ${tname} is ${d.toFixed(1)} away, ${card.range === 'short' ? '🗡️ short' : '🏹 long'} reach is ${game.cardRange(card)}<small>walk ${gap.toFixed(1)} closer first · drag off to cancel</small>`, 'bad');
  }
  if (!isAttack){
    const onSelf = a.targetSide === 'you';
    ui.setHint(onSelf
      ? `${card.name} → your ${target.name} — release to use.`
      : `↩ ${card.name} → the rival's ${target.name}: REVERSE HEAL, deals damage — release to use. (Tap one of yours to heal instead.)`);
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
  ui.hideReleasePreview();
}

function cancelAim(){
  aiming = null;
  aimCancelling = false;
  hideAimVisuals();
  syncHand();
}

function onCardRelease(card){
  if (aiming !== card) return;
  const a = aimFor(card);
  const value = mainValue(card);
  aiming = null;
  aimCancelling = false;
  hideAimVisuals();
  const plan = state.gameOver ? null : game.playerBeginCard(state, card, a.targetIndex, a.targetSide);
  if (plan){
    startCast(plan);
    // Confirm what was just played, and keep its reach ring + line on the
    // board (green = will land, red = will miss) until it hits.
    const lanes = plan.targetSide === 'you' ? state.youLanes : state.rivalLanes;
    const tname = lanes[plan.targetIndex]?.name || 'nobody';
    castAim = { card, casterIndex: plan.casterIndex, targetSide: plan.targetSide, targetIndex: plan.targetIndex, missed: plan.missed };
    ui.showReleasePreview(plan.missed
      ? `❌ ${card.name} played <b>out of reach</b> — it will MISS ${tname}`
      : `✔ ${card.name} → <b>${tname}</b> ${value} · lands in ${game.CAST_IMPACT_AT.toFixed(1)}s`, plan.missed ? 'bad' : 'ok');
    previewTimer = 1.8;
  }
  syncUI();
}

function onCardCancel(card, byDrag){
  if (aiming !== card) return;
  cancelAim();
  if (byDrag){ ui.showReleasePreview('Cancelled — card kept', 'cancel'); previewTimer = 1; }
}

function onCardDrag(card, cancelling){
  if (aiming !== card) return;
  aimCancelling = cancelling;
  updateAim();
}

// Keeps a played card's reach ring and caster→target line up until impact.
function updateCastAim(dt){
  if (previewTimer > 0){ previewTimer -= dt; if (previewTimer <= 0 && !aiming) ui.hideReleasePreview(); }
  if (!castAim || aiming) return;
  const caster = state.youLanes[castAim.casterIndex];
  const lanes = castAim.targetSide === 'you' ? state.youLanes : state.rivalLanes;
  const target = lanes[castAim.targetIndex];
  if (!caster || !caster.alive){ castAim = null; ui.hideAim(); return; }
  const isAttack = castAim.card.role === 'attack';
  ui.showAim({
    side: 'you', casterXZ: caster.localPos,
    radius: isAttack ? game.cardRange(castAim.card) : null,
    state: isAttack ? (castAim.missed ? 'out' : 'ok') : 'support',
    targetSide: castAim.targetSide, targetXZ: target && target.alive ? target.localPos : null,
  });
}

function syncHand(){
  const reverseHeals = !!(selectedTarget && selectedTarget.side === 'rival' && state.rivalLanes[selectedTarget.laneIndex]?.alive);
  const reach = {};
  state.hand.forEach(c => { const r = reachFor(c); if (r) reach[c.uid] = r; });
  ui.renderHand(state, { onPress: onCardPress, onRelease: onCardRelease, onCancel: onCardCancel, onDrag: onCardDrag, aimingUid: aiming && aiming.uid, reverseHeals, reach });
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
  // A self-cast never flies anywhere: the weapon's Skill pose plays as it
  // charges instead.
  if (!travels) ui.playLaneAction(plan.side, plan.casterIndex, 'skill');
  pendingCasts.push({ id, plan, age: 0, travels, launched: false });
  if (plan.side === 'you') ui.setHint(`⏳ Casting ${plan.card.name}…`);
  else if (!aiming) ui.setHint(`⚠️ The rival is casting ${cardLabel(plan.card, 'rival')}!`);
}

function tickPendingCasts(dt){
  pendingCasts = pendingCasts.filter(c => {
    c.age += dt;
    if (c.travels && !c.launched && c.age >= game.CAST_LAUNCH_AT){
      c.launched = true;
      ui.launchCastFX(c.id, c.plan.targetSide, c.plan.targetIndex, game.CAST_IMPACT_AT - game.CAST_LAUNCH_AT, c.plan.missed, projectileStyle(c.plan.card));
      // The caster swings its weapon as the shot leaves (toolkit clips).
      ui.playLaneAction(c.plan.side, c.plan.casterIndex, c.plan.card.role === 'attack' ? 'attack' : 'skill');
      sfx.playLaunch(c.plan.card);
    }
    if (c.age < game.CAST_IMPACT_AT) return true;
    ui.landCastFX(c.id);
    if (castAim && c.plan.side === 'you'){ castAim = null; if (!aiming) ui.hideAim(); }
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
    label: `${c.plan.card.setIcon || ''} ${cardLabel(c.plan.card, c.plan.side)} → ${targetName(c.plan)}`,
    miss: c.plan.missed,
  })));
}

// The rival's Secrets stay hidden: you only ever see "a Secret".
function cardLabel(card, side){
  return side === 'rival' && card.effect === 'secret' ? 'a Secret ❓' : card.name;
}

function targetName(plan){
  const lanes = plan.targetSide === 'you' ? state.youLanes : state.rivalLanes;
  const t = lanes[plan.targetIndex];
  if (!t) return '—';
  return plan.targetSide === plan.side ? (plan.targetIndex === plan.casterIndex ? 'self' : t.name) : t.name;
}

function clearCasts(){
  castAim = null;
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

// ================= Keyboard (computers) =================
// W A S D (or the arrow keys) drive the squad exactly like the joystick:
// W / up = toward the enemy. The on-screen stick mirrors the direction.
// Cards stay on the mouse: press a card to aim, release to play, drag off
// it to cancel (Esc also cancels a held card).
const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const keysDown = new Set();
let keyMoving = false;
let keyDirX = 0, keyDirZ = 0;

function inDuel(){ return document.body.classList.contains('in-duel') && state && !matchFinished; }

function updateKeyMove(){
  let x = 0, z = 0;
  keysDown.forEach(code => { const d = MOVE_KEYS[code]; if (d){ x += d[0]; z += d[1]; } });
  const len = Math.hypot(x, z);
  keyDirX = len ? x / len : 0;
  keyDirZ = len ? z / len : 0;
  const was = keyMoving;
  keyMoving = len > 0 && !joystickWrap.classList.contains('disabled');
  if (keyMoving){
    if (!was) cancelMoveMode();
    joystickKnob.style.transform = `translate(${keyDirX * JOY_MAX_PX}px, ${-keyDirZ * JOY_MAX_PX}px)`;
  } else if (was){
    if (!joyHolding) joystickKnob.style.transform = '';
    state.youLanes.forEach((lane, i) => { if (lane.alive) ui.endLiveLanePosition('you', i); });
  }
}

window.addEventListener('keydown', (e) => {
  if (!inDuel() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (MOVE_KEYS[e.code]){
    e.preventDefault();
    keysDown.add(e.code);
    updateKeyMove();
    return;
  }
  if (e.code === 'Escape' && aiming) cancelAim();
});
window.addEventListener('keyup', (e) => {
  if (MOVE_KEYS[e.code]){ keysDown.delete(e.code); if (state) updateKeyMove(); }
});
// Losing focus (alt-tab) must not leave the squad walking forever.
window.addEventListener('blur', () => { keysDown.clear(); if (state) updateKeyMove(); });

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
  // Slow motion (a KO, a heavy hit's hit-stop) slows the rules too, so the
  // cast bars, timers and movement stay in step with the 3D scene.
  const dt = Math.min(0.1, (nowMs - lastFrameMs) / 1000) * cine.getTimeScale();
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

  if (joyHolding || keyMoving){
    const dirX = joyHolding ? joyDirX : keyDirX, dirZ = joyHolding ? joyDirZ : keyDirZ;
    const tankIdx = state.youLanes.findIndex(l => l.isTank);
    if (tankIdx !== -1 && state.youLanes[tankIdx].alive){
      game.moveSquadWithTank(state, 'you', dirX * UNIT_MOVE_SPEED * dt, dirZ * UNIT_MOVE_SPEED * dt);
      if (tutorial) tutorial.notify('moved', Math.hypot(dirX, dirZ) * UNIT_MOVE_SPEED * dt);
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
  updateCastAim(dt);
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

// Start on the arena lobby.
showSelectScreen();
