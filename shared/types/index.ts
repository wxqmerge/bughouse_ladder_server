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

export { DEFAULT_GAME_RESULTS } from '../constants.js';

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

export { MINI_GAME_FILES } from '../constants.js';

export const MINI_GAME_DIFFICULTY_ORDER: string[] = [
  'queen_game.tab',
  'pawn_game.tab',
  'kings_cross.tab',
  'pillar_game.tab',
  'bishop_game.tab',
  'bg_game.tab',
  'bughouse.tab',
];

export interface MiniGameData {
  fileName: string;
  players: PlayerData[];
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
  normalizedString?: string;
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
  writeMiniGameFile(fileName: string, ladderData: LadderData): Promise<{ identityUpdates: PlayerData[]; miniGameWritten: boolean }>;
  copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[];
  mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[];
  getExistingMiniGameFiles(): Promise<string[]>;
  clearMiniGames(): Promise<{ deletedCount: number }>;
  hasMiniGameFiles(): Promise<boolean>;
  checkMiniGameFilesWith(): Promise<string[]>;
  addPlayerToAllMiniGames(newPlayer: PlayerData): Promise<void>;
  removePlayerFromAllMiniGames(lastName: string, firstName: string): Promise<void>;
  updatePlayerInAllMiniGames(rank: number, originalLastName: string, originalFirstName: string, updates: Partial<PlayerData>): Promise<void>;
  generateTrophyReport(players: PlayerData[], debugLevel: number): Promise<{
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
    debugInfo?: string;
    trophiesSection?: string[];
  }>;
  importMiniGameFiles(content: string): Promise<{ imported: string[]; errors: string[] }>;
}

export interface PrintLabelFieldLayout {
  x: number;    // left % (0-100)
  y: number;    // top % (0-100)
  fontSize: number; // pt size (0 = use CSS default)
}

export interface PrintLabelLayout {
  name: string;
  labelsPerPage: 20 | 30;
  fields: Record<string, PrintLabelFieldLayout>;
  marginTop: number;
  marginBottom: number;
  columnOffsets: number[];
}
