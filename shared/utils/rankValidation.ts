import type { PlayerData } from '../types/index.js';

/**
 * Detect duplicate ranks in a players list.
 * Returns formatted strings like "5 (x3)" for each duplicated rank.
 */
export function detectDuplicateRanks(players: PlayerData[]): string[] {
  if (!players || players.length === 0) return [];

  const rankCounts = new Map<number, number>();
  for (const p of players) {
    rankCounts.set(p.rank, (rankCounts.get(p.rank) || 0) + 1);
  }

  const dupRanks: string[] = [];
  for (const [r, c] of rankCounts) {
    if (c > 1) dupRanks.push(`${r} (x${c})`);
  }
  return dupRanks;
}

/**
 * Check for rank gaps (missing ranks between 1 and max).
 * Returns array of missing rank numbers.
 */
export function detectMissingRanks(players: PlayerData[]): number[] {
  if (!players || players.length === 0) return [];

  const ranks = players.map(p => p.rank).sort((a, b) => a - b);
  const maxRank = ranks[ranks.length - 1];
  const expectedRanks = new Set(Array.from({ length: maxRank }, (_, i) => i + 1));
  return ranks.filter(r => !expectedRanks.has(r));
}
