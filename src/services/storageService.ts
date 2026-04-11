/**
 * Storage Service - Wrapper for data persistence
 * 
 * This service provides a consistent API for data access that can
 * work with both localStorage (LOCAL mode) and the DataService (SERVER modes).
 * 
 * This is a transitional layer to help migrate from direct localStorage usage.
 */

import { PlayerData } from '../../shared/types';
import { dataService, DataServiceMode } from './dataService';
import { getProgramMode } from '../utils/mode';

/**
 * Get the storage key prefix based on current mode
 * Local mode ('a') uses 'ladder_' prefix (backward compatible)
 * Dev/Server modes ('d', 's') use 'ladder_server_' prefix for isolation during testing
 */
export function getKeyPrefix(): string {
  const mode = getProgramMode();
  return mode === 'a' ? 'ladder_' : 'ladder_server_';
}

// ==================== BATCH SYNC MANAGEMENT ====================

/**
 * Tracks whether we're in a multi-operation batch
 * When > 0, server sync is deferred until batch ends
 */
let batchOperationCount = 0;

/**
 * Start a batch operation - disables server sync until endBatch() is called
 * Can be nested - use counter to track depth
 */
export function startBatch(): void {
  batchOperationCount++;
}

/**
 * End a batch operation - triggers single server sync if this was the outermost batch
 * Should be called for every startBatch() call
 */
export async function endBatch(): Promise<void> {
  batchOperationCount--;
  
  // Only sync when we exit the outermost batch
  if (batchOperationCount === 0) {
    await performDeferredSync();
  }
}

/**
 * Check if currently in a batch operation
 */
export function isInBatch(): boolean {
  return batchOperationCount > 0;
}

/**
 * Perform the deferred server sync (called at end of batch)
 */
async function performDeferredSync(): Promise<void> {
  // Read current data from localStorage
  const localData = localStorage.getItem('ladder_ladder_players');
  if (!localData) return;
  
  try {
    const players: PlayerData[] = JSON.parse(localData);
    
    // Only sync if in server mode and server is reachable
    if (dataService.getMode() !== DataServiceMode.LOCAL) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout for batch sync
      
      try {
        await dataService.savePlayers(players);
        clearTimeout(timeoutId);
        console.log('[Batch Sync] Successfully synced with server');
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name !== 'AbortError') {
          console.error('[Batch Sync] Failed to sync with server:', error);
        }
      }
    }
  } catch (error) {
    console.error('[Batch Sync] Error reading player data:', error);
  }
}

// ==================== PLAYER DATA ====================

/**
 * Get all players from storage
 */
export async function getPlayers(): Promise<PlayerData[]> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Local mode: use localStorage directly
    const data = localStorage.getItem('ladder_ladder_players');
    return data ? JSON.parse(data) : [];
  } else {
    // Server modes: try server first, then fall back to local storage
    try {
      return await dataService.getPlayers();
    } catch (error) {
      console.error('Failed to fetch players:', error);
      // Fallback to localStorage - try server key first, then local
      let data = localStorage.getItem('ladder_server_ladder_players');
      if (!data) {
        data = localStorage.getItem('ladder_ladder_players');
      }
      return data ? JSON.parse(data) : [];
    }
  }
}

/**
 * Save all players to storage
 * In server mode, saves to BOTH ladder_* and ladder_server_* keys
 * Skips server sync if in batch mode - sync happens at endBatch()
 */
export async function savePlayers(players: PlayerData[]): Promise<void> {
  const playerJson = JSON.stringify(players);
  
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Local mode: use localStorage directly
    localStorage.setItem('ladder_ladder_players', playerJson);
  } else {
    // Server mode: save to BOTH locations
    localStorage.setItem('ladder_ladder_players', playerJson);
    localStorage.setItem('ladder_server_ladder_players', playerJson);
    
    // Skip server sync if in batch mode - will sync at end of batch
    if (!isInBatch()) {
      // Fire-and-forget background sync with 2-second timeout
      (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
          await dataService.savePlayers(players);
          clearTimeout(timeoutId);
        } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name !== 'AbortError') {
            console.error('Failed to save players to server:', error);
          }
        }
      })().catch(() => {});
    }
  }
}

/**
 * Get a single player by rank
 */
export async function getPlayer(rank: number): Promise<PlayerData | undefined> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    const players = await getPlayers();
    return players.find(p => p.rank === rank);
  } else {
    try {
      return await dataService.getPlayer(rank);
    } catch (error) {
      console.error('Failed to fetch player:', error);
      const players = await getPlayers();
      return players.find(p => p.rank === rank);
    }
  }
}

/**
 * Update a single player
 */
