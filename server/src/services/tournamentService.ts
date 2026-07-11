import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { log as loggerLog } from '../utils/logger.js';
import { readLadderFile, writeLadderFile, PlayerData, LadderData, ensureDataDirectory } from './dataService.js';
import { MINI_GAME_FILES, MINI_GAME_DIFFICULTY_ORDER, DEFAULT_GAME_RESULTS } from '../../../shared/types/index.js';
import { clearRankReferences } from '../../../shared/utils/hashUtils.js';
import { NUM_ROUNDS } from '../../../shared/utils/constants.js';
import { IDENTITY_FIELDS, IdentityField, mergeIdentityFromClubLadder, mergeIdentityFromClubLadderByName, splitIdentityChanges } from '../../../shared/utils/identityMerge.js';
import { deduplicatePlayers } from '../../../shared/utils/dedupUtils.js';
import { parsePlayerLine, generateTabContent } from '../../../shared/utils/tabUtils.js';
import {
  copyPlayersToTarget as sharedCopyPlayersToTarget,
  mergeGameResults as sharedMergeGameResults,
  generateTrophyReport as sharedGenerateTrophyReport,
  parseMiniGameImportContent,
} from '../../../shared/utils/trophyGeneration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MiniGameStore {
  getMiniGameFiles(): string[];
  readMiniGameFile(fileName: string): Promise<LadderData | null>;
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<{ identityUpdates: PlayerData[]; miniGameWritten: boolean }>;
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

// In-memory cache for mini-game reads
interface MiniGameCache {
  data: LadderData | null;
  mtimeMs: number;
  timestamp: number;
}
const miniGameCache = new Map<string, MiniGameCache>();
const MINI_GAME_CACHE_TTL_MS = 5000;

