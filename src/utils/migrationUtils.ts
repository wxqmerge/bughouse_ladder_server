import { PlayerData } from '../../shared/types';
import { getKeyPrefix, getLocalPlayers, setJson } from '../services/storageService';
import { loadUserSettings } from '../services/userSettingsStorage';
import type { ProgramMode } from './mode';

const SESSION_LAST_MODE_KEY = 'ladder_last_mode';

export type MigrationNonResultStrategy = 'use-server' | 'use-local';
export type MigrationResultsStrategy = 'merge' | 'dont-merge';

interface MigrationOptions {
  nonResultStrategy: MigrationNonResultStrategy;
  resultsStrategy: MigrationResultsStrategy;
}

/**
 * Detect current mode based on user settings in localStorage
 */
function detectCurrentMode(): ProgramMode {
  try {
    const userSettings = loadUserSettings();
    if (userSettings.server && userSettings.server.trim()) {
      return 'server';
    }
  } catch (err) {
    console.error('[migrationUtils] Failed to read user settings:', err);
  }
  return 'local';
}

/**
 * Get last stored mode from sessionStorage
 */
function getLastStoredMode(): ProgramMode | null {
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
interface MigrationNeededResult {
  needed: boolean;
  fromMode: ProgramMode;
  toMode: ProgramMode;
  localPlayerCount: number;
  serverPlayerCount: number;
}

/**
 * Check if migration is needed (mode changed and data exists)
 */
export function checkMigrationNeeded(actualMode?: ProgramMode): MigrationNeededResult {
  const currentMode = actualMode || detectCurrentMode();
  const lastMode = getLastStoredMode();
  
  if (!lastMode || lastMode === currentMode) {
    return { needed: false, fromMode: currentMode, toMode: currentMode, localPlayerCount: 0, serverPlayerCount: 0 };
  }
  
  if (lastMode !== 'local' || currentMode !== 'server') {
    return { needed: false, fromMode: lastMode, toMode: currentMode, localPlayerCount: 0, serverPlayerCount: 0 };
  }
  
  const localPlayers = getLocalPlayers();
  
  const serverPlayers: PlayerData[] = []; 
  
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
interface MismatchInfo {
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
  const localMap = new Map(localPlayers.map(p => [p.rank, p]));
  const serverMap = new Map(serverPlayers.map(p => [p.rank, p]));
  const allRanks = new Set([...localMap.keys(), ...serverMap.keys()]);
  
  for (const rank of allRanks) {
    const local = localMap.get(rank);
    const server = serverMap.get(rank);
    if (local && server && (local.lastName !== server.lastName || local.firstName !== server.firstName)) {
      mismatchedRanks.push(rank);
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
 * Merge two player lists based on strategy
 */
export function mergePlayerLists(local: PlayerData[], server: PlayerData[], options: MigrationOptions): PlayerData[] {
  const allRanks = Array.from(new Set([...local.map(p => p.rank), ...server.map(p => p.rank)])).sort((a, b) => a - b);
  
  const merged = allRanks.map(rank => {
    const lp = local.find(p => p.rank === rank);
    const sp = server.find(p => p.rank === rank);
    
    if (!lp) return sp!;
    if (!sp) return lp;
    
    // Both exist - merge based on strategy
    const useLocal = options.nonResultStrategy === 'use-local';
    const primary = useLocal ? lp : sp;
    const secondary = useLocal ? sp : lp;
    
    const mergedPlayer = { ...primary };
    
    // Merge game results if requested
    if (options.resultsStrategy === 'merge') {
      mergedPlayer.gameResults = primary.gameResults.map((res, idx) => {
        return res || (secondary.gameResults && secondary.gameResults[idx]);
      });
    } else {
      // Use primary's results
      mergedPlayer.gameResults = primary.gameResults;
    }
    
    return mergedPlayer;
  });
  
  return merged;
}

/**
 * Apply migration based on user choice
 */
export async function applyMigration(
  strategy: 'use-server' | 'use-local' | 'custom',
  customOptions?: MigrationOptions
): Promise<void> {
  const localPlayers = getLocalPlayers();
  const serverPlayers: PlayerData[] = []; 
  
  let finalPlayers: PlayerData[];
  if (strategy === 'use-server') {
    finalPlayers = serverPlayers;
  } else if (strategy === 'use-local') {
    finalPlayers = localPlayers;
  } else {
    finalPlayers = mergePlayerLists(localPlayers, serverPlayers, customOptions!);
  }
  
  setJson('ladder_players', finalPlayers);
  storeCurrentMode('server');
}
