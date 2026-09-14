// Core board-duel rules: a 5-Axie squad per side, each Axie's power/
// toughness/heal-strength computed from its own 5-card loadout (attack/
// defense/heal counts -- see cards.js computeLaneStats), the classic class
// triangle, and status effects (Bleed, Deathmark, Retain, Shield/Cleanse,
// Ambush, the Pena combo). Targeting is manual: the player picks which
// enemy to hit among the legal targets for that card's range ('short' can
// only reach an enemy sharing your board column, 'long' can reach anyone
// alive); 'own' support cards act on the caster's own lane. Each lane also
// has a mutable board `col` (0..SQUAD_SIZE-1) -- you can swap two of your
// own lanes' columns once per turn (see moveLane) to dodge/set up short-
// range matchups. Win condition: a team loses the instant its designated
// Tank lane dies.
import { axieById, classMultiplier, shuffle, buildLoadout, computeLaneStats, ALL_CLASSES, LOADOUT_SIZE, BASE_HP, BASE_MP } from './cards.js';

export const MAX_ENERGY = 10;
export const HAND_SIZE = 3;
export const SQUAD_SIZE = 5;
export { LOADOUT_SIZE };

// Auto-builds a valid rival squad: random classes, random attack/defense/
// heal split per Axie (summing to LOADOUT_SIZE), one random Tank.
export function randomSquad(){
  const picks = [];
  for (let i=0; i<SQUAD_SIZE; i++){
    let a = Math.floor(Math.random()*(LOADOUT_SIZE+1));
    let d = Math.floor(Math.random()*(LOADOUT_SIZE-a+1));
    let h = LOADOUT_SIZE - a - d;
    picks.push({
      classId: ALL_CLASSES[Math.floor(Math.random()*ALL_CLASSES.length)],
      isTank: false,
      evolved: Math.random() < 0.3,
      counts: { attack: a, defense: d, heal: h },
    });
  }
  picks[Math.floor(Math.random()*picks.length)].isTank = true;
  return picks;
}

function createLanes(picks){
  return picks.map(({ classId, isTank, evolved, counts }, i) => {
    const axie = axieById(classId);
    const stats = computeLaneStats(counts, evolved);
    return {
      classId, isTank, evolved: !!evolved, counts, name: axie.name, color: axie.color,
      maxHp: stats.maxHp, hp: stats.maxHp, mp: stats.mp,
      powerMult: stats.powerMult, damageReduction: stats.damageReduction,
      status: {}, alive: true, col: i,
      cardPool: buildLoadout(classId, counts),
    };
  });
}

