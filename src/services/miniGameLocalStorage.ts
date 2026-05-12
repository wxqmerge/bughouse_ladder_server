/**
 * Mini-game localStorage storage implementation
 * Uses shared trophy logic from shared/utils/trophyGeneration.ts
 */

import { PlayerData, LadderData, MiniGameStore } from '../../shared/types';
import { calculateRatings, processGameResults } from '../../shared/utils/hashUtils';
import {
  copyPlayersToTarget as sharedCopyPlayersToTarget,
  mergeGameResults as sharedMergeGameResults,
  generateClubLadderTrophies as sharedGenerateClubLadderTrophies,
  generateMiniGameTrophies as sharedGenerateMiniGameTrophies,
  debugLine as sharedDebugLine,
  clubLadderGamesPlayed,
  MiniGameData,
} from '../../shared/utils/trophyGeneration';
import { buildTrophiesSection, buildClubLadderPlayerSection } from '../../shared/utils/trophyDebugReport';

const MINI_GAME_FILES = [
  'BG_Game.tab',
  'Bishop_Game.tab',
  'Pillar_Game.tab',
  'Kings_Cross.tab',
  'Pawn_Game.tab',
  'Queen_Game.tab',
  'bughouse.tab',
];

const MINI_GAME_PREFIX = 'mini_game_';

function getStorageKey(fileName: string): string {
  return MINI_GAME_PREFIX + fileName;
}

function parseTabContent(content: string): LadderData {
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
    const cols = lines[i].split('\t');
    if (cols.length < 14) continue;

    const ratingStr = String(cols[3] || "").trim();
    const isNegRating = ratingStr.startsWith("-");
    const nRateStr = String(cols[5] || "").trim();

    const player: PlayerData = {
      rank: cols[4] ? parseInt(cols[4]) : 0,
      group: cols[0] && cols[0].trim() !== "" ? cols[0].trim() : "",
      lastName: cols[1] !== null ? cols[1] : "",
      firstName: cols[2] !== null ? cols[2] : "",
      rating: Math.abs(parseInt(ratingStr)) || 0,
      nRating: Math.abs(parseInt(nRateStr)) || 0,
      trophyEligible: !isNegRating,
      grade: cols[6] !== null ? cols[6] : "N/A",
      num_games: cols[7] !== null && !isNaN(parseInt(cols[7]))
        ? parseInt(cols[7])
        : 0,
      attendance: cols[8] !== null && !isNaN(parseInt(cols[8]))
        ? parseInt(cols[8])
        : 0,
      phone: cols[9] !== null ? cols[9] : "",
      info: cols[10] !== null ? cols[10] : "",
      school: cols[11] !== null ? cols[11] : "",
      room: cols[12] !== null ? cols[12] : "",
      gameResults: [],
    };

    const gameResults: (string | null)[] = [];
    for (let g = 0; g < 31; g++) {
      gameResults.push(cols[13 + g]);
    }
    player.gameResults = gameResults;

    if (player.rank > 0 && (player.lastName || player.firstName || player.nRating !== 0)) {
      players.push(player);
    }
  }

  return { header, players, rawLines: lines };
}

function generateTabContent(ladderData: LadderData): string {
  return ladderData.rawLines.join('\n') + '\n';
}

