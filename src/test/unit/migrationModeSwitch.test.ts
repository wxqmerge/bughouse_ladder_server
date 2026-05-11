import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PlayerData } from '../../../shared/types';

const createPlayer = (overrides: Partial<PlayerData>): PlayerData => ({
  rank: 1,
  group: 'A',
  lastName: 'Smith',
  firstName: 'John',
  rating: 1200,
  nRating: 1200,
  trophyEligible: true,
  grade: '4',
  num_games: 0,
  attendance: 0,
  info: '',
  phone: '',
  school: '',
  room: '',
  gameResults: Array(31).fill(null),
  ...overrides,
});

// Use a fixed prefix for testing
const TEST_PREFIX = 'ladder_testprefix_';

// Mock storageService with fixed prefix
vi.mock('../../../src/services/storageService', async () => {
  const actual = await vi.importActual('../../../src/services/storageService');
  return {
    ...actual,
    getKeyPrefix: () => TEST_PREFIX,
  };
});

// Mock userSettingsStorage with fixed prefix
vi.mock('../../../src/services/userSettingsStorage', async () => {
  const actual = await vi.importActual('../../../src/services/userSettingsStorage');
  return {
    ...actual,
    getLadderPrefix: () => TEST_PREFIX,
  };
});

import {
  checkMigrationNeeded,
  storeCurrentMode,
  detectRankNameMismatches,
  mergePlayerLists,
  applyMigration,
} from '../../../src/utils/migrationUtils';

function getStoragePrefix(): string {
  return TEST_PREFIX;
}

function getLocalPlayers(): PlayerData[] {
  const data = localStorage.getItem(getStoragePrefix() + 'ladder_players');
  return data ? JSON.parse(data) : [];
}

function setLocalPlayers(players: PlayerData[]): void {
  localStorage.setItem(getStoragePrefix() + 'ladder_players', JSON.stringify(players));
}

function setUserSettings(settings: any): void {
  localStorage.setItem(getStoragePrefix() + 'ladder_user_settings', JSON.stringify(settings));
}

function clearStorage(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TEST_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  sessionStorage.removeItem('ladder_last_mode');
}

