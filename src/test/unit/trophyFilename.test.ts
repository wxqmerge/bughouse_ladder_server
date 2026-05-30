/**
 * Tests for trophy report filename generation
 * Verifies that the filename prefix matches the current mode:
 * - LOCAL mode -> localhost-trophies
 * - SERVER/DEV mode -> <project-name>-trophies (sanitized)
 */

import { describe, it, expect } from 'vitest';

enum DataServiceMode {
  LOCAL = 'LOCAL',
  DEVELOPMENT = 'DEVELOPMENT',
  SERVER = 'SERVER',
}

function sanitizeProjectName(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'ladder';
}

function getTrophyFilename(mode: DataServiceMode, projectName: string, dateStr: string): string {
  let prefix: string;
  if (mode === DataServiceMode.LOCAL) {
    prefix = 'localhost';
  } else {
    prefix = sanitizeProjectName(projectName);
  }
  return `${prefix}-trophies_${dateStr}.tab`;
}

describe('Trophy report filename', () => {
  const dateStr = '2026-05-28';

  describe('LOCAL mode', () => {
    it('should use localhost prefix', () => {
      expect(getTrophyFilename(DataServiceMode.LOCAL, 'Bughouse Chess Ladder', dateStr)).toBe('localhost-trophies_2026-05-28.tab');
    });

    it('should ignore project name in LOCAL mode', () => {
      expect(getTrophyFilename(DataServiceMode.LOCAL, 'My Custom Ladder', dateStr)).toBe('localhost-trophies_2026-05-28.tab');
    });
  });

  describe('DEVELOPMENT mode', () => {
    it('should use sanitized project name', () => {
      expect(getTrophyFilename(DataServiceMode.DEVELOPMENT, 'dev-ladder', dateStr)).toBe('dev-ladder-trophies_2026-05-28.tab');
    });

    it('should sanitize spaces and special chars', () => {
      expect(getTrophyFilename(DataServiceMode.DEVELOPMENT, 'My Chess Ladder', dateStr)).toBe('my-chess-ladder-trophies_2026-05-28.tab');
    });

    it('should handle empty project name', () => {
      expect(getTrophyFilename(DataServiceMode.DEVELOPMENT, '', dateStr)).toBe('ladder-trophies_2026-05-28.tab');
    });
  });

  describe('SERVER mode', () => {
    it('should use sanitized project name', () => {
      expect(getTrophyFilename(DataServiceMode.SERVER, 'Kings Cross', dateStr)).toBe('kings-cross-trophies_2026-05-28.tab');
    });

    it('should remove special characters', () => {
      expect(getTrophyFilename(DataServiceMode.SERVER, 'Chess@Club! 2026', dateStr)).toBe('chessclub-2026-trophies_2026-05-28.tab');
    });
  });

  describe('filename format', () => {
    it('should include date in ISO format', () => {
      const filename = getTrophyFilename(DataServiceMode.DEVELOPMENT, 'dev-ladder', '2026-01-15');
      expect(filename).toBe('dev-ladder-trophies_2026-01-15.tab');
    });

    it('should end with .tab extension', () => {
      const localFilename = getTrophyFilename(DataServiceMode.LOCAL, '', dateStr);
      const serverFilename = getTrophyFilename(DataServiceMode.SERVER, 'My Ladder', dateStr);
      expect(localFilename.endsWith('.tab')).toBe(true);
      expect(serverFilename.endsWith('.tab')).toBe(true);
    });
  });
});