export async function importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
  const imported: string[] = [];
  const errors: string[] = [];
  
  const sections = content.split('=== ').filter(s => s.trim());
  
  for (const section of sections) {
    const firstLine = section.split('\n')[0];
    const fileName = firstLine.replace(' ===', '').trim();
    
    if (!MINI_GAME_FILES.includes(fileName)) {
      errors.push(`Unknown file: ${fileName}`);
      continue;
    }
    
    const fileContent = section.substring(firstLine.length + 1).trim();
    
    if (!fileContent) {
      errors.push(`Empty file: ${fileName}`);
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

async function readMiniGameFile(fileName: string): Promise<LadderData | null> {
  try {
    const content = localStorage.getItem(getStorageKey(fileName));
    if (!content) return null;
    return parseTabContent(content);
  } catch {
    return null;
  }
}

async function writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void> {
  const content = generateTabContent(ladderData);
  localStorage.setItem(getStorageKey(fileName), content);
}

export const miniGameStore: MiniGameStore = {
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
          gameResults: new Array(31).fill(null),
        });
        await this.writeMiniGameFile(fileName, miniGameData);
      }
    }
  },

  async generateTrophyReport(players: PlayerData[], debugLevel: number = 3): Promise<{
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
    debugInfo?: string;
    trophiesSection?: string[];
  }> {
    try {
      const hasMiniGames = await this.hasMiniGameFiles();
      const isClubMode = !hasMiniGames;

      if (players.length === 0) {
        return { success: false, message: 'No players found' };
      }

      const minTrophies = Math.ceil(players.length / 3);
      let trophies: any[] = [];
      const debugLines: string[] = [];

      debugLines.push(sharedDebugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
      debugLines.push(sharedDebugLine('Players', String(players.length), '', '', '', '', '', ''));
      debugLines.push(sharedDebugLine('Min Trophies', `${minTrophies} (ceil(${players.length} / 3))`, '', '', '', '', '', ''));
      debugLines.push('');

      if (isClubMode) {
        debugLines.push(sharedDebugLine('Mode', 'Club Ladder (no mini-game files)', '', '', '', '', '', ''));
        
        const clubPlayerLines = buildClubLadderPlayerSection(players, debugLevel);
        debugLines.push(...clubPlayerLines);
        
        trophies = sharedGenerateClubLadderTrophies(players, minTrophies);
      } else {
        const existingFiles = await this.getExistingMiniGameFiles();
        const m = existingFiles.length;
        debugLines.push(sharedDebugLine('Mode', 'Mini-Game Tournament', '', '', '', '', '', ''));
        debugLines.push(sharedDebugLine('Mini-games played', String(m), '', '', '', '', '', ''));
  debugLines.push(sharedDebugLine('Award 2nd place', `t=${minTrophies} > m=${m} ? ${minTrophies > m}`, '', '', '', '', '', ''));
   debugLines.push(sharedDebugLine('Award grade 1st', `t=${minTrophies} > 2*m=${2 * m} ? ${minTrophies > 2 * m}`, '', '', '', '', '', ''));
        debugLines.push('');
        
        // Recalculate ratings (5 passes) for each mini-game
        for (const fileName of existingFiles) {
          const miniGameData = await this.readMiniGameFile(fileName);
          if (!miniGameData || miniGameData.players.length === 0) continue;
          
          let currentPlayers = [...miniGameData.players];
          
          for (let recalc = 0; recalc < 5; recalc++) {
            const { matches } = processGameResults(currentPlayers);
            const result = calculateRatings(currentPlayers, matches, {
              kFactorOverride: 20,
              blendingFactorOverride: 0.99,
              perfMultiplierScaleOverride: 0.5,
            });
            currentPlayers = result.players;
          }
          
          await this.writeMiniGameFile(fileName, {
            ...miniGameData,
            players: currentPlayers,
          });
        }

        debugLines.push(sharedDebugLine('MINI-GAME PLAYERS', '(after 5 recalcs)', '', '', '', '', '', ''));
        
        // Sync trophyEligible from club ladder (source of truth) to each mini-game file
        const clubEligibleMap = new Map<string, boolean>();
        for (const p of players) {
          clubEligibleMap.set(`${p.firstName} ${p.lastName}`, p.trophyEligible);
        }
        // Build MiniGameData array for shared trophy generation
        const allIneligible: PlayerData[] = [];
        const miniGameDataList: MiniGameData[] = [];
        for (const fileName of existingFiles) {
          const data = await this.readMiniGameFile(fileName);
          if (!data || data.players.length === 0) continue;
          for (const p of data.players) {
            const key = `${p.firstName} ${p.lastName}`;
            if (clubEligibleMap.has(key)) {
              p.trophyEligible = clubEligibleMap.get(key)!;
            }
            if (p.trophyEligible === false && !allIneligible.find(a => a.rank === p.rank)) {
              allIneligible.push(p);
            }
          }
          
          const playersWithGames = data.players.filter(p => {
            if (!p.gameResults) return false;
            if (p.trophyEligible === false) return false;
            return p.gameResults.some(r => r && r !== '' && r !== '_');
          });
          
          if (playersWithGames.length === 0) continue;
          
          const sorted = playersWithGames.sort((a, b) => b.nRating - a.nRating);
          debugLines.push('');
          debugLines.push(sharedDebugLine(fileName, '', '', '', '', '', '', ''));
          for (const p of sorted) {
            const games = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
            debugLines.push(sharedDebugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
          }
          
          const ineligible = data.players.filter(p => p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
          if (ineligible.length > 0) {
            debugLines.push('');
            debugLines.push(sharedDebugLine('Top Ineligible', '', '', '', '', '', '', ''));
            for (const p of ineligible) {
              const games = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
              debugLines.push(sharedDebugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
            }
          }
          
          miniGameDataList.push({ fileName, players: data.players });
        }
        
        if (allIneligible.length > 0) {
          debugLines.push('');
          debugLines.push(sharedDebugLine('Top Ineligible Overall', '', '', '', '', '', '', ''));
          const topIneligible = allIneligible.sort((a, b) => b.nRating - a.nRating).slice(0, 1);
          for (const p of topIneligible) {
            let totalGames = 0;
            for (const mgd of miniGameDataList) {
              const mgPlayer = mgd.players.find(mp => mp.rank === p.rank);
              if (mgPlayer?.gameResults) {
                totalGames += mgPlayer.gameResults.filter(r => r && r !== '' && r !== '_').length;
              }
            }
            debugLines.push(sharedDebugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(totalGames), ''));
          }
        }
        
        trophies = sharedGenerateMiniGameTrophies(players, minTrophies, miniGameDataList);
      }

      const trophiesSection = buildTrophiesSection(trophies);

      return {
        success: true,
        message: `Generated ${trophies.length} trophies`,
        trophies,
        isClubMode,
        debugInfo: debugLines.join('\n'),
        trophiesSection,
      };
    } catch (error) {
      return { success: false, message: `Trophy generation failed: ${(error as Error).message}` };
    }
  },

  async importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }> {
    return importMiniGameFiles(content);
  },
};
