import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { log as loggerLog } from '../utils/logger.js';
import { readLadderFile, writeLadderFile, generateTabContent, PlayerData, LadderData, withTiming, ensureDataDirectory } from './dataService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MiniGameStore {
  getMiniGameFiles(): string[];
  readMiniGameFile(fileName: string): Promise<LadderData | null>;
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void>;
  copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[];
  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[];
  getExistingMiniGameFiles(): Promise<string[]>;
  clearMiniGames(): Promise<{ deletedCount: number }>;
  hasMiniGameFiles(): Promise<boolean>;
  checkMiniGameFilesWith(): Promise<string[]>;
  addPlayerToAllMiniGames(newPlayer: PlayerData): Promise<void>;
  generateTrophyReport(players: PlayerData[]): Promise<{
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
  }>;
}

// Mini-game file names (7 files, same as MINI_GAMES + bughouse)
export const MINI_GAME_FILES = [
  'BG_Game.tab',
  'Bishop_Game.tab',
  'Pillar_Game.tab',
  'Kings_Cross.tab',
  'Pawn_Game.tab',
  'Queen_Game.tab',
  'bughouse.tab',
];

// Mini-game difficulty order (hardest to easiest) for trophy awarding
export const MINI_GAME_DIFFICULTY_ORDER = [
  'Queen_Game.tab',
  'Pawn_Game.tab',
  'Kings_Cross.tab',
  'Pillar_Game.tab',
  'Bishop_Game.tab',
  'BG_Game.tab',
  'bughouse.tab',
];

// Server-side tournament state
export interface TournamentState {
  active: boolean;
  startedAt: string;
}

// In-memory tournament state (persisted to file on changes)
let tournamentState: TournamentState = {
  active: false,
  startedAt: '',
};

const TOURNAMENT_STATE_FILE = path.join(
  path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab')),
  'tournament_state.json'
);

// Load tournament state from file
export async function loadTournamentState(): Promise<TournamentState> {
  try {
    const content = await fs.readFile(TOURNAMENT_STATE_FILE, 'utf-8');
    tournamentState = JSON.parse(content);
    loggerLog('[TOURNAMENT]', `Loaded tournament state: ${JSON.stringify(tournamentState)}`);
  } catch {
    // No state file, use defaults
    tournamentState = {
      active: false,
      startedAt: '',
    };
  }
  return tournamentState;
}

// Save tournament state to file
export async function saveTournamentState(): Promise<void> {
  try {
    const dataDir = path.dirname(TOURNAMENT_STATE_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(TOURNAMENT_STATE_FILE, JSON.stringify(tournamentState, null, 2), 'utf-8');
    loggerLog('[TOURNAMENT]', `Saved tournament state: ${JSON.stringify(tournamentState)}`);
  } catch (error) {
    loggerLog('[TOURNAMENT]', `Failed to save tournament state: ${(error as Error).message}`);
  }
}

// Get current tournament state
export function getTournamentState(): TournamentState {
  return { ...tournamentState };
}

// Start tournament
export async function startTournament(): Promise<TournamentState> {
  tournamentState = {
    active: true,
    startedAt: new Date().toISOString(),
  };
  await saveTournamentState();
  loggerLog('[TOURNAMENT]', 'Tournament started');
  return { ...tournamentState };
}

// End tournament
export async function endTournament(): Promise<void> {
  if (!tournamentState.active) {
    loggerLog('[TOURNAMENT]', 'Tournament is not active');
    return;
  }
  tournamentState.active = false;
  await saveTournamentState();
  loggerLog('[TOURNAMENT]', 'Tournament ended');
}

// Check if tournament is active
export function isTournamentActive(): boolean {
  return tournamentState.active;
}

// Get mini-game file path for a given file name
export function getMiniGameFilePath(fileName: string): string {
  const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
  return path.join(dataDir, fileName);
}

// Read a mini-game file
export async function readMiniGameFile(fileName: string): Promise<LadderData | null> {
  const filePath = getMiniGameFilePath(fileName);
  try {
    await fs.access(filePath);
    return await readLadderFile(filePath);
  } catch {
    return null;
  }
}

// Write a mini-game file
export async function writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void> {
  const filePath = getMiniGameFilePath(fileName);
  await ensureDataDirectory();
  await writeLadderFile(ladderData, filePath);
}

// Copy players from source to target ladder
export function copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[] {
  // Match players by lastName + firstName
  const sourceMap = new Map<string, PlayerData>();
  for (const player of sourcePlayers) {
    const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
    sourceMap.set(key, player);
  }

  // Update existing players in target — preserve game results (each mini-game keeps its own independent results)
  const updatedTarget = targetPlayers.map(targetPlayer => {
    const key = `${targetPlayer.lastName.toLowerCase()}|${targetPlayer.firstName.toLowerCase()}`;
    const sourcePlayer = sourceMap.get(key);
    if (sourcePlayer) {
      // Update metadata from source, keep existing game results
      return {
        ...targetPlayer,
        rating: sourcePlayer.rating,
        nRating: sourcePlayer.nRating,
        trophyEligible: sourcePlayer.trophyEligible,
        grade: sourcePlayer.grade,
        group: sourcePlayer.group,
        num_games: targetPlayer.num_games,
        gameResults: targetPlayer.gameResults,
      };
    }
    return {
      ...targetPlayer,
      num_games: targetPlayer.num_games,
      gameResults: targetPlayer.gameResults,
    };
  });

  // Add missing players from source
  const existingKeys = new Set(updatedTarget.map(p => `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`));
  for (const player of sourcePlayers) {
    const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
    if (!existingKeys.has(key)) {
      updatedTarget.push({
        ...player,
        gameResults: Array(31).fill(null),
        num_games: 0,
      });
    }
  }

  return updatedTarget;
}

// Merge game results from old file into current results
export function mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[] {
  // Start with current results
  const merged = [...currentResults];

  // Add old results that are not null and don't conflict
  for (let i = 0; i < oldResults.length; i++) {
    if (oldResults[i] && !merged[i]) {
      merged[i] = oldResults[i];
    }
  }

  return merged;
}

// Get list of existing mini-game files
export async function getExistingMiniGameFiles(): Promise<string[]> {
  const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
  const existingFiles: string[] = [];

  for (const fileName of MINI_GAME_FILES) {
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.access(filePath);
      existingFiles.push(fileName);
    } catch {
      // File doesn't exist
    }
  }

  return existingFiles;
}

