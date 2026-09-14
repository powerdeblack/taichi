// Core board-duel rules: a real-time (not turn-based) 5-Axie squad per
// side, each Axie's power/toughness/heal-strength computed from its own
// 5-card loadout (attack/defense/heal counts -- see cards.js
// computeLaneStats), the classic class triangle, and status effects
// (Bleed, Deathmark, Retain, Shield/Cleanse, Ambush, the Pena combo).
// Both sides regenerate energy continuously and can play any affordable
// card at any time -- there's no turn handoff; the rival AI just acts on
// its own timer (see ai.js). Targeting is manual: the player picks which
// enemy to hit among the legal targets for that card's range ('short' can
// only reach an enemy sharing your board column, 'long' can reach anyone
// alive); 'own' support cards act on the caster's own lane. Every lane has
// a `localPos` ({x,z}, in the same local space as FORMATION_XZ) -- for
// non-Tank lanes it's just derived from their `col` slot and only changes
// via the discrete moveLane swap (cooldown-gated); the Tank instead roams
// that space freely and continuously (see moveTankFreely), which is what
// the taunt radius below actually measures. Win condition: a team loses
// the instant its designated Tank lane dies.
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

// Formation slots, col 0..4: the Tank always starts at 0 (center); 1/2 are
// the front line either side of it (closest to the enemy and to the
// Tank's taunt radius), 3/4 are the back line (farther back, safer).
// board3d.js's FORMATION mirrors these exact numbers for the 3D layout --
// keep the two in sync if you tune one.
export const FORMATION_XZ = [
  { x: 0,     z: 0 },
  { x: -1.05, z: 0.65 },
  { x: 1.05,  z: 0.65 },
  { x: -0.6,  z: -0.7 },
  { x: 0.6,   z: -0.7 },
];

