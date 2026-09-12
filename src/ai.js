// Rival AI: picks a random affordable card from the full pool and aims at
// the player with some random noise. Simple on purpose for the prototype.
import { POOL } from './cards.js';
import { fireProjectile } from './physics.js';
import { MAX_ENERGY } from './game.js';
import * as ui from './ui.js';

export function aiTakeTurn(state, { onDefensePlayed, onAttackLaunched }){
  state.energyRival = Math.min(MAX_ENERGY, state.energyRival + 2);
  const affordable = POOL.filter(c => c.cost <= state.energyRival);
  const card = affordable[Math.floor(Math.random()*affordable.length)] || POOL[0];
  ui.setHint('O rival está mirando...');

  setTimeout(() => {
    if (card.type === 'defense'){
      state.statusRival.shield = true;
      if (card.effect === 'shield_cleanse'){
        ['bleed','deathmark'].forEach(k => { if (state.statusRival[k]) delete state.statusRival[k]; });
      }
      state.energyRival -= card.cost;
      ui.renderStatus(state);
      ui.setHint(`O rival usou ${card.name}!`);
      onDefensePlayed();
      return;
    }

    state.energyRival -= card.cost;
    const dx = state.positions.you.x - state.positions.rival.x;
    const dy = (state.positions.you.y - 40) - state.positions.rival.y;
    const angle = Math.atan2(dy, dx) + (Math.random()-0.5)*0.22;
    const power = 480 + Math.random()*90;
    const vx = Math.cos(angle) * power;
    const vy = Math.sin(angle) * power;
    fireProjectile(state, state.positions.rival, vx, vy, card, 'rival');
    state.pendingResolve = { side:'rival', card, hitsRegistered:0, resolved:false };
    onAttackLaunched();
  }, 900);
}
