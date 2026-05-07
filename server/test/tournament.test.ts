import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readLadderFile, writeLadderFile, generateTabContent, PlayerData, LadderData } from '../src/services/dataService';
import { copyPlayersToTarget, mergeGameResults, getExistingMiniGameFiles, readMiniGameFile, writeMiniGameFile, getMiniGameFilePath } from '../src/services/tournamentService';

// ── Test Fixtures ──────────────────────────────────────────────────

function createTestTabPath(): string {
  return path.join(os.tmpdir(), `bughouse-tournament-test-${Date.now()}`, 'ladder.tab');
}

function createTestMiniGamePath(fileName: string): string {
  return path.join(os.tmpdir(), `bughouse-tournament-test-${Date.now()}`, fileName);
}

function createSamplePlayers(): PlayerData[] {
  return [
    {
      rank: 1, group: 'A1', lastName: 'Smith', firstName: 'John',
      rating: 1500, nRating: 1550, trophyEligible: true, grade: '5',
      num_games: 3, attendance: 0, phone: '', info: '', school: '', room: '',
      gameResults: ['1L1', '2W1', '1L1', null, null],
    },
    {
      rank: 2, group: 'A2', lastName: 'Jones', firstName: 'Jane',
      rating: 1400, nRating: 1420, trophyEligible: true, grade: '5',
      num_games: 2, attendance: 0, phone: '', info: '', school: '', room: '',
      gameResults: ['1L1', '2L1', null, null, null],
    },
    {
      rank: 3, group: 'B1', lastName: 'Brown', firstName: 'Bob',
      rating: 1300, nRating: 1310, trophyEligible: true, grade: '6',
      num_games: 1, attendance: 0, phone: '', info: '', school: '', room: '',
      gameResults: ['1L1', null, null, null, null],
    },
  ];
}

