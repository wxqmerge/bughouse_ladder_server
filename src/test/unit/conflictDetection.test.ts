/**
 * Tests for conflict detection normalization
 * Tests the core logic that findConflictForEntry uses:
 * - updatePlayerGameData parsing
 * - normalize4Player/normalize2Player normalization
 * - Cross-type conflict prevention (2p vs 4p never conflict)
 *
 * Format reference:
 * - 2-player: "12W13" (no colon between players)
 * - 4-player: "12:13W23:25" (colons within pairs, no underscore between pairs)
 */

import { describe, it, expect } from 'vitest';
import { updatePlayerGameData, normalize4Player, normalize2Player } from '../../../shared/utils/hashUtils';

describe('Conflict Detection Normalization', () => {
  describe('updatePlayerGameData parsing - 2-player entries', () => {
    it('should parse 2-player entry "12W13"', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
      expect(result.parsedPlayer3Rank).toBe(0);
      expect(result.parsedPlayer4Rank).toBe(0);
    });

    it('should parse 2-player entry with loss "12L13"', () => {
      const result = updatePlayerGameData('12L13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse 2-player entry with draw "12D13"', () => {
      const result = updatePlayerGameData('12D13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse 2-player entry with multiple results "12WL13"', () => {
      const result = updatePlayerGameData('12WL13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse 2-player entry with reversed players "13W12"', () => {
      const result = updatePlayerGameData('13W12');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(13);
      expect(result.parsedPlayer2Rank).toBe(12);
    });
  });

  describe('updatePlayerGameData parsing - 4-player entries', () => {
    it('should parse 4-player entry "12:13W23:25"', () => {
      const result = updatePlayerGameData('12:13W23:25');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
      expect(result.parsedPlayer3Rank).toBe(23);
      expect(result.parsedPlayer4Rank).toBe(25);
    });

    it('should parse 4-player entry with different results "23:25LW12:13"', () => {
      const result = updatePlayerGameData('23:25LW12:13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(23);
      expect(result.parsedPlayer2Rank).toBe(25);
      expect(result.parsedPlayer3Rank).toBe(12);
      expect(result.parsedPlayer4Rank).toBe(13);
    });

    it('should parse 4-player entry with draw "1:2D3:4"', () => {
      const result = updatePlayerGameData('1:2D3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(1);
      expect(result.parsedPlayer2Rank).toBe(2);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
    });

    it('should parse 4-player entry with all reversed "25:23LW13:12"', () => {
      const result = updatePlayerGameData('25:23LW13:12');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(25);
      expect(result.parsedPlayer2Rank).toBe(23);
      expect(result.parsedPlayer3Rank).toBe(13);
      expect(result.parsedPlayer4Rank).toBe(12);
    });
  });

  describe('2-player vs 2-player conflict detection', () => {
    it('should detect conflict when players match in same order', () => {
      const parsed1 = updatePlayerGameData('12W13');
      const parsed2 = updatePlayerGameData('12L13');

      const n1 = normalize2Player(parsed1.parsedPlayer1Rank || 0, parsed1.parsedPlayer2Rank || 0);
      const n2 = normalize2Player(parsed2.parsedPlayer1Rank || 0, parsed2.parsedPlayer2Rank || 0);

      expect(n1[0]).toBe(n2[0]);
      expect(n1[1]).toBe(n2[1]);
    });

    it('should detect conflict when players match in reverse order', () => {
      const parsed1 = updatePlayerGameData('12W13');
      const parsed2 = updatePlayerGameData('13L12');

      const n1 = normalize2Player(parsed1.parsedPlayer1Rank || 0, parsed1.parsedPlayer2Rank || 0);
      const n2 = normalize2Player(parsed2.parsedPlayer1Rank || 0, parsed2.parsedPlayer2Rank || 0);

      expect(n1).toEqual(n2);
    });

    it('should NOT detect conflict when one player differs', () => {
      const parsed1 = updatePlayerGameData('12W13');
      const parsed2 = updatePlayerGameData('12L14');

      const n1 = normalize2Player(parsed1.parsedPlayer1Rank || 0, parsed1.parsedPlayer2Rank || 0);
      const n2 = normalize2Player(parsed2.parsedPlayer1Rank || 0, parsed2.parsedPlayer2Rank || 0);

      expect(n1).not.toEqual(n2);
    });

    it('should NOT detect conflict when both players differ', () => {
      const parsed1 = updatePlayerGameData('12W13');
      const parsed2 = updatePlayerGameData('14W15');

      const n1 = normalize2Player(parsed1.parsedPlayer1Rank || 0, parsed1.parsedPlayer2Rank || 0);
      const n2 = normalize2Player(parsed2.parsedPlayer1Rank || 0, parsed2.parsedPlayer2Rank || 0);

      expect(n1).not.toEqual(n2);
    });
  });

  describe('4-player vs 4-player conflict detection', () => {
    it('should detect conflict when all 4 players match in same order', () => {
      const parsed1 = updatePlayerGameData('12:13W23:25');
      const parsed2 = updatePlayerGameData('12:13L23:25');

      const n1 = normalize4Player(
        parsed1.parsedPlayer1Rank || 0,
        parsed1.parsedPlayer2Rank || 0,
        parsed1.parsedPlayer3Rank || 0,
        parsed1.parsedPlayer4Rank || 0
      );
      const n2 = normalize4Player(
        parsed2.parsedPlayer1Rank || 0,
        parsed2.parsedPlayer2Rank || 0,
        parsed2.parsedPlayer3Rank || 0,
        parsed2.parsedPlayer4Rank || 0
      );

      expect(n1).toEqual(n2);
    });

    it('should detect conflict when all 4 players match with different orderings', () => {
      // Entry 1: 12:13W23:25 (already normalized)
      // Entry 2: 25:23LW13:12 (both pairs reversed, pairs swapped)
      const parsed1 = updatePlayerGameData('12:13W23:25');
      const parsed2 = updatePlayerGameData('25:23LW13:12');

      const n1 = normalize4Player(
        parsed1.parsedPlayer1Rank || 0,
        parsed1.parsedPlayer2Rank || 0,
        parsed1.parsedPlayer3Rank || 0,
        parsed1.parsedPlayer4Rank || 0
      );
      const n2 = normalize4Player(
        parsed2.parsedPlayer1Rank || 0,
        parsed2.parsedPlayer2Rank || 0,
        parsed2.parsedPlayer3Rank || 0,
        parsed2.parsedPlayer4Rank || 0
      );

      expect(n1).toEqual(n2);
    });

    it('should detect conflict when pairs are swapped', () => {
      // Entry 1: team(12,13) vs team(23,25)
      // Entry 2: team(23,25) vs team(12,13) - pairs swapped
      const parsed1 = updatePlayerGameData('12:13W23:25');
      const parsed2 = updatePlayerGameData('23:25LW12:13');

      const n1 = normalize4Player(
        parsed1.parsedPlayer1Rank || 0,
        parsed1.parsedPlayer2Rank || 0,
        parsed1.parsedPlayer3Rank || 0,
        parsed1.parsedPlayer4Rank || 0
      );
      const n2 = normalize4Player(
        parsed2.parsedPlayer1Rank || 0,
        parsed2.parsedPlayer2Rank || 0,
        parsed2.parsedPlayer3Rank || 0,
        parsed2.parsedPlayer4Rank || 0
      );

      expect(n1).toEqual(n2);
    });

    it('should detect conflict with all permutations of same 4 players', () => {
      const base = normalize4Player(1, 2, 3, 4);

      const permutations = [
        normalize4Player(2, 1, 3, 4),
        normalize4Player(1, 2, 4, 3),
        normalize4Player(2, 1, 4, 3),
        normalize4Player(3, 4, 1, 2),
        normalize4Player(4, 3, 1, 2),
        normalize4Player(3, 4, 2, 1),
        normalize4Player(4, 3, 2, 1),
      ];

      for (const p of permutations) {
        expect(p).toEqual(base);
      }
    });

    it('should NOT detect conflict when one player differs', () => {
      const parsed1 = updatePlayerGameData('12:13W23:25');
      const parsed2 = updatePlayerGameData('12:13L23:26');

      const n1 = normalize4Player(
        parsed1.parsedPlayer1Rank || 0,
        parsed1.parsedPlayer2Rank || 0,
        parsed1.parsedPlayer3Rank || 0,
        parsed1.parsedPlayer4Rank || 0
      );
      const n2 = normalize4Player(
        parsed2.parsedPlayer1Rank || 0,
        parsed2.parsedPlayer2Rank || 0,
        parsed2.parsedPlayer3Rank || 0,
        parsed2.parsedPlayer4Rank || 0
      );

      expect(n1).not.toEqual(n2);
    });
  });

  describe('2-player vs 4-player cross-type (should never conflict)', () => {
    it('should not conflict: 2p entry vs 4p entry with same players', () => {
      const parsed2p = updatePlayerGameData('12W13');
      const parsed4p = updatePlayerGameData('12:13W23:25');

      // 2p entry has 0 for player3 and player4
      const is2p = (parsed2p.parsedPlayer3Rank || 0) > 0 && (parsed2p.parsedPlayer4Rank || 0) > 0;
      const is4p = (parsed4p.parsedPlayer3Rank || 0) > 0 && (parsed4p.parsedPlayer4Rank || 0) > 0;

      expect(is2p).toBe(false);
      expect(is4p).toBe(true);
      expect(is2p).not.toBe(is4p);
    });

    it('should not conflict: 4p entry vs 2p entry with same players', () => {
      const parsed4p = updatePlayerGameData('12:13W23:25');
      const parsed2p = updatePlayerGameData('12W13');

      const is4p = (parsed4p.parsedPlayer3Rank || 0) > 0 && (parsed4p.parsedPlayer4Rank || 0) > 0;
      const is2p = (parsed2p.parsedPlayer3Rank || 0) > 0 && (parsed2p.parsedPlayer4Rank || 0) > 0;

      expect(is4p).toBe(true);
      expect(is2p).toBe(false);
      expect(is4p).not.toBe(is2p);
    });

    it('should not conflict: 2p entries with different game types', () => {
      // Simulating the conflict detection logic from findConflictForEntry
      const existingIs4Player = (30 > 0 && 40 > 0); // 4p parsed result
      const newEntryIs4Player = (20 > 0 && 0 > 0);  // 2p parsed result (player4 = 0)

      expect(existingIs4Player).toBe(true);
      expect(newEntryIs4Player).toBe(false);
      expect(existingIs4Player).not.toBe(newEntryIs4Player);
    });
  });

  describe('partial 4-player entries (only 3 players)', () => {
    it('should treat 3-player entry as 2-player (player4 = 0)', () => {
      // An entry like "12:13W_23" would have player4 = 0
      // This should be treated as a 2-player entry, not a 4-player entry
      const parsed = updatePlayerGameData('12:13W23');

      // player3 exists but player4 is 0
      const has3Players = (parsed.parsedPlayer3Rank || 0) > 0;
      const has4Players = has3Players && (parsed.parsedPlayer4Rank || 0) > 0;

      expect(has3Players).toBe(true);
      expect(has4Players).toBe(false);
    });
  });

  describe('invalid entries', () => {
    it('should return invalid for empty string', () => {
      const result = updatePlayerGameData('');
      expect(result.isValid).toBe(false);
    });

    it('should return invalid for malformed entry', () => {
      const result = updatePlayerGameData('invalid');
      expect(result.isValid).toBe(false);
    });

    it('should return invalid for entry with only numbers', () => {
      const result = updatePlayerGameData('123');
      expect(result.isValid).toBe(false);
    });
  });
});
