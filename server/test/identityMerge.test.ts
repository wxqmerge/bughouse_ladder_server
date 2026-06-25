import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readLadderFile, writeLadderFile, PlayerData, LadderData, clearLadderCache } from '../src/services/dataService';
import {
  readMiniGameFile,
  readMiniGameFileRaw,
  writeMiniGameFile,
  clearMiniGameCache,
  addPlayerToAllMiniGames,
  MINI_GAME_FILES,
} from '../src/services/tournamentService';

function makePlayer(overrides: Partial<PlayerData>): PlayerData {
  return {
    rank: 1,
    group: 'A',
    lastName: 'Smith',
    firstName: 'John',
    rating: 1200,
    nRating: 1200,
    trophyEligible: true,
    grade: '5',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
    ...overrides,
  };
}

describe('readMiniGameFile identity merge', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-identity-read-${Date.now()}`);

  beforeEach(async () => {
    clearMiniGameCache();
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('merges club ladder identity on read', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    // Create club ladder with player
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'ClubName', rating: 1300 })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    // Create mini-game with different identity
    const mgPlayers = [makePlayer({ rank: 1, lastName: 'MiniName', rating: 1100, nRating: 1500 })];
    await writeLadderFile(
      { header: [], players: mgPlayers, rawLines: [] },
      path.join(testDir, 'bg_game.tab')
    );

    // Read merged
    const merged = await readMiniGameFile('bg_game.tab');
    expect(merged).not.toBeNull();
    expect(merged!.players[0].lastName).toBe('ClubName');
    expect(merged!.players[0].rating).toBe(1300);
    expect(merged!.players[0].nRating).toBe(1500);
  });

  it('returns raw data when club ladder does not exist', async () => {
    // Only create mini-game file, no club ladder
    const mgPlayers = [makePlayer({ rank: 1, lastName: 'MiniName', nRating: 1500 })];
    await writeLadderFile(
      { header: [], players: mgPlayers, rawLines: [] },
      path.join(testDir, 'bg_game.tab')
    );

    const merged = await readMiniGameFile('bg_game.tab');
    expect(merged).not.toBeNull();
    expect(merged!.players[0].lastName).toBe('MiniName');
    expect(merged!.players[0].nRating).toBe(1500);
  });

  it('readMiniGameFileRaw bypasses identity merge', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    // Create club ladder
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'ClubName', rating: 1300 })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    // Create mini-game with different identity
    const mgPlayers = [makePlayer({ rank: 1, lastName: 'MiniName', nRating: 1500 })];
    await writeLadderFile(
      { header: [], players: mgPlayers, rawLines: [] },
      path.join(testDir, 'bg_game.tab')
    );

    const raw = await readMiniGameFileRaw('bg_game.tab');
    expect(raw).not.toBeNull();
    expect(raw!.players[0].lastName).toBe('MiniName');
  });

  it('returns null for non-existent mini-game file', async () => {
    const result = await readMiniGameFile('queen_game.tab');
    expect(result).toBeNull();
  });

  it('respects cache TTL', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'ClubName' })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    const mgPlayers = [makePlayer({ rank: 1, lastName: 'MiniName', nRating: 1500 })];
    await writeLadderFile(
      { header: [], players: mgPlayers, rawLines: [] },
      path.join(testDir, 'bg_game.tab')
    );

    // First read
    const first = await readMiniGameFile('bg_game.tab');
    expect(first!.players[0].lastName).toBe('ClubName');

    // Update club ladder
    clubPlayers[0].lastName = 'UpdatedName';
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    // Second read: mini-game cache still has raw data, but identity merge runs fresh each call
    // so it picks up the updated club ladder
    const second = await readMiniGameFile('bg_game.tab');
    expect(second!.players[0].lastName).toBe('UpdatedName');

    // Clear cache and re-read
    clearMiniGameCache();
    const third = await readMiniGameFile('bg_game.tab');
    expect(third!.players[0].lastName).toBe('UpdatedName');
  });
});

describe('writeMiniGameFile identity split', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-identity-write-${Date.now()}`);

  beforeEach(async () => {
    clearMiniGameCache();
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('splits identity changes to club ladder', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    // Create club ladder
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'Original', rating: 1200 })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    // Write mini-game with identity change
    const mgPlayers = [makePlayer({ rank: 1, lastName: 'Edited', rating: 1200, nRating: 1500, gameResults: ['W', 'L', null] })];
    const result = await writeMiniGameFile('bg_game.tab', {
      header: [],
      players: mgPlayers,
      rawLines: [],
    });

    expect(result.identityUpdates.length).toBe(1);
    expect(result.identityUpdates[0].lastName).toBe('Edited');
    expect(result.miniGameWritten).toBe(true);

    // Verify club ladder was updated
    const updatedClub = await readLadderFile(path.join(testDir, 'ladder.tab'));
    expect(updatedClub.players[0].lastName).toBe('Edited');

    // Verify mini-game file has club identity + original nRating/gameResults
    const raw = await readMiniGameFileRaw('bg_game.tab');
    // Mini-game file gets club identity (Original), not the incoming edit
    expect(raw!.players[0].lastName).toBe('Original');
    expect(raw!.players[0].nRating).toBe(1500);
    expect(raw!.players[0].gameResults[0]).toBe('W');
    expect(raw!.players[0].gameResults[1]).toBe('L');
    expect(raw!.players[0].gameResults[2]).toBeNull();

    // Club ladder gets the identity update (already verified above)
  });

  it('no identity updates when identity unchanged', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    const mgPlayers = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200, nRating: 1500 })];
    const result = await writeMiniGameFile('bg_game.tab', {
      header: [],
      players: mgPlayers,
      rawLines: [],
    });

    expect(result.identityUpdates.length).toBe(0);
  });

  it('writes as-is when club ladder does not exist', async () => {
    const mgPlayers = [makePlayer({ rank: 1, lastName: 'MiniName', nRating: 1500 })];
    const result = await writeMiniGameFile('bg_game.tab', {
      header: [],
      players: mgPlayers,
      rawLines: [],
    });

    expect(result.identityUpdates.length).toBe(0);
    expect(result.miniGameWritten).toBe(true);

    const raw = await readMiniGameFileRaw('bg_game.tab');
    expect(raw!.players[0].lastName).toBe('MiniName');
  });

  it('handles multiple identity changes', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    const clubPlayers = [
      makePlayer({ rank: 1, lastName: 'A', rating: 1200 }),
      makePlayer({ rank: 2, lastName: 'B', rating: 1300 }),
    ];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    const mgPlayers = [
      makePlayer({ rank: 1, lastName: 'A_Changed', rating: 1200, nRating: 1500 }),
      makePlayer({ rank: 2, lastName: 'B_Changed', rating: 1300, nRating: 1600 }),
    ];
    const result = await writeMiniGameFile('bg_game.tab', {
      header: [],
      players: mgPlayers,
      rawLines: [],
    });

    expect(result.identityUpdates.length).toBe(2);

    const updatedClub = await readLadderFile(path.join(testDir, 'ladder.tab'));
    expect(updatedClub.players[0].lastName).toBe('A_Changed');
    expect(updatedClub.players[1].lastName).toBe('B_Changed');
  });
});

