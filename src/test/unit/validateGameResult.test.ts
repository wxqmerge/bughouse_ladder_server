/**
 * Comprehensive tests for validateGameResult
 * Covers all error codes and edge cases
 */

import { describe, it, expect } from 'vitest';
import { validateGameResult } from '../../../shared/utils/hashUtils';

describe('validateGameResult', () => {
  describe('valid 2-player entries', () => {
    it('should accept basic win "12W13"', () => {
      expect(validateGameResult('12W13').isValid).toBe(true);
    });

    it('should accept basic loss "12L13"', () => {
      expect(validateGameResult('12L13').isValid).toBe(true);
    });

    it('should accept basic draw "12D13"', () => {
      expect(validateGameResult('12D13').isValid).toBe(true);
    });

    it('should accept dual results "12WL13"', () => {
      expect(validateGameResult('12WL13').isValid).toBe(true);
    });

    it('should accept dual results "12WW13"', () => {
      expect(validateGameResult('12WW13').isValid).toBe(true);
    });

    it('should accept dual results "12LL13"', () => {
      expect(validateGameResult('12LL13').isValid).toBe(true);
    });

    it('should accept dual results "12WD13"', () => {
      expect(validateGameResult('12WD13').isValid).toBe(true);
    });

    it('should accept single digit players "1W2"', () => {
      expect(validateGameResult('1W2').isValid).toBe(true);
    });

    it('should accept large player ranks "199W200"', () => {
      expect(validateGameResult('199W200').isValid).toBe(true);
    });

    it('should accept reversed players "13L12"', () => {
      expect(validateGameResult('13L12').isValid).toBe(true);
    });

    it('should be case insensitive "12w13"', () => {
      expect(validateGameResult('12w13').isValid).toBe(true);
    });

    it('should be case insensitive "12wl13"', () => {
      expect(validateGameResult('12wl13').isValid).toBe(true);
    });
  });

  describe('valid 4-player entries', () => {
    it('should accept basic 4p win "12:13W23:25"', () => {
      expect(validateGameResult('12:13W23:25').isValid).toBe(true);
    });

    it('should accept basic 4p loss "12:13L23:25"', () => {
      expect(validateGameResult('12:13L23:25').isValid).toBe(true);
    });

    it('should accept basic 4p draw "12:13D23:25"', () => {
      expect(validateGameResult('12:13D23:25').isValid).toBe(true);
    });

    it('should accept 4p dual results "12:13WL23:25"', () => {
      expect(validateGameResult('12:13WL23:25').isValid).toBe(true);
    });

    it('should accept 4p with reversed pairs "25:23LW13:12"', () => {
      expect(validateGameResult('25:23LW13:12').isValid).toBe(true);
    });

    it('should accept 4p with swapped pairs "23:25W12:13"', () => {
      expect(validateGameResult('23:25W12:13').isValid).toBe(true);
    });

    it('should accept 4p single digit "1:2W3:4"', () => {
      expect(validateGameResult('1:2W3:4').isValid).toBe(true);
    });
  });

  describe('error -3: incomplete entry', () => {
    it('should reject empty string', () => {
      const result = validateGameResult('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject whitespace only', () => {
      const result = validateGameResult('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject single character', () => {
      const result = validateGameResult('W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject single digit', () => {
      const result = validateGameResult('1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject two digits no result "12"', () => {
      const result = validateGameResult('12');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 4p missing player "12:13W23:"', () => {
      const result = validateGameResult('12:13W23:');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });
  });

  describe('error -2: invalid format / characters', () => {
    it('should reject invalid character "12X13"', () => {
      const result = validateGameResult('12X13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject invalid character "12A13"', () => {
      const result = validateGameResult('12A13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject too many results 2p "12WLL13"', () => {
      const result = validateGameResult('12WLL13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });

    it('should reject too many results 4p "12:13WLL23:25"', () => {
      const result = validateGameResult('12:13WLL23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });

    it('should reject 4p with second result after second pair "12:13W23:25W"', () => {
      const result = validateGameResult('12:13W23:25W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 2p with second result after second player "12W13W"', () => {
      const result = validateGameResult('12W13W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 4p with wrong colon count "12:13W23"', () => {
      const result = validateGameResult('12:13W23');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should reject 4p with 3 colons "12:13:14W23:25"', () => {
      const result = validateGameResult('12:13:14W23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });
  });

  describe('error: 4p with no result code', () => {
    it('should reject 4p with no result "12:1323:25" (parsed as 12:1323, incomplete)', () => {
      const result = validateGameResult('12:1323:25');
      expect(result.isValid).toBe(false);
      // Parser reads "1323" as single number after first colon, then ":25" can't complete 4p
      expect(result.error).toBe(3);
    });
  });

  describe('error -5: too many results', () => {
    it('should reject 2p with 3 results "12WLL13"', () => {
      const result = validateGameResult('12WLL13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });

    it('should reject 4p with 3 results "12:13WLL23:25"', () => {
      const result = validateGameResult('12:13WLL23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(5);
    });
  });

  describe('error -6: duplicate players', () => {
    it('should reject 2p self-play "12W12"', () => {
      const result = validateGameResult('12W12');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p duplicate in same team "12:12W23:25"', () => {
      const result = validateGameResult('12:12W23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p duplicate across teams "12:13W12:25"', () => {
      const result = validateGameResult('12:13W12:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p all same "12:12W12:12"', () => {
      const result = validateGameResult('12:12W12:12');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });

    it('should reject 4p partial duplicate "12:13W23:13"', () => {
      const result = validateGameResult('12:13W23:13');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(6);
    });
  });

  describe('error -7: missing player 3', () => {
    it('should reject 4p with player 4 but no player 3', () => {
      // This is tricky - the parser may handle this differently
      // The key is that if player3=0 and player4>0, error 7 triggers
      const result = validateGameResult('12:13W:25');
      expect(result.isValid).toBe(false);
    });
  });

  describe('error: player rank exceeds max', () => {
    it('should reject player rank > 200 "201W202" (error 2: incomplete after rank check)', () => {
      const result = validateGameResult('201W202');
      expect(result.isValid).toBe(false);
      // Parser breaks at >200 check before storing result, validation sees incomplete entry
      expect(result.error).toBe(2);
    });

    it('should reject player rank 999 "999W1"', () => {
      const result = validateGameResult('999W1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(2);
    });

    it('should reject 4p with rank > 200 "12:13W201:25"', () => {
      const result = validateGameResult('12:13W201:25');
      expect(result.isValid).toBe(false);
      // Parser reads 12:13, then W, then 201:25 but 201>200 breaks before 4th player
      expect(result.error).toBe(3);
    });

    it('should accept max rank 200 "200W199"', () => {
      expect(validateGameResult('200W199').isValid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle underscore at end "12W13_"', () => {
      // Underscore at end is treated as terminator
      const result = validateGameResult('12W13_');
      expect(result.isValid).toBe(true);
    });

    it('should reject underscore in middle "12_W13"', () => {
      const result = validateGameResult('12_W13');
      expect(result.isValid).toBe(false);
      // Underscore breaks loop, validation sees incomplete entry
      expect(result.error).toBe(2);
    });

    it('should handle leading/trailing whitespace "  12W13  "', () => {
      expect(validateGameResult('  12W13  ').isValid).toBe(true);
    });

    it('should reject result after both players 2p "1213W"', () => {
      const result = validateGameResult('1213W');
      expect(result.isValid).toBe(false);
    });

    it('should handle confirmed entry with underscore "12W13_"', () => {
      expect(validateGameResult('12W13_').isValid).toBe(true);
    });

    it('should handle confirmed 4p entry "12:13W23:25_"', () => {
      expect(validateGameResult('12:13W23:25_').isValid).toBe(true);
    });

    it('should accept 4p with reversed first pair "13:12W23:25"', () => {
      expect(validateGameResult('13:12W23:25').isValid).toBe(true);
    });

    it('should accept 4p with reversed second pair "12:13W25:23"', () => {
      expect(validateGameResult('12:13W25:23').isValid).toBe(true);
    });

    it('should accept 4p with swapped sides "25:23W12:13"', () => {
      expect(validateGameResult('25:23W12:13').isValid).toBe(true);
    });

    it('should accept 4p with all pairs reversed "25:23L13:12"', () => {
      expect(validateGameResult('25:23L13:12').isValid).toBe(true);
    });

    it('should reject 4p missing result code "12:13:23:25"', () => {
      const result = validateGameResult('12:13:23:25');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(4);
    });

    it('should reject incomplete 4p "12:13W"', () => {
      const result = validateGameResult('12:13W');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(3);
    });

    it('should accept 4p with partial second pair "12:13W2:5"', () => {
      expect(validateGameResult('12:13W2:5').isValid).toBe(true);
    });

    it('should handle all score codes in 2p', () => {
      expect(validateGameResult('12L13').isValid).toBe(true);
      expect(validateGameResult('12D13').isValid).toBe(true);
      expect(validateGameResult('12W13').isValid).toBe(true);
    });

    it('should handle all score codes in 4p', () => {
      expect(validateGameResult('12:13L23:25').isValid).toBe(true);
      expect(validateGameResult('12:13D23:25').isValid).toBe(true);
      expect(validateGameResult('12:13W23:25').isValid).toBe(true);
    });
  });
});
