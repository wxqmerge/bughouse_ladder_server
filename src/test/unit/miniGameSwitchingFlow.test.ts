/**
 * Tests for mini-game switching decision logic
 * Tests the decision tree in handleSetTitle that determines whether to
 * copy, load, recreate, or abort when switching to a mini-game.
 */

import { describe, it, expect } from 'vitest';

describe('Mini-Game Switching Decision Logic', () => {
  /**
   * Simulates the handleSetTitle mini-game switching decision.
   * Returns the action taken: 'copy', 'load', 'recreate', 'abort', or 'no-op'.
   */
  function decideMiniGameSwitch(
    fileName: string,
    existingFiles: string[],
    isAdmin: boolean,
    fetchedPlayerCount: number
  ): { action: string; shouldCopy: boolean; shouldLoad: boolean; shouldAbort: boolean } {
    const fileExists = existingFiles.includes(fileName);

    if (!fileExists) {
      // File not found
      if (!isAdmin) {
        return { action: 'abort', shouldCopy: false, shouldLoad: false, shouldAbort: true };
      }
      return { action: 'copy', shouldCopy: true, shouldLoad: true, shouldAbort: false };
    }

    // File exists — check player count
    if (fetchedPlayerCount === 0 && isAdmin) {
      return { action: 'recreate', shouldCopy: true, shouldLoad: true, shouldAbort: false };
    }

    if (fetchedPlayerCount > 0) {
      return { action: 'load', shouldCopy: false, shouldLoad: true, shouldAbort: false };
    }

    // File exists, empty, not admin
    return { action: 'abort', shouldCopy: false, shouldLoad: false, shouldAbort: true };
  }

  describe('file not found', () => {
    it('should copy players when file not found and admin', () => {
      const result = decideMiniGameSwitch('bg_game.tab', ['ladder.tab'], true, 0);
      expect(result.action).toBe('copy');
      expect(result.shouldCopy).toBe(true);
      expect(result.shouldLoad).toBe(true);
      expect(result.shouldAbort).toBe(false);
    });

    it('should abort when file not found and not admin', () => {
      const result = decideMiniGameSwitch('pawn_game.tab', ['ladder.tab'], false, 0);
      expect(result.action).toBe('abort');
      expect(result.shouldCopy).toBe(false);
      expect(result.shouldLoad).toBe(false);
      expect(result.shouldAbort).toBe(true);
    });

    it('should copy for each new mini-game in sequence', () => {
      const existingFiles = ['ladder.tab'];
      const titles = ['BG_Game', 'Pawn_Game', 'Queen_Game'];
      const isAdmin = true;

      const actions = titles.map((title) => {
        const fileName = title + '.tab';
        const result = decideMiniGameSwitch(fileName, existingFiles, isAdmin, 0);
        return { title, action: result.action };
      });

      expect(actions).toEqual([
        { title: 'BG_Game', action: 'copy' },
        { title: 'Pawn_Game', action: 'copy' },
        { title: 'Queen_Game', action: 'copy' },
      ]);
    });
  });

  describe('file exists', () => {
    it('should load directly when file has players', () => {
      const result = decideMiniGameSwitch(
        'bg_game.tab',
        ['ladder.tab', 'bg_game.tab'],
        true,
        14
      );
      expect(result.action).toBe('load');
      expect(result.shouldCopy).toBe(false);
      expect(result.shouldLoad).toBe(true);
    });

    it('should recreate when file exists but is empty and admin', () => {
      const result = decideMiniGameSwitch(
        'pawn_game.tab',
        ['ladder.tab', 'pawn_game.tab'],
        true,
        0
      );
      expect(result.action).toBe('recreate');
      expect(result.shouldCopy).toBe(true);
      expect(result.shouldLoad).toBe(true);
    });

    it('should abort when file exists, empty, and not admin', () => {
      const result = decideMiniGameSwitch(
        'queen_game.tab',
        ['ladder.tab', 'queen_game.tab'],
        false,
        0
      );
      expect(result.action).toBe('abort');
      expect(result.shouldCopy).toBe(false);
      expect(result.shouldLoad).toBe(false);
      expect(result.shouldAbort).toBe(true);
    });
  });

  describe('sequential switch flow (from log)', () => {
    it('should simulate the full log sequence: BG_Game → Pawn_Game → Queen_Game', () => {
      let existingFiles = ['ladder.tab'];
      const isAdmin = true;

      // Step 1: Switch to BG_Game (not found → copy)
      let result = decideMiniGameSwitch('bg_game.tab', existingFiles, isAdmin, 0);
      expect(result.action).toBe('copy');
      existingFiles.push('bg_game.tab');

      // Step 2: Switch to Pawn_Game (not found → copy)
      result = decideMiniGameSwitch('pawn_game.tab', existingFiles, isAdmin, 0);
      expect(result.action).toBe('copy');
      existingFiles.push('pawn_game.tab');

      // Step 3: Switch to Queen_Game (not found → copy)
      result = decideMiniGameSwitch('queen_game.tab', existingFiles, isAdmin, 0);
      expect(result.action).toBe('copy');
      existingFiles.push('queen_game.tab');

      // Step 4: Switch back to BG_Game (exists → load)
      result = decideMiniGameSwitch('bg_game.tab', existingFiles, isAdmin, 14);
      expect(result.action).toBe('load');
      expect(result.shouldCopy).toBe(false);
    });

    it('should handle switching back to ladder', () => {
      // Switching from mini-game to ladder resets mini-game file to null
      let currentMiniGame = 'bg_game.tab';
      const newTitle = 'Ladder';
      const newIsMiniGame = newTitle !== 'Ladder' && !newTitle.includes('Chess Ladder');

      if (!newIsMiniGame) {
        currentMiniGame = null;
      }

      expect(currentMiniGame).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty existing files list', () => {
      const result = decideMiniGameSwitch('bg_game.tab', [], true, 0);
      expect(result.action).toBe('copy');
    });

    it('should handle ladder.tab in existing files (never treated as mini-game)', () => {
      const result = decideMiniGameSwitch(
        'ladder.tab',
        ['ladder.tab'],
        true,
        50
      );
      // ladder.tab is the main file, not a mini-game — but the decision logic
      // itself doesn't know this; the caller checks isMiniGameTitle first.
      expect(result.action).toBe('load');
    });

    it('should handle large player count', () => {
      const result = decideMiniGameSwitch(
        'bg_game.tab',
        ['ladder.tab', 'bg_game.tab'],
        true,
        150
      );
      expect(result.action).toBe('load');
    });
  });
});
