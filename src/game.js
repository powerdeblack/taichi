// Core board-duel rules: a real-time (not turn-based) 5-Axie squad per
// side. Each lane has TWO independent identities: its `classId` (species --
// Beast/Aqua/Plant/Bird/Bug/Reptile, purely biological: 3D model, portrait
// color, class-triangle damage bonus) and its `setId` (card set -- Warrior/
// Priest/Mage/Ranger/Rogue/Shaman, purely functional: which attack/defense/
// heal cards its loadout actually draws from, see cards.js buildLoadout).
// A lane's power/toughness/heal-strength is computed from its own 5-card
// loadout's attack/defense/heal COUNTS (see cards.js computeLaneStats), not
// from a fixed role. Status effects: Bleed, Poison, Deathmark, Retain,
// Guard/Bulwark/Barrier/Dodge/Thorns (defense), instant Heal/Regeneration
// (heal), Ambush, the arrow-rain combo.
// Both sides regenerate energy continuously and can play any affordable
// card at any time -- there's no turn handoff; the rival AI just acts on
// its own timer (see ai.js). Targeting is manual: attack cards reach any
// enemy within the card's range (RANGE, real board distance -- see
// worldPos); defense/
// heal cards can go on any living lane on EITHER side (see
// getSupportTargets) -- an ally gets the card's normal effect, an enemy
// gets its reversed form instead. Every lane has a `localPos` ({x,z}, in
// the same local space as FORMATION_XZ); the Tank roams the arena freely
// and continuously (see moveSquadWithTank), and the other 2 lanes escort
// it, keeping their formation offset relative to wherever the Tank
// currently stands, anywhere inside the arena. `col` (the formation slot)
// only changes via the discrete moveLane swap (cooldown-gated). Win condition:
// a team loses the instant its designated Tank lane dies.
import { axieById, setById, classMultiplier, shuffle, buildLoadout, computeLaneStats, LOADOUT_SIZE, BASE_HP, BASE_MP } from './cards.js';

export const MAX_ENERGY = 10;
export const HAND_SIZE = 3;
export const SQUAD_SIZE = 3;
export { LOADOUT_SIZE };

// Formation slots, col 0..2: the Tank always starts at 0 (center); 1/2
// flank it left/right, both at the front line (closest to the enemy and
// to the Tank's own taunt radius) -- a 3-Axie squad has no back line.
// board3d.js's FORMATION mirrors these exact numbers for the 3D layout --
// keep the two in sync if you tune one.
export const FORMATION_XZ = [
  { x: 0,     z: 0 },
  { x: -1.05, z: 0.65 },
  { x: 1.05,  z: 0.65 },
];

// The Tank always starts in the center formation slot (col 0); everyone
// else fills the surrounding slots in pick order. `classId` (species)
// drives name/color/visuals; `setId` (card set) drives the actual cardPool.
function createLanes(picks){
  let nextCol = 1;
  return picks.map(({ classId, setId, isTank, evolved, counts }) => {
    const axie = axieById(classId);
    const stats = computeLaneStats(counts, evolved);
    const col = isTank ? 0 : nextCol++;
    return {
      classId, setId, isTank, evolved: !!evolved, counts, name: axie.name, color: axie.color,
      maxHp: stats.maxHp, hp: stats.maxHp, mp: stats.mp,
      powerMult: stats.powerMult, damageReduction: stats.damageReduction,
      status: {}, alive: true, col, localPos: { ...FORMATION_XZ[col] },
      cardPool: buildLoadout(setId, classId, counts),
    };
  });
}

