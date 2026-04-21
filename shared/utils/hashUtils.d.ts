/**
 * VB6 Bughouse Ladder - Shared Logic
 */
import { PlayerData, MatchData, PlayerMatchResult, ProcessResult, UpdatePlayerGameDataResult, ValidationResultResult } from "../types";
/**
 * VB6 Line: 25 - Global constants from common.bas
 * Field indices used throughout the VB6 application
 */
export declare const CONSTANTS: {
    readonly GROWS_MAX: 200;
    readonly GCOLS: 44;
    readonly GROUP_FIELD: 0;
    readonly LAST_NAME_FIELD: 1;
    readonly FIRST_NAME_FIELD: 2;
    readonly RATING_FIELD: 3;
    readonly RANKING_FIELD: 4;
    readonly N_RATING_FIELD: 5;
    readonly GRADE_FIELD: 6;
    readonly GAMES_FIELD: 7;
    readonly ATTENDANCE_FIELD: 8;
    readonly PHONE_FIELD: 9;
    readonly INFO_FIELD: 10;
    readonly SCHOOL_FIELD: 11;
    readonly ROOM_FIELD: 12;
    readonly LAST_PARAM_FIELD: 12;
};
/**
 * VB6 Line: 90 - Result string parsing symbols
 * Used for parsing game results from strings
 */
export declare const RESULT_STRING: "OLDWXYZ__________";
/**
 * VB6 Line: 61 - Group codes for player classification
 */
export declare const GROUP_CODES: "A1xAxBxCxDxExFxGxHxIxZx   ";
/**
 * VB6 Line: 77 - Sort options
 */
export declare const SORT_OPTIONS: {
    readonly SORT_RANK: 0;
    readonly SORT_NAME: 1;
    readonly SORT_FIRST_NAME: 2;
    readonly SORT_RATING: 3;
};
/**
 * VB6 Line: 129-130 - Elo rating formula
 * Returns probability of winning for given ratings
 */
export declare function formula(myRating: number, opponentsRating: number): number;
/**
 * VB6 Line: 133-137 - Get ladder name from current directory
 * Note: This uses window.location, which is not available in Node.js.
 * For the server, this should be handled differently or passed in.
 */
export declare function getLadderName(): string;
/**
 * VB6 Line: 138-154 - Player array to string conversion
 * Translates player and score arrays to hash string format
 */
export declare function entry2string(playersList: number[], scoreList: number[]): string;
/**
 * VB6 Line: 155-271 - Parse entry string to structured data
 * Parses game entry like "23:29LW" into game details
 */
export declare function parseEntry(myText: string, playersList: number[], scoreList: number[]): number;
/**
 * VB6 Line: 372-378 - String to long conversion (wrapper for parseEntry)
 */
export declare function string2long(game: string, playersList: number[], scoreList: number[]): number;
/**
 * VB6 Line: 384-409 - Long to string conversion
 * Converts hash value back to game string like "23:29LW"
 */
export declare function long2string(game: number): string;
/**
 * VB6 Line: 414-416 - Reset placement tracking
 */
export declare function resetPlacement(): void;
/**
 * VB6 Line: 419-422 - Hash function initialization
 * Sets up pseudorandom array for hash generation
 */
export declare function hashInitialize(): void;
export declare let hashArray: string[];
export declare let hashIndex: number[];
/**
 * Process game results from all players and calculate ratings
 * VB6-inspired implementation with hash table validation
 */
export declare function processGameResults(playersList: PlayerData[], numRounds?: number): ProcessResult;
/**
 * Calculate Elo ratings based on game results
 */
export declare function calculateRatings(playersList: PlayerData[], matches: MatchData[], _kFactorOverride?: number): PlayerData[];
/**
 * Repopulate game results from validated matches
 */
export declare function repopulateGameResults(playersList: PlayerData[], matches: MatchData[], numRounds?: number, _playerResultsByMatch?: Map<string, PlayerMatchResult[]>): PlayerData[];
export declare function validateGameResult(input: string): ValidationResultResult;
export declare function updatePlayerGameData(input: string, addUnderscore?: boolean): UpdatePlayerGameDataResult;
//# sourceMappingURL=hashUtils.d.ts.map