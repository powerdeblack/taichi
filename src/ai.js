// Rival AI: called periodically by main.js's real-time loop (not once per
// "turn" -- there are no turns anymore). Each call, it gathers every card
// its alive lanes can currently afford and plays one at random, with a
// target picked automatically via pickAutoTarget (which includes the Tank
// taunt check, same as the player gets). Attack cards with nobody in range
// are skipped. Returns the resolveCard result, or null if it had nothing
// useful to play. Movement is handled separately (main.js rival wander).
import { resolveCard, pickAutoTarget } from './game.js';
import { setById } from './cards.js';

export function aiMaybeAct(state){
  if (state.gameOver) return null;

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
  const casterIndex = card.laneIndex;
  state.energyRival -= card.cost;
  return resolveCard(state, 'rival', card, casterIndex, card.role === 'attack' ? card.target : -1);
}