describe('Migration - Mode Switching (Local <-> Server)', () => {
  beforeEach(() => {
    clearStorage();
  });

  afterEach(() => {
    clearStorage();
    vi.restoreAllMocks();
  });

  describe('checkMigrationNeeded - local to server', () => {
    it('should require migration when switching from local to server with local players', () => {
      storeCurrentMode('local');

      const players = [
        createPlayer({ rank: 1, lastName: 'Player1' }),
        createPlayer({ rank: 2, lastName: 'Player2' }),
        createPlayer({ rank: 3, lastName: 'Player3' }),
      ];
      setLocalPlayers(players);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
      expect(result.localPlayerCount).toBe(3);
      expect(result.serverPlayerCount).toBe(0);
    });

    it('should NOT require migration when switching from local to server with no local players', () => {
      storeCurrentMode('local');
      setLocalPlayers([]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
    });

    it('should NOT require migration when mode has not changed', () => {
      storeCurrentMode('server');
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when no last mode is stored', () => {
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
    });

    it('should use actualMode parameter instead of detecting from settings', () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'Player1' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      // With actualMode='local', no migration needed (matches last mode)
      const resultWithActual = checkMigrationNeeded('local');
      expect(resultWithActual.needed).toBe(false);

      // Without actualMode, detectCurrentMode reads settings and returns 'server'
      const resultWithoutActual = checkMigrationNeeded();
      expect(resultWithoutActual.needed).toBe(true);
      expect(resultWithoutActual.localPlayerCount).toBe(1);
    });

    it('should show correct player count matching MigrationDialog display', () => {
      storeCurrentMode('local');
      const players = [
        createPlayer({ rank: 1, lastName: 'A' }),
        createPlayer({ rank: 2, lastName: 'B' }),
        createPlayer({ rank: 3, lastName: 'C' }),
        createPlayer({ rank: 4, lastName: 'D' }),
        createPlayer({ rank: 5, lastName: 'E' }),
      ];
      setLocalPlayers(players);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.localPlayerCount).toBe(5);
      expect(result.serverPlayerCount).toBe(0);
    });
  });

  describe('checkMigrationNeeded - server to local', () => {
    it('should NOT require migration when switching from server to local', () => {
      storeCurrentMode('server');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('local');
      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when switching from server_down to local', () => {
      storeCurrentMode('server_down');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('local');
      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when switching from local to server_down', () => {
      storeCurrentMode('local');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server_down');
      expect(result.needed).toBe(false);
    });
  });

  describe('checkMigrationNeeded - mode transitions', () => {
    it('should handle multiple mode switches correctly', () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'P1' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      let result = checkMigrationNeeded('server');
      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(1);

      storeCurrentMode('server');

      setUserSettings({ server: '', apiKey: '', debugMode: false });
      result = checkMigrationNeeded('local');
      expect(result.needed).toBe(false);

      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });
      result = checkMigrationNeeded('server');
      expect(result.needed).toBe(false);
    });

    it('should handle server_down mode transitions', () => {
      storeCurrentMode('server');
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server_down');
      expect(result.needed).toBe(false);

      const result2 = checkMigrationNeeded('server');
      expect(result2.needed).toBe(false);
    });
  });

  describe('MigrationDialog display values', () => {
    it('should show correct counts for the Mode Change Detected dialog', () => {
      storeCurrentMode('local');
      const players = [
        createPlayer({ rank: 1, lastName: 'Anderson', firstName: 'Alice', rating: 1500 }),
        createPlayer({ rank: 2, lastName: 'Baker', firstName: 'Bob', rating: 1400 }),
        createPlayer({ rank: 3, lastName: 'Clark', firstName: 'Carol', rating: 1300 }),
        createPlayer({ rank: 4, lastName: 'Davis', firstName: 'Dave', rating: 1200 }),
        createPlayer({ rank: 5, lastName: 'Evans', firstName: 'Eve', rating: 1100 }),
        createPlayer({ rank: 6, lastName: 'Frost', firstName: 'Frank', rating: 1000 }),
        createPlayer({ rank: 7, lastName: 'Green', firstName: 'Grace', rating: 900 }),
        createPlayer({ rank: 8, lastName: 'Hill', firstName: 'Henry', rating: 800 }),
        createPlayer({ rank: 9, lastName: 'Ivanov', firstName: 'Ira', rating: 700 }),
        createPlayer({ rank: 10, lastName: 'Jones', firstName: 'Jane', rating: 1600 }),
        createPlayer({ rank: 11, lastName: 'Kim', firstName: 'Ken', rating: 600 }),
        createPlayer({ rank: 12, lastName: 'Lee', firstName: 'Lisa', rating: 500 }),
        createPlayer({ rank: 13, lastName: 'Moore', firstName: 'Mike', rating: 400 }),
        createPlayer({ rank: 14, lastName: 'Nolan', firstName: 'Nancy', rating: 300 }),
      ];
      setLocalPlayers(players);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(14);
      expect(result.serverPlayerCount).toBe(0);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
    });

    it('should show 0 players when local storage is empty', () => {
      storeCurrentMode('local');
      setLocalPlayers([]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
      expect(result.localPlayerCount).toBe(0);
      expect(result.serverPlayerCount).toBe(0);
    });

    it('should handle single player scenario', () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'Solo' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(1);
    });
  });

  describe('getLocalPlayers consistency', () => {
    it('should return the same count as checkMigrationNeeded localPlayerCount', () => {
      storeCurrentMode('local');
      const players = [
        createPlayer({ rank: 1, lastName: 'A' }),
        createPlayer({ rank: 2, lastName: 'B' }),
        createPlayer({ rank: 3, lastName: 'C' }),
      ];
      setLocalPlayers(players);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const directPlayers = getLocalPlayers();
      const migrationResult = checkMigrationNeeded('server');

      expect(directPlayers.length).toBe(migrationResult.localPlayerCount);
      expect(directPlayers.length).toBe(3);
    });
  });

  describe('detectRankNameMismatches in migration context', () => {
    it('should detect mismatches between local and server players', () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'LocalPlayer', firstName: 'Local' }),
        createPlayer({ rank: 2, lastName: 'SameName', firstName: 'Different' }),
      ];
      const serverPlayers = [
        createPlayer({ rank: 1, lastName: 'ServerPlayer', firstName: 'Server' }),
        createPlayer({ rank: 2, lastName: 'SameName', firstName: 'Different' }),
      ];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(true);
      expect(result.mismatchedRanks).toContain(1);
      expect(result.mismatchedRanks).not.toContain(2);
    });

    it('should handle empty player lists', () => {
      const result = detectRankNameMismatches([], []);
      expect(result.hasMismatch).toBe(false);
      expect(result.mismatchedRanks).toEqual([]);
    });
  });

  describe('applyMigration', () => {
    it('should store players under ladder_players key when using server strategy', async () => {
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'Local' })]);

      await applyMigration('use-server');

      const stored = JSON.parse(localStorage.getItem(getStoragePrefix() + 'ladder_players') || '[]');
      expect(stored).toEqual([]);
    });

    it('should store players when using local strategy', async () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Local1' }),
        createPlayer({ rank: 2, lastName: 'Local2' }),
      ];
      setLocalPlayers(localPlayers);

      await applyMigration('use-local');

      const stored = JSON.parse(localStorage.getItem(getStoragePrefix() + 'ladder_players') || '[]');
      expect(stored.length).toBe(2);
      expect(stored[0].lastName).toBe('Local1');
      expect(stored[1].lastName).toBe('Local2');
    });

    it('should store merged players when using custom strategy', async () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Local', gameResults: ['W', null, 'L'] }),
        createPlayer({ rank: 3, lastName: 'Local3' }),
      ];
      setLocalPlayers(localPlayers);

      await applyMigration('custom', {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'merge',
      });

      const stored = JSON.parse(localStorage.getItem(getStoragePrefix() + 'ladder_players') || '[]');
      expect(stored.length).toBe(2);
    });

    it('should store current mode as server after migration', async () => {
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'P1' })]);

      await applyMigration('use-local');

      const stored = sessionStorage.getItem('ladder_last_mode');
      expect(stored).toBe('server');
    });
  });
});
