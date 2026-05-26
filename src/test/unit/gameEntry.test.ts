/**
 * Tests for game entry functionality
 * Tests the core logic that handleEnterRecalculateSave uses:
 * - 2-player game entry fills both cells with the same string
 * - 4-player game entry fills all 4 cells with the same string
 * - processGameResults correctly handles same-string cells (deduplication)
 * - Edge cases: already-filled cells, invalid entries
 *
 * Format reference:
 * - 2-player: "12W13" (no colon between players)
 * - 4-player: "12:13W23:25" (colons within pairs, no underscore between pairs)
 *
 * Key invariant: Both/all players' cells store the EXACT same string.
 * "8W9" in P8's cell AND "8W9" in P9's cell. (NOT "8L9" in P9's cell.)
 */

import { describe, it, expect } from 'vitest';
import { updatePlayerGameData, processGameResults } from '../../../shared/utils/hashUtils';
import { PlayerData } from '../../../shared/types';

/**
 * Create a player with empty game results
 */
function createPlayer(rank: number, gameResults: (string | null)[] = []): PlayerData {
  return {
    rank,
    group: 'A',
    lastName: `Player${rank}`,
    firstName: `First${rank}`,
    rating: 1200,
    nRating: 0,
    trophyEligible: false,
    grade: 'A',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: gameResults.length > 0 ? gameResults : new Array(31).fill(null),
  };
}

/**
 * Simulate the fillCell logic from handleEnterRecalculateSave
 */
function fillCell(players: PlayerData[], playerRank: number, resultString: string, roundIndex: number) {
  const player = players.find((p) => p.rank === playerRank);
  if (player && roundIndex >= 0 && roundIndex < 31) {
    const existingValue = player.gameResults[roundIndex]?.replace(/_+$/, "") || "";
    if (!existingValue.trim()) {
      const newResults = [...(player.gameResults || new Array(31).fill(null))];
      newResults[roundIndex] = resultString;
      player.gameResults = newResults;
    }
  }
}

