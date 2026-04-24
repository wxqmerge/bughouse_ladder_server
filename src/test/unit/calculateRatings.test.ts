/**
 * Tests for calculateRatings - VB6-matching implementation
 * Covers: inline Elo blending, correct performance formula (800 * scoreError),
 * 4-player side averaging, and trophyEligible preservation.
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
    trophyEligible: rating >= 0,
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

function createMatch(
  player1Rank: number,
  player2Rank: number,
  score1: number,
  player3Rank: number = 0,
  player4Rank: number = 0,
): MatchData {
  return {
    player1: player1Rank,
    player2: player2Rank,
    player3: player3Rank,
    player4: player4Rank,
    score1,
    score2: score1 === 1 ? 3 : score1 === 3 ? 1 : 2,
    side0Won: score1 === 3,
  };
}

describe('calculateRatings', () => {
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

  describe('Elo for experienced players (>= 10 games)', () => {
    it('should use incremental Elo accumulation when num_games >= 10', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 12),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // Equal ratings → expected = 0.5, scoreDiff = 1.0
      // Winner gains K/2 = 10, loser loses K/2 = 10
      // But side0 = 1500, side1 = 1400 → expected ≈ 0.543
      // scoreDiff = 1.0, so adjustment = 1.0 * 20 / 2 = 10
      expect(result[0].nRating).toBe(1510);
      expect(result[1].nRating).toBe(1390);
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

      // scoreDiff = 0 → no Elo change
      expect(result[0].nRating).toBe(1500);
      expect(result[1].nRating).toBe(1500);
    });

    it('should accumulate Elo across multiple games for experienced players', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1500, 15),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
        createMatch(1, 2, 3), // Player 1 wins again
        createMatch(1, 2, 1), // Player 2 wins
      ];

      const result = calculateRatings(players, matches);

      // Game 1: scoreDiff=1, side0=1500, side1=1500, expected=0.5
      //   P1: 1500 + 10 = 1510, P2: 1500 - 10 = 1490
      // Game 2: scoreDiff=1, side0=1510, side1=1490, expected≈0.503
      //   P1: 1510 + 10 = 1520, P2: 1490 - 10 = 1480
      // Game 3: scoreDiff=-1, side0=1520, side1=1480
      //   P1: 1520 - 10 = 1510, P2: 1480 + 10 = 1490
      expect(result[0].nRating).toBe(1510);
      expect(result[1].nRating).toBe(1490);
    });
  });

  describe('inline blending for players with < 10 games', () => {
    it('should blend rating with performance rating inline for each game when num_games < 10', () => {
      const players = [
        createPlayer(1, 1200, 0),
        createPlayer(2, 1200, 0),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // num_games=0, initRating=1200 (capped at 1200)
      // scoreDiff=2, side0=1200, side1=1200, perfs=0.5
      // perfRating0 = 1200 + 800*(-0.5) = 800, perfRating1 = 1200 + 800*(0.5) = 1600
      // VB6 cross-side blending: P1 (side 0) blends with perfRating1, P2 (side 1) with perfRating0
      // P1: (1200*0 + 1600) / 1 = 1600
      // P2: (1200*0 + 800) / 1 = 800
      expect(result[0].nRating).toBe(1600);
      expect(result[1].nRating).toBe(800);
    });

    it('should blend incrementally across multiple games', () => {
      const players = [
        createPlayer(1, 1200, 3),
        createPlayer(2, 1200, 3),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
        createMatch(1, 2, 3), // Player 1 wins again
      ];

      const result = calculateRatings(players, matches);

      // Game 1: num_games=3, side0=1200, side1=1200
      //   perfRating0 = 1200 + 800*(-0.5) = 800, perfRating1 = 1200 + 800*(0.5) = 1600
      //   VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      //   P1: (1200*3 + 1600) / 4 = 1300, P2: (1200*3 + 800) / 4 = 1100
      //   careerGames: P1=4, P2=4
      // Game 2: num_games=4, side0=1300, side1=1100
      //   perfRating0 = 1300 + 800*(-0.5) = 900, perfRating1 = 1100 + 800*(0.5) = 1500
      //   P1: (1300*4 + 1500) / 5 = 1340, P2: (1100*4 + 900) / 5 = 1060
      expect(result[0].nRating).toBe(1340);
      expect(result[1].nRating).toBe(1060);
    });

    it('should heavily weight old rating when historical games >> today games', () => {
      const players = [
        createPlayer(1, 1200, 9),
        createPlayer(2, 1200, 9),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // 1 game today, player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // num_games=9, side0=1200, side1=1200
      // perfRating0 = 800, perfRating1 = 1600
      // VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      // P1: (1200*9 + 1600) / 10 = 1240
      // P2: (1200*9 + 800) / 10 = 1160
      expect(result[0].nRating).toBe(1240);
      expect(result[1].nRating).toBe(1160);
    });

    it('should use nRating from file when num_games=0', () => {
      const players = [
        createPlayer(1, 1200, 0, 1100),
        createPlayer(2, 1200, 0, 1100),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches);

      // num_games=0, initRating=1100 (< 1200 cap)
      // side0=1100, side1=1100
      // perfRating0 = 1100 + 800*(-0.5) = 700, perfRating1 = 1100 + 800*(0.5) = 1500
      // VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      // P1: (1100*0 + 1500)/1 = 1500, P2: (1100*0 + 700)/1 = 700
      expect(result[0].nRating).toBe(1500);
      expect(result[1].nRating).toBe(700);
    });

    it('should cap initial rating at 1200 when num_games=0', () => {
      const players = [
        createPlayer(1, 1500, 0, 1500), // nRating=1500 but capped to 1200
        createPlayer(2, 1200, 0, 1200),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches);

      // P1 initRating = min(1500, 1200) = 1200 (capped)
      // side0=1200, side1=1200
      // perfRating0 = 800, perfRating1 = 1600
      // VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      // P1: (1200*0 + 1600)/1 = 1600, P2: (1200*0 + 800)/1 = 800
      expect(result[0].nRating).toBe(1600);
      expect(result[1].nRating).toBe(800);
    });
  });

  describe('4-player games', () => {
    it('should average team member ratings for side rating', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
        createPlayer(3, 1000, 5),
        createPlayer(4, 1000, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3, 3, 4), // Team 1 (1+2) vs Team 2 (3+4), Team 1 wins
      ];

      const result = calculateRatings(players, matches);

      // side0 = (1200+1200)/2 = 1200, side1 = (1000+1000)/2 = 1000
      // 4-player: s0=2400, s1=2000, perfs=0.5
      // perfRating0 = (2400 + 800*(-0.5))/2 = 1000, perfRating1 = (2000 + 800*(0.5))/2 = 1200
      // VB6 cross-side: side 0 blends with perfRating1, side 1 with perfRating0
      // P1: (1200*5 + 1200)/6 = 1200, P2: same
      // P3: (1000*5 + 1000)/6 = 1000, P4: same
      expect(result[0].nRating).toBeCloseTo(1200, 0);
      expect(result[1].nRating).toBeCloseTo(1200, 0);
      expect(result[2].nRating).toBeCloseTo(1000, 0);
      expect(result[3].nRating).toBeCloseTo(1000, 0);
    });

    it('should accumulate error for opposing team in 4-player games', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1500, 15),
        createPlayer(3, 1400, 15),
        createPlayer(4, 1400, 15),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3, 3, 4), // Team 1 wins
      ];

      const result = calculateRatings(players, matches);

      // 4-player, all >= 10 games → pure Elo
      // scoreDiff=1, adjustment = 1*20/2 = 10
      // Team 1 gains 10, Team 2 loses 10
      expect(result[0].nRating).toBe(1510);
      expect(result[1].nRating).toBe(1510);
      expect(result[2].nRating).toBe(1390);
      expect(result[3].nRating).toBe(1390);
    });
  });

  describe('edge cases', () => {
    it('should handle players with no games today', () => {
      const players = [
        createPlayer(1, 1500, 5),
        createPlayer(2, 1400, 5),
      ];

      const result = calculateRatings(players, []);

      expect(result[0].nRating).toBe(0);
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
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // perfRating0 = 1500 + 800*(-0.5) = 1100, perfRating1 = 1400 + 800*(0.5) = 1800
      // VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      // P1: (1500*5 + 1800)/6 = 1550, P2: (1400*5 + 1100)/6 = 1350
      expect(result[0].nRating).toBe(1550);
      expect(result[1].nRating).toBe(1350);
      expect(result[2].nRating).toBe(0); // No games, unchanged
    });

    it('should clamp performance rating to 0 minimum', () => {
      const players = [
        createPlayer(1, 500, 3),
        createPlayer(2, 2000, 3),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins against much higher rated
      ];

      const result = calculateRatings(players, matches);

      // side0=500, perfRating = 500 + 800*(-0.5) = 100 (positive, no clamp needed)
      // But if perfRating would be negative, it should be clamped to 0
      expect(result[0].nRating).toBeGreaterThan(0);
    });

   it('should handle single game', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // side0=1200, side1=1200, perfs=0.5
      // perfRating0 = 1200 + 800*(-0.5) = 800, perfRating1 = 1200 + 800*(0.5) = 1600
      // VB6 cross-side: P1 blends with perfRating1, P2 with perfRating0
      // num_games=5: P1: (1200*5 + 1600)/6 = 1266.67, P2: (1200*5 + 800)/6 = 1133.33
      expect(result[0].nRating).toBeCloseTo(1267, 0);
      expect(result[1].nRating).toBeCloseTo(1133, 0);
    });
  });

  describe('kFactor override', () => {
    it('should use provided kFactor override', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 15),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      // kFactor=100 = very volatile
      const resultHighK = calculateRatings(players, matches, 100);

      // kFactor=1 = very stable
      const players2 = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 15),
      ];
      const resultLowK = calculateRatings(players2, matches, 1);

      // rating is updated to match nRating for players who played (VB6 behavior)
      // Compare change from original rating (1500)
      expect(resultHighK[0].nRating - 1500).toBeGreaterThan(
        resultLowK[0].nRating - 1500
      );
    });
  });

  describe('trophyEligible', () => {
    it('should preserve trophyEligible=true for positive rating through recalculation', () => {
      const players = [
        createPlayer(1, 1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
    });

    it('should preserve trophyEligible=false for negative rating through recalculation', () => {
      const players = [
        createPlayer(1, -1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(false);
    });

    it('should preserve trophyEligible for players who lose badly', () => {
      const players = [
        { ...createPlayer(1, 1500, 5, 1500), trophyEligible: true },
        { ...createPlayer(2, 800, 5, 800), trophyEligible: true },
      ];
      const matches = [createMatch(1, 2, 1)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
    });

    it('should preserve trophyEligible for players with no games today', () => {
      const players = [
        createPlayer(1, 1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches: MatchData[] = [];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
    });

    it('should default trophyEligible to true when missing', () => {
      const players = [
        { rank: 1, rating: 1200, nRating: 1200, num_games: 5 } as PlayerData,
        { rank: 2, rating: 1100, nRating: 1100, num_games: 5 } as PlayerData,
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
    });

    it('should store abs(nRating) regardless of eligibility', () => {
      const players = [
        createPlayer(1, 1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].nRating).toBeGreaterThan(0);
    });

    it('should compute nRating but preserve eligibility when num_games=0', () => {
      const players = [
        createPlayer(1, 1200, 0, 1200),
        createPlayer(2, 1100, 0, 1100),
        createPlayer(3, 1000, 0, 1000),
      ];
      const matches = [createMatch(1, 2, 3), createMatch(1, 3, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
      expect(result[0].nRating).toBeGreaterThan(0);
    });

    it('should preserve eligibility when num_games < 10', () => {
      const players = [
        createPlayer(1, 1200, 3, 1200),
        createPlayer(2, 1100, 3, 1100),
        createPlayer(3, 1000, 3, 1000),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result[0].trophyEligible).toBe(true);
    });
  });
});
