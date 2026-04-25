/**
 * Storage Service - Wrapper for data persistence
 * 
 * This service provides a consistent API for data access that can
 * work with both localStorage (LOCAL mode) and the DataService (SERVER modes).
 * 
 * This is a transitional layer to help migrate from direct localStorage usage.
 */

import { PlayerData } from '../../shared/types';
import { log } from '../utils/log';
import { dataService, DataServiceMode } from './dataService';
import { getProgramMode } from '../utils/mode';
import { loadUserSettings, normalizeServerUrl } from './userSettingsStorage';

/**
 * Get the storage key prefix based on current mode
 * Local mode uses 'ladder_' prefix (backward compatible)
 * Dev/Server modes use 'ladder_server_' prefix for isolation during testing
 */
export function getKeyPrefix(): string {
  const mode = getProgramMode();
  return mode === 'local' || mode === 'server_down' ? 'ladder_' : 'ladder_server_';
}

// ==================== SAVE STATUS TRACKING ====================

/**
 * Tracks save status per cell: "playerRank:round" -> boolean (true = saved)
 * A cell is considered saved if it has been persisted to localStorage (local mode)
 * or to server (server mode). The "_" suffix in the UI indicates saved status.
 */
const saveStatusMap = new Map<string, boolean>();

/**
 * Get key for save status map
 */
function getSaveStatusKey(playerRank: number, round: number): string {
  return `${playerRank}:${round}`;
}

/**
 * Check if a cell has been saved
 */
export function isCellSaved(playerRank: number, round: number): boolean {
  const key = getSaveStatusKey(playerRank, round);
  return saveStatusMap.get(key) === true;
}

/**
 * Mark a cell as saved
 */
export function markCellAsSaved(playerRank: number, round: number): void {
  const key = getSaveStatusKey(playerRank, round);
  saveStatusMap.set(key, true);
}

/**
 * Mark a cell as unsaved
 */
export function markCellAsUnsaved(playerRank: number, round: number): void {
  const key = getSaveStatusKey(playerRank, round);
  saveStatusMap.set(key, false);
}

/**
 * Clear save status for all cells (called on recalculate)
 */
export function clearAllSaveStatus(): void {
  saveStatusMap.clear();
}

// ==================== LOCAL CHANGES TRACKING ====================

/**
 * Tracks whether user has made local changes that haven't been synced to server
 * Set to true when user enters game results or makes other modifications while offline
 * Reset to false after successful server sync
 */
let hasLocalChanges = false;

/**
 * Tracks whether we're in server down mode (server configured but unreachable)
 * In this mode, only game entry is allowed, and changes are pending sync
 */
let serverDownMode = false;

/**
 * Pending sync queue - linked list of game results waiting to be sent to server
 * Each entry: { playerRank, round, result, timestamp }
 * Managed as a simple array for now (can be optimized to linked list if needed)
 */
interface PendingSyncEntry {
  playerRank: number;
  round: number;
  result: string;
  timestamp: number;
}

let pendingSyncQueue: PendingSyncEntry[] = [];

/**
 * Mark that local changes have been made
 */
export function markLocalChanges(): void {
  if (!hasLocalChanges) {
    hasLocalChanges = true;
    log('[STORAGE]', 'Local changes detected');
  }
}

/**
 * Check if there are unsynced local changes
 */
export function getHasLocalChanges(): boolean {
  return hasLocalChanges;
}

/**
 * Clear the local changes flag (called after successful server sync)
 */
export function clearLocalChangesFlag(): void {
  hasLocalChanges = false;
  log('[STORAGE]', 'Local changes synced to server');
}

/**
 * Set server down mode status
 */
function setServerDownMode(isDown: boolean): void {
  serverDownMode = isDown;
  log('[STORAGE]', 'Server down mode: ' + (isDown ? 'ON' : 'OFF'));
}

/**
 * Check if server is in down mode
 */
function getServerDownMode(): boolean {
  return serverDownMode;
}

// ==================== PENDING SYNC QUEUE ====================

/**
 * Load pending sync queue from localStorage on init
 */
