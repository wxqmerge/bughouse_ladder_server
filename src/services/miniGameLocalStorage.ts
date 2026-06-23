/**
 * Mini-game localStorage storage implementation
 * Uses shared trophy logic from shared/utils/trophyGeneration.ts
 */

import { PlayerData, LadderData, MiniGameStore, MINI_GAME_FILES } from '../../shared/types';
import { clearRankReferences } from '../../shared/utils/hashUtils';
import { NUM_ROUNDS } from '../../shared/utils/constants';
import { mergeIdentityFromClubLadder, splitIdentityChanges } from '../../shared/utils/identityMerge';
import { getLocalPlayers, setJson } from './storageService';
import {
  copyPlayersToTarget as sharedCopyPlayersToTarget,
  mergeGameResults as sharedMergeGameResults,
  generateTrophyReport as sharedGenerateTrophyReport,
  parseMiniGameImportContent,
} from '../../shared/utils/trophyGeneration';
import { parsePlayerLine, playersToTabContent as sharedPlayersToTabContent } from '../../shared/utils/tabUtils';

const MINI_GAME_PREFIX = 'mini_game_';

function getStorageKey(fileName: string): string {
  return MINI_GAME_PREFIX + fileName;
}

export function parseTabContent(content: string): LadderData {
  let lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { header: [], players: [], rawLines: [] };
  }

  // Detect and repair duplicate header
  if (lines.length > 1) {
    const secondLine = lines[1];
    const secondLineNorm = secondLine.replace(/\r/g, '');
    const secondLineCols = secondLineNorm.split('\t');
    const isHeader = secondLineCols[13] && secondLineCols[13].trim() === '1';
    
    if (!isHeader && secondLineNorm.includes('Last Name') && secondLineNorm.includes('First Name')) {
      const normCols = secondLineNorm.split('\t');
      if (normCols[13] && normCols[13].trim() === '1') {
        lines = [lines[0], ...lines.slice(2)];
      }
    }
    
    if (isHeader) {
      lines = [lines[0], ...lines.slice(2)];
    }
  }

  const header = lines[0].split('\t');
  const players: PlayerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const player = parsePlayerLine(lines[i]);
    if (player && player.rank > 0 && (player.lastName || player.firstName || player.nRating !== 0)) {
      players.push(player);
    }
  }

  return { header, players, rawLines: lines };
}

function generateTabContent(ladderData: LadderData): string {
  return ladderData.rawLines.join('\n') + '\n';
}

export function playersToTabContent(players: PlayerData[]): string {
  return sharedPlayersToTabContent(players);
}

export async function importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
  const imported: string[] = [];
  const errors: string[] = [];

  const sections = parseMiniGameImportContent(content);

  for (const { fileName, fileContent } of sections) {
    if (!MINI_GAME_FILES.includes(fileName)) {
      errors.push(`Unknown file: ${fileName}`);
      continue;
    }

    try {
      const ladderData = parseTabContent(fileContent);
      localStorage.setItem(getStorageKey(fileName), generateTabContent(ladderData));
      imported.push(fileName);
    } catch (err) {
      errors.push(`Failed to parse ${fileName}: ${(err as Error).message}`);
    }
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
    const raw = parseTabContent(content);
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
  const content = generateTabContent({ ...ladderData, players: miniGamePlayers });
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
