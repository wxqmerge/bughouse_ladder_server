/**
 * Shared stress test utilities for tournament/game generation.
 * Used by both rating stress test and mini-game trophy stress test.
 */

import type { PlayerData, MatchData } from '../../../shared/types';

// ─── PRNG (Mulberry32) ───────────────────────────────────────────────
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Result Determination ────────────────────────────────────────────
export function determineResult(expected: number, rng: () => number): { score1: number; score2: number } {
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

// ─── Batch Game Generation ───────────────────────────────────────────
/**
 * Round-robin pairing: every player plays every round.
 * Sort by start rating, then pair consecutively so opponents are similar.
 * Use round-robin schedule to rotate opponents each round while keeping ratings balanced.
 * 2p: adjacent pairs. 4p: groups of 4 split into two sides.
 * Sides are flipped randomly to randomize which side is side0/side1.
 * 600-point filter uses start ratings (not current) to prevent drift-based skips.
 */
export function generateBatchGames(
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
