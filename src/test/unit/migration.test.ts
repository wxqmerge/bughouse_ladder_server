/**
 * Tests for migration utilities
 * Tests the local <-> server mode migration logic
 */

import { describe, it, expect } from 'vitest';
import {
  detectRankNameMismatches,
  mergePlayerLists,
} from '../../../src/utils/migrationUtils';
import type { PlayerData } from '../../../shared/types';

// Helper to create test players
const createPlayer = (overrides: Partial<PlayerData>): PlayerData => ({
  rank: 1,
  group: 'A',
  lastName: 'Smith',
  firstName: 'John',
  rating: 1200,
  nRating: 1200,
  trophyEligible: true,
  grade: '4',
  num_games: 0,
  attendance: 0,
  info: '',
  phone: '',
  school: '',
  room: '',
  gameResults: Array(31).fill(null),
  ...overrides,
});

describe('Migration Utilities', () => {
  describe('detectRankNameMismatches', () => {
    it('should detect no mismatches when data is identical', () => {
      const localPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];
      const serverPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(false);
      expect(result.mismatchedRanks).toHaveLength(0);
    });

    it('should detect mismatch when last names differ at same rank', () => {
      const localPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];
      const serverPlayers = [createPlayer({ rank: 1, lastName: 'Johnson' })];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(true);
      expect(result.mismatchedRanks).toContain(1);
    });

    it('should detect multiple mismatches', () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Smith' }),
        createPlayer({ rank: 5, lastName: 'Williams' }),
        createPlayer({ rank: 10, lastName: 'Brown' }),
      ];
      const serverPlayers = [
        createPlayer({ rank: 1, lastName: 'Johnson' }), // Mismatch
        createPlayer({ rank: 5, lastName: 'Jones' }),   // Mismatch
        createPlayer({ rank: 10, lastName: 'Brown' }),  // Match
      ];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(true);
      expect(result.mismatchedRanks).toContain(1);
      expect(result.mismatchedRanks).toContain(5);
      expect(result.mismatchedRanks).not.toContain(10);
    });

    it('should handle players only in local', () => {
      const localPlayers = [
        createPlayer({ rank: 1, lastName: 'Smith' }),
        createPlayer({ rank: 2, lastName: 'LocalOnly' }),
      ];
      const serverPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(false);
      expect(result.mismatchedRanks).toHaveLength(0);
    });

    it('should handle players only in server', () => {
      const localPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];
      const serverPlayers = [
        createPlayer({ rank: 1, lastName: 'Smith' }),
        createPlayer({ rank: 2, lastName: 'ServerOnly' }),
      ];

      const result = detectRankNameMismatches(localPlayers, serverPlayers);

      expect(result.hasMismatch).toBe(false);
      expect(result.mismatchedRanks).toHaveLength(0);
    });
  });

  describe('mergePlayerLists', () => {
    it('should use server-only players when no local equivalent exists', () => {
      const localPlayers: PlayerData[] = [];
      const serverPlayers = [createPlayer({ rank: 1, lastName: 'ServerOnly' })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'merge',
      });

      expect(merged).toHaveLength(1);
      expect(merged[0].lastName).toBe('ServerOnly');
    });

    it('should use local-only players when no server equivalent exists', () => {
      const localPlayers = [createPlayer({ rank: 1, lastName: 'LocalOnly' })];
      const serverPlayers: PlayerData[] = [];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'merge',
      });

      expect(merged).toHaveLength(1);
      expect(merged[0].lastName).toBe('LocalOnly');
    });

    it('should use server non-result fields when strategy is use-server', () => {
      const localPlayers = [createPlayer({ 
        rank: 1, 
        lastName: 'Local',
        firstName: 'LocalFirst',
        rating: 1000,
      })];
      const serverPlayers = [createPlayer({ 
        rank: 1, 
        lastName: 'Server',
        firstName: 'ServerFirst',
        rating: 2000,
      })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'dont-merge',
      });

      expect(merged[0].lastName).toBe('Server');
      expect(merged[0].firstName).toBe('ServerFirst');
      expect(merged[0].rating).toBe(2000);
    });

    it('should use local non-result fields when strategy is use-local', () => {
      const localPlayers = [createPlayer({ 
        rank: 1, 
        lastName: 'Local',
        firstName: 'LocalFirst',
        rating: 1000,
      })];
      const serverPlayers = [createPlayer({ 
        rank: 1, 
        lastName: 'Server',
        firstName: 'ServerFirst',
        rating: 2000,
      })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-local',
        resultsStrategy: 'dont-merge',
      });

      expect(merged[0].lastName).toBe('Local');
      expect(merged[0].firstName).toBe('LocalFirst');
      expect(merged[0].rating).toBe(1000);
    });

    it('should merge game results when strategy is merge', () => {
      const localPlayers = [createPlayer({ 
        rank: 1,
        lastName: 'Player',
        gameResults: ['W', null, 'L', null],
      })];
      const serverPlayers = [createPlayer({ 
        rank: 1,
        lastName: 'Player',
        gameResults: [null, 'W', null, 'L'],
      })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'merge',
      });

      expect(merged[0].gameResults![0]).toBe('W');
      expect(merged[0].gameResults![1]).toBe('W');
      expect(merged[0].gameResults![2]).toBe('L');
      expect(merged[0].gameResults![3]).toBe('L');
    });

    it('should use server results when strategy is dont-merge', () => {
      const localPlayers = [createPlayer({ 
        rank: 1,
        lastName: 'Player',
        gameResults: ['W', 'L', 'D', null],
      })];
      const serverPlayers = [createPlayer({ 
        rank: 1,
        lastName: 'Player',
        gameResults: ['L', 'W', null, 'D'],
      })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'dont-merge',
      });

      expect(merged[0].gameResults![0]).toBe('L'); // Server value
      expect(merged[0].gameResults![1]).toBe('W'); // Server value
      expect(merged[0].gameResults![2]).toBe(null); // Server value
      expect(merged[0].gameResults![3]).toBe('D'); // Server value
    });

    it('should sort merged players by rank', () => {
      const localPlayers = [
        createPlayer({ rank: 3, lastName: 'Third' }),
        createPlayer({ rank: 1, lastName: 'First' }),
      ];
      const serverPlayers = [
        createPlayer({ rank: 2, lastName: 'Second' }),
      ];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-server',
        resultsStrategy: 'merge',
      });

      expect(merged[0].rank).toBe(1);
      expect(merged[1].rank).toBe(2);
      expect(merged[2].rank).toBe(3);
    });

    it('should preserve all 13 non-result fields correctly', () => {
      const localPlayers = [createPlayer({ 
        rank: 1,
        group: 'L',
        lastName: 'Local',
        firstName: 'LocalFirst',
        rating: 1000,
        nRating: 1050,
        trophyEligible: true,
        grade: '1',
        num_games: 10,
        attendance: 1,
        info: 'Local info',
        phone: '111-1111',
        school: 'Local School',
        room: 'L1',
      })];
      const serverPlayers = [createPlayer({ 
        rank: 1,
        group: 'S',
        lastName: 'Server',
        firstName: 'ServerFirst',
        rating: 2000,
        nRating: 2050,
        trophyEligible: true,
        grade: '2',
        num_games: 20,
        attendance: 2,
        info: 'Server info',
        phone: '222-2222',
        school: 'Server School',
        room: 'S1',
      })];

      const merged = mergePlayerLists(localPlayers, serverPlayers, {
        nonResultStrategy: 'use-local',
        resultsStrategy: 'dont-merge',
      });

      const player = merged[0];
      expect(player.group).toBe('L');
      expect(player.lastName).toBe('Local');
      expect(player.firstName).toBe('LocalFirst');
      expect(player.rating).toBe(1000);
      expect(player.nRating).toBe(1050);
      expect(player.grade).toBe('1');
      expect(player.num_games).toBe(10);
      expect(player.attendance).toBe(1);
      expect(player.info).toBe('Local info');
      expect(player.phone).toBe('111-1111');
      expect(player.school).toBe('Local School');
      expect(player.room).toBe('L1');
    });
  });
});