function buildDeck(picks){
  const lanes = createLanes(picks);
  return lanes.flatMap((lane, laneIndex) => {
    const set = setById(lane.setId);
    return lane.cardPool.map(c => ({
      ...c, cls: lane.classId, laneIndex, color: lane.color,
      setId: lane.setId, setName: set.name, setIcon: set.icon,
      uid: `${lane.classId}:${lane.setId}:${c.id}:${laneIndex}:${Math.random()}`,
    }));
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

// World layout -- board3d.js imports these same numbers for rendering, so
// rules and visuals share one coordinate system. Each side's lanes store a
// `localPos` in their own facing space (+z = toward the enemy); worldPos()
// turns it into real board coordinates, which is what every distance rule
// below (range, taunt, arena bounds) measures. Comparing the two sides'
// local positions directly would be mirrored: walking toward the enemy
// would look like walking away.
export const ROW_Z = { you: 1.5, rival: -1.5 };
export function worldPos(side, lane){
  const faceSign = side === 'you' ? -1 : 1;
  return { x: lane.localPos.x, z: ROW_Z[side] + faceSign * lane.localPos.z };
}
function localFromWorld(side, w){
  const faceSign = side === 'you' ? -1 : 1;
  return { x: w.x, z: (w.z - ROW_Z[side]) * faceSign };
}
function dist(a, b){ return Math.hypot(a.x - b.x, a.z - b.z); }
const other = side => side === 'you' ? 'rival' : 'you';
const lanesOf = (state, side) => side === 'you' ? state.youLanes : state.rivalLanes;

// Attack reach in world units. Short range is roughly "touching distance"
// (the two front lines start ~1.7 apart); long range covers most of the
// arena but not all of it, so positioning still matters for every card.
export const RANGE = { short: 2.3, long: 6.0 };
export function cardRange(card){
  return RANGE[card.range] ?? null;
}

// The Tank "taunts" -- any attacker standing within this distance of the
// enemy Tank is forced to hit it instead of picking freely, like the real
// Origin Taunt card. Measured against the Tank's live position, so roaming
// the Tank forward shields its allies by pulling attackers onto itself.
export const TAUNT_RADIUS = 1.8;

export function distanceBetween(state, sideA, indexA, sideB, indexB){
  return dist(worldPos(sideA, lanesOf(state, sideA)[indexA]), worldPos(sideB, lanesOf(state, sideB)[indexB]));
}

// If the caster stands inside the enemy Tank's taunt radius, returns that
// Tank's index (the only legal attack target); otherwise -1.
export function tauntedBy(state, side, casterIndex){
  const enemySide = other(side);
  const enemyLanes = lanesOf(state, enemySide);
  const tankIdx = enemyLanes.findIndex(l => l.isTank && l.alive);
  if (tankIdx === -1) return -1;
  return distanceBetween(state, side, casterIndex, enemySide, tankIdx) <= TAUNT_RADIUS ? tankIdx : -1;
}

// Legal enemy targets for an attack card right now: every alive enemy
// within the card's range of the caster -- or only the enemy Tank if the
// caster is being taunted.
export function getLegalTargets(state, side, card, casterIndex){
  const range = cardRange(card);
  if (range == null) return [];
  const taunt = tauntedBy(state, side, casterIndex);
  if (taunt !== -1) return [taunt];
  const enemySide = other(side);
  return aliveIndices(lanesOf(state, enemySide))
    .filter(i => distanceBetween(state, side, casterIndex, enemySide, i) <= range);
}

// Legal targets for a defense/heal card: any of your own alive lanes
// (normal effect) plus any alive enemy lane (reversed effect -- see
// resolveCard). The player can shield/heal an ally, or turn the same card
// into a debuff/damage on an enemy, matching the real Origin "Reverse
// Heal" pattern. Support cards aren't range-limited.
export function getSupportTargets(state, side){
  const enemySide = other(side);
  const own = aliveIndices(lanesOf(state, side)).map(laneIndex => ({ side, laneIndex, reversed: false }));
  const enemy = aliveIndices(lanesOf(state, enemySide)).map(laneIndex => ({ side: enemySide, laneIndex, reversed: true }));
  return [...own, ...enemy];
}

// Nearest alive enemy to a caster, ignoring range (-1 if none) -- the
// default aim when the player hasn't picked an enemy.
export function nearestEnemy(state, side, casterIndex){
  const enemySide = other(side);
  let best = -1, bestD = Infinity;
  aliveIndices(lanesOf(state, enemySide)).forEach(i => {
    const d = distanceBetween(state, side, casterIndex, enemySide, i);
    if (d < bestD){ bestD = d; best = i; }
  });
  return best;
}

// The rival AI's automatic choice: short range hits the nearest legal
// enemy, long range the legal enemy with the least HP.
export function pickAutoTarget(state, side, card, casterIndex){
  const legal = getLegalTargets(state, side, card, casterIndex);
  if (!legal.length) return -1;
  const enemySide = other(side);
  const enemyLanes = lanesOf(state, enemySide);
  if (card.range === 'long'){
    return legal.reduce((best, i) => (enemyLanes[i].hp < enemyLanes[best].hp ? i : best), legal[0]);
  }
  return legal.reduce((best, i) =>
    distanceBetween(state, side, casterIndex, enemySide, i) < distanceBetween(state, side, casterIndex, enemySide, best) ? i : best, legal[0]);
}

// A squad moves as one block around an "anchor" (the formation center):
// each lane stands at anchor + FORMATION_XZ[its col]. The anchor is
// derived from wherever the Tank stands, so nothing extra is stored.
function squadAnchor(lanes){
  const tank = lanes.find(l => l.isTank && l.alive) || lanes.find(l => l.alive);
  if (!tank) return { x: 0, z: 0 };
  const off = FORMATION_XZ[tank.col];
  return { x: tank.localPos.x - off.x, z: tank.localPos.z - off.z };
}
function placeSquad(lanes, anchor){
  lanes.forEach(lane => {
    const off = FORMATION_XZ[lane.col];
    lane.localPos = { x: anchor.x + off.x, z: anchor.z + off.z };
  });
}

// Swaps two of a side's own lanes' formation slots, keeping the squad
// wherever it currently stands. Cooldown-gated (4s) for the player.
export const MOVE_COOLDOWN_SEC = 4;
export function moveLane(state, side, sourceIndex, destIndex){
  if (side === 'you' && state.moveCooldown > 0) return false;
  const lanes = lanesOf(state, side);
  const src = lanes[sourceIndex], dest = lanes[destIndex];
  if (!src || !dest || sourceIndex === destIndex || !src.alive) return false;
  const anchor = squadAnchor(lanes);
  const tmp = src.col; src.col = dest.col; dest.col = tmp;
  placeSquad(lanes, anchor);
  if (side === 'you') state.moveCooldown = MOVE_COOLDOWN_SEC;
  return true;
}

export function tickMoveCooldown(state, dt){
  if (state.moveCooldown > 0) state.moveCooldown = Math.max(0, state.moveCooldown - dt);
}

// The joystick (and the rival's wander): moves the whole squad by (dx,dz)
// in its own facing space. The squad center can go anywhere inside the
// arena circle (the whole snowfield in view, both halves), but no Axie can
// walk through an enemy -- the squad is pushed back to MIN_SEPARATION.
// Squad-center bounds in world units: wide left/right, and a shallower
// limit toward the camera so your own squad never walks under the HUD.
export const ARENA = { xMin: -4.4, xMax: 4.4, zMin: -3.6, zMax: 2.6 };
export const MIN_SEPARATION = 0.9;
export function moveSquadWithTank(state, side, dx, dz){
  const lanes = lanesOf(state, side);
  const tank = lanes.find(l => l.isTank && l.alive);
  if (!tank) return;
  const anchor = squadAnchor(lanes);
  anchor.x += dx; anchor.z += dz;
  let w = worldPos(side, { localPos: anchor });
  w.x = Math.min(ARENA.xMax, Math.max(ARENA.xMin, w.x));
  w.z = Math.min(ARENA.zMax, Math.max(ARENA.zMin, w.z));

  // No Axie of this squad can walk through an enemy Axie: push the whole
  // squad back until every pair is at least MIN_SEPARATION apart.
  const enemySide = other(side);
  const enemies = lanesOf(state, enemySide).filter(e => e.alive).map(e => worldPos(enemySide, e));
  for (let pass = 0; pass < 3; pass++){
    const a = localFromWorld(side, w);
    lanes.forEach(lane => {
      if (!lane.alive) return;
      const off = FORMATION_XZ[lane.col];
      const lw = worldPos(side, { localPos: { x: a.x + off.x, z: a.z + off.z } });
      enemies.forEach(ew => {
        const d = dist(lw, ew);
        if (d < MIN_SEPARATION && d > 1e-4){
          const push = (MIN_SEPARATION - d) / d;
          w = { x: w.x + (lw.x - ew.x) * push, z: w.z + (lw.z - ew.z) * push };
        }
      });
    });
  }
  placeSquad(lanes, localFromWorld(side, w));
}

const BULWARK_REDUCTION = 0.25;
const VULNERABLE_BONUS = 0.3;

// Dodge is checked FIRST and short-circuits everything else: a dodged hit
// deals 0 damage and doesn't consume shield/bulwark/vulnerable or trigger
// Thorns -- a true miss, not a mitigated hit. Barrier (a flat absorb pool)
// is applied last, against the fully-mitigated final number. Thorns
// reflects a % of that same final number back onto whoever landed the hit
// (`casterLane`) -- which can kill an attacker that hits a thorned target
// with a lethal blow of their own, so callers must checkGameOver after.
function applyDamage(lane, amount, attackerClassId, casterLane){
  const mult = classMultiplier(attackerClassId, lane.classId);
  let dmg = amount * mult * casterLane.powerMult;
  let deathmarked = false, shielded = false, bulwarked = false, dodged = false, thornReflected = 0;

  if (lane.status.dodgeCharges && lane.status.dodgeCharges > 0){
    const chance = lane.status.dodgeChance != null ? lane.status.dodgeChance : 1;
    lane.status.dodgeCharges -= 1;
    if (lane.status.dodgeCharges <= 0){ delete lane.status.dodgeCharges; delete lane.status.dodgeChance; }
    if (Math.random() < chance){
      return { dmg: 0, deathmarked, shielded, bulwarked, dodged: true, thornReflected: 0 };
    }
  }

  if (lane.status.deathmark){ dmg += 10; delete lane.status.deathmark; deathmarked = true; }
  if (lane.status.shield){ dmg *= 0.5; delete lane.status.shield; shielded = true; }
  if (lane.status.bulwark && lane.status.bulwark > 0){
    dmg *= (1 - BULWARK_REDUCTION);
    lane.status.bulwark -= 1;
    if (lane.status.bulwark <= 0) delete lane.status.bulwark;
    bulwarked = true;
  }
  if (lane.status.vulnerable && lane.status.vulnerable > 0){
    dmg *= (1 + VULNERABLE_BONUS);
    lane.status.vulnerable -= 1;
    if (lane.status.vulnerable <= 0) delete lane.status.vulnerable;
  }
  dmg *= (1 - lane.damageReduction);
  dmg = Math.max(0, Math.round(dmg));

  if (lane.status.barrier && lane.status.barrier > 0){
    const absorbed = Math.min(dmg, lane.status.barrier);
    dmg -= absorbed;
    lane.status.barrier -= absorbed;
    if (lane.status.barrier <= 0) delete lane.status.barrier;
  }

  lane.hp = Math.max(0, lane.hp - dmg);
  if (lane.hp <= 0) lane.alive = false;

  if (lane.status.thornsHits && lane.status.thornsHits > 0 && dmg > 0){
    const pct = lane.status.thornsPct != null ? lane.status.thornsPct : 0.4;
    thornReflected = Math.round(dmg * pct);
    lane.status.thornsHits -= 1;
    if (lane.status.thornsHits <= 0){ delete lane.status.thornsHits; delete lane.status.thornsPct; }
    if (thornReflected > 0){
      casterLane.hp = Math.max(0, casterLane.hp - thornReflected);
      if (casterLane.hp <= 0) casterLane.alive = false;
    }
  }

  return { dmg, deathmarked, shielded, bulwarked, dodged, thornReflected };
}

// Bleed: each hit adds a stack (max 3) and refreshes the duration to 3
// ticks; every tick deals 4 per stack. One cut is a light DOT, repeated
// cuts on the same target (the Bleed archetype) snowball.
const BLEED_PER_STACK = 4;
const BLEED_CAP = 3;
const BLEED_TICKS = 3;
function applyBleed(lane){
  lane.status.bleed = Math.min(BLEED_CAP, (lane.status.bleed || 0) + 1);
  lane.status.bleedTicks = BLEED_TICKS;
}

function tickBleed(lane){
  if (lane.status.bleed && lane.status.bleed > 0){
    const dmg = BLEED_PER_STACK * lane.status.bleed;
    lane.hp = Math.max(0, lane.hp - dmg);
    lane.status.bleedTicks -= 1;
    if (lane.status.bleedTicks <= 0){ delete lane.status.bleed; delete lane.status.bleedTicks; }
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

// Guard: a plain 50%-off shield for the next hit -- unchanged from before,
// still the base for Ornitorrinco's normal (non-reversed) effect.
function applyShield(lane){
  lane.status.shield = true;
}

const BULWARK_HITS = 2;
const VULNERABLE_HITS = 2;

// Bulwark: Guardião Tropical's normal effect after its cleanse -- reduces
// the next BULWARK_HITS hits by BULWARK_REDUCTION each (see applyDamage).
function applyBulwark(lane, hits = BULWARK_HITS){
  lane.status.bulwark = Math.max(lane.status.bulwark || 0, hits);
}

// Vulnerable: the reversed form of Guard/Cleanse cast on an enemy -- a
// debuff that INCREASES the next VULNERABLE_HITS hits it takes, instead of
// reducing them.
function applyVulnerable(lane, hits = VULNERABLE_HITS){
  lane.status.vulnerable = Math.max(lane.status.vulnerable || 0, hits);
}

// Barrier: a flat absorb pool that eats incoming damage (post-mitigation)
// no matter how many hits it takes to burn through, instead of reducing a
// fixed number of hits by a percentage. Stacks additively if reapplied.
function applyBarrier(lane, amount){
  lane.status.barrier = (lane.status.barrier || 0) + amount;
}

// Dodge: a chance (0..1) to fully negate each of the next `charges` hits
// taken -- a total miss, not a mitigated one (see applyDamage). 100%
// chance + 1 charge is a guaranteed single dodge (Cortina de Fumaça); lower
// chance + more charges is a probabilistic multi-hit evasion (Reflexos
// Ágeis).
function applyDodge(lane, charges, chance){
  lane.status.dodgeCharges = Math.max(lane.status.dodgeCharges || 0, charges);
  lane.status.dodgeChance = chance;
}

// Thorns: reflects a % of the damage from the next `hits` taken back onto
// whoever landed them (see applyDamage) -- retaliation instead of
// mitigation, the defender still takes full damage.
function applyThorns(lane, hits, pct){
  lane.status.thornsHits = Math.max(lane.status.thornsHits || 0, hits);
  lane.status.thornsPct = pct;
}

// Cleanse: strips the DOTs/debuffs Guardião Tropical is meant to counter.
function applyGuardianCleanse(lane){
  delete lane.status.bleed;
  delete lane.status.bleedTicks;
  delete lane.status.poison;
  delete lane.status.deathmark;
}

// Regeneration: Trevo's normal effect -- heals a flat MP-scaled amount each
// STATUS_TICK_INTERVAL tick for `ticks` ticks (see tickRegen).
const REGEN_HEAL_PER_TICK = 8;
function applyRegen(lane, ticks){
  lane.status.regen = Math.max(lane.status.regen || 0, ticks);
}

function tickRegen(lane, casterLane){
  if (lane.status.regen && lane.status.regen > 0){
    const healed = applyHeal(lane, REGEN_HEAL_PER_TICK, casterLane || lane);
    lane.status.regen -= 1;
    if (lane.status.regen <= 0) delete lane.status.regen;
    return healed;
  }
  return 0;
}

// Poison-equivalent DOT used by Trevo's reversed (enemy-cast) form: same
// shape as applyPoison/tickPoison but stored separately so it doesn't
// interact with the class's normal Poison stacking/cap.
const REGEN_ROT_PER_TICK = 8;
function applyRegenRot(lane, ticks){
  lane.status.regenRot = Math.max(lane.status.regenRot || 0, ticks);
}

function tickRegenRot(lane){
  if (lane.status.regenRot && lane.status.regenRot > 0){
    const dmg = REGEN_ROT_PER_TICK;
    lane.hp = Math.max(0, lane.hp - dmg);
    lane.status.regenRot -= 1;
    if (lane.status.regenRot <= 0) delete lane.status.regenRot;
    if (lane.hp <= 0) lane.alive = false;
    return dmg;
  }
  return 0;
}

// Applies one card's effect and mutates state. `targetIndex`/`targetSide`
// matter for every card now: attack cards always hit the enemy side (as
// before); defense/heal cards can go on any alive lane on EITHER side --
// `targetSide === side` (or omitted, defaulting to the caster's own side)
// applies the card's normal ally effect, `targetSide` being the other side
// applies its reversed form instead (Guard/Bulwark -> Vulnerable, instant
// Heal -> instant damage, Regen -> a matching DOT), matching the real
// Origin "Reverse Heal" pattern. Returns a result descriptor used by
// main.js to drive floating-text/shake feedback.
function baseResult(side, card, casterIndex){
  return {
    side, card, casterIndex, targetIndex: -1, targetSide: side, reversed: false,
    dmg: 0, healed: 0, missed: false,
    ambush: false, shielded: false, deathmarked: false, bulwarked: false,
    barrierApplied: false, dodgeApplied: false, thornsApplied: false,
    dodged: false, thornReflected: 0, comboBonus: 0,
  };
}

export function resolveCard(state, side, card, casterIndex, targetIndex, targetSide){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const result = baseResult(side, card, casterIndex);

  if (card.role === 'defense' || card.role === 'heal'){
    const finalSide = targetSide || side;
    const reversed = finalSide !== side;
    const supportLanes = finalSide === 'you' ? state.youLanes : state.rivalLanes;
    const finalIndex = (targetIndex != null && targetIndex >= 0 && supportLanes[targetIndex] && supportLanes[targetIndex].alive)
      ? targetIndex : casterIndex;
    const targetLane = supportLanes[finalIndex];
    if (!targetLane || !targetLane.alive) return result;
    result.targetIndex = finalIndex;
    result.targetSide = finalSide;
    result.reversed = reversed;

    if (card.role === 'defense'){
      if (!reversed){
        switch (card.effect){
          case 'bulwark_cleanse':
            applyGuardianCleanse(targetLane);
            applyBulwark(targetLane, card.hits || BULWARK_HITS);
            result.bulwarked = true;
            break;
          case 'bulwark':
            applyBulwark(targetLane, card.hits || BULWARK_HITS);
            result.bulwarked = true;
            break;
          case 'barrier':
            applyBarrier(targetLane, card.amount || 20);
            result.barrierApplied = true;
            break;
          case 'dodge':
            applyDodge(targetLane, card.charges || 1, card.chance != null ? card.chance : 1);
            result.dodgeApplied = true;
            break;
          case 'thorns':
            applyThorns(targetLane, card.hits || 2, card.pct != null ? card.pct : 0.4);
            result.thornsApplied = true;
            break;
          default:
            applyShield(targetLane);
            result.shielded = true;
        }
      } else {
        applyVulnerable(targetLane);
      }
      checkGameOver(state);
      return result;
    }

    // heal role
    if (!reversed){
      if (card.effect === 'regen') applyRegen(targetLane, card.regenTicks || 3);
      else result.healed = applyHeal(targetLane, card.heal, casterLane);
    } else {
      if (card.effect === 'regen') applyRegenRot(targetLane, card.regenTicks || 3);
      else {
        const { dmg } = applyDamage(targetLane, card.heal, card.cls, casterLane);
        result.dmg = dmg;
        if (dmg > 0) state.firstHitDone = true;
      }
    }
    checkGameOver(state);
    return result;
  }

  if (targetIndex == null || targetIndex < 0 || !enemyLanes[targetIndex] || !enemyLanes[targetIndex].alive) return result;
  const targetLane = enemyLanes[targetIndex];
  result.targetSide = side === 'you' ? 'rival' : 'you';

  const ambush = !state.firstHitDone && card.effect === 'ambush';
  const dmgToApply = card.dmg * (ambush ? 2 : 1);
  const { dmg, deathmarked, shielded, bulwarked, dodged, thornReflected } = applyDamage(targetLane, dmgToApply, card.cls, casterLane);
  if (dmg > 0) state.firstHitDone = true;
  if (card.effect === 'bleed' && !dodged) applyBleed(targetLane);
  if (card.effect === 'poison' && !dodged) applyPoison(targetLane);
  if (card.effect === 'deathmark' && !dodged) targetLane.status.deathmark = true;

  Object.assign(result, { targetIndex, dmg, ambush, deathmarked, shielded, bulwarked, dodged, thornReflected });

  if (card.effect === 'multi' && targetLane.alive && !dodged){
    const bonus = Math.round(card.dmg * 0.5 * casterLane.powerMult);
    targetLane.hp = Math.max(0, targetLane.hp - bonus);
    if (targetLane.hp <= 0) targetLane.alive = false;
    result.comboBonus = bonus;
  }

  checkGameOver(state);
  return result;
}

// Plays a card from the player's hand. The card is spent either way; an
// attack whose aimed enemy is outside the card's range at the moment it's
// released simply misses (result.missed) -- the range ring shown while the
// card is held is the warning. A taunted caster always swings at the Tank.
export function playerPlayCard(state, card, targetIndex, targetSide){
  const casterIndex = card.laneIndex;
  state.energyYou -= card.cost;
  if (card.effect !== 'retain'){
    state.hand = state.hand.filter(c => c !== card);
    state.discard.push(card);
    drawCard(state);
  }
  if (card.role === 'attack'){
    const taunt = tauntedBy(state, 'you', casterIndex);
    const aim = taunt !== -1 ? taunt : targetIndex;
    if (aim < 0 || !getLegalTargets(state, 'you', card, casterIndex).includes(aim)){
      const miss = baseResult('you', card, casterIndex);
      return Object.assign(miss, { missed: true, targetIndex: aim, targetSide: 'rival' });
    }
    return resolveCard(state, 'you', card, casterIndex, aim);
  }
  return resolveCard(state, 'you', card, casterIndex, targetIndex, targetSide);
}

function tickStatuses(lanes){
  const results = [];
  lanes.filter(l => l.alive).forEach(l => {
    const bleedDmg = tickBleed(l);
    if (bleedDmg > 0) results.push({ lane: l, dmg: bleedDmg, kind: 'bleed' });
    const poisonDmg = tickPoison(l);
    if (poisonDmg > 0) results.push({ lane: l, dmg: poisonDmg, kind: 'poison' });
    const regenRotDmg = tickRegenRot(l);
    if (regenRotDmg > 0) results.push({ lane: l, dmg: regenRotDmg, kind: 'regenRot' });
    const regenHeal = tickRegen(l);
    if (regenHeal > 0) results.push({ lane: l, dmg: regenHeal, kind: 'regen' });
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
