/**
 * VB6 Bughouse Ladder - Shared Types
 */

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

export type ProcessResult = {
  matches: MatchData[];
  playerResultsByMatch: Map<string, PlayerMatchResult[]>;
  hasErrors: boolean;
  errorCount: number;
  errors: any[];
};

export interface UpdatePlayerGameDataResult {
  isValid: boolean;
  error?: number;
  message?: string;
  parsedPlayersList?: number[];
  parsedScoreList?: number[];
  originalString: string;
  resultString?: string;
  parsedPlayer1Rank?: number;
  parsedPlayer2Rank?: number;
  parsedPlayer3Rank?: number;
  parsedPlayer4Rank?: number;
}

export interface ValidationResultResult {
  isValid: boolean;
  error?: number;
  message?: string;
}
