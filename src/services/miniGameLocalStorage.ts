/**
 * Mini-game localStorage storage implementation
 * Mirrors tournamentService.ts but uses localStorage instead of fs
 */

import { PlayerData, LadderData, MiniGameStore } from '../../shared/types';

const MINI_GAME_FILES = [
  'BG_Game.tab',
  'Bishop_Game.tab',
  'Pillar_Game.tab',
  'Kings_Cross.tab',
  'Pawn_Game.tab',
  'Queen_Game.tab',
  'bughouse.tab',
];

const MINI_GAME_DIFFICULTY_ORDER = [
  'Queen_Game.tab',
  'Pawn_Game.tab',
  'Kings_Cross.tab',
  'Pillar_Game.tab',
  'Bishop_Game.tab',
  'BG_Game.tab',
  'bughouse.tab',
];

const MINI_GAME_PREFIX = 'mini_game_';

function debugLine(col1: string, col2 = '', col3 = '', col4 = '', col5 = '', col6 = '', col7 = '', col8 = '') {
  return [col1, col2, col3, col4, col5, col6, col7, col8].join('\t');
}

function getStorageKey(fileName: string): string {
  return MINI_GAME_PREFIX + fileName;
}

function parseTabContent(content: string): LadderData {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { header: [], players: [], rawLines: [] };
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
  const lines = [...ladderData.header, ...ladderData.rawLines];
  return lines.join('\n') + '\n';
}

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

export function mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[] {
  const merged = [...currentResults];
  for (let i = 0; i < oldResults.length; i++) {
    if (oldResults[i] && !merged[i]) {
      merged[i] = oldResults[i];
    }
  }
  return merged;
}

async function generateClubLadderTrophies(players: PlayerData[], maxTrophies: number): Promise<any[]> {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const sortedPlayers = [...players].sort((a, b) => b.nRating - a.nRating);

  function addTrophy(trophy: any) {
    const key = `${trophy.player}`;
    if (seenPlayers.has(key)) return false;
    seenPlayers.add(key);
    trophies.push(trophy);
    return true;
  }

  // Step 1: Award 1st place overall - first eligible by rating
  for (const p of sortedPlayers) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '1st Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    });
    break;
  }

  // Step 2: Award 2nd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '2nd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    });
    break;
  }

  // Step 3: Award 3rd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '3rd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    });
    break;
  }

  // Step 4: Award most games - first eligible by num_games
  const sortedByGames = [...players].sort((a, b) => b.num_games - a.num_games);
  for (const p of sortedByGames) {
    addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: 'Most Games',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    });
    break;
  }

  // Step 5: Award grade 1st place if t > 4
  if (maxTrophies > 4) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        });
        break;
      }
    }
  }

  // Step 6: Award grade 2nd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '2nd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        });
        break;
      }
    }
  }

  // Step 7: Award grade 3rd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '3rd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        });
        break;
      }
    }
  }

  return trophies;
}

async function countGamesAcrossMiniGames(playerRank: number, existingFiles: string[]): Promise<number> {
  let totalGames = 0;
  
  for (const fileName of existingFiles) {
    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData) continue;
    
    const player = miniGameData.players.find(
      (p: PlayerData) => p.rank === playerRank
    );
    
    if (player && player.gameResults) {
      const games = player.gameResults.filter((r: string | null) => r && r !== '' && r !== '_');
      totalGames += games.length;
    }
  }
  
  return totalGames;
}

