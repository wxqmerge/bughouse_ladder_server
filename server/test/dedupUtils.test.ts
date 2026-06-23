import { describe, it, expect } from 'vitest';
import { deduplicatePlayers } from '../../shared/utils/dedupUtils';
import type { PlayerData } from '../../shared/types';
import { NUM_ROUNDS } from '../../shared/utils/constants';

function makePlayer(
  rank: number,
  lastName: string,
  firstName: string,
  overrides: Partial<PlayerData> = {}
): PlayerData {
  return {
    rank,
    group: 'A',
    lastName,
    firstName,
    rating: 1200,
    nRating: 1200,
    trophyEligible: true,
    grade: '5',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(NUM_ROUNDS).fill(null),
    ...overrides,
  };
}

describe('deduplicatePlayers', () => {
  it('should return empty array for empty input', () => {
    expect(deduplicatePlayers([])).toEqual([]);
  });

  it('should return empty array for null input', () => {
    // @ts-expect-error testing null handling
    expect(deduplicatePlayers(null)).toEqual([]);
  });

  it('should return unchanged array when no duplicates exist', () => {
    const players = [
      makePlayer(1, 'Smith', 'John'),
      makePlayer(2, 'Jones', 'Jane'),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('should merge duplicates by name (case-insensitive)', () => {
    const players = [
      makePlayer(1, 'Smith', 'John', { num_games: 5, attendance: 3 }),
      makePlayer(2, 'smith', 'JOHN', { num_games: 3, attendance: 2 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].lastName).toBe('Smith');
    expect(result[0].firstName).toBe('John');
    expect(result[0].num_games).toBe(8);
    expect(result[0].attendance).toBe(5);
  });

  it('should keep the player with lowest rank as the base', () => {
    const players = [
      makePlayer(5, 'Smith', 'John', { rating: 1100 }),
      makePlayer(2, 'Smith', 'John', { rating: 1300 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(1);
    expect(result[0].rank).toBe(2);
    expect(result[0].rating).toBe(1300);
  });

  it('should merge game results: prefer non-null values', () => {
    const results1 = Array(NUM_ROUNDS).fill(null);
    results1[0] = '1W3';
    results1[2] = '2L4';

    const results2 = Array(NUM_ROUNDS).fill(null);
    results2[1] = '5W6';
    results2[3] = '7L8';

    const players = [
      makePlayer(1, 'Smith', 'John', { gameResults: results1 }),
      makePlayer(2, 'Smith', 'John', { gameResults: results2 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result[0].gameResults[0]).toBe('1W3');
    expect(result[0].gameResults[1]).toBe('5W6');
    expect(result[0].gameResults[2]).toBe('2L4');
    expect(result[0].gameResults[3]).toBe('7L8');
  });

  it('should prefer verified cells (with underscore suffix)', () => {
    const results1 = Array(NUM_ROUNDS).fill(null);
    results1[0] = '1W3';

    const results2 = Array(NUM_ROUNDS).fill(null);
    results2[0] = '5L6_';

    const players = [
      makePlayer(1, 'Smith', 'John', { gameResults: results1 }),
      makePlayer(2, 'Smith', 'John', { gameResults: results2 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result[0].gameResults[0]).toBe('5L6_');
  });

  it('should prefer verified cell from lower rank when both are verified', () => {
    const results1 = Array(NUM_ROUNDS).fill(null);
    results1[0] = '1W3_';

    const results2 = Array(NUM_ROUNDS).fill(null);
    results2[0] = '5L6_';

    const players = [
      makePlayer(1, 'Smith', 'John', { gameResults: results1 }),
      makePlayer(2, 'Smith', 'John', { gameResults: results2 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result[0].gameResults[0]).toBe('1W3_');
  });

  it('should handle three or more duplicates', () => {
    const players = [
      makePlayer(1, 'Smith', 'John', { num_games: 2, attendance: 1, gameResults: ['1W3', null, null] }),
      makePlayer(3, 'Smith', 'John', { num_games: 3, attendance: 2, gameResults: [null, '5L6', null] }),
      makePlayer(5, 'Smith', 'John', { num_games: 1, attendance: 1, gameResults: [null, null, '7D8'] }),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].num_games).toBe(6);
    expect(result[0].attendance).toBe(4);
    expect(result[0].gameResults[0]).toBe('1W3');
    expect(result[0].gameResults[1]).toBe('5L6');
    expect(result[0].gameResults[2]).toBe('7D8');
  });

  it('should sort result by rank', () => {
    const players = [
      makePlayer(3, 'Jones', 'Jane'),
      makePlayer(1, 'Smith', 'John'),
      makePlayer(2, 'smith', 'john', { num_games: 1 }),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(3);
  });

  it('should handle players with undefined gameResults', () => {
    const players = [
      makePlayer(1, 'Smith', 'John', { gameResults: undefined as any }),
      makePlayer(2, 'Smith', 'John', { gameResults: ['1W3', null] }),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(1);
    expect(result[0].gameResults[0]).toBe('1W3');
  });

  it('should handle mixed case names as duplicates', () => {
    const players = [
      makePlayer(1, 'SMITH', 'John'),
      makePlayer(2, 'smith', 'JOHN'),
      makePlayer(3, 'Smith', 'john'),
    ];
    const result = deduplicatePlayers(players);
    expect(result.length).toBe(1);
    expect(result[0].rank).toBe(1);
  });
});
