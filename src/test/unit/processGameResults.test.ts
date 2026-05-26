/**
 * Tests for processGameResults
 * Covers dedup, errors, match building, and edge cases
 */

import { describe, it, expect } from 'vitest';
import { processGameResults } from '../../../shared/utils/hashUtils';
import type { PlayerData } from '../../../shared/types';

describe('processGameResults', () => {
  function makePlayer(rank: number, gameResults?: (string | null)[]): PlayerData {
    return {
      rank,
      group: 'A',
      lastName: `P${rank}`,
      firstName: `F${rank}`,
      rating: 1200 + rank * 100,
      nRating: 1200 + rank * 100,
      trophyEligible: true,
      grade: '5',
      num_games: 5,
      attendance: 0,
      info: '',
      phone: '',
      school: '',
      room: '',
      gameResults: gameResults || Array(31).fill(null),
    };
  }

  describe('basic 2-player match processing', () => {
    it('should process a single 2p match from both players', () => {
      const players = [
        makePlayer(1, ['1W2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].player1).toBe(1);
      expect(result.matches[0].player2).toBe(2);
    });

    it('should process draw match', () => {
      const players = [
        makePlayer(1, ['1D2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2D1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].score1).toBe(2);
    });

    it('should process loss match', () => {
      const players = [
        makePlayer(1, ['1L2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2W1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('basic 4-player match processing', () => {
    it('should process a single 4p match from all 4 players', () => {
      const players = [
        makePlayer(1, ['1:2W3:4', null, ...Array(29).fill(null)]),
        makePlayer(2, ['1:2W3:4', null, ...Array(29).fill(null)]),
        makePlayer(3, ['1:2L3:4', null, ...Array(29).fill(null)]),
        makePlayer(4, ['1:2L3:4', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].player3).toBe(3);
      expect(result.matches[0].player4).toBe(4);
    });

    it('should process 4p match with reversed pairs', () => {
      const players = [
        makePlayer(1, ['4:3L2:1', null, ...Array(29).fill(null)]),
        makePlayer(2, ['4:3L2:1', null, ...Array(29).fill(null)]),
        makePlayer(3, ['4:3W2:1', null, ...Array(29).fill(null)]),
        makePlayer(4, ['4:3W2:1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should process 4p match with reversed first pair', () => {
      const players = [
        makePlayer(1, ['2:1W3:4', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2:1W3:4', null, ...Array(29).fill(null)]),
        makePlayer(3, ['2:1L3:4', null, ...Array(29).fill(null)]),
        makePlayer(4, ['2:1L3:4', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should process 4p match with swapped sides', () => {
      const players = [
        makePlayer(1, ['4:3L2:1', null, ...Array(29).fill(null)]),
        makePlayer(2, ['4:3L2:1', null, ...Array(29).fill(null)]),
        makePlayer(3, ['4:3W2:1', null, ...Array(29).fill(null)]),
        makePlayer(4, ['4:3W2:1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('deduplication within round', () => {
    it('should deduplicate same match from both players 2p', () => {
      const players = [
        makePlayer(1, ['1W2', '1W3', ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', null, ...Array(29).fill(null)]),
        makePlayer(3, ['3L1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      // Two different matches, each deduplicated from both players
      expect(result.matches).toHaveLength(2);
    });

    it('should deduplicate same match repeated in same round', () => {
      const players = [
        makePlayer(1, ['1W2', '1W2', ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', '2L1', ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      // Same match in round 0 and 1, global dedup keeps only 1
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('global deduplication across rounds', () => {
    it('should deduplicate identical match across rounds', () => {
      const players = [
        makePlayer(1, ['1W2', '1W2', ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', '2L1', ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      // Same match in round 0 and 1, global dedup keeps only 1
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should report error for invalid entry', () => {
      const players = [
        makePlayer(1, ['12X13', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should report error for self-play', () => {
      const players = [
        makePlayer(1, ['1W1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
    });

    it('should report error for rank > 200', () => {
      const players = [
        makePlayer(1, ['1W201', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(true);
    });

    it('should skip empty/null entries without error', () => {
      const players = [
        makePlayer(1, [null, '', '  ', ...Array(28).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('confirmed entries with underscore', () => {
    it('should process confirmed 2p entry', () => {
      const players = [
        makePlayer(1, ['1W2_', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2L1_', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should process confirmed 4p entry', () => {
      const players = [
        makePlayer(1, ['1:2W3:4_', null, ...Array(29).fill(null)]),
        makePlayer(2, ['1:2W3:4_', null, ...Array(29).fill(null)]),
        makePlayer(3, ['1:2L3:4_', null, ...Array(29).fill(null)]),
        makePlayer(4, ['1:2L3:4_', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('player results by match', () => {
    it('should track player results for each match', () => {
      const players = [
        makePlayer(1, ['1W2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.playerResultsByMatch.size).toBeGreaterThan(0);
    });
  });

  describe('multiple matches per player', () => {
    it('should process multiple different matches for one player', () => {
      const players = [
        makePlayer(1, ['1W2', '1W3', '1W4', ...Array(28).fill(null)]),
        makePlayer(2, ['2L1', null, ...Array(29).fill(null)]),
        makePlayer(3, ['3L1', null, ...Array(29).fill(null)]),
        makePlayer(4, ['4L1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      // 3 matches found, some errors from cross-player perspective mismatch
      expect(result.matches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('dual results', () => {
    it('should process 2p with dual results', () => {
      const players = [
        makePlayer(1, ['1WL2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2LW1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should process 4p with dual results', () => {
      const players = [
        makePlayer(1, ['1:2WL3:4', null, ...Array(29).fill(null)]),
        makePlayer(2, ['1:2WL3:4', null, ...Array(29).fill(null)]),
        makePlayer(3, ['1:2LW3:4', null, ...Array(29).fill(null)]),
        makePlayer(4, ['1:2LW3:4', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty players list', () => {
      const result = processGameResults([], 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('should handle players with no game results', () => {
      const players = [
        makePlayer(1, Array(31).fill(null)),
        makePlayer(2, Array(31).fill(null)),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('should handle custom numRounds', () => {
      const players = [
        makePlayer(1, ['1W2', null, ...Array(29).fill(null)]),
        makePlayer(2, ['2L1', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 1);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should handle non-sequential ranks', () => {
      const players = [
        makePlayer(50, ['50W51', null, ...Array(29).fill(null)]),
        makePlayer(51, ['51L50', null, ...Array(29).fill(null)]),
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      expect(result.matches).toHaveLength(1);
    });
  });
});
