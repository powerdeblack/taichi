// Meta simulator (a balancing tool -- the game itself never shows any of
// this; players discover the meta on their own): plays every archetype
// against every other with the real rules engine (game.js) and the same
// squad AI the in-game rival uses (ai.js) on both sides, then writes
// scripts/meta-results.json with the win-rate matrix, tiers, who-beats-
// whom and counter-meta picks. Each pairing is played half the games
// from each side of the board so neither archetype profits from the
// arena's asymmetry.
//
//   npm run meta            # default number of games per pairing
//   node scripts/simulate-meta.mjs 400
import { writeFileSync } from 'node:fs';
import { ARCHETYPES, copyArchetypePicks } from '../src/cards.js';
import { playDuel, seedRandom, duelStats, MAX_TIME } from './duel-sim.mjs';

seedRandom(20260924);

const GAMES_PER_PAIR = Number(process.argv[2]) || 400;
const BEATS_AT = 0.55; // a matchup won this often counts as favored / a counter

const ids = ARCHETYPES.map(a => a.id);
const matrix = Object.fromEntries(ids.map(id => [id, {}]));
const started = Date.now();
for (let i = 0; i < ARCHETYPES.length; i++){
  for (let j = i + 1; j < ARCHETYPES.length; j++){
    const A = ARCHETYPES[i], B = ARCHETYPES[j];
    let aScore = 0;
    for (let g = 0; g < GAMES_PER_PAIR; g++){
      aScore += g % 2 === 0
        ? playDuel(copyArchetypePicks(A), copyArchetypePicks(B))
        : 1 - playDuel(copyArchetypePicks(B), copyArchetypePicks(A));
    }
    const rate = aScore / GAMES_PER_PAIR;
    matrix[A.id][B.id] = Math.round(rate * 1000) / 1000;
    matrix[B.id][A.id] = Math.round((1 - rate) * 1000) / 1000;
  }
  process.stdout.write(`${ARCHETYPES[i].id} done (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
}

const winRate = Object.fromEntries(ids.map(id => {
  const rates = ids.filter(o => o !== id).map(o => matrix[id][o]);
  return [id, Math.round(rates.reduce((a, r) => a + r, 0) / rates.length * 1000) / 1000];
}));

// Rank-based tiers so there is always a clear meta: top 2 = S (meta),
// next 3 = A, next 3 = B, rest = C.
const ranked = [...ids].sort((a, b) => winRate[b] - winRate[a]);
const tier = {};
ranked.forEach((id, i) => { tier[id] = i < 2 ? 'S' : i < 5 ? 'A' : i < 8 ? 'B' : 'C'; });

const beats = {}, counteredBy = {}, counterMetaVs = {};
ids.forEach(id => {
  beats[id] = ids.filter(o => o !== id && matrix[id][o] >= BEATS_AT).sort((a, b) => matrix[id][b] - matrix[id][a]);
  counteredBy[id] = ids.filter(o => o !== id && matrix[o][id] >= BEATS_AT).sort((a, b) => matrix[b][id] - matrix[a][id]);
  counterMetaVs[id] = [];
});
// Counter-meta: for each S team, the best answer from outside the S tier
// -- the non-S archetype with the highest win rate against it, as long as
// it wins that matchup more often than not.
ids.filter(s => tier[s] === 'S').forEach(s => {
  const best = ids.filter(o => tier[o] !== 'S').sort((a, b) => matrix[b][s] - matrix[a][s])[0];
  if (best && matrix[best][s] > 0.5) counterMetaVs[best].push(s);
});

const { duels, timeouts } = duelStats;
const avgDuelSeconds = Math.round(duelStats.seconds / duels);
const META = { gamesPerPair: GAMES_PER_PAIR, beatsAt: BEATS_AT, avgDuelSeconds, timeoutShare: Math.round(timeouts / duels * 1000) / 1000, ranked, winRate, tier, beats, counteredBy, counterMetaVs, matrix };
writeFileSync(new URL('./meta-results.json', import.meta.url), JSON.stringify(META, null, 2) + '\n');

console.log(`\n${duels} duels, avg ${avgDuelSeconds}s, ${(timeouts / duels * 100).toFixed(1)}% hit the ${MAX_TIME}s cap`);
console.log('rank  tier  win%   archetype        beats / countered by');
ranked.forEach((id, i) => console.log(
  `${String(i + 1).padStart(3)}   ${tier[id]}    ${(winRate[id] * 100).toFixed(1).padStart(5)}  ${id.padEnd(16)} +[${beats[id].join(',')}]  -[${counteredBy[id].join(',')}]` +
  (counterMetaVs[id].length ? `  COUNTER-META vs ${counterMetaVs[id].join(',')}` : '')));
