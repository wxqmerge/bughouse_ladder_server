/**
 * Shared constants for the Bughouse Ladder application
 */

export const NUM_ROUNDS = 31;

/** Default empty game results array (NUM_ROUNDS null entries). */
export const DEFAULT_GAME_RESULTS: (string | null)[] = Array(NUM_ROUNDS).fill(null);

/** Mini-game file names (with .tab extension) */
export const MINI_GAME_FILES: string[] = [
  'BG_Game.tab',
  'Bishop_Game.tab',
  'Pillar_Game.tab',
  'Kings_Cross.tab',
  'Pawn_Game.tab',
  'Queen_Game.tab',
  'bughouse.tab',
];
