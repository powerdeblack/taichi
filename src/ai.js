// Squad AI, usable for either side (the in-game rival uses 'rival'; the
// meta simulator in scripts/simulate-meta.mjs pits two of them against
// each other). Two decisions:
//  - aiBeginCard: when its cast lock is free, play a card from its own
//    3-card hand (same deck rules as the player), chosen like a person
//    would -- see "human-like card play" below -- and return the cast plan
//    that game.landCast will resolve at impact.
//  - aiMoveIntent: where the squad wants to walk. Melee-heavy squads close
//    in so their short-range cards reach; ranged squads hold at long range
//    and back off when the enemy gets close (kiting).
import { pickAutoTarget, CAST_TIME, worldPos, discardPlayed } from './game.js';
import { classMultiplier } from './cards.js';

const other = side => side === 'you' ? 'rival' : 'you';
const lanesOf = (state, side) => side === 'you' ? state.youLanes : state.rivalLanes;
const ENERGY = { you: 'energyYou', rival: 'energyRival' };
const CAST = { you: 'castYou', rival: 'castRival' };

// Instant heals wait until someone has actually lost HP; Regen is cheap
// insurance and can go out early.
const HEAL_BELOW = 0.85;

// Status key each defense effect leaves on its target (see game.js).
const DEFENSE_STATUS = {
  shield: 'shield', bulwark: 'bulwark', bulwark_cleanse: 'bulwark',
  barrier: 'barrier', dodge: 'dodgeCharges', thorns: 'thornsHits',
};

function supportTarget(state, side, card){
  const alive = lanesOf(state, side).map((lane, i) => ({ lane, i })).filter(x => x.lane.alive);
  if (!alive.length) return -1;
  if (card.role === 'heal'){
    const frac = x => x.lane.hp / x.lane.maxHp;
    const hurt = alive.reduce((best, x) => (frac(x) < frac(best) ? x : best), alive[0]);
    if (card.effect !== 'regen' && frac(hurt) > HEAL_BELOW) return -1;
    return hurt.i;
  }
  // Thorns go on the Tank: Taunt drags nearby attackers onto it, so that's
  // where hits will land. Every other defense goes on the most hurt ally
  // (enemy long-range attacks focus the lowest-HP Axie) that doesn't
  // already have that same protection up.
  // Cleanse is saved for an ally actually carrying Bleed/Poison -- the one
  // carrying the most.
  if (card.effect === 'bulwark_cleanse'){
    const dots = x => (x.lane.status.bleed || 0) * 4 + (x.lane.status.poison || 0) * 2;
    const worst = alive.reduce((best, x) => (dots(x) > dots(best) ? x : best), alive[0]);
    return dots(worst) > 0 ? worst.i : -1;
  }
  // Secrets go face-down on the Tank (Taunt makes it the one that gets
  // hit), otherwise on any ally without one.
  if (card.effect === 'secret'){
    const open = alive.filter(x => !x.lane.secret);
    if (!open.length) return -1;
    return (open.find(x => x.lane.isTank) || open[0]).i;
  }
  const key = DEFENSE_STATUS[card.effect] || 'shield';
  const open = alive.filter(x => !x.lane.status[key]);
  if (!open.length) return -1;
  if (card.effect === 'thorns'){
    const tank = open.find(x => x.lane.isTank);
    return tank ? tank.i : -1;
  }
  const frac = x => x.lane.hp / x.lane.maxHp;
  return open.reduce((best, x) => (frac(x) < frac(best) ? x : best), open[0]).i;
}

// ---------- human-like card play ----------
// The AI plays from its own 3-card hand under the player's exact rules
// (game.js piles: deck, discard, draw on play, Retain stays). It only
// "sees" what a player sees on screen -- HP bars, statuses, energy and the
// rival's cast bar (state.casting) -- scores each playable card by what it
// would do right now, and then picks with some noise so it doesn't play
// like a machine: sometimes the second-best card, now and then a plain
// mistake, and it may hold energy for a bigger card that's almost paid for.
export const AI_STYLE = {
  temperature: 7,      // softmax noise over card scores (HP-ish units)
  mistakeRate: 0.08,   // chance to play a random playable card instead
  saveFor: 0.55,       // hold if the best playable card is worth < 55% of an almost-affordable one
  saveWindow: 2.5,     // ...that will be affordable within this many seconds
};
const ENERGY_REGEN_GUESS = 0.3; // energy per second (game.js ENERGY_REGEN_PER_SEC)
const MAX_ENERGY_GUESS = 10;

