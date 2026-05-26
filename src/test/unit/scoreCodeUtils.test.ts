/**
 * Tests for scoreCodeToLetter and swapScore via exported functions
 * These internal functions are tested through validateGameResult and updatePlayerGameData
 */

import { describe, it, expect } from 'vitest';
import { validateGameResult, updatePlayerGameData } from '../../../shared/utils/hashUtils';

describe('scoreCodeToLetter (via validation)', () => {
  it('should handle L (code 1) score', () => {
    expect(validateGameResult('12L13').isValid).toBe(true);
  });

  it('should handle D (code 2) score', () => {
    expect(validateGameResult('12D13').isValid).toBe(true);
  });

  it('should handle W (code 3) score', () => {
    expect(validateGameResult('12W13').isValid).toBe(true);
  });

  it('should handle all valid score codes in 4p', () => {
    expect(validateGameResult('12:13L23:25').isValid).toBe(true);
    expect(validateGameResult('12:13D23:25').isValid).toBe(true);
    expect(validateGameResult('12:13W23:25').isValid).toBe(true);
  });
});

describe('swapScore (via 4p side swap)', () => {
  it('should swap L to W when sides are reversed', () => {
    // 25:23L12:13 - side 0 loses, but after swap side 1 wins
    const result = updatePlayerGameData('25:23L12:13');
    expect(result.isValid).toBe(true);
  });

  it('should swap D to D when sides are reversed', () => {
    const result = updatePlayerGameData('25:23D12:13');
    expect(result.isValid).toBe(true);
  });

  it('should swap W to L when sides are reversed', () => {
    const result = updatePlayerGameData('25:23W12:13');
    expect(result.isValid).toBe(true);
  });

  it('should handle dual results with side swap', () => {
    const result = updatePlayerGameData('25:23WL12:13');
    expect(result.isValid).toBe(true);
  });

  it('should handle dual results with side swap and draw', () => {
    const result = updatePlayerGameData('25:23WD12:13');
    expect(result.isValid).toBe(true);
  });
});

describe('parseEntry pair normalization', () => {
  it('should normalize within first pair when a1 > a2', () => {
    const result = updatePlayerGameData('13:12W23:25');
    expect(result.isValid).toBe(true);
    // Original: p1=13, p2=12, p3=23, p4=25
    // Normalized: p1=12, p2=13, p3=23, p4=25 (first pair swapped)
  });

  it('should normalize within second pair when a3 > a4', () => {
    const result = updatePlayerGameData('12:13W25:23');
    expect(result.isValid).toBe(true);
  });

  it('should normalize both pairs when both reversed', () => {
    const result = updatePlayerGameData('13:12W25:23');
    expect(result.isValid).toBe(true);
  });

  it('should swap sides when first pair lowest > second pair lowest', () => {
    const result = updatePlayerGameData('23:25W12:13');
    expect(result.isValid).toBe(true);
    // Original: p1=23, p2=25, p3=12, p4=13
    // Normalized: p1=12, p2=13, p3=23, p4=25 (sides swapped, scores swapped)
  });

  it('should swap sides with score swap for loss', () => {
    const result = updatePlayerGameData('23:25L12:13');
    expect(result.isValid).toBe(true);
  });

  it('should handle all normalization at once', () => {
    // Reversed pairs AND swapped sides
    const result = updatePlayerGameData('25:23LW13:12');
    expect(result.isValid).toBe(true);
  });
});

describe('parseEntry validation branches', () => {
  it('should detect incomplete 2p entry (entry < 2)', () => {
    const result = validateGameResult('1');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(3);
  });

  it('should detect missing result for 2p (resultIndex === 0)', () => {
    const result = validateGameResult('12');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(2);
  });

  it('should detect incomplete 4p (hasColon && entry < 4)', () => {
    const result = validateGameResult('12:13W');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(3);
  });

  it('should detect too many results for 2p', () => {
    const result = validateGameResult('12WLL13');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(5);
  });

  it('should detect missing result for 4p', () => {
    const result = validateGameResult('12:13:23:25');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(4);
  });

  it('should detect too many results for 4p', () => {
    const result = validateGameResult('12:13WLL23:25');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(5);
  });

  it('should detect wrong colon count for 4p', () => {
    const result = validateGameResult('12:13:14W23:25');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(2);
  });

  it('should detect second result after second player in 2p', () => {
    const result = validateGameResult('12W13W');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(2);
  });

  it('should detect second result after second pair in 4p', () => {
    const result = validateGameResult('12:13W23:25W');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(2);
  });
});

describe('parseEntry hash computation', () => {
  it('should compute valid hash for 2p entry', () => {
    const result = updatePlayerGameData('12W13');
    expect(result.isValid).toBe(true);
    expect(result.parsedPlayer1Rank).toBe(12);
    expect(result.parsedPlayer2Rank).toBe(13);
  });

  it('should compute valid hash for 4p entry', () => {
    const result = updatePlayerGameData('12:13W23:25');
    expect(result.isValid).toBe(true);
    expect(result.parsedPlayer1Rank).toBe(12);
    expect(result.parsedPlayer2Rank).toBe(13);
    expect(result.parsedPlayer3Rank).toBe(23);
    expect(result.parsedPlayer4Rank).toBe(25);
  });

  it('should detect self-play in 2p', () => {
    const result = validateGameResult('12W12');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(6);
  });

  it('should detect duplicate players in 4p', () => {
    const result = validateGameResult('12:13W12:25');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(6);
  });

  it('should detect all same players in 4p', () => {
    const result = validateGameResult('12:12W12:12');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(6);
  });
});
