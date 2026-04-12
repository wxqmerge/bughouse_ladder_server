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
 * Buffer for holding player data during batch operations
 * During batch mode, changes are held here instead of writing to localStorage
 * At endBatch(), we write once to localStorage AND sync once to server
 */
let batchBuffer: PlayerData[] | null = null;

/**
 * Start a batch operation - disables localStorage writes until endBatch() is called
 * Can be nested - use counter to track depth
 */
export function startBatch(): void {
  if (batchOperationCount === 0) {
    // First level of nesting - load current data into buffer
    const localData = localStorage.getItem('ladder_ladder_players');
    batchBuffer = localData ? JSON.parse(localData) : [];
  }
  batchOperationCount++;
}

/**
 * End a batch operation - commits buffer to localStorage and triggers server sync
 * Should be called for every startBatch() call
 */
export async function endBatch(): Promise<void> {
  batchOperationCount--;
  
  // Only commit when we exit the outermost batch
  if (batchOperationCount === 0 && batchBuffer !== null) {
    await commitBatchBuffer();
    batchBuffer = null;
  }
}

/**
 * Check if currently in a batch operation
 */
export function isInBatch(): boolean {
  return batchOperationCount > 0;
}

/**
 * Get current player data (from buffer during batch, from storage otherwise)
 * This ensures operations always work with the latest data
 */
function getCurrentPlayers(): PlayerData[] {
  if (batchBuffer !== null) {
    return batchBuffer;
  }
  const localData = localStorage.getItem('ladder_ladder_players');
  return localData ? JSON.parse(localData) : [];
}

/**
 * Commit the batch buffer to localStorage and sync to server
 */
async function commitBatchBuffer(): Promise<void> {
  if (!batchBuffer) return;
  
  const playerJson = JSON.stringify(batchBuffer);
  
  // Write to localStorage (both keys in server mode)
  localStorage.setItem('ladder_ladder_players', playerJson);
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    localStorage.setItem('ladder_server_ladder_players', playerJson);
  }
  
  // Sync to server (fire-and-forget)
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout
    
    try {
      await dataService.savePlayers(batchBuffer);
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      // Silently ignore - this is fire-and-forget, data saved locally
    }
  }
}

// ==================== PLAYER DATA ====================

/**
 * Get all players from storage
 * During batch mode, returns from buffer to ensure latest data
 */
export async function getPlayers(): Promise<PlayerData[]> {
  // During batch mode, return from buffer if available
  if (isInBatch() && batchBuffer !== null) {
    return batchBuffer;
  }
  
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
 * During batch mode, holds data in memory - commits at endBatch()
 */
export async function savePlayers(players: PlayerData[]): Promise<void> {
  // During batch mode, update the buffer instead of writing to localStorage
  if (isInBatch()) {
    batchBuffer = players;
    return;
  }
  
  const playerJson = JSON.stringify(players);
  
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Local mode: use localStorage directly
    localStorage.setItem('ladder_ladder_players', playerJson);
  } else {
    // Server mode: save to BOTH locations
    localStorage.setItem('ladder_ladder_players', playerJson);
    localStorage.setItem('ladder_server_ladder_players', playerJson);
    
    // Background sync to server
    (async () => {
      try {
        const serverUrl = dataService.getConfigServerUrl();
        if (!serverUrl) return;
        
        const response = await fetch(`${serverUrl}/api/ladder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players }),
        });
        if (response.ok) {
          console.log('[SYNC] ✓ Saved to server');
        } else {
          console.error(`[SYNC] ✗ Server returned ${response.status}`);
        }
      } catch (error: any) {
        console.error('[SYNC] ✗ Failed:', error.message);
      }
    })();
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
    // Use getCurrentPlayers to respect batch buffer
    const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
    const index = players.findIndex(p => p.rank === player.rank);
    if (index !== -1) {
      players[index] = player;
      await savePlayers(players);
    }
  }
}

// ==================== GAME RESULTS ====================

/**
 * Clear a single game result cell
 */
export async function clearPlayerCell(playerRank: number, roundIndex: number): Promise<void> {
  // Use getCurrentPlayers to respect batch buffer
  const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
  const player = players.find(p => p.rank === playerRank);
  if (player) {
    if (!player.gameResults) {
      player.gameResults = new Array(31).fill(null);
    }
    player.gameResults[roundIndex] = null;
    await savePlayers(players);
  }
}

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
    // Use getCurrentPlayers to respect batch buffer
    const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player) {
      if (!player.gameResults) {
        player.gameResults = new Array(31).fill(null);
      }
      player.gameResults[round] = result;
      await savePlayers(players);
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

/**
 * Explicit save to server - blocks until complete or fails
 * Use this for the Save command that users explicitly invoke
 */
export async function saveToServer(): Promise<{ success: boolean; error?: string }> {
  const players = await getPlayers();
  
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    return { success: true };
  }
  
  try {
    const serverUrl = dataService.getConfigServerUrl();
    if (!serverUrl) return { success: false, error: 'No server URL configured' };
    
    const response = await fetch(`${serverUrl}/api/ladder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });
    
    if (!response.ok) {
      return { success: false, error: `Server returned ${response.status}` };
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
