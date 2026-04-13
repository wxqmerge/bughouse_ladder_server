import { PlayerData } from '../../shared/types';

const SESSION_LAST_MODE_KEY = 'ladder_last_mode';

export type ProgramMode = 'local' | 'server';
export type MigrationNonResultStrategy = 'use-server' | 'use-local';
export type MigrationResultsStrategy = 'merge' | 'dont-merge';

export interface MigrationOptions {
  nonResultStrategy: MigrationNonResultStrategy;
  resultsStrategy: MigrationResultsStrategy;
}

/**
 * Detect current mode based on user settings in localStorage
 */
export function detectCurrentMode(): ProgramMode {
  try {
    const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
    if (userSettingsJson) {
      const userSettings = JSON.parse(userSettingsJson);
      if (userSettings.server && userSettings.server.trim()) {
        return 'server';
      }
    }
  } catch (err) {
    console.error('[migrationUtils] Failed to read user settings:', err);
  }
  return 'local';
}

/**
 * Get last stored mode from sessionStorage
 */
export function getLastStoredMode(): ProgramMode | null {
  const stored = sessionStorage.getItem(SESSION_LAST_MODE_KEY);
  return (stored as ProgramMode) || null;
}

/**
 * Store current mode in sessionStorage
 */
export function storeCurrentMode(mode: ProgramMode): void {
  sessionStorage.setItem(SESSION_LAST_MODE_KEY, mode);
}

/**
 * Result of migration check
 */
export interface MigrationNeededResult {
  needed: boolean;
  fromMode: ProgramMode;
  toMode: ProgramMode;
  localPlayerCount: number;
  serverPlayerCount: number;
}

/**
 * Check if migration is needed (mode changed and data exists)
 */
export function checkMigrationNeeded(): MigrationNeededResult {
  const currentMode = detectCurrentMode();
  const lastMode = getLastStoredMode();
  
  // No migration if first run or same mode
  if (!lastMode || lastMode === currentMode) {
    return { needed: false, fromMode: currentMode, toMode: currentMode, localPlayerCount: 0, serverPlayerCount: 0 };
  }
  
  // Only prompt for local → server migration
  if (lastMode !== 'local' || currentMode !== 'server') {
    return { needed: false, fromMode: lastMode, toMode: currentMode, localPlayerCount: 0, serverPlayerCount: 0 };
  }
  
  // Count players in both locations
  const localData = localStorage.getItem('ladder_ladder_players');
  const serverData = localStorage.getItem('ladder_server_ladder_players');
  
  const localPlayers = localData ? (JSON.parse(localData) as PlayerData[]) : [];
  const serverPlayers = serverData ? (JSON.parse(serverData) as PlayerData[]) : [];
  
  // Only prompt if local has data
  if (localPlayers.length === 0) {
    storeCurrentMode(currentMode);
    return { needed: false, fromMode: lastMode, toMode: currentMode, localPlayerCount: 0, serverPlayerCount: serverPlayers.length };
  }
  
  return {
    needed: true,
    fromMode: lastMode,
    toMode: currentMode,
    localPlayerCount: localPlayers.length,
    serverPlayerCount: serverPlayers.length,
  };
}

/**
 * Information about rank/name mismatches between datasets
 */
export interface MismatchInfo {
  hasMismatch: boolean;
  mismatchedRanks: number[];
  localPlayers: PlayerData[];
  serverPlayers: PlayerData[];
}

/**
 * Detect rank/name mismatches between local and server players
 */
export function detectRankNameMismatches(localPlayers: PlayerData[], serverPlayers: PlayerData[]): MismatchInfo {
  const mismatchedRanks: number[] = [];
  
  // Create maps for easy lookup
  const localMap = new Map(localPlayers.map(p => [p.rank, p]));
  const serverMap = new Map(serverPlayers.map(p => [p.rank, p]));
  
  // Check all ranks that exist in either dataset
  const allRanks = new Set([...localMap.keys(), ...serverMap.keys()]);
  
  for (const rank of allRanks) {
    const localPlayer = localMap.get(rank);
    const serverPlayer = serverMap.get(rank);
    
    if (localPlayer && serverPlayer) {
      // Both exist - check if lastName differs
      if (localPlayer.lastName !== serverPlayer.lastName) {
        mismatchedRanks.push(rank);
      }
    }
  }
  
  return {
    hasMismatch: mismatchedRanks.length > 0,
    mismatchedRanks,
    localPlayers,
    serverPlayers,
  };
}

