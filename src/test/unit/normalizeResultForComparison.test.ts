/**
 * Tests for normalizeResultForComparison
 * Verifies that result normalization handles score perspective swapping correctly
 * for both 2-player and 4-player games.
 *
 * Key invariant: "8W9" and "9L8" must normalize to the same canonical form.
 * "8W9" and "9W8" must normalize to different forms (conflict).
 */

import { describe, it, expect } from 'vitest';
import { normalizeResultForComparison, scoreCodeToLetter } from '../../../shared/utils/hashUtils';

/**
 * Score codes: 0=O(over), 1=L(loss), 2=D(draw), 3=W(win)
 */
const O = 0;
const L = 1;
const D = 2;
const W = 3;

describe('normalizeResultForComparison - 2-player', () => {
  it('should normalize "8W9" to "8W9" (already canonical)', () => {
    const result = normalizeResultForComparison('8W9_', 8, [8, 9, 0, 0], [W, O]);
    expect(result).toBe('8W9');
  });

  it('should normalize "9L8" to "8W9" (score swapped)', () => {
    const result = normalizeResultForComparison('9L8_', 9, [9, 8, 0, 0], [L, O]);
    expect(result).toBe('8W9');
  });

  it('should normalize "8L9" to "8L9" (already canonical)', () => {
    const result = normalizeResultForComparison('8L9_', 8, [8, 9, 0, 0], [L, O]);
    expect(result).toBe('8L9');
  });

  it('should normalize "9W8" to "8L9" (score swapped)', () => {
    const result = normalizeResultForComparison('9W8_', 9, [9, 8, 0, 0], [W, O]);
    expect(result).toBe('8L9');
  });

  it('should normalize "8D9" to "8D9" (draw, no swap needed)', () => {
    const result = normalizeResultForComparison('8D9_', 8, [8, 9, 0, 0], [D, O]);
    expect(result).toBe('8D9');
  });

  it('should normalize "9D8" to "8D9" (draw, players sorted)', () => {
    const result = normalizeResultForComparison('9D8_', 9, [9, 8, 0, 0], [D, O]);
    expect(result).toBe('8D9');
  });

  it('should normalize "12WL13" to "12WL13" (dual result, already canonical)', () => {
    const result = normalizeResultForComparison('12WL13_', 12, [12, 13, 0, 0], [W, L]);
    expect(result).toBe('12WL13');
  });

  it('should normalize "13LW12" to "12WL13" (dual result, score swapped)', () => {
    const result = normalizeResultForComparison('13LW12_', 13, [13, 12, 0, 0], [L, W]);
    expect(result).toBe('12WL13');
  });

  it('should be consistent: 8W9 and 9L8 normalize to the same form', () => {
    const n1 = normalizeResultForComparison('8W9_', 8, [8, 9, 0, 0], [W, O]);
    const n2 = normalizeResultForComparison('9L8_', 9, [9, 8, 0, 0], [L, O]);
    expect(n1).toBe(n2);
    expect(n1).toBe('8W9');
  });

  it('should be different: 8W9 and 9W8 normalize to different forms (conflict)', () => {
    const n1 = normalizeResultForComparison('8W9_', 8, [8, 9, 0, 0], [W, O]);
    const n2 = normalizeResultForComparison('9W8_', 9, [9, 8, 0, 0], [W, O]);
    expect(n1).not.toBe(n2);
    expect(n1).toBe('8W9');
    expect(n2).toBe('8L9');
  });

  it('should be different: 8L9 and 9L8 normalize to different forms (conflict)', () => {
    const n1 = normalizeResultForComparison('8L9_', 8, [8, 9, 0, 0], [L, O]);
    const n2 = normalizeResultForComparison('9L8_', 9, [9, 8, 0, 0], [L, O]);
    expect(n1).not.toBe(n2);
    expect(n1).toBe('8L9');
    expect(n2).toBe('8W9');
  });

  it('should handle large player ranks', () => {
    const n1 = normalizeResultForComparison('199W200_', 199, [199, 200, 0, 0], [W, O]);
    const n2 = normalizeResultForComparison('200L199_', 200, [200, 199, 0, 0], [L, O]);
    expect(n1).toBe(n2);
    expect(n1).toBe('199W200');
  });
});

