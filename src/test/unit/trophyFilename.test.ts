/**
 * Tests for trophy report filename generation
 * Prefix is derived from window.location:
 * - http://localhost:5173/ → localhost
 * - https://chess4.us/dc-dojo-ladder/dist/ → dc-dojo-ladder
 */

import { describe, it, expect } from 'vitest';

function getTrophyPrefix(pathname: string, hostname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] !== 'dist') {
    return segments[0];
  }
  return hostname;
}

function getTrophyFilename(pathname: string, hostname: string, dateStr: string): string {
  const prefix = getTrophyPrefix(pathname, hostname);
  return `${prefix}-trophies_${dateStr}.tab`;
}

describe('Trophy report filename', () => {
  const dateStr = '2026-05-28';

  describe('LOCAL dev server (root path)', () => {
    it('should use localhost prefix', () => {
      expect(getTrophyFilename('/', 'localhost', dateStr)).toBe('localhost-trophies_2026-05-28.tab');
    });

    it('should work with localhost:5173', () => {
      expect(getTrophyFilename('/', 'localhost:5173', dateStr)).toBe('localhost:5173-trophies_2026-05-28.tab');
    });
  });

  describe('Subdirectory deployment', () => {
    it('should use first path segment', () => {
      expect(getTrophyFilename('/dc-dojo-ladder/dist/', 'chess4.us', dateStr)).toBe('dc-dojo-ladder-trophies_2026-05-28.tab');
    });

    it('should work without /dist/ suffix', () => {
      expect(getTrophyFilename('/dc-dojo-ladder/', 'chess4.us', dateStr)).toBe('dc-dojo-ladder-trophies_2026-05-28.tab');
    });

    it('should handle nested paths', () => {
      expect(getTrophyFilename('/my-ladder/dist/index.html', 'example.com', dateStr)).toBe('my-ladder-trophies_2026-05-28.tab');
    });
  });

  describe('Production root deployment', () => {
    it('should use hostname when deployed to /dist/', () => {
      expect(getTrophyFilename('/dist/', 'chess4.us', dateStr)).toBe('chess4.us-trophies_2026-05-28.tab');
    });

    it('should use hostname when deployed to /', () => {
      expect(getTrophyFilename('/', 'chess4.us', dateStr)).toBe('chess4.us-trophies_2026-05-28.tab');
    });
  });

  describe('filename format', () => {
    it('should include date in ISO format', () => {
      expect(getTrophyFilename('/dc-dojo-ladder/dist/', 'chess4.us', '2026-01-15')).toBe('dc-dojo-ladder-trophies_2026-01-15.tab');
    });

    it('should end with .tab extension', () => {
      expect(getTrophyFilename('/', 'localhost', dateStr)).toBe('localhost-trophies_2026-05-28.tab');
      expect(getTrophyFilename('/my-ladder/', 'example.com', dateStr)).toBe('my-ladder-trophies_2026-05-28.tab');
    });
  });
});
