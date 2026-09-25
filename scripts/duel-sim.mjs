// One AI-vs-AI duel with the real rules engine (game.js) and the in-game
// squad AI (ai.js) on both sides, stepped at a fixed dt with no rendering.
// Shared by the meta simulator and the tournament script.
import * as game from '../src/game.js';
import { aiBeginCard, aiMoveIntent } from '../src/ai.js';

// Seeded RNG so every run writes the same numbers for the same rules (card
// picks and AI timing all go through Math.random).
export function seedRandom(seed){
  Math.random = () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const DT = 0.1;
export const MAX_TIME = 300;
const AI_SPEED = 1.3; // same as the in-game rival

const CAST = { you: 'castYou', rival: 'castRival' };
export const duelStats = { duels: 0, seconds: 0, timeouts: 0 };
// Optional diagnostics hook: onLand(state, plan, result) after every cast lands.
export const simHooks = { onLand: null };

// Returns 1 if `you` wins, 0 if `rival` wins, 0.5 for a draw/timeout.
export function playDuel(youPicks, rivalPicks){
  const st = game.freshState(youPicks, rivalPicks);
  const pending = [];
  const think = { you: 2.5, rival: 2.5 };
  const move = { you: null, rival: null };
  const moveTimer = { you: 0, rival: 0 };
  let t = 0;
  while (!st.gameOver && t < MAX_TIME){
    t += DT;
    game.tickEnergyRealtime(st, DT);
    game.tickCasts(st, DT);
    game.tickStatusTimer(st, DT);
    for (const side of ['you', 'rival']){
      moveTimer[side] -= DT;
      if (moveTimer[side] <= 0){
        move[side] = aiMoveIntent(st, side);
        moveTimer[side] = 0.5;
      }
      if (move[side]) game.moveSquadWithTank(st, side, move[side].x * AI_SPEED * DT, move[side].z * AI_SPEED * DT);
      if (st[CAST[side]] <= 0){
        think[side] -= DT;
        if (think[side] <= 0){
          think[side] = 0.6 + Math.random() * 1.2;
          const plan = aiBeginCard(st, side);
          if (plan) pending.push({ plan, at: t + game.CAST_IMPACT_AT });
        }
      }
    }
    for (let i = pending.length - 1; i >= 0; i--){
      if (t >= pending[i].at){
        const result = game.landCast(st, pending[i].plan);
        simHooks.onLand?.(st, pending[i].plan, result);
        pending.splice(i, 1);
      }
    }
    game.cullDeadHand(st, 'you');
    game.cullDeadHand(st, 'rival');
    game.checkGameOver(st);
  }
  duelStats.seconds += t;
  duelStats.duels++;
  if (!st.gameOver){ duelStats.timeouts++; return 0.5; }
  return st.winner === 'you' ? 1 : st.winner === 'rival' ? 0 : 0.5;
}

