// Core board-duel rules: N lanes per side (a squad of picks), energy,
// class-triangle damage, role stats (Tank/Attacker/Healer), status effects
// (Bleed, Deathmark, Retain, Shield/Cleanse, Heal), Ambush and the Pena/Voo
// Rasante combo. Targeting: 'short' cards hit the mirrored enemy lane,
// 'long' cards hit whichever enemy lane has the least HP, 'own'/'own_all'
// support cards act on the caster's own lane or every own alive lane.
// Win condition: a team loses the instant its Tank lane dies.
import { AXIES, axieById, classMultiplier, shuffle, ROLES, BASE_HP, BASE_MP } from './cards.js';

export const MAX_ENERGY = 10;
export const HAND_SIZE = 3;
export const SQUAD_SIZE = 5;
export const ALL_CLASSES = AXIES.map(a => a.classId);

// Auto-builds a valid rival squad: one Tank plus SQUAD_SIZE-1 random
// Attacker/Healer picks, classes allowed to repeat.
export function randomSquad(){
  const picks = [{ classId: ALL_CLASSES[Math.floor(Math.random()*ALL_CLASSES.length)], role: 'Tank' }];
  for (let i=1; i<SQUAD_SIZE; i++){
    const classId = ALL_CLASSES[Math.floor(Math.random()*ALL_CLASSES.length)];
    const role = Math.random() < 0.5 ? 'Attacker' : 'Healer';
    picks.push({ classId, role });
  }
  return picks;
}

function createLanes(picks){
  return picks.map(({ classId, role }) => {
    const axie = axieById(classId);
    const roleStats = ROLES[role];
    return {
      classId, role, name: axie.name, color: axie.color,
      maxHp: Math.round(BASE_HP * roleStats.hpMult),
      hp: Math.round(BASE_HP * roleStats.hpMult),
      mp: Math.round(BASE_MP * roleStats.mpMult),
      status: {}, alive: true,
    };
  });
}

// Cards carry laneIndex, not just classId, because a squad can repeat
// classes: classId alone can't tell two same-class lanes apart.
function buildDeck(picks){
  return picks.flatMap(({ classId }, laneIndex) => {
    const axie = axieById(classId);
    return axie.cards.map(c => ({ ...c, cls: classId, laneIndex, color: axie.color, uid: `${classId}:${c.id}:${laneIndex}` }));
  });
}

