// @vitest-environment node

/**
 * Rating Stress Test — Tournament Simulation
 *
 * Generates pseudo-random tournaments with Elo-weighted results,
 * processes games in batches with recalc + New Day after each batch,
 * and measures rating convergence via RSS (root-mean-square deviation).
 *
 * Double-pass averaging should produce lower RSS than single-pass,
 * proving the VB6 single-pass approach has a convergence problem.
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
  doublePass: boolean;
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
 * Fisher-Yates shuffle for random pairing, then pair consecutively.
 * 2p: pairs of 2. 4p: groups of 4 split into two sides.
 */
function generateBatchGames(
  players: PlayerData[],
  gameType: '2p' | '4p',
  rng: () => number,
): MatchData[] {
  const games: MatchData[] = [];

  // Fisher-Yates shuffle
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (gameType === '2p') {
    // Pair consecutive players (even count guaranteed)
    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];

      const diff = Math.abs(p1.rating - p2.rating);
      const clampedDiff = Math.min(diff, 400);
      const expected = 1 / (1 + Math.pow(10, -clampedDiff / 400));

      const result = determineResult(expected, rng);

      games.push({
        player1: p1.rank,
        player2: p2.rank,
        player3: 0,
        player4: 0,
        score1: result.score1,
        score2: result.score2,
        side0Won: result.score1 > result.score2,
      });
    }
  } else {
    // Group of 4 (count must be multiple of 4)
    for (let i = 0; i < shuffled.length; i += 4) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];
      const p3 = shuffled[i + 2];
      const p4 = shuffled[i + 3];

      const side0Avg = (p1.rating + p2.rating) / 2;
      const side1Avg = (p3.rating + p4.rating) / 2;
      const diff = side0Avg - side1Avg;
      const clampedDiff = Math.min(Math.abs(diff), 400) * Math.sign(diff);
      const expected = 1 / (1 + Math.pow(10, -clampedDiff / 400));

      const result = determineResult(expected, rng);

      games.push({
        player1: p1.rank,
        player2: p2.rank,
        player3: p3.rank,
        player4: p4.rank,
        score1: result.score1,
        score2: result.score2,
        side0Won: result.score1 > result.score2,
      });
    }
  }

  return games;
}

