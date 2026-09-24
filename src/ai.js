// Squad AI, usable for either side (the in-game rival uses 'rival'; the
// meta simulator in scripts/simulate-meta.mjs pits two of them against
// each other). Two decisions:
//  - aiBeginCard: when its cast lock is free, pick one affordable card at
//    random among the useful ones (attacks only if someone is in range --
//    target via pickAutoTarget, taunt included; heals on the most hurt
//    ally; defenses on the Tank), pay for it and return the cast plan that
//    game.landCast will resolve at impact.
//  - aiMoveIntent: where the squad wants to walk. Melee-heavy squads close
//    in so their short-range cards reach; ranged squads hold at long range
//    and back off when the enemy gets close (kiting).
import { pickAutoTarget, CAST_TIME, worldPos } from './game.js';
import { setById } from './cards.js';

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

export function aiBeginCard(state, side = 'rival'){
  if (state.gameOver || state[CAST[side]] > 0) return null;

  const candidates = [];
  lanesOf(state, side).forEach((lane, laneIndex) => {
    if (!lane.alive) return;
    const set = setById(lane.setId);
    lane.cardPool.forEach(c => {
      if (c.cost > state[ENERGY[side]]) return;
      const card = { ...c, cls: lane.classId, laneIndex, color: lane.color, setId: lane.setId, setName: set.name, setIcon: set.icon };
      card.target = card.role === 'attack'
        ? pickAutoTarget(state, side, card, laneIndex)
        : supportTarget(state, side, card);
      if (card.target === -1) return;
      candidates.push(card);
    });
  });
  if (!candidates.length) return null;

  const card = candidates[Math.floor(Math.random() * candidates.length)];
  state[ENERGY[side]] -= card.cost;
  state[CAST[side]] = CAST_TIME;
  return {
    side, card, casterIndex: card.laneIndex, targetIndex: card.target,
    targetSide: card.role === 'attack' ? other(side) : side, missed: false,
  };
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
  const [lo, hi] = meleeShare(lanesOf(state, side)) >= 0.5 ? MELEE_BAND : RANGED_BAND;
  let sign = 0;
  if (d > hi) sign = 1;
  else if (d < lo) sign = -1;
  if (!sign) return null;
  const faceSign = side === 'you' ? -1 : 1;
  return { x: sign * dx / d, z: sign * (dz / d) * faceSign };
}
