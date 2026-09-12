// Entry point: DOM wiring for the team picker and the 3-lane board duel.
import './style.css';
import { AXIES } from './cards.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as render from './render.js';
import { aiTakeTurn } from './ai.js';

const deckScreen = document.getElementById('deckScreen');
const duelScreen = document.getElementById('duelScreen');
const startDuelBtn = document.getElementById('startDuelBtn');
const switchDeckBtn = document.getElementById('switchDeckBtn');
const resetBtn = document.getElementById('resetBtn');
const boardEl = document.getElementById('board');

let selectedClassIds = [];
let state = null;
let lastYouClassIds = [];
let lastRivalClassIds = [];

// ================= Team picker =================
function renderRosterScreen(){
  ui.renderRoster(AXIES, selectedClassIds, toggleClass);
  ui.renderRosterHeader(selectedClassIds.length, game.LANES);
}
function toggleClass(classId){
  const idx = selectedClassIds.indexOf(classId);
  if (idx !== -1) selectedClassIds.splice(idx, 1);
  else if (selectedClassIds.length < game.LANES) selectedClassIds.push(classId);
  renderRosterScreen();
}
renderRosterScreen();

startDuelBtn.addEventListener('click', () => {
  deckScreen.classList.add('hidden');
  duelScreen.classList.remove('hidden');
  const rivalClassIds = game.pickRivalClasses(selectedClassIds);
  beginMatch(selectedClassIds.slice(), rivalClassIds);
});
switchDeckBtn.addEventListener('click', () => {
  duelScreen.classList.add('hidden');
  deckScreen.classList.remove('hidden');
});
resetBtn.addEventListener('click', () => beginMatch(lastYouClassIds, lastRivalClassIds));

// ================= Match lifecycle =================
function beginMatch(youClassIds, rivalClassIds){
  lastYouClassIds = youClassIds;
  lastRivalClassIds = rivalClassIds;
  state = game.freshState(youClassIds, rivalClassIds);
  ui.hideBanner();
  ui.buildBoard(state);
  syncUI();
  ui.setHint('Escolha uma carta pra jogar.');
}

function syncUI(){
  ui.updateBoard(state);
  ui.renderPips(state);
  ui.renderPiles(state);
  ui.renderHand(state, { onPlay: onPlayerCardClick });
}

function applyResultFx(result){
  if (!result) return;
  const { side, card, casterIndex, targetIndex } = result;

  if (card.role === 'defense'){
    const el = ui.getLaneSideEl(side, casterIndex);
    render.flashHeal(el);
    render.spawnFloatingText(el, 'ESCUDO!', 'text-shield');
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
    render.spawnFloatingText(el, 'Sem alvo!', 'text-dmg');
    return;
  }
  const enemySide = side === 'you' ? 'rival' : 'you';
  const el = ui.getLaneSideEl(enemySide, targetIndex);
  render.flashHit(el);
  render.shakeBoard(boardEl);
  render.spawnFloatingText(el, '-'+result.dmg, 'text-dmg');
  if (result.ambush) render.spawnFloatingText(el, 'AMBUSH! x2', 'text-ambush');
  if (result.shielded) render.spawnFloatingText(el, 'BLOQUEADO!', 'text-block');
  if (result.deathmarked) render.spawnFloatingText(el, '+10 MARCA', 'text-mark');
  if (result.comboBonus) render.spawnFloatingText(el, 'COMBO! -'+result.comboBonus, 'text-combo');
}

function applyBleedFx(side, bleedResults){
  const lanesArr = side === 'you' ? state.youLanes : state.rivalLanes;
  bleedResults.forEach(({ lane, dmg }) => {
    const laneIndex = lanesArr.indexOf(lane);
    const el = ui.getLaneSideEl(side, laneIndex);
    render.flashHit(el);
    render.spawnFloatingText(el, '-'+dmg+' 🩸', 'text-bleed');
  });
}

function setHintForResult(side, result){
  const who = side === 'you' ? 'Você' : 'O rival';
  if (!result){ ui.setHint(`${who} não teve carta jogável e passou o turno.`); return; }
  if (result.card.role === 'defense'){ ui.setHint(`${who} ativou ${result.card.name}!`); return; }
  if (result.card.role === 'heal'){ ui.setHint(`${who} curou ${result.healed} com ${result.card.name}!`); return; }
  if (result.targetIndex === -1){ ui.setHint('Sem alvo disponível!'); return; }
  ui.setHint(`${result.card.name} causou ${result.dmg} de dano!`);
}

function finishMatch(){
  if (state.winner === 'draw') ui.showBanner('Empate!', '');
  else if (state.winner === 'you') ui.showBanner('Você venceu o duelo!', 'Todas as linhas rivais foram derrotadas.');
  else ui.showBanner('Você perdeu o duelo.', 'Suas linhas foram derrotadas.');
}

function onPlayerCardClick(card){
  const result = game.playerPlayCard(state, card);
  applyResultFx(result);
  syncUI();
  setHintForResult('you', result);
  if (state.gameOver){ finishMatch(); return; }
  setTimeout(() => {
    state.turn = 'rival';
    ui.setHint('O rival está pensando...');
    runAiTurn();
  }, 500);
}

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
        ui.setHint('Escolha uma carta pra jogar.');
      }, 700);
    },
  });
}
