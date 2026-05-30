/**
 * Shared trophy generation logic
 * Used by both server (tournamentStore) and client (miniGameStore)
 */

import { PlayerData, LadderData, MiniGameData } from '../types/index.js';

export interface TrophyReportResult {
  success: boolean;
  message: string;
  trophies?: any[];
  isClubMode?: boolean;
  debugInfo?: string;
  trophiesSection?: string[];
}

import { MINI_GAME_DIFFICULTY_ORDER as DIFFICULTY_ORDER } from '../types/index.js';

const MINI_GAME_DIFFICULTY_ORDER = DIFFICULTY_ORDER;

export function debugLine(col1: string, col2 = '', col3 = '', col4 = '', col5 = '', col6 = '', col7 = '', col8 = ''): string {
  return [col1, col2, col3, col4, col5, col6, col7, col8].join('\t');
}

export function formatPlayerName(player: PlayerData): string {
  const firstName = player.firstName?.trim() || '';
  const lastName = player.lastName?.trim() || '';
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  return firstName || lastName;
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

export function isValidGameResult(r: string | null): boolean {
  return !!r && r !== '' && r !== '_';
}

function countGames(gameResults: (string | null)[] | undefined): number {
  if (!gameResults) return 0;
  return gameResults.filter(isValidGameResult).length;
}

export function clubLadderGamesPlayed(player: PlayerData): number {
  return (player.num_games || 0) + countGames(player.gameResults);
}

export function getPlayerTotalGames(player: PlayerData, miniGameFiles: MiniGameData[]): number {
  let total = 0;
  for (const mgd of miniGameFiles) {
    const p = mgd.players.find(p => p.rank === player.rank);
    if (!p?.gameResults) continue;
    total += p.gameResults.filter(isValidGameResult).length;
  }
  return total;
}

export interface MiniGameStoreLike {
  readMiniGameFile(fileName: string): Promise<LadderData | null>;
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void>;
}

export async function recalculateMiniGameRatings(
  store: MiniGameStoreLike,
  existingFiles: string[]
): Promise<void> {
  const { calculateRatings, processGameResults } = await import('./hashUtils.js');

  for (const fileName of existingFiles) {
    const miniGameData = await store.readMiniGameFile(fileName);
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

    await store.writeMiniGameFile(fileName, {
      ...miniGameData,
      players: currentPlayers,
    });
  }
}

export function generateClubLadderTrophies(players: PlayerData[], minTrophies: number): any[] {
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

  function awardOverallPlace(placeName: string) {
    for (const p of sortedPlayers) {
      if (p.trophyEligible === false) continue;
      const g = clubLadderGamesPlayed(p);
      if (addTrophy({
        rank: trophies.length + 1,
        player: formatPlayerName(p),
        gr: p.grade,
        rating: p.nRating,
        trophyType: placeName,
        miniGameOrGrade: 'Club Ladder',
        gamesPlayed: g,
        totalGames: g,
      })) {
        break;
      }
    }
  }

  function awardGradePlace(placeName: string) {
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade && p.trophyEligible !== false).sort((a, b) => b.nRating - a.nRating);
      for (const p of gradePlayers) {
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
          rank: trophies.length + 1,
          player: formatPlayerName(p),
          gr: grade,
          rating: p.nRating,
          trophyType: placeName,
          miniGameOrGrade: `Gr ${grade}`,
          gamesPlayed: g,
          totalGames: g,
        })) {
          break;
        }
      }
    }
  }

  // Steps 1-3: Award 1st, 2nd, 3rd place overall
  awardOverallPlace('1st Place');
  awardOverallPlace('2nd Place');
  awardOverallPlace('3rd Place');

  // Step 4: Award most games
  const sortedByGames = [...players].filter(p => p.trophyEligible !== false).sort((a, b) => clubLadderGamesPlayed(b) - clubLadderGamesPlayed(a));
  for (const p of sortedByGames) {
    const g = clubLadderGamesPlayed(p);
    if (addTrophy({
      rank: trophies.length + 1,
      player: formatPlayerName(p),
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

  // Steps 5-7: Award grade places
  if (minTrophies > 4) {
    awardGradePlace('1st Place');
  }
  if (trophies.length < minTrophies) {
    awardGradePlace('2nd Place');
  }
  if (trophies.length < minTrophies) {
    awardGradePlace('3rd Place');
  }

  return trophies;
}

export function generateMiniGameTrophies(
  players: PlayerData[],
  minTrophies: number,
  miniGameFiles: MiniGameData[]
): any[] {
  const trophies: any[] = [];
  const seenPlayers = new Set<string>();
  const existingFiles = miniGameFiles.map(f => f.fileName);
  const m = existingFiles.length;
  const t = minTrophies;

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
    playerTotalGames.set(formatPlayerName(p), getPlayerTotalGames(p, miniGameFiles));
  }

  // Award places per mini-game: 1st, 2nd, 3rd, 4th, ...
  // Place N is awarded if minTrophies > (N-1) * m
  let place = 1;
  while (trophies.length < minTrophies) {
    if (trophies.length > 0 && trophies[trophies.length - 1].trophyType === 'Most Games') break;

    const trophiesBefore = trophies.length;
    for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
       if (trophies.length >= minTrophies) break;

      const mgd = miniGameFiles.find(f => f.fileName === fileName);
      if (!mgd || mgd.players.length === 0) continue;

      const playersWithGames = mgd.players.filter(p => {
        if (!p.gameResults) return false;
        if (p.trophyEligible === false) return false;
        return p.gameResults.some(isValidGameResult);
      });

      const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
      for (const p of sortedPlayers) {
        const playerName = formatPlayerName(p);
        if (seenPlayers.has(playerName)) continue;
     if (trophies.length >= minTrophies) break;

        const miniGameGames = p.gameResults?.filter(isValidGameResult)?.length || 0;
        addTrophy({
          rank: trophies.length + 1,
          player: playerName,
          gr: p.grade,
          rating: p.nRating,
          trophyType: place === 1 ? '1st Place' : place === 2 ? '2nd Place' : `${place}rd Place`,
          miniGameOrGrade: fileName.replace('.tab', ''),
          gamesPlayed: miniGameGames,
          totalGames: playerTotalGames.get(playerName) || 0,
        });
        break;
      }
    }

    if (trophies.length === trophiesBefore) break;
    place++;
  }

  return trophies;
}

export function parseMiniGameImportContent(content: string): { fileName: string; fileContent: string }[] {
  const result: { fileName: string; fileContent: string }[] = [];
  const sections = content.split('=== ').filter(s => s.trim());

  for (const section of sections) {
    const firstLine = section.split('\n')[0];
    const fileName = firstLine.replace(' ===', '').trim();
    const fileContent = section.substring(firstLine.length + 1).trim();
    if (fileContent) {
      result.push({ fileName, fileContent });
    }
  }

  return result;
}

export interface TrophyReportStore {
  hasMiniGameFiles(): Promise<boolean>;
  getExistingMiniGameFiles(): Promise<string[]>;
  readMiniGameFile(fileName: string): Promise<LadderData | null>;
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void>;
}

export async function generateTrophyReport(
  store: TrophyReportStore,
  players: PlayerData[],
  debugLevel: number = 3
): Promise<TrophyReportResult> {
  try {
    if (players.length === 0) {
      return { success: false, message: 'No players found' };
    }

    const debugLines: string[] = [];
    const allDebugLines: string[] = [];
    const allTrophiesSection: string[] = [];

    const { buildDebugHeader, buildClubLadderPlayerSection, buildMiniGamePlayerSection, buildTrophiesSection, buildSectionHeader, syncEligibilityFromClubLadder } = await import('./trophyDebugReport.js');

    const clubHasResults = players.some(p => p.gameResults?.some(isValidGameResult));
    const hasMiniGames = await store.hasMiniGameFiles();
    const existingFiles = hasMiniGames ? await store.getExistingMiniGameFiles() : [];
    let miniGameDataList: MiniGameData[] = [];
    let miniHasResults = false;

    if (existingFiles.length > 0) {
      await recalculateMiniGameRatings(store, existingFiles);
      for (const fileName of existingFiles) {
        const data = await store.readMiniGameFile(fileName);
        if (!data || data.players.length === 0) continue;
        miniGameDataList.push({ fileName, players: data.players });
        if (data.players.some(p => p.gameResults?.some(isValidGameResult))) {
          miniHasResults = true;
        }
      }
      syncEligibilityFromClubLadder(players, miniGameDataList);
    }

    if (!clubHasResults && !miniHasResults) {
      return { success: false, message: 'No game results found in club ladder or mini-games' };
    }

    // Compute active player counts per tournament
    const clubActiveCount = players.filter(p => p.gameResults?.some(isValidGameResult)).length;
    const clubMinTrophies = Math.ceil(clubActiveCount / 3);

    const miniActiveNames = new Set<string>();
    for (const mgd of miniGameDataList) {
      for (const p of mgd.players) {
        if (p.gameResults?.some(isValidGameResult)) {
          miniActiveNames.add(formatPlayerName(p));
        }
      }
    }
    const miniActiveCount = miniActiveNames.size;
    const miniMinTrophies = Math.ceil(miniActiveCount / 3);

    if (debugLevel <= 5) {
      const headerLines = buildDebugHeader(players, clubMinTrophies, miniMinTrophies, miniGameDataList.length, debugLevel);
      debugLines.push(...headerLines);
    }

    // Club Ladder section (independent trophies)
    if (clubHasResults) {
      const clubDebugLines: string[] = [];
      if (debugLevel <= 5) {
        clubDebugLines.push(...buildSectionHeader('Club Ladder'));
        clubDebugLines.push(...buildClubLadderPlayerSection(players, debugLevel));
      }
      const clubTrophies = generateClubLadderTrophies(players, clubMinTrophies);
      const clubTrophiesSection = buildTrophiesSection(clubTrophies);
      allDebugLines.push(...clubDebugLines);
      allTrophiesSection.push(...clubTrophiesSection);
    }

    // Mini-game tournament section (independent trophies)
    if (miniHasResults) {
      if (clubHasResults) {
        allDebugLines.push('');
        allTrophiesSection.push('');
      }
      const mgDebugLines: string[] = [];
      if (debugLevel <= 5) {
        mgDebugLines.push(...buildSectionHeader('Mini-game tournament'));
        mgDebugLines.push(...buildMiniGamePlayerSection(miniGameDataList, debugLevel));
      }
      const mgTrophies = generateMiniGameTrophies(players, miniMinTrophies, miniGameDataList);
      const mgTrophiesSection = buildTrophiesSection(mgTrophies);
      allDebugLines.push(...mgDebugLines);
      allTrophiesSection.push(...mgTrophiesSection);
    }

    return {
      success: true,
      message: 'Generated trophies' + (clubHasResults ? ' for club ladder' : '') + (miniHasResults ? ' for mini-games' : ''),
      trophies: [],
      isClubMode: clubHasResults && !miniHasResults,
      debugInfo: [...debugLines, ...allDebugLines].join('\n'),
      trophiesSection: allTrophiesSection,
    };
  } catch (error) {
    return { success: false, message: 'Trophy generation failed: ' + (error as Error).message };
  }
}


