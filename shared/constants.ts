/**
 * Shared constants for the Bughouse Ladder application
 */

export const NUM_ROUNDS = 31;

/** Default empty game results array (NUM_ROUNDS null entries). */
export const DEFAULT_GAME_RESULTS: (string | null)[] = Array(NUM_ROUNDS).fill(null);

/** Mini-game file names (with .tab extension) */
export const MINI_GAME_FILES: string[] = [
  'bg_game.tab',
  'bishop_game.tab',
  'pillar_game.tab',
  'kings_cross.tab',
  'pawn_game.tab',
  'queen_game.tab',
  'bughouse.tab',
];
