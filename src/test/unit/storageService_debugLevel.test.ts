import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerData } from '../../../shared/types';
import { NUM_ROUNDS } from '../../../shared/utils/constants';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index],
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'location', { value: { hostname: 'localhost', pathname: '/' }, writable: true });

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock dataService
vi.mock('../../../src/services/dataService', () => ({
  dataService: {
    getMode: vi.fn().mockReturnValue('SERVER'),
    getConfigServerUrl: vi.fn().mockReturnValue('http://localhost:3000'),
    resetHashPublic: vi.fn(),
    getMiniGameFile: vi.fn().mockReturnValue(null),
    submitDeltaBatch: vi.fn().mockResolvedValue(undefined),
  },
  DataServiceMode: {
    LOCAL: 'LOCAL',
    DEVELOPMENT: 'DEVELOPMENT',
    SERVER: 'SERVER',
  },
}));

// Mock loadUserSettings
vi.mock('../../../src/services/userSettingsStorage', () => ({
  loadUserSettings: vi.fn().mockReturnValue({
    server: 'http://localhost:3000',
    apiKey: 'test-key',
  }),
  normalizeServerUrl: vi.fn((url: string) => url),
}));

// Mock gatedFetch to avoid rate limiting
vi.mock('../../../src/utils/requestGate', () => ({
  gatedFetch: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    return global.fetch(url, init);
  }),
}));

// Mock shouldLog to disable verbose logging
vi.mock('../../../shared/utils/debugUtils', () => ({
  shouldLog: vi.fn(() => false),
}));

// Import after mocks
import { savePlayers } from '../../../src/services/storageService';

describe('savePlayers X-Debug-Level header', () => {
  const mockPlayer: PlayerData = {
    rank: 1,
    group: 'A',
    lastName: 'Test',
    firstName: 'User',
    rating: 1200,
    nRating: 1200,
    trophyEligible: true,
    grade: 'A',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: new Array(NUM_ROUNDS).fill(null),
  };

  const setDebugLevel = (level: number) => {
    // Key prefix is derived from hostname: 'ladder_localhost_'
    localStorage.setItem('ladder_localhost_ladder_settings', JSON.stringify({ debugLevel: level }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('should send X-Debug-Level header with default level 5', async () => {
    setDebugLevel(5);

    await savePlayers([mockPlayer], true, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/ladder',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Debug-Level': '5',
        }),
      })
    );
  });

  it('should send X-Debug-Level header with custom level 3', async () => {
    setDebugLevel(3);

    await savePlayers([mockPlayer], true, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/ladder',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Debug-Level': '3',
        }),
      })
    );
  });

  it('should send X-Debug-Level header with level 0', async () => {
    setDebugLevel(0);

    await savePlayers([mockPlayer], true, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/ladder',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Debug-Level': '0',
        }),
      })
    );
  });

  it('should always include X-Debug-Level header regardless of debug level', async () => {
    // Test with level 99 (effectively disabled)
    setDebugLevel(99);
    await savePlayers([mockPlayer], true, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/ladder',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Debug-Level': '99',
        }),
      })
    );
  });

  it('should include both X-Debug-Level and X-API-Key headers', async () => {
    setDebugLevel(5);
    await savePlayers([mockPlayer], true, false);

    const callArgs = (mockFetch.mock.calls[0] as any[]);
    const headers = callArgs[1]?.headers;

    expect(headers).toHaveProperty('X-Debug-Level', '5');
    expect(headers).toHaveProperty('X-API-Key', 'test-key');
    expect(headers).toHaveProperty('Content-Type', 'application/json');
  });

  it('should use default level 5 when no settings exist', async () => {
    // Don't set any settings
    await savePlayers([mockPlayer], true, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/ladder',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Debug-Level': '5',
        }),
      })
    );
  });
});
