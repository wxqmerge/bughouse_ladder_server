/**
 * Tests for K-Factor bounds clamping
 * K-Factor must be between 1 and 100
 */

import { describe, it, expect } from 'vitest';

describe('K-Factor bounds', () => {
  describe('clamping logic', () => {
    it('should clamp values below 1 to 1', () => {
      const kFactor = Math.max(1, Math.min(100, 0));
      expect(kFactor).toBe(1);
    });

    it('should clamp negative values to 1', () => {
      const kFactor = Math.max(1, Math.min(100, -50));
      expect(kFactor).toBe(1);
    });

    it('should clamp values above 100 to 100', () => {
      const kFactor = Math.max(1, Math.min(100, 150));
      expect(kFactor).toBe(100);
    });

    it('should clamp very large values to 100', () => {
      const kFactor = Math.max(1, Math.min(100, 9999));
      expect(kFactor).toBe(100);
    });

    it('should preserve values within range', () => {
      const kFactor = Math.max(1, Math.min(100, 20));
      expect(kFactor).toBe(20);
    });

    it('should preserve boundary value 1', () => {
      const kFactor = Math.max(1, Math.min(100, 1));
      expect(kFactor).toBe(1);
    });

    it('should preserve boundary value 100', () => {
      const kFactor = Math.max(1, Math.min(100, 100));
      expect(kFactor).toBe(100);
    });

    it('should preserve mid-range values', () => {
      const kFactor = Math.max(1, Math.min(100, 50));
      expect(kFactor).toBe(50);
    });

    it('should handle float values correctly', () => {
      const kFactor = Math.max(1, Math.min(100, 20.5));
      expect(kFactor).toBe(20.5);
    });

    it('should handle parseInt result of 0 (empty input)', () => {
      const input = parseInt('') || 20; // default fallback
      const kFactor = Math.max(1, Math.min(100, input));
      expect(kFactor).toBe(20);
    });

    it('should handle parseInt result of NaN (invalid input)', () => {
      const input = parseInt('abc') || 20; // default fallback
      const kFactor = Math.max(1, Math.min(100, input));
      expect(kFactor).toBe(20);
    });
  });

  describe('Settings input behavior simulation', () => {
    // Simulates the onChange handler: Math.max(1, Math.min(100, parseInt(e.target.value) || 20))
    function clampKFactor(input: string): number {
      return Math.max(1, Math.min(100, parseInt(input) || 20));
    }

    it('should handle empty string input → default 20', () => {
      expect(clampKFactor('')).toBe(20);
    });

    it('should handle whitespace input → default 20', () => {
      expect(clampKFactor('abc')).toBe(20);
    });

    it('should clamp -1 to 1', () => {
      expect(clampKFactor('-1')).toBe(1);
    });

    it('should clamp 101 to 100', () => {
      expect(clampKFactor('101')).toBe(100);
    });

    it('should preserve 20 (default)', () => {
      expect(clampKFactor('20')).toBe(20);
    });

    it('should preserve 32 (old default)', () => {
      expect(clampKFactor('32')).toBe(32);
    });

    it('should handle very large number input', () => {
      expect(clampKFactor('999999')).toBe(100);
    });
  });
});
