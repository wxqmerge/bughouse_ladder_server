// @vitest-environment node

import { describe, it } from 'vitest';
import { calculateRatings, repopulateGameResults } from '../../../shared/utils/hashUtils';
import { mulberry32, createStressTestPlayer, cleanInvalidResults, generateBatchGames, computeRss } from '../shared/stressTestUtils';

function runSimulation(blendingFactor: number): { finalRss: number; f1: number; f2: number } {
  const rng = mulberry32(42);
  const players: PlayerData[] = [];
  for (let i = 0; i < 100; i++) {
    const rating = 100 + (1800 - 100) * (i / 99);
    const p = createStressTestPlayer(i + 1, Math.round(rating), rng);
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
