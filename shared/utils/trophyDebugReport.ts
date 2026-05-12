/**
 * Shared trophy debug report formatting
 * Used by both server (tournamentStore) and tests to generate consistent debug output
 */

import { PlayerData } from '../types/index.js';
import { debugLine, clubLadderGamesPlayed } from './trophyGeneration.js';

export interface MiniGameData {
  fileName: string;
  players: PlayerData[];
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
export function buildDebugHeader(players: PlayerData[], minTrophies: number, isClubMode: boolean, miniGameCount?: number): string[] {
  const lines: string[] = [];
  
  lines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
  lines.push(debugLine('Players', String(players.length), '', '', '', '', '', ''));
  lines.push(debugLine('Min Trophies', `${minTrophies} (ceil(${players.length} / 3))`, '', '', '', '', '', ''));
  lines.push('');
  
  if (isClubMode) {
    lines.push(debugLine('Mode', 'Club Ladder (no mini-game files)', '', '', '', '', '', ''));
  } else if (miniGameCount !== undefined) {
    lines.push(debugLine('Mode', 'Mini-Game Tournament', '', '', '', '', '', ''));
    lines.push(debugLine('Mini-games played', String(miniGameCount), '', '', '', '', '', ''));
    lines.push(debugLine('Award 2nd place', `t=${minTrophies} > m=${miniGameCount} ? ${minTrophies > miniGameCount}`, '', '', '', '', '', ''));
    lines.push(debugLine('Award grade 1st', `t=${minTrophies} > 2*m=${2 * miniGameCount} ? ${minTrophies > 2 * miniGameCount}`, '', '', '', '', '', ''));
    lines.push('');
  }
  
  return lines;
}

/**
 * Build the mini-game player debug section
 */
export function buildMiniGamePlayerSection(miniGameDataList: MiniGameData[]): string[] {
  const lines: string[] = [];
  
  lines.push(debugLine('MINI-GAME PLAYERS', '(after 5 recalcs)', '', '', '', '', '', ''));
  
  for (const mgd of miniGameDataList) {
    const playersWithGames = mgd.players.filter((p: PlayerData) => {
      if (!p.gameResults) return false;
      return p.gameResults.some((r: string | null) => r && r !== '' && r !== '_');
    });
    
    if (playersWithGames.length === 0) continue;
    
    const sorted = playersWithGames.sort((a: PlayerData, b: PlayerData) => b.nRating - a.nRating).slice(0, 5);
    lines.push('');
    lines.push(debugLine(mgd.fileName.replace('.tab', ''), '', '', '', '', '', '', ''));
    for (const p of sorted) {
      const games = p.gameResults?.filter((r: string | null) => r && r !== '' && r !== '_')?.length || 0;
      lines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
    }
    
    const ineligible = playersWithGames.filter((p: PlayerData) => p.trophyEligible === false).sort((a: PlayerData, b: PlayerData) => b.nRating - a.nRating).slice(0, 1);
    if (ineligible.length > 0) {
      lines.push('');
      lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
      for (const p of ineligible) {
        const games = p.gameResults?.filter((r: string | null) => r && r !== '' && r !== '_')?.length || 0;
        lines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
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
  
  if (debugLevel >= 1) {
    lines.push(debugLine('TOP 5 OVERALL', '(by rating)', '', '', '', '', '', ''));
    const sortedOverall = [...players].sort((a, b) => b.nRating - a.nRating).slice(0, 5);
    for (const p of sortedOverall) {
      const games = clubLadderGamesPlayed(p);
      lines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
    }
    
    const overallIneligible = players.filter(p => p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
    if (overallIneligible.length > 0) {
      lines.push('-');
    }
    
    lines.push('');
    lines.push(debugLine('TOP 5 PER GRADE', '', '', '', '', '', '', ''));
    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating).slice(0, 5);
      if (gradePlayers.length === 0) continue;
      lines.push('');
      lines.push(debugLine('Gr ' + grade, '', '', '', '', '', '', ''));
      for (const p of gradePlayers) {
        const games = clubLadderGamesPlayed(p);
        lines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
      }
      
      const gradeIneligible = players.filter(p => p.grade === grade && p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
      if (gradeIneligible.length > 0) {
        lines.push('');
        lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
        for (const p of gradeIneligible) {
          const games = clubLadderGamesPlayed(p);
          lines.push(debugLine(String(p.rank), `${p.firstName} ${p.lastName}`, p.grade, String(p.nRating), '', '', String(games), ''));
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
