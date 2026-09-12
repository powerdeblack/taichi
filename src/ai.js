// Rival AI: after its energy/bleed tick, gathers every card its alive lanes
// can currently afford and plays one at random. Simple on purpose.
import { axieById } from './cards.js';
import { startRivalPrep, resolveCard } from './game.js';

export function aiTakeTurn(state, { onResolved }){
  const bleedResults = startRivalPrep(state);
  if (state.gameOver){ onResolved({ bleedResults, result: null }); return; }

  const candidates = [];
  state.rivalLanes.forEach(lane => {
    if (!lane.alive) return;
    const axie = axieById(lane.classId);
    axie.cards.forEach(c => {
      if (c.cost <= state.energyRival) candidates.push({ ...c, cls: lane.classId, color: lane.color });
    });
  });

  if (!candidates.length){ onResolved({ bleedResults, result: null }); return; }

  const card = candidates[Math.floor(Math.random()*candidates.length)];
  setTimeout(() => {
    const casterIndex = state.rivalLanes.findIndex(l => l.classId === card.cls);
    state.energyRival -= card.cost;
    const result = resolveCard(state, 'rival', card, casterIndex);
    onResolved({ bleedResults, result });
  }, 900);
}
