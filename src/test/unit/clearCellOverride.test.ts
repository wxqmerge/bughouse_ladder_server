/**
 * Tests for Clear Cell and Override mode logic
 * Tests the deduplication-based clear and override-save flows
 */

import { describe, it, expect } from 'vitest';
import { updatePlayerGameData } from '../../../shared/utils/hashUtils';

describe('Clear Cell Logic', () => {
  /**
   * Simulates the clearCurrentCell deduplication logic from LadderForm.
   * Given a cell value, finds all matching cells across all players.
   */
  function findCellsToClear(
    players: { rank: number; gameResults: (string | null)[] }[],
    playerRank: number,
    round: number
  ): { playerRank: number; round: number }[] {
    const rawCellValue = players.find((p) => p.rank === playerRank)?.gameResults?.[round] || '';
    const cellValue = rawCellValue.replace(/_+$/, '');

    const cellsToClear: { playerRank: number; round: number }[] = [];

    for (const player of players) {
      if (!player.gameResults) continue;
      for (let r = 0; r < player.gameResults.length; r++) {
        const normalized = player.gameResults[r]?.replace(/_+$/, '') || '';
        if (normalized === cellValue && cellValue !== '') {
          cellsToClear.push({ playerRank: player.rank, round: r });
        }
      }
    }

    // Fallback: if no matches found but cell has content, clear at least the current cell
    if (cellsToClear.length === 0 && cellValue !== '') {
      cellsToClear.push({ playerRank, round });
    }

    return cellsToClear;
  }

  /**
   * Simulates clearing cells from players array.
   */
  function clearCells(
    players: { rank: number; gameResults: (string | null)[] }[],
    cellsToClear: { playerRank: number; round: number }[],
    cellValue: string
  ): { rank: number; gameResults: (string | null)[] }[] {
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

  it('should find matching cells across multiple players', () => {
    const players = [
      { rank: 3, gameResults: ['5W3_', '', '3LW12_'] },
      { rank: 5, gameResults: ['', '3LW12_', ''] },
      { rank: 12, gameResults: ['3LW12_', '', ''] },
    ];

    const cells = findCellsToClear(players, 3, 2);
    expect(cells).toHaveLength(3);
    expect(cells).toContainEqual({ playerRank: 3, round: 2 });
    expect(cells).toContainEqual({ playerRank: 5, round: 1 });
    expect(cells).toContainEqual({ playerRank: 12, round: 0 });
  });

  it('should strip trailing underscores when matching', () => {
    const players = [
      { rank: 1, gameResults: ['5W3___'] },
      { rank: 2, gameResults: ['5W3_'] },
      { rank: 3, gameResults: ['5W3'] },
    ];

    const cells1 = findCellsToClear(players, 1, 0);
    expect(cells1).toHaveLength(3);

    const cells2 = findCellsToClear(players, 2, 0);
    expect(cells2).toHaveLength(3);

    const cells3 = findCellsToClear(players, 3, 0);
    expect(cells3).toHaveLength(3);
  });

  it('should not match different values', () => {
    const players = [
      { rank: 1, gameResults: ['5W3_'] },
      { rank: 2, gameResults: ['4W2_'] },
      { rank: 3, gameResults: ['5W3_'] },
    ];

    const cells = findCellsToClear(players, 1, 0);
    expect(cells).toHaveLength(2);
    expect(cells).toContainEqual({ playerRank: 1, round: 0 });
    expect(cells).toContainEqual({ playerRank: 3, round: 0 });
    expect(cells).not.toContainEqual({ playerRank: 2, round: 0 });
  });

  it('should fallback to clearing only current cell when no matches found', () => {
    const players = [
      { rank: 1, gameResults: ['5W3_'] },
      { rank: 2, gameResults: [''] },
    ];

    const cells = findCellsToClear(players, 1, 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ playerRank: 1, round: 0 });
  });

  it('should return empty array for empty cell', () => {
    const players = [
      { rank: 1, gameResults: [''] },
      { rank: 2, gameResults: [''] },
    ];

    const cells = findCellsToClear(players, 1, 0);
    expect(cells).toHaveLength(0);
  });

  it('should clear all matching cells from players', () => {
    const players = [
      { rank: 3, gameResults: ['5W3_', '', '3LW12_'] },
      { rank: 5, gameResults: ['', '3LW12_', ''] },
      { rank: 12, gameResults: ['3LW12_', '', ''] },
    ];

    const cellsToClear = findCellsToClear(players, 3, 2);
    const result = clearCells(players, cellsToClear, '3LW12');

    const p3 = result.find((p) => p.rank === 3)!;
    const p5 = result.find((p) => p.rank === 5)!;
    const p12 = result.find((p) => p.rank === 12)!;

    expect(p3.gameResults[2]).toBe('');
    expect(p3.gameResults[0]).toBe('5W3_'); // unchanged
    expect(p5.gameResults[1]).toBe('');
    expect(p12.gameResults[0]).toBe('');
  });

  it('should not clear non-matching cells', () => {
    const players = [
      { rank: 1, gameResults: ['5W3_', '4W2_', '3LW12_'] },
    ];

    const cellsToClear = findCellsToClear(players, 1, 2);
    const result = clearCells(players, cellsToClear, '3LW12');

    const p1 = result.find((p) => p.rank === 1)!;
    expect(p1.gameResults[0]).toBe('5W3_'); // unchanged
    expect(p1.gameResults[1]).toBe('4W2_'); // unchanged
    expect(p1.gameResults[2]).toBe(''); // cleared
  });
});

