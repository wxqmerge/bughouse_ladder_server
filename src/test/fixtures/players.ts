/**
 * Test fixtures derived from manual test cases
 * These provide consistent input data for unit tests
 */

import { PlayerData } from '../../shared/types';

/**
 * Sample player data from kings_cross.tab
 * Used for testing basic operations and rating calculations
 */
export const kingsCrossPlayers: PlayerData[] = [
  {
    rank: 8,
    group: 'A1',
    lastName: 'Cullano',
    firstName: 'Dylan',
    rating: 1279,
    nRating: 1262,
    grade: '8',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
  {
    rank: 7,
    group: 'A1',
    lastName: 'Layman',
    firstName: 'Ryan',
    rating: 957,
    nRating: 0,
    grade: '8',
    num_games: 0,
    attendance: 1,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
  {
    rank: 22,
    group: 'A1',
    lastName: 'Nuesea',
    firstName: 'James',
    rating: 956,
    nRating: 0,
    grade: '6',
    num_games: 0,
    attendance: 1,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
  {
    rank: 1,
    group: 'A1',
    lastName: 'Morehedd',
    firstName: 'Jermaine',
    rating: 908,
    nRating: 909,
    grade: '8',
    num_games: 0,
    attendance: 1,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
];

/**
 * Simple test data for basic operations
 */
export const simplePlayers: PlayerData[] = [
  {
    rank: 1,
    group: 'A',
    lastName: 'Smith',
    firstName: 'John',
    rating: 1500,
    nRating: 1500,
    grade: '5',
    num_games: 10,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: [
      null, null, 'W', 'L', 'W', 'W', 'D', 'L', null, null,
      ...Array(22).fill(null)
    ],
  },
  {
    rank: 2,
    group: 'A',
    lastName: 'Johnson',
    firstName: 'Jane',
    rating: 1450,
    nRating: 1450,
    grade: '5',
    num_games: 8,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
];

/**
 * Test data with game results for paste results testing
 */
export const playersWithResults: PlayerData[] = [
  {
    rank: 1,
    group: 'A',
    lastName: 'PlayerOne',
    firstName: 'First',
    rating: 1200,
    nRating: 1200,
    grade: '4',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
  {
    rank: 2,
    group: 'A',
    lastName: 'PlayerTwo',
    firstName: 'Second',
    rating: 1100,
    nRating: 1100,
    grade: '4',
    num_games: 0,
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
    lastName: 'PlayerThree',
    firstName: 'Third',
    rating: 1000,
    nRating: 1000,
    grade: '4',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
  {
    rank: 4,
    group: 'A',
    lastName: 'PlayerFour',
    firstName: 'Fourth',
    rating: 900,
    nRating: 900,
    grade: '4',
    num_games: 0,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: Array(31).fill(null),
  },
];
