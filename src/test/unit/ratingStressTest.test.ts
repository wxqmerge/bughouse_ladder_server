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
 * Sort by rating, then pair consecutively so opponents are similar.
 * Use round-robin schedule to rotate opponents each round while keeping ratings balanced.
 * 2p: adjacent pairs. 4p: groups of 4 split into two sides.
 * Sides are flipped randomly to randomize which side is side0/side1.
 */
function generateBatchGames(
  players: PlayerData[],
  gameType: '2p' | '4p',
  rng: () => number,
  roundIndex: number,
): MatchData[] {
  const games: MatchData[] = [];
  const groupSize = gameType === '2p' ? 2 : 4;

  // Sort by rating so opponents are similar
  const sorted = [...players].sort((a, b) => a.rating - b.rating);
  const n = sorted.length;

// 2p: standard round-robin (ends-inward pairing, no duplicates)
  // 4p: round-robin pairs merged with shifting offset each round
  const groups: PlayerData[][] = [];

  if (groupSize === 2) {
    const rest: number[] = Array.from({ length: n - 1 }, (_, i) => i + 1);
    const rot = roundIndex % (n - 1);
    const rotated = [...rest.slice(n - 1 - rot), ...rest.slice(0, n - 1 - rot)];
    const order = [0, ...rotated];
    for (let i = 0; i < n / 2; i++) {
      groups.push([sorted[order[i]], sorted[order[n - 1 - i]]]);
    }
  } else {
    // 4p: build round-robin pairs, then merge with shifting offset
    // Each round uses a different merge offset to create different groupings
    const rest: number[] = Array.from({ length: n - 1 }, (_, i) => i + 1);
    const rot = roundIndex % (n - 1);
    const rotated = [...rest.slice(n - 1 - rot), ...rest.slice(0, n - 1 - rot)];
    const order = [0, ...rotated];
    const pairs: PlayerData[][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([sorted[order[i]], sorted[order[n - 1 - i]]]);
    }
    // Merge pairs with a shifting offset each round
    // Rotate pairs list by offset, then merge consecutive pairs
    const offset = roundIndex % pairs.length;
    const rotatedPairs = [...pairs.slice(pairs.length - offset), ...pairs.slice(0, pairs.length - offset)];
    for (let i = 0; i < rotatedPairs.length; i += 2) {
      if (i + 1 < rotatedPairs.length) {
        groups.push([...rotatedPairs[i], ...rotatedPairs[i + 1]]);
      }
    }
  }

  for (const group of groups) {
    let side0 = group.slice(0, groupSize / 2);
    let side1 = group.slice(groupSize / 2);

    // Randomly flip which side is side0/side1
    if (rng() > 0.5) {
      [side0, side1] = [side1, side0];
    }

    // Elo expected: signed diff so expected < 0.5 when side0 is weaker
    const side0Avg = side0.reduce((s, p) => s + p.rating, 0) / side0.length;
    const side1Avg = side1.reduce((s, p) => s + p.rating, 0) / side1.length;
    const rawDiff = side0Avg - side1Avg;
    const clampedDiff = Math.min(Math.abs(rawDiff), 400) * Math.sign(rawDiff);
    const expected = 1 / (1 + Math.pow(10, -clampedDiff / 400));
    const result = determineResult(expected, rng);

    if (groupSize === 2) {
      // 2p: player1 vs player2
      games.push({
        player1: side0[0].rank,
        player2: side1[0].rank,
        player3: 0,
        player4: 0,
        score1: result.score1,
        score2: result.score2,
        side0Won: result.score1 > result.score2,
      });
    } else {
      // 4p: side0 (player1, player2) vs side1 (player3, player4)
      games.push({
        player1: side0[0].rank,
        player2: side0[1].rank,
        player3: side1[0].rank,
        player4: side1[1].rank,
        score1: result.score1,
        score2: result.score2,
        side0Won: result.score1 > result.score2,
      });
    }
  }

  return games;
}

// ─── Simulation ───────────────────────────────────────────────────────
function runSimulation(config: StressConfig): StressResult {
  const rng = mulberry32(config.seed);
  let numPlayers = config.players;
  const totalRounds = Math.min(config.rounds ?? 20, Math.floor(numPlayers / 2));

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
    const batchGames = generateBatchGames(players, config.gameType, rng, round);
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

  for (const config of quickConfigs) {
    const ngLabel = config.numGamesMode === 'new' ? 'ng0' : config.numGamesMode === 'mixed' ? 'ng0-10' : 'ng20';
    it(`1r_${config.label}_${ngLabel}`, () => {
      const result = runSimulation(config);
      const finalRss = result.rssHistory[result.rssHistory.length - 1] ?? 0;
      console.log(`  1r_${config.label}_${ngLabel}: FinalRSS=${finalRss.toFixed(2)}, F1=${result.final1.toFixed(2)}, F2=${result.final2.toFixed(2)}`);
    });
  }
});
