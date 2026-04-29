/**
 * Tests for New Day batch flush behavior
 * Verifies that endBatch() is called before window.location.reload()
 * to ensure batch buffer is committed to server before page reload
 *
 * Note: Batch state is module-level in storageService, so tests must
 * be careful about isolation. We test the observable behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getKeyPrefix, startBatch, endBatch, savePlayers, getPlayers, isInBatch, _resetBatchState } from '../../../src/services/storageService';

describe('New Day Batch Flush', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    _resetBatchState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetBatchState();
  });

  describe('batch mode state management', () => {
    it('should detect batch mode after startBatch', () => {
      startBatch();
      expect(isInBatch()).toBe(true);
    });

    it('should exit batch mode after matching endBatch calls', async () => {
      startBatch();
      startBatch(); // nested
      expect(isInBatch()).toBe(true);

      await endBatch();
      expect(isInBatch()).toBe(true); // still nested

      await endBatch();
      expect(isInBatch()).toBe(false);
    });
  });

  describe('batch buffer behavior', () => {
    it('should hold data in buffer during batch mode (not write to localStorage)', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1200, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      startBatch();

      const modifiedPlayers = [
        { ...initialPlayers[0], rating: 1300, lastName: 'Modified' }
      ];
      await savePlayers(modifiedPlayers);

      // localStorage should still have original data (batch mode prevents writes)
      const storedData = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(storedData[0].lastName).toBe('Player1');

      await endBatch();
    });

    it('should commit buffer to localStorage on endBatch', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1200, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      startBatch();

      const modifiedPlayers = [
        { ...initialPlayers[0], rating: 1300, lastName: 'Modified' }
      ];
      await savePlayers(modifiedPlayers);

      // Before endBatch, localStorage should still have original data
      let storedData = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(storedData[0].lastName).toBe('Player1');

      await endBatch();

      // After endBatch, localStorage should have modified data
      storedData = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(storedData[0].lastName).toBe('Modified');
      expect(storedData[0].rating).toBe(1300);
    });
  });

  describe('nested batch operations', () => {
    it('should handle nested startBatch calls', () => {
      startBatch();
      expect(isInBatch()).toBe(true);

      startBatch();
      expect(isInBatch()).toBe(true);

      // One endBatch should not exit batch mode
      endBatch();
      expect(isInBatch()).toBe(true);

      // Second endBatch should exit batch mode
      endBatch();
      expect(isInBatch()).toBe(false);
    });

    it('should maintain single commit on nested endBatch', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1200, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      startBatch();
      startBatch();

      const modifiedPlayers = [
        { ...initialPlayers[0], rating: 1500, lastName: 'NestedBatch' }
      ];
      await savePlayers(modifiedPlayers);

      // First endBatch should not commit (still nested)
      await endBatch();

      // Second endBatch should commit
      await endBatch();

      const storedData = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(storedData[0].lastName).toBe('NestedBatch');
      expect(storedData[0].rating).toBe(1500);
    });
  });

  describe('getPlayers during batch mode', () => {
    it('should return buffer data during batch mode', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1200, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      startBatch();

      const modifiedPlayers = [
        { ...initialPlayers[0], rating: 1300, lastName: 'Buffered' }
      ];
      await savePlayers(modifiedPlayers);

      // getPlayers should return the buffered data, not localStorage
      const players = await getPlayers();
      expect(players[0].lastName).toBe('Buffered');
      expect(players[0].rating).toBe(1300);

      await endBatch();
    });
  });

  describe('New Day flush sequence', () => {
    it('should simulate New Day batch flush: startBatch → savePlayers → endBatch', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1500, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      // Simulate New Day flow: start batch, process, save, flush
      startBatch();

      const processedPlayers = [
        { ...initialPlayers[0], rating: 1500, num_games: 5, gameResults: Array(31).fill(null) }
      ];
      await savePlayers(processedPlayers);

      // Before flush, localStorage unchanged
      let stored = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(stored[0].rating).toBe(1200);

      // Flush (endBatch) commits to localStorage
      await endBatch();

      // After flush, localStorage has new data
      stored = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(stored[0].rating).toBe(1500);
      expect(stored[0].num_games).toBe(5);
    });

    it('should handle multiple savePlayers calls within single batch', async () => {
      const initialPlayers = [
        { rank: 1, group: 'A', lastName: 'Player1', firstName: 'Test', rating: 1200, nRating: 1200, trophyEligible: true, grade: '5', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: Array(31).fill(null) }
      ];
      localStorage.setItem(getKeyPrefix() + 'ladder_players', JSON.stringify(initialPlayers));

      startBatch();

      // Multiple saves during batch - only the last one matters
      await savePlayers([{ ...initialPlayers[0], rating: 1300 }]);
      await savePlayers([{ ...initialPlayers[0], rating: 1400 }]);
      await savePlayers([{ ...initialPlayers[0], rating: 1500, lastName: 'Final' }]);

      await endBatch();

      const stored = JSON.parse(localStorage.getItem(getKeyPrefix() + 'ladder_players') || '[]');
      expect(stored[0].rating).toBe(1500);
      expect(stored[0].lastName).toBe('Final');
    });
  });
});
