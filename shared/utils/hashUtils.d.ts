/**
 * VB6 Bughouse Ladder - Shared Logic
 */
import { PlayerData, MatchData, PlayerMatchResult, ProcessResult, UpdatePlayerGameDataResult, ValidationResultResult } from "../types";
import { CalculateRatingsDebugTrace } from "./debugUtils";
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
 * Normalize 4-player: sort within pairs, then sort pairs by lowest player
 * e.g., 13:12,23:25 → 12:13,25:23
 */
export declare function normalize4Player(a1: number, a2: number, a3: number, a4: number): [number, number, number, number];
/**
 * Normalize 2-player: sort ascending
 * e.g., 13,12 → 12,13
 */
export declare function normalize2Player(a: number, b: number): [number, number];
/**
 * VB6 Line: 129-130 - Elo rating formula
 * Returns probability of winning for given ratings
 */
export declare function formula(myRating: number, opponentsRating: number): number;
/**
 * Process game results from all players and calculate ratings
 * VB6-inspired implementation with hash table validation
 */
export declare function processGameResults(playersList: PlayerData[], numRounds?: number): ProcessResult;
/**
 * Calculate Elo ratings based on game results
 * VB6-matching implementation with inline blending and correct performance formula.
 */
/**
 * Result of calculateRatings — includes players and optional debug trace.
 */
export interface CalculateRatingsResult {
    /** Updated player list */
    players: PlayerData[];
    /** Debug trace (only present when debugMode is true) */
    trace?: CalculateRatingsDebugTrace;
    /** Per-pass nRating results (double-pass averaging) */
    pass1NRating?: Map<number, number>;
    pass2NRating?: Map<number, number>;
}
/**
 * Main entry point for rating calculation.
 * Always runs double-pass averaging:
 *   Pass 1: compute nRating from original player state
 *   Pass 2: recompute using pass 1 nRating as input (affects num_games=0 players)
 *   Average: nRating = round((pass1 + pass2) / 2)
 *
 * This dampens extreme swings for new players and helps ratings converge.
 */
export declare function calculateRatings(playersList: PlayerData[], matches: MatchData[], options?: {
    /** Override K-factor (default: from settings or 20) */
    kFactorOverride?: number;
    /** When true: prints step-by-step VB6-equivalent trace + returns trace object */
    debugMode?: boolean;
    /** Override blending factor (default: from settings or 0.99) */
    blendingFactorOverride?: number;
    /** Scale factor for 2p perf multiplier (default: 1, effective = 400 * scale) */
    perfMultiplierScaleOverride?: number;
}): CalculateRatingsResult;
/**
 * Repopulate game results from validated matches
 */
export declare function repopulateGameResults(playersList: PlayerData[], matches: MatchData[], numRounds?: number, _playerResultsByMatch?: Map<string, PlayerMatchResult[]>): PlayerData[];
export declare function validateGameResult(input: string): ValidationResultResult;
export declare function updatePlayerGameData(input: string, addUnderscore?: boolean): UpdatePlayerGameDataResult;
//# sourceMappingURL=hashUtils.d.ts.map