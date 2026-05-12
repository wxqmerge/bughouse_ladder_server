/**
 * Shared test factories for creating PlayerData instances.
 * Consolidates 7 different createPlayer patterns across the codebase.
 */

import type { PlayerData } from '../../../shared/types';
import { DEFAULT_GAME_RESULTS } from '../../../shared/constants';

export const DEFAULT_PLAYER_OVERRIDES: Omit<Partial<PlayerData>, 'gameResults'> = {
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
};

/**
 * Create a player with default values that can be overridden.
 * Used by: migration.test.ts, migrationModeSwitch.test.ts
 */
export function createTestPlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return { ...DEFAULT_PLAYER_OVERRIDES, gameResults: [...DEFAULT_GAME_RESULTS], ...overrides };
}

/**
 * Create a player with specific rank, rating, and game experience.
 * Used by: calculateRatings.test.ts
 */
export function createPlayer(
  rank: number,
  rating: number,
  numGames: number,
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
    num_games: numGames,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: [...DEFAULT_GAME_RESULTS],
  };
}

/**
 * Create a player with explicit game results array.
 * Used by: tournamentExtended.test.ts
 */
export function createMatchPlayer(
  rank: number,
  lastName: string,
  firstName: string,
  rating: number,
  grade: string,
  numGames: number,
  gameResults: (string | null)[],
): PlayerData {
  return {
    rank,
    group: 'A1',
    lastName,
    firstName,
    rating,
    nRating: rating,
    trophyEligible: true,
    grade,
    num_games: numGames,
    attendance: 0,
    phone: '',
    info: '',
    school: '',
    room: '',
    gameResults: gameResults.concat(Array(31 - gameResults.length).fill(null)),
  };
}
