/**
 * Tests for mini-game file switching (data source routing)
 * Verifies that setMiniGameFile correctly routes all operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }),
  get length() { return Object.keys(mockLocalStorage).length; },
  key: vi.fn((n: number) => Object.keys(mockLocalStorage)[n] || null),
});

describe('Mini-Game File Switching', () => {
  let dataService: any;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
    
    // Reset the singleton by clearing the module cache
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should route getPlayers to mini-game file when set', async () => {
    // Import after mocking
    const { dataService: ds } = await import('../../services/dataService');
    dataService = ds;
    
    const mockStore = {
      readMiniGameFile: vi.fn().mockResolvedValue({
        header: ['Test'],
        players: [
          { rank: 1, group: 'A', lastName: 'MiniPlayer', firstName: 'Test', rating: 1500, nRating: 1500, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, phone: '', info: '', school: '', room: '', gameResults: Array(31).fill(null) }
        ],
        rawLines: []
      }),
      writeMiniGameFile: vi.fn().mockResolvedValue(undefined),
      getMiniGameFiles: vi.fn().mockReturnValue([]),
      mergeGameResults: vi.fn().mockImplementation((a: any, b: any) => b),
      getExistingMiniGameFiles: vi.fn().mockResolvedValue([]),
      clearMiniGames: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      hasMiniGameFiles: vi.fn().mockResolvedValue(false),
      checkMiniGameFilesWith: vi.fn().mockResolvedValue([]),
      addPlayerToAllMiniGames: vi.fn().mockResolvedValue(undefined),
      generateTrophyReport: vi.fn().mockResolvedValue({ success: true, message: '', trophies: [] }),
    };
    
    dataService.updateConfig({ miniGameStore: mockStore });
    
    // Set mini-game file
    dataService.setMiniGameFile('bughouse.tab');
    
    // getPlayers should use mini-game store
    const players = await dataService.getPlayers();
    
    expect(players.length).toBe(1);
    expect(players[0].lastName).toBe('MiniPlayer');
    expect(mockStore.readMiniGameFile).toHaveBeenCalledWith('bughouse.tab');
  });

  it('should route getPlayers to ladder when mini-game file is null', async () => {
    const { dataService: ds } = await import('../../services/dataService');
    dataService = ds;
    
    const mockStore = {
      readMiniGameFile: vi.fn().mockResolvedValue({
        header: ['Test'],
        players: [],
        rawLines: []
      }),
      writeMiniGameFile: vi.fn().mockResolvedValue(undefined),
      getMiniGameFiles: vi.fn().mockReturnValue([]),
      mergeGameResults: vi.fn(),
      getExistingMiniGameFiles: vi.fn().mockResolvedValue([]),
      clearMiniGames: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      hasMiniGameFiles: vi.fn().mockResolvedValue(false),
      checkMiniGameFilesWith: vi.fn().mockResolvedValue([]),
      addPlayerToAllMiniGames: vi.fn().mockResolvedValue(undefined),
      generateTrophyReport: vi.fn().mockResolvedValue({ success: true, message: '', trophies: [] }),
    };
    
    dataService.updateConfig({ miniGameStore: mockStore });
    
    // Reset mini-game file (back to ladder.tab)
    dataService.setMiniGameFile(null);
    
    // getPlayers should NOT use mini-game store
    // In local mode, it should use storageGetPlayers instead
    const players = await dataService.getPlayers();
    
    expect(mockStore.readMiniGameFile).not.toHaveBeenCalled();
    expect(players).toEqual([]);
  });

  it('should route savePlayers to mini-game file when set', async () => {
    const { dataService: ds } = await import('../../services/dataService');
    dataService = ds;
    
    const mockStore = {
      readMiniGameFile: vi.fn().mockResolvedValue({
        header: ['Test'],
        players: [],
        rawLines: []
      }),
      writeMiniGameFile: vi.fn().mockResolvedValue(undefined),
      getMiniGameFiles: vi.fn().mockReturnValue([]),
      mergeGameResults: vi.fn(),
      getExistingMiniGameFiles: vi.fn().mockResolvedValue([]),
      clearMiniGames: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      hasMiniGameFiles: vi.fn().mockResolvedValue(false),
      checkMiniGameFilesWith: vi.fn().mockResolvedValue([]),
      addPlayerToAllMiniGames: vi.fn().mockResolvedValue(undefined),
      generateTrophyReport: vi.fn().mockResolvedValue({ success: true, message: '', trophies: [] }),
    };
    
    dataService.updateConfig({ miniGameStore: mockStore });
    
    dataService.setMiniGameFile('BG_Game.tab');
    
    const testPlayers = [
      { rank: 1, group: 'A', lastName: 'Test', firstName: 'Player', rating: 1500, nRating: 1500, trophyEligible: true, grade: '5', num_games: 1, attendance: 0, phone: '', info: '', school: '', room: '', gameResults: ['1L1', null, null] }
    ];
    
    await dataService.savePlayers(testPlayers);
    
    expect(mockStore.writeMiniGameFile).toHaveBeenCalledWith('BG_Game.tab', expect.objectContaining({
      players: testPlayers
    }));
  });

  it('should getMiniGameFile return the current file name', async () => {
    const { dataService: ds } = await import('../../services/dataService');
    dataService = ds;
    
    // Need to re-import to get fresh instance
    vi.resetModules();
    const { dataService: ds2 } = await import('../../services/dataService');
    dataService = ds2;
    
    expect(dataService.getMiniGameFile()).toBeNull();
    
    dataService.setMiniGameFile('bughouse.tab');
    expect(dataService.getMiniGameFile()).toBe('bughouse.tab');
    
    dataService.setMiniGameFile(null);
    expect(dataService.getMiniGameFile()).toBeNull();
  });

  it('should reloadPlayers return data from current source', async () => {
    const { dataService: ds } = await import('../../services/dataService');
    dataService = ds;
    
    const mockStore = {
      readMiniGameFile: vi.fn().mockResolvedValue({
        header: ['Test'],
        players: [
          { rank: 1, group: 'A', lastName: 'Reloaded', firstName: 'Player', rating: 1600, nRating: 1600, trophyEligible: true, grade: '6', num_games: 2, attendance: 0, phone: '', info: '', school: '', room: '', gameResults: ['1L1', '2W1', null] }
        ],
        rawLines: []
      }),
      writeMiniGameFile: vi.fn().mockResolvedValue(undefined),
      getMiniGameFiles: vi.fn().mockReturnValue([]),
      mergeGameResults: vi.fn(),
      getExistingMiniGameFiles: vi.fn().mockResolvedValue([]),
      clearMiniGames: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      hasMiniGameFiles: vi.fn().mockResolvedValue(false),
      checkMiniGameFilesWith: vi.fn().mockResolvedValue([]),
      addPlayerToAllMiniGames: vi.fn().mockResolvedValue(undefined),
      generateTrophyReport: vi.fn().mockResolvedValue({ success: true, message: '', trophies: [] }),
    };
    
    dataService.updateConfig({ miniGameStore: mockStore });
    
    dataService.setMiniGameFile('Queen_Game.tab');
    
    const reloaded = await dataService.reloadPlayers();
    
    expect(reloaded.length).toBe(1);
    expect(reloaded[0].lastName).toBe('Reloaded');
    expect(reloaded[0].rating).toBe(1600);
  });
});