function loadPendingSyncQueue(): void {
  try {
    const stored = localStorage.getItem(getKeyPrefix() + 'ladder_pending_sync');
    if (stored) {
      pendingSyncQueue = JSON.parse(stored);
      log('[STORAGE]', 'Loaded ' + pendingSyncQueue.length + ' pending sync entries');
    }
  } catch (err) {
    log('[STORAGE]', 'Failed to load pending sync queue:', err);
    pendingSyncQueue = [];
  }
}

// Load on module init
loadPendingSyncQueue();

/**
 * Save pending sync queue to localStorage
 */
function savePendingSyncQueue(): void {
  try {
    localStorage.setItem(getKeyPrefix() + 'ladder_pending_sync', JSON.stringify(pendingSyncQueue));
  } catch (err) {
    log('[STORAGE]', 'Failed to save pending sync queue:', err);
  }
}

/**
 * Add entry to pending sync queue
 */
export function addPendingSync(playerRank: number, round: number, result: string): void {
  // Check if entry already exists
  const existingIndex = pendingSyncQueue.findIndex(
    e => e.playerRank === playerRank && e.round === round
  );
  
  if (existingIndex >= 0) {
    // Update existing entry
    pendingSyncQueue[existingIndex] = {
      playerRank,
      round,
      result,
      timestamp: Date.now()
    };
  } else {
    // Add new entry
    pendingSyncQueue.push({
      playerRank,
      round,
      result,
      timestamp: Date.now()
    });
  }
  
  savePendingSyncQueue();
  log('[STORAGE]', 'Added to pending sync queue (' + pendingSyncQueue.length + ' total)');
}

/**
 * Clear pending sync queue (called after successful server sync)
 */
export function clearPendingSyncQueue(): void {
  const count = pendingSyncQueue.length;
  pendingSyncQueue = [];
  savePendingSyncQueue();
  log('[STORAGE]', 'Cleared ' + count + ' pending sync entries');
}

/**
 * Get pending sync queue
 */
export function getPendingSyncQueue(): PendingSyncEntry[] {
  return [...pendingSyncQueue];
}

/**
 * Check if there are pending sync entries
 */
export function hasPendingSync(): boolean {
  return pendingSyncQueue.length > 0;
}

/**
 * Get count of pending sync entries
 */
export function getPendingSyncCount(): number {
  return pendingSyncQueue.length;
}

// ==================== PENDING DELETES TRACKING ====================

/**
 * Queue a cell delete for offline resilience
 * Sends immediate DELETE request (non-blocking), queues for retry if fails
 */
export function queueDelete(playerRank: number, round: number): void {
  const key = `${playerRank}:${round}`;
  
  // Add to pending queue
  let deletes = new Set(
    JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_pending_deletes') || '[]')
  );
  deletes.add(key);
  localStorage.setItem(getKeyPrefix() + 'ladder_pending_deletes', JSON.stringify([...deletes]));
  
  // Try immediate DELETE (non-blocking)
  (async () => {
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      if (serverUrl) {
        await fetch(`${serverUrl}/api/ladder/${playerRank}/round/${round}`, {
          method: 'DELETE'
        });
        // Remove from queue on success
        deletes.delete(key);
        localStorage.setItem(getKeyPrefix() + 'ladder_pending_deletes', JSON.stringify([...deletes]));
      }
    } catch (err) {
      log('[STORAGE]', 'Delete queued for retry:', key);
    }
  })();
}

/**
 * Get all pending deletes from queue
 */
export function getPendingDeletes(): Set<string> {
  return new Set(
    JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_pending_deletes') || '[]')
  );
}

/**
 * Clear pending delete queue (call after successful save)
 */
export function clearPendingDeletes(): void {
  localStorage.removeItem(getKeyPrefix() + 'ladder_pending_deletes');
}

/**
 * Replay all pending deletes to server
 */