/**
 * Merge two results arrays, preferring non-null values with server as tiebreaker
 */
function mergeResultsArrays(localResults: (string | null)[], serverResults: (string | null)[]): (string | null)[] {
  const maxLen = Math.max(localResults.length, serverResults.length, 31);
  const merged: (string | null)[] = new Array(maxLen).fill(null);
  
  for (let i = 0; i < maxLen; i++) {
    const localVal = localResults[i] || null;
    const serverVal = serverResults[i] || null;
    
    // Prefer non-null, with server as tiebreaker
    if (serverVal) {
      merged[i] = serverVal;
    } else if (localVal) {
      merged[i] = localVal;
    }
  }
  
  return merged;
}

/**
 * Merge player lists based on specified strategy
 */
export function mergePlayerLists(
  localPlayers: PlayerData[],
  serverPlayers: PlayerData[],
  options: MigrationOptions
): PlayerData[] {
  const localMap = new Map(localPlayers.map(p => [p.rank, p]));
  const serverMap = new Map(serverPlayers.map(p => [p.rank, p]));
  const allRanks = new Set([...localMap.keys(), ...serverMap.keys()]);
  const merged: PlayerData[] = [];
  
  for (const rank of allRanks) {
    const localPlayer = localMap.get(rank);
    const serverPlayer = serverMap.get(rank);
    
    if (!localPlayer) {
      // Only in server - use server player
      merged.push(serverPlayer!);
      continue;
    }
    
    if (!serverPlayer) {
      // Only in local - use local player
      merged.push(localPlayer);
      continue;
    }
    
    // Both exist - merge based on strategy
    const mergedPlayer: PlayerData = { ...serverPlayer! };
    
    // Non-result fields (13 fields)
    if (options.nonResultStrategy === 'use-local') {
      mergedPlayer.rank = localPlayer.rank;
      mergedPlayer.group = localPlayer.group;
      mergedPlayer.lastName = localPlayer.lastName;
      mergedPlayer.firstName = localPlayer.firstName;
      mergedPlayer.rating = localPlayer.rating;
      mergedPlayer.nRating = localPlayer.nRating;
      mergedPlayer.grade = localPlayer.grade;
      mergedPlayer.num_games = localPlayer.num_games;
      mergedPlayer.attendance = localPlayer.attendance;
      mergedPlayer.info = localPlayer.info;
      mergedPlayer.phone = localPlayer.phone;
      mergedPlayer.school = localPlayer.school;
      mergedPlayer.room = localPlayer.room;
    }
    // else: keep server values (already copied)
    
    // Results array
    if (options.resultsStrategy === 'merge') {
      mergedPlayer.gameResults = mergeResultsArrays(localPlayer.gameResults, serverPlayer.gameResults);
    }
    // else: keep server results (already copied)
    
    merged.push(mergedPlayer);
  }
  
  return merged.sort((a, b) => a.rank - b.rank);
}

/**
 * Apply migration based on user choice
 */
export async function applyMigration(
  strategy: 'use-server' | 'use-local' | 'custom',
  customOptions?: MigrationOptions
): Promise<void> {
  const localData = localStorage.getItem('ladder_ladder_players');
  const serverData = localStorage.getItem('ladder_server_ladder_players');
  
  const localPlayers = localData ? (JSON.parse(localData) as PlayerData[]) : [];
  const serverPlayers = serverData ? (JSON.parse(serverData) as PlayerData[]) : [];
  
  let finalPlayers: PlayerData[];
  
  if (strategy === 'use-server') {
    finalPlayers = serverPlayers;
  } else if (strategy === 'use-local') {
    finalPlayers = localPlayers;
  } else {
    finalPlayers = mergePlayerLists(localPlayers, serverPlayers, customOptions!);
  }
  
  // Save to both locations
  const playerJson = JSON.stringify(finalPlayers);
  localStorage.setItem('ladder_ladder_players', playerJson);
  localStorage.setItem('ladder_server_ladder_players', playerJson);
  
  // Update current mode
  storeCurrentMode('server');
}
