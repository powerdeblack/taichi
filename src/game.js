// Core duel state and combat rules: energy, class triangle damage, status
// effects (Bleed, Deathmark, Retain, Shield), Ambush and combo bonuses.
import { shuffle, classMultiplier } from './cards.js';
import { fireProjectile } from './physics.js';
import { spawnFloatingText, spawnParticles, triggerShake, resetEffects } from './render.js';
import * as ui from './ui.js';

export const PLAYER_CLASS = 'Beast';
export const RIVAL_CLASS = 'Aqua';
export const MAX_HP = 100;
export const MAX_ENERGY = 10;
export const HAND_SIZE = 3;

export function freshState(deckDef, positions){
  const deck = shuffle(deckDef);
  const hand = deck.splice(0, HAND_SIZE);
  return {
    hpYou: MAX_HP, hpRival: MAX_HP,
    energyYou: 3, energyRival: 3,
    statusYou: {}, statusRival: {},
    firstHitDone: false,
    turn: 'you',
    deck, discard: [], hand,
    selectedCard: null,
    projectiles: [],
    gameOver: false,
    pendingResolve: null,
    positions,
  };
}

export function drawCard(state){
  if (state.deck.length === 0){
    if (state.discard.length === 0) return null;
    state.deck = shuffle(state.discard);
    state.discard = [];
  }
  const card = state.deck.pop();
  state.hand.push(card);
  return card;
}

export function startNewMatch(deckDef, positions){
  const state = freshState(deckDef, positions);
  resetEffects();
  ui.hideBanner();
  return state;
}

function applyComboBonus(state, targetSide, amount){
  if (targetSide==='you') state.hpYou = Math.max(0, state.hpYou - amount);
  else state.hpRival = Math.max(0, state.hpRival - amount);
  ui.updateHPBars(state);
  const pos = targetSide==='you' ? state.positions.you : state.positions.rival;
  spawnFloatingText(pos.x, pos.y-70, 'COMBO! -'+amount, '#ffd23f', 17);
  spawnParticles(pos.x, pos.y-30, '#ffd23f', 16);
  triggerShake(10, 0.3);
  checkGameOver(state);
}

export function applyDamage(state, target, amount, sourceCls, hitX, hitY){
  const isYou = target === 'you';
  const defCls = isYou ? PLAYER_CLASS : RIVAL_CLASS;
  let mult = classMultiplier(sourceCls, defCls);
  let dmg = amount * mult;

  const statusObj = isYou ? state.statusYou : state.statusRival;
  let deathmarked = false, shielded = false;
  if (statusObj.deathmark){ dmg += 10; delete statusObj.deathmark; deathmarked = true; }
  if (statusObj.shield){ dmg *= 0.5; delete statusObj.shield; shielded = true; }
  dmg = Math.round(dmg);
  if (isYou) state.hpYou = Math.max(0, state.hpYou - dmg);
  else state.hpRival = Math.max(0, state.hpRival - dmg);
  ui.updateHPBars(state);
  ui.renderStatus(state);

  const pos = isYou ? state.positions.you : state.positions.rival;
  const px = hitX!==undefined ? hitX : pos.x;
  const py = hitY!==undefined ? hitY : pos.y-20;
  spawnParticles(px, py, isYou ? '#4c8fb0' : '#c97b3d', 12);
  spawnFloatingText(px, py-10, '-'+dmg, '#ffdca0', 20);
  if (shielded) spawnFloatingText(px, py-32, 'BLOQUEADO!', '#8fd0ff', 13);
  if (deathmarked) spawnFloatingText(px, py-46, '+10 MARCA', '#c99bff', 13);
  triggerShake(Math.min(14, 4 + dmg*0.25), 0.22);

  return dmg;
}

export function applyBleed(state, target){
  const statusObj = target === 'you' ? state.statusYou : state.statusRival;
  statusObj.bleed = 2;
}

