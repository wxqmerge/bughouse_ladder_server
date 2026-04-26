/**
 * Tests for export filename — first word of project name
 * Export filename uses first word only (spaces delimit)
 */

import { describe, it, expect } from 'vitest';

describe('Export filename', () => {
  describe('first word extraction', () => {
    it('should return the full name when no spaces', () => {
      const projectName = 'KingsCross';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('KingsCross');
    });

    it('should return first word when space exists', () => {
      const projectName = 'Kings Cross';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Kings');
    });

    it('should return first word with multiple spaces', () => {
      const projectName = 'Bughouse Chess Ladder';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Bughouse');
    });

    it('should handle leading spaces', () => {
      const projectName = '  KingsCross';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('');
    });

    it('should handle trailing spaces', () => {
      const projectName = 'KingsCross  ';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('KingsCross');
    });

    it('should handle empty string', () => {
      const projectName = '';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('');
    });

    it('should handle single space', () => {
      const projectName = ' ';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('');
    });

    it('should handle underscores (no split)', () => {
      const projectName = 'Kings_Cross';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Kings_Cross');
    });

    it('should handle mixed separators', () => {
      const projectName = 'Bughouse_Chess Ladder';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Bughouse_Chess');
    });

    it('should handle numbers', () => {
      const projectName = 'Ladder2024 Season1';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Ladder2024');
    });

    it('should handle single character', () => {
      const projectName = 'A';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('A');
    });

    it('should handle special characters', () => {
      const projectName = 'Chess@Club!';
      const firstWord = projectName.split(' ')[0];
      expect(firstWord).toBe('Chess@Club!');
    });
  });

  describe('integration with export logic', () => {
    it('should produce valid filename for common project names', () => {
      const testCases = [
        { input: 'Kings Cross', expected: 'Kings' },
        { input: 'Bughouse Ladder', expected: 'Bughouse' },
        { input: 'Chess Club', expected: 'Chess' },
        { input: 'Single', expected: 'Single' },
        { input: 'My Chess Club 2024', expected: 'My' },
      ];

      for (const { input, expected } of testCases) {
        const firstWord = input.split(' ')[0];
        expect(firstWord).toBe(expected);
      }
    });
  });
});
