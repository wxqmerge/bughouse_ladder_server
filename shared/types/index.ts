/**
 * VB6 Bughouse Ladder - Shared Types
 */

export type DeltaOperation = 
  | { type: 'GAME_RESULT'; playerRank: number; round: number; result: string }
  | { type: 'PLAYER_UPDATE'; player: PlayerData }
  | { type: 'CLEAR_CELL'; playerRank: number; round: number };

export interface PlayerData {
  rank: number;
  group: string;
  lastName: string;
  firstName: string;
  rating: number;
  nRating: number;
  trophyEligible: boolean;
  grade: string;
  num_games: number;
  attendance: number;
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
  side0Won: boolean;
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

export interface LadderData {
  header: string[];
  players: PlayerData[];
  rawLines: string[];
}

export interface MiniGameStore {
  getMiniGameFiles(): string[];
  readMiniGameFile(fileName: string): Promise<LadderData | null>;
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<void>;
  copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[];
  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[];
  getExistingMiniGameFiles(): Promise<string[]>;
  clearMiniGames(): Promise<{ deletedCount: number }>;
  hasMiniGameFiles(): Promise<boolean>;
  checkMiniGameFilesWith(): Promise<string[]>;
  addPlayerToAllMiniGames(newPlayer: PlayerData): Promise<void>;
  generateTrophyReport(players: PlayerData[]): Promise<{
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
    debugInfo?: string;
    trophiesSection?: string[];
  }>;
  importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }>;
}