export async function replayPendingDeletes(): Promise<void> {
  const deletes = getPendingDeletes();
  if (deletes.size === 0) return;
  
  const userSettings = loadUserSettings();
  const serverUrl = userSettings.server?.trim();
  if (!serverUrl) {
    log('[STORAGE]', 'No server configured, cannot replay deletes');
    return;
  }
  
  log('[STORAGE]', `Replaying ${deletes.size} pending deletes...`);
  
  for (const key of deletes) {
    const [rankStr, roundStr] = key.split(':');
    const rank = parseInt(rankStr);
    const round = parseInt(roundStr);
    
    try {
      await fetch(`${serverUrl}/api/ladder/${rank}/round/${round}`, {
        method: 'DELETE'
      });
    } catch (err) {
      log('[STORAGE]', `Failed to replay delete ${key}:`, err);
    }
  }
  
  // Clear queue after replay attempt
  clearPendingDeletes();
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
    (window as any).__ladder_setStatus?.('Reading localStorage...');
    const data = localStorage.getItem('ladder_ladder_players');
    const players = data ? JSON.parse(data) : [];
    (window as any).__ladder_setStatus?.(null);
    return players;
  } else {
    // Server modes: try server first, then fall back to local storage
    (window as any).__ladder_setStatus?.('Fetching from server...');
    try {
      const players = await dataService.getPlayers();
      (window as any).__ladder_setStatus?.(null);
      return players;
    } catch (error) {
      log('[STORAGE]', 'Failed to fetch players:', error);
      (window as any).__ladder_setStatus?.('Using cached data...');
      // Fallback to localStorage - try server key first, then local
      let data = localStorage.getItem('ladder_server_ladder_players');
      if (!data) {
        data = localStorage.getItem('ladder_ladder_players');
      }
      const players = data ? JSON.parse(data) : [];
      (window as any).__ladder_setStatus?.(null);
      return players;
    }
  }
}

/**
 * Save all players to storage
 * In server mode, saves to BOTH ladder_* and ladder_server_* keys
 * During batch mode, holds data in memory - commits at endBatch()
 */
export interface SaveResult {
  success: boolean;
  serverSynced: boolean;
  error?: string;
}

