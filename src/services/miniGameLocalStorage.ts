/**
 * Mini-game localStorage storage implementation
 * Uses shared trophy logic from shared/utils/trophyGeneration.ts
 */

import { PlayerData, LadderData, MiniGameStore, MINI_GAME_FILES } from '../../shared/types';
import { clearRankReferences } from '../../shared/utils/hashUtils';
import { NUM_ROUNDS } from '../../shared/utils/constants';
import { mergeIdentityFromClubLadder, splitIdentityChanges } from '../../shared/utils/identityMerge';
import { deduplicatePlayers, normalizeGrades } from '../../shared/utils/dedupUtils';
import { getLocalPlayers, getJson, setJson } from './storageService';
import {
  copyPlayersToTarget as sharedCopyPlayersToTarget,
  mergeGameResults as sharedMergeGameResults,
  generateTrophyReport as sharedGenerateTrophyReport,
  parseMiniGameImportContent,
} from '../../shared/utils/trophyGeneration';
import { parsePlayerLine, parseTabContent as sharedParseTabContent, playersToTabContent as sharedPlayersToTabContent } from '../../shared/utils/tabUtils';

// Re-export for backward compatibility
export { parseTabContent } from '../../shared/utils/tabUtils';

const MINI_GAME_PREFIX = 'mini_game_';

function getStorageKey(fileName: string): string {
  return MINI_GAME_PREFIX + fileName;
}

function preserveRawTabContent(ladderData: LadderData): string {
  return ladderData.rawLines.join('\n') + '\n';
}

export function playersToTabContent(players: PlayerData[]): string {
  return sharedPlayersToTabContent(players);
}

export async function importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
  const imported: string[] = [];
  const errors: string[] = [];

  // Backup existing data before import
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupKey = `ladder_backup_${timestamp}`;
  const backup: Record<string, string> = {};
  // Backup ladder players
  try {
    const ladderData = getJson('ladder_players');
    if (ladderData) backup['ladder_players'] = JSON.stringify(ladderData);
  } catch { /* no ladder data */ }
  // Backup existing mini-game files
  for (const fileName of MINI_GAME_FILES) {
    try {
      const content = localStorage.getItem(getStorageKey(fileName));
      if (content) backup[getStorageKey(fileName)] = content;
    } catch { /* file may not exist */ }
  }
  if (Object.keys(backup).length > 0) {
    localStorage.setItem(backupKey, JSON.stringify(backup));
  }

  const sections = parseMiniGameImportContent(content);
  const importedMiniGames = new Set<string>();

  for (const { fileName, fileContent } of sections) {
    const normFileName = fileName.toLowerCase();

    // Handle ladder.tab separately (not in MINI_GAME_FILES)
    if (normFileName === 'ladder.tab') {
      try {
        const ladderData = sharedParseTabContent(fileContent);
        const beforeDedup = ladderData.players.length;
        const deduped = deduplicatePlayers(ladderData.players);
        if (beforeDedup !== deduped.length) {
          console.warn(`[IMPORT] ${normFileName}: removed ${beforeDedup - deduped.length} duplicate players`);
        }
        setJson('ladder_players', normalizeGrades(deduped));
        imported.push(normFileName);
      } catch (err) {
        errors.push(`Failed to parse ${fileName}: ${(err as Error).message}`);
      }
      continue;
    }

    if (!MINI_GAME_FILES.includes(normFileName)) {
      errors.push(`Unknown file: ${fileName}`);
      continue;
    }

    try {
      let ladderData = sharedParseTabContent(fileContent);
      // Dedup guard: prevent duplicate ranks from corrupting the import
      const beforeDedup = ladderData.players.length;
      ladderData = { ...ladderData, players: deduplicatePlayers(ladderData.players) };
      if (beforeDedup !== ladderData.players.length) {
        console.warn(`[IMPORT] ${normFileName}: removed ${beforeDedup - ladderData.players.length} duplicate players`);
      }
      localStorage.setItem(getStorageKey(normFileName), preserveRawTabContent(ladderData));
      imported.push(normFileName);
      importedMiniGames.add(normFileName);
    } catch (err) {
      errors.push(`Failed to parse ${fileName}: ${(err as Error).message}`);
    }
  }

  // Remove mini-game files that weren't in the import
  for (const fileName of MINI_GAME_FILES) {
    if (importedMiniGames.has(fileName)) continue;
    localStorage.removeItem(getStorageKey(fileName));
  }

  return { imported, errors };
}

/**
 * Check if any cached mini-game file has filled game results.
 * Reads from localStorage only — no network calls.
 */
export async function miniGamesHaveResults(): Promise<boolean> {
  for (const fileName of MINI_GAME_FILES) {
    const data = await readMiniGameFile(fileName);
    if (data?.players?.some(p => (p.gameResults || []).some(r => r && r.trim() !== ''))) {
      return true;
    }
  }
  return false;
}

