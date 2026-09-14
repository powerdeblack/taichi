// Rival AI: called periodically by main.js's real-time loop (not once per
// "turn" -- there are no turns anymore). Each call, it gathers every card
// its alive lanes can currently afford and plays one at random, with a
// target picked automatically via pickAutoTarget (which includes the Tank
// taunt check, same as the player gets). Returns the resolveCard result,
// or null if it had nothing affordable to play. Doesn't move lanes --
// kept simple on purpose.
import { resolveCard, pickAutoTarget } from './game.js';

export function aiMaybeAct(state){
  if (state.gameOver) return null;

  const candidates = [];
  state.rivalLanes.forEach((lane, laneIndex) => {
    if (!lane.alive) return;
    lane.cardPool.forEach(c => {
      if (c.cost <= state.energyRival) candidates.push({ ...c, cls: lane.classId, laneIndex, color: lane.color });
    });
  });
  if (!candidates.length) return null;

  const card = candidates[Math.floor(Math.random()*candidates.length)];
  const casterIndex = card.laneIndex;
  state.energyRival -= card.cost;
  const targetIndex = card.role === 'attack' ? pickAutoTarget(state, 'rival', card, casterIndex) : -1;
  return resolveCard(state, 'rival', card, casterIndex, targetIndex);
}
