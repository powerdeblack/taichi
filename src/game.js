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
// its own timer (see ai.js). Targeting is manual: attack cards pick among
// the legal enemy targets for that card's range ('short' can only reach an
// enemy sharing your board column, 'long' can reach anyone alive); defense/
// heal cards can go on any living lane on EITHER side (see
// getSupportTargets) -- an ally gets the card's normal effect, an enemy
// gets its reversed form instead. Every lane has a `localPos` ({x,z}, in
// the same local space as FORMATION_XZ); the Tank roams that space freely
// and continuously (see moveSquadWithTank), and the other 4 lanes escort
// it, keeping their formation offset relative to wherever the Tank
// currently stands. That live position is what the Tank's taunt radius
// measures, so the whole squad shares whatever taunt exposure roaming
// brings. `col` (the formation slot) is separate and only changes via the
// discrete moveLane swap (cooldown-gated); it's what still drives
// short-range column-matching, independent of live roaming. Win condition:
// a team loses the instant its designated Tank lane dies.
import { axieById, setById, classMultiplier, shuffle, buildLoadout, computeLaneStats, ALL_CLASSES, ALL_SETS, LOADOUT_SIZE, BASE_HP, BASE_MP } from './cards.js';

export const MAX_ENERGY = 10;
export const HAND_SIZE = 3;
export const SQUAD_SIZE = 5;
export { LOADOUT_SIZE };