async function readMiniGameFile(fileName: string): Promise<LadderData | null> {
  try {
    const content = localStorage.getItem(getStorageKey(fileName));
    if (!content) return null;
    const raw = sharedParseTabContent(content);
    const clubPlayers = getLocalPlayers();
    const mergedPlayers = mergeIdentityFromClubLadder(raw.players, clubPlayers);
    return { ...raw, players: mergedPlayers };
  } catch (e) {
    console.warn(`[miniGameLocalStorage] Failed to read mini-game file "${fileName}" (corrupted content):`, e);
    return null;
  }
}

async function writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<{ identityUpdates: PlayerData[]; miniGameWritten: boolean }> {
  const clubPlayers = getLocalPlayers();
  const { identityUpdates, miniGamePlayers } = splitIdentityChanges(
    ladderData.players,
    clubPlayers
  );

  // Write identity updates to club ladder localStorage
  if (identityUpdates.length > 0) {
    const updatedClub = [...clubPlayers];
    for (const update of identityUpdates) {
      const idx = updatedClub.findIndex(p => p.rank === update.rank);
      if (idx !== -1) {
        updatedClub[idx] = { ...updatedClub[idx], ...update };
      } else {
        updatedClub.push(update);
      }
    }
    setJson('ladder_players', updatedClub);
  }

  // Write mini-game file with merged identity + original nRating/gameResults
  const content = preserveRawTabContent({ ...ladderData, players: miniGamePlayers });
  localStorage.setItem(getStorageKey(fileName), content);

  return { identityUpdates, miniGameWritten: true };
}

export const miniGameStore: MiniGameStore = {
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

  async getExistingMiniGameFiles(): Promise<string[]> {
    const existingFiles: string[] = [];
    for (const fileName of MINI_GAME_FILES) {
      if (localStorage.getItem(getStorageKey(fileName))) {
        existingFiles.push(fileName);
      }
    }
    return existingFiles;
  },

  async clearMiniGames(): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    for (const fileName of MINI_GAME_FILES) {
      if (localStorage.getItem(getStorageKey(fileName))) {
        localStorage.removeItem(getStorageKey(fileName));
        deletedCount++;
      }
    }
    return { deletedCount };
  },

  async hasMiniGameFiles(): Promise<boolean> {
    const existingFiles = await this.getExistingMiniGameFiles();
    return existingFiles.length > 0;
  },

  async checkMiniGameFilesWith(): Promise<string[]> {
    const filesWithData: string[] = [];
    for (const fileName of MINI_GAME_FILES) {
      const content = localStorage.getItem(getStorageKey(fileName));
      if (content) {
        const lines = content.trim().split('\n');
        if (lines.length > 1) {
          filesWithData.push(fileName);
        }
      }
    }
    return filesWithData;
  },

  async addPlayerToAllMiniGames(newPlayer: PlayerData): Promise<void> {
    const existingFiles = await this.getExistingMiniGameFiles();
    
    for (const fileName of existingFiles) {
      const miniGameData = await this.readMiniGameFile(fileName);
      if (!miniGameData) continue;
      
      const exists = miniGameData.players.some(
        p => p.lastName.toLowerCase() === newPlayer.lastName.toLowerCase() &&
             p.firstName.toLowerCase() === newPlayer.firstName.toLowerCase()
      );
      
      if (!exists) {
        miniGameData.players.push({
          ...newPlayer,
          gameResults: new Array(NUM_ROUNDS).fill(null),
        });
        await this.writeMiniGameFile(fileName, miniGameData);
      }
    }
  },

  async removePlayerFromAllMiniGames(lastName: string, firstName: string): Promise<void> {
    const key = lastName.toLowerCase() + '|' + firstName.toLowerCase();
    const existingFiles = await this.getExistingMiniGameFiles();

    for (const fileName of existingFiles) {
      const miniGameData = await this.readMiniGameFile(fileName);
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
        await this.writeMiniGameFile(fileName, miniGameData);
      }
    }
  },

  async updatePlayerInAllMiniGames(
    _rank: number,
    originalLastName: string,
    originalFirstName: string,
    updates: Partial<PlayerData>
  ): Promise<void> {
    const origKey = originalLastName.toLowerCase() + '|' + originalFirstName.toLowerCase();
    const existingFiles = await this.getExistingMiniGameFiles();

    for (const fileName of existingFiles) {
      const miniGameData = await this.readMiniGameFile(fileName);
      if (!miniGameData) continue;

      const idx = miniGameData.players.findIndex(
        p => p.lastName.toLowerCase() + '|' + p.firstName.toLowerCase() === origKey
      );
      if (idx !== -1) {
        Object.assign(miniGameData.players[idx], updates);
        await this.writeMiniGameFile(fileName, miniGameData);
      }
    }
  },

  async generateTrophyReport(players: PlayerData[], debugLevel: number = 3) {
    return sharedGenerateTrophyReport(miniGameStore, players, debugLevel);
  },

  async importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
    return importMiniGameFiles(content);
  },
};
