/**
 * Shared trophy generation logic
 * Used by both server (tournamentStore) and client (miniGameStore)
 */

import { PlayerData, LadderData } from '../types/index.js';

export interface MiniGameData {
  fileName: string;
  players: PlayerData[];
}

export interface TrophyReportResult {
  success: boolean;
  message: string;
  trophies?: any[];
  isClubMode?: boolean;
  debugInfo?: string;
}

const MINI_GAME_DIFFICULTY_ORDER = [
  'Queen_Game.tab',
  'Pawn_Game.tab',
  'Kings_Cross.tab',
  'Pillar_Game.tab',
  'Bishop_Game.tab',
  'BG_Game.tab',
  'bughouse.tab',
];

export function debugLine(col1: string, col2 = '', col3 = '', col4 = '', col5 = '', col6 = '', col7 = '', col8 = ''): string {
  return [col1, col2, col3, col4, col5, col6, col7, col8].join('\t');
}

export function copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[] {
  const sourceMap = new Map<string, PlayerData>();
  for (const player of sourcePlayers) {
    const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
    sourceMap.set(key, player);
  }

  const updatedTarget = targetPlayers.map(targetPlayer => {
    const key = `${targetPlayer.lastName.toLowerCase()}|${targetPlayer.firstName.toLowerCase()}`;
    const sourcePlayer = sourceMap.get(key);
    if (sourcePlayer) {
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

export function generateClubLadderTrophies(players: PlayerData[], maxTrophies: number): any[] {
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
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '1st Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    })) {
      break;
    }
  }

  // Step 2: Award 2nd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '2nd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    })) {
      break;
    }
  }

  // Step 3: Award 3rd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '3rd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    })) {
      break;
    }
  }

  // Step 4: Award most games - first eligible by num_games
  const sortedByGames = [...players].sort((a, b) => b.num_games - a.num_games);
  for (const p of sortedByGames) {
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: 'Most Games',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: p.num_games,
      totalGames: p.num_games,
    })) {
      break;
    }
  }

  // Step 5: Award grade 1st place if t > 4
  if (maxTrophies > 4) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        })) {
          break;
        }
      }
    }
  }

  // Step 6: Award grade 2nd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '2nd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        })) {
          break;
        }
      }
    }
  }

  // Step 7: Award grade 3rd place if any trophies remain
  if (trophies.length < maxTrophies) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '3rd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: p.num_games,
          totalGames: p.num_games,
        })) {
          break;
        }
      }
    }
  }

  return trophies;
}

export function generateMiniGameTrophies(
  players: PlayerData[],
  maxTrophies: number,
  miniGameFiles: MiniGameData[]
): any[] {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const existingFiles = miniGameFiles.map(f => f.fileName);
  const m = existingFiles.length;
  const t = maxTrophies;

  function getPlayerTotalGames(player: PlayerData): number {
    let total = 0;
    for (const mgd of miniGameFiles) {
      const p = mgd.players.find(p => p.rank === player.rank);
      if (!p?.gameResults) continue;
      total += p.gameResults.filter((r: string | null) => r && r !== '' && r !== '_').length;
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
    playerTotalGames.set(`${p.firstName} ${p.lastName}`, getPlayerTotalGames(p));
  }

  // Step 1: Award 1st place for each mini-game - always
  for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
    const mgd = miniGameFiles.find(f => f.fileName === fileName);
    if (!mgd || mgd.players.length === 0) continue;

    const playersWithGames = mgd.players.filter(p => {
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
      const mgd = miniGameFiles.find(f => f.fileName === fileName);
      if (!mgd || mgd.players.length === 0) continue;

      const playersWithGames = mgd.players.filter(p => {
        if (!p.gameResults) return false;
     return p.gameResults.some((r: string | null) => r && r !== '' && r !== '_');
      });

      const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
      for (const p of sortedPlayers) {
        if (seenPlayers.has(`${p.firstName} ${p.lastName}`)) continue;
    const miniGameGames = p.gameResults?.filter((r: string | null) => r && r !== '' && r !== '_')?.length || 0;
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
