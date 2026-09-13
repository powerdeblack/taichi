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

let squad = []; // [{ classId, isTank, counts:{attack,defense,heal} }] -- up to SQUAD_SIZE
let state = null;
let lastYouSquad = [];
let lastRivalSquad = [];

// ================= Team builder =================
function renderTeamScreen(){
  ui.renderRoster(AXIES, squad, addToSquad);
  ui.renderSquad(squad, AXIES, { onAdjust: adjustCount, onToggleTank: toggleTank, onRemove: removeFromSquad });
  ui.renderSquadHeader(squad, game.SQUAD_SIZE);
}
function addToSquad(classId){
  if (squad.length >= game.SQUAD_SIZE) return;
  squad.push({
    classId,
    isTank: !squad.some(p => p.isTank),
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
  preview3dLabel.textContent = `Carregando ${classId} em 3D...`;
  if (!preview3dReady) preview3dReady = initPreview(preview3dCanvas);
  preview3dReady
    .then(() => showAxie(classId))
    .then(() => { preview3dLabel.textContent = classId; })
    .catch((err) => {
      console.error('3D preview failed:', err);
      preview3dLabel.textContent = 'Prévia 3D indisponível';
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
  const enemySide = side === 'you' ? 'rival' : 'you';

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
  if (result.card.role === 'heal'){ ui.setHint(`${who} curou com ${result.card.name}!`); return; }
  if (result.targetIndex === -1){ ui.setHint('Sem alvo disponível!'); return; }
  ui.setHint(`${result.card.name} causou ${result.dmg} de dano!`);
}

function finishMatch(){
  if (state.winner === 'draw') ui.showBanner('Empate!', 'Os dois Tanques caíram juntos.');
  else if (state.winner === 'you') ui.showBanner('Você venceu o duelo!', 'O Tanque rival foi derrotado.');
  else ui.showBanner('Você perdeu o duelo.', 'Seu Tanque foi derrotado.');
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
