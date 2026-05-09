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
  const sortedPlayers = [...players].sort((a: PlayerData, b: PlayerData) => b.rating - a.rating);

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
  const mostGamesPlayer = sortedPlayers.reduce((max: PlayerData, p: PlayerData) => p.num_games > max.num_games ? p : max, sortedPlayers[0]);
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

  // Award Gr 1st/2nd/3rd places (after blank row)
  // Position-by-position: all grades get 1st first, then all grades get 2nd, then all grades get 3rd
  const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a: string, b: string) => parseInt(b) - parseInt(a));
  
  for (let position = 1; position <= 3; position++) {
    const ordinal = position === 1 ? '1st' : position === 2 ? '2nd' : '3rd';
    
    for (const grade of gradeGroups) {
      if (trophies.length >= maxTrophies) break;
      const gradePlayers = players.filter(p => p.grade === grade).sort((a: PlayerData, b: PlayerData) => b.rating - a.rating);
      
      if (gradePlayers.length < position) continue;
      
      // Find the player at this position, accounting for ties
      const targetPlayer = gradePlayers[position - 1];
      
      // Check if previous player(s) had same rating (tie)
      let tieCount = 0;
      for (let i = position - 2; i >= 0; i--) {
        if (gradePlayers[i].rating === targetPlayer.rating) {
          tieCount++;
        } else {
          break;
        }
      }
      
      // Award to all tied players at this position
      for (let i = position - 1; i >= 0 && i >= position - 1 - tieCount; i--) {
        if (trophies.length >= maxTrophies) break;
        const player = gradePlayers[i];
        trophies.push({
          rank: trophies.length + 1,
          player: `${player.firstName} ${player.lastName}`,
          gr: grade,
          trophyType: `${ordinal} Place`,
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: player.num_games,
        });
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

  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    if (trophies.length >= maxTrophies) break;
    if (!existingFiles.includes(fileName)) continue;

    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData || miniGameData.players.length === 0) continue;

    const sortedPlayers = [...miniGameData.players].sort((a: PlayerData, b: PlayerData) => b.rating - a.rating);
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

  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    if (trophies.length >= maxTrophies) break;
    if (!existingFiles.includes(fileName)) continue;

    const miniGameData = await readMiniGameFile(fileName);
    if (!miniGameData || miniGameData.players.length === 0) continue;

    const sortedPlayers = [...miniGameData.players].sort((a: PlayerData, b: PlayerData) => b.rating - a.rating);
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

  const playerGameCounts = await Promise.all(
    players.map(async (p: PlayerData) => ({
      player: p,
      totalGames: await countGamesAcrossMiniGames(p.rank, existingFiles),
    }))
  );

  const playersWithGames = playerGameCounts
    .filter((x: { totalGames: number }) => x.totalGames > 0)
    .sort((a: { totalGames: number }, b: { totalGames: number }) => b.totalGames - a.totalGames);

  if (playersWithGames.length > 0 && trophies.length < maxTrophies) {
    const maxGames = playersWithGames[0].totalGames;
    const tiedPlayers = playersWithGames.filter((p: { totalGames: number }) => p.totalGames === maxGames);
    
    for (const tiedPlayer of tiedPlayers) {
      if (trophies.length >= maxTrophies) break;
      trophies.push({
        rank: trophies.length + 1,
        player: `${tiedPlayer.player.firstName} ${tiedPlayer.player.lastName}`,
        gr: tiedPlayer.player.grade,
        trophyType: 'Most Games',
        miniGameOrGrade: 'All Mini-Games',
        gamesPlayed: tiedPlayer.totalGames,
      });
    }
  }

  // Award Gr 1st/2nd/3rd places (after blank row)
  // Position-by-position: all grades get 1st first, then all grades get 2nd, then all grades get 3rd
  const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a: string, b: string) => parseInt(b) - parseInt(a));
  
  for (let position = 1; position <= 3; position++) {
    const ordinal = position === 1 ? '1st' : position === 2 ? '2nd' : '3rd';
    
    for (const grade of gradeGroups) {
      if (trophies.length >= maxTrophies) break;
      const gradePlayers = players.filter(p => p.grade === grade).sort((a: PlayerData, b: PlayerData) => b.rating - a.rating);
      
      if (gradePlayers.length < position) continue;
      
      // Find the player at this position, accounting for ties
      const targetPlayer = gradePlayers[position - 1];
      
      // Check if previous player(s) had same rating (tie)
      let tieCount = 0;
      for (let i = position - 2; i >= 0; i--) {
        if (gradePlayers[i].rating === targetPlayer.rating) {
          tieCount++;
        } else {
          break;
        }
      }
      
      // Award to all tied players at this position
      for (let i = position - 1; i >= 0 && i >= position - 1 - tieCount; i--) {
        if (trophies.length >= maxTrophies) break;
        const player = gradePlayers[i];
        trophies.push({
          rank: trophies.length + 1,
          player: `${player.firstName} ${player.lastName}`,
          gr: grade,
          trophyType: `${ordinal} Place`,
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: player.num_games,
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
  }> {
    try {
      const hasMiniGames = await this.hasMiniGameFiles();
      const isClubMode = !hasMiniGames;

      if (players.length === 0) {
        return { success: false, message: 'No players found' };
      }

      const maxTrophies = Math.floor(players.length / 3);
      let trophies: any[] = [];

      if (isClubMode) {
        trophies = await generateClubLadderTrophies(players, maxTrophies);
      } else {
        const existingFiles = await this.getExistingMiniGameFiles();
        trophies = await generateMiniGameTrophies(players, maxTrophies, existingFiles);
      }

      return {
        success: true,
        message: `Generated ${trophies.length} trophies`,
        trophies,
        isClubMode,
      };
    } catch (error) {
      return { success: false, message: `Trophy generation failed: ${(error as Error).message}` };
    }
  },
};
