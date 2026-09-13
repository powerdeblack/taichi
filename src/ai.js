// Rival AI: after its energy/bleed tick, gathers every card its alive lanes
// can currently afford (from each lane's own loadout) and plays one at
// random. Simple on purpose.
import { startRivalPrep, resolveCard } from './game.js';

export function aiTakeTurn(state, { onResolved }){
  const bleedResults = startRivalPrep(state);
  if (state.gameOver){ onResolved({ bleedResults, result: null }); return; }

  const candidates = [];
  state.rivalLanes.forEach((lane, laneIndex) => {
    if (!lane.alive) return;
    lane.cardPool.forEach(c => {
      if (c.cost <= state.energyRival) candidates.push({ ...c, cls: lane.classId, laneIndex, color: lane.color });
    });
  });

  if (!candidates.length){ onResolved({ bleedResults, result: null }); return; }

  const card = candidates[Math.floor(Math.random()*candidates.length)];
  setTimeout(() => {
    const casterIndex = card.laneIndex;
    state.energyRival -= card.cost;
    const result = resolveCard(state, 'rival', card, casterIndex);
    onResolved({ bleedResults, result });
  }, 900);
}
