/**
 * Tests for trophy report filename generation
 * Verifies that the filename prefix matches the current mode:
 * - Mini-game tournament -> mini-game-trophies
 * - Club ladder -> club-ladder-trophies
 */

import { describe, it, expect } from 'vitest';
import { isMiniGameTitle } from '../../utils/constants';

function getTrophyFilename(projectName: string, dateStr: string): string {
  const prefix = isMiniGameTitle(projectName) ? 'mini-game-trophies' : 'club-ladder-trophies';
  return `${prefix}_${dateStr}.tab`;
}

describe('Trophy report filename', () => {
  const dateStr = '2026-05-28';

  describe('mini-game tournament mode', () => {
    it('should use mini-game-trophies prefix for Queen_Game', () => {
      expect(getTrophyFilename('Queen_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for Pawn_Game', () => {
      expect(getTrophyFilename('Pawn_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for Kings_Cross', () => {
      expect(getTrophyFilename('Kings_Cross', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for Pillar_Game', () => {
      expect(getTrophyFilename('Pillar_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for Bishop_Game', () => {
      expect(getTrophyFilename('Bishop_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for BG_Game', () => {
      expect(getTrophyFilename('BG_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should use mini-game-trophies prefix for Bughouse', () => {
      expect(getTrophyFilename('Bughouse', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });

    it('should handle case-insensitive mini-game titles', () => {
      expect(getTrophyFilename('queen_game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
      expect(getTrophyFilename('QUEEN_GAME', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
      expect(getTrophyFilename('Bg_Game', dateStr)).toBe('mini-game-trophies_2026-05-28.tab');
    });
  });

  describe('club ladder mode', () => {
    it('should use club-ladder-trophies prefix for Bughouse Chess Ladder', () => {
      expect(getTrophyFilename('Bughouse Chess Ladder', dateStr)).toBe('club-ladder-trophies_2026-05-28.tab');
    });

    it('should use club-ladder-trophies prefix for custom project names', () => {
      expect(getTrophyFilename('Kings Cross', dateStr)).toBe('club-ladder-trophies_2026-05-28.tab');
      expect(getTrophyFilename('Chess Club 2026', dateStr)).toBe('club-ladder-trophies_2026-05-28.tab');
      expect(getTrophyFilename('My Ladder', dateStr)).toBe('club-ladder-trophies_2026-05-28.tab');
    });

    it('should use club-ladder-trophies prefix for empty string', () => {
      expect(getTrophyFilename('', dateStr)).toBe('club-ladder-trophies_2026-05-28.tab');
    });
  });

  describe('filename format', () => {
    it('should include date in ISO format', () => {
      const filename = getTrophyFilename('Queen_Game', '2026-01-15');
      expect(filename).toBe('mini-game-trophies_2026-01-15.tab');
    });

    it('should end with .tab extension', () => {
      const miniGameFilename = getTrophyFilename('BG_Game', dateStr);
      const clubFilename = getTrophyFilename('Bughouse Chess Ladder', dateStr);
      expect(miniGameFilename.endsWith('.tab')).toBe(true);
      expect(clubFilename.endsWith('.tab')).toBe(true);
    });
  });
});
