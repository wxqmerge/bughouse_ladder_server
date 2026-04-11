/**
 * DataService - Abstraction for data access across different modes
 * 
 * Supports three modes:
 * - LOCAL: Legacy localStorage behavior
 * - DEVELOPMENT: Client-server flow targeting localhost
 * - SERVER: Client-server flow targeting production server
 */

import { PlayerData } from '../../shared/types';

export enum DataServiceMode {
  LOCAL = 'LOCAL',
  DEVELOPMENT = 'DEVELOPMENT',
  SERVER = 'SERVER',
}

export interface DataServiceConfig {
  mode: DataServiceMode;
  serverUrl?: string;
  authToken?: string;
}

class DataService {
  private config: DataServiceConfig;
  private pollInterval: NodeJS.Timeout | null = null;
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

  // Subscribe to data changes
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(): void {
    this.subscribers.forEach(callback => callback());
  }

  // Start polling for updates (in server modes)
  startPolling(intervalMs: number = 15000): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      try {
        await this.refreshData();
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

  // Refresh data from source
  async refreshData(): Promise<void> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      // No-op for local mode - data is already in localStorage
    } else {
      await this.fetchPlayers();
    }
  }

  // ==================== PLAYER OPERATIONS ====================

  async getPlayers(): Promise<PlayerData[]> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      return this.getLocalPlayers();
    } else {
      return this.fetchPlayers();
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
    const data = localStorage.getItem('ladder_players');
    return data ? JSON.parse(data) : [];
  }

  private saveLocalPlayers(players: PlayerData[]): void {
    localStorage.setItem('ladder_players', JSON.stringify(players));
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

  // ==================== API IMPLEMENTATIONS ====================

  private async fetchPlayers(): Promise<PlayerData[]> {
    const response = await fetch(`${this.getServerUrl()}/api/ladder`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch players');
    }

    const data = await response.json();
    localStorage.setItem('ladder_players', JSON.stringify(data.data.players));
    return data.data.players;
  }

  private async fetchPlayer(rank: number): Promise<PlayerData | undefined> {
    const response = await fetch(
      `${this.getServerUrl()}/api/ladder/${rank}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) return undefined;
    const data = await response.json();
    return data.data;
  }

  private async updatePlayers(players: PlayerData[]): Promise<void> {
    const response = await fetch(`${this.getServerUrl()}/api/ladder`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ players }),
    });

    if (!response.ok) {
      throw new Error('Failed to update players');
    }

    localStorage.setItem('ladder_players', JSON.stringify(players));
    this.notifySubscribers();
  }

  private async updatePlayerApi(player: PlayerData): Promise<void> {
    const response = await fetch(
      `${this.getServerUrl()}/api/ladder/${player.rank}`,
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
    const response = await fetch(`${this.getServerUrl()}/api/games/submit`, {
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

  // ==================== UTILITY METHODS ====================

  private getServerUrl(): string {
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
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }
}

// Determine the appropriate mode based on environment configuration
function determineMode(): DataServiceConfig {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (apiUrl && apiUrl.startsWith('http')) {
    // Server is configured - use DEVELOPMENT mode for localhost, SERVER for production
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      return {
        mode: DataServiceMode.DEVELOPMENT,
        serverUrl: apiUrl,
      };
    }
    return {
      mode: DataServiceMode.SERVER,
      serverUrl: apiUrl,
    };
  }
  
  // No server configured - use LOCAL mode
  return {
    mode: DataServiceMode.LOCAL,
  };
}

// Create singleton instance with appropriate mode
export const dataService = new DataService(determineMode());
