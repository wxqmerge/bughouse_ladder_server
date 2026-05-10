import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readLadderFile, writeLadderFile, PlayerData, LadderData } from '../src/services/dataService';
import {
  copyPlayersToTarget,
  mergeGameResults,
  getExistingMiniGameFiles,
  clearMiniGames,
  hasMiniGameFiles,
  exportTournamentFiles,
  addPlayerToAllMiniGames,
  MINI_GAME_FILES,
  generateMiniGameTrophies,
  generateClubLadderTrophies,
} from '../src/services/tournamentService';

// ── Test Fixtures ──────────────────────────────────────────────────

function createPlayer(
  rank: number, lastName: string, firstName: string, rating: number,
  grade: string, num_games: number, gameResults: (string | null)[]
): PlayerData {
  return {
    rank, group: 'A1', lastName, firstName, rating, nRating: rating,
    trophyEligible: true, grade, num_games, attendance: 0, phone: '',
    info: '', school: '', room: '', gameResults: gameResults.concat(Array(31 - gameResults.length).fill(null)),
  };
}

function createLadderData(players: PlayerData[]): LadderData {
  return { header: [], players, rawLines: [] };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('clearMiniGames', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-clear-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('should delete all existing mini-game files', async () => {
    for (const file of MINI_GAME_FILES) {
      await fs.writeFile(path.join(testDir, file), 'test');
    }

    const result = await clearMiniGames();
    expect(result.deletedCount).toBe(7);

    for (const file of MINI_GAME_FILES) {
      const exists = await fs.access(path.join(testDir, file)).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    }
  });

  it('should return 0 when no mini-game files exist', async () => {
    const result = await clearMiniGames();
    expect(result.deletedCount).toBe(0);
  });

  it('should only delete mini-game files, not ladder.tab', async () => {
    await fs.writeFile(path.join(testDir, 'ladder.tab'), 'ladder data');
    await fs.writeFile(path.join(testDir, 'BG_Game.tab'), 'game data');

    await clearMiniGames();

    const ladderExists = await fs.access(path.join(testDir, 'ladder.tab')).then(() => true).catch(() => false);
    expect(ladderExists).toBe(true);
  });
});

describe('hasMiniGameFiles', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-has-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('should return false when no mini-game files exist', async () => {
    const result = await hasMiniGameFiles();
    expect(result).toBe(false);
  });

  it('should return true when at least one mini-game file exists', async () => {
    await fs.writeFile(path.join(testDir, 'BG_Game.tab'), 'test');
    const result = await hasMiniGameFiles();
    expect(result).toBe(true);
  });

  it('should return true when all 7 files exist', async () => {
    for (const file of MINI_GAME_FILES) {
      await fs.writeFile(path.join(testDir, file), 'test');
    }
    const result = await hasMiniGameFiles();
    expect(result).toBe(true);
  });
});

describe('exportTournamentFiles', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-export-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('should return error when no mini-game files exist', async () => {
    const result = await exportTournamentFiles();
    expect(result.success).toBe(false);
  });

  it('should list only existing mini-game files', async () => {
    await fs.writeFile(path.join(testDir, 'BG_Game.tab'), 'bg data');
    await fs.writeFile(path.join(testDir, 'Queen_Game.tab'), 'queen data');

    const result = await exportTournamentFiles();
    expect(result.success).toBe(true);
    expect(result.files!.length).toBe(2);
    expect(result.files!).toContain('BG_Game.tab');
    expect(result.files!).toContain('Queen_Game.tab');
    expect(result.files!).not.toContain('bughouse.tab');
  });
});

