// Entry point: DOM wiring, canvas/input setup, and the animation loop that
// ties physics, render, ui, ai and game together.
import './style.css';
import { POOL } from './cards.js';
import { canvasPoint, updateProjectiles } from './physics.js';
import { draw, updateEffects } from './render.js';
import * as ui from './ui.js';
import { aiTakeTurn } from './ai.js';
import {
  startNewMatch, launchCard, playDefenseCard, startYourTurn,
  onProjectileHit, finishResolution,
} from './game.js';

const DECK_SIZE = 6;
const MAX_DRAG = 130;
// NOTE: bumped from 6.5 (original prototype) to 7.5 -- at 6.5 the max-power
// throw falls ~80px short of the rival's hit radius at every angle, so no
// shot can ever land. See README for details; tune to taste.
const POWER_SCALE = 7.5;

const deckScreen = document.getElementById('deckScreen');
const duelScreen = document.getElementById('duelScreen');
const startDuelBtn = document.getElementById('startDuelBtn');
const switchDeckBtn = document.getElementById('switchDeckBtn');
const resetBtn = document.getElementById('resetBtn');
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

const GROUND_Y = canvas.height - 46;
const positions = {
  you: { x: 92, y: GROUND_Y - 34 },
  rival: { x: canvas.width - 92, y: GROUND_Y - 34 },
};

let selectedDeck = [];
let state = null;
let playerDeckDef = [];

// ================= Deck builder screen =================
function renderDeckScreen(){
  ui.renderPool(POOL, selectedDeck, toggleCard);
  ui.renderDeckHeader(selectedDeck.length, DECK_SIZE);
}
function toggleCard(card){
  if (selectedDeck.includes(card)){
    selectedDeck = selectedDeck.filter(c => c !== card);
  } else if (selectedDeck.length < DECK_SIZE){
    selectedDeck.push(card);
  }
  renderDeckScreen();
}
renderDeckScreen();

startDuelBtn.addEventListener('click', () => {
  deckScreen.classList.add('hidden');
  duelScreen.classList.remove('hidden');
  resizeCanvas();
  beginMatch(selectedDeck);
});
switchDeckBtn.addEventListener('click', () => {
  duelScreen.classList.add('hidden');
  deckScreen.classList.remove('hidden');
});
resetBtn.addEventListener('click', () => beginMatch(playerDeckDef));

// ================= Match lifecycle =================
function beginMatch(deckDef){
  playerDeckDef = deckDef;
  state = startNewMatch(deckDef, positions);
  refreshAll();
  ui.setHint('Escolha uma carta de ataque e arraste no campo pra mirar.');
}

function refreshAll(){
  ui.updateHPBars(state);
  ui.renderStatus(state);
  ui.renderPips(state);
  ui.renderPiles(state);
  renderHand();
}

function renderHand(){
  ui.renderHand(state, {
    onSelectAttack: (card) => {
      state.selectedCard = (state.selectedCard===card) ? null : card;
      ui.setHint(state.selectedCard
        ? 'Arraste no campo pra mirar e solte pra lançar.'
        : 'Escolha uma carta de ataque e arraste no campo pra mirar.');
      renderHand();
    },
    onPlayDefense: (card) => {
      playDefenseCard(state, card);
      refreshAll();
      setTimeout(runAiTurn, 500);
    },
  });
}

function runAiTurn(){
  aiTakeTurn(state, {
    onDefensePlayed: () => {
      setTimeout(() => {
        if (state.gameOver) return;
        startYourTurn(state);
        refreshAll();
      }, 700);
    },
    onAttackLaunched: () => {},
  });
}

function checkResolution(){
  if (!state || !state.pendingResolve || state.pendingResolve.resolved) return;
  const stillFlying = state.projectiles.some(p => p.from===state.pendingResolve.side);
  if (stillFlying) return;
  finishResolution(state, {
    onYourTurnEnds: () => {
      setTimeout(() => {
        if (state.gameOver) return;
        state.turn = 'rival';
        runAiTurn();
      }, 500);
    },
    onRivalTurnEnds: () => {
      setTimeout(() => {
        if (state.gameOver) return;
        startYourTurn(state);
        refreshAll();
      }, 700);
    },
  });
}

// ================= Canvas resize =================
function resizeCanvas(){
  const displayWidth = canvas.parentElement.clientWidth;
  canvas.style.height = (displayWidth * (canvas.height/canvas.width)) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ================= Drag / aim (slingshot) =================
const drag = { dragging:false, dragStart:null, dragCurrent:null, maxDrag:MAX_DRAG, powerScale:POWER_SCALE };

function onDragStart(e){
  if (!state || state.turn !== 'you' || !state.selectedCard) return;
  if (state.selectedCard.type !== 'attack') return;
  drag.dragging = true;
  drag.dragStart = canvasPoint(canvas, e);
  drag.dragCurrent = drag.dragStart;
}
function onDragMove(e){
  if (!drag.dragging) return;
  drag.dragCurrent = canvasPoint(canvas, e);
}
function onDragEnd(){
  if (!drag.dragging) return;
  drag.dragging = false;
  const card = state.selectedCard;
  if (!card){ drag.dragStart=null; drag.dragCurrent=null; return; }
  let dx = drag.dragStart.x - drag.dragCurrent.x;
  let dy = drag.dragStart.y - drag.dragCurrent.y;
  let dist = Math.hypot(dx,dy);
  if (dist < 12){ drag.dragStart=null; drag.dragCurrent=null; return; }
  dist = Math.min(dist, MAX_DRAG);
  const angle = Math.atan2(dy,dx);
  const power = dist * POWER_SCALE;
  launchCard(state, card, angle, power);
  refreshAll();
  ui.setHint('Voando...');
  drag.dragStart=null; drag.dragCurrent=null;
}

canvas.addEventListener('mousedown', onDragStart);
canvas.addEventListener('touchstart', onDragStart, {passive:true});
canvas.addEventListener('mousemove', onDragMove);
canvas.addEventListener('touchmove', onDragMove, {passive:true});
window.addEventListener('mouseup', onDragEnd);
window.addEventListener('touchend', onDragEnd);

// ================= Main loop =================
let lastTime = null;
function loop(ts){
  if (!lastTime) lastTime = ts;
  const dt = Math.min(0.032, (ts-lastTime)/1000);
  lastTime = ts;
  if (state){
    updateProjectiles(state, dt, positions, canvas.width, GROUND_Y, (p, targetSide) => onProjectileHit(state, p, targetSide));
    updateEffects(dt);
    checkResolution();
    draw(ctx, canvas, state, positions, GROUND_Y, drag);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
