/**
 * Tests for new day processing and title progression
 * Derived from manual test case: 05-title-and-new-day
 */

import { describe, it, expect } from 'vitest';
import {
  getNextTitle,
  processNewDayTransformations,
  MINI_GAMES_WITH_BUGHOUSE,
} from '../../../src/utils/constants';
import type { PlayerData } from '../../../shared/types';
import { simplePlayers } from '../fixtures/players';

describe('Title Progression', () => {
  describe('getNextTitle', () => {
    it('should progress through all mini game titles in order', () => {
      const titleOrder = [
        'BG_Game',
        'Bishop_Game',
        'Pillar_Game',
        'Kings_Cross',
        'Pawn_Game',
        'Queen_Game',
        'Bughouse',
      ];

      for (let i = 0; i < titleOrder.length; i++) {
        const currentTitle = titleOrder[i];
        const nextTitle = getNextTitle(currentTitle);
        const expectedNext = titleOrder[(i + 1) % titleOrder.length];
        
        expect(nextTitle).toBe(expectedNext);
      }
    });

    it('should cycle back to BG_Game after Bughouse', () => {
      const nextTitle = getNextTitle('Bughouse');
      expect(nextTitle).toBe('BG_Game');
    });

    it('should be case-insensitive', () => {
      expect(getNextTitle('kings_cross')).toBe('Pawn_Game');
      expect(getNextTitle('KINGS_CROSS')).toBe('Pawn_Game');
      expect(getNextTitle('Kings_Cross')).toBe('Pawn_Game');
      expect(getNextTitle('bughouse')).toBe('BG_Game');
      expect(getNextTitle('BUGHOUSE')).toBe('BG_Game');
    });

    it('should handle unknown titles gracefully', () => {
      const unknownTitle = 'Unknown_Game';
      const result = getNextTitle(unknownTitle);
      expect(result).toBe(unknownTitle); // Returns same title if not found
    });

    it('should handle empty string', () => {
      const result = getNextTitle('');
      expect(result).toBe('');
    });

    it('should handle whitespace', () => {
      expect(getNextTitle('  Kings_Cross  ')).toBe('Pawn_Game');
    });
  });
});