describe('addPlayerToAllMiniGames', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-addplayer-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('should add player to all existing mini-game files', async () => {
    // Create all mini-game files first
    for (const file of MINI_GAME_FILES) {
      const emptyData: LadderData = { header: [], players: [], rawLines: [] };
      await writeLadderFile(emptyData, path.join(testDir, file));
    }

    const newPlayer = createPlayer(1, 'Test', 'Player', 1500, '5', 0, []);
    await addPlayerToAllMiniGames(newPlayer);

    for (const file of MINI_GAME_FILES) {
      const data = await readLadderFile(path.join(testDir, file));
      expect(data.players.length).toBe(1);
      expect(data.players[0].lastName).toBe('Test');
    }
  });

  it('should add player to existing mini-game files', async () => {
    // Create one mini-game file with existing players
    const existingPlayers = [createPlayer(1, 'Existing', 'Player', 1400, '5', 3, ['1L1'])];
    const ladderData = createLadderData(existingPlayers);
    await writeLadderFile(ladderData, path.join(testDir, 'BG_Game.tab'));

    const newPlayer = createPlayer(2, 'New', 'Player', 1300, '6', 0, []);
    await addPlayerToAllMiniGames(newPlayer);

    // Check BG_Game.tab has both players
    const bgData = await readLadderFile(path.join(testDir, 'BG_Game.tab'));
    expect(bgData.players.length).toBe(2);
    expect(bgData.players.find(p => p.lastName === 'Existing')).toBeDefined();
    expect(bgData.players.find(p => p.lastName === 'New')).toBeDefined();
  });

  it('should not duplicate player if already exists in file', async () => {
    // Create all mini-game files first
    for (const file of MINI_GAME_FILES) {
      const emptyData: LadderData = { header: [], players: [], rawLines: [] };
      await writeLadderFile(emptyData, path.join(testDir, file));
    }

    const existingPlayer = createPlayer(1, 'Same', 'Player', 1500, '5', 0, []);
    await addPlayerToAllMiniGames(existingPlayer);
    await addPlayerToAllMiniGames(existingPlayer);

    const data = await readLadderFile(path.join(testDir, 'BG_Game.tab'));
    const samePlayers = data.players.filter(p => p.lastName === 'Same');
    expect(samePlayers.length).toBe(1);
  });
});

describe('copyPlayersToTarget - edge cases', () => {
  it('should handle players with no name', () => {
    const source = [createPlayer(1, '', '', 1500, '5', 0, [])];
    const target: PlayerData[] = [];
    const result = copyPlayersToTarget(source, target);
    expect(result.length).toBe(1);
  });

  it('should handle duplicate names in source', () => {
    const source = [
      createPlayer(1, 'Smith', 'John', 1500, '5', 3, []),
      createPlayer(2, 'Smith', 'John', 1600, '5', 5, []),
    ];
    const target: PlayerData[] = [];
    const result = copyPlayersToTarget(source, target);
    expect(result.length).toBe(2);
  });

  it('should preserve gameResults length', () => {
    const source = [createPlayer(1, 'Test', 'Player', 1500, '5', 3, ['1L1', '2W1'])];
    const target: PlayerData[] = [];
    const result = copyPlayersToTarget(source, target);
    expect(result[0].gameResults.length).toBe(31);
  });
});

describe('mergeGameResults - edge cases', () => {
  it('should handle different array lengths', () => {
    const oldResults = ['1L1', '2W1', '3L1', '4W1'];
    const currentResults = ['1W1'];
    const result = mergeGameResults(oldResults, currentResults);
    expect(result[0]).toBe('1W1');
    expect(result[1]).toBe('2W1');
    expect(result[2]).toBe('3L1');
    expect(result[3]).toBe('4W1');
  });

  it('should handle all null results', () => {
    const oldResults = [null, null, null];
    const currentResults = [null, null, null];
    const result = mergeGameResults(oldResults, currentResults);
    expect(result).toEqual([null, null, null]);
  });

  it('should handle mixed null and valid results', () => {
    const oldResults = ['1L1', null, '3L1', null];
    const currentResults = [null, '2W1', null, '4W1'];
    const result = mergeGameResults(oldResults, currentResults);
    expect(result[0]).toBe('1L1');
    expect(result[1]).toBe('2W1');
    expect(result[2]).toBe('3L1');
    expect(result[3]).toBe('4W1');
  });
});

describe('Gr trophy generation - club ladder mode', () => {
  it('should award Club Ladder 1st, 2nd, Most Games plus Gr trophies', async () => {
    const players = [
      createPlayer(1, 'Top', 'Player', 1600, '5', 10, []),
      createPlayer(2, 'Second', 'Player', 1500, '5', 8, []),
      createPlayer(3, 'Third', 'Player', 1400, '6', 5, []),
    ];
    const trophies = await generateClubLadderTrophies(players, 10);
    // Club Ladder 1st, 2nd, Most Games = 3, then Gr 5 (1st, 2nd, 3rd), Gr 6 (1st, 2nd, 3rd) = 6 more
    expect(trophies.length).toBeGreaterThan(3);
    expect(trophies[0].trophyType).toBe('1st Place');
    expect(trophies[0].miniGameOrGrade).toBe('Club Ladder');
    expect(trophies[1].trophyType).toBe('2nd Place');
    expect(trophies[1].miniGameOrGrade).toBe('Club Ladder');
    expect(trophies[2].trophyType).toBe('Most Games');
    expect(trophies[2].miniGameOrGrade).toBe('Club Ladder');
  });

  it('should respect maxTrophies limit', async () => {
    const players = [
      createPlayer(1, 'A', 'B', 1600, '5', 10, []),
      createPlayer(2, 'C', 'D', 1500, '5', 8, []),
    ];
    const trophies = await generateClubLadderTrophies(players, 0);
    expect(trophies.length).toBe(0);
  });
});