describe('Override Mode Logic', () => {
  /**
   * Simulates the fillCell logic from handleEnterRecalculateSave.
   * In override mode, always overwrites. Otherwise, only fills empty cells.
   */
  function fillCell(
    player: { rank: number; gameResults: (string | null)[] },
    roundIndex: number,
    resultStr: string,
    isOverride: boolean
  ): { rank: number; gameResults: (string | null)[] } {
    const newGameResults = [...player.gameResults];
    if (roundIndex >= 0 && roundIndex < 31) {
      if (isOverride) {
        newGameResults[roundIndex] = resultStr;
      } else {
        const existing = newGameResults[roundIndex]?.replace(/_+$/, '') || '';
        if (!existing.trim()) {
          newGameResults[roundIndex] = resultStr;
        }
      }
    }
    return { ...player, gameResults: newGameResults };
  }

  it('should overwrite existing cell in override mode', () => {
    const player = { rank: 3, gameResults: ['5W3_', ''] };
    const result = fillCell(player, 0, '3:5LW12:14_', true);
    expect(result.gameResults[0]).toBe('3:5LW12:14_');
  });

  it('should skip non-empty cell in normal mode', () => {
    const player = { rank: 3, gameResults: ['5W3_', ''] };
    const result = fillCell(player, 0, '3:5LW12:14_', false);
    expect(result.gameResults[0]).toBe('5W3_'); // unchanged
  });

  it('should fill empty cell in normal mode', () => {
    const player = { rank: 3, gameResults: ['', ''] };
    const result = fillCell(player, 0, '3:5LW12:14_', false);
    expect(result.gameResults[0]).toBe('3:5LW12:14_');
  });

  it('should fill empty cell in override mode', () => {
    const player = { rank: 3, gameResults: ['', ''] };
    const result = fillCell(player, 0, '3:5LW12:14_', true);
    expect(result.gameResults[0]).toBe('3:5LW12:14_');
  });

  it('should not fill out-of-bounds round', () => {
    const player = { rank: 3, gameResults: [''] };
    const result = fillCell(player, 31, '5W3_', true);
    expect(result.gameResults[0]).toBe('');
  });

  /**
   * Full override flow: parse result, clear old, fill new.
   */
  it('should replace 2-player result with 4-player result in override mode', () => {
    // Simulate replacing "5W3" (2-player) with "3:5LW12:14" (4-player)
    const players = [
      { rank: 3, gameResults: ['5W3_', '', ''] },
      { rank: 5, gameResults: ['5W3_', '', ''] },
      { rank: 12, gameResults: ['', '', ''] },
      { rank: 14, gameResults: ['', '', ''] },
    ];

    // Step 1: Parse new result
    const parsed = updatePlayerGameData('3:5LW12:14');
    expect(parsed.isValid).toBe(true);

    // Step 2: Clear old matching cells (same as Clear Cell logic)
    const oldCellValue = '5W3';
    const cellsToClear: { playerRank: number; round: number }[] = [];
    for (const p of players) {
      for (let r = 0; r < p.gameResults.length; r++) {
        if (p.gameResults[r]?.replace(/_+$/, '') === oldCellValue) {
          cellsToClear.push({ playerRank: p.rank, round: r });
        }
      }
    }

    let updated = players.map((p) => {
      const newGR = [...p.gameResults];
      let modified = false;
      for (const cell of cellsToClear) {
        if (cell.playerRank === p.rank && newGR[cell.round]?.replace(/_+$/, '') === oldCellValue) {
          newGR[cell.round] = '';
          modified = true;
        }
      }
      return modified ? { ...p, gameResults: newGR } : p;
    });

    // Old cells should be cleared
    expect(updated.find((p) => p.rank === 3)!.gameResults[0]).toBe('');
    expect(updated.find((p) => p.rank === 5)!.gameResults[0]).toBe('');

    // Step 3: Fill new cells (override mode always overwrites)
    const newResult = '3:5LW12:14_';
    const roundIndex = 0;
    const newRanks = [
      parsed.parsedPlayer1Rank || 0,
      parsed.parsedPlayer2Rank || 0,
      parsed.parsedPlayer3Rank || 0,
      parsed.parsedPlayer4Rank || 0,
    ];

    updated = updated.map((p) => {
      if (newRanks.includes(p.rank)) {
        const newGR = [...p.gameResults];
        newGR[roundIndex] = newResult;
        return { ...p, gameResults: newGR };
      }
      return p;
    });

    // New cells should be filled for all 4 players
    expect(updated.find((p) => p.rank === 3)!.gameResults[0]).toBe('3:5LW12:14_');
    expect(updated.find((p) => p.rank === 5)!.gameResults[0]).toBe('3:5LW12:14_');
    expect(updated.find((p) => p.rank === 12)!.gameResults[0]).toBe('3:5LW12:14_');
    expect(updated.find((p) => p.rank === 14)!.gameResults[0]).toBe('3:5LW12:14_');
  });

  it('should NOT replace in normal mode (skips non-empty cells)', () => {
    const players = [
      { rank: 3, gameResults: ['5W3_', '', ''] },
      { rank: 5, gameResults: ['5W3_', '', ''] },
      { rank: 12, gameResults: ['', '', ''] },
      { rank: 14, gameResults: ['', '', ''] },
    ];

    const parsed = updatePlayerGameData('3:5LW12:14');
    const newResult = '3:5LW12:14_';
    const roundIndex = 0;
    const newRanks = [
      parsed.parsedPlayer1Rank || 0,
      parsed.parsedPlayer2Rank || 0,
      parsed.parsedPlayer3Rank || 0,
      parsed.parsedPlayer4Rank || 0,
    ];

    const updated = players.map((p) => {
      if (newRanks.includes(p.rank)) {
        return fillCell(p, roundIndex, newResult, false); // NOT override
      }
      return p;
    });

    // Players 3 and 5 keep old value (non-empty, normal mode skips)
    expect(updated.find((p) => p.rank === 3)!.gameResults[0]).toBe('5W3_');
    expect(updated.find((p) => p.rank === 5)!.gameResults[0]).toBe('5W3_');
    // Players 12 and 14 get filled (empty cells)
    expect(updated.find((p) => p.rank === 12)!.gameResults[0]).toBe('3:5LW12:14_');
    expect(updated.find((p) => p.rank === 14)!.gameResults[0]).toBe('3:5LW12:14_');
  });
});