function enemyThreat(state, side){
  // The rival's cast bar: an attack or Reverse Heal coming at our side.
  const c = state.casting && state.casting[other(side)];
  if (!c || c.missed) return null;
  return c.targetSide === side ? c : null;
}

function attackValue(state, side, card, laneIndex, target){
  const lane = lanesOf(state, side)[laneIndex];
  const foe = lanesOf(state, other(side))[target];
  let dmg = (card.dmg + (lane.attackBonus || 0)) * (lane.powerMult || 1) * classMultiplier(card.cls, foe.classId);
  if (card.effect === 'ambush' && !state.firstHitDone) dmg *= 2;
  if (card.effect === 'multi') dmg *= 1.35;
  if (card.effect === 'bleed' || card.effect === 'poison') dmg += 14;
  if (card.effect === 'deathmark' && !(foe.status.deathmark > 0)) dmg += 18;
  let v = dmg;
  if (dmg >= foe.hp) v += foe.isTank ? 200 : 40;       // a kill -- the Tank ends the duel
  else if (foe.isTank) v *= 1.15;                       // chip the win condition
  // Control reads the rival's cast bar like a player would.
  const threat = state.casting && state.casting[other(side)];
  if (card.effect === 'stun') v += threat && threat.casterIndex === target ? 45 : 8;
  if (card.effect === 'fear') v += threat && threat.casterIndex === target && threat.card.role === 'attack' ? 25 : 8;
  if (card.effect === 'chill') v += (foe.status.dodgeCharges > 0 ? 18 : 6);
  if (foe.status.dodgeCharges > 0 && card.effect !== 'chill') v *= 0.7; // likely to be dodged
  return v;
}

function supportValue(state, side, card){
  const allies = lanesOf(state, side).filter(l => l.alive);
  const missing = allies.reduce((a, l) => a + (l.maxHp - l.hp), 0);
  const low = allies.reduce((m, l) => Math.min(m, l.hp / l.maxHp), 1);
  const threat = enemyThreat(state, side);
  if (card.role === 'heal'){
    const amount = card.effect === 'regen' ? 13 * (card.regenTicks || 2) : (card.heal || 20);
    return Math.min(missing, amount * allies.length) * 0.8 + 10 + (low < 0.35 ? 25 : 0);
  }
  let v = 16 + (1 - low) * 20;
  if (threat) v += 22;                 // brace for the hit that's coming
  if (card.effect === 'secret') v = 18 + (threat ? 10 : 0);
  if (card.effect === 'bulwark_cleanse'){
    const dots = allies.reduce((a, l) => a + (l.status.bleed || 0) * 6 + (l.status.poison || 0) * 3, 0);
    v = 10 + dots * 1.5;
  }
  return v;
}

// A fallback target when the whole hand is "not worth it" and energy is
// capped -- a player would still play *something* rather than sit on it.
function anyAllyTarget(state, side, card){
  const alive = lanesOf(state, side).map((lane, i) => ({ lane, i })).filter(x => x.lane.alive);
  if (!alive.length) return -1;
  if (card.effect === 'secret'){
    const open = alive.find(x => !x.lane.secret);
    return open ? open.i : -1;
  }
  return alive.reduce((b, x) => (x.lane.hp / x.lane.maxHp < b.lane.hp / b.lane.maxHp ? x : b), alive[0]).i;
}