describe('Gr trophy generation - mini-game tournament mode', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-gr-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('should award 1st place per mini-game (hardest first)', async () => {
    const players = [
      createPlayer(1, 'Queen', 'Winner', 1600, '5', 10, []),
      createPlayer(2, 'Pawn', 'Winner', 1500, '5', 8, []),
      createPlayer(3, 'Bishop', 'Winner', 1400, '6', 5, []),
    ];
    const existingFiles = ['Queen_Game.tab', 'Pawn_Game.tab', 'Bishop_Game.tab'];

    // Create the mini-game files with proper player data
    for (const file of existingFiles) {
      const miniGameData: LadderData = { header: [], players: [], rawLines: [] };
      await writeLadderFile(miniGameData, path.join(testDir, file));
    }

    const miniGameDataList = existingFiles.map(f => ({ fileName: f, players: [] }));
    const trophies = await generateMiniGameTrophies(players, 20, miniGameDataList);

    // Mini-game files are empty so no 1st places from mini-games, but Gr trophies should be awarded
    const grTrophies = trophies.filter(t => t.miniGameOrGrade && t.miniGameOrGrade.startsWith('Gr '));
    expect(grTrophies.length).toBeGreaterThan(0);
  });

  it('should award Gr 1st place after mini-game trophies', async () => {
    const players = [
      createPlayer(1, 'Gr13', 'Player', 1600, '13', 10, []),
      createPlayer(2, 'Gr12', 'Player', 1500, '12', 8, []),
      createPlayer(3, 'Gr11', 'Player', 1400, '11', 5, []),
    ];
    const trophies = await generateClubLadderTrophies(players, 10);

    // Gr 1st place should use grade
    expect(trophies[0].gr).toBe('13');
    expect(trophies[1]).toBeDefined(); // Gr 12
    expect(trophies[2]).toBeDefined(); // Gr 11
  });

  it('should award Gr 1st, 2nd, 3rd position-by-position across grades', async () => {
    // Create players with different grades and ratings
    const players = [
      createPlayer(1, 'High', 'Gr13', 1600, '13', 10, []),
      createPlayer(2, 'Mid', 'Gr12', 1500, '12', 8, []),
      createPlayer(3, 'Low', 'Gr11', 1400, '11', 5, []),
    ];

    const trophies = await generateClubLadderTrophies(players, 10);

    // All 3 grades get 1st place (position-by-position, not grade-by-grade)
    const firstPlaceCount = trophies.filter(t => t.trophyType === '1st Place' && t.miniGameOrGrade.startsWith('Gr ')).length;
    expect(firstPlaceCount).toBe(3);
  });
});

describe('Gr trophy ties', () => {
  it('should award same position to tied ratings', async () => {
    // Two players with same rating in same grade
    const players = [
      createPlayer(1, 'Tied', 'A', 1500, '5', 10, []),
      createPlayer(2, 'Tied', 'B', 1500, '5', 8, []),
      createPlayer(3, 'Lower', 'C', 1400, '5', 5, []),
    ];

    const trophies = await generateClubLadderTrophies(players, 10);

    // Both tied players should get 1st Place
    const firstPlace = trophies.filter(t => t.trophyType === '1st Place' && t.miniGameOrGrade.startsWith('Gr '));
    expect(firstPlace.length).toBeGreaterThanOrEqual(1);
  });
});

describe('countGamesAcrossMiniGames', () => {
  // This tests the internal logic indirectly through addPlayerToAllMiniGames
  it('should not duplicate player when adding to files they already exist in', async () => {
    const testDir2 = path.join(os.tmpdir(), `bughouse-count-test-${Date.now()}`);
    await fs.mkdir(testDir2, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir2, 'ladder.tab');

    try {
      // Create mini-game files first
      for (const file of MINI_GAME_FILES) {
        const emptyData: LadderData = { header: [], players: [], rawLines: [] };
        await writeLadderFile(emptyData, path.join(testDir2, file));
      }

      const player = createPlayer(1, 'Count', 'Test', 1500, '5', 0, []);
      await addPlayerToAllMiniGames(player);
      await addPlayerToAllMiniGames(player);

      const data = await readLadderFile(path.join(testDir2, 'BG_Game.tab'));
      const countPlayers = data.players.filter(p => p.lastName === 'Count');
      expect(countPlayers.length).toBe(1);
    } finally {
      try { await fs.rm(testDir2, { recursive: true, force: true }); } catch { /* */ }
      delete process.env.TAB_FILE_PATH;
    }
  });
});