export function tickBleed(state, target){
  const statusObj = target === 'you' ? state.statusYou : state.statusRival;
  if (statusObj.bleed && statusObj.bleed > 0){
    const dmg = 5;
    if (target==='you') state.hpYou = Math.max(0, state.hpYou - dmg);
    else state.hpRival = Math.max(0, state.hpRival - dmg);
    statusObj.bleed -= 1;
    if (statusObj.bleed<=0) delete statusObj.bleed;
    ui.updateHPBars(state);
    ui.renderStatus(state);
    const pos = target==='you' ? state.positions.you : state.positions.rival;
    spawnFloatingText(pos.x, pos.y-40, '-'+dmg+' 🩸', '#e0685a', 15);
    spawnParticles(pos.x, pos.y-20, '#b8452f', 6);
    return dmg;
  }
  return 0;
}

export function launchCard(state, card, angle, power){
  state.energyYou -= card.cost;
  if (card.effect !== 'retain'){
    state.hand = state.hand.filter(c => c !== card);
    state.discard.push(card);
    drawCard(state);
  }
  state.selectedCard = null;
  state.turn = 'resolving';

  const vx = -Math.cos(angle) * power;
  const vy = -Math.sin(angle) * power;
  fireProjectile(state, state.positions.you, vx, vy, card, 'you');
  state.pendingResolve = { side:'you', card, hitsRegistered:0, resolved:false };
}

export function playDefenseCard(state, card){
  state.energyYou -= card.cost;
  state.statusYou.shield = true;
  if (card.effect === 'shield_cleanse'){
    ['bleed','deathmark'].forEach(k => { if (state.statusYou[k]) delete state.statusYou[k]; });
  }
  state.hand = state.hand.filter(c => c !== card);
  state.discard.push(card);
  drawCard(state);
  ui.renderStatus(state);
  ui.setHint(`Você usou ${card.name}!`);
  state.turn = 'rival';
}

export function startYourTurn(state){
  tickBleed(state, 'you');
  checkGameOver(state);
  if (state.gameOver) return;
  state.energyYou = Math.min(MAX_ENERGY, state.energyYou + 2);
  state.turn = 'you';
  ui.setHint('Escolha uma carta de ataque e arraste no campo pra mirar.');
}

export function onProjectileHit(state, p, targetSide){
  const sourceCls = p.card.cls;
  const ambushBonus = (!state.firstHitDone && p.card.effect==='ambush');
  let dmgToApply = p.card.dmg;
  if (ambushBonus) dmgToApply *= 2;
  const dealt = applyDamage(state, targetSide, dmgToApply, sourceCls, p.x, p.y);
  if (ambushBonus) spawnFloatingText(p.x, p.y-64, 'AMBUSH! x2', '#ffd23f', 15);
  if (dealt>0) state.firstHitDone = true;
  if (p.card.effect === 'bleed') applyBleed(state, targetSide);
  if (p.card.effect === 'deathmark'){
    const st = targetSide==='you' ? state.statusYou : state.statusRival;
    st.deathmark = true;
    ui.renderStatus(state);
  }
  if (state.pendingResolve && state.pendingResolve.side===p.from){
    state.pendingResolve.hitsRegistered += 1;
  }
  checkGameOver(state);
}

export function finishResolution(state, { onYourTurnEnds, onRivalTurnEnds }){
  const pr = state.pendingResolve;
  if (!pr || pr.resolved) return;
  pr.resolved = true;
  const side = pr.side;

  if (pr.card.effect === 'multi' && pr.hitsRegistered >= 2 && !state.gameOver){
    const bonus = Math.round(pr.card.dmg * 0.5);
    const targetSide = side === 'you' ? 'rival' : 'you';
    applyComboBonus(state, targetSide, bonus);
  }

  if (side === 'you'){
    if (pr.hitsRegistered === 0 && pr.card.effect === 'retain'){
      ui.setHint('Errou — a Raiz nunca sai da sua mão (Retain).');
    } else if (pr.hitsRegistered === 0){
      ui.setHint('Errou o alvo!');
    }
    onYourTurnEnds();
  } else {
    onRivalTurnEnds();
  }
}

export function checkGameOver(state){
  if (state.hpYou <= 0 || state.hpRival <= 0){
    state.gameOver = true;
    state.turn = 'over';
    if (state.hpYou <=0 && state.hpRival<=0){
      ui.showBanner('Empate!', '');
    } else if (state.hpRival <= 0){
      ui.showBanner('Você venceu o duelo!', 'O rival Aqua foi derrotado.');
    } else {
      ui.showBanner('Você perdeu o duelo.', 'O rival Aqua levou a melhor dessa vez.');
    }
  }
}
