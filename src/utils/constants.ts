/**
 * Client-side constants - re-exports from shared module
 */

export {
  MINI_GAMES,
  MINI_GAMES_WITH_BUGHOUSE,
  ERROR_MESSAGES,
  getValidationErrorMessage,
  getNextTitle,
  fileNameToTitle,
  processNewDayTransformations,
  isMiniGameTitle,
  titleToFileName,
  LADDER_SHORTCUTS,
  SHORTCUT_TO_TITLE,
} from '../../shared/utils/constants';

// Re-export types for backward compatibility
export type { PlayerData } from '../../shared/types';
