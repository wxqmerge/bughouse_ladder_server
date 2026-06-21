/**
 * DataService - Abstraction for data access across different modes
 * 
 * Supports three modes:
 * - LOCAL: Legacy localStorage behavior
 * - DEVELOPMENT: Client-server flow targeting localhost
 * - SERVER: Client-server flow targeting production server
 */

import { PlayerData, DeltaOperation, MiniGameStore } from '../../shared/types';
import { NUM_ROUNDS } from '../../shared/utils/constants';
import {
  getLocalPlayers as storageGetLocalPlayers,
  savePlayers as storageSavePlayers,
  getClientId,
  getSettings,
  saveSettings,
  getProjectName,
  setProjectName,
  getZoomLevel,
  setZoomLevel,
  isAdminMode,
  setAdminMode,
  clearAdminMode,
  getPendingNewDay,
  setPendingNewDay,
  clearPendingNewDay,
  clearSettings,
} from './storageService';
import { playersToTabContent } from './miniGameLocalStorage';
import { loadUserSettings } from './userSettingsStorage';
import { gatedFetch } from '../utils/requestGate';

async function throwIfNotOk(response: Response, context: string): Promise<void> {
  if (response.ok) return;
  let errorMsg = `HTTP ${response.status}`;
  try {
    const errData = await response.json();
    errorMsg = errData?.error?.message || errData?.message || errorMsg;
  } catch { /* response body not JSON */ }
  const error = new Error(`${context}: ${errorMsg}`);
  (error as any).status = response.status;
  throw error;
}

export enum DataServiceMode {
  LOCAL = 'LOCAL',
  DEVELOPMENT = 'DEVELOPMENT',
  SERVER = 'SERVER',
}

export interface DataServiceConfig {
  mode: DataServiceMode;
  serverUrl?: string;
  miniGameStore?: MiniGameStore;
}

class DataService {
  private config: DataServiceConfig;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private hashInitialized = false;
  private lastDataHash: string | null = null;
  private currentMiniGameFile: string | null = null;
  private subscribers: Set<() => void> = new Set();
  private isPolling = false;
  private activeRefreshCount = 0;
  private sseEventSource: EventSource | null = null;
  private sseConnected = false;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private sseEventCount = 0;
  private lastSseEventTime = 0;