describe('Game Entry - Same String for All Players', () => {
  describe('2-player game entry fills both cells with same string', () => {
    it('should parse "8W9" and extract correct player ranks', () => {
      const parsed = updatePlayerGameData('8W9');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(8);
      expect(parsed.parsedPlayer2Rank).toBe(9);
      expect(parsed.resultString?.replace(/_+$/, '')).toBe('8W9');
    });

    it('should fill both P8 and P9 cells with "8W9" when entering from P8', () => {
      const players = [
        createPlayer(8, new Array(31).fill(null)),
        createPlayer(9, new Array(31).fill(null)),
      ];
      const roundIndex = 0;
      const valueToSave = '8W9';

      fillCell(players, 8, valueToSave, roundIndex);
      fillCell(players, 9, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 8)?.gameResults[0]).toBe('8W9');
      expect(players.find(p => p.rank === 9)?.gameResults[0]).toBe('8W9');
    });

    it('should fill both cells with "13L12" when entering "13L12"', () => {
      const players = [
        createPlayer(12, new Array(31).fill(null)),
        createPlayer(13, new Array(31).fill(null)),
      ];
      const roundIndex = 1;
      const valueToSave = '13L12';

      fillCell(players, 12, valueToSave, roundIndex);
      fillCell(players, 13, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 12)?.gameResults[1]).toBe('13L12');
      expect(players.find(p => p.rank === 13)?.gameResults[1]).toBe('13L12');
    });

    it('should skip filling cell if already filled', () => {
      const players = [
        createPlayer(8, new Array(31).fill(null)),
        createPlayer(9, ['9W10', ...new Array(30).fill(null)]),
      ];
      const roundIndex = 0;
      const valueToSave = '8W9';

      fillCell(players, 8, valueToSave, roundIndex);
      fillCell(players, 9, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 8)?.gameResults[0]).toBe('8W9');
      expect(players.find(p => p.rank === 9)?.gameResults[0]).toBe('9W10');
    });

    it('should handle reversed entry "9W8" correctly', () => {
      const parsed = updatePlayerGameData('9W8');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(9);
      expect(parsed.parsedPlayer2Rank).toBe(8);
      expect(parsed.resultString?.replace(/_+$/, '')).toBe('9W8');

      const players = [
        createPlayer(8, new Array(31).fill(null)),
        createPlayer(9, new Array(31).fill(null)),
      ];
      const roundIndex = 0;
      const valueToSave = '9W8';

      fillCell(players, 9, valueToSave, roundIndex);
      fillCell(players, 8, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 8)?.gameResults[0]).toBe('9W8');
      expect(players.find(p => p.rank === 9)?.gameResults[0]).toBe('9W8');
    });
  });

  describe('4-player game entry fills all 4 cells with same string', () => {
    it('should parse "1:2W3:4" and extract correct player ranks', () => {
      const parsed = updatePlayerGameData('1:2W3:4');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(1);
      expect(parsed.parsedPlayer2Rank).toBe(2);
      expect(parsed.parsedPlayer3Rank).toBe(3);
      expect(parsed.parsedPlayer4Rank).toBe(4);
      expect(parsed.resultString?.replace(/_+$/, '')).toBe('1:2W3:4');
    });

    it('should fill all 4 players with "1:2W3:4"', () => {
      const players = [
        createPlayer(1, new Array(31).fill(null)),
        createPlayer(2, new Array(31).fill(null)),
        createPlayer(3, new Array(31).fill(null)),
        createPlayer(4, new Array(31).fill(null)),
      ];
      const roundIndex = 0;
      const valueToSave = '1:2W3:4';

      fillCell(players, 1, valueToSave, roundIndex);
      fillCell(players, 2, valueToSave, roundIndex);
      fillCell(players, 3, valueToSave, roundIndex);
      fillCell(players, 4, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 1)?.gameResults[0]).toBe('1:2W3:4');
      expect(players.find(p => p.rank === 2)?.gameResults[0]).toBe('1:2W3:4');
      expect(players.find(p => p.rank === 3)?.gameResults[0]).toBe('1:2W3:4');
      expect(players.find(p => p.rank === 4)?.gameResults[0]).toBe('1:2W3:4');
    });

    it('should handle 4-player entry with reversed teams', () => {
      const parsed = updatePlayerGameData('3:4L1:2');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(3);
      expect(parsed.parsedPlayer2Rank).toBe(4);
      expect(parsed.parsedPlayer3Rank).toBe(1);
      expect(parsed.parsedPlayer4Rank).toBe(2);
      expect(parsed.resultString?.replace(/_+$/, '')).toBe('3:4L1:2');

      const players = [
        createPlayer(1, new Array(31).fill(null)),
        createPlayer(2, new Array(31).fill(null)),
        createPlayer(3, new Array(31).fill(null)),
        createPlayer(4, new Array(31).fill(null)),
      ];
      const roundIndex = 0;
      const valueToSave = '3:4L1:2';

      fillCell(players, 1, valueToSave, roundIndex);
      fillCell(players, 2, valueToSave, roundIndex);
      fillCell(players, 3, valueToSave, roundIndex);
      fillCell(players, 4, valueToSave, roundIndex);

      expect(players.find(p => p.rank === 1)?.gameResults[0]).toBe('3:4L1:2');
      expect(players.find(p => p.rank === 2)?.gameResults[0]).toBe('3:4L1:2');
      expect(players.find(p => p.rank === 3)?.gameResults[0]).toBe('3:4L1:2');
      expect(players.find(p => p.rank === 4)?.gameResults[0]).toBe('3:4L1:2');
    });
  });

  describe('processGameResults handles same-string cells correctly', () => {
    it('should deduplicate 2-player match when both cells have same string', () => {
      const players = [
        createPlayer(8, ['8W9', ...new Array(30).fill(null)]),
        createPlayer(9, ['8W9', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].player1).toBe(8);
      expect(result.matches[0].player2).toBe(9);
      expect(result.matches[0].score1).toBe(3); // W
      expect(result.matches[0].score2).toBe(0);
      expect(result.matches[0].side0Won).toBe(true);
    });

    it('should deduplicate 4-player match when all 4 cells have same string', () => {
      const players = [
        createPlayer(1, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(2, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(3, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(4, ['1:2W3:4', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].player1).toBe(1);
      expect(result.matches[0].player2).toBe(2);
      expect(result.matches[0].player3).toBe(3);
      expect(result.matches[0].player4).toBe(4);
      expect(result.matches[0].score1).toBe(3); // W
      expect(result.matches[0].score2).toBe(0);
      expect(result.matches[0].side0Won).toBe(true);
    });

    it('should handle multiple matches with same-string cells', () => {
      const players = [
        createPlayer(8, ['8W9', '8L10', ...new Array(29).fill(null)]),
        createPlayer(9, ['8W9', null, ...new Array(29).fill(null)]),
        createPlayer(10, [null, '8L10', ...new Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(2);
    });

    it('should handle partial fill (only one cell filled)', () => {
      const players = [
        createPlayer(8, ['8W9', ...new Array(30).fill(null)]),
        createPlayer(9, new Array(31).fill(null)),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });

    it('should handle same-string with reversed order "9W8"', () => {
      const players = [
        createPlayer(8, ['9W8', ...new Array(30).fill(null)]),
        createPlayer(9, ['9W8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].player1).toBe(9);
      expect(result.matches[0].player2).toBe(8);
      expect(result.matches[0].score1).toBe(3); // W
      expect(result.matches[0].side0Won).toBe(true);
    });

    it('should detect conflict: 8W9 vs 9W8 (opposite outcomes)', () => {
      const players = [
        createPlayer(8, ['8W9', ...new Array(30).fill(null)]),
        createPlayer(9, ['9W8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should NOT conflict: 8W9 vs 9L8 (consistent outcomes)', () => {
      const players = [
        createPlayer(8, ['8W9', ...new Array(30).fill(null)]),
        createPlayer(9, ['9L8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });

    it('should NOT conflict: 9L8 vs 8W9 (consistent outcomes)', () => {
      const players = [
        createPlayer(8, ['9L8', ...new Array(30).fill(null)]),
        createPlayer(9, ['8W9', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });

    it('should detect conflict: 8L9 vs 9L8 (both claim loss)', () => {
      const players = [
        createPlayer(8, ['8L9', ...new Array(30).fill(null)]),
        createPlayer(9, ['9L8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should NOT conflict: 1:2W3:4 vs 3:4L1:2 (consistent outcomes)', () => {
      const players = [
        createPlayer(1, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(2, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(3, ['3:4L1:2', ...new Array(30).fill(null)]),
        createPlayer(4, ['3:4L1:2', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });

    it('should detect conflict: 1:2W3:4 vs 1:2L3:4 (opposite outcomes)', () => {
      const players = [
        createPlayer(1, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(2, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(3, ['1:2L3:4', ...new Array(30).fill(null)]),
        createPlayer(4, ['1:2L3:4', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should detect conflict: 1:2W3:4 vs 3:4W1:2 (both teams claim win)', () => {
      const players = [
        createPlayer(1, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(2, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(3, ['3:4W1:2', ...new Array(30).fill(null)]),
        createPlayer(4, ['3:4W1:2', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should NOT conflict: 3:4L1:2 vs 1:2W3:4 (consistent, teams swapped)', () => {
      const players = [
        createPlayer(1, ['3:4L1:2', ...new Array(30).fill(null)]),
        createPlayer(2, ['3:4L1:2', ...new Array(30).fill(null)]),
        createPlayer(3, ['1:2W3:4', ...new Array(30).fill(null)]),
        createPlayer(4, ['1:2W3:4', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });

    it('should NOT conflict: 1:2D3:4 vs 3:4D1:2 (both draw)', () => {
      const players = [
        createPlayer(1, ['1:2D3:4', ...new Array(30).fill(null)]),
        createPlayer(2, ['1:2D3:4', ...new Array(30).fill(null)]),
        createPlayer(3, ['3:4D1:2', ...new Array(30).fill(null)]),
        createPlayer(4, ['3:4D1:2', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches.length).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle lowercase entry "8w9"', () => {
      const parsed = updatePlayerGameData('8w9');
      expect(parsed.isValid).toBe(true);
      expect(parsed.resultString?.toUpperCase().replace(/_+$/, '')).toBe('8W9');
    });

    it('should handle entry with underscore suffix', () => {
      const parsed = updatePlayerGameData('8W9_');
      expect(parsed.isValid).toBe(true);
      expect(parsed.resultString?.replace(/_+$/, '')).toBe('8W9');
    });

    it('should handle draw entry "8D9"', () => {
      const parsed = updatePlayerGameData('8D9');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(8);
      expect(parsed.parsedPlayer2Rank).toBe(9);

      const players = [
        createPlayer(8, ['8D9', ...new Array(30).fill(null)]),
        createPlayer(9, ['8D9', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(false);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].score1).toBe(2); // D
    });

    it('should handle loss entry "8L9"', () => {
      const parsed = updatePlayerGameData('8L9');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(8);
      expect(parsed.parsedPlayer2Rank).toBe(9);

      const players = [
        createPlayer(8, ['8L9', ...new Array(30).fill(null)]),
        createPlayer(9, ['8L9', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(false);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].score1).toBe(1); // L
      expect(result.matches[0].side0Won).toBe(false);
    });

    it('should handle multi-letter result "8WL9"', () => {
      const parsed = updatePlayerGameData('8WL9');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(8);
      expect(parsed.parsedPlayer2Rank).toBe(9);

      const players = [
        createPlayer(8, ['8WL9', ...new Array(30).fill(null)]),
        createPlayer(9, ['8WL9', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(false);
      expect(result.matches.length).toBe(1);
    });

    it('should handle large player ranks', () => {
      const parsed = updatePlayerGameData('199W200');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(199);
      expect(parsed.parsedPlayer2Rank).toBe(200);

      const players = [
        createPlayer(199, ['199W200', ...new Array(30).fill(null)]),
        createPlayer(200, ['199W200', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(false);
      expect(result.matches.length).toBe(1);
    });

    it('should handle entry from opponent perspective "9L8"', () => {
      const parsed = updatePlayerGameData('9L8');
      expect(parsed.isValid).toBe(true);
      expect(parsed.parsedPlayer1Rank).toBe(9);
      expect(parsed.parsedPlayer2Rank).toBe(8);

      const players = [
        createPlayer(8, ['9L8', ...new Array(30).fill(null)]),
        createPlayer(9, ['9L8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(false);
      expect(result.matches.length).toBe(1);
    });
  });

  describe('Invalid entries', () => {
    it('should reject empty string', () => {
      const parsed = updatePlayerGameData('');
      expect(parsed.isValid).toBe(false);
    });

    it('should reject invalid format', () => {
      const parsed = updatePlayerGameData('invalid');
      expect(parsed.isValid).toBe(false);
    });

    it('should reject entry with only numbers', () => {
      const parsed = updatePlayerGameData('123');
      expect(parsed.isValid).toBe(false);
    });

    it('should reject self-match', () => {
      const players = [
        createPlayer(8, ['8W8', ...new Array(30).fill(null)]),
      ];

      const result = processGameResults(players, 31);
      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });
  });
});