function pickWeighted(options, temperature){
  const top = Math.max(...options.map(o => o.score));
  const w = options.map(o => Math.exp((o.score - top) / temperature));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++){ r -= w[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
}

export function aiBeginCard(state, side = 'rival', style = AI_STYLE){
  if (state.gameOver || state[CAST[side]] > 0) return null;
  const energy = state[ENERGY[side]];
  const lanes = lanesOf(state, side);
  const playable = [], waiting = [], fallback = [];
  for (const card of state.piles[side].hand){
    const lane = lanes[card.laneIndex];
    if (!lane || !lane.alive || lane.status.stun > 0) continue; // stunned Axies can't cast
    const target = card.role === 'attack'
      ? pickAutoTarget(state, side, card, card.laneIndex)
      : supportTarget(state, side, card);
    if (target === -1){
      if (card.role !== 'attack' && card.cost <= energy){
        const t = anyAllyTarget(state, side, card);
        if (t !== -1) fallback.push({ card, target: t, score: 0 });
      }
      continue;
    }
    const raw = card.role === 'attack' ? attackValue(state, side, card, card.laneIndex, target) : supportValue(state, side, card);
    const opt = { card, target, score: raw / (1 + 0.15 * card.cost) };
    (card.cost <= energy ? playable : waiting).push(opt);
  }

  let choice = null;
  if (playable.length){
    const best = Math.max(...playable.map(o => o.score));
    // Save up for a clearly better card that's almost paid for.
    const soon = waiting.filter(o => (o.card.cost - energy) / ENERGY_REGEN_GUESS <= style.saveWindow);
    const bigger = soon.length ? Math.max(...soon.map(o => o.score)) : 0;
    if (bigger && best < bigger * style.saveFor && Math.random() < 0.8) return null;
    choice = Math.random() < style.mistakeRate
      ? playable[Math.floor(Math.random() * playable.length)]
      : pickWeighted(playable, style.temperature);
  } else if (fallback.length && energy >= MAX_ENERGY_GUESS - 1){
    choice = fallback[Math.floor(Math.random() * fallback.length)];
  }
  if (!choice) return null;

  const { card, target } = choice;
  state[ENERGY[side]] -= card.cost;
  state[CAST[side]] = CAST_TIME;
  discardPlayed(state, side, card);
  const plan = {
    side, card, casterIndex: card.laneIndex, targetIndex: target,
    targetSide: card.role === 'attack' ? other(side) : side, missed: false,
  };
  if (state.casting) state.casting[side] = plan;
  return plan;
}

// Share of a squad's attack cards that are short range (0..1).
export function meleeShare(lanes){
  let short = 0, total = 0;
  lanes.forEach(l => {
    if (!l.alive) return;
    l.cardPool.forEach(c => {
      if (c.role !== 'attack') return;
      total++;
      if (c.range === 'short') short++;
    });
  });
  return total ? short / total : 0;
}

// Where to stand depends on the cards actually in hand, like a player:
// only short-range attacks in hand -> walk in; only long-range -> hang
// back; a mix (or no attack) -> the squad's overall style.
function wantsMelee(state, side){
  const lanes = lanesOf(state, side);
  const hand = (state.piles?.[side]?.hand || []).filter(c => c.role === 'attack' && lanes[c.laneIndex]?.alive);
  const short = hand.filter(c => c.range === 'short').length;
  if (short && short === hand.length) return true;
  if (hand.length && !short) return false;
  return meleeShare(lanes) >= 0.5;
}

// Distance band (between the two squads' centers) each style tries to
// hold: melee squads push in until they're touching, ranged squads stay
// inside long range but out of short range.
export const MELEE_BAND = [0, 1.5];
export const RANGED_BAND = [3.6, 4.6];

function center(state, side){
  const alive = lanesOf(state, side).filter(l => l.alive);
  if (!alive.length) return null;
  const pts = alive.map(l => worldPos(side, l));
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length };
}

// Returns a unit direction in the side's own local space ({x, z}, +z =
// toward the enemy) for game.moveSquadWithTank, or null to hold position.
export function aiMoveIntent(state, side){
  const me = center(state, side), them = center(state, other(side));
  if (!me || !them) return null;
  const dx = them.x - me.x, dz = them.z - me.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return null;
  const [lo, hi] = wantsMelee(state, side) ? MELEE_BAND : RANGED_BAND;
  let sign = 0;
  if (d > hi) sign = 1;
  else if (d < lo) sign = -1;
  if (!sign) return null;
  const faceSign = side === 'you' ? -1 : 1;
  return { x: sign * dx / d, z: sign * (dz / d) * faceSign };
}
