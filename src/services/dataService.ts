/**
 * DataService - Abstraction for data access across different modes
 * 
 * Supports three modes:
 * - LOCAL: Legacy localStorage behavior
 * - DEVELOPMENT: Client-server flow targeting localhost
 * - SERVER: Client-server flow targeting production server
 */

import { PlayerData, DeltaOperation, MiniGameStore } from '../../shared/types';
import {
  getKeyPrefix,
  getPlayers as storageGetPlayers,
  savePlayers as storageSavePlayers,
} from './storageService';
import { loadUserSettings } from './userSettingsStorage';

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
  private sseEventSource: EventSource | null = null;
  private sseConnected = false;

  constructor(config: DataServiceConfig) {
    this.config = config;
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback());
  }

  updateConfig(newConfig: Partial<DataServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfigServerUrl(): string {
    return this.config.serverUrl || '';
  }

  // Start polling for updates (in server modes)
  startPolling(intervalMs: number = 15000): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      if (this.isPolling) {
        console.log('[DataService] Skipping poll - previous request still pending');
        return;
      }
      this.isPolling = true;
      try {
        const changed = await this.refreshData();
        if (changed) {
          console.log('[DataService] Polling detected data change - notifying subscribers');
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
    console.log('[DataService] Connecting to SSE:', url);
    
    this.sseEventSource = new EventSource(url);
    
    this.sseEventSource.onopen = () => {
      this.sseConnected = true;
      console.log('[DataService] SSE connection established');
    };
    
    this.sseEventSource.addEventListener('connected', (e: any) => {
      console.log('[DataService] SSE: connected event received');
    });
    
    this.sseEventSource.addEventListener('playerUpdated', () => {
      console.log('[DataService] SSE: playerUpdated');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('cellCleared', () => {
      console.log('[DataService] SSE: cellCleared');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('ladderUpdated', () => {
      console.log('[DataService] SSE: ladderUpdated');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('deltasSubmitted', () => {
      console.log('[DataService] SSE: deltasSubmitted');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('gameSubmitted', () => {
      console.log('[DataService] SSE: gameSubmitted');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('gamesSubmitted', () => {
      console.log('[DataService] SSE: gamesSubmitted');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGameSaved', () => {
      console.log('[DataService] SSE: miniGameSaved');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGameWritten', () => {
      console.log('[DataService] SSE: miniGameWritten');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('playersCopied', () => {
      console.log('[DataService] SSE: playersCopied');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('playerAdded', () => {
      console.log('[DataService] SSE: playerAdded');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGamesCleared', () => {
      console.log('[DataService] SSE: miniGamesCleared');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('miniGamesImported', () => {
      console.log('[DataService] SSE: miniGamesImported');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('fileUploaded', () => {
      console.log('[DataService] SSE: fileUploaded');
      this.notifySubscribers();
    });
    
    this.sseEventSource.addEventListener('backupRestored', () => {
      console.log('[DataService] SSE: backupRestored');
      this.notifySubscribers();
    });
    
    this.sseEventSource.onerror = (error) => {
      this.sseConnected = false;
      console.log('[DataService] SSE connection error - falling back to polling');
      // EventSource auto-reconnects, but log for visibility
    };
  }

  // Stop SSE connection
  stopSSE(): void {
    if (this.sseEventSource) {
      this.sseEventSource.close();
      this.sseEventSource = null;
      this.sseConnected = false;
      console.log('[DataService] SSE connection closed');
    }
  }

  // Check if SSE is connected
  isSSEConnected(): boolean {
    return this.sseConnected;
  }

  // Simple hash function for comparing data
  private computeHash(players: PlayerData[]): string {
    return JSON.stringify(players.map(p => ({
      rank: p.rank,
      gameResults: p.gameResults
    })));
  }

  // Initialize hash from current server state (call once on app start)
  async initializeHash(): Promise<void> {
    if (this.hashInitialized || this.config.mode === DataServiceMode.LOCAL) {
      return;
    }
    
    try {
      const response = await fetch(`${this.getApiUrl()}/api/ladder`, {
        headers: this.getAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverPlayers = data.data?.players || [];
        this.lastDataHash = this.computeHash(serverPlayers);
        console.log('[DataService] Initialized hash from server');
      }
    } catch (error) {
      console.error('[DataService] Failed to initialize hash:', error);
    }
    
    this.hashInitialized = true;
  }

  // Reset hash to current server state (call after successful save)
  async resetHash(): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      return;
    }
    
    try {
      const response = await fetch(`${this.getApiUrl()}/api/ladder`, {
        headers: this.getAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverPlayers = data.data?.players || [];
        this.lastDataHash = this.computeHash(serverPlayers);
        console.log('[DataService] Reset hash after save');
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
        // Fetch fresh data from server (or mini-game file) WITHOUT caching to localStorage
        let response: Response;
        let serverPlayers: PlayerData[];
        
        if (this.currentMiniGameFile) {
          response = await fetch(
            `${this.getApiUrl()}/api/admin/tournament/read-mini-game?fileName=${this.currentMiniGameFile}`,
            { headers: this.getAuthHeaders() }
          );
        } else {
          response = await fetch(`${this.getApiUrl()}/api/ladder`, {
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
          console.log('[DataService] Polling detected data change');
          this.lastDataHash = newHash;
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
      if (this.currentMiniGameFile) {
        return this.fetchMiniGamePlayers();
      }
      const players = await this.fetchPlayers();
      // Initialize hash on first fetch
      if (this.lastDataHash === null) {
        this.lastDataHash = this.computeHash(players);
      }
      return players;
    }
  }

  async savePlayers(players: PlayerData[]): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      if (this.currentMiniGameFile) {
        this.saveLocalMiniGamePlayers(players);
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
    // Delegate to storageService for localStorage access
    return storageGetPlayers();
  }

  private saveLocalPlayers(players: PlayerData[]): void {
    // Delegate to storageService for localStorage access
    storageSavePlayers(players);
    this.notifySubscribers();
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
        player.gameResults = new Array(31).fill(null);
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
        player.gameResults = new Array(31).fill(null);
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

  private saveLocalMiniGamePlayers(players: PlayerData[]): void {
    if (!this.currentMiniGameFile) return;
    const store = this.getStore();
    store.writeMiniGameFile(this.currentMiniGameFile, {
      header: [],
      players,
      rawLines: [],
    });
    this.notifySubscribers();
  }

  // ==================== API IMPLEMENTATIONS ====================

  private async fetchPlayers(): Promise<PlayerData[]> {
    const response = await fetch(`${this.getApiUrl()}/api/ladder`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      const error = new Error(`Failed to fetch players: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    // Cache in localStorage via storageService (skip server sync - we're fetching FROM server)
    storageSavePlayers(data.data.players, false, true);
    return data.data.players;
  }

  private async fetchPlayer(rank: number): Promise<PlayerData | undefined> {
    const response = await fetch(
      `${this.getApiUrl()}/api/ladder/${rank}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) return undefined;
    const data = await response.json();
    return data.data;
  }

  private async updatePlayers(players: PlayerData[]): Promise<void> {
    const response = await fetch(`${this.getApiUrl()}/api/ladder`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ players }),
    });

    if (!response.ok) {
      const error = new Error(`Failed to update players: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    // Update localStorage cache via storageService
    storageSavePlayers(players);
    this.notifySubscribers();
  }

  private async fetchMiniGamePlayers(): Promise<PlayerData[]> {
    const response = await fetch(
      `${this.getApiUrl()}/api/admin/tournament/read-mini-game?fileName=${this.currentMiniGameFile}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) {
      const error = new Error(`Failed to fetch mini-game players: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.data.players || [];
  }

  private async updateMiniGamePlayers(players: PlayerData[]): Promise<void> {
    const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/write-mini-game`, {
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

    if (!response.ok) {
      const error = new Error(`Failed to update mini-game players: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    this.notifySubscribers();
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
      response = await fetch(`${this.getApiUrl()}/api/admin/tournament/write-mini-game`, {
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
      response = await fetch(
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

    if (!response.ok) {
      throw new Error('Failed to update player');
    }

    this.notifySubscribers();
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
        player.gameResults = new Array(31).fill(null);
      }
      player.gameResults[round] = result;
      player.num_games = (player.num_games || 0) + 1;
      
      response = await fetch(`${this.getApiUrl()}/api/admin/tournament/write-mini-game`, {
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
      response = await fetch(`${this.getApiUrl()}/api/games/submit`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerRank, round, result }),
      });
    }

    if (!response.ok) {
      throw new Error('Failed to submit game');
    }

    this.notifySubscribers();
  }

  async submitDeltaBatch(deltas: DeltaOperation[]): Promise<void> {
    if (this.currentMiniGameFile) {
      const players = await this.fetchMiniGamePlayers();
      
      for (const delta of deltas) {
        if (delta.type === 'GAME_RESULT') {
          const player = players.find(p => p.rank === delta.playerRank);
          if (player) {
            if (!player.gameResults) {
              player.gameResults = new Array(31).fill(null);
            }
            player.gameResults[delta.round] = delta.result;
            player.num_games = (player.num_games || 0) + 1;
          }
        }
      }
      
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/write-mini-game`, {
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

      if (!response.ok) {
        const error = new Error(`Failed to submit delta batch: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }

      this.notifySubscribers();
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/ladder/batch`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deltas }),
      });

      if (!response.ok) {
        const error = new Error(`Failed to submit delta batch: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }

      this.notifySubscribers();
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
      
      response = await fetch(`${this.getApiUrl()}/api/admin/tournament/write-mini-game`, {
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
      response = await fetch(
        `${this.getApiUrl()}/api/ladder/${playerRank}/round/${roundIndex}`,
        {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
        }
      );
    }

    if (!response.ok) {
      throw new Error('Failed to clear cell');
    }

    // Also update localStorage cache
    const players = await this.getLocalPlayers();
    const player = players.find(p => p.rank === playerRank);
    if (player && player.gameResults) {
      player.gameResults[roundIndex] = null;
      this.saveLocalPlayers(players);
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
    console.log(`[DataService] Mini-game file set to: ${fileName || 'none'}`);
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

  async writeMiniGameFile(fileName: string, ladderData: any): Promise<void> {
    const store = this.getStore();
    return store.writeMiniGameFile(fileName, ladderData);
  }

  async copyPlayersToMiniGame(fileName: string): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      
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
      return { message: `Copied players to ${fileName}` };
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/copy-players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ fileName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to copy players to: ${fileName}`);
      }

      const data = await response.json();
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
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/save-mini-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ fileName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save mini-game file: ${fileName}`);
      }

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
      
      if (existingFiles.length === 0) {
        throw new Error('No mini-game files found');
      }

      for (const fileName of existingFiles) {
        const fileData = await store.readMiniGameFile(fileName);
        if (fileData) {
          zip.file(fileName, fileData.rawLines.join('\n') + '\n');
        }
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });
      return blob;
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/export`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to export tournament files');
      }

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
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/trophies?debugLevel=${debugLevel}`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to generate trophy report');
      }

      return response.blob();
    }
  }

  async clearMiniGames(): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      return store.clearMiniGames();
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/clear-mini-games`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to clear mini-game files');
      }

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
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/add-player-to-mini-games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ player }),
      });

      if (!response.ok) {
        throw new Error('Failed to add player to mini-game files');
      }

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
        const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/check-mini-games`, {
          headers: this.getAuthHeaders(),
        });

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
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error('Failed to import mini-game files');
      }

      const data = await response.json();
      return data.data;
    }
  }
}

// Singleton instance — initialized with LOCAL, mode updated by caller
export const dataService = new DataService({ mode: DataServiceMode.LOCAL });
