/**
 * Tests for normalize4Player normalization function
 * Covers all pair swap combos + pair reordering combos
 */

import { describe, it, expect } from 'vitest';
import { normalize4Player } from '../../../shared/utils/hashUtils';

describe('normalize4Player', () => {
  describe('within-pair swaps', () => {
    it('should swap players within first pair when a1 > a2', () => {
      // 13:12,23:25 → 12:13,23:25 (pairs sorted by lowest, within-pair sorted)
      const result = normalize4Player(13, 12, 23, 25);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should swap players within second pair when a3 > a4', () => {
      // 12:13,25:23 → 12:13,23:25
      const result = normalize4Player(12, 13, 25, 23);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should swap both pairs when both are out of order', () => {
      // 13:12,25:23 → 12:13,23:25
      const result = normalize4Player(13, 12, 25, 23);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should not swap when both pairs already in order', () => {
      // 12:13,23:25 stays 12:13,23:25
      const result = normalize4Player(12, 13, 23, 25);
      expect(result).toEqual([12, 13, 23, 25]);
    });
  });

  describe('pair reordering', () => {
    it('should reorder pairs when first pair lowest > second pair lowest', () => {
      // 23:25,12:13 → 12:13,23:25 (pairs swapped, within-pair sorted)
      const result = normalize4Player(23, 25, 12, 13);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should keep pair order when first pair lowest < second pair lowest', () => {
      // 12:13,23:25 stays 12:13,23:25
      const result = normalize4Player(12, 13, 23, 25);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should reorder with within-pair swaps on both pairs', () => {
      // 25:23,13:12 → 12:13,23:25
      const result = normalize4Player(25, 23, 13, 12);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should reorder with within-pair swap on first pair only', () => {
      // 25:23,12:13 → 12:13,23:25
      const result = normalize4Player(25, 23, 12, 13);
      expect(result).toEqual([12, 13, 23, 25]);
    });

    it('should reorder with within-pair swap on second pair only', () => {
      // 23:25,13:12 → 12:13,23:25
      const result = normalize4Player(23, 25, 13, 12);
      expect(result).toEqual([12, 13, 23, 25]);
    });
  });

  describe('equal values within pairs', () => {
    it('should handle equal values in first pair', () => {
      const result = normalize4Player(12, 12, 23, 25);
      expect(result).toEqual([12, 12, 23, 25]);
    });

    it('should handle equal values in second pair', () => {
      const result = normalize4Player(12, 13, 23, 23);
      expect(result).toEqual([12, 13, 23, 23]);
    });

    it('should handle equal values in both pairs', () => {
      const result = normalize4Player(12, 12, 23, 23);
      expect(result).toEqual([12, 12, 23, 23]);
    });
  });

  describe('identity and edge cases', () => {
    it('should return same order when already fully normalized', () => {
      const result = normalize4Player(1, 2, 3, 4);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should handle single-digit ranks', () => {
      const result = normalize4Player(9, 8, 7, 6);
      expect(result).toEqual([6, 7, 8, 9]);
    });

    it('should handle large rank numbers', () => {
      const result = normalize4Player(50, 40, 30, 20);
      expect(result).toEqual([20, 30, 40, 50]);
    });

    it('should handle all same values', () => {
      const result = normalize4Player(5, 5, 5, 5);
      expect(result).toEqual([5, 5, 5, 5]);
    });
  });

  describe('conflict detection equivalence', () => {
    it('should produce same normalized form regardless of input order permutations', () => {
      // All these permutations represent the same game and should normalize to the same result
      const permutations = [
        normalize4Player(1, 2, 3, 4),
        normalize4Player(2, 1, 3, 4),
        normalize4Player(1, 2, 4, 3),
        normalize4Player(2, 1, 4, 3),
        normalize4Player(3, 4, 1, 2),
        normalize4Player(4, 3, 1, 2),
        normalize4Player(3, 4, 2, 1),
        normalize4Player(4, 3, 2, 1),
      ];

      const first = permutations[0];
      for (const p of permutations) {
        expect(p).toEqual(first);
      }
    });

    it('should produce different normalized forms for different player sets', () => {
      const a = normalize4Player(1, 2, 3, 4);
      const b = normalize4Player(1, 2, 3, 5);
      expect(a).not.toEqual(b);
    });
  });
});