function buildDeck(picks){
  const lanes = createLanes(picks);
  return lanes.flatMap((lane, laneIndex) =>
    lane.cardPool.map(c => ({ ...c, cls: lane.classId, laneIndex, color: lane.color, uid: `${lane.classId}:${c.id}:${laneIndex}:${Math.random()}` }))
  );
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
    movedThisTurn: false,
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

export function aliveIndices(lanes){
  return lanes.map((l,i) => l.alive ? i : -1).filter(i => i >= 0);
}

// Legal enemy targets for an attack card: 'short' can only reach an enemy
// currently sharing the caster's board column (falls back to any alive
// enemy if nobody's there -- e.g. that column's Axie already died);
// 'long' can reach any alive enemy. The player picks among these; see
// pickAutoTarget for the rival AI's automatic choice.
export function getLegalTargets(state, side, card, casterIndex){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const alive = aliveIndices(enemyLanes);
  if (card.range === 'short'){
    const sameCol = alive.filter(i => enemyLanes[i].col === casterLane.col);
    return sameCol.length ? sameCol : alive;
  }
  if (card.range === 'long') return alive;
  return [];
}

// The rival AI doesn't get an interactive target picker: short range picks
// whoever's legal (usually the same-column enemy), long range picks the
// legal target with the least HP.
export function pickAutoTarget(state, side, card, casterIndex){
  const legal = getLegalTargets(state, side, card, casterIndex);
  if (!legal.length) return -1;
  if (card.range === 'long'){
    const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
    return legal.reduce((best,i) => (enemyLanes[i].hp < enemyLanes[best].hp ? i : best), legal[0]);
  }
  return legal[0];
}

// Swaps two of a side's own lanes' board columns -- the tactical payoff of
// manual targeting: move your Tank out of a short-range attacker's column,
// or line up your own short-range attacker on a juicy target. Once per
// your turn; the rival AI doesn't move (kept simple on purpose).
export function moveLane(state, side, sourceIndex, destIndex){
  if (side === 'you' && state.movedThisTurn) return false;
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const src = lanes[sourceIndex], dest = lanes[destIndex];
  if (!src || !dest || sourceIndex === destIndex || !src.alive) return false;
  const tmp = src.col; src.col = dest.col; dest.col = tmp;
  if (side === 'you') state.movedThisTurn = true;
  return true;
}

function applyDamage(lane, amount, attackerClassId, casterLane){
  const mult = classMultiplier(attackerClassId, lane.classId);
  let dmg = amount * mult * casterLane.powerMult;
  let deathmarked = false, shielded = false;
  if (lane.status.deathmark){ dmg += 10; delete lane.status.deathmark; deathmarked = true; }
  if (lane.status.shield){ dmg *= 0.5; delete lane.status.shield; shielded = true; }
  dmg *= (1 - lane.damageReduction);
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

// Poison: stacks (capped) on repeat application, hits for 2x its current
// stack count each tick, then fades by 1 stack -- distinct from Bleed's
// fixed-length DOT, it front-loads damage and tapers off.
const POISON_STACK = 3;
const POISON_CAP = 9;
function applyPoison(lane){
  lane.status.poison = Math.min(POISON_CAP, (lane.status.poison || 0) + POISON_STACK);
}

function tickPoison(lane){
  if (lane.status.poison && lane.status.poison > 0){
    const dmg = lane.status.poison * 2;
    lane.hp = Math.max(0, lane.hp - dmg);
    lane.status.poison -= 1;
    if (lane.status.poison <= 0) delete lane.status.poison;
    if (lane.hp <= 0) lane.alive = false;
    return dmg;
  }
  return 0;
}

// Heal/shield strength scales with the caster's MP stat -- an Axie built
// with heal cards is genuinely a better healer than one that just happens
// to carry a single borrowed heal card.
function applyHeal(lane, amount, casterLane){
  const scaled = Math.round(amount * (casterLane.mp / BASE_MP));
  const before = lane.hp;
  lane.hp = Math.min(lane.maxHp, lane.hp + scaled);
  return lane.hp - before;
}

function applyShield(lane, cleanse){
  lane.status.shield = true;
  if (cleanse){ delete lane.status.bleed; delete lane.status.deathmark; }
}

// Applies one card's effect and mutates state. `targetIndex` is required
// for attack cards (the player or AI already picked it -- see
// getLegalTargets/pickAutoTarget); defense/heal cards ignore it and always
// act on the caster's own lane. Returns a result descriptor used by main.js
// to drive floating-text/shake feedback.
export function resolveCard(state, side, card, casterIndex, targetIndex){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const result = {
    side, card, casterIndex, targetIndex: -1, dmg: 0, healed: 0,
    ambush: false, shielded: false, deathmarked: false, comboBonus: 0,
  };

  if (card.role === 'defense'){
    applyShield(casterLane, card.effect === 'shield_cleanse');
    result.targetIndex = casterIndex;
    return result;
  }
  if (card.role === 'heal'){
    result.healed = applyHeal(casterLane, card.heal, casterLane);
    result.targetIndex = casterIndex;
    return result;
  }

  if (targetIndex == null || targetIndex < 0 || !enemyLanes[targetIndex] || !enemyLanes[targetIndex].alive) return result;
  const targetLane = enemyLanes[targetIndex];

  const ambush = !state.firstHitDone && card.effect === 'ambush';
  const dmgToApply = card.dmg * (ambush ? 2 : 1);
  const { dmg, deathmarked, shielded } = applyDamage(targetLane, dmgToApply, card.cls, casterLane);
  if (dmg > 0) state.firstHitDone = true;
  if (card.effect === 'bleed') applyBleed(targetLane);
  if (card.effect === 'poison') applyPoison(targetLane);
  if (card.effect === 'deathmark') targetLane.status.deathmark = true;

  Object.assign(result, { targetIndex, dmg, ambush, deathmarked, shielded });

  if (card.effect === 'multi' && targetLane.alive){
    const bonus = Math.round(card.dmg * 0.5 * casterLane.powerMult);
    targetLane.hp = Math.max(0, targetLane.hp - bonus);
    if (targetLane.hp <= 0) targetLane.alive = false;
    result.comboBonus = bonus;
  }

  checkGameOver(state);
  return result;
}

export function playerPlayCard(state, card, targetIndex){
  const casterIndex = card.laneIndex;
  state.energyYou -= card.cost;
  if (card.effect !== 'retain'){
    state.hand = state.hand.filter(c => c !== card);
    state.discard.push(card);
    drawCard(state);
  }
  return resolveCard(state, 'you', card, casterIndex, targetIndex);
}

function tickStatuses(lanes){
  const results = [];
  lanes.filter(l => l.alive).forEach(l => {
    const bleedDmg = tickBleed(l);
    if (bleedDmg > 0) results.push({ lane: l, dmg: bleedDmg, kind: 'bleed' });
    const poisonDmg = tickPoison(l);
    if (poisonDmg > 0) results.push({ lane: l, dmg: poisonDmg, kind: 'poison' });
  });
  return results;
}

export function startYourTurn(state){
  const bleedResults = tickStatuses(state.youLanes);
  checkGameOver(state);
  if (state.gameOver) return bleedResults;
  state.energyYou = Math.min(MAX_ENERGY, state.energyYou + 2);
  state.turn = 'you';
  state.movedThisTurn = false;
  cullDeadHand(state);
  return bleedResults;
}

export function startRivalPrep(state){
  const bleedResults = tickStatuses(state.rivalLanes);
  checkGameOver(state);
  if (!state.gameOver) state.energyRival = Math.min(MAX_ENERGY, state.energyRival + 2);
  return bleedResults;
}

export function checkGameOver(state){
  const youTank = state.youLanes.find(l => l.isTank);
  const rivalTank = state.rivalLanes.find(l => l.isTank);
  const youDead = !youTank || !youTank.alive;
  const rivalDead = !rivalTank || !rivalTank.alive;
  if (youDead || rivalDead){
    state.gameOver = true;
    state.turn = 'over';
    state.winner = (youDead && rivalDead) ? 'draw' : (rivalDead ? 'you' : 'rival');
  }
}
