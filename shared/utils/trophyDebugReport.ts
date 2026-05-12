/**
 * Shared trophy debug report formatting
 * Used by both server (tournamentStore) and tests to generate consistent debug output
 */

import { PlayerData } from '../types/index.js';
import { debugLine, clubLadderGamesPlayed, formatPlayerName } from './trophyGeneration.js';

export interface MiniGameData {
  fileName: string;
  players: PlayerData[];
}

/**
 * Sync trophyEligible from club ladder (source of truth) to each mini-game file.
 * Returns a deduplicated list of all ineligible players across mini-games.
 */
export function syncEligibilityFromClubLadder(
  clubPlayers: PlayerData[],
  miniGameDataList: MiniGameData[]
): PlayerData[] {
  const clubEligibleMap = new Map<string, boolean>();
  for (const p of clubPlayers) {
    clubEligibleMap.set(formatPlayerName(p), p.trophyEligible);
  }
  const allIneligible: PlayerData[] = [];
  for (const mgd of miniGameDataList) {
    for (const p of mgd.players) {
      const key = formatPlayerName(p);
      if (clubEligibleMap.has(key)) {
        p.trophyEligible = clubEligibleMap.get(key)!;
      }
      if (p.trophyEligible === false && !allIneligible.find(a => a.rank === p.rank)) {
        allIneligible.push(p);
      }
    }
  }
  return allIneligible;
}

export interface TrophyReportDebug {
  header: string[];
  miniGameSections: string[];
  trophiesSection: string[];
  fullReport: string;
}

/**
 * Build the header debug section for trophy reports
 */
export function buildDebugHeader(players: PlayerData[], minTrophies: number, isClubMode: boolean, miniGameCount?: number, debugLevel: number = 3): string[] {
  const lines: string[] = [];
  
  if (debugLevel <= 4) {
    lines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
    lines.push(debugLine('Players', String(players.length), '', '', '', '', '', ''));
    lines.push(debugLine('Min Trophies', `${minTrophies} (ceil(${players.length} / 3))`, '', '', '', '', '', ''));
    lines.push('');
  }
  
  if (isClubMode) {
    if (debugLevel <= 4) {
      lines.push(debugLine('Mode', 'Club Ladder (no mini-game files)', '', '', '', '', '', ''));
    }
  } else if (miniGameCount !== undefined) {
    if (debugLevel <= 4) {
      lines.push(debugLine('Mode', 'Mini-Game Tournament', '', '', '', '', '', ''));
      lines.push(debugLine('Mini-games played', String(miniGameCount), '', '', '', '', '', ''));
      lines.push(debugLine('Award 2nd place', `t=${minTrophies} > m=${miniGameCount} ? ${minTrophies > miniGameCount}`, '', '', '', '', '', ''));
      lines.push(debugLine('Award grade 1st', `t=${minTrophies} > 2*m=${2 * miniGameCount} ? ${minTrophies > 2 * miniGameCount}`, '', '', '', '', '', ''));
      lines.push('');
    }
  }
  
  return lines;
}

function mgdPlayersTotalGames(player: PlayerData, miniGameDataList: MiniGameData[]): number {
  let total = 0;
  for (const mgd of miniGameDataList) {
    const games = mgd.players.find(p => p.rank === player.rank);
    if (games?.gameResults) {
      total += games.gameResults.filter(r => r && r !== '' && r !== '_').length;
    }
  }
  return total;
}

/**
 * Build the mini-game player debug section
 */
