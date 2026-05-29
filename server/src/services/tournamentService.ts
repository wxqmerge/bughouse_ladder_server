import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { log as loggerLog } from '../utils/logger.js';
import { readLadderFile, writeLadderFile, generateTabContent, PlayerData, LadderData, withTiming, ensureDataDirectory } from './dataService.js';
import { MiniGameData, MINI_GAME_FILES, MINI_GAME_DIFFICULTY_ORDER } from '../../../shared/types/index.js';
import { clearRankReferences } from '../../../shared/utils/hashUtils.js';
import {
  copyPlayersToTarget as sharedCopyPlayersToTarget,
  mergeGameResults as sharedMergeGameResults,
  clubLadderGamesPlayed,
  generateTrophyReport as sharedGenerateTrophyReport,
  parseMiniGameImportContent,
} from '../../../shared/utils/trophyGeneration.js';
import {
  buildTrophyReportString,
} from '../../../shared/utils/trophyDebugReport.js';

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
  importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }>;
}

// Re-export from shared for backward compatibility
export { MINI_GAME_FILES, MINI_GAME_DIFFICULTY_ORDER };

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

// Re-export shared functions for backward compatibility
export const copyPlayersToTarget = sharedCopyPlayersToTarget;
export const mergeGameResults = sharedMergeGameResults;
export { generateClubLadderTrophies, generateMiniGameTrophies } from '../../../shared/utils/trophyGeneration.js';

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

export async function removePlayerFromAll(lastName: string, firstName: string): Promise<void> {
  const key = lastName.toLowerCase() + '|' + firstName.toLowerCase();

  const ladderData = await readLadderFile();
  const deletedIdx = ladderData.players.findIndex(
    p => p.lastName.toLowerCase() + '|' + p.firstName.toLowerCase() === key
  );
  if (deletedIdx !== -1) {
    const deletedRank = ladderData.players[deletedIdx].rank;
    ladderData.players.splice(deletedIdx, 1);
    for (const player of ladderData.players) {
      if (player.gameResults) {
        player.gameResults = clearRankReferences(player.gameResults, deletedRank);
      }
    }
    await writeLadderFile(ladderData);
    loggerLog('[TOURNAMENT]', 'Removed player ' + firstName + ' ' + lastName + ' (rank ' + deletedRank + ') from club ladder');
  }

  const existingFiles = await getExistingMiniGameFiles();
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;

    const idx = miniGameData.players.findIndex(
      p => p.lastName.toLowerCase() + '|' + p.firstName.toLowerCase() === key
    );
    if (idx !== -1) {
      const deletedRank = miniGameData.players[idx].rank;
      miniGameData.players.splice(idx, 1);
      for (const player of miniGameData.players) {
        if (player.gameResults) {
          player.gameResults = clearRankReferences(player.gameResults, deletedRank);
        }
      }
      await writeMiniGameFile(fileName, miniGameData);
      loggerLog('[TOURNAMENT]', 'Removed player ' + firstName + ' ' + lastName + ' (rank ' + deletedRank + ') from ' + fileName);
    }
  }
}

export async function updatePlayerInAll(
  rank: number,
  originalLastName: string,
  originalFirstName: string,
  updates: Partial<PlayerData>
): Promise<void> {
  const origKey = originalLastName.toLowerCase() + '|' + originalFirstName.toLowerCase();

  const ladderData = await readLadderFile();
  const targetIdx = ladderData.players.findIndex(p => p.rank === rank);
  if (targetIdx !== -1) {
    const player = ladderData.players[targetIdx];
    Object.assign(player, updates);
    await writeLadderFile(ladderData);
    loggerLog('[TOURNAMENT]', 'Updated player ' + originalFirstName + ' ' + originalLastName + ' (rank ' + rank + ') in club ladder');
  }

  const existingFiles = await getExistingMiniGameFiles();
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;

    const idx = miniGameData.players.findIndex(
      p => p.lastName.toLowerCase() + '|' + p.firstName.toLowerCase() === origKey
    );
    if (idx !== -1) {
      const player = miniGameData.players[idx];
      Object.assign(player, updates);
      await writeMiniGameFile(fileName, miniGameData);
      loggerLog('[TOURNAMENT]', 'Updated player ' + originalFirstName + ' ' + originalLastName + ' (rank ' + player.rank + ') in ' + fileName);
    }
  }
}

export async function generateTrophyReport(debugLevel: number = 3): Promise<{
  success: boolean;
  message: string;
  trophies?: any[];
  isClubMode?: boolean;
  debugInfo?: string;
  trophiesSection?: string[];
}> {
  try {
    const ladderData = await readLadderFile();
    return sharedGenerateTrophyReport(tournamentStore, ladderData.players, debugLevel);
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
    return sharedCopyPlayersToTarget(sourcePlayers, targetPlayers);
  },

  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]) {
    return sharedMergeGameResults(oldResults, currentResults);
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

  async importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
    const imported: string[] = [];
    const errors: string[] = [];

    const sections = parseMiniGameImportContent(content);

    for (const { fileName, fileContent } of sections) {
      if (!MINI_GAME_FILES.includes(fileName)) {
        errors.push(`Unknown file: ${fileName}`);
        continue;
      }

      try {
        const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
        const filePath = path.join(dataDir, fileName);
        await fs.writeFile(filePath, fileContent + '\n', 'utf-8');
        imported.push(fileName);
        loggerLog('[TOURNAMENT]', `Imported ${fileName}`);
      } catch (err) {
        errors.push(`Failed to write ${fileName}: ${(err as Error).message}`);
      }
    }

    return { imported, errors };
  },
};
