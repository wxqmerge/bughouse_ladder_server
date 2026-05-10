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
      // In local mode, we can't create a real ZIP, so we'll return a Blob with all files combined
      const store = this.getStore();
      const existingFiles = await store.getExistingMiniGameFiles();
      
      if (existingFiles.length === 0) {
        throw new Error('No mini-game files found');
      }

      let content = '';
      for (const fileName of existingFiles) {
        const fileData = await store.readMiniGameFile(fileName);
        if (fileData) {
          content += `=== ${fileName} ===\n`;
          content += fileData.rawLines.join('\n') + '\n\n';
        }
      }

      return new Blob([content], { type: 'text/plain' });
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

  async generateTrophyReport(): Promise<Blob> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      const result = await store.generateTrophyReport(players);
      
      if (!result.success) {
        throw new Error(result.message);
      }

      const lines: string[] = [];
      
      if (result.debugInfo) {
        lines.push(result.debugInfo);
        lines.push('');
      }
      
      lines.push('');
      lines.push('AWARDED TROPHIES');
      const header = 'Rank\tPlayer\tTrophy Type\tMini-Game/Grade\tGr\tRating\tTotal Games\tGames Played';
      lines.push(header);
      
      let blankRowInserted = false;
      for (const trophy of result.trophies!) {
        if (!blankRowInserted && trophy.trophyType === '1st Place' && trophy.miniGameOrGrade && trophy.miniGameOrGrade.startsWith('Gr ') && !result.isClubMode) {
          lines.push('');
          blankRowInserted = true;
        }
        lines.push(`${trophy.rank}\t${trophy.player}\t${trophy.trophyType}\t${trophy.miniGameOrGrade}\t${trophy.gr}\t${trophy.rating}\t${trophy.totalGames || 0}\t${trophy.gamesPlayed}`);
      }
      
      const content = lines.join('\n') + '\n';
      return new Blob([content], { type: 'text/tab-separated-values' });
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/trophies`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to generate trophy report');
      }

      return response.blob();
    }
  }

  async exportMiniData(): Promise<Blob> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      // In local mode, export ladder.tab + mini-game files as combined text
      const store = this.getStore();
      const players = await this.getLocalPlayers();
      
      let content = '=== ladder.tab ===\n';
      content += players.map(p => {
        return `${p.group}\t${p.lastName}\t${p.firstName}\t${p.rating}\t${p.rank}\t${p.nRating}\t${p.grade}\t${p.num_games}\t${p.attendance}\t${p.phone}\t${p.info}\t${p.school}\t${p.room}` + 
               (p.gameResults || []).map(r => r || '').join('\t');
      }).join('\n') + '\n\n';
      
      const existingFiles = await store.getExistingMiniGameFiles();
      for (const fileName of existingFiles) {
        const fileData = await store.readMiniGameFile(fileName);
        if (fileData) {
          content += `=== ${fileName} ===\n`;
          content += fileData.rawLines.join('\n') + '\n\n';
        }
      }

      return new Blob([content], { type: 'text/plain' });
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/export-mini-data`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to export mini data');
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
      const store = this.getStore();
      return store.checkMiniGameFilesWith();
    } else {
      const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/check-mini-games`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to check mini-game files');
      }

      const data = await response.json();
      return data.data.files;
    }
  }

  // ==================== TOURNAMENT METHODS (server-only) ====================

  async getTournamentStatus(): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      // In local mode, return default state
      return { active: false, startedAt: '' };
    }
    
    const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/status`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get tournament status');
    }

    const data = await response.json();
    return data.data;
  }

  async startTournament(): Promise<any> {
    if (this.config.mode === DataServiceMode.LOCAL) {
      // In local mode, just return default state
      return { active: true, startedAt: new Date().toISOString() };
    }
    
    const response = await fetch(`${this.getApiUrl()}/api/admin/tournament/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to start tournament');
    }

    const data = await response.json();
    return data.data;
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
