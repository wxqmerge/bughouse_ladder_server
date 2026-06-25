import type { PlayerData } from '../types/index.js';

export interface SanityCheckResult {
  diverged: string[];
  orphanRanks: number[];
  countMismatch: boolean;
  localCount: number;
  clubCount: number;
}

/**
 * Compare local players against club ladder players by rank.
 * Returns diverged players (identity mismatch), orphan ranks (no club match),
 * and count mismatch info.
 */
export function validatePlayersAgainstClubLadder(
  localPlayers: PlayerData[],
  clubPlayers: PlayerData[]
): SanityCheckResult {
  const clubByRank = new Map<number, PlayerData>(clubPlayers.map(p => [p.rank, p]));
  const diverged: string[] = [];
  const orphanRanks: number[] = [];

  for (const lp of localPlayers) {
    const cp = clubByRank.get(lp.rank);
    if (!cp) {
      orphanRanks.push(lp.rank);
      continue;
    }
    if (
      cp.lastName !== lp.lastName ||
      cp.firstName !== lp.firstName ||
      cp.rating !== lp.rating ||
      cp.grade !== lp.grade ||
      cp.trophyEligible !== lp.trophyEligible
    ) {
      diverged.push(`${lp.firstName} ${lp.lastName} (rank ${lp.rank})`);
    }
  }

  return {
    diverged,
    orphanRanks,
    countMismatch: localPlayers.length !== clubPlayers.length,
    localCount: localPlayers.length,
    clubCount: clubPlayers.length,
  };
}

/**
 * Lightweight name-only comparison (for import sanity checks).
 */
export function validatePlayersNamesOnly(
  localPlayers: PlayerData[],
  clubPlayers: PlayerData[]
): SanityCheckResult {
  const clubByRank = new Map<number, PlayerData>(clubPlayers.map(p => [p.rank, p]));
  const diverged: string[] = [];
  const orphanRanks: number[] = [];

  for (const lp of localPlayers) {
    const cp = clubByRank.get(lp.rank);
    if (!cp) {
      orphanRanks.push(lp.rank);
      continue;
    }
    if (cp.lastName !== lp.lastName || cp.firstName !== lp.firstName) {
      diverged.push(`${lp.firstName} ${lp.lastName} (rank ${lp.rank})`);
    }
  }

  return {
    diverged,
    orphanRanks,
    countMismatch: localPlayers.length !== clubPlayers.length,
    localCount: localPlayers.length,
    clubCount: clubPlayers.length,
  };
}
