import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Mock localStorage and sessionStorage
const mockLocalStorage: Record<string, string> = {};
const mockSessionStorage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }),
  get length() { return Object.keys(mockLocalStorage).length; },
  key: vi.fn((n: number) => Object.keys(mockLocalStorage)[n] ?? null),
});

vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockSessionStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockSessionStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]); }),
  get length() { return Object.keys(mockSessionStorage).length; },
  key: vi.fn((n: number) => Object.keys(mockSessionStorage)[n] ?? null),
});

const TEST_PREFIX = 'ladder_testprefix_';

// Mock storageService to use fixed prefix
vi.mock('../../../src/services/storageService', () => ({
  getKeyPrefix: () => TEST_PREFIX,
  getJson: (key: string) => {
    const data = mockLocalStorage[TEST_PREFIX + key];
    return data ? JSON.parse(data) : null;
  },
  setJson: (key: string, value: any) => {
    mockLocalStorage[TEST_PREFIX + key] = JSON.stringify(value);
  },
  removeJson: (key: string) => {
    delete mockLocalStorage[TEST_PREFIX + key];
  },
  getLocalPlayers: () => {
    const data = mockLocalStorage[TEST_PREFIX + 'ladder_players'];
    return data ? JSON.parse(data) : [];
  },
  setJson: (key: string, value: any) => {
    mockLocalStorage[TEST_PREFIX + key] = JSON.stringify(value);
  },
}));

// Mock userSettingsStorage to use fixed prefix
vi.mock('../../../src/services/userSettingsStorage', () => ({
  loadUserSettings: () => {
    const data = mockLocalStorage[TEST_PREFIX + 'ladder_user_settings'];
    return data ? JSON.parse(data) : { server: '', apiKey: '', debugMode: false };
  },
  saveUserSettings: (settings: any) => {
    mockLocalStorage[TEST_PREFIX + 'ladder_user_settings'] = JSON.stringify(settings);
  },
}));

// Mock dataService - default to empty players, tests can override via vi.mocked
const _mocks = vi.hoisted(() => ({ mockGetPlayers: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../src/services/dataService', () => ({
  dataService: {
    getPlayers: () => _mocks.mockGetPlayers(),
  },
  DataServiceMode: { LOCAL: 'local', SERVER: 'server' },
}));

// Export for use in tests
const mockGetPlayers = _mocks.mockGetPlayers;

import {
  checkMigrationNeeded,
  storeCurrentMode,
  detectRankNameMismatches,
  mergePlayerLists,
  applyMigration,
} from '../../../src/utils/migrationUtils';

function setLocalPlayers(players: PlayerData[]): void {
  mockLocalStorage[TEST_PREFIX + 'ladder_players'] = JSON.stringify(players);
}

function setUserSettings(settings: any): void {
  mockLocalStorage[TEST_PREFIX + 'ladder_user_settings'] = JSON.stringify(settings);
}

function clearStorage(): void {
  Object.keys(mockLocalStorage).filter(k => k.startsWith(TEST_PREFIX)).forEach(k => delete mockLocalStorage[k]);
  mockSessionStorage['ladder_last_mode'] = undefined;
}