export async function savePlayers(players: PlayerData[], waitForServer = false, skipServerSync = false): Promise<SaveResult> {
  // During batch mode, update the buffer instead of writing to localStorage
  if (isInBatch()) {
    batchBuffer = players;
    return { success: true, serverSynced: false };
  }
  
  const playerJson = JSON.stringify(players);
  
  const mode = dataService.getMode();
  const userSettings = loadUserSettings();
  const serverUrl = userSettings.server?.trim() || '';
  
  console.log('[savePlayers] Mode:', mode, 'Server URL configured:', !!serverUrl);
  
  if (mode === DataServiceMode.LOCAL && !serverUrl) {
    // Local mode with no server: use localStorage directly - mark all cells as saved
    localStorage.setItem('ladder_ladder_players', playerJson);
    // Mark all non-empty cells as saved in local mode
    for (const player of players) {
      if (player.gameResults) {
        for (let r = 0; r < player.gameResults.length; r++) {
          const result = player.gameResults[r];
          if (result != null && typeof result === 'string' && result.trim() !== '') {
            markCellAsSaved(player.rank, r);
          }
        }
      }
    }
    return { success: true, serverSynced: true };
  } else {
    // Server mode: save to BOTH locations
    localStorage.setItem('ladder_ladder_players', playerJson);
    localStorage.setItem('ladder_server_ladder_players', playerJson);
    
    if (waitForServer) {
      // Wait for server confirmation
      try {
        const serverUrl = dataService.getConfigServerUrl();
        if (!serverUrl) {
          return { success: true, serverSynced: false, error: 'No server URL configured' };
        }
        
        log('[STORAGE]', 'Waiting for server save to ' + serverUrl + '...');
        const response = await fetch(`${serverUrl}/api/ladder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players }),
        });
        
        if (response.ok) {
          log('[STORAGE]', '✓ Saved to server');
          // Mark all non-empty cells as saved after successful server sync
          for (const player of players) {
            if (player.gameResults) {
              for (let r = 0; r < player.gameResults.length; r++) {
                const result = player.gameResults[r];
                if (result != null && typeof result === 'string' && result.trim() !== '') {
                  markCellAsSaved(player.rank, r);
                }
              }
            }
          }
          // Reset polling hash so we can detect external changes
          dataService.resetHashPublic();
          return { success: true, serverSynced: true };
        } else {
          console.error(`[savePlayers] ✗ Server returned ${response.status}`);
          return { success: true, serverSynced: false, error: `Server returned ${response.status}` };
        }
      } catch (error: any) {
        log('[STORAGE]', '✗ Save failed:', error.message);
        return { success: true, serverSynced: false, error: error.message };
      }
    } else if (skipServerSync) {
      // Cache only - no server sync (used for polling cache updates)
      log('[STORAGE]', '[CACHE] Cached to localStorage (no server sync)');
      return { success: true, serverSynced: false };
    } else {
      // Background sync to server (don't wait)
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
            log('[STORAGE]', '[SYNC] ✓ Saved to server');
            // Reset polling hash so we can detect external changes
            dataService.resetHashPublic();
          } else {
            log('[STORAGE]', '[SYNC] ✗ Server returned ' + response.status);
          }
        } catch (error: any) {
          log('[STORAGE]', '[SYNC] ✗ Failed:', error.message);
        }
      })();
      return { success: true, serverSynced: false };
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
      log('[STORAGE]', 'Failed to fetch player:', error);
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
    // Mark as saved (empty is a valid saved state)
    markCellAsSaved(playerRank, roundIndex);
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
      // In local mode, mark as saved immediately
      markCellAsSaved(playerRank, round);
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
      // Mark as unsaved initially - will be marked saved after server sync
      markCellAsUnsaved(playerRank, round);
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

// ==================== ADMIN LOCK MANAGEMENT ====================

/**
 * Admin lock configuration
 */
const ADMIN_LOCK_REFRESH_INTERVAL = 30000; // Refresh every 30 seconds

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current client's ID (stored in sessionStorage for persistence across reloads)
 */
export function getClientId(): string {
  let clientId = sessionStorage.getItem('ladder_client_id');
  if (!clientId) {
    clientId = generateClientId();
    sessionStorage.setItem('ladder_client_id', clientId);
  }
  return clientId;
}

/**
 * Get client name for display
 */
function getClientName(clientId: string): string {
  return `Client ${clientId.substr(-4)}`;
}

/**
 * Get server URL with protocol
 */
export function getServerUrl(): string | null {
  try {
    const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
    if (!userSettingsJson) return null;
    const userSettings = JSON.parse(userSettingsJson);
    const serverUrl = normalizeServerUrl(userSettings.server || '');
    return serverUrl || null;
  } catch (error) {
    console.error('[ADMIN_LOCK] Failed to get server URL:', error);
    return null;
  }
}

/**
 * Try to acquire admin lock from server
 * @returns true if lock acquired, false if already held by another client
 */
export async function tryAcquireAdminLock(clientName?: string): Promise<boolean> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    console.log('[ADMIN_LOCK] No server configured - using local mode');
    return true; // In local mode, always allow
  }

  const clientId = getClientId();
  const name = clientName || getClientName(clientId);

  try {
    const url = `${serverUrl}/api/admin-lock/acquire`;
    log('[ADMIN_LOCK]', `Attempting to acquire: ${url} | clientId=${clientId} | name=${name}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientName: name }),
    });

    log('[ADMIN_LOCK]', `Server responded: ${response.status}`);
    
    const data = await response.json();

    if (data.success) {
      log('[ADMIN_LOCK]', `Acquired lock: ${name}`);
      return true;
    } else {
      log('[ADMIN_LOCK]', `Failed to acquire (${response.status}) - held by ${data.heldBy?.clientName || 'unknown'}`);
      return false;
    }
  } catch (error) {
    const err = error as Error;
    console.error('[ADMIN_LOCK] Failed to acquire lock - fetch threw:', err.message, '| URL:', serverUrl);
    log('[ADMIN_LOCK]', `Fetch error: ${err.message}`);
    return false;
  }
}

/**
 * Force acquire admin lock (override existing lock)
 * @returns true if lock acquired/overridden
 */