// For testing: clear the mini-game read cache
export function clearMiniGameCache(): void {
  miniGameCache.clear();
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
export async function loadTournamentState(): Promise<TournamentState | null> {
  try {
    const content = await fs.readFile(TOURNAMENT_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.active !== 'boolean' || typeof parsed.startedAt !== 'string') {
      console.warn(`[Tournament] Tournament state file has invalid shape, returning null`);
      return null;
    }
    return parsed as TournamentState;
  } catch (error) {
    console.error(`[Tournament] Failed to read tournament state:`, error);
    return null;
  }
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

// Read a mini-game file (raw, no identity merge)
export async function readMiniGameFileRaw(fileName: string): Promise<LadderData | null> {
  const filePath = getMiniGameFilePath(fileName);
  try {
    await fs.access(filePath);

    // Check cache (use full path as key to avoid cross-test collisions)
    const cached = miniGameCache.get(filePath);
    const stat = await fs.stat(filePath);
    const now = Date.now();
    if (cached && cached.data && stat.mtimeMs === cached.mtimeMs && (now - cached.timestamp) < MINI_GAME_CACHE_TTL_MS) {
      return { ...cached.data, players: [...cached.data.players] };
    }

    const result = await readLadderFile(filePath);

    // Update cache
    miniGameCache.set(filePath, { data: result, mtimeMs: stat.mtimeMs, timestamp: now });

    return result;
  } catch {
    return null;
  }
}

// Read a mini-game file with club ladder identity merged in
export async function readMiniGameFile(fileName: string): Promise<LadderData | null> {
  const raw = await readMiniGameFileRaw(fileName);
  if (!raw) return null;

  let clubLadder: LadderData | null = null;
  const clubLadderPath = path.join(path.dirname(getMiniGameFilePath(fileName)), 'ladder.tab');
  try {
    clubLadder = await readLadderFile(clubLadderPath);
  } catch {
    // Club ladder doesn't exist — return raw data
  }

  if (clubLadder && clubLadder.players.length > 0) {
    const mergedPlayers = mergeIdentityFromClubLadder(raw.players, clubLadder.players);
    return {
      ...raw,
      players: mergedPlayers,
    };
  }

  return raw;
}

// Write a mini-game file with identity split to club ladder
export async function writeMiniGameFile(
	fileName: string,
	ladderData: LadderData
): Promise<{ identityUpdates: PlayerData[]; miniGameWritten: boolean }> {
	let identityUpdates: PlayerData[] = [];
	let clubLadder: LadderData | null = null;
	// Read club ladder from the same directory as the mini-game file
	const clubLadderPath = path.join(path.dirname(getMiniGameFilePath(fileName)), 'ladder.tab');
	try {
		clubLadder = await readLadderFile(clubLadderPath);
	} catch {
		// Club ladder doesn't exist yet — skip identity merge
	}

	if (clubLadder && clubLadder.players.length > 0) {
		const { identityUpdates: updates, miniGamePlayers } = splitIdentityChanges(
			ladderData.players,
			clubLadder.players
		);
		identityUpdates = updates;

		// Write identity updates to club ladder
		if (identityUpdates.length > 0) {
			for (const update of identityUpdates) {
				const idx = clubLadder.players.findIndex(p => p.rank === update.rank);
				if (idx !== -1) {
					// Only apply identity fields, preserve club player's nRating/gameResults
					const clubPlayer = clubLadder.players[idx];
					for (const field of IDENTITY_FIELDS) {
						(clubPlayer as Partial<Record<IdentityField, unknown>>)[field] = update[field];
					}
				} else {
					clubLadder.players.push(update);
				}
			}
			await writeLadderFile(clubLadder, clubLadderPath);
			loggerLog('[IDENTITY MERGE]', `Wrote ${identityUpdates.length} identity updates to club ladder`);
		}

		// Write mini-game file with merged identity + original nRating/gameResults
		const filePath = getMiniGameFilePath(fileName);
		await ensureDataDirectory();
		await writeLadderFile({
			...ladderData,
			players: miniGamePlayers,
		}, filePath);
	} else {
		// No club ladder — write as-is
		const filePath = getMiniGameFilePath(fileName);
		await ensureDataDirectory();
		await writeLadderFile(ladderData, filePath);
	}
	// Invalidate mini-game cache (use full path as key)
	miniGameCache.delete(getMiniGameFilePath(fileName));

	return { identityUpdates, miniGameWritten: true };
}

/**
 * After a raw import, reconcile the mini-game file's player identity with ladder.tab.
 * Matches by name (not rank) so that imported files with mismatched ranks still get
 * correct player data from the club ladder.
 */
export async function reconcileMiniGameWithClubLadder(fileName: string): Promise<void> {
	const clubLadderPath = path.join(path.dirname(getMiniGameFilePath(fileName)), 'ladder.tab');
	let clubLadder: LadderData | null = null;
	try {
		clubLadder = await readLadderFile(clubLadderPath);
	} catch {
		return;
	}

	if (!clubLadder || clubLadder.players.length === 0) return;

	const raw = await readMiniGameFileRaw(fileName);
	if (!raw || raw.players.length === 0) return;

	const reconciled = mergeIdentityFromClubLadderByName(raw.players, clubLadder.players);

	// Check if anything actually changed
	let changed = false;
	for (let i = 0; i < raw.players.length && i < reconciled.length; i++) {
		for (const field of IDENTITY_FIELDS) {
			if (field === 'rank') continue;
			if (raw.players[i][field] !== reconciled[i][field]) {
				changed = true;
				break;
			}
		}
		if (changed) break;
	}

	if (!changed) return;

	// Invalidate cache before writing
	miniGameCache.delete(getMiniGameFilePath(fileName));
	await writeMiniGameFile(fileName, { ...raw, players: reconciled });
	loggerLog('[RECONCILE]', `Reconciled ${fileName} with club ladder (${reconciled.length} players)`);
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
export interface ZipEntry {
  name: string;
  filePath?: string;
  content?: string;
}

export async function exportTournamentFiles(): Promise<{ success: boolean; message: string; files?: ZipEntry[] }> {
  try {
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
    const files: ZipEntry[] = [];

    // Add club ladder
    const ladderPath = path.join(dataDir, 'ladder.tab');
    try {
      await fs.access(ladderPath);
      files.push({ name: 'ladder.tab', filePath: ladderPath });
    } catch {
      // ladder.tab doesn't exist, skip
    }

    // Add mini-game files
    for (const fileName of MINI_GAME_FILES) {
      const filePath = path.join(dataDir, fileName);
      try {
        await fs.access(filePath);
        files.push({ name: fileName, filePath });
      } catch {
        // File doesn't exist, skip
      }
    }

    if (files.length === 0) {
      return { success: false, message: 'No files found' };
    }

    return {
      success: true,
      message: `Exported ${files.length} files`,
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
    const miniGameData = await readMiniGameFileRaw(fileName);
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
        gameResults: [...DEFAULT_GAME_RESULTS],
      });
      // Invalidate cache before write to ensure fresh state
      miniGameCache.delete(getMiniGameFilePath(fileName));
      await writeMiniGameFile(fileName, miniGameData);
      loggerLog('[TOURNAMENT]', `Added player ${newPlayer.firstName} ${newPlayer.lastName} to ${fileName}`);
    }
  }
}

/**
 * Remove a player from a LadderData and clear rank references.
 */
function removePlayerAndClearRefs(ladderData: LadderData, key: string): { removed: boolean; deletedRank?: number } {
  const idx = ladderData.players.findIndex(
    p => p.lastName.toLowerCase() + '|' + p.firstName.toLowerCase() === key
  );
  if (idx === -1) return { removed: false };

  const deletedRank = ladderData.players[idx].rank;
  ladderData.players.splice(idx, 1);
  for (const player of ladderData.players) {
    if (player.gameResults) {
      player.gameResults = clearRankReferences(player.gameResults, deletedRank);
    }
  }
  return { removed: true, deletedRank };
}

export async function removePlayerFromAll(lastName: string, firstName: string): Promise<void> {
  const key = lastName.toLowerCase() + '|' + firstName.toLowerCase();

  const ladderData = await readLadderFile();
  const ladderResult = removePlayerAndClearRefs(ladderData, key);
  if (ladderResult.removed) {
    await writeLadderFile(ladderData);
    loggerLog('[TOURNAMENT]', 'Removed player ' + firstName + ' ' + lastName + ' (rank ' + ladderResult.deletedRank + ') from club ladder');
  }

  const existingFiles = await getExistingMiniGameFiles();
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFileRaw(fileName);
    if (!miniGameData) continue;

    const result = removePlayerAndClearRefs(miniGameData, key);
    if (result.removed) {
      await writeMiniGameFile(fileName, miniGameData);
      loggerLog('[TOURNAMENT]', 'Removed player ' + firstName + ' ' + lastName + ' (rank ' + result.deletedRank + ') from ' + fileName);
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
    const miniGameData = await readMiniGameFileRaw(fileName);
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
    return writeMiniGameFile(fileName, ladderData);
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

  async generateTrophyReport(_players: PlayerData[]) {
    return generateTrophyReport();
  },

  async importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
    const imported: string[] = [];
    const errors: string[] = [];
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));

    // Backup existing files to old/ directory before import
    const backupDir = path.join(dataDir, 'old');
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (err) {
      loggerLog('[TOURNAMENT]', `Failed to create backup directory: ${(err as Error).message}`);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, timestamp);
    try {
      await fs.mkdir(backupPath, { recursive: true });
      // Backup ladder.tab
      const ladderPath = process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab');
      try {
        await fs.copyFile(ladderPath, path.join(backupPath, 'ladder.tab'));
        loggerLog('[TOURNAMENT]', `Backed up ladder.tab to ${backupPath}`);
      } catch { /* ladder.tab may not exist */ }
      // Backup existing mini-game files
      for (const fileName of MINI_GAME_FILES) {
        const filePath = path.join(dataDir, fileName);
        try {
          await fs.copyFile(filePath, path.join(backupPath, fileName));
          loggerLog('[TOURNAMENT]', `Backed up ${fileName} to ${backupPath}`);
        } catch { /* file may not exist */ }
      }
    } catch (err) {
      loggerLog('[TOURNAMENT]', `Backup failed: ${(err as Error).message}`);
    }

    const sections = parseMiniGameImportContent(content);
    const importedMiniGames = new Set<string>();

    for (const { fileName, fileContent } of sections) {
      const normFileName = fileName.toLowerCase();

      // Handle ladder.tab separately (not in MINI_GAME_FILES)
      if (normFileName === 'ladder.tab') {
        try {
          const targetPath = process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab');
          await fs.writeFile(targetPath, fileContent + '\n', 'utf-8');
          imported.push(normFileName);
          loggerLog('[TOURNAMENT]', `Imported ${normFileName}`);
        } catch (err) {
          errors.push(`Failed to write ${normFileName}: ${(err as Error).message}`);
        }
        continue;
      }

      if (!MINI_GAME_FILES.includes(normFileName)) {
        errors.push(`Unknown file: ${fileName}`);
        continue;
      }

      try {
        // Parse and dedup before writing to prevent duplicate ranks
        const lines = fileContent.split('\n').filter(l => l.trim());
        const players: PlayerData[] = [];
        for (const line of lines) {
          const p = parsePlayerLine(line);
          if (p) players.push(p);
        }
        const beforeDedup = players.length;
        const deduped = deduplicatePlayers(players);
        if (beforeDedup !== deduped.length) {
          loggerLog('[TOURNAMENT]', `${normFileName}: removed ${beforeDedup - deduped.length} duplicate players`);
        }
        const filePath = path.join(dataDir, normFileName);
        await fs.writeFile(filePath, generateTabContent(deduped) + '\n', 'utf-8');
        // Post-import reconciliation: align player identity with ladder.tab
        miniGameCache.delete(getMiniGameFilePath(normFileName));
        await reconcileMiniGameWithClubLadder(normFileName);
        imported.push(normFileName);
        importedMiniGames.add(normFileName);
        loggerLog('[TOURNAMENT]', `Imported ${normFileName}`);
      } catch (err) {
        errors.push(`Failed to write ${normFileName}: ${(err as Error).message}`);
      }
    }

    // Remove mini-game files that weren't in the import
    for (const fileName of MINI_GAME_FILES) {
      if (importedMiniGames.has(fileName)) continue;
      const filePath = path.join(dataDir, fileName);
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        loggerLog('[TOURNAMENT]', `Removed stale mini-game: ${fileName}`);
      } catch {
        // File doesn't exist, skip
      }
    }

    return { imported, errors };
  },
};
