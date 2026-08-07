import type { PlayerData } from '../types/index.js';

export interface SanityCheckResult {
  diverged: string[];
  orphanRanks: number[];
  countMismatch: boolean;
  localCount: number;
  clubCount: number;
}

export interface MiniGameValidationResult {
  /** Players in mini-game that have no matching club ladder player (by name). */
  orphans: string[];
  /** Players that exist in both but have mismatched identity fields (excluding nRating/gameResults). */
  diverged: string[];
  /** Players in club ladder that are missing from the mini-game. */
  missingFromMini: string[];
  /** True if player counts differ. */
  countMismatch: boolean;
  miniCount: number;
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

/**
 * Validate a mini-game file's players against the club ladder by name.
 * Used during import to detect mismatches before reconciliation.
 * Returns a report of orphans, diverged players, and missing players.
 */
export function validateMiniGameAgainstClubLadder(
  miniPlayers: PlayerData[],
  clubPlayers: PlayerData[]
): MiniGameValidationResult {
  const clubByName = new Map<string, PlayerData>();
  for (const p of clubPlayers) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`;
    clubByName.set(key, p);
  }

  const orphans: string[] = [];
  const diverged: string[] = [];
  const foundKeys = new Set<string>();

  for (const mp of miniPlayers) {
    const key = `${mp.lastName.toLowerCase()}|${mp.firstName.toLowerCase()}`;
    const cp = clubByName.get(key);

    if (!cp) {
      orphans.push(`${mp.firstName} ${mp.lastName} (rank ${mp.rank})`);
      continue;
    }

    foundKeys.add(key);

    // Check identity fields (exclude nRating and gameResults, which are mini-game-specific)
    if (
      cp.lastName !== mp.lastName ||
      cp.firstName !== mp.firstName ||
      cp.rating !== mp.rating ||
      cp.grade !== mp.grade ||
      cp.trophyEligible !== mp.trophyEligible ||
      cp.rank !== mp.rank
    ) {
      diverged.push(`${mp.firstName} ${mp.lastName} (mini rank ${mp.rank}, club rank ${cp.rank})`);
    }
  }

  const missingFromMini: string[] = [];
  for (const [key, cp] of clubByName) {
    if (!foundKeys.has(key)) {
      missingFromMini.push(`${cp.firstName} ${cp.lastName} (rank ${cp.rank})`);
    }
  }

  return {
    orphans,
    diverged,
    missingFromMini,
    countMismatch: miniPlayers.length !== clubPlayers.length,
    miniCount: miniPlayers.length,
    clubCount: clubPlayers.length,
  };
}