describe('addPlayerToAllMiniGames with identity merge', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-addplayer-identity-${Date.now()}`);

  beforeEach(async () => {
    clearMiniGameCache();
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('adds player and writes to mini-game without club ladder', async () => {
    // Create mini-game files
    for (const file of MINI_GAME_FILES) {
      await writeLadderFile(
        { header: [], players: [], rawLines: [] },
        path.join(testDir, file)
      );
    }

    const newPlayer = makePlayer({ rank: 1, lastName: 'New', firstName: 'Player' });
    await addPlayerToAllMiniGames(newPlayer);

    for (const file of MINI_GAME_FILES) {
      const raw = await readMiniGameFileRaw(file);
      expect(raw).not.toBeNull();
      expect(raw!.players.length).toBe(1);
      expect(raw!.players[0].lastName).toBe('New');
    }
  });

  it('adds player and updates club ladder identity', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    // Create club ladder
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'ClubName' })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    // Create mini-game files
    for (const file of MINI_GAME_FILES) {
      await writeLadderFile(
        { header: [], players: [], rawLines: [] },
        path.join(testDir, file)
      );
    }

    const newPlayer = makePlayer({ rank: 1, lastName: 'New', firstName: 'Player' });
    await addPlayerToAllMiniGames(newPlayer);

    // Club ladder should be updated with the new player's identity
    const updatedClub = await readLadderFile(path.join(testDir, 'ladder.tab'));
    // The player already exists in club ladder with rank 1, so identity gets updated
    expect(updatedClub.players[0].lastName).toBe('New');
  });
});

describe('round-trip: read merge -> edit -> write split', () => {
  const testDir = path.join(os.tmpdir(), `bughouse-roundtrip-${Date.now()}`);

  beforeEach(async () => {
    clearMiniGameCache();
    await fs.mkdir(testDir, { recursive: true });
    process.env.TAB_FILE_PATH = path.join(testDir, 'ladder.tab');
  });

  afterEach(async () => {
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* */ }
    delete process.env.TAB_FILE_PATH;
  });

  it('full round-trip preserves data correctly', async () => {
    const clubLadderPath = path.join(testDir, 'ladder.tab');
    // Setup: club ladder + mini-game
    const clubPlayers = [makePlayer({ rank: 1, lastName: 'Club', rating: 1200 })];
    await writeLadderFile({ header: [], players: clubPlayers, rawLines: [] }, clubLadderPath);

    const mgPlayers = [makePlayer({ rank: 1, lastName: 'Mini', nRating: 1500, gameResults: ['W', 'L'] })];
    await writeLadderFile(
      { header: [], players: mgPlayers, rawLines: [] },
      path.join(testDir, 'bg_game.tab')
    );

    // Step 1: Read (merged)
    clearMiniGameCache();
    const merged = await readMiniGameFile('bg_game.tab');
    expect(merged).not.toBeNull();
    expect(merged!.players[0].lastName).toBe('Club');
    expect(merged!.players[0].nRating).toBe(1500);
    expect(merged!.players[0].gameResults[0]).toBe('W');
    expect(merged!.players[0].gameResults[1]).toBe('L');

    // Step 2: User edits name
    merged!.players[0].lastName = 'Edited';

    // Step 3: Write (split)
    const result = await writeMiniGameFile('bg_game.tab', merged!);
    expect(result.identityUpdates.length).toBe(1);
    expect(result.identityUpdates[0].lastName).toBe('Edited');

    // Step 4: Verify club ladder updated
    const updatedClub = await readLadderFile(path.join(testDir, 'ladder.tab'));
    expect(updatedClub.players[0].lastName).toBe('Edited');

    // Step 5: Read again — should show updated identity
    clearMiniGameCache();
    const reRead = await readMiniGameFile('bg_game.tab');
    expect(reRead!.players[0].lastName).toBe('Edited');
    expect(reRead!.players[0].nRating).toBe(1500);
    expect(reRead!.players[0].gameResults[0]).toBe('W');
    expect(reRead!.players[0].gameResults[1]).toBe('L');
  });
});
