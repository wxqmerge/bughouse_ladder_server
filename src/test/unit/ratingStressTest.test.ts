// @vitest-environment node

/**
 * Rating Stress Test — Tournament Simulation
 *
 * Generates pseudo-random tournaments with Elo-weighted results,
 * processes games in batches with recalc after each batch,
 * and measures rating convergence via RSS (root-mean-square deviation).
 * All tests use double-pass averaging.
 */

import { describe, it, afterAll } from 'vitest';
import { calculateRatings, repopulateGameResults, processGameResults } from '../../../shared/utils/hashUtils';
import type { PlayerData, MatchData } from '../../../shared/types';
import fs from 'fs';
import path from 'path';
import { mulberry32, determineResult, generateBatchGames, firstNames, lastNames, createStressTestPlayer as createPlayer, cleanInvalidResults, computeRss } from '../shared/stressTestUtils';

// ─── Types ────────────────────────────────────────────────────────────
interface StressConfig {
  players: number;
  gameType: '2p' | '4p';
  seed: number;
  label: string;
  numGamesMode: 'new' | 'mixed' | 'experienced';
  rounds?: number; // default 20
}

interface PlayerDetail {
  rank: number;
  startR: number;
  endR: number;
  delta: number;
  gamesPlayed: number;
}

interface StressResult {
  config: string;
  final1: number;
  final2: number;
  rssHistory: number[];
  playerDetails: PlayerDetail[];
  startPlayers: PlayerData[];
  endPlayers: PlayerData[];
}

// ─── Ladder Tab Generator ────────────────────────────────────────────
function generateLadderTab(players: PlayerData[]): string {
  const header = 'Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\tVersion 1.21';

  const lines = players.map(p => {
    const ratingStr = p.trophyEligible !== false ? p.rating.toString() : `-${p.rating}`;
    const nRatingStr = p.trophyEligible !== false ? p.nRating.toString() : `-${p.nRating}`;
    const fields = [
      p.group || '',
      p.lastName || '',
      p.firstName || '',
      ratingStr,
      p.rank.toString(),
      nRatingStr,
      p.grade || '',
      (p.num_games ?? 0).toString(),
      p.attendance?.toString() || '',
      p.phone || '',
      p.info || '',
      p.school || '',
      p.room || '',
    ];

    // Game result columns 1-31
    const games = p.gameResults || [];
    for (let i = 0; i < 31; i++) {
      fields.push(games[i] || '');
    }

    return fields.join('\t');
  });

  return [header, ...lines].join('\n') + '\n';
}

// ─── Simulation ───────────────────────────────────────────────────────
function runSimulation(config: StressConfig): StressResult {
  const rng = mulberry32(config.seed);
  let numPlayers = config.players;
  const totalRounds = Math.min(config.rounds ?? 20, numPlayers - 1);

  // Ensure even count for 2p, multiple of 4 for 4p
  if (config.gameType === '2p' && numPlayers % 2 !== 0) numPlayers++;
  if (config.gameType === '4p' && numPlayers % 4 !== 0) numPlayers = Math.ceil(numPlayers / 4) * 4;

  const players: PlayerData[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const rating = 100 + (1800 - 100) * (i / (numPlayers - 1));
    const p = createPlayer(i + 1, Math.round(rating), rng);
    // Set num_games based on mode:
    // 'new' = 0 (blending formula for all games)
    // 'mixed' = 0-10 random (transition from blending to Elo at game 10)
    // 'experienced' = 20 (Elo formula from game 1)
    if (config.numGamesMode === 'new') {
      p.num_games = 0;
    } else if (config.numGamesMode === 'mixed') {
      p.num_games = Math.floor(rng() * 11); // 0 to 10, pseudo-random
    } else {
      p.num_games = 20;
    }
    players.push(p);
  }

  const startPlayers = JSON.parse(JSON.stringify(players));

  const startRatings = new Map<number, number>();
  for (const p of players) {
    startRatings.set(p.rank, p.rating);
  }

  // Single-day tournament: num_games reflects pre-tournament experience level
  // (ng0=0, ng0-10=random 0-10, ng20=20). No New Day, so num_games never changes.
  // Each recalc processes all matches from scratch using init rating logic.
  const rssHistory: number[] = [];
  const allMatches: MatchData[] = [];

  // Generate all rounds first, tracking RSS after each batch
  for (let round = 0; round < totalRounds; round++) {
    const batchGames = generateBatchGames(players, config.gameType, rng, round, startRatings);
    if (batchGames.length === 0) break;

    allMatches.push(...batchGames);

    // Recalc from scratch with all matches seen so far
    // num_games=0 → init rating uses nRating/rating directly
    const result = calculateRatings(players, allMatches);

    // RSS from nRating vs start ratings
    rssHistory.push(computeRss(result.players, startRatings));
  }

  // Final recalc on all matches
  const finalResult = calculateRatings(players, allMatches);

  // Repopulate game results from ALL matches
  const withResults = repopulateGameResults(finalResult.players, allMatches, 31);

  // Validate and clean any invalid game result entries
  const cleanPlayers = cleanInvalidResults(withResults);

  // Count games per player from matches (for player details report only)
  const gamesPlayed = new Map<number, number>();
  for (const m of allMatches) {
    gamesPlayed.set(m.player1, (gamesPlayed.get(m.player1) ?? 0) + 1);
    gamesPlayed.set(m.player2, (gamesPlayed.get(m.player2) ?? 0) + 1);
    if (m.player3 > 0) gamesPlayed.set(m.player3, (gamesPlayed.get(m.player3) ?? 0) + 1);
    if (m.player4 > 0) gamesPlayed.set(m.player4, (gamesPlayed.get(m.player4) ?? 0) + 1);
  }

  // Keep original num_games (pre-tournament experience level)
  const finalPlayers = cleanPlayers;

  const playerDetails: PlayerDetail[] = finalPlayers.map(p => ({
    rank: p.rank,
    startR: startRatings.get(p.rank) ?? 0,
    endR: p.nRating,
    delta: p.nRating - (startRatings.get(p.rank) ?? 0),
    gamesPlayed: gamesPlayed.get(p.rank) ?? 0,
  }));

  // Final two recalcs on all matches to measure drift
  const final1Result = calculateRatings(finalPlayers, allMatches);
  const final1Rss = computeRss(final1Result.players, startRatings);

  const final2Result = calculateRatings(final1Result.players, allMatches);
  const final2Rss = computeRss(final2Result.players, startRatings);

  const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
  return {
    config: `${config.label}_${ngLabel}`,
    final1: final1Rss,
    final2: final2Rss,
    rssHistory,
    playerDetails,
    startPlayers,
    endPlayers: JSON.parse(JSON.stringify(finalPlayers)),
  };
}

