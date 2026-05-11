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
import { debugLine } from '../../shared/utils/trophyGeneration';
import { calculateRatings, repopulateGameResults, processGameResults } from '../../shared/utils/hashUtils';
import type { MatchData } from '../../shared/types';
import { mulberry32, determineResult, generateBatchGames } from '../../src/test/shared/stressTestUtils';

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
  it('should award Club Ladder 1st, 2nd, 3rd place by rating', async () => {
    const players = [
      createPlayer(1, 'Top', 'Player', 1600, '5', 10, []),
      createPlayer(2, 'Second', 'Player', 1500, '5', 8, []),
      createPlayer(3, 'Third', 'Player', 1400, '6', 5, []),
    ];
    const trophies = await generateClubLadderTrophies(players, 10);
    // 3 players all get overall position trophies; Most Games skipped (Top Player already has 1st), Gr trophies skipped (all players already have trophies)
    expect(trophies.length).toBe(3);
    expect(trophies[0].trophyType).toBe('1st Place');
    expect(trophies[0].miniGameOrGrade).toBe('Club Ladder');
    expect(trophies[1].trophyType).toBe('2nd Place');
    expect(trophies[1].miniGameOrGrade).toBe('Club Ladder');
    expect(trophies[2].trophyType).toBe('3rd Place');
    expect(trophies[2].miniGameOrGrade).toBe('Club Ladder');
  });

  it('should award overall position trophies even when maxTrophies is 0', async () => {
    const players = [
      createPlayer(1, 'A', 'B', 1600, '5', 10, []),
      createPlayer(2, 'C', 'D', 1500, '5', 8, []),
    ];
    const trophies = await generateClubLadderTrophies(players, 0);
    // Steps 1-4 (1st, 2nd, 3rd, Most Games) always run regardless of maxTrophies; only Gr trophies check maxTrophies
    expect(trophies.length).toBe(2);
    expect(trophies[0].trophyType).toBe('1st Place');
    expect(trophies[1].trophyType).toBe('2nd Place');
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

    // Mini-game files are empty so no trophies awarded at all (no grade trophies in mini-game mode)
    expect(trophies.length).toBe(0);
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

  it('should award overall positions before grade positions', async () => {
    // Create players with different grades and ratings
    const players = [
      createPlayer(1, 'High', 'Gr13', 1600, '13', 10, []),
      createPlayer(2, 'Mid', 'Gr12', 1500, '12', 8, []),
      createPlayer(3, 'Low', 'Gr11', 1400, '11', 5, []),
    ];

    const trophies = await generateClubLadderTrophies(players, 10);

    // All 3 players get overall position trophies (1st, 2nd, 3rd); Gr trophies not awarded because all players already have trophies
    expect(trophies.length).toBe(3);
    expect(trophies[0].trophyType).toBe('1st Place');
    expect(trophies[0].miniGameOrGrade).toBe('Club Ladder');
    expect(trophies[1].trophyType).toBe('2nd Place');
    expect(trophies[2].trophyType).toBe('3rd Place');
    // No Gr trophies - players already received overall position trophies
    const grTrophies = trophies.filter(t => t.miniGameOrGrade && t.miniGameOrGrade.startsWith('Gr '));
    expect(grTrophies.length).toBe(0);
  });
});