// Clear all mini-game files
export async function clearMiniGames(): Promise<{ deletedCount: number }> {
  const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
  let deletedCount = 0;

  for (const fileName of MINI_GAME_FILES) {
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.unlink(filePath);
      deletedCount++;
      loggerLog('[TOURNAMENT]', `Deleted mini-game file: ${fileName}`);
    } catch {
      // File doesn't exist, skip
    }
  }

  loggerLog('[TOURNAMENT]', `Cleared ${deletedCount} mini-game files`);
  return { deletedCount };
}

// Check if any mini-game files exist (for auto-detection)
export async function hasMiniGameFiles(): Promise<boolean> {
  const existingFiles = await getExistingMiniGameFiles();
  return existingFiles.length > 0;
}

// Check which mini-game files have data (more than just header)
export async function checkMiniGameFilesWith(): Promise<string[]> {
  const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
  const filesWithData: string[] = [];
  
  for (const fileName of MINI_GAME_FILES) {
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      // More than 1 line means it has data (header + at least one player)
      if (lines.length > 1) {
        filesWithData.push(fileName);
      }
    } catch {
      // File doesn't exist, skip
    }
  }
  
  return filesWithData;
}

// Export all mini-game files as ZIP
export async function exportTournamentFiles(): Promise<{ success: boolean; message: string; files?: string[] }> {
  try {
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
    const files: string[] = [];

    for (const fileName of MINI_GAME_FILES) {
      const filePath = path.join(dataDir, fileName);
      try {
        await fs.access(filePath);
        files.push(fileName);
      } catch {
        // File doesn't exist, skip
      }
    }

    if (files.length === 0) {
      return { success: false, message: 'No mini-game files found' };
    }

    return {
      success: true,
      message: `Exported ${files.length} mini-game files`,
      files,
    };
  } catch (error) {
    loggerLog('[TOURNAMENT]', `Export failed: ${(error as Error).message}`);
    return { success: false, message: `Export failed: ${(error as Error).message}` };
  }
}

// Add a player to all existing mini-game files
export async function addPlayerToAllMiniGames(newPlayer: PlayerData): Promise<void> {
  const existingFiles = await getExistingMiniGameFiles();
  
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;
    
    // Check if player already exists in this file
    const exists = miniGameData.players.some(
      p => p.lastName.toLowerCase() === newPlayer.lastName.toLowerCase() &&
           p.firstName.toLowerCase() === newPlayer.firstName.toLowerCase()
    );
    
    if (!exists) {
      // Add player with empty gameResults
      miniGameData.players.push({
        ...newPlayer,
        gameResults: new Array(31).fill(null),
      });
      await writeMiniGameFile(fileName, miniGameData);
      loggerLog('[TOURNAMENT]', `Added player ${newPlayer.firstName} ${newPlayer.lastName} to ${fileName}`);
    }
  }
}

