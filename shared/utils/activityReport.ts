import type { PlayerData } from '../types/index.js';
import { countGames } from './trophyGeneration.js';

export interface ActivityReportPlayerGames {
  clubGames: Map<number, number>;
  miniGameCounts: Map<string, Map<number, number>>;
}

/**
 * Count games for all players from club ladder + mini-game data.
 * The caller provides the mini-game counts map (populated from their own storage).
 */
export function buildActivityReportData(
  clubPlayers: PlayerData[],
  miniGameFilePlayers: Map<string, PlayerData[]>
): ActivityReportPlayerGames {
  const clubGames = new Map<number, number>();
  for (const p of clubPlayers) {
    const count = countGames(p.gameResults);
    if (count > 0) {
      clubGames.set(p.rank, count);
    }
  }

  const miniGameCounts = new Map<string, Map<number, number>>();
  for (const [fileName, players] of miniGameFilePlayers) {
    const counts = new Map<number, number>();
    for (const p of players) {
      const count = countGames(p.gameResults);
      if (count > 0) counts.set(p.rank, count);
    }
    miniGameCounts.set(fileName, counts);
  }

  return { clubGames, miniGameCounts };
}

/**
 * Format activity report data as TSV string.
 */
export function formatActivityReportTSV(
  clubPlayers: PlayerData[],
  data: ActivityReportPlayerGames
): string {
  const { clubGames, miniGameCounts } = data;

  const activeMiniGames = [...miniGameCounts.entries()].filter(([_, counts]) => counts.size > 0);

  // Player map
  const playerMap = new Map<number, PlayerData>();
  for (const p of clubPlayers) {
    playerMap.set(p.rank, p);
  }

  // ── Section 1: Club Ladder ──
  const clubHeader = 'Rank\tLast Name\tFirst Name\tClub Games';
  const clubRows: string[] = [];
  const clubRanks = [...clubGames.entries()].filter(([_, c]) => c > 0).map(([rank]) => rank).sort((a, b) => a - b);
  for (const rank of clubRanks) {
    const player = playerMap.get(rank);
    if (!player) continue;
    clubRows.push(`${rank}\t${player.lastName}\t${player.firstName}\t${clubGames.get(rank)}`);
  }

  // ── Section 2: Mini-Games ──
  const miniLabels = activeMiniGames.map(([file]) => file.replace('.tab', ''));
  const miniHeader = `Rank\tLast Name\tFirst Name\tMini Total\t${miniLabels.join('\t')}`;
  const miniRows: string[] = [];
  const allMiniRanks = new Set<number>();
  for (const [, counts] of activeMiniGames) {
    for (const rank of counts.keys()) allMiniRanks.add(rank);
  }
  const sortedMiniRanks = [...allMiniRanks].sort((a, b) => a - b);
  for (const rank of sortedMiniRanks) {
    const player = playerMap.get(rank);
    if (!player) continue;
    const cols = activeMiniGames.map(([file, counts]) => counts.get(rank) || 0);
    const total = cols.reduce((s, v) => s + v, 0);
    miniRows.push(`${rank}\t${player.lastName}\t${player.firstName}\t${total}\t${cols.join('\t')}`);
  }

  // Combine sections
  const section1 = [clubHeader, ...clubRows].join('\n');
  const section2 = activeMiniGames.length > 0 ? [miniHeader, ...miniRows].join('\n') : '';
  return [section1, section2].filter(Boolean).join('\n\n') + '\n';
}
