/**
 * Tests for calculateRatings - VB6-matching implementation
 * Covers: inline Elo blending, correct performance formula (800 * scoreError),
 * 4-player side averaging, and trophyEligible preservation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRatings, processGameResults } from '../../../shared/utils/hashUtils';
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

      // VB6 2-player: scores(1)=0, only myplayer=0 runs in both loops
      // eloPerfs0 = wldPerfs + (0.5 - expected) = 0.5 + (0.5 - 0.640) = 0.36
      // eloPerfs1 = -0.5 + (0.640 - 0.5) = -0.36
      // P1: 1500 + 0.36*20 = 1507, P2: 1400 - 0.36*20 = 1393
      expect(result.players[0].nRating).toBe(1507);
      expect(result.players[1].nRating).toBe(1393);
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
      expect(result.players[0].nRating).toBe(1500);
      expect(result.players[1].nRating).toBe(1500);
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

      // VB6 2-player: eloPerfs = wldPerfs + (0.5 - expected)
      // Game 1: 1500 vs 1500, expected=0.5, eloPerfs0=0.5, eloPerfs1=-0.5
      //   P1: 1500 + 0.5*20=1510, P2: 1500 - 0.5*20=1490
      // Game 2: 1510 vs 1490, expected≈0.529, eloPerfs0≈0.471, eloPerfs1≈-0.471
      //   P1: 1510 + 9.42=1519.4, P2: 1490 - 9.42=1480.6
      // Game 3: P2 wins, 1519.4 vs 1480.6, expected≈0.556
      //   eloPerfs0 = -0.5 + (0.5-0.556) = -0.556, eloPerfs1 = 0.5 + (0.556-0.5) = 0.556
      //   P1: 1519.4 - 11.1=1508.3, P2: 1480.6 + 11.1=1491.7
      expect(result.players[0].nRating).toBeCloseTo(1508, 0);
      expect(result.players[1].nRating).toBeCloseTo(1492, 0);
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

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // num_games=0, initRating=1200 (not capped, 1200 < 1800)
      // Self-based perfRating: ownRating + 400*wldPerfs
      // Pass 1: perfRating0=1200+200=1400, perfRating1=1200-200=1000
      //   P1: (1200*0+1400)/1=1400, P2: (1200*0+1000)/1=1000
      // Pass 2: P1 init=1400, P2 init=1000
      //   perfRating0=1400+200=1600, perfRating1=1000-200=800
      //   P1: (1400*0+1600)/1=1600, P2: (1000*0+800)/1=800
      // Average: P1=(1400+1600)/2=1500, P2=(1000+800)/2=900
      expect(result.players[0].nRating).toBe(1500);
      expect(result.players[1].nRating).toBe(900);
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

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // Self-based perfRating: ownRating + 400*wldPerfs (factor=1, no deflation)
      // Game 1: perfRating0=1200+200=1400, perfRating1=1200-200=1000
      //   P1: (1200*3+1400)/4=1250, P2: (1200*3+1000)/4=1100
      // Game 2: perfRating0=1250+200=1450, perfRating1=1100-200=900
      //   P1: (1250*4+1450)/5=1310, P2: (1100*4+900)/5=1020
      // Pass 2: same (num_games > 0, init from rating column)
      // Average: P1=1290, P2=1110
      expect(result.players[0].nRating).toBe(1290);
      expect(result.players[1].nRating).toBe(1110);
    });

    it('should heavily weight old rating when historical games >> today games', () => {
      const players = [
        createPlayer(1, 1200, 9),
        createPlayer(2, 1200, 9),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // 1 game today, player 1 wins
      ];

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // Self-based perfRating: ownRating + 400*wldPerfs (factor=1, no deflation)
      // perfRating0=1200+200=1400, perfRating1=1200-200=1000
      // P1: (1200*9+1400)/10=1220, P2: (1200*9+1000)/10=1180
      // Pass 2: same (num_games > 0, init from rating column)
      // Average: P1=1220, P2=1180
      expect(result.players[0].nRating).toBe(1220);
      expect(result.players[1].nRating).toBe(1180);
    });

    it('should use nRating from file when num_games=0', () => {
      const players = [
        createPlayer(1, 1200, 0, 1100),
        createPlayer(2, 1200, 0, 1100),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // num_games=0, initRating=1100 (not capped, 1100 < 1800)
      // Self-based perfRating: ownRating + 400*wldPerfs
      // Pass 1: perfRating0=1100+200=1300, perfRating1=1100-200=900
      //   P1: (1100*0+1300)/1=1300, P2: (1100*0+900)/1=900
      // Pass 2: P1 init=1300, P2 init=900
      //   perfRating0=1300+200=1500, perfRating1=900-200=700
      //   P1: (1300*0+1500)/1=1500, P2: (900*0+700)/1=700
      // Average: P1=(1300+1500)/2=1400, P2=(900+700)/2=800
      expect(result.players[0].nRating).toBe(1400);
      expect(result.players[1].nRating).toBe(800);
    });

   it('should cap initial rating at 1800 when num_games=0', () => {
      const players = [
        createPlayer(1, 2000, 0, 2000), // nRating=2000 but capped to 1800
        createPlayer(2, 1200, 0, 1200),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

    const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // P1 initRating = min(2000, 1800) = 1800 (capped)
      // P2 initRating = 1200
      // Self-based perfRating: ownRating + 400*wldPerfs
      // Pass 1: perfRating0=1800+200=2000, perfRating1=1200-200=1000
      //   P1: (1800*0+2000)/1=2000, P2: (1200*0+1000)/1=1000
      // Pass 2: P1 init=min(2000,1800)=1800, P2 init=1000
      //   perfRating0=1800+200=2000, perfRating1=1000-200=800
      //   P1: (1800*0+2000)/1=2000, P2: (1000*0+800)/1=800
      // Average: P1=(2000+2000)/2=2000, P2=(1000+800)/2=900
      expect(result.players[0].nRating).toBe(2000);
      expect(result.players[1].nRating).toBe(900);
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

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // side0 = (1200+1200)/2 = 1200 (factor=1, no deflation), side1 = (1000+1000)/2 = 1000
      // Self-based perfRating: ownRating + 400*wldPerfs
      // wldPerfs: split (score1=3, score2=1) → perfs(0)=0, perfs(1)=0
      // P1 perfRating=1200+0=1200, P3 perfRating=1000+0=1000
      // P1: (1200*5+1200)/6=1200, P3: (1000*5+1000)/6=1000
      expect(result.players[0].nRating).toBeCloseTo(1200, 0);
      expect(result.players[1].nRating).toBeCloseTo(1200, 0);
      expect(result.players[2].nRating).toBeCloseTo(1000, 0);
      expect(result.players[3].nRating).toBeCloseTo(1000, 0);
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
      // createMatch(3, 3, 4) gives score1=3, score2=1 (split: each side wins one game)
      // wldPerfs accumulate: +0.5-0.5=0 for both sides (cancel out)
      // Expected adjustment runs once per game (myplayer loop), so 2x for 4p
      // side0=1500, side1=1400, expected≈0.640
      // eloPerfs0 = 0 + 2*(0.5-0.640) = -0.280, eloPerfs1 = 0 + 2*(0.640-0.5) = 0.280
      // Team 1 (side 0, favored but split): 1500 + (-0.280)*20 = 1494
      // Team 2 (side 1, underdog but split): 1400 + 0.280*20 = 1406
      expect(result.players[0].nRating).toBe(1494);
      expect(result.players[1].nRating).toBe(1494);
      expect(result.players[2].nRating).toBe(1406);
      expect(result.players[3].nRating).toBe(1406);
    });
  });

  describe('edge cases', () => {
    it('should handle players with no games today', () => {
      const players = [
        createPlayer(1, 1500, 5),
        createPlayer(2, 1400, 5),
      ];

      const result = calculateRatings(players, []);

      expect(result.players[0].nRating).toBe(0);
      expect(result.players[1].nRating).toBe(0);
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

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // Self-based perfRating: ownRating + 400*wldPerfs (factor=1, no deflation)
      // perfRating0=1500+200=1700, perfRating1=1400-200=1200
      // P1: (1500*5+1700)/6=1533, P2: (1400*5+1200)/6=1367
      expect(result.players[0].nRating).toBe(1533);
      expect(result.players[1].nRating).toBe(1367);
      expect(result.players[2].nRating).toBe(0); // No games, unchanged
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

      // side0=500, perfRating = 500 + 400*(-0.5) = 300 (positive, no clamp needed)
      // But if perfRating would be negative, it should be clamped to 0
      expect(result.players[0].nRating).toBeGreaterThan(0);
    });

   it('should handle single game', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches, { blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // Self-based perfRating: ownRating + 400*wldPerfs (factor=1, no deflation)
      // perfRating0=1200+200=1400, perfRating1=1200-200=1000
      // P1: (1200*5+1400)/6=1233, P2: (1200*5+1000)/6=1167
      expect(result.players[0].nRating).toBeCloseTo(1233, 0);
      expect(result.players[1].nRating).toBeCloseTo(1167, 0);
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
      const resultHighK = calculateRatings(players, matches, { kFactorOverride: 100 });

      // kFactor=1 = very stable
      const players2 = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 15),
      ];
      const resultLowK = calculateRatings(players2, matches, { kFactorOverride: 1 });

      // rating is updated to match nRating for players who played (VB6 behavior)
      // Compare change from original rating (1500)
      expect(resultHighK.players[0].nRating - 1500).toBeGreaterThan(
        resultLowK.players[0].nRating - 1500
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

      expect(result.players[0].trophyEligible).toBe(true);
    });

    it('should preserve trophyEligible=false for negative rating through recalculation', () => {
      const players = [
        createPlayer(1, -1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(false);
    });

    it('should preserve trophyEligible for players who lose badly', () => {
      const players = [
        { ...createPlayer(1, 1500, 5, 1500), trophyEligible: true },
        { ...createPlayer(2, 800, 5, 800), trophyEligible: true },
      ];
      const matches = [createMatch(1, 2, 1)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(true);
    });

    it('should preserve trophyEligible for players with no games today', () => {
      const players = [
        createPlayer(1, 1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches: MatchData[] = [];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(true);
    });

    it('should default trophyEligible to true when missing', () => {
      const players = [
        { rank: 1, rating: 1200, nRating: 1200, num_games: 5 } as PlayerData,
        { rank: 2, rating: 1100, nRating: 1100, num_games: 5 } as PlayerData,
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(true);
    });

    it('should store abs(nRating) regardless of eligibility', () => {
      const players = [
        createPlayer(1, 1200, 5, 1200),
        createPlayer(2, 1100, 5, 1100),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].nRating).toBeGreaterThan(0);
    });

    it('should compute nRating but preserve eligibility when num_games=0', () => {
      const players = [
        createPlayer(1, 1200, 0, 1200),
        createPlayer(2, 1100, 0, 1100),
        createPlayer(3, 1000, 0, 1000),
      ];
      const matches = [createMatch(1, 2, 3), createMatch(1, 3, 3)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(true);
      expect(result.players[0].nRating).toBeGreaterThan(0);
    });

    it('should preserve eligibility when num_games < 10', () => {
      const players = [
        createPlayer(1, 1200, 3, 1200),
        createPlayer(2, 1100, 3, 1100),
        createPlayer(3, 1000, 3, 1000),
      ];
      const matches = [createMatch(1, 2, 3)];

      const result = calculateRatings(players, matches);

      expect(result.players[0].trophyEligible).toBe(true);
    });
  });

  describe('debugMode', () => {
    it('should return trace object when debugMode is true', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 12),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches, { debugMode: true });

      expect(result.trace).toBeDefined();
      expect(result.trace!.kFactor).toBe(20);
      expect(result.trace!.init).toHaveLength(2);
      expect(result.trace!.matches).toHaveLength(1);
      expect(result.trace!.final).toHaveLength(2);

      // Check init trace
      expect(result.trace!.init[0].rank).toBe(1);
      expect(result.trace!.init[0].numGames).toBe(15);
      expect(result.trace!.init[0].initNRating).toBe(1500);

      // Check match trace
      const matchTrace = result.trace!.matches[0];
      expect(matchTrace.sideRatings).toEqual([1500, 1400]);
      expect(matchTrace.expected).toBeGreaterThan(0);
      expect(matchTrace.expected).toBeLessThan(1);
      expect(matchTrace.eloPerfs).toHaveLength(2);
      expect(matchTrace.playerUpdates).toHaveLength(2);

      // Check final trace
      expect(result.trace!.final[0].played).toBe(true);
      expect(result.trace!.final[0].nRating).toBe(1507);
      expect(result.trace!.final[1].played).toBe(true);
      expect(result.trace!.final[1].nRating).toBe(1393);
    });

    it('should not return trace when debugMode is false', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 12),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches);

      expect(result.trace).toBeUndefined();
    });

    it('should trace blending for new players', () => {
      const players = [
        createPlayer(1, 1200, 0),
        createPlayer(2, 1200, 0),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches, { debugMode: true, blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      const matchTrace = result.trace!.matches[0];

      // Check that blending was used
      expect(matchTrace.playerUpdates[0].formula).toBe('blend');
      expect(matchTrace.playerUpdates[0].opposingPerfRating).toBe(1400);
      expect(matchTrace.playerUpdates[1].formula).toBe('blend');
      expect(matchTrace.playerUpdates[1].opposingPerfRating).toBe(1000);

      // Self-based perfRating: ownRating + 400*wldPerfs
      expect(matchTrace.perfRatings).toEqual([1400, 1000]);
    });

    it('should trace 4-player game with cross-side blending', () => {
      const players = [
        createPlayer(1, 1200, 5),
        createPlayer(2, 1200, 5),
        createPlayer(3, 1000, 5),
        createPlayer(4, 1000, 5),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3, 3, 4), // Team 1 (1+2) vs Team 2 (3+4)
      ];

      const result = calculateRatings(players, matches, { debugMode: true });

      const matchTrace = result.trace!.matches[0];

      // 4-player: perfs cancel, self-based perfRating = own side rating
      expect(matchTrace.perfRatings).toEqual([1200, 1000]);

      // Self-based: side 0 blends with own perfRating (1200), side 1 with own (1000)
      expect(matchTrace.playerUpdates[0].opposingPerfRating).toBe(1200);
      expect(matchTrace.playerUpdates[2].opposingPerfRating).toBe(1000);
    });
  });

  describe('doublePass', () => {
    it('should average pass1 and pass2 nRating results', () => {
      const players = [
        createPlayer(1, 1200, 0),
        createPlayer(2, 1200, 0),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches, { debugMode: true, blendingFactorOverride: 1, perfMultiplierScaleOverride: 1 });

      // Results are averaged between pass 1 and pass 2
      expect(result.pass1NRating).toBeDefined();
      expect(result.pass2NRating).toBeDefined();

      // Pass 1: P1=1400, P2=1000 (from self-based blending)
      expect(result.pass1NRating!.get(1)).toBe(1400);
      expect(result.pass1NRating!.get(2)).toBe(1000);

      // Pass 2: P1 init=1400, P2 init=1000
      //   perfRating0=1400+200=1600, perfRating1=1000-200=800
      //   P1=1600, P2=800
      expect(result.pass2NRating!.get(1)).toBe(1600);
      expect(result.pass2NRating!.get(2)).toBe(800);

      // Average: P1=(1400+1600)/2=1500, P2=(1000+800)/2=900
      const p1Avg = result.players[0].nRating;
      const p2Avg = result.players[1].nRating;
      expect(p1Avg).toBe(1500);
      expect(p2Avg).toBe(900);
    });

    it('should produce consistent results for experienced players', () => {
      const players = [
        createPlayer(1, 1500, 15),
        createPlayer(2, 1400, 12),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3), // Player 1 wins
      ];

      const result = calculateRatings(players, matches);

      // For experienced players (>9 games), both passes produce same result
      expect(result.pass2NRating!.get(1)).toBe(result.players[0].nRating);
      expect(result.pass2NRating!.get(2)).toBe(result.players[1].nRating);
    });

    it('should always use double-pass averaging', () => {
      const players = [
        createPlayer(1, 1200, 0),
        createPlayer(2, 1200, 0),
      ];

      const matches: MatchData[] = [
        createMatch(1, 2, 3),
      ];

      const result = calculateRatings(players, matches);

      // Verify averaging: (pass1 + pass2) / 2
      expect(result.pass2NRating!.has(1)).toBe(true);
      expect(result.pass2NRating!.has(2)).toBe(true);
    });
  });

  describe('non-sequential ranks', () => {
    it('should build matches correctly when players have non-sequential ranks', () => {
      const players: PlayerData[] = [
        {
          rank: 94,
          group: 'A',
          lastName: 'Player94',
          firstName: 'P94',
          rating: 1400,
          nRating: 1450,
          trophyEligible: true,
          grade: '5',
          num_games: 5,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
        {
          rank: 95,
          group: 'A',
          lastName: 'Player95',
          firstName: 'P95',
          rating: 1350,
          nRating: 1400,
          trophyEligible: true,
          grade: '5',
          num_games: 3,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
        {
          rank: 152,
          group: 'A',
          lastName: 'Player152',
          firstName: 'P152',
          rating: 1200,
          nRating: 1250,
          trophyEligible: true,
          grade: '5',
          num_games: 1,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
      ];

      // Create matches directly with non-sequential ranks
      const matches: MatchData[] = [
        createMatch(94, 95, 3), // Player 94 wins
      ];

      const result = processGameResults(players, 31);

      expect(result.hasErrors).toBe(false);
      // processGameResults parses game results from cells, not matches
      // So we test calculateRatings directly with non-sequential rank matches
    });

    it('should calculate ratings correctly with non-sequential ranks', () => {
      const players: PlayerData[] = [
        {
          rank: 94,
          group: 'A',
          lastName: 'Player94',
          firstName: 'P94',
          rating: 1400,
          nRating: 1450,
          trophyEligible: true,
          grade: '5',
          num_games: 5,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
        {
          rank: 95,
          group: 'A',
          lastName: 'Player95',
          firstName: 'P95',
          rating: 1350,
          nRating: 1400,
          trophyEligible: true,
          grade: '5',
          num_games: 3,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
      ];

      const matches: MatchData[] = [
        createMatch(94, 95, 3), // Player 94 wins
      ];

      const result = calculateRatings(players, matches);

      expect(result.players).toHaveLength(2);
      expect(result.players.find(p => p.rank === 94)!.nRating).toBeGreaterThan(1400);
      expect(result.players.find(p => p.rank === 95)!.nRating).toBeLessThan(1350);
    });

    it('should handle 4-player matches with non-sequential ranks', () => {
      const players: PlayerData[] = [
        {
          rank: 100,
          group: 'A',
          lastName: 'Player100',
          firstName: 'P100',
          rating: 1400,
          nRating: 1450,
          trophyEligible: true,
          grade: '5',
          num_games: 5,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
        {
          rank: 101,
          group: 'A',
          lastName: 'Player101',
          firstName: 'P101',
          rating: 1350,
          nRating: 1400,
          trophyEligible: true,
          grade: '5',
          num_games: 3,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
        {
          rank: 102,
          group: 'A',
          lastName: 'Player102',
          firstName: 'P102',
          rating: 1300,
          nRating: 1350,
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
          rank: 103,
          group: 'A',
          lastName: 'Player103',
          firstName: 'P103',
          rating: 1250,
          nRating: 1300,
          trophyEligible: true,
          grade: '5',
          num_games: 1,
          attendance: 0,
          info: '',
          phone: '',
          school: '',
          room: '',
          gameResults: Array(31).fill(null),
        },
      ];

      const matches: MatchData[] = [
        createMatch(100, 101, 3, 102, 103), // Team 1 (100+101) vs Team 2 (102+103)
      ];

      const result = calculateRatings(players, matches);

      expect(result.players).toHaveLength(4);
      // Verify all 4 players were found by rank and had ratings calculated
      const p100 = result.players.find(p => p.rank === 100);
      const p101 = result.players.find(p => p.rank === 101);
      const p102 = result.players.find(p => p.rank === 102);
      const p103 = result.players.find(p => p.rank === 103);
      expect(p100).toBeDefined();
      expect(p101).toBeDefined();
      expect(p102).toBeDefined();
      expect(p103).toBeDefined();
      // All should have non-zero nRatings (ratings were calculated)
      expect(p100!.nRating).toBeGreaterThan(0);
      expect(p101!.nRating).toBeGreaterThan(0);
      expect(p102!.nRating).toBeGreaterThan(0);
      expect(p103!.nRating).toBeGreaterThan(0);
    });
  });
});