// Generate trophies for club ladder mode
export async function generateClubLadderTrophies(players: PlayerData[], maxTrophies: number): Promise<any[]> {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);

  function addTrophy(trophy: any) {
    const key = `${trophy.player}`;
    if (seenPlayers.has(key)) return false;
    seenPlayers.add(key);
    trophies.push(trophy);
    return true;
  }

  // Step 1: Award 1st place overall (highest rated player)
  if (sortedPlayers.length > 0) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${sortedPlayers[0].firstName} ${sortedPlayers[0].lastName}`,
      gr: sortedPlayers[0].grade,
      rating: sortedPlayers[0].nRating,
      trophyType: '1st Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: sortedPlayers[0].num_games,
    });
  }

  // Step 2: Award 2nd place overall (2nd highest rated player)
  if (sortedPlayers.length > 1) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${sortedPlayers[1].firstName} ${sortedPlayers[1].lastName}`,
      gr: sortedPlayers[1].grade,
      rating: sortedPlayers[1].nRating,
      trophyType: '2nd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: sortedPlayers[1].num_games,
    });
  }

  // Step 3: Award 3rd place overall (3rd highest rated player)
  if (sortedPlayers.length > 2) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${sortedPlayers[2].firstName} ${sortedPlayers[2].lastName}`,
      gr: sortedPlayers[2].grade,
      rating: sortedPlayers[2].nRating,
      trophyType: '3rd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: sortedPlayers[2].num_games,
    });
  }

  // Step 4: Award most games
  const mostGamesPlayer = sortedPlayers.reduce((max, p) => p.num_games > max.num_games ? p : max, sortedPlayers[0]);
  if (mostGamesPlayer) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${mostGamesPlayer.firstName} ${mostGamesPlayer.lastName}`,
      gr: mostGamesPlayer.grade,
      rating: mostGamesPlayer.nRating,
      trophyType: 'Most Games',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: mostGamesPlayer.num_games,
    });
  }

  // Step 5: Award grade 1st place if t > 4
  if (maxTrophies > 4) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.rating - a.rating);
      
      if (gradePlayers.length >= 1) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${gradePlayers[0].firstName} ${gradePlayers[0].lastName}`,
          gr: grade,
          rating: gradePlayers[0].nRating,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: gradePlayers[0].num_games,
        });
      }
    }
  }

  // Step 6: Award grade 2nd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.rating - a.rating);
      
      if (gradePlayers.length >= 2) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${gradePlayers[1].firstName} ${gradePlayers[1].lastName}`,
          gr: grade,
          rating: gradePlayers[1].nRating,
          trophyType: '2nd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: gradePlayers[1].num_games,
        });
      }
    }
  }

  // Step 7: Award grade 3rd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.rating - a.rating);
      
      if (gradePlayers.length >= 3) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${gradePlayers[2].firstName} ${gradePlayers[2].lastName}`,
          gr: grade,
          rating: gradePlayers[2].nRating,
          trophyType: '3rd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: gradePlayers[2].num_games,
        });
      }
    }
  }

  return trophies;
}

// Count total games played by a player across all mini-game files (by rank)
async function countGamesAcrossMiniGames(playerRank: number, existingFiles: string[]): Promise<number> {
  let totalGames = 0;
  
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;
    
    const player = miniGameData.players.find(
      p => p.rank === playerRank
    );
    
    if (player && player.gameResults) {
      const games = player.gameResults.filter(r => r && r !== '' && r !== '_');
      totalGames += games.length;
    }
  }
  
  return totalGames;
}

// Generate trophies for mini-game tournament mode
export async function generateMiniGameTrophies(players: PlayerData[], maxTrophies: number, existingFiles: string[]): Promise<any[]> {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const m = existingFiles.length;
  const t = maxTrophies;

  function addTrophy(trophy: any) {
    const key = `${trophy.player}`;
    if (seenPlayers.has(key)) return false;
    seenPlayers.add(key);
    trophies.push(trophy);
    return true;
  }

  // Step 1: Award 1st place for each mini-game - always
  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    if (!existingFiles.includes(fileName)) continue;

    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData || miniGameData.players.length === 0) continue;

    const playersWithGames = miniGameData.players.filter(p => {
      if (!p.gameResults) return false;
      return p.gameResults.some(r => r && r !== '' && r !== '_');
    });

    const sortedPlayers = playersWithGames.sort((a, b) => b.rating - a.rating);
    if (sortedPlayers.length > 0) {
      addTrophy({
        rank: trophies.length + 1,
        player: `${sortedPlayers[0].firstName} ${sortedPlayers[0].lastName}`,
        gr: sortedPlayers[0].grade,
        rating: sortedPlayers[0].nRating,
        trophyType: '1st Place',
        miniGameOrGrade: fileName.replace('.tab', ''),
        gamesPlayed: sortedPlayers[0].num_games,
      });
    }
  }

  // Step 2: Award 2nd place for each mini-game - only if t > m
  if (t > m) {
    for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
      if (!existingFiles.includes(fileName)) continue;

      const miniGameData = await readMiniGameFile(fileName);
      if (!miniGameData || miniGameData.players.length === 0) continue;

      const playersWithGames = miniGameData.players.filter(p => {
        if (!p.gameResults) return false;
        return p.gameResults.some(r => r && r !== '' && r !== '_');
      });

      const sortedPlayers = playersWithGames.sort((a, b) => b.rating - a.rating);
      if (sortedPlayers.length > 1) {
     addTrophy({
        rank: trophies.length + 1,
        player: `${sortedPlayers[1].firstName} ${sortedPlayers[1].lastName}`,
        gr: sortedPlayers[1].grade,
        rating: sortedPlayers[1].nRating,
        trophyType: '2nd Place',
        miniGameOrGrade: fileName.replace('.tab', ''),
        gamesPlayed: sortedPlayers[1].num_games,
      });
      }
    }
  }

  // Step 3: Award grade 1st place - only if t > 2*m
  // Remaining players (no trophy yet), sorted by num_games, first in each grade wins
  if (t > 2 * m) {
    const remainingPlayers = players.filter(p => !seenPlayers.has(`${p.firstName} ${p.lastName}`));
    const gradeGroups = [...new Set(remainingPlayers.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = remainingPlayers.filter(p => p.grade === grade)
        .sort((a, b) => b.num_games - a.num_games);
      
      if (gradePlayers.length > 0) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${gradePlayers[0].firstName} ${gradePlayers[0].lastName}`,
          gr: grade,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: gradePlayers[0].num_games,
        });
      }
    }
  }

  return trophies;
}

