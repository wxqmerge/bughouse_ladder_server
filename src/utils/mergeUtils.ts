import { PlayerData } from '../../shared/types';

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
  return serverPlayers.map((sp) => {
    const localPlayer = localPlayers.find((lp) => lp.rank === sp.rank);
    
    if (!localPlayer || !localPlayer.gameResults) {
      return sp;
    }
    
    const mergedGameResults = [
      ...(sp.gameResults || new Array(31).fill(null)),
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
      if (localResult && localResult.trim() && !localConfirmed) {
        mergedGameResults[r] = localResult;
      } else if (serverConfirmed && !localConfirmed) {
        // Keep server confirmed result
        mergedGameResults[r] = serverResult;
      }
    }
    
    return { 
      ...sp, 
      nRating: localPlayer.nRating !== undefined ? localPlayer.nRating : sp.nRating,
      gameResults: mergedGameResults,
    };
  });
}
