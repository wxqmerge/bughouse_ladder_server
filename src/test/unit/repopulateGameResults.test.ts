/**
 * Tests for repopulateGameResults
 * Covers 2p, 4p, dedup, and edge cases
 */

import { describe, it, expect } from 'vitest';
import { repopulateGameResults } from '../../../shared/utils/hashUtils';
import type { MatchData, PlayerData } from '../../../shared/types';
import { createPlayer } from '../shared/factories';

describe('repopulateGameResults', () => {
  function makePlayers(...ranks: number[]): PlayerData[] {
    return ranks.map((r, i) => createPlayer(r, 1200 + i * 100, 0));
  }

  describe('2-player matches', () => {
    it('should populate 2p match for both players', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      const p2 = result.find(p => p.rank === 2);
      // Both players get same normalized result with both scores
      expect(p1!.gameResults[0]).toBe('1WL2_');
      expect(p2!.gameResults[0]).toBe('1WL2_');
    });

    it('should populate multiple 2p matches in separate rounds', () => {
      const players = makePlayers(1, 2, 3);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 3, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).not.toBeNull();
      expect(p1!.gameResults[2]).toBeNull();
    });

    it('should normalize 2p result with reversed players', () => {
      const players = makePlayers(3, 1);
      const matches: MatchData[] = [
        { player1: 3, player2: 1, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      const p3 = result.find(p => p.rank === 3);
      // Both should get the same normalized result
      expect(p1!.gameResults[0]).toBe(p3!.gameResults[0]);
    });

    it('should swap score letter when players are reversed', () => {
      // p1=12 lost (L=1), p2=1 won (W=3) → normalized: 1WL12_
      // (player 1 won, player 12 lost)
      const players = makePlayers(1, 12);
      const matches: MatchData[] = [
        { player1: 12, player2: 1, player3: 0, player4: 0, score1: 1, score2: 3, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      const p12 = result.find(p => p.rank === 12);
      // Normalized: [1, 12], swapped → score1 L→W, score2 W→L
      expect(p1!.gameResults[0]).toBe('1WL12_');
      expect(p12!.gameResults[0]).toBe('1WL12_');
    });

    it('should swap both score letters when players are reversed', () => {
      // p1=13 lost (L=1), p2=1 won (W=3) → normalized: 1WL13_
      // (player 1 won, player 13 lost)
      const players = makePlayers(1, 13);
      const matches: MatchData[] = [
        { player1: 13, player2: 1, player3: 0, player4: 0, score1: 1, score2: 3, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      const p13 = result.find(p => p.rank === 13);
      // Normalized: [1, 13], swapped → score1 L→W, score2 W→L
      expect(p1!.gameResults[0]).toBe('1WL13_');
      expect(p13!.gameResults[0]).toBe('1WL13_');
    });

    it('should handle 2p draw', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 2, score2: 2, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).toContain('D');
    });

    it('should handle 2p loss', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 1, score2: 3, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).toContain('L');
    });
  });

  describe('4-player matches', () => {
    it('should populate 4p match for all 4 players', () => {
      const players = makePlayers(1, 2, 3, 4);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 3, player4: 4, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      for (const p of result) {
        expect(p.gameResults[0]).not.toBeNull();
      }
    });

    it('should normalize 4p result with pair sorting', () => {
      const players = makePlayers(1, 2, 3, 4);
      const matches: MatchData[] = [
        { player1: 2, player2: 1, player3: 4, player4: 3, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      // All players should get the same normalized result
      const results = result.map(p => p.gameResults[0]);
      const first = results[0];
      for (const r of results) {
        expect(r).toBe(first);
      }
    });

    it('should normalize 4p result with pair swap', () => {
      const players = makePlayers(1, 2, 3, 4);
      const matches: MatchData[] = [
        { player1: 3, player2: 4, player3: 1, player4: 2, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const results = result.map(p => p.gameResults[0]);
      const first = results[0];
      for (const r of results) {
        expect(r).toBe(first);
      }
    });

    it('should handle 4p draw', () => {
      const players = makePlayers(1, 2, 3, 4);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 3, player4: 4, score1: 2, score2: 2, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).toContain('D');
    });
  });

  describe('deduplication', () => {
    it('should skip duplicate 2p match', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).toBeNull();
    });

    it('should skip duplicate 2p match with reversed players', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 2, player2: 1, player3: 0, player4: 0, score1: 1, score2: 3, side0Won: false },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).toBeNull();
    });

    it('should skip duplicate 4p match', () => {
      const players = makePlayers(1, 2, 3, 4);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 3, player4: 4, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 2, player3: 3, player4: 4, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).toBeNull();
    });

    it('should allow same opponent with different partner in 4p', () => {
      const players = makePlayers(1, 2, 3, 4, 5);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 3, player4: 4, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 5, player3: 3, player4: 2, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty matches', () => {
      const players = makePlayers(1, 2);
      const result = repopulateGameResults(players, []);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).toBeNull();
    });

    it('should handle player not in players list', () => {
      const players = makePlayers(1);
      const matches: MatchData[] = [
        { player1: 1, player2: 999, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
    });

    it('should respect numRounds parameter', () => {
      const players = makePlayers(1, 2, 3);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 3, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches, 2);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).not.toBeNull();
      expect(p1!.gameResults.length).toBe(2);
    });

    it('should not modify original players array', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const originalP1 = players.find(p => p.rank === 1)!;
      repopulateGameResults(players, matches);

      expect(originalP1.gameResults[0]).toBeNull();
    });

    it('should fill rounds sequentially', () => {
      const players = makePlayers(1, 2, 3, 4, 5);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 3, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 4, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
        { player1: 1, player2: 5, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).not.toBeNull();
      expect(p1!.gameResults[1]).not.toBeNull();
      expect(p1!.gameResults[2]).not.toBeNull();
      expect(p1!.gameResults[3]).not.toBeNull();
      expect(p1!.gameResults[4]).toBeNull();
    });

    it('should add underscore suffix to results', () => {
      const players = makePlayers(1, 2);
      const matches: MatchData[] = [
        { player1: 1, player2: 2, player3: 0, player4: 0, score1: 3, score2: 1, side0Won: true },
      ];

      const result = repopulateGameResults(players, matches);

      const p1 = result.find(p => p.rank === 1);
      expect(p1!.gameResults[0]).toMatch(/_$/);
    });
  });
});
