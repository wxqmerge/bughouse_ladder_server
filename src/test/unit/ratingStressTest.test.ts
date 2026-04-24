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
import { calculateRatings } from '../../../shared/utils/hashUtils';
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
}

// ─── Player Creation ──────────────────────────────────────────────────
function createPlayer(rank: number, rating: number): PlayerData {
  return {
    rank,
    group: 'A',
    lastName: `P${rank}`,
    firstName: '',
    rating,
    nRating: 0,
    trophyEligible: true,
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

// ─── Game Result Determination ────────────────────────────────────────
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

// ─── Batch Game Generation ────────────────────────────────────────────
function generateBatchGames(
  players: PlayerData[],
  gameType: '2p' | '4p',
  rng: () => number,
): MatchData[] {
  const games: MatchData[] = [];
  const used = new Set<number>();

  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (gameType === '2p') {
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];

      if (used.has(p1.rank) || used.has(p2.rank)) continue;
      used.add(p1.rank);
      used.add(p2.rank);

      const diff = Math.abs(p1.rating - p2.rating);
      const clampedDiff = Math.min(diff, 400);
      const expected = 1 / (1 + Math.pow(10, -clampedDiff / 400));

      const result = determineResult(expected, rng);

      games.push({
        player1: p1.rank,
        player2: 0,
        player3: p2.rank,
        player4: 0,
        score1: result.score1,
        score2: result.score2,
        side0Won: result.score1 > result.score2,
      });
    }
  } else {
    for (let i = 0; i + 3 < shuffled.length; i += 4) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];
      const p3 = shuffled[i + 2];
      const p4 = shuffled[i + 3];

      if (used.has(p1.rank) || used.has(p2.rank) || used.has(p3.rank) || used.has(p4.rank)) continue;
      used.add(p1.rank);
      used.add(p2.rank);
      used.add(p3.rank);
      used.add(p4.rank);

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
/**
 * Simulated New Day: updates rating from nRating, resets nRating,
 * but preserves num_games so calculateRatings reads from the right column.
 */
function simulatedNewDay(players: PlayerData[]): PlayerData[] {
  return players.map(p => ({
    ...p,
    rating: p.trophyEligible !== false ? p.nRating : 0,
    nRating: 0,
    gameResults: Array(31).fill(null),
  }));
}

function runSimulation(config: StressConfig, doublePass: boolean): StressResult {
  const rng = mulberry32(config.seed);
  const numPlayers = config.players;
  const totalRounds = Math.max(4, Math.floor(numPlayers / 5));

  const players: PlayerData[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const rating = 1200 + (i - numPlayers / 2) * 40;
    players.push(createPlayer(i, Math.round(rating)));
  }

  const startRatings = players.map(p => p.rating);
  const rssHistory: number[] = [];
  let currentPlayers = players;
  const gamesPlayed = new Map<number, number>();
  let lastBatchGames: MatchData[] = [];

  for (let round = 0; round < totalRounds; round++) {
    const batchGames = generateBatchGames(currentPlayers, config.gameType, rng);
    if (batchGames.length === 0) break;

    lastBatchGames = batchGames;

    // Count games per player this round
    for (const m of batchGames) {
      gamesPlayed.set(m.player1, (gamesPlayed.get(m.player1) ?? 0) + 1);
      if (m.player2) gamesPlayed.set(m.player2, (gamesPlayed.get(m.player2) ?? 0) + 1);
      if (m.player3) gamesPlayed.set(m.player3, (gamesPlayed.get(m.player3) ?? 0) + 1);
      if (m.player4) gamesPlayed.set(m.player4, (gamesPlayed.get(m.player4) ?? 0) + 1);
    }

    // Update num_games so calculateRatings reads from rating column
    for (const p of currentPlayers) {
      p.num_games = gamesPlayed.get(p.rank) ?? 0;
    }

    const result = calculateRatings(currentPlayers, batchGames, { doublePass });
    currentPlayers = result.players;

    // Simulated New Day: rating = nRating, nRating = 0, preserve num_games
    currentPlayers = simulatedNewDay(currentPlayers);

    let rss = 0;
    for (const p of currentPlayers) {
      const startR = startRatings[p.rank];
      const diff = p.rating - startR;
      rss += diff * diff;
    }
    rssHistory.push(Math.sqrt(rss / currentPlayers.length));
  }

  // Final two recalcs: recalc → New Day → recalc again on same batch
  // to measure how much ratings still drift when fed back through
  for (const p of currentPlayers) {
    p.num_games = gamesPlayed.get(p.rank) ?? 0;
  }

  const final1Result = calculateRatings(currentPlayers, lastBatchGames, { doublePass: false });
  const final1Rss = computeRssFromNRating(final1Result.players, startRatings);

  // Apply New Day: rating = nRating, nRating = 0
  let final1Players = simulatedNewDay(final1Result.players);
  for (const p of final1Players) {
    p.num_games = gamesPlayed.get(p.rank) ?? 0;
  }

  const final2Result = calculateRatings(final1Players, lastBatchGames, { doublePass: false });
  const final2Rss = computeRssFromNRating(final2Result.players, startRatings);

  // Apply final ratings for player details
  currentPlayers = simulatedNewDay(final2Result.players);

  const playerDetails: PlayerDetail[] = currentPlayers.map(p => ({
    rank: p.rank,
    startR: startRatings[p.rank],
    endR: p.rating,
    delta: p.rating - startRatings[p.rank],
    gamesPlayed: gamesPlayed.get(p.rank) ?? 0,
  }));

  return {
    config: `${config.label}_${doublePass ? 'dp' : 'sp'}`,
    doublePass,
    final1: final1Rss,
    final2: final2Rss,
    rssHistory,
    playerDetails,
  };
}

function computeRss(players: PlayerData[], startRatings: number[]): number {
  let rss = 0;
  for (const p of players) {
    const diff = p.rating - startRatings[p.rank];
    rss += diff * diff;
  }
  return Math.sqrt(rss / players.length);
}

function computeRssFromNRating(players: PlayerData[], startRatings: number[]): number {
  let rss = 0;
  for (const p of players) {
    const diff = p.nRating - startRatings[p.rank];
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
      let tabContent = `Rank\tStartR\tEndR\tDelta\tGamesPlayed\n`;
      for (const pd of result.playerDetails) {
        tabContent += `${pd.rank}\t${pd.startR}\t${pd.endR}\t${pd.delta}\t${pd.gamesPlayed}\n`;
      }
      fs.writeFileSync(path.join(outDir, `${result.config}.tab`), tabContent);
    }

    console.log(`\nReports written to ${outDir}/`);
  });
});
