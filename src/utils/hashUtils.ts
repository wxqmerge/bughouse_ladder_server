/**
 * VB6 Bughouse Ladder - Client-side utilities
 * Re-exports from shared module for backward compatibility
 */

// Re-export all shared utilities
export {
  CONSTANTS,
  RESULT_STRING,
  GROUP_CODES,
  SORT_OPTIONS,
  formula,
  processGameResults,
  calculateRatings,
  repopulateGameResults,
  validateGameResult,
  updatePlayerGameData,
  normalize4Player,
  normalize2Player
} from "../../shared/utils/hashUtils";

// Re-export types for backward compatibility
export type { 
  PlayerData, 
  ValidationResult, 
  MatchData, 
  PlayerMatchResult 
} from '../../shared/types';
