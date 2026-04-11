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

// ==================== PLAYER DATA ====================

/**
 * Get all players from storage
 */
export async function getPlayers(): Promise<PlayerData[]> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Local mode: use localStorage directly
    const data = localStorage.getItem('ladder_players');
    return data ? JSON.parse(data) : [];
  } else {
    // Server modes: use DataService
    try {
      return await dataService.getPlayers();
    } catch (error) {
      console.error('Failed to fetch players:', error);
      // Fallback to localStorage on error
      const data = localStorage.getItem('ladder_players');
      return data ? JSON.parse(data) : [];
    }
  }
}

/**
 * Save all players to storage
 */
export async function savePlayers(players: PlayerData[]): Promise<void> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Local mode: use localStorage directly
    localStorage.setItem('ladder_players', JSON.stringify(players));
  } else {
    // Server modes: use DataService
    try {
      await dataService.savePlayers(players);
    } catch (error) {
      console.error('Failed to save players:', error);
      // Fallback to localStorage on error
      localStorage.setItem('ladder_players', JSON.stringify(players));
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
      // Fallback: update locally
      const players = await getPlayers();
      const index = players.findIndex(p => p.rank === player.rank);
      if (index !== -1) {
        players[index] = player;
        localStorage.setItem('ladder_players', JSON.stringify(players));
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
      // Fallback: update locally
      const players = await getPlayers();
      const player = players.find(p => p.rank === playerRank);
      if (player) {
        if (!player.gameResults) {
          player.gameResults = new Array(31).fill(null);
        }
        player.gameResults[round] = result;
        localStorage.setItem('ladder_players', JSON.stringify(players));
      }
    }
  }
}

// ==================== SETTINGS ====================

/**
 * Get ladder settings from localStorage
 */
export function getSettings(): any {
  const data = localStorage.getItem('ladder_settings');
  return data ? JSON.parse(data) : {};
}

/**
 * Save ladder settings to localStorage
 */
export function saveSettings(settings: any): void {
  localStorage.setItem('ladder_settings', JSON.stringify(settings));
}

/**
 * Get project name
 */
export function getProjectName(): string {
  return localStorage.getItem('ladder_project_name') || 'Bughouse Chess Ladder';
}

/**
 * Set project name
 */
export function setProjectName(name: string): void {
  localStorage.setItem('ladder_project_name', name);
}

/**
 * Get zoom level
 */
export function getZoomLevel(): number {
  const zoom = localStorage.getItem('ladder_zoom');
  return zoom ? Number(zoom) : 100;
}

/**
 * Set zoom level
 */
export function setZoomLevel(level: number): void {
  localStorage.setItem('ladder_zoom', level.toString());
}

// ==================== UTILITY ====================

/**
 * Clear all ladder data
 */
export async function clearAllData(): Promise<void> {
  localStorage.removeItem('ladder_players');
  localStorage.removeItem('ladder_settings');
  localStorage.removeItem('ladder_project_name');
  localStorage.removeItem('ladder_zoom');
  
  // In server modes, you might want to call an API endpoint here
}
