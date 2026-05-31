import { PlayerData } from '../../shared/types';
import { deduplicatePlayers } from '../../shared/utils/dedupUtils';
import { NUM_ROUNDS } from '../../shared/utils/constants';

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
  const result = serverPlayers.map((sp) => {
    const localPlayer = localPlayers.find((lp) => lp.rank === sp.rank);
    
    if (!localPlayer || !localPlayer.gameResults) {
      return sp;
    }
    
    const mergedGameResults = [
      ...(sp.gameResults || new Array(NUM_ROUNDS).fill(null)),
    ];
    
    for (let r = 0; r < 31; r++) {
      const cellKey = `${localPlayer.rank}:${r}`;
      
      // Check if this cell was deleted locally but not yet synced
      if (pendingDeletes.has(cellKey)) {
        mergedGameResults[r] = '';
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
  for (const lp of localPlayers) {
    const serverHasRank = serverPlayers.find(sp => sp.rank === lp.rank);
    if (!serverHasRank) {
      result.push({ ...lp });
    } else {
      console.debug(`[DEBUG MERGE] DROPPED local player "${lp.firstName} ${lp.lastName}" rank=${lp.rank} — server already has "${serverHasRank.firstName} ${serverHasRank.lastName}" at that rank`);
    }
  }

  // Deduplicate by name to prevent duplicate entries
  return deduplicatePlayers(result);
}