  constructor(config: DataServiceConfig) {
    this.config = config;
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    if (this.notifyTimer) return; // Debounce: skip if notification already queued
    const notifyStart = performance.now();
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const debounceMs = performance.now() - notifyStart;
      console.debug(`[PERF NOTIFY] Debounce elapsed: ${debounceMs.toFixed(0)}ms, subscribers: ${this.subscribers.size}`);
      this.subscribers.forEach(callback => callback());
    }, 100);
  }

  updateConfig(newConfig: Partial<DataServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfigServerUrl(): string {
    return this.config.serverUrl || '';
  }

  // Start polling for updates (in server modes)
  startPolling(intervalMs: number = 60000): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      if (this.isPolling) {
        console.debug('[DataService] Skipping poll - previous request still pending');
        return;
      }
      this.isPolling = true;
      try {
        const changed = await this.refreshData();
        if (changed) {
          console.debug('[DataService] Polling detected data change - notifying subscribers');
          this.notifySubscribers();
        }
      } catch (error) {
        console.error('Polling error:', error);
      } finally {
        this.isPolling = false;
      }
    }, intervalMs);
  }

  // Stop polling
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Start SSE connection for real-time updates
  startSSE(): void {
    if (this.config.mode === DataServiceMode.LOCAL) return;
    if (this.sseEventSource) return; // Already connected
    
    const url = `${this.getApiUrl()}/api/ladder/events`;
    this.sseEventSource = new EventSource(url);
    
    this.sseEventSource.onopen = () => {
      this.sseConnected = true;
    };
    
    this.sseEventSource.addEventListener('connected', (e: MessageEvent) => {
      try {
        const data = e.data ? JSON.parse(e.data) : null;
        if (data?.clientId && data?.clientId !== getClientId()) {
          // Another client connected, may trigger sync
        }
      } catch { /* ignore parse errors on connected event */ }
    });
    
    this.sseEventSource.addEventListener('playerUpdated', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} playerUpdated (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('cellCleared', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} cellCleared (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('ladderUpdated', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} ladderUpdated (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('deltasSubmitted', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} deltasSubmitted (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('gameSubmitted', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} gameSubmitted (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('gamesSubmitted', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} gamesSubmitted (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGameSaved', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} miniGameSaved (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGameWritten', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} miniGameWritten (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('playersCopied', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} playersCopied (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('playerAdded', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} playerAdded (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGamesCleared', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} miniGamesCleared (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGamesImported', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} miniGamesImported (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('fileUploaded', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} fileUploaded (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('backupRestored', () => {
      this.sseEventCount++;
      const now = Date.now();
      const sinceLast = now - this.lastSseEventTime;
      this.lastSseEventTime = now;
      console.debug(`[PERF SSE] #${this.sseEventCount} backupRestored (since last: ${sinceLast}ms)`);
      this.notifySubscribers();
    });
    
    this.sseEventSource.onerror = (_error) => {
      this.sseConnected = false;
      console.debug('[DataService] SSE connection error - falling back to polling');
      // EventSource auto-reconnects, but log for visibility
    };
  }

  // Stop SSE connection
  stopSSE(): void {
    if (this.sseEventSource) {
      this.sseEventSource.close();
      this.sseEventSource = null;
      this.sseConnected = false;
      console.debug('[DataService] SSE connection closed');
    }
  }

  // Check if SSE is connected
  isSSEConnected(): boolean {
    return this.sseConnected;
  }

  // Simple hash function for comparing data
  private computeHash(players: PlayerData[]): string {
    return JSON.stringify(
      players.map(p => ({
        gameResults: p.gameResults,
        rank: p.rank,
      }))
    );
  }

  // Initialize hash from current server state (call once on app start)
  async initializeHash(): Promise<void> {
   if (this.hashInitialized || this.config.mode === DataServiceMode.LOCAL) {
      return;
    }

    // If LadderForm already fetched players, use them to avoid a redundant request
    const localPlayers = await this.getLocalPlayers();
    if (localPlayers.length > 0) {
      this.lastDataHash = this.computeHash(localPlayers);
      this.hashInitialized = true;
      return;
    }

    try {
      const response = await gatedFetch(`${this.getApiUrl()}/api/ladder`, {
         headers: this.getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          this.lastDataHash = this.computeHash(serverPlayers);
        }
      } catch (error) {
        console.error('[DataService] Failed to initialize hash:', error);
      }

      this.hashInitialized = true;
    }

  // Set hash directly from already-fetched players (avoids redundant server request)
  public setHash(players: PlayerData[]): void {
    if (!this.hashInitialized) {
      this.lastDataHash = this.computeHash(players);
      this.hashInitialized = true;
    }
  }

   // Reset hash to current server state (call after successful save)
   async resetHash(): Promise<void> {
     if (this.config.mode === DataServiceMode.LOCAL) {
       return;
     }
     
     try {
       const response = await gatedFetch(`${this.getApiUrl()}/api/ladder`, {
        headers: this.getAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverPlayers = data.data?.players || [];
        this.lastDataHash = this.computeHash(serverPlayers);
        console.debug('[DataService] Reset hash after save');
      }
    } catch (error) {
      console.error('[DataService] Failed to reset hash:', error);
    }
  }

  // Expose resetHash publicly
  public resetHashPublic(): Promise<void> {
    return this.resetHash();
  }

  // Refresh data from source - returns true if data changed
  async refreshData(): Promise<boolean> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      // No-op for local mode - data is already in localStorage
      return false;
    } else {
      try {
        // Fetch fresh data from server (or mini-game file)
        let response: Response;
        let serverPlayers: PlayerData[];
        
        if (this.currentMiniGameFile) {
          response = await gatedFetch(
            `${this.getApiUrl()}/api/admin/tournament/read-mini-game?fileName=${this.currentMiniGameFile}`,
            { headers: this.getAuthHeaders() }
          );
        } else {
          response = await gatedFetch(`${this.getApiUrl()}/api/ladder`, {
            headers: this.getAuthHeaders(),
          });
        }
        
        if (!response.ok) {
          console.error(`[DataService] Polling failed: ${response.status}`);
          return false;
        }

        const data = await response.json();
        serverPlayers = data.data?.players || [];
        
     // Compute hash of current server data
        const newHash = this.computeHash(serverPlayers);
        
        // Check if data actually changed
        if (newHash !== this.lastDataHash) {
          console.debug('[DataService] Polling detected data change');
          this.lastDataHash = newHash;
          // Save fresh server data to localStorage so getPlayers() returns it (caller handles notify)
          if (this.currentMiniGameFile) {
            await this.saveLocalMiniGamePlayers(serverPlayers, false);
          } else {
            this.saveLocalPlayers(serverPlayers, false);
          }
          return true; // Data changed
        }
        
        return false; // No change
      } catch (error) {
        // Silently fail - polling should continue even if server is temporarily unavailable
        console.error('[DataService] Polling refresh failed:', error);
        return false;
      }
    }
  }

  // ==================== PLAYER OPERATIONS ====================

 async getPlayers(): Promise<PlayerData[]> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      if (this.currentMiniGameFile) {
        return this.getLocalMiniGamePlayers();
      }
      return this.getLocalPlayers();
    } else {
      // SERVER mode with mini-game: always fetch fresh from server to avoid stale ladder cache
      if (this.currentMiniGameFile) {
        try {
          const serverPlayers = await this.fetchMiniGamePlayers();
          const newHash = this.computeHash(serverPlayers);
          if (this.lastDataHash === null && serverPlayers.length > 0) {
            this.lastDataHash = newHash;
          }
          if (this.lastDataHash !== null && newHash !== this.lastDataHash) {
            this.lastDataHash = newHash;
          }
          return serverPlayers;
        } catch {
          // Fallback to cached local data if server fetch fails
          return await this.getLocalMiniGamePlayers();
        }
      }

      // SERVER mode without mini-game: return cached local data instantly, then sync from server in background
       let cachedPlayers: PlayerData[] = await this.getLocalPlayers();

     // Fetch from server in background to sync (deduplicated)
       if (this.activeRefreshCount === 0) {
         this.activeRefreshCount++;
         (async () => {
           try {
             let serverPlayers: PlayerData[];
             if (this.currentMiniGameFile) {
               serverPlayers = await this.fetchMiniGamePlayers();
             } else {
               serverPlayers = await this.fetchPlayers();
             }
           // Initialize hash on first fetch
              const newHash = this.computeHash(serverPlayers);
              if (this.lastDataHash === null && serverPlayers.length > 0) {
                this.lastDataHash = newHash;
              }
            // Save to localStorage cache so getPlayers() always has fresh data (no notify to avoid loop)
              if (this.currentMiniGameFile) {
                 await this.saveLocalMiniGamePlayers(serverPlayers, false);
               } else {
                 this.saveLocalPlayers(serverPlayers, false);
               }
               // Only notify if data actually changed (prevents infinite loop)
               if (this.lastDataHash !== null && newHash !== this.lastDataHash) {
                 this.lastDataHash = newHash;
                 this.notifySubscribers();
               }
           } catch (err) {
             // Server fetch failed silently — UI keeps showing cached local data
             console.error(`[DataService] BG refresh: FAILED`, err);
           } finally {
             this.activeRefreshCount--;
           }
         })();
       }

      return cachedPlayers;
    }
  }

  async savePlayers(players: PlayerData[]): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      if (this.currentMiniGameFile) {
        await this.saveLocalMiniGamePlayers(players);
      } else {
        this.saveLocalPlayers(players);
      }
    } else {
      if (this.currentMiniGameFile) {
        await this.updateMiniGamePlayers(players);
      } else {
        await this.updatePlayers(players);
      }
    }
  }

  async getPlayer(rank: number): Promise<PlayerData | undefined> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const players = await this.getLocalPlayers();
      return players.find(p => p.rank === rank);
    } else {
      return this.fetchPlayer(rank);
    }
  }

  async updatePlayer(player: PlayerData): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      await this.updateLocalPlayer(player);
    } else {
      await this.updatePlayerApi(player);
    }
  }

  async clearPlayerCell(playerRank: number, roundIndex: number): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      await this.clearLocalCell(playerRank, roundIndex);
    } else {
      await this.clearCellApi(playerRank, roundIndex);
    }
  }

  // ==================== GAME OPERATIONS ====================

  async submitGameResult(
    playerRank: number,
    round: number,
    result: string
  ): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      await this.submitLocalGame(playerRank, round, result);
    } else {
      await this.submitGameApi(playerRank, round, result);
    }
  }

  // ==================== LOCAL STORAGE IMPLEMENTATIONS ====================

  private async getLocalPlayers(): Promise<PlayerData[]> {
    // Read directly from localStorage to avoid circular call through storageService.getPlayers()
    return storageGetLocalPlayers();
  }

  private saveLocalPlayers(players: PlayerData[], notify: boolean = true): void {
    // Delegate to storageService for localStorage access (skipServerSync=true — this is cache-only)
    storageSavePlayers(players, false, true);
    if (notify) {
      this.notifySubscribers();
    }
  }

  private async updateLocalPlayer(player: PlayerData): Promise<void> {
    const players = await this.getLocalPlayers();
    const index = players.findIndex(p => p.rank === player.rank);
    if (index !== -1) {
      players[index] = player;
      this.saveLocalPlayers(players);
    }
  }

  private async submitLocalGame(
    playerRank: number,
    round: number,
    result: string
  ): Promise<void> {
    const players = await this.getLocalPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player) {
      if (!player.gameResults) {
        player.gameResults = new Array(NUM_ROUNDS).fill(null);
      }
      player.gameResults[round] = result;
      this.saveLocalPlayers(players);
    }
  }

  private async clearLocalCell(playerRank: number, roundIndex: number): Promise<void> {
    const players = await this.getLocalPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player) {
      if (!player.gameResults) {
        player.gameResults = new Array(NUM_ROUNDS).fill(null);
      }
      player.gameResults[roundIndex] = null;
      this.saveLocalPlayers(players);
    }
  }

  private async getLocalMiniGamePlayers(): Promise<PlayerData[]> {
    if (!this.currentMiniGameFile) return [];
    const store = this.getStore();
    const miniGameData = await store.readMiniGameFile(this.currentMiniGameFile);
    return miniGameData?.players || [];
  }

  private async saveLocalMiniGamePlayers(players: PlayerData[], notify: boolean = true): Promise<void> {
    if (!this.currentMiniGameFile) return;
    const store = this.getStore();
    await store.writeMiniGameFile(this.currentMiniGameFile, {
      header: [],
      players,
      rawLines: [],
    });
    if (notify) {
      this.notifySubscribers();
    }
  }

  // ==================== API IMPLEMENTATIONS ====================

  private async fetchPlayers(): Promise<PlayerData[]> {
    const response = await gatedFetch(`${this.getApiUrl()}/api/ladder`, {
      headers: this.getAuthHeaders(),
    });
    
    await throwIfNotOk(response, 'Failed to fetch players');

    const data = await response.json();
    if (!data || !data.data || !Array.isArray(data.data.players)) {
      throw new Error('Invalid server response: missing data.players array');
    }
    // Cache in localStorage via storageService (skip server sync - we're fetching FROM server)
    storageSavePlayers(data.data.players, false, true);
    return data.data.players;
  }

  private async fetchPlayer(rank: number): Promise<PlayerData | undefined> {
    const response = await gatedFetch(
      `${this.getApiUrl()}/api/ladder/${rank}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) return undefined;
    const data = await response.json();
    if (!data || !data.data) {
      return undefined;
    }
    return data.data;
  }

  private async updatePlayers(players: PlayerData[]): Promise<void> {
    const response = await gatedFetch(`${this.getApiUrl()}/api/ladder`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ players }),
    });

    await throwIfNotOk(response, 'Failed to update players');

    // Update localStorage cache only (skipServerSync=true because updatePlayers already PUT to server)
    storageSavePlayers(players, false, true);
    // NOTE: Do NOT call notifySubscribers() here — the server broadcasts
    // 'ladderUpdated' SSE event which already triggers a refresh. Calling
    // both creates a double-notification cascade (SSE + local) that causes
    // infinite refresh loops and UI blinking.
  }

  public async fetchMiniGamePlayers(): Promise<PlayerData[]> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      return this.getLocalMiniGamePlayers();
    }
    if (!this.currentMiniGameFile) {
        throw new Error('No mini-game file configured');
      }
      const response = await gatedFetch(
        `${this.getApiUrl()}/api/ladder/mini-games/read?fileName=${encodeURIComponent(this.currentMiniGameFile)}`
      );

    await throwIfNotOk(response, 'Failed to fetch mini-game players');

    const data = await response.json();
    const players = data.data.players || [];
    // Cache in localStorage mini-game store
    if (this.currentMiniGameFile && players.length > 0) {
      const store = this.getStore();
      await store.writeMiniGameFile(this.currentMiniGameFile, {
        header: [],
        players,
        rawLines: [],
      });
    }
    return players;
  }

  private async updateMiniGamePlayers(players: PlayerData[]): Promise<void> {
    const response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/write`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: this.currentMiniGameFile,
        players,
      }),
    });

    await throwIfNotOk(response, 'Failed to update mini-game players');
    // SSE 'miniGameWritten' event triggers refresh
  }

  private async updatePlayerApi(player: PlayerData): Promise<void> {
    let response: Response;
    
    if (this.currentMiniGameFile) {
      const players = await this.fetchMiniGamePlayers();
      const playerIndex = players.findIndex(p => p.rank === player.rank);
      if (playerIndex === -1) {
        return;
      }
      players[playerIndex] = { ...players[playerIndex], ...player };
      response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/write`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: this.currentMiniGameFile,
          players,
        }),
      });
    } else {
      response = await gatedFetch(
        `${this.getApiUrl()}/api/ladder/${player.rank}`,
        {
          method: 'PUT',
          headers: {
            ...this.getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(player),
        }
      );
    }

    await throwIfNotOk(response, 'Failed to update player');
    // SSE 'playerUpdated'/'miniGameWritten' event triggers refresh
  }

  private async submitGameApi(
    playerRank: number,
    round: number,
    result: string
  ): Promise<void> {
    let response: Response;
    
    if (this.currentMiniGameFile) {
      const players = await this.fetchMiniGamePlayers();
      const player = players.find(p => p.rank === playerRank);
      if (!player) {
        return;
      }
      if (!player.gameResults) {
        player.gameResults = new Array(NUM_ROUNDS).fill(null);
      }
      player.gameResults[round] = result;
      player.num_games = (player.num_games || 0) + 1;
      
      response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/write`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: this.currentMiniGameFile,
          players,
        }),
      });
    } else {
      response = await gatedFetch(`${this.getApiUrl()}/api/games/submit`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerRank, round, result }),
      });
    }

    await throwIfNotOk(response, 'Failed to submit game');
    // SSE 'gameSubmitted'/'miniGameWritten' event triggers refresh
  }

  async submitDeltaBatch(deltas: DeltaOperation[]): Promise<void> {
    if (this.currentMiniGameFile) {
      const players = await this.fetchMiniGamePlayers();
      
      for (const delta of deltas) {
        if (delta.type === 'GAME_RESULT') {
          const player = players.find(p => p.rank === delta.playerRank);
          if (player) {
            if (!player.gameResults) {
              player.gameResults = new Array(NUM_ROUNDS).fill(null);
            }
            player.gameResults[delta.round] = delta.result;
            player.num_games = (player.num_games || 0) + 1;
          }
        }
      }
      
      const response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/write`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: this.currentMiniGameFile,
          players,
        }),
      });

await throwIfNotOk(response, 'Failed to submit delta batch');
    // SSE 'miniGameWritten' event triggers refresh
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/ladder/batch`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deltas }),
      });