// Generate trophy report data
export async function generateTrophyReport(): Promise<{
  success: boolean;
  message: string;
  trophies?: any[];
  isClubMode?: boolean;
}> {
  try {
    const hasMiniGames = await hasMiniGameFiles();
    const isClubMode = !hasMiniGames;

    // Get all players from club ladder
    const ladderData = await readLadderFile();
    const players = ladderData.players;

    if (players.length === 0) {
      return { success: false, message: 'No players found' };
    }

    const maxTrophies = Math.ceil(players.length / 3);
    const trophies: any[] = [];

    if (isClubMode) {
      // Club ladder mode - use club ladder rating
      trophies.push(...await generateClubLadderTrophies(players, maxTrophies));
    } else {
      // Mini-game tournament mode
      const existingFiles = await getExistingMiniGameFiles();
      trophies.push(...await generateMiniGameTrophies(players, maxTrophies, existingFiles));
    }

    return {
      success: true,
      message: `Generated ${trophies.length} trophies`,
      trophies,
      isClubMode,
    };
  } catch (error) {
    loggerLog('[TOURNAMENT]', `Trophy generation failed: ${(error as Error).message}`);
    return { success: false, message: `Trophy generation failed: ${(error as Error).message}` };
  }
}

// Server-side MiniGameStore implementation
export const tournamentStore: MiniGameStore = {
  getMiniGameFiles() {
    return MINI_GAME_FILES;
  },

  async readMiniGameFile(fileName: string) {
    return readMiniGameFile(fileName);
  },

  async writeMiniGameFile(fileName: string, ladderData: LadderData) {
    await writeMiniGameFile(fileName, ladderData);
  },

  copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]) {
    return copyPlayersToTarget(sourcePlayers, targetPlayers);
  },

  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]) {
    return mergeGameResults(oldResults, currentResults);
  },

  async getExistingMiniGameFiles() {
    return getExistingMiniGameFiles();
  },

  async clearMiniGames() {
    return clearMiniGames();
  },

  async hasMiniGameFiles() {
    return hasMiniGameFiles();
  },

  async checkMiniGameFilesWith() {
    return checkMiniGameFilesWith();
  },

  async addPlayerToAllMiniGames(newPlayer: PlayerData) {
    await addPlayerToAllMiniGames(newPlayer);
  },

  async generateTrophyReport(players: PlayerData[]) {
    return generateTrophyReport();
  },
};
