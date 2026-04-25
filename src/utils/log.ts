/**
 * Debug utilities with timestamps
 */

import { getTimestamp } from '../../shared/utils/timeUtils';
export { getTimestamp };

/**
 * Console log with timestamp prefix
 * @param category - Category label (e.g., '[SERVER]', '[CLIENT]', '[RECALC]')
 * @param message - Message to log
 * @param args - Additional arguments to log
 */
export function log(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.log(`[${timestamp}] ${category}`, message, ...args);
}

/**
 * Console error with timestamp prefix
 */
export function logError(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.error(`[${timestamp}] ${category}`, message, ...args);
}

/**
 * Console warn with timestamp prefix
 */
export function logWarn(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.warn(`[${timestamp}] ${category}`, message, ...args);
}
