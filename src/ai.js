// Rival AI: when its cast lock is free, picks one affordable card at
// random (attacks only if someone is in range, target via pickAutoTarget,
// which includes the Tank taunt check), pays for it and starts the cast.
// Returns the cast plan -- main.js animates it and lands it with
// game.landCast, same as the player's -- or null if nothing useful to
// play. Movement is handled separately (main.js rival wander).
import { pickAutoTarget, CAST_TIME } from './game.js';
import { setById } from './cards.js';

export function aiBeginCard(state){
  if (state.gameOver || state.castRival > 0) return null;

  const candidates = [];
  state.rivalLanes.forEach((lane, laneIndex) => {
    if (!lane.alive) return;
    const set = setById(lane.setId);
    lane.cardPool.forEach(c => {
      if (c.cost > state.energyRival) return;
      const card = { ...c, cls: lane.classId, laneIndex, color: lane.color, setId: lane.setId, setName: set.name, setIcon: set.icon };
      // Only attacks that can actually reach someone right now are worth
      // spending energy on -- the AI walks closer instead (see main.js).
      if (card.role === 'attack'){
        card.target = pickAutoTarget(state, 'rival', card, laneIndex);
        if (card.target === -1) return;
      }
      candidates.push(card);
    });
  });
  if (!candidates.length) return null;

  const card = candidates[Math.floor(Math.random()*candidates.length)];
  state.energyRival -= card.cost;
  state.castRival = CAST_TIME;
  // Support cards go on the rival's own caster (normal effect).
  return card.role === 'attack'
    ? { side: 'rival', card, casterIndex: card.laneIndex, targetIndex: card.target, targetSide: 'you', missed: false }
    : { side: 'rival', card, casterIndex: card.laneIndex, targetIndex: card.laneIndex, targetSide: 'rival', missed: false };
}