describe('Migration - Mode Switching (Local <-> Server)', () => {
  beforeEach(() => {
    clearStorage();
    vi.clearAllMocks();
    mockGetPlayers.mockResolvedValue([]);
  });

  afterEach(() => {
    clearStorage();
    vi.restoreAllMocks();
  });

  describe('checkMigrationNeeded - local to server', () => {
    it('should require migration when switching from local to server with local players', async () => {
      storeCurrentMode('local');

      const players = [
        createPlayer({ rank: 1, lastName: 'Player1' }),
        createPlayer({ rank: 2, lastName: 'Player2' }),
        createPlayer({ rank: 3, lastName: 'Player3' }),
      ];
      setLocalPlayers(players);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
      expect(result.localPlayerCount).toBe(3);
      expect(result.serverPlayerCount).toBe(0);
    });

    it('should show actual server player count when available', async () => {
      storeCurrentMode('local');

      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Local1' }),
        createPlayer({ rank: 2, lastName: 'Local2' }),
      ];
      setLocalPlayers(localPlayers);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const serverPlayers = [
        createPlayer({ rank: 1, lastName: 'Server1' }),
        createPlayer({ rank: 2, lastName: 'Server2' }),
        createPlayer({ rank: 3, lastName: 'Server3' }),
      ];
      mockGetPlayers.mockResolvedValue(serverPlayers);

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(2);
      expect(result.serverPlayerCount).toBe(3);
    });

    it('should NOT require migration when switching from local to server with no local players', async () => {
      storeCurrentMode('local');
      setLocalPlayers([]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
    });

    it('should NOT require migration when mode has not changed', async () => {
      storeCurrentMode('server');
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when no last mode is stored', async () => {
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
    });

    it('should use actualMode parameter instead of detecting from settings', async () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'Player1' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      // With actualMode='local', no migration needed (matches last mode)
      const resultWithActual = await checkMigrationNeeded('local');
      expect(resultWithActual.needed).toBe(false);

      // Without actualMode, detectCurrentMode reads settings and returns 'server'
      const resultWithoutActual = await checkMigrationNeeded();
      expect(resultWithoutActual.needed).toBe(true);
      expect(resultWithoutActual.localPlayerCount).toBe(1);
    });

    it('should show correct player count matching MigrationDialog display', async () => {
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

      const result = await checkMigrationNeeded('server');

      expect(result.localPlayerCount).toBe(5);
      expect(result.serverPlayerCount).toBe(0);
    });
  });

  describe('checkMigrationNeeded - server to local', () => {
    it('should NOT require migration when switching from server to local', async () => {
      storeCurrentMode('server');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('local');
      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when switching from server_down to local', async () => {
      storeCurrentMode('server_down');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('local');
      expect(result.needed).toBe(false);
    });

    it('should NOT require migration when switching from local to server_down', async () => {
      storeCurrentMode('local');
      setUserSettings({ server: '', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server_down');
      expect(result.needed).toBe(false);
    });
  });

  describe('checkMigrationNeeded - mode transitions', () => {
    it('should handle multiple mode switches correctly', async () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'P1' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      let result = await checkMigrationNeeded('server');
      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(1);

      storeCurrentMode('server');

      setUserSettings({ server: '', apiKey: '', debugMode: false });
      result = await checkMigrationNeeded('local');
      expect(result.needed).toBe(false);

      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });
      result = await checkMigrationNeeded('server');
      expect(result.needed).toBe(false);
    });

    it('should handle server_down mode transitions', async () => {
      storeCurrentMode('server');
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server_down');
      expect(result.needed).toBe(false);

      const result2 = await checkMigrationNeeded('server');
      expect(result2.needed).toBe(false);
    });
  });

  describe('MigrationDialog display values', () => {
    it('should show correct counts for the Mode Change Detected dialog', async () => {
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

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(14);
      expect(result.serverPlayerCount).toBe(0);
      expect(result.fromMode).toBe('local');
      expect(result.toMode).toBe('server');
    });

    it('should show 0 players when local storage is empty', async () => {
      storeCurrentMode('local');
      setLocalPlayers([]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(false);
      expect(result.localPlayerCount).toBe(0);
      expect(result.serverPlayerCount).toBe(0);
    });

    it('should handle single player scenario', async () => {
      storeCurrentMode('local');
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'Solo' })]);
      setUserSettings({ server: 'http://localhost:3000', apiKey: '', debugMode: false });

      const result = await checkMigrationNeeded('server');

      expect(result.needed).toBe(true);
      expect(result.localPlayerCount).toBe(1);
    });
  });

  describe('detectRankNameMismatches', () => {
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

      const stored = JSON.parse(mockLocalStorage[TEST_PREFIX + 'ladder_players'] || '[]');
      expect(stored).toEqual([]);
    });

    it('should store players when using local strategy', async () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Local1' }),
        createPlayer({ rank: 2, lastName: 'Local2' }),
      ];
      setLocalPlayers(localPlayers);

      await applyMigration('use-local');

      const stored = JSON.parse(mockLocalStorage[TEST_PREFIX + 'ladder_players'] || '[]');
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

      const stored = JSON.parse(mockLocalStorage[TEST_PREFIX + 'ladder_players'] || '[]');
      expect(stored.length).toBe(2);
    });

    it('should store current mode as server after migration', async () => {
      setLocalPlayers([createPlayer({ rank: 1, lastName: 'P1' })]);

      await applyMigration('use-local');

      const stored = mockSessionStorage['ladder_last_mode'];
      expect(stored).toBe('server');
    });
  });
});
