/**
 * Tests for parseEntry via updatePlayerGameData (parseEntry is private)
 * Covers all error codes, edge cases, and parsing behavior
 */

import { describe, it, expect } from 'vitest';
import { updatePlayerGameData } from '../../../shared/utils/hashUtils';

describe('parseEntry (via updatePlayerGameData)', () => {
  describe('valid 2-player parsing', () => {
    it('should parse "12W13" correctly', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
      expect(result.parsedPlayer3Rank).toBe(0);
      expect(result.parsedPlayer4Rank).toBe(0);
    });

    it('should parse "12L13" correctly', () => {
      const result = updatePlayerGameData('12L13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse "12D13" correctly', () => {
      const result = updatePlayerGameData('12D13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse dual results "12WL13"', () => {
      const result = updatePlayerGameData('12WL13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse dual results "12WW13"', () => {
      const result = updatePlayerGameData('12WW13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });

    it('should parse single digit players "1W2"', () => {
      const result = updatePlayerGameData('1W2');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(1);
      expect(result.parsedPlayer2Rank).toBe(2);
    });

    it('should parse max rank "200W199"', () => {
      const result = updatePlayerGameData('200W199');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(200);
      expect(result.parsedPlayer2Rank).toBe(199);
    });

    it('should be case insensitive "12w13"', () => {
      const result = updatePlayerGameData('12w13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
    });
  });

  describe('valid 4-player parsing', () => {
    it('should parse "12:13W23:25" correctly', () => {
      const result = updatePlayerGameData('12:13W23:25');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
      expect(result.parsedPlayer3Rank).toBe(23);
      expect(result.parsedPlayer4Rank).toBe(25);
    });

    it('should parse reversed pairs "25:23LW13:12"', () => {
      const result = updatePlayerGameData('25:23LW13:12');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(25);
      expect(result.parsedPlayer2Rank).toBe(23);
      expect(result.parsedPlayer3Rank).toBe(13);
      expect(result.parsedPlayer4Rank).toBe(12);
    });

    it('should parse swapped pairs "23:25W12:13"', () => {
      const result = updatePlayerGameData('23:25W12:13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(23);
      expect(result.parsedPlayer2Rank).toBe(25);
      expect(result.parsedPlayer3Rank).toBe(12);
      expect(result.parsedPlayer4Rank).toBe(13);
    });

    it('should parse single digit 4p "1:2W3:4"', () => {
      const result = updatePlayerGameData('1:2W3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(1);
      expect(result.parsedPlayer2Rank).toBe(2);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
    });

    it('should parse 4p with dual results "12:13WL23:25"', () => {
      const result = updatePlayerGameData('12:13WL23:25');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(13);
      expect(result.parsedPlayer3Rank).toBe(23);
      expect(result.parsedPlayer4Rank).toBe(25);
    });
  });

  describe('error -3: incomplete entry', () => {
    it('should reject empty string', () => {
      const result = updatePlayerGameData('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject whitespace only', () => {
      const result = updatePlayerGameData('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject single character', () => {
      const result = updatePlayerGameData('W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject single digit', () => {
      const result = updatePlayerGameData('1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject 4p incomplete "12:13W23:"', () => {
      const result = updatePlayerGameData('12:13W23:');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });
  });

  describe('error -2: invalid format', () => {
    it('should reject invalid character "12X13"', () => {
      const result = updatePlayerGameData('12X13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject too many results 2p "12WLL13"', () => {
      const result = updatePlayerGameData('12WLL13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });

    it('should reject result after second player "12W13W"', () => {
      const result = updatePlayerGameData('12W13W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 4p result after second pair "12:13W23:25W"', () => {
      const result = updatePlayerGameData('12:13W23:25W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 4p with wrong colon count "12:13W23"', () => {
      const result = updatePlayerGameData('12:13W23');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject 4p with 3 colons "12:13:14W23:25"', () => {
      const result = updatePlayerGameData('12:13:14W23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });
  });

  describe('error: 4p with no result code', () => {
    it('should reject 4p no result "12:1323:25" (parsed as incomplete)', () => {
      const result = updatePlayerGameData('12:1323:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });
  });

  describe('error -5: too many results', () => {
    it('should reject 2p with 3 results', () => {
      const result = updatePlayerGameData('12WLL13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });

    it('should reject 4p with 3 results', () => {
      const result = updatePlayerGameData('12:13WLL23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });
  });

  describe('error -6: duplicate players', () => {
    it('should reject 2p self-play', () => {
      const result = updatePlayerGameData('12W12');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p same team duplicate', () => {
      const result = updatePlayerGameData('12:12W23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p cross team duplicate', () => {
      const result = updatePlayerGameData('12:13W12:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });
  });

  describe('error: player rank exceeds max', () => {
    it('should reject rank > 200 (error 2: incomplete after rank check)', () => {
      const result = updatePlayerGameData('201W202');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject rank 999', () => {
      const result = updatePlayerGameData('999W1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });
  });

  describe('underscore handling', () => {
    it('should accept trailing underscore "12W13_"', () => {
      const result = updatePlayerGameData('12W13_');
      expect(result.isValid).toBe(true);
    });

    it('should reject underscore in middle', () => {
      const result = updatePlayerGameData('12_W13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should accept trailing underscore 4p', () => {
      const result = updatePlayerGameData('12:13W23:25_');
      expect(result.isValid).toBe(true);
    });
  });

  describe('addUnderscore parameter', () => {
    it('should add underscore by default', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.resultString).toBe('12W13_');
    });

    it('should not add underscore when false', () => {
      const result = updatePlayerGameData('12W13', false);
      expect(result.resultString).toBe('12W13');
    });

    it('should preserve existing underscore with addUnderscore=false', () => {
      const result = updatePlayerGameData('12W13_', false);
      expect(result.resultString).toBe('12W13_');
    });

    it('should add underscore to entry without underscore', () => {
      const result = updatePlayerGameData('12:13W23:25', true);
      expect(result.resultString).toBe('12:13W23:25_');
    });
  });

  describe('parsedPlayersList and parsedScoreList', () => {
    it('should return parsed arrays for valid 2p entry', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayersList).toBeDefined();
      expect(result.parsedScoreList).toBeDefined();
    });

    it('should return parsed arrays for valid 4p entry', () => {
      const result = updatePlayerGameData('12:13W23:25');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayersList).toBeDefined();
      expect(result.parsedScoreList).toBeDefined();
    });

    it('should return parsed arrays for invalid entry too', () => {
      const result = updatePlayerGameData('invalid');
      expect(result.isValid).toBe(false);
      expect(result.parsedPlayersList).toBeDefined();
      expect(result.parsedScoreList).toBeDefined();
    });
  });

  describe('originalString preservation', () => {
    it('should preserve original input string', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.originalString).toBe('12W13');
    });

    it('should preserve original with underscore', () => {
      const result = updatePlayerGameData('12W13_');
      expect(result.originalString).toBe('12W13_');
    });

    it('should preserve original case', () => {
      const result = updatePlayerGameData('12w13');
      expect(result.originalString).toBe('12w13');
    });
  });

  describe('whitespace handling', () => {
    it('should handle leading whitespace', () => {
      const result = updatePlayerGameData('  12W13');
      expect(result.isValid).toBe(true);
    });

    it('should handle trailing whitespace', () => {
      const result = updatePlayerGameData('12W13  ');
      expect(result.isValid).toBe(true);
    });
  });

  describe('4-player mixed outcome scores (LD, WD, LW, etc.)', () => {
    it('should parse "12:1LD3:4" - team1 L, team2 D', () => {
      const result = updatePlayerGameData('12:1LD3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([1, 2]); // L=1, D=2
    });

    it('should parse "12:1WD3:4" - team1 W, team2 D', () => {
      const result = updatePlayerGameData('12:1WD3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([3, 2]); // W=3, D=2
    });

    it('should parse "12:1DL3:4" - team1 D, team2 L', () => {
      const result = updatePlayerGameData('12:1DL3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([2, 1]); // D=2, L=1
    });

    it('should parse "12:1DD3:4" - both teams draw', () => {
      const result = updatePlayerGameData('12:1DD3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([2, 2]); // D=2, D=2
    });

    it('should parse "12:1LW3:4" - team1 L, team2 W', () => {
      const result = updatePlayerGameData('12:1LW3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([1, 3]); // L=1, W=3
    });

    it('should parse "12:1WL3:4" - team1 W, team2 L', () => {
      const result = updatePlayerGameData('12:1WL3:4');
      expect(result.isValid).toBe(true);
      expect(result.parsedPlayer1Rank).toBe(12);
      expect(result.parsedPlayer2Rank).toBe(1);
      expect(result.parsedPlayer3Rank).toBe(3);
      expect(result.parsedPlayer4Rank).toBe(4);
      expect(result.parsedScoreList).toEqual([3, 1]); // W=3, L=1
    });
  });
});