describe('normalizeResultForComparison - 4-player', () => {
  it('should normalize "1:2W3:4" to "1:2W3:4" (already canonical)', () => {
    const result = normalizeResultForComparison('1:2W3:4_', 1, [1, 2, 3, 4], [W, O]);
    expect(result).toBe('1:2W3:4');
  });

  it('should normalize "3:4L1:2" to "1:2W3:4" (teams swapped, score swapped)', () => {
    const result = normalizeResultForComparison('3:4L1:2_', 3, [3, 4, 1, 2], [L, O]);
    expect(result).toBe('1:2W3:4');
  });

  it('should normalize "2:1W4:3" to "1:2W3:4" (within-pair sorted)', () => {
    const result = normalizeResultForComparison('2:1W4:3_', 2, [2, 1, 4, 3], [W, O]);
    expect(result).toBe('1:2W3:4');
  });

  it('should normalize "4:3L2:1" to "1:2W3:4" (fully reversed)', () => {
    const result = normalizeResultForComparison('4:3L2:1_', 4, [4, 3, 2, 1], [L, O]);
    expect(result).toBe('1:2W3:4');
  });

  it('should normalize "1:2L3:4" to "1:2L3:4" (already canonical)', () => {
    const result = normalizeResultForComparison('1:2L3:4_', 1, [1, 2, 3, 4], [L, O]);
    expect(result).toBe('1:2L3:4');
  });

  it('should normalize "3:4W1:2" to "1:2L3:4" (teams swapped, score swapped)', () => {
    const result = normalizeResultForComparison('3:4W1:2_', 3, [3, 4, 1, 2], [W, O]);
    expect(result).toBe('1:2L3:4');
  });

  it('should normalize "1:2D3:4" to "1:2D3:4" (draw, already canonical)', () => {
    const result = normalizeResultForComparison('1:2D3:4_', 1, [1, 2, 3, 4], [D, O]);
    expect(result).toBe('1:2D3:4');
  });

  it('should normalize "3:4D1:2" to "1:2D3:4" (draw, teams swapped)', () => {
    const result = normalizeResultForComparison('3:4D1:2_', 3, [3, 4, 1, 2], [D, O]);
    expect(result).toBe('1:2D3:4');
  });

  it('should be consistent: 1:2W3:4 and 3:4L1:2 normalize to the same form', () => {
    const n1 = normalizeResultForComparison('1:2W3:4_', 1, [1, 2, 3, 4], [W, O]);
    const n2 = normalizeResultForComparison('3:4L1:2_', 3, [3, 4, 1, 2], [L, O]);
    expect(n1).toBe(n2);
    expect(n1).toBe('1:2W3:4');
  });

  it('should be different: 1:2W3:4 and 3:4W1:2 normalize to different forms (conflict)', () => {
    const n1 = normalizeResultForComparison('1:2W3:4_', 1, [1, 2, 3, 4], [W, O]);
    const n2 = normalizeResultForComparison('3:4W1:2_', 3, [3, 4, 1, 2], [W, O]);
    expect(n1).not.toBe(n2);
    expect(n1).toBe('1:2W3:4');
    expect(n2).toBe('1:2L3:4');
  });

  it('should be different: 1:2L3:4 and 3:4L1:2 normalize to different forms (conflict)', () => {
    const n1 = normalizeResultForComparison('1:2L3:4_', 1, [1, 2, 3, 4], [L, O]);
    const n2 = normalizeResultForComparison('3:4L1:2_', 3, [3, 4, 1, 2], [L, O]);
    expect(n1).not.toBe(n2);
    expect(n1).toBe('1:2L3:4');
    expect(n2).toBe('1:2W3:4');
  });

  it('should handle within-pair swap: 2:1W4:3 normalizes same as 1:2W3:4', () => {
    const n1 = normalizeResultForComparison('1:2W3:4_', 1, [1, 2, 3, 4], [W, O]);
    const n2 = normalizeResultForComparison('2:1W4:3_', 2, [2, 1, 4, 3], [W, O]);
    expect(n1).toBe(n2);
    expect(n1).toBe('1:2W3:4');
  });

  it('should handle fully reversed: 4:3L2:1 normalizes same as 1:2W3:4', () => {
    const n1 = normalizeResultForComparison('1:2W3:4_', 1, [1, 2, 3, 4], [W, O]);
    const n2 = normalizeResultForComparison('4:3L2:1_', 4, [4, 3, 2, 1], [L, O]);
    expect(n1).toBe(n2);
    expect(n1).toBe('1:2W3:4');
  });

  it('should handle dual result: 1:2WL3:4 normalizes correctly', () => {
    const result = normalizeResultForComparison('1:2WL3:4_', 1, [1, 2, 3, 4], [W, L]);
    expect(result).toBe('1:2WL3:4');
  });

  it('should handle dual result reversed: 3:4LW1:2 normalizes to 1:2WL3:4', () => {
    const result = normalizeResultForComparison('3:4LW1:2_', 3, [3, 4, 1, 2], [L, W]);
    expect(result).toBe('1:2WL3:4');
  });
});

describe('normalizeResultForComparison - consistency with exported normalizers', () => {
  it('should match normalize2Player player ordering', () => {
    const result = normalizeResultForComparison('9L8_', 9, [9, 8, 0, 0], [L, O]);
    // Players should be sorted: 8 first, 9 second
    expect(result.startsWith('8')).toBe(true);
    expect(result.endsWith('8')).toBe(false);
  });

  it('should match normalize4Player player ordering', () => {
    const result = normalizeResultForComparison('4:3L2:1_', 4, [4, 3, 2, 1], [L, O]);
    // Teams sorted by lowest: team(1,2) first, team(3,4) second
    expect(result.startsWith('1:2')).toBe(true);
    expect(result.endsWith('3:4')).toBe(true);
  });
});