describe('New Day Transformations', () => {
  describe('processNewDayTransformations', () => {
    const createTestPlayers = (): PlayerData[] => [
      {
        rank: 1,
        group: 'A',
        lastName: 'Smith',
        firstName: 'John',
        rating: 1400,
        nRating: 1500,
        trophyEligible: true,
        grade: '5',
        num_games: 5,
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: [
          null, null, 'W', 'L', 'W', 'W', 'D', null, ...Array(24).fill(null)
        ],
      },
      {
        rank: 2,
        group: 'A',
        lastName: 'Johnson',
        firstName: 'Jane',
        rating: 1300,
        nRating: 1350,
        trophyEligible: true,
        grade: '5',
        num_games: 0, // No games this round
        attendance: 0,
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: Array(31).fill(null),
      },
      {
        rank: 3,
        group: 'A',
        lastName: 'Williams',
        firstName: 'Bob',
        rating: 1200,
        nRating: 1250,
        trophyEligible: true,
        grade: '4',
        num_games: 3,
        attendance: 1, // Already has attendance
        info: '',
        phone: '',
        school: '',
        room: '',
        gameResults: [null, null, 'W', null, ...Array(28).fill(null)],
      },
    ];

    it('should update rating to nRating', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      expect(result[0].rating).toBe(1500); // Was nRating
      expect(result[1].rating).toBe(1350);
      expect(result[2].rating).toBe(1250);
    });

    it('should count games from gameResults array', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      // Player 1: num_games(5) + today(5) = 10
      expect(result[0].num_games).toBe(10);
      // Player 2: num_games(0) + today(0) = 0
      expect(result[1].num_games).toBe(0);
      // Player 3: num_games(3) + today(1) = 4
      expect(result[2].num_games).toBe(4);
    });

    it('should reset gameResults to all null', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      result.forEach(player => {
        expect(player.gameResults).toHaveLength(31);
        expect(player.gameResults.every(r => r === null)).toBe(true);
      });
    });

    it('should reset attendance to 0 if player played games', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      // Player 1 played games, attendance reset to 0
      expect(result[0].attendance).toBe(0);
      // Player 2 didn't play, attendance incremented
      expect(result[1].attendance).toBe(1);
    });

    it('should increment attendance if player did not play', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      // Player 2 had no games this round
      expect(result[1].attendance).toBe(1); // Was 0, now 1
    });

    it('should preserve other player fields', () => {
      const players = createTestPlayers();
      const result = processNewDayTransformations(players, false);

      expect(result[0].group).toBe('A');
      expect(result[0].lastName).toBe('Smith');
      expect(result[0].firstName).toBe('John');
      expect(result[0].grade).toBe('5');
    });

    describe('with reRank = true', () => {
      const createUnrankedPlayers = (): PlayerData[] => [
        {
          rank: 3, // Out of order
          group: 'A',
          lastName: 'Charlie',
          firstName: 'C',
          rating: 1200,
          nRating: 1300,
          trophyEligible: true,
          grade: '4',
          num_games: 2,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: [null, null, 'W', null, ...Array(28).fill(null)],
        },
        {
          rank: 1, // Out of order
          group: 'A',
          lastName: 'Alice',
          firstName: 'A',
          rating: 1500,
          nRating: 1600,
          trophyEligible: true,
          grade: '6',
          num_games: 4,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: [null, null, 'W', 'W', 'L', null, ...Array(25).fill(null)],
        },
        {
          rank: 2, // Out of order
          group: 'A',
          lastName: 'Bob',
          firstName: 'B',
          rating: 1400,
          nRating: 1450,
          trophyEligible: true,
          grade: '5',
          num_games: 3,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: [null, null, 'W', 'L', null, ...Array(28).fill(null)],
        },
      ];

      it('should re-sort players by rating (descending)', () => {
        const players = createUnrankedPlayers();
        const result = processNewDayTransformations(players, true);

        expect(result[0].lastName).toBe('Alice'); // Highest rating
        expect(result[1].lastName).toBe('Bob');
        expect(result[2].lastName).toBe('Charlie'); // Lowest rating
      });

      it('should re-assign ranks after sorting', () => {
        const players = createUnrankedPlayers();
        const result = processNewDayTransformations(players, true);

        expect(result[0].rank).toBe(1); // Alice
        expect(result[1].rank).toBe(2); // Bob
        expect(result[2].rank).toBe(3); // Charlie
      });

      it('should use original rank as tiebreaker for equal ratings', () => {
        const players: PlayerData[] = [
          {
            rank: 2,
            group: 'A',
            lastName: 'Second',
            firstName: 'S',
            rating: 1400,
            nRating: 1400,
            trophyEligible: true,
            grade: '5',
            num_games: 2,
            attendance: 0,
            info: '',
            phone: '',
            school: '',
            room: '',
            gameResults: Array(31).fill(null),
          },
          {
            rank: 1,
            group: 'A',
            lastName: 'First',
            firstName: 'F',
            rating: 1400, // Same rating
            nRating: 1400,
            trophyEligible: true,
            grade: '5',
            num_games: 2,
            attendance: 0,
            info: '',
            phone: '',
            school: '',
            room: '',
            gameResults: Array(31).fill(null),
          },
        ];

        const result = processNewDayTransformations(players, true);

        // First should come before Second due to lower original rank
        expect(result[0].lastName).toBe('First');
        expect(result[1].lastName).toBe('Second');
      });
    });

    describe('with reRank = false', () => {
      it('should preserve original ranks', () => {
        const players = createTestPlayers();
        const result = processNewDayTransformations(players, false);

        expect(result[0].rank).toBe(1);
        expect(result[1].rank).toBe(2);
        expect(result[2].rank).toBe(3);
      });

      it('should preserve original order', () => {
        const players = createTestPlayers();
        const result = processNewDayTransformations(players, false);

        expect(result[0].lastName).toBe('Smith');
        expect(result[1].lastName).toBe('Johnson');
        expect(result[2].lastName).toBe('Williams');
      });
    });

    it('should handle empty player list', () => {
      const result = processNewDayTransformations([], false);
      expect(result).toHaveLength(0);
    });

    it('should handle players without gameResults', () => {
      const players: PlayerData[] = [
        {
          rank: 1,
          group: 'A',
          lastName: 'NoResults',
          firstName: 'Player',
          rating: 1200,
          nRating: 1250,
          trophyEligible: true,
          grade: '4',
          num_games: 0,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: undefined as any, // Missing gameResults
        },
      ];

      const result = processNewDayTransformations(players, false);
      
      expect(result[0].num_games).toBe(0);
      expect(result[0].attendance).toBe(1); // No games = attendance increment
    });
  });

  describe('non-sequential ranks (deleted top players scenario)', () => {
    const createGapPlayers = (): PlayerData[] => {
      const players: PlayerData[] = [];
      for (let i = 0; i < 20; i++) {
        players.push({
          rank: 141 + i,
          group: 'A',
          lastName: `Player${141 + i}`,
          firstName: `P${141 + i}`,
          rating: 1200 + i * 10,
          nRating: 1250 + i * 10,
          trophyEligible: true,
          grade: '5',
          num_games: 0,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        });
      }
      return players;
    };

    it('should renumber ranks to 1..N when reRank=true', () => {
      const players = createGapPlayers();
      const result = processNewDayTransformations(players, true);

      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[19].rank).toBe(20);
      expect(result).toHaveLength(20);
    });

    it('should sort by rating descending when reRank=true', () => {
      const players = createGapPlayers();
      const result = processNewDayTransformations(players, true);

      // Highest rated player should be first (rank 1) — rating is set to nRating
      expect(result[0].rating).toBe(1440); // Player160 nRating: 1250 + 19*10
      expect(result[0].lastName).toBe('Player160');
      // Lowest rated player should be last
      expect(result[19].rating).toBe(1250); // Player141 nRating: 1250 + 0*10
      expect(result[19].lastName).toBe('Player141');
    });

    it('should preserve original ranks when reRank=false', () => {
      const players = createGapPlayers();
      const result = processNewDayTransformations(players, false);

      expect(result[0].rank).toBe(141);
      expect(result[19].rank).toBe(160);
    });

    it('should set rating to nRating and reset nRating to 0', () => {
      const players = createGapPlayers();
      const result = processNewDayTransformations(players, true);

      result.forEach(player => {
        expect(player.nRating).toBe(0);
      });
    });

    it('should reset gameResults to all null', () => {
      const players = createGapPlayers();
      const result = processNewDayTransformations(players, true);

      result.forEach(player => {
        expect(player.gameResults).toHaveLength(31);
        expect(player.gameResults.every(r => r === null)).toBe(true);
      });
    });
  });
});
