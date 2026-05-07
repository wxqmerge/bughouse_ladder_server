/**
 * Client-side constants - re-exports from shared module
 */

export {
  MINI_GAMES,
  MINI_GAMES_WITH_BUGHOUSE,
  ERROR_MESSAGES,
  getValidationErrorMessage,
  getNextTitle,
  processNewDayTransformations,
  isMiniGameTitle,
  titleToFileName,
} from '../../shared/utils/constants';

// Re-export types for backward compatibility
export type { PlayerData } from '../../shared/types';
