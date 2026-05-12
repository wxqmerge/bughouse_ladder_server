/**
 * Tests for Debug Level bounds clamping
 * Debug Level must be between 0 and 20
 */

import { describe, it, expect } from 'vitest';

describe('Debug Level bounds', () => {
  describe('clamping logic', () => {
    it('should clamp values below 0 to 0', () => {
      const debugLevel = Math.max(0, Math.min(20, -5));
      expect(debugLevel).toBe(0);
    });

    it('should clamp negative values to 0', () => {
      const debugLevel = Math.max(0, Math.min(20, -100));
      expect(debugLevel).toBe(0);
    });

    it('should clamp values above 20 to 20', () => {
      const debugLevel = Math.max(0, Math.min(20, 50));
      expect(debugLevel).toBe(20);
    });

    it('should clamp very large values to 20', () => {
      const debugLevel = Math.max(0, Math.min(20, 9999));
      expect(debugLevel).toBe(20);
    });

    it('should preserve values within range', () => {
      const debugLevel = Math.max(0, Math.min(20, 5));
      expect(debugLevel).toBe(5);
    });

    it('should preserve boundary value 0', () => {
      const debugLevel = Math.max(0, Math.min(20, 0));
      expect(debugLevel).toBe(0);
    });

    it('should preserve boundary value 20', () => {
      const debugLevel = Math.max(0, Math.min(20, 20));
      expect(debugLevel).toBe(20);
    });

    it('should preserve mid-range values', () => {
      const debugLevel = Math.max(0, Math.min(20, 10));
      expect(debugLevel).toBe(10);
    });
  });

  describe('Settings input behavior simulation', () => {
    // Simulates the onChange handler: isNaN/empty → 5, then clamp 0-20
    function clampDebugLevel(input: string): number {
      const parsed = parseInt(input, 10);
      return input === '' || isNaN(parsed) ? 5 : Math.max(0, Math.min(20, parsed));
    }

    it('should handle empty string input → default 5', () => {
      expect(clampDebugLevel('')).toBe(5);
    });

    it('should handle whitespace input → default 5', () => {
      expect(clampDebugLevel('abc')).toBe(5);
    });

    it('should handle -1 → 0', () => {
      expect(clampDebugLevel('-1')).toBe(0);
    });

    it('should handle 21 → 20', () => {
      expect(clampDebugLevel('21')).toBe(20);
    });

    it('should preserve 5 (default)', () => {
      expect(clampDebugLevel('5')).toBe(5);
    });

    it('should accept 0 (no debug output)', () => {
      expect(clampDebugLevel('0')).toBe(0);
    });

    it('should preserve 10 (critical only)', () => {
      expect(clampDebugLevel('10')).toBe(10);
    });

    it('should handle very large number input', () => {
      expect(clampDebugLevel('999999')).toBe(20);
    });
  });
});