describe('Gr trophy ties', () => {
  it('should rank tied players by their sort order and award overall positions', async () => {
    // Two players with same rating in same grade
    const players = [
      createPlayer(1, 'Tied', 'A', 1500, '5', 10, []),
      createPlayer(2, 'Tied', 'B', 1500, '5', 8, []),
      createPlayer(3, 'Lower', 'C', 1400, '5', 5, []),
    ];

    const trophies = await generateClubLadderTrophies(players, 10);

    // Tied A gets 1st Place, Tied B gets 2nd Place, Lower C gets 3rd Place
    // No Gr trophies since all players already have overall position trophies
    expect(trophies.length).toBe(3);
    expect(trophies[0].trophyType).toBe('1st Place');
    expect(trophies[0].player).toBe('A Tied');
    expect(trophies[1].trophyType).toBe('2nd Place');
    expect(trophies[2].trophyType).toBe('3rd Place');
    const grTrophies = trophies.filter(t => t.miniGameOrGrade && t.miniGameOrGrade.startsWith('Gr '));
    expect(grTrophies.length).toBe(0);
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

describe('Mini-game trophy stress test', () => {
  const outputDir = path.join(__dirname, '..', 'output', 'stress-test');
  const JSZip = require('jszip');

  function generatePlayersForMiniGame(rng: () => number, numPlayers: number): PlayerData[] {
    const players: PlayerData[] = [];
    for (let i = 1; i <= numPlayers; i++) {
      const rating = 1200 + Math.floor(rng() * 600);
      const grade = (5 + Math.floor(rng() * 9)).toString();
      players.push({
        rank: i,
        group: 'A',
        lastName: `Player${i}`,
        firstName: '',
        rating,
        nRating: 0,
        trophyEligible: true,
        grade,
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: Array(31).fill(null),
      });
    }
    return players;
  }

  function generateMiniGameFile(numPlayers: number, numRounds: number, seed: number): PlayerData[] {
    const rng = mulberry32(seed);
    const players = generatePlayersForMiniGame(rng, numPlayers);

    // Build startRatings map from initial player ratings
    const startRatings = new Map<number, number>();
    for (const p of players) {
      startRatings.set(p.rank, p.rating);
    }

    const allMatches: MatchData[] = [];
    for (let round = 0; round < numRounds; round++) {
      const batchGames = generateBatchGames(players, '4p', rng, round, startRatings);
      if (batchGames.length === 0) continue;
      allMatches.push(...batchGames);
    }

    if (allMatches.length === 0) {
      // Generate at least one round of 2p games
      const rng2 = mulberry32(seed + 999);
      const players2 = generatePlayersForMiniGame(rng2, numPlayers);
      const startRatings2 = new Map<number, number>();
      for (const p of players2) {
        startRatings2.set(p.rank, p.rating);
      }
      const games2 = generateBatchGames(players2, '2p', rng2, 0, startRatings2);
      if (games2.length > 0) {
        allMatches.push(...games2);
      }
    }

    const withResults = repopulateGameResults(players, allMatches, 31);
    const ratedPlayers = calculateRatings(withResults, allMatches).players;

    // Count games played
    const gamesPlayed = new Map<number, number>();
    for (const m of allMatches) {
      gamesPlayed.set(m.player1, (gamesPlayed.get(m.player1) ?? 0) + 1);
      gamesPlayed.set(m.player2, (gamesPlayed.get(m.player2) ?? 0) + 1);
      if (m.player3 > 0) gamesPlayed.set(m.player3, (gamesPlayed.get(m.player3) ?? 0) + 1);
      if (m.player4 > 0) gamesPlayed.set(m.player4, (gamesPlayed.get(m.player4) ?? 0) + 1);
    }
    for (const p of ratedPlayers) {
      p.num_games = gamesPlayed.get(p.rank) ?? 0;
    }

    return ratedPlayers;
  }

  it('should generate correct trophies for 50 players across 6 mini-games', async () => {
    await fs.mkdir(outputDir, { recursive: true });

    const testDir = path.join(outputDir, 'data');
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');

    try {
      // Generate 6 mini-game files with valid game entries using rating stress test approach
      const miniGameFiles = [
        'Queen_Game.tab',
        'Pawn_Game.tab',
        'Pillar_Game.tab',
        'Bishop_Game.tab',
        'BG_Game.tab',
        'bughouse.tab',
      ];

      const miniGamePlayers: Record<string, PlayerData[]> = {};
      let seed = 42;
      for (const fileName of miniGameFiles) {
        const players = generateMiniGameFile(50, 15, seed);
        miniGamePlayers[fileName] = players;
        const ladderData: LadderData = { header: [], players, rawLines: [] };
        await writeLadderFile(ladderData, path.join(testDir, fileName));
        seed += 100;
      }

      // Create club ladder file using first mini-game's players
      const clubLadderData: LadderData = { header: [], players: miniGamePlayers[miniGameFiles[0]], rawLines: [] };
      await writeLadderFile(clubLadderData, path.join(testDir, 'ladder.tab'));

      // Create ZIP file
      const zip = new JSZip();
      for (const fileName of miniGameFiles) {
        const fileContent = await fs.readFile(path.join(testDir, fileName), 'utf-8');
        zip.file(fileName, fileContent);
      }
      const zipBlob = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
      await fs.writeFile(path.join(outputDir, 'tournament.zip'), zipBlob);

      // Verify ZIP file exists and has correct structure
      const zipExists = await fs.access(path.join(outputDir, 'tournament.zip')).then(() => true).catch(() => false);
      expect(zipExists).toBe(true);

      // Verify club ladder file exists
      const ladderExists = await fs.access(path.join(testDir, 'ladder.tab')).then(() => true).catch(() => false);
      expect(ladderExists).toBe(true);

      // Copy club ladder to output dir
      await fs.copyFile(path.join(testDir, 'ladder.tab'), path.join(outputDir, 'ladder.tab'));

      // Build MiniGameData array for shared trophy generation
      const miniGameDataList: { fileName: string; players: PlayerData[] }[] = [];
      for (const fileName of miniGameFiles) {
        const players = miniGamePlayers[fileName];
        const playersWithGames = players.filter(p =>
          p.gameResults && p.gameResults.some(r => r && r !== '' && r !== '_')
        );
        if (playersWithGames.length > 0) {
          miniGameDataList.push({ fileName, players });
        }
      }

      // Run mini-game trophy generation (shared function — generates 1st, 2nd, and grade trophies)
      const clubPlayers = miniGamePlayers[miniGameFiles[0]];
      const maxTrophies = Math.ceil(clubPlayers.length / 3);
      const miniGameTrophies = generateMiniGameTrophies(clubPlayers, maxTrophies, miniGameDataList);

      // Verify Kings_Cross is not in any trophy
      const kingsCrossTrophies = miniGameTrophies.filter(t => t.miniGameOrGrade === 'Kings_Cross');
      expect(kingsCrossTrophies.length).toBe(0);

      // Verify we have exactly 6 first-place trophies (one per mini-game, not counting grade trophies)
      const miniGameFirstPlaceTrophies = miniGameTrophies.filter(t => t.trophyType === '1st Place' && !t.miniGameOrGrade?.startsWith('Gr '));
      expect(miniGameFirstPlaceTrophies.length).toBe(6);

      // Verify all trophy player names are valid
      for (const trophy of miniGameTrophies) {
        expect(trophy.player).toMatch(/Player\d+$/);
      }

      // Verify trophy ranks are sequential
      for (let i = 0; i < miniGameTrophies.length; i++) {
        expect(miniGameTrophies[i].rank).toBe(i + 1);
      }

      // Verify the ZIP file can be extracted and contains correct files
      const extractedZip = await JSZip.loadAsync(zipBlob);
      const zipFileNames = Object.keys(extractedZip.files).sort();
      for (const fileName of miniGameFiles) {
        expect(zipFileNames).toContain(fileName);
      }
      expect(zipFileNames).not.toContain('Kings_Cross.tab');

      // Verify each mini-game file in ZIP has 50 players
      for (const fileName of miniGameFiles) {
        const fileContent = await extractedZip.file(fileName)?.async('string');
        expect(fileContent).toBeDefined();
        const lines = fileContent!.trim().split('\n');
        expect(lines.length).toBe(51); // 1 header + 50 players
      }

      // Generate trophy report file (matches GUI format exactly with debug info)
      // Mini-game mode: only mini-game trophies, no club ladder section
      const trophyReportLines: string[] = [];
      
      // Debug section (matches server generateTrophyReport debug output)
      const numClubPlayers = miniGamePlayers[miniGameFiles[0]].length;
      trophyReportLines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
      trophyReportLines.push(debugLine('Players', String(numClubPlayers), '', '', '', '', '', ''));
      trophyReportLines.push(debugLine('Max Trophies', `${maxTrophies} (ceil(${numClubPlayers} / 3))`, '', '', '', '', '', ''));
      trophyReportLines.push('');
      
      const numMiniGames = miniGameFiles.length;
      const award2nd = maxTrophies > numMiniGames;
      const awardGrade1st = maxTrophies > 2 * numMiniGames;
      trophyReportLines.push(debugLine('Mode', 'Mini-Game Tournament', '', '', '', '', '', ''));
      trophyReportLines.push(debugLine('Mini-games played', String(numMiniGames), '', '', '', '', '', ''));
      trophyReportLines.push(debugLine('Award 2nd place', `t=${maxTrophies} > m=${numMiniGames} ? ${award2nd}`, '', '', '', '', '', ''));
      trophyReportLines.push(debugLine('Award grade 1st', `t=${maxTrophies} > 2*m=${2 * numMiniGames} ? ${awardGrade1st}`, '', '', '', '', '', ''));
      trophyReportLines.push('');
      
      // Mini-game player debug section
      trophyReportLines.push(debugLine('MINI-GAME PLAYERS', '(after 5 recalcs)', '', '', '', '', '', ''));
      for (const fileName of miniGameFiles) {
        const players = miniGamePlayers[fileName];
        const playersWithGames = players.filter(p =>
          p.gameResults && p.gameResults.some(r => r && r !== '' && r !== '_')
        );
        if (playersWithGames.length === 0) continue;
        
        const sorted = playersWithGames.sort((a, b) => b.nRating - a.nRating).slice(0, 5);
        trophyReportLines.push('');
        trophyReportLines.push(debugLine(fileName.replace('.tab', ''), '', '', '', '', '', '', ''));
        for (const p of sorted) {
          const games = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
          trophyReportLines.push(debugLine(String(p.rank), `${p.lastName} ${p.firstName}`, p.grade, String(p.nRating), '', '', String(games), ''));
        }
      }
      
      trophyReportLines.push('');
      trophyReportLines.push('AWARDED TROPHIES');
      trophyReportLines.push('Rank\tPlayer\tTrophy Type\tMini-Game/Grade\tGr\tRating\tTotal Games\tGames Played');
      
      let blankRowInserted = false;
      for (const trophy of miniGameTrophies) {
        if (!blankRowInserted && trophy.trophyType === '1st Place' && trophy.miniGameOrGrade && trophy.miniGameOrGrade.startsWith('Gr ')) {
          trophyReportLines.push('');
          blankRowInserted = true;
        }
        trophyReportLines.push(`${trophy.rank}\t${trophy.player}\t${trophy.trophyType}\t${trophy.miniGameOrGrade}\t${trophy.gr}\t${trophy.rating}\t${trophy.totalGames || 0}\t${trophy.gamesPlayed}`);
      }
      
      await fs.writeFile(path.join(outputDir, 'tournament_trophies.tab'), trophyReportLines.join('\n') + '\n');

      console.log(`[STRESS TEST] Output files saved to: ${outputDir}`);
      console.log(`[STRESS TEST] Files: tournament.zip, ladder.tab, tournament_trophies.tab`);

    } finally {
      delete process.env.TAB_FILE_PATH;
    }
  });
});

describe('Mini-game trophy stress test — club ladder mode', () => {
  const outputDir = path.join(__dirname, '..', 'output', 'stress-test');
  const JSZip = require('jszip');

  function generateClubLadderPlayers(rng: () => number, numPlayers: number, numRounds: number): PlayerData[] {
    const players: PlayerData[] = [];
    for (let i = 1; i <= numPlayers; i++) {
      const rating = 1200 + Math.floor(rng() * 600);
      const grade = (5 + Math.floor(rng() * 9)).toString();
      players.push({
        rank: i,
        group: 'A',
        lastName: `Player${i}`,
        firstName: '',
        rating,
        nRating: 0,
        trophyEligible: true,
        grade,
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: Array(31).fill(null),
      });
    }

    const startRatings = new Map<number, number>();
    for (const p of players) {
      startRatings.set(p.rank, p.rating);
    }

    const allMatches: MatchData[] = [];
    for (let round = 0; round < numRounds; round++) {
      const batchGames = generateBatchGames(players, '4p', rng, round, startRatings);
      if (batchGames.length === 0) continue;
      allMatches.push(...batchGames);
    }

    const withResults = repopulateGameResults(players, allMatches, 31);
    const ratedPlayers = calculateRatings(withResults, allMatches).players;

    const gamesPlayed = new Map<number, number>();
    for (const m of allMatches) {
      gamesPlayed.set(m.player1, (gamesPlayed.get(m.player1) ?? 0) + 1);
      gamesPlayed.set(m.player2, (gamesPlayed.get(m.player2) ?? 0) + 1);
      if (m.player3 > 0) gamesPlayed.set(m.player3, (gamesPlayed.get(m.player3) ?? 0) + 1);
      if (m.player4 > 0) gamesPlayed.set(m.player4, (gamesPlayed.get(m.player4) ?? 0) + 1);
    }
    for (const p of ratedPlayers) {
      p.num_games = gamesPlayed.get(p.rank) ?? 0;
    }

    return ratedPlayers;
  }

  it('should generate club ladder trophy report (no mini-games)', async () => {
    await fs.mkdir(outputDir, { recursive: true });

    const rng = mulberry32(999);
    const players = generateClubLadderPlayers(rng, 50, 15);
    const maxTrophies = Math.ceil(players.length / 3);

    const clubTrophies = generateClubLadderTrophies(players, maxTrophies);

    // Generate trophy report file (matches GUI format exactly with debug info)
    const trophyReportLines: string[] = [];
    
    // Debug section (matches server generateTrophyReport debug output)
    trophyReportLines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
    trophyReportLines.push(debugLine('Players', String(players.length), '', '', '', '', '', ''));
    trophyReportLines.push(debugLine('Max Trophies', `${maxTrophies} (ceil(${players.length} / 3))`, '', '', '', '', '', ''));
    trophyReportLines.push('');
    trophyReportLines.push(debugLine('Mode', 'Club Ladder (no mini-game files)', '', '', '', '', '', ''));
    
    trophyReportLines.push('');
    trophyReportLines.push('AWARDED TROPHIES');
    trophyReportLines.push('Rank\tPlayer\tTrophy Type\tMini-Game/Grade\tGr\tRating\tTotal Games\tGames Played');
    
    let blankRowInserted = false;
    for (const trophy of clubTrophies) {
      if (!blankRowInserted && trophy.trophyType === '1st Place' && trophy.miniGameOrGrade && trophy.miniGameOrGrade.startsWith('Gr ')) {
        trophyReportLines.push('');
        blankRowInserted = true;
      }
      trophyReportLines.push(`${trophy.rank}\t${trophy.player}\t${trophy.trophyType}\t${trophy.miniGameOrGrade}\t${trophy.gr}\t${trophy.rating}\t${trophy.totalGames || 0}\t${trophy.gamesPlayed}`);
    }
    
    await fs.writeFile(path.join(outputDir, 'club_ladder_trophies.tab'), trophyReportLines.join('\n') + '\n');

    console.log(`[CLUB LADDER TROPHY REPORT] Saved to: ${path.join(outputDir, 'club_ladder_trophies.tab')}`);

    expect(clubTrophies.length).toBeGreaterThan(0);
    expect(clubTrophies[0].trophyType).toBe('1st Place');
    expect(clubTrophies[0].miniGameOrGrade).toBe('Club Ladder');
  });
});