export async function forceAcquireAdminLock(clientName?: string): Promise<boolean> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    console.log('[ADMIN_LOCK] No server configured - using local mode');
    return true;
  }

  const clientId = getClientId();
  const name = clientName || getClientName(clientId);

  try {
    const url = `${serverUrl}/api/admin-lock/force`;
    log('[ADMIN_LOCK]', `Attempting force acquire: ${url} | clientId=${clientId} | name=${name}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientName: name }),
    });

    log('[ADMIN_LOCK]', `Force acquire responded: ${response.status}`);
    
    const data = await response.json();

    if (data.success) {
      if (data.overridden) {
        log('[ADMIN_LOCK]', `FORCED lock acquisition - overridden ${data.overridden.clientName}`);
      } else {
        log('[ADMIN_LOCK]', `Acquired lock (force): ${name}`);
      }
      return true;
    }
    log('[ADMIN_LOCK]', `Force acquire failed: ${JSON.stringify(data)}`);
    return false;
  } catch (error) {
    const err = error as Error;
    console.error('[ADMIN_LOCK] Force acquire failed - fetch threw:', err.message, '| URL:', serverUrl);
    log('[ADMIN_LOCK]', `Force acquire fetch error: ${err.message}`);
    return false;
  }
}

/**
 * Release admin lock
 */
export async function releaseAdminLock(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  const clientId = getClientId();

  try {
    const url = `${serverUrl}/api/admin-lock/release`;
    log('[ADMIN_LOCK]', `Releasing lock: ${url} | clientId=${clientId}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });

    log('[ADMIN_LOCK]', `Release responded: ${response.status}`);
    
    if (response.ok) {
      log('[ADMIN_LOCK]', `Released lock`);
    } else {
      console.warn('[ADMIN_LOCK] Release failed with status:', response.status);
    }
  } catch (error) {
    const err = error as Error;
    console.error('[ADMIN_LOCK] Failed to release lock - fetch threw:', err.message, '| URL:', serverUrl);
  }
}

/**
 * Refresh admin lock (extend expiration time)
 */
export async function refreshAdminLock(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  const clientId = getClientId();

  try {
    await fetch(`${serverUrl}/api/admin-lock/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
  } catch (error) {
    console.error('[ADMIN_LOCK] Failed to refresh lock:', error);
  }
}

/**
 * Get information about who holds the admin lock
 */
export async function getAdminLockInfo(): Promise<{ locked: boolean; holderId?: string; holderName?: string; expiresAt?: number; serverReachable?: boolean }> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    return { locked: false, serverReachable: true }; // In local mode, never locked
  }

  try {
    const response = await fetch(`${serverUrl}/api/admin-lock/status`);
    const data = await response.json();

    if (!data.locked) {
      return { locked: false, serverReachable: true };
    }

    return {
      locked: true,
      holderId: data.lock?.clientId,
      holderName: data.lock?.clientName,
      expiresAt: data.expiresAt,
      serverReachable: true,
    };
  } catch (error) {
    console.error('[ADMIN_LOCK] Failed to get lock info - server unreachable:', error);
    return { locked: false, serverReachable: false };
  }
}

/**
 * Check if admin mode is currently locked by another client
 */
export async function isAdminLocked(): Promise<boolean> {
  const info = await getAdminLockInfo();
  return info.locked;
}

/**
 * Notify server of admin lock action (non-blocking) - DEPRECATED, kept for backward compatibility
 */
function notifyServerOfLockAction(action: 'acquire' | 'release' | 'force', clientId: string, clientName?: string): void {
  console.log(`[ADMIN_LOCK_NOTIFY] >>> CALLED with action=${action}, clientId=${clientId}, clientName=${clientName}`);
  // Fetch server URL from user settings
  try {
    const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
    if (!userSettingsJson) {
      console.log('[ADMIN_LOCK_NOTIFY] No user settings found');
      return;
    }
    const userSettings = JSON.parse(userSettingsJson);
    const serverUrl = normalizeServerUrl(userSettings.server || '');
    if (!serverUrl) {
      console.log('[ADMIN_LOCK_NOTIFY] No server URL configured (local mode?)');
      return;
    }
    const url = `${serverUrl}/api/admin-lock/lock`;
    console.log(`[ADMIN_LOCK_NOTIFY] Sending ${action} to ${url}`);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, clientId, clientName }),
    }).then(response => {
      console.log(`[ADMIN_LOCK_NOTIFY] Server responded: ${response.status}`);
    }).catch(err => {
      console.log(`[ADMIN_LOCK_NOTIFY] Fetch failed:`, err);
    });
  } catch (error) {
    console.log('[ADMIN_LOCK_NOTIFY] Error:', error);
  }
}

/**
 * Notify server of admin lock action (non-blocking) - DEPRECATED, kept for backward compatibility
 */
