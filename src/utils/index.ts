/**
 * VB6 Bughouse Ladder - Shared Utils
 */

import { 
  PlayerData, 
  ValidationResult, 
  MatchData, 
  PlayerMatchResult,
  MatchWithResults,
  ProcessResult,
  UpdatePlayerGameDataResult,
  ValidationResultResult
} from "../types";
import { 
  CONSTANTS, 
  RESULT_STRING, 
  GROUP_CODES, 
  SORT_OPTIONS 
} from "../types";
import { shouldLog } from "../../src/utils/debug";
import { getValidationErrorMessage } from "../../src/utils/constants";

// We'll move these to shared/utils next.
// For now, we just keep the exports for compatibility.