export function freshState(youPicks, rivalPicks){
  const youLanes = createLanes(youPicks);
  const rivalLanes = createLanes(rivalPicks);
  const deck = shuffle(buildDeck(youPicks));
  const hand = deck.splice(0, HAND_SIZE);
  return {
    youLanes, rivalLanes,
    energyYou: 3, energyRival: 3,
    firstHitDone: false,
    turn: 'you',
    deck, discard: [], hand,
    gameOver: false,
    winner: null,
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

function cullDeadHand(state){
  let guard = 0;
  while (guard++ < 20){
    const deadIdx = state.hand.findIndex(c => !state.youLanes[c.laneIndex].alive);
    if (deadIdx === -1) break;
    const [card] = state.hand.splice(deadIdx, 1);
    state.discard.push(card);
    if (!drawCard(state)) break;
  }
}

function aliveIndices(lanes){
  return lanes.map((l,i) => l.alive ? i : -1).filter(i => i >= 0);
}

function lowestHpIndex(lanes){
  const alive = aliveIndices(lanes);
  if (!alive.length) return -1;
  return alive.reduce((best,i) => (lanes[i].hp < lanes[best].hp ? i : best), alive[0]);
}

function resolveTargetLane(enemyLanes, casterIndex, range){
  if (range === 'short'){
    if (enemyLanes[casterIndex] && enemyLanes[casterIndex].alive) return casterIndex;
    const alive = aliveIndices(enemyLanes);
    return alive.length ? alive[0] : -1;
  }
  if (range === 'long') return lowestHpIndex(enemyLanes);
  return -1;
}

function applyDamage(lane, amount, attackerClassId, attackerRole){
  const mult = classMultiplier(attackerClassId, lane.classId);
  let dmg = amount * mult * ROLES[attackerRole].powerMult;
  let deathmarked = false, shielded = false;
  if (lane.status.deathmark){ dmg += 10; delete lane.status.deathmark; deathmarked = true; }
  if (lane.status.shield){ dmg *= 0.5; delete lane.status.shield; shielded = true; }
  dmg *= (1 - ROLES[lane.role].damageReduction);
  dmg = Math.max(0, Math.round(dmg));
  lane.hp = Math.max(0, lane.hp - dmg);
  if (lane.hp <= 0) lane.alive = false;
  return { dmg, deathmarked, shielded };
}

function applyBleed(lane){ lane.status.bleed = 2; }

function tickBleed(lane){
  if (lane.status.bleed && lane.status.bleed > 0){
    const dmg = 5;
    lane.hp = Math.max(0, lane.hp - dmg);
    lane.status.bleed -= 1;
    if (lane.status.bleed <= 0) delete lane.status.bleed;
    if (lane.hp <= 0) lane.alive = false;
    return dmg;
  }
  return 0;
}

// Heal/shield strength scales with the caster's MP stat (Healers are much
// stronger at this; Tanks are weak at it even if they carry a support card).
function mpScale(lane, roleHealMult){
  return (lane.mp / BASE_MP) * roleHealMult;
}

function applyHeal(lane, amount, casterLane){
  const scaled = Math.round(amount * mpScale(casterLane, ROLES[casterLane.role].healMult));
  const before = lane.hp;
  lane.hp = Math.min(lane.maxHp, lane.hp + scaled);
  return lane.hp - before;
}

function applyShield(lane, cleanse){
  lane.status.shield = true;
  if (cleanse){ delete lane.status.bleed; delete lane.status.deathmark; }
}

// Applies one card's effect and mutates state. Returns a result descriptor
// used by main.js to drive floating-text/shake feedback.
export function resolveCard(state, side, card, casterIndex){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const result = {
    side, card, casterIndex, targetIndex: -1, targetIndices: [], dmg: 0, healed: 0,
    ambush: false, shielded: false, deathmarked: false, comboBonus: 0,
  };

  if (card.role === 'defense'){
    if (card.range === 'own_all'){
      result.targetIndices = aliveIndices(ownLanes);
      for (const i of result.targetIndices) applyShield(ownLanes[i], card.effect === 'shield_cleanse');
    } else {
      applyShield(casterLane, card.effect === 'shield_cleanse');
      result.targetIndex = casterIndex;
    }
    return result;
  }
  if (card.role === 'heal'){
    if (card.range === 'own_all'){
      result.targetIndices = aliveIndices(ownLanes);
      result.healed = result.targetIndices.reduce((sum,i) => sum + applyHeal(ownLanes[i], card.heal, casterLane), 0);
    } else {
      result.healed = applyHeal(casterLane, card.heal, casterLane);
      result.targetIndex = casterIndex;
    }
    return result;
  }

  const targetIndex = resolveTargetLane(enemyLanes, casterIndex, card.range);
  if (targetIndex === -1) return result;
  const targetLane = enemyLanes[targetIndex];

  const ambush = !state.firstHitDone && card.effect === 'ambush';
  const dmgToApply = card.dmg * (ambush ? 2 : 1);
  const { dmg, deathmarked, shielded } = applyDamage(targetLane, dmgToApply, card.cls, casterLane.role);
  if (dmg > 0) state.firstHitDone = true;
  if (card.effect === 'bleed') applyBleed(targetLane);
  if (card.effect === 'deathmark') targetLane.status.deathmark = true;

  Object.assign(result, { targetIndex, dmg, ambush, deathmarked, shielded });

  if (card.effect === 'multi' && targetLane.alive){
    const bonus = Math.round(card.dmg * 0.5 * ROLES[casterLane.role].powerMult);
    targetLane.hp = Math.max(0, targetLane.hp - bonus);
    if (targetLane.hp <= 0) targetLane.alive = false;
    result.comboBonus = bonus;
  }

  checkGameOver(state);
  return result;
}

export function playerPlayCard(state, card){
  const casterIndex = card.laneIndex;
  state.energyYou -= card.cost;
  if (card.effect !== 'retain'){
    state.hand = state.hand.filter(c => c !== card);
    state.discard.push(card);
    drawCard(state);
  }
  return resolveCard(state, 'you', card, casterIndex);
}

export function startYourTurn(state){
  const bleedResults = state.youLanes.filter(l => l.alive).map(l => ({ lane: l, dmg: tickBleed(l) })).filter(r => r.dmg > 0);
  checkGameOver(state);
  if (state.gameOver) return bleedResults;
  state.energyYou = Math.min(MAX_ENERGY, state.energyYou + 2);
  state.turn = 'you';
  cullDeadHand(state);
  return bleedResults;
}

export function startRivalPrep(state){
  const bleedResults = state.rivalLanes.filter(l => l.alive).map(l => ({ lane: l, dmg: tickBleed(l) })).filter(r => r.dmg > 0);
  checkGameOver(state);
  if (!state.gameOver) state.energyRival = Math.min(MAX_ENERGY, state.energyRival + 2);
  return bleedResults;
}

export function checkGameOver(state){
  const youTank = state.youLanes.find(l => l.role === 'Tank');
  const rivalTank = state.rivalLanes.find(l => l.role === 'Tank');
  const youDead = !youTank || !youTank.alive;
  const rivalDead = !rivalTank || !rivalTank.alive;
  if (youDead || rivalDead){
    state.gameOver = true;
    state.turn = 'over';
    state.winner = (youDead && rivalDead) ? 'draw' : (rivalDead ? 'you' : 'rival');
  }
}
