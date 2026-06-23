import { describe, it, expect } from 'vitest';
import {
  isValidGameResult,
  countGames,
  clubLadderGamesPlayed,
  formatPlayerName,
  copyPlayersToTarget,
  mergeGameResults,
} from '../../shared/utils/trophyGeneration';
import type { PlayerData } from '../../shared/types';

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
    gameResults: Array(31).fill(null),
    ...overrides,
  };
}

describe('isValidGameResult', () => {
  it('should return true for non-empty strings', () => {
    expect(isValidGameResult('1W3')).toBe(true);
    expect(isValidGameResult('5L6_')).toBe(true);
    expect(isValidGameResult('D')).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidGameResult(null)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidGameResult('')).toBe(false);
  });

  it('should return false for underscore-only string', () => {
    expect(isValidGameResult('_')).toBe(false);
  });
});

describe('countGames', () => {
  it('should count valid game results', () => {
    const results: (string | null)[] = [
      '1W3', null, '5L6_', '', null, '7D8',
    ];
    expect(countGames(results)).toBe(3);
  });

  it('should return 0 for empty array', () => {
    expect(countGames([])).toBe(0);
  });

  it('should return 0 for undefined', () => {
    expect(countGames(undefined)).toBe(0);
  });

  it('should skip null, empty, and underscore values', () => {
    const results: (string | null)[] = [null, '', '_', null];
    expect(countGames(results)).toBe(0);
  });
});

describe('clubLadderGamesPlayed', () => {
  it('should sum num_games and counted game results', () => {
    const player = makePlayer(1, 'Smith', 'John', {
      num_games: 5,
      gameResults: ['1W3', '5L6', null],
    });
    expect(clubLadderGamesPlayed(player)).toBe(7);
  });

  it('should handle player with no gameResults', () => {
    const player = makePlayer(1, 'Smith', 'John', {
      num_games: 3,
      gameResults: undefined as any,
    });
    expect(clubLadderGamesPlayed(player)).toBe(3);
  });

  it('should handle player with no num_games', () => {
    const player = makePlayer(1, 'Smith', 'John', {
      num_games: 0,
      gameResults: ['1W3', null, '5L6_'],
    });
    expect(clubLadderGamesPlayed(player)).toBe(2);
  });
});

describe('formatPlayerName', () => {
  it('should return "firstName lastName" when both present', () => {
    const player = makePlayer(1, 'Smith', 'John');
    expect(formatPlayerName(player)).toBe('John Smith');
  });

  it('should return firstName when lastName is empty', () => {
    const player = makePlayer(1, '', 'John');
    expect(formatPlayerName(player)).toBe('John');
  });

  it('should return lastName when firstName is empty', () => {
    const player = makePlayer(1, 'Smith', '');
    expect(formatPlayerName(player)).toBe('Smith');
  });

  it('should trim whitespace', () => {
    const player = makePlayer(1, '  Smith  ', '  John  ');
    expect(formatPlayerName(player)).toBe('John Smith');
  });

  it('should return empty string when both are empty', () => {
    const player = makePlayer(1, '', '');
    expect(formatPlayerName(player)).toBe('');
  });
});

describe('copyPlayersToTarget', () => {
  it('should copy identity fields from source to target by name match', () => {
    const source = [makePlayer(1, 'Smith', 'John', { rating: 1500, nRating: 1500, grade: '8' })];
    const target = [makePlayer(2, 'Smith', 'John', { rating: 1000, nRating: 1000, grade: '5' })];
    const result = copyPlayersToTarget(source, target);
    expect(result[0].rating).toBe(1500);
    expect(result[0].nRating).toBe(1500);
    expect(result[0].grade).toBe('8');
  });

  it('should preserve target gameResults and num_games', () => {
    const source = [makePlayer(1, 'Smith', 'John', { num_games: 10, gameResults: ['1W3'] })];
    const target = [makePlayer(2, 'Smith', 'John', { num_games: 5, gameResults: ['5L6'] })];
    const result = copyPlayersToTarget(source, target);
    expect(result[0].num_games).toBe(5);
    expect(result[0].gameResults[0]).toBe('5L6');
  });

  it('should add new players from source not in target', () => {
    const source = [
      makePlayer(1, 'Smith', 'John', { rating: 1500 }),
      makePlayer(3, 'Jones', 'Jane', { rating: 1300 }),
    ];
    const target = [makePlayer(2, 'Smith', 'John')];
    const result = copyPlayersToTarget(source, target);
    expect(result.length).toBe(2);
    const jones = result.find(p => p.lastName === 'Jones');
    expect(jones).toBeDefined();
    expect(jones!.rating).toBe(1300);
    expect(jones!.num_games).toBe(0);
  });

  it('should handle case-insensitive name matching', () => {
    const source = [makePlayer(1, 'SMITH', 'JOHN', { rating: 1500 })];
    const target = [makePlayer(2, 'smith', 'john')];
    const result = copyPlayersToTarget(source, target);
    expect(result[0].rating).toBe(1500);
  });
});

describe('mergeGameResults', () => {
  it('should fill empty slots from old results', () => {
    const old = ['1W3', null, '7D8'];
    const current = [null, '5L6', null];
    const result = mergeGameResults(old, current);
    expect(result).toEqual(['1W3', '5L6', '7D8']);
  });

  it('should not overwrite current values', () => {
    const old = ['1W3', null];
    const current = ['5L6', null];
    const result = mergeGameResults(old, current);
    expect(result).toEqual(['5L6', null]);
  });

  it('should handle different array lengths', () => {
    const old = ['1W3', '5L6', '7D8'];
    const current = [null, null];
    const result = mergeGameResults(old, current);
    // mergeGameResults extends current to fit old values
    expect(result).toEqual(['1W3', '5L6', '7D8']);
  });
});