// ─── Configurations ───────────────────────────────────────────────────
const configs: StressConfig[] = [];

const playerCounts = [20, 50, 100];
const gameTypes: Array<'2p' | '4p'> = ['2p', '4p'];
const numGamesModes: Array<'new' | 'mixed' | 'experienced'> = ['new', 'mixed', 'experienced'];

let seed = 42;
for (const p of playerCounts) {
  for (const g of gameTypes) {
    for (const ng of numGamesModes) {
      configs.push({
        players: p,
        gameType: g,
        seed: seed++,
        label: `${p}p_${g}`,
        numGamesMode: ng,
      });
    }
  }
}

// ─── Module-level results collection (for summary.tsv) ────────────────
const allStressResults: StressResult[] = [];

// ─── Tests ────────────────────────────────────────────────────────────
describe('Rating Stress Test', () => {
  for (const config of configs) {
    const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
    it(`${config.label}_${ngLabel}`, () => {
      const result = runSimulation(config);
      allStressResults.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  ${config.label}_${ngLabel}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });
  }

  afterAll(() => {
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });

    const twentyPlayerResults = allStressResults.filter(r => r.config.startsWith('20p_'));
    for (const result of twentyPlayerResults) {
      fs.writeFileSync(path.join(outDir, `${result.config}.tab`), generateLadderTab(result.endPlayers));
    }

    console.log(`\nReports written to ${outDir}/`);
  });
});

// ─── Quick 1-Round Test ────────────────────────────────────────────────
describe('Rating Stress Test — Quick 1 Round', () => {
  const quickConfigs: StressConfig[] = [];
  let qSeed = 100;
  for (const p of [20]) {
    for (const g of ['2p', '4p'] as Array<'2p' | '4p'>) {
      for (const ng of ['new', 'experienced'] as Array<'new' | 'mixed' | 'experienced'>) {
        quickConfigs.push({
          players: p,
          gameType: g,
          seed: qSeed++,
          label: `${p}p_${g}`,
          numGamesMode: ng,
          rounds: 1,
        });
      }
    }
  }

  const quickResults: StressResult[] = [];

  for (const config of quickConfigs) {
    const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
    it(`1r_${config.label}_${ngLabel}`, () => {
      const result = runSimulation(config);
      quickResults.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  1r_${config.label}_${ngLabel}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });
  }

  afterAll(() => {
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    for (const result of quickResults) {
      const fileName = `1r_${result.config}.tab`;
      fs.writeFileSync(path.join(outDir, fileName), generateLadderTab(result.endPlayers));
    }
    console.log(`\nQuick reports written to ${outDir}/`);
  });
});

// ─── 150-Player 20-Round Stress Test ─────────────────────────────────
describe('Rating Stress Test — 150p 20 Rounds', () => {
  const configs150: StressConfig[] = [];
  let s150 = 200;
  for (const g of ['2p', '4p'] as Array<'2p' | '4p'>) {
    for (const ng of ['new', 'mixed', 'experienced'] as Array<'new' | 'mixed' | 'experienced'>) {
      configs150.push({
        players: 150,
        gameType: g,
        seed: s150++,
        label: '150p',
        numGamesMode: ng,
        rounds: 20,
      });
    }
  }

  for (const config of configs150) {
    const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
    it(`150p_20r_${config.gameType}_${ngLabel}`, () => {
      const result = runSimulation(config);
      allStressResults.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  150p_20r_${config.gameType}_${ngLabel}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });
  }

  afterAll(() => {
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    for (const result of allStressResults.filter(r => r.config.startsWith('150p_'))) {
      const fileName = `150p_20r_${result.config}.tab`;
      fs.writeFileSync(path.join(outDir, fileName), generateLadderTab(result.endPlayers));
    }
    console.log(`\n150p 20-round reports written to ${outDir}/`);
  });
});

// ─── Write summary.tsv after ALL tests complete ───────────────────────
afterAll(() => {
  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  const maxRssLen = Math.max(...allStressResults.map(r => r.rssHistory.length), 0);
  const rssHeaders = Array.from({ length: maxRssLen }, (_, i) => `RSS_${i + 1}`);
  const tsvHeaders = ['Config', 'Final1', 'Final2', ...rssHeaders];

  const tsvRows = allStressResults.map(r => {
    const row = [r.config, r.final1.toFixed(2), r.final2.toFixed(2)];
    for (let i = 0; i < maxRssLen; i++) {
      row.push(i < r.rssHistory.length ? r.rssHistory[i].toFixed(2) : '');
    }
    return row;
  });

  const summaryTsv = [tsvHeaders, ...tsvRows].map(r => r.join('\t')).join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.tsv'), summaryTsv);
  console.log(`\nSummary written to ${outDir}/summary.tsv (${allStressResults.length} configs)`);
});
