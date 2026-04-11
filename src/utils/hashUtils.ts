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
  entry2string,
  parseEntry,
  string2long,
  long2string,
  resetPlacement,
  hashInitialize,
  hashArray,
  hashIndex,
  processGameResults,
  calculateRatings,
  repopulateGameResults,
  validateGameResult,
  updatePlayerGameData
} from "../../shared/utils/hashUtils";

/**
 * VB6 Line: 133-137 - Get ladder name from current directory
 */
export function getLadderName(): string {
  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname;
    const lastSlashIndex = currentPath.lastIndexOf("/");
    return currentPath.substring(lastSlashIndex + 1);
  }
  return "";
}
