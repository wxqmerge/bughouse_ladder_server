/**
 * DataService - Abstraction for data access across different modes
 * 
 * Supports three modes:
 * - LOCAL: Legacy localStorage behavior
 * - DEVELOPMENT: Client-server flow targeting localhost
 * - SERVER: Client-server flow targeting production server
 */

import { PlayerData } from '../../shared/types';
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
}

class DataService {
  private config: DataServiceConfig;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private subscribers: Set<() => void> = new Set();

  constructor(config: DataServiceConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<DataServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getMode(): DataServiceMode {
    return this.config.mode;
  }

  /**
   * Get server URL - returns undefined if in LOCAL mode
   */
  getConfigServerUrl(): string | undefined {
    if (this.config.mode === DataServiceMode.LOCAL) {
      return undefined;
    }
    return this.config.serverUrl;
  }

  // Subscribe to data changes
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(): void {
    this.subscribers.forEach(callback => callback());
  }

  // Track last known data hash to detect actual changes (set once on init)
  private lastDataHash: string | null = null;
  private hashInitialized = false;

  // Start polling for updates (in server modes)
  startPolling(intervalMs: number = 15000): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      try {
        const changed = await this.refreshData();
        if (changed) {
          console.log('[DataService] Polling detected data change - notifying subscribers');
          this.notifySubscribers();
        }
      } catch (error) {
        console.error('Polling error:', error);
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
        // Fetch fresh data from server WITHOUT caching to localStorage
        const response = await fetch(`${this.getApiUrl()}/api/ladder`, {
          headers: this.getAuthHeaders(),
        });
        
        if (!response.ok) {
          console.error(`[DataService] Polling failed: ${response.status}`);
          return false;
        }

        const data = await response.json();
        const serverPlayers = data.data?.players || [];
        
        // Compute hash of current server data
        const newHash = this.computeHash(serverPlayers);
        
        // Check if data actually changed (DON'T update lastDataHash - it stays fixed from init)
        if (newHash !== this.lastDataHash) {
          console.log('[DataService] Polling detected data change');
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
      return this.getLocalPlayers();
    } else {
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
      this.saveLocalPlayers(players);
    } else {
      await this.updatePlayers(players);
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

  private async updatePlayerApi(player: PlayerData): Promise<void> {
    const response = await fetch(
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
    const response = await fetch(`${this.getApiUrl()}/api/games/submit`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerRank, round, result }),
    });

    if (!response.ok) {
      throw new Error('Failed to submit game');
    }

    this.notifySubscribers();
  }

  private async clearCellApi(playerRank: number, roundIndex: number): Promise<void> {
    const response = await fetch(
      `${this.getApiUrl()}/api/ladder/${playerRank}/round/${roundIndex}`,
      {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      }
    );

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
}

// Determine the appropriate mode based on user settings or environment configuration
function determineMode(): DataServiceConfig {
  // Priority 1: User settings (from localStorage) - allows per-user server configuration
  const userSettings = loadUserSettings();
  if (userSettings.server && userSettings.server.trim()) {
    const serverUrl = userSettings.server.trim().replace(/\/$/, '');
    console.log('[DataService] Using USER SETTINGS server:', serverUrl);
    
    // Determine mode based on URL
    if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
      return {
        mode: DataServiceMode.DEVELOPMENT,
        serverUrl,
      };
    }
    return {
      mode: DataServiceMode.SERVER,
      serverUrl,
    };
  }

  // No server configured - use LOCAL mode
  console.log('[DataService] Using LOCAL mode (no server configured)');
  return {
    mode: DataServiceMode.LOCAL,
  };
}

// Create singleton instance with appropriate mode
export const dataService = new DataService(determineMode());
