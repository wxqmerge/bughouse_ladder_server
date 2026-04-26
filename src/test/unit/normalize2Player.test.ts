/**
 * Tests for normalize2Player normalization function
 */

import { describe, it, expect } from 'vitest';
import { normalize2Player } from '../../../shared/utils/hashUtils';

describe('normalize2Player', () => {
  describe('basic ordering', () => {
    it('should return ascending order when already sorted', () => {
      const result = normalize2Player(1, 2);
      expect(result).toEqual([1, 2]);
    });

    it('should swap when second player is lower', () => {
      const result = normalize2Player(2, 1);
      expect(result).toEqual([1, 2]);
    });

    it('should handle larger numbers', () => {
      const result = normalize2Player(15, 8);
      expect(result).toEqual([8, 15]);
    });

    it('should handle already sorted larger numbers', () => {
      const result = normalize2Player(8, 15);
      expect(result).toEqual([8, 15]);
    });
  });

  describe('equal values', () => {
    it('should handle equal values', () => {
      const result = normalize2Player(5, 5);
      expect(result).toEqual([5, 5]);
    });

    it('should handle equal values in reverse', () => {
      const result = normalize2Player(5, 5);
      expect(result).toEqual([5, 5]);
    });
  });

  describe('edge cases', () => {
    it('should handle single-digit ranks', () => {
      const result = normalize2Player(9, 3);
      expect(result).toEqual([3, 9]);
    });

    it('should handle rank 1', () => {
      const result = normalize2Player(1, 10);
      expect(result).toEqual([1, 10]);
    });

    it('should handle large rank numbers', () => {
      const result = normalize2Player(50, 30);
      expect(result).toEqual([30, 50]);
    });
  });

  describe('conflict detection equivalence', () => {
    it('should produce same normalized form for both orderings', () => {
      const a = normalize2Player(1, 2);
      const b = normalize2Player(2, 1);
      expect(a).toEqual(b);
    });

    it('should produce different normalized forms for different player sets', () => {
      const a = normalize2Player(1, 2);
      const b = normalize2Player(1, 3);
      expect(a).not.toEqual(b);
    });
  });
});
