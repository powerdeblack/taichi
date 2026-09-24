// Big Swiss tournament: every archetype enters the same number of copies
// (default 200 each -> 2,000 teams), everyone plays every round against
// someone on the same score, and the final standings rank all entrants.
// Uses the same duel simulation as the meta (real rules, in-game AI on
// both sides, random board side per game, fixed seed).
//
//   npm run tournament -- [copiesPerArchetype] [rounds] [out.json]
import { writeFileSync } from 'node:fs';
import { ARCHETYPES, copyArchetypePicks } from '../src/cards.js';
import { playDuel, seedRandom, duelStats } from './duel-sim.mjs';

seedRandom(424242);

const COPIES = Number(process.argv[2]) || 200;
const ROUNDS = Number(process.argv[3]) || 11;
const OUT = process.argv[4] || 'tournament-results.json';

const byId = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]));
const players = [];
ARCHETYPES.forEach(a => {
  for (let k = 0; k < COPIES; k++) players.push({ id: `${a.id}#${k + 1}`, arch: a.id, score: 0, opponents: [], wins: 0, draws: 0, losses: 0 });
});

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Swiss pairing: sort by score (random order inside a score group), then
// pair each player with the next one it hasn't met yet.
function pairRound(){
  const pool = shuffle([...players]).sort((a, b) => b.score - a.score);
  const pairs = [];
  while (pool.length > 1){
    const a = pool.shift();
    let j = pool.findIndex(b => !a.opponents.includes(b));
    if (j === -1) j = 0;
    pairs.push([a, pool.splice(j, 1)[0]]);
  }
  return pairs;
}

const started = Date.now();
for (let r = 1; r <= ROUNDS; r++){
  for (const [a, b] of pairRound()){
    const aFirst = Math.random() < 0.5;
    const res = aFirst
      ? playDuel(copyArchetypePicks(byId[a.arch]), copyArchetypePicks(byId[b.arch]))
      : 1 - playDuel(copyArchetypePicks(byId[b.arch]), copyArchetypePicks(byId[a.arch]));
    a.score += res; b.score += 1 - res;
    a.opponents.push(b); b.opponents.push(a);
    if (res === 1){ a.wins++; b.losses++; } else if (res === 0){ b.wins++; a.losses++; } else { a.draws++; b.draws++; }
  }
  console.log(`round ${r}/${ROUNDS} done (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

// Tiebreak: Buchholz (sum of opponents' final scores) -- beating strong
// opponents ranks above beating weak ones.
players.forEach(p => { p.buchholz = p.opponents.reduce((s, o) => s + o.score, 0); });
const ranked = [...players].sort((a, b) => b.score - a.score || b.buchholz - a.buchholz);

const top = n => {
  const counts = Object.fromEntries(ARCHETYPES.map(a => [a.id, 0]));
  ranked.slice(0, n).forEach(p => counts[p.arch]++);
  return counts;
};
const summary = {
  entrants: players.length, copiesPerArchetype: COPIES, rounds: ROUNDS,
  duels: duelStats.duels, avgDuelSeconds: Math.round(duelStats.seconds / duelStats.duels),
  archetypes: ARCHETYPES.map(a => ({ id: a.id, name: a.name, icon: a.icon })),
  top100: top(100), top10: top(10), top1: ranked[0].arch,
  avgScore: Object.fromEntries(ARCHETYPES.map(a => {
    const mine = players.filter(p => p.arch === a.id);
    return [a.id, Math.round(mine.reduce((s, p) => s + p.score, 0) / mine.length * 100) / 100];
  })),
  standings: ranked.slice(0, 100).map((p, i) => ({ rank: i + 1, id: p.id, arch: p.arch, score: p.score, record: `${p.wins}-${p.draws}-${p.losses}`, buchholz: p.buchholz })),
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));

console.log(`\n${players.length} teams, ${ROUNDS} Swiss rounds, ${duelStats.duels} duels (avg ${summary.avgDuelSeconds}s)`);
console.log('archetype          top100  top10  avg score');
ARCHETYPES.slice().sort((a, b) => summary.top100[b.id] - summary.top100[a.id]).forEach(a =>
  console.log(`${(a.icon + ' ' + a.name).padEnd(20)} ${String(summary.top100[a.id]).padStart(5)}  ${String(summary.top10[a.id]).padStart(5)}  ${summary.avgScore[a.id].toFixed(2).padStart(8)}`));
console.log(`\n#1: ${ranked[0].id} (${ranked[0].wins}-${ranked[0].draws}-${ranked[0].losses})`);
