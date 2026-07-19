import { getTimestamp } from '../../../shared/utils/timeUtils.js';

export function log(category: string, message: string, ...args: any[]): void {
  console.log(`[${getTimestamp()}] ${category}`, message, ...args);
}

export function logError(category: string, message: string, ...args: any[]): void {
  console.error(`[${getTimestamp()}] ${category}`, message, ...args);
}

/** Get debug level from env (default 20 = all logs off). Used as server-side fallback. */
export function getDebugLevel(): number {
  const raw = process.env.DEBUG_LEVEL;
  if (raw === undefined || raw === '') return 20;
  const val = parseInt(raw, 10);
  return isNaN(val) ? 20 : Math.max(0, Math.min(20, val));
}

/**
 * Check if a log at the given threshold should fire.
 * @param threshold - Lower threshold = more verbose (0=everything, 20=none).
 * @param overrideLevel - Client-provided debug level from x-debug-level header.
 *                        Takes priority over env-based level.
 */
export function shouldLog(threshold: number, overrideLevel?: number): boolean {
  const level = overrideLevel !== undefined ? overrideLevel : getDebugLevel();
  return level <= threshold;
}
