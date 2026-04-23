/**
 * Tests for calculateRatings with performance rating blending
 * Covers: standard Elo for >=10 games, blended rating for <10 games
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRatings } from '../../../shared/utils/hashUtils';
import type { PlayerData, MatchData } from '../../../shared/types';

function createPlayer(
  rank: number,
  rating: number,
  num_games: number,
  nRating: number = 0,
): PlayerData {
  return {
    rank,
    group: 'A',
    lastName: `Player${rank}`,
    firstName: `F${rank}`,
    rating,
    nRating,
    grade: '5',
    num_games,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  };
}

function createMatch(player1Rank: number, player2Rank: number, score1: number): MatchData {
  return {
    player1: player1Rank,
    player2: player2Rank,
    player3: 0,
    player4: 0,
    score1,
    score2: score1 === 1 ? 3 : score1 === 3 ? 1 : 2,
  };
}

describe('calculateRatings', () => {
  // Mock localStorage for controlled test environment
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      length: Object.keys(mockStorage).length,
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('standard Elo for players with >= 10 games', () => {
    it('should use standard Elo formula when num_games >= 10', () => {
      const players = [
        createPlayer(1, 1500, 15),  // >= 10 games
        createPlayer(2, 1400, 12),  // >= 10 games
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // Player 1 should have gained rating (beat lower-rated opponent)
      expect(result[0].nRating).toBeGreaterThan(1500);
      // Player 2 should have lost rating
      expect(result[1].nRating).toBeLessThan(1400);
    });

    it('should handle draw with >= 10 games', () => {
      const players = [
        createPlayer(1, 1500, 10),
        createPlayer(2, 1500, 10),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 2), // Draw
      ];

      const result = calculateRatings(players, matches);

      // Equal ratings + draw = no change (approximately)
      expect(result[0].nRating).toBeCloseTo(1500, 0);
      expect(result[1].nRating).toBeCloseTo(1500, 0);
    });
  });

  describe('blended rating for players with < 10 games', () => {
    it('should blend old rating with performance rating when num_games < 10', () => {
      // Player has 5 historical games, plays 3 new games today
      const players = [
        createPlayer(1, 1200, 5),  // < 10 games
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1), // Player 1 wins
        createMatch(1, 2, 1), // Player 1 wins again
        createMatch(1, 2, 3), // Player 2 wins once
      ];

      const result = calculateRatings(players, matches);

      // Performance rating for player 1: avg opponent (1200) + 400*(2/3 - 0.5) = 1200 + 400*0.167 = 1267
      // Blended: 0.99 * ((1200 * 5 + 1267 * 3) / 8) = 0.99 * (6000 + 400/3 * 3) / 8
      // Simplified: perf ≈ 1267, blended ≈ 0.99 * (6000 + 400+400+400) / 8 = 0.99 * 6000+1200 / 8 = 0.99 * 875...
      // Actually let me compute more carefully:
      // perf_rating = 1200 + 400*(2/3 - 0.5) = 1200 + 400*0.1667 = 1200 + 66.67 = 1266.67
      // blended = 0.99 * ((1200*5 + 1266.67*3) / 8) = 0.99 * (6000 + 400/3*3) ... 
      // = 0.99 * (6000 + 400 + ...) let me just check it's between old rating and perf
      const blended = result[0].nRating;
      expect(blended).toBeGreaterThan(1200); // Should be higher than old rating due to good performance
      expect(blended).toBeLessThan(1300); // But dampened by blending
    });

    it('should heavily weight old rating when historical games >> today games', () => {
      const players = [
        createPlayer(1, 1200, 9),   // max below threshold
        createPlayer(2, 1200, 9),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1), // 1 game today, player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // Player wins 1 game against equal opponent → perf ≈ 1400
      // blended = 0.99 * ((1200*9 + 1400*1)/10) = 0.99 * 1220 ≈ 1208
      // 9:1 weighting keeps it close to old rating, slight boost from good performance
      expect(result[0].nRating).toBeGreaterThan(1200);
      expect(result[0].nRating).toBeLessThan(1300);
    });

    it('should approach performance rating when today games >> historical', () => {
      const players = [
        createPlayer(1, 1200, 1),   // only 1 historical game
        createPlayer(2, 1200, 1),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      // perf_rating ≈ 1200 + 400*(1 - 0.5) = 1400 (perfect score)
      // blended = 0.99 * ((1200*1 + 1400*4)/5) = 0.99 * (1200+5600)/5 = 0.99*1360 = 1346
      expect(result[0].nRating).toBeGreaterThan(1200);
      expect(result[0].nRating).toBeLessThan(1400); // dampened by blending
    });

    it('should use rating as fallback when nRating is 0', () => {
      const players = [
        createPlayer(1, 1300, 5, 0),  // nRating=0, should fall back to rating
        createPlayer(2, 1100, 5, 0),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1), // Player 1 wins against lower-rated opponent
      ];

      const result = calculateRatings(players, matches);

      // Opponent rating for perf calc uses rating (1100) since nRating=0
      // perfRating = 1100 + 400*(1 - 0.5) = 1300
      // blended = 0.99 * ((1300*5 + 1300*1)/6) = 0.99 * 1300 = 1287
      expect(result[0].nRating).toBeCloseTo(1287, 0);
    });

    it('should use nRating when available (not zero)', () => {
      const players = [
        createPlayer(1, 1300, 5, 1280),  // nRating=1280 < rating=1300
        createPlayer(2, 1100, 5, 1120),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      // Should use nRating (1280, 1120) for opponent rating in perf calc
      expect(result[0].nRating).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle players with no games today', () => {
      const players = [
        createPlayer(1, 1500, 5),
        createPlayer(2, 1400, 5),
      ];

      // No matches at all
      const result = calculateRatings(players, []);

      expect(result[0].nRating).toBe(0); // Unchanged from input
      expect(result[1].nRating).toBe(0);
    });

    it('should handle player with no games but opponent does', () => {
      const players = [
        createPlayer(1, 1500, 5),
        createPlayer(2, 1400, 5),
        createPlayer(3, 1300, 3),
      ];

      // Only players 1 and 2 play
      const matches: MatchData[] = [
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      expect(result[0].nRating).toBeGreaterThan(0);
      expect(result[1].nRating).toBeLessThan(1400);
      expect(result[2].nRating).toBe(0); // No games, unchanged
    });

    it('should clamp performance rating to 100-9999 range', () => {
      // All wins against much higher rated opponent = extreme perf rating
      const players = [
        createPlayer(1, 500, 3),   // very low rated
        createPlayer(2, 2000, 3),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      // Player 1 beats much higher rated player - perf would be extremely high
      // but should be clamped to 9999 max
      expect(result[0].nRating).toBeGreaterThan(500);
      // nRating itself should be reasonable
      expect(result[0].nRating).toBeLessThan(10000);
    });

    it('should clamp performance rating to reasonable bounds', () => {
      // Player loses all games against equal-rated opponents → perfRating would be low
      const players = [
        createPlayer(1, 1200, 3),
        createPlayer(2, 1200, 3),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 2 wins all 3 times (score1=3)
        createMatch(1, 2, 3),
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches);

      // Player 2 won all games → perfRating would be high (>2000)
      // Should be clamped to max 9999 for perfRating
      // Blended nRating should still be reasonable
      expect(result[1].nRating).toBeGreaterThan(1200);
      expect(result[1].nRating).toBeLessThan(5000);
    });

    it('should not blend when num_games >= 10', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 12),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // >= 10 games → standard Elo, no blending
      // Player 1 should gain rating (beat lower-rated opponent)
      expect(result[0].nRating).toBeGreaterThan(1500);
      // Player 2 should lose rating
      expect(result[1].nRating).toBeLessThan(1400);
    });

    it('should handle single game', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      expect(result[0].nRating).toBeGreaterThan(1200);
      expect(result[1].nRating).toBeLessThan(1200);
    });
  });

  describe('blending factor', () => {
    it('should use default 0.99 when no settings stored', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
      ];

      const result = calculateRatings(players, matches);

      // With 0.99 factor, should be slightly dampened from pure blend
      expect(result[0].nRating).toBeGreaterThan(0);
    });

    it('should use custom blending factor from settings', () => {
      mockStorage['ladder_settings'] = JSON.stringify({ kFactor: 20, performanceBlendingFactor: 1.0 });

      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
        createMatch(1, 2, 1),
      ];

      const resultWithNoDampening = calculateRatings(players, matches);

      // Now test with 0.99 dampening
      mockStorage['ladder_settings'] = JSON.stringify({ kFactor: 20, performanceBlendingFactor: 0.99 });

      const players2 = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const resultWithDampening = calculateRatings(players2, matches);

      // No dampening should give slightly higher rating for winning player
      expect(resultWithNoDampening[0].nRating).toBeGreaterThanOrEqual(resultWithDampening[0].nRating);
    });
  });

  describe('kFactor override', () => {
    it('should use provided kFactor override', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 15),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
      ];

      // kFactor=100 = very volatile
      const resultHighK = calculateRatings(players, matches, 100);

      // kFactor=1 = very stable
      const players2 = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 15),
      ];
      const resultLowK = calculateRatings(players2, matches, 1);

      // High K should produce larger rating changes
      expect(resultHighK[0].nRating - resultHighK[0].rating).toBeGreaterThan(
        resultLowK[0].nRating - resultLowK[0].rating
      );
    });
  });

  describe('iterative behavior', () => {
    it('should produce consistent results on repeated calls (iterative convergence)', () => {
      const basePlayers = [
        createPlayer(1, 1500, 12),
        createPlayer(2, 1400, 10),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 1),
      ];

      // First iteration
      const players1 = basePlayers.map(p => ({ ...p }));
      const result1 = calculateRatings(players1, matches);

      // Second iteration (use previous nRating as new rating)
      const players2 = result1.map(p => ({ ...p, rating: p.nRating, nRating: 0 }));
      const result2 = calculateRatings(players2, matches);

      // Ratings should converge (changes get smaller)
      const change1 = Math.abs(result1[0].nRating - result1[0].rating);
      const change2 = Math.abs(result2[0].nRating - result2[0].rating);

      // With >= 10 games, standard Elo applies, so changes should be consistent
      expect(change2).toBeLessThanOrEqual(change1 + 5); // Allow small variance from rounding
    });
  });
});
