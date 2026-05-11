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

function countGames(gameResults: (string | null)[] | undefined): number {
  if (!gameResults) return 0;
  return gameResults.filter(r => r && r !== '' && r !== '_').length;
}

export function clubLadderGamesPlayed(player: PlayerData): number {
  return (player.num_games || 0) + countGames(player.gameResults);
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
    const g = clubLadderGamesPlayed(p);
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '1st Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: g,
      totalGames: g,
    })) {
      break;
    }
  }

  // Step 2: Award 2nd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    const g = clubLadderGamesPlayed(p);
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '2nd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: g,
      totalGames: g,
    })) {
      break;
    }
  }

  // Step 3: Award 3rd place overall - next eligible by rating
  for (const p of sortedPlayers) {
    const g = clubLadderGamesPlayed(p);
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: '3rd Place',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: g,
      totalGames: g,
    })) {
      break;
    }
  }

  // Step 4: Award most games - first eligible by total games (num_games + current)
  const sortedByGames = [...players].sort((a, b) => clubLadderGamesPlayed(b) - clubLadderGamesPlayed(a));
  for (const p of sortedByGames) {
    const g = clubLadderGamesPlayed(p);
    if (addTrophy({
      rank: trophies.length + 1,
      player: `${p.firstName} ${p.lastName}`,
      gr: p.grade,
      rating: p.nRating,
      trophyType: 'Most Games',
      miniGameOrGrade: 'Club Ladder',
      gamesPlayed: g,
      totalGames: g,
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
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '1st Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: g,
          totalGames: g,
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
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '2nd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: g,
          totalGames: g,
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
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: grade,
          rating: p.nRating,
          trophyType: '3rd Place',
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: g,
          totalGames: g,
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

  // Award places per mini-game: 1st, 2nd, 3rd, 4th, ...
  // Place N is awarded if maxTrophies > (N-1) * m
  let place = 1;
  while (trophies.length < maxTrophies) {
    if (trophies.length > 0 && trophies[trophies.length - 1].trophyType === 'Most Games') break;

    const trophiesBefore = trophies.length;
    for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
      if (trophies.length >= maxTrophies) break;

      const mgd = miniGameFiles.find(f => f.fileName === fileName);
      if (!mgd || mgd.players.length === 0) continue;

      const playersWithGames = mgd.players.filter(p => {
        if (!p.gameResults) return false;
        return p.gameResults.some(r => r && r !== '' && r !== '_');
      });

      const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
      for (const p of sortedPlayers) {
        if (seenPlayers.has(`${p.firstName} ${p.lastName}`)) continue;
        if (trophies.length >= maxTrophies) break;

        const miniGameGames = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
        addTrophy({
          rank: trophies.length + 1,
          player: `${p.firstName} ${p.lastName}`,
          gr: p.grade,
          rating: p.nRating,
          trophyType: place === 1 ? '1st Place' : place === 2 ? '2nd Place' : `${place}rd Place`,
          miniGameOrGrade: fileName.replace('.tab', ''),
          gamesPlayed: miniGameGames,
          totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
        });
        break;
      }
    }

    if (trophies.length === trophiesBefore) break;
    place++;
  }

  return trophies;
}