export function buildMiniGamePlayerSection(miniGameDataList: MiniGameData[], debugLevel: number): string[] {
  const lines: string[] = [];
  
  if (debugLevel <= 4) {
    lines.push(debugLine('MINI-GAME PLAYERS', '(after 5 recalcs)', '', '', '', '', '', ''));
    
    const allIneligible: PlayerData[] = [];
    for (const mgd of miniGameDataList) {
      const playersWithGames = mgd.players.filter((p: PlayerData) => {
        if (!p.gameResults) return false;
        if (p.trophyEligible === false) return false;
        return p.gameResults.some((r: string | null) => r && r !== '' && r !== '_');
      });
      
      if (playersWithGames.length === 0) continue;
      
      const sorted = playersWithGames.sort((a: PlayerData, b: PlayerData) => b.nRating - a.nRating).slice(0, 5);
      lines.push('');
      lines.push(debugLine(mgd.fileName.replace('.tab', ''), '', '', '', '', '', '', ''));
      for (const p of sorted) {
        const games = p.gameResults?.filter((r: string | null) => r && r !== '' && r !== '_')?.length || 0;
        lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
      }
      
      const ineligible = mgd.players.filter((p: PlayerData) => p.trophyEligible === false).sort((a: PlayerData, b: PlayerData) => b.nRating - a.nRating).slice(0, 1);
      if (ineligible.length > 0) {
        lines.push('');
        lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
        for (const p of ineligible) {
          const games = p.gameResults?.filter((r: string | null) => r && r !== '' && r !== '_')?.length || 0;
          lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
        }
      }
      
      for (const p of mgd.players) {
        if (p.trophyEligible === false && !allIneligible.find(a => a.rank === p.rank)) {
          allIneligible.push(p);
        }
      }
    }
    
    if (allIneligible.length > 0) {
      lines.push('');
      lines.push(debugLine('Top Ineligible Overall', '', '', '', '', '', '', ''));
      const topIneligible = allIneligible.sort((a, b) => b.nRating - a.nRating).slice(0, 1);
      for (const p of topIneligible) {
        const totalGames = mgdPlayersTotalGames(p, miniGameDataList);
        lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(totalGames), ''));
      }
    }
  }
  
  return lines;
}

/**
 * Build the club ladder top players debug section
 */
export function buildClubLadderPlayerSection(players: PlayerData[], debugLevel: number): string[] {
  const lines: string[] = [];
  
  if (debugLevel <= 4) {
    lines.push(debugLine('TOP 5 OVERALL', '(by rating, eligible only)', '', '', '', '', '', ''));
    const sortedOverall = players.filter(p => p.trophyEligible !== false).sort((a, b) => b.nRating - a.nRating).slice(0, 5);
    for (const p of sortedOverall) {
      const games = clubLadderGamesPlayed(p);
      lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
    }
    
    const overallIneligible = players.filter(p => p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
    if (overallIneligible.length > 0) {
      lines.push('');
      lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
      for (const p of overallIneligible) {
        const games = clubLadderGamesPlayed(p);
        lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
      }
    }
    
    lines.push('');
    lines.push(debugLine('TOP 5 PER GRADE', '', '', '', '', '', '', ''));
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade && p.trophyEligible !== false).sort((a, b) => b.nRating - a.nRating).slice(0, 5);
      if (gradePlayers.length === 0) continue;
      lines.push('');
      lines.push(debugLine('Gr ' + grade, '', '', '', '', '', '', ''));
      for (const p of gradePlayers) {
        const games = clubLadderGamesPlayed(p);
        lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
      }
      
      const gradeIneligible = players.filter(p => p.grade === grade && p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
      if (gradeIneligible.length > 0) {
        lines.push('');
        lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
        for (const p of gradeIneligible) {
          const games = clubLadderGamesPlayed(p);
          lines.push(debugLine(String(p.rank), formatPlayerName(p), p.grade, String(p.nRating), '', '', String(games), ''));
        }
      }
    }
  }
  
  return lines;
}

/**
 * Build the trophies section from trophy data
 */
export function buildTrophiesSection(trophies: any[]): string[] {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('AWARDED TROPHIES');
  lines.push('Rank\tPlayer\tTrophy Type\tMini-Game/Grade\tGr\tRating\tTotal Games\tGames Played');
  
  let blankRowInserted = false;
  for (const trophy of trophies) {
    if (!blankRowInserted && trophy.trophyType === '1st Place' && trophy.miniGameOrGrade && trophy.miniGameOrGrade.startsWith('Gr ')) {
      lines.push('');
      blankRowInserted = true;
    }
    lines.push(`${trophy.rank}\t${trophy.player}\t${trophy.trophyType}\t${trophy.miniGameOrGrade}\t${trophy.gr}\t${trophy.rating}\t${trophy.totalGames || 0}\t${trophy.gamesPlayed}`);
  }
  
  return lines;
}

/**
 * Build the complete trophy report debug output
 * Returns the full report as a string
 */
export function buildTrophyReportString(
  headerLines: string[],
  miniGameSectionLines: string[],
  trophiesSectionLines: string[]
): string {
  return [...headerLines, ...miniGameSectionLines, ...trophiesSectionLines].join('\n') + '\n';
}
