import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { log as loggerLog } from '../utils/logger.js';
import { readLadderFile, writeLadderFile, generateTabContent, PlayerData, LadderData, withTiming } from './dataService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  mode: 'regular' | 'bughouse';
}

// In-memory tournament state (persisted to file on changes)
let tournamentState: TournamentState = {
  active: false,
  startedAt: '',
  mode: 'regular',
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
      mode: 'regular',
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
export async function startTournament(mode: 'regular' | 'bughouse' = 'regular'): Promise<TournamentState> {
  tournamentState = {
    active: true,
    startedAt: new Date().toISOString(),
    mode,
  };
  await saveTournamentState();
  loggerLog('[TOURNAMENT]', `Tournament started (mode: ${mode})`);
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

  // Update existing players in target
  const updatedTarget = targetPlayers.map(targetPlayer => {
    const key = `${targetPlayer.lastName.toLowerCase()}|${targetPlayer.firstName.toLowerCase()}`;
    const sourcePlayer = sourceMap.get(key);
    if (sourcePlayer) {
      // Update rating and nRating from source
      return {
        ...targetPlayer,
        rating: sourcePlayer.rating,
        nRating: sourcePlayer.nRating,
        trophyEligible: sourcePlayer.trophyEligible,
        grade: sourcePlayer.grade,
        group: sourcePlayer.group,
      };
    }
    return targetPlayer;
  });

  // Add missing players from source
  const existingKeys = new Set(updatedTarget.map(p => `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`));
  for (const player of sourcePlayers) {
    const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
    if (!existingKeys.has(key)) {
      updatedTarget.push({
        ...player,
        gameResults: Array(31).fill(null), // Fresh game results
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

    const maxTrophies = Math.floor(players.length / 3);
    const trophies: any[] = [];
    let slotCount = 0;

    if (isClubMode) {
      // Club ladder mode - use club ladder rating
      trophies.push(...await generateClubLadderTrophies(players, maxTrophies));
    } else {
      // Mini-game tournament mode
      trophies.push(...await generateMiniGameTrophies(players, maxTrophies));
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

// Generate trophies for club ladder mode
async function generateClubLadderTrophies(players: PlayerData[], maxTrophies: number): Promise<any[]> {
  const trophies: any[] = [];
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);

  // Award 1st place (highest rated player)
  if (sortedPlayers.length > 0 && trophies.length < maxTrophies) {
    trophies.push({
      rank: trophies.length + 1,
      player: `${sortedPlayers[0].firstName} ${sortedPlayers[0].lastName}`,
      gr: sortedPlayers[0].grade,
      trophyType: '1st Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: sortedPlayers[0].num_games,
    });
  }

  // Award 2nd place (2nd highest rated player)
  if (sortedPlayers.length > 1 && trophies.length < maxTrophies) {
    trophies.push({
      rank: trophies.length + 1,
      player: `${sortedPlayers[1].firstName} ${sortedPlayers[1].lastName}`,
      gr: sortedPlayers[1].grade,
      trophyType: '2nd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: sortedPlayers[1].num_games,
    });
  }

  // Award most games
  const mostGamesPlayer = sortedPlayers.reduce((max, p) => p.num_games > max.num_games ? p : max, sortedPlayers[0]);
  if (trophies.length < maxTrophies && mostGamesPlayer) {
    trophies.push({
      rank: trophies.length + 1,
      player: `${mostGamesPlayer.firstName} ${mostGamesPlayer.lastName}`,
      gr: mostGamesPlayer.grade,
      trophyType: 'Most Games',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: mostGamesPlayer.num_games,
    });
  }

  // Award Gr 1st places (after blank row)
  const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
  for (const grade of gradeGroups) {
    if (trophies.length >= maxTrophies) break;
    const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.rating - a.rating);
    if (gradePlayers.length > 0) {
      trophies.push({
        rank: trophies.length + 1,
        player: `${gradePlayers[0].firstName} ${gradePlayers[0].lastName}`,
        gr: grade,
        trophyType: '1st Place',
        miniGameOrGrade: `Gr ${grade}`,
        gamesPlayed: gradePlayers[0].num_games,
      });
    }
  }

  return trophies;
}

// Count total games played by a player across all mini-game files
async function countGamesAcrossMiniGames(playerName: string, existingFiles: string[]): Promise<number> {
  let totalGames = 0;
  
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;
    
    const player = miniGameData.players.find(
      p => p.lastName.toLowerCase() === playerName.toLowerCase() &&
           p.firstName.toLowerCase() === playerName.toLowerCase()
    );
    
    if (player && player.gameResults) {
      const games = player.gameResults.filter(r => r && r !== '' && r !== '_');
      totalGames += games.length;
    }
  }
  
  return totalGames;
}

// Generate trophies for mini-game tournament mode
async function generateMiniGameTrophies(players: PlayerData[], maxTrophies: number): Promise<any[]> {
  const trophies: any[] = [];

  // Get existing mini-game files
  const existingFiles = await getExistingMiniGameFiles();

  // Award 1st places (hardest first)
  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    if (trophies.length >= maxTrophies) break;
    if (!existingFiles.includes(fileName)) continue;

    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData || miniGameData.players.length === 0) continue;

    // Get highest rated player from this mini-game
    const sortedPlayers = [...miniGameData.players].sort((a, b) => b.rating - a.rating);
    if (sortedPlayers.length > 0) {
      trophies.push({
        rank: trophies.length + 1,
        player: `${sortedPlayers[0].firstName} ${sortedPlayers[0].lastName}`,
        gr: sortedPlayers[0].grade,
        trophyType: '1st Place',
        miniGameOrGrade: fileName.replace('.tab', ''),
        gamesPlayed: sortedPlayers[0].num_games,
      });
    }
  }

  // Award 2nd places (hardest first)
  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    if (trophies.length >= maxTrophies) break;
    if (!existingFiles.includes(fileName)) continue;

    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData || miniGameData.players.length === 0) continue;

    const sortedPlayers = [...miniGameData.players].sort((a, b) => b.rating - a.rating);
    if (sortedPlayers.length > 1) {
      trophies.push({
        rank: trophies.length + 1,
        player: `${sortedPlayers[1].firstName} ${sortedPlayers[1].lastName}`,
        gr: sortedPlayers[1].grade,
        trophyType: '2nd Place',
        miniGameOrGrade: fileName.replace('.tab', ''),
        gamesPlayed: sortedPlayers[1].num_games,
      });
    }
  }

  // Award most games (count across all mini-game files)
  const playerGameCounts = await Promise.all(
    players.map(async (p) => ({
      player: p,
      totalGames: await countGamesAcrossMiniGames(p.lastName + ' ' + p.firstName, existingFiles),
    }))
  );

  const topGamePlayer = playerGameCounts
    .filter(x => x.totalGames > 0)
    .sort((a, b) => b.totalGames - a.totalGames)[0];

  if (topGamePlayer && trophies.length < maxTrophies) {
    trophies.push({
      rank: trophies.length + 1,
      player: `${topGamePlayer.player.firstName} ${topGamePlayer.player.lastName}`,
      gr: topGamePlayer.player.grade,
      trophyType: 'Most Games',
      miniGameOrGrade: 'All Mini-Games',
      gamesPlayed: topGamePlayer.totalGames,
    });
  }

  // Award Gr 1st places (after blank row)
  const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
  for (const grade of gradeGroups) {
    if (trophies.length >= maxTrophies) break;
    const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.rating - a.rating);
    if (gradePlayers.length > 0) {
      trophies.push({
        rank: trophies.length + 1,
        player: `${gradePlayers[0].firstName} ${gradePlayers[0].lastName}`,
        gr: grade,
        trophyType: '1st Place',
        miniGameOrGrade: `Gr ${grade}`,
        gamesPlayed: gradePlayers[0].num_games,
      });
    }
  }

  return trophies;
}