// ─── Simulation ───────────────────────────────────────────────────────
function runSimulation(config: StressConfig, doublePass: boolean): StressResult {
  const rng = mulberry32(config.seed);
  let numPlayers = config.players;
  const totalRounds = Math.min(31, Math.max(20, Math.floor(numPlayers / 5) * 5));

  // Ensure even count for 2p, multiple of 4 for 4p
  if (config.gameType === '2p' && numPlayers % 2 !== 0) numPlayers++;
  if (config.gameType === '4p' && numPlayers % 4 !== 0) numPlayers = Math.ceil(numPlayers / 4) * 4;

  const players: PlayerData[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const rating = 100 + (1800 - 100) * (i / (numPlayers - 1));
    players.push(createPlayer(i + 1, Math.round(rating), rng)); // rank starts at 1
  }

  const startPlayers = JSON.parse(JSON.stringify(players));

  const startRatings = new Map<number, number>();
  for (const p of players) {
    startRatings.set(p.rank, p.rating);
  }
  const rssHistory: number[] = [];
  let currentPlayers = players;
  const allMatches: MatchData[] = [];
  const gamesPlayed = new Map<number, number>();
  let endPlayers: PlayerData[] | null = null;

  for (let round = 0; round < totalRounds; round++) {
    const batchGames = generateBatchGames(currentPlayers, config.gameType, rng);
    if (batchGames.length === 0) break;

    allMatches.push(...batchGames);

    // Count games per player
    for (const m of batchGames) {
      gamesPlayed.set(m.player1, (gamesPlayed.get(m.player1) ?? 0) + 1);
      gamesPlayed.set(m.player2, (gamesPlayed.get(m.player2) ?? 0) + 1);
      if (m.player3 > 0) gamesPlayed.set(m.player3, (gamesPlayed.get(m.player3) ?? 0) + 1);
      if (m.player4 > 0) gamesPlayed.set(m.player4, (gamesPlayed.get(m.player4) ?? 0) + 1);
    }

    // Update num_games so calculateRatings reads from rating column
    for (const p of currentPlayers) {
      p.num_games = gamesPlayed.get(p.rank) ?? 0;
    }

    const result = calculateRatings(currentPlayers, allMatches, { doublePass });

    // Repopulate game results from ALL matches (preserves game history)
    const withResults = repopulateGameResults(result.players, allMatches, 31);

    // Capture end state: rating unchanged (start ratings), nRating = new calculated ratings
    endPlayers = withResults.map(p => ({
      ...p,
      num_games: gamesPlayed.get(p.rank) ?? 0,
    }));

    currentPlayers = withResults;

    // RSS from nRating (the new calculated ratings) vs start ratings
    let rss = 0;
    for (const p of currentPlayers) {
      const startR = startRatings.get(p.rank) ?? 0;
      const diff = p.nRating - startR;
      rss += diff * diff;
    }
    rssHistory.push(Math.sqrt(rss / currentPlayers.length));
  }

  // Validate and clean any invalid game result entries
  const cleanPlayers = cleanInvalidResults(endPlayers || currentPlayers);

  // Use cleaned end state for player details
  const finalPlayers = cleanPlayers;
  const playerDetails: PlayerDetail[] = finalPlayers.map(p => ({
    rank: p.rank,
    startR: startRatings.get(p.rank) ?? 0,
    endR: p.nRating,
    delta: p.nRating - (startRatings.get(p.rank) ?? 0),
    gamesPlayed: gamesPlayed.get(p.rank) ?? 0,
  }));

  // Final two recalcs on all matches to measure drift
  const final1Result = calculateRatings(currentPlayers, allMatches, { doublePass: false });
  const final1Rss = computeRssFromNRating(final1Result.players, startRatings);

  const final2Result = calculateRatings(final1Result.players, allMatches, { doublePass: false });
  const final2Rss = computeRssFromNRating(final2Result.players, startRatings);

  return {
    config: `${config.label}_${doublePass ? 'dp' : 'sp'}`,
    doublePass,
    final1: final1Rss,
    final2: final2Rss,
    rssHistory,
    playerDetails,
    startPlayers,
    endPlayers: JSON.parse(JSON.stringify(finalPlayers)),
  };
}

function computeRss(players: PlayerData[], startRatings: Map<number, number>): number {
  let rss = 0;
  for (const p of players) {
    const diff = p.rating - (startRatings.get(p.rank) ?? 0);
    rss += diff * diff;
  }
  return Math.sqrt(rss / players.length);
}

function computeRssFromNRating(players: PlayerData[], startRatings: Map<number, number>): number {
  let rss = 0;
  for (const p of players) {
    const diff = p.nRating - (startRatings.get(p.rank) ?? 0);
    rss += diff * diff;
  }
  return Math.sqrt(rss / players.length);
}

// ─── Configurations ───────────────────────────────────────────────────
const configs: StressConfig[] = [];

const playerCounts = [20, 50, 100];
const gameTypes: Array<'2p' | '4p'> = ['2p', '4p'];

let seed = 42;
for (const p of playerCounts) {
  for (const g of gameTypes) {
    configs.push({
      players: p,
      gameType: g,
      seed: seed++,
      label: `${p}p_${g}`,
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────
describe('Rating Stress Test', () => {
  const results: StressResult[] = [];

  for (const config of configs) {
    it(`Single-pass: ${config.label}`, () => {
      const result = runSimulation(config, false);
      results.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  [SP] ${config.label}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });

    it(`Double-pass: ${config.label}`, () => {
      const result = runSimulation(config, true);
      results.push(result);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  [DP] ${config.label}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
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
