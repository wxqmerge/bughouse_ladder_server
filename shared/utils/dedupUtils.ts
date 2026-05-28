import { PlayerData } from '../types/index.js';

/**
 * Merge game results from two players with the same name.
 * Verified cells (ending with "_") always win.
 * For unverified cells, prefer non-null values from either player.
 */
function mergeGameResults(
  a: (string | null)[],
  b: (string | null)[]
): (string | null)[] {
  const maxLen = Math.max(a.length, b.length, 31);
  const result: (string | null)[] = new Array(maxLen).fill(null);

  for (let i = 0; i < maxLen; i++) {
    const va = a[i] || null;
    const vb = b[i] || null;

    const aConfirmed = va && va.endsWith('_');
    const bConfirmed = vb && vb.endsWith('_');

    if (aConfirmed && bConfirmed) {
      // Both verified: keep the one from the player with lower rank (a)
      result[i] = va;
    } else if (aConfirmed) {
      result[i] = va;
    } else if (bConfirmed) {
      result[i] = vb;
    } else {
      // Neither verified: prefer non-null, then a over b
      result[i] = va || vb || null;
    }
  }

  return result;
}

/**
 * Deduplicate players by name (last + first, case-insensitive).
 * 
 * For verified entries (cells with "_" suffix), duplicates are always safe
 * to merge because the verified cell takes priority.
 * 
 * Strategy:
 * - Group players by lowercase "lastName,firstName"
 * - For each group, keep the player with the lowest rank as the base
 * - Merge game results: verified cells always win, then prefer non-null
 * - Merge metadata: keep lower rank, sum num_games, sum attendance
 */
export function deduplicatePlayers(players: PlayerData[]): PlayerData[] {
  if (!players || players.length === 0) {
    return [];
  }

  // Group by name key
  const groups = new Map<string, PlayerData[]>();
  for (const p of players) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`;
    const group = groups.get(key) || [];
    group.push(p);
    groups.set(key, group);
  }

  const result: PlayerData[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort by rank ascending — lowest rank is the canonical entry
    group.sort((a, b) => a.rank - b.rank);
    const base = group[0];

    // Merge all duplicates into the base
    let mergedResults = [...(base.gameResults || new Array(31).fill(null))];
    let sumNumGames = base.num_games || 0;
    let sumAttendance = base.attendance || 0;

    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      mergedResults = mergeGameResults(mergedResults, dup.gameResults || new Array(31).fill(null));
      sumNumGames += dup.num_games || 0;
      sumAttendance += dup.attendance || 0;
    }

    result.push({
      ...base,
      num_games: sumNumGames,
      attendance: sumAttendance,
      gameResults: mergedResults,
    });
  }

  // Sort final result by rank
  result.sort((a, b) => a.rank - b.rank);

  return result;
}
