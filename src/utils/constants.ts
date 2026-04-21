/**
 * Client-side constants - re-exports from shared module
 */

export {
  MINI_GAMES,
  ERROR_MESSAGES,
  getValidationErrorMessage,
  getNextTitle,
  processNewDayTransformations,
} from '../../shared/utils/constants';

// Re-export types for backward compatibility
export type { PlayerData } from '../../shared/types';