// The Tank always starts in the center formation slot (col 0); everyone
// else fills the 4 surrounding slots in pick order.
function createLanes(picks){
  let nextCol = 1;
  return picks.map(({ classId, isTank, evolved, counts }) => {
    const axie = axieById(classId);
    const stats = computeLaneStats(counts, evolved);
    const col = isTank ? 0 : nextCol++;
    return {
      classId, isTank, evolved: !!evolved, counts, name: axie.name, color: axie.color,
      maxHp: stats.maxHp, hp: stats.maxHp, mp: stats.mp,
      powerMult: stats.powerMult, damageReduction: stats.damageReduction,
      status: {}, alive: true, col, localPos: { ...FORMATION_XZ[col] },
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
    moveCooldown: 0,
    statusTimer: 0,
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

export function cullDeadHand(state){
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

function localPosOf(lane){
  return lane.isTank ? lane.localPos : FORMATION_XZ[lane.col];
}

// The Tank "taunts" -- any attacker whose position is within this local-
// space radius of the Tank is forced to hit it instead of picking freely,
// regardless of the card's range. Mirrors the real Origin Taunt/"Provocar"
// card: the Tank soaks hits for whoever's standing near it. Since the Tank
// can now roam continuously (see moveTankFreely), this is a real distance
// check against its live position, not a fixed-slot lookup.
export const TAUNT_RADIUS = 1.15;

// Legal enemy targets for an attack card. If the caster is within the
// enemy Tank's taunt radius, the Tank is the ONLY legal target. Otherwise:
// 'short' can only reach a non-Tank enemy sharing the caster's board
// column (falls back to any alive enemy if nobody's there -- e.g. that
// column's Axie already died, or the only option left is a roaming Tank
// outside taunt range); 'long' can reach any alive enemy. The player
// picks among these; see pickAutoTarget for the rival AI's automatic
// choice (which goes through this same taunt check).
export function getLegalTargets(state, side, card, casterIndex){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const alive = aliveIndices(enemyLanes);

  const tankIdx = enemyLanes.findIndex(l => l.isTank && l.alive);
  if (tankIdx !== -1){
    const a = localPosOf(casterLane), b = enemyLanes[tankIdx].localPos;
    if (Math.hypot(a.x - b.x, a.z - b.z) <= TAUNT_RADIUS) return [tankIdx];
  }

  if (card.range === 'short'){
    const sameCol = alive.filter(i => !enemyLanes[i].isTank && enemyLanes[i].col === casterLane.col);
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
// manual targeting: move a lane out of a short-range attacker's column, or
// line up your own short-range attacker on a juicy target. Cooldown-gated
// instead of once-per-turn now that there are no turns; the rival AI
// doesn't move (kept simple on purpose). Snaps both lanes' localPos back
// to their new slot's formation position -- the Tank's free-roam offset
// is reset if it gets moved this way (moveTankFreely is the live-roam
// alternative).
export const MOVE_COOLDOWN_SEC = 4;
export function moveLane(state, side, sourceIndex, destIndex){
  if (side === 'you' && state.moveCooldown > 0) return false;
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const src = lanes[sourceIndex], dest = lanes[destIndex];
  if (!src || !dest || sourceIndex === destIndex || !src.alive) return false;
  const tmp = src.col; src.col = dest.col; dest.col = tmp;
  src.localPos = { ...FORMATION_XZ[src.col] };
  dest.localPos = { ...FORMATION_XZ[dest.col] };
  if (side === 'you') state.moveCooldown = MOVE_COOLDOWN_SEC;
  return true;
}

export function tickMoveCooldown(state, dt){
  if (state.moveCooldown > 0) state.moveCooldown = Math.max(0, state.moveCooldown - dt);
}

// The Tank's dedicated free-roam control (the joystick): nudges it by
// (dx,dz) in local space, clamped to a radius around the formation center
// so it can't wander into the enemy's half of the board. Unlike moveLane
// this has no cooldown -- it's continuous positioning, not a discrete
// action -- and only ever targets whichever lane is marked Tank.
export const TANK_ROAM_RADIUS = 1.6;
export function moveTankFreely(state, side, dx, dz){
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const tank = lanes.find(l => l.isTank && l.alive);
  if (!tank) return;
  let x = tank.localPos.x + dx, z = tank.localPos.z + dz;
  const dist = Math.hypot(x, z);
  if (dist > TANK_ROAM_RADIUS){
    const s = TANK_ROAM_RADIUS / dist;
    x *= s; z *= s;
  }
  tank.localPos = { x, z };
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

// ================= Real-time ticking =================
// No more turn handoff: both sides regenerate energy continuously and
// status effects tick on a fixed interval regardless of who's "acting".
// main.js drives all of this from one requestAnimationFrame loop.
export const ENERGY_REGEN_PER_SEC = 0.6; // ~ +3 energy every 5s
export const STATUS_TICK_INTERVAL = 2; // seconds between Bleed/Poison ticks

export function tickEnergyRealtime(state, dt){
  if (state.gameOver) return;
  state.energyYou = Math.min(MAX_ENERGY, state.energyYou + ENERGY_REGEN_PER_SEC * dt);
  state.energyRival = Math.min(MAX_ENERGY, state.energyRival + ENERGY_REGEN_PER_SEC * dt);
}

// Returns { you, rival } tick results (each an array like tickStatuses'
// output) once STATUS_TICK_INTERVAL has elapsed, else null.
export function tickStatusTimer(state, dt){
  if (state.gameOver) return null;
  state.statusTimer += dt;
  if (state.statusTimer < STATUS_TICK_INTERVAL) return null;
  state.statusTimer -= STATUS_TICK_INTERVAL;
  const you = tickStatuses(state.youLanes);
  const rival = tickStatuses(state.rivalLanes);
  checkGameOver(state);
  return { you, rival };
}

export function checkGameOver(state){
  const youTank = state.youLanes.find(l => l.isTank);
  const rivalTank = state.rivalLanes.find(l => l.isTank);
  const youDead = !youTank || !youTank.alive;
  const rivalDead = !rivalTank || !rivalTank.alive;
  if (youDead || rivalDead){
    state.gameOver = true;
    state.winner = (youDead && rivalDead) ? 'draw' : (rivalDead ? 'you' : 'rival');
  }
}