await throwIfNotOk(response, 'Failed to submit delta batch');
    // SSE 'deltasSubmitted' event triggers refresh
    }
  }

  private async clearCellApi(playerRank: number, roundIndex: number): Promise<void> {
    let response: Response;
    
    if (this.currentMiniGameFile) {
      const players = await this.fetchMiniGamePlayers();
      const player = players.find(p => p.rank === playerRank);
      if (player && player.gameResults) {
        player.gameResults[roundIndex] = null;
      }
      
      response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/write`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: this.currentMiniGameFile,
          players,
        }),
      });
    } else {
      response = await gatedFetch(
        `${this.getApiUrl()}/api/ladder/${playerRank}/round/${roundIndex}`,
        {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
        }
      );
    }

    await throwIfNotOk(response, 'Failed to clear cell');

    // Also update localStorage cache
    const players = await this.getLocalPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player && player.gameResults) {
      player.gameResults[roundIndex] = null;
      this.saveLocalPlayers(players, false); // SSE 'cellCleared' triggers refresh
    }
  }

  // ==================== UTILITY METHODS ====================

  private getApiUrl(): string {
    switch (this.config.mode) {
      case DataServiceMode.DEVELOPMENT:
        return this.config.serverUrl || 'http://localhost:3000';
      case DataServiceMode.SERVER:
        return this.config.serverUrl || '';
      default:
        throw new Error('Invalid mode for server operations');
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Add API key if user has configured one
    const userSettings = loadUserSettings();
    if (userSettings.apiKey && userSettings.apiKey.trim()) {
      headers['X-API-Key'] = userSettings.apiKey.trim();
    }
    
    return headers;
  }

  // ==================== MINI-GAME STORE OPERATIONS ====================

  private getStore(): MiniGameStore {
    if (this.config.miniGameStore) {
      return this.config.miniGameStore;
    }
    throw new Error('MiniGameStore not configured for this DataService instance');
  }

 setMiniGameFile(fileName: string | null): void {
    this.currentMiniGameFile = fileName;
    this.activeRefreshCount = 0;
  }

  getMiniGameFile(): string | null {
    return this.currentMiniGameFile;
  }

  async reloadPlayers(): Promise<PlayerData[]> {
    return this.getPlayers();
  }

  getMode(): DataServiceMode {
    return this.config.mode;
  }

  async getMiniGameFiles(): Promise<string[]> {
    const store = this.getStore();
    return store.getMiniGameFiles();
  }

  async readMiniGameFile(fileName: string): Promise<any> {
    if (!this.config.miniGameStore) {
      return null;
    }
    const store = this.getStore();
    return store.readMiniGameFile(fileName);
  }

  async writeMiniGameFile(fileName: string, ladderData: any): Promise<{ identityUpdates: PlayerData[]; miniGameWritten: boolean }> {
    const store = this.getStore();
    return store.writeMiniGameFile(fileName, ladderData);
  }

  async copyPlayersToMiniGame(fileName: string): Promise<any> {
    console.debug('[DataService] copyPlayersToMiniGame: mode=' + this.config.mode + ', file=' + fileName);
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      console.debug('[DataService] copyPlayersToMiniGame: LOCAL mode, ' + players.length + ' players');
      
      if (players.length === 0) {
        console.warn('[DataService] copyPlayersToMiniGame: LOCAL mode has 0 players in club ladder. Import ladder data first.');
      }
      const targetPlayers = players.map(player => ({
        ...player,
        gameResults: Array(31).fill(null),
        num_games: 0,
      }));
      
      await store.writeMiniGameFile(fileName, {
        header: [],
        players: targetPlayers,
        rawLines: [],
      });
      console.debug('[DataService] copyPlayersToMiniGame: LOCAL write complete');
      return { message: `Copied ${players.length} players to ${fileName}` };
    } else {
      console.debug('[DataService] copyPlayersToMiniGame: SERVER mode, URL=' + this.getApiUrl());
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/copy-players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ fileName }),
      });
      console.debug('[DataService] copyPlayersToMiniGame: response status=' + response.status);

      await throwIfNotOk(response, `Failed to copy players to: ${fileName}`);

      const data = await response.json();
      console.debug('[DataService] copyPlayersToMiniGame: SERVER success');
      return data.data;
    }
  }

  async saveMiniGameFile(fileName: string): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      const existingFile = await store.readMiniGameFile(fileName);
      
      if (existingFile) {
        const mergedPlayers = players.map(player => {
          const existingPlayer = existingFile.players.find(
            p => p.lastName.toLowerCase() === player.lastName.toLowerCase() &&
                 p.firstName.toLowerCase() === player.firstName.toLowerCase()
          );
          
          if (existingPlayer) {
            const mergedResults = store.mergeGameResults(
              existingPlayer.gameResults,
              player.gameResults
            );
            
            return {
              ...player,
              gameResults: mergedResults,
            };
          }
          
          return player;
        });
        
        await store.writeMiniGameFile(fileName, {
          header: [],
          players: mergedPlayers,
          rawLines: [],
        });
      } else {
        await store.writeMiniGameFile(fileName, {
          header: [],
          players: players,
          rawLines: [],
        });
      }
      
      return { message: `Saved ${fileName}` };
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/save-mini-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ fileName }),
      });

      await throwIfNotOk(response, `Failed to save mini-game file: ${fileName}`);

      const data = await response.json();
      return data.data;
    }
  }

  async exportTournamentFiles(): Promise<Blob> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const store = this.getStore();
      const existingFiles = await store.getExistingMiniGameFiles();

      // Add club ladder
      const clubPlayers = await this.getLocalPlayers();
      if (clubPlayers.length > 0) {
        zip.file('ladder.tab', playersToTabContent(clubPlayers));
      }

      // Add mini-game files
      for (const fileName of existingFiles) {
        const fileData = await store.readMiniGameFile(fileName);
        if (fileData) {
          zip.file(fileName, fileData.rawLines.join('\n') + '\n');
        }
      }

      // Add trophy report
      const trophyResult = await store.generateTrophyReport(clubPlayers, 3);
      if (trophyResult.success && trophyResult.trophiesSection) {
        const dateStr = new Date().toISOString().split('T')[0];
        const trophyFileName = `trophies_${dateStr}.tab`;
        const headerLines = trophyResult.debugInfo ? trophyResult.debugInfo.split('\n') : [];
        const trophyContent = [...headerLines, '', ...trophyResult.trophiesSection].join('\n') + '\n';
        zip.file(trophyFileName, trophyContent);
      }

      if (existingFiles.length === 0 && clubPlayers.length === 0) {
        throw new Error('No files found');
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });
      return blob;
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/export`, {
        headers: this.getAuthHeaders(),
      });

      await throwIfNotOk(response, 'Failed to export tournament files');

      return response.blob();
    }
  }

  async generateTrophyReport(debugLevel: number = 3): Promise<Blob> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      const result = await store.generateTrophyReport(players, debugLevel);
      
      if (!result.success) {
        throw new Error(result.message);
      }

      const lines: string[] = [];
      
      if (result.debugInfo) {
        lines.push(result.debugInfo);
        lines.push('');
      }
      
      if (result.trophiesSection) {
        lines.push(...result.trophiesSection);
      }
      
      const content = lines.join('\n') + '\n';
      return new Blob([content], { type: 'text/tab-separated-values' });
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/trophies?debugLevel=${debugLevel}`, {
        headers: this.getAuthHeaders(),
      });

      await throwIfNotOk(response, 'Failed to generate trophy report');

      return response.blob();
    }
  }

  async clearMiniGames(): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      return store.clearMiniGames();
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/clear-mini-games`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      await throwIfNotOk(response, 'Failed to clear mini-game files');

      const data = await response.json();
      return data.data;
    }
  }

  async addPlayerToMiniGames(player: any): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      await store.addPlayerToAllMiniGames(player);
      return { message: 'Player added to all mini-game files' };
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/add-player-to-mini-games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ player }),
      });

      await throwIfNotOk(response, 'Failed to add player to mini-game files');

      const data = await response.json();
      return data.data;
    }
  }

  async checkMiniGameFiles(): Promise<string[]> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      if (!this.config.miniGameStore) {
        return [];
      }
      const store = this.getStore();
      return store.checkMiniGameFilesWith();
    } else {
      try {
        const response = await gatedFetch(`${this.getApiUrl()}/api/ladder/mini-games/check`);

        if (!response.ok) {
          return [];
        }

        const data = await response.json();
        return data.data.files;
      } catch {
        return [];
      }
    }
  }

  // ==================== TOURNAMENT METHODS (server-only) ====================

  async importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      return store.importMiniGameFiles(content);
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ content }),
      });

      await throwIfNotOk(response, 'Failed to import mini-game files');

      const data = await response.json();
      return data.data;
    }
  }

  async importSingleMiniGameFile(file: File, targetGame: string): Promise<{ message: string; fileName: string }> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const text = await file.text();
      const result = await store.importMiniGameFiles(`=== ${targetGame} ===\n${text}`);
      if (result.errors.length > 0) {
        throw new Error(result.errors.join(', '));
      }
      return { message: `Imported to ${targetGame}`, fileName: targetGame };
    } else {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetGame', targetGame);

      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/import-single`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
        },
        body: formData,
      });

      await throwIfNotOk(response, 'Failed to import mini-game file');

      const data = await response.json();
      return data.data;
    }
  }

  async propagatePlayerAdd(player: any): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      await store.addPlayerToAllMiniGames(player);
    } else {
      try {
        await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/add-player-to-mini-games`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
          body: JSON.stringify({ player }),
        });
      } catch (e) {
        console.error('[DATA-SERVICE] propagatePlayerAdd failed:', e);
      }
    }
  }

  async propagatePlayerDelete(player: any): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      await store.removePlayerFromAllMiniGames(player.lastName, player.firstName);
    } else {
      try {
        await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/remove-player-from-all`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
          body: JSON.stringify({ lastName: player.lastName, firstName: player.firstName }),
        });
      } catch (e) {
        console.error('[DATA-SERVICE] propagatePlayerDelete failed:', e);
      }
    }
  }

  async propagatePlayerUpdate(
    rank: number,
    originalLastName: string,
    originalFirstName: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      await store.updatePlayerInAllMiniGames(rank, originalLastName, originalFirstName, updates as Partial<PlayerData>);
    } else {
      try {
        await gatedFetch(`${this.getApiUrl()}/api/admin/tournament/update-player-in-all`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
          body: JSON.stringify({ rank, originalLastName, originalFirstName, updates }),
        });
      } catch (e) {
        console.error('[DATA-SERVICE] propagatePlayerUpdate failed:', e);
      }
    }
  }

  async fetchPrintLayoutsFromServer(): Promise<any[] | null> {
    if (this.config.mode === DataServiceMode.LOCAL) return null;
    try {
      const response = await gatedFetch(`${this.getApiUrl()}/api/print-layouts`, {
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.layouts || null;
    } catch {
      return null;
    }
  }

  async savePrintLayoutToServer(layout: any): Promise<boolean> {
    if (this.config.mode === DataServiceMode.LOCAL) return false;
    try {
      const response = await gatedFetch(`${this.getApiUrl()}/api/print-layouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify(layout),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async deletePrintLayoutFromServer(name: string): Promise<boolean> {
    if (this.config.mode === DataServiceMode.LOCAL) return false;
    try {
      const response = await gatedFetch(`${this.getApiUrl()}/api/print-layouts/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateActivityReport(): Promise<Blob> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const clubPlayers = await this.getLocalPlayers();

      // Count club ladder games per player
      const clubGames = new Map<number, number>();
      for (const p of clubPlayers) {
        const count = (p.gameResults || []).filter(r => r && r.trim() !== '').length;
        if (count > 0) {
          clubGames.set(p.rank, count);
        }
      }

      // Count per-mini-game games per player
      const miniGameCounts = new Map<string, Map<number, number>>();
      const miniGameFiles = store.getMiniGameFiles();
      for (const fileName of miniGameFiles) {
        const fileData = await store.readMiniGameFile(fileName);
        if (!fileData) continue;
        const counts = new Map<number, number>();
        for (const p of fileData.players) {
          const count = (p.gameResults || []).filter(r => r && r.trim() !== '').length;
          if (count > 0) counts.set(p.rank, count);
        }
        miniGameCounts.set(fileName, counts);
      }

      const activeMiniGames = [...miniGameCounts.entries()].filter(([_, counts]) => counts.size > 0);

      // Player map
      const playerMap = new Map<number, typeof clubPlayers[0]>();
      for (const p of clubPlayers) {
        playerMap.set(p.rank, p);
      }

      // ── Section 1: Club Ladder ──
      const clubHeader = 'Rank\tLast Name\tFirst Name\tClub Games';
      const clubRows: string[] = [];
      const clubRanks = [...clubGames.entries()].filter(([_, c]) => c > 0).map(([rank]) => rank).sort((a, b) => a - b);
      for (const rank of clubRanks) {
        const player = playerMap.get(rank);
        if (!player) continue;
        clubRows.push(`${rank}\t${player.lastName}\t${player.firstName}\t${clubGames.get(rank)}`);
      }

      // ── Section 2: Mini-Games ──
      const miniLabels = activeMiniGames.map(([file]) => file.replace('.tab', ''));
      const miniHeader = `Rank\tLast Name\tFirst Name\tMini Total\t${miniLabels.join('\t')}`;
      const miniRows: string[] = [];
      const allMiniRanks = new Set<number>();
      for (const [, counts] of activeMiniGames) {
        for (const rank of counts.keys()) allMiniRanks.add(rank);
      }
      const sortedMiniRanks = [...allMiniRanks].sort((a, b) => a - b);
      for (const rank of sortedMiniRanks) {
        const player = playerMap.get(rank);
        if (!player) continue;
        const cols = activeMiniGames.map(([file, counts]) => counts.get(rank) || 0);
        const total = cols.reduce((s, v) => s + v, 0);
        miniRows.push(`${rank}\t${player.lastName}\t${player.firstName}\t${total}\t${cols.join('\t')}`);
      }

      // Combine sections
      const section1 = [clubHeader, ...clubRows].join('\n');
      const section2 = activeMiniGames.length > 0 ? [miniHeader, ...miniRows].join('\n') : '';
      const content = [section1, section2].filter(Boolean).join('\n\n') + '\n';
      return new Blob([content], { type: 'text/tab-separated-values' });
    } else {
      const response = await gatedFetch(`${this.getApiUrl()}/api/admin/activity-report`, {
        headers: this.getAuthHeaders(),
      });
      await throwIfNotOk(response, 'Failed to generate activity report');
      return response.blob();
    }
  }
}

// Singleton instance — initialized with LOCAL, mode updated by caller
export const dataService = new DataService({ mode: DataServiceMode.LOCAL });
