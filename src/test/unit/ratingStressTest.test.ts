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

// ─── PRNG (Mulberry32) ───────────────────────────────────────────────
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// ─── Player Creation ──────────────────────────────────────────────────
const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez'];

function createPlayer(rank: number, rating: number, rng: () => number): PlayerData {
  return {
    rank,
    group: 'A',
    lastName: lastNames[Math.floor(rng() * lastNames.length)],
    firstName: firstNames[Math.floor(rng() * firstNames.length)],
    rating,
    nRating: 0,
    trophyEligible: rng() > 0.15, // ~15% chance of being ineligible
    grade: '5',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  };
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

// ─── Result Validation ────────────────────────────────────────────────
/**
 * Validate and clean game results by removing invalid entries.
 * Repeats until processGameResults reports no errors.
 */
function cleanInvalidResults(players: PlayerData[]): PlayerData[] {
  let current = players;
  let iterations = 0;

  while (iterations < 10) {
    const validation = processGameResults(current, 31);
    if (!validation.hasErrors || validation.errors.length === 0) break;

    // Collect invalid (round, playerRank) pairs from errors
    const invalidEntries = new Set<string>();
    for (const err of validation.errors) {
      invalidEntries.add(`${err.playerRank}:${err.resultIndex}`);
    }

    // Remove invalid entries
    current = current.map(p => {
      const newResults = [...p.gameResults];
      for (let r = 0; r < 31; r++) {
        if (invalidEntries.has(`${p.rank}:${r}`)) {
          newResults[r] = null;
        }
      }
      return { ...p, gameResults: newResults };
    });

    iterations++;
  }

  return current;
}
function determineResult(expected: number, rng: () => number): { score1: number; score2: number } {
  const takeFromSide0 = Math.min(0.05, expected);
  const takeFromSide1 = Math.min(0.05, 1 - expected);
  const draw = takeFromSide0 + takeFromSide1;
  const win0 = expected - takeFromSide0;
  const win1 = (1 - expected) - takeFromSide1;

  const r = rng();
  if (r < win0) return { score1: 3, score2: 1 };
  if (r < win0 + draw) return { score1: 2, score2: 2 };
  return { score1: 1, score2: 3 };
}

// ─── Batch Game Generation (Round-Robin) ──────────────────────────────
/**
 * Round-robin pairing: every player plays every round.
 * Sort by start rating, then pair consecutively so opponents are similar.
 * Use round-robin schedule to rotate opponents each round while keeping ratings balanced.
 * 2p: adjacent pairs. 4p: groups of 4 split into two sides.
 * Sides are flipped randomly to randomize which side is side0/side1.
 * 600-point filter uses start ratings (not current) to prevent drift-based skips.
 */
function generateBatchGames(
  players: PlayerData[],
  gameType: '2p' | '4p',
  rng: () => number,
  roundIndex: number,
  startRatings: Map<number, number>,
): MatchData[] {
  const games: MatchData[] = [];
  const groupSize = gameType === '2p' ? 2 : 4;

  // Sort by start rating so pairing is stable across rounds
  const sorted = [...players].sort((a, b) => (startRatings.get(a.rank) ?? a.rating) - (startRatings.get(b.rank) ?? b.rating));
  const n = sorted.length;

// 2p: Fisher-Yates shuffle each round, pair consecutively
  // 4p: same shuffle, then group consecutive players into teams of 2
  // This creates rating variance between sides so Elo outcomes are distributed
  const groups: PlayerData[][] = [];

  // Shuffle sorted list pseudo-randomly each round
  const shuffled = [...sorted];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < n; i += groupSize) {
    const group = shuffled.slice(i, i + groupSize);
    if (group.length === groupSize) {
      groups.push(group);
    }
  }

  for (const group of groups) {
    let side0 = group.slice(0, groupSize / 2);
    let side1 = group.slice(groupSize / 2);

    // Randomly flip which side is side0/side1
    if (rng() > 0.5) {
      [side0, side1] = [side1, side0];
    }

   // 600-point filter uses start ratings to prevent drift-based skips
    const side0Start = side0.reduce((s, p) => s + (startRatings.get(p.rank) ?? p.rating), 0) / side0.length;
    const side1Start = side1.reduce((s, p) => s + (startRatings.get(p.rank) ?? p.rating), 0) / side1.length;
    const rawDiff = side0Start - side1Start;

    // Skip match if side rating gap exceeds 600 — prevent unrealistic pairings
    if (Math.abs(rawDiff) > 600) continue;

    const expected = 1 / (1 + Math.pow(10, -rawDiff / 400));

    // 30% chance of dual result (two independent games), 70% single result
    const isDual = rng() < 0.3;

    if (groupSize === 2) {
      // 2p: player1 vs player2
      if (isDual) {
        const game1 = determineResult(expected, rng);
        const game2 = determineResult(expected, rng);
        games.push({
          player1: side0[0].rank,
          player2: side1[0].rank,
          player3: 0,
          player4: 0,
          score1: game1.score1,
          score2: game2.score1,
          side0Won: (game1.score1 > game1.score2 ? 1 : 0) + (game2.score1 > game2.score2 ? 1 : 0) >= 2,
        });
      } else {
        const result = determineResult(expected, rng);
        games.push({
          player1: side0[0].rank,
          player2: side1[0].rank,
          player3: 0,
          player4: 0,
          score1: result.score1,
          score2: 0,
          side0Won: result.score1 > result.score2,
        });
   }
    } else {
      // 4p: two independent games or single game
      if (isDual) {
        const game1 = determineResult(expected, rng);
        const game2 = determineResult(expected, rng);
        games.push({
          player1: side0[0].rank,
          player2: side0[1].rank,
          player3: side1[0].rank,
          player4: side1[1].rank,
          score1: game1.score1,
          score2: game2.score1,
          side0Won: (game1.score1 > game1.score2 ? 1 : 0) + (game2.score1 > game2.score2 ? 1 : 0) >= 2,
        });
      } else {
        const result = determineResult(expected, rng);
        games.push({
          player1: side0[0].rank,
          player2: side0[1].rank,
          player3: side1[0].rank,
          player4: side1[1].rank,
          score1: result.score1,
          score2: 0,
          side0Won: result.score1 > result.score2,
        });
      }
    }
  }

  return games;
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

function computeRss(players: PlayerData[], startRatings: Map<number, number>, useNRating = true): number {
  let rss = 0;
  for (const p of players) {
    const diff = (useNRating ? p.nRating : p.rating) - (startRatings.get(p.rank) ?? 0);
    rss += diff * diff;
  }
  return Math.sqrt(rss / players.length);
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

// ─── Tests ────────────────────────────────────────────────────────────
describe('Rating Stress Test', () => {
  const results: StressResult[] = [];

  for (const config of configs) {
    const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
    it(`${config.label}_${ngLabel}`, () => {
      const result = runSimulation(config);
      results.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  ${config.label}_${ngLabel}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });
  }

  afterAll(() => {
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });

    const maxRssLen = Math.max(...results.map(r => r.rssHistory.length), 0);
    const rssHeaders = Array.from({ length: maxRssLen }, (_, i) => `RSS_${i + 1}`);
    const tsvHeaders = ['Config', 'Final1', 'Final2', ...rssHeaders];

    const tsvRows = results.map(r => {
      const row = [r.config, r.final1.toFixed(2), r.final2.toFixed(2)];
      for (let i = 0; i < maxRssLen; i++) {
        row.push(i < r.rssHistory.length ? r.rssHistory[i].toFixed(2) : '');
      }
      return row;
    });

    const summaryTsv = [tsvHeaders, ...tsvRows].map(r => r.join('\t')).join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.tsv'), summaryTsv);

    const twentyPlayerResults = results.filter(r => r.config.startsWith('20p_'));
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