async function generateMiniGameTrophies(players: PlayerData[], maxTrophies: number, existingFiles: string[]): Promise<any[]> {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const m = existingFiles.length;
  const t = maxTrophies;

  async function getPlayerTotalGames(player: PlayerData): Promise<number> {
    let total = 0;
    for (const fileName of existingFiles) {
      const miniGameData = await readMiniGameFile(fileName);
      if (!miniGameData) continue;
      const p = miniGameData.players.find(p => p.rank === player.rank);
      if (!p?.gameResults) continue;
      total += p.gameResults.filter(r => r && r !== '' && r !== '_').length;
    }
    return total;
  }

  function addTrophy(trophy: any) {
    const key = `${trophy.player}`;
    if (seenPlayers.has(key)) return false;
    seenPlayers.add(key);
    trophies.push(trophy);
    return true;
  }

  // Pre-calculate total games for all players
  const playerTotalGames = new Map<string, number>();
  for (const p of players) {
    playerTotalGames.set(`${p.firstName} ${p.lastName}`, await getPlayerTotalGames(p));
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

    const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
    for (const p of sortedPlayers) {
      if (seenPlayers.has(`${p.firstName} ${p.lastName}`)) continue;
      const miniGameGames = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
      addTrophy({
        rank: trophies.length + 1,
        player: `${p.firstName} ${p.lastName}`,
        gr: p.grade,
        rating: p.nRating,
        trophyType: '1st Place',
        miniGameOrGrade: fileName.replace('.tab', ''),
        gamesPlayed: miniGameGames,
        totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
      });
      break;
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

      const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
      for (const p of sortedPlayers) {
        if (seenPlayers.has(`${p.firstName} ${p.lastName}`)) continue;
        const miniGameGames = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: p.grade,
          rating: p.nRating,
          trophyType: '2nd Place',
          miniGameOrGrade: fileName.replace('.tab', ''),
          gamesPlayed: miniGameGames,
          totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
        });
        break;
      }
    }
  }

  // Step 3: Award grade 1st place - only if t > 2*m
  // Remaining players (no trophy yet), sorted by totalGames, first in each grade wins
  if (t > 2 * m) {
    const remainingPlayers = players.filter(p => !seenPlayers.has(`${p.firstName} ${p.lastName}`));
    const gradeGroups = [...new Set(remainingPlayers.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = remainingPlayers.filter(p => p.grade === grade)
        .sort((a, b) => (playerTotalGames.get(`${b.firstName} ${b.lastName}`) || 0) - (playerTotalGames.get(`${a.firstName} ${a.lastName}`) || 0));
      
      if (gradePlayers.length > 0) {
        const p = gradePlayers[0];
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0,
          totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
        });
      }
    }
  }

  return trophies;
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
    return copyPlayersToTarget(sourcePlayers, targetPlayers);
  },

  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]) {
    return mergeGameResults(oldResults, currentResults);
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

  async generateTrophyReport(players: PlayerData[]): Promise<{
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
    debugInfo?: string;
  }> {
    try {
      const hasMiniGames = await this.hasMiniGameFiles();
      const isClubMode = !hasMiniGames;

      if (players.length === 0) {
        return { success: false, message: 'No players found' };
      }

      const maxTrophies = Math.ceil(players.length / 3);
      let trophies: any[] = [];
      const debugLines: string[] = [];

      debugLines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
      debugLines.push(debugLine('Players', String(players.length), '', '', '', '', '', ''));
      debugLines.push(debugLine('Max Trophies', `${maxTrophies} (ceil(${players.length} / 3))`, '', '', '', '', '', ''));
      debugLines.push('');

      if (isClubMode) {
        debugLines.push(debugLine('Mode', 'Club Ladder (no mini-game files)', '', '', '', '', '', ''));
        trophies = await generateClubLadderTrophies(players, maxTrophies);
      } else {
        const existingFiles = await this.getExistingMiniGameFiles();
        const m = existingFiles.length;
        debugLines.push(debugLine('Mode', 'Mini-Game Tournament', '', '', '', '', '', ''));
        debugLines.push(debugLine('Mini-games played', String(m), '', '', '', '', '', ''));
        debugLines.push(debugLine('Award 2nd place', `t=${maxTrophies} > m=${m} ? ${maxTrophies > m}`, '', '', '', '', '', ''));
        debugLines.push(debugLine('Award grade 1st', `t=${maxTrophies} > 2*m=${2 * m} ? ${maxTrophies > 2 * m}`, '', '', '', '', '', ''));
        debugLines.push('');
        
        debugLines.push(debugLine('MINI-GAME PLAYERS', '(after 5 recalcs)', '', '', '', '', '', ''));
        
        for (const fileName of existingFiles) {
          const data = await this.readMiniGameFile(fileName);
          if (!data || data.players.length === 0) continue;
          
          const playersWithGames = data.players.filter(p => {
            if (!p.gameResults) return false;
            return p.gameResults.some(r => r && r !== '' && r !== '_');
          });
          
          if (playersWithGames.length === 0) continue;
          
          const sorted = playersWithGames.sort((a, b) => b.nRating - a.nRating);
          debugLines.push('');
          debugLines.push(debugLine(fileName, '', '', '', '', '', '', ''));
          for (const p of sorted) {
            const games = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
            debugLines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), String(games), '', '', ''));
          }
        }
        
        trophies = await generateMiniGameTrophies(players, maxTrophies, existingFiles);
      }

      debugLines.push('');
      debugLines.push(debugLine('AWARDED TROPHIES', '', '', '', '', '', '', ''));
      for (const t of trophies) {
        debugLines.push(debugLine(String(t.rank), t.player, t.trophyType, t.miniGameOrGrade, String(t.rating), String(t.totalGames || 0), '', ''));
      }
      debugLines.push('');

      return {
        success: true,
        message: `Generated ${trophies.length} trophies`,
        trophies,
        isClubMode,
        debugInfo: debugLines.join('\n'),
      };
    } catch (error) {
      return { success: false, message: `Trophy generation failed: ${(error as Error).message}` };
    }
  },
};
