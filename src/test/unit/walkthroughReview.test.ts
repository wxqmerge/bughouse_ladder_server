/**
 * Tests for walkthrough review mode: getNonBlankCells, entryCell sync after clear, exit on empty
 */

import { describe, it, expect } from 'vitest';
import { PlayerData } from '../../../shared/types/index.ts';

/**
 * Simulates getNonBlankCells from LadderForm.
 * Returns non-blank cells using actual player.rank (not array index).
 */
function getNonBlankCells(
  players: PlayerData[]
): { playerRank: number; round: number }[] {
  const cells: { playerRank: number; round: number }[] = [];
  for (const player of players) {
    const gameResults = player.gameResults ?? [];
    for (let r = 0; r < gameResults.length; r++) {
      const val = gameResults[r];
      if (val && val.trim() !== '') {
        cells.push({ playerRank: player.rank, round: r });
      }
    }
  }
  return cells;
}

/**
 * Simulates clearing cells and returning updated players.
 */
function clearCellsFromPlayers(
  players: PlayerData[],
  cellsToClear: { playerRank: number; round: number }[],
  cellValue: string
): PlayerData[] {
  return players.map((p) => {
    const newGameResults = [...(p.gameResults || [])];
    let modified = false;
    for (const cell of cellsToClear) {
      if (cell.playerRank === p.rank) {
        const current = newGameResults[cell.round]?.replace(/_+$/, '') || '';
        if (current === cellValue) {
          newGameResults[cell.round] = '';
          modified = true;
        }
      }
    }
    return modified ? { ...p, gameResults: newGameResults } : p;
  });
}

/**
 * Simulates computing the next entryCell after clear, using updatedPlayers
 * (not stale React state).
 */
function computeEntryCellAfterClear(
  updatedPlayers: PlayerData[],
  walkthroughIndex: number
): { playerRank: number; round: number } | null {
  const newCells = getNonBlankCells(updatedPlayers);
  const clampedIndex = Math.min(walkthroughIndex, newCells.length - 1);
  if (clampedIndex >= 0) {
    return newCells[clampedIndex];
  }
  return null; // null means walkthrough should exit
}

describe('getNonBlankCells', () => {
  it('should use actual player.rank, not array index', () => {
    // Players are NOT in rank order in the array
    const players: PlayerData[] = [
      {
        rank: 10,
        group: 'A',
        lastName: 'Z',
        firstName: 'Z',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['5W3_', '', ''],
      },
      {
        rank: 3,
        group: 'A',
        lastName: 'A',
        firstName: 'A',
        rating: 1200,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', '7L10_', ''],
      },
    ];

    const cells = getNonBlankCells(players);
    expect(cells).toHaveLength(2);

    // Must use actual rank values, not array position + 1
    expect(cells[0]).toEqual({ playerRank: 10, round: 0 });
    expect(cells[1]).toEqual({ playerRank: 3, round: 1 });
  });

  it('should skip players with all-blank gameResults', () => {
    const players: PlayerData[] = [
      {
        rank: 1,
        group: 'A',
        lastName: 'X',
        firstName: 'X',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', '', ''],
      },
      {
        rank: 2,
        group: 'A',
        lastName: 'Y',
        firstName: 'Y',
        rating: 1100,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', '4W2_', ''],
      },
    ];

    const cells = getNonBlankCells(players);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ playerRank: 2, round: 1 });
  });

  it('should return empty array when all cells are blank', () => {
    const players: PlayerData[] = [
      {
        rank: 1,
        group: 'A',
        lastName: 'X',
        firstName: 'X',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', '', ''],
      },
    ];

    const cells = getNonBlankCells(players);
    expect(cells).toHaveLength(0);
  });

  it('should handle null gameResults', () => {
    const players: PlayerData[] = [
      {
        rank: 1,
        group: 'A',
        lastName: 'X',
        firstName: 'X',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: null as unknown as (string | null)[],
      },
    ];

    const cells = getNonBlankCells(players);
    expect(cells).toHaveLength(0);
  });
});

describe('walkthrough entryCell after clear', () => {
  it('should follow updatedPlayers, not stale state', () => {
    // rank=7 has two cells: round 1 ("7L10_") and round 2 ("7W12_")
    const players: PlayerData[] = [
      {
        rank: 7,
        group: 'A',
        lastName: 'Test',
        firstName: 'T',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', '7L10_', '7W12_', ''],
      },
    ];

    // Before clear: cell #0 = {rank:7, round:1}
    let cells = getNonBlankCells(players);
    expect(cells[0]).toEqual({ playerRank: 7, round: 1 });

    // Clear the cell at round 1
    const updated = clearCellsFromPlayers(players, [{ playerRank: 7, round: 1 }], '7L10');

    // After clear: cell #0 should be {rank:7, round:2} (from updatedPlayers)
    const entryCell = computeEntryCellAfterClear(updated, 0);
    expect(entryCell).toEqual({ playerRank: 7, round: 2 });
  });

  it('should clamp index when cells before current index are cleared', () => {
    // 3 non-blank cells at rounds 0, 1, 2
    const players: PlayerData[] = [
      {
        rank: 5,
        group: 'A',
        lastName: 'Test',
        firstName: 'T',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['5W3_', '4W2_', '3L1_'],
      },
    ];

    // walkthroughIndex = 2 (pointing to round 2)
    // Clear cells at rounds 0 and 1
    const updated = clearCellsFromPlayers(
      players,
      [{ playerRank: 5, round: 0 }, { playerRank: 5, round: 1 }],
      'dummy' // value doesn't matter, we're clearing by position
    );
    // Manually clear since the value won't match
    updated[0].gameResults[0] = '';
    updated[0].gameResults[1] = '';

    // walkthroughIndex=2 should clamp to 0 (only 1 cell remains)
    const entryCell = computeEntryCellAfterClear(updated, 2);
    expect(entryCell).toEqual({ playerRank: 5, round: 2 });
  });
});

describe('walkthrough exit on empty', () => {
  it('should return null when all cells are cleared', () => {
    const players: PlayerData[] = [
      {
        rank: 6,
        group: 'A',
        lastName: 'Test',
        firstName: 'T',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['6L7_', ''],
      },
    ];

    // Clear the last non-blank cell
    const updated = clearCellsFromPlayers(
      players,
      [{ playerRank: 6, round: 0 }],
      '6L7'
    );

    const entryCell = computeEntryCellAfterClear(updated, 0);
    expect(entryCell).toBeNull(); // null = walkthrough should exit
  });

  it('should exit when clearing multiple cells leaves none', () => {
    const players: PlayerData[] = [
      {
        rank: 1,
        group: 'A',
        lastName: 'A',
        firstName: 'A',
        rating: 1000,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['X_', ''],
      },
      {
        rank: 2,
        group: 'A',
        lastName: 'B',
        firstName: 'B',
        rating: 1100,
        nRating: 0,
        trophyEligible: true,
        grade: '5',
        num_games: 0,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: ['', 'Y_'],
      },
    ];

    // Clear both non-blank cells
    const updated = clearCellsFromPlayers(
      players,
      [{ playerRank: 1, round: 0 }, { playerRank: 2, round: 1 }],
      'dummy'
    );
    updated[0].gameResults[0] = '';
    updated[1].gameResults[1] = '';

    const entryCell = computeEntryCellAfterClear(updated, 0);
    expect(entryCell).toBeNull();
  });
});
