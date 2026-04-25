// @vitest-environment node

import { describe, it } from 'vitest';
import { calculateRatings, repopulateGameResults, processGameResults } from '../../../shared/utils/hashUtils';
import type { PlayerData, MatchData } from '../../../shared/types';

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez'];

function createPlayer(rank: number, rating: number, rng: () => number): PlayerData {
  return {
    rank, group: 'A',
    lastName: lastNames[Math.floor(rng() * lastNames.length)],
    firstName: firstNames[Math.floor(rng() * firstNames.length)],
    rating, nRating: 0, trophyEligible: rng() > 0.15, grade: '5', num_games: 0, attendance: 0,
    info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null),
  };
}

function cleanInvalidResults(players: PlayerData[]): PlayerData[] {
  let current = players;
  for (let it = 0; it < 10; it++) {
    const validation = processGameResults(current, 31);
    if (!validation.hasErrors || validation.errors.length === 0) break;
    const invalidEntries = new Set(validation.errors.map((e: any) => `${e.playerRank}:${e.resultIndex}`));
    current = current.map(p => {
      const nr = [...p.gameResults];
      for (let r = 0; r < 31; r++) { if (invalidEntries.has(`${p.rank}:${r}`)) nr[r] = null; }
      return { ...p, gameResults: nr };
    });
  }
  return current;
}

function determineResult(expected: number, rng: () => number): { score1: number; score2: number } {
  const take0 = Math.min(0.05, expected), take1 = Math.min(0.05, 1 - expected);
  const draw = take0 + take1, win0 = expected - take0;
  const r = rng();
  if (r < win0) return { score1: 3, score2: 1 };
  if (r < win0 + draw) return { score1: 2, score2: 2 };
  return { score1: 1, score2: 3 };
}

function generateBatchGames(players: PlayerData[], gameType: '2p' | '4p', rng: () => number, roundIndex: number, startRatings: Map<number, number>): MatchData[] {
  const games: MatchData[] = [];
  const groupSize = gameType === '2p' ? 2 : 4;
  const sorted = [...players].sort((a, b) => (startRatings.get(a.rank) ?? a.rating) - (startRatings.get(b.rank) ?? b.rating));
  const shuffled = [...sorted];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const groups: PlayerData[][] = [];
  for (let i = 0; i < shuffled.length; i += groupSize) { const g = shuffled.slice(i, i + groupSize); if (g.length === groupSize) groups.push(g); }
  for (const group of groups) {
    let side0 = group.slice(0, groupSize / 2), side1 = group.slice(groupSize / 2);
    if (rng() > 0.5) [side0, side1] = [side1, side0];
    const s0 = side0.reduce((s, p) => s + (startRatings.get(p.rank) ?? p.rating), 0) / side0.length;
    const s1 = side1.reduce((s, p) => s + (startRatings.get(p.rank) ?? p.rating), 0) / side1.length;
    if (Math.abs(s0 - s1) > 600) continue;
    const expected = 1 / (1 + Math.pow(10, -(s0 - s1) / 400));
    const isDual = rng() < 0.3;
    if (groupSize === 2) {
      if (isDual) {
        const g1 = determineResult(expected, rng), g2 = determineResult(expected, rng);
        games.push({ player1: side0[0].rank, player2: side1[0].rank, player3: 0, player4: 0, score1: g1.score1, score2: g2.score1, side0Won: (g1.score1 > g1.score2 ? 1 : 0) + (g2.score1 > g2.score2 ? 1 : 0) >= 2 });
      } else {
        const r = determineResult(expected, rng);
        games.push({ player1: side0[0].rank, player2: side1[0].rank, player3: 0, player4: 0, score1: r.score1, score2: 0, side0Won: r.score1 > r.score2 });
      }
    } else {
      if (isDual) {
        const g1 = determineResult(expected, rng), g2 = determineResult(expected, rng);
        games.push({ player1: side0[0].rank, player2: side0[1].rank, player3: side1[0].rank, player4: side1[1].rank, score1: g1.score1, score2: g2.score1, side0Won: (g1.score1 > g1.score2 ? 1 : 0) + (g2.score1 > g2.score2 ? 1 : 0) >= 2 });
      } else {
        const r = determineResult(expected, rng);
        games.push({ player1: side0[0].rank, player2: side0[1].rank, player3: side1[0].rank, player4: side1[1].rank, score1: r.score1, score2: 0, side0Won: r.score1 > r.score2 });
      }
    }
  }
  return games;
}

function computeRss(players: PlayerData[], startRatings: Map<number, number>): number {
  let rss = 0;
  for (const p of players) { const d = p.nRating - (startRatings.get(p.rank) ?? 0); rss += d * d; }
  return Math.sqrt(rss / players.length);
}

function runSimulation(blendingFactor: number): { finalRss: number; f1: number; f2: number } {
  const rng = mulberry32(42);
  const players: PlayerData[] = [];
  for (let i = 0; i < 100; i++) {
    const rating = 100 + (1800 - 100) * (i / 99);
    const p = createPlayer(i + 1, Math.round(rating), rng);
    p.num_games = 0;
    players.push(p);
  }
  const startRatings = new Map(players.map(p => [p.rank, p.rating]));
  const allMatches: MatchData[] = [];
  const rssHistory: number[] = [];
  for (let round = 0; round < 19; round++) {
    const batch = generateBatchGames(players, '2p', rng, round, startRatings);
    if (batch.length === 0) break;
    allMatches.push(...batch);
    const result = calculateRatings(players, allMatches, { blendingFactorOverride: blendingFactor });
    rssHistory.push(computeRss(result.players, startRatings));
  }
  const finalResult = calculateRatings(players, allMatches, { blendingFactorOverride: blendingFactor });
  const cleanPlayers = cleanInvalidResults(repopulateGameResults(finalResult.players, allMatches, 31));
  const f1r = calculateRatings(cleanPlayers, allMatches, { blendingFactorOverride: blendingFactor });
  const f2r = calculateRatings(f1r.players, allMatches, { blendingFactorOverride: blendingFactor });
  return { finalRss: rssHistory[rssHistory.length - 1] ?? 0, f1: computeRss(f1r.players, startRatings), f2: computeRss(f2r.players, startRatings) };
}

describe('Optimize Blending Factor', () => {
  it('sweep 0.90-1.00 step 0.01 on 100p_2p_ng0', () => {
    const results: { factor: number; finalRss: number; f1: number; f2: number }[] = [];
    for (let factor = 0.90; factor <= 1.005; factor += 0.01) {
      const f = Math.round(factor * 100) / 100;
      const result = runSimulation(f);
      results.push({ factor: f, finalRss: result.finalRss, f1: result.f1, f2: result.f2 });
    }
    console.log('\nBlending Factor Optimization (100p_2p_ng0):');
    console.log('Factor\tFinalRSS\tF1\t\tF2');
    console.log('------\t--------\t--\t\t--');
    for (const r of results) {
      console.log(`${r.factor.toFixed(2)}\t${r.finalRss.toFixed(2)}\t${r.f1.toFixed(2)}\t${r.f2.toFixed(2)}`);
    }
    const best = results.reduce((a, b) => a.finalRss < b.finalRss ? a : b);
    const baseline = results.find(r => r.factor === 1);
    console.log(`\nOptimal: factor = ${best.factor.toFixed(2)}`);
    console.log(`  FinalRSS = ${best.finalRss.toFixed(2)} (baseline 1.00: ${baseline?.finalRss.toFixed(2)})`);
    console.log(`  F1 = ${best.f1.toFixed(2)}, F2 = ${best.f2.toFixed(2)}`);
  });
});