// Auto-builds a valid rival squad: random species, random card set,
// random attack/defense/heal split per Axie (summing to LOADOUT_SIZE), one
// random Tank.
export function randomSquad(){
  const picks = [];
  for (let i=0; i<SQUAD_SIZE; i++){
    let a = Math.floor(Math.random()*(LOADOUT_SIZE+1));
    let d = Math.floor(Math.random()*(LOADOUT_SIZE-a+1));
    let h = LOADOUT_SIZE - a - d;
    picks.push({
      classId: ALL_CLASSES[Math.floor(Math.random()*ALL_CLASSES.length)],
      setId: ALL_SETS[Math.floor(Math.random()*ALL_SETS.length)],
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
// else fills the 4 surrounding slots in pick order. `classId` (species)
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

function localPosOf(lane){
  return lane.localPos;
}

// The Tank "taunts" -- any attacker whose position is within this local-
// space radius of the Tank is forced to hit it instead of picking freely,
// regardless of the card's range. Mirrors the real Origin Taunt/"Provocar"
// card: the Tank soaks hits for whoever's standing near it. Since the Tank
// (and its escort, see moveSquadWithTank) roam continuously, this is a
// real distance check against its live position, not a fixed-slot lookup.
export const TAUNT_RADIUS = 1.15;

// Short range needs an actual "contact radius" now that lanes really move
// around the hall (Tank roam + escort, rival wander) instead of being
// pinned to a column -- it's no longer "same column", it's "close enough
// right now". Distances are compared directly in each side's own local
// {x,z} space (the same trick TAUNT_RADIUS uses): a lane's default
// formation slot and its mirror-image enemy slot sit at the same local
// coordinates, so an untouched matchup in the same column is distance 0
// (always in range) -- moving away from that spot is what actually
// changes who's reachable.
export const SHORT_RANGE_RADIUS = 1.3;

// Legal enemy targets for an attack card. If the caster is within the
// enemy Tank's taunt radius, the Tank is the ONLY legal target. Otherwise:
// 'short' can only reach an alive enemy within SHORT_RANGE_RADIUS of the
// caster's current position (no fallback -- if nothing's close enough,
// the card simply has no target right now); 'long' can reach any alive
// enemy regardless of distance. The player picks among these; see
// pickAutoTarget for the rival AI's automatic choice (which goes through
// this same taunt check).
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
    const a = localPosOf(casterLane);
    return alive.filter(i => {
      const b = localPosOf(enemyLanes[i]);
      return Math.hypot(a.x - b.x, a.z - b.z) <= SHORT_RANGE_RADIUS;
    });
  }
  if (card.range === 'long') return alive;
  return [];
}

// Legal targets for a defense/heal card: any of your own alive lanes
// (normal effect) plus any alive enemy lane (reversed effect -- see
// resolveCard). The player can shield/heal an ally, or turn the same card
// into a debuff/damage on an enemy, matching the real Origin "Reverse
// Heal" pattern.
export function getSupportTargets(state, side){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const enemySide = side === 'you' ? 'rival' : 'you';
  const own = aliveIndices(ownLanes).map(laneIndex => ({ side, laneIndex, reversed: false }));
  const enemy = aliveIndices(enemyLanes).map(laneIndex => ({ side: enemySide, laneIndex, reversed: true }));
  return [...own, ...enemy];
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

// Swaps two of a side's own lanes' board columns -- repositions a lane
// relative to wherever its own Tank currently stands (see moveSquadWithTank),
// which changes who's within SHORT_RANGE_RADIUS of it. Cooldown-gated
// instead of once-per-turn now that there are no turns; the rival AI
// doesn't use this discrete swap (it wanders its whole Tank+escort
// instead, kept simple on purpose). Snaps the Tank itself back to the raw
// formation slot if it's the one being moved this way, losing its live
// roam offset.
export const MOVE_COOLDOWN_SEC = 4;
export function moveLane(state, side, sourceIndex, destIndex){
  if (side === 'you' && state.moveCooldown > 0) return false;
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const src = lanes[sourceIndex], dest = lanes[destIndex];
  if (!src || !dest || sourceIndex === destIndex || !src.alive) return false;
  const tmp = src.col; src.col = dest.col; dest.col = tmp;
  // Whichever lane isn't the Tank gets anchored to wherever the Tank
  // currently stands (it may have roamed away from the origin) instead of
  // the raw formation slot, so it stays part of the escort instead of
  // snapping back to a stale absolute position -- see moveSquadWithTank.
  const tank = lanes.find(l => l.isTank && l.alive);
  const anchor = tank ? tank.localPos : { x: 0, z: 0 };
  [src, dest].forEach(lane => {
    lane.localPos = lane.isTank
      ? { ...FORMATION_XZ[lane.col] }
      : { x: anchor.x + FORMATION_XZ[lane.col].x, z: anchor.z + FORMATION_XZ[lane.col].z };
  });
  if (side === 'you') state.moveCooldown = MOVE_COOLDOWN_SEC;
  return true;
}

export function tickMoveCooldown(state, dt){
  if (state.moveCooldown > 0) state.moveCooldown = Math.max(0, state.moveCooldown - dt);
}

// The Tank's dedicated free-roam control (the joystick): nudges it by
// (dx,dz) in local space, clamped to a radius around the formation center
// so it can't wander into the enemy's half of the board. The other 4
// lanes aren't independently controllable -- they escort the Tank,
// keeping their original formation offset relative to wherever the Tank
// currently stands, so the whole squad advances/retreats together (and
// shares whatever taunt exposure that brings). Unlike moveLane this has no
// cooldown -- it's continuous positioning, not a discrete action -- and it
// only ever moves `localPos`, never `col` (short-range column-matching and
// the discrete move-swap stay based on col, untouched by roaming).
export const ROAM_RADIUS = 1.6;
export function moveSquadWithTank(state, side, dx, dz){
  const lanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const tank = lanes.find(l => l.isTank && l.alive);
  if (!tank) return;
  let x = tank.localPos.x + dx, z = tank.localPos.z + dz;
  const dist = Math.hypot(x, z);
  if (dist > ROAM_RADIUS){
    const s = ROAM_RADIUS / dist;
    x *= s; z *= s;
  }
  tank.localPos = { x, z };
  lanes.forEach(lane => {
    if (lane.isTank || !lane.alive) return;
    const off = FORMATION_XZ[lane.col];
    lane.localPos = { x: tank.localPos.x + off.x, z: tank.localPos.z + off.z };
  });
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
export function resolveCard(state, side, card, casterIndex, targetIndex, targetSide){
  const ownLanes = side === 'you' ? state.youLanes : state.rivalLanes;
  const enemyLanes = side === 'you' ? state.rivalLanes : state.youLanes;
  const casterLane = ownLanes[casterIndex];
  const result = {
    side, card, casterIndex, targetIndex: -1, targetSide: side, reversed: false,
    dmg: 0, healed: 0,
    ambush: false, shielded: false, deathmarked: false, bulwarked: false,
    barrierApplied: false, dodgeApplied: false, thornsApplied: false,
    dodged: false, thornReflected: 0, comboBonus: 0,
  };

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

export function playerPlayCard(state, card, targetIndex, targetSide){
  const casterIndex = card.laneIndex;
  state.energyYou -= card.cost;
  if (card.effect !== 'retain'){
    state.hand = state.hand.filter(c => c !== card);
    state.discard.push(card);
    drawCard(state);
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