export async function updatePlayer(player: PlayerData): Promise<void> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    const players = await getPlayers();
    const index = players.findIndex(p => p.rank === player.rank);
    if (index !== -1) {
      players[index] = player;
      await savePlayers(players);
    }
  } else {
    try {
      await dataService.updatePlayer(player);
    } catch (error) {
      console.error('Failed to update player:', error);
      // Fallback: update locally in both locations
      const players = await getPlayers();
      const index = players.findIndex(p => p.rank === player.rank);
      if (index !== -1) {
        players[index] = player;
        const playerJson = JSON.stringify(players);
        localStorage.setItem('ladder_ladder_players', playerJson);
        localStorage.setItem('ladder_server_ladder_players', playerJson);
      }
    }
  }
}

// ==================== GAME RESULTS ====================

/**
 * Submit a game result for a player
 */
export async function submitGameResult(
  playerRank: number,
  round: number,
  result: string
): Promise<void> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    const players = await getPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player) {
      if (!player.gameResults) {
        player.gameResults = new Array(31).fill(null);
      }
      player.gameResults[round] = result;
      await savePlayers(players);
    }
  } else {
    try {
      await dataService.submitGameResult(playerRank, round, result);
    } catch (error) {
      console.error('Failed to submit game:', error);
      // Fallback: update locally in both locations
      const players = await getPlayers();
      const player = players.find(p => p.rank === playerRank);
      if (player) {
        if (!player.gameResults) {
          player.gameResults = new Array(31).fill(null);
        }
        player.gameResults[round] = result;
        const playerJson = JSON.stringify(players);
        localStorage.setItem('ladder_ladder_players', playerJson);
        localStorage.setItem('ladder_server_ladder_players', playerJson);
      }
    }
  }
}

// ==================== SETTINGS ====================

/**
 * Get ladder settings from localStorage
 * In server mode, prefers ladder_server_* but falls back to ladder_*
 */
export function getSettings(): any {
  let data: string | null = null;
  
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    // Server mode: try server key first, then local
    data = localStorage.getItem('ladder_server_ladder_settings');
    if (!data) {
      data = localStorage.getItem('ladder_ladder_settings');
    }
  } else {
    data = localStorage.getItem('ladder_ladder_settings');
  }
  
  return data ? JSON.parse(data) : {};
}

/**
 * Save ladder settings to localStorage
 * In server mode, saves to BOTH ladder_* and ladder_server_* keys
 */
export function saveSettings(settings: any): void {
  const settingsJson = JSON.stringify(settings);
  localStorage.setItem('ladder_ladder_settings', settingsJson);
  
  // In server mode, also save to server key
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    localStorage.setItem('ladder_server_ladder_settings', settingsJson);
  }
}

/**
 * Get project name
 * In server mode, prefers ladder_server_* but falls back to ladder_*
 */
export function getProjectName(): string {
  let data: string | null = null;
  
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    // Server mode: try server key first, then local
    data = localStorage.getItem('ladder_server_ladder_project_name');
    if (!data) {
      data = localStorage.getItem('ladder_ladder_project_name');
    }
  } else {
    data = localStorage.getItem('ladder_ladder_project_name');
  }
  
  return data || 'Bughouse Chess Ladder';
}

/**
 * Set project name
 * In server mode, saves to BOTH ladder_* and ladder_server_* keys
 */
export function setProjectName(name: string): void {
  localStorage.setItem('ladder_ladder_project_name', name);
  
  // In server mode, also save to server key
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    localStorage.setItem('ladder_server_ladder_project_name', name);
  }
}

/**
 * Get zoom level
 * In server mode, prefers ladder_server_* but falls back to ladder_*
 */
export function getZoomLevel(): number {
  let data: string | null = null;
  
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    // Server mode: try server key first, then local
    data = localStorage.getItem('ladder_server_ladder_zoom');
    if (!data) {
      data = localStorage.getItem('ladder_ladder_zoom');
    }
  } else {
    data = localStorage.getItem('ladder_ladder_zoom');
  }
  
  return data ? Number(data) : 100;
}

/**
 * Set zoom level
 * In server mode, saves to BOTH ladder_* and ladder_server_* keys
 */
export function setZoomLevel(level: number): void {
  const levelStr = level.toString();
  localStorage.setItem('ladder_ladder_zoom', levelStr);
  
  // In server mode, also save to server key
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    localStorage.setItem('ladder_server_ladder_zoom', levelStr);
  }
}

// ==================== UTILITY ====================

/**
 * Clear all ladder data
 * Clears both ladder_* and ladder_server_* keys
 */
export async function clearAllData(): Promise<void> {
  // Clear local keys
  localStorage.removeItem('ladder_ladder_players');
  localStorage.removeItem('ladder_ladder_settings');
  localStorage.removeItem('ladder_ladder_project_name');
  localStorage.removeItem('ladder_ladder_zoom');
  
  // Clear server keys
  localStorage.removeItem('ladder_server_ladder_players');
  localStorage.removeItem('ladder_server_ladder_settings');
  localStorage.removeItem('ladder_server_ladder_project_name');
  localStorage.removeItem('ladder_server_ladder_zoom');
  
  // In server modes, you might want to call an API endpoint here
}
