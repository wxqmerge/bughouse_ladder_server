// @vitest-environment node

import { describe, it } from 'vitest';
import { calculateRatings, repopulateGameResults } from '../../../shared/utils/hashUtils';
import { mulberry32, createStressTestPlayer, cleanInvalidResults, generateBatchGames, computeRss } from '../shared/stressTestUtils';

function runSimulation(blendingFactor: number, perfMultiplierScale: number): { finalRss: number; f1: number; f2: number } {
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
    const result = calculateRatings(players, allMatches, { blendingFactorOverride: blendingFactor, perfMultiplierScaleOverride: perfMultiplierScale });
    rssHistory.push(computeRss(result.players, startRatings));
  }
  const finalResult = calculateRatings(players, allMatches, { blendingFactorOverride: blendingFactor, perfMultiplierScaleOverride: perfMultiplierScale });
  const cleanPlayers = cleanInvalidResults(repopulateGameResults(finalResult.players, allMatches, 31));
  const f1r = calculateRatings(cleanPlayers, allMatches, { blendingFactorOverride: blendingFactor, perfMultiplierScaleOverride: perfMultiplierScale });
  const f2r = calculateRatings(f1r.players, allMatches, { blendingFactorOverride: blendingFactor, perfMultiplierScaleOverride: perfMultiplierScale });
  return { finalRss: rssHistory[rssHistory.length - 1] ?? 0, f1: computeRss(f1r.players, startRatings), f2: computeRss(f2r.players, startRatings) };
}

describe('2D Optimization', () => {
  it('sweep blendingFactor 0.98-1.00 × perfMultiplierScale 0.60-1.00 on 100p_2p_ng0', () => {
    const blendingFactors = [0.98, 0.99, 1.00];
    const multiplierScales = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
    const results: { bf: number; ms: number; finalRss: number; f1: number; f2: number }[] = [];

    for (const bf of blendingFactors) {
      for (const ms of multiplierScales) {
        const result = runSimulation(bf, ms);
        results.push({ bf, ms, finalRss: result.finalRss, f1: result.f1, f2: result.f2 });
      }
    }

    console.log('\nFinalRSS 2D Grid (100p_2p_ng0):');
    console.log('BF→MS↓  0.30     0.35     0.40     0.45     0.50     0.55     0.60     0.65     0.70');
    console.log('------  ------   ------   ------   ------   ------   ------   ------   ------   ------');
    for (const bf of blendingFactors) {
      const row = results.filter(r => r.bf === bf);
      const cells = row.map(r => r.finalRss.toFixed(1).padStart(8));
      console.log(`${bf.toFixed(2)}    ${cells.join(' ')}`);
    }

    const best = results.reduce((a, b) => a.finalRss < b.finalRss ? a : b);
    console.log(`\nOptimal: bf=${best.bf.toFixed(2)}, ms=${best.ms.toFixed(2)}`);
    console.log(`  FinalRSS=${best.finalRss.toFixed(2)}, F1=${best.f1.toFixed(2)}, F2=${best.f2.toFixed(2)}`);
    console.log(`  (previous baseline bf=0.98,ms=1.00: 294.74)`);
  });
});