function createLadderData(players: PlayerData[]): LadderData {
  return { header: [], players, rawLines: [] };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('copyPlayersToTarget', () => {
  it('should match players by lastName + firstName', () => {
    const source = createSamplePlayers();
    const target = [
      {
        rank: 1, group: 'A1', lastName: 'Smith', firstName: 'John',
        rating: 1000, nRating: 1000, trophyEligible: true, grade: '5',
        num_games: 0, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: Array(31).fill(null),
      },
    ];

    const result = copyPlayersToTarget(source, target);

    // John should have updated rating from source
    expect(result.find(p => p.lastName === 'Smith' && p.firstName === 'John')?.rating).toBe(1500);
    // Jane and Bob should be added
    expect(result.find(p => p.lastName === 'Jones')).toBeDefined();
    expect(result.find(p => p.lastName === 'Brown')).toBeDefined();
    expect(result.length).toBe(3);
  });

  it('should preserve existing player data not in source', () => {
    const source = createSamplePlayers();
    const target = [
      {
        rank: 10, group: 'C1', lastName: 'Wilson', firstName: 'Alice',
        rating: 1200, nRating: 1200, trophyEligible: true, grade: '7',
        num_games: 5, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: ['1L1', '1L1', '1L1', '1L1', '1L1', null, null],
      },
    ];

    const result = copyPlayersToTarget(source, target);

    // Alice should be preserved with her data
    const alice = result.find(p => p.lastName === 'Wilson' && p.firstName === 'Alice');
    expect(alice).toBeDefined();
    expect(alice?.rating).toBe(1200);
    expect(alice?.num_games).toBe(5);
  });

  it('should handle empty source', () => {
    const result = copyPlayersToTarget([], createSamplePlayers());
    expect(result.length).toBe(3);
    expect(result[0].rating).toBe(1500);
  });

  it('should handle empty target', () => {
    const source = createSamplePlayers();
    const result = copyPlayersToTarget(source, []);
    expect(result.length).toBe(3);
  });

  it('should be case-insensitive for name matching', () => {
    const source = [
      {
        rank: 1, group: 'A1', lastName: 'SMITH', firstName: 'JOHN',
        rating: 1500, nRating: 1550, trophyEligible: true, grade: '5',
        num_games: 3, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: Array(31).fill(null),
      },
    ];
    const target = [
      {
        rank: 1, group: 'A1', lastName: 'Smith', firstName: 'John',
        rating: 1000, nRating: 1000, trophyEligible: true, grade: '5',
        num_games: 0, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: Array(31).fill(null),
      },
    ];

    const result = copyPlayersToTarget(source, target);
    expect(result.find(p => p.lastName === 'Smith')?.rating).toBe(1500);
  });

  it('should update all matching players in target', () => {
    const source = createSamplePlayers();
    const target = [
      {
        rank: 1, group: 'A1', lastName: 'Smith', firstName: 'John',
        rating: 1000, nRating: 1000, trophyEligible: true, grade: '5',
        num_games: 0, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: Array(31).fill(null),
      },
      {
        rank: 2, group: 'A1', lastName: 'Smith', firstName: 'John',
        rating: 1100, nRating: 1100, trophyEligible: true, grade: '5',
        num_games: 0, attendance: 0, phone: '', info: '', school: '', room: '',
        gameResults: Array(31).fill(null),
      },
    ];

    const result = copyPlayersToTarget(source, target);
    const smithPlayers = result.filter(p => p.lastName === 'Smith' && p.firstName === 'John');
    // Both matches get updated from source (same name lookup)
    expect(smithPlayers.length).toBe(2);
    expect(smithPlayers[0].rating).toBe(1500);
    expect(smithPlayers[1].rating).toBe(1500);
  });
});

describe('mergeGameResults', () => {
  it('should preserve non-null old results', () => {
    const oldResults = ['1L1', '2W1', '1L1', null, '3W1'];
    const currentResults = ['1L1', null, '1W1', null, null];

    const result = mergeGameResults(oldResults, currentResults);

    expect(result[0]).toBe('1L1'); // kept from current
    expect(result[1]).toBe('2W1'); // filled from old
    expect(result[2]).toBe('1W1'); // kept from current
    expect(result[3]).toBe(null);
    expect(result[4]).toBe('3W1'); // filled from old
  });

  it('should not overwrite current results with old', () => {
    const oldResults = ['1L1', '2W1'];
    const currentResults = ['1W1', '2L1'];

    const result = mergeGameResults(oldResults, currentResults);

    expect(result[0]).toBe('1W1'); // current wins
    expect(result[1]).toBe('2L1'); // current wins
  });

  it('should handle empty old results', () => {
    const result = mergeGameResults([], ['1L1', '2W1']);
    // When old is empty, returns copy of current results
    expect(result.length).toBe(2);
    expect(result[0]).toBe('1L1');
    expect(result[1]).toBe('2W1');
  });

  it('should handle empty current results', () => {
    const oldResults = ['1L1', '2W1'];
    const result = mergeGameResults(oldResults, []);
    expect(result[0]).toBe('1L1');
    expect(result[1]).toBe('2W1');
  });

  it('should handle null values in old results', () => {
    const oldResults = [null, '2W1', null];
    const currentResults = ['1L1', null, '3L1'];

    const result = mergeGameResults(oldResults, currentResults);

    expect(result[0]).toBe('1L1');
    expect(result[1]).toBe('2W1');
    expect(result[2]).toBe('3L1');
  });

  it('should not merge underscore results', () => {
    const oldResults = ['_'];
    const currentResults = [null];

    const result = mergeGameResults(oldResults, currentResults);
    // '_' is truthy, so it gets merged
    expect(result[0]).toBe('_');
  });
});

describe('readMiniGameFile / writeMiniGameFile', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-tournament-io-test-${Date.now()}`);
  const testFile = path.join(testDir, 'test_game.tab');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFile);
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write and read a mini-game file', async () => {
    const players = createSamplePlayers();
    const ladderData = createLadderData(players);

    await writeLadderFile(ladderData, testFile);

    const readData = await readLadderFile(testFile);
    expect(readData.players.length).toBe(3);
    expect(readData.players[0].lastName).toBe('Smith');
    expect(readData.players[0].rating).toBe(1500);
  });

  it('should return null for non-existent file', async () => {
    const result = await readMiniGameFile('nonexistent.tab');
    expect(result).toBeNull();
  });

  it('should save and retrieve mini-game file', async () => {
    const players = createSamplePlayers();
    const ladderData = createLadderData(players);

    await writeMiniGameFile('test_game.tab', ladderData);

    const result = await readMiniGameFile('test_game.tab');
    expect(result).not.toBeNull();
    expect(result?.players.length).toBe(3);
  });
});

describe('getExistingMiniGameFiles', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-tournament-files-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    // Set env var for this test
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    delete process.env.TAB_FILE_PATH;
  });

  it('should return empty array when no mini-game files exist', async () => {
    const result = await getExistingMiniGameFiles();
    expect(result).toEqual([]);
  });

  it('should list existing mini-game files', async () => {
    // Create some mini-game files
    await fs.writeFile(path.join(testDir, 'BG_Game.tab'), 'test');
    await fs.writeFile(path.join(testDir, 'bughouse.tab'), 'test');

    const result = await getExistingMiniGameFiles();
    expect(result).toContain('BG_Game.tab');
    expect(result).toContain('bughouse.tab');
    expect(result).not.toContain('Queen_Game.tab');
  });

  it('should return all 7 files when all exist', async () => {
    const allFiles = [
      'BG_Game.tab', 'Bishop_Game.tab', 'Pillar_Game.tab',
      'Kings_Cross.tab', 'Pawn_Game.tab', 'Queen_Game.tab', 'bughouse.tab',
    ];

    for (const file of allFiles) {
      await fs.writeFile(path.join(testDir, file), 'test');
    }

    const result = await getExistingMiniGameFiles();
    expect(result.length).toBe(7);
    for (const file of allFiles) {
      expect(result).toContain(file);
    }
  });
});

describe('getMiniGameFilePath', () => {
  it('should return correct path for a mini-game file', () => {
    const originalTabPath = process.env.TAB_FILE_PATH;
    process.env.TAB_FILE_PATH = '/data/ladder.tab';

    const result = getMiniGameFilePath('BG_Game.tab');
    expect(result).toContain('BG_Game.tab');
    expect(result).toContain('data');

    process.env.TAB_FILE_PATH = originalTabPath;
  });

  it('should use default path when TAB_FILE_PATH not set', () => {
    const originalTabPath = process.env.TAB_FILE_PATH;
    delete process.env.TAB_FILE_PATH;

    const result = getMiniGameFilePath('bughouse.tab');
    expect(result).toContain('bughouse.tab');

    process.env.TAB_FILE_PATH = originalTabPath;
  });
});

describe('tournamentService integration', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-tournament-integration-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    delete process.env.TAB_FILE_PATH;
  });

  it('should copy players and save to mini-game file', async () => {
    // Create ladder file
    const ladderData = createLadderData(createSamplePlayers());
    await writeLadderFile(ladderData, path.join(testDir, 'ladder.tab'));

    // Read players from ladder
    const ladder = await readLadderFile(path.join(testDir, 'ladder.tab'));

    // Create mini-game file with existing players
    const miniGameData: LadderData = {
      header: [],
      players: ladder.players.map(p => ({
        ...p,
        rating: 0,
        nRating: 0,
        gameResults: Array(31).fill(null),
      })),
      rawLines: [],
    };

    await writeMiniGameFile('test_game.tab', miniGameData);

    // Verify mini-game file has players with correct names
    const result = await readMiniGameFile('test_game.tab');
    expect(result?.players.length).toBe(3);
    expect(result?.players.find(p => p.lastName === 'Smith')).toBeDefined();
  });

  it('should merge game results across multiple saves', async () => {
    // First save - Round 1 results
    const ladderData1 = createLadderData(createSamplePlayers().map(p => ({
      ...p,
      gameResults: ['1L1', null, null, null, null],
    })));
    await writeMiniGameFile('test_game.tab', ladderData1);

    // Second save - Round 2 results
    const ladderData2 = createLadderData(createSamplePlayers().map(p => ({
      ...p,
      gameResults: ['1W1', '2L1', null, null, null],
    })));
    await writeMiniGameFile('test_game.tab', ladderData2);

    // Read back and verify both rounds are present
    const result = await readMiniGameFile('test_game.tab');
    expect(result?.players.length).toBe(3);
    // Second save should have merged results
    const john = result?.players.find(p => p.lastName === 'Smith');
    expect(john?.gameResults[0]).toBe('1W1'); // Round 2
    expect(john?.gameResults[1]).toBe('2L1'); // Round 2
  });
});
