import { PlayerData, DEFAULT_GAME_RESULTS } from '../../shared/types';
import { deduplicatePlayers } from '../../shared/utils/dedupUtils';

/**
 * Merge server data with local changes.
 * 
 * Priority: pending deletes > local unconfirmed > server confirmed > server unconfirmed
 * 
 * @param serverPlayers - Data from server (base)
 * @param localPlayers - Local data to merge on top of
 * @param pendingDeletes - Set of "rank:round" keys that were locally deleted
 * @returns Merged player list
 */
export function mergeServerWithLocal(
  serverPlayers: PlayerData[],
  localPlayers: PlayerData[],
  pendingDeletes: Set<string> = new Set()
): PlayerData[] {
  const localByRank = new Map(localPlayers.map(lp => [lp.rank, lp]));
  const result = serverPlayers.map((sp) => {
    const localPlayer = localByRank.get(sp.rank);

    if (!localPlayer || !localPlayer.gameResults) {
      return sp;
    }

    const mergedGameResults = sp.gameResults ? [...sp.gameResults] : [...DEFAULT_GAME_RESULTS];

    for (let r = 0; r < 31; r++) {
      const cellKey = `${localPlayer.rank}:${r}`;
      
      // Check if this cell was deleted locally but not yet synced
      if (pendingDeletes.has(cellKey)) {
        mergedGameResults[r] = null;
        continue;
      }
      
      // Merge unconfirmed local entries with server data
      const localResult = localPlayer.gameResults[r];
      const serverResult = sp.gameResults?.[r];
      
      const localConfirmed = localResult?.endsWith('_') || false;
      const serverConfirmed = serverResult?.endsWith('_') || false;
      
      // Priority: local unconfirmed > server confirmed > server unconfirmed
      // Local unconfirmed only wins if server hasn't already confirmed this cell
      if (localResult && localResult.trim() && !localConfirmed && !serverConfirmed) {
        mergedGameResults[r] = localResult;
      } else if (serverConfirmed && !localConfirmed) {
        // Keep server confirmed result
        mergedGameResults[r] = serverResult;
      }
    }
    
    return { 
      ...sp, 
      nRating: Math.abs(localPlayer.nRating !== undefined ? localPlayer.nRating : sp.nRating),
      trophyEligible: localPlayer.trophyEligible !== undefined ? localPlayer.trophyEligible : true,
      gameResults: mergedGameResults,
    };
  });

  // Append players that exist locally but not on server
  const serverRanks = new Set(serverPlayers.map(sp => sp.rank));
  for (const lp of localPlayers) {
    if (!serverRanks.has(lp.rank)) {
      result.push({ ...lp });
    }
  }

  // Deduplicate by name to prevent duplicate entries
  return deduplicatePlayers(result);
}

/**
 * Conservative merge used when caching a fresh server snapshot locally
 * (polling / background refresh / fetchPlayers). The server is the base,
 * but pending-deleted cells become null and locally typed cells survive
 * unless the server has already confirmed that cell. Unlike
 * mergeServerWithLocal this never dedupes and never rewrites identity
 * fields — it must not destroy local-only rows.
 */
export function mergeServerSnapshot(
  serverPlayers: PlayerData[],
  localPlayers: PlayerData[],
  pendingDeletes: Set<string> = new Set()
): PlayerData[] {
  const localByRank = new Map(localPlayers.map(lp => [lp.rank, lp]));

  const result = serverPlayers.map(sp => {
    const localPlayer = localByRank.get(sp.rank);
    if (!localPlayer?.gameResults) {
      return { ...sp };
    }

    const serverResults = sp.gameResults ? [...sp.gameResults] : [...DEFAULT_GAME_RESULTS];
    const mergedGameResults = [...serverResults];

    for (let r = 0; r < mergedGameResults.length; r++) {
      const localResult = localPlayer.gameResults[r];
      const serverResult = serverResults[r];
      const serverConfirmed = typeof serverResult === 'string' && serverResult.endsWith('_');

      if (pendingDeletes.has(`${sp.rank}:${r}`)) {
        mergedGameResults[r] = null;
      } else if (localResult && localResult.trim() && !serverConfirmed) {
        mergedGameResults[r] = localResult;
      } else {
        mergedGameResults[r] = serverResult ?? null;
      }
    }

    return { ...sp, gameResults: mergedGameResults };
  });

  // Keep players that only exist locally (e.g. an add that has not been
  // confirmed by the server yet) so auto-sync cannot delete them.
  const serverRanks = new Set(serverPlayers.map(sp => sp.rank));
  for (const lp of localPlayers) {
    if (!serverRanks.has(lp.rank)) {
      result.push({ ...lp });
    }
  }

  return result;
}
