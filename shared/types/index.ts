/**
 * VB6 Bughouse Ladder - Shared Types
 */

export const CONSTANTS = {
  GROWS_MAX: 200,
  GCOLS: 44,
  GROUP_FIELD: 0,
  LAST_NAME_FIELD: 1,
  FIRST_NAME_FIELD: 2,
  RATING_FIELD: 3,
  RANKING_FIELD: 4,
  N_RATING_FIELD: 5,
  GRADE_FIELD: 6,
  GAMES_FIELD: 7,
  ATTENDANCE_FIELD: 8,
  PHONE_FIELD: 9,
  INFO_FIELD: 10,
  SCHOOL_FIELD: 11,
  ROOM_FIELD: 12,
  LAST_PARAM_FIELD: 12,
} as const;

export const RESULT_STRING = "OLDWXYZ__________" as const;

export interface PlayerData {
  rank: number;
  group: string;
  lastName: string;
  firstName: string;
  rating: number;
  nRating: number;
  grade: string;
  num_games: number;
  attendance: number | string;
  info: string;
  phone: string;
  school: string;
  room: string;
  gameResults: (string | null)[];
}

export type PlayersArray = Record<number, PlayerData>;

export interface ValidationResult {
  hashValue: number;
  player1: number;
  player2: number;
  player3: number;
  player4: number;
  score1: number;
  score2: number;
  resultIndex: number;
  isValid: boolean;
  error: number;
  originalString: string;
  playerRank: number;
  conflictingResults?: { playerRank: number; result: string }[];
}

export interface MatchData {
  player1: number;
  player2: number;
  player3: number;
  player4: number;
  score1: number;
  score2: number;
}

export interface PlayerMatchResult {
  playerRank: number;
  resultString: string;
}
